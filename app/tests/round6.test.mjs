// Round 6 (16 Nov): each test proves one fix from docs/SECURITY-CHANGELOG.md (C-numbers). Every test here FAILED on v1.0.3.
import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, practiceUser, sealAndVerify, releaseOpen, joinAs, PW } from './helpers.mjs';
import { start } from '../server.mjs';

let t;
test.before(async () => { t = await boot(); });
test.after(() => t.stop());
let k = 0;
const uname = (p) => `${p}${++k}${Date.now() % 10000}`;
const reg = (c, body) => c.post('/api/register', { password: PW, display: 'Someone', ...body });

test('R6-C1 a TA or student cannot join any exam without that exam\'s class code; a stranger is never placed in another exam', async () => {
  const victim = await practiceUser(t);
  const codes = (await victim.c.get(`/api/exams/${victim.examId}`)).data.classCodes;
  assert.match(codes.ta, /^TA-[A-Z2-9]{5}-[A-Z2-9]{5}$/); assert.match(codes.student, /^ST-[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  // v1.0.3: course code alone was enough and put the stranger in the newest exam.
  assert.equal((await reg(t.client(), { invite: 'LP-STU-G19', role: 'student', username: uname('s') })).status, 403);
  assert.equal((await reg(t.client(), { invite: 'LP-TA-G19', role: 'ta', username: uname('t') })).status, 403);
  assert.equal((await reg(t.client(), { invite: 'LP-STU-G19', role: 'student', classCode: 'ST-AAAAA-BBBBB', username: uname('s') })).status, 403, 'a made-up code');
  assert.equal((await reg(t.client(), { invite: 'LP-TA-G19', role: 'ta', classCode: codes.student, username: uname('t') })).status, 403, 'the student code does not make a TA');
  assert.equal((await reg(t.client(), { invite: 'LP-STU-G19', role: 'student', classCode: codes.ta, username: uname('s') })).status, 403, 'the TA code does not make a student');
  // The right code works, written loosely (lower case, spaces), and lands in exactly that exam.
  const ok = await reg(t.client(), { invite: 'LP-STU-G19', role: 'student', classCode: ` ${codes.student.toLowerCase().replace(/-/g, ' ')} `, username: uname('s') });
  assert.equal(ok.status, 201); assert.equal(ok.data.examId, victim.examId);
  // An attacker professor registering later does not capture anybody (v1.0.3: the newest exam got every later TA).
  const atk = await practiceUser(t);
  const ta = t.client(); const r = await joinAs(ta, 'ta', victim.c, victim.examId, uname('ta'));
  assert.equal(r.data.examId, victim.examId); assert.notEqual(r.data.examId, atk.examId);
});

test('R6-C1 joining closes on time: no TA after sealing, no student after release; the codes are visible to the professor only', async () => {
  const p = await practiceUser(t);
  const ta = t.client(); await joinAs(ta, 'ta', p.c, p.examId, uname('ta'));
  const st = t.client(); await joinAs(st, 'student', p.c, p.examId, uname('st'));
  for (const c of [ta, st]) assert.equal((await c.get(`/api/exams/${p.examId}`)).data.classCodes, undefined, 'TA and student never see the codes');
  const shares = await sealAndVerify(p.c, p.examId);
  assert.equal((await joinAs(t.client(), 'ta', p.c, p.examId, uname('ta'))).status, 409, 'no TA after sealing');
  assert.equal((await joinAs(t.client(), 'student', p.c, p.examId, uname('st'))).status, 201, 'students may still join while sealed');
  await releaseOpen(p.c, p.examId, shares, 5);
  assert.equal((await joinAs(t.client(), 'student', p.c, p.examId, uname('st'))).status, 409, 'no student after release');
});

test('R6-C1 new class codes end the old ones, only the professor can make them, and the codes never reach the public log', async () => {
  const p = await practiceUser(t);
  const old = (await p.c.get(`/api/exams/${p.examId}`)).data.classCodes;
  const ta = t.client(); await joinAs(ta, 'ta', p.c, p.examId, uname('ta'));
  assert.equal((await ta.post(`/api/exams/${p.examId}/class-codes`)).status, 404, 'a TA cannot rotate');
  const fresh = (await p.c.post(`/api/exams/${p.examId}/class-codes`)).data;
  assert.notEqual(fresh.ta, old.ta); assert.notEqual(fresh.student, old.student);
  assert.equal((await reg(t.client(), { invite: 'LP-TA-G19', role: 'ta', classCode: old.ta, username: uname('t') })).status, 403, 'old code dead');
  assert.equal((await reg(t.client(), { invite: 'LP-TA-G19', role: 'ta', classCode: fresh.ta, username: uname('t') })).status, 201);
  const pub = JSON.stringify((await t.client().get(`/api/public/log/${p.examId}`)).data);
  assert.ok(pub.includes('class.codes_changed'));
  for (const c of [old.ta, old.student, fresh.ta, fresh.student]) assert.ok(!pub.includes(c), 'no code in the public log');
  const raw = t.db.prepare('SELECT join_box FROM exams WHERE id = ?').get(p.examId).join_box;
  assert.ok(!Buffer.from(raw).toString('latin1').includes(fresh.ta.slice(3)), 'codes are stored encrypted');
});

test('R6-C1 exams made before class codes get them at start-up, and the restart leaves the log chain intact', async () => {
  const b = await boot();
  try {
    const p = await practiceUser(b);
    b.db.prepare('UPDATE exams SET join_box = NULL, join_ta_h = NULL, join_st_h = NULL WHERE id = ?').run(p.examId);
    const again = await start({ ...b.config, port: 0 }); // a restart on the same data and keys
    try {
      assert.ok(again.db.prepare('SELECT join_box FROM exams WHERE id = ?').get(p.examId).join_box);
      assert.equal(again.app.log.verify().ok, true);
    } finally { again.server.close(); again.db.close(); }
  } finally { await b.stop(); }
});

test('R6-C2 a student sees only the copy of their own seat, it traces back to that seat, and the plain-order paper is gone', async () => {
  const p = await practiceUser(t);
  const s1 = t.client(), s2 = t.client(), s3 = t.client();
  for (const c of [s1, s2, s3]) await joinAs(c, 'student', p.c, p.examId, uname('st'));
  assert.equal((await s1.get(`/api/exams/${p.examId}/my-copy`)).status, 423, 'nothing before release');
  const shares = await sealAndVerify(p.c, p.examId);
  await releaseOpen(p.c, p.examId, shares, 2);
  assert.equal((await s1.get(`/api/exams/${p.examId}/questions`)).status, 404, 'v1.0.3 route that returned the whole paper in plain order');
  const a = (await s1.get(`/api/exams/${p.examId}/my-copy`)).data, b = (await s2.get(`/api/exams/${p.examId}/my-copy`)).data;
  assert.deepEqual([a.seat, b.seat], [1, 2]); assert.match(a.copyId, /-1$/);
  assert.equal((await s1.get(`/api/exams/${p.examId}/my-copy`)).data.seat, 1, 'the seat never changes');
  assert.equal((await s3.get(`/api/exams/${p.examId}/my-copy`)).status, 409, 'no seat left: refused, never shared');
  assert.ok(!('correct' in a.questions[0]), 'no answers in a student copy');
  assert.equal((await p.c.get(`/api/exams/${p.examId}/copies/1`)).status, 409, 'round 7: seat 1 is held online, so it is never printed for someone else');
  const frag = b.questions.slice(2, 5).map((q) => `${q.text}\n${q.options.join('\n')}`).join('\n');
  assert.deepEqual((await p.c.post(`/api/exams/${p.examId}/trace`, { text: frag })).data.matches.map((m) => m.seat), [2], 'a student leak names the seat');
  const views = (await t.client().get(`/api/public/log/${p.examId}`)).data.entries.filter((e) => e.action === 'copy.viewed');
  assert.equal(views.length, 3); assert.ok(views.every((e) => !('seat' in e.detail)), 'viewing is logged, the seat is not published');
});

test('R6-C4 a TA can delete at most 20 questions per exam, so the public log cannot be flooded', async () => {
  const p = await practiceUser(t);
  const ta = t.client(); await joinAs(ta, 'ta', p.c, p.examId, uname('ta'));
  const q = (i) => ta.post(`/api/exams/${p.examId}/questions`, { topic: 0, text: `Replaceable question ${i}?`, options: ['a', 'b', 'c', 'd'], correct: 0 });
  for (let i = 0; i < 20; i++) { const s = await q(i); assert.equal(s.status, 201); assert.equal((await ta.del(`/api/exams/${p.examId}/questions/${s.data.id}`)).status, 200); }
  const last = await q(20);
  const d = await ta.del(`/api/exams/${p.examId}/questions/${last.data.id}`);
  assert.equal(d.status, 409); assert.match(d.data.error, /20 questions/);
});

test('R6-C5 the public log pages back to the first entry: nothing can be pushed out of view', async () => {
  const p = await practiceUser(t);
  for (let i = 0; i < 4; i++) await p.c.get(`/api/exams/${p.examId}/cards/1`).catch(() => {});
  const ta = t.client(); await joinAs(ta, 'ta', p.c, p.examId, uname('ta'));
  for (let i = 0; i < 12; i++) { const s = await ta.post(`/api/exams/${p.examId}/questions`, { topic: 1, text: `Filler ${i}?`, options: ['a', 'b', 'c', 'd'], correct: 0 }); await ta.del(`/api/exams/${p.examId}/questions/${s.data.id}`); }
  const pub = t.client();
  const first = (await pub.get(`/api/public/log/${p.examId}`)).data;
  const all = [...first.entries];
  let before = first.entries[0].seq;
  for (;;) { const o = (await pub.get(`/api/public/log/${p.examId}?before=${before}`)).data; if (!o.entries.length) break; all.unshift(...o.entries); before = o.entries[0].seq; }
  assert.equal(all.length, first.total); assert.equal(all[0].action, 'exam.created');
  assert.equal((await pub.get(`/api/public/log/${p.examId}?before=abc`)).status, 400);
});

test('R6-C3 sign-up starts no session; the old course code USS-PRACTICE and a sign-up without a role are refused', async () => {
  const c = t.client();
  const r = await reg(c, { invite: 'LP-PROF-G19', role: 'professor', username: uname('p') });
  assert.equal(r.status, 201); assert.equal(r.headers.get('set-cookie'), null);
  assert.equal((await c.get('/api/me')).status, 401, 'Back from the secrets page lands logged out');
  assert.equal((await c.post('/api/login', { username: r.data.username, password: PW })).status, 200);
  assert.equal((await reg(t.client(), { invite: 'USS-PRACTICE', username: uname('l') })).status, 400, 'no role');
  assert.equal((await reg(t.client(), { invite: 'USS-PRACTICE', role: 'professor', username: uname('l') })).status, 403, 'legacy code gone');
});

test('R6-C6 the app is served with no-store, so a page is never restored from the browser cache after logout', async () => {
  for (const p of ['/', '/index.html', '/app.js', '/help.html']) assert.equal((await fetch(t.base + p)).headers.get('cache-control'), 'no-store', p);
});

test('R6-C7 the public log stays intact and anonymous through a full run by professor, TA and student', async () => {
  const p = await practiceUser(t);
  const ta = t.client(), st = t.client();
  const taName = uname('ta'), stName = uname('st');
  await joinAs(ta, 'ta', p.c, p.examId, taName); await joinAs(st, 'student', p.c, p.examId, stName);
  const s = await ta.post(`/api/exams/${p.examId}/questions`, { topic: 3, text: 'Secret question text 42?', options: ['w', 'x', 'y', 'z'], correct: 2 });
  await ta.del(`/api/exams/${p.examId}/questions/${s.data.id}`);
  await ta.post(`/api/exams/${p.examId}/questions`, { topic: 3, text: 'Secret question text 43?', options: ['w', 'x', 'y', 'z'], correct: 2 });
  const shares = await sealAndVerify(p.c, p.examId);
  await releaseOpen(p.c, p.examId, shares, 3);
  await st.get(`/api/exams/${p.examId}/my-copy`); await p.c.get(`/api/exams/${p.examId}/copies/2`); await p.c.get(`/api/exams/${p.examId}/key/1`);
  t.app.log.status(); // public status is cached for 30 s; the full walk below is what an auditor's download would show
  assert.equal(t.app.log.verify().ok, true, 'chain intact after every role acted');
  const pub = (await t.client().get(`/api/public/log/${p.examId}`)).data;
  const text = JSON.stringify(pub.entries);
  for (const secret of [taName, stName, 'Secret question text', shares[1], p.passphrase]) assert.ok(!text.includes(secret), `public log leaks ${String(secret).slice(0, 12)}`);
  assert.ok(pub.entries.every((e) => !('actor' in e)), 'no actor ids in public entries');
  for (const want of ['account.registered', 'question.submitted', 'question.deleted', 'exam.sealed', 'card.verified', 'release.approved', 'paper.opened', 'copy.viewed', 'copy.printed', 'key.viewed'])
    assert.ok(pub.entries.some((e) => e.action === want), `missing ${want}`);
  // A copy footer's hash checks out against the public chain.
  const head = (await st.get(`/api/exams/${p.examId}/my-copy`)).data.head;
  assert.equal((await t.client().post('/api/public/check-head', { head })).data.found, true);
});
