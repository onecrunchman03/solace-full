# Hardening the Solace server (Ubuntu 24.04)

The app now defends itself (strong passwords, recovery-secret + new-network
challenge, per-account lockout, spoof-proof client IPs). This doc hardens the
**box underneath it** — the layer an attacker hits before they ever reach the
login form. Do these once, after the app is up (`deploy/R220-SETUP-GUIDE.txt`).

Everything below runs on the **R220** over SSH as your sudo user.

---

## 1. SSH: keys only, no root, no passwords

Password SSH is the single biggest risk on an internet-facing box — bots hammer
port 22 forever. Switch to key auth and turn passwords off.

**On your PC** (once), if you don't already have a key:
```powershell
ssh-keygen -t ed25519          # press Enter through the prompts
ssh-copy-id your-user@solace.zone   # or paste the .pub into ~/.ssh/authorized_keys
```
If `ssh-copy-id` isn't on Windows, print your key and append it on the server:
```powershell
type $env:USERPROFILE\.ssh\id_ed25519.pub
```
```bash
# on the R220:
mkdir -p ~/.ssh && chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys      # paste the line, save
chmod 600 ~/.ssh/authorized_keys
```

**Verify key login works in a NEW terminal before locking passwords out** —
`ssh your-user@solace.zone` should connect without asking for a password.

Then disable root + password auth:
```bash
sudo nano /etc/ssh/sshd_config.d/99-hardening.conf
```
```
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
```
```bash
sudo systemctl restart ssh
```
> ⚠️ Keep your current session open and test a fresh `ssh` login before closing
> it — if you mistyped something you can still fix it from the open session.

---

## 2. fail2ban: auto-ban brute-force SSH

**Installed on the R220 (Aug 2026) from version-controlled config** — see
`deploy/fail2ban/jail.local`, which allowlists the entire LAN so an *automatic*
ban can never lock the operator out of his own box, and bans via `ufw` so bans
show up in `ufw status` instead of hiding in a raw iptables chain. It also
carries a prepared-but-**disabled** jail for `/api/login` abuse; read the
comment above it before enabling, because a ban there removes someone from the
whole site.

**Two traps, both hit during that install, both documented in `jail.local`:**

1. `apt install` starts the service, so `systemctl enable --now` changes
   nothing and the daemon runs its *pre-copy* config. Use `restart`, then
   confirm with `fail2ban-client get sshd bantime` (3600 = our file was read).
2. `fail2ban-client set sshd banip <ip>` **bypasses `ignoreip`** — it's an
   operator override, not a dry run of the automatic path. Used as a test of
   the allowlist it will simply ban the address you gave it, on every port.
   To unban: `sudo fail2ban-client unban --all` (from the console if you've
   just locked out your own SSH; otherwise wait out `bantime`).

The steps below are the original manual walkthrough, kept for reference.


```bash
sudo apt install -y fail2ban
sudo tee /etc/fail2ban/jail.local >/dev/null <<'EOF'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
EOF
sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd      # shows current bans
```
(The Solace login itself is already brute-force-protected in-app — per-account
lockout with escalating backoff — so fail2ban here is about SSH.)

---

## 3. Automatic security updates

Keep the OS patched without remembering to:
```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades    # choose "Yes"
```
**Reboot automatically when a patch needs it — ON for the R220 since
2026-10-13.** Only when an update leaves `/var/run/reboot-required` (a new
kernel or libc, once or twice a month), and only at 09:00 UTC — 5 AM Eastern
in summer, 4 AM in winter, inside the house's closed hours. The file is in
the repo:
```bash
sudo install -m 644 deploy/apt/52solace-reboot /etc/apt/apt.conf.d/52solace-reboot
apt-config dump | grep -i automatic-reboot     # all three lines should show
```
**slopbot (YOUR_GPU_BOX_IP) does the same at 05:30 Eastern** (its clock is
America/New_York): `deploy/apt/52slopbot-reboot`, plus a drop-in moving its
nightly upgrade run to 04:30 so a needed reboot lands that same morning
(`/etc/systemd/system/apt-daily-upgrade.timer.d/solace.conf`:
`OnCalendar=` then `OnCalendar=*-*-* 04:30`, `RandomizedDelaySec=15m`). The
half hour after the R220 keeps the two Pi-holes from ever rebooting together.
Its setup-day file `52solace-unattended` had `Automatic-Reboot "false"` —
removed, since a later file wins. **The workstation** keeps the big engine
and the regulars' voices up through `deploy/workstation/solace-gpu.ps1`:
logon shortcut + (from an ELEVATED `-Install`) a power-on task, one
supervisor either way.

Not a reboot on a timer: measured on the R220 (Oct 2026), memory doesn't
build up — 0 ECC errors in 26 days, Solace's own memory flat between
restarts — so a daily reboot would only drop people. Everything Solace needs
(solace, caddy, livekit, pihole-FTL, unbound, fail2ban and the timers) is
enabled and comes back on its own.

---

## 4. Firewall — confirm it's minimal

From the setup guide you should already have exactly these. Double-check
nothing else crept open:
```bash
sudo ufw status verbose
```
Expected: **22/tcp** (SSH), **80** + **443/tcp** (web), and — only if voice is
on — **50000:50100/udp** + **7881/tcp**. Port 8443 (the app) must NOT be here;
it's localhost-only behind Caddy.

---

## 5. Apply the spoof-proof-IP Caddy change

The new login-location security trusts the client IP Caddy reports. Pull the
updated `Caddyfile` (it now overwrites `X-Forwarded-For` with the real client so
it can't be forged) and reload:
```bash
cd /opt/solace && sudo -u solace git pull
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile     # re-check your domain is still solace.zone
sudo systemctl reload caddy
```

---

## 6. Nice-to-haves

- **Off-box backups.** The nightly job writes to `/var/backups/solace`. Copy
  those somewhere else periodically (another machine, or `rclone` to cloud
  storage) so a dead disk doesn't take the DB with it.
- **Watch the logs occasionally.** `journalctl -u solace -e` (app),
  `sudo fail2ban-client status sshd` (bans), `journalctl -u caddy -e` (web).
- **Keep Node/Caddy current.** `sudo apt update && sudo apt upgrade` every few
  weeks picks up Caddy; Node majors are manual (rare).

---

## 7. Install the host security collector

Everything on this page is a thing you did once. The collector is what tells
you it's *still* true — it re-checks most of the sections above every ten
minutes and puts them on **Admin Panel → Security**, next to the application's
own sign-in ledger. Install: `deploy/README.md` §10.

It will tell you if SSH ever accepts a **password** (§1 undone), if fail2ban
stops running (§2), if a security update goes unapplied or a reboot is pending
(§3), if ufw goes inactive or an unexpected port starts listening (§4), and if
the app ever binds publicly instead of behind Caddy (§5, which is what makes
the spoof-proof IP work). Anything red also DMs you through Sterling.

The caveat, stated once and meant: **a genuinely rooted box can edit every
input the collector reads.** It catches a careless intruder and — much more
often — it catches your own configuration drifting. The off-box backup copy
above is the part that survives an attacker who is not careless.

---

## What the app already does (so you don't have to)

| Threat | Defense (in Solace itself) |
|---|---|
| Weak/reused passwords | 12-char complexity **+** breach-list / pattern / username screening |
| Leaked password used elsewhere | New-network login demands the recovery secret |
| Forgotten password | Self-service reset via the recovery secret (kills all sessions) |
| Online password guessing | Per-account lockout with escalating backoff + per-IP rate limits |
| Forged client IP | `X-Forwarded-For` read from the proxy's own hop, not the client's |
| Stolen session after a password change | Password change / reset evicts every other session |
| Secrets at rest | Passwords **and** recovery secrets stored as scrypt hashes, never plaintext |
| A sign-in you didn't make | Every attempt recorded with address + device (90 days), visible to admins **and** to the account's owner in Settings → Security |
| A stolen session token | Every live session listed with provenance; revocable one-by-one or all-at-once, by you or by them |
| Credential stuffing | One address trying several usernames is detected by shape and DMed to admins |
| Nobody watching the panel | Sterling DMs every admin on any finding — with no cooldown at all for staff accounts |
