// A small fake of Upstash's REST API (SET NX, GET, SADD, SMEMBERS, MGET, DEL, KEYS), for tests.
import http from 'node:http';

export async function startRedisEmulator(token = 'emulator-token-123') {
  const store = new Map(), sets = new Map();
  let requests = 0;
  function run(cmd) {
    const [op, ...a] = cmd;
    switch (String(op).toUpperCase()) {
      case 'SET': { const nx = a.includes('NX'); if (nx && store.has(a[0])) return { result: null }; store.set(a[0], a[1]); return { result: 'OK' }; }
      case 'GET': return { result: store.has(a[0]) ? store.get(a[0]) : null };
      case 'SADD': { const s = sets.get(a[0]) || new Set(); const before = s.size; a.slice(1).forEach((x) => s.add(x)); sets.set(a[0], s); return { result: s.size - before }; }
      case 'SMEMBERS': return { result: [...(sets.get(a[0]) || [])] };
      case 'MGET': return { result: a.map((k) => (store.has(k) ? store.get(k) : null)) };
      case 'DEL': { let n = 0; for (const k of a) { if (store.delete(k)) n++; if (sets.delete(k)) n++; } return { result: n }; }
      case 'KEYS': return { result: [...store.keys(), ...sets.keys()].filter((k) => new RegExp('^' + String(a[0]).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(k)) };
      default: return { error: 'ERR unknown command ' + op };
    }
  }
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      requests++;
      if (req.headers.authorization !== 'Bearer ' + token) { res.writeHead(401).end('{"error":"Unauthorized"}'); return; }
      if (req.method !== 'POST' || req.url !== '/pipeline') { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(JSON.parse(body).map(run)));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, token, store, sets, get requests() { return requests; }, close: () => server.close() };
}
