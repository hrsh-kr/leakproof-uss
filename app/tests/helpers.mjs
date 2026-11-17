// Test harness: a real server on a random port with a throw-away data directory, and a cookie-keeping client.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { start } from '../server.mjs';
import { loadConfig } from '../src/config.mjs';

export async function boot(env = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-test-'));
  const config = loadConfig({ LP_DATA_DIR: dataDir, LP_PORT: '0', LP_DEV_HTTP: '1', LP_HEADERS_TIMEOUT_MS: '1500', LP_AUTH_PER_MIN: '1000', LP_GLOBAL_PER_MIN: '100000', LP_REGISTER_PER_IP: '1000', ...env });
  const s = await start(config);
  const base = `http://127.0.0.1:${s.server.address().port}`;
  return { ...s, base, dataDir, client: () => client(base),
    stop: () => new Promise((r) => { s.server.closeAllConnections(); s.server.close(() => { s.db.close(); fs.rmSync(dataDir, { recursive: true, force: true }); r(); }); }) };
}

// A strong password every test account may use (it passes public/password-rules.js).
export const PW = 'Blue-Mango-Tree-42!', NEWPW = 'Green-Kite-Lake-77';

export function client(base) {
  const jar = new Map(); let csrf = '';
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  async function call(method, p, body, headers = {}) {
    const h = { ...headers };
    if (jar.size && !('cookie' in h)) h.cookie = cookieHeader();
    if (csrf && method !== 'GET' && !('x-csrf-token' in h)) h['x-csrf-token'] = csrf;
    if (body !== undefined) h['content-type'] ??= 'application/json';
    const res = await fetch(base + p, { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';'); const i = pair.indexOf('=');
      const k = pair.slice(0, i), v = pair.slice(i + 1);
      if (!v || /max-age=0/i.test(line)) jar.delete(k); else jar.set(k, v);
    }
    let data = null;
    const text = await res.text();
    try { data = JSON.parse(text); } catch { data = text; }
    if (data && data.csrf) csrf = data.csrf;
    return { status: res.status, data, headers: res.headers };
  }
  return {
    get: (p, hd) => call('GET', p, undefined, hd), post: (p, b = {}, hd) => call('POST', p, b, hd), del: (p, hd) => call('DELETE', p, undefined, hd),
    raw: call, get cookie() { return cookieHeader(); }, jar, set csrf(v) { csrf = v; }, get csrf() { return csrf; },
  };
}

let n = 0;
// Sign-up starts no session (the browser logs in only after the user saved the recovery code), so the helper logs in.
export async function practiceUser(t, name) {
  const c = t.client();
  const r = await c.post('/api/register', { invite: 'LP-PROF-G19', role: 'professor', username: name || `tester${++n}${Date.now() % 10000}`, display: 'Tester', password: PW });
  if (r.status !== 201) throw new Error('register failed: ' + JSON.stringify(r.data));
  const l = await c.post('/api/login', { username: r.data.username, password: PW });
  if (l.status !== 200) throw new Error('login after register failed: ' + JSON.stringify(l.data));
  return { c, examId: r.data.examId, passphrase: PW, recovery: r.data.recovery, username: r.data.username };
}

// A TA or student joins the professor's exam with that exam's class code, then logs in on `c`. Returns the sign-up response.
export async function joinAs(c, role, profClient, examId, username, display = 'Joiner') {
  const codes = (await profClient.get(`/api/exams/${examId}`)).data.classCodes;
  const invite = role === 'ta' ? 'LP-TA-G19' : 'LP-STU-G19';
  const r = await c.post('/api/register', { invite, role, classCode: role === 'ta' ? codes.ta : codes.student, username, display, password: PW });
  if (r.status === 201) await c.post('/api/login', { username: r.data.username, password: PW });
  return r;
}

// Drive a practice exam to SEALED with all professor cards verified (the browser part is simulated: it just echoes the share).
export async function sealAndVerify(c, examId, verify = 1) {
  const s = await c.post(`/api/exams/${examId}/seal`);
  if (s.status !== 200) throw new Error('seal failed ' + JSON.stringify(s.data));
  const shares = {};
  for (let slot = 1; slot <= 1; slot++) {
    shares[slot] = (await c.get(`/api/exams/${examId}/cards/${slot}`)).data.share;
    if (slot <= verify) {
      const v = await c.post(`/api/exams/${examId}/cards/${slot}/verify`, { share: shares[slot] });
      if (v.status !== 200) throw new Error('verify failed');
    }
  }
  return shares;
}

export async function releaseOpen(c, examId, shares, seats = 20, slots = [1]) {
  const r = await c.post(`/api/exams/${examId}/release`, { seats });
  if (r.status !== 201) throw new Error('release failed ' + JSON.stringify(r.data));
  const rid = r.data.id;
  const words = (await c.get(`/api/releases/${rid}`)).data.words.join(' ');
  let last;
  for (const slot of slots) last = await c.post(`/api/releases/${rid}/decide`, { slot, decision: 'approve', share: shares[slot], words });
  return { rid, words, last };
}
