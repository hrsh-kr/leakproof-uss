// Access control, sessions, inputs and availability. Tests named FCS-* are regressions for the bugs that classmates
// validly reported against FCS Group 1 and Group 2 (fcs/fcs_bugs.csv); we make sure the same class cannot happen here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import { boot, practiceUser, sealAndVerify, releaseOpen } from './helpers.mjs';

const rawRequest = (port, text) => new Promise((resolve) => {
  const s = net.connect(port, '127.0.0.1', () => s.write(text));
  let out = ''; s.on('data', (d) => { out += d; }); s.on('close', () => resolve(out)); s.on('error', () => resolve(out));
  setTimeout(() => s.destroy(), 3000);
});

test('SR1 route matrix: every route is denied without a session or without the capability, and unknown routes are 404', async () => {
  const t = await boot();
  try {
    const a = await practiceUser(t), b = await practiceUser(t);
    const shares = await sealAndVerify(a.c, a.examId);
    const { rid } = await releaseOpen(a.c, a.examId, shares, 3);
    const qid = t.db.prepare('SELECT id FROM questions WHERE exam_id = ? LIMIT 1').get(a.examId).id;
    const fill = (p) => p.replace(':id', a.examId).replace(':rid', rid).replace(':qid', qid).replace(':slot', '1').replace(':seat', '1');
    const anon = t.client();
    for (const r of t.app.routes) {
      assert.ok(['none', 'session'].includes(r.auth), `${r.method} ${r.path} must declare auth`);
      if (r.auth !== 'session') continue;
      const body = r.method === 'GET' ? undefined : {};
      const res = await anon.raw(r.method, fill(r.path), body);
      assert.equal(res.status, 401, `${r.method} ${r.path} without a session`);
      if (!r.cap) continue;
      const other = await b.c.raw(r.method, fill(r.path), body);
      assert.equal(other.status, 404, `${r.method} ${r.path} by an account without the capability`);
    }
    for (const p of ['/api/users', '/api/admin', '/api/exams', '/api/accounts/search?q=a', '/api/exams/' + a.examId + '/paper']) {
      assert.equal((await a.c.get(p)).status, 404, p);
    }
  } finally { await t.stop(); }
});

test('SR1 official instance: capabilities are separate and one key card per account; practice routes do not exist', async () => {
  const t = await boot({ LP_INSTANCE: 'official' });
  try {
    const { app } = t;
    const id = app.exams.createExam({ title: 'Official', topics: ['A', 'B'], winStart: Date.now() - 1000, winEnd: Date.now() + 3600_000, seatLimit: 10, practice: false });
    const setter = await app.createAccount('setter1', 'Setter'), cell = await app.createAccount('cell1', 'Exam cell'), dean = await app.createAccount('dean', 'Dean');
    app.exams.assign(setter.id, id, 'submit'); app.exams.assign(cell.id, id, 'run'); app.exams.assign(cell.id, id, 'print');
    app.exams.assign(dean.id, id, 'hold', 1);
    assert.throws(() => app.exams.assign(dean.id, id, 'hold', 2), /one key card per account/);
    assert.throws(() => app.exams.assign(cell.id, id, 'hold', 1), /already assigned/);
    const login = async (u, p) => { const c = t.client(); assert.equal((await c.post('/api/login', { username: u, password: p })).status, 200); return c; };
    const s = await login('setter1', setter.passphrase), k = await login('dean', dean.passphrase);
    assert.equal((await s.post(`/api/exams/${id}/seal`)).status, 404, 'a setter cannot seal');
    assert.equal((await k.get(`/api/exams/${id}/questions`)).status, 404, 'a key holder cannot read questions');
    assert.equal((await t.client().post('/api/register', { invite: 'USS-PRACTICE', username: 'x1x', display: 'x' })).status, 404);
    assert.equal((await s.post('/api/practice/reset')).status, 404);
  } finally { await t.stop(); }
});

test('SR2 login: one message for unknown user and wrong passphrase; backoff is per user AND client, so it cannot lock others out', async () => {
  const t = await boot({ LP_TRUST_PROXY: '1' });
  try {
    const u = await practiceUser(t, 'alice');
    const c = t.client();
    const ipA = { 'x-real-ip': '10.0.0.1' }, ipB = { 'x-real-ip': '10.0.0.2' };
    const unknown = await c.post('/api/login', { username: 'nobody', password: 'x' }, ipA);
    const wrong = await c.post('/api/login', { username: 'alice', password: 'x' }, ipA);
    assert.deepEqual([unknown.status, unknown.data.error], [wrong.status, wrong.data.error]);
    for (let i = 0; i < 4; i++) await c.post('/api/login', { username: 'alice', password: 'x' }, ipA);
    const blocked = await c.post('/api/login', { username: 'alice', password: u.passphrase }, ipA);
    assert.equal(blocked.status, 429, 'attacker IP backs off even with the right passphrase');
    const fromB = await t.client().post('/api/login', { username: 'alice', password: u.passphrase }, ipB);
    assert.equal(fromB.status, 200, 'the real user elsewhere is not locked out (FCS-G1 rate-limit abuse)');
  } finally { await t.stop(); }
});

test('SR2 sessions: cookie flags, logout really ends the session, idle sessions expire, CSRF and foreign origins are refused', async () => {
  const t = await boot();
  try {
    const { c, examId } = await practiceUser(t);
    const cookieLine = (await t.client().post('/api/register', { invite: 'USS-PRACTICE', username: 'flagcheck', display: 'Flag' })).headers.get('set-cookie');
    assert.match(cookieLine, /HttpOnly/); assert.match(cookieLine, /SameSite=Strict/); assert.match(cookieLine, /Path=\//);
    // CSRF: a state change without the token, with a wrong token, or from another origin is refused.
    assert.equal((await c.post(`/api/exams/${examId}/seal`, {}, { 'x-csrf-token': '' })).status, 403);
    assert.equal((await c.post(`/api/exams/${examId}/seal`, {}, { 'x-csrf-token': 'forged' })).status, 403);
    assert.equal((await c.post(`/api/exams/${examId}/seal`, {}, { origin: 'https://evil.example' })).status, 403);
    assert.equal((await t.client().post('/api/login', { username: 'a', password: 'b' }, { origin: 'https://evil.example' })).status, 403);
    // Logout: the old cookie is dead (FCS-G1 "back button after logout").
    const stolen = c.cookie;
    await c.post('/api/logout');
    const replay = await fetch(`${t.base}/api/me`, { headers: { cookie: stolen } });
    assert.equal(replay.status, 401);
    // Logging in again replaces the previous session instead of keeping both.
    const re = await practiceUser(t, 'relogin');
    const first = re.c.cookie;
    await re.c.post('/api/login', { username: 'relogin', password: re.passphrase });
    assert.notEqual(re.c.cookie, first);
    assert.equal((await fetch(`${t.base}/api/me`, { headers: { cookie: first } })).status, 401);
    // Idle timeout.
    const d = await practiceUser(t);
    t.db.prepare('UPDATE sessions SET seen = ?').run(Date.now() - 31 * 60_000);
    assert.equal((await d.c.get('/api/me')).status, 401);
  } finally { await t.stop(); }
});

test('SR2 HTTPS mode: __Host- cookie with Secure, and HSTS', async () => {
  const t = await boot({ LP_DEV_HTTP: '0' });
  try {
    const r = await t.client().post('/api/register', { invite: 'USS-PRACTICE', username: 'secureone', display: 'Sec' });
    assert.match(r.headers.get('set-cookie'), /^__Host-lp_sid=.*; Secure/);
    assert.match(r.headers.get('strict-transport-security'), /max-age=31536000/);
  } finally { await t.stop(); }
});

test('FCS-G1 no forgotten-passphrase dead end: the recovery code sets a new passphrase and signs out every session', async () => {
  const t = await boot();
  try {
    const u = await practiceUser(t, 'bob');
    const wrong = await t.client().post('/api/recover', { username: 'bob', recovery: 'nope-nope-nope' });
    assert.equal(wrong.status, 401);
    const r = await t.client().post('/api/recover', { username: 'bob', recovery: u.recovery });
    assert.equal(r.status, 200);
    assert.equal((await u.c.get('/api/me')).status, 401, 'old session signed out');
    assert.equal((await t.client().post('/api/login', { username: 'bob', password: u.passphrase })).status, 401, 'old passphrase dead');
    assert.equal((await t.client().post('/api/login', { username: 'bob', password: r.data.passphrase })).status, 200);
    assert.equal((await t.client().post('/api/recover', { username: 'bob', recovery: u.recovery })).status, 401, 'recovery code is single-use');
  } finally { await t.stop(); }
});

test('FCS-G1 no unverified mass sign-up: registration needs the course code, is capped per client per day and in total', async () => {
  const t = await boot({ LP_REGISTER_PER_IP: '2', LP_MAX_ACCOUNTS: '5' }); // only successful sign-ups count (shared networks)
  try {
    const reg = (u, inv = 'USS-PRACTICE') => t.client().post('/api/register', { invite: inv, role: 'professor', username: u, display: 'Xy' });
    assert.equal((await reg('nocode1', 'guess')).status, 403);
    assert.equal((await reg('first1')).status, 201);
    assert.equal((await reg('first1')).status, 409, 'username taken');
    assert.equal((await reg('second2')).status, 201);
    assert.equal((await reg('third3')).status, 429, 'per-client daily cap');
    assert.equal((await reg('sim-fake')).status, 400, 'the simulated-setter prefix is reserved');
  } finally { await t.stop(); }
  const t2 = await boot({ LP_MAX_ACCOUNTS: '1' });
  try {
    assert.equal((await t2.client().post('/api/register', { invite: 'USS-PRACTICE', username: 'only1', display: 'Xy' })).status, 201);
    assert.equal((await t2.client().post('/api/register', { invite: 'USS-PRACTICE', username: 'only2', display: 'Xy' })).status, 503);
  } finally { await t2.stop(); }
});

test('FCS-G1 no user directory: nothing lists accounts, and responses carry only what the caller needs', async () => {
  const t = await boot();
  try {
    const paths = t.app.routes.map((r) => r.path).join(' ');
    assert.ok(!/users|accounts|search|admin/.test(paths), 'no user listing or search route exists');
    const { c } = await practiceUser(t);
    const me = (await c.get('/api/me')).data;
    assert.deepEqual(Object.keys(me).sort(), ['csrf', 'display', 'exams', 'instance', 'mustChange', 'name', 'username', 'waiting']);
    assert.ok(!JSON.stringify(me).includes('pw'));
  } finally { await t.stop(); }
});

test('SR10 inputs: XSS stays inert text, injection-shaped input is refused, oversize and malformed bodies are refused', async () => {
  const t = await boot();
  try {
    const { c, examId } = await practiceUser(t);
    const tac = t.client();
    const taReg = await tac.post('/api/register', { invite: 'LP-TA-G19', role: 'ta', username: 'ta-sr10-' + (Date.now() % 9999), display: 'TA SR10' });
    assert.equal(taReg.status, 201);
    const xss = '<img src=x onerror=alert(1)><script>alert(2)</script>';
    const r = await tac.post(`/api/exams/${examId}/questions`, { topic: 4, text: xss, options: ["' OR 1=1 --", 'b', 'c', 'd'], correct: 1 });
    assert.equal(r.status, 201);
    const back = (await tac.get(`/api/exams/${examId}/questions`)).data.questions.find((q) => q.topic === 4);
    assert.equal(back.text, xss, 'stored as plain text, never interpreted');
    assert.equal(back.options[0], "' OR 1=1 --");
    assert.equal((await c.post('/api/login', { username: "admin'--", password: "' OR '1'='1" })).status, 401);
    assert.equal((await t.client().post('/api/register', { invite: 'USS-PRACTICE', username: "x'; DROP TABLE accounts;--", display: 'x' })).status, 400);
    assert.equal((await tac.post(`/api/exams/${examId}/questions`, { topic: 5, text: 'x'.repeat(20_000), options: [], correct: 0 })).status, 413);
    assert.equal((await tac.post(`/api/exams/${examId}/questions`, '{"topic": 1,', { 'content-type': 'application/json' })).status, 400);
    assert.equal((await tac.post(`/api/exams/${examId}/questions`, 'topic=1', { 'content-type': 'application/x-www-form-urlencoded' })).status, 415);
    assert.equal((await tac.post(`/api/exams/${examId}/questions`, [1, 2])).status, 400);
    assert.equal((await tac.post(`/api/exams/${examId}/questions`, { topic: 6, text: 'Valid question?', options: ['a', 'b', 'c', 'd', 'e'], correct: 0 })).status, 400);
    assert.equal((await tac.post(`/api/exams/${examId}/questions`, { topic: 6, text: 'Valid question?', options: [{}, 'b', 'c', 'd'], correct: 0 })).status, 400);
    assert.equal((await tac.post(`/api/exams/${examId}/questions`, { topic: '__proto__', text: 'Valid question?', options: ['a', 'b', 'c', 'd'], correct: 0 })).status, 400);
    assert.equal((await c.get(`/api/exams/${encodeURIComponent("' OR 1=1")}`)).status, 404);
    // Path traversal on static files: only files present in public/ at start-up exist.
    const port = t.server.address().port;
    for (const p of ['/../server.mjs', '/%2e%2e/src/app.mjs', '/..%2f..%2fdata/practice/server.key', '/server.key', '/.env']) {
      const out = await rawRequest(port, `GET ${p} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`);
      assert.ok(!/BEGIN|import |sqlite/i.test(out.split('\r\n\r\n')[1] || ''), p);
    }
  } finally { await t.stop(); }
});

test('SR10 the client renders only with textContent: no innerHTML, eval or inline handlers anywhere in public/', () => {
  for (const f of fs.readdirSync(new URL('../public/', import.meta.url))) {
    const src = fs.readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test(src), `${f} uses an HTML sink`);
    if (f.endsWith('.html')) assert.ok(!/<script>|onclick=|style=/.test(src), `${f} has inline script or style`);
  }
});

test('SR10/SR11 security headers on every response; errors carry no stack traces or paths', async () => {
  const t = await boot();
  try {
    for (const p of ['/', '/app.js', '/api/me', '/nope', '/api/nope']) {
      const r = await fetch(t.base + p);
      assert.match(r.headers.get('content-security-policy'), /default-src 'self'; script-src 'self'/, p);
      assert.equal(r.headers.get('x-frame-options'), 'DENY', p);
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff', p);
      const body = await r.text();
      if (r.status >= 400) assert.ok(!/at .*\.mjs|\/Users\/|node:internal|Error:/.test(body), p);
    }
  } finally { await t.stop(); }
});

test('FCS-G1/G2 rate limits apply to every API route and answer 429 with Retry-After (not 503)', async () => {
  const t = await boot({ LP_GLOBAL_PER_MIN: '10', LP_AUTH_PER_MIN: '3' });
  try {
    const c = t.client();
    const codes = [];
    for (let i = 0; i < 12; i++) codes.push((await c.get('/api/me')).status);
    assert.ok(codes.slice(0, 10).every((s) => s === 401));
    const last = await c.get('/api/me');
    assert.equal(last.status, 429);
    assert.ok(last.headers.get('retry-after'));
  } finally { await t.stop(); }
  const t2 = await boot({ LP_AUTH_PER_MIN: '3' });
  try {
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await t2.client().post('/api/login', { username: 'u', password: 'p' })).status);
    assert.deepEqual(codes, [401, 401, 401, 429, 429]);
  } finally { await t2.stop(); }
});

test('FCS-G1/G2 connection flood: one client cannot hold more than its share of sockets; slowloris is cut off', async () => {
  const t = await boot({ LP_PER_IP_SOCKETS: '5' });
  try {
    const port = t.server.address().port;
    const socks = await Promise.all(Array.from({ length: 12 }, () => new Promise((res) => {
      const s = net.connect(port, '127.0.0.1', () => res(s)); s.on('error', () => {});
    })));
    await new Promise((r) => setTimeout(r, 300));
    const alive = socks.filter((s) => !s.destroyed && s.readyState === 'open');
    assert.ok(alive.length <= 5, `${alive.length} sockets stayed open, cap is 5`);
    socks.forEach((s) => s.destroy());
    await new Promise((r) => setTimeout(r, 200));
    // Slowloris: headers trickle in forever. The server must hang up within ~headersTimeout + check interval.
    const startAt = Date.now();
    const closedAfter = await new Promise((resolve) => {
      const s = net.connect(port, '127.0.0.1', () => {
        s.write('GET /api/me HTTP/1.1\r\nHost: x\r\n');
        const iv = setInterval(() => { if (!s.destroyed) s.write('X-a: b\r\n'); }, 300);
        s.on('close', () => { clearInterval(iv); resolve(Date.now() - startAt); });
      });
      s.on('data', () => {}); // read the server's answer, or the close is never seen
      s.on('error', () => {});
      setTimeout(() => { s.destroy(); resolve(Infinity); }, 8000);
    });
    assert.ok(closedAfter < 4000, `slow client held the socket for ${closedAfter} ms`);
    // The service is still up for everyone else.
    assert.equal((await fetch(t.base + '/healthz')).status, 200);
  } finally { await t.stop(); }
});

test('FCS-G1/G2 a login flood does not freeze the server: password hashing runs off the main thread', async () => {
  const t = await boot();
  try {
    // Distinct unknown usernames: per-user backoff does not apply, and each still pays for a dummy hash (no timing oracle).
    const flood = Array.from({ length: 30 }, (_, i) => t.client().post('/api/login', { username: `ghost${i}`, password: 'wrong-guess' }));
    await new Promise((r) => setTimeout(r, 30));
    const t0 = Date.now();
    assert.equal((await fetch(t.base + '/healthz')).status, 200);
    const ms = Date.now() - t0;
    await Promise.all(flood);
    assert.ok(ms < 250, `health check took ${ms} ms during the login flood`);
  } finally { await t.stop(); }
});
