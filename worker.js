import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';
import { CONFIG } from './config.js';
import { setupDownloadManager } from './worker-downloader.js';
import { systemPrompt } from './worker-system-prompt.js';
import { isMobileDevice, isTVDevice, detectWasmCapabilities, detectGpu, getDeviceRamGB } from './worker-device-detect.js';
import { MODEL_PRESETS, rankAutoPresets } from './worker-presets.js';

// --- CONFIGURATION ---
env.allowLocalModels = false;
env.useBrowserCache = true;
setupDownloadManager(env, self);

let chatbot = null;
let activePreset = null;
let isGenerating = false;
let isAborted = false;
let _initLock = false;        // prevents concurrent init messages from racing
let _pendingInitPreset = null; // stores the latest switch request while one is in-flight

function normalizeError(err) {
    let msg = err?.message || String(err);
    msg = msg.replace(/https?:\/\/[^\s]+/g, '(url)');
    return msg;
}

function reportWorkerError(err, targetId) {
    const safeMsg = normalizeError(err);
    if (safeMsg !== 'AbortGeneration') {
        console.error('?', err);
        self.postMessage({ status: 'error', message: safeMsg, targetId });
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
        if (last) {
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

self.onmessage = async (e) => {
    const { type, messages, targetId, chatId } = e.data;

    if (type === 'abort') {
        isAborted = true;
        return;
    }

    if (type === 'init') {
        const requestedPresetId = e.data.forcePresetId || null;
        // If an init is already in-flight, record the latest requested preset and bail.
        // The in-flight handler will pick it up once it finishes.
        if (_initLock) {
            _pendingInitPreset = requestedPresetId;
            console.warn('[worker] init already in-flight, queuing preset:', requestedPresetId);
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
                await tryInitializeModels(
                    gpuInfo, mobile, tv,
                    presetId,
                    presetId ? null : (e.data.lastPresetId || null),
                    wasmCaps
                );
            } catch (err) {
                reportWorkerError(err, undefined);
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
            reportWorkerError(new Error('JAMES is busy processing another request.'), targetId);
            return;
        }
        if (!chatbot) {
            reportWorkerError(new Error('Model is not initialized yet.'), targetId);
            return;
        }

        isGenerating = true;
        isAborted = false;
        let accumulatedResponse = '';

        try {
            self.postMessage({ status: 'thinking', targetId, chatId });

            const activeMessages = messages.filter(m => !(m.content || '').includes('Tools available'));
            const chatContext = [
                { role: 'system', content: systemPrompt },
                ...activeMessages
            ];

            const prompt = chatbot.tokenizer.apply_chat_template(chatContext, {
                tokenize: false,
                add_generation_prompt: true
            });

            const promptTokens = await chatbot.tokenizer(prompt);
            const promptTokenCount = promptTokens.input_ids.data.length;

            let maxTokens = CONFIG.worker.maxTokens;
            let temp = CONFIG.worker.temperature;

            if (activePreset) {
                if (activePreset.params < 1.0) {
                    maxTokens = 512;
                    temp = 0.8;
                } else if (activePreset.params >= 3.0) {
                    maxTokens = 2048;
                    temp = 0.7;
                }
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

                    const allTokens = Array.from(tokenIds.data || tokenIds);
                    if (allTokens.length > promptTokenCount) {
                        const newTokens = allTokens.slice(promptTokenCount);
                        const text = chatbot.tokenizer.decode(newTokens, { skip_special_tokens: true });
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
                reportWorkerError(err, targetId);
            }
        } finally {
            isGenerating = false;
        }
    }
};
