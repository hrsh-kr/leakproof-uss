// End-to-end through the production storage path (RedisStore over HTTP) against a small fake of Upstash's REST API.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startRedisEmulator } from './redis-emulator.mjs';
import { call, validReview, cid } from './helpers.mjs';

const emu = await startRedisEmulator();
const TOKEN = emu.token, store = emu.store;
const url = emu.url;
const server = { close: () => emu.close() };
let requests = 0;
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN = TOKEN; process.env.ADMIN_KEY = 'redis-admin-key-1';
delete process.env.LEAKPROOF_DATA_DIR;

const { default: submit } = await import('../api/submit.js');
const { default: stats } = await import('../api/stats.js');
const { default: exportApi } = await import('../api/export.js');
const post = (body) => call(submit, { method: 'POST', body });
const admin = (query = {}) => call(exportApi, { method: 'GET', headers: { 'x-admin-key': 'redis-admin-key-1' }, query });

test.after(() => server.close());

test('production storage: a review, a quick comment and an interview request are stored and read back over HTTP', async () => {
  const r = await post(validReview({ c_name: 'Redis Tester' }));
  assert.equal(r.statusCode, 200);
  assert.equal((await post({ kind: 'quick', clientId: cid(), scene: '3', clear: 'no', comment: 'Seat numbers confuse me' })).statusCode, 200);
  const iv = await post({ kind: 'interview', clientId: cid(), answers: { consent: true, c_when: 'Sunday afternoon', c_contact: '98765 43210' } });
  assert.equal(iv.statusCode, 200);
  assert.ok(emu.requests > 0);
  const keys = [...store.keys()];
  assert.ok(keys.some((k) => k.startsWith('lp:review:')), 'review stored');
  assert.ok(keys.some((k) => k.startsWith('lp:quick:')), 'quick stored');
  assert.equal(keys.filter((k) => k.startsWith('lp:contact:')).length, 2, 'two contact records: one from the review, one from the interview');
  const exp = (await admin()).body;
  assert.equal(exp.reviews.length, 1); assert.equal(exp.quick.length, 1); assert.equal(exp.contact, undefined);
  const withContact = (await admin({ include: 'contact' })).body;
  assert.deepEqual(withContact.contact.map((c) => c.source).sort(), ['interview', 'review']);
  const st = (await call(stats, {})).body;
  assert.equal(st.n.review, 1); assert.equal(st.n.quick, 1);
  assert.ok(!JSON.stringify(st).includes('98765'));
});

test('production storage: one person submitting many times in parallel is stored exactly once', async () => {
  const before = [...store.keys()].filter((k) => k.startsWith('lp:review:')).length;
  const b = validReview();
  const rs = await Promise.all(Array.from({ length: 12 }, () => post(b)));
  assert.ok(rs.every((r) => r.statusCode === 200));
  assert.equal(new Set(rs.map((r) => r.body.receipt)).size, 1, 'everyone got the same receipt');
  assert.equal([...store.keys()].filter((k) => k.startsWith('lp:review:')).length - before, 1);
});

test('production storage: 40 different people submitting at once are all stored and counted', async () => {
  const before = [...store.keys()].filter((k) => k.startsWith('lp:review:')).length;
  const rs = await Promise.all(Array.from({ length: 40 }, (_, i) => post(validReview({ t1_seq: (i % 7) + 1 }))));
  assert.ok(rs.every((r) => r.statusCode === 200));
  assert.equal(new Set(rs.map((r) => r.body.receipt)).size, 40);
  assert.equal([...store.keys()].filter((k) => k.startsWith('lp:review:')).length - before, 40);
  const st = (await call(stats, {})).body;
  assert.ok(st.n.review >= 41);
  assert.equal(typeof st.tasks.t1.meanSeq, 'number', 'enough people now, so the numbers appear');
  assert.equal(st.comprehension.rate, 1);
});

test('production storage: a wrong token or an unreachable store gives a generic error and leaks nothing', async () => {
  const saved = process.env.KV_REST_API_TOKEN;
  process.env.KV_REST_API_TOKEN = 'wrong-token';
  const r = await post(validReview());
  assert.equal(r.statusCode, 500);
  assert.ok(!JSON.stringify(r.body).includes('wrong-token') && !JSON.stringify(r.body).includes('127.0.0.1'));
  assert.equal((await call(stats, {})).statusCode, 500);
  process.env.KV_REST_API_TOKEN = saved;
  process.env.KV_REST_API_URL = 'http://127.0.0.1:1';
  assert.equal((await post(validReview())).statusCode, 500);
  process.env.KV_REST_API_URL = url;
  assert.equal((await post(validReview())).statusCode, 200, 'recovers when the store is back');
});
