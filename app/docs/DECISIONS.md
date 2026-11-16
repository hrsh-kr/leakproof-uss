# LeakProof: decisions and reasons

Every non-obvious choice made so far, with the reason, what was rejected, and where the evidence is. Newest decisions are
at the bottom of each group. If you change one, add a line under "Changes" in the entry and say why; do not rewrite history.
Context for the whole project: `docs/HANDOFF.md`. Phase I decisions D1-D20 (research, scope, prototype) live in the
laptop repo's `docs/02_final_scope_and_decisions.md`; this file covers the Phase II build.

Format: **Decision.** Why. *Rejected:* alternatives. *Evidence:* where to look. *Revisit if:* the condition that would change it.

---

## A. Product and design

**A1. A web app that runs one university MCQ exam end to end, as the minimal system in `11_minimal_system.md`.**
Why: the course grades usable security and a working, attackable tool; Occam's razor (properties P1-P6 only, everything else cut).
Phase I had a 5-profile, 8-role design; a council attacked it and the minimal version won. *Rejected:* multi-centre, multiple
ceremonies, uploads, email/SMS, PDF generation, per-question keys. *Evidence:* `11_minimal_system.md` (wins on conflicts), `12_detailed_design.md`.

**A2. Three stages: Collect, Seal, Release.** Why: one irreversible step (Seal) and one ceremony (Release) keep it operable under
pressure (Phase I: people found many steps heavy). *Rejected:* a pool-key ceremony at seal plus an exam-key ceremony at release.

**A3. The paper is drawn late, once, at Seal; every other question is deleted at Seal.** Why: after Seal only the locked paper
exists, so a later breach cannot expose the pool. The draw seed is revealed after release so anyone can replay it
(`R5-S9` also logs `sha256(seed)` at Seal as a commitment). *Rejected:* keeping the pool for audits (a leak surface).

**A4. Capabilities, not roles: `submit`, `run`, `hold`, `print` in one table; a missing capability answers 404, not 403.**
Why: one rule to test (route x capability matrix), and no probing of which ids exist. *Rejected:* a role hierarchy and an admin
account (the FCS groups' admin roles produced most of their argument-heavy bug reports).

**A5. One key card, held by the professor (1-of-1 Shamir). Practice: the professor account holds the card.** Why: the simplest threshold that still exercises the full cryptographic path; a lone classmate can run the whole flow; the real separation of duties is shown in the demo pods. *Rejected:* 3-of-5 (adds complexity with no security gain for the course scenario; simulating five holders is friction).

**A6. Three gates for release: quorum (1 verified card), print window, seat count.** Each approval is bound to one request
(nonce, seats, 15-minute expiry). Why: fail-closed, each gate names itself and who must act. The window and seat count are set by
the exam cell, so they protect against accidents, not a malicious cell (stated in SECURITY.md section 4).

**A7. A two-word check shown only on the exam cell's screen; a key holder types it to approve or refuse.** Why: proves the holder is
approving this exact request, not a replay. 14 bits is weak on purpose (a presence check, not a secret); 5 wrong tries lock
out that holder only (`R5-S7`). *Rejected:* a longer code (usability cost), no check (blind approval).

**A8. A restart re-locks the paper.** The open paper lives only in memory; a pending request becomes `interrupted`. Why: nothing
decrypted ever touches disk. The cost is that an unplanned restart mid-exam needs the professor to approve again, so the watchdog never
auto-restarts official or demo (C5-7).

**A9. Trace by question and option order; a trace names a seat, never a person.** Why: honest limits (a leaker may be whoever
held the printed copies). With 3 question stems only, several seats can match; the screen says so and asks for the options
(`R5-S8`). *Rejected:* printing a visible id as the only fingerprint (cropped off in a photo).

**A10. A per-seat answer key (`GET /api/exams/:id/key/:seat`).** Why: without it papers cannot be marked and P6 ("same questions,
same marks") cannot be shown; Phase I found 49% fear wrong answer keys. Verified correct for all 100 seats checked.

## B. Cryptography and keys

**B1. `node:crypto` only: AES-256-GCM, HMAC-SHA-256, scrypt, PBKDF2 (browser), CSPRNG; no crypto libraries.**
Why: fewer dependencies, fewer CVE reports, and the primitives are standard. *Rejected:* libsodium, Argon2.

**B2. Shamir 1-of-1 over GF(2^521 - 1), duplicate shares rejected.** Why: threshold 1 still exercises the full Shamir construction (split + combine path, field arithmetic) while keeping the UX simple for the course setting; the field is larger than any 256-bit key; the old demo used a 127-bit field and accepted duplicates (both defects are still absent). The paper key is a fresh raw 256-bit random value, never a hash of a hex string.

**B3. Questions are encrypted on the server at submit (AES-GCM, authenticated data = exam id + question id); not in the browser.**
Why: the server holds the key anyway and the same server serves the page, so browser-side encryption adds almost no security
for about a day of work. Recorded as an upgrade path, not claimed. *Rejected:* a pool public key for setters (needs HTTPS-only
WebCrypto on every setter and still lets the operator read the pool).

**B4. The key card is encrypted in the professor's browser (PBKDF2-SHA256 600k + AES-GCM, authenticated data = exam id + slot) and the server
deletes its copy once the holder proves they can open the card (verify-on-claim).** Why: after verification the data-at-rest
thief gets nothing; before it, the quorum is only a software rule (stated). *Changes:* card passphrase minimum raised to 14 characters (`C2` cryptographer: a stolen card file falls
to a weak human passphrase). *Rejected:* a word-list card (readable if the file leaks), a card the server stores forever.

**B5. The log is an append-only table chained with HMAC-SHA-256 under a key kept outside the database; its head is printed on every
copy and shown on approval screens.** Why: someone with database write access cannot recompute the chain, and the head on paper
anchors it in the real world. *Rejected:* a plain SHA-256 chain (recomputable), a "blockchain". The public log never lists who did
what and a trace logs only a count of matching seats.

**B6. Keys live in files outside the database; start-up refuses if a key file is missing but the database has data (`S13`).** Why: Group 1
silently regenerated keys and re-signed its whole log. Keys are accepted as 32 raw bytes or 64 hex characters (the VM's
`openssl rand -hex 32` format). Not detected: a wrong-but-valid `server.key` (stated limit; runbook says keep keys with the data).

**B7. Secrets sent to people are generated: 16-character base32 passphrases (80 bits) and a 12-character recovery code, shown once.**
Why: no weak passwords to crack and no password-strength theatre. The recovery code replaces email (the VM has no guaranteed
internet; Group 2's rebuttal on this was accepted by staff). scrypt (N=2^15) runs asynchronously on the thread pool so a login flood
cannot freeze the server (verified by a mutation test).

## C. Server and web security

**C1. Zero npm dependencies; one Node process with `node:http`, `node:sqlite`, vanilla ES modules in the browser.** Why: nothing to
exploit through packages ("Known vulnerability / RCE" reports hit both FCS groups), nothing to install on the VM, 1-2 minute
rebuilds. *Rejected:* FastAPI/React/Postgres as in the FCS groups, an ORM, a framework.

**C2. One route table and one middleware chain: rate limit, session, CSRF and Origin check, capability, schema, size cap.** The route-matrix
test iterates the table, so a new route cannot ship without a role test. Why: the first thing classmates probe is authorization.

**C3. Server-side sessions (only a hash of the id stored), `__Host-` cookie `HttpOnly; Secure; SameSite=Strict`, 30-minute idle and
8-hour absolute timeout, a CSRF token per session plus an Origin check.** Why: easy revocation and no JWT pitfalls. Polling
requests carry `X-LP-Background: 1` and do not refresh the idle timer (`S12`: automatic refresh was defeating the idle logout).
*Rejected:* JWT with refresh tokens, IP-bound sessions (break on mobile networks), TOTP and a virtual keyboard (approving a release
already needs a card, its passphrase and the two words).

**C4. Rate limits are per client address and NAT-friendly, answer 429 with the real `Retry-After` (not 503 as Group 2 did), and failed
logins back off per user AND client address so an attacker cannot lock a victim out.** Defaults: 600 requests/min, 30 auth/min, 60
sensitive/min per account, 30 sign-ups/day per address, 2000 accounts. Why: FCS testers were blocked by tight caps on shared networks
and filed it as DoS. All limits are env variables, so they can be tuned after the freeze without code changes.

**C5. Official accounts made by an operator must change their passphrase at first login (`must_change`).** Why: the operator saw every
printed passphrase and could otherwise claim the professor key card. *Exception:* demo pods are created with `--demo` (no forced change)
so the posted credentials stay valid (see E3).

**C6. The service stays up and says when it is not sound.** `/healthz` runs `SELECT 1` and a cached `quick_check`; a failed integrity check or
broken log chain at start-up keeps the process up but answers 503 everywhere (a crash loop is the same outage and hides the cause).
Request targets are parsed inside the error boundary: one malformed request (`GET //a:b`) used to kill the process.

**C7. Only `/` and real files in `public/` are served; every other path is 404.** Why: scanners report an app-shell 200 for `/admin` or
`/metrics` as a "found path". The client uses hash routing, so the server needs no fallback.

**C8. Text is rendered only with `textContent`; the CSP is `default-src 'self'; script-src 'self'; style-src 'self'`.** A test scans `public/` for
HTML sinks. *Rejected:* a markdown renderer or a component library (an injection surface).

**C9. Input hygiene.** Usernames are checked as ASCII before lower-casing (the Kelvin sign U+212A aliased `k`); control and format characters are
refused in names, questions and options **except ZWJ and ZWNJ**, which Devanagari, Persian and emoji need (`N2`); an option that differs
only by a joiner counts as the same option. `PRAGMA busy_timeout = 1000` (a long wait would freeze the single-threaded server).

**C10. Deleted means deleted.** `secure_delete` is on and the write-ahead log is checkpointed after Seal and after each card verification;
the test searches the data files for the stored ciphertext bytes (an earlier test searched for plaintext that was never stored and passed
vacuously).

**C11. Bounded memory: at most 200 opened papers in memory (oldest evicted, a paper idle for 6 h locks again), log growth capped (card
fetch logged once per slot, a seat's reprints logged for the first 3 fetches), public log shows the last 200 entries and re-verifies the
chain at most every 30 s.** Why: each was an unauthenticated or low-rate way to grow cost all week (R1 W2, T5).

## D. Delivery and operations

**D1. Caddy (already on the VM) in front of the app, HTTP/1.1 only, short header/body timeouts, 32 KB body cap, an access log.** Why: it was
installed, handles TLS with an internal CA, and the access log is evidence for the video's "classes of vulnerabilities" section.
*Rejected:* nginx (extra install), HTTP/2 (HTTP/2 Rapid Reset was tried against Group 1).

**D2. Releases are immutable folders under `/srv/leakproof/releases/<tag>` with an atomic `current` symlink; `release.sh <tag>` deploys and
rolls back automatically on a failed health check; `rollback.sh` is one command.** Why: `rsync --delete` over a live tree is not atomic and
cannot be undone. All instances share `current` and pick up new code only on restart.

**D3. Watchdog: a systemd timer probes `/healthz` every 30 s and restarts only the practice instance after 3 failures (max 4/hour); official
and demo are alert-only.** Why: `Restart=always` cannot detect a frozen event loop; `WatchdogSec` needs `sd_notify`, which needs a code
change in a zero-dependency Node app, and an external probe gives the same result. A restart re-locks an open paper (A8).

**D4. No standby instance.** Why: a second copy has its own database, so users and sessions split. A cold standby is the frozen tarball plus
a runbook that rebuilds a clean instance in minutes (clean-slate runbook in `docs/OPERATIONS.md`).

**D5. CI/CD: GitHub is the source of truth; GitHub Actions runs CI (tests, secrets scan, claims check); a member runs `release.sh` over SSH.**
Why: the VM is on the campus LAN and not reachable from GitHub's runners. *Rejected:* a self-hosted runner on the VM (it would execute
pull-request code on the machine that holds the keys), push-deploy, a pull timer for every push.

**D6. The firewall script cooperates with `ufw` (active on the VM) and only ever adds rules, tagged `lp-fw`; the policy is set to DROP only after
the SSH accept rule is verified.** SSH hardening (`harden-ssh.sh --apply`) is a separate, explicit step. Why: locking the owner out of the VM is
the worst outcome. *Unverified:* ufw behaviour and the `hashlimit` module on the VM (needs a rehearsal).

**D7. Fixed role-based course codes: `LP-PROF-G19` (professor), `LP-TA-G19` (TA), `LP-STU-G19` (student).** The legacy code `USS-PRACTICE` still maps to professor for backward compatibility. Overridable in `/etc/leakproof/practice.env`. Why: static codes mean the guide is always accurate; role selection at registration removes ambiguity about what each account can do.

**D8. Three instances.** `practice` (self-registration, :8443 to 8080), `demo` (:7443 to 7090, official mode) and `official` (:9443 to 9090, off until the
25 Nov exam night; its Caddy block is commented out until `enable-official.sh`, so a closed service does not answer 502).
`LP_MODE` (practice|official, case-insensitive, unknown values refuse to start) decides behaviour; the instance name only names directories.

**D9. Demo credentials for each role = three independent demo "pods" of 5 accounts each (1 professor, 2 TAs, 2 students), restored nightly from a golden snapshot
so the posted passphrases stay valid.** Why: the course asks for credentials for each role, practice accounts hold every role, and one shared set would let
three groups collide. The credentials file is generated on the VM (mode 0600, never in git) and appears only in the 18 Nov tester post, not in the 17 Nov
upload. Shared accounts are by honour system (a tester can change a passphrase; the nightly restore fixes it).

**D10. Code freeze Tuesday 17 Nov 2026, midnight; tag `v1.0.0`.** After it only env files (`/etc/leakproof/*.env`: limits, course code), keys, accounts, data and documents
may change. Any behaviour that must be right is fixed before the tag.

## E. Process (how this was built)

**E1. A council of role-played subagents in five rounds (`docs/council/`), each writing a report to a file, then synthesis by one agent, then
implementation by agents with strictly separated file ownership.** Why: the work is broad (security, HCI, design, process) and a single pass misses
things; ownership rules prevent two writers editing one file. Findings are ranked by marks impact (the course gives classmates +0.5% per bug
they find in our system). Round 5's plan is `docs/council/round5/R7_fix_plan.md`.

**E2. FCS Group 1 and Group 2 were the baseline.** Their code and 10,225 classmate bug reports (`reference/fcs/`) showed which defences held and which
bugs staff ruled Valid. Adopted: proxy timeouts and body caps, a dummy hash on unknown users, sessions ended on credential reset, health check after deploy,
a post-deploy smoke script, no committed secrets. Rejected: TOTP, virtual keyboard, password composition rules, JWT, uploads/PKI, chat, "blockchain" log.
See `SECURITY.md` section 3 and `docs/council/round4/R6_adoption_plan.md`.

**E3. Honest scope of testing.** The access-control penetration tester (T2) and the cryptanalysis/offline-attack tester (T4) were stopped by the
model's cyber safeguards and produced nothing. Do not claim those two were done. Coverage instead: critic reviews (C1, C2), recon (T1), fuzzing and
fault injection (T3, T3b), recovery and resources (T5), functional and usability (T6, T6b), mutation testing (T7, T7b) and the route-matrix tests.
A human with the Cyber Verification Program, or a person, should do those two before 18 Nov if possible.

**E4. Every claim in `SECURITY.md` names a test; a claim without a test is removed.** `.github/ci/check-sec-tests.mjs` enforces that the cited test names exist.
Over-claims found by the critics were reworded rather than defended.

**E5. Items deliberately NOT changed before the freeze** (a fix would add more risk than the bug): clearing `setter_id` for drawn questions after Seal (schema/constraint
risk in the seal path; stated limit), GET to POST for copy and card fetches, an `uncaughtException` handler, per-IPv6 /64 limiting, wrong-`server.key` detection at start-up,
LRU (rather than oldest-opened) eviction of papers, a global entry count on the public log.

## F. Changes made after the first write-up of this file

- 2026-11-14 (late): `LP_MODE` unknown values refuse to start; `busy_timeout` 5 s to 1 s; ZWJ/ZWNJ allowed; `official-setup` rejects upper-case usernames; start-over button in the
  release watch (a lone practice tester could otherwise sit behind a lockout for 15 minutes).
