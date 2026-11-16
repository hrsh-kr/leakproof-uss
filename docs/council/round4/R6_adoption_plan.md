# Round 4 synthesis: what we adopt, adapt and reject

Inputs: R1 (our code), R2 (G1 security), R3 (G1 usability), R4 (G2 security), R5 (G2 usability).
Filter: protects P1-P6 / SR1-SR12, closes a bug class classmates will try (or a Valid FCS bug class), or measurably helps a real task. Otherwise rejected.
R1's W1 (one request crashes the server) was reproduced independently before this plan.

## A. Server, security and deploy (implementer S owns: `app/server.mjs`, `app/src/**`, `app/tests/**`, `app/scripts/**`, `app/deploy/**`, `app/SECURITY.md`, `app/README.md`)

| # | Change | Source | Why |
|---|---|---|---|
| S1 | Parse the URL inside the try (400 on failure); `.catch` on `app.handle`; `process.on('unhandledRejection')` logs instead of crashing | R1 W1 (verified) | One request kills the service: a Valid DoS |
| S2 | Cookie parser skips undecodable values | R1 W4 | 500 on a crafted cookie, and blocks login |
| S3 | Full log verification cached for 30 s (detects edits within 30 s at bounded cost); public log returns the last 200 entries + `total`; `card.fetched` logged once per slot | R1 W2 | Unauthenticated CPU amplification grows all week |
| S4 | At startup, pending releases become `interrupted` (logged); `next` says "The server restarted: request release again" | R1 W3 | Stuck "4 of 3 approved" dead end |
| S5 | Wipe in-memory shares of replaced/expired/interrupted requests | R1 W12 | Plaintext shares linger in RAM |
| S6 | `PRAGMA secure_delete = ON`; `wal_checkpoint(TRUNCATE)` after seal and after each verify; SR7 test searches for the stored ciphertext/wrapped-share bytes, not plaintext | R1 W9 | "Deleted" pool and shares recoverable from disk; SR4/SR7 overstated; SR7 test was vacuous |
| S7 | Per-seat answer key: `GET /api/exams/:id/key/:seat` (cap `run`, paper open, logged) | R1 W5 | Papers cannot be marked; P6 not demonstrable |
| S8 | Shared networks: register limit counts only successes, default 30/day/IP; account cap 2000; auth bucket 30/min; check-head gets its own bucket; nginx `lp_auth` 30r/m | R1 W6, R4 #1, R5 #1 | G2 testers behind one VPN/NAT IP got locked out |
| S9 | Refusal requires the two words; refusal stays fail-safe (closes the request) and the veto is stated in SECURITY.md §4 | R1 W10 | Remote griefing by a holder who is not there |
| S10 | Wrong words are logged; 5 wrong attempts close the request (`failed`) | R1 W11 | 14-bit check guessable online |
| S11 | First-login passphrase change on accounts made by `official-setup.mjs` (`must_change`); `POST /api/passphrase` (current passphrase required) issues a new passphrase + recovery code shown only to the user and ends other sessions; available to everyone | R4 #4, R1 W17 | Operator saw every official passphrase and recovery code, so could claim all five cards; no change-passphrase / sign-out-everywhere |
| S12 | Requests with header `X-LP-Background: 1` do not refresh the idle timer | R4 #5 | 5 s polling defeated the 30 min idle logout |
| S13 | Refuse to start if a key file is missing but the database already has data | R2 #2 | G1 silently regenerated keys and re-signed its chain |
| S14 | Draw seed public after release: in the public log response (`draw: {seed, pool, drawn}`); drop the `run`-only seed route | R1 W13 | UI promised public verifiability it did not deliver |
| S15 | Times in refusals relative ("opens in 3 h 20 min"); practice window 14 days; G2 refusal in practice suggests a fresh practice exam; `serverNow` and `minVerified` in the exam summary | R1 W15, R5 #5 | UTC vs local confusion |
| S16 | Small: real `Retry-After`; 413 (not reset) for chunked bodies over 16 KB; recovery code strictly single-use under concurrency; adjacency rule only when the paper has 4+ questions; HEAD served like GET for static files; security headers on `clientError` replies | R1 W17, W8 | Each is a likely tester report |
| S17 | nginx: drop `http2`; `add_header ... always` for nosniff, X-Frame-Options, HSTS (and `proxy_hide_header` the same so they are not duplicated); firewall runs from systemd `ExecStartPre=+` and allows only 22, 80, 443, 8443 inbound; `deploy/smoke.sh` curl checks for the VM; `install.sh` runs `npm test` first and a health check last; self-signed cert gets a SAN | R2 #1 #3 #4 #5, R4 #2 #3 #6, R1 W8 | G1 Rapid Reset attempts; G2 open RDP; firewall lost on reboot; G1 self-audits passed for wrong reasons |
| S18 | Occam cuts: unused MIME types, `LP_ORIGIN` kept (documented) but app-level per-IP socket cap kept only as tested evidence for local runs | R1 §4 | Smaller surface |

## B. Client and guide (implementer C owns: `app/public/**`, `app/USER_GUIDE.md`)

| # | Change | Source |
|---|---|---|
| C1 | `api()` maps non-JSON and network errors to plain advice: 429 wait, 413 too long, 502/503/504 or fetch failure "the server is restarting, try again in a few seconds" | R1 W7, R3 #2, R5 #2 |
| C2 | Busy state: button text "Working…" + `aria-busy` while any action runs; card crypto says "Working… (a few seconds)" | R3 #1, R5 #10 |
| C3 | After an idle sign-out, say why and return to the page the user was on after login | R3 #3, R5 #4 |
| C4 | Home "Waiting for you" and Key cards refresh every 10 s while visible; all polls send `X-LP-Background: 1`; the release screen updates only its status region (aria-live), keeping focus | R3 #6, R5 #3, R1 W16 |
| C5 | Seal confirmation focuses Cancel, Esc cancels; setter Delete is a two-step confirm | R3 #4 #8, R5 #8 |
| C6 | "Show passphrase" toggle on log-in, card creation, verify and approve | R3 #5 |
| C7 | Answer key for each printed seat (button next to the seat; printable) | R1 W5 |
| C8 | Practice (holder with several cards): "Create all my cards" with one passphrase and one downloaded file; verify all from that file in one step; approve forms accept the multi-card file and pick the right card | R1 W14 (Phase I "steps heavy") |
| C9 | Forced passphrase change screen when `mustChange`; "Change passphrase" in the header for everyone | S11 |
| C10 | Show server time next to the print window; all times local; disable "Request release" with the reason when cards < `minVerified` or outside the window | R5 #5, R3 #7 |
| C11 | Show the log head on the approval screen | R5 #6 (SR6 promise) |
| C12 | Accessibility: `document.title` per page, skip link, tab panels, clipboard failure fallback, phone-scrollable tables, guarded loads (no blank page on errors) | R1 W16 W17, R3 #10 |
| C13 | Public log shows the draw seed and a one-line replay explanation; shows where the chain broke | S14, R3 #10 |
| C14 | USER_GUIDE: "works as designed" list (refusal closes a request, a verified card cannot be shown again, usernames are unique, restart re-locks the paper, rate limits); placeholders clearly marked as filled at deploy | R5 #9, R1 W13 |

## C. Rejected (and why)

| Measure (group) | Reason |
|---|---|
| TOTP / 2FA (G1, G2) | The high-risk action (approve release) already needs card + card passphrase + two words; login MFA protects nothing we hold that those do not |
| Virtual keyboard (G1, G2) | Course requirement for FCS, not ours; hurts usability; keyloggers are out of scope |
| Password composition rules / strength meter (G1, G2) | Login passphrases are generated (80 bits); card passphrase has a length minimum |
| JWT access/refresh tokens, IP-bound sessions (G1, G2) | Server-side sessions are simpler to revoke; IP binding breaks on mobile networks |
| File upload validation, PKI signatures, resume encryption, E2EE chat (G1, G2) | We accept no files and have no messaging |
| "Blockchain" audit (G1, G2) | Our keyed HMAC chain with the head printed on paper is stronger and simpler |
| Admin dashboard, user search, privacy settings (G1, G2) | No user directory is the defence |
| Health-check auto-restart on the official instance (R2 #6) | A restart re-locks the paper mid-exam; systemd `Restart=always` already covers crashes |
| Email/SMS verification (G1 Valid bug class) | VM has no guaranteed internet (G2's rebuttal, accepted by staff); course code + caps instead |

## D. API contract between S and C (both must follow exactly)
- `GET /api/me` adds `mustChange: boolean`. While true, every session route except `GET /api/me`, `POST /api/passphrase`, `POST /api/logout` answers 403 `{ error: "Set your own passphrase first.", mustChange: true }`.
- `POST /api/passphrase` body `{ current }` → 200 `{ passphrase, recovery }`; other sessions of the account are deleted, the current one stays; wrong current → 401 with backoff.
- Header `X-LP-Background: 1` on polling requests: answered normally, idle timer not refreshed.
- `GET /api/exams/:id` adds `serverNow` (ms), `minVerified` (number); `release` is `{ id, state, seats }`.
- Release `state` values: `pending`, `open`, `refused`, `replaced`, `expired`, `interrupted`, `failed`. Any state other than `pending` and `open` means "request again".
- `POST /api/releases/:rid/decide` with `decision: "refuse"` now also needs `words`.
- `GET /api/exams/:id/key/:seat` (cap `run`, paper open) → `{ seat, copyId, answers: ["B","D",...] }` in that seat's question order.
- `GET /api/exams/:id/seed` is removed. `GET /api/public/log/:id` → `{ chain: { ok, entries, brokenAt?, checkedAt }, head, total, entries (last 200, newest last), draw: null | { seed, pool: [{id, topic}], drawn: [id] } }`.
- Card file: one or more lines `LPCARD1.<base64url>` (one per slot); a file may hold several cards; the client picks the line whose slot matches.
