// Team-only view of responses. All text is inserted as text, never as HTML.
import { getJson } from './api.js';
import { SLOTS, MODES } from './survey-def.mjs';
import { h, fill, $ } from './dom.js';

export function mountAdmin(fetchImpl = globalThis.fetch, getJsonImpl = getJson) {
const form = $('#admin-form'), msg = $('#admin-msg'), out = $('#admin-out');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const key = $('#admin-key').value;
  msg.textContent = 'Loading…';
  const r = await getJsonImpl('/api/export?include=contact', { 'x-admin-key': key });
  if (r.status === 401) { msg.textContent = 'That key is not right.'; return; }
  if (r.status === 503) { msg.textContent = 'The server is not configured (admin key or storage missing).'; return; }
  if (!r.ok) { msg.textContent = 'Could not load.'; return; }
  msg.textContent = '';
  const d = r.data;
  const csvLink = h('button', { class: 'btn small', type: 'button', onclick: async () => {
    const c = await fetchImpl('/api/export?format=csv', { headers: { 'x-admin-key': key } });
    if (!c.ok) { msg.textContent = 'CSV failed.'; return; }
    const blob = new Blob([await c.text()], { type: 'text/csv' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'leakproof-responses.csv' }); document.body.append(a); a.click(); a.remove();
  } }, 'Download CSV');
  const texts = [];
  for (const rv of d.reviews) for (const [k, v] of Object.entries(rv.answers)) if (typeof v === 'string' && v.length > 25) texts.push([rv.receipt, k, v]);
  for (const q of d.quick) if (q.comment) texts.push([q.id.slice(0, 8), 'quick scene ' + q.scene + ' (' + (q.clear || '?') + ')', q.comment]);
  const label = (list, v) => (list.find((x) => x.value === v) || {}).label || v;
  const contacts = d.contact || [];
  const slotCount = {};
  for (const c of contacts) for (const v of c.c_slots || []) slotCount[v] = (slotCount[v] || 0) + 1;
  const interview = contacts.length ? [
    h('h2', { style: 'font-size:1.3rem;margin-top:16px' }, `Interview requests (${contacts.length})`),
    h('p', { class: 'muted' }, 'Slots by how many people offered them: ' + SLOTS.map((s) => `${s.label} (${slotCount[s.value] || 0})`).join(' · ')),
    ...contacts.map((c) => h('div', { class: 'resp' }, h('b', null, `${c.receipt} · from the ${c.source || 'review'}`),
      h('span', null, `Reach: ${c.c_contact || '(none)'}${c.c_name ? ' · ' + c.c_name : ''}`),
      h('span', null, `Times: ${(c.c_slots || []).map((v) => label(SLOTS, v)).join('; ') || '(none)'}${c.c_when ? ' · also: ' + c.c_when : ''}`),
      h('span', null, `How: ${c.c_mode ? label(MODES, c.c_mode) : '(none)'}`), c.c_topic ? h('span', null, `About: ${c.c_topic}`) : null))] : [h('p', { class: 'muted' }, 'No interview requests yet.')];
  fill(out, [h('p', null, `${d.reviews.length} reviews, ${d.quick.length} quick comments, ${texts.length} free-text answers.`), csvLink, ...interview,
    h('h2', { style: 'font-size:1.3rem;margin-top:16px' }, 'Free-text answers (code these into findings)'),
    ...texts.map(([who, q, t]) => h('div', { class: 'resp' }, h('b', null, `${who} · ${q}`), h('span', null, t)))]);
});
}

if (typeof document !== 'undefined' && !globalThis.__LP_TEST && document.getElementById('admin-form')) mountAdmin();
