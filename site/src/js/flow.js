// Animated pipeline flowchart and role task flows.
import { h, svg, fill } from './dom.js';

export const STEPS = [
  { short: 'Write', sub: 'setters', who: 'Setters', title: 'Many people write the questions',
    text: 'About 1,000 setters each write a few questions for cells set by the exam blueprint. Each question is signed and encrypted when it is submitted.',
    reads: 'Only its author.', stops: 'Signatures and ownership checks stop anyone submitting in another setter\'s name.', risk: 'A setter can still leak their own few questions. The late draw limits what that is worth.' },
  { short: 'Review', sub: 'reviewers', who: 'Reviewers', title: 'Small subsets are checked',
    text: 'Each reviewer sees only a few assigned questions, never their own. A similarity check flags near-duplicates.',
    reads: 'The assigned reviewer, up to a cap.', stops: 'Assignment rules and a cap on how many each reviewer sees.', risk: 'A reviewer can remember what they saw.' },
  { short: 'Draw', sub: 'system', who: 'The system and the custodians', title: 'The paper is drawn late, at random',
    text: 'A program picks questions inside topic and difficulty quotas. The random seed is committed before the pool locks, so nobody can keep trying seeds until one suits them.',
    reads: 'Nobody. The draw works on question IDs, not text.', stops: 'Seed commitment before the pool locks; quotas.', risk: 'A skewed draw could concentrate exposure. We test this by simulation.' },
  { short: 'Seal', sub: 'custodians', who: 'Custodians and the system', title: 'Locked under a key held in pieces',
    text: 'A quorum of custodians authorises sealing. The system briefly decrypts the chosen questions, builds the paper, encrypts it and splits the key into five pieces.',
    reads: 'The sealing system, for a few seconds, in a logged ceremony.', stops: 'Quorum rule, logging, memory wiped afterwards.', risk: 'This moment has to be trusted. We say so openly and make it a witnessed ceremony.' },
  { short: 'Deliver', sub: 'centres', who: 'The exam authority', title: 'Encrypted files go to each centre',
    text: 'Nothing printed travels. Each centre receives an encrypted file with no key. A fingerprint of the file is written to the log.',
    reads: 'Nobody.', stops: 'Authenticated encryption; the file fingerprint is in the log.', risk: 'A lost or altered file is detected, not hidden.' },
  { short: 'Release', sub: 'centre + keys', who: 'The centre and the custodians', title: 'Three conditions open it',
    text: 'Candidates are seated and the centre sends a signed seating report. The authority issues a signed token with a time window. Three custodians approve. Only then is the key rebuilt. If anything is missing, nothing prints.',
    reads: 'The centre\'s print system, after every check passes.', stops: 'Signed token with window and nonce, quorum of custodians, fail closed.', risk: 'Three dishonest custodians could open it early. Their approvals are logged.' },
  { short: 'Print', sub: 'centre', who: 'The centre', title: 'Every copy is different',
    text: 'Each candidate\'s copy has its own order of questions and options, and a copy ID. A photo of a page points to a seat.',
    reads: 'The printer and the candidate.', stops: 'Copy IDs with check digits; reprints need approval and are logged.', risk: 'Someone can still photograph a page. The photo becomes traceable.' },
  { short: 'Trace', sub: 'investigator', who: 'The investigator', title: 'If it leaks anyway, find where',
    text: 'The matcher compares text found online with our pool and printed copies, and lists likely sources with a confidence. A person decides before anyone is blamed, and the named person can reply.',
    reads: 'The assigned investigator only.', stops: 'Human confirmation, right of reply.', risk: 'Private channels are invisible to us.' },
];

/* Text sizes are in drawing units. The wide chart is drawn 960 units across and shown at up to about 1000px,
   the phone chart is drawn 360 units across and shown at up to 460px, so one unit is roughly one pixel in both.
   tests/flow-size.test.mjs checks the sizes stay readable. */
export const SIZES = {
  wide: { viewW: 960, title: 18, sub: 13, small: 12, tiny: 11.5, minShownW: 640, maxShownW: 1010 },
  tall: { viewW: 360, title: 16.5, sub: 13, small: 12.5, tiny: 12.5, minShownW: 300, maxShownW: 460 },
};
export const NARROW_QUERY = '(max-width: 900px)';

const ico = (path) => svg('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, svg('path', { d: path }));
const T = (attrs, ...kids) => svg('text', attrs, ...kids);
const ARIA = 'Animated flowchart: a paper moves from setters through review, draw, seal, delivery, release and print, then tracing if it leaks. A log records each step.';
const fsz = (n) => `font-size:${n}px`;

/* Wide layout: eight stations side by side. */
function buildWide(pick) {
  const S = SIZES.wide;
  const X = (i) => 74 + i * 116, RAIL = 122, TOP = 150, BW = 104, BH = 68, LOG = 322;
  const stations = STEPS.map((s, i) => {
    const g = svg('g', { class: 'st', tabindex: '0', role: 'button', 'aria-label': `Step ${i + 1}: ${s.short}` },
      svg('rect', { x: X(i) - BW / 2, y: TOP, width: BW, height: BH, rx: 14 }),
      T({ x: X(i), y: TOP + 29, style: fsz(S.title) }, s.short),
      T({ x: X(i), y: TOP + 52, style: fsz(S.sub) }, s.sub));
    g.addEventListener('click', () => pick(i));
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(i); } });
    return g;
  });
  const ticks = STEPS.map((_, i) => svg('line', { x1: X(i), y1: RAIL, x2: X(i), y2: TOP, class: 'rail' }));
  const railOn = svg('line', { class: 'rail-on', x1: X(0), y1: RAIL, x2: X(0), y2: RAIL });
  const tok = svg('g', { class: 'tok-g', style: `transform: translate(${X(0)}px, ${RAIL}px); transition: transform 0.9s cubic-bezier(.4,.1,.2,1);` },
    svg('circle', { class: 'tok-ring', r: 22 }), svg('circle', { class: 'tok', r: 13 }));
  const keys = svg('g', { 'aria-hidden': 'true' }, ...Array.from({ length: 5 }, (_, k) => svg('circle', { cx: X(3) - 32 + k * 16, cy: 62, r: 6, class: 'key-dot', style: 'fill:var(--line);opacity:0;transition:opacity .4s, fill .4s' })));
  const keyLabel = T({ x: X(3) + 62, y: 67, class: 'key-label', style: `${fsz(S.small)};fill:var(--muted);opacity:0;transition:opacity .4s` }, '5 key pieces');
  const copies = svg('g', { 'aria-hidden': 'true', style: 'opacity:0;transition:opacity .5s' },
    ...[0, 1, 2].map((k) => svg('rect', { x: X(6) - 44 + k * 32, y: 228 + k * 3, width: 28, height: 36, rx: 4, style: 'fill:var(--card);stroke:var(--accent);stroke-width:1.3' })),
    ...[0, 1, 2].map((k) => T({ x: X(6) - 30 + k * 32, y: 251 + k * 3, style: `${fsz(10.5)};fill:var(--accent);text-anchor:middle` }, ['2·4·1', '3·1·2', '1·3·4'][k])),
    T({ x: X(6), y: 288, style: `${fsz(S.small)};fill:var(--muted);text-anchor:middle` }, 'different order each'));
  const logLine = svg('line', { x1: X(0), y1: LOG, x2: X(7), y2: LOG, class: 'rail' });
  const chips = STEPS.map((_, i) => svg('g', { class: 'logchip', style: 'opacity:0;transition:opacity .4s', 'aria-hidden': 'true' },
    svg('rect', { x: X(i) - 20, y: LOG - 11, width: 40, height: 22, rx: 7 }), T({ x: X(i), y: LOG + 4, style: fsz(S.tiny) }, '#' + (i + 1))));
  const logLabel = T({ x: X(0) - 52, y: LOG - 22, style: `${fsz(S.small)};fill:var(--muted);font-family:var(--font)` }, 'Tamper-evident log: every step adds an entry');
  const el = svg('svg', { class: 'wide', viewBox: `0 40 ${S.viewW} 310`, role: 'img', 'aria-label': ARIA },
    logLabel, logLine, ...chips, svg('line', { x1: X(0), y1: RAIL, x2: X(7), y2: RAIL, class: 'rail' }), railOn, ...ticks, ...stations, keys, keyLabel, copies, tok);
  return { el, apply(idx) {
    tok.style.transform = `translate(${X(idx)}px, ${RAIL}px)`;
    railOn.setAttribute('x2', String(X(idx)));
    stations.forEach((g, k) => { g.classList.toggle('on', k === idx); g.classList.toggle('done', k < idx); });
    chips.forEach((c, k) => { c.style.opacity = k <= idx ? '1' : '0'; });
    keys.querySelectorAll('.key-dot').forEach((d, k) => { d.style.opacity = idx >= 3 ? '1' : '0'; d.style.fill = idx >= 5 && k < 3 ? 'var(--accent)' : 'var(--line)'; });
    keyLabel.style.opacity = idx >= 3 ? '1' : '0';
    keyLabel.textContent = idx >= 5 ? '3 of 5 pieces turned' : '5 key pieces';
    copies.style.opacity = idx >= 6 ? '1' : '0';
  } };
}

/* Tall layout for phones and narrow windows: the same eight steps as a vertical track. */
function buildTall(pick) {
  const S = SIZES.tall;
  const RAILX = 32, BX = 60, BW = 292, BH = 56, GAP = 72, Y0 = 44;
  const Y = (i) => Y0 + i * GAP;
  const stations = STEPS.map((s, i) => {
    const cy = Y(i);
    const g = svg('g', { class: 'st', tabindex: '0', role: 'button', 'aria-label': `Step ${i + 1}: ${s.short}` },
      svg('rect', { x: BX, y: cy - BH / 2, width: BW, height: BH, rx: 14 }),
      T({ x: BX + 16, y: cy - 4, style: `${fsz(S.title)};text-anchor:start` }, s.short),
      T({ x: BX + 16, y: cy + 16, style: `${fsz(S.sub)};text-anchor:start` }, s.sub));
    g.addEventListener('click', () => pick(i));
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(i); } });
    return g;
  });
  const ticks = STEPS.map((_, i) => svg('line', { x1: RAILX, y1: Y(i), x2: BX, y2: Y(i), class: 'rail' }));
  const railOn = svg('line', { class: 'rail-on', x1: RAILX, y1: Y(0), x2: RAILX, y2: Y(0) });
  const tok = svg('g', { class: 'tok-g', style: `transform: translate(${RAILX}px, ${Y(0)}px); transition: transform 0.9s cubic-bezier(.4,.1,.2,1);` },
    svg('circle', { class: 'tok-ring', r: 20 }), svg('circle', { class: 'tok', r: 12 }));
  const keysX = BX + 150;
  const keys = svg('g', { 'aria-hidden': 'true' }, ...Array.from({ length: 5 }, (_, k) => svg('circle', { cx: keysX + k * 15, cy: Y(3) - 8, r: 5.5, class: 'key-dot', style: 'fill:var(--line);opacity:0;transition:opacity .4s, fill .4s' })));
  const keyLabel = T({ x: keysX - 4, y: Y(3) + 14, class: 'key-label', style: `${fsz(S.small)};fill:var(--muted);opacity:0;transition:opacity .4s;text-anchor:start` }, '5 key pieces');
  const copies = svg('g', { 'aria-hidden': 'true', style: 'opacity:0;transition:opacity .5s' },
    ...[0, 1, 2].map((k) => svg('rect', { x: keysX + k * 26, y: Y(6) - 22 + k * 2, width: 22, height: 26, rx: 3, style: 'fill:var(--card);stroke:var(--accent);stroke-width:1.2' })),
    T({ x: keysX - 4, y: Y(6) + 20, style: `${fsz(S.small)};fill:var(--muted);text-anchor:start` }, 'different order each'));
  const chips = STEPS.map((_, i) => svg('g', { class: 'logchip', style: 'opacity:0;transition:opacity .4s', 'aria-hidden': 'true' },
    svg('rect', { x: BX + BW - 48, y: Y(i) - 28 + 6, width: 38, height: 20, rx: 7 }), T({ x: BX + BW - 29, y: Y(i) - 28 + 20, style: fsz(S.tiny) }, '#' + (i + 1))));
  const el = svg('svg', { class: 'tall', viewBox: `0 0 ${S.viewW} ${Y(7) + 36}`, role: 'img', 'aria-label': ARIA },
    svg('line', { x1: RAILX, y1: Y(0), x2: RAILX, y2: Y(7), class: 'rail' }), railOn, ...ticks, ...stations, ...chips, keys, keyLabel, copies, tok);
  return { el, apply(idx) {
    tok.style.transform = `translate(${RAILX}px, ${Y(idx)}px)`;
    railOn.setAttribute('y2', String(Y(idx)));
    stations.forEach((g, k) => { g.classList.toggle('on', k === idx); g.classList.toggle('done', k < idx); });
    chips.forEach((c, k) => { c.style.opacity = k <= idx ? '1' : '0'; });
    keys.querySelectorAll('.key-dot').forEach((d, k) => { d.style.opacity = idx >= 3 ? '1' : '0'; d.style.fill = idx >= 5 && k < 3 ? 'var(--accent)' : 'var(--line)'; });
    keyLabel.style.opacity = idx >= 3 ? '1' : '0';
    keyLabel.textContent = idx >= 5 ? '3 of 5 pieces turned' : '5 key pieces';
    copies.style.opacity = idx >= 6 ? '1' : '0';
  } };
}

export function mountJourney(root) {
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mq = typeof matchMedia === 'function' ? matchMedia(NARROW_QUERY) : null;
  let idx = 0, timer = null, played = false, tall = null, chart = null;

  const chartHost = h('div', { class: 'chart-host' });
  const pick = (i) => { pause(); go(i); };
  function layout() {
    const wantTall = !!(mq && mq.matches);
    if (wantTall === tall) return;
    tall = wantTall;
    chart = wantTall ? buildTall(pick) : buildWide(pick);
    fill(chartHost, [chart.el]);
    chart.apply(idx);
  }

  const capWho = h('div', { class: 'who' }), capTitle = h('h3'), capText = h('p', { class: 'muted' });
  const fReads = h('div', { class: 'fact' }, h('b', null, 'Who can read the paper now'), h('span')),
    fStops = h('div', { class: 'fact good' }, h('b', null, 'What stops a leak here'), h('span')),
    fRisk = h('div', { class: 'fact bad' }, h('b', null, 'What can still go wrong'), h('span'));
  const cap = h('div', { class: 'flow-cap', 'aria-live': 'polite' }, capWho, capTitle, capText);
  const range = h('input', { type: 'range', min: '1', max: String(STEPS.length), value: '1', 'aria-label': 'Step' });
  const playBtn = h('button', { class: 'icon', type: 'button', 'aria-label': 'Play' });
  const prevBtn = h('button', { class: 'icon sec', type: 'button', 'aria-label': 'Previous step' }, ico('M15 18l-6-6 6-6'));
  const nextBtn = h('button', { class: 'icon sec', type: 'button', 'aria-label': 'Next step' }, ico('M9 6l6 6-6 6'));
  const stepText = h('span', { class: 'muted', style: 'min-width:5.5rem;text-align:center;font-variant-numeric:tabular-nums' });
  const setPlayIcon = (playing) => { playBtn.replaceChildren(ico(playing ? 'M8 5v14M16 5v14' : 'M7 4l13 8-13 8z')); playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play'); };

  function go(i) {
    idx = Math.max(0, Math.min(STEPS.length - 1, i));
    const s = STEPS[idx];
    chart.apply(idx);
    capWho.textContent = `Step ${idx + 1} of ${STEPS.length} · ${s.who}`; capTitle.textContent = s.title; capText.textContent = s.text;
    fReads.lastChild.textContent = s.reads; fStops.lastChild.textContent = s.stops; fRisk.lastChild.textContent = s.risk;
    range.value = String(idx + 1); stepText.textContent = `${idx + 1} / ${STEPS.length}`;
    prevBtn.disabled = idx === 0; nextBtn.disabled = idx === STEPS.length - 1;
  }
  function play() {
    if (timer) return;
    if (idx >= STEPS.length - 1) go(0);
    setPlayIcon(true);
    timer = setInterval(() => { if (idx >= STEPS.length - 1) { pause(); return; } go(idx + 1); }, 5200);
  }
  function pause() { if (timer) { clearInterval(timer); timer = null; } setPlayIcon(false); }
  playBtn.addEventListener('click', () => (timer ? pause() : play()));
  prevBtn.addEventListener('click', () => { pause(); go(idx - 1); });
  nextBtn.addEventListener('click', () => { pause(); go(idx + 1); });
  range.addEventListener('input', () => { pause(); go(Number(range.value) - 1); });

  fill(root, [h('div', { class: 'flow' }, chartHost, cap, h('div', { class: 'flow-facts' }, fReads, fStops, fRisk), h('div', { class: 'flow-ctl' }, prevBtn, playBtn, nextBtn, range, stepText))]);
  layout(); go(0); setPlayIcon(false);
  if (mq) { const onChange = () => { layout(); }; if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange); }
  if (!reduce && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => { if (!played && entries.some((e) => e.isIntersecting)) { played = true; play(); io.disconnect(); } }, { threshold: 0.5 });
    io.observe(root);
  }
  return { go, play, pause, layout: () => (tall ? 'tall' : 'wide') };
}

/* ---------- Role task flows (what steps a person follows) ---------- */
export const TASKS = {
  setter: { title: 'Setter: submit my questions', steps: [
    ['Sign in', 'password and key file'], ['Open my assigned cell', 'topic and difficulty'], ['Write 5 questions', 'only my own are visible'], ['Submit', 'signed and encrypted on my device'],
    { t: 'Accepted?', s: 'size, signature, deadline', decide: true }, { t: 'If refused', s: 'a clear reason; fix and resubmit', fail: true }, ['Get a receipt', 'with a receipt ID'], ['If a case names me', 'I can read it and reply'] ] },
  admin: { title: 'Exam authority: prepare a paper', steps: [
    ['Set the exam profile', 'size, shifts, blueprint'], ['Assign setters and reviewers', 'to cells and subsets'], ['Lock the pool', 'no more submissions'], ['Commit a seed', 'before the lock'],
    ['Start the draw', 'inside the quotas'], { t: 'Balance report ok?', s: 'counts only, no text', decide: true }, { t: 'If not', s: 'see which rule failed; redraw is logged', fail: true }, ['Start sealing', 'custodians approve next'] ] },
  custodian: { title: 'Custodian: approve a release', steps: [
    ['Get a request', 'centre, exam, time window'], ['See quorum status', 'for example 2 of 3'], { t: 'Does it match what I expect?', s: 'centre and window', decide: true }, { t: 'If not', s: 'decline; the refusal is logged', fail: true },
    ['Approve with my key', 'one signature'], ['See progress', 'quorum reached or waiting'], ['Done', 'my approval is in the log'] ] },
  centre: { title: 'Centre superintendent: print the paper', steps: [
    ['Seat the candidates', 'check-in done'], ['Send the seating report', 'signed'], ['Receive the token', 'with the time window'], { t: 'All four checks green?', s: 'seating, token, quorum, window', decide: true },
    { t: 'If not', s: 'nothing prints; the screen says what is missing; fallback is logged', fail: true }, ['Press Print', 'one copy per candidate'], ['Check the copy IDs', 'match the seat list'], ['Hand out and close', 'session logged'] ] },
  investigator: { title: 'Investigator: trace a leak', steps: [
    ['Open a case', 'only my assigned cases'], ['Paste leaked text', 'or upload a photo'], ['See matches', 'questions and copies'], { t: 'Does it show a seat or stage?', s: 'confidence shown', decide: true },
    ['Review suspects', 'reasons and confidence'], ['Confirm or dismiss', 'a person decides'], ['Named person is told', 'and can reply before any action'] ] },
};

export function mountTaskFlows(root) {
  const keys = Object.keys(TASKS);
  const panels = {};
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Roles' });
  const body = h('div', { style: 'display:grid;gap:14px;width:100%' });
  const short = { setter: 'Setter', admin: 'Authority', custodian: 'Custodian', centre: 'Centre', investigator: 'Investigator' };
  for (const k of keys) {
    const t = TASKS[k];
    const ol = h('ol', { class: 'taskflow' }, t.steps.map((s) => {
      const o = Array.isArray(s) ? { t: s[0], s: s[1] } : s;
      return h('li', { class: (o.decide ? 'decide ' : '') + (o.fail ? 'fail' : '') }, o.t, h('small', null, o.s));
    }));
    panels[k] = h('div', { class: 'panel', role: 'tabpanel', hidden: true }, h('h3', { style: 'margin-bottom:12px;text-align:left' }, t.title), ol);
    tabs.append(h('button', { type: 'button', role: 'tab', 'aria-selected': 'false', 'data-k': k, onclick: () => show(k) }, short[k]));
    body.append(panels[k]);
  }
  function show(k) {
    keys.forEach((x) => { panels[x].hidden = x !== k; });
    tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.k === k)));
  }
  fill(root, [tabs, body]); show('centre');
}

