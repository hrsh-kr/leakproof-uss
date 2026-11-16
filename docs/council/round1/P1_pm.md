# P1 Project Manager: LeakProof Phase II plan

Lens: scope, risk, schedule. Reality: 1 builder + AI, 5 days, classmates will attack.

## (a) Schedule options
| Option | Idea | Pro | Con |
|---|---|---|---|
| A. Vertical slice | One end-to-end flow (setter -> admin draw/encrypt -> custodians -> centre unlock -> seat copies -> log), reuse `site/` crypto, add users/roles + small DB | Ships a working story; reuses 170 tests | Few roles polished |
| B. Full 5 roles | Slices A-H of doc 09 | Looks complete | Will not finish; weak everywhere |
| C. Rewrite in Python/FastAPI | Follow `tool/` plan | Cleaner long-term | Throws away tested code; 5 days gone |

**Recommend A**, built on the Node code (re-use beats rewrite).

**Plan**
- 12 Nov: email TAs for VM today. Pick stack, login + roles + persistence (SQLite), deploy hello-world to VM.
- 13 Nov: setter submits questions; admin draws/encrypts/splits. Deploy.
- 14 Nov: custodian share release, centre quorum + time window unlock, per-seat copies. Deploy.
- 15 Nov: audit log view, abuse-case tests (AB-xx), security pass. **Feature freeze at end of day.**
- 16 Nov: usability pilot (2-3 people), fix top 5 issues, user guide final, attacker round by team.
- 17 Nov: morning fix only; executable + guide posted by 18:00 (6h buffer before midnight); tag release.
- 18-25 Nov: patch window. Triage reports daily; fix only security bugs. Log every report (feeds video Part B).
- 26 Nov: demo script rehearsed 25 Nov. 27-28 Nov: record. 29 Nov: submit video.

**Cut-lines**
- MUST: login, roles, setter->draw->encrypt->3-of-5->unlock->seat copy->log; user guide; VM live.
- SHOULD: print-day-before workflow, absent-keyholder fallback, log verifier page.
- DROPPED: all 8 roles, invigilator/student UI, real printers, email, analytics, fairness scoring.

## (b) Top 8 risks
| # | Risk | Mitigation | Early warning |
|---|---|---|---|
| 1 | VM access delay | Ask today; develop container-ready; fallback host only for dev | No reply by 13 Nov noon |
| 2 | Scope creep | Written cut-lines; freeze 15 Nov | Any new feature after 14 Nov |
| 3 | Crypto/key bugs | Reuse tested module; no new primitives; tests on unlock paths | Failing test after refactor |
| 4 | Auth/authz holes (what classmates find first) | Server-side role checks, one middleware, matrix tests | Any route without a role test |
| 5 | Usability regression | Pilot on 16 Nov; guide tested by non-builder | Pilot user stuck >2 min |
| 6 | AI code quality | Review every diff; tests first for risky code | Unreviewed merges piling up |
| 7 | Builder burnout | Sleep floor, 15 Nov hard stop at 22:00 | Late-night bug fixes |
| 8 | Team unused / deploy broke at last minute | Assign roles (c); deploy daily | Deploy untested on 16 Nov |

## (c) Using the five reviewers (no coordination needed)
- R1: write user guide from the live build (13-16 Nov), screenshots.
- R2-R3: attackers on 15-16 Nov; each files findings in a shared table (id, class, proof).
- R4: usability pilots, 3 people each running the guide cold, timed.
- R5: video lead: capture evidence, script Part A/B, own the 29 Nov submission.

## (d) Go/no-go and minimum shippable
- 13 Nov end: VM reachable AND login works. Else escalate to TA, drop to single-host fallback.
- 14 Nov end: full draw-to-unlock works on VM. Else cut SHOULDs.
- 15 Nov end: freeze; all abuse tests green. No go = fix only.
- 16 Nov end: pilot done; guide complete.
- **Minimum shippable**: VM-hosted, login with 3 roles (setter, admin, centre), draw + encrypt + split + unlock + seat copy + log, guide, known-issues list.

Recommendation: A. Biggest risk: VM delay stalls deployment testing; mitigate by asking today.
