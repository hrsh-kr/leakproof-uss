# A2 (Graham-style lens): make one thing wanted, by one person, in 5 days

Role-played lens, not the real person.

You have tested crypto and a good Phase I. What you lack is a thing a human can use. Five days is plenty for one flow done well, and nowhere near enough for eight roles.

## (a) The single user, and the unscalable move

| Option | Who | Pros | Cons |
|---|---|---|---|
| 1 | **The exam admin** running one whole exam end to end | They touch every stage, so the demo and guide write themselves | They are also the most overloaded role |
| 2 | **The centre superintendent** at unlock time | The moment of pressure is where Phase I said people fail | Needs the rest built first |
| 3 | **The setter** | Simplest screen | Boring, and security-light |

**Pick 2, built on top of a thin 1.** The superintendent has a quorum, a clock, a seating report and a hall of students waiting. If that screen works for someone who has never seen it, the product is real.

**Unscalable move:** by Saturday, put 3 classmates in a room, give them roles, and run one real mock exam on the VM. One person plays superintendent and has only the user guide. Watch them. Don't help. Write down every place they freeze. Do it again Sunday with different people. Nothing you can build beats that.

## (b) Fake work and premature work (blunt)

- **The Python/FastAPI rebuild.** `tool/` is empty and the JS code has 170 passing tests. Rewriting is a way of feeling busy. Keep Node.
- **Eight roles and a full permission matrix.** Five roles are in doc 09. Ship three screens: admin, key-holder, superintendent. Setter and auditor can be thin pages or scripted.
- **The B0-B13 build order and the AB-xx catalogue as a checklist.** It was written for a longer timeline. Treat it as a menu, not a to-do list.
- **Perfecting the abuse catalogue before anyone attacks.** Classmates will write a better one for free.
- **Polish on the poster and slides now.** Phase II is code and guide first.
- **Real key ceremonies, hardware tokens, HSM talk.** Simulate and say so.

## (c) The 18-25 Nov window is a gift

You get 8+ unpaid pen-testers and usability testers for a week. Treat it as the product's launch, not the end.

1. **A feedback inbox:** one form or shared sheet, with fields for what they did, what they expected and what happened.
2. **A daily fix cycle:** triage each evening, patch, redeploy. Version the executable.
3. **Log every report as evidence:** class of bug, cause, fix, lesson. That is Part B of the video, already written.
4. **Make attacking easy:** a documented test account, a reset button, a seeded exam. Reduce the friction for anyone attacking you.
5. **Let them find real bugs.** Fix a few visibly. Don't hide the fixes; they make the story.

## (d) Biggest likely mistake

Building breadth (roles, database, auth, features) and arriving on the 17th with something nobody can drive. Then spending the test week on "how do I log in" tickets instead of security findings.

**Pushback:** cut until one exam runs from draw to unlock to print to log, with real login, for three roles, on the VM, by Friday. Get the VM up **today**, because every other schedule slips behind it. Deploy to it daily so you never face a "first deployment" on the 17th.

## Recommendation

Option 2 on a thin option 1. Node stays. Three roles. Daily deploy. Two mock exams with real people before the 17th.

**Biggest risk:** the VM or its network turns out to be harder than expected, so a working local app ends up unreachable by testers.
