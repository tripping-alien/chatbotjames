import { safeInt, cleanTail } from './utils.js';
import { RULES as firstRules } from './rules-part1.js';

export const RULES = [
    ...firstRules,
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
        examples: ['search for TypeScript tutorials', 'look up climate change', 'google best pizza NYC', 'search the web for artificial intelligence'],
        patterns: [
            /^(?:search(?: the web| web)?(?: for)?|look up|google|bing|find updates on|search on google for)\s+(.+)/i,
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
        params: m => ({ game: (m[1] || m[2] || '').toLowerCase() }),
    },
];
