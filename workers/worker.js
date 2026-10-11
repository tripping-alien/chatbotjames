import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';
import { CONFIG } from '../core/config.js';
import { setupDownloadManager } from './worker-downloader.js';
import { getPromptTier, buildSystemPrompt } from './worker-prompt-tiers.js';
import { isMobileDevice, isTVDevice, detectWasmCapabilities, detectGpu, getDeviceRamGB } from './worker-device-detect.js';
import { MODEL_PRESETS, rankAutoPresets } from './worker-presets.js';

// --- CONFIGURATION ---
env.allowLocalModels = false;
env.useBrowserCache = true;
setupDownloadManager(env, self);

let chatbot = null;
let activePreset = null;
let deviceFlags = { isMobile: false, isTV: false }; // set on init, used to pick the prompt tier
let isGenerating = false;
let isAborted = false;
let _initLock = false;        // prevents concurrent init messages from racing
let _pendingInitPreset = null; // stores the latest switch request while one is in-flight

// ─── Freeze-protection constants ────────────────────────────────────────────
// Timeout (ms) before auto-aborting a stuck generation.
// Large models (≥3B) get a longer budget since they generate more slowly.
const GEN_TIMEOUT_LARGE_MS = 120_000; // 2 min  for 3B+
const GEN_TIMEOUT_DEFAULT_MS = 75_000;  // 75 s   for everything else
// If no new tokens arrive within this window we assume the GPU has stalled.
const STALL_WATCHDOG_MS = 20_000;
// Pause the GPU every N callback ticks to give the browser a breath.
const YIELD_EVERY_N_TOKENS = 8;

function normalizeError(err) {
    let msg = err?.message || String(err);
    msg = msg.replace(/https?:\/\/[^\s]+/g, '(url)');
    return msg;
}

function reportWorkerError(err, targetId, chatId) {
    const safeMsg = normalizeError(err);
    if (safeMsg !== 'AbortGeneration') {
        console.error('?', err);
        self.postMessage({ status: 'error', message: safeMsg, targetId, chatId });
    }
}

async function initializeModel(provider, dtype, model) {
    const isWasm = provider === 'wasm';
    const initProgressCallback = (x) => {
        if (x.status === 'downloading') {
            const loaded = x.loaded || 0;
            const total = x.total || 0;
            self.postMessage({ status: 'downloading', loaded, total, file: x.file });
        }
    };
    return await pipeline('text-generation', model, {
        device: isWasm ? 'wasm' : 'webgpu',
        dtype: dtype,
        progress_callback: initProgressCallback
    });
}

async function tryInitializeModels(gpuInfo, isMobile, isTV, forcePresetId = null, lastPresetId = null, wasmCaps = null) {
    const { hasGpu } = gpuInfo;
    const isConstrained = isMobile || isTV;
    const ramGB = getDeviceRamGB();
    const deviceLabel = isTV ? '?" TV' : isMobile ? '?" Mobile' : '?-,? Desktop';
    console.log(`?>,? Model init ?" GPU: ${hasGpu} | RAM: ${ramGB} GB | Device: ${deviceLabel} | Force: ${forcePresetId || lastPresetId || 'auto'}`);

    self.postMessage({ status: 'model-info', presets: MODEL_PRESETS, gpuInfo, ramGB, isMobile, isTV, wasmCaps });

    let lastError = null;

    if (forcePresetId) {
        const preset = MODEL_PRESETS.find(p => p.id === forcePresetId);
        if (!preset) throw new Error(`Unknown preset id: ${forcePresetId}`);
        self.postMessage({ status: 'warm-start', preset: preset });
        // Dispose the old pipeline before loading a new one to free GPU/WASM memory.
        if (chatbot) {
            try { chatbot.dispose(); } catch (_) {}
            chatbot = null;
        }
        chatbot = await initializeModel(preset.backend, preset.dtype, preset.model);
        activePreset = preset;
        self.postMessage({ status: 'done', backend: preset.backend, dtype: preset.dtype, model: preset.model, isMobile, isTV });
        return;
    }

    if (lastPresetId) {
        const last = MODEL_PRESETS.find(p => p.id === lastPresetId);
        // If the user previously had a 3B+ model saved on an integrated GPU, clear it to prevent freezing
        if (last && (gpuInfo?.isIntegrated && (last.params || 0) >= 3.0)) {
            console.warn('[worker] Saved preset was 3B+ on integrated GPU; clearing to prevent freeze');
            self.postMessage({ status: 'clear-last-preset' });
        } else if (last) {
            self.postMessage({ status: 'warm-start', preset: last });
            if (chatbot) {
                try { chatbot.dispose(); } catch (_) {}
                chatbot = null;
            }
            try {
                chatbot = await initializeModel(last.backend, last.dtype, last.model);
                activePreset = last;
                self.postMessage({ status: 'done', backend: last.backend, dtype: last.dtype, model: last.model, isMobile, isTV });
                return;
            } catch (err) {
                self.postMessage({ status: 'clear-last-preset' });
                lastError = err;
            }
        }
    }

    const ranked = rankAutoPresets(gpuInfo, ramGB, isConstrained, wasmCaps);
    for (const preset of ranked) {
        try {
            self.postMessage({ status: 'warm-start', preset: preset });
            if (chatbot) {
                try { chatbot.dispose(); } catch (_) {}
                chatbot = null;
            }
            chatbot = await initializeModel(preset.backend, preset.dtype, preset.model);
            activePreset = preset;
            self.postMessage({ status: 'done', backend: preset.backend, dtype: preset.dtype, model: preset.model, isMobile, isTV });
            return;
        } catch (err) {
            lastError = err;
        }
    }

    const litePresets = MODEL_PRESETS
        .filter(p => p.id.startsWith('lite-'))
        .sort((a, b) => (a.sizeMB || 0) - (b.sizeMB || 0));

    for (const preset of litePresets) {
        try {
            self.postMessage({ status: 'warm-start', preset: preset });
            if (chatbot) {
                try { chatbot.dispose(); } catch (_) {}
                chatbot = null;
            }
            chatbot = await initializeModel(preset.backend, preset.dtype, preset.model);
            activePreset = preset;
            self.postMessage({ status: 'done', backend: preset.backend, dtype: preset.dtype, model: preset.model, isMobile, isTV });
            return;
        } catch (err) {
            lastError = err;
        }
    }

    throw lastError || new Error('All model presets failed to load');
}

let _currentGenCancel = null;

self.onmessage = async (e) => {
    const { type, messages, targetId, chatId } = e.data;

    if (type === 'abort') {
        isAborted = true;
        if (_currentGenCancel) {
            _currentGenCancel('UserAborted');
        }
        return;
    }

    if (type === 'init') {
        const requestedPresetId = e.data.forcePresetId || null;
        // If an init is already in-flight, abort its downloads immediately and
        // queue the new preset — it will run as soon as the current init unwinds.
        if (_initLock) {
            _pendingInitPreset = requestedPresetId;
            // Cancel any in-flight chunk fetches so we don't waste bandwidth
            // downloading a model the user just switched away from.
            if (typeof self.abortDownloads === 'function') self.abortDownloads();
            console.warn('[worker] download aborted; queuing new preset:', requestedPresetId);
            return;
        }

        async function runInit(presetId) {
            _initLock = true;
            _pendingInitPreset = null;
            isAborted = true;
            isGenerating = false;
            try {
                await new Promise((resolve) => setTimeout(resolve, 125));
                const [gpuInfo, wasmCaps] = await Promise.all([detectGpu(), detectWasmCapabilities()]);
                const mobile = isMobileDevice({ screenWidth: e.data.screenWidth, maxTouchPoints: e.data.maxTouchPoints });
                const tv = isTVDevice();
                deviceFlags = { isMobile: mobile, isTV: tv, isIntegrated: !!gpuInfo?.isIntegrated };
                await tryInitializeModels(
                    gpuInfo, mobile, tv,
                    presetId,
                    presetId ? null : (e.data.lastPresetId || null),
                    wasmCaps
                );
            } catch (err) {
                // Ignore AbortErrors — they mean the user switched models mid-download
                if (err?.name !== 'AbortError') {
                    reportWorkerError(err, undefined);
                }
            } finally {
                _initLock = false;
                // If a new switch arrived while we were loading, run it now.
                if (_pendingInitPreset !== null) {
                    const next = _pendingInitPreset;
                    runInit(next);
                }
            }
        }

        runInit(requestedPresetId);
        return;
    }

    if (type === 'query') {
        if (isGenerating) {
            reportWorkerError(new Error('JAMES is busy processing another request.'), targetId, chatId);
            return;
        }
        if (!chatbot) {
            reportWorkerError(new Error('Model is not initialized yet.'), targetId, chatId);
            return;
        }

        isGenerating = true;
        isAborted = false;
        let accumulatedResponse = '';

        let cancelCurrentGen = null;
        const cancelPromise = new Promise((_, reject) => {
            cancelCurrentGen = (reason) => reject(new Error(reason || 'AbortGeneration'));
        });
        _currentGenCancel = cancelCurrentGen;

        // ─── Freeze protection: generation timeout ──────────────────────────────
        const isLargeModel = (activePreset?.params ?? 0) >= 3.0;
        const GEN_TIMEOUT_MS = isLargeModel ? GEN_TIMEOUT_LARGE_MS : GEN_TIMEOUT_DEFAULT_MS;
        const PREFILL_TIMEOUT_MS = isLargeModel ? 60_000 : 35_000;
        const TOKEN_STALL_MS = STALL_WATCHDOG_MS; // 20_000 ms

        let hasReceivedFirstToken = false;
        let lastTokenTime = performance.now();

        let genTimeoutId = setTimeout(() => {
            if (isGenerating && !isAborted) {
                console.warn('[worker] Generation timeout — aborting to prevent freeze');
                isAborted = true;
                if (cancelCurrentGen) cancelCurrentGen('GenerationTimeout');
                self.postMessage({
                    status: 'error',
                    message: `Generation timed out after ${Math.round(GEN_TIMEOUT_MS / 1000)}s. ` +
                        'Try a smaller model or shorten your prompt.',
                    targetId,
                    chatId
                });
            }
        }, GEN_TIMEOUT_MS);

        // ─── Freeze protection: stall watchdog ──────────────────────────────────
        // Allows adequate time for prompt prefill, then watches token-to-token intervals.
        let stallWatchdogId = setInterval(() => {
            if (!isGenerating || isAborted) { clearInterval(stallWatchdogId); return; }
            const elapsed = performance.now() - lastTokenTime;
            const threshold = hasReceivedFirstToken ? TOKEN_STALL_MS : PREFILL_TIMEOUT_MS;
            if (elapsed > threshold) {
                console.warn('[worker] Token stall detected — aborting to prevent freeze');
                isAborted = true;
                clearInterval(stallWatchdogId);
                if (cancelCurrentGen) cancelCurrentGen('TokenStall');
                self.postMessage({
                    status: 'error',
                    message: 'The model stopped responding (possible GPU stall). ' +
                        'Aborted to protect your device. Consider using a smaller model.',
                    targetId,
                    chatId
                });
            }
        }, 3_000);

        try {
            self.postMessage({ status: 'thinking', targetId, chatId });

            const activeMessages = messages.filter(m => !(m.content || '').includes('Tools available'));

            // \u2500\u2500 Merge all leading system messages into one \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
            // Small models (1B-1.5B) strictly reject consecutive system roles.
            // The worker prepends its own system prompt, and getMessagesWindow
            // also sends a system prefix, so we defensively collapse them here.
            // Tiered system prompt: lite (<0.5B) / compact (small models, phone, TV) / full (3B+ desktop).
            const promptTier = getPromptTier(activePreset, deviceFlags);
            const basePrompt = buildSystemPrompt(promptTier, activeMessages);
            const allMessages = [{ role: 'system', content: basePrompt }, ...activeMessages];
            const chatContext = [];
            for (const msg of allMessages) {
                const last = chatContext[chatContext.length - 1];
                if (last && last.role === msg.role && msg.role === 'system') {
                    last.content += '\n\n' + msg.content;
                } else {
                    chatContext.push({ role: msg.role, content: msg.content });
                }
            }

            const prompt = chatbot.tokenizer.apply_chat_template(chatContext, {
                tokenize: false,
                add_generation_prompt: true
            });

            const promptTokens = await chatbot.tokenizer(prompt);
            const promptTokenCount = promptTokens.input_ids.data.length;
            console.log(`[worker] prompt tier=${promptTier} tokens=${promptTokenCount}`);

            let maxTokens = CONFIG.worker.maxTokens;
            let temp = CONFIG.worker.temperature;

            // Token budget per model tier — keep these conservative.
            // The 3B model now gets a larger system prompt (tool examples etc.) plus
            // tool-result history on follow-up calls, so capping at 1280 prevents OOM.
            if (activePreset) {
                if (activePreset.params < 1.0) {
                    maxTokens = 512;
                    temp = 0.8;
                } else if (activePreset.params >= 4.0) {
                    maxTokens = 1536;  // Gemma 4B / Phi-3.5+ — larger context window available
                    temp = 0.7;
                } else if (activePreset.params >= 3.0) {
                    maxTokens = 1280;  // Llama 3.2 3B — conservative to avoid OOM after tool calls
                    temp = 0.7;
                }
            }

            // Safety guard: if the prompt alone is within 512 tokens of our
            // generation budget, shrink maxTokens to leave at least 256 free,
            // or bail out with a friendly error rather than crashing the GPU.
            // Context limits tier by model size — larger models have bigger context windows
            // but also bigger system prompts, so we budget accordingly.
            const CONTEXT_LIMIT = activePreset?.params >= 4.0 ? 8192
                                 : activePreset?.params >= 3.0 ? 4096
                                 : 2048;
            if (promptTokenCount + maxTokens > CONTEXT_LIMIT) {
                const available = CONTEXT_LIMIT - promptTokenCount;
                if (available < 256) {
                    throw new Error('Context window full — please start a new chat or select a smaller model to continue.');
                }
                maxTokens = Math.min(maxTokens, available);
            }

            // ─── GPU / IPC yield helper ──────────────────────────────────────────────
            // callback_function is synchronous, so we can't await inside it.
            // To reduce GPU saturation we throttle postMessage calls (expensive
            // structured-clone IPC) to every YIELD_EVERY_N_TOKENS ticks, and
            // rely on the stall watchdog + timeout to catch hard freezes.
            let _callbackTick = 0;

            const chatbotPromise = chatbot(prompt, {
                max_new_tokens: maxTokens,
                do_sample: true,
                temperature: temp,
                top_k: CONFIG.worker.topK,
                top_p: CONFIG.worker.topP,
                return_full_text: false,
                callback_function: (beams) => {
                    if (isAborted) throw new Error('AbortGeneration');

                    const tokenIds = beams?.[0]?.output_token_ids;
                    if (!tokenIds) return;

                    // Reset the stall watchdog on every incoming token and mark first token
                    hasReceivedFirstToken = true;
                    lastTokenTime = performance.now();
                    _callbackTick++;

                    // Throttle: only decode & postMessage every N ticks to reduce
                    // IPC overhead and give the GPU scheduler room to breathe.
                    if (_callbackTick % YIELD_EVERY_N_TOKENS !== 0) return;

                    const tokenData = tokenIds.data || tokenIds;
                    if (tokenData.length > promptTokenCount) {
                        const newTokenSlice = tokenData.subarray
                            ? tokenData.subarray(promptTokenCount)
                            : Array.prototype.slice.call(tokenData, promptTokenCount);
                        const text = chatbot.tokenizer.decode(newTokenSlice, { skip_special_tokens: true });
                        if (text.length > accumulatedResponse.length) {
                            accumulatedResponse = text;
                            self.postMessage({
                                status: 'streaming',
                                message: accumulatedResponse,
                                targetId,
                                chatId
                            });
                        }
                    }
                }
            });

            const output = await Promise.race([chatbotPromise, cancelPromise]);

            if (isAborted) {
                self.postMessage({ status: 'aborted', message: accumulatedResponse.trim(), targetId, chatId });
                return;
            }

            let finalResponse = Array.isArray(output)
                ? (output[0]?.generated_text ?? output[0]?.text ?? '').trim()
                : (output?.generated_text ?? output?.text ?? '').trim();

            if (!finalResponse && accumulatedResponse) {
                finalResponse = accumulatedResponse.trim();
            }

            self.postMessage({
                status: 'complete',
                message: finalResponse.trim(),
                targetId,
                chatId
            });
        } catch (err) {
            if (err.message === 'AbortGeneration' || err.message === 'UserAborted') {
                self.postMessage({
                    status: 'aborted',
                    message: accumulatedResponse.trim(),
                    targetId,
                    chatId
                });
            } else if (err.message === 'GenerationTimeout' || err.message === 'TokenStall') {
                // Handlers already posted error status. If it stalled, dispose pipeline to clear poisoned GPU state.
                if (err.message === 'TokenStall' && isLargeModel) {
                    try { if (chatbot) chatbot.dispose(); } catch (_) {}
                    chatbot = null;
                    activePreset = null;
                }
            } else {
                // Handle GPU OOM / Device Lost explicitly
                const errMsg = err.message || String(err);
                if (errMsg.includes('Device] is lost') || errMsg.includes('OutOfMemory') || errMsg.includes('OrtRun')) {
                    try { if (chatbot) chatbot.dispose(); } catch (_) {}
                    chatbot = null;
                    activePreset = null;
                    const safeErr = new Error('GPU Memory Exhausted or Device Lost. The model has been unloaded to prevent crashes. Please select a smaller model (e.g., 1.5B or 1B) or refresh the page.');
                    reportWorkerError(safeErr, targetId, chatId);
                } else {
                    reportWorkerError(err, targetId, chatId);
                }
            }
        } finally {
            clearTimeout(genTimeoutId);
            clearInterval(stallWatchdogId);
            isGenerating = false;
            _currentGenCancel = null;
        }
    }
};
