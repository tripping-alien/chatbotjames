export const MODEL_PRESETS = [
    // GPU - WebGPU (Capable Computers, 3B+ Params)
    { id: 'gpu-llama32-3b-q4f16', label: 'Llama 3.2 3B', backend: 'webgpu', model: 'onnx-community/Llama-3.2-3B-Instruct', dtype: 'q4f16', requires: 'gpu', autoSelect: true, sizeMB: 2100, ram: '6 GB', params: 3.2 },
    { id: 'gpu-qwen25-15b-q4f16', label: 'Qwen2.5 1.5B', backend: 'webgpu', model: 'onnx-community/Qwen2.5-1.5B-Instruct', dtype: 'q4f16', requires: 'gpu', autoSelect: true, sizeMB: 1100, ram: '4 GB', params: 1.5 },

    // GPU - WebGPU (Mid-Range Laptops, 1B - 2B Params)
    { id: 'gpu-gemma3-1b-q4f16', label: 'Gemma 3 1B', backend: 'webgpu', model: 'onnx-community/gemma-3-1b-it-ONNX', dtype: 'q4f16', requires: 'gpu', autoSelect: false, sizeMB: 800, ram: '3 GB', params: 1.0 },
    { id: 'gpu-smollm-17b-q4f16', label: 'SmolLM2 1.7B', backend: 'webgpu', model: 'HuggingFaceTB/SmolLM2-1.7B-Instruct', dtype: 'q4f16', requires: 'gpu', autoSelect: true, sizeMB: 950, ram: '3 GB', params: 1.7 },
    { id: 'gpu-deepseek-15b-q4f16', label: 'DeepSeek-R1 1.5B', backend: 'webgpu', model: 'onnx-community/DeepSeek-R1-Distill-Qwen-1.5B-ONNX', dtype: 'q4f16', requires: 'gpu', autoSelect: true, sizeMB: 1000, ram: '4 GB', params: 1.5 },
    { id: 'gpu-llama32-1b-q4f16', label: 'Llama 3.2 1B', backend: 'webgpu', model: 'onnx-community/Llama-3.2-1B-Instruct', dtype: 'q4f16', requires: 'gpu', autoSelect: true, sizeMB: 750, ram: '3 GB', params: 1.2 },

    // GPU - WebGPU (Low-Power / Mobile, < 1B Params)
    { id: 'gpu-qwen25-05b-q4f16', label: 'Qwen2.5 0.5B', backend: 'webgpu', model: 'onnx-community/Qwen2.5-0.5B-Instruct', dtype: 'q4f16', requires: 'gpu', autoSelect: true, sizeMB: 400, ram: '2 GB', params: 0.5 },

    // CPU - WASM (General Fallbacks)
    { id: 'cpu-llama32-1b-q4', label: 'Llama 3.2 1B', backend: 'wasm', model: 'onnx-community/Llama-3.2-1B-Instruct', dtype: 'q4', requires: 'cpu', autoSelect: true, sizeMB: 650, ram: '2 GB', params: 1.2 },
    { id: 'cpu-tinyllama-q4', label: 'TinyLlama 1.1B', backend: 'wasm', model: 'Xenova/TinyLlama-1.1B-Chat-v1.0', dtype: 'q4', requires: 'cpu', autoSelect: true, sizeMB: 600, ram: '2 GB', params: 1.1 },
    { id: 'cpu-tinyllama-q8', label: 'TinyLlama 1.1B q8', backend: 'wasm', model: 'Xenova/TinyLlama-1.1B-Chat-v1.0', dtype: 'q8', requires: 'cpu', autoSelect: true, sizeMB: 1100, ram: '3 GB', params: 1.1 },
    { id: 'cpu-qwen25-05b-q4', label: 'Qwen2.5 0.5B', backend: 'wasm', model: 'onnx-community/Qwen2.5-0.5B-Instruct', dtype: 'q4', requires: 'cpu', autoSelect: true, sizeMB: 400, ram: '1 GB', params: 0.5 },
    { id: 'cpu-smollm-17b-q4', label: 'SmolLM2 1.7B', backend: 'wasm', model: 'HuggingFaceTB/SmolLM2-1.7B-Instruct', dtype: 'q4', requires: 'cpu', autoSelect: false, sizeMB: 950, ram: '3 GB', params: 1.7 },

    // Lite (Absolute Fallbacks for constrained devices)
    { id: 'lite-smollm-135m-q8', label: 'SmolLM2 135M q8', backend: 'wasm', model: 'HuggingFaceTB/SmolLM2-135M-Instruct', dtype: 'q8', requires: 'cpu', autoSelect: true, sizeMB: 150, ram: '512 MB', params: 0.135 },
    { id: 'lite-smollm-135m-q4', label: 'SmolLM2 135M q4', backend: 'wasm', model: 'HuggingFaceTB/SmolLM2-135M-Instruct', dtype: 'q4', requires: 'cpu', autoSelect: true, sizeMB: 90, ram: '256 MB', params: 0.135 },
];

export function rankAutoPresets(gpuInfo, ramGB, isConstrained, wasmCaps = null) {
    const { hasGpu } = gpuInfo;
    const gpuBudgetMB = hasGpu ? (ramGB * 1024 * 0.70) : 0;
    const cpuBudgetFactor = (wasmCaps && wasmCaps.memory64) ? 0.60 : 0.40;
    const cpuBudgetMB = ramGB * 1024 * cpuBudgetFactor;

    const candidates = MODEL_PRESETS.filter(p => {
        if (p.id.startsWith('lite-')) return false;
        if (p.requires === 'gpu' && !hasGpu) return false;
        if (p.autoSelect === false) return false;
        const budget = p.requires === 'gpu' ? gpuBudgetMB : cpuBudgetMB;
        return !(p.sizeMB && p.sizeMB > budget);
    });

    candidates.sort((a, b) => {
        const gpuA = a.requires === 'gpu' ? 1 : 0;
        const gpuB = b.requires === 'gpu' ? 1 : 0;
        if (gpuA !== gpuB) return gpuB - gpuA;
        return (b.params || 0) - (a.params || 0);
    });

    return candidates;
}
