# Security change log: v1.0.3 → v1.1.0-hardened → v1.2.0 → v1.2.1 (16 Nov 2026)

Every change below records **what the previous pipeline or feature was**, **how it was modified**, **why**, and **what changed in security**. The rule for every entry: security only goes up. Where a change could look like a loss (less logging, fewer options), the entry says why it is not.

Baseline: the code that was live on 16 Nov (`/srv/leakproof/releases/v1.0.3`, built from a hand-made tarball, not from git). The git `main` branch holds the older 3-of-5 design and was **not** used.

How each fix was proven:
- **Proof of concept first.** Before any change, an attack script ran against v1.0.3. All 7 attacks (F1–F7) succeeded. After the changes, all 7 fail. F8 was already blocked and stays blocked.
- **Regression tests.** `tests/round6.test.mjs` has 10 tests that failed on v1.0.3 and pass now. The full suite is 117 of 117 (it was 107 of 107 before; existing tests were updated only where they encoded removed behaviour).
- **Browser dry run.** Real Chrome (headless) drives every role and every Back/Forward path: 42 of 42 checks pass, with no JavaScript errors.
- **Demo-pod dry run.** Three pods built with the new `demo-setup.sh` are driven end to end through every account: 50 of 50 checks pass.
- **Upgrade test.** A v1.0.3-era database is upgraded in place. Class codes are added, the 69-entry log chain stays intact, health is ok, and a second start changes nothing.

---

## Part A: Security fixes

### C1. Joining an exam needs that exam's class code (critical)

| | |
|---|---|
| **Before** | A TA or student signed up with only the role's course code (`LP-TA-G19` / `LP-STU-G19`, printed in the public guide). The server put them in **the newest practice exam of anyone** that was still collecting questions. |
| **Attack (proven, F1–F3)** | **F1:** a stranger signs up as a student, lands in a victim professor's exam, and reads the **whole paper** the moment it opens. **F2:** an attacker signs up as a professor; every TA and student who signs up after that lands in the attacker's exam instead of their real one. **F3:** a stranger TA injects questions into a victim's exam. |
| **After** | Each exam gets two random class codes: one for TAs (`TA-XXXXX-XXXXX`) and one for students (`ST-XXXXX-XXXXX`), 50 bits each. A TA or student must give the right code for their role. The code decides the exam; "the newest exam" is gone. A TA can join only while questions are collected; a student only until release. The professor sees the codes on the Professor tab and can **make new class codes** (old ones die at once; logged as `class.codes_changed`). Exams created before this change get codes at start-up. |
| **How** | `src/exam.mjs` adds `setCodes`, `classCodes`, `rotateCodes` and `findByClassCode`. In the database, each code is stored encrypted under the server key (`join_box`), plus an HMAC of it under the server key (`join_ta_h` / `join_st_h`) so the server can look it up without decrypting every exam. `src/app.mjs`: the sign-up handler is rewritten and a new route `POST /api/exams/:id/class-codes` is added (professor only, rate-limited). `src/db.mjs`: an additive migration. `public/app.js`: a Class code field on sign-up and a Class codes card on the Professor tab. |
| **Why these choices** | The code is per exam *and* per role, so a leaked student code cannot make a TA. 50 bits behind the existing sign-up limit (30 per minute per network) cannot be guessed. Codes are encrypted at rest, so a stolen database alone does not give them away. A wrong code is answered exactly like a missing code. I deliberately did **not** add a per-network lockout on wrong codes: it would let one attacker on a shared campus network block a whole class from signing up, and it adds nothing against guessing at 50 bits. |
| **Security change** | ↑ Exams are isolated from each other. A stranger can no longer read, flood or poison another exam. Codes never appear in the public log, the screen of a TA or student, or plaintext storage (tested). |
| **Tests** | `R6-C1` ×4 (stranger refused, wrong role code refused, joining closes on time, new codes kill old ones, codes never public, start-up back-fill keeps the chain intact) |

### C2. A student sees only their own seat's copy (replaces the plain-order paper)

| | |
|---|---|
| **Before** | `GET /api/exams/:id/questions` gave a student **the whole paper in its original order**, with no seat, no copy id, and no log entry. |
| **Attack (proven, F4)** | A student screenshot or copy-paste of the paper leaks the exam and **traces to nobody**: the seat-specific ordering, the system's main leak defence, is bypassed, and nothing is logged. |
| **After** | A student gets **one seat**, the lowest free one, the first time they open the paper. It never changes or passes to another student. They see exactly that seat's copy: its own question order, option order and copy id, identical to the printed copy of that seat. If every seat of the release is taken, the student is refused instead of sharing a seat. Viewing is logged as `copy.viewed`: the first 3 views per student, like reprints. The public entry **does not** carry the seat or the student. |
| **How** | `src/exam.mjs`: `allQuestions` is removed and `studentCopy` added. A new table `student_seats(exam_id, account_id, seat UNIQUE per exam)` holds the assignments. New route `GET /api/exams/:id/my-copy` (student only); the old route is now TA-only. `public/app.js`: a "My exam copy" tab. |
| **Security change** | ↑ A student leak now names a seat, exactly like a printed copy (`Trace a leak` was tested on a student's copy). ↑ Student access is now audited. No answers are ever included (tested). |
| **Tests** | `R6-C2`, `R6-C7`, demo dry run "a student leak traces to that student's seat" |

### C3. Sign-up starts no session; Back/Forward cannot skip the "I saved it" step (reported bug 1)

| | |
|---|---|
| **Before** | Sign-up created the account **and logged the browser in** at once. The passphrase page was only a screen on top, so the browser's **Back** button skipped it and landed the user logged in without saving the passphrase or recovery code (exactly as reported). The same page after **Forgot your passphrase** and **Change passphrase** could also be left with Back. After a change, the only copy of the new passphrase and recovery code is lost, and the account is locked for good. |
| **After** | (1) **Server:** sign-up returns the secrets but **no cookie**. The browser logs in with the new passphrase only when the user presses **Continue** (after Copy or Download, then the tick box). (2) **Browser:** while secrets are on screen and not yet saved, every in-app navigation (Back, Forward, header links, typed `#/…` addresses) is undone and the secrets page stays. Leaving the site (closing the tab, Back past the first page) shows the browser's "Leave site?" prompt. (3) After Continue, the page is **replaced** in history, so Back cannot return to it. The same applies to login (Back does not return to the filled-in login form). (4) Recovery also starts no session (it never did; now tested). |
| **How** | `src/app.mjs`: the sign-up handler no longer sets a cookie. `public/app.js`: `secretsShown` guard (`S.secrets`) checked first in `routeInner`, `beforeunload` while unsaved, and `goReplace()` for every post-secret navigation. |
| **Security change** | ↑ No session exists until the user has taken possession of the credential. ↑ No path leaves a user logged in without their secrets, or locked out after a passphrase change. |
| **Tests** | `R6-C3`, `SR2 sessions` (asserts no cookie at sign-up); browser `B1` ×11, `B11` ×2, `B12` ×4 |

### C4. Back button, logout and browser caching (reported item 1: "check every back/forward functionality")

| | |
|---|---|
| **Before** | (a) Logging out cleared only the current tab. Copy tabs and **answer-key tabs** opened with window.open stayed on screen with the paper or the key. (b) The app was served with `Cache-Control: no-cache`, which lets the browser store it and restore an old page from its **back/forward cache** after logout. (c) The `#/exam/<id>`, `#/copy/<id>/<seat>` and `#/key/<id>/<seat>` addresses were pasted straight into API paths, so a hand-made link such as `#/exam/..%2F..%2Fme` became a different API call. (d) After a timeout, login sent the user to **any** saved address. |
| **After** | (a) Logout (and a session that ends) clears the page and signals every other LeakProof tab in that browser, through a storage event. Those tabs wipe themselves (the paper, the key, the class codes) and go to Log in. (b) Static files are served `no-store`; a page restored from the back/forward cache is reloaded so the session is checked again. (c) Ids are checked against `^[0-9a-f]{32}$` and seats against `^[1-9]\d{0,3}$` before any request; anything else shows "Not found". (d) Login returns only to an exam, copy or key address. (e) The practice banner hides on logout. |
| **Security change** | ↑ On a shared lab computer, the next person cannot press Back, or look at a left-over tab, to see a paper, an answer key, a key card or class codes. ↑ No client-side path manipulation. |
| **Tests** | `R6-C6`; browser `B7`–`B10`, `B13` ×5 |

### C5. Public log: no flooding, nothing hidden (reported item 2: "check the entire public log")

| | |
|---|---|
| **Before** | (a) The public log showed only the latest 200 entries, with no way to see older ones. (b) A TA could submit and delete questions in a loop, writing two public entries per round, **without any limit**. (c) The public log endpoint had only the general rate limit. |
| **Attack (proven, F6)** | A TA (and under C1, any stranger) floods an exam's log so `exam.created`, `exam.sealed` and every earlier entry drop out of public view, and the database grows without bound. |
| **After** | (a) `GET /api/public/log/:id?before=<seq>` pages back to the very first entry; the log page has **Show older entries**. (b) A TA can delete at most **20 questions per exam**. Since there is one question per topic, a TA writes a bounded number of entries. (c) The public log endpoint now uses the `public` rate-limit bucket (60 per minute per network). |
| **Checked from each side (item 2)** | **Professor:** every action is logged; the chain stays intact. **TA:** can no longer reach another exam's log (C1) or flood their own. **Student:** views are logged without seat or name (C2). **Anonymous:** sees no usernames, display names, actor ids, question text, class codes, passphrases or key shares. The copy-footer hash check works for a student's copy too. Tested with all three roles acting in one exam (`R6-C7`) and in the browser (`B14`). |
| **Security change** | ↑ Auditability: every entry is reachable. ↑ Availability: log growth per TA is bounded. |
| **Tests** | `R6-C4`, `R6-C5`, `R6-C7`; browser `B14` ×4 |

### C6. Lockout table cannot be wiped by flooding

| | |
|---|---|
| **Before** | The table of failed logins (per username and network) was **cleared completely** once it held 50,000 keys. |
| **Attack** | Fail 50,000 times with made-up usernames, and every brute-force back-off for every real account resets. |
| **After** | Only the oldest entries are evicted, one at a time. A key that is still being attacked moves to the end, so it is evicted last. |
| **Security change** | ↑ The back-off on real accounts survives a flood. |

### C7. Demo pods and the official exam could never be sealed

| | |
|---|---|
| **Before** | The app (v1.0.3) needs **exactly one** key card (the professor's). But `demo-setup.sh` created 8 accounts per pod with **5** key holders, and `scripts/official-setup.mjs` **required** 5 key holders. Sealing then fails with "The professor key holder must be assigned before sealing (now 5)". So none of the 3 demo pods could ever be sealed, and **the official exam on 25 Nov could not have been set up to work.** |
| **After** | `official-setup.mjs` accepts only the three roles (professor = run+print+hold, TA = submit, student = attempt) and exactly one professor; anything else is refused before anything is created. `demo-setup.sh` builds 3 pods × 5 accounts with clear role names: `podN-professor`, `podN-ta-1`, `podN-ta-2`, `podN-student-1`, `podN-student-2`. `deploy/official.example.json` follows the same model. |
| **Security change** | ↑ Availability of the pipeline itself. ↑ A mis-typed role file can no longer create a holder with no role, or a second key holder. |
| **Tests** | `R5-S14` (updated: refuses two holders, a bare holder, and no professor), `Y6`; demo dry run 50/50 |

### C8. Releases must never carry keys or databases

| | |
|---|---|
| **Before** | v1.0.1, v1.0.2 and v1.0.3 were built from hand-made tarballs (made on a Mac). Each release folder under `/srv/leakproof/releases/` contains `data/dev-practice/` with **`server.key`, `log.key` and a full database**, readable by every user on the server (`-r--r--r--`), plus `._*` macOS metadata files. `make-package.sh` refuses such files, but `release.sh --tarball` did not check. |
| **After** | `release.sh` deletes `._*` files, and **refuses to deploy** any archive that contains `*.key`, `*.db*`, `*.env` or a `data/` folder. The empty `dev.db` is removed from the source. |
| **Still to do on the server (needs you)** | The three old release folders still hold those files. See "Actions for the operator" at the end. |
| **Security change** | ↑ No key or database can reach a world-readable release again. |

### C9. Static files: `no-store`

Covered in C4(b). The responses are a few KB, so the performance cost is negligible.

---

## Part B: Removed features (each checked three times)

Three-pass recheck, for every item:
1. **Pass 1, references:** a search of the whole tree, docs included, finds no code that still calls it.
2. **Pass 2, tests:** the full suite passes without it (117 of 117).
3. **Pass 3, behaviour:** the browser and demo dry runs, covering every role, pass without it.

| # | Removed | Why it was not needed | Security effect | Pass 1 / 2 / 3 |
|---|---|---|---|---|
| R1 | Student route that returned the whole paper in plain order (`allQuestions`) | Replaced by the student's own seat copy (C2) | ↑ It was an untraceable, unlogged leak path | no references / 117 ok / B6, demo "own seat copy" |
| R2 | The old course code `USS-PRACTICE`, and sign-up without a role (it made a professor) | The guide and UI use the three role codes; it was a fourth, undocumented way in | ↑ One fewer valid code; every sign-up states its role | only docs mention it (updated) / ok / B1 |
| R3 | "All my cards" bulk screens (create, verify and approve several cards from one file) | One key card per exam since v1.0.3; the screen needs 2 or more unverified cards, which can no longer happen | ↑ Less unreachable code holding key material | no references / ok / B5 |
| R4 | `deploy/accounts.sh` (installed as `lp-accounts`) | It runs `scripts/accounts.mjs`, which was never shipped; `docs/HANDOFF.md` already said "delete both". `release.sh` now removes the stale `/usr/local/sbin/lp-accounts` | ↑ No broken root-run tool on the path | release.sh only / ok / n.a. |
| R5 | `dev.db` (empty file in the release root) | Development leftover | Neutral (hygiene) | none / ok / n.a. |
| R6 | 3-of-5 wording left on screen ("key holders", "Exam cell", "Quorum reached", "Locked until 4 of 5…", "Setters") | Wrong since the 1-of-1 model; it confused users about who approves | Neutral; clearer instructions mean fewer user mistakes | none in UI / ok / B1–B15 |

**Kept on purpose (looked at, not removed):**
- **Shamir split at 1 of 1.** It is mathematically just the key, but the card format, tests and verification depend on it. Removing it would be a risky crypto change for no security gain.
- **`install.sh --course-code`.** It no longer has an effect. Install has already run on this server, and removing the option could break someone's notes. It is documented in `install.sh`.
- **Logging of every answer-key view.** It is owner-only, and capping it would reduce the audit trail.

---

## Part C: Not changed, and why

- **The professor alone can open the paper.** This is the 1-of-1 design as stated in the guide. Going back to 3 of 5 is a design decision for the team, not a fix.
- **A class code that leaks lets that role join until joining closes.** Mitigation: Make new class codes, and (since round 7, D7) remove anyone who joined with it.
- **A photo of a screen or a printed copy cannot be prevented**, only traced. That is now true for student copies too.
- **The official instance stays off.** `enable-official.sh` is unchanged.

---

## Part D: Actions for the operator (not done automatically)

1. **Deploy** this release to practice and demo (it restarts both, so open papers lock again).
2. **Rebuild the demo pods** with the new 5-account roles: `sudo bash deploy/demo-setup.sh --force`. This makes **new passphrases**; repost `/etc/leakproof/demo-credentials.md`.
3. **Remove the key and database leftovers** from the old release folders: `/srv/leakproof/releases/v1.0.{1,2,3}/data`, and `._*` files. Then check whether those `dev-practice` keys equal any live key. They should not; if they do, rotate that instance's keys.
4. **Change the sudo password.** It was shared in a chat on 16 Nov.


---
---

# Round 7: attacker review of the round-6 build, and choose-your-own password (16 Nov 2026, v1.2.0; D11 in v1.2.1)

Same rules as above: for every change, the previous pipeline, how it changed, why, and what happened to security.

How each fix was proven:
- **Proof of concept first.** `poc7.test.mjs` (kept with the test evidence, not in `tests/`) attacked the round-6 build. 6 of 6 flaws reproduced: P1 NAT lockout, P2 untraceable student seat, P3 one seat printed and viewed online, P4 unbounded sessions, P5 no way to remove a stranger, P6 no audit of recovery, P7 IPv6 rate-limit bypass. After the changes P2, P4, P6 and P7 fail. P1 and P5 still "pass" only because their probes use a browser the account has never used and a made-up member id. D4 and D7 test the real cases.
- **Regression tests.** `tests/round7.test.mjs`: 14 tests. The full suite is **130 of 130** (117 before; old tests were changed only where they used the generated passphrase or the old seat rule).
- **Browser dry run.** Real Chrome drives every role. **62 of 62** checks pass (42 before), with no JavaScript errors. It covers:
  - the new password screens, their checklist and refusals
  - Back/Forward on every secret page
  - member removal
  - online seats
  - a trace that names a student
- **Demo-pod dry run.** Three pods built from `demo-setup.sh` are driven through all 15 accounts: **53 of 53** pass, including "a seat a student holds online cannot be printed".
- **CI gates.** The secret scan is clean; the test-citation gate finds 71 citations, 0 missing.

---

## Part E: Changes in round 7

### D1. People choose their own password (requested change), with strong-password rules

| | |
|---|---|
| **Before** | Sign-up, recovery and "Change passphrase" showed a **generated** passphrase (16 random characters, 80 bits) that people had to copy. The page pushed *Copy both* or *Download*, which wrote the passphrase into the clipboard or into a `leakproof-login.txt` file. |
| **Problem** | You can't remember a generated passphrase, so people stored it: in a downloaded text file in `Downloads`, the clipboard (readable by other apps and clipboard history), notes apps and chat messages to themselves. On shared lab computers, those copies outlive the session. A stolen file *is* the account. |
| **After** | The person types a password of their own twice. A live checklist shows the rules. The **server enforces the same rules**, so a request that skips the page is refused too. The password is never shown back, never sent back by the server, never put in a file or the clipboard by LeakProof, and stored only as a scrypt hash. Password-manager friendly (`autocomplete="new-password"`). The **recovery code stays generated** (60 bits), because it is a backup kept offline, not something to remember. It is now the only secret shown once. |
| **Rules** (`public/password-rules.js`) | <ul><li>12–128 characters.</li><li>At least 3 of lower case, upper case, digits and symbols, **or** 20+ characters (a sentence such as `my cat ate 3 green mangoes` is fine).</li><li>No runs like `aaaa`, `1234`, `abcd` or `qwer`, and at least 6 different characters.</li><li>Not a common password and not made only of common words. This is checked after undoing l33t and after dropping digits or symbols, so `P@ssw0rd2026!`, `Summer-Exam-2026` and `Leakproof2026!` are all refused. The list includes this site's own words: leakproof, iiitd, exam, professor, months…</li><li>Must not contain the username or a word of the display name.</li><li>No leading or trailing space, and no invisible characters.</li><li>Compared after Unicode NFC, so `Café` typed on any keyboard matches.</li></ul> |
| **How** | <ul><li>New `public/password-rules.js` (one file, imported by the page *and* by `src/app.mjs`; a test checks the served file is byte-for-byte the one the server uses).</li><li>`src/app.mjs`: `newSecrets(password)`, `mustBeStrong()`, `pwField()`.</li><li>`/api/register` requires `password` and returns only `{username, recovery, examId, role}`.</li><li>`public/app.js`: `newPasswordFields()` and rewritten sign-up, recovery and change pages. `secretsShown()` now shows only the recovery code, with the same Back/Forward guard as round 6.</li><li>The screen word for the login secret is now "password". "Passphrase" now means only the key-card passphrase, so the two are no longer confused.</li></ul> |
| **Why these choices** | <ul><li>Length plus a blocklist of what attackers try first (common passwords, site words, personal words) is what NIST SP 800-63B recommends.</li><li>Forced symbol mixes on their own mostly produce `Password1!`, so the mix rule is waived for 20+ character sentences, which are both stronger and easier to remember.</li><li>Rules run on the server because a page can be bypassed.</li><li>Recovery stays random because nobody needs to remember it, and a chosen "recovery answer" would be the weakest link.</li></ul> |
| **Security change** | **The one honest trade-off.** A chosen password has less entropy than 80 random bits, so an attacker who **stole the database** could guess some hashes offline faster than before. Offsets:<ul><li>scrypt (32 MiB per guess) is unchanged.</li><li>The rules remove the passwords that crack first.</li><li>Online guessing is now capped per account however many addresses an attacker uses (D4).</li><li>The biggest real-world risk of the old design is gone: copies of the passphrase lying in files, clipboards and notes.</li></ul>Net: ↑ against the attacks this course expects (stolen notes, shoulder-surfed files, online guessing); ≈ against a full database theft, which also needs the key files for anything beyond the hashes. |
| **Tests** | `R7-D1` ×2. 13 weak passwords are refused by the server: missing, short, common, l33t, site words, keyboard runs, repeats, username, display name, leading space, zero-width character, too long. The strong one works, nothing is sent back, the stored value is only a hash, and the NFC/NFD forms match. The page and the server use one rules file. Browser `B0` ×8. |

### D2. Change password: current + new; the recovery code stays

| | |
|---|---|
| **Before** | `POST /api/passphrase {current}`. The server generated a new passphrase **and** a new recovery code and showed both once. |
| **Problem** | A thief who learned the passphrase could change it **and** get a fresh recovery code. The owner's saved recovery code then stopped working, so the account was lost for good. |
| **After** | `POST /api/password {current, next}`; the old route is gone (404).<ul><li>The new password must pass D1 and differ from the current one.</li><li>**The recovery code is kept**, so the owner can always take the account back with it.</li><li>Other sessions end; this one stays.</li><li>Back-off on wrong current passwords works as before.</li><li>Only an operator-made account's first login (D10) gets a new recovery code.</li></ul> |
| **Security change** | ↑ Account takeover is recoverable by the owner. No secret is in the response. |
| **Tests** | `R7-D2` (old route 404, same password refused, weak refused, wrong current 401, `{ok:true}` only, other session ended, old password dead, the owner's recovery code still works after the change); browser `B11` ×5 |

### D3. Recovery: choose the new password; weak choices do not burn the code; recoveries are audited

| | |
|---|---|
| **Before** | The recovery code produced a generated passphrase. Nothing was written to the log. |
| **After** | `POST /api/recover {username, recovery, next}`.<ul><li>The new password is checked **before** the code is tried, so a weak choice costs nothing and the code stays valid.</li><li>On success, every session ends and a new recovery code is shown once.</li><li>`account.recovered` is appended to the tamper-evident log with no exam, so it never appears on a public page.</li></ul> |
| **Security change** | ↑ Recovery is in the audit trail. If someone used a stolen code, the operator can see it. |
| **Tests** | `R7-D3`; `FCS-G1` updated; browser `B12` ×7 (including the beforeunload guard) |

### D4. Nobody can lock the professor out; a botnet gets 20 guesses per account per hour

| | |
|---|---|
| **Before** | Wrong logins backed off per *username + network address*. |
| **Attack (proven, P1)** | On campus everyone shares a few NAT addresses. Anyone in the lab types the professor's username with 5 wrong passwords, and the professor (same address) gets "Too many wrong attempts" for up to 15 minutes, repeatable at exam time. The reverse was also possible: a botnet with many addresses got 5+ guesses **per address**, unlimited in total. That was harmless with 80-bit generated passphrases, but not with chosen passwords. |
| **After** | **Device trust** (the OWASP "device cookie" pattern):<ul><li>After a correct login, the browser gets `__Host-lp_dev`: HttpOnly, Secure, SameSite=Strict, 30 days. It holds the time plus an HMAC under the server key, **bound to that account**.</li><li>Wrong guesses from a trusted browser back off on their own key, so nobody else can lock the owner out.</li><li>All other browsers back off per username + network as before, **and** share one budget of **20 wrong passwords per account per hour**, whatever addresses they come from.</li><li>Unknown usernames have the same budget, so a 429 does not reveal whether an account exists.</li></ul> |
| **Why** | Neither lockout nor no-limit is acceptable for an exam: lockout is a denial-of-service on the professor, and no limit allows online guessing. Device cookies separate the owner from everyone else without CAPTCHAs or e-mail. |
| **Security change** | ↑ Online guessing is bounded per account, and the owner cannot be locked out from a browser they have used. Residual: on a *shared* lab computer the token stays after logout, so that browser keeps per-device back-off (5 tries, then exponential) instead of the per-account budget. It still cannot get in without the password. |
| **Tests** | `R7-D4` ×3 (NAT: owner logs in, stranger on the same address backs off; 20 guesses from 20 addresses, then even a new address is refused but the owner's browser works; unknown names behave the same; a token moved to another account or with a changed date is not trusted); the cookie flags test in `SR2 HTTPS mode` |

### D5. At most 5 sessions per account; expired sessions are swept

| | |
|---|---|
| **Before** | Every login inserted a session row. Expired rows were removed only when that exact cookie came back. |
| **Attack (proven, P4)** | One account logging in in a loop grows the `sessions` table without bound: 25 logins gave 25 rows. That is a disk and memory denial-of-service, and it also leaves forgotten live sessions behind. |
| **After** | Each login runs one transaction that does three things:<ol><li>Deletes every idle (>30 min) or old (>8 h) session.</li><li>Inserts the new session.</li><li>Keeps only the newest 5 for that account.</li></ol> |
| **Security change** | ↑ Bounded storage; fewer forgotten live sessions. Normal use (a laptop, a phone, a couple of tabs) is unaffected. |
| **Tests** | `R7-D5` (12 logins give 5 rows; expired rows are swept by the next login) |

### D6. IPv6 clients count per /64

| | |
|---|---|
| **Before** | Each IPv6 address was a separate client for every rate limit and the per-client socket cap. |
| **Attack (proven, P7)** | One host normally owns a whole /64 (2^64 addresses), so it could use a fresh address per request and skip every limit. |
| **After** | `ipKey()` in `src/http.mjs`: IPv4 (also `::ffff:a.b.c.d`) as is; IPv6 is reduced to its /64 prefix. It is used for X-Real-IP from Caddy and for direct sockets (`server.mjs`). |
| **Security change** | ↑ Rate limits hold over IPv6. Nothing changes for IPv4 clients. |
| **Tests** | `R7-D6` (expansion of `::`, brackets, mapped IPv4; six addresses in one /64 share one limit; another /64 does not) |

### D7. The professor sees every member and can remove a stranger

| | |
|---|---|
| **Before** | The professor could make new class codes, but could not see who had joined or remove anyone. |
| **Attack (proven, P5)** | A class code leaks (a group chat, a photo of the board). Strangers join as TA or student. New codes stop *more* people from joining, but the ones already in stay. A stranger TA's questions can still be drawn into the paper, and a stranger student reads the paper at release. |
| **After** | A **Members** card on the Professor tab, visible to the professor only:<ul><li>TAs with their question count, students with their online seat, each with display name and username.</li><li>**Remove** (two-click confirm). Access ends at the next request (404). A TA removed while questions are collected also loses every question they submitted, so nothing they wrote can be drawn.</li><li>A removed student keeps their seat on record, so a trace of that seat still names them (D8).</li><li>The professor and the simulated practice TA cannot be removed.</li><li>Logged as `member.removed {reason: ta \| student, count}`, with no names.</li></ul>New route `POST /api/exams/:id/members/:aid/remove`: professor (run) only, in the rate-limited sensitive bucket, CSRF-checked like every change. |
| **Security change** | ↑ A leaked code can be fully cleaned up: new codes stop new joiners, and Remove expels the ones already in. |
| **Tests** | `R7-D7` (list shown to the professor only; a TA cannot remove; removal ends access and deletes questions; the professor and the simulated TA cannot be removed; public log entry without names); `SR1` route matrix covers the new route; browser `B4` ×4 |

### D8. One seat, one copy; a trace names the student

| | |
|---|---|
| **Before** | Round 6 gave each student a seat copy, but the professor could not see which student held which seat. Printed copies used the same seat numbers, so seat 3 could be both a paper copy in the hall and a student's screen. |
| **Attack (proven, P2/P3)** | A student leaks a screenshot. Trace says "Seat 3". The professor cannot tell who that is, and if seat 3 was also printed, it may be someone else entirely. The trace is useless as evidence. |
| **After** | <ul><li>A seat number is **one copy holder**: a student is never given a seat already printed, and a seat a student holds is never printed (409). The print grid shows those seats as "online" and disabled.</li><li>**Trace** shows `Seat 3 · online copy of Meera Iyer (meera.i)` for student seats, or `printed copy` otherwise.</li><li>The Members card lists each student's seat.</li><li>Names appear only to the professor, never on the public log.</li></ul> |
| **Security change** | ↑ A leak is now traceable to a person, not just a number. Seats cannot collide. |
| **Tests** | `R7-D8` (printed seat skipped; student seat refused for printing; `onlineSeats`; trace names the student, also after the student is removed; no names in the public log); `R6-C2` and `R6-C7` updated for the new rule; browser `B6` ×3 |

### D9. Password hashing is capped at 32 at once

| | |
|---|---|
| **Before** | Every login, sign-up and recovery ran scrypt (32 MiB, ~60 ms) on Node's thread pool with no limit on how many waited. |
| **Attack** | A distributed login flood (many addresses, each under its own limit) queues thousands of 32 MiB hashes. Memory climbs, and a real login waits behind all of them, which is a denial-of-service at exam time. |
| **After** | At most 32 hashes run or wait at once. Beyond that the request gets **503 "busy, try again in a few seconds"** with `Retry-After: 5`, immediately and without hashing. |
| **Security change** | ↑ Memory used by hashing is bounded (~1 GiB worst case), and floods are refused quickly instead of slowing everyone. |
| **Tests** | `R7-D9` (exactly the requests over the cap are refused; hashing works again right after) |

### D10. Operator-made accounts (official exam) choose their password at first login

| | |
|---|---|
| **Before** | At first login, the operator-printed passphrase was exchanged for a generated one, which again had to be copied. |
| **After** | Official setup still prints a generated first password and recovery code on the slip (it has to, since it is handed out). At first login the person types it once, **chooses their own password** (D1 rules) and receives a **fresh recovery code**. The slip's password and code both stop working. Demo pods (`--demo`) keep their printed passwords because they are shared on purpose. |
| **Security change** | ↑ The operator never knows the working password or recovery code of an official account. |
| **Tests** | `R7-D10`; `S11` and `X14` updated |

### D11. (found in the post-deploy second check, v1.2.1) The owner always has a way in, even on a new computer

| | |
|---|---|
| **Before (v1.2.0)** | D4's per-account budget (20 wrong passwords per hour from never-used browsers) could only be bypassed from a browser the owner had used before. |
| **Attack** | An attacker spends the professor's budget every hour, all exam day. The professor arrives at an exam-hall PC they have never used and gets "too many wrong passwords" for up to an hour. Their correct password and their recovery code could not get them past it. This is a targeted denial-of-service at exam time. |
| **After** | A successful **recovery**, which needs the 60-bit recovery code that only the owner has, does two things:<ul><li>It gives that browser the device token for the account (it becomes a trusted browser).</li><li>It clears the account's guess budget.</li></ul>The 429 message now names this way out: "…or use 'Forgot your password?' with your recovery code". |
| **Why** | Without an escape, any per-account limit is a lockout tool. Proof of the recovery code is the strongest proof of ownership the system has, it is single-use, and it is rotated on use. |
| **Security change** | ↑ The owner can always get in from anywhere. An attacker can still not guess more than 20 times per hour from new browsers. |
| **Tests** | `R7-D4` "the owner always has a way in" (budget spent; new PC refused with a message naming recovery; recovery on that PC; then login works there; budget counts again from zero). Suite: **131 of 131**. |

---

## Part F: Removed in round 7 (each checked three times)

| Removed | 1st check: who used it | 2nd check: what replaces it | 3rd check: tests/docs | Security |
|---|---|---|---|---|
| Generated passphrase for sign-up, recovery and change | `newSecrets()` callers in `src/app.mjs` | The person's own password (D1); `generatePassphrase()` is still used for recovery codes and operator slips | All register/recover/change tests updated; `grep` finds no client code reading a passphrase from a response | ↑ No password ever travels back to the browser |
| `POST /api/passphrase` | `public/app.js` only | `POST /api/password {current, next}` | `R7-D2` asserts 404; route matrix covers the new route | ↑ No route returns a password |
| "Copy both" / `leakproof-login.txt` download of the password | Secrets page | Recovery code only: Copy, Download (`leakproof-recovery-code.txt`) or "I wrote it down" | Browser `B1`, `B12` | ↑ The password is never written to a file or the clipboard by LeakProof |
| `passphrasePage` and the `#/passphrase` page | Header link, forced-change redirect | `passwordPage`, `#/password` | Browser `B11`; grep finds no `#/passphrase` | = |

## Part G: Operator notes for round 7

- **Deploying changes the API** (`/api/passphrase` → `/api/password`; `register` and `recover` need a password). Browser and server ship together in one release, so nothing breaks, **but any open tab should be reloaded**.
- **Existing practice accounts keep working** with their generated passphrase: it is still their password. People can change it under *Change password* at any time.
- **Demo pods** keep generated passwords (shared on purpose); `demo-setup.sh` is unchanged.
