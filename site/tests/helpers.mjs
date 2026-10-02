import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function freshEnv() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-test-'));
  process.env.LEAKPROOF_DATA_DIR = dir;
  process.env.ADMIN_KEY = 'test-admin-key-123';
  delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
  return dir;
}
export function mockRes() {
  return { statusCode: 200, headers: {}, body: undefined,
    status(n) { this.statusCode = n; return this; }, json(o) { this.body = o; return this; }, send(s) { this.body = s; return this; }, setHeader(k, v) { this.headers[k] = v; } };
}
export async function call(handler, req = {}) {
  const res = mockRes();
  await handler({ method: 'GET', headers: {}, query: {}, ...req }, res);
  return res;
}
let counter = 0;
export const cid = () => 'client-' + String(++counter).padStart(6, '0') + '-abcdef';

export function validReview(over = {}, metricsOver = {}) {
  const answers = { consent: true, role: 'course_peer', device: 'phone', leakwhere: ['press'], trust_before: 3, accept_before: 3,
    t1_check: 'a', t1_seq: 5, t1_stuck: 'no', t2_check: 'a', t2_seq: 6, t2_stuck: 'no', t3_check: 'a', t3_seq: 4, t3_stuck: 'no', t3_fair: 3, t4_check: 'a', t4_seq: 5, t4_stuck: 'no',
    explain: 'It locks the paper until several people agree.', umux1: 5, umux2: 6, trust_after: 4, accept_after: 4, hardest: 'none', ...over };
  const m = (s) => ({ seconds: s, actions: 8, result: 'done' });
  return { kind: 'review', clientId: cid(), answers, metrics: { t1: m(40), t2: m(55), t3: m(60), t4: m(35), ...metricsOver }, totalSeconds: 600, optionalDone: false };
}
