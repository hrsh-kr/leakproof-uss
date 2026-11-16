// The pipeline demo, without any screen. Each step does the real thing (secure random seed, SHA-256, AES-256-GCM,
// Shamir 3-of-5) on sample questions, and returns what the screen needs to animate. Tested in tests/pipeline.test.mjs.
import LP from './logic.mjs';
import { FILES } from './exam-bank.mjs';

export const K = 3, N = 5, OPTION_COUNT = 4;

export const HOLDERS = [
  { id: 'controller', role: 'Controller of Examinations' },
  { id: 'dean', role: 'Dean (Academics)' },
  { id: 'hod', role: 'Head of Department' },
  { id: 'registrar', role: 'Registrar' },
  { id: 'proctor', role: 'Chief Proctor' },
];

/* The blocks people drag. `needs` are the blocks that must come earlier. `why` are the short names of the mechanisms. */
export const BLOCKS = [
  { id: 'banks', label: 'Question files', sub: '10 setters × 10 topics', kind: 'data', needs: [],
    plain: 'Each of the 10 setters writes one question for every one of the 10 topics and hands in one file. We record a fingerprint of every file, so any later change is visible.',
    why: ['SHA-256 fingerprint', 'Files kept read-only'] },
  { id: 'draw', label: 'Random draw', sub: 'One question per topic', kind: 'data', needs: ['banks'],
    plain: 'For each topic, the computer picks one of the 10 setters\' questions, using a secret random seed made at that moment. No person chooses, so nobody can know the paper in advance.',
    why: ['128-bit secure random seed', 'Late draw', 'Auditors can replay it'] },
  { id: 'assemble', label: 'Build paper', sub: 'Ten questions, one paper', kind: 'data', needs: ['draw'],
    plain: 'The 10 chosen questions, one per topic, become one paper. It lives only in memory, and we record its fingerprint.',
    why: ['In memory only', 'SHA-256 fingerprint'] },
  { id: 'encrypt', label: 'Encrypt', sub: 'AES-256-GCM', kind: 'crypto', needs: ['assemble'],
    plain: 'The paper is locked with a fresh one-time key. Without the key it is only noise, and any tampering is detected.',
    why: ['AES-256-GCM', 'Fresh key and nonce', 'Tamper-evident'] },
  { id: 'split', label: 'Split the key', sub: 'Shamir, 3 of 5', kind: 'crypto', needs: ['encrypt'],
    plain: 'The key is cut into 5 pieces. Any 3 pieces rebuild it; any 2 reveal nothing at all. Then the whole key is wiped.',
    why: ['Shamir secret sharing', 'Threshold 3 of 5', 'Key wiped'] },
  { id: 'distribute', label: 'Hand out keys', sub: 'One piece per official', kind: 'people', needs: ['split'],
    plain: 'Each piece goes to a different official, so no one holds two. The locked paper goes to the exam centre, where it is useless on its own.',
    why: ['Separation of duties', 'Least privilege', 'Locked paper is not the key'] },
  { id: 'unlock', label: 'Unlock', sub: '3 of 5 officials approve', kind: 'people', needs: ['distribute'],
    plain: 'At the centre, officials approve with their key pieces. With fewer than 3 it really fails, and you will see it fail. The real system also checks the seating report and the print time window.',
    why: ['Quorum 3 of 5', 'Dual control', 'Fails closed'] },
  { id: 'print', label: 'Print at centre', sub: 'A different copy per seat', kind: 'output', needs: ['unlock'],
    plain: 'Only now is the paper printed, at the centre, shortly before the exam. Each seat gets its own order of questions and options, and a copy ID, so a leaked photo points to a seat.',
    why: ['Print after unlock', 'Per-seat order', 'Copy ID with check digit'] },
  { id: 'email', label: 'Email paper to printer', sub: 'Not allowed', kind: 'bad', needs: [], forbidden: 'This sends the readable paper out of the vault. Every leak starts with a step like this.',
    plain: 'Rejected. Sending the readable paper anywhere is exactly what this system is built to avoid.', why: [] },
];
export const BLOCK_BY_ID = Object.fromEntries(BLOCKS.map((b) => [b.id, b]));
export const ORDER = BLOCKS.filter((b) => !b.forbidden).map((b) => b.id);

/** Is this order of blocks safe and complete? Each block must come after the ones it needs. */
export function checkOrder(track) {
  const seen = new Set();
  const items = track.map((id) => {
    const b = BLOCK_BY_ID[id];
    if (!b) return { id, ok: false, why: 'Unknown block' };
    if (b.forbidden) return { id, ok: false, why: b.forbidden };
    const missing = b.needs.filter((n) => !seen.has(n));
    seen.add(id);
    return { id, ok: missing.length === 0, why: missing.length ? `Needs “${BLOCK_BY_ID[missing[0]].label}” first` : '' };
  });
  const absent = ORDER.filter((id) => !track.includes(id));
  const ok = items.every((i) => i.ok) && absent.length === 0;
  const message = ok ? 'Ready. Press Run.' : items.find((i) => !i.ok) ? items.find((i) => !i.ok).why : `Add ${absent.length} more block${absent.length === 1 ? '' : 's'} to finish the pipeline.`;
  return { ok, items, absent, message };
}

const enc = new TextEncoder();
const randomHex = (n) => LP.toHex(globalThis.crypto.getRandomValues(new Uint8Array(n)));

export function paperToText(paper) {
  return paper.map((q) => `${q.n}. ${q.text}\n   ` + q.options.map((o, j) => `${'ABCD'[j]}) ${o}`).join('  ')).join('\n');
}

/** One run of the pipeline. Call the steps in order. `banks` can be replaced for tests. */
export function createRun({ files = FILES, seed } = {}) {
  const log = [];
  let chain = [];
  const s = { files: null, seed: null, picks: null, paper: null, paperText: '', paperFp: '', secret: null, keyHex: null, iv: null, ciphertext: null, holders: null, unlocked: null, copies: {} };
  const topics = [...new Set(files.flatMap((f) => f.questions.map((q) => q.topic)))];
  async function note(actor, action) {
    log.push({ index: log.length, time: new Date().toISOString(), actor, action });
    chain = await LP.buildChain(log);
  }
  const need = (v, what) => { if (!v) throw new Error(`${what} has not happened yet`); };

  return {
    state: s,
    topics,
    get log() { return chain; },
    async banks() {
      const out = [];
      for (const f of files) out.push({ file: f.file, setter: f.setter, setterName: f.setterName, count: f.questions.length, fingerprint: await LP.sha256hex(JSON.stringify(f.questions)) });
      s.files = out;
      await note('Exam office', `Received ${out.length} setter files (one question per topic each) and recorded their fingerprints`);
      return { files: out, topics };
    },
    async draw() {
      need(s.files, 'Receiving the files');
      s.seed = seed || randomHex(16);
      s.picks = topics.map((topic) => {
        const cands = files.map((f) => f.questions.find((q) => q.topic === topic));
        const i = Math.floor(LP.rngFrom(s.seed + '|' + topic)() * cands.length);
        return { topic, index: i, id: cands[i].id, setter: cands[i].setter, candidates: cands.map((c) => c.id) };
      });
      await note('Exam software', `Drew ${s.picks.length} questions, one per topic (seed sealed for audit)`);
      return { seed: s.seed, picks: s.picks, poolSize: files.reduce((a, f) => a + f.questions.length, 0) };
    },
    async assemble() {
      need(s.picks, 'The draw');
      s.paper = s.picks.map((p, i) => {
        const q = files.flatMap((f) => f.questions).find((x) => x.id === p.id);
        return { n: i + 1, topic: p.topic, setter: p.setter, id: q.id, text: q.text, options: q.options, correct: q.correct };
      });
      s.paperText = paperToText(s.paper);
      s.paperFp = await LP.sha256hex(s.paperText);
      await note('Exam software', 'Built the paper in memory and recorded its fingerprint');
      return { paper: s.paper, fingerprint: s.paperFp, bytes: enc.encode(s.paperText).length };
    },
    async encrypt() {
      need(s.paper, 'Building the paper');
      s.secret = BigInt('0x' + randomHex(15));
      s.keyHex = LP.secretToHex(s.secret);          // kept only so the demo's admin view can show it
      s.iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
      s.ciphertext = await LP.seal(s.paperText, s.secret, s.iv);
      await note('Exam software', 'Encrypted the paper with a one-time key (AES-256-GCM)');
      return { ciphertext: s.ciphertext, ciphertextHex: LP.toHex(s.ciphertext), ivHex: LP.toHex(s.iv), bytes: s.ciphertext.length };
    },
    async split() {
      need(s.ciphertext, 'Encryption');
      const shares = LP.makeShares(s.secret, K, N);
      if (LP.combine(shares.slice(0, K)) !== s.secret) throw new Error('self-check failed: key pieces do not rebuild the key');
      s.secret = null;                                 // wipe the real key: only the pieces remain
      s.pieces = shares;
      await note('Exam software', `Split the key into ${N} pieces (any ${K} rebuild it) and wiped the whole key`);
      return { pieces: shares.map((p) => ({ x: p.x, hex: p.y.toString(16).padStart(32, '0') })) };
    },
    async distribute() {
      need(s.pieces, 'Splitting the key');
      s.holders = [];
      for (let i = 0; i < N; i++) {
        const hex = s.pieces[i].y.toString(16).padStart(32, '0');
        s.holders.push({ ...HOLDERS[i], x: s.pieces[i].x, hex, fingerprint: (await LP.sha256hex(hex)).slice(0, 8), share: s.pieces[i] });
      }
      s.pieces = null;
      await note('Exam software', `Gave one key piece to each of ${N} officials and sent the locked paper to the centre`);
      return { holders: s.holders.map(({ share, ...h }) => h) };
    },
    /** A real attempt: rebuild a key from the approving officials' pieces and try to open the paper with it. */
    async tryUnlock(xs) {
      need(s.holders, 'Handing out keys');
      const chosen = s.holders.filter((h) => xs.includes(h.x));
      const key = LP.combine(chosen.map((h) => h.share));
      const text = chosen.length ? await LP.open(s.ciphertext, key, s.iv) : null;
      if (text !== null) s.unlocked = text;
      await note(chosen.map((h) => h.role).join(', ') || 'Nobody', text !== null ? `${chosen.length} approvals: the paper opened` : `${chosen.length} approval${chosen.length === 1 ? '' : 's'}: refused, the paper stayed locked`);
      return { ok: text !== null, count: chosen.length, needed: K, text };
    },
    async print(seat) {
      need(s.unlocked, 'Unlocking');
      const copy = LP.copyFor(s.seed, seat, s.paper.length, OPTION_COUNT);
      const items = copy.order.map((qi, pos) => ({ pos: pos + 1, was: qi + 1, text: s.paper[qi].text, options: copy.optionOrders[pos].map((oi) => s.paper[qi].options[oi]) }));
      const sheet = { seat, id: LP.copyId(seat), items, key: LP.answerKeyFor(copy, s.paper), order: copy.order };
      s.copies[seat] = sheet;
      await note('Centre printer', `Printed copy ${sheet.id} for seat ${seat}`);
      return sheet;
    },
    async verifyLog() { return LP.verifyChain(chain); },
  };
}
