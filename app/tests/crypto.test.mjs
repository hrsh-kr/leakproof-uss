import test from 'node:test';
import assert from 'node:assert/strict';
import { rand, seal, open, split, combine, hashPassword, checkPassword, generatePassphrase, Stream, SHARE_BYTES } from '../src/crypto.mjs';
import { makeLog } from '../src/log.mjs';
import { openDb } from '../src/db.mjs';
import { draw } from '../src/exam.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

test('AES-GCM: round trip, and any change to ciphertext or context is refused', () => {
  const k = rand(32), box = seal(k, Buffer.from('paper'), 'paper|E1');
  assert.equal(open(k, box, 'paper|E1').toString(), 'paper');
  assert.throws(() => open(k, box, 'paper|E2'));                      // wrong context (AAD)
  const t = Buffer.from(box); t[t.length - 1] ^= 1;
  assert.throws(() => open(k, t, 'paper|E1'));                          // tampered
  assert.throws(() => open(rand(32), box, 'paper|E1'));                 // wrong key
});

test('SR4 Shamir 3 of 5: every 3-card subset opens, no 2-card subset does, duplicates are refused', () => {
  const secret = rand(32), shares = split(secret, 3, 5);
  assert.equal(shares[0].length, SHARE_BYTES);
  for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) {
    let wrong;
    try { wrong = combine([shares[a], shares[b]]); } catch { wrong = null; }
    assert.ok(!wrong || !wrong.equals(secret), 'two shares must not reveal the key');
    for (let c = b + 1; c < 5; c++) assert.ok(combine([shares[a], shares[b], shares[c]]).equals(secret));
  }
  assert.throws(() => combine([shares[0], shares[0], shares[1]]), /duplicate/);
  assert.ok(combine(shares).equals(secret));
});

test('passwords: scrypt with salt; generated passphrases have 80 bits', async () => {
  const h1 = await hashPassword('correct horse'), h2 = await hashPassword('correct horse');
  assert.notEqual(h1, h2);
  assert.ok(await checkPassword('correct horse', h1));
  assert.ok(!(await checkPassword('wrong', h1)));
  assert.match(generatePassphrase(), /^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);
});

test('SR9 the order generator is uniform enough and keyed', () => {
  const counts = Array(6).fill(0), s = new Stream(rand(32), 'x');
  for (let i = 0; i < 60000; i++) counts[s.below(6)]++;
  for (const n of counts) assert.ok(Math.abs(n - 10000) < 500, `bucket ${n}`);
  const k = rand(32);
  assert.deepEqual(new Stream(k, 'a').shuffle([1, 2, 3, 4, 5]), new Stream(k, 'a').shuffle([1, 2, 3, 4, 5]));
});

test('SR8 the draw is replayable from the seed and the pool ids', () => {
  const pool = Array.from({ length: 40 }, (_, i) => ({ id: rand(16).toString('hex'), topic: i % 10 }));
  const seed = rand(32);
  assert.deepEqual(draw(seed, pool, 10), draw(seed, [...pool].reverse(), 10));
  for (const [t, qid] of draw(seed, pool, 10).entries()) assert.equal(pool.find((p) => p.id === qid).topic, t);
});

test('SR6 log: edits, deletions and reordering are detected; only allow-listed fields are written', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-log-'));
  const db = openDb(dir), key = rand(32), log = makeLog(db, key);
  const h1 = log.append('E', 'a', 'one', { count: 1 });
  log.append('E', 'a', 'two', { count: 2 });
  log.append('E', 'a', 'three', { count: 3 });
  assert.equal(log.verify().ok, true);
  assert.equal(log.contains(h1), true);
  assert.throws(() => log.append('E', 'a', 'x', { text: 'question text' }), /not allowed/);
  assert.throws(() => db.exec("UPDATE log SET detail = '{}' WHERE seq = 2"), /append-only/);
  // An attacker with full database access drops the guard and edits a row: the keyed chain no longer verifies.
  db.exec('DROP TRIGGER log_no_update; DROP TRIGGER log_no_delete');
  db.exec(`UPDATE log SET detail = '{"count":9}' WHERE seq = 2`);
  assert.deepEqual([log.verify().ok, log.verify().brokenAt], [false, 2]);
  // Without the key kept outside the database, the chain cannot be checked or rebuilt.
  assert.equal(makeLog(db, rand(32)).verify().ok, false);
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});
