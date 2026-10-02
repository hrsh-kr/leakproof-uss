// Question form: one question field, four option fields, a live preview, presets.
// It formats what you type and registers it as a question. All text goes in as text, never HTML.
import { h, fill } from './dom.js';
import { formatQuestion, PRESETS, pickPreset, LETTERS, LIMITS } from './question.mjs';

let uid = 0;

export function mountQuestionForm(root, { onRegister, submitLabel = 'Add question', usedTexts = () => [], hint = '' } = {}) {
  const id = 'qf' + ++uid;
  const touched = { question: false, options: [false, false, false, false] };
  let correct = null, submitted = false;

  const qField = h('textarea', { id: id + '-q', class: 'rv-input qf-q', rows: '2', maxlength: String(LIMITS.question + 40), placeholder: 'Type your question, for example: Which unit measures electric current?' });
  const optFields = LETTERS.map((l, i) => h('input', { id: `${id}-o${i}`, class: 'rv-input', type: 'text', maxlength: String(LIMITS.option + 20), placeholder: `Option ${l.toUpperCase()}`, 'aria-label': `Option ${l.toUpperCase()}` }));
  const radios = LETTERS.map((l, i) => {
    const r = h('input', { type: 'radio', name: id + '-correct', value: String(i), 'aria-label': `Option ${l.toUpperCase()} is correct` });
    r.addEventListener('change', () => { correct = i; update(); });
    return r;
  });
  const errQ = h('p', { class: 'rv-err', role: 'alert' });
  const errOpts = LETTERS.map(() => h('p', { class: 'rv-err', role: 'alert' }));
  const preview = h('div', { class: 'qf-preview', 'aria-live': 'polite' });
  const msg = h('p', { class: 'fineprint', role: 'status', 'aria-live': 'polite' });
  const submit = h('button', { class: 'btn', type: 'button' }, submitLabel);
  const clear = h('button', { class: 'link-btn', type: 'button' }, 'Clear');

  function read() { return { question: qField.value, options: optFields.map((f) => f.value), correct }; }

  function update() {
    const r = formatQuestion(read());
    const anyText = qField.value.trim() || optFields.some((f) => f.value.trim());
    errQ.textContent = (touched.question || submitted) ? (r.errors.question || '') : '';
    errOpts.forEach((e, i) => { e.textContent = (touched.options[i] || submitted) ? (r.errors.options[i] || '') : ''; });
    if (r.ok) {
      fill(preview, [h('div', { class: 'qf-tag' }, 'Will be registered as'), h('div', { class: 'qf-q-out' }, r.value.text),
        h('ol', { class: 'qf-opts', type: 'a' }, r.value.options.map((o, i) => h('li', { class: correct === i ? 'ok' : '' }, o, correct === i ? h('span', { class: 'badge done' }, 'correct') : null)))]);
    } else {
      fill(preview, [h('div', { class: 'qf-tag' }, 'Preview'), h('p', { class: 'muted' }, anyText ? 'Fill in the question and all four options. It formats itself: capital letter, question mark, no A) or 1) labels needed.' : 'Your question appears here, neatly formatted, as you type.')]);
    }
    return r;
  }

  qField.addEventListener('input', update);
  qField.addEventListener('blur', () => { touched.question = true; update(); });
  optFields.forEach((f, i) => { f.addEventListener('input', update); f.addEventListener('blur', () => { touched.options[i] = true; update(); }); });

  function fillPreset(p) {
    qField.value = p.question; optFields.forEach((f, i) => { f.value = p.options[i]; });
    correct = p.correct; radios.forEach((r, i) => { r.checked = i === p.correct; });
    submitted = false; msg.textContent = ''; update();
  }
  const chips = h('div', { class: 'qf-presets', role: 'group', 'aria-label': 'Example questions' },
    h('span', { class: 'muted' }, 'Quick start:'),
    ...PRESETS.map((p) => h('button', { class: 'chip-btn', type: 'button', onclick: () => fillPreset(p) }, p.label)),
    h('button', { class: 'chip-btn', type: 'button', onclick: () => fillPreset(pickPreset(usedTexts())) }, 'Surprise me'));

  function reset() {
    qField.value = ''; optFields.forEach((f) => { f.value = ''; }); correct = null; radios.forEach((r) => { r.checked = false; });
    touched.question = false; touched.options = [false, false, false, false]; submitted = false; update();
  }
  clear.addEventListener('click', () => { reset(); msg.textContent = ''; });
  submit.addEventListener('click', () => {
    submitted = true;
    const r = update();
    if (!r.ok) { msg.textContent = 'Almost. Fix the highlighted fields.'; const first = !r.errors.question ? r.errors.options.findIndex(Boolean) : -1; (r.errors.question ? qField : optFields[Math.max(0, first)]).focus(); return; }
    const note = onRegister ? onRegister(r.value) : '';
    reset();
    msg.textContent = note || 'Registered.';
  });

  fill(root, [h('div', { class: 'qf' },
    chips,
    h('label', { class: 'qf-label', for: id + '-q' }, 'Question'), qField, errQ,
    h('div', { class: 'qf-opts-head' }, h('span', null, 'Four options'), h('span', { class: 'muted' }, 'Tick the correct one (optional)')),
    ...LETTERS.flatMap((l, i) => [
      h('div', { class: 'qf-row' }, h('span', { class: 'qf-letter', 'aria-hidden': 'true' }, l.toUpperCase()), optFields[i], h('label', { class: 'qf-correct' }, radios[i], h('span', null, 'Correct'))),
      errOpts[i]]),
    preview,
    hint ? h('p', { class: 'fineprint' }, hint) : null,
    h('div', { class: 'cta', style: 'justify-content:flex-start;gap:12px' }, submit, clear), msg)]);
  update();
  return { fillPreset, read, reset };
}
