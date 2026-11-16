// "Build the pipeline": eight steps, run one click at a time. Each step does the real algorithm and animates it.
// Admin view (demo only) reveals keys, key pieces, the seed and who can see what. Text is always inserted as text.
import { BLOCK_BY_ID, ORDER, HOLDERS, K, N, createRun } from './pipeline-core.mjs';
import { QUESTION_BY_ID, FILES, SETTERS } from './exam-bank.mjs';
import { h, fill, svg, $ } from './dom.js';

/* One vibrant colour per step. */
const HUE = { banks: '#2f7de1', draw: '#8b5cf6', assemble: '#06b6d4', encrypt: '#ec4899', split: '#f59e0b', distribute: '#10b981', unlock: '#6366f1', print: '#f97316' };
const HIDDEN = '•••• hidden (turn on Admin view)';
/* The one-line story of each step, in plain numbers. */
const TELL = {
  banks: '10 setters each write 1 question for each of the 10 topics.',
  draw: 'For each topic, the computer picks 1 of the 10 questions, at random.',
  assemble: 'The 10 picked questions, one per topic, become one paper.',
  encrypt: 'The paper is locked with a one-time key.',
  split: 'The key is cut into 5 pieces. Any 3 rebuild it.',
  distribute: '5 officials each get one piece.',
  unlock: '3 of the 5 officials approve to open the paper.',
  print: 'Printed at the centre: a different copy for each seat.',
};

export function mountPipeline(root, opts = {}) {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fast = !!opts.fast || reduced;
  const sleep = (ms) => new Promise((r) => setTimeout(r, fast ? 0 : ms));
  const state = { run: null, done: 0, view: 0, busy: false, finished: false, admin: false, live: [], seat: 17 };
  const snaps = [], secrets = [];   // snaps: what each finished step looked like, so you can go back to it

  /* ---------- skeleton ---------- */
  const stepsEl = h('ol', { class: 'pl-steps', 'aria-label': 'Pipeline steps' });
  const resetBtn = h('button', { class: 'pl-btn ghost', type: 'button', 'data-act': 'reset' }, 'Start over');
  const stage = h('div', { class: 'pl-stage', 'aria-live': 'off' });
  const whatEl = h('p', { class: 'pl-what' });
  const chipsEl = h('div', { class: 'pl-chips' });
  const liveEl = h('dl', { class: 'pl-live', 'aria-label': 'What the algorithm is doing right now' });
  const adminBox = h('input', { type: 'checkbox', role: 'switch', id: 'pl-admin-box', 'aria-describedby': 'pl-admin-note' });
  const adminEl = h('section', { class: 'pl-admin', hidden: true, 'aria-label': 'Admin view' });
  const logEl = h('section', { class: 'pl-log', 'aria-label': 'Activity log' });
  const arrow = (dir) => svg('svg', { viewBox: '0 0 24 24', width: '20', height: '20', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg('path', { d: dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7' }));
  const backBtn = h('button', { class: 'pl-arrow', type: 'button', 'data-nav': 'back', 'aria-label': 'Previous step' }, arrow('left'));
  const fwdBtn = h('button', { class: 'pl-arrow', type: 'button', 'data-nav': 'forward', 'aria-label': 'Next step' }, arrow('right'));
  const navLabel = h('span', { class: 'pl-navlabel', 'aria-live': 'polite' });
  const navEl = h('div', { class: 'pl-nav' }, backBtn, navLabel, fwdBtn);
  const hintEl = h('p', { class: 'pl-inspect-hint', hidden: true }, 'Admin view is on: click any box in the animation to see who wrote what, and the real values behind it.');
  const detailEl = h('div', { class: 'pl-detail', hidden: true, role: 'region', 'aria-label': 'Inspector', 'aria-live': 'polite' });

  /* Light or dark: follows the system until the person picks, then remembers the choice on this device. */
  const store = { get() { try { return localStorage.getItem('lp-theme'); } catch { return null; } }, set(v) { try { localStorage.setItem('lp-theme', v); } catch { /* blocked */ } } };
  const systemDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  const themeBtns = {};
  const themeSwitch = h('div', { class: 'pl-theme', role: 'group', 'aria-label': 'Colour theme' }, ['light', 'dark'].map((t) => {
    themeBtns[t] = h('button', { type: 'button', 'data-theme-set': t, 'aria-pressed': 'false', onclick: () => { applyTheme(t); store.set(t); } }, t === 'light' ? 'Light' : 'Dark');
    return themeBtns[t];
  }));
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    for (const k of Object.keys(themeBtns)) themeBtns[k].setAttribute('aria-pressed', String(k === t));
  }
  const saved = store.get();
  applyTheme(saved === 'light' || saved === 'dark' ? saved : systemDark() ? 'dark' : 'light');

  fill(root, [
    h('div', { class: 'pl-top' }, themeSwitch,
      h('label', { class: 'pl-switch', for: 'pl-admin-box' }, adminBox, h('span', { class: 'pl-knob', 'aria-hidden': 'true' }), h('span', null, h('b', null, 'Admin view'), h('small', { id: 'pl-admin-note' }, 'Demo only. Shows keys and roles.')))),
    h('div', { class: 'pl-grid' },
      h('div', { class: 'pl-col' }, h('h2', null, 'Steps'), stepsEl, h('div', { class: 'pl-actions' }, resetBtn)),
      h('div', { class: 'pl-col wide' }, h('h2', null, 'Watch it happen'),
        h('div', { class: 'pl-card' }, navEl, stage, hintEl, detailEl, h('div', { class: 'pl-cap' }, whatEl, chipsEl, liveEl)))),
    adminEl, logEl,
    h('p', { class: 'pl-foot' }, 'Sample data only. The questions are ordinary textbook material, not a real paper. Built on practices used for real key ceremonies: split knowledge, dual control, authenticated encryption, least privilege, and a tamper-evident log.'),
  ]);

  /* ---------- the steps list ---------- */
  function renderSteps() {
    fill(stepsEl, ORDER.map((id, i) => {
      const b = BLOCK_BY_ID[id];
      const isDone = i < state.done, isNext = i === state.done && !state.finished, isActive = isNext && state.busy;
      const btn = h('button', { class: `pl-btn${isNext && !state.busy ? ' primary' : ''}`, type: 'button', 'data-step': id, disabled: !isNext || state.busy }, isDone ? 'Done ✓' : isActive ? 'Running…' : `Do step ${i + 1} for me`);
      btn.addEventListener('click', () => doStep(i));
      const li = h('li', { class: `pl-step ${b.kind}${i === state.view ? ' viewing' : ''}${isDone ? ' done' : ''}${isNext ? ' next' : ''}${isActive ? ' active' : ''}${!isDone && !isNext ? ' locked' : ''}`, 'data-id': id, style: `--c:${HUE[id]}` },
        h('span', { class: 'pl-num', 'aria-hidden': 'true' }, isDone ? '✓' : String(i + 1)),
        h('div', { class: 'pl-step-body' }, h('b', null, b.label), h('p', null, TELL[id]), btn));
      li.addEventListener('mouseenter', () => preview(id));
      if (isDone) li.addEventListener('click', (e) => { if (!e.target.closest('button')) showStep(i); });
      return li;
    }));
  }

  /* ---------- captions and live output ---------- */
  function preview(id) { if (!state.busy && !state.finished) caption(BLOCK_BY_ID[id]); }
  function caption(b) { whatEl.textContent = b.plain; fill(chipsEl, b.why.map((w) => h('span', { class: 'pl-chip' }, w))); }
  function L(label, value, secret = false) { state.live.push({ label, value, secret }); renderLive(); }
  function renderLive() {
    fill(liveEl, state.live.flatMap((l) => [h('dt', null, l.label), h('dd', { class: l.secret && !state.admin ? 'mono secret' : 'mono' }, l.secret && !state.admin ? HIDDEN : l.value)]));
  }

  /* ---------- questions are secret: shown only in Admin view ---------- */
  const MASK = '████████████████████████████';
  function secretText(el, real) { secrets.push({ el, real }); el.textContent = state.admin ? real : MASK; el.classList.add('qtext'); return el; }
  function applySecrets() { for (const x of secrets) x.el.textContent = state.admin ? x.real : MASK; }

  /* ---------- going back and forward ---------- */
  function renderNav() {
    const last = ORDER.length - 1;
    navEl.style.setProperty('--c', HUE[ORDER[state.view]]);
    navLabel.textContent = `Step ${state.view + 1} of ${ORDER.length} · ${BLOCK_BY_ID[ORDER[state.view]].label}`;
    backBtn.disabled = state.busy || state.view <= 0;
    fwdBtn.disabled = state.busy || (state.view < state.done ? state.view >= last : state.finished);
  }
  function showStep(i) {
    if (state.busy || i < 0 || i >= ORDER.length) return;
    state.view = i; detailEl.hidden = true;
    if (i < state.done) {
      const sn = snaps[i];
      fill(stage, sn.nodes); whatEl.textContent = sn.what; fill(chipsEl, sn.chips.map((t) => h('span', { class: 'pl-chip' }, t))); state.live = sn.live.map((x) => ({ ...x }));
    } else {
      state.live = []; fill(stage, [h('p', { class: 'pl-placeholder' }, `Press “Do step ${i + 1} for me”, or the right arrow, to run this step.`)]); caption(BLOCK_BY_ID[ORDER[i]]);
    }
    renderLive(); renderSteps(); renderNav();
  }
  backBtn.addEventListener('click', () => showStep(state.view - 1));
  fwdBtn.addEventListener('click', () => { if (state.view < state.done) showStep(state.view + 1); else doStep(state.done); });

  /* ---------- running one step per click ---------- */
  function intro() {
    state.live = []; renderLive();
    fill(stage, [h('p', { class: 'pl-placeholder' }, 'Press “Do step 1 for me” to begin. Each click runs one step.')]);
    whatEl.textContent = 'Eight steps take a sample university exam from ten setters’ question files to a printed paper. Hover a step to see why it is safe.'; chipsEl.replaceChildren();
  }
  function reset() {
    if (state.busy) return;
    state.run = null; state.done = 0; state.view = 0; state.finished = false; snaps.length = 0; secrets.length = 0; detailEl.hidden = true; hintEl.hidden = true; intro(); renderSteps(); renderNav(); renderAdmin(); logEl.replaceChildren();
  }
  async function doStep(i) {
    if (state.busy || state.finished || i !== state.done) return;
    if (i === 0) { state.run = createRun({ seed: opts.seed }); hintEl.hidden = !state.admin; }
    const id = ORDER[i];
    state.view = i; state.busy = true; state.live = []; renderLive(); detailEl.hidden = true; caption(BLOCK_BY_ID[id]); renderSteps(); renderNav();
    try { await ANIM[id](); } catch (e) { state.busy = false; whatEl.textContent = 'Something went wrong in this step: ' + (e && e.message); renderSteps(); renderNav(); return; }
    snaps[i] = { nodes: [...stage.childNodes], what: whatEl.textContent, chips: [...chipsEl.children].map((c) => c.textContent), live: state.live.map((x) => ({ ...x })) };
    state.busy = false; state.done++;
    if (state.done === ORDER.length) finish();
    renderSteps(); renderNav();
  }
  function finish() {
    state.finished = true;
    fill(chipsEl, ['10 of 100 questions', 'AES-256-GCM', `Key split ${K} of ${N}`, 'Per-seat copies', 'Hash-chained log'].map((t) => h('span', { class: 'pl-chip' }, t)));
    whatEl.textContent = 'Done. A paper nobody could read, until three officials said yes. Every step is in the log below, each entry fingerprinted from the one before.';
  }
  resetBtn.addEventListener('click', reset);
  adminBox.addEventListener('change', () => { state.admin = adminBox.checked; hintEl.hidden = !state.admin || !state.run; detailEl.hidden = true; root.classList.toggle('pl-admin-on', state.admin); renderLive(); applySecrets(); renderAdmin(); });

  /* ---------- the inspector: in Admin view, any box can be clicked to see who wrote what ---------- */
  function detail(title, rows) {
    if (!state.admin) fill(detailEl, [h('b', null, 'Admin view is off.'), ' Turn it on (top right) to inspect this box.']);
    else fill(detailEl, [h('b', null, title), h('dl', null, rows.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)]))]);
    detailEl.hidden = false;
  }
  function inspect(el, title, rows) {
    el.classList.add('inspect'); if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0'); el.setAttribute('role', el.getAttribute('role') || 'button');
    el.addEventListener('click', () => detail(title, rows()));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); detail(title, rows()); } });
    return el;
  }
  const qRows = (q, extra = []) => [['Topic', q.topic], ['Written by', `${q.setterName || SETTERS.find((x) => x.id === q.setter).name} (${q.setter})`], ['Question', q.text], ...q.options.map((o, i) => [`${'ABCD'[i]})${i === q.correct ? ' ✓ correct' : ''}`, o]), ...extra];

  /* ---------- animations: one per step. Each does the real step, then shows it. ---------- */
  const show = async (els, gap = 90) => { for (const el of els) { await sleep(gap); el.classList.add('in'); } };
  const short = (hex, n = 16) => hex.slice(0, n) + '…';
  const R = () => state.run;
  const ANIM = {
    async banks() {
      const r = await R().banks();
      const topicCards = r.topics.map((t) => h('div', { class: 'pl-file in' }, h('b', null, t), h('div', { class: 'pl-dots' }, SETTERS.map((st) => h('i', { 'data-s': st.id }))), h('span', { class: 'mono' }, '0 of 10 in')));
      const setterChips = r.files.map((f) => h('span', { class: 'pl-setter' }, f.setterName.replace('Setter ', 'S')));
      fill(stage, [h('p', { class: 'pl-title' }, 'Ten setters, each writing one question for every topic'), h('div', { class: 'pl-setters' }, setterChips), h('div', { class: 'pl-files' }, topicCards)]);
      topicCards.forEach((c, t) => inspect(c, `Topic: ${r.topics[t]}. Ten questions, one from each setter`, () => FILES.map((f) => [f.setterName, f.questions[t].text])));
      r.files.forEach((f, i) => inspect(setterChips[i], `${f.setterName}: file ${f.file}`, () => [['Fingerprint (SHA-256)', f.fingerprint], ...FILES[i].questions.map((q) => [q.topic, q.text])]));
      for (let i = 0; i < r.files.length; i++) {
        await sleep(160); setterChips[i].classList.add('in');
        topicCards.forEach((c) => { c.querySelector(`[data-s="${SETTERS[i].id}"]`).classList.add('pick'); c.querySelector('.mono').textContent = `${i + 1} of 10 in`; });
      }
      L('Files received', `${r.files.length} files × ${r.files[0].count} questions = ${r.files.length * r.files[0].count}`);
      L('Fingerprint of Setter 01\'s file', short(r.files[0].fingerprint, 24));
      await sleep(350); renderAdmin(); await renderLog();
    },
    async draw() {
      const r = await R().draw();
      const topics = R().topics;
      const cards = r.picks.map((p) => h('div', { class: 'pl-file in' }, h('b', null, p.topic), h('div', { class: 'pl-dots' }, SETTERS.map((st, d) => h('i', { 'data-d': d }))), h('span', { class: 'mono' }, '–')));
      fill(stage, [h('p', { class: 'pl-title' }, 'For each topic, one of the ten questions is picked at random'), h('div', { class: 'pl-files' }, cards)]);
      L('Random seed (128 bit)', r.seed, true);
      for (let i = 0; i < cards.length; i++) {
        const dots = [...cards[i].querySelectorAll('i')];
        for (let t = 0; t < 6; t++) { dots.forEach((d) => d.classList.remove('hot')); dots[(t * 3 + i) % 10].classList.add('hot'); await sleep(40); }
        dots.forEach((d) => d.classList.remove('hot')); dots[r.picks[i].index].classList.add('pick');
        cards[i].querySelector('.mono').textContent = `question ${r.picks[i].index + 1} of 10`;
        const q = QUESTION_BY_ID[r.picks[i].id];
        inspect(cards[i], `${r.picks[i].topic}: the question picked`, () => qRows(q, [['Other candidates', 'the other nine setters\' questions on this topic were not used']]));
      }
      L('Picked (position per topic)', r.picks.map((p) => p.index + 1).join(' · '));
      L('Pool', `${r.picks.length} of ${r.poolSize} questions`);
      await sleep(350); renderAdmin(); await renderLog();
    },
    async assemble() {
      const r = await R().assemble();
      const lines = r.paper.map((q) => inspect(h('li', null, h('span', { class: 'n' }, String(q.n)), secretText(h('span'), q.text), h('em', null, q.topic)), `Paper question ${q.n}: ${q.topic}`, () => qRows(QUESTION_BY_ID[q.id])));
      fill(stage, [h('p', { class: 'pl-title' }, 'Ten questions, one per topic, become one paper'), h('p', { class: 'pl-demo' }, 'In the real system nobody reads the paper. Turn on Admin view (demo only) to read it here.'), h('ol', { class: 'pl-paper' }, lines)]);
      await show(lines, 120);
      L('Paper size', `${r.bytes} bytes, held in memory only`);
      L('Fingerprint (SHA-256)', short(r.fingerprint, 32));
      await sleep(300); renderAdmin(); await renderLog();
    },
    async encrypt() {
      const paper = R().state.paper;
      const lines = paper.map((q) => h('li', null, h('span', { class: 'n' }, String(q.n)), h('span', { class: 'scr' }, state.admin ? q.text : MASK)));
      const lock = svg('svg', { class: 'pl-lock', viewBox: '0 0 24 24', 'aria-hidden': 'true' }, svg('rect', { x: '5', y: '11', width: '14', height: '10', rx: '2' }), svg('path', { d: 'M8 11V7a4 4 0 0 1 8 0v4', class: 'sh' }));
      lines.forEach((l) => l.classList.add('in'));
      fill(stage, [h('p', { class: 'pl-title' }, 'The paper is locked with a one-time key'), lock, h('ol', { class: 'pl-paper' }, lines)]);
      const r = await R().encrypt();
      L('Cipher', 'AES-256-GCM (encrypts and detects tampering)');
      L('One-time key', R().state.keyHex, true);
      L('Nonce (IV)', r.ivHex);
      const scr = [...stage.querySelectorAll('.scr')], orig = scr.map((e) => e.textContent), glyphs = '0123456789abcdef';
      for (let t = 1; t <= 6; t++) {
        scr.forEach((e, i) => { e.textContent = [...orig[i]].map((c, k) => (Math.random() < t / 6 ? glyphs[(c.charCodeAt(0) + k * 7 + t) % 16] : c)).join(''); });
        await sleep(120);
      }
      scr.forEach((e, i) => { e.textContent = r.ciphertextHex.slice(i * 40, i * 40 + 44); e.classList.add('locked'); });
      lines.forEach((l, i) => inspect(l, `Line ${i + 1} as stored: unreadable without the key`, () => [['What everyone sees', r.ciphertextHex.slice(i * 40, i * 40 + 44)], ['What it hides', paper[i].text], ['Topic', paper[i].topic], ['Written by', paper[i].setter]]));
      lock.classList.add('closed');
      L('Locked paper', `${short(r.ciphertextHex, 32)} (${r.bytes} bytes)`);
      await sleep(350); renderAdmin(); await renderLog();
    },
    async split() {
      const r = await R().split();
      const pieces = r.pieces.map((p) => inspect(h('div', { class: 'pl-piece' }, h('b', null, '#' + p.x), h('span', { class: 'mono' }, 'piece')), `Key piece #${p.x}`, () => [['Value', p.hex], ['Alone it reveals', 'nothing: any 2 pieces are random-looking'], ['Held by', 'nobody yet (next step)']]));
      const key = h('div', { class: 'pl-key' }, h('b', null, 'The one-time key'), h('span', { class: 'mono' }, state.admin ? R().state.keyHex : '•••• •••• •••• ••••'));
      fill(stage, [h('p', { class: 'pl-title' }, `The key is cut into ${N} pieces`), key, h('div', { class: 'pl-pieces' }, pieces),
        h('p', { class: 'pl-rule' }, h('b', null, 'Any 3'), ' pieces rebuild the key. ', h('b', null, 'Any 2'), ' reveal nothing at all, not even a hint.')]);
      await sleep(250); key.classList.add('split'); await show(pieces, 150);
      await sleep(300); key.classList.add('wiped'); key.querySelector('b').textContent = 'The whole key: wiped';
      L('Scheme', `Shamir secret sharing, ${K} of ${N}`);
      r.pieces.forEach((p) => L(`Key piece #${p.x}`, p.hex, true));
      L('Self-check', `${K} pieces rebuild the key exactly`);
      await sleep(300); renderAdmin(); await renderLog();
    },
    async distribute() {
      const r = await R().distribute();
      const cards = r.holders.map((o) => inspect(h('div', { class: 'pl-holder' }, h('b', null, o.role), h('span', { class: 'mono' }, `piece #${o.x}`), h('span', { class: 'mono fp' }, '#' + o.fingerprint)), `${o.role}`, () => [['Holds', `key piece #${o.x}`], ['Piece value', o.hex], ['Fingerprint', o.fingerprint], ['Can open the paper alone?', 'No. Needs 2 more officials.']]));
      const server = inspect(h('div', { class: 'pl-holder server' }, h('b', null, 'Exam centre server'), h('span', { class: 'mono' }, 'locked paper only'), h('span', { class: 'mono fp' }, 'no key')), 'Exam centre server', () => [['Holds', 'the locked paper (ciphertext)'], ['Holds the key?', 'No, and no piece of it']]);
      fill(stage, [h('p', { class: 'pl-title' }, 'Each official gets one piece. Nobody gets two.'), h('div', { class: 'pl-holders' }, cards), server]);
      await show(cards, 170); await sleep(200); server.classList.add('in');
      r.holders.forEach((o) => L(o.role, `piece #${o.x}  ·  fingerprint #${o.fingerprint}`));
      L('Centre server holds', 'the locked paper, no key');
      await sleep(250); renderAdmin(); await renderLog();
    },
    unlock() {
      return new Promise((resolve) => {
        const approved = new Set();
        const status = h('p', { class: 'pl-status', role: 'status', 'aria-live': 'polite' }, `0 of ${K} approvals. Tap officials to approve.`);
        const result = h('div', { class: 'pl-result' });
        const holders = R().state.holders;
        const cards = holders.map((o) => {
          const b = h('button', { class: 'pl-holder tap', type: 'button', 'aria-pressed': 'false', 'data-x': o.x }, h('b', null, o.role), h('span', { class: 'mono' }, `piece #${o.x}`), h('span', { class: 'pl-approve' }, 'Approve'));
          b.addEventListener('click', () => toggle(o.x, b));
          return b;
        });
        const auto = h('button', { class: 'pl-btn ghost small', type: 'button', 'data-act': 'auto-unlock' }, 'Do it for me');
        fill(stage, [h('p', { class: 'pl-title' }, `At the exam centre, ${K} of ${N} officials must approve`), h('div', { class: 'pl-holders' }, cards), status, result, auto]);
        let opened = false, queue = Promise.resolve();
        const toggle = (x, b) => {
          if (opened) return;
          if (approved.has(x)) approved.delete(x); else approved.add(x);
          b.setAttribute('aria-pressed', String(approved.has(x))); b.classList.toggle('on', approved.has(x));
          queue = queue.then(attempt);
        };
        async function attempt() {
          const n = approved.size; status.textContent = `${n} of ${K} approvals.`;
          if (n === 0) { result.replaceChildren(); return; }
          const r = await R().tryUnlock([...approved]);
          if (opened) return;
          state.live = state.live.filter((l) => !l.attempt);
          if (!r.ok) {
            result.className = 'pl-result refused';
            fill(result, [h('b', null, `Refused with ${r.count} approval${r.count === 1 ? '' : 's'}.`), ' We really tried: the key rebuilt from these pieces is wrong, so AES-GCM rejected it and revealed nothing.']);
            L('Attempt', `${r.count} piece${r.count === 1 ? '' : 's'}: authentication failed, no output`); state.live[state.live.length - 1].attempt = true;
          } else {
            opened = true; auto.hidden = true;
            result.className = 'pl-result opened';
            fill(result, [h('b', null, 'Unlocked.'), ` ${r.count} officials approved, the key rebuilt, the tag checked out.`]);
            L('Attempt', `${r.count} pieces: key rebuilt, authentication tag verified`);
            L('Paper', `${r.text.split('\n').length} lines recovered, identical to the original`);
            cards.forEach((c) => { c.disabled = true; });
            await sleep(400); renderAdmin(); await renderLog(); resolve();
          }
          renderAdmin(); await renderLog();
        }
        auto.addEventListener('click', async () => { auto.disabled = true; for (let i = 0; i < K + 1 && !opened; i++) { const b = cards[[0, 2, 4][i]]; if (!b) break; b.click(); await sleep(900); } });
      });
    },
    async print() {
      const draw = async (seat) => {
        const s = await R().print(seat);
        const lis = s.items.map((it) => inspect(h('li', null, h('span', null, it.text), h('small', null, it.options.map((o, j) => `${'ABCD'[j]}) ${o}`).join('   '))), `Question ${it.pos} on seat ${s.seat}'s copy`, () => {
          const q = R().state.paper[it.was - 1];
          return [['Position on this copy', String(it.pos)], ['Position on the master paper', String(it.was)], ['Topic', q.topic], ['Written by', q.setter], ['Right answer on this copy', 'ABCD'[s.items[it.pos - 1].options.indexOf(q.options[q.correct])]]];
        }));
        const sheet = h('div', { class: 'pl-sheet in' }, h('div', { class: 'pl-sheet-head' }, h('b', null, 'Printed at the exam centre'), h('span', { class: 'mono' }, `Seat ${s.seat} · copy ${s.id}`)), h('ol', null, lis));
        return { s, sheet };
      };
      const seatInput = h('input', { type: 'number', min: '1', max: '120', value: String(state.seat), id: 'pl-seat', 'aria-label': 'Seat number' });
      const holder = h('div', { class: 'pl-sheetbox' });
      const bar = h('label', { class: 'pl-seat', for: 'pl-seat' }, 'Seat ', seatInput, h('small', null, 'Change it: every seat gets a different order.'));
      fill(stage, [h('p', { class: 'pl-title' }, 'Printed only now, at the centre'), bar, holder]);
      const show1 = async (seat) => {
        const { s, sheet } = await draw(seat); holder.replaceChildren(sheet);
        state.live = []; L('Copy ID', `${s.id} (the last digit is a check digit)`); L('Question order on this copy', s.order.map((o) => o + 1).join(' '));
        L('Answer key for this copy', s.key.join(' '), true); L('Rule', 'The key is rebuilt per copy, because options moved.');
        renderAdmin(); await renderLog();
      };
      await show1(state.seat);
      seatInput.addEventListener('change', async () => { const v = Math.max(1, Math.min(120, parseInt(seatInput.value, 10) || 1)); seatInput.value = String(v); state.seat = v; await show1(v); });
    },
  };

  /* ---------- admin view and log ---------- */
  const mask = (v, ok) => (ok ? v : 'not created yet');
  function renderAdmin() {
    adminEl.hidden = !state.admin;
    if (!state.admin) { adminEl.replaceChildren(); return; }
    const s = state.run ? state.run.state : {};
    const row = (k, v, mono = true) => h('tr', null, h('th', { scope: 'row' }, k), h('td', { class: mono ? 'mono' : '' }, v));
    const roles = [
      ['Ten setters', 'Their own file only', 'Other files, the draw, the paper'],
      ['Exam software', 'Files, the draw, the paper (in memory, for minutes)', 'Nothing is typed or read by a person'],
      ...HOLDERS.map((o, i) => [o.role, `Key piece #${i + 1} only`, 'Other pieces, the paper']),
      ['Exam centre server', 'The locked paper', 'The key, any piece'],
      ['Centre superintendent', 'Printed copies, after unlock', 'Anything before the quorum'],
      ['Auditor', 'The log and, after the exam, the seed', 'Keys'],
    ];
    fill(adminEl, [
      h('div', { class: 'pl-banner' }, h('b', null, 'Admin view. Demo only.'), ' In the real system nobody can see any of this. It is shown here so you can check that every claim on screen is backed by a real value.'),
      h('div', { class: 'pl-admin-grid' },
        h('div', null, h('h3', null, 'Secrets and values'), h('table', { class: 'pl-table' }, h('tbody', null,
          row('Random seed', mask(s.seed, s.seed)), row('Paper fingerprint', mask(s.paperFp, s.paperFp)),
          row('One-time key (wiped after the split)', mask(s.keyHex, s.keyHex)), row('Nonce (IV)', mask(s.iv && Array.from(s.iv, (b) => b.toString(16).padStart(2, '0')).join(''), s.iv)),
          row('Locked paper (first 64 hex)', mask(s.ciphertext && Array.from(s.ciphertext.slice(0, 32), (b) => b.toString(16).padStart(2, '0')).join(''), s.ciphertext)),
          ...(s.holders ? s.holders.map((o) => row(`${o.role}: piece #${o.x}`, o.hex)) : [row('Key pieces', 'not handed out yet')])))),
        h('div', null, h('h3', null, 'Who can see what'), h('table', { class: 'pl-table' }, h('thead', null, h('tr', null, h('th', null, 'Role'), h('th', null, 'Can see'), h('th', null, 'Cannot see'))),
          h('tbody', null, roles.map(([a, b, c]) => h('tr', null, h('th', { scope: 'row' }, a), h('td', null, b), h('td', null, c)))))))]);
  }
  async function renderLog() {
    if (!state.run) { logEl.replaceChildren(); return; }
    const chain = state.run.log;
    const verify = h('button', { class: 'pl-btn small', type: 'button' }, 'Check the log');
    const res = h('span', { class: 'pl-verify', role: 'status' });
    verify.addEventListener('click', async () => { const v = await state.run.verifyLog(); res.textContent = v.ok ? `All ${chain.length} entries check out.` : `Entry ${v.firstBad + 1} was changed.`; res.className = 'pl-verify ' + (v.ok ? 'ok' : 'bad'); });
    fill(logEl, [h('div', { class: 'pl-log-head' }, h('h3', null, 'Activity log'), h('p', { class: 'muted' }, 'Each entry carries a fingerprint of the one before it. Change any entry and every later fingerprint breaks.'), verify, res),
      h('ol', null, chain.map((e) => h('li', null, h('span', { class: 'mono' }, e.time.slice(11, 19)), h('span', null, h('b', null, e.actor + ': '), e.action), h('span', { class: 'mono fp' }, '#' + e.hash.slice(0, 10)))))]);
  }

  intro(); renderSteps(); renderNav();
  return { state, doStep, ANIM };
}

const root = typeof document !== 'undefined' && !globalThis.__LP_TEST ? $('#pipeline-root') : null;
if (root) mountPipeline(root);
