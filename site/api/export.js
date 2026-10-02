// GET /api/export  (header x-admin-key). ?format=csv&kind=reviews|quick, ?include=contact
import { getStore } from './_lib/store.js';
import { checkAdmin } from './_lib/auth.js';
import { csvRow } from './_lib/csv.js';
import { flatten } from '../src/js/survey-def.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'method not allowed' }); }
  const auth = checkAdmin(req);
  if (auth === 'unconfigured') return res.status(503).json({ error: 'admin key is not configured' });
  if (auth !== 'ok') return res.status(401).json({ error: 'unauthorised' });
  const store = getStore();
  if (!store) return res.status(503).json({ error: 'storage is not configured' });
  try {
    const q = req.query || {};
    const reviews = (await store.list('review')).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
    const quick = (await store.list('quick')).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
    res.setHeader('Cache-Control', 'no-store');
    if (q.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      if (q.kind === 'quick') {
        return res.status(200).send([csvRow(['id', 'receivedAt', 'scene', 'clear', 'comment']), ...quick.map((x) => csvRow([x.id, x.receivedAt, x.scene, x.clear, x.comment]))].join('\n'));
      }
      const ids = flatten().filter((x) => x.type !== 'task' && !['c_contact', 'c_name'].includes(x.id)).map((x) => x.id);
      const tasks = ['t1', 't2', 't3', 't4'];
      const head = ['id', 'receipt', 'receivedAt', 'totalSeconds', 'optionalDone', ...ids, ...tasks.flatMap((t) => [`${t}_seconds`, `${t}_actions`, `${t}_result`])];
      const rows = reviews.map((r) => csvRow([r.id, r.receipt, r.receivedAt, r.totalSeconds, r.optionalDone, ...ids.map((i) => r.answers[i]), ...tasks.flatMap((t) => [r.metrics[t]?.seconds, r.metrics[t]?.actions, r.metrics[t]?.result])]));
      return res.status(200).send([csvRow(head), ...rows].join('\n'));
    }
    const out = { reviews, quick };
    if (q.include === 'contact') out.contact = await store.list('contact');
    return res.status(200).json(out);
  } catch (e) {
    console.error('export failed', e && e.message);
    return res.status(500).json({ error: 'could not load' });
  }
}
