export function isMobileDevice(hints = {}) {
    const ua = navigator.userAgent;
    const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
    const screenWidth = hints.screenWidth ?? (typeof self !== 'undefined' && self.screen ? self.screen.width : undefined);
    const maxTouchPoints = hints.maxTouchPoints ?? navigator.maxTouchPoints;
    const isNarrowScreen = typeof screenWidth === 'number' && screenWidth < 1024;
    const hasTouchPoints = typeof maxTouchPoints === 'number' && maxTouchPoints > 1;
    return isMobileUA || (hasTouchPoints && isNarrowScreen);
}

export function isTVDevice() {
    const ua = navigator.userAgent;
    if (/SmartTV|SMART-TV|Tizen|WebOS|Web0S|HbbTV|BRAVIA|NetCast|Roku|AFT[A-Z]|CrKey|AppleTV|Android TV|googletv/i.test(ua)) {
        return true;
    }
    // Large living-room display heuristic (works in workers that have matchMedia)
    try {
        if (typeof matchMedia === 'function') {
            const large = matchMedia('(min-width: 1920px)').matches;
            const coarse = matchMedia('(pointer: coarse)').matches;
            const noHover = matchMedia('(hover: none)').matches;
            if (large && coarse && noHover) return true;
        }
    } catch (_) {}
    return false;
}

export function detectBrowserEngine() {
    const ua = navigator.userAgent;
    let browser = 'Unknown', engine = 'Unknown', version = '';
    if (ua.includes('Firefox/')) {
        browser = 'Firefox';
        engine = 'Gecko';
        version = ua.match(/Firefox\/(\d+)/)?.[1] || '';
    } else if (ua.includes('Edg/')) {
        browser = 'Edge';
        engine = 'Blink';
        version = ua.match(/Edg\/(\d+)/)?.[1] || '';
    } else if (ua.includes('Chrome/')) {
        browser = 'Chrome';
        engine = 'Blink';
        version = ua.match(/Chrome\/(\d+)/)?.[1] || '';
    } else if (ua.includes('Safari/') && !ua.includes('Chrome/')) {
        browser = 'Safari';
        engine = 'WebKit';
        version = ua.match(/Version\/(\d+)/)?.[1] || '';
    }
    return { browser, engine, version };
}

export async function detectWasmCapabilities() {
    const caps = { memory64: false, simd: false, threads: false, bulkMemory: false, multiValue: false, exceptions: false, gc: false };

    async function probe(bytes) {
        try {
            await WebAssembly.compile(new Uint8Array(bytes));
            return true;
        } catch {
            return false;
        }
    }

    caps.memory64 = await probe([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x05, 0x04, 0x01, 0x04, 0x00, 0x01]);
    caps.simd = await probe([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b, 0x03, 0x02, 0x01, 0x00, 0x0a, 0x16, 0x01, 0x14, 0x00, 0xfd, 0x0c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0b]);
    caps.threads = await probe([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x05, 0x04, 0x01, 0x03, 0x01, 0x01]);
    caps.bulkMemory = await probe([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x04, 0x01, 0x60, 0x00, 0x00, 0x03, 0x02, 0x01, 0x00, 0x05, 0x03, 0x01, 0x00, 0x01, 0x0a, 0x0e, 0x01, 0x0c, 0x00, 0x41, 0x00, 0x41, 0x00, 0x41, 0x00, 0xfc, 0x0b, 0x00, 0x0b]);
    caps.multiValue = await probe([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x06, 0x01, 0x60, 0x00, 0x02, 0x7f, 0x7f, 0x03, 0x02, 0x01, 0x00, 0x0a, 0x08, 0x01, 0x06, 0x00, 0x41, 0x00, 0x41, 0x00, 0x0b]);
    if (typeof WebAssembly.Tag === 'function') caps.exceptions = true;
    try {
        await WebAssembly.compile(new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x04, 0x01, 0x5f, 0x00, 0x00]));
        caps.gc = true;
    } catch { /* ignore */ }

    return caps;
}

export async function detectGpu() {
    let vendor = '';
    let architecture = '';
    let device = '';
    let description = '';
    let adapter = null;
    const browserInfo = detectBrowserEngine();

    try {
        if (!navigator.gpu) throw new Error('WebGPU not supported');
        adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error('No GPU adapter found');

        if (adapter.info) {
            vendor = adapter.info.vendor || '';
            architecture = adapter.info.architecture || '';
            device = adapter.info.device || '';
            description = adapter.info.description || '';
        } else if (typeof adapter.requestAdapterInfo === 'function') {
            const info = await adapter.requestAdapterInfo();
            vendor = info.vendor || '';
            architecture = info.architecture || '';
            device = info.device || '';
            description = info.description || '';
        }
    } catch (e) {
        console.warn('GPU info hidden by browser privacy settings:', e.message);
    }

    let normalizedVendor = vendor;
    const vendorLower = vendor.toLowerCase();
    if (vendorLower === 'google' || vendorLower.includes('angle') || vendorLower === '') {
        const combined = (description + ' ' + device + ' ' + architecture).toLowerCase();
        if (combined.includes('nvidia')) normalizedVendor = 'nvidia';
        else if (combined.includes('amd') || combined.includes('radeon')) normalizedVendor = 'amd';
        else if (combined.includes('intel')) normalizedVendor = 'intel';
        else if (combined.includes('qualcomm') || combined.includes('adreno')) normalizedVendor = 'qualcomm';
        else if (combined.includes('apple')) normalizedVendor = 'apple';
    }

    const isFallback = !!(adapter && adapter.isFallbackAdapter);
    const maxStorageMB = adapter ? (adapter.limits?.maxStorageBufferBindingSize || 0) / (1024 * 1024) : 0;
    const maxBufferMB = adapter ? (adapter.limits?.maxBufferSize || 0) / (1024 * 1024) : 0;
    const featureList = adapter && adapter.features ? [...adapter.features] : [];

    if (isFallback || !adapter) {
        return {
            hasGpu: false, vendor: normalizedVendor, architecture, device, description,
            isFallback, maxStorageMB, maxBufferMB, features: featureList, browserInfo, reason: 'No GPU or software fallback'
        };
    }

    return {
        hasGpu: true, vendor: normalizedVendor, architecture, device, description,
        isFallback, maxStorageMB, maxBufferMB,
        features: featureList, browserInfo, reason: 'GPU detected'
    };
}

export function getDeviceRamGB() {
    return navigator.deviceMemory || 4;
}
