// Run with: node tests/test-input-processor.js
import { UserInputProcessor } from '../core/input-processor.js';

let failed = 0;
const check = (name, actual, expected) => {
    if (actual === expected) {
        console.log(`PASS: ${name}`);
    } else {
        console.error(`FAIL: ${name}\n  Expected: "${expected}"\n  Actual:   "${actual}"`);
        failed++;
    }
};

console.log('--- UserInputProcessor Tests ---');

// 1. Smart quotes normalisation
check(
    'smart quotes normalisation',
    UserInputProcessor.process('“hello world” and ‘antigravity’'),
    '"Hello world" and \'antigravity\''
);

// 2. Whitespace normalisation
check(
    'whitespace normalisation',
    UserInputProcessor.process('hello    world    test'),
    'Hello world test'
);

// 3. Numeric comma-stripping
check(
    'numeric comma-stripping single',
    UserInputProcessor.process('population of 5,280 people'),
    'Population of 5280 people'
);
check(
    'numeric comma-stripping large',
    UserInputProcessor.process('1,000,000 dollars'),
    '1000000 dollars'
);

// 4. Abbreviation expansion
check(
    'abbreviations u r gr8',
    UserInputProcessor.process('u r gr8'),
    'You are great'
);
check(
    'abbreviations idk tbh',
    UserInputProcessor.process('idk tbh'),
    'I don\'t know to be honest'
);
check(
    'abbreviations btw and pls',
    UserInputProcessor.process('btw pls help me b4 tomorrow'),
    'By the way please help me before tomorrow'
);

// 5. Word-to-number and digit compound aggregation
check(
    'word to number single digit',
    UserInputProcessor.process('five books'),
    '5 books'
);
check(
    'compound number twenty one',
    UserInputProcessor.process('twenty one pilots'),
    '21 pilots'
);
check(
    'compound number five hundred',
    UserInputProcessor.process('five hundred miles'),
    '500 miles'
);
check(
    'compound number two thousand',
    UserInputProcessor.process('two thousand leagues'),
    '2000 leagues'
);

// 6. Unit canonicalisation
check(
    'unit canonicalisation 10km',
    UserInputProcessor.process('distance is 10km'),
    'Distance is 10 km'
);
check(
    'unit canonicalisation 50kg and 100mph',
    UserInputProcessor.process('50kg at 100mph'),
    '50 kg at 100 mph'
);

// 7. Sentence case repair
check(
    'sentence case capitalisation',
    UserInputProcessor.process('capitalise this prompt'),
    'Capitalise this prompt'
);

// 8. Trailing ellipsis trim
check(
    'trailing ellipsis trim',
    UserInputProcessor.process('thinking about this...'),
    'Thinking about this'
);

// 9. Null and empty handling
check('null input', UserInputProcessor.process(null), null);
check('empty input', UserInputProcessor.process(''), '');
check('non-string input', UserInputProcessor.process(42), 42);

console.log(failed === 0 ? '\nALL INPUT PROCESSOR TESTS PASSED' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
