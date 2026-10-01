// A highly optimized WebAssembly implementation of Levenshtein Distance
// Uses a flat 1D array to avoid 2D array allocation overhead in Wasm memory.

export function levenshteinDistance(a: string, b: string): i32 {
    const aLen = a.length;
    const bLen = b.length;

    // Fast paths
    if (aLen === 0) return bLen;
    if (bLen === 0) return aLen;
    if (a === b) return 0;

    // Optimization: avoid allocating memory for large strings
    // We only need two rows of the matrix
    const v0 = new Int32Array(bLen + 1);
    const v1 = new Int32Array(bLen + 1);

    // Initialize v0
    for (let i = 0; i <= bLen; i++) {
        v0[i] = i;
    }

    for (let i = 0; i < aLen; i++) {
        v1[0] = i + 1;
        const charA = a.charCodeAt(i);

        for (let j = 0; j < bLen; j++) {
            const cost = (charA === b.charCodeAt(j)) ? 0 : 1;
            
            const del = v0[j + 1] + 1;
            const ins = v1[j] + 1;
            const sub = v0[j] + cost;

            // min(del, min(ins, sub))
            let minVal = del;
            if (ins < minVal) minVal = ins;
            if (sub < minVal) minVal = sub;

            v1[j + 1] = minVal;
        }

        // Swap arrays for next iteration
        for (let j = 0; j <= bLen; j++) {
            v0[j] = v1[j];
        }
    }

    return v0[bLen];
}
