import { detectBrowserEngine, detectWasmCapabilities, detectGpu } from '../workers/worker-device-detect.js';
import { rankAutoPresets, MODEL_PRESETS } from '../workers/worker-presets.js';

let passed = 0;
let failed = 0;

function check(label, condition) {
    if (condition) {
        console.log(`PASS: ${label}`);
        passed++;
    } else {
        console.error(`FAIL: ${label}`);
        failed++;
    }
}

console.log('=== Testing Browser Engine Detection ===');

const originalUA = globalThis.navigator?.userAgent;

function withUA(ua, fn) {
    const origDesc = Object.getOwnPropertyDescriptor(globalThis.navigator, 'userAgent') ||
                     Object.getOwnPropertyDescriptor(Object.getPrototypeOf(globalThis.navigator), 'userAgent');
    Object.defineProperty(globalThis.navigator, 'userAgent', { value: ua, configurable: true, writable: true });
    try {
        return fn();
    } finally {
        if (origDesc) {
            Object.defineProperty(globalThis.navigator, 'userAgent', origDesc);
        }
    }
}

withUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0', () => {
    const info = detectBrowserEngine();
    check('Firefox detection browser', info.browser === 'Firefox');
    check('Firefox detection engine', info.engine === 'Gecko');
    check('Firefox detection version', info.version === '134');
});

withUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.3065.59', () => {
    const info = detectBrowserEngine();
    check('Edge detection browser', info.browser === 'Edge');
    check('Edge detection engine', info.engine === 'Blink');
    check('Edge detection version', info.version === '133');
});

withUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36', () => {
    const info = detectBrowserEngine();
    check('Chrome detection browser', info.browser === 'Chrome');
    check('Chrome detection engine', info.engine === 'Blink');
    check('Chrome detection version', info.version === '133');
});

withUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', () => {
    const info = detectBrowserEngine();
    check('Safari detection browser', info.browser === 'Safari');
    check('Safari detection engine', info.engine === 'WebKit');
    check('Safari detection version', info.version === '18');
});

console.log('\n=== Testing WebAssembly Capabilities Detection ===');

const wasmCaps = await detectWasmCapabilities();
check('returns object with memory64 boolean', typeof wasmCaps.memory64 === 'boolean');
check('returns object with simd boolean', typeof wasmCaps.simd === 'boolean');
check('returns object with threads boolean', typeof wasmCaps.threads === 'boolean');
check('returns object with bulkMemory boolean', typeof wasmCaps.bulkMemory === 'boolean');
check('returns object with multiValue boolean', typeof wasmCaps.multiValue === 'boolean');
check('returns object with exceptions boolean', typeof wasmCaps.exceptions === 'boolean');
check('returns object with gc boolean', typeof wasmCaps.gc === 'boolean');

// In modern Node (V8), these core extensions should be active
check('memory64 probe succeeds in current Node', wasmCaps.memory64 === true);
check('simd probe succeeds in current Node', wasmCaps.simd === true);
check('bulkMemory probe succeeds in current Node', wasmCaps.bulkMemory === true);
check('multiValue probe succeeds in current Node', wasmCaps.multiValue === true);
check('exceptions probe succeeds in current Node', wasmCaps.exceptions === true);
check('gc probe succeeds in current Node', wasmCaps.gc === true);

console.log('\n=== Testing WASM Memory64 Budget Scaling in rankAutoPresets ===');

// On 4GB RAM without GPU:
// Without memory64: budget = 4 * 1024 * 0.40 = 1638.4 MB
// With memory64: budget = 4 * 1024 * 0.60 = 2457.6 MB
const rankedNoMem64 = rankAutoPresets({ hasGpu: false }, 4, false, { memory64: false });
const rankedWithMem64 = rankAutoPresets({ hasGpu: false }, 4, false, { memory64: true });

check('rankAutoPresets returns candidates for CPU', rankedNoMem64.length > 0 && rankedWithMem64.length > 0);
check('memory64 allows equal or more candidates than without', rankedWithMem64.length >= rankedNoNoMem64(rankedNoMem64, rankedWithMem64));

function rankedNoNoMem64(a, b) {
    return a.length;
}

// On 2GB RAM without GPU:
// Without memory64: budget = 2 * 1024 * 0.40 = 819.2 MB
// cpu-qwen25-15b-q4 is 900 MB -> filtered out without memory64
// With memory64: budget = 2 * 1024 * 0.60 = 1228.8 MB -> cpu-qwen25-15b-q4 is included!
const r2gbNo = rankAutoPresets({ hasGpu: false }, 2, false, { memory64: false });
const r2gbYes = rankAutoPresets({ hasGpu: false }, 2, false, { memory64: true });

const has900mNo = r2gbNo.some(p => p.id === 'cpu-qwen25-15b-q4');
const has900mYes = r2gbYes.some(p => p.id === 'cpu-qwen25-15b-q4');

check('2GB RAM without memory64 filters out 900MB model', !has900mNo);
check('2GB RAM with memory64 admits 900MB model', has900mYes);

console.log('\n=== Testing GPU Detection & Cross-Browser Normalization ===');

async function withGpuAdapter(adapterMock, fn) {
    const origGpu = globalThis.navigator?.gpu;
    Object.defineProperty(globalThis.navigator, 'gpu', {
        value: adapterMock ? {
            requestAdapter: async () => adapterMock
        } : undefined,
        configurable: true,
        writable: true
    });
    try {
        return await fn();
    } finally {
        Object.defineProperty(globalThis.navigator, 'gpu', {
            value: origGpu,
            configurable: true,
            writable: true
        });
    }
}

// 1. Edge/Chrome ANGLE wrapper reporting "google" vendor with NVIDIA GeForce
await withGpuAdapter({
    info: { vendor: 'Google Inc.', architecture: '', device: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11)', description: '' },
    isFallbackAdapter: false,
    limits: { maxBufferSize: 2147483648, maxStorageBufferBindingSize: 2147483648 },
    features: new Set(['shader-f16'])
}, async () => {
    const res = await detectGpu();
    check('ANGLE NVIDIA vendor normalized to nvidia', res.vendor === 'nvidia');
    check('ANGLE NVIDIA hasGpu is true', res.hasGpu === true);
    check('ANGLE NVIDIA is not integrated', res.isIntegrated === false);
    check('feature list preserved', res.features.includes('shader-f16'));
});

// 2. Edge/Chrome ANGLE wrapper reporting "google" vendor with Intel UHD
await withGpuAdapter({
    info: { vendor: 'google', architecture: '', device: 'Intel(R) UHD Graphics 630', description: 'ANGLE' },
    isFallbackAdapter: false,
    limits: { maxBufferSize: 268435456, maxStorageBufferBindingSize: 134217728 },
    features: new Set()
}, async () => {
    const res = await detectGpu();
    check('ANGLE Intel UHD normalized to intel', res.vendor === 'intel');
    check('ANGLE Intel UHD detected as integrated', res.isIntegrated === true);
    check('reason mentions integrated', res.reason === 'Integrated GPU detected');
});

// 3. Firefox masked vendor (empty string) with privacy shielding
await withGpuAdapter({
    info: { vendor: '', architecture: '', device: '', description: '' },
    isFallbackAdapter: false,
    limits: { maxBufferSize: 1073741824, maxStorageBufferBindingSize: 536870912 },
    features: new Set()
}, async () => {
    const res = await detectGpu();
    check('Firefox privacy-masked adapter hasGpu is true', res.hasGpu === true);
    check('Firefox maxBufferMB correctly calculated', res.maxBufferMB === 1024);
    check('Firefox maxStorageMB correctly calculated', res.maxStorageMB === 512);
});

// 4. Software fallback adapter
await withGpuAdapter({
    isFallbackAdapter: true,
    limits: { maxBufferSize: 134217728, maxStorageBufferBindingSize: 134217728 }
}, async () => {
    const res = await detectGpu();
    check('Software fallback adapter returns hasGpu: false', res.hasGpu === false);
    check('Software fallback adapter reason', res.reason === 'No GPU or software fallback');
});

console.log(`\n================================================================`);
console.log(`Results: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
    process.exit(1);
} else {
    console.log('ALL HARDWARE & WASM TESTS PASSED');
}
