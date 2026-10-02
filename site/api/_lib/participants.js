// Joins each review to the person who gave it (email, swap link, call slots), for the team only.
// The analysis data (reviews) never contains these; they live in the separate contact records.
import { SLOTS, MODES } from '../../src/js/survey-def.mjs';

const label = (list, v) => (list.find((x) => x.value === v) || {}).label || v;

export function buildParticipants(reviews, contacts) {
  const byId = new Map(reviews.map((r) => [r.id, r]));
  const rows = contacts.filter((c) => c.source === 'review' && c.email).map((c) => {
    const r = byId.get(c.id) || null;
    return {
      receipt: c.receipt, receivedAt: c.receivedAt, email: c.email, name: c.c_name || '',
      role: r ? r.answers.role || '' : '', minutes: r && r.totalSeconds != null ? Math.max(1, Math.round(r.totalSeconds / 60)) : null,
      completedTasks: r ? Object.values(r.metrics || {}).filter((m) => m.result === 'done').length : null,
      swapLink: c.c_link || '', slots: (c.c_slots || []).map((v) => label(SLOTS, v)), mode: c.c_mode ? label(MODES, c.c_mode) : '',
      contact: c.c_contact || '', when: c.c_when || '', reviewFound: !!r,
    };
  }).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  const seen = {};
  for (const r of rows) seen[r.email] = (seen[r.email] || 0) + 1;
  for (const r of rows) r.timesSeen = seen[r.email];
  return rows;
}

export const PARTICIPANT_COLUMNS = ['receipt', 'receivedAt', 'email', 'name', 'role', 'minutes', 'completedTasks', 'swapLink', 'slots', 'mode', 'contact', 'when', 'timesSeen'];
