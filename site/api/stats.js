// GET /api/stats : aggregates for the public Research page. No free text. Small groups hidden.
import { getStore } from './_lib/store.js';
import { computeStats } from './_lib/stats.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'method not allowed' }); }
  const store = getStore();
  if (!store) return res.status(503).json({ error: 'storage is not configured' });
  try {
    const [reviews, quick] = await Promise.all([store.list('review'), store.list('quick')]);
    res.setHeader('Cache-Control', 'public, max-age=30');
    return res.status(200).json(computeStats(reviews, quick));
  } catch (e) {
    console.error('stats failed', e && e.message);
    return res.status(500).json({ error: 'could not load' });
  }
}
