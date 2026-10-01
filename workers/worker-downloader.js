import { CONFIG } from '../core/config.js';

export function setupDownloadManager(env, selfRef) {
    const DOWNLOAD_CACHE = 'JAMES-model-cache-v3';
    const CHUNK_SIZE = CONFIG.worker.chunkSizeMb * 1024 * 1024;
    const MAX_DOWNLOAD_CONCURRENCY = CONFIG.worker.maxDownloadConcurrency;

    const nativeFetch = selfRef.fetch.bind(selfRef);
    selfRef.fetch = customFetch;
    env.fetch = customFetch;

    // Active AbortController for the current download session.
    // Replaced every time a new model init starts.
    let _downloadAbortController = new AbortController();

    /** Cancel any in-flight downloads and return a fresh signal for the next batch. */
    selfRef.abortDownloads = function () {
        _downloadAbortController.abort();
        _downloadAbortController = new AbortController();
        return _downloadAbortController.signal;
    };

    /** Return the signal for the current download session. */
    selfRef.getDownloadSignal = function () {
        return _downloadAbortController.signal;
    };

    function shouldUseDownloadCache(url) {
        if (url.endsWith('.wasm')) return false;
        return (
            url.includes('huggingface.co') ||
            url.includes('hf.co') ||
            url.includes('cdn.jsdelivr.net') ||
            url.endsWith('.bin') ||
            url.endsWith('.onnx') ||
            url.endsWith('.onnx_data') ||
            url.endsWith('.safetensors') ||
            url.endsWith('.json')
        );
    }

    function getCacheRequest(url) {
        return new Request(url, { method: 'GET', mode: 'cors', credentials: 'omit' });
    }

    async function cacheMatch(url) {
        const cache = await caches.open(DOWNLOAD_CACHE);
        return cache.match(getCacheRequest(url), { ignoreSearch: true, ignoreVary: true, ignoreMethod: true });
    }

    async function cachePut(url, response) {
        try {
            const cache = await caches.open(DOWNLOAD_CACHE);
            await cache.put(getCacheRequest(url), response.clone());
        } catch (e) {
            console.warn(`Cache put failed for ${url}:`, e);
        }
        return response;
    }

    function reportProgress(loaded, total, url) {
        selfRef.postMessage({ status: 'downloading', loaded, total, file: url });
    }

    async function fetchHead(url, signal) {
        const response = await nativeFetch(
            new Request(url, { method: 'HEAD', mode: 'cors', credentials: 'omit' }),
            { signal }
        );
        if (!response.ok) throw new Error(`HEAD failed for ${url}: ${response.status}`);
        return response;
    }

    async function downloadChunk(url, range, signal) {
        const response = await nativeFetch(
            new Request(url, {
                method: 'GET',
                mode: 'cors',
                credentials: 'omit',
                headers: { Range: `bytes=${range.start}-${range.end}` },
                cache: 'no-store',
            }),
            { signal }
        );
        if (!(response.ok || response.status === 206)) {
            throw new Error(`Chunk download failed: ${response.status} ${response.statusText}`);
        }
        return response.arrayBuffer();
    }

    async function fetchWithProgress(url, total = 0, signal) {
        const response = await nativeFetch(
            new Request(url, { method: 'GET', mode: 'cors', credentials: 'omit' }),
            { signal }
        );
        if (!response.ok) throw new Error(`Download failed: ${response.status}`);
        
        total = total || Number(response.headers.get('content-length')) || 0;
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        
        if (!response.body) {
            const buf = await response.arrayBuffer();
            reportProgress(buf.byteLength, total || buf.byteLength, url);
            return cachePut(url, new Response(buf, { headers: { 'Content-Type': contentType, 'Content-Length': String(buf.byteLength) } }));
        }

        const reader = response.body.getReader();
        let loaded = 0;
        const chunks = [];
        
        while (true) {
            if (signal?.aborted) throw new DOMException('Download aborted', 'AbortError');
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            loaded += value.byteLength;
            reportProgress(loaded, total || loaded, url); // Ensure it reports *something*
        }
        
        const blob = new Blob(chunks, { type: contentType });
        return cachePut(url, new Response(blob, {
            headers: { 'Content-Type': contentType, 'Content-Length': String(blob.size) },
        }));
    }

    async function downloadAndCache(url, signal) {
        const cached = await cacheMatch(url);
        if (cached) return cached;

        let head;
        try {
            head = await fetchHead(url, signal);
        } catch (headErr) {
            if (headErr?.name === 'AbortError') throw headErr; // propagate abort, don't fall back
            return fetchWithProgress(url, 0, signal);
        }

        const total = Number(head.headers.get('content-length')) || 0;
        const contentType = head.headers.get('content-type') || 'application/octet-stream';
        const acceptRanges = (head.headers.get('accept-ranges') || '').toLowerCase();

        if (!total || !acceptRanges.includes('bytes')) {
            return fetchWithProgress(url, total, signal);
        }

        const ranges = [];
        for (let start = 0; start < total; start += CHUNK_SIZE) {
            ranges.push({ start, end: Math.min(start + CHUNK_SIZE - 1, total - 1) });
        }

        const results = new Array(ranges.length);
        let loaded = 0;
        let nextIndex = 0;
        let active = 0;
        let failed = false;
        let settled = false;

        return new Promise((resolve, reject) => {
            function finish(err) {
                if (settled) return;
                settled = true;
                if (err) reject(err);
                else {
                    const blob = new Blob(results, { type: contentType });
                    const finalResponse = new Response(blob, {
                        headers: { 'Content-Type': contentType, 'Content-Length': String(blob.size) },
                    });
                    resolve(cachePut(url, finalResponse));
                }
            }

            function spawnNext() {
                if (failed || settled) return;
                if (nextIndex >= ranges.length) {
                    if (active === 0) finish(null);
                    return;
                }

                const index = nextIndex++;
                active++;

                downloadChunk(url, ranges[index], signal)
                    .then(chunk => {
                        if (failed || settled) return;
                        results[index] = chunk;
                        loaded += chunk.byteLength;
                        reportProgress(loaded, total, url);
                        active--;
                        spawnNext();
                        if (nextIndex >= ranges.length && active === 0) finish(null);
                    })
                    .catch(err => {
                        if (!failed) {
                            failed = true;
                            finish(err);
                        }
                    });
            }

            for (let i = 0; i < MAX_DOWNLOAD_CONCURRENCY; i++) spawnNext();
        });
    }

    async function customFetch(resource, init = {}) {
        let request;
        if (resource instanceof Request) {
            request = resource.clone();
        } else {
            request = new Request(resource, init);
        }
        if (request.method !== 'GET' || request.headers.has('Range')) {
            return nativeFetch(request);
        }
        if (!shouldUseDownloadCache(request.url)) {
            return nativeFetch(request);
        }

        const cached = await cacheMatch(request.url);
        if (cached) {
            console.log(`[Cache Hit] ${request.url}`);
            const size = Number(cached.headers.get('content-length')) || 0;
            if (size > 1024 * 1024) {
                reportProgress(size, size, request.url);
            }
            return cached;
        }

        const signal = selfRef.getDownloadSignal ? selfRef.getDownloadSignal() : undefined;
        try {
            return await downloadAndCache(request.url, signal);
        } catch (err) {
            if (err?.name === 'AbortError') throw err; // propagate abort, don't fall back
            console.warn('Custom fetch failed, falling back to native fetch:', err);
            return nativeFetch(resource instanceof Request ? resource.clone() : new Request(resource, init));
        }
    }
}
