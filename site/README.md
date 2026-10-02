# LeakProof site

The Phase I submission as a website, built to be simple for a newcomer and complete for a reviewer.

**For a newcomer** (`/`): a very short manual (how to use the site and how to give the best feedback), then a three-step path. 1. Watch an animated flowchart. 2. Try four working ideas, one at a time, and add your own question. 3. Tell us: the Review (12 to 15 minutes, typed, with a participation receipt) or a short chat (`/interview`).

**For a reviewer** (`/course`): one page with four tabs: Checklist (where each deliverable lives), Prototypes (role screens, storyboard, task flows), Research (plan, method, live results, cases, comparison, SWOT, limits) and Requirements (requirements, threats, assumptions, 17 decisions, scope).

Old URLs (`/how`, `/try`, `/prototypes`, `/research`, `/requirements`, `/deliverables`) redirect to the right place (see `vercel.json`).

    src/pages/       index, course, review, interview, admin
    src/partials/    the four course tabs
    src/js/          browser scripts (ES modules, no runtime dependencies)
    src/docs/        snapshot of project docs the Requirements tab renders (refreshed on build)
    api/             Vercel functions: submit, stats, export (+ _lib)
    scripts/         build, dev server, link checker, survey table generator
    tests/           146 tests

## Run and test

    cd project/site
    npm install          # dev dependency (jsdom) for the UI tests only
    npm run dev          # http://localhost:3000   (PORT=3011 npm run dev to change)
    npm test             # 146 tests (builds first)
    node scripts/check-links.mjs   # checks every external source link (needs network)

Locally, answers go to `.data/` and the admin key is `dev-admin-key`.

## What the tests cover

Field by field (`tests/roundtrip.test.mjs`): the real review page is filled in using only the survey definition, every field with a distinct value (unicode, quotes, angle brackets, the longest allowed length), sent through the real client and API into the production storage path, read back through the admin export and compared value by value. Three runs cover every question and branch (all fields; required only; a different role with an optional swap link), plus the chat form (including that nothing is sent or stored without the consent box), every quick-feedback scene, every option of every choice question and every scale point, and the exact length limits. A final check fails if any question in the survey was never exercised.
Backend (API): validation of every field, strict rejection of unknown or hidden answers, size limits, honeypot, prototype pollution, duplicate submissions, contact details stored apart, admin key checks, CSV formula injection, small-group hiding in public stats. A fake Upstash server exercises the production storage path over HTTP, including 40 simultaneous submissions.
Behaviour (browser-like): the question form (formatting, errors, presets), the four scenes with real encryption, the animated flowchart (steps, token, key pieces, autoplay, pause, reduced motion), voice input (switched off by default; its code is kept and tested with a fake speech engine, and a separate test proves nothing voice-related appears with the shipped defaults), the whole review (typed and spoken answers, optional pages, follow-up call, receipt, retries, resume after refresh), the interview request, home path, the course tab router, the setter prototype, live results, the admin view.
Structure: no dead links or anchors, no unsafe DOM writes, no third-party scripts, survey definition coherence, redirects.
Mutation checks were run by breaking code on purpose to confirm the tests notice.

## Deploy on Vercel

Already connected: GitHub `hrsh-kr/leakproof-uss`, root directory `site/`, pushes to `main` deploy to production; other branches get a preview URL.

1. **Storage** (once): Vercel project, Storage, create an Upstash Redis database and connect it. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`). Without storage the API answers 503 and the pages say so.
2. **Admin key** (once): Settings, Environment Variables, add `ADMIN_KEY` (at least 8 characters). Redeploy afterwards.
3. Open `/review`, submit once, check it at `/admin`, then flush test data in the Upstash console before sharing.

To check that every field really reaches the real database: run `npm run dev` with the Upstash variables loaded (`node --env-file=.env.local scripts/dev.mjs` after `vercel env pull`), fill in `/review`, `/interview` and a quick-feedback box, read the records back through `/admin`, and delete only the test keys (`lp:*`) afterwards. This was done on 2 Oct 2026, and again after the chat form became a separate minimal form: the full review (53 fields), the minimal review (26), the chat request (consent, when, how to reach) and four quick comments were all read back identical, the raw records were read straight from Upstash, and the database was emptied afterwards.

## Data

`/admin` lists who gave reviews (email, role, time, tasks finished, swap link; repeat emails are flagged), chat requests exactly as the person typed them (when they are free, how to reach them, consent), free-text answers to code, and CSV downloads for answers and for participants. Or:

    curl -H "x-admin-key: YOUR_KEY" "https://YOUR-SITE/api/export?format=csv" -o responses.csv
    curl -H "x-admin-key: YOUR_KEY" "https://YOUR-SITE/api/export?include=contact"
    curl -H "x-admin-key: YOUR_KEY" "https://YOUR-SITE/api/export?kind=participants&format=csv"   # who gave each review: email, role, swap link

## Changing things

Questions for the review and the chat form: `src/js/survey-def.mjs` only (page and server both read it). Copy: `src/pages`, `src/partials`, `src/js/home.js`. Requirements and decisions come from `project/02`, `05` and `06`. After editing run `npm test`.

## Safety notes

No third-party scripts, trackers or fonts. The site denies microphone access entirely. Public stats are aggregates and hide groups under 5. Email (required for the review), swap link, name and contact details are stored apart from answers (a separate `contact` record) and are not in the analysis export or public stats; the admin view joins them by receipt code. The receipt shows only a masked email. Responses are append-only; delete raw data from the Upstash console after the final report.

## Voice input

Switched off (`src/js/config.mjs`, `FEATURES.voice`). Browser dictation depends on the browser vendor's speech service and failed with "speech service is not reachable" in real use. See decision D17. To try it again, set the flag to true and rebuild; the tests then cover it.

## The animated flowchart

Two layouts: a wide one for laptops and tablets over 900px (drawn 960 units across, shown at up to about 1000px, text 15 to 18px) and a vertical track for phones. It switches live when the window is resized and keeps the current step. `tests/flow-size.test.mjs` fails if any label would render below a readable size at the widths where it is used.
