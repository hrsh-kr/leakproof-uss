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
  const b = validReview({ followup: 'yes', c_contact: 'secret-person@example.com', c_name: 'Secret Person' });
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
