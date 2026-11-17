# LeakProof: testers' page

One page for peer testers. Read this first, then `USER_GUIDE.md`. A "functional bug" is anything that does not match the guide.

## Summary

LeakProof runs one exam so that nobody can read the paper early, and a leaked copy points to a seat. TAs submit encrypted questions. At sealing one question per topic is drawn and locked under a key card held by the professor (1-of-1). The professor must approve, inside a print window, before the paper opens. Each seat gets the same questions in its own order. Every step is in a public, tamper-evident log.

## Where and what

| | |
|---|---|
| Practice instance | `https://{{VM_IP}}:8443/` (you register your own account) |
| Course code | `{{COURSE_CODE}}` |
| Demo pods | `https://{{VM_IP}}:7443/` (shared accounts, table below) |
| Release | `{{RELEASE_TAG}}` |
| Tarball | `leakproof-{{RELEASE_TAG}}.tar.gz`, SHA-256 `{{TARBALL_SHA256}}` |
| Run the tarball yourself | Node 22.5 or newer, `npm run practice`, then `http://127.0.0.1:8080/`, course codes `LP-PROF-G19` (professor), `LP-TA-G19` (TA), `LP-STU-G19` (student). `npm test` runs the automated tests |

Check the tarball: `shasum -a 256 leakproof-{{RELEASE_TAG}}.tar.gz` (or `sha256sum`) must print the SHA-256 above.

## The certificate warning

Both sites use a certificate from our own certificate authority (CA), because the course VM has no public domain name. Your browser shows a warning once. This is expected. Step-by-step for Chrome, Firefox and Safari is in section 2.1 of `USER_GUIDE.md`.

Root CA SHA-256 fingerprint: `{{CERT_ROOT_SHA256}}`

To check it, run `openssl x509 -in leakproof-root-ca.crt -noout -fingerprint -sha256` on the file `leakproof-root-ca.crt` from the package and compare. Ignore case and colons. The server's own certificate is renewed automatically and its fingerprint changes, so compare the root only.

## Credentials

**Practice instance:** nobody gives you a password. Register your own account using the role-specific course code above. A professor account plays every role on your own practice exam; register separate TA and student accounts in different windows to test role separation.

**Demo pods:** 3 independent pods with 5 accounts each, for testing with separate people per role. The table below lists every account. The role column says what the account can do. If the table is replaced by a note instead, the credentials are posted separately in the class post.

{{CREDENTIALS_TABLE}}

How to read it:

- A username starts with `pod1-`, `pod2-` or `pod3-` (the pod). A pod has 1 professor (`-professor`), 2 TAs (`-ta-1`, `-ta-2`) and 2 students (`-student-1`, `-student-2`).
- The password logs you in. The recovery code lets you choose a new password if the password is lost. (On the practice instance you choose your own password at sign-up; demo passwords are generated because the accounts are shared.)
- The accounts are shared on the honour system. One group per pod. Do not change the password of a demo account. If a pod is broken or a password was changed, we can restore it.
- Every night at 04:00 server time the pods go back to their starting state with the same passphrases. Sessions end, open papers lock again, and saved card files stop working.
- Demo accounts do not ask for a new password at first log-in. The official instance does, and it is not part of this test.

## Roles per demo pod

| Account | Does |
|---|---|
| `-prof` | Seals (after TAs submit), creates and verifies the key card, requests and approves release, prints, answer keys, trace |
| `-ta-a`, `-ta-b` | Each submits one question for each of the 5 topics (10 in all, needed before sealing) |
| `-stu-a`, `-stu-b` | View the released paper (student role) |
| nobody (no login) | Reads the public log and checks a hash from a copy |

## Rules of engagement

**In scope:** the practice instance and the demo pods, through the browser or over HTTP (for example `curl`). The tarball run on your own computer. Functional bugs against the guide.

**Out of scope:** the VM host, its operating system, SSH and the proxy. Other groups' systems. Floods and DDoS from one or many machines. Social engineering of our people. Physical access. The official instance (it runs on the night of 25 Nov and is not open to testers).

**Low volume:** a few hundred requests per test. Do not create accounts in bulk (30 per network per day, 2000 in all).

**Valid report:** steps, expected result, actual result, screenshot or exact request and response, which instance and account, which browser. For a security report: what you gained, and that it works on a fresh account. The behaviours listed under "Works as designed" in the guide and the limits below are known.

## What we tested, and what we did not

Tested by us:

- The automated suite (`npm test`, no outside packages; the test count is in RELEASE.txt), run against a real server over HTTP with a throw-away database. It covers: the cryptography (encryption, key split and recombination, tamper checks), the whole pipeline from question to printed copy, the route table (every route against every role, with a 404 for a missing role), sessions, cookies and CSRF, input limits, rate limits and lockouts, the log chain and tamper detection, and server hardening (headers, timeouts, body size).
- Scripted walks of the practice and demo flows over the API, with the messages in the guide compared to the ones the server returns. The browser client was also run under a simulated browser (jsdom).
- Role-played reviews of security, cryptography, interface design, process and compliance, and fuzzing of inputs. These are our own reviews, not independent ones.

Not tested:

- **No external, attack-style test of access control or of the cryptography was completed.** The access-control side is covered by our own route tests and code review only.
- No test with real exam staff, and no formal usability study.
- Not every browser and device. Chrome and Firefox are the ones to try first.
- No load test beyond our own rate-limit tests. Floods are out of scope.
- The 15-minute request expiry and the 30-minute idle sign-out are confirmed by tests that move the clock or the expiry time, not by waiting in a real browser.
- Timing equality of the log-in response for known and unknown usernames is by code review, not by measurement.

## Known limits (short)

Full list: section 12 of `USER_GUIDE.md` and `SECURITY.md` section 4.

- Whoever runs the server is trusted. It holds the paper in plain text while the paper is open, and could serve altered JavaScript.
- The professor holds the single key card and can open the paper; the log shows it. The professor's card plus a copy of the database can open it offline without a log entry.
- The professor can veto a release (which needs the two words); the exam cell requests again.
- The operator picks the draw seed. The seal log entry commits to the seed's hash, so it cannot change later.
- A trace names a seat (and, for a seat held online, its student), and may match several seats unless the options are pasted.
- The two-word check has 14 bits, with 5 tries per holder per request, all logged.
- Practice mode lets one account play every role.
- A restart re-locks the paper. This is by design.
- The certificate is self-signed.

## Contact

Contact: {{CONTACT}}. Subject for email: `LeakProof report`. Your own official report is still your own submission. If the site is unreachable, tell us before you file it.
