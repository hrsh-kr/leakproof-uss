#!/usr/bin/env bash
# One-time bootstrap of the course VM (Ubuntu 24.04, Node >= 22.5, Caddy, ufw). Run by M2 from the git clone:
#   bash deploy/preflight.sh            # read-only, first
#   sudo bash deploy/install.sh v0.9.2 [--vm-ip 192.168.2.238] [--course-code CODE] [--skip-tests] [--no-firewall]
# What it changes: creates user leakproof; /srv/leakproof/{releases,dist}; /var/lib/leakproof/<instance>;
# /etc/leakproof/<instance>/{server,log}.key (only if absent, a lost key cannot be recreated over existing data);
# /etc/leakproof/{practice,demo,official}.env (only if absent); /etc/leakproof/vm_ip; /var/log/caddy;
# /etc/caddy/leakproof.d; then runs release.sh for the given tag (units, Caddy, helper scripts, start practice),
# and enables the firewall service, the 30 s health timers and the hourly backup timer.
# Safe to re-run: existing keys, env files and data are never overwritten. An old rsync-style /srv/leakproof
# is moved to /srv/leakproof/releases/legacy (not deleted) so a failed first release can roll back to it.
# It never touches sshd (deploy/harden-ssh.sh is a separate, explicit step).
set -euo pipefail
case "${1:-}" in --help|-h) sed -n '2,/^set -/{/^set -/!p;}' "$0"; exit 0 ;; esac
[ "$(id -u)" -eq 0 ] || { echo "run with sudo" >&2; exit 2; }
HERE="$(cd "$(dirname "$0")" && pwd)"
TAG=""; VM_IP="${VM_IP:-}"; CODE="${COURSE_CODE:-LEAKPROOF-G19}"; FW=1; REL_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --vm-ip) VM_IP="${2:?}"; shift 2 ;;
    --course-code) CODE="${2:?}"; shift 2 ;;
    --skip-tests) REL_ARGS+=(--skip-tests); shift ;;
    --no-firewall) FW=0; shift ;;
    --help|-h) sed -n '2,/^set -/{/^set -/!p;}' "$0"; exit 0 ;;
    -*) echo "unknown option $1" >&2; exit 2 ;;
    *) TAG="$1"; shift ;;
  esac
done
[ -n "$TAG" ] || { echo "usage: install.sh <tag> [options]   (the tag must already exist on GitHub and in the clone)" >&2; exit 2; }
[[ "$CODE" =~ ^[A-Za-z0-9-]{4,40}$ ]] || { echo "course code: 4-40 letters, digits or dashes" >&2; exit 2; }
VM_IP="${VM_IP:-$(hostname -I | awk '{print $1}')}"
[[ "$VM_IP" =~ ^[0-9a-fA-F:.]+$ ]] || { echo "cannot determine the VM address; pass --vm-ip" >&2; exit 2; }

echo "== prerequisites"
bash "$HERE/preflight.sh" || { echo "preflight failed; fix the FAIL lines first"; exit 1; }

echo "== user, directories, keys, settings"
id leakproof >/dev/null 2>&1 || { useradd --system --home /srv/leakproof --shell /usr/sbin/nologin leakproof; echo "created user leakproof"; }
TS="$(date +%Y%m%d-%H%M%S)"
if [ -f /srv/leakproof/server.mjs ] && [ ! -d /srv/leakproof/releases ]; then   # old rsync layout
  systemctl stop leakproof@practice 2>/dev/null || true
  mv /srv/leakproof "/srv/leakproof.old-$TS"; install -d -m 0755 /srv/leakproof/releases
  mv "/srv/leakproof.old-$TS" /srv/leakproof/releases/legacy; chown -R root:root /srv/leakproof/releases/legacy
  ln -sfn /srv/leakproof/releases/legacy /srv/leakproof/current
  echo "old layout moved to /srv/leakproof/releases/legacy"
fi
install -d -o root -g root -m 0755 /srv/leakproof /srv/leakproof/releases /srv/leakproof/dist
install -d -o root -g root -m 0700 /var/backups/leakproof /var/lib/leakproof/quarantine /etc/leakproof
install -d -o root -g root -m 0755 /var/lib/leakproof
for inst in practice demo official; do
  [ -d "/var/lib/leakproof/$inst" ] || install -d -o leakproof -g leakproof -m 0700 "/var/lib/leakproof/$inst"
  install -d -o root -g root -m 0700 "/etc/leakproof/$inst"
  for k in server.key log.key; do
    f="/etc/leakproof/$inst/$k"
    [ -f "$f" ] || { umask 077; openssl rand -hex 32 > "$f"; chmod 0400 "$f"; echo "created $f"; }
  done
done
setkey() { # setkey <file> <KEY> <value>: add KEY=value only when KEY is absent
  grep -q "^$2=" "$1" 2>/dev/null || echo "$2=$3" >> "$1"; }
for spec in practice:8080:practice demo:7090:official official:9090:official; do
  IFS=: read -r inst port mode <<<"$spec"; f="/etc/leakproof/$inst.env"
  touch "$f"; setkey "$f" LP_PORT "$port"; setkey "$f" LP_MODE "$mode"; chmod 0640 "$f"
done
# Course codes are per role (LP_INVITE_PROF / LP_INVITE_TA / LP_INVITE_STUDENT, defaults in src/config.mjs). The single
# LP_INVITE_CODE of v1.0.x is no longer read; TAs and students also need their professor's per-exam class code.
echo "$VM_IP" > /etc/leakproof/vm_ip
install -d -o caddy -g caddy -m 0755 /var/log/caddy 2>/dev/null || { install -d -m 0755 /var/log/caddy; echo "note: no caddy user; /var/log/caddy created root-owned (Caddy may not be able to write its access log)"; }
install -d -m 0755 /etc/caddy/leakproof.d

echo "== release $TAG"
bash "$HERE/release.sh" "$TAG" "${REL_ARGS[@]}"

echo "== timers and firewall"
systemctl enable --now lp-health@practice.timer lp-health@demo.timer lp-health@official.timer lp-backup.timer >/dev/null
systemctl enable caddy >/dev/null 2>&1 || true
if [ "$FW" = 1 ]; then
  systemctl enable leakproof-firewall.service >/dev/null
  /usr/local/sbin/lp-firewall || echo "WARNING: firewall script failed; the app is unaffected, check: sudo lp-firewall --status"
  echo "SSH still open? From ANOTHER terminal run: ssh $(logname 2>/dev/null || echo "$SUDO_USER")@$VM_IP  (keep this session open until it works)"
fi

echo
echo "Practice:  https://$VM_IP:8443/        Course codes: $(f=/etc/leakproof/practice.env; for r in PROF:LP-PROF-G19:professor TA:LP-TA-G19:TA STUDENT:LP-STU-G19:student; do IFS=: read -r k d n <<<"$r"; v="$(sed -n "s/^LP_INVITE_$k=//p" "$f" 2>/dev/null | tail -1)"; printf '%s (%s) ' "${v:-$d}" "$n"; done)"
root_crt="$(find /var/lib/caddy -name root.crt 2>/dev/null | head -1 || true)"
if [ -n "$root_crt" ]; then echo "Caddy root certificate: $root_crt"; openssl x509 -in "$root_crt" -noout -fingerprint -sha256; else echo "Caddy root certificate not created yet: open https://$VM_IP:8443/ once, then run deploy/make-package.sh"; fi
echo "Next: bash deploy/smoke.sh https://$VM_IP:8443   |   demo pods: sudo bash deploy/demo-setup.sh   |   official on exam night: sudo bash deploy/enable-official.sh"
