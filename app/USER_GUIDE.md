# LeakProof user guide

Contents: 1 What LeakProof is - 2 Roles and names - 3 How to get in - 4 The three stages - 5 TA - 6 Professor - 7 Student - 8 Public log (anyone) - 9 Solo practice run - 10 Demo pods - 11 Recovery and change password - 12 Works as designed - 13 Known limits - 14 Glossary - 15 Rules for testers - 16 Originality

## 1. What LeakProof is

- LeakProof runs one exam so that nobody can read the paper early, and a leaked copy points to a seat.
- **TAs** submit questions. They are encrypted on arrival.
- At sealing, one question per topic is drawn and locked. The lock key goes to the **Professor** as one key card.
- The **Professor** must approve with that key card before the paper opens, and only inside the print window.
- Each seat gets the same questions in its own order, so a leaked copy points to a seat.
- **Students** see their own seat's copy after the paper is released.
- Every step goes into a **public log** that nobody can quietly edit.

| | Practice instance | Demo pods |
|---|---|---|
| Address | `https://192.168.2.238:8443/` | `https://192.168.2.238:7443/` |
| Accounts | You register your own: a course code for your role, plus (TA and student) your professor's class code | Shared accounts, see section 10 |
| Label in the page header | Practice | Demo |

You need a current browser (Chrome, Firefox, Safari or Edge) with JavaScript on. Key cards are encrypted in your browser, so the page does not work without it. If something fails, tell us which browser and version you used.

## 2. Roles and names

LeakProof has exactly three roles. This guide uses only these names.

| Role | What the role does | Course code (practice) | Demo username (pod 1) | Tabs on the exam page |
|---|---|---|---|---|
| **TA** | Writes and submits questions | `LP-TA-G19` + the exam's TA class code | `pod1-ta-1`, `pod1-ta-2` | **My questions**, **Log** |
| **Professor** | Seals the exam, holds the key card, opens the paper, prints, traces leaks, gives out the class codes | `LP-PROF-G19` | `pod1-professor` | **Professor**, **Key card**, **Log** |
| **Student** | Sees the copy of their own seat after release | `LP-STU-G19` + the exam's student class code | `pod1-student-1`, `pod1-student-2` | **My exam copy**, **Log** |
| *Anyone* | Reads the public log. No account needed | none | none | public log page |

Pods 2 and 3 use the same names with `pod2-` and `pod3-`.

**Course code and class code.** The course code (table above) only says which role you sign up for; it is public. A TA or student also needs the **class code** of their professor's exam. The professor finds the TA code and the student code on the **Professor** tab (section 6.1). Without the right class code nobody can join an exam.

## 3. How to get in

### 3.1 The certificate warning (expected)

The server has no public domain name, so it uses a certificate signed by our own certificate authority (CA). Your browser does not know that CA and shows a warning the first time. This is expected.

1. Open the address from section 1.
2. Pick your browser below. The wording differs a little between versions.
   - **Chrome or Edge:** "Your connection is not private". Press **Advanced**, then **Proceed to 192.168.2.238 (unsafe)**.
   - **Firefox:** "Warning: Potential Security Risk Ahead". Press **Advanced…**, then **Accept the Risk and Continue**.
   - **Safari:** "This Connection Is Not Private". Press **Show Details**, then **visit this website**, then **Visit Website**. Safari may ask for your computer password.
3. The LeakProof log-in page opens. The warning does not come back until you close the browser or clear its data.

### 3.2 Check the certificate fingerprint (optional, 2 minutes)

TESTERS.md lists the SHA-256 fingerprint of our **root CA**. The root never changes; the server's own certificate is renewed automatically, so compare the root only.

1. Take `leakproof-root-ca.crt` from the submission package. It is public.
2. Run `openssl x509 -in leakproof-root-ca.crt -noout -fingerprint -sha256`
   (macOS Keychain Access and Firefox's certificate import also show it.)
3. Compare with TESTERS.md, ignoring case and colons.
4. To remove the warning for good, import the root into a spare browser profile and remove it after the test. Otherwise just click through the warning each time.

### 3.3 Practice instance: make an account (about 2 minutes)

1. On the log-in page choose **Join a class**.
2. Choose your role and enter its course code from section 2 (capital letters do not matter). A TA or student also enters the **class code** from their professor (spaces, dashes and capital letters do not matter). Then a username and a display name.
   - Username: 3 to 32 characters, lowercase letters, digits, dot, dash or underscore. Usernames are unique: "That username is taken. Choose another."
   - Display name: 2 to 60 characters, plain text.
   - **Password: choose your own** and type it twice. A checklist under the box turns green rule by rule:
     - 12 to 128 characters
     - at least 3 of lower case, upper case, digits and symbols, **or** 20+ characters (a sentence like `my cat ate 3 green mangoes` is fine)
     - no runs like `aaaa`, `1234`, `abcd` or `qwer`, and at least 6 different characters
     - not a common password and not made only of common words, even disguised (`P@ssw0rd2026!`, `Summer-Exam-2026` and `Leakproof2026!` are refused)
     - not your username or a word of your display name
     - no space at the start or end
   - The server checks the same rules, so they cannot be skipped. A password manager can save it.
3. Press **Join class**.
4. Your **recovery code** is shown **once** (your password is never shown back). It lets you choose a new password if you forget yours. Press **Copy**, **Download** or **I wrote it down**, tick **I have saved my recovery code**, then **Continue**. You are logged in only when you press **Continue**. Until then the browser's **Back** and **Forward** buttons, links and typed addresses all stay on this page, and closing the tab asks "Leave site?" first.
5. A **Professor** lands on a new practice exam, which already has 10 topics filled with sample TA questions. A **TA** or **student** lands on the professor's exam.

Joining closes on time: a TA can join only while questions are collected; a student can join until the paper is released.

Password fields have a **Show password** box (key-card passphrase fields have **Show passphrase**).

Running the tarball on your own computer (`npm run practice`, Node 22.5+): the address is `http://127.0.0.1:8080/`, and the same course codes and class codes work.

### 3.4 Log in again later

Enter your username and password and press **Log in**. A new log-in replaces an older one in the same browser. One account keeps at most 5 sessions; a sixth log-in ends the oldest. To be logged in as two roles at once, use a separate private window or browser for each account.

**Log out** signs out every LeakProof tab of that browser, including copy and answer-key tabs, which are cleared. After logging out, **Back** never shows a paper, a key card or the class codes again.

## 4. The three stages

`Collect` → `Seal` → `Release`. The **Next step** box on the exam page always says what to do now, and shows the print window (your local time), the server's time and whether the window is open.

| Stage | Who | What happens |
|---|---|---|
| **Collect** | TAs | Add questions. Every topic needs at least one. |
| **Seal** | Professor | **Seal the exam**: one question per topic is drawn, the paper is locked, every other question is deleted, and one key card is issued. The Professor saves and verifies the card. |
| **Release** | Professor | Inside the print window: request release, approve it with the key card. The paper opens and each seat can be printed. Each student can now see the copy of their own seat. |

## 5. TA

In the practice instance this is optional: the practice exam already has sample questions. In the demo pods it is required (section 10).

1. Log in and open the exam from **Your exams** on the home page.
2. Open the **My questions** tab.
3. Under **Add a question** pick a **Topic**.
4. Type the question (5 to 500 characters).
5. Type four different options (1 to 200 characters each). Mark the correct one with the round button.
6. Press **Submit question**: "Question received. It is stored encrypted."
7. One question per topic per TA. To replace one, press **Delete**, then press it again within 8 seconds when it says "Really delete? Click again". A TA can delete at most 20 questions per exam.

Only you can read your questions back. After sealing they show **Sealed** ("Locked at sealing. Its text was deleted from the server.") and cannot be added or deleted.

## 6. Professor

The Professor runs the whole exam but never sees question text before release, only how many questions each topic has.

### 6.1 Class codes and sealing

**Class codes.** The **Professor** tab shows **Class codes**: a **TA code** (`TA-…`) and a **student code** (`ST-…`). Give each only to the people of that role. If a code leaks, press **Make new class codes** (press twice to confirm): the old codes stop working at once. Making new codes is logged.

**Members.** Below the codes, the **Members** card lists every TA (with how many questions they submitted) and every student (with their online seat once they open their copy), by display name and username. Only the professor sees it. If you see someone you do not know, press **Remove** (press twice to confirm):
- Their access ends at once.
- A TA removed before sealing also loses every question they submitted, so nothing they wrote can be drawn.
- A removed student keeps their seat on record, so a trace of that seat still names them.

After removing someone, also press **Make new class codes** so they cannot join again with a new account. Removals are on the public log, without names.

1. Open the exam and the **Professor** tab.
2. Under **Question pool** every topic must show **Ready**. **Needs 1 TA** means a TA still has to add a question for that topic. The **TAs** column counts how many TAs wrote for each topic.
3. Press **Seal the exam**. A box asks "Seal now?" (focus is on **Cancel**; Esc also cancels).
4. Press **Yes, seal it**. This cannot be undone.
5. You see "Sealed. Set hash …". Next, create and verify the key card (6.2).

### 6.2 Create, save and verify the key card

After sealing, the home page shows **Save and verify key card 1** under **Waiting for you**. Open the **Key card** tab.

1. Under **Card passphrase** type a passphrase of at least 14 characters, twice. A single repeated character is refused.
2. Press **Create my card** (a second or two).
3. Press **Download** (file `leakproof-card-1.txt`) or **Copy**. One of the two is required before verifying.
4. Press **Load card file…** (or paste the text), type the card passphrase, press **Verify card**.
5. "Card 1 verified. The server deleted its copy." If you skipped Download/Copy, the first press only warns you; press again to verify anyway.
6. **Keep the file and the passphrase.** If either is lost, the paper can never be opened.

The **Professor** tab now shows "1 of 1 verified" and **Request release** becomes active.

### 6.3 Request and approve release

1. On the **Professor** tab, under **Occupied seats**, enter the number of seats (1 up to the limit shown: 60 in practice, 40 in the demo pods; starts at 30).
2. Press **Request release**. It is grey outside the print window or before the card is verified, with the reason next to it.
3. The **Release request** box shows **two words**. They tie your approval to this exact request.
4. Go to the **Key card** tab. "Release request waiting" shows the same two words. Check they match.
5. Under **Card 1**: type the two words, load your card file, type the card passphrase.
6. Press **Approve with card 1**. The screen says "Approved: the paper is open."
7. To cancel instead, type the words and press **Refuse with card 1**: "Refused. Nothing was opened."

The request expires after 15 minutes. Wrong words: "The two words do not match the Professor screen…". Five wrong tries lock you out of that request; use **Start over with new words** (6.5).

If the page changes while you type, a "Something changed" notice appears with **Show it now**. Your typing is cleared only if you press it.

### 6.4 Print copies and answer keys

1. After release, **Print copies** lists one button per seat.
2. Press a seat number. The copy opens in a new tab (allow pop-ups). Press **Print**. Each copy ends with its seat, copy id, question set and the log hash at that moment.
3. A printed seat gets a tick. A reprint shows "Reprint: this is counted in the log".
4. Press **Key** next to a seat for that seat's answer key ("ANSWER KEY. NOT FOR CANDIDATES"). It fits only the copy with the same copy id.

### 6.5 If a request ends

If a request is refused, expired, replaced or interrupted by a server restart, the page says why and shows **Request release again**. While a request is still waiting, **Start over with new words** replaces it with a fresh one and clears any wrong-word lockout.

### 6.6 Trace a leak

1. On the **Professor** tab find **Trace a leak**.
2. Paste at least 3 consecutive questions **with their options**, one per line. Numbering such as "1." or "A)" is fine.
3. Press **Trace**: "Seat N matches questions A to B on that copy" or "No seat matches this order."
4. Without options several seats can match; the result says so. A trace names a seat; for a seat a student holds online it also names that student ("online copy of …"). It is a lead, not a verdict.

### 6.7 Check the draw

Under **Check the draw** press **Open the public log** (section 8.3).

## 7. Student

1. Register with course code `LP-STU-G19` and your professor's **student class code** (practice), or log in as `pod1-student-1` / `pod1-student-2` (demo).
2. Open the exam from **Your exams**, tab **My exam copy**. Before release it says the paper is locked.
3. After the Professor approves the release, **My exam copy** shows **your own copy**: your seat number, a copy id, the questions in your seat's order with the options in your seat's order. The seat is given the first time you open it and never changes.
4. Your copy is unique to your seat, so a leaked screenshot or text traces back to your seat (section 6.6). Opening it is logged; your name and seat are not in the public log.
5. If every seat of the release is taken, you see "All N seats of this release are taken"; the professor must release for more seats.
6. Students never see answer keys, the key card, the class codes, another seat's copy, or a release request.

## 8. Public log (anyone, no account)

### 8.1 Open the log

`https://192.168.2.238:8443/#/log/<exam id>` (practice) or `https://192.168.2.238:7443/#/log/<exam id>` (demo). The exam id is the long code after `#/exam/` in an exam page's address. Logged-in users (professor, TA and student) can press **Open the public log** on the **Log** tab.

The log never shows usernames, display names, question text, class codes or which student has which seat. The page shows:
- **Chain**: "Intact" with the entry count (all exams on that server), or where it broke.
- **Latest hash**.
- **Entries**: the latest 200 for this exam, newest first. **Show older entries** loads the next 200, back to the first entry; nothing can be pushed out of view.
- **The draw**: after release only.
- **Download this log**: JSON file `leakproof-log-<exam id>.json`.

### 8.2 Check a hash from a printed copy

1. Copy the 64-character hash after "Log" at the bottom of a copy.
2. Paste it under **Check a hash printed on a copy**, press **Check**.
3. "This hash is in the chain." = genuine. "Not found. The copy or the log has been altered." = not.

### 8.3 Check the draw

After release the log shows the seed, the pool and the drawn question ids. At sealing, the `exam.sealed` entry recorded the seed's SHA-256, so the seed cannot change later. To replay the draw, save this as `replay.mjs` and run `node replay.mjs leakproof-log-<exam id>.json` (Node 22+):

```js
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
const { draw } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const seed = Buffer.from(draw.seed, 'hex');
const topics = [...new Set(draw.pool.map((p) => p.topic))].sort((a, b) => a - b);
for (const t of topics) {
  const ids = draw.pool.filter((p) => p.topic === t).map((p) => p.id).sort();
  let buf = Buffer.alloc(0), ctr = 0;
  const bytes = (n) => {
    while (buf.length < n) buf = Buffer.concat([buf, createHmac('sha256', seed).update(`draw|${t}`).update(Buffer.from([0])).update(String(ctr++)).update(Buffer.from([0])).digest()]);
    const out = buf.subarray(0, n); buf = buf.subarray(n); return out;
  };
  const lim = Math.floor(0x100000000 / ids.length) * ids.length;
  let v; do { v = bytes(4).readUInt32BE(0); } while (v >= lim);
  const id = ids[v % ids.length];
  console.log(`topic ${t}: ${id}`, draw.drawn.includes(id) ? 'matches' : 'DIFFERENT');
}
```

Every line should end with "matches".

## 9. Solo practice run (about 15 minutes)

One browser window, one **Professor** account.

| Step | Where | What you do |
|---|---|---|
| 1 | Log-in page | Pass the certificate warning (3.1). Create a practice account with `LP-PROF-G19` and a password of your own. Save the recovery code. |
| 2 | **Professor** tab | Note the **TA code** and **student code** under **Class codes**. |
| 2b | *(optional)* new private windows | Register a TA (`LP-TA-G19` + TA code) and add a question (section 5); register a student (`LP-STU-G19` + student code). |
| 3 | **Professor** tab | **Seal the exam** → **Yes, seal it** |
| 4 | **Key card** tab | Passphrase twice → **Create my card** → **Download** → **Load card file…** → passphrase → **Verify card** |
| 5 | **Professor** tab | Seats (e.g. 5) → **Request release**. Note the two words. |
| 6 | **Key card** tab | Two words → load file → passphrase → **Approve with card 1** |
| 7 | **Professor** tab | Seat 1 → **Print** in the new tab. Then **Key** for seat 1. |
| 8 | **Professor** tab | Paste 3 questions with options from seat 1 under **Trace a leak** → **Trace**. Expect seat 1. |
| 9 | **Log** tab | **Open the public log** → paste the hash from the copy footer → **Check**. |
| 10 | *(optional)* student window | **My exam copy** shows the student's own seat. Paste 3 of its questions into **Trace a leak**: it names that seat. |

To start over, press **Start a fresh practice exam** on the home page.

## 10. Demo pods

A pod is a ready-made exam with a separate account per role, so you can see the roles kept apart as in a real exam.

- Address `https://192.168.2.238:7443/`. Header says **Demo**. No registration.
- **3 pods, 5 accounts each:**

  | Account | Role |
  |---|---|
  | `podN-professor` | Professor |
  | `podN-ta-1`, `podN-ta-2` | TA |
  | `podN-student-1`, `podN-student-2` | Student |

  (N = 1, 2 or 3.) Passwords are in the credentials table in TESTERS.md.
- Each pod has 5 topics (Data Structures, Operating Systems, Databases, Computer Networks, Algorithms) and up to 40 seats.
- **Run order:**
  1. `podN-ta-1` and `podN-ta-2` each submit one question per topic (section 5).
  2. `podN-professor` seals (6.1), creates and verifies the key card (6.2), requests and approves release (6.3), prints and traces (6.4, 6.6).
  3. `podN-student-1` / `-2` view the released paper (section 7).
  4. Anyone checks the public log (section 8).
- A solo tester needs 5 windows or browser profiles and about 25 minutes.
- **Honour system.** Accounts are shared: one pod per group, and tell others which you took. Do not change a demo password.
- **A pod keeps its state.** If another group already sealed it, pick another pod or wait for the reset.
- **Nightly reset** at 04:00 server time: pods return to their starting state with the same passwords; sessions end, an open paper locks again, and saved card files stop working. We can also reset on request (TESTERS.md).
- **No forced password change** on demo accounts (their passwords are generated and shared on purpose). Official accounts must choose their own password at first log-in ("Set your own password first."). The official instance runs on the night of 25 Nov and is not open to testers.

## 11. Recovery and change password

- **Forgot your password:** log-in page → **Forgot your password?** → username, recovery code, and a new password of your own (same rules, typed twice) → **Set my new password**.
  - All your sessions end, and you get a **new recovery code**, shown once (the old one is used up).
  - If the new password breaks a rule, the recovery code is **not** used up; fix the password and try again.
  - Every recovery is written to the audit log.
- **Change password:** header → **Change password** → current password, then the new one twice → **Change password**.
  - Your other sessions end; this one stays.
  - **Your recovery code stays the same.** Even if someone else learned your password and changed it, your recovery code still gets you back in.
  - The new password must differ from the current one.
- **Official accounts:** the first log-in uses the password on your slip. You then choose your own and get a new recovery code; the slip stops working.
- **Lost key card file or card passphrase:** cannot be recovered, by design, and the paper cannot be opened.
- **No email:** nobody can reset your password for you. Demo accounts are restored by the nightly reset.

## 12. Works as designed

These are deliberate. Please do not report them as bugs; reasons are in `SECURITY.md`.

- **Sign-up does not log you in by itself.** You are logged in when you press **Continue** on the recovery-code page, after saving the code.
- **Back and Forward stay on the recovery-code page** until you saved it and pressed **Continue**.
- **A password the checklist refuses is refused by the server too**, with the same reason.
- **A seat a student holds online cannot be printed** for anyone else (it shows as "online" on the print grid), and students are never given a seat already printed.
- **Trace names the student** for a seat held online ("online copy of …"), shown to the professor only.
- **Log out signs out every tab** of that browser and clears open copy and answer-key tabs.
- **A class code is needed to join** an exam as TA or student, and joining closes at sealing (TA) or release (student).
- **A student sees only their own seat's copy**, with the seat and copy id on it.
- **A TA can delete at most 20 questions per exam.**
- **A refusal closes the request.** **Refuse with card 1** ends it; the Professor requests again.
- **A verified key card cannot be shown again.** "This card is already verified. The server no longer holds a copy, so it cannot be shown again."
- **Usernames are unique, and sign-up says so.** There is no user list and no email.
- **A server restart re-locks the paper.** The open paper lives only in memory: "The server restarted while this request was open, so it was closed. Request release again."
- **Idle sign-out after 30 minutes**, and 8 hours after log-in. Self-refreshing pages do not count as activity.
- **Rate limits**, for example "Too many requests. Wait a minute and try again." Five wrong passwords for one username from one network: "Too many wrong attempts. Try again in N seconds." (up to 15 minutes; a correct log-in clears it). A browser that has logged in to that account before is **not** affected by anyone else's wrong tries, so nobody on the same campus network can lock you out. Browsers that never logged in to an account share **20 wrong passwords per hour** for that account: "This account had too many wrong passwords from new devices…". If that happens to you on a computer you have never used (for example in the exam hall), use **Forgot your password?** with your recovery code there: that browser is then trusted for your account and you can log in. IPv6 networks count per /64. If the server is flooded with logins: "LeakProof is busy checking passwords. Try again in a few seconds." 30 practice accounts per network per day; 10 practice exams per account.
- **Wrong two words lock the Professor out of that request** after five tries. Every try is logged. **Start over with new words** fixes it.
- **A trace needs the options** to name a single seat. Three questions minimum.
- **No role in an exam looks like no exam:** "This exam does not exist, or you have no role in it." This stops id probing.
- **Self-signed certificate** (3.1). **No email or SMS** (recovery code only).
- **Answer keys are per seat**, matching the copy id.
- **The two log heads can differ for a few seconds** between the Professor tab (refreshes every 5 s) and the Key card tab (every 10 s).
- **Questions are one line.** Line breaks or invisible characters are refused: "Type plain text."
- **Practice print window** lasts 14 days from creation; then **Start a fresh practice exam**.

## 13. Known limits

More detail in `SECURITY.md` section 4.

- The server holds the paper in plain text briefly at sealing and while it is open. Whoever runs the server is trusted; a malicious operator could serve altered JavaScript.
- Once the key card is verified, stealing the database and server keys is not enough to open the paper; the card file is also needed. This does not protect the paper from the running server while it is open.
- **The Professor alone can open the paper** (inside the print window); the log shows it. The Professor's card plus a copy of the database can open it offline without a log entry.
- The operator picks the draw seed and could seal repeatedly. The log commits to the seed's hash at sealing, so it cannot change afterwards, but this does not prove it was not chosen.
- The copy id is printed but not checked by the server.
- The TA who wrote a drawn question is recorded in the database (not in the log or any answer).
- A trace needs text in the original order. It cannot read a photo.
- The two-word check has 14 bits; five wrong tries lock out, and every try is logged.
- The log shows tampering but does not prevent it. Cutting entries off the end is detected only against a hash written down earlier, such as one printed on a copy.
- The print window and seat count guard against accidents, not against a malicious Professor.
- Practice mode lets one Professor account do everything; use the demo pods, or register a TA and a student with the class codes, to see roles kept apart.
- Anyone who gets a class code can join that exam in that role until joining closes. Make new codes if one leaks, and remove anyone who joined with it (Members card).
- You choose your password, so its strength is partly up to you. The rules stop the guesses attackers try first, and online guessing is capped per account. Someone who stole the database could still try guesses offline against the scrypt hashes, so choose a long one.
- A student copy on screen can be photographed; like a printed copy it can only be traced, not prevented.
- Whoever sets up the official instance sees the first passwords and recovery codes; owners choose their own password at first log-in and get a fresh recovery code (logged).
- Registration reveals whether a username is taken.
- Out of scope: floods from many machines, the VM host, social engineering.

## 14. Glossary

- **TA**: writes and submits questions.
- **Professor**: seals, holds the key card, opens the paper, prints, traces, gives out the class codes.
- **Student**: sees the copy of their own seat after release.
- **Course code**: says which role you sign up for (public).
- **Class code**: the professor's per-exam code a TA or student needs to join that exam (one for TAs, one for students).
- **Seal**: draw one question per topic and lock the paper. Cannot be undone.
- **Key card**: the Professor's encrypted file that opens the paper.
- **Verify**: prove you can open your key card; the server then deletes its copy.
- **Release**: opening the paper; needs the Professor's key card inside the print window.
- **Print window**: the time range in which the paper may be opened.
- **Seat**: one candidate's place, with its own question order.
- **Copy id**: the code on a copy that names its seat.
- **Two words**: shown on the Professor tab when release is requested; typed on the Key card tab to approve that exact request.
- **My exam copy**: a student's own seat copy.
- **Log head**: the newest hash in the log.
- **Chain**: linked log hashes; editing an old entry breaks every later one.
- **Draw seed**: the random value that picked the questions; public after release.
- **Set hash**: a short code of the drawn questions.
- **Trace**: finding which seat a leaked text came from.
- **Fingerprint**: a short code identifying a certificate.

## 15. Rules for testers

**In scope:** the practice instance and the demo pods, through the browser or over HTTP (e.g. `curl`), with your own or the demo accounts; the tarball on your own computer; anything that does not match this guide.

**Out of scope:** the VM host, its OS, SSH and the proxy; other groups' systems; floods and DDoS; social engineering; physical access; the official instance.

**Keep it low volume:** a few hundred requests per test. No bulk account creation.

**A good report:** steps, expected, actual, screenshot (or exact request and response), instance, account, role and browser. For a security report: what you gained, and whether it works on a fresh account.

**Contact:** see TESTERS.md.

## 16. Originality

All of `src/`, `public/` and `deploy/` is our own work. The server uses only Node built-ins (`node:http`, `node:sqlite`, `node:crypto`, `node:test`). The tests, scripts and documents are ours too.

Credited ideas:
- Shamir secret sharing (Adi Shamir, 1979), implemented ourselves over a prime field; used here at threshold 1 of 1.
- AES-256-GCM, PBKDF2, scrypt and HMAC-SHA-256, as provided by Node and the browser.
- Patterns from FCS Group 1 and Group 2 bug lists and reports (rate limits, proxy timeouts, cookie flags, a confirmation before sealing, recovery codes). `SECURITY.md` section 3 lists what we kept and cut. No code copied.
