// Small client for the site's own API. Never throws: returns { ok, status, data }.
export async function postJson(url, body) {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let data = null;
    try { data = await r.json(); } catch { /* empty body */ }
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}
export async function getJson(url, headers = {}) {
  try {
    const r = await fetch(url, { headers });
    let data = null;
    try { data = await r.json(); } catch { /* empty body */ }
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}
export const newClientId = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
