# Hosting a Solace community — the satellite handbook

You run a piece of Solace on your own PC. Your community appears in
everyone's **Solace Pages** list; its messages and files live on **your
disk**, not the server's. Windows gets a desktop app; Ubuntu gets a
one-line installer.

## Before you start: it's your community
Hosting makes you the operator of your community. Its messages live on your
machine, you're responsible for what's in it and for keeping it within the
[Community Guidelines](https://solace.zone/legal/guidelines.html), and the
Solace operator can disconnect it at any time. That's all written down in the
[Satellite Host Agreement](https://solace.zone/legal/hosting.html) — read it.
You accept it when you redeem your key (the app's checkbox, the installer's
first question, or `--accept-host-agreement` on the command line), and the
server records that you did.

## Getting started (Windows)
1. Ask a Solace admin for a **provisioning key**.
2. Sign in to Solace → **Solace Pages** → *Want to self-host?* → download and
   install **Solace Satellite**.
3. Open it, paste the key, name your community, tick the Host Agreement box,
   click **Create my satellite**.
4. That's it. The moment the app connects, your community page appears in
   Solace Pages for everyone, with a #lobby channel and you as its manager.

No port forwarding, no domain, no certificates — the app dials out to the
server, never the other way around.

## Getting started (Ubuntu)
One line, with the key an admin gave you:
```
curl -fsSL https://solace.zone/api/satellite/install.sh | sudo bash -s -- --key <KEY>
```
The installer asks its questions in order — the Host Agreement first (the
one question with no default), then community name, who can join, where
messages live, how long files are kept, daily backups, voice — and Enter
takes the sensible default on every other one. An unattended install
(`--yes`) needs `--accept-host-agreement` spelled out; a script can't agree
on your behalf. It installs a system service
that survives reboots, and a management command:

| command | does |
| --- | --- |
| `solace-satellite status` | how the community is doing |
| `solace-satellite config` | change settings — storage, backups, retention, voice |
| `solace-satellite logs` | follow the live log |
| `solace-satellite backup` | run a backup right now |
| `solace-satellite update` | upgrade in place (no new key — the daemon proves who it is) |
| `solace-satellite restart` / `stop` / `start` | service control |
| `solace-satellite uninstall` | remove it (asks before touching data) |

Notes:
- Community **name & privacy** are managed inside Solace afterwards — your
  page → Page Settings. Everything machine-side is `config`.
- Voice hosting is on by default (forward TCP 7880, TCP 7881, UDP
  50000–50060 to the box); answer no at setup or `--no-voice` to skip.
  Unforwarded is fine — calls quietly run on the main server.
- Your community lives in `/var/lib/solace-satellite` unless you chose a
  different storage folder (messages, files, and `identity.json` — the
  community's credential). **Back it up** — `config` can point a daily
  backup at a second drive. The machine-dies story is the same as Windows:
  restore the folder on a new box, ask the admin for a rotation key, re-run
  the installer with it.
- Every question can be pre-answered with flags for unattended installs:
  `--name --privacy --discoverable --storage --backup-dir --keep-animated
  --keep-files --no-voice --yes`.

## Day to day
- **The app lives in the tray.** Closing the window just hides it — your
  community stays online. Right-click the tray icon → Quit to take it
  offline; nothing is lost, and it returns when you're back. Turn on
  *Launch when Windows starts* in Settings and the community survives a
  reboot without you thinking about it.
- You manage the page from inside Solace like any manager: rename it, change
  who can join, add channels, set the landing channel.
- **Voice, cameras and screen sharing work in your community** — add a voice
  channel to your page like any other channel. **Calls run on YOUR PC** once
  you forward two ports on your router (the app's Guide tab walks you
  through it: TCP 7880 + UDP 50000–50060, both at this PC). Until the ports
  are forwarded — or whenever your machine is unreachable — calls quietly
  run on the main server instead, so a room never just dies.
- The app's **Settings** card has the machine-side knobs: launch on Windows
  startup, how long uploaded files are kept, where the community's storage
  lives, and the automatic daily backup folder.
- **The app updates itself.** It checks the server on startup and every few
  hours; when a new build is ready you'll see *Install & restart* in Settings.

## Your disk, your backup
By default everything lives in `%APPDATA%\SolaceSatellite`:
- `content.db` — every message ever posted in your community
- `files\` — the images and files people attached
- `identity.json` — **the community's credential.** It never leaves your PC.

Both are yours to place:
- **Storage** — Settings → *Community storage* → **Move…** puts the messages
  and files on any folder or drive you choose (a bigger second drive, say).
  The identity stays in `%APPDATA%\SolaceSatellite` either way.
- **Backups** — pick a folder under Settings → *Automatic daily backup* (a
  second drive or NAS share is ideal) and the app keeps a daily snapshot
  there by itself: the last 7 days of message databases, all files, and the
  identity. *Back up now* runs one on the spot.

If the machine dies, an admin can mint you a **rotation key**: install the
app on the new PC, paste it into the same setup form, and the community
comes back under the same page. To keep the history, restore your backup
first: copy the newest `content-*.db` in as `content.db`, plus the `files\`
folder. The rotation key mints a fresh identity, so the old one isn't needed.

## What the server can and can't see
- The hub server holds the page itself, its member list, permissions, and a
  small index of every message (who posted, when, where — never the words).
  That index is what makes moderation and unread counts work.
- Message bodies and files live only on your disk. The hub relays them to
  readers while you're online and stores nothing.
- Solace staff hold their normal powers inside your page — they can read,
  delete, and moderate, and the server enforces it. The server can also
  **delist** your satellite at any time, which takes the community offline
  for everyone instantly. Hosting is a privilege the key granted.
- Your account answers for the satellite. If your account is banned, your
  satellite goes with it.

## The fine print
- Uploaded files expire on a schedule (the Settings card's retention knobs);
  messages never expire.
- **Reset this satellite** in Settings erases everything on your machine —
  identity, messages, files. The old satellite stays listed on the server
  until an admin delists it. There is no undo.
- The economy never runs on your machine: no coins, no emoji, no games. Those
  stay on the main server.
