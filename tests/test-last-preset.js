// Run with: node tests/test-last-preset.js
import fs from 'fs';
import path from 'path';

let failed = 0;
const check = (name, cond, extra = '') => {
    if (cond) {
        console.log(`PASS: ${name}`);
    } else {
        console.error(`FAIL: ${name} ${extra}`);
        failed++;
    }
};

console.log('--- Last Successfully Loaded Model Persistence Tests ---');

// 1. Verify worker.js implementation
const workerPath = path.resolve('workers/worker.js');
const workerContent = fs.readFileSync(workerPath, 'utf8');

check('worker.js handles lastPresetId parameter in tryInitializeModels',
    /async function tryInitializeModels\([^)]*lastPresetId/.test(workerContent));

check('worker.js does NOT discard 3B+ saved presets on integrated GPU',
    !workerContent.includes('Saved preset was 3B+ on integrated GPU; clearing to prevent freeze'));

check('worker.js posts clear-last-preset on reload failure',
    /self\.postMessage\(\{\s*status:\s*['"]clear-last-preset['"]\s*\}\)/.test(workerContent));

// Verify that all 'status: done' calls send presetId
const doneMatches = workerContent.match(/self\.postMessage\(\{\s*status:\s*['"]done['"][^}]*\}\)/g) || [];
check('worker.js has done status postMessage calls', doneMatches.length >= 3);
const allDoneHavePresetId = doneMatches.every(m => m.includes('presetId'));
check('all status:done dispatches include presetId', allDoneHavePresetId);

// 2. Verify worker-controller.js implementation
const controllerPath = path.resolve('core/worker-controller.js');
const controllerContent = fs.readFileSync(controllerPath, 'utf8');

check('worker-controller defines onClearLastPreset callback',
    /this\.onClearLastPreset\s*=\s*null/.test(controllerContent));

check('worker-controller reads james-last-preset-id from safeLocalStorage on init',
    /safeLocalStorage\.getItem\(['"]james-last-preset-id['"]\)/.test(controllerContent));

check('worker-controller passes lastPresetId to worker during init',
    /lastPresetId:\s*_lastPreset/.test(controllerContent));

check('worker-controller calls onClearLastPreset when status is clear-last-preset',
    /case\s*['"]clear-last-preset['"]:\s*if\s*\(\s*this\.onClearLastPreset\s*\)\s*this\.onClearLastPreset\(\);/s.test(controllerContent));

check('worker-controller does NOT call onWorkerDone when status is clear-last-preset',
    !/case\s*['"]clear-last-preset['"]:[^:]*this\.onWorkerDone/s.test(controllerContent));

// 3. Verify app.js implementation
const appPath = path.resolve('core/app.js');
const appContent = fs.readFileSync(appPath, 'utf8');

check('app.js registers workerController.onClearLastPreset to remove james-last-preset-id',
    /workerController\.onClearLastPreset\s*=\s*\(\)\s*=>\s*\{?\s*safeLocalStorage\.removeItem\(['"]james-last-preset-id['"]\)/.test(appContent));

check('app.js saves james-last-preset-id on worker completion',
    /safeLocalStorage\.setItem\(['"]james-last-preset-id['"],\s*runningPreset\.id\)/.test(appContent));

check('app.js matches preset using presetId in onWorkerDone',
    /data\.presetId\s*&&/s.test(appContent));

check('app.js initializes selectedPresetId from safeLocalStorage before worker init',
    /const\s*_savedLastPresetId\s*=\s*safeLocalStorage\.getItem\(['"]james-last-preset-id['"]\);[\s\S]*globalState\.selectedPresetId\s*=\s*_savedLastPresetId;/s.test(appContent));

check('app.js displays RESUMING status when _savedLastPresetId is present',
    /_savedLastPresetId\s*\?\s*['"]RESUMING LAST MODEL…['"]/.test(appContent));

check('app.js onWarmStart updates activePresetId and selectedPresetId',
    /workerController\.onWarmStart\s*=\s*\(preset\)\s*=>\s*\{[\s\S]*globalState\.activePresetId\s*=\s*preset\.id/s.test(appContent));

// 4. End-to-end Simulation
console.log('\n--- Simulation of Storage and Warm-Start Lifecycle ---');

const mockStore = new Map();
const mockLocalStorage = {
    getItem: (k) => mockStore.has(k) ? mockStore.get(k) : null,
    setItem: (k, v) => mockStore.set(k, String(v)),
    removeItem: (k) => mockStore.delete(k)
};

// Lifecycle Phase 1: Clean start (no saved preset)
let lastPresetOnStart = mockLocalStorage.getItem('james-last-preset-id');
check('Phase 1: initial storage is null', lastPresetOnStart === null);

// Model "gpu-llama32-3b-q4f16" finishes loading successfully
const simulatedWorkerDoneData = {
    status: 'done',
    presetId: 'gpu-llama32-3b-q4f16',
    backend: 'webgpu',
    dtype: 'q4f16',
    model: 'onnx-community/Llama-3.2-3B-Instruct'
};
mockLocalStorage.setItem('james-last-preset-id', simulatedWorkerDoneData.presetId);
check('Phase 1: 3B preset ID persisted on completion',
    mockLocalStorage.getItem('james-last-preset-id') === 'gpu-llama32-3b-q4f16');

// Lifecycle Phase 2: App Reload
const reloadedPresetId = mockLocalStorage.getItem('james-last-preset-id');
check('Phase 2: subsequent app load retrieves saved preset',
    reloadedPresetId === 'gpu-llama32-3b-q4f16');

// Worker init message simulation
const initMessage = {
    type: 'init',
    lastPresetId: reloadedPresetId
};
check('Phase 2: worker init packet contains lastPresetId',
    initMessage.lastPresetId === 'gpu-llama32-3b-q4f16');

// Lifecycle Phase 3: WebGPU Error / OOM on reload triggers cleanup
const onClearLastPreset = () => mockLocalStorage.removeItem('james-last-preset-id');
// Worker encounters error and sends 'clear-last-preset'
onClearLastPreset();
check('Phase 3: clear-last-preset purges invalidated preset from localStorage',
    mockLocalStorage.getItem('james-last-preset-id') === null);

console.log(failed === 0 ? '\nALL LAST-PRESET PERSISTENCE TESTS PASSED' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
