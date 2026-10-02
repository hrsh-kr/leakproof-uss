// The remote usability test: step-by-step flow, task timing, typed answers, interview call-to-action, receipt.
import { SECTIONS, STUDY, flatten, visible, SLOTS } from './survey-def.mjs';
import { SCENES } from './scenes.js';
import { SAMPLES } from './paper.js';
import { createWidgets } from './widgets.js';
import { postJson, newClientId } from './api.js';
import { h, fill, $ } from './dom.js';

const KEY = 'lp-review-v1';

export function startReview(root, opts = {}) {
  const storage = opts.storage || (() => { try { return window.sessionStorage; } catch { return null; } })();
  const load = () => {
    try { const s = JSON.parse((storage && storage.getItem(KEY)) || 'null'); if (s && s.clientId) return s; } catch { /* ignore */ }
    return { clientId: newClientId(), answers: {}, metrics: {}, step: 'intro', optional: null, startedAt: Date.now(), receipt: null };
  };
  const state = load();
  const save = () => { try { if (storage) storage.setItem(KEY, JSON.stringify(state)); } catch { /* storage blocked */ } };
  const W = createWidgets(state.answers, save);
  const section = (id) => SECTIONS.find((s) => s.id === id);
  const taskQs = section('tasks').questions;
  let taskTimer = null; const taskStart = {}, taskActions = {};

  function steps() {
    const s = [{ key: 'intro' }, { key: 'about' }, { key: 'before' }];
    for (const t of taskQs) s.push({ key: t.id });
    s.push({ key: 'overall' }, { key: 'gate' });
    if (state.optional === true) s.push({ key: 'decisions' }, { key: 'more' });
    s.push({ key: 'finish' });
    return s;
  }
  const idxOf = (key) => steps().findIndex((x) => x.key === key);

  const err = h('p', { class: 'rv-err', role: 'alert' });
  const stopTimer = () => { if (taskTimer) { clearInterval(taskTimer); taskTimer = null; } };

  function page(key) {
    stopTimer();
    if (key === 'intro') return introPage();
    if (key === 'gate') return gatePage();
    const t = taskQs.find((x) => x.id === key);
    if (t) return taskPage(t);
    return sectionPage(section(key));
  }
  function sectionPage(sec) {
    const { nodes } = W.renderList(sec.questions);
    return { title: sec.title, intro: sec.intro, body: nodes, validate: () => W.missingIn(sec.questions) };
  }
  function introPage() {
    const list = (items) => h('ul', { style: 'margin:0;padding-left:1.2rem;display:grid;gap:6px' }, items.map((i) => h('li', null, i)));
    const { nodes } = W.renderList(section('intro').questions);
    return { title: 'Help us test an idea', body: [
      h('div', { class: 'callout' }, h('strong', null, 'Thank you for helping.'), ' We are a team in Usable Security and Privacy at IIIT-Delhi. We are designing a way to stop exam papers leaking, and we want to find out what is unclear before we build the real tool.'),
      h('div', { class: 'q' }, h('div', { class: 'ql' }, 'What you will do'), list([`Try four small working prototypes, one task each, then answer a few questions. About ${STUDY.approxMinutes} minutes, on a phone or laptop.`, 'You are testing the design, not yourself. There are no wrong answers, and honest criticism helps most.'])),
      h('div', { class: 'q' }, h('div', { class: 'ql' }, 'What we collect'), list(['Your answers, how long each task takes, and how many taps you make.', 'No name unless you choose to add one at the end. Names and contact details are stored apart from your answers.', 'We use answers only for this course project and quote them without names.'])),
      h('div', { class: 'q' }, h('div', { class: 'ql' }, 'What you get'), list(['A participation receipt at the end. The course gives 1% for every five studies you take part in. Ask your TA how to log it.', 'You can stop at any time by closing the tab.'])),
      ...nodes], validate: () => W.missingIn(section('intro').questions), next: 'Start' };
  }
  function taskPage(t) {
    const m = state.metrics[t.id] || null;
    const stage = h('div', { class: 'task-stage' });
    const timer = h('span', { class: 'timer', role: 'timer', 'aria-live': 'off' }, '0:00');
    const overNote = h('p', { class: 'fineprint', hidden: true }, 'That is about two minutes. You can keep going, or press "I\'m stuck, skip".');
    const post = h('div', { style: 'display:grid;gap:14px', hidden: !m, 'data-post': t.id });
    const { nodes, refresh } = W.renderList(t.post);
    post.append(h('h3', null, 'A few questions about this task'), ...nodes);
    const done = h('button', { class: 'btn', type: 'button', 'data-act': 'done' }, 'I\'m done');
    const skip = h('button', { class: 'btn outline', type: 'button', 'data-act': 'skip' }, 'I\'m stuck, skip');
    const controls = h('div', { class: 'cta', style: 'justify-content:flex-start' }, done, skip, timer);
    function finish(result) {
      if (!state.metrics[t.id]) {
        state.metrics[t.id] = { seconds: Math.min(3600, Math.round((Date.now() - (taskStart[t.id] ?? Date.now())) / 1000)), actions: Math.min(1000, taskActions[t.id] || 0), result };
        save();
      }
      stopTimer(); controls.hidden = true; post.hidden = false; refresh();
      if (post.scrollIntoView) post.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    done.addEventListener('click', () => finish('done'));
    skip.addEventListener('click', () => finish('skipped'));
    if (m) controls.hidden = true;
    taskActions[t.id] ??= 0;
    SCENES[t.scene](stage, { onAction: () => { taskActions[t.id] = (taskActions[t.id] || 0) + 1; }, paper: SAMPLES });
    if (!m) {
      taskStart[t.id] ??= Date.now();
      const tick = () => { const s = Math.round((Date.now() - taskStart[t.id]) / 1000); timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; if (s >= t.limitSec) { timer.classList.add('over'); overNote.hidden = false; } };
      taskTimer = setInterval(tick, 1000); tick();
    }
    const card = h('div', { class: 'taskcard' }, h('dl', null,
      h('div', null, h('dt', null, 'Scenario'), h('dd', null, t.scenario)), h('div', null, h('dt', null, 'Your goal'), h('dd', null, t.goal)), h('div', null, h('dt', null, 'You are done when'), h('dd', null, t.end))));
    const howTo = t.id === 't1' ? h('div', { class: 'callout' }, h('strong', null, 'How each task works. '), 'Read the scenario, goal and end line. Try the prototype; about two minutes is plenty. Press "I\'m done" when you meet the end line, or "I\'m stuck, skip" if you cannot. Then answer a few short questions.') : null;
    return { title: t.title, body: [howTo, card, stage, controls, overNote, post], validate: () => {
      if (!state.metrics[t.id]) return [{ label: 'Press "I\'m done" or "I\'m stuck, skip" first' }];
      return W.missingIn(t.post);
    } };
  }
  function gatePage() {
    const go = (yes) => { state.optional = yes; save(); show(yes ? 'decisions' : 'finish'); };
    return { title: 'That was the main part. Thank you.', intro: 'Want to help more? Four extra minutes lets you vote on our design choices and tell us more. It is optional.', hideNav: true, body: [
      h('div', { class: 'cta', style: 'justify-content:flex-start' }, h('button', { class: 'btn', type: 'button', onclick: () => go(true) }, 'Yes, four more minutes'), h('button', { class: 'btn outline', type: 'button', onclick: () => go(false) }, 'No, finish now'))], validate: () => [] };
  }

  const shell = h('div', { class: 'review' });
  fill(root, [shell]);
  const hp = h('input', { class: 'hp', type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });

  function show(key) {
    if (state.receipt) { renderReceipt(); return; }
    state.step = key; save(); err.textContent = '';
    const all = steps(); const i = idxOf(key);
    const p = page(key);
    const prog = h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(all.length), 'aria-valuenow': String(i + 1), 'aria-label': 'Progress' }, h('i', { style: `width:${Math.round(((i + 1) / all.length) * 100)}%` }));
    const top = h('div', { class: 'rv-top' }, prog, h('div', { class: 'meta' }, h('span', null, `Step ${i + 1} of ${all.length}`), h('span', null, key === 'finish' ? 'Last step' : '')));
    const isFinish = key === 'finish';
    const back = h('button', { class: 'btn outline', type: 'button', disabled: i === 0, 'data-nav': 'back', onclick: () => show(all[Math.max(0, i - 1)].key === 'gate' ? 'overall' : all[Math.max(0, i - 1)].key) }, 'Back');
    const nextBtn = h('button', { class: 'btn', type: 'button', 'data-nav': 'next' }, isFinish ? 'Submit and get my receipt' : (p.next || 'Next'));
    nextBtn.addEventListener('click', async () => {
      const miss = p.validate();
      if (miss.length) { err.textContent = 'Please answer: ' + miss.map((q) => q.label.replace(/\s+/g, ' ').slice(0, 70)).join(' · '); if (err.scrollIntoView) err.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
      if (isFinish) { nextBtn.disabled = true; await submit(nextBtn); return; }
      show(all[i + 1].key);
    });
    const nav = p.hideNav ? null : h('div', { class: 'rv-nav' }, back, nextBtn);
    const step = h('div', { class: 'rv-step' }, h('h2', { tabindex: '-1', id: 'rv-h' }, p.title), p.intro ? h('p', { class: 'rv-intro' }, p.intro) : null, ...p.body, isFinish ? hp : null, err, nav);
    fill(shell, [top, step]);
    try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch { /* not supported */ }
    const hh = $('#rv-h'); if (hh) hh.focus({ preventScroll: true });
  }

  function buildPayload() {
    const answers = {};
    for (const x of flatten()) {
      if (x.type === 'task') continue;
      if (!visible(x, state.answers)) continue;
      const v = state.answers[x.id];
      if (v === undefined || v === '' || v == null) continue;
      answers[x.id] = typeof v === 'string' ? v.trim() : v;
    }
    const metrics = {};
    for (const t of taskQs) if (state.metrics[t.id]) metrics[t.id] = state.metrics[t.id];
    return { kind: 'review', clientId: state.clientId, answers, metrics, totalSeconds: Math.min(7200, Math.round((Date.now() - state.startedAt) / 1000)), optionalDone: state.optional === true, website: hp.value };
  }
  async function submit(btn) {
    const payload = buildPayload();
    const r = await (opts.post || postJson)('/api/submit', payload);
    if (r.ok) {
      const slots = (state.answers.c_slots || []).map((v) => (SLOTS.find((s) => s.value === v) || {}).label).filter(Boolean);
      state.receipt = { code: r.data.receipt, at: new Date().toISOString(), seconds: payload.totalSeconds, interview: state.answers.followup === 'yes', slots };
      save(); renderReceipt(); return;
    }
    btn.disabled = false;
    const lines = [];
    if (r.status === 503) lines.push('This copy of the site is not connected to storage yet, so we could not save your answers. They are still in this tab.');
    else if (r.status === 0) lines.push('We could not reach the server. Check your connection and press Submit again.');
    else if (r.status === 400 && r.data && r.data.errors) lines.push('Some answers need a fix: ' + r.data.errors.slice(0, 5).join('; '));
    else lines.push('Something went wrong saving your answers. Please try again.');
    err.textContent = lines.join(' ');
    const copy = h('button', { class: 'link-btn', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(JSON.stringify(payload, null, 2)); copy.textContent = 'Copied'; } catch { copy.textContent = 'Could not copy'; } } }, 'Copy my answers');
    err.append(' ', copy);
  }
  const mins = (sec) => { const m = Math.max(1, Math.round(sec / 60)); return m === 1 ? '1 minute' : m + ' minutes'; };
  function renderReceipt() {
    const r = state.receipt;
    const when = new Date(r.at);
    const text = `Participation receipt\nStudy: ${STUDY.title}\nTeam: ${STUDY.team}\nDate: ${when.toLocaleString()}\nTime taken: about ${mins(r.seconds)}\nReceipt code: ${r.code}`;
    const copyBtn = h('button', { class: 'btn', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(text); copyBtn.textContent = 'Copied'; } catch { copyBtn.textContent = 'Select the text and copy it'; } } }, 'Copy receipt');
    fill(shell, [h('div', { class: 'rv-step' }, h('h2', { tabindex: '-1', id: 'rv-h' }, 'Thank you. You are done.'),
      h('p', { class: 'rv-intro' }, 'Your answers are saved. Here is your participation receipt.'),
      r.interview ? h('div', { class: 'callout' }, h('strong', null, 'Your call. '), `We will message you to confirm one of the times you picked${r.slots && r.slots.length ? ': ' + r.slots.join('; ') : ''}.`) : null,
      h('div', { class: 'receipt' }, h('dl', null, h('dt', null, 'Study'), h('dd', null, STUDY.title), h('dt', null, 'Team'), h('dd', null, STUDY.team), h('dt', null, 'Date'), h('dd', null, when.toLocaleString()),
        h('dt', null, 'Time taken'), h('dd', null, `About ${mins(r.seconds)}`), h('dt', null, 'Receipt code'), h('dd', { class: 'mono', style: 'font-size:1.1rem' }, r.code))),
      h('div', { class: 'cta', style: 'justify-content:flex-start' }, copyBtn),
      h('p', { class: 'fineprint' }, 'Take a screenshot or copy the receipt. The course gives 1% for every five studies you take part in. Ask your TA how to log it. If you added your name, we can confirm your participation if asked.'),
      h('div', { class: 'callout' }, 'Want to see what changed because of your feedback? The ', h('a', { href: '/course#results' }, 'results'), ' update as responses come in.'))]);
    const hh = $('#rv-h'); if (hh) hh.focus({ preventScroll: true });
  }

  const startKey = steps().some((s) => s.key === state.step) ? state.step : 'intro';
  show(startKey);
  return { state, show, steps };
}

const root = typeof document !== 'undefined' && !globalThis.__LP_TEST ? $('#review-root') : null;
if (root) startReview(root);
