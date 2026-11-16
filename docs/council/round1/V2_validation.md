# V2 Validation: did we build the right thing?

## (a) Acceptance scenarios (3 option sets)
| Option | Shape | Pro | Con |
| --- | --- | --- | --- |
| A | One walkthrough per role | Matches guide | Misses abuse |
| B | One per Must security requirement | Maps to the video | Tester never sees a whole exam |
| **C (pick)** | 1 happy path + 5 abuse/failure | Both stories, 6 short runs | Needs seed/reset button |

| # | Scenario | Pass criteria |
| --- | --- | --- |
| S1 | Happy path, 3 topics, 20 seats, 5 roles | Guide-only tester finishes <30 min; 20 copies differ; IDs pass check digit; answer keys differ |
| S2 | Premature release: 2 of 3 custodians (+ forged third), early clock, wrong centre, no seating report | Nothing prints; screen names the failed gate + next step; each refusal in the log |
| S3 | Confidentiality: setter B opens A's question URL; admin and auditor request question text; scan DB/logs | 403 each; zero plaintext, key or share in storage, logs, errors |
| S4 | Tamper: edit, delete, truncate a log row in DB | Verify chain fails; truncation caught by published head |
| S5 | Leak trace: photo text of one copy | Right seat in shortlist; no automatic accusation; human confirm step |
| S6 | Custodian absent / wrong click: refuse, un-approve, 4-of-5 fallback with reason | Works without weakening quorum; auditor sees it flagged |

Recommend C. Biggest risk: S1 needs one person to act as five roles; ship pre-made accounts and a "reset demo exam" button, or testers never reach S2-S6.

## (b) What an external tester checks first (blunt)
Order: URL loads and has HTTPS; guide matches screen; default passwords; guess admin URLs; XSS in question fields; devtools for secrets; login brute force; API calls without cookie.

Where they will be disappointed:
- Server holds the five key pieces and sees plaintext at sealing: "server compromise opens everything". State the limit before they find it.
- Setter "client-side encryption" uses JS the server serves; weaker than claimed.
- One tester holding all custodian accounts defeats separation; say it is a demo artefact.
- Release clock is the server clock; no real printers.
- Slow VM, dead link, broken reset: these lose usability marks before any crypto does.

## (c) Real stakeholders in 20 minutes
| Option | Do | Pro | Con |
| --- | --- | --- | --- |
| 1 | One prof/exam-cell person live | Strongest evidence | Unconfirmed availability; Phase I never reached staff |
| 2 | 5-min screen recording plus 5 questions by message to 2-3 faculty | Cheap, async | Shallow |
| 3 | Course TA/senior as exam-cell proxy | Likely reachable | Not a true stakeholder |

Recommend 2 now (send by 14 Nov), try 1 as bonus, label 3 honestly. Show three screens only: custodian approve card, superintendent blocked state, auditor trace. Ask: would you accept this in your exam; who holds a key if the HoD travels; is the "order differs" note acceptable; what would you refuse. Video claim: "N staff reviewed", never more.

## (d) Traceability skeleton
| Req | Feature | Test | Screenshot | Video |
| --- | --- | --- | --- | --- |
| M-S01 | Role-blind pages | S3, matrix test | s3_403.png | B1 |
| M-S02 | 3-of-5 seal | S2, property test | s2_two_of_three.png | B2 |
| M-S03 | Five gates | S2, AB-16..20 | s2_gate_blocked.png | B2 |
| M-S06 | Hash chain | S4, AB-24/25 | s4_verify_fail.png | B3 |
| M-S07 | Per-seat copy | S5 | s5_trace.png | B3 |
| M-S09 | Login limits | brute-force test | login_429.png | B4 |
| M-U01 | Custodian card | 5-user timing | u1_card.png | A2 |
| M-U02 | Blocked reason | 5-second test | u2_blocked.png | A2 |
| M-F11 | Fallback | S6 | s6_fallback.png | A3 |
Add columns: Phase I finding, tester-found bug, fix.
