// Storage. Production: Upstash Redis through its REST API (private, token-protected).
// Development and tests: files in a local folder. If neither is configured, getStore returns null
// and the API answers 503 (fails closed). Nothing is ever written to a public location.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const safe = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '_');

export class FileStore {
  constructor(dir) { this.dir = dir; }
  _p(kind, id) { const d = path.join(this.dir, safe(kind)); fs.mkdirSync(d, { recursive: true }); return path.join(d, safe(id) + '.json'); }
  async add(kind, id, obj) {
    try { fs.writeFileSync(this._p(kind, id), JSON.stringify(obj), { flag: 'wx' }); return true; }
    catch (e) { if (e.code === 'EEXIST') return false; throw e; }
  }
  async list(kind) {
    const d = path.join(this.dir, safe(kind));
    if (!fs.existsSync(d)) return [];
    return fs.readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')));
  }
  async claim(key, value) {
    const d = path.join(this.dir, 'claims'); fs.mkdirSync(d, { recursive: true });
    const f = path.join(d, crypto.createHash('sha256').update(key).digest('hex') + '.txt');
    try { fs.writeFileSync(f, value, { flag: 'wx' }); return { created: true, value }; }
    catch (e) { if (e.code === 'EEXIST') return { created: false, value: fs.readFileSync(f, 'utf8') }; throw e; }
  }
}

export class RedisStore {
  constructor(url, token, fetchImpl = globalThis.fetch) { this.url = url.replace(/\/$/, ''); this.token = token; this.fetch = fetchImpl; }
  async run(cmds) {
    const r = await this.fetch(this.url + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds) });
    if (!r.ok) throw new Error('storage error ' + r.status);
    const arr = await r.json();
    return arr.map((x) => { if (x && x.error) throw new Error('storage error: ' + x.error); return x.result; });
  }
  async add(kind, id, obj) {
    const [ok] = await this.run([['SET', `lp:${kind}:${id}`, JSON.stringify(obj), 'NX'], ['SADD', `lp:idx:${kind}`, id]]);
    return ok === 'OK';
  }
  async list(kind) {
    const [ids] = await this.run([['SMEMBERS', `lp:idx:${kind}`]]);
    const out = [];
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const [vals] = await this.run([['MGET', ...chunk.map((id) => `lp:${kind}:${id}`)]]);
      for (const v of vals) if (v) out.push(JSON.parse(v));
    }
    return out;
  }
  async claim(key, value) {
    const [r] = await this.run([['SET', 'lp:claim:' + key, value, 'NX']]);
    if (r === 'OK') return { created: true, value };
    const [v] = await this.run([['GET', 'lp:claim:' + key]]);
    return { created: false, value: v };
  }
}

export function getStore(env = process.env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return new RedisStore(url, token);
  if (env.LEAKPROOF_DATA_DIR) return new FileStore(env.LEAKPROOF_DATA_DIR);
  return null;
}
