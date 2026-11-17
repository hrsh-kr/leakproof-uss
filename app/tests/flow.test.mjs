// The whole pipeline through real HTTP, plus the security requirements that belong to it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { boot, practiceUser, sealAndVerify, releaseOpen, joinAs } from './helpers.mjs';
import { draw } from '../src/exam.mjs';

const CANARY = 'CANARY-7f3a91 which planet is the canary on?';
let t;
test.before(async () => { t = await boot(); });
test.after(() => t.stop());

test('golden path: register, seal, verify card, professor approves, print, trace', async () => {
  const { c, examId } = await practiceUser(t);
  let x = (await c.get(`/api/exams/${examId}`)).data;
  assert.equal(x.stage, 'COLLECTING');
  assert.deepEqual(x.caps.sort(), ['hold', 'print', 'run']);
  assert.ok(x.counts.every((k) => k.ready && k.setters === 1));

  const shares = await sealAndVerify(c, examId);
  x = (await c.get(`/api/exams/${examId}`)).data;
  assert.deepEqual([x.stage, x.cardsVerified], ['SEALED', 1]);

  const { last } = await releaseOpen(c, examId, shares, 20);
  assert.equal(last.data.state, 'open');
  x = (await c.get(`/api/exams/${examId}`)).data;
  assert.deepEqual([x.stage, x.open], ['RELEASED', true]);

  const copy = (await c.get(`/api/exams/${examId}/copies/7`)).data;
  assert.equal(copy.questions.length, 10);
  assert.match(copy.copyId, /^[A-Z2-9]{8}-7$/);
  assert.match(copy.note, /Same questions, same marks/);

  // A leaked fragment: three consecutive questions with their options, header cropped off.
  const frag = copy.questions.slice(3, 6).map((qq) => `${qq.n}. ${qq.text}\n${qq.options.map((o, i) => `${'ABCD'[i]}. ${o}`).join('\n')}`).join('\n');
  const tr = (await c.post(`/api/exams/${examId}/trace`, { text: frag })).data;
  assert.deepEqual(tr.matches.map((m) => m.seat), [7]);
  assert.match(tr.note, /seat, not a person/);
  const traceEntry = (await t.client().get(`/api/public/log/${examId}`)).data.entries.find((e) => e.action === 'trace.run');
  assert.deepEqual(traceEntry.detail, { fragment: 3, matches: 1 }, 'the public log never names the matched seat');
});

test('SR3 TAs read only their own questions; the professor sees counts only', async () => {
  const prof = await practiceUser(t);
  // Register two TAs on prof's exam.
  const ta1 = t.client(), ta2 = t.client();
  const r1 = await joinAs(ta1, 'ta', prof.c, prof.examId, `ta1-${Date.now() % 9999}`, 'TA One');
  const r2 = await joinAs(ta2, 'ta', prof.c, prof.examId, `ta2-${Date.now() % 9999}`, 'TA Two');
  assert.equal(r1.status, 201); assert.equal(r2.status, 201);
  assert.equal(r1.data.examId, prof.examId, 'TA joins prof exam');
  await ta1.post(`/api/exams/${r1.data.examId}/questions`, { topic: 1, text: 'TA A private question?', options: ['1', '2', '3', '4'], correct: 0 });
  // TA 2 cannot see TA 1's questions
  assert.equal((await ta2.get(`/api/exams/${r1.data.examId}/questions`)).data.questions.length, 0);
  // Professor sees counts only, not question text
  const summary = JSON.stringify((await prof.c.get(`/api/exams/${prof.examId}`)).data);
  assert.ok(!summary.includes('TA A private question'));
  // A user with no role in this exam cannot see it
  const outsider = await practiceUser(t);
  assert.equal((await outsider.c.get(`/api/exams/${prof.examId}`)).status, 404);
});

test('SR4 release is locked until the professor key card is verified; the server keeps no share after verify', async () => {
  const { c, examId } = await practiceUser(t);
  const shares = await sealAndVerify(c, examId, 0); // seal without verifying
  let r = await c.post(`/api/exams/${examId}/release`, { seats: 10 });
  assert.equal(r.status, 409); assert.match(r.data.error, /professor key card must be verified/);
  await c.post(`/api/exams/${examId}/cards/1/verify`, { share: shares[1] });
  const wrapped = t.db.prepare('SELECT COUNT(*) n FROM cards WHERE exam_id = ? AND share_wrapped IS NOT NULL').get(examId).n;
  assert.equal(wrapped, 0, 'no unverified cards remain after verify');
  assert.equal((await c.get(`/api/exams/${examId}/cards/1`)).status, 409, 'a verified card cannot be fetched again');

  r = await c.post(`/api/exams/${examId}/release`, { seats: 10 });
  const rid = r.data.id, words = (await c.get(`/api/releases/${rid}`)).data.words.join(' ');
  // The same card cannot approve twice.
  const approve1 = await c.post(`/api/releases/${rid}/decide`, { slot: 1, decision: 'approve', share: shares[1], words });
  assert.equal(approve1.data.state, 'open', 'threshold=1: single approval opens the paper');
  assert.equal((await c.post(`/api/releases/${rid}/decide`, { slot: 1, decision: 'approve', share: shares[1], words })).status, 409, 'cannot approve twice');
});

test('SR5 gates: wrong words, too many seats, outside the window, expired request and refusal all fail closed', async () => {
  const { c, examId } = await practiceUser(t);
  const shares = await sealAndVerify(c, examId);
  assert.match((await c.post(`/api/exams/${examId}/release`, { seats: 61 })).data.error, /G3/);
  const rid = (await c.post(`/api/exams/${examId}/release`, { seats: 5 })).data.id;
  const bad = await c.post(`/api/releases/${rid}/decide`, { slot: 1, decision: 'approve', share: shares[1], words: 'wrong words' });
  assert.equal(bad.status, 409); assert.match(bad.data.error, /two words/);
  // Refusal (which needs the two words too) stops the request: nothing opens even if others approve later.
  const w1 = (await c.get(`/api/releases/${rid}`)).data.words.join(' ');
  assert.equal((await c.post(`/api/releases/${rid}/decide`, { slot: 1, decision: 'refuse', words: w1 })).data.state, 'refused');
  const words = (await c.get(`/api/releases/${rid}`)).data.words;
  assert.equal(words, undefined, 'words disappear once the request is closed');
  assert.equal((await c.post(`/api/releases/${rid}/decide`, { slot: 1, decision: 'approve', share: shares[1], words: 'x y' })).status, 409);
  // Window: move the window into the past.
  t.db.prepare('UPDATE exams SET win_end = ? WHERE id = ?').run(Date.now() - 1000, examId);
  assert.match((await c.post(`/api/exams/${examId}/release`, { seats: 5 })).data.error, /G2/);
  // Expiry: a request older than 15 minutes is refused.
  t.db.prepare('UPDATE exams SET win_end = ? WHERE id = ?').run(Date.now() + 3600_000, examId);
  const rid2 = (await c.post(`/api/exams/${examId}/release`, { seats: 5 })).data.id;
  const w2 = (await c.get(`/api/releases/${rid2}`)).data.words.join(' ');
  t.db.prepare('UPDATE releases SET expires = ? WHERE id = ?').run(Date.now() - 1, rid2);
  assert.match((await c.post(`/api/releases/${rid2}/decide`, { slot: 1, decision: 'approve', share: shares[1], words: w2 })).data.error, /expired/);
});

test('SR6 the log head printed on a copy is in the chain; the public log shows no names or text', async () => {
  const { c, examId } = await practiceUser(t);
  const shares = await sealAndVerify(c, examId);
  await releaseOpen(c, examId, shares, 5);
  const copy = (await c.get(`/api/exams/${examId}/copies/2`)).data;
  const anon = t.client();
  assert.equal((await anon.post('/api/public/check-head', { head: copy.head })).data.found, true);
  assert.equal((await anon.post('/api/public/check-head', { head: 'a'.repeat(64) })).data.found, false);
  const pub = (await anon.get(`/api/public/log/${examId}`)).data;
  assert.equal(pub.chain.ok, true);
  const text = JSON.stringify(pub);
  assert.ok(!/actor|Tester|sim-/.test(text), 'public log must not list who did what');
});

test('SR7 after sealing, no question ciphertext remains in the table or in the data files, and the canary text is nowhere on disk', async () => {
  const { c, examId } = await practiceUser(t);
  await c.post(`/api/exams/${examId}/questions`, { topic: 2, text: CANARY, options: ['a1', 'b1', 'c1', 'd1'], correct: 0 });
  const cts = t.db.prepare('SELECT ct FROM questions WHERE exam_id = ?').all(examId).map((r) => Buffer.from(r.ct).subarray(0, 40));
  const shares = await sealAndVerify(c, examId);
  await releaseOpen(c, examId, shares, 30);
  for (let s = 1; s <= 30; s++) await c.get(`/api/exams/${examId}/copies/${s}`);
  assert.equal(t.db.prepare('SELECT COUNT(*) n FROM questions WHERE exam_id = ? AND ct IS NOT NULL').get(examId).n, 0);
  for (const f of fs.readdirSync(t.dataDir)) {
    const bytes = fs.readFileSync(path.join(t.dataDir, f));
    assert.ok(!bytes.includes('CANARY-7f3a91'), `canary found in ${f}`);
    assert.equal(cts.filter((ct) => bytes.includes(ct)).length, 0, `stored question ciphertext found in ${f}`);
  }
});

test('SR8 the revealed seed replays the draw (public log, no login)', async () => {
  const { c, examId } = await practiceUser(t);
  assert.equal((await t.client().get(`/api/public/log/${examId}`)).data.draw, null, 'no seed before release');
  const shares = await sealAndVerify(c, examId);
  await releaseOpen(c, examId, shares, 3);
  const r = (await t.client().get(`/api/public/log/${examId}`)).data.draw;
  assert.deepEqual(draw(Buffer.from(r.seed, 'hex'), r.pool, 10), r.drawn);
});

test('SR9 copies: seats differ, neighbours never share the first three questions, reprints are counted, wrong order traces to nobody', async () => {
  const { c, examId } = await practiceUser(t);
  const shares = await sealAndVerify(c, examId);
  await releaseOpen(c, examId, shares, 60);
  const copies = [];
  for (let s = 1; s <= 60; s++) copies.push((await c.get(`/api/exams/${examId}/copies/${s}`)).data);
  const key = (cp) => cp.questions.map((q) => q.text + q.options.join('|')).join('#');
  assert.equal(new Set(copies.map(key)).size, 60, 'every seat has its own copy');
  assert.equal(new Set(copies.map((cp) => cp.setHash)).size, 1, 'same question set for all');
  for (let s = 1; s < 60; s++) assert.notDeepEqual(copies[s].questions.slice(0, 3).map((q) => q.text), copies[s - 1].questions.slice(0, 3).map((q) => q.text));
  assert.equal((await c.get(`/api/exams/${examId}/copies/61`)).status, 409, 'seat above the released count');
  const again = (await c.get(`/api/exams/${examId}/copies/5`)).data;
  assert.equal(again.reprint, true);
  assert.deepEqual(again.questions, copies[4].questions, 'a reprint is identical');
  const x = (await c.get(`/api/exams/${examId}`)).data;
  assert.equal(x.printed.find((p) => p.seat === 5).fetches, 2);
  // Wrong order: the same three questions in an order no seat received.
  const qs = copies[9].questions.slice(0, 3);
  const swapped = [qs[1], qs[0], qs[2]].map((q) => `${q.text}\n${[...q.options].reverse().join('\n')}`).join('\n');
  assert.deepEqual((await c.post(`/api/exams/${examId}/trace`, { text: swapped })).data.matches, []);
  assert.match((await c.post(`/api/exams/${examId}/trace`, { text: qs[0].text })).data.error, /at least 3/);
});

test('restart: the paper locks again and professor re-approves', async () => {
  const { c, examId } = await practiceUser(t);
  const shares = await sealAndVerify(c, examId);
  await releaseOpen(c, examId, shares, 4);
  t.app.exams._opened.delete(examId); // what a process restart does
  assert.match((await c.get(`/api/exams/${examId}/copies/1`)).data.error, /locked again/);
  const { last } = await releaseOpen(c, examId, shares, 4, [1]);
  assert.equal(last.data.state, 'open');
});

test('seal preconditions: a topic with no TA question blocks sealing', async () => {
  const { c, examId } = await practiceUser(t);
  t.db.prepare('DELETE FROM questions WHERE exam_id = ? AND topic = 3').run(examId);
  const r = await c.post(`/api/exams/${examId}/seal`);
  assert.equal(r.status, 409); assert.match(r.data.error, /TA with a question/);
  assert.equal((await c.get(`/api/exams/${examId}`)).data.stage, 'COLLECTING');
});
