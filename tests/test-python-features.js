// Run with: node tests/test-python-features.js
import { UserInputProcessor } from '../core/input-processor.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`PASS: ${message}`);
        passed++;
    } else {
        console.error(`FAIL: ${message}`);
        failed++;
    }
}

console.log('================================================================');
console.log('          JAMES PYTHON FEATURES UNIT TEST SUITE                 ');
console.log('================================================================\n');

// ─── 1. Python Code Parameter Normalization ──────────────────────────────────
console.log('--- 1. Python Code Parameter Normalization ---');

function extractPyCode(params) {
    const code = typeof params === 'string'
        ? params
        : (params?.code || params?.script || params?.expression || params?.python || '');
    if (!code || !code.trim()) {
        throw new Error('No Python code provided to execute.');
    }
    return code.trim();
}

// Direct string
assert(extractPyCode('print(1 + 1)') === 'print(1 + 1)', 'Extracts code from direct string');

// Object with code
assert(extractPyCode({ code: 'x = 42\nprint(x)' }) === 'x = 42\nprint(x)', 'Extracts code from params.code');

// Object with script
assert(extractPyCode({ script: 'import math\nprint(math.pi)' }) === 'import math\nprint(math.pi)', 'Extracts code from params.script');

// Object with expression
assert(extractPyCode({ expression: '2**10' }) === '2**10', 'Extracts code from params.expression');

// Object with python
assert(extractPyCode({ python: 'print("hello")' }) === 'print("hello")', 'Extracts code from params.python');

// Empty code throws
let threwEmpty = false;
try {
    extractPyCode({ code: '   ' });
} catch (e) {
    threwEmpty = true;
}
assert(threwEmpty, 'Throws error when empty code is passed');

let threwNull = false;
try {
    extractPyCode(null);
} catch (e) {
    threwNull = true;
}
assert(threwNull, 'Throws error when null params passed');

// ─── 2. pip_install Parameter Normalization ───────────────────────────────────
console.log('\n--- 2. pip_install Package Parameter Normalization ---');

function normalizePipPackages(params) {
    let pkgs = [];
    if (Array.isArray(params)) {
        pkgs = params.map(s => String(s).trim()).filter(Boolean);
    } else if (typeof params === 'string') {
        pkgs = params.split(',').map(s => s.trim()).filter(Boolean);
    } else if (params) {
        if (params.packages) {
            pkgs = Array.isArray(params.packages)
                ? params.packages
                : String(params.packages).split(',').map(s => s.trim()).filter(Boolean);
        } else if (params.package) {
            pkgs = [String(params.package).trim()];
        }
    }
    if (pkgs.length === 0) throw new Error('pip_install requires a packages parameter');
    return pkgs;
}

const p1 = normalizePipPackages(['numpy', 'pandas']);
assert(p1.length === 2 && p1[0] === 'numpy' && p1[1] === 'pandas', 'Normalizes array of packages');

const p2 = normalizePipPackages('scipy');
assert(p2.length === 1 && p2[0] === 'scipy', 'Normalizes single package string');

const p3 = normalizePipPackages('sympy, networkx, tabulate');
assert(p3.length === 3 && p3[1] === 'networkx', 'Normalizes comma-separated package string');

const p4 = normalizePipPackages({ package: 'requests' });
assert(p4.length === 1 && p4[0] === 'requests', 'Normalizes params.package object');

const p5 = normalizePipPackages({ packages: ['matplotlib', 'seaborn'] });
assert(p5.length === 2 && p5[1] === 'seaborn', 'Normalizes params.packages object');

let threwPipEmpty = false;
try {
    normalizePipPackages({});
} catch (e) {
    threwPipEmpty = true;
}
assert(threwPipEmpty, 'Throws error when packages parameter is missing');

// ─── 3. Python Code Preservation in UserInputProcessor ────────────────────────
console.log('\n--- 3. UserInputProcessor Code Preservation ---');

// Function with variables u, r, b4 must not be mangled to "you", "are", "before"
const rawFn = `def calculate(u, r):
    b4 = u * 2
    return b4 + r`;
const processedFn = UserInputProcessor.process(rawFn);
assert(processedFn.includes('def calculate(u, r):'), 'Python def statement preserved without capitalizing or expanding u, r');
assert(processedFn.includes('b4 = u * 2'), 'Python variable b4 preserved (not changed to "before")');
assert(processedFn.includes('return b4 + r'), 'Python return statement preserved with variables intact');

// Python imports and class definition
const rawClass = `import math

class Particle:
    def __init__(self, u):
        self.u = u`;
const processedClass = UserInputProcessor.process(rawClass);
assert(processedClass.startsWith('import math'), 'Python import statement preserved verbatim');
assert(processedClass.includes('class Particle:'), 'Python class keyword preserved in lower-case');
assert(processedClass.includes('self.u = u'), 'Variable u in class preserved');

// Markdown fenced Python code block
const rawFenced = `Check out this Python script:
\`\`\`python
for u in range(5):
    print(u * 2)
\`\`\`
pls run it b4 lunch`;
const processedFenced = UserInputProcessor.process(rawFenced);
assert(processedFenced.includes('for u in range(5):'), 'Loop variable u inside code block preserved');
assert(processedFenced.includes('print(u * 2)'), 'Print expression inside code block preserved');
assert(processedFenced.includes('please run it before lunch'), 'Text outside code block correctly expanded abbreviations');

// ─── 4. Response Output Formatting Simulation ─────────────────────────────────
console.log('\n--- 4. Python Output & Result Formatting ---');

function formatPythonResponse(pyResp) {
    const parts = [];
    if (pyResp.stdout && pyResp.stdout.trim()) parts.push(pyResp.stdout.trim());
    if (pyResp.result && pyResp.result.trim() && pyResp.result.trim() !== 'None') {
        parts.push(`=> ${pyResp.result.trim()}`);
    }
    let toolResult = parts.length > 0 ? parts.join('\n') : '(no output)';
    if (pyResp.figures && pyResp.figures.length > 0) {
        toolResult += `\n[${pyResp.figures.length} Matplotlib figure(s) generated and displayed]`;
    }
    return toolResult;
}

// Stdout only
const r1 = formatPythonResponse({ stdout: 'Hello from Python!\n42', result: 'None', figures: [] });
assert(r1 === 'Hello from Python!\n42', 'Formats stdout-only execution');

// Expression result only
const r2 = formatPythonResponse({ stdout: '', result: '1024', figures: [] });
assert(r2 === '=> 1024', 'Formats expression result with => prefix');

// Both stdout and result
const r3 = formatPythonResponse({ stdout: 'Calculating...', result: '[1, 2, 3]', figures: [] });
assert(r3 === 'Calculating...\n=> [1, 2, 3]', 'Combines stdout and expression result');

// No output
const r4 = formatPythonResponse({ stdout: '', result: 'None', figures: [] });
assert(r4 === '(no output)', 'Returns (no output) sentinel when silent');

// Figures generated
const r5 = formatPythonResponse({ stdout: 'Plot created.', result: 'None', figures: ['base64png_data_1', 'base64png_data_2'] });
assert(r5.includes('[2 Matplotlib figure(s) generated and displayed]'), 'Appends figure count summary when plots are generated');

console.log(`\n================================================================`);
console.log(`TOTAL: ${passed} passed, ${failed} failed.`);
console.log(`================================================================\n`);

if (failed > 0) process.exit(1);
process.exit(0);
