// Role prototypes (mid-fidelity, clickable) and the storyboard.
import LP from './logic.mjs';
import { h, svg, fill, $ } from './dom.js';
import { QUESTIONS } from './scenes.js';

const notes = (what, decisions, challenge) => h('div', { class: 'proto-notes' },
  h('div', null, h('h4', null, 'What this screen is for'), h('p', null, what)),
  h('div', null, h('h4', null, 'Design decisions'), h('ul', null, decisions.map((d) => h('li', null, d)))),
  h('div', null, h('h4', null, 'What we want you to challenge'), h('ul', null, challenge.map((d) => h('li', null, d)))));

function device(title, subtitle, screen, desktop = false) {
  return h('div', { class: 'device' + (desktop ? ' desktop' : '') }, h('div', { class: 'dh' }, h('b', null, title), h('span', null, subtitle)), screen);
}

/* ---------- Setter ---------- */
function setterProto() {
  const state = { n: 0, texts: ['', '', '', '', ''], done: false, receipt: '' };
  const screen = h('div', { class: 'screen' });
  const wrap = h('div', { class: 'proto-layout' });
  function render() {
    if (state.done) {
      fill(screen, [h('h4', null, 'Submitted'), h('div', { class: 'note good' }, 'Signed and encrypted on your device. No one else can read your questions.'),
        h('div', { class: 'row' }, h('span', null, 'Receipt'), h('b', { class: 'mono' }, state.receipt)),
        h('p', { class: 'muted' }, 'You can view your questions until the pool locks on the exam authority\'s date. After that you will see only their status.'),
        h('button', { class: 'btn small outline', type: 'button', onclick: () => { Object.assign(state, { n: 0, texts: ['', '', '', '', ''], done: false }); render(); } }, 'Start again')]);
      return;
    }
    const ta = h('textarea', { class: 'field-box', rows: '4', 'aria-label': `Question ${state.n + 1}`, placeholder: 'Write the question and its four options' }, '');
    ta.value = state.texts[state.n];
    const filled = state.texts.filter((t) => t.trim().length >= 10).length;
    const next = h('button', { class: 'btn small', type: 'button', disabled: state.texts[state.n].trim().length < 10 }, state.n === 4 ? 'Review and submit' : 'Next question');
    ta.addEventListener('input', () => { state.texts[state.n] = ta.value; next.disabled = ta.value.trim().length < 10; prog.firstChild.style.width = Math.round((state.texts.filter((t) => t.trim().length >= 10).length / 5) * 100) + '%'; });
    const prog = h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '5' }, h('i', { style: `width:${filled * 20}%` }));
    next.addEventListener('click', () => {
      if (state.n < 4) { state.n++; render(); return; }
      if (state.texts.some((t) => t.trim().length < 10)) { state.n = state.texts.findIndex((t) => t.trim().length < 10); render(); return; }
      state.done = true; state.receipt = 'LP-' + Math.random().toString(16).slice(2, 8).toUpperCase(); render();
    });
    fill(screen, [h('div', { class: 'row' }, h('b', null, 'Your cell'), h('span', { class: 'badge' }, 'Physics · Mechanics · Medium')),
      h('p', { class: 'muted' }, `Question ${state.n + 1} of 5. Only you can see this.`), prog, ta,
      h('div', { class: 'row' }, h('button', { class: 'link-btn', type: 'button', disabled: state.n === 0, onclick: () => { state.n--; render(); } }, 'Back'), next)]);
  }
  render();
  fill(wrap, [device('Setter portal', 'phone', screen),
    notes('Let a setter write and submit their few questions without learning anything about cryptography.',
      ['One question per screen, with progress, so the task feels small.', 'Signing and encryption happen on submit; the person only sees a receipt.', 'The screen says plainly who can and cannot read their questions.'],
      ['Would you trust a receipt as proof your questions were safe?', 'Is "signed and encrypted" meaningful to a teacher, or should we say something else?', 'What would stop you submitting on time?'])]);
  return wrap;
}

/* ---------- Custodian ---------- */
function custodianProto() {
  const state = { approved: 2, confirmed: false, status: 'waiting', mismatch: false };
  const screen = h('div', { class: 'screen' });
  function render() {
    const done = state.status === 'approved', declined = state.status === 'declined';
    const confirm = h('input', { type: 'checkbox', id: 'cust-ok', onchange: (e) => { state.confirmed = e.target.checked; ok.disabled = !state.confirmed; } });
    confirm.checked = state.confirmed;
    const ok = h('button', { class: 'btn small', type: 'button', disabled: !state.confirmed || done || declined, onclick: () => { state.approved = 3; state.status = 'approved'; render(); } }, 'Approve with my key');
    fill(screen, [h('h4', null, 'Release request'),
      h('div', { class: 'row' }, h('span', null, 'Centre'), h('b', null, state.mismatch ? 'Centre 207' : 'Centre 118')),
      h('div', { class: 'row' }, h('span', null, 'Window'), h('b', null, '10:00 to 11:00')),
      h('div', { class: 'row' }, h('span', null, 'Quorum'), h('b', null, `${state.approved} of 3 approved`)),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '3', 'aria-valuenow': String(state.approved) }, h('i', { style: `width:${Math.round(state.approved / 3 * 100)}%` })),
      state.mismatch ? h('div', { class: 'note bad' }, 'This does not match the centre you were told about. Decline and tell the authority.') : null,
      done ? h('div', { class: 'note good' }, 'Approved. Quorum reached. Your approval is in the log.') : null,
      declined ? h('div', { class: 'note bad' }, 'Declined. The refusal is in the log.') : null,
      !done && !declined ? h('label', { for: 'cust-ok', style: 'display:flex;gap:8px;align-items:center;color:var(--ink)' }, confirm, 'I have checked the centre and the window against what I was told.') : null,
      h('div', { class: 'row' }, ok, h('button', { class: 'link-btn', type: 'button', disabled: done || declined, onclick: () => { state.status = 'declined'; render(); } }, 'Decline')),
      h('div', { class: 'row' }, h('button', { class: 'link-btn', type: 'button', onclick: () => { Object.assign(state, { approved: 2, confirmed: false, status: 'waiting' }); render(); } }, 'Reset'),
        h('button', { class: 'link-btn', type: 'button', onclick: () => { state.mismatch = !state.mismatch; Object.assign(state, { approved: 2, confirmed: false, status: 'waiting' }); render(); } }, state.mismatch ? 'Show the normal request' : 'Show a mismatched request'))]);
  }
  render();
  return h('div', { class: 'proto-layout' }, device('Custodian', 'phone', screen),
    notes('Let one of several key holders approve a release, only after checking it is the right centre and time.',
      ['A required check before the approve button works, so approval is deliberate.', 'Decline is as visible as approve, and is logged.', 'The progress bar shows a person is one of several, which is the point of the design.'],
      ['Would a real custodian actually check, or tick the box to move on?', 'What if the custodian is not near a device at the time?', 'Is one signature on a phone enough for something this important?']));
}

/* ---------- Centre ---------- */
function centreProto() {
  const state = { seated: true, token: true, approvals: 2, minutes: 75, printing: false, progress: 0, done: false, msg: null };
  const screen = h('div', { class: 'screen' });
  let timer = null;
  function chk() { return LP.releaseCheck({ approvals: state.approvals, k: 3, seated: state.seated, minutesToStart: state.minutes, windowMinutes: 60 }); }
  function render() {
    const c = chk(), inWindow = state.minutes >= 0 && state.minutes <= 60;
    const row = (ok, text) => h('li', { class: ok ? 'ok' : 'no' }, h('span', { class: 'mark' }, ok ? '✓' : '!'), text);
    const print = h('button', { class: 'btn', type: 'button', disabled: state.printing || state.done, onclick: onPrint }, state.done ? 'Printed' : 'Print 240 copies');
    fill(screen, [h('h4', null, 'Print the paper'),
      h('ul', { class: 'checklist' }, row(state.seated, 'Seating report sent'), row(state.token, 'Token received from the authority'),
        row(state.approvals >= 3, `Custodian approvals: ${state.approvals} of 3`), row(inWindow, `Inside the print window (starts in ${state.minutes} min; window opens at 60)`)),
      h('div', { class: 'row' }, print, h('span', { class: 'muted' }, c.ok ? 'All checks passed' : 'Waiting')),
      state.printing || state.done ? h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '240', 'aria-valuenow': String(state.progress) }, h('i', { style: `width:${Math.round(state.progress / 240 * 100)}%` })) : null,
      state.printing ? h('p', { class: 'mono muted' }, `Printing copy ${LP.copyId(Math.max(1, state.progress))}`) : null,
      state.done ? h('div', { class: 'note good' }, '240 copies printed, each with its own order and copy ID. Logged.') : null,
      state.msg ? h('div', { class: 'note bad' }, state.msg) : null,
      h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' },
        h('button', { class: 'btn small outline', type: 'button', onclick: () => { state.approvals = Math.min(3, state.approvals + 1); state.msg = null; render(); } }, 'A custodian approves'),
        h('button', { class: 'btn small outline', type: 'button', onclick: () => { state.minutes = state.minutes > 60 ? 45 : 120; state.msg = null; render(); } }, 'Move the clock'),
        h('button', { class: 'btn small outline', type: 'button', onclick: () => { state.seated = !state.seated; state.msg = null; render(); } }, state.seated ? 'Unseat candidates' : 'Seat candidates'),
        h('button', { class: 'link-btn', type: 'button', onclick: reset }, 'Reset'))]);
  }
  function onPrint() {
    const c = chk();
    if (!state.token) { state.msg = 'Nothing printed. No token from the authority.'; render(); return; }
    if (!c.ok) { state.msg = 'Nothing printed. Missing: ' + c.missing.join('; ') + '.'; render(); return; }
    state.msg = null; state.printing = true; state.progress = 0; render();
    timer = setInterval(() => { state.progress = Math.min(240, state.progress + 20); if (state.progress >= 240) { clearInterval(timer); state.printing = false; state.done = true; } render(); }, 180);
  }
  function reset() { if (timer) clearInterval(timer); Object.assign(state, { seated: true, token: true, approvals: 2, minutes: 75, printing: false, progress: 0, done: false, msg: null }); render(); }
  render();
  return h('div', { class: 'proto-layout' }, device('Centre print screen', 'laptop', screen, true),
    notes('Let a superintendent print the paper safely, under time pressure, and know exactly why if it will not print.',
      ['Four checks in plain words, each with a tick, so the state is clear at a glance.', 'The print button always shows what is missing when it refuses. Nothing prints on a partial pass (fail closed).', 'The buttons under the screen simulate real events so you can try failures.'],
      ['Is "nothing prints" acceptable with candidates waiting? What should the fallback be?', 'Which check would staff most likely try to bypass?', 'What would you want on this screen that is missing?']));
}

/* ---------- Investigator ---------- */
function investigatorProto() {
  const sample = 'Q: what is the chemical symbol for sodium? (Na, K, S, Sn) paper leaked on telegram';
  const ta = h('textarea', { class: 'field-box', rows: '4', 'aria-label': 'Leaked text' });
  ta.value = sample;
  const out = h('div', { style: 'display:grid;gap:10px' });
  const screen = h('div', { class: 'screen' }, h('h4', null, 'Leak case LC-014'), h('label', null, 'Paste text found online', ta),
    h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', onclick: find }, 'Find matches'), h('button', { class: 'link-btn', type: 'button', onclick: () => { ta.value = sample; fill(out, []); } }, 'Reset')), out);
  function find() {
    const texts = QUESTIONS.map((q) => q.text + ' ' + q.options.join(' '));
    const r = LP.matchLeak(ta.value, texts)[0];
    if (!ta.value.trim() || r.score < 0.35) { fill(out, [h('div', { class: 'note' }, 'No question in our pool matches this text well enough. Nothing to attribute.')]); return; }
    const conf = r.score >= 0.7 ? 'High' : 'Medium';
    const decided = h('div');
    const decide = (txt) => fill(decided, [h('div', { class: 'note good' }, txt)]);
    fill(out, [h('div', { class: 'fact' }, h('b', null, 'Best match'), `Question ${r.index + 1} of the sample paper (${Math.round(r.score * 100)}% word overlap)`),
      h('div', { class: 'fact' }, h('b', null, 'Where it had reached'), 'It is on the printed paper, so it was exposed after the draw. The setter alone is not the likely source.'),
      h('div', { class: 'fact' }, h('b', null, 'Likely sources'), 'Centre-level handling at the stage of printing or the hall, not the question setters. Confidence: ' + conf + '. This is evidence, not proof.'),
      h('div', { class: 'note' }, 'A person must review this before anyone is contacted. Anyone named can respond.'),
      h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' },
        h('button', { class: 'btn small outline', type: 'button', onclick: () => decide('Marked as confirmed by you. The named centre is notified and can reply. Logged.') }, 'Confirm for review'),
        h('button', { class: 'btn small outline', type: 'button', onclick: () => decide('Dismissed. The reason is recorded.') }, 'Dismiss')), decided]);
  }
  find();
  return h('div', { class: 'proto-layout' }, device('Investigator', 'laptop', screen, true),
    notes('Help an investigator link leaked text to the paper and to a stage, with honest confidence, before any person is blamed.',
      ['Plain "evidence, not proof" language and a mandatory human review step.', 'It shows the stage the item had reached, because a leak after the draw does not implicate the setter.', 'Anyone named can reply before action (a privacy and fairness requirement).'],
      ['Is the confidence label understandable, or would you read it as a verdict?', 'What would you need to see before acting on this?', 'How should a person named in a case be told?']));
}

/* ---------- Storyboard ---------- */
const S = (...kids) => svg('svg', { viewBox: '0 0 200 96', role: 'img', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, ...kids);
const person = (x, y) => [svg('circle', { cx: x, cy: y, r: 7 }), svg('path', { d: `M${x - 10} ${y + 26}v-8a10 10 0 0 1 20 0v8` })];
const PANELS = [
  { b: 'Seated and ready', t: 'The superintendent checks candidates in and sends a signed seating report.', art: S(...person(40, 34), ...person(90, 34), ...person(140, 34), svg('path', { d: 'M20 82h160' })) },
  { b: 'Three keys', t: 'Three custodians, in different places, approve on their own devices.', art: S(...[40, 100, 160].flatMap((x) => [svg('circle', { cx: x, cy: 40, r: 10 }), svg('path', { d: `M${x + 10} 40h16M${x + 20} 40v7M${x + 26} 40v7` })])) },
  { b: 'The paper opens', t: 'Only now is the key rebuilt. If anything were missing, nothing would print.', art: S(svg('rect', { x: 70, y: 40, width: 60, height: 40, rx: 6 }), svg('path', { d: 'M82 40v-10a18 18 0 0 1 34-6' })) },
  { b: 'Every copy differs', t: 'Each copy prints with its own order and copy ID.', art: S(...[0, 1, 2].map((k) => svg('rect', { x: 40 + k * 40, y: 22 + k * 4, width: 36, height: 50, rx: 4 })), svg('path', { d: 'M48 36h20M48 46h14M88 40h20M88 50h14M128 44h20M128 54h14' })) },
  { b: 'A photo leaks', t: 'A page appears online. It shows only the top of the page.', art: S(svg('rect', { x: 70, y: 14, width: 60, height: 70, rx: 6 }), svg('path', { d: 'M80 30h40' }), svg('path', { d: 'M80 42h40M80 54h40', 'stroke-opacity': '0.25' }), svg('circle', { cx: 150, cy: 70, r: 12 }), svg('path', { d: 'M159 79l12 12' })) },
  { b: 'We trace it', t: 'The tool lists the seats that could match and a person reviews before anyone is named.', art: S(svg('circle', { cx: 100, cy: 48, r: 24 }), svg('path', { d: 'M90 48l7 7 14-14' }), svg('circle', { cx: 40, cy: 24, r: 4 }), svg('circle', { cx: 160, cy: 70, r: 4 }), svg('circle', { cx: 150, cy: 20, r: 4 })) },
];
function storyboard() {
  return h('ol', { class: 'story' }, PANELS.map((p) => h('li', null, p.art, h('p', null, h('b', null, p.b), p.t))));
}

/* ---------- Mount ---------- */
const BUILDERS = { setter: setterProto, custodian: custodianProto, centre: centreProto, investigator: investigatorProto };
const root = $('#proto-root');
if (root) {
  const labels = { setter: 'Setter', custodian: 'Custodian', centre: 'Centre', investigator: 'Investigator' };
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Prototype screens' });
  const stage = h('div', { style: 'width:100%' });
  function show(k) {
    fill(stage, [BUILDERS[k]()]);
    tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.k === k)));
    history.replaceState(null, '', '#' + k);
  }
  for (const k of Object.keys(BUILDERS)) tabs.append(h('button', { type: 'button', role: 'tab', 'data-k': k, 'aria-selected': 'false', onclick: () => show(k) }, labels[k]));
  fill(root, [tabs, stage]);
  const start = location.hash.slice(1);
  show(BUILDERS[start] ? start : 'centre');
}
const sb = $('#storyboard'); if (sb) sb.replaceWith(storyboard());
