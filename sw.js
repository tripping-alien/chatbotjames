const CACHE_NAME = 'JAMES-v5.16';

// Only cache truly static assets - NOT app logic files
const STATIC_ASSETS = [
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css'
];

// App files: network-first but cached for offline PWA compliance
const NETWORK_FIRST = [
    '/',
    'config.js',
    'chat-db.js',
    'chat-manager.js',
    'audio-wakelock.js',
    'stream-manager.js',
    'message-renderer.js',
    'model-panel.js',
    'game-logic.js',
    'game-ui.js',
    'game-controller.js',
    'global-state.js',
    'app.js',
    'worker.js',
    'worker-controller.js',
    'worker-device-detect.js',
    'worker-downloader.js',
    'worker-presets.js',
    'worker-system-prompt.js',
    'tools-worker.js',
    'tools-bridge.js',
    'tools-search.js',
    'tool-router.js',
    'python-worker.js',
    'orama.js',
    'smalltalk.js',
    'smalltalk-extra.js',
    'tools-physics.js',
    'tools-art.js',
    'ui-manager.js',
    'input-processor.js',
    'attachment-manager.js',
    'crypto-utils.js',
    'index.html',
    'style.css',
    'manifest.json',
    'favicon.ico',
    'preview.png'
];

// Install: pre-cache static assets and app files for offline compliance
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(c => c.addAll([...STATIC_ASSETS, ...NETWORK_FIRST]))
    );
    self.skipWaiting();
});

// Activate: delete old caches
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME && k !== 'JAMES-model-cache' && k !== 'transformers-cache')
                    .map(k => caches.delete(k))
            )
        )
    );
    self.clients.claim();
});

// Fetch: network-first for app files, cache-first for CDN assets
self.addEventListener('fetch', (event) => {
    // Only cache GET requests
    if (event.request.method !== 'GET') return;

    // Do not cache extension requests
    if (!event.request.url.startsWith('http')) return;

    const url = new URL(event.request.url);
    const filename = url.pathname.split('/').pop();

    // Always bypass SW for model weight files
    if (url.pathname.includes('.onnx') || url.pathname.includes('.bin')) {
        return; 
    }

    // Network-first for app files
    if (url.pathname === '/' || NETWORK_FIRST.some(f => filename === f || url.pathname.endsWith(f))) {
        event.respondWith(
            fetch(event.request)
                .then(res => {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                    return res;
                })
                .catch(async () => {
                    const cached = await caches.match(event.request);
                    if (cached) return cached;
                    return new Response('Network error in app file', { status: 503 });
                })
        );
        return;
    }

    // CDN assets: cache-first
    if (url.hostname.includes('jsdelivr.net') || url.hostname.includes('cdn.')) {
        event.respondWith(
            caches.match(event.request).then(cached =>
                cached ?? fetch(event.request).then(res => {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                    return res;
                }).catch(() => new Response('Network error in CDN fetch', { status: 503 }))
            )
        );
        return;
    }

    // Everything else: network with cache fallback
    event.respondWith(
        fetch(event.request).catch(async () => {
            const cached = await caches.match(event.request);
            if (cached) return cached;
            return new Response('Network error', { status: 503 });
        })
    );
});

