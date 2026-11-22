# FEDERATION — self-hosted community pages (DESIGN LOCKED Sep 2026)

Status: **F1–F4 ALL SHIPPED (Sep 2026, migrations 79–82).** Josh answered the
three fork questions on 2026-09-06: the goal is the PRODUCT (friends owning
their own corner of Solace), v1 scope is TEXT + ATTACHMENTS, and hub
authority is FULL STAFF REACH. That locks Architecture A — the rendezvous
relay. Checkpoint tag `pre-federation` (commit 8820e0d) marks the world
before this work. The same day, Josh also locked **moderator scoping**
("admin has full control but moderators only have power in the pages they
are assigned to") — satellite provisioning, delisting and the registry are
ADMIN-only surfaces, consistent with that rule.

## The ask, in Josh's words
Users can download a server client of Solace and host their own page/community
(TeamSpeak-style: people discover communities and join them). solace.zone
stays the **master**: hosts all games and general chat, is the update pusher
and authentication manager, and has **total authority** over the self-hosted
sites.

## The locked decisions
1. **Goal: the product.** Hosting a community is a feature people use; load
   relief is a bonus. (If pure load ever becomes the concern, the answer is
   a second hub-controlled box for media — a weekend, not this project.)
2. **V1 scope: text + attachments.** Channels, messages, and files live on
   the host's box. Voice stays on the hub's LiveKit (hub voice channels keep
   working for everyone). Satellite-local voice is a later opt-in layer
   (Architecture B) for capable hosts.
3. **Authority: full staff reach.** Hub admins/mods hold staff powers inside
   every satellite page — read, delete, ban — enforced by the satellite
   software. Honest caveat, stated in the product: a host owns their disk
   and a modified binary can resist; DELISTING is the enforceable hammer,
   and under the relay it is absolute (the hub IS the wire).

## Architecture A — the rendezvous relay

**The satellite** is a headless build profile of THIS server
(`SATELLITE_MODE`): own SQLite via the same store seam, channels/messages/
attachments logic reused, everything else stripped — no local accounts, no
economy, no games, no Sterling, no voice, no push. A host downloads it, runs
it, registers it against their hub account. Zero network setup: no port
forwarding, no domain, no certs.

**The link**: the satellite dials OUT to `wss://solace.zone/ws-satellite`
with its registration token and holds the connection (auto-reconnect). All
hub↔satellite traffic rides this socket as JSON frames. NB: a new `/ws-*`
surface needs the Caddyfile @backend matcher, the Vite proxy, AND realtime's
upgrade allowlist — THREE places (the escape room's documented lockout).

**THE LOAD-BEARING SHAPE: a remote community is a PAGE.** `pages` gains a
nullable `satelliteId`. The hub keeps the page row, its membership, join
policy, knocks, discovery card, and ALL permission checks — exactly the
hardened Pages machinery of Sep 2026. The satellite stores only that page's
CONTENT: channels, messages, attachments. Client requests for a remote
page's content hit the hub, which forwards over the link and relays the
response; realtime frames from the satellite fan out through the hub's
existing page-scoped delivery (`toPage`/`pageAudience`).

Why this cut is right:
- **Auth and membership never leave the hub.** The satellite never sees a
  password or session token — the hub forwards a verified userId. Staff
  reach is mostly FREE: visibility, membership, deletion authority are hub
  checks that already exist.
- **A hostile satellite is caged.** It can fabricate content only into its
  OWN page, delivered only to that page's audience (the hub scopes every
  frame). It cannot reach other pages, other users, DMs, or the economy.
- **The economy stays whole without the satellite touching it.** Posting
  rides through the hub, so owned-emoji checks (`unownedEmoji`), mentions,
  push, and flood armor all run hub-side even for remote pages. The Wheel
  stays the only faucet by construction.
- **The host owns the disk.** The hub never stores the community's content;
  the satellite's SQLite + uploads dir is theirs (and their backup problem —
  documented for hosts).

**Attachments**: uploaded through the hub's existing two-phase claim (caps +
magic-byte sniffing stay hub-enforced), streamed to the satellite for
storage, served back through the relay with immutable cache headers. Hub
egress per serve is the same as hub-hosting; the DISK moves to the host.

**Update authority**: the handshake carries the satellite's version; the hub
refuses below `MIN_SATELLITE_VERSION`. Distribution starts as git + npm
(the server's own shape); a self-update channel (the desktop shell's
latest.json + minisign pattern) comes later.

**Offline satellite**: the page's card shows "community offline"; content
requests fail soft; membership/knocks/discovery stay live (they're hub-side).

## SECURITY POLICY — how a satellite joins and stays joined (Josh, Sep 2026:
## "a security key must be generated and given to someone")

**Provisioning is invite-shaped and ADMIN-ONLY.** Nobody can stand up a
satellite by asking; an admin mints a **provisioning key** in Admin Panel →
Satellites (the invite-code machinery pattern: unambiguous base32, hashed at
rest, single-use with atomic guarded-UPDATE redemption so two racers never
both win, default 72h TTL, revocable, listed with status, audited on mint
and redeem). The admin hands the key to the host out-of-band. The
registration endpoint is rate-limited per IP like login.

**The key is a DOOR key, not the credential.** During registration the
satellite generates an **Ed25519 keypair on the host's box** and sends only
the public key with the provisioning key; the hub stores the pubkey and
burns the key. The private key never leaves the host, and the hub never
holds a secret that could impersonate a satellite — a hub DB leak leaks
nothing a connect can use (the sessions-table lesson, applied forward).

**Every connect is challenge-response, over TLS, version-gated.** Handshake:
satellite → hello {satelliteId, version}; hub → random nonce; satellite →
signature over (nonce + hub host + timestamp); hub verifies against the
stored pubkey, refuses stale timestamps (no replay), refuses versions below
`MIN_SATELLITE_VERSION`, refuses any status but active. One live link per
satellite: a new connect replaces a dead one (restart recovery), and a
replacement arriving from a DIFFERENT network is a security-console finding
(the login-challenge analog for machines).

**Ownership binds the satellite to a person.** Every satellite has an
`ownerUserId` — a hub account that answers for it. Ban or suspend the owner
and the satellite drops with them. The owner may rotate their satellite's
keypair (fresh one-shot rotation key, old pubkey dies) and retire it; only
admins mint, delist, or force-rotate.

**Revocation is instant and total.** Delist → status revoked → the live link
is dropped mid-frame, reconnects refuse at the handshake, and the satellite's
pages flip to the offline state. Because everything relays through the hub,
there is no residual path.

**The ledger sees everything.** Registrations, connects, disconnects,
handshake failures, IPs, and versions land in a `satellite_events` table
(the login_events shape), surface in Admin Panel → Satellites and the
Security console, and Sterling escalates: a new satellite registered
(staff-alert, always), repeated failed handshakes against a real satellite
id (someone probing with a stolen identity), a connect from a new network.

**What a connected satellite still cannot do** (the caging, restated as
policy): it never sees a password, session token, or user credential —
frames carry hub-verified userIds only; it reaches only its own page's
content and audience; every inbound frame is schema-validated, size-capped,
and rate-limited per satellite; and nothing it sends touches the economy.

## The phases
- **F1 — the link. ✅ SHIPPED Sep 2026 (migration 79).** Satellite registry
  (`satellites` + `satellite_keys` + `satellite_events`), the
  `/ws-satellite` surface with the challenge-response handshake + heartbeat
  (`src/federation/link.ts`, shared constants in `src/federation/
  protocol.ts` so the signed payload can never drift between sides), the
  satellite daemon skeleton (`src/satellite/main.ts`: keygen, register,
  run/reconnect; identity.json holds the private key, mode 0600), Admin
  Panel → Satellites (mint keys with owner/TTL/note + show-once code, the
  registry with live-link dots, the event ledger, the delist kill switch +
  reinstate), Sterling escalations over the `satellite.event` bus event,
  and `scripts/checks/test_federation.mjs` (33 asserts) driving the whole
  lifecycle including every hostile path. Key rotation is deferred to F2
  (re-registration via a fresh key covers the loss case meanwhile — delist
  the old row, mint a new key).
- **F2 — remote content. ✅ SHIPPED Sep 2026 (migration 80).** The cut that
  paid off: a satellite page's CHANNELS are ordinary hub rows (permissions,
  unread, voice, typing, page-scoped broadcast reuse the hardened Pages
  machinery untouched); only MESSAGE BODIES live on the host, via RPC over
  the F1 link. Global ids (`satelliteId × 1e9 + remoteId`), the hub-side
  `remote_messages` INDEX (id/author/at — authority + unread without ever
  holding a body), hub-side validation before every RPC, honest-503
  offline states with `PageDTO.remoteUp` driving the card + composer,
  `POST /api/admin/satellites/:id/page` binding (one per satellite, owner
  manages, #lobby included), and the daemon grown a real content store.
  No realtime bridge was needed at all: every write flows through the hub,
  so the hub broadcasts from its own hand. Deferred to F3 alongside
  attachments: reactions on remote messages, FTS search, key rotation.
- **F3 — attachments + reactions + search + rotation. ✅ SHIPPED Sep 2026
  (migrations 81 + 82, satellite 0.2.0).**
  · **Attachments**: uploads land at the HUB exactly as before (sniffing,
    caps, the two-phase claim — claimed onto the GLOBAL id), then the file
    ships to the host ASYNC in base64 chunks over the link
    (`src/federation/files.ts`; FILE_CHUNK_BYTES under the 512KB
    maxPayload); only a CONFIRMED transfer unlinks the hub copy and stamps
    `attachments.satelliteId` (migration 81), so exactly one side serves
    the truth at every instant. Serving relays chunk-by-chunk (offline =
    clean 503, mid-stream death destroys the socket rather than faking a
    complete image); a transfer the link missed retries on the hourly
    attachment sweep; deletes RPC the host's copy wherever the row says the
    file lives, and the host ALSO runs its own age sweep (disk hygiene —
    the hub's purgedAt row is what stops serving).
  · **Reactions** on remote messages live entirely HUB-side, keyed by
    global id — the economy never rides the link. Migration 82 rebuilt
    message_reactions without its `REFERENCES messages(id)` (a global id
    can never satisfy it; every remote react 500'd), so the old FK cascade
    is now explicit statements in deleteChannel/deletePage — reactions
    clear BEFORE the message/index rows their subqueries need.
  · **Search**: a `messages.search` RPC per linked satellite the caller may
    see, parallel on a 2.5s clock, rows hostile-input-cleaned + re-scoped
    to that page's own channels, hydrated hub-side; offline hosts are
    skipped (best-effort — the card already says offline). The satellite
    store grew its own FTS5 (additive IF-NOT-EXISTS schema + one-time
    rebuild).
  · **Key rotation**: an admin mints a ROTATION key from the satellite's
    row (satellite_keys.rotatesSatelliteId, migration 81); the host's NEW
    box redeems it in the ordinary setup form and keeps the same satellite
    id (page binding survives; a lost disk's history doesn't — that's the
    honest semantics). The redemption replaces the pubkey atomically, drops
    any live old link, and the old identity fails its next handshake.
    Sterling alerts on every rotation like every registration.
  · Old 0.1.0 daemons still link (MIN stays 0.1.0): they answer the F3 ops
    with unknown_op, so files simply stay hub-served and search skips them.
- **F4 — hardening + the host experience. ✅ SHIPPED Sep 2026.**
  · **The index is the authority** (`vetAgainstIndex`): every satellite
    answer is vetted against remote_messages before a client sees it —
    fabricated rows drop; author/channel/created-at are forced from the
    index; deletions can't undelete. The adversarial review that built
    this found a real pre-F4 hole: a lying create envelope could aim the
    broadcast's channelId at ANOTHER page's audience. Closed on history,
    create, edit, delete and search.
  · **Transport guards**: per-IP connect limit (30/10min), a 50-frame
    noise budget cutting flooding links, reply arrays capped at 200.
  · **The community page auto-creates on first connect** (Josh: "i don't
    see it in the solace pages") — `ensureSatellitePage`, host-named,
    OPEN + discoverable, owner as manager, #lobby landing. The key mint
    is the admin's gate; there is no second button to forget.
  · **Identity-gated auto-update**: the daemon signs `updatePayload`
    (10-min TTL) and `GET /api/satellite/update/{latest,pkg}?tok=`
    verifies against the registered pubkey — humans download behind a
    login, machines behind their identity, delisted satellites get
    nothing. The app (0.2.1) checks at boot + 6-hourly and installs via
    tauri-plugin-updater signed with the shell's minisign keypair.
  · **The Settings card**: update check/install, launch-on-startup,
    retention dials, open-data-folder, and an in-page two-step RESET that
    wipes the box back to the setup form without a restart.
  · **THE MALICIOUS SATELLITE harness** (test_federation 109): forged
    envelopes, fabricated rows, oversized bodies/frames, frame floods,
    stale/rotated-away update tokens — every lie proven contained.
  · **HOSTING.md** — the host handbook (setup, backup, what the hub can
    and can't see, delist reality, rotation, reset).
- **F5 — voice + streaming in communities. ✅ SHIPPED Sep 2026 (the easy
  way).** Voice channels in satellite pages ride the HUB's LiveKit — they
  are ordinary hub channel rows, so the existing token gates (page entry,
  locks, allow-lists) already applied and the grant publishes all sources:
  mic, camera, SCREEN SHARE. Harness-proven with the host offline (calls
  never touch the satellite). The satellite-app went TRAY-RESIDENT (0.3.0:
  X hides, community stays up, tray-menu Quit) with its own distinct icon
  (the ring + a small cyan orbiting moon). The ORIGINAL F5 sketch —
  satellite-local LiveKit on the host's bandwidth, hub-issued certs —
  stays unbuilt: at friend-group scale the hub SFU carries every
  community's calls fine, and the seam remains if that ever changes.
- **F6 — host diagnostics + the error-log pipeline. ✅ SHIPPED Sep 2026
  (satellite-app 0.5.0).** The app's Diagnostics tab (CPU machine/app, RAM,
  disk, whole-machine bandwidth, community stats). Errors queue on the
  host's disk (cap 500, restart-safe), the hub's 10-min sweep drains them
  over the link (the hub asks — no new inbound frame), dedupes by
  signature per satellite into `satellite_errors` (migration 83), keeps a
  YEAR, and feeds Josh's loop: export unfixed as TXT → hand to a session →
  mark processed; fixed signatures never re-export unless they RECUR after
  the fix (flagged). Admin-mode ruling: NOT needed — elevation gives no
  performance, only risk.
- **F7 — host-chosen storage + backups, and the review hardening.
  ✅ SHIPPED Sep 2026 (satellite-app 0.6.0, daemon 0.3.0).** The community
  (content.db + files/) moves to any folder/drive from Settings
  (live-then-swap: files bulk-copy while serving, a seconds-long
  `busy_moving` window swaps the db; the IDENTITY stays in %APPDATA% — the
  daemon must always know where to find it). An automatic daily backup to a
  second host-chosen folder: dated `VACUUM INTO` snapshots (last 7), an
  incremental files mirror (never deletes), identity/settings/voice-key
  copies, an hourly due-check off a stamp recovered from the backup itself.
  Shipped WITH the full three-way adversarial review of F1–F6 — 15 findings
  fixed, headlined by: reply-preview REFS vetted against the index (the
  words-in-mouths hole), staff deletion tombstoning the index BEFORE the
  host RPC, ID-FLOOR SEEDING on every welcome (rotation onto a fresh box
  can't collide ids — chosen over a wipe, which would have destroyed the
  documented restore-your-backup flow), the dead-channel broadcast leak,
  the exact-match local-API origin, and the tray-Quit livekit orphan.
  test_federation.mjs → 148.
- **F5b — voice ON the host's box. ✅ SHIPPED Sep 2026 (Josh reversed the
  F5 call; satellite-app 0.4.0).** The app bundles livekit-server.exe and
  the daemon runs it with host-generated keys; the hub keeps minting every
  token (the satellite hands over its LiveKit creds via the `voice.info`
  RPC and never decides who joins); signaling relays at `/satvoice/<id>`
  (raw TCP splice — mixed-content/cert problems solved at the hub); media
  is DTLS-SRTP browser↔host over forwarded UDP 50000-50060 + TCP 7880;
  unreachable ports fall back to the hub SFU automatically. The panel
  grew a GUIDE TAB (port forwarding at the PC's own LAN IP, firewall,
  backups, rotation, troubleshooting), and installers are now
  Authenticode-signed with the shell's CN=Solace cert.

## THE SATELLITE APP — hosting without a terminal (Sep 2026)
Josh: hosts should never need a command line. **Solace Satellite** is a
Windows desktop app (`satellite-app/`, Tauri v2 — the desktop shell's
tooling): install, paste an admin-minted key, name the community, done.
- The daemon gained a **`serve` mode**: the link plus a localhost-only
  control API (`src/satellite/local.ts`, 127.0.0.1:8765) — status, logs,
  and a setup endpoint that registers AND starts the link without a
  restart. Anti-drive-by hardening: hostile Origins refused; POSTs demand
  the `x-sat-local` header a cross-origin web page cannot send (no CORS
  is ever emitted). Data lives in `%APPDATA%\SolaceSatellite`.
- The daemon ships as a **self-contained exe** (Node SEA:
  `scripts/build-satellite-exe.mjs` bundles dist via esbuild and injects
  it into a copy of the build machine's Node 24 with postject) — hosts
  install nothing, and `node:sqlite` is the stable no-flag build.
- The app window is a vanilla-JS control panel (`satellite-app/ui/`):
  setup form → live status (linked dot, message count, uptime, engine
  log), honest offline/delisted states. Closing the window stops the
  community (v1); tray-resident hosting is a later nicety.
- CLI `register`/`run` still work — same engine, power users + harnesses.
- Build/publish loop in `satellite-app/README.md`. Installer unsigned v1.
- **The installer is MEMBER-ONLY** (Josh, Sep 2026): served by
  `GET /api/satellite/app` (session auth, `SATELLITE_APP_PATH` →
  `/opt/solace/satellite-dist/` on the R220, which Caddy does not serve)
  and offered in-app by the "Want to self-host?" band at the foot of the
  Solace Pages picker. Never publish it to the public `/desktop/` dir.
- Deferred niceties (Josh): a **subtly distinct app icon** (same ring-mark
  family as the client shell, visibly the server app), tray-resident
  hosting + autostart, signing, self-update.

## Non-negotiables (unchanged from the option doc)
- The economy never federates. No coins, emoji inventories, games, or
  Sterling on satellites. DMs, auth, push, accounts: hub-only.
- Every relayed frame is validated at the hub against the page's audience —
  a satellite's word is never trusted for WHO may see something.
- Satellite input is hostile input: size-capped, schema-validated, rate
  limited, and never interpolated into hub SQL beyond its own page's rows.
