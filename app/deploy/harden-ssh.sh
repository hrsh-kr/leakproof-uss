#!/usr/bin/env bash
# Key-only SSH login. Run by M2 ONLY after a key login has been tested.
#   sudo bash deploy/harden-ssh.sh             show what would change (changes nothing)
#   sudo bash deploy/harden-ssh.sh --apply     write the drop-in, validate, reload sshd
#   sudo bash deploy/harden-ssh.sh --revert    remove the drop-in (password login returns)
# What it changes: creates /etc/ssh/sshd_config.d/10-leakproof.conf with PasswordAuthentication no,
# KbdInteractiveAuthentication no, PermitRootLogin no, LoginGraceTime 20; then reloads sshd (existing sessions
# survive a reload). It does NOT touch /etc/ssh/sshd_config and does NOT lower MaxAuthTries (an agent with
# many keys would lock itself out).
# Refuses to apply unless: the invoking user has a valid authorized key; sshd -t passes before and after; and
# sshd -T then really reports passwordauthentication no (otherwise the drop-in is removed again).
# BEFORE --apply: keep this session open, then open a SECOND terminal and confirm
#   ssh -o PreferredAuthentications=publickey <user>@<vm>
# works. If anything goes wrong, use the still-open first session and run --revert.
set -euo pipefail
CONF=/etc/ssh/sshd_config.d/10-leakproof.conf
MODE=show
case "${1:-}" in
  "") ;; --apply) MODE=apply ;; --revert) MODE=revert ;; --help|-h) sed -n '2,/^set -/{/^set -/!p;}' "$0"; exit 0 ;;
  *) echo "unknown option $1" >&2; exit 2 ;;
esac
[ "$(id -u)" -eq 0 ] || { echo "run with sudo" >&2; exit 2; }
ME="${SUDO_USER:-}"; [ -n "$ME" ] && [ "$ME" != root ] || { echo "run it with sudo from your normal login (not from a root shell)" >&2; exit 2; }
HOME_DIR="$(getent passwd "$ME" | cut -d: -f6)"
read -r -d '' WANT <<'CFG' || true
# Written by deploy/harden-ssh.sh. Remove this file to return to password login.
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
LoginGraceTime 20
CFG
reload_ssh() { systemctl reload ssh 2>/dev/null || systemctl reload sshd; }

if [ "$MODE" = revert ]; then
  rm -f "$CONF"; sshd -t; reload_ssh; echo "reverted: $CONF removed, sshd reloaded"; exit 0
fi

echo "Change to be made in $CONF:"; echo "$WANT" | sed 's/^/    /'
if ! grep -Eqs '^\s*Include\s+/etc/ssh/sshd_config\.d/\*\.conf' /etc/ssh/sshd_config; then
  echo "REFUSING: /etc/ssh/sshd_config does not include sshd_config.d/*.conf, the drop-in would be ignored." >&2; exit 1; fi
n_keys="$(grep -cE '^(ssh-(rsa|ed25519)|ecdsa-sha2-|sk-)' "$HOME_DIR/.ssh/authorized_keys" 2>/dev/null || true)"
if [ "${n_keys:-0}" -lt 1 ]; then echo "REFUSING: $ME has no authorized key in $HOME_DIR/.ssh/authorized_keys. Add one (ssh-copy-id) and test it first." >&2; exit 1; fi
echo "ok: $ME has $n_keys authorized key(s)."
sshd -t || { echo "REFUSING: sshd config is already invalid" >&2; exit 1; }
if [ "$MODE" = show ]; then
  echo; echo "Nothing changed. Next: open a second terminal, prove 'ssh -o PreferredAuthentications=publickey $ME@<vm>' works, then rerun with --apply."; exit 0; fi

if [ -t 0 ]; then
  read -r -p "Is a second terminal logged in AND key login proven? Type YES: " a; [ "$a" = YES ] || { echo "aborted"; exit 1; }
fi
[ ! -f "$CONF" ] || cp -a "$CONF" "$CONF.bak"
printf '%s\n' "$WANT" > "$CONF"; chmod 0644 "$CONF"
if ! sshd -t || [ "$(sshd -T 2>/dev/null | awk '$1=="passwordauthentication"{print $2}')" != no ]; then
  echo "validation failed: removing the drop-in again" >&2; rm -f "$CONF"; [ ! -f "$CONF.bak" ] || mv "$CONF.bak" "$CONF"; exit 1
fi
reload_ssh
echo "applied. NOW test from a NEW terminal: ssh $ME@<vm> (key) works and a password-only attempt is refused."
echo "If locked out of new logins: use the old session and run: sudo bash deploy/harden-ssh.sh --revert"
