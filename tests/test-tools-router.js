// Run with: node tests/test-tools-router.js
import { toolRouter, ALL_RULES } from '../tools/router.js';

let failed = 0;
const check = (name, cond, extra = '') => {
    if (cond) {
        console.log(`PASS: ${name}`);
    } else {
        console.error(`FAIL: ${name} ${extra}`);
        failed++;
    }
};

console.log('--- Tool Router Matching Tests ---');

// 1. fetch_page
const fp1 = toolRouter.match('fetch https://example.com');
check('fetch url matches fetch_page', fp1?.tool === 'fetch_page' && fp1?.params?.url === 'https://example.com');

const fp2 = toolRouter.match('fetch page https://example.com');
check('fetch page url matches fetch_page', fp2?.tool === 'fetch_page' && fp2?.params?.url === 'https://example.com');

const fp3 = toolRouter.match('read url https://github.com');
check('read url matches fetch_page', fp3?.tool === 'fetch_page' && fp3?.params?.url === 'https://github.com');

// 2. calculator
const calc1 = toolRouter.match('calculate 15 + 27');
check('calculate arithmetic', calc1?.tool === 'calculator' && calc1?.params?.result === 42);

const calc2 = toolRouter.match('what is 100 / 4');
check('what is arithmetic', calc2?.tool === 'calculator' && calc2?.params?.result === 25);

// 3. weather
const w1 = toolRouter.match('weather in Tokyo');
check('weather in city', w1?.tool === 'weather' && /tokyo/i.test(w1?.params?.location || ''));

const w2 = toolRouter.match('what is the forecast for Paris');
check('forecast for city', w2?.tool === 'weather');

// 4. currency
const cur1 = toolRouter.match('convert 100 USD to EUR');
check('currency conversion 100 USD to EUR', cur1?.tool === 'currency' && cur1?.params?.from === 'USD' && cur1?.params?.to === 'EUR');

// 5. time
const t1 = toolRouter.match('what time is it in Tokyo');
check('time in timezone/city', t1?.tool === 'time');

// 6. random (coin / dice / range)
const rnd1 = toolRouter.match('flip a coin');
check('flip coin', rnd1?.tool === 'random' && rnd1?.params?.mode === 'coin');

const rnd2 = toolRouter.match('roll 2d6');
check('roll 2d6 dice', rnd2?.tool === 'random' && rnd2?.params?.mode === 'dice' && rnd2?.params?.count === 2 && rnd2?.params?.sides === 6);

const rnd3 = toolRouter.match('random number 1 to 100');
check('random range', rnd3?.tool === 'random' && rnd3?.params?.mode === 'range' && rnd3?.params?.min === 1 && rnd3?.params?.max === 100);

// 7. uuid
const u1 = toolRouter.match('generate a uuid');
check('generate uuid', u1?.tool === 'uuid' && u1?.params?.count === 1);

const u2 = toolRouter.match('create 5 uuids');
check('create multiple uuids', u2?.tool === 'uuid' && u2?.params?.count === 5);

// 8. password
const pw1 = toolRouter.match('generate a password');
check('generate password default', pw1?.tool === 'password' && pw1?.params?.length === 16);

const pw2 = toolRouter.match('create a 24-character password');
check('create 24-character password', pw2?.tool === 'password' && pw2?.params?.length === 24);

const pw3 = toolRouter.match('password no symbols');
check('password no symbols flag', pw3?.tool === 'password' && pw3?.params?.symbols === false);

// 9. timer
const tm1 = toolRouter.match('set a timer for 10 minutes');
check('timer 10 minutes (600s)', tm1?.tool === 'timer' && tm1?.params?.seconds === 600);

const tm2 = toolRouter.match('start a 30-second timer');
check('timer 30 seconds', tm2?.tool === 'timer' && tm2?.params?.seconds === 30);

// 10. countdown
const cd1 = toolRouter.match('how many days until Christmas');
check('countdown to event', cd1?.tool === 'countdown' && /christmas/i.test(cd1?.params?.target || ''));

// 11. base64
const b64e = toolRouter.match('base64 encode hello world');
check('base64 encode', b64e?.tool === 'base64' && b64e?.params?.mode === 'encode' && b64e?.params?.value === 'hello world');

const b64d = toolRouter.match('base64 decode aGVsbG8=');
check('base64 decode', b64d?.tool === 'base64' && b64d?.params?.mode === 'decode' && b64d?.params?.value === 'aGVsbG8=');

// 12. color
const col1 = toolRouter.match('color #ff5733');
check('color hex match', col1?.tool === 'color' && col1?.params?.mode === 'hex' && col1?.params?.hex === 'ff5733');

const col2 = toolRouter.match('rgb 255 87 51');
check('color rgb match', col2?.tool === 'color' && col2?.params?.mode === 'rgb' && col2?.params?.r === 255);

// 13. ip
const ip1 = toolRouter.match('what is my ip');
check('my ip lookup', ip1?.tool === 'ip' && ip1?.params?.target === 'self');

const ip2 = toolRouter.match('ip info 8.8.8.8');
check('target ip lookup', ip2?.tool === 'ip' && ip2?.params?.target === '8.8.8.8');

// 14. help
const h1 = toolRouter.match('show commands');
check('help show commands', h1?.tool === 'help');

const h2 = toolRouter.match('show commands weather');
check('help specific tool', h2?.tool === 'help' && h2?.params?.toolName === 'weather');

// 15. Plain conversational chat must NOT trigger any tool
const plainChats = [
    'hello there',
    'how are you doing today?',
    'tell me a funny story about cats',
    'what is your favorite movie?',
    'thanks for your help'
];
for (const pc of plainChats) {
    check(`plain chat "${pc}" returns null`, toolRouter.match(pc) === null);
}

// 16. Router API tests
check('toolRouter.tools returns non-empty list of unique tools', Array.isArray(toolRouter.tools) && toolRouter.tools.length > 10);
check('toolRouter.describe returns description', toolRouter.describe('weather').includes('weather'));

// 17. Lenient JSON block repair (handles unquoted keys from LLMs)
const parseLenientTool = (raw) => {
    try {
        return JSON.parse(raw);
    } catch {
        const repaired = raw
            .replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":')
            .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"')
            .replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(repaired);
    }
};

const brokenCall1 = '{"tool":"physics","params":{"mode":"energy_momentum_relation",m:0.511,"p":0}}';
const parsed1 = parseLenientTool(brokenCall1);
check('relaxed JSON repairs unquoted keys (m:0.511)', parsed1.tool === 'physics' && parsed1.params.m === 0.511 && parsed1.params.p === 0);

const brokenCall2 = '{"tool":"physics","params":{"mode":"relativistic_momentum",m:0.511,"v":0.9}}';
const parsed2 = parseLenientTool(brokenCall2);
check('relaxed JSON repairs unquoted keys (m:0.511, v:0.9)', parsed2.tool === 'physics' && parsed2.params.m === 0.511 && parsed2.params.v === 0.9);

console.log(failed === 0 ? '\nALL TOOL ROUTER TESTS PASSED' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
