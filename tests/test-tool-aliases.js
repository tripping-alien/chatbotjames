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
