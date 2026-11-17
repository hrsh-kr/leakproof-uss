// T7b extra tests (round 5 regression pass). Drop into tests/ as t7b.test.mjs. Each test names the mutants it kills.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boot, practiceUser, sealAndVerify, releaseOpen, PW, NEWPW } from './helpers.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = (port, text, waitMs = 600) => new Promise((resolve) => {
  const s = net.connect(port, '127.0.0.1', () => s.write(text));
  let out = ''; s.on('data', (d) => { out += d; }); s.on('close', () => resolve(out)); s.on('error', () => resolve(out));
  setTimeout(() => { s.destroy(); resolve(out); }, waitMs);
});

test('Y1 [SR2] usernames: ASCII only, 3 to 32 characters; the Kelvin sign (U+212A, lower-cases to "k") cannot alias another account (N1 N2)', async () => {
  const t = await boot();
  try {
    const reg = (username) => t.client().post('/api/register', { password: PW, invite: 'LP-PROF-G19', role: 'professor', username, display: 'Tester' });
    assert.equal((await reg('a'.repeat(32))).status, 201, '32 characters allowed');
    assert.equal((await reg('b'.repeat(33))).status, 400, '33 characters refused');
    assert.equal((await reg('ab')).status, 400, '2 characters refused');
    assert.equal((await reg('victim')).status, 201);
    assert.equal((await reg('toKen')).status, 400, 'Kelvin sign must not be accepted');
    assert.equal((await reg('Kate')).status, 400);
    assert.equal(t.db.prepare("SELECT COUNT(*) n FROM accounts WHERE username LIKE '%K%' OR username = 'token' OR username = 'kate'").get().n, 0);
  } finally { await t.stop(); }
});

test('Y2 [SR2] empty or blank names are a 400 on login and recover (not a silent 401), and recovery back-off is per username (N20 N23 N24)', async () => {
  const t = await boot();
  try {
    const a = await practiceUser(t), b = await practiceUser(t);
    const an = (await a.c.get('/api/me')).data.username, bn = (await b.c.get('/api/me')).data.username;
    const anon = t.client();
    assert.equal((await anon.post('/api/login', { username: '   ', password: 'x' })).status, 400);
    assert.equal((await anon.post('/api/login', { password: 'x' })).status, 400);
    assert.equal((await anon.post('/api/recover', { next: NEWPW, username: '   ', recovery: 'x' })).status, 400);
    assert.equal((await anon.post('/api/recover', { next: NEWPW, recovery: 'x' })).status, 400);
    for (let i = 0; i < 6; i++) await anon.post('/api/recover', { next: NEWPW, username: an, recovery: 'wrong-code' });
    assert.equal((await anon.post('/api/recover', { next: NEWPW, username: an, recovery: a.recovery })).status, 429, 'the attacked user backs off');
    assert.equal((await anon.post('/api/recover', { next: NEWPW, username: bn, recovery: b.recovery })).status, 200, 'another user from the same client is not locked');
  } finally { await t.stop(); }
});

test('Y3 [SR4/SR9] an idle open paper is evicted AND its copy secret is zeroed; the release becomes interrupted and copies stop (N31, covers N34)', async () => {
  const t = await boot();
  try {
    const { c, examId } = await practiceUser(t);
    const shares = await sealAndVerify(c, examId);
    const { rid } = await releaseOpen(c, examId, shares, 5);
    assert.equal((await c.get(`/api/exams/${examId}/copies/1`)).status, 200);
    const st = t.app.exams._opened.get(examId), secret = st.copySecret;
    assert.ok(secret.some((x) => x !== 0));
    st.last = Date.now() - 7 * 3600_000;                                  // idle for more than OPEN_IDLE (6 h)
    assert.equal((await c.get(`/api/exams/${examId}/copies/1`)).status, 409);
    assert.ok(secret.every((x) => x === 0), 'the evicted paper\'s copy secret must be wiped');
    assert.equal(t.app.exams._opened.has(examId), false);
    assert.equal(t.db.prepare('SELECT state FROM releases WHERE id = ?').get(rid).state, 'interrupted');
  } finally { await t.stop(); }
});

test('Y4 [SR10] static files: GET and HEAD only, exact path only (no case folding, no query tricks, no methods) (N16 N17)', async () => {
  const t = await boot();
  try {
    const anon = t.client();
    assert.equal((await anon.get('/app.js')).status, 200);
    assert.equal((await anon.get('/APP.JS')).status, 404);
    assert.equal((await anon.get('/Index.html')).status, 404);
    assert.equal((await anon.raw('POST', '/app.js', {})).status, 404);
    assert.equal((await anon.raw('POST', '/', {})).status, 404);
    assert.equal((await anon.raw('DELETE', '/index.html')).status, 404);
    assert.equal((await anon.raw('PUT', '/app.js', {})).status, 404);
    assert.equal((await anon.get('/%2e%2e/server.mjs')).status, 404);
    assert.equal((await anon.get('/../package.json')).status, 404);
  } finally { await t.stop(); }
});

test('Y5 [SR11] "Expect: 100-continue" gets the normal pipeline: an interim 100, then the real answer with security headers (N64)', async () => {
  const t = await boot();
  try {
    const port = new URL(t.base).port, body = JSON.stringify({ head: 'a'.repeat(64) });
    const out = await raw(port, `POST /api/public/check-head HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\nExpect: 100-continue\r\nConnection: close\r\n\r\n${body}`);
    assert.match(out, /^HTTP\/1\.1 100 Continue\r\n/);
    assert.match(out, /HTTP\/1\.1 200 OK/);
    assert.match(out, /content-security-policy/i);
  } finally { await t.stop(); }
});

test('Y6 [SR2b] official-setup: "--out <file> <exam.json>" in either order writes a 0600 credentials table and prints no passphrase (N71)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-y6-')), out = path.join(dir, 'creds.md');
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(root, 'scripts/official-setup.mjs'), '--out', out, path.join(root, 'deploy/official.example.json')],
    { env: { ...process.env, LP_MODE: 'official', LP_DATA_DIR: path.join(dir, 'data'), LP_KEY_DIR: path.join(dir, 'keys') }, encoding: 'utf8', timeout: 60_000 });
  try {
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.statSync(out).mode & 0o777, 0o600);
    const rows = fs.readFileSync(out, 'utf8').trim().split('\n');
    assert.equal(rows.length, 2 + 5, 'header, separator and five people (professor, two TAs, two students)');
    const pass = rows[2].split('|')[3].trim();
    assert.ok(pass.length >= 16 && !r.stdout.includes(pass), 'passphrases only go to the file');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Y7 [SR11] a request with more than 40 headers loses the extra ones: a session cookie sent as the 50th header is not read (S1)', async () => {
  const t = await boot();
  try {
    const { c } = await practiceUser(t);
    const cookie = c.cookie, port = new URL(t.base).port;
    const pad = Array.from({ length: 49 }, (_, i) => `X-Pad-${i}: 1\r\n`).join('');
    const out = await raw(port, `GET /api/me HTTP/1.1\r\nHost: 127.0.0.1\r\n${pad}Cookie: ${cookie}\r\nConnection: close\r\n\r\n`);
    assert.match(out, /^HTTP\/1\.1 (401|431) /, 'headers beyond the cap must not be honoured');
    const few = await raw(port, `GET /api/me HTTP/1.1\r\nHost: 127.0.0.1\r\nCookie: ${cookie}\r\nConnection: close\r\n\r\n`);
    assert.match(few, /^HTTP\/1\.1 200 /, 'control: the same cookie works normally');
  } finally { await t.stop(); }
});

test('Y8 [SR11] one connection serves at most 100 requests, then the server answers 503 (S3)', async () => {
  const t = await boot();
  try {
    const port = new URL(t.base).port;
    const one = 'GET /healthz HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n';
    const out = await raw(port, one.repeat(110), 1500);
    const ok = (out.match(/HTTP\/1\.1 200 /g) || []).length;
    assert.ok(ok <= 100, `at most 100 answered on one socket, got ${ok}`);
    assert.match(out, /HTTP\/1\.1 503 /);
  } finally { await t.stop(); }
});
