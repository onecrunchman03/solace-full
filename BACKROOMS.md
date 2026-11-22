# SolaceBackrooms — the post-1.0 project

A co-op first-person Backrooms explorer. **A separate downloadable app** (like
the desktop shell), with **the Solace server as the world authority**: it
hosts the level, tracks every player, adjudicates deaths, and runs the
economy. Downloaded from a new **Backrooms rail section** in Solace, directly
below Emoji Rumble.

Design locked with Josh, July 2026. Look/feel benchmark: **the Kane Pixels
Backrooms — the YouTube found-footage series and the A24 movie** (revised
from the earlier "Escape the Backrooms" reference). Build order: logic →
looks → sounds.

## The aesthetic (Kane Pixels)

**Default view: CLEAN first-person POV** (Josh's call — you're there in the
room, not watching a tape). **The camcorder is EQUIPMENT** (Josh, round 6):
an item you buy, carry, and RAISE to film — and footage of entities sells to
ASYNC. Filming is the game's core risk/reward verb: the thing you document is
the thing hunting you.

- **The camera item**: raising it switches to the found-footage view (the
  full post stack + viewfinder HUD — grain, REC dot, timestamp, battery).
  Lowering it returns to clean POV. Battery/tape are real constraints (gear
  tiers: better zoom, longer battery, IR/night mode on the high tier).
- **Footage value** scored server-side by what the tape actually contains:
  entity type/rarity, proximity, framing, duration held — plus a large
  **first-ever-documented bonus** (the first player to film a given entity
  gets the discovery payout; Voss names the specimen record after them).
- **Tapes are loot**: footage lives on the tape in your kit — die and the
  tape drops with your corpse. Anyone who finds it can sell YOUR footage —
  or walk it back out to you. (The "deaths on tape" artifact for the Solace
  side falls out of this for free.)
- **Filming costs awareness**: the viewfinder narrows your field of view and
  attention — the person filming needs friends watching the exits. Co-op
  pressure by design.
- **Economy (SUPERSEDED Sep 2026 — see THE ASYNC GRANT below).** It used to
  read: ASYNC pays for footage in **Research Credit (RC)**, a Threshold-4-only
  balance, never minted silver, so footage → RC → better kit → deeper runs →
  rarer footage was a CLOSED progression loop. Josh replaced the currency with
  SILVER ("lets remove the research credits and have the backrooms use
  silver"); the closure it was providing is now provided by a funded budget
  instead, which is the only reason the change is safe.

- **The camcorder mode** brings the full found-footage stack when switched
  on: heavy grain, chromatic aberration, slight barrel distortion, interlace
  shimmer, auto-exposure blooming when fluorescents enter frame, occasional
  focus hunting, handheld sway. All Three.js post-processing. Because clean
  POV is the default, the ENVIRONMENT itself must carry the look without the
  grain's forgiveness — materials/lighting quality matters at full clarity,
  and the look-test gate judges the CLEAN view first, camcorder second.
- **Bright horror, not dark horror**: distance dissolves into glowing
  yellow-green HAZE (fog toward light, never toward black). Flashlights
  matter in anomalous dark zones, not everywhere.
- **Palette/materials**: muted hazy yellow with a greenish fluorescent cast
  (not saturated game-yellow), moist commercial carpet, two-tone striped
  wallpaper, irregular water-stained drop ceiling, panels at inconsistent
  color temperatures — some flickering, some dead.
- **The world is a place, not a wallpaper**: Kane's Level 0 bleeds into
  unfinished zones — bare concrete, studwork, plastic sheeting, scaffolding,
  abandoned Async equipment. Maps onto our district system as a future
  `facility` district type + Async props (Threshold-4 gains an in-world
  presence). The lore convergence is exact: **Async Research is the series'
  own organization** — Dr. Voss, the hazmat gear, and the "field program"
  framing are already canon-shaped.
- **The viewfinder HUD (REC dot, timestamp, battery) exists only while the
  camera item is raised** — clean POV gets minimal, non-diegetic HUD.
- The look-test gate now judges against **paused frames of the series/movie**.

## The locked design

- **Stack: Three.js + TypeScript + Tauri v2** (`game/`). Chosen over
  Unity/Godot because: the world is procedural (no scene editor needed), the
  server coupling reuses Solace's auth/ws/types verbatim, distribution reuses
  the existing signed Tauri pipeline, and — decisively — **proximity voice
  rides LiveKit's mature JS SDK** (Godot has no VOIP; hand-rolled voice lacks
  echo cancellation). Safety rails: a **look-test gate per level** (stand the
  render next to the reference and judge honestly — Level 0 now, the
  Poolrooms later), and the server stays engine-agnostic so the client could
  port without losing the world.
- **One shared world.** The four lobbies are **doors, not instances** — four
  far-apart entry points into the same live Level 0. Hard cap 16 inside.
- **The map is generated ONCE and permanent.** Seeded, deterministic,
  regenerable chunk-by-chunk — only mutations persist (fog, spray paint,
  loot, corpses). Spray-paint marks last forever. Expansion adds NEW sectors
  beyond the frontier with their own seeds; explored space never reshuffles.
  A shipped seed's generator code is frozen — never edit, only add.
- **The Solace-side Backrooms section**: download links, the community main
  map (everything anyone explored is revealed, the rest black; landmarks +
  death markers, **no live positions**), lobby status.
- **Voice**: entering the game force-disconnects Solace voice; in-game comms
  are open-mic proximity (3D-spatialized, strangers audible). Walkie-talkie
  items extend range with a radio filter.
- **The Tarkov loop**: gear lives in a persistent locker; you equip a loadout
  to enter; **death drops everything where you fell** (recoverable by anyone,
  including your next run); extraction (walk out any door) banks your finds.
- **Economy** (respects the sole-faucet doctrine): emojis buy gear from ASYNC
  (a real emoji SINK — burned). **Relics/artifacts** are the reward class — a
  hidden catalog (players never learn how many exist), never on the Wheel.
  Relics → silver **only via the player market** (auction/trade); relics →
  ASYNC is **barter for gear/upgrades** (no minted silver, no second faucet).
### THE ASYNC GRANT — silver, without a second faucet (Sep 2026, migration 99)

Research Credit was closed ON PURPOSE, and the closure was load-bearing: it is
why footage could pay 400 for a walk in the dark without anyone checking the
arithmetic. Point those payouts at `users.coins` and the backrooms becomes a
SECOND FAUCET, uncapped by the Wheel — the one invariant the whole economy
rests on. So silver reaches Threshold-4 through a **funded pool**:

    wallets + escrows + goblin vault + ASYNC GRANT = constant

Turn-ins DRAW from Async's budget; purchases at the counter RETURN to it. It is
the goblin vault's shape exactly (src/lender.ts), and it is proven. Nothing
mints. Rules in `src/backrooms/grant.ts`.

- **THE CASINO REFILLS IT.** `GRANT_TITHE` (25%) of each house-edge game's net
  take funds Async instead of burning, alongside the lottery's `HOUSE_TITHE`
  (10%) — the remaining 65% still burns, so the games stay hard sinks. Both
  shares are REDISTRIBUTIONS, never mints, the same mechanism `lottery_boosts`
  has used since July 2026. **`Store.houseEdgeTake` is the one place the split
  is written**; four settle sites calling it is four chances for a copy to
  drift, and the drift would be invisible (every term still conserves, the
  proportions just quietly stop matching this paragraph).
- **The lore is arithmetically true.** Foundry hosts Async because Foundry's
  R&D eats what Async brings back, and pays for it out of the floor's own
  losses. The patrons losing at the tables literally fund the expedition.
- **A DRY BUDGET REFUSES IN FULL.** `grantCovers` is all-or-nothing: a partial
  payout reads as a bug and leaves a half-sold relic, while a clean refusal
  leaves the finding WHOLE in the locker — to bank, to auction to another
  player, or to bring back when Foundry disburses. `GRANT_SEED` is 250,000,
  entering the world exactly once (the vault's precedent); prod carried 80,318
  silver and burned ~4,900/day when this shipped, so the budget is ~3× the
  money supply and WILL visibly deplete. That is the mechanic, not a bug.
- **CONVERSION WAS AT PAR**, paid out of the grant so the seed is the only
  mint. Any multiplier would have been a stealth rebalance of a loop nobody
  asked to have rebalanced. **The admin's 993,430 of test-lever RC did not
  convert** — twelve times the entire money supply.
- **VOSS DOES NOT BUY EQUIPMENT**, and this closed a live exploit the switch
  would have detonated. The Standard Kit cost ONE RARE EMOJI and handed over
  500 of gear, repeatably (the only gate was locker space), and gear bought
  back at half — so a rare worth 200 at Sterling's counter converted to 250 of
  house money, forever, since you could sell the gear to free the slot.
  Harmless while RC was closed; unbounded in silver. Both halves are shut: no
  resale (unwanted kit is DISCARDED, free, for nothing) and the starter kit is
  refused once you own a suit. The fix is also the in-character one — she is a
  field researcher, not a pawnbroker.
- **Her emoji counter is retired.** At 50/150 she was a strictly worse Trader
  than Sterling (200/2,500) the instant the two currencies became one.
- Harnesses: `test_async_grant.mjs` (55) and `check_mig99.mjs` (16).

### THE DESCENT — ten levels, one door each (Josh, Sep 2026)

**THE RULE, and it is the rule the game has always run on:** *"each room level
has the door to the next level. the menu in backrooms is just an easy way once
the door has been opened to jump each level. it was always one door from the
begining."* — Josh, Sep 2026, correcting a draft of this section that had made
the seam a **DIAL** you could tune to a destination. It is not. There is no
shortcut and there is no frequency that skips a floor.

The only way anybody reaches a new layer is by walking the layer above it,
finding the door, and opening it — exactly as **THE DOOR** and its key have
worked on Level 0 since the Poolrooms shipped. Nothing about that mechanism
changed; only the words around it did.

- **THE SEAM** is a hole in the wall of the casino's STORAGE WAREHOUSE, behind
  the pallet racking. Async did not make it; Async measured it and built a desk
  beside it. Nobody upstairs can say when it opened and nobody upstairs asked.
  **It opens onto Level 0 and it has never opened onto anything else.**
- **THE BOARD ON THE MAP SCREEN IS FAST TRAVEL, NOT A WAY IN.** A level can
  only stand open there once its door has been opened, and that is the whole of
  what Voss's frequency work buys: a layer whose door exists can be held steady
  enough to drop a surveyor straight at it. Her own Drive 001 has said since
  July 2026 that matter at a resonance point *"becomes probabilistically
  unanchored from its native spatial layer"* — that line pays off as the way
  BACK, not as a destination selector.
- **TEN, and the number is not decoration**: Pandora's Rusted Key has been
  hardcoded to ten levels and a hundred relics since it shipped
  (`RUSTED_LEVELS` in src/pandora.ts). The descent is the frame the endgame was
  already built against. The list lives in
  `client/src/components/Backrooms.svelte` (`LEVELS` — index == the level id
  the API takes and the number the player reads) and the count in `src/voss.ts`
  (`BACKROOMS_LEVELS`).
- **LEVEL 1 IS THE ONE THAT DOESN'T LINE UP WITH THE CANON, and that is canon
  too.** Ours is the Poolrooms; the wider mythos files them as **Level 37,
  "Sublimity"**. Doors have never run in numerical order — a door goes where
  the door goes — so the rail carries it as a note on the row rather than
  pretending the numbering means adjacency.
- **Threshold-4 is named for the fourth boundary zone she mapped** — a detail
  sitting unexplained in Drive 004 for two months, now said out loud.
- **The eight below carry their REAL canonical names** (the Backrooms canon's
  "Main Nine") rather than placeholders, so the road is legible before any of
  it is built: Pipe Dreams · Electrical Station · Abandoned Office · Terror
  Hotel · Lights Out · Thalassophobia · The Cave System · The Suburbs.
- **WHAT UNLOCKS THE NEXT LEVEL IS ALREADY DECIDED AND ALREADY BUILT: its
  door.** An earlier draft left this open ("calibration data from the band
  below") and Josh closed it. A third level ships with a door on the second,
  the way the second shipped with a door on the first.

### THE WAY DOWN, LEVEL BY LEVEL (Josh, Sep 29 2026)

*"validate level progression between the current levels make sure there is a
clear path forward for player to get to each level. level 0 is find key to
door. level 1 is find key to door, level 2 is find 3 fuses for fuse box"* —
and when this was checked, only the first of the three existed. Level 1 had
no key and no door (`LEVEL2_FLAG` was declared, "not built yet", and nothing
set it), so Pipe Dreams was unreachable to every player; Pipe Dreams' fuse
panel was a drawn piece with nothing behind it.

- **LEVEL 0 → 1: THE KEY and THE DOOR**, unchanged. The door is the deepest
  floor from The Entrance; the key lies in the landmark farthest from it. Once
  the door is open the key stops showing (it used to keep streaming as
  "findable" while refusing to be picked up).
- **LEVEL 1 → 2: THE POOLROOMS' KEY and THE DRAIN HATCH.** Pipe Dreams has
  always arrived through a hatch in its ceiling (The Drain), so the Poolrooms'
  door is a drain hatch in the FLOOR: a red ring round an iron grate at the
  deepest DRY floor from The Landing (`doorSite`/`keySite` take an `ok`
  filter now; the Poolrooms pass `!wetFloor`), its key on dry floor in the
  named hall farthest from it. Level 0's rules exactly — one key, no slot,
  never lost, a body keeps it, a rot sends it home — because the key machinery
  is now ONE per-level mechanism (`keyHolder[level]`), not a copy. Opening it
  sets `LEVEL2_FLAG` for everyone (Sterling announces it, the hub's rail opens
  Pipe Dreams to members); dropping through it lands you at The Drain. A key
  never leaves its level: through any door it goes home.
- **LEVEL 2 → 3: THREE FUSES and THE FUSE BOX.** Three fuses (`fuseSites` —
  farthest-point sampling over the far half of the plant from The Drain, never
  on a stair) are carried like the key (no slot, home if you leave, on the body
  if you die) to the fuse panel beside the pressure door in the Valve Gallery.
  Each one put in is a world flag of its own (`level3_fuse_<n>`) — in once, in
  forever — so three runners can each bring one. All three set `LEVEL3_FLAG`
  and the pressure door opens; walking through it answers "not built" until
  Level 3 exists. A test run can carry fuses or a key to their door, never
  put them in for real.
- Harness `test_progression.mjs` walks the whole chain.

- **Dr. Ada Voss** — ASYNC field researcher, station **Threshold-4**. Lab
  coat over a patched hazmat suit, taped glasses, clinical deadpan that
  cracks ("Retrieval rate this quarter: 74%. The remaining 26% are… data.").
  Trades equipment, consumables, and gear tiers (flashlight lvl 1→3).
- **Account death is DEFERRED** — later, only as informed-consent secret
  content (a hidden tunnel, an unknown enemy), never the default stakes.

## Architecture

- `src/backrooms/worldgen.ts` — the seeded generator. Thin-wall grid (cells
  2m; wallN/wallW bits + solid), BSP districts of five types (classic /
  pillars / offices / warrens / halls), stamped hand-authored landmarks,
  four edge doors, and a **guaranteed-connectivity pass** (every walkable
  cell reachable from every door — validated, not hoped).
- `scripts/render-sector.mjs` — zero-dep PNG renders (map + depth heat) for
  map review; `docs/backrooms/` holds the current candidates.
- Scratchpad `test_worldgen.mjs` — 92 asserts across 10 seeds: determinism,
  100% reachability, walkable/dead-end/depth/landmark-spacing/variety bands.
- `game/` — the SolaceBackrooms client (Svelte 5 shell + Three.js world
  later; Tauri packaging in B2). Dev: `cd game && npm run dev` (port 5175,
  proxies /api + /ws to the local backend). Screens: Title → Login (real
  Solace auth incl. the new-network secret challenge) → the four-door menu.

### PASSES 6 + 7, AND THE MANTLE (Josh, 2026-07-28 round 2)
Josh got stuck in a hollow and told me to **recalibrate how the map is judged**.
He was right: passes 1–5 all asked whether a cell is REACHABLE FROM a door.
In a world with one-way drops that is a different question from whether you can
get BACK, and only the second one is about being trapped.

- **PASS 6 — ESCAPE.** Every reachable non-pit cell must walk **back** to a
  door, measured **walk-only (one step up, never the mantle)** — a map that
  needs a jump to leave is a map that traps whoever mistimes it. Run a second
  time with **furniture treated as walls**, since props are solid now.
- **PASS 7 — NO VISIBLE HOLE.** Models the renderer's sealing rules. It caught
  a real class of hole: a solid cell keeps whatever floor the terrain pass gave
  it, so a block drawn from its OWN floor up one room height tops out *under*
  the surface people walk on beside it. **50–194 eye-level holes per seed on
  five of six seeds** (the live seed happened to have none). Fixed in the
  renderer, not the data, so it holds for any future sector: `solidSpan` in
  geom.ts spans the union of the block and every open cell touching it.

**THE MANTLE.** `CLIMB_JUMP` = 2: while **airborne** you may climb two steps
(1.0m) instead of one, so waist-high ledges are things you hop onto rather than
invisible walls. `mods.climb` in the controller is raised by the game screen
while `jumpY > 0`; the server's `heightPassable` allows ≤2 either way so a
mantle never fights a correction frame. **The generator still uses
`heightWalkable` (≤1)** — the world must be traversable and escapable by
someone who never jumps at all. Never relax that.

Also this round: fog pushed from 8–44m to **14–78m** so the big rooms read as
big.

**The carpet stays PROCEDURAL.** A photographed ambientCG set was tried and
**reverted on Josh's call** — the drawn pile is the look he wants. What fixed
his "grid of squares" was not the photo: it was giving the loops **full-cell
jitter** (at ±1.5px on a 5px pitch they still remembered their lattice) and
moving the tile from **1m to 2m**, since a metre is close enough to notice the
same clump repeating. Don't re-introduce a downloaded floor texture without
asking.

**HALF THE DROP FACES WERE NEVER DRAWN** — the bug the probe caught, and the
one behind every "missing texture" screenshot since verticality shipped. The
riser pass walks each cell's **east and south** edges (the standard way to visit
every boundary once) and drew a face only when the CURRENT cell was the higher
one, treating the other case as "the neighbour's job". It never was: the
neighbour also only looks east and south, so it never looks back. **Every
west-facing and north-facing drop in Level 0 had no face at all** and you could
see straight through the world. Now whichever side is higher owns the top of the
face and it is wound to look at the lower side — `riserQuad`'s `towardPositive`
flag, with all four combinations pinned in `test_winding.mjs` (61 asserts).

**ADMIN GEOMETRY PROBE — press B** (admins, in game). Casts down the crosshair
and names what it hits: `cell x,y floor n · LOOKING AT: floor/wall/riser/
ceiling @ x,y … 4.2m`, or **`NOTHING — no geometry (a hole)`**. Three rounds
were spent inferring dark patches from screenshots; this reports what the
renderer actually put there, with the cell number, so a hole can be dumped and
fixed instead of guessed at. Meshes are named (`floor`/`wall`/`riser`/
`ceiling`/`trim`) for exactly this.

### THE LIGHTING PASS (2026-07-30 — "make the lighting more realistic")
Four layers, in the order they should be understood:

1. **Occlusion is IN THE BAKE** (`world.ts` buildChunk `occlusionTo`): every
   fixture's contribution to the per-vertex field is gated by the same
   `wallsBetween` walk the acoustics use — 1 wall lets 8% through (reads as
   bounce bleed), 2 kill it. Cached per (quarter-cell, fixture) so a chunk
   does thousands of walks, not millions. Light no longer passes through
   drywall; doorways throw real spills; fixture-less rooms go properly dark.
2. **Walls are DIRECTIONAL** (`lightAt(sx, sz, nx, nz)`): wrapped-lambert on
   the vertex normal — a wall's fixture side lifts, its back face keeps only
   the 0.26 wrap floor. Verified live: 85% of opposite-face vertex pairs
   split lit/shadow, peak 1.19 vs 0.89. Floors/ceilings stay omni (normals
   vertical → the nx=nz=0 fallback).
3. **The entity's tell is PANEL FLICKER** (`tickEntityFlicker` in world.ts —
   the darkness aura it replaced was CUT 2026-07-31, Josh: "it should only
   make the lights around it flicker"). Fixtures within 9m stutter and sag
   (to ~6-13%), per-panel irregular chatter deepening with proximity, via
   per-INSTANCE colors on the panel InstancedMesh — they MULTIPLY the shared
   material's color, so brownouts compose for free, and no instanceColor
   buffer exists until a chunk's panels first flicker. Call it AFTER
   tickFlickers (which rewrites the cloned flicker-panel mats each frame).
   The no-positional-lights doctrine is absolute again.
4. **BROWNOUTS are SERVER-CALLED** (`service.ts` — every 8–18min while
   anyone's inside, 12–28s, `BACKROOMS_BROWNOUT_GAP_*_MS` to dial): one
   sector-wide `brownout` frame (+ `brownoutMs` on welcome for late joiners);
   the client (`setPowerLevel` in world.ts + the envelope in BackroomsGame)
   plays dying stutter → dark simmer → fluorescent re-strike. **The dark-end
   floors are tuned against the sRGB output transform** — linear 0.29 still
   *displays* at 57%, which is why they sit at 0.02–0.08; don't "fix" them
   upward without a screenshot. Admin lever:
   `POST /api/admin/backrooms/brownout {ms}`. Purely atmosphere — no rules
   change in the dark.

### GRAPHICS SETTINGS (2026-07-31 — "get the most out of their GPU")
Pause menu → VIDEO. All per-machine (`brSettings.gfxPreset`/`renderScale`).
- **Presets** (GFX table in BackroomsGame): low = no bloom/no atmosphere
  filter/512 shadow/no MSAA · medium = full look, no MSAA · high (default) =
  4× MSAA · ultra = 8× MSAA + 2048 shadow. **MSAA lives on the composer's
  render targets** — the WebGLRenderer `antialias` flag does NOTHING once
  rendering goes through EffectComposer (the game had shipped with no real
  AA; found and fixed here). Changing `.samples` requires `rt.dispose()`.
- **Render scale** 50–200% multiplies the device pixel ratio (200% =
  supersampling). **0 = AUTO**: a governor in the frame loop EMAs the raw
  frame interval and steps the scale 0.5–1.0 (never above native) to hold
  ~60fps — one step per 2s, background-tab stalls excluded from the EMA.
- The renderer requests `powerPreference: "high-performance"` (dual-GPU
  laptops otherwise may get the integrated chip).
- The VIDEO tab shows live fps / frame ms / internal resolution (gfxView,
  pushed 2Hz from the loop).

### THE ENTITY, ROUND 5 (2026-07-31 — upright, grounded, grabbing)
Josh's spec, now enforced end to end: **somewhat upright walking · chase =
same walk faster · arms reach toward the player in range · NO lunging,
tumbling, jumping, or ground-clipping.** What ships:
- **Only the UPRIGHT WINDOW of the capture plays**: `walkLoop` =
  AnimationUtils.subclip 5.85–7.85s (bench-measured: 94% upright, 9cm
  wobble, near-invisible seam). Wander 1.35× · chase 1.9× · kill 2.3× —
  the airborne jumpscare lunge is GONE; the grab at point-blank is the kill.
- **THE ACCUMULATION RULE (hard-won, three rounds of whack-a-mole): every
  frame, reset ALL bones to a baseline snapshot (`entRest`) BEFORE
  `entMixer.update`, then apply shimmer/grab fresh.** Any bone the mixer
  doesn't rewrite each frame accumulates the procedural multiplies forever
  — and "which bones does the mixer own" is UNKNOWABLE from track names:
  subclip drops keyless tracks, and the skeleton has DUPLICATE bone names
  (the mixer binds only the first instance; duplicates drift — proven live
  by Bone036_013's drift-snap-drift trajectory). Classify nothing; reset
  everything. Also: the walk loop is baked SEAMLESS at load (every track
  gets an end key equal to its first key + a smoothstepped 350ms tail
  blend), and the entity renders on a 170ms SNAPSHOT INTERPOLATION buffer
  (direct-lerping 10Hz server frames caused a surge-stall cycle and
  backward drags) with shortest-arc eased heading.
- **The grab is BOUNDED**: bones at depth 3–8 only, 0.09 rad each (~31°
  total), aim direction damped, faded out inside 0.9m (at point-blank the
  raw direction flips sign every frame and whipped the limbs).
- **The shimmer fades with depth** (÷(1+depth·0.12)) — flat amplitude
  compounded down 15-bone chains into metre-scale tip pumping.
- Floor pin unchanged (lowest bone rides +0.12m, both directions, RAW).
  Verified live: body height 2.2–2.9m over 8s, pin variance zero.
- **Chase loop is the Howler mp3** (`/assets/entity/chase.mp3` — new
  filename on purpose, the old scream.mp3 URL caches for a day).

### HANDOFF — the player body, the entity, and the bench (2026-07-29)
Written at the end of a long session. Read this before touching the
first-person body or either model.

**THE ANIMATION BENCH is the tool for all of this.** Four rounds were wasted
guessing at "it's static" / "I can't see it" from screenshots; the bench answers
those in minutes and can be driven headlessly, so a fix can be SEEN before it
ships.
```
node scripts/serve-root.mjs 8791
# → http://127.0.0.1:8791/scripts/animview.html?model=<url>
#   params: anims=a.fbx,b.fbx  clip=  rate=  t=  wave=  fp=1  pitch=  fov=
#   window.bench.trackAudit()      do a clip's tracks bind to this rig?
#   window.bench.motionBetween(a,b) does it actually MOVE? (bone world deltas)
```
It loads GLB **and** FBX-with-external-clips, drops stray scene meshes by median
distance, and scales from BONES (see below). `scripts/shrink-glb.mjs` re-encodes
GLB textures with ffmpeg — it took the held props from 75MB to 5.4MB.

**THE FIRST-PERSON BODY** (`makeViewmodel`/`placeViewmodel`/`tickViewmodel` in
world.ts). It is a real body, not a shooter viewmodel: it lives in the SCENE and
follows the camera's position and YAW only. Pitch goes into the neck and chest,
never the whole body — parenting it to the camera made it inherit pitch and tip
like a turret. The eye height is measured off the real head bone every frame
(`headDrop`), so it syncs to every clip including crouch. Neck + head bones
(`DEF-spine004`, `DEF-spine006`) are collapsed each frame so you never see your
own mask; the clips animate scale, so this MUST be re-applied after the mixer.
Tuning: `VM_LEAN` 0.55 (how far the chest follows your gaze), `VM_BACK` 0.02,
`VM_LIFT` −0.06.

**HELD ITEMS** ride the CAMERA, not the hand bone — the spec is view-relative
("by the side", "to the ear", "aims where the cursor aims") and a hand bone
swings with the walk cycle. `HELD_POSE` has a stowed and an active pose per item
and eases between them; `HELD_TILT` is per item and deliberately NOT inferred
(measuring the long axis and aligning it was wrong for 4 of 6 — a walkie and a
pill bottle should stand upright, not point down the view). The camera item
scope-snaps: past 82% of the lift the model hides and the viewfinder HUD takes
the screen.

**THE ENTITY** has no locomotion clip at all — measured, its one moving clip
(`bendingOverScene`, 9.3s) travels 12 radians across 91 joints, about 8° each,
and `stalkingpose` is 0.00s. So its movement is code: a whole-body gait (roll and
lean, deliberately almost no vertical — `Math.abs(sin)` was the "bouncing"
Josh saw) plus a travelling wave down every bone chain by DEPTH, since the bones
are generically named. Delete both layers if a model with a real crawl arrives;
the loader already picks clips by measured duration, not by name.

**ROUND 2 (2026-07-29, the next session): everything on the open list SHIPPED,
and the whole handoff was verified IN PLAY** — Playwright drove the real dev
client (login → locker → door → world), with a second registered account on the
127.0.0.1 origin so two live players could see each other. Screenshot-verified:
the eye height, the lean, all five prop poses, the scope snap, peer crouch and
peer jump from another player's eyes.

- **THE BLACK BODY (found by playing, fixed in suitcolor.ts).** The first-person
  body rendered PITCH BLACK — every lit material did, while MeshBasic worked.
  Cause: `suitCanvas` created a 512×512 blank canvas and RESIZED it to the
  artwork's 256×256 inside paint(); a THREE.CanvasTexture uploaded before the
  decode allocates immutable GPU storage (texStorage2D) at 512, so every later
  upload filled only the top-left quarter and the suit's UVs sampled the
  never-written black region. The canvas is now FIXED-SIZE forever (the artwork
  draws scaled, smoothing off — pixel-identical under NearestFilter), and the
  cache stores the READY promise so a second caller can't grab a blank canvas
  with an instantly-resolved ready. If a model ever renders black again: lit vs
  MeshBasic first, then suspect the texture's GPU allocation, not the lights.
- **Right-click aims the camera** (BackroomsGame): hold RMB with the camera in
  hand = raise to the mask/scope view; left click = start/stop the tape. The
  raise follows `camAiming`, not `camRec` — recording keeps rolling from the
  hip. Contextmenu is suppressed while locked; blur/unlock/slot-change all drop
  the aim.
- **Peer crouch + jump ride the wire**: `move` gained `p` (0 stand · 1 crouch ·
  2 airborne — cosmetic, clamped server-side, stored on the session for intro
  frames, fanned out on pos). tickAvatar picks crouch-idle/crouch-walking/jump
  clips by pose; entering the air `reset()`s the jump action to
  `JUMP_CLIP_START` (0.35s, past the windup) because all actions run looped at
  weight 0 and would otherwise be joined mid-flip. The local viewmodel plays
  the same jump state.
- **Jump root motion is stripped AT LOAD** (loadHazmat): the clip is a running
  long jump translating X 42 / Y 50 / Z 67 units; every `.position` track keeps
  its first key's X/Z, keeping only the vertical arc (drift 0, hop 0.39m —
  measured on the bench before shipping).
- **Peers stand on THEIR floor now** — `onPos` was still setting `target.y = 0`
  from the flat-world era, burying anyone on a terrace; the frame loop
  re-samples `groundAt` under each peer so late-streaming chunks settle them.
- **bottle.glb SHIPPED as the Almond Water** (it IS a gear kind — the store
  image was always bottle.png): gltf-transform meshopt simplify + webp took it
  7.13MB → 0.75MB (116k → 15k verts; only EXT_texture_webp, which GLTFLoader
  reads natively — do NOT use its default meshopt compression, the game loader
  has no decoder). Carried IN VIEW low-right (the flashlight rule): a
  consumable has no use state to lift it into frame, and the model's top 10cm
  is its black cap + loop, so the stow rides high enough for the yellow body to
  clear a 72° frame. The `use` pose is authored but unreachable — a click
  consumes instantly and clears the slot; a real drink animation is a future
  design decision.

**ROUND 3 (2026-07-30): the mask is CUT OUT of the viewmodel mesh, and
down-pitch is clamped.** Josh could tip far enough to see inside his own body.
Two causes, two fixes:
- **The head-collapse trick itself was the artifact.** Scaling the neck+head
  bones to 0.0001 left every vertex PARTIALLY weighted to them stretched
  toward the collapse point — giant hood-lining polygons that swung into view
  past ~55° of down-look. Three rounds of relocating the collapse point
  (world -Y, bone-local -Y, anchored to mid-torso) each just moved the
  artifact. The structural fix: `NECK_CUT` in makeViewmodel DELETES every face
  whose three corners all carry >0.2 spine004+spine006 weight from the
  viewmodel's own geometry clone (806 → 558 faces; peers share the base
  geometry and keep their heads). No collapsed bones → no stretch, by
  construction — placeViewmodel's per-frame scale hack is gone, and the neck
  bones animate normally, which also keeps the eye-height measurement honest.
- **`PITCH_DOWN_MAX` = 1.22 rad (~70°)** in controller.ts: on foot the last
  few degrees of down-look only ever showed your own collar. Looking UP keeps
  1.45; the flycam keeps the full range (a noclip ghost has no body), and
  landing clamps a steeper flycam pitch back into the walking range.
- **A diagnostic trap that cost an hour, twice:** a frozen-grace peer body was
  standing EXACTLY at the door spawn, and screenshots of "my viewmodel
  artifacts" were actually the inside of posetester's corpse at 2cm. When a
  first-person artifact won't die, count the Body meshes near the camera
  before believing any screenshot.
Verified in play at every pitch (level, −0.7, −1.22, crouched −1.22): chest and
shoulders only; the mouse clamp stops at exactly −1.22.

**ROUND 4 (2026-07-30): every player animation audited and fixed.** Josh's
catch: crouching in place played the crouch-WALK. Two real defects, both found
by MEASURING (bench `trackAudit` + `motionBetween`, then bone probes on the
live game):
- The viewmodel only ever had ONE crouch action (crouch-walking) — it now
  splits crouchidle/crouchwalk on `player.moving`, same as peers.
- `JUMP_CLIP_START` was 0.35s — deep inside the clip's WINDUP (the root-Y
  curve: crouch until 0.64s, takeoff 0.72s, apex 1.04s, land 1.28s), so an
  in-game jump (~0.77s of air) spent its first half showing the character
  crouching down. Now 0.72 — the visible slice is rise → apex → land.
- **`crouch-idle.fbx` is a 0.03s SINGLE-FRAME POSE** (zero motion, measured) —
  it holds a proper crouch but never sways. Asset-level: re-exporting a real
  Mixamo "Crouching Idle" over that file will animate with no code change.
All six states then verified numerically on BOTH renderers (bone-motion
probes on the live viewmodel; a scripted /ws-game bot as the second player
for the peer side): idle sways, walk/run stride, crouch-idle holds at crouch
height, crouch-walk creeps low, jump leaps without the windup.
**Verification traps to remember:** a Vite HMR mid-session can leave an OLD
compiled placeViewmodel running against a NEW Viewmodel shape — the per-frame
TypeError kills rendering while screenshots keep showing the last good frame
(hard-reload before trusting anything); background browser tabs stop their
rAF loop AND `blur` wipes held keys, so a second live player must be driven
by a ws bot, not a background tab; and corpses are tagged avatars too — filter
`rotation.x` (lying flat) before probing "the peer".

**ROUND 5 (2026-07-30): THE HEAD PIN — the camera is now rigidly synchronized
with the model's head through every animation.** Measured per state, the head
bone drifted 0.10–0.24m forward and 0.20–0.88m vertically off the lens, worst
while crouched. Root cause: the body was ANCHORED TO THE CAMERA, so a crouch
lowered the camera by the clip's head drop AND the clip lowered the head
inside the body — double-counted; the camera floated 0.72m above the mask
while the body's feet sank 0.52m through the floor (invisible in first person,
which is why it survived). placeViewmodel now measures the head's full
group-space offset from an IDLE-calibrated rest (`vm.headRest`, captured from
the idle clip's first frame — bind pose stands 0.14m taller and is the wrong
calibration) and counter-applies it to the body placement on all three axes.
The camera's own motion still comes only from headDrop→eyeY (standing eye
height unchanged); the pin cancels the body-internal movement. Verified: the
head↔camera offset is IDENTICAL to the millimetre (fwd +0.113 / lat −0.027 /
up −0.204) across idle, walk, run, crouch-idle, crouch-walk and mid-jump, and
the feet stay planted through a crouch. `VM_BACK` is still the dial if the
lens should sit closer to the mask front than today's (preserved) framing.

**ROUND 6 (2026-07-30): THE ENTITY'S ANIMATIONS REBUILT — two states, one
clip, root travel stripped.** Josh dropped a "proper glb" into `assets/entity/
accurate_backrooms_bacteria_v2_with_animations/`; measured, it is
CLIP-IDENTICAL to what already shipped (same five clips, same motion numbers —
the 5KB byte-diff is re-export noise). The real defect was in how the clips
were played: they are SCENE captures, and the walk clip's root bone
(Bone001_03) translates 2.1m inside the animation — played raw, the body slid
off its server anchor and snapped back on every loop (every ~4s mid-chase).
That is what "the animations look wrong" was. Now, per Josh's two-animation
rule:
- ONE clip (bendingOverScene, the only sustained one, picked by measured
  duration) drives both states: wander at 1.0×, **chase the same clip a
  little faster (1.45×)**. The root's X/Z travel is stripped at load — the
  root track is found by MEASUREMENT (largest horizontal range), never by
  name — so the clip walks in place while the group does the moving, facing
  its direction of travel.
- **LoopPingPong**, not LoopRepeat: the scene clip's last frame doesn't match
  its first, so a repeat snapped the whole pose every 9s; forward-then-back
  never snaps and reads fine on a writhing mass.
- The procedural bob/roll/lean and the depth-wave undulation are DELETED —
  they were compensation for the years the clip contributed nothing visible.
- JUMPSCARE keeps its unstripped 3.5m lunge: it plays once, over the red
  death flash, aimed wherever the body faces (you).
Verified live via the admin summon (`POST /api/admin/backrooms/summon`, with
`/api/admin/backrooms/immortal` to observe safely): root offset from the
group is CONSTANT to the millimetre while a limb travels ~0.9m/1.4s (in place,
alive), the chase closes and kills, and the death flow ran clean twice. The
walking.mp3/scream.mp3 audio path is untouched.

**STILL OPEN**
- Pills (and any future consumable without a bespoke pose) stay by the side,
  out of frame — invisible in hand. Fine for pills; revisit with the drink
  animation.
- `crouch-idle.fbx` is a held pose, not an animation (above) — swap the file
  for a real Mixamo Crouching Idle export when convenient.
- The dev DB world has a few test corpses near Door Alpha's spawn (posetester's
  bot runs); they rot with the 24h corpse timer, or an admin map reset clears
  them.
- Looking down at the cut mask you can see the collar ring around the neck
  hole (a small yellow peak with a dark rim, dead centre). It reads as your
  own collar; if it ever bothers, lower NECK_CUT toward 0.15 and re-check the
  hole size.
- The stale scratchpad harnesses were refreshed for A3/suits/grace (they had
  drifted to seed 999983, world 256, suit-less enters, and pre-grace reconnect
  semantics — every "failure" they showed was harness drift, not code).

**THE LESSON, twice over:** measure the asset before tuning the code. "Static"
was a zero-length clip and then a model rendered at 1/8 scale; "can't see the
arms" was a camera that was never added to the scene and then a body standing
1.5m overhead. None of those were solvable by adjusting constants, and all of
them were one measurement away. Round 2 added the corollary: **play the build
before believing it** — the body maths were all correct and the body was still
invisible-black, for a reason none of the arithmetic could have caught.

### THE FIVE-PASS MAP AUDIT (Josh, 2026-07-28) → SECTOR A3
Josh asked for five validation passes over the map. They live in
`test_mapaudit.mjs` and run across SIX seeds, so a pass is a property of the
generator rather than luck with one world (114 asserts):

1. **WALKABLE** — every open non-pit cell reachable on foot, from **every door
   individually**, under the climb rule.
2. **NO OUT-OF-BOUNDS** — zero scenery cells; no sealed pocket of open floor.
3. **ENCLOSURE** — the north/west frontiers are walled for their full length
   (the south/east frontier is closed by the renderer's perimeter closure plus
   the server's bounds check — the wall model has no flag that can express it);
   no wall spanning a gap taller than it can close; no shaft opening onto the
   sector edge.
4. **SURFACES** — every height join between open neighbours is either a
   walkable ramp or a covered riser, and no walkable floor sits at an absurd
   elevation. (Winding/UV correctness is `test_winding.mjs`, 52 asserts.)
5. **FLOW** — 100% reachable, 0 stranded, dead ends rare, ≥10 landmarks, no
   endless featureless corridor, rooms-and-walls both present, and the world
   mostly LEVEL ground.

**It found two real generator faults, both fixed:**

- **Scenery was leaking.** `plantScenery` sealed each out-of-bounds room with
  walls, and `connectAll` — which runs afterwards and carves wherever it likes
  — punched straight through those seals. **204 of 333 scenery cells** had no
  wall between them and walkable floor: a floor and a ceiling, no wall, no
  collider drawn, and a height gap with nothing closing it. Those were the dark
  voids in Josh's screenshots. **Scenery is removed**; anything unreachable is
  now filled with solid rock, which is closed geometry that cannot be seen
  into. (`Sector.background` survives, always zero, so the wire format and
  every client guard are unchanged.)
- **A door could open into a sealed closet.** `connectAll`, `regradeStranded`
  and the validator all flooded from **all four doors at once**, so three good
  doors masked a bad one. Seed 700001 put Door II in a **28-cell pocket** and
  every check called the map 100% connected. `connectDoors` now checks each
  door ALONE against the largest component and cuts a graded corridor to any
  that misses; `validateSector` reports `doorReach[]` + `isolatedDoors` so it
  can never hide again. (700001's Door II: 28 → 129,586.)

Metrics across six seeds: 100% reachable · 98.5–98.9% walkable · dead ends
0.15–0.19% · junctions 91–93% (a thin-wall world of rooms, which is the
classic backrooms — not a hedge maze) · 12–21% of cells on a slope · longest
featureless corridor 1–2 cells · 16 landmarks · 14–15 shafts · **0 scenery**.

**SECTOR A2 IS RETIRED (see `SECTOR_A2_RETIRED`) — the live world is now A3:
same seed `20260727`, 362×362, new fingerprint
`sha256:31b6550…c71e3d1`.** Same seed, genuinely different world: the two fixes
above changed the geometry. The id bump makes A2's fog/paint/drops inert
rather than misread; **the admin RESET MAP is still required** because bodies
and the death ledger aren't sector-keyed. Render:
`docs/backrooms/LEVEL0-A3{,-heat}.png`.

**SECTOR A2 (RETIRED 2026-07-28): seed `20260727`, 362×362**
(724m square — twice the AREA of A1) — `SECTOR_A` + `SECTOR_A_FINGERPRINT`
in worldgen.ts (`sha256:36ba8bf…acc0e5`); boot verifies the fingerprint and
**keeps the doors shut on a mismatch**, so no code change can silently alter
the shipped world. `SECTOR_A1_RETIRED` keeps the old freeze (seed `999983`,
256²) on the record. Metrics: 100% reachable, **16 landmarks** (the wave
scales with area; repeats get compass names), 43 606 sloped cells, 7 813
ramp edges, 807 fall edges, ~14 pit shafts, and the three numbers that MUST
be zero — `strandedCells` / `shallowPits` / `sceneryWithLandmark`. Renders:
`docs/backrooms/LEVEL0-v2{,-heat}.png` (the map render marks furniture,
lore drives, THE DOOR and THE KEY; the heat render knows about verticality,
so **magenta still means a genuine unreachable-cell bug**). A1's renders
stay at `docs/backrooms/sector-a{,-heat}.png`.

### Level 0 v2 — VERTICALITY (July 2026)
The flat world is gone. Heights live in `Sector.floor` (Int8Array, one
`FLOOR_STEP` = 0.5m per unit) and unreachable-by-design geometry in
`Sector.background` (Uint8Array). **THE CLIMB RULE is the whole contract and
is enforced in three places that must agree** — worldgen's connectivity
(`neighbors`), the server's `edgeOpen`, and the client's collision:

- `|Δfloor| ≤ 1` → walkable, and renders as a ramp (one step = 0.5m stride).
- `Δ ≥ +2` → an impassable cliff face. You cannot climb it.
- `Δ ≤ −2` → a fall you're allowed to take, priced by `fallDamage(steps)`
  (`FALL_FREE`=1 free step, then a steepening curve: 2→8, 5→43, 9→118).
- `floor ≤ -PIT_LETHAL` (9 steps, 4.5m) → a **pit shaft**: lethal from full
  health, drops a body at the bottom, logged as a fall death.

New district types **atrium / terraces / sublevel** join classic/pillars/
offices/warrens/halls. Pass ORDER is load-bearing and must not be shuffled:
grade heights → smooth slopes (**pit-aware in both directions** — an early
version filed the shafts back in) → carve pits → plant scenery → connect →
`regradeStranded` (digs through pillars, and as a last resort marks a cell
as scenery). That ordering plus the three must-be-zero validators is what
makes a soft-lock structurally impossible rather than merely unobserved.

`VERTICALITY_FROM` = 300 gates the v2 passes on sector size, and
`sectorFingerprint` hashes floor/background **only when non-zero** — which
is why A1's fingerprint is unchanged by all of this.

Client floors are **corner-averaged** (`cornerAt`/`groundAt` in world.ts):
shared corners make neighbouring ramps seamless, and refusing the average at
a cliff is what keeps shafts vertical. `heightOf` returns CEILING elevation
now (`floorOf` is separate). Old fog bitmaps of the wrong size are ignored
by `getBackroomsFog(sector, expectBytes?)`, so A1 saves can't corrupt A2.

### Furniture (`src/backrooms/props.ts`)
Deterministic hash placement — a pure function of seed+cell, no DB table.
8 kinds mapped `BY_DISTRICT` (hospital beds only in sublevels; warrens stay
nearly bare), `DENSITY` 12 per 10 000 cells → **103 pieces in the whole
362² sector**. Placement demands ≥3 open neighbours (rooms and junctions
only, never mid-corridor), level ground, off the entrance aprons, out of
landmarks/pits/scenery, and rotates to face away from an adjacent wall
(`WALL_HUG` sits it back against that wall).

**PROPS ARE SOLID (Josh, July 2026) — and still cannot block a path.** While
they were pure decoration that was free; now it has to be proven, and it is,
at placement time by `notACutCell`: the local floor graph is walked with the
candidate cell REMOVED, and the spot is refused unless every neighbour is
still mutually reachable (search capped at `DETOUR_LIMIT` = 14 cells, and an
unsearched maybe counts as a no). So even in the worst case — a prop sealing
its cell wall to wall — a way around already existed. **That proof does not
depend on the collider size, so `PROP_RADIUS` is free to be tuned for feel.**
Clipping into the floor/wall/ceiling is still fine by design.

Collision is **client-side only** (`clampPropsX/Y` in controller.ts, boxes on
separated axes so you slide along a desk instead of sticking). Movement
validation on the server ignores props deliberately: phasing through an
armchair wins a cheater nothing, while a server disagreeing with the client by
centimetres would spray corrections every time someone brushed one. `lore.ts`
`walkable()` excludes prop cells, so no drive/door/key is ever buried under
furniture. Harness: sealing EVERY prop cell costs exactly those cells and no
route (`test_vertical.mjs`).

### Lore drives + THE DOOR (`src/backrooms/lore.ts`)
20 hard drives, Josh's text, **globally unlocked for the whole platform the
moment anyone picks one up** — the Research archive only ever grows, and
there are no resets. `driveSites()` places them deterministically (≥28 cells
from a door, ≥22 apart, never in a shaft or in scenery). `doorSite()` takes
the deepest cell from the entries; `keySite()` puts THE KEY in the landmark
farthest from the door. Opening the door sets `LEVEL1_FLAG` — **one-time and
irreversible for the entire community**. The key drops on your body when you
die and **resets to its fixed original site when that body despawns** (24h):
the key cannot be permanently lost.

### THE OPERATOR MAP (admin, July 2026)
**Both** maps — the lobby one and the in-game FIELD MAP (M) — show admins
everything the game is about finding: relic sites (named), the lore drives
still out there, THE DOOR with its open/locked state, and THE KEY (shown at its
home, greyed with "carried/on a body" when it isn't lying there), plus the
entity. **Admins also get the whole plan with NO FOG** — the map route's
masking loop is skipped for them (`revealAll` in routes/backrooms.ts). Looking
at it charts nothing: `br.fog` is untouched, so the community's "% charted"
figure is the same number an admin sees.

**The in-game map is LIVE** (Josh: "you have to keep reopening the map to see
where you are going"). Terrain is fetched once and baked to an offscreen
canvas; the cheap layer — you, a heading wedge, and the operator markers —
repaints at 10Hz and the view follows you, so you can walk with it open. The
fog re-fetches every 4s so ground charted mid-walk appears without closing it.
Opening and closing drives the loop, and leaving the run clears it.

The gate is the server's, not the client's: `routes/backrooms.ts` attaches
`debug: br.debugState()` **only** when `user.isAdmin`, so a normal player's
payload contains no trace of it (asserted in `test_brdrops.mjs` — the word
"key" doesn't even appear). The overlay carries **locations only**: a drive's
TEXT is still earned by walking to it, admin or not, exactly like relic
identity and vault answers. Bodies remain absent from this map for everyone —
see CORPSE RECOVERY.

### ADMIN FLYCAM (Josh, July 2026)
**F** in game, admins only: a noclip ghost for inspecting the world. Fly where
you look, **scroll wheel is the throttle** (0.6–60 cells/s, geometric notches),
shift ×3, Space/C for straight up and down. Not rebindable and not in the
Controls list — it's an operator tool, not a game control.

The switch turns off **every** movement rule, so two things matter:

- **`br.setFly` verifies `isAdmin` against the DB itself**, not against the
  socket and not against a flag on the wire. Everything else in net.ts trusts
  its caller; this deliberately doesn't. A non-admin who forges a `fly` frame
  is refused, and would be snapped back by correction frames anyway.
- **A ghost changes nothing.** No fog is charted (an admin sightseeing must not
  hand the community the map), no fall is judged, the entity can neither see,
  hear nor touch them, they can't film footage, and no position frame reaches
  another player — taking off sends `bye`, so they simply vanish.

**Landing is refused** over a wall, sealed scenery or a shaft: normal movement
rules could never get the player out of such a cell, so they'd be stuck for
good. The client checks before it lands and says why, and since Oct 2026 the
SERVER refuses it too (`bad_landing`) — it used to be client-only.

**THE OPERATOR VIEW (Oct 2026 — Josh: "as the admin i am able to fly in every
map and see all monster, relics, objectives, and hard drives").** An audit
found a flying admin saw far less than that: the Stalker, the Shy Guy and the
alligators only tick while somebody is WALKING the level, pickups stream on a
2.5s tick inside 22-30 cells (a ghost at speed flies straight through), labels
fade out at 9-16 cells, and the map overlay only knew Level 0's door and key —
the Poolrooms and Pipe Dreams showed relics and Entities and nothing else.
Now `BrService.operatorView(level)` is one shape on every level (monsters,
relics, drives, objectives with their state); net.ts sends it to every FLYING
session once a second (`op`); the game draws each item as a through-wall label
on its floor that grows with distance and clears on landing; and both maps draw
it through one function (`client/src/backrooms/opmap.ts`). The admin also
enters the Poolrooms before THE DOOR is open now, as Pipe Dreams always
allowed. **A new objective or creature kind joins `operatorView` in the same
commit.** Harness `test_flycam.mjs` (40) — cited here as a 28-assert harness
for months, it never existed on disk; it does now. (`test_brdrops.mjs`, cited
under THE OPERATOR MAP, is still missing.)

### CORPSE RECOVERY (Josh, July 2026)
Two rules, and they work together:

- **A body is NEVER on the map.** `/api/backrooms/map` does not carry `bodies`
  and the lobby canvas does not draw them — a corpse only reaches a client
  that walks **within 25 cells (50 m)** of it, the tightest proximity gate in
  the game (net.ts; relics/drops are 30, the door 40). Finding where you died
  is a feat of memory, not a waypoint. **Do not put `bodies` back on that
  payload** — that reverses the round-2 lock on purpose.
- **You get 24 HOURS**, on a clock of its own: `BACKROOMS_CORPSE_MS`
  (default 24h) for bodies, `BACKROOMS_DESPAWN_MS` (default 1h) for loose
  dropped items. A drop is a choice, a body is a loss, and an hour was not
  enough to retrace an unmarked route. Spray paint is still the only thing
  that is permanent.

The rule is stated once, on the death screen, because nothing else in the app
will ever tell you where the body is. `test_brdrops.mjs` proves the clocks are
separate (a 2h-old drop rots while the body survives) and that the map payload
carries neither the location nor the dead player's name.

## Assets plan (B2+)

CC0-first so nothing needs licensing care: **ambientCG** + **Poly Haven** for
PBR texture sets (carpet, drywall, ceiling tile, concrete — both have clean
download APIs Claude can pull from directly), Poly Haven for HDRIs/props,
**Mixamo** for rigged teammate models + walk cycles (Josh's Adobe login),
**Freesound/Sonniss** + the existing ElevenLabs pipeline for audio. Heavy
assets live OUTSIDE git (`game/public/assets/` gitignored) with a pinned
manifest downloader script, like the emoji art pattern.

## Phases

- **B1 (DONE)** — world generator + validation harness + review renders; the
  launchable app scaffold (title/login/menu).
- **B2 — IN PROGRESS. The core slice SHIPPED (July 2026):** the world is
  walkable. Server: `src/backrooms/service.ts` (Sector A generated at boot +
  fingerprint-VERIFIED — mismatch keeps the doors shut; sessions, spawn
  rooms, movement validation with speed cap + wall-phase checks, chunk
  serving limited to a radius around the player — map secrecy) +
  `src/backrooms/net.ts` (`/ws-game`, token-authed upgrades like /ws;
  proximity-scoped position fan-out — distant players don't exist on your
  wire; one socket per user, replace-on-reconnect). 15-assert protocol
  harness (`test_backroomsnet.mjs`). Client: Three.js renderer
  (instanced walls/solids/panels per chunk — `frustumCulled=false` on
  instanced meshes, world-space instance matrices otherwise cull as a
  sphere at origin; bright-haze fog toward light; blockout palette),
  pointer-lock WASD controller with grid collision mirroring the server
  rules (verified: stops at wall−radius exactly), chunk streaming radius 2
  + prune, peer avatars with name tags, door flow menu→game→leave. First
  look artifact: `docs/backrooms/first-person-blockout.jpeg`.
  **CHUNK-BUILD STUTTER PASS (Aug 2026, Josh: "a bit of frame stutter when
  walking around"):** four main-thread sinks fixed, all in the build path —
  (1) `buildChunk` no longer synchronously rebuilds its 4 orthogonal
  neighbours (a boundary crossing turned 5 arriving chunks into ~25 builds
  in one frame, and the game's rebuildQueue then rebuilt the same 4 AGAIN);
  onChunk's 8-way queue is the only seam-healer now. (2) `lightAt` gained a
  7m spatial bucket grid over the fixtures — identical output (fixtures cull
  at √46 ≈ 6.8m, so the 3×3 block is a superset), ~10× fewer iterations on
  the ~15k light samples a build bakes. (3) the prop-loaded hook rebuilds
  ONLY chunks that place that prop kind, via the queue — it used to rebuild
  the whole loaded world synchronously once per model file (8 files ≈ eight
  multi-second freezes after entry). (4) the rebuildQueue drain only runs
  when the frame has headroom (<7ms used), with a 400ms starvation guard.
  Remaining known cost if it ever matters again: `frustumCulled=false`
  across ~81 retained chunks (needed for world-space instance matrices) and
  the per-build geometry clone/merge churn.
  **B2 continued (all shipped July 2026):** community fog (migration 52,
  LOS reveal, SIGKILL-proof persistence) + the Solace-side Backrooms rail
  section (community map canvas w/ masked geometry, live door status, GET
  THE GAME card) + game-menu occupancy · **proximity voice** (per-sector
  LiveKit room, session-gated token, client distance-volume rolloff
  2→16 cells, M mute, `voice.kick` hangs up Solace voice on entry) ·
  **packaging**: `game/src-tauri` (Tauri v2, fully bundled — NOT the
  shell's remote-load pattern), `publish.ps1` → `SolaceBackrooms-Setup.exe`
  staged for `/opt/solace/desktop-dist/` (the GET THE GAME card HEAD-checks
  and lights up automatically), and **server CORS for the packaged app's
  Tauri origins** (`GAME_ORIGINS` allowlist in http.ts — exact origins,
  never `*`; 8-assert harness). Deploy when the game goes live: backend
  build+restart AND the Caddyfile (/ws-game matcher). Manual voice test
  pending (Josh, needs ears + the LiveKit dev server).
  **B2 truly remaining:** nothing blocking — polish items (spray paint,
  stamina/sprint tuning) fold into B3/B4.
  **EMBEDDED IN THE SOLACE CLIENT (2026-07-26, Josh's call — the PRIMARY
  way to play):** the game lives at `client/src/backrooms/` (world/
  controller/gamenet/voicechat/ambience + BackroomsGame.svelte, ported
  from `game/src` with only import/token seams changed). The Backrooms
  rail view's door list mounts it via dynamic import as a full-viewport
  overlay — Three.js + game code build as their OWN chunk (~678KB) loaded
  on door entry; the main chunk stays untouched (the code-split rule).
  Session = the signed-in Solace token (`client/src/backrooms/gameapi.ts`
  shim — no game login); `/ws-game` rides the same origin (Vite dev proxy
  added; the deploy Caddyfile already routed it). Processed pack assets
  are COMMITTED at `client/public/assets/{br,hazmat,*.ogg}` (~2.6MB) so
  the server build serves them; `game/scripts/prepare-assets.mjs` mirrors
  there. The auto-update watcher never reloads while `brGame.active`.
  The `game/` standalone (Tauri) is now the OPTIONAL boxed copy — not
  maintained while the look iterates; the download card is demoted to a
  secondary link. Keep the two copies of the game modules in sync ONLY by
  porting client←game deliberately; client/src/backrooms is canonical.
  **B2 look pass (July 2026, Josh-directed live rounds):** the blockout
  palette is gone — everything derives from Josh's packs (gitignored
  `assets/`; `game/scripts/prepare-assets.mjs` copies/crops/transcodes into
  `game/public/assets/`, which the installer bundles): TheBackroomsAndPoolrooms
  textures (3 wallpapers — MIXED per district id, offices/warrens keep their
  signature papers; floor; ceiling-tile + panel-tube ffmpeg crops), the
  Hazmat PS1 player model (FBX rigged but CLIPLESS → procedural SwingBone
  walk/run cycle, slerp-to-rest idle), "Fluorescent Static" as the ambience
  loop, and the carpet-walk sample ONSET-SLICED into real footfalls (Josh:
  "the footstep sound is perfect" — LOCKED, don't touch). Look rules now in
  code: per-district ceiling heights (`HEIGHT_BY_TYPE` — classic 4.4m locked
  "perfect", warrens stay low and pressing), per-cell ceiling quads +
  Y-scaled walls + fascia strips at open height steps, client-synthesized
  south/east perimeter walls, a real DROP ceiling (3×3 ≈600mm tiles per cell
  with a T-bar grid; fixtures are EXACTLY two tiles, snapped onto the grid),
  matte LAMBERT carpet drawn as LOOP PILE at Josh's berber reference scale
  (1m tile, ~8mm loops; no specular/normal — carpet must never sheen),
  wallpaper edge-texel OVERSCAN (killed the white lines
  at wall tops/bottoms), and ROVING PANEL LIGHTS — a pool of 8 PointLights
  that OWN the nearest fixtures and fade in/out (v1 snapped at full
  intensity and panels flashed on approach; never regress to snapping) —
  later REPLACED entirely by the BAKED LIGHT FIELD, which settled (after
  several artifact rounds) into: walls/solids/fascia/posts MERGED into one
  mesh per chunk with the fixture light field baked PER VERTEX (continuous
  along runs; a 3-cell cross-chunk fixture halo keeps seams smooth), a
  vertex-color lit-from-above gradient + floor contact shadow, WORLD-scale
  UVs on every box face (pattern spans 4m×3m at any wall size — caps/
  fascia/posts wear real paper slices, no gray placeholders), exact-length
  segments with papered corner posts at TRUE L-BENDS ONLY (T/X junctions
  bury their own ends; posts there stood proud and caught light), and
  sprinkled same-paper baseboards (~1/3 of segments, 3cm short of ends so
  they never sit coplanar with a doorway cap). NO additive wall-wash quads
  (they overhung corners — glow in mid-air, hard-clipped by crossing
  walls) and NOTHING positional/dynamic — any nearest-N light culling
  tracks the player and reads as reactive.
  Spatial voice shipped earlier in the pass: per-peer HRTF panner +
  wall-occlusion lowpass (grid-walk ray) + procedural room reverb, hard
  silence gate 36m inside the 56m wire range. Mic captures with explicit
  EC/NS/AGC; a game settings screen (mic sensitivity, input/output volume,
  RNNoise port from the main app's mic-chain) is QUEUED. Reference-match
  artifact: `docs/backrooms/first-person-reference-match.jpeg`.
- **B3** — the economy: locker, ASYNC/Voss, gear, relics, extraction,
  death/corpse-drop (full money-path harnesses — escrow discipline applies).

  **B3 SPEC LOCKED (Josh, 2026-07-26 — his design, verbatim intent):**
  - **EXTRACTION [SHIPPED]:** the ONLY in-game exit is walking back into
    your entry door's wall section, outlined in RED spray paint. Server
    verifies position (≤2.2 cells of the door), ends the run, and Dr. Voss
    debriefs (new cells charted this run + time inside; relics/footage
    lines join when those exist). No leave button. Socket death still
    cleans the session (closing the tab remains the out-of-band escape).
  - **Solace section [SKELETON SHIPPED]:** 1. The Map (+ recent relics and
    recent player deaths feeds) · 2. Voss trading store (buy/sell/upgrade)
    · 3. Lockers (gear + a table of unlocked relics) · 4. The Doors —
    RENAMED Door Alpha/Bravo/Charlie/Delta [SHIPPED — display names in
    service.ts DOOR_NAMES; the worldgen names are fingerprinted and frozen].
  - **HUD [SHIPPED]:** health bar bottom-left (green >60 / yellow >30 /
    red), stamina bar above it (yellow; sprint drains 9/s, jump costs 15,
    regen 12/s — jump > sprint per Josh, "decent pace, medium recharge"),
    5 grey inventory slots bottom-middle (scroll cycles, 1–5 select; 9
    slots with backpack later).
  - **Keybinds [SHIPPED]:** Space jump · E interact/pickup ("no space in
    inventory" when full) · G drop · scroll cycle · ESC pause menu (pause =
    pointer-unlock; resume + controls + the exit rule; no abandon-run) ·
    M map (fetches the community map, you-are-here dot) · 1–9 quick select
    · C crouch (half speed, eye lowers, footsteps ×0.35 volume — entity
    can't hear crouch steps). MIC MUTE MOVED TO N (M is the map now).
  - **Death:** ragdoll on death (fall damage or entity); other players E on
    a body to view/loot its inventory; death screen flashes red "you died"
    → fade to black → returned to the Solace Backrooms section. Relics/
    items on the body drop with it.
  - **THE ENTITY:** model `/assets/entity/backrooms-entity/` (glb PRESENT);
    rare encounter; wanders the map; drawn to VOICES (proximity-voice
    energy); direct line of sight → chase; touch = kill. Chase scream =
    `/assets/entity/sound/chase/backrooms-entity-sound.mp3` LOOPED
    seamlessly through the spatial-voice graph rules; walk loop =
    `/assets/entity/sound/walking/walking.mp3`. Losing LOS: 10s grace
    before it resumes wandering. Player is 20% faster. Footstep hearing:
    running 10m, walking 5m, crouching silent.
  - **Consumables** (`/assets/consumables/` — FOLDER EMPTY, models pending
    Josh): Health Pills (+50% hp), Battery (recharges flashlight/walkie:
    select the chargeable item, press the battery's slot number).
  - **VOSS TRADING [ECONOMY SHIPPED 2026-07-26 — migration 53
    [NB every "RC" price in this B3 block is now SILVER at the same number —
    the Sep 2026 conversion was at par. See THE ASYNC GRANT above.]
    (backrooms_players RC/lockerSlots, backrooms_locker gear instances,
    backrooms_relics), store ops all one-txn guarded (brSellEmojiForRc /
    brBuyGear / brUpgradeGear / brSprayColor / brLockerUpgrade /
    brBuyStandardKit), routes under /api/backrooms/{me,sell,buy,upgrade,
    spraycolor,locker-upgrade,kit}, live section UI (sell grid + buy list
    + locker w/ level pips + relics table), 42-assert harness
    test_brvoss.mjs. In-run gear USE (flashlight beam, walkie, camera,
    spray) is the next slice.] (Research Credits; purchases land in the
    locker):**
    BUY — equipment upgrades L1 100 / L2 250 / L3 500 RC · suit colors
    (Hazmat PS1 recolors) 400 RC · locker 20→40 slots 1000 RC · Standard
    Kit = 1 RARE EMOJI → yellow suit + spray can (the emoji→gear burn) ·
    consumables · backpack 300 RC (5→9 slots, not worn on the model).
    SELL — rare emoji 50 RC · legendary emoji 150 RC · relic 250 RC ·
    entity footage by proximity: ≤3m 400 / ≤10m 250 / >25m 50 RC.
  - **EQUIPMENT** (`/assets/equipment/` — ALL MODELS PRESENT):
    Walkie Talkie 100 RC (V = PTT, ","/"." channel down/up, 10 channels;
    battery drains only while transmitting; L0 7min/L1 10/L2 15/L3 20;
    battery readout bottom-right when held) · Flashlight 50 RC (left-click
    toggle; L0 [15min — Josh gap, my default]/L1 20/L2 30/L3 60) · Camera
    300 RC (left-click record, HUD overlay from `Camera HUD.avif`; L0 30s/
    L1 1m/L2 2m/L3 3m) · Spray Can 50 RC (black default; color upgrades
    50 RC each recolor the can; spray time L0 [90s default]/L1 2m/L2 3m/
    L3 4m) · Backpack 300 RC (9 slots).
  - **RELICS** (`/assets/relics/` — 10 images present; catalog size never
    shown to players): 2 active spawn sites per hour at random far-from-
    door points, floating, never clipping geometry; E collects ("you got
    <name>") into a free slot; extraction unlocks it on the section's
    relics table. Duplicate at extraction → Voss offers RC (yes/no); no →
    the dupe becomes auctionable in Emoji Rumble's auction house under a
    new RELICS category (relics→silver via player market ONLY — the
    doctrine holds). Entity has a 50% chance to be haunting either site.
    **[SHIPPED 2026-07-27, migration 58]** — an auction lot is now EITHER an
    emoji or a relic; listing pulls the locker row into escrow, settlement
    UNLOCKS the relic for a winner who never recovered it (a bought trophy)
    or lands it as a spare, seller takes 95% and the 5% rake seeds the
    lottery. Bidding on a relic you already own is allowed (a spare is 250 RC
    at Voss's) — the one place relic rules diverge from binary emoji
    ownership. 46-assert harness proves conservation on both axes.
  - **Spec gaps I defaulted (flag to Josh):** flashlight L0 duration,
    spray L0 duration, pause-menu contents (no description was given —
    stubbed resume+controls+rule), mic key moved to N (M = map).

  **ROUND 3 SHIPPED (2026-07-27) — Josh's 21-item list.** All of it is in
  except the Level 0 expansion, which is waiting on his approval:
  - **The entity hunts in every direction.** It was grid-locked (4-neighbour
    BFS, cell-center to cell-center = axis-only pursuit, dodgeable by running
    diagonally). Now: 8-way BFS, STRING-PULLED (drops every waypoint it can
    already reach in a straight line), and with a clear line it leaves the
    grid entirely and closes at the exact angle between you. 13-assert
    end-to-end harness (`test_brentity.mjs`) watches the debug overlay and
    proves diagonal motion is the norm, that it reaches the player, and that
    it never teleports.
  - **The flashlight is local, and now CASTS SHADOWS** — the only shadow
    caster in the game (walls cast, carpet receives). Nothing about it has
    ever gone on the wire; the shadow closes the one leak (a beam glowing
    through drywall into the next room).
  - **DROPPED ITEMS (migration 57 `backrooms_drops`).** G drops what you
    hold: the locker row travels WITH it (deleted on drop, re-minted on
    pickup — never duplicated), it stands on the carpet wearing its own
    picture + name, E takes it. `charge` rides the row, so a dropped dead
    flashlight comes back dead (no free recharge). **Persistence rules
    (locked):** spray paint is FOREVER; bodies and drops ROT after
    `BACKROOMS_DESPAWN_MS` (1h) — a 60s sweep plus one pass at boot.
  - **Spray paint actually accumulates.** `pruneChunks` now returns the keys
    it dropped and the streamer forgets them; before, the "already requested"
    set kept a pruned chunk forever, so revisiting an area showed empty void
    and none of its stored marks.
  - **THE PAUSE MENU IS THE SETTINGS SCREEN** (`settings.svelte.ts`, its own
    localStorage key — deliberately SEPARATE from Solace prefs, Josh's "no
    bleed" rule): mic + output device pickers, live mic meter with the
    sensitivity threshold drawn on it, mic gain/sensitivity/RNNoise (the main
    app's `MicChainProcessor` ports over — restart only on a topology change),
    voice + world volume (one master bus in ambience.ts), and REBINDABLE keys
    for all 14 actions (arrows stay a permanent alias). Plus **FORFEIT** —
    same consequences as any death, behind a house-styled confirm.
  - **Sound**: `gearsfx.ts` — flashlight click on/off, a spray hiss that
    lives exactly as long as paint is leaving the can, battery charge, pill
    rattle, radio squelch on key-up and release, and a bell shimmer on a
    relic pickup. File-first (`/sfx/br-*.ogg`, none recorded yet) with synth
    fallbacks, all on the game bus.
  - **Relics are NAMED in the world** (overrides hidden-until-pickup): the
    slug rides the stream, a label fades in within reading distance.
  - **Suit colors are real end-to-end**: one filter table (`suitcolor.ts`)
    drives both the shop preview and the in-game texture, and the color rides
    the position frames from the server's own inventory — what you bought is
    what peers see, on you and on your corpse.
  - **Threshold-4 + locker rework**: no browser `confirm()` survives (one
    promise-shaped house dialog), suit counter is pick-a-color-then-press-the-
    price, the Standard Kit opens a real rare-emoji picker, every filled
    locker slot opens its item's card (upgrade / recolor / sell), **paint
    colors are FREE**, Voss's portrait is 260px (was 110), and admins get
    **RESET MAP** (`POST /api/admin/backrooms/reset` — fog + marks + bodies +
    drops + deaths; refused while anyone is inside; audited; lockers/RC/relic
    unlocks untouched). 54-assert harness `test_brdrops.mjs` (conservation
    across drop/pickup/death, forfeit, reset guards, boot rot).
  - **Camera HUD** blends `screen` at 0.7 (was a flat 0.85 overlay that made
    the viewfinder nearly opaque).
  - **PALETTE ROUND 3 (Josh, live over screenshots):** every tone in world.ts
    came up two steps and lost its brown — the load-bearing change is the
    wallpaper's multiply tint (`#a89d74` → `#ebe0b2`), since that was what
    pushed the paper into mustard. Fog dies into dusty olive (`0x4d452b`), the
    baked light floor rose (walls 0.76 → 0.89 unlit) so rooms between fixtures
    are dim rather than black, ceilings rose a fourth time (classic 5.0, halls
    5.8, pillars 6.6, offices 4.2, warrens 3.4), and baseboards dropped from
    45% of segments to 11% (`BASEBOARD_RATE`).
    **THE CARPET IS LOCKED** — base `#6b5b28`, loop tops
    `rgb(v+24, v+9, v*0.3)` with `v = 120 + rand*38`. Josh approved that exact
    mix on a screenshot ("the carpet you just had before was good") after a
    warmer ochre variant was tried and reverted. Do not re-tune it unasked.
    **Wall sharpness:** the pack's wall sources are 1024², already matched by
    the canvas, so "more HD" came from density instead — one texture tile now
    spans 2.6m × 2.0m of wall (`PAPER_U_M`/`PAPER_V_M`, was 4m × 3m ≈ 256px/m),
    the paper composites at alpha 0.8 instead of 0.62 (the fade was eating half
    its detail), and anisotropy went 8 → 16 for grazing corridor angles.
  - **WALL SURFACE = PAPER, NOT PLASTER** (Josh, over four screenshot rounds).
    The pack's wall normal maps are 1024² but ~5KB — effectively flat, which is
    why walls read as print. `wallHeightField()` synthesizes the relief instead
    (1024², built once at boot, shared by all three papers, tiled 1:1 with the
    paper so features land at real-world scale) and it is deliberately PAPER
    physics, not stucco tooth:
      · **ROLL SEAMS** every `PAPER_U_M / ROLLS_PER_TILE` = 0.52m — a real roll
        width — each with its own crease depth, lip height, lip side and hand
        wander (one in five is a tight joint you can barely find). This is the
        single feature that says "wallpaper" and nothing else in a room has it.
      · fine fibre (raw hash, tiny amplitude), the slow undulation of the wall
        underneath, blisters at a spread of sizes, fading-ended scuffs at any
        angle, and two horizontal fold creases.
      · **The rib emboss is VERY SPARSE** — a mask keeps it to occasional
        patches at a fraction of its first depth. Full-coverage ribbing read as
        "ripples" and Josh rejected it; keep it rare.
    **Per-wall variance is load-bearing:** world-scale UVs put u=0 at every
    wall's own corner, so all of them showed the same seam, blister and scuff in
    the same place ("every wall has the same middle seam"). `pushBox` now offsets
    u/v per segment — hashed off world position so every client agrees forever —
    and flips half the rolls end-for-end.
  - **BASEBOARDS ARE PAINTED WOOD:** their own merged mesh per chunk with an
    enamel material (`trimMat`, off-white with a YELLOW cast — a cool white
    "popped out too much" against the paper), sharing the walls' baked light.
    Selection moved from per-segment to per-BLOCK (`BASEBOARD_BLOCK` = 5), so
    the runs that exist are up to 10m long and only ~8.5% of blocks get one.
  - **Name tags no longer shine through walls.** The sprite draws with
    `depthTest: false` (so an avatar's own head can't eat it), which also made
    every name legible through drywall — a quiet position leak in a game about
    not knowing where anyone is. The 5Hz occlusion cache that muffles voices now
    also hides tags (peers AND corpses) whenever anything solid is in the way,
    and it runs whether or not voice connected.
  - **Review pass fixes**: the drop response echoes its itemId (no
    pending-variable race), gameplay keys require pointer lock (you could walk
    around with the pause menu open) while keyUP is never gated, losing the
    pointer releases every held input, and the game's neural-NS toggle now
    stands the browser's own suppressor down like the main app does.
### THE RESEARCH ARCHIVE + THE DOOR (Josh's lore design, SHIPPED 2026-07-27)
Migration 60. Twenty lore hard drives (`src/backrooms/lore.ts` — Josh's text,
verbatim) scattered through Level 0, and the community's end goal for the level.

- **A drive found by anyone unlocks for EVERYONE**, permanently. `backrooms_drives`
  is global, not per-user: one row = one drive Solace has recovered, crediting the
  finder forever. The INSERT is the claim, so a tie or a replayed frame still
  produces exactly one finder.
- **SECRECY, same doctrine as vault answers and relic identity:** a drive nobody
  has found does not exist on the wire — no text, no title, no placeholder row,
  and **the catalog size is never published** (the archive reads bottomless
  until it isn't). `GET /api/backrooms/research` returns only what's been earned.
- **Placement is DETERMINISTIC from the frozen seed** (`driveSites`), ≥28 cells
  from any entrance and ≥22 apart, so a drive's room is its room forever with no
  placement table in the DB. Found drives leave the world; the archive keeps them.
- **THE DOOR** is the deepest reachable cell from the four entrances (Drive 003:
  "everything in Level 0 exists in relation to that door") — currently depth 464.
  **THE KEY** hides in the landmark farthest from it (currently the Pillar
  Garden, 246 cells away). Both derive from the sector at boot: no persistence,
  no drift.
- **THE KEY CAN NEVER BE LOST**, and needs no state in the DB to guarantee it:
  it is findable at home unless someone carries it (in-memory) or a corpse holds
  it (`kind: "key"` in the corpse JSON). So a rotted body, a socket death, an
  extraction, or a server restart all return it home automatically. It costs no
  inventory slot — losing the community's one key to a full backpack would be a
  miserable way to end a run.
- **Turning it unlocks LEVEL 1 — THE POOLROOMS — for everyone, once**
  (`backrooms_flags`, the row IS the event). Broadcast app-wide via
  `backrooms.level1`, with Sterling's one @everyone line for the occasion. The
  already-open check runs BEFORE the key check, or the person who opened it gets
  told "locked — find the key".
- **The archive and the door SURVIVE the admin world wipe** — they're the
  community's history, not the map's state. Verified.
- Admin debug overlay now carries drives + door + key for playtesting.
- 66-assert harness (`test_lore.mjs`) with a correction-aware pathfinder that
  hikes the real level: claim a drive, prove another account can read it in full
  while the other 19 stay invisible, take the key, die with it, watch the rotted
  body return it home, then carry it 246 cells to the door and turn it — plus
  double-claim, double-turn, restart and wipe permanence.

- **B4** — the entity, sound design, dread.
- **B5+** — expansion sectors, deeper content, eventually the opt-in pact.

### LEVEL 0 EXPANSION — SHIPPED (2026-07-27)
Item 20 of the round-3 list, done: **Sector A2, seed 20260727, 362×362** —
twice A1's area, with verticality, furniture, background scenery and the lore
layer. Full spec in the Sector A2 section near the top of this file. Also
considered and REJECTED: 512×512 (4× the area — a ~7-minute one-way crossing,
and relic sites at 2 at a time would have felt threadbare).

**Deploying A2 requires the admin RESET MAP button.** Old fog, paint, bodies
and drops are keyed to the old geometry: wrongly-sized fog bitmaps are
auto-ignored by the size guard, but spray marks and drop coordinates from A1
are meaningless in A2 and must be wiped.

## LEVEL 1 — THE POOLROOMS (SHIPPED 2026-07-31)

Josh: "take everything we have learned about map generation and start building
the pools map… take your time… use what we have learned about lighting,
textures, wall placement." Reference language (Jared Pike's Dream Pools /
poolcore): pristine white tile on every surface, warm skylight sun against
quiet dim corners, senselessly connected rooms mixing curves and hard angles,
colonnades, and water inset in the floors.

**SECTOR P1 IS FROZEN AND LIVE: seed 20260731, 322×322**, fingerprint-verified
at boot exactly like A3 (a P mismatch shuts only the pools — Level 0 is
unaffected). Generator: `src/backrooms/worldgen-pools.ts`, reusing the proven
passes (smoothSlopes / connectAll / per-door connectDoors / regradeStranded,
the climb rule, solid-rock honesty, no scenery). Review renders:
`scripts/render-pools.mjs` → `docs/backrooms/pools-*.png`.

- **WATER is a first-class layer**: `Sector.water` = per-cell surface height
  (WATER_NONE = dry), assigned LAST by physical flood-fill from basin seeds so
  a pool can never hang in the air or leak through a wall. `validatePoolsSector`
  adds the water MUST-ZEROs: spillEdges / waterOverSolid / waterTouchingPit.
  Water never blocks movement — it SLOWS it (client wade factor: knee-deep
  0.55×) and **a metre of water breaks any fall** (server rule — jumping into
  a canal is a route, not a wound). Drains are never watered, so the lethal
  shafts stay lethal.
- **Districts**: natatorium (colonnade + one enormous basin, 8.2m ceilings) ·
  shallows (a sunken wading field under half a metre of water) · soak (white
  rooms, half with a private pool) · poolmaze (dry tile maze — the connective
  tissue) · channels (a canal with bridges and graded step-outs) · sundeck
  (terraced decks with stacked pools). Landmarks: The Great Pool, The Drained
  Pool, The Cascades, The Deep End, The Round Room, The Long Water.
- **Pools have VERTICAL edges with graded step strips** (the reference look;
  the climb rule can always walk you out). THREE generator lessons are baked
  in comments: bridges stop a flood (seed every canal segment), a segment
  without a step-out gets "rescued" into a dry causeway by regradeStranded
  (every segment gets one), and connectDoors corridors regrade floors so they
  must route AROUND protected pool geometry (the `avoid` set).
- **THE PASSAGE**: THE DOOR (Level 0) ↔ The Landing (pools door 0). One run,
  one inventory, one hp bar across both worlds; `BrSession.level` scopes
  EVERYTHING positional (fan-out, chunks, fog per sector id, marks, corpses —
  migration 61 — drops, pickups with own-world LOS, entity/brownouts gated to
  level 0). E at an open door travels; travelDenied explains. The client
  tears the whole world down on the travel frame and rebuilds (level style +
  environment swap in world.ts: `setLevelStyle` / `applyLevelEnvironment` /
  `tickWater`).
- **The look** (client): procedural white-tile canvases (20cm wall / 25cm
  floor+ceiling tiles, rare pale-aqua accents) at the same world-scale UVs as
  the wallpaper; skylights on the fixture grid (no flicker — daylight doesn't
  stutter); pale-cyan fog; one directional "sun" for water speculars; the
  pack's water color+normal maps scrolled two ways. Tuned once against
  screenshots: the first pass was overexposed and the tile grid vanished at
  distance — brightness lives a step BELOW blowout so the grid always reads.
- **ADMIN LEVER** (Josh: a player already found the key): Backrooms HOME tab →
  "open the poolrooms" → `POST /api/admin/backrooms/open-pools` — the same
  one-shot flag the key sets, audited, idempotent, hidden once open.
- No entity, no relics/drives/key sites in the pools (v1) — it is the calm,
  wrong, beautiful level. Content hooks come later.
- 17-assert plumbing harness (`test_pools.mjs`): both fingerprints at boot,
  lever fresh/idempotent, travel gating + round trip, wet chunks, movement.

## AUGUST 2026 BATCH (Josh's requests, all SHIPPED + deployed)

- **THE LEVELS rail**: ten slots beside the community map (L0 open, L1
  unlocks with THE DOOR, 2–9 "in development"); the map + THE DOORS panel
  follow the selected level (`/api/backrooms/map?level=`); DIRECT ENTRY into
  the pools at any of the four arrival rooms, and the three non-Landing
  rooms EXTRACT by proximity. Enter frames carry `level`.
- **Graffiti-bleed hardening**: chunks + marks frames are level-tagged and
  refused cross-level; onWelcome runs the full world teardown; marks batches
  REPLACE a chunk's paint (they used to stack — 340 sprites deep).
- **Field map (M)**: scaled-to-fit (whole chart visible), per-level fetch.
- **TWO ENTITIES** (THREE since Sep 30 2026 — the keeper walks THE KEY's
  ground; see "LEVEL 0's CREATURES, VALIDATED"): relic-bound patrols (orbit, circle back through the
  site, SWAP posts every 2.5–5 min — the cross-map treks are the schedule).
  Per-id wire frames; the client renders per-instance (SkeletonUtils clone,
  every rendering rule per skeleton). Dormancy removed.
- **THE STALKER — NEVER SEEN IN THE LIGHT (Josh, Aug 2026).** "It should never
  when the lights are on be seen by players… even if the player catches a
  glimpse it will be like a 'whoa what was that' moment." While the power
  holds it actively breaks line of sight rather than merely keeping a ring:
  any player with a CLEAR LINE who is either inside `STALK_UNSEEN_MIN` (7
  cells) or *walking toward it* (`STALK_APPROACH_DOT`) makes it leave — and
  it leaves for a spot with no line back to them, not just "further away".
  It also moves at **2× sprint** now (5.7 cells/s, `SPRINT * 2`) per "make the
  stalker faster, its too easy to catch when lights are on", so it always
  wins that exchange. Behind a wall it is free to sit still. The flashlight
  remains the only real counterplay, and the blackout hunt is unchanged.
  (SUPERSEDED Sep 30 2026 — any sight line now, a band of 16–26 cells
  behind you, dark routes, and a beam held two seconds: "LEVEL 0's
  CREATURES, VALIDATED".)
- **THE STALKER** (Level 0's third creature, assets/stalker): black-painted
  model (Idle/Walk/Attack/Attack Near), shadows players at a ~13-cell ring,
  throws VOICE MIMICS (client-local replay of a peer's recent proximity
  audio from a 6s WebAudio ring — never uploaded), HUNTS during blackouts
  (2.55 c/s, instant kill), FLEES an active flashlight beam (≤16 cells,
  ~23° cone, LOS) and retries. SCP-4666 audio ONLY while hunting.
  BACKROOMS_STALKER_DEBUG=1 traces the brain. Staged pathfinding hardened
  for all creatures (deterministic spiral waypoints, fallback chain, node
  guard 12000).

**PATHFINDING: A*, AND NOBODY FREEZES (Aug 2026 review).** Every creature
shares `findPathIn`, and it was a plain breadth-first flood. A flood expands
equally in all directions, so most of its budget went on ground away from the
target — measured on the real Sector A, a mark **8 cells** away already cost
4,122 nodes at p90 and 86,252 at worst, and **8.3% of ordinary 16-32 cell
repaths hit the 12,000-node cap and returned nothing at all.** Every chase
then did the worst possible thing with that: stand still. In a 25-second
pursuit simulation, **13 of 111 creatures never moved a single cell.**

- **A\* with a Chebyshev heuristic** (admissible and consistent — all eight
  moves cost 1): 2.5-4.6× fewer nodes, ~2× faster, and verified over 2,000
  pairs on both sectors to return paths of **exactly the same length**. A pure
  search upgrade, not a behaviour change. The old array-as-queue also used
  `shift()` (O(n) on a 12,000-entry queue); it is a binary heap now.
- **Partial paths.** When the budget does run out, pursuers get the route to
  the closest node the search reached instead of nothing, then re-plan from
  nearer. Frozen creatures in that same sim: **13 → 0**. It is OPT-IN
  (`partial`) because `shyPlaceNear` uses an empty result as a reachability
  TEST, and a half-path would be a lie to it.
- **Stale give-up clocks.** `noRouteSince` was only ever cleared in the repath
  branch, so a creature that failed to route behind a wall, then came round it
  and charged you down a clear line, still carried the old timer — and broke
  off the instant the line snapped. **This was Josh's "he chased me, then he
  ran away"**: it never stopped closing, it just aged out. A clear line, and
  standing at your shoulder, both count as having a route now.
- **The entity could spawn inside a lethal pit.** Level 0 has 155 pit cells
  and — measured — **not one has a legal way back out** (the climb rule lets
  you drop in and never climb out), so an entity seeded in one was gone for
  the life of the process. Every other placement already screened for pits;
  the first one didn't.
- The stalker no longer stands in plain sight when it cannot route to a
  hiding spot (it bolts away instead), and its "are they walking at me" check
  goes through `facingOf` rather than an inlined copy of the sign convention
  this file has already shipped one bug from.
- **Pools relics**: `POOL_RELICS` (10, Josh's Pool Rooms art) spawn ONLY on
  Level 1 (own site list + spawner); L0 keeps the original ten. Level-aware
  streams and pickups.
- **Footsteps**: tile + water banks (Josh's samples, onset-sliced).
- **THE LEVEL DOORS (Aug 2026)** — Josh's model + his recording, on both
  transitions (THE DOOR on Level 0, THE LANDING back from the Poolrooms; they
  share `makeDoor`). The source GLB was unusable three ways, none visible from
  outside: **KHR_materials_pbrSpecularGlossiness**, which three.js REMOVED
  from GLTFLoader (it would render untextured white while still downloading
  everything); 5.23MB of which 4.78MB was texture, the biggest being the
  spec-gloss map we convert away from; and a backdrop plane, wall slab and
  hemi light from the turntable render. `scripts/convert-door.mjs` fixes all
  three — **5.23MB → 515KB**, geometry and animation intact. **The clip opens
  AND CLOSES** (90° at t=3.13s, shut again by 7.47s), so the swing is driven
  by hand via `mixer.setTime()` and parked at the peak; play it whole and the
  door shuts in your face. Doors orient to the axis you can walk through
  (`doorYaw`), so they never sit flat against their own wall. Re-run the
  converter only if Josh replaces the source.
- **PROXIMITY VOICE: range + room size (Aug 2026).** Hard gate 36 → **48m**,
  rolloff 1.4 → **1.2**. 48 is not arbitrary: the POSITION wire runs to 28
  cells / 56m and audio must stay strictly inside it, or a voice could exist
  with nowhere to place it — 8m of margin. **Two impulses, crossfaded on the
  room you are standing in**: one reverb can only describe one room, so a
  corridor rang exactly like a flooded hall. Short/dark vs long/open, plus a
  pre-delay that grows with the space because distant walls answer late.
  **The measurement must march THIN WALLS** (`rayReach`), not `solidAt`:
  Level 0's rooms are wallN/wallW edges and almost nothing is a solid cell, so
  a solidAt march sailed through every partition and measured 92% of the map
  as one hall — the crossfade would have been stuck wide open. Marching walls
  gives Level 0 a real spread (28% tight / 32% open); the Poolrooms stay
  mostly wet, which is correct for open flooded chambers.
- **ASSET BUDGET (measured Aug 2026).** 57MB under `client/public/assets`,
  43MB of it GLB (45% texture). The runtime is fine — ONE allocation in the
  1200-line render loop, and chunk pruning disposes geometry while skipping
  shared prop geometry — so cost is all download and draw. The outlier is
  **`entity.glb`: 11.18MB, 231,424 triangles, 135 bones, 7 skinned meshes and
  NO textures**, loaded eagerly on entry (deliberately — fetching 11MB at the
  moment the server says "it's near" is worse). That is ~15-20× a normal game
  character. If it ever needs to come down, the zero-visual-risk lever is
  geometry compression (Draco/meshopt), not decimation. Props are 93-99%
  texture but load lazily per kind.
- **MAP REDESIGN CANDIDATES** (`worldgen-pools2.ts`, renders in
  docs/backrooms/candidate-*.png) awaiting Josh's VOTE — brief: NO mazes,
  much higher ceilings, water everywhere, 2–4 story structures tied by
  staircases. Shared blocks: climb-legal ZIGGURATS (stair flights every
  side, walkable plateaus, rooftop pools with raised water), causeways,
  cascade courts, moated pavilions. Styles: **lido** (cathedral courts +
  The Ziggurat lake), **cistern** (a wading sea, tower islands, causeways,
  76% water), **atrium** (mega-rooms, moated pavilions, flooded halls).
  All 100% reachable, zero stranded, water MUST-ZEROs clean. The winner
  still needs: client district heights/skylights for its types, landmark
  naming, freeze + fingerprint, and an in-game iteration pass.

### THE POOLROOMS v3 — the reference rebuild (SHIPPED Aug 2026, replacing P2)
Josh's brief: study `assets/references/pools references` INTENSELY and
replicate the structural design — the FBX kit's archways, no tiered
ceilings, very high ceilings, curving tunnel mazes with water, rivers to
sail (boats later), deeper water you SWIM in. **SECTOR P3, seed 20260901,
384×384, fingerprint-verified.** All-interior districts:
**natatorium** (organic swim pools in white decks, round pillars IN the
water, skylights, +8-step mezzanine reached by a heightmap SPIRAL around a
tiled core) · **vaultsea** (deep water wall-to-wall, an ARCH FOREST
springing from the surface, one curving raised walkway) · **portalhall**
(a 5-cell NAVE walled off down the axis, full-CIRCLE portal rings every 8
cells over a knee-deep channel, colonnaded AISLES through arched doorways)
· **tunnels** (bezier-carved curving maze, wading water, porthole walls,
round chambers w/ concentric swim wells) · **shallows** (waist-deep pillar
field under skylights) · **rotunda** (ring wall + arched doorways +
amphitheater steps into a round pool) · **baths** (small rooms, private
sunken pools). TWO RIVERS (floor −6, 2.5m deep — boat-ready) wind the whole
map and meet at **The Confluence**; low bridges (+1 deck, kit-dressed)
carry a few crossings, everywhere else you swim.
**ONE WATER TABLE:** water is DERIVED, not flooded — surface −1 step
everywhere, any floor below it is wet, dry floors are ≥0, containment is
by construction (spillEdges === 0 is an assert, not a hope).
**THE EFFECTIVE FLOOR (the climb-rule triple, extended):** Sector.eff =
max(floor, table) — a swimmer floats at the surface, so climbing out onto
any quay ≤1 step above the WATERLINE is legal. Worldgen connectivity
(neighbors), the server's edgeOpen, and client collision (effStepsAt) all
read it. The harness floods every deep body and asserts a climb-out exists
(148 bodies, 0 traps).
**SWIMMING & DROWNING:** depth ≥3 steps (1.5m) = swim — you SINK slowly,
SPACE swims up (5 stamina/s — less than a jump), CROUCH dives; head under
the waterline runs a 10-second drown clock. The client reports submersion
({type:"swim"}, gated server-side to swim-deep cells); the SERVER owns the
clock and the kill ("the deep" in the ledger, cause "drowned" on the wire,
corpse where you sank). Breath meter + underwater wash client-side; swim
ENTRY clamps to near-surface (a resumed session standing on a pool floor
must never wake up drowning — the first Vault Sea death was exactly this).
**FALL RULES (Josh: "it's a game, don't be so punishing"):** ANY water
breaks a fall; dry falls under 6 steps (3m) are free; above that the damage
table reads fallDamage(drop−3); lethal SHAFTS keep the full table. Client:
walking off a ledge converts the height into jumpY (real air time) instead
of vacuuming the eye down.
**THE DECO LAYER:** Sector.deco (kind*16+variant, hashed into the
fingerprint when present, streamed with chunks) dresses the world with the
TheBackroomsAndPoolrooms FBX kit (client/public/assets/pools/kit, ~41
pieces, bare geometry): arch(2) — **GENERATED, not the kit: the pack's
"Archway" is a curved wall SHEET that read as floating paper (Josh's
revalidation); archGeometry() sweeps a real rectangular masonry section
over a semicircle with legs planted below the water/floor** — portal
ring(3 — Wall_Circle_wide_tunnel), porthole(4), bridge(5), skylight(6 —
ceiling glow cut), cubby(8), ladder(9 — procedural chrome tubes);
pillar(1)/spiralcore(7) mark 2×2 solid blocks the client renders as giant
tiled CYLINDERS (box removed, collider stays square; the water sheet runs
UNDER the drum so the waterline meets it — never a square dry notch).
Arch variant rule: v0 = opening faces N/S (span E-W), v1 = E/W — the
worldgen and the client renderer must agree or arcades turn into rows of
detached panels. Kit pieces get BOX-PROJECTED world-scale UVs and wear the
same 0.325m tile canvas as the walls; geometry is SHARED across chunks
(userData.shared + the "kit:" name guard keep pruning from disposing it).
ONE WATER LOOK everywhere (Josh: "all the same colour — the shallow teal is
more calming"; the dark deep sheet is gone). The RIPPLE RIDES THE SURFACE —
two soft caustic webs drifting against each other ON the water plane, with
a dimmer glow left on the floor beneath ("the texture of the top of the
water was on the bottom"). Ceiling troffers thinned to a quarter on L1.

**Harnesses live in the REPO now** (they used to be scratchpad-only and died
with the session): `node scripts/checks/test_pools3.mjs` (RETIRED Sep 2026 with P3 — its successor is test_pools.mjs, below) (31 asserts — the
frozen fingerprint, reachability, water/deco/eff invariants, the swim-exit
audit, dry aprons) and `node scripts/checks/validate_map.mjs` (21 DESIGN
checks — deco grounding, arch footings, bridge decks, waterline lips,
orphaned water, relic space, archive placement, relic art, and the three
pillar checks). Build first (`npm run build`); both must be green before a
map change ships.

#### The August 2026 polish rounds (all SHIPPED)
- **ARCHES ARE GENERATED, NOT KIT.** The pack's "Archway" is a curved WALL
  SHEET — rows of them read as floating paper. `archGeometry()` sweeps a real
  rectangular masonry section over a semicircle with straight legs, extruded
  to real depth. Over water the legs plant a metre BELOW the surface; doorway
  arches span wider than their gap so both ends bury in the flanking walls.
  Generation REFUSES any arch whose footing falls away more than a step (the
  "paper thin arches over the rivers" were arches beside a channel with a leg
  hanging over it).
- **ARCADE PIERS** (reference pass, i9l4qjb8a2x81 / Blue_Tiles): the source
  images show arches as OPENINGS IN A MASONRY ARCADE, never free-standing —
  so every vault-sea arch now gets a solid pier on both flanks and a row
  reads as a wall pierced by arches.
- **KIT MASONRY COLLIDES.** Deco is visual, so the client synthesizes
  per-axis colliders from it: a slim pier at each arch leg, a barrier down
  both sides of every bridge deck. Prop collision grew `rx`/`ry` (server
  furniture keeps its single `r` and reads square).
- **PILLARS ARE ALL-OR-NOTHING.** A pillar is a 2×2 SOLID block drawn as one
  drum; later passes cut freely and a river will carve through one, leaving
  a cylinder hanging over open water you could walk inside. If the block
  isn't intact the deco is dropped AND the surviving cells cleared. The drum
  radius is 2.0 — exactly the block's half width, so no rim of invisible
  wall. **A final UNREACHABLE-IS-SOLID-ROCK pass** runs last (Level 0's A3
  doctrine, which the pools lacked): the cleanup can open a cell inside
  masonry, and anything the doors can't reach is sealed.
- **RIVERS: broad with graded banks** ("not blocky like Minecraft"). ~17
  cells across on a profile `-6 -6 -6 -5 -4 -3 -2 -1` that leans wider into
  the outside of each bend, so EVERY bank-to-bed transition is a single
  height step and neighbours share corners — the shore renders as one
  continuous slope. Bridges deck the whole span with a 0-height landing each
  side. River cells 2,800 → 4,430.
- **EXITS ARE BUILT DOORS.** Level 0 sprays its red mark on drywall; the
  pools' doors stand in open rooms, so the door is BUILT — tiled jambs, a
  lintel, the same hand-sprayed rectangle on both faces (shared canvas with
  `addDoorMarker`), name on a sign above. Extraction is a deliberate **E**,
  never proximity (walking past one used to end the run). **THE LANDING is
  both doors**: E there opens a panel — step through to Level 0, extract, or
  stay. The server's exit rule accepts ANY pools door.

### THE BOATS (Poolrooms v3.1, SHIPPED Aug 2026; Josh's inflatable + seats, later Aug 2026)
Four boats at deterministic docks — wet cells with a dry bank alongside,
chosen far apart and away from the doors, so a boat is something you FIND.
In-memory like the blackjack tables (a restart re-docks the fleet). **E
boards, E steps off**; the first aboard takes the helm and their normal
movement IS the boat, so anti-teleport, wall rules and fog reveal all keep
working untouched; a second rider is pinned to the hull. A hull needs WATER,
not depth (any wet cell floats it; only dry land turns it back) — server and
client agree, and the client's mirror skips UNLOADED cells because reading
zeros as "dry" pinned the boat in place. Seats validate lazily (death, exit,
travel and the grace reaper all free them; the helm passes to the passenger),
riders never drown, peers see the hull glide with its crew (pose 4), and a
seat is only resumed if the body is genuinely at the hull (an admin flycam
could otherwise drag a boat onto dry tile).
**THE HULL is Josh's green two-bench inflatable** (`pools/boat.glb`, 2.4MB
Sketchfab source → 366KB: both OARS were cut out of the geometry — one was
its own mesh, the other was carved out of the hull by triangle-connectivity
— then webp/quantize; raw source in `assets/boat/`). Loaded and cloned like
the gator; the old procedural punt is gone. **SEATING (Josh): first aboard
takes the BACK bench** (the captain seat — WASD paddles), the second the
FRONT bench. The wire position is the CAPTAIN, so both clients draw the hull
one aft-bench offset noseward of it (`BOAT_SEAT_AFT` 0.39 / `_FORE` −0.44 /
`BOAT_SCALE` 0.65 in BackroomsGame — measured off the GLB's bench geometry);
riders are seated FROM the hull (never from their own wire frames — the
server pins both riders to one position) in the **sitting pose** (`sit` in
MOVE_CLIP → `anim/sitting.fbx`, a single-frame Mixamo pose like crouch-idle;
19 tracks, bench-verified). A rider's feet-origin sits `BOAT_SIT_DROP` 0.23
under the waterline so the clip's measured pelvis (0.264 × the 1.72m suit)
lands on the bench top; the local eye rides `EYE + headDrop`, so the camera
self-corrects to wherever the seated head really is (verified in-game:
0.94m over the water). **BOAT_SPEED = 3.1 cells/s, one pace, no sprint** —
faster than the alligator's 2.85 deep rush (Josh: "make sure the boat is
faster than the alligator"; measured 2.97 over 3s of open water). The wake
reuses the water step slices, paced by hull travel (bench-relative, so a
look-around doesn't slosh) and faded by distance for other people's boats.

### THE RAGDOLL + BLOOD (Aug 2026 — "the initial hilarious death")
Josh: a death should ragdoll the body — thrown by whatever killed them, blood
on the walls — then go still forever. Built with NO physics engine:
- **`client/src/backrooms/ragdoll.ts`** — a 15-particle verlet stick figure
  (pelvis/chest/head, shoulders/elbows/hands, hips/knees/feet) with distance
  constraints + braces, colliding against the SAME grid the player does
  (groundAt, walls/solids, raised-floor sides at particle height, ceilings,
  water = buoyant damping). Each frame the REAL skeleton is aimed along the
  particle segments (`setFromUnitVectors` deltas re-expressed per parent,
  pelvis bone rides its particle, plus a spine-axis ROLL correction from the
  shoulder line so the torso genuinely tumbles). The suited clone comes from
  `makeRagdollBody` in world.ts (idle-posed once, identity group so bone
  world space is scene space, `frustumCulled=false` — flying bones leave the
  bind sphere). Hard contacts above 2.6 m/s call out (blood + a step-slice
  thud).
- **THE WIRE (`BrDeathEvent`)**: every `killPlayer` now fires `onDeath` →
  net sends `{type:"death", x,y, rx,ry, dir, power, seed, cause, suit}` to
  the victim's socket AND sendNear — BEFORE the dead/bye frames. **The
  server owns the rest spot**: an `impulse` slides the corpse along the
  throw under `stepAllowed` (never through a wall, never past the power —
  harness-asserted), so LOOT lives exactly where every client's ragdoll
  settles; the seed makes all clients replay the identical flail (the
  Derby's broadcast-seed pattern). Per-killer impulses: **the entity 3.4**
  (the launch) · **the shy guy 4.5** along the charge · **the stalker 2.6**
  · **the gator 0.9** along the mouth (a death roll, not a launch) ·
  drowning/falls/forfeit crumple (power 0, still ragdolled). Creature kill
  events (`entityCb`/`shyCb`/`stalkerCb`) capture the kill spot BEFORE
  killPlayer mutates it.
- **THE SWAP**: the matching bodyMap corpse spawns HIDDEN while its ragdoll
  flies; when the flail settles (a full second of stillness, gliding home to
  the rest spot; ~4.6s cap) `finishRagdoll` removes it and reveals the
  static corpse — still forever after, exactly the ask. Max 6 concurrent
  (oldest force-settled). **Your own death**: the camera steps back opposite
  the throw (wallHit-clamped) and tracks the tumbling pelvis for 2.3s before
  the red screen (`dying` freezes input, viewmodel + held item hidden).
- **`client/src/backrooms/blood.ts`** — three layers, all procedural canvas
  decals (shared geometry + 3 shared materials, 140-decal FIFO): the BURST
  at the kill (46 droplet Points + 9 wallHit rays stamping splats on
  whatever they find within 3.4 cells), IMPACT SMEARS where the ragdoll
  actually hits, and the deterministic-by-id POOL under every streamed
  corpse (latecomers find the body lying in dried blood without the server
  persisting a decal). Venous dark reds, not arcade. **Gated by the pause
  menu's "Blood & gore" toggle** (`brSettings.gore`, default on; the ragdoll
  itself always plays). DEV hook: `window.__brRagdoll(dir?, power?, seed?)`
  throws a client-only test body from your feet.
- Verified: dev-hook throws on L0 (ballistic arc traced numerically, body
  sprawled at a wall base under its splat on screen), a REAL forfeit death
  end-to-end (death frame → own ragdoll uid → hold → red screen → corpse),
  and the gator/shyguy/pools3 harnesses green — test_gator gained the
  death-roll assert (slide ≤ its 0.9 power; caught a real overshoot).

### SWIMMING, DROWNING, FALLING (the water rules)
Depth ≥3 steps (1.5m) = SWIM: you sink slowly, SPACE swims up (5 stamina/s,
cheaper than a jump), CROUCH dives. Swim mode waits for the FEET to break
the surface — an arc over a channel used to yank you in. Head under runs a
10-second breath clock, then the water takes **10 hp/s** until you surface
(Josh: "just drain their health until they die"), so a healthy diver has
~20s under. The client reports submersion; the SERVER owns the clock, the
damage and the kill ("the deep" in the ledger, `drowned` on the wire).
**Fall damage lands when you do**: the server OPENS a fall (remembering the
highest point) and settles it when the client's pose says the feet are
down — checked every frame, since a straight-down fall never crosses a
cell, with a 3s cap so nobody hovers to dodge it (the pose is parsed BEFORE
the move so the settle can't read a stale frame). Water breaks any fall;
dry falls under 6 steps are free; shafts keep the full table. Client-side,
the JUMP ARC freezes its ground reference at takeoff and only lands on what
is actually beneath it — re-basing every frame is what "sucked you to the
ground" across ledges.

### THE POOLROOMS ARCHIVE — 20 drives (P01–P20, SHIPPED Aug 2026)
Level 1's own lore strand in `lore.ts` (`POOL_DRIVES`), found ONLY down
here: arriving in ankle-deep water, the impossible water table, how to swim
and how not to drown, the arcades, domes and winding tunnels, portholes lit
from a space with no volume, a Threshold-4 requisition that quietly bans
sonar after two surveys didn't return, and whoever keeps untying the boats.
`driveSites(sector, drives)` takes the catalog now; placement is
deterministic and **STANDABLE** — never anywhere you'd have to dive, since
a dropped drive in deep water is a lost drive. Ids are **P-prefixed** so the
two archives can never collide; `driveById` searches both, and unlocking is
global and permanent exactly as on Level 0.

### THE SHY GUY — the Poolrooms' creature (SHIPPED Aug 2026)
Josh settled the pending monster question by dropping in a model: **SCP-096**
(`assets/pools entity/`, gitignored; the shipped copies are
`client/public/assets/pools/shy.glb` + the mastered `shy-scream.ogg`). The
three earlier proposals (Swimmer / Wader / Reflection) are moot — 096's canon
IS the design, and it fits the level better than any of them, because the
counterplay is the water the level is already built around.

**The rules, in Josh's words and how they're enforced:**
- *"only appear when players obtain a relic"* — the brain is inert unless some
  Level-1 session has `relics.length > 0`. An empty-handed swim never meets it.
- *"spawn in an area near the player, not in direct line of sight, like around
  a wall"* — `shyPlaceNear` searches 8–18 cells out and REJECTS any cell with a
  clear line to any player, and any cell it couldn't walk to its mark from.
  Nobody ever watches it arrive. (Harness runs 10 spawn cycles and asserts
  zero were visible.)
- *"follow them until they make eye contact"* — it shadows at `SHY_RING` 8.5
  and PROWLS around that ring (a step every 2.5–5s). It has to keep moving or
  it can never come round a corner into your view, which is the only way the
  encounter starts.
- *"direct aim cursor on his model"* — the CLIENT owns that precision: a
  crosshair raycast against the model's own triangles, gated behind a cheap
  angular pre-test, and it must be the FIRST thing the ray hits (raycasting
  the creature alone happily "sees" it through a pillar). The server treats
  the report as a claim and re-checks range, line and facing, and keeps its
  own conservative backstop cone — sustained, model-width — so a client that
  simply never sends the report doesn't become the meta.
- *"start running towards the player screaming"* — the trigger is a 2.2s
  PANIC first (`scp096panicstart`, hands over the face, the scream starts on
  that frame), then the charge at **`SPRINT * 2` = 5.7 cells/s** (Josh, Aug
  2026: "make him run at 2x the speed of the players sprint as well" — the
  same bargain the stalker got). A sprint is 2.85, so on dry land this is not
  a race, it is a countdown, and the counterplay is the water rather than your
  legs. The wading caps below are floors on this, so doubling the land speed
  leaves the water doctrine untouched.
- **IT CREEPS (Josh, Aug 2026).** "Make him watch the players from a distance,
  moving in on them when no one is looking at him, like very ominous." The
  old shadowing RING is gone — holding a fixed distance and closing in are
  different creatures, and this is the one he wanted. While anyone has a
  clear line to it and is facing its way (`SHY_WATCH_DOT`), it stands
  perfectly still and watches back; unobserved it walks in at
  `SHY_CREEP_SPEED` 1.15 and stops at `SHY_CREEP_MIN` 4.5 cells. You glance
  away, glance back, and it is nearer than it was. Measured in the engine:
  15.2 → 8.0 cells over nine seconds.
- **EYE CONTACT IS FORGIVING.** "Make it a little more easier to get chased" —
  the trigger is no longer a triangle-exact hit on the model but an angular
  window `SHY_AIM_GRACE` (2.4×) its own silhouette, so the crosshair on him
  *or just beside him* sets him off. Occlusion is still checked (a pillar
  between you is not eye contact) and the server keeps its own tighter
  backstop cone.
- *"he can walk in water thats fine but he is slower than the player in
  water"* (Josh's revision, Aug 2026 — it initially REFUSED swimmable water,
  which produced no end of frozen-at-the-shore behaviour). Water is a **speed
  tax** now, pinned band-for-band against the player's own wade/swim scales
  and set under the player's WALKING speed everywhere, not just their sprint:

      depth        player walk / sprint     THE SHY GUY   measured
      dry          2.05 / 2.85              5.70          5.67
      >0.15m       1.60 / 2.22              1.45          1.45
      >0.6m        1.13 / 1.57              1.00          1.00
      swim         1.03 / 1.43              0.80          0.80

  If those player scales in `BackroomsGame.svelte` ever change, change these
  — the harness measures the real numbers off the wire and fails on drift.
  **The tax is charged on the cell it steps INTO as well as the one it steps
  from** (`moveAlongIn`'s `tax`): reading the cap only at the origin let it
  cross a whole tick's worth of ground into water at its land pace, which was
  invisible at 3.5 cells/s and broke the promise outright at 5.7 — the harness
  clocked 1.73-1.80 through shallow water where the cap is 1.45.
  The escape is therefore a GAP, not a surface: open `SHY_LOSE_GAP` (16
  cells) for `SHY_LOSE_MS` (3s) and it gives up. On dry land that gap can no
  longer be held at all, so water is now the ONLY escape, which is the point.
  It still refuses one thing — a lethal pit shaft.
- *"run away screaming out of line of sight and despawn"* — breaking off
  retreats away from everyone and vanishes the moment nobody holds a line to
  it (hard cap 25s). It comes back after 70–170s.
- *"if there are other players around, he will attack them after killing the
  relic holder"* — a `SHY_BLOODED_MS` 12s window after a kill in which anyone
  within 11 cells is fair game, relic or not.

**Three real bugs the verification pass caught (do not regress):**
1. **The facing convention was inverted server-side.** The client sends its
   raw camera yaw and YAW 0 FACES −Y, so facing is `(−sin h, −cos h)`. The
   server was reading `(sin h, cos h)` — every look-cone pointed out of the
   back of the player's head. This had been shipped in **the stalker's
   flashlight check**, which therefore fled when the beam pointed AWAY from
   it and ignored one in its face. Both now go through `facingOf()`, and the
   harness pins the convention against the renderer's own forward vector.
2. **Diagonals cut corners.** A path can step diagonally between two legal
   cells while physically passing through the deep-water cell between them —
   which is how it kept clipping the corner of a pool while "following a dry
   route". `findPathIn` now requires a diagonal to have an L-route that is
   both open AND dry; string-pulls re-check the same refusal; and
   `moveAlongIn` has a hard backstop that simply refuses a step landing in
   forbidden ground. Verified with an adversarial 40-chase waterside sweep.
3. **It stood frozen at range.** Holding the ring perfectly still left it
   inert between the two range bands, and on this flooded map a mark is often
   across water it won't cross. It now prowls, and gives up after 8s of
   finding no dry route (`noRouteSince`) rather than posing there.

Server: the shy block in `service.ts` (+ `ShyEvent`, `onShy`, `shyLook`,
`summonShy`); wire in `net.ts` (`shy` frames level-scoped, explicit `gone`,
inbound `shy-look`); admin lever `POST /api/admin/backrooms/summon-shy`
(it normally only comes for a relic carrier, which makes it awkward to
playtest — a summon ignores that for one visit; you still have to LOOK at
it). Client: the SHY GUY block in `BackroomsGame.svelte` (loader, clip state
machine, glide, crosshair test) + `shyScream`/`shyQuiet`/`updateShySound` in
`ambience.ts`. Timings are env-dialable
(`BACKROOMS_SHY_TRIGGER_MS`/`_LURK_MIN_MS`/`_LURK_MAX_MS`/`_GAP_MIN_MS`/
`_GAP_MAX_MS`). Harness: `node scripts/checks/test_shyguy.mjs` (35 asserts,
drives the real service with injected sessions).

**HE ROUTES BY TIME (Sep 2026, the rebuilt Poolrooms).** P4 is built round rivers, and a map of banks and shallows exposed a hole: the chase path cost every cell the same and his straight-line charge took any walkable line, so a runner curving along a towpath dragged him through the bank's shallows at walking pace and escaped on dry land (the harness caught it: 8.4 → 11.8 cells). Now `findPathIn` takes a `costOf` and his chase is costed by travel time (`shyCost` = chase speed ÷ his speed in that water), and the straight charge is taken only when the line stays dry — or when you are in the water yourself. Water is still where you take ground back; it just can't be the shortcut that saves a sprinter on dry tile.

### THE ALLIGATORS — one per large body of water (SHIPPED Aug 2026)
Josh's brief, implemented literally: an inflatable-crocodile pool float
(`client/public/assets/pools/gator.glb`, 9.9MB source → 1.1MB via simplify +
webp + quantize — head verified +Z on the bench, `GATOR_FLIP = 0`) resident
in **every large body of water** — a connected wet region of **≥800 cells
with waist depth somewhere** (`GATOR_MIN_CELLS`/`GATOR_MIN_DEPTH`), which on
frozen P3 is **15 gators**, spawned at each region's deepest cell at boot. (P4, rebuilt from rooms Sep 2026, holds **10**: footbridges split each river into reaches, and the harness now counts the qualifying waters from the map rather than a fixed number.)
No spawn/despawn lifecycle, no animations by design (it's a pool float; the
client gives it a bob + roll + waterline ride instead).

The rules (Josh, Aug 2026, all server-side in the gator block of
`service.ts`):
- **It will not chase or target a player unless the player is IN THE WATER
  and in its LINE OF SIGHT** — both required to start; a deck-stander in
  plain view, a boat rider (`boatId` set), and a walled-off swimmer are all
  ignored. Once committed, losing line of sight changes nothing; **leaving
  the water is the only way off the menu** (it breaks off the moment the
  target's feet find dry tile).
- **It NEVER leaves its own body of water.** The flood-filled region is its
  cage (the shun rule + moveAlongIn's hard backstop) — THE SHY GUY inverted:
  his water is where you escape TO, the gator's water is what you escape
  FROM.
- **Speed: twice the player's swim speed in the deep** (2.85 vs a
  sprint-swimmer's 1.43) — but in WADING water it flips (Josh, Aug 2026:
  "if the player is not swimming... they should be able to outrun the
  alligator slightly"): waist 1.45 · ankle 2.05, ~8% under the player's
  sprint bands (walk/sprint: swim 1.03/1.43 · waist 1.13/1.57 · ankle
  1.60/2.22). Anywhere your feet still touch bottom a sprint pulls away;
  deep water is its killing ground. The escape gradient reads "get
  shallow, get OUT" — and the BOAT (3.1 cells/s) outruns it everywhere.
- **THE MOUTH IS THE WEAPON**: a bite lands only if the mouth — centre +
  facing × `GATOR_MOUTH` (0.9 cells; the server owns the heading and sends
  `h` on the wire so the client renders the same facing) — touches a body
  (`GATOR_BITE_R` 0.6). **One bite every 1.5s, 34 hp each, THREE bites to
  kill.** The chase glides to hold the mouth on the target rather than
  overlapping it. Kill cause: **"an alligator"** (death ledger + dead frame).
- Idle it cruises its pool (slow random meander, only while someone is
  within `GATOR_WAKE` 45 cells — empty pools cost nothing and transmit
  nothing).

Wire: `gator` pos frames (id/x/y/h/mode, sendNear level 1) + `gatorBite`
frames — the **munch** (`assets/alligator/munch-sound-effect.mp3` →
`gator-munch.ogg`, one-shot in `ambience.ts` with the standard distance/wall
physics). Victim hp rides the normal hurt pipeline (cause `gator`). Admin
map debug carries `gators`. Harness: `node scripts/checks/test_gator.mjs`
(27 asserts — population/regions, every non-provocation case, the chase,
tail immunity with a stall-detecting retry, per-bite mouth-on-body geometry
from the bite frames, 3×34 cadence, deck break-off, and a run-long cage
watcher). NB the tail-pin lesson: a body pinned AT the tail tip of a
turning gator legitimately gets bitten within ~3 ticks — the harness pins
at 2.0 cells and proves the mouth rule positively from the bite frames
instead.

### SWIM + TREAD ANIMATIONS (Josh, Aug 2026)
Two new Mixamo clips on the shared hazmat rig (bench-verified in-place,
drift 0,0,0): `swimming.fbx` (4.5s stroke) and `treading.fbx` (3s). One
vocabulary for peers and the viewmodel (MOVE_CLIP `swim`/`tread`):
- **The stroke engages at WAIST DEPTH (>0.6m), before the feet leave the
  floor** — peers set `PeerAvatar.swim` from the water depth at their cell
  in the peer loop (never for boat riders); the first-person arms follow the
  same rule (`depthHere > 0.6 && inTheWater && player.moving`).
- **Going nowhere horizontally = treading water** — including swimming
  straight up or down ("vertical is not a direction"): swim pose without
  horizontal movement plays `tread`; a wader standing still in waist water
  just stands (their feet are on the floor).

### THE DROWNED PALACE — Poolrooms v2 (RETIRED Aug 2026; the P2 notes stay for the record)
Josh voted "build whatever you think is best": the hybrid. **SECTOR P2,
seed 20260808, 322×322, fingerprint-verified** (P1 retired; its world-state
rows sit unloaded until the age sweeps clear them — service skips corpses
from retired sector ids). The SEA is the fabric (flooded expanses, tower
islands, causeways, trenches, column forests), punctuated by cathedral
COURTS (gallery ring + grand basin), moated PAVILION ziggurats with ROOFTOP
POOLS, flooded column HALLS and CASCADE courts — no maze anywhere; district
ceilings 7.5–13m. Landmarks named from the biggest set pieces (The Ziggurat,
The Grand Court, The Pavilion, The Cascades + quadrant variants). SEAS and
floodhalls flood from NINE seeds (the Landing's own sea shipped 0% wet when
its two seeds died under the flattened apron and an island ziggurat).
**WATER LOOK v2** (matched to Josh's reference screenshot): ~50cm floor
tiles with pale-blue accents, water at opacity 0.45 with a teal wash the
tile reads through, and FAKE CAUSTICS — two additive light-web layers
(procedural tiling canvas) drifting against each other on the submerged
floor, breathing slowly. 44% of the palace is under water.

### EMOTES + 8-WAY LOCOMOTION (Josh, Aug 2026)
Two asks in one batch: "new movement animations… add these in" and a
Fortnite-style emote wheel (his reference image sat in assets/Models/emotes/).

**8-way locomotion.** The Mixamo set grew to 14 clips
(`client/public/assets/hazmat/anim/`): walk + run in all four directions,
crouched fwd/left/right (crouched BACK is the forward clip cloned and played
at timeScale −1 — no source clip exists), idle, crouch-idle, jump. All
bench-verified against the rig: 19 tracks, 18 bones, zero unbound, in-place
root profiles (only jump carries real root travel, still stripped at load).
One vocabulary for both bodies (`MOVE_CLIP`/`buildMoveActions` in world.ts):
the local viewmodel picks direction from the INPUT AXES (the one body whose
input we know), peers derive it from where the body is headed vs where it
faces (`moveSuffix`, target-minus-position against wire heading) — a strafing
peer used to march forward while sliding sideways. Forward wins diagonal
ties. Missing files degrade down the fallback chain, never to a T-pose.

**THE EMOTE WHEEL.** Hold the emote key (default **B**, rebindable in pause →
Controls; the admin geometry probe moved B → P to make room) → a radial of
ELEVEN dances (`EMOTES` in world.ts: hiphop, gangnam, twerk, backflip,
chicken, silly, bboy + **house, snake, soul, freeze** (Josh, Aug 2026) —
`client/public/assets/hazmat/emote/`, lazy-loaded on first use, ~4MB the boot
path doesn't pay). The pointer STAYS LOCKED (the
Mac shell has no Pointer Lock API, so "unlock for a real cursor" isn't
portable): deltas steer a virtual cursor, the wedge under it lights, click
OR key-release plays it; the hub is a dead zone so a tap never mis-fires.
- **A dance roots you** (Josh: "they can't move until that emote finishes"):
  ctl.mods.scale = 0, jump/crouch/interact/drop/clicks gated. It plays ONCE
  (LoopOnce + clampWhenFinished = the finish line) — death is the only
  interrupt. Yes, the entity can kill you mid-twerk. That's the game.
- **Third person for the dance**: the camera leaves the head and orbits a
  STAND-IN body (`makeEmoteBody`) — the first-person viewmodel can't be
  filmed, its mask faces are cut from the mesh at build. Mouse orbits;
  a chest-origin raycast clamps the lens out of walls (2m corridors).
  Cam/screen rules untouched; first person resumes the frame it ends.
- **Replication**: `em` rides the move frames (gamenet/net.ts), validated
  server-side against the fixed id list (garbage relays as "" — proven with
  a wire harness sending "hax"), stored on the session, included in intros
  so a late arrival sees the dance from where it is. Peers play it via
  `setAvatarEmote` → the same LoopOnce clip; locomotion weights drop to
  zero while it runs and recover when the clip clamps or the wire clears.
- Root motion on emotes is KEPT (every dance measured returning to its
  start on the bench; the body dances around its anchor, the anchor never
  moves). **Adding a dance = FBX into emote/ + the EMOTES list (world.ts) +
  EMOTE_IDS in BOTH relays (src/backrooms/net.ts AND src/casino/floor.ts —
  the casino floor runs the same wheel).** Forget one and the dancer dances
  alone: the room sees nothing. `test_casino_floor.mjs` now reads all four
  places and refuses to let them drift, and relays every id for real.
- **Measure a new clip before wiring it** (Aug 2026, the four Josh added).
  On the bench: does it bind to the rig (0 unbound tracks) and does the root
  end where it started? Then in-engine, per clip, the lowest/highest bone and
  the widest swing from the anchor — `hiphop` is the yardstick at
  −0.09 / 1.73 / 1.09m. house 1.38 · snake 0.95 · **freeze 1.77** ·
  **soul 2.17** metres of swing: the two acrobatic ones throw the body twice
  as far as a standing dance, which is a room-vs-corridor judgement, not a
  bug. Floor contact is identical to the shipped seven (−0.093m is where this
  rig's toe bone sits), so none of them sinks.
- The wheel's tangential room is what a wedge count costs: at eleven, the
  casino's pill ring went r150 → r200 and the backrooms' SVG labels
  102/15px → 112/12px. Both measured (browser text metrics, then looked at).

## LEVEL 2 — PIPE DREAMS (DESIGN, not built — Josh, 2026-09-26)

**Status: design round 2 (decisions settled 2026-09-26). Waiting on Josh's asset pack** (industrial kit,
textures, sounds — he will hand over a directory). Nothing below is code yet.

### Josh's decisions
- **DARK.** The first dark level: sparse caged bulbs, real darkness between
  them. The flashlight upgrades at Threshold-4 finally matter.
- **THE WAY IN IS A DRAIN HATCH at the bottom of the Poolrooms' deepest
  pool.** That is Level 1's door, per THE DESCENT rule (one door per level),
  so Level 1 gains its own key and door as part of this work. Diving to it
  runs the ordinary 10-second drown clock.
- **HEIGHTMAP ONLY.** One floor per cell, as every level so far. "Floors" are
  elevation bands joined by stairwells; true stacked corridors wait for a
  level that needs them (Terror Hotel).
- **INDUSTRIAL.** Maintenance tunnels · industrial rooms large and small ·
  employee areas with lockers · engine rooms · stairs to different floors ·
  locked doors as SCENERY ONLY · hot gas spraying from pipes.
- **ONE DEPLOY POINT, 16 PLAYERS.** The drain hatch's landing is the only
  entrance (and the only fast-travel drop) and it takes the whole cap of 16 —
  where Level 0 splits 16 across four doors.
- **THE LOOP**: explore, find the relics (10 — the Rusted Key's arithmetic)
  and the data drives (20, its own archive strand); find **THREE FUSES**, carry
  them to the **FUSE PANEL** beside the door to Level 3, insert all three,
  press the button, and the door to Electrical Station opens.

### THE GRABBER (Josh's design; named by Josh)

**THE BODY IS LEVEL 0'S STALKER** (Josh: "reuse the level 0 monster and call
it the grabber") — the black-painted `assets/stalker` model and its clips
(Idle/Walk/Attack/Attack Near), reused per the reuse-uniformity law; the
brain below is new. **CONFIRMED by Josh 2026-09-27: "Reuse level 0"** — the
stalker, the one that already flees a beam.
Josh: *"a monster that will sneak up on you and grab you turning you around
and killing you … you hear footsteps and monstrous breathing (like a creature
so hungrily excited to grab you) but when the player turns around and shines
it with flashlight it screeches and runs away. the creature does not always
harass the player it will be random and the player will not hear the creature
until its close."*

- **IT VISITS, IT DOES NOT PATROL.** Idle and silent most of the time. On a
  random clock it picks ONE living player (ACCEPTED: a per-player gap of
  ~3–8 min, one approach at a time per creature) and works round BEHIND them —
  out of their facing, never in their line of sight while it closes.
- **SILENT UNTIL CLOSE.** No sound at all beyond ~8 cells (ACCEPTED). Inside
  that: footsteps and the hungry breathing, positional, getting louder. The
  approach speed is the fairness dial: at ~2.4 cells/s an 8-cell warning is
  ~3.3 seconds — enough to turn and light it, not enough to wonder about it.
- **LIGHT IN ITS FACE = SCREECH AND FLEE.** Reuse the stalker's server-side
  beam test exactly (`litByFlashlight` in service.ts, through `facingOf` —
  the reuse-uniformity law, and the one place the sign convention is already
  right). It screeches, bolts out of sight, and the player's clock restarts.
- **THE GRAB.** If it reaches arm's length (~1.2 cells) unlit: the server
  kills, the victim's camera is WRENCHED round to face it for the grab
  (~1.5s), then the ordinary ragdoll death. Cause "grabbed". Everyone nearby
  sees the same grab (one appearance, every observer).
- **ITS PROTECTIONS ARE THE GROUP'S TOO.** A teammate's beam scares it off
  someone else, and proximity voice means "BEHIND YOU" works.

### THE MAP EDITOR'S ENTITIES, HARDENED (Oct 2026)
A spawner Entity (the Game layer's `entity` marker) is the Entity on any level,
and until the Backrooms laws it had none of the work Level 0's own creatures
got. It has now (`spawnShun` / `sheltered` in service.ts, harness
`test_spawned.mjs`):
- **Pits, everywhere** — refused in the route, the string-pull, the straight
  lunge AND the seat (a marker on a shaft is seated beside it). A shaft is a
  one-way step: a creature that entered one was gone for the life of the
  process.
- **Level 0's path hardening**: corner-clearing routes (no diagonal through
  the end of a thin wall), a body-wide lunge, and SPENT NOISE (a noise it has
  reached is forgotten, so it doesn't stand on the spot until its memory runs
  out).
- **The Poolrooms: no deep water.** It used to walk about SUBMERGED, a body on
  the pool floor. It keeps to where a person could stand, and somebody
  swimming in the deep end is out of its reach.
- **Pipe Dreams: the safe rooms are safe.** Break, control and drain rooms are
  the level's promise (the Grabber keeps it too): it never enters one, and
  nobody standing in one is chased.
- **NB the boot seating moved** below the helpers it reads — a call earlier in
  the closure met the Poolrooms' water and the safe rooms uninitialised.

### THE GRABBER, BUILT (Oct 2026)
The design above, as it shipped (`service.ts` → THE GRABBER; client
`BackroomsGame.svelte` + `grabber-audio.ts`; harness `test_grabber.mjs`, 28).
- **LIVE since 2026-10-10**, when Josh heard its five sounds
  (`client/public/assets/pipes/grabber-*.ogg`, workflow law 3): "the sounds
  are fine". It shipped dormant until then — a killer the room cannot hear
  coming would be unfair, so the creature and its sounds went live together.
  `BACKROOMS_GRABBER=0` puts it back to sleep without a code change (the tick
  returns at once and the admin summon refuses).
- **The clock**: every body on the level gets one (`GRAB_GAP` 3–8 min),
  re-armed after every visit; one visit at a time; nobody in a lit room is
  ever picked.
- **The arrival**: 10–19 cells off, in a fan BEHIND the target's facing that
  widens if it must, on walkable floor (`whyNoCreature`), out of EVERY body's
  sight line, with a route to the target that never enters a SAFE room.
- **The walk**: 2.4 cells/s (measured 2.2 in the harness; a sprint is 2.85).
  **Silent past 8 cells** (`GRABBER_HEAR_CELLS`, pinned by a source sweep):
  breathing always, footsteps only while it moves, both fading to zero at the
  edge. A visit that cannot land in 90s ends.
- **The light**: anyone's beam held 250ms (`beamOn`, the Bleeder's generalised
  facing test) — it screeches, the flight cry follows 0.9s later, it runs out
  of every sight line and the target's clock restarts. A one-tick sweep does
  nothing.
- **The grab**: arm's length (1.2 cells) with a clear line → `heldUntil` for
  1.5s, during which the server REFUSES the victim's moves (snapped back) and
  the client wrenches the camera round to face it and holds the keys; then
  `killPlayer(…, "the grabber")` and the ordinary ragdoll. **In its arms your
  own torch is too late** — only somebody ELSE's beam breaks the hold, and the
  victim walks away.
- **The lit rooms** (break room, control room, drain room): it never sets foot
  in one; a target who makes one is waited on 20s, then let go.
- Wire: `grabber` pos (`sendNear` 2), `grabberCry` screech/grab (range 40),
  `grabber {gone}` to the level, `dead` "the grabber". Operator view kind
  `grabber`; admin lever **J on Pipe Dreams** (`POST
  /api/admin/backrooms/summon-grabber`).
- **Verified in the real client** (headless Chromium against a throwaway
  server): the stalk, the "IT HAS YOU" wrench from the victim's own eyes, and
  the death recorded as "taken by the grabber".

### Fuses (the key doctrine, ten fuses for three slots)
- **BUILT 2026-10-10.** Three-for-three had shipped on Sep 29; the law 11
  difficulty review found it, and Josh confirmed the ten. `FUSE_SITES` (10)
  in lore.ts beside `FUSE_COUNT` (3, the slots); a flag per FUSE; the box
  counts any three; carrying more than it has room for puts in only what
  fits; once full every spare is gone (`fuseFindable`, the operator's map,
  a pickup refused). The best route through the way on fell from 960 steps
  (7.8 min at a walk) to 566 (4.6 min). `test_progression` (65).
- **TEN fuses, three slots** (Josh: "put like 10 fuses spread out across the
  map, just to make it not that hard"). Any three fill the panel. Sites are
  deterministic from the frozen seed, spread far apart and away from the
  landing and the panel, exactly like THE KEY.
- **A FUSE CAN NEVER BE LOST**: carried in memory, held by a corpse, or home —
  a death, a rotted body, an extraction or a restart returns it to its site.
  **Costs no inventory slot.**
- **An inserted fuse STAYS inserted, for everyone, permanently** (Josh; a
  `backrooms_flags` row per slot) — the community's shared progress, like the
  drives and the door. The button is live once all three are in; pressing it
  is the one-shot unlock of Level 3, broadcast app-wide with Sterling's line.
- The panel shows 0/3, 1/3, 2/3 to everyone who reaches it. Once it is full
  the spare fuses leave the world (nothing left for them to do).

### Additions (Josh's verdicts)
- **LIT ROOMS ARE SAFE ROOMS** — ACCEPTED. Break rooms and control rooms with working
  lights, which the Grabber will not enter. Dark tunnels between islands of
  light is the natural rhythm of a dark level.
- **LOCKERS ARE PROPS**, scene-setting only (Josh). No hiding mechanic.
- The pipe set below — ACCEPTED, all four.
- **STEAM VENTS ON A RHYTHM** — a hiss about a second before each burst,
  burn damage in the plume. Steam also blocks a flashlight beam, which makes
  a vent a bad place to be caught.
- **HOT PIPES** — a small burn tick for brushing them in narrow tunnels.
- **CATWALKS AND SHAFTS** over engine rooms, reusing the ladder and the fall
  rules; the drop costs HP, it is not a pit.
- **COLOUR-CODED PIPES** as wayfinding (a colour leads somewhere; Async's
  drives explain the code).
- **SIZE: 256×256** — half Level 0's area (Josh: "half the size of the first
  level in terms of total sq ft"): 65,536 cells against A3's 131,044.

### Pipe Dreams assets (inventory, 2026-09-26)
Josh's packs live in `assets/pipe dreams/` (GITIGNORED — raw, ~237MB;
the shrunk copies that ship will go to `client/public/assets/pipes/`).
Measured in a throwaway viewer before anything was tuned:
- **`old_pipes_bundle__modular_industrial_pack.glb`** (4.9MB, one material
  `M_Pipes`) — the PIPE KIT: straights (0.86m / 1.84m), elbow, tee, cross,
  flanged coupling, clamp, flange cap, and a **valve handwheel** ("obturator",
  0.55m). Pipe bore 0.28m. Rusted bronze-black; reads right at once.
- **`industrial_asset_pack.glb`** (63.8MB — 159 PNGs, MUST go through
  `scripts/shrink-glb.mjs`) — oil drums ×4 colours, gas cylinders with
  gauges, propane tanks, jerry cans, pallet, crate.
- **`industrial_asset_pack_free.glb`** (27MB) — steel girder frames,
  concrete wall panels, big bore pipes, a shipping container, I-beams,
  barriers. **Scale is off (the set spans 49m)** — measure before placing.
- **`IndustrialPack.rar` + `IndustrialPack2.rar`** (extracted to `_x/`) — 21
  FBX props with PBR PNG sets: cable drum, car jack, **two electrical boxes
  (fuse-panel candidates)**, explosive barrel, gas can/cylinder, pallet
  truck, platform trolley, water barrel, **two work lights with emissive
  maps (the level's lamps)**, wet-floor sign, cement mixer, fire
  extinguisher, generator, **locker**, motor oil, solar panel rig (skip),
  spray can, wood pallet.
- **No sounds yet.**

**TEXTURES — ambientCG, CC0** (Josh couldn't find a pack; picked against the
canon's "long dim concrete maintenance hallways, steam pipes on the walls and
ceilings, cracked stone, rusted pipes, mould"). 1K JPG sets (Color /
NormalGL / Roughness, + Opacity/Metalness where they exist) staged in
`assets/pipe dreams/picks/`; all 25 candidates are in `tex/`.
- Walls: **Concrete032** (streaked green-grey bunker cast) · **Concrete033**
  (the darker one) · **Concrete035** (stained, mouldy — damp stretches).
- Floors: **Concrete044D** (stained slab) · **Concrete031**.
- Ceiling: **Concrete029**.
- Catwalks: **MetalWalkway014** (rusted perforated plate, real alpha).
- Doors / panels: **Metal021 / Metal022** (rust-streaked plate).
- Accents: **PaintedMetal016** (hazard stripes — the fuse wall, steam
  zones) · **PaintedMetal017** (a DANGER DO NOT ENTER plate — the prop
  locked doors).
First look-test (a throwaway corridor with the kit's pipes and sodium bulbs)
reads as Pipe Dreams already; the real gate is in-engine, against world.ts's
lighting, once the level renders.

### THE MAP — SECTOR D1 (RETIRED 2026-09-27 — replaced by the designed D2 below)
`src/backrooms/worldgen-pipes.ts`. **SECTOR D1 IS FROZEN: seed 20260926,
256×256** (exactly half A3's area), fingerprint pinned in
`SECTOR_D_FINGERPRINT`. Review renders: `node scripts/render-pipes.mjs` →
`docs/backrooms/pipes-20260926{,-heat}.png`. Harness:
`node scripts/checks/test_pipes.mjs` (38).
- **Districts** (58): maint 25 (braided tunnel mazes cut through solid
  concrete, 1–2 wide, junction chambers) · workshop 9 (BSP rooms with
  machinery, some with a lit CONTROL ROOM) · staffwing 6 (corridor spine,
  offices/locker rooms, lit BREAK ROOMS, sealed rooms behind prop locked
  doors) · pumphall 5 (catwalk gallery, machine floor 7 steps below, a
  stair into each half, a grate bridge across) · boilerhall 7 (rows of 3×3
  tanks, the most vents) · stores 6 (rack rows, a forklift aisle).
- **THREE FLOORS**, `BAND` = 6 steps (3m) apart; every district sits on one.
  Where two floors meet at a gate, a WALLED STAIRWELL runs one step per
  cell (1,340 stair cells). An engine room is never dug into — if it is the
  lower side, the stair descends into the upper district instead.
- **DESIGNED DROPS ONLY.** Floors never go below −1, so nothing is a pit.
  The only falls are off an engine room's catwalk (7 steps, ~30 HP);
  `railPass` walls every other open edge that drops two or more steps
  (safe by construction: a fall edge never counts for reachability).
- **THE DRAIN** (the one entrance, a 7×7 concrete room, hatch overhead)
  and **THE PRESSURE DOOR** (the farthest room from it — 467 cells of
  walking — with the exit door and the fuse panel on its north wall).
- **THE SECOND VALIDATION (same day)** found and fixed three faults: two
  stairwells that CROSSED (each overwrote the other's steps, stranding both
  ends — a stair's footprint is now pre-checked and a refused gate changes
  nothing and retries elsewhere), a prop locked door whose sealed room a
  rescue pass had opened (hygiene now drops it), and the outermost row and
  column left as undressed floor (the ring is rock now). All eight checks
  live in the harness.
- **17 SAFE ROOMS**, 218 steam vents (none within 10 cells of the drain),
  1,095 lamps (~28% dead, 15% flickering), 9 prop locked doors.
- Deco codes (`PDECO`): vent · lamp · safe · grate · stairs · panel ·
  lockeddoor · machine · tank · rack · hatch · exitdoor. The server reads
  safe/vent/panel/exitdoor; the rest is dressing.
- **Next:** serve it (sector boot + fingerprint check, level 2 in the
  session/travel code), Level 1's key + the drain hatch, the ten fuse sites
  and the panel, the Grabber, then the client (textures, the pipe kit run
  along every tunnel wall, lamps, vents, catwalk grates, stairs as steps,
  props, ceiling heights per district).

### SERVED — the operator playtest (2026-09-27)
Josh: *"always let the admin playtest the map with the ability to fly around
like in the other levels"*, then *"after that you can add it in"*.
- **Level 2 is a live world on the server** (`service.ts`: `BrLevel = 0 | 1 | 2`,
  `secBy`/`sectorIdOf`/`fogOf` are the one lookup each; sector D is regenerated
  at boot and refused on a fingerprint mismatch, which shuts only Pipe Dreams).
  Fog, drops, corpses and spray marks persist under `D1`.
- **SHUT TO EVERYONE BUT THE ADMIN** until its door opens (`LEVEL2_FLAG` in
  lore.ts — set by nothing yet; Level 1's drain hatch will set it). `enter`
  refuses `pipes_locked`, re-checking `isAdmin` against the DB, so the rail
  showing "LEVEL 2 · operator playtest" to the admin is presentation only.
- **The admin's flycam (F) works down here** exactly as on the other levels.
- **ONE WAY OUT**: `exit` on Level 2 requires standing at the drain (radial,
  2.8 cells, like the Poolrooms' doors); `travel` answers `no_passage` until
  the hatch exists. Nothing streams on Level 2 yet — no relics, drives,
  creature, fuses or panel.
- **Client**: level style `"pipes"` in world.ts — the ambientCG concrete sets
  (walls Concrete032, floor Concrete044D, ceiling Concrete033, copied to
  `client/public/assets/pipes/tex/`), no drop ceiling, no baseboards, DARK
  environment (near-black fog 6–38m), and the baked fixture field fed by the
  level's own LAMP deco (dead lamps give no light) and every other cell of a
  SAFE room, with a steeper curve (`lum`: 0.05 + 1.3·e) so a tunnel between
  bulbs is black. Caged bulbs are small emissive spheres. The ambience bed and
  a concrete footstep bank are the generated sounds.
- **KNOWN GAPS, next round:** machines, tanks and racks render as floor-to-
  ceiling concrete columns (every solid does, until the props pass places the
  pack's models on their anchors); no pipes on the walls yet (BUILT Oct 2026 — the pipe runs, law 8's reference task); grate catwalks
  and stairs render as plain floor and ramps; the drain wears the Poolrooms'
  tiled exit-door model.
- Also fixed on the way: the socket's `exit` sent its goodbye to Level 0
  whatever level you left from, so a Poolrooms bystander kept a ghost of
  whoever walked out.
- Harness `node scripts/checks/test_pipes_live.mjs` (22).

### THE MAP, REDESIGNED — SECTOR D2 (RETIRED 2026-09-27 — replaced by D3, built from hand-made rooms, below)
Josh: *"we need to rethink and upgrade map generation i think with pipe dream
you took to much from the first level … I want better level design so that it
looks intentional for each room instead of just random and different."*

**What was wrong with D1, precisely:** it was Level 0's generator in a concrete
coat. A random BSP of rectangles, each given a random type and filled wall to
wall with ONE pattern (a maze, a rack grid, a tank grid); machinery dropped at
random spots; and the rescue passes (`connectAll`, `regradeStranded`) knocking
holes in walls wherever something came out unreachable. Nothing related to
anything next to it. Level 1 shares the same skeleton — compare the renders.

**`src/backrooms/worldgen-pipes.ts` is rewritten as a plan, in five layers,
each constrained by the one above** (the file's header is the full argument):
1. **THE CIRCULATION PLAN.** A structural grid of long straight PIPE GALLERIES
   (four each way, 3 wide, the one nearest the middle 4 wide) inside a 2-wide
   perimeter SERVICE RING, so every block has a way round it and no gallery
   dead-ends. One or two gallery segments are removed to merge two blocks for
   the set pieces.
2. **THE DESCENT.** Three decks, `BAND` (6 steps, 3m) apart, cut from gallery
   hops away from the drain: the intake is on the top deck and the valve
   gallery on the bottom one, always. Where a gallery crosses decks it carries
   a full-width STAIR in the middle of its run.
3. **THE PROGRAM.** Every block has a purpose, placed by ADJACENCY: the intake
   in a corner and the valve gallery in the opposite one, the turbine hall on
   the first merge and the central stores on the second, two pump stations
   (preferring blocks that straddle two decks — a pit hall uses both), a boiler
   house beside a pump station, the control block beside the turbine hall, staff
   blocks nearest the drain, machine shops beside the stores, and the rest split
   between maintenance tunnels (the deeper half) and plant blocks. The set pieces
   are named on the map, numbered outward from the drain.
4. **BLOCK RECIPES.**
   - **Double-loaded corridors** (staff, plant): corridors along the long axis,
     rooms both sides on a fixed module (5 or 6 cells), a cross corridor landing
     on a live gallery gate. **Each strip is symmetric about its anchor room**
     (a locker suite, a break room, a pump room), fillers mirrored outward.
   - **The loop plan** (intake, control, half the plant blocks): two corridors
     joined at both ends round a CORE of three big through-rooms, a strip of
     rooms along each long side. The core is the block's reason to exist: THE
     DRAIN CHAMBER (flanked by the locker hall and the crew's mess), the main
     control room (flanked by switch rooms), a pump room.
   - **The utility grid** (the maintenance tunnels): runs on a fixed pitch, a
     random spanning tree plus extra runs so it loops, some narrowed to 1-wide
     crawlways; the squares between become plant rooms, solid concrete, or a
     room sealed behind a locked prop door. Two squares either side of a run
     that was never built merge into one big pump room. The square nearest the
     middle is the tunnel crew's lit MESS ROOM — safe.
   - **Halls** (turbine hall, pump stations, boiler houses, stores, machine
     shops): a service strip along the gallery side with the CONTROL ROOM in the
     middle as the hall's front door (consoles on the hall wall), and an annex
     strip where the plot is deeper than a hall should be. Engine halls sink one
     deck (`PIT_SINK`) under catwalks along both long walls with FOUR MIRRORED
     STAIRS down; turbine sets stand end to end at one even pitch, pumps in rows
     either side of a centre aisle under a grate bridge. Boilers line the back
     wall with a service gap behind and their steam vents on the stoker's face;
     racks run in aisles with cross aisles; lathes in two rows.
   - **The valve gallery**: a wide hall from a gallery gate straight across the
     block, two rows of valve stations down it, valve rooms either side, and past
     the last machine a clear antechamber with THE PRESSURE DOOR centred in the
     end wall, the fuse panel beside it, solid concrete behind. Every lamp in it
     works.
5. **ROOM FURNISHING** — a recipe per room type, keyed to its door: lockers
   line the walls with benches down the middle, desks face the door, break rooms
   set tables in a grid with a bench each side, control rooms carry console
   rows, machines stand on a centred grid from the back wall (centred in depth
   in a through-room — measured from the front, they land on the doorway's
   clearance). **A doorway and the step inside it are never furnished.**

**WALLS ARE DERIVED, NOT DRAWN.** Every cell belongs to a SPACE (a room, a
block's corridor network, the gallery system); an edge is a wall iff the spaces
differ and nobody put a door there. That one rule keeps rooms rectangular and
doorways exactly where they were meant to be.

**CONNECTED BY CONSTRUCTION — no rescue passes.** A door is placed only where
the floors either side agree; a block whose own corridors find too few legal
gates opens ENTRANCE LOBBIES (edge rooms that open onto both the gallery and
their corridor). A room that still comes out unreachable is sealed and counted,
and the harness requires zero. Across ten seeds: 0 lost rooms, 0 dug
vestibules, 0 single-entrance buildings, 100% reach, every time.

**SAFETY IS A ROOM TYPE.** `SAFE_TYPES` = breakroom · controlroom · drainroom,
the district types server and client both read; the old per-cell `safe` and
`grate` deco codes are retired, which freed the deco byte for furniture. **The
ceiling is the room type too**: each (block, room type) pair is one district,
so a tunnel is 2.7m, a gallery 4.4m, a hall 13m, and a catwalk's ceiling is its
hall's minus the 3m it stands above the pit, so the two meet in one roof.

**New deco vocabulary** (`PDECO`): `machine` v indexes `MACHINES` (pump,
generator, cabinet, turbine, transformer, compressor, lathe, press); `tank` v
indexes `TANKS` (boiler, vertical, horizontal); `wallA`/`wallB` are wall
pieces (v = type×4 + the wall behind: locker, workbench, cabinet, console /
shelf, counter, breaker, manifold); `free` is a free-standing piece (v =
type×2 + axis: bench, table, desk, crates, drums, pallet, cable drum, stall).

**THE CLIENT DRAWS IT** (`client/src/backrooms/pipes-props.ts`): every machine,
tank, rack and piece of furniture as procedural geometry, merged per material
per chunk and lit by the chunk's baked light field exactly as the walls are.
Solid fixture footprints stand on a floor instead of rendering as concrete
columns; catwalks wear the MetalWalkway grating; every drop of two steps or
more gets a yellow railing WITH a collider (nobody walks off a catwalk by
accident); prop locked doors and the pressure door are built on their walls;
furniture on open floor gets per-axis colliders like the Poolrooms' masonry.
**The footprint tables and SAFE_TYPES exist in both files and the harness
compares them.** The pack's models can replace any piece — the anchors,
footprints and facings are already the contract.

**Bugs found walking it in the browser (all fixed):**
- **Level 2 had been rendering in Level 0's haze since it was served.**
  `applyLevelEnvironment` set the near-black fog, then called `setPowerLevel(1)`,
  which repainted fog, background, hemisphere and ambient with Level 0's
  constants. The power dial now scales the CURRENT level's bases, so brownouts
  and the entity's flicker darken each level from its own look.
- **A flycam jump could leave chunks blank forever.** The streamer marked a
  chunk requested and never asked again; after a big jump it asked before the
  server had the new position, the server declined (the map-secrecy rule), and
  the chunk never came. An unanswered ask is retried after 2.5s.
- The operator map labelled the sectors "D1"/"P1" from string literals (the
  Poolrooms has been P3 since August); it reads the sector ids now.

**SECTOR D2: seed 20260927, 256×256**, fingerprint pinned. 24 blocks, one
merge (the turbine hall, 51×110), 20 safe rooms, the worst walk to a lit room
145 cells, the pressure door 447 cells from the drain. Review renders
`docs/backrooms/pipes-20260927{,-heat}.png` (D1's are kept for the
before/after). Harness `test_pipes.mjs` 38 → **56**: it now holds the DESIGN
rules as well as the map rules — rooms closed but for their doors, doorways
level and unfurnished, every wall piece backed by a wall, each room type
carrying its signature piece, turbine sets at one even pitch, stairs in every
engine hall, the plan's adjacencies, and the client/server tables agreeing.
**Deploying D2 needs no data migration** — Level 2 is operator-only and D1 held
no player state; its fog under "D1" is simply orphaned.

### THE MAP, REBUILT FROM HAND-MADE ROOMS — SECTOR D3 (Josh, 2026-09-27)
Josh, after D2: *"is there a map generator software out that is best in class
that you can mimic in terms of what it does. i feel like you dont have the
knowledge or the proper tool set for realistic map generation."* → *"yeah lets
go with your reccomendation."*

**What was still wrong with D2 was not a technique, it was that every room was
invented by code.** A room written by a rule can only be as good as the rule.
The procedural games whose levels read as designed — Lethal Company (built on
DunGen), Spelunky, Dead Cells, Enter the Gungeon — have a person draw the
rooms, and the generator only decides how they connect. D3 is that model:
**DunGen's**.

**THE LIBRARY — `src/backrooms/pipes-rooms.json`.** 80 hand-drawn pieces:
the drain chamber (start) and the valve gallery (goal); gallery runs, bends,
tees, crosses, a pillared junction, two stairwells and a dead end; staff
corridors and tunnels; multi-room BUILDINGS (the staff wing, the office block,
the plant block, the workshop block, galleries with their rooms built in); ~35
rooms (lockers, showers, the mess, offices, records, control rooms, pump,
transformer, compressor and generator rooms, a first-aid room, the radio room,
a chemical store…); and the halls — the pump station, the turbine hall, the
boiler house, the stores, the machine shop, the generator hall, the filter
hall, the tank farm, the transformer yard. **The format is text layers** (map ·
height · stair · rooms · furn) plus doors, all described at the top of
`src/backrooms/pipes-tiles.ts`, whose `lintTile` is the checker the editor
shows and the harness enforces: doors on the outline and level, the doorway
and the step either side of it clear, wall pieces backed by a wall, machines
drawn as their exact footprint, every cell reachable from the doors, only a
catwalk may drop to a pit, doors on a deck (0 or ±6 steps).

**THE MAP EDITOR — Admin Panel → Map editor** (Josh, Sep 2026: "I would the
editor to be available in the admin panel so I can design and redesigns maps").
It replaced the dev-only `npm run rooms` page the same week. The room list, a
paint grid per layer (floor types, heights, a drag-a-stair tool, room labels, a
furniture palette that stamps machines at their real footprint, door edges,
and **PROPS** — every model in the prop kit, searchable and shelved by
category, placed by clicking, dragged, turned, lifted, with a wall prop sliding
onto its wall and a ceiling prop hanging from the ceiling), the checker live
beside the drawing, a **3D preview built with the game's own fixture code and
the kit's own model files**, zoom, undo, and **See the whole level**: the real
generator run on the library as it stands. Work saves itself as a **draft on
the server** (migration 103, `map_drafts`); nothing players walk changes until
**Publish**, which refuses a broken room by name, a level that breaks its rules
(`designs.ts` `buildMap` — every floor cell reachable, no isolated door, no
unrailed or lethal drop, the door reachable, nowhere too far from a lit room),
and anybody CONNECTED down there. A publish is a `map_versions` row with its
seed, library and fingerprint, played under **a fresh sector id per version**
(D3 is the repo's map, version 1 is D4, …) — so a new map has fresh fog, paint
and bodies and nothing is deleted — and the level swaps IN PLACE
(`swapMap`, then `swapPipesMap`), no restart. **Boot re-checks the recorded fingerprint**: a
generator change that would move a published map's walls shuts it back to the
repo map, loudly, exactly as the frozen maps always have. History reopens any
old version (or the original) as the draft. `GET /api/admin/maps/2/export` is
the library in the repo file's own layout — **how a published design gets back
into git** (Claude pulls it; the repo copy is the fallback and the harness's
fixture, the database copy is what plays). The editor is plain DOM + canvas
(`client/src/mapeditor/`), mounted by `MapEditor.svelte` and loaded only when
opened. Harness `test_mapeditor.mjs`.

**THE GENERATOR — `src/backrooms/worldgen-pipes.ts`:**
1. **The route**, from the drain to the valve gallery, grown doorway to doorway
   along a SERPENTINE (three passes across the map, pure pursuit of a point
   ahead on the line, with noise). It is cut into stretches — intake → staff →
   plant → machinery → vault — each drawing from its own set, with a junction
   every third step and **a stairwell down between the stretches: three decks,
   the drain on the top one, the door on the bottom one**. Every hall with a
   `min` (pump station, turbine hall, boiler house, stores, machine shop) is
   placed ON the route, so nobody reaches the door without walking through
   them.
2. **Cross-streets** straight after the route, before any room can take the
   ground: an A* search over the library's plain two-door pieces (lengths,
   bends, stairwells) from a spare junction exit to one on another pass,
   landing exactly on it. A loop is refused if it would leave the drain less
   than 55% of the route from the door.
3. **Branches** off every spare doorway, from the stretch they hang off.
   **A room is entered from circulation, never through another room** — that
   was what made the first attempt read as a patchwork of rectangles. Caps
   and a repeat penalty keep the mix varied; lit rooms are mostly left to the
   safety pass.
4. **The prune**: any gallery, corridor or stair that leads nowhere is taken
   back out until nothing more falls off. No fingers into the rock.
5. **Short loops** between neighbouring branches, **the safety pass** (a lit
   room hung on the spare doorway farthest from light until nowhere is more
   than `MAX_TO_SAFE` = 120 steps from one), **dead ends** on spare gallery
   ends, and a locked prop door on ~45% of the spare doorways that open onto
   rock.
Walls are DERIVED (a wall between two spaces unless a joined doorway or an
inner door opens it), the reach check must seal nothing, the drain and the
valve gallery burn every lamp, and no vent stands within 12 cells of the
hatch. ~0.2–1.9s per map.

**What D3 is (seed 20260928, fingerprint pinned):** 570 pieces over ~20,900
walkable cells (about half of D2's floor: real rooms and rock between them,
not a grid filled to the edges), the route 55 pieces over all three passes of
the serpentine, 3 cross-streets and 14 loops, 42 lit rooms (worst walk to one
96), the pressure door 502 cells from the drain, 13 named set pieces on the
operator's map. Room caps are set so the most-repeated piece is a plain
gallery run (28), never a room. Renders `docs/backrooms/pipes-20260928{,-heat}.png`.

**Client:** unchanged vocabulary. Two fixes: Level 2's ceiling table moved to
`pipes-props.ts` (`PIPE_CEILINGS`, spread into world.ts) so the editor's
preview reads it, and **an engine hall's roof is one flat plane**
(`pipeHallRoof`: the pit floor + 13m, found by rounding a cell's floor down to
3m) — per-cell floor + height notched the roof above every stair.

**CHANGING THE ROOMS AFTER THIS:** edit in the room editor → Generate to look
at the level → optionally walk it locally with `PIPES_UNFROZEN=1` in the dev
`.env` (Level 2 opens on whatever the library builds, with a loud boot line;
**never set it on the server** — the harness checks deploy/ doesn't) → then
FREEZE: a new sector id (D4…), the new fingerprint, `test_pipes` green, the
admin RESET MAP for Level 2 on deploy. Any library edit changes the map; the
fingerprint is what keeps a live map from changing under players.

Harness `test_pipes.mjs` 56 → **69**, `test_pipes_live.mjs` 22 (on D3).

## THE POOLROOMS, REBUILT FROM HAND-MADE ROOMS — SECTOR P4 (Josh, 2026-09-27)

Josh: *"All three levels now"* — then, asked what should hold the Poolrooms
together: *"lets do rivers as the main path."* P3 (the reference rebuild) was
carved by rules; P4 is Pipe Dreams' model, DunGen's, with **the rivers as its
spine**. Seed **20260930**, 384², fingerprint pinned; P3's record stays in
`SECTOR_P3_RETIRED`. A new sector id, so P3's fog, paint and bodies are left
behind (the admin RESET MAP isn't needed for that — the id does it).

**ONE FORMAT, A DIALECT PER LEVEL.** The room format moved out of
`pipes-tiles.ts` into `src/backrooms/tiles.ts`, shared by every level built
from rooms; what differs by level is a `Dialect` (room types and zone letters,
the furniture alphabet and how each piece turns, the deco byte it bakes to, the
climb rule, the level's own lint). `pipes-tiles.ts` is Pipe Dreams' dialect
(D3 came out byte-identical — its fingerprint didn't move), `pools-tiles.ts`
the Poolrooms'. Level 0's rebuild is a third dialect, not a third copy.
Sockets gained a **floor PROFILE** (the heights along their lanes): two pieces
join where width AND profile match, which is what lets a river mouth — 19
cells, `RIVER_PROFILE` in `pools-vocab.ts`: a 3-cell towpath each side, banks
graded one step at a time, a 3-cell bed at −6 — carry its banks unbroken from
piece to piece.

**WATER IS DRAWN AS DEPTH.** No water layer: the one table (−1) makes any
floor drawn below it wet, so a tile draws a pool by drawing a sunken floor.
The Poolrooms' lint reads every edge at the WATERLINE (`effFloor`): a 2–3-step
lip is refused unless the high side is a bridge deck, 11+ would kill, deep
doorways must be the river's whole cross-section, a bridge deck stands at +1 or
higher, a ladder stands in the water with the deck beside it, and an exit door
stands on floor 0 with dry, clear floor three cells round. **Pool rooms are
masonry**: their walls are `#` cells, because the client hangs arches,
portholes and benches on real stone (`decorules.ts`) — two halls side by side
read as one thick tiled wall with a deep doorway through it.

**THE LIBRARY** (`src/backrooms/pools-rooms.json`, 49 rooms, drawn first by
`scripts/pools/draw-library.mjs` — ONE-TIME SCAFFOLDING, the JSON is the source
now): river reaches (plain, long, blind, THE ARCADE with the towpaths behind
arches), two bends with straight lead-ins that carry the towpath doorways, THE
BRIDGE, THE DOCK (a jetty to the deep channel, a ladder down — where boats tie
up), **The Confluence** (a round basin, four mouths), the sources (**The
Culvert**, **The Springs**, **The Outfall**), the named halls (**The Grand
Lido** with its spiral stair to a +6 mezzanine, **The Vault Sea**, **The Long
Gallery**'s portal rings, **The Flood Fields**, **The Great Dome**, **The
Winding**'s wading maze, **The Bathhouse**, **The Gallery**) each one of a kind
with an unnamed twin for repeats, a dozen more halls (pillar halls, cisterns,
lido decks, atriums, canal halls with footbridges, sunken steps, rotundas,
pool halls), passages dry and wading, small rooms, and **The Landing**. ONE
DOOR PER LEVEL (Josh, the same day: *"Just put only one door per level for
entering let's make it easy"*): The Landing is the way in from the hub, where
Level 0's passage arrives, and the way out. P3's other three exits — **The
Changing Rooms**, **The Filtration Hall**, **The High Dive** (a diving pool
and a +6 platform to jump from) — are named halls now.

**THE GENERATOR — `src/backrooms/worldgen-pools.ts`:**
1. **The rivers.** The Confluence near the middle; four legs grow out of its
   mouths piece by piece, each steering for its own edge along a slow meander
   (pure pursuit of a carrot on a sine off the leg's axis), keeping 7 cells
   from the rest of the river, and ending in a source. **Every arm crosses a
   footbridge as it leaves** (the four ring the Confluence), and another comes
   once a reach holds `REACH_MIN` 850 wet cells, forced by `REACH_MAX` 1,400 —
   because a bridge deck is dry, it ENDS a reach for boats and alligators, and
   a reach big enough is one alligator's water. Docks have a minimum of 2.
2. **The door**: The Landing, on a towpath `LANDING_FROM_CENTRE` (80) cells
   from the Confluence, so the one way in leaves the whole level in reach.
3. **Branches** from every spare towpath doorway: halls over passages, a room
   only ever off a hall or a passage (never off the river or another room),
   named halls placed first, caps and a repeat penalty for variety.
4. **The prune** (passages that lead nowhere), **the linker** (Pipe Dreams'
   A* over two-door passages, long loops then short), and **loops** where two
   spare doorways meet exactly.
Walls derived from spaces, water and the effective floor derived from the
table, the reach check must seal nothing. ~0.4–0.7s per map.

**What P4 is:** ~146 pieces over ~63,000 walkable cells (P3 had ~41,000),
48.6% of it wet, 30% swim-deep, 3,500 river-bed cells; four legs of 5–9 pieces;
7 footbridges; 10 alligator waters (the largest 2,179 cells, no one body
swallowing the rivers); 16 named places; one door; no trapped swimmer; 100%
reachable.

**THE SERVICE** boots Level 1 exactly like Level 2 (`bootRooms` in service.ts —
a published version outranks the repo's map, both held to their fingerprints)
and **`swapMap(level, …)`** replaced `swapPipesMap`: on the Poolrooms it also
re-seats everything that lives on the water — `residentGators()`,
`dockBoats()` (**boats prefer river docks** now; a pool hall's quay counts
only when the rivers offer none), `placePoolDrives()`, fresh relic sites — and
The Landing follows the map (`landing()`). `br.sectorP`, `br.enabledP` and
`br.fogP` are getters like Level 2's; `sectorIdOf(1)` is the live id.

**THE EDITOR** opens either level (a switcher in its header, the draft saved
before it switches). `client/src/mapeditor/levels.ts` holds what it draws
differently per level: colours, ceilings for the 3D preview (the Poolrooms'
table moved to `pools-vocab.ts` as `POOL_CEILINGS`, spread into world.ts), the
height palette in words ("ankle water", "waist", "swim", "the river bed"),
door widths (1, 3, 19 = a river mouth) and the built level's stats. Water is
drawn blue in the grid, as a sheet in the 3D preview and on the whole-level
map. Published versions play as **P5, P6, …**; `GET /api/admin/maps/1/export`
pulls a design back into git.

Harnesses: `test_pools.mjs` **55** (replacing test_pools3's 31);
`validate_map.mjs` 23/23 on P4 unchanged; `test_gator.mjs` counts the
qualifying waters from the map instead of a fixed 15.

## LEVEL 0, REBUILT FROM HAND-MADE ROOMS — SECTOR A4 (Josh, 2026-09-27)

Josh: *"All three levels now"*, then *"Just put only one door per level for
entering let's make it easy."* A3 was carved by rules; A4 is packed from a
room library you can open in the map editor. Seed **20260931**, 362², the
fingerprint pinned in `SECTOR_A_FINGERPRINT`; A3's record stays in
`SECTOR_A3_RETIRED`. A new sector id, so A3's fog, paint and bodies are left
behind. Relics, lockers, found drives and THE DOOR's opened flag are not
sector-keyed and carry over.

**THE LOBBY IS A LATTICE, NOT A GRAPH.** Pipe Dreams and the Poolrooms hang
rooms off a spine; the classic backrooms has no spine — it is rooms packed
wall to wall as far as you can walk. So Level 0's dialect
(`src/backrooms/lobby-tiles.ts`, vocabulary in `lobby-vocab.ts`) is built on
a **10-cell MODULE**: every room is a whole number of modules (1×1 to 4×4),
fills its entire rectangle (no holes, no `.`), and its doorways are **SLOTS**
— 2 wide, 4 cells into a module side (`SLOT_AT`/`SLOT_W`), on floor 0. Any two
rooms side by side therefore line up slot for slot, which is what lets the
generator treat the map as a grid of modules instead of a search.

**THE WALLS LAYER** (new in `tiles.ts`, every level gets it): thin walls
INSIDE a tile — `'-'` north edge, `'|'` west edge, `'+'` both — in a `walls`
grid beside `map`/`hgt`. Drywall, partitions, cubicles and the warrens' mazes
are thin walls, not `#` cells, which is what Level 0 has always been (a
thin-wall world, see the A3 audit's numbers). They transform with the tile
(part of the variants key), the lint's `walkEdge` honours them, and they count
as backing for wall pieces. `#` is kept for genuinely solid things: pillars,
the long table, a basin rim.

**THE LIBRARY** (`src/backrooms/lobby-rooms.json`, 51 rooms, drawn first by
`scripts/lobby/draw-library.mjs` — ONE-TIME SCAFFOLDING, the JSON is the source
now): eight interiors in several sizes each, with a `-b` twin — **classic**
(the office-less yellow, partitions), **warrens** (drywall mazes, low ceiling),
**offices** (cubicle rows), **halls** (long parallel walls), **pillars**
(column fields), **terraces** (walkable one-step ramps up and down),
**sublevel** (sunken, two-step drops you can fall into but not climb) and
**atrium** (tall and open); the eight landmarks (**The Red Door**, **Pillar
Garden**, **The Long Table**, **The Basin**, **Static Row**, **The
Switchback**, **The Hollow**, **Court of Columns**); and **the-entrance**, the
start room. Shafts (−9 and deeper) are `skipCell` to the dialect's
reachability, the same "a pit is lethal" rule the game uses (`LOBBY_PIT` ===
`PIT_LETHAL`, pinned).

**ONE DOOR: THE ENTRANCE.** The start room carries one piece, `'D'`, on a
wall-backed cell. The generator puts the start room at the middle of one map
edge with its door wall ON the map's outer wall, so you arrive from the hub
out of the edge of the world with the whole level ahead of you. The lint
refuses a start room without exactly one entrance, one not on floor 0, or one
without two clear cells in front.

**THE GENERATOR — `src/backrooms/worldgen-lobby.ts`:**
1. **Districts.** A Voronoi region map over the module grid (`REGIONS` seeds
   per 1,000 modules, each given a type by `TYPE_ODDS`), so rooms of a kind
   cluster the way Kane Pixels' levels do rather than salting the map evenly.
2. **The pack**, two passes: the landmarks first, spread apart and each in a
   district region of its own type, then the fill — at every empty module the
   biggest library room of the district's type that fits, with weights, caps
   and minimums honoured. The whole grid is covered; nothing is left open.
3. **The doorways.** Every shared slot between two rooms is a candidate; a
   Kruskal spanning tree opens enough of them to connect everything, then
   `EXTRA_OPEN` (0.5) of the rest are opened for loops. A closed slot is wall.
4. **Materialize**: tile walls, thin walls, derived walls between rooms, the
   opened slots as 2-lane doorways, the entrance, the landmarks.
5. **The reach check** (from The Entrance, skipping shafts) must seal nothing.
Then the lore layer as ever: THE DOOR at the deepest cell (`lore.doorSite`),
the key in the landmark farthest from THE DOOR (`keySite`), the 20 drives,
the furniture placed per district by `props.ts`. ~125ms per map.

**What A4 is:** 393 rooms over ~128,000 walkable cells; 857 doorways open
where 392 would connect it; 8 landmarks; 49 shaft cells; THE DOOR **578 cells**
from The Entrance, the key in The Switchback; 100% reachable, nothing lost or
stranded, no shallow pit. Districts by room count: classic 119 · pillars 98 ·
warrens 85 · halls 40 · offices 29 · sublevel 13 · terraces 8 · atrium 1.
Render: `docs/backrooms/LEVEL0-A4{,-heat}.png`
(`node scripts/render-sector.mjs 20260931 362 docs/backrooms/LEVEL0-A4 --lobby`).

**THE SERVICE** boots Level 0 through the same `bootRooms` as the other two (a
published version outranks the repo map, both held to their fingerprints) and
`swapMap(0, …)` re-seats THE DOOR, the key, the drives and relic sites on a
publish. The per-sector `DOOR_NAMES` overrides are gone — every level's door
names come from its sector (`DOOR_NAMES_A3_RETIRED` keeps the record).
Published versions play as **A5, A6, …**.

**THE EDITOR** opens all three levels. Level 0's kit in
`client/src/mapeditor/levels.ts`: the yellow per district, heights in words
("a lethal shaft"), slots as the only door width, and the built level's stats
(rooms, doorways opened vs needed, THE DOOR's depth, drives placed). The Walls
layer draws and erases thin walls by clicking or dragging along a cell edge.
The guide (`guide.ts`) has a Level 0 line in every section it matters.

Harnesses: `test_lobby.mjs` **43** (the library, the lattice, the one door,
the map rules, the lore, three other seeds); `test_mapeditor.mjs` opens and
builds Level 0 (→ 40).

## A5 — CONDENSED, AND A ROOM TYPE IS A LOOK (Josh, 2026-09-27)

Josh, the same day A4 shipped: *"The level 0 is way to massive lets condense
it down a 3rd its size please with more variations in its rooms type and
look."* And, from the same list: *"Make sure each level has a clear outline
entrance and exit door marker in red."*

**THE SIZE.** 212² against 362², the same 10-cell lattice. That is a third of
the walkable floor (~43,700 cells against 128,258), which is what "a third its
size" was taken to mean; a third of the SIDE would have been a ninth of the
floor. THE DOOR still lands ~330 cells from The Entrance, all twenty drives
still place, and the harness pins the ratio. Seed `20261002`, sector **A5**;
A4 is `SECTOR_A4_RETIRED`. Published editor versions count on from the repo's
own id (`designSectorId`), so v1 of Level 0 is A6 now.

**THE TYPES.** Thirteen, where there were eight. Appended, never inserted —
a type's index in `LOBBY_TYPES` is its district id on the wire:

| type | look | layout |
|---|---|---|
| manila | the old paper gone brown, stained carpet, half the panels out, 70% base light | tighter partitions and 2×2 closets |
| restrooms | white tile walls and quarry-tile floor, 3.2 m | rows of stalls down both long walls |
| panelled | wood panelling, green carpet, 3.9 m | the office plan with rooms a cell wider |
| storage | bare concrete walls, floor and ceiling, 7.2 m, half the panels out | a hall of concrete piers |
| unlit | the classic room with no lit panels and 14% base light | classic partitions — bring a torch |

Plus a cubicle-farm office layout and two landmarks, **The Washroom** (a
tiled room round a sunken basin) and **The Boardroom** (a panelled room round
one long table). Districts are DEALT from a deck holding every type once, so
every map carries the whole range; `REGIONS` went 34 → 55 per thousand
modules so a smaller map still holds many districts. Furniture density
12 → 20 per ten thousand cells (restrooms and the unlit rooms are bare on
purpose).

**THE LOOK IS PER CELL NOW.** Before this a room's type moved only its
ceiling height and one of three wallpapers, picked per 16-cell CHUNK by
whichever room owned most of it. `LOBBY_LOOK` in client `world.ts` gives every
type a wall, floor, ceiling, share of lit panels and base light, and the chunk
builder merges walls, floors and ceilings per MATERIAL. Two lessons:

- **The base light is not the fixtures.** Every Level 0 surface carries a
  baked floor of light (`lum`'s base), so a room with all its panels out
  still read as lit. `ambient` scales it per room.
- **Horizontal detail in a wall texture jumps.** Each wall segment hangs its
  texture from a hashed V offset (`pushBox` — so no two walls show the same
  seam), which puts a tile stripe or a dado rail at a different height on
  every segment. Keep wall textures free of horizontal lines.

**THE RED DOORS.** `redDoorOutline` (world.ts) — unlit, fog-free,
depth-tested, and no lights, so the frozen-light-count rule stands — frames
The Entrance's wall mark, The Landing's and the Drain's built doorways (both
faces), and THE DOOR to Level 1, each with a red sign. The hub map and the
editor's map draw every level's door red, outlined and named. Found on the
way: the Drain's doorway stood at y = 0 while its deck is 6 m up, so it was
buried; the welcome now carries each door's floor, because the chunks under
a door have not streamed when it is built. The Landing no longer stacks two
signs and two doors in one cell — the built doorway is its marker.

Renders: `docs/backrooms/LEVEL0-A5{,-heat}.png`. Harness `test_lobby.mjs` (48).

### P6 — THE BATHHOUSE (Josh, 2026-09-29)

*"I would like for you to go to … pools references and use all those
references to completely from scratch redesign the pools map"* — and on the
proposal: rivers out, 288², the boats kept as canal boats in the lap pools,
his saved draft replaced.

Every picture in the reference folder is architecture holding water —
vaulted arcades, round columns standing in still pools, flooded tube
corridors under nested arches, kidney pools with chrome ladders, spiral
stairs rising into light, tall sunlit windows — and none of them is a
river. So P6 (seed `20261101`, 288² against P5's 384²) has no rivers at
all. It is a flooded bathhouse that grows out of The Landing, near the
middle, in **three zones** by distance from its door (`ZONE_RADII` in
pools-vocab.ts; a room's `set` says which zone it may stand in, `any`
anywhere):

- **THE SUNLIT BATHS** (inside 20% of the map's width): bright (`bright`
  125), cream marble underfoot, tall windows — **The Lido** (a kidney pool
  under a wall of windows), **The Spiral** (a spiral stair rising out of a
  shallow ring pool), kidney-pool halls, sunlit galleries with an ankle-deep
  channel, tiled steps down to a pool, small baths.
- **THE ARCADES** (to 36%): **The Arcade** (colonnades of arches standing in
  waist-deep water), **The Column Sea** (a forest of round columns in deep
  water), **The Long Lanes** and the lap pools (swim-deep lanes between
  walkways, footbridges across — where the boats tie up), domed rotundas.
- **THE DEEP** (beyond): dim, dripping, grey marble — **The Cistern** and the
  cisterns (black water between rows of pillars — the alligators' homes),
  **The Undercroft** (arches over deep still water), **The Last Pool** (a
  round pool so wide the far side is a rumour).
- **Passages** anywhere: tiled tunnels through nested rings (the reference's
  receding arches), wading passages, and the short lengths the linker
  closes loops with (it uses `any` passages only, so a Deep tunnel never
  turns up in the Arcades).

**Every doorway is dry floor** and every room's water is its own; a body of
water 800 cells or bigger and deep enough is an alligator's (nine on P6).
**The boats dock on the lap lanes** (`dockBoats` prefers long, narrow water
three times as long as it is wide and never an alligator's). **Windows** are
a new wall piece (`W`, `DECO.window`): an arched opening with painted
daylight behind it and a white frame, built in code like the arches — not a
lamp (nothing casts light; the fixture law stands). The two marble textures
are the only tileable ones in the reference models (the tile atlases in them
are baked and full of holes), credited in surfaces.ts. The drain hatch down to
Pipe Dreams sits on the dry rim of a room in the Deep, never in a passage.

Found on the way: **`tileVariants` counted props** when deciding whether two
placements of a room are the same, so one off-centre prop in a symmetric room
changed how many placements it has — and with it every draw the generator
makes after: a props-only publish rebuilt the map. Placements are compared by
shape now; A6, P6 and D3 all kept their fingerprints.

Harness `test_pools.mjs` (59).

### THE MAP EDITOR, ROUND FIVE — fly, tilt, shapes, held ceilings, lights (Josh, 2026-10-02)

*"Add using wasd for navigation in the viewer port … xyz axis rotation for
props and others … geometrical shape that I can place and texture, scale,
resize, and edit … Fix the height tool it just the ceiling when i only want to
drop the floor … the option in the viewer for turning on lighting."*

- **FLY.** With the mouse over the 3D view, WASD glides the camera and the
  point it orbits across the room (relative to where it looks), Q/E sink and
  rise, Shift is faster; the speed scales with how far out the camera is. It
  takes the keys only while hovered, never with Ctrl/Alt/Meta held and never
  from a text field — Walk it keeps its own WASD.
- **TILT.** Every placement may carry `rx` (tip — about its own left-right
  axis) and `rz` (lean — about its front-back axis), degrees, after the
  yaw: three.js Euler "YXZ", rotation.set(rx, −r, rz). The Turn handle shows
  all three rings and reads the turn back in that order. Turning a room
  leaves a tilt alone; MIRRORING one negates the lean (the prop's left and
  right swap) — in `transformTile`, in the clipboard's flip, and so in every
  copy the generator lays. The wire carries it as `pitch`/`roll` radians.
  Footprints stay yaw-only.
- **SHAPES** (`KIT_SHAPES`, builtin "shape"): cube, cylinder, pyramid, cone,
  sphere, pillar, square pillar, wedge — drawn by
  `client/src/backrooms/shapes.ts` for the game and the preview alike, built
  AT SIZE (never a scaled unit mesh) with UVs box-projected in world metres, so
  a texture tiles on a shape at the same scale as the wall beside it. A
  placement carries `sx/sy/sz` metres (`SHAPE_MIN`..`SHAPE_MAX`), `tex`
  (any surface id — wall, floor, ceiling or uploaded; the surface's own
  material from world.ts `shapeSurface`, so it wears the game's light), `col`
  (paint, or a tint over the surface) and `solid` (default true). `kitSize`
  is the one size every footprint, collision box and checker reads. On Level 0
  a shape's surface is held to `LEVEL0_SURFACES` like a room's look. An
  uploaded texture on a shape rides the chunk's `surfaces` list. The Size
  handle stretches one along its own axes.
- **THE HELD CEILING** (`src/backrooms/ceiling.ts`). A ceiling was always
  the cell's floor plus its room's height, so a floor dropped with the Heights
  tool took its ceiling down with it. The Heights tool's default is now
  **Floor only**: the first change to a cell pins its ceiling to the floor it
  had, in the room design's new `ceiling` layer (a height glyph per cell,
  "." = follows the floor); bringing the floor back lets it go. **Floor and
  ceiling** is the old way. A held cell's ceiling is `ceilingWithLid`: its
  room's ceiling over the held height, never closer than `LID_HEADROOM`
  (2.2m) to a raised floor. The Poolrooms keep their one flat lid regardless
  (and their palette says so). The layer turns and mirrors with the room,
  travels in the clipboard, is stamped into `Sector.lid` by all three
  generators (Pipe Dreams adds the room's deck, like its floor), streams as a
  chunk's `lid` when any cell in it holds one, and is DRESSING: not hashed,
  a repaint on the publish screen, swapped live by `swapDressing`. world.ts
  `ceilingOf` is the one client rule; the editor's preview and its ceiling-
  prop placement use the same.
- **LIGHTS** (the preview's 💡). The game's light is baked, so the preview
  bakes it the same way: the fixtures each room's Lights setting leaves on
  (`lobbyLampOn`/`styleLampOn`, Pipe Dreams' lamp cells and safe rooms),
  world.ts's falloff and directional wrap, walls stopping it
  (`wallsBetween`, the same 8%-through-one-wall rule), the same per-surface
  curves (floor 0.9+0.32e, wall 0.89+0.3e, ceiling 0.88+0.38e; Pipe Dreams'
  dark curve; Level 0's per-type ambient; each room's brightness), under the
  game's own dim rig. The panels are drawn where they hang and the flickering
  ones flicker. Honest rather than flattering: a fully lit Level 0 room is
  near-uniform in the game too — the contrast shows in rooms with lights off.

- **SCENERY** (the day after: "i get the open cells cannot be walked to … even
  though i dont want them to be reachable"). Floor no door of its room can
  walk to was an ERROR that stopped a test play and a publish, and the
  generators would have sealed it into rock anyway. It is a WARNING now and it
  is SCENERY: the lint marks it (`Tile.scenery`), it turns with the room, and
  all three generators make it a `background` cell instead of sealing it —
  drawn like any floor, but the server's step rule and the client's collision
  both treat it as stone, so nobody can walk in, fall in and be stranded, and
  nothing to hunt (relics, drives, the key, creatures) is ever placed there.
  The editor hatches it on the grid. What still stops you: a door cut off from
  the others, and props cutting floor off (floor that was never reachable is
  not the props' doing). No map changed — no room in the repo libraries has
  any.

- **STAIRS ARE STEPS** (Oct 2026: "make sure the stairs work with this so its
  look clean and less wonky. also give me the ability to color, scale, resize
  and texture stairs"). A stair cell used to be a sloped floor quad — a ramp
  with a yellow mark on it in the editor. It is now real treads, built by one
  module (`client/src/backrooms/stairs.ts`) that the game's chunk builder and
  the editor's preview both call. Each tread is a solid block down to the
  cell's floor, so nothing under a flight is ever open. A room carries one
  `stairs` dressing for all its flights (`src/backrooms/stairs.ts`):
  `tex` (any surface — a marble flight in a concrete hall), `col` (a tint),
  `steps` a cell (1-8, default 3), `width` (40-100%) and `rail`. The map
  carries `stair` (the UP side per cell, -1 none) and `stairStyle`
  (1 + an index into `stairSpecs`), neither hashed — a redressed flight keeps
  the map, and `swapDressing` re-sends the chunks whose stairs changed.
  Width trims only the flight's EDGES (a cell with no same-direction stair
  beside it), and the trim is a sloped stringer riding just over the
  nosings, which is where the rail stands. Risers draw at 0.7 of a tread's
  light, the one cue that makes steps read from across a room. Movement did
  not change: the server and the client still climb a stair as the corner-
  averaged ramp, which sits at or below every nosing, so feet never sink
  into a step.

Harnesses: `test_propkit` (tilt + shapes), `test_mapeditor_tools` (the held
ceiling end to end, the clipboard's flip, the stair dressing), `test_lobby` (a shape's surface on
Level 0), `test_mapeditor` (a held ceiling and a shape published live reach a
player in the refreshed chunk).

### FLOORS, TRIED AND REMOVED (Josh, 2026-10-03 → 10-06)

Three rounds of floors stacked over one another, all taken out on Oct 6:
*"lets just remove the entire floors system and go back to what we before we
added them. they are just too buggy right now"*. **Every map has one floor
per cell again**, exactly as before Oct 3. What stayed: the real stairs (the
section above) and the editor's bigger default zoom.

What was tried, in order (commits 5f0fa44, b6dc068, 89f203f, 3ef83a3):
1. **Floors inside a room** — a room carried extra floors at its own cells
   (`TileDef.storeys`), stamped into per-cell map layers, with one landing
   rule ("the highest floor at or below your feet plus a step") shared by the
   server, the client and the editor's walk. Rails and walls were built by the
   generator along every storey edge.
2. **Upper rooms** — whole rooms flagged to stand on an upper floor, hung off a
   doorway on another room's storey; creatures got layered A* so they could
   follow a body up a stair.
3. **The Lethal Company model** — no special rooms: a doorway on a room's
   floor above or below grew the level's ordinary rooms out at that height,
   in 3D, a small cluster per stairway.

**What made it buggy, for whoever tries again.** A second floor touches every
system that assumed one height per cell — collision, the server's move check,
falls, ceilings, wall heights, the chunk builder, props, creature paths and
sight, the preview, the editor's every tool — and each had to learn layers
separately. Faults found along the way: a new empty floor walled every cell
(an edge rule that treated "no floor" as "blocked"); a slab underside
z-fighting black in the preview; a crash on a negative step distance; chunk
walls dropped for cells with only walls; a jump checked before the walk;
creatures keeping a stale layer through a teleport. Each was fixed and the
next surfaced. **If floors come back, design them as one data model the whole
stack reads (a cell holds a list of floors), not as a layer bolted beside the
ground arrays**, and give it a walking harness before an editor.

A saved draft that still carries a `storeys` key is harmless: nothing reads
it, and the next save drops it.

### LEVEL 0's CREATURES, VALIDATED (Josh, 2026-09-30)

*"lets have 3 entities, with the third wondering around the key, not right
on top on it but in the area with a couple pass through here and there …
a quick validation check on level 0's creature AI … when a player shines
their flashlight on it it immediately run away lets make it to where it take
shining the flashlight for at least 2 seconds … have a burning sound … the
stalker follows the players too closely"* — and, mid-round, *"if player get
the key and unlock the next level then the 3rd entity should just wonder
around the entire map"*. Harness `test_level0_creatures.mjs` (27), which is
also where every finding below was measured.

- **THE KEEPER, the third Entity** (id 2). It never guards a relic and never
  swaps posts: it walks the ground `KEEP_NEAR`..`KEEP_FAR` (6–18) cells from
  THE KEY's resting place, a new spot every beat, and every 3–5 beats walks a
  line THROUGH the key — to within a step of it, then out the far side.
  Measured at the game's pace: it is within 3 cells of the key well under a
  tenth of the time. **Once THE DOOR is open (`LEVEL1_FLAG`) it has nothing
  to keep** and roams the whole level, a far destination (40+ cells) each
  time it arrives. The two relic Entities are unchanged.
- **THE BURN.** A beam must be HELD on the stalker: `litMs` builds 100ms a
  tick while a lit flashlight (≤16 cells, ~23° cone, clear line) is on it,
  cools three times as fast off it, and it breaks at `STALK_BURN_MS` (2s).
  While it burns it staggers at 30% of its speed, so two seconds of light is a
  defence rather than a countdown. The pos frame carries `burn` and every
  client near it hears `assets/stalker/burn.ogg` (a loop generated through
  `gen-sounds.mjs stalker`) and sees an ember smoulder in its material
  (emissive — it lights nothing; the fixture law).
- **THE DISTANCE, and why it kept walking into view.** Its "ring" of 13 was
  held by choosing a random cell anywhere WITHIN 13 of the player — half its
  waypoints were a few steps from you, reached across open floor, so it was
  seen, bolted, and came straight back. Now, while the lights hold:
  · it waits at a place nobody can see, 16–26 cells off, preferring the
    ground BEHIND the one it follows (`pickLurk`);
  · it gets there by the dark way — `hiddenPath` prices a seen cell at 8
    and ground within 4 cells of a player at 30, over `seenGround`, the
    cells every player can see (720 rays each, ~100k checks, refreshed every
    400ms);
  · caught in ANY sight line (facing doesn't matter; people turn round) it
    ducks for the nearest hidden cell that is no nearer to anyone, never
    routing within 3 cells of a player, and COMMITS to it — re-choosing
    every 600ms while you moved flipped it side to side in plain view;
  · it won't step into view on its own account while it has room, but once
    you are inside 12 cells it goes regardless (a glimpse of it leaving beats
    being walked into in a dead end).
  Measured over a minute of walking the level and looking back: in sight on
  0–1 ticks of ~550 in most runs (it was 5% and within a cell of the runner
  before), mean distance ~25 cells. **The known edge**, about one seeded run
  in twenty: a runner who walks straight into the dead end it is hiding in,
  where the only way out is past them, still gets a close look at it. The
  next step if that ever matters is scoring dead ends down in `pickLurk`.
- **ITS FEET.** One Walk cycle (0.975s) carries a foot ~2.15m fore and aft at
  its drawn 2.25m — the clip walks ~4.3 m/s, 2.15 cells/s — and it moves at
  5.7 on fixed rates of 1 / 1.7 / 2.1, so it skated. The client now reads its
  ground speed and plays the walk at speed ÷ 2.15.
- **PATHING, all of Level 0's creatures.** (a) **Diagonals through wall ends**:
  a diagonal is legal when EITHER L-route round the corner is open, and the
  centre-to-centre line then runs through the end of a thin wall (an Entity
  crossed the drywall at 102.9,154 on A6). Level 0's creatures path with
  `clearCorners` (both L-routes open — no wall touches that corner) and
  string-pull or lunge only along a `fatLineIn` (the line and two more
  0.22 cells either side). (b) **Shafts**: a pit is a legal step with no way
  back out, so they refuse pit cells in the route, the pull and the lunge.
  (c) **A noise it has reached is spent**: it used to stand on the spot,
  re-planning a zero-length route, until its 12s memory ran out.
- **LEVEL 0 WEARS THE BACKROOMS ONLY** (the same message: "level 0 should
  only have backrooms texturing not pools or stuff from pipe dream"). The
  restrooms wore white wall tile and cream floor tile, storage wore Pipe
  Dreams' own concrete photographs; both are yellow rooms now (stripes /
  chevrons over stained carpet — the stalls and shelving say what they are).
  `LEVEL0_SURFACES` in surfaces.ts is the list, the Level 0 look picker offers
  only those, its checker refuses the rest by name, and uploads are allowed.

### A6 — THE YELLOW ROOMS (Josh, 2026-09-29)

*"keep most of the map the same color pallet with a couple of room with
different variance like the one we have now. lets also make the map a little
smaller by like 25%"*

A5 dealt all thirteen room types as DISTRICTS, so the tiled restrooms, the
wood panelling and the bare concrete storage each covered a whole patch of
the map, and the level read as a sampler rather than the backrooms. A6
(seed `20261038`, 182² — about three quarters of A5's walkable floor, 32,151
cells against 43,769) keeps them but changes what they are:

- **Every district wears the yellow palette**: classic, offices, warrens,
  halls, pillars, terraces, sublevel, atrium, plus manila (yellowed paper,
  stained carpet) and the unlit rooms (the same paper in the dark).
  `TYPE_ODDS` weights classic heaviest; the deck deals only types with odds.
- **The palette-breakers are ACCENTS** (`ACCENTS` in worldgen-lobby.ts):
  restrooms, panelled and storage never form a district. Beside their
  landmarks (The Washroom, The Boardroom) `ACCENT_ROOMS` (3) single small
  rooms — one of each — are spread like landmarks, the odd room you
  stumble into. The pack never places an accent anywhere else.

`test_lobby` pins it: the palette-breakers are three to six rooms and at most
5% of the modules. Renders: `docs/backrooms/LEVEL0-A6{,-heat}.png`.

### The doors, round two, and the lamps (Josh, 2026-09-27, the same evening)

*"Make the entrance and exit door an actual door against the wall use any of
the door assets. but for the drain just mark a circle in red on the floor for
the entrance and in level 0 just mark red lines against the wall as the
entrance, but make the actual exit a door to unlock with a key."* And a law:
*"never do lights like this — maps all lighting must come from a light source
asset."*

- **Level 0's Entrance**: red lines on its wall — the spray mark inside the
  red outline, no sign.
- **THE DOOR** (Level 0 → the Poolrooms): the prop kit's worn white wooden
  door, set flush in the nearest wall to its site (`wallMount`), still locked
  until someone carries the key; outline, a red "LOCKED"/"OPEN" sign, and the
  pool's pale light behind it once it stands open.
- **The Landing**: the kit's teal steel door against its room's north wall.
  The door had stood in the middle of an open room with no wall within five
  cells, so it MOVED in the room design — the door is in the fingerprint, so
  the Poolrooms are sector **P5** (charted map fresh). The Poolrooms lint now
  asks a wall-mounted door for clear floor on its open side only.
- **The Drain**: a red ring on the floor round the hatch.
- **Pipe Dreams' lamps** are the kit's caged bulkhead lamp, instanced face-down
  on the ceiling, where a bare glowing sphere used to be. The lens glows, the
  housing carries a faint self-light so the fixture reads, a dead lamp goes
  dark.

The door models and the lamp came in through the new-asset intake
(`scripts/props/intake.mjs`) — see CLAUDE.md → THE PROP KIT.

### Updating maps safely (Josh, 2026-09-29 — "any upgrades we can do to the level editor or the process of updating maps?")

- **A props-only publish keeps the map.** Props are not in the fingerprint,
  so a publish whose build fingerprints the same as the map being played
  keeps its sector id: the charted map, spray paint, bodies, drops, relic
  sites and doors all stay, only the prop list is swapped, and it goes live
  with people down there (their nearby chunks are re-sent and rebuilt).
  Anything that changes the map itself — a room redrawn, a doorway moved, a
  room type changed, a new seed — is still a new sector, and still waits
  for the level to empty.
- **The publish screen lists what changes** (rooms added / removed /
  redrawn, doorways moved, props placed / taken away) and says in one line
  whether players keep their charted map.
- **Walk it**: the editor's 3D preview has a first-person mode at the
  game's own walking speed, with Level 0's real wall, floor and ceiling
  materials.
- **Box and Fill tools, and redo.**
- **`scripts/pull-map.mjs`** brings a published design into git in one
  command (the repo file, the sector constants when the map changed, a
  build and the level's harness).
- **The panelled offices wear photographed wood panelling** (a Poly Haven
  CC0 scan, hung level so its rails line up from wall to wall). A
  photographed restroom floor tile was tried and dropped.

- **The look picker** (the same day, then every level): a room's settings
  carry a Look — its walls, floor and ceiling, each its default unless
  picked from the surface catalogue (`src/backrooms/surfaces.ts`), on
  Level 0, the Poolrooms and Pipe Dreams alike; the catalogue holds every
  level's own surfaces, so a Pipe Dreams room can be tiled like a pool. A repaint is
  dressing like props: it publishes without resetting the level. New
  textures from `assets/New Assets` become catalogue entries and appear in
  the picker.

### The editor's next level (Sep 2026 — "lets do them all")

Josh asked for everything on the list plus creature spawners and props that
move on x/y/z, "intuitive for building … we dont want this to become way to
complicated". So one new tab (Game), one new tool (Select), and everything
else is a field beside the ones already there. CLAUDE.md → THE MAP EDITOR has
the mechanics; what matters for the game:

- **Creature spawners.** An Entity can be placed in any room on any level —
  Pipe Dreams, which had no creature, now has whatever the designer puts
  there. It wanders its own ground near the spawner, at the spawner's speed
  and sight, and kills exactly as the Entity does. Alligators can be put in
  any deep water with their own sight, bite and speed; a pool with one of
  those gets no resident besides. Spawned creatures sleep while nobody is
  near, and a level holds at most 24.
- **Relic and drive spots.** Relics turn up on relic spots first, then
  anywhere deep as before; lore drives fill drive spots first.
- **Room lights and sound.** A room can have some or none of its lights on,
  more of them flickering, and be darker or brighter — the fixtures stay
  fixtures. It can play a sound while you stand in it (dripping water, a
  radio, wind, music through the wall, buzzing lights, machinery, another
  level's hum) or hush the level's hum altogether.
- **Uploaded textures.** A photo uploaded in the editor becomes a wall, floor
  or ceiling any room can wear, streamed to the game with the rooms that use
  it.
- **Signs.** Painted words, paper notes, metal signs and floor writing,
  carrying the designer's own words.
- **Props in some copies only.** A prop (or a spawner, or a spot) can appear
  in half, a quarter or a tenth of a room's copies — the same copies every
  time.
- **All of the above is DRESSING**: it publishes live, with players inside,
  and never resets a level's charted map.
- **Test play.** The admin can walk a draft in the real game before anyone
  sees it. The level is theirs alone while they test, nothing they do there
  counts, and the live level comes back exactly as it was.
- **What players did.** The editor's whole-level view shows where players
  died (recorded with their map from now on), which floor nobody has ever
  seen, and how far every cell is from the level's door.

## LEVEL 3 — ELECTRICAL STATION (DESIGN, not built — Josh, 2026-10-09)

**Status: design round 2 (2026-10-09).** Its door already exists: Pipe Dreams'
fuse box sets `LEVEL3_FLAG`, and the pressure door answers "not built" until
this level does. Nothing below is code yet except the relics (ten, catalogued
in `STATION_RELICS`, deliberately outside `ALL_RELICS` until the level ships —
see relics.ts). Next: the creature's model and name, then the asset intake.

### Round 2 (Josh, 2026-10-09)
- **THE CREATURE:** *"Pale white, tall, large teeth, blood soaked, extremely
  fast, kill on contact. Hates the flashlight and will run away after 1 second
  of being shined on."* So: touch is death (no HP chip — the grab's shape,
  not the gator's), it outruns a sprint, and the counter is a HELD beam — the
  stalker's burn rule (`litByFlashlight` through `facingOf`, a sweep does
  nothing, ~1s of steady light sends it running). Speed must leave the 1s
  burn winnable: a creature that closes faster than a player can turn and
  hold a beam for a second is just a death roll. Tune against that.
- **SIX BREAKERS.**
- **CUTTING A SECTION'S POWER KILLS ITS LIGHTS AND MAKES ITS WATER SAFE.**
  That is the level's central trade: the way across electrified water is to
  plunge that section into the dark — the creature's element — and cross by
  flashlight. Sections and breakers are therefore the same partition.
  **SETTLED (Josh, 2026-10-09): the six breakers ONLY EVER SWITCH ON** —
  one-way community progress, a `backrooms_flags` row each, exactly the
  fuses — **and each section has its own separate CUTOFF**, a local switch
  that kills that section's lights and makes its water safe. Cutoffs are
  per-run, server-clocked state (they restore on their own, so a section is
  never left dark for the next team), never progress.

### THE MAP — SECTOR S1 (built 2026-10-09, not yet served)
`src/backrooms/worldgen-station.ts`, frozen at **seed 20261009, 130×130**
(16 modules a side, about half Pipe Dreams by area — "smaller and denser"),
fingerprint pinned. **It is Level 0's LATTICE with 8-cell modules**: rooms
drawn in `station-rooms.json` (dialect `station-tiles.ts`, vocabulary
`station-vocab.ts`), packed wall to wall, doorway slots in the middle of every
module side. What the station adds:
- **SIX SECTIONS** — a Voronoi over six far-spread seeds on the module grid;
  every room wholly inside one; `sector.section` per cell (it joins the
  fingerprint when present, like deco).
- **ONE BREAKER ROOM PER SECTION**, the one deepest in it from the way in;
  **the Lift Hall** (the shutter) as far from the way in as the map allows;
  **The Intake Hall** (The Pressure Door) at the middle of one edge.
- **CUT DOORWAYS**: a corridor room's solid flank carries no slot, so two rooms
  can meet with nothing to join them — the spanning tree may then knock a
  doorway through the solid to the corridor (native slots first; a cut only
  where the tree needs it). This is what took sealed cells from 592 to 0.
- **THE CUTOFFS** are placed by the generator, one per section, on a wall of
  that section's room nearest the way in — you meet a section's cutoff before
  its depths.
- **THE DRY ROUTES** (the placement law's station rule): every cutoff
  reachable without crossing ANY water; every breaker without crossing
  ANOTHER section's water — its own may stand in the way, which is the puzzle.
  Water in the way of either is drained (0 cells on S1).
- The first library: 20 rooms (start, goal, three breaker rooms, six
  serviceways, a cable vault, control room, battery room, transformer bay,
  substation hall, workshop, two flooded rooms). S1 has 208 rooms, 47 arcing
  panels, ~600 water cells, 605 lamps (7% dead, 10% flickering). Render:
  `node scripts/render-station.mjs` → `docs/backrooms/station-<seed>.png`.
  Harness `test_station.mjs` (26). Written once by
  `scripts/station-library.mjs`; edited in the map editor from here on (once
  Level 3 is editable).

### Round 3 (Josh, 2026-10-09: "the dover demon is perfect. everything else is what you recommend")
- **THE BODY: the Dover Demon** (Sketchfab, W.Prigs, CC-BY 4.0 — the uploader
  says it is the creature from the Roblox game *Whispering Pines*; credit both).
  Fetched by `scripts/assets/fetch.mjs` into `assets/New Assets/sketchfab/
  5a64c259a5a8410da7e39eb9e2acff75/`: 2.39m, 19.6k triangles, one 1K texture
  set, 81 bones, NINE clips that map one to one onto the brain — Idle/Idle2/
  Search1 roaming, Walk, Run (the chase), Attack1 (the touch), Scream (it has
  seen you), **RetreatScream (the held beam's second is up)**, Hurt1 (spare).
  Its clips are short (Run 0.32s, Attack1 0.23s) — played at rate 1 they read
  frantic, which is right for "extremely fast".
- **THE EXIT TO LEVEL 4: a heavy roller shutter** (Poly Haven
  `rollershutter_door`, CC0), raised when the sixth breaker goes on.
- **THE BREAKERS: the lever power switch** (Sketchfab, Sam Feng, CC-BY) — it
  already carries a throw animation.
- **ITS NAME: THE BLEEDER** (Josh, 2026-10-09: "call the creature whatever you
  want name it something scary"). A bleeder is the resistor that drains the
  last charge out of a dead circuit; this one drains you, and it is soaked in
  blood. Code id `bleeder`.
- **ITS SOUNDS** (Josh: "make sure it has audio for its attack, hunting,
  running, and idle noises"), generated by `node scripts/gen-sounds.mjs
  bleeder [id]` into `client/public/assets/station/bleeder/`: `idle`,
  `hunt` and `run` LOOP (idle while it waits in the dark, hunt while it
  searches, run for the chase); `attack` is the touch, `scream` the moment
  it has seen you (its Scream clip) and `retreat` the held beam's second
  (its RetreatScream clip). Each carries the station's electricity — the
  lights it lives in buzz and crackle when it is near. Measured: attack and
  scream peak ~10dB under the loops, so their in-game gain should sit above
  the loops' when the creature is wired.
- **THE SHIP GATE applies** (CLAUDE.md → THE PLACEMENT LAW + THE SHIP GATE):
  breakers, cutoffs, relics and the shutter through `placement.ts`; the
  creature's starts through `whyNoCreature`; a behaviour harness with one
  assert per line above — touch kills, it outruns a sprint, a sweep does
  nothing, a held second sends it off screaming, it never enters a lit
  section… — and `test_progression` walking all six breakers to the shutter.

### THE BLEEDER, BUILT (2026-10-09 — "everything else is what you recommend")
The brain is the bleeder block in `service.ts`; the client is
`BackroomsGame.svelte` (BleederInst) + `bleeder-audio.ts`; the model is
`client/public/assets/station/bleeder/bleeder.glb` (the Dover Demon, 3.8MB
after `shrink-glb`, credits beside it). The rules, each one an assert in
`test_bleeder.mjs` (27):
- **IT LIVES IN THE DARK, NOT THE LIGHTS.** It is only ever in a section with
  no power — a pulled cutoff or a rolling blackout — and it never sets foot in
  a powered one (lit cells are a wall in its pathing, `bleederShuns`). So the
  level's central trade bites twice: cutting a section to cross its water is
  inviting it in. (This settles round 1's "lives in the lights": the lamps
  are what keep it OUT. A lamp flickering as it nears was dropped — where it
  can walk, the lamps are already dead.)
- **THE BREATH:** 2.5–5s after a section with somebody in it goes dark it
  comes out of the wiring 7–18 cells off, round a corner nobody can see, on a
  cell `whyNoCreature` passes, with a dark route to its mark.
- **THE SCREAM:** the moment it has a clear line within 22 cells it stands
  and screams for `BLEEDER_SCREAM_MS` (800ms) — the warning, sent to the
  wire as `bleederCry` (heard 40 cells) and to its target as a note. Then it
  charges at **4.3 cells/s** (a sprint is 2.85); it searches at 2.6, just
  under a sprint. **Touch is death** ("the bleeder"); it stands over the body
  for 3s and hunts on.
- **THE BEAM:** a lit flashlight within 16 cells, ~23° cone, clear line
  (`beamOn` — the stalker's rule, generalised to any sector) builds burn;
  off the beam it cools three times as fast, so a sweep does nothing.
  **`BLEEDER_BURN_MS` (1,000) of beam and it shrieks and flees**, then stays
  in the wiring `BLEEDER_REST_MS` (35s). Under the beam it moves at a third
  of its speed — **the fairness rule, pinned:** even a player who wastes the
  whole scream and lights it only as it starts to run wins by holding the
  beam (it gains ~1.4 cells in that second).
- **THE LIGHT COMING BACK** under it drives it out the same way.
- **One creature, server-clocked**; frames within the usual range, `gone` to
  the whole level; the operator view names it. **Admin J** (in the station)
  summons it round the nearest corner, light or not — the playtest lever
  (`POST /api/admin/backrooms/summon-bleeder`). A FLYING admin is not prey,
  so it goes straight back into the wiring.
- Its clips: Search1/Walk hunting, Scream, Run (quickened past 4 cells/s),
  Attack1 within reach, Idle2 over a body, Hurt1 while burning,
  RetreatScream then Run fleeing. Sounds: idle/hunt/run loops crossfaded by
  mode; the cries at ~3× the loops' gain (they were measured ~10dB under).

### Josh's decisions
- **THE CREATURE IS NEW AND LIVES IN THE LIGHTS.** Something in the wiring:
  the lamps near it flicker and buzz harder as it closes, and a fixture going
  dark is the warning. Its body, its brain and how light hurts or helps
  against it are the next design round. The fixture law holds — every lamp it
  disturbs is a real fixture model (`instanceFixture`), and the flicker it
  causes must ride the same per-cell lamp state every client already shares
  (`styleLampOn` / the room styles' `flicker`), so every observer sees the
  same dying lamp.
- **THE WAY DOWN IS RESTORING THE POWER.** Several BREAKERS spread across the
  station; any player can throw one, and a thrown breaker stays thrown for
  everyone forever — a `backrooms_flags` row each, exactly the fuses' doctrine.
  When all of them are thrown the way to Level 4 (Abandoned Office) powers up
  and opens, `LEVEL4_FLAG`, broadcast with Sterling's line. Count, placement
  rule (far from the landing and from each other, never on a stair — the
  `fuseSites` farthest-point sampling) and whether the exit is a lift or a
  door: next round. `test_progression.mjs` must walk the new link.
- **HAZARDS, all three:**
  · **LIVE WIRES AND ARCING PANELS** — sparking cable runs and panels on a
    readable rhythm (Pipe Dreams' steam-vent shape: a crackle about a second
    before each arc), damage in reach of the arc.
  · **ROLLING BLACKOUTS** — whole sections lose power for a while; the
    flashlight is all there is until it returns. Server-clocked so everyone in
    the section loses the lights together. Lamps are dark, not removed — the
    fixture law.
  · **ELECTRIFIED WATER** — puddles under broken equipment that are live until
    that SECTION's power is cut. Ties the hazards to the breakers: the station
    is divided into sections, each on its own breaker. (Open question: does
    cutting a section kill its lights too, i.e. trade light for safety?)
- **SMALLER AND DENSER than Pipe Dreams** — tight service corridors and
  machine rooms, quicker to cross. Built from hand-drawn rooms in the map
  editor like every level since Sep 2026: a dialect (`station-tiles.ts`), a
  library, a generator, one `levels.ts` entry — never a copy of the format.


## LEVEL 4 — THE ABANDONED OFFICE (BUILT, behind its ship gate — Josh, 2026-10-12)

**Status: BUILT and deployed behind its ship gate (Oct 12 2026).** Stage 1 (the assets: 24 office props in
the kit, the carpet and drywall, the Temp's mannequin and the keycard) and
stage 2 (the map, sector O1: office-vocab.ts, office-tiles.ts, 22 rooms in
office-rooms.json written by scripts/office-library.mjs, worldgen-office.ts,
`test_office.mjs`, `scripts/render-office.mjs`) are done. Stages 3 and 4
(served, and drawn): the Station's lift shutter now leads DOWN into the office
once all six breakers are on — members wait at the office's own SHIP GATE
(`OFFICE_OPEN_FLAG`, the hub's ⚑ lever, admin always through); THE KEYCARD is
Level 4's key (`keyHolder[4]` — every rule the key keeps, it keeps:
`test_progression` walks the chain into the office, carries the card out and
back, loses it on a body and loots it off, and badges it), THE STAIRWELL DOOR
sets `LEVEL5_FLAG` and answers "not built"; the operator view names the lift,
the keycard and the door; twenty office lore drives with Voss's notes
(`lore-office.ts`); the office's room names in Voss's hints; the map editor
edits Level 4. The client draws it in its own style: beige drywall and grey
carpet (the two new surfaces), Level 0's drop ceiling, troffers from the map
(dead ones still hang there, grey), windows with rain on the building's edge.
THE TEMP and the troffers' dips are built (THE TEMP, BUILT, below), and the
sounds are in (Josh: "I trust that they are fine"). The laws, checked: law 9
— `load_backrooms` runs 16 on all FIVE levels (80 bodies, p99 21.5ms, worst
43ms); law 10 — `test_proximity` signs the office its own room; law 12 —
`test_spectate` watches a death in the office; law 8 — judged against the 20
references (REFERENCES.md → Level 4): the ceiling was Level 0's YELLOW tile
and read olive, so the office has its own, the same tile greyed and washed
off-white (`officeCeiling` in world.ts), and the light was lifted
(`OFFICE_BASE_LIT` 0.24 → 0.3, `OFFICE_LAMP_GAIN` 1.5 → 2.0): measured
(53, 51, 47) at luminance 51 against the set's (57, 52, 48) / 53.
THE TEN RELICS are in (Oct 12, Josh's pictures in `assets/relics/Abandoned
Office/`, cut out by `scripts/relic-art.mjs` — four of them on a baked
checkerboard, which its new `checker` mode measures and removes, so a white
printer on white survives): The Blank Book, Claire's Bouncer, Gold Stapler,
Magic Ring, Printer of Time, Rug of Persia, Sacred Lollipop, The Slime,
Sword of Fate, Timeless Robe. Like the Station's they spawn and are carried
but stay out of `ALL_RELICS` until the level opens.
**Not yet:** Josh's Test play, after which the hub's ⚑ lever opens it to
members.
The Temp's poses are the mannequin's one clip frozen at chosen moments
(t = 1, 2, 4, 5s of its 6.3s idle: head turned, head cocked, twisted and
leaning in, arms out; t = 0 is the neutral stance).
Its way in already exists: the Station's six
breakers set `LEVEL4_FLAG`, and the lift shutter in The Lift Hall answers
"not built" until this level does. Josh's calls, 2026-10-12: *"Let's do the
next level in order. Office, let's do the key card. I like your idea on the
creature. I agree on 4"* (Station-sized). Nothing below is code yet.

### What it is
The canon's fourth level: an office that goes on forever and was left in the
middle of a working day. Judged against 20 references before a line of it was
built (REFERENCES.md → Level 4, measured (57, 52, 48) at luminance 53 — a
neutral-warm grey, dim):
- **Dark grey carpet, beige drywall, a drop ceiling of fibre tiles and
  fluorescent troffers — MOST OF THEM DEAD**, so the floor is lit in pools.
  The dark between the pools is where the Temp can move (below).
- **Big rooms are BARE** — vast open floors broken only by square pillars,
  carpet dented where furniture once stood. **Furniture lives in the small
  rooms**: cubicle farms, workrooms, confined offices, a records room of
  shelving, a break room with vending machines and a water cooler.
- **Windows with RAIN behind them**, in fog, under a sky that never changes
  (canon); the pattering of rain is the level's ambient bed, with the low
  rumble of pipes under it.
- **Stairwells you can look into that only ever lead back to the same floor**
  (canon) — scenery. The badge-locked stairwell door is the one that goes
  anywhere.
- Plain corridors and brown wooden office doors.
It is QUIETER than the Station — fewer hazards, more dread — and the light is
the level's whole mechanic. **Canon calls Level 4 "devoid of entities"; the
Temp is a deliberate departure**, since every level here has its creature.

### THE MAP — SECTOR O1
- **About the Station's size: ~130×130 cells**, dense rooms rather than long
  halls, built from hand-drawn rooms in the map editor like every level since
  Sep 2026: a dialect (`office-tiles.ts`), a library (`office-rooms.json`), a
  generator (`worldgen-office.ts`), one `levels.ts` entry, and the level in
  `EDITABLE_LEVELS` from the first commit.
- **8-cell modules on the lattice** (the Station's packing), doorway slots in
  the middle of every module side; cubicles are THIN WALLS (Level 0's
  vocabulary), so a cubicle farm is a maze you can see over the top of but
  not walk through.
- **The first library, ~20 rooms:** The Lift Lobby (the way in), the Security
  Office (where the keycard lies), the Stairwell Door (the way down), open-plan
  cubicle farms (several), corridors (straight, corner, T), a conference room,
  an executive corner office, a break room (water cooler, vending machine),
  a copy room, a records room (filing-cabinet rows), a server closet (racks,
  dark), restrooms, reception, a supply closet.
- **ONE DOOR IN: The Lift Lobby** — the lift you rode down, its doors marked
  in red on the wall (the doors law). It is a SAFE ROOM: lit, and the
  creature never enters it.
- **The Security Office is the deepest landmark from the lift; the Stairwell
  Door as far from both as the map allows** (the Station's goal placement).

### THE WAY DOWN — THE KEYCARD (Josh's pick)
- **ONE SECURITY KEYCARD** lies on the desk in the Security Office. Carry it
  to **THE STAIRWELL DOOR** — a heavy steel door with a badge reader, red
  light while locked — and badge it: the reader turns green, the door opens
  for everyone, `LEVEL5_FLAG`, broadcast with Sterling's line. Until Level 5
  (Terror Hotel) is built the open door answers "not built", exactly the
  Station shutter's shape.
- **THE CARD FOLLOWS THE KEY'S RULES, all of them** (`test_progression`
  already pins them for the key and the fuses): carried out of the level it
  goes home to the Security Office; dropped by a death it lies on the body
  and can be looted; on a body down a shaft it goes home at once; the admin
  sees it in its carrier's hands on the operator view.
- Sounds: the reader's deny beep (no card), its accept chirp, the door's
  heavy unlock.

### THE CREATURE — IT ONLY MOVES WHEN NOBODY IS LOOKING (Josh: "I like your idea")
A figure that is always somewhere in the office and never seen moving. Name
proposed: **THE TEMP** — nobody hired it, it was here before anyone, and it
is always at a different desk. Code id `temp`. (Josh may rename it.)
- **WATCHED, IT IS STONE.** It cannot move while ANY living player on the
  level has it in view: inside a ±45° cone of their facing (the camera's
  field of view with a margin), a clear line of sight (the same LOS every
  creature uses), within 40 cells, **and lit** — standing under a working
  lamp, or held in a flashlight beam. A thing you can't see isn't watched.
- **UNWATCHED, IT IS FASTER THAN YOU.** It closes on the nearest player at
  **3.4 cells/s** (a sprint is 2.85), along a real path, never through a
  wall. You cannot outrun it with your back turned. You survive by LOOKING:
  walk backwards with it in view, check behind you, keep a teammate's back.
- **TOUCH IS DEATH** ("the temp"), and afterwards it stands still a while
  over the body, then is gone — and somewhere else when next seen.
- **THE BLINK — THE LIGHTS ARE THE MECHANIC.** The fluorescents dip dark for
  ~0.4s on a server clock, a zone at a time, every 8–15s. In a dip it is not
  lit, so not watched, so it MOVES — up to ~1.4 cells a dip. Every dip is a
  step closer to whoever is staring at it. **A held flashlight beam on it
  keeps it lit through a dip**, which is what the torch is for on this level.
  The dips are the same for every observer (server-clocked and broadcast,
  never a per-client flicker), and the lamps going dark are the real
  fixtures dimming — the fixture law.
- **It never enters the Lift Lobby**, never follows a FLYING admin, and is
  out of reach of the dead.
- **FAIRNESS, to be pinned before it ships (law 11):** a solo player walking
  backwards with a torch held on it must be able to cross the map; the
  harness drives exactly that run. If the numbers make solo play a death
  roll, it goes to Josh rather than being quietly tuned.
- **One Temp per level**; whether a full floor (6+ players) brings a second
  is a tuning question for later, not round 1.
- **Its body: a featureless office mannequin**, frozen in a different pose
  each time it is seen (it moves only between looks, so it never needs a
  walk cycle — it needs POSES). Sketchfab, credited. **Its sounds**, via
  ElevenLabs and previewed by Josh before they're committed: a plastic-on-
  carpet SCRAPE heard only while it moves and only by those NOT looking, a
  stiff joint CREAK when it freezes, and the kill.
- **Admin lever**, like the Bleeder's J: summon it round the nearest corner,
  for playtesting.

### THE TEMP, BUILT (Oct 12 2026)
`service.ts` → "THE TEMP". One per level, always somewhere while anybody is
down there, arriving out of everyone's sight 18-40 cells from somebody, never
in the Lift Lobby. **Watched** (`tempWatchedBy`): inside the ±45° cone
(`TEMP_CONE`, cos 45°) of ANY living, walking player's facing, a clear line
(`lineWalkableIn`, the creatures' LOS), within `TEMP_RANGE` (40), and LIT —
its cell lit by a working troffer (`officeLitCells`: within `LAMP_REACH` of a
working or flickering one) outside a dip, or anybody's held beam on it
(`beamOn`, the Bleeder's rule). Watched, it does not move at all; the moment
it is next watched after moving it takes a NEW pose (never the same twice) and
creaks. **Unwatched** it closes on the nearest body it can reach at
`TEMP_SPEED` (3.4 cells/s) along `findPathIn`, refusing shafts and the lobby
(`tempShuns`). **THE BLINK** is `officeBlinkTick`: every zone dips
`TEMP_DIP_MS` (400) every 8-15s on the server's clock, broadcast to everyone on
the level as `blink`; the client drops the room's light for the player's own
zone and plays the tick. **Touch** (`TEMP_KILL` 0.6) kills as "the temp"; it
stands over the body `TEMP_STAND_MS` (8s), is gone `TEMP_GONE_MS` (15s), then
is somewhere else. A flyer is never watched and never hunted; admin **J** puts
it round the nearest corner (`summonTemp`). The client never glides it — its
position SNAPS to the server's, so nobody ever sees it slide — and plays the
scrape loop only while it is moving AND the listener is not looking at it.
Harness `test_temp.mjs`.

### No other hazards in round 1
The Station had three; the office has one, the Temp, and the light that
holds it. A second hazard can come later if playtesting says the level is
too easy — law 11's call, Josh's to make.

### Relics, drives and lore (law 1)
Ten office relics (a lanyard, a stapler, a desk photo, a voicemail tape…)
each with a description and a Dr. Voss line, kept outside `ALL_RELICS` until
the level ships (the Station's precedent); lore drives specific to this
level; Voss's dialogue for both.

### Assets
The prop kit already covers most of an office (desks, office chairs, a
computer desk, filing cabinets, pedestals, shelving, cupboards, a monitor and
keyboard, a water cooler, a whiteboard, plants, an opening office door, a
desk lamp, fluorescent battens, ceiling vents, Level 0's ceiling tiles).
**Still needed:** the Temp's mannequin, a keycard, a badge reader, a
photocopier, a vending machine (Sketchfab, credited), and CC0 surfaces for
carpet tile, office drywall and office linoleum. Plus whatever in
`assets/New Assets` belongs here (the intake law).

### THE SHIP GATE (CLAUDE.md), and the reference task
`test_placement` with Level 4 in `EDITABLE_LEVELS`; `test_progression`
walking the Station's shutter into The Lift Lobby, the card to the
Stairwell Door; `test_office.mjs` (the map); a behaviour harness for the
Temp with one assert per rule above (watched means stone, lit or not, the
cone and the range, unwatched faster than a sprint, the dip moves it, a held
beam holds it through a dip, touch kills, never into the lobby, never a
flyer); `test_flycam` with Level 4 listed and the operator view naming the
Temp, the card, the door and every relic and drive; the load test at 16
bodies; proximity voice and spectating checked on the level; and Josh walks
it in Test play. **Before any of it: 20 reference images of the canon's
Level 4** in `docs/backrooms/REFERENCES.md`, judged against the build.


## LEVEL 5 — TERROR HOTEL (Josh, 2026-10-12; building since 2026-10-13)

**Status: Josh's calls are in — "go with your recommendations" (2026-10-13):
A for every ▶ below (the register, the Deathmoths, the lifts, the heat), one
floor, ~130², the office's lattice. See "LEVEL 5, BUILT SO FAR" at the end of
this section for what is code.** The original round-1 text follows. Its
way in already exists: badging the office's keycard at THE STAIRWELL DOOR sets
`LEVEL5_FLAG`, and the door answers "not built" until this level does. The
canon agrees: *"an old stairway in Level 4"* is one of Level 5's entrances.
Nothing below is code yet. Josh's go-ahead, 2026-10-12: *"Whatever you
recommend let's continue."*

### What it is (the canon, and the 20 references)
An infinite 1930s hotel, unsettlingly CLEAN. Mahogany-red wallpaper with gold,
dark walnut and white marble floors, red-and-gold carpets, candle sconces and a
few buzzing electric lamps; bookshelves, sofas, old paintings. Three zones:
- **THE MAIN HALL** — corridors of room doors whose gold number placards follow
  no pattern; most rooms empty, a few furnished. Lifts that go to floors 1–12
  arrive elsewhere on THIS floor; 13 and above, nobody comes back from.
- **THE BEVERLY ROOM, "The Eternal Ballroom"** — a vast bare hub with a great
  many doors, a chandelier, and under it one small table holding drinks and an
  unfinished game of Mahjong that people feel compelled to leave alone.
- **THE BOILER ROOM** — cramped, hot, pipes and furnaces; almond water leaks
  from the pipes. The way to Level 6 (Lights Out) is deep inside it.
- **The air:** smooth jazz from nowhere, party chatter behind the walls,
  whispers from the furnaces, and the feeling of being watched (eyes in the
  paintings, a tap on the shoulder).
- **The threat the canon names first: DEATHMOTHS**, nesting in dark rooms and
  swarming into the halls.
- **The references** (REFERENCES.md → Level 5) measure (82, 57, 34) at
  luminance 62 — WARM AMBER, the warmest set yet, and a little brighter than
  the office. Dark red columns and gold trim, red patterned carpet with gold
  borders, coffered ceilings and chandeliers, palms round lamp-lit tables, long
  sconce-lit corridors of numbered doors, checkered marble halls.

### THE MAP — SECTOR H1 (proposed)
- **About the office's size, ~130×130**, built from hand-drawn rooms in the
  map editor like every level (a dialect `hotel-tiles.ts`, a library
  `hotel-rooms.json`, a generator `worldgen-hotel.ts`, one `levels.ts` entry,
  in `EDITABLE_LEVELS` from the first commit).
- **ONE FLOOR.** Stacked storeys were built and REMOVED in Oct 2026 as too
  buggy (Pipe Dreams once deferred "true stacked corridors" to this level —
  that note is overtaken). The canon solves it for us: its lifts' floors 1–12
  lead *"to another part of Level 5 on the same floor"*. So the hotel's height
  is felt through the LIFTS, not modelled.
- **Three zones out from the way in** (the Poolrooms' zone growth): the MAIN
  HALL nearest, the BEVERLY ROOM as the hub in the middle, the BOILER ROOM
  furthest, behind its own door.
- **The way in: THE SERVICE STAIR**, a stair landing at the map's edge — the
  office stairwell, arrived at. A SAFE room, its door marked in red on the wall
  (the doors law).
- **Room doors are SCENERY by default** (Pipe Dreams' rule): the corridors are
  lined with numbered doors on the walls; only some open into furnished suites.
  The hotel doors from the pack (opening, Oct 12) are already in the kit.

### ▶ 1. THE WAY DOWN
- **A — THE GUEST REGISTER (recommended).** A leather register lies open on
  the Mahjong table in the Beverly Room; it names ONE room number, drawn per
  map. That door, somewhere in the Main Hall, is unlocked; inside, on a hook,
  the BOILER KEY. The key opens THE RUSTY DOOR at the far end of the Boiler
  Room — the way to Lights Out. It reuses every rule the keys keep (carried out
  it goes home; a death leaves it on the body), so it is the Level 0/4 chain
  with one new thing in it: a CLUE to read and a door to find among hundreds.
- **B — THE FURNACES.** Light three dead furnaces in the Boiler Room to build
  the pressure that opens the rusty door. Pipe Dreams' fuses wearing a
  different coat.
- **C — THE MASTER KEYS.** Three brass room keys in three suites open the
  service lift. More searching, less idea.

### ▶ 2. THE CREATURE
- **A — THE DEATHMOTHS (recommended): the level where your LIGHT is the
  danger.** Every level so far rewards the torch — the Entity flees a held beam,
  the Temp freezes in it, the Bleeder runs from it. Here the swarm is DRAWN to
  it. Nests sit in dark suites; a swarm leaves its nest for the brightest torch
  within reach, flutters audibly before it is seen, and bites while it
  surrounds you (damage over time — about ten seconds in the swarm kills, so
  it is escapable, not instant). It loses you if your light goes OFF for a few
  seconds or a SHUT door comes between you. The Beverly Room is safe for the
  reason moths would give: the chandelier is the brightest light in the hotel,
  and a swarm that reaches it circles it and forgets you. Habits from four
  levels become the trap.
- **B — THE CONCIERGE (canon's Entity 18).** A figure in a hotel uniform who
  wants you to come to his office to talk; follows at a distance, waits at
  corners, and the moment you are alone in a room with him, the door shuts.
- **C — THE PAINTINGS.** Portraits whose eyes follow; one is not a painting.
  Better as the level's ATMOSPHERE than its creature (and it can be both).

### ▶ 3. THE LIFTS (recommended: yes)
Brass lift doors (the kit's hotel lift) in the Main Hall. Inside, a panel of
floors 1–12: each takes you to another lift on THIS map (fast travel between
distant halls — and a gamble on where). Floor 13 and up: the doors close and do
not open again. A death, written as the hotel's. Nobody is made to press it.

### ▶ 4. THE HEAT (recommended: yes)
Past the Boiler Room's door, the air gets hot: a heat gauge climbs while you
are deep inside and falls when you leave. Open furnaces burn if you stand at
them. ALMOND WATER cools you (the item already exists), and the pipes leak it —
the canon's own detail, now a mechanic.

### ▶ 5. THE SOUND (ElevenLabs, previewed by Josh as always)
A smooth-jazz loop that plays through the Main Hall from no source, party
chatter behind walls, the moths' flutter, furnace roar and whispers, the lift's
chime and cables. ElevenLabs can generate the jazz itself.

### ASSETS
Already here: the hotel doors (three opening, a lift pair) and eight hotel
surfaces (cream and white wallpaper, dark wood, red carpet, herringbone and
plank floors, checkered marble, white tile). Still to find (Sketchfab, a list
for Josh to approve before anything downloads): chandeliers, sconces, a
reception desk, sofas and armchairs, round tables, palms, a bed, wardrobe and
dresser, paintings, a Mahjong set, boilers and furnaces, the moth swarm. A
mahogany-red damask wallpaper (the canon's own wall) is the one surface the
set calls for that we don't have yet.

### RELICS
Ten, from Josh's pictures, like every level.

### LEVEL 5, BUILT SO FAR (2026-10-13)
- **THE MAP, SECTOR H1** (`worldgen-hotel.ts`, the dialect `hotel-tiles.ts`,
  the vocabulary `hotel-vocab.ts`, the library `scripts/hotel-library.mjs` →
  `hotel-rooms.json`): the office's lattice (8-cell modules, a doorway slot
  in every module side), 130², ONE door — The Service Stair on the rim. Three
  zones in `Sector.section`: the MAIN HALL, THE BEVERLY ROOM near the middle
  of it, and THE BOILER ROOM as the five module rows farthest from the way in,
  met by the Main Hall at exactly ONE doorway (the Boiler Room's door). 24
  rooms: corridors of numbered SCENERY doors (dark panel doors, each with its
  own brass number from a list no suite may use), suites (one doorway each, a
  key hook in each), lift halls, lounges, dining and reading rooms, linen
  closets (nests), the Beverly Room, furnace rooms, pipe tunnels, coal stores
  (nests), the rusty door's room. A suite's one door can be walled in by
  neighbours, so the planner keeps suites off the module in front of another
  suite or the Boiler Room's door, never cuts a doorway through a set piece,
  and RE-ROLLS deterministically (24 attempts, salted rolls) if anything is
  still cut off. Harness `test_hotel.mjs` (34).
- **THE GUEST REGISTER**: the plan draws one suite per map and stamps it, with
  every suite's number, door and room, on `Sector.hotel` (server only,
  outside the fingerprint). `readRegister` tells it ONLY to someone standing
  at the table; the welcome carries the suites' door plates but never the
  choice. **THE BOILER KEY** is Level 5's key (`keyHolder[5]`, every key
  rule) and streams ONLY to someone standing inside its room
  (`hotelKeyFor`): walking past suites finds nothing. **THE RUSTY DOOR**
  takes it: `LEVEL6_FLAG`, once, for everyone, then "not built".
- **THE LIFTS** (`rideLift`): floors 1-12 come out at another lift on this
  floor — the same one every time for a given car and floor (`liftDest`);
  13-20, the doors close: death, "the lift".
- **THE HEAT** (a session's `heat`, 0-100, sent to its owner alone as
  `{type:"heat"}`): below stairs it climbs 0.6/s at the Boiler Room's door
  rising to 1.8/s at the deepest cell (a BFS field from the line); in the
  Main Hall it falls 4/s; at 100 it costs 6 hp/s ("the heat"); an open
  furnace's mouth adds 25 heat and costs 12 hp a second ("a furnace");
  almond water drunk on Level 5 takes 45 off. **For law 11:** the rusty door
  is ~78 cells below the line, ~40 s of walking, so a player who knows the
  way arrives around half heat without water — exploring it blind is what
  costs you. Dials `BACKROOMS_HEAT_*`. Harness `test_hotel_heat.mjs` (14).
- **THE SHIP GATE**: `HOTEL_OPEN_FLAG` (`POST /api/admin/backrooms/open-hotel`,
  audited); members are held at the office's stairwell door until it is on.
  `test_placement` (100), `test_progression` (110) and `test_flycam` (79)
  carry Level 5; the map editor knows it (`EDITABLE_LEVELS`).
- **LORE**: twenty drives `H01`–`H20` with Voss's notes (`lore-hotel.ts`) —
  the register, the numbers, the lifts, the moths, the heat, the rusty door;
  no drive names a room number. Relics: none until Josh's pictures.
- **ASSETS, IN THE KIT** (Oct 13): 23 hotel props from the approved Sketchfab
  list, named and shelved in the map editor (Lighting → Chandeliers, Hotel →
  Front desk / Lobby / Games / Wall décor / Boiler room, Furniture → Plants /
  Heating): the crystal and deco chandeliers, the deco and candle sconces, a
  table lamp, the reception desk and back bar, a desk bell, a luggage trolley,
  the Mahjong set, a gilt picture frame, the boiler, a cast-iron furnace, a
  safety valve, a radiator, velvet and Chesterfield sofas, a velvet armchair,
  a marble side table, a palm, a deco bed, an antique wardrobe and a dressing
  table — plus two wallpapers (`mahogany-damask`, `dark-floral-wallpaper`)
  and a Deathmoth model (`assets/hotel/deathmoth.glb`, wings on their own
  nodes; the game draws the swarms as instanced wing cards for now — 182
  moths of the real model is 700k triangles). The library is DRESSED in them
  (props only — the fingerprint is unchanged).
- **THE DEATHMOTHS** (service.ts, `mothTick`): one swarm per nest
  (`HDECO.nest` — the linen closets, coal stores and dead suites), ASLEEP
  until a lit torch comes within 9 cells in line. Awake it goes for the
  BRIGHTEST light it can see — the nearest lit torch within 22 cells, in
  line; a body in the dark is furniture — at 2.4 cells/s (a walk is 1.6, a
  sprint 2.85), and round you it bites 10 hp a second ("the deathmoths",
  about ten seconds to kill). It loses you after 3 s with your torch off or
  with no line to you, then flies home at 1.4 and sleeps. A swarm that
  reaches THE BEVERLY ROOM circles the chandelier for 25 s and forgets
  everybody, then goes home. Never on the Service Stair, never after a
  flyer. An empty hotel puts every swarm back to sleep. Wire: `moths` (pos +
  mood) near, `mothsEv` (wake / circle / sleep) from 40 cells; the nests ride
  the welcome's hotel state; admin J → `/api/admin/backrooms/summon-moths`.
  **For law 11:** a sprint outruns a swarm, the torch-off escape costs about
  3 s of bites (~30 hp), and the Beverly Room is a sanctuary. Dials
  `BACKROOMS_MOTH_*`. Harness `test_moths.mjs` (19).
- **THE CLIENT** (Oct 13): `levelStyle "hotel"` in world.ts — every room
  type its own surfaces (`HOTEL_LOOK`: cream paper and red carpet in the
  corridors and suites, dark wood over herringbone or checkered marble in the
  public rooms, red brick, rusted plate and concrete below stairs), a drawn
  COFFERED plaster ceiling (one coffer a cell) above stairs and bare concrete
  below, warm light pooled under the fixtures — a CHANDELIER on every lamp
  cell (the crystal one in the Beverly Room), the caged bulkhead below stairs,
  a SCONCE on its wall, each a kit model by the fixture law, dead ones drawn
  dark — and the furnaces lighting the floor at their mouths.
  `hotel-scene.ts` draws the set pieces from the server's HotelState: the
  register (an open ledger laid on the nearest table once its chunk arrives —
  the register's cell is BESIDE the table, because the placement law refuses
  an objective under solid furniture), the lift doors, the rusty door (the
  station's steel door rusted, hinged so it swings when it opens), the
  furnaces with a glowing mouth, the nests, and the SWARMS — one instanced
  mesh of wing cards, clinging to the nest asleep, a flapping banked cloud
  awake. E reads the register (a card names the suite), opens a LIFT PANEL
  (type a floor, E to ride; walking off closes it), and tries the rusty door;
  a heat bar joins the HUD below stairs; admin J wakes the nearest swarm.
  `hotel-audio.ts` plays the flutter, the furnace roar, the boiler bed, the
  chatter behind the lounges' doors and the one-shots; the ambience bed is the
  band. The hub carries Level 5 with its ship gate, the roster says "in the
  Terror Hotel", and the editor's Test play reaches it.
- **SOUNDS** (`gen-sounds.mjs hotel` / `moths`, 14 files in
  `client/public/assets/hotel/`): previewed and approved by Josh (Oct 13),
  committed.
- **THE TEN RELICS** (Oct 13, from Josh's pictures in
  `assets/relics/Terror Hotel/`, cut by `scripts/relic-art.mjs`): BitLine
  Drive, The Boiler Blueprint, The Bellboy's Tips, The Eight Ball, Claire's
  Crib (the fourth of Claire's, after the binky, the bottle and the bouncer),
  Grass Clibbings (spelt so on purpose — Voss reads the note: "Them good grass
  clibbings. I love Barb. Gobbles."), Bear's Biscuits (for Josh's dog, Bear),
  The Lift Board, Fallen Star and The Stormglass, each with a description and
  a Voss line. Like the station's and the office's they spawn and are carried
  but stay out of ALL_RELICS until the level opens. relic-art gained
  `erase` (paint out a watermark), `backdrop` (a fill that follows a graded
  studio backdrop) and `fringe` (the loose test, but only near the strict
  fill's background — the star's pale lobe touches its own white rim).
- **FOUND IN THE BROWSER, FIXED**: an admin who reloads mid-flight came back
  walking while the server still had them flying, so the moths could not see
  them (a resumed run now always lands); nests placed before their chunk
  streamed in hung above the ceiling (they are re-hung every frame).
- **STILL TO DO**: Josh walks it in Test play; then the ship gate opens.


## LEVEL 6 — LIGHTS OUT (Josh, 2026-10-14; designing)

**Status: Josh's calls are in (2026-10-14): A for the way down (THE
HANDWHEEL), A for the creature (it hunts by SOUND), the map as proposed
(~120², three zones). The creature's name is Josh's to give; the code
calls it THE LISTENER until he does.** Its way in already exists: turning
the Boiler Key in Level 5's RUSTY DOOR sets `LEVEL6_FLAG`, and the door
answers "not built" until this level is. The hotel's own note on the door
(drive H19) already promises it: *"stairs going down into dark … take
every battery you own."*

### What it is (the canon, and the 20 references)
Grey concrete in total darkness. The canon says light doesn't carry, that
wanderers feel metal and stone by touch, hear whispers, sometimes see eyes,
and that a staircase somewhere leads on to Level 7, Thalassophobia — the
ocean. The references (REFERENCES.md → Level 6) measure (14, 14, 14) at
luminance 14: a dead neutral grey, almost black, lit only by the player.
Rough concrete and cracked plaster, bare doorways, rubble floors, some
cinder block and brick, pipes on the walls, dead fluorescent tubes, a
little abandoned clutter, wet floors in the worst of it.

### THE DARK
- **No working light anywhere.** By the fixture law every lamp is a kit
  model (the caged bulkhead, the batten), and every one is DEAD — drawn
  dark, casting nothing. The level's base light is the lowest of any level.
- **The torch reaches about half as far here** (the beam's range and
  falloff, not its brightness at your feet), and **batteries drain 1.5×**.
  Spare batteries lie about the level as loot.
- **The spray can is the map.** It already exists; down here it is how you
  mark where you've been.

### THE WAY DOWN — THE HANDWHEEL (Josh's pick)
- The way to Level 7 is **THE SEA HATCH**: a watertight steel hatch in a
  wall of THE WET END, unmarked. **It is found by ear** — surf heard
  through the steel from about **30 cells**, positional, louder as you
  close in.
- Its wheel is missing. **THE HANDWHEEL** lies somewhere in the dark and
  is Level 6's key (`keyHolder[6]`, every key rule: carried out it goes
  home, a death leaves it on the body, looted off it, at the bottom of a
  shaft it goes home). Carried to the hatch and fitted, it opens
  `LEVEL7_FLAG` for everyone — which answers "not built" until Level 7 is.
- The wheel is placed far from the way in and not in the Wet End, so
  finding it and finding the hatch are two different searches.

### THE CREATURE — IT HUNTS BY SOUND (Josh's pick; THE LISTENER)
Every level so far has turned on the torch; the moths flipped it. This one
ignores it: **it is blind. Light means nothing to it. Noise is everything.**
- **What it hears** (cells, through walls at half range): a walk 3, a
  sprint 8, a crouch 0, splashing in water 6 (any step in the Wet End's
  water counts as splashing), a dropped item 6, and **PROXIMITY VOICE 10**
  — talking to your friends is what finds you. The voice cue is the
  client's own "I am speaking" (LiveKit's level), client-claimed like
  every other state here.
- **How it moves:** it wanders at 0.9 cells/s, goes to the last thing it
  heard at 1.2, and lunges at 3.0 over its last 3 cells only (a sprint is
  2.85, but a sprint is loud).
- **THE TOUCH, twice.** The first touch does NO damage: a whisper and a
  cold hand (a sound and a shudder on the victim's screen), and now it
  KNOWS where you are for 5 seconds — it follows you, not your noise.
  Get away or go silent and it loses you. **The second touch inside 20
  seconds kills** ("the listener" until it has its name). Never on the
  Stair; never after a flyer; an empty level puts it to sleep.
- **One per level**, two once eight or more bodies are down here.
- Admin J summons it to you, like every creature.

### THE MAP — SECTOR L1
- **About 120×120**, the office's 8-cell lattice, rooms drawn in the map
  editor (a dialect `lights-tiles.ts`, a library `lights-rooms.json` from
  `scripts/lights-library.mjs`, a generator `worldgen-lights.ts`, one
  `levels.ts` entry, in `EDITABLE_LEVELS` from the first commit).
- **ONE door in: THE STAIR**, the hotel's stairs come down, on the map's
  rim, marked in red. A SAFE room: the creature never enters it.
- **THE CORRIDORS** — most of the map: concrete halls, side rooms, dead
  ends, store rooms, pipe runs.
- **THE WET END** — the module rows farthest from the Stair: ankle-deep
  water over concrete, and the sea hatch in its far wall. The water makes
  every step a splash, so the last stretch is the loudest.

### SOUND (ElevenLabs, Josh previews every one)
Drips, a low room tone, the surf behind the hatch (loop), the creature's
breathing and its whisper, the touch, distant footsteps that aren't yours,
the wheel fitting and turning, the hatch opening.

### RELICS AND LORE
Ten relics from Josh's pictures (`assets/relics/Lights Out/`). Twenty
drives `L01`–`L20` with Voss's notes: the dark, the batteries, the
listening, the wheel and the hatch, the sea beyond; no drive says where
the wheel lies.

### THE SHIP GATE
`test_placement`, `test_progression` (the Handwheel to the hatch, end to
end), `test_lights.mjs` (the map), a behaviour harness for the creature
(one assert per line above), `test_flycam`, the load test at 16 bodies,
law 8's verdict against the 20 references, proximity voice and
spectating checked down here, the fairness run (law 11: a solo walker
reaches the hatch in at least two runs of three), and Josh's Test play.

### LEVEL 6, BUILT SO FAR (2026-10-14)
- **THE MAP, SECTOR L1** (`worldgen-lights.ts`, the dialect `lights-tiles.ts`,
  the vocabulary `lights-vocab.ts`, the library `scripts/lights-library.mjs`
  → `lights-rooms.json`, 24 rooms): the hotel's lattice, **114²** (14 modules
  and a one-cell rim — 120 left a four-cell dead border), ONE door — The
  Stair — on the rim. Two zones in `Sector.section`: THE CORRIDORS and THE
  WET END (the three module rows farthest from the way in, every floor cell
  of a flooded room ankle-deep — `lightsWet`). The sea hatch as far into the
  water as fits; the Handwheel chosen from every K spot the rooms drew, from
  the best 30% by (walk from the stair + 0.6 × walk from the hatch), so
  finding it and finding the hatch are two searches. Every fixture DEAD.
  **Its room types are its own names** (`darkhall`, `piperun` — not
  `corridor`/`pipeway`): the client keys ceilings and looks by type NAME
  across every level. Review picture: `scripts/render-lights.mjs`. Harness
  `test_lights.mjs` (28).
- **THE WAY DOWN**: the Handwheel is Level 6's key (`keyHolder[6]`, every key
  rule — home when carried out, on the body after a death, looted off it);
  it streams to whoever is within 14 cells. Fitted to THE SEA HATCH it sets
  `LEVEL7_FLAG` for everyone, then "not built". THE RUSTY DOOR now leads
  here: `LIGHTS_OPEN_FLAG` is the ship gate (`POST
  /api/admin/backrooms/open-lights`, audited), the admin always may.
  `test_progression` (129) walks it end to end.
- **THE DARK**: no light anywhere but yours. The torch reaches 10m here (20
  elsewhere), batteries drain 1.5×, and up to six spare batteries lie on the
  B spots as ordinary drops (one more every 4 minutes while fewer lie out).
  Fog closes at 21m over a near-black grey.
- **THE LISTENER** (service.ts, `listenerTick`; the name Josh kept): exactly
  the design above, with one fairness rule found by its harness — once it
  has LET YOU GO (silent through its listening) its wandering never touches
  you again inside the second-touch window (`spared`), or the walk "away"
  from you could route back through you. Arrives ≥22 cells off and out of
  line; none on an empty level, two at eight bodies. Admin J
  (`/api/admin/backrooms/summon-listener`). Harness `test_listener.mjs` (30).
- **THE CLIENT**: `levelStyle "lights"` (world.ts `LIGHTS_LOOK`, concrete
  throughout, the Wet End's water the Station's dead standing water),
  `lights-scene.ts` (the hatch — `assets/lights/seahatch.glb`, built by
  `scripts/assets/seahatch.mjs` from Digital Goblin's "Naval Ship Door/Hatch":
  the shut copy of the two in the download, 1.9m, a frame and a leaf hinged
  at its edge, ship-steel, a bare hub under the porthole, its name shown only
  within ~3 cells; the Listener — Mr.Prizz's "Nightmare Creature 1#",
  `assets/lights/listener/`, its own clips per server mode: walk to wander,
  crawl to search, Run to lunge, crouched idles to stand still and listen,
  attack_2 once for the touch),
  `lights-audio.ts` (every loop PANNED: the sea is the level's compass). The
  hub's rail and ship-gate lever, the roster ("in Lights Out"), the map
  editor (Level 6 in the picker, its kit, guide paragraph, colours).
- **LORE**: twenty drives `L01`–`L20` with Voss's notes (`lore-lights.ts`).
- **RELICS, ALL TEN** (`LIGHTS_RELICS`): The Open Platter, The Pelican Case,
  The Ember Core, The Thumb Drive and Claire's Blanket (Claire's fifth) from
  Josh's pictures; The Black Pill, The Pink Pill, The Conch Shell, The
  Cassette and The Last Match found online by Claude (CC0, rawpixel; Josh:
  "go online and find the pngs"). The pills are Josh's Matrix jokes — the
  black pill is hopelessness, the pink pill a silly willy princess — and are
  one capsule recoloured so they read as a pair. `relic-art.mjs` gained
  `pale: N` (a dark object on a darker checkerboard) and `soft: N` (a pale
  object on a faint board, cut on blurred brightness, biggest piece kept;
  with `fringe` for the band the blur leaves). `activeRelics` was missing
  Level 6's sites — found by test_relic_law, now run through Level 6.
- **THE ASSETS, APPROVED (Josh, 2026-10-14: "all of this is fine")**: the
  sounds; four Poly Haven concretes in the surface catalogue (poured and
  cracked walls, damaged and stained floors — the stained one under the Wet
  End's water); and the prop kit's new "Ruin · Rubble & debris" shelf (a
  broken wall slab and corner, two broken pillars and a stump, a concrete
  shard, a rubble pile thinned with gltfpack) plus a rusty shelving unit,
  placed in the Fallen Room, the Pillar Hall, the store rooms and the bare
  room. Theme "ruin" maps to Level 6 in the editor.
- **WAITING ON JOSH**: Test play.

## LEVEL 7 — THALASSOPHOBIA (Josh, 2026-10-14; built, behind its ship gate)

**Status: Josh's calls (2026-10-14: "1. A 2. A 3. Sure"): A for the way down
(THE DIVE — a diving helmet and a subway stair at the bottom of a sunken
square), A for the creature (THE THING BELOW — something enormous in deep
water), the map as proposed (~160², three zones).** Its way in already
existed: fitting the Handwheel to Lights Out's SEA HATCH sets `LEVEL7_FLAG`.
The hatch now leads here, behind its own ship gate.

### What it is
The canon's Level 7 is open ocean. Ours is a city drowned to its roofs under
fog: you climb up through the sea hatch into the top of a tower, and outside
there is water to the fog in every direction, roofs standing out of it, some
just under it, and past the city's edge no bottom at all.

### THE WATER (the Poolrooms' machinery, at sea)
- One sea, one surface (`WATER_LEVEL` 0). Streets are 6m deep (swim), the
  sunken square 24m, the Drop past the city's edge 55m. Roofs stand 0.5–6m
  out of the water; a "wading" roof is waist deep, a "sunk" roof 2–5m down.
- **Deep water is never a pit** (`isPitCell` is water-aware now — the floor
  under the sea is −110 steps, and a cell under water was being read as a
  lethal shaft). No other level had water over a floor that deep, so
  nothing else changed.
- **Ten seconds of breath** (`DROWN_MS`, as in the Poolrooms), then the
  water drains health at 10/s. A diver goes down at about 1 m/s.
- **A diver swims round a sunken roof, not through it** (controller.ts
  `bodyFloor`): under water, a drowned roof more than a metre above your
  feet is a wall to swim up and over.
- Under the surface the world goes green-black and the view closes in with
  depth — about ten metres at the bottom of the square.

### THE WAY DOWN — THE DIVE (Josh's pick)
- **THE DIVING HELMET** lies on one of the helmet spots the blocks drew (K,
  dry roofs only), chosen by the plan far from the tower AND from the
  square, so finding it and reaching the stair are two searches. It is
  Level 7's key (`keyHolder[7]`, every key rule: carried out it goes home, a
  death leaves it on the body, looted off it) — and **a body sunk in the
  Drop is a body down a shaft: the helmet goes home at once**, because no
  breath reaches 55m and back.
- **Worn, it is a minute of air** (`HELMET_BREATH_MS` 60s, on the server's
  drowning clock and the client's breath meter alike).
- **THE SUBWAY STAIR** is a tiled entrance on a wall at the bottom of the
  sunken square, 24m down, marked in red like every level's way on. On one
  breath you drown on the way (24s down against ~20s of breath and
  drowning); in the helmet the round trip is ~48s.
- **The server cannot see depth** — the wire is x, y and "head under the
  water" — so a body at the stair must have been under for at least the
  time the dive takes at the fastest anybody swims down (`subwayDiveMs`,
  1.6 m/s with margin). Nobody surfaces at the square and touches the stair.
- **The helmet is a tool, not a key**: opening the stair (`LEVEL8_FLAG`, for
  everyone) does not use it up — you still need it to swim back up — and it
  keeps lying on its roof for the next diver. The stair answers "not built"
  until there is a Level 8.

### THE CREATURE — THE THING BELOW (Josh's pick)
It is never seen whole. What you see is the water noticing you.
- **EXPOSURE, per swimmer, 0..1** (`deepTick` in service.ts): it climbs while
  you are in its water and falls when you are not. The Drop is its home: a
  swimmer there is risen on in **~25s**. The sunken square is deep enough to
  be noticed **slowly, ~80s** — one quiet helmet dive (48s) makes it with
  room to swim in and out; a second loiter does not. **The streets never
  fill on their own.**
- **SPLASHING calls it, anywhere in the water**: moving faster than 1.25
  cells/s — a sprinting swim (1.43) or a sprint through the shallows (1.57),
  never a normal swim (1.03) or a wade (1.13). A dive done splashing is
  risen on in ~24s.
- **Three warnings, in order, every time** — they ARE the rules on screen:
  at 35% a shadow the size of a street slides under you and on; at 70% it
  circles you; at 100% it RISES: 2.5 seconds of the water under you going
  dark. Still in the water when it arrives: dead, "the thing below". On a
  roof (or in the tower) when it arrives: it sinks away and your exposure
  falls back to 50%.
- **ROOFS ARE SAFE.** Out of the water exposure falls fast; nothing it does
  reaches dry floor. Only the swimmer it rose on dies. A flyer is never
  noticed. Admin J lets it rise on you (in the water only).
- Drawn on the surface (`ocean-scene.ts`), unlit, no lights added at event
  time: the shadow, the circling shape, the dark spreading under you, the
  sea erupting at a strike.

### THE MAP — SECTOR T1
- **162×162** (16 blocks of 10 and a one-cell rim), seed 20261015, built
  from 14 hand-drawn blocks (`ocean-tiles.ts` the dialect, `ocean-vocab.ts`
  the vocabulary, `scripts/ocean-library.mjs` → `ocean-rooms.json`,
  `worldgen-ocean.ts` the generator, `scripts/render-ocean.mjs` the review
  picture). In `EDITABLE_LEVELS` from the first commit.
- **THE TOWER** (the start block, 2×2 blocks, at the middle of one side just
  inside the Drop): the only walled, roofed room on the level, offices with
  lit bulkheads, ONE door — THE HATCH, up from Lights Out — and doorways
  straight out onto the water. Nothing hunts in it.
- **THE CITY**: roofs, wading roofs, sunk roofs and streets between, and
  buildings (solid) rising into the fog — 10 of them on T1.
- **THE SUNKEN SQUARE** (the goal block) as far from the tower as fits, the
  subway stair on the kiosk at its bottom (the kiosk itself stands out of
  the water as a landmark).
- **THE DROP**: the outer two rings of blocks, open deep water, the
  creature's home.
- **One sea**: no wall between two outdoor cells; the generator walls only
  the tower. Everything is reachable from the hatch (every roof climbable
  from a swim). No ceiling outdoors: the fog is the sky, forty metres up.

### SOUND (ElevenLabs, Josh previews every one)
The bed (open water lapping at concrete, wind high in empty windows, no
gulls), the thing below's hum while it circles (loop), it passing under,
it rising, the strike, the helmet going on, the subway gate opening —
`node scripts/gen-sounds.mjs ocean`, `assets/ocean/`, the preview reel in
`data/level7-sounds-reel.mp3`. **Not committed until Josh hears them.**

### LEVEL 7, BUILT SO FAR (2026-10-14)
- Server: boot T1 (fingerprint-verified, `OCEAN_UNFROZEN=1` the dev switch),
  the helmet, the stair, the breath, the creature, the sea hatch's travel,
  the way out by the hatch, the operator view (the helmet where it is, the
  stair, the thing below under whoever it noticed or asleep in the Drop),
  `OCEAN_OPEN_FLAG` the ship gate (`POST /api/admin/backrooms/open-ocean`,
  audited), Sterling's line for Level 8, Voss's research hints, the map
  editor's publish rules (`buildOcean`).
- Client: `levelStyle "ocean"` (`OCEAN_LOOK`, the grey day, the sea, no
  outdoor ceilings, the tower's bulkheads lit), `ocean-scene.ts`,
  `ocean-audio.ts`, the underwater fog, the helmet's breath, the diver's
  rule, the hub (rail, door, ship-gate lever), the roster ("in
  Thalassophobia"), the map editor (Level 7 in the picker, its kit, guide
  paragraph, colours). Seen in the browser: the tower, the city from above,
  the stair at the bottom of the square, the circling shape on the water.
- Lore: twenty drives `T01`–`T20` with Voss's notes (`lore-ocean.ts`).
- Harnesses: `test_ocean.mjs` (31, the map), `test_deep.mjs` (24, the
  creature), and placement, progression and flycam extended to Level 7.
- Relics (Josh: "get the relics your self and include a baby item for my
  daughter"): ten, CC0 cut-outs from rawpixel found by Claude
  (`assets/relics/Thalassophobia/sources.txt`) — the Subway Token, the
  Message in a Bottle, the Ship's Bell, the Diver's Watch, the Lifebuoy, the
  Storm Lantern, the Captain's Spyglass, the Red Scallop, the Brass Compass
  and **Claire's Bath Duck**, the sixth of Claire's things (binky, bottle,
  bouncer, crib, blanket, duck). relic-art.mjs gained `paleAbove` for the
  lantern, whose handle loop penned a sticker outline in.
- References: twenty and law 8's verdict in REFERENCES.md. The sky, fog,
  water and the murk below match; the tower floor became wood planks. The
  big gap — the references are a few clapboard houses, a lighthouse and a
  dock, ours a drowned concrete city — is Josh's call, not changed.
- **WAITING ON JOSH**: the sound preview, the asset list (a real diving
  helmet model; the subway entrance is drawn for now), the city-vs-town
  question above, and Test play.

## LEVEL 8 — THE CAVE SYSTEM (Josh, 2026-10-15; built, behind its ship gate)
Josh: "lets work on level 8" — then "1. A 2. A 3. A": the subway breach, the
climb, the Burrower.

### What it is
Down Level 7's subway stair, 24m under the drowned square, onto a
half-flooded subway platform with a dead train. Past the platforms the tunnel
has broken into caves. Three zones, in bands out from the way in:
- **THE STATION** — tile, platforms, the flooded track bed (rails under
  ankle-deep water), dead cars, ticket halls, and the breach where the
  tunnel wall gave way into rock.
- **THE CAVERNS** — big limestone chambers with stalagmites, terraced
  galleries (ledges you can drop off and not climb, always with a way round),
  the underground river, and chasms with a plank walk over a drop that kills.
  The survey team's work lamps light pools here.
- **THE DEEP** — narrow passages and crouch-only crawlspaces (the Burrower's
  ground), a few open hollows, a deep chasm, and at its far end the Chimney.

### THE WAY ON — THE CLIMB (Josh's pick)
**THE CLIMBING ROPE** lies on one of the rope spots the Caverns draw, chosen
by the plan, deep in the Caverns. It is Level 8's key with every rule the key
keeps (keyHolder[8]): carried out it goes home, a death leaves it on the
body, it can be looted. **It is too heavy to run with** (no sprint while
carrying it — the client's controller). **THE CHIMNEY**, at the far end of
the Deep, takes it: fixed at the Chimney's foot (a piton and a carabiner) it
opens the climb, `LEVEL9_FLAG`, once, for everyone, and stays there. At the
top: a manhole and a pale streetlight — Level 9, The Suburbs, not built yet,
so the climb answers `not_built`.

### THE CREATURE — THE BURROWER (Josh's pick)
Long, pale, eyeless. **It lives only in the narrow passages and the
crawlspaces** (`BURROW_TYPES`) and never sets foot anywhere else, so
**getting out into the open is safety**.
- It **hears**, it doesn't see: crawling through a crawlspace is heard (5
  cells), a walk in a passage (6), a sprint (10), a voice (9), a dropped item
  (5); a crouched creep in a passage barely (2); standing still, nothing. Rock
  between halves a range. A body in the open makes no noise it follows.
- **Hunting**, it goes where it last heard you: 1.5 cells/s in a crawlspace
  (a crawl is ~1.0) and 2.45 in a passage (a walk is 2.05, a sprint 2.85 —
  and you can't sprint with the rope).
- It **bites only somebody it has just heard** (inside 2s). **THE FIRST BITE
  HURTS, THE SECOND KILLS** (Josh, Oct 16 2026: "i feel like the creature
  should damage you then kill you"): a bite takes `BURROW_BITE_HP` (55), it
  pulls back half a cell and holds still a breath (`BURROW_RECOIL`, 0.9s;
  bites at least `BURROW_BITE_MS`, 1.4s, apart), and the next bite in the
  same hunt kills. The breath between is the chance to get out into the
  open. The client says so ("the next one kills — GET OUT INTO THE OPEN")
  and the body lunges and snaps on every bite. **Still and
  silent loses it**: reaching somebody who has gone quiet it lingers, forgets
  them, leaves, and spares them 20s.
- It **clicks in the rock** — the warning. The client plays the clicking from
  its frames: slow while it roams, fast and hard while it hunts.
- One per five bodies (at most three). It surfaces far off and out of every
  line; with nobody near its stretch of passage it burrows on through the
  rock to another. Never after a flyer; an empty level puts it back in the
  rock. Admin J sends it at you, only inside its ground.
- **ITS LOOK** (Josh, Oct 16 2026: the first cut "looks like a grub"): a
  long, pale, eyeless cave centipede — eighteen armoured segments laid along
  its own trail, two rows of long jointed legs rippling in a wave, sickle
  fangs that work while it hunts and snap on a bite, feelers sweeping the
  floor ahead, two trailing tail spines. Hunting, its front end rears up off
  the floor. Drawn from primitives in `cave-scene.ts`, every repeated part
  INSTANCED (a handful of draws a body), until a real model is approved
  (scripts/assets/level8.json).

### THE MAP — SECTOR C2
`worldgen-cave.ts` on Lights Out's lattice (8-cell modules, 2-wide slots on
floor 0), 162² (20 modules). **SECTOR C2 since Oct 16 2026** (C1 was the
first cut).

**THE STATION IS PLANNED IN ROWS** (Josh, Oct 16 2026: "the first part is
very disorganized looking with prop placement not making much sense"). The
first cut laid a bending track and then packed the band with random rooms —
platforms with their own stubs of track facing any way, ticket halls over
tunnel. Now (`stationRows`, `stationReach`, `LINE_ROW`, `STATION_HALF`,
`TRAIN_HALF`): row 1 the stair and the ticket halls · row 2 the tiled
passages down to the platforms · row 3 THE LINE, one straight row edge to
edge — the station proper five modules long centred on the stair (two
raised platforms, half a metre up, either side of the flooded track, a step
down at each doorway) with the dead train standing at the middle three, and
plain tunnel beyond (signal cabinets, a stray car, staff doors) · row 4 the
far side: staff, plant and store rooms and the breaches into the caves. The
halls and passages stay within three modules of the stair and the staff
rooms within six; beyond them the tunnel runs through solid rock. Every
room is furnished as that room would be: benches against the platform's
back wall facing the track, the yellow line along every edge, MIND THE GAP
at the edge, the turnstile line across the hall with its walkways lined up
on the doors, the booth against a wall under its sign, lockers and cabinets
against walls facing out, signs on walls pointing the way to the platforms,
doorway cells always clear. 35 rooms in `cave-rooms.json`
(`scripts/cave-library.mjs`, dialect `cave-tiles.ts`, vocabulary
`cave-vocab.ts`). Two things are new: **THE LINES** — the subway track across
the Station and the river across the Caverns are each laid as one unbroken
run of rooms from one side of the map to the other, with no wall where two of
them meet (the SEAMS), and track and river rooms go nowhere else; and
**crawlspaces** — a room type whose ceiling (1.25m) is lower than a standing
body, so the controller won't let you in standing (`lowAt`, `mods.tall`) and
keeps you crouched inside. THE GAUNTLET (`test_cave`): there is no way to the
Chimney that doesn't go through the Burrower's passages.

### SOUND (ElevenLabs, Josh previews every one)
The bed (drips into pools in a vast cave, a far river), the river (a loop by
its nearest water), the clicking (slow and fast loops), the strike, the rope
taken, the rope fixed — `node scripts/gen-sounds.mjs cave`, `assets/cave/`,
the preview reel in `data/level8-sounds-reel.mp3`. **Not committed until Josh
hears them.**

### LEVEL 8, BUILT SO FAR (2026-10-15)
- Server: boot C1 (fingerprint-verified, `CAVE_UNFROZEN=1` the dev switch),
  the rope, the Chimney, the Burrower, the subway stair's travel down from
  Level 7, the way out by the stair, the operator view (the rope where it
  is, the Chimney, every Burrower), `CAVE_OPEN_FLAG` the ship gate
  (`POST /api/admin/backrooms/open-cave`, audited), Sterling's line for
  Level 9, Voss's research hints, the map editor's publish rules
  (`buildCave`).
- Client: `levelStyle "cave"` (`CAVE_LOOK`: subway tile, limestone, damp
  rock, gravel, the riverbed — four new CC0 Poly Haven surfaces), the lamps
  (work lamps lit, battens dead, platform lamps flickering), the water,
  `cave-scene.ts`, `cave-audio.ts`, the crawlspace crouch, no sprint with
  the rope, the hub (rail, door, ship-gate lever), the roster, the map
  editor (Level 8 in the picker, its kit, guide paragraph, colours).
- Lore: twenty drives `C01`–`C20` with Voss's notes (`lore-cave.ts`).
- Relics: ten, CC0 cut-outs from rawpixel found by Claude
  (`assets/relics/Cave System/sources.txt`) — the Toy Subway Car, the Last
  Ticket, the Conductor's Whistle, the Fossil Fish, the Geologist's Hammer,
  the Candlestick, the Surveyor's Watch, the Blue Crystals, the Lump of Ore
  and **Claire's Night Light**, the seventh of Claire's things.
- Harnesses: `test_cave.mjs` (the map), `test_burrower.mjs` (the creature),
  and placement, progression, flycam, relic law and the load test extended to
  Level 8.
- References: twenty and law 8's verdict in REFERENCES.md; the build follows
  it (warm near-black, cream tile in the Station, a dark river, a pale cold
  streetlight down the Chimney).
- **WAITING ON JOSH**: the sound preview, the asset list
  (`docs/backrooms/level8-assets.md` — a subway car, rocks, a rope coil, a
  rope bridge, a model for the Burrower; shapes stand in for now), the three
  reference questions (how dark, which subway, the river's colour), and Test
  play.

## LEVEL 9 — THE SUBURBS (Josh, 2026-10-30; building, behind its ship gate)
Josh: "I would like for you to work on the last backrooms map" — then "Go with
your picks": the front door, the Neighborhood Watch, a street grid. **The last
of the ten.** Pandora's Rusted Key has always counted to this level.

### What it is
Up the Chimney from the Cave System, out of a manhole into a cul-de-sac under
one working streetlight. An endless-feeling neighbourhood at night: streets in
a grid, house lots between them, lawns, fences, a park. Most of the
streetlights are dead. Every house is unlocked and empty, the same few plans
again and again. It is very quiet. Something walks the streets.

### THE WAY OUT — THE FRONT DOOR (Josh's pick)
**THE HOUSE KEY** lies inside one of the houses, on one of the key spots the
house plans draw, chosen by the plan from the far share of them. It is Level
9's key with every rule the key keeps (keyHolder[9]): carried out it goes home,
a death leaves it on the body, it can be looted. **THE FRONT DOOR** is the
door of **Number 9**, the last house on the street, as far from the manhole as
the map allows, its porch lit. Turned in the lock the key opens it,
`LEVEL10_FLAG`, once, for everyone, and the door stays open. **Walking through
it is the end of the descent**: the run ends as an exit through the way in
does — everything carried banked — and the debrief says you got out.

### THE CREATURE — THE NEIGHBORHOOD WATCH (Josh's pick)
Tall, too thin, a beige windbreaker, a smile and nothing else on its face.
It walks the streets at night. **It never sets foot indoors, in the manhole's
cul-de-sac, or in the light.**
- It **patrols** the dark streets, sidewalks, yards and the park at a walk
  (1.0 cells/s). **It whistles while it walks** — a slow tune, the warning,
  heard a long way off — and its steps ring on the asphalt.
- It **sees**: a body outdoors in its line of sight within 16 cells and it
  **hunts** at 2.45 cells/s — faster than a walk (2.05), slower than a sprint
  (2.85). Touch is death, as "the neighborhood watch".
- **THE LIGHT IS SAFETY.** A lit streetlight (and Number 9's porch light)
  throws a pool `LIGHT_R` (2.6) cells across. A body in a pool is seen but
  out of reach: the Watch stops at the edge of the light and stands there,
  watching, up to 20s, then walks away and leaves that player be for 15s. **A
  flickering light is no light.**
- **THE HOUSES ARE WHERE YOU HIDE — but it knocks.** Go indoors while it hunts
  you and it walks to the doorway nearest you, knocks three times, and reaches
  in: anybody within 1.6 cells of it is taken. Further in, you are safe; it
  waits at the door for 15s, knocking now and then, and takes you if you step
  back out into the dark. Then it gives up and leaves you be for 15s.
  **Don't stand by the door.**
- Out of sight 5s, it goes to where it last saw you, looks about, and gives up.
- One per six bodies (at most two). It arrives far off and out of every line
  of sight; with nobody about, it isn't there. Never after a flyer. Admin J
  sends it at you (outdoors, in the dark).

### THE MAP — SECTOR U1
`worldgen-suburb.ts` on Lights Out's lattice (8-cell modules, 2-wide slots on
floor 0), 162² (20 modules). **THE STREET GRID is laid, not packed**: streets
along the rim at module depths `STREET_ROWS` 2 · 7 · 12 · 17, the whole width,
and cross streets at alongs `STREET_COLS` 3 · 9 · 15 from the first street to
the last; the middle one runs on out to the manhole's cul-de-sac on the rim.
Each street module is a road with a sidewalk either side; at every module the
planner picks the street piece (straight, tee, crossing) whose road runs out of
exactly the sides that have street next door, and there is no wall between two
street pieces (the SEAMS — the Cave System's lines, as a grid). **THE LOTS** —
houses, garages, yards, the park — pack the blocks between the streets, and
every lot that touches a street opens onto it; fences between neighbours open
now and then. **Number 9** stands on the far side of the last street, as far
from the manhole as fits. Houses are thin-walled (the walls layer), with a
front door and a back door.
Outdoors there is no ceiling: the night sky.

### SOUND (ElevenLabs, Josh previews every one)
The bed (a still suburban night: crickets, a far dog, a distant highway), the
whistle (a slow tune, close and far), its steps on asphalt, the knock, the
key taken, the lock turning, and the front door opening. **Not committed until
Josh hears them.**

### RELICS AND LORE
Twenty drives `U01`–`U20` with Voss's notes (`lore-suburb.ts`), the suburbs'
own story. Ten relics including **Claire's Rattle**, the eighth of Claire's
things; their names, descriptions and Voss lines are written, **their pictures
wait on Josh** (the level's relics stay out of `ALL_RELICS` until they have
art, as the Station's did).

### THE SHIP GATE
`SUBURBS_OPEN_FLAG` (Admin → the hub's lever, audited), like every level since
the Station: members wait for it; the admin walks in any time.

The gate's harnesses, all green: `test_suburbs.mjs` (the map, 40), `test_watch.mjs`
(the Watch, one assert per behaviour above, 39 — clocked: rerun alone before
believing a failure), and Level 9 in `test_placement`, `test_progression` (the
House Key carried, dropped, looted and turned; out through the front door),
`test_flycam` and `load_backrooms`. Still to come before it opens: the relic
art (`SUBURB_RELICS_LIVE` is empty, so no relics spawn), the sounds (Josh
previews them), and Josh's Test play.

### THE CLIENT
`setLevelStyle("suburb")` (world.ts). **Outdoors there is no ceiling**, so the
wall rule changes: `subEdge` decides what stands on every edge — between two
lawns a **picket fence** (1.15m), round the map a **privacy fence** (2.4m), round
a house its **siding** up to the eave (two skins: siding outside, the room's
paper inside, five siding colours by house), and inside a house the ordinary
wall to the ceiling. A doorway in a house's outer wall gets a lintel, never a
fascia to the sky. **Every house gets a hip roof** (`buildSuburbRoofs`: each
corner rises by its distance in from the house's edge, so a rectangle gets a
ridge and a square a point); Number 9's sealed block gets one too.
`SUBURB_CEILINGS` gives the open air 40m only so the controller never reads a
street as a crawlspace (Thalassophobia's rule) — nothing is drawn there.
**Streetlights** are a drawn steel pole and arm carrying the kit's caged
bulkhead (the fixture law); **porch lights** the same bulkhead on a house's
front wall. A lit one throws a pool in the baked light field, and **outdoors
that light passes over the fences** (only a sample inside a house is shut
away from it by the walls) — the first cut stopped every pool at the first
picket and the streetlight lit one cell. The night: navy fog, a low moon
(one directional light, the level's own), the ground lawn/asphalt/pavement by
lot type. `suburb-scene.ts` draws Number 9's front door (the kit's wooden door,
painted red, a warm hall behind it once open), THE HOUSE KEY (a brass key on a
tag that says 9) and the Watch (primitives — long legs, a windbreaker, a
painted smile — limbs swinging with its own stride, arms up when it hunts, a
knock that raps three times) until a model is approved. `suburb-audio.ts` is
the Cave System's shape: the whistle, its steps (quick while it hunts), the
knock, the take, the key, the lock and the door — **all quiet until Josh has
heard the files**. Once open, the front door joins `exitDoors` (law 5: one
exit rule) and walking through it ends the run with Voss's "you found a door
that goes out" debrief. Trees in the room designs are a trunk and a crown of
three overlapping blobs (one sphere read as a lollipop at night).
