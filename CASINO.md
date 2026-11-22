# THE FLOOR — the FPS emoji casino (design doc)

**Status: DESIGN LOCKED 2026-08-06, no code yet.** This is the authoritative
doc for the walkable first-person casino, the way BACKROOMS.md is for the
backrooms. Josh's floor plan is `assets/casino/maps design.png`; the asset
inventory + Blender export pipeline live in `assets/casino/NOTES.md`.

## The one-sentence architecture

A **presence layer over the games that already exist**: you walk a 3D casino
hall as your hazmat avatar, sit at the *real* Gold Table seat 3, and the
existing 2D game UI opens as an overlay while everyone — on the floor or in
the flat hub — sees the same seat occupied. **Zero new game logic, zero new
money paths.** The 2D Emoji Rumble hub remains the default and complete way
to play; the floor is an opt-in body for it.

## Locked decisions

- **Entry**: an "ENTER THE CASINO" band at the BOTTOM of the Emoji Rumble
  main page. The floor itself is hosted like the backrooms view (full
  viewport, pointer lock, own lazy chunk) — never inside the Rumble layout
  chrome. Leaving returns to the Rumble hub.
- **Player model**: the backrooms hazmat body. **Yellow is free for
  everyone**; players who own other suit variations may bring those —
  a READ-ONLY ownership check, the casino never consumes, risks, or even
  locks inventory. Future fun variants (tux hazmat, dealer visor, gold
  lamé…) = **Emporium cosmetics, a new kind** — NOT backrooms gear.
- **2D players are visible on the floor**: anyone seated via the flat UI
  renders as a generic seated hazmat body with their nametag. Never an
  empty chair pretending the table is free.
- **The stage wheel is real 3D** and a death slot hit **ragdolls the victim
  off the stage** (extreme throw — Josh's explicit ask) before the
  Terminated cinematic. Permadeath as floor theatre.
- **Sterling tends the bar** — bespoke low-poly 3D body built from his
  canonical portrait (copper, top hat, cyan goggles, glowing grill, gear
  belly). His existing dialogue pools + synth voice, triggered by
  proximity.
- The floor is **theme-independent** like every casino view (`html.casino`
  rules apply — the hall paints its own scenery).

## The hall (from Josh's plan)

One room, ~52×26 m (26×13 grid cells at the backrooms' 2 m CELL — final
numbers set in C1's layout file). Spawn at the south-centre **Entrance/
Exit**, facing the **Wheel of Fortune stage** dead centre (stairs on the
south face, rope stanchions around it). West wall: **two rows of 5 slot
machines** with a 2 m aisle. East wall, south→north: **Copper, Silver,
Gold, High Roller blackjack tables** (the engine's 4 lobbies, 4 seats
each). NE corner: **Texas Hold'em** (engine tables have **6 seats**, not
the 8 drawn — see Open picks for which of the 3 house tables the physical
table binds to). NW: **Bone Pit table** (6 seats) and the **chessboard
table** (2 seats, bar-pack `SM_Chessboard`). North wall: **the BAR**
(modular 2 m sections from the bar pack, back-bar shelving, bottles,
Sterling behind it) with the **Emoji Racing jumbotron** above and the
**SOUL KIOSK ticket machine** beside it. Carpets, neon CASINO/EXIT/VIP
signs, card/chip/glass dressing throughout.

## Engine reuse (what transfers from the backrooms, whole)

- `controller.ts` movement + collision (walk/run/crouch, 8-way locomotion).
- The avatar system in `world.ts`: skinned hazmat bodies, nametags, the
  hold-B emote wheel (seven dances on a casino floor — content by itself),
  and the boat-derived **sit system** (seats = anchors). Seated bodies use
  **`assets/Models/movement/Sitting Idle.fbx`** (Josh, 2026-08-06) — the
  ANIMATED idle (breathing/shifting), not the boat's single-frame
  `Sitting Pose.fbx`.
- `ragdoll.ts` + `blood.ts`?? — ragdoll YES (the stage death), blood NO
  (no gore in the casino; the ragdoll flies clean).
- `gamenet.ts` frame patterns (pos wire, `em` emotes, interpolation).
- **Proximity voice** (`voicechat.ts`) in its own room — table talk that
  gets louder as you approach is THE atmosphere feature, already built.
- `settings.svelte.ts` pause menu (keybinds, volumes; no gore/forfeit here).
- The SFX bank's unwired spares: chip-push, shuffle, crowd-gasp,
  dice-tumble, rake-sweep — plus a low casino ambience loop.

What is genuinely new: a handcrafted static room (no worldgen, no fog, no
climb rule), the seat↔game binding, in-world overlay panels, Sterling's
body, and the three showpieces.

## The wire (`cf.*` frames, one small service)

`src/casino/floor.ts` — an in-memory roster `{userId, x, y, yaw, anim,
suit, emote}` relayed at the backrooms tick rate to everyone on the floor.
No DB, no persistence, no HP, no inventory: a crash loses nothing but
positions. Enter validates the suit pick server-side (yellow always;
otherwise must own it). Frames: `cf.enter/pos/leave/em`, plus
`cf.spin {userId, slotIndex}` (cosmetic, fires when a floor player spins
at the stage) and `cf.death {userId, seed}` (the stage ragdoll replay,
Derby-style seeded so every witness sees the same flail).

**THE SEAT DOCTRINE — seats have no state of their own.** Who sits where
derives ENTIRELY from the game engines' existing public broadcasts
(`bj.state`, `holdem.state`, `pit.state`, `chess.state`): the floor client
maps `table Gold seat 2 = userId X` onto the chair anchor and poses a body
there — its own player's body if X is on the floor, a generic ghost if X
is playing from the flat UI. Sitting down = the existing sit/join route;
standing up = the existing leave route (unplayed bets refund, live hands
stand and settle — the money rules don't know a body walked away). The
floor can therefore never disagree with the engines about occupancy, and
hole cards / dice cups keep riding their recipient-scoped wires untouched.
Bar stools and lounge chairs are the one exception: pure-cosmetic
first-come seats claimed over the pos wire, like the boat benches.

## Station interactions (all open EXISTING UIs as in-world overlays)

- **Blackjack / Hold'em / Bone Pit / Chess**: E on a chair → sit route →
  the existing game view docks as an overlay panel; body sits in 3D.
- **Slots**: E at a cabinet → the pull costs/pays through the existing
  route; the CABINET animates the returned 3 symbol ids on its reel faces
  (showpiece); the full 2D Slots view is not opened.
- **The Wheel**: E at the stage → your spins/timer via the existing wheel
  routes; the STAGE WHEEL spins to the returned `slotIndex` for the whole
  floor (`cf.spin`); reveal modal only for the spinner. Death → `cf.death`
  ragdoll off the stage, then the standard Terminated flow.
- **Ticket machine**: E → Derby bet panel (existing routes); the
  **jumbotron** replays every race from the broadcast seed onto a canvas
  texture — the bar crowd watches the same race. Lottery tickets: see
  Open picks.
- **Sterling / the bar**: walk up → he greets (proximity-triggered line
  pools + `sterlingMurmur`); E → the Shop/Trader view docks. **Bar stools
  and lounge chairs: press E on the chair to sit** (cosmetic first-come
  seats over the pos wire), body plays the Sitting Idle animation, any
  movement key stands up. A drink-in-hand prop is C4 garnish.

## The showpieces (3D where information is already public)

1. **Stage wheel**: pack's `Fortune_Roulette` with its separate spinnable
   disc mesh, face retextured to OUR 32-slot layout (same art as the 2D
   `wheel-disc.svg` — the 3-sync-points rule grows a 4th surface; note it
   in CLAUDE.md when it ships). Lands on the true `slotIndex`.
2. **Jumbotron**: `TV_Score` mesh, screen = canvas texture running the
   seeded Derby replay + odds board between races.
3. **Slot cabinets**: `Casino_Machine` + separate `Lever`/buttons animate
   the real pull; reel faces show the returned symbols.

## Assets & pipeline

Sources in `assets/casino/` (see NOTES.md): the PSX props pack (120
meshes, 10.6k tris total, cm units ×0.01), the bar pack (.blend → GLB via
headless Blender at `D:\blender\blender.exe`, meter units), the SOUL KIOSK
GLB, Josh's floor plan. Build step: `scripts/export-casino.mjs` batch-runs
Blender + FBX conversion + the shrink pass (atlases → WebP) into
`client/public/assets/casino/`. Texture patches: European single-zero
roulette felt, H17/no-insurance blackjack felt, RACE TICKETS kiosk band,
our 32-slot wheel face, slot reel symbols. Procedural builds: the stage,
ceiling, velvet curtain backdrop, Sterling. Whole-floor triangle budget is
trivial (<100k with all duplicates — the backrooms renders far more).

## Phases (each independently shippable)

- **C1 — The room. ✅ SHIPPED 2026-08-06.** Hall geometry from the plan,
  collision, painted PSX lighting, asset pipeline, walk it solo. Entry band
  in Rumble. Implementation notes:
  - `client/src/casino/{layout.ts,world.ts,CasinoGame.svelte}` — the layout
    is pure DATA (cells of 2m); `CasinoWorld` implements the controller's
    new structural `ControllerWorld` interface (controller.ts widened —
    type-only, no chunk coupling). The stage is floor-steps 2 with a
    1-step stair strip: the backrooms climb rule makes the stairs the only
    way up, unmodified.
  - Pipeline: `scripts/export-casino.mjs` (+ `casino_blender.py`) — Blender
    headless converts both packs; props.glb ships IMAGE-FREE and the two
    atlases ship once as WebP (materials matched by name at runtime).
    Manifests with measured dims land in `assets/casino/manifests/`.
    Total shipped assets: 3.1MB. `scripts/glbview.html` is the GLB bench.
  - Traps hit (don't re-hit): GLTFLoader splits multi-material meshes into
    "<name>_1/_2" children under a named group — index by parent name too;
    the pack's "Fortune Roulette" contains its disc ALREADY ASSEMBLED
    (child mesh "Roulette" — rotate that child for C4's spin), face along
    ±x, yaw 90 shows the prize face; sign panels are thin-x (yaw 0 = faces
    ±x); cloned textures taken before loadAsync resolve stay empty forever;
    big colliders need extent-aware propsNear (the 20m bar).
  - Dev hook: `window.__cas = { player, world }` while mounted.
- **C2 — Presence. ✅ SHIPPED IN FULL** (core 2026-08-06; C2b — emote
  wheel + proximity voice — 2026-08-07). C2b notes: hold-B radial wheel
  (virtual cursor off mouse deltas, release selects), dances play on a
  full-headed stand-in with the backrooms third-person orbit cam, run to
  completion, standing only. Proximity voice reuses the WHOLE backrooms
  spatial graph — `joinProximityVoice` took a pluggable grant fetcher; the
  casino's is `POST /api/casino/voice-token` (403 unless ON the floor via
  the roster — checked BEFORE the LiveKit-config 503 so the gate is
  testable without creds), room `casino_floor`, walls=0 openness=1
  (big-room reverb). N toggles the mic; verified live against the dev
  LiveKit (room joined end-to-end). Original implementation notes:
  - `src/casino/floor.ts` — /ws-casino (the third socket; realtime.ts's
    upgrade guard allowlists it, and BOTH the Vite proxy and the deploy
    Caddyfile route it). Stateless roster, full-room fan-out (no proximity
    scoping — being seen is the point of a casino). Suit rule enforced
    server-side via `brLockerItems` (read-only). Seats are first-come ids
    validated for range/uniqueness only; ANY move frame stands you up
    (server-enforced, one rule). One body per person — a second socket
    replaces the first. Harness:
    `node scripts/checks/test_casino_floor.mjs` (23).
  - Client: `casino/net.ts` + peers as full backrooms avatars
    (`makeAvatar`/`tickAvatar` — casino imports world.ts; the chunk is
    shared with the backrooms). Seated bodies play the ANIMATED
    `sitting-idle` clip — new `sitidle` MOVE state + `PeerAvatar.seated`
    + the file in the `ANIM` loader list (forgetting the last one is the
    trap: everything typechecks and the body silently falls back to the
    static pose). Seat anchors live in layout.ts `SEATS` (id = index,
    APPEND ONLY). E to sit, movement key stands; seated eye =
    seat.h + 0.58; position wire goes silent while seated.
- **C3 — Play. CORE SHIPPED 2026-08-08**: station interactions + docked game
  overlays — you can PLAY every wired game from inside the hall. `STATIONS`
  in layout.ts (pure data, harness-pinned to their furniture) map zones to
  the SAME prop-less Svelte views the 2D hub lazy-loads (`GAME_VIEWS` in
  CasinoGame — dynamic imports only, per the chunk doctrine): wheel (the
  stage) · blackjack (per felt) · roulette · hold'em · bone pit · chess ·
  slots (the aisle) · the SOUL KIOSK (two-tab overlay: derby/lottery, the
  resolved pick). E sits AND opens where a stool is at a station; standing
  play works at the rails. The overlay is a right-docked panel; opening
  releases pointer lock so keys belong to the game, ESC/✕ relocks and walks
  away; `{#key}` forces destroy/mount per game so onDestroy leave semantics
  hold (blackjack seats vacate, money-safe). Verified live end-to-end: a
  REAL spin from the stage overlay paid a common (fruitybanana) while the
  3D stage wheel mirrored the spin behind the panel — the C4 loop closed.
  **C3 COMPLETE (later 2026-08-08): ghost bodies + the wallet chip.**
  `casino/ghosts.ts` is the seat doctrine made code — a PURE derivation over
  the app-level game stores (which chat.svelte.ts already keeps current from
  the public broadcasts) returning the bodies the hall should show; the game
  screen reconciles avatars against it at ~1Hz and seeds every store once on
  entry. Blackjack engine seats 0-2 sit the felt's three stools (engine
  lobby → floor row: Copper south → High Roller north), seat 3 stands at the
  north shoulder; a live chess duel takes the two chairs; hold'em (Copper,
  the bound table) and Bone Pit players ring their tables standing; roulette
  bettors line the west rail during betting/spinning. Anyone with a REAL
  floor body is excluded — physical presence wins, one body per person.
  Ghosts are generic yellow seated/standing hazmat bodies with nametags
  (the locked design). The wallet chip (top-right, app-level `wallet`
  store) rounds out the HUD. Verified live: a throwaway account joined
  Copper via the API and its ghost appeared seated at the stool, named.
- **The living hall (2026-08-08, same day):** the **jumbotron is LIVE** —
  `buildJumboTex` in world.ts repaints ~1Hz off the app-level derby store:
  marquee when idle, the next-race field (runner emoji + form stars +
  per-runner pools + a bets-close countdown) while betting runs, a chase
  banner while the race is unrevealed, the podium + recent winners after.
  **Hold'em got its six chairs** (resolved pick #4 honoured at last) —
  ring math shared verbatim between layout placements, SEATS 30-35 and the
  ghost derivation, so a 2D player's ghost lands exactly on a chair; floor
  players can sit them too. **Sterling murmurs at the bar**: stand at his
  stretch of the counter and the brass-blip voice (sterling-voice.ts via
  shop-audio's `sterlingMurmur`) delivers a bar line, grill flickering for
  exactly the phrase length, 26-48s cooldown. Sweep fix: the wheel
  station's zone reached the bar stools ("sit & play the Wheel of Fortune"
  while ordering a drink) — r 3.4 → 2.6.
- **Review-sweep round 2 (2026-08-08 evening):** the slot banks are now
  **BACK-TO-BACK** (centres one measured cabinet-depth apart, backs
  kissing) — the face-each-other layout made a lovely aisle of lit glass
  and a nine-cabinet wall of RAW CREAM BACKS toward the main floor; now
  the west row faces the wall aisle, the east row faces the hall, and no
  back faces a player anywhere. Slots stations flank both playable sides
  (4 zones). Also: the reel backing widened to 0.86 (parallax exposed the
  painted band's edges at walking angles), and the jumbotron steps up to
  8Hz repaint during a live race so the chase strip actually runs. A loose
  "Casino Roulette" disc tried in the roulette bowl was REVERTED — the
  table mesh ships its bowl dressed, and the extra disc rendered as a
  duplicate wheel lying on the carpet (if the bowl ever spins, re-pivot
  the table's OWN geometry, the pivotWheelDisc way).
- **IN-WORLD PLAY (Josh, 2026-08-08: "i dont want overlays i want to do it
  the casino").** The Wheel and Slots now play ENTIRELY in-world — no panel:
  E on the stage calls the canonical `doSpin` (death/Terminated/achievements
  flow untouched — Terminated mounts in CasinoGame off the wheel store), the
  STAGE wheel turns via the server mirror, and a small toast at the wheel's
  REST is the whole reveal. E at any cabinet pulls ITS lever: `pullSlots`
  debits, `hall.pullReels` lands that cabinet's own three reels on the
  server's payline ids (cell k visible at offset (13−k)/14 — flipY), then
  the payout toast + wallet chip settle at the landing (verified live:
  BAR 👑 👑 → "+15 — TWO CROWNS", wallet exact). Slots STATIONS are gone —
  the cabinet is the interaction; the wheel station stays as the zone but
  spins in place. HUD: wallet chip now carries the spin count. **The
  multi-decision games (blackjack/hold'em/roulette/chess/pit/kiosk) keep
  the docked panel FOR NOW** — they need real input surfaces, and their
  in-world treatment (3D chips on felt vs table-locked camera + bottom
  action bar) is an open design fork awaiting Josh's pick.
- **OPTION 1 SHIPPED (Josh's pick, same day): the TABLE SHOT.** While a
  station's dock is open the camera glides to a per-station framing
  (`Station.cam`/`look` in layout.ts, every one tuned against in-hall
  screenshots) and the PHYSICAL table fills the view — roulette's felt and
  bowl above its betting board, the chess set above the duel lobby, the
  hold'em octagon above its lobby cards, each blackjack felt between its
  placards. The side panel became a BOTTOM DOCK (centred, min(46vh, 470px),
  rounded top, the room always visible above; full-width taller sheet under
  900px). Key detail: the viewmodel anchors to the PLAYER's eye (`eyeTmp`),
  never the camera — with the shot live your own body stays seated at the
  felt IN FRAME instead of teleporting to the lens.
- **Meticulous audit (same session):** all 10 station prompts/panels
  verified end-to-end in-app; TEN key-driven collision walk-probes measured
  against predicted stop positions (collider edge + 0.22 player radius) —
  all EXACT to the millimetre once a first-run relock transient was
  retested; the "hold'em chair" probe's 0.23 delta was a wrong prediction
  (no chair at 270° — the body stopped at the TABLE edge precisely).
- **JOSH'S BIG PUNCH LIST (2026-08-08 late).** All shipped, all verified
  in-app: **slots are ONE canvas screen** per cabinet (bezel + windows +
  symbols are pixels on a single opaque plane — nothing pops, nothing shows
  behind, and rest positions are integers so the result can never land
  "blank"; the old texture-offset planes are gone). **Blackjack rebuilt**:
  BJ_ROWS 2.0 cells apart, scale 1.2, SIX stools arcing each player rail
  (`bjStool` is ONE geometry shared by placements, SEATS 18-29+36-47, and
  ghosts; the engine's SEATS_PER_LOBBY went 4→6), collider is a 4-box
  staircase following the arc, yaw measured BOTH ways (270 showed the arc's
  black back — 90 is the playable face). **Roulette moved** west of the
  stage, everything followed (station/cam/placard/pendant/spot/ghost rail).
  **The kiosk is racer bets only** (KioskBet.svelte — chips, six runners
  with form stars, tear-up; no Derby page). **The jumbotron plays the LIVE
  race** (six seeded lanes, placings-ordered finish, 12Hz) flanked by two
  new screens: BIG WINNERS left (`bigwins.svelte.ts` collects from public
  game states, entries fall out after 90s) and THE WHEEL LIVE right
  (wheel.feed). **The wheel package**: result sfx at the rest, a STANDING
  RESULT SCREEN on the stage showing the actual won emoji (wheel.spin bus
  now carries presentational outcome; floor relays it with the spinner's
  name), the face got the 2D disc's bulbs/gradients/rosette, and a
  LEGENDARY fires the party — Josh's track (115bpm measured), six strobing
  colour lights on the beat, ~700 confetti flakes off the ceiling; feed
  legendaries from the 2D side party the room too. **Admin → "Rig next
  spin → ⭐ legendary"** (guaranteed — rigged spins skip the 50% roll) so
  the moment is testable. **Chromeless bottom strip** replaced the dock
  panel everywhere (Josh: no window look); the wheel needs you RIGHT IN
  FRONT of it on the platform, and all station radii are arm's reach.
  **Pendants unified**: ONE PENDANTS list drives prop + rose + light (two
  used to hang dark; the entrance pool had no fitting) — a lamp over every
  table and walk, all lit.
- **C4 — The showpieces. ✅ SHIPPED IN FULL 2026-08-08.** Done: the **stage
  wheel** (it mirrors a REAL spin — new `wheel.spin` bus event → the floor
  service forwards it only for people actually standing in the room, and the
  disc rests on the rolled slot; `spin.ts` owns the curve AND the clack
  schedule derived from it, per the sound doctrine, and the harness diffs its
  painted face against `src/wheel.ts`), the **death throw** (a death slot
  ragdolls you off the stage before the Terminated cinematic — `deaths.ts`
  over the backrooms' verlet sim, `THROW_POWER` measured in-hall, not
  picked), **Sterling** behind the bar, the **jumbotron**, the lit back-bar,
  ceiling roses + chandelier, and the slot banks' self-illumination.
  The 2026-08-08 finish added the last two: **live reels** (the cabinet's
  painted band is atlas art, so each machine carries a dark-bezel window of
  three overlay planes sharing one canvas symbol strip — a reel is offset.y
  on a texture clone; overlay geometry TUNED against head-on in-hall
  screenshots, the manifest profile being rotated FBX soup) with **attract
  mode** — every 7–14s one cabinet runs its reels with ease-out staggered
  stops on whole-symbol boundaries, reelspin/reelstop audio distance-faded
  from the listener the hall's tick now carries — and the **sound pass**:
  wheel clacks off the spin curve (earlier), the death sequence (the throw
  now WAITS for the stage wheel to visibly land — the sound-sync doctrine's
  visual twin — then wheel-reaper + the throw), and ragdoll floor/wall slams
  as distance-faded hard footfalls, the backrooms' own thud trick. (Ambience
  LOOPS stay cut, per the Phase 33 decision.)
- **FULL FPS LOCOMOTION (Josh, 2026-08-07): the floor is the backrooms body,
  minus the water.** Jump (same key, same 4.6 m/s takeoff, same rule that
  leaving the ground freezes the height reference so an arc across a ledge
  keeps its air), walking off the stage edge is a FALL not a snap, the climb
  rule's airborne mantle, and the **first-person body** — the backrooms
  viewmodel whole, so looking down shows your own suit. Two deliberate
  differences from the backrooms: **no stamina bill on a jump** (that exists
  there because something is chasing you, and nothing here is), and **no
  swimming** (there is no water). Peers see it: pose gained a third value,
  `2 = airborne`, which drives the peer body's jump clip exactly as crouch
  drives its crouch clip — the arc itself stays local, as in the backrooms.
- **The chess table's set** (Josh's model, 2026-08-07): a real board with
  real men in the opening position, replacing the bar pack's 1m slab with
  6cm blocks. `scripts/convert-chess.mjs` takes it 4.77MB → 544KB (colour
  maps only at 256², geometry deduplicated by content hash — 35 meshes were
  only 15 distinct shapes — TANGENT dropped, uint16 indices). Per-piece nodes
  survive the dedupe, so a later phase could animate a real game onto it.
- **THE EAST WING (Josh's map expansion.png, 2026-08-08).** The hall grew
  W 26→38 (`WING_X = 26` marks where the original room ended — no wall,
  the floor just continues; `HALL_W` in src/casino/floor.ts must match).
  The four blackjack felts moved out of their cramped rows into the wing's
  corners per Josh's sketch — Copper SW (arc north), Silver SE-corner
  diagonal, Gold flat on the east wall, High Roller NE-corner diagonal —
  each ≥4 cells from its neighbours, six stools apiece. `bjStool` +
  `bjColliders` are now rotation-generalized (arc vector in, stool ring +
  a 5-square collider chain along the table's long axis out), so diagonal
  tables collide as honestly as square ones. **Hold'em is Josh's own
  poker_table.glb** dead-centre of the wing as a **7-seater** (engine
  SEATS 6→7; seat id 48 appended — SEATS ids are append-only wire data;
  Holdem.svelte's lobby label now derives /N from the DTO). The model was
  authored lying on its side — `scripts/convert-poker.mjs` lays it flat
  with a root quaternion and strips it 3MB → 867KB (512² basecolor only,
  uint16 indices); measured footprint 2.93×1.48m. Kiosk moved to the wing's
  north wall; placards/pendants/spots/stations/ghost-rails all followed.
- **TOP-DOWN TABLE SHOTS (Josh, 2026-08-08: "I want a top view of the
  table to play the game").** Every table station's cam now hangs straight
  over the felt looking down — and at **3.0m, BELOW the pendant lamps**,
  which hang from 3.25m: the first cut at 4.4m photographed the inside of
  a lampshade. Verified in-app for hold'em and blackjack (felt fills the
  frame above the bottom dock, all markings readable).
- **Footstep cadence** (Josh: "too jumbled up and quick"): stride length
  0.74/0.92 → **1.35 walk / 1.7 run** (cells between footfalls), self and
  peers alike.
- **THE 2D WINDOWS ARE DEAD — IN-WORLD PLAY (Josh, third telling, Aug 2026:
  "i do not want a pop window when playing games, i want a top view of the
  table to play the game").** The station dock no longer mounts the hub's 2D
  components. Three new pieces: **(a) `felts.ts`** — live game state painted
  ON the physical tables via canvas planes floating just over each felt
  (blackjack ×4, hold'em, the pit; roulette gets only a status HUD over its
  wheel end since the model prints its own board). World-oriented square
  canvases (top = north, same as the top-down camera) with seat/dealer spots
  computed from the SAME bjStool/holdemSeat geometry the physical furniture
  uses — a painted hand sits by its own stool, and text is never sideways.
  Secrets never land on a felt: hole cards and dice cups appear only in
  their owner's strip. **(b) `strips/`** — chromeless one-row ACTION STRIPS
  (BlackjackStrip/HoldemStrip/RouletteStrip/PitStrip/ChessStrip + the
  existing KioskBet): bet inputs, HIT/STAND/DOUBLE/SPLIT, fold/call/raise
  with presets, bid steppers + LIAR, silver challenges. Each blackjack strip
  binds to ITS physical table's engine lobby (`Station.lobby` — walking to
  the Gold felt plays the Gold table). **(c) `chessboard.ts`** — the real
  chess set PLAYS the duel: 32 piece meshes indexed by name, moved to match
  the live FEN (captures leave, promotions clone a queen), square grid
  derived at runtime from where the kings stand (immune to takeProp
  recentring), click-to-move by raycasting a pick plane, legal-target dots.
  **Heights are measured, not assumed:** the bj felt top is 1.16m × BJ_SCALE
  = 1.392 and poker7 bakes 0.93 × 1.1 = 1.023 — the first overlay cut used
  eyeballed heights and every plane vanished inside its table.
- **The felt-facing saga, settled by instrument:** the blackjack model's arc
  azimuth is **270 − yawDeg** (same wheel as the slot cabinets), proven by a
  top-down shot of the INSURANCE arc — two prior guesses (the original 90,
  then +180) each left every felt showing the stools its black back.
- **Roulette's top-down camera sits NORTH of the table** (screen-up =
  south): the model's printed board is authored for that side — the first
  framing rendered all 36 numbers upside-down.
- **Slot screens live IN the cabinet now**: the face quad profiles at local
  x −0.1535 (gltf-transform over props.glb + takeProp recentring math), and
  the canvas plane sits 3cm proud of it — the old plane floated 30cm out
  over the button deck, Josh's "popped out screen". Canvas symbols draw with
  an explicit emoji font stack (`"Segoe UI Emoji", …`) — generic `serif`
  came up blank in the desktop shell's WebView2 ("cherries missing").
- **E at the entrance doors leaves the casino** (hint + exit; the pause
  menu remains the other way out). **Floor placards are gone** — the only
  game signs left are four wall plaques behind the blackjack tables
  (`WALL_SIGNS` in layout.ts, framed panels on the wall planes).
- **ROUND 6 (Josh's quality punch list, Aug 2026).** The wing condensed
  AGAIN (W 34→31 — the band between the old hall's furniture and the wing
  sat empty and dark; three seam pendants light the walk now, and the old
  CARD-PIT RUG — a green 3.4×14.4m slab that had outlived its tables through
  two layouts — was finally swept). **Look-at gating**: E only acts on what
  you're facing (`facing()` in CasinoGame + `Station.aim`, because the
  stand-here zones are offset from the furniture; the wheel wants a tight
  0.72 cone — Josh: "you have to be looking directly at the wheel").
  **The headless body is fixed**: while a table shot is open the first-person
  viewmodel (no head by design) hides and a full-headed peer-style stand-in
  sits/stands in your place. Seated bodies ride 7cm higher (they clipped the
  stool cushions). **Slot screens raised** clear of the button-deck slope
  (the old height clipped their bottom edge) and the symbols are now
  **VECTOR-DRAWN** — canvas colour emoji render blank in the desktop shell's
  WebView2, font stack or not; shapes render everywhere. **The wheel pins
  the actual award** onto the wedge it rests on (`Hall.pinAwarded`, the 2D
  disc's rule) and the stage wash dimmed 40→22 so the wedge art reads.
  **Roulette got the full treatment**: horizontal table shot, OUR single-zero
  board canvas blanketing the pack's inaccurate 00 print with everyone's
  chips ON the tiles, and a procedural EU wheel disc + ball in the bowl that
  spin on the server's broadcast and land on the winning pocket as the
  reveal timer runs out (`Hall.spinRoulette`). **Chess** frames the board a
  metre up, both clocks float on the LEFT of the screen, and challenges
  stake SILVER or an EMOJI from a real inventory picker (accepting an
  emoji-stake challenge opens the same picker). **The kiosk stands against
  the north wall beside the bar.** **The floor caps at 32 bodies**
  (`MAX_FLOOR` in src/casino/floor.ts, `floor_full` denial; a same-user
  retab never counts twice). Strip UI: the bottom band is a short soft fade
  now, not a dark slab. Collision re-audit: 7 walk-probes, every stop within
  2cm of a real furniture edge, the seam walk unobstructed.
- **ROUND 7 (the scrutiny pass — Josh: "seriously validate the games UI").**
  The roulette board was PHYSICALLY LONGER THAN THE TABLE (4.6m plane, 3.9m
  table — a metres-vs-cells slip; it hung over carpet at both ends and read
  as "a pasted 2D screenshot"). It now fits INSIDE the betting cloth
  (2.42×1.4m, flush at 0.722m), and status/history moved to the strip as
  pocket/history pills. **Seat exits**: a movement key while a game view is
  open CLOSES the view and stands you up (the chess chair used to trap you —
  E sat you AND opened the duel, then the view swallowed WASD; typing in a
  bet field is exempt via the INPUT-target guard). **Two real-fix bugs from
  the two-player session**: the spectate camera was eating a giant grey slab
  — the first-person rig's neck-plug sphere on exploded bones, because the
  emote block's per-frame `visible = !emoting` write was CLOBBERING the
  station-mode hide (now `!emoting && !station`); and the five wing-table
  pendants moved up to 3.95m hang (the 3.25m shade sat exactly at the 3.0m
  table-camera height — the lampshade-in-the-lens bug's second coming).
  Name-tag sprites hide during table shots (the felt names everyone).
  **Live two-player validation** (second browser context, real account):
  peers see each other's bodies + name tags at the tables, a stool claimed
  by one player is refused to the other, and a spectator watching the Gold
  felt sees the other player's live hand — cards, chips, gold acting ring —
  while they play from their own screen. Full interaction sweep on every
  strip: blackjack sit/bet/act/settle/leave (wallet exact), chess challenge
  post + cancel (escrow round-trips), pit open/leave (stake refunds), holdem
  sit/stand (buy-in refunds), kiosk, roulette bet→chip-on-tile→spin.
  **Admin account recovery grew a RECOVERY-SECRET RESET**
  (`POST /api/admin/users/:id/secret` — secret-screened, non-admin targets
  only, audited, `secret_changed` on the target's sign-in ledger; UI beside
  Unlock login / Reset password in Admin Panel → Moderation). Verified live:
  weak 400 · good 200 · admin target 403.
- **ROUND 8 (Aug 2026 — the blackjack rebuild + two engine-level bugs).**
  **THE WHEEL'S LANDING WAS BROKEN** (Josh: "what it lands on versus what it
  gives you"): `spinSweep` returned a FIXED sweep from rest-at-zero, so
  sweeps ACCUMULATED — only a session's first spin landed on its prize and
  every later one drifted by the sum of the earlier slot indices. Replaced
  by `sweepFrom(currentRotation, slot)`, an ABSOLUTE landing (≥5 turns from
  wherever the disc rests, ending congruent to the wedge); the harness now
  walks eight consecutive spins and asserts each rests its own wedge under
  the pointer. **Blackjack is horizontal** — the station camera offsets
  toward the stool arc, so screen-up is the DEALER side on all four tables,
  and the felt canvas rotates with its table (`rot = atan2(arc)`) so text
  reads upright everywhere. The canvas is now SIZED TO THE FELT (3.15×1.42m
  on a 1.54×3.37m table; the old 2.2×2.2m square painted its outer seat
  boxes onto the carpet). **The stools sit along a real PLAYER RAIL**
  (`bjStoolLong`/`bjStoolArc`): six seats spread across the table's length,
  each just beyond the front edge — a circle marooned the middle seats 1.3m
  out, an ellipse pushed the ends 0.6m past the table. The painted betting
  spots follow the same rail, matched to the felt's own printed arc.
  **THE SEAT GLITCH** (Josh: "it doesn't show you seated"): the engine picks
  your game seat on join and it rarely matched whichever stool you'd walked
  up to — body and cards a seat apart. The engine is authoritative, so the
  body now follows it: the reconcile beat claims the stool for your game
  seat whenever you aren't on it. Getting up from a stool LEAVES the table
  (blackjack only — its rules make leaving money-safe; hold'em/pit/chess
  keep explicit buttons since those leaves forfeit). Collider fix found
  along the way: the felt's "nose" box reached 0.60 cells on a felt whose
  measured half-extent is 0.384 — 43cm of invisible wall in the middle of
  the player rail, now sized to the rail. **The ticket kiosk works again**
  (the chromeless-panel rework left it `pointer-events: none`) and shows the
  REAL 2D racers: Derby's `racerArt` snippet became
  `components/RacerArt.svelte`, shared by the 2D game and the floor's kiosk.
  Slot screens re-aligned to the cabinet's painted band; seated bodies
  raised again.
- **ROUND 9 (Aug 2026 — the slot screen sits ON the cabinet, and the arm
  pulls).** Josh, with a close-up: "its at a different tilt that the models
  screen… make sure the default model's slot screen is not seen and only the
  screen you put over it shows." **The machine's screen is the CRYSTAL — a
  raked pane of glass — and every earlier cut of this overlay stood an upright
  plane somewhere behind it.** Profiling props.glb (local units, after
  takeProp's bottom-centre recentring) found three surfaces stacked in that
  window, not one: the Casino Machine node's own painted band at a **6.14°**
  rake (y 1.179..1.789, x −0.220..−0.154), and in front of it a child node
  **"Crystal"** whose big BLEND face — the glass you actually look at — leans
  back **5.16°**, normal (−0.996, 0.090, 0), centred (−0.271, 1.464, −0.061),
  spanning y 1.143..1.785 and z −0.633..0.512. The old panel was both mistilted
  AND sunk **7cm** behind the glass, which is the wedge in the photo with the
  model's screen still in front of it. The overlay now lies **5mm proud of the
  glass at the glass's own rake**, over-covering it in both axes (1.175 × 0.652
  against 1.145 × 0.6446), so the glass and the painted band behind it are both
  gone. `m.rotation.set(-REEL_TILT, -π/2, 0, "YXZ")` — **the Euler ORDER
  matters**, since the default XYZ tilts about the parent's x and skews the
  panel off the face. Canvas re-cut to the surface's aspect (384×213, square
  112px windows so symbols stay round), the spare height above the reels now
  the cabinet's own gold "SLOTS OF CHANCE" marquee.
  **THE LEVER PULLS** (Josh: "are you able to make the slot handle pull down").
  The pack ships it as a real mesh: a post at x −0.087, z 0.614 rising from y
  1.173, angling forward to the ball at (−0.29, 1.74). It gets a pivot group at
  the post's base (`Object3D.attach`, so no offset maths against the
  recentring) and swings about local **z** — positive takes the top forward and
  down, i.e. the pull. 0.17s yank → 0.09s bottomed out → 0.38s sprung return
  with a decaying overshoot. `hall.pullLever(i)` fires on the KEYPRESS, not on
  the result, so the arm comes down and the reels answer it; **peers' pulls
  swing their machine too** (a bank someone is playing should look played).
  **Bug found while wiring it: every cabinet was drawing its lever and buttons
  TWICE.** The pack nests Button 1/2, Crystal and Lever under the Casino
  Machine node, and `indexGlb` files a mesh by its parent's name as well as its
  own — so takeProp deep-clones the cabinet (children included) *and* clones
  each child again, exactly coincident. buildReels drops the extras before
  anything gets a pivot; half a lever would otherwise have stayed put.
  **THE WIN SHOW** (Josh: "some reward sounds… like the 2d version, and some
  lighting or visual effect for the level of rewards earned"). The sounds are
  the 2D machine's OWN — `lib/slots-audio`'s `winJingle(payout)` /
  `coinCascade` / `loseThud`, so the floor pays out in the voice the Slots view
  already speaks rather than a second sound language. Those three grew an
  optional `gain` (default 1) so a win at the far end of the bank can be heard
  faded. The visual is four rungs, legible from across the floor without
  reading the number: **small** flashes the payline and takes over the marquee
  ("WIN 4") · **good** adds a pooled light on the cabinet · **big** adds a pour
  of coins out of the tray onto the carpet (a `THREE.Points` cloud with gravity
  and one lazy bounce) · **jackpot** widens the pool onto its neighbours and
  hops the light gold↔white. Sizes stay LOCAL on purpose — the hall reads as
  islands of lit felt, so a win lights its own machine, not the room. *A first
  cut threw the coins straight up and they hung in front of the reels, hiding
  the very symbols that won; they go out and down now.*
  **A peer's win celebrates too, tiered from the payline alone.** The floor
  wire carries symbols and never money (routes/slots.ts' standing rule), so
  `peerWinTier` reads the machine's SYMBOL ladder — a triple is a big win, a
  triple of crowns is the top of the machine — which stays true however the
  payouts are retuned, and needs no second copy of the paytable on the client.
  Their label is unnumbered ("WINNER"); only your own pull, whose value the
  HTTP response told you, shows the figure.
  **A TRIPLE CROWN TAKES THE ROOM** (Josh): the jackpot tier also fires
  `legendaryParty()` — the same hall-wide strobes, confetti pour and party
  track the Wheel throws for a legendary. It's fired from inside `slotWin`, so
  a peer's jackpot parties for everyone from the one code path, and it is
  idempotent while running.
  *Standing rule this proves again: profile the model before placing anything
  on it. "It looks like a flat front" has now cost three cuts of this panel.*

- **ROUND 10 (Aug 2026 — blackjack, the wheel's stage, and Sterling's counter).**
  **BLACKJACK.** E at a table now *joins* it — the whole gesture is walk up and
  press E, refused server-side if it's full. **Movement no longer gives up your
  seat once the engine has seated you** (Josh): WASD is swallowed while you're
  in a hand, and "back to the floor" — which now leaves the table properly via
  `standUpHook` — is the only exit. Your own body takes the ENGINE's seat
  (`engineStool()`) rather than waiting on the floor socket's `mySeat`, which
  used to leave you standing on the carpet beside your own cards whenever the
  socket was slow. **Readability:** your seat draws bigger, ringed in gold and
  tagged YOU; the card fan steps 26px instead of 13 (the old step buried every
  card but a sliver under the next — "the under card is hard to see"); and the
  round's verdict is a coloured pill on the felt (WIN/BLACKJACK/PUSH/LOSE/BUST)
  plus a full banner in the strip, beside a spelled-out YOUR HAND panel with
  the total. The verdict sits above the chips — overlapping them buried the
  stake.
  **THE WHEEL'S STAGE.** The platform wears a green carpet keyed to the 2D
  view's own felt (#12402f → #0b271d → #05130d, cross-hatched) with a gold
  WHEEL OF FORTUNE wordmark on the southern apron — not dead centre, where the
  disc stands over the northern third and you stand at 63%. A **second standing
  screen** mirrors the result board across the stage (11.45 vs 14.55) and runs
  a live countdown to the 2-hour UTC refill plus the spins in your hand,
  redrawn once a second off the hall's ticker (`showSpinReset`). **The wedges
  are LIVE**: each tier wedge shows an emoji you DON'T OWN — an actual
  candidate, since the award rule is "a random unowned emoji of the rolled
  tier" — and `rerollWheelPrizes(ownedCodes)` re-draws them all after every
  spin, once the reveal is done and the inventory has refreshed. The wheel's
  can was **pulled back 6.1 → 6.9 and dimmed 62 → 44**, and the chandelier and
  stage wash moved 6.5 → 7.2: both hung in front of the disc and blew out the
  top wedges, which are the ones under the pointer.
  **STERLING'S COUNTER.** E at the barman opens a casino shop —
  `SterlingShop.svelte`, station `sterling` at (15.2, 2.5) aimed at him.
  Three counters: wheel spins, sell emoji (the Trader's own prices, grid
  picker), and **the talisman for 5,000 silver** — a new route
  (`POST /api/shop/talisman-silver`) over a new one-transaction store op
  (`buyTalismanWithSilver`: refuse-if-shielded → debit → grant). It is a pure
  sink in BOTH directions: the coins burn rather than pay anyone, and the
  shield is unsellable, so the 5,000 can never be recovered. The Wheelwright's
  mythic sacrifice is untouched. Every button posts to the same `/api/shop`
  endpoints the 2D Trader uses — the floor still holds no money paths of its
  own. Harness: `node scripts/checks/test_talisman_shop.mjs` (27).
- **ROUND 10b (Aug 2026 — the blackjack table's seating, measured).** Josh, with
  a snip of three players merged into one heap: "players are sitting right on
  top of each other and their cards don't exactly match up with the white
  square underneath". Two separate faults, and both were measured rather than
  eyeballed.
  **THE PRINTED BOXES.** The felt's seven white boxes were located by
  unprojecting a top-down render onto the felt plane (`__cas.camera` + `THREE`
  are on the dev hook for exactly this) and fitting, in table-local cells:
  **`along = 0.396 t`, `across = 0.038 − 0.178 t²`, t ∈ [−1, 1]** — every box
  within a centimetre. The old spots were evenly spaced at t = ±1, ±0.6, ±0.2
  while the print sits at sevenths, so only the two outer hands ever landed on
  a square. Six seats now take six of the seven boxes, **leaving the CENTRE one
  empty** (symmetric, and it reads as the open spot it is). A canvas→world
  round-trip through the overlay's own matrix confirms each painted spot lands
  on its measured box to four decimals. Second half of the same fault: the
  cards were drawn a full card-height ABOVE the spot, so even a perfect spot
  put the hand off the box — the fan now straddles it, with the verdict above
  and the stake and name below. (chipStack writes its amount UPWARD, which is
  what had been overprinting "BLACKJACK".)
  **THE RAIL.** The print is only 0.26m between boxes, so six bodies can never
  sit on it. The stools ride an **offset of the table's own outline, walked by
  ARC LENGTH** (`railAt` in layout.ts: 0.843 × 0.385 half-extents, 0.30 corner,
  seats 0.52 clear, pitch 0.42 cells): even 0.84m spacing that carries round
  the corners instead of piling up on a straight line. Cards and bodies are
  deliberately decoupled — the print is too small to seat six, and real players
  lean in. Harness grew to 213: minimum neighbour gap, even spread, and every
  seat still within arm's reach of its own felt.

- **ROUND 11 (Aug 2026 — the wheel tells the truth, and the floor takes your
  voice).** Josh: "it spins and says it's about to land on what looks like a
  bunny emoji, and when it lands on the bunny what I win is a different emoji
  of the same tier. The wheel and the backend are not synchronised."
  **They weren't, and it was my round-9 change that split them.** The client
  was rolling its own random unowned emoji per wedge while the server rolled
  the award separately — two independent draws that agreed only by accident —
  and every player saw a different wheel. **THE FACE IS NOW SERVER-DRAWN**
  (`buildFace` in `src/wheel.ts`): 32 wedges, each a real emoji of its own tier
  that the spinner doesn't own, sampled without replacement, and the wedge the
  spin lands on is **pinned to the emoji that spin actually awarded**. It rides
  the spin response, `GET /api/wheel` (for the resting face) and the floor's
  `wheel` broadcast, so the whole room paints the same wedges before the disc
  turns — the swap hides in the blur. The near-miss stays honest: a legendary
  wedge that paid a rare shows the rare. Harness
  `test_wheel_face.mjs` (14) walks 220 real spins and asserts the landed wedge
  IS the prize, every time.
  **THE FLOOR TAKES YOUR VOICE** (Josh): entering the casino leaves whatever
  voice channel you were in, so proximity chat is the only voice down there —
  the backrooms' rule. Awaited before the floor's own room takes the mic, so
  two LiveKit connections never fight over the device.
  **STERLING'S TOP SHELF:** a random unowned MYTHIC for 100,000 silver
  (`POST /api/shop/mythic` over `buyRandomMythic` — pool checked before the
  debit, so a completionist can't pay for nothing). The Pit's weekly crown
  stays how mythics are *won*; this is how a season's silver gets spent. Burned
  like the talisman, and mythics are unsellable, so it mints nothing.

- **ROUND 12 (Aug 2026 — THE BAR: pockets, bottles, and being drunk).** Josh's
  spec, built end to end. **THREE POCKETS** (`bag`/`bagSel` in CasinoGame): 1-3
  pick, G sets down, left-click uses what's in hand — the backrooms' shape. The
  casino has one kind of item so far, so a slot is just a drink id; a second
  kind makes it `{kind,id}` like `BrItem`.
  **THE BAR** is a fifth counter on Sterling: four drinks at 20–75 silver (Josh: nothing above 75 — the first cut priced a whisky like a wheel spin)
  (`DRINK_PRICES` in shop.ts ↔ `DRINKS` in casino/drink.ts — keep them in step).
  **Where the money is:** buying burns silver through the counter like every
  other purchase; the BOTTLE after that is client state on purpose. It's worth
  nothing to anyone, can't be traded, and its only effect is on your own eyes
  and ears — duplicating one buys you a headache — so it gets no table. The
  honest cost of that choice: log out mid-bottle and you left it at the bar.
  **A full hand refuses the sale** (Josh): the bar checks for a free pocket
  BEFORE the silver moves and greys its buttons out — the first cut took the
  money and then shrugged that your hands were full, which burned it for
  nothing. A small money bug, but a money bug.
  The model is a real pack bottle (`hall.takeBottle`, which searches props.glb
  AND bottle.glb — the whisky and champagne live in one, the beer and wine in
  the other) **auto-scaled by measurement to 28cm in hand**, because the two
  files are authored at wildly different units. It hangs off the CAMERA, which
  is why `scene.add(camera)` is now load-bearing: three only draws what it can
  reach from the scene root, so a camera outside the graph renders no children.
  Left-click swings it to your mouth over 900ms and Josh's own recording
  (`sfx/drink.ogg`) plays.
  **BEING DRUNK** (`casino/drink.ts`): a 0–100 meter, +16/27/34/41 a bottle,
  draining 0.45/s upright. The visuals are a REAL post pass — the scene renders
  to a target and a fullscreen quad samples it twice with a drifting offset, so
  double vision is actually two images rather than a blur pretending; the frame
  also swims and WARMS as it climbs — it never darkens (Josh: "don't make
  drunk vision dark"; the first cut pulled a dimming tunnel in from the edges,
  which just made the room hard to see, so the edges lift and bloom instead).
  It only runs when there's something to see, so a sober player pays nothing.
  **THE DARKNESS WAS NEVER THE SHADER — IT WAS THE MISSING sRGB ENCODE.**
  Josh had to say "the room is still too dark" three times before I stopped
  adjusting brightness and went looking for the real cause. Three injects the
  colour-space conversion into ITS OWN materials; a `ShaderMaterial` writes
  `gl_FragColor` straight to the framebuffer. So the quad was putting raw
  LINEAR values on an sRGB display, which lands every mid-tone at roughly a
  fifth of its brightness — the whole hall dropped a stop the instant the pass
  switched on. The pass now applies the sRGB transfer itself (the piecewise
  12.92 / 1.055·x^(1/2.4) − 0.055 curve), and a drunk frame matches a sober one
  side by side. *Two earlier attempts missed it: lightening the shader (the
  vignette was real but minor) and setting the target's `colorSpace` (which
  governs SAMPLING, and a raw sampler uniform in a custom shader ignores it
  anyway). If a post pass ever looks dark here, check the encode first.*
  The ghosts are ADDITIVE for the same family of reason — an average halves
  every small bright feature against its dark neighbour, and a dark hall IS
  small bright features.
  The swig tilts the bottle's NECK to your mouth: a POSITIVE x rotation takes
  its top toward the camera. The first cut's negative sign brought the base up
  instead — Josh: "you are drinking from the bottom". Sober-up is 0.95/s
  (~1.7 min from full), 3.4/s on the hangover. Everyone else's voice
  smears through a new `ProximityVoice.setImpairment` — a master lowpass plus
  an LFO-modulated delay on the LISTENER's own bus, so it never touches what
  anyone else hears. At 100 you go down: local ragdoll, black screen (the ONE thing that does
  darken — that's being unconscious), muffled room, 60s, then you wake still
  drunk but sobering at 2.4/s for 45s. **The room sees it too**: the floor
  wire's pose gained a fourth value, 3 = DOWN, so peers lay you over on the
  carpet and stop your stride. It's a transform rather than a networked
  ragdoll, because the ragdoll is the DEATH cinematic and a drunk is not a
  corpse; and it's safe to relay unclamped-but-bounded because faking pose 3
  buys a liar nothing but a lie-down. Late joiners find you down too — it
  rides the welcome snapshot. 3 asserts in test_casino_floor (47).
  **THE BAR TOP** was scattered down the middle of the counter (whisky at 11.2,
  glasses at 11.5 and 12.6) — exactly where ten stools put ten elbows. Working
  bottles now cluster at the SERVICE end around Sterling and the till, with one
  display cluster anchoring the far end and the drinking length clear.

- **ROUND 13 (Aug 2026 — the jumbotron runs the REAL race).** Josh: "cast the
  same racing screen you see in the 2d version. no need to reinvent the wheel.
  that way if people are in the 2d emoji rumble or in the casino the race is
  synchronised and the same view." It wasn't: the jumbo faked the running with
  `rank + a sine wobble`, so a player at the bar and a player in the paddock
  watched two different races that happened to agree on the winner.
  **The maths moved out of Derby.svelte into `client/src/lib/derby-race.ts`**
  — mulberry32, the per-cast pacing shapes, the smoothed cumulative tables,
  the finish times — and BOTH screens import it. The jumbo now derives its
  clock exactly the way the paddock does (3s countdown off the front when
  there's room, winner at 88%), runs the same curves, quantises the frog into
  its 13 hops and plays the boulder's flop gag on the same seeded coin. Two
  screens, one race, frame for frame. The board also picked up the paddock's
  layout: named lane rows, the trail each runner has run, and the dashed
  finish line.
  *A Svelte component cannot be rendered onto a WebGL texture, so "the same
  view" is achieved by sharing the DATA and redrawing the same board on the
  canvas — the art is a canvas replica, the race underneath is literally the
  same object.* Harness: `node scripts/checks/test_derby_race.mjs` (17) —
  two independent clients agree to the float at 200 sampled instants, a new
  seed really is a new race, nobody runs backwards, they cross in the
  broadcast order, and NEITHER screen keeps a private copy of the maths (the
  assert that keeps the first one true tomorrow).

- **ROUND 14 (Aug 2026 — the roulette table's OWN wheel, and a real ragdoll
  for the pass-out).** Josh: "i do not like the 2d emoji game interafce pasted
  one. would it be possible to get the models wheel spinning and put a ball in
  there to roll and stop." Two separate things read as pasted, and both were.
  **The wheel.** Round 6 had reverted a loose disc in the bowl and left a note
  saying that if the bowl ever spins it must come from the table's own
  geometry — and then round 10 floated a PROCEDURAL disc over the felt anyway.
  It sat 46cm off the model's real wheel, so the table wore two: the pack's
  handsome one, and a flat numbered circle lying beside it. The pack ships a
  proper wheel as a child of the table mesh (`Casino Roulette 2`), so
  `buildRouletteWheel` in world.ts now:
  · **splits it** — triangles are sorted by centroid radius at 0.85R into a
    static bowl (the octagonal rim, which must NOT turn) and a head, and the
    head is re-parented onto a pivot at its own measured centre;
  · **faces the head with the 37 pockets** — a cone band lying on the apron,
    built from a ray-cast profile of the model itself (the dish bottoms at
    0.185m and the apron climbs 0.760→0.806 to the rim), so it fits whatever
    scale layout.ts gives the table. The pack's own pocket ring is decorative
    colour with no numbers, and a landing nobody can read is just an animation;
  · **gives it a ball** that runs the track against the spin, spirals down the
    apron with a fret clatter, and is CAUGHT by the wheel — the last 30% of
    the animation blends its angle onto `pocketAngle(pocket) − headAngle`, so
    it is exactly its pocket's whatever the free run did, and afterwards it
    RIDES the head like a real one instead of the wheel stopping dead.
  The head keeps turning at 0.42 rad/s between spins; sound is `ballRun` +
  `ballLand` off the animation's own clock (`DROP_LEAD_MS` before the visible
  drop), only within 11 cells.
  **The cloth**, measured rather than estimated, which is where three separate
  errors came out: it FLOATED (the felt tops at y 0.683, not the 0.722 guessed
  from the pack's raw height), it was SELF-LIT (a MeshBasic panel at full
  brightness over a half-lit felt — `overlay({lit})` now takes the room's
  light), and it was the WRONG SIZE AND COLOUR — the betting felt is a 0.99m
  strip, and the old cloth was 1.42m centred on the table, so half a metre of
  it hung over the rail and into the room. It is now 2.45×0.99m in the felt's
  own green (`#01684a`, sampled out of the atlas through the tabletop's UVs),
  drawn on a 1024×414 canvas so its pixels are square and its numerals aren't
  a third too wide. It stays OPAQUE on purpose: the pack prints an American
  double-zero layout on this felt and two layouts at once is worse than
  either. A croupier's **dolly** stands on the winning number once the ball
  has landed (gated on `revealed` — the pocket rides the broadcast at roll
  time, and the cloth must not know before the ball does).
  The pocket order moved to `casino/wheel37.ts` so a harness can read it:
  9 asserts in test_casino_layout (222) hold it to 37 distinct pockets 0–36,
  the ENGINE's own reds (parsed out of src/roulette.ts), the real wheel's
  colour alternation, even angular spacing, and no private copy in world.ts.
  **The pass-out ragdolls now** (Josh: "the passed out from being drunk is not
  good just ragdoll the character"). Peers used to be the standing model
  rotated 90°, which read as a plank; the local player got `throwOff`, which
  aims off the STAGE with THROW_POWER behind it, so passing out at the bar
  fired the body across the hall. `deaths.collapse/revive/isDown/bodyAt` run
  the same verlet figure at power 0 — a crumple where the feet are — keyed by
  owner so it goes away when they come round, and never on the linger clock (a
  minute out cold outlasts the corpse timer). The room hides the walking body
  and keeps the NAME TAG, dropped to carpet height. Your own screen goes
  third-person and orbits the body, and the unconscious dim came down from
  0.93 to 0.15: black was hiding the one thing worth looking at.

- **ROUND 15 (Aug 2026 — drunk locomotion).** Josh dropped a Mixamo drunk set
  in `assets/Models/movement/drunk`. Five of them ship: idle, walk, walk-back,
  run, run-back, as `drunk-*.fbx` beside the sober clips. Bench-checked against
  the rig before any wiring — 19 tracks, 18 bones, only the armature node
  unbound, exactly like the shipped set — which also caught the thing that
  would have broken them: **they carry ROOT MOTION** (the walk translates 265
  units of Z over its 3s, the run 486) where every other locomotion clip here
  is in place. Played raw they would march the body off the player it belongs
  to, so the loader strips their horizontal root the same way it already
  strips the jump's.
  `drunkState(state, drunk)` maps idle/walk/walkback/run/runback onto the drunk
  twins and leaves everything else alone — strafes, crouches, swimming,
  sitting and the jump stay sober **on purpose**: 8-way locomotion exists
  because feet have to match the direction of travel, and a forward stagger
  played while sidestepping breaks that worse than the drink sells it. All
  three bodies read the same table: your first-person rig, your stand-in at a
  table shot, and every peer.
  The room needs to see it, so the floor wire's move frame gained **`d`**
  beside `p`, on identical terms — cosmetic, clamped, relayed, worth nothing
  to a liar (the worst a faker achieves is making themselves stagger). It
  rides the welcome snapshot too, so walking in on someone three drinks deep
  shows them already swaying. Threshold is `DRUNK_SHOW` = 45, the same number
  the HUD stops calling you "merry" at, so the label and the body can't
  disagree. 4 asserts in test_casino_floor (51).
  Verified on the live rig rather than by eye: standing still, the chest
  bone's motion over a second goes from 0.026 rad sober to 0.312 drunk.

- **ROUND 16 (Aug 2026 — the jumbotron IS the 2D screen).** Josh: "the emoji
  racing jumobo tron is still not accectpable, i would like you to put the same
  screen someone would see in the 2d casino. also include the sounds as well."
  Round 13 shared the race *maths* and then redrew the board on a canvas
  texture, which is a replica of a Svelte view — and a replica is exactly what
  kept being rejected. So the canvas painter is **deleted** (183 lines) and the
  hall now **mounts the hub's own racetrack**:
  · `components/DerbyCourse.svelte` — the grandstand, the lanes, the runners,
    the trails and the infield markers, lifted whole out of Derby.svelte with
    their CSS. Pure presentation, state in and pixels out, which is what makes
    it safe to render twice.
  · `casino/jumbo.svelte.ts` — mounts that component into a `CSS3DObject` and
    transforms it onto the jumbotron's plane (880px board scaled onto the
    6.4×3.2m screen). Same markup, same stylesheet, same crowd, same dust.
  · `lib/derby-run.ts` — ONE race director for both screens: the 3-2-1 eating
    the front of the clock, the frog's 13 hops, the boulder's late detonation
    or its pratfall, the buzzer on the frame the winner's lane crosses, and the
    crowd under it. Sharing curves but hand-copying the clock into two places
    was the same bug waiting in a new spot.
  **The sounds come with it** — the derby cues took a `gain` argument so the
  hall can fade them by how far across the floor you're standing (silent past
  15 cells, full inside 10). Verified by spying on the AudioContext through a
  live race: three count beeps and the GO tone (4 oscillators) plus the horn,
  the crowd loop and the finish buzzer (3 buffers), exactly the cue set the hub
  plays.
  **A DOM layer cannot hide behind WebGL, so it doesn't try.** The first cut
  composited it OVER the canvas and hid it when rays to its centre and corners
  were all blocked — which meant the stage wheel standing across the middle of
  the board didn't count, and it drew straight through the wheel (Josh: "it
  shows over everything now"). The layer now sits UNDER the canvas and the
  screen's own quad writes `vec4(0.0)` with `NoBlending`: it punches a genuinely
  transparent rectangle through the frame, wherever the screen is visible, and
  still writes DEPTH — so every prop, body and pillar in front of it occludes
  the board per-pixel by ordinary depth testing. Needs `alpha: true` on the
  renderer, and the drunk pass carries the hole through (it returns `vec4(0)`
  where the sampled alpha is 0 — with zero rgb, since the canvas composites
  premultiplied and colour without alpha would glow over the board).
  **THE STACK IS EXACT and easy to break**: layer at `z-index: -1`, canvas left
  STATIC. Positioning the canvas to get it over the layer put it above every
  HUD element — those are absolutely positioned with an automatic z-index, and
  positioned content paints over in-flow content, so the hotbar and the wallet
  chip vanished under the room. A negative z-index paints above `.casino`'s own
  background and below everything else, which is the one slot that works.
  The board also takes a CSS blur scaled to drunkenness, since the post pass
  can't reach DOM and a razor-sharp screen in a swimming room reads wrong.
  Measured cost of the whole layer: none (31.2ms/frame with the board up,
  31.3ms with it hidden).
  The 2D hub renders the same component and runs the same director, so the two
  are the same race down to the frame. 22 asserts in test_derby_race — they now
  hold the SHAPE as well as the maths: the jumbo must `mount(DerbyCourse)`,
  both must import derby-run, neither may keep a private rAF race loop, and the
  hall must paint no board of its own.

- **ROUND 17 (Aug 2026 — the drunk idles).** Josh's set had two alternate idles
  going unused, and standing at the bar is where a drunk spends most of their
  time, so the one looping pose was the one people looked at longest. Both are
  in (`drunk-idle2/3`), and the whole drunk mapping moved to
  `casino/drunkclips.ts` — a pure module, so world.ts derives BOTH its load
  list and its clip table from it (a new drunk clip is one line, not an edit in
  three files that must agree) and a harness can read it without a rig.
  **The rotation is stateless**: which idle a body plays is a function of the
  clock and the body's own salt, so peers vary with no extra byte on the wire.
  A plain hash was the first cut and repeats a third of the time — and a repeat
  is indistinguishable from the loop the variations exist to break — so the
  index walks a Beatty sequence (advances by one or two every window, never
  zero, aperiodic). Each body also gets a phase AND an offset: a phase alone
  moves only *when* a body changes pose, not *which* pose, so two drunks stood
  there playing the same idle in step. 6.5s a pose.
  Verified on the live rig, not read off the source: all seven drunk states
  bind to their own clip (no silent fallbacks), each is reached by the right
  input, and the three idles sit 0.46–0.76 rad apart in mean pose — genuinely
  different animations, not three names for one sway. `__cas.bodyDbg()` is the
  hook that shows it. 14 asserts in test_casino_layout (238).
  **AND YOU SEE IT FROM INSIDE YOUR OWN HEAD** (Josh: "make sure too the player
  from their pov can see the animations as well of being drunk. not just
  everyone else"). Wiring the first-person rig to the drunk states was NOT
  enough, and the reason is `placeViewmodel`'s head pin: it measures how far
  the clip moved the head and counter-applies it to the body, so the mask keeps
  its idle relationship to the lens. That is exactly right for crouching — and
  it cancelled the stagger, leaving a drunk with a rock-steady view over a
  swaying model. The viewmodel now publishes that measurement (`vm.sway`, world
  metres) and the casino's eye rides a share of it, so the whole rig lurches
  together: the body is still anchored to the eye, so the mask never drifts
  into frame.
  Both dials came from measuring, not taste: raw, the idle alone swings the
  head over a METRE fore-and-aft (they lean, hard), so the offset is clamped to
  ±8.5cm per axis and eased at 5/s — which also stops an idle VARIATION
  swapping mid-blend from jumping the lens. Gated on `DRUNK_SHOW` and off
  entirely while out cold, at a station or dancing. Measured: sober standing
  wanders 0.000/0.011/0.000m (dead still, unchanged), drunk standing
  0.15/0.23/0.17, drunk walking 0.06/0.37/0.15.
  **Still unmapped, deliberately**: the three TURN clips. There is no turn
  state in the locomotion set at all — sober or drunk — so wiring them means a
  new state driven by yaw rate, which changes sober movement too. That wants
  its own pass, not a bolt-on.

## Invariants (do not regress)

- **No UNSANCTIONED money paths** (amended Aug 2026 — the original "zero new
  money paths" predates the counters). BURNS are sanctioned at Sterling's
  counters only (gun 150k, clips 50k, Slorp 1,500, jukebox 60/20, and the
  Escape Room's tools); the **Escape Room is the floor's ONE sanctioned MINT**
  — chest drops, allowance-capped and tripwired, every dial in `ESCAPE.md`.
  Everything else goes through the existing routes and engines.
- **Recipient-scoped secrecy is untouched**: hole cards, dice cups, DMs
  never route through floor code.
- **The seat doctrine**: floor seat occupancy derives from game-state
  broadcasts; the floor service holds no seat state.
- **The suit pick is read-only** against inventory; no floor mechanic outside
  the sanctioned list above may burn, mint, or move value.
- The 2D hub stays fully functional standalone — the floor is never
  required for anything.

## Resolved picks (Josh, 2026-08-06: "go with what you recommend")

1. **The physical Hold'em table binds to Copper (1/2)** — most playable
   stakes. Gold/High Roller can join later as a VIP corner behind the
   stanchions.
2. **Roulette joins the floor in C1** (SE corner near the entrance — the
   props pack ships the table and the engine exists). **Craps is queued
   for the first floor expansion** — no table model in hand; build or
   source one later rather than fake it now.
3. **One kiosk**: the SOUL KIOSK sells BOTH race tickets and lottery
   tickets from a two-tab menu. It is literally a ticket machine.
4. **Hold'em gets 6 chairs** (the engine's seat count; the plan's 8 was
   drawn before the engine check).
