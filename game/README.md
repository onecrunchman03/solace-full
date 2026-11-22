# SolaceBackrooms — the game client

First-person co-op Level 0 explorer. Svelte 5 shell + Three.js world,
packaged with Tauri v2 as a fully-bundled desktop app (unlike the Solace
desktop shell, nothing is remote-loaded — the game ships in the installer
and talks to the server over the API + `/ws-game`).

## Dev loop

Terminals (from the repo root):

1. Backend: `npm run dev` (port 8443)
2. Game: `cd game && npm run dev` (port 5175 — proxies /api + /ws-game)
3. Voice (optional): `./livekit/livekit-server.exe --dev`

Open http://localhost:5175 — sign in with any Solace account. In dev the
Vite proxy makes everything same-origin; the PACKAGED app instead calls
`https://solace.zone` directly (override with `VITE_SERVER` at build time),
which the server allowlists for CORS (`GAME_ORIGINS` in `src/http.ts` —
Tauri's webview origins).

**Assets:** Josh's licensed packs live in `<repo>/assets/` (gitignored —
their licenses forbid raw redistribution): TheBackroomsAndPoolrooms
textures, Hazmat PS1 (the player model), Liminal Worlds (ambience). Run
`node scripts/prepare-assets.mjs` once to process them into
`game/public/assets/` (crops the ceiling atlas, transcodes the ambience
WAV→OGG, stages the hazmat FBX); the vite build then bundles them into the
installer, which is normal in-project use.

Checks: `npx svelte-check --tsconfig ./tsconfig.json` and `npm run build`.

## Packaging (Windows)

Prereqs: Rust + VS C++ Build Tools (already set up on Josh's machine; cargo
lives at `~\.cargo\bin`). Then:

    powershell -ExecutionPolicy Bypass -File publish.ps1

That runs `tauri build` (vite build included via `beforeBuildCommand`),
signs with the self-signed Solace cert (`sign.ps1`, same as the shell —
SmartScreen shows "More info → Run anyway" once), and stages
`dist-publish/SolaceBackrooms-Setup.exe` with upload instructions printed.
The file is served from the same dir as the desktop shell
(`/opt/solace/desktop-dist` → `https://solace.zone/desktop/…`), and the
GET THE GAME card in Solace's Backrooms section lights up automatically
once the file exists (it HEAD-checks).

No self-updater in v1 — new versions replace the served file and players
re-download. (The shell's updater pattern is there to adopt later if the
game's release cadence warrants it.)

## Where things are

- `src/screens/` — Title → Login (real Solace auth) → Menu (the four doors,
  live occupancy) → Game (the world).
- `src/lib/world.ts` — chunk renderer (thin walls, panels, bright-haze fog).
- `src/lib/controller.ts` — pointer-lock WASD + grid collision (mirrors the
  server's rules).
- `src/lib/gamenet.ts` — the `/ws-game` protocol client.
- `src/lib/voicechat.ts` — proximity voice (LiveKit; volume = f(distance)).
- Server authority lives in the main repo: `src/backrooms/` (worldgen,
  service, net) + `src/routes/backrooms.ts`. Design doc: `../BACKROOMS.md`.
