## What and why
<!-- One or two sentences. Link the bug report or test-week finding if there is one. -->

## Area
<!-- app | ui | deploy | tests | docs | ci -->

## Checklist
- [ ] `npm test` passes locally; every behaviour change has a test (no test was weakened; a deliberate behaviour change updates the test and says so here)
- [ ] No secrets, keys, `.env`, databases or passphrases in the diff
- [ ] No `innerHTML` in `public/`
- [ ] SECURITY.md updated if a security claim changed (each claim names a test)
- [ ] If `deploy/` changed: `bash -n` on the scripts, and what happens on the VM is described below
- [ ] I am not the one who will approve and merge this

## How it was tested
<!-- Commands and results. For deploy changes: what you ran on a scratch VM or in dry-run mode. -->

## Deploy notes
<!-- Needs a release? A restart (re-locks open papers)? A data migration? Rollback safe? -->
