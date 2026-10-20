export const CONFIG = {
    "ui": {
        "renderWindowMessages": 50,
        "maxHistory": 30,
        "maxToolDepth": 5,
        "throttleFpsMs": 33,
        "streamRenderIntervalMs": 15
    },
    "worker": {
        "chunkSizeMb": 2,
        "maxDownloadConcurrency": 8,
        "maxTokens": 1024,
        "temperature": 0.9,
        "topK": 20,
        "topP": 0.9
    },
    // Per-model-tier token budgets.
    // contextLimit : hard cap sent to the ONNX runtime (tokens).
    // genTokens    : max new tokens the model may generate per turn.
    // sysPromptEst : estimated tokens consumed by the worker's own system prompt
    //                (lite ≈ persona only, compact ≈ dynamic tool subset,
    //                 full ≈ complete tool catalogue + 40 examples).
    // maxHistory   : how many chat messages getMessagesWindow() may send.
    "tiers": {
        "lite":    { "contextLimit": 2048, "genTokens": 512,  "sysPromptEst": 80,   "maxHistory": 6,  "temperature": 0.8 },
        "compact": { "contextLimit": 4096, "genTokens": 1024, "sysPromptEst": 450,  "maxHistory": 14, "temperature": 0.8 },
        "3b":      { "contextLimit": 4096, "genTokens": 1280, "sysPromptEst": 3100, "maxHistory": 10, "temperature": 0.7 },
        "4b":      { "contextLimit": 8192, "genTokens": 1536, "sysPromptEst": 3100, "maxHistory": 20, "temperature": 0.7 }
    }
};
