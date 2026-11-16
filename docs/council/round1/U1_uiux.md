# U1 (UI/UX): fewest screens, one timeline, three critical screens

Facts checked: `pipeline-core.mjs` already has `BLOCKS[]` with `label`, `plain` (one-sentence plain-language explanation) and `why[]` (mechanism chips) for the 8 stages. `pipeline.js` (368 lines) renders them as stage + caption + chips.

## (a) IA and screens

| Option | Shape | Pros | Cons |
|---|---|---|---|
| A | One page per role, per-role app | Simple routing | 5 mini-apps, duplicated chrome |
| **B (rec.)** | **One app, one "Exam" page, role decides which panel is the primary action** | Fewest screens, one mental model | Needs disciplined permissions per panel |
| C | Wizard per role | Guided | Slow to build, hides state |

**v1 screen list under B (9 screens):**
- Shared: Login; Exam page (timeline + role panel).
- Setter: Question form (list + edit in one).
- Admin: Setup (one long form), Progress board is the Exam page itself.
- Custodian: Approval card (inside Exam page; also a deep link from notice).
- Superintendent: Release checklist + print queue.
- Auditor: Log and verify; Leak trace.
- Cut: user management UI (seed users from a script), reminders, reports, settings, marks, fallback 4-of-5 UI (do as a documented CLI/second button only if time).

## (b) One exam, many roles

| Option | Pros | Cons |
|---|---|---|
| 1 Role dashboards only | Tailored | Nobody sees the whole story; testers get lost; support nightmare |
| **2 (rec.) Shared 7-stage timeline on top, role panel below** | Everyone sees "we are at stage 4, waiting on 2 custodians"; maps to Phase I "steps felt heavy" by showing only the current step expanded | Must never leak content; timeline shows counts and state only |
| 3 Timeline only | Cheapest | No home for role actions |

Timeline = the 7 stages from doc 09 s3, each: done / current / waiting-on-whom / blocked. Every role sees the same strip; "your turn" badge appears only on your stage.

## (c) Critical screens

**Custodian card.** Single card: "Approve release of Exam X at Centre Y", requested by, why, what happens next, `2 of 3 approved`. Primary: Approve. Secondary: Refuse (reason required). Undo until quorum completes. Blocked/error: key piece wrong format (says which field, never echoes it); already approved (shows done, no button); ceremony expired ("Closed at 08:40, nothing opened"); not your ceremony (403 page naming no one).

**Superintendent checklist.** Five rows G1-G5, each green/red with a one-line next step ("Seating report missing: upload CSV"). Release disabled with the first failing gate named at the top, in words, not codes. After release: per-seat queue, reprint requires a reason. Errors: wrong centre, clock skew, tag verify failed ("Paper damaged: do not print, call the Controller"), release already used.

**Auditor trace.** Paste text -> ranked matches (question, order fingerprint, seats with score and reason chips) -> per seat: Confirm / Dismiss + note. Banner "A lead, not a verdict." Empty state: "No match above threshold" with the threshold shown. Chain verify shows head hash and, on failure, the first broken entry number.

## (d) Reuse /pipeline as the explain layer

| Option | Pros | Cons |
|---|---|---|
| i iframe whole demo | Zero work | Disconnected from real state |
| **ii (rec.) Import `BLOCKS` `plain`/`why` as a "What's happening?" drawer keyed to the current timeline stage** | One text source, tested, free onboarding | Two pages must not drift; restyle |
| iii Rebuild guided tour | Tailored | Builds twice |

Also reuse `pipeline.css` palette, light/dark tokens, and `pl-chip`. Keep `/pipeline` as the "Learn" link on login.

## Recommendation and biggest risk
B + 2 + ii. Biggest risk: the timeline and role panels become a state machine nobody tests; mitigate by deriving both from one server `exam.stage` field.
