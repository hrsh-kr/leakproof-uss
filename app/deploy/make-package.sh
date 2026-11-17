#!/usr/bin/env bash
# Assemble the submission / Classroom package for one release tag. Run by M3 (needs sudo only to read the
# root-owned files on the VM):
#   bash deploy/make-package.sh v1.0.0 [--out submission] [--no-credentials] [--run-tests]
#        [--root-cert FILE] [--course-code CODE] [--credentials FILE] [--vm-ip IP] [--repo DIR]
# What it changes: writes ONLY into the output directory (default ./submission, created; an existing one is
# refused unless it is empty). Reads the git repo, never modifies it. Everything comes from the TAG, not from the
# working tree, so the package is exactly the frozen release. Output:
#   leakproof-<tag>.tar.gz   git archive of the tag (no data, keys, .git), gzip -n, + SHA256SUMS
#   RELEASE.txt              tag, commit id, date, node version, test result (with --run-tests)
#   USER_GUIDE.md, TESTERS.md  placeholders {{VM_IP}} {{COURSE_CODE}} {{CERT_ROOT_SHA256}} {{CREDENTIALS_TABLE}}
#                            {{RELEASE_TAG}} {{TARBALL_SHA256}} filled in (TESTERS from docs/TESTERS.template.md)
#   --contact "TEXT"         how testers reach the team (required; goes where the template has {{CONTACT}})
#   SECURITY.md, README.md   copies from the tag
#   leakproof-root-ca.crt    Caddy's root certificate (public) for testers to import
# Defaults, when run on the VM: root cert from /var/lib/caddy/**/root.crt, course code from
# /etc/leakproof/practice.env, credentials from /etc/leakproof/demo-credentials.md (read with sudo if needed).
# --no-credentials is for the 17 Nov submission (demo passwords are only for the 18 Nov tester post).
# The credentials table is demo-pod data: NEVER put the official instance's slips in it.
set -euo pipefail

TAG=""; OUT=submission; NOCRED=0; RUNTESTS=0; ROOT=""; CODE=""; CRED=""; VM_IP=""; CONTACT=""
REPO="$(cd "$(dirname "$0")/.." && pwd)"
while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT="${2:?}"; shift 2 ;; --no-credentials) NOCRED=1; shift ;; --run-tests) RUNTESTS=1; shift ;;
    --root-cert) ROOT="${2:?}"; shift 2 ;; --course-code) CODE="${2:?}"; shift 2 ;;
    --credentials) CRED="${2:?}"; shift 2 ;; --contact) CONTACT="${2:?}"; shift 2 ;; --vm-ip) VM_IP="${2:?}"; shift 2 ;; --repo) REPO="${2:?}"; shift 2 ;;
    --help|-h) sed -n '2,/^set -/{/^set -/!p;}' "$0"; exit 0 ;;
    -*) echo "unknown option $1" >&2; exit 2 ;;
    *) TAG="$1"; shift ;;
  esac
done
[ -n "$TAG" ] || { echo "usage: make-package.sh <tag> --contact \"email and class channel\" [options]" >&2; exit 2; }
[ -n "$CONTACT" ] || { echo "--contact is required: say how classmates can reach the team (not a personal secret; an email or class channel)" >&2; exit 2; }
sha256() { if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }
G() { git -C "$REPO" "$@"; }
# readf: read a file, falling back to sudo when it is root-only.
readf() { cat "$1" 2>/dev/null || sudo cat "$1"; }

G rev-parse -q --verify "refs/tags/$TAG^{commit}" >/dev/null || { echo "tag $TAG not found in $REPO" >&2; exit 1; }
COMMIT="$(G rev-parse "refs/tags/$TAG^{commit}")"
G cat-file -e "$TAG:docs/TESTERS.template.md" 2>/dev/null || { echo "$TAG has no docs/TESTERS.template.md (written in phase D)" >&2; exit 1; }
G cat-file -e "$TAG:USER_GUIDE.md" 2>/dev/null || { echo "$TAG has no USER_GUIDE.md" >&2; exit 1; }
if [ -e "$OUT" ] && [ -n "$(ls -A "$OUT" 2>/dev/null)" ]; then echo "$OUT exists and is not empty; choose another --out" >&2; exit 1; fi
mkdir -p "$OUT"; OUT="$(cd "$OUT" && pwd)"; chmod 0700 "$OUT"

# Facts from the VM (or the flags).
VM_IP="${VM_IP:-$(cat /etc/leakproof/vm_ip 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')}"
[ -n "$VM_IP" ] || { echo "cannot find the VM address; pass --vm-ip" >&2; exit 1; }
if [ -z "$ROOT" ]; then ROOT="$(find /var/lib/caddy -name root.crt 2>/dev/null | head -1 || true)"; [ -n "$ROOT" ] || ROOT="$(sudo find /var/lib/caddy -name root.crt 2>/dev/null | head -1 || true)"; fi
[ -n "$ROOT" ] || { echo "Caddy root certificate not found. Open https://$VM_IP:8443/ once, or pass --root-cert FILE" >&2; exit 1; }
readf "$ROOT" > "$OUT/leakproof-root-ca.crt"
FP="$(openssl x509 -in "$OUT/leakproof-root-ca.crt" -noout -fingerprint -sha256 | cut -d= -f2)"
[ -n "$FP" ] || { echo "could not read a fingerprint from $ROOT" >&2; exit 1; }
if [ -z "$CODE" ]; then CODE="$(readf /etc/leakproof/practice.env | sed -n 's/^LP_INVITE_PROF=//p' | tail -1)"; CODE="${CODE:-LP-PROF-G19} (professor; TAs and students: LP-TA-G19 / LP-STU-G19 plus the class code from their professor)"; fi
[ -n "$CODE" ] || { echo "no course code (pass --course-code)" >&2; exit 1; }
if [ "$NOCRED" = 1 ]; then TABLE='The demo credential sheet is posted separately (class post, 18 Nov). Practice accounts need no sheet: register with the course code.'
else
  CRED="${CRED:-/etc/leakproof/demo-credentials.md}"
  TABLE="$(readf "$CRED")" || { echo "cannot read credentials $CRED (use --no-credentials or --credentials FILE)" >&2; exit 1; }
  [ -n "$TABLE" ] || { echo "credentials file is empty" >&2; exit 1; }
fi

# Tarball of the tag, deterministic enough to re-create: same tag gives the same bytes with the same git/gzip.
TB="leakproof-$TAG.tar.gz"
G archive --format=tar --prefix="leakproof-$TAG/" "$TAG" | gzip -n -9 > "$OUT/$TB"
(cd "$OUT" && sha256 "$TB" > SHA256SUMS)
TBSUM="$(cut -d' ' -f1 "$OUT/SHA256SUMS")"
if tar -tzf "$OUT/$TB" | grep -E '(^|/)(\.git/|data/|[^/]*\.(key|db|env)$)' | grep -v '\.example'; then echo "tarball contains forbidden files; aborting" >&2; exit 1; fi

TESTLINE="not run here (use --run-tests)"
if [ "$RUNTESTS" = 1 ]; then
  X="$(mktemp -d)"; trap 'rm -rf "$X"' EXIT
  tar -xzf "$OUT/$TB" -C "$X"
  if (cd "$X/leakproof-$TAG" && npm test >"$X/test.log" 2>&1); then TESTLINE="npm test passed: $(grep -E '^ℹ (tests|pass|fail) ' "$X/test.log" | tr '\n' ' ' || true)"
  else tail -30 "$X/test.log" >&2; echo "npm test FAILED on the tarball; aborting" >&2; exit 1; fi
fi
{ echo "LeakProof $TAG"; echo "commit:   $COMMIT"; echo "built:    $(date -u +%FT%TZ)"; echo "node:     $(node -v 2>/dev/null || echo unknown) (needs >= 22.5)"
  echo "tests:    $TESTLINE"; echo "tarball:  $TB"; echo "sha256:   $TBSUM"; echo "root CA fingerprint (SHA-256): $FP"; } > "$OUT/RELEASE.txt"

# Fill the placeholders (plain string replacement, so a passphrase with odd characters cannot break anything).
render() { # render <in-from-git> <out>
  G show "$TAG:$1" > "$OUT/.in.tmp"
  LP_VM_IP="$VM_IP" LP_CODE="$CODE" LP_FP="$FP" LP_TAG="$TAG" LP_TBSUM="$TBSUM" LP_TABLE="$TABLE" LP_CONTACT="$CONTACT" \
  node -e '
    const fs = require("fs"); let t = fs.readFileSync(process.argv[1], "utf8"); const e = process.env;
    const map = { VM_IP: e.LP_VM_IP, COURSE_CODE: e.LP_CODE, CERT_ROOT_SHA256: e.LP_FP, RELEASE_TAG: e.LP_TAG, TARBALL_SHA256: e.LP_TBSUM, CREDENTIALS_TABLE: e.LP_TABLE, CONTACT: e.LP_CONTACT };
    for (const [k, v] of Object.entries(map)) t = t.split("{{" + k + "}}").join(v);
    const left = t.match(/\{\{[A-Z0-9_]+\}\}/g);
    if (left) { console.error("unfilled placeholders: " + [...new Set(left)].join(", ")); process.exit(1); }
    fs.writeFileSync(process.argv[2], t);' "$OUT/.in.tmp" "$OUT/$2"
  rm -f "$OUT/.in.tmp"
}
render docs/TESTERS.template.md TESTERS.md
render USER_GUIDE.md USER_GUIDE.md
for f in SECURITY.md README.md; do G show "$TAG:$f" > "$OUT/$f"; done
[ "$NOCRED" = 1 ] || chmod 0600 "$OUT/TESTERS.md"   # contains the demo passwords

echo "package in $OUT:"; ls -l "$OUT" | tail -n +2
echo
echo "Classroom text:  LeakProof $TAG, tarball SHA-256 $TBSUM, commit ${COMMIT:0:12}"
echo "                 https://$VM_IP:8443/   course code $CODE   root CA SHA-256 $FP"
[ "$NOCRED" = 1 ] && echo "17 Nov upload: no credentials inside (good)." || echo "WARNING: TESTERS.md contains demo passwords: this version is for the 18 Nov tester post, not the 17 Nov upload."
