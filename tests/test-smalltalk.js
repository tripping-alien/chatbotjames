// Run with: node tests/test-smalltalk.js
import { smallTalk } from '../nlp/smalltalk.js';

let failed = 0;
const check = (name, cond, extra = '') => {
    if (cond) {
        console.log(`PASS: ${name}`);
    } else {
        console.error(`FAIL: ${name} ${extra}`);
        failed++;
    }
};

console.log('--- SmallTalk Handler & Pattern Expansion Tests ---');

// 1. Core greetings & fuzzy matching
check('matches "hello"', !!smallTalk.match('hello'));
check('matches typo "helo" via fuzzy', !!smallTalk.match('helo'));
check('matches with james prefix "james hello"', !!smallTalk.match('james hello'));
check('matches with trailing punctuation "hey!"', !!smallTalk.match('hey!'));

// 2. Newly added Privacy & Offline patterns
check('matches "is this private"', !!smallTalk.match('is this private'));
check('matches "is my data safe"', !!smallTalk.match('is my data safe'));
check('matches "can i use this offline"', !!smallTalk.match('can i use this offline'));

// 3. Newly added WebGPU & Hardware patterns
check('matches "is this using my gpu"', !!smallTalk.match('is this using my gpu'));
check('matches "why is my fan spinning"', !!smallTalk.match('why is my fan spinning'));

// 4. Newly added Feature & Tool Guidance
check('matches "how do i play chess"', !!smallTalk.match('how do i play chess'));
check('matches "can you run python"', !!smallTalk.match('can you run python'));

// 5. Well-Wishes & Courtesies
check('matches "good night"', !!smallTalk.match('good night'));
check('matches "have a good weekend"', !!smallTalk.match('have a good weekend'));
check('matches "wish me luck"', !!smallTalk.match('wish me luck'));
check('matches "i passed my exam"', !!smallTalk.match('i passed my exam'));

// 6. Multilingual additions
check('matches Hebrew "shalom"', !!smallTalk.match('shalom'));
check('matches Japanese "arigato"', !!smallTalk.match('arigato'));
check('matches German "danke"', !!smallTalk.match('danke'));
check('matches Russian "spasibo"', !!smallTalk.match('spasibo'));
check('matches French "merci"', !!smallTalk.match('merci'));

// 7. Geek & Pop Culture Easter Eggs
check('matches "beam me up scotty"', !!smallTalk.match('beam me up scotty'));
check('matches "the answer is 42"', !!smallTalk.match('the answer is 42'));
check('matches "knock knock"', !!smallTalk.match('knock knock'));
check('matches "rock paper scissors"', !!smallTalk.match('rock paper scissors'));

// 8. Negative checks (should NOT match real questions / complex queries)
check('does NOT match arbitrary question', smallTalk.match('What is the capital of Australia?') === null);
check('does NOT match code generation prompt', smallTalk.match('Write a function in python to sort an array') === null);
check('does NOT match scientific physics calculation', smallTalk.match('Calculate the lorentz factor for beta=0.8') === null);

console.log(failed === 0 ? '\nALL SMALLTALK TESTS PASSED' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
