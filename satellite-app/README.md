# Solace Satellite — the desktop app for community hosts

Host your own Solace community from a window. No terminal, no Node install,
no port forwarding: the app dials OUT to the hub (FEDERATION.md's rendezvous
design), so running it is the whole job.

## What a host does
1. Ask a Solace admin for a **provisioning key** (Admin Panel → Satellites).
2. Install and open **Solace Satellite**.
3. Paste the key, name the community, click **Create my satellite**.
4. Leave the app open. That's it — the admin binds a community page to the
   satellite and it appears in everyone's Solace Pages picker.

Messages live in `%APPDATA%\SolaceSatellite` on the host's machine (their
disk, their community). Closing the app takes the community offline; nothing
is lost, and it returns on reopen.

## Architecture
- **The daemon** is `src/satellite/main.ts` compiled to a self-contained
  Windows executable via Node SEA (`scripts/build-satellite-exe.mjs` — a copy
  of the build machine's Node 24 with the bundled daemon injected, so
  `node:sqlite` is stable with no flags and hosts install nothing).
- **The app** is a Tauri v2 window (this directory) that spawns the daemon
  as a sidecar in `serve` mode and renders `ui/index.html` — a vanilla-JS
  control panel talking to the daemon's localhost-only API on 127.0.0.1:8765
  (`src/satellite/local.ts`; anti-drive-by: hostile Origins refused, POSTs
  require the `x-sat-local` header no cross-origin page can send).
- CLI setup still works for power users:
  `satellited register --hub <url> --key <code> --name <x>` then
  `satellited run` — same engine, no window.

## Build loop (Windows, Rust + Node 24 required — the dev machine has both)
Bump `version` in src-tauri/tauri.conf.json AND Cargo.toml first — the
auto-updater only moves on a version increase.
```bash
npm run build                          # repo root: compile dist/
node scripts/build-satellite-exe.mjs   # SEA sidecar → src-tauri/binaries/
cd satellite-app && npm install
TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/solace-updater.key)" \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(cat ~/.tauri/solace-updater.pass)" \
npx tauri build
# installer + updater sig: src-tauri/target/release/bundle/nsis/
#   Solace Satellite_<v>_x64-setup.exe (+ .sig)
```
The updater signature uses THE SHELL'S minisign keypair (losing
~/.tauri/solace-updater.{key,pass} breaks self-update for BOTH apps).
**Authenticode-signed since 0.4.0** (the shell's CN=Solace via sign.ps1 +
signCommand). Two build-machine quirks, both hit: export
`TAURI_WINDOWS_SIGNTOOL_PATH` to the SDK's x64 signtool.exe (tauri's
registry lookup fails on this box even with the SDK installed), and the
SEA build strips node.exe's stale signature before injection (postject
leaves a dangling certificate table signtool refuses as a malformed PE).

## Publishing — MEMBER-ONLY, not /desktop/
The installer is gated to logged-in members (Josh, Sep 2026): it lives at
`/opt/solace/satellite-dist/Solace-Satellite-Setup.exe` on the R220 — a
directory Caddy does NOT serve — and the app streams it from
`GET /api/satellite/app` (session auth; `SATELLITE_APP_PATH` overrides the
path). Members download it from the "Want to self-host?" band at the foot
of the Solace Pages picker. **Never copy it into `/opt/solace/desktop-dist/`**
— that dir is public at `/desktop/`.
Publishing a release means THREE files in `/opt/solace/satellite-dist/`
(the F4 auto-updater reads the manifest + package through the
identity-gated `/api/satellite/update/*` routes):
```bash
# locally: stage all three (the repo's gitignored satellite-dist/ mirrors prod)
cp ".../Solace Satellite_<v>_x64-setup.exe" satellite-dist/Solace-Satellite-Setup.exe
cp ".../Solace Satellite_<v>_x64-setup.exe" satellite-dist/Solace-Satellite-Update.exe
# satellite-latest.json: {version, notes, pub_date, platforms:{"windows-x86_64":
#   {signature: <contents of the .sig file>, url: "https://solace.zone/api/satellite/update/pkg"}}}
scp satellite-dist/* josh@r220:/tmp/  # then sudo mv into /opt/solace/satellite-dist/ + chmod 644
```
Running apps (≥0.2.1) see the new version within 6 hours and offer
"Install & restart". Apps ≤0.2.0 predate the updater — one manual
reinstall via the Pages download band moves them onto the update train.

## Shipped niceties
- **Tray-resident hosting** (0.3.0): X hides to the tray, the community
  stays online; tray menu Quit takes it offline. With launch-on-startup, a
  host reboot self-heals. Quit closes the daemon's STDIN and waits before
  killing — a bare kill is TerminateProcess, which skips the daemon's exit
  handlers and orphans livekit-server on :7880 (0.6.0 fix).
- **The distinct icon**: the shell's ring + a SOLID cyan orbiting moon
  (source: `sat-icon-src.png`; regenerate with `npx tauri icon`). Solid
  since 0.6.0 — the original outline moon dissolved at the taskbar's 32px,
  which read as "same icon as the client". NB Windows caches icons by exe
  path: after an in-place icon change, the taskbar keeps the old art until
  `iconcache_*.db` is deleted + Explorer restarted.
- **Storage & backup** (0.6.0): Settings → Community storage → Move…
  relocates content.db + files/ to any drive (identity stays in %APPDATA%);
  Automatic daily backup keeps dated db snapshots (×7) + a files mirror +
  the identity in a host-chosen folder. Folder picking via
  tauri-plugin-dialog (`dialog:allow-open` in capabilities).
- **Voice bandwidth diagnostics** (0.6.1): the SFU's Prometheus metrics
  (port :7889 — LAN-visible counts only, never in the forward table) drive
  Diagnostics' voice row — people on calls, real call traffic ↓/↑, and a
  packet-loss warning when the PC can't keep up. The Guide's port table
  gained TCP 7881 (ICE-over-TCP media fallback) and a per-viewer
  bandwidth-cost card.
- **The second review's hardening** (0.6.2, daemon 0.3.2): settings.json
  writes atomically (it's the sole pointer to a moved community); the move
  copies in the daemon's BACKGROUND (the panel polls it home — a big
  library used to outlive the fetch and report a move that later succeeded
  as failed) and the backup mirror yields per file, so quitting the app
  mid-copy no longer trips the backstop kill that orphans the SFU (backstop
  also 3s→8s); a restored settings.json pointing at a detached drive serves
  the panel with the reason and self-heals every 15s instead of dying;
  snapshots are one per DAY (repeat "Back up now" presses no longer evict a
  week of dailies); a failed SFU spawn retries instead of sticking.
- **The Host Agreement** (0.6.3, daemon 0.3.4): the setup form has a required
  "I've read and agree to the Satellite Host Agreement" box (the link follows
  the server field). The daemon's `/api/setup` refuses without it, and the hub
  refuses a register call with no acceptance on file
  (`hosting_agreement_required`) — a 0.6.2 app can't register until it
  self-updates to this build. CLI: `register … --accept-host-agreement`.

## Deferred
- Authenticode signing (SmartScreen); satellite-local media (F5's original
  sketch) if a community ever outgrows the hub's SFU.
