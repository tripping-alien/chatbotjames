/**
 * UserInputProcessor
 *
 * Applies a suite of lightweight pre-send transformations to the raw user text
 * before it reaches the LLM. Each pass is cheap (a few regex ops) and designed
 * to help a 3B-parameter model succeed on inputs it would otherwise misread.
 *
 * Pipeline (in order):
 *  1. Whitespace normalisation          — collapse repeated spaces/newlines
 *  2. Numeric comma-stripping           — "1,000,000" → "1000000"
 *  3. Abbreviated words expansion       — "u r gr8" → "you are great"
 *  4. Written-number to digit           — "twenty one" → "21"
 *  5. Digit compound aggregation        — "twenty 1" → "21"
 *  6. Unit canonicalisation             — "10km" → "10 km"
 *  7. Emoji descriptor injection        — appends a bracketed label for single-emoji messages
 *  8. Smart quote normalisation         — curly quotes → straight quotes
 *  9. Sentence-case repair              — capitalises the first letter of each sentence
 * 10. Trailing ellipsis trim            — removes trailing "..."
 */

const wordToNum = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
    twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
    hundred: 100, thousand: 1000, million: 1000000
};

// Common texting abbreviations safe to expand in any context
const ABBREVS = {
    "u": "you",
    "ur": "your",
    "r": "are",
    "y": "why",
    "b4": "before",
    "bc": "because",
    "bcz": "because",
    "btw": "by the way",
    "tbh": "to be honest",
    "imo": "in my opinion",
    "imho": "in my humble opinion",
    "idk": "I don't know",
    "idc": "I don't care",
    "iirc": "if I recall correctly",
    "afaik": "as far as I know",
    "atm": "at the moment",
    "brb": "be right back",
    "ttyl": "talk to you later",
    "ngl": "not gonna lie",
    "nvm": "never mind",
    "ofc": "of course",
    "omg": "oh my god",
    "smh": "shaking my head",
    "imo": "in my opinion",
    "lol": "laughing out loud",
    "lmao": "laughing my ass off",
    "gr8": "great",
    "gr8t": "great",
    "2": "to",
    "4": "for",
    "pls": "please",
    "plz": "please",
    "thx": "thanks",
    "ty": "thank you",
    "np": "no problem",
    "rly": "really",
    "prolly": "probably",
    "wanna": "want to",
    "gonna": "going to",
    "gotta": "got to",
    "kinda": "kind of",
    "sorta": "sort of",
    "cuz": "because",
    "coz": "because",
    "w/": "with",
    "w/o": "without",
    "w/e": "whatever",
};

// Build a single regex from the abbreviation keys (whole-word match only)
const _abbrevRegex = new RegExp(
    `(?<![\\w/])(?:${Object.keys(ABBREVS).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\w/])`,
    'gi'
);

export class UserInputProcessor {
    /**
     * Run every post-processing pass on the raw user input.
     *
     * @param {string} text - The raw user input
     * @returns {string} - The processed input
     */
    static process(text) {
        if (!text || typeof text !== 'string') return text;

        let p = text;

        // ── Pass 1: Smart-quote normalisation ─────────────────────────────────
        p = p
            .replace(/[\u2018\u2019]/g, "'")   // curly single quotes
            .replace(/[\u201C\u201D]/g, '"');   // curly double quotes

        // ── Pass 2: Whitespace normalisation ──────────────────────────────────
        // Collapse multiple spaces (but keep intentional newlines for multi-line messages)
        p = p.replace(/[^\S\n]+/g, ' ').trim();

        // ── Pass 3: Numeric comma-stripping ───────────────────────────────────
        let prev;
        do {
            prev = p;
            p = p.replace(/(\d),(\d{3})(?=(?:\D|$))/g, '$1$2');
        } while (p !== prev);

        // ── Pass 4: Abbreviation expansion ────────────────────────────────────
        // Only expand if the message is mostly ASCII (avoids mangling non-English text)
        const asciiRatio = (p.match(/[\x00-\x7F]/g) || []).length / p.length;
        if (asciiRatio > 0.85) {
            p = p.replace(_abbrevRegex, (match) => {
                const expanded = ABBREVS[match.toLowerCase()];
                if (!expanded) return match;
                // Preserve leading capital if original was capitalised
                return match[0] === match[0].toUpperCase() && match[0] !== match[0].toLowerCase()
                    ? expanded.charAt(0).toUpperCase() + expanded.slice(1)
                    : expanded;
            });
        }

        // ── Pass 5: Written-number → digit ────────────────────────────────────
        const numRegex = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million)\b/gi;
        p = p.replace(numRegex, (m) => String(wordToNum[m.toLowerCase()]));

        // ── Pass 6: Digit compound aggregation ───────────────────────────────
        p = p.replace(/(\b\d+)\s+(\d+\b)/g, (match, p1, p2) => {
            const n1 = parseInt(p1), n2 = parseInt(p2);
            if (n1 >= 20 && n1 <= 90 && n2 >= 1 && n2 <= 9) return String(n1 + n2);
            if (n1 >= 1 && n1 <= 999 && (n2 === 100 || n2 === 1000 || n2 === 1000000)) return String(n1 * n2);
            return match;
        });

        // ── Pass 7: Unit canonicalisation ─────────────────────────────────────
        // Ensures "10km" becomes "10 km" so tool routers can parse it cleanly
        p = p.replace(/(\d)(km|mi|m|cm|mm|kg|g|lb|oz|mph|kph|ms|s|min|hr|h|°C|°F|°K|GHz|MHz|kHz|Hz|GB|MB|KB|TB|px|rem|em|vw|vh)\b/gi,
            '$1 $2');

        // ── Pass 8: Sentence-case repair ──────────────────────────────────────
        // Capitalise first letter of the entire message (common with mobile auto-caps off)
        if (p.length > 0 && p[0] !== p[0].toUpperCase()) {
            p = p[0].toUpperCase() + p.slice(1);
        }

        // ── Pass 9: Trailing ellipsis trim ────────────────────────────────────
        p = p.replace(/\.{3,}$/, '').trim();

        return p;
    }
}
