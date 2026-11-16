#!/usr/bin/env bash
# Consistent copies of the instance databases plus the key files. Installed as /usr/local/sbin/lp-backup and run
# hourly by lp-backup.timer as root; also by hand:  sudo lp-backup [practice] [demo] [official]
# What it changes: writes only under /var/backups/leakproof (root, 0700):
#   <instance>-YYYYmmdd-HHMM.db   SQLite "VACUUM INTO" snapshot, taken by node AS the leakproof user (a root
#                                 process would create root-owned -wal files and break the service), then
#                                 integrity-checked; the newest 48 per instance are kept, older ones removed
#   keys-YYYYmmdd-HHMM.tgz        /etc/leakproof/*/*.key, written only when a key changed; keys-latest.tgz links to it
# golden-*.tgz files (demo snapshots) are never touched. A lost key cannot be recreated over existing data:
# copy keys-latest.tgz off the VM (see OPERATIONS.md) and treat it as a secret.
# Prerequisites: node >= 22.5 on PATH for root. Idempotent; does not stop or lock the running service.
set -euo pipefail
case "${1:-}" in --help|-h) sed -n '2,/^set -/{/^set -/!p;}' "$0"; exit 0 ;; esac
[ "$(id -u)" -eq 0 ] || { echo "run with sudo" >&2; exit 2; }
D=/var/backups/leakproof; KEEP=48
install -d -m 0700 "$D"
INSTS=("$@"); [ ${#INSTS[@]} -gt 0 ] || INSTS=(practice demo official)
TS="$(date +%Y%m%d-%H%M)"; rc=0
for inst in "${INSTS[@]}"; do
  case "$inst" in practice|demo|official) ;; *) echo "bad instance $inst" >&2; exit 2 ;; esac
  data="/var/lib/leakproof/$inst"
  [ -f "$data/leakproof.db" ] || { echo "$inst: no database yet, skipped"; continue; }
  tmp="$data/.backup.tmp.db"; rm -f "$tmp"
  if runuser -u leakproof -- node --disable-warning=ExperimentalWarning -e '
      const { DatabaseSync } = require("node:sqlite");
      const [src, dst] = process.argv.slice(1);
      const d = new DatabaseSync(src); d.exec("PRAGMA busy_timeout=5000"); d.exec(`VACUUM INTO \x27${dst}\x27`); d.close();
      const c = new DatabaseSync(dst, { readOnly: true });
      const r = c.prepare("PRAGMA quick_check").get(); c.close();
      if (Object.values(r)[0] !== "ok") { console.error("quick_check failed on the copy"); process.exit(1); }
    ' "$data/leakproof.db" "$tmp"; then
    out="$D/$inst-$TS.db"; mv "$tmp" "$out"; chmod 0600 "$out"; chown root:root "$out"
    echo "$inst: backup $out ($(du -h "$out" | cut -f1))"
    ls -1t "$D/$inst"-[0-9]*.db | tail -n +$((KEEP + 1)) | xargs -r rm -f --
  else
    rm -f "$tmp"; echo "$inst: BACKUP FAILED" >&2; logger -t lp-backup -p user.err "backup of $inst failed"; rc=1
  fi
done
# Keys: only when something changed since the last archive.
sum="$(cat /etc/leakproof/*/*.key 2>/dev/null | sha256sum | cut -d' ' -f1)"
if [ "$sum" != "$(cat "$D/keys.sha256" 2>/dev/null || true)" ]; then
  k="$D/keys-$TS.tgz"; (umask 077; tar -czf "$k" -C / etc/leakproof/practice etc/leakproof/demo etc/leakproof/official 2>/dev/null)
  chmod 0600 "$k"; ln -sfn "$k" "$D/keys-latest.tgz"; echo "$sum" > "$D/keys.sha256"; echo "keys: archived $k"
fi
exit $rc
