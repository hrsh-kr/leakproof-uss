// Prints the review's questions as a markdown table, straight from the survey definition.
import { SECTIONS, flatten } from '../src/js/survey-def.mjs';
import { FEATURES } from '../src/js/config.mjs';
const rows = [];
for (const sec of SECTIONS) {
  const qs = [];
  for (const q of sec.questions) {
    if (q.type === 'task') { qs.push(q); q.post.forEach((p) => qs.push(p)); }
    else if (q.type === 'decision') { qs.push(q); qs.push({ id: q.id + '_why', type: 'text', label: 'Why? (optional)' }); }
    else qs.push(q);
  }
  for (const q of qs) {
    const opts = q.options ? q.options.map((o) => o.label + (o.correct ? ' **(correct)**' : '')).join(' / ') : q.scale ? `${q.scale.min} ${q.scale.minLabel} to ${q.scale.max} ${q.scale.maxLabel}` : q.type === 'task' ? `Scene ${q.scene}, ${q.limitSec}s guide. ${q.scenario} Goal: ${q.goal} Done when: ${q.end}` : '';
    const label = (q.label || q.title || '').replace(/\|/g, '/');
    rows.push(`| ${sec.title} | \`${q.id}\` | ${q.type}${q.voice && FEATURES.voice ? ' + voice' : ''} | ${q.required ? 'yes' : q.requiredIf ? 'if ' + q.requiredIf.id + ' = ' + q.requiredIf.equals : q.showIf ? 'shown if ' + q.showIf.id + ' = ' + q.showIf.equals : 'no'} | ${label} | ${opts.replace(/\|/g, '/')} |`);
  }
}
console.log('| Section | Id | Type | Required | Question | Options or scale |\n| --- | --- | --- | --- | --- | --- |\n' + rows.join('\n'));
console.error(flatten().length + ' items');
