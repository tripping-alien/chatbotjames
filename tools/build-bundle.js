import fs from 'fs';
import path from 'path';

export function buildToolRouterBundle() {
    const maps = fs.readFileSync('tools/maps.js', 'utf8')
        .replace(/^export\s+/gm, '')
        .replace(/import\s+.*?;/g, '');
        
    const utils = fs.readFileSync('tools/utils.js', 'utf8')
        .replace(/^export\s+/gm, '')
        .replace(/import\s+.*?;/g, '');
        
    const r1 = fs.readFileSync('tools/rules-part1.js', 'utf8')
        .replace(/^export\s+const\s+RULES\s*=/m, 'const RULES_PART1 =')
        .replace(/import\s+.*?;/g, '');
        
    const r2 = fs.readFileSync('tools/rules.js', 'utf8')
        .replace(/import\s+.*?;/g, '')
        .replace(/\.\.\.firstRules/g, '...RULES_PART1')
        .replace(/^export\s+const\s+RULES\s*=/m, 'const RULES_MAIN =');
        
    const r3 = fs.readFileSync('tools/rules-part2.js', 'utf8')
        .replace(/^export\s+const\s+RULES\s*=/m, 'const RULES_PART2 =')
        .replace(/import\s+.*?;/g, '');
        
    const router = fs.readFileSync('tools/router.js', 'utf8')
        .replace(/import\s+.*?;/g, '')
        .replace(/RULES\.forEach/g, 'RULES_MAIN.forEach')
        .replace(/rulesPart2\.forEach/g, 'RULES_PART2.forEach')
        .replace(/^export\s+/gm, '');

    const full = `// Standalone bundle of JAMES Tool Router for offline & file:/// execution
(function(global) {
  'use strict';
${maps}
${utils}
${r1}
${r2}
${r3}
${router}
  global.JAMES_TOOL_ROUTER = { toolRouter, ALL_RULES };
})(typeof window !== 'undefined' ? window : globalThis);
`;

    fs.writeFileSync('tools/tool-router-bundle.js', full);
    console.log('[build-bundle] tools/tool-router-bundle.js updated successfully (' + full.length + ' bytes).');
}

if (process.argv[1] && process.argv[1].endsWith('build-bundle.js')) {
    buildToolRouterBundle();
}
