# T6: functional and usability testing (snapshot of 14 Nov 2026)

Method. Copy of the snapshot, servers on 8860 (practice) and 8861 (official), temp data dirs, both killed at the end. jsdom installed fine, so the **real `public/app.js` ran against the server** (registration, seal, bulk cards, wrong passphrase, release, approvals through the real forms). Everything else was driven through the API with a cookie client. Scripts are in `/private/tmp/claude-501/t6work/jsd/` (`full.mjs`, `api2.mjs`, `flows.mjs`, `flows2.mjs`, `off.mjs`, `an.mjs`). jsdom is not a browser: layout, real keyboard focus order, screen-reader output and `window.open`/print are **unverified** (read from code). Not run: 15-minute request expiry, 30-minute idle sign-out, 5 wrong words (my own rate limit tripped first), file picker, forced-change page in the UI (API only).

## Findings (ID | title | class | severity | evidence | impact | smallest fix | confidence)

| ID | Title | Class | Sev | Evidence / PoC | Impact | Smallest fix | Conf |
|---|---|---|---|---|---|---|---|
| F1 | Guide still has placeholders for the course code and certificate fingerprint | guide | **high** | `USER_GUIDE.md` lines 6-7: `<printed by install.sh>`, `<from install.sh>`. Registration needs the code (`app.mjs` register route, 403 otherwise). | A stranger cannot create an account; first thing every classmate hits. | Fill both before posting (code is `USS-PRACTICE`, case-insensitive, verified). | high |
| F2 | "Exam cell" tab click does nothing right after Seal or Verify | functional | **med** | `refresh(x,'cards')` re-renders without changing the hash. After sealing from `#/exam/ID/cell` the page shows Key cards but the URL stays `/cell`; the tab button sets the same hash, so no `hashchange`, no re-render. Reproduced in jsdom: click "Exam cell" after verify, page unchanged (`cell` field "Occupied seats" not found). Clicking "Key cards" then "Exam cell" works. | Practice user (who holds all roles) clicks Exam cell to request release, nothing happens; reload/back also lands on the wrong tab. | In `refresh` set `location.hash` to the tab (or have `open()` call `route()` when hash equal). | high |
| F3 | Trace with 3 questions and no options names several seats | functional | **med** | 60 seats x 10 questions: 83 of 180 question-only 3-fragments match more than one seat (simulation `an.mjs`); live: no options gives `["7:1-3","53:5-7"]`, with options gives `["7:1-3"]`. 5-topic official paper: 35 unique question orders in 40 seats; question-only trace gave 2 matches. | Guide says the trace "names the seat". The UI says only "Paste at least 3 consecutive questions with their options" in the error and placeholder; a classmate pasting only stems will report "wrong seat". | State in guide and result text "options required for a single seat; more than one match means paste more". | high |
| F4 | Guide: "Request release again" button is not always there | guide | low | `cellTab` always labels the button "Request release" (plus "Last request: interrupted/refused..."); "Request release again" exists only in the live release watcher (`releaseWatch`). After a restart I saw state `interrupted`, button reads "Request release". | Literal guide text does not match. | Reword guide: "Request release (again)". | high |
| F5 | Guide: "Approve" / "Refuse" are really "Approve with card N" / "Refuse with card N" | guide | low | `approveForm` labels. | Mismatch only. | Reword. | high |
| F6 | Guide: "log head ... should match" can be false | guide | low-med | `releaseView` returns `log.head()`; every approval, words_failed and copy fetch appends. Holder page polls every 10 s and its signature (`watchCards sig`) ignores the head; cell polls every 5 s and includes it. After one approval the two screens differ for up to 10 s, and a holder who typed a wrong word moves the head too. | Whoever follows the "compare" check sees a mismatch and suspects tampering. | Say "the head at the moment you opened the screen"; or drop the check. | med (read code, partly run) |
| F7 | Draw replay description not self-sufficient | guide/functional | low-med | Page says "HMAC-SHA256 stream keyed by the seed, label draw\|t, rejection-sampled ... draw() in src/exam.mjs is the reference code". I replayed with the real `draw()` from the published seed and pool: equal (`true`, pool 40). Without the source (classmates only get the VM and browser) it cannot be replayed from the page alone. | A classmate files "draw not replayable". | Publish a 15-line standalone script in the guide, or show the stream construction (`crypto.mjs` `Stream`). | med |
| F8 | Official example needs 10 questions: both setters on all 5 topics | usability | med | `off.mjs`: A only: "Not ready: ... need at least 2 different setters" (all 5); B 4 of 5: "Algorithms need ..."; after B topic 5: seal OK, 5 questions. Seal does work with the example file (2 setters, 5 topics). | Demo day: each setter must write 5 questions, none may be skipped, and the message does not name the missing setter. Only 2 setters means no spare. | Add a third setter to the example; message "needs a second setter" naming counts. | high |
| F9 | After a verify or seal the "Next step" box and URL disagree with the tab shown | usability | low | `AFTER SEAL hash .../cell` while Key cards visible. Same cause as F2. | Confusing back button. | Same as F2. | high |
| F10 | Two-step Delete gives no announcement, 4 s timeout | a11y | low | `action()` swaps button text only; no `aria-live`; arms for 4000 ms. | Screen-reader and slow users lose the confirm. | Put text in the status region, 8 s. | med (code) |
| F11 | 20 requests/min per account on verify, decide and trace | functional | low | `bucket: 'sensitive'`; my 5-wrong-word loop returned "Too many attempts. Wait a minute." before the 5-word lockout could trigger. | Heavy testers see it; a keyholder who retries words/passphrase quickly gets a vague stop. Words lockout was **not** verified. | Raise to 60 or exclude verify. | high |
| F12 | Release screen lists all five holders as "Waiting for" with 0 approvals; "Seat count default 30" | usability | low | Run output: "Waiting for: Card 1 ... Card 5". | Noise; reads as 5 needed, when 3. | Show "3 more needed". | high |
| F13 | Idle/forced flows: unverified in UI | | info | Code: `sessionEnded` stores BACK and a flash; forced change tested by API only (mustChange blocks other routes with 403, `GET /api/exams/x` returned Not found before the change check). | | | low |

No functional defect found in the following (all checked, evidence in appendix): question limits (5 and 500 pass, 4 and 501 refused, 200/201 option, duplicate option case-insensitive, blank option, unicode and HTML stored literally, one per topic), seal preconditions and double seal, cards (bulk create, wrong passphrase, damaged text, garbage, wrong slot, other-exam message by code, share mismatch), release gates (seats 0, 61, "abc", "", 1.5, -1; 3 verified refused, 4 accepted; replaced; refuse; approve after refuse; same card twice; 2 of 3 no paper; restart interrupts and re-approval opens), copies (60 of 60 same question set, unique orders, adjacency rule 0 violations, reprint count 3 for seat 7, seat 0/61 refused), **answer key correct for all 60 seats** (key letter text equals the bank's correct answer; copy id of key equals copy id; also 40 seats on the official 5-topic paper, 0 errors), public log (chain intact, check-head finds a copy footer head), draw replay (equal), passphrase change (other sessions 401, this stays), recovery (old code dead, upper case accepted, sessions killed), sign-up errors, official: register and reset routes 404, per-role 404 on foreign routes.

Seat count 1 and 60 both open (60 shown; 1 via release r1 replaced before opening, 2 opened). Minimum and maximum topic counts through the code: not run (`createExam` is only reachable by script). With 3 or fewer topics identical question orders are certain among many seats (6 or fewer permutations); options shuffles still differ. Unverified.

## Guide, step by step (practice, literal)

| Guide text | Reality |
|---|---|
| s1.1 "Create a practice account", course code, username 3-32, display name | Matches. Lands directly on the exam page, not Home. |
| s1.2 passphrase and recovery once, Download, tick, continue | Matches ("Copy both", "Download", checkbox, "Continue"). |
| s1.3 "Forgot your passphrase?" | Matches. |
| s1.4 "Change passphrase" in header, others signed out | Matches (tested). |
| s2 "Show passphrase" | Matches. |
| Collect: 4 simulated setters, one per topic, Delete twice | Matches (4 per topic, 4 setters). |
| Seal: Cancel selected, Esc, "Yes, seal it" | Matches (focus on Cancel). |
| Cards: "All my cards", "Create all my cards", Download, "Load card file…", "Verify all 5 cards" | Matches. Takes ~1 s crypto each. |
| Release: disabled button with reason; two words; 5 s | Matches. |
| "Approve", "Refuse", "Request release again" | F4, F5. |
| Print/Key/Trace/Log/draw | Matches except F3, F7. |
| "Start a fresh practice exam" | Matches. |
| Course code and fingerprint | F1. |
| Missing from guide | Demo credentials per role for official; official needs 10 questions (F8); that trace needs options; that Release screen wording differs; per-role step lists for the single-card holder; seat input default is 30. |

## Heuristic evaluation (Nielsen) and accessibility

| Heuristic | Result |
|---|---|
| 1 Visibility of status | Good: stage list with `aria-current`, "Next step" box, gate list with text and glyph (not colour only), live release box with `aria-live`. Weak: F9. |
| 2 Match with real world | Good plain wording ("key card", "seats"). "G1/G2/G3" gate codes are jargon; "Quorum" ok. |
| 3 User control | Seal confirm with Cancel and Esc; refuse closes the request for everyone (stated). No undo of Delete beyond two-step. |
| 4 Consistency | Button labels differ from guide (F4, F5); "Key" button ambiguous (has aria-label). |
| 5 Error prevention | Strong: seal confirm focus on Cancel, release disabled with reason, card passphrase typed twice, verify before server drops its copy. |
| 6 Recognition | Fields are labelled; hints in labels; the word box placeholder "two words". |
| 7 Flexibility | Bulk cards and one-file approvals are a good shortcut; no shortcuts otherwise. |
| 8 Minimalist | Cell page for a practice user is long; Release page repeats the key card list. |
| 9 Error recovery | Messages say what failed and what to do (e.g. "Wrong passphrase for card 2, or the card text is damaged"; "This is key card 1, not card 2"). "Damaged" card text that breaks the base64 shows "does not look like a key card" rather than "damaged": low. |
| 10 Help | Guide is in-repo, not linked from the app. No help link in the header: low. |

Accessibility (code reading, jsdom): skip link, `lang`, labels via `for`, tablist with arrow keys, `role=alert` errors, `aria-live` toast and status regions, `aria-busy`. Gaps: after every action `page()` calls `main.focus()`, so a keyboard user restarts from the top after each refresh (seal, verify, approve); radio group for the correct option has no `fieldset/legend`; Delete confirm not announced (F10); stage and tab changes do not move focus to the panel; file input is visually hidden but reachable via "Load card file…" button. Colour-only status: none found (glyph plus text).

## Task times and step counts

Counts are a user's clicks and fields (my scripted run; times are machine time, not human time, except crypto).

| Role / task | Steps (clicks + fields) | Time |
|---|---|---|
| Any: register to exam page | 3 fields, 3 clicks (Create, tick, Continue) | 4 s scripted; ~1 min human |
| Setter: add a question | topic, text, 4 options, radio, Submit = 8 fields + 1 click | <1 s |
| Exam cell: seal | 3 clicks (Seal, Yes; cards tab opens) | 2 s |
| Key holder: bulk cards (5) | 2 passphrase fields, Create, Download, Load, passphrase, Verify = 7 | PBKDF2 600k: 0.04 s per derive in Node; browsers 0.2-0.5 s; ~5 derive for create, 5 for verify. About 5 s |
| Key holder: single card (official) | 2 fields, Create, Download, Load, 1 field, Verify = 7 | ~1 s |
| Exam cell: request release | seats field + 1 click (if F2 not hit: +2 clicks) | <1 s |
| Key holder: approve | words, load file, passphrase, Approve = 4 per card, 3 cards = 12 | ~2 s each; whole release with 3 holders about 20 s of machine time |
| Exam cell: print one seat | 2 (seat, Print) | |
| Exam cell: answer key | 2 | |
| Exam cell: trace | paste, Trace = 2 | <1 s |
| Anyone: check head | paste, Check = 2 | |
| Whole practice flow end to end (my script) | about 45 clicks and 15 fields | 58 s of scripted time, mostly fixed sleeps |

## Appendix: key outputs

```
5 chars ok | 4 chars "The question must be 5 to 500 characters." | 501 same | dup option "The four options must all be different."
seats 61 {"error":"Gate G3 (seats): 61 is above this hall's limit of 60."}   seats 0/abc/1.5 "Enter how many seats are occupied (a whole number)."
3 verified -> "At least 4 of 5 key cards must be verified before release (now 3)."
{ seats: 60, setDiff: 0, keyWrong: 0, adjViol: 0, dupOrder: 0 }   draw replay equal: true
trace: 3q+opts ["7:1-3"]; 3q no opts ["7:1-3","53:5-7"]; 2q 409 "Found 2 paper question(s)..."; wrong order []; extra text ["7:1-3"]
restart: old session 401, request "interrupted", re-request and re-approve opened the paper
official: seal A only -> all 5 topics "need at least 2 different setters"; after B on all 5, seal ok; 40 seats key errors 0
```
