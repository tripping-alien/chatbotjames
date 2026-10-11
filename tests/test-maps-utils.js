// Run with: node tests/test-maps-utils.js
import { cleanTail, safeInt, evalMath } from '../tools/utils.js';
import { resolveCurrency, resolveTimezone, resolveUnit, CURRENCY_MAP, TIMEZONE_MAP } from '../tools/maps.js';

let failed = 0;
const check = (name, cond, extra = '') => {
    if (cond) {
        console.log(`PASS: ${name}`);
    } else {
        console.error(`FAIL: ${name} ${extra}`);
        failed++;
    }
};

console.log('--- Utils Tests ---');

// 1. cleanTail
check('cleanTail strips trailing question marks', cleanTail('what is the time???') === 'what is the time');
check('cleanTail strips mixed punctuation', cleanTail('hello world!?.,;:') === 'hello world');
check('cleanTail preserves internal punctuation', cleanTail('e.g., 3.14') === 'e.g., 3.14');

// 2. safeInt
check('safeInt parses valid number', safeInt('42', 0) === 42);
check('safeInt uses default for null/undefined/invalid', safeInt(null, 10) === 10 && safeInt('abc', 5) === 5);
check('safeInt clamps to min', safeInt('2', 10, 5, 20) === 5);
check('safeInt clamps to max', safeInt('100', 10, 5, 20) === 20);

// 3. evalMath
check('evalMath basic addition', evalMath('2 + 3') === 5);
check('evalMath operator precedence', evalMath('2 + 3 * 4') === 14);
check('evalMath parenthesis', evalMath('(2 + 3) * 4') === 20);
check('evalMath power ^ operator', evalMath('2^10') === 1024);
check('evalMath mod operator', evalMath('100 mod 7') === 2);
check('evalMath x as multiply', evalMath('5 x 6') === 30);

let evalMathError = false;
try {
    evalMath('');
} catch (e) {
    evalMathError = true;
}
check('evalMath rejects empty input', evalMathError);

let evalMathSanitized = false;
try {
    evalMath('process.exit(1)');
} catch (e) {
    evalMathSanitized = true;
}
check('evalMath sanitizes malicious code', evalMathSanitized);

console.log('\n--- Maps & Resolvers Tests ---');

// 4. resolveCurrency
check('resolveCurrency symbols $ -> USD', resolveCurrency('$') === 'USD');
check('resolveCurrency symbols € -> EUR', resolveCurrency('€') === 'EUR');
check('resolveCurrency symbols £ -> GBP', resolveCurrency('£') === 'GBP');
check('resolveCurrency symbols ¥ -> JPY', resolveCurrency('¥') === 'JPY');
check('resolveCurrency names "dollars" -> USD', resolveCurrency('dollars') === 'USD');
check('resolveCurrency names "shekels" -> ILS', resolveCurrency('shekels') === 'ILS');
check('resolveCurrency 3-letter ISO code "CAD"', resolveCurrency('CAD') === 'CAD');
check('resolveCurrency unknown returns null', resolveCurrency('xyzunknown') === null);

// 5. resolveTimezone
check('resolveTimezone "tokyo" -> Asia/Tokyo', resolveTimezone('tokyo') === 'Asia/Tokyo');
check('resolveTimezone "london" -> Europe/London', resolveTimezone('london') === 'Europe/London');
check('resolveTimezone "new york" -> America/New_York', resolveTimezone('new york') === 'America/New_York');
check('resolveTimezone "paris" -> Europe/Paris', resolveTimezone('paris') === 'Europe/Paris');
check('resolveTimezone "sydney" -> Australia/Sydney', resolveTimezone('sydney') === 'Australia/Sydney');

// 6. resolveUnit
check('resolveUnit "km"', !!resolveUnit('km'));
check('resolveUnit "miles"', !!resolveUnit('miles'));
check('resolveUnit "kg"', !!resolveUnit('kg'));
check('resolveUnit "gb"', !!resolveUnit('gb'));
check('resolveUnit unknown returns null', resolveUnit('nonexistent_unit_xyz') === null);

console.log(failed === 0 ? '\nALL MAPS & UTILS TESTS PASSED' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
