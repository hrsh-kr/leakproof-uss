// Question widgets shared by the review and the interview form. `answers` is a plain object that is
// updated in place; onChange() is called after every change (used to save progress).
import { visible, requiredNow } from './survey-def.mjs';
import { voiceControl } from './voice.js';
import { h } from './dom.js';

export function createWidgets(answers, onChange = () => {}) {
  function setAnswer(id, v) {
    if (v === '' || v == null || (Array.isArray(v) && v.length === 0)) delete answers[id]; else answers[id] = v;
    onChange();
  }
  const star = (q) => (requiredNow(q, answers) ? h('span', { class: 'req', 'aria-label': 'required' }, ' *') : null);
  const legend = (q) => h('legend', { class: 'ql', style: 'padding:0' }, q.label, star(q));
  const help = (q) => (q.help ? h('div', { class: 'qh' }, q.help) : null);

  function singleQ(q, onAny) {
    const cur = answers[q.id];
    return h('fieldset', { class: 'q', style: 'border:0', 'data-q': q.id }, legend(q), help(q),
      h('div', { class: 'opts' }, q.options.map((o) => {
        const inp = h('input', { type: 'radio', name: q.id, value: o.value });
        inp.checked = cur === o.value;
        inp.addEventListener('change', () => { setAnswer(q.id, o.value); onAny(); });
        return h('label', { class: 'opt' }, inp, h('span', null, o.label));
      })));
  }
  function multiQ(q, onAny) {
    const cur = new Set(answers[q.id] || []);
    const boxes = [];
    const refresh = () => { if (!q.max) return; boxes.forEach((b) => { if (!b.checked) b.disabled = cur.size >= q.max; }); };
    const el = h('fieldset', { class: 'q', style: 'border:0', 'data-q': q.id }, legend(q), help(q),
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
    const cur = answers[q.id];
    const pts = [];
    for (let v = q.scale.min; v <= q.scale.max; v++) {
      const inp = h('input', { type: 'radio', name: q.id, value: String(v), 'aria-label': `${v}` });
      inp.checked = cur === v;
      inp.addEventListener('change', () => { setAnswer(q.id, v); onAny(); });
      pts.push(h('label', null, inp, String(v)));
    }
    return h('fieldset', { class: 'q', style: 'border:0', 'data-q': q.id }, legend(q), help(q),
      h('div', { class: 'scale' }, h('div', { class: 'pts' }, pts), h('div', { class: 'ends' }, h('span', null, `${q.scale.min} ${q.scale.minLabel}`), h('span', null, `${q.scale.max} ${q.scale.maxLabel}`))));
  }
  function textQ(q, onAny, forceId) {
    const id = forceId || q.id;
    const short = (q.maxLen || 0) <= 200;
    const field = short
      ? h('input', { class: 'rv-input', type: 'text', maxlength: String(q.maxLen || 200), 'aria-label': q.label || id })
      : h('textarea', { rows: '4', maxlength: String(q.maxLen || 1000), 'aria-label': q.label || id });
    field.value = answers[id] || '';
    field.addEventListener('input', () => { setAnswer(id, field.value.trim() ? field.value : ''); onAny(); });
    const body = [q.label ? h('div', { class: 'ql' }, q.label, star(q)) : null, help(q), field];
    if (q.voice && !short) body.push(voiceControl(field));
    return h('div', { class: 'q txt', 'data-q': id }, ...body);
  }
  function consentQ(q, onAny) {
    const inp = h('input', { type: 'checkbox', id: 'consent-box' });
    inp.checked = answers.consent === true;
    inp.addEventListener('change', () => { setAnswer('consent', inp.checked ? true : ''); onAny(); });
    return h('div', { class: 'q', 'data-q': 'consent' }, h('label', { class: 'opt', for: 'consent-box' }, inp, h('span', null, q.label, h('span', { class: 'req' }, ' *'))));
  }
  function decisionQ(q, onAny) {
    const radios = [['agree', 'Agree'], ['unsure', 'Not sure'], ['disagree', 'Disagree']].map(([v, l]) => {
      const inp = h('input', { type: 'radio', name: q.id, value: v }); inp.checked = answers[q.id] === v;
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
  /** Renders a list with showIf handling; stars update when an answer changes a requirement. */
  function renderList(qs) {
    const items = qs.map((q) => ({ q, el: null }));
    const refresh = () => items.forEach((it) => {
      it.el.hidden = !visible(it.q, answers);
      const s = it.el.querySelector('.ql .req');
      const need = requiredNow(it.q, answers);
      if (need && !s && it.q.requiredIf) { const t = it.el.querySelector('.ql, legend'); if (t) t.append(h('span', { class: 'req', 'aria-label': 'required' }, ' *')); }
    });
    items.forEach((it) => { it.el = renderQ(it.q, refresh); });
    refresh();
    return { nodes: items.map((i) => i.el), refresh };
  }
  function missingIn(qs) {
    const miss = [];
    for (const q of qs) {
      if (!visible(q, answers) || !requiredNow(q, answers)) continue;
      const v = answers[q.id];
      const empty = v == null || v === '' || (Array.isArray(v) && v.length === 0);
      if (q.type === 'consent' ? v !== true : empty) miss.push(q);
      else if (q.minLen && typeof v === 'string' && v.trim().length < q.minLen) miss.push(q);
    }
    return miss;
  }
  return { renderQ, renderList, missingIn, setAnswer };
}
