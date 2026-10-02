// Aggregates only. A statistic is hidden (null) unless at least MIN_CELL people contribute to it.
import { flatten } from '../../src/js/survey-def.mjs';

export const MIN_CELL = 5;
const QS = new Map(flatten().map((q) => [q.id, q]));
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const guard = (xs, f) => (xs.length >= MIN_CELL ? f(xs) : null);

export function computeStats(reviews, quick) {
  const out = { minCell: MIN_CELL, n: { review: reviews.length, quick: quick.length }, tasks: {}, umux: { mean: null }, accept: { before: null, after: null }, comprehension: { rate: null }, leakwhere: {}, quick: {} };

  const allChecks = [];
  for (const t of ['t1', 't2', 't3', 't4']) {
    const withM = reviews.filter((r) => r.metrics && r.metrics[t]);
    const done = withM.filter((r) => r.metrics[t].result === 'done');
    const seq = reviews.map((r) => r.answers[`${t}_seq`]).filter((v) => typeof v === 'number');
    const correct = QS.get(`${t}_check`).options.find((o) => o.correct).value;
    const checks = reviews.map((r) => r.answers[`${t}_check`]).filter((v) => v !== undefined).map((v) => (v === correct ? 1 : 0));
    const stuck = reviews.map((r) => r.answers[`${t}_stuck`]).filter((v) => v !== undefined).map((v) => (v === 'yes' ? 1 : 0));
    out.tasks[t] = {
      completed: guard(withM, (x) => done.length / x.length),
      medianSeconds: guard(done, (x) => Math.round(median(x.map((r) => r.metrics[t].seconds)))),
      meanSeq: guard(seq, mean),
      checkCorrect: guard(checks, mean),
      stuck: guard(stuck, mean),
    };
    for (const c of checks) allChecks.push(c);
  }
  out.comprehension.rate = guard(allChecks, mean);

  const um = reviews.filter((r) => typeof r.answers.umux1 === 'number' && typeof r.answers.umux2 === 'number').map((r) => (r.answers.umux1 + r.answers.umux2) / 2);
  out.umux.mean = guard(um, mean);
  const acc = reviews.filter((r) => typeof r.answers.accept_before === 'number' && typeof r.answers.accept_after === 'number');
  out.accept.before = guard(acc, (x) => mean(x.map((r) => r.answers.accept_before)));
  out.accept.after = guard(acc, (x) => mean(x.map((r) => r.answers.accept_after)));

  const lw = reviews.filter((r) => Array.isArray(r.answers.leakwhere));
  if (lw.length >= MIN_CELL) {
    for (const o of QS.get('leakwhere').options) out.leakwhere[o.value] = lw.filter((r) => r.answers.leakwhere.includes(o.value)).length;
  }
  for (const scene of ['1', '2', '3', '4', 'general']) {
    const q = quick.filter((x) => x.scene === scene);
    out.quick[scene] = { n: q.length >= MIN_CELL ? q.length : null, clearShare: guard(q, (x) => x.filter((y) => y.clear === 'yes').length / x.length) };
  }
  return out;
}
