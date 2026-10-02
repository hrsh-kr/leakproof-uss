// "Was this clear?" quick feedback under each scene. One tap, optional comment.
import { h, fill } from './dom.js';
import { postJson, newClientId } from './api.js';
import { voiceControl } from './voice.js';

export function mountQuick(root, scene) {
  const box = h('div', { class: 'quick' });
  const clientId = newClientId();
  let clear = null, sent = false;
  const msg = h('p', { class: 'fineprint', role: 'status', 'aria-live': 'polite' });
  const ta = h('textarea', { class: 'rv-input', rows: '3', style: 'min-height:80px', 'aria-label': 'Your comment', placeholder: 'What was unclear, or what would you change? (optional)', maxlength: '1000' });
  const hp = h('input', { class: 'hp', type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
  const send = h('button', { class: 'btn small', type: 'button' }, 'Send');
  const detail = h('div', { class: 'quick', hidden: true }, ta, voiceControl(ta), send);

  async function submit() {
    if (sent) return;
    send.disabled = true; msg.textContent = 'Sending…';
    const r = await postJson('/api/submit', { kind: 'quick', clientId, scene: String(scene), clear, comment: ta.value.trim(), website: hp.value });
    if (r.ok) { sent = true; fill(box, [h('p', { class: 'sub' }, 'Thank you. That helps.')]); }
    else { send.disabled = false; msg.textContent = r.status === 503 ? 'Feedback is not connected yet on this copy of the site.' : r.status === 0 ? 'Could not reach the server. Check your connection and try again.' : 'Could not send that. Please try again.'; }
  }
  const pick = (value) => { clear = value; detail.hidden = false; row.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === value))); ta.focus({ preventScroll: true }); };
  const yes = h('button', { class: 'btn small outline', type: 'button', 'data-v': 'yes', 'aria-pressed': 'false', onclick: () => pick('yes') }, 'Yes');
  const no = h('button', { class: 'btn small outline', type: 'button', 'data-v': 'no', 'aria-pressed': 'false', onclick: () => pick('no') }, 'Not quite');
  const row = h('div', { class: 'row' }, 'Was this clear?', yes, no);
  send.addEventListener('click', submit);
  box.append(row, detail, hp, msg);
  root.append(box);
}
