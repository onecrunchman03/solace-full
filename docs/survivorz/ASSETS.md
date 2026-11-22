# SOLACE SURVIVORZ: the asset plan

Josh, 2026-10-20: *"lets make a plan to get everything we need textures,
assets, sound, animations wise before we start building anything."*

Everything the show needs is gathered, fixed, checked and approved **before
the facility is built**. That way the map is built from the real pieces and
never from stand-ins that get swapped out later. `GAPS.md` lists what is
missing for each action; this file says how each gap gets filled, to what
standard, from where, in what order, and for roughly how much.

## 1. The bar, written as numbers

"High quality" has to be checkable, or it slides into "good enough". Each
asset passes these before it is accepted.

**Models**
- Real-world scale, checked against a 1.8 m body on the bench.
- Clean geometry: no holes, no flipped faces, pivots where they belong
  (a door on its hinge, a gun at its grip).
- A prop the camera can get within a metre of: 2K textures. Anything else: 1K.
- Full PBR set: colour, normal, roughness/metal, ambient occlusion.
- Triangles: hero props ≤ 30k, ordinary props ≤ 8k, small clutter ≤ 2k. The
  facility's kit pieces are instanced.

**Textures**
- Nothing tiles where the camera can see it. Large surfaces get a second,
  larger-scale texture or decals to break up the repeat.
- Every surface has grime where grime belongs: edges, floors near walls,
  under hands.
- Compressed for the GPU (KTX2) at intake.

**Animations**
- Every action in the show has a move. Each move comes from a clip, is built
  in code on top of a clip, or is acted out and captured. "Built in code" is
  allowed only if it looks as good as a clip on the contact sheet.
- Retarget error under 10° at every joint (the bench measures it).
- No foot sliding on loops; hands meet the object they are using (a door
  handle, a keypad, a gun's grip).
- Every clip is looked at on a contact sheet before it's accepted.

**Sound**
- At least 3 takes of every sound that repeats (footsteps 6+), so nothing
  sounds machine-gunned.
- Mastered to one loudness, with the room's own reverb added at play time,
  not baked in.
- Josh previews every one before it is accepted.

**Performance budget** (§11: the 3090 Ti also runs the 26B)
- The render may use **about 4 GB of graphics memory in total**: textures
  ≈2.5 GB compressed, the rest geometry and frame buffers.
- ≤ 800 draw calls in any one view, 60 fps at 1080p (the stream test held 60
  with room to spare).
- Each zone's assets load only when a camera is in or near that zone.

**Licences**
- Commercial use allowed, a streamed show allowed, and exportable to glTF.
  No Unreal-only content.
- Every asset gets a line in a credits file (source, author, licence, link).
- **The assets only ever reach two places: the stream PC and the admin's
  Watch page.** They never reach a member's browser, so even
  no-redistribution licences (the zombie pack, the Halloween mocap) are safe.
  If members are ever allowed to watch inside Solace the way they watch the
  casino show, every licence gets re-read first.

## 2. What we need, by kind

### 2a. The facility: environment kits

One matched kit (or kits by one artist) for each of the facility's two faces,
plus our own branding.

| Set | What it must cover |
|---|---|
| **Clean labs** (above) | wall panels, ceiling grids with real light fixtures and vents, glass partitions, sliding lab doors, airlocks, a decontamination shower, a suit room, cleanroom floors |
| **Industrial** (below) | concrete, steel grating, catwalks with railings, pipe runs, cable trays, bulkhead doors, a tall generator hall, boiler, maintenance tunnels |
| **Lived-in** | bunk rooms, a canteen and kitchen, showers, a rec room, stores, offices |
| **Medical** | a ward, an operating room, quarantine cells, a morgue |
| **Security** | an armoury, a camera control room, holding cells, a checkpoint |
| **Containment + Deep Lab** | cryo tanks, specimen cells behind observation glass, a deep-lab centrepiece |
| **The tunnels** | MARTA-era concrete tunnels, rails, old signage |
| **The vault** | a blast door and its frame, the entry lobby |

**Made by us:** the Halcyon Biologics brand (logo, a stencilled signage
system, wayfinding, safety posters, badges), and decals (stains, scuffs,
blood, warning stripes). Plain PBR materials no kit covers come from Poly
Haven and ambientCG (both CC0).

### 2b. Set dressing (props)

About 250–350 different models across the eight zones: desks, chairs,
lockers, filing cabinets, computers and monitors, lab equipment (centrifuges,
microscopes, fume hoods, fridges), medical carts and beds, kitchen gear,
boxes, crates, barrels, trash, papers, mugs, clothing left behind. That is
the "frozen in time" clutter the references ask for. Most of it should come
with the kits; the rest from prop packs.

### 2c. Items survivors carry and use (each needs a model, a held pose, a use move and a sound)

| Group | Items |
|---|---|
| Melee | pipe, crowbar, fire axe, kitchen knife |
| Firearms | pistol, shotgun ✅, rifle, magazines, shells, casings |
| Light and comms | flashlight, batteries, walkie-talkie |
| Medical | bandage roll, pill bottle, med kit, syringe/antiviral, the Lazarus vial |
| Food and water | cans, energy bars, water bottles, camp stove, water purifier |
| Tools | hammer, planks, nails, keycards (3 tiers), lockpick, duct tape |
| Crafted | noisemaker, molotov, pipe bomb, a reinforced barricade |
| Worn | backpack (two sizes), holsters, a flashlight strap, bandages on wounds |

About 35 models.

### 2c+. Fetched to fill the asset check's gaps (2026-10-23)

These are the models fetched for the lines `ASSET-CHECK.md` marked **gap**.
Each is downloaded into `assets/downloads/survivorz/free/` (gitignored), opened
and measured, and logged with its licence and credit in `free/LOG.json`. The
picks are in `sourcing/free/free_gaps.json`.

**All of them are packed (Oct 23)**, together with every other model the asset check
names: 119 props in `assets/downloads/survivorz/props/<id>.glb` (gitignored), in real
metres, standing on the middle of their footprint, triangles cut to §1's tiers, textures
shrunk and KTX2-compressed. The tools:
- `scripts/survivorz/props-spec.mjs`: each prop's source, real size, tier and fixes (the one
  place to retune a prop).
- `scripts/survivorz/prep-inbox.mjs`: readies the BOUGHT packs from `assets/New Assets`
  (FBX converted, every texture bound by hand, Unreal's DirectX normal maps flipped).
- `scripts/survivorz/pack-props.mjs`: packs them (`--shard 1/3` runs three at once).
- `scripts/survivorz/props-bench.mjs`: renders each beside a 1.8 m figure into contact
  sheets in `props/review/` (serve the repo with `node scripts/serve-root.mjs 8793`).
- `props/props.json` (each one's size, triangles, textures, source, licence, credit) and
  `props/CREDITS.txt` (one line per asset, for the stream's credits).

The client's `loadGlb` reads their KTX2 textures once `initCompressed(renderer)` has run.

Things to know when placing them: several files are LAYOUTS rather than one object (the
chemistry set, the three hard cases, the fruit pack, the notepads, the paper scatter, the
military crate and its lid); the melee and first-aid packs share one texture atlas per
pack but each prop file carries its own copy; the lab microscope is rigged, so its
measured size reads larger than it renders; and the containment cell is plain outside
walls (the room is inside).

| Fills | Model | Author | Licence | Triangles | Note |
|---|---|---|---|---|---|
| a sink per safe room (wall basin) | [Unseen: Bathroom Sink](https://sketchfab.com/3d-models/6f5a66deecf348c1a6ebed0ce38b810d) | JmCVoyager | CC BY | 6384 |  |
| a sink (stainless utility / canteen kitchen) | [STAINLESS+STEEL+SINK+01032022](https://sketchfab.com/3d-models/3ae95cb6b7f44807b62a218cf20442bb) | mharadrian.mateo | CC BY | 18204 |  |
| a workbench per safe room | [Old Work Bench](https://sketchfab.com/3d-models/9fbc30ba31a546fe9370e6de2dcc0707) | Oliver Triplett | CC BY | 24890 |  |
| rags (crafting part) | [Filthy bar towel](https://sketchfab.com/3d-models/a6de2f8f64da47c98c4d135d4a67d8ac) | Trey M. | CC BY | 16896 |  |
| a fuel can (crafting part) | [Metal Jerrycan](https://polyhaven.com/a/metal_jerrycan) | Sean Buckley | CC0 | 20022 |  |
| a metal sheet (crafting, reinforced barricade) | [Rusted corrugated panels](https://sketchfab.com/3d-models/ea06568a9e304ecc806cb7cb0552e269) | Sousinho | CC BY | 6732 |  |
| wire (crafting part) | [Extension Cord Scan MEDPOLY](https://sketchfab.com/3d-models/c651f47533c8421f91954d0c9653278a) | EFX | CC BY | 29879 |  |
| the sample kit (its case) | [Hard Cases [assets lib]](https://sketchfab.com/3d-models/ce859ba7507148588262207255974aa4) | RPaciorek | CC BY | 8210 | no textures |
| the sample kit (test tubes) | [Test Tube Rack](https://sketchfab.com/3d-models/f09bcbfe529e4314a1acbf7b7d1e867f) | Harry Bond | CC BY | 1358 |  |
| the sample kit (scalpels) | [Pair of Scalpels](https://sketchfab.com/3d-models/219198b5a6a34f87bdc417e2706f9482) | Sousinho | CC BY | 2696 |  |
| the cold case | [Cooler Box](https://sketchfab.com/3d-models/2d02192c6be8434f9bb74de4e8a67ca4) | Guy in a Poncho | CC BY | 2778 |  |
| a facility computer terminal (logs) | [Abandoned Computer Terminal (Game Prop)](https://sketchfab.com/3d-models/1c56df74822a45b682899b0bc7dc2355) | olegolegperepelica | CC BY | 10426 | 8K texture to shrink |
| the vault override console | [Old Nasa Style Computer Console](https://sketchfab.com/3d-models/2250dde29597458a809ca96757afdc8c) | SUrusso613 | CC BY | 5624 |  |
| ammo boxes as pickups (rifle) | [Ammo Box](https://polyhaven.com/a/ammo_box) | DanKit | CC0 | 4382 |  |
| ammo boxes as pickups (pistol) | [Handgun Ammo Box REMAKE](https://sketchfab.com/3d-models/74871b58382a418ab310e6d22b1e263f) | jsandwich96 | CC BY | 1330 | brand printed on it |
| loose magazines (HK416, STANAG) | [30 rounds 5.56mm STANAG MAG](https://sketchfab.com/3d-models/1eadc947c0894aa0bbac0c6226a21bda) | GAMGO | CC BY | 2798 |  |
| loose magazines (pistol, 9 mm) | [Springfield handgun magazine 9 mm](https://sketchfab.com/3d-models/d67ba24047994963af90abcbf64db791) | Y2JHBK | CC BY | 16935 |  |
| loose shotgun shells as pickups | [Shotgun Shells](https://sketchfab.com/3d-models/1807bebe90c64dbaaf60d6de50eb0a3d) | creationwasteland | CC BY | 4416 |  |
| a belt worn on the body | [Tactical Belt "Falcon B1"](https://sketchfab.com/3d-models/fef926b200b34bb1bcdaeaa8b23bf00d) | Mayess | CC BY | 7486 |  |
| the kitchen knife | [Clean Chef / Kitchen Knife](https://sketchfab.com/3d-models/8706b77d20cf44169371de9e36fc6cda) | JackofSpades261 | CC BY | 10228 |  |
| fresh food in the canteen fridges | [Game Ready Fruit & Vegetable Asset Pack](https://sketchfab.com/3d-models/9846beef2c6b46caadc4a547a4dcd144) | Meerschaum Digital | CC BY | 29288 |  |
| fresh food (bread) | [Bread Roll (Game Ready / 2K PBR)](https://sketchfab.com/3d-models/3aa235f727a6456b8170e06a2138798c) | Meerschaum Digital | CC BY | 5560 |  |
| fresh food (apple) | [Food Apple 01](https://polyhaven.com/a/food_apple_01) | Oliver Harries | CC0 | 7012 |  |
| the specimen cells / cryo tanks | [Stasis / Clone Chamber (with animations)](https://sketchfab.com/3d-models/8738f78ae4ec4630ac35a4783303ea95) | TampaJoey | CC BY | 28528 | sci-fi styling; has an opening animation |
| the reinforced barricade (boarded panels) | [Wooden Barricades](https://sketchfab.com/3d-models/2838fd388f7b484b8039a0ef977fc866) | ANRUVAL_3D_MODELS | CC BY | 1964 |  |
| the reinforced barricade (planks across a door) | [Broken Wooden Planks](https://sketchfab.com/3d-models/4bdcd4875e9140018e4349f0b16cd474) | Crazy0_0Cat | CC BY | 80 |  |
| the quarantine cells (steel cell door with a window) | [Door Of The Solitary Cell Of The Prison 14MB](https://sketchfab.com/3d-models/23db3362debb4d98a56856416e1e9c58) | Mehdi Shahsavan | CC BY | 3228 |  |
| the holding cells (barred cell front) | [Prison cell door](https://sketchfab.com/3d-models/f8148fab4dc44903b9644170edf0e58c) | Rivaldragon | CC BY | 1544 |  |
| breakable glass partitions (framed glass panel and door) | [Door Glass And Upper Glass Window](https://sketchfab.com/3d-models/69c86384c1604727826f9a213886295b) | ILEDAS | CC BY | 1368 | no textures: needs glass and frame materials |
| specimen cells behind observation glass | [SCP-939 Containment Chamber](https://sketchfab.com/3d-models/02b85ff3fe884335b951e809fb7d2c44) | Yanez Designs | CC BY | 20536 |  |
| the far tunnels (concrete tunnel) | [Tunnel](https://sketchfab.com/3d-models/d4af744ae72d4eaa9dd9ddf8a8addfb0) | Helsingr | CC BY | 44568 | 44k triangles |
| the far tunnels (old rail tunnel) | [Metro Tunnel](https://sketchfab.com/3d-models/f7bdf8f84c544c2d97b50e3f2c44aefd) | edauretir | CC BY | 168720 | 168k triangles: decimate, or use as a kit piece |
| the maintenance shaft (duct sections) | [Ventilation Shafts (High Poly)](https://sketchfab.com/3d-models/fbb869af3b1a4355be510cdabd0d3ddc) | Ansh_Singla | CC BY | 82528 | 82k triangles: decimate |
| a gun sling (cut from this rifle kit's parts) | [M16A1 Customizable](https://sketchfab.com/3d-models/6c7b3cfdbd464871948a006fbdc88ab3) | DavidFalke | CC BY | 72086 | the sling is one of the kit's parts; cut it out, the rifle isn't used |
| Glenridge Hall: every tree in the wood | [Oak Tree](https://sketchfab.com/3d-models/caf081828df84d7cbb07b4107991facc) | BBARTS | CC BY |  |  |
| Glenridge Hall: the car on the gravel | [1967 Chevrolet Camaro SS 350](https://sketchfab.com/3d-models/c63097df8d39491583a5d734ecd65f2e) | adrianaflak09 | CC BY |  |  |

The **noisemaker** needs no new model: it is put together from the alarm clock,
a can and duct tape, all already downloaded.

### 2d. Characters

- **The six survivors:** done (Renderpeople scans). Needed: the **grime
  layer** textures (dirt, sweat, dried blood, building up over time) and
  **wound decals** for bites and cuts.
- **The 19 zombies:** done. To check: their 1K textures in close-ups. Any that
  fail get 2K re-bakes from the pack's own source files.
- **Experiment zombies:** the pack's coverall, hazmat and military bodies.
  To check: there are enough of them that the same face doesn't keep
  turning up. If not, more are made from the same bodies with a different
  texture.

### 2e. Animations: how each gap in GAPS.md is filled

| How | Moves |
|---|---|
| **More Mixamo downloads** (free; Josh downloads, as before) | walking/running with a flashlight, a heavy two-handed tool swing, hammering, a standing workbench craft, opening and pushing a heavy door, kicking a door, a jump-scare flinch, sitting on the floor against a wall, getting into and out of a bed, crying, a hug, kneeling over a body, coughing fits and shivers while standing, a stagger, injecting, bandaging, opening a can, a fireman's carry, a ladder climb, a vent crawl |
| **Built in code on top of a clip** (hands pinned to the real object) | the keypad press, the keycard swipe, working the shotgun's pump and loading shells, prying with a crowbar, holding a door shut, dragging a body (a ragdoll), the panicked look back over a sprint, lighting a molotov |
| **Paired moves, two bodies together** (the hardest) | a zombie's grab and the survivor's struggle, pulling a zombie off an ally, a bite on the neck or arm, a crawler grabbing an ankle, **a survivor turning into a zombie** |
| **Zombie additions** | pounding on a door or barricade (the Halloween attacks, cut up), climbing over an obstacle, a runner's lunge (checked against the Halloween clips) |

**The paired moves get special treatment.** Free libraries rarely have them,
and a grab that doesn't line up looks worse than none. In order of
preference:
1. A paid paired-attack pack, if one exists in a form we can export (looked
   for in step B below).
2. Josh and a friend act them out on a phone camera, and video-to-motion
   capture (e.g. Move One or Rokoko Vision) turns them into clips.
3. Built in code from single clips: the zombie's grab clip, the survivor's
   struggle clip, and both bodies locked to each other by the hands.

The turning has its own plan: a scripted sequence of the coughing-fit clip,
a collapse, the zombie stand-up clip, and the body texture blending from the
survivor's skin to grey over the last minute.

### 2f. Sound

Roughly 300 takes. On the earlier ElevenLabs rate (44 sounds for ~1,000
credits) that fits inside one month's 40,000 credits.

| Group | What |
|---|---|
| Footsteps | lab vinyl, concrete, steel grating, tile, water, vent metal; walk / run / sneak; shoes and boots |
| Firearms | pistol, shotgun, rifle indoors; the tail heard through walls; dry fire; every reload step; casings landing |
| Melee | swings; hits on flesh and bone; an axe in wood; a pipe on metal; a knife |
| Zombies | outside and experiment kinds: idle groans, alert screams, chasing breath, eating, banging on doors, clawing at barricades, dying |
| The facility | an air-handling hum per zone, the generator hall, distant machinery, airlock cycles (hiss, seal, shower), the vault door, sliding lab doors, fire doors, lights failing and coming back, PA chimes and alarms, keypad beeps, keycard accept and deny, terminals, dripping, pipes, the tunnels' rumble |
| Survival | hammering, furniture dragging, a can opening, a stove flame, a backpack zip, tape, a syringe |
| Bodies | each survivor's coughs, pained breathing and screams, in their own cloned voice where the voice model's tags allow |

One question for Josh: the Backrooms law is "all sound goes through
ElevenLabs". Recorded libraries made for games (the free Sonniss GDC bundles,
royalty-free) are often more realistic for guns, footsteps and doors.
Recommended: allow both, ElevenLabs first. Josh previews everything either
way.

### 2h. The score: ambience the director plays

Josh: *"Music will be controlled by the director. for example if survivors
are fighting zombies suspenseful music will play and if things are chill then
calm background ambience will play. we will focus on ambience not songs.
These need to be accurately and intelligently controlled for premium
immersion."*

**What we need to get:** layered ambient stems, not tracks. Each is a long,
seamless loop of about 2–4 minutes, made to sit together in one key and tempo
family so any layer can come in over any other:

| Layer | Plays when |
|---|---|
| **Calm** (2–3 variants, by time of day) | the base is quiet, people are talking, eating, sleeping |
| **Uneasy** | exploring, a noise nobody has checked, someone alone in the dark |
| **Suspense** | a zombie is near and unseen, a door is being forced, a chase is about to start |
| **Combat** | a fight is on |
| **Aftermath / grief** | after a fight, after a death, a funeral |
| **Zone colour** (one per zone) | a quiet tonal bed under everything: the labs' cold hum, the tunnels' low drone, the Deep Lab's pressure |
| **Stings** | first contact, a bite, someone going down, a death, a door breaking, the power coming back, a zone opening |

Sources, in order: ElevenLabs' music generation if the plan allows it, then
royalty-free ambient libraries. Josh previews every layer.

**How it's controlled.** This is the director's job and it is built as code,
not left to chance:
- **The music follows the shot, not the whole facility.** The stream shows
  what the camera director shows, so the score plays the tension of whoever
  is on screen. A fight in the tunnels doesn't score a quiet breakfast that's
  on camera; it gets a cut to it instead.
- **It rises fast and falls slow.** Combat comes in within a second or two
  of first contact; it lets go only after 20–30 s with no threat, through
  aftermath, and back to calm.
- **It doesn't flip-flop.** Separate thresholds for going up and coming down,
  and a minimum hold on every level, so a zombie stepping in and out of view
  doesn't toggle the music.
- **Changes land on musical boundaries.** Layers crossfade over several
  seconds, timed to the loop's own beat where it has one. Nothing cuts off
  mid-phrase.
- **Silence is a tool.** The music drops out completely the moment a
  survivor dies, and a sting carries the moment.
- **It stays under the voices.** It ducks under anyone talking on camera.
- **Night is quieter.** The calm layer thins after midnight in show time.
- **Josh can override it.** The control panel can pin a level, mute the
  score, or fire a sting.

### 2g. Effects

Muzzle flashes, sparks, blood sprays and pools, smoke, fire (the molotov), dust
in light beams, steam from pipes, water drips, flickering lights. Some exist in
the Backrooms and casino code and get raised to this bar. The rest are built.
**The full plan is `EFFECTS.md`.**

## 3. How every asset comes in

The same intake every time:

1. **Source:** found, bought or downloaded, its licence recorded.
2. **Inspect:** the existing `scripts/props/inspect.mjs` shows its tree,
   sizes, triangles, textures and clips.
3. **Fix:** scale, pivots, materials (the metallic-1 trap), any missing
   textures, the door hinge.
4. **Compress:** meshopt geometry and KTX2 textures, then measure the memory
   it really costs.
5. **Check on the bench:** under the show's own light, beside a 1.8 m body,
   with its contact sheet.
6. **Josh approves** from a review page: pictures for models, contact sheets
   for animations, a player for sounds.
7. **Catalogue:** filed under `assets/downloads/survivorz/` (gitignored), with
   its line in the credits file and in the manifest below.

**One manifest is the tracker.** Every action and every item in the show gets
a row in `docs/survivorz/manifest.json`: its model, its moves and its sounds,
each marked missing / sourced / approved. A small check script reports what's
still missing. **Building starts when every row is approved**, except
anything Josh explicitly says can wait.

## 4. The order of work

| Step | What | Gate |
|---|---|---|
| **A. Standards** | the numbers in §1 put into the bench; the review page; the manifest and its check script | — |
| **B. Sourcing pass** | a shortlist of 2–3 candidate kits for each environment set, prop packs, item packs and a paired-attack pack, each with pictures, price and licence | Josh picks |
| **C. The look test** | the picked kits make **one finished room** (the Vault Lobby): real kit, baked lighting, dressing, grime, two survivors and a zombie in it, its sounds, on the Watch page | **Josh judges it.** If it isn't good enough, that is the moment to talk about Unreal, before anything else is bought. |
| **D. The rest of the environment** | every set in §2a and §2b through intake | Josh approves zone by zone |
| **E. Items** | §2c: models, held poses, use moves | Josh approves |
| **F. Animations** | the gaps in §2e, paired moves last | contact sheets approved |
| **G. Sound** | §2f in batches of ~30, so the review stays easy | Josh previews each batch |
| **H. Characters + effects** | the grime layer, wounds, zombie checks, §2g | Josh approves |
| **I. Sign-off** | the manifest check shows every row approved | building (phase 4) starts |

Steps D to H can run side by side once C passes.

## 5. Rough cost

| What | Estimate |
|---|---|
| Environment kits (2–4 packs) | $60–200 |
| Prop and item packs | $30–100 |
| A paired-attack animation pack, or a month of video mocap | $0–50 |
| Sound (ElevenLabs credits already paid for; Sonniss is free) | $0 |
| **Total** | **about $100–350** |

Nothing is bought without Josh's okay on the specific pack.

## 6. Decisions (Josh, 2026-10-20)

1. **Budget:** about $100–350 is fine.
2. **Sound sources:** both. ElevenLabs first, plus recorded game libraries
   (Sonniss and the like). Josh previews every sound either way.
3. **Paired moves:** if no pack covers them, Josh and a friend act them out
   for video-to-motion capture. "That would be interesting."
4. **Watching:** admin-only for validation and testing until everything is
   built and checked; then YouTube live once Josh's hold is lifted. The stream
   is video only, so no licence is affected.
5. **Music: ambience, not songs, run by the director.** See §2h.
