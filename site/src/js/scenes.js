// The four working scenes. Each mount function builds its UI inside `root` and returns a controller.
// hooks.onAction() is called on every user interaction (used to count actions in the usability test).
import LP from './logic.mjs';
import { h, fill, svg, cryptoOk } from './dom.js';
import { SAMPLES, demoPaper } from './paper.js';

export const EXAM_SECRET = 'leakproof-demo-exam-2026';   // must match tests/logic.test.mjs
export const QUESTIONS = SAMPLES;                          // the fixed paper used in the usability test
const LETTERS = ['a', 'b', 'c', 'd'];
// Scenes 2 and 3 show whatever is on the demo paper (samples, or questions the visitor added).
// The usability test passes hooks.paper = SAMPLES so every participant sees the same thing.
const paperFor = (hooks) => (hooks && hooks.paper) || demoPaper().get();
const noop = () => {};

/* ---------- Scene 1: many writers, late draw ---------- */
export function mountScene1(root, hooks = {}) {
  const act = hooks.onAction || noop;
  const pool = LP.buildPool();
  const order = LP.shuffle(pool.setters.map((s) => s.id), LP.rngFrom('slider-order'));
  let draws = 0;
  const out = h('b', null, '5');
  const slider = h('input', { type: 'range', id: 's1-n-' + Math.random().toString(36).slice(2, 7), min: '0', max: '20', value: '5', 'aria-label': 'Number of setters who leak' });
  const squares = h('div', { class: 'squares', role: 'img', 'aria-label': 'The 15 questions on the paper. Red ones are known to the leakers.' });
  const verdict = h('p', { class: 'verdict', role: 'status', 'aria-live': 'polite' });
  function render() {
    const n = Number(slider.value);
    out.textContent = String(n);
    const leak = new Set(order.slice(0, n));
    const paper = LP.drawPaper(pool, 'scene1|' + draws);
    const e = LP.exposure(paper, leak);
    fill(squares, paper.map((q) => h('div', { class: 'sq' + (leak.has(q.setter) ? ' leak' : '') })));
    const avg = LP.expectedExposure(pool, leak);
    fill(verdict, n === 0
      ? [h('span', null, 'No one leaks. Nothing is exposed.')]
      : [h('span', null, `${n} ${n === 1 ? 'setter leaks' : 'setters leak'} ${n * 5} questions. ` + (e.count === 15 ? 'All 15 are on the paper.' : e.count === 0 ? 'None of the 15 are on the paper.' : `Only ${e.count} of 15 are on the paper.`)),
         h('span', { class: 'sub' }, `About ${avg.toFixed(1)} of 15 on average, and nobody can tell which in advance.`)]);
  }
  slider.addEventListener('input', () => { act('slider'); render(); });
  const again = h('button', { class: 'link-btn', type: 'button', onclick: () => { act('redraw'); draws++; render(); } }, 'Draw the paper again');
  fill(root, [h('div', { class: 'card' },
    h('label', { class: 'slider-label' }, 'Setters who leak their questions: ', out, ' of 20', h('br'), slider),
    squares, verdict, again)]);
  render();
  return { state: () => ({ leakers: Number(slider.value) }) };
}

/* ---------- Scene 2: split key, real encryption ---------- */
export function mountScene2(root, hooks = {}) {
  const act = hooks.onAction || noop;
  const K = 3, N = 5;
  const shackle = svg('path', { d: 'M8 11V7a4 4 0 0 1 8 0v4' });
  const lock = svg('svg', { class: 'lock', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, svg('rect', { x: '5', y: '11', width: '14', height: '10', rx: '2' }), shackle);
  const pre = h('pre', { 'aria-live': 'polite' });
  const vault = h('div', { class: 'vault' }, lock, pre);
  const keysBox = h('div', { class: 'keys', role: 'group', 'aria-label': 'Key holders. Tap to add a key.' });
  const verdict = h('p', { class: 'verdict', role: 'status', 'aria-live': 'polite' });
  fill(root, [h('div', { class: 'card' }, vault, keysBox, verdict)]);
  if (!cryptoOk()) { pre.textContent = 'This browser blocks encryption on this page. Open it in a current Chrome, Safari or Firefox over https.'; return {}; }

  const qs = paperFor(hooks);
  const paperText = 'SAMPLE PAPER\n' + qs.map((q, i) => `${i + 1}. ${q.text}\n   ` + q.options.map((o, j) => `${LETTERS[j]}) ${o}`).join('  ')).join('\n');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(15));
  let secret = 0n; for (const b of bytes) secret = (secret << 8n) | BigInt(b);
  const shares = LP.makeShares(secret, K, N);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const approved = new Set();
  let ciphertext = null, cipherHex = '', token = 0, unlockedOnce = false;

  function renderKeys() {
    fill(keysBox, shares.map((s) => {
      const on = approved.has(s.x);
      return h('button', { type: 'button', class: 'key', 'aria-pressed': on ? 'true' : 'false', 'aria-label': 'Key ' + s.x + (on ? ', added' : ''),
        onclick: () => { act('key'); if (approved.has(s.x)) approved.delete(s.x); else approved.add(s.x); renderKeys(); render(); } },
        h('span', null, String(s.x), h('small', null, 'key')));
    }));
  }
  async function render() {
    const mine = ++token;
    const chosen = shares.filter((s) => approved.has(s.x));
    const n = chosen.length;
    let text = null;
    if (n >= K) text = await LP.open(ciphertext, LP.combine(chosen), iv);
    if (mine !== token) return;
    if (text !== null) {
      unlockedOnce = true;
      vault.classList.add('open'); shackle.setAttribute('d', 'M8 11V7a4 4 0 0 1 7.5-1.5');
      pre.textContent = text;
      fill(verdict, [h('span', { class: 'ok' }, 'Unlocked.'), h('span', { class: 'sub' }, `${n} people agreed: keys ${chosen.map((s) => s.x).join(', ')}.`)]);
      if (hooks.onComplete) hooks.onComplete('unlocked');
    } else {
      vault.classList.remove('open'); shackle.setAttribute('d', 'M8 11V7a4 4 0 0 1 8 0v4');
      pre.textContent = cipherHex.slice(0, 96) + '\n' + cipherHex.slice(96, 192);
      fill(verdict, n === 0
        ? [h('span', null, 'Locked. Tap keys to add them.')]
        : [h('span', null, `${n} of ${K} keys. ${K - n} more needed.`), h('span', { class: 'sub' }, `With ${n} key${n > 1 ? 's' : ''}, the paper reveals nothing.`)]);
    }
  }
  (async () => {
    ciphertext = await LP.seal(paperText, secret, iv);
    cipherHex = LP.toHex(ciphertext);
    renderKeys(); render();
  })();
  return { state: () => ({ keys: approved.size, unlocked: unlockedOnce }) };
}

/* ---------- Scene 3: every copy is different ---------- */
export function mountScene3(root, hooks = {}) {
  const act = hooks.onAction || noop;
  const qs = paperFor(hooks);
  let seat = 14, topOnly = false;
  const photo = h('ol');
  const keyLine = h('p', { class: 'sub mono', 'aria-live': 'polite' });
  const dots = h('div', { class: 'dots', role: 'img', 'aria-label': '200 seats. Blue seats could have produced the photo.' });
  fill(dots, Array.from({ length: 200 }, () => h('div', { class: 'dot' })));
  const verdict = h('p', { class: 'verdict', role: 'status', 'aria-live': 'polite' });
  const bWhole = h('button', { type: 'button', 'aria-pressed': 'true', onclick: () => { act('whole'); topOnly = false; render(); } }, 'Whole page');
  const bTop = h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => { act('top'); topOnly = true; render(); } }, 'Top question only');
  const another = h('button', { class: 'link-btn', type: 'button', onclick: () => { act('newphoto'); seat = 1 + Math.floor(Math.random() * 200); render(); } }, 'Try another photo');
  fill(root, [h('div', { class: 'card' },
    h('div', { class: 'photo', 'aria-label': 'A photo of a leaked page' }, photo),
    keyLine,
    h('div', { class: 'seg', role: 'group', 'aria-label': 'How much of the page is in the photo' }, bWhole, bTop),
    dots, verdict, another)]);
  let lastMatches = 0;
  function render() {
    const copy = LP.copyFor(EXAM_SECRET, seat);
    const visible = topOnly ? 1 : 4;
    fill(photo, copy.order.map((qi, pos) => {
      const q = qs[qi];
      return h('li', { class: pos >= visible ? 'hide' : '' }, q.text,
        h('div', { class: 'opts' }, copy.optionOrders[pos].map((oj, k) => h('span', null, LETTERS[k] + ') ' + q.options[oj]))));
    }));
    const key = LP.answerKeyFor(copy, qs);
    keyLine.textContent = key.every((k) => k) ? 'Answer key for this copy: ' + key.map((k, i) => `${i + 1}${k}`).join('  ') + '  (it differs on every copy)' : '';
    const matches = new Set(LP.traceSeats(EXAM_SECRET, 200, LP.visibleFingerprint(copy, visible), visible));
    lastMatches = matches.size;
    Array.from(dots.children).forEach((d, i) => d.classList.toggle('hit', matches.has(i + 1)));
    fill(verdict, matches.size === 1
      ? [h('span', null, `Seat ${Array.from(matches)[0]}.`), h('span', { class: 'sub' }, 'Only one seat prints this page.')]
      : [h('span', null, `${matches.size} seats could match.`), h('span', { class: 'sub' }, 'Too little shows to name one. We never blame one person on thin evidence.')]);
    bWhole.setAttribute('aria-pressed', topOnly ? 'false' : 'true');
    bTop.setAttribute('aria-pressed', topOnly ? 'true' : 'false');
    if (hooks.onComplete && topOnly) hooks.onComplete('top-traced');
  }
  render();
  return { state: () => ({ topOnly, matches: lastMatches }) };
}

/* ---------- Scene 4: tamper-evident log ---------- */
export function mountScene4(root, hooks = {}) {
  const act = hooks.onAction || noop;
  const logBox = h('div', { class: 'log' });
  const fp = h('div', { class: 'fp' });
  const verdict = h('p', { class: 'verdict', role: 'status', 'aria-live': 'polite' });
  const go = h('button', { class: 'btn', type: 'button' }, 'Change a record');
  fill(root, [h('div', { class: 'card' }, logBox, fp, verdict, go)]);
  if (!cryptoOk()) { fill(verdict, [h('span', null, 'This browser blocks encryption on this page.')]); go.disabled = true; return {}; }
  const sample = [
    { index: 1, time: '09:14', actor: 'System', action: 'Paper sealed' },
    { index: 2, time: '10:41', actor: 'Authority', action: 'Token issued for Centre 118' },
    { index: 3, time: '10:55', actor: 'Centre 118', action: 'Seating report received' },
    { index: 4, time: '11:02', actor: 'Centre 118', action: 'Key rebuilt, 240 copies printed' },
  ];
  let original, published, chain, step = 0, bad = -1, reached = 0;
  const intact = () => fill(verdict, [h('span', { class: 'ok' }, 'The log is intact.'), h('span', { class: 'sub' }, 'Every entry matches, and the last fingerprint matches the published one.')]);
  function render() {
    fill(logBox, chain.map((e, i) => h('div', { class: 'entry' + (i === bad ? ' bad' : '') }, h('span', null, `${e.time} · ${e.action}`), h('span', { class: 'state' }, i === bad ? 'Changed' : 'Intact'))));
    const now = LP.headOf(chain);
    fill(fp, [h('span', null, 'Published earlier: ' + published.slice(0, 20) + '…'), h('span', { class: now === published ? '' : 'no' }, 'Log now: ' + now.slice(0, 20) + '…')]);
    go.textContent = step === 0 ? 'Change a record' : step === 1 ? 'Try to cover it up' : 'Start over';
  }
  async function advance() {
    act('step');
    if (step === 0) {
      chain = original.map((e) => ({ ...e })); chain[1].action = 'Token issued for Centre 999';
      bad = (await LP.verifyChain(chain)).firstBad; step = 1; render();
      fill(verdict, [h('span', { class: 'no' }, 'Caught.'), h('span', { class: 'sub' }, 'That record no longer matches its fingerprint.')]);
    } else if (step === 1) {
      chain = await LP.rewriteFrom(chain, 1); bad = -1; step = 2; render(); reached = 2;
      const ok = (await LP.verifyChain(chain)).ok;
      fill(verdict, [h('span', { class: 'no' }, 'Still caught.'), h('span', { class: 'sub' }, (ok ? 'The log looks consistent on its own, but' : 'The log is broken, and') + ' the last fingerprint no longer matches the one published earlier.')]);
      if (hooks.onComplete) hooks.onComplete('cover-up-caught');
    } else { chain = original; bad = -1; step = 0; render(); intact(); }
  }
  go.addEventListener('click', advance);
  (async () => { original = await LP.buildChain(sample); published = LP.headOf(original); chain = original; render(); intact(); })();
  return { state: () => ({ step, reached }) };
}

export const SCENES = { 1: mountScene1, 2: mountScene2, 3: mountScene3, 4: mountScene4 };
