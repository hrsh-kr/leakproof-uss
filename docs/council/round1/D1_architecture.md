# D1 (pragmatic systems architect): stack, architecture, cuts

Verified: `site/` runs 170/170 tests, but only ~150 of `logic.mjs`'s 302 lines are reusable crypto (Shamir, AES-GCM, hash chain, per-seat shuffle, check digit, leak matcher) plus ~49 relevant tests (logic 18, pipeline 21, roundtrip 10). `api/` is the Phase I survey backend (Upstash, one admin key); not reusable. `tool/` is a matrix JSON plus 24 trivial tests; the matrix is language-neutral data.
**Fix on reuse:** shuffles and draw use `xmur3`/`mulberry32` (32-bit state, guessable). Replace with an HMAC-SHA256 stream. Shamir prime is 2^127-1, so the "AES-256" key has only 127 bits of entropy. Use a 256-bit prime. The hash chain is unkeyed, so a DB writer can rewrite it (`rewriteFrom`). Add HMAC plus a head hash shown outside the DB.

## (a) Stack
| Option | Reused | Rewritten | Pros | Cons |
|---|---|---|---|---|
| A. Node 22, `node:http`, `node:sqlite`, vanilla JS front end | ~300 lines + 49 tests | server, auth, ceremonies, UI | same language browser and server, so the crypto runs unchanged in the tab; 1 dependency at most | no Django-style batteries; write the session/CSRF code ourselves |
| B. Python/FastAPI | matrix JSON only | everything, incl. porting crypto and tests | typed models, pytest | browser still needs JS crypto, so two crypto implementations that must agree; 5 days is too short |
| C. Hybrid | Node crypto module, Python API | glue | none worth the cost | two runtimes on one VM |

**Recommend A.** Phase II new code will be ~3,000 lines against ~300 reused, so >85% original; reused code is ours either way (confirm with TA that Phase I code counts). **Biggest risk:** hand-rolled sessions/CSRF/rate limits are exactly what classmates will probe.

## (b) Architecture (one VM, one process, one SQLite file in WAL mode, behind Caddy for TLS)
```
 Browser (5 role UIs, WebCrypto)  --TLS-->  Caddy --> Node app --> SQLite
  setter: encrypts Q to pool pubkey         auth, RBAC matrix (default deny),   users, exams, pool_q (ciphertext),
  custodian: holds own ECDH key,            gates G1-G5, audit log (HMAC chain) bundle, wrapped_shares, approvals,
   unwraps+re-wraps share                   NO plaintext column anywhere        seating, prints, log
  centre: ephemeral key, decrypts paper in tab memory, builds per-seat copies, window.print()
```
- **Tenancy:** each tester gets a sandbox workspace with all 5 roles pre-created. Testers work alone, so without this nobody can finish a quorum.
- **Plaintext:** setters encrypt in the browser to the pool public key. The pool private key is split 3-of-5 to custodians before any question exists. Shares are stored only wrapped to each custodian's public key.
- **Decryption location**
  - Sealing: in server memory for seconds, only the ~10 drawn questions, then wiped. Documented limit.
  - Release: in the centre browser. Custodians wrap shares to the centre session key; the server relays only after gates pass.

## (c) Centre client and approval
| Option | Pros | Cons |
|---|---|---|
| Browser-only, shares relayed server-mediated (recommended) | server never sees release plaintext; simple | needs ~60 lines of ECDH wrap |
| Server decrypts and returns PDFs | easiest | fails the core claim |
| Desktop app | offline | unbuildable in 5 days |

Approval card: login, passphrase unlocks own key, wrap, "2 of 3". Refuse is logged.

## (d) Cut for v1
Cut: custodian seed contributions (commit seed hash, reveal after), 4-of-5 fallback (3-of-5 already tolerates two absent), un-approve, marks CSV, case flow, email, dark mode, phone polish, reviewer role, two-profile exams.
Keep: nine stages as seven screens (collect, lock+draw, seal+distribute, release, print, log verify, leak trace).

**Recommendation:** A, with server-memory sealing and browser release. Trade-off: honest in the guide.
**Single biggest risk:** the ECDH wrap code (custodian enrolment, lost passphrase) eating Days 2-3. Fallback is the paste-your-share-string flow.
