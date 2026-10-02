/* LeakProof demo logic. Pure functions, no DOM. Tested in tests/logic.test.mjs.
   Everything here is a simplified, working version of what the real tool will do. */
const LP = (function () {
  'use strict';

  /* ---------- seeded randomness (so a draw can be repeated from its seed) ---------- */
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rngFrom(text) { return mulberry32(xmur3(String(text))()); }
  function shuffle(items, rng) {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ---------- Demo 1: question pool and late random draw ---------- */
  const SUBJECTS = ['Physics', 'Chemistry', 'Biology'];
  const QUOTAS = { Physics: 5, Chemistry: 5, Biology: 5 };

  function buildPool() {
    const setters = [];
    for (let i = 1; i <= 20; i++) {
      const subject = i <= 7 ? 'Physics' : i <= 14 ? 'Chemistry' : 'Biology';
      setters.push({ id: 'S' + String(i).padStart(2, '0'), subject });
    }
    const questions = [];
    for (const s of setters) {
      for (let q = 1; q <= 5; q++) {
        questions.push({ id: 'Q-' + s.id + '-' + q, setter: s.id, subject: s.subject });
      }
    }
    return { setters, questions };
  }

  function drawPaper(pool, seed, quotas) {
    quotas = quotas || QUOTAS;
    const paper = [];
    for (const subject of SUBJECTS) {
      const candidates = pool.questions.filter(function (q) { return q.subject === subject; });
      const picked = shuffle(candidates, rngFrom(seed + '|' + subject)).slice(0, quotas[subject]);
      for (const q of picked) paper.push(q);
    }
    return paper;
  }

  function exposure(paper, compromised) {
    const leaked = paper.filter(function (q) { return compromised.has(q.setter); });
    const bySubject = { Physics: 0, Chemistry: 0, Biology: 0 };
    for (const q of leaked) bySubject[q.subject]++;
    return { leaked: leaked, count: leaked.length, total: paper.length, bySubject: bySubject };
  }

  /* Exact expected number of known questions: each question in a subject is drawn with
     probability quota / subjectSize, so the expectation is the sum over leaked questions. */
  function expectedExposure(pool, compromised, quotas) {
    quotas = quotas || QUOTAS;
    const sizes = {};
    for (const q of pool.questions) sizes[q.subject] = (sizes[q.subject] || 0) + 1;
    let e = 0;
    for (const q of pool.questions) if (compromised.has(q.setter)) e += quotas[q.subject] / sizes[q.subject];
    return e;
  }

  function simulateDraws(pool, compromised, runs, seedBase) {
    let sum = 0, max = 0, half = 0;
    for (let r = 0; r < runs; r++) {
      const paper = drawPaper(pool, seedBase + ':' + r);
      const e = exposure(paper, compromised);
      sum += e.count;
      if (e.count > max) max = e.count;
      if (e.count * 2 >= e.total) half++;
    }
    const total = Object.values(QUOTAS).reduce(function (a, b) { return a + b; }, 0);
    return { meanCount: sum / runs, meanFraction: sum / runs / total, max: max, shareHalfOrMore: half / runs, total: total };
  }

  /* ---------- Demo 2: split key (Shamir over a prime field) and real encryption ---------- */
  const P = (1n << 127n) - 1n;           // a Mersenne prime, 2^127 - 1
  const BITS = 127;

  function defaultRandomBytes(n) { return globalThis.crypto.getRandomValues(new Uint8Array(n)); }

  function randomBelow(p, randomBytes) {
    const nbytes = Math.ceil(BITS / 8);
    const mask = (1n << BigInt(BITS)) - 1n;
    for (;;) {
      let x = 0n;
      for (const v of randomBytes(nbytes)) x = (x << 8n) | BigInt(v);
      x &= mask;
      if (x < p) return x;
    }
  }
  function mod(a) { return ((a % P) + P) % P; }
  function modPow(base, exp) {
    let result = 1n; base = mod(base);
    while (exp > 0n) {
      if (exp & 1n) result = (result * base) % P;
      base = (base * base) % P; exp >>= 1n;
    }
    return result;
  }
  function modInv(a) { return modPow(a, P - 2n); }

  function makeShares(secret, k, n, randomBytes) {
    randomBytes = randomBytes || defaultRandomBytes;
    if (!(k >= 2 && k <= n)) throw new Error('need 2 <= k <= n');
    const coeffs = [mod(secret)];
    for (let i = 1; i < k; i++) coeffs.push(randomBelow(P, randomBytes));
    const shares = [];
    for (let x = 1; x <= n; x++) {
      let y = 0n;
      for (let i = coeffs.length - 1; i >= 0; i--) y = (y * BigInt(x) + coeffs[i]) % P;
      shares.push({ x: x, y: y });
    }
    return shares;
  }

  function combine(shares) {
    let secret = 0n;
    for (let i = 0; i < shares.length; i++) {
      let num = 1n, den = 1n;
      for (let j = 0; j < shares.length; j++) {
        if (i === j) continue;
        num = mod(num * BigInt(-shares[j].x));
        den = mod(den * BigInt(shares[i].x - shares[j].x));
      }
      secret = mod(secret + shares[i].y * num % P * modInv(den));
    }
    return secret;
  }

  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function secretToHex(secret) { return mod(secret).toString(16).padStart(32, '0'); }

  async function deriveKey(secret) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', enc.encode(secretToHex(secret)));
    return globalThis.crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  async function seal(plaintext, secret, iv) {
    const key = await deriveKey(secret);
    const ct = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, enc.encode(plaintext));
    return new Uint8Array(ct);
  }
  async function open(ciphertext, secret, iv) {
    try {
      const key = await deriveKey(secret);
      const pt = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ciphertext);
      return dec.decode(pt);
    } catch (e) {
      return null;     // wrong key: authenticated encryption refuses to return anything
    }
  }
  function toHex(bytes) { return Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join(''); }

  /* Rules the centre must satisfy before it may rebuild the key (fail closed). */
  function releaseCheck(state) {
    const missing = [];
    if (state.approvals < state.k) missing.push('Quorum: ' + state.approvals + ' of ' + state.k + ' custodians approved');
    if (!state.seated) missing.push('Seating report not confirmed');
    if (!(state.minutesToStart >= 0 && state.minutesToStart <= state.windowMinutes)) {
      missing.push('Outside the print window (opens ' + state.windowMinutes + ' minutes before the start)');
    }
    return { ok: missing.length === 0, missing: missing };
  }

  /* ---------- Demo 3: every copy is different ---------- */
  function copyFor(examSecret, seat, nQuestions, nOptions) {
    nQuestions = nQuestions || 4; nOptions = nOptions || 4;
    const rng = rngFrom(examSecret + '|seat|' + seat);
    const order = shuffle(Array.from({ length: nQuestions }, function (_, i) { return i; }), rng);
    const optionOrders = order.map(function () {
      return shuffle(Array.from({ length: nOptions }, function (_, i) { return i; }), rng);
    });
    return { seat: seat, order: order, optionOrders: optionOrders };
  }
  function visibleFingerprint(copy, visibleCount) {
    const parts = [];
    for (let i = 0; i < visibleCount; i++) parts.push(copy.order[i] + ':' + copy.optionOrders[i].join(''));
    return parts.join('|');
  }
  function traceSeats(examSecret, seatCount, fingerprint, visibleCount, nQuestions, nOptions) {
    const matches = [];
    for (let seat = 1; seat <= seatCount; seat++) {
      const c = copyFor(examSecret, seat, nQuestions, nOptions);
      if (visibleFingerprint(c, visibleCount) === fingerprint) matches.push(seat);
    }
    return matches;
  }

  /* Answer key for one printed copy: which letter is correct on THIS copy, given its shuffled options. */
  function answerKeyFor(copy, questions) {
    return copy.order.map(function (qi, pos) {
      const q = questions[qi];
      if (q.correct === null || q.correct === undefined) return null;
      const letterIndex = copy.optionOrders[pos].indexOf(q.correct);
      return 'abcd'.charAt(letterIndex);
    });
  }

  function checkDigit(seat) {
    // Weighted sum of the three digits. Weights 3, 7, 1 share no factor with 10, so changing
    // any single digit always changes the result.
    const d = String(seat).padStart(3, '0').split('').map(Number);
    return (d[0] * 3 + d[1] * 7 + d[2]) % 10;
  }
  function copyId(seat) { return 'C' + String(seat).padStart(3, '0') + '-' + checkDigit(seat); }
  function verifyCopyId(id) {
    const m = /^C(\d{3})-(\d)$/.exec(id);
    return !!m && checkDigit(parseInt(m[1], 10)) === parseInt(m[2], 10);
  }

  /* ---------- Demo 4: hash-chained log ---------- */
  const GENESIS = '0'.repeat(64);

  async function sha256hex(text) {
    return toHex(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', enc.encode(text))));
  }
  async function entryHash(prev, e) {
    return sha256hex(prev + '|' + e.index + '|' + e.time + '|' + e.actor + '|' + e.action);
  }
  async function buildChain(entries) {
    const chain = []; let prev = GENESIS;
    for (const e of entries) {
      const h = await entryHash(prev, e);
      chain.push({ index: e.index, time: e.time, actor: e.actor, action: e.action, prev: prev, hash: h });
      prev = h;
    }
    return chain;
  }
  async function verifyChain(chain) {
    let prev = GENESIS;
    for (let i = 0; i < chain.length; i++) {
      const e = chain[i];
      if (e.prev !== prev) return { ok: false, firstBad: i, reason: 'link to previous entry broken' };
      if ((await entryHash(prev, e)) !== e.hash) return { ok: false, firstBad: i, reason: 'content does not match its fingerprint' };
      prev = e.hash;
    }
    return { ok: true, firstBad: -1, reason: '' };
  }
  async function rewriteFrom(chain, from) {
    const out = chain.map(function (e) { return Object.assign({}, e); });
    let prev = from === 0 ? GENESIS : out[from - 1].hash;
    for (let i = from; i < out.length; i++) {
      out[i].prev = prev;
      out[i].hash = await entryHash(prev, out[i]);
      prev = out[i].hash;
    }
    return out;
  }
  function headOf(chain) { return chain.length ? chain[chain.length - 1].hash : GENESIS; }


  /* ---------- Leak matching (investigator screen): word-overlap similarity ---------- */
  function tokens(text) {
    return new Set(String(text).toLowerCase().replace(/[^a-z0-9%\s]/g, ' ').split(/\s+/).filter(function (w) { return w.length > 1; }));
  }
  function similarity(a, b) {
    const A = tokens(a), B = tokens(b);
    if (A.size === 0 || B.size === 0) return 0;
    let inter = 0;
    A.forEach(function (w) { if (B.has(w)) inter++; });
    return inter / (A.size + B.size - inter);
  }
  /* Rank candidate texts by similarity to the leaked text. Returns [{index, score}] best first. */
  function matchLeak(leaked, candidates) {
    return candidates.map(function (c, i) { return { index: i, score: similarity(leaked, c) }; })
      .sort(function (x, y) { return y.score - x.score; });
  }

  return {
    xmur3, mulberry32, rngFrom, shuffle,
    SUBJECTS, QUOTAS, buildPool, drawPaper, exposure, expectedExposure, simulateDraws,
    P, makeShares, combine, secretToHex, deriveKey, seal, open, toHex, releaseCheck,
    copyFor, visibleFingerprint, traceSeats, answerKeyFor, checkDigit, copyId, verifyCopyId,
    GENESIS, sha256hex, buildChain, verifyChain, rewriteFrom, headOf,
    tokens, similarity, matchLeak,
  };
})();
export default LP;
