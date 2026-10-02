# LeakProof demo page (prototype v0.2)

An Apple-style single page: a one-line idea, then four quiet scenes with one control each, then feedback by voice or text. Detail is hidden behind "How it works".

| Scene | Control | What actually runs |
| --- | --- | --- |
| 1 Many writers | Slider: how many setters leak | Seeded draw with topic quotas; exposure; exact expected value |
| 2 Sealed | Tap key holders | Real Shamir 3-of-5 sharing and real AES-GCM encryption in the browser |
| 3 Traceable | Whole page / top question; another photo | Per-seat question and option order; trace over 200 seats |
| 4 Verifiable | One button: change, cover up, start over | Real SHA-256 hash chain and a published-fingerprint check |

## Files

    src/logic.js        pure logic (17 Node tests)
    src/app.js          wiring
    src/style.css       styles (light and dark, system fonts)
    src/template.html   page text and structure
    tests/logic.test.mjs
    build.py            assembles dist/
    dist/index.html     standalone page: host this
    dist/artifact.html  page body for the claude.ai preview

## Build and test

    node --test tests/logic.test.mjs
    TALLY_FORM_ID=<id> WHATSAPP=<number> python3 build.py     # both optional
    python3 -m http.server 8765 --directory dist

Options: `TALLY_FORM_ID` (popup form with hidden field `scene`), `VOICE_URL` (anonymous voice form link) or `WHATSAPP` (number for voice notes). Setup steps: `../../../research/consent_and_instruments/survey_after_prototype.md`.

## Hosting
The claude.ai preview is private and cannot load Tally. Host `dist/index.html` on any static host over https (GitHub Pages, Netlify Drop, a university web folder). It makes no network calls except the optional Tally script and the feedback links.

## Limits
Simulated data only. Needs a browser with encryption support for scenes 2 and 4 (a message appears if missing). English only.

## Test log
- V-001: the copy-ID check digit ignored all but the last digit (found by a test, fixed, logged in `logs/vulnerabilities.csv`).
