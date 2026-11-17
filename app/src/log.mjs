// Tamper-evident log: each entry's hash = HMAC(logKey, prev || entry). The key is outside the database,
// so someone who can edit the database cannot recompute a valid chain. The head is printed on every copy.
import { hmac } from './crypto.mjs';

const GENESIS = '0'.repeat(64);
// Only these detail fields may ever be written: no question text, keys, shares or passphrases.
const ALLOWED = new Set(['topics', 'questions', 'setters', 'slot', 'seat', 'seats', 'fetch', 'release', 'verified',
  'drawn', 'setHash', 'reason', 'stage', 'approved', 'needed', 'matches', 'fragment', 'gate', 'seed', 'count']);

const RECHECK = 30_000;

export function makeLog(db, key, now = Date.now) {
  const last = db.prepare('SELECT hash FROM log ORDER BY seq DESC LIMIT 1');
  const ins = db.prepare('INSERT INTO log (exam_id, at, actor, action, detail, prev, hash) VALUES (?,?,?,?,?,?,?)');
  const entryHash = (prev, e) => hmac(key, prev, e.exam_id ?? '', String(e.at), e.actor ?? '', e.action, e.detail).toString('hex');

  function append(examId, actor, action, detail = {}) {
    for (const k of Object.keys(detail)) if (!ALLOWED.has(k)) throw new Error('log field not allowed: ' + k);
    const prev = last.get()?.hash ?? GENESIS;
    const e = { exam_id: examId, at: Date.now(), actor, action, detail: JSON.stringify(detail) };
    const hash = entryHash(prev, e);
    ins.run(e.exam_id, e.at, e.actor, e.action, e.detail, prev, hash);
    return hash;
  }
  function verify() {
    let prev = GENESIS, n = 0;
    for (const row of db.prepare('SELECT * FROM log ORDER BY seq').iterate()) {
      if (row.prev !== prev || entryHash(prev, row) !== row.hash) return { ok: false, brokenAt: row.seq, entries: n };
      prev = row.hash; n++;
    }
    return { ok: true, entries: n, head: prev };
  }
  // Public callers get a cached result: the full walk runs at most every 30 s, so an edit is still seen within 30 s.
  let cached = null;
  function status() {
    if (!cached || now() - cached.checkedAt >= RECHECK) {
      const v = verify();
      cached = { ok: v.ok, entries: v.entries, ...(v.ok ? {} : { brokenAt: v.brokenAt }), checkedAt: now() };
    }
    return cached;
  }
  const head = () => last.get()?.hash ?? GENESIS;
  const contains = (h) => !!db.prepare('SELECT 1 FROM log WHERE hash = ?').get(h);
  const recent = (examId, n, before = null) => db.prepare('SELECT * FROM (SELECT seq, at, action, detail, hash FROM log WHERE exam_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?) ORDER BY seq')
    .all(examId, before ?? Number.MAX_SAFE_INTEGER, n);
  const countFor = (examId) => db.prepare('SELECT COUNT(*) n FROM log WHERE exam_id = ?').get(examId).n;
  const has = (examId, action, detail) => !!db.prepare('SELECT 1 FROM log WHERE exam_id = ? AND action = ? AND detail = ?').get(examId, action, JSON.stringify(detail));
  return { append, verify, status, head, contains, recent, countFor, has };
}
