// worker-prompt-tiers.js
//
// The full system prompt (worker-system-prompt.js) is ~11 KB / ~3K tokens: 30+ tool
// signatures, ~40 worked examples and the Python debugging rules. That is fine for
// 3B+ models, but small models have a 2048-token budget in worker.js, so on mobile/TV
// (which auto-select SmolLM2 135M) the prompt alone used up the whole context.
//
// Tiers:
//   lite     < 0.5B params, or any "lite-*" preset  -> persona only, NO tools (~50 tokens)
//   compact  0.5B-3B, or any phone/TV device        -> short persona + only the tools the
//                                                      current message could need (~100-300 tokens)
//   full     3B+ on desktop                          -> the original prompt, unchanged

import { systemPrompt as FULL_PROMPT } from './worker-system-prompt.js';

const FENCE = '`'.repeat(3);
const MAX_TOOLS = 4;            // hard cap on tools shown to a compact model per message
const LAST_USER_SCAN_CHARS = 500; // only look at the start of the user's message
const RECENT_MESSAGES = 8;      // window used for "sticky" tools (active game, Python session)

export const LITE_PROMPT =
    'You are JAMES, a friendly AI assistant running privately in the user\'s browser. ' +
    'Answer in plain language, in 1-3 short sentences unless asked for more. ' +
    'If you are not sure, say so.';

const COMPACT_BASE =
    'You are JAMES, a helpful AI assistant running privately in the user\'s browser. ' +
    'Keep replies plain and concise, and use few emojis.';

const call = (tool, params) => `${FENCE}tool:run\n${JSON.stringify({ tool, params })}\n${FENCE}`;

// Each entry: the tool lines to show, a trigger regex for the latest user message,
// an optional "sticky" regex tested against recent history (keeps a game / Python session
// working when the user's next message is just "e5" or "now plot it"), and one example.
// Order matters: when more than MAX_TOOLS match, earlier (more specific) entries win.
const CATALOG = [
    {
        name: 'start_game',
        re: /\b(chess|checkers|draughts|play a game|let'?s play)\b/i,
        sticky: /\b(start_game|make_move)\b/,
        lines: [
            '- start_game(game, ai_color): game is "chess" or "checkers". Call it immediately when the user wants to play.',
            '- make_move(move): your move during an active game. SAN ("e4") for chess, numeric ("11-15") for checkers. Never ask the user for your move.',
        ],
        ex: ['Let\'s play chess', 'start_game', { game: 'chess', ai_color: 'white' }],
    },
    {
        name: 'eval_python',
        re: /\b(python|script|run (this |the )?code|pandas|numpy|matplotlib|pyodide|pip install)\b|```/i,
        sticky: /\b(eval_python|pip_install)\b/,
        lines: [
            '- eval_python(code): run Python in a persistent session. Use print() to show values. If it errors, fix the code and call it again.',
            '- pip_install(packages): call before importing anything outside the standard library.',
        ],
        ex: ['Run python to print hello', 'eval_python', { code: 'print("Hello, World!")' }],
    },
    {
        name: 'physics',
        re: /\b(lorentz|photon|de ?broglie|compton|photoelectric|rest energy|relativistic|uncertainty principle|half-?life|particle physics)\b/i,
        lines: ['- physics(mode, ...params): modes lorentz_factor, rest_energy, relativistic_energy, relativistic_momentum, energy_momentum_relation, debroglie, compton, photoelectric, decay, uncertainty.'],
        ex: ['Lorentz factor at 0.9c?', 'physics', { mode: 'lorentz_factor', beta: 0.9 }],
    },
    {
        name: 'relativity',
        re: /\b(relativity|time dilation|length contraction|schwarzschild|black hole|velocity addition|doppler|lorentz boost)\b/i,
        lines: ['- relativity(mode, ...params): modes time_dilation, length_contraction, velocity_addition, lorentz_boost, doppler, schwarzschild_radius, gravitational_time_dilation.'],
        ex: ['Time dilation at 0.8c for 10 s?', 'relativity', { mode: 'time_dilation', beta: 0.8, proper_time_s: 10 }],
    },
    {
        name: 'linalg',
        re: /\b(matri(x|ces)|eigen\w*|determinant|linear algebra|dot product|cross product|transpose|inverse of)\b/i,
        lines: ['- linalg(mode, A?, B?, b?, v?, w?): modes multiply, determinant, inverse, eigenvalues, solve, transpose, rank, dot, cross, norm, trace. Matrices are 2D JSON arrays, vectors 1D arrays.'],
        ex: ['Eigenvalues of [[4,1],[2,3]]', 'linalg', { mode: 'eigenvalues', A: [[4, 1], [2, 3]] }],
    },
    {
        name: 'diffeq',
        re: /\b(differential equation|diff ?eq|ode|runge|rk4|euler method|dy\/dx|y'')/i,
        lines: ['- diffeq(mode, ...params): modes euler, rk4, system_rk4 (f as a math string like "x*y"), second_order_const (a, b, c, y0, yp0), linear_first_order (P, Q, y0).'],
        ex: ['RK4 for dy/dx = x*y, y(0)=1 to x=2', 'diffeq', { mode: 'rk4', f: 'x*y', x0: 0, y0: 1, x_end: 2, steps: 100 }],
    },
    {
        name: 'weather',
        re: /\b(weather|forecast|temperature outside|rain(ing)?|snow(ing)?|umbrella)\b/i,
        lines: ['- weather(location): current conditions and forecast.'],
        ex: ['Weather in Tokyo?', 'weather', { location: 'Tokyo' }],
    },
    {
        name: 'location',
        re: /\b(where am i|my location|my coordinates|near me|nearby)\b/i,
        lines: ['- location(): the user\'s current coordinates.'],
        ex: ['Where am I?', 'location', {}],
    },
    {
        name: 'time',
        re: /\bwhat time\b|\btime (is it|in)\b|\bcurrent time\b|\btime ?zone\b/i,
        lines: ['- time(timezone): current time; timezone like "Asia/Tokyo" or "local".'],
        ex: ['What time is it in Tokyo?', 'time', { timezone: 'Asia/Tokyo' }],
    },
    {
        name: 'date',
        re: /\b(today'?s date|what('s| is) the date|what day (is|was)|days (between|since)|date diff\w*)\b/i,
        lines: ['- date(action, date?, date2?): action is "now", "diff", "convert" or "parse".'],
        ex: ['What\'s the date now?', 'date', { action: 'now' }],
    },
    {
        name: 'countdown',
        re: /\b(countdown|how many days (until|till|to)|days (until|left))\b/i,
        lines: ['- countdown(target): time remaining until a future date or event.'],
        ex: ['How many days until Christmas?', 'countdown', { target: 'Christmas' }],
    },
    {
        name: 'timer',
        re: /\b(timer|remind me in)\b/i,
        lines: ['- timer(seconds, label): start a countdown timer.'],
        ex: ['Timer for 5 minutes for pasta', 'timer', { seconds: 300, label: 'pasta' }],
    },
    {
        name: 'currency',
        re: /\b(usd|eur|gbp|jpy|ils|cad|aud|chf|cny|dollars?|euros?|yen|shekels?|exchange rate|currency)\b/i,
        lines: ['- currency(from, to, amount): live exchange rates; use 3-letter codes.'],
        ex: ['Convert 100 USD to EUR', 'currency', { from: 'USD', to: 'EUR', amount: 100 }],
    },
    {
        name: 'convert',
        re: /\bconvert\b|\b(to|in) (km|kilometers?|miles?|kg|lbs?|pounds?|meters?|feet|inches|cm|liters?|gallons?|celsius|fahrenheit)\b/i,
        lines: ['- convert(amount, from, to): length, weight, temperature, volume, etc.'],
        ex: ['Convert 5 miles to km', 'convert', { amount: 5, from: 'miles', to: 'km' }],
    },
    {
        name: 'calculator',
        re: /\b(calculate|calc|compute|sqrt|square root|percent(age)? of)\b|\d\s*[+\-*/^x\u00d7\u00f7]\s*\d/i,
        lines: ['- calculator(expression): exact math. Use it instead of doing arithmetic yourself.'],
        ex: ['Calculate 25 * 43', 'calculator', { expression: '25 * 43' }],
    },
    {
        name: 'random',
        re: /\b(roll|dice|die|d\d+|coin|flip a|random number|pick a number)\b/i,
        lines: ['- random(mode, count?, sides?, min?, max?): mode is "coin", "dice" or "range".'],
        ex: ['Roll a dice', 'random', { mode: 'dice', count: 1, sides: 6 }],
    },
    {
        name: 'uuid',
        re: /\b(uuid|guid)\b/i,
        lines: ['- uuid(count): generate v4 UUIDs.'],
        ex: ['Generate a UUID', 'uuid', { count: 1 }],
    },
    {
        name: 'password',
        re: /\b(generate|create|make|give me)\b.*\bpassword\b|\b(random|secure|strong) password\b/i,
        lines: ['- password(length, count): generate secure random passwords.'],
        ex: ['Generate a 16 char password', 'password', { length: 16, count: 1 }],
    },
    {
        name: 'hash',
        re: /\b(hash|sha-?(1|256|512)|checksum)\b/i,
        lines: ['- hash(algorithm, value): algorithm is "sha1", "sha256" or "sha512".'],
        ex: ['Hash "secret" with sha256', 'hash', { algorithm: 'sha256', value: 'secret' }],
    },
    {
        name: 'base64',
        re: /\bbase ?64\b/i,
        lines: ['- base64(mode, value): mode is "encode" or "decode".'],
        ex: ['Encode "hello" to base64', 'base64', { mode: 'encode', value: 'hello' }],
    },
    {
        name: 'palette',
        re: /\b(palette|colou?r scheme)\b/i,
        lines: ['- palette(base, scheme, count): generate color palettes.'],
        ex: ['Color palette based on red', 'palette', { base: 'red', scheme: 'monochromatic', count: 5 }],
    },
    {
        name: 'color',
        re: /#[0-9a-f]{3,6}\b|\b(rgb|hex colou?r|colou?r code)\b/i,
        lines: ['- color(mode, hex?, r?, g?, b?): mode is "hex" or "rgb".'],
        ex: ['What color is #34A85A?', 'color', { mode: 'hex', hex: '#34A85A' }],
    },
    {
        name: 'ascii_art',
        re: /\bascii\b/i,
        lines: ['- ascii_art(text, font): ASCII text banners.'],
        ex: ['ASCII art for "cool"', 'ascii_art', { text: 'cool', font: 'standard' }],
    },
    {
        name: 'sprite',
        re: /\b(sprite|pixel art|avatar)\b/i,
        lines: ['- sprite(seed?, grid_size?, symmetry?, color?, bg_color?): retro pixel-art avatar.'],
        ex: ['Make me a pixel avatar', 'sprite', {}],
    },
    {
        name: 'ip',
        re: /\b(ip address|my ip|ip lookup|whois)\b/i,
        lines: ['- ip(target): IP info; pass "self" for the user.'],
        ex: ['What is my IP address?', 'ip', { target: 'self' }],
    },
    {
        name: 'clipboard',
        re: /\b(clipboard|what did i (just )?copy)\b/i,
        lines: ['- clipboard(): read the text the user copied.'],
        ex: ['What did I just copy?', 'clipboard', {}],
    },
    {
        name: 'fetch_page',
        re: /https?:\/\/\S+|\b(read|open|summari[sz]e) (this|that) (page|link|site|url)\b/i,
        lines: ['- fetch_page(url): read the full content of a webpage.'],
        ex: ['Read this page https://example.com', 'fetch_page', { url: 'https://example.com' }],
    },
    {
        name: 'search',
        re: /\b(my notes|local index|offline (search|index))\b/i,
        lines: ['- search(query): search the local offline knowledge index.'],
        ex: ['Search local index for my notes', 'search', { query: 'my notes' }],
    },
    {
        name: 'write_note',
        re: /\b(my name is|call me|i am|i'm|i live|i work|i was born|my (age|job|birthday|favou?rite)|remember that)\b/i,
        lines: ['- write_note(note): silently save a fact the user shared about themselves (name, age, location, job...). Do this without mentioning it.'],
        ex: ['Hey, my name is Alex', 'write_note', { note: 'User\'s name is Alex' }],
    },
    // Generic lookups last so specific tools above win the MAX_TOOLS cap.
    {
        name: 'wikipedia',
        re: /\b(wikipedia|wiki|who (is|was)|tell me about|history of|biography)\b/i,
        lines: ['- wikipedia(query): factual encyclopedia summaries.'],
        ex: ['What is quantum mechanics?', 'wikipedia', { query: 'quantum mechanics' }],
    },
    {
        name: 'web_search',
        re: /\b(news|latest|headlines?|search (the )?(web|online|for)|look ?up|google|price of|who won|score of|current (events|price|president|ceo))\b|\bwhat'?s (happening|going on)\b/i,
        lines: ['- web_search(query): current events, news and live facts.'],
        ex: ['Search the web for news', 'web_search', { query: 'news' }],
    },
];

/** Which catalog entries could the latest user message need? (max MAX_TOOLS) */
export function selectTools(messages = [], max = MAX_TOOLS) {
    let lastUser = '';
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i]?.role === 'user') { lastUser = String(messages[i].content || ''); break; }
    }
    // app.js appends attached file contents after this marker; never match tools against them.
    lastUser = lastUser.split('[Attached Files Content]')[0].slice(0, LAST_USER_SCAN_CHARS);
    const recent = messages.slice(-RECENT_MESSAGES).map(m => String(m?.content || '')).join('\n');

    const picked = [];
    for (const entry of CATALOG) {
        if (picked.length >= max) break;
        if (entry.re.test(lastUser) || (entry.sticky && entry.sticky.test(recent))) picked.push(entry);
    }
    return picked;
}

export function buildCompactPrompt(messages = []) {
    const tools = selectTools(messages);
    if (tools.length === 0) return COMPACT_BASE;

    const toolLines = tools.flatMap(t => t.lines).join('\n');
    const examples = tools
        .map(t => `User: "${t.ex[0]}"\n-> ${call(t.ex[1], t.ex[2])}`)
        .join('\n\n');

    return [
        COMPACT_BASE,
        'Only call a tool when the request truly needs it; otherwise just answer. Never invent tool names.',
        `TOOLS:\n${toolLines}`,
        `To call a tool, reply with ONLY a block like this:\n${call('tool_name', { key: 'value' })}`,
        `EXAMPLES:\n${examples}`,
    ].join('\n\n');
}

/** Pick a tier from the loaded preset and the device class. */
export function getPromptTier(preset, { isMobile = false, isTV = false } = {}) {
    if (!preset) return 'compact'; // unknown model: be safe
    const params = typeof preset.params === 'number' ? preset.params : 1;
    if (String(preset.id || '').startsWith('lite-') || params < 0.5) return 'lite';
    if (isMobile || isTV || params < 3.0) return 'compact';
    return 'full';
}

export function buildSystemPrompt(tier, messages = []) {
    if (tier === 'lite') return LITE_PROMPT;
    if (tier === 'compact') return buildCompactPrompt(messages);
    return FULL_PROMPT;
}
