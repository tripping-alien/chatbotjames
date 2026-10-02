const CACHE_NAME = 'JAMES-v5.16';

// Only cache truly static assets - NOT app logic files
const STATIC_ASSETS = [
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css'
];

// App files: network-first but cached for offline PWA compliance
const NETWORK_FIRST = [
    '/',
    '/core/config.js',
    '/core/chat-db.js',
    '/core/chat-manager.js',
    '/core/audio-wakelock.js',
    '/core/stream-manager.js',
    '/core/message-renderer.js',
    '/core/model-panel.js',
    '/games/game-logic.js',
    '/games/game-ui.js',
    '/games/game-controller.js',
    '/core/global-state.js',
    '/core/app.js',
    '/core/diagnostics.js',
    '/core/error-boundary.js',
    '/core/profiler.js',
    '/workers/worker.js',
    '/core/worker-controller.js',
    '/workers/worker-device-detect.js',
    '/workers/worker-downloader.js',
    '/workers/worker-presets.js',
    '/workers/worker-system-prompt.js',
    '/workers/tools-worker.js',
    '/tools/tools-bridge.js',
    '/tools/tools-search.js',
    '/tools/tool-router.js',
    '/workers/python-worker.js',
    '/core/orama.js',
    '/nlp/smalltalk.js',
    '/nlp/smalltalk-extra.js',
    '/tools/tools-physics.js',
    '/tools/tools-art.js',
    '/core/ui-manager.js',
    '/core/input-processor.js',
    '/core/attachment-manager.js',
    '/core/crypto-utils.js',
    '/tools/router.js',
    '/tools/rules.js',
    '/tools/rules-part1.js',
    '/tools/rules-part2.js',
    '/tools/maps.js',
    '/tools/utils.js',
    '/core/webgl-bg.js',
    'index.html',
    'style.css',
    'manifest.json',
    '/assets/favicon.ico',
    '/assets/preview.png'
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
                keys.filter(k => k !== CACHE_NAME && !k.startsWith('JAMES-model-cache') && k !== 'transformers-cache')
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
                    const cached = await caches.match(event.request, { ignoreSearch: true });
                    if (cached) return cached;
                    return new Response('Network error in app file', { status: 503 });
                })
        );
        return;
    }

    // CDN assets: cache-first
    if (url.hostname.includes('jsdelivr.net') || url.hostname.includes('cdn.') || url.hostname.includes('esm.sh')) {
        event.respondWith(
            caches.match(event.request, { ignoreSearch: true }).then(cached =>
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
        fetch(event.request)
            .then(res => {
                if (event.request.mode === 'navigate') {
                    // Update cache with the latest navigation response
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                }
                return res;
            })
            .catch(async () => {
                const cached = await caches.match(event.request, { ignoreSearch: true });
                if (cached) return cached;
                
                // If this is a navigation request and we have no cache, return the offline fallback
                if (event.request.mode === 'navigate') {
                    return new Response(
                        `<!DOCTYPE html>
                        <html lang="en">
                        <head>
                            <meta charset="UTF-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <title>JAMES - Offline</title>
                            <style>
                                body { font-family: monospace; background: #000; color: #0f0; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
                                h1 { font-size: 2rem; margin-bottom: 10px; }
                                p { font-size: 1rem; color: #a0a0a0; max-width: 600px; line-height: 1.5; }
                                button { margin-top: 20px; padding: 10px 20px; background: transparent; color: #0f0; border: 1px solid #0f0; cursor: pointer; font-family: monospace; font-size: 1rem; transition: background 0.2s; }
                                button:hover { background: #0f0; color: #000; }
                            </style>
                        </head>
                        <body>
                            <h1>CONNECTION LOST</h1>
                            <p>You are currently completely offline, and this page hasn't been cached yet.<br><br>The JAMES terminal is still fully functional offline if you navigate back to the main app interface.</p>
                            <button onclick="window.location.href='/'">RETURN TO TERMINAL</button>
                        </body>
                        </html>`,
                        {
                            headers: { 'Content-Type': 'text/html' }
                        }
                    );
                }
                
                return new Response('Network error and no cache available', { status: 503 });
            })
    );
});

// Implement Background Sync for delayed analytics or diagnostic reports
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-diagnostics') {
        event.waitUntil(
            new Promise((resolve) => {
                console.log('[SW] Background sync: Sending diagnostic telemetry...');
                setTimeout(resolve, 2000);
            })
        );
    }
});

