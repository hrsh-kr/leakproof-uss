// Shared by the page and the server, so both agree on what a valid email or link is.

export const LIMITS = { email: 120, url: 300 };

/** A pragmatic email check: one @, a dotted domain, no spaces, quotes, angle brackets or consecutive dots. */
export function isEmail(raw) {
  if (typeof raw !== 'string') return false;
  const s = raw.trim();
  if (s.length < 6 || s.length > LIMITS.email) return false;
  if (/\s/.test(s) || /[<>()[\]\\,;:"]/.test(s) || /\.\./.test(s)) return false;
  const m = /^([^@]+)@([^@]+)$/.exec(s);
  if (!m) return false;
  const [, local, domain] = m;
  if (local.length > 64 || local.startsWith('.') || local.endsWith('.') || !/^[A-Za-z0-9._%+'=-]+$/.test(local)) return false;
  if (!/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(domain)) return false;
  return !domain.split('.').some((p) => p.startsWith('-') || p.endsWith('-'));
}
export const normalizeEmail = (raw) => String(raw).trim().toLowerCase();

/** An http(s) link with a real host, no spaces and no embedded credentials. */
export function isHttpUrl(raw) {
  if (typeof raw !== 'string') return false;
  const s = raw.trim();
  if (s.length < 10 || s.length > LIMITS.url || /\s/.test(s) || !/^https?:\/\//i.test(s)) return false;
  let u;
  try { u = new URL(s); } catch { return false; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (u.username || u.password) return false;
  const labels = u.hostname.split('.');
  if (labels.some((l) => !l || l.startsWith('-') || l.endsWith('-'))) return false;
  return /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(u.hostname) || u.hostname === 'localhost';
}
export const normalizeUrl = (raw) => new URL(String(raw).trim()).href;

/** "asha.kumar@gmail.com" -> "as***@gmail.com" (for the receipt shown on screen) */
export function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  if (!domain) return '';
  return (local.length <= 2 ? local.charAt(0) : local.slice(0, 2)) + '***@' + domain;
}

export const FORMATS = {
  email: { check: isEmail, normalize: normalizeEmail, hint: 'a valid email address, like name@example.com', max: LIMITS.email },
  url: { check: isHttpUrl, normalize: normalizeUrl, hint: 'a link that starts with https://', max: LIMITS.url },
};
