import fs from 'fs';
import path from 'path';

function extractTriggers(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const triggers = [];
    const regex = /triggers:\s*\[([\s\S]*?)\]/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
        const arrStr = match[1];
        const stringRegex = /'([^']+)'|"([^"]+)"/g;
        let strMatch;
        while ((strMatch = stringRegex.exec(arrStr)) !== null) {
            triggers.push(strMatch[1] || strMatch[2]);
        }
    }
    return triggers;
}

const s1 = extractTriggers('smalltalk.js');
const s2 = extractTriggers('smalltalk-extra.js');
fs.writeFileSync('triggers.txt', s1.concat(s2).join('\n'));
console.log('Total triggers:', s1.length + s2.length);
