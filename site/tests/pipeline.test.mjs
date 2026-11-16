// The pipeline demo: the engine (real crypto on sample questions) and the screen (drag, tap, run, unlock, admin view).
globalThis.__LP_TEST = true;
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, click, tick, text } from './dom-env.mjs';
import { FILES, QUESTIONS, TOPICS, SETTERS, QUESTION_BY_ID } from '../src/js/exam-bank.mjs';
import { BLOCKS, ORDER, HOLDERS, K, N, checkOrder, createRun } from '../src/js/pipeline-core.mjs';
import LP from '../src/js/logic.mjs';

const combos = (arr, k) => (k === 0 ? [[]] : arr.flatMap((x, i) => combos(arr.slice(i + 1), k - 1).map((c) => [x, ...c])));

/* ---------------- the question files ---------------- */
test('bank: 10 topics, 10 setters, each setter writes exactly one question for every topic (100 in all)', () => {
  assert.equal(TOPICS.length, 10); assert.equal(SETTERS.length, 10); assert.equal(FILES.length, 10); assert.equal(QUESTIONS.length, 100);
  assert.equal(new Set(FILES.map((f) => f.file)).size, 10, 'file names are unique');
  const ids = new Set(), positions = new Set();
  for (const f of FILES) {
    assert.equal(f.questions.length, 10, f.file);
    assert.deepEqual(f.questions.map((q) => q.topic).sort(), [...TOPICS].sort(), `${f.setter} covers every topic exactly once`);
    assert.ok(f.questions.every((q) => q.setter === f.setter));
  }
  for (const t of TOPICS) {
    const qs = QUESTIONS.filter((q) => q.topic === t);
    assert.equal(qs.length, 10, t + ' has ten candidates'); assert.equal(new Set(qs.map((q) => q.setter)).size, 10, t + ': one from each setter');
    assert.equal(new Set(qs.map((q) => q.text)).size, 10, t + ': ten different questions');
  }
  for (const q of QUESTIONS) {
    assert.ok(!ids.has(q.id), 'unique id ' + q.id); ids.add(q.id); assert.equal(QUESTION_BY_ID[q.id], q);
    assert.equal(q.options.length, 4); assert.equal(new Set(q.options).size, 4, q.id + ' options are distinct');
    assert.ok(Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4); positions.add(q.correct);
  }
  assert.equal(positions.size, 4, 'the right answer is not always in the same place');
});

/* ---------------- the order checker ---------------- */
test('order: the safe order passes; anything out of order says exactly what is missing', () => {
  assert.equal(ORDER.length, 8);
  assert.deepEqual(checkOrder(ORDER).ok, true);
  assert.equal(checkOrder([]).ok, false);
  const swapped = ['banks', 'draw', 'encrypt', 'assemble', 'split', 'distribute', 'unlock', 'print'];
  const c = checkOrder(swapped);
  assert.equal(c.ok, false); assert.match(c.message, /Encrypt|Needs “Build paper” first/); assert.equal(c.items[2].ok, false); assert.equal(c.items[3].ok, true);
  for (const b of BLOCKS.filter((x) => !x.forbidden && x.needs.length)) {
    const without = ORDER.filter((id) => id !== b.needs[0]);
    assert.equal(checkOrder(without).ok, false, `${b.id} cannot work without ${b.needs[0]}`);
  }
  const withDecoy = checkOrder([...ORDER, 'email']);
  assert.equal(withDecoy.ok, false); assert.match(withDecoy.message, /readable paper/);
  assert.equal(checkOrder(['nonsense']).ok, false);
  assert.match(checkOrder(['banks', 'draw']).message, /Add 6 more blocks/);
});

/* ---------------- a full run, with the real algorithms ---------------- */
async function fullRun(seed) {
  const r = createRun({ seed });
  const out = {};
  out.banks = await r.banks(); out.draw = await r.draw(); out.assemble = await r.assemble(); out.encrypt = await r.encrypt();
  out.split = await r.split(); out.distribute = await r.distribute();
  return { r, out };
}

test('draw: exactly one question per topic, from that topic\'s ten, repeatable from the seed, different for a different seed', async () => {
  const a = await fullRun('seed-one'), b = await fullRun('seed-one'), c = await fullRun('seed-two');
  assert.deepEqual(a.out.draw.picks, b.out.draw.picks, 'the same seed replays the same draw');
  assert.notDeepEqual(a.out.draw.picks.map((p) => p.id), c.out.draw.picks.map((p) => p.id));
  assert.equal(a.out.draw.picks.length, 10); assert.deepEqual(a.out.draw.picks.map((p) => p.topic), TOPICS);
  for (const p of a.out.draw.picks) { assert.equal(QUESTION_BY_ID[p.id].topic, p.topic); assert.equal(QUESTION_BY_ID[p.id].setter, p.setter); assert.equal(p.candidates.length, 10); assert.ok(p.candidates.includes(p.id)); }
  assert.equal(a.out.draw.poolSize, 100);
  const r = createRun(); await r.banks(); const d1 = await r.draw();
  assert.match(d1.seed, /^[0-9a-f]{32}$/, 'a fresh 128-bit seed when none is given');
  const r2 = createRun(); await r2.banks();
  assert.notEqual((await r2.draw()).seed, d1.seed, 'a new seed every run');
});

test('exposure: one leaking setter exposes about one question of the paper on average, never all of it', async () => {
  let total = 0, max = 0; const runs = 300;
  for (let i = 0; i < runs; i++) {
    const r = createRun({ seed: 'exposure-' + i }); await r.banks(); const { picks } = await r.draw();
    const n = picks.filter((p) => p.setter === 'S04').length; total += n; max = Math.max(max, n);
  }
  assert.ok(Math.abs(total / runs - 1) < 0.25, 'on average one of ten (got ' + total / runs + ')');
  assert.ok(max <= 5, 'one setter never gets close to the whole paper (worst seen ' + max + ')');
});

test('assemble and encrypt: the locked paper reveals nothing readable and has a fingerprint', async () => {
  const { r, out } = await fullRun('seed-enc');
  assert.equal(out.assemble.paper.length, 10); assert.deepEqual(out.assemble.paper.map((q) => q.topic), TOPICS, 'one question per topic, in topic order');
  assert.match(out.assemble.fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(await LP.sha256hex(r.state.paperText), out.assemble.fingerprint);
  const ct = out.encrypt.ciphertextHex;
  for (const q of out.assemble.paper) assert.ok(!ct.includes(Buffer.from(q.text).toString('hex').slice(0, 20)), 'no plaintext in the ciphertext');
  assert.equal(out.encrypt.bytes, out.assemble.bytes + 16, 'AES-GCM adds a 16-byte tag');
  assert.equal(out.encrypt.ivHex.length, 24);
});

test('split: the real key is wiped; any 3 of 5 officials open the paper, any 1 or 2 are refused (all 25 combinations)', async () => {
  const { r, out } = await fullRun('seed-split');
  assert.equal(r.state.secret, null, 'the whole key no longer exists, only the pieces');
  assert.equal(out.split.pieces.length, N);
  assert.equal(out.distribute.holders.length, N); assert.deepEqual(out.distribute.holders.map((h) => h.role), HOLDERS.map((h) => h.role));
  assert.equal(r.state.pieces, null, 'the pieces now live only with the officials');
  assert.equal(new Set(out.distribute.holders.map((h) => h.hex)).size, N, 'every official holds a different piece');
  const xs = [1, 2, 3, 4, 5];
  for (const k of [3, 4, 5]) for (const c of combos(xs, k)) {
    const res = await r.tryUnlock(c);
    assert.equal(res.ok, true, `pieces ${c} open the paper`); assert.equal(res.text, r.state.paperText);
  }
  let refused = 0;
  const fresh = createRun({ seed: 'seed-split-2' }); await fresh.banks(); await fresh.draw(); await fresh.assemble(); await fresh.encrypt(); await fresh.split(); await fresh.distribute();
  for (const k of [0, 1, 2]) for (const c of combos(xs, k)) {
    const res = await fresh.tryUnlock(c);
    assert.equal(res.ok, false, `pieces ${c} must not open the paper`); assert.equal(res.text, null); refused++;
  }
  assert.equal(refused, 1 + 5 + 10);
  assert.equal(fresh.state.unlocked, null, 'a refused attempt leaves nothing behind');
});

test('print: only after the unlock; every seat gets its own order, a valid copy ID and a matching answer key', async () => {
  const { r } = await fullRun('seed-print');
  await assert.rejects(() => r.print(1), /Unlocking has not happened yet/);
  await r.tryUnlock([1, 3, 5]);
  const orders = new Set();
  for (let seat = 1; seat <= 100; seat++) {
    const s = await r.print(seat);
    assert.ok(LP.verifyCopyId(s.id), s.id); assert.equal(s.items.length, 10);
    assert.deepEqual([...s.items.map((i) => i.text)].sort(), r.state.paper.map((q) => q.text).sort(), 'same ten questions on every copy');
    orders.add(s.order.join(','));
    s.items.forEach((it, pos) => { // the answer key points at the right text on THIS copy
      const q = r.state.paper[it.was - 1]; assert.equal(it.options['abcd'.indexOf(s.key[pos])], q.options[q.correct]);
    });
  }
  assert.ok(orders.size >= 95, `seats mostly differ (${orders.size} different orders of 100)`);
  assert.deepEqual((await r.print(17)).order, (await r.print(17)).order, 'the same seat always gets the same copy');
});

test('steps cannot be run out of order (the engine fails closed even without the screen)', async () => {
  const r = createRun();
  await assert.rejects(() => r.draw(), /has not happened yet/);
  await r.banks(); await assert.rejects(() => r.assemble(), /has not happened yet/);
  await r.draw(); await assert.rejects(() => r.encrypt(), /has not happened yet/);
  await r.assemble(); await assert.rejects(() => r.split(), /has not happened yet/);
  await r.encrypt(); await assert.rejects(() => r.distribute(), /has not happened yet/);
  await r.split(); await assert.rejects(() => r.tryUnlock([1, 2, 3]), /has not happened yet/);
});

test('log: every step is chained, the chain verifies, and editing any entry is detected', async () => {
  const { r } = await fullRun('seed-log');
  await r.tryUnlock([1, 2]); await r.tryUnlock([1, 2, 3]); await r.print(5);
  assert.equal(r.log.length, 6 + 2 + 1);
  assert.equal((await r.verifyLog()).ok, true);
  assert.ok(r.log.some((e) => /refused/.test(e.action)), 'the refused attempt is recorded too');
  const forged = r.log.map((e) => ({ ...e })); forged[2].action = 'Quietly changed';
  const v = await LP.verifyChain(forged);
  assert.equal(v.ok, false); assert.equal(v.firstBad, 2);
});

/* ---------------- the screen ---------------- */
const until = async (cond, ms = 4000) => { const end = performance.now() + ms; while (performance.now() < end) { if (cond()) return true; await tick(5); } return !!cond(); };
async function mount() {
  setupDom('pipeline');
  const { mountPipeline } = await import('../src/js/pipeline.js?' + Math.random());
  const ctl = mountPipeline(document.getElementById('pipeline-root'), { fast: true, auto: false, seed: 'ui-seed' });
  return ctl;
}
const pal = (id) => document.querySelector(`.pl-palette [data-block="${id}"]`);
const trackIds = () => [...document.querySelectorAll('.pl-track [data-block]')].map((e) => e.dataset.block);
const runBtn = () => document.querySelector('[data-act=run]');
const nextBtn = () => document.querySelector('[data-act=next]');
const stepBtn = (id) => document.querySelector(`[data-step="${id}"]`);
const stepLi = (id) => document.querySelector(`.pl-step[data-id="${id}"]`);
const doneCount = () => document.querySelectorAll('.pl-step.done').length;
const runStep = async (id) => { click(stepBtn(id)); await until(() => stepLi(id).classList.contains('done') || id === 'unlock'); };

test('screen: eight steps, each with a short plain description and its own button; only step 1 is ready; no drag and drop', async () => {
  await mount();
  assert.equal(document.querySelectorAll('.pl-step').length, 8);
  assert.match(text(stepLi('banks')), /10 setters each write 1 question for each of the 10 topics/);
  assert.match(text(stepLi('draw')), /For each topic, the computer picks 1 of the 10 questions, at random/);
  assert.match(text(stepLi('split')), /cut into 5 pieces\. Any 3 rebuild it/);
  assert.equal(stepBtn('banks').textContent, 'Do step 1 for me'); assert.equal(stepBtn('banks').disabled, false);
  for (const id of ORDER.slice(1)) assert.equal(stepBtn(id).disabled, true, `${id} is locked until the step before it is done`);
  assert.equal(document.querySelector('.pl-palette, .pl-track, .pl-slot, [draggable=true]'), null, 'no blocks, slots or draggable items');
  stepLi('encrypt').dispatchEvent(new window.Event('mouseenter'));
  assert.match(text(document.querySelector('.pl-what')), /one-time key/); assert.match(text(document.querySelector('.pl-chips')), /AES-256-GCM/);
  assert.equal(document.querySelectorAll('h1').length, 1);
});

test('screen: a locked step cannot be run by clicking it, and each click runs exactly one step', async () => {
  const ctl = await mount();
  click(stepBtn('encrypt')); await tick(30); assert.equal(doneCount(), 0, 'a disabled step does nothing');
  await ctl.doStep(3); assert.equal(doneCount(), 0, 'even called directly, steps cannot be skipped');
  click(stepBtn('banks')); await until(() => doneCount() === 1);
  assert.equal(stepBtn('banks').textContent, 'Done ✓'); assert.equal(stepBtn('draw').disabled, false); assert.equal(stepBtn('assemble').disabled, true);
  assert.equal(document.querySelectorAll('.pl-file').length, 10);
  assert.match(text(document.querySelector('.pl-stage')), /Ten setters, each writing one question for every topic/); assert.equal(document.querySelectorAll('.pl-setter.in').length, 10);
  click(stepBtn('banks')); await tick(30); assert.equal(doneCount(), 1, 'a finished step is not run twice');
});

test('screen: step by step to the end, with a real refusal at 1 and 2 approvals, the unlock at 3, a per-seat print, a verified log and an admin view', async () => {
  await mount();
  await runStep('banks'); await runStep('draw');
  assert.match(text(document.querySelector('.pl-live')), /Random seed.*hidden/); assert.ok(!/ui-seed/.test(text(document.querySelector('.pl-live'))), 'the seed is not shown');
  assert.equal(document.querySelector('.pl-admin').hidden, true);
  const box = document.querySelector('#pl-admin-box'); box.checked = true; box.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(document.querySelector('.pl-admin').hidden, false);
  assert.match(text(document.querySelector('.pl-live')), /Random seed \(128 bit\)ui-seed/, 'Admin view shows the real seed');
  assert.match(text(document.querySelector('.pl-admin')), /Demo only/); assert.match(text(document.querySelector('.pl-admin')), /Chief Proctor/);
  await runStep('assemble'); assert.equal(document.querySelectorAll('.pl-paper li').length, 10);
  await runStep('encrypt'); assert.match(text(document.querySelector('.pl-live')), /AES-256-GCM/); assert.match(text(document.querySelector('.pl-live')), /One-time key[0-9a-f]{32}/);
  await runStep('split'); assert.match(text(document.querySelector('.pl-live')), /Key piece #5/); assert.match(text(document.querySelector('.pl-admin')), /One-time key[^]*[0-9a-f]{32}/);
  await runStep('distribute'); assert.ok(document.querySelectorAll('.pl-holder').length >= 6);
  // unlock: a real refusal first, and no way forward until the quorum is met
  click(stepBtn('unlock')); await until(() => document.querySelector('.pl-holder.tap'));
  assert.equal(stepBtn('print').disabled, true);
  const tap = (x) => click(document.querySelector(`.pl-holder.tap[data-x="${x}"]`));
  tap(1); await until(() => /Refused with 1 approval\./.test(text(document.querySelector('.pl-result'))));
  tap(3); await until(() => /Refused with 2 approvals\./.test(text(document.querySelector('.pl-result'))));
  assert.match(text(document.querySelector('.pl-result')), /AES-GCM rejected it/); assert.equal(stepBtn('print').disabled, true);
  tap(5); await until(() => stepLi('unlock').classList.contains('done'));
  assert.match(text(document.querySelector('.pl-result')), /Unlocked\./); assert.match(text(document.querySelector('.pl-live')), /key rebuilt, authentication tag verified/);
  await runStep('print'); assert.match(text(document.querySelector('.pl-sheet-head')), /Seat 17 · copy C017-/);
  const first17 = text(document.querySelector('.pl-sheet'));
  const seat = document.querySelector('#pl-seat'); seat.value = '18'; seat.dispatchEvent(new window.Event('change', { bubbles: true }));
  await until(() => /Seat 18/.test(text(document.querySelector('.pl-sheet-head'))));
  assert.notEqual(text(document.querySelector('.pl-sheet')), first17, 'another seat, another copy');
  assert.equal(doneCount(), 8); assert.match(text(document.querySelector('.pl-what')), /Every step is in the log/);
  assert.ok(document.querySelectorAll('.pl-log li').length >= 10, 'one entry per step plus the two refusals and the seat prints');
  assert.match(text(document.querySelector('.pl-log')), /refused, the paper stayed locked/);
  click([...document.querySelectorAll('.pl-log button')].find((b) => /Check the log/.test(b.textContent)));
  await until(() => document.querySelector('.pl-verify').textContent);
  assert.match(text(document.querySelector('.pl-verify')), /entries check out/);
  box.checked = false; box.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(document.querySelector('.pl-admin').hidden, true);
  assert.ok(!/[0-9a-f]{32}/.test(text(document.querySelector('.pl-live'))), 'no key or piece shown with Admin view off');
});

test('screen: "Do it for me" performs the unlock, and Start over begins again with a new draw', async () => {
  await mount();
  for (const id of ['banks', 'draw', 'assemble', 'encrypt', 'split', 'distribute']) await runStep(id);
  click(stepBtn('unlock')); await until(() => document.querySelector('[data-act=auto-unlock]'));
  click(document.querySelector('[data-act=auto-unlock]'));
  assert.ok(await until(() => stepLi('unlock').classList.contains('done'), 6000));
  assert.match(text(document.querySelector('.pl-foot')), /Sample data only/);
  click(document.querySelector('[data-act=reset]')); assert.equal(doneCount(), 0); assert.equal(stepBtn('banks').disabled, false);
  assert.equal(document.querySelector('.pl-log').children.length, 0, 'a fresh run has a fresh log');
});

test('screen: Light and Dark are one tap apart, the choice is applied to the page and remembered', async () => {
  await mount();
  const html = document.documentElement, btn = (t) => document.querySelector(`[data-theme-set=${t}]`);
  assert.ok(['light', 'dark'].includes(html.getAttribute('data-theme')), 'starts from the system setting');
  click(btn('dark')); assert.equal(html.getAttribute('data-theme'), 'dark'); assert.equal(btn('dark').getAttribute('aria-pressed'), 'true'); assert.equal(btn('light').getAttribute('aria-pressed'), 'false');
  click(btn('light')); assert.equal(html.getAttribute('data-theme'), 'light'); assert.equal(window.localStorage.getItem('lp-theme'), 'light');
  await mount(); // a fresh page load on the same device
});

/* ---------------- the inspector (Admin view) ---------------- */
const detail = () => text(document.querySelector('.pl-detail'));
test('inspector: with Admin view off, clicking a box only says to turn it on; the authors are not revealed', async () => {
  await mount();
  await runStep('banks');
  click(document.querySelector('.pl-file')); assert.match(detail(), /Admin view is off/);
  assert.ok(!/Setter 0\d/.test(detail()), 'no author shown');
  await runStep('draw'); click(document.querySelector('.pl-file')); assert.match(detail(), /Admin view is off/);
});

test('inspector: with Admin view on, clicking a topic shows which setter wrote which question; a setter shows their whole file', async () => {
  await mount();
  const box = document.querySelector('#pl-admin-box'); box.checked = true; box.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(document.querySelector('.pl-inspect-hint').hidden, true, 'no hint before there is anything to click');
  await runStep('banks');
  assert.equal(document.querySelector('.pl-inspect-hint').hidden, false);
  const topicBox = [...document.querySelectorAll('.pl-files .pl-file')].find((e) => /Operating Systems/.test(e.textContent));
  click(topicBox);
  const d = detail();
  for (const st of SETTERS) assert.match(d, new RegExp(st.name), `${st.name} is listed`);
  for (const f of FILES) assert.ok(d.includes(f.questions.find((q) => q.topic === 'Operating Systems').text), 'each setter\'s question for the topic is shown');
  click([...document.querySelectorAll('.pl-setter')][6]);   // Setter 07
  assert.match(detail(), /Setter 07: file setter-07\.json/); assert.match(detail(), /[0-9a-f]{64}/, 'its fingerprint');
  for (const q of FILES[6].questions) assert.ok(detail().includes(q.text), 'all ten of its questions, one per topic');
});

test('inspector: every later box can be opened too, and shows the real values behind it', async () => {
  await mount({ seed: 'inspect-seed' });
  const box = document.querySelector('#pl-admin-box'); box.checked = true; box.dispatchEvent(new window.Event('change', { bubbles: true }));
  await runStep('banks'); await runStep('draw');
  const picks = (await (async () => { const r = createRun({ seed: 'ui-seed' }); await r.banks(); return (await r.draw()).picks; })());
  click(document.querySelectorAll('.pl-files .pl-file')[2]);   // topic 3's pick
  const q = QUESTION_BY_ID[picks[2].id];
  assert.ok(detail().includes(q.text)); assert.ok(detail().includes(q.setterName), 'who wrote the picked question'); assert.match(detail(), /✓ correct/);
  await runStep('assemble'); click(document.querySelectorAll('.pl-paper li')[0]); assert.ok(detail().includes(QUESTION_BY_ID[picks[0].id].setterName));
  await runStep('encrypt'); click(document.querySelectorAll('.pl-paper li')[1]); assert.match(detail(), /What it hides/); assert.ok(detail().includes(QUESTION_BY_ID[picks[1].id].text));
  await runStep('split'); click(document.querySelectorAll('.pl-piece')[0]); assert.match(detail(), /[0-9a-f]{32}/); assert.match(detail(), /Alone it reveals/);
  await runStep('distribute'); click(document.querySelectorAll('.pl-holder')[0]); assert.match(detail(), /Controller of Examinations/); assert.match(detail(), /Needs 2 more officials/);
  box.checked = false; box.dispatchEvent(new window.Event('change', { bubbles: true })); assert.equal(document.querySelector('.pl-detail').hidden, true, 'turning Admin view off closes the inspector');
});

/* ---------------- secrecy of the questions, and the arrows ---------------- */
const leaksAQuestion = () => { const t = document.querySelector('.pl-card').textContent; return QUESTIONS.find((q) => t.includes(q.text)); };

test('secrecy: with Admin view off, no question text appears anywhere from the first step until the printed copy', async () => {
  await mount();
  for (const id of ['banks', 'draw', 'assemble', 'encrypt', 'split', 'distribute']) {
    await runStep(id);
    assert.equal(leaksAQuestion(), undefined, `after ${id}: no question text on screen`);
  }
  assert.match(text(document.querySelector('.pl-stage')), /Each official gets one piece/);
  click(stepBtn('unlock')); await until(() => document.querySelector('.pl-holder.tap'));
  click(document.querySelector('[data-act=auto-unlock]')); await until(() => stepLi('unlock').classList.contains('done'), 6000);
  assert.equal(leaksAQuestion(), undefined, 'even after the unlock the paper is not displayed');
  await runStep('print'); assert.ok(leaksAQuestion(), 'the printed copy at the centre is the one place the questions appear');
});

test('secrecy: the draw shows only which position was picked; Admin view reveals the text and turning it off hides it again', async () => {
  await mount();
  await runStep('banks'); await runStep('draw');
  assert.equal(document.querySelectorAll('.pl-dots i.pick').length, 10, 'one picked dot per topic');
  assert.match(text(document.querySelector('.pl-stage')), /question \d+ of 10/); assert.equal(leaksAQuestion(), undefined);
  await runStep('assemble');
  assert.match(text(document.querySelector('.pl-paper')), /█{10}/); assert.equal(document.querySelectorAll('.pl-paper .qtext').length, 10);
  const box = document.querySelector('#pl-admin-box'); box.checked = true; box.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.ok(leaksAQuestion(), 'Admin view shows the paper'); assert.ok(!/█/.test(text(document.querySelector('.pl-paper'))));
  box.checked = false; box.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(leaksAQuestion(), undefined, 'and hides it again'); assert.match(text(document.querySelector('.pl-paper')), /█{10}/);
});

test('arrows: step through what you have already done, back and forward, and the right arrow runs the next step at the edge', async () => {
  await mount();
  const back = document.querySelector('[data-nav=back]'), fwd = document.querySelector('[data-nav=forward]');
  assert.equal(back.getAttribute('aria-label'), 'Previous step'); assert.ok(back.querySelector('svg'), 'an arrow icon, not text');
  assert.equal(back.disabled, true, 'nothing before step 1'); assert.match(text(document.querySelector('.pl-navlabel')), /Step 1 of 8 · Question files/);
  click(fwd);                                            // at the edge the right arrow runs the step
  await until(() => doneCount() === 1);
  await runStep('draw'); await runStep('assemble');
  assert.match(text(document.querySelector('.pl-navlabel')), /Step 3 of 8 · Build paper/); assert.equal(back.disabled, false);
  click(back); assert.match(text(document.querySelector('.pl-navlabel')), /Step 2 of 8/);
  assert.equal(document.querySelectorAll('.pl-files .pl-file').length, 10); assert.match(text(document.querySelector('.pl-stage')), /one of the ten questions is picked/);
  assert.match(text(document.querySelector('.pl-live')), /Picked \(position per topic\)/, 'the live values come back too');
  click(back); assert.match(text(document.querySelector('.pl-stage')), /Ten setters, each writing/); assert.equal(back.disabled, true);
  click(fwd); click(fwd); assert.equal(document.querySelectorAll('.pl-paper li').length, 10, 'forward again to step 3');
  assert.equal(doneCount(), 3, 'moving around does not change progress');
  click(fwd); assert.match(text(document.querySelector('.pl-navlabel')), /Step 4 of 8/); assert.match(text(document.querySelector('.pl-stage')), /Press “Do step 4 for me”/);
  assert.equal(doneCount(), 3, 'arrowing to an unrun step shows it but does not run it');
  click(fwd); await until(() => doneCount() === 4);      // now the arrow runs it
  assert.match(text(document.querySelector('.pl-stage')), /locked with a one-time key/);
  click(stepLi('banks').querySelector('.pl-num')); assert.match(text(document.querySelector('.pl-navlabel')), /Step 1 of 8/, 'a finished step can also be clicked');
});

test('arrows: inspector and Admin view still work on a step you went back to, and the last step ends the right arrow', async () => {
  await mount();
  const box = document.querySelector('#pl-admin-box'); box.checked = true; box.dispatchEvent(new window.Event('change', { bubbles: true }));
  await runStep('banks'); await runStep('draw');
  click(document.querySelector('[data-nav=back]'));
  click([...document.querySelectorAll('.pl-setter')][2]); assert.match(text(document.querySelector('.pl-detail')), /Setter 03: file setter-03\.json/);
  for (const id of ['assemble', 'encrypt', 'split', 'distribute']) await runStep(id);
  click(stepBtn('unlock')); await until(() => document.querySelector('[data-act=auto-unlock]')); click(document.querySelector('[data-act=auto-unlock]')); await until(() => stepLi('unlock').classList.contains('done'), 6000);
  await runStep('print');
  assert.equal(document.querySelector('[data-nav=forward]').disabled, true, 'nothing after step 8');
  for (let i = 0; i < 7; i++) click(document.querySelector('[data-nav=back]'));
  assert.match(text(document.querySelector('.pl-navlabel')), /Step 1 of 8/); assert.equal(doneCount(), 8);
});
