// Entry point. Run one process per instance:  LP_MODE=practice node server.mjs
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, loadKey } from './src/config.mjs';
import { openDb } from './src/db.mjs';
import { createApp } from './src/app.mjs';
import { staticFiles, SECURITY_HEADERS, ipKey } from './src/http.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const RAW_HEADERS = Object.entries(SECURITY_HEADERS).map(([k, v]) => `${k}: ${v}\r\n`).join('');
let safetyNet = false;

function startupProblem(db, app) {
  try {
    const q = db.prepare('PRAGMA quick_check').get();
    if (!q || Object.values(q)[0] !== 'ok') return 'database integrity check failed';
    const v = app.log.verify();
    if (!v.ok) return `the log chain is broken at entry ${v.brokenAt}`;
  } catch (e) { return `database check failed: ${e.message}`; }
  return null;
}

export async function start(config = loadConfig()) {
  // A bug in one request must never take the service down (and re-lock an open paper).
  if (!safetyNet) { safetyNet = true; process.on('unhandledRejection', (e) => console.error('[unhandled]', e && e.message)); }
  const db = openDb(config.dataDir);
  let app;
  try {
    app = createApp({
      db, config,
      serverKey: loadKey(config.keyDir, 'server.key', db),
      logKey: loadKey(config.keyDir, 'log.key', db),
      static: staticFiles(path.join(here, 'public')),
    });
  } catch (e) { db.close(); throw e; }
  // A damaged database or a broken log chain must not be served from: answer 503 on /healthz and everywhere else, but stay up (a crash loop is the same outage).
  const bad = startupProblem(db, app);
  if (bad) { app.setDegraded(bad); console.error(`[startup] ${bad}. Serving only /healthz (503) until the operator fixes it.`); }
  // connectionsCheckingInterval: how often Node enforces headersTimeout (default 30 s is too slow against slowloris).
  const server = http.createServer({ maxHeaderSize: 8192, connectionsCheckingInterval: 1000, requireHostHeader: false }, (req, res) => { app.handle(req, res).catch(() => res.destroy()); });
  // Expect: headers get the normal pipeline (and its security headers) instead of Node's bare 417.
  const answer = (req, res) => { app.handle(req, res).catch(() => res.destroy()); };
  server.on('checkExpectation', answer);
  server.on('checkContinue', (req, res) => { res.writeContinue(); answer(req, res); });

  // Slow or idle connections are cut off, so a few clients cannot hold every socket open.
  server.headersTimeout = config.headersTimeout;
  server.requestTimeout = config.headersTimeout + 5_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 40;
  server.maxRequestsPerSocket = 100;
  server.maxConnections = 1000;
  // Per-client cap on open sockets (behind the proxy every socket is 127.0.0.1, so nginx does this job there).
  const perIp = new Map();
  const PER_IP = config.perIpSockets;
  server.on('connection', (sock) => {
    const raw = sock.remoteAddress || '';
    if (config.trustProxy && /127\.0\.0\.1$|^::1$/.test(raw)) return;
    const ip = ipKey(raw); // IPv6 per /64, like the rate limits
    const n = (perIp.get(ip) || 0) + 1;
    if (n > PER_IP) { sock.destroy(); return; }
    perIp.set(ip, n);
    sock.setTimeout(config.headersTimeout * 2, () => sock.destroy());
    sock.on('close', () => { const m = perIp.get(ip) - 1; if (m > 0) perIp.set(ip, m); else perIp.delete(ip); });
  });
  server.on('clientError', (e, sock) => {
    const status = e.code === 'ERR_HTTP_REQUEST_TIMEOUT' ? '408 Request Timeout' : e.code === 'HPE_HEADER_OVERFLOW' ? '431 Request Header Fields Too Large' : '400 Bad Request';
    if (sock.writable) sock.end(`HTTP/1.1 ${status}\r\n${RAW_HEADERS}Content-Length: 0\r\nConnection: close\r\n\r\n`); else sock.destroy();
  });
  return new Promise((resolve) => server.listen(config.port, config.host, () => resolve({ server, app, db, config })));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  start().then(({ config, server }) => {
    const { port } = server.address();
    console.log(`LeakProof ${config.instance} instance (${config.mode}) on http://${config.host}:${port}  (data: ${config.dataDir})`);
  }, (e) => { console.error(e.message); process.exit(1); });
}
