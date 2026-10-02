// POST /api/submit  { kind: 'review' | 'quick', ... }
import crypto from 'node:crypto';
import { getStore } from './_lib/store.js';
import { validateReview, validateQuick, LIMITS } from './_lib/validate.js';

const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
function code(n) { const b = crypto.randomBytes(n); let s = ''; for (let i = 0; i < n; i++) s += ALPHABET[b[i] % ALPHABET.length]; return s; }

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'method not allowed' }); }
  const store = getStore();
  if (!store) return res.status(503).json({ error: 'storage is not configured' });
  const body = req.body;
  if (req.badJson || body === null || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'invalid JSON body' });
  if (JSON.stringify(body).length > LIMITS.body) return res.status(413).json({ error: 'payload too large' });

  // Honeypot: real people never fill this hidden field. Pretend success, store nothing.
  if (typeof body.website === 'string' && body.website.length > 0) return res.status(200).json({ ok: true, receipt: 'LP-' + code(8) });

  let v;
  if (body.kind === 'review') v = validateReview(body);
  else if (body.kind === 'quick') v = validateQuick(body);
  else return res.status(400).json({ error: 'invalid', errors: ['kind must be review or quick'] });
  if (!v.ok) return res.status(400).json({ error: 'invalid', errors: v.errors });

  const c = v.clean;
  const receipt = 'LP-' + code(8);
  try {
    // One submission per clientId. A retry of the same submission returns the same receipt.
    const claim = await store.claim(`${body.kind}:${c.clientId}`, receipt);
    if (!claim.created) return res.status(200).json({ ok: true, receipt: claim.value, duplicate: true });
    const id = crypto.randomUUID();
    const receivedAt = new Date().toISOString();
    if (body.kind === 'review') {
      await store.add('review', id, { id, receipt, receivedAt, answers: c.answers, metrics: c.metrics, totalSeconds: c.totalSeconds, optionalDone: c.optionalDone });
      if (Object.keys(c.contact).length) await store.add('contact', id, { id, receipt, receivedAt, ...c.contact });
    } else {
      await store.add('quick', id, { id, receivedAt, scene: c.scene, clear: c.clear, comment: c.comment });
    }
    return res.status(200).json({ ok: true, receipt });
  } catch (e) {
    console.error('submit failed', e && e.message);
    return res.status(500).json({ error: 'could not save' });
  }
}
