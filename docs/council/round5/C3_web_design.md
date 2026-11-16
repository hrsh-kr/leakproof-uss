# C3: web and visual design review of the LeakProof client (round 5)

Scope: `public/index.html` (23 lines), `public/styles.css` (141), `public/app.js` (787), read from the snapshot. No browser was available, so every rendering claim is reasoned from the CSS, and "unverified" marks what only a real browser or printer can confirm. Contrast numbers come from a node script (WCAG relative luminance). Tokens used: the `:root` and `prefers-color-scheme: dark` blocks in `styles.css` lines 2 to 18.

## 1. First-impression audit: classmate opens `https://192.168.2.238:8443/` cold

What the tester sees: header with logo and "LeakProof", an empty pill, no nav, then a single card titled "Log in" with one muted sentence ("Run a leak-resistant exam: sealed paper, 3 of 5 key cards to open it, one traceable copy per seat."), Username, Passphrase, "Log in", and a small link row "Forgot your passphrase? · Create a practice account" (`app.js` 214-231).

| Question a cold tester asks | Answer today | Verdict |
|---|---|---|
| What is this? | One jargon-heavy sentence. Phase I found wording and jargon the top usability problem (24% of reviewers, F6). | weak |
| Do I need an account? | The only hint is a 0.875rem link at the bottom of the card. A tester will try to log in first, fail, and may report "no demo credentials". | weak |
| Where is the user guide? | Nowhere. `register` asks for a "Course code (in the user guide)" (line 258) but the guide is not served: `TYPES` in `src/http.mjs:64` allows only html, js, css and svg, and no link exists. The code is printed only in a file on the file server. | blocker for the 26 Nov demo and for peer testers |
| Where are the demo credentials? | The practice instance has none by design (self-registration). The guide must say so; the page does not. | weak |
| Is it safe/allowed to attack it? | Rules of engagement are only in USER_GUIDE section 4. | missing |
| Which instance is this? | The header pill is empty until login (`renderHeader`, line 152), although `S.instance` is already fetched from `/healthz`. | cheap fix |

### Recommended minimal public landing (still static, no innerHTML, no dependencies)
Add `public/help.html` (a static file is auto-served by `staticFiles`; paths with a dot bypass the SPA fallback, `app.mjs:279`). Use `<link rel="stylesheet" href="/styles.css">`, no script, so CSP `script-src 'self'; style-src 'self'` is untouched. Link it from `index.html` header (`<a href="/help.html">Help and guide</a>`) and from the login card. The page must say, in this order:
1. **One-sentence purpose in plain words.** "LeakProof runs an exam so that no single person can read the paper early, and a leaked copy points to a seat."
2. **Start here (3 steps).** Create a practice account (needs the course code, which is: `<course code>` or "ask the team"), you play every role, the **Next step** box tells you what to press.
3. **Demo credentials.** "There are none for the practice instance: you register your own. The official instance is not running." If a pre-made demo account is added for the poster, print it here.
4. **Certificate note.** The self-signed fingerprint line from USER_GUIDE, so testers do not distrust the browser warning.
5. **Rules of engagement.** In scope (practice instance, browser or curl); out of scope (DDoS or floods, VM host, other teams); a report needs an exploit with screenshots; your own accounts only.
6. **Known limits / works as designed.** A one-line list linking to SECURITY.md section 4 content (a copy of USER_GUIDE section 3 as static HTML, since `.md` is not served).
7. **Links:** public log needs an exam id, so skip it; link "Create a practice account" (`/#/register`) and "Log in" (`/#/`).

Login card changes (all in `loginPage`): make "Create a practice account" a full-width `.btn` button above the form on the practice instance with the text "New here? Create a practice account (1 minute)", and show the instance pill logged-out. Keep the claim honest: Phase I flagged "Nobody can read the paper" as false; the existing wording avoids it, keep "no single person".

## 2. Contrast (computed)

Text pairs (AA 4.5:1). All pass in both themes; the tightest are:

| Pair | Light | Dark |
|---|---|---|
| accent on accent-soft (`.pill`) | 4.59 | 4.85 |
| good on good-soft (`.st.ok`) | 4.70 | 6.31 |
| bad on bad-soft (`.st.bad`) | 4.72 | 5.65 |
| accent text on bg (links) | 4.88 | 6.02 |
| muted on bg / card | 5.63 / 6.19 | 7.46 / 6.48 |
| wait on wait-soft (banner, `.st.wait`) | 5.37 | 6.78 |
| accent-ink on accent (primary button) | 5.37 | 6.65 |
| secret on secret-soft | 6.21 | 6.92 |
| ink on bg | 13.36 | 13.53 |

Nothing needs a text-colour change. Do not darken `--accent` or `--good` further, but do not lighten them either: the margins are 0.1 to 0.2.

UI components (3:1, WCAG 1.4.11): **fails.**
- `--line` against card is **1.29** (light) and **1.30** (dark); against the input background `--soft` it is **1.21** / **1.36**. Every input, textarea, select and secondary button border (lines 49-55) is therefore nearly invisible. On a projector the form fields look like unlabelled grey strips. This is the single biggest visual and accessibility defect.
- Disabled primary (`opacity .5`): about 2.1:1 light, 2.7:1 dark. WCAG exempts disabled controls, but "Seal the exam" and "Request release" are disabled on the demo path and look broken. The reason text beside them rescues it only on release.
- Passing: focus ring accent 3px (5.37 on card), status colours on soft fills.
- `--soft` in dark is `#20243284` (semi-transparent), so the actual field colour depends on what is underneath; mixed over card it is roughly `#222737`. Replace with an opaque value.

## 3. Per-screen review

Common: 16px base text, `.small` 0.875rem and `h3` 0.8rem are small for a projector; the sticky header (z-index 5) eats about 56px on a phone; `main` focus outline removed (fine, it is programmatic focus only). `page()` calls `main.focus()` on every render, including auto-refreshes, so a screen-reader user hears the whole page again after each action (unverified, low).

| Screen | Findings | Fix size |
|---|---|---|
| **Login** | Hierarchy fine, narrow card good. Link row is the weakest element (see section 1). Flash notice uses `.warn` with `role=status`: good. Autofocus on username on mobile pops the keyboard over the card; acceptable. | small |
| **Register** | Hint text inside the label (line 258) for username is a 90-character parenthetical that wraps badly at 375px. Move to `.small.muted` under the field. "Course code (in the user guide)" needs the link from section 1. | small |
| **Secrets shown once** | Strongest screen: dashed purple card, "Secret: shown once", checkbox gates Continue, Copy and Download. Passphrase in `<code>` with `overflow-wrap:anywhere` wraps mid-word, which is dangerous for hand-copying; use `font-size:1rem; letter-spacing:.02em; user-select:all`. No visual weight difference between Continue (disabled) and the rest. | small |
| **Home** | Two cards, "Waiting for you" first, good. Empty states are written ("Nothing needs you right now."). "Loading…" paragraph is unstyled `.muted` and left-aligned until route resolves. A first-time practice user lands here? No: register goes straight to the exam, so home is rarely the first view. | none |
| **Exam header** | Two `.muted.small` lines for print window and server time precede the stage strip; they push the stages down on a phone. `.stages` is 3 columns at 375px, each about 108px wide with 0.85rem text such as "Paper drawn and locked; 5 cards issued": 4 or 5 lines per cell, uneven heights. Collapse to one column under 480px or hide the sub-line there. | 3 lines CSS |
| **Next step box** | Best element for the "key task" test; left border plus soft fill, bold label. Keep it above everything. | none |
| **Tabs** | `role=tab` buttons with roving tabindex and arrow keys: correct. Selected state is colour plus a 3px underline (not colour alone). At 375px four tabs fit or wrap onto two rows without any scroll cue. Muted-grey unselected tabs pass contrast. | none |
| **Exam cell, collecting** | Table in `.scroll` with `min-width:520px`: on a phone it scrolls sideways with no hint. Seal confirmation puts focus on Cancel (good, Esc cancels). The "Needs 2 setters" status is correct. Disabled Seal needs the reason beside it; it has one. | small |
| **Key cards** | Long: three to five stacked cards, each with 8+ fields. "Step 1 of 2 / Step 2 of 2" text is good. Secret textarea is 0.8rem monospace: unreadable on a projector but it is meant to be downloaded. "Load card file…" is a `button.link` with about 32px height. After "Create all my cards" the secret block replaces step 1 in place; on a phone the page may not scroll to it (unverified). | small |
| **Approve** | Fields in order: words, card, passphrase, then Approve and Refuse side by side (`.pair`). On a 375px phone two labelled buttons "Approve with card 3" and "Refuse with card 3" at 16px in 150px columns wrap to two lines; fine. Danger colour is not the only cue (the word Refuse). Refuse sits next to Approve with no confirm; the guide marks this as designed. | none |
| **Release watch** | `.words` 1.6rem purple on lilac: readable but not poster-sized. This is the moment an audience watches. Make it `clamp(2rem,6vw,3.5rem)`. Gates list uses ✓ ○ glyphs plus words: good. The "again" button appears after closure; good. | 1 line |
| **Copies (seat grid)** | `repeat(auto-fill,minmax(64px,1fr))`: 4 to 5 per row at 375px, 30 seats = 6 rows. The tiny "Key" button (32px, 0.8rem) under each seat is below a comfortable tap size and visually weak for the exam cell, which uses it for marking. "Printed" is conveyed by a green border and aria-label only; sighted users get colour only (border `--good`) with `×n` for reprints. Add a "✓" prefix. | 2 lines |
| **Answer key** | `ol.key` `columns: 4 7ch` is a good compact layout. Key text content is from the server (`k.answers`), unverified how long. | none |
| **Trace** | Textarea, one primary button, result list with status pills; "No seat has this order." shown with `ok` green, which reads as success when it may mean the tester pasted wrong text; consider neutral wording "No seat matches". | 1 line |
| **Public log** | Good: chain status, hash check, Download, draw card, entries table with 12-char hashes in `code`. Entries table at `min-width:520px` scrolls. It is reachable without login (route short-circuits), so it is also the best public screen to show on the poster. Failure text "The copy or the log has been altered." is a strong claim from a hash lookup; SECURITY says evidence not proof, so prefer "Not found in this log. Check you typed all 64 characters." | 1 line |
| **Change passphrase** | Clear, forced and voluntary variants, Cancel link only on voluntary. Good. | none |
| **Loading / error** | "Could not load this page" with Try again and Home: good. `main[aria-busy=true]` drops opacity to .7 with a progress cursor: fine, but there is no spinner, so a slow PBKDF2 (600,000 iterations, about 1 s per card, 5 cards) shows only the button text "Working… (a few seconds)". Acceptable. | none |
| **Icons** | Only ✓ ✕ ○ glyphs (aria-hidden) plus the SVG logo. "○" is used for every non-OK state, wait and neutral, so "Not verified yet" and "Needs 2 setters" look alike. Fine. | none |

### Focus order and visible focus
Skip link first, brand, instance pill (not focusable), nav links, then `main`. Visible ring: `:focus-visible` 3px accent with 2px offset, global. Inputs get the ring plus no border change, which is enough. `button:hover` border turns accent, good. One gap: `.tabs button` uses `border-radius:0` so the ring is a rectangle over the underline; harmless.

### Print stylesheet (copies and answer keys)
Current `@media print` (lines 99-103): hides header, banner, `.noprint`, toast; removes shadow and padding from `.paper`. Findings:
1. **Footer only on the last page.** `footer` is a block at the end of `.paper`, so a copy longer than one page shows set hash and log head once, on the final sheet. A cropped or single photographed middle page carries neither the copy id nor the seat. The trace feature relies on question order, but the header-based check does not work for a cropped page. Fix with a repeating fixed band (Chromium and Firefox repeat `position:fixed` elements on every printed page). Unverified in Safari.
2. **No `@page`.** Margins are the browser default; `main` padding is 0 in print so content may touch the margin on some printers. Add `@page { size: A4; margin: 16mm }`.
3. **Page breaks:** `.paper ol.qs > li { break-inside: avoid }` is correct and keeps question and options together. Add `.paper h1 { break-after: avoid }` and widows control.
4. **Fonts:** `system-ui` differs per OS; a print for B/W is fine, but digits and Roman letters in options (A. B. C. D.) via `list-style: upper-alpha` render in the body font. Use `font-family: Georgia, "Times New Roman", serif` on `.paper` for print and 12pt: more legible after photocopying.
5. **B/W legibility:** `.paper` is `#111` on `#fff`, footer `#333` at about 0.78rem with `code` at 0.85em of that (about 10.6px): small once photocopied; raise to 9pt in print. The footer border `#ccc` disappears in B/W; use `#000`.
6. **Dark mode leaks:** `body` background is reset to `#fff` in print, good. `--ink` text outside `.paper` is hidden. On screen in dark mode the `.paper` is a white sheet on dark UI: good and intended.
7. **The answer key and the copy look nearly identical** on paper (same `.paper`, differing only in the h1). Add a printed "ANSWER KEY. NOT FOR CANDIDATES" band in the same fixed header so a stack of keys cannot be mistaken for copies; the screen already says "Keep it away from students" (`noprint`, so it never prints).
8. The Print button uses `window.print()`; the new tab is opened with `noopener` and loads the SPA hash route (`#/copy/...`), which needs the session cookie: works, but if the session idles out the new tab shows the login page and returns to the copy after login via `BACK`. Fine.

### 375px phone and projector
- 375px: no horizontal page scroll expected (cards are fluid, tables scroll inside `.scroll`); `input` font is 16px so iOS will not zoom. Header wraps to two lines; the `.who` name is hidden under 480px (good). Taps: buttons min 42px, `.keybtn` 32px, `button.link` about 32px, tab 40px. Only `.keybtn` is under the 44px guideline but over the WCAG 2.2 24px minimum.
- Projector (poster demo, 26 Nov): content column 980px, 16px body: when projected on a 1080p screen shared in a room the small text (0.8 to 0.9rem) is hard to read from more than 3 m. A single media query raising the root size on wide screens fixes it for every `rem` in the sheet (all font sizes are rem). Light mode on a projector washes out the 1.2:1 borders further, which makes the border fix more urgent.

## 4. Design-system hygiene
- **Dead CSS:** `.grid2` (and its media query, lines 33-34) and `.mono` are never referenced in `app.js` or `index.html`; `.wrap` in the `<noscript>` has no rule. `.paper` appears with a `.paper ol.os` rule that duplicates the global `ol.os` (line 83 and 93). `.top { flex-wrap }` is a second `.top` rule appended at the bottom. Harmless, but graders reading the repo see "Round 4 additions" appended instead of merged.
- **Tokens:** good set (`--bg --card --ink --muted --line --soft --accent ...`). Missing: a `--field` border token (see fix 1), `--focus`, and a type scale. Hard-coded colours remain: `.paper` (#fff, #111, #ccc, #333), `.toast` uses `--ink` on `--bg` (fine).
- **Fragile:** `--soft: #20243284` alpha value in dark; `.toast` fixed at `bottom:20px` can cover the page's last action on a phone and has `aria-live` via `role=status` (good) but no manual dismiss; `.skip` top `-60px` works, `html` `font:` shorthand sets line-height 1.5 for the root (fine). `index.html` has no `<meta name="color-scheme">` or `theme-color`, so the first paint before CSS loads can flash white in dark mode (cosmetic). The page title is correctly updated per route.
- **No test covers CSS or DOM structure.** The 52 tests are server-side, so every change below is caught only by manual click paths.

## 5. Ranked change list

### Polish now (all CSS or one static file; best demo value per minute first)

| # | Change | Size | Regression check |
|---|---|---|---|
| 1 | **Visible field and button borders.** Add `--edge:#838b9b` light (3.8:1 on white) and `#7d86a0` dark (3.9:1 on card). Use it in `input, textarea, select` and `button` border (lines 49 and 55); keep `--line` for dividers. Make `--soft` dark opaque `#222737`. | 4 lines | Load `/`: fields have a clear outline in light and dark (`prefers-color-scheme` toggle in devtools); run `npm test` (should be unchanged); recheck contrast script. |
| 2 | **Landing/help page** `public/help.html` plus two links (header and login card) and the instance pill shown logged out (`renderHeader`: use `S.instance`). | 1 new file, about 6 DOM lines | `curl -sI /help.html` returns 200 `text/html` with CSP header; page works with JavaScript disabled; CSP shows no violation; `npm test` still 52. If `staticFiles` is cached at start, restart. |
| 3 | **Projector scale.** `@media (min-width:1400px){ :root{font-size:19px} main{max-width:68rem} }` and `main{max-width:980px}` can stay (rem will not scale it), so change to `62rem` first. | 3 lines | View at 1920px zoom and 375px: no horizontal overflow on `.stages`, `.seats`. |
| 4 | **Poster-size release words.** `.words{font-size:clamp(2rem,6vw,3.6rem)}` | 1 line | Release screen at 375 and 1920: words do not wrap mid-word (they are two words). |
| 5 | **Print: repeat the identity on every page.** Add to the print block: `@page{size:A4;margin:16mm}` `.paper{font:12pt/1.45 Georgia,"Times New Roman",serif;max-width:none}` `.paper footer{position:fixed;bottom:0;left:0;right:0;border-top:1px solid #000;color:#000;font-size:9pt}` `.paper{padding-bottom:22mm}`. Place the seat and copy id into that footer too (it already holds set hash and log head; add `Seat n · Copy id` text in `copyPage` footer, 1 DOM line). | 6 lines CSS, 1 DOM | Use browser "Save as PDF" on a 3-page copy (30+ questions): footer on every page, no question split, nothing overlaps the last question (bottom padding). Also print a 1-page copy. Re-open the key: footer present. Unverified in Safari. |
| 6 | **Answer key banner.** On `keyPage` only, add `h('p', { class: 'keyband' }, 'ANSWER KEY. NOT FOR CANDIDATES')` before the h1, and style `.keyband{font-weight:700;letter-spacing:.1em;border:2px solid #000;padding:4px 8px;display:inline-block}` | 3 lines | Print the key and a copy side by side: unmistakable. |
| 7 | **Phone: stage strip.** `@media (max-width:480px){ .stages{grid-template-columns:1fr} .stages li{display:flex;gap:8px;align-items:baseline} .stages li b{display:inline} }` | 3 lines | 375px exam page: three single-line steps. |
| 8 | **Register microcopy.** Move username rule into `.small.muted` under the field; replace "(in the user guide)" with a link to `/help.html`. | 3 lines | Register: link opens help; username error text unchanged. |
| 9 | **Seat button "printed" cue not colour only:** prefix `✓ ` in `copyBtn` when printed; give `.keybtn` `min-height:36px`. | 2 lines | Release a practice exam, print seat 1, grid shows ✓1. Existing `aria-label` is unchanged. |
| 10 | **Microcopy.** Trace no-match: "No seat matches this order." with `status('wait', ...)`. Public log not-found text as in section 3. | 2 lines | Run Trace with random text and with a copied fragment; check-head with `a`x64. |
| 11 | **Dead CSS removal:** delete `.grid2` rules, `.mono`, duplicate `.paper ol.os`; fold the "Round 4" block into the base sections. | delete 5 lines | Search `app.js` for each class first (done above); click through every screen once. |

### Risky, skip before the freeze
- Replacing `main.focus()` per render with a heading-focus scheme, or a focus-trap/dialog for seal confirmation: touches every screen and the keyboard flow that passed round 4.
- A true multi-page print layout using `@page` margin boxes (`@top-center`): not supported in Chromium before recent versions and Firefox; the fixed-footer trick in #5 is safer.
- Spinners or skeleton screens, a hamburger or bottom-tab nav, an icon font or SVG sprite set: new surface, new CSP questions, little marks value.
- Splitting `app.js` into modules or restructuring routes: any bug found by a classmate costs +0.5% for them and a Valid report against us.
- Adding Markdown rendering of the guide inside the app: a renderer is an injection surface; ship the guide as hand-written static `help.html`.
- Dark/light toggle button: two new states to test; the OS preference is enough.

## Appendix: commands run
- `node` contrast script (WCAG 2.x luminance) over all token pairs in light and dark; outputs quoted above (`--line` on card 1.29 and 1.30; text pairs all at or above 4.59).
- `grep` over `app.js` and `index.html` for class use: `grid2` 0, `mono` 0 references.
- Read `src/http.mjs:64-72` (static types, directory read at start) and `src/app.mjs:277-283` (static fallback), `SECURITY_HEADERS` CSP at `src/http.mjs:5-14`.
