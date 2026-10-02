// Local dev server: serves public/ and runs api/*.js with a file-backed store.
// Usage: npm run dev   (ADMIN_KEY defaults to "dev-admin-key" locally)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);
process.env.ADMIN_KEY ||= 'dev-admin-key';
process.env.LEAKPROOF_DATA_DIR ||= path.join(ROOT, '.data');

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

async function runApi(name, req, res) {
  const file = path.join(ROOT, 'api', name + '.js');
  if (!/^[a-z0-9-]+$/.test(name) || !fs.existsSync(file)) { res.writeHead(404).end('not found'); return; }
  const raw = await readBody(req);
  req.body = undefined;
  if (raw && (req.headers['content-type'] || '').includes('application/json')) {
    try { req.body = JSON.parse(raw); } catch { req.body = undefined; req.badJson = true; }
  }
  req.query = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  res.status = (n) => { res.statusCode = n; return res; };
  res.json = (o) => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); return res; };
  res.send = (s) => { res.end(s); return res; };
  const mod = await import(pathToFileURL(file).href + '?t=' + Date.now());
  await mod.default(req, res);
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) { await runApi(url.pathname.slice(5), req, res); return; }
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index';
    let file = path.join(PUBLIC, p);
    if (!file.startsWith(PUBLIC)) { res.writeHead(403).end(); return; }
    if (!path.extname(file)) file += '.html';
    if (!fs.existsSync(file)) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error(e);
    res.writeHead(500).end('server error');
  }
}).listen(PORT, () => console.log('LeakProof site on http://localhost:' + PORT + ' (admin key: ' + process.env.ADMIN_KEY + ')'));
