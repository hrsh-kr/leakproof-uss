// The demo paper: four questions shared by the scenes. Starts with samples. Anyone can add their own.
import { PRESETS } from './question.mjs';

export const SAMPLES = PRESETS.slice(0, 4).map((p) => ({ text: p.question, options: p.options.slice(), correct: p.correct }));
const KEY = 'lp-demo-paper-v1';
const SIZE = 4;

const valid = (q) => q && typeof q.text === 'string' && Array.isArray(q.options) && q.options.length === 4 && q.options.every((o) => typeof o === 'string');

export function createPaper(storage) {
  const listeners = new Set();
  let paper = null;
  function load() {
    try { const s = JSON.parse(storage.getItem(KEY) || 'null'); if (Array.isArray(s) && s.length === SIZE && s.every(valid)) return s; } catch { /* use samples */ }
    return SAMPLES.map((q) => ({ ...q, options: q.options.slice() }));
  }
  const save = () => { try { storage.setItem(KEY, JSON.stringify(paper)); } catch { /* storage blocked */ } };
  const emit = () => listeners.forEach((f) => f(paper));
  paper = load();
  return {
    get: () => paper.map((q) => ({ ...q, options: q.options.slice() })),
    /** Adds a question at the top and drops the last one so the paper always has four. */
    add(q) { if (!valid(q)) throw new Error('invalid question'); paper = [{ text: q.text, options: q.options.slice(), correct: q.correct ?? null }, ...paper].slice(0, SIZE); save(); emit(); return paper.length; },
    reset() { paper = SAMPLES.map((q) => ({ ...q, options: q.options.slice() })); save(); emit(); },
    isCustom: () => paper.some((q, i) => q.text !== SAMPLES[i].text),
    onChange(f) { listeners.add(f); return () => listeners.delete(f); },
  };
}

let shared = null;
export function demoPaper() {
  if (!shared) { let st; try { st = window.sessionStorage; } catch { st = { getItem: () => null, setItem: () => {} }; } shared = createPaper(st); }
  return shared;
}
