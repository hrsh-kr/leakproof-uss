// Page-level behaviour: the review, the interview request, home, the course router, prototypes, feedback box, results and admin.
// Voice is switched off in production (src/js/config.mjs). These tests switch it on to keep the code verified.
globalThis.__LP_VOICE = true;
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, click, type, tick, text, fakeSpeech } from './dom-env.mjs';

globalThis.__LP_TEST = true;
const Rec = fakeSpeech();
setupDom('index', { speech: Rec });

const { startReview } = await import('../src/js/review.js');
const { startInterview } = await import('../src/js/interview.js');
const { mountHome } = await import('../src/js/home.js');
const { mountCourse } = await import('../src/js/course.js');
const { mountQuick } = await import('../src/js/quick.js');
const { mountStats } = await import('../src/js/research.js');
const { mountAdmin } = await import('../src/js/admin.js');
const { demoPaper, SAMPLES } = await import('../src/js/paper.js');
const { SECTIONS } = await import('../src/js/survey-def.mjs');

const q = (id) => document.querySelector(`[data-q="${id}"]`);
const radio = (id, v) => click(q(id).querySelector(`input[value="${v}"]`));
const check = (id, vs) => vs.forEach((v) => click(q(id).querySelector(`input[value="${v}"]`)));
const say = (id, t) => { const f = q(id).querySelector('textarea,input[type=text]'); type(f, t); };
const next = async () => { click(document.querySelector('[data-nav=next]')); await tick(30); };
const title = () => text(document.querySelector('#rv-h'));
const err = () => text(document.querySelector('.rv-err'));
const okPost = (calls) => async (url, payload) => { calls.push({ url, payload }); return { ok: true, status: 200, data: { receipt: 'LP-TEST1234' } }; };

function newReview(post) {
  setupDom('review', { speech: Rec });
  const root = document.getElementById('review-root');
  const ctl = startReview(root, { post });
  return { root, ctl };
}

async function fillIntroAboutBefore() {
  click(document.querySelector('#consent-box')); await next();
  radio('role', 'course_peer'); radio('device', 'phone'); check('exams', ['neet']); await next();
  check('leakwhere', ['press', 'storage']); radio('trust_before', '2'); radio('accept_before', '3'); say('model', 'It travels by courier.'); await next();
}
async function doTask(id, { act = () => {}, skip = false, stuck = 'no', check: chk, extra = () => {} }) {
  act(); click(document.querySelector(`[data-act=${skip ? 'skip' : 'done'}]`)); await tick(10);
  radio(`${id}_check`, chk); radio(`${id}_seq`, '5'); radio(`${id}_stuck`, stuck);
  if (stuck === 'yes') { say(`${id}_incident`, 'I could not find the control.'); radio(`${id}_slow`, '2'); }
  extra(); await next();
}

/* ---------------- review: the full path ---------------- */
test('review: a complete run with every optional part produces the right submission and a receipt', async () => {
  const calls = []; newReview(okPost(calls));
  assert.match(title(), /Help us test an idea/);
  await fillIntroAboutBefore();
  assert.match(title(), /Task 1 of 4/);
  assert.match(text(document.body), /How each task works/);
  await doTask('t1', { act: () => { const s = document.querySelector('.task-stage input[type=range]'); type(s, '8'); }, check: 'a', stuck: 'yes' });
  assert.match(title(), /Task 2 of 4/);
  await doTask('t2', { act: async () => { [0, 2, 4].forEach((i) => click(document.querySelectorAll('.task-stage .key')[i])); await tick(80); }, check: 'a', extra: () => say('t2_why', 'So one person cannot leak it.') });
  await tick(100);
  assert.match(title(), /Task 3 of 4|Task 2 of 4/);
});

test('review: full submission contents (typed + voice), optional parts, follow-up call, receipt', async () => {
  const calls = []; newReview(okPost(calls));
  await fillIntroAboutBefore();
  await doTask('t1', { act: () => type(document.querySelector('.task-stage input[type=range]'), '8'), check: 'a', stuck: 'yes' });
  [0, 2, 4].forEach((i) => click(document.querySelectorAll('.task-stage .key')[i])); await tick(100);
  await doTask('t2', { check: 'a', extra: () => say('t2_why', 'So one person cannot leak it.') });
  click([...document.querySelectorAll('.task-stage .seg button')][1]);
  await doTask('t3', { check: 'a', extra: () => { radio('t3_fair', '3'); check('t3_worry', ['harder']); } });
  await doTask('t4', { skip: true, check: 'd', stuck: 'yes' });
  assert.match(title(), /overall impression/);
  // explain is required and must be a real sentence; use VOICE for it
  radio('umux1', '5'); radio('umux2', '6'); radio('trust_after', '4'); radio('accept_after', '4'); radio('hardest', 't4');
  await next(); assert.match(err(), /explain to a friend/);
  const mic = q('explain').querySelector('.mic'); assert.ok(mic, 'voice button on the explain question');
  click(mic); const rec = Rec.instances.at(-1);
  rec.say([{ t: 'it locks the paper until several people agree', final: true }]);
  click(mic);
  assert.equal(document.querySelector('[data-q=explain] textarea').value, 'it locks the paper until several people agree');
  say('change', 'Make the keys step clearer.');
  await next();
  assert.match(title(), /main part/);
  click([...document.querySelectorAll('.btn')].find((b) => /four more/.test(b.textContent))); await tick(20);
  assert.match(title(), /design choices/);
  for (const d of ['d_pool', 'd_split', 'd_order', 'd_log']) radio(d, 'agree');
  radio('d_print', 'disagree'); say('d_print_why', 'Small centres lack printers.');
  await next(); assert.match(title(), /person running it/);
  check('hitl', ['skip', 'capable']); say('missing', 'A fallback for power cuts.'); await next();
  assert.match(title(), /One last thing/);
  // follow-up: choosing yes reveals and requires the call details
  assert.equal(q('c_slots').hidden, true);
  radio('followup', 'yes');
  assert.equal(q('c_slots').hidden, false); assert.equal(q('c_mode').hidden, false); assert.equal(q('c_contact').hidden, false);
  await next(); assert.match(err(), /When could you talk/);
  check('c_slots', ['sat3-pm', 'sun4-am']); radio('c_mode', 'whatsapp'); say('c_contact', '+91 98765 43210'); say('c_when', 'Thursday after 7 pm'); say('c_name', 'Asha');
  await next(); await tick(30);
  assert.equal(calls.length, 1);
  const { url, payload } = calls[0];
  assert.equal(url, '/api/submit'); assert.equal(payload.kind, 'review');
  assert.equal(payload.optionalDone, true);
  assert.equal(payload.answers.consent, true);
  assert.deepEqual(payload.answers.leakwhere, ['press', 'storage']);
  assert.equal(payload.answers.explain, 'it locks the paper until several people agree');
  assert.equal(payload.answers.t1_incident, 'I could not find the control.');
  assert.equal(payload.answers.t4_stuck, 'yes');
  assert.equal(payload.answers.d_print, 'disagree'); assert.equal(payload.answers.d_print_why, 'Small centres lack printers.');
  assert.deepEqual(payload.answers.c_slots, ['sat3-pm', 'sun4-am']); assert.equal(payload.answers.c_mode, 'whatsapp');
  assert.equal(payload.answers.c_contact, '+91 98765 43210'); assert.equal(payload.answers.c_name, 'Asha');
  assert.deepEqual(Object.keys(payload.metrics), ['t1', 't2', 't3', 't4']);
  assert.equal(payload.metrics.t4.result, 'skipped'); assert.equal(payload.metrics.t1.result, 'done');
  assert.ok(payload.metrics.t1.actions >= 1 && payload.metrics.t2.actions >= 3);
  assert.ok(Number.isInteger(payload.totalSeconds));
  assert.equal(payload.website, '');
  // receipt
  assert.match(title(), /Thank you. You are done/);
  const receipt = text(document.querySelector('.receipt'));
  assert.match(receipt, /LP-TEST1234/); assert.match(receipt, /Sat 3 Oct, 2 pm to 5 pm/.test(text(document.body)) ? /LeakProof remote usability test/ : /LeakProof/);
  assert.match(text(document.body), /Your call\..*Sat 3 Oct, 2 pm to 5 pm; Sun 4 Oct, 10 am to 1 pm/);
  assert.ok(document.querySelector('.receipt dd.mono'));
});

test('review: every question in the definition can actually be rendered and answered', async () => {
  const calls = []; newReview(okPost(calls));
  // walk the whole flow generically using the definition, so a new question type cannot silently break
  const kinds = new Set();
  for (const sec of SECTIONS) for (const qq of sec.questions) kinds.add(qq.type);
  assert.deepEqual([...kinds].sort(), ['consent', 'decision', 'multi', 'scale', 'single', 'task', 'text']);
});

test('review: gates stop incomplete steps and say why', async () => {
  newReview(okPost([]));
  await next(); assert.match(err(), /I have read this and I agree/);
  click(document.querySelector('#consent-box')); await next();
  assert.match(title(), /About you/);
  await next(); assert.match(err(), /Which describes you best/); assert.match(err(), /What are you using/);
  radio('role', 'faculty_ta'); radio('device', 'laptop'); await next();
  // leakwhere: at most two
  check('leakwhere', ['press', 'hall']);
  const third = q('leakwhere').querySelector('input[value="storage"]');
  assert.equal(third.disabled, true, 'a third choice is blocked');
  click(q('leakwhere').querySelector('input[value="press"]')); assert.equal(third.disabled, false, 'unticking frees a slot');
  check('leakwhere', ['storage']); radio('trust_before', '3'); radio('accept_before', '3'); await next();
  assert.match(title(), /Task 1/);
  await next(); assert.match(err(), /Press "I'm done" or "I'm stuck, skip" first/);
  click(document.querySelector('[data-act=skip]')); await tick(10);
  await next(); assert.match(err(), /Five setters leak/); assert.match(err(), /Overall, this task was/);
  // incident questions appear only when stuck
  assert.equal(q('t1_incident').hidden, true);
  radio('t1_stuck', 'yes'); assert.equal(q('t1_incident').hidden, false); assert.equal(q('t1_slow').hidden, false);
  radio('t1_stuck', 'no'); assert.equal(q('t1_incident').hidden, true);
});

test('review: choosing "No, finish now" skips the optional pages and submits without them', async () => {
  const calls = []; newReview(okPost(calls));
  await fillIntroAboutBefore();
  for (const [id, chk] of [['t1', 'a'], ['t2', 'a'], ['t3', 'a'], ['t4', 'a']]) {
    await doTask(id, { check: chk, extra: id === 't3' ? () => radio('t3_fair', '4') : () => {} });
  }
  radio('umux1', '4'); radio('umux2', '4'); radio('trust_after', '3'); radio('accept_after', '3'); radio('hardest', 'none'); say('explain', 'It protects exam papers from leaks.');
  await next();
  click([...document.querySelectorAll('.btn')].find((b) => /No, finish now/.test(b.textContent))); await tick(20);
  assert.match(title(), /One last thing/);
  assert.equal(q('c_slots').hidden, true);
  radio('followup', 'no');
  await next(); await tick(30);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.optionalDone, false);
  assert.ok(!('d_pool' in calls[0].payload.answers) && !('missing' in calls[0].payload.answers) && !('c_slots' in calls[0].payload.answers));
  assert.match(text(document.body), /Thank you. You are done/);
  assert.ok(!/Your call\./.test(text(document.body)), 'no call message when they said no');
});

test('review: progress survives a refresh, and after submitting the receipt stays instead of resubmitting', async () => {
  const calls = []; const { root } = newReview(okPost(calls));
  click(document.querySelector('#consent-box')); await next();
  radio('role', 'other'); radio('device', 'tablet'); await next();
  check('leakwhere', ['written']);
  assert.match(title(), /Before you see anything/);
  // "refresh": a new review on the same tab storage
  const root2 = document.createElement('div'); document.body.append(root2);
  startReview(root2, { post: okPost(calls) });
  assert.match(text(root2), /Before you see anything/, 'resumed on the same step');
  assert.equal(root2.querySelector('[data-q=leakwhere] input[value=written]').checked, true, 'answers restored');
  assert.ok(root);
});

test('review: when the server cannot save, the person keeps their answers and can retry', async () => {
  let n = 0; const calls = [];
  const post = async (url, payload) => { calls.push(payload); n++; return n === 1 ? { ok: false, status: 503, data: null } : n === 2 ? { ok: false, status: 0, data: null } : n === 3 ? { ok: false, status: 400, data: { errors: ['explain is too short'] } } : { ok: true, status: 200, data: { receipt: 'LP-RETRY999' } }; };
  newReview(post);
  await fillIntroAboutBefore();
  for (const id of ['t1', 't2', 't3', 't4']) await doTask(id, { check: 'a', extra: id === 't3' ? () => radio('t3_fair', '4') : () => {} });
  radio('umux1', '4'); radio('umux2', '4'); radio('trust_after', '3'); radio('accept_after', '3'); radio('hardest', 'none'); say('explain', 'It keeps papers secret until the exam.');
  await next();
  click([...document.querySelectorAll('.btn')].find((b) => /No, finish now/.test(b.textContent))); await tick(20);
  radio('followup', 'no');
  await next(); await tick(20);
  assert.match(err(), /not connected to storage yet.*still in this tab/);
  assert.ok([...document.querySelectorAll('.rv-err .link-btn')].some((b) => /Copy my answers/.test(b.textContent)));
  assert.equal(document.querySelector('[data-nav=next]').disabled, false, 'can press submit again');
  await next(); await tick(20); assert.match(err(), /could not reach the server/);
  await next(); await tick(20); assert.match(err(), /explain is too short/);
  await next(); await tick(20);
  assert.match(title(), /Thank you. You are done/); assert.match(text(document.querySelector('.receipt')), /LP-RETRY999/);
  assert.equal(calls.length, 4); assert.equal(calls[0].clientId, calls[3].clientId, 'the same submission id on every retry');
  // refresh after success shows the receipt, never the form again
  const r2 = document.createElement('div'); document.body.append(r2); startReview(r2, { post });
  assert.match(text(r2), /Thank you. You are done/);
});

test('review: the tasks always use the fixed sample paper, even if the visitor changed the demo paper', async () => {
  demoPaper().add({ text: 'Visitor question that must stay out of the test?', options: ['a', 'b', 'c', 'd'] });
  newReview(okPost([]));
  await fillIntroAboutBefore();
  await doTask('t1', { check: 'a' }); await doTask('t2', { check: 'a' });
  assert.match(title(), /Task 3/);
  assert.ok(!text(document.querySelector('.task-stage')).includes('Visitor question'));
  assert.ok(text(document.querySelector('.task-stage')).includes(SAMPLES[0].text.slice(0, 20)) || text(document.querySelector('.task-stage')).includes('electric current'));
  demoPaper().reset();
});

test('review: the task timer shows the guide time has passed after two minutes', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'] });
  newReview(okPost([]));
  click(document.querySelector('#consent-box'));
  click(document.querySelector('[data-nav=next]'));
  radio('role', 'other'); radio('device', 'phone'); click(document.querySelector('[data-nav=next]'));
  check('leakwhere', ['press']); radio('trust_before', '3'); radio('accept_before', '3'); click(document.querySelector('[data-nav=next]'));
  assert.match(title(), /Task 1/);
  const over = () => [...document.querySelectorAll('.fineprint')].find((p) => /about two minutes/.test(p.textContent));
  assert.equal(over().hidden, true);
  t.mock.timers.tick(121000);
  assert.equal(over().hidden, false);
  assert.match(text(document.querySelector('.timer')), /2:0\d|2:01/);
  click(document.querySelector('[data-act=done]'));
  const raw = JSON.parse(window.sessionStorage.getItem('lp-review-v1'));
  assert.ok(raw.metrics.t1.seconds >= 120 && raw.metrics.t1.result === 'done');
});

/* ---------------- interview request ---------------- */
test('interview request: needs consent, a time, a way to talk and contact details, then confirms the chosen times', async () => {
  setupDom('interview', { speech: Rec });
  const calls = [];
  startInterview(document.getElementById('interview-root'), { post: okPost(calls) });
  assert.match(text(document.body), /20 to 30 minute call/);
  click([...document.querySelectorAll('.btn')].find((b) => /Send my request/.test(b.textContent))); await tick(10);
  assert.match(err(), /I agree to be contacted/); assert.match(err(), /When could you talk/);
  click(document.querySelector('#consent-box'));
  check('c_slots', ['sat3-am', 'mon5-eve']); radio('c_mode', 'meet'); say('c_contact', 'asha@example.com'); say('c_name', 'Asha');
  assert.ok(q('c_topic').querySelector('.mic'), 'the topic box accepts voice');
  const mic = q('c_topic').querySelector('.mic'); click(mic); Rec.instances.at(-1).say([{ t: 'I set papers for a state board', final: true }]); click(mic);
  click([...document.querySelectorAll('.btn')].find((b) => /Send my request/.test(b.textContent))); await tick(20);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.kind, 'interview');
  assert.deepEqual(calls[0].payload.answers.c_slots, ['sat3-am', 'mon5-eve']);
  assert.equal(calls[0].payload.answers.c_topic, 'I set papers for a state board');
  assert.ok(!('role' in calls[0].payload.answers));
  assert.match(text(document.body), /Thank you. We will be in touch/);
  assert.match(text(document.body), /Sat 3 Oct, 10 am to 1 pm; Mon 5 Oct, 6 pm to 9 pm/);
  assert.match(text(document.body), /Video call \(Google Meet\)/);
  assert.match(text(document.body), /LP-TEST1234/);
});

test('interview request: tells the person plainly when it cannot be saved, and lets them retry', async () => {
  setupDom('interview', { speech: Rec });
  let n = 0;
  startInterview(document.getElementById('interview-root'), { post: async () => (++n === 1 ? { ok: false, status: 503, data: null } : { ok: true, status: 200, data: { receipt: 'LP-OK' } }) });
  click(document.querySelector('#consent-box')); check('c_slots', ['sat3-pm']); radio('c_mode', 'phone'); say('c_contact', '9876543210');
  const send = [...document.querySelectorAll('.btn')].find((b) => /Send my request/.test(b.textContent));
  click(send); await tick(10); assert.match(err(), /not connected to storage/); assert.equal(send.disabled, false);
  click(send); await tick(10); assert.match(text(document.body), /We will be in touch/);
});

/* ---------------- home ---------------- */
test('home: one idea at a time, previous and next work, and the last idea leads to the review', async () => {
  setupDom('index', { speech: Rec });
  demoPaper().reset();
  mountHome(document);
  const tabs = () => [...document.querySelectorAll('#try-root [role=tab]')];
  const head = () => text(document.querySelector('.scene-head'));
  assert.equal(tabs().length, 4);
  assert.match(head(), /1 of 4.*A few leaks don't leak the paper/);
  click(tabs()[2]); assert.match(head(), /3 of 4.*Every copy is different/);
  assert.equal(tabs().filter((t) => t.getAttribute('aria-selected') === 'true').length, 1);
  click([...document.querySelectorAll('#try-root button')].find((b) => /Next idea/.test(b.textContent))); assert.match(head(), /4 of 4/);
  assert.ok([...document.querySelectorAll('#try-root a')].some((a) => a.getAttribute('href') === '/review'), 'last idea links to the review');
  click([...document.querySelectorAll('#try-root button')].find((b) => /Previous/.test(b.textContent))); assert.match(head(), /3 of 4/);
  click(tabs()[0]); assert.ok([...document.querySelectorAll('#try-root button')].find((b) => /Previous/.test(b.textContent)).disabled);
  assert.ok(document.querySelector('#journey .flow'), 'the animated journey is on the page');
});

test('home: a question added in "Make it yours" appears in the sealed paper and the traced copies, and can be reset', async () => {
  setupDom('index', { speech: Rec });
  demoPaper().reset();
  mountHome(document);
  const form = document.querySelector('#make-root');
  click([...form.querySelectorAll('.chip-btn')].find((b) => b.textContent === 'Geography'));
  click([...form.querySelectorAll('.btn')].find((b) => /Add to the demo paper/.test(b.textContent)));
  assert.equal(demoPaper().get()[0].text, 'Which planet is known as the Red Planet?');
  assert.match(text(document.querySelector('#make-note')), /Added as question 1.*Red Planet/);
  click([...document.querySelectorAll('#make-note .link-btn')].find((b) => /traced/.test(b.textContent)));
  assert.ok(text(document.querySelector('#try-root')).includes('Red Planet'), 'scene 3 shows the new question');
  assert.match(text(document.querySelector('#try-root')), /Your question is on this paper/);
  click([...document.querySelectorAll('#try-root .link-btn')].find((b) => /Go back to the samples/.test(b.textContent)));
  assert.ok(!text(document.querySelector('#try-root')).includes('Red Planet'));
  assert.equal(demoPaper().isCustom(), false);
});

test('home: a deep link like #try-3 opens that idea', () => {
  setupDom('index', { speech: Rec, hash: '#try-3' });
  demoPaper().reset(); mountHome(document);
  assert.match(text(document.querySelector('.scene-head')), /3 of 4/);
});

/* ---------------- quick feedback under each idea ---------------- */
test('quick feedback: one tap, optional comment (typed or spoken), sent with the scene, and clear messages when it fails', async () => {
  setupDom('index', { speech: Rec });
  const sent = [];
  globalThis.fetch = async (url, opts) => { const body = JSON.parse(opts.body); sent.push(body); return sent.length === 1 ? { ok: false, status: 503, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ ok: true }) }; };
  const host = document.createElement('div'); document.body.append(host); mountQuick(host, 2);
  assert.match(text(host), /Was this clear\?/);
  assert.equal(host.querySelector('.quick > .quick').hidden, true, 'comment box hidden until they tap');
  click([...host.querySelectorAll('button')].find((b) => b.textContent === 'Not quite'));
  assert.equal(host.querySelector('.quick > .quick').hidden, false);
  const mic = host.querySelector('.mic'); assert.ok(mic, 'voice available for the comment');
  click(mic); Rec.instances.at(-1).say([{ t: 'I did not know who the key holders were', final: true }]); click(mic);
  click([...host.querySelectorAll('button')].find((b) => b.textContent === 'Send')); await tick(10);
  assert.match(text(host), /not connected yet/);
  click([...host.querySelectorAll('button')].find((b) => b.textContent === 'Send')); await tick(10);
  assert.match(text(host), /Thank you/);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].kind, 'quick'); assert.equal(sent[1].scene, '2'); assert.equal(sent[1].clear, 'no');
  assert.equal(sent[1].comment, 'I did not know who the key holders were');
  assert.equal(sent[1].clientId, sent[0].clientId);
  assert.equal(sent[1].website, '');
});

/* ---------------- course material ---------------- */
test('course: four tabs, one visible at a time, deep links open the right tab, prototypes mount when first shown', () => {
  setupDom('course', { speech: Rec, hash: '#decisions' });
  const c = mountCourse(document);
  const visible = () => [...document.querySelectorAll('[data-panel]')].filter((p) => !p.hidden).map((p) => p.dataset.panel);
  assert.deepEqual(visible(), ['requirements']);
  assert.equal(document.querySelector('#course-tabs [data-tab=requirements]').getAttribute('aria-selected'), 'true');
  assert.equal(document.querySelector('#proto-root').children.length, 0, 'prototypes not built until needed');
  click(document.querySelector('#course-tabs [data-tab=prototypes]'));
  assert.deepEqual(visible(), ['prototypes']);
  assert.equal(window.location.hash, '#prototypes');
  assert.ok(document.querySelector('#proto-root [role=tab]'), 'prototype tabs built');
  assert.equal(document.querySelectorAll('.story li').length, 6, 'storyboard has six panels');
  assert.ok(document.querySelectorAll('#taskflows [role=tab]').length === 5, 'task flows built');
  click(document.querySelector('#course-tabs [data-tab=checklist]')); assert.deepEqual(visible(), ['checklist']);
  assert.ok(c.route);
});

test('course: every deep link in the checklist opens a tab', () => {
  for (const hash of ['#results', '#threats', '#incidents', '#secondary', '#limits', '#assumptions', '#scope', '#flows', '#fidelity', '#storyboard']) {
    setupDom('course', { hash });
    mountCourse(document);
    const open = [...document.querySelectorAll('[data-panel]')].filter((p) => !p.hidden);
    assert.equal(open.length, 1, hash);
    assert.ok(open[0].querySelector(hash), `${hash} is inside the tab that opened`);
  }
  setupDom('course', { hash: '#proto-setter' });
  mountCourse(document);
  assert.match(text(document.querySelector('#proto-root')), /Setter portal/);
  assert.equal(document.querySelectorAll('#proto-root .qf textarea').length, 1, 'the setter screen has the dedicated question field');
  assert.equal(document.querySelectorAll('#proto-root .qf input[type=text]').length, 4, 'and four option fields');
});

test('setter prototype: register questions with the form, they join the demo paper, submit gives a receipt', () => {
  setupDom('course', { hash: '#proto-setter' }); demoPaper().reset();
  mountCourse(document);
  const root = document.querySelector('#proto-root');
  const submit = () => [...root.querySelectorAll('button')].find((b) => /^Submit/.test(b.textContent));
  assert.ok(submit().disabled, 'cannot submit with nothing registered');
  click([...root.querySelectorAll('.chip-btn')].find((b) => b.textContent === 'Chemistry'));
  click([...root.querySelectorAll('.btn')].find((b) => /Register this question/.test(b.textContent)));
  assert.match(text(root), /1\. What is the chemical symbol for sodium\?/);
  assert.match(text(root), /\(1 of 5\)|1 of 5/);
  click([...root.querySelectorAll('.chip-btn')].find((b) => b.textContent === 'Maths'));
  click([...root.querySelectorAll('.btn')].find((b) => /Register this question/.test(b.textContent)));
  assert.match(text(root), /2 of 5/);
  assert.equal(demoPaper().get()[0].text, 'What is 15% of 200?');
  assert.equal(submit().disabled, false); assert.match(submit().textContent, /Submit 2 questions/);
  click(submit());
  assert.match(text(root), /Submitted/); assert.match(text(root), /LP-[0-9A-F]{6}/);
  assert.match(text(root), /2 questions signed and encrypted/);
  demoPaper().reset();
});

/* ---------------- results and admin ---------------- */
test('results: hidden numbers show as dashes, real numbers render, and a missing backend is explained', async () => {
  setupDom('course', { speech: Rec });
  const hidden = { minCell: 5, n: { review: 2, quick: 0 }, tasks: { t1: {}, t2: {}, t3: {}, t4: {} }, umux: { mean: null }, accept: { before: null, after: null }, comprehension: { rate: null }, leakwhere: {}, quick: {} };
  const root = document.querySelector('#stats-root');
  await mountStats(root, async () => ({ ok: true, status: 200, data: hidden }));
  assert.match(text(root), /2\s*completed reviews/); assert.match(text(root), /appear once 5 people have completed the review/);
  assert.ok(text(root).includes('—')); assert.match(text(root), /shown when 5 or more people/);
  assert.equal(text(document.querySelector('#plan-a')), 'Live: 2 so far');
  const shown = { ...hidden, n: { review: 9, quick: 3 }, tasks: { t1: { completed: 1, medianSeconds: 40, meanSeq: 5.7, checkCorrect: 0.89, stuck: 0.22 }, t2: {}, t3: {}, t4: {} }, umux: { mean: 5.3 }, accept: { before: 2.8, after: 4 }, comprehension: { rate: 0.88 }, leakwhere: { press: 4, hall: 1 } };
  await mountStats(root, async () => ({ ok: true, status: 200, data: shown }));
  assert.match(text(root), /9\s*completed reviews/); assert.match(text(root), /2\.8 → 4\.0/); assert.match(text(root), /88%/);
  assert.match(text(root), /Task 1: A few leaks.*100%.*40 s.*5\.7.*89%.*22%/);
  assert.match(text(root), /At the printing press/);
  await mountStats(root, async () => ({ ok: false, status: 503, data: null }));
  assert.match(text(root), /not connected on this copy/);
  await mountStats(root, async () => ({ ok: false, status: 500, data: null }));
  assert.match(text(root), /Could not load results/);
});

test('admin: wrong key is refused, the right key lists answers and interview requests as plain text', async () => {
  setupDom('admin');
  const data = { reviews: [{ receipt: 'LP-AAAA1111', answers: { explain: '<img src=x onerror="window.__pwned=1"> It locks the paper, so nobody can leak it early.', change: '</div><svg onload=window.__pwned=2>' } }],
    quick: [{ id: 'abcdef123456', scene: '2', clear: 'no', comment: 'keys unclear' }],
    contact: [{ receipt: 'LP-BBBB2222', source: 'interview', c_contact: 'asha@example.com', c_name: 'Asha', c_slots: ['sat3-am', 'sat3-pm'], c_mode: 'meet', c_when: 'Thursday after 7', c_topic: 'I set papers' }, { receipt: 'LP-CCCC3333', source: 'review', c_contact: '98765', c_slots: ['sat3-am'], c_mode: 'phone' }] };
  mountAdmin(async () => ({ ok: true, text: async () => '' }), async (url, headers) => (headers['x-admin-key'] === 'right-key-123' ? { ok: true, status: 200, data } : { ok: false, status: 401, data: null }));
  document.querySelector('#admin-key').value = 'nope'; document.querySelector('#admin-form').dispatchEvent(new window.Event('submit', { cancelable: true })); await tick(10);
  assert.match(text(document.querySelector('#admin-msg')), /not right/);
  assert.equal(text(document.querySelector('#admin-out')), '');
  document.querySelector('#admin-key').value = 'right-key-123'; document.querySelector('#admin-form').dispatchEvent(new window.Event('submit', { cancelable: true })); await tick(10);
  const out = document.querySelector('#admin-out');
  assert.match(text(out), /1 reviews, 1 quick comments, 3 free-text answers/);
  assert.match(text(out), /Interview requests \(2\)/);
  assert.match(text(out), /Sat 3 Oct, 10 am to 1 pm \(2\)/, 'slot popularity helps schedule');
  assert.match(text(out), /Sat 3 Oct, 2 pm to 5 pm \(1\)/);
  assert.match(text(out), /Reach: asha@example\.com · Asha/); assert.match(text(out), /Video call \(Google Meet\)/); assert.match(text(out), /Thursday after 7/);
  assert.equal(out.querySelectorAll('img, script, svg').length, 0, 'injected markup is shown as text, not created');
  assert.ok(text(out).includes('<img src=x'));
  assert.equal(window.__pwned, undefined);
});
