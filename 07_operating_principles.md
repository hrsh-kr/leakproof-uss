# Operating Principles: four lenses, translated into rules for this project

Status: v1. Purpose: decide how we work, what we show, and how we ask for feedback, in a way that is simple, user-first and still rigorous enough for the course.
These are our own paraphrases of well-known ideas from Steve Jobs, Paul Graham, Peter Thiel and Alex Hormozi, applied to a course project. They are tools for decisions, not authorities.

## 1. The four lenses in one line each

| Lens | Core idea we take | Course tie-in |
| --- | --- | --- |
| **Jobs** | Start from the experience a person has and work backwards to the technology. Simplicity comes from saying no. Show it working, do not explain it. | Lecture 1: know the user; Lecture 4: design around mental models |
| **Graham** | Make something people want. Talk to users directly and early. Do things that do not scale, such as watching ten people use it. Write the way you talk. | Lecture 3: "listen, not talk"; think-aloud; contextual inquiry |
| **Thiel** | Have a sharp thesis: an important truth few people agree with. Aim for a 10x better answer, not 10% better. Start small and own it. | The brief asks what is new; our report needs a clear argument |
| **Hormozi** | Make the offer so valuable and the ask so cheap that people say yes. Value rises with the outcome and the likelihood, and falls with time and effort. Do many reps and count them. | Recruiting and feedback rates decide the quality of our data |

## 2. Rules we adopt

| # | Rule | Where it shows up |
| --- | --- | --- |
| 1 | **One idea per screen, one action per idea.** If a panel needs a paragraph to explain, cut the panel. | Demo page v0.2: four scenes, one control each |
| 2 | **Show it working before explaining it.** Detail lives behind "How it works". | Page: a disclosure under each scene |
| 3 | **The 60-second test.** A stranger must be able to explain the idea back in one sentence after one minute. We measure it. | Voice prompt "explain it back"; scored with a 3-point rubric |
| 4 | **Talk to people, do not only survey them.** Ten live sessions beat a hundred form clicks for finding what is wrong. | Plan: 5 watched sessions before Oct 4; interviews |
| 5 | **Ask about what people did, not what they would do.** "Tell me about the last time you handled a paper" beats "would you like this?" | Interview guides |
| 6 | **Make feedback nearly free.** One tap per scene, short typed answers, a booked chat for people who prefer to talk, no account or password, no long form. | Floating "Say what you think", voice note, 3-tap form |
| 7 | **Give something back immediately.** Every interaction returns a result the person can see. | Each scene responds instantly; respondents are offered the findings |
| 8 | **Write like you talk.** Short sentences, plain words, no buzzwords. | All page copy and reports |
| 9 | **Count the reps.** Track conversations, responses and sessions daily. | Scorecard in section 5 |
| 10 | **Close the loop in public.** Show "you said, we changed" so people see their effect. | Findings log and decision log feed the poster |

## 3. Thiel's seven questions, answered honestly for our project

| Question | Our answer today | Gap to close |
| --- | --- | --- |
| **The secret.** What important truth do few people agree with? | Leaks are mostly a handover problem, not a technology problem: the paper should not exist in readable form until the exam starts, and when it leaks anyway we should know where. | Evidence from interviews that insiders and handovers dominate (RQ2) |
| **Engineering.** Is it 10x better? | Today a leak can come from any of many handovers. Here no single person can read the paper and every copy is traceable. That is a change in kind. | Show with simulation that exposure falls sharply (SIM-01) |
| **Timing.** Why now? | NEET-UG 2026 cancelled; a 2024 print-at-centre proposal not piloted; a 2024 law raised penalties. | None; keep the sources current |
| **Monopoly.** Can we start small and own it? | The five profiles are broad. Start the story on one exam type. | Decide an anchor (section 6) |
| **People.** Right team? | CS, hardware, design and cryptography skills in four people. | Name roles |
| **Distribution.** Who adopts it? | An exam authority, a state commission or a university exam cell. Universities are the easiest first user. | Interview an exam-cell contact |
| **Durability.** Does it last? | Controls are standard and replaceable; log and split key remain useful as threats change. | State limits (threat model) |

## 4. Hormozi's value equation, applied twice

Value rises with **dream outcome** and **likelihood of success**, and falls with **time delay** and **effort**.

**A. The ask we make of a person who gives feedback**

| Term | How we improve it |
| --- | --- |
| Dream outcome | They help stop exam leaks and see what changed because of them |
| Likelihood | The page works in front of them; they see their effect |
| Time delay | They see a result in seconds; feedback takes 30 seconds |
| Effort | Short typed answers; no account (just an email); works on a phone; contextual (the form already knows which scene) |

**B. The pitch to an exam authority (for the poster)**

| Term | Our claim, to be backed by evidence |
| --- | --- |
| Dream outcome | A paper that cannot be leaked from the press, courier or storeroom |
| Likelihood | Working demo, tested controls, simulation numbers |
| Time delay | Print at the centre one hour before; no shipping |
| Effort | Usable by non-technical staff, shown by think-aloud results |

## 5. The loop and the scorecard

    Show it working  ->  ask (typed, or a short chat)  ->  tag what we heard  ->  change one thing
         ^                                                              |
         +----------------------- show what changed ---------------------+

One metric above all: **can a stranger explain it back correctly after one minute?** Everything else serves that.

| Metric | Target by Oct 3 | Where recorded |
| --- | --- | --- |
| Watched sessions (think-aloud, one person at a time) | 5 | `research/primary/` |
| Interview conversations booked | 5 | `/admin` |
| Form responses (3 taps plus optional text) | 30 | form export |
| "Explain it back" correct (rubric 2 of 3 or better) | 70% or more | findings log |
| Changes made because of feedback | 5 | `logs/design_decisions.csv` |

## 6. Where the lenses pull against each other, and what we do

| Tension | Resolution |
| --- | --- |
| Thiel says start small; our scope has five exam profiles | The engine stays general (course needs breadth). The story, poster and demo anchor on one exam type. **Proposal: anchor on NEET-style single-shift paper exams.** Confirm. |
| Jobs says say no; the brief wants the whole pipeline | The tool shows the whole pipeline. The demo page shows four scenes and hides detail. |
| Graham says do things that do not scale; the course wants numbers | Do both: ten live sessions for insight, a short form for counts (one-tap comments stay anonymous). |
| Hormozi says lower the effort; the course wants consent and rigour | Consent is one short line on the first screen. Every question can be skipped except the few we need. |
| Speed versus testing | Tests are not optional. The page keeps its logic tests; the UI is checked in a browser each change. |

## 7. Apple-style design, concretely

- White space and one accent colour; text does the work, decoration does not.
- A headline of one sentence; a line of support in grey.
- One control per scene; the result updates as you touch it.
- Detail by progressive disclosure, never by default.
- System fonts, large type, large touch targets, works on a phone first.
- Respect light and dark, reduced motion and keyboard use.

## 8. Privacy of feedback (course requirement)

Collect only what we need. The 12-minute review asks for an email so we can tie each review to a person (credit, swaps, follow-ups; see D18). Name, email and contact details are stored apart from answers and never appear in reports or public results. One-tap comments stay anonymous. Public results hide groups under 5. Delete raw data after the final report. (Voice dictation was tried and switched off; see decision D17.)
