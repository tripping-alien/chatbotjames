// Standalone bundle of JAMES Tool Router for offline & file:/// execution
(function(global) {
  'use strict';
// Currency symbol + name -> ISO code
const CURRENCY_MAP = {
    '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₪': 'ILS',
    '₹': 'INR', '₩': 'KRW', '₺': 'TRY', '₽': 'RUB', 'R$': 'BRL',
    dollar: 'USD', dollars: 'USD', usd: 'USD', buck: 'USD', bucks: 'USD', 'us dollar': 'USD', 'us dollars': 'USD',
    euro: 'EUR', euros: 'EUR', eur: 'EUR',
    pound: 'GBP', pounds: 'GBP', gbp: 'GBP', sterling: 'GBP',
    yen: 'JPY', jpy: 'JPY',
    shekel: 'ILS', shekels: 'ILS', ils: 'ILS', nis: 'ILS',
    franc: 'CHF', francs: 'CHF', chf: 'CHF',
    won: 'KRW', krw: 'KRW',
    ruble: 'RUB', rubles: 'RUB', rub: 'RUB',
    rupee: 'INR', rupees: 'INR', inr: 'INR',
    yuan: 'CNY', cny: 'CNY', renminbi: 'CNY',
    cad: 'CAD', aud: 'AUD', nzd: 'NZD', hkd: 'HKD', sgd: 'SGD',
    real: 'BRL', reais: 'BRL', brl: 'BRL',
    peso: 'MXN', mxn: 'MXN', ars: 'ARS', cop: 'COP', clp: 'CLP',
    dirham: 'AED', aed: 'AED',
    lira: 'TRY', 'try': 'TRY',
    krona: 'SEK', sek: 'SEK', krone: 'DKK', dkk: 'DKK', nok: 'NOK',
    zloty: 'PLN', pln: 'PLN', forint: 'HUF', huf: 'HUF',
    baht: 'THB', thb: 'THB', ringgit: 'MYR', myr: 'MYR',
    bitcoin: 'BTC', btc: 'BTC', ethereum: 'ETH', eth: 'ETH',
};

function resolveCurrency(str) {
    const key = str.trim().toLowerCase();
    if (CURRENCY_MAP[key]) return CURRENCY_MAP[key];
    if (CURRENCY_MAP[str.trim()]) return CURRENCY_MAP[str.trim()];
    
    // Only fallback to ISO code if it strictly looks like a 3-letter code
    const upper = str.trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(upper)) return upper;
    
    return null;
}

// City / region -> IANA timezone
const TIMEZONE_MAP = {
    'new york': 'America/New_York', 'nyc': 'America/New_York', 'new york city': 'America/New_York',
    'los angeles': 'America/Los_Angeles', 'la': 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles',
    'chicago': 'America/Chicago', 'dallas': 'America/Chicago', 'houston': 'America/Chicago',
    'denver': 'America/Denver', 'phoenix': 'America/Phoenix',
    'seattle': 'America/Los_Angeles', 'portland': 'America/Los_Angeles',
    'toronto': 'America/Toronto', 'montreal': 'America/Toronto', 'canada east': 'America/Toronto',
    'vancouver': 'America/Vancouver', 'canada west': 'America/Vancouver',
    'sao paulo': 'America/Sao_Paulo', 'brazil': 'America/Sao_Paulo', 'rio': 'America/Sao_Paulo',
    'mexico city': 'America/Mexico_City', 'mexico': 'America/Mexico_City', 'cdmx': 'America/Mexico_City',
    'buenos aires': 'America/Argentina/Buenos_Aires', 'argentina': 'America/Argentina/Buenos_Aires',
    'santiago': 'America/Santiago', 'chile': 'America/Santiago',
    'london': 'Europe/London', 'uk': 'Europe/London', 'england': 'Europe/London',
    'paris': 'Europe/Paris', 'france': 'Europe/Paris',
    'berlin': 'Europe/Berlin', 'germany': 'Europe/Berlin', 'munich': 'Europe/Berlin',
    'rome': 'Europe/Rome', 'italy': 'Europe/Rome',
    'madrid': 'Europe/Madrid', 'spain': 'Europe/Madrid',
    'amsterdam': 'Europe/Amsterdam', 'netherlands': 'Europe/Amsterdam',
    'moscow': 'Europe/Moscow', 'russia': 'Europe/Moscow',
    'istanbul': 'Europe/Istanbul', 'turkey': 'Europe/Istanbul',
    'dubai': 'Asia/Dubai', 'uae': 'Asia/Dubai',
    'mumbai': 'Asia/Kolkata', 'india': 'Asia/Kolkata', 'new delhi': 'Asia/Kolkata', 'delhi': 'Asia/Kolkata',
    'bangkok': 'Asia/Bangkok', 'thailand': 'Asia/Bangkok',
    'singapore': 'Asia/Singapore',
    'hong kong': 'Asia/Hong_Kong', 'hk': 'Asia/Hong_Kong',
    'shanghai': 'Asia/Shanghai', 'beijing': 'Asia/Shanghai', 'china': 'Asia/Shanghai',
    'tokyo': 'Asia/Tokyo', 'japan': 'Asia/Tokyo',
    'seoul': 'Asia/Seoul', 'korea': 'Asia/Seoul',
    'sydney': 'Australia/Sydney', 'australia': 'Australia/Sydney', 'melbourne': 'Australia/Sydney',
    'auckland': 'Pacific/Auckland', 'new zealand': 'Pacific/Auckland', 'nz': 'Pacific/Auckland',
    'cape town': 'Africa/Johannesburg', 'south africa': 'Africa/Johannesburg', 'johannesburg': 'Africa/Johannesburg',
    'cairo': 'Africa/Cairo', 'egypt': 'Africa/Cairo'
};

function resolveTimezone(location) {
    return TIMEZONE_MAP[location.toLowerCase().trim()] ?? location.trim();
}

// Unit conversion table
const UNIT_MAP = {
    // Length
    km: { type: 'length', toBase: v => v * 1000 },
    kilometer: { type: 'length', toBase: v => v * 1000 },
    kilometers: { type: 'length', toBase: v => v * 1000 },
    m: { type: 'length', toBase: v => v },
    meter: { type: 'length', toBase: v => v },
    meters: { type: 'length', toBase: v => v },
    cm: { type: 'length', toBase: v => v / 100 },
    centimeter: { type: 'length', toBase: v => v / 100 },
    centimeters: { type: 'length', toBase: v => v / 100 },
    mm: { type: 'length', toBase: v => v / 1000 },
    millimeter: { type: 'length', toBase: v => v / 1000 },
    millimeters: { type: 'length', toBase: v => v / 1000 },
    mile: { type: 'length', toBase: v => v * 1609.344 },
    miles: { type: 'length', toBase: v => v * 1609.344 },
    mi: { type: 'length', toBase: v => v * 1609.344 },
    yard: { type: 'length', toBase: v => v * 0.9144 },
    yards: { type: 'length', toBase: v => v * 0.9144 },
    yd: { type: 'length', toBase: v => v * 0.9144 },
    foot: { type: 'length', toBase: v => v * 0.3048 },
    feet: { type: 'length', toBase: v => v * 0.3048 },
    ft: { type: 'length', toBase: v => v * 0.3048 },
    inch: { type: 'length', toBase: v => v * 0.0254 },
    inches: { type: 'length', toBase: v => v * 0.0254 },
    in: { type: 'length', toBase: v => v * 0.0254 },
    // Weight
    kg: { type: 'weight', toBase: v => v },
    kilogram: { type: 'weight', toBase: v => v },
    kilograms: { type: 'weight', toBase: v => v },
    g: { type: 'weight', toBase: v => v / 1000 },
    gram: { type: 'weight', toBase: v => v / 1000 },
    grams: { type: 'weight', toBase: v => v / 1000 },
    lb: { type: 'weight', toBase: v => v * 0.453592 },
    lbs: { type: 'weight', toBase: v => v * 0.453592 },
    pound: { type: 'weight', toBase: v => v * 0.453592 },
    pounds: { type: 'weight', toBase: v => v * 0.453592 },
    oz: { type: 'weight', toBase: v => v * 0.0283495 },
    ounce: { type: 'weight', toBase: v => v * 0.0283495 },
    ounces: { type: 'weight', toBase: v => v * 0.0283495 },
    tonne: { type: 'weight', toBase: v => v * 1000 },
    tonnes: { type: 'weight', toBase: v => v * 1000 },
    ton: { type: 'weight', toBase: v => v * 907.185 },  // short ton
    tons: { type: 'weight', toBase: v => v * 907.185 },
    // Temperature (special-cased in params)
    celsius: { type: 'temperature', toBase: v => v },
    c: { type: 'temperature', toBase: v => v },
    fahrenheit: { type: 'temperature', toBase: v => v },
    f: { type: 'temperature', toBase: v => v },
    kelvin: { type: 'temperature', toBase: v => v },
    k: { type: 'temperature', toBase: v => v },
    // Volume
    l: { type: 'volume', toBase: v => v },
    liter: { type: 'volume', toBase: v => v },
    liters: { type: 'volume', toBase: v => v },
    litre: { type: 'volume', toBase: v => v },
    litres: { type: 'volume', toBase: v => v },
    ml: { type: 'volume', toBase: v => v / 1000 },
    milliliter: { type: 'volume', toBase: v => v / 1000 },
    milliliters: { type: 'volume', toBase: v => v / 1000 },
    gallon: { type: 'volume', toBase: v => v * 3.78541 },
    gallons: { type: 'volume', toBase: v => v * 3.78541 },
    gal: { type: 'volume', toBase: v => v * 3.78541 },
    pint: { type: 'volume', toBase: v => v * 0.473176 },
    pints: { type: 'volume', toBase: v => v * 0.473176 },
    pt: { type: 'volume', toBase: v => v * 0.473176 },
    cup: { type: 'volume', toBase: v => v * 0.236588 },
    cups: { type: 'volume', toBase: v => v * 0.236588 },
    // Speed
    'km/h': { type: 'speed', toBase: v => v },
    'kph': { type: 'speed', toBase: v => v },
    'mph': { type: 'speed', toBase: v => v * 1.60934 },
    'mps': { type: 'speed', toBase: v => v * 3.6 },
    'knot': { type: 'speed', toBase: v => v * 1.852 },
    'knots': { type: 'speed', toBase: v => v * 1.852 },
    // Digital storage
    'b': { type: 'storage', toBase: v => v },
    'byte': { type: 'storage', toBase: v => v },
    'bytes': { type: 'storage', toBase: v => v },
    'kb': { type: 'storage', toBase: v => v * 1024 },
    'kilobyte': { type: 'storage', toBase: v => v * 1024 },
    'kilobytes': { type: 'storage', toBase: v => v * 1024 },
    'mb': { type: 'storage', toBase: v => v * 1024 ** 2 },
    'megabyte': { type: 'storage', toBase: v => v * 1024 ** 2 },
    'megabytes': { type: 'storage', toBase: v => v * 1024 ** 2 },
    'gb': { type: 'storage', toBase: v => v * 1024 ** 3 },
    'gigabyte': { type: 'storage', toBase: v => v * 1024 ** 3 },
    'gigabytes': { type: 'storage', toBase: v => v * 1024 ** 3 },
    'tb': { type: 'storage', toBase: v => v * 1024 ** 4 },
    'terabyte': { type: 'storage', toBase: v => v * 1024 ** 4 },
    'terabytes': { type: 'storage', toBase: v => v * 1024 ** 4 },
};

function resolveUnit(str) {
    return UNIT_MAP[str.trim().toLowerCase()] ?? null;
}
function cleanTail(str) {
    return str.replace(/[?!.,;:]+$/, '').trim();
}

function safeInt(str, defaultVal, min, max) {
    const n = parseInt(str ?? '', 10);
    const val = isNaN(n) ? defaultVal : n;
    if (min !== undefined && val < min) return min;
    if (max !== undefined && val > max) return max;
    return val;
}

function evalMath(expr) {
    if (typeof expr !== 'string' || expr.length === 0 || expr.length > 500) {
        throw new Error('Expression is empty or too long');
    }
    const safe = expr
        .replace(/\^/g, '**')
        .replace(/\bmod\b/gi, '%')
        .replace(/\bx\b/gi, '*')
        .replace(/[^0-9+\-*/%.() ]/g, '');
    if (!safe.trim()) throw new Error('Invalid expression');
    return Function(`"use strict"; return (${safe})`)();
}




const RULES_PART1 = [
    // HELP
    {
        tool: 'help',
        description: 'Lists all available tools and their usage examples.',
        examples: ['show commands', 'show commands weather', 'list all tools', 'show me all commands'],
        patterns: [
            /^show commands?(?:\s+(\w+))?\??$/i,
            /^show (?:me )?(?:all )?commands?(?:\s+for\s+(\w+))?\??$/i,
            /^show (?:me )?(?:all )?tools?(?:\s+for\s+(\w+))?\??$/i,
            /^list (?:all )?(?:commands?|tools?)(?:\s+(\w+))?\??$/i,
        ],
        params: m => {
            const toolName = m[1]?.toLowerCase().trim() ?? null;
            return { toolName }; // Handled specially by router
        },
    },

    // FETCH PAGE
    {
        tool: 'fetch_page',
        description: 'Fetches the content of a specific webpage or URL.',
        examples: ['fetch page https://example.com', 'read url https://github.com', 'get webpage content https://news.ycombinator.com'],
        patterns: [
            /^(?:fetch|read|get)\s+(?:page|url|webpage(?: content)?|content)\s+(https?:\/\/[^\s]+)$/i,
            /^(?:fetch|read|get)\s+(https?:\/\/[^\s]+)$/i,
        ],
        params: m => ({ url: m[1] }),
    },

    // CALCULATOR
    {
        tool: 'calculator',
        description: 'Evaluates arithmetic expressions.',
        examples: ['what is 12 * 34', 'calculate 100 / 4 + 7', '2^10', '500 mod 3'],
        patterns: [
            /^(?:what(?:'s| is) )?(?:calculate |compute |eval(?:uate)? )?(-?[\d.]+\s*[+\-*/^%]\s*.+)$/i,
            /^(?:calculate|compute|eval(?:uate)?)\s+(.+)$/i,
            /^(-?[\d.]+\s*(?:[+\-*/^%]|mod|x)\s*[\d.].*)$/i,
        ],
        params: m => {
            const expr = cleanTail(m[1]);
            const result = evalMath(expr);
            if (typeof result !== 'number' || !isFinite(result)) throw new Error('Invalid expression');
            return { expression: expr, result };
        },
    },

    // WEATHER
    {
        tool: 'weather',
        description: 'Fetches weather or forecast for a location.',
        examples: ['weather in Tokyo', "what's the forecast for Paris", 'temperature in Berlin', 'Tokyo weather'],
        patterns: [
            /^(?:what(?:'s| is)(?: the)?)?\s*weather(?:\s+like)?(?:\s+(?:in|at|for))?\s+(.+)/i,
            /^(?:what(?:'s| is)(?: the)?)?\s*(?:forecast|temperature|temp)(?:\s+(?:in|at|for))?\s+(.+)/i,
            /^how(?:'s| is)(?: the)? weather(?:\s+(?:in|at|for))?\s+(.+)/i,
            /^(?:is it|will it be)\s+(?:rain|snow|cold|hot|warm)\w*(?:\s+(?:in|at|for))?\s+(.+)/i,
            /^(.+)\s+weather\??$/i,
        ],
        params: m => ({ location: cleanTail(m[1]) }),
    },

    // TIME
    {
        tool: 'time',
        description: 'Gets the current time in a specific location.',
        examples: ['what time is it in London', 'current time in Tokyo', 'time in New York', 'London time'],
        patterns: [
            /^(?:what(?:'s| is)(?: the)?)?\s*(?:local\s+)?time\s+(?:in|at|for)\s+(.+)/i,
            /^what time is it(?:\s+(?:in|at|for|over in))\s+(.+)/i,
            /^current time\s+(?:in|at|for)\s+(.+)/i,
            /^(.+)\s+time\??$/i,
        ],
        params: m => ({ timezone: resolveTimezone(cleanTail(m[1])) }),
    },

    // DATE
    {
        tool: 'date',
        description: "Gets today's date or current local time.",
        examples: ["what's the date", 'what day is it', 'what time is it', "today's date"],
        patterns: [
            /^(?:what(?:'s| is)(?: the| today's)?)?\s*(?:date|day)(?: today)?\??$/i,
            /^(?:today(?:'s)?|current)\s+date\??$/i,
            /^what day is (?:it|today)\??$/i,
            /^what time is it\??$/i,
        ],
        params: () => ({ action: 'now' }),
    },

    {
        tool: 'currency',
        description: 'Converts an amount between currencies.',
        examples: ['100 USD to EUR', 'convert $50 to pounds', '200 euros in dollars'],
        patterns: [
            /^(?:how much is |convert )?([€£¥₪₹₩₺₽$]|R\$)\s*(\d+(?:[.,]\d+)?)\s+(?:in|to|into)\s+([A-Za-z]{2,20}(?:\s+[A-Za-z]+)?)/i,
            /^(?:how much is |convert )?(\d+(?:[.,]\d+)?)\s+([A-Za-z]{2,20}(?:\s+[A-Za-z]+)?)\s+(?:in|to|into)\s+([A-Za-z]{2,20}(?:\s+[A-Za-z]+)?)/i,
        ],
        params: m => {
            const isSymbolForm = /^[€£¥₪₹₩₺₽$]|^R\$/i.test(m[1]);
            const amountStr = isSymbolForm ? m[2] : m[1];
            const fromStr = isSymbolForm ? m[1] : m[2];
            const toStr = m[3];

            const from = resolveCurrency(fromStr);
            const to = resolveCurrency(toStr);

            if (!from || !to) {
                throw new Error("Unknown currency");
            }

            return {
                amount: parseFloat(amountStr.replace(',', '.')),
                from,
                to,
            };
        },
    },
];




const RULES_MAIN = [
    ...RULES_PART1,
    // DICE / COIN
    {
        tool: 'random',
        description: 'Rolls dice or flips a coin.',
        examples: ['roll a die', 'flip a coin', 'roll 2d6', 'roll d20', 'random number 1 to 100'],
        patterns: [
            /^(?:roll|throw)(?: a?n?)? ?(\d+)?d(\d+)\b/i,
            /^(?:roll|throw)(?: a)? di(?:e|ce)\b/i,
            /^flip(?: a)? coin\b/i,
            /^(?:random|rand)\s+(?:number\s+)?(?:between\s+)?(\d+)\s+(?:to|and|-)\s+(\d+)\b/i,
            /^(?:random|rand)\s+(?:number\s+)?(?:from\s+)?(\d+)\s+(?:to|and|-)\s+(\d+)\b/i,
        ],
        params: m => {
            const full = m[0];
            if (/coin/i.test(full)) return { mode: 'coin' };
            if (/random|rand/i.test(full)) {
                return { mode: 'range', min: safeInt(m[1], 1), max: safeInt(m[2], 100) };
            }
            // Dice
            const count = safeInt(m[1], 1, 1, 100);
            const sides = safeInt(m[2], 6, 2, 1000);
            return { mode: 'dice', count, sides };
        },
    },

    // IP LOOKUP
    {
        tool: 'ip',
        description: "Looks up info about an IP address, or returns the user's own IP.",
        examples: ['what is my ip', 'lookup ip 8.8.8.8', 'ip info 1.1.1.1'],
        patterns: [
            /^(?:what(?:'s| is) my ip(?: address)?|my ip|show my ip)\??$/i,
            /^(?:ip|lookup ip|ip info|ip lookup|whois)\s+([\d.]{7,15}|[0-9a-f:]{3,39})\b/i,
        ],
        params: m => ({
            target: m[1]?.trim() ?? 'self',
        }),
    },

    // LOCATION
    {
        tool: 'location',
        description: "Detects the user's geographic location.",
        examples: ['where am I', 'my location', 'find my location'],
        patterns: [
            /^(?:where am i(?:\s+located)?|my location|current location|locate me|find my location|show my location|what is my location)\??$/i,
        ],
        params: () => ({}),
    },

    // CLIPBOARD
    {
        tool: 'clipboard',
        description: "Reads the user's clipboard.",
        examples: ['read clipboard', 'what is in my clipboard'],
        patterns: [
            /^(?:read|get|check|show|paste)(?: me)?(?: my)? clipboard(?:\s+please)?\??$/i,
            /^what(?:'s| is) in(?: my)? clipboard\??$/i,
            /^clipboard\??$/i,
        ],
        params: () => ({}),
    },

    // WEB SEARCH
    {
        tool: 'websearch',
        description: 'Searches the web (DuckDuckGo fallback).',
        examples: ['search for TypeScript tutorials', 'look up climate change', 'google best pizza NYC', 'duckduckgo latest news', 'search the web for artificial intelligence'],
        patterns: [
            /^(?:search(?: the web| web)?(?: for)?|look up|google|bing|duckduckgo|ddg|find updates on|search on (?:google|duckduckgo|bing) for)\s+(.+)/i,
        ],
        params: m => ({ query: cleanTail(m[1]) }),
    },

    // WIKIPEDIA
    {
        tool: 'wikipedia',
        description: 'Fetches a Wikipedia summary for a topic.',
        examples: ['tell me about black holes', 'explain quantum entanglement', 'who is Ada Lovelace'],
        patterns: [
            /^(?:tell me about|explain|define) (.+)/i,
            /^(?:wiki|wikipedia)(?::| for| about)? (.+)/i,
            /^(?:what|who) (?:is|are|was|were) (?!your|this|that|it\b)(.+)/i,
        ],
        params: m => ({ query: cleanTail(m[1]) }),
    },

    // GAME
    {
        tool: 'start_game',
        description: 'Starts a game of Chess or Checkers in the chat.',
        examples: ['let\'s play chess', 'start a game of checkers', 'play chess', 'chess game please', 'can we play chess', 'checkers please'],
        patterns: [
            /^(?:let'?s\s+|can\s+(?:we|you)\s+|could\s+(?:we|you)\s+|would\s+you\s+like\s+to\s+|how\s+about\s+a\s+|i\s+want\s+to\s+|i'd\s+like\s+to\s+)?(?:play|start|launch|open)?\s*(?:a\s+)?(?:game\s+of\s+)?(chess|checkers)(?:\s+game)?(?:\s+please|\s+now|\s+with\s+me)?\??$/i,
            /^(?:play|start|new|open|launch)\s+(?:a\s+)?(?:game\s+of\s+)?(chess|checkers)\b/i,
            /^(chess|checkers)\s+(?:game|please|now)\b/i,
            /^(chess|checkers)$/i,
        ],
        params: m => ({ game: (m[1] || m[2] || '').toLowerCase(), ai_color: 'black' }),
    },
];




const RULES_PART2 = [
    // CONVERT
    {
        tool: 'convert',
        description: 'Converts units like length, weight, volume, speed, and digital storage.',
        examples: ['convert 5 km to miles', '100 fahrenheit to celsius', 'how many MB is 2 GB'],
        patterns: [
            /^(?:convert )?(\d+(?:\.\d+)?)\s*([a-zA-Z/]+)\s+(?:to|in(?:to)?)\s+([a-zA-Z/]+)$/i,
            /^(?:how many )?([a-zA-Z/]+)(?: is| are| in) (\d+(?:\.\d+)?)\s*([a-zA-Z/]+)\??$/i,
        ],
        params: m => {
            let val, fromStr, toStr;
            if (m[2] && m[3] && !m[0].toLowerCase().startsWith('how')) {
                val = m[1]; fromStr = m[2]; toStr = m[3];
            } else {
                toStr = m[1]; val = m[2]; fromStr = m[3];
            }
            const TEMP_UNITS = new Set(['celsius','fahrenheit','kelvin','c','f','k']);
            const fromOk = resolveUnit(fromStr) || TEMP_UNITS.has(fromStr.toLowerCase());
            const toOk = resolveUnit(toStr) || TEMP_UNITS.has(toStr.toLowerCase());
            if (!fromOk) throw new Error(`Unknown unit: ${fromStr}`);
            if (!toOk) throw new Error(`Unknown unit: ${toStr}`);
            return {
                amount: parseFloat(val),
                from: fromStr,
                to: toStr
            };
        },
    },

    // UUID
    {
        tool: 'uuid',
        description: 'Generates one or more UUIDs.',
        examples: ['generate a uuid', 'create 5 uuids', 'random uuid'],
        patterns: [
            /(?:generate|create|make|give me)(?: a)?(?: (\d+))? uuids?/i,
            /^(\d+) uuids?$/i,
            /^random uuids?$/i,
        ],
        params: m => ({ count: safeInt(m[1] ?? m[2], 1, 1, 20) }),
    },

    // PASSWORD
    {
        tool: 'password',
        description: 'Generates a random secure password.',
        examples: ['generate a password', 'create a 24-character password', 'password no symbols'],
        patterns: [
            /(?:generate|create|make|give me).+passwords?/i,
            /^(?:random )?passwords?.*$/i,
        ],
        params: m => {
            const full = m[0];
            const lenMatch = full.match(/(\d+)\s*[-\s]?(?:char|character|length|long)/i);
            const countMatch = full.match(/(\d+)\s+passwords?/i);
            return {
                length: safeInt(lenMatch?.[1], 16, 6, 128),
                count: safeInt(countMatch?.[1], 1, 1, 10),
                symbols: !/no[\s-]?symbols?/i.test(full),
                uppercase: !/no[\s-]?upper(?:case)?/i.test(full),
                digits: !/no[\s-]?(?:digit|number)s?/i.test(full),
            };
        },
    },

    // TIMER
    {
        tool: 'timer',
        description: 'Sets a countdown timer.',
        examples: ['set a timer for 10 minutes', 'start a 30-second timer', 'timer for 1.5 hours', '10 minute timer'],
        patterns: [
            /^(?:set|start|create)?\s*(?:a\s+)?(?:timer|countdown)(?:\s+for)?\s+(\d+(?:\.\d+)?)\s*(hour|hr|h|minute|min|m|second|sec|s)s?\b/i,
            /^(\d+(?:\.\d+)?)\s*(hour|hr|h|minute|min|m|second|sec|s)s?\s+(?:timer|countdown)\b/i,
            /^(?:remind me in)\s+(\d+(?:\.\d+)?)\s*(hour|hr|h|minute|min|m|second|sec|s)s?\b/i,
            /^(?:set|start|create)?\s*(?:a\s+)?(\d+(?:\.\d+)?)\s*[-\s]?(hour|hr|h|minute|min|m|second|sec|s)s?\s+(?:timer|countdown)\b/i,
        ],
        params: m => {
            const v = parseFloat(m[1]), u = m[2].toLowerCase();
            const seconds = /^h/.test(u) ? v * 3600 : /^m/.test(u) ? v * 60 : v;
            return { seconds: Math.round(seconds), label: `Timer (${m[1]} ${m[2]})` };
        },
    },

    // COUNTDOWN
    {
        tool: 'countdown',
        description: 'Counts down days until a specific date or event.',
        examples: ['how many days until Christmas', 'countdown to New Year', 'days until July 4'],
        patterns: [
            /(?:how (?:many|long) (?:days? )?(?:until|till|to|before))\s+(.+)/i,
            /(?:countdown to|days? until|days? till)\s+(.+)/i,
        ],
        params: m => ({ target: cleanTail(m[1]) }),
    },

    // BASE64
    {
        tool: 'base64',
        description: 'Encodes or decodes a Base64 string.',
        examples: ['base64 encode hello world', 'decode base64 aGVsbG8=', 'base64 decode SGVsbG8gV29ybGQ='],
        patterns: [
            /^base64 (?:en)?code (.+)/i,
            /^base64 decode (.+)/i,
            /^(?:encode|decode) (?:in |to |from )?base64[:\s]+(.+)/i,
        ],
        params: m => {
            const full = m[0];
            const mode = /decode/i.test(full) ? 'decode' : 'encode';
            return { mode, value: m[1].trim() };
        },
    },

    // COLOR
    {
        tool: 'color',
        description: 'Converts between color formats (hex, rgb, hsl) or looks up a color.',
        examples: ['color #ff5733', 'rgb 255 87 51', 'what color is #00bcd4', 'convert #3498db to rgb'],
        patterns: [
            /^(?:color|colour)\s+(#[0-9a-f]{3,8})\b/i,
            /^(?:(?:color|colour)\s+)?(?:rgb\s*)?\(?(\d{1,3})[,\s]+(\d{1,3})[,\s]+(\d{1,3})\)?/i,
            /^(?:what (?:color|colour) is|convert color)\s+(#[0-9a-f]{3,8})\b/i,
            /^(?:convert (?:(?:color|colour)\s*)?)?#([0-9a-f]{3,8})\s*(?:to |in )?(rgb|hsl|hsv|cmyk)/i,
        ],
        params: m => {
            const full = m[0];
            if (/\d{1,3}[,\s]+\d{1,3}[,\s]+\d{1,3}/.test(full) && !/#/.test(m[1] ?? '')) {
                return { mode: 'rgb', r: parseInt(m[1]), g: parseInt(m[2]), b: parseInt(m[3]) };
            }
            return { mode: 'hex', hex: (m[1] ?? '').replace('#', '') };
        },
    },
];






// Combine all rules properly. To avoid duplicates since I put some in rules.js and some in rules-part2.js
const uniqueRules = new Map();
RULES_MAIN.forEach(r => uniqueRules.set(r.tool, r));
RULES_PART2.forEach(r => uniqueRules.set(r.tool, r));
const ALL_RULES = Array.from(uniqueRules.values());

class ToolTriggerHandler {
    match(input) {
        if (!input) return null;
        const text = input.trim();
        if (text.length < 2) return null;

        for (let i = 0; i < ALL_RULES.length; i++) {
            const rule = ALL_RULES[i];
            for (let j = 0; j < rule.patterns.length; j++) {
                const pattern = rule.patterns[j];
                const m = text.match(pattern);
                if (m) {
                    try {
                        return { tool: rule.tool, params: rule.params(m) };
                    } catch (e) {
                        console.warn(`[ToolTriggerHandler] param error for tool "${rule.tool}":`, e.message);
                    }
                }
            }
        }
        return null;
    }

    matchAll(input) {
        const text = (input ?? '').trim();
        const results = [];

        for (let i = 0; i < ALL_RULES.length; i++) {
            const rule = ALL_RULES[i];
            for (let j = 0; j < rule.patterns.length; j++) {
                const pattern = rule.patterns[j];
                const m = text.match(pattern);
                if (m) {
                    try {
                        results.push({ tool: rule.tool, params: rule.params(m) });
                    } catch (_) { }
                }
            }
        }
        return results;
    }

    describe(toolName) {
        const rules = toolName
            ? ALL_RULES.filter(r => r.tool === toolName.toLowerCase())
            : ALL_RULES;
        if (toolName && !rules.length) return `Unknown tool: "${toolName}"`;
        return rules.map(r =>
            `?"  ${r.tool.padEnd(12)} ${r.description}\n` +
            `   Examples: ${r.examples.map(e => `"${e}"`).join('  |  ')}`
        ).join('\n\n');
    }

    get tools() {
        return [...new Set(ALL_RULES.map(r => r.tool))];
    }
}

const toolRouter = new ToolTriggerHandler();

  global.JAMES_TOOL_ROUTER = { toolRouter, ALL_RULES };
})(typeof window !== 'undefined' ? window : globalThis);
