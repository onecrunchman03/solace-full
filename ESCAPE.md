# THE CASINO ESCAPE ROOM — design doc (Josh's brief 2026-08-13, digested + numbered)

A door to the RIGHT of the jukebox on the casino's north wall, an ESCAPE ROOM
sign above it. Behind it: a 48-room residential complex, one shared instance,
one key, one monster on a lighting cycle — and the floor's FIRST SANCTIONED
MINT (chests), tuned in this doc, rate-capped, and tripwired. Everything else
about the floor's economy doctrine (burns at Sterling's counters, the Wheel as
the sole emoji faucet) is unchanged.

Source assets: `assets/casino/escape room/` (map PNG, props, monster, alarm).
Runtime copies land in `client/public/assets/er/` after the E0 compression
pass — the source kit is 102MB and CANNOT ship as-is (see Assets).

---

## Entry & THE PASS

- **The door**: right of the jukebox (east of it on the north wall), sign
  above, teleport-style like the casino's own entrance — never a swinging
  door. Clicking it with no pass opens a stake dialog; with a pass, you go
  straight through to the spawn room.
- **The stake: one RARE emoji, chosen by the player, BURNED at stake time.**
  What you buy is **THE PASS — a durable condition on the character, not an
  item**: it never expires except by DYING IN THE ESCAPE ROOM. Leave and
  re-enter freely while it holds. (Burn-at-stake rather than escrow: there is
  no returning condition — no win ever refunds it — so holding the emoji in
  escrow would be machinery with no purpose. `er_passes` records userId, the
  burned code, and when, for the audit trail.)
- Death ANYWHERE ELSE never touches the pass. A Wake revival keeps it; an
  INHERITANCE (generation bump) does NOT carry it — a new life re-stakes.
- The pass is self-scoped private state (like coins); it never rides a
  public wire.

## The spawn room (the ante-room — safe, always)

South of the complex, matching the drawing. Contents:

- **The door INTO the map**: teleport door on the north wall. **LOCKED the
  moment the red phase begins (telegraph included) and until lights restore.**
  One-way in — it cannot be held open, so nobody standing in the spawn room
  can "rescue" players inside. It is not the way out.
- **The wall map (west wall)**: an aesthetic redraw of the complex — every
  room with its letter+number, the blocks visually grouped, drawn to the
  BUILT geometry (not the sketch). Server-drawn as data, rendered as a lit
  framed panel; also reused as the admin debug minimap.
- **Sterling behind a counter** (he keeps every counter in this casino).
  E to shop, silver only, ALL BURNED (his counter shape):
  **flashlight 100 · walkie talkie 100 · almond water 100.**
- **TWO lockers, side by side, signed**: the CASINO LOCKER (the existing
  50-slot `casino_locker` — **the gun MUST live here; it cannot cross the
  threshold**) and the ESCAPE ROOM LOCKER (`er_locker` — stores escape-room
  items between runs; what you carry when you die is destroyed, what you
  lockered survives you).
- Alcohol MAY cross the threshold (bring a bottle from the bar). Drunk in a
  hunt is your own fault — and almond water SOBERS YOU INSTANTLY (that's its
  job here; the monster kill is binary so healing would mean nothing).

## The complex

- **48 rooms in five lettered blocks — A1–A11, B1–B14, C1–C10, D1–D6,
  Z1–Z7** — off a hall network, topology per the drawing. (The drawing
  labels TWO rooms B13; the second is B14 here. Flagged to Josh.)
- **SCALE IS SET BY THE FURNITURE, NOT THE SKETCH** (Josh, mid-brief): the
  PNG is a schematic. Standard room = **3×2 cells (6×4m)** at the backrooms'
  2m CELL. **V2 GEOMETRY (Josh, 2026-08-14: "why does the map layout look
  different than what i gave you")**: the first transcription compressed
  the drawing's open space into 2-cell corridors — but the drawing is ROOM
  CLUSTERS STANDING IN ONE OPEN FLOOR. er-layout v2 is that island model:
  a single 52×20-cell floor plate, the clusters placed as drawn (C's paired
  columns + facing pairs, B's two long rows with the mid-row gap — which
  hosts a den — D's facing rows sharing a door band, A's three short rows,
  Z's paired columns), a stub throat down to the ante-room. The layout
  harness (229) pins the drawn structure explicitly, and the server's
  mirror (rooms/floor/stub/dens/exit) literal-for-literal.
- **Doors**: from `doors.glb`, every room door STAMPED with its letter+number
  on the hall face. Players open/close with E. Door state is server-owned and
  broadcast (it is gameplay — see THE HUNT).
- **THREE DENS (Josh, 2026-08-13)**: three rooms spread around the map —
  west, north-centre, east — each fronted by a `rolling_shutter.glb`. **Each
  hunt the monster emerges from ONE, crypto-picked**, and retreats to the
  same one; the shutter's rolling clatter is positional, so which third of
  the map just got dangerous is something you HEAR, not something a HUD
  tells you. The drawing's unlabeled west-edge rooms supply the first den;
  the other two are carved during E1 layout. No chests, no key, no shelter
  in any den or utility room.
- **Furnishing**: intentional, per-room variation from the prop kit (bed,
  dressers ×3, bedside table, floor lamp, persian rug, ceiling lights);
  casino atlases for walls/floors/trim so the place reads as the casino's
  basement floor, not a different game. Lighting is INTENTIONAL: warm room
  lamps (rooms are ALWAYS lit), cooler hall fixtures (the ones that die
  during hunts), red emergency fixtures in the halls (the ones that flash).
- Movement/animations = full backrooms parity (8-way locomotion, crouch,
  emotes, the works). Proximity voice carries in; walkie holders reach each
  other MAP-WIDE (backrooms walkie semantics).

## THE KEY & the exit cycle

- Exactly **ONE key** exists at a time, spawned in a random LABELED room
  (never the same room twice running), visible on furniture — memory, not a
  waypoint. E to take (occupies an inventory slot).
- **You cannot leave without it.** The exit door (map→spawn room) refuses
  everyone until a key-holder uses it: then it **UNLOCKS FOR 30 SECONDS —
  for EVERYONE**. The key is consumed; the social moment ("door's open,
  RUN") is the point. After 30s it re-locks and a fresh key spawns
  elsewhere.
- Key-holder dies or disconnects → **the key RESETS to a fresh random room,
  and everyone inside is told it moved** (Josh's call, 2026-08-13 — replacing
  an earlier drop-where-they-fell design). The key is never destroyed while
  players are inside — that would soft-lock every soul in the complex.
- **ANTI-HOSTAGE RULE (approved): a held key CRUMBLES after 10 minutes
  unused** — same reset + same announcement — so one troll pocketing the
  only key can't own everyone else's exit.
- Key use is allowed DURING a hunt (escaping mid-chase is the best moment
  this game will ever produce). Only ENTRY locks during the red phase.

## THE HUNT (the lighting cycle and the monster)

The state machine (server-owned, one per complex, **PARKED while the
complex is empty** — jukebox-clock precedent):

1. **CALM.** Main lights on. Next hunt scheduled in **{2,4,6,8} minutes,
   crypto-picked** (`ER_HUNT_GAPS`; Josh's original {1,3,5,7} approved up to
   Claude's rec 2026-08-13 — the 1-min gap left ~45s of real exploration
   between lockdowns).
2. **TELEGRAPH (15s).** Main hall lights DIE; red emergency lights flash in
   intervals; `alarm.mp3` sounds; entry door locks. A notification names the
   **OPEN BLOCKS: 2 or 3 letters, both count and letters crypto-picked** —
   only those blocks' room doors can be OPENED during the phase. (Being
   ALREADY inside any closed room is safe regardless of block — locks stop
   door-opening, not existing.) Rooms stay lit, always.
3. **HUNT ({1,2,3} minutes, crypto-picked).** The shutter opens; the monster
   emerges. It is **OMNISCIENT** — always knows every position — and chases
   the nearest player who is in a hall or an open-door room, at **2× player
   run speed** (uncatchable by design: hunts are about POSITION, not
   footraces). **Contact = instant kill.** Closed door = absolute safety.
   The chase sound loops seamlessly, positional. Chests may still be opened
   mid-hunt (greed is a choice).
4. **RETREAT.** Hunt clock ends; it paths home at speed — **still lethal to
   touch** (one rule, no exceptions). Shutter closes behind it; THEN main
   lights restore, alarm stops, entry unlocks. Back to CALM.

**Death by monster**: ragdoll + kill-cam (the casino gun's shape — ten
seconds, cosmetic, the account/collection/Wake never hear of it), BUT: **the
pass is revoked** (that's what the stake bought), carried inventory is
destroyed (lockered items survive), the key drops if held, and you wake in
the casino by the entrance. Re-entry = a new rare.

The monster: the parasite-zombie FBX kit (Idle + Run + textures), converted
to GLB in E0. Server-side chase brain reuses the Shy Guy's grid pathing.

## CHESTS & THE ECONOMY (the delegated math — Josh: "you calculate the
chance ratings; don't break the casino")

**This is the floor's ONE sanctioned mint.** The dials, the math, and the
tripwire live here; nothing else on the floor may mint.

- **Presence**: 5 chests stand in the complex at once (labeled rooms only,
  ≤1 per room, `treasure_chest.glb`). An opened chest despawns and respawns
  in a random room **4–8 minutes later**.
- **Allowance: each player may open 10 chests per UTC day** (`er_opens`).
  The 11th refuses, in character. This is the HARD VALVE on the faucet —
  contested spawns pace the room, the allowance caps the day.
- **Tier odds: 80% common · 17% rare · 3% legendary.**
- **In-range rolls are SKEWED LOW**: value = min + (max−min)·r², r uniform
  (mean lands at min + range/3). Josh's ranges are honored verbatim; the
  skew is inside them.
- **Type weights within a tier** (engagement over raw silver):

  | Tier | silver | wheel spins | chips | slot pulls | skin |
  |---|---|---|---|---|---|
  | Common (80%) | 25% · 50–500 | 35% · 1–3 | 40% · 100–250 | — | — |
  | Rare (17%) | 20% · 200–1000 | 25% · 5–10 | 30% · 250–1000 | 25% · 10–20 | — |
  | Legendary (3%) | 15% · 1500–5000 | 20% · 10–25 | 25% · 1000–2500 | 20% · 25–50 | 20% |

- **EV per open** (spin ≈ 11 silver sell-EV, slot pull = 8.71 EV, chips
  counted at 0.95× face — see CHIPS): common ≈ **113**, rare ≈ **283**,
  legendary ≈ **847** → **blended ≈ 164 silver/open**.
- **Ceilings**: one player, fully farmed = ~1,640/day (vs a hardcore Wheel
  day ≈ 880, typical ≈ 300–400); a realistic session (4–6 opens) ≈ 700–1,000.
  Ten players all-in ≈ 33k/day server-wide — context: one gun burn is 150k.
  Against it: every death burns a rare + carried tools, entry burned a rare,
  and time inside is time not at the sinks.
- **TRIPWIRE**: chest grants are audited per-day; `economyTotals()` counts
  chips + outstanding freePulls; the Sterling observability sweep alerts if
  ER mint exceeds **25k/day**. The weekly report gets an ER line.
- **Retune order** (most leverage first): daily allowance (10) → tier odds
  → type weights → skew exponent → respawn pacing.
- Grants are **instant at open** (Josh's notification spec) inside one
  store transaction; nothing is held, so there is no new escrow surface and
  a crash mid-open mints nothing. The open notification is a clean toast:
  tier banner + what dropped ("COMMON CHEST — 2 wheel spins").

## CHIPS & FREE PULLS (two new self-scoped balances, migration 70)

- **`users.chips`** — casino chips denominated 1:1 in silver, **spendable as
  stakes at the HOUSE GAMES ONLY: Slots, Roulette, Blackjack** (v1; craps
  later — its takedown path needs the same column). Bets consume CHIPS FIRST,
  then silver; **winnings and settlements pay SILVER, always**. Refund paths
  (roulette crash-refund, blackjack unplayed-bet/boot-refund) return the
  chips portion AS CHIPS — `blackjack_bets.chips` + `roulette_bets.chips`
  columns record the split, else every cancel is a free 1:1 converter.
  PvP surfaces (Pit, Chess, Hold'em, Trade, Auction), the shop counters, and
  the jukebox REFUSE chips. Chips are private, unsellable, untradeable.
  (Honest EV note: chips through blackjack convert at ~98% — chips ARE
  near-silver with extra steps; their real function is driving play. The
  economy math above already counts them at 0.95.)
- **`users.freePulls`** — the slot-machine pass balance. The slots route
  consumes a free pull BEFORE charging; each is a pure 8.71-EV grant,
  costed in the chest math. Private, unsellable.

## SKINS (the legendary prestige drop)

- **Five hazmat colorways**, casino-flavored: Midnight, Blood, Neon, Royal,
  Gilded. Granted through the EXISTING backrooms suit-ownership system (the
  floor's `enter.suit` check already refuses unowned suits — zero new wire).
  Usable in the backrooms too. One-appearance law applies as ever.
- A legendary rolls "skin" only if the finder still lacks one of the five;
  otherwise it rerolls another legendary column.
- **STRICTLY PER-PLAYER (Josh, 2026-08-13): "the skin only becomes available
  for that player who gets it."** No global discovery, no cross-player
  purchase, ever: the pull grants the skin to the finder outright, and Voss's
  shop shows that skin ONLY in the finder's own view (an owned trophy line —
  nobody else ever sees it listed). `er_discoveries` records per-player
  unlocks.

## INVENTORY (5 slots, in-zone)

`er_inventory`, five slots, holds: flashlight, walkie, almond water,
alcohol bottles, THE KEY (yes — it costs a slot). Persists with the pass
across leave/re-enter; **destroyed on death**; the `er_locker` in the spawn
room is the hedge. Chest rewards are NEVER inventory — they credit
instantly (silver/chips/spins/pulls are balances; skins are ownership).

## The wire (extends the casino relay)

Same socket service as the floor, a `zone` field ("hall" | "er"); presence,
pos relay, holds, emotes all scope per zone. ER frames: `er.state` (lights
phase, open blocks, entry/exit lock, shutter, chest positions, key position
IF dropped/visible — held keys are not broadcast), `er.key` (take/use/crumble),
`er.chest` (open → self-scoped result + public "opened" marker), `er.monster`
(pos stream during hunts only), `er.death`, `er.door` (open/close),
`er.buy`, inventory ops. Secrecy discipline: balances never on the wire;
chest RESULTS are recipient-scoped; only the fact a chest opened is public.

## Persistence (migration 70) + boot

`users.chips` · `users.freePulls` · `er_passes` · `er_inventory` ·
`er_locker` · `er_opens` (daily counter) · `er_discoveries` ·
`blackjack_bets.chips` · `roulette_bets.chips`. Hunt/key/chest/door state is
in-memory (engine precedent) — grants are instant so a crash holds nothing;
boot just deals a fresh key and chests. `economyTotals()` gains chips (and
reports outstanding freePulls); conservation audits count them from day one.

## Admin debug (P, in-zone, admin-only — server enforces every op)

Start/end hunt now · set duration/gap · pick open blocks · spawn/reveal key ·
spawn chest (tier-forced) · grant/revoke pass · teleport to room · freeze
monster · show its path on the wall-map render · simulate death · reset zone.
NOTE: P is the backrooms' admin geometry probe bind — verify no collision in
the casino context at build (E5); fall back to O if so.

## Assets & pipeline (E0 — the 102MB problem)

Source kit is 102MB; the casino's WHOLE committed asset set is a fraction of
that. Precedent: gator 9.9→1.1MB, store art 1.7MB→25KB. Budget: **<8MB
total runtime**. Worst offenders: bedside_table 17.3MB, celling_lights
15.3MB, bed 11.6MB, Idle.fbx 15.8MB (embedded textures). Pipeline:
gltf-transform (weld/prune/draco + textures →1024 WebP/KTX) for props;
Blender for the monster FBX→GLB (Idle+Run clips, textures →1024); ffmpeg for
alarm + chase → OGG with CLEAN LOOP POINTS (the chase loop must be
seamless — Josh's explicit note). Runtime copies to
`client/public/assets/er/` with space-free names; measure every prop's
footprint (the measure-before-tuning rule) — the numbers feed er-layout's
furnishing data and the fit asserts.

## E0 RESULTS (2026-08-13 — the kit, measured and shipped)

102MB source → **9.9MB in `client/public/assets/er/`** (doors.glb still
holds ~6 variants; E1's split trims further). Two new standing tools:
`scripts/simplify-glb.mjs` (--snap position-weld — the bedside table was
TRIANGLE SOUP, 489k verts/165k tris, and exact weld merged nothing) and
`scripts/extract-glb.mjs` (union-find component clustering — the "ceiling
lights" file was a whole 52×50m rig; we instance one pendant + one bulb from
it). Monster verified in glbview (textures/teeth/parasite intact), table's
decimation reads clean. Audio: `sfx/er-alarm.ogg` + `sfx/er-chase.ogg`,
tails crossfaded into heads so the loop point IS the crossfade.

As-authored dims (w×h×d m) + placement scale notes — er-layout consumes this:

| file | KB | dims | note |
|---|---|---|---|
| antique_dresser | 744 | 0.74×1.33×1.14 | 1:1 |
| bed | 1672 | 1.79×1.15×2.18 | 1:1 |
| bedside_table | 240 | 4.27×4.19×3.30 | **×0.25** → 1.07×1.05×0.82 |
| ceiling_pendant | 52 | 1.20×1.87×1.19 | hangs; halls (drop too long for rooms) |
| ceiling_bulb | 20 | 0.14×0.34×0.14 | rooms + red-tinted hunt variant |
| chest | 740 | 2.63×1.78×1.32 | **×0.5** → 1.3m chest |
| doors | 1908 | 12.2 wide, 16 meshes | a SET — split per variant in E1 |
| dresser | 296 | 0.69×0.98×0.44 | 1:1 |
| dresser_seat | 252 | 1.52×0.45×0.56 | bench, 1:1 |
| floor_lamp | 344 | 0.52×2.00×0.52 | 1:1 |
| key | 252 | authored in MM | **×0.001**, then display-tune |
| monster | 2396 | 2.25×2.03 T-pose | mixamo rig, 69 joints |
| monster-run | 44 | anim-only | retargets by node name |
| rug | 564 | authored in CM | **×0.01** then ~×0.5 |
| shutter | 564 | 4.58×4.29×0.50 | scale to den openings |

## Phases (each shippable)

- **E0 ✅ SHIPPED** — asset pipeline: compress/convert/measure everything,
  commit runtime copies (results above).
- **E1** — the ante-room: migration 70, the casino door + sign + stake
  dialog + pass, spawn room built (map panel, Sterling counter, two lockers,
  locked map door), `er-layout.ts` transcription + layout harness.
  **SERVER + DATA HALF SHIPPED 2026-08-13**: migration 70 (the whole ER
  schema at once), store ops (`erStakePass` burns the rare in-txn ·
  `erBuyTool` refuses free before the wallet · `erLockerStore/Take` ·
  `erDeath` wipes the bag, ends the pass, SPARES the locker),
  `routes/escape.ts` (GET /api/escape · stake · buy · locker/store ·
  locker/take, all guarded), `test_escape_shop.mjs` (45).
  `er-layout.ts` transcribes the drawing: 48 rooms (A11 B14 C10 D6 Z7),
  six corridors in one connected network, three dens (west/mid/east),
  the 20×12 m ante-room with both teleport doors; `test_escape_layout.mjs`
  (164). **CLIENT HALF SHIPPED same day — E1 COMPLETE**: the doorway +
  lit sign east of the jukebox (`ESCAPE_DOOR` in layout.ts, built in
  world.ts), the stake dialog (owned rares, the permanence said out loud —
  rendered OUTSIDE the menu/HUD branching like the shot overlay, because
  opening it exits the pointer lock and the unlock pops the pause menu,
  which would swallow a dialog living in the HUD's else-branch),
  `EscapeRoom.svelte` (the walkable ante-room: wall map canvas-drawn from
  er-layout's REAL geometry, Sterling's counter with live buys, both
  lockers with the store/take overlay, the sealed complex door, `__er`
  review hooks) and the Rumble hall↔escape sibling-view swap. Verified
  in-browser end-to-end: stake burned a real rare, a fresh session walked
  straight through on the held pass, a flashlight cost exactly 100 and
  survived a locker round-trip. Two physical-units lessons: three r155+
  point lights need hall-scale intensities (0.85 rendered a coal cellar;
  the hall runs 20-30s), and a plane mounted INSIDE its frame box is a
  blank wall.
- **E2** — the complex: rooms/halls/doors/stamps/furnishing/lighting, key +
  exit cycle, 5-slot inventory, zone presence + movement parity.
  **E2a SHIPPED 2026-08-13.** REVISION on the wire: the zone got ITS OWN
  socket (`/ws-escape`, `src/casino/escape-zone.ts`) rather than a zone
  field on the floor relay — the floor carries gun/slorp/seat state under
  an 80-assert harness and the complex shares none of it (realtime.ts's
  upgrade allowlist learns the path, or it destroys the socket — found the
  hard way). Server-owned: enter guards (pass + carried-gun re-checked
  server-side), the whole key lifecycle (labeled-room spawns, reach + REAL
  bag-slot pickup, consume-on-use, 30s window for everyone, never-same-room
  respawns, disconnect/crumble resets with announcements), door open/close
  state, `kill()` hook waiting for E4. `test_escape_key.mjs` (33, real
  wire). CLIENT: `er-world.ts` builds the complex from er-layout — merged
  wall/floor/ceiling geometry with world-mapped UVs, doorways as lintel +
  jambs, the extracted `door.glb` on hinge pivots with canvas stamps per
  room, den shutters, seeded per-room furnishing with colliders, a TEN-
  LIGHT POOL serving 60+ fixture positions (48 always-lit rooms cannot be
  48 live point lights), the spinning key, the pulsing green exit.
  EscapeRoom.svelte crosses ante↔complex as scene swaps over one socket;
  movement is axis-separated against cells + closed doors + furniture.
  Verified end-to-end in-browser: enter → find C5 → take (bag shows 🗝) →
  unlock → THE EXIT IS OPEN 30s banner → out to the ante-room.
  **E2b — THE UNIFORMITY PASS (Josh's law, 2026-08-13: "if we already
  have something built somewhere else use that… make sure all player
  movement, animations, equipment are uniform across all fps game modes") —
  CORE SHIPPED same day**: EscapeRoom's mini-controller is GONE — both the
  ante-room and the complex are `ControllerWorld`s driven by the backrooms'
  own `createController` (same speeds, radius, sensitivity, pitch clamps,
  and rebindable binds via brSettings; er-world now speaks the backrooms'
  thin-wall grammar — wallN/wallW sets feed the meshes AND the collision,
  closed doors and furniture are props). Peers are the REAL hazmat bodies —
  `makeAvatar`/`tickAvatar`/`setAvatarEquip` straight from backrooms/world,
  exactly as the casino hall imports them — with suit recolors, travel-
  driven locomotion, and TORCHES THAT THROW LIGHT (the PeerAvatar's own
  shadowed spotlight). The flashlight is live: F toggles a carried torch,
  the local beam uses the backrooms' exact SpotLight params, and the
  `equip` wire frame (validated against the CARRIED bag, persisted so a
  newcomer sees torches already burning) uses the backrooms' own
  "flashlight!" grammar. Sterling's counter and the bag wear Josh's gear-
  store renders (bottle.webp IS almond water). test_escape_key grew to 37.
  **E2c SHIPPED same day — the uniformity debt is PAID**: proximity voice
  inside the complex (`/api/escape/voice-token`, the floor's route shape
  verbatim with its own LiveKit room "escape_room"; `joinProximityVoice`
  from backrooms/voicechat; walls counted through the REAL wall sets via
  `er-world.wallsBetween`, closed doors muffling like walls) with THE
  WALKIE keyed on G — the backrooms radio path, distance defeated, heard
  only by other walkie CARRIERS. Almond water drinks on X (`consume` frame,
  guarded decrement server-side — one bottle, one swig). The first-person
  VIEWMODEL is mounted (makeViewmodel/tickViewmodel/placeViewmodel, the
  hall's scene-not-camera rule), the eye follows the body's own head
  (headDrop) with the hall's exact crouch-dip and headbob numbers, and THE
  SUIT CARRIES OVER — `solace_suit` written by the hall's picker, worn into
  the complex, validated server-side against the backrooms locker (unowned
  falls back to yellow; an owned chest colorway wears in). test_escape_key
  → 48. STILL OWED (small): the peer drink gesture on the `drink` frame,
  jump parity (nothing to mantle in a flat complex — deliberately parked),
  and E4 will move the torch HUD into the shared hotbar look.
- **E3** — the economy: chests + grants, chips + freePulls (+ the two
  escrow columns and house-game spending), skins + Voss discovery,
  notifications, tripwire + report line. Money harness (the hardest one).
  **E3a SHIPPED 2026-08-13 — THE MINT ITSELF**: `src/casino/escape-loot.ts`
  (pure tables + node:crypto rolls — the one place floor randomness MINTS,
  so the Phase-34 crypto rule applies with both hands; analytic + empirical
  EV pinned at ~164), `store.erOpenChest` (allowance FIRST and free on
  refusal, grant + count in one txn, each kind on exactly one balance, a
  skin as a real backrooms suit row — which is the uniformity law working:
  same suit system, same picker, every mode), chest bodies in the zone
  (five, distinct labeled rooms, contents rolled AT OPEN per opener,
  recipient-scoped loot frames, respawn 4-8min elsewhere, an exhausted
  player's refusal leaves the chest standing), `economyTotals` counting
  chips + freePulls from day one, the five skin colorways in suitcolor.ts
  (filter-fallback looks, no new art), chest meshes + the tier-coloured
  loot toast client-side. `test_escape_chests.mjs` (54).
  **E3b SHIPPED 2026-08-13 — THE SPENDING**: `spendCoinsChipsFirst` (plain
  statements, the killUser no-nesting rule; the silver guard runs before
  any mutation) drives blackjack bets/double-downs, roulette bets, and
  slots — where a FREE PULL consumes first and tithes nothing. THE
  CONVERTER RULE is enforced at every return path: unplayed bj refunds,
  both games' boot crash refunds, and the DEAD player's escrow sweep all
  read the row's chips split and return chips AS CHIPS; settlements pay
  silver, the intended lossy conversion through the house edge. Migration
  71 (`er_mint` day ledger, bumped in the grant txn) feeds a HEALTH CHECK
  (red at `ER_MINT_TRIPWIRE` 25k silver-eq/day — Sterling escalates red
  checks already) and the weekly report's new mint-by-day line;
  `economyTotals` chips/freePulls ride the report too. Slots' cabinet
  shows FREE/CHIPS on the LED and the pull gate counts them. The "Voss
  shelf" resolved to ALREADY DONE: skins are granted as real backrooms
  locker suits, and every picker (backrooms loadout, casino floor, ER
  enter) reads locker rows — pulled once, listed everywhere, never
  sellable by construction. `test_escape_spend.mjs` (37); the slots-odds
  stub learned the new payment methods (holding zero, so the odds math is
  unchanged by construction).
- **E4** — THE HUNT: lighting state machine, alarm/chase audio, open
  blocks, door locks, monster AI + kill + pass revocation + shutter.
  **SHIPPED 2026-08-13.** Server (escape-zone.ts): the four-phase machine
  (calm {2,4,6,8}min → telegraph 15s → hunt {1,2,3}min → retreat, every
  clock env-dialable), PARKED while the zone is empty (the jukebox rule —
  deadlines freeze on the last leave, thaw on the first enter); block
  letters gate door-OPENING only (being behind a shut door is safe
  regardless — the letters decide where safety can still be REACHED);
  entry refuses `lockdown` for the whole red phase while the keyed exit
  keeps working; the monster is a BFS chase brain over the zone's own
  hall/room/den grid (the layout harness pins halls + dens
  literal-for-literal now), omniscient, targeting the nearest UNSAFE body
  at 2× sprint (5.7 cells/s), lurking at the nearest shut door when
  everyone hides, killing on contact through the E2 kill path (pass
  revoked, bag wiped, key reset announced, the room told who was taken),
  and retreating home — still lethal — before the lights restore.
  Client: hall fixtures die while ROOMS STAY LIT (the light pool filters
  to room sources), a dozen emergency reds strobe down the corridors, the
  chosen den's shutter glides up (the tell), the E0 alarm + chase loops
  run their phases, the parasite-zombie walks its wire positions with
  idle/run crossfades, and the HUD carries the lockdown/hunt/retreat
  banners + a red kill flash. `test_escape_hunt.mjs` (19, real wire);
  layout harness → 171.
- **E5 ✅ SHIPPED 2026-08-13 — THE FEATURE IS COMPLETE.** The admin P-MENU
  (Josh's ask): P inside the complex opens HOUSE CONTROLS — start/end a
  hunt, reset the key, spawn a chest, freeze the monster, dump the zone
  state, teleports — every op a `debug` wire frame the SERVER gates on the
  admin flag (a member gets `not_admin`; the harness proves both ways).
  The P-bind collides with nothing: the backrooms geometry probe lives in
  its own view. HowTo's Casino page gains the full Escape Room entry in
  the house voice. Hunt harness → 23; the whole escape suite rides
  `npm run checks` with every count enforced.

**THE GAME LOOP, COMPLETE**: stake a rare → tool up at Sterling's → enter →
loot the capped mint → survive the hunts behind shut doors → find the key →
open the exit for everyone → RUN. Die and the pass dies with you; the
account never hears about it.

**POST-SHIP FIXES (2026-08-14, Josh's first real session)**: (1) THE
LOCKOUT — a hunt running when the last body left parked the machine
mid-red-phase, and since the entry gate refuses newcomers during the
alarms, the complex locked FOREVER (Josh was the first person locked out).
A red phase does not survive an empty zone now; an act with no audience
ends. (2) Every wire refusal is SURFACED — a swallowed denial reads as a
broken door. (3) JUMP (the hall's exact 4.6/12 ballistics + landing step)
and (4) FOOTSTEPS — Josh's walking-on-wood recording through the SAME
onset-sliced makeStepBank machinery as the casino's carpet, local strides
and peers' feet faded over 16m. (5) THE MAP V2 (see the complex section).
Still owed, small: the peer drink gesture, monster kill sfx polish, and
any tuning the first real nights demand (the dials + tripwire wait in
CHESTS).

## Invariants

- The Wheel remains the sole EMOJI faucet; the ER mints no emoji, ever.
- The chest mint is the ONLY silver mint outside the Trader, it is
  allowance-capped, and its dials + tripwire live in this doc.
- Chips/freePulls are private, unsellable, untradeable, and refuse every
  surface not named here.
- Recipient-scoped secrecy: chest results, balances, held keys.
- The gun cannot cross the threshold. The pass burns only on ER death.
- One appearance, every observer — skins ride the existing suit wire.
- The mouse stays in the window; every 3D rule the floor obeys, this obeys.

## Resolved with Josh (2026-08-13, his numbered notes)

1. **No extras on the death cost** — "just do what i want": the stake burn
   is the whole price; no voiding of remaining daily opens.
2. **Key-holder death = key resets + everyone inside is told** (replaces
   drop-where-fallen). The 10-min crumble stands alongside it.
3. **Hunt gaps {2,4,6,8}** — went with Claude's balancing rec.
4. **Chips = house-games-only** — confirmed.
5. **Almond water = instant sober** — confirmed.
6. **B13 drawn twice → B14** — confirmed.
7. **Skins strictly per-player** — no global discovery (see SKINS).
8. **THREE shutter dens, random per hunt** — added to the brief mid-build.

Still standing: the economy dials (10 opens/day, 25k tripwire) are Claude's
numbers under "make sure it doesn't break the casino" — retune order in the
CHESTS section. The extraction variant (loot banks only on exit) remains
REJECTED for v1, noted as the strongest lever if the mint runs hot.

**POLISH ROUND 2 (2026-08-14, Josh's list — commit e8b3244):**
- **THE GEAR IS THE BACKROOMS' GEAR, verbatim (the uniformity law, validated):**
  5-slot hotbar (same markup/CSS/store art), Digit1-5 + wheel select, LMB
  uses (torch click-toggles, bottle drinks server-confirmed), hold-V PTT
  with squelches, attachToHand held models on the camera with the
  backrooms' HELD_POSE rows + armIK(0.75); equip wire speaks the
  backrooms "kind!" grammar (server maps almondwater→almond, bag-gated).
  F/G/X are GONE. If the backrooms gains a mechanic, port it, don't fork.
- **LIGHT:** CEIL_M 4.2; halls hang the CASINO's props-pack pendant
  (atlas-dressed, instanced), rooms hang Josh's ceiling fan
  (ceiling_fan.glb, 52-inch, warm cage bulb). RED PHASE: ambient 0.12,
  room pool lights clamp to 4.4m throw (no bleed through walls) — the
  wall beacons are the halls' only light. Alarm beacons at 0.5 scale,
  mounted flush (half-depth embed off the baked bottom-centre origin).
- **DOORS are physical**: leaf collider tracks open/closed state (never
  an invisible wall). **The leaf is PROCEDURAL since Aug 2026** (walnut
  slab + recessed panels + brass knob, built in er-world) — door.glb was a
  three-door Sketchfab diorama whose full-height wood surface was the
  FRAME, so the whole framed assembly swung as one slab, proud of the
  wall (Josh's placement snip). A green EXIT door stands in the stub's
  south wall (mesh-only carve — the wall stays in the collision sets; the
  exit remains a teleport threshold).
- **MONSTER SENSES (amended Aug 2026):** hidden from it only behind a
  SHUT door — a room with the door OPEN is in its line of sight, and it
  walks in through the doorway (the first cut made ANY room invisible,
  so it never had a reason to path through an open door and read as
  broken pathfinding). Nobody known → it prowls hallCells (Math.random
  pacing only). A body in the SAME room as the monster is known whatever
  the door says — a shut door hides you from the halls, not from the
  thing already inside.
- **THE KILL HONOURS THE SAME WALLS THE WALK DOES (amended Aug 2026,
  day two):** the sweep used raw distance with no wall check, so the
  sprint past an open-door room's corridor wall killed THROUGH the wall
  before the monster ever reached the doorway — Josh: "when the hunt
  starts and I'm in a room with the door open I just die." `canTake`
  (replacing `isSafe`) allows a kill only from the same region or across
  the open doorway edge itself (monPassable); a shut door still blocks,
  and a monster already inside the room kills regardless of the door.
  Paired fix: the walk re-validates each waypoint against monPassable —
  a door shut mid-chase drops the stale path instead of the monster
  GHOSTING through the shut door on old waypoints. The hunt harness pins
  the kill position: at the bad hider's death the monster must stand in
  the room or its doorway, never beyond a wall.
- **THE AUG 2026 REVIEW HARDENING** (all server-enforced): the ante's
  counter + locker routes refuse a body currently INSIDE the complex
  (409 `inside`) — they were plain HTTP and a dying player could stash
  the whole bag mid-hunt, defeating the death asymmetry; the locker
  refuses the KEY (a lockered key was an immortal phantom); re-`enter`
  on the same socket and a refresh-replacement both keep the body where
  it stood (a fresh seat at ER_ENTRY was a free mid-chase teleport); the
  admin P-menu refuses `hunt-start` over an EMPTY zone (it re-created
  the production forever-lockout); the hunt clock boots PARKED (a quiet
  boot used to greet its first visitor with an instant telegraph); the
  Inheritance (`sealGrave`, which `sealCell` funnels through) and the
  admin scrub end the pass and wipe the carried bag — a new life
  re-stakes, exactly as this document always said; and the client's
  socket-death path runs the same full ante reseat as dying does (voice
  off, alarms off, key/exit chrome cleared).
- **A DEN'S MOUTH IS ITS SHUTTER** (the follow-up round): shutter down =
  a solid, VISIBLE roll door; shutter up = a genuinely open hole you may
  walk through — the old collision fallback read dens as permanently
  shut invisible doors, the exact invisible-wall rule this project bans.
  Entering the open den is legal and unwise: den cells never hide
  anyone, the monster spawns and retreats there, and its kill rules
  apply in full. Voice muffling reads the same shutter state.
- bakeModel/bakeParts in er-world are THE way to place any loaded model
  here: plain static meshes at bind pose (a cloned SkinnedMesh renders at
  its orphan skeleton, not its matrix — the "no doors" root cause).
