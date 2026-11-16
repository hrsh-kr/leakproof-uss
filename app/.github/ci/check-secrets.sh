#!/usr/bin/env bash
# CI gate: no key material, credentials, databases or env files in git, and no innerHTML in the browser code.
# Run from the repo root (CI does; you can too):  bash .github/ci/check-secrets.sh
set -euo pipefail
bad=0
if git ls-files | grep -E '(^|/)(data/|secrets/)|\.(key|db|db-wal|db-shm|pem|env)$|credentials' | grep -vE '\.example($|\.)|^docs/' ; then echo "ERROR: forbidden file is tracked (above)"; bad=1; fi
if git grep -nIE -e '-----BEGIN [A-Z ]*PRIVATE KEY-----' -- . ':!tests' ':!docs' ':!.github'; then echo "ERROR: private key material"; bad=1; fi
if git grep -nIE '(^|[^0-9a-fA-F])[0-9a-fA-F]{64}([^0-9a-fA-F]|$)' -- deploy scripts server.mjs ':!*.json'; then echo "ERROR: 64-hex string in deploy/scripts/server (a key?)"; bad=1; fi
if git grep -nIE '(passphrase|recovery code|password)[:=] *[a-z]{3,}-[a-z]{3,}-[a-z]{3,}' -- . ':!tests' ':!docs' ':!.github' ':!*.md'; then echo "ERROR: looks like a credential"; bad=1; fi
if [ -d public ] && grep -rnE 'innerHTML|outerHTML|insertAdjacentHTML|document\.write' public --include='*.js' --include='*.html'; then echo "ERROR: HTML injection sink in public/ (use textContent / createElement)"; bad=1; fi
[ "$bad" = 0 ] && echo "secrets and sinks check: clean"
exit "$bad"
