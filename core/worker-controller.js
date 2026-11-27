// Single source of truth for "does this message carry tool calls?".
// Covers multiple formats the model may produce:
//  1. ```tool:run  (standard fenced block, with or without leading backticks)
//  2. ^\s*tool:run (bare, no backticks, at start of line)
//  3. {"tool":     (bare or embedded JSON object with a "tool" key, double/single quotes or unquoted)
//  4. <tool>       (XML format supported by app.js)
export const TOOL_CALL_PATTERN = /(?:```\s*tool:run\b)|(?:^\s*tool:run\b)|(?:\{\s*["']?tool(?:_name)?["']?\s*:)|(?:<tool\b)/m;
export const hasToolCalls = (msg) => typeof msg === 'string' && TOOL_CALL_PATTERN.test(msg);

class WorkerController {
    constructor() {
        this.worker = null;
        this.toolsWorker = null;
        this.pythonWorker = null;
        this.activeGenerations = new Map(); // chatId -> targetId
        this.abortedTargets = new Set(); // targetIds stopped/aborted by user
        this.abortControllers = new Map(); // targetId -> AbortController for async tool cancellation
        this._workerBusyTargetId = null; // targetId currently executing in worker.js
        this._queuedQuery = null; // queued query if user sends immediately after stopping during unwind
        this._pyodideState = 'idle'; // 'idle' | 'loading' | 'ready' | 'error'

        // Callbacks
        this.onWorkerStatus = null; // (status, statusText, e)
        this.onModelInfo = null;
        this.onWarmStart = null;
        this.onModelFallback = null;
        this.onDownloadProgress = null;
        this.onWorkerDone = null; // (e.data.backend)
        this.onClearLastPreset = null;
        this.onStreaming = null; // (chatId, targetId, message)
        this.onThinking = null; // (chatId, targetId)
        this.onComplete = null; // (chatId, targetId, message)
        this.onAborted = null; // (chatId, targetId, message)
        this.onToolCalls = null; // (message, targetId, chatId)
    }

    initWorkers(safeLocalStorage) {
        this.worker = new Worker('workers/worker.js?v=7', { type: 'module' });
        this.toolsWorker = new Worker('workers/tools-worker.js?v=6', { type: 'module' });
        this.pythonWorker = new Worker('workers/python-worker.js?v=6');

        this.worker.onmessage = this.workerMessageHandler.bind(this);
        this.worker.onerror = (e) => {
            console.error('WORKER ERROR:', e);
            if (this.onWorkerStatus) this.onWorkerStatus('error', 'Worker failed to load: ' + e.message, e);
        };
        this.toolsWorker.onerror = (e) => {
            console.error('TOOLS-WORKER ERROR (this will cause all tool RPCs to time out):', e);
        };
        // Track Pyodide readiness so the main thread can guard pip_install / python_reset
        this.pythonWorker.addEventListener('message', (e) => {
            if (e.data?.status === 'loading') this._pyodideState = 'loading';
            else if (e.data?.status === 'ready') this._pyodideState = 'ready';
            else if (e.data?.status === 'error' && !e.data?.execId) this._pyodideState = 'error';
        });

        const _lastPreset = safeLocalStorage ? safeLocalStorage.getItem('james-last-preset-id') : null;
        this.worker.postMessage({ type: 'init', lastPresetId: _lastPreset || null, screenWidth: window.screen?.width, maxTouchPoints: navigator.maxTouchPoints });
        this.toolsWorker.postMessage({ type: 'init', lastPresetId: _lastPreset || null });
        this.pythonWorker.postMessage({ type: 'init' });
    }

    markAborted(targetId, chatId = null) {
        if (targetId != null) {
            this.abortedTargets.add(targetId);
            if (this.abortedTargets.size > 256) {
                this.abortedTargets.delete(this.abortedTargets.values().next().value);
            }
            const ctrl = this.abortControllers.get(targetId);
            if (ctrl) {
                ctrl.abort();
                this.abortControllers.delete(targetId);
            }
        }
        if (chatId != null) {
            if (targetId == null || this.activeGenerations.get(chatId) === targetId) {
                this.activeGenerations.delete(chatId);
            }
            if (this._queuedQuery && this._queuedQuery.chatId === chatId) {
                this._queuedQuery = null;
            }
        } else if (targetId == null) {
            this.activeGenerations.clear();
            this._queuedQuery = null;
        }
    }

    isTargetAborted(targetId) {
        return targetId != null && this.abortedTargets.has(targetId);
    }

    getAbortSignal(targetId) {
        if (targetId == null) return null;
        let ctrl = this.abortControllers.get(targetId);
        if (!ctrl) {
            ctrl = new AbortController();
            if (this.abortedTargets.has(targetId)) ctrl.abort();
            this.abortControllers.set(targetId, ctrl);
        }
        return ctrl.signal;
    }

    postQuery(messages, targetId, chatId) {
        if (this.isTargetAborted(targetId)) return;
        this.activeGenerations.set(chatId, targetId);
        // If worker inference from an aborted previous turn is still unwinding,
        // queue the latest prompt instead of failing with "busy".
        if (this._workerBusyTargetId != null && this._workerBusyTargetId !== targetId) {
            this._queuedQuery = { messages, targetId, chatId };
            return;
        }
        this._queuedQuery = null;
        this._workerBusyTargetId = targetId;
        this.worker.postMessage({
            type: 'query',
            messages: messages,
            targetId: targetId,
            chatId: chatId
        });
    }

    abortGeneration(targetId = null, chatId = null) {
        this.markAborted(targetId, chatId);
        if (this.worker && (targetId == null || this._workerBusyTargetId === targetId)) {
            this.worker.postMessage({ type: 'abort', targetId });
        }
    }

    _flushQueuedQuery() {
        if (this._workerBusyTargetId != null || !this._queuedQuery) return;
        const next = this._queuedQuery;
        this._queuedQuery = null;
        if (this.isTargetAborted(next.targetId)) return;
        this._workerBusyTargetId = next.targetId;
        this.worker.postMessage({
            type: 'query',
            messages: next.messages,
            targetId: next.targetId,
            chatId: next.chatId
        });
    }

    workerMessageHandler(e) {
        const { status, message, loaded, total, file, targetId, chatId } = e.data;

        if (status === 'complete' || status === 'aborted' || status === 'error') {
            if (targetId == null || this._workerBusyTargetId === targetId) {
                this._workerBusyTargetId = null;
            }
            if (targetId != null) {
                this.abortControllers.delete(targetId);
            }
        }

        // Ignore stale progress events from an already-aborted targetId
        if ((status === 'streaming' || status === 'thinking') && this.isTargetAborted(targetId)) {
            return;
        }

        if (this.onWorkerStatus) {
            this.onWorkerStatus(status, message, e);
        }

        switch (status) {
            case 'clear-last-preset':
                if (this.onClearLastPreset) this.onClearLastPreset();
                break;
            case 'model-fallback':
                if (this.onModelFallback) this.onModelFallback(e.data);
                break;
            case 'model-info':
                if (this.onModelInfo) this.onModelInfo(e.data);
                break;
            case 'warm-start':
                if (this.onWarmStart) this.onWarmStart(e.data.preset);
                break;
            case 'downloading':
                if (this.onDownloadProgress) this.onDownloadProgress(loaded, total, file);
                break;
            case 'done':
                this._recoveryInitDone = true; // flag used for UI recovery check
                if (this.onWorkerDone) this.onWorkerDone(e.data);
                this._flushQueuedQuery();
                break;
            case 'streaming':
                if (this.onStreaming) this.onStreaming(chatId, targetId, message);
                break;
            case 'thinking':
                if (this.onThinking) this.onThinking(chatId, targetId);
                break;
            case 'complete':
                if (this.isTargetAborted(targetId)) {
                    if (this.onAborted) this.onAborted(chatId, targetId, message);
                } else if (hasToolCalls(message)) {
                    // Message contains tool calls — route exclusively to tool handler.
                    // handleToolCalls will push the assistant message to history itself,
                    // so we must NOT call onComplete here to avoid a duplicate entry.
                    if (this.onToolCalls) this.onToolCalls(message, targetId, chatId);
                } else {
                    if (this.onComplete) this.onComplete(chatId, targetId, message);
                }
                this._flushQueuedQuery();
                break;
            case 'aborted':
                // Never execute tool calls from an aborted generation.
                if (this.onAborted) this.onAborted(chatId, targetId, message);
                this._flushQueuedQuery();
                break;
            case 'error':
                this._flushQueuedQuery();
                break;
        }
    }

    callWorkerRPC(targetWorker, messageData, timeoutMs = 30000, signal = null) {
        return new Promise((resolve, reject) => {
            if (signal?.aborted) {
                reject(new DOMException('Operation aborted', 'AbortError'));
                return;
            }
            const reqId = Date.now() + Math.random().toString(36).substring(2);
            const msg = { ...messageData, execId: reqId };
            let cleanup;

            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error('Worker RPC Timeout'));
            }, timeoutMs);

            const onAbort = () => {
                cleanup();
                reject(new DOMException('Operation aborted', 'AbortError'));
            };

            const errListener = (e) => {
                cleanup();
                reject(new Error(e.message || 'Worker runtime error'));
            };

            const listener = (e) => {
                if (e.data && e.data.execId === reqId) {
                    // Accept both response shapes:
                    //  - tools-worker: { status:'done'|'error', execId, result? }
                    //  - python-worker: { status:'done'|'error', execId, stdout?, result?, figures?, error? }
                    // Skip intermediate messages (e.g. status:'loading', 'stdout', 'ready')
                    if (e.data.status !== 'done' && e.data.status !== 'error') return;

                    cleanup();

                    if (e.data.status === 'error') {
                        reject(new Error(e.data.error || 'Worker error'));
                    } else {
                        // Resolve with the full response so callers can access stdout/figures/result
                        resolve(e.data);
                    }
                }
            };

            cleanup = () => {
                clearTimeout(timeout);
                signal?.removeEventListener('abort', onAbort);
                targetWorker.removeEventListener('message', listener);
                targetWorker.removeEventListener('error', errListener);
            };

            signal?.addEventListener('abort', onAbort, { once: true });
            targetWorker.addEventListener('message', listener);
            targetWorker.addEventListener('error', errListener);
            targetWorker.postMessage(msg);
        });
    }
}

export const workerController = new WorkerController();
