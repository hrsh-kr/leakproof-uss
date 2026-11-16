// Round 5 fixes (S1-S14 of the fix plan): each test fails if its fix is reverted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFileSync, spawnSync } from 'node:child_process';
import { boot, practiceUser, sealAndVerify, releaseOpen } from './helpers.mjs';
import { start } from '../server.mjs';
import { loadConfig, loadKey } from '../src/config.mjs';
import { openDb } from '../src/db.mjs';
import { createApp } from '../src/app.mjs';
import { sha256 } from '../src/crypto.mjs';
import { SECURITY_HEADERS } from '../src/http.mjs';

const rawRequest = (port, text, wait = 3000) => new Promise((resolve) => {
  const s = net.connect(port, '127.0.0.1', () => s.write(text));
  let out = ''; s.on('data', (d) => { out += d; if (/\r\n\r\n/.test(out)) s.end(); }); s.on('close', () => resolve(out)); s.on('error', () => resolve(out));
  setTimeout(() => s.destroy(), wait);
});
const hasHeaders = (text) => { for (const k of Object.keys(SECURITY_HEADERS)) assert.ok(text.toLowerCase().includes(k.toLowerCase() + ':'), `missing ${k} in ${text.slice(0, 80)}`); };
const SCRIPT = new URL('../scripts/official-setup.mjs', import.meta.url).pathname;
const EXAMPLE = new URL('../deploy/official.example.json', import.meta.url).pathname;
const runSetup = (dir, args, env = {}) => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', SCRIPT, EXAMPLE, ...args], { env: { ...process.env, LP_MODE: 'official', LP_DATA_DIR: dir, ...env }, encoding: 'utf8' });

let t;
test.before(async () => { t = await boot(); });
test.after(() => t.stop());

test('R5-S1 the log has an index on (exam_id, seq), also on a database that already existed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-idx-'));
  try {
    for (let i = 0; i < 2; i++) {
      const db = openDb(dir);
      const idx = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'log_exam'").get();
      assert.match(idx.sql, /log\(exam_id, seq\)/);
      db.close();
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('R5-S2 a seat can be reprinted forever but only its first 3 fetches add log rows; the counter keeps counting', async () => {
  const { c, examId } = await practiceUser(t);
  const shares = await sealAndVerify(c, examId);
  await releaseOpen(c, examId, shares, 5);
  let last;
  for (let i = 0; i < 7; i++) last = (await c.get(`/api/exams/${examId}/copies/2`)).data;
  const rows = t.db.prepare("SELECT detail FROM log WHERE exam_id = ? AND action IN ('copy.printed','copy.reprinted') AND detail LIKE '%\"seat\":2%'").all(examId);
  assert.equal(rows.length, 3);
  assert.equal(t.db.prepare('SELECT fetches FROM copies WHERE exam_id = ? AND seat = 2').get(examId).fetches, 7);
  assert.equal(last.reprint, true);
  assert.equal(last.head, t.app.log.head(), 'the printed head is still the real log head');
  assert.equal((await c.get(`/api/exams/${examId}`)).data.printed.find((p) => p.seat === 2).fetches, 7);
});

test('R5-S3 /healthz is deep: it answers 503 with a reason when the database stops answering', async () => {
  const b = await boot();
  try {
    const ok = await b.client().get('/healthz');
    assert.deepEqual([ok.status, ok.data.ok, ok.data.instance, ok.data.mode], [200, true, 'practice', 'practice']);
    b.db.close();
    const bad = await b.client().get('/healthz');
    assert.equal(bad.status, 503); assert.equal(bad.data.ok, false); assert.match(bad.data.reason, /database/);
  } finally { b.server.closeAllConnections(); await new Promise((r) => b.server.close(r)); fs.rmSync(b.dataDir, { recursive: true, force: true }); }
});

test('R5-S3 quick_check runs at most once a minute and a failing check turns /healthz to 503', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-hc-'));
  const db = openDb(dir);
  let calls = 0, result = 'ok', clock = 1_000_000;
  const proxy = new Proxy(db, { get: (o, k) => k === 'prepare' ? (sql) => (sql === 'PRAGMA quick_check' ? { get: () => { calls++; return { quick_check: result }; } } : o.prepare(sql)) : typeof o[k] === 'function' ? o[k].bind(o) : o[k] });
  try {
    const keys = { serverKey: Buffer.alloc(32, 1), logKey: Buffer.alloc(32, 2) };
    const app = createApp({ db: proxy, config: loadConfig({ LP_DATA_DIR: dir }), now: () => clock, ...keys });
    assert.equal(app.health().ok, true); assert.equal(app.health().ok, true);
    assert.equal(calls, 1, 'cached');
    result = '*** in database main *** Page 4: btree';
    assert.equal(app.health().ok, true, 'still the cached good answer inside 60 s');
    clock += 61_000;
    const h = app.health();
    assert.equal(h.ok, false); assert.match(h.reason, /integrity/); assert.equal(calls, 2);
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('R5-S3 a broken log chain at start-up keeps the process up but serves only /healthz, as 503', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-deg-'));
  try {
    const config = loadConfig({ LP_DATA_DIR: dir, LP_PORT: '0', LP_DEV_HTTP: '1' });
    const s = await start(config);
    await s.app.createAccount('someone', 'Someone');
    s.app.exams.createExam({ title: 'x', topics: ['A'], winStart: 0, winEnd: 1, seatLimit: 1, practice: false });
    await new Promise((r) => s.server.close(r)); s.db.close();
    const raw = openDb(dir);
    raw.exec('DROP TRIGGER log_no_update'); raw.exec("UPDATE log SET detail = '{\"topics\":9}' WHERE seq = 1"); raw.close();
    const logs = []; const orig = console.error; console.error = (m) => logs.push(m);
    let s2; try { s2 = await start(config); } finally { console.error = orig; }
    assert.match(logs.join(' '), /log chain is broken at entry 1/);
    try {
      const base = `http://127.0.0.1:${s2.server.address().port}`;
      const h = await fetch(base + '/healthz'); const hb = await h.json();
      assert.equal(h.status, 503); assert.equal(hb.ok, false); assert.match(hb.reason, /log chain/);
      for (const p of ['/', '/api/me', '/app.js']) assert.equal((await fetch(base + p)).status, 503, p);
    } finally { s2.server.closeAllConnections(); await new Promise((r) => s2.server.close(r)); s2.db.close(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('R5-S4 the database waits up to 1 s for a lock instead of failing at once (a long wait would freeze the single-threaded server)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-bt-'));
  const db = openDb(dir);
  assert.equal(db.prepare('PRAGMA busy_timeout').get().timeout, 1000);
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('R5-S5 Node-level replies carry the security headers: Expect, missing Host, header timeout', async () => {
  const port = t.server.address().port;
  const exp = await rawRequest(port, 'GET /healthz HTTP/1.1\r\nHost: x\r\nExpect: foo\r\nConnection: close\r\n\r\n');
  assert.match(exp, /^HTTP\/1\.1 200/, 'Expect: foo is handled as a normal request'); hasHeaders(exp);
  const cont = await rawRequest(port, 'GET /healthz HTTP/1.1\r\nHost: x\r\nExpect: 100-continue\r\nConnection: close\r\n\r\n');
  assert.match(cont, /200 OK/); hasHeaders(cont);
  const noHost = await rawRequest(port, 'GET /healthz HTTP/1.1\r\nConnection: close\r\n\r\n');
  assert.match(noHost, /^HTTP\/1\.1 400/); hasHeaders(noHost);
  const slow = await rawRequest(port, 'GET /healthz HTTP/1.1\r\nHost: x\r\nX-Slow: ', 6000);
  assert.match(slow, /^HTTP\/1\.1 408/); hasHeaders(slow);
});

test('R5-S6 a Kelvin sign cannot alias another account: usernames are checked as ASCII before lower-casing', async () => {
  const b = await boot();
  try {
    const kim = await b.client().post('/api/register', { invite: 'USS-PRACTICE', username: 'kim99', display: 'Kim' });
    assert.equal(kim.status, 201);
    const kelvin = 'Kim99';
    assert.equal(kelvin.toLowerCase(), 'kim99', 'the premise: it lower-cases to the same name');
    const r = await b.client().post('/api/register', { invite: 'USS-PRACTICE', username: 'Kate1', display: 'Kate' });
    assert.equal(r.status, 400);
    const l = await b.client().post('/api/login', { username: kelvin, password: kim.data.passphrase });
    assert.equal(l.status, 401, 'login with the look-alike name fails even with the right passphrase');
    const rec = await b.client().post('/api/recover', { username: kelvin, recovery: kim.data.recovery });
    assert.equal(rec.status, 401);
    assert.equal((await b.client().post('/api/login', { username: ' KIM99 ', password: kim.data.passphrase })).status, 200, 'plain upper case still works');
  } finally { await b.stop(); }
});

test('R5-S6 control and format characters (NUL, line break, zero-width, bidi) are refused in display names, questions and options', async () => {
  const b = await boot();
  try {
    for (const bad of ['Ev\u0000e', 'Ev\ne', 'Ev​e', 'Ev‮e', 'Ev﻿e']) {
      const r = await b.client().post('/api/register', { invite: 'USS-PRACTICE', username: 'hid' + Math.random().toString(36).slice(2, 8), display: bad });
      assert.equal(r.status, 400, JSON.stringify(bad));
    }
    assert.equal((await b.client().post('/api/register', { invite: 'USS-PRACTICE', username: 'plain1', display: 'Zoë Müller 李' })).status, 201, 'ordinary Unicode stays allowed');
    const { examId } = await practiceUser(b);
    const ta = b.client();
    const taReg = await ta.post('/api/register', { invite: 'LP-TA-G19', role: 'ta', username: 'ta-s6-' + (Date.now() % 9999), display: 'TA Control' });
    assert.equal(taReg.status, 201);
    const q = (over) => ta.post(`/api/exams/${examId}/questions`, { topic: 0, text: 'A perfectly fine question?', options: ['a', 'b', 'c', 'd'], correct: 0, ...over });
    assert.equal((await q({ text: 'What is​ this?' })).status, 400);
    assert.equal((await q({ text: 'What is‮ this?' })).status, 400);
    assert.equal((await q({ options: ['a', 'b', 'c', 'd\u0000'] })).status, 400);
    assert.equal((await q({ options: ['a', 'b​', 'c', 'd'] })).status, 400);
    assert.equal((await q({ options: ['a', 'a​', 'c', 'd'] })).status, 400, 'a zero-width twin is not a distinct option');
    assert.equal((await q({})).status, 201);
  } finally { await b.stop(); }
});

async function officialHolders(tt) {
  const id = tt.app.exams.createExam({ title: 'Official', topics: ['A', 'B'], winStart: Date.now() - 1000, winEnd: Date.now() + 3600_000, seatLimit: 10, practice: false });
  const who = {};
  const mk = async (name, caps) => {
    const acc = await tt.app.createAccount(name, name);
    for (const [cap, slot] of caps) tt.app.exams.assign(acc.id, id, cap, slot ?? null);
    const c = tt.client();
    assert.equal((await c.post('/api/login', { username: name, password: acc.passphrase })).status, 200);
    who[name] = { acc, c };
  };
  for (const n of ['setter1', 'setter2', 'setter3']) await mk(n, [['submit']]);
  await mk('cell', [['run'], ['print']]);
  await mk('holder1', [['hold', 1]]);
  for (const [n, k] of [['setter1', 0], ['setter2', 1]]) for (const topic of [0, 1])
    tt.app.exams.submit(id, who[n].acc.id, { topic, text: `Official question ${k}-${topic}?`, options: ['one', 'two', 'three', 'four'], correct: 1 });
  assert.equal((await who.cell.c.post(`/api/exams/${id}/seal`)).status, 200);
  const shares = {};
  shares[1] = (await who.holder1.c.get(`/api/exams/${id}/cards/1`)).data.share;
  assert.equal((await who.holder1.c.post(`/api/exams/${id}/cards/1/verify`, { share: shares[1] })).status, 200);
  return { id, who, shares };
}

test('R5-S7 five wrong word attempts lock out that holder for the duration of that request', async () => {
  const b = await boot({ LP_MODE: 'official' });
  try {
    const { id, who, shares } = await officialHolders(b);
    const rid = (await who.cell.c.post(`/api/exams/${id}/release`, { seats: 3 })).data.id;
    const words = (await who.cell.c.get(`/api/releases/${rid}`)).data.words.join(' ');
    const attack = async () => who.holder1.c.post(`/api/releases/${rid}/decide`, { slot: 1, decision: 'approve', share: shares[1], words: 'amber anchor' });
    let r; for (let i = 0; i < 5; i++) r = await attack();
    assert.match(r.data.error, /locked out/);
    const again = await who.holder1.c.post(`/api/releases/${rid}/decide`, { slot: 1, decision: 'approve', share: shares[1], words });
    assert.equal(again.status, 409); assert.match(again.data.error, /locked out/, 'right words do not help the locked-out holder');
    assert.equal((await who.cell.c.get(`/api/releases/${rid}`)).data.state, 'pending', 'the request is not auto-refused');
    const row = b.db.prepare("SELECT actor FROM log WHERE exam_id = ? AND action = 'release.holder_locked'").all(id);
    assert.deepEqual(row.map((x) => x.actor), [who.holder1.acc.id], 'the lock-out is logged against the holder');
    assert.equal(b.db.prepare("SELECT COUNT(*) n FROM log WHERE exam_id = ? AND action = 'release.words_failed' AND actor = ?").get(id, who.holder1.acc.id).n, 5);
  } finally { await b.stop(); }
});

test('R5-S7b starting over replaces the waiting request, gives new words, and the old lockout does not carry over', async () => {
  const b = await boot({ LP_MODE: 'official' });
  try {
    const { id, who, shares } = await officialHolders(b);
    const rid1 = (await who.cell.c.post(`/api/exams/${id}/release`, { seats: 3 })).data.id;
    const w1 = (await who.cell.c.get(`/api/releases/${rid1}`)).data.words.join(' ');
    for (let i = 0; i < 5; i++) await who.holder1.c.post(`/api/releases/${rid1}/decide`, { slot: 1, decision: 'approve', share: shares[1], words: 'amber anchor' });
    const rid2 = (await who.cell.c.post(`/api/exams/${id}/release`, { seats: 3 })).data.id;
    assert.notEqual(rid2, rid1);
    assert.equal((await who.cell.c.get(`/api/releases/${rid1}`)).data.state, 'replaced', 'the old request is closed');
    const w2 = (await who.cell.c.get(`/api/releases/${rid2}`)).data.words.join(' ');
    const ok = await who.holder1.c.post(`/api/releases/${rid2}/decide`, { slot: 1, decision: 'approve', share: shares[1], words: w2 });
    assert.equal(ok.status, 200, 'the locked-out holder can approve the new request');
    const old = await who.holder1.c.post(`/api/releases/${rid1}/decide`, { slot: 1, decision: 'approve', share: shares[1], words: w1 });
    assert.equal(old.status, 409, 'nobody can approve the replaced request');
  } finally { await b.stop(); }
});

test('R5-N2 joiners used by Devanagari, Persian and emoji are accepted; other invisible characters are still refused', async () => {
  const { examId } = await practiceUser(t);
  const tac = t.client();
  const taReg = await tac.post('/api/register', { invite: 'LP-TA-G19', role: 'ta', username: 'ta-n2-' + (Date.now() % 9999), display: 'TA N2' });
  assert.equal(taReg.status, 201);
  const q = (text, options) => tac.post(`/api/exams/${examId}/questions`, { topic: 0, text, options, correct: 0 });
  const hindi = 'क्\u200Dष और ज्ञ किस लिपि के संयुक्ताक्षर हैं?';
  const r = await q(hindi, ['देवनागरी', 'फ़ारसी', 'रोमन', 'ग्रीक']);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const back = (await tac.get(`/api/exams/${examId}/questions`)).data.questions[0];
  assert.equal(back.text, hindi, 'stored and returned unchanged');
  assert.equal((await tac.post(`/api/exams/${examId}/questions`, { topic: 1, text: 'می\u200Cخواهم یک پرسش بنویسم؟', options: ['یک', 'دو', 'سه', 'چهار'], correct: 0 })).status, 201, 'Persian ZWNJ');
  assert.equal((await tac.post(`/api/exams/${examId}/questions`, { topic: 2, text: 'Which emoji is a family 👨\u200D👩\u200D👧?', options: ['A', 'B', 'C', 'D'], correct: 0 })).status, 201, 'emoji ZWJ');
  for (const [i, bad] of ['a\u200Bb', 'a\u202Eb', 'a\u0000b', 'a\nb', 'a\uFEFFb'].entries()) {
    const x = await tac.post(`/api/exams/${examId}/questions`, { topic: 3 + i, text: `Question with hidden ${bad} text?`, options: ['A', 'B', 'C', 'D'], correct: 0 });
    assert.equal(x.status, 400, `hidden character ${i} must be refused`);
  }
  const same = await tac.post(`/api/exams/${examId}/questions`, { topic: 8, text: 'Do joiners make two options differ?', options: ['same', 'same\u200D', 'other', 'more'], correct: 0 });
  assert.equal(same.status, 400, 'an option that differs only by a joiner is the same option');
});

test('R5-N3 LP_MODE is case-insensitive and an unknown value refuses to start instead of silently running practice', async () => {
  const { loadConfig } = await import('../src/config.mjs');
  assert.equal(loadConfig({ LP_MODE: 'OFFICIAL' }).mode, 'official');
  assert.equal(loadConfig({ LP_MODE: ' Practice ' }).mode, 'practice');
  assert.equal(loadConfig({ LP_INSTANCE: 'official' }).mode, 'official', 'the old way still works');
  assert.throws(() => loadConfig({ LP_MODE: 'prod' }), /LP_MODE must be practice or official/);
});

test('R5-N4 official-setup refuses a username that could never log in (upper case), before creating anything', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-n4-'));
  try {
    const bad = path.join(dir, 'bad.json');
    const cfg = JSON.parse(fs.readFileSync(EXAMPLE, 'utf8')); cfg.people[0].username = 'ExamCell';
    fs.writeFileSync(bad, JSON.stringify(cfg));
    const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', SCRIPT, bad], { env: { ...process.env, LP_MODE: 'official', LP_DATA_DIR: path.join(dir, 'data') }, encoding: 'utf8' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /ExamCell.*lowercase/);
    assert.ok(!fs.existsSync(path.join(dir, 'data', 'leakproof.db')) || openDb(path.join(dir, 'data')).prepare('SELECT COUNT(*) n FROM accounts').get().n === 0, 'no account was created');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('R5-S8 trace says so when several seats match, and that options narrow it down', async () => {
  const { c, examId } = await practiceUser(t);
  const shares = await sealAndVerify(c, examId);
  await releaseOpen(c, examId, shares, 3);
  const st = t.app.exams._opened.get(examId);
  st.paper = st.paper.slice(0, 3).map((q, i) => ({ ...q, text: `Traceable question number ${i}?`, options: [`alpha ${i}`, `bravo ${i}`, `charlie ${i}`, `delta ${i}`] }));
  const order = [0, 1, 2];
  st.layouts = [order.map((q) => ({ q, opts: [0, 1, 2, 3] })), order.map((q) => ({ q, opts: [1, 0, 2, 3] })), order.map((q) => ({ q, opts: [3, 2, 1, 0] }))];
  const lines = (opts) => order.map((q) => [st.paper[q].text, ...(opts ? opts[q].map((o) => st.paper[q].options[o]) : [])].join('\n')).join('\n');
  const bare = (await c.post(`/api/exams/${examId}/trace`, { text: lines(null) })).data;
  assert.equal(bare.matches.length, 3);
  assert.match(bare.note, /3 seats match; paste the options as well for a single seat/);
  assert.match(bare.note, /not a person/);
  const withOpts = (await c.post(`/api/exams/${examId}/trace`, { text: lines({ 0: [1, 0, 2], 1: [1, 0, 2], 2: [1, 0, 2] }) })).data;
  assert.deepEqual(withOpts.matches.map((m) => m.seat), [2]);
  assert.ok(!/seats match/.test(withOpts.note));
  const some = (await c.post(`/api/exams/${examId}/trace`, { text: lines({ 0: [0], 1: [0], 2: [0] }) })).data;
  assert.ok(some.matches.length > 1); assert.match(some.note, /do not narrow it to one/);
});

test('R5-S9 the seed hash is in the sealed log entry, so the seed is committed before it is revealed', async () => {
  const { c, examId } = await practiceUser(t);
  const shares = await sealAndVerify(c, examId);
  const sealed = JSON.parse(t.db.prepare("SELECT detail FROM log WHERE exam_id = ? AND action = 'exam.sealed'").get(examId).detail);
  assert.match(sealed.seed, /^[0-9a-f]{64}$/);
  assert.equal((await t.client().get(`/api/public/log/${examId}`)).data.draw, null);
  await releaseOpen(c, examId, shares, 3);
  const { draw } = (await t.client().get(`/api/public/log/${examId}`)).data;
  assert.equal(sha256(Buffer.from(draw.seed, 'hex')).toString('hex'), sealed.seed);
  assert.notEqual(sealed.seed, draw.seed, 'the log holds the hash, never the seed');
});

test('R5-S10 at most 200 papers stay open in memory (the oldest locks again) and an idle paper locks after 6 h', async () => {
  const b = await boot();
  try {
    const one = await practiceUser(b), two = await practiceUser(b);
    const openIt = async (u) => { const sh = await sealAndVerify(u.c, u.examId); await releaseOpen(u.c, u.examId, sh, 3); };
    await openIt(one);
    assert.equal((await one.c.get(`/api/exams/${one.examId}/copies/1`)).status, 200);
    const opened = b.app.exams._opened;
    for (let i = 0; i < 199; i++) opened.set('fake' + i, { paper: [], copySecret: Buffer.alloc(32), layouts: [], seats: 1, last: Date.now() });
    assert.equal(opened.size, 200);
    await openIt(two);
    assert.equal(opened.size, 200, 'never above the cap');
    assert.equal(opened.has(one.examId), false, 'the oldest paper was evicted');
    assert.equal((await two.c.get(`/api/exams/${two.examId}/copies/1`)).status, 200, 'the newest is open');
    const locked = await one.c.get(`/api/exams/${one.examId}/copies/1`);
    assert.equal(locked.status, 409); assert.match(locked.data.error, /locked again/);
    assert.equal((await one.c.get(`/api/exams/${one.examId}`)).data.open, false);
    assert.equal(b.db.prepare("SELECT state FROM releases WHERE exam_id = ?").get(one.examId).state, 'interrupted');
    assert.equal(b.db.prepare("SELECT COUNT(*) n FROM log WHERE exam_id = ? AND action = 'release.interrupted'").get(one.examId).n, 1);
    const st = opened.get(two.examId);
    st.last = Date.now() - 5 * 3600_000;
    assert.equal((await two.c.get(`/api/exams/${two.examId}/copies/2`)).status, 200, '5 h idle is still open');
    st.last = Date.now() - 7 * 3600_000;
    assert.equal((await two.c.get(`/api/exams/${two.examId}/copies/3`)).status, 409, '7 h idle locks again');
    assert.equal(opened.has(two.examId), false);
    assert.equal((await two.c.get(`/api/exams/${two.examId}`)).data.open, false);
  } finally { await b.stop(); }
});

test('R5-S11 only / and real files in public/ are served; every other path is 404 (no app shell on /admin, /metrics)', async () => {
  const anon = t.client();
  for (const p of ['/', '/index.html', '/app.js', '/styles.css', '/help.html']) {
    const r = await anon.get(p);
    assert.equal(r.status, 200, p); assert.match(r.headers.get('content-type'), /html|javascript|css/);
  }
  assert.match((await anon.get('/')).data, /<html/i);
  assert.equal((await fetch(t.base + '/', { method: 'HEAD' })).status, 200);
  for (const p of ['/admin', '/metrics', '/admin/login', '/server-status', '/.env', '/nope.html', '/a/b/c', '/%2e%2e/server.mjs', '/index.html/', '/src/app.mjs']) {
    const r = await anon.get(p);
    assert.equal(r.status, 404, p);
    assert.ok(!/<html/i.test(String(r.data)), `${p} must not return the app shell`);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  }
});

test('R5-S12 the sensitive bucket allows 60 attempts a minute per account (see X12 for the 61st)', async () => {
  const { c, examId } = await practiceUser(t);
  const codes = [];
  for (let i = 0; i < 61; i++) codes.push((await c.post(`/api/exams/${examId}/trace`, { text: 'x' })).status);
  assert.equal(codes.filter((s) => s === 429).length, 1);
  assert.notEqual(codes[59], 429);
});

test('R5-S13 LP_MODE decides behaviour and wins over LP_INSTANCE; the instance name stays what config says', async () => {
  const cases = [
    [{ LP_MODE: 'official', LP_INSTANCE: 'practice' }, 'official', 'practice', 9090],
    [{ LP_MODE: 'practice', LP_INSTANCE: 'official' }, 'practice', 'official', 8080],
    [{ LP_MODE: 'official', LP_INSTANCE: 'demo' }, 'official', 'demo', 9090],
    [{ LP_MODE: 'official' }, 'official', 'official', 9090],
    [{ LP_INSTANCE: 'official' }, 'official', 'official', 9090],
    [{ LP_INSTANCE: 'demo' }, 'practice', 'demo', 8080],
    [{}, 'practice', 'practice', 8080],
    [{ LP_MODE: 'official', LP_INSTANCE: '../etc' }, 'official', 'official', 9090],
  ];
  for (const [env, mode, instance, port] of cases) {
    const c = loadConfig(env);
    assert.deepEqual([c.mode, c.instance, c.port], [mode, instance, port], JSON.stringify(env));
  }
  assert.match(loadConfig({ LP_MODE: 'official', LP_INSTANCE: 'demo' }).dataDir, /data[\\/]demo$/);
  const demo = await boot({ LP_MODE: 'official', LP_INSTANCE: 'demo' });
  try {
    const h = (await demo.client().get('/healthz')).data;
    assert.deepEqual([h.instance, h.mode], ['demo', 'official']);
    assert.equal((await demo.client().post('/api/register', { invite: 'USS-PRACTICE', username: 'nobody1', display: 'No' })).status, 404, 'official behaviour: no self-registration');
    assert.equal((await demo.client().post('/api/practice/reset')).status, 404, 'practice-only routes are hidden');
  } finally { await demo.stop(); }
  const odd = await boot({ LP_MODE: 'practice', LP_INSTANCE: 'official' });
  try {
    assert.equal((await odd.client().get('/healthz')).data.instance, 'official');
    const reg = await odd.client().post('/api/register', { invite: 'USS-PRACTICE', username: 'somebody1', display: 'So' });
    assert.equal(reg.status, 201, 'practice behaviour despite the name');
    const c = odd.client(); await c.post('/api/login', { username: 'somebody1', password: reg.data.passphrase });
    const me = (await c.get('/api/me')).data;
    assert.deepEqual([me.instance, me.name], ['practice', 'official']);
  } finally { await odd.stop(); }
});

test('R5-S14 official-setup --out writes a 0600 markdown table and prints no passphrase; default output is unchanged', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-s14-')), out = path.join(dir, 'creds.md');
  try {
    fs.writeFileSync(out, 'old', { mode: 0o644 });
    const r = runSetup(path.join(dir, 'data'), ['--out', out]);
    assert.equal(r.status, 0, r.stderr);
    const people = JSON.parse(fs.readFileSync(EXAMPLE, 'utf8')).people;
    const md = fs.readFileSync(out, 'utf8').trim().split('\n');
    assert.equal(md[0], '| role | username | passphrase | recovery code |');
    assert.equal(md.length, 2 + people.length);
    assert.match(md[2], new RegExp(`^\\| ${people[0].display} \\(${people[0].caps.join(', ')}\\) \\| ${people[0].username} \\| [a-z2-9]{4}(-[a-z2-9]{4}){3} \\| `));
    assert.equal(fs.statSync(out).mode & 0o777, 0o600, 'an existing 0644 file is tightened too');
    const pass = md[2].split('|')[3].trim(), rec = md[2].split('|')[4].trim();
    assert.ok(!r.stdout.includes(pass) && !r.stdout.includes(rec), 'no secret on stdout');
    assert.match(r.stdout, /creds\.md/);
    // the passphrases in the file work, and (official mode) still force a change
    const s = await start(loadConfig({ LP_MODE: 'official', LP_DATA_DIR: path.join(dir, 'data'), LP_PORT: '0', LP_DEV_HTTP: '1' }));
    try {
      const c = loadClient(s);
      assert.equal((await c.post('/api/login', { username: people[0].username, password: pass })).status, 200);
      assert.equal((await c.get('/api/me')).data.mustChange, true);
    } finally { s.server.closeAllConnections(); await new Promise((x) => s.server.close(x)); s.db.close(); }
    const bare = runSetup(path.join(dir, 'd2'), []);
    assert.equal(bare.status, 0, bare.stderr);
    assert.match(bare.stdout, /passphrase: [a-z2-9]{4}(-[a-z2-9]{4}){3}/);
    assert.match(bare.stdout, /first login asks for a new passphrase/);
    assert.equal(runSetup(path.join(dir, 'd3'), ['--out']).status, 2, '--out needs a file');
    assert.equal(runSetup(path.join(dir, 'd4'), [], { LP_MODE: 'practice' }).status, 2, 'practice mode refused');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('R5-S14 official-setup --demo creates accounts without must_change, with and without --out', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-s14d-')), out = path.join(dir, 'demo.md');
  try {
    const r = runSetup(path.join(dir, 'data'), ['--demo', '--out', out]);
    assert.equal(r.status, 0, r.stderr);
    const db = openDb(path.join(dir, 'data'));
    const rows = db.prepare('SELECT must_change FROM accounts WHERE simulated = 0').all();
    assert.ok(rows.length >= 8 && rows.every((x) => x.must_change === 0)); db.close();
    const row = fs.readFileSync(out, 'utf8').trim().split('\n')[2].split('|').map((x) => x.trim());
    const s = await start(loadConfig({ LP_MODE: 'official', LP_DATA_DIR: path.join(dir, 'data'), LP_PORT: '0', LP_DEV_HTTP: '1' }));
    try {
      const c = loadClient(s);
      assert.equal((await c.post('/api/login', { username: row[2], password: row[3] })).status, 200);
      assert.equal((await c.get('/api/me')).data.mustChange, false);
    } finally { s.server.closeAllConnections(); await new Promise((x) => s.server.close(x)); s.db.close(); }
    const bare = runSetup(path.join(dir, 'd2'), ['--demo']);
    assert.match(bare.stdout, /demo account: this passphrase keeps working/);
    const db2 = openDb(path.join(dir, 'd2')); assert.ok(db2.prepare('SELECT must_change FROM accounts WHERE simulated = 0').all().every((x) => x.must_change === 0)); db2.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

import { client as makeClient } from './helpers.mjs';
function loadClient(s) { return makeClient(`http://127.0.0.1:${s.server.address().port}`); }
