// Run with: node tests/test-all-tools.js
import { TOOL_HANDLERS } from '../workers/tools-worker.js';
import { handleToolCall } from '../tools/tools-bridge.js';
import { generateSprite } from '../tools/tools-art.js';
import { evalMath, cleanTail, safeInt } from '../tools/utils.js';

let failed = 0;
const check = (name, cond, extra = '') => {
    if (cond) {
        console.log(`PASS: ${name}`);
    } else {
        console.error(`FAIL: ${name} ${extra}`);
        failed++;
    }
};

const approxEq = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;

console.log('--- Unit Tests for All JAMES Tools ---');

// ============================================================================
// 1. TOOL REGISTRATION & ALIAS INTEGRITY
// ============================================================================
const expectedTools = [
    'calculator', 'math', 'calc',
    'convert', 'unit_convert', 'unit_converter', 'conversion',
    'random', 'dice', 'coin',
    'date', 'time', 'countdown',
    'base64', 'hash', 'uuid', 'password',
    'color', 'palette', 'sprite',
    'file', 'search', 'index', 'help',
    'web_search', 'websearch', 'duckduckgo', 'duckduckgo_search', 'ddg', 'ddg_search', 'google', 'google_search', 'bing', 'bing_search',
    'fetch_page', 'fetch', 'read_page', 'web_fetch',
    'weather', 'wikipedia', 'currency', 'ip', 'ascii_art',
    'physics', 'particle_physics', 'particlephysics',
    'relativity', 'linalg', 'linear_algebra', 'matrix',
    'diffeq', 'differential_equations'
];

for (const t of expectedTools) {
    check(`tool handler registered: "${t}"`, typeof TOOL_HANDLERS[t] === 'function');
}

// ============================================================================
// 2. CALCULATOR & MATH TOOLS
// ============================================================================
// Basic arithmetic
check('calculator basic addition', TOOL_HANDLERS.calculator({ expression: '15 + 27' }).result === 42);
check('calculator subtraction & negative', TOOL_HANDLERS.calculator({ expression: '10 - 25' }).result === -15);
check('calculator multiplication', TOOL_HANDLERS.calculator({ expression: '7 * 8' }).result === 56);
check('calculator division', TOOL_HANDLERS.calculator({ expression: '100 / 4' }).result === 25);
check('calculator operator precedence', TOOL_HANDLERS.calculator({ expression: '2 + 3 * 4' }).result === 14);
check('calculator parentheses', TOOL_HANDLERS.calculator({ expression: '(2 + 3) * 4' }).result === 20);
check('calculator power ^', TOOL_HANDLERS.calculator({ expression: '2 ^ 8' }).result === 256);
check('calculator modulo %', TOOL_HANDLERS.calculator({ expression: '17 % 5' }).result === 2);

// Relaxed argument shapes
check('calculator accepts direct string parameter', TOOL_HANDLERS.calculator('9 * 9').result === 81);
check('calculator accepts direct number parameter', TOOL_HANDLERS.calculator(123).result === 123);
check('calculator accepts math key', TOOL_HANDLERS.calculator({ math: '50 - 8' }).result === 42);
check('calculator accepts pre-evaluated result', TOOL_HANDLERS.calculator({ result: 999 }).result === 999);
check('math alias points to calculator', TOOL_HANDLERS.math === TOOL_HANDLERS.calculator);
check('calc alias points to calculator', TOOL_HANDLERS.calc === TOOL_HANDLERS.calculator);

// Error handling
let calcErr1 = false;
try { TOOL_HANDLERS.calculator({ expression: '10 / 0' }); } catch { calcErr1 = true; }
check('calculator throws on division by zero', calcErr1);

let calcErr2 = false;
try { TOOL_HANDLERS.calculator({ expression: '2 + * 3' }); } catch { calcErr2 = true; }
check('calculator throws on malformed expression', calcErr2);

let calcErr3 = false;
try { TOOL_HANDLERS.calculator({}); } catch { calcErr3 = true; }
check('calculator throws on missing expression', calcErr3);

// ============================================================================
// 3. UNIT CONVERTER TOOLS
// ============================================================================
// Length
const len1 = TOOL_HANDLERS.convert({ amount: 1500, from: 'm', to: 'km' });
check('convert m to km', len1.result === 1.5 && len1.formatted.includes('1.5 km'));

const len2 = TOOL_HANDLERS.convert({ amount: 10, from: 'inch', to: 'cm' });
check('convert inch to cm', approxEq(len2.result, 25.4));

const len3 = TOOL_HANDLERS.convert({ amount: 5, from: 'miles', to: 'km' });
check('convert miles to km', approxEq(len3.result, 8.04672));

// Weight
const wt1 = TOOL_HANDLERS.convert({ amount: 1, from: 'kg', to: 'lb' });
check('convert kg to lb', approxEq(wt1.result, 2.20462, 1e-2));

const wt2 = TOOL_HANDLERS.convert({ amount: 1000, from: 'g', to: 'kg' });
check('convert g to kg', wt2.result === 1);

// Volume
const vol1 = TOOL_HANDLERS.convert({ amount: 3.78541, from: 'l', to: 'gal' });
check('convert l to gal', approxEq(vol1.result, 1, 1e-3));

// Digital storage
const sto1 = TOOL_HANDLERS.convert({ amount: 1, from: 'mb', to: 'kb' });
check('convert mb to kb', sto1.result === 1024);

const sto2 = TOOL_HANDLERS.convert({ amount: 1024, from: 'bytes', to: 'kb' });
check('convert bytes to kb', sto2.result === 1);

// Speed
const spd1 = TOOL_HANDLERS.convert({ amount: 100, from: 'km/h', to: 'mph' });
check('convert km/h to mph', approxEq(spd1.result, 62.137, 1e-2));

// Temperature (non-ratio formulas)
const tempCtoF = TOOL_HANDLERS.convert({ amount: 0, from: 'c', to: 'f' });
check('convert 0 C to F is 32', tempCtoF.result === 32);

const tempBoil = TOOL_HANDLERS.convert({ amount: 212, from: 'f', to: 'c' });
check('convert 212 F to C is 100', tempBoil.result === 100);

const tempNeg40 = TOOL_HANDLERS.convert({ amount: -40, from: 'c', to: 'f' });
check('convert -40 C to F is -40', tempNeg40.result === -40);

const tempKelvin = TOOL_HANDLERS.convert({ amount: 25, from: 'c', to: 'k' });
check('convert 25 C to K is 298.15', approxEq(tempKelvin.result, 298.15));

// Error cases
let unitErr1 = false;
try { TOOL_HANDLERS.convert({ amount: 10, from: 'meter', to: 'kilogram' }); } catch { unitErr1 = true; }
check('convert throws on incompatible types (meter -> kilogram)', unitErr1);

let unitErr2 = false;
try { TOOL_HANDLERS.convert({ amount: 10, from: 'celsius', to: 'meter' }); } catch { unitErr2 = true; }
check('convert throws on mixed temp/non-temp units', unitErr2);

let unitErr3 = false;
try { TOOL_HANDLERS.convert({ amount: 'invalid', from: 'm', to: 'km' }); } catch { unitErr3 = true; }
check('convert throws on non-finite amount', unitErr3);

check('unit_convert alias matches convert', TOOL_HANDLERS.unit_convert === TOOL_HANDLERS.convert);
check('unit_converter alias matches convert', TOOL_HANDLERS.unit_converter === TOOL_HANDLERS.convert);
check('conversion alias matches convert', TOOL_HANDLERS.conversion === TOOL_HANDLERS.convert);

// ============================================================================
// 4. RANDOMNESS TOOLS (RANDOM, DICE, COIN)
// ============================================================================
// Coin
const coinRes = TOOL_HANDLERS.random({ mode: 'coin' });
check('coin returns Heads or Tails', coinRes.mode === 'coin' && (coinRes.result === 'Heads' || coinRes.result === 'Tails'));

// Range
const rng1 = TOOL_HANDLERS.random({ mode: 'range', min: 10, max: 20 });
check('range returns integer in bounds [10, 20]', rng1.result >= 10 && rng1.result <= 20 && Number.isInteger(rng1.result));

// Dice
const dice1 = TOOL_HANDLERS.random({ mode: 'dice', count: 3, sides: 6 });
check('dice 3d6 has 3 rolls in [1, 6]', dice1.rolls.length === 3 && dice1.rolls.every(r => r >= 1 && r <= 6));
check('dice 3d6 total matches rolls sum', dice1.total === dice1.rolls.reduce((a, b) => a + b, 0));

// Dice string format '2d20'
const dice2 = TOOL_HANDLERS.random({ dice: '2d20' });
check('dice string syntax 2d20 produces 2 rolls in [1, 20]', dice2.rolls.length === 2 && dice2.rolls.every(r => r >= 1 && r <= 20));

// Aliases
check('dice alias matches random', TOOL_HANDLERS.dice === TOOL_HANDLERS.random);
check('coin alias matches random', TOOL_HANDLERS.coin === TOOL_HANDLERS.random);

// ============================================================================
// 5. BASE64 ENCODING & DECODING
// ============================================================================
const b64Enc = TOOL_HANDLERS.base64({ mode: 'encode', value: 'Hello, World!' });
check('base64 encode ASCII', b64Enc.result === 'SGVsbG8sIFdvcmxkIQ==');

const b64Dec = TOOL_HANDLERS.base64({ mode: 'decode', value: 'SGVsbG8sIFdvcmxkIQ==' });
check('base64 decode ASCII', b64Dec.result === 'Hello, World!');

// UTF-8 & Unicode support
const utf8Str = 'JAMES AI 🤖 Привет мир! 🚀';
const b64Utf8Enc = TOOL_HANDLERS.base64({ mode: 'encode', value: utf8Str });
const b64Utf8Dec = TOOL_HANDLERS.base64({ mode: 'decode', value: b64Utf8Enc.result });
check('base64 UTF-8 roundtrip preserves multi-byte unicode', b64Utf8Dec.result === utf8Str);

// Error handling
let b64Err1 = false;
try { TOOL_HANDLERS.base64({ mode: 'decode', value: 'not-valid-base64!!@@' }); } catch { b64Err1 = true; }
check('base64 decode throws on invalid input', b64Err1);

let b64Err2 = false;
try { TOOL_HANDLERS.base64({ mode: 'invalid_mode', value: 'test' }); } catch { b64Err2 = true; }
check('base64 throws on unknown mode', b64Err2);

// ============================================================================
// 6. CRYPTOGRAPHIC HASH TOOLS
// ============================================================================
// SHA-256
const h256 = await TOOL_HANDLERS.hash({ algorithm: 'sha256', value: 'hello' });
check('hash sha256 produces exact known test vector', h256.hash === '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');

// SHA-1
const h1 = await TOOL_HANDLERS.hash({ algorithm: 'sha1', value: 'hello' });
check('hash sha1 produces exact known test vector', h1.hash === 'aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d');

// SHA-512
const h512 = await TOOL_HANDLERS.hash({ algorithm: 'sha512', value: 'hello' });
check('hash sha512 produces 128-hex character digest', h512.hash.length === 128);

// MD5 rejection
let md5Err = false;
try { await TOOL_HANDLERS.hash({ algorithm: 'md5', value: 'test' }); } catch (e) {
    md5Err = e.message.includes('MD5 is not supported');
}
check('hash rejects MD5 with informative error', md5Err);

// ============================================================================
// 7. UUID & PASSWORD GENERATION TOOLS
// ============================================================================
// UUID
const u1 = TOOL_HANDLERS.uuid({});
const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
check('uuid generates RFC4122 v4 format', u1.uuids.length === 1 && uuidV4Regex.test(u1.uuids[0]));

const u5 = TOOL_HANDLERS.uuid({ count: 5 });
const uniqueSet = new Set(u5.uuids);
check('uuid count=5 generates 5 distinct unique IDs', u5.uuids.length === 5 && uniqueSet.size === 5);

// Password
const pwDef = TOOL_HANDLERS.password({});
check('password default length 16 and Strong rating', pwDef.length === 16 && pwDef.passwords[0].length === 16 && pwDef.strength === 'Strong');

const pwCustom = TOOL_HANDLERS.password({ length: 32, count: 3 });
check('password custom length 32 and count 3', pwCustom.passwords.length === 3 && pwCustom.passwords.every(p => p.length === 32));

const pwAlpha = TOOL_HANDLERS.password({ symbols: false, digits: false });
check('password with symbols & digits disabled is letters only', /^[a-zA-Z]+$/.test(pwAlpha.passwords[0]));

// ============================================================================
// 8. COLOR, PALETTE & SPRITE GENERATION TOOLS
// ============================================================================
// Color conversion
const colHex = TOOL_HANDLERS.color({ mode: 'hex', hex: '#3498db' });
check('color hex to rgb produces correct components', colHex.values.rgb.r === 52 && colHex.values.rgb.g === 152 && colHex.values.rgb.b === 219);
check('color hex outputs hsl, hsv, cmyk formatted strings', typeof colHex.hsl === 'string' && typeof colHex.cmyk === 'string');

const colRgb = TOOL_HANDLERS.color({ mode: 'rgb', r: 52, g: 152, b: 219 });
check('color rgb to hex roundtrips correctly', colRgb.hex.toLowerCase() === '#3498db');

// Palette
const palComp = TOOL_HANDLERS.palette({ base: '#e74c3c', scheme: 'complementary', count: 5 });
check('palette complementary generates 5 hex colors', palComp.colors.length === 5 && palComp.colors.every(c => /^#[0-9a-f]{6}$/i.test(c)));

const palMono = TOOL_HANDLERS.palette({ base: '#2ecc71', scheme: 'monochromatic', count: 4 });
check('palette monochromatic generates requested color count', palMono.colors.length === 4);

// Sprite generator
const spr1 = generateSprite({ seed: 'james-avatar-seed', grid_size: 8 });
const spr2 = generateSprite({ seed: 'james-avatar-seed', grid_size: 8 });
check('sprite generation is deterministic with same seed', spr1.seed === spr2.seed && spr1.markdown_image === spr2.markdown_image);
check('sprite returns markdown image containing SVG data URI', spr1.markdown_image.startsWith('![Retro Sprite - Seed:') && spr1.markdown_image.includes('data:image/svg+xml;base64,'));

// ============================================================================
// 9. DATE, TIME & COUNTDOWN TOOLS
// ============================================================================
// Date now
const dateNow = TOOL_HANDLERS.date({ action: 'now' });
check('date action=now returns ISO, local, UTC, unix', dateNow.unix > 1700000000 && typeof dateNow.iso === 'string');

// Date diff
const dateDiff = TOOL_HANDLERS.date({ action: 'diff', date: '2026-01-01T00:00:00Z', date2: '2026-01-11T12:00:00Z' });
check('date diff computes exact 10 days and 12 hours', dateDiff.days === 10 && dateDiff.hours === 12);

// Date parse
const dateParse = TOOL_HANDLERS.date({ action: 'parse', date: '2026-10-23' });
check('date parse extracts day of week and formatted date', typeof dateParse.day === 'string' && dateParse.unix > 0);

// Time
const timeUtc = TOOL_HANDLERS.time({ timezone: 'UTC' });
check('time UTC returns time and date string', typeof timeUtc.time === 'string' && typeof timeUtc.date === 'string');

let timeErr = false;
try { TOOL_HANDLERS.time({ timezone: 'Invalid/Zone/Name' }); } catch { timeErr = true; }
check('time throws on unknown timezone', timeErr);

// Countdown
const cdXmas = TOOL_HANDLERS.countdown({ target: 'christmas' });
check('countdown to named holiday (christmas) returns remaining days and date', cdXmas.days >= 0 && typeof cdXmas.date === 'string');

const cdPast = TOOL_HANDLERS.countdown({ target: '2000-01-01' });
check('countdown to past date reports direction as "ago"', cdPast.direction === 'ago' && cdPast.days > 7000);

// ============================================================================
// 10. FILE READER TOOL
// ============================================================================
const sampleFile = 'First line of content\nSecond line with some words\nThird and final line';
const fileRes = TOOL_HANDLERS.file({ content: sampleFile, filename: 'doc.txt' });
check('file reader computes correct line count', fileRes.lines === 3);
check('file reader computes correct word count', fileRes.words === 13);
check('file reader returns preview and full content', fileRes.full_content === sampleFile && fileRes.preview.includes('First line'));

let fileErr = false;
try { TOOL_HANDLERS.file({}); } catch { fileErr = true; }
check('file reader throws on missing content', fileErr);

// ============================================================================
// 11. DOCUMENT INDEXING & OFFLINE SEARCH TOOLS
// ============================================================================
// Seed index search
const searchSeed = await TOOL_HANDLERS.search({ query: 'assistant' });
check('search finds matching seed document', searchSeed.count >= 1 && searchSeed.hits.length >= 1);

// Custom indexing & subsequent retrieval
const customDocId = `doc-${Date.now()}`;
const insertRes = await TOOL_HANDLERS.index({ id: customDocId, content: 'Quantum teleportation experiments and entanglement protocols.' });
check('indexDocument successfully inserts document', insertRes.inserted === true && insertRes.id === customDocId);

const searchCustom = await TOOL_HANDLERS.search({ query: 'teleportation' });
check('search retrieves newly indexed custom document', searchCustom.hits.some(h => JSON.stringify(h).includes(customDocId)));

// ============================================================================
// 12. SCIENTIFIC & PHYSICS TOOLS VIA TOOL_HANDLERS
// ============================================================================
// Particle physics
const physLF = TOOL_HANDLERS.physics({ mode: 'lorentz_factor', beta: 0.6 });
check('physics tool computes lorentz factor 1.25', approxEq(physLF.gamma, 1.25));

// Relativity
const relTD = TOOL_HANDLERS.relativity({ mode: 'time_dilation', beta: 0.8, proper_time_s: 10 });
check('relativity tool computes time dilation ~ 16.67s', approxEq(relTD.dilated_time_s, 16.66666, 1e-2));

// Linear algebra
const matMult = TOOL_HANDLERS.linalg({ mode: 'multiply', A: [[1, 2], [3, 4]], B: [[2, 0], [1, 2]] });
check('linalg tool computes matrix multiplication', matMult.result[0][0] === 4 && matMult.result[0][1] === 4 && matMult.result[1][0] === 10 && matMult.result[1][1] === 8);

const matDet = TOOL_HANDLERS.matrix({ mode: 'determinant', A: [[4, 6], [3, 8]] });
check('matrix alias computes determinant 14', matDet.determinant === 14);

// Differential equations
const rk4Res = TOOL_HANDLERS.diffeq({ mode: 'rk4', f: 'x', x0: 0, y0: 0, x_end: 2, steps: 20 });
check('diffeq rk4 integrates dy/dx = x to x=2 (~2.0)', approxEq(rk4Res.final_y, 2.0, 1e-2));

// ============================================================================
// 13. NETWORK & EXTERNAL API TOOLS (WITH CONTROLLED MOCKING)
// ============================================================================
const originalFetch = globalThis.fetch;

try {
    // A. Weather Tool Mock
    globalThis.fetch = async (url) => {
        const u = String(url);
        if (u.includes('geocoding-api')) {
            return {
                ok: true,
                json: async () => ({ results: [{ latitude: 51.5, longitude: -0.12, name: 'London', country: 'United Kingdom' }] })
            };
        }
        if (u.includes('api.open-meteo')) {
            return {
                ok: true,
                json: async () => ({ current: { temperature_2m: 14.2, relative_humidity_2m: 72, wind_speed_10m: 18, weather_code: 61 } })
            };
        }
        if (u.includes('api.frankfurter.dev')) {
            return {
                ok: true,
                json: async () => ({ rates: { EUR: 0.92 } })
            };
        }
        if (u.includes('ipapi.co')) {
            return {
                ok: true,
                json: async () => ({ ip: '8.8.8.8', city: 'Mountain View', region: 'California', country_name: 'United States', country_code: 'US', postal: '94043' })
            };
        }
        if (u.includes('r.jina.ai')) {
            return {
                ok: true,
                text: async () => '# Example Domain\nThis domain is for use in documentation illustrative examples.'
            };
        }
        if (u.includes('asciified.thelicato.io')) {
            return {
                ok: true,
                text: async () => ' ____  _   _  ____ \n/ ___|| | | |/ ___|\n\\___ \\| | | | |    \n ___) | |_| | |___ \n|____/ \\___/ \\____|\n'
            };
        }
        if (u.includes('wikipedia.org')) {
            return {
                ok: true,
                json: async () => ({ title: 'Alan Turing', extract: 'Alan Turing was an English mathematician and computer scientist.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Alan_Turing' } } })
            };
        }
        return { ok: false, status: 404, text: async () => 'Not found' };
    };

    // Weather execution
    const weatherRes = await TOOL_HANDLERS.weather({ location: 'London' });
    check('weather tool returns structured forecast', weatherRes.location.includes('London') && weatherRes.temperature === '14.2°C' && weatherRes.condition === 'Light rain');

    // Currency execution
    const curSelf = await TOOL_HANDLERS.currency({ from: 'USD', to: 'USD', amount: 50 });
    check('currency same-currency returns rate 1 without fetch', curSelf.rate === 1 && curSelf.converted === '50.00');

    const curDiff = await TOOL_HANDLERS.currency({ from: 'USD', to: 'EUR', amount: 100 });
    check('currency computes exchange conversion', curDiff.rate === 0.92 && curDiff.converted === '92.00');

    // IP lookup execution
    const ipRes = await TOOL_HANDLERS.ip({ target: '8.8.8.8' });
    check('ip tool parses geolocation data', ipRes.ip === '8.8.8.8' && ipRes.city === 'Mountain View' && ipRes.country === 'United States');

    // Fetch page execution
    const pageRes = await TOOL_HANDLERS.fetch_page({ url: 'https://example.com' });
    check('fetch_page returns markdown content', pageRes.content.includes('Example Domain') && pageRes.url === 'https://example.com');

    // ASCII art execution
    const asciiRes = await TOOL_HANDLERS.ascii_art({ text: 'SUC' });
    check('ascii_art returns rendered banner', typeof asciiRes === 'string' && asciiRes.includes('___'));

    // Wikipedia execution
    const wikiRes = await TOOL_HANDLERS.wikipedia({ query: 'Alan Turing' });
    check('wikipedia returns title and summary', wikiRes.type === 'wiki' && wikiRes.title === 'Alan Turing' && wikiRes.summary.includes('mathematician'));

} finally {
    globalThis.fetch = originalFetch;
}

// Parameter error guards for network tools
let webErr1 = false;
try { await TOOL_HANDLERS.web_search({}); } catch { webErr1 = true; }
check('web_search throws on empty query', webErr1);

let fetchErr1 = false;
try { await TOOL_HANDLERS.fetch_page({}); } catch { fetchErr1 = true; }
check('fetch_page throws on missing url', fetchErr1);

let asciiErr1 = false;
try { await TOOL_HANDLERS.ascii_art({}); } catch { asciiErr1 = true; }
check('ascii_art throws on missing text', asciiErr1);

// ============================================================================
// 14. TOOL BRIDGE & ROUTING VALIDATION
// ============================================================================
const bridgeUnknown = await handleToolCall('non_existent_tool_xyz', {});
check('handleToolCall returns graceful error for unknown tool', bridgeUnknown.success === false && bridgeUnknown.error.includes('Unknown tool'));

check('cleanTail utility trims punctuation and trailing noise', cleanTail('what is physics?!') === 'what is physics');
check('safeInt parses integers with safe clamping', safeInt('42', 1, 0, 100) === 42 && safeInt('999', 1, 0, 10) === 10);
check('evalMath parses standard arithmetic safely', evalMath('10 + 20 * 3') === 70);

console.log(failed === 0 ? '\nALL UNIT TESTS FOR TOOLS PASSED' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
