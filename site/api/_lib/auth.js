import crypto from 'node:crypto';

/** 'ok' | 'denied' | 'unconfigured'. Constant-time comparison; no admin key set means nobody gets in. */
export function checkAdmin(req, env = process.env) {
  const expected = env.ADMIN_KEY;
  if (!expected || expected.length < 8) return 'unconfigured';
  const given = req.headers && (req.headers['x-admin-key'] || '');
  const a = crypto.createHash('sha256').update(String(given)).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b) ? 'ok' : 'denied';
}
