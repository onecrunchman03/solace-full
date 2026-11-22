# Deploying Solace (Ubuntu 24.04)

A start-to-finish runbook for putting Solace on an internet-facing box (the Dell
R220). The shape: **Caddy** terminates HTTPS and serves the static client,
reverse-proxying `/api`, `/ws`, `/emoji`, `/avatars`, and `/health` to the
**Node** backend, which binds `127.0.0.1:8443` and is never exposed directly.
A **systemd** unit keeps the app running; a **timer** backs up the data nightly;
**ufw** limits the firewall to SSH + HTTP(S).

Files in this folder:

| File | Installs to | Purpose |
|---|---|---|
| `Caddyfile` | `/etc/caddy/Caddyfile` | reverse proxy + static SPA + auto-HTTPS |
| `solace.service` | `/etc/systemd/system/` | run the backend |
| `.env.production.example` | `/opt/solace/.env` | production config + secrets |
| `backup.sh` | `/opt/solace/deploy/` | consistent DB + uploads snapshot |
| `solace-backup.service` / `.timer` | `/etc/systemd/system/` | nightly backup |

Everything below assumes the app lives at **`/opt/solace`**, run by a dedicated
**`solace`** user. Adjust paths consistently if you change that.

---

## 0. Before you start

- A **domain name** you control, `solace.zone` (registered at GoDaddy), with a DNS **A record**
  (and AAAA if you have IPv6) pointing at the server's public IP.
- Ports **80** and **443** forwarded from your router to the box (Let's Encrypt
  validates over 80; users connect over 443).
- SSH access to the server as a sudo-capable user.

> Throughout, replace `solace.zone` with your real domain.

---

## 1. Install the runtimes

```bash
# Node 24 (nodesource). node:sqlite is stable on 24 — no experimental flag.
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs git sqlite3

# Caddy (official repo)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

node --version   # expect v24.x
caddy version
```

## 2. Create the app user and directory

```bash
sudo useradd --system --home /opt/solace --shell /usr/sbin/nologin solace
sudo mkdir -p /opt/solace
sudo chown solace:solace /opt/solace
```

## 3. Get the code and build

```bash
# Clone as the solace user so file ownership is correct.
sudo -u solace git clone <YOUR_REPO_URL> /opt/solace
cd /opt/solace

# Backend (runtime deps: ws, chess.js, livekit-server-sdk — all pure JS,
# no native modules), then compile TypeScript -> dist/
sudo -u solace npm ci
sudo -u solace npm run build

# Client -> client/dist (what Caddy serves)
cd client
sudo -u solace npm ci
sudo -u solace npm run build
cd /opt/solace

# Caddy runs as its own user and must be able to READ the built site —
# otherwise browsers get HTTP 403 from file_server. (Repeat the dist chmod
# after every rebuild; npm run build recreates the folder.)
sudo chmod o+X /opt/solace /opt/solace/client
sudo chmod -R o+rX /opt/solace/client/dist
```

## 4. Copy the emoji artwork (NOT in git)

The ~57 MB of emoji images are gitignored and live only on disk. Without them,
every emoji 404s. Copy them from your dev machine into `/opt/solace/emoji/`,
preserving the tier subfolders:

```bash
# from your dev machine (example):
rsync -av ./emoji/ solace-admin@solace.zone:/tmp/emoji/
# then on the server:
sudo rsync -av /tmp/emoji/ /opt/solace/emoji/
sudo chown -R solace:solace /opt/solace/emoji
```

Expected layout: `emoji/{common,rare,legendary,mythic}/…` plus
`emoji/special/talisman.png`.

## 4b. Load the jukebox (NOT in git either)

THE JUKEBOX on the casino floor plays MP3s from disk. They're gitignored for
the same reasons as the emoji art (size, and they aren't ours to redistribute),
so a `git pull` leaves the casino silent. Ship a folder of MP3s named
`Artist - Title.mp3` and let the ingest read each file's real length:

```bash
# from your dev machine:
rsync -av "./assets/casino/jukebox playlist/" solace-admin@solace.zone:/tmp/jukebox/
# then on the server, AFTER the build (it imports dist/):
cd /opt/solace
sudo -u solace DATA_DIR=/opt/solace/data node scripts/ingest-jukebox.mjs /tmp/jukebox
```

It copies each record into `data/uploads/music/` under a UUID name and inserts
a row; re-running is safe (a title+artist already in the library is skipped).
After that, records are managed in **Admin Panel → Jukebox** — add, rename,
remove — and `data/uploads/` is already inside the nightly backup, so the music
rides along with everything else.

## 5. Configure secrets (`.env`)

```bash
sudo -u solace cp deploy/.env.production.example /opt/solace/.env
sudo -u solace nano /opt/solace/.env       # set ADMIN_PASSWORD now!
sudo chmod 600 /opt/solace/.env
sudo chown solace:solace /opt/solace/.env
```

**`ADMIN_PASSWORD` only takes effect on the first boot** (when the DB is empty),
because that's when the `admin` account is seeded. Set it before step 6. The
template ships with `ALLOW_REGISTRATION=true` + `REQUIRE_INVITE=true` — i.e.
invite-only.

## 6. Run the backend under systemd

```bash
sudo cp deploy/solace.service /etc/systemd/system/solace.service
# If `which node` is not /usr/bin/node, edit ExecStart to match.
sudo systemctl daemon-reload
sudo systemctl enable --now solace

sudo systemctl status solace --no-pager
journalctl -u solace -n 30 --no-pager      # look for "Solace listening on ..."
curl -s http://127.0.0.1:8443/health        # {"status":"ok","db":"ok"}
```

## 7. Put Caddy in front

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile              # replace solace.zone
sudo mkdir -p /var/log/caddy && sudo chown caddy:caddy /var/log/caddy
sudo systemctl reload caddy
journalctl -u caddy -n 40 --no-pager        # watch the cert get issued
```

Now browse to `https://solace.zone` — you should get the login screen over
a valid certificate. Log in as **`admin`** with the password from step 5.

## 8. Firewall (do SSH first!)

```bash
sudo ufw allow OpenSSH        # <-- before enabling, or you lock yourself out
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Port 8443 is deliberately **not** opened — the backend is localhost-only and
reached only through Caddy.

If you're running voice (next section), also open the WebRTC media ports —
UDP for normal media, TCP 7881 as LiveKit's fallback for UDP-hostile networks
(campus wifi, hotels, some mobile carriers). Forward both on the router too.

```bash
sudo ufw allow 50000:50100/udp
sudo ufw allow 7881/tcp
```

## 8b. Voice (LiveKit)

Voice channels use a LiveKit SFU running next to the app. Caddy proxies its
signalling WebSocket at `/livekit`; audio flows over UDP 50000–50100.

```bash
# Install the server binary (check releases for the current version):
curl -sL https://github.com/livekit/livekit/releases/download/v1.13.3/livekit_1.13.3_linux_amd64.tar.gz \
  | sudo tar xz -C /usr/local/bin livekit-server

# Generate real credentials (NEVER ship the devkey/secret pair):
livekit-server generate-keys

# Config + unit (put your generated key: secret under `keys:` in the yaml):
sudo cp /opt/solace/deploy/livekit.yaml /etc/livekit.yaml
sudo nano /etc/livekit.yaml                      # replace the keys block
sudo cp /opt/solace/deploy/livekit.service /etc/systemd/system/
sudo systemctl enable --now livekit
```

Then add the same credentials to `/opt/solace/.env` and restart solace:

```
LIVEKIT_URL=wss://solace.zone/livekit
LIVEKIT_API_KEY=<your generated key>
LIVEKIT_API_SECRET=<your generated secret>
```

When those three are unset, voice simply stays hidden in the app — the rest
of Solace is unaffected.

## 9. Nightly backups

```bash
sudo chmod +x /opt/solace/deploy/backup.sh
sudo mkdir -p /var/backups/solace
sudo chown solace:solace /var/backups/solace

sudo cp deploy/solace-backup.service /etc/systemd/system/
sudo cp deploy/solace-backup.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now solace-backup.timer

# Prove it works right now:
sudo systemctl start solace-backup.service
ls -lh /var/backups/solace                  # a solace-YYYYMMDD-HHMMSS.tar.gz
systemctl list-timers solace-backup.timer   # confirm the next run time
```

Each archive contains a crash-consistent `solace.db` snapshot + `uploads/`
(avatars). **The emoji artwork is intentionally excluded** — it's large and
static; archive it once separately (`tar -czf emoji-assets.tar.gz -C /opt/solace emoji`)
and keep that copy safe. For real durability, also copy the nightly archives
off-box (rsync/rclone to another machine or object storage).

---

## 10. Host security collector (Admin Panel → Security)

The Security screen has two halves. The **application** half — who signed in,
from where, which sessions are live — needs nothing installed; it reads the
app's own database. The **machine** half needs this collector, because the app
is sandboxed on purpose (`NoNewPrivileges`, `ProtectSystem=strict`, no child
processes) and cannot read the SSH journal, fail2ban, or the socket table.
Rather than loosening that sandbox for a read-only screen, a small root job
writes one JSON file that the app reads.

```bash
sudo chmod +x /opt/solace/deploy/security-collector.sh
sudo cp deploy/solace-security.service /etc/systemd/system/
sudo cp deploy/solace-security.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now solace-security.timer

# Prove it works right now:
sudo systemctl start solace-security.service
sudo cat /opt/solace/data/security-snapshot.json | head -c 400
systemctl list-timers solace-security.timer
```

It reports: SSH logins (and loudly, any accepted **password** login — the
hardening guide says keys only), failed-login volume, fail2ban jail state,
public listening ports against an expected list, whether the app is
accidentally bound publicly instead of behind Caddy, ufw state, pending
security updates and reboots, TLS expiry, `authorized_keys` counts per
account, sudo group membership, and service restart counts.

The app treats a snapshot **older than 30 minutes as stale** and says so in
red — the timer runs every 10, so widening one means widening the other
(`SNAPSHOT_STALE_MS` in `src/security.ts`). Anything red also becomes a
finding, which means Sterling DMs the admins.

**Read the caveat in the panel and believe it:** if the box is genuinely
rooted, every input above is editable by whoever rooted it. This catches a
careless intruder and, more often, catches configuration drift. Off-box,
append-only copies of the backups are the real integrity story.

---

## Invites (first accounts)

With `REQUIRE_INVITE=true`, new users need a code. As `admin`, open the ⚙️
**Admin settings** panel → **Invites** → *Mint invite code* (single- or
multi-use, optional expiry), then share the code. Each new person registers with
it on the login screen. Revoke a code anytime from the same panel.

## Updating to a new version

```bash
cd /opt/solace
sudo -u solace git pull
sudo -u solace npm ci && sudo -u solace npm run build
cd client && sudo -u solace npm ci && sudo -u solace npm run build && cd ..
sudo chmod -R o+rX /opt/solace/client/dist   # the build recreates dist
sudo systemctl restart solace
```

Migrations run automatically on boot (idempotent). The static client is picked
up by Caddy immediately (no Caddy reload needed) — hard-refresh the browser.

## Restoring from a backup

```bash
sudo systemctl stop solace
cd /tmp && tar -xzf /var/backups/solace/solace-YYYYMMDD-HHMMSS.tar.gz
sudo -u solace cp solace.db /opt/solace/data/solace.db
# remove stale WAL sidecars so SQLite reopens cleanly from the restored file:
sudo rm -f /opt/solace/data/solace.db-wal /opt/solace/data/solace.db-shm
sudo -u solace rsync -a --delete uploads/ /opt/solace/data/uploads/   # if present
sudo chown -R solace:solace /opt/solace/data
sudo systemctl start solace
```

(If you also lost the emoji artwork, restore `emoji-assets.tar.gz` into
`/opt/solace/emoji/` as in step 4.)

## Troubleshooting

- **502 from Caddy** → backend down: `journalctl -u solace -e`. Check `/health`.
- **Emoji / avatars 404 but the app loads** → the proxied prefix or the files:
  confirm `/opt/solace/emoji` is populated and the `@backend` matcher covers
  `/emoji/*` and `/avatars/*`.
- **Cert won't issue** → DNS not pointing here yet, or 80/443 not reachable.
  `journalctl -u caddy -e`.
- **`.env` change ignored** → restart the app (`systemctl restart solace`); the
  file is read only at boot. Remember `ADMIN_PASSWORD` is first-boot-only.
- **WebSocket won't connect** → it uses the page's own host over `wss://`, so
  this is almost always a proxy issue: make sure `/ws` is in the `@backend`
  matcher (Caddy upgrades it automatically).
