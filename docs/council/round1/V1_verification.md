# V1, software verification engineer: 5-day verification plan

**Facts checked.** `site/tests/` has 170 passing `node:test` tests (logic 18, pipeline 35, api 36, ui ~77). They cover crypto, Shamir 3-of-5, hash chain, copy IDs, and a fail-closed release rule. `tool/tests/` has 24 data-level tests on a matrix JSON only; no app code is behind them. The 04 plan (sec. 6) assumes pytest, hypothesis and B0-B13 over six weeks. We have five days. No roles, auth or stored state exist yet, so the new risk sits in the new server code, not in the crypto.

**Finding to fix before anything else.** `pipeline-core.mjs` keeps `s.keyHex` and `s.paperText` after the "wipe". The `split` step claims the key is wiped, and a test should fail on that claim. Fix the code or reword the claim.

## (a) Strategy

| Option | What | Pros | Cons |
|---|---|---|---|
| A. Keep Node `node:test`, extend | One language, reuse 170 tests, `--experimental-test-coverage` | Zero setup, runs on the VM today | No hypothesis; use seeded loops |
| B. Port to Python/pytest | Matches 04 plan | Good tooling (hypothesis, bandit) | Rewrites proven crypto; burns 1-2 days |
| C. Both | Node core, Python black-box attacker script over HTTP | Attacker script is independent of the implementation, which is good evidence | Two toolchains |

**Recommend A, plus a small Python/curl-free attack script only if the builder already uses Python.** Do not port. Drop `tool/` as a test base; keep only `matrix.json` as data.

Order (highest damage first): 1) release gates and state machine, 2) permission matrix on every API route, 3) abuse suite, 4) crypto regression (exists), 5) E2E on the VM, 6) UI smoke. Skip: simulation SIM-02..06, usability scripts, property-test frameworks.

Realistic targets: 90% line on `logic.mjs`, `pipeline-core.mjs` and new `server/*` core; 100% of matrix cells and gate rows; no target on UI code. Lint plus `npm audit` in CI. Tiny hand-made mutation run: 15 sed mutants on gate conditions (`>=` to `>`, drop a check); each must turn a test red.

## (b) Table-driven

Two JSON files are the single source of truth for both the code and the tests:
- `policy/matrix.json`: role x action x scope. Server middleware reads it. One loop generates a test per cell (about 8x20). A coverage test enumerates the real route list and fails if a route is absent (default deny).
- `policy/gates.json`: release rules as rows `{id, requires, mutation, expected_reason}`. Generator builds every subset of missing conditions (quorum, seating report, window, nonce, centre match, signature): all 2^n minus 1 must refuse; only the full set opens.

State machine: a transition table (stage, event, allowed role); test every (stage, event) pair, valid ones succeed and the rest are refused with no side effect.

Pro: matrix changes cannot silently drift from code. Con: the builder must resist hand-written `if role ==`. Ban that with a grep test.

## (c) Break-it suite

`tests/abuse/*.test.mjs`, one file per AB id from 04 sec. 6.4 (cut to the 18 that fit our scope: AB-01..05, 08-10, 13, 16-20, 22, 24, 25, 29, 30). Each test is named by AB id and logs a row to `logs/vulnerabilities.csv` format on failure. Runs: every commit (`npm test`, under 60 s, local server in-process) and on the VM against the real URL via `BASE_URL=... npm run attack` (adds rate limit, cookie flags, headers, CORS, and a secret/stack-trace grep of responses and logs).

## (d) Done and go/no-go

Per feature: spec line; matrix row; gate row if a gate; at least one positive, one negative, one abuse test; no plaintext in logs (grep test); guide paragraph; screenshot taken.

**Go/no-go, 16 Nov 22:00:** `npm test` green on a clean clone on the VM; attack suite green against the public URL; matrix and gate coverage 100%; zero open High in the vuln log; the user guide followed cold by someone else reaches an unlock; executable and guide downloaded from the file server and run from scratch. Any red is a no-go for new features, and only fixes ship. Freeze at 23:00, tag, upload.

Quality-grade evidence: test count and coverage report, CI log, the two JSON policy files, mutation table, vuln log with before/after tests, traceability (requirement -> test id; `trace_requirements.py` exists).

**Biggest risk:** the new server and auth code is written last and is untested, while the crypto, which is already tested, gets all the attention.
