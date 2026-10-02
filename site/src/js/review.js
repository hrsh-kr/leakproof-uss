// The remote usability test: step-by-step flow, task timing, voice or typed answers, receipt.
import { SECTIONS, STUDY, flatten, visible } from './survey-def.mjs';
import { SCENES } from './scenes.js';
import { voiceControl } from './voice.js';
import { postJson, newClientId } from './api.js';
import { h, fill, $ } from './dom.js';

const KEY = 'lp-review-v1';
const root = $('#review-root');
if (root) start();

function load() {
  try { const s = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (s && s.clientId) return s; } catch { /* ignore */ }
  return { clientId: newClientId(), answers: {}, metrics: {}, step: 'intro', optional: null, startedAt: Date.now(), receipt: null };
}

function start() {
  const state = load();
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage blocked */ } };
  const section = (id) => SECTIONS.find((s) => s.id === id);
  const taskQs = section('tasks').questions;
  let taskTimer = null, taskStart = {}, taskActions = {}, mounted = null;

  function steps() {
    const s = [{ key: 'intro' }, { key: 'about' }, { key: 'before' }, { key: 'tasks-intro' }];
    for (const t of taskQs) s.push({ key: t.id });
    s.push({ key: 'overall' }, { key: 'gate' });
    if (state.optional === true) s.push({ key: 'decisions' }, { key: 'more' });
    s.push({ key: 'finish' });
    return s;
  }
  const idxOf = (key) => steps().findIndex((x) => x.key === key);

  /* ---------- question widgets ---------- */
  function setAnswer(id, v) {
    if (v === '' || v == null || (Array.isArray(v) && v.length === 0)) delete state.answers[id]; else state.answers[id] = v;
    save();
  }
  const labelEl = (q) => h('div', { class: 'ql' }, q.label, q.required ? h('span', { class: 'req', 'aria-label': 'required' }, ' *') : null);
  const helpEl = (q) => (q.help ? h('div', { class: 'qh' }, q.help) : null);

  function singleQ(q, onAny) {
    const cur = state.answers[q.id];
    return h('fieldset', { class: 'q', style: 'border:0', 'data-q': q.id }, h('legend', { class: 'ql', style: 'padding:0' }, q.label, q.required ? h('span', { class: 'req' }, ' *') : null), helpEl(q),
      h('div', { class: 'opts' }, q.options.map((o) => {
        const inp = h('input', { type: 'radio', name: q.id, value: o.value });
        inp.checked = cur === o.value;
        inp.addEventListener('change', () => { setAnswer(q.id, o.value); onAny(); });
        return h('label', { class: 'opt' }, inp, h('span', null, o.label));
      })));
  }
  function multiQ(q, onAny) {
    const cur = new Set(state.answers[q.id] || []);
    const boxes = [];
    const refresh = () => { if (!q.max) return; boxes.forEach((b) => { if (!b.checked) b.disabled = cur.size >= q.max; }); };
    const el = h('fieldset', { class: 'q', style: 'border:0', 'data-q': q.id }, h('legend', { class: 'ql', style: 'padding:0' }, q.label, q.required ? h('span', { class: 'req' }, ' *') : null), helpEl(q),
      h('div', { class: 'opts' }, q.options.map((o) => {
        const inp = h('input', { type: 'checkbox', value: o.value });
        inp.checked = cur.has(o.value); boxes.push(inp);
        inp.addEventListener('change', () => { if (inp.checked) cur.add(o.value); else cur.delete(o.value); setAnswer(q.id, Array.from(cur)); refresh(); onAny(); });
        return h('label', { class: 'opt' }, inp, h('span', null, o.label));
      })));
    refresh();
    return el;
  }
  function scaleQ(q, onAny) {
    const cur = state.answers[q.id];
    const pts = [];
    for (let v = q.scale.min; v <= q.scale.max; v++) {
      const inp = h('input', { type: 'radio', name: q.id, value: String(v), 'aria-label': `${v}` });
      inp.checked = cur === v;
      inp.addEventListener('change', () => { setAnswer(q.id, v); onAny(); });
      pts.push(h('label', null, inp, String(v)));
    }
    return h('fieldset', { class: 'q', style: 'border:0', 'data-q': q.id }, h('legend', { class: 'ql', style: 'padding:0' }, q.label, q.required ? h('span', { class: 'req' }, ' *') : null), helpEl(q),
      h('div', { class: 'scale' }, h('div', { class: 'pts' }, pts), h('div', { class: 'ends' }, h('span', null, `${q.scale.min} ${q.scale.minLabel}`), h('span', null, `${q.scale.max} ${q.scale.maxLabel}`))));
  }
  function textQ(q, onAny, forceId) {
    const id = forceId || q.id;
    const short = (q.maxLen || 0) <= 200;
    const field = short
      ? h('input', { class: 'rv-input', type: 'text', maxlength: String(q.maxLen || 200), 'aria-label': q.label || id })
      : h('textarea', { rows: '4', maxlength: String(q.maxLen || 1000), 'aria-label': q.label || id });
    field.value = state.answers[id] || '';
    const counter = h('span', { class: 'count' }, '');
    field.addEventListener('input', () => { setAnswer(id, field.value.trim() ? field.value : ''); onAny(); });
    const body = [q.label ? labelEl(q) : null, helpEl(q), field];
    if (q.voice && !short) body.push(voiceControl(field));
    return h('div', { class: 'q txt', 'data-q': id }, ...body, counter);
  }
  function consentQ(q, onAny) {
    const inp = h('input', { type: 'checkbox', id: 'consent-box' });
    inp.checked = state.answers.consent === true;
    inp.addEventListener('change', () => { setAnswer('consent', inp.checked ? true : ''); onAny(); });
    return h('div', { class: 'q', 'data-q': 'consent' }, h('label', { class: 'opt', for: 'consent-box' }, inp, h('span', null, q.label, h('span', { class: 'req' }, ' *'))));
  }
  function decisionQ(q, onAny) {
    const radios = [['agree', 'Agree'], ['unsure', 'Not sure'], ['disagree', 'Disagree']].map(([v, l]) => {
      const inp = h('input', { type: 'radio', name: q.id, value: v }); inp.checked = state.answers[q.id] === v;
      inp.addEventListener('change', () => { setAnswer(q.id, v); onAny(); });
      return h('label', { class: 'opt', style: 'flex:1;justify-content:center' }, inp, h('span', null, l));
    });
    const why = textQ({ id: q.id + '_why', type: 'text', voice: true, maxLen: 1000, label: 'Why? (optional)' }, onAny);
    return h('div', { class: 'dcard', 'data-q': q.id }, h('h3', { style: 'font-size:1.05rem' }, q.title),
      h('div', { class: 'pc' }, h('div', { class: 'p' }, h('b', null, 'Good'), q.pros), h('div', { class: 'c' }, h('b', null, 'Cost'), q.cons)),
      h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, radios), why);
  }
  function renderQ(q, onAny) {
    switch (q.type) {
      case 'single': return singleQ(q, onAny);
      case 'multi': return multiQ(q, onAny);
      case 'scale': return scaleQ(q, onAny);
      case 'text': return textQ(q, onAny);
      case 'consent': return consentQ(q, onAny);
      case 'decision': return decisionQ(q, onAny);
      default: return h('div');
    }
  }
  /** Render a list of questions with showIf handling. Returns { nodes, refresh }. */
  function renderList(qs) {
    const items = qs.map((q) => ({ q, el: null }));
    const refresh = () => items.forEach((it) => { it.el.hidden = !visible(it.q, state.answers); });
    items.forEach((it) => { it.el = renderQ(it.q, refresh); });
    refresh();
    return { nodes: items.map((i) => i.el), refresh };
  }
  function missingIn(qs) {
    const miss = [];
    for (const q of qs) {
      if (!visible(q, state.answers) || !q.required) continue;
      const v = state.answers[q.id];
      const empty = v == null || v === '' || (Array.isArray(v) && v.length === 0);
      if (q.type === 'consent' ? v !== true : empty) miss.push(q);
      else if (q.minLen && typeof v === 'string' && v.trim().length < q.minLen) miss.push(q);
    }
    return miss;
  }

  /* ---------- pages ---------- */
  const err = h('p', { class: 'rv-err', role: 'alert' });
  function page(key) {
    stopTimer();
    if (key === 'intro') return introPage();
    if (key === 'tasks-intro') return tasksIntro();
    if (key === 'gate') return gatePage();
    if (taskQs.some((t) => t.id === key)) return taskPage(taskQs.find((t) => t.id === key));
    return sectionPage(section(key));
  }
  function sectionPage(sec) {
    const { nodes } = renderList(sec.questions);
    return { title: sec.title, intro: sec.intro, body: nodes, validate: () => missingIn(sec.questions) };
  }
  function introPage() {
    const list = (items) => h('ul', { class: 'prose', style: 'margin:0;padding-left:1.2rem;display:grid;gap:6px' }, items.map((i) => h('li', null, i)));
    const { nodes } = renderList(section('intro').questions);
    return { title: 'Help us test an idea', intro: null, body: [
      h('div', { class: 'callout' }, h('strong', null, 'Thank you for helping.'), ' We are a team in Usable Security and Privacy at IIIT-Delhi. We are designing a way to stop exam papers leaking, and we want to find out what is unclear before we build the real tool.'),
      h('div', { class: 'q' }, h('div', { class: 'ql' }, 'What you will do'), list([`Try four small working prototypes, one task each, then answer a few questions. About ${STUDY.approxMinutes} minutes, on a phone or laptop.`, 'You are testing the design, not yourself. There are no wrong answers, and honest criticism helps most.'])),
      h('div', { class: 'q' }, h('div', { class: 'ql' }, 'What we collect'), list(['Your answers, how long each task takes, and how many taps you make.', 'Optional: spoken comments turned into text by your browser. We keep only the text, never the audio.', 'No name unless you choose to add one at the end for participation credit. Names and contact details are stored apart from your answers.', 'We use answers only for this course project and quote them without names.'])),
      h('div', { class: 'q' }, h('div', { class: 'ql' }, 'What you get'), list(['A participation receipt at the end. The course gives 1% for every five studies you take part in. Ask your TA how to log it.', 'You can stop at any time by closing the tab.'])),
      ...nodes], validate: () => missingIn(section('intro').questions), next: 'Start' };
  }
  function tasksIntro() {
    return { title: 'Four short tasks', intro: section('tasks').intro, body: [
      h('div', { class: 'q' }, h('div', { class: 'ql' }, 'How each task works'), h('ol', { class: 'plain', style: 'margin:0' },
        [h('li', null, 'Read the scenario, the goal and the end line.'), h('li', null, 'Try the prototype. A timer runs; around two minutes is plenty.'),
          h('li', null, 'Press "I\'m done" when you meet the end line, or "I\'m stuck, skip" if you cannot.'), h('li', null, 'Answer a few short questions about that task.')])),
      h('div', { class: 'callout' }, 'Think out loud if you like. After each task you can speak your comments instead of typing.')], validate: () => [] };
  }
  function taskPage(t) {
    const m = state.metrics[t.id] || null;
    const stage = h('div', { class: 'task-stage' });
    const timer = h('span', { class: 'timer', role: 'timer', 'aria-live': 'off' }, '0:00');
    const overNote = h('p', { class: 'fineprint', hidden: true }, 'That is about two minutes. You can keep going, or press "I\'m stuck, skip".');
    const post = h('div', { style: 'display:grid;gap:14px', hidden: !m });
    const { nodes, refresh } = renderList(t.post);
    post.append(h('h3', null, 'A few questions about this task'), ...nodes);
    const done = h('button', { class: 'btn', type: 'button' }, 'I\'m done');
    const skip = h('button', { class: 'btn outline', type: 'button' }, 'I\'m stuck, skip');
    const controls = h('div', { class: 'cta', style: 'justify-content:flex-start' }, done, skip, timer);
    function finish(result) {
      if (!state.metrics[t.id]) {
        state.metrics[t.id] = { seconds: Math.min(3600, Math.round((Date.now() - (taskStart[t.id] || Date.now())) / 1000)), actions: Math.min(1000, taskActions[t.id] || 0), result };
        save();
      }
      stopTimer(); controls.hidden = true; post.hidden = false; refresh();
      post.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    done.addEventListener('click', () => finish('done'));
    skip.addEventListener('click', () => finish('skipped'));
    if (m) controls.hidden = true;
    const ctl = SCENES[t.scene];
    taskActions[t.id] = taskActions[t.id] || 0;
    mounted = ctl(stage, { onAction: () => { taskActions[t.id] = (taskActions[t.id] || 0) + 1; } });
    if (!m) {
      taskStart[t.id] = taskStart[t.id] || Date.now();
      const tick = () => { const s = Math.round((Date.now() - taskStart[t.id]) / 1000); timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; if (s >= t.limitSec) { timer.classList.add('over'); overNote.hidden = false; } };
      taskTimer = setInterval(tick, 1000); tick();
    }
    const card = h('div', { class: 'taskcard' }, h('dl', null,
      h('div', null, h('dt', null, 'Scenario'), h('dd', null, t.scenario)), h('div', null, h('dt', null, 'Your goal'), h('dd', null, t.goal)), h('div', null, h('dt', null, 'You are done when'), h('dd', null, t.end))));
    return { title: t.title, intro: null, body: [card, stage, controls, overNote, post], validate: () => {
      if (!state.metrics[t.id]) return [{ label: 'Press "I\'m done" or "I\'m stuck, skip" first' }];
      return missingIn(t.post);
    } };
  }
  function stopTimer() { if (taskTimer) { clearInterval(taskTimer); taskTimer = null; } }
  function gatePage() {
    const go = (yes) => { state.optional = yes; save(); show(yes ? 'decisions' : 'finish'); };
    return { title: 'That was the main part. Thank you.', intro: 'Want to help more? Four extra minutes lets you vote on our design choices and tell us more. It is optional.', hideNav: true, body: [
      h('div', { class: 'cta', style: 'justify-content:flex-start' }, h('button', { class: 'btn', type: 'button', onclick: () => go(true) }, 'Yes, four more minutes'), h('button', { class: 'btn outline', type: 'button', onclick: () => go(false) }, 'No, finish now'))], validate: () => [] };
  }

  /* ---------- shell ---------- */
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
    const back = h('button', { class: 'btn outline', type: 'button', disabled: i === 0, onclick: () => show(all[Math.max(0, i - 1)].key === 'gate' ? 'overall' : all[Math.max(0, i - 1)].key) }, 'Back');
    const nextBtn = h('button', { class: 'btn', type: 'button' }, isFinish ? 'Submit and get my receipt' : (p.next || 'Next'));
    nextBtn.addEventListener('click', async () => {
      const miss = p.validate();
      if (miss.length) { err.textContent = 'Please answer: ' + miss.map((q) => q.label.replace(/\s+/g, ' ').slice(0, 70)).join(' · '); err.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
      if (isFinish) { nextBtn.disabled = true; await submit(nextBtn); return; }
      show(all[i + 1].key);
    });
    const nav = p.hideNav ? null : h('div', { class: 'rv-nav' }, back, nextBtn);
    const step = h('div', { class: 'rv-step' }, h('h2', { tabindex: '-1', id: 'rv-h' }, p.title), p.intro ? h('p', { class: 'rv-intro' }, p.intro) : null, ...p.body, isFinish ? hp : null, err, nav);
    fill(shell, [top, step]);
    window.scrollTo({ top: 0, behavior: 'instant' }); const hh = $('#rv-h'); if (hh) hh.focus({ preventScroll: true });
  }

  /* ---------- submit and receipt ---------- */
  function buildPayload() {
    const answers = {};
    const q = flatten();
    for (const x of q) {
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
    const r = await postJson('/api/submit', payload);
    if (r.ok) {
      state.receipt = { code: r.data.receipt, at: new Date().toISOString(), seconds: payload.totalSeconds };
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
      h('div', { class: 'receipt' }, h('dl', null, h('dt', null, 'Study'), h('dd', null, STUDY.title), h('dt', null, 'Team'), h('dd', null, STUDY.team), h('dt', null, 'Date'), h('dd', null, when.toLocaleString()),
        h('dt', null, 'Time taken'), h('dd', null, `About ${mins(r.seconds)}`), h('dt', null, 'Receipt code'), h('dd', { class: 'mono', style: 'font-size:1.1rem' }, r.code))),
      h('div', { class: 'cta', style: 'justify-content:flex-start' }, copyBtn),
      h('p', { class: 'fineprint' }, 'Take a screenshot or copy the receipt. The course gives 1% for every five studies you take part in. Ask your TA how to log it. If you added your name, we can confirm your participation if asked.'),
      h('div', { class: 'callout' }, 'Want to see what changed because of your feedback? The ', h('a', { href: '/research' }, 'Research page'), ' shows results as they come in.'))]);
    const hh = $('#rv-h'); if (hh) hh.focus({ preventScroll: true });
  }

  const startKey = steps().some((s) => s.key === state.step) ? state.step : 'intro';
  show(startKey);
}
