import { resolveCurrency, resolveTimezone } from './maps.js';
import { cleanTail, evalMath } from './router.js';

export const RULES = [
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
