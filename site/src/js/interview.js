// "Talk to us": a short form to request an interview, with the times that suit the person.
import { INTERVIEW, SLOTS, MODES } from './survey-def.mjs';
import { createWidgets } from './widgets.js';
import { postJson, newClientId } from './api.js';
import { h, fill, $ } from './dom.js';

export function startInterview(root, opts = {}) {
  const answers = {};
  const clientId = newClientId();
  const W = createWidgets(answers);
  const { nodes } = W.renderList(INTERVIEW.questions);
  const err = h('p', { class: 'rv-err', role: 'alert' });
  const hp = h('input', { class: 'hp', type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
  const send = h('button', { class: 'btn', type: 'button' }, 'Send my request');

  send.addEventListener('click', async () => {
    const miss = W.missingIn(INTERVIEW.questions);
    if (miss.length) { err.textContent = 'Please fill in: ' + miss.map((q) => q.label.replace(/\s+/g, ' ').slice(0, 60)).join(' · '); return; }
    send.disabled = true; err.textContent = 'Sending…';
    const payload = { kind: 'interview', clientId, answers: { ...answers }, website: hp.value };
    const r = await (opts.post || postJson)('/api/submit', payload);
    if (r.ok) { done(r.data.receipt); return; }
    send.disabled = false;
    err.textContent = r.status === 503 ? 'This copy of the site is not connected to storage yet, so we could not save your request.'
      : r.status === 0 ? 'We could not reach the server. Check your connection and try again.'
      : r.status === 400 && r.data && r.data.errors ? 'Please check: ' + r.data.errors.slice(0, 4).join('; ') : 'Something went wrong. Please try again.';
  });

  function done(receipt) {
    const slots = (answers.c_slots || []).map((v) => (SLOTS.find((s) => s.value === v) || {}).label).filter(Boolean);
    const mode = (MODES.find((m) => m.value === answers.c_mode) || {}).label;
    fill(root, [h('div', { class: 'review' }, h('h2', { id: 'iv-h', tabindex: '-1' }, 'Thank you. We will be in touch.'),
      h('p', { class: 'rv-intro' }, 'We will message you to confirm one time. If none of these work, tell us and we will find another.'),
      h('div', { class: 'receipt' }, h('dl', null, h('dt', null, 'Times you offered'), h('dd', null, slots.length ? slots.join('; ') : 'Another time'), h('dt', null, 'How'), h('dd', null, mode || ''), h('dt', null, 'Reference'), h('dd', { class: 'mono' }, receipt))),
      h('div', { class: 'cta', style: 'justify-content:flex-start' }, h('a', { class: 'btn', href: '/review' }, 'Take the 12-minute review too'), h('a', { class: 'btn ghost', href: '/' }, 'Back to the demo')))]);
    const hh = $('#iv-h'); if (hh) hh.focus({ preventScroll: true });
  }

  fill(root, [h('div', { class: 'review' },
    h('p', { class: 'rv-intro' }, 'A 20 to 30 minute call. We show you the prototypes, ask what you expected, and mostly listen. No preparation needed, and you can stop at any point.'),
    ...nodes, hp, err, h('div', { class: 'rv-nav' }, h('span'), send))]);
  return { answers };
}

const root = typeof document !== 'undefined' && !globalThis.__LP_TEST ? $('#interview-root') : null;
if (root) startInterview(root);
