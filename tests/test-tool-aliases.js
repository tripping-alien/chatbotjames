// Run with: node tests/test-tool-aliases.js
import { TOOL_HANDLERS } from '../workers/tools-worker.js';

let failed = 0;
const check = (name, cond, extra = '') => {
    if (cond) {
        console.log(`PASS: ${name}`);
    } else {
        console.error(`FAIL: ${name} ${extra}`);
        failed++;
    }
};

console.log('--- Tool Handler Aliases Tests ---');

// 1. fetch aliases exist and map to the same handler
check('fetch handler is registered', typeof TOOL_HANDLERS.fetch === 'function');
check('fetch_page handler is registered', typeof TOOL_HANDLERS.fetch_page === 'function');
check('read_page handler is registered', typeof TOOL_HANDLERS.read_page === 'function');
check('web_fetch handler is registered', typeof TOOL_HANDLERS.web_fetch === 'function');

check('fetch and fetch_page share the same handler', TOOL_HANDLERS.fetch === TOOL_HANDLERS.fetch_page);
check('fetch and read_page share the same handler', TOOL_HANDLERS.fetch === TOOL_HANDLERS.read_page);
check('fetch and web_fetch share the same handler', TOOL_HANDLERS.fetch === TOOL_HANDLERS.web_fetch);

// 2. web search aliases
check('websearch handler is registered', typeof TOOL_HANDLERS.websearch === 'function');
check('web_search handler is registered', typeof TOOL_HANDLERS.web_search === 'function');
check('websearch and web_search share handler', TOOL_HANDLERS.websearch === TOOL_HANDLERS.web_search);

// 3. fetch parameter extraction (testing missing param throws)
let threwMissing = false;
try {
    await TOOL_HANDLERS.fetch({});
} catch (err) {
    threwMissing = err.message.includes('requires a url parameter');
}
check('calling fetch with missing params throws helpful error', threwMissing);

let threwNull = false;
try {
    await TOOL_HANDLERS.fetch(null);
} catch (err) {
    threwNull = err.message.includes('requires a url parameter');
}
check('calling fetch with null params throws helpful error', threwNull);

// 4. UUID generator
const u1 = await TOOL_HANDLERS.uuid({ count: 1 });
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
check('uuid generator returns valid UUID v4', Array.isArray(u1.uuids) && uuidRegex.test(u1.uuids[0]));

const u3 = await TOOL_HANDLERS.uuid({ count: 3 });
check('uuid generator returns requested count', u3.uuids?.length === 3);

// 5. Password generator
const pw = await TOOL_HANDLERS.password({ length: 20 });
check('password generator respects length', typeof pw.password === 'string' && pw.password.length === 20);

// 6. Base64 encode & decode
const b64enc = await TOOL_HANDLERS.base64({ mode: 'encode', value: 'chatbotjames' });
check('base64 encode', b64enc.result === Buffer.from('chatbotjames').toString('base64'));

const b64dec = await TOOL_HANDLERS.base64({ mode: 'decode', value: 'Y2hhdGJvdGphbWVz' });
check('base64 decode', b64dec.result === 'chatbotjames');

// 7. Calculator tool
const c1 = await TOOL_HANDLERS.calculator({ expr: '25 * 4' });
check('calculator tool evaluates multiplication', c1.result === 100);

const c2 = await TOOL_HANDLERS.calculator({ expr: '2^8' });
check('calculator tool evaluates exponentiation', c2.result === 256);

// 8. Scientific calculation routes in TOOL_HANDLERS
check('physics tool handler is registered', typeof TOOL_HANDLERS.physics === 'function');
check('relativity tool handler is registered', typeof TOOL_HANDLERS.relativity === 'function');
check('linalg tool handler is registered', typeof TOOL_HANDLERS.linalg === 'function');
check('diffeq tool handler is registered', typeof TOOL_HANDLERS.diffeq === 'function');

const physResult = await TOOL_HANDLERS.physics({ mode: 'lorentz_factor', beta: 0.6 });
check('physics tool routed lorentz_factor', physResult.gamma === 1.25);

console.log(failed === 0 ? '\nALL TOOL ALIASES & HANDLER TESTS PASSED' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
