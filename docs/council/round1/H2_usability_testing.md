# H2, usability testing lead: evidence plan for 25% usability

**Fact to flag first:** classmates submit reports to the course by 28 Nov. We may never receive them. Our own feedback channel is therefore required, not optional.

## (a) Evaluation plan

| Option | Pros | Cons |
| --- | --- | --- |
| A1. Three light rounds: R0 walkthrough by the team (13 Nov), R1 think-aloud with 5 strangers (15-16 Nov), R2 peer testing (18-25 Nov) | Fits the calendar; matches the Lecture-3 "4-5 per class" rule; yields before/after | Small n per role; R1 needs a working build by 15 Nov |
| A2. Full moderated study, 5 per role (25 sessions) | Strongest | Impossible in 5 days |
| A3. Heuristic review only | Free | Weak evidence for the 25% |

**Recommend A1.** Six testers total, each doing two roles, so every role gets at least 3 runs. Five of them also do the full-flow run.

| Role | Task | End criterion |
| --- | --- | --- |
| Setter | Submit one question, fix a deliberate error | Receipt seen, under 90 s (M-U04) |
| Custodian | Approve one share after a 2-minute walkthrough | Under 2 min, no errors (M-U01) |
| Superintendent | Release is blocked: say why and what to do | Correct answer within 5 s (M-U02); then release and find one seat's copy |
| Admin | Create an exam, draw the paper | Draw confirmed |
| Auditor | Verify the log, spot a planted tampered entry | Entry named |
| Whole flow | Guide only, five roles | Under 30 min (doc 09 acceptance) |

**Metrics:** pass/fail, time, errors, critical incidents (severity 0-4), UMUX-Lite after each role (2 items). SUS only after the whole-flow run, reported as indicative at n=5.

**Recruit:**
- Juniors and hostel mates outside the team.
- One non-CS friend.
- A TA or faculty member if one is reachable.
- Swap sessions with another group. This also earns them participation credit (1% per five studies), so it is a fair trade.
- Reuse the Phase I consent form.
- Team members may not serve as testers.

## (b) Instrumentation

| Option | Pros | Cons |
| --- | --- | --- |
| B1. Server access logs only | Zero work | No task timing |
| B2. Own event table | Task times, errors and blocked-state views for free | About half a day of work |
| B3. Third-party replay | Rich | Privacy risk, extra dependency |

**Recommend B2.** Log about 12 event types:
- `task_start`, `task_done`
- `screen_view`
- `error_shown` (with an error ID)
- `blocked_gate_viewed` (which gate)
- `undo_used`
- `help_opened`
- `retry`

Keep these rules:
- Pseudonymous session and tester ID, with a visible notice that events are logged.
- Keep this table separate from the hash-chained audit log.
- A CSV export per tester.
- Every error screen shows a short ID, and a "Report a problem" button pre-fills role, screen and ID. Peers can then quote it.

## (c) User guide

| Option | Pros | Cons |
| --- | --- | --- |
| C1. PDF only | Easy to post | Goes stale |
| C2. In-app help only | Always current | The course asks for a guide file |
| C3. Video | Quick for testers | Slow to produce and edit |

**Recommend C1 plus the same text at `/help`.** Keep it to 8-10 pages:
- Page 1: URL, demo accounts, reset, three-line start.
- Page 2: role map and one flow picture.
- One page per role: goal, 5 steps with screenshots, "if it says X, do Y".
- Final page: a 10-minute guided scenario, known limits, and how to report (template: screenshot, steps, role, error ID).

**Stranger test:** hand over only the PDF and say nothing. Mark a guide gap whenever they are stuck for 60 s. Run it once on 15 Nov and again on 16 Nov after fixes.

## (d) "You said, we changed"

| Option | Pros | Cons |
| --- | --- | --- |
| D1. Ad hoc notes | Quick | Not traceable |
| D2. One ledger | Quote -> change -> evidence | Needs discipline |
| D3. D2 plus a public changelog | Testers see responses | More upkeep |

**Recommend D2.** Keep `logs/peer_feedback.csv` with these fields:
- ID, anonymised tester, quote
- type (usability or vulnerability), severity, theme
- decision (fix, later, won't), change, version
- before and after screenshots, metric

Collect through the in-app button and a short form linked in the guide. Nudge classmates on 24 Nov. Cluster the entries into the top 5 themes and show each in the video as: quote, before, after, number.

**Ask the TAs now** whether hotfix redeploys are allowed during 18-25 Nov. If not, show changes as "v1.1 designed, not deployed" and say so. Our own R1 and R2 rounds give honest before/after evidence regardless.

## Biggest risk
The build is late, so R1 slips and the flows are tested unfinished. Mitigation: click-test the custodian and superintendent flows on 14 Nov, before the rest is done.
