// The exam pipeline: COLLECTING --seal--> SEALED --release (professor key card)--> RELEASED.
// Pure domain logic; HTTP and sessions live elsewhere. Every refusal says what failed and what to do next.
import { rand, sha256, hmac, seal as aeSeal, open as aeOpen, split, combine, safeEqual, Stream, SHARE_BYTES } from './crypto.mjs';
import { tx, checkpoint } from './db.mjs';
import { WORDS } from './words.mjs';

export const THRESHOLD = 1, HOLDERS = 1, MIN_VERIFIED = 1, MIN_SETTERS = 1, RELEASE_TTL = 15 * 60 * 1000, MAX_WORD_TRIES = 5;
export const MAX_OPEN = 200, OPEN_IDLE = 6 * 3600_000, REPRINT_LOGGED = 3;
const HIDDEN = /(?![\u200C\u200D])[\p{Cc}\p{Cf}]/u; // joiners stay: Devanagari, Persian and emoji need them

export class Refusal extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
const refuse = (msg, extra) => { throw new Refusal(409, msg, extra); };
const bad = (msg) => { throw new Refusal(400, msg); };
const id = () => rand(16).toString('hex');
const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const b32 = (buf, n) => [...buf].slice(0, n).map((b) => B32[b & 31]).join('');

export function makeExams({ db, log, serverKey, now = Date.now }) {
  const opened = new Map();   // examId -> { paper, copySecret, layouts } ; memory only, gone on restart
  // The paper in memory is bounded: at most MAX_OPEN papers, and one idle for OPEN_IDLE locks again (like a restart).
  const evict = (examId, reason) => {
    const st = opened.get(examId);
    if (!st) return;
    st.copySecret.fill(0); opened.delete(examId);
    for (const r of db.prepare("SELECT id FROM releases WHERE exam_id = ? AND state = 'open'").all(examId)) {
      db.prepare("UPDATE releases SET state = 'interrupted' WHERE id = ?").run(r.id);
      log.append(examId, 'system', 'release.interrupted', { release: r.id, reason });
    }
  };
  const getOpen = (examId) => {
    const st = opened.get(examId);
    if (st && now() - st.last > OPEN_IDLE) { evict(examId, 'idle'); return undefined; }
    return st;
  };
  const isOpen = (examId) => !!getOpen(examId);
  const pending = new Map();  // releaseId -> Map(slot -> share Buffer) ; memory only
  const wrongWords = new Map(); // `${releaseId}|${holderId}` -> wrong two-word attempts
  const drop = (rid) => { pending.get(rid)?.forEach((s) => s.fill(0)); pending.delete(rid); for (const k of wrongWords.keys()) if (k.startsWith(rid + '|')) wrongWords.delete(k); };
  const wrap = (buf, aad) => aeSeal(serverKey, buf, aad);
  const unwrap = (box, aad) => aeOpen(serverKey, Buffer.from(box), aad);

  const getExam = (examId) => db.prepare('SELECT * FROM exams WHERE id = ?').get(examId);
  const mustExam = (examId) => getExam(examId) || (() => { throw new Refusal(404, 'Not found'); })();
  const topicsOf = (exam) => JSON.parse(exam.topics);

  // Start-up: approvals held in memory and any open paper are gone, so those requests cannot finish. Say so instead of hanging.
  for (const r of db.prepare("SELECT id, exam_id FROM releases WHERE state IN ('pending', 'open')").all()) {
    db.prepare("UPDATE releases SET state = 'interrupted' WHERE id = ?").run(r.id);
    log.append(r.exam_id, 'system', 'release.interrupted', { release: r.id, reason: 'restart' });
    console.log(`release ${r.id} interrupted by restart`);
  }

  function createExam({ title, topics, winStart, winEnd, seatLimit, practice }) {
    const examId = id();
    db.prepare('INSERT INTO exams (id,title,stage,practice,topics,win_start,win_end,seat_limit,created) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(examId, title, 'COLLECTING', practice ? 1 : 0, JSON.stringify(topics), winStart, winEnd, seatLimit, now());
    log.append(examId, 'system', 'exam.created', { topics: topics.length, seats: seatLimit });
    return examId;
  }

  function assign(accountId, examId, cap, slot = null) {
    const exam = mustExam(examId);
    if (cap === 'hold') {
      if (!(slot >= 1 && slot <= 255)) throw new Error('slot must be 1..255');
      const taken = db.prepare("SELECT account_id FROM assignments WHERE exam_id = ? AND cap = 'hold' AND slot = ?").get(examId, slot);
      if (taken) throw new Error('card slot already assigned');
      // Official exams: one key card per account. Practice exams label several cards for one tester.
      const mine = db.prepare("SELECT 1 FROM assignments WHERE exam_id = ? AND cap = 'hold' AND account_id = ?").get(examId, accountId);
      if (mine && !exam.practice) throw new Error('one key card per account in the official instance');
    }
    db.prepare('INSERT INTO assignments (account_id, exam_id, cap, slot) VALUES (?,?,?,?)').run(accountId, examId, cap, slot);
  }

  const capsOf = (accountId, examId) => db.prepare('SELECT cap, slot FROM assignments WHERE account_id = ? AND exam_id = ?').all(accountId, examId);
  const has = (accountId, examId, cap) => capsOf(accountId, examId).some((c) => c.cap === cap);
  const slotsOf = (accountId, examId) => capsOf(accountId, examId).filter((c) => c.cap === 'hold').map((c) => c.slot).sort();

  // ---------- Setters ----------
  function validateQuestion(exam, q) {
    const topics = topicsOf(exam);
    if (!Number.isInteger(q.topic) || q.topic < 0 || q.topic >= topics.length) bad('Pick one of the listed topics.');
    const text = typeof q.text === 'string' ? q.text.trim() : '';
    if (text.length < 5 || text.length > 500) bad('The question must be 5 to 500 characters.');
    if (HIDDEN.test(text)) bad('The question has an invisible or control character (a line break, zero-width or direction mark). Type plain text.');
    if (!Array.isArray(q.options) || q.options.length !== 4) bad('Give exactly four options.');
    const options = q.options.map((o) => (typeof o === 'string' ? o.trim() : ''));
    if (options.some((o) => o.length < 1 || o.length > 200)) bad('Each option must be 1 to 200 characters.');
    if (options.some((o) => HIDDEN.test(o))) bad('An option has an invisible or control character (a line break, zero-width or direction mark). Type plain text.');
    if (new Set(options.map((o) => o.toLowerCase().replace(/[\u200C\u200D]/g, ''))).size !== 4) bad('The four options must all be different.');
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) bad('Mark which option is correct.');
    return { topic: q.topic, text, options, correct: q.correct };
  }

  function submit(examId, setterId, input, { by = setterId } = {}) {
    const exam = mustExam(examId);
    if (exam.stage !== 'COLLECTING') refuse('This exam is sealed. Questions can no longer be added.');
    const q = validateQuestion(exam, input);
    if (db.prepare('SELECT 1 FROM questions WHERE exam_id = ? AND topic = ? AND setter_id = ?').get(examId, q.topic, setterId))
      refuse('You already have a question for this topic. Delete it first to replace it.');
    const qid = id();
    const ct = wrap(Buffer.from(JSON.stringify(q)), `q|${examId}|${qid}`);
    db.prepare('INSERT INTO questions (id, exam_id, topic, setter_id, ct, created) VALUES (?,?,?,?,?,?)').run(qid, examId, q.topic, setterId, ct, now());
    log.append(examId, by, 'question.submitted', { count: 1 });
    return qid;
  }

  function myQuestions(examId, setterId) {
    return db.prepare('SELECT id, topic, ct, created FROM questions WHERE exam_id = ? AND setter_id = ? ORDER BY topic').all(examId, setterId)
      .map((r) => ({ id: r.id, topic: r.topic, created: r.created, sealed: !r.ct,
        ...(r.ct ? JSON.parse(unwrap(r.ct, `q|${examId}|${r.id}`)) : {}) }));
  }

  function allQuestions(examId) {
    const st = getOpen(examId);
    if (!st) throw new Refusal(423, 'The exam paper is not currently open. The professor needs to release it at exam time.');
    return st.paper.map((q, i) => ({ seq: i + 1, topic: q.topic, text: q.text, options: q.options }));
  }

  function deleteQuestion(examId, setterId, qid) {
    const exam = mustExam(examId);
    const row = db.prepare('SELECT setter_id FROM questions WHERE id = ? AND exam_id = ?').get(qid, examId);
    if (!row || row.setter_id !== setterId) throw new Refusal(404, 'Not found');
    if (exam.stage !== 'COLLECTING') refuse('This exam is sealed. Questions can no longer be changed.');
    db.prepare('DELETE FROM questions WHERE id = ?').run(qid);
    log.append(examId, setterId, 'question.deleted', { count: 1 });
  }

  // Counts only: the exam cell never sees question text.
  function counts(examId) {
    const exam = mustExam(examId);
    const rows = db.prepare('SELECT topic, COUNT(*) n, COUNT(DISTINCT setter_id) s FROM questions WHERE exam_id = ? GROUP BY topic').all(examId);
    return topicsOf(exam).map((name, i) => {
      const r = rows.find((x) => x.topic === i) || { n: 0, s: 0 };
      return { topic: i, name, questions: r.n, setters: r.s, ready: r.n >= 1 && r.s >= MIN_SETTERS };
    });
  }

  // ---------- Seal: one transaction ----------
  function sealExam(examId, actor) {
    const out = tx(db, () => {
      const exam = mustExam(examId);
      if (exam.stage !== 'COLLECTING') refuse('This exam is already sealed.');
      const c = counts(examId);
      const short = c.filter((t) => !t.ready);
      if (short.length) refuse(`Not ready: ${short.map((t) => t.name).join(', ')} need at least ${MIN_SETTERS} TA with a question.`, { topics: short.map((t) => t.topic) });
      const holders = db.prepare("SELECT account_id, slot FROM assignments WHERE exam_id = ? AND cap = 'hold' ORDER BY slot").all(examId);
      if (holders.length !== HOLDERS) refuse(`The professor key holder must be assigned before sealing (now ${holders.length}).`);

      // Draw: one question per topic, from candidates sorted by id, with a fresh random seed (revealed after release).
      const seed = rand(32);
      const pool = db.prepare('SELECT id, topic FROM questions WHERE exam_id = ? ORDER BY topic, id').all(examId);
      const drawn = draw(seed, pool, c.length);
      const paper = drawn.map((qid) => {
        const row = db.prepare('SELECT ct FROM questions WHERE id = ?').get(qid);
        const q = JSON.parse(unwrap(row.ct, `q|${examId}|${qid}`));
        return { id: qid, ...q };
      });
      const setHash = sha256(Buffer.from(JSON.stringify(paper.map((q) => [q.id, q.text, [...q.options].sort()])))).toString('hex').slice(0, 16);

      const paperKey = rand(32);
      const paperBox = aeSeal(paperKey, Buffer.from(JSON.stringify(paper)), `paper|${examId}`);
      const shares = split(paperKey, THRESHOLD, HOLDERS);
      paperKey.fill(0);
      const insCard = db.prepare('INSERT INTO cards (exam_id, slot, holder_id, share_wrapped, share_hash) VALUES (?,?,?,?,?)');
      holders.forEach((h, i) => {
        insCard.run(examId, h.slot, h.account_id, wrap(shares[i], `card|${examId}|${h.slot}`), sha256(shares[i]).toString('hex'));
        shares[i].fill(0);
      });
      const copySecret = rand(32);
      db.prepare("UPDATE exams SET stage = 'SEALED', paper = ?, seed = ?, copy_secret = ?, set_hash = ?, drawn = ? WHERE id = ?")
        .run(paperBox, wrap(seed, `seed|${examId}`), wrap(copySecret, `copy|${examId}`), setHash, JSON.stringify(drawn), examId);
      // The pool is gone: after this only the locked paper exists.
      db.prepare('UPDATE questions SET ct = NULL WHERE exam_id = ?').run(examId);
      log.append(examId, actor, 'exam.sealed', { questions: paper.length, setHash, seed: sha256(seed).toString('hex'), stage: 'SEALED' });
      return { setHash, questions: paper.length };
    });
    checkpoint(db);
    return out;
  }

  // ---------- Key cards: fetch, then verify-on-claim ----------
  function cardFor(examId, holderId, slot) {
    const card = db.prepare('SELECT * FROM cards WHERE exam_id = ? AND slot = ? AND holder_id = ?').get(examId, slot, holderId);
    if (!card) throw new Refusal(404, 'Not found');
    return card;
  }
  function fetchShare(examId, holderId, slot) {
    const card = cardFor(examId, holderId, slot);
    if (card.verified) refuse('This card is already verified. The server no longer holds a copy, so it cannot be shown again.');
    if (!log.has(examId, 'card.fetched', { slot })) log.append(examId, holderId, 'card.fetched', { slot });
    return unwrap(card.share_wrapped, `card|${examId}|${slot}`).toString('hex');
  }
  function verifyShare(examId, holderId, slot, shareHex) {
    const card = cardFor(examId, holderId, slot);
    if (card.verified) return { verified: true };
    const share = parseShare(shareHex);
    if (!safeEqual(sha256(share), Buffer.from(card.share_hash, 'hex')))
      refuse('That card does not match. Check you pasted the whole card and typed the same passphrase.');
    db.prepare('UPDATE cards SET share_wrapped = NULL, verified = ? WHERE exam_id = ? AND slot = ?').run(now(), examId, slot);
    log.append(examId, holderId, 'card.verified', { slot, verified: verifiedCount(examId) });
    checkpoint(db);
    return { verified: true };
  }
  const verifiedCount = (examId) => db.prepare('SELECT COUNT(*) n FROM cards WHERE exam_id = ? AND verified IS NOT NULL').get(examId).n;
  function parseShare(hex) {
    if (typeof hex !== 'string' || !/^[0-9a-f]+$/.test(hex) || hex.length !== SHARE_BYTES * 2) bad('That is not a valid card.');
    return Buffer.from(hex, 'hex');
  }

  // ---------- Release: request, gates, approvals ----------
  const words = (r) => { const h = sha256(Buffer.from(`${r.nonce}|${r.seats}|${r.exam_id}|${r.expires}`)); return [WORDS[h[0] & 127], WORDS[h[1] & 127]]; };
  const inWindow = (exam, t = now()) => t >= exam.win_start && t <= exam.win_end;
  // Relative times: the server's UTC clock and the reader's local clock never disagree about "in 3 h".
  const span = (ms) => { const m = Math.max(1, Math.floor(Math.abs(ms) / 60_000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
    return [d && `${d} d`, h && `${h} h`, m % 60 && `${m % 60} min`].filter(Boolean).join(' '); };
  const windowText = (exam) => {
    if (now() < exam.win_start) return `printing opens in ${span(exam.win_start - now())}.`;
    if (now() > exam.win_end) return `the print window closed ${span(now() - exam.win_end)} ago.${exam.practice ? ' Start a fresh practice exam from Home to try again.' : ''}`;
    return `printing is open for another ${span(exam.win_end - now())}.`;
  };

  function requestRelease(examId, actor, seats) {
    const exam = mustExam(examId);
    if (exam.stage === 'COLLECTING') refuse('Seal the exam first.');
    if (isOpen(examId)) refuse('The paper is already open. Print from the seat list.');
    if (!Number.isInteger(seats) || seats < 1) bad('Enter how many seats are occupied (a whole number).');
    if (seats > exam.seat_limit) refuse(`Gate G3 (seats): ${seats} is above this hall's limit of ${exam.seat_limit}.`, { gate: 'G3' });
    if (!inWindow(exam)) refuse(`Gate G2 (window): ${windowText(exam)}`, { gate: 'G2' });
    const v = verifiedCount(examId);
    if (v < MIN_VERIFIED) refuse(`The professor key card must be verified before release. Verify your key card first.`, { gate: 'cards' });
    for (const old of db.prepare("SELECT id FROM releases WHERE exam_id = ? AND state = 'pending'").all(examId)) drop(old.id);
    db.prepare("UPDATE releases SET state = 'replaced' WHERE exam_id = ? AND state = 'pending'").run(examId);
    const rid = id();
    db.prepare('INSERT INTO releases (id, exam_id, nonce, seats, expires, state, created) VALUES (?,?,?,?,?,?,?)')
      .run(rid, examId, rand(16).toString('hex'), seats, now() + RELEASE_TTL, 'pending', now());
    log.append(examId, actor, 'release.requested', { release: rid, seats });
    return rid;
  }

  const getRelease = (rid) => db.prepare('SELECT * FROM releases WHERE id = ?').get(rid);
  function releaseView(rid, { forCell = false } = {}) {
    const r = getRelease(rid);
    if (!r) throw new Refusal(404, 'Not found');
    const exam = mustExam(r.exam_id);
    const appr = db.prepare('SELECT a.slot, a.decision, acc.display FROM approvals a JOIN accounts acc ON acc.id = a.account_id WHERE a.release_id = ? ORDER BY a.slot').all(rid);
    const approved = appr.filter((a) => a.decision === 'approve');
    const holders = db.prepare('SELECT c.slot, acc.display, c.verified FROM cards c JOIN accounts acc ON acc.id = c.holder_id WHERE c.exam_id = ? ORDER BY c.slot').all(r.exam_id);
    const waiting = holders.filter((h) => h.verified && !appr.some((a) => a.slot === h.slot)).map((h) => `Card ${h.slot} (${h.display})`);
    const expired = r.state === 'pending' && now() > r.expires;
    const g1 = approved.length >= THRESHOLD, g2 = inWindow(exam), g3 = r.seats <= exam.seat_limit;
    let next;
    if (r.state === 'open') next = 'Paper is open. Print one copy per seat.';
    else if (r.state === 'refused') next = 'A key holder refused. Talk to them, then request release again.';
    else if (r.state === 'replaced') next = 'A newer request replaced this one.';
    else if (r.state === 'interrupted') next = 'The server restarted: request release again. Key holders approve again.';
    else if (r.state === 'failed') next = 'The two words were typed wrong too many times, so this request closed. Request release again.';
    else if (expired) next = 'This request expired after 15 minutes. Request release again.';
    else if (!g2) next = `Outside the print window: ${windowText(exam)}`;
    else next = `${approved.length} of ${THRESHOLD} approved. Waiting for: ${waiting.join(', ') || 'no verified card left'}.`;
    return {
      id: r.id, examId: r.exam_id, seats: r.seats, state: expired ? 'expired' : r.state, expires: r.expires,
      gates: { G1: { ok: g1, label: `Quorum: ${approved.length} of ${THRESHOLD} key cards` },
               G2: { ok: g2, label: 'Inside the print window' },
               G3: { ok: g3, label: `Seats: ${r.seats} of ${exam.seat_limit} allowed` } },
      approvals: appr.map((a) => ({ slot: a.slot, decision: a.decision, by: a.display })),
      next, head: log.head(),
      ...(forCell && r.state === 'pending' && !expired ? { words: words(r) } : {}),
    };
  }

  function decide(rid, holderId, slot, { decision, shareHex, typedWords }) {
    const r = getRelease(rid);
    if (!r) throw new Refusal(404, 'Not found');
    if (!slotsOf(holderId, r.exam_id).includes(slot)) throw new Refusal(404, 'Not found');
    if (r.state !== 'pending') refuse('This request is no longer open.');
    if (now() > r.expires) { drop(rid); refuse('This request expired after 15 minutes. Ask the exam cell to request again.'); }
    if (db.prepare('SELECT 1 FROM approvals WHERE release_id = ? AND slot = ?').get(rid, slot)) refuse('This card has already answered this request.');
    const card = cardFor(r.exam_id, holderId, slot);
    if (decision !== 'approve' && decision !== 'refuse') bad('Choose approve or refuse.');
    // Both answers need the two words, so only someone who can see the exam cell screen can approve or refuse.
    const wkey = `${rid}|${holderId}`;
    if ((wrongWords.get(wkey) || 0) >= MAX_WORD_TRIES) refuse('You typed the two words wrong 5 times for this request, so you are locked out of it. Ask the exam cell to press Start over with new words.');
    const expect = words(r);
    const typed = String(typedWords || '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
    if (typed.length !== 2 || typed[0] !== expect[0] || typed[1] !== expect[1]) {
      const n = (wrongWords.get(wkey) || 0) + 1;
      wrongWords.set(wkey, n);
      log.append(r.exam_id, holderId, 'release.words_failed', { release: rid, slot, count: n });
      if (n >= MAX_WORD_TRIES) {
        log.append(r.exam_id, holderId, 'release.holder_locked', { release: rid, slot, reason: 'words' });
        refuse('You typed the two words wrong 5 times for this request, so you are locked out of it. Ask the exam cell to press Start over with new words.');
      }
      refuse('The two words do not match the exam cell screen. Read them again from that screen.');
    }
    if (decision === 'refuse') {
      tx(db, () => {
        db.prepare('INSERT INTO approvals (release_id, slot, account_id, decision, at) VALUES (?,?,?,?,?)').run(rid, slot, holderId, 'refuse', now());
        db.prepare("UPDATE releases SET state = 'refused' WHERE id = ?").run(rid);
        log.append(r.exam_id, holderId, 'release.refused', { release: rid, slot });
      });
      drop(rid);
      return releaseView(rid);
    }
    if (!card.verified) refuse('Verify your card first (Key card section).');
    const share = parseShare(shareHex);
    if (!safeEqual(sha256(share), Buffer.from(card.share_hash, 'hex'))) refuse('That card does not match this exam.');

    const shares = pending.get(rid) || new Map();
    shares.set(slot, share); pending.set(rid, shares);
    db.prepare('INSERT INTO approvals (release_id, slot, account_id, decision, at) VALUES (?,?,?,?,?)').run(rid, slot, holderId, 'approve', now());
    log.append(r.exam_id, holderId, 'release.approved', { release: rid, slot, approved: shares.size, needed: THRESHOLD });
    if (shares.size >= THRESHOLD) openPaper(r, [...shares.values()]);
    return releaseView(rid);
  }

  function openPaper(r, shares) {
    const exam = mustExam(r.exam_id);
    let key;
    try {
      key = combine(shares);
      const paper = JSON.parse(aeOpen(key, Buffer.from(exam.paper), `paper|${exam.id}`));
      const copySecret = unwrap(exam.copy_secret, `copy|${exam.id}`);
      opened.set(exam.id, { paper, copySecret, layouts: [], seats: r.seats, last: now() });
      while (opened.size > MAX_OPEN) evict(opened.keys().next().value, 'evicted');
      tx(db, () => {
        db.prepare("UPDATE releases SET state = 'open' WHERE id = ?").run(r.id);
        db.prepare("UPDATE exams SET stage = 'RELEASED' WHERE id = ?").run(exam.id);
        log.append(exam.id, 'system', 'paper.opened', { release: r.id, seats: r.seats, drawn: JSON.parse(exam.drawn), stage: 'RELEASED' });
      });
    } catch (e) {
      log.append(exam.id, 'system', 'paper.open_failed', { release: r.id, reason: 'integrity' });
      throw new Refusal(409, 'Integrity check failed: the cards do not open this paper. Stop and call the auditor.');
    } finally {
      key?.fill(0); shares.forEach((s) => s.fill(0)); drop(r.id);
    }
  }

  // ---------- Copies ----------
  function layoutFor(state, seat) {
    // Seat order from an HMAC stream keyed by the copy secret; neighbouring seats never share the first three questions.
    for (let s = state.layouts.length + 1; s <= seat; s++) {
      const prev = state.layouts[s - 2];
      for (let c = 0; ; c++) {
        const st = new Stream(state.copySecret, `order|${s}|${c}`);
        const qOrder = st.shuffle(state.paper.map((_, i) => i));
        const lay = qOrder.map((qi) => ({ q: qi, opts: st.shuffle([0, 1, 2, 3]) }));
        if (prev && state.paper.length >= 4 && lay.slice(0, 3).every((x, i) => x.q === prev[i].q)) continue;
        state.layouts.push(lay); break;
      }
    }
    return state.layouts[seat - 1];
  }

  function openState(examId, seat) {
    const exam = mustExam(examId);
    const state = getOpen(examId);
    if (exam.stage !== 'RELEASED' || !state) refuse(exam.stage === 'RELEASED'
      ? 'The paper was locked again (the server restarted). Request release again; professor approves again.'
      : 'The paper is not open yet. The professor needs to release it.', { gate: 'G1' });
    if (!inWindow(exam)) refuse('Gate G2 (window): the print window has closed.', { gate: 'G2' });
    if (!Number.isInteger(seat) || seat < 1 || seat > state.seats) refuse(`Seats are numbered 1 to ${state.seats} for this release.`, { gate: 'G3' });
    state.last = now();
    return { exam, state };
  }
  const copyIdOf = (exam, state, seat) => b32(hmac(state.copySecret, 'copy-id', exam.id, String(seat), exam.set_hash), 8) + '-' + seat;

  function copy(examId, actor, seat) {
    const { exam, state } = openState(examId, seat);
    const prior = db.prepare('SELECT fetches FROM copies WHERE exam_id = ? AND seat = ?').get(examId, seat);
    if (prior) db.prepare('UPDATE copies SET fetches = fetches + 1 WHERE exam_id = ? AND seat = ?').run(examId, seat);
    else db.prepare('INSERT INTO copies (exam_id, seat, fetches, first_at) VALUES (?,?,?,?)').run(examId, seat, 1, now());
    const fetch = (prior?.fetches ?? 0) + 1;
    // The counter keeps counting; only the first few fetches of a seat add a log row, so reprints cannot grow the log without bound.
    const head = fetch <= REPRINT_LOGGED ? log.append(examId, actor, prior ? 'copy.reprinted' : 'copy.printed', { seat, fetch }) : log.head();
    const lay = layoutFor(state, seat);
    return {
      seat, title: exam.title,
      copyId: copyIdOf(exam, state, seat),
      questions: lay.map((x, n) => { const q = state.paper[x.q]; return { n: n + 1, text: q.text, options: x.opts.map((o) => q.options[o]) }; }),
      setHash: exam.set_hash, note: 'Same questions, same marks for every candidate. Only the order differs.',
      head, reprint: !!prior,
    };
  }

  // Marking key for one seat, in that seat's question order.
  function answerKey(examId, actor, seat) {
    const { exam, state } = openState(examId, seat);
    const lay = layoutFor(state, seat);
    log.append(examId, actor, 'key.viewed', { seat });
    return { seat, copyId: copyIdOf(exam, state, seat), answers: lay.map((x) => 'ABCD'[x.opts.indexOf(state.paper[x.q].correct)]) };
  }

  // ---------- Trace: which seat could this leaked fragment come from? ----------
  const norm = (s) => s.toLowerCase().replace(/^\s*(\(?[a-d1-9][0-9]?[.)]\s*)/, '').replace(/\s+/g, ' ').trim();
  function trace(examId, actor, text) {
    const exam = mustExam(examId);
    const state = getOpen(examId);
    if (exam.stage !== 'RELEASED' || !state) refuse('Trace works after release, while the paper is open.');
    if (typeof text !== 'string' || text.length > 8000) bad('Paste up to 8,000 characters of the leaked text.');
    const lines = text.split(/\r?\n/).map(norm).filter(Boolean);
    const frag = [];
    for (const line of lines) {
      const qi = state.paper.findIndex((q) => norm(q.text) === line);
      if (qi >= 0) { frag.push({ q: qi, opts: [] }); continue; }
      const cur = frag[frag.length - 1];
      if (!cur) continue;
      const oi = state.paper[cur.q].options.findIndex((o) => norm(o) === line);
      if (oi >= 0 && !cur.opts.includes(oi)) cur.opts.push(oi);
    }
    if (frag.length < 3) refuse(`Found ${frag.length} paper question(s) in that text. Paste at least 3 consecutive questions with their options.`);
    const matches = [];
    for (let seat = 1; seat <= state.seats; seat++) {
      const lay = layoutFor(state, seat);
      for (let k = 0; k + frag.length <= lay.length; k++) {
        const fits = frag.every((f, i) => lay[k + i].q === f.q && isSubsequence(f.opts, lay[k + i].opts));
        if (fits) { matches.push({ seat, from: k + 1, to: k + frag.length }); break; }
      }
    }
    // Count only: the public log must not point at a seat (a trace is a lead, not a verdict).
    log.append(examId, actor, 'trace.run', { fragment: frag.length, matches: matches.length });
    const base = 'A trace names a seat, not a person. It is a lead, not a verdict.';
    const withOpts = frag.some((f) => f.opts.length);
    const many = matches.length > 1 ? (withOpts ? `${matches.length} seats match; the pasted options do not narrow it to one. Paste more questions or options. ` : `${matches.length} seats match; paste the options as well for a single seat. `) : '';
    return { fragmentQuestions: frag.length, matches, note: many + base };
  }

  // Public after release: anyone can replay the draw.
  function seedReveal(examId) {
    const exam = mustExam(examId);
    if (exam.stage !== 'RELEASED') return null;
    const pool = db.prepare('SELECT id, topic FROM questions WHERE exam_id = ? ORDER BY topic, id').all(examId);
    return { seed: unwrap(exam.seed, `seed|${examId}`).toString('hex'), pool, drawn: JSON.parse(exam.drawn) };
  }

  return { createExam, assign, capsOf, has, slotsOf, getExam, mustExam, topicsOf, submit, myQuestions, allQuestions, deleteQuestion, counts,
    sealExam, fetchShare, verifyShare, verifiedCount, requestRelease, releaseView, decide, copy, answerKey, trace, seedReveal,
    isOpen, _opened: opened, _pending: pending };
}

const isSubsequence = (sub, seq) => { let i = 0; for (const x of seq) if (x === sub[i]) i++; return i === sub.length; };

// Replayable draw: anyone with the revealed seed and the pool's ids gets the same paper.
export function draw(seed, pool, topicCount) {
  const out = [];
  for (let t = 0; t < topicCount; t++) {
    const cands = pool.filter((p) => p.topic === t).map((p) => p.id).sort();
    out.push(cands[new Stream(seed, `draw|${t}`).below(cands.length)]);
  }
  return out;
}
