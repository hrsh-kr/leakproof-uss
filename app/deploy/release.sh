#!/usr/bin/env bash
# Deploy one git tag as an immutable release and switch an instance to it.   Run by a team member on the VM:
#   sudo bash ~/leakproof/deploy/release.sh v0.9.2                 # practice (default)
#   sudo bash ~/leakproof/deploy/release.sh v1.0.0 --instance demo
#   sudo bash ~/leakproof/deploy/release.sh v1.0.0 --tarball /srv/leakproof/dist/leakproof-v1.0.0.tar.gz   # no GitHub
# Options: --instance practice|demo|official   --skip-tests (or SKIP_TESTS=1)   --help
#   Releasing to official needs FORCE_OFFICIAL=1: the restart re-locks an open paper. Never during an exam.
#
# What it changes:
#   /srv/leakproof/releases/<tag>   new, root-owned, read-only copy of the tag (never modified afterwards)
#   /srv/leakproof/current          symlink, switched atomically (all instances share it; an instance picks up
#                                   new code only when it is restarted, so demo/official keep running what they run)
#   /srv/leakproof/previous         the release that was current before (for lp-rollback)
#   /etc/systemd/system/*, /usr/local/sbin/lp-*, /etc/caddy/Caddyfile   refreshed from the release
#   service leakproof@<instance>    restarted; health-checked; on failure rolled back automatically
# Data (/var/lib/leakproof) and keys (/etc/leakproof) are never touched. Prerequisites: install.sh ran once,
# the clone ~/leakproof has the tag (fetched here), node >= 22.5, caddy, curl. Idempotent: re-running a tag that is
# already deployed only re-checks health. Output is also appended to /var/log/leakproof-deploy.log.
set -euo pipefail

R=/srv/leakproof
INST=practice; TARBALL=""; TAG=""
SKIP_TESTS="${SKIP_TESTS:-0}"
while [ $# -gt 0 ]; do
  case "$1" in
    --instance) INST="${2:?--instance needs a name}"; shift 2 ;;
    --tarball) TARBALL="${2:?--tarball needs a file}"; shift 2 ;;
    --skip-tests) SKIP_TESTS=1; shift ;;
    --help|-h) sed -n '2,/^set -/{/^set -/!p;}' "$0"; exit 0 ;;
    -*) echo "unknown option $1" >&2; exit 2 ;;
    *) TAG="$1"; shift ;;
  esac
done
[ "$(id -u)" -eq 0 ] || { echo "run with sudo" >&2; exit 2; }
[[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?$ ]] || { echo "usage: release.sh <tag like v1.0.0> [options]" >&2; exit 2; }
case "$INST" in practice|demo|official) ;; *) echo "instance must be practice, demo or official" >&2; exit 2 ;; esac
if [ "$INST" = official ] && [ "${FORCE_OFFICIAL:-0}" != 1 ]; then
  echo "Refusing: restarting the official instance re-locks an open paper. Set FORCE_OFFICIAL=1 if you are sure no exam is running." >&2; exit 2
fi
mkdir -p /var/log; exec > >(tee -a /var/log/leakproof-deploy.log) 2>&1
echo "=== release $TAG -> $INST  $(date -u +%FT%TZ)  by ${SUDO_USER:-root}"

REPO="${REPO:-$(getent passwd "${SUDO_USER:-iiitd}" | cut -d: -f6)/leakproof}"
U="${SUDO_USER:-$(stat -c %U "$REPO" 2>/dev/null || echo root)}"
VM_IP="${VM_IP:-$(cat /etc/leakproof/vm_ip 2>/dev/null || hostname -I | awk '{print $1}')}"
case "$INST" in practice) PORT=8080; CPORT=8443 ;; demo) PORT=7090; CPORT=7443 ;; official) PORT=9090; CPORT=9443 ;; esac
p="$(sed -n 's/^LP_PORT=//p' "/etc/leakproof/$INST.env" 2>/dev/null | tail -1 || true)"; [[ "$p" =~ ^[0-9]+$ ]] && PORT="$p"

# Prerequisites, printed first.
miss=0
for c in node npm git curl openssl caddy systemctl flock tar; do
  if command -v "$c" >/dev/null; then printf '  ok    %-10s %s\n' "$c" "$(command -v "$c")"; else printf '  MISSING %s\n' "$c"; miss=1; fi
done
[ "$miss" = 0 ] || { echo "install the missing tools (see deploy/preflight.sh)"; exit 1; }
[ -d "$R/releases" ] || { echo "$R/releases missing: run deploy/install.sh first"; exit 1; }
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=5)?0:1)' || { echo "node >= 22.5 needed"; exit 1; }
echo "  node $(node -v), VM address $VM_IP, instance $INST (loopback port $PORT, https port $CPORT)"

exec 9>/run/lock/leakproof-release.lock; flock -n 9 || { echo "another release is running"; exit 1; }
T="$(mktemp -d)"; chmod 0755 "$T"; trap 'rm -rf "$T"' EXIT
gitu() { sudo -u "$U" git -C "$REPO" "$@"; }

# 1. Find the commit (or the tarball) to deploy.
if [ -n "$TARBALL" ]; then
  [ -f "$TARBALL" ] || { echo "no such file $TARBALL"; exit 1; }
  SUMS="$(dirname "$TARBALL")/SHA256SUMS"
  if [ -f "$SUMS" ]; then (cd "$(dirname "$TARBALL")" && sha256sum -c --ignore-missing "$(basename "$SUMS")" | grep -q "$(basename "$TARBALL"): OK") || { echo "SHA-256 mismatch for $TARBALL"; exit 1; }; echo "  tarball checksum ok"
  else echo "  WARNING: no SHA256SUMS next to the tarball; checksum not verified"; fi
  ID="tarball:$(sha256sum "$TARBALL" | cut -d' ' -f1)"
else
  [ -d "$REPO/.git" ] || { echo "no git clone at $REPO (set REPO=...)"; exit 1; }
  gitu fetch --tags --prune origin || echo "  WARNING: git fetch failed (GitHub unreachable?); using tags already in the clone"
  COMMIT="$(gitu rev-parse -q --verify "refs/tags/$TAG^{commit}")" || { echo "tag $TAG not found in $REPO"; exit 1; }
  if [ "${ALLOW_OFF_MAIN:-0}" != 1 ] && ! gitu merge-base --is-ancestor "$COMMIT" origin/main; then echo "$TAG is not on origin/main (ALLOW_OFF_MAIN=1 overrides)"; exit 1; fi
  [ -z "$(gitu status --porcelain)" ] || echo "  WARNING: the VM clone has local changes (ignored: the release comes from the tag). Nobody edits files on the VM."
  ID="$COMMIT"
  [ "$(gitu rev-parse HEAD)" = "$COMMIT" ] || echo "  note: the clone is checked out at $(gitu rev-parse --short HEAD), not at $TAG. This script comes from the clone; run 'git pull --ff-only' first if it is older than the tag."
fi

# 2. Build the immutable release (once per tag).
DEST="$R/releases/$TAG"
if [ -e "$DEST" ]; then
  [ "$(cat "$DEST/.release" 2>/dev/null | sed -n 's/^id=//p')" = "$ID" ] || { echo "$DEST exists but holds different content than $TAG now points to. Tags must not move: refusing. Use a new tag."; exit 1; }
  echo "  $TAG is already built (same content), reusing it"
else
  mkdir "$T/r"
  if [ -n "$TARBALL" ]; then tar -xzf "$TARBALL" -C "$T/r" --strip-components=1; else gitu archive --format=tar --prefix=r/ "$TAG" | tar -x -C "$T"; fi
  [ -f "$T/r/server.mjs" ] && [ -f "$T/r/deploy/release.sh" ] || { echo "the archive does not look like LeakProof"; exit 1; }
  if [ "$SKIP_TESTS" = 1 ]; then echo "  tests SKIPPED (SKIP_TESTS=1)"; else
    cp -a "$T/r" "$T/t"; chown -R "$U" "$T/t"; echo "  running npm test ..."   # tested in a copy: tests may leave files behind
    (cd "$T/t" && sudo -u "$U" npm test >"$T/test.log" 2>&1) || { tail -40 "$T/test.log"; echo "tests failed, not deploying (SKIP_TESTS=1 to override)"; exit 1; }
    grep -E '^ℹ (pass|fail) ' "$T/test.log" | tr '\n' ' '; echo
  fi
  printf 'tag=%s\nid=%s\nbuilt=%s\nby=%s\n' "$TAG" "$ID" "$(date -u +%FT%TZ)" "${SUDO_USER:-root}" > "$T/r/.release"
  chown -R root:root "$T/r"; chmod -R go-w "$T/r"; chmod -R a+rX "$T/r"
  cp -a "$T/r" "$R/releases/.$TAG.tmp" && mv "$R/releases/.$TAG.tmp" "$DEST"   # appears complete or not at all
  chmod -R a-w "$DEST"
  echo "  built $DEST"
fi

# 3. Validate the Caddyfile BEFORE anything is switched; a bad file aborts here with nothing changed.
sed "s/__VM_IP__/$VM_IP/g" "$DEST/deploy/Caddyfile" > "$T/Caddyfile"
caddy validate --config "$T/Caddyfile" --adapter caddyfile >/dev/null 2>"$T/caddy.err" || { cat "$T/caddy.err"; echo "Caddyfile invalid, nothing changed"; exit 1; }

# 4. Refresh system files from the release (units, drop-ins, helper scripts, Caddyfile).
install -d /etc/systemd/system/leakproof@.service.d /etc/systemd/system/caddy.service.d /etc/systemd/journald.conf.d /etc/caddy/leakproof.d
install -m 0644 "$DEST/deploy/leakproof@.service" /etc/systemd/system/leakproof@.service
install -m 0644 "$DEST/deploy/systemd/leakproof-ops.conf" /etc/systemd/system/leakproof@.service.d/10-ops.conf
install -m 0644 "$DEST/deploy/systemd/caddy-restart.conf" /etc/systemd/system/caddy.service.d/10-leakproof.conf
for u in leakproof-firewall.service lp-health@.service lp-health@.timer lp-backup.service lp-backup.timer lp-demo-reset.service lp-demo-reset.timer; do
  install -m 0644 "$DEST/deploy/systemd/$u" "/etc/systemd/system/$u"; done
if ! cmp -s "$DEST/deploy/systemd/journald-leakproof.conf" /etc/systemd/journald.conf.d/leakproof.conf; then
  install -m 0644 "$DEST/deploy/systemd/journald-leakproof.conf" /etc/systemd/journald.conf.d/leakproof.conf; systemctl restart systemd-journald || true; fi
for pair in accounts:lp-accounts health:lp-health rollback:lp-rollback backup:lp-backup reset-practice:lp-reset-practice demo-reset:lp-demo-reset firewall:lp-firewall; do
  install -m 0755 -o root -g root "$DEST/deploy/${pair%%:*}.sh" "/usr/local/sbin/${pair##*:}"; done
systemctl daemon-reload
if ! cmp -s "$T/Caddyfile" /etc/caddy/Caddyfile; then
  [ -f /etc/caddy/Caddyfile.orig ] || cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.orig
  cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.prev"; install -m 0644 "$T/Caddyfile" /etc/caddy/Caddyfile
  systemctl reload caddy 2>/dev/null || systemctl restart caddy
  echo "  Caddyfile updated (previous kept as Caddyfile.prev)"
fi

# 5. Switch and restart.
PREV="$(readlink -f "$R/current" 2>/dev/null || true)"
if [ "$PREV" != "$(readlink -f "$DEST")" ]; then
  [ -z "$PREV" ] || echo "$PREV" > "$R/previous"
  ln -sfn "$DEST" "$R/current.new" && mv -Tf "$R/current.new" "$R/current"
  echo "  current -> $DEST (previous: ${PREV:-none})"
fi
systemctl enable "leakproof@$INST" >/dev/null 2>&1 || true
systemctl restart "leakproof@$INST"

# 6. Health check on loopback, and through Caddy for the instances Caddy serves.
ok=0
for _ in $(seq 1 30); do curl -fs --max-time 3 "http://127.0.0.1:$PORT/healthz" | grep -q '"ok":true' && { ok=1; break; }; sleep 1; done
if [ "$ok" = 1 ] && [ "$INST" != official ]; then
  ok=0; for _ in $(seq 1 15); do curl -fsk --max-time 3 "https://$VM_IP:$CPORT/healthz" | grep -q '"ok":true' && { ok=1; break; }; sleep 1; done
fi
if [ "$ok" != 1 ]; then
  echo "HEALTH CHECK FAILED. Last log lines:"; journalctl -u "leakproof@$INST" -n 25 --no-pager || true
  if [ -n "$PREV" ] && [ -d "$PREV" ]; then echo "rolling back to $PREV"; INST="$INST" FORCE_OFFICIAL="${FORCE_OFFICIAL:-0}" /usr/local/sbin/lp-rollback --instance "$INST" || true
  else echo "no previous release to roll back to"; fi
  exit 1
fi
echo "  healthy. server.mjs sha256: $(sha256sum "$DEST/server.mjs" | cut -d' ' -f1)"
echo "DEPLOYED $TAG to $INST. Tell the group chat: tag, time, result."
