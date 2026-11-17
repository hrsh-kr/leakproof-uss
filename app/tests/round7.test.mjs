// Round 7 (16 Nov): each test proves one fix from docs/SECURITY-CHANGELOG.md part E (D-numbers).
// Tests marked [was a PoC] reproduced the flaw on the round-6 build first (scratchpad poc7.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boot, practiceUser, sealAndVerify, releaseOpen, joinAs, PW, NEWPW } from './helpers.mjs';
import { passwordChecks, passwordProblem } from '../public/password-rules.js';
import { checkPassword, hashPassword, MAX_HASHING } from '../src/crypto.mjs';
import { ipKey } from '../src/http.mjs';

let t;
test.before(async () => { t = await boot({ LP_TRUST_PROXY: '1' }); });
test.after(() => t.stop());
let k = 0;
const uname = (p) => `${p}${++k}${Date.now() % 10000}`;
const ip = (n) => ({ 'x-real-ip': `10.7.${(n >> 8) & 255}.${n & 255}` });

test('R7-D1 people choose their own password; weak, common or personal ones are refused by the server', async () => {
  const name = uname('prof');
  const reg = (password, extra = {}) => t.client().post('/api/register', { invite: 'LP-PROF-G19', role: 'professor', username: name, display: 'Asha Verma', password, ...extra });
  for (const weak of [undefined, '', 'Short1!', 'password1234', 'P@ssw0rd2026!', 'Leakproof-Exam-2026', 'qwerty123456A!', 'aaaaaaaaaaaA1!',
    `${name}-Blue-9!`, 'Verma-River-77!', ' Blue-Mango-Tree-42!', 'Blue​Mango-Tree-42!', 'x'.repeat(129)]) {
    const r = await reg(weak);
    assert.equal(r.status, 400, `refused: ${JSON.stringify(weak)?.slice(0, 30)}`); assert.equal(r.data.field, 'password');
  }
  const ok = await reg(PW);
  assert.equal(ok.status, 201);
  assert.deepEqual(Object.keys(ok.data).sort(), ['examId', 'recovery', 'role', 'username'], 'the server never sends a password back');
  assert.match(ok.data.recovery, /^[a-z2-9]{4}(-[a-z2-9]{4}){2}$/, 'the recovery code is still generated (a long random backup)');
  assert.equal((await t.client().post('/api/login', { username: name, password: PW })).status, 200);
  const row = t.db.prepare('SELECT pw FROM accounts WHERE username = ?').get(name).pw;
  assert.ok(row.startsWith('s1$') && !row.includes(PW), 'stored only as a scrypt hash');
  // Unicode: the same visible text in another normal form logs in (NFC on both sides).
  const n2 = uname('nfc'), composed = 'Café-Jardin-Bleu-58!';
  assert.equal((await t.client().post('/api/register', { invite: 'LP-PROF-G19', role: 'professor', username: n2, display: 'Nadia', password: composed })).status, 201);
  assert.equal((await t.client().post('/api/login', { username: n2, password: composed.normalize('NFD') })).status, 200);
});

test('R7-D1 the browser and the server use the same rules file', async () => {
  const served = await (await fetch(t.base + '/password-rules.js')).text();
  assert.equal(served, fs.readFileSync(new URL('../public/password-rules.js', import.meta.url), 'utf8'));
  assert.equal(passwordProblem('correct horse battery staple'), null, 'a long sentence is fine without symbols');
  assert.equal(passwordProblem('Kx9#mP2vL!q7'), null);
  assert.match(passwordProblem('Summer-Exam-2026'), /common/);
  assert.match(passwordProblem('Password2026!'), /common/, 'digits and symbols around a common word do not help');
  assert.match(passwordProblem('Tree-Blue-44-asha', { display: 'Asha Verma' }), /username or name/);
  assert.equal(passwordChecks('').filter((c) => c.ok).length, 0, 'an empty box shows every rule as open');
});

test('R7-D2 change password: current + a new strong one; the recovery code stays, other sessions end', async () => {
  const p = await practiceUser(t);
  const other = t.client(); await other.post('/api/login', { username: p.username, password: PW });
  assert.equal((await p.c.post('/api/passphrase', { current: PW })).status, 404, 'the old generator route is gone');
  assert.equal((await p.c.post('/api/password', { current: PW, next: PW })).status, 400, 'must differ');
  assert.equal((await p.c.post('/api/password', { current: PW, next: 'letmein-2026' })).status, 400, 'weak');
  assert.equal((await p.c.post('/api/password', { current: 'Wrong-Pass-Word-1', next: NEWPW })).status, 401);
  const ch = await p.c.post('/api/password', { current: PW, next: NEWPW });
  assert.deepEqual([ch.status, ch.data], [200, { ok: true }], 'no secret in the answer; recovery code unchanged');
  assert.equal((await other.get('/api/me')).status, 401, 'other session ended');
  assert.equal((await p.c.get('/api/me')).status, 200, 'this session stays');
  assert.equal((await t.client().post('/api/login', { username: p.username, password: PW })).status, 401, 'old password dead');
  // Whoever changed it (owner or a thief), the owner's recovery code still works: the account can always be taken back.
  assert.equal((await t.client().post('/api/recover', { username: p.username, recovery: p.recovery, next: 'Owner-Back-Again-31' })).status, 200);
});

test('R7-D3 recovery: a weak new password is refused WITHOUT using up the code; success is written to the audit log [was a PoC]', async () => {
  const p = await practiceUser(t);
  const weak = await t.client().post('/api/recover', { username: p.username, recovery: p.recovery, next: 'password2026' });
  assert.equal(weak.status, 400);
  const before = t.db.prepare("SELECT COUNT(*) n FROM log WHERE action = 'account.recovered'").get().n;
  const r = await t.client().post('/api/recover', { username: p.username, recovery: p.recovery, next: NEWPW });
  assert.equal(r.status, 200, 'the code still worked after the refused attempt');
  const row = t.db.prepare("SELECT exam_id, actor FROM log WHERE action = 'account.recovered' ORDER BY seq DESC LIMIT 1").get();
  assert.equal(t.db.prepare("SELECT COUNT(*) n FROM log WHERE action = 'account.recovered'").get().n, before + 1);
  assert.equal(row.exam_id, null, 'not tied to an exam, so never on a public log page');
  assert.equal(t.app.log.verify().ok, true);
});

test('R7-D4 nobody on the same network (campus NAT) can lock the professor out [was a PoC]', async () => {
  const p = await practiceUser(t); // p.c logged in once, so its browser now carries a device token for this account
  assert.ok(p.c.jar.get('lp_dev'), 'login sets the device cookie');
  for (let i = 0; i < 8; i++) await t.client().post('/api/login', { username: p.username, password: 'Wrong-Guess-' + i }, ip(1));
  assert.equal((await t.client().post('/api/login', { username: p.username, password: PW }, ip(1))).status, 429, 'an unknown browser on that network backs off');
  const own = await p.c.post('/api/login', { username: p.username, password: PW }, ip(1));
  assert.equal(own.status, 200, 'the owner\'s browser (same network) logs straight in');
});

test('R7-D4 a botnet gets 20 guesses per account per hour in total, however many addresses it uses; the owner\'s browser is exempt', async () => {
  const p = await practiceUser(t);
  for (let i = 0; i < 20; i++) assert.equal((await t.client().post('/api/login', { username: p.username, password: 'Wrong-Guess-' + i }, ip(100 + i))).status, 401);
  const fresh = await t.client().post('/api/login', { username: p.username, password: PW }, ip(300));
  assert.equal(fresh.status, 429, 'a brand-new address is refused too: the budget is per account');
  assert.match(fresh.data.error, /browser you used before/);
  assert.equal((await p.c.post('/api/login', { username: p.username, password: PW }, ip(301))).status, 200, 'trusted browser still works');
  // Unknown names have the same budget, so 429 does not reveal whether an account exists.
  const ghost = uname('ghost');
  for (let i = 0; i < 20; i++) await t.client().post('/api/login', { username: ghost, password: 'x' + i }, ip(400 + i));
  assert.equal((await t.client().post('/api/login', { username: ghost, password: 'x' }, ip(500))).status, 429);
});

test('R7-D4 the owner always has a way in: recovery on a new computer trusts that browser and clears the guess budget', async () => {
  const p = await practiceUser(t);
  for (let i = 0; i < 20; i++) await t.client().post('/api/login', { username: p.username, password: 'Wrong-Guess-' + i }, ip(800 + i));
  const hall = t.client(); // an exam-hall PC the professor never used
  const blocked = await hall.post('/api/login', { username: p.username, password: PW }, ip(900));
  assert.equal(blocked.status, 429); assert.match(blocked.data.error, /Forgot your password/);
  const r = await hall.post('/api/recover', { username: p.username, recovery: p.recovery, next: NEWPW }, ip(900));
  assert.equal(r.status, 200); assert.ok(hall.jar.get('lp_dev'), 'recovery marks this browser as trusted');
  assert.equal((await hall.post('/api/login', { username: p.username, password: NEWPW }, ip(900))).status, 200, 'the owner is in');
  for (let i = 0; i < 3; i++) await t.client().post('/api/login', { username: p.username, password: 'Again-' + i }, ip(950 + i));
  assert.equal((await t.client().post('/api/login', { username: p.username, password: 'x' }, ip(990))).status, 401, 'the budget was cleared, then counts again from zero');
});

test('R7-D4 a device token is bound to its account and cannot be forged or moved', async () => {
  const a = await practiceUser(t), b = await practiceUser(t);
  for (let i = 0; i < 20; i++) await t.client().post('/api/login', { username: b.username, password: 'Wrong-Guess-' + i }, ip(600 + i));
  const tokenA = a.c.jar.get('lp_dev');
  const moved = await t.client().post('/api/login', { username: b.username, password: PW }, { ...ip(700), cookie: `lp_dev=${tokenA}` });
  assert.equal(moved.status, 429, 'A\'s token does not unlock B');
  const [at, mac] = tokenA.split('.');
  const forged = await t.client().post('/api/login', { username: a.username, password: 'x' }, { ...ip(701), cookie: `lp_dev=${Number(at) + 1}.${mac}` });
  assert.equal(forged.status, 401, 'changing the date breaks the signature (counts as an unknown browser)');
});

test('R7-D5 one account keeps at most 5 sessions and expired ones are deleted [was a PoC]', async () => {
  const p = await practiceUser(t);
  for (let i = 0; i < 12; i++) await t.client().post('/api/login', { username: p.username, password: PW });
  const id = t.db.prepare('SELECT id FROM accounts WHERE username = ?').get(p.username).id;
  assert.equal(t.db.prepare('SELECT COUNT(*) n FROM sessions WHERE account_id = ?').get(id).n, 5);
  t.db.prepare('UPDATE sessions SET seen = ? WHERE account_id = ?').run(Date.now() - 31 * 60_000, id);
  await practiceUser(t); // any login sweeps expired sessions
  assert.equal(t.db.prepare('SELECT COUNT(*) n FROM sessions WHERE account_id = ?').get(id).n, 0);
});

test('R7-D6 IPv6 clients are rate-limited per /64 [was a PoC]', async () => {
  assert.equal(ipKey('2001:db8:1:2:aaaa::1'), '2001:db8:1:2::/64');
  assert.equal(ipKey('2001:db8:1:2:ffff:1:2:3'), '2001:db8:1:2::/64');
  assert.equal(ipKey('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(ipKey('::ffff:10.1.2.3'), '10.1.2.3');
  assert.equal(ipKey('[2001:DB8:0:0:1::5]'), '2001:db8:0:0::/64');
  const b = await boot({ LP_TRUST_PROXY: '1', LP_AUTH_PER_MIN: '3' });
  try {
    const c = b.client(); let last;
    for (let i = 0; i < 6; i++) last = await c.post('/api/login', { username: 'nobody', password: 'x' }, { 'x-real-ip': `2001:db8::${i + 1}` });
    assert.equal(last.status, 429, 'six addresses from one /64 share one limit');
    assert.notEqual((await c.post('/api/login', { username: 'nobody', password: 'x' }, { 'x-real-ip': '2001:db8:0:1::1' })).status, 429, 'another /64 is another client');
  } finally { await b.stop(); }
});

test('R7-D7 the professor sees every member and can remove a stranger; a removed TA\'s questions go too [was a PoC]', async () => {
  const p = await practiceUser(t);
  const ta = t.client(), evil = t.client(), st = t.client();
  const taName = uname('ta'), evilName = uname('evil');
  await joinAs(ta, 'ta', p.c, p.examId, taName); await joinAs(evil, 'ta', p.c, p.examId, evilName); await joinAs(st, 'student', p.c, p.examId, uname('st'));
  await evil.post(`/api/exams/${p.examId}/questions`, { topic: 0, text: 'Injected by a stranger?', options: ['a', 'b', 'c', 'd'], correct: 0 });
  const members = (await p.c.get(`/api/exams/${p.examId}`)).data.members;
  assert.deepEqual(members.filter((m) => !m.simulated).map((m) => m.role).sort(), ['student', 'ta', 'ta']);
  for (const c of [ta, st]) assert.equal((await c.get(`/api/exams/${p.examId}`)).data.members, undefined, 'only the professor sees members');
  const evilId = members.find((m) => m.username === evilName).id;
  assert.equal((await ta.post(`/api/exams/${p.examId}/members/${evilId}/remove`)).status, 404, 'a TA cannot remove anyone');
  const r = await p.c.post(`/api/exams/${p.examId}/members/${evilId}/remove`);
  assert.deepEqual([r.status, r.data.questionsDeleted], [200, 1]);
  assert.equal((await evil.get(`/api/exams/${p.examId}`)).status, 404, 'access ends at once');
  assert.equal((await evil.post(`/api/exams/${p.examId}/questions`, { topic: 1, text: 'Again?', options: ['a', 'b', 'c', 'd'], correct: 0 })).status, 404);
  assert.equal(t.db.prepare('SELECT COUNT(*) n FROM questions WHERE setter_id = ?').get(evilId).n, 0, 'nothing they wrote can be drawn');
  const profId = t.db.prepare("SELECT account_id FROM assignments WHERE exam_id = ? AND cap = 'run'").get(p.examId).account_id;
  assert.equal((await p.c.post(`/api/exams/${p.examId}/members/${profId}/remove`)).status, 409, 'the professor cannot be removed');
  const sim = members.find((m) => m.simulated);
  assert.equal((await p.c.post(`/api/exams/${p.examId}/members/${sim.id}/remove`)).status, 409, 'the simulated TA stays');
  const pub = JSON.stringify((await t.client().get(`/api/public/log/${p.examId}`)).data.entries);
  assert.ok(pub.includes('member.removed') && !pub.includes(evilName), 'logged, without names');
});

test('R7-D8 one seat, one copy: printed seats are skipped for students, a student seat is never printed, and trace names the student [was a PoC]', async () => {
  const p = await practiceUser(t);
  const s1 = t.client(), s2 = t.client();
  const n1 = uname('st'), n2 = uname('st');
  await joinAs(s1, 'student', p.c, p.examId, n1, 'Ravi Kumar'); await joinAs(s2, 'student', p.c, p.examId, n2, 'Meera Iyer');
  const shares = await sealAndVerify(p.c, p.examId);
  await releaseOpen(p.c, p.examId, shares, 4);
  assert.equal((await p.c.get(`/api/exams/${p.examId}/copies/1`)).status, 200, 'seat 1 printed on paper first');
  const a = (await s1.get(`/api/exams/${p.examId}/my-copy`)).data, b = (await s2.get(`/api/exams/${p.examId}/my-copy`)).data;
  assert.deepEqual([a.seat, b.seat], [2, 3], 'students skip the printed seat');
  const pr = await p.c.get(`/api/exams/${p.examId}/copies/3`);
  assert.equal(pr.status, 409); assert.match(pr.data.error, /online copy of a student/);
  const sum = (await p.c.get(`/api/exams/${p.examId}`)).data;
  assert.deepEqual(sum.onlineSeats, [2, 3]);
  assert.equal(sum.members.find((m) => m.username === n2).seat, 3);
  const frag = b.questions.slice(0, 3).map((q) => `${q.text}\n${q.options.join('\n')}`).join('\n');
  const tr = (await p.c.post(`/api/exams/${p.examId}/trace`, { text: frag })).data;
  assert.deepEqual(tr.matches.map((m) => [m.seat, m.student]), [[3, `Meera Iyer (${n2})`]], 'the trace names the person');
  // A removed student keeps their seat on record, so the trace still names them.
  await p.c.post(`/api/exams/${p.examId}/members/${sum.members.find((m) => m.username === n2).id}/remove`);
  assert.equal((await s2.get(`/api/exams/${p.examId}/my-copy`)).status, 404);
  assert.equal((await p.c.post(`/api/exams/${p.examId}/trace`, { text: frag })).data.matches[0].student, `Meera Iyer (${n2})`);
  assert.ok(!JSON.stringify((await t.client().get(`/api/public/log/${p.examId}`)).data).includes('Meera'), 'names never reach the public log');
});

test('R7-D9 password hashing is capped: a flood is refused at once instead of queueing every login', async () => {
  const stored = await hashPassword('x');
  const all = await Promise.allSettled(Array.from({ length: MAX_HASHING + 8 }, () => checkPassword('x', stored)));
  const busy = all.filter((r) => r.status === 'rejected' && r.reason.busy).length;
  assert.equal(busy, 8, 'exactly the ones over the cap are refused');
  assert.equal(await checkPassword('x', stored), true, 'and hashing works again right after');
});

test('R7-D10 operator-made accounts: the first login chooses a password and gets a fresh recovery code', async () => {
  const b = await boot({ LP_MODE: 'official', LP_INSTANCE: 'official' });
  try {
    const acc = await b.app.createAccount('slip1', 'Slip', { mustChange: true });
    assert.match(acc.passphrase, /^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/, 'the slip still carries a generated first password');
    const c = b.client(); await c.post('/api/login', { username: 'slip1', password: acc.passphrase });
    const r = await c.post('/api/password', { current: acc.passphrase, next: PW });
    assert.equal(r.status, 200); assert.ok(r.data.recovery && r.data.recovery !== acc.recovery);
    assert.equal((await b.client().post('/api/recover', { username: 'slip1', recovery: acc.recovery, next: NEWPW })).status, 401, 'the operator\'s code is dead');
    assert.equal((await b.client().post('/api/login', { username: 'slip1', password: PW })).status, 200);
  } finally { await b.stop(); }
});
