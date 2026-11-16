// CI gate: every test name that SECURITY.md cites (backticked, last column of its tables) must exist as a test title.
// Run from the repo root: node .github/ci/check-sec-tests.mjs
import fs from 'node:fs';
const md = fs.readFileSync('SECURITY.md', 'utf8').split(/^## 3\./m)[0];
const titles = fs.readdirSync('tests').filter((f) => f.endsWith('.test.mjs'))
  .flatMap((f) => [...fs.readFileSync(`tests/${f}`, 'utf8').matchAll(/\b(?:test|it)\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2]));
let bad = 0, n = 0;
for (const row of md.split('\n').filter((l) => /^\|/.test(l) && !/^\|[-| :]+\|$/.test(l))) {
  const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
  if (/^(ID|Valid bug)/.test(cells[0])) continue;
  for (const m of cells[cells.length - 1].matchAll(/`([^`]+)`/g)) {
    const name = m[1].replace(/…$|\.\.\.$/, '').trim(); n++;
    if (!titles.some((t) => t.includes(name))) { console.error(`MISSING test for "${cells[0].slice(0, 30)}": ${name}`); bad++; }
  }
}
console.log(`${n} cited test names, ${bad} missing, ${titles.length} tests found`);
if (n === 0) { console.error('no citations found: did the SECURITY.md table format change?'); process.exit(1); }
process.exit(bad ? 1 : 0);
