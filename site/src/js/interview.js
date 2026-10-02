// "Talk to us": a minimal form to ask for a chat. Consent, when the person is free, how to reach them. We arrange the rest.
import { INTERVIEW } from './survey-def.mjs';
import { createWidgets } from './widgets.js';
import { postJson, newClientId } from './api.js';
import { h, fill, $ } from './dom.js';

export function startInterview(root, opts = {}) {
  const answers = {};
  const clientId = newClientId();
  const hint = h('p', { class: 'fineprint', id: 'iv-hint' }, 'Tick the box above to send.');
  const send = h('button', { class: 'btn', type: 'button', disabled: true, 'aria-describedby': 'iv-hint' }, 'Send my request');
  // Nothing can be sent until the person has agreed to be contacted.
  const sync = () => { const ok = answers.consent === true; send.disabled = !ok; hint.hidden = ok; };
  const W = createWidgets(answers, sync);
  const { nodes } = W.renderList(INTERVIEW.questions);
  const err = h('p', { class: 'rv-err', role: 'alert' });
  const hp = h('input', { class: 'hp', type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });

  send.addEventListener('click', async () => {
    if (answers.consent !== true) { err.textContent = 'Please tick the box to agree to be contacted. We cannot send your request without it.'; return; }
    const miss = W.missingIn(INTERVIEW.questions);
    if (miss.length) { err.textContent = 'Please fill in: ' + miss.map((q) => q.label.replace(/\s+/g, ' ').slice(0, 60)).join(' · '); return; }
    send.disabled = true; err.textContent = 'Sending…';
    const clean = {};
    for (const [k, v] of Object.entries(answers)) { const t = typeof v === 'string' ? v.trim() : v; if (t !== '' && t != null) clean[k] = t; }
    const payload = { kind: 'interview', clientId, answers: clean, website: hp.value };
    const r = await (opts.post || postJson)('/api/submit', payload);
    if (r.ok) { done(r.data.receipt); return; }
    sync();
    err.textContent = r.status === 503 ? 'This copy of the site is not connected to storage yet, so we could not save your request.'
      : r.status === 0 ? 'We could not reach the server. Check your connection and try again.'
      : r.status === 400 && r.data && r.data.errors ? 'Please check: ' + r.data.errors.slice(0, 4).join('; ') : 'Something went wrong. Please try again.';
  });

  function done(receipt) {
    fill(root, [h('div', { class: 'review' }, h('h2', { id: 'iv-h', tabindex: '-1' }, 'Thank you. We will be in touch.'),
      h('p', { class: 'rv-intro' }, 'We will message you to arrange a time. If it does not work for you, tell us and we will find another.'),
      h('div', { class: 'receipt' }, h('dl', null, h('dt', null, 'You said you are free'), h('dd', null, answers.c_when.trim()), h('dt', null, 'We will reach you at'), h('dd', null, answers.c_contact.trim()), h('dt', null, 'Reference'), h('dd', { class: 'mono' }, receipt))),
      h('div', { class: 'cta', style: 'justify-content:flex-start' }, h('a', { class: 'btn', href: '/review' }, 'Take the 12-minute review too'), h('a', { class: 'btn ghost', href: '/' }, 'Back to the demo')))]);
    const hh = $('#iv-h'); if (hh) hh.focus({ preventScroll: true });
  }

  fill(root, [h('div', { class: 'review' },
    h('p', { class: 'rv-intro' }, 'A 20 to 30 minute call. We show you the prototypes, ask what you expected, and mostly listen. No preparation needed, and you can stop at any point.'),
    ...nodes, hp, err, h('div', { class: 'rv-nav' }, h('span'), send), hint)]);
  sync();
  return { answers };
}

const root = typeof document !== 'undefined' && !globalThis.__LP_TEST ? $('#interview-root') : null;
if (root) startInterview(root);
