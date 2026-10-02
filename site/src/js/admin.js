// Team-only view of responses. All text is inserted as text, never as HTML.
import { getJson } from './api.js';
import { h, fill, $ } from './dom.js';

const form = $('#admin-form'), msg = $('#admin-msg'), out = $('#admin-out');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const key = $('#admin-key').value;
  msg.textContent = 'Loading…';
  const r = await getJson('/api/export', { 'x-admin-key': key });
  if (r.status === 401) { msg.textContent = 'That key is not right.'; return; }
  if (r.status === 503) { msg.textContent = 'The server is not configured (admin key or storage missing).'; return; }
  if (!r.ok) { msg.textContent = 'Could not load.'; return; }
  msg.textContent = '';
  const d = r.data;
  const csvLink = h('button', { class: 'btn small', type: 'button', onclick: async () => {
    const c = await fetch('/api/export?format=csv', { headers: { 'x-admin-key': key } });
    if (!c.ok) { msg.textContent = 'CSV failed.'; return; }
    const blob = new Blob([await c.text()], { type: 'text/csv' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'leakproof-responses.csv' }); document.body.append(a); a.click(); a.remove();
  } }, 'Download CSV');
  const texts = [];
  for (const rv of d.reviews) for (const [k, v] of Object.entries(rv.answers)) if (typeof v === 'string' && v.length > 25) texts.push([rv.receipt, k, v]);
  for (const q of d.quick) if (q.comment) texts.push([q.id.slice(0, 8), 'quick scene ' + q.scene + ' (' + (q.clear || '?') + ')', q.comment]);
  fill(out, [h('p', null, `${d.reviews.length} reviews, ${d.quick.length} quick comments, ${texts.length} free-text answers.`), csvLink,
    h('h2', { style: 'font-size:1.3rem;margin-top:16px' }, 'Free-text answers (code these into findings)'),
    ...texts.map(([who, q, t]) => h('div', { class: 'resp' }, h('b', null, `${who} · ${q}`), h('span', null, t)))]);
});
