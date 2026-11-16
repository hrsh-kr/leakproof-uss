// T7 extra tests (round 5). Drop into tests/ as extra.test.mjs. Each test names the mutants it kills (see T7_regression_mutation.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { boot, practiceUser, sealAndVerify, releaseOpen } from './helpers.mjs';
import { start } from '../server.mjs';
import { openDb, tx } from '../src/db.mjs';
import { makeLog } from '../src/log.mjs';
import { loadKey } from '../src/config.mjs';
import { rand, seal, open, split, combine, hmac, checkPassword, SHARE_BYTES } from '../src/crypto.mjs';
import { SECURITY_HEADERS, makeLimiter } from '../src/http.mjs';

const rawRequest = (port, text) => new Promise((resolve) => {
  const s = net.connect(port, '127.0.0.1', () => s.write(text));
  let out = ''; s.on('data', (d) => { out += d; }); s.on('close', () => resolve(out)); s.on('error', () => resolve(out));
  setTimeout(() => s.destroy(), 3000);
});
const Q = (n) => ({ text: `Official question number ${n}?`, options: ['one', 'two', 'three', 'four'], correct: 1 });

// An official exam with two setters, a cell (run+print), a print-only desk and five single-card holders.
async function official(t) {
  const app = t.app;
  const id = app.exams.createExam({ title: 'Official', topics: ['A', 'B'], winStart: Date.now() - 1000, winEnd: Date.now() + 3600_000, seatLimit: 10, practice: false });
  const people = {};
  const mk = async (name, caps) => {
    const acc = await app.createAccount(name, name);
    for (const [cap, slot] of caps) app.exams.assign(acc.id, id, cap, slot ?? null);
    const c = t.client();
    assert.equal((await c.post('/api/login', { username: name, password: acc.passphrase })).status, 200);
    people[name] = { acc, c };
  };
  await mk('setter1', [['submit']]); await mk('setter2', [['submit']]); await mk('setter3', [['submit']]);
  await mk('cell', [['run'], ['print']]); await mk('desk', [['print']]); await mk('runonly', [['run']]);
  for (let s = 1; s <= 5; s++) await mk(`holder${s}`, [['hold', s]]);
  const qids = {};
  for (const [n, who] of [['setter1', 0], ['setter2', 1]]) for (const topic of [0, 1])
    qids[`${n}:${topic}`] = app.exams.submit(id, people[n].acc.id, { topic, ...Q(who * 2 + topic) });
  return { id, people, qids };
}
async function officialOpen(t, f, verify = 5, seats = 4) {
  const { id, people: p } = f;
  assert.equal((await p.cell.c.post(`/api/exams/${id}/seal`)).status, 200);
  const shares = {};
  for (let s = 1; s <= verify; s++) {
    const h = p[`holder${s}`].c;
    shares[s] = (await h.get(`/api/exams/${id}/cards/${s}`)).data.share;
    assert.equal((await h.post(`/api/exams/${id}/cards/${s}/verify`, { share: shares[s] })).status, 200);
  }
  return shares;
}
const wordsOf = async (cell, rid) => (await cell.get(`/api/releases/${rid}`)).data.words;

test('X1 [SR5] approve/refuse needs BOTH words, exactly two: one right word, extra words or none are refused and record no approval (E73 E74 E75)', async () => {
  const t = await boot({ LP_INSTANCE: 'official' });
  try {
    const f = await official(t); await officialOpen(t, f);
    const rid = (await f.people.cell.c.post(`/api/exams/${f.id}/release`, { seats: 3 })).data.id;
    const [w1, w2] = await wordsOf(f.people.cell.c, rid);
    const h = f.people.holder1.c, share = (await t.db.prepare('SELECT 1').get(), null);
    const body = (words) => ({ slot: 1, decision: 'refuse', words });
    for (const words of [w1, `${w1} nonsenseword`, `nonsenseword ${w2}`, `${w1} ${w2} ${w2}`, '', `${w2} ${w1}`]) {
      const r = await h.post(`/api/releases/${rid}/decide`, body(words));
      assert.equal(r.status, 409, `words "${words}" must be refused`);
    }
    assert.equal(t.db.prepare('SELECT COUNT(*) n FROM approvals WHERE release_id = ?').get(rid).n, 0, 'no decision recorded');
  } finally { await t.stop(); }
});

test('X2 [SR4/SR5] approving needs a verified card AND the matching share; a wrong or foreign share records nothing (E80 E81)', async () => {
  const t = await boot({ LP_INSTANCE: 'official' });
  try {
    const f = await official(t); const shares = await officialOpen(t, f, 4);
    const cell = f.people.cell.c, rid = (await cell.post(`/api/exams/${f.id}/release`, { seats: 3 })).data.id;
    const words = (await wordsOf(cell, rid)).join(' ');
    // holder5 never verified: even with the right share (fetched from the server) approval is refused.
    const s5 = (await f.people.holder5.c.get(`/api/exams/${f.id}/cards/5`)).data.share;
    let r = await f.people.holder5.c.post(`/api/releases/${rid}/decide`, { slot: 5, decision: 'approve', share: s5, words });
    assert.equal(r.status, 409); assert.match(r.data.error, /Verify your card first/);
    // holder2 is verified but sends holder1's share (valid format, valid share, wrong card).
    r = await f.people.holder2.c.post(`/api/releases/${rid}/decide`, { slot: 2, decision: 'approve', share: shares[1], words });
    assert.equal(r.status, 409); assert.match(r.data.error, /does not match this exam/);
    assert.equal(t.db.prepare('SELECT COUNT(*) n FROM approvals WHERE release_id = ?').get(rid).n, 0);
    assert.equal(t.app.exams._pending.has(rid), false, 'nothing is held in memory for a rejected approval');
    // Not a share at all: 400, not a crash.
    r = await f.people.holder2.c.post(`/api/releases/${rid}/decide`, { slot: 2, decision: 'approve', share: 'zz', words });
    assert.equal(r.status, 400);
  } finally { await t.stop(); }
});

test('X3 [SR3/SR5] the two words are shown to the exam cell only, never to key holders, and not after the request expired (E64 E65 E62 E59)', async () => {
  const t = await boot({ LP_INSTANCE: 'official' });
  try {
    const f = await official(t); await officialOpen(t, f);
    const cell = f.people.cell.c;
    const rid = (await cell.post(`/api/exams/${f.id}/release`, { seats: 3 })).data.id;
    assert.equal((await f.people.holder1.c.get(`/api/releases/${rid}`)).status, 200);
    assert.equal('words' in (await f.people.holder1.c.get(`/api/releases/${rid}`)).data, false, 'a holder must not see the words');
    assert.equal((await wordsOf(cell, rid)).length, 2);
    // a newer request replaces the old one, and the words depend on the request (nonce), not only on the seat count
    const seen = new Set([(await wordsOf(cell, rid)).join(' ')]); let prev = rid;
    for (let i = 0; i < 4; i++) {
      const next = (await cell.post(`/api/exams/${f.id}/release`, { seats: 3 })).data.id;
      assert.equal((await cell.get(`/api/releases/${prev}`)).data.state, 'replaced');
      seen.add((await wordsOf(cell, next)).join(' ')); prev = next;
    }
    assert.ok(seen.size > 1, 'words must differ between requests');
    t.db.prepare('UPDATE releases SET expires = ? WHERE id = ?').run(Date.now() - 1, prev);
    const v = (await cell.get(`/api/releases/${prev}`)).data;
    assert.equal(v.state, 'expired'); assert.equal('words' in v, false, 'expired request shows no words');
    // and /api/me no longer asks a holder to approve it
    assert.equal((await f.people.holder1.c.get('/api/me')).data.waiting.some((w) => w.kind === 'approve'), false);
  } finally { await t.stop(); }
});

test('X4 [SR1/SR3] a holder cannot answer for another slot, a setter cannot delete another setter\'s question; the question survives (E67 E22)', async () => {
  const t = await boot({ LP_INSTANCE: 'official' });
  try {
    const f = await official(t);
    const qid = f.qids['setter1:0'];
    assert.equal((await f.people.setter2.c.del(`/api/exams/${f.id}/questions/${qid}`)).status, 404);
    assert.equal(t.db.prepare('SELECT COUNT(*) n FROM questions WHERE id = ?').get(qid).n, 1);
    const shares = await officialOpen(t, f);
    const cell = f.people.cell.c, rid = (await cell.post(`/api/exams/${f.id}/release`, { seats: 3 })).data.id;
    const words = (await wordsOf(cell, rid)).join(' ');
    const r = await f.people.holder1.c.post(`/api/releases/${rid}/decide`, { slot: 2, decision: 'approve', share: shares[2], words });
    assert.equal(r.status, 404, 'holder1 answering as slot 2');
    assert.equal(t.db.prepare('SELECT COUNT(*) n FROM approvals WHERE release_id = ?').get(rid).n, 0);
  } finally { await t.stop(); }
});

test('X5 [SR3/SR10] question rules: lengths, exactly four distinct options, bounds, one per topic, nothing after sealing (E11 E12 E13 E14 E15 E17 E19 E20 E21 E23 E25)', async () => {
  const t = await boot();
  try {
    const { c, examId } = await practiceUser(t);
    const ok = { topic: 0, text: 'A valid question text?', options: ['a1', 'b2', 'c3', 'd4'], correct: 0 };
    const post = (over) => c.post(`/api/exams/${examId}/questions`, { ...ok, ...over });
    // the tester already has a question in every topic: remove topic 0 first
    const mine = (await c.get(`/api/exams/${examId}/questions`)).data.questions;
    for (const q of mine) assert.equal((await c.del(`/api/exams/${examId}/questions/${q.id}`)).status, 200);
    for (const [why, over] of [['text 4 chars', { text: 'abcd' }], ['text 501 chars', { text: 'x'.repeat(501) }],
      ['three options', { options: ['a', 'b', 'c'] }], ['five options', { options: ['a', 'b', 'c', 'd', 'e'] }],
      ['option 201 chars', { options: ['a', 'b', 'c', 'x'.repeat(201)] }], ['duplicate options differing in case', { options: ['Same', 'same', 'c', 'd'] }],
      ['correct = 4', { correct: 4 }], ['correct = -1', { correct: -1 }], ['topic 10 (only 0..9)', { topic: 10 }], ['topic -1', { topic: -1 }]])
      assert.equal((await post(over)).status, 400, why);
    assert.equal((await post({ text: 'x'.repeat(500), options: ['a', 'b', 'c', 'x'.repeat(200)] })).status, 201, 'the limits themselves are allowed');
    assert.equal((await post({})).status, 409, 'second question for the same topic');
    const qid = (await c.get(`/api/exams/${examId}/questions`)).data.questions[0].id;
    // seal (needs every topic covered by 2 setters: submit the rest from the tester's own account)
    for (let tp = 1; tp < 10; tp++) await post({ topic: tp, text: `Topic ${tp} question?` });
    await sealAndVerify(c, examId, 0);
    assert.equal((await post({ topic: 0 })).status, 409, 'no new question after sealing');
    assert.equal((await c.del(`/api/exams/${examId}/questions/${qid}`)).status, 409, 'no delete after sealing');
    assert.equal((await c.post(`/api/exams/${examId}/seal`)).status, 409, 'cannot seal twice');
    assert.equal(t.db.prepare("SELECT COUNT(*) n FROM cards WHERE exam_id = ?").get(examId).n, 5, 'a second seal must not re-draw or re-issue cards');
  } finally { await t.stop(); }
});

test('X6 [SR4/SR5] release gates: not before sealing, not while open, only whole positive seat numbers; verify rejects a wrong or malformed share (E47 E48 E49 E42 E45 E46)', async () => {
  const t = await boot();
  try {
    const { c, examId } = await practiceUser(t);
    assert.equal((await c.post(`/api/exams/${examId}/release`, { seats: 5 })).status, 409, 'release before seal');
    const shares = await sealAndVerify(c, examId, 0);
    for (const seats of [0, -3, 1.5, 'abc']) assert.equal((await c.post(`/api/exams/${examId}/release`, { seats })).status, 400, `seats=${seats}`);
    // verify: wrong but well-formed share, short share, non-hex share
    const v = (body) => c.post(`/api/exams/${examId}/cards/1/verify`, body);
    assert.equal((await v({ share: shares[2] })).status, 409, "slot 2's share does not verify slot 1");
    assert.equal((await v({ share: '00'.repeat(SHARE_BYTES) })).status, 409);
    assert.equal((await v({ share: 'ab'.repeat(SHARE_BYTES - 1) })).status, 400);
    assert.equal((await v({ share: 'zz'.repeat(SHARE_BYTES) })).status, 400);
    assert.equal((await v({})).status, 400);
    assert.equal(t.db.prepare('SELECT verified FROM cards WHERE exam_id = ? AND slot = 1').get(examId).verified, null);
    for (let s = 1; s <= 5; s++) await c.post(`/api/exams/${examId}/cards/${s}/verify`, { share: shares[s] });
    await releaseOpen(c, examId, shares, 5);
    assert.equal((await c.post(`/api/exams/${examId}/release`, { seats: 5 })).status, 409, 'release while the paper is open');
  } finally { await t.stop(); }
});

test('X7 [SR5/SR9] an open paper: copies and keys obey seat range, window and stage; trace needs an open paper and caps its input; a restart closes an OPEN release (E87 E89 E101 E102 E109 E5)', async () => {
  const t = await boot();
  let t2;
  try {
    const { c, examId } = await practiceUser(t);
    const shares = await sealAndVerify(c, examId);
    assert.equal((await c.post(`/api/exams/${examId}/trace`, { text: 'x' })).status, 409, 'trace before release');
    const { rid } = await releaseOpen(c, examId, shares, 5);
    const rel = t.db.prepare('SELECT created, expires FROM releases WHERE id = ?').get(rid);
    assert.equal(rel.expires - rel.created, 15 * 60 * 1000, 'a request lives 15 minutes');
    assert.equal((await c.get(`/api/exams/${examId}/copies/0`)).status, 409, 'seat 0');
    assert.equal((await c.get(`/api/exams/${examId}/copies/6`)).status, 409, 'seat above the release');
    assert.equal((await c.get(`/api/exams/${examId}/key/0`)).status, 409);
    assert.equal((await c.post(`/api/exams/${examId}/trace`, { text: 'q\n'.repeat(5000) })).status, 400, 'trace input cap is 8000 characters');
    assert.equal((await c.get(`/api/exams/${examId}/copies/1`)).status, 200);
    // the window closes while the paper is open: copies and keys stop
    t.db.prepare('UPDATE exams SET win_end = ? WHERE id = ?').run(Date.now() - 1000, examId);
    for (const p of [`copies/1`, `key/1`]) { const r = await c.get(`/api/exams/${examId}/${p}`); assert.equal(r.status, 409, p); assert.equal(r.data.gate, 'G2'); }
    // restart on the same data: the open release is marked interrupted and the paper is locked again
    const cfg = t.config;
    await new Promise((r) => { t.server.closeAllConnections(); t.server.close(r); }); t.db.close();
    t2 = await start({ ...cfg, port: 0 });
    assert.equal(t2.db.prepare('SELECT state FROM releases WHERE id = ?').get(rid).state, 'interrupted');
  } finally {
    if (t2) { await new Promise((r) => { t2.server.closeAllConnections(); t2.server.close(r); }); t2.db.close(); }
    fs.rmSync(t.dataDir, { recursive: true, force: true });
  }
});

test('X8 [SR4/SR7] key material is wiped, not just forgotten: approvals in memory are zeroed once the paper opens, when a request is replaced and when it fails (E84 E60)', async () => {
  const t = await boot();
  try {
    const { c, examId } = await practiceUser(t);
    const shares = await sealAndVerify(c, examId);
    const ask = async () => { const rid = (await c.post(`/api/exams/${examId}/release`, { seats: 5 })).data.id; return { rid, words: (await c.get(`/api/releases/${rid}`)).data.words.join(' ') }; };
    const approve = (rid, words, slot) => c.post(`/api/releases/${rid}/decide`, { slot, decision: 'approve', share: shares[slot], words });
    // replaced
    let a = await ask(); await approve(a.rid, a.words, 1); await approve(a.rid, a.words, 2);
    const held = [...t.app.exams._pending.get(a.rid).values()]; assert.equal(held.length, 2);
    assert.ok(held.every((b) => b.some((x) => x !== 0)));
    const b = await ask();
    assert.ok(held.every((buf) => buf.every((x) => x === 0)), 'replaced request: shares zeroed');
    // opened
    await approve(b.rid, b.words, 1); await approve(b.rid, b.words, 2);
    const held2 = [...t.app.exams._pending.get(b.rid).values()];
    assert.equal((await approve(b.rid, b.words, 3)).data.state, 'open');
    assert.ok(held2.every((buf) => buf.every((x) => x === 0)), 'opened: shares zeroed');
    assert.equal(t.app.exams._pending.size, 0);
  } finally { await t.stop(); }
});

test('X9 [SR7/SR4] sealing alone (before any card is verified) already leaves no question ciphertext in the db or its WAL (E31)', async () => {
  const t = await boot();
  try {
    const { c, examId } = await practiceUser(t);
    const cts = t.db.prepare('SELECT ct FROM questions WHERE exam_id = ?').all(examId).map((r) => Buffer.from(r.ct));
    assert.ok(cts.length >= 40);
    assert.equal((await c.post(`/api/exams/${examId}/seal`)).status, 200);
    // the server is still running: no later checkpoint (card verification) has happened
    let found = 0;
    for (const f of fs.readdirSync(t.dataDir)) {
      const bytes = fs.readFileSync(path.join(t.dataDir, f));
      for (const ct of cts) if (bytes.includes(ct.subarray(0, 24))) found++;
    }
    assert.equal(found, 0, 'question ciphertext still on disk right after sealing');
  } finally { await t.stop(); }
});

test('X10 [SR8] every exam gets a fresh random draw seed (E32)', async () => {
  const t = await boot();
  try {
    const seeds = [];
    for (let i = 0; i < 2; i++) {
      const { c, examId } = await practiceUser(t);
      const shares = await sealAndVerify(c, examId); await releaseOpen(c, examId, shares, 3);
      seeds.push((await t.client().get(`/api/public/log/${examId}`)).data.draw.seed);
    }
    assert.match(seeds[0], /^[0-9a-f]{64}$/); assert.notEqual(seeds[0], seeds[1]); assert.notEqual(seeds[0], '0'.repeat(64));
  } finally { await t.stop(); }
});

test('X11 [SR6] the chain detects every field of an edited entry, a re-linked prev and a deleted entry whose neighbour was patched (L2 L7 L8 L11)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-x11-'));
  const db = openDb(dir), log = makeLog(db, rand(32));
  for (let i = 0; i < 6; i++) log.append('EX', `actor${i}`, 'act', { count: i });
  assert.equal(log.verify().ok, true);
  db.exec('DROP TRIGGER log_no_update'); db.exec('DROP TRIGGER log_no_delete');
  const broken = (sql, ...a) => { const snap = db.prepare('SELECT * FROM log ORDER BY seq').all(); db.prepare(sql).run(...a); const r = log.verify(); db.exec('DELETE FROM log'); for (const s of snap) db.prepare('INSERT INTO log (seq, exam_id, at, actor, action, detail, prev, hash) VALUES (?,?,?,?,?,?,?,?)').run(s.seq, s.exam_id, s.at, s.actor, s.action, s.detail, s.prev, s.hash); return r.ok === false; };
  assert.ok(broken("UPDATE log SET actor = 'mallory' WHERE seq = 3"), 'actor');
  assert.ok(broken('UPDATE log SET at = at + 1 WHERE seq = 3'), 'timestamp');
  assert.ok(broken("UPDATE log SET exam_id = 'OTHER' WHERE seq = 3"), 'exam id');
  assert.ok(broken("UPDATE log SET action = 'other' WHERE seq = 3"), 'action');
  assert.ok(broken("UPDATE log SET prev = ? WHERE seq = 3", 'f'.repeat(64)), 'prev pointer');
  // delete entry 3 and patch entry 4's prev to point at entry 2: possible without the key only if prev is not inside the hash
  const h2 = db.prepare('SELECT hash FROM log WHERE seq = 2').get().hash;
  const snap = db.prepare('SELECT * FROM log ORDER BY seq').all();
  db.prepare('DELETE FROM log WHERE seq = 3').run(); db.prepare('UPDATE log SET prev = ? WHERE seq = 4').run(h2);
  assert.equal(log.verify().ok, false, 'deleting an entry and re-linking its neighbour must be detected');
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('X12 [SR2/FCS] rate limits per bucket: public check-head, sensitive routes (20/min), and X-Real-IP is ignored unless the proxy flag is set (A47 A48 A49 A60 A61 A67)', async () => {
  const t = await boot({ LP_PUBLIC_PER_MIN: '5' });
  const t2 = await boot({ LP_AUTH_PER_MIN: '3' });
  try {
    const { c, examId } = await practiceUser(t);
    // sensitive: 20 per minute per account
    const hits = []; for (let i = 0; i < 24; i++) hits.push((await c.post(`/api/exams/${examId}/cards/1/verify`, { share: 'ab'.repeat(SHARE_BYTES) })).status);
    assert.equal(hits.filter((s) => s === 429).length, 4, `20 allowed then 429: ${hits}`);
    const anon = t.client();
    assert.equal((await anon.post('/api/public/check-head', { head: 'z'.repeat(64) })).status, 400, 'non-hex head');
    assert.equal((await anon.post('/api/public/check-head', { head: 'a'.repeat(63) })).status, 400);
    const codes = [];
    for (let i = 0; i < 8; i++) codes.push((await anon.post('/api/public/check-head', { head: 'a'.repeat(64) })).status);
    assert.ok(codes.includes(429), `public bucket must trip: ${codes}`);
    // a client cannot dodge a limit by inventing X-Real-IP when the proxy flag is off
    const liar = t2.client(), got = [];
    for (let i = 0; i < 6; i++) got.push((await liar.post('/api/login', { username: `nobody${i}`, password: 'x' }, { 'x-real-ip': `10.9.8.${i}` })).status);
    assert.ok(got.includes(429), `X-Real-IP spoofing must not reset the limit: ${got}`);
  } finally { await t.stop(); await t2.stop(); }
});

test('X13 [SR2] backoff is keyed by user AND client: failures against one username do not lock another username from the same client (A11), a short display name is refused (A18)', async () => {
  const t = await boot();
  try {
    const a = await practiceUser(t), b = await practiceUser(t);
    const name = async (c) => (await c.get('/api/me')).data.username;
    const an = await name(a.c), bn = await name(b.c);
    for (let i = 0; i < 6; i++) await t.client().post('/api/login', { username: an, password: 'wrong' });
    assert.equal((await t.client().post('/api/login', { username: an, password: a.passphrase })).status, 429, 'the attacked account is backing off');
    assert.equal((await t.client().post('/api/login', { username: bn, password: b.passphrase })).status, 200, 'another user from the same client is not locked');
    const r = await t.client().post('/api/register', { invite: 'USS-PRACTICE', username: 'shortdisp1', display: 'x' });
    assert.equal(r.status, 400);
  } finally { await t.stop(); }
});

test('X14 [SR1/SR3/SR2b] official: only staff see counts and the printed list; a forced-change account can still read /api/me and log out; activation is logged (A71 A72 A34 A35 A32)', async () => {
  const t = await boot({ LP_INSTANCE: 'official' });
  try {
    const f = await official(t); const P = f.people;
    const sum = async (n) => (await P[n].c.get(`/api/exams/${f.id}`)).data;
    for (const n of ['setter1', 'holder1']) { const s = await sum(n); assert.equal('counts' in s, false, `${n} sees no counts`); assert.equal('printed' in s, false); assert.equal('holders' in s, false); }
    for (const n of ['cell', 'desk', 'runonly']) assert.ok('counts' in (await sum(n)), `${n} is staff`);
    // operator-made account
    const op = await t.app.createAccount('fresh1', 'Fresh', { mustChange: true });
    t.app.exams.assign(op.id, f.id, 'submit');
    const c = t.client();
    assert.equal((await c.post('/api/login', { username: 'fresh1', password: op.passphrase })).status, 200);
    const me = await c.get('/api/me'); assert.equal(me.status, 200); assert.equal(me.data.mustChange, true);
    assert.equal((await c.get(`/api/exams/${f.id}`)).status, 403);
    assert.equal((await c.post('/api/passphrase', { current: op.passphrase })).status, 200);
    assert.ok(t.db.prepare("SELECT 1 FROM log WHERE action = 'account.activated'").get(), 'first change is logged as activation');
    const c2 = t.client(); const op2 = await t.app.createAccount('fresh2', 'Fresh2', { mustChange: true });
    await c2.post('/api/login', { username: 'fresh2', password: op2.passphrase });
    assert.equal((await c2.post('/api/logout')).status, 200, 'a forced-change account can sign out');
    assert.equal((await c2.get('/api/me')).status, 401);
  } finally { await t.stop(); }
});

test('X15 [SR10/SR11] every kind of response carries the full header set with the strict values: API, static, 404, 429, 413 and raw parser errors (H9-H14 H16 S14)', async () => {
  const t = await boot({ LP_AUTH_PER_MIN: '1' });
  try {
    const anon = t.client(), port = new URL(t.base).port;
    const responses = [await anon.get('/healthz'), await anon.get('/'), await anon.get('/app.js'), await anon.get('/nope.txt'), await anon.get('/api/nothing'),
      await anon.post('/api/login', { username: 'a', password: 'b' }), await anon.post('/api/login', { username: 'a', password: 'b' }),
      await anon.raw('POST', '/api/public/check-head', 'x'.repeat(20000), { 'content-type': 'application/json' })];
    assert.ok(responses.some((r) => r.status === 429) && responses.some((r) => r.status === 413));
    for (const r of responses) for (const k of Object.keys(SECURITY_HEADERS)) assert.equal(r.headers.get(k), SECURITY_HEADERS[k], `${r.status} ${k}`);
    const csp = SECURITY_HEADERS['Content-Security-Policy'];
    for (const need of ["default-src 'self'", "script-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'none'", "form-action 'self'"]) assert.ok(csp.includes(need), need);
    assert.ok(!/unsafe-inline|unsafe-eval|\*/.test(csp));
    assert.equal(SECURITY_HEADERS['Referrer-Policy'], 'no-referrer'); assert.match(SECURITY_HEADERS['Permissions-Policy'], /camera=\(\)/);
    assert.equal(SECURITY_HEADERS['Cross-Origin-Opener-Policy'], 'same-origin'); assert.equal(SECURITY_HEADERS['Cross-Origin-Resource-Policy'], 'same-origin');
    assert.equal((await anon.get('/healthz')).headers.get('cache-control'), 'no-store', 'API answers are never cached');
    const big = await rawRequest(port, `GET /healthz HTTP/1.1\r\nHost: x\r\nX-Pad: ${'a'.repeat(9000)}\r\n\r\n`);
    assert.match(big, /^HTTP\/1\.1 431 /); assert.match(big, /Content-Security-Policy/i);
  } finally { await t.stop(); }
});

test('X16 [SR1] a JSON array or a DELETE with a body is refused or ignored, never treated as an object (H5 H6 H2)', async () => {
  const t = await boot();
  try {
    const { c, examId } = await practiceUser(t);
    assert.equal((await c.post('/api/login', [1, 2])).status, 400);
    assert.equal((await c.post('/api/login', 'null')).status, 400);
    const r = await c.raw('POST', '/api/login', 'x'.repeat(20000), { 'content-type': 'application/json', 'content-length': '20000' });
    assert.equal(r.status, 413);
    const qid = (await c.post(`/api/exams/${examId}/questions`, { topic: 0, text: 'A valid question text?', options: ['a', 'b', 'c', 'd'], correct: 0 })).data.id;
    // DELETE with a non-JSON body is handled like any body: 415, and the question is still there
    const d = await c.raw('DELETE', `/api/exams/${examId}/questions/${qid}`, 'not json', { 'content-type': 'text/plain' });
    assert.equal(d.status, 415);
    assert.equal((await c.get(`/api/exams/${examId}/questions`)).data.questions.length, 1);
  } finally { await t.stop(); }
});

test('X17 [SR4] crypto unit: fresh IV per seal, AAD binds context, HMAC parts are unambiguous, bad shares are refused, odd password hashes fail closed (C5 C6 C7 C9 C10 C17)', async () => {
  const key = rand(32);
  assert.notDeepEqual(seal(key, Buffer.from('same'), 'a'), seal(key, Buffer.from('same'), 'a'), 'IV must be fresh');
  assert.throws(() => open(key, seal(key, Buffer.from('x'), 'ctx|1'), 'ctx|2'));
  assert.notDeepEqual(hmac(key, 'ab', 'c'), hmac(key, 'a', 'bc'), 'parts are length-separated');
  assert.throws(() => split(rand(32), 1, 5)); assert.throws(() => split(rand(32), 6, 5)); assert.throws(() => split(rand(32), 2, 300));
  const secret = rand(32), sh = split(secret, 3, 5);
  assert.deepEqual(combine([sh[0], sh[2], sh[4]]), secret);
  const big = Buffer.concat([Buffer.from([1]), Buffer.alloc(66, 0xff)]);                 // y >= p
  assert.throws(() => combine([big, sh[1], sh[2]]), /bad share/);
  assert.throws(() => combine([sh[0], sh[1]], 1), /bad shares/, 'result longer than the expected key length');
  assert.throws(() => combine([sh[0], sh[0]]), /duplicate/);
  for (const stored of ['', 'garbage', 's1$', 's1$AAAA$', 'x1$AAAA$BBBB']) assert.equal(await checkPassword('pw', stored), false, stored);
});

test('X18 [SR7/SR6] storage hygiene: key dir and files are private, a log-only database still refuses a fresh key, a failed transaction rolls back, bad capability rows are rejected (D2 D3 D4 D11 D13 D15)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-x18-')), sub = path.join(dir, 'k');
  const db = openDb(path.join(dir, 'd'));
  loadKey(sub, 'server.key', db);
  assert.equal(fs.statSync(sub).mode & 0o077, 0, 'key dir is owner-only');
  assert.equal(fs.statSync(path.join(sub, 'server.key')).mode & 0o077, 0, 'key file is owner-only');
  assert.equal(fs.statSync(path.join(dir, 'd', 'leakproof.db')).mode & 0o077, 0, 'db file is owner-only');
  db.prepare("INSERT INTO log (exam_id, at, actor, action, detail, prev, hash) VALUES ('e', 1, 'a', 'x', '{}', 'p', 'h')").run();
  assert.throws(() => loadKey(sub, 'log.key', db), /Refusing to start/, 'log data but no accounts: still no silent new key');
  assert.throws(() => tx(db, () => { db.exec("INSERT INTO accounts (id, username, display, pw, created) VALUES ('i','u','d','p',1)"); throw new Error('boom'); }), /boom/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM accounts').get().n, 0, 'rolled back');
  db.exec("INSERT INTO accounts (id, username, display, pw, created) VALUES ('i','u','d','p',1)");
  db.exec("INSERT INTO exams (id,title,stage,practice,topics,win_start,win_end,seat_limit,created) VALUES ('e','t','COLLECTING',0,'[]',0,0,1,0)");
  assert.throws(() => db.exec("INSERT INTO assignments (account_id, exam_id, cap, slot) VALUES ('i','e','root',NULL)"));
  assert.throws(() => db.exec("INSERT INTO assignments (account_id, exam_id, cap, slot) VALUES ('ghost','e','run',NULL)"), 'foreign keys are enforced (D14)');
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('X19 [FCS] practice reset is capped at 10 exams per account, exactly (A63 A64)', async () => {
  const t = await boot();
  try {
    const { c } = await practiceUser(t);
    const codes = [];
    for (let i = 0; i < 10; i++) codes.push((await c.post('/api/practice/reset')).status);
    assert.deepEqual(codes, [201, 201, 201, 201, 201, 201, 201, 201, 201, 429], 'the first exam came with the account, so 9 resets fit');
  } finally { await t.stop(); }
});

test('X20 [SR1/SR5] official extras: a setter with no question still cannot add one after sealing; slots are 1..5; sealing needs five holders; an unknown decision word is refused (E11 E10 E27 E72)', async () => {
  const t = await boot({ LP_INSTANCE: 'official' });
  try {
    const f = await official(t); const P = f.people, ex = t.app.exams;
    // five holders are required to seal
    const id2 = ex.createExam({ title: 'No holders', topics: ['A'], winStart: Date.now() - 1000, winEnd: Date.now() + 3600_000, seatLimit: 5, practice: false });
    ex.assign(P.cell.acc.id, id2, 'run');
    for (const n of ['setter1', 'setter2']) ex.submit(id2, P[n].acc.id, { topic: 0, ...Q(9) });
    const r2 = await P.cell.c.post(`/api/exams/${id2}/seal`);
    assert.equal(r2.status, 409); assert.match(r2.data.error, /Five key holders/);
    assert.equal(ex.getExam(id2).stage, 'COLLECTING');
    assert.throws(() => ex.assign(P.cell.acc.id, id2, 'hold', 6), /slot must be 1..5/);
    assert.throws(() => ex.assign(P.cell.acc.id, id2, 'hold', 0), /slot must be 1..5/);
    // main exam: seal, then setter3 (who never submitted) tries to add a question
    const shares = await officialOpen(t, f);
    const late = await P.setter3.c.post(`/api/exams/${f.id}/questions`, { topic: 0, ...Q(7) });
    assert.equal(late.status, 409); assert.equal(t.db.prepare('SELECT COUNT(*) n FROM questions WHERE exam_id = ? AND setter_id = ?').get(f.id, P.setter3.acc.id).n, 0);
    // a decision word that is neither approve nor refuse must not count as an approval
    const cell = P.cell.c, rid = (await cell.post(`/api/exams/${f.id}/release`, { seats: 3 })).data.id;
    const words = (await wordsOf(cell, rid)).join(' ');
    const m = await P.holder1.c.post(`/api/releases/${rid}/decide`, { slot: 1, decision: 'maybe', share: shares[1], words });
    assert.equal(m.status, 400);
    assert.equal(t.db.prepare('SELECT COUNT(*) n FROM approvals WHERE release_id = ?').get(rid).n, 0);
  } finally { await t.stop(); }
});

test('X21 [SR2/FCS] two racing requests: only one passphrase change wins, and a username is never created twice (A31 A23)', async () => {
  const t = await boot();
  try {
    const { c, passphrase } = await practiceUser(t);
    const two = await Promise.all([c.post('/api/passphrase', { current: passphrase }), c.post('/api/passphrase', { current: passphrase })]);
    assert.deepEqual(two.map((r) => r.status).sort(), [200, 409], 'exactly one change wins');
    const reg = () => t.client().post('/api/register', { invite: 'USS-PRACTICE', username: 'racer01', display: 'Racer' });
    const rr = await Promise.all([reg(), reg(), reg()]);
    assert.deepEqual(rr.map((r) => r.status).sort(), [201, 409, 409], 'one account, the others get a clean 409 (not a 500)');
  } finally { await t.stop(); }
});

test('X22 [SR2] limiter unit: a window really resets, the counter is exact, and the key table is capped (H17 H18 H19)', () => {
  const hit = makeLimiter(3);
  assert.equal(hit('a', 2, 1000, 0).ok, true); assert.equal(hit('a', 2, 1000, 1).ok, true);
  const third = hit('a', 2, 1000, 2); assert.equal(third.ok, false); assert.equal(third.retry, 1);
  assert.equal(hit('a', 2, 1000, 1000).ok, true, 'a new window starts after the old one ends');
  assert.equal(hit.peek('a', 1001).n, 1);
  // cap on distinct keys: the oldest is evicted, memory stays bounded
  for (const k of ['b', 'c', 'd', 'e']) hit(k, 5, 1000, 1500);
  assert.equal(hit.peek('a', 1501).n, 0, 'oldest key evicted at the cap');
  assert.equal(hit.peek('e', 1501).n, 1);
});

// ============================================================================
// Part B: public/app.js logic under node:test, with NO change to app.js.
// The helpers are cut out of the source text by name and evaluated in a vm sandbox
// (WebCrypto, TextEncoder, atob/btoa are all in Node 22). If app.js is later split
// into modules, replace pick() with a plain import.
// ============================================================================
import vm from 'node:vm';
const APP = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
function pick(...names) {
  const out = [];
  for (const n of names) {
    const m = new RegExp(`^(?:async )?function ${n}\\(|^const ${n}\\b`, 'm').exec(APP);
    assert.ok(m, `app.js no longer defines ${n}`);
    let i = m.index, depth = 0, started = false, j = i;
    for (; j < APP.length; j++) {
      const ch = APP[j];
      if ('{(['.includes(ch)) { depth++; started = true; } else if ('})]'.includes(ch)) depth--;
      else if (ch === '\n' && started && depth === 0) break;
    }
    out.push(APP.slice(i, j));
  }
  return out.join('\n');
}
function loadClient() {
  const src = pick('OFFLINE', 'dur', 'waitText', 'fallbackError', 'enc', 'b64', 'unb64', 'cardKey', 'makeCard', 'readCards', 'openCard', 'checkNewPass')
    .replace(/^const enc = .*$/m, '') + '\nconst enc = new TextEncoder(), dec = new TextDecoder();';
  const ctx = vm.createContext({ crypto: globalThis.crypto, atob, btoa, TextEncoder, TextDecoder, Uint8Array, JSON, Number, String, Error, Promise, console });
  vm.runInContext(src + '\nthis.api = { dur, waitText, fallbackError, makeCard, readCards, openCard, checkNewPass, OFFLINE };', ctx);
  return ctx.api;
}

test('CLIENT card file: encrypt in the browser code, then open it again; wrong passphrase, wrong exam and wrong slot are refused with the right message', async () => {
  const k = loadClient();
  const share = 'ab'.repeat(67), exam = 'e'.repeat(32);
  const c1 = await k.makeCard(exam, 1, share, 'correct horse battery'), c2 = await k.makeCard(exam, 2, 'cd'.repeat(67), 'correct horse battery');
  assert.match(c1, /^LPCARD1\./);
  assert.ok(!c1.includes(share), 'the card does not contain the share in clear');
  const file = c1 + '\n' + c2;
  assert.equal(await k.openCard(file, exam, 1, 'correct horse battery'), share);
  assert.equal(await k.openCard(file, exam, 2, 'correct horse battery'), 'cd'.repeat(67));
  await assert.rejects(k.openCard(file, exam, 1, 'wrong passphrase!'), /Wrong passphrase for card 1/);
  await assert.rejects(k.openCard(file, exam, 1, ''), /Type the card passphrase/);
  await assert.rejects(k.openCard(file, 'f'.repeat(32), 1, 'correct horse battery'), /different exam/);
  await assert.rejects(k.openCard(c1, exam, 3, 'correct horse battery'), /This is key card 1, not card 3/);
  await assert.rejects(k.openCard(file, exam, 3, 'correct horse battery'), /holds key cards 1, 2, not card 3/);
  await assert.rejects(k.openCard('hello world', exam, 1, 'x'), /does not look like a LeakProof key card/);
  // AAD binds the card to its exam and slot: relabel card 1 as slot 2 inside the JSON and it must not open.
  const obj = JSON.parse(Buffer.from(c1.slice(8), 'base64url').toString()); obj.s = 2;
  const forged = 'LPCARD1.' + Buffer.from(JSON.stringify(obj)).toString('base64url');
  await assert.rejects(k.openCard(forged, exam, 2, 'correct horse battery'), /Wrong passphrase for card 2|damaged/);
});

test('CLIENT card file parsing: wrapped lines are rejoined, junk is ignored, CRLF and extra blank lines are fine', async () => {
  const k = loadClient(), exam = 'a'.repeat(32);
  const c = await k.makeCard(exam, 4, '01'.repeat(67), 'passphrase 123');
  const wrapped = c.match(/.{1,40}/g).join('\n');           // an email client wrapped the line
  assert.deepEqual([...k.readCards(wrapped)].map((x) => x.s), [4]);
  assert.equal(k.readCards(`junk\r\n\r\n${c}\r\n${c}\r\n`).length, 2);
  assert.equal(k.readCards('').length, 0);
  assert.equal(k.readCards('LPCARD1.%%%%').length, 0, 'undecodable card text yields nothing, not an exception');
  assert.equal(k.readCards('LPCARD1.' + Buffer.from('"just a string"').toString('base64url')).length, 0, 'non-object JSON is not a card');
});

test('CLIENT error mapping: 429 shows the real Retry-After, 413 and gateway errors have their own text, anything else is generic', () => {
  const k = loadClient(), res = (status, ra) => ({ status, headers: { get: () => ra ?? null } });
  assert.match(k.fallbackError(res(429, '7')), /Wait 7 seconds/);
  assert.match(k.fallbackError(res(429, '600')), /Wait 10 min/);
  assert.match(k.fallbackError(res(429, '999999')), /Wait a minute/, 'absurd Retry-After falls back');
  assert.match(k.fallbackError(res(429, 'abc')), /Wait a minute/);
  assert.match(k.fallbackError(res(413)), /too long/);
  for (const s of [502, 503, 504]) assert.equal(k.fallbackError(res(s)), k.OFFLINE);
  assert.match(k.fallbackError(res(500)), /Something went wrong/);
  assert.equal(k.dur(90 * 60_000), '1 h 30 min'); assert.equal(k.dur(26 * 3600_000), '1 d 2 h');
  assert.throws(() => k.checkNewPass('short', 'short'), /at least 10/);
  assert.throws(() => k.checkNewPass('longenough1', 'longenough2'), /different/);
  assert.doesNotThrow(() => k.checkNewPass('longenough1', 'longenough1'));
});
