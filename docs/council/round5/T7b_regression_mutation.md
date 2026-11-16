# T7b: regression and mutation pass on `app-final` (96 tests)

Files: tests `docs/council/round5/T7b_extra_tests.mjs` (copy to `tests/t7b.test.mjs`); work dir `/private/tmp/claude-501/t7` (`mutants2.mjs`, `run2.mjs`, `fall.txt`).

## 1. Stability and coverage
`npm test` x3: 96 pass, 0 fail each, no flake. With my 8 new tests added: 104 pass (2 runs).

| file | line % before -> now | branch % before -> now | uncovered now |
|---|---|---|---|
| server.mjs | 91.9 -> 93.7 | 88.5 -> 88.2 | 75-79 (CLI main) |
| src/app.mjs | 96.1 -> 100 | 90.5 -> 95.8 | none |
| src/exam.mjs | 97.6 -> 98.9 | 83.9 -> 93.5 | 120-121, 215, 327-328 |
| src/crypto.mjs | 100 | 86.5 -> 93.2 | branches only |
| src/http.mjs | 100 | 93.0 -> 100 | none |
| all | 98.0 -> 99.3 | 87.8 -> 94.3 | |

## 2. Mutation kill rate
| run | mutants | killed | rate |
|---|---|---|---|
| Round 5 first pass, original 52 tests | 224 | 110 | 49% |
| Same pass plus my 25 tests | 224 | 191 | 85% |
| Now, `app-final`, full suite | 125 | 80 | 64% |
| of which new or changed code | 70 | 56 | 80% |
| of which earlier survivors re-sampled | 55 | 24 | 44% |

The resample is deliberately the hard residue (earlier survivors); 24 of the 55 are now killed by the round-5 fixes and `extra.test.mjs`. No mutant revealed a wrong behaviour in the code.

New code that is well tested (killed): per-holder words lockout and its log row (N38-N41), paper cap and idle eviction (N27-N28, N32-N36), reprint log cap (N29-N30, N48-N49), control and format characters in names, questions and options (N5-N6, N43-N45), deep healthz and 503 degraded mode (N7-N14, N60-N61), host-header rule, `LP_MODE` (N55-N58), seed commitment in the seal log (N46-N47), `--demo`, creds file mode, `--out` printing (N65-N70).

## 3. Survivors that matter, and the 8 new tests
| mutant | gap | test (all pass on the snapshot, all fail on the mutant) |
|---|---|---|
| N1 N2 | username length cap; Kelvin-sign alias | Y1 |
| N20 N23 N24 | blank username gives silent 401; recovery back-off not per user | Y2 |
| N31 (N34) | idle eviction does not wipe the copy secret | Y3 |
| N16 N17 | static files: case folding, non-GET methods | Y4 |
| N64 | `Expect: 100-continue` path | Y5 |
| N71 | `--out` value parsed as the exam file | Y6 |
| S1 | `maxHeadersCount` | Y7 |
| S3 | `maxRequestsPerSocket` | Y8 |

## 4. Remaining survivors (not covered), triage
| class | mutants | note |
|---|---|---|
| Equivalent | A1 A51 A66 C9 E14 E47 E66 E67 E90 E91 E102 H2 H5 N22 | another check gives the same result |
| Unobservable wipe | E28 E29 E83 E84 | local buffers; needs a hook |
| Needs injectable clock | A22 E57 N37 (copy refreshes the idle timer) C16 | `makeExams` captures `Date.now`; passing `now` into `boot` would let tests cover N37 and the 6 h boundary |
| Statistical | E94 E96 | neighbour-seat rule; no deterministic test |
| Hard to set up | N59 (startup `quick_check`: needs a corrupt db file), N42 (counter leak only), E85 E105 | low impact |
| Sockets | S4 S5 S8 S12 S13 | `maxConnections`, keep-alive, idle timeout, safety net |

Cost to close the clock group: 3 lines (a `now` option in `boot`).
