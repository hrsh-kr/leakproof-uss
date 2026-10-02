// Checks every external link on the built site. Run: node scripts/check-links.mjs   (needs network; not part of npm test)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const links = new Map();
for (const f of fs.readdirSync(PUB).filter((x) => x.endsWith('.html'))) {
  for (const m of fs.readFileSync(path.join(PUB, f), 'utf8').matchAll(/href="(https?:\/\/[^"#]+)/g)) {
    if (!links.has(m[1])) links.set(m[1], []);
    links.get(m[1]).push(f);
  }
}
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
async function check(url) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const r = await fetch(url, { method, redirect: 'follow', headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(20000) });
      if (r.ok) return { url, status: r.status, ok: true };
      if (method === 'GET') return { url, status: r.status, ok: false };
    } catch (e) { if (method === 'GET') return { url, status: 0, ok: false, error: String(e.cause?.code || e.message) }; }
  }
}
const results = [];
for (const url of links.keys()) results.push(await check(url));
for (const r of results) console.log((r.ok ? 'OK  ' : 'FAIL') + ' ' + String(r.status).padEnd(3) + ' ' + r.url + (r.error ? '  ' + r.error : '') + (r.ok ? '' : '  (in ' + [...new Set(links.get(r.url))].join(', ') + ')'));
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length} links, ${bad.length} not reachable`);
process.exit(bad.length ? 1 : 0);
