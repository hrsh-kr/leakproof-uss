# H1 (HCI / usable security): round 1

Lens: human-in-the-loop (communication, interference, intentions, capabilities, behaviour), Whitten & Tygar, mental models. Roles from file 09.

## (a) Ceremony and release

**Custodian approval**
| Option | Pros | Cons |
|---|---|---|
| A. Typed key piece (file 09 wording) | Simple | Long numbers get mistyped, pasted, photographed (Johnny problem). Approval is a ritual, not a decision |
| B. One card, key piece unlocked by passphrase, "Approve"/"Refuse" | Fast, phone-friendly (M-U01) | Easy to rubber-stamp |
| C. B plus a **2-word check**: the superintendent's screen shows two words, the custodian types them from the phone call or the room | Binds approval to one real request; kills "approve while distracted" | One extra field; needs the requester online |

**Recommend C for release, B for sealing** (everyone is in the room). Card shows exam, centre, requester role, why, and the consequence in one sentence. Approvals expire (15 min). No pre-approval, no "remember me". Refuse is the same size as Approve and has no penalty text. Pieces are never displayed.

**Release screen (why blocked)**
| Option | Pros | Cons |
|---|---|---|
| 1. Greyed button + tooltip | Cheap | Fails the 5-second test; invisible on phones |
| 2. Five-gate checklist, each row: state, plain reason, who acts, next step | Meets M-U02; fail closed | More UI |
| 3. Single sentence only | Calm | Hides parallel problems |

**Recommend 2 with a top sentence** ("Not yet: waiting for 1 more custodian"). Gates the superintendent cannot fix show a role, not a person. Fallback (4 of 5 plus written reason) sits behind a deliberate "Something is wrong" link, never on the main screen. Confirm dialogs only for irreversible acts (Release, reprint-with-reason), or people click through.

## (b) Mental-model traps
- **Setter:** "receipt = my question is on the paper" (it is only drawn if chosen); "submitted = checked" (no reviewer).
- **Admin:** "admin can read or print"; "Request sealing = sealed"; "counts = quality".
- **Custodian:** "approve = acknowledge a notification"; "someone else will check" (3-of-5 spreads blame); "refusing blocks the exam, so it is rude".
- **Superintendent:** "blocked = broken, use the workaround"; "reprint is free"; "clock mismatch is a fault".
- **Auditor:** "chain verifies = papers were correct"; "match = guilty". Say "evidence", show reasons.

## (c) F10 and F11
- **F10:** per-role path strip ("Step 2 of 4, about 3 min"), one next action per screen. Custodian has 1 card, superintendent 3 steps. Add a **practice exam** (seeded, labelled) so first-timers and classmate testers rehearse safely. The guide mirrors the strip.
- **F11:** the tool cannot print in a hall. Do the minimum: release window opens before entry; show "ready at HH:MM, doors 08:30"; log bundle-level "seal opened" with reason. **Cut** copy- and box-level seals. State plainly that sealed-print custody is unvalidated (5.6 item 3).

## (d) Phase I hypotheses
| Hypothesis | Verdict |
|---|---|
| 20-min ceremony clock | Ignore as a rule. Keep a configurable timeout (fail closed) and record a timed run as evidence |
| Reviewer | Ignore. Cheap substitute for the 49% wrong-key fear: setter re-confirms the correct option on a preview |
| Maths/Hindi input | Ignore rich editors. **Must** keep UTF-8 working through shuffle, print and the log |

**Must respect:** F9 flow, F4 "same questions, same marks" candidate view, F5 custody log, plain words, "no single person" wording. Our sample was classmates; claim nothing about teachers.

**Biggest risk:** C adds a handoff; if the check feels slow, custodians learn to skip it. Test it with 3 people.

**Non-negotiables:** (1) every blocked state names gate and next step; (2) approval bound to one displayed request, expiring, never typed pieces; (3) fallback is a separate deliberate path.
