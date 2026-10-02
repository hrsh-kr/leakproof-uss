# Requirements Register (hypotheses until evidenced)

Status: v0 seed list. Every row starts as a hypothesis. A requirement becomes final only when it has an evidence ID from `logs/findings.csv` or a labelled assumption, and a test or evaluation method. Rows with no evidence by Oct 4 are removed or labelled "assumption" in the report.

How to read: ID, type (U usability, S security, P privacy, F functional), priority (Must, Should, Could), source (evidence ID or assumption), how we will check it.

## Usability

| ID | Requirement | Pri | Source | Check |
| --- | --- | --- | --- | --- |
| R-U01 | A custodian can complete a key approval after one short walkthrough, without help | Must | Hypothesis; RQ5 | Think-aloud; time and errors |
| R-U02 | Centre staff can start a print in under a target time (set from interviews) | Must | Hypothesis; RQ2 | Think-aloud; time on task |
| R-U03 | Each step shows what just happened in plain words | Must | Hypothesis; Lecture 2 (opaque process), RQ4 | Inspector review by non-authors |
| R-U04 | Error messages say what failed and what to do next, without exposing secrets | Must | Hypothesis | Prototype review; AB-30 |
| R-U05 | The tool names the quorum the way users picture it (several keys, one locker) | Should | Hypothesis; Lecture 4 | Mental-model task |
| R-U06 | The fallback path is no harder than the normal path to follow | Should | Hypothesis; RQ2 | Think-aloud |
| R-U07 | Setters can submit 5 questions in a stated time, with a clear receipt | Must | Hypothesis; RQ1 | Think-aloud |
| R-U08 | Candidates are told the order of questions differs and why | Should | Hypothesis; RQ3 | Survey |
| R-U09 | Users can recover from a wrong click without breaking security | Should | Hypothesis | Critical incidents |

## Security

| ID | Requirement | Pri | Source | Tests |
| --- | --- | --- | --- | --- |
| R-S01 | No single human role can read the drawn paper before release | Must | Threat model T-08, T-09 | Matrix, AB-09, AB-13 |
| R-S02 | Fewer than k custodians cannot open the paper | Must | A2 | Property tests, AB-13 |
| R-S03 | Release occurs only inside a signed window and for the named centre | Must | T-11, T-12 | AB-16 to AB-18 |
| R-S04 | If any release input is missing, nothing prints | Must | Fail-closed rule | AB-20, SIM-05 |
| R-S05 | Every action that changes state is logged in a tamper-evident log | Must | T-17 | AB-24, AB-25 |
| R-S06 | Submissions are signed and bound to an authenticated setter | Must | T-01 | AB-01 to AB-03 |
| R-S07 | Each printed copy carries an ID and an order that identifies the seat | Must | T-16 | SIM-03, property tests |
| R-S08 | The draw is reproducible and cannot be steered after the pool is locked | Must | T-06 | AB-11, AB-12 |
| R-S09 | Permissions follow the matrix; anything unlisted is refused | Must | A5, T-04, T-19 | Matrix tests |
| R-S10 | Plaintext is never stored in the database, files or logs | Must | T-08 | AB-15 |
| R-S11 | Suspect results show reasons and need human confirmation before any action | Must | T-18 | AB-27, SIM-04 |
| R-S12 | Passwords are hashed with a slow standard method; login attempts are limited | Should | T-20 | AB-07 |
| R-S13 | Revoked keys cannot sign after revocation | Should | T-24 | AB-31 |

## Privacy

| ID | Requirement | Pri | Source | Check |
| --- | --- | --- | --- | --- |
| R-P01 | Keep only the personal data needed for each role | Must | Course scope (privacy) | Data model review |
| R-P02 | A person named in a case can see it and respond before action | Must | T-18 | Matrix; case flow test |
| R-P03 | Investigators see only their assigned cases | Must | T-19 | AB-26 |
| R-P04 | Retention limits for leak evidence and case data are stated | Should | Hypothesis | Policy text |

## Functional

| ID | Requirement | Pri | Source | Check |
| --- | --- | --- | --- | --- |
| R-F01 | Five exam profiles run without code changes | Must | Decision D14 | E2E per profile |
| R-F02 | Whole pipeline runs end to end with an inspector at each step | Must | Decision | E2E |
| R-F03 | A new peer tester can finish the main flow with only the user guide | Must | Course brief | Usability test |
