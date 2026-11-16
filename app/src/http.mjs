// Small HTTP helpers: headers, body parsing with a size cap, cookies, static files, rate limits.
import fs from 'node:fs';
import path from 'node:path';

export const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; " +
    "object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

export function send(res, status, body, extra = {}) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': data.length, ...extra });
  res.end(data);
}

export class HttpError extends Error {
  constructor(status, message, { retry, extra, close } = {}) { super(message); Object.assign(this, { status, retry, extra, close }); }
}

export const MAX_BODY = 16 * 1024;
export function readJson(req) {
  return new Promise((resolve, reject) => {
    if (!['POST', 'DELETE'].includes(req.method)) return resolve({});
    const type = (req.headers['content-type'] || '').split(';')[0].trim();
    const len = Number(req.headers['content-length'] || 0);
    if (len > MAX_BODY) { req.resume(); return reject(new HttpError(413, 'Request too large.')); }
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      // Answer 413 and close after the reply (destroying first gave the client a bare connection reset).
      if (size > MAX_BODY) { req.removeAllListeners('data'); req.resume(); reject(new HttpError(413, 'Request too large.', { close: true })); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!size) return resolve({});
      if (type !== 'application/json') return reject(new HttpError(415, 'Send JSON.'));
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
        resolve(v);
      } catch { reject(new HttpError(400, 'That request was not valid JSON.')); }
    });
    req.on('error', reject);
  });
}

export function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* undecodable: ignored */ }
  }
  return out;
}

// Only files that exist in public/ at start-up can ever be served: no path from the URL touches the disk.
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
export function staticFiles(dir) {
  const files = new Map();
  for (const name of fs.readdirSync(dir)) {
    const ext = path.extname(name);
    if (TYPES[ext]) files.set('/' + name, { body: fs.readFileSync(path.join(dir, name)), type: TYPES[ext] });
  }
  return (pathname) => files.get(pathname === '/' ? '/index.html' : pathname);
}

// Fixed-window counters, in memory, with a hard cap on keys so the limiter itself cannot exhaust memory.
export function makeLimiter(maxKeys = 50_000) {
  const m = new Map();
  function hit(key, limit, windowMs, now = Date.now()) {
    let e = m.get(key);
    if (!e || now >= e.reset) {
      while (m.size >= maxKeys) m.delete(m.keys().next().value);
      e = { n: 0, reset: now + windowMs }; m.set(key, e);
    }
    e.n++;
    return { ok: e.n <= limit, retry: Math.ceil((e.reset - now) / 1000) };
  }
  // Read a counter without adding to it (sign-ups count only when they succeed).
  hit.peek = (key, now = Date.now()) => { const e = m.get(key); return e && now < e.reset ? { n: e.n, retry: Math.ceil((e.reset - now) / 1000) } : { n: 0, retry: 0 }; };
  return hit;
}
