// Structure tests: the built site has no dead links, no unsafe DOM writes, and a coherent survey.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../scripts/build.mjs';
import { SECTIONS, flatten, visible } from '../src/js/survey-def.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public');
const pages = build();
const html = Object.fromEntries(pages.map((p) => [p, fs.readFileSync(path.join(PUB, p + '.html'), 'utf8')]));

test('every page builds, has one h1 (or a review shell), a title and no unresolved placeholders', () => {
  for (const p of pages) {
    assert.ok(!/\{\{[^}]*\}\}/.test(html[p]), `${p} has an unresolved placeholder`);
    assert.match(html[p], /<title>[^<]+ · LeakProof<\/title>/, `${p} title`);
    assert.match(html[p], /<html lang="en">/);
    const h1 = (html[p].match(/<h1[ >]/g) || []).length;
    if (!['review'].includes(p)) assert.equal(h1, 1, `${p} should have exactly one h1, has ${h1}`);
  }
});

test('internal links, anchors, scripts and styles all resolve', () => {
  const idsOf = (slug) => new Set([...html[slug].matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const slugOf = (p) => (p === '/' || p === '' ? 'index' : p.replace(/^\//, ''));
  const problems = [];
  for (const p of pages) {
    for (const m of html[p].matchAll(/\s(?:href|src)="([^"]+)"/g)) {
      const u = m[1];
      if (/^(https?:|mailto:|#$)/.test(u)) continue;
      if (u.startsWith('#')) { if (!idsOf(p).has(u.slice(1))) problems.push(`${p}: missing anchor ${u}`); continue; }
      const [pathPart, hash] = u.split('#');
      if (pathPart.startsWith('/js/') || pathPart.startsWith('/css/') || pathPart.startsWith('/data/')) { if (!fs.existsSync(path.join(PUB, pathPart))) problems.push(`${p}: missing file ${pathPart}`); continue; }
      const slug = slugOf(pathPart);
      if (!html[slug]) { problems.push(`${p}: dead link ${u}`); continue; }
      if (hash && !idsOf(slug).has(hash)) problems.push(`${p}: ${u} points to a missing anchor`);
    }
  }
  assert.deepEqual(problems, []);
});

test('no unsafe DOM writes or dynamic code in browser scripts', () => {
  const dir = path.join(ROOT, 'src', 'js');
  const banned = [/\.innerHTML\b/, /\.outerHTML\b/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new Function\s*\(/, /setTimeout\s*\(\s*['"`]/, /setInterval\s*\(\s*['"`]/];
  for (const f of fs.readdirSync(dir).filter((x) => /\.(js|mjs)$/.test(x))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const re of banned) assert.ok(!re.test(src), `${f} uses ${re}`);
  }
});

test('no third-party scripts or trackers are loaded', () => {
  for (const p of pages) for (const m of html[p].matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) assert.ok(m[1].startsWith('/js/'), `${p} loads ${m[1]}`);
});

test('survey definition is coherent', () => {
  const qs = flatten();
  const ids = qs.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length, 'question ids must be unique');
  const seen = new Set();
  for (const q of qs) {
    if (q.type === 'single' || q.type === 'multi') { assert.ok(q.options && q.options.length >= 2, q.id); assert.equal(new Set(q.options.map((o) => o.value)).size, q.options.length, q.id + ' option values'); }
    if (q.type === 'scale') assert.ok(q.scale.min < q.scale.max, q.id);
    if (!['task', 'consent', 'decision'].includes(q.type) && !q.id.endsWith('_why')) assert.ok(q.label, q.id + ' needs a label');
    if (q.showIf) assert.ok(seen.has(q.showIf.id), `${q.id} depends on ${q.showIf.id}, which must come earlier`);
    seen.add(q.id);
  }
  for (const t of SECTIONS.find((s) => s.id === 'tasks').questions) {
    assert.ok([1, 2, 3, 4].includes(t.scene));
    for (const f of ['scenario', 'goal', 'end', 'title']) assert.ok(t[f], `${t.id} needs ${f}`);
    const check = t.post.find((p) => p.id === `${t.id}_check`);
    assert.equal(check.options.filter((o) => o.correct).length, 1, `${t.id} check needs exactly one correct option`);
    assert.ok(t.limitSec > 0);
  }
  for (const sec of SECTIONS.filter((s) => s.optional)) for (const q of sec.questions) assert.ok(!q.required, `${q.id}: optional sections cannot have required questions`);
  for (const d of qs.filter((q) => q.type === 'decision')) assert.ok(d.pros && d.cons && d.title);
});

test('showIf visibility rules behave', () => {
  const inc = flatten().find((q) => q.id === 't1_incident');
  assert.equal(visible(inc, { t1_stuck: 'yes' }), true);
  assert.equal(visible(inc, { t1_stuck: 'no' }), false);
  assert.equal(visible(inc, {}), false);
});

test('pages generated from the project docs are populated', () => {
  assert.match(html.requirements, /R-S01/);
  assert.match(html.requirements, /R-U01/);
  assert.match(html.requirements, /T-24/);
  assert.equal((html.requirements.match(/<details class="decision">/g) || []).length, 17, 'seventeen decisions');
  assert.match(html.requirements, /A11/);
  assert.match(html.requirements, /RQ6/);
});

test('every deliverable on the checklist links to a real page section', () => {
  const links = [...html.deliverables.matchAll(/<li><span class="tick[^"]*">[^<]*<\/span><div><a href="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(links.length >= 14, `expected 14+ deliverables, found ${links.length}`);
});

test('the header links to every main section and the review', () => {
  for (const href of ['/how', '/try', '/prototypes', '/research', '/requirements', '/review']) assert.ok(html.index.includes(`href="${href}"`), href);
});
