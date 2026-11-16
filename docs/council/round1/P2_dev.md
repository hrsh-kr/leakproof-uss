# P2 (senior full-stack dev): build plan

Facts checked: `site/` is ESM Node 20+ (Vercel functions, file/Redis store, `x-admin-key` auth only). `logic.mjs` (302 lines, pure, WebCrypto) runs unchanged in Node. `public/js` and `src/js` are duplicated copies (build step). `tool/` is empty Python. Two real defects in the "tested" code: the seeded RNG (`xmur3`+`mulberry32`) has 32-bit state, so a 128-bit seed gives only 2^32 draws and per-seat orders. Anyone holding one copy can brute-force the seed and predict every other seat and the draw. Also, the copy-ID check digit is a typo check, not authentication (forgeable), and the AES key is SHA-256 of a 127-bit secret.

## (a) Order
| Option | Pros | Cons |
|---|---|---|
| 1. Vertical thread first (recommended) | Always demoable; early VM deploy | Roles/UI rough at first |
| 2. Auth/roles layer first | Clean foundation | Nothing runs until day 3 |
| 3. Crypto/pipeline first, UI last | Safest core | Usability (25%) starved |

Plan: D1 VM + skeleton + login + roles + fix RNG. D2 thread: 3 setters submit, admin draws, seals, 3-of-5 release, per-seat print, audit log, on the VM. D3 custodian/superintendent UX, window and seating gates. D4 abuse tests, user guide. D5 freeze, fix classmates' likely attacks, package.

## (b) Tech
- **Stack:** keep Node. Rewriting in FastAPI loses 170 tests and logic.mjs. Plain `node:http`, one dependency (`better-sqlite3`). Frontend: vanilla ES modules, one HTML shell, no framework. The existing code is vanilla, and nothing else is learnable in 5 days.
- **DB:** SQLite, WAL. Tables: users, questions, exams, shares (wrapped), approvals, log (hash-chained), sessions.
- **Passwords:** `crypto.scrypt` (N=2^15), per-user salt, constant-time compare, lockout and rate limit. Sessions: random 256-bit id in an HttpOnly, SameSite=Strict cookie; server-side table; CSRF token on POST.
- **API:** JSON over HTTP, one route-to-role table checked in one middleware (deny by default), mirroring the permission matrix.
- **Crypto split (the real design choice):**
  - A. Server seals (recommended): reuse logic.mjs; the draw and seal happen in memory; each share is wrapped under the custodian's scrypt-derived key and stored; custodians unwrap in their browser and submit the share at release. The server is a trusted combiner for seconds, and we say so.
  - B. Browser-side everything: stronger story, 2x the work. Cut.
  - C. Keep the demo flow: no.
- **Layout:** `server/ (routes, db, auth, services)`, `shared/ (logic.mjs, pipeline-core)`, `web/`, `tests/`, `docs/`. One copy of logic.mjs; delete the src/public duplication.

## (c) Quality
Do: ESLint + Prettier, `npm test` as a gate, tests before glue, small commits ("slice: what"), a README with a threat-to-control table, JSDoc on the public functions. Keep a vulnerabilities log. Skip: TypeScript, coverage targets, CI.
AI pitfalls: plausible-but-wrong crypto (use only WebCrypto/`node:crypto`; known-answer tests, property test that any 3 shares work and any 2 reveal nothing); untested glue (every route needs a denied-role test); secrets in code (`.env.local` exists in `site/`, so check it is not shipped); verbose generated code (review each diff).

## (d) Refuse to build
Own crypto primitives, email/SMS, real printers, multi-exam scheduling, admin CRUD for everything, password reset, a framework migration, B above.

**Recommendation:** Option 1 with Node, SQLite, vanilla, and crypto split A.
**Biggest risk:** Day 1-2 slips, because the auth/role middleware gets perfected before the thread exists.
