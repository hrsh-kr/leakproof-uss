# LeakProof user guide

Contents: 1 What LeakProof is - 2 How to get in - 3 The three stages - 4 Works as designed - 5 Setter - 6 Exam cell - 7 Key holder - 8 Auditor and public - 9 Lone practice tester (the shortest path) - 10 Demo pods - 11 Recovery and change passphrase - 12 Known limits - 13 Glossary - 14 Rules for testers - 15 Originality

## 1. What LeakProof is

- LeakProof runs one exam so that nobody can read the paper early.
- Setters submit questions. They are encrypted on arrival.
- At sealing, one question per topic is drawn and locked. The lock key is given to the professor as one key card.
- The professor must approve before the paper opens, and only inside the print window.
- Each seat gets the same questions in its own order, so a leaked copy points to a seat. Every step goes into a public log that nobody can quietly edit.

| | Practice instance | Demo pods |
|---|---|---|
| Address | `https://192.168.2.238:8443/` | `https://192.168.2.238:7443/` |
| Accounts | You register your own. Course code `LP-PROF-G19` (professor), `LP-TA-G19` (TA), or `LP-STU-G19` (student) | Shared accounts from the credentials table in TESTERS.md |
| Roles | One account plays every role | One account per role (professor, TA, student) |
| Label in the page header | Practice | Demo |

You need a current browser (Chrome, Firefox, Safari or Edge) with JavaScript on. Key cards are encrypted in your browser, so the page does not work without it. If something fails, tell us which browser and version you used.

## 2. How to get in

### 2.1 The certificate warning (expected)

The server has no public domain name, so it uses a certificate signed by our own certificate authority (CA). Your browser does not know that CA and shows a warning the first time. This is expected.

1. Open the address from section 1.
2. Pick your browser below. The wording differs a little between versions.
   - **Chrome or Edge:** the page says "Your connection is not private". Press **Advanced**, then **Proceed to 192.168.2.238 (unsafe)**.
   - **Firefox:** the page says "Warning: Potential Security Risk Ahead". Press **Advanced…**, then **Accept the Risk and Continue**.
   - **Safari:** the page says "This Connection Is Not Private". Press **Show Details**, then **visit this website**, then **Visit Website** in the dialog. Safari may ask for your computer password.
3. The LeakProof log-in page opens. The warning does not come back until you close the browser or clear its data.

### 2.2 Check the certificate fingerprint (optional, 2 minutes)

A fingerprint is a short code that identifies a certificate. TESTERS.md lists the SHA-256 fingerprint of our **root CA**. The root CA never changes. The server's own certificate is renewed automatically, so its fingerprint changes. Compare the root, not the server certificate.

1. Take the file `leakproof-root-ca.crt` from the submission package. It is public.
2. In a terminal run: `openssl x509 -in leakproof-root-ca.crt -noout -fingerprint -sha256`
   (macOS: Keychain Access also shows the SHA-256 fingerprint after you open the certificate. Firefox shows it when you import the file under Settings, Privacy and Security, View Certificates, Authorities.)
3. Compare the result with the fingerprint in TESTERS.md. Ignore upper or lower case and the colons. If they match, the root file is ours.
4. To remove the warning for good, import the root file into your browser or system trust store. Do this only in a spare browser profile, and remove it after the test. If you do not import it, nothing else changes: you can click through the warning every time.

### 2.3 Practice instance: make an account (about 2 minutes)

1. On the log-in page choose **Create a practice account**.
2. Choose your role, then enter the matching course code — `LP-PROF-G19` for professor (gets the full pipeline with the key card), `LP-TA-G19` for TA (submits questions), or `LP-STU-G19` for student (views questions after release) — plus a username and a display name.
   Username: 3 to 32 characters, lowercase letters, digits, dot, dash or underscore. Usernames are unique, so a taken name gives "That username is taken. Choose another."
   Display name: 2 to 60 characters, plain text.
3. Press **Create practice account**.
4. The next page shows your passphrase and your recovery code **once**. Press **Copy both** or **Download**, tick **I have saved my passphrase and recovery code**, then press **Continue**. **Continue** stays grey until you did both.
5. You land on your practice exam. A banner reminds you that you play every role.

Passphrase fields have a **Show passphrase** box so you can check what you typed.

If you run the tarball on your own computer (`npm run practice`, Node 22.5 or newer) the address is `http://127.0.0.1:8080/` and the course codes are `LP-PROF-G19`, `LP-TA-G19`, `LP-STU-G19` (or the legacy `USS-PRACTICE` which registers as professor). The rest of this guide is the same.

### 2.4 Log in again later

Enter your username and passphrase and press **Log in**. A new log-in replaces an older one in the same browser. For different roles at the same time, use a separate private window or a separate browser for each account.

## 3. The three stages

`Collect` then `Seal` then `Release`. The **Next step** box on the exam page always says what to do now. The exam page also shows the print window (in your local time), the server's time, and whether the window is open.

- **Collect.** TAs add questions. Every topic needs at least one question.
- **Seal.** The professor presses **Seal the exam**. One question per topic is drawn, the paper is locked, one key card is issued to the professor, and every other question is deleted. The professor then saves and verifies the card.
- **Release.** Inside the print window the professor requests release and approves it with the key card. The paper opens, and each seat can be printed.

## 4. Works as designed

These behaviours are on purpose. Please do not report them as bugs. The reasons are in `SECURITY.md`.

- **One refusal closes the request.** One key holder can stop a release with **Refuse with card N**. The exam cell then requests again.
- **A verified card cannot be shown again.** The server deletes its copy at verification and says "This card is already verified. The server no longer holds a copy, so it cannot be shown again." Keep the file and the passphrase.
- **Usernames are unique, and sign-up says so.** There is no user list and no email, so names are not secret.
- **A server restart re-locks the paper.** The open paper lives only in memory. After a restart the old request shows "The server restarted while this request was open, so it was closed. Request release again." The professor approves again.
- **Idle sign-out after 30 minutes.** The pages that refresh themselves do not count as activity. You are also signed out 8 hours after you logged in. The message is "You were signed out: 30 minutes without activity, the 8-hour session limit, or your passphrase was changed elsewhere. Log in to continue where you were."
- **Rate limits.** Examples of the messages: "Too many requests. Wait a minute and try again.", "Too many attempts from this network. Wait a minute.", "Too many attempts. Wait a minute.", "Too many checks from this network. Wait a minute.". Five wrong passphrases in a row for one username from one network give "Too many wrong attempts. Try again in N seconds.", and the wait grows up to 15 minutes. A correct log-in clears it. A network can create 30 practice accounts a day ("This network has created 30 practice accounts today. Try again later."). One account can make 10 practice exams.
- **Wrong two words lock out one key holder.** Five wrong tries for one request lock out that holder (the account) for that request. Other holders can still approve. Every wrong try is logged. If too many holders are locked out, the exam cell presses **Start over with new words** (it replaces the request and gives new words). See 6.4.
- **A trace needs the options for a single seat.** With only the question lines, several seats can match. The result then says "N seats match; paste the options as well for a single seat." Three questions are the minimum.
- **A missing role looks like a missing page.** If you have no role in an exam, the page says "This exam does not exist, or you have no role in it." and the server answers "Not found". It does this on purpose so that ids cannot be probed.
- **Self-signed certificate.** See 2.1.
- **No email or SMS.** The recovery code is the only way back in.
- **The answer key is per seat.** Each seat has its own question order, so each seat has its own key. A key fits only the copy with the same copy id.
- **The two log heads can differ for a few seconds.** The exam cell screen refreshes every 5 seconds and the key holder screen every 10 seconds, and every approval adds a log entry. Reload both screens to compare.
- **Questions are one line.** A line break or an invisible character in a question, option or display name is refused: "Type plain text."
- **The practice window.** A practice exam's print window runs from its creation for 14 days. After that, **Start a fresh practice exam** on the home page.

## 5. Question setter

Practice (TA role): this is optional. Your practice exam already has 10 topics with 1 simulated TA per topic. Skip to section 6 if you only want to see the flow. Demo pods: it is required (section 10).

1. Log in and open your exam from **Your exams** on the home page.
2. Open the **My questions** tab.
3. Under **Add a question** pick a **Topic**.
4. Type the question (5 to 500 characters).
5. Type four different options (1 to 200 characters each). Pick the correct one with the round button.
6. Press **Submit question**. You see "Question received. It is stored encrypted."
7. You can add one question per topic. To replace one, press **Delete** next to it, then press it again when it says "Really delete? Click again". You have 8 seconds to confirm.

Only you can read your questions back. After sealing, your questions show **Sealed** with "Locked at sealing. Its text was deleted from the server." and you can no longer add or delete.

## 6. Exam cell

The professor seals the paper, holds the key card, requests and approves release, prints, and traces leaks. The professor never sees question text before release (only topic counts and readiness).

### 6.1 Seal

1. Open your exam and the **Exam cell** tab.
2. Under **Question pool**, each topic must show **Ready**. A topic that shows **Needs 1 TA with a question** needs a question from a TA.
3. Press **Seal the exam**. A box asks "Seal now?". Focus is on **Cancel**, and Esc also cancels.
4. Press **Yes, seal it**. This cannot be undone.
5. You see "Sealed. Set hash ..." and one question per topic is drawn. The exam is now in the **Seal** stage. The professor must save and verify the key card (section 7).

### 6.2 Request release

1. Open the **Professor** tab. **Key card** shows whether the professor's card is verified ("1 of 1 verified").
2. Wait until the professor's key card is verified. Until then the **Request release** button is grey, with the reason next to it ("The professor key card must be verified before release."). It is also grey outside the print window.
3. Under **Occupied seats** enter the number of seats (1 up to the limit shown, 60 in practice; the box starts at 30).
4. Press **Request release**.
5. The **Release request** box shows two words under "Read these to the key holder". Only this screen shows them. The professor reads them from this screen to verify they are approving the right request.
6. The box shows the three gates and whether the card has approved, and refreshes every 5 seconds. The request expires after 15 minutes.
7. After approval the box turns into the print list.

### 6.3 Print, answer key

1. After release, **Print copies** lists one button per seat (1 to the number you entered).
2. Press a seat number. The copy opens in a new tab (allow pop-ups if your browser blocks it). Press **Print** there. Each copy ends with its seat, copy id, question set, and the log head at that moment.
3. A seat you printed gets a tick. A reprint shows "Reprint: this is counted in the log". The first 3 fetches of a seat are logged one by one. The counter keeps counting after that.
4. Press **Key** next to a seat to open the answer key for that seat's order. Press **Print** there. Use it only for the copy with the same copy id. The page says "ANSWER KEY. NOT FOR CANDIDATES".

### 6.4 If a request ends

If the request ends (refused, replaced by a newer one, expired, interrupted by a restart), the page says why and shows **Request release again**. While a request is still waiting, **Start over with new words** replaces it with a fresh request.

If key holders locked themselves out with wrong words, press **Start over with new words**: the old request is replaced and the lockout does not carry over to the new one.

### 6.5 Trace a leak

1. Open **Exam cell**, find **Trace a leak**.
2. Paste at least 3 questions that follow each other, **with their options**, one question or option per line. Leading numbers and letters such as "1." or "A)" are fine.
3. Press **Trace**.
4. The result says "Recognised N paper questions." and then either "Seat N matches questions A to B on that copy" or "No seat matches this order."
5. If several seats match, the note says how many and what to paste. A trace names a seat, not a person. It is a lead, not a verdict.
6. Fewer than 3 recognised questions gives "Found N paper question(s) in that text. Paste at least 3 consecutive questions with their options."

### 6.6 Check the draw

Under **Check the draw**, press **Open the public log**. See 8.3.

## 7. Key holder

The professor holds the single key card (slot 1). A card is a file encrypted on your own device under a passphrase you choose. The passphrase never leaves your device.

### 7.1 Create, save and verify the card

You see **Save and verify key card 1** on your home page under **Waiting for you** after sealing. Open it, then the **Key card** tab.

1. Under **Card passphrase** type a passphrase of at least 14 characters, then type it again. A single repeated character is refused.
2. Press **Create my card**. It takes a second or two.
3. Press **Download** (a file `leakproof-card-1.txt`) or **Copy**. One of the two is needed before verifying.
4. Press **Load card file…** and pick the file (or paste the text), type the passphrase, and press **Verify card**.
5. You see "Card 1 verified. The server deleted its copy." If you did not press **Download** or **Copy**, the first press of **Verify card** only warns: "You have not saved this card. Verifying deletes the server's copy. Press again to verify anyway."
6. Keep the file and the passphrase. If you lose either, the card is gone. The server cannot show it again. Without the card the paper cannot be opened.

After verification the **Professor** tab shows "1 of 1 verified" and the **Request release** button becomes active.

### 7.2 Approve or refuse a release

The professor handles both sides of the release: requesting it on the **Professor** tab and approving it on the **Key card** tab. In practice you hold both roles; in a real exam the professor acts alone.

1. After pressing **Request release** on the **Professor** tab, go to the **Key card** tab. It shows "Release request waiting" with the same two words.
2. Confirm the two words match what the Professor screen showed.
3. Under **Card 1**, type the two words, load your card file, type the passphrase.
4. Press **Approve with card 1**. You see "Quorum reached: the paper is open."
5. To stop the release instead, type the words and press **Refuse with card 1**. It needs the words too. It closes the request ("Refused. Nothing was opened.").

Wrong words: "The two words do not match the exam cell screen. Read them again from that screen." Five wrong tries lock you out of that request.

If the page changes while you are typing, a notice "Something changed" appears with **Show it now**. What you typed is cleared only if you press it.

## 8. Auditor and public

### 8.1 Open the log

No account is needed. The log of an exam is at `https://192.168.2.238:8443/#/log/<exam id>` (practice) or `https://192.168.2.238:7443/#/log/<exam id>` (demo). The exam id is the long code in the address of an exam page, after `#/exam/`. Account holders can also press **Open the public log** on the **Log** tab.

The page shows:

- **Chain**: "Intact" with the number of entries, or a message saying where it broke. The count covers every exam on that server, so it is larger than the list below.
- **Latest hash**.
- **Entries**: the latest 200 for this exam, newest first.
- **The draw**: after release only.
- **Download this log** saves a JSON file `leakproof-log-<exam id>.json`.

### 8.2 Check a hash from a copy

1. Copy the 64-character hash after "Log" at the bottom of a printed copy.
2. Paste it under **Check a hash printed on a copy** and press **Check**.
3. "This hash is in the chain." means it is a real entry. "Not found. The copy or the log has been altered." means it is not.
4. The hash on a copy is the head at the time of printing, so it is older than the latest hash. It still passes.

### 8.3 Check the draw

After release the page shows the seed, the question pool and the drawn ids. At sealing, the log entry `exam.sealed` shows the SHA-256 of the seed (field `seed`), so the seed cannot change later.

To replay the draw, save this as `replay.mjs` and run `node replay.mjs leakproof-log-<exam id>.json` (Node 22 or newer):

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

## 9. Lone practice tester: the shortest path

You play every role. Time: about 20 minutes the first time. Use one browser window.

| Step | What you do | Time |
|---|---|---|
| 1 | Section 2.1 and 2.3: pass the warning, choose role **professor**, course code `LP-PROF-G19`, create the account, save the passphrase and recovery code | 2 min |
| 2 | Optional: register a second account as TA (LP-TA-G19) and add a question (section 5) | 2 min |
| 3 | **Professor** tab: **Seal the exam**, **Yes, seal it** | 1 min |
| 4 | **Key card** tab opens. Passphrase twice (14+ characters), **Create my card**, **Download**, **Load card file…**, passphrase, **Verify card** | 2 min |
| 5 | **Professor** tab: seats (for example 5), **Request release**. Note the two words | 1 min |
| 6 | **Key card** tab: type the two words, load the file, type the passphrase, **Approve with card 1** | 2 min |
| 7 | **Professor** tab: press seat 1, **Print** in the new tab. Close it. Press **Key** for seat 1 | 2 min |
| 8 | Copy 3 questions with options from the copy of seat 1, paste under **Trace a leak**, **Trace** | 2 min |
| 9 | Press **Open the public log**. Paste the log hash from the copy footer into **Check** | 2 min |

Expect: after step 3 the **Key card** tab shows "Card 1 · Not verified yet". After step 4 it shows "Card 1 verified. The server deleted its copy." After step 6 the **Professor** tab shows the print list. After step 8 it names seat 1.

The practice banner reminds you that one account plays every role. Register separate accounts (professor, TA, student) in different browser windows to see role separation. Use the demo pods for a fully pre-configured multi-person setup (section 10).

To start over, press **Start a fresh practice exam** on the home page.

## 10. Demo pods

A pod is a complete exam with separate people for each role, so you can see the professor key card flow as it would run for real.

- Address `https://192.168.2.238:7443/`. The header says **Demo**. There is no registration here.
- There are 3 pods, 5 accounts each. Usernames start with `p1-`, `p2-` or `p3-`: `-prof`, `-ta-a`, `-ta-b`, `-stu-a`, `-stu-b`. The passphrases are in the credentials table in TESTERS.md.
- Each pod has 5 topics (Data Structures, Operating Systems, Databases, Computer Networks, Algorithms), up to 40 seats, and one key card held by the professor.
- **Honour system.** Accounts are shared. Use one pod per group of testers, and tell others which one you took. Do not change a passphrase on a demo account: other people use it. If somebody did, the account can fail for you until the nightly reset.
- **Reset.** Every night at 04:00 server time, each pod goes back to its starting state with the same passphrases. Every session ends, an open paper locks again, and card files you saved before the reset no longer work. We can also reset on request (see TESTERS.md for how to reach us).
- **No forced change.** Demo accounts do not ask for a new passphrase at first log-in. Real official accounts do: they ask for the printed passphrase once more ("New passphrase", button **Get a new passphrase**) and then show a new passphrase and recovery code that only that person sees. Nothing else opens until that is done ("Set your own passphrase first."). The official instance runs on the night of 25 Nov and is not open to testers.
- **Passphrases may be changed by others.** **Change passphrase** works on a demo account too. It ends other sessions and shows a new passphrase only to the person who pressed it. Please do not.
- **What the pod needs from you.** Each topic needs at least one question, so `-ta-a` and `-ta-b` each submit one question for each of the 5 topics (10 questions between them). Then `-prof` seals. `-prof` creates and verifies the key card (7.1). `-prof` requests release and approves it with the card (7.2). Then `-prof` prints, gets keys, and traces (6.3, 6.5). Students can view the released paper.
- **A pod keeps its state.** If another group already sealed it, you cannot add questions or seal again until the next reset. Pick another pod or ask us.
- A solo tester needs 5 separate windows or browsers (one per account) and about 25 minutes.

## 11. Recovery and change passphrase

- **Lost passphrase:** on the log-in page press **Forgot your passphrase?**. Enter your username and recovery code and press **Set a new passphrase**. You get a new passphrase and a new recovery code, shown once, and all your sessions end. A recovery code works once. Capital letters do not matter.
- **Change passphrase:** press **Change passphrase** in the header. Type your current passphrase and press **Get a new passphrase**. LeakProof generates a new passphrase and a new recovery code and shows them once. Your other sessions end. This one stays. You cannot choose the new passphrase yourself.
- **Lost card file or card passphrase:** the card cannot be recovered, by design. The paper cannot be opened without it. Keep the file and the passphrase safe.
- **No email:** nobody can reset your passphrase for you. Demo accounts are reset by the nightly reset.

## 12. Known limits

These are stated openly. More detail is in `SECURITY.md` section 4.

- The server process holds the paper in plain text for a moment at sealing and while it is open. Whoever runs the server is trusted. A malicious operator could serve altered JavaScript.
- Once the card is verified, someone who steals the database and the server's keys cannot open the paper without the card file. This protects stored data. It does not protect the paper from the running server while it is open.
- The professor holds the single key card and can open the paper; the log shows it. The professor's card plus a copy of the database can open it offline, and the log would not show that.
- The professor can veto a release (which requires the two words); the exam cell requests again.
- The operator picks the draw seed, so a dishonest operator could seal repeatedly. The log commits to the seed's hash at sealing, so the seed cannot change afterwards. It does not prove the operator did not choose it.
- The copy id is printed on each copy but the server has no check for it.
- The id of the setter stays in the database for drawn questions. It is not in the log or in any answer.
- A trace works on text that keeps the question and option order. It cannot read a photo. It can match several seats when the options are missing. A photo of a printed copy cannot be prevented, only traced.
- The two-word check is a presence check with 14 bits. Five wrong tries per holder lock that holder out, and every try is logged.
- The log shows tampering but does not prevent it. Cutting entries off the end of the log is detected only through a head that was written down earlier, for example the one printed on a copy.
- The print window and seat count guard against accidents, not against a malicious exam cell.
- Practice mode: one account plays every role. It shows the flow, not the separation of duties.
- The operator who sets up the official instance sees the first passphrases. The owner must replace them at first log-in, and the change is logged.
- Registration says whether a username is taken.
- The certificate is self-signed (section 2).
- Out of scope: floods from many machines, the VM host, social engineering.

## 13. Glossary

- **Seal**: draw one question per topic and lock the paper under a new key. This cannot be undone.
- **Key card**: the professor's piece of the key. It opens the paper when approved. It is a file encrypted with the professor's passphrase.
- **Verify**: prove you can open your card file. The server then deletes its own copy.
- **Release**: the step that opens the paper. It needs the professor's approval inside the print window.
- **Print window**: the time range in which the paper may be opened.
- **Seat**: one candidate's place. Each seat has its own question order.
- **Copy id**: the code printed on a copy that names its seat.
- **Two words**: two short words shown only on the exam cell screen. They prove you are in the room.
- **Log head**: the newest hash in the log. It changes with every entry.
- **Chain**: the log's hashes are linked, so changing one old entry breaks every later one.
- **Draw seed**: the random number that picked the questions. It is public after release.
- **Set hash**: a short code of the drawn questions.
- **Trace**: finding which seat a leaked text came from.
- **Fingerprint**: a short code that identifies a certificate.

## 14. Rules for testers

**In scope:** the practice instance and the demo pods, through the browser or over HTTP (for example `curl`), with accounts you registered or the demo accounts. The tarball run on your own computer. Functional bugs: anything that does not match this guide.

**Out of scope:** the VM host, its operating system, SSH and the proxy. Other groups' systems. Floods and DDoS from one or many machines. Social engineering of people. Physical access. The official instance (it runs on the night of 25 Nov and is not open to testers).

**Keep it low volume.** A few hundred requests per test is plenty. Do not create accounts in bulk.

**What a good report contains:** the steps, what you expected, what happened, and a screenshot (or the exact request and response). Say which instance, which account, and which browser. For a security report, say what you gained and whether it works on a fresh account.

**Contact:** see TESTERS.md.

## 15. Originality

The whole of `src/`, `public/` and `deploy/` is our own work, written for this project. The server uses no third-party packages: only Node built-ins (`node:http`, `node:sqlite`, `node:crypto`, `node:test`). The tests, the scripts and the documents are ours too.

Ideas we credit:

- Shamir secret sharing (Adi Shamir, 1979) for the 1-of-1 key split (the full Shamir construction, instantiated at threshold 1 and 1 share). We implemented it ourselves over a prime field.
- AES-256-GCM for encryption, and PBKDF2, scrypt and HMAC-SHA-256 for key derivation, password hashing and the log chain, as provided by Node and the browser.
- Patterns learned from the published bug lists and reports of FCS Group 1 and Group 2 (rate limits, proxy timeouts, cookie flags, a confirmation before sealing, recovery codes). `SECURITY.md` section 3 lists what we kept and what we cut. We copied no code from them.
