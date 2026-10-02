# LeakProof site

The Phase I submission as a website: overview, animated workflow, working demos, role prototypes, research, requirements, and a remote usability test (the Review page) that collects typed or spoken feedback and issues a participation receipt.

    src/pages/*.html    page content (built into public/)
    src/js/             browser scripts (ES modules, no dependencies)
    src/css/site.css    styles
    api/                Vercel functions: submit, stats, export (+ _lib)
    scripts/build.mjs   assembles public/ and generates tables from the project docs
    scripts/dev.mjs     local server with a file store
    tests/              48 tests

Docs shown on the Requirements page (`02`, `05`, `06` in the parent folder) are copied into `src/docs/` on every build, so the site deploys on its own. Edit the docs in `project/`, then rebuild.

## Run it locally

    cd project/site
    npm run dev          # http://localhost:3000   (PORT=3011 npm run dev to change)
    npm test

Locally, answers go to `.data/` and the admin key is `dev-admin-key`.

## Deploy on Vercel (about 10 minutes)

1. **Install and log in** (once): `npm i -g vercel`, then `vercel login`.
2. **Deploy a preview** from this folder: `cd project/site && vercel`. Accept the defaults. Vercel reads `vercel.json` (build command `node scripts/build.mjs`, output `public`, clean URLs and security headers). Framework preset: Other.
3. **Add storage.** In the Vercel dashboard open the project, then Storage, then create an **Upstash Redis** database (from the Marketplace) and connect it to the project. This adds the environment variables `KV_REST_API_URL` and `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`). The code accepts either pair. Without storage the API refuses with 503 and the pages say so.
4. **Set the admin key.** Project Settings, Environment Variables: add `ADMIN_KEY` with a long random value (at least 8 characters; shorter keys are rejected). Keep it private.
5. **Redeploy to production:** `vercel --prod`. Environment variables apply on the next deploy.
6. **Check it works.** Open `/review`, complete it once, open `/admin`, enter the key, and confirm your answer is there. Then **delete the test data** in the Upstash console (flush the database) before sharing the link.
7. **Share** the production URL. For survey respondents, the link to give is `/review`. For the TAs, `/deliverables`.

Alternative: push this folder to GitHub and import the repository in Vercel. Set the project root to `project/site`.

## Getting the data out

`/admin` shows free-text answers to code and has a **Download CSV** button. Or:

    curl -H "x-admin-key: YOUR_KEY" "https://YOUR-SITE/api/export?format=csv" -o responses.csv
    curl -H "x-admin-key: YOUR_KEY" "https://YOUR-SITE/api/export?include=contact"   # follow-up contacts, kept separate

Give the CSV to Claude to code findings into `project/logs/findings.csv`.

## Safety notes

- No third-party scripts, trackers or fonts. The only outside call is the browser's own speech recognition when a person taps the microphone.
- Public `/api/stats` returns aggregates only and hides any group under 5 people.
- Names and contact details are stored apart from answers and are not in the default export.
- Responses are append-only; there is no delete endpoint. Delete raw data from the Upstash console after the final report.
- Vercel and Upstash free plans have limits. Check their current pricing pages before a large push.

## Changing the questions

Edit `src/js/survey-def.mjs` only. The page and the server both read it, so they cannot disagree. Then `npm test` and redeploy. Regenerate the question table for the report with `node scripts/survey-md.mjs`.
