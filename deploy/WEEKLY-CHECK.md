# Solace weekly stability check

One click (or one command), one paste into Claude. ~2 minutes a week.

## The routine — two ways to get the report

**From the app (no SSH):** Admin Panel → Server → **⬇ Weekly stability
report (TXT)**. Downloads the app-layer report — health checks (incl. the
LiveKit liveness probe + loop heartbeats), the errors table, log-ring
warnings, perf aggregates, economy drift, audit trail, connections, storage
with a WAL flag, and backup freshness.

**From the server (adds the OS layer):**

```
sudo bash /opt/solace/deploy/weekly-report.sh
```

Same sections plus what only the OS can tell you: systemd restart counts (a
silent crash-loop counter), the journald history, Caddy 5xx + certificate
expiry, fail2ban, and pending updates. Use the button most weeks; run the
script when something looks off in the download, or once a month for the
full picture.

Either way: paste the **entire report** into a Claude Code session with
*"weekly check — here's the report."* Claude reads every section and flags
anything that needs action. Both reports are read-only — they never touch
the app, the DB, or the system.

## What it covers (and what "good" looks like)

| Section | Green looks like |
| --- | --- |
| Services | everything `active`, `restarts=0` since last deploy |
| Health | `{"status":"ok","db":"ok"}` |
| App errors | zero rows, or only known/dismissed ones |
| Journal | error-ish lines near zero, nothing repeating |
| Performance | avg CPU ~0, RSS flat vs last week (creep past ~300 MB = look) |
| Economy | `total` moves only with real activity — no unexplained jumps |
| Audit | only actions you remember taking |
| Storage | WAL small, uploads growing at a human pace, disk >10% free |
| Backups | newest archive <24h old, size similar to the last one |
| Caddy | no 5xx pile-ups, cert expiry >30 days out |
| LiveKit | zero journal errors |
| Security | fail2ban bans are normal internet noise; no reboot pending |

### Economy drift — two things that are NOT drift

- **The first snapshot after 2026-09-16 jumps by the migration-94 refunds** (the
  twelve Emporium items retired as tier lookalikes: every owner refunded at the
  frozen default price). One step, once, like migration 48.
- **`houseMints`** (the Tier-4 "house pays the goblins" perk) is a ledgered
  mint INTO the goblin vault; the report subtracts it from the total. If the
  total still moves on a day with a consolidation, the mint is not the cause.

## The weekly security glance

**Admin Panel → Security**, 30 seconds, while you're already in there:

| Look at | Good |
|---|---|
| The posture list (top) | all green or white; "Registration policy" invite-only |
| The machine list | collector fresh (not STALE), ufw active, **no accepted SSH password logins**, no unexpected listening ports |
| Findings | empty. A stuffing finding is crit and means an address walked several usernames |
| Sessions | every live session is a device you can place. Revoke anything you can't |
| Sign-in log | failures against real usernames should be your friends fat-fingering, not a run |

The one to never wave past is **"verified from a new network"** on a staff
account: someone produced both the password and the recovery secret from an
address that account has never used. Sterling DMs that one every single time,
with no cooldown, on purpose.

## Between the weekly checks

Sterling is the continuous watch: a 5-minute sweep runs the full health
checks (DB, disk, memory, backup age, **a real LiveKit liveness probe**, and
a heartbeat on every background loop), a 10-minute error-surge detector, and
**the security scan** over the sign-in ledger plus the host snapshot — and
**DMs every admin** on a red flag (6h cooldown per issue, except staff
security findings, which always fire). If Sterling is quiet, the box thinks
it's healthy.

The one thing nothing on the box can report: **the box itself being down.**
For that, set up a free external monitor once — e.g. UptimeRobot pinging
`https://solace.zone/health` every 5 minutes with email on failure. That
closes the last blind spot.

## Occasional extras

- **Quarterly:** test-restore a backup on your PC (deploy/README.md §restore)
  — a backup that's never been restored is a hope, not a backup.
- **After any deploy:** glance at Admin Panel → Overview once — all checks
  green, heartbeats fresh.
