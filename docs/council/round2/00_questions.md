# Round 2: three contested questions

Context: read `../00_brief.md` and the round-1 proposals in `../round1/` (S1_crypto, S2_redteam, S3_requirements, D1_architecture, D2_vm_ops, H1_hci, H2_usability_testing, U1_uiux, U2_visual, V1_verification, V2_validation, P1_pm, P2_dev, A1_collison, A2_graham, A3_thiel). Where council members AGREE (do not re-argue): keep Node and reuse tested crypto, not Python; one vertical slice with a feature freeze on 15 Nov; deploy to the VM within a day; server-side default-deny roles with a test for every route; every blocked state names its gate and next step; keep a vulnerability log for the video; fix the 32-bit PRNG, the forgeable copy-ID check digit, the 120/127-bit key, duplicate-share acceptance in combine(), and the "wiped" key/paper still held in pipeline-core after the wipe.

## Q1. Key architecture: when can plaintext exist, and on which machine?
- S1: setters encrypt to a **pool public key**, each question under its own random AES key; the pool private key is wrapped and Shamir-split 3 of 5; the draw runs on IDs only; **one** release ceremony; no plaintext before release; fallback is a trusted draw server.
- D1/P2/S3: setters encrypt in the browser to a pool public key; **the server decrypts only the ~10 drawn questions in memory at sealing** (seconds), builds the paper, re-encrypts, and release decrypts in the centre browser.
- Unresolved facts to confront: if the pool private key is rebuilt at release, does that expose all ~100 questions rather than the 10 drawn? Who holds the pool private key at sealing, and what exactly can the VM operator read? How many ceremonies does a tester have to complete alone? What can we honestly claim? Can it be built and tested in about 1.5 days?
- Sides: **Advocate A1 = S1 (pure pool-key design)**; **Advocate A2 = D1+P2 (server seals in memory)**.

## Q2. Scope and what we demo: 3 roles vs 5 roles, and the sandbox
- A2/P1 (Graham, PM): ship **3 roles** (admin, key-holder, superintendent), one real exam, a reset button, deploy daily; setters/auditor are seeded or cut.
- A3/U1/V2/D1: **5 roles** (setter, admin, custodian, superintendent, auditor), a **per-tester sandbox** with all roles pre-created and a reset button, and the headline demo is **leak-to-seat tracing from a cropped photo** (the fingerprint is the question/option order, not the printed ID).
- Unresolved: what is the minimum that earns the 25% usability + 25% security marks and survives 8 attackers working ALONE (a single tester cannot form a 3-of-5 quorum without playing several roles; is that honest)? Is auditor/leak-trace a must for the Part B video? How many screens can one builder + AI pair finish by 15 Nov?
- Sides: **Advocate B1 = A2+P1 (3 roles, ruthless)**; **Advocate B2 = A3+U1+V2 (5 roles + sandbox + tracing)**.

## Q3. Custodian shares and approval: what is secure AND usable for tired officials, and survivable for attackers?
- H1: approval is a **plain card + a two-word check bound to one displayed request, expiring, never typing key pieces**; fallback behind a deliberate path.
- P2: server stores each custodian's share **wrapped under their scrypt-derived key**; the custodian unwraps in their browser and submits it at release.
- S3: custodian shares are **held offline**; D2: key in a 0400 file via a systemd credential.
- Unresolved: where does each share live, who can read it, how does an approval actually carry cryptographic weight (not just a UI click), what does a classmate attacker try (replay, shoulder-surf, steal a session, approve as another custodian), what does the fallback (4 of 5 plus a reason) look like, and how does one lone tester complete the ceremony honestly?
- Sides: **Advocate C1 = H1+S3 (human-centred, offline shares, request-bound approval)**; **Advocate C2 = P2+D2 (wrapped shares on the server, browser unwrap)**.

## Your task (every advocate)
1. Read the round-1 files named for your side and your opponent's. Skim the code you need (`project/site/src/js/logic.mjs`, `pipeline-core.mjs`, `project/site/api/`).
2. Write, in under 500 words, to `round2/<your id>.md`: (a) your side's strongest case in three bullets, (b) the **two best attacks on the OTHER side's proposal** (concrete flaws, not rhetoric), (c) **one concession** you make, (d) a **proposed compromise** that you could live with, with what it costs in days, and (e) the single biggest risk of the compromise.
3. Reply with a <=100 word digest of (c) and (d). Be intellectually honest: if the other side is right on something, say so. These are role-played lenses for a student project.
