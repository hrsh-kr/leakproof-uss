// A real browser-like environment for UI tests: loads the BUILT page markup into jsdom.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function setupDom(page = 'index', { hash = '', speech = null, reducedMotion = false, io = false, narrow = false } = {}) {
  const file = path.join(ROOT, 'public', page + '.html');
  if (!fs.existsSync(file)) throw new Error('public/' + page + '.html is missing: run `npm test` (it builds first) or `npm run build`');
  const html = fs.readFileSync(file, 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost/' + (page === 'index' ? '' : page) + hash, pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  // things jsdom does not implement
  w.scrollTo = () => {};
  w.Element.prototype.scrollIntoView = function () {};
  // a controllable matchMedia: reduced-motion, and a "narrow window" query that tests can flip with window.__setNarrow(true)
  let isNarrow = narrow; const listeners = [];
  w.matchMedia = (q) => ({ media: q, get matches() { return /reduce/.test(q) ? reducedMotion : /max-width/.test(q) ? isNarrow : false; },
    addEventListener(type, fn) { if (type === 'change') listeners.push(fn); }, removeEventListener() {} });
  w.__setNarrow = (b) => { isNarrow = b; listeners.forEach((fn) => fn({ matches: b })); };
  if (speech) w.webkitSpeechRecognition = speech;
  if (io) {
    w.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe(el) { this.cb([{ isIntersecting: true, target: el }]); } disconnect() {} };
  }
  const g = globalThis;
  const define = (k, v) => Object.defineProperty(g, k, { value: v, configurable: true, writable: true });
  define('window', w); define('document', w.document); define('location', w.location); define('history', w.history);
  define('sessionStorage', w.sessionStorage); define('localStorage', w.localStorage);
  define('matchMedia', w.matchMedia); define('Event', w.Event); define('MouseEvent', w.MouseEvent); define('HTMLElement', w.HTMLElement);
  define('navigator', { clipboard: { writeText: async () => {} }, userAgent: 'test' });
  if ('IntersectionObserver' in w) define('IntersectionObserver', w.IntersectionObserver);
  return { dom, window: w, document: w.document };
}

export const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
export const type = (el, value) => { el.value = value; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
export const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
export const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();

/** A fake browser speech recognizer, so voice input can be tested without a microphone. */
export function fakeSpeech() {
  const instances = [];
  class FakeRec {
    constructor() { this.started = 0; this.stopped = 0; instances.push(this); }
    start() { this.started++; this.running = true; }
    stop() { this.stopped++; this.running = false; if (this.onend) this.onend(); }
    // helpers for tests
    say(parts) { // parts: [{t, final}]
      const results = parts.map((p) => { const r = [{ transcript: p.t }]; r.isFinal = !!p.final; return r; });
      this.onresult({ resultIndex: 0, results });
    }
    fail(error) { this.onerror({ error }); }
  }
  FakeRec.instances = instances;
  return FakeRec;
}
