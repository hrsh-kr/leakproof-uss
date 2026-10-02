# Remote Usability Test (the Review page)

Status: v2, live on the site at `/review` (and `/interview` for people who only want a chat). Source of truth for every question: `site/src/js/survey-def.mjs` (the page and the server both read it). The table at the end is generated from that file.
Supersedes `survey_after_prototype.md` (the earlier Tally plus voice plan).

## 1. Who we ask, and why them

First participants are **classmates** in Usable Security and Privacy: reachable in the three days we have, and they already know the vocabulary (consent, think-aloud, critical incidents, mental models). They also gain from taking part: the course gives **1% for every five studies**, so a participation receipt is part of the design. We also invite other students, faculty, TAs and people who help run exams. We say in the report that most participants are stand-ins for real setters and centre staff.

## 2. The context a first-time viewer gets (so nothing is ambiguous)

The first screen says, in plain words:
- **Who we are** and what we are building, in one sentence.
- **What you will do:** four small working prototypes, one task each, then a few questions; about 12 to 15 minutes; phone or laptop.
- **That we test the design, not them.** No wrong answers; honest criticism helps most.
- **What we collect:** answers, task times, tap counts; no name unless they add one for credit; names and contact are stored apart from answers; used only for the course project and quoted without names.
- **What they get:** a participation receipt, and how it counts (1% per five studies; ask the TA how to log it).
- A consent checkbox they must tick to start.

## 3. How we ask (rules)

From Lecture 3 and outside practice for unmoderated tests:
1. **Tasks have a scenario, a goal and an end line**, plus a two-minute guide and a way to say "I'm stuck, skip". We tell people what to do, not how.
2. **One thing per question**, neutral wording, no leading ("how much did you like" is avoided).
3. **Comprehension questions have one correct answer**, so we measure understanding and not only opinion.
4. **Critical incidents use the Lecture 3 format:** what were you trying to do, what did you expect, what happened. Participants then say how much it got in the way, which we recode to severity 0 to 4.
5. **Open questions are typed.** Browser dictation was tried and switched off: it depends on the browser vendor's speech service and failed in a real test ("speech service is not reachable"). People who would rather talk book a chat instead.
6. **Optional wherever we can.** Only the questions we need are required. After the main part, people choose whether to give four more minutes.
7. **Short.** About 12 to 15 minutes for the main path, within the 15 to 30 minute guidance for remote tests.
8. **Mixed measures:** completion, time, taps, ratings and comments together.

## 4. Flow and time budget

| Step | About | What it gives us | Ties to |
| --- | --- | --- | --- |
| Context and consent | 1 min | Informed consent in plain words | Lecture 3 consent elements |
| About you | 0.5 min | Role, exams, device | Splits results by role |
| Before anything | 2 min | Where they think leaks happen; trust; acceptance of print-at-centre; their own account of how a paper travels | Mental models (Lecture 4), RQ3, RQ4, RQ6 |
| Four tasks, each with 3 to 6 follow-up questions | 8 min | Completion, time, taps, ease (7-point), comprehension, stuck moments, fairness worries | Lecture 3 task design and critical incidents; RQ5 |
| Overall impression | 2 min | Explain-it-back, 2-item usability score, trust and acceptance again, hardest task, what to change first | Lecture 1 satisfaction metric; RQ6 |
| Optional: design choices | 2 min | Agree, unsure or disagree on five decisions, with why | Decision log D1 to D17; course style "justify choices" |
| Optional: think like the operator | 2 min | Where a person running it might fail (Lecture 1 six questions), what is missing | Human in the loop (Lecture 1), RQ2 |
| Finish | 1 min | **Interview call-to-action:** yes or no; if yes, which time slots (IST), how to talk, and how to reach them; optional name for credit; then the receipt | Participation credit; interviews (studies B to E) |

## 5. What we measure, and how we judge it

| Measure | From | Rule we set before seeing data |
| --- | --- | --- |
| Comprehension per task | one multiple-choice question each | Below 70% correct: redesign that scene and log the change |
| Task completion | finished vs skipped | Report per task; below 80% prompts a look at the incident comments |
| Time on task | measured by the page | Report the median; compare to the two-minute guide |
| Ease | single ease question, 1 to 7 | Report the mean; below 5 prompts a look |
| Usability score | 2 items (usability, features), 1 to 7 | Report mean and spread |
| Acceptance of print-at-centre | before and after, 1 to 5 | Decision D1 is revisited if fewer than half rate it 4 or 5 |
| Trust | one item after, 1 to 5 | Report; compare with the "before" trust item |
| Explain it back | open answer | Coded by the team: 1 point each for (a) locked and needs several people, (b) many writers or late draw, (c) traceable copies or tamper-evident log. 2 of 3 counts as understood. Target 70% |
| Critical incidents | open answer plus slowdown rating | Coded into findings with severity 0 (not a problem) to 4 (catastrophic); recurring ones become requirements |
| Design-choice votes | five agree/unsure/disagree items | A decision is revisited if fewer than half agree |
| Mental models | where leaks happen; own account | Compared with the incident evidence |

Public results show numbers only when 5 or more people contribute. Free text is never shown publicly; the team codes it into `logs/findings.csv`.

## 6. Privacy and ethics

Data minimisation (no name or email unless the person chooses); contact and name stored separately; group results hidden under 5 people; no third-party scripts or trackers; storage in a private database; admin export protected by a key; deletion of raw data after the final report. Ask the TA whether a consent sheet is enough or ethics approval is needed.

## 7. Pilot before sharing widely

- [ ] Two people complete it on a phone and a laptop; timed
- [ ] A test submission appears in `/admin`; then delete test data
- [ ] The receipt appears and copies
- [ ] The question wording is not misread; fix and note changes in `logs/design_decisions.csv`

## 8. Appendix: every question, generated from the survey definition

| Section | Id | Type | Required | Question | Options or scale |
| --- | --- | --- | --- | --- | --- |
| Before you start | `consent` | consent | yes | I have read this and I agree to take part. I know I can stop at any time. |  |
| About you | `role` | single | yes | Which describes you best? | A student in this course / A student, not in this course / Faculty or a TA / Someone who helps run exams / Something else |
| About you | `exams` | multi | no | Which exams have you taken or helped run? | NEET / JEE / CUET / UGC-NET / State PSC or police recruitment / SSC or Railways / University exams / None of these |
| About you | `device` | single | yes | What are you using right now? | A phone / A laptop or desktop / A tablet |
| Before you see anything | `leakwhere` | multi | yes | Where do you think an exam paper is most likely to leak? | While the questions are written / At the printing press / During transport / In storage at the exam centre / Inside the exam hall / After the exam is over / I do not know |
| Before you see anything | `trust_before` | scale | yes | How much do you trust that exam papers stay secret until the exam? | 1 Not at all to 5 Completely |
| Before you see anything | `accept_before` | scale | yes | How acceptable would it be if the paper were printed at the exam centre shortly before the exam, instead of arriving already printed? | 1 Not acceptable to 5 Fully acceptable |
| Before you see anything | `model` | text | no | In your own words: what happens to a paper from the time it is written until it reaches the candidate? |  |
| Four short tasks | `t1` | task | no | Task 1 of 4: A few leaks | Scene 1, 120s guide. An exam board has 20 question setters. A few of them leak their questions. Goal: Find out roughly how much of the paper is exposed when 5 setters leak. Done when: You are done when you can say how many of the 15 questions on the paper are known to the leakers. |
| Four short tasks | `t1_check` | single | yes | Five setters leak their questions. Which is closest to right? | Only the leaked questions that happen to be drawn onto the paper, usually a minority **(correct)** / All 25 of their questions are on the paper / The whole paper is exposed / It makes no difference / Not sure |
| Four short tasks | `t1_seq` | scale | yes | Overall, this task was… | 1 Very difficult to 7 Very easy |
| Four short tasks | `t1_stuck` | single | yes | Did you get stuck or confused at any point in this task? | No / Yes |
| Four short tasks | `t1_incident` | text | shown if t1_stuck = yes | Tell us about that moment. |  |
| Four short tasks | `t1_slow` | single | shown if t1_stuck = yes | How much did it get in your way? | A little: I noticed it but carried on / Some: it slowed me down / A lot: I nearly gave up / I could not complete the task |
| Four short tasks | `t2` | task | no | Task 2 of 4: The locked paper | Scene 2, 120s guide. The paper is locked. Its key is split among five key holders. Goal: Unlock the paper. Done when: You are done when the sample questions appear. |
| Four short tasks | `t2_check` | single | yes | Two of the five key holders approve. What happens? | The paper stays locked **(correct)** / It opens slowly / It opens partly / Not sure |
| Four short tasks | `t2_seq` | scale | yes | Overall, this task was… | 1 Very difficult to 7 Very easy |
| Four short tasks | `t2_stuck` | single | yes | Did you get stuck or confused at any point in this task? | No / Yes |
| Four short tasks | `t2_incident` | text | shown if t2_stuck = yes | Tell us about that moment. |  |
| Four short tasks | `t2_slow` | single | shown if t2_stuck = yes | How much did it get in your way? | A little: I noticed it but carried on / Some: it slowed me down / A lot: I nearly gave up / I could not complete the task |
| Four short tasks | `t2_why` | text | no | Why do you think the system needs several people instead of one? |  |
| Four short tasks | `t3` | task | no | Task 3 of 4: A leaked photo | Scene 3, 120s guide. A photo of a page appears online. It shows only the top question. Goal: Find out which seats could be the source of that photo. Done when: You are done when you can say how many seats could match. (Choose "Top question only" in the prototype.) |
| Four short tasks | `t3_check` | single | yes | A photo of one complete page leaks. What can the system tell? | Which seat it came from, or a short list of seats **(correct)** / The name of the person who posted it / Nothing / Not sure |
| Four short tasks | `t3_seq` | scale | yes | Overall, this task was… | 1 Very difficult to 7 Very easy |
| Four short tasks | `t3_stuck` | single | yes | Did you get stuck or confused at any point in this task? | No / Yes |
| Four short tasks | `t3_incident` | text | shown if t3_stuck = yes | Tell us about that moment. |  |
| Four short tasks | `t3_slow` | single | shown if t3_stuck = yes | How much did it get in your way? | A little: I noticed it but carried on / Some: it slowed me down / A lot: I nearly gave up / I could not complete the task |
| Four short tasks | `t3_fair` | scale | yes | Every candidate gets the same questions in a different order. How fair is that? | 1 Very unfair to 5 Very fair |
| Four short tasks | `t3_worry` | multi | no | Which worries would you have about different orders? | Some orders might be harder / Answer keys could be wrong / It could make cheating look easier / It is confusing for invigilators / No worries |
| Four short tasks | `t4` | task | no | Task 4 of 4: The activity log | Scene 4, 120s guide. Someone with access wants to change a record without being caught. Goal: Find out whether they can get away with it. Done when: You are done when you can explain what gives the change away. |
| Four short tasks | `t4_check` | single | yes | Someone edits a record, then recomputes the log's fingerprints so it looks consistent. What still gives it away? | The last fingerprint no longer matches the one published earlier **(correct)** / The log refuses to save / Nothing; it cannot be detected / Not sure |
| Four short tasks | `t4_seq` | scale | yes | Overall, this task was… | 1 Very difficult to 7 Very easy |
| Four short tasks | `t4_stuck` | single | yes | Did you get stuck or confused at any point in this task? | No / Yes |
| Four short tasks | `t4_incident` | text | shown if t4_stuck = yes | Tell us about that moment. |  |
| Four short tasks | `t4_slow` | single | shown if t4_stuck = yes | How much did it get in your way? | A little: I noticed it but carried on / Some: it slowed me down / A lot: I nearly gave up / I could not complete the task |
| Your overall impression | `explain` | text | yes | In one or two sentences, explain to a friend what this system does. |  |
| Your overall impression | `umux1` | scale | yes | The features would meet what I need from a secure exam system. | 1 Strongly disagree to 7 Strongly agree |
| Your overall impression | `umux2` | scale | yes | The prototype is easy to use. | 1 Strongly disagree to 7 Strongly agree |
| Your overall impression | `trust_after` | scale | yes | A system like this would make me trust exam security more. | 1 Strongly disagree to 5 Strongly agree |
| Your overall impression | `accept_after` | scale | yes | How acceptable is printing the paper at the exam centre shortly before the exam? | 1 Not acceptable to 5 Fully acceptable |
| Your overall impression | `hardest` | single | yes | Which task was hardest to follow? | Task 1: A few leaks / Task 2: The locked paper / Task 3: A leaked photo / Task 4: The activity log / None of them |
| Your overall impression | `change` | text | no | What would you change first? |  |
| Our design choices: your verdict | `d_pool` | decision | no | Many setters write a few questions each; a program draws the paper late. |  |
| Our design choices: your verdict | `d_pool_why` | text | no | Why? (optional) |  |
| Our design choices: your verdict | `d_split` | decision | no | Several people (3 of 5) must approve before the paper opens, instead of one administrator. |  |
| Our design choices: your verdict | `d_split_why` | text | no | Why? (optional) |  |
| Our design choices: your verdict | `d_print` | decision | no | The paper is printed at the centre shortly before the exam, instead of being shipped already printed. |  |
| Our design choices: your verdict | `d_print_why` | text | no | Why? (optional) |  |
| Our design choices: your verdict | `d_order` | decision | no | Every candidate gets a different order of questions and options. |  |
| Our design choices: your verdict | `d_order_why` | text | no | Why? (optional) |  |
| Our design choices: your verdict | `d_log` | decision | no | Every action is written to a tamper-evident log. |  |
| Our design choices: your verdict | `d_log_why` | text | no | Why? (optional) |  |
| Think like the person running it | `hitl` | multi | no | Where might things go wrong for that person? Pick up to two. | They might not realise they have to do it / They might not understand what the screen asks / They might not know how to do it / They might not be motivated to follow every step / They might not be able to (device, power, time) / They might skip steps under pressure |
| Think like the person running it | `missing` | text | no | What is missing? What would you add or remove? |  |
| One last thing | `followup` | single | no | Would you be up for a short follow-up call (20 to 30 minutes)? | Yes, let us find a time / No, thank you |
| One last thing | `c_slots` | multi | if followup = yes | When could you talk? Pick every slot that works. | Sat 3 Oct, 10 am to 1 pm / Sat 3 Oct, 2 pm to 5 pm / Sat 3 Oct, 6 pm to 9 pm / Sun 4 Oct, 10 am to 1 pm / Sun 4 Oct, 2 pm to 5 pm / Mon 5 Oct, 6 pm to 9 pm / Later in the week (I will say when below) |
| One last thing | `c_when` | text | shown if followup = yes | Another time that suits you better? (optional) |  |
| One last thing | `c_mode` | single | if followup = yes | How would you like to talk? | Video call (Google Meet) / Phone call / WhatsApp call / In person, on campus |
| One last thing | `c_contact` | text | if followup = yes | How can we reach you? |  |
| One last thing | `c_name` | text | no | Your name, if you want us to be able to confirm you took part. |  |
