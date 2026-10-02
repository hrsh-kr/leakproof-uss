// Home: the animated journey, the four scenes (one at a time), and the "make it yours" question form.
import { mountJourney } from './flow.js';
import { SCENES } from './scenes.js';
import { mountQuick } from './quick.js';
import { mountQuestionForm } from './qform.js';
import { demoPaper } from './paper.js';
import { h, fill, $ } from './dom.js';

const COPY = {
  1: { tab: 'Many writers', eyebrow: 'Many writers', title: "A few leaks don't leak the paper.", lede: '20 people write the questions. A program draws the paper at the last moment.',
    how: 'Each setter writes 5 questions, so the pool has 100. The paper takes 5 each from Physics, Chemistry and Biology, drawn at random. A leaker\'s questions only matter if they happen to be drawn, and nobody can know that in advance. The same seed always gives the same paper, so the draw can be checked afterwards.' },
  2: { tab: 'Sealed', eyebrow: 'Sealed', title: 'No one can open it alone.', lede: 'The paper is locked. The key is split into five pieces. It takes three.',
    how: 'The paper above is really encrypted in your browser. The key is split with Shamir\'s secret sharing: any 3 of the 5 pieces rebuild it, and 2 pieces reveal nothing. In the real system a centre also needs a seating report and the right time window, and if anything is missing, nothing prints. Three dishonest key holders could still open it, which is why approvals are logged and the number needed is a setting.' },
  3: { tab: 'Traceable', eyebrow: 'Traceable', title: 'Every copy is different.', lede: 'If a photo leaks, we know which seat it came from.',
    how: 'Everyone gets the same four questions, but the order of the questions and of the options changes from seat to seat. That order is a fingerprint. A whole page points to one seat; a small piece narrows it to a few, and we say so instead of naming one person. The answer key changes with the order too. This does not stop a photo being taken. It makes one traceable.' },
  4: { tab: 'Verifiable', eyebrow: 'Verifiable', title: 'Nothing changes quietly.', lede: 'Every action is logged. Change one and it shows.',
    how: 'Each entry carries a fingerprint of its own content and the entry before it, so editing one breaks it. An attacker can recompute every fingerprint after the edit, so the log looks fine again. But the final fingerprint was published earlier, and it no longer matches. Removing the last entry is caught the same way.' },
};

export function mountHome(doc = document) {
  const j = $('#journey', doc); if (j) mountJourney(j);
  const root = $('#try-root', doc); if (!root) return {};
  let current = 1;
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'The four ideas' });
  const panel = h('div', { class: 'scene-panel', role: 'tabpanel' });
  const paper = demoPaper();

  const btns = Object.keys(COPY).map((n) => h('button', { type: 'button', role: 'tab', 'data-scene': n, 'aria-selected': 'false', onclick: () => show(Number(n)) }, `${n} ${COPY[n].tab}`));
  btns.forEach((b) => tabs.append(b));

  function show(n, { scroll = false } = {}) {
    current = n;
    const c = COPY[n];
    btns.forEach((b) => b.setAttribute('aria-selected', String(Number(b.dataset.scene) === n)));
    const stage = h('div', { style: 'width:100%' });
    const quick = h('div', { style: 'width:100%' });
    const custom = (n === 2 || n === 3) && paper.isCustom()
      ? h('p', { class: 'note', style: 'margin:0' }, 'Your question is on this paper. ', h('button', { class: 'link-btn', type: 'button', onclick: () => paper.reset() }, 'Go back to the samples'))
      : null;
    const prev = h('button', { class: 'link-btn', type: 'button', disabled: n === 1, onclick: () => show(n - 1) }, '← Previous');
    const next = n < 4
      ? h('button', { class: 'btn small', type: 'button', onclick: () => show(n + 1) }, 'Next idea →')
      : h('a', { class: 'btn small', href: '/review' }, 'Now tell us what you think →');
    fill(panel, [h('div', { class: 'scene-head' }, h('span', { class: 'eyebrow' }, `${n} of 4 · ${c.eyebrow}`), h('h3', { class: 'scene-title' }, c.title), h('p', { class: 'lede' }, c.lede)),
      custom, stage,
      h('details', null, h('summary', null, 'How it works'), h('p', null, c.how)),
      quick, h('div', { class: 'rv-nav', style: 'width:100%' }, prev, next)]);
    SCENES[n](stage, {});
    mountQuick(quick, n);
    if (scroll) tabs.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  fill(root, [tabs, panel]);
  const m = /^#try-(\d)$/.exec(location.hash);
  show(m && COPY[m[1]] ? Number(m[1]) : 1);

  paper.onChange(() => { if (current === 2 || current === 3) show(current); });

  const makeRoot = $('#make-root', doc), note = $('#make-note', doc);
  if (makeRoot) {
    mountQuestionForm(makeRoot, {
      submitLabel: 'Add to the demo paper',
      usedTexts: () => paper.get().map((q) => q.text),
      onRegister: (q) => {
        paper.add({ text: q.text, options: q.options, correct: q.correct });
        fill(note, [`Added as question 1: “${q.text}” `, h('button', { class: 'link-btn', type: 'button', onclick: () => { show(2, { scroll: true }); } }, 'See it sealed'), ' · ', h('button', { class: 'link-btn', type: 'button', onclick: () => { show(3, { scroll: true }); } }, 'See it traced')]);
        return '';
      },
    });
  }
  return { show };
}

if (typeof document !== 'undefined' && !globalThis.__LP_TEST && document.getElementById('try-root')) mountHome();
