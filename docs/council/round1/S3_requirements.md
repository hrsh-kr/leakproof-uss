# S3 (security requirements and threat modeling): proposal

## (a) What we commit to in 5 days
| Option | Pro | Con |
|---|---|---|
| A1: 12 testable requirements (below), rest declared design-only | Every claim has a test; fits one builder | Report's 52 shrink visibly; must say so |
| A2: all 11 M-S plus R-S12..S22 | Matches Phase I | Not buildable; untested claims cost the 25% |
| A3: crypto core only (already tested) | Safe | Classmates attack a web app; auth bugs are what they find first |

**Pick A1.** Commit (ID = test):
1. SR1 default-deny roles, every route x role (M-S08, AB-09)
2. SR2 login: slow hash, rate limit, cookie flags, CSRF (AB-07/08)
3. SR3 setter sees only own questions; admin sees counts only (AB-01)
4. SR4 under 3 shares opens nothing; one account cannot hold two shares (AB-13)
5. SR5 release fails closed: window, wrong centre, replayed token, missing seating (AB-16..20)
6. SR6 log edit/delete/reorder/truncate detected; head published (AB-24/25)
7. SR7 canary plaintext absent from DB, files, logs after a full run (AB-15)
8. SR8 seed committed at lock; draw replays identically (AB-11/12)
9. SR9 per-seat copies; neighbours differ; planted leak traces to seat (R-S21, SIM-03)
10. SR10 XSS/SQLi/oversize/traversal inputs inert (AB-04..06, 28)
11. SR11 errors and logs leak no secrets or paths (AB-30)
12. SR12 trace result is a lead; action needs human confirm (R-S11)

**Design-only, declared:** signed client-side submissions (R-S06, replaced by session auth + server ownership check), client-side encryption to pool key, revocation, 4-of-5 fallback, alerts, log shards, print-day-before custody (R-U16/S20/S22), case reply rights, retention, reviewer.

## (b) Trust picture, one VM
| Option | Plaintext seen by | Verdict |
|---|---|---|
| B1: server seals and releases in RAM | Server process, seconds | Buildable, reuses `logic.mjs` |
| B2: B1 plus shares held offline by custodians, server stores only share hashes | Same | **Recommended**; costs little |
| B3: browser-side encrypt and decrypt | Browsers only | Strongest; not 5 days |

Plaintext: setter's browser (own text); server RAM at receipt (ms, then encrypted); sealing (selected questions, seconds); release (copies, seconds, streamed, not cached); the centre's printer and superintendent. Disk holds ciphertext only. The VM operator is fully trusted; say so.

**Honest claims:** "No single *application role* can read the paper before release. The server machine handles plaintext for seconds at sealing and release; whoever controls it then could read it. We cannot stop a photo in the hall, only trace it to a seat. The log shows tampering, it does not prevent it. A trace is a lead, not proof." Never "nobody", never "unhackable" (R-S15).

## (c) Evidence
One `make evidence` runs every test and writes `evidence/SRn.txt`; screenshots named `SRn-attack.png` and `SRn-refused.png`. Video Part B = per requirement: statement, attack tried, refusal, test ID (30 s each). `logs/vulnerabilities.csv` per classmate report: class, cause, fix, regression test; classes and lessons come straight from it. Alternative (manual screenshots at the end) fails under deadline.

## (d) Biggest gap
Phase I marked R-S01, S06, S10 as "design requirement, tested in Phase II" and presents print-the-day-before (R-U16) as decided. Reality: no real auth, no signed submissions, and the sealing machine is the whole app server. We must narrow R-S01 to "application role" and state the 40 uncommitted rows openly.

**Biggest risk:** SR7 and SR6 pass in our tests but a classmate finds plaintext or an unauthenticated route first.
