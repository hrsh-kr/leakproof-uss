// Instance configuration. Practice and official are separate processes with separate data and keys.
import fs from 'node:fs';
import path from 'node:path';
import { rand } from './crypto.mjs';

export function loadConfig(env = process.env) {
  // LP_MODE decides behaviour; LP_INSTANCE is only the name (and the old way to pick the mode).
  const wanted = String(env.LP_MODE || '').trim().toLowerCase();
  if (wanted && wanted !== 'official' && wanted !== 'practice') throw new Error(`LP_MODE must be practice or official, not "${env.LP_MODE}"`);
  const mode = wanted || (env.LP_INSTANCE === 'official' ? 'official' : 'practice');
  const instance = /^[a-z0-9][a-z0-9_-]{0,19}$/.test(env.LP_INSTANCE || '') ? env.LP_INSTANCE : mode;
  const dataDir = path.resolve(env.LP_DATA_DIR || path.join('data', instance));
  return {
    instance,
    mode,
    dataDir,
    keyDir: path.resolve(env.LP_KEY_DIR || dataDir),
    port: Number(env.LP_PORT || (mode === 'official' ? 9090 : 8080)),
    host: env.LP_HOST || '127.0.0.1',
    trustProxy: env.LP_TRUST_PROXY === '1',          // only then is X-Real-IP from 127.0.0.1 believed
    origin: env.LP_ORIGIN || null,                    // optional fixed origin for the Origin check; null = https://<Host header>
    inviteCode: env.LP_INVITE_CODE || 'USS-PRACTICE', // kept for backward compat; role codes below take precedence
    inviteCodeProf: env.LP_INVITE_PROF || 'LP-PROF-G19',
    inviteCodeTa: env.LP_INVITE_TA || 'LP-TA-G19',
    inviteCodeStudent: env.LP_INVITE_STUDENT || 'LP-STU-G19',
    maxAccounts: Number(env.LP_MAX_ACCOUNTS || 2000),
    devHttp: env.LP_DEV_HTTP === '1',                 // local http without the Secure cookie flag (tests only)
    headersTimeout: Number(env.LP_HEADERS_TIMEOUT_MS || 10_000),
    perIpSockets: Number(env.LP_PER_IP_SOCKETS || 40),
    globalPerMin: Number(env.LP_GLOBAL_PER_MIN || 600),  // all API calls per client per minute
    authPerMin: Number(env.LP_AUTH_PER_MIN || 30),      // login/register/recover attempts per client per minute (NAT-friendly)
    publicPerMin: Number(env.LP_PUBLIC_PER_MIN || 60),  // public check-head calls per client per minute
    registerPerIp: Number(env.LP_REGISTER_PER_IP || 30), // successful practice sign-ups per client per day
  };
}

// 32-byte keys live in files outside the database (0600). Created once, on an empty database only:
// a fresh key over existing data would silently re-sign the log and orphan every ciphertext.
export function loadKey(dir, name, db) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) {
    const used = db && (db.prepare('SELECT 1 FROM accounts LIMIT 1').get() || db.prepare('SELECT 1 FROM log LIMIT 1').get());
    if (used) throw new Error(`Refusing to start: key file ${name} is missing but the database already has data. Restore ${file} from backup.`);
    fs.writeFileSync(file, rand(32), { mode: 0o600, flag: 'wx' });
  }
  // Either 32 raw bytes or 64 hex characters (what `openssl rand -hex 32` writes).
  const raw = fs.readFileSync(file);
  const text = raw.toString('latin1').trim();
  const key = raw.length === 32 ? raw : /^[0-9a-fA-F]{64}$/.test(text) ? Buffer.from(text, 'hex') : null;
  if (!key) throw new Error(`key file ${name} must be 32 raw bytes or 64 hex characters`);
  return key;
}
