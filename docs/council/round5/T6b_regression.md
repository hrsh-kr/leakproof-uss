# T6b: regression pass on the final snapshot (app-final, 96 tests pass)

Method: fresh copy, real `public/app.js` in jsdom against three servers (practice with `LP_INVITE_CODE=LEAKPROOF-G19`, demo = `LP_MODE=official LP_INSTANCE=demo` with `--demo --out`, and official without `--demo`). All started servers are killed. Real browser behaviour (focus order, print, pop-ups) is unverified. Not run: 15-minute expiry, 30-minute idle.

## 1. Earlier findings

| ID | Status | Evidence |
|---|---|---|
| F1 placeholders in guide | Fixed | Guide has `LEAKPROOF-G19`; registering with `leakproof-g19` worked. Fingerprint now lives in TESTERS (`{{...}}` filled at release). |
| F2 Exam cell tab dead after Seal/Verify | Fixed | After Seal the hash is `.../cards`; clicking Exam cell shows the release form; same after Verify. |
| F3 trace ambiguity | Fixed (documented) | Note "2 seats match; paste the options as well for a single seat." (9 of 10 question-only traces on 40 seats were ambiguous). |
| F4 "Request release again" | Not fixed | Button is "Request release" whenever the cell page is reloaded after an ended request (`app.js:467`); "again" only in the live watcher. Guide 6.4 still says it shows "Request release again". |
| F5 Approve label | Fixed | Guide uses "Approve with card N". |
| F6 log head "should match" | Changed | Guide 4 says heads can differ; both screens still print "It should match the exam cell screen" (`app.js:594`) and "Key holders see the same value". |
| F7 draw replay | Fixed | Guide 8.3 script run on a downloaded log: all 10 topics "matches". |
| F8 official example | Changed | Example now has 3 setters and 9 accounts. Guide pods use 2 setters, 8 accounts (names `p1-...` come only from `demo-setup.sh`). Seal with 2 setters on all 5 topics worked. |
| F9 URL vs tab | Fixed | `replaceState` keeps hash in step. |
| F10 Delete confirm | Fixed | 8 s, toast announces. |
| F11 20/min limit | Fixed | Now 60/min (`app.mjs:321`). |
| F12 "Waiting for" lists all five at 0 approvals | Not fixed | Seen again. |
| F13 forced change in UI | Verified | See 2. |

## 2. Guide followed literally

Matches: sign-up flow; Continue grey until a Copy/Download plus the tick (tick alone leaves it disabled); banner; seal confirm focus on Cancel; 14-character rule (13 chars, repeated char, mismatch messages shown); verify warning "You have not saved this card ..." on first press, then verifies after Download; bulk file name `leakproof-cards-1-2-3-4-5.txt`; toast "Cards 1, 2, 3, 4, 5 verified. The server deleted its copies."; release words, "N of 3 approved", "Quorum reached: the paper is open."; "Start over with new words" replaces the request with new words and clears the lockout; Key page shows "ANSWER KEY. NOT FOR CANDIDATES"; seal log entry carries `seed` = SHA-256 of the seed bytes (true; guide does not say bytes versus hex text); newline and zero-width characters refused with "Type plain text." (message is longer than the guide's quote, fine); forced change page "New passphrase", button "Get a new passphrase", 403 "Set your own passphrase first."; demo pods show header "Demo" and have no forced change; single-card flow in the demo; holder lockout message.

Mismatches:

| # | Sev | Guide says | App does |
|---|---|---|---|
| G1 | low | 6.4 "shows Request release again" | F4 above |
| G2 | low | 4 heads can differ | UI says they should match (F6) |
| G3 | low | 10 accounts `p1-setter-a`, `-hold-N`, 8 per pod | `official.example.json --demo` gives 9 accounts with other names. Fine if the VM uses `demo-setup.sh`; say so |
| G4 | low | 6.3.3 "first 3 fetches logged one by one" | True (`REPRINT_LOGGED=3`), but the cell page still says "Every fetch is logged", help.html says "Every print is logged", the copy page says "Reprint: this is counted in the log" |
| G5 | low | 4/7.2 lockout wording "Ask the exam cell to request release again" | Button is named "Start over with new words". In practice one account is locked on all five cards at once |
| G6 | low | 6.5 trace result | After a 2-question error the previous result stays on screen under the error |
| G7 | info | 2.3 course code `LEAKPROOF-G19` | Local default is `USS-PRACTICE` (guide says so) |

## 3. Changed screens (jsdom)

Secrets guard, save warning, 14 characters, help link on log-in and register, trace note, release watch with the new button (visible while pending, hidden when closed), tab refresh: all work as intended. Only G5 and G6 are blemishes.

## 4. help.html and TESTERS template

- `help.html` is served without login and prints the course code `LEAKPROOF-G19` (fetched: 200, one occurrence). That code is the only sign-up gate; anyone reaching the port can now register. Low, but say so deliberately or drop the code from help.html. No passwords or keys anywhere.
- Factual errors: TESTERS says "95 tests"; `npm test` reports 96. help.html "Every print is logged" (see G4). help.html "at least 4 cards" and "14 characters" are right. TESTERS "Demo pods ... 8 accounts" matches `demo-setup.sh` only.
- TESTERS places demo passphrases and recovery codes in one shared page: a recovery code lets anyone set a new passphrase on a shared demo account (by design, nightly reset). Contains `{{...}}` placeholders; fill all before posting.
