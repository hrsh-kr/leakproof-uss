// All cryptography lives here. Only node:crypto primitives; no home-made ciphers.
import crypto from 'node:crypto';

export const rand = (n) => crypto.randomBytes(n);
export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest();
export const hmac = (key, ...parts) => {
  const h = crypto.createHmac('sha256', key);
  for (const p of parts) h.update(typeof p === 'string' ? Buffer.from(p, 'utf8') : p).update(Buffer.from([0]));
  return h.digest();
};
export const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(a, b);

// AES-256-GCM. Output: iv(12) | tag(16) | ciphertext. `aad` binds the ciphertext to its context.
export function seal(key, plaintext, aad) {
  const iv = rand(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([c.update(plaintext), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}
export function open(key, box, aad) {
  const d = crypto.createDecipheriv('aes-256-gcm', key, box.subarray(0, 12));
  d.setAAD(Buffer.from(aad, 'utf8'));
  d.setAuthTag(box.subarray(12, 28));
  return Buffer.concat([d.update(box.subarray(28)), d.final()]);
}

// Passwords: scrypt with a per-user salt, ~60 ms per check, run on the thread pool so a login flood
// cannot freeze the event loop for everyone else.
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
// At most MAX_HASHING checks run or wait at once (32 MiB each); beyond that a request is refused at once (busy) rather than
// queued, so a flood of logins from many addresses cannot pile up memory or make every real login wait minutes.
export const MAX_HASHING = 32;
let hashing = 0;
const scrypt = (pw, salt) => {
  if (hashing >= MAX_HASHING) return Promise.reject(Object.assign(new Error('password hashing busy'), { busy: true }));
  hashing++;
  return new Promise((res, rej) => crypto.scrypt(pw, salt, 32, SCRYPT, (e, k) => { hashing--; e ? rej(e) : res(k); }));
};
export async function hashPassword(pw) {
  const salt = rand(16);
  return 's1$' + salt.toString('base64') + '$' + (await scrypt(pw, salt)).toString('base64');
}
export async function checkPassword(pw, stored) {
  const [v, s, h] = String(stored).split('$');
  if (v !== 's1' || !s || !h) return false;
  return safeEqual(await scrypt(pw, Buffer.from(s, 'base64')), Buffer.from(h, 'base64'));
}
const DUMMY = 's1$' + rand(16).toString('base64') + '$' + rand(32).toString('base64');
export const burnPasswordTime = async (pw) => { await checkPassword(pw, DUMMY); return false; };

// Generated secrets people copy once: 16 base32 chars in groups of 4 (80 bits).
const B32 = 'abcdefghijkmnpqrstuvwxyz23456789';
export function generatePassphrase(groups = 4) {
  const out = [];
  for (let g = 0; g < groups; g++) {
    let s = '';
    for (const b of rand(4)) s += B32[b & 31];
    out.push(s);
  }
  return out.join('-');
}

// Shamir secret sharing, threshold t of n, over GF(p) with p = 2^521 - 1 (a Mersenne prime, larger than any 256-bit secret).
export const P = (1n << 521n) - 1n;
const mod = (a) => ((a % P) + P) % P;
const toBig = (buf) => BigInt('0x' + (buf.length ? buf.toString('hex') : '0'));
function randField() {
  for (;;) { const v = toBig(rand(66)) & ((1n << 521n) - 1n); if (v < P) return v; }
}
function inv(a) {
  let [t, nt, r, nr] = [0n, 1n, P, mod(a)];
  while (nr) { const q = r / nr; [t, nt] = [nt, t - q * nt]; [r, nr] = [nr, r - q * nr]; }
  if (r !== 1n) throw new Error('not invertible');
  return mod(t);
}
export function split(secret, t, n) {
  if (!(t >= 1 && t <= n && n < 256)) throw new Error('bad threshold');
  const coeffs = [toBig(secret), ...Array.from({ length: t - 1 }, randField)];
  const shares = [];
  for (let x = 1n; x <= BigInt(n); x++) {
    let y = 0n;
    for (let i = coeffs.length - 1; i >= 0; i--) y = mod(y * x + coeffs[i]);
    shares.push(Buffer.concat([Buffer.from([Number(x)]), Buffer.from(y.toString(16).padStart(132, '0'), 'hex')]));
  }
  return shares;
}
export function combine(shares, len = 32) {
  const pts = shares.map((s) => ({ x: BigInt(s[0]), y: toBig(s.subarray(1)) }));
  const xs = new Set(pts.map((p) => p.x));
  if (xs.size !== pts.length) throw new Error('duplicate share');
  if (pts.some((p) => p.x === 0n || p.y >= P)) throw new Error('bad share');
  let secret = 0n;
  for (const a of pts) {
    let num = 1n, den = 1n;
    for (const b of pts) if (a !== b) { num = mod(num * -b.x); den = mod(den * (a.x - b.x)); }
    secret = mod(secret + a.y * num * inv(den));
  }
  const hex = secret.toString(16);
  if (hex.length > len * 2) throw new Error('bad shares');
  return Buffer.from(hex.padStart(len * 2, '0'), 'hex');
}
export const SHARE_BYTES = 67;

// Deterministic byte stream from a key: HMAC-SHA-256 in counter mode. Used for the draw and per-seat order.
export class Stream {
  constructor(key, label) { this.key = key; this.label = label; this.ctr = 0; this.buf = Buffer.alloc(0); }
  bytes(n) {
    while (this.buf.length < n) this.buf = Buffer.concat([this.buf, hmac(this.key, this.label, String(this.ctr++))]);
    const out = this.buf.subarray(0, n); this.buf = this.buf.subarray(n); return out;
  }
  // Uniform integer in [0, n) by rejection sampling (no modulo bias).
  below(n) {
    const lim = Math.floor(0x100000000 / n) * n;
    for (;;) { const v = this.bytes(4).readUInt32BE(0); if (v < lim) return v % n; }
  }
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = this.below(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
}
