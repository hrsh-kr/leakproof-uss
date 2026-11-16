# Tool Specification, Build Order and Test Plan

Status: v1. This is the step-by-step plan for building the tool and proving it works. Decisions behind the design are in `02_final_scope_and_decisions.md` (referenced as D1 to D16). Threats are in `05_threat_model_v0.md`.

Ground rules:
1. **Deny by default.** If no rule allows an action, it is refused.
2. **Least privilege.** Each role sees and does only what its job needs.
3. **Fail closed.** If anything needed for release is missing, nothing is released. Availability is recovered through a logged fallback.
4. **Append only.** Nobody edits or deletes history. Mistakes are corrected by new entries.
5. **Tests are not optional.** Each module is written with its tests. A module is not done until its tests pass, its abuse cases are written to try to break it, and its permission rows are tested.
6. **Break our own system.** Every bug our tests or teammates find goes into `logs/vulnerabilities.csv` with class, cause and lesson. This feeds Part B of the final video.

---

## 1. Architecture

```
                 Browser (roles: setter, reviewer, admin, custodian,
                          centre staff, investigator, auditor)
                                   |
                         Web app (FastAPI, server-rendered pages)
                                   |
        +------------+-------------+--------------+----------------+
        | iam        | pool        | draw          | sealing        |
        | users,     | submissions,| blueprint,    | ceremony,      |
        | sessions,  | review,     | commit, seed, | bundle         |
        | policy     | dedupe      | repair        |                |
        +------------+-------------+--------------+----------------+
        | release    | printing    | tracing       | auditlog       |
        | token,     | per-copy    | matcher,      | hash chain,    |
        | protocol   | permutation | suspects      | signatures     |
        +------------+-------------+--------------+----------------+
                                   |
                  crypto (AES-GCM, Ed25519, hashing: library)
                  shamir (our own code, tested against a reference)
                                   |
                                SQLite
        Simulators: centre client, leak generator, collusion, red-team console
```

Language and stack: Python, FastAPI, SQLite, pytest, hypothesis (D11, D15). Cryptographic primitives come from the `cryptography` library; Shamir sharing is our own code (D3).

## 2. Roles and permissions

### 2.1 Roles

| Role | Who | Main job |
| --- | --- | --- |
| anonymous | Not logged in | Can see the public log head and log in |
| setter | Question author | Submit questions for assigned cells |
| reviewer | Checks questions | Review assigned questions only |
| admin | Exam authority operator | Configure profiles, assign people, start a draw and seal. Not trusted individually (A5) |
| custodian | Holds a key share | Approve sealing and release with a signature |
| centre | Centre superintendent or staff | Request release and print for their own centre |
| investigator | Handles leak cases | Run the matcher, view case suspects |
| auditor | Independent checker | Read the full log and verify it |

### 2.2 Scoping rules (applied on top of roles)

| Rule | Meaning |
| --- | --- |
| S1 Ownership | A setter touches only their own submissions |
| S2 Assignment | A reviewer sees only questions assigned to them, up to a cap, never their own |
| S3 Centre | Centre staff see only their own centre's bundle, candidates and print jobs |
| S4 Time | Release and print work only inside the signed window; submission only before the pool locks |
| S5 Case | An investigator sees only the cases assigned to them |
| S6 Separation | A user cannot hold admin together with custodian, reviewer or setter |
| S7 Default deny | Anything not in the matrix returns 403 |
| S8 Least data | List endpoints return only what the caller may see, nothing more |

### 2.3 Permission matrix (single source of truth)

Y = allowed. Y(rule) = allowed only under that scoping rule. N = refused. Tests are generated from this table (section 6.3). Changing a cell requires a row in `logs/design_decisions.csv`.

| Action | anon | setter | reviewer | admin | custodian | centre | investigator | auditor |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Log in, log out | Y | Y | Y | Y | Y | Y | Y | Y |
| Read public log head hash | Y | Y | Y | Y | Y | Y | Y | Y |
| Submit question | N | Y(S1,S4) | N | N | N | N | N | N |
| Read own question content | N | Y(S1,S4) | N | N | N | N | N | N |
| Read another person's question | N | N | Y(S2) | N | N | N | N | N |
| Submit a review | N | N | Y(S2) | N | N | N | N | N |
| Create or edit exam profile and blueprint | N | N | N | Y | N | N | N | N |
| Assign setters and reviewers | N | N | N | Y | N | N | N | N |
| Lock the pool | N | N | N | Y | N | N | N | N |
| Start a draw | N | N | N | Y | N | N | N | N |
| See balance report (counts only) | N | N | N | Y | N | N | N | Y |
| Read any question text in bulk | N | N | N | N | N | N | N | N |
| Read the drawn paper in plaintext | N | N | N | N | N | N | N | N |
| Start sealing ceremony | N | N | N | Y | N | N | N | N |
| Approve sealing (signature) | N | N | N | N | Y | N | N | N |
| Provide a key share at release | N | N | N | N | Y(S4) | N | N | N |
| Request release for a centre | N | N | N | N | N | Y(S3,S4) | N | N |
| Submit seating report | N | N | N | N | N | Y(S3) | N | N |
| Print a copy | N | N | N | N | N | Y(S3,S4) | N | N |
| View candidate seat list | N | N | N | N | N | Y(S3) | Y(S5) | N |
| Read full audit log | N | N | N | Y | N | N | N | Y |
| Read log entries for a case | N | N | N | N | N | N | Y(S5) | Y |
| Verify the audit chain | N | N | N | Y | N | N | Y | Y |
| Write or delete audit entries directly | N | N | N | N | N | N | N | N |
| Upload leak evidence, run matcher | N | N | N | N | N | N | Y(S5) | N |
| View suspect list | N | N | N | N | N | N | Y(S5) | N |
| Confirm or dismiss a suspect | N | N | N | N | N | N | Y(S5) | N |
| Respond to a case naming me | N | Y(S1) | Y(S1) | N | Y(S1) | Y(S1) | N | N |
| Create users, assign roles | N | N | N | Y(S6) | N | N | N | N |
| Delete any record | N | N | N | N | N | N | N | N |

Notes: the system itself (not a person) opens plaintext in memory during sealing and in the centre client after release (D9). That is why the "read in plaintext" rows are N for every human role.

## 3. Data model (tables)

| Table | Holds | Notes |
| --- | --- | --- |
| users | id, role, password hash, public key, status | Roles exclusive under S6 |
| profiles | exam profile config (JSON) | Validated on load |
| cells | profile, topic, difficulty, quota | From blueprint |
| assignments | setter to cell; reviewer to question | Enforces S1, S2 |
| questions | id, cell, owner, ciphertext, signature, status, similarity hash | Plaintext never stored |
| reviews | question, reviewer, verdict, note | |
| draws | profile, shift, seed commitments, selected question IDs, balance report | IDs only |
| bundles | draw, centre, ciphertext, wrapped data, key-share metadata | Per centre |
| releases | bundle, token, nonce, window, shares received, outcome | |
| copies | copy ID, bundle, candidate seat, permutation seed, status | One row per printed copy |
| audit_log | index, time, actor, action, subject, details, previous hash, hash, signature | Append only |
| leak_items | text, source label, time | From corpus or paste-in |
| matches | leak item, question, score, copy hint | |
| suspects | case, subject, score, reasons, human decision | Decision required before action |
| cases | investigator, status, response from named person | Supports right of reply |

## 4. Stage-by-stage behaviour

| Stage | What happens | Checks (any failure refuses and logs) | Inspector shows |
| --- | --- | --- | --- |
| S0 Setup | Custodians generate key pairs. A pool key is created and split k of n. Public keys are registered | k and n valid; each share verified on receipt; public keys unique | Who attended, shares issued, quorum rule |
| S1 Onboarding | Admin assigns setters to cells; reviewers to subsets | Cell quotas not exceeded; S6 respected | Assignment counts, not content |
| S2 Submission | Setter encrypts a question to the pool key and signs it | Signature valid; setter owns the cell; before lock; size limit; no replay | Ciphertext, signature, receipt |
| S3 Review | Reviewers check assigned questions; dedupe computes similarity hashes | Cap per reviewer; not own question; duplicates flagged by hash | Reviewer subset size, duplicate flags |
| S4 Draw | Admin commits a seed before the pool locks; custodians add contributions; final seed = hash of all plus the pool root. Engine picks IDs per quota, repairs, reports | Commitments precede lock; same inputs give the same draw; quotas met or reason given | Commitment, final seed, balance report, repetition check |
| S5 Sealing | A quorum of custodians authorises. The sealing component rebuilds the pool key in memory, decrypts selected questions, builds the paper, encrypts it under an exam key, splits that key, wipes memory | Quorum signatures valid; selected IDs match the draw; output verified by decrypting a test copy in a sandbox and discarding | Quorum status, bundle hash, no plaintext |
| S6 Distribution | Bundles delivered per centre | Hash of bundle matches log | Bundle hashes per centre |
| S7 Release and print | Authority issues a signed token with window and nonce. Centre submits a signed seating report. Quorum provides shares. Client rebuilds the key, prints per-candidate copies | Token valid and unexpired; nonce unused; centre matches bundle; shares valid; clock within tolerance; fail closed | Token fields, nonce, quorum progress, window, copy IDs |
| S8 Audit and response | Everything logged. Investigator uploads leaked text; matcher links it to questions and copies; suspects ranked | Evidence hash stored; suspect scores shown with reasons; human decides | Matches, access list, score breakdown |

## 5. Build order (each step is a gate)

Each step ends with: tests written and passing, abuse cases tried, permission rows tested, decision log updated.

| Step | What we build | Done when (tests) | Target date |
| --- | --- | --- | --- |
| B0 | Repo, virtual environment, pytest, lint, `make test`, empty test layers | Smoke test passes on a clean clone | Oct 2 |
| B1 | Crypto wrapper and Shamir sharing | Property tests: any k shares reconstruct, fewer than k do not (consistency check); matches reference library and known vectors; wrong or corrupted share detected | Oct 3 |
| B2 | Hash-chained signed audit log | Valid chain verifies; any edit, deletion, reordering or truncation is detected; signature check | Oct 3 |
| B3 | Users, sessions, RBAC policy | Matrix tests for every cell; default deny proven; S6 enforced | Oct 8 to 10 |
| B4 | Profile loader and blueprint | Five valid profiles load; invalid ones are rejected with clear errors | Oct 10 to 12 |
| B5 | Setter submission | Ownership, replay, tamper, size and injection tests pass; admin cannot read content | Oct 12 to 16 |
| B6 | Review and dedupe | Cap and assignment rules; duplicates flagged; no reviewer sees more than the cap | Oct 16 to 20 |
| B7 | Draw engine with commitments | Determinism; quota compliance; seed-grinding test; repair reports failures; exposure simulation | Oct 21 to 25 |
| B8 | Sealing ceremony | Fewer than k cannot start; selected IDs match; no plaintext in storage or logs; memory handling documented | Oct 25 to 29 |
| B9 | Release protocol | Replayed, expired, early, wrong-centre and clock-skew cases refused; fail-closed test | Oct 29 to Nov 2 |
| B10 | Per-copy printing and fingerprint recovery | Permutation invertible; partial photo recovers copy ID; forged IDs rejected; answer key maps per copy | Nov 2 to 5 |
| B11 | Matcher, suspect scoring, collusion simulator | Planted leaks found; false-positive rate measured; suspects need human confirmation | Nov 5 to 9 |
| B12 | Web UI, inspector panels, red-team console, guided tour, user guide | End-to-end test for all five profiles; a new user completes the main flow in a usability test | Nov 9 to 14 |
| B13 | Hardening: self-pentest, round 3 usability, fixes, freeze | Full suite green; vulnerability log reviewed; release build | Nov 14 to 16 |

## 6. Test plan

### 6.1 Layers

| Layer | What it checks | Tool | Example |
| --- | --- | --- | --- |
| Unit | Pure functions | pytest | Permutation is its own inverse; hash chain function |
| Property | Rules that must hold for any input | hypothesis | For random secrets and k, n: any k shares rebuild; any single bit change in the log breaks verify |
| Permission matrix | Every role, action, scoping case | pytest, table-driven | Reviewer reads question not assigned: 403 |
| Abuse ("break it") | Active attempts to defeat a control | pytest | Replay a release token; submit as another setter |
| Simulation | Statistical and behavioural claims | pytest with fixed seeds | Compromise p of the pool and measure exposure; planted-leak recall |
| End to end | Whole pipeline per exam profile | pytest, test client | Seal, release, print, leak, trace |
| Usability | Humans using it | Scripts in `research/` | Ceremony task time and errors |
| Static | Common mistakes | ruff, bandit (if installable) | Hard-coded secrets, unsafe calls |

### 6.2 Rules

1. **Test first.** Write the failing test, see it fail, then make it pass.
2. **Fixed seeds** for all random tests, printed on failure, so failures can be reproduced.
3. **No test uses real secrets.** Test keys are generated per test run.
4. **Targets:** at least 85% line coverage on core libraries; 100% of matrix cells tested; every security requirement marked Must has at least one test ID; every abuse case in section 6.4 has a test.
5. **Break log.** A failing test that reveals a real bug is logged in `logs/vulnerabilities.csv` before it is fixed.
6. **Do not weaken a test to make it pass.** If a test is wrong, say why in the commit.

### 6.3 How the permission tests are generated

The matrix in section 2.3 is stored as a data file (`tests/permissions/matrix.yaml`). A single test function loops over every (role, action, scoping case) and checks the status code and what the body contains. A second test asserts that every route in the app appears in the matrix; an unlisted route fails the build, which enforces default deny. A third test checks that list endpoints never return rows the caller may not see (S8).

### 6.4 Abuse catalogue (the "break it" list)

| ID | Stage | Attack we try | Expected result |
| --- | --- | --- | --- |
| AB-01 | Submit | Submit into another setter's cell (IDOR) | 403, logged |
| AB-02 | Submit | Alter signature or ciphertext | Rejected, logged |
| AB-03 | Submit | Replay an old submission | Rejected |
| AB-04 | Submit | Oversize or malformed payload | Rejected, no crash |
| AB-05 | Submit | HTML or script in a question | Stored as text, never executed |
| AB-06 | Submit | SQL metacharacters in any text field | No effect on database |
| AB-07 | Login | Many wrong passwords | Rate limited or locked, logged |
| AB-08 | Session | Reuse or forge a session cookie; missing cross-site protection on state changes | Refused |
| AB-09 | Permission | Admin tries to read question text or paper | 403 |
| AB-10 | Review | Reviewer exceeds cap, or reviews own question | Refused |
| AB-11 | Draw | Admin tries many seeds after seeing the pool (grinding) | Commitment made before lock makes later seeds invalid |
| AB-12 | Draw | Change inputs after commit | Draw hash mismatch, refused |
| AB-13 | Sealing | k minus 1 custodians try to seal | Refused |
| AB-14 | Sealing | Selected IDs differ from the draw | Refused |
| AB-15 | Sealing | Look for plaintext in database, files, logs, error messages | None found |
| AB-16 | Release | Replay a used token or nonce | Refused |
| AB-17 | Release | Expired token; token before window; centre clock set forward or back | Refused |
| AB-18 | Release | Centre A uses centre B's bundle or token | Refused |
| AB-19 | Release | Bundle bytes changed in transit | Hash check fails |
| AB-20 | Release | A missing item (no seating report, short quorum, no token) | Nothing prints (fail closed) |
| AB-21 | Print | Reprint a copy with the same ID | Refused or new ID logged |
| AB-22 | Print | Forge a copy ID | Check digits fail |
| AB-23 | Print | Custodian reuses a share after the window | Refused |
| AB-24 | Log | Edit, delete, reorder or truncate an entry | Verify fails; truncation caught by published head |
| AB-25 | Log | Direct write by any role | 403 |
| AB-26 | Trace | Investigator opens a case not assigned to them | 403 |
| AB-27 | Trace | Act on a suspect without human confirmation | Refused |
| AB-28 | Trace | Path traversal or huge file in an upload | Rejected |
| AB-29 | General | Double submit and race conditions | Single effect |
| AB-30 | General | Error messages and logs leaking secrets or internal paths | None found |
| AB-31 | General | Stolen custodian key file | Revocation honoured after the revoke entry |

### 6.5 Simulation tests

| ID | Claim | Method | Pass rule |
| --- | --- | --- | --- |
| SIM-01 | Compromising a fraction p of the pool exposes about p of a paper | Simulate many draws per profile, vary p | Mean exposure within a stated tolerance of p; report variance |
| SIM-02 | Blueprint concentrates exposure when compromised setters share a topic | Compromise one topic's setters | Report the extra exposure honestly |
| SIM-03 | Matcher finds planted leaks | Plant exact, edited and translated-style variants | Report recall and precision per variant |
| SIM-04 | Suspect scoring beats a plain access list | Compare on planted leaks with single and colluding leakers | Report accuracy; if worse, switch (D7) |
| SIM-05 | Fallback keeps controls | Simulate printer and power failure | Logged and still fail closed |
| SIM-06 | k and n sensitivity | Vary k, n, absentee rate | Report how often release succeeds vs. how often a dishonest quorum exists |

### 6.6 Definition of done for any module

- [ ] Spec lines in this file implemented
- [ ] Unit and property tests written first, passing
- [ ] Permission matrix rows tested
- [ ] Abuse cases for this stage written and passing
- [ ] Coverage target met
- [ ] Nothing sensitive in logs or errors
- [ ] Decision log and vulnerability log updated
- [ ] Inspector panel text written in plain language (reviewed by someone who did not write it)

## 7. Code layout

```
tool/
  pyproject.toml     Makefile     README.md
  src/leakproof/
    crypto/        aead.py  signing.py  shamir.py
    auditlog.py
    iam/           users.py  rbac.py  policy.py  sessions.py
    profiles/      schema.py  loader.py  data/*.json
    pool/          submission.py  review.py  similarity.py
    draw/          blueprint.py  engine.py  commit.py
    sealing/       ceremony.py  bundle.py
    release/       token.py  protocol.py
    printing/      fingerprint.py  answerkey.py
    tracing/       matcher.py  suspects.py  corpus.py
    sim/           collusion.py  leakgen.py
    web/           app.py  routes/  templates/  static/
  tests/
    unit/  property/  permissions/  abuse/  simulation/  e2e/
```

## 8. Linking requirements to tests

`06_requirements_register.md` has a test column. Each Must security requirement lists test IDs (for example `AB-16`, `SIM-01`, or a matrix row). A script (`make trace`) checks that every Must requirement has at least one test and prints the gaps. Screenshots or logs from passing tests become the evidence for "satisfaction of security requirements".

## 9. Assumptions and pros and cons of this test plan

- **Assumption:** the owner and Claude will have time for tests alongside features. If time runs short, we cut features before cutting tests.
- **Pro:** tests are evidence for the grade and protect us during peer testing.
- **Con:** adds roughly a third more work per module. We accept it, and we limit the cost by generating permission tests from one table.
- **Alternative considered:** only end-to-end tests. Rejected because they hide which control failed and miss the scoping cases.
