// Team-only view of responses. All text is inserted as text, never as HTML.
import { getJson } from './api.js';
import { isHttpUrl } from './validators.mjs';
import { h, fill, $ } from './dom.js';

export function mountAdmin(fetchImpl = globalThis.fetch, getJsonImpl = getJson) {
const form = $('#admin-form'), msg = $('#admin-msg'), out = $('#admin-out');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const key = $('#admin-key').value;
  msg.textContent = 'Loading…';
  const r = await getJsonImpl('/api/export?include=contact', { 'x-admin-key': key });
  const pr = r.ok ? await getJsonImpl('/api/export?kind=participants', { 'x-admin-key': key }) : { ok: false };
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
  // Interview requests come only from the /interview form (reviews leave a contact record too, but with no call request).
  const contacts = (d.contact || []).filter((c) => c.source === 'interview');
  const interview = contacts.length ? [
    h('h2', { style: 'font-size:1.3rem;margin-top:16px' }, `Interview requests (${contacts.length})`),
    h('p', { class: 'muted' }, 'Exactly what each person typed. We arrange the rest.'),
    ...contacts.map((c) => h('div', { class: 'resp' }, h('b', null, `${c.receipt} · ${c.receivedAt ? new Date(c.receivedAt).toLocaleString() : ''}`),
      h('span', null, `Free: ${c.c_when || '(not given)'}`),
      h('span', null, `Reach: ${c.c_contact || '(none)'}${c.c_name ? ' · ' + c.c_name : ''}`)))] : [h('p', { class: 'muted' }, 'No interview requests yet.')];
  const people = (pr.ok && pr.data && Array.isArray(pr.data.participants)) ? pr.data.participants : [];
  const roleLabel = { course_peer: 'classmate', other_student: 'other student', faculty_ta: 'faculty or TA', exam_staff: 'exam staff', other: 'other' };
  const csvOf = (kind) => async () => {
    const c = await fetchImpl('/api/export?format=csv&kind=' + kind, { headers: { 'x-admin-key': key } });
    if (!c.ok) { msg.textContent = 'CSV failed.'; return; }
    const blob = new Blob([await c.text()], { type: 'text/csv' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'leakproof-' + kind + '.csv' }); document.body.append(a); a.click(); a.remove();
  };
  const linkNode = (u) => (isHttpUrl(u) ? h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, u) : h('span', null, u));
  const participants = [
    h('h2', { style: 'font-size:1.3rem;margin-top:16px' }, `Who gave reviews (${people.length})`),
    h('p', { class: 'muted' }, 'Emails and swap links are kept apart from the answers. Match them by receipt code. The same email more than once is flagged.'),
    people.length ? h('button', { class: 'btn small', type: 'button', onclick: csvOf('participants') }, 'Download participants CSV') : null,
    ...people.map((p) => h('div', { class: 'resp' }, h('b', null, `${p.receipt} · ${new Date(p.receivedAt).toLocaleString()}${p.timesSeen > 1 ? ' · SEEN ' + p.timesSeen + ' TIMES' : ''}`),
      h('span', null, `${p.email}${p.name ? ' · ' + p.name : ''}`),
      h('span', null, `${roleLabel[p.role] || p.role || 'role unknown'}${p.minutes ? ' · ' + p.minutes + ' min' : ''}${p.completedTasks != null ? ' · ' + p.completedTasks + ' of 4 tasks finished' : ''}`),
      p.swapLink ? h('span', null, 'Swap link to take part in: ', linkNode(p.swapLink)) : h('span', { class: 'muted' }, 'No swap link given'))),
  ];
  fill(out, [h('p', null, `${d.reviews.length} reviews, ${d.quick.length} quick comments, ${texts.length} free-text answers.`), csvLink, ...participants, ...interview,
    h('h2', { style: 'font-size:1.3rem;margin-top:16px' }, 'Free-text answers (code these into findings)'),
    ...texts.map(([who, q, t]) => h('div', { class: 'resp' }, h('b', null, `${who} · ${q}`), h('span', null, t)))]);
});
}

if (typeof document !== 'undefined' && !globalThis.__LP_TEST && document.getElementById('admin-form')) mountAdmin();
