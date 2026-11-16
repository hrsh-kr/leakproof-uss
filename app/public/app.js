// LeakProof client. Plain modules, no framework. Every value from the server is rendered with textContent.
const main = document.getElementById('main');
const S = { me: null, csrf: null, timer: null, poll: null, instance: null, focusTab: null };

// sessionStorage can throw (private mode, blocked storage): every access is guarded.
const store = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch { /* ignore */ } },
  take(k) { const v = store.get(k); store.set(k, null); return v; },
};
const BACK = 'lp.back', FLASH = 'lp.flash';

// ---------- tiny DOM helper: builds nodes, never parses HTML ----------
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'value') el.value = v; // a textarea ignores the value attribute
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}

// ---------- polling: one timer at a time, only while the tab is visible, cleared on every page change ----------
function stopPolling() { clearInterval(S.timer); S.timer = null; S.poll = null; }
function poll(fn, ms) {
  stopPolling();
  let running = false;
  const run = async () => {
    if (running || document.visibilityState !== 'visible') return;
    running = true;
    try { await fn(); } catch { /* the next tick retries; a 401 or 403 is handled inside api() */ } finally { running = false; }
  };
  S.poll = run;
  S.timer = setInterval(run, ms);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.poll) S.poll(); });

function page(...kids) {
  stopPolling();
  main.replaceChildren(...kids.flat().filter(Boolean));
  main.removeAttribute('aria-busy');
  const h1 = main.querySelector('h1');
  document.title = h1 ? `${h1.textContent} · LeakProof` : 'LeakProof';
  main.focus({ preventScroll: true });
}
const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };
const toast = (msg) => { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3200); };
const status = (kind, text) => h('span', { class: 'st ' + kind }, h('span', { 'aria-hidden': 'true' }, kind === 'ok' ? '✓' : kind === 'bad' ? '✕' : '○'), text);
const errBox = () => h('p', { class: 'err', role: 'alert' });
const when = (t) => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
function dur(ms) {
  const m = Math.max(1, Math.round(ms / 60000)), d = Math.floor(m / 1440), hr = Math.floor((m % 1440) / 60), mi = m % 60;
  return [d ? `${d} d` : '', hr ? `${hr} h` : '', !d && mi ? `${mi} min` : ''].filter(Boolean).join(' ');
}
const waitText = (s) => (s < 90 ? `${s} seconds` : dur(s * 1000));
const copyText = (text, ok) => (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(new Error('no clipboard')))
  .then(() => { toast(ok); return true; }, () => { toast('Copy failed. Use Download, or select the text and copy it by hand.'); return false; });
let uid = 0;
// A labelled field. { reveal: true } adds a "Show passphrase" checkbox for password inputs.
const field = (label, input, hint, { reveal = false } = {}) => {
  input.id ||= `f${++uid}`;
  const wrap = h('div', {}, h('label', { for: input.id }, label, hint ? h('span', { class: 'muted' }, ' ', hint) : null), input);
  if (reveal) {
    const box = h('input', { type: 'checkbox', id: `${input.id}-show` });
    box.addEventListener('change', () => { input.type = box.checked ? 'text' : 'password'; });
    wrap.append(h('label', { class: 'check show', for: box.id }, box, 'Show passphrase'));
  }
  return wrap;
};
const pwInput = (autocomplete) => h('input', { type: 'password', autocomplete, spellcheck: false, autocapitalize: 'none' });
// Card text box plus a local file picker. The file is read on this device only; nothing is uploaded.
function cardField(label, slot) {
  const what = Array.isArray(slot) ? 'your card file' : `key card ${slot}`;
  const ta = h('textarea', { placeholder: `Paste ${what}, or load the saved file`, spellcheck: false });
  const file = h('input', { type: 'file', accept: '.txt,text/plain', class: 'visually-hidden', 'aria-label': `Load ${what}` });
  file.addEventListener('change', async () => { if (file.files[0]) ta.value = (await file.files[0].text()).trim(); });
  const wrap = field(label, ta);
  wrap.append(h('button', { type: 'button', class: 'link', onclick: () => file.click() }, 'Load card file…'), file);
  return { wrap, ta };
}

// ---------- API ----------
const OFFLINE = 'Cannot reach LeakProof right now: the server may be restarting. Try again in a few seconds. If you were sealing or approving, reload to see whether it went through.';
const AUTH_FORMS = ['/api/login', '/api/register', '/api/recover', '/api/passphrase'];
function fallbackError(res) {
  if (res.status === 429) {
    const s = Number(res.headers.get('Retry-After'));
    return `Too many requests from this network. Wait ${s > 0 && s < 86400 ? waitText(s) : 'a minute'} and try again.`;
  }
  if (res.status === 413) return 'That is too long for the server. Shorten it and try again.';
  if (res.status >= 502 && res.status <= 504) return OFFLINE;
  return 'Something went wrong. Reload the page and try again.';
}
function sessionEnded() {
  S.me = null; S.csrf = null;
  const here = location.hash;
  store.set(BACK, here && !/^#\/?(login|register|recover)?$/.test(here) ? here : null);
  store.set(FLASH, 'You were signed out: 30 minutes without activity, the 8-hour session limit, or your passphrase was changed elsewhere. Log in to continue where you were.');
  renderHeader();
  go('#/login');
}
// background: true marks a poll, so the server does not count it as activity (idle sign-out still works).
async function api(method, path, body, { background = false } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && S.csrf) headers['X-CSRF-Token'] = S.csrf;
  if (background) headers['X-LP-Background'] = '1';
  let res;
  try { res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' }); }
  catch { throw Object.assign(new Error(OFFLINE), { status: 0, data: {} }); }
  let data = {};
  try { data = await res.json(); } catch { /* not JSON: proxy error pages, empty bodies */ }
  if (!data || typeof data !== 'object') data = {};
  if (res.ok) return data;
  if (res.status === 401 && S.me && !AUTH_FORMS.includes(path)) sessionEnded();
  if (res.status === 403 && data.mustChange) { if (S.me) S.me.mustChange = true; if (location.hash !== '#/passphrase') location.hash = '#/passphrase'; }
  throw Object.assign(new Error(data.error || fallbackError(res)), { status: res.status, data });
}
// Wrap a button's action: busy label + aria-busy while running, errors shown where the user is looking.
// { confirm: 'Really delete?' } makes it two-step: the first click arms it for 8 seconds and announces it.
function action(btn, errEl, fn, { busy = 'Working…', confirm = null } = {}) {
  const label = btn.textContent;
  let armed = null;
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (btn.disabled) return;
    if (confirm && !armed) {
      btn.textContent = confirm; toast(confirm);
      armed = setTimeout(() => { armed = null; btn.textContent = label; }, 8000);
      return;
    }
    clearTimeout(armed); armed = null;
    errEl.textContent = '';
    btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.textContent = busy;
    try { await fn(); } catch (err) { errEl.textContent = err.message; }
    finally { btn.disabled = false; btn.removeAttribute('aria-busy'); btn.textContent = label; }
  });
  return btn;
}
async function loadMe() {
  try { S.me = await api('GET', '/api/me'); S.csrf = S.me.csrf; }
  catch (e) { if (e.status !== 401) throw e; S.me = null; S.csrf = null; }
  renderHeader();
}
function renderHeader() {
  document.getElementById('instance').textContent = { official: 'Official', practice: 'Practice', demo: 'Demo' }[S.me?.name || S.name] || '';
  document.getElementById('nav').replaceChildren(...(S.me ? [
    h('span', { class: 'muted small who', text: S.me.display }),
    h('a', { class: 'small', href: '#/passphrase' }, 'Change passphrase'),
    h('button', { class: 'link', onclick: async () => { await api('POST', '/api/logout').catch(() => {}); S.me = null; S.csrf = null; store.set(BACK, null); renderHeader(); go('#/login'); } }, 'Log out'),
  ] : []));
}

// ---------- key cards: encrypted on this device with a passphrase that never leaves it ----------
// A card file holds one line per card: LPCARD1.<base64url>. Each line is encrypted on its own.
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function cardKey(pass, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function makeCard(examId, slot, shareHex, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(`${examId}|${slot}`) }, await cardKey(pass, salt), enc.encode(shareHex)));
  return 'LPCARD1.' + b64(enc.encode(JSON.stringify({ e: examId, s: slot, salt: b64(salt), iv: b64(iv), c: b64(ct) })));
}
// Split pasted text into cards. A piece that does not start with LPCARD1. continues the previous card (wrapped lines).
function readCards(text) {
  const chunks = [];
  for (const t of String(text).split(/\s+/)) {
    if (!t) continue;
    if (t.startsWith('LPCARD1.') || !chunks.length) chunks.push(t); else chunks[chunks.length - 1] += t;
  }
  const out = [];
  for (const c of chunks) {
    try { const o = JSON.parse(dec.decode(unb64(c.replace(/^LPCARD1\./, '')))); if (o && typeof o === 'object') out.push(o); } catch { /* not a card */ }
  }
  return out;
}
async function openCard(text, examId, slot, pass) {
  const cards = readCards(text);
  if (!cards.length) throw new Error('That does not look like a LeakProof key card. Paste the whole text, starting with LPCARD1, or load the saved file.');
  const ours = cards.filter((c) => c.e === examId);
  if (!ours.length) throw new Error(cards.length > 1 ? 'These cards belong to a different exam.' : 'This card belongs to a different exam.');
  const c = ours.find((k) => k.s === slot);
  if (!c) {
    const have = ours.map((k) => k.s).join(', ');
    throw new Error(ours.length > 1 ? `This file holds key cards ${have}, not card ${slot}.` : `This is key card ${have}, not card ${slot}.`);
  }
  if (!pass) throw new Error('Type the card passphrase.');
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(c.iv), additionalData: enc.encode(`${examId}|${slot}`) }, await cardKey(pass, unb64(c.salt)), unb64(c.c));
    return dec.decode(pt);
  } catch { throw new Error(`Wrong passphrase for card ${slot}, or the card text is damaged.`); }
}
function checkNewPass(a, b) {
  if (a.length < 14) throw new Error('Use at least 14 characters. Anyone who steals the card file can guess the passphrase offline, so a short one is not enough.');
  if (/^(.)\1*$/u.test(a)) throw new Error('Do not repeat one character. Use a longer phrase that only you would know.');
  if (a !== b) throw new Error('The two passphrases are different.');
}
function download(name, text, type = 'text/plain') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text + '\n'], { type })), download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// A card is "saved" once Copy or Download was pressed. Verifying deletes the server's copy, so the first press warns.
function saveGuard() {
  let saved = false, warned = false;
  return {
    mark() { saved = true; },
    check() {
      if (saved || warned) return;
      warned = true;
      throw new Error('You have not saved this card. Verifying deletes the server\'s copy. Press again to verify anyway.');
    },
  };
}
const CRYPTO_BUSY = { busy: 'Working… (a few seconds)' };

// ---------- pages: sign-in ----------
function loginPage() {
  const u = h('input', { autocomplete: 'username', autocapitalize: 'none', spellcheck: false, required: true });
  const p = pwInput('current-password');
  const err = errBox();
  const flash = store.take(FLASH);
  const btn = action(h('button', { class: 'primary', type: 'submit' }, 'Log in'), err, async () => {
    await api('POST', '/api/login', { username: u.value, password: p.value });
    await loadMe();
    go(store.take(BACK) || '#/');
  });
  const form = h('form', { class: 'card narrow', onsubmit: (e) => e.preventDefault() }, h('h1', {}, 'Log in'),
    flash ? h('p', { class: 'warn', role: 'status', text: flash }) : null,
    h('p', { class: 'muted' }, 'Run a leak-resistant exam: TAs submit questions, professor seals and holds the key, students view released questions.'),
    field('Username', u), field('Passphrase', p, null, { reveal: true }), err, h('div', { class: 'row' }, btn),
    h('p', { class: 'small muted' }, h('a', { href: '#/recover' }, 'Forgot your passphrase?'),
      S.mode === 'practice' ? [' · ', h('a', { href: '#/register' }, 'Join a class')] : null, ' · ', h('a', { href: '/help.html' }, 'Help and rules')));
  page(form); u.focus();
}

function secretsShown(title, passphrase, recovery, next) {
  const ok = h('input', { type: 'checkbox', id: 'saved' });
  let saved = false;
  const guardUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
  const release = () => { window.removeEventListener('beforeunload', guardUnload); window.removeEventListener('hashchange', release); };
  window.addEventListener('beforeunload', guardUnload);
  window.addEventListener('hashchange', release);
  const go2 = h('button', { class: 'primary', disabled: true, onclick: () => { release(); return Promise.resolve(next()).catch((e) => toast(e.message)); } }, 'Continue');
  const sync = () => { go2.disabled = !(saved && ok.checked); };
  ok.addEventListener('change', sync);
  const markSaved = () => { saved = true; sync(); };
  const text = `LeakProof\nPassphrase: ${passphrase}\nRecovery code: ${recovery}`;
  page(h('div', { class: 'card narrow' }, h('h1', {}, title),
    h('p', {}, 'This is the only time these are shown. Save them in a password manager or download them.'),
    h('div', { class: 'secret' }, h('div', { class: 'tag' }, 'Secret: shown once'),
      h('p', {}, 'Passphrase: ', h('code', { text: passphrase })), h('p', {}, 'Recovery code: ', h('code', { text: recovery })),
      h('p', { class: 'small muted' }, 'The recovery code lets you set a new passphrase if you lose this one.')),
    h('div', { class: 'row' }, h('button', { onclick: () => copyText(text, 'Copied').then((r) => r && markSaved()) }, 'Copy both'),
      h('button', { onclick: () => { download('leakproof-login.txt', text); markSaved(); } }, 'Download')),
    h('label', { class: 'check', for: 'saved' }, ok, 'I have saved my passphrase and recovery code'),
    h('p', { class: 'small muted' }, 'Continue unlocks after you press Copy both or Download and tick the box.'), go2));
}

function registerPage() {
  const inv = h('input', { autocomplete: 'off' });
  const roleSelect = h('select', {},
    h('option', { value: 'professor' }, 'Professor'),
    h('option', { value: 'ta' }, 'Teaching Assistant (TA)'),
    h('option', { value: 'student' }, 'Student'));
  const u = h('input', { autocapitalize: 'none', spellcheck: false, autocomplete: 'username' });
  const d = h('input', { autocomplete: 'nickname' });
  const err = errBox();
  const btn = action(h('button', { class: 'primary', type: 'submit' }, 'Join class'), err, async () => {
    const r = await api('POST', '/api/register', { invite: inv.value, role: roleSelect.value, username: u.value, display: d.value });
    S.csrf = r.csrf;
    secretsShown('Your account is ready', r.passphrase, r.recovery, async () => { await loadMe(); go(`#/exam/${r.examId}`); });
  });
  page(h('form', { class: 'card narrow', onsubmit: (e) => e.preventDefault() }, h('h1', {}, 'Join a class'),
    h('p', { class: 'muted' }, 'Practice the LeakProof exam pipeline with your class.'),
    field('Course code', inv, h('a', { href: '/help.html' }, '(where do I find it?)')),
    field('Role', roleSelect),
    field('Username', u), h('p', { class: 'small muted' }, 'Username: 3 to 32 characters, lowercase letters, digits, dot, dash or underscore.'),
    field('Display name', d), err, btn,
    h('p', { class: 'small muted' }, h('a', { href: '#/login' }, 'I already have an account'))));
  inv.focus();
}

function recoverPage() {
  const u = h('input', { autocapitalize: 'none', autocomplete: 'username' }), c = h('input', { autocomplete: 'off', spellcheck: false });
  const err = errBox();
  const btn = action(h('button', { class: 'primary', type: 'submit' }, 'Set a new passphrase'), err, async () => {
    const r = await api('POST', '/api/recover', { username: u.value, recovery: c.value });
    secretsShown('New passphrase', r.passphrase, r.recovery, () => { go('#/login'); });
  });
  page(h('form', { class: 'card narrow', onsubmit: (e) => e.preventDefault() }, h('h1', {}, 'Forgot your passphrase'),
    h('p', { class: 'muted' }, 'Use the recovery code you saved when the account was made. Every session is signed out.'),
    field('Username', u), field('Recovery code', c), err, btn, h('p', { class: 'small muted' }, h('a', { href: '#/login' }, 'Back to log in'))));
  u.focus();
}

// Forced (mustChange) or voluntary passphrase change. The server generates the new passphrase.
function passphrasePage(forced) {
  const cur = pwInput('current-password');
  const err = errBox();
  const btn = action(h('button', { class: 'primary', type: 'submit' }, 'Get a new passphrase'), err, async () => {
    if (!cur.value) throw new Error('Type your current passphrase.');
    const r = await api('POST', '/api/passphrase', { current: cur.value });
    cur.value = '';
    if (S.me) S.me.mustChange = false;
    secretsShown('Your new passphrase', r.passphrase, r.recovery, async () => { await loadMe(); go(store.take(BACK) || '#/'); });
  });
  page(h('form', { class: 'card narrow', onsubmit: (e) => e.preventDefault() }, h('h1', {}, forced ? 'New passphrase' : 'Change passphrase'),
    h('p', { class: 'muted' }, forced
      ? 'This account was set up by the exam operator, who saw its first passphrase and recovery code. Type that passphrase once more. LeakProof then gives you a new passphrase and recovery code that only you see.'
      : 'Type your current passphrase. LeakProof then gives you a new generated passphrase and a new recovery code, shown once.'),
    h('p', { class: 'small muted' }, 'Your other sessions are signed out; this one stays.'),
    field('Current passphrase', cur, null, { reveal: true }), err, h('div', { class: 'row' }, btn),
    forced ? h('p', { class: 'small muted' }, 'Nothing else opens until this is done.') : h('p', { class: 'small muted' }, h('a', { href: '#/' }, 'Cancel'))));
  cur.focus();
}

// ---------- home ----------
const waitingList = (me) => (me.waiting.length
  ? h('ul', { class: 'list' }, me.waiting.map((w) => h('li', { class: 'spread' }, status('wait', w.text), h('a', { href: `#/exam/${w.examId}/${w.kind === 'approve' || w.kind === 'verify' ? 'cards' : ''}` }, 'Open'))))
  : h('p', { class: 'muted' }, 'Nothing needs you right now.'));
const examsList = (me) => (me.exams.length
  ? h('ul', { class: 'list' }, me.exams.map((e) => h('li', { class: 'spread' }, h('a', { href: `#/exam/${e.id}` }, e.title), stagePill(e.stage))))
  : h('p', { class: 'muted' }, 'You have no exams yet. The exam cell adds you to one.'));
async function homePage() {
  await loadMe();
  const me = S.me;
  if (!me) return;
  const err = errBox();
  const newBtn = me.instance === 'practice' ? action(h('button', {}, 'Start a fresh practice exam'), err, async () => {
    const r = await api('POST', '/api/practice/reset'); location.hash = `#/exam/${r.examId}`;
  }) : null;
  const waitBox = h('div', { 'aria-live': 'polite' }, waitingList(me));
  const examBox = h('div', {}, examsList(me));
  page(h('h1', {}, `Hello, ${me.display}`),
    h('div', { class: 'card' }, h('h2', {}, 'Waiting for you'), waitBox, h('p', { class: 'small muted' }, 'This list refreshes every 10 seconds.')),
    h('div', { class: 'card' }, h('div', { class: 'spread' }, h('h2', {}, 'Your exams'), newBtn), err, examBox));
  let sig = JSON.stringify([me.waiting, me.exams]);
  // Update only the two lists, so focus and scroll position stay where they are.
  poll(async () => {
    const m = await api('GET', '/api/me', null, { background: true });
    if (m.mustChange) { S.me = m; go('#/passphrase'); return; }
    const now = JSON.stringify([m.waiting, m.exams]);
    if (now === sig) return;
    sig = now; S.me = m; S.csrf = m.csrf;
    waitBox.replaceChildren(waitingList(m)); examBox.replaceChildren(examsList(m));
  }, 10000);
}
const stagePill = (s) => status(s === 'RELEASED' ? 'ok' : 'wait', { COLLECTING: 'Collecting questions', SEALED: 'Sealed', RELEASED: 'Released' }[s]);

// ---------- exam ----------
const STAGES = [['COLLECTING', 'Collect', 'TAs submit questions; professor reviews'], ['SEALED', 'Seal', 'Paper drawn and locked; professor holds the key'], ['RELEASED', 'Release', 'Professor opens paper; students view questions']];
const minVerified = (x) => x.minVerified ?? 4;
const serverNow = (x) => x.serverNow ?? Date.now();
// Any release state other than pending and open means "request again". Each gets a plain reason.
const RELEASE_ENDED = {
  refused: 'A key holder refused this request. Nothing was opened. Talk to them, then request release again.',
  replaced: 'A newer request replaced this one.',
  expired: 'This request expired after 15 minutes without enough approvals. Request release again.',
  interrupted: 'The server restarted while this request was open, so it was closed. Request release again.',
  failed: 'The two words were typed wrong too many times, so this request was closed. Request release again and read the words slowly.',
};
const endedText = (state, fallback) => RELEASE_ENDED[state] || fallback || `This request is ${state}. Request release again.`;
function windowNote(x) {
  const now = serverNow(x);
  if (now < x.window.start) return `print window opens in ${dur(x.window.start - now)}`;
  if (now > x.window.end) return 'print window closed';
  return `print window open, closes in ${dur(x.window.end - now)}`;
}
function nextStep(x) {
  const has = (c) => x.caps.includes(c);
  const mine = x.myCards.filter((c) => c.issued && !c.verified);
  const minV = minVerified(x);
  if (has('attempt')) {
    if (x.stage !== 'RELEASED') return ['view', 'Wait for the professor to seal and release the exam.'];
    if (x.open) return ['view', 'The exam is open. View your questions below.'];
    return ['view', 'The exam was released but the paper is locked (server restarted). Ask the professor to re-open it.'];
  }
  if (x.stage === 'COLLECTING') {
    if (has('run')) {
      const short = x.counts.filter((t) => !t.ready).length;
      return short ? ['cell', `${short} topic(s) need at least 1 TA question before sealing.`] : ['cell', 'Every topic is ready. Seal the exam to draw and lock the paper.'];
    }
    return ['questions', 'Add one question per topic you teach, before the exam is sealed.'];
  }
  if (x.open) return has('print') ? ['cell', 'The paper is open. Print one copy per seat, then try Trace with three questions copied from a copy.'] : ['cards', 'The paper is released.'];
  if (x.release?.state === 'pending' && has('hold') && x.myCards.some((c) => c.verified)) return ['cards', 'A release request is waiting. Type the two words from the professor screen and approve with your key card.'];
  if (mine.length) return ['cards', `Save and verify your key card. Release is locked until it is verified.`];
  if (x.stage === 'SEALED' || (x.stage === 'RELEASED' && !x.open)) {
    if (x.release?.state === 'pending' && has('hold')) return ['cards', 'A release request is waiting. Type the two words and approve with your key card.'];
    if (has('print')) return x.cardsVerified < minV ? ['cell', `Waiting for the professor to verify their key card (${x.cardsVerified} of 1 verified).`]
      : x.release?.state === 'pending' ? ['cell', 'Read the two words to the professor. They must approve with their key card.'] : ['cell', x.stage === 'RELEASED' ? 'The server restarted, so the paper locked again. Request release again.' : 'Inside the print window, enter the seat count and request release.'];
    return ['cards', 'Your card is verified. Wait for a release request.'];
  }
  return has('print') ? ['cell', 'The paper is open. Print one copy per seat, then try Trace with three questions copied from a copy.'] : ['cards', 'The paper is released.'];
}

async function examPage(id, tab) {
  let x;
  try { x = await api('GET', `/api/exams/${id}`); } catch (e) {
    if (e.status === 401 || e.data?.mustChange) return;
    return page(h('div', { class: 'card' }, h('h1', {}, 'Exam not available'), h('p', {}, e.status === 404 ? 'This exam does not exist, or you have no role in it.' : e.message), h('a', { href: '#/' }, 'Back home')));
  }
  const [defTab, next] = nextStep(x);
  const tabs = [x.caps.includes('run') || x.caps.includes('print') ? ['cell', 'Professor'] : null,
    x.caps.includes('submit') ? ['questions', 'My questions'] : null,
    x.caps.includes('hold') ? ['cards', 'Key card'] : null,
    x.caps.includes('attempt') ? ['view', 'Exam questions'] : null,
    ['log', 'Log']].filter(Boolean);
  const cur = tabs.some((t) => t[0] === tab) ? tab : tabs.some((t) => t[0] === defTab) ? defTab : tabs[0][0];
  const idx = STAGES.findIndex((s) => s[0] === x.stage);
  const open = (k) => { const to = `#/exam/${id}/${k}`; if (location.hash === to) examPage(id, k); else location.hash = to; };
  const tabBtns = tabs.map(([k, label]) => h('button', { role: 'tab', id: `tab-${k}`, 'aria-selected': String(k === cur), 'aria-controls': 'tabpanel', tabindex: k === cur ? '0' : '-1', onclick: () => open(k) }, label));
  const tablist = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Exam sections' }, tabBtns);
  tablist.addEventListener('keydown', (e) => {
    const i = tabs.findIndex((t) => t[0] === cur);
    const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (j === undefined) return;
    e.preventDefault();
    const k = tabs[(j + tabs.length) % tabs.length][0];
    S.focusTab = k; open(k);
  });
  const body = h('div', { role: 'tabpanel', id: 'tabpanel', 'aria-labelledby': `tab-${cur}` });
  page(
    h('h1', {}, x.title),
    h('p', { class: 'muted small' }, `Print window ${when(x.window.start)} to ${when(x.window.end)} (your local time) · up to ${x.seatLimit} seats`),
    h('p', { class: 'muted small' }, `${x.serverNow ? `Server time ${when(x.serverNow)}` : `Now ${when(Date.now())}`} · ${windowNote(x)}`),
    h('ol', { class: 'stages', 'aria-label': 'Exam stage' }, STAGES.map((s, i) => h('li', { class: i < idx ? 'done' : i === idx ? 'now' : '', 'aria-current': i === idx ? 'step' : null }, h('b', {}, `${i + 1}. ${s[1]}`), s[2]))),
    h('div', { class: 'next' }, h('b', {}, 'Next step'), next),
    tablist, body);
  document.title = `${x.title} · ${tabs.find((t) => t[0] === cur)[1]} · LeakProof`;
  if (S.focusTab === cur) { tabBtns[tabs.findIndex((t) => t[0] === cur)].focus(); }
  S.focusTab = null;
  const render = { cell: cellTab, questions: questionsTab, cards: cardsTab, view: studentTab, log: logTab }[cur];
  await render(x, body);
}
// Keep the address in step with the tab shown, without firing hashchange (else that tab's button becomes dead).
const refresh = (x, tab) => { history.replaceState(null, '', `#/exam/${x.id}/${tab}`); return examPage(x.id, tab); };
const gateItems = (gates) => Object.entries(gates).map(([g, v]) => h('li', {}, status(v.ok ? 'ok' : 'wait', g), v.label));

// --- Exam cell: readiness, seal, release, print, trace ---
async function cellTab(x, body) {
  const err = errBox();
  if (x.stage === 'COLLECTING') {
    const ready = x.counts.every((t) => t.ready);
    const sealBtn = h('button', { class: 'primary', disabled: !ready || !x.caps.includes('run') }, 'Seal the exam');
    const hide = () => { confirm.hidden = true; sealBtn.focus(); };
    const cancel = h('button', { type: 'button', onclick: hide }, 'Cancel');
    const yes = action(h('button', { class: 'primary' }, 'Yes, seal it'), err, async () => { const r = await api('POST', `/api/exams/${x.id}/seal`); toast(`Sealed. Set hash ${r.setHash}`); refresh(x, 'cards'); });
    const confirm = h('div', { hidden: true, class: 'warn', role: 'group', 'aria-label': 'Confirm sealing' },
      h('p', {}, h('b', {}, 'Seal now? '), 'This draws one question per topic, locks the paper under a new key held by the professor, and deletes every other question. It cannot be undone.'),
      h('div', { class: 'pair' }, yes, cancel));
    confirm.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); hide(); } });
    // Focus lands on Cancel, so Enter or a double press cannot seal by accident.
    sealBtn.addEventListener('click', () => { confirm.hidden = false; confirm.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); cancel.focus({ preventScroll: true }); });
    body.append(h('div', { class: 'card' }, h('h2', {}, 'Question pool'), h('p', { class: 'muted small' }, 'Counts only. The exam cell never sees question text.'),
      h('div', { class: 'scroll' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Topic'), h('th', {}, 'Questions'), h('th', {}, 'Setters'), h('th', {}, 'Status'))),
        h('tbody', {}, x.counts.map((t) => h('tr', {}, h('td', {}, t.name), h('td', {}, t.questions), h('td', {}, t.setters), h('td', {}, t.ready ? status('ok', 'Ready') : status('wait', 'Needs 1 TA'))))))),
      h('h3', {}, 'Key holder'), holdersList(x),
      h('div', { class: 'row' }, sealBtn, ready ? null : h('span', { class: 'muted small' }, 'Every topic needs at least 1 question from a TA.')), confirm, err));
    return;
  }
  const minV = minVerified(x);
  body.append(h('div', { class: 'card' }, h('div', { class: 'spread' }, h('h2', {}, 'Key card'), status(x.cardsVerified >= minV ? 'ok' : 'wait', `${x.cardsVerified} of 1 verified`)),
    holdersList(x), h('p', { class: 'small muted' }, `Release unlocks once the professor key card is verified.`)));
  if (x.open) return printAndTrace(x, body);
  const rel = x.release;
  if (rel && rel.state === 'pending' && x.caps.includes('print')) return releaseWatch(x, body, rel.id);
  const now = serverNow(x);
  const blocked = x.cardsVerified < minV ? `Locked until ${minV} of 5 cards are verified (${x.cardsVerified} so far).`
    : now < x.window.start ? `The print window opens in ${dur(x.window.start - now)} (${when(x.window.start)}). Reload then.`
      : now > x.window.end ? `The print window closed at ${when(x.window.end)}.${x.practice ? ' Start a fresh practice exam from the home page.' : ''}` : null;
  const seats = h('input', { type: 'number', min: 1, max: x.seatLimit, value: Math.min(30, x.seatLimit), inputmode: 'numeric' });
  const reason = h('span', { class: 'muted small', id: 'release-reason', text: blocked || '' });
  const go2 = action(h('button', { class: 'primary', disabled: !!blocked, 'aria-describedby': blocked ? 'release-reason' : null }, 'Request release'), err, async () => {
    await api('POST', `/api/exams/${x.id}/release`, { seats: Number(seats.value) }); refresh(x, 'cell');
  });
  const last = rel && rel.state !== 'pending'
    ? (rel.state === 'open' ? 'The server restarted, so the paper locked again. Request release again.' : `Last request: ${rel.state}. ${endedText(rel.state)}`) : null;
  body.append(h('div', { class: 'card' }, h('h2', {}, 'Release for printing'),
    x.caps.includes('print') ? [h('p', { class: 'muted' }, 'Enter how many seats are occupied. Then approve the release with your professor key card.'),
      field('Occupied seats', seats, `(1 to ${x.seatLimit})`), h('div', { class: 'row' }, go2, reason), err] : h('p', { class: 'muted' }, 'Only the exam cell can request release.'),
    last ? h('p', { class: 'small muted' }, last) : null));
}
function holdersList(x) {
  return h('ul', { class: 'list' }, (x.holders || []).map((c) => h('li', { class: 'spread' }, `Card ${c.slot} · ${c.display}`,
    x.stage === 'COLLECTING' ? h('span', { class: 'muted small' }, 'issued at sealing') : c.verified ? status('ok', 'Verified') : status('wait', 'Not verified yet'))));
}
// The release screen: built once; each poll updates only the status region, so focus is never lost.
async function releaseWatch(x, body, rid) {
  const err = errBox(), againErr = errBox();
  const wordsP = h('p', { class: 'words' });
  const wordsBox = h('div', { class: 'secret' }, h('div', { class: 'tag' }, 'Read these to the key holders'), wordsP,
    h('p', { class: 'small muted' }, 'Only this screen shows them. A key holder types them to prove they are approving this exact request.'));
  const gates = h('ul', { class: 'gates' }), nextP = h('p', {});
  const live = h('div', { role: 'status', 'aria-live': 'polite' }, gates, nextP);
  const expires = h('p', { class: 'small muted' }), head = h('p', { class: 'small muted' }), again = h('div', { class: 'row' });
  const restart = h('div', { class: 'row' }, action(h('button', {}, 'Start over with new words'), againErr, async () => {
    await api('POST', `/api/exams/${x.id}/release`, { seats: x.release?.seats }); refresh(x, 'cell');
  }));
  body.append(h('div', { class: 'card' }, h('h2', {}, 'Release request'), wordsBox, live, expires, head, restart, again, againErr, err));
  let last = '';
  const draw = async (background) => {
    let r;
    try { r = await api('GET', `/api/releases/${rid}`, null, { background }); } catch (e) { err.textContent = e.message; return; }
    err.textContent = '';
    if (r.state === 'open') { stopPolling(); return refresh(x, 'cell'); }
    const closed = r.state !== 'pending';
    const sig = JSON.stringify([r.state, r.gates, r.next, r.head]);
    if (sig === last) return;
    last = sig;
    wordsBox.hidden = closed || !r.words;
    restart.hidden = closed;
    if (r.words) wordsP.textContent = r.words.join(' ');
    gates.replaceChildren(...gateItems(r.gates));
    nextP.replaceChildren(h('b', {}, closed ? endedText(r.state, r.next) : r.next));
    expires.textContent = closed ? '' : `Expires ${when(r.expires)}. This box updates every 5 seconds.`;
    head.replaceChildren('Log head now: ', h('code', { text: r.head || '' }), '. Key holders see this value on their approval screen too; it moves whenever anything is logged, so it can differ by a few seconds.');
    if (closed) {
      stopPolling();
      if (!again.firstChild) again.append(action(h('button', { class: 'primary' }, 'Request release again'), againErr, async () => {
        await api('POST', `/api/exams/${x.id}/release`, { seats: r.seats }); refresh(x, 'cell');
      }));
    }
  };
  await draw(false);
  if (!again.firstChild) poll(() => draw(true), 5000);
}
function printAndTrace(x, body) {
  const printed = new Map((x.printed || []).map((p) => [p.seat, p.fetches]));
  const seats = x.release?.seats || 0;
  const isRun = x.caps.includes('run');
  const openTab = (path) => window.open(path, '_blank', 'noopener');
  const copyBtn = (s) => h('button', { class: printed.has(s) ? 'done' : '', onclick: () => openTab(`#/copy/${x.id}/${s}`),
    'aria-label': `Seat ${s}${printed.has(s) ? ', printed' : ''}` }, (printed.has(s) ? '✓ ' : '') + (printed.get(s) > 1 ? `${s} ×${printed.get(s)}` : String(s)));
  body.append(h('div', { class: 'card' }, h('div', { class: 'spread' }, h('h2', {}, 'Print copies'), status('ok', `${printed.size} of ${seats} seats printed`)),
    h('p', { class: 'muted' }, 'Pick a seat to open its copy in a new tab. Each seat has its own order of the same questions. The first print of a seat is logged; reprints are counted and only the first three are logged.'),
    isRun ? h('p', { class: 'small muted' }, 'Key, under each seat, opens the answer key for that seat’s order, ready to print for marking.') : null,
    h('div', { class: 'seats' }, Array.from({ length: seats }, (_, i) => i + 1).map((s) => (isRun
      ? h('div', { class: 'seat' }, copyBtn(s), h('button', { class: 'keybtn', onclick: () => openTab(`#/key/${x.id}/${s}`), 'aria-label': `Answer key for seat ${s}` }, 'Key'))
      : copyBtn(s))))));
  if (!isRun) return;
  const t = h('textarea', { placeholder: 'Paste the questions with their options, at least 3 in a row, as they appear on the leaked copy.', 'aria-label': 'Text from the leaked copy' });
  const out = h('div'), err = errBox();
  const go2 = action(h('button', { class: 'primary' }, 'Trace'), err, async () => {
    out.replaceChildren();
    const r = await api('POST', `/api/exams/${x.id}/trace`, { text: t.value });
    out.replaceChildren(h('p', {}, `Recognised ${r.fragmentQuestions} paper questions.`),
      r.matches.length ? h('ul', { class: 'list' }, r.matches.map((m) => h('li', {}, status('wait', `Seat ${m.seat}`), ` matches questions ${m.from} to ${m.to} on that copy`)))
        : status('ok', 'No seat matches this order.'), h('p', { class: r.matches.length > 1 ? 'small' : 'small muted', text: r.note }));
  });
  body.append(h('div', { class: 'card' }, h('h2', {}, 'Trace a leak'), h('p', { class: 'muted' }, 'The order of the questions and their options identifies the copy, even if the header is cropped off. Paste the questions with their options: without options, several seats can match.'),
    t, h('div', { class: 'row' }, go2), err, out),
  h('div', { class: 'card' }, h('h2', {}, 'Check the draw'),
    h('p', { class: 'muted' }, 'After release the draw seed is public on the log page, with the question pool and the drawn ids, so anyone can replay the draw and confirm it was fair.'),
    h('a', { class: 'btn', href: `#/log/${x.id}` }, 'Open the public log')));
}

// --- Setter ---
async function questionsTab(x, body) {
  const { questions } = await api('GET', `/api/exams/${x.id}/questions`);
  const mine = new Set(questions.map((q) => q.topic));
  const list = h('div', { class: 'card' }, h('h2', {}, `My questions (${questions.length})`),
    questions.length ? h('ul', { class: 'list' }, questions.map((q) => {
      const err = errBox();
      return h('li', {}, h('div', { class: 'spread' }, h('b', {}, x.topics[q.topic]),
        q.sealed ? status('ok', 'Sealed') : action(h('button', { class: 'link danger-link' }, 'Delete'), err, async () => { await api('DELETE', `/api/exams/${x.id}/questions/${q.id}`); toast('Deleted'); refresh(x, 'questions'); }, { confirm: 'Really delete? Click again' })),
        q.sealed ? h('p', { class: 'small muted' }, 'Locked at sealing. Its text was deleted from the server.') : [h('p', { text: q.text }), h('ol', { class: 'os' }, q.options.map((o, i) => h('li', {}, o, i === q.correct ? h('span', { class: 'muted' }, '  (correct)') : null)))], err);
    })) : h('p', { class: 'muted' }, 'None yet.'));
  if (x.stage !== 'COLLECTING') { body.append(h('div', { class: 'next' }, 'This exam is sealed. Questions can no longer change.'), list); return; }
  const free = x.topics.map((t, i) => [t, i]).filter(([, i]) => !mine.has(i));
  const topic = h('select', {}, free.map(([t, i]) => h('option', { value: String(i) }, t)));
  const text = h('textarea', { maxlength: 500, placeholder: 'Write the question' });
  const opts = [0, 1, 2, 3].map((i) => h('input', { maxlength: 200, 'aria-label': `Option ${'ABCD'[i]}` }));
  const radios = [0, 1, 2, 3].map((i) => h('input', { type: 'radio', name: 'correct', value: String(i), 'aria-label': `Option ${'ABCD'[i]} is correct` }));
  const err = errBox();
  const save = action(h('button', { class: 'primary' }, 'Submit question'), err, async () => {
    const correct = radios.findIndex((r) => r.checked);
    if (correct < 0) throw new Error('Mark which option is correct (the round button).');
    await api('POST', `/api/exams/${x.id}/questions`, { topic: Number(topic.value), text: text.value, options: opts.map((o) => o.value), correct });
    toast('Question received. It is stored encrypted.'); refresh(x, 'questions');
  });
  body.append(free.length ? h('div', { class: 'card' }, h('h2', {}, 'Add a question'), h('p', { class: 'muted small' }, 'One per topic. It is encrypted as soon as it arrives; only you can read it back.'),
    field('Topic', topic), field('Question', text, '(up to 500 characters)'), h('label', {}, 'Options ', h('span', { class: 'muted' }, '(select the correct one)')),
    h('div', { class: 'opts' }, opts.map((o, i) => h('div', { class: 'opt' }, radios[i], h('b', {}, 'ABCD'[i]), o))), h('div', { class: 'row' }, save), err)
    : h('div', { class: 'next' }, 'You have a question for every topic.'), list);
}

// --- Student: view released exam questions ---
async function studentTab(x, body) {
  if (x.stage !== 'RELEASED' || !x.open) {
    const msg = x.stage === 'COLLECTING' ? 'Questions are still being collected. The exam has not been sealed yet.'
      : x.stage === 'SEALED' ? 'The exam is sealed. The professor will release it at exam time.'
      : 'The exam was released but the paper is locked (server restarted). Ask the professor to re-open it.';
    body.append(h('div', { class: 'card' }, h('h2', {}, 'Exam questions'), h('p', { class: 'muted' }, msg)));
    return;
  }
  const err = errBox();
  const loadingP = h('p', { class: 'muted' }, 'Loading…');
  body.append(h('div', { class: 'card' }, h('h2', {}, 'Exam questions'), loadingP, err));
  let qs;
  try {
    const r = await api('GET', `/api/exams/${x.id}/questions`);
    qs = r.questions;
  } catch (e) { loadingP.remove(); err.textContent = e.message; return; }
  body.querySelector('.card').replaceChildren(
    h('h2', {}, 'Exam questions'),
    h('p', { class: 'muted small' }, `${qs.length} question${qs.length !== 1 ? 's' : ''} · ${x.topics.length} topics`),
    ...qs.map((q) => h('div', { class: 'card' },
      h('p', {}, h('b', {}, `Q${q.seq}. `), h('span', { text: q.text })),
      h('ol', { type: 'A' }, q.options.map((opt) => h('li', { text: opt }))))));
}

// --- Key holder ---
async function cardsTab(x, body) {
  if (x.stage === 'COLLECTING') { body.append(h('div', { class: 'card' }, h('h2', {}, 'Your key card'), h('p', { class: 'muted' }, `Your key card is issued when the exam is sealed.`))); return; }
  const notice = h('div', { class: 'next notice', role: 'status', 'aria-live': 'polite' });
  body.append(notice);
  if (x.release?.state === 'pending') {
    let rel = null;
    try { rel = await api('GET', `/api/releases/${x.release.id}`); } catch (e) { body.append(h('p', { class: 'err', role: 'alert', text: `Could not load the release request: ${e.message}` })); }
    if (rel && rel.state === 'pending') {
      const answered = new Set(rel.approvals.map((a) => a.slot));
      const open = x.myCards.filter((c) => c.verified && !answered.has(c.slot));
      body.append(h('div', { class: 'card' }, h('h2', {}, 'Release request waiting'),
        h('p', {}, `The exam cell asks to open the paper for ${rel.seats} seats. ${rel.next}`),
        h('ul', { class: 'gates' }, gateItems(rel.gates)),
        h('p', { class: 'small muted' }, 'Log head now: ', h('code', { text: rel.head || '' }), '. The exam cell screen shows the same value, give or take a few seconds (it moves whenever anything is logged).'),
        open.length > 1 ? h('p', { class: 'small muted' }, 'If you saved all your cards in one file, load that same file in each form: the right card is picked from it.') : null,
        open.length ? open.map((c) => approveForm(x, rel, c.slot)) : h('p', { class: 'muted' }, 'Your cards have answered this request.')));
    }
  }
  const unverified = x.myCards.filter((c) => c.issued && !c.verified).map((c) => c.slot);
  const verifiedCards = x.myCards.filter((c) => c.verified).map((c) => h('div', { class: 'card' }, h('div', { class: 'spread' }, h('h2', {}, `Key card ${c.slot}`), status('ok', 'Verified')),
    h('p', { class: 'muted small' }, 'Keep the card file and its passphrase, and bring both to the release, inside the print window. The server no longer has a copy and cannot show it again.')));
  if (unverified.length >= 2) {
    body.append(bulkCards(x, unverified),
      h('details', { class: 'more' }, h('summary', {}, 'Or create and verify one card at a time'), unverified.map((s) => claimForm(x, s))));
  } else body.append(...unverified.map((s) => claimForm(x, s)));
  body.append(...verifiedCards);
  watchCards(x, body, notice);
}
// Key cards refresh every 10 s, but never wipe what the user is typing or a card shown on screen.
function watchCards(x, body, notice) {
  const sig = (y) => JSON.stringify([y.stage, y.open, y.release?.id, y.release?.state, y.myCards.map((c) => c.verified)]);
  const before = sig(x);
  poll(async () => {
    const y = await api('GET', `/api/exams/${x.id}`, null, { background: true });
    if (sig(y) === before) return;
    const active = document.activeElement;
    const busy = [...body.querySelectorAll('input:not([type=checkbox]):not([type=file]), textarea')].some((el) => el.value)
      || (body.contains(active) && active.matches('input, textarea, select'));
    if (!busy) return refresh(x, 'cards');
    if (notice.firstChild) return;
    const msg = y.release?.state === 'pending' && x.release?.state !== 'pending' ? 'A release request is now waiting.' : 'This page is out of date.';
    notice.append(h('b', {}, 'Something changed'), msg, ' ', h('button', { class: 'link', onclick: () => refresh(x, 'cards') }, 'Show it now'), ' (what you typed here will be cleared).');
  }, 10000);
}
// Several unverified cards: one passphrase, one file, one verify step. Each card is still encrypted on its own.
function bulkCards(x, slots) {
  const box = h('div', { class: 'card' }, h('div', { class: 'spread' }, h('h2', {}, `All my cards (${slots.join(', ')})`), status('wait', `${slots.length} not verified yet`)));
  const err = errBox();
  const p1 = pwInput('new-password'), p2 = pwInput('new-password');
  const step1 = h('div', {}, h('p', { class: 'muted' }, `Step 1 of 2. Create key cards ${slots.join(', ')} together, protected by one passphrase and saved in one file. The passphrase never leaves this device; the cards are encrypted here.`),
    field('Passphrase for all these cards', p1, '(14+ characters)', { reveal: true }), field('Type it again', p2, null, { reveal: true }));
  const make = action(h('button', { class: 'primary' }, 'Create all my cards'), err, async () => {
    checkNewPass(p1.value, p2.value);
    const lines = [];
    for (const s of slots) { const { share } = await api('GET', `/api/exams/${x.id}/cards/${s}`); lines.push(await makeCard(x.id, s, share, p1.value)); }
    p1.value = p2.value = '';
    showFile(lines.join('\n'));
  }, CRYPTO_BUSY);
  step1.append(h('div', { class: 'row' }, make), err);
  box.append(step1);
  function showFile(file) {
    const name = `leakproof-cards-${slots.join('-')}.txt`;
    const ta = h('textarea', { readonly: true, value: file, 'aria-label': 'Your encrypted key cards, one per line' });
    const pasteF = cardField('Card file', slots), paste = pasteF.ta;
    const pp = pwInput('off');
    const verr = errBox(), guard = saveGuard();
    const verify = action(h('button', { class: 'primary' }, `Verify all ${slots.length} cards`), verr, async () => {
      guard.check();
      const shares = [];
      for (const s of slots) shares.push([s, await openCard(paste.value, x.id, s, pp.value)]);
      const done = [];
      for (const [s, share] of shares) {
        try { await api('POST', `/api/exams/${x.id}/cards/${s}/verify`, { share }); done.push(s); }
        catch (e) { throw new Error(`${done.length ? `Cards ${done.join(', ')} are verified. ` : ''}Card ${s} was not: ${e.message}`); }
      }
      toast(`Cards ${done.join(', ')} verified. The server deleted its copies.`); refresh(x, 'cards');
    }, CRYPTO_BUSY);
    step1.replaceWith(h('div', {}, h('div', { class: 'secret' }, h('div', { class: 'tag' }, `Secret: key cards ${slots.join(', ')}`), ta,
      h('div', { class: 'row' }, h('button', { onclick: () => copyText(file, 'Cards copied').then((ok) => ok && guard.mark()) }, 'Copy'),
        h('button', { onclick: () => { download(name, file); guard.mark(); } }, 'Download'))),
    h('p', { class: 'muted' }, 'Step 2 of 2. Save the file, then prove you can open it: load it back and type the passphrase. After this the server deletes its own copies; there is no recovery.'),
    pasteF.wrap, field('Passphrase for these cards', pp, null, { reveal: true }), h('div', { class: 'row' }, verify), verr));
  }
  return box;
}
function claimForm(x, slot) {
  const box = h('div', { class: 'card' }, h('div', { class: 'spread' }, h('h2', {}, `Key card ${slot}`), status('wait', 'Not verified yet')));
  const err = errBox();
  const p1 = pwInput('new-password'), p2 = pwInput('new-password');
  const step1 = h('div', {}, h('p', { class: 'muted' }, 'Step 1 of 2. Choose a passphrase for this card. It never leaves this device; the card is encrypted here.'),
    field('Card passphrase', p1, '(14+ characters)', { reveal: true }), field('Type it again', p2, null, { reveal: true }));
  const make = action(h('button', { class: 'primary' }, 'Create my card'), err, async () => {
    checkNewPass(p1.value, p2.value);
    const { share } = await api('GET', `/api/exams/${x.id}/cards/${slot}`);
    const card = await makeCard(x.id, slot, share, p1.value);
    p1.value = p2.value = '';
    showCard(card);
  }, CRYPTO_BUSY);
  step1.append(h('div', { class: 'row' }, make), err);
  box.append(step1);
  function showCard(card) {
    const ta = h('textarea', { readonly: true, value: card, 'aria-label': 'Your encrypted key card' });
    const pasteF = cardField('Card text', slot), paste = pasteF.ta;
    const pp = pwInput('off');
    const verr = errBox(), guard = saveGuard();
    const verify = action(h('button', { class: 'primary' }, 'Verify card'), verr, async () => {
      guard.check();
      const share = await openCard(paste.value, x.id, slot, pp.value);
      await api('POST', `/api/exams/${x.id}/cards/${slot}/verify`, { share });
      toast(`Card ${slot} verified. The server deleted its copy.`); refresh(x, 'cards');
    }, CRYPTO_BUSY);
    step1.replaceWith(h('div', {}, h('div', { class: 'secret' }, h('div', { class: 'tag' }, `Secret: key card ${slot}`), ta,
      h('div', { class: 'row' }, h('button', { onclick: () => copyText(card, 'Card copied').then((ok) => ok && guard.mark()) }, 'Copy'),
        h('button', { onclick: () => { download(`leakproof-card-${slot}.txt`, card); guard.mark(); } }, 'Download'))),
    h('p', { class: 'muted' }, 'Step 2 of 2. Save the card, then prove you can open it: paste it back and type its passphrase. After this the server deletes its own copy; there is no recovery.'),
    pasteF.wrap, field('Card passphrase', pp, null, { reveal: true }), h('div', { class: 'row' }, verify), verr));
  }
  return box;
}
function approveForm(x, rel, slot) {
  const words = h('input', { autocomplete: 'off', spellcheck: false, autocapitalize: 'none', placeholder: 'two words' });
  const cardF = cardField('Key card (or your file with all your cards)', slot), card = cardF.ta;
  const pp = pwInput('off');
  const err = errBox();
  const approve = action(h('button', { class: 'primary' }, `Approve with card ${slot}`), err, async () => {
    const share = await openCard(card.value, x.id, slot, pp.value);
    const r = await api('POST', `/api/releases/${rel.id}/decide`, { slot, decision: 'approve', share, words: words.value });
    toast(r.state === 'open' ? 'Quorum reached: the paper is open.' : r.next); refresh(x, 'cards');
  }, CRYPTO_BUSY);
  const refuseBtn = action(h('button', { class: 'danger' }, `Refuse with card ${slot}`), err, async () => {
    if (!words.value.trim()) throw new Error('Type the two words first. Refusing needs them too, so only someone in the room can refuse.');
    await api('POST', `/api/releases/${rel.id}/decide`, { slot, decision: 'refuse', words: words.value }); toast('Refused. Nothing was opened.'); refresh(x, 'cards');
  });
  return h('div', { class: 'card' }, h('h3', {}, `Card ${slot}`),
    field('The two words on the exam cell screen', words), cardF.wrap, field('Card passphrase', pp, null, { reveal: true }), h('div', { class: 'pair' }, approve, refuseBtn), err,
    h('p', { class: 'small muted' }, 'Refusing closes this request for everyone. The exam cell can request again.'));
}

// --- Log ---
async function logTab(x, body) {
  body.append(h('div', { class: 'card' }, h('h2', {}, 'Tamper-evident log'),
    h('p', { class: 'muted' }, 'Every step is chained with a key kept outside the database. The latest hash is printed on every copy; anyone can check it. After release the log page also shows the draw seed.'),
    h('a', { class: 'btn', href: `#/log/${x.id}` }, 'Open the public log')));
}
function drawCard(d) {
  if (!d) return h('div', { class: 'card' }, h('h2', {}, 'The draw'), h('p', { class: 'muted' }, 'The draw seed is published here once the paper is released.'));
  const topics = [...new Set(d.pool.map((p) => p.topic))].sort((a, b) => a - b);
  return h('div', { class: 'card' }, h('h2', {}, 'The draw'),
    h('p', { class: 'small' }, 'Seed: ', h('code', { text: d.seed })),
    h('p', { class: 'small' }, `Pool: ${d.pool.length} questions across ${topics.length} topics. Drawn: ${d.drawn.length}, one per topic.`),
    h('p', { class: 'small muted' }, 'Replay: for each topic t, sort that topic’s question ids; the drawn id is at index (HMAC-SHA256 stream keyed by the seed, label "draw|t", rejection-sampled) mod the count. draw() in src/exam.mjs is the reference code.'),
    h('details', { class: 'more' }, h('summary', {}, 'Pool and drawn ids'),
      h('ul', { class: 'list' }, topics.map((t) => h('li', {}, h('b', {}, `Topic ${t}: `),
        d.pool.filter((p) => p.topic === t).map((p) => p.id).sort().map((id) => h('code', { class: d.drawn.includes(id) ? 'drawn' : '', text: id + (d.drawn.includes(id) ? ' (drawn) ' : ' ') })))))));
}
async function publicLogPage(id) {
  let r;
  try { r = await api('GET', `/api/public/log/${id}`); }
  catch (e) { return page(h('div', { class: 'card' }, h('h1', {}, 'Public log'), h('p', { class: 'err', role: 'alert', text: e.status === 404 ? 'No such exam log.' : e.message }))); }
  const head = h('input', { spellcheck: false, placeholder: '64-character hash from a copy footer' }), out = h('p', { 'aria-live': 'polite' }), err = errBox();
  const check = action(h('button', { class: 'primary' }, 'Check'), err, async () => {
    const c = await api('POST', '/api/public/check-head', { head: head.value });
    out.replaceChildren(c.found ? status('ok', 'This hash is in the chain.') : status('bad', 'Not found. The copy or the log has been altered.'));
  });
  const chain = r.chain || {};
  const broken = chain.brokenAt != null ? `Broken at entry #${chain.brokenAt}: entries were changed` : 'Broken: entries were changed';
  const entries = r.entries || [];
  page(h('h1', {}, 'Public log'),
    h('div', { class: 'card' }, h('div', { class: 'spread' }, h('h2', {}, 'Chain'), chain.ok ? status('ok', `Intact · ${chain.entries} entries`) : status('bad', broken)),
      chain.checkedAt ? h('p', { class: 'small muted' }, `Checked ${when(chain.checkedAt)}.`) : null,
      h('p', { class: 'small' }, 'Latest hash: ', h('code', { text: r.head })), field('Check a hash printed on a copy', head), h('div', { class: 'row' }, check), err, out,
      h('div', { class: 'row' }, h('button', { onclick: () => download(`leakproof-log-${id}.json`, JSON.stringify(r, null, 2), 'application/json') }, 'Download this log'))),
    drawCard(r.draw),
    h('div', { class: 'card' }, h('h2', {}, 'Entries'),
      h('p', { class: 'small muted' }, `Showing the latest ${entries.length} of ${r.total ?? entries.length} entries for this exam, newest first.`),
      h('div', { class: 'scroll' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'When'), h('th', {}, 'Event'), h('th', {}, 'Details'), h('th', {}, 'Hash'))),
        h('tbody', {}, entries.slice().reverse().map((e) => h('tr', {}, h('td', { class: 'small' }, when(e.at)), h('td', {}, e.action),
          h('td', { class: 'small' }, Object.entries(e.detail || {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.length + ' items' : v}`).join(', ')), h('td', {}, h('code', { text: e.hash.slice(0, 12) })))))))));
}

// --- A printed copy and its answer key ---
async function copyPage(id, seat) {
  let c;
  try { c = await api('GET', `/api/exams/${id}/copies/${seat}`); } catch (e) { return page(h('div', { class: 'card' }, h('h1', {}, `Seat ${seat}`), h('p', { class: 'err', text: e.message }))); }
  page(h('div', { class: 'row noprint' }, h('button', { class: 'primary', onclick: () => window.print() }, 'Print'), c.reprint ? status('wait', 'Reprint: this is counted in the log') : null),
    h('article', { class: 'paper' },
      h('div', { class: 'spread' }, h('h1', {}, c.title), h('b', {}, `Seat ${c.seat}`)), h('p', { class: 'small' }, `Copy ${c.copyId}`),
      h('ol', { class: 'qs' }, c.questions.map((q) => h('li', {}, h('div', { text: q.text }), h('ol', { class: 'os' }, q.options.map((o) => h('li', { text: o })))))),
      h('footer', {}, h('p', {}, `Seat ${c.seat} · Copy ${c.copyId}`), h('p', {}, c.note), h('p', {}, 'Question set ', h('code', { text: c.setHash }), ' · Log ', h('code', { text: c.head })))));
}
async function keyPage(id, seat) {
  let k;
  try { k = await api('GET', `/api/exams/${id}/key/${seat}`); } catch (e) { return page(h('div', { class: 'card' }, h('h1', {}, `Answer key, seat ${seat}`), h('p', { class: 'err', text: e.message }))); }
  page(h('div', { class: 'row noprint' }, h('button', { class: 'primary', onclick: () => window.print() }, 'Print'), h('span', { class: 'muted small' }, 'Marking key. Keep it away from students.')),
    h('article', { class: 'paper' }, h('p', { class: 'keyband' }, 'ANSWER KEY. NOT FOR CANDIDATES'),
      h('div', { class: 'spread' }, h('h1', {}, `Answer key · Seat ${k.seat}`), h('b', {}, `Seat ${k.seat}`)), h('p', { class: 'small' }, `For copy ${k.copyId}`),
      h('ol', { class: 'key' }, k.answers.map((a) => h('li', { text: a }))),
      h('footer', {}, h('p', {}, `ANSWER KEY. NOT FOR CANDIDATES · Seat ${k.seat} · Copy ${k.copyId}`), h('p', {}, 'Each seat has its own question and option order. Use this key only for the copy with the copy id above.'))));
}

// ---------- router ----------
async function routeInner() {
  if (!S.mode) { const j = await fetch('/healthz').then((r) => r.json()).catch(() => ({ mode: 'practice', instance: 'practice' })); S.mode = j.mode; S.name = j.instance; }
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  if (parts[0] === 'log' && parts[1]) return publicLogPage(parts[1]);
  if (!S.me) await loadMe();
  if (!S.me) {
    if (parts[0] === 'register') return registerPage();
    if (parts[0] === 'recover') return recoverPage();
    if (parts[0] && parts[0] !== 'login') store.set(BACK, location.hash);
    return loginPage();
  }
  const banner = document.getElementById('banner');
  banner.hidden = S.me.instance !== 'practice';
  banner.textContent = 'Practice: you play every role and hold the 1 key card. In a real exam these are different people. Data here is disposable.';
  if (S.me.mustChange) return passphrasePage(true);
  if (parts[0] === 'passphrase') return passphrasePage(false);
  if (parts[0] === 'exam' && parts[1]) return examPage(parts[1], parts[2]);
  if (parts[0] === 'copy' && parts[1]) return copyPage(parts[1], parts[2]);
  if (parts[0] === 'key' && parts[1]) return keyPage(parts[1], parts[2]);
  if (['login', 'register', 'recover'].includes(parts[0])) { location.hash = '#/'; return; }
  return homePage();
}
// Guarded: a failed load shows a message and a retry, never a blank or stale page.
async function route() {
  main.setAttribute('aria-busy', 'true');
  try { await routeInner(); } catch (e) {
    if (e.status === 401 || e.data?.mustChange) return; // api() already moved to the right page
    page(h('div', { class: 'card' }, h('h1', {}, 'Could not load this page'), h('p', { class: 'err', role: 'alert', text: e.message }),
      h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => route() }, 'Try again'), h('a', { class: 'btn', href: '#/' }, 'Home'))));
  }
}
document.getElementById('skip')?.addEventListener('click', (e) => { e.preventDefault(); main.focus(); });
window.addEventListener('hashchange', route);
route();
