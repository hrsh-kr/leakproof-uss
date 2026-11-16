// The application: one route table, one middleware chain for every route.
//   rate limit -> session -> CSRF + origin -> capability (404 if none) -> body schema -> handler
import { rand, sha256, safeEqual, hashPassword, checkPassword, burnPasswordTime, generatePassphrase } from './crypto.mjs';
import { tx } from './db.mjs';
import { makeLog } from './log.mjs';
import { makeExams, Refusal, MIN_VERIFIED } from './exam.mjs';
import { BANK, TOPICS } from './bank.mjs';
import { send, readJson, cookies, HttpError, makeLimiter, SECURITY_HEADERS } from './http.mjs';

const IDLE = 30 * 60 * 1000, ABSOLUTE = 8 * 60 * 60 * 1000;
// Checked on the raw string BEFORE lower-casing: U+212A (Kelvin sign) lower-cases to "k" and would alias another account.
const USERNAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,31}$/;
const HIDDEN = /(?![\u200C\u200D])[\p{Cc}\p{Cf}]/u; // joiners stay: Devanagari, Persian and emoji need them
const HEALTH_CHECK_EVERY = 60_000;

export function createApp({ db, serverKey, logKey, config, now = Date.now, static: serveStatic }) {
  const log = makeLog(db, logKey, now);
  const exams = makeExams({ db, log, serverKey, now });
  const limit = makeLimiter();
  const failures = new Map(); // `${user}|${ip}` -> { n, until }
  const cookieName = config.devHttp ? 'lp_sid' : '__Host-lp_sid';
  const cookieAttrs = `; Path=/; HttpOnly; SameSite=Strict${config.devHttp ? '' : '; Secure'}`;

  // ---------- sessions ----------
  function startSession(accountId) {
    const sid = rand(32).toString('base64url');
    const csrf = rand(24).toString('base64url');
    db.prepare('INSERT INTO sessions (hash, account_id, csrf, created, seen) VALUES (?,?,?,?,?)').run(sha256(sid).toString('hex'), accountId, csrf, now(), now());
    return { cookie: `${cookieName}=${sid}${cookieAttrs}`, csrf };
  }
  function session(req) {
    const sid = cookies(req)[cookieName];
    if (!sid || sid.length > 100) return null;
    const hash = sha256(sid).toString('hex');
    const s = db.prepare('SELECT s.*, a.username, a.display, a.must_change FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.hash = ?').get(hash);
    if (!s) return null;
    if (now() - s.seen > IDLE || now() - s.created > ABSOLUTE) { db.prepare('DELETE FROM sessions WHERE hash = ?').run(hash); return null; }
    // Background polls are answered but do not count as activity, so an unattended screen still idles out.
    if (req.headers['x-lp-background'] !== '1') db.prepare('UPDATE sessions SET seen = ? WHERE hash = ?').run(now(), hash);
    return { ...s, hash };
  }
  const clearCookie = `${cookieName}=; Max-Age=0${cookieAttrs}`;

  // ---------- accounts ----------
  // Hashing is slow and asynchronous, so it happens first; the insert itself is synchronous (safe inside a transaction).
  async function newSecrets() {
    const passphrase = generatePassphrase(), recovery = generatePassphrase(3);
    return { passphrase, recovery, pw: await hashPassword(passphrase), rec: await hashPassword(recovery) };
  }
  function insertAccount(username, display, secrets, mustChange = false) {
    const accId = rand(16).toString('hex');
    db.prepare('INSERT INTO accounts (id, username, display, pw, recovery, simulated, created, must_change) VALUES (?,?,?,?,?,?,?,?)')
      .run(accId, username, display, secrets ? secrets.pw : '!', secrets ? secrets.rec : null, secrets ? 0 : 1, now(), mustChange ? 1 : 0);
    return { id: accId, passphrase: secrets?.passphrase, recovery: secrets?.recovery };
  }
  // mustChange: the operator saw these secrets (official setup), so the owner must replace them at first login.
  const createAccount = async (username, display, { mustChange = false } = {}) => insertAccount(username, display, await newSecrets(), mustChange);

  // A practice exam: 10 topics, 1 simulated TA with one question per topic, professor holds the single key card.
  function seedPracticeExam(accountId) {
    const examId = exams.createExam({ title: 'Practice exam: B.Tech CS core', topics: TOPICS, winStart: now() - 60_000,
      winEnd: now() + 14 * 24 * 3600_000, seatLimit: 60, practice: true });
    const j = rand(1)[0] % Math.min(...TOPICS.map((t) => BANK[t].length));
    const sim = insertAccount(`sim-${examId.slice(0, 8)}-1`, 'TA 1 (simulated)', null);
    exams.assign(sim.id, examId, 'submit');
    TOPICS.forEach((t, ti) => {
      const [text, right, ...wrong] = BANK[t][j];
      const options = [right, ...wrong].sort(() => rand(1)[0] - 128);
      exams.submit(examId, sim.id, { topic: ti, text, options, correct: options.indexOf(right) });
    });
    exams.assign(accountId, examId, 'run');
    exams.assign(accountId, examId, 'print');
    exams.assign(accountId, examId, 'hold', 1);
    return examId;
  }

  // ---------- helpers ----------
  const clientIp = (req) => {
    const direct = req.socket.remoteAddress || '';
    if (config.trustProxy && /^(::ffff:)?127\.0\.0\.1$|^::1$/.test(direct) && req.headers['x-real-ip']) return String(req.headers['x-real-ip']).slice(0, 64);
    return direct;
  };
  const str = (v, max) => (typeof v === 'string' && v.length <= max ? v : null);
  const int = (v) => (Number.isInteger(v) ? v : (typeof v === 'string' && /^\d{1,6}$/.test(v) ? Number(v) : NaN));
  const userName = (v) => { const raw = str(v, 64)?.trim(); return raw && USERNAME.test(raw) ? raw.toLowerCase() : null; };
  const notFound = () => { throw new HttpError(404, 'Not found'); };
  const examFromRelease = (rid) => (/^[0-9a-f]{32}$/.test(rid) ? db.prepare('SELECT exam_id FROM releases WHERE id = ?').get(rid)?.exam_id : null);

  function backoff(key) {
    const f = failures.get(key);
    if (f && f.until > now()) {
      const retry = Math.ceil((f.until - now()) / 1000);
      throw new HttpError(429, `Too many wrong attempts. Try again in ${retry} seconds.`, { retry });
    }
  }
  function fail(key) {
    const f = failures.get(key) || { n: 0, until: 0 };
    f.n++;
    if (f.n >= 5) f.until = now() + Math.min(15 * 60_000, 1000 * 2 ** (f.n - 5));
    if (failures.size > 50_000) failures.clear();
    failures.set(key, f);
  }

  function examSummary(acc, examId) {
    const exam = exams.mustExam(examId);
    const caps = exams.capsOf(acc.account_id, examId);
    const capSet = [...new Set(caps.map((c) => c.cap))];
    const slots = caps.filter((c) => c.cap === 'hold').map((c) => c.slot).sort();
    const cards = db.prepare('SELECT c.slot, c.verified, a.display FROM cards c JOIN accounts a ON a.id = c.holder_id WHERE c.exam_id = ? ORDER BY c.slot').all(examId);
    const last = db.prepare("SELECT id, state, seats, expires FROM releases WHERE exam_id = ? ORDER BY created DESC LIMIT 1").get(examId);
    const rel = last && { id: last.id, state: last.state === 'pending' && now() > last.expires ? 'expired' : last.state, seats: last.seats };
    const staff = capSet.includes('run') || capSet.includes('print');
    const out = {
      id: exam.id, title: exam.title, stage: exam.stage, practice: !!exam.practice, topics: exams.topicsOf(exam),
      window: { start: exam.win_start, end: exam.win_end }, seatLimit: exam.seat_limit, caps: capSet,
      myCards: slots.map((s) => ({ slot: s, verified: !!cards.find((c) => c.slot === s)?.verified, issued: !!cards.find((c) => c.slot === s) })),
      cardsVerified: cards.filter((c) => c.verified).length, minVerified: MIN_VERIFIED, release: rel || null, open: exams.isOpen(examId),
      setHash: exam.set_hash, serverNow: now(),
    };
    if (staff) {
      out.counts = exams.counts(examId);
      out.holders = (cards.length ? cards : db.prepare("SELECT asg.slot, NULL verified, a.display FROM assignments asg JOIN accounts a ON a.id = asg.account_id WHERE asg.exam_id = ? AND asg.cap = 'hold' ORDER BY asg.slot").all(examId))
        .map((c) => ({ slot: c.slot, display: c.display, verified: !!c.verified }));
      out.printed = db.prepare('SELECT seat, fetches FROM copies WHERE exam_id = ? ORDER BY seat').all(examId);
    }
    return out;
  }

  function waitingFor(acc) {
    const items = [];
    const mine = db.prepare('SELECT DISTINCT exam_id FROM assignments WHERE account_id = ?').all(acc.account_id);
    for (const { exam_id: examId } of mine) {
      const exam = exams.getExam(examId);
      const slots = exams.slotsOf(acc.account_id, examId);
      if (exam.stage !== 'COLLECTING' && slots.length) {
        const unverified = db.prepare(`SELECT slot FROM cards WHERE exam_id = ? AND holder_id = ? AND verified IS NULL`).all(examId, acc.account_id);
        for (const c of unverified) items.push({ examId, kind: 'verify', text: `Save and verify key card ${c.slot}` });
        const rel = db.prepare("SELECT id, expires FROM releases WHERE exam_id = ? AND state = 'pending'").get(examId);
        if (rel && rel.expires > now()) {
          const answered = db.prepare('SELECT slot FROM approvals WHERE release_id = ?').all(rel.id).map((a) => a.slot);
          for (const s of slots) if (!answered.includes(s)) items.push({ examId, kind: 'approve', releaseId: rel.id, text: `Release request waiting for card ${s}` });
        }
      }
    }
    return items;
  }

  // Deep health: the database answers and its pages are sound. quick_check is cached so a poller cannot make it a load.
  let degraded = null, checked = null;
  function health() {
    if (degraded) return { ok: false, reason: degraded };
    try {
      db.prepare('SELECT 1').get();
      if (!checked || now() - checked.at >= HEALTH_CHECK_EVERY) {
        const r = db.prepare('PRAGMA quick_check').get();
        checked = { at: now(), ok: r && Object.values(r)[0] === 'ok' };
      }
      return checked.ok ? { ok: true } : { ok: false, reason: 'database integrity check failed' };
    } catch { return { ok: false, reason: 'database not answering' }; }
  }

  // ---------- the route table (also read by the route-matrix test) ----------
  // auth: 'none' | 'session'. cap: capability needed on the exam in the path (missing => 404). practiceOnly: hidden in official.
  const R = (method, path, opts, handler) => ({ method, path, ...opts, handler });
  const routes = [
    R('GET', '/healthz', { auth: 'none' }, () => {
      const h = health();
      return h.ok ? { ok: true, instance: config.instance, mode: config.mode } : { status: 503, body: { ok: false, reason: h.reason } };
    }),
    R('POST', '/api/login', { auth: 'none', bucket: 'auth' }, async ({ body, req }) => {
      const username = userName(body.username), password = str(body.password, 200);
      if (!str(body.username, 64)?.trim() || !password) throw new HttpError(400, 'Enter your username and passphrase.');
      const key = `${username ?? '?'}|${clientIp(req)}`;
      backoff(key);
      const acc = username && db.prepare('SELECT * FROM accounts WHERE username = ?').get(username);
      const ok = acc && !acc.simulated ? await checkPassword(password, acc.pw) : await burnPasswordTime(password);
      if (!ok) { fail(key); throw new HttpError(401, 'Username or passphrase is wrong.'); }
      failures.delete(key);
      const old = session(req);
      if (old) db.prepare('DELETE FROM sessions WHERE hash = ?').run(old.hash); // a new login never reuses an old session
      const s = startSession(acc.id);
      return { status: 200, body: { csrf: s.csrf, display: acc.display }, headers: { 'Set-Cookie': s.cookie } };
    }),
    R('POST', '/api/logout', { auth: 'session', beforeChange: true }, ({ sess }) => {
      db.prepare('DELETE FROM sessions WHERE hash = ?').run(sess.hash);
      return { status: 200, body: { ok: true }, headers: { 'Set-Cookie': clearCookie } };
    }),
    R('POST', '/api/register', { auth: 'none', bucket: 'auth', practiceOnly: true }, async ({ body, req }) => {
      const invite = str(body.invite, 64) ?? '', username = userName(body.username), display = str(body.display, 60)?.trim();
      let role = str(body.role, 20)?.toLowerCase();
      // Backward compat: old invite code (USS-PRACTICE) with no role → professor (supports scripts and tests).
      if (!role && safeEqual(sha256(invite.trim().toUpperCase()), sha256(config.inviteCode.toUpperCase()))) role = 'professor';
      if (!['professor', 'ta', 'student'].includes(role)) throw new HttpError(400, 'Choose your role: professor, ta, or student.');
      const codeByRole = { professor: config.inviteCodeProf, ta: config.inviteCodeTa, student: config.inviteCodeStudent };
      const validCode = safeEqual(sha256(invite.trim().toUpperCase()), sha256(codeByRole[role].toUpperCase()))
        || (role === 'professor' && safeEqual(sha256(invite.trim().toUpperCase()), sha256(config.inviteCode.toUpperCase())));
      if (!validCode) throw new HttpError(403, 'That course code is not right for this role. Check the user guide.');
      if (!username || !USERNAME.test(username) || username.startsWith('sim-')) throw new HttpError(400, 'Username: 3 to 32 characters, lowercase letters, digits, dot, dash or underscore.');
      if (!display || display.length < 2) throw new HttpError(400, 'Enter a display name (2 to 60 characters).');
      if (HIDDEN.test(display)) throw new HttpError(400, 'The display name has an invisible or control character. Type plain text.');
      const daily = `register|${clientIp(req)}`, seen = limit.peek(daily);
      if (seen.n >= config.registerPerIp) throw new HttpError(429, `This network has created ${config.registerPerIp} practice accounts today. Try again later.`, { retry: seen.retry });
      const total = db.prepare('SELECT COUNT(*) n FROM accounts WHERE simulated = 0').get().n;
      if (total >= config.maxAccounts) throw new HttpError(503, 'Practice is full. Tell the team so they can raise the limit.');
      if (db.prepare('SELECT 1 FROM accounts WHERE username = ?').get(username)) throw new HttpError(409, 'That username is taken. Choose another.');
      const secrets = await newSecrets();
      // Checked again: another request may have taken the name while this one was hashing.
      if (db.prepare('SELECT 1 FROM accounts WHERE username = ?').get(username)) throw new HttpError(409, 'That username is taken. Choose another.');
      const { acc, examId } = tx(db, () => {
        const acc = insertAccount(username, display, secrets);
        let examId;
        if (role === 'professor') {
          examId = seedPracticeExam(acc.id);
        } else {
          const latest = db.prepare("SELECT id FROM exams WHERE stage = 'COLLECTING' AND practice = 1 ORDER BY created DESC LIMIT 1").get();
          if (!latest) throw new HttpError(503, 'No class is open for registration yet. Ask your professor to set up the exam first.');
          examId = latest.id;
          exams.assign(acc.id, examId, role === 'ta' ? 'submit' : 'attempt');
        }
        return { acc, examId };
      });
      limit(daily, config.registerPerIp, 24 * 3600_000); // only successful sign-ups count, so a shared network is not locked out by typos
      log.append(examId, acc.id, 'account.registered');
      const s = startSession(acc.id);
      return { status: 201, body: { csrf: s.csrf, passphrase: acc.passphrase, recovery: acc.recovery, examId, role }, headers: { 'Set-Cookie': s.cookie } };
    }),
    R('POST', '/api/recover', { auth: 'none', bucket: 'auth' }, async ({ body, req }) => {
      const username = userName(body.username), code = str(body.recovery, 64)?.trim().toLowerCase();
      if (!str(body.username, 64)?.trim() || !code) throw new HttpError(400, 'Enter your username and recovery code.');
      const key = `recover|${username ?? '?'}|${clientIp(req)}`;
      backoff(key);
      const acc = username && db.prepare('SELECT * FROM accounts WHERE username = ?').get(username);
      const ok = acc && acc.recovery ? await checkPassword(code, acc.recovery) : await burnPasswordTime(code);
      if (!ok) { fail(key); throw new HttpError(401, 'Username or recovery code is wrong.'); }
      failures.delete(key);
      const fresh = await newSecrets(), pass = fresh.passphrase, recovery = fresh.recovery;
      // The update only applies if the code is still the one we checked: two racing requests cannot both use it.
      const used = tx(db, () => {
        const r = db.prepare('UPDATE accounts SET pw = ?, recovery = ?, must_change = 0 WHERE id = ? AND recovery = ?').run(fresh.pw, fresh.rec, acc.id, acc.recovery);
        if (r.changes === 1) db.prepare('DELETE FROM sessions WHERE account_id = ?').run(acc.id);
        return r.changes === 1;
      });
      if (!used) throw new HttpError(401, 'Username or recovery code is wrong.');
      return { status: 200, body: { passphrase: pass, recovery } };
    }),
    R('POST', '/api/passphrase', { auth: 'session', bucket: 'sensitive', beforeChange: true }, async ({ body, req, sess }) => {
      const current = str(body.current, 200);
      if (!current) throw new HttpError(400, 'Enter your current passphrase.');
      const key = `pass|${sess.account_id}|${clientIp(req)}`;
      backoff(key);
      const acc = db.prepare('SELECT pw, must_change FROM accounts WHERE id = ?').get(sess.account_id);
      if (!(await checkPassword(current, acc.pw))) { fail(key); throw new HttpError(401, 'Your current passphrase is wrong.'); }
      failures.delete(key);
      const fresh = await newSecrets();
      const done = tx(db, () => {
        const r = db.prepare('UPDATE accounts SET pw = ?, recovery = ?, must_change = 0 WHERE id = ? AND pw = ?').run(fresh.pw, fresh.rec, sess.account_id, acc.pw);
        if (r.changes === 1) db.prepare('DELETE FROM sessions WHERE account_id = ? AND hash != ?').run(sess.account_id, sess.hash);
        return r.changes === 1;
      });
      if (!done) throw new HttpError(409, 'Your passphrase was changed by another request. Log in again.');
      log.append(null, sess.account_id, acc.must_change ? 'account.activated' : 'account.passphrase_changed', {});
      return { passphrase: fresh.passphrase, recovery: fresh.recovery };
    }),
    R('GET', '/api/me', { auth: 'session', beforeChange: true }, ({ sess }) => ({
      username: sess.username, display: sess.display, csrf: sess.csrf, instance: config.mode, name: config.instance, mustChange: !!sess.must_change,
      exams: db.prepare('SELECT DISTINCT e.id, e.title, e.stage, e.practice FROM exams e JOIN assignments a ON a.exam_id = e.id WHERE a.account_id = ? ORDER BY e.created DESC').all(sess.account_id),
      waiting: waitingFor(sess),
    })),
    R('GET', '/api/exams/:id', { auth: 'session', cap: 'any' }, ({ sess, params }) => examSummary(sess, params.id)),
    R('POST', '/api/exams/:id/questions', { auth: 'session', cap: 'submit' }, ({ sess, params, body }) => {
      const options = Array.isArray(body.options) ? body.options.slice(0, 5) : body.options;
      return { status: 201, body: { id: exams.submit(params.id, sess.account_id, { topic: int(body.topic), text: body.text, options, correct: int(body.correct) }) } };
    }),
    R('GET', '/api/exams/:id/questions', { auth: 'session', cap: 'submit|attempt' }, ({ sess, params }) => {
      if (exams.has(sess.account_id, params.id, 'attempt'))
        return { questions: exams.allQuestions(params.id) };
      return { questions: exams.myQuestions(params.id, sess.account_id) };
    }),
    R('DELETE', '/api/exams/:id/questions/:qid', { auth: 'session', cap: 'submit' }, ({ sess, params }) => {
      exams.deleteQuestion(params.id, sess.account_id, params.qid); return { ok: true };
    }),
    R('POST', '/api/exams/:id/seal', { auth: 'session', cap: 'run' }, ({ sess, params }) => exams.sealExam(params.id, sess.account_id)),
    R('GET', '/api/exams/:id/cards/:slot', { auth: 'session', cap: 'hold' }, ({ sess, params }) => ({ share: exams.fetchShare(params.id, sess.account_id, int(params.slot)) })),
    R('POST', '/api/exams/:id/cards/:slot/verify', { auth: 'session', cap: 'hold', bucket: 'sensitive' }, ({ sess, params, body }) =>
      exams.verifyShare(params.id, sess.account_id, int(params.slot), body.share)),
    R('POST', '/api/exams/:id/release', { auth: 'session', cap: 'print' }, ({ sess, params, body }) =>
      ({ status: 201, body: { id: exams.requestRelease(params.id, sess.account_id, int(body.seats)) } })),
    R('GET', '/api/releases/:rid', { auth: 'session', cap: 'print|hold', examFrom: 'rid' }, ({ sess, params, examId }) =>
      exams.releaseView(params.rid, { forCell: exams.has(sess.account_id, examId, 'print') })),
    R('POST', '/api/releases/:rid/decide', { auth: 'session', cap: 'hold', examFrom: 'rid', bucket: 'sensitive' }, ({ sess, params, body }) =>
      exams.decide(params.rid, sess.account_id, int(body.slot), { decision: body.decision, shareHex: body.share, typedWords: str(body.words, 100) })),
    R('GET', '/api/exams/:id/copies/:seat', { auth: 'session', cap: 'print' }, ({ sess, params }) => exams.copy(params.id, sess.account_id, int(params.seat))),
    R('POST', '/api/exams/:id/trace', { auth: 'session', cap: 'run', bucket: 'sensitive' }, ({ sess, params, body }) => exams.trace(params.id, sess.account_id, body.text)),
    R('GET', '/api/exams/:id/key/:seat', { auth: 'session', cap: 'run' }, ({ sess, params }) => exams.answerKey(params.id, sess.account_id, int(params.seat))),
    R('POST', '/api/practice/reset', { auth: 'session', practiceOnly: true }, ({ sess }) => {
      if (!db.prepare("SELECT 1 FROM assignments WHERE account_id = ? AND cap = 'run'").get(sess.account_id))
        throw new HttpError(403, 'Only the professor can start a new practice exam.');
      const own = db.prepare("SELECT e.id FROM exams e JOIN assignments a ON a.exam_id = e.id WHERE a.account_id = ? AND a.cap = 'run' AND e.practice = 1").all(sess.account_id);
      if (own.length >= 10) throw new HttpError(429, 'You have made 10 practice exams. That is the limit.');
      const examId = tx(db, () => seedPracticeExam(sess.account_id));
      return { status: 201, body: { examId } };
    }),
    R('GET', '/api/public/log/:id', { auth: 'none' }, ({ params }) => {
      if (!/^[0-9a-f]{32}$/.test(params.id) || !exams.getExam(params.id)) notFound();
      return { chain: log.status(), head: log.head(), total: log.countFor(params.id),
        entries: log.recent(params.id, 200).map((e) => ({ seq: e.seq, at: e.at, action: e.action, detail: JSON.parse(e.detail), hash: e.hash })),
        draw: exams.seedReveal(params.id) };
    }),
    R('POST', '/api/public/check-head', { auth: 'none', bucket: 'public' }, ({ body }) => {
      const h = str(body.head, 64)?.trim().toLowerCase();
      if (!h || !/^[0-9a-f]{64}$/.test(h)) throw new HttpError(400, 'Paste the 64-character head printed on a copy.');
      return { found: log.contains(h), chainOk: log.status().ok };
    }),
  ].map((r) => ({ ...r, re: new RegExp('^' + r.path.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$') }));

  // ---------- the one middleware chain ----------
  async function handle(req, res) {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    if (!config.devHttp) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    let url = null, ref;
    const over = (r, msg) => { if (!r.ok) throw new HttpError(429, msg, { retry: r.retry }); };
    try {
      try { url = new URL(req.url, 'http://x'); } catch { throw new HttpError(400, 'Bad request.'); }
      if (degraded && url.pathname !== '/healthz') throw new HttpError(503, 'The server found a problem with its own data and is not serving requests. Tell the operator.');
      if (!req.headers.host) throw new HttpError(400, 'Bad request.');
      if (!url.pathname.startsWith('/api/') && url.pathname !== '/healthz') {
        const f = (req.method === 'GET' || req.method === 'HEAD') && serveStatic?.(url.pathname);
        if (!f) throw new HttpError(404, 'Not found');
        res.writeHead(200, { 'Content-Type': f.type, 'Cache-Control': 'no-cache', 'Content-Length': f.body.length });
        return res.end(req.method === 'HEAD' ? undefined : f.body);
      }
      const ip = clientIp(req);
      over(limit(`all|${ip}`, config.globalPerMin, 60_000), 'Too many requests. Wait a minute and try again.');
      const route = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
      if (!route || (route.practiceOnly && config.mode !== 'practice')) throw new HttpError(404, 'Not found');
      if (route.bucket === 'auth') over(limit(`auth|${ip}`, config.authPerMin, 60_000), 'Too many attempts from this network. Wait a minute.');
      if (route.bucket === 'public') over(limit(`public|${ip}`, config.publicPerMin, 60_000), 'Too many checks from this network. Wait a minute.');
      const params = route.re.exec(url.pathname).groups || {};
      for (const v of Object.values(params)) if (!/^[0-9a-f]{32}$|^\d{1,4}$/.test(v)) throw new HttpError(404, 'Not found');

      let sess = null;
      if (route.auth === 'session') {
        sess = session(req);
        if (!sess) throw new HttpError(401, 'Please log in.');
        if (route.bucket === 'sensitive') over(limit(`sens|${sess.account_id}`, 60, 60_000), 'Too many attempts. Wait a minute.');
      }
      if (req.method !== 'GET') {
        const origin = req.headers.origin;
        const expected = config.origin || `${config.devHttp ? 'http' : 'https'}://${req.headers.host}`;
        if (origin && origin !== expected) throw new HttpError(403, 'Request blocked: it came from another site.');
        if (sess) {
          const t = String(req.headers['x-csrf-token'] || '');
          if (!safeEqual(Buffer.from(t), Buffer.from(sess.csrf))) throw new HttpError(403, 'Your session expired on this page. Reload and try again.');
        }
      }
      if (sess?.must_change && !route.beforeChange) throw new HttpError(403, 'Set your own passphrase first.', { extra: { mustChange: true } });
      let examId = null;
      if (route.cap) {
        examId = route.examFrom === 'rid' ? examFromRelease(params.rid) : params.id;
        if (!examId) notFound();
        const caps = exams.capsOf(sess.account_id, examId).map((c) => c.cap);
        const ok = route.cap === 'any' ? caps.length > 0 : route.cap.split('|').some((c) => caps.includes(c));
        if (!ok) notFound(); // no capability looks exactly like no such exam
      }
      const body = await readJson(req);
      const out = await route.handler({ req, sess, params, body, examId });
      const r = out && out.status ? out : { status: 200, body: out };
      return send(res, r.status, r.body, r.headers);
    } catch (e) {
      if (e instanceof Refusal || e instanceof HttpError) {
        const headers = { ...(e.status === 429 ? { 'Retry-After': String(e.retry || 60) } : {}), ...(e.close ? { Connection: 'close' } : {}) };
        return send(res, e.status, { error: e.message, ...(e.extra || {}) }, headers);
      }
      ref = rand(4).toString('hex');
      console.error(`[error ${ref}] ${req.method} ${url ? url.pathname : '?'}: ${e && e.message}`);
      return send(res, 500, { error: `Something went wrong. Quote reference ${ref} if you report it.` });
    }
  }

  return { handle, routes, health, setDegraded: (reason) => { degraded = reason; }, exams, log, createAccount, seedPracticeExam, db };
}
