import { create as oramaCreate, insert as oramaInsert, search as oramaSearch } from './orama.js';
import { performWebSearch } from './tools-search.js';
import { evalMath } from './tool-router.js';


// tools-worker.js — handles all non-Python tool execution for JAMES
// Each tool is invoked via a tagged block: ```tool:run {"tool":"name","params":{...}}```

let oramaIndex = null;
const oramaSeedDocs = [
    {
        id: 'JAMES-overview',
        content: 'JAMES is a browser-native AI assistant that runs locally in the browser. It can execute tool calls, stream responses, and maintain private conversation state.'
    },
    {
        id: 'JAMES-tools',
        content: 'JAMES includes weather, wikipedia, currency, time, uuid, password, palette, date, file, location, clipboard, timer, search, calculator, convert, countdown, base64, color, hash, random, and ip tools.'
    },
    {
        id: 'JAMES-architecture',
        content: 'The app uses a main thread UI, a model worker for inference, a tools worker for external calls, and optional Python execution via Pyodide.'
    }
];

async function ensureOramaIndex() {
    if (oramaIndex) return;
    oramaIndex = await oramaCreate({ schema: { id: 'string', content: 'string' } });
    for (const doc of oramaSeedDocs) {
        await oramaInsert(oramaIndex, doc);
    }
}

async function searchIndex(params) {
    await ensureOramaIndex();
    const { query, topK = 3 } = params;
    return await oramaSearch(oramaIndex, { term: query, limit: topK });
}

async function indexDocument(params) {
    await ensureOramaIndex();
    const { id, content } = params;
    if (!id || !content) throw new Error('Missing id or content');
    await oramaInsert(oramaIndex, { id, content });
    return { id, inserted: true };
}

// ── Weather (Open-Meteo, no key needed) ───────────────────────────────────
async function getWeather(params) {
    const { location } = params;

    const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&format=json`
    );
    const geoData = await geoRes.json();
    if (!geoData.results?.length) throw new Error(`Location not found: ${location}`);

    const { latitude, longitude, name, country } = geoData.results[0];

    const weatherRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
        `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code` +
        `&hourly=temperature_2m&forecast_days=1&timezone=auto`
    );
    const w = await weatherRes.json();
    const c = w.current;

    const codes = {
        0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
        45: 'Foggy', 48: 'Icy fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
        61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
        80: 'Rain showers', 81: 'Heavy showers', 82: 'Violent showers', 95: 'Thunderstorm'
    };

    return {
        location: `${name}, ${country}`,
        temperature: `${c.temperature_2m}°C`,
        humidity: `${c.relative_humidity_2m}%`,
        wind: `${c.wind_speed_10m} km/h`,
        condition: codes[c.weather_code] ?? `Code ${c.weather_code}`
    };
}

// ── Web Search — delegates to tools-search.js (SearXNG + Wikipedia + Jina) ──
async function getWebSearch(params) {
    const { query } = params;
    if (!query) throw new Error('web_search requires a query parameter');
    return performWebSearch(query);
}

// ── Fetch Page ────────────────────────────────────────────────────────────
async function fetchPageTool(params) {
    const { url } = params;
    if (!url) throw new Error('fetch_page requires a url parameter');
    try {
        const res = await fetch(`https://r.jina.ai/${url}`, {
            headers: {
                'Accept': 'text/plain',
                'X-Max-Tokens': '2000'
            }
        });
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        let markdownText = await res.text();
        return { url, length: markdownText.length, content: markdownText.slice(0, 4000) };
    } catch (e) {
        return { error: 'Failed to fetch page', details: e.message };
    }
}

// ── Wikipedia summary ─────────────────────────────────────────────────────
async function getWikipedia(params) {
    const { query } = params;
    // Wikipedia REST API uses page titles: replace spaces with underscores
    const titleised = query.trim().replace(/\s+/g, '_');
    const res = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titleised)}`
    );
    if (!res.ok) {
        return {
            type: 'fallback',
            query,
            url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`
        };
    }
    const data = await res.json();
    if (data.type === 'disambiguation') {
        return {
            type: 'fallback',
            query,
            url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`
        };
    }
    return {
        type: 'wiki',
        title: data.title,
        summary: data.extract,
        url: data.content_urls?.desktop?.page ?? ''
    };
}

// ── Currency exchange (frankfurter.app, no key) ───────────────────────────
async function getCurrency(params) {
    const { from, to, amount = 1 } = params;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount)) throw new Error('Currency amount must be a finite number');
    const fromCode = from.toUpperCase();
    const toCode = to.toUpperCase();

    if (fromCode === toCode) {
        return { from: fromCode, to: toCode, rate: 1, amount: numericAmount, converted: numericAmount.toFixed(2) };
    }

    const res = await fetch(
        `https://api.frankfurter.dev/v1/latest?base=${fromCode}&symbols=${toCode}`,
        { cache: 'no-store' }
    );
    if (!res.ok) {
        const text = await res.text().catch(() => String(res.status));
        throw new Error(`Currency API error (${res.status}): ${text}`);
    }
    const data = await res.json();
    if (data.error) throw new Error(`Currency error: ${data.error}`);
    const rate = data.rates[toCode];
    if (!rate) throw new Error(`No rate found for ${fromCode} → ${toCode}`);
    return {
        from: fromCode,
        to: toCode,
        rate,
        amount: numericAmount,
        converted: (numericAmount * rate).toFixed(2)
    };
}

// ── World time (Native Browser API) ───────────────────────────────────────
async function getTime(params) {
    const { timezone } = params;
    try {
        const d = new Date();
        const timeString = d.toLocaleTimeString('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit' });
        const dateString = d.toLocaleDateString('en-US', { timeZone: timezone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        return { timezone, time: timeString, date: dateString };
    } catch {
        throw new Error(`Unknown timezone: ${timezone}`);
    }
}

// ── UUID generator ────────────────────────────────────────────────────────
function generateUUID(params) {
    const parsedCount = Number.parseInt(params?.count ?? 1, 10);
    const count = Number.isFinite(parsedCount) ? Math.max(1, Math.min(parsedCount, 20)) : 1;
    const uuids = [];
    for (let i = 0; i < count; i++) uuids.push(crypto.randomUUID());
    return { uuids };
}

// ── Password generator ────────────────────────────────────────────────────
function generatePassword(params) {
    const parsedLength = Number.parseInt(params?.length ?? 16, 10);
    const parsedCount = Number.parseInt(params?.count ?? 1, 10);
    const length = Number.isFinite(parsedLength) ? Math.max(1, Math.min(parsedLength, 128)) : 16;
    const count = Number.isFinite(parsedCount) ? Math.max(1, Math.min(parsedCount, 10)) : 1;
    const upper = params?.uppercase !== false;
    // Accept both 'digits' (new handler) and 'numbers' (legacy) for compat
    const digits = (params?.digits ?? params?.numbers) !== false;
    const symbols = params?.symbols !== false;

    let chars = 'abcdefghijklmnopqrstuvwxyz';
    if (upper) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (digits) chars += '0123456789';
    if (symbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
    if (!chars.length) throw new Error('At least one password character set must be enabled');

    const passwords = [];
    for (let p = 0; p < count; p++) {
        const arr = new Uint32Array(length);
        crypto.getRandomValues(arr);
        passwords.push(Array.from(arr).map(v => chars[v % chars.length]).join(''));
    }
    return {
        passwords,
        length,
        strength: length >= 16 && symbols ? 'Strong' : length >= 12 ? 'Medium' : 'Weak'
    };
}

// ── Color palette generator ───────────────────────────────────────────────
function generatePalette(params) {
    const { base = '#3498db', scheme = 'complementary', count = 5 } = params;

    function hexToHsl(hex) {
        const clean = (hex || '#3498db').replace(/^#/, '');
        const full = clean.length === 3
            ? clean.split('').map(c => c + c).join('')
            : clean.padEnd(6, '0');
        let r = parseInt(full.slice(0, 2), 16) / 255;
        let g = parseInt(full.slice(2, 4), 16) / 255;
        let b = parseInt(full.slice(4, 6), 16) / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s = 0, l = (max + min) / 2;
        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }
        return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
    }

    function hslToHex(h, s, l) {
        s /= 100; l /= 100;
        const a = s * Math.min(l, 1 - l);
        const f = n => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
        return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('');
    }

    const [h, s, l] = hexToHsl(base);
    const colors = [];
    const parsedCount = Number.parseInt(count, 10);
    const n = Number.isFinite(parsedCount) ? Math.max(1, Math.min(parsedCount, 20)) : 5;

    if (scheme === 'analogous') {
        for (let i = 0; i < n; i++) colors.push(hslToHex((h + i * 30) % 360, s, l));
    } else if (scheme === 'monochromatic') {
        const step = n > 1 ? 60 / (n - 1) : 0;
        for (let i = 0; i < n; i++) colors.push(hslToHex(h, s, Math.max(10, Math.min(90, l - 30 + i * step))));
    } else if (scheme === 'triadic') {
        colors.push(hslToHex(h, s, l), hslToHex((h + 120) % 360, s, l), hslToHex((h + 240) % 360, s, l));
    } else {
        for (let i = 0; i < n; i++) {
            colors.push(i % 2 === 0 ? hslToHex(h, s, Math.max(20, l - 10 + i * 5)) : hslToHex((h + 180) % 360, s, l));
        }
    }

    return { base, scheme, colors };
}

// ── Date/time tools ───────────────────────────────────────────────────────
function dateTool(params) {
    const { action, date, from_tz, to_tz, date2 } = params;

    if (action === 'now') {
        const now = new Date();
        return {
            iso: now.toISOString(),
            local: now.toLocaleString(),
            unix: Math.floor(now.getTime() / 1000),
            utc: now.toUTCString()
        };
    }

    if (action === 'diff') {
        if (!date2) throw new Error("date2 is required for diff action");
        const d1 = new Date(date), d2 = new Date(date2);
        const diffMs = Math.abs(d2 - d1);
        return {
            from: date, to: date2,
            days: Math.floor(diffMs / 86400000),
            hours: Math.floor((diffMs % 86400000) / 3600000),
            minutes: Math.floor((diffMs % 3600000) / 60000),
            total_ms: diffMs
        };
    }

    if (action === 'convert') {
        const d = new Date(date);
        return {
            input: date,
            from_tz: from_tz ?? 'local',
            to_tz: to_tz ?? 'UTC',
            result: d.toLocaleString('en-US', { timeZone: to_tz ?? 'UTC' })
        };
    }

    if (action === 'parse') {
        const d = new Date(date);
        if (isNaN(d)) throw new Error(`Cannot parse date: ${date}`);
        return {
            input: date,
            iso: d.toISOString(),
            unix: Math.floor(d.getTime() / 1000),
            day: d.toLocaleDateString('en-US', { weekday: 'long' }),
            formatted: d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        };
    }

    throw new Error(`Unknown date action: ${action}`);
}

// ── File reader ───────────────────────────────────────────────────────────
function readFile(params) {
    const { content, filename } = params;
    if (!content) throw new Error('No file content provided');
    const lines = content.split('\n').length;
    const words = content.split(/\s+/).filter(Boolean).length;
    return {
        filename: filename ?? 'unknown',
        lines,
        words,
        characters: content.length,
        preview: content.slice(0, 500) + (content.length > 500 ? '...' : ''),
        full_content: content
    };
}



// ── NEW: Calculator ───────────────────────────────────────────────────────
// The router pre-evaluates simple expressions; this handler receives
// the already-computed result, or re-evaluates if only `expression` is given.
function calculatorTool(params) {
    let { expression, result } = params;

    if (result === undefined) {
        if (!expression || typeof expression !== 'string') {
            throw new Error('No expression provided');
        }
        try {
            result = evalMath(expression);
        } catch (e) {
            throw new Error(`Malformed expression: ${expression}`);
        }
    }

    if (typeof result !== 'number' || isNaN(result)) {
        throw new Error(`Expression produced NaN: ${expression}`);
    }
    if (!isFinite(result)) {
        throw new Error(`Expression result is infinite (division by zero?): ${expression}`);
    }

    return {
        expression,
        result,
        formatted: Number.isInteger(result) ? String(result) : result.toPrecision(10).replace(/\.?0+$/, '')
    };
}

// ── NEW: Unit converter ───────────────────────────────────────────────────
// Conversion factors relative to a base unit per type.
const UNIT_TO_BASE = {
    // Length → metres
    mm: 0.001, cm: 0.01, m: 1, km: 1000,
    inch: 0.0254, in: 0.0254, inches: 0.0254,
    foot: 0.3048, feet: 0.3048, ft: 0.3048,
    yard: 0.9144, yards: 0.9144, yd: 0.9144,
    mile: 1609.344, miles: 1609.344, mi: 1609.344,
    // Weight → kg
    mg: 0.000001, g: 0.001, kg: 1,
    oz: 0.0283495, ounce: 0.0283495, ounces: 0.0283495,
    lb: 0.453592, lbs: 0.453592, pound: 0.453592, pounds: 0.453592,
    tonne: 1000, ton: 907.185, tons: 907.185,
    // Volume → litres
    ml: 0.001, l: 1, liter: 1, litre: 1, liters: 1, litres: 1,
    gallon: 3.78541, gallons: 3.78541, gal: 3.78541,
    pint: 0.473176, pints: 0.473176, pt: 0.473176,
    cup: 0.236588, cups: 0.236588,
    // Speed → km/h
    'km/h': 1, kph: 1, mph: 1.60934, mps: 3.6, knot: 1.852, knots: 1.852,
    // Digital storage → bytes
    b: 1, byte: 1, bytes: 1,
    kb: 1024, kilobyte: 1024, kilobytes: 1024,
    mb: 1048576, megabyte: 1048576, megabytes: 1048576,
    gb: 1073741824, gigabyte: 1073741824, gigabytes: 1073741824,
    tb: 1099511627776, terabyte: 1099511627776, terabytes: 1099511627776,
};

// Unit type groups — used to detect mismatched conversions
const UNIT_TYPES = {
    length: ['mm', 'cm', 'm', 'km', 'inch', 'in', 'inches', 'foot', 'feet', 'ft', 'yard', 'yards', 'yd', 'mile', 'miles', 'mi'],
    weight: ['mg', 'g', 'kg', 'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds', 'tonne', 'ton', 'tons'],
    volume: ['ml', 'l', 'liter', 'litre', 'liters', 'litres', 'gallon', 'gallons', 'gal', 'pint', 'pints', 'pt', 'cup', 'cups'],
    speed: ['km/h', 'kph', 'mph', 'mps', 'knot', 'knots'],
    storage: ['b', 'byte', 'bytes', 'kb', 'kilobyte', 'kilobytes', 'mb', 'megabyte', 'megabytes', 'gb', 'gigabyte', 'gigabytes', 'tb', 'terabyte', 'terabytes'],
};

function getUnitType(unit) {
    const u = unit.toLowerCase();
    for (const [type, units] of Object.entries(UNIT_TYPES)) {
        if (units.includes(u)) return type;
    }
    return null;
}

function convertUnits(params) {
    const { amount, from, to, fromType } = params;
    if (amount === undefined || from === undefined || to === undefined) throw new Error('Missing amount, from, or to');
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount)) throw new Error('Conversion amount must be a finite number');
    const fromKey = from.toLowerCase();
    const toKey = to.toLowerCase();

    // ── Temperature (special: not ratio-based) ──────────────────────────
    const tempNames = { celsius: 'C', c: 'C', fahrenheit: 'F', f: 'F', kelvin: 'K', k: 'K' };
    const fromTemp = tempNames[fromKey];
    const toTemp = tempNames[toKey];

    if (fromTemp || toTemp) {
        if (!fromTemp || !toTemp) throw new Error(`Mixed temperature/non-temperature units`);
        let celsius;
        if (fromTemp === 'C') celsius = numericAmount;
        else if (fromTemp === 'F') celsius = (numericAmount - 32) * 5 / 9;
        else celsius = numericAmount - 273.15; // K

        let result;
        if (toTemp === 'C') result = celsius;
        else if (toTemp === 'F') result = celsius * 9 / 5 + 32;
        else result = celsius + 273.15; // K

        return {
            amount: numericAmount, from, to,
            result: parseFloat(result.toFixed(4)),
            formatted: `${parseFloat(result.toFixed(4))}°${toTemp}`
        };
    }

    // ── Ratio-based units ─────────────────────────────────────────────────
    const fromFactor = UNIT_TO_BASE[fromKey];
    const toFactor = UNIT_TO_BASE[toKey];
    if (!fromFactor) throw new Error(`Unknown unit: ${from}`);
    if (!toFactor) throw new Error(`Unknown unit: ${to}`);

    const fromTypeResolved = fromType ?? getUnitType(fromKey);
    const toTypeResolved = getUnitType(toKey);
    if (fromTypeResolved && toTypeResolved && fromTypeResolved !== toTypeResolved) {
        throw new Error(`Incompatible units: "${from}" (${fromTypeResolved}) ≠ "${to}" (${toTypeResolved})`);
    }

    const result = (numericAmount * fromFactor) / toFactor;
    return {
        amount: numericAmount, from, to,
        result: parseFloat(result.toPrecision(8)),
        formatted: `${parseFloat(result.toPrecision(8))} ${to}`
    };
}

// ── NEW: Countdown to date ────────────────────────────────────────────────
function countdownTool(params) {
    const { target } = params;

    // Compute fresh each call so year-boundary cases are always correct
    const now = new Date();
    const thisYear = now.getFullYear();
    const nextYear = thisYear + 1;

    const thanksgivingDate = (() => {
        const nov1 = new Date(thisYear, 10, 1);
        const thu = (11 - nov1.getDay()) % 7;
        return new Date(thisYear, 10, 1 + thu + 21).toISOString().slice(0, 10);
    })();

    const namedDates = {
        'christmas': `${thisYear}-12-25`,
        'new year': `${nextYear}-01-01`,
        "new year's": `${nextYear}-01-01`,
        "new year's day": `${nextYear}-01-01`,
        'halloween': `${thisYear}-10-31`,
        'valentine': `${thisYear}-02-14`,
        "valentine's day": `${thisYear}-02-14`,
        'thanksgiving': thanksgivingDate,
        'independence day': `${thisYear}-07-04`,
        'july 4': `${thisYear}-07-04`,
        "new year's eve": `${thisYear}-12-31`,
    };

    const key = target.toLowerCase().trim();
    const resolvedDate = namedDates[key] ?? target;

    const targetDate = new Date(resolvedDate);
    if (isNaN(targetDate)) throw new Error(`Cannot parse date: "${target}"`);

    // If named date has already passed this year, bump to next year
    if (targetDate < now && namedDates[key]) {
        targetDate.setFullYear(targetDate.getFullYear() + 1);
    }

    const diffMs = targetDate - now;
    const isPast = diffMs < 0;
    const absDiff = Math.abs(diffMs);
    const days = Math.floor(absDiff / 86400000);
    const hours = Math.floor((absDiff % 86400000) / 3600000);
    const minutes = Math.floor((absDiff % 3600000) / 60000);

    return {
        target,
        date: targetDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        days,
        hours,
        minutes,
        direction: isPast ? 'ago' : 'remaining',
        summary: isPast
            ? `${days} days, ${hours} hours ago`
            : `${days} days, ${hours} hours, ${minutes} minutes remaining`
    };
}

// ── NEW: Base64 encode/decode ─────────────────────────────────────────────
function base64Tool(params) {
    const { mode, value } = params;
    if (!value) throw new Error('No value provided');

    if (mode === 'encode') {
        // Use TextEncoder so non-ASCII (UTF-8) strings encode correctly
        const bytes = new TextEncoder().encode(value);
        const binStr = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
        const encoded = btoa(binStr);
        return { mode: 'encode', input: value, result: encoded };
    }

    if (mode === 'decode') {
        try {
            const binStr = atob(value);
            const bytes = Uint8Array.from(binStr, c => c.charCodeAt(0));
            const decoded = new TextDecoder().decode(bytes);
            return { mode: 'decode', input: value, result: decoded };
        } catch {
            throw new Error('Invalid Base64 string');
        }
    }

    throw new Error(`Unknown base64 mode: ${mode}`);
}

// ── NEW: Color info / conversion ──────────────────────────────────────────
function colorTool(params) {
    const { mode, hex, r, g, b } = params;

    function hexToRgb(h) {
        const clean = String(h || '000000').replace(/^#/, '').padEnd(6, '0');
        const full = clean.length === 3
            ? clean.split('').map(c => c + c).join('')
            : clean;
        return {
            r: parseInt(full.slice(0, 2), 16) || 0,
            g: parseInt(full.slice(2, 4), 16) || 0,
            b: parseInt(full.slice(4, 6), 16) || 0
        };
    }

    function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
    }

    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s = 0, l = (max + min) / 2;
        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }
        return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
    }

    function rgbToHsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
        let h = 0;
        if (d !== 0) {
            switch (max) {
                case r: h = ((g - b) / d % 6) * 60; break;
                case g: h = ((b - r) / d + 2) * 60; break;
                case b: h = ((r - g) / d + 4) * 60; break;
            }
        }
        return { h: Math.round(h < 0 ? h + 360 : h), s: Math.round(max ? (d / max) * 100 : 0), v: Math.round(max * 100) };
    }

    function rgbToCmyk(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const k = 1 - Math.max(r, g, b);
        if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
        return {
            c: Math.round(((1 - r - k) / (1 - k)) * 100),
            m: Math.round(((1 - g - k) / (1 - k)) * 100),
            y: Math.round(((1 - b - k) / (1 - k)) * 100),
            k: Math.round(k * 100)
        };
    }

    let rgb;
    if (mode === 'hex') {
        rgb = hexToRgb(hex);
    } else if (mode === 'rgb') {
        rgb = { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
    } else {
        throw new Error(`Unknown color mode: ${mode}`);
    }

    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    const cmyk = rgbToCmyk(rgb.r, rgb.g, rgb.b);

    return {
        hex: rgbToHex(rgb.r, rgb.g, rgb.b),
        rgb: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
        hsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
        hsv: `hsv(${hsv.h}, ${hsv.s}%, ${hsv.v}%)`,
        cmyk: `cmyk(${cmyk.c}%, ${cmyk.m}%, ${cmyk.y}%, ${cmyk.k}%)`,
        values: { rgb, hsl, hsv, cmyk }
    };
}

// ── NEW: Hash (SubtleCrypto — available in workers) ───────────────────────
async function hashTool(params) {
    const { algorithm, value } = params;
    if (!value) throw new Error('No value to hash');
    if (!algorithm) throw new Error('No algorithm provided');

    const algo = algorithm.toLowerCase().replace('-', '');

    if (algo === 'md5') {
        throw new Error('MD5 is not supported in the browser crypto API. Use sha256 or sha512 instead.');
    }

    // Normalise algorithm name for SubtleCrypto
    const algoMap = { sha1: 'SHA-1', sha256: 'SHA-256', sha512: 'SHA-512' };
    const subtleAlgo = algoMap[algo];
    if (!subtleAlgo) throw new Error(`Unknown algorithm: ${algorithm}`);

    const data = new TextEncoder().encode(value);
    const buffer = await crypto.subtle.digest(subtleAlgo, data);
    const hex = Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    return { algorithm: subtleAlgo, input: value, hash: hex };
}

// ── NEW: Dice, coin flip, random range ────────────────────────────────────
// Cryptographically secure random float in [0, 1)
function _cryptoRandom() {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] / (0xFFFFFFFF + 1);
}

function randomTool(params) {
    const { mode, count = 1, sides = 6, min = 1, max = 100 } = params;

    if (mode === 'coin') {
        const flip = _cryptoRandom() < 0.5 ? 'Heads' : 'Tails';
        return { mode: 'coin', result: flip };
    }

    if (mode === 'range') {
        const parsedMin = Number.parseInt(min, 10);
        const parsedMax = Number.parseInt(max, 10);
        if (!Number.isFinite(parsedMin) || !Number.isFinite(parsedMax)) {
            throw new Error('Random range requires integer bounds');
        }
        const lo = Math.min(parsedMin, parsedMax);
        const hi = Math.max(parsedMin, parsedMax);
        const result = Math.floor(_cryptoRandom() * (hi - lo + 1)) + lo;
        return { mode: 'range', min: lo, max: hi, result };
    }

    if (mode === 'dice') {
        const parsedCount = Number.parseInt(count, 10);
        const parsedSides = Number.parseInt(sides, 10);
        if (!Number.isFinite(parsedCount) || !Number.isFinite(parsedSides)) {
            throw new Error('Dice requires integer count and sides');
        }
        const n = Math.max(1, Math.min(parsedCount, 100));
        const s = Math.max(2, Math.min(parsedSides, 1000));
        const rolls = Array.from({ length: n }, () => Math.floor(_cryptoRandom() * s) + 1);
        const total = rolls.reduce((a, b) => a + b, 0);
        return { mode: 'dice', dice: `${n}d${s}`, rolls, total };
    }

    throw new Error(`Unknown random mode: ${mode}`);
}

function helpTool(params) {
    const { text, toolName } = params;
    return { text, toolName: toolName ?? null };
}

// ── NEW: IP lookup (ipapi.co, no key needed for basic use) ────────────────
async function ipTool(params) {
    const { target = 'self' } = params;

    const url = target === 'self'
        ? 'https://ipapi.co/json/'
        : `https://ipapi.co/${encodeURIComponent(target)}/json/`;

    const res = await fetch(url, {
        headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) throw new Error(`IP lookup failed (${res.status})`);

    const d = await res.json();
    if (d.error) throw new Error(d.reason ?? `IP lookup error: ${d.error}`);

    return {
        ip: d.ip,
        city: d.city,
        region: d.region,
        country: d.country_name,
        country_code: d.country_code,
        postal: d.postal,
        latitude: d.latitude,
        longitude: d.longitude,
        timezone: d.timezone,
        isp: d.org,
    };
}

// ── ASCII Art ─────────────────────────────────────────────────────────────
async function asciiArtTool(params) {
    const { text, font = 'standard' } = params;
    if (!text) throw new Error('ascii_art requires a text parameter');

    // We try asciified first, fallback to basic text if it fails
    try {
        const url = new URL('https://asciified.thelicato.io/api/v2/ascii');
        url.searchParams.append('text', text);
        url.searchParams.append('font', font);
        const res = await fetch(url);
        if (res.ok) return await res.text();
    } catch (e) {
        console.warn('ASCII art failed:', e);
    }
    throw new Error('Failed to generate ASCII art. Service might be down.');
}

// ── Main message handler ──────────────────────────────────────────────────
const TOOL_HANDLERS = {
    help: helpTool,
    weather: getWeather,
    websearch: getWebSearch,
    web_search: getWebSearch,
    wikipedia: getWikipedia,
    currency: getCurrency,
    time: getTime,
    uuid: generateUUID,
    password: generatePassword,
    palette: generatePalette,
    date: dateTool,
    file: readFile,

    search: searchIndex,
    index: indexDocument,
    calculator: calculatorTool,
    convert: convertUnits,
    countdown: countdownTool,
    base64: base64Tool,
    color: colorTool,
    hash: hashTool,
    random: randomTool,
    ip: ipTool,
    ascii_art: asciiArtTool,
    fetch_page: fetchPageTool
};

self.onmessage = async (e) => {
    const { execId, tool, params } = e.data;

    // Ignore non-tool messages (e.g. init ping from worker-controller)
    if (!tool) return;

    try {
        const handler = TOOL_HANDLERS[tool];
        if (!handler) throw new Error(`Unknown tool: ${tool}`);
        const result = await handler(params);
        self.postMessage({ status: 'done', result, execId });
    } catch (err) {
        self.postMessage({ status: 'error', error: err.message, execId });
    }
};
