import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1';
import { CONFIG } from '../core/config.js';
import { setupDownloadManager } from './worker-downloader.js';
import { getPromptTier, buildSystemPrompt, isGameActive } from './worker-prompt-tiers.js';
import { isMobileDevice, isTVDevice, detectWasmCapabilities, detectGpu, getDeviceRamGB } from './worker-device-detect.js';
import { MODEL_PRESETS, rankAutoPresets, getSmallestPreset, getSmallestFirstPresets } from './worker-presets.js';

// Resolve a preset's param count to the CONFIG.tiers key (mirrors app.js _presetTierKey).
function _workerTierKey(params) {
    if (!params || params < 0.5) return 'lite';
    if (params < 3.0)            return 'compact';
    if (params < 4.0)            return '3b';
    return '4b';
}

// --- CONFIGURATION ---
env.allowLocalModels = false;
env.useBrowserCache = true;
if (env.backends?.onnx?.wasm) {
    if (!self.crossOriginIsolated || isMobileDevice()) {
        env.backends.onnx.wasm.numThreads = 1;
        env.backends.onnx.wasm.proxy = false;
    }
}
self.isMobile = isMobileDevice();
setupDownloadManager(env, self);

let chatbot = null;
let activePreset = null;
// Last successfully loaded (not merely downloaded) model is the smallest one by default
let lastSuccessfulPreset = getSmallestPreset();
let deviceFlags = { isMobile: false, isTV: false }; // set on init, used to pick the prompt tier
let isGenerating = false;
let isAborted = false;
let _initLock = false;        // prevents concurrent init messages from racing
let _pendingInitPreset = null; // stores the latest switch request while one is in-flight


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
        const targetPreset = MODEL_PRESETS.find(p => p.id === forcePresetId);
        if (!targetPreset) throw new Error(`Unknown preset id: ${forcePresetId}`);
        self.postMessage({ status: 'warm-start', preset: targetPreset });

        // Keep reference to previous active chatbot and last successful load
        const previousChatbot = chatbot;
        const previousPreset = activePreset || lastSuccessfulPreset || getSmallestPreset();

        let newChatbot = null;
        try {
            newChatbot = await initializeModel(targetPreset.backend, targetPreset.dtype, targetPreset.model);

            // Successfully loaded (not merely downloaded)!
            if (previousChatbot && previousChatbot !== newChatbot) {
                try { previousChatbot.dispose(); } catch (_) {}
            }
            chatbot = newChatbot;
            activePreset = targetPreset;
            lastSuccessfulPreset = targetPreset; // Remember the new successfully loaded model
            self.postMessage({ status: 'done', presetId: targetPreset.id, preset: targetPreset, backend: targetPreset.backend, dtype: targetPreset.dtype, model: targetPreset.model, isMobile, isTV });
            return;
        } catch (err) {
            console.warn(`[worker] Prioritized model ${forcePresetId} failed to load:`, err);
            if (newChatbot) {
                try { newChatbot.dispose(); } catch (_) {}
            }

            // Next loading failed: remember and fall back to the last successful load (smallest one by default)
            const fallbackPreset = lastSuccessfulPreset || previousPreset || getSmallestPreset();
            console.log(`[worker] Reverting to last successful load: ${fallbackPreset.id}`);

            self.postMessage({
                status: 'model-fallback',
                failedPresetId: forcePresetId,
                failedPreset: targetPreset,
                fallbackPresetId: fallbackPreset.id,
                fallbackPreset: fallbackPreset,
                error: normalizeError(err)
            });

            // If the previous chatbot is still in memory and matches the fallback preset, reuse it immediately
            if (previousChatbot && previousPreset && previousPreset.id === fallbackPreset.id) {
                chatbot = previousChatbot;
                activePreset = fallbackPreset;
                self.postMessage({
                    status: 'done',
                    presetId: fallbackPreset.id,
                    preset: fallbackPreset,
                    backend: fallbackPreset.backend,
                    dtype: fallbackPreset.dtype,
                    model: fallbackPreset.model,
                    isMobile,
                    isTV,
                    isFallback: true
                });
                return;
            }

            // Otherwise, re-initialize the last successful load
            try {
                if (chatbot) {
                    try { chatbot.dispose(); } catch (_) {}
                    chatbot = null;
                }
                self.postMessage({ status: 'warm-start', preset: fallbackPreset });
                chatbot = await initializeModel(fallbackPreset.backend, fallbackPreset.dtype, fallbackPreset.model);
                activePreset = fallbackPreset;
                lastSuccessfulPreset = fallbackPreset;
                self.postMessage({
                    status: 'done',
                    presetId: fallbackPreset.id,
                    preset: fallbackPreset,
                    backend: fallbackPreset.backend,
                    dtype: fallbackPreset.dtype,
                    model: fallbackPreset.model,
                    isMobile,
                    isTV,
                    isFallback: true
                });
                return;
            } catch (fallbackErr) {
                console.error('[worker] Fallback to last successful load failed:', fallbackErr);
                lastError = fallbackErr;
            }

            // If fallbackPreset itself failed and was not already the smallest preset, fall back to smallest preset
            const smallestPreset = getSmallestPreset();
            if (fallbackPreset.id !== smallestPreset.id) {
                try {
                    console.log(`[worker] Fallback to ${fallbackPreset.id} failed, trying default smallest model: ${smallestPreset.id}`);
                    self.postMessage({ status: 'warm-start', preset: smallestPreset });
                    chatbot = await initializeModel(smallestPreset.backend, smallestPreset.dtype, smallestPreset.model);
                    activePreset = smallestPreset;
                    lastSuccessfulPreset = smallestPreset;
                    self.postMessage({
                        status: 'done',
                        presetId: smallestPreset.id,
                        preset: smallestPreset,
                        backend: smallestPreset.backend,
                        dtype: smallestPreset.dtype,
                        model: smallestPreset.model,
                        isMobile,
                        isTV,
                        isFallback: true
                    });
                    return;
                } catch (smallestErr) {
                    console.error('[worker] Fallback to smallest preset failed:', smallestErr);
                    lastError = smallestErr;
                }
            }
        }
    }

    if (lastPresetId) {
        const last = MODEL_PRESETS.find(p => p.id === lastPresetId);
        if (last) {
            self.postMessage({ status: 'warm-start', preset: last });
            if (chatbot) {
                try { chatbot.dispose(); } catch (_) {}
                chatbot = null;
            }
            try {
                chatbot = await initializeModel(last.backend, last.dtype, last.model);
                activePreset = last;
                lastSuccessfulPreset = last; // Set as last successfully loaded
                self.postMessage({ status: 'done', presetId: last.id, preset: last, backend: last.backend, dtype: last.dtype, model: last.model, isMobile, isTV });
                return;
            } catch (err) {
                console.warn('[worker] Last preset failed to initialize on reload, clearing cache and falling back:', err);
                self.postMessage({ status: 'clear-last-preset' });
                lastError = err;
            }
        }
    }

    // Always load the smallest model at first!
    const autoPresets = getSmallestFirstPresets(gpuInfo, ramGB, isConstrained, wasmCaps);
    for (const preset of autoPresets) {
        try {
            self.postMessage({ status: 'warm-start', preset: preset });
            if (chatbot) {
                try { chatbot.dispose(); } catch (_) {}
                chatbot = null;
            }
            chatbot = await initializeModel(preset.backend, preset.dtype, preset.model);
            activePreset = preset;
            lastSuccessfulPreset = preset; // Set as last successfully loaded
            self.postMessage({ status: 'done', presetId: preset.id, preset, backend: preset.backend, dtype: preset.dtype, model: preset.model, isMobile, isTV });
            return;
        } catch (err) {
            lastError = err;
        }
    }

    throw lastError || new Error('All model presets failed to load');
}

self.onmessage = async (e) => {
    const { type, messages, targetId, chatId } = e.data;

    if (type === 'abort') {
        isAborted = true;
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
                self.isMobile = mobile;
                if (mobile || !self.crossOriginIsolated) {
                    if (env.backends?.onnx?.wasm) {
                        env.backends.onnx.wasm.numThreads = 1;
                        env.backends.onnx.wasm.proxy = false;
                    }
                }
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

        try {
            self.postMessage({ status: 'thinking', targetId, chatId });

            const activeMessages = messages.filter(m => !(m.content || '').includes('Tools available'));

            // \u2500\u2500 Merge all leading system messages into one \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
            // Small models (1B-1.5B) strictly reject consecutive system roles.
            // The worker prepends its own system prompt, and getMessagesWindow
            // also sends a system prefix, so we defensively collapse them here.
            // Tiered system prompt: lite (<0.5B) / compact (small models, phone, TV, or during games) / full (3B+ desktop).
            const promptTier = getPromptTier(activePreset, deviceFlags, activeMessages);
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

            // ── Tier-aware generation budget ───────────────────────────────────────────────
            // All budget constants live in CONFIG.tiers (single source of truth
            // shared with app.js getMessagesWindow), so we only define them once.
            const _tierKey  = (promptTier === 'compact' || promptTier === 'lite') ? promptTier : _workerTierKey(activePreset?.params);
            const _tierCfg  = CONFIG.tiers[_tierKey] || CONFIG.tiers['compact'];
            let maxTokens   = _tierCfg.genTokens;
            let temp        = _tierCfg.temperature;
            const CONTEXT_LIMIT = _tierCfg.contextLimit;

            // If an active game turn is detected, enforce focused, low-entropy decoding.
            const isGame = isGameActive(activeMessages);
            if (isGame && CONFIG.games) {
                if (typeof CONFIG.games.temperature === 'number') temp = CONFIG.games.temperature;
                if (typeof CONFIG.games.maxTokens === 'number') maxTokens = Math.min(maxTokens, CONFIG.games.maxTokens);
            }

            // Safety guard: if the prompt alone nearly fills the context, shrink
            // maxTokens to leave at least 256 tokens free, or surface a friendly
            // error instead of crashing the GPU / WASM runtime.
            if (promptTokenCount + maxTokens > CONTEXT_LIMIT) {
                const available = CONTEXT_LIMIT - promptTokenCount;
                if (available < 256) {
                    throw new Error('Context window full — please start a new chat or select a smaller model to continue.');
                }
                maxTokens = Math.min(maxTokens, available);
            }

            if (isAborted) {
                self.postMessage({ status: 'aborted', message: accumulatedResponse.trim(), targetId, chatId });
                return;
            }

            const output = await chatbot(prompt, {
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
            if (err.message === 'AbortGeneration') {
                self.postMessage({
                    status: 'aborted',
                    message: accumulatedResponse.trim(),
                    targetId,
                    chatId
                });
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
            isGenerating = false;
        }
    }
};
