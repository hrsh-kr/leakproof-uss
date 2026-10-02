// UI behaviour in a browser-like environment: question form, scenes, flowchart animation, voice.
// Voice is switched off in production (src/js/config.mjs). These tests switch it on to keep the code verified.
globalThis.__LP_VOICE = true;
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, click, type, tick, text, fakeSpeech } from './dom-env.mjs';

const Rec = fakeSpeech();
setupDom('index', { speech: Rec });

const { mountQuestionForm } = await import('../src/js/qform.js');
const { mountJourney, STEPS, TASKS, mountTaskFlows } = await import('../src/js/flow.js');
const { SCENES } = await import('../src/js/scenes.js');
const { voiceControl, voiceSupported } = await import('../src/js/voice.js');
const { createPaper } = await import('../src/js/paper.js');
const { demoPaper } = await import('../src/js/paper.js');

const mk = () => { const el = document.createElement('div'); document.body.append(el); return el; };

/* ---------------- question form ---------------- */
test('question form: four option fields, formats as you type, registers a clean question', () => {
  const root = mk(); const got = [];
  mountQuestionForm(root, { onRegister: (q) => { got.push(q); return 'Added.'; } });
  assert.equal(root.querySelectorAll('input[type=text]').length, 4, 'four option fields');
  assert.equal(root.querySelectorAll('textarea').length, 1, 'one question field');
  assert.equal(root.querySelectorAll('input[type=radio]').length, 4, 'a correct-answer choice per option');
  const [q] = root.querySelectorAll('textarea'); const opts = [...root.querySelectorAll('input[type=text]')];
  type(q, '  q1. which unit measures electric current  ');
  ['a) volt', 'b) ampere', 'c) ohm', 'd) watt'].forEach((v, i) => type(opts[i], v));
  assert.match(text(root.querySelector('.qf-preview')), /Which unit measures electric current\?/);
  assert.match(text(root.querySelector('.qf-preview')), /volt.*ampere.*ohm.*watt/);
  click(root.querySelectorAll('input[type=radio]')[1]);
  assert.ok(root.querySelector('.qf-opts li.ok').textContent.includes('ampere'));
  click([...root.querySelectorAll('button')].find((b) => b.textContent === 'Register' || b.textContent === 'Add question'));
  assert.equal(got.length, 1);
  assert.deepEqual(got[0], { text: 'Which unit measures electric current?', options: ['volt', 'ampere', 'ohm', 'watt'], correct: 1 });
  assert.equal(q.value, '', 'form clears after registering');
  assert.match(text(root.querySelector('[role=status]')), /Added/);
});

test('question form: shows field-level errors only after you try, and does not register bad input', () => {
  const root = mk(); const got = [];
  mountQuestionForm(root, { onRegister: (x) => { got.push(x); return ''; } });
  assert.equal(text(root.querySelectorAll('.rv-err')[0]), '', 'no errors before touching');
  const opts = [...root.querySelectorAll('input[type=text]')];
  type(root.querySelector('textarea'), 'Which one is the right answer?');
  type(opts[0], 'Mars'); type(opts[1], 'mars'); type(opts[2], ''); type(opts[3], 'Venus');
  click(root.querySelector('.btn'));
  assert.equal(got.length, 0);
  const errs = [...root.querySelectorAll('.rv-err')].map(text);
  assert.ok(errs.some((e) => /Same as option A/.test(e)));
  assert.ok(errs.some((e) => /Option C is empty/.test(e)));
  assert.match(text(root.querySelector('[role=status]')), /Fix the highlighted/);
});

test('question form: presets fill every field, and Surprise me avoids what is already on the paper', () => {
  const root = mk(); const used = ['Which unit measures electric current?'];
  mountQuestionForm(root, { usedTexts: () => used, onRegister: () => '' });
  const physics = [...root.querySelectorAll('.chip-btn')].find((b) => b.textContent === 'Physics');
  click(physics);
  assert.equal(root.querySelector('textarea').value, 'Which unit measures electric current?');
  assert.deepEqual([...root.querySelectorAll('input[type=text]')].map((i) => i.value), ['volt', 'ampere', 'ohm', 'watt']);
  assert.equal(root.querySelectorAll('input[type=radio]')[1].checked, true, 'correct answer is pre-ticked');
  const surprise = [...root.querySelectorAll('.chip-btn')].find((b) => b.textContent === 'Surprise me');
  for (let i = 0; i < 12; i++) { click(surprise); assert.notEqual(root.querySelector('textarea').value, used[0]); }
  assert.ok([...root.querySelectorAll('.chip-btn')].length >= 7);
});

test('question form: text is inserted as text, never as HTML', () => {
  const root = mk();
  mountQuestionForm(root, { onRegister: () => '' });
  type(root.querySelector('textarea'), 'What does <img src=x onerror=alert(1)> do?');
  [...root.querySelectorAll('input[type=text]')].forEach((f, i) => type(f, `<b>opt${i}</b>`));
  assert.equal(root.querySelectorAll('.qf-preview img, .qf-preview b').length, 0, 'no element was created from typed text');
  assert.match(root.querySelector('.qf-preview').textContent, /<img src=x onerror=alert\(1\)>/);
});

/* ---------------- demo paper in the scenes ---------------- */
test('scene 2 and 3 use the visitor\'s own question once it is on the paper', async () => {
  demoPaper().reset();
  demoPaper().add({ text: 'Which gas do plants absorb?', options: ['Oxygen', 'Carbon dioxide', 'Helium', 'Neon'], correct: 1 });
  const r3 = mk(); SCENES[3](r3, {});
  assert.ok(text(r3).includes('Which gas do plants absorb?'), 'scene 3 shows the new question');
  assert.match(text(r3.querySelector('.sub.mono')), /Answer key for this copy: 1[abcd] 2[abcd] 3[abcd] 4[abcd]/);
  const r2 = mk(); SCENES[2](r2, {}); await tick(60);
  [0, 2, 4].forEach((i) => click(r2.querySelectorAll('.key')[i])); await tick(60);
  assert.ok(text(r2.querySelector('.vault pre')).includes('Which gas do plants absorb?'), 'decrypted paper contains the new question');
  assert.match(text(r2.querySelector('.vault pre')), /a\) Oxygen\s+b\) Carbon dioxide/);
  demoPaper().reset();
});

test('the usability test paper stays fixed even if the visitor changed the demo paper', async () => {
  demoPaper().add({ text: 'A visitor question that must not leak into the test?', options: ['a', 'b', 'c', 'd'] });
  const { SAMPLES } = await import('../src/js/paper.js');
  const r3 = mk(); SCENES[3](r3, { paper: SAMPLES });
  assert.ok(!text(r3).includes('A visitor question'));
  demoPaper().reset();
});

/* ---------------- scenes ---------------- */
test('scene 1: slider changes the exposure, redraw works, numbers are consistent', () => {
  const root = mk(); let actions = 0; SCENES[1](root, { onAction: () => actions++ });
  const slider = root.querySelector('input[type=range]');
  type(slider, '0'); assert.match(text(root.querySelector('.verdict')), /No one leaks/);
  type(slider, '20'); assert.match(text(root.querySelector('.verdict')), /All 15 are on the paper/);
  type(slider, '5'); assert.match(text(root.querySelector('.verdict')), /5 setters leak 25 questions\. Only \d+ of 15/);
  assert.equal(root.querySelectorAll('.sq').length, 15);
  click(root.querySelector('.link-btn'));
  assert.equal(actions, 4);
});

test('scene 2: real encryption, three keys unlock, two do not', async () => {
  const root = mk(); const events = []; SCENES[2](root, { onComplete: (e) => events.push(e), paper: undefined }); await tick(60);
  assert.match(text(root.querySelector('.verdict')), /Locked/);
  click(root.querySelectorAll('.key')[0]); click(root.querySelectorAll('.key')[1]); await tick(60);
  assert.match(text(root.querySelector('.verdict')), /2 of 3 keys\. 1 more needed/);
  assert.ok(!root.querySelector('.vault').classList.contains('open'));
  click(root.querySelectorAll('.key')[4]); await tick(80);
  assert.match(text(root.querySelector('.verdict')), /Unlocked/);
  assert.ok(root.querySelector('.vault').classList.contains('open'));
  assert.deepEqual(events, ['unlocked']);
  click(root.querySelectorAll('.key')[4]); await tick(60);
  assert.ok(!root.querySelector('.vault').classList.contains('open'), 'taking a key away locks it again');
});

test('scene 3: a whole page names one seat, a partial photo narrows to several', () => {
  const root = mk(); SCENES[3](root, {});
  assert.match(text(root.querySelector('.verdict')), /Seat 14\./);
  assert.equal(root.querySelectorAll('.dot.hit').length, 1);
  click([...root.querySelectorAll('.seg button')][1]);
  assert.match(text(root.querySelector('.verdict')), /\d+ seats could match/);
  assert.ok(root.querySelectorAll('.dot.hit').length > 1);
  assert.equal(root.querySelectorAll('.photo li.hide').length, 3);
});

test('scene 4: change, cover up, still caught, start over', async () => {
  const root = mk(); const events = []; SCENES[4](root, { onComplete: (e) => events.push(e) }); await tick(60);
  const go = root.querySelector('.btn');
  assert.equal(go.textContent, 'Change a record');
  click(go); await tick(60);
  assert.match(text(root.querySelector('.verdict')), /Caught/);
  assert.equal(root.querySelectorAll('.entry.bad').length, 1);
  click(go); await tick(60);
  assert.match(text(root.querySelector('.verdict')), /Still caught.*no longer matches the one published/);
  assert.equal(root.querySelectorAll('.entry.bad').length, 0, 'the log looks fine on its own after the cover-up');
  assert.equal(root.querySelector('.fp .no') !== null, true, 'but the published fingerprint does not match');
  assert.deepEqual(events, ['cover-up-caught']);
  click(go); await tick(60);
  assert.match(text(root.querySelector('.verdict')), /intact/);
});

/* ---------------- animated flowchart ---------------- */
test('flowchart data is complete: eight steps, each with who, what, reads, stops, risk', () => {
  assert.equal(STEPS.length, 8);
  for (const s of STEPS) for (const f of ['short', 'sub', 'who', 'title', 'text', 'reads', 'stops', 'risk']) assert.ok(s[f] && s[f].length > 3, `${s.short}.${f}`);
  assert.deepEqual(STEPS.map((s) => s.short), ['Write', 'Review', 'Draw', 'Seal', 'Deliver', 'Release', 'Print', 'Trace']);
});

test('flowchart: controls move the token, update the caption, light keys and copies, and add log entries', () => {
  const root = mk(); const ctl = mountJourney(root);
  const cap = () => text(root.querySelector('.flow-cap'));
  assert.match(cap(), /Step 1 of 8.*Many people write the questions/);
  const tokenX = () => root.querySelector('.tok-g').style.transform;
  const x0 = tokenX();
  const [prev, play, next] = root.querySelectorAll('.flow-ctl .icon');
  assert.ok(prev.disabled);
  click(next); assert.match(cap(), /Step 2 of 8/); assert.notEqual(tokenX(), x0);
  assert.equal(root.querySelectorAll('.st.on').length, 1);
  const chipOpacity = () => [...root.querySelectorAll('.logchip')].map((c) => c.style.opacity);
  assert.deepEqual(chipOpacity().slice(0, 3), ['1', '1', '0']);
  const keysShown = () => root.querySelector('.key-dot').style.opacity;
  assert.equal(keysShown(), '0');
  root.querySelectorAll('.st')[3].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.match(cap(), /Step 4 of 8/); assert.equal(keysShown(), '1');
  assert.match(root.querySelector('.key-label').textContent, /5 key pieces/);
  root.querySelectorAll('.st')[5].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.match(root.querySelector('.key-label').textContent, /3 of 5 pieces turned/);
  assert.equal(root.querySelectorAll('.key-dot')[0].style.fill, 'var(--accent)');
  assert.equal(root.querySelectorAll('.key-dot')[4].style.fill, 'var(--line)');
  root.querySelectorAll('.st')[6].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const copies = () => [...root.querySelectorAll('.flow svg g[aria-hidden]')].find((g) => g.textContent.includes('different order each')).style.opacity;
  assert.equal(copies(), '1', 'copies appear at the print step');
  assert.match(cap(), /Every copy is different/);
  root.querySelectorAll('.st')[5].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(copies(), '0', 'and are hidden again when you go back');
  root.querySelectorAll('.st')[6].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const range = root.querySelector('input[type=range]'); type(range, '8');
  assert.match(cap(), /Step 8 of 8.*If it leaks anyway/);
  assert.ok(next.disabled, 'cannot go past the last step');
  assert.equal(chipOpacity().every((o) => o === '1'), true, 'every step logged by the end');
  type(range, '1'); assert.match(cap(), /Step 1 of 8/);
  assert.ok(play && ctl.go);
});

test('flowchart: autoplay advances on its own, pauses on request, and stops at the end', (t) => {
  setupDom('index', { speech: Rec, io: true });
  t.mock.timers.enable({ apis: ['setInterval'] });
  const root = document.createElement('div'); document.body.append(root); const ctl = mountJourney(root);   // the observer stub fires at once, so it starts playing
  const cap = () => text(root.querySelector('.flow-cap'));
  const playBtn = root.querySelectorAll('.flow-ctl .icon')[1];
  assert.equal(playBtn.getAttribute('aria-label'), 'Pause', 'it is playing');
  t.mock.timers.tick(5200); assert.match(cap(), /Step 2 of 8/);
  t.mock.timers.tick(5200); assert.match(cap(), /Step 3 of 8/);
  click(playBtn);
  assert.equal(playBtn.getAttribute('aria-label'), 'Play');
  t.mock.timers.tick(20000); assert.match(cap(), /Step 3 of 8/, 'paused means paused');
  click(playBtn);
  t.mock.timers.tick(5200 * 5); assert.match(cap(), /Step 8 of 8/);
  t.mock.timers.tick(5200); assert.equal(playBtn.getAttribute('aria-label'), 'Play', 'stops at the end');
  click(playBtn); assert.match(cap(), /Step 1 of 8/, 'play at the end replays from the start');
  ctl.pause();
});

test('flowchart (phone layout): a vertical track with the same behaviour', () => {
  setupDom('index', { speech: Rec, narrow: true });
  const root = document.createElement('div'); document.body.append(root); const ctl = mountJourney(root);
  assert.equal(ctl.layout(), 'tall');
  assert.equal(root.querySelector('svg').getAttribute('class'), 'tall');
  assert.equal(root.querySelectorAll('.st').length, 8);
  const cap = () => text(root.querySelector('.flow-cap'));
  const token = () => root.querySelector('.tok-g').style.transform;
  const y0 = token();
  const [, , next] = root.querySelectorAll('.flow-ctl .icon');
  click(next); assert.match(cap(), /Step 2 of 8/); assert.notEqual(token(), y0);
  assert.match(token(), /translate\(32px, 11\dpx\)|translate\(32px, \d+px\)/, 'the token moves down the track');
  root.querySelectorAll('.st')[3].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.match(cap(), /Step 4 of 8/);
  assert.equal(root.querySelector('.key-dot').style.opacity, '1');
  root.querySelectorAll('.st')[5].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.match(root.querySelector('.key-label').textContent, /3 of 5 pieces turned/);
  root.querySelectorAll('.st')[6].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const copies = [...root.querySelectorAll('svg g[aria-hidden]')].find((g) => g.textContent.includes('different order each'));
  assert.equal(copies.style.opacity, '1');
  assert.equal([...root.querySelectorAll('.logchip')].filter((c) => c.style.opacity === '1').length, 7);
  type(root.querySelector('input[type=range]'), '8'); assert.match(cap(), /Step 8 of 8/);
  ctl.pause();
});

test('flowchart: resizing between phone and laptop width keeps the current step and the controls', () => {
  setupDom('index', { speech: Rec, narrow: false });
  const root = document.createElement('div'); document.body.append(root); const ctl = mountJourney(root);
  assert.equal(ctl.layout(), 'wide');
  root.querySelectorAll('.st')[4].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.match(text(root.querySelector('.flow-cap')), /Step 5 of 8/);
  window.__setNarrow(true);
  assert.equal(ctl.layout(), 'tall'); assert.equal(root.querySelectorAll('svg.tall').length, 1); assert.equal(root.querySelectorAll('svg.wide').length, 0);
  assert.equal(root.querySelector('.st.on').getAttribute('aria-label'), 'Step 5: Deliver', 'same step highlighted after the switch');
  assert.match(text(root.querySelector('.flow-cap')), /Step 5 of 8/);
  assert.equal([...root.querySelectorAll('.logchip')].filter((c) => c.style.opacity === '1').length, 5);
  window.__setNarrow(false);
  assert.equal(ctl.layout(), 'wide'); assert.equal(root.querySelector('.st.on').getAttribute('aria-label'), 'Step 5: Deliver');
  click(root.querySelectorAll('.flow-ctl .icon')[2]); assert.match(text(root.querySelector('.flow-cap')), /Step 6 of 8/);
  ctl.pause();
});

test('flowchart: with reduced motion it does not autoplay', () => {
  setupDom('index', { speech: Rec, reducedMotion: true, io: true });
  const root = document.createElement('div'); document.body.append(root); mountJourney(root);
  assert.equal(root.querySelectorAll('.flow-ctl .icon')[1].getAttribute('aria-label'), 'Play');
});

test('role task flows: five roles, each with a decision and a failure path, switchable', () => {
  const root = mk(); mountTaskFlows(root);
  assert.equal(Object.keys(TASKS).length, 5);
  for (const [k, t] of Object.entries(TASKS)) {
    const o = t.steps.map((s) => (Array.isArray(s) ? {} : s));
    assert.ok(o.some((s) => s.decide), `${k} has a decision`);
    if (k !== 'investigator') assert.ok(o.some((s) => s.fail), `${k} has a failure path`);
  }
  const tabs = [...root.querySelectorAll('[role=tab]')];
  assert.equal(tabs.length, 5);
  const visible = () => [...root.querySelectorAll('.panel')].filter((p) => !p.hidden);
  assert.equal(visible().length, 1);
  click(tabs[0]); assert.match(text(visible()[0]), /Setter/);
  click(tabs[2]); assert.match(text(visible()[0]), /Custodian/);
});

/* ---------------- voice ---------------- */
test('voice: tap to speak, interim words appear, final words stick, text stays editable', () => {
  assert.equal(voiceSupported(), true);
  const ta = document.createElement('textarea'); ta.value = 'Existing text.'; const row = voiceControl(ta); document.body.append(ta, row);
  const btn = row.querySelector('.mic');
  click(btn);
  const rec = Rec.instances.at(-1);
  assert.equal(rec.started, 1); assert.equal(rec.lang, 'en-IN'); assert.equal(rec.continuous, true); assert.equal(rec.interimResults, true);
  assert.equal(btn.getAttribute('aria-pressed'), 'true');
  assert.match(text(row), /Listening/);
  rec.say([{ t: 'the keys', final: false }]);
  assert.equal(ta.value, 'Existing text. the keys');
  rec.say([{ t: 'the keys step was confusing', final: true }]);
  assert.equal(ta.value, 'Existing text. the keys step was confusing');
  rec.say([{ t: 'the keys step was confusing', final: true }, { t: 'and slow', final: false }]);
  assert.match(ta.value, /confusing and slow$/);
  ta.value = ta.value + ' (edited by hand)';   // typing is still allowed
  click(btn);
  assert.equal(btn.getAttribute('aria-pressed'), 'false'); assert.equal(rec.stopped, 1);
  assert.match(text(row), /Check the text/);
});

test('voice: keeps listening through pauses, and fires input events so saving works', () => {
  const ta = document.createElement('textarea'); const row = voiceControl(ta); document.body.append(ta, row);
  let inputs = 0; ta.addEventListener('input', () => inputs++);
  click(row.querySelector('.mic'));
  const rec = Rec.instances.at(-1);
  rec.running = false; rec.onend();       // the browser ends a session after a pause
  assert.equal(rec.started, 2, 'it restarted itself');
  rec.say([{ t: 'hello', final: true }]);
  assert.ok(inputs >= 1);
  assert.equal(ta.value, 'hello');
});

test('voice: errors are explained in plain words and recording stops', () => {
  const cases = { 'not-allowed': /Microphone is blocked/, 'no-speech': /Did not hear anything/, 'network': /not reachable/, 'audio-capture': /No microphone found/, 'weird': /Voice stopped/ };
  for (const [err, re] of Object.entries(cases)) {
    const ta = document.createElement('textarea'); const row = voiceControl(ta); document.body.append(ta, row);
    click(row.querySelector('.mic')); const rec = Rec.instances.at(-1);
    rec.fail(err);
    assert.match(text(row), re, err);
    assert.equal(row.querySelector('.mic').getAttribute('aria-pressed'), 'false');
  }
});

test('voice: where speech recognition does not exist, the person is told to type', async () => {
  setupDom('index', { speech: null });
  const mod = await import('../src/js/voice.js?nospeech');
  assert.equal(mod.voiceSupported(), false);
  const row = mod.voiceControl(document.createElement('textarea'));
  assert.match(text(row), /Voice needs Chrome, Edge or Safari\. You can type instead/);
  assert.equal(row.querySelector('.mic'), null);
});
