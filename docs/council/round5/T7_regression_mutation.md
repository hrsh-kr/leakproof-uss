# T7: regression and mutation testing of LeakProof (snapshot of 14 Nov)

Work dir: `/private/tmp/claude-501/t7` (mutator `run.mjs`, mutant list `mutants.mjs`, raw results `allres.txt`). Ready-to-use tests: `docs/council/round5/T7_extra_tests.mjs` (copy to `tests/extra.test.mjs`; it only imports from `./helpers.mjs` and `../src`, `../server.mjs`).

## Verdict (one paragraph)
The suite is stable (5 full runs: 52 pass, 0 fail, 11.4 s each, no flake) and line coverage is 98%, but line coverage hides weak assertions. Of **224 mutants** (security-relevant one-line changes), the 52 original tests killed **110 (49%)**; **114 survived**. The 25 new tests in `T7_extra_tests.mjs` (22 server/unit + 3 client) kill **81 of the 114**; the other 33 are equivalent mutants, defence-in-depth duplicates, or need a hook. **The mutation run found no actual bug in the code**: every survivor is a test gap, not a wrong behaviour. With the new file `npm test` = 77 pass, 0 fail (3 runs).

## 1. Flakiness and vacuous tests
- 5 runs, identical result. No timing-sensitive failure even with 5 parallel suites running (the mutation run), so the tests are not load-fragile.
- Vacuous or weaker-than-claimed assertions found:
  1. **SR4/SR5 "a card's share cannot be passed off as another slot's"** (`flow.test.mjs`, slot 3 with shares[1]): it still returns 409 when the share check is deleted (mutant E81), because the duplicate share then makes the paper fail to open ("Integrity check failed"). Right status, wrong reason; with the check removed the approval row would be recorded. Fixed by X2 (also asserts no approval row and the message).
  2. **S5 "shares are wiped"** only checks `_pending.has(rid)` is false. Dropping the `.fill(0)` in `drop()` (E60) survived. X8 holds the Buffers and asserts they are all zero.
  3. **SR2 "backoff is per user AND client"**: nothing tests two users from one client (A11 survived: keying by IP alone would let one attacker lock every user behind a NAT). X13.
  4. **S6/SR7 seal wipe**: removing the checkpoint after sealing (E31) survived because the later checkpoint on card verify hides it. X9 scans the data dir right after sealing.
  5. **SR6 chain**: tests edit `detail` only. Removing actor, timestamp or the `prev` link from the hash (L7, L8, L11, L2) survived. L7 matters: without `prev` in the hash, someone who can write the DB can delete an entry and re-link the next one with no key. X11.

## 2. Coverage (`node --experimental-test-coverage`, Node 22)
| file | line % | branch % | func % | uncovered lines | SR |
|---|---|---|---|---|---|
| server.mjs | 91.9 | 88.5 | 61.5 | 58-62 (the `start()` CLI main block) | SR11 |
| src/app.mjs | 96.1 | 90.5 | 95.2 | 133-140 (waiting list: verify and approve items), 236 (delete question handler body path), 252-255 (practice reset 10-cap) | SR2, SR5, FCS |
| src/exam.mjs | 97.6 | 83.9 | 97.7 | 96-102 (`counts` ready flag edge), 195 (key-card edge), 306-307 (release `expired`/`failed` text) | SR5, SR9 |
| src/crypto.mjs | 100 | 86.5 | 100 | branches: combine errors, bad password format | SR4 |
| src/db.mjs | 100 | 87.5 | 100 | branch: old-database migration | SR2b |
| src/http.mjs | 100 | 93.0 | 100 | | SR10 |
| src/log.mjs | 100 | 92.6 | 100 | | SR6 |
| src/words.mjs | 100 | 50 | 100 | | SR5 |
| scripts/official-setup.mjs | 100 | 75 | 100 | | SR2b |
| all | 98.0 | 87.8 | 94.4 | | |

Not measured at all: `public/app.js` (787 lines, 0 automated tests; only a grep for `innerHTML`). Practice reset cap, waiting list, delete flow and the 431 path were added in X19, X3, X4/X5 and X15.

## 3. Mutation results (224 mutants)
Original suite: killed 110, survived 114. After `T7_extra_tests.mjs`: killed 191, survived 33. Weak spots by file (original survivors / mutants tried): `exam.mjs` 52/110, `app.mjs` 25/70, `http.mjs` 10/19, `server.mjs` 8/14, `crypto.mjs` 5/14, `log.mjs` 4/10, `db.mjs`/`config.mjs` 10/26.

### Survivors that the new tests now kill (81): highlights
| mutant | what it changes | gap | kills |
|---|---|---|---|
| E73 E74 E75 | only one of the two words, or any count, accepted | SR5 two-words claim untested for partial words | X1 |
| E80 E81 | approve with an unverified card or someone else's share | SR4/SR5 | X2 |
| E64 E65 E62 E59 | words shown to key holders or after expiry; words not bound to the request; replaced request not marked | SR5 "shown only on the exam cell screen" | X3 |
| E22 E67 | delete another setter's question | SR3 | X4 |
| E11 E12 E13 E15 E17 E19 E20 E21 E23 E25 | question length, option and topic bounds, one per topic, closed after seal, seal twice | SR10 input validation | X5, X20 |
| E42 E45 E46 E49 E48 | verify accepts any share; share format; seat count validation | SR4 | X6 |
| E5 E87 E89 E101 E109 | 15 min TTL, copy after window closed, seat 0, trace size cap, restart with an OPEN release | SR5, SR9 | X7 |
| E60 | no wipe in `drop()` | SR4 memory wipe | X8 |
| E31 | no WAL checkpoint after seal | SR7 | X9 |
| E32 | fixed draw seed | SR8 | X10 |
| L2 L7 L8 L11 | chain ignores prev, actor, timestamp | SR6 | X11 |
| A47 A48 A49 A60 A61 A67 | public and sensitive buckets, X-Real-IP trusted without the proxy flag, check-head regex | SR2 / FCS-G1 | X12 |
| A11 A18 | backoff per IP only, display-name length | SR2 | X13 |
| A32 A34 A35 A71 A72 | activation log, /me and logout for must-change accounts, counts shown to non-staff | SR2b, SR3 | X14 |
| H7-H16 S14 | each security header value, CSP strictness, `no-store`, 431 | SR10/11 | X15 |
| C5 C6 C7 C10 C17 | fresh IV, share parameters, hmac separator, bad password format | SR4 | X17 |
| D2 D3 D4 D11 D13 D14 D15 | key and db file modes, log-only db refuses a new key, rollback, FK, cap CHECK | SR6/SR7 | X18 |
| A63 A64 | practice reset cap exactly 10 | FCS | X19 |
| E10 E27 E72 | slot range, seal needs 5 holders, `decision: "maybe"` is not an approval | SR1/SR5 | X20 |
| A23 A31 | concurrent username registration and passphrase change | SR2 races | X21 |
| H17 H19 | limiter window reset and key cap | SR2 | X22 |

### The 33 survivors that remain (triage)
| class | mutants | why |
|---|---|---|
| Equivalent (another check gives the same outcome) | A1 (cookie length, 401 anyway), A13 (simulated account: stored hash `!` never verifies), A51 A52 (route param regex duplicates the DB lookup), A66 (options slice: the distinct-options check rejects 5+), E14 (same), E47 (release before seal is stopped by the 4-verified gate), E67 (`cardFor` gives the same 404), E66 (a refusal closes the request), E90 (route only passes digits), E91 E102 (`!state` implies RELEASED), H2 (stream cap catches it), H5 (body fields are validated later) | no test can distinguish; defence in depth |
| Wipe of local buffers, not observable | E28 E29 E83 E84 (E84 is double-wiped by `drop()`) | needs a test hook (e.g. export a `wipe` counter); low value |
| Time or load, would need injected clock or a slow test | A22 (24 h window), C16 (timing burn), E57 (window edge, millisecond), S1 S3 S4 S5 S8 (socket limits; the flood tests cover only the per-IP cap and slowloris), S12 S13 (safety net) | the S-group is the most worth a test if time allows (raw sockets, 41 headers, 101 requests on one socket) |
| Statistical | E94 E96 (neighbouring seats' first three questions differ; a collision has 1/720 chance per pair, so no deterministic test) | would need to inject the `Stream`; SR9's "neighbours never share" is a design claim, not a proven one |
| Untested edge | E85 (`paper.open_failed` log), E105 (trace duplicate options) | add if time |

## 4. Test-gap list (what has no test at all)
1. `public/app.js` entire (card file crypto round trip, card parsing, bulk flow, polling, error mapping, session expiry redirect). See section 5.
2. `server.mjs` main block (58-62) and the global safety net (S12, S13).
3. Socket-level limits: `maxHeadersCount`, `maxRequestsPerSocket`, `maxConnections`, `keepAliveTimeout`, socket idle timeout.
4. Waiting list and `/api/me` content for key holders (lines 133-140) beyond the expired case.
5. Integrity failure path (`paper.open_failed`) and duplicate trace options.
6. Concurrency beyond recovery codes (now: passphrase change, registration).
7. Wipes of local key buffers (no hook).

## 5. Testing `public/app.js` with zero dependencies and zero change to app.js
Implemented in `T7_extra_tests.mjs` part B. `app.js` runs top-level DOM code, so it cannot be imported. The test reads the file, cuts out the pure helpers by name (`pick('dur','fallbackError','makeCard','readCards','openCard','checkNewPass', ...)` with a bracket counter) and evaluates them in a `node:vm` sandbox that has Node's own WebCrypto, `atob`, `btoa`, `TextEncoder`. No DOM is needed because none of these functions touch it. Three tests (card encrypt then decrypt, wrong passphrase, wrong exam, wrong slot, relabelled slot fails via the AAD, wrapped lines and CRLF, garbage; 429 Retry-After, 413, 502-504, generic; passphrase rules) pass on the snapshot. If the team prefers cleaner code, the smallest real change is to move those functions into `public/cards.js` as an ES module (the CSP already allows `script-src 'self'`) and `import` it in both `app.js` and the test; about 60 lines moved, no logic change. Not covered by this approach: `poll()`, `api()` (needs `fetch`, `document`, `location` stubs; a 30-line fake `document` would cover them) and bulk flow. The bulk flow's logic is straight code on top of `openCard`, so its risky part (decryption and error text) is covered.

## 6. How to reproduce
`cp docs/council/round5/T7_extra_tests.mjs tests/extra.test.mjs && npm test` (77 pass). Mutation: `node run.mjs <worker> <n_workers> <ids...>` in `/private/tmp/claude-501/t7` (copies the snapshot into `w<N>`, applies the mutant, runs the suite). Mutant list: `mutants.mjs`. Results: `allres.txt`. A mutant counts as killed if any test fails; a load-induced failure would be counted as killed, but the baseline ran clean in parallel, so I judge that risk low (unverified for individual mutants).

## 7. Priority for the team (cost to fix before 17 Nov)
1. Drop in `T7_extra_tests.mjs` (zero risk: tests only, 5 s extra).
2. X11 and X2 protect the two claims a classmate might attack: log tamper-evidence and approval integrity.
3. If one more hour: add socket-limit tests for S1/S3/S4/S5/S8 (the FCS groups were attacked on connection floods).
