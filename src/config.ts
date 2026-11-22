import path from "node:path";

/** Read an environment variable, falling back to a default if it's unset or empty. */
function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

const dataDir = path.resolve(env("DATA_DIR", "./data"));

/**
 * All runtime configuration, resolved once at startup. Import `config` anywhere
 * that needs a setting rather than reading `process.env` directly, so there's a
 * single typed source of truth.
 */
export const config = {
  host: env("HOST", "127.0.0.1"),
  port: Number(env("PORT", "8443")),
  dataDir,
  dbPath: path.join(dataDir, "solace.db"),
  adminPassword: env("ADMIN_PASSWORD", "changeme"),
  sessionTtlDays: Number(env("SESSION_TTL_DAYS", "30")),
  // Whether strangers can create their own accounts at all. Handy in development;
  // set to false in production to close registration entirely.
  allowRegistration: env("ALLOW_REGISTRATION", "true") === "true",
  // When registration is allowed, also require a valid admin-minted invite code.
  // Leave false in dev for open sign-up; set true in production (invite-only).
  requireInvite: env("REQUIRE_INVITE", "false") === "true",
  // Emoji catalog seeded into the DB on first boot (drives the wheel/economy).
  emojiManifestPath: path.resolve(env("EMOJI_MANIFEST", "./assets/emoji-manifest.json")),
  // Directory of emoji image files (tier subfolders), served at /emoji/<tier>/<file>.
  emojiDir: path.resolve(env("EMOJI_DIR", "./emoji")),
  // Emoji art that ships IN the repo (the Stone of the Abyss) — the emoji
  // route falls back here when emojiDir lacks a file, so a pull deploys it.
  bundledEmojiDir: path.resolve(env("BUNDLED_EMOJI_DIR", "./assets/emoji")),
  // THE PORTAL's archive bundle (scripts/portal/build-archive.mjs), read at boot.
  portalArchivePath: path.resolve(env("PORTAL_ARCHIVE", "./assets/portal/archive.json")),
  // User uploads (avatars) live under the data dir (gitignored), served at /avatars/<file>.
  uploadsDir: path.join(dataDir, "uploads"),
  // Voice (LiveKit SFU). All three must be set for voice to be enabled; when
  // they're blank the voice UI hides itself and the token route 503s.
  // Dev: run `livekit-server --dev` (url ws://localhost:7880, key "devkey",
  // secret "secret"); prod: the LiveKit service on the R220 (see deploy/).
  livekitUrl: env("LIVEKIT_URL", ""),
  livekitApiKey: env("LIVEKIT_API_KEY", ""),
  livekitApiSecret: env("LIVEKIT_API_SECRET", ""),
  // LiveKit's SERVER API (the ghost voice flips a spectator's right to
  // publish — src/backrooms/ghostvoice.ts). Blank = derived from LIVEKIT_URL:
  // the SFU on this box when that is our Caddy /livekit front.
  livekitApiUrl: env("LIVEKIT_API_URL", ""),
  // Chat-attachment retention (files expire; messages + rows stay). Animated
  // uploads (GIF/APNG/animated-WebP) expire sooner than static images/text.
  attachAnimatedDays: Number(env("ATTACH_ANIMATED_DAYS", "30")),
  attachStaticDays: Number(env("ATTACH_STATIC_DAYS", "90")),
  attachSweepMs: Number(env("ATTACH_SWEEP_MS", String(60 * 60 * 1000))),
  // The Windows satellite-app installer, streamed ONLY to logged-in members
  // at GET /api/satellite/app — deliberately NOT in the public /desktop/ dir
  // (self-hosting is for people who already live here). On the R220 the file
  // lives at /opt/solace/satellite-dist/ (unserved by Caddy); missing = 404.
  satelliteAppPath: path.resolve(env("SATELLITE_APP_PATH", "./satellite-dist/Solace-Satellite-Setup.exe")),
  // The Ubuntu CLI bundle (satellited + livekit-server, tar.gz) and its
  // one-line installer script. The tarball is gated on a VALID provisioning
  // key (checked, never burned — a server has no browser session, and the
  // key already proves an admin invited this host); the script itself is
  // public — it's instructions, useless without a key.
  satelliteLinuxPath: path.resolve(env("SATELLITE_LINUX_PATH", "./satellite-dist/satellite-linux-x64.tar.gz")),
  satelliteInstallScript: path.resolve(env("SATELLITE_INSTALL_SCRIPT", "./deploy/satellite-install.sh")),

  // ---- THE HOUSE'S BRAINS (Oct 2026, src/npc/) ---------------------------
  // Sterling, the goblins and Dr. Voss talk back through a local model
  // (Ollama on a machine you run yourself, never an
  // outside AI company). UNSET = OFF: the three keep their scripted commands
  // and nothing dials anywhere, which is what every harness and a fresh dev
  // box get. Prod sets NPC_BRAIN_URL in its .env.
  npcBrainUrl: env("NPC_BRAIN_URL", ""),
  npcBrainModel: env("NPC_BRAIN_MODEL", "gemma4:12b"),
  // The whole reply (topic check + answer) must land inside this, or the
  // character says a scripted "busy" line instead.
  npcBrainTimeoutMs: Number(env("NPC_BRAIN_TIMEOUT_MS", "9000")),
  // THE BIG ENGINE (optional): Josh's workstation 3090 Ti, a bigger model
  // for conversations. It comes and goes (sleep, reboots, game mode) and
  // everything falls back to the steady endpoint above when it's away.
  npcBrainBigUrl: env("NPC_BRAIN_BIG_URL", ""),
  npcBrainBigModel: env("NPC_BRAIN_BIG_MODEL", "gemma4:26b-a4b-it-qat"),
  npcBrainBigCtx: Number(env("NPC_BRAIN_BIG_CTX", "8192")),
  // THE HOUSE'S AI IS ARCHIVED (Josh, Nov 17 2026: "removed the AIs input and interactions for the goblins, dr voss,
  // and sterling … I only want the 26B model doing the survivor show"). Off: Sterling, Dr. Voss and the goblins are
  // their scripted selves — commands answer, a DM or a mention gets nothing, every line is the hand-written one — and
  // the affinity meter and their memory stop and leave the pages. The engines above still run the Survivorz show.
  // The code is kept whole: NPC_HOUSE_AI=1 brings all of it back (the brain's harnesses set it).
  npcHouseAi: env("NPC_HOUSE_AI", "0") === "1",
} as const;
