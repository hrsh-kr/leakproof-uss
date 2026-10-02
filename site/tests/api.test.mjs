// Tests that try to break the API. Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshEnv, call, mockRes, validReview, cid } from './helpers.mjs';

const dir = freshEnv();
const { default: submit } = await import('../api/submit.js');
const { default: stats } = await import('../api/stats.js');
const { default: exportApi } = await import('../api/export.js');
const { getStore, RedisStore, FileStore } = await import('../api/_lib/store.js');
const { csvCell } = await import('../api/_lib/csv.js');
const { checkAdmin } = await import('../api/_lib/auth.js');
const { computeStats } = await import('../api/_lib/stats.js');

const post = (body, extra = {}) => call(submit, { method: 'POST', headers: { 'content-type': 'application/json' }, body, ...extra });
const adminGet = (query = {}, key = 'test-admin-key-123') => call(exportApi, { method: 'GET', headers: { 'x-admin-key': key }, query });

test('a valid review is accepted and returns a receipt', async () => {
  const r = await post(validReview());
  assert.equal(r.statusCode, 200);
  assert.match(r.body.receipt, /^LP-[A-HJKMNP-TV-Z2-9]{8}$/);
});

test('only POST is allowed on submit; only GET on stats and export', async () => {
  assert.equal((await call(submit, { method: 'GET' })).statusCode, 405);
  assert.equal((await call(submit, { method: 'PUT', body: {} })).statusCode, 405);
  assert.equal((await call(stats, { method: 'POST' })).statusCode, 405);
  assert.equal((await call(exportApi, { method: 'DELETE' })).statusCode, 405);
});

test('malformed bodies are refused', async () => {
  assert.equal((await post(undefined)).statusCode, 400);
  assert.equal((await post(null)).statusCode, 400);
  assert.equal((await post([1, 2])).statusCode, 400);
  assert.equal((await call(submit, { method: 'POST', body: undefined, badJson: true })).statusCode, 400);
  assert.equal((await post({ kind: 'nope' })).statusCode, 400);
});

test('oversized payloads are refused', async () => {
  const big = validReview({ explain: 'x'.repeat(100) });
  big.padding = 'y'.repeat(70000);
  assert.equal((await post(big)).statusCode, 413);
});

test('honeypot: bots get a success reply but nothing is stored', async () => {
  const before = (await new FileStore(dir).list('review')).length;
  const b = validReview(); b.website = 'http://spam.example';
  const r = await post(b);
  assert.equal(r.statusCode, 200);
  assert.equal((await new FileStore(dir).list('review')).length, before);
});

test('unknown fields and unknown answer ids are refused', async () => {
  const a = validReview(); a.extra = 1;
  assert.equal((await post(a)).statusCode, 400);
  const b = validReview({ not_a_question: 'hi' });
  const r = await post(b);
  assert.equal(r.statusCode, 400);
  assert.ok(r.body.errors.some((e) => e.includes('not_a_question')));
});

test('prototype pollution attempts do nothing', async () => {
  const raw = JSON.parse('{"kind":"review","clientId":"client-poll-0000001","answers":{"__proto__":{"polluted":true},"consent":true},"metrics":{}}');
  const r = await post(raw);
  assert.equal(r.statusCode, 400);
  assert.equal({}.polluted, undefined);
  const raw2 = JSON.parse('{"kind":"review","clientId":"client-poll-0000002","answers":{"consent":true},"metrics":{"__proto__":{"x":1}}}');
  assert.equal((await post(raw2)).statusCode, 400);
  assert.equal({}.x, undefined);
});

test('required answers, consent and value ranges are enforced', async () => {
  const missing = validReview(); delete missing.answers.role;
  assert.equal((await post(missing)).statusCode, 400);
  assert.equal((await post(validReview({ consent: false }))).statusCode, 400);
  for (const bad of [0, 8, 3.5, '5', null, NaN]) assert.equal((await post(validReview({ t1_seq: bad }))).statusCode, 400, String(bad));
  assert.equal((await post(validReview({ role: 'admin' }))).statusCode, 400);
  assert.equal((await post(validReview({ leakwhere: ['press', 'written', 'hall'] }))).statusCode, 400);
  assert.equal((await post(validReview({ leakwhere: ['press', 'press'] }))).statusCode, 400);
  assert.equal((await post(validReview({ leakwhere: [] }))).statusCode, 400);
  assert.equal((await post(validReview({ explain: 'x'.repeat(801) }))).statusCode, 400);
  assert.equal((await post(validReview({ explain: 'short' }))).statusCode, 400);
});

test('answers to hidden questions are refused', async () => {
  const r = await post(validReview({ t1_incident: 'I was confused' }));
  assert.equal(r.statusCode, 400);
  assert.equal((await post(validReview({ t1_stuck: 'yes', t1_incident: 'Could not find the slider', t1_slow: '2' }))).statusCode, 200);
});

test('task metrics are range checked', async () => {
  for (const bad of [{ seconds: -1 }, { seconds: 99999 }, { actions: 5000 }, { result: 'cheat' }, { seconds: 1.5 }]) {
    const b = validReview(); b.metrics.t1 = { seconds: 40, actions: 3, result: 'done', ...bad };
    assert.equal((await post(b)).statusCode, 400, JSON.stringify(bad));
  }
  const extra = validReview(); extra.metrics.t1.note = 'x';
  assert.equal((await post(extra)).statusCode, 400);
  const unk = validReview(); unk.metrics.t9 = { seconds: 1, actions: 1, result: 'done' };
  assert.equal((await post(unk)).statusCode, 400);
});

test('the same clientId returns the same receipt and is stored once', async () => {
  const b = validReview();
  const r1 = await post(b), r2 = await post(b);
  assert.equal(r1.body.receipt, r2.body.receipt);
  assert.equal(r2.body.duplicate, true);
  const all = await new FileStore(dir).list('review');
  assert.equal(all.filter((x) => x.receipt === r1.body.receipt).length, 1);
});

test('contact details are stored separately and never in reviews, stats or the default export', async () => {
  const b = validReview({ followup: 'yes', c_contact: 'secret-person@example.com', c_name: 'Secret Person', c_slots: ['sat3-am', 'sun4-pm'], c_mode: 'phone', c_when: 'Thursday after 7 pm' });
  const r = await post(b);
  assert.equal(r.statusCode, 200);
  const reviews = await new FileStore(dir).list('review');
  const mine = reviews.find((x) => x.receipt === r.body.receipt);
  assert.ok(mine);
  assert.ok(!JSON.stringify(mine).includes('secret-person'));
  assert.ok(!JSON.stringify(mine).includes('Secret Person'));
  const contacts = await new FileStore(dir).list('contact');
  assert.ok(contacts.some((c) => c.receipt === r.body.receipt && c.c_contact === 'secret-person@example.com'));
  const st = await call(stats, {});
  assert.ok(!JSON.stringify(st.body).includes('secret-person'));
  const ex = await adminGet();
  assert.ok(!JSON.stringify(ex.body).includes('secret-person'));
  const withContact = await adminGet({ include: 'contact' });
  assert.ok(JSON.stringify(withContact.body.contact).includes('secret-person'));
  const csv = await adminGet({ format: 'csv' });
  assert.ok(!csv.body.includes('secret-person'));
});

test('quick feedback: valid, invalid and honeypot', async () => {
  const ok = await post({ kind: 'quick', clientId: cid(), scene: '2', clear: 'no', comment: 'The keys were confusing' });
  assert.equal(ok.statusCode, 200);
  assert.equal((await post({ kind: 'quick', clientId: cid(), scene: '9', clear: 'no' })).statusCode, 400);
  assert.equal((await post({ kind: 'quick', clientId: cid(), scene: '1', clear: 'maybe' })).statusCode, 400);
  assert.equal((await post({ kind: 'quick', clientId: cid(), scene: '1', clear: 'yes', comment: 'x'.repeat(1001) })).statusCode, 400);
  assert.equal((await post({ kind: 'quick', clientId: 'x', scene: '1', clear: 'yes' })).statusCode, 400);
  assert.equal((await post({ kind: 'quick', clientId: cid(), scene: '1', clear: 'yes', evil: 1 })).statusCode, 400);
});

test('export needs the admin key; wrong or missing keys are refused; unset key fails closed', async () => {
  assert.equal((await call(exportApi, { method: 'GET' })).statusCode, 401);
  assert.equal((await adminGet({}, 'wrong')).statusCode, 401);
  assert.equal((await adminGet({}, '')).statusCode, 401);
  assert.equal((await adminGet({}, 'test-admin-key-12')).statusCode, 401);
  assert.equal((await adminGet()).statusCode, 200);
  const saved = process.env.ADMIN_KEY;
  delete process.env.ADMIN_KEY;
  assert.equal((await adminGet({}, 'anything')).statusCode, 503);
  assert.equal((await adminGet({}, '')).statusCode, 503);
  process.env.ADMIN_KEY = 'short';
  assert.equal((await adminGet({}, 'short')).statusCode, 503, 'too-short keys are treated as unconfigured');
  process.env.ADMIN_KEY = saved;
  assert.equal(checkAdmin({ headers: {} }, { ADMIN_KEY: 'long-enough-key' }), 'denied');
});

test('CSV export protects against formula injection and escapes quotes and commas', async () => {
  assert.equal(csvCell('=HYPERLINK("http://x")'), '"\'=HYPERLINK(""http://x"")"');
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('-2'), "'-2");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('line\nbreak'), '"line\nbreak"');
  assert.equal(csvCell(['a', 'b']), 'a;b');
  assert.equal(csvCell(undefined), '');
  const r = await post(validReview({ explain: '=cmd|\' /C calc\'!A0 is my explanation' }));
  assert.equal(r.statusCode, 200);
  const csv = await adminGet({ format: 'csv' });
  assert.equal(csv.statusCode, 200);
  assert.ok(csv.body.includes("'=cmd"), 'formula must be neutralised');
  assert.ok(!/(^|,)=cmd/m.test(csv.body));
  const q = await adminGet({ format: 'csv', kind: 'quick' });
  assert.ok(q.body.startsWith('id,receivedAt,scene,clear,comment'));
});

test('stats hide small groups and never contain free text', async () => {
  const d2 = freshEnv();
  const s0 = await call(stats, {});
  assert.equal(s0.body.n.review, 0);
  assert.equal(s0.body.tasks.t1.completed, null);
  const marker = 'UNIQUE_MARKER_TEXT_9137';
  for (let i = 0; i < 4; i++) await post(validReview({ explain: marker + ' ' + i }));
  const s4 = await call(stats, {});
  assert.equal(s4.body.n.review, 4);
  assert.equal(s4.body.tasks.t1.completed, null, 'fewer than 5 people: hidden');
  assert.equal(s4.body.umux.mean, null);
  assert.deepEqual(s4.body.leakwhere, {});
  await post(validReview({ explain: marker + ' 5', t2_check: 'b' }));
  const s5 = await call(stats, {});
  assert.equal(s5.body.n.review, 5);
  assert.equal(s5.body.tasks.t1.completed, 1);
  assert.equal(s5.body.tasks.t2.checkCorrect, 0.8);
  assert.equal(s5.body.tasks.t3.medianSeconds, 60);
  assert.equal(s5.body.umux.mean, 5.5);
  assert.equal(s5.body.leakwhere.press, 5);
  assert.ok(!JSON.stringify(s5.body).includes(marker), 'free text must never appear in stats');
  assert.ok(d2);
});

test('computeStats: quick feedback per scene needs 5 answers', () => {
  const q = (clear) => ({ scene: '1', clear, comment: 'x' });
  assert.equal(computeStats([], [q('yes'), q('no'), q('yes'), q('yes')]).quick['1'].clearShare, null);
  assert.equal(computeStats([], [q('yes'), q('no'), q('yes'), q('yes'), q('no')]).quick['1'].clearShare, 0.6);
});

test('storage: not configured means refuse, never write somewhere public', async () => {
  const saved = { ...process.env };
  delete process.env.LEAKPROOF_DATA_DIR;
  assert.equal(getStore({}), null);
  const r = await post(validReview());
  assert.equal(r.statusCode, 503);
  assert.equal((await call(stats, {})).statusCode, 503);
  Object.assign(process.env, saved);
  freshEnv();
});

test('Redis store speaks the right commands and surfaces errors', async () => {
  const calls = [];
  const fake = async (url, opts) => {
    const cmds = JSON.parse(opts.body); calls.push({ url, auth: opts.headers.Authorization, cmds });
    return { ok: true, status: 200, json: async () => cmds.map((c) => (c[0] === 'SET' ? { result: 'OK' } : c[0] === 'SMEMBERS' ? { result: ['a', 'b'] } : c[0] === 'MGET' ? { result: [JSON.stringify({ id: 'a' }), null] } : { result: 1 })) };
  };
  const s = new RedisStore('https://example.upstash.io/', 'tok', fake);
  assert.equal(await s.add('review', 'a', { x: 1 }), true);
  assert.deepEqual(calls[0].cmds[0], ['SET', 'lp:review:a', '{"x":1}', 'NX']);
  assert.deepEqual(calls[0].cmds[1], ['SADD', 'lp:idx:review', 'a']);
  assert.equal(calls[0].auth, 'Bearer tok');
  assert.ok(calls[0].url.endsWith('/pipeline') && !calls[0].url.includes('//pipeline'));
  assert.deepEqual(await s.list('review'), [{ id: 'a' }]);
  assert.deepEqual(await s.claim('k', 'v'), { created: true, value: 'v' });
  const bad = new RedisStore('https://x', 't', async () => ({ ok: false, status: 500, json: async () => ({}) }));
  await assert.rejects(() => bad.list('review'));
  const errRes = new RedisStore('https://x', 't', async () => ({ ok: true, status: 200, json: async () => [{ error: 'WRONGTYPE' }] }));
  await assert.rejects(() => errRes.add('a', 'b', {}));
  assert.ok(getStore({ KV_REST_API_URL: 'https://x', KV_REST_API_TOKEN: 't' }) instanceof RedisStore);
  assert.ok(getStore({ UPSTASH_REDIS_REST_URL: 'https://x', UPSTASH_REDIS_REST_TOKEN: 't' }) instanceof RedisStore);
});

test('storage failures return a generic error, not internals', async () => {
  const saved = getStore;
  process.env.KV_REST_API_URL = 'https://127.0.0.1:9'; process.env.KV_REST_API_TOKEN = 'x';
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('connect ECONNREFUSED secret-internal-host'); };
  try {
    const r = await post(validReview());
    assert.equal(r.statusCode, 500);
    assert.ok(!JSON.stringify(r.body).includes('secret-internal-host'));
  } finally { globalThis.fetch = origFetch; delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN; }
  assert.ok(saved);
});

test('responses are never cached by shared caches on the export route', async () => {
  const r = await adminGet();
  assert.equal(r.headers['Cache-Control'], 'no-store');
});

test('follow-up call: choosing yes requires slots, a mode and a way to reach the person', async () => {
  const base = { followup: 'yes', c_contact: 'person@example.com', c_slots: ['sat3-am'], c_mode: 'meet' };
  assert.equal((await post(validReview(base))).statusCode, 200);
  for (const missing of ['c_contact', 'c_slots', 'c_mode']) {
    const a = { ...base }; delete a[missing];
    const r = await post(validReview(a));
    assert.equal(r.statusCode, 400, missing);
    assert.ok(r.body.errors.some((e) => e.includes(missing)), missing);
  }
  assert.equal((await post(validReview({ ...base, c_slots: [] }))).statusCode, 400);
  assert.equal((await post(validReview({ ...base, c_slots: ['not-a-slot'] }))).statusCode, 400);
  assert.equal((await post(validReview({ ...base, c_mode: 'carrier-pigeon' }))).statusCode, 400);
  assert.equal((await post(validReview({ ...base, c_contact: 'abc' }))).statusCode, 400, 'too short to be a contact');
  // saying no must not smuggle contact fields in
  assert.equal((await post(validReview({ followup: 'no', c_slots: ['sat3-am'] }))).statusCode, 400);
  assert.equal((await post(validReview({ followup: 'no' }))).statusCode, 200);
});

const interview = (over = {}) => ({ kind: 'interview', clientId: cid(), answers: { consent: true, c_slots: ['sat3-pm', 'sun4-am'], c_mode: 'whatsapp', c_contact: '+91 98765 43210', c_name: 'Ravi', c_topic: 'I set papers for a state board.', ...over } });

test('interview request: stored apart from answers, with the chosen times, and visible only to the admin', async () => {
  freshEnv();
  const r = await post(interview());
  assert.equal(r.statusCode, 200);
  assert.match(r.body.receipt, /^LP-/);
  assert.equal((await new FileStore(process.env.LEAKPROOF_DATA_DIR).list('review')).length, 0, 'not a review');
  const contacts = await new FileStore(process.env.LEAKPROOF_DATA_DIR).list('contact');
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].source, 'interview');
  assert.deepEqual(contacts[0].c_slots, ['sat3-pm', 'sun4-am']);
  assert.equal(contacts[0].c_mode, 'whatsapp');
  assert.ok(!('consent' in contacts[0]));
  assert.equal(JSON.stringify((await call(stats, {})).body).includes('98765'), false);
  assert.equal(JSON.stringify((await adminGet()).body).includes('98765'), false, 'default export has no contacts');
  assert.ok(JSON.stringify((await adminGet({ include: 'contact' })).body).includes('98765'));
  assert.equal((await call(exportApi, { method: 'GET', query: { include: 'contact' } })).statusCode, 401);
});

test('interview request: required fields, valid choices, no extras, one per person', async () => {
  for (const missing of ['consent', 'c_slots', 'c_mode', 'c_contact']) {
    const b = interview(); delete b.answers[missing];
    assert.equal((await post(b)).statusCode, 400, missing);
  }
  assert.equal((await post(interview({ consent: false }))).statusCode, 400);
  assert.equal((await post(interview({ c_slots: [] }))).statusCode, 400);
  assert.equal((await post(interview({ c_slots: ['yesterday'] }))).statusCode, 400);
  assert.equal((await post(interview({ c_mode: 'x' }))).statusCode, 400);
  assert.equal((await post(interview({ c_contact: 'a' }))).statusCode, 400);
  assert.equal((await post(interview({ c_topic: 'x'.repeat(801) }))).statusCode, 400);
  assert.equal((await post(interview({ role: 'faculty_ta' }))).statusCode, 400, 'review answers are not accepted here');
  const extra = interview(); extra.metrics = {};
  assert.equal((await post(extra)).statusCode, 400);
  const b = interview();
  const r1 = await post(b), r2 = await post(b);
  assert.equal(r1.body.receipt, r2.body.receipt);
  assert.equal(r2.body.duplicate, true);
  const hp = interview(); hp.website = 'spam';
  const before = (await new FileStore(process.env.LEAKPROOF_DATA_DIR).list('contact')).length;
  assert.equal((await post(hp)).statusCode, 200);
  assert.equal((await new FileStore(process.env.LEAKPROOF_DATA_DIR).list('contact')).length, before);
});

/* ---------- who gave the review: email and swap link ---------- */
const liveStore = () => new FileStore(process.env.LEAKPROOF_DATA_DIR); // an earlier test switches to a fresh folder
const participants = async () => (await adminGet({ kind: 'participants' })).body.participants;

test('email is required, and every answer that is not a plain email address is refused', async () => {
  const noEmail = validReview(); delete noEmail.answers.email;
  const r0 = await post(noEmail);
  assert.equal(r0.statusCode, 400); assert.ok(r0.body.errors.some((e) => /email is required/.test(e)));
  const bad = ['', '   ', 'plainaddress', '@example.com', 'a@', 'a@b', 'a@b.c', 'a b@example.com', 'a@exa mple.com', 'a@@example.com', 'a..b@example.com', '.a@example.com', 'a.@example.com',
    'a@-example.com', 'a@example-.com', 'a@example..com', '<script>@example.com', 'a,b@example.com', 'a;b@example.com', '"a"@example.com', 'ａ@example.com', 'a@example.com\nBcc: x@y.com',
    `${'a'.repeat(65)}@example.com`, `a@${'b'.repeat(120)}.com`, 'mailto:a@example.com', 'a@example.com, b@example.com', 'a@exämple.com'];
  for (const e of bad) {
    const r = await post(validReview({ email: e }));
    assert.equal(r.statusCode, 400, `${JSON.stringify(e)} should be refused`);
  }
  for (const wrong of [123, true, null, ['a@example.com'], { a: 'b@example.com' }]) {
    assert.equal((await post(validReview({ email: wrong }))).statusCode, 400, `${JSON.stringify(wrong)} should be refused`);
  }
});

test('email is trimmed and lower-cased, and stored only in the contact record', async () => {
  const r = await post(validReview({ email: '  Priya.Sharma+Course@IIITD.AC.IN  ' }));
  assert.equal(r.statusCode, 200);
  const contact = (await liveStore().list('contact')).find((c) => c.receipt === r.body.receipt);
  assert.equal(contact.email, 'priya.sharma+course@iiitd.ac.in');
  const review = (await liveStore().list('review')).find((x) => x.receipt === r.body.receipt);
  assert.ok(!('email' in review.answers) && !JSON.stringify(review).toLowerCase().includes('iiitd'));
  assert.ok(!JSON.stringify((await call(stats, {})).body).toLowerCase().includes('iiitd'));
  assert.ok(!JSON.stringify((await adminGet()).body).toLowerCase().includes('iiitd'), 'not in the default export');
  assert.ok(!(await adminGet({ format: 'csv' })).body.toLowerCase().includes('iiitd'), 'not in the analysis CSV');
});

test('the swap link: required for classmates, optional for others, and only a plain web link is accepted', async () => {
  const peer = validReview({ role: 'course_peer' }); delete peer.answers.c_link;
  const r1 = await post(peer);
  assert.equal(r1.statusCode, 400); assert.ok(r1.body.errors.some((e) => /c_link is required/.test(e)));
  assert.equal((await post(validReview({ role: 'course_peer', c_link: '   ' }))).statusCode, 400, 'blank is not a link');
  for (const role of ['other_student', 'faculty_ta', 'exam_staff', 'other']) {
    const o = validReview({ role }); delete o.answers.c_link;
    assert.equal((await post(o)).statusCode, 200, `${role} may skip the link`);
  }
  const bad = ['forms.gle/abc', 'www.example.com', '//example.com', 'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', 'ftp://example.com/x',
    'https://user:pass@example.com/x', 'https://user@example.com', 'https://exa mple.com', 'https://', 'https://example', 'https://-bad.com', 'https://bad-.com', 'https:example.com', 'https://example.com/ with space',
    `https://example.com/${'a'.repeat(300)}`, 'https://example.com\nhttps://evil.com', 'http:/example.com'];
  for (const link of bad) {
    assert.equal((await post(validReview({ role: 'course_peer', c_link: link }))).statusCode, 400, `${JSON.stringify(link)} should be refused`);
    assert.equal((await post(validReview({ role: 'other', c_link: link }))).statusCode, 400, `${JSON.stringify(link)} should be refused even when optional`);
  }
  for (const wrong of [42, true, ['https://example.com'], { u: 'https://example.com' }]) assert.equal((await post(validReview({ c_link: wrong }))).statusCode, 400);
  const ok = await post(validReview({ role: 'course_peer', c_link: ' https://Forms.GLE/AbC123?x=1 ' }));
  assert.equal(ok.statusCode, 200);
  const contact = (await liveStore().list('contact')).find((c) => c.receipt === ok.body.receipt);
  assert.equal(contact.c_link, 'https://forms.gle/AbC123?x=1', 'host is normalised, path and case after it are kept');
  const http = await post(validReview({ role: 'other', c_link: 'http://localhost:3000/survey' }));
  assert.equal(http.statusCode, 200, 'plain http is allowed (some course tools are served that way)');
  const review = (await liveStore().list('review')).find((x) => x.receipt === ok.body.receipt);
  assert.ok(!('c_link' in review.answers) && !JSON.stringify((await call(stats, {})).body).includes('forms.gle'));
});

test('participants view: admin only, ties each review to its email, flags repeats, and is safe in a spreadsheet', async () => {
  assert.equal((await call(exportApi, { method: 'GET', query: { kind: 'participants' } })).statusCode, 401);
  assert.equal((await adminGet({ kind: 'participants' }, 'wrong-key-123')).statusCode, 401);
  assert.equal((await adminGet({ kind: 'participants', format: 'csv' }, '')).statusCode, 401);
  const a = await post(validReview({ email: 'repeat.person@example.com', c_link: 'https://example.com/a' }));
  const b = await post(validReview({ email: 'Repeat.Person@Example.com', c_link: 'https://example.com/b' }));
  const c = await post(validReview({ email: '=cmd@example.com', c_name: '=HYPERLINK("http://evil.example")' }));
  assert.ok([a, b, c].every((r) => r.statusCode === 200));
  const rows = await participants();
  const mine = rows.filter((p) => p.email === 'repeat.person@example.com');
  assert.equal(mine.length, 2); assert.ok(mine.every((p) => p.timesSeen === 2), 'the same email twice is flagged');
  assert.deepEqual(mine.map((p) => p.receipt).sort(), [a.body.receipt, b.body.receipt].sort());
  assert.ok(mine.every((p) => p.reviewFound && p.role === 'course_peer' && p.minutes >= 1 && p.completedTasks === 4));
  const csv = (await adminGet({ kind: 'participants', format: 'csv' })).body;
  assert.ok(csv.split('\n')[0].startsWith('receipt,receivedAt,email,name,role'));
  assert.ok(csv.includes("'=cmd@example.com"), 'a leading = is neutralised');
  assert.ok(csv.includes(`"'=HYPERLINK(""http://evil.example"")"`), 'a formula in the name is neutralised');
  assert.ok(!/(^|,)=/m.test(csv));
});

test('two different people with the same email each get a receipt; the same person retrying gets one', async () => {
  const one = validReview({ email: 'twin@example.com' });
  const two = validReview({ email: 'twin@example.com' });
  const r1 = await post(one), r2 = await post(two), r1again = await post(one);
  assert.notEqual(r1.body.receipt, r2.body.receipt);
  assert.equal(r1again.body.receipt, r1.body.receipt); assert.equal(r1again.body.duplicate, true);
  assert.equal((await participants()).filter((p) => p.email === 'twin@example.com').length, 2);
});

test('an interview request or a quick comment can never appear as a reviewer, and carries no email', async () => {
  const before = (await participants()).length;
  await post({ kind: 'interview', clientId: cid(), answers: { consent: true, c_slots: ['sat3-am'], c_mode: 'meet', c_contact: 'x@y.co' } });
  await post({ kind: 'quick', clientId: cid(), scene: '1', clear: 'yes', comment: 'ok' });
  assert.equal((await participants()).length, before);
  const iv = await post({ kind: 'interview', clientId: cid(), answers: { consent: true, c_slots: ['sat3-am'], c_mode: 'meet', c_contact: 'x@y.co', email: 'z@example.com' } });
  assert.equal(iv.statusCode, 400, 'the interview form has no email field, so an extra one is refused');
});
