# A3 (Thiel-style contrarian lens): LeakProof Phase II

Role-played lens, not the real person.

## (a) The secret: what must be 10x better
Everyone else tries to *prevent* leaks (locks, guards, encryption). Our contrarian truth: **leaks are inevitable, so make every leak traceable and therefore costly.** Encryption, 3-of-5 Shamir and the hash chain are commodity features anyone can copy from a textbook.

| Option | 10x claim | Pros | Cons |
|---|---|---|---|
| 1. Leak-to-seat tracing | Photo of a paper to a named seat in 10 seconds, versus never today | Demonstrable live, unique, memorable | Needs the fingerprint to survive cropping |
| 2. No key exists before the hour | Paper is unreadable to everyone until quorum + window | Strong security story | Hard to *show*; looks like a log screen |
| 3. Usability: 8 steps become 3 | Phase I's main complaint | Scores on the 25% usability weight | Not defensible as a "secret" |

**Pick 1, with 2 as supporting evidence.** Key point: the fingerprint must be the question/option *order itself*, not the printed copy ID, because a leaker can crop the ID off. The demo: crop the header off a photo, and the tool still names the seat. That is the 10x moment. A side benefit to claim: neighbour copying becomes useless because adjacent seats see different orders.

Biggest risk: the matcher fails on a partial photo (a few questions only). Test with 3-question fragments.

## (b) The wedge
| Option | Pros | Cons |
|---|---|---|
| 1. One course, one hall (about 60 seats), college mid-sem MCQ | Matches the code, finishable, believable | Looks small |
| 2. Any written exam, including subjective | Bigger story | Fingerprinting subjective papers is unbuilt |
| 3. Board or national exams | Impressive | Fantasy in 5 days |

**Pick 1.** Say NO to: subjective answers, online proctoring, remote exams, biometrics, plagiarism checks, printer hardware integration, mobile app, email/SMS, multi-institution tenancy, and the full 8-role matrix. Keep five roles. Cut whatever isn't in the demo story.

## (c) The definite plan: 26 Nov and 29 Nov
One story, four acts, 5 minutes live:
1. Setters submit questions; the draw happens (30 s).
2. Quorum unlocks; 60 seat copies appear. Only two officials are present, so the unlock is refused (show the *no*).
3. A "leaked" cropped photo goes in; the tool names the seat.
4. Tamper with the log; the chain breaks visibly.

Options: live only (risky), recorded only (unconvincing), **live with a pre-recorded fallback (pick this)**. For the video, Part B is the proof of seriousness: keep a vulnerability log from 18 Nov, classify each finding, fix it, and credit the tester. "We were attacked by 8 people; here is what broke" is what a skeptical professor remembers.

## (d) Pushback and the uncomfortable question
**Biggest likely mistake:** rewriting in Python/FastAPI or building all 8 roles with full auth. The real, tested code is Node (170 tests). Extend `site/`, add a thin server with real sessions on the VM, and ship the one story well.

**Uncomfortable question:** *Who do we trust on the VM?* The server sees the plaintext paper at draw and assembly, so we are the single point of trust that the design claims to remove. And Phase I never reached a teacher or exam officer. Would any of them run this? State the trust assumption openly in the guide and video. Hiding it will get found by the first attacker.
