# D2 (SRE/DevOps): VM deployment, packaging, operations

Fact check: `site/package.json` has zero runtime dependencies (only jsdom for tests) and needs Node >=20. That makes a single Node process with a SQLite file (`node:sqlite`, Node 22+) or JSON-file store the cheapest thing to run. Python/FastAPI would add a venv and pip step on an unknown VM. Recommend Node.

## (a) Deployment on the VM

| Option | Pros | Cons |
|---|---|---|
| **1. systemd unit + Caddy/nginx** (recommended) | Restart on crash, journald logs, `NoNewPrivileges`, `ProtectSystem=strict`, `ReadWritePaths=/var/lib/leakproof`. No extra runtime. | Needs sudo on the VM. |
| 2. Docker compose | Same image on VM and laptop; easy reset. | Docker may be absent or not allowed. Daemon access is root-equivalent. Slower to debug. |
| 3. pm2 / `nohup node` | No sudo. Works on any account. | No hardening. Dies on reboot. Log rotation is manual. |

**Recommendation: option 1.** Option 3 is the fallback if there is no sudo.

- **Process:** the app listens on 127.0.0.1:3000 as user `leakproof` (no shell, not in sudo). A reverse proxy owns 443/80.
- **Proxy:** sets HSTS, a CSP, body size limit (64 KB) and per-IP rate limit.
- **Firewall:** ufw allows 22 (our IPs only if the VM allows it) and 443 only. The app port stays closed to the network.
- **TLS with only an IP:** there are three choices.
  - (i) Ask the TAs for a hostname, then use Let's Encrypt. Best.
  - (ii) Self-signed certificate or a private CA. Classmates click through a warning, so publish the SHA-256 fingerprint in the guide, because teaching people to ignore warnings is itself a usability and security flaw.
  - (iii) Plain HTTP on the campus network. Last resort. State it in the threat model, and do not put any real secret in the session cookie path.
- **Secrets and files:**
  - Directory `/var/lib/leakproof` is `0700`, owned by `leakproof`.
  - The master/signing key lives in `/etc/leakproof/key` at `0400`, loaded through systemd `LoadCredential=` rather than an env var (env vars leak via `/proc` and crash dumps).
  - The DB is `0600`.
  - Source is read-only and owned by root.

## (b) Packaging for the file server

Hand over **one `leakproof-v1.tar.gz` + SHA-256 file + USER_GUIDE.pdf + the hosted URL**. The tarball holds source, a pinned `node_modules` (or none), `install.sh` and `Makefile`.

- `make install` creates the user, the unit and the proxy config. It is idempotent.
- `make seed` loads demo setters, 100 questions and a pre-built exam.
- `make reset` stops the service, snapshots, wipes the DB, reseeds and starts.
- `make run-local` is `node server.mjs` on localhost, so graders can run it without the VM.
- `make verify` runs the 170 tests plus a smoke test.

Having both a runnable tarball and a live URL covers either reading of "executable on a file server".

## (c) Operations, 18-25 Nov

- **Reset:** a nightly `make reset` is not enough. Run an hourly sealed snapshot (`sqlite3 .backup`, 48 retained), plus an admin-only "restore demo" button and a documented one-liner.
- **Backups:** the key and the audit chain are copied to a second location. Verify the hash chain after every restore.
- **Logs:** a structured logger with an allowlist of fields (event, role, hashed seat ID, status). Never log request bodies, keys, shares or cookies. A CI grep test seeds a canary secret and asserts it never appears in output.
- **Rate limiting:** proxy limit per IP, plus app limit per account and per login. Per-account lockout is a DoS vector, so use backoff, not hard lockout.
- **Wrecked data:** tell classmates to use per-tester sandboxes (tenant per user) if D-lens designers allow it. Otherwise reset hourly and keep an incident log. Treat classmate wrecking as evidence for the video, not an outage.
- **Monitoring:** `/healthz`, an external cron curl from my laptop, disk and journald alerts to a team chat, and a one-page runbook.

## (d) Ask the TAs NOW

1. OS and version, sudo or root? Node, Python, Docker installed? Outbound internet?
2. Public IP or hostname? Reachable from the whole campus or VPN only?
3. Which ports are open? Can we request 443 and 80?
4. Can we get a DNS name or a CA certificate?
5. RAM, disk and CPU limits? Is there a snapshot facility?
6. Is the VM up 24/7, and is there a reboot or maintenance window? Who do we contact if it is down?
7. Is there a file-server path and a size limit? Does the posted file need a specific format?
8. Will anyone else scan or load-test the VM?

**Fallback:** a free-tier cloud VM (Oracle/AWS) or a small VPS, or a Cloudflare Tunnel from a laptop. The same tarball and `make install` work everywhere. We must also tell the TAs that the fallback is a team-owned host.
