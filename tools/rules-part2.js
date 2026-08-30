import { resolveUnit } from './maps.js';
import { safeInt, cleanTail } from './router.js';

export const RULES = [
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
            // Pattern 1 ("convert X unitA to unitB") always has a numeric m[1].
            // Pattern 2 ("[how many] unitA is X unitB") always has a unit-word m[1].
            // Checking m[1] itself is reliable; checking whether the whole match
            // starts with "how" is not, since "how many " is optional in pattern 2 —
            // "MB is 2 GB" (no "how many") matched pattern 2 but fell into the wrong
            // branch here, assigning "2" as fromStr and throwing "Unknown unit: 2".
            if (/^\d/.test(m[1])) {
                val = m[1]; fromStr = m[2]; toStr = m[3];
            } else {
                toStr = m[1]; val = m[2]; fromStr = m[3];
            }
            const TEMP_UNITS = ['celsius','fahrenheit','kelvin','c','f','k'];
            const fromOk = resolveUnit(fromStr) || TEMP_UNITS.includes(fromStr.toLowerCase());
            const toOk = resolveUnit(toStr) || TEMP_UNITS.includes(toStr.toLowerCase());
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
            /(?:generate|create|make|give me)(?: (\d+))? uuids?/i,
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
            /(?:generate|create|make|give me)(?: a)? (?:secure |random )?passwords?/i,
            /^random password$/i,
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
            /^(?:set|start|create)?\s*(?:a\s+)?timer(?:\s+for)?\s+(\d+(?:\.\d+)?)\s*(hour|hr|h|minute|min|m|second|sec|s)\b/i,
            /^(\d+(?:\.\d+)?)\s*(hour|hr|h|minute|min|m|second|sec|s)\s+timer\b/i,
            /^(?:remind me in)\s+(\d+(?:\.\d+)?)\s*(hour|hr|h|minute|min|m|second|sec|s)\b/i,
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
            /^(?:color|colour)\s+(?:rgb\s*)?\(?(\d{1,3})[,\s]+(\d{1,3})[,\s]+(\d{1,3})\)?/i,
            /^(?:what (?:color|colour) is|convert color)\s+(#[0-9a-f]{3,8})\b/i,
            /^(?:convert (?:color|colour) )?#([0-9a-f]{3,6}) (?:to |in )?(rgb|hsl|hsv|cmyk)/i,
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
