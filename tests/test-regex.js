import { RULES } from './tools/rules-part2.js';

const tests = [
    { tool: 'uuid', text: 'generate a uuid' },
    { tool: 'password', text: 'create a 24-character password' },
    { tool: 'password', text: 'password no symbols' },
    { tool: 'timer', text: 'set a timer for 10 minutes' },
    { tool: 'timer', text: 'start a 30-second timer' },
    { tool: 'timer', text: 'timer for 1.5 hours' },
    { tool: 'color', text: 'rgb 255 87 51' },
    { tool: 'color', text: 'convert #3498db to rgb' }
];

let failed = 0;
for (const t of tests) {
    const rule = RULES.find(r => r.tool === t.tool);
    let matched = false;
    for (const p of rule.patterns) {
        const m = t.text.match(p);
        if (m) {
            matched = true;
            try {
                rule.params(m); // verify params parsing doesn't crash
            } catch (e) {
                console.error(`FAIL: param parsing crashed for "${t.text}":`, e.message);
                failed++;
            }
            break;
        }
    }
    if (!matched) {
        console.error(`FAIL: did not match any regex for "${t.text}"`);
        failed++;
    } else {
        console.log(`PASS: "${t.text}"`);
    }
}
if (failed === 0) console.log("ALL PASSED");
