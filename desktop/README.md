# Solace Desktop (Windows)

A thin **Tauri v2** shell around `https://solace.zone`. The shell is a native
window + tray icon; **Solace itself always loads live from the server**, so
every normal deploy reaches desktop users automatically — the installer only
matters when the *shell* changes (tray behavior, push-to-talk, …), and even
then the built-in **self-updater** delivers it: the shell checks
`https://solace.zone/desktop/latest.json` at startup and silently installs a
newer shell if one is published.

Shell behaviors: close-to-tray (X hides the window; voice keeps running —
tray-click or "Open Solace" restores, tray → Quit exits), single-instance
(relaunching focuses the existing window), offline screen with auto-retry.

## Build requirements (Windows)

- Rust (rustup) + VS 2022 Build Tools with the C++ workload
- Node (the CLI is an npm dev-dependency: `npm install` in `desktop/`)
- The updater signing key — lives OUTSIDE the repo:
  - `~/.tauri/solace-updater.key` (private key — **never commit**)
  - `~/.tauri/solace-updater.pass` (its passphrase)
  - The matching public key is baked into `src-tauri/tauri.conf.json`.
  - **If the key is lost, shipped shells can never self-update again** —
    users would need to manually install once. Back these two files up.

## Build

```powershell
cd desktop
# NOTE: the CLI wants TAURI_SIGNING_PRIVATE_KEY (key CONTENT or a path) — the
# older _PATH variant is silently ignored and the updater .sig step fails with
# "A public key has been found, but no private key" AFTER a full build.
$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content "$env:USERPROFILE\.tauri\solace-updater.key" -Raw)
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = (Get-Content "$env:USERPROFILE\.tauri\solace-updater.pass" -Raw)
npm run build
```

Artifacts land in `src-tauri/target/release/bundle/nsis/`:
- `Solace_<version>_x64-setup.exe` — the installer people run
- `…-setup.exe.sig` — the updater signature for that installer

## Publish a release

1. Bump `version` in `src-tauri/tauri.conf.json` (and `package.json` to
   match) — including the `SolaceShell/<version>` tag at the end of the
   window `userAgent` (the site keys "am I in the app?" off that marker).
2. Build (above).
3. Run `./publish.ps1` — it stages `Solace-Setup.exe` (stable download name),
   the versioned installer, and a generated `latest.json` into
   `dist-publish/`, then prints the upload steps: `scp` to your home dir on
   the R220 (root SSH is disabled by hardening), then `sudo mv` into
   `/opt/solace/desktop-dist/` + chmod 755/644.
4. Caddy serves that directory at `https://solace.zone/desktop/…`
   (see `deploy/Caddyfile`). Installed shells pick the update up on their
   next launch; the site's login page links the stable installer URL.

## macOS builds (via GitHub Actions — no Mac required)

macOS apps can only be compiled on macOS, so `.github/workflows/desktop.yml`
builds a **universal** (Apple Silicon + Intel) `.dmg` + updater bundle on
GitHub's mac runners.

One-time setup: add two repository secrets on GitHub
(**Settings → Secrets and variables → Actions → New repository secret**):
- `TAURI_SIGNING_PRIVATE_KEY` — paste the contents of `~/.tauri/solace-updater.key`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — paste the contents of `~/.tauri/solace-updater.pass`

Release flow:
1. Bump versions (see above), commit, then `git tag shell-v<version> && git push --tags`
   (or run the workflow manually from the Actions tab).
2. When the run finishes, download the `shell-macos-latest` artifact zip and
   unpack it into `desktop/ci-mac/` (nesting doesn't matter).
3. Run `./publish.ps1` — it stages Windows + Mac + a multi-platform
   `latest.json`, and prints the upload commands. The login page offers
   `Solace.dmg` to Mac visitors automatically.

**Gatekeeper:** the app isn't notarized (needs a $99/yr Apple Developer ID),
so first launch on a Mac requires **right-click the app → Open → Open**
(double-clicking shows "can't be opened"). Tell Mac friends once; after that
it opens normally, and the self-updater keeps it current like on Windows.

## SmartScreen note

The installer is not Authenticode-signed (that's a paid yearly cert), so the
first run shows "Windows protected your PC" → **More info → Run anyway**.
Fine for the friend group; revisit if distribution ever widens.

## Install path + uninstall troubleshooting (Windows)

The installer HAS a "Choose Install Location" page (editable field + Browse)
— it appears on fresh installs, and on already-installed machines it comes
right after the "Already Installed" page. Verified against the live 0.2.0
`Solace-Setup.exe` by driving the GUI programmatically (the field accepts a
custom path on both flows). The uninstaller and Apps & Features both resolve
the app through the HKCU registry entries the installer writes
(`...\CurrentVersion\Uninstall\Solace` + `Software\solace\Solace`).

**"Uninstall can't find the files"** means the registry entry survived but
`uninstall.exe` is no longer at the registered path — which happens when the
install folder was MOVED or deleted by hand (e.g. someone relocating the app
to another drive after installing), not through the installer. Repair on the
affected machine:

1. Run the current `Solace-Setup.exe` from solace.zone.
2. On **Already Installed**, pick **"Do not uninstall"** (the broken
   uninstaller can't run anyway) → Next.
3. On **Choose Install Location**, pick the folder you actually want → Install.
   This rewrites the registry + a fresh `uninstall.exe` at the new location.
4. Uninstall now works normally from Apps & Features. Delete any manually
   moved copy of the old folder yourself — it's junk the registry no longer
   points to.

Never move the installed folder by hand — reinstall to the desired path
instead (the uninstall registry entry doesn't follow a manual move).

**macOS has neither symptom by design:** the `.dmg` is drag-anywhere (that IS
choosing the install path), uninstalling is dragging `Solace.app` to the
Trash, and the updater replaces the `.app` wherever it lives. There's no
installer wizard and no registry.
