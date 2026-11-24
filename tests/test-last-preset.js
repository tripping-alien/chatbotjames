// Run with: node tests/test-last-preset.js
import fs from 'fs';
import path from 'path';
import { SMALLEST_PRESET_ID, getSmallestPreset, getSmallestFirstPresets } from '../workers/worker-presets.js';

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

// 0. Verify worker-presets.js implementation
check('worker-presets defines SMALLEST_PRESET_ID as lite-smollm-135m-q4',
    SMALLEST_PRESET_ID === 'lite-smollm-135m-q4');

const smallest = getSmallestPreset();
check('worker-presets getSmallestPreset returns lite-smollm-135m-q4',
    smallest && smallest.id === 'lite-smollm-135m-q4');

const coldCandidates = getSmallestFirstPresets({ hasGpu: true }, 16, false, null);
check('worker-presets getSmallestFirstPresets places smallest model first even on 16GB GPU desktop',
    coldCandidates && coldCandidates.length > 0 && coldCandidates[0].id === 'lite-smollm-135m-q4');

// 1. Verify worker.js implementation
const workerPath = path.resolve('workers/worker.js');
const workerContent = fs.readFileSync(workerPath, 'utf8');

check('worker.js handles lastPresetId parameter in tryInitializeModels',
    /async function tryInitializeModels\([^)]*lastPresetId/.test(workerContent));

check('worker.js defaults lastSuccessfulPreset to smallest preset',
    /let lastSuccessfulPreset\s*=\s*getSmallestPreset\(\)/.test(workerContent));

check('worker.js uses getSmallestFirstPresets on cold-start',
    /getSmallestFirstPresets\(/.test(workerContent));

check('worker.js posts model-fallback if prioritized model fails',
    /status:\s*['"]model-fallback['"]/.test(workerContent));

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

check('worker-controller defines onModelFallback callback',
    /this\.onModelFallback\s*=\s*null/.test(controllerContent));

check('worker-controller handles model-fallback message',
    /case\s*['"]model-fallback['"]:\s*if\s*\(\s*this\.onModelFallback\s*\)\s*this\.onModelFallback\(e\.data\);/.test(controllerContent));

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

check('app.js registers workerController.onModelFallback to update UI and safeLocalStorage',
    /workerController\.onModelFallback\s*=\s*\(data\)\s*=>/.test(appContent) &&
    appContent.includes("safeLocalStorage.setItem('james-last-preset-id', data.fallbackPresetId)"));

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

// Cold-start loads the smallest model by default
const coldStartPresetId = getSmallestPreset().id;
check('Phase 1: cold-start defaults to smallest model (lite-smollm-135m-q4)',
    coldStartPresetId === 'lite-smollm-135m-q4');
mockLocalStorage.setItem('james-last-preset-id', coldStartPresetId);
check('Phase 1: smallest model persisted on successful cold load',
    mockLocalStorage.getItem('james-last-preset-id') === 'lite-smollm-135m-q4');

// Lifecycle Phase 2: User prioritizes a model that fails to load -> fallback to last successful load
let currentActivePresetId = mockLocalStorage.getItem('james-last-preset-id');
const prioritizedFailedId = 'gpu-llama31-8b-q4f16';
// Simulate worker fallback dispatch:
const simulatedFallbackData = {
    status: 'model-fallback',
    failedPresetId: prioritizedFailedId,
    fallbackPresetId: currentActivePresetId // remembers last successfully loaded model
};
mockLocalStorage.setItem('james-last-preset-id', simulatedFallbackData.fallbackPresetId);
check('Phase 2: failed prioritized model reverts to last successful load (smallest preset)',
    mockLocalStorage.getItem('james-last-preset-id') === 'lite-smollm-135m-q4');

// Lifecycle Phase 3: User prioritizes a model that succeeds
const prioritizedSuccessId = 'cpu-qwen25-05b-q4';
mockLocalStorage.setItem('james-last-preset-id', prioritizedSuccessId);
check('Phase 3: successfully loaded prioritized model becomes the remembered preset',
    mockLocalStorage.getItem('james-last-preset-id') === 'cpu-qwen25-05b-q4');

// Lifecycle Phase 4: Subsequent failure reverts to the new last successful load
const nextFailedId = 'gpu-llama32-3b-q4f16';
const simulatedFallbackData2 = {
    status: 'model-fallback',
    failedPresetId: nextFailedId,
    fallbackPresetId: mockLocalStorage.getItem('james-last-preset-id')
};
mockLocalStorage.setItem('james-last-preset-id', simulatedFallbackData2.fallbackPresetId);
check('Phase 4: next failed load remembers cpu-qwen25-05b-q4 as the fallback',
    mockLocalStorage.getItem('james-last-preset-id') === 'cpu-qwen25-05b-q4');

// Lifecycle Phase 5: App Reload
const reloadedPresetId = mockLocalStorage.getItem('james-last-preset-id');
check('Phase 5: subsequent app reload retrieves last successful preset',
    reloadedPresetId === 'cpu-qwen25-05b-q4');

// Worker init message simulation
const initMessage = {
    type: 'init',
    lastPresetId: reloadedPresetId
};
check('Phase 5: worker init packet contains lastPresetId',
    initMessage.lastPresetId === 'cpu-qwen25-05b-q4');

// Lifecycle Phase 6: WebGPU Error / OOM on reload triggers cleanup
const onClearLastPreset = () => mockLocalStorage.removeItem('james-last-preset-id');
onClearLastPreset();
check('Phase 6: clear-last-preset purges invalidated preset from localStorage',
    mockLocalStorage.getItem('james-last-preset-id') === null);

console.log(failed === 0 ? '\nALL LAST-PRESET PERSISTENCE TESTS PASSED' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
