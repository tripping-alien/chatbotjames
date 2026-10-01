export function cleanTail(str) {
    return str.replace(/[?!.,;:]+$/, '').trim();
}

export function safeInt(str, defaultVal, min, max) {
    const n = parseInt(str ?? '', 10);
    const val = isNaN(n) ? defaultVal : n;
    if (min !== undefined && val < min) return min;
    if (max !== undefined && val > max) return max;
    return val;
}

export function evalMath(expr) {
    if (typeof expr !== 'string' || expr.length === 0 || expr.length > 500) {
        throw new Error('Expression is empty or too long');
    }
    const safe = expr
        .replace(/\^/g, '**')
        .replace(/\bmod\b/gi, '%')
        .replace(/\bx\b/gi, '*')
        .replace(/[^0-9+\-*/%.() ]/g, '');
    if (!safe.trim()) throw new Error('Invalid expression');
    return Function(`"use strict"; return (${safe})`)();
}
