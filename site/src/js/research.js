// Fills the live results section from /api/stats (aggregates only; small groups are hidden).
import { getJson as defaultGetJson } from './api.js';
import { h, fill, $ } from './dom.js';

const names = { t1: 'Task 1: A few leaks', t2: 'Task 2: The locked paper', t3: 'Task 3: A leaked photo', t4: 'Task 4: The activity log' };
const leakLabels = { written: 'While questions are written', press: 'At the printing press', transport: 'During transport', storage: 'In storage at the centre', hall: 'Inside the exam hall', after: 'After the exam', dontknow: 'I do not know' };
const dash = '—';
const fmt = (v, d = 1) => (v == null ? dash : Number(v).toFixed(d));

function stat(n, l) { return h('div', { class: 'stat' }, h('div', { class: 'n' }, n), h('div', { class: 'l' }, l)); }
function bars(title, map, labels) {
  const keys = Object.keys(map).filter((k) => map[k] != null);
  if (!keys.length) return h('p', { class: 'muted' }, `${title}: shown when 5 or more people have answered.`);
  const max = Math.max(1, ...keys.map((k) => map[k]));
  return h('div', { class: 'bars' }, h('h3', { style: 'font-size:1.05rem' }, title), ...keys.sort((a, b) => map[b] - map[a]).map((k) =>
    h('div', { class: 'bar-row' }, h('span', null, labels[k] || k), h('div', { class: 'track' }, h('i', { style: `width:${Math.round((map[k] / max) * 100)}%` })), h('span', { class: 'v' }, String(map[k])))));
}

export async function mountStats(root, getJson = defaultGetJson) {
  const r = await getJson('/api/stats');
  if (!r.ok) { fill(root, [h('div', { class: 'callout warn' }, r.status === 503 ? 'Live results are not connected on this copy of the site yet.' : 'Could not load results right now.')]); return null; }
  const s = r.data;
  const badge = $('#plan-a'); if (badge) badge.textContent = `Live: ${s.n.review} so far`;
  const parts = [];
  parts.push(h('div', { class: 'stats' }, stat(String(s.n.review), 'completed reviews'), stat(String(s.n.quick), 'quick scene comments'),
    stat(s.accept.before == null ? dash : `${fmt(s.accept.before)} → ${fmt(s.accept.after)}`, 'acceptance of print-at-centre, before → after (1 to 5)'),
    stat(s.umux.mean == null ? dash : fmt(s.umux.mean), 'usability score (mean of 2 items, 1 to 7)'),
    stat(s.comprehension.rate == null ? dash : Math.round(s.comprehension.rate * 100) + '%', 'comprehension questions answered correctly')));
  if (s.n.review < s.minCell) parts.push(h('div', { class: 'callout' }, `Per-task and per-question results appear once ${s.minCell} people have completed the review. So far: ${s.n.review}.`));
  const rows = Object.keys(names).map((t) => { const x = s.tasks[t]; return h('tr', null, h('td', null, names[t]), h('td', null, x.completed == null ? dash : Math.round(x.completed * 100) + '%'), h('td', null, x.medianSeconds == null ? dash : x.medianSeconds + ' s'), h('td', null, fmt(x.meanSeq)), h('td', null, x.checkCorrect == null ? dash : Math.round(x.checkCorrect * 100) + '%'), h('td', null, x.stuck == null ? dash : Math.round(x.stuck * 100) + '%')); });
  parts.push(h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, ['Task', 'Finished (not skipped)', 'Median time', 'Ease (1 to 7)', 'Comprehension correct', 'Got stuck'].map((x) => h('th', { scope: 'col' }, x)))), h('tbody', null, rows))));
  parts.push(bars('Where people think leaks are most likely (pick up to two)', s.leakwhere, leakLabels));
  parts.push(h('p', { class: 'fineprint' }, 'Target: at least 70% answer each comprehension question correctly. A task below that is redesigned, and the change is recorded in the decision log.'));
  fill(root, parts);
  return s;
}

if (typeof document !== 'undefined' && !globalThis.__LP_TEST) { const root = $('#stats-root'); if (root) mountStats(root); }
