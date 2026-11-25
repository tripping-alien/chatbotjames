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

const SAFE_MATH_FUNCS = Object.freeze({
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    sinh: Math.sinh,
    cosh: Math.cosh,
    tanh: Math.tanh,
    sqrt: Math.sqrt,
    cbrt: Math.cbrt,
    abs: Math.abs,
    exp: Math.exp,
    log: Math.log,
    ln: Math.log,
    log2: Math.log2,
    log10: Math.log10,
    pow: Math.pow,
    sign: Math.sign
});

const PRIVATE_HOST_RE = /^(localhost|.*\.localhost|127\..*|10\..*|192\.168\..*|169\.254\..*|172\.(1[6-9]|2\d|3[01])\..*|0\.0\.0\.0|\[?::1\]?|\[?fe80:.*|\[?fc.*|\[?fd.*)$/i;

/**
 * Validate that a URL uses http/https and does not target local/private/metadata addresses.
 */
export function validatePublicHttpUrl(rawUrl) {
    if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
        throw new Error('URL is required');
    }
    let parsed;
    try {
        parsed = new URL(rawUrl.trim());
    } catch (_) {
        throw new Error('Invalid URL');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Only http and https URLs are allowed');
    }
    if (PRIVATE_HOST_RE.test(parsed.hostname)) {
        throw new Error('Requests to local or private addresses are blocked');
    }
    return parsed.href;
}

function tokenizeMathExpr(src, allowedVars) {
    const tokens = [];
    let i = 0;
    const len = src.length;
    while (i < len) {
        const ch = src[i];
        if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
            i++;
            continue;
        }
        if ((ch >= '0' && ch <= '9') || (ch === '.' && i + 1 < len && src[i + 1] >= '0' && src[i + 1] <= '9')) {
            const start = i;
            let hasDot = false;
            while (i < len) {
                const c = src[i];
                if (c >= '0' && c <= '9') {
                    i++;
                } else if (c === '.' && !hasDot) {
                    hasDot = true;
                    i++;
                } else {
                    break;
                }
            }
            if (i < len && (src[i] === 'e' || src[i] === 'E')) {
                const next = src[i + 1];
                const after = src[i + 2];
                const isExp = (next >= '0' && next <= '9') ||
                    ((next === '+' || next === '-') && after >= '0' && after <= '9');
                if (isExp) {
                    i++;
                    if (src[i] === '+' || src[i] === '-') i++;
                    while (i < len && src[i] >= '0' && src[i] <= '9') i++;
                }
            }
            const num = Number(src.slice(start, i));
            if (!Number.isFinite(num)) throw new Error('Invalid number literal');
            tokens.push({ type: 'num', value: num });
            continue;
        }
        if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
            const start = i;
            i++;
            while (i < len && ((src[i] >= 'a' && src[i] <= 'z') || (src[i] >= 'A' && src[i] <= 'Z') || (src[i] >= '0' && src[i] <= '9') || src[i] === '_')) {
                i++;
            }
            const id = src.slice(start, i);
            if (!allowedVars.has(id) && id.toLowerCase() !== 'pi' && id !== 'e' && !Object.prototype.hasOwnProperty.call(SAFE_MATH_FUNCS, id)) {
                throw new Error(`Disallowed identifier in expression: ${id}`);
            }
            tokens.push({ type: 'id', value: id });
            continue;
        }
        if (ch === '*' && src[i + 1] === '*') {
            tokens.push({ type: 'op', value: '**' });
            i += 2;
            continue;
        }
        if (ch === '^') {
            tokens.push({ type: 'op', value: '**' });
            i++;
            continue;
        }
        if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '%' || ch === '(' || ch === ')' || ch === ',') {
            tokens.push({ type: ch === '(' || ch === ')' || ch === ',' ? ch : 'op', value: ch });
            i++;
            continue;
        }
        throw new Error(`Unexpected character in expression: ${ch}`);
    }
    return tokens;
}

/**
 * Compile a restricted mathematical expression into a pure evaluation function
 * without using Function/eval.
 */
export function compileMathExpr(expr, argNames = []) {
    if (typeof expr !== 'string' || expr.length === 0 || expr.length > 500) {
        throw new Error('Expression is empty or too long');
    }
    const allowedVars = new Set(argNames);
    const tokens = tokenizeMathExpr(expr, allowedVars);
    if (tokens.length === 0) throw new Error('Invalid expression');

    let pos = 0;
    let depth = 0;
    const MAX_DEPTH = 64;

    const peek = () => tokens[pos] || null;
    const consume = () => tokens[pos++];

    function parseExpr() {
        let left = parseMulDiv();
        while (peek()?.type === 'op' && (peek().value === '+' || peek().value === '-')) {
            const op = consume().value;
            const right = parseMulDiv();
            const l = left;
            left = op === '+' ? (env) => l(env) + right(env) : (env) => l(env) - right(env);
        }
        return left;
    }

    function parseMulDiv() {
        let left = parseUnary();
        while (peek()?.type === 'op' && (peek().value === '*' || peek().value === '/' || peek().value === '%')) {
            const op = consume().value;
            const right = parseUnary();
            const l = left;
            if (op === '*') left = (env) => l(env) * right(env);
            else if (op === '/') left = (env) => l(env) / right(env);
            else left = (env) => l(env) % right(env);
        }
        return left;
    }

    function parseUnary() {
        if (peek()?.type === 'op' && (peek().value === '+' || peek().value === '-')) {
            const op = consume().value;
            const inner = parseUnary();
            return op === '-' ? (env) => -inner(env) : inner;
        }
        return parsePower();
    }

    function parsePower() {
        const base = parsePrimary();
        if (peek()?.type === 'op' && peek().value === '**') {
            consume();
            const exp = parseUnary();
            return (env) => Math.pow(base(env), exp(env));
        }
        return base;
    }

    function parsePrimary() {
        if (++depth > MAX_DEPTH) throw new Error('Expression nesting depth exceeded');
        try {
            const tok = peek();
            if (!tok) throw new Error('Unexpected end of expression');
            if (tok.type === 'num') {
                consume();
                const val = tok.value;
                return () => val;
            }
            if (tok.type === '(') {
                consume();
                const inner = parseExpr();
                if (peek()?.type !== ')') throw new Error('Missing closing parenthesis');
                consume();
                return inner;
            }
            if (tok.type === 'id') {
                consume();
                const id = tok.value;
                if (peek()?.type === '(') {
                    if (!Object.prototype.hasOwnProperty.call(SAFE_MATH_FUNCS, id)) {
                        throw new Error(`Unknown function: ${id}`);
                    }
                    const fn = SAFE_MATH_FUNCS[id];
                    consume();
                    const args = [parseExpr()];
                    while (peek()?.type === ',') {
                        consume();
                        if (args.length >= 2) throw new Error(`Too many arguments to ${id}`);
                        args.push(parseExpr());
                    }
                    if (peek()?.type !== ')') throw new Error('Missing closing parenthesis in call');
                    consume();
                    if (id === 'pow') {
                        if (args.length !== 2) throw new Error('pow requires 2 arguments');
                        const [a0, a1] = args;
                        return (env) => fn(a0(env), a1(env));
                    }
                    if (args.length !== 1) throw new Error(`${id} requires 1 argument`);
                    const [a0] = args;
                    return (env) => fn(a0(env));
                }
                if (allowedVars.has(id)) return (env) => env[id];
                if (id.toLowerCase() === 'pi') return () => Math.PI;
                if (id === 'e') return () => Math.E;
                throw new Error(`Invalid identifier: ${id}`);
            }
            throw new Error(`Unexpected token: ${tok.value}`);
        } finally {
            depth--;
        }
    }

    const ast = parseExpr();
    if (pos !== tokens.length) throw new Error(`Unexpected trailing token: ${tokens[pos].value}`);

    return (...values) => {
        const env = Object.create(null);
        for (let idx = 0; idx < argNames.length; idx++) {
            env[argNames[idx]] = values[idx];
        }
        return ast(env);
    };
}

export function evalMath(expr) {
    if (typeof expr !== 'string' || expr.length === 0 || expr.length > 500) {
        throw new Error('Expression is empty or too long');
    }
    const normalized = expr
        .replace(/\bmod\b/gi, '%')
        .replace(/\bx\b/gi, '*');
    return compileMathExpr(normalized, [])();
}
