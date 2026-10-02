// Structure tests: the built site has no dead links, no unsafe DOM writes, and a coherent survey.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECTIONS, flatten, visible, SLOTS, MODES, INTERVIEW } from '../src/js/survey-def.mjs';
import { TAB_OF } from '../src/js/routes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public');
// `npm test` builds once beforehand; the tests only read public/ (so parallel test files cannot race)
if (!fs.existsSync(path.join(PUB, 'index.html'))) throw new Error('public/ is missing: run `npm test` (or `npm run build` first)');
const pages = fs.readdirSync(PUB).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, ''));
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
      if (hash && slug === 'course') {
        // tab names and prototype roles are handled by the router, everything else must be a real id
        const routed = ['checklist', 'prototypes', 'research', 'requirements'].includes(hash) || /^proto-\w+$/.test(hash);
        if (!TAB_OF[hash]) problems.push(`${p}: ${u} is not routed to a tab`);
        else if (!routed && !idsOf(slug).has(hash)) problems.push(`${p}: ${u} points to a missing anchor`);
      } else if (hash && !idsOf(slug).has(hash)) problems.push(`${p}: ${u} points to a missing anchor`);
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
  assert.match(html.course, /R-S01/);
  assert.match(html.course, /R-U01/);
  assert.match(html.course, /T-24/);
  assert.equal((html.course.match(/<details class="decision">/g) || []).length, 19, 'nineteen decisions');
  assert.match(html.course, /A11/);
  assert.match(html.course, /RQ6/);
});

test('every deliverable on the checklist links to a real section, and the tab router opens the right tab', () => {
  const panel = (name) => { const m = new RegExp(`<div class="tabpanel" id="tab-${name}" data-panel="${name}">([\\s\\S]*?)(?=<div class="tabpanel"|$)`).exec(html.course); return m ? m[1] : ''; };
  const checklist = panel('checklist');
  const links = [...checklist.matchAll(/<li><span class="tick[^"]*">[^<]*<\/span><div><a href="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(links.length >= 14, `expected 14+ deliverables, found ${links.length}`);
  // every id inside a tab panel must route to that same tab
  for (const name of ['checklist', 'prototypes', 'research', 'requirements']) {
    for (const m of panel(name).matchAll(/\sid="([^"]+)"/g)) {
      if (TAB_OF[m[1]]) assert.equal(TAB_OF[m[1]], name, `#${m[1]} lives in ${name} but routes to ${TAB_OF[m[1]]}`);
    }
  }
  for (const name of ['prototypes', 'research', 'requirements']) assert.equal(TAB_OF[name], name);
});

test('the header is short: two links and the review button', () => {
  const nav = /<nav class="nav"[^>]*>([\s\S]*?)<\/nav>/.exec(html.index)[1];
  assert.equal((nav.match(/<a /g) || []).length, 2, 'only Explore and Course material');
  assert.ok(html.index.includes('href="/course"') && html.index.includes('href="/review"'));
});

test('the home page has a very short manual, then leads a newcomer through three steps and offers both ways to give feedback', () => {
  for (const id of ['manual', 'watch', 'try', 'next', 'journey', 'try-root', 'make-root']) assert.ok(html.index.includes(`id="${id}"`), id);
  assert.ok(html.index.includes('href="/review"') && html.index.includes('href="/interview"'));
  assert.equal((html.index.match(/<h1[ >]/g) || []).length, 1);
  const manual = /<section[^>]*id="manual"[\s\S]*?<\/section>/.exec(html.index)[0];
  const words = manual.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  assert.ok(words <= 140, `the manual must stay very short (${words} words)`);
  const steps = [...manual.matchAll(/<ol>([\s\S]*?)<\/ol>/g)][0][1].match(/<li>/g).length;
  assert.equal(steps, 3, 'three steps: watch, try, tell us');
  const tips = [...manual.matchAll(/<ul>([\s\S]*?)<\/ul>/g)][0][1].match(/<li>/g).length;
  assert.ok(tips >= 4 && tips <= 6, `${tips} feedback tips`);
  for (const target of ['#watch', '#try', '/review', '/interview']) assert.ok(manual.includes(`href="${target}"`), `manual links to ${target}`);
  assert.match(manual, /expected/); assert.match(manual, /exact moment/); assert.match(manual, /change first/); assert.match(manual, /Not quite/);
  // the manual comes right after the hero, before the rest of the page
  assert.ok(html.index.indexOf('id="manual"') < html.index.indexOf('id="why"') && html.index.indexOf('id="manual"') < html.index.indexOf('id="watch"'));
});

test('old URLs still reach the new pages (redirects configured)', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const from = Object.fromEntries((cfg.redirects || []).map((r) => [r.source, r.destination]));
  assert.equal(from['/how'], '/#watch');
  assert.equal(from['/try'], '/#try');
  assert.equal(from['/prototypes'], '/course#prototypes');
  assert.equal(from['/research'], '/course#research');
  assert.equal(from['/requirements'], '/course#requirements');
  assert.equal(from['/deliverables'], '/course#checklist');
});

test('interview slots and modes are well formed and used by the review and the interview form', () => {
  for (const list of [SLOTS, MODES]) { assert.ok(list.length >= 3); assert.equal(new Set(list.map((x) => x.value)).size, list.length); for (const x of list) assert.ok(x.value && x.label); }
  const finish = SECTIONS.find((x) => x.id === 'finish').questions;
  assert.equal(finish.find((q) => q.id === 'c_slots').options, SLOTS);
  assert.equal(INTERVIEW.questions.find((q) => q.id === 'c_slots').options, SLOTS);
  for (const id of ['c_slots', 'c_mode', 'c_contact']) assert.ok(finish.find((q) => q.id === id).requiredIf, id + ' is required once the person says yes');
});
