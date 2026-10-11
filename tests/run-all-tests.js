// Run all test suites: node tests/run-all-tests.js
import { spawn } from 'child_process';
import path from 'path';

const testSuites = [
    { name: 'Prompt Tiers & Device Budgets', file: 'tests/test-prompt-tiers.js' },
    { name: 'Tool Trigger Regex Rules', file: 'tests/test-regex.js' },
    { name: 'Physics & Scientific Math', file: 'tests/test-physics.js' },
    { name: 'User Input Processor', file: 'tests/test-input-processor.js' },
    { name: 'Tool Trigger Router', file: 'tests/test-tools-router.js' },
    { name: 'Maps & Helper Utilities', file: 'tests/test-maps-utils.js' },
    { name: 'Tool Aliases & Freeze Regression Guard', file: 'tests/test-tool-aliases.js' },
    { name: 'SmallTalk & Instant Canned Handlers', file: 'tests/test-smalltalk.js' },
    { name: 'Last Model Persistence & Reload', file: 'tests/test-last-preset.js' },
];

async function runSuite(suite) {
    return new Promise((resolve) => {
        const start = performance.now();
        const proc = spawn(process.execPath, [suite.file], { stdio: 'pipe' });
        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (d) => { stdout += d.toString(); });
        proc.stderr.on('data', (d) => { stderr += d.toString(); });

        proc.on('close', (code) => {
            const elapsed = Math.round(performance.now() - start);
            const passCount = (stdout.match(/PASS:/g) || []).length;
            const failCount = (stdout.match(/FAIL:/g) || []).length + (stderr ? 1 : 0);
            resolve({
                ...suite,
                code,
                elapsed,
                passCount,
                failCount,
                output: stdout,
                error: stderr
            });
        });
    });
}

console.log('================================================================');
console.log('             JAMES CHATBOT TEST SUITE RUNNER                   ');
console.log('================================================================\n');

let totalPass = 0;
let totalFail = 0;
let hasError = false;

for (const suite of testSuites) {
    const res = await runSuite(suite);
    const status = res.code === 0 && res.failCount === 0 ? '✓ PASS' : '✗ FAIL';
    console.log(`${status.padEnd(8)} | ${suite.name.padEnd(42)} | ${String(res.passCount).padStart(3)} passed | ${String(res.elapsed).padStart(4)}ms`);

    totalPass += res.passCount;
    totalFail += res.failCount;

    if (res.code !== 0 || res.failCount > 0) {
        hasError = true;
        if (res.output) console.log(res.output);
        if (res.error) console.error(res.error);
    }
}

console.log('\n----------------------------------------------------------------');
console.log(`TOTAL: ${totalPass} passed, ${totalFail} failed across ${testSuites.length} test suites.`);
console.log('================================================================\n');

process.exit(hasError ? 1 : 0);
