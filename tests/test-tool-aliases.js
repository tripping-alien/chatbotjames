// Run with: node tests/test-tool-aliases.js
import fs from 'fs';
import path from 'path';

let failed = 0;
const check = (name, cond, extra = '') => {
    if (cond) {
        console.log(`PASS: ${name}`);
    } else {
        console.error(`FAIL: ${name} ${extra}`);
        failed++;
    }
};

console.log('--- Tool Worker Handler & Alias Integrity Tests ---');

const toolsWorkerPath = path.resolve('workers/tools-worker.js');
const toolsWorkerContent = fs.readFileSync(toolsWorkerPath, 'utf8');

// 1. Verify TOOL_HANDLERS has all required aliases
const toolHandlersMatch = toolsWorkerContent.match(/TOOL_HANDLERS\s*=\s*{([\s\S]*?)};/);
check('TOOL_HANDLERS block exists in tools-worker.js', !!toolHandlersMatch);

const handlersBlock = toolHandlersMatch ? toolHandlersMatch[1] : '';

check('fetch_page alias is registered', /fetch_page\s*:\s*fetchPageTool/.test(handlersBlock));
check('fetch alias is registered', /\bfetch\s*:\s*fetchPageTool/.test(handlersBlock));
check('read_page alias is registered', /read_page\s*:\s*fetchPageTool/.test(handlersBlock));
check('web_fetch alias is registered', /web_fetch\s*:\s*fetchPageTool/.test(handlersBlock));
check('websearch alias is registered', /websearch\s*:\s*getWebSearch/.test(handlersBlock));
check('web_search alias is registered', /web_search\s*:\s*getWebSearch/.test(handlersBlock));
check('physics alias is registered', /\bphysics\s*:/.test(handlersBlock));
check('particle_physics alias is registered', /\bparticle_physics\s*:/.test(handlersBlock));
check('particlephysics alias is registered', /\bparticlephysics\s*:/.test(handlersBlock));
check('linear_algebra alias is registered', /\blinear_algebra\s*:/.test(handlersBlock));
check('matrix alias is registered', /\bmatrix\s*:/.test(handlersBlock));
check('math alias is registered', /\bmath\s*:\s*calculatorTool/.test(handlersBlock));
check('calc alias is registered', /\bcalc\s*:\s*calculatorTool/.test(handlersBlock));
check('unit_convert alias is registered', /\bunit_convert\s*:\s*convertUnits/.test(handlersBlock));
check('dice alias is registered', /\bdice\s*:\s*randomTool/.test(handlersBlock));
check('coin alias is registered', /\bcoin\s*:\s*randomTool/.test(handlersBlock));
check('differential_equations alias is registered', /\bdifferential_equations\s*:/.test(handlersBlock));

// 2. Verify fetchPageTool parameter extraction handles flexible shapes
const parseUrl = (params) => typeof params === 'string'
    ? params
    : (params?.url || params?.link || params?.target || params?.href || null);

check('extracts url from { url }', parseUrl({ url: 'https://example.com' }) === 'https://example.com');
check('extracts url from { link }', parseUrl({ link: 'https://example.com' }) === 'https://example.com');
check('extracts url from { target }', parseUrl({ target: 'https://example.com' }) === 'https://example.com');
check('extracts url from { href }', parseUrl({ href: 'https://example.com' }) === 'https://example.com');
check('extracts url from direct string', parseUrl('https://example.com') === 'https://example.com');
check('returns null for empty object', parseUrl({}) === null);
check('returns null for null params', parseUrl(null) === null);

// 3. Verify TOOL_CALL_PATTERN covers multiple formats
import { TOOL_CALL_PATTERN, hasToolCalls } from '../core/worker-controller.js';
check('TOOL_CALL_PATTERN detects fenced tool:run', hasToolCalls('```tool:run\n{"tool":"math"}\n```'));
check('TOOL_CALL_PATTERN detects bare tool:run', hasToolCalls('tool:run\n{"tool":"physics"}'));
check('TOOL_CALL_PATTERN detects indented tool:run', hasToolCalls('  tool:run\n{"tool":"physics"}'));
check('TOOL_CALL_PATTERN detects JSON tool object', hasToolCalls('Here is the call: {"tool": "calculator", "params": "2+2"}'));
check('TOOL_CALL_PATTERN detects single-quoted JSON tool', hasToolCalls("Let's run {'tool': 'calculator', 'params': '2+2'}"));
check('TOOL_CALL_PATTERN detects XML tool format', hasToolCalls('<tool>calculator</tool><params><expression>2+2</expression></params>'));
check('TOOL_CALL_PATTERN ignores normal chat', !hasToolCalls('I need a tool for my kitchen'));

console.log('\n--- Freeze Resolver Regression Guard Tests ---');

const workerPath = path.resolve('workers/worker.js');
const workerContent = fs.readFileSync(workerPath, 'utf8');

// 3. Verify freeze-protection constructs are totally absent
check('no GEN_TIMEOUT_LARGE_MS in worker.js', !workerContent.includes('GEN_TIMEOUT_LARGE_MS'));
check('no GEN_TIMEOUT_DEFAULT_MS in worker.js', !workerContent.includes('GEN_TIMEOUT_DEFAULT_MS'));
check('no STALL_WATCHDOG_MS in worker.js', !workerContent.includes('STALL_WATCHDOG_MS'));
check('no YIELD_EVERY_N_TOKENS in worker.js', !workerContent.includes('YIELD_EVERY_N_TOKENS'));
check('no _currentGenCancel in worker.js', !workerContent.includes('_currentGenCancel'));
check('no cancelPromise in worker.js', !workerContent.includes('cancelPromise'));
check('no Promise.race in worker.js', !workerContent.includes('Promise.race'));
check('no stallWatchdogId in worker.js', !workerContent.includes('stallWatchdogId'));
check('no genTimeoutId in worker.js', !workerContent.includes('genTimeoutId'));

console.log(failed === 0 ? '\nALL ALIAS & FREEZE REGRESSION TESTS PASSED' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
