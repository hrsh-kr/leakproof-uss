> **Superseded.** The review now runs on the website itself (`/review`), with the question set in `remote_usability_test.md`. This file is kept as the earlier Tally plus voice option.

# Feedback Flow: voice first, form second (v2)

Replaces the long survey (v1). Principle (see `07_operating_principles.md`): make feedback nearly free, ask what matters most, and keep a short quantitative core for the course.
Page: `phase1_deliverables/prototypes/leakproof_demo/` (v0.2). Decision record: D17 in `02_final_scope_and_decisions.md`.

## 1. The flow, from the respondent's side

1. Opens the page. Sees the idea in 60 seconds through four scenes.
2. Under each scene, **"Confusing? Tell us"** opens the form with that scene already filled in. A floating **"Say what you think"** button does the same from anywhere.
3. At the end: **"Record a voice note"** (30 seconds) or **"Type it instead"**.
4. Optional second page: two more minutes of quick questions for people who want to help more.

Nobody signs in. Works on a phone. The form knows which scene they were on.

## 2. The form (build in Tally, free)

Hidden field on the form: `scene` (values 1 to 4, `top`, `end`). The page fills it in automatically.

**Page 1 (about 60 seconds, always shown)**

| # | Question | Type | Why |
| --- | --- | --- | --- |
| 0 | Text block: "Anonymous. We use answers only for our course project at IIIT-Delhi and quote them without names. Voice is optional." | Text | Consent in one line (Lecture 3 consent elements, short form) |
| 1 | In one sentence, what does this do? | Short text (or voice) | The 60-second test: can a stranger explain it back |
| 2 | What would you change? | Long text, optional; link below it: "Prefer to talk? Record a voice note" | Open improvement question, in their words |
| 3 | You are... | Single choice: took an entrance or recruitment exam / write exam questions / help run or invigilate exams / other | Split results by role |

**Page 2 (optional, "Want to help more? 2 minutes")**

| # | Question | Type | Why |
| --- | --- | --- | --- |
| 4 | How acceptable is printing the paper at the exam centre shortly before the exam? | 1 to 5 | Acceptance of D1 (RQ3) |
| 5 | This would make me trust exam security more. | 1 to 5 | Trust effect (RQ6) |
| 6 | The features would meet what I need from a secure exam system. | 1 to 7 | UMUX-Lite item 1 |
| 7 | The prototype is easy to use. | 1 to 7 | UMUX-Lite item 2 |
| 8 | Which scene was hardest to follow? | Single choice: 1, 2, 3, 4, none | Where to redesign |
| 9 | Five setters leak their questions. Which is closest to right? | Single choice: **only the ones drawn onto the paper, a minority** (correct) / all their questions are on the paper / the whole paper is exposed / no effect | Check scene 1 |
| 10 | Two of five key holders approve. What happens? | Single choice: **the paper stays locked** (correct) / it opens slowly / it opens partly / not sure | Check scene 2 |
| 11 | A photo of one page leaks. What can we tell? | Single choice: **which seat, or a short list of seats** (correct) / the name of the person / nothing | Check scene 3 |
| 12 | Someone edits a record, then recomputes the log's fingerprints. What still gives it away? | Single choice: **the last fingerprint no longer matches the one published earlier** (correct) / the log refuses to save / nothing | Check scene 4 |
| 13 | Which exams have you taken or worked on? | Multi-select, optional | Match to exam profiles |
| 14 | Preferred language for the full tool | English / Hindi / other | Language requirement |

Shuffle answer order in questions 9 to 12. Show a thank-you with: "Want to see what changed because of your feedback? Leave an email in this separate form: [link]" (separate so answers stay anonymous).

## 3. Voice: three ways, with trade-offs (decision D17)

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| **A. Tally only** | Typed answers | Free, anonymous, clean, scene context built in | No voice. Tally has no recording field, only file upload (see note below) |
| **B. Tally plus WhatsApp voice note** (default) | "Record a voice note" opens a chat with your number, prefilled with a short message | Everyone has it; nothing to install; fastest for a 30-second answer | We see their phone number, so not anonymous; manual handling; keeps recordings on your phone |
| **C. Tally plus a voice-native form** (Typeform, AidaForm, FormHug, Voiceform, or Jotform with a voice widget) | "Record a voice note" opens a form with an Audio field | Anonymous; recordings land in one place; some tools transcribe | Another tool and account; free-plan limits not verified by us (one source lists 10 submissions a month for Voiceform's free plan). Check each pricing page before choosing |

Note on sources: web search shows Tally has no native audio recording and supports file upload only (search summary of [OtterForm's comparison](https://otterform.co/compare/tally-alternative) and [Tally's own site](https://tally.so/)); [Typeform](https://help.typeform.com/hc/en-us/articles/27965524569108-Collect-video-and-audio-answers-from-respondents) documents audio and video answers, but its plan requirements could not be opened from here, so verify. Tally popups support hidden fields ([Tally docs](https://tally.so/help/popup-forms), [developer resources](https://tally.so/help/developer-resources)).

**Recommendation:** B now (zero setup, works today), switch to C if anonymity matters or volume grows and a tool's free plan fits.
**Prompts to show next to the voice button** (pick one, 30 seconds): "Explain this to a friend." / "What confused you?" / "What would you change?"

## 4. Setup in 10 minutes

1. Create the Tally form from section 2. Add a hidden field named `scene`. Publish. Copy the form ID from its link (`tally.so/r/<ID>`).
2. Choose voice: `WHATSAPP=91XXXXXXXXXX` (option B) or `VOICE_URL=<link>` (option C).
3. Build: `TALLY_FORM_ID=<ID> WHATSAPP=<number> python3 build.py` (inside the `leakproof_demo` folder).
4. Host `dist/index.html` (GitHub Pages or Netlify Drop). The claude.ai preview cannot load Tally or open links for outsiders.
5. Open the hosted page on your phone, tap "Confusing? Tell us" under scene 2, and check the response shows `scene = 2`.

## 5. Handling voice notes

- Say before recording how it is used (the page does). Voice is optional.
- Transcribe locally (for example with Whisper) so audio does not go to another service; delete recordings after the final report; quote without names.
- Treat each transcript as one interview-style source: code it into `logs/findings.csv` (one finding per idea), keep the participant as a code (P01, P02).

## 6. Analysis plan (written before the data)

| Output | From | Rule |
| --- | --- | --- |
| Explain-it-back score | Q1, voice prompt "explain this" | Score 1 point each for: locked and needs several people; many writers or late draw; traceable copies or tamper-evident log. **2 of 3 counts as understood.** Target 70% or more |
| Comprehension per scene | Q9 to Q12 | Below 70% correct: redesign that scene and log it |
| Where it confused people | `scene` hidden field, Q8 | Rank scenes by confusion reports |
| Acceptance and trust | Q4, Q5 | A decision is revisited if under half find it acceptable |
| Usability score | Q6, Q7 (UMUX-Lite) | Report mean and spread |
| Improvement themes | Q2, voice notes | Coded into findings; each theme becomes a finding ID; changes logged |

Report by role when each group has at least 5 responses.

## 7. Pilot before release

- [ ] Two people complete it on a phone; time recorded (page 1 under 90 seconds)
- [ ] The `scene` value arrives correctly from each "Confusing? Tell us" link
- [ ] A voice note can be recorded and received end to end
- [ ] Nothing in the form asks for a name or email (the email form is separate)
- [ ] Someone outside the team can open the hosted page

## 8. Limits we will state

Proxy participants; self-selected sample; a simplified prototype; comprehension questions test understanding of the demo, not real-world performance; voice via WhatsApp is not anonymous.
