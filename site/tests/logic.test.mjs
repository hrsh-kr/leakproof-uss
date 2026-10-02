// Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import LP from '../src/js/logic.mjs';

const DEMO_EXAM_SECRET = 'leakproof-demo-exam-2026';          // must match src/app.js
const seededBytes = (seed) => { const r = LP.rngFrom(seed); return (n) => Uint8Array.from({ length: n }, () => Math.floor(r() * 256)); };
const combos = (arr, k) => k === 0 ? [[]] : arr.flatMap((x, i) => combos(arr.slice(i + 1), k - 1).map((c) => [x, ...c]));

test('seeded randomness is repeatable and shuffle is a permutation', () => {
  const a = LP.rngFrom('abc'), b = LP.rngFrom('abc');
  for (let i = 0; i < 10; i++) assert.equal(a(), b());
  const items = [...Array(30).keys()];
  const s = LP.shuffle(items, LP.rngFrom('x'));
  assert.deepEqual([...s].sort((p, q) => p - q), items);
  assert.notDeepEqual(s, items);
});

test('pool: 20 setters x 5 questions, subject sizes 35/35/30', () => {
  const pool = LP.buildPool();
  assert.equal(pool.setters.length, 20);
  assert.equal(pool.questions.length, 100);
  for (const s of pool.setters) assert.equal(pool.questions.filter((q) => q.setter === s.id).length, 5);
  const n = (sub) => pool.questions.filter((q) => q.subject === sub).length;
  assert.deepEqual([n('Physics'), n('Chemistry'), n('Biology')], [35, 35, 30]);
});

test('draw: reproducible from seed, meets quotas, no duplicates, differs across seeds', () => {
  const pool = LP.buildPool();
  const p1 = LP.drawPaper(pool, 'seed-1'), p2 = LP.drawPaper(pool, 'seed-1'), p3 = LP.drawPaper(pool, 'seed-2');
  assert.deepEqual(p1.map((q) => q.id), p2.map((q) => q.id));
  assert.notDeepEqual(p1.map((q) => q.id), p3.map((q) => q.id));
  assert.equal(p1.length, 15);
  assert.equal(new Set(p1.map((q) => q.id)).size, 15);
  for (const sub of LP.SUBJECTS) assert.equal(p1.filter((q) => q.subject === sub).length, LP.QUOTAS[sub]);
  for (const q of p1) assert.ok(pool.questions.some((x) => x.id === q.id));
});

test('exposure: none and all', () => {
  const pool = LP.buildPool(), paper = LP.drawPaper(pool, 's');
  assert.equal(LP.exposure(paper, new Set()).count, 0);
  assert.equal(LP.exposure(paper, new Set(pool.setters.map((s) => s.id))).count, 15);
});

test('simulation: mean exposure matches the exact expectation', () => {
  const pool = LP.buildPool();
  const compromised = new Set(['S02', 'S05', 'S09', 'S12', 'S16', 'S19']);
  const sizes = { Physics: 35, Chemistry: 35, Biology: 30 };
  let expected = 0;
  for (const q of pool.questions) if (compromised.has(q.setter)) expected += LP.QUOTAS[q.subject] / sizes[q.subject];
  const r = LP.simulateDraws(pool, compromised, 3000, 'sim');
  assert.ok(Math.abs(r.meanCount - expected) < 0.2, `mean ${r.meanCount} vs expected ${expected}`);
  assert.ok(r.max >= r.meanCount);
});

test('Shamir: every 3 of 5 shares rebuild the secret; also 4 and 5; many random secrets', () => {
  const rb = seededBytes('shamir');
  for (let trial = 0; trial < 40; trial++) {
    const secret = LP.combine(LP.makeShares(1n + BigInt(trial) * 123456789n, 2, 3, rb)); // sanity: k=2,n=3 works
    assert.equal(secret, 1n + BigInt(trial) * 123456789n);
  }
  const secret = 0xdeadbeefcafebaben;
  const shares = LP.makeShares(secret, 3, 5, rb);
  for (const c of combos(shares, 3)) assert.equal(LP.combine(c), secret);
  assert.equal(LP.combine(shares.slice(0, 4)), secret);
  assert.equal(LP.combine(shares), secret);
});

test('Shamir: fewer than k shares do not rebuild the secret', () => {
  const rb = seededBytes('few');
  const secret = 424242424242n;
  for (let trial = 0; trial < 100; trial++) {
    const shares = LP.makeShares(secret, 3, 5, rb);
    for (const c of combos(shares, 2)) assert.notEqual(LP.combine(c), secret);
    for (const c of combos(shares, 1)) assert.notEqual(LP.combine(c), secret);
  }
});

test('Shamir: rejects bad parameters, shares differ per sharing', () => {
  assert.throws(() => LP.makeShares(1n, 1, 5));
  assert.throws(() => LP.makeShares(1n, 6, 5));
  const rb = seededBytes('d');
  const a = LP.makeShares(7n, 3, 5, rb), b = LP.makeShares(7n, 3, 5, rb);
  assert.notEqual(a[0].y, b[0].y);
});

test('encryption: round trip, wrong key, tampered ciphertext, two-share key all fail safely', async () => {
  const rb = seededBytes('enc');
  const secret = 99999999999999999999n;
  const shares = LP.makeShares(secret, 3, 5, rb);
  const iv = Uint8Array.from({ length: 12 }, (_, i) => i + 1);
  const ct = await LP.seal('SAMPLE PAPER: Q1 ...', secret, iv);
  assert.equal(await LP.open(ct, LP.combine([shares[0], shares[2], shares[4]]), iv), 'SAMPLE PAPER: Q1 ...');
  assert.equal(await LP.open(ct, LP.combine([shares[0], shares[1]]), iv), null);
  assert.equal(await LP.open(ct, secret + 1n, iv), null);
  const bad = ct.slice(); bad[3] ^= 1;
  assert.equal(await LP.open(bad, secret, iv), null);
});

test('release rules fail closed on every missing condition', () => {
  const ok = { approvals: 3, k: 3, seated: true, minutesToStart: 45, windowMinutes: 60 };
  assert.equal(LP.releaseCheck(ok).ok, true);
  assert.equal(LP.releaseCheck({ ...ok, approvals: 2 }).ok, false);
  assert.equal(LP.releaseCheck({ ...ok, seated: false }).ok, false);
  assert.equal(LP.releaseCheck({ ...ok, minutesToStart: 61 }).ok, false);
  assert.equal(LP.releaseCheck({ ...ok, minutesToStart: -1 }).ok, false);
  assert.equal(LP.releaseCheck({ ...ok, minutesToStart: 0 }).ok, true);
  assert.equal(LP.releaseCheck({ approvals: 0, k: 3, seated: false, minutesToStart: 200, windowMinutes: 60 }).missing.length, 3);
});

test('copies: deterministic, valid permutations, unique across 200 seats, trace finds the seat', () => {
  const seen = new Set();
  for (let seat = 1; seat <= 200; seat++) {
    const c = LP.copyFor(DEMO_EXAM_SECRET, seat);
    assert.deepEqual(c, LP.copyFor(DEMO_EXAM_SECRET, seat));
    assert.deepEqual([...c.order].sort(), [0, 1, 2, 3]);
    for (const o of c.optionOrders) assert.deepEqual([...o].sort(), [0, 1, 2, 3]);
    seen.add(LP.visibleFingerprint(c, 4));
  }
  assert.equal(seen.size, 200);
  for (const seat of [1, 37, 112, 200]) {
    const fp = LP.visibleFingerprint(LP.copyFor(DEMO_EXAM_SECRET, seat), 4);
    assert.deepEqual(LP.traceSeats(DEMO_EXAM_SECRET, 200, fp, 4), [seat]);
  }
});

test('trace with a partial photo narrows the seats but always includes the true one', () => {
  let ambiguous = 0;
  for (let seat = 1; seat <= 200; seat++) {
    for (const v of [1, 2, 4]) {
      const fp = LP.visibleFingerprint(LP.copyFor(DEMO_EXAM_SECRET, seat), v);
      const m = LP.traceSeats(DEMO_EXAM_SECRET, 200, fp, v);
      assert.ok(m.includes(seat));
      if (v === 1 && m.length > 1) ambiguous++;
    }
  }
  assert.ok(ambiguous > 0, 'one visible question should sometimes be ambiguous (the demo says so honestly)');
  assert.deepEqual(LP.traceSeats(DEMO_EXAM_SECRET, 200, '9:9999', 1), []);
});

test('copy ID check digit detects every single-digit mistake and bad formats', () => {
  for (let seat = 1; seat <= 200; seat++) {
    const id = LP.copyId(seat);
    assert.ok(LP.verifyCopyId(id), id);
    const body = id.slice(1, 4), chk = id.slice(5);
    for (let pos = 0; pos < 3; pos++) {
      for (let d = 0; d <= 9; d++) {
        if (String(d) === body[pos]) continue;
        const forged = 'C' + body.slice(0, pos) + d + body.slice(pos + 1) + '-' + chk;
        assert.equal(LP.verifyCopyId(forged), false, `${id} -> ${forged}`);
      }
    }
  }
  for (const bad of ['', 'C12-3', 'X001-1', 'C001-', 'C001-12', 'c001-1']) assert.equal(LP.verifyCopyId(bad), false, bad);
});

const sample = [
  { index: 1, time: '09:12', actor: 'Custodian 2', action: 'approved sealing' },
  { index: 2, time: '09:14', actor: 'System', action: 'sealed paper' },
  { index: 3, time: '10:41', actor: 'Authority', action: 'issued token for Centre 118' },
  { index: 4, time: '10:55', actor: 'Centre 118', action: 'sent seating report' },
  { index: 5, time: '11:02', actor: 'Custodians 1,3,4', action: 'released key' },
  { index: 6, time: '11:09', actor: 'Centre 118', action: 'printed 240 copies' },
];

test('log chain: valid chain verifies', async () => {
  const chain = await LP.buildChain(sample);
  assert.deepEqual(await LP.verifyChain(chain), { ok: true, firstBad: -1, reason: '' });
});

test('log chain: edit, link change, deletion and reordering are all detected', async () => {
  const chain = await LP.buildChain(sample);
  for (let i = 0; i < chain.length; i++) {
    const edited = chain.map((e) => ({ ...e })); edited[i].action = 'something else';
    const r = await LP.verifyChain(edited);
    assert.equal(r.ok, false); assert.equal(r.firstBad, i);
  }
  const relinked = chain.map((e) => ({ ...e })); relinked[3].prev = LP.GENESIS;
  assert.equal((await LP.verifyChain(relinked)).ok, false);
  const deleted = chain.filter((_, i) => i !== 2);
  assert.equal((await LP.verifyChain(deleted)).ok, false);
  const reordered = [...chain]; [reordered[1], reordered[2]] = [reordered[2], reordered[1]];
  assert.equal((await LP.verifyChain(reordered)).ok, false);
});

test('log chain: a rewritten chain is consistent but its head differs from the published head; truncation changes the head', async () => {
  const chain = await LP.buildChain(sample);
  const published = LP.headOf(chain);
  const edited = chain.map((e) => ({ ...e })); edited[2].action = 'issued token for Centre 999';
  const rewritten = await LP.rewriteFrom(edited, 2);
  assert.equal((await LP.verifyChain(rewritten)).ok, true);
  assert.notEqual(LP.headOf(rewritten), published);
  const truncated = chain.slice(0, 5);
  assert.equal((await LP.verifyChain(truncated)).ok, true);
  assert.notEqual(LP.headOf(truncated), published);
  assert.equal(LP.headOf(chain), published);
});

test('expectedExposure: none, all, and agrees with simulation', () => {
  const pool = LP.buildPool();
  assert.equal(LP.expectedExposure(pool, new Set()), 0);
  assert.ok(Math.abs(LP.expectedExposure(pool, new Set(pool.setters.map((s) => s.id))) - 15) < 1e-9);
  const set = new Set(['S01', 'S08', 'S15', 'S16']);
  const r = LP.simulateDraws(pool, set, 3000, 'exp');
  assert.ok(Math.abs(r.meanCount - LP.expectedExposure(pool, set)) < 0.2);
  // monotone: leaking more setters never lowers the expectation
  const order = LP.shuffle(pool.setters.map((s) => s.id), LP.rngFrom('slider-order'));
  let prev = -1;
  for (let n = 0; n <= 20; n++) {
    const e = LP.expectedExposure(pool, new Set(order.slice(0, n)));
    assert.ok(e >= prev); prev = e;
  }
});

test('leak matching: identical, reworded and unrelated text', () => {
  const qs = ['Which unit measures electric current? volt ampere ohm watt', 'What is the chemical symbol for sodium? Na K S Sn', 'What is 15% of 200? 15 20 30 45'];
  assert.equal(LP.similarity(qs[1], qs[1]), 1);
  const edited = 'what is the chemical symbol for sodium (Na, K, S, Sn)';
  const ranked = LP.matchLeak(edited, qs);
  assert.equal(ranked[0].index, 1);
  assert.ok(ranked[0].score > 0.6, String(ranked[0].score));
  assert.ok(ranked[1].score < 0.2);
  assert.equal(LP.similarity('', qs[0]), 0);
  assert.equal(LP.similarity('zzz qqq', qs[0]), 0);
  // symmetric and bounded
  for (const a of qs) for (const b of qs) { const s = LP.similarity(a, b); assert.ok(s >= 0 && s <= 1); assert.equal(s, LP.similarity(b, a)); }
});
