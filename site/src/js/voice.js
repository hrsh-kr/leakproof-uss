// Voice to text for any textarea. Uses the browser's built-in speech recognition (Chrome, Edge, Safari).
// We keep only the text. Audio is never recorded or uploaded by this site.
import { h, svg } from './dom.js';

const Rec = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
export const voiceSupported = () => !!Rec;

const micIcon = () => svg('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
  svg('rect', { x: '9', y: '3', width: '6', height: '11', rx: '3' }), svg('path', { d: 'M5 11a7 7 0 0 0 14 0M12 18v3' }));

/** Returns a small control row to place under `textarea`. */
export function voiceControl(textarea, { onChange } = {}) {
  const wrap = h('div', { class: 'mic-row' });
  if (!Rec) {
    wrap.append(h('span', null, 'Voice needs Chrome, Edge or Safari. You can type instead.'));
    return wrap;
  }
  const btn = h('button', { class: 'mic', type: 'button', 'aria-pressed': 'false' }, micIcon(), h('span', { class: 'lbl' }, 'Speak'));
  const status = h('span', { 'aria-live': 'polite' }, 'Tap and talk. We keep only the text, not the audio.');
  const counter = h('span', { class: 'count' }, '');
  wrap.append(btn, status, counter);
  let rec = null, listening = false, base = '', finalText = '', t0 = 0, tick = null;

  const setLabel = (txt) => { btn.querySelector('.lbl').textContent = txt; };
  function stop() {
    listening = false;
    if (rec) { try { rec.stop(); } catch { /* already stopped */ } }
    btn.setAttribute('aria-pressed', 'false'); setLabel('Speak');
    if (tick) { clearInterval(tick); tick = null; }
    counter.textContent = '';
  }
  function start() {
    rec = new Rec();
    rec.lang = 'en-IN'; rec.continuous = true; rec.interimResults = true;
    base = textarea.value ? textarea.value.replace(/\s*$/, ' ') : '';
    finalText = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const tr = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += tr + ' '; else interim += tr;
      }
      textarea.value = (base + finalText + interim).replace(/\s+$/, interim ? '' : '');
      if (onChange) onChange(textarea.value);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    };
    rec.onerror = (e) => {
      const msg = { 'not-allowed': 'Microphone is blocked. You can type instead.', 'service-not-allowed': 'Speech service is blocked. You can type instead.', 'no-speech': 'Did not hear anything. Tap to try again.', 'network': 'Speech service is not reachable. You can type instead.', 'audio-capture': 'No microphone found. You can type instead.' }[e.error] || 'Voice stopped. You can type instead.';
      status.textContent = msg; stop();
    };
    rec.onend = () => { if (listening) { try { rec.start(); } catch { stop(); } } };   // keep listening through pauses
    try { rec.start(); } catch { status.textContent = 'Could not start the microphone.'; return; }
    listening = true; t0 = Date.now();
    btn.setAttribute('aria-pressed', 'true'); setLabel('Stop');
    status.textContent = 'Listening… tap Stop when you are done. You can edit the text after.';
    tick = setInterval(() => { counter.textContent = Math.floor((Date.now() - t0) / 1000) + 's'; }, 500);
  }
  btn.addEventListener('click', () => { if (listening) { stop(); status.textContent = 'Done. Check the text and fix any mistakes.'; } else start(); });
  return wrap;
}
