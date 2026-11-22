# SOLACE SURVIVORZ: the effects plan

Josh, 2026-10-22: *"i have another agent working on the animations, would it
be possible to work on the special effects portion of this. maybe make a
plan."* This expands ASSETS.md §2g into a plan. The bar is the show's own
(SURVIVORZ.md §3): full-quality effects for every action, never a stand-in.

## 1. What the show needs

| Group | Effects |
|---|---|
| **Guns** | a muzzle flash per gun (pistol, shotgun, rifle) with a burst of light; a smoke wisp; spent casings and shells that bounce and settle; a hit puff per surface (concrete dust, metal sparks, wood splinters, glass, flesh) |
| **Blood** | a spray on a hit, aimed along the shot; a spurt on a melee hit; splatter on nearby walls and floor; a pool that grows under a body; a trail when someone is dragged or crawls; drips from a wound; bloody footprints. Zombie blood is darker and thicker. |
| **Fire and explosives** | the molotov: the bottle breaks, a fireball, burning floor that lasts a while, zombies that catch fire, a smoke column, a scorch mark. The pipe bomb: a flash and burst of light, a shockwave of dust, debris, a scorch mark, dust falling from the ceiling, and a camera shake on the broadcast cameras. |
| **The facility** | dust floating in the light under fixtures and in flashlight beams; steam from pipes; drips with ripples in puddles; sparking broken wiring; flickering lights; red lockdown strobes; the power coming back bank by bank; fog in the tunnels; bubbles in the specimen tanks |
| **The survivors** | the grime layer (dirt, sweat, dried blood building up over days); wound marks on skin; infection you can see (pallor, dark veins, a sweat sheen); breath fog in the freezer |
| **Things breaking** | splinters off a barricade being hit, planks giving way, a door shaking and shedding dust as it's battered, glass shattering |

About 40 effects in all.

## 2. Rules every effect follows

These come from bugs the casino and the Backrooms already hit; they are not
preferences.

- **The number of lights never changes mid-show.** Effect lights come from a
  fixed pool built at load: 2 for muzzles, 2 for fire, 1 for explosions,
  1 spare. An effect borrows a light and gives it back. (Adding a light
  rebuilt every shader in the casino and froze it for a third of a second.)
- **Every effect is warmed up at load.** One hidden copy of each fires off
  screen before the show starts, so the first real molotov isn't a freeze.
- **Materials are shared and never thrown away**, and nothing uses the
  two-pass transparency path that leaked memory every frame in the casino.
- **Hard caps on everything**: 4,000 particles alive at once across all
  effects, drawn in at most 8 draw calls; 400 decals (splatter, scorch,
  footprints), oldest replaced first; a pool and a scorch mark last as long
  as the body or the burn, not forever.
- **One appearance, every observer.** An effect is drawn from the server's
  event (the shot, its direction, what it hit, a random seed), so the Watch
  page and the YouTube stream show the identical spray.
- **The budget** (inside ASSETS.md's 4 GB / 800 draws): effects get at most
  60 draws and 1.5 ms of GPU time in the worst moment (a firefight with a
  fire burning), and about 150 MB of memory. The stream soak ran at 10–17%
  GPU, so there's room; the stress test (SURVIVORZ.md §13) proves it.

## 3. How they're made

- **Fire, smoke, steam and explosions: rendered by us in Blender**
  (installed, 5.2), as flipbook sheets: a few seconds of real simulated
  smoke or flame filmed frame by frame into one texture, played back on a
  card that always faces the camera, with soft edges where it meets walls
  and floors. Ours, so no licence question, and the quality bar is ours to
  hit. About 8 sheets.
- **Sparks, droplets, dust motes, debris, casings: made in code** as
  particles with gravity, bounce and fade — they're small and fast, and code
  gives the variety for free.
- **Decals (splatter, pools, scorch, footprints, cracks): photographed
  textures** from ambientCG and Poly Haven (CC0, already in our free-asset
  pipeline), laid onto walls and floors with full colour, normal and
  roughness, so wet blood shines and dry blood doesn't.
- **Light beams**: soft cones with drifting noise and dust motes inside,
  under every fixture that has one and from every lit flashlight.
- **Things on the body** (grime, wounds, infection): a layer in the skin's
  own shader, driven by numbers the server already tracks (days survived,
  fights, infection). Nothing is swapped; it builds up.

What already exists gets raised to this bar rather than rebuilt from nothing:
the Backrooms blood (sprays, smears, pools under bodies), the casino gore
spray, the casino pistol's muzzle flash and its shared light, and the
flickering fixtures.

**What's in hand** (Josh downloaded them to `D:\solace-ai\Special Effects`,
9.7 GB, all 30 archives tested clean 2026-10-22):
- **Unity Labs (CC0), 23 TGA frame sequences**: Explosion00/01 (+ light,
  no-fire variants)/02/02HD, FireBall01-03, Flame02, Flame03 (+ hollow),
  SmallFlame01 (two sizes), WispySmoke02/03/03b, CandleSmoke01, Cloud01-04.
  Frames are modest (Flame02 256x440, Explosion02HD 800x800): good at middle
  distance, the JangaFX renders are the close-up pieces.
- **JangaFX (CC0), 5 simulations**: Gasoline Explosion (the molotov), Grenade
  Dust Impact and Dust Shockwave (the pipe bomb), Small Campfire and Fire_01
  (burning floor). Rendered to flipbooks in Blender.
- **ActionVFX free blood (commercial use)**: 40 photographs at 2.5K: 27 pools,
  8 sprays, 3 handprints, 2 footprints. Colour and alpha only; the wet shine
  needs a normal and roughness made from them (or the StillMount packs).
- **Free Surface Decals (Taproot)**: bullet hole, concrete crack, scorch,
  leak stain, paint splatter at 1K with normal and roughness. The README says
  they're procedurally generated, so they're placeholders until judged.
- **Not bought yet**: the StillMount blood decal packs (~$12–20).

## 4. How Josh reviews them

The same way as sounds and animations, from his phone:

- **The effects bench** (`scripts/survivorz/fx-bench.html`): a grey room with
  a half-metre grid and the show's lighting, where each effect fires on
  cue — on a survivor body with the real gun where it belongs. It records
  each one as a short video, with its cost (draws, GPU time, memory) printed
  under it.
- **A review page** (an artifact, like the animation pages): each video with
  keep / needs work and a note.
- When the Vault Lobby look test exists, every approved effect is also shown
  in that room before it's called done.

## 5. Working beside the animation agent

The animation work owns `scripts/survivorz/anim-*`, the recipes, the gun
fitting and the packed clips. The effects work only READS from them (the
muzzle and hand points in `guns.json` / `cal.json`, the bodies) and keeps to
its own files: `client/src/survivorz/fx/` for the effects themselves and
`scripts/survivorz/fx-*` for the bench and the flipbook renders. Nothing in
the animation folders is edited.

**The Vault Lobby look test** (if the second helper session takes it) keeps to
`scripts/survivorz/room-*`, `assets/downloads/survivorz/rooms/` and
`client/src/survivorz/room/**`. The one hand-off is
`docs/survivorz/vault-lobby-anchors.json`: the room's fixtures, pipes, vents,
puddles and panels (position, facing, type), which the effects read to place
beams, steam, drips and sparks. The room never wires effects in itself, keeps
its own light count fixed, and leaves the effects their 6 pooled lights and
60 draws.

**Where the files are served from** (built by the other session, admin-only):
`GET /api/survivorz/fx/<path>` (up to three folders deep) serves
`assets/downloads/survivorz/fx/` (.png .webp .ktx2 .glb .exr, private,
no-cache + ETag). In code, `fxUrl("blood/decals/splat-01.webp")` from
`client/src/survivorz/assets.ts`; models through its `loadGlb`, textures
through its `loadTexture` (the route needs the session header, which three's
TextureLoader can't send). Effects never add a route of their own.
`loadTexture(url, { space: "srgb" | "linear", flipY? })`: `space` is required
(srgb for colour and decals, linear for normals, roughness and flipbook data);
flipY defaults to true, matching three's TextureLoader. PNG/WebP/JPEG only;
.ktx2 and .exr go through KTX2Loader/EXRLoader with
`setRequestHeader(sessionHeaders())`. **Disposing a texture also calls
`(tex.image as ImageBitmap).close()`**, or the bitmap leaks. A failed fetch
throws `AssetError(status, "texture_failed")`.

## 6. Order of work

| Step | What | Gate |
|---|---|---|
| **F0. The engine** | the particle system, flipbook player, decal layer, light pool, warm-up, cost meter; the bench and the review page | Josh sees the bench working |
| **F1. Guns** | muzzle flashes, smoke, casings, hit puffs per surface | Josh approves |
| **F2. Blood** | sprays, spurts, splatter, pools, trails, drips, footprints | Josh approves |
| **F3. Fire and explosives** | the molotov and the pipe bomb, start to finish | Josh approves |
| **F4. The facility** | beams, steam, drips, sparks, flicker, lockdown, power coming back, fog, tanks | Josh approves |
| **F5. The survivors** | grime, wounds, infection, breath | Josh approves |
| **F6. Things breaking** | barricades, doors, glass | Josh approves |
| **F7. Into the facility** | each effect placed and checked in the real rooms as they're built; cost measured in the busiest room | part of the stress test |

F1 to F6 can go in any order after F0; guns and blood first because every
fight needs them.

### F0, built 2026-10-22 (uncommitted, like the rest of Survivorz)

- **The engine**, `client/src/survivorz/fx/`: `particles.ts` (one instanced
  draw per sheet; facing or velocity-stretched cards; frames blended; one
  premultiplied blend for smoke and fire; hidden, never removed, when idle),
  `sprites.ts` (the procedural sheet: dot, spark, drop, mote, chip, star,
  puff, shard, mist), `decals.ts` (fixed slots in one buffer per set, oldest
  out), `lights.ts` (the pool of six), `system.ts` (budget, warm-up, emitters,
  surface hits, the shake), `effects.ts` (sparks, smoke puff, explosion,
  fire, blood hit), `standin.ts` (a code-drawn blood atlas — deleted in F2,
  the blood hit moved to `blood.ts`).
- **The sheets**, `scripts/survivorz/fx-flipbook.mjs`: 13 Unity Labs sequences
  to 8x8 premultiplied PNGs in `fx/flipbooks/` (PNG because lossless WebP
  invents colour under transparent pixels; premultiplied in the script
  because ffmpeg's filter did nothing; area scaling because lanczos
  overshoots). All 13 verified: no pixel brighter than its own coverage.
- **The bench**, `scripts/survivorz/fx-bench.html` + `fx-bench.mjs`: bundles
  the shipped engine, records each scenario on a fixed clock to
  `fx/review/<name>.mp4`, then times its busiest frame on the 3090 Ti with
  and without the effects. Measured: at most 0.44 ms, 6 draws, 71 particles.
- **The checks**, `scripts/survivorz/fx-check.mjs`: 26 asserts at F0 (the budget
  holds, the same seed makes the identical blast and shake, the light count
  never changes, a fire keeps its light through a burst of flashes, decals
  recycle oldest-first without growing, warm-up restores visibility). Proven
  to fail: with the seed swapped for Math.random, the two determinism checks
  go red.
- **The review page**: https://claude.ai/artifact/8eRTYTwGQPQUnoP7JAs4wT
  (flags in its database, collection `fx`, document `review`).
- **Memory, fixed the same day.** Uncompressed, all 13 sheets were 424 MB
  against the 150 MB budget. Josh okayed the Khronos KTX tools (v4.4.2,
  unpacked rather than installed, at `D:/solace-ai/tools/ktx`; the baker
  finds them there or at `KTX_BIN`). Every sheet is now also written as
  KTX2/UASTC with baked mips, which the browser turns into BC7 at one byte a
  pixel: **112 MB with all 13 loaded**, looking the same as the PNGs. A KTX2
  can't be flipped on upload, so its first row sits at v=0, and a layer is
  told which (`topDown`). The engine takes the compressed copy when the
  loader offers `compressed()`, and falls back to the PNG otherwise.

### F1, built 2026-10-22 (awaiting Josh's flags on the review page)

- **The guns' own table**, `fx/guns.ts`: per gun the muzzle (a COPY of
  `props/guns/guns.json`, which the animation work owns; `fx-check` fails if
  they drift), the ejection port and its throw, the casing kind, the flash's
  sizes, life and light, the smoke. The ports were MEASURED: an orthographic
  render of each GLB from its right side and from above at 2 px/mm with a 1 cm
  grid (`fx/bench/gunmeasure.html`). Gun frame: +z out of the muzzle, +y up,
  the shooter's right is −x.
- **The recipes**, `fx/gunfx.ts` (re-exported with F0's through
  `fx/recipes.ts`): `muzzleFlash` (a side-on jet card stretched along the
  barrel, which shortens by itself as the camera looks down it; an end-on
  petal; a flash hider's tongues; a fireball throat on the shotgun; powder
  sparks; a muzzle light from the pool), `ejectCasing`, `gunShot` (flash +
  smoke + a lingering barrel wisp + the brass, except the pump gun, whose
  shell comes out on the PUMP: the animation calls `ejectCasing` then), and
  `bulletImpact` per surface (concrete dust and grit, metal sparks, wood
  splinters, glass shards both ways, flesh = the blood hit) with a hole.
  Callers pass the gun model's `matrixWorld`; every observer has the same one.
- **The brass**, `fx/casings.ts`: real lathe geometry at real size (9×19,
  5.56×45, 12-gauge with a red hull), one InstancedMesh per kind sharing one
  material, 128 slots a kind with the oldest case handing its slot on. A
  tumble, bounces off the floor and registered surfaces, then a settle that
  lays it on its side (sometimes standing, for the pistol case and the shell)
  and lets it roll. Cases rest 120 s, then sink away. `onBounce` is the hook
  for the tinkle. Landing measured on the bench: rifle brass 1.6–2.4 m right
  and a little behind the shooter, pistol 1–1.6 m, shells about 1 m.
- **Holes**, `fx/holes.ts`: a code-drawn 2×2 atlas (concrete, metal, wood,
  glass) for a `holes` decal set. Photographs can replace a cell later
  without touching the recipes.
- **Smoke takes the room's light now**: `fx.setAmbient(colour)` sets what lights
  the covering part of every card; the show sets it per zone. F0's smoke reads
  darker on the bench for it, which is right for a dim facility.
- **The sprite sheet** gained three cells: jet, petal, splinter.
- **Bench**: scenarios pistol, rifle, shotgun, brass (a floor-level close-up)
  and hits. Worst measured: 0.37 ms, 8 draws, 162 particles, 117 MB.
  `fx-check` is 41 asserts (muzzles match guns.json, the same shots and seeds
  leave the same brass in the same places, every case rests ON the floor, the
  shotgun shot throws no shell and its pump does, 300 cases fill the slots
  without the buffer growing, a 30-round burst keeps six lights, every surface
  throws something back and takes one hole, a body takes none). Proven to
  fail: moving the pistol's muzzle 12 mm turns it red.

### Dismemberment, built 2026-10-22 (Josh approved the helper's pieces the same day)

- **Cut at runtime, three ways** (`fx/gore.ts`). The BODY: each vertex
  carries its signed distance past each of nine sites (neck; upper arm,
  forearm, thigh, shin each side) in bind space, for the limb's own bones only
  (`aCutA/B/C`), and the zombie's materials are per-zombie copies patched to drop
  fragments past an active cut. One program for every copy (`fx-cut-v1`). The
  STUMP: the helper's cap, fitted to the limb's measured cross-section, riding
  the bone above the cut. The PIECE: the severed triangles lifted out as a
  static mesh at that instant, with its own cap, thrown as a rigid piece
  (`fx/rigid.ts`: support points against the floor and the registered
  surfaces, an impulse at the lowest point so it turns as it lands). A head
  can also BURST (`burstHead`): skull, jaw and brain instead of a head.
- **The rig is Auto-Rig Pro** (arm_stretch, forearm_stretch, hand, thigh_stretch,
  leg_stretch, foot, neck, head; the glTF loader strips the dots, so bones are
  matched on letters only). A cut takes the cuts beyond it (the upper arm takes
  the forearm). The head's own bones go with a neck cut WHEREVER their skin
  hangs, or long hair stayed on the shoulders.
- **The cross-section is the skin, not the max**: near-median radius, 95th
  percentile, the neck on skin alone (hair and collar made its cap a dish 2.5
  times too wide), limbs including the sleeve or trouser (a smaller cap would
  leave a see-through ring). Measured on zombie-m01: neck 6.4 cm, upper arm
  ~8, forearm ~4, thigh ~11, shin 7–12 (trousers).
- **Warm-up**: `fx.cuttable(root)` compiles the piece's static variant of every
  zombie material and the caps and gibs the first time a model is seen, so the
  first severed arm is not a shader compile.
- **Budget**: a zombie in four pieces peaks at 28 draws (a piece draws once per
  body part it spans, plus caps); loose pieces cap at 24 (limbs lie 120 s, gibs
  60 s). Everything loaded including the gore textures is 138.5 MB of 150. **Both
  are the numbers to watch in the stress test.**
- **Bench**: `dismember` and `headshot` scenarios on zombie-m01 (idle). Checks:
  13 more on a synthetic arm carrying the zombies' bone names (the cut halfway
  to the elbow and nowhere short of it, one shared program, the body dropping
  past the cut, the forearm unavailable after the upper arm, no cut twice, the
  stump on the right bone, the same cut and seed landing the same arm in the
  same place, everything at rest on the floor, the piece only the far side).
  Proven to fail with a Math.random in the throw. fx-check: **54**.
- **The stump wears the zombie's skin**: the helper repainted the caps' skin
  band neutral grey with a skin mask (`sets[...].skinMask`), and each stump and
  piece cap multiplies in the colour of the body texture under the skin
  vertices right at that cut (`skinAt`, read once a model, linear, times the
  material and vertex colour). The torn edge and the drips stay red. The tint
  uniforms live in a WeakMap, not `userData` — `Material.clone` JSON-copies
  `userData`, and they hold a texture. Shadows
  aren't cut (no depth-material patch yet); fine while zombies don't cast
  shadows. The bus events that call `sever`/`burstHead` come with the
  survivors' world (SURVIVORZ.md step 6).

### F2, built 2026-10-22 (Josh flagged the stand-in blood "Polish work")

- **The bake**, `scripts/survivorz/fx-blood.mjs` (sharp + the Khronos ktx tool):
  the 40 ActionVFX photographs → `fx/blood/`: a **splat** atlas (1024², 4×4:
  three misty bursts, five directional sprays TURNED so the spray runs along
  +x with its sparse tail at +x — the turn is the alpha's principal axis, the
  tail end its third moment — and eight splats) and a **pools** atlas (2048²,
  4×4: nine pools, four drag smears turned the same way, a clawed handsmear,
  a trail of single footprints and two single hands). Each cell is the blood's
  own bounding box made square, a 4% clear border, colour bled under the
  transparent pixels, and the photographs' faint whitish haze (alpha < 14)
  dropped. **One blood tone**: every cell is scaled to the same mean linear
  red (0.17) where it's solid — the photos were shot differently (some pools
  near black, two bright glossy red), and without it one pool dried pale
  while another read as a hole. Per atlas a **normal map** (half size, from
  the blurred thickness: coverage lifted where the blood is darker) and for
  the pools a **spread map** (quarter size, R: distance from the pool's
  middle over how far its blood reaches that way, smoothed, so a pool fills
  along its own shape). The prints are CUT OUT: connected pieces of the
  dilated alpha, written into `blood.json` as rects (`parts`), a footprint's
  toe at the top of its cell, its foot from which column it's in. KTX2/UASTC:
  ~2.4 MB on disk for all five maps.
- **Decals gained life, on the GPU** (`decals.ts`): a wet set (`{ wet: true }`)
  carries a vec4 a vertex — when it was laid, seconds to dry, when it started
  growing, seconds to grow — and a shader patch off one `uNow` uniform: wet
  blood is glossy (roughness 0.1) and red; as it dries it goes a dark matte
  brown (colour × (0.42, 0.3, 0.26) plus a little brown added, and the
  specular itself damped to 12% — a rough dielectric at a low angle otherwise
  keeps a grazing sheen that turned dry blood PALE under a torch). The gloss
  holds until the blood is most of the way dry, then goes in a hurry (a
  linear fade made a half-dry pool a wide pale glare). A set with a spread map
  reveals each mark from the darkest spread value out, so a pool grows
  without its geometry ever being rewritten. Also: `rect` (one print out of a
  cell), `flip` (a left print as a right foot), and **compressed atlases read
  top-down** (`topDown`: the row maths and the normal map's green both flip —
  a KTX2 can't be flipped on upload).
- **A bug the bench found, older than F2**: `DecalSet.clear()` relied on a bare
  `needsUpdate` meaning "upload everything", which only holds while no range
  is pending — the next mark's `add()` added a range and the clear uploaded
  only that slot, so the previous scene's blood stayed on screen. It now
  queues the whole buffer explicitly. Proven to fail without it.
- **The recipes**, `blood.ts` (`fx.loadBlood()` makes the "blood" set, 400
  marks × 48 triangles, and "pools", 96 × 96; no truncation seen on a floor
  tessellated every half metre): `bloodHit` (moved from effects.ts: the spray
  along the shot, heavy drops falling short, mist, and spatter on the wall
  behind — a burst head-on, a spray at an angle with its dense end where it
  struck and its tail on the way the round went), `bloodSpurt` (an artery's
  beats, weaker each time, then dripping; the gore's stumps use it),
  `woundDrips` (drips from a moving wound, slowing as it closes, stopping
  when it's gone), `bloodPool` (spreads over seconds), `bloodTrail` (a drag:
  long smears laid with heavy overlap so it reads as one mark thinning out),
  `bloodyFootprint` (the right foot's print, or the other's mirrored, toe
  along the way it points, fading with strength) and `bloodyHandprint` (a
  single hand, or clawed down the wall). **Every one takes a kind**: a
  survivor's blood, or a zombie's — near black, thicker drops, doesn't fly as
  far, hardly mists, slower to spread, slower to dry (`BLOOD`). The gore uses
  the zombie kind by default (`Cuttable.kind`), and a severed piece now lands
  in its own splat. `bulletImpact` on flesh takes `blood` for whose.
- **Memory came DOWN**: the stand-in's 512² canvas and a 400 × 96 decal set
  are gone, and `explosion-a` (a sheet the show never draws once
  `explosion-hd` is loaded, 5.6 MB) is no longer loaded by default
  (`FALLBACK_FOR`). Everything with the gore: **140.5 MB** (was 138.5 before
  F2, 147.3 before the trims). Worst effect cost 0.32 ms.
- **The bench** gained a torch (a point light always in the scene, off unless
  a scenario turns it up — the light count never changes) and five scenes:
  blood (two survivor hits, two zombie), pool (spreading, with a drag mark,
  against the torch), prints, spurt (an artery and a dripping zombie), dry
  (the clock skipping on minutes). fx-check: **66** (determinism of a hit,
  zombie blood's look, a spray's tail and a print's toe along the way it was
  going on 200 random surfaces, a cut-out print's UVs in both atlas layouts,
  a pool laid once and grown on the GPU, a trail's extent, a footprint's
  length and direction, drips stopping, the clear bug).
- **Not done here**: blood running DOWN a wall (needs a spread map on the
  splat atlas or a drip sheet — F4's drips will want the same thing), and the
  game calling these (SURVIVORZ.md step 6).

### F3, built 2026-10-22 (after Josh: "Look great keep going")

- **Our renders of the JangaFX simulations**, `scripts/survivorz/fx-vdb.mjs` +
  `fx-vdb.py`: extracts only the frames a sheet needs (7-Zip, into
  `D:/solace-ai/fx-src/`; the dust sets are 5 and 13 GB unpacked), renders them
  headless in Blender 5.2 with Cycles on the 3090 Ti (orthographic camera fitted to
  the union of the volume's bounds over the frames used, transparent film), and
  `fx-flipbook.mjs` packs the frames like any other sheet (`dir:` instead of `zip:`).
  Three sheets: **gas-burst** (the gasoline explosion: 384² frames, blackbody fire
  from the `flames` grid on dark soot; Standard view — AgX turned the hot core
  pink), **dust-impact** (the grenade dust, 320 wide) and **dust-ring** (the
  shockwave, 256 wide, seen from 12° up — a ring is the same from every side, so a
  camera-facing card holds). The volumes are already Z-up. **Two traps, both hit:**
  Blender keeps every frame's grids loaded unless told (`grids.unload()` before the
  next — the shockwave's ~90 MB frames ran a 32 GB box out of commit memory 60
  frames in, and took the bench's Chromium down with it), and the GPU is shared
  with the house's 26B model, so a frame Cycles can't fit is rendered on the CPU
  instead. `--resume` finishes a render that fell over.
- **They replaced the Unity blasts**: `explosion-a`, `explosion-hd` and
  `explosion-dust` are no longer loaded by default (`FALLBACK_FOR`); the generic
  explosion uses gas-burst + dust-impact. That freed 33 MB: everything with the
  gore went from 147 to **136.6 MB**, with three new sheets and the scorch set in.
- **Scorch marks**, `scripts/survivorz/fx-scorch.mjs`: the Taproot scorch was
  judged and dropped (a soft blurred starburst). Ours are procedural, 1024² 2×2:
  two BLASTS (a burnt core, soot thrown out in streaks long in some directions and
  short in others, grit flecks, a faint brown heat halo) and two FUEL burns (the
  charred shape of a spill — the outline of two ActionVFX pools, shrunk inside the
  cell so the clear border never flattens an end — patchy, blistered, a brown heat
  edge). A "scorch" decal set, 48 × 96, drawn under the blood.
- **Soft feet for camera-facing cards** (`particles.ts`, `Spawn.soft: [floorY,
  metres]`): a card fades out over that height above the floor instead of being
  cut by it in a hard straight line. The world height comes from the instance
  position plus the view-space offset taken back through the view matrix's
  transpose. It is what fixed flames standing on the floor like candles and the
  dust clouds' flat skirts reading as a shelf. Packed into the glow attribute
  (vec3), so no new attribute.
- **The recipes**, `fire.ts`: `molotov` (emitter: glass, the fuel splashing on
  along the throw alight — five splashes land as little satellite fires — the
  gas-burst ball, a burning floor that spreads out in 0.6 s and dies down over its
  last third, a sheet of flame rather than a row of candles: mostly short broad
  open-middled tongues, a few tall ones toward the middle, tinted deeper than the
  sheets' near-white cores; embers; a held fire light; a smoke column climbing to
  `ceilingY`; the fuel scorch under it and under each satellite), `catchFire`
  (flames off the body's bones, smoke, its own held light while one is free, and
  it chars the materials it's GIVEN — never shared ones), and `pipeBomb` (the
  brightest flash in the show, a quick fireball from the first half of gas-burst,
  dust-impact and dust-ring on the floor, sparks and grit, the blast scorch on the
  floor and on walls within reach, fine streams of dust shaken off the ceiling when
  there is one, lingering smoke, the shake). `fx.loadScorch()` loads the scorch set.
- fx-check: **78** (the three renders baked, a molotov's determinism, its scorch,
  its light held then handed back, its particle peak, a pipe bomb's scorches and
  shake with the light count unchanged, ceiling dust only with a ceiling, a body
  charring only its own materials and going out when it's gone). The budget check
  now loads the show's own sheet set (the Unity stand-ins aren't in it).
- **Not done here**: the bottle in flight (the game's throw carries the prop; the
  effect starts where it breaks), and a pipe bomb's fireball reading under the
  dust from a camera behind it (the layers sort by their own depth, not each
  card's).

### F4, built 2026-10-22 (the room itself not built yet: shown in a stand-in corner)

- **Light in the air**, `beams.ts`: every beam in the room — under each fixture, out of
  each flashlight, the lockdown beacon's — is an instance of ONE unit cone in ONE draw
  (a fixed pool of 32, refused past it). Additive ONE/ONE (three's AdditiveBlending
  multiplies by source alpha, and light added to air has none — the first cut drew
  nothing at all). Brightest along its axis, fading toward its silhouette with a steep
  curve (light through air is as bright as the length of air it crosses), dying away
  down its length, thinned by slow drifting world-space noise. **Normals under a
  non-uniform scale need the inverse-transpose**: a long thin cone transformed with the
  plain matrix read as edge-on everywhere and its silhouette never faded. A beam meeting
  a floor fades in its last 45 cm (`floorY`); a FITTED beam (`fit`, a flashlight) is
  re-measured against the registered surfaces every frame and ends a hand's breadth past
  the wall it meets, so a wall never cuts it in a hard line. `beamDust` keeps motes
  drifting inside a beam (`fx.beams.pointIn`).
- **What the fixtures do**, `fixtures.ts`: the ROOM registers its fixtures (light,
  glowing materials, beam, power zone, bank) and the effects drive only their
  intensities — the room's light count never moves. Flicker styles (`steady`, `buzz`,
  `failing`: episodes of dropouts, `dying`: mostly dark, sputtering, surging), a
  fluorescent strike (a flash, dark, stutters, on — each tube settling at its own
  pace), a power cut (a sag and a last flicker), the restore BANK BY BANK
  (`BANK_GAP` 0.8 s), and the lockdown beacon (its beam turning round its axis, the
  room going red each time it sweeps round). **Every level is a pure function of time
  and the event's seed**, so a viewer who joins halfway through a restart computes the
  same tubes lit (proven to fail with a Math.random in the jitter). `clear()` hands the
  room its fixtures back as they were. Times are on the effects' clock; F7 maps the
  server's `zone.powered` events onto it.
- **The room breathing**, `ambient.ts` — emitters placed on the room's anchors and run
  all day, each holding a small steady share of the budget: `steam` (a weep or a split
  pipe, surging; lit partly by itself or it vanishes in a dim room), `drips` (regular,
  with two ripple rings spreading on a puddle — flat cards — and a tiny crown),
  `sparkingWire` (random spits, now and then a big burst with a blue-white arc, a flash
  of the spare light and burnt-insulation smoke), `fog` (already lying there when the
  camera arrives, banks at different ages, kept topped up, soft on the floor) and
  `tankBubbles` (mostly from a few vents, and a rush of big ones now and then).
- **Engine additions**: `fx.emit` returns a handle that stops an emitter; cards can lie
  FLAT on the floor (`Spawn.flat`, stretch -1); the sprite sheet grew to 4×4 (a ripple
  ring, a bubble, a water thread, an electric arc).
- fx-check: **94** (flicker pure and bounded, a tube's strike, dying mostly dark and
  failing mostly on, the power restore bank by bank, the late joiner, the beacon
  turning without a new light and handed back on clear, 21 beams one draw, a flashlight
  ending at its wall, the pool refusing past 32, each ambient effect two minutes under
  400 cards and stopped when told, ripples flat).
- **Waiting on the room** (EFFECTS.md §5): `vault-lobby-anchors.json` — where the
  fixtures, pipes, leaks, panels and tanks are. Until then the bench's corner stands in.

### F5, built 2026-10-22

- **Skin masks**, `scripts/survivorz/fx-skin.mjs`: the survivors are full-body scans —
  one mesh, one material, one atlas, skin and clothes together — so each gets a baked
  mask of which atlas texels are skin: a hue/saturation/brightness band skin of every
  tone falls in, cleaned (speckle out, holes closed, a soft edge), plus hand-placed
  boxes where colour can't decide (Sophia's brown hair, Nathan's tan shoe linings).
  Reviewed on `<name>-skin-preview.png`; shipped as `<name>-skin.json` (read as data:
  it goes into the overlay on the CPU, and the checks run with no canvas).
- **The body layer**, `body.ts` (`fx.body(root, name)` → `BodyLook`): the survivor's own
  material copy gets a shader patch and ONE 512² RGBA texture, 1 MB, no mips — R dried
  blood, G fresh blood, B the skin mask, A a bruise (0–0.45) or an open wound
  (0.5–1). GRIME, SWEAT and INFECTION are the shader's, from three numbers
  (`set({grime, sweat, infection})`) and the body's REST-POSE position (no crawling,
  no seams): grime as stains with edges, grit and a general dulling, worst low down
  and halved on the skin (**an even darkening read as the shirt being in shadow** —
  stains are what read as dirt; and tonemapping squeezes a bright shirt, so it has to be
  strong); infection as grey-green pallor, dark veins (ridged noise) spreading out from
  the bite as it grows, a fevered sheen and darkening round the eyes and lips. Sweat,
  fresh blood and open wounds shine; dirt dulls.
- **WOUNDS ARE PAINTED BY DISTANCE ON THE BODY**: the first cut stamped discs on the
  atlas, and a scan's atlas is dozens of islands — every splash stopped at an island
  edge in a hard line and read as a red square. Each body now has a map, built once, of
  where on the body every atlas texel is (every triangle rasterised with its rest
  position, a pixel of padding round each), and a wound paints every texel within so
  many centimetres of the hit, across any seam, its edge roughened by 3D noise. A round
  (hole, blood, bruise), a bite (two arcs of tooth marks, a bruise; the infection's
  veins grow from it), a cut and a graze (along a segment), a bruise. `bleed()` spreads
  fresh blood round open wounds; fresh blood dries into dried with a 90 s time constant.
  **The scans' positions are quantised (±1, scaled above the mesh)**, so a metre is
  measured from the posed body's height in the world, not assumed.
- **Breath** (`effects.breath`): from the mouth (forward of the head bone by the BODY's
  facing — the rig's head axes point anywhere), a breath every 3.5 s at rest and 1.4 s
  out of breath, bigger, only in the cold. **Some rigs prefix every bone** with their
  export's name (`rp_sophia_animated_003_idling_head`): `findBone(root, "head")` matches
  the end of the name.
- **Cost**: 1 MB a survivor (6 MB for the cast), one program for all of them; the
  worst effect 0.35 ms; 137 MB in the bench.
- **The shotgun was swapped** by the animation session (19:38): a wood-stocked pump gun,
  muzzle now `[0, 0.09, 0.729]`; its ejection port re-measured on the gun bench to
  `[-0.022, 0.08, 0.195]`. fx-check caught it (the muzzle copy check). fx-check: **103**
  (a wound where it hits and nowhere else, a wound on an atlas seam painting both sides,
  the same seed the same wound, fresh blood drying, a clean start keeping the skin,
  the state clamped, every skin mask a sane share, breath only in the cold and faster
  out of breath).

### F6, built 2026-10-22 (after Josh: "Looks great keep going")

- **Driven by the facility server's door events** (`src/survivorz/doors.ts` `FxEvent`):
  `playDoorEvent(fx, ev, parts)` in `breaking.ts` takes the event as sent (door centre,
  facing, size, material, the side the blow came from, `lastHp`, the seed) and the door as
  the world has it (`DoorParts`: its leaf, a glass door's pane, the planks nailed on, how
  many the server says are LEFT). `door.hit` shakes what's there, or breaks the outer
  planks when the barricade drops below a whole plank; `door.banged` is a steel (or
  reinforced glass) door; `door.broken` bursts wood or shatters glass;
  `door.barricade` / `unbarricade` are dust at the nails. Debris always goes out the far
  side from the blow (`-side × normal`).
- **The pieces are one draw a break** (`Debris`, `DebrisPool` of 8): a burst door is a
  dozen panels and slivers, a pane forty-odd shards, all slabs in ONE geometry whose
  vertices are rewritten each frame from each piece's own rigid body (rigid.ts's step,
  now exported as `stepRigid` for exactly this). A piece at rest costs nothing; pieces lie
  a few minutes (wood four or five, glass seven) then sink away, and the draw goes with the last one.
- **Fracture** is Voronoi cells of seeds round the blow, cut out of the door's rectangle,
  every edge not on the rectangle torn by `jag`. Wood is measured with y squeezed 3.2×,
  so it splits in long pieces along the grain, and torn more across the grain than along
  it; glass seeds sit on rings round the strike, so it breaks radially, small near the
  blow and long toward the frame. Shards against the frame stay as TEETH, some dropping a
  few seconds later.
- **Planks** (`barricade(kit, door, count, seed)`): up to three, nailed at fixed heights
  with alternating tilts from the DOOR's seed, so every observer's barricade matches;
  nail heads drawn on. A plank gives way three ways: it SNAPS (both halves swing down on
  their nails, one drops quickly, the other hangs a while), it TEARS off at one end and
  swings down from the other (a low one swings until its end meets the floor and leans
  there), or it's RIPPED off whole.
- **A battered door** jolts in its frame (`rattle`: pushed along the blow first, rocking,
  dying away, and back EXACTLY where it hung, even after a second blow mid-shake — and
  `fx.clear()` settles anything still shaking). Dust puffs out of the gaps round the leaf
  and trickles off the lintel; flecks of paint and a splinter or two where it's struck.
  **Dust is only seen because it catches light**: shaded by the room's ambient alone, it
  read as dark soot smudges on the door, so its cards carry some of their own light.
  Steel barely moves and drops grit and rust; glass cracks a little more each blow (the
  bullet-hole crack star on the pane).
- **A mark goes with what it was on** (`DecalSet.removeOn`): a pane's cracks, the bullet
  holes and blood on a door, all go the moment it breaks; marks on the wall beside stay.
- **Settling, found by the checks**: a long thin slab given only a few support points let
  its corners sink 15 cm into the floor, and a slab balanced on one contact at a time
  rocks for ever and never rests. Every slab now uses its whole outline as support
  points, a slab standing on its edge is tipped over, and one that slows down on the
  floor (or has been on it 1.4 s) is eased the last bit flat and rests.
- **The wood** (`scripts/survivorz/fx-wood.mjs`): one 1024×512 atlas, bare wood
  (ambientCG Wood049, CC0) | painted wood (PaintedWood009C, CC0), KTX2, 0.5 MB on the GPU;
  vertex colours grade it — paler and warmer for freshly torn wood. Glass is a material,
  no texture: pale faces, green edges.
- **Cost**: about 0.3 ms at most and 7 draws in the six bench scenes; memory 116 MB in those
  scenes (the worst of the whole bench is still F5's 137). fx-check: **125** (+22: the
  fracture covering the door exactly; the planks laid alike for everyone, on the door's
  face, apart; a snapped plank one draw and the same on every screen; nothing that breaks
  off a barricade going through the floor; a burst door gone from its frame, its pieces
  out the far side, none left standing on an edge, all at rest on the floor; no light
  added; a pane's cracks going with it and the wall's staying; most shards through and
  teeth left in the frame; a blow breaking exactly the outer planks; the shake going with
  the blow first and ending exactly home; and the pieces and their draw gone in the end).
  The crack, shake and settle checks were each proven to fail against a deliberately
  broken copy.
- **For F7**: the room's doors hand their leaf, pane and plank meshes to `playDoorEvent`;
  barricade planks come from `barricade()` so they match on every screen; the room
  registers its walls as `fx.surfaces` so pieces bounce off them.

### F7, first half, built 2026-10-23 (the rooms aren't built yet; this is what doesn't need them)

- **The bridge** (`client/src/survivorz/fx/show.ts`, `ShowFx`): the show client hands it
  every server event and the room hands it its objects (`registerDoor(id, {leaf, pane,
  parent, at, normal, size, material, holdSide, floorY}, state)`). It decides the effect,
  the place and the seed: `door.hit/banged/broken` through `playDoorEvent`,
  `door.barricade/unbarricade` (the planks are drawn by the effects from the door's id seed,
  so they match on every screen), `door.pried` (sparks where the bar bites), `vault.open`
  (steam jetting round the rim for a couple of seconds, dust off it), `room.unsealed` (the
  dust of a room shut a long time), `zone.powered` (the fixtures' banks). `apply(id, state)`
  makes a door match the server with no event (a late joiner: planks, broken), `power(zone,
  on)` the same for the lights. **Two clocks**: the server stamps events in ms, effects run
  on fx.now; `ShowFx` keeps the offset, so a power return already under way is at the same
  place on a late joiner's screen as on a live one (checked).
- **THE WORST MOMENT** (bench scene `worst`): EFFECTS.md §2's budget is defined at "a
  firefight with a fire burning", and until now every scene tested one effect. Staged in a
  blockout of Reception (the Vault Lobby's 30 × 12 m hall, at its own map coordinates, with
  its three real doorways from SITE_9, 4 m high), six ceiling panels in three banks: all six
  survivors a month in with wounds, zombies breaking the barricaded Decontamination door
  through four blows, the zombie coming through, rifle + shotgun + pistol, zombie blood, a
  forearm and then the head off, a molotov in the doorway and the zombie catching, a pool,
  a pipe bomb, the power cut and its bank-by-bank return, steam off a pipe, dust in every
  beam. **The bench can now time at the stream's own 1920×1080 (`--1080`) and every half
  second rather than only at the particle peak (`--sweep`)**, because a frame full of smoke
  can cost more than the frame with the most particles. Result: **the effects' worst frame
  0.48–0.55 ms of a 1.25 ms frame, 36 draws, 716 particles, 144 MB (0.48–0.68 ms and 147 MB once the baked holes went in)** — a third of the time
  budget and three-fifths of the draws. At 960×540 the effects' share was under the timer's
  noise; only the 1080p sweep gives a real number.
- **THE SOAK** (fx-check): the worst moment forty times over (about eleven minutes of show)
  in node, counting every geometry that ever entered the room and checking each one that
  left was freed; objects in the room, running emitters, memory and the light count
  compared run to run. **It found a real leak on its first run**: re-barricading a door
  (or the room re-registering one) dropped the old planks without freeing their geometry —
  120 planks' worth in eleven minutes, weeks of it over the show. Fixed (`drop` in show.ts),
  and the check was proven to fail with the fix taken out. fx-check: **133**.
- **Still to do for F7, when the room work lands** (`vault-lobby-anchors.json`, the set):
  register the real doors and fixtures, run the worst moment in the real Reception and the
  busiest real room, and the stress test (SURVIVORZ.md §13 step 15) on top.

### The bullet holes, made real (2026-10-23)

- F1's holes were drawn on a canvas, the last stand-in left: a flat dark dot per surface,
  no depth, no variety, and far too small (7.5 cm across for a concrete hit, most of it
  empty). The free Taproot bullet hole was judged and dropped like its scorch: a black blob
  with hair-thin vein cracks.
- **`scripts/survivorz/fx-holes.mjs`** bakes them the scorch's way, from a HEIGHT FIELD per
  hole, so the normal map gives each real depth in the room's light: concrete (a crater
  broken into big angular conchoidal facets, the fresh concrete inside paler with
  aggregate, shadowed with depth, hairline cracks out across the wall, a little surface
  flaked past the rim, powder blown out round it), steel (a dimple with a curled lip, a thin
  ragged ring of bare steel with scratches, a lead-and-soot smear, chipped paint and red
  primer, shiny where bare), wood (torn long along the grain, splinters lifted, pale raw
  wood and the undercoat showing), glass (a crushed white rim, radial cracks and broken
  rings). Four kinds across, two variants down: colour 2048×1024 (KTX2), normal and
  roughness at half that. The first bake's concrete read as golf-ball scales and its steel
  as a cartoon eye; both were reworked against the preview sheet
  (`holes/holes-preview.png`, each hole lit by its own normal).
- `loadHoleKit` / `fx.loadHoles()` makes the "holes" set; `holeCell(fx, kind, rng)` picks a
  variant per shot (falling back to F1's code-drawn cell if the bake isn't loaded). **A wood
  hole stays upright** (its grain runs up the wall); the others spin at random. **Real
  sizes now**: the decal spans the crater, cracks and powder — concrete 14 cm, steel 10,
  wood 13, glass 26 (the glass door's cracks use the same cells).
- Bench: a close-up scene, `holesclose` (three rounds into each surface, the camera sliding
  past them). fx-check **138** (+5: every cell's border fully clear so a projected hole never
  shows its square, a hole in every cell, a dark middle where it goes in, each surface its
  own column and both variants used, the fallback without the bake).
- **Memory: the worst moment is 147.2 MB of the 150 budget now** (the holes' atlas, +2.8).
  The next thing to add memory will need something given back — the biggest single item is
  the flipbook sheets; the survivors' body layers (6 MB) can't be compressed (the CPU
  writes them).

### The leftovers, and a bug Josh caught (2026-10-23)

- **EVERY ZOMBIE WAS MISSING ITS LEFT HAND AND LEFT FOOT** — Josh spotted the foot. The cut
  uniforms (gore.ts) are two Vector4s and a float, a site's MODE per component, and a bare
  `new THREE.Vector4()` is (0, 0, 0, **1**): the fourth site of each vector — forearm.l and
  shin.l — was switched ON from the start, so the body dropped everything past those cuts
  before anything had been cut. It had been there since dismemberment shipped; the
  dismember scene cuts forearm.l first, which hid half of it. Zeroed, and fx-check now
  asserts a fresh cuttable starts with every cut off (proven to fail on the old line).
  body.ts's look vector zeroed the same way (its w is unused, so it was harmless).
  **A Vector4 used as a set of switches must be built `(0, 0, 0, 0)`.**
- **Blood runs down walls** (`scripts/survivorz/fx-runs.mjs`, `bloodRun` in blood.ts): no
  photograph runs, so four tall procedural cells (a ragged soaked head at the top, three to
  six rivulets wandering down, thinning, each ending in a bead), with a SPREAD map counting
  down each rivulet at its own pace — the pools' trick — so a run CRAWLS down the wall over
  5–11 s (a zombie's 1.7× slower, darker). Its own small wet set ("runs", 48 × 32 tris,
  ~1 MB). bloodHit leaves one below the spatter on a heavy hit near a wall steep enough to
  run (never a floor). Bench scene `runs`.
- **Breath from the actual mouth** (`findMouth` in body.ts): a fixed offset off the head
  bone put the breath 3–7 cm low (at the chin, or under the jaw and inside the face on
  Sophia) — the head bone sits differently on every rig. The mouth is now measured off the
  body's own face the first time it breathes: the forward-most point of each centimetre
  down the face's centre line, the chin where that profile falls back into the neck, the
  lips 4.5 cm above it, stored in the head bone's frame so it follows the head. Measured
  and seen on all six.
- **Fire draws over smoke** (system.ts render order): smoke and dust 10, bursts and
  fireballs 10.5 (they carry smoke inside them), pure flames 11, sprites 12. Every layer
  used to be 10, drawn in load order, so a pipe bomb's dust greyed out its fireball.
  Fixing it exposed two more: the molotov's fuel fireball ran on into its own grey smoke
  frames over the flames still burning under it, which read **olive-green** (it now ends
  while it's fire, tinted like the flames; the molotov's own column is the smoke), and the
  pipe bomb's fireball had no soft foot, so the floor cut it in a straight line (now soft).
- **A big decal kept a wedge-shaped hole** (decals.ts): a mark with more triangles than its
  slot dropped the overflow in the order they came — a straight-edged wedge out of the
  middle of a pipe bomb's scorch. It now keeps the triangles nearest its middle and loses
  its faded rim (checked; proven to fail on the old order). Scorch set 32 × 160.
- **Memory**: `flame-small` was loaded on every show and drawn by nothing (UNDRAWN in
  system.ts; still baked, loadable by name) — 2.8 MB back. The worst moment: 145.6 MB,
  0.44–0.69 ms at 1080p across runs, 36 draws. fx-check **145**.

### The zombies' look and the turn (2026-10-23, after Josh: "the G strain will be dark deep purple")

- **ONE PATCH, THE CUT'S** (`zlook.ts`): a zombie's look is drawn inside the cut's own
  shader patch (gore.ts `cuttable`), so the cut and the look never fight and every zombie
  shares one program (`fx-cut-look-v2`). Where on the body a fragment is comes from its
  REST pose — `bindMatrix * position` on the skinned body, an `aZBind` attribute carried
  onto every severed piece — so a piece keeps its wounds and colour wherever it lands.
- **VARIETY** (`ZombieLook.variety(seed, kind)`): a skin-tone shift, a clothing tint from
  six, grime, old dried blood near black-brown, and a ±5% height, all from the seed, so
  copies of one model stop being twins and every observer sees the same copy. An
  `"experiment"` carries the **G-STRAIN: dark deep purple** (Josh), a bruise-dark purple
  that keeps the skin's own light and dark, darker veins through it, and purple fresh blood.
- **WOUNDS** (`wound(kind, at, seed, dir)`, `feed`): twelve at a time per zombie (the
  thirteenth replaces the oldest) — bullet, blunt, slash (along a direction), stomp,
  mouth. Radii 5–15 cm, fresh red bright enough to read on a dark zombie.
- **THE TURN** (body.ts, `BodyState.turned` 0–1, program `fx-body-v9`): the skin to the
  dead's grey, mottled, faint veins under it (a finer network than infection's — the
  coarse one read as painted bands), the sweat gone, the eyes clouding milk-white. A
  half-skin edge (the neck under a collar) turns fully, or it read as a warm seam.
- **THE EYES ARE THE EYEBALLS** (`eyeballs()`): the survivors' rig has `eye_l`/`eye_r`
  bones and each eyeball's vertices are weighted to its bone, so the cornea is the front
  of that cluster in the rest pose. Two earlier tries failed and are worth knowing: snapping
  a guessed point to the nearest vertex (a face is sparse round the eyes — one landed on
  the brow), and laying the guess out in the WORLD (a tilted head put one eye on the bridge
  of the nose). A rig without eye bones falls back on a face's proportions laid out in the
  rest pose. **Going from the posed world back to the rest pose:** three's "attached" bind
  mode re-derives `bindMatrixInverse` from the mesh's world matrix every frame, so it is NOT
  `bindMatrix`'s inverse — invert each on its own (rest = B⁻¹ · boneInverse⁻¹ · bone⁻¹ ·
  Bi⁻¹ · M⁻¹ · world). Getting that wrong put the eyes 6 m away.
- **A TURNED SURVIVOR IS CUT LIKE A ZOMBIE**: `cuttable` chains the material's own patch
  (`clone()` drops `onBeforeCompile`, which took the grey off on being cut) — the key
  becomes `fx-body-v9+fx-cut-look-v2`. The survivors' rig is measured off its bones
  (`humanRig`), and its neck is sized off the whole one-material scan: reading only
  body/head/skin materials gave every survivor's neck a cap of radius 0.
- Bench scenes `zombies` and `turn`; fx-check **157** (the eyes on a tilted, moved head,
  the turn's clamp, the survivors' neck, the chained patch — the eyes and the neck each
  proven to fail on the old code). Rollo, the seventh body, still has no skin mask.

### The closes: melee blood, spreading fire, the director's tools (2026-10-23)

From the validation against MECHANICS-BRIEF.md, everything that was "close":
- **MELEE BLOOD** (blood.ts `meleeHit` claw | sharp | blunt | stomp, and `castOff`): no
  mist, unlike a round; blood goes on the way the blow was travelling. A drop flung hard is
  traced along its own arc with the particles' own physics (`flung`): one that meets a wall
  or the ceiling before the floor leaves a STREAK there, drawn out the way it flew, laid
  when the drop arrives (a pending-mark emitter, everything random drawn up front so every
  screen agrees). The cast-off's release direction turns with the arc (`SWEEP` 0.9 rad
  about the swing's axis) — with one fixed direction the drops only spread by speed and
  landed in a clump (46% across vs along; 5% now; checked). Streaks are sized to READ
  across a room (true-to-life 2–5 cm was invisible at 3.5 m). Survivors gained a
  `"scratch"` wound (three thin rakes). Bench `melee`.
- **FIRE THAT SPREADS** (fire.ts `firePatch`, `fireSpread`, `doorwayFire`): a front racing
  along spilled fuel with the trail burning behind it (never ahead — checked) and a patch
  catching at the end; a doorway filling jamb to jamb, smoke rolling out over the lintel
  both sides, floor and the wall over the frame blackened. A run's scorch is long marks
  along it (`scorch(..., along)`): round ones in a row read as stepping stones. The
  doorway's flames are thinned (0.024 s) — denser burned out to a flat white sheet. Two
  fire lights in the pool: a third fire burns unlit. Bench `firedoor`. Show events
  `fire.spread {from, to}` and `fire.door {door}` (the contract in SURVIVORZ.md §3); a
  ShowEvent's `from` is a height for thing.fell and a position for fire.spread.
- **EMERGENCY LIGHTS + THE DIP** (fixtures.ts `emergency`, `emergencyOn`, `dip`,
  `setDip`): emergency fixtures are dark while their zone has power and clunk on 0.45–0.95 s
  after it goes (or are simply on in a zone the generator isn't feeding); a dip sags the
  zone to ~36% with stutters and struggles back, never tripping the emergency lights.
  Both pure functions of time and seed (late joiners match — checked).
- **THE DIRECTOR'S NOISES** (ambient.ts `pipeBurst`, `somethingFell`; show.ts events
  `zone.dip`, `pipe.burst`, `thing.fell`, `vault.shut`): event names and fields sent to the
  mechanics session. Dust in a lit room has to be PALE (grey dust on a grey floor
  vanished). `vault.shut` has no bench scene until the real vault exists. Bench `director`.
- Persistence: Josh decided limbs, debris, blood, scorch and wounds persist all show,
  across renderer restarts. I write the store and the replay (the asset bot declined).
  Rows are keyed by facility-map.ts room id, positioned from a ROOM_<id> anchor at the
  floor's min-x/min-z corner (agreed with the mechanics session). Door, plank and glass
  state is READ from the server's DoorState, never stored twice. Scorch decals still
  expire (`burn + 600`) until that pass.
- **COUGHING UP BLOOD** (Josh: "whatever you recommend"; blood.ts `coughBlood`, body.ts
  `coughedBlood`, `handAtMouth`): only in the last stage of infection and only on some coughs
  (the show decides which). Uncovered: a fine mist and a few drops forward and down. Into a
  fist (the built `bd-cough` clip covers the mouth): the KNUCKLES take it (the hand bone is
  the wrist — aimed from there it landed on the cuff), a little mist escapes round the
  sides, a drop or two falls; the lips get a fleck either way. **THE MOUTH IS MEASURED IN THE
  REST POSE NOW** (`restMouth`): measured posed, mid-cough, a fist at the mouth was the
  forward-most thing and the bent head moved the chin, so the "lips" landed on the nose.
  `findMouth` also leaves arm/hand vertices out, and the lips are snapped onto the body's own
  surface before painting. Bench `cough`.
- fx-check **185**; review page v18.

### The gaps, bandages, drags and burns (2026-10-23, after Josh: "keep going")

- **FLASHLIGHTS** (`torches.ts`, `fx.torches`): the world owns each torch and its light (from
  its own fixed pool); the effects drive it. Its beam goes in the shared beam pool. Every
  LENS is one instance of one quad, one draw for all of them: a bright point never smaller
  than a few pixels (it reads from the far end of a corridor), flaring to ~1.5 m only when it
  points squarely at the camera (face¹⁰). `battery(charge, t, seed)` is pure: full to 30%,
  then dimmer and warmer (to amber), dipping now and then; under 12% it sputters, flat it's
  dark. `set(id, {on, charge})` takes the server's word. Bench `torches`.
- **THE LIT MOLOTOV** (fire.ts `litRag`): follows the rag each frame; its flames get a
  quarter of the bottle's velocity, so a thrown bottle leaves a streak close behind it.
  Thrown backward at the bottle's own speed, they strung out metres behind it in dots
  (checked both ways). It holds a fire light, a warm pool in a dark room. Bench `litmolotov`.
- **THE REINFORCED BARRICADE** (`barricade(..., {reinforced})`, ShowFx reads
  `DoorNow.reinforced` and re-nails a door when it changes): iron straps drawn into each
  plank's own mesh like its nails, JUST INSIDE THE JAMBS (the plank's true ends run behind
  the frame), bolted through, two more nails; drawn from a separate rng so an ordinary
  barricade lays out exactly as before (checked). Bench `reinforced`.
- **THE SINK** (ambient.ts `tapRunning`): a dense stream of long drops (360/s full) reads as
  one ribbon, narrowing as it falls; rings, white water and splash where it lands; the flow
  eases open and shut. Bench `sink`.
- **BANDAGES AND BURNS** (body.ts `bandage`, `seep`, `burn`, `unpatch`; six PATCH slots in
  the survivor's shader, program `fx-body-v11`): a sphere in the rest pose, so it wraps a
  limb and pads a torso. A bandage goes on the newest wound (or the one nearest a point),
  hides it, gets grubby, and blood seeps through its middle, fresh or dried. A burn is raw,
  blistered and wet on the skin, charred round its rim; on cloth it chars a hole with the
  burned skin showing through. Both take the BONE they're on (`on`): an arm hangs against
  the torso, and a point in front of it is nearer the torso's side. Bench `patches`.
- **A BODY DRAGGED** (blood.ts `dragSmear`): long overlapping smears along the way it actually
  moved, nothing while it lies still, thinning out unless the wound's still open. Bench `drag`.
- fx-check **205**; review page v19. Next: persistence (the store and the replay).

### Persistence, part one: marks and wreckage (2026-10-23)

Josh: severed limbs, wreckage, blood, scorch and wounds persist the whole show, a renderer
restart included. The client half, built and checked; the show's store waits on the
mechanics' world store (SURVIVORZ.md §3 "The facility file" + "Events the server sends to
the effects": rows keyed by facility-map.ts room id, positions from a ROOM_<id> anchor at the
floor's min-x/min-z; door, plank and glass state READ from DoorState, never stored twice).
- **NOTHING LASTING IS THROWN AWAY.** A decal set was a ring buffer (the oldest mark gave way);
  now a lasting mark about to lose its slot MOVES to the set's kept layer for its room
  (`fx.roomOf`): the same material (still drying), chunks that start at 256 triangles and
  double to 4,096 (one draw each, bounded by their own marks so they cull with the room).
  Wreckage never sinks (it used to after four minutes, and the ninth break threw out the
  first): a batch whose pieces are all at rest is merged into `fx.breaks.kept`, a KeptLayer
  (kept.ts) per material per room (`fx.roomAt`). Scorch no longer fades.
- **THE LEDGER** (ledger.ts `FxLedger`): records RESULTS, not causes, for marks — a mark as
  laid, ~160 bytes, positions room-local to 0.1 mm — and for wreckage the show event that made
  it (`fx.cause`, stamped by ShowFx on everything an event makes) plus each piece's resting
  pose, ~650 bytes a break. A "gone" row when a surface breaks. `restore(rows, show)` lays
  marks back in order at the time they were laid (as dry as they were); wreckage is made
  again by replaying its event QUIET (`fx.quiet`: no particles, lights, marks, shakes or
  emitters) with the door as it was just before, then laid at its poses and kept.
- **PROVEN** on a fresh renderer: 411 marks restored to within 0.61 mm, the ones on a pane
  that broke later left off; a barricade beaten down and a door burst made again to within
  0.12 mm, quietly, nothing written down twice. The soak: forty worst moments keep 3,485
  marks and forty doors' wreckage in 17.8 MB, nothing else building up. fx-check **221**.
- Next: severed limbs (rows carry the piece's posed vertices, compressed: its shape is the
  pose at the cut), meat and bone chunks (merged like wreckage), survivors' and zombies'
  wounds, cuts, bandages and looks.

### Persistence, part two: limbs, chunks and bodies (2026-10-23)

- **LIMBS AND CHUNKS LAST.** A severed limb (`last: "keep"`) is held as it is once it has
  lain still half a second (it wears its zombie's own look, so it can't merge); a chunk of
  meat or bone (`last: "merge"`) merges into the room's kept layer like wreckage. The ledger
  writes a limb as whose it was (`Cuttable.ref`), its look, which cuts came before, its
  shape at the cut (int16 millimetres, base64, ~2 KB) and its cap; a restart cuts it again
  from a fresh copy of the model (`model`) to within 0.83 mm.
- **A SURVIVOR'S BODY IS A LOG** (body.ts `BodyOp`, `ops`, `onOp`, `replay`). Everything
  done to it is written down with whatever depended on the pose already resolved (a vertex,
  or a point on the rest pose), so a replay doesn't care how the body is standing. A look
  changing every frame and a dressing seeping more are kept as their newest; a clean starts
  the log again. ~800 bytes for two wounds, a cough, a bandage, a burn and the bleeding.
  Two things had to change for the replay to come back EXACT (0/255 off): the body's height
  is measured in the rest pose (it was measured in whatever pose it stood in, so a restart
  that found the head turned painted wounds a shade bigger), and blood dries in whole 2 s
  steps of the body's own clock, every op catching the drying up first (it dried in
  frame-clock chunks the replay can't know). Brought back an hour later, the blood has
  dried meanwhile. Drying also walks only the wet texels now.
- **A ZOMBIE IS A SNAPSHOT** (gore.ts `Cuttable.state` / `restore`): its look and each cut
  with its stump's place on the bone, ~500 bytes. Restored on a fresh copy the stump is on
  the same bone in the same place, nothing thrown or bleeding, and restoring twice still
  makes one stump.
- **THE BENCH CAUGHT ONE THE CHECKS COULDN'T**: the real gore kit's caps are groups and the
  ledger skipped anything not a mesh before looking for the cap, so every restored limb lost
  its cut face. The checks' stand-in caps were meshes; they're groups now, and the check is
  proven to fail on the old code. Bench `restart`: the renderer wiped mid-scene and
  everything put back. fx-check **241**; review page v20.
- **Left:** the show's store itself (the mechanics' world store).

### Rollo, the seventh body (2026-10-23)

Rollo is a hazmat suit, black rubber gloves and a respirator over a hidden copy of Eric's body
(`*body_proxy*`, never drawn). Three things were wrong for him and are fixed in body.ts:
- **The look goes on the suit.** It took the first skinned mesh, which is the hidden body. It
  now takes the biggest DRAWN one (never a `*body_proxy*`): the suit, not the gloves.
  `BodyLook.suited` is true for a body with a proxy inside.
- **His face is painted on the visor**, in three patches of the suit's texture (one upside
  down), washed out by the glass. fx-skin.mjs marks exactly those patches as skin (`only`
  boxes, every colour but the suit's purple and black, so the blocky texture greys evenly
  when he turns; a colour test caught some blocks and not their neighbours). Found from the
  geometry: every suit triangle in front of the hidden face, minus the respirator and hoses.
  1.2% of his atlas. Grime, blood, wounds and burns land on the suit as on anyone's clothes.
- **His eyes are where they're PAINTED.** The mask file now carries `eyes` (atlas spots) and
  the engine reads their place on the body off its texel-position map. The paint doesn't
  line up with the hidden body's eyes (it came from the original suit model), so those are
  only the fallback for a suit with nothing painted, carried straight out onto the suit
  through the bind matrices. The first cut went through the world and put them 4 m off.
- **No cough blood**: the mouth is behind the respirator, so `coughedBlood` refuses a suited
  body, and the game skips a suited survivor's cough spray (`look.suited`).
- Bench `rollo`; fx-check **247**; review page v21.

## 7. Decisions for Josh

**Answered 2026-10-22:** graphic, and dismemberment is IN. The zombie pack
does NOT come cut up (each zombie is one skinned mesh, 90 bones, no separate
limbs; some carry "Intestines" bones), so we cut it ourselves: a Blender
script splits every zombie at the neck, shoulders, elbows, hips and knees by
bone weight, caps each stump with a wound surface, and saves the pieces. In
the show a severed part's bone is scaled to nothing, the matching piece falls
away as a ragdoll, and the stump bleeds. Josh asked for packs to save work;
the shortlist is in the conversation of 2026-10-22 (Unity Labs CC0 flipbooks,
JangaFX CC0 VDBs, ActionVFX free blood photos, StillMount blood decals).

1. **How graphic.** The zombies are fictional, but realistic blood on human
   survivors can get a YouTube stream age-restricted, which hides it from
   searches and logged-out viewers. Options: full blood on everyone; full on
   zombies, lighter on survivors; or lighter everywhere. And is dismemberment
   (a shotgun taking a zombie's arm or head) in or out?
2. **Camera shake and slow-motion** on the broadcast cameras for big moments
   (an explosion, a death), or keep the cameras steady? **Answered
   2026-10-22: no slow motion.** Shake wasn't ruled out, so the plan is a
   short, small shake on explosions only (the molotov's fireball, the pipe
   bomb), falling off with distance; Josh vetoes it on the bench if it reads
   wrong.
3. **Money.** Everything above is free (Blender, code, CC0 textures). A
   bought pack of fire/smoke flipbooks would save some time, but the $100
   budget is nearly spent, so the plan assumes none.

### The real props: measured and fitted (2026-10-23)

The asset bot packed the props (assets/downloads/survivorz/props/, metres, +Y up, origin on
the floor at the footprint's middle). The effects take their anchors from the game, so each
one is MEASURED on the real model — close orthographic shots on a labelled 1 cm grid, then a
ray to confirm (scratchpad zoom-prop.mjs) — and kept in ONE table, `fx/anchors.ts`
`PROP_ANCHORS`, with `tapOf` / `anchorOf` / `partsOf` to carry them to wherever the prop
stands. fx-check holds every named pane and leaf to its model and every point inside the
prop's packed size; a re-pack means measuring again.
- **sink-basin**: the aerator at (0, 0.5065, -0.085), the bowl floor at 0.312.
- **sink-steel**: two goosenecks, mouths at (-0.106 / 0.52, 0.849, -0.077), bowl floors 0.497.
  The aerators are open rings (a ray straight up passes through them). Bench `sink` now runs
  on it. (It first rendered with white wire lines, an edge-line primitive in the download; the
  asset bot re-packed it without them, same bounds, the anchors held.)
- **molotov**: the rag drapes out of the neck (top 0.28) and down the side to 0.23; the
  flame sits on its middle, (-0.03, 0.27, 0). Bench `litmolotov` now uses it.
- **glass-panel**: its two glass meshes are the panes.
- **lab-door-single / -double**: re-packed by the asset bot with the leaves shut, each leaf
  node's origin on its hinge (swing = turn it about Y) and the prop's origin on the frame's
  middle; the mesh hangs on a "<leaf>-mesh" child. Their glass is a ROUND window on each leaf
  (a square of glass, the circle in its texture's alpha). So the door break learned windows:
  `DoorParts.panes` (`panesOf` marks them round from the anchors); a glass blow lands on the
  window nearest it, and the shatter takes that window's own rectangle, in its own plane,
  cut to its circle (`toEllipse`, teeth left round the rim) — the door and the other window
  stay. Before, a glass door shattered the whole doorway. Bench `labdoor`.
- **Barricades**: the plank break works only on planks `barricade()` makes (it knows each
  one's size and nails and fractures it along the grain), so doors keep the generated planks,
  fitted to each doorway. The bought planks, panels and metal sheets are for carried
  crafting items, piles and dressing, where nothing breaks.
- **pipe-bomb** (one mesh, no fuse) and the **Lazarus doses**: no effect asks for an anchor.
- fx-check **251**.

### Memory given back for the real rooms (2026-10-26)

The worst moment stood at 145.6 MB of the 150 budget, which left nothing for what the real
rooms will add. Where it went (scratchpad probe-mem.mjs): the gore kit 22.0 MB, the explosion
sheet 15.7, three flame sheets 30.6, smoke-candle 9.2, the blood pools 9.1, bullet holes 7.0.
- **The gore chunks' textures are 512² now** (`scripts/survivorz/fx-gore-mem.mjs`): meat,
  bone, brain and scalp were baked at 1024² for things 5-15 cm on screen. Only the KTX2 copies
  the game loads are re-encoded, from the 1024² PNGs, which stay the masters; the stump caps
  stay 512². **Rerun it after any gore rebuild** (gore-build.py writes 1024² KTX2s again).
  No visible difference in the head-shot and dismember scenes. Gore kit 22.0 -> 9.4 MB.
- **The worst moment is 133 MB now**: 17 MB of room for the rooms. The fire and explosion
  sheets are left alone (they fill the screen when they're used).
