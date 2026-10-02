// Field-by-field dry run. Every question in the survey definition is filled through the REAL page code,
// sent through the REAL client (fetch -> /api/submit), stored by the REAL storage code (over HTTP to a fake Upstash),
// then read back through the admin export and compared with exactly what was typed or tapped.
// If someone adds a question and the page, the validator or the store drops it, this file fails.
globalThis.__LP_TEST = true;
import test from 'node:test';
import assert from 'node:assert/strict';
import { startRedisEmulator } from './redis-emulator.mjs';
import { setupDom, click, type, tick } from './dom-env.mjs';
import { call, cid, validReview } from './helpers.mjs';

const emu = await startRedisEmulator();
process.env.KV_REST_API_URL = emu.url; process.env.KV_REST_API_TOKEN = emu.token; process.env.ADMIN_KEY = 'roundtrip-admin-key';
delete process.env.LEAKPROOF_DATA_DIR;
test.after(() => emu.close());

const { default: submit } = await import('../api/submit.js');
const { default: stats } = await import('../api/stats.js');
const { default: exportApi } = await import('../api/export.js');
const { SECTIONS, INTERVIEW, QUICK_SCENES, CONTACT_IDS, flatten, visible, requiredNow } = await import('../src/js/survey-def.mjs');
const { startReview } = await import('../src/js/review.js');
const { startInterview } = await import('../src/js/interview.js');
const { mountQuick } = await import('../src/js/quick.js');

/* The browser's fetch, wired straight to the API handlers: the page code runs unchanged. */
const handlers = { '/api/submit': submit, '/api/stats': stats, '/api/export': exportApi };
const wire = { sent: [] };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url, 'http://localhost');
  if (!handlers[u.pathname]) return realFetch(url, init); // the storage client talking to the fake Upstash
  const body = init.body ? JSON.parse(init.body) : undefined; // what actually crossed the wire
  wire.sent.push({ path: u.pathname, body });
  const res = await call(handlers[u.pathname], { method: init.method || 'GET', headers: init.headers || {}, body, query: Object.fromEntries(u.searchParams) });
  return { ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: async () => JSON.parse(JSON.stringify(res.body)) };
};
// uses performance.now(): the review tests freeze Date.now() to control task timers
const waitFor = async (cond, ms = 3000) => { const end = performance.now() + ms; while (performance.now() < end) { if (cond()) return true; await new Promise((r) => setTimeout(r, 5)); } return cond(); };
const admin = async (query = {}) => (await call(exportApi, { method: 'GET', headers: { 'x-admin-key': 'roundtrip-admin-key' }, query })).body;
const allContact = async () => (await admin({ include: 'contact' })).contact;

/* The fields that identify a person. Written out here on purpose, apart from the code under test:
   adding or removing one must be a decision, not an accident. */
const CONTACT = ['email', 'c_link', 'c_name', 'c_contact', 'c_when'];
test('the set of fields kept apart from the analysis data is exactly the one we decided on', () => {
  assert.deepEqual([...CONTACT_IDS].sort(), [...CONTACT].sort());
});

/* ---------- a generic filler, driven only by the survey definition ---------- */
const BMP = 'é ✓ “quotes” & <b>tags</b> ‘apostrophe’ — ' ;
// Exactly n characters, ending on a visible one (the server trims whitespace, and it should).
const exactly = (id, n) => { let s = `${id}: ${BMP}`; while (s.length < n) s += s; return s.slice(0, n - 1) + '.'; };
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const inDom = (id) => document.querySelector(`[data-q="${id}"]`);
const live = (el) => el && !el.hidden && !el.closest('[hidden]');

/** What to do for each question in a given run. `expected` collects what the person actually entered. */
function makeRun(name, { role, fillOptional, stuck, optionalPart, link, pad = true }) {
  const expected = {}; const ordinal = hash(name);
  const forced = { role, email: `  Asha.Kumar+${name}@Example.COM `, c_link: link ? ` https://Forms.GLE/Dry-Run-${name}?x=1&y=2 ` : undefined };
  for (const t of ['t1', 't2', 't3', 't4']) forced[`${t}_stuck`] = stuck;
  const pick = (q) => {
    if (q.id in forced) return forced[q.id];
    const n = q.options ? q.options.length : 0;
    switch (q.type) {
      case 'consent': return true;
      case 'single': return q.options[(hash(q.id) + ordinal) % n].value;
      case 'decision': return ['agree', 'unsure', 'disagree'][(hash(q.id) + ordinal) % 3];
      case 'scale': return q.scale.min + ((hash(q.id) + ordinal) % (q.scale.max - q.scale.min + 1));
      case 'multi': { const k = Math.min(q.max || 2, 2); const start = (hash(q.id) + ordinal) % n; return Array.from({ length: Math.min(k, n) }, (_, i) => q.options[(start + i) % n].value); }
      case 'text': { const len = fillOptional ? q.maxLen || 1000 : Math.max(q.minLen || 1, 12); const s = exactly(q.id, len); return pad ? s : s; }
      default: throw new Error('no filler for type ' + q.type);
    }
  };
  return { name, role, fillOptional, optionalPart, expected, pick, forced };
}

/** Fill one question in the page the way a person would, using real clicks and typing. */
function fillOne(q, value) {
  const el = inDom(q.id);
  switch (q.type) {
    case 'consent': click(document.querySelector('#consent-box')); return true;
    case 'single': case 'decision': click(el.querySelector(`input[value="${value}"]`)); return value;
    case 'scale': click(el.querySelector(`input[value="${value}"]`)); return value;
    case 'multi': value.forEach((v) => click(el.querySelector(`input[value="${v}"]`))); return value;
    case 'text': { const f = el.querySelector('textarea,input'); type(f, (q.id === 'email' || q.id === 'c_link' || value.length >= (q.maxLen || 1000)) ? value : `  ${value}  `); return value; }
    default: throw new Error('cannot fill ' + q.type);
  }
}

/** Fill everything currently visible. Optional questions are skipped unless the run fills them. */
function fillVisible(qs, run, answered) {
  for (const q of qs) {
    if (answered.has(q.id)) continue;
    const el = inDom(q.id);
    if (!live(el) || !visible(q, run.expected)) continue;
    const must = requiredNow(q, run.expected);
    const value = run.pick(q);
    if (value === undefined) continue; // e.g. no swap link in this run
    if (!must && !run.fillOptional && !(q.id in run.forced)) continue;
    const entered = fillOne(q, value);
    answered.add(q.id);
    // what the person entered, as the server should store it
    run.expected[q.id] = q.type === 'text' ? normaliseText(q, entered) : entered;
  }
}
const normaliseText = (q, v) => (q.format === 'email' ? v.trim().toLowerCase() : q.format === 'url' ? new URL(v.trim()).href : v.trim());

const reviewQs = flatten().filter((q) => q.type !== 'task');
const nextBtn = () => document.querySelector('[data-nav=next]');

async function runReview(run, seconds = [37, 52, 71, 44]) {
  setupDom('review');
  window.sessionStorage.clear();
  const realNow = Date.now; let clock = 1_800_000_000_000; const startClock = clock; Date.now = () => clock;
  try {
    const root = document.getElementById('review-root');
    startReview(root, {});
    const taskSeconds = {}; const results = {};
    const answered = new Set();
    for (let guard = 0; guard < 25; guard++) {
      if (document.querySelector('.receipt dd.mono')) break;
      const gateYes = [...document.querySelectorAll('.btn')].find((b) => /four more minutes/.test(b.textContent));
      if (gateYes) { click(run.optionalPart ? gateYes : [...document.querySelectorAll('.btn')].find((b) => /finish now/.test(b.textContent))); await tick(10); continue; }
      const done = document.querySelector('[data-act=done]');
      if (live(done)) {
        const t = ['t1', 't2', 't3', 't4'].find((id) => document.querySelector(`[data-post="${id}"]`));
        const skip = t === 't4' || (t === 't2' && run.fillOptional); // a mix of finished and skipped tasks
        if (t === 't1') { const s = document.querySelector('.task-stage input[type=range]'); if (s) type(s, '9'); }
        clock += seconds[Number(t[1]) - 1] * 1000;
        taskSeconds[t] = seconds[Number(t[1]) - 1]; results[t] = skip ? 'skipped' : 'done';
        click(document.querySelector(`[data-act=${skip ? 'skip' : 'done'}]`)); await tick(5);
      }
      fillVisible(reviewQs, run, answered);
      // a question can appear after another is answered (follow-ups): fill again before moving on
      fillVisible(reviewQs, run, answered);
      const before = document.querySelector('#rv-h')?.textContent;
      click(nextBtn());
      await waitFor(() => document.querySelector('#rv-h')?.textContent !== before || document.querySelector('.receipt dd.mono'));
      if (document.querySelector('#rv-h')?.textContent === before && !document.querySelector('.receipt dd.mono')) {
        assert.fail(`stuck on "${before}": ${document.querySelector('.rv-err')?.textContent}`);
      }
    }
    assert.ok(document.querySelector('.receipt dd.mono'), 'the page reached the receipt');
    return { receiptShown: document.querySelector('.receipt dd.mono').textContent, total: Math.round((clock - startClock) / 1000), taskSeconds, results };
  } finally { Date.now = realNow; }
}

/** What the server should now hold for one run: the answers and the contact record, split by CONTACT_IDS. */
function split(expected) {
  const answers = {}, contact = {};
  for (const [k, v] of Object.entries(expected)) { if (k === 'consent') { answers[k] = v; continue; } (CONTACT.includes(k) ? contact : answers)[k] = v; }
  return { answers, contact };
}
const byReceipt = async (receipt) => {
  const all = await admin({ include: 'contact' });
  return { review: all.reviews.find((r) => r.receipt === receipt), contact: all.contact.find((c) => c.receipt === receipt) };
};

const RUNS = [
  makeRun('A', { role: 'course_peer', fillOptional: true, stuck: 'yes', optionalPart: true, link: true }),
  makeRun('B', { role: 'other_student', fillOptional: false, stuck: 'no', optionalPart: false, link: false }),
  makeRun('C', { role: 'exam_staff', fillOptional: false, stuck: 'yes', optionalPart: true, link: true }),
];

for (const run of RUNS) {
  test(`dry run ${run.name} (${run.role}${run.fillOptional ? ', every field' : ', required only'}): what was entered is exactly what is stored`, async () => {
    const { receiptShown, taskSeconds, results, total } = await runReview(run);
    const { review, contact } = await byReceipt(receiptShown);
    assert.ok(review, 'a review record exists for the receipt shown on the page');
    const want = split(run.expected);

    // 1. every answer, value for value
    assert.deepEqual(review.answers, want.answers);
    // 2. contact fields are in the contact record, and only there
    for (const id of CONTACT) assert.ok(!(id in review.answers), `${id} must not be in the analysis record`);
    assert.deepEqual(Object.fromEntries(Object.entries(contact).filter(([k]) => CONTACT.includes(k))), want.contact);
    assert.equal(contact.source, 'review'); assert.equal(contact.receipt, receiptShown); assert.equal(contact.id, review.id);
    // 3. task metrics: results and seconds exactly, actions at least what the person did
    assert.deepEqual(Object.keys(review.metrics).sort(), ['t1', 't2', 't3', 't4']);
    for (const t of ['t1', 't2', 't3', 't4']) {
      assert.equal(review.metrics[t].result, results[t], `${t} result`);
      assert.equal(review.metrics[t].seconds, taskSeconds[t], `${t} seconds`);
      assert.ok(Number.isInteger(review.metrics[t].actions) && review.metrics[t].actions >= 0);
    }
    assert.ok(review.metrics.t1.actions >= 1, 'the slider move in task 1 was counted');
    assert.equal(review.totalSeconds, total, 'total time is the sum of the time we gave each task');
    assert.equal(review.optionalDone, run.optionalPart);
    // 4. branch rules: hidden questions are absent, shown ones present
    for (const q of reviewQs) {
      const shouldExist = visible(q, run.expected) && (q.id in run.expected);
      const stored = q.id in review.answers || q.id in contact;
      assert.equal(stored, shouldExist, `${q.id} is ${shouldExist ? 'stored' : 'absent'}`);
    }
    // 5. exact text survived: unicode, quotes, angle brackets, and the longest allowed length
    if (run.fillOptional) {
      for (const q of reviewQs.filter((x) => x.type === 'text' && !x.format && x.maxLen && visible(x, run.expected))) {
        const got = review.answers[q.id] ?? contact[q.id];
        assert.equal(got.length, q.maxLen, `${q.id} kept all ${q.maxLen} characters`);
      }
    }
    // 6. the page's own receipt matched the server's
    assert.match(document.body.textContent, new RegExp(receiptShown));
    // 7. what crossed the wire already had no empty strings or hidden answers
    const sent = wire.sent.filter((s) => s.path === '/api/submit' && s.body.kind === 'review').at(-1).body;
    assert.ok(Object.values(sent.answers).every((v) => v !== '' && v !== null && v !== undefined));
  });
}

test('dry run: every question in the survey was exercised by at least one run', async () => {
  const seen = new Set();
  for (const run of RUNS) Object.keys(run.expected).forEach((k) => seen.add(k));
  const missing = reviewQs.map((q) => q.id).filter((id) => !seen.has(id));
  assert.deepEqual(missing, [], 'questions no dry run filled: ' + missing.join(', '));
  // the survey really has the fields we care about
  for (const id of ['email', 'c_link', 'role', 'c_name', 'consent', 'explain', 'change', 'missing', 'd_pool_why']) assert.ok(seen.has(id), id);
  for (const id of ['followup', 'c_slots', 'c_mode', 'c_contact', 'c_when', 'c_topic']) assert.ok(!seen.has(id) && !reviewQs.some((q) => q.id === id), id + ' is not part of the review any more');
});

test('dry run: the participants view and CSV tie every review to its email, and the analysis export has no emails', async () => {
  const exp = await admin({ include: 'contact' });
  const ppl = (await admin({ kind: 'participants' })).participants;
  assert.equal(ppl.length, RUNS.length);
  for (const run of RUNS) {
    const p = ppl.find((x) => x.email === run.expected.email);
    assert.ok(p, `participant ${run.name} is listed by email`);
    assert.equal(p.role, run.role); assert.equal(p.swapLink, run.expected.c_link || ''); assert.equal(p.reviewFound, true);
    assert.equal(p.timesSeen, 1);
    assert.equal(p.completedTasks, run.fillOptional ? 2 : 3);
    assert.equal(p.name, run.expected.c_name || '');
  }
  const FREE = ['email', 'c_link', 'c_name'];
  const analysis = JSON.stringify(exp.reviews);
  for (const run of RUNS) for (const id of FREE) if (run.expected[id]) assert.ok(!analysis.includes(String(run.expected[id])), `${id} leaked into the analysis export`);
  const csvAnalysis = await call(exportApi, { method: 'GET', headers: { 'x-admin-key': 'roundtrip-admin-key' }, query: { format: 'csv' } });
  assert.ok(!/@example\.com/i.test(csvAnalysis.body), 'no email in the analysis CSV');
  const csv = (await call(exportApi, { method: 'GET', headers: { 'x-admin-key': 'roundtrip-admin-key' }, query: { kind: 'participants', format: 'csv' } })).body;
  for (const run of RUNS) assert.ok(csv.includes(run.expected.email), `${run.name} email is in the participants CSV`);
  assert.equal(csv.split('\n').length, RUNS.length + 1);
  const pub = JSON.stringify((await call(stats, {})).body);
  for (const run of RUNS) for (const id of FREE) if (run.expected[id]) assert.ok(!pub.includes(String(run.expected[id])), `${id} leaked into public stats`);
});

/* ---------- the chat form and the quick feedback box ---------- */
const sendButton = () => document.querySelector('.rv-nav .btn');
async function fillInterview(fillOptional) {
  setupDom('interview');
  const root = document.getElementById('interview-root');
  startInterview(root, {});
  const run = makeRun('I' + (fillOptional ? 'full' : 'min'), { role: undefined, fillOptional, stuck: 'no', optionalPart: false, link: false });
  const answered = new Set();
  assert.equal(sendButton().disabled, true, 'the button is off until the consent box is ticked');
  fillVisible(INTERVIEW.questions, run, answered);
  assert.equal(sendButton().disabled, false);
  click(sendButton()); await waitFor(() => document.querySelector('.receipt dd.mono') || /wrong|check|reach|connected/i.test(document.querySelector('.rv-err')?.textContent || ''));
  return run;
}
for (const full of [true, false]) {
  test(`dry run: chat form (${full ? 'every field' : 'required only'}) is stored with exactly what was entered, and the consent`, async () => {
    const before = (await allContact()).length;
    const run = await fillInterview(full);
    const receiptEl = document.querySelector('.receipt dd.mono');
    assert.ok(receiptEl, 'the page confirmed: ' + (document.querySelector('.rv-err')?.textContent || ''));
    const stored = (await allContact()).find((c) => c.receipt === receiptEl.textContent);
    assert.ok(stored); assert.equal((await allContact()).length, before + 1);
    assert.equal(stored.source, 'interview');
    assert.equal(stored.consent, true, 'the consent is stored with the request');
    assert.deepEqual(Object.fromEntries(Object.entries(stored).filter(([k]) => !['id', 'receipt', 'receivedAt', 'source'].includes(k))), run.expected);
    if (full) for (const q of INTERVIEW.questions.filter((x) => x.type === 'text')) assert.equal(stored[q.id].length, q.maxLen, `${q.id} kept its full length`);
    else assert.deepEqual(Object.keys(stored).filter((k) => !['id', 'receipt', 'receivedAt', 'source'].includes(k)).sort(), ['c_contact', 'c_when', 'consent']);
    assert.ok(!(await admin()).reviews.some((r) => r.receipt === stored.receipt), 'a chat request is not an analysis record');
  });
}

test('dry run: without the consent box ticked, the chat form sends and stores nothing, however it is pressed', async () => {
  const before = (await allContact()).length, sentBefore = wire.sent.length;
  setupDom('interview');
  const root = document.getElementById('interview-root');
  startInterview(root, {});
  type(inDom('c_when').querySelector('textarea,input'), 'any evening'); type(inDom('c_contact').querySelector('textarea,input'), 'someone@example.com');
  assert.equal(sendButton().disabled, true);
  click(sendButton()); sendButton().disabled = false; click(sendButton()); // pressed while off, and forced on
  await tick(80);
  assert.equal(wire.sent.length, sentBefore, 'nothing left the page');
  assert.match(document.querySelector('.rv-err').textContent, /tick the box/i);
  assert.equal((await allContact()).length, before, 'nothing was stored');
  // and the server refuses it too, if someone bypasses the page
  const forged = await call(submit, { method: 'POST', body: { kind: 'interview', clientId: cid(), answers: { c_when: 'any evening', c_contact: 'someone@example.com' } } });
  assert.equal(forged.statusCode, 400);
  assert.equal((await allContact()).length, before);
});

test('dry run: quick feedback for every scene, with and without a comment, is stored exactly', async () => {
  const sent = [];
  for (const scene of QUICK_SCENES) for (const clear of ['yes', 'no']) {
    setupDom('index');
    const root = document.createElement('div'); document.body.append(root);
    mountQuick(root, scene);
    click(root.querySelector(`[data-v="${clear}"]`));
    const withComment = (scene.length + clear.length) % 2 === 0;
    const comment = withComment ? `  Scene ${scene}: “${clear}” & <i>unclear</i> é  ` : '';
    if (withComment) type(root.querySelector('textarea'), comment);
    click(root.querySelector('.quick .btn.small:not(.outline)')); await waitFor(() => /Thank you/.test(root.textContent));
    assert.match(root.textContent, /Thank you/);
    sent.push({ scene, clear, comment: comment.trim() });
  }
  const stored = (await admin()).quick;
  for (const s of sent) assert.ok(stored.some((q) => q.scene === s.scene && q.clear === s.clear && q.comment === s.comment), `quick ${s.scene}/${s.clear} stored exactly`);
  assert.equal(stored.length, sent.length);
});

/* ---------- every single option of every question, one at a time ---------- */
/** A valid review in which question `q` has value `v`, with whatever it depends on answered to make it visible. */
function withAnswer(q, v) {
  const a = { ...validReview().answers };
  if (q.showIf) a[q.showIf.id] = q.showIf.equals;
  a[q.id] = v;
  return { ...validReview(), answers: a, clientId: cid() };
}
const send = (body) => call(submit, { method: 'POST', body });

test('every option of every choice question, every scale point, is accepted and read back unchanged', async () => {
  let checked = 0;
  for (const q of reviewQs.filter((x) => ['single', 'multi', 'scale', 'decision'].includes(x.type))) {
    const values = q.type === 'scale' ? Array.from({ length: q.scale.max - q.scale.min + 1 }, (_, i) => q.scale.min + i)
      : q.type === 'multi' ? q.options.map((o) => [o.value]) : q.options.map((o) => o.value);
    for (const v of values) {
      const r = await send(withAnswer(q, v));
      assert.equal(r.statusCode, 200, `${q.id}=${JSON.stringify(v)} was refused: ${JSON.stringify(r.body)}`);
      const got = await byReceipt(r.body.receipt);
      const stored = got.review.answers[q.id] ?? (got.contact && got.contact[q.id]);
      assert.deepEqual(stored, v, `${q.id}=${JSON.stringify(v)} came back as ${JSON.stringify(stored)}`);
      checked++;
    }
    // just outside the allowed values is refused, never clamped or coerced
    const bad = q.type === 'scale' ? [q.scale.min - 1, q.scale.max + 1, String(q.scale.min), 2.5] : ['__not_an_option__'];
    for (const v of bad) assert.equal((await send(withAnswer(q, q.type === 'multi' ? [v] : v))).statusCode, 400, `${q.id}=${JSON.stringify(v)} should be refused`);
  }
  assert.ok(checked > 100, 'checked ' + checked + ' values');
});

test('a multi-choice answer with the maximum number of picks is kept; one more is refused', async () => {
  for (const q of reviewQs.filter((x) => x.type === 'multi' && x.max)) {
    const picks = q.options.slice(0, q.max).map((o) => o.value);
    const ok = await send(withAnswer(q, picks));
    assert.equal(ok.statusCode, 200, q.id);
    assert.deepEqual((await byReceipt(ok.body.receipt)).review.answers[q.id], picks);
    assert.equal((await send(withAnswer(q, q.options.slice(0, q.max + 1).map((o) => o.value)))).statusCode, 400, q.id + ' with one pick too many');
  }
});

test('text fields: exactly the limit is kept whole, one character over is refused and never silently cut', async () => {
  let n = 0;
  for (const q of reviewQs.filter((x) => x.type === 'text' && !x.format)) {
    const exact = exactly(q.id, q.maxLen || 1000);
    const ok = await send(withAnswer(q, exact));
    assert.equal(ok.statusCode, 200, `${q.id} at the limit: ${JSON.stringify(ok.body)}`);
    const got = await byReceipt(ok.body.receipt);
    assert.equal(got.review.answers[q.id] ?? got.contact[q.id], exact, `${q.id} stored whole`);
    assert.equal((await send(withAnswer(q, exact + 'x'))).statusCode, 400, `${q.id} over the limit`);
    n++;
  }
  assert.ok(n >= 15, 'covered ' + n + ' text fields');
});
