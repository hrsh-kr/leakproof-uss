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
    tests/           120 tests

## Run and test

    cd project/site
    npm install          # dev dependency (jsdom) for the UI tests only
    npm run dev          # http://localhost:3000   (PORT=3011 npm run dev to change)
    npm test             # 120 tests (builds first)
    node scripts/check-links.mjs   # checks every external source link (needs network)

Locally, answers go to `.data/` and the admin key is `dev-admin-key`.

## What the tests cover

Backend (API): validation of every field, strict rejection of unknown or hidden answers, size limits, honeypot, prototype pollution, duplicate submissions, contact details stored apart, admin key checks, CSV formula injection, small-group hiding in public stats. A fake Upstash server exercises the production storage path over HTTP, including 40 simultaneous submissions.
Behaviour (browser-like): the question form (formatting, errors, presets), the four scenes with real encryption, the animated flowchart (steps, token, key pieces, autoplay, pause, reduced motion), voice input (switched off by default; its code is kept and tested with a fake speech engine, and a separate test proves nothing voice-related appears with the shipped defaults), the whole review (typed and spoken answers, optional pages, follow-up call, receipt, retries, resume after refresh), the interview request, home path, the course tab router, the setter prototype, live results, the admin view.
Structure: no dead links or anchors, no unsafe DOM writes, no third-party scripts, survey definition coherence, redirects.
Mutation checks were run by breaking code on purpose to confirm the tests notice.

## Deploy on Vercel

Already connected: GitHub `hrsh-kr/leakproof-uss`, root directory `site/`, pushes to `main` deploy to production; other branches get a preview URL.

1. **Storage** (once): Vercel project, Storage, create an Upstash Redis database and connect it. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`). Without storage the API answers 503 and the pages say so.
2. **Admin key** (once): Settings, Environment Variables, add `ADMIN_KEY` (at least 8 characters). Redeploy afterwards.
3. Open `/review`, submit once, check it at `/admin`, then flush test data in the Upstash console before sharing.

## Data

`/admin` lists free-text answers to code, interview requests with slot popularity, and a CSV download. Or:

    curl -H "x-admin-key: YOUR_KEY" "https://YOUR-SITE/api/export?format=csv" -o responses.csv
    curl -H "x-admin-key: YOUR_KEY" "https://YOUR-SITE/api/export?include=contact"

## Changing things

Questions, interview slots and modes: `src/js/survey-def.mjs` only (page and server both read it). Copy: `src/pages`, `src/partials`, `src/js/home.js`. Requirements and decisions come from `project/02`, `05` and `06`. After editing run `npm test`.

## Safety notes

No third-party scripts, trackers or fonts. The site denies microphone access entirely. Public stats are aggregates and hide groups under 5. Names and contact details are stored apart from answers and are not in the default export. Responses are append-only; delete raw data from the Upstash console after the final report.

## Voice input

Switched off (`src/js/config.mjs`, `FEATURES.voice`). Browser dictation depends on the browser vendor's speech service and failed with "speech service is not reachable" in real use. See decision D17. To try it again, set the flag to true and rebuild; the tests then cover it.

## The animated flowchart

Two layouts: a wide one for laptops and tablets over 900px (drawn 960 units across, shown at up to about 1000px, text 15 to 18px) and a vertical track for phones. It switches live when the window is resized and keeps the current step. `tests/flow-size.test.mjs` fails if any label would render below a readable size at the widths where it is used.
