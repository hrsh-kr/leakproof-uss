// Course material: four tabs on one page. Panels mount lazily. Deep links like /course#decisions open the right tab.
import { mountPrototypes, mountStoryboard } from './protos.js';
import { mountTaskFlows } from './flow.js';
import './research.js';
import { $, $$ } from './dom.js';
import { TAB_OF } from './routes.mjs';
export { TAB_OF };


export function mountCourse(doc = document) {
  const panels = Object.fromEntries($$('[data-panel]', doc).map((p) => [p.dataset.panel, p]));
  const tabs = $$('#course-tabs [data-tab]', doc);
  const mounted = {};
  function lazy(name, hash) {
    if (mounted[name]) return;
    mounted[name] = true;
    if (name === 'prototypes') {
      const m = /^proto-(\w+)$/.exec(hash || '');
      const root = $('#proto-root', doc); if (root) mountPrototypes(root, { initial: m ? m[1] : 'centre' });
      const sb = $('#storyboard', doc); if (sb) mountStoryboard(sb);
      const tf = $('#taskflows', doc); if (tf) mountTaskFlows(tf);
    }
  }
  function show(name, hash) {
    Object.entries(panels).forEach(([k, p]) => { p.hidden = k !== name; });
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    lazy(name, hash);
  }
  function route() {
    const hash = decodeURIComponent((location.hash || '').slice(1));
    const name = TAB_OF[hash] || 'checklist';
    show(name, hash);
    if (hash && hash !== name) { const el = doc.getElementById(hash); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' }); }
  }
  tabs.forEach((t) => t.addEventListener('click', () => {
    history.replaceState(null, '', '#' + t.dataset.tab);
    show(t.dataset.tab);
    const bar = $('.ctabs', doc); if (bar && bar.scrollIntoView) bar.scrollIntoView({ block: 'start' });
  }));
  window.addEventListener('hashchange', route);
  route();
  return { show, route };
}

if (typeof document !== 'undefined' && !globalThis.__LP_TEST && document.querySelector('[data-panel]')) mountCourse();
