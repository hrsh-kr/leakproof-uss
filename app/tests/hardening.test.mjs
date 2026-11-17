// Round 4 hardening: each test is a regression for a weakness found in our own code or in the other groups' designs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFileSync } from 'node:child_process';
import { boot, practiceUser, sealAndVerify, releaseOpen, joinAs, PW, NEWPW } from './helpers.mjs';
import { start } from '../server.mjs';
import { loadConfig, loadKey } from '../src/config.mjs';
import { openDb } from '../src/db.mjs';
import { makeLog } from '../src/log.mjs';
import { createApp } from '../src/app.mjs';
import { rand, sha256 } from '../src/crypto.mjs';

const rawRequest = (port, text) => new Promise((resolve) => {
  const s = net.connect(port, '127.0.0.1', () => s.write(text));
  let out = ''; s.on('data', (d) => { out += d; }); s.on('close', () => resolve(out)); s.on('error', () => resolve(out));
  setTimeout(() => s.destroy(), 3000);
});
const keysOf = (t) => ({ serverKey: fs.readFileSync(path.join(t.dataDir, 'server.key')), logKey: fs.readFileSync(path.join(t.dataDir, 'log.key')) });

let t;
test.before(async () => { t = await boot(); });
test.after(() => t.stop());

test('S1 a malformed request target gets 400 and the server stays up (one request used to crash it)', async () => {
  const port = t.server.address().port;
  for (const target of ['//a:b', 'http://[', '//[::1', '//x:99999/']) {
    const out = await rawRequest(port, `GET ${target} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`);
    assert.match(out, /^HTTP\/1\.1 400/, target);
    assert.equal((await fetch(t.base + '/healthz')).status, 200, `still up after ${target}`);
  }
});

test('S2 an undecodable cookie is ignored: 401 instead of 500, and login still works', async () => {
  const u = await practiceUser(t);
  const me = await fetch(t.base + '/api/me', { headers: { cookie: 'lp_sid=%E0%A4%A; other=%' } });
  assert.equal(me.status, 401);
  const c = t.client();
  const r = await c.post('/api/login', { username: (await u.c.get('/api/me')).data.username, password: u.passphrase }, { cookie: 'junk=%E0%A4%A' });
  assert.equal(r.status, 200);
});

test('S3 the public log returns the last 200 entries plus a total; card fetches are logged once per slot', async () => {
  const { c, examId } = await practiceUser(t);
  for (let i = 0; i < 3; i++) await c.get(`/api/exams/${examId}`);
  await c.post(`/api/exams/${examId}/seal`);
  for (let i = 0; i < 3; i++) assert.equal((await c.get(`/api/exams/${examId}/cards/1`)).status, 200);
  const fetched = t.db.prepare("SELECT COUNT(*) n FROM log WHERE exam_id = ? AND action = 'card.fetched'").get(examId).n;
  assert.equal(fetched, 1, 'repeated fetches of one card add one log row');
  for (let i = 0; i < 250; i++) t.app.log.append(examId, 'system', 'copy.reprinted', { seat: 1, fetch: i });
  const pub = (await t.client().get(`/api/public/log/${examId}`)).data;
  assert.equal(pub.entries.length, 200);
  assert.ok(pub.total >= 250);
  assert.equal(pub.entries[199].detail.fetch, 249, 'newest last');
  assert.equal(pub.chain.ok, true);
  assert.equal(typeof pub.chain.checkedAt, 'number');
});

test('S3 the full chain is checked at most every 30 s, and an edited row is still detected within 30 s', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-log-'));
  let clock = 1_000_000;
  const db = openDb(dir), log = makeLog(db, rand(32), () => clock);
  for (let i = 0; i < 5; i++) log.append('E', 'a', 'x', { count: i });
  const first = log.status();
  assert.equal(first.ok, true); assert.equal(first.entries, 5);
  db.exec('DROP TRIGGER log_no_update');
  db.exec(`UPDATE log SET detail = '{"count":9}' WHERE seq = 3`);
  clock += 10_000;
  assert.equal(log.status().ok, true, 'cached: no full walk within 30 s');
  assert.equal(log.status().checkedAt, first.checkedAt);
  clock += 21_000;
  const after = log.status();
  assert.deepEqual([after.ok, after.brokenAt], [false, 3]);
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('S4 a restart marks a release with approvals "interrupted" (logged), so the screen says to request again', async () => {
  const { c, examId } = await practiceUser(t);
  const shares = await sealAndVerify(c, examId);
  const rid = (await c.post(`/api/exams/${examId}/release`, { seats: 5 })).data.id;
  const words = (await c.get(`/api/releases/${rid}`)).data.words.join(' ');
  const fresh = createApp({ db: t.db, config: t.config, ...keysOf(t) }); // what a process restart does
  const v = fresh.exams.releaseView(rid);
  assert.equal(v.state, 'interrupted');
  assert.match(v.next, /server restarted: request release again/i);
  assert.equal(t.db.prepare("SELECT COUNT(*) n FROM log WHERE exam_id = ? AND action = 'release.interrupted'").get(examId).n, 1);
  assert.equal((await c.get(`/api/exams/${examId}`)).data.release.state, 'interrupted');
  assert.equal((await c.post(`/api/releases/${rid}/decide`, { slot: 1, decision: 'approve', share: shares[1], words })).status, 409);
  const { last } = await releaseOpen(c, examId, shares, 5, [1]);
  assert.equal(last.data.state, 'open');
});

test('S5 shares of a replaced or expired request are wiped from memory', async () => {
  const { c, examId } = await practiceUser(t);
  const shares = await sealAndVerify(c, examId);
  const rid = (await c.post(`/api/exams/${examId}/release`, { seats: 5 })).data.id;
  // Inject a fake pending entry to simulate a mid-approval state before replacement
  const fakeShare = Buffer.allocUnsafe(32).fill(0xAB);
  t.app.exams._pending.set(rid, new Map([[1, fakeShare]]));
  assert.equal(t.app.exams._pending.has(rid), true);
  const rid2 = (await c.post(`/api/exams/${examId}/release`, { seats: 5 })).data.id;
  assert.equal(t.app.exams._pending.has(rid), false, 'replaced');
  assert.ok(fakeShare.every((x) => x === 0), 'replaced request: share in memory must be zeroed');
  const w2 = (await c.get(`/api/releases/${rid2}`)).data.words.join(' ');
  // Inject another fake pending entry and expire rid2 to test expiry path
  const fakeShare2 = Buffer.allocUnsafe(32).fill(0xCD);
  t.app.exams._pending.set(rid2, new Map([[1, fakeShare2]]));
  t.db.prepare('UPDATE releases SET expires = ? WHERE id = ?').run(Date.now() - 1, rid2);
  await c.post(`/api/releases/${rid2}/decide`, { slot: 1, decision: 'approve', share: shares[1], words: w2 });
  assert.equal(t.app.exams._pending.has(rid2), false, 'expired');
  assert.ok(fakeShare2.every((x) => x === 0), 'expired request: share in memory must be zeroed');
});

test('S6 after seal and verify, no stored question ciphertext or wrapped share is left anywhere in the data files', async () => {
  const b = await boot();
  try {
    const { c, examId } = await practiceUser(b);
    const tac = b.client();
    const taReg = await joinAs(tac, 'ta', c, examId, 'ta-s6-' + (Date.now() % 9999), 'TA S6');
    assert.equal(taReg.status, 201);
    await tac.post(`/api/exams/${examId}/questions`, { topic: 2, text: 'Which planet is the canary on?', options: ['a1', 'b1', 'c1', 'd1'], correct: 0 });
    const cts = b.db.prepare('SELECT ct FROM questions WHERE exam_id = ?').all(examId).map((r) => Buffer.from(r.ct));
    assert.equal(cts.length, 11);
    await c.post(`/api/exams/${examId}/seal`);
    const wrapped = b.db.prepare('SELECT share_wrapped FROM cards WHERE exam_id = ?').all(examId).map((r) => Buffer.from(r.share_wrapped));
    for (let slot = 1; slot <= 1; slot++) {
      const share = (await c.get(`/api/exams/${examId}/cards/${slot}`)).data.share;
      await c.post(`/api/exams/${examId}/cards/${slot}/verify`, { share });
    }
    const files = fs.readdirSync(b.dataDir).map((f) => fs.readFileSync(path.join(b.dataDir, f)));
    const left = (blobs) => blobs.filter((x) => files.some((f) => f.includes(x.subarray(0, 40)))).length;
    assert.equal(left(cts), 0, 'question ciphertexts left on disk');
    assert.equal(left(wrapped), 0, 'wrapped shares left on disk');
  } finally { await b.stop(); }
});

test('S7 the exam cell gets a per-seat answer key while the paper is open; it matches that seat\'s order', async () => {
  const { c, examId } = await practiceUser(t);
  const shares = await sealAndVerify(c, examId);
  assert.equal((await c.get(`/api/exams/${examId}/key/3`)).status, 409, 'not before release');
  await releaseOpen(c, examId, shares, 10);
  const copy = (await c.get(`/api/exams/${examId}/copies/3`)).data;
  const key = (await c.get(`/api/exams/${examId}/key/3`)).data;
  assert.equal(key.seat, 3); assert.equal(key.copyId, copy.copyId);
  const paper = t.app.exams._opened.get(examId).paper;
  assert.deepEqual(key.answers, copy.questions.map((q) => {
    const p = paper.find((x) => x.text === q.text);
    return 'ABCD'[q.options.indexOf(p.options[p.correct])];
  }));
  assert.equal((await c.get(`/api/exams/${examId}/key/11`)).status, 409, 'seat above the released count');
  assert.equal(t.db.prepare("SELECT COUNT(*) n FROM log WHERE exam_id = ? AND action = 'key.viewed'").get(examId).n, 1);
});

test('S8 shared networks: only successful sign-ups count, and check-head has its own bucket', async () => {
  const b = await boot({ LP_REGISTER_PER_IP: '2', LP_AUTH_PER_MIN: '3' });
  try {
    const reg = (u, inv = 'LP-PROF-G19') => b.client().post('/api/register', { password: PW, invite: inv, role: 'professor', username: u, display: 'Xy' });
    assert.equal((await reg('first1')).status, 201);
    assert.equal((await reg('first1')).status, 409, 'taken name: does not count');
    assert.equal((await reg('second2')).status, 201);
    assert.equal((await reg('third3')).status, 429);
    const c = b.client();
    for (let i = 0; i < 3; i++) await c.post('/api/login', { username: 'u', password: 'p' });
    assert.equal((await c.post('/api/login', { username: 'u', password: 'p' })).status, 429);
    assert.equal((await c.post('/api/public/check-head', { head: 'a'.repeat(64) })).status, 200, 'check-head is not in the auth bucket');
  } finally { await b.stop(); }
  const d = loadConfig({});
  assert.deepEqual([d.registerPerIp, d.maxAccounts, d.authPerMin], [30, 2000, 30]);
});

test('S9/S10 refusing needs the two words; wrong words are logged; 5 wrong attempts lock out that holder only, not the request', async () => {
  const { c, examId } = await practiceUser(t);
  const shares = await sealAndVerify(c, examId);
  const rid = (await c.post(`/api/exams/${examId}/release`, { seats: 5 })).data.id;
  const words = (await c.get(`/api/releases/${rid}`)).data.words.join(' ');
  const noWords = await c.post(`/api/releases/${rid}/decide`, { slot: 1, decision: 'refuse' });
  assert.equal(noWords.status, 409); assert.match(noWords.data.error, /two words/);
  assert.equal((await c.get(`/api/releases/${rid}`)).data.state, 'pending', 'a refusal without the words changes nothing');
  let r; // the refusal without words above was wrong attempt 1 for slot 1
  for (let i = 0; i < 4; i++) r = await c.post(`/api/releases/${rid}/decide`, { slot: 1, decision: 'approve', share: shares[1], words: 'wrong guess' });
  assert.match(r.data.error, /locked out/);
  assert.equal((await c.get(`/api/releases/${rid}`)).data.state, 'pending', 'the request stays open for everyone else');
  assert.equal(t.db.prepare("SELECT COUNT(*) n FROM log WHERE exam_id = ? AND action = 'release.words_failed'").get(examId).n, 5);
  assert.equal(t.db.prepare("SELECT COUNT(*) n FROM log WHERE exam_id = ? AND action = 'release.holder_locked'").get(examId).n, 1);
  const locked = await c.post(`/api/releases/${rid}/decide`, { slot: 1, decision: 'approve', share: shares[1], words });
  assert.equal(locked.status, 409); assert.match(locked.data.error, /locked out/, 'even the right words do not help a locked-out holder');
  assert.equal(t.app.exams._pending.has(rid), false);
});

test('S11 accounts made by the operator must set their own passphrase; the change ends other sessions only', async () => {
  const b = await boot({ LP_INSTANCE: 'official' });
  try {
    const id = b.app.exams.createExam({ title: 'Official', topics: ['A'], winStart: Date.now(), winEnd: Date.now() + 3600_000, seatLimit: 5, practice: false });
    const acc = await b.app.createAccount('holder1', 'Holder', { mustChange: true });
    b.app.exams.assign(acc.id, id, 'hold', 1);
    const login = async (p) => { const c = b.client(); assert.equal((await c.post('/api/login', { username: 'holder1', password: p })).status, 200); return c; };
    const c = await login(acc.passphrase), other = await login(acc.passphrase);
    assert.equal((await c.get('/api/me')).data.mustChange, true);
    const blocked = await c.get(`/api/exams/${id}`);
    assert.deepEqual([blocked.status, blocked.data.mustChange, blocked.data.error], [403, true, 'Set your own password first.']);
    assert.equal((await c.post('/api/password', { current: 'wrong-wrong', next: PW })).status, 401);
    assert.equal((await c.post('/api/password', { current: acc.passphrase, next: 'password1234' })).status, 400, 'a weak choice is refused');
    const ch = await c.post('/api/password', { current: acc.passphrase, next: PW });
    assert.equal(ch.status, 200);
    assert.equal(ch.data.passphrase, undefined, 'the server never sends a password back'); assert.ok(ch.data.recovery, 'operator-made account: fresh recovery code');
    assert.equal((await c.get('/api/me')).data.mustChange, false, 'the current session stays');
    assert.equal((await c.get(`/api/exams/${id}`)).status, 200);
    assert.equal((await other.get('/api/me')).status, 401, 'other sessions ended');
    assert.equal((await b.client().post('/api/login', { username: 'holder1', password: acc.passphrase })).status, 401, 'operator copy is dead');
    assert.equal((await b.client().post('/api/recover', { next: NEWPW, username: 'holder1', recovery: acc.recovery })).status, 401, 'operator recovery code is dead');
    await login(PW);
    for (let i = 0; i < 5; i++) await c.post('/api/password', { current: 'wrong-wrong', next: NEWPW });
    assert.equal((await c.post('/api/password', { current: PW, next: NEWPW })).status, 429, 'backoff like login');
  } finally { await b.stop(); }
});

test('S11 official-setup marks every account must_change; practice sign-up does not; old databases gain the column', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-setup-'));
  try {
    const script = new URL('../scripts/official-setup.mjs', import.meta.url).pathname;
    const example = new URL('../deploy/official.example.json', import.meta.url).pathname;
    execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', script, example], { env: { ...process.env, LP_INSTANCE: 'official', LP_DATA_DIR: dir }, stdio: 'pipe' });
    const db = openDb(dir);
    const rows = db.prepare('SELECT must_change FROM accounts WHERE simulated = 0').all();
    assert.equal(rows.length, JSON.parse(fs.readFileSync(example, 'utf8')).people.length); assert.ok(rows.every((r) => r.must_change === 1));
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  const u = await practiceUser(t);
  assert.equal((await u.c.get('/api/me')).data.mustChange, false);
  const old = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-old-'));
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const raw = new DatabaseSync(path.join(old, 'leakproof.db'));
    raw.exec("CREATE TABLE accounts (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, display TEXT NOT NULL, pw TEXT NOT NULL, recovery TEXT, simulated INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL); INSERT INTO accounts VALUES ('a','old','Old','!',NULL,0,1)");
    raw.close();
    for (let i = 0; i < 2; i++) {
      const db = openDb(old);
      assert.equal(db.prepare('SELECT must_change FROM accounts').get().must_change, 0);
      db.close();
    }
  } finally { fs.rmSync(old, { recursive: true, force: true }); }
});

test('S12 background polls (X-LP-Background: 1) do not refresh the idle timer', async () => {
  const { c } = await practiceUser(t);
  const h = sha256(c.jar.get('lp_sid')).toString('hex');
  const before = Date.now() - 20 * 60_000;
  t.db.prepare('UPDATE sessions SET seen = ? WHERE hash = ?').run(before, h);
  assert.equal((await c.get('/api/me', { 'x-lp-background': '1' })).status, 200);
  assert.equal(t.db.prepare('SELECT seen FROM sessions WHERE hash = ?').get(h).seen, before);
  await c.get('/api/me');
  assert.ok(t.db.prepare('SELECT seen FROM sessions WHERE hash = ?').get(h).seen > before);
});

test('S13 start-up refuses to make a new key when the database already has data; first run still creates keys', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-keys-'));
  try {
    const config = loadConfig({ LP_DATA_DIR: dir, LP_PORT: '0', LP_DEV_HTTP: '1' });
    const s = await start(config);
    assert.ok(fs.existsSync(path.join(dir, 'server.key')) && fs.existsSync(path.join(dir, 'log.key')));
    await s.app.createAccount('keeper', 'Keeper');
    await new Promise((r) => s.server.close(r)); s.db.close();
    fs.rmSync(path.join(dir, 'log.key'));
    const res = await start(config).then((s2) => new Promise((r) => s2.server.close(() => { s2.db.close(); r('started'); })), (e) => e.message);
    assert.match(res, /log\.key is missing but the database already has data/);
    assert.equal(fs.existsSync(path.join(dir, 'log.key')), false, 'no new key was written');
    const db = openDb(dir);
    assert.throws(() => loadKey(dir, 'log.key', db), /missing/);
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('S14 after release the draw seed is in the public log, and the old run-only seed route is gone', async () => {
  const { c, examId } = await practiceUser(t);
  const anon = t.client();
  assert.equal((await anon.get(`/api/public/log/${examId}`)).data.draw, null);
  assert.equal((await c.get(`/api/exams/${examId}/seed`)).status, 404);
  const shares = await sealAndVerify(c, examId);
  assert.equal((await anon.get(`/api/public/log/${examId}`)).data.draw, null, 'not while sealed');
  await releaseOpen(c, examId, shares, 3);
  const { draw: d } = (await anon.get(`/api/public/log/${examId}`)).data;
  const { draw } = await import('../src/exam.mjs');
  assert.equal(d.pool.length, 10);
  assert.deepEqual(Object.keys(d.pool[0]).sort(), ['id', 'topic']);
  assert.deepEqual(draw(Buffer.from(d.seed, 'hex'), d.pool, 10), d.drawn);
});

test('S15 window refusals use relative times and suggest a fresh practice exam; the summary carries serverNow and minVerified', async () => {
  const { c, examId } = await practiceUser(t);
  const x = (await c.get(`/api/exams/${examId}`)).data;
  assert.ok(Math.abs(x.serverNow - Date.now()) < 5000); assert.equal(x.minVerified, 1);
  assert.ok(x.window.end - Date.now() > 13 * 24 * 3600_000, 'practice window is 14 days');
  await sealAndVerify(c, examId);
  t.db.prepare('UPDATE exams SET win_end = ? WHERE id = ?').run(Date.now() - (2 * 3600_000 + 5 * 60_000), examId);
  const e = (await c.post(`/api/exams/${examId}/release`, { seats: 5 })).data.error;
  assert.match(e, /closed 2 h 5 min ago/); assert.match(e, /fresh practice exam/); assert.ok(!/UTC/.test(e));
  t.db.prepare('UPDATE exams SET win_start = ?, win_end = ? WHERE id = ?').run(Date.now() + 3 * 3600_000 + 20 * 60_000 + 30_000, Date.now() + 5 * 3600_000, examId);
  assert.match((await c.post(`/api/exams/${examId}/release`, { seats: 5 })).data.error, /opens in 3 h 20 min/);
});

test('S16 Retry-After is the real wait; chunked bodies over 16 KB get 413; HEAD works on static files; raw 400s carry headers', async () => {
  const b = await boot({ LP_TRUST_PROXY: '1' });
  try {
    await practiceUser(b, 'carol');
    let r;
    for (let i = 0; i < 6; i++) r = await b.client().post('/api/login', { username: 'carol', password: 'x' }, { 'x-real-ip': '10.9.9.9' });
    assert.equal(r.status, 429);
    assert.ok(Number(r.headers.get('retry-after')) <= 2, `Retry-After ${r.headers.get('retry-after')}`);
    const port = b.server.address().port;
    const big = 'x'.repeat(20_000);
    const out = await rawRequest(port, `POST /api/login HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n${big.length.toString(16)}\r\n${big}\r\n0\r\n\r\n`);
    assert.match(out, /^HTTP\/1\.1 413/);
    const head = await fetch(b.base + '/', { method: 'HEAD' });
    assert.equal(head.status, 200); assert.match(head.headers.get('content-security-policy'), /default-src 'self'/);
    const bad = await rawRequest(port, 'GET / HTTP/1.1\r\nHost: x\r\nBad Header Line\r\n\r\n');
    assert.match(bad, /^HTTP\/1\.1 400/); assert.match(bad, /X-Content-Type-Options: nosniff/); assert.match(bad, /X-Frame-Options: DENY/);
  } finally { await b.stop(); }
});

test('S16 recovery codes are single-use even when two requests race', async () => {
  const u = await practiceUser(t);
  const name = (await u.c.get('/api/me')).data.username;
  const rs = await Promise.all([0, 1].map(() => t.client().post('/api/recover', { next: NEWPW, username: name, recovery: u.recovery })));
  assert.deepEqual(rs.map((r) => r.status).sort(), [200, 401]);
});

test('S16 a paper with fewer than 4 questions still prints (the neighbour rule needs 4+)', async () => {
  const { c, examId } = await practiceUser(t);
  const shares = await sealAndVerify(c, examId);
  await releaseOpen(c, examId, shares, 3);
  const st = t.app.exams._opened.get(examId);
  st.paper = st.paper.slice(0, 1); st.layouts = [];
  for (let s = 1; s <= 3; s++) assert.equal((await c.get(`/api/exams/${examId}/copies/${s}`)).data.questions.length, 1);
});

test('S1 unexpected errors return a reference code only (no stack, no path)', async () => {
  const { c, examId } = await practiceUser(t);
  const route = t.app.routes.find((r) => r.method === 'GET' && r.path === '/api/exams/:id');
  const h = route.handler;
  route.handler = () => { throw new Error('boom at /Users/secret/app.mjs:1'); };
  try {
    const r = await c.get(`/api/exams/${examId}`);
    assert.equal(r.status, 500); assert.match(r.data.error, /reference [0-9a-f]{8}/); assert.ok(!/Users|boom/.test(JSON.stringify(r.data)));
  } finally { route.handler = h; }
});

test('SR2 sessions: the absolute 8 h limit holds and only a hash of the session id is stored', async () => {
  const { c } = await practiceUser(t);
  const sid = c.jar.get('lp_sid');
  assert.equal(t.db.prepare('SELECT COUNT(*) n FROM sessions WHERE hash = ?').get(sha256(sid).toString('hex')).n, 1, 'stored as sha256');
  assert.ok(!JSON.stringify(t.db.prepare('SELECT * FROM sessions').all()).includes(sid));
  t.db.prepare('UPDATE sessions SET created = ? WHERE hash = ?').run(Date.now() - 8 * 3600_000 - 1000, sha256(sid).toString('hex'));
  assert.equal((await c.get('/api/me')).status, 401);
});

test('keys load as 32 raw bytes or as 64 hex characters (openssl rand -hex 32); anything else refuses to start', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-key-'));
  const hex = 'ab'.repeat(32);
  fs.writeFileSync(path.join(dir, 'hex.key'), hex + '\n');
  assert.equal(loadKey(dir, 'hex.key').toString('hex'), hex);
  fs.writeFileSync(path.join(dir, 'raw.key'), Buffer.alloc(32, 7));
  assert.equal(loadKey(dir, 'raw.key').length, 32);
  fs.writeFileSync(path.join(dir, 'bad.key'), 'short');
  assert.throws(() => loadKey(dir, 'bad.key'), /32 raw bytes or 64 hex/);
  fs.rmSync(dir, { recursive: true, force: true });
});
