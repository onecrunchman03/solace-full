# Solace

A self-hosted, Discord-style chat app for a small group of friends, with a game
economy built in.

- **Chat:** channels and sub-channels, communities ("pages") with roles, DMs,
  replies, reactions, attachments, search, mentions, unread badges, presence.
- **Voice and video:** voice rooms, cameras and screen share through a
  self-hosted [LiveKit](https://livekit.io) server.
- **The emoji economy:** a Wheel of Fortune hands out collectible emoji; sell
  them for silver and spend it at the shop, the auction house, direct trades
  and the casino (slots, blackjack, roulette, craps, Texas Hold'em, Liar's
  Dice, chess duels, an emoji derby and a nightly lottery).
- **3D worlds in the browser:** a walkable casino floor, a co-op Backrooms game
  with ten levels and creatures, and an escape room.
- **House characters:** Sterling the shopkeeper, Dr. Ada Voss and the goblin
  lenders, with optional replies from a local AI model (Ollama).
- **Self-hosted communities:** anyone can run a "satellite" on their own PC and
  link it to a hub.
- **Desktop app** (Tauri) and an installable web app.

It was built for about 100–200 people on a single home server.

## Requirements

- **Node.js 24** (uses the built-in `node:sqlite`; no native modules)
- Optional: [LiveKit server](https://github.com/livekit/livekit/releases) for
  voice, [Ollama](https://ollama.com) for the AI characters

## Run it locally

```bash
cp .env.example .env          # set ADMIN_PASSWORD before the first run
npm install
npm run dev                   # API + WebSocket on http://127.0.0.1:8443

cd client
npm install
npm run dev                   # open http://localhost:5173
```

Sign in as `admin` with the password from `.env`. Voice needs
`livekit-server --dev` running too; without it, everything else still works.

Checks: `npm run build && npm run checks` runs every test harness in
`scripts/checks/`.

## Deploy it

`deploy/README.md` walks through a full Ubuntu install: Caddy for HTTPS,
systemd, nightly backups, the firewall and LiveKit. `deploy/HARDENING.md` covers
SSH keys, fail2ban and automatic updates.

Before you open it to the public:

- Fill in the bracketed operator details (name, address, contact, courts) in
  `client/public/legal/`. They're the Terms, Privacy Policy and copyright pages
  your members agree to.
- Replace `solace.zone` with your own domain. It's the default in
  `deploy/Caddyfile`, a few server defaults, and the desktop and satellite apps
  (`desktop/`, `satellite-app/`).

## What isn't included

Some of the original art was bought or downloaded under licences that don't
allow sharing the files, so it isn't in this repo. The code that loads it is.
Missing files show up as gaps, not errors:

- **The player body and its animations** (a commercial hazmat model and Mixamo
  animations). Players in the 3D worlds have no visible body until you add a
  rigged model at the paths the code loads.
- **Most 3D casino furniture** (tables, slot machines, the bar), from two paid
  packs.
- **Parts of the Backrooms:** Level 0's base textures and hum, the Poolrooms
  kit, Pipe Dreams' lamps and pipes, some doors and held items, and the art for
  65 of the 100 relics.
- **The collectible emoji images** (about 1,160 of them). Put your own in
  `emoji/<tier>/` and list them in `assets/emoji-manifest.json`.
- **Jukebox music.** Load your own MP3s with `scripts/ingest-jukebox.mjs`.

The casino felt, the goblin portrait and the talisman are simple placeholders.

Everything else is here: the code, the chat, voice and 2D games, the sound
effects, and over a thousand CC-BY and CC0 models and textures.

## License

The code is released under the **GNU Affero General Public License v3.0**
(`LICENSE`). You can use, change and share it. If you run a modified version
for other people over a network, you must offer them your source code.

Third-party models, textures and sounds keep their own licences. See
`CREDITS.md`.
