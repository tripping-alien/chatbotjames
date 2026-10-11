// Run with: node tests/test-prompt-tiers.js
import { MODEL_PRESETS, rankAutoPresets } from '../workers/worker-presets.js';
import { systemPrompt as FULL } from '../workers/worker-system-prompt.js';
import { getPromptTier, buildSystemPrompt, selectTools, LITE_PROMPT } from '../workers/worker-prompt-tiers.js';

let failed = 0;
const check = (name, cond, extra = '') => {
    if (cond) console.log(`PASS: ${name}`);
    else { console.error(`FAIL: ${name} ${extra}`); failed++; }
};
const user = (content) => [{ role: 'user', content }];
const byId = (id) => MODEL_PRESETS.find(p => p.id === id);
// Rough estimate: ~3.5 chars per token for this kind of text.
const tok = (s) => Math.round(s.length / 3.5);

// --- tier selection ---------------------------------------------------------
const phone = { isMobile: true, isTV: false };
const tv = { isMobile: false, isTV: true };
const desktop = { isMobile: false, isTV: false };
const integratedGpuDesktop = { isMobile: false, isTV: false, isIntegrated: true };

check('lite preset -> lite', getPromptTier(byId('lite-smollm-135m-q4'), phone) === 'lite');
check('360M -> lite', getPromptTier(byId('cpu-smollm-360m-q8'), desktop) === 'lite');
check('0.5B -> compact', getPromptTier(byId('gpu-qwen25-05b-q4f16'), desktop) === 'compact');
check('1.5B desktop -> compact', getPromptTier(byId('gpu-qwen25-15b-q4f16'), desktop) === 'compact');
check('3B desktop -> full', getPromptTier(byId('gpu-llama32-3b-q4f16'), desktop) === 'full');
check('3B on integrated GPU -> compact', getPromptTier(byId('gpu-llama32-3b-q4f16'), integratedGpuDesktop) === 'compact');
check('3B on phone -> compact', getPromptTier(byId('gpu-llama32-3b-q4f16'), phone) === 'compact');
check('3B on TV -> compact', getPromptTier(byId('gpu-llama32-3b-q4f16'), tv) === 'compact');
check('no preset -> compact', getPromptTier(null, desktop) === 'compact');

// The model auto-selected on phone/TV must NOT get the full prompt.
const autoOnPhone = rankAutoPresets({ hasGpu: false }, 4, true, null)[0];
check('auto preset on constrained device exists', !!autoOnPhone);
check('auto preset on constrained device gets lite', getPromptTier(autoOnPhone, phone) === 'lite');

// Auto preset on integrated GPU desktop must NOT auto-select a 3B+ model
const autoOnIntegrated = rankAutoPresets({ hasGpu: true, isIntegrated: true }, 8, false, null)[0];
check('auto preset on integrated GPU exists', !!autoOnIntegrated);
check('auto preset on integrated GPU is <= 1.7B', (autoOnIntegrated.params || 0) <= 1.7);
check('auto preset on desktop with dedicated GPU picks 3B+', (rankAutoPresets({ hasGpu: true }, 8, false, null)[0]?.params || 0) >= 3.0);


// --- size budgets -----------------------------------------------------------
console.log(`\nfull prompt   ~${tok(FULL)} tokens (${FULL.length} chars)`);
console.log(`lite prompt   ~${tok(LITE_PROMPT)} tokens (${LITE_PROMPT.length} chars)`);

check('lite prompt is tiny', tok(LITE_PROMPT) < 100);
check('compact, plain chat <= 100 tokens', tok(buildSystemPrompt('compact', user('hello there'))) <= 100);

// worst case: a message that matches many tools still gets capped at 4
const worst = user('python script: calculate weather in Tokyo, roll a dice, convert 5 miles to km, my name is Alex');
const worstPrompt = buildSystemPrompt('compact', worst);
console.log(`compact worst ~${tok(worstPrompt)} tokens`);
check('compact worst case <= 450 tokens', tok(worstPrompt) <= 450);
check('compact worst case is >= 6x smaller than full', tok(worstPrompt) * 6 <= tok(FULL));
check('tool cap respected', selectTools(worst).length <= 4);

// --- tool gating ------------------------------------------------------------
const names = (text, msgs) => selectTools(msgs || user(text)).map(t => t.name);
for (const chat of ['how are you today', 'tell me a joke', 'what is the capital of France', 'hello there', 'thanks, that helped']) {
    check(`plain chat "${chat}" -> no tools`, names(chat).length === 0, JSON.stringify(names(chat)));
}
check('web_search still fires for news', names('what is the latest news').includes('web_search'));
check('weather', names('Weather in Paris?').includes('weather'));
check('calculator', names('calculate 25 * 43').includes('calculator'));
check('currency', names('convert 100 USD to EUR').includes('currency'));
check('timer', names('set a timer for 5 minutes').includes('timer'));
check('write_note', names('hey, my name is Alex').includes('write_note'));
check('chess starts both game tools', ['start_game'].every(n => names("let's play chess").includes(n)));
check('url -> fetch_page', names('read this page https://example.com').includes('fetch_page'));

// sticky: during a game the user just types a move
const gameHistory = [
    { role: 'user', content: "let's play chess" },
    { role: 'assistant', content: '```tool:run\n{"tool":"start_game","params":{"game":"chess","ai_color":"white"}}\n```' },
    { role: 'system', content: '[Tool Result: start_game] started' },
    { role: 'user', content: 'e5' },
];
check('active game keeps game tools for bare "e5"', names('', gameHistory).includes('start_game'));

// pasted file contents must not trigger tools
const withFile = user('summarise this\n\n[Attached Files Content]:\n' + 'python weather chess '.repeat(200));
check('attachment text ignored for tool matching', names('', withFile).length === 0);

// --- output format ----------------------------------------------------------
const wp = buildSystemPrompt('compact', user('Weather in Tokyo?'));
check('compact prompt keeps the tool:run fence format', wp.includes('```tool:run'));
check('compact prompt lists weather()', wp.includes('weather(location)'));
check('full tier returns the original prompt untouched', buildSystemPrompt('full', user('x')) === FULL);

console.log(failed === 0 ? '\nALL PASSED' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
