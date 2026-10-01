

import { RULES } from './rules.js';
import { RULES as rulesPart2 } from './rules-part2.js';

// Combine all rules properly. To avoid duplicates since I put some in rules.js and some in rules-part2.js
const uniqueRules = new Map();
RULES.forEach(r => uniqueRules.set(r.tool, r));
rulesPart2.forEach(r => uniqueRules.set(r.tool, r));
export const ALL_RULES = Array.from(uniqueRules.values());

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

export const toolRouter = new ToolTriggerHandler();
