# Threat Model v0

Status: v0, built from our own reasoning and the public cases we found. It is a hypothesis until studies and the Phase I analysis confirm or change it. Version 1 is due Oct 4. Assumptions are in `02_final_scope_and_decisions.md` (A1 to A11).

## 1. What we protect (assets)

| Asset | Why it matters |
| --- | --- |
| Question content, before and after the draw | Early knowledge is the whole value of a leak |
| The drawn paper | One leak of this ends the exam |
| Keys and key shares | They open the paper |
| Blueprint and draw seed | Knowing them helps predict or steer the paper |
| Audit log | Our evidence; if it can be edited, accountability is gone |
| Identities of setters, reviewers, candidates | Privacy and safety; false accusation harm |
| Exam availability | A failed exam day also hurts candidates |

## 2. Who might attack (actors)

| Actor | Access | Motive |
| --- | --- | --- |
| Malicious setter | Their own 5 questions | Sell or share |
| Colluding setters | Several people's questions | Cover more of the paper |
| Reviewer | A limited subset | Same |
| Admin or developer | System control | Bribed or curious |
| Custodian | One share | Bribed; coerced |
| Centre staff | Their centre and printer | Bribed; coaching link |
| Candidate or paid helper in the hall | A printed copy | Photograph and send out |
| Outsider | Network and servers | Break in |
| Leak broker | Public channels | Sell to many |

Lecture 2 attacker types (hobbyist, determined, professional, security service) are all possible; the cases we found point to determined insiders with financial motives.

## 3. Threats by stage

Columns: control, what it does (prevent, detect, or recover), residual risk, tests.

| ID | Stage | Threat | Control | Type | Residual risk | Tests |
| --- | --- | --- | --- | --- | --- | --- |
| T-01 | Submit | Setter submits in another's name | Signed submission, ownership check | Prevent | Stolen setter key | AB-01, AB-02 |
| T-02 | Submit | Setter leaks own questions | Late random draw limits value; logs | Limit, detect | Leaked items can still appear in the paper | SIM-01 |
| T-03 | Submit | Injection or script in question text | Input handling, storage as text | Prevent | Parser bugs | AB-05, AB-06 |
| T-04 | Pool | Reviewer reads too much | Assignment and cap | Prevent | Reviewers can still memorise their subset | AB-10 |
| T-05 | Pool | Duplicate or planted question to steer the draw | Similarity check, quotas | Detect | Subtle paraphrase | B6 tests |
| T-06 | Draw | Admin grinds the seed to get a favourable paper | Commit before lock, custodian contributions | Prevent | Collusion of admin and custodians | AB-11, AB-12 |
| T-07 | Draw | Skewed draw concentrates exposure | Quotas and repair, simulation | Limit | Blueprint cells with few questions | SIM-01, SIM-02 |
| T-08 | Seal | Operator copies the paper during sealing | Quorum authorisation, automated, witnessed, logged, memory wiped | Limit, detect | The sealing machine is the trust anchor (A11) | AB-13, AB-14, AB-15 |
| T-09 | Seal | Fewer than k custodians seal | Threshold rule | Prevent | None if k honest | AB-13 |
| T-10 | Store | Bundle altered or swapped | Hash in log, authenticated encryption | Prevent, detect | Loss of all copies | AB-19 |
| T-11 | Release | Early release or release at the wrong centre | Signed token with window and nonce, centre binding, fail closed | Prevent | Dishonest quorum | AB-16, AB-17, AB-18, AB-20 |
| T-12 | Release | Clock tampering | Authority time in token, tolerance, log of skew | Prevent, detect | Large drift causes a delay | AB-17 |
| T-13 | Release | Custodian bribed or coerced | Need k, not one; log of approvals; coercion cannot be fully stopped | Limit | k bribed custodians | SIM-06 |
| T-14 | Print | Reprint to give extra copies | Copy IDs, reprints logged and need approval | Detect | Staff collusion | AB-21 |
| T-15 | Print | Forged copy ID | Check digits and signed copy table | Prevent | None for IDs we issue | AB-22 |
| T-16 | Hall | Photograph of a copy sent out | Per-candidate order shows source seat | Detect | Cannot stop the photo | SIM-03 |
| T-17 | Log | Edit or truncate history | Hash chain, signatures, published head | Detect | Truncation if the head is not published | AB-24, AB-25 |
| T-18 | Trace | Wrong person blamed | Confidence, reasons, human confirmation, right of reply | Limit harm | Judgement errors | AB-27, SIM-04 |
| T-19 | Trace | Investigator sees too much personal data | Case scoping, minimal data | Prevent | Misuse by an assigned investigator | AB-26 |
| T-20 | Web | Login guessing, session theft, cross-site request | Slow password hash, rate limit, safe cookies, request tokens | Prevent | Phishing of users (social engineering) | AB-07, AB-08 |
| T-21 | Web | Errors or logs reveal secrets | Controlled error messages, log hygiene | Prevent | Mistakes in new code | AB-30 |
| T-22 | Availability | Printer or power failure at centre | Fallback with same controls, logged | Recover | Fallback becomes a weak path | SIM-05 |
| T-23 | Availability | Denial of service on the server | Rate limits; bundles distributed in advance so release does not depend on the server | Limit | Prolonged outage delays release | AB-04 |
| T-24 | Key | Key file stolen | Revocation honoured after the revoke entry; keys per role | Limit | Time between theft and revoke | AB-31 |

## 4. Security properties this protects (Lecture 2)

| Property | Where we address it |
| --- | --- |
| Confidentiality | Encryption, split key, role scoping, late draw |
| Integrity | Signatures, authenticated encryption, hash chain, draw commitments |
| Availability | Fallback, advance distribution, fail-closed tradeoff stated |
| Accountability | Signed actions, audit log, per-copy IDs |
| Authentication | Setters, custodians, centres, signed tokens |
| Access control | Matrix and scoping rules |
| Auditing | Append-only log and auditor role |

## 5. Limits we state openly

1. Cannot stop a person in the hall photographing a copy; we make it traceable (T-16).
2. Cannot prevent a dishonest quorum of custodians; we raise the number needed and log what they do (T-13).
3. The sealing machine is trusted for a short ceremony (A11).
4. Leaks in private channels are invisible to us (A9).
5. Social engineering of staff and custodians is real. The class has not covered it yet; we will add it when it is (Lecture plan).
6. A stolen signing key undermines non-repudiation (Lecture 2 caveat).
7. Impersonation of candidates is out of scope (A1).
