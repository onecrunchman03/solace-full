# SOLACE SURVIVORZ — the design

Josh's next show (planned October 2026). Six AI survivors live in a sealed
biolab under Atlanta while the dead walk outside and inside it, streamed to
YouTube 24/7 for four weeks. This file is the design authority, the way
`SEASONS.md` is for the casino show. **Nothing in it is built yet.**

Marks: decisions are Josh's unless marked ✱ (Claude's, approved by Josh).

---

## 1. The show

- **Name:** Solace Survivorz.
- **When:** after the casino season ends. Every agent moves to this show; the
  casino regulars are not running at the same time.
- **Length:** four weeks, streamed live on YouTube 24/7 until it ends.
- **Rating:** age-restricted. The cast swears and jokes raunchily, as the
  regulars do; the content line (no sexual content with minors, without
  consent, with animals or within family) is held in code exactly as it is
  today.
- **No narrator, no confessionals, no viewer votes.** The story is told by the
  camera, what the survivors say to each other, and the on-screen graphics.
  YouTube chat is separate from the show and affects nothing.
- **Players can't enter.** The map is hidden from members; the admin can enter
  and fly it like any unopened level.

## 2. The lore

**The world.** An alternate version of our own. **G-Strain** escaped a secret
government lab, got into a suburb's water supply near Atlanta, took the city
within weeks and the world within months.

**Halcyon Biologics** ✱ was the government's contractor that ran the lab.
**The Foundry secretly funded it** ✱ — the same corporation that owns Solace's
casino and backs Async Research. Rollo is the only one who recognises the
marks, because he worked for Async. Nobody believes the man who crashed in an
escape pod.

**How the group formed** (Josh, 2026-10-22): the survivors found each other
in the city centre. Rick was the first to stand up and take control, and his
leadership got them out, so he has been holding them together since. Rollo
came later: his escape pod crash-landed in a city park, the group found him,
and he went along with them.

**Halcyon Site 9** is a megacomplex under Atlanta, reached through the old
transit tunnels. Running from the dead, the survivors found a vault door
standing open, rushed in and shut it behind them, which engaged the lock.
**It was opened from the inside days earlier** ✱ — somebody in the facility let
them in, and why is the show's first mystery.

**The facility still runs itself** ✱: lights on a schedule, lockdown
announcements, recorded safety messages. That's in-world sound, not a
narrator. Every recorded line is previewed by Josh like every other sound.

**The dead are two kinds:**
- **Outside zombies** followed the survivors' trail through the open vault
  before it shut. They're in the Vault Lobby, the Residential Wing and the
  tunnels from day one.
- **Experiment zombies** are Halcyon's test subjects, already inside, locked in
  Containment and the deep labs. They get out when the power or a lockdown
  fails. Faster, tougher, smarter at doors, with a G-Strain tint.

There is no unkillable stalker and no separate monster (Josh cut the Orderly).
Every zombie comes from the purchased pack (§9).

**The records** (Josh, 2026-10-23): ~40 across the facility — terminals
(emails, research files; Electronics 3/5/7 to log in, deeper = higher, or a
password note found elsewhere opens one with no skill), paper (notes,
clipboards, a diary; no skill) and audio recordings (previewed like every
sound). ~12 are **the Truth chain**; ~5 are the **Lazarus notes**; the rest are
colour, keypad codes, cache clues and the logs that give Claudia away. Reading
research files earns Science XP. **Knowledge belongs to whoever read it** until
they share it (a talk choice, usually at a meeting); if the only reader dies
first, the group loses it until someone reads it again. **What the audience
sees** of a record (or anything else) belongs to the **Stream UI layout plan**,
built once everything else is done; the game only records that it was read on
camera.

**The three endings** — all completable, all three can happen in one run:
1. **The Truth:** logs, recordings and files explain who made G-Strain, how it
   got out and why. ✱ It was a test that got away, run for the Foundry's
   buyers. The final file is in the Deep Lab. **It's reached** (Josh,
   2026-10-23) when someone has read the final file **and** the group has shared
   at least 8 of the 12 chain records between them.
2. **The Cure: Lazarus** ✱, a half-finished serum (Josh, 2026-10-23):
   (1) **the recipe** — the ~5 Lazarus notes, each read raising the final odds;
   (2) **the sample** — from an experiment zombie killed within ~1 minute,
   taken with a sample kit from Medical (someone goes into Containment on
   purpose); it lasts ~6 h out of the cold, indefinitely in a powered fridge or
   Containment's cold case; (3) **making it** — the Deep Lab bench, powered,
   ~2 h of work (can be split) by a survivor at **Science 7+**, the machines
   loud enough to bring the dead while the others hold the room; **3 doses**;
   (4) **proving it** — the safe way, the Deep Lab's analyser (another hour at
   Science 7+, certain), or the risky way, injecting an infected survivor:
   ~70% at Science 7, +10% per level above, +10% with all 5 notes read, and
   **a failure turns them on the spot**. The ending happens when it's proven
   either way; each remaining dose cures one infected person.
3. **Escape** (Josh, 2026-10-23): (1) **the route** — a log names a transit
   maintenance shaft to the surface a few kilometres up the line, with an
   evacuation point; someone has to reach the far tunnels (the crowbar on the
   pipe gallery's grate) and walk far enough to confirm it's open, so leaving
   is never a blind gamble; (2) **the override** — Security powered and someone
   in the control room arms it: a **60 s countdown**, then the vault stands open
   **90 s**, then shuts for good (the escape room's exit rule). The control room
   is a sprint from the vault: a fit, unhurt survivor who arms it just makes
   it, a wounded or tired one doesn't — who presses it is the scene; (3) **the
   run** — the tunnels beyond hold the outside dead, so the door isn't safety
   yet; (4) **the ending** happens when at least one survivor reaches the shaft.
   Each who makes it leaves the show alive, climbing out. Those who stay carry
   on, newcomers come when Josh says (six at most), and if everyone leaves the
   show ends early.

**The show ends** at four weeks, or earlier if nobody is left inside.

## 3. The facility

**THE QUALITY BAR (Josh, 2026-10-20, a standing law for the show):** *"i
dont want the cheap look of the backrooms maps i want full assets for
everything, i want good textures, assets, sound, animations for every action
… I expect high quality not good enough."* So the facility is **NOT** a
Backrooms grid map of boxes with tiling textures. It is a real 3D set: a
high-quality modular kit, PBR textures, decals, set dressing and baked
lighting, with a navigation mesh taken from its floor. The engine still
provides the world authority, AI, director, cameras and voice, and the ship
gate's checks still apply (placement, progression, behaviour, flycam,
Test play). **Every gap in animation, sound, models or textures is listed in
`docs/survivorz/GAPS.md` and gets filled, never papered over.** The
references and their verdict are in `docs/survivorz/REFERENCES.md`.

**Eight zones, EARNED, not scheduled** (Josh, 2026-10-22: "earn them"). A
zone opens the moment the group holds what its doors ask for (cards, power, a
crowbar); the calendar locks nothing. The weeks below are the pacing the
design hopes for ✱, which the director and the readouts measure against:

| Expected week | Zones | What happens |
|---|---|---|
| 1 | Vault Lobby, Residential Wing | find food, build the base, learn who's who, first deaths possible |
| 2 | Research Labs, Medical & Quarantine | the first log, the first bite, the medicine dilemma |
| 3 | Security, Power & Maintenance | the power comes back — and so does the containment breach |
| 4 | Specimen Containment, the Deep Lab | the endings play out |

A slow group may never reach the Deep Lab. That's allowed.

**Gating** reuses what exists: keycard tiers (Level 4's keycard), power
(Level 3's breakers), locked doors.

**The chain** (`src/survivorz/facility-map.ts`, Josh confirmed 2026-10-23):
stage 1 Vault Lobby + Residential (open; keycard 1 at the security desk) →
stage 2 Research Labs and Medical (keycard 1; keycard 2 in the glass offices) →
stage 3 Security (keycard 2; the vault override in the control room) and Power
& Maintenance (keycard 2, through the stores; the breakers) → stage 4
Containment (keycard 3; its power breaks the lockdown), the Deep Lab (keycard
3 + power) and the far tunnels (a crowbar on the pipe gallery's grate). Vents
let the nimble past some locked doors early. Three additions (Josh,
2026-10-23; doors.ts still to be updated for them):
- **Keycard 3 is on a zombie:** clipped to the security chief, who turned and
  wanders Security — a hunt for one particular zombie.
- **Limited power:** the generator runs **three zones at once** (the zones on
  emergency power don't count against it). The group chooses at the breakers,
  and switching means a trip to the Generator Hall — Medical for the fridges
  and equipment, Security for the override, Containment (which sets off the
  breakout)…; real arguments at the meetings.
- **The breakout is the price:** the cure and the truth both need Containment
  and the Deep Lab, so going for either lets the experiments out; escape
  doesn't, which is what makes "go now or stay" a real choice.

**The map is TO SCALE (v2, 2026-10-23)** — `facility-map.ts` keeps every room and door of
the draft chain and lays them out at real size on **three floors**: floor 0 (y 0) the clean
face — Lobby, Residential, Medical, Security, Labs; floor 1 (y −8) the guts — Power &
Maintenance west, Containment east; floor 2 (y −16) the Deep Lab and the tunnels. The floors
meet only at the Service Stairs (stores → generator hall), the Containment Stairs (security →
observation), the Freight Lift (cryo hall → the deep) and the pipe gallery's grate (a ladder
into the tunnel junction). 70 rooms, 73 doors, ~11,500 m². Added to make it a real building: a
Medical Hall with a pharmacy, exam rooms, the CMO's office and a staff lounge; a guard locker
room, an interview room and the security chief's office; a labs break room, conference room,
server room and lab storage; a workshop and pump room; sample storage; the director's office
and a service tunnel. **The Lazarus bench is in the Deep Lab** (the cure needs the deep's
power, the same trip as the truth). `layoutProblems()` refuses rooms overlapping on a floor
and any door without a wall its rooms share; the floor plans are drawn from the map by
`node scripts/survivorz/render-plan.mjs` into `docs/survivorz/plans/`.

**The grey box (2026-10-23)** is built from the map, never by hand:
`node scripts/survivorz/greybox.mjs` computes every wall (each shared wall once, as tall as the
taller room, every door cut where `doorPlacement` puts it), the floor and ceiling slabs, both
switchback stairwells, the freight-lift car and the grate's ladder shaft, as boxes in world
metres; it also bakes the **walk map** per floor (`src/survivorz/site9-walk.json`, 4 cells a
metre, a body's radius 0.3 m, run-length rows, plus the four links between floors). Then
`blender -b --factory-startup --python scripts/survivorz/greybox-build.py -- --renders` builds
`assets/downloads/survivorz/set/site9-greybox.{blend,glb}` (collections FLOOR_0..2, each with its
walls, floors by zone, stairs, door leaves and a CEILINGS layer; ROOM_/DOOR_/SPOT_ empties and
LIFT_CAR) and renders the review views into `docs/survivorz/plans/`. test-facility.mjs floods the
walk map from the vault chamber with every door open and fails if any room can't be walked to, or
a body doesn't fit through any doorway.

**THE VAULT LOBBY LOOK TEST (2026-10-23, docs/survivorz/ASSETS.md step C)** is on the Watch page
(Admin Panel → Survivorz → Look test): Reception, the Vault Chamber, the Security Desk, the
decontamination entry and the transit tunnel, dressed and lit, with two survivors and a zombie in
it and its sounds. The pipeline, all scripted (`client/src/survivorz/room/vault-lobby.json` is the one
list of what stands where — props, fixtures, decals, the cast — read by BOTH the bake and the page):
- `node scripts/survivorz/greybox.mjs` → each room's inside faces, cut round its doors.
- `node scripts/survivorz/room-bakeprops.mjs` → texture-free copies of the packed props, so their
  shadows are in the bake (Blender can't read KTX2).
- `blender -b --factory-startup --python scripts/survivorz/room-build.py -- --size 2048 [--preview]` →
  the shell with real materials (ambientCG / Poly Haven, metres-true UVs), the ceiling kit (Naked
  Singularity's own 15 m layout, twice over Reception, its coiled hoses dropped, merged by material),
  a Cycles bake of the shell's light (direct + bounced, OIDN-denoised; 4096 runs out of memory with
  the 26B model loaded), and `docs/survivorz/vault-lobby-anchors.json` for the effects (29 fixtures
  with banks, 8 vents, 6 pipes, panels, puddles).
- `node scripts/survivorz/room-pack.mjs` → KTX2 + meshopt, ~64 MB. **It must keep vertex attributes:**
  no material names the lightmap UV, and a plain prune deleted it (the room then lit itself only by
  its real-time lights and read as a dark box).
- `node scripts/survivorz/room-decals.mjs` → the grime: water-damage streaks are DRAWN (the ambientCG
  "Leaking" sets are wet-surface overlays with nothing in their colour), floor grime and smears from
  the grunge sets, a biohazard plate and hazard tape. Stains MULTIPLY what's under them.
- In the page (`room/lobby.ts`): the lightmap is flipped vertically (the glTF exporter flips V, the
  bake image isn't); the shell's real-time lights add only their specular (their diffuse is in the
  bake); panels light DOWN with spots (a point light under a panel lit the ducts into a haze); a
  fixed set of 10 lights + 2 shadow spots; bloom only above 3.5 (the baked floor reaches ~2.6); the
  props and bodies take a hemisphere fill (never the shell, see round two) in place of the bounce light they don't have. Dead
  panels stay dark; "failing" and "buzz" ones flicker by the effects' own `flicker()`. Measured:
  ~270 draw calls, ~0.7 M triangles, ~6 ms a frame. `window.__lobby` is the review hook.
- Sizes: the vault door is Dekogon's at its real size (frame 2.0 × 2.58 m, opening 1.07 × 2.12),
  so `DOOR_SIZE.vault` is the frame and `VAULT_OPENING` the way through.
- **ROUND TWO, EMERGENCY POWER (2026-10-24).** Reception keeps 4 of its 20 panels (`kit.dead`). The
  light comes from WALL FIXTURES: `kind: "emergency"` (the twin-head units, a warm spot aimed out
  and 50° down in the bake, a real-time warm spot in the page) and `kind: "exit"` (green signs, a
  faint green area light in the bake, glow only in the page). A wall fixture's `at` is the point
  ON the wall and `face` the way it looks; both builders stand it out by half its depth and turn it
  from its native front (the emergency unit faces +x, the sign +z). The units' own emissive maps
  mask what glows. Props may carry `rot` [x, y, z] (degrees, three's Euler "YXZ": tipped in their
  own frame, then turned) and are SETTLED onto their floor, for the knocked-over chair and planter.
  The layout's `tint` multiplies a shell material's colour (years of grime): the exporter carries
  it as the glTF base colour factor, so the bake and the page agree with no code in the page.
  THE HALCYON wall (`logo`): brushed steel letters, the ring mark and "BIOLOGICS", built from Barlow
  Condensed in room-build.py and exported in the room. The dressing: a round reception counter, three
  rows of beam seating, dead planters, a barricade of crowd barriers across the vault doorway, the
  survivors' camp by the counter, notice/safety/warning boards, a clock, a vending machine, a
  water cooler, dirt banked up every wall's foot (`dirt-band`, a decal that tiles), more leaks.
  **THE LESSON: the bake can be moody and the page still flat.** The hemisphere fill for props and
  bodies was ALSO lighting the shell, evenly, on top of the bake; the shell's shader now zeroes the
  irradiance before the lightmap is added (`lights_fragment_maps`) as well as the lights' direct
  diffuse. The fill is 1.1 now. Compare the page against `--preview`'s Cycles stills: if the page is
  brighter and flatter, something real-time is lighting the shell.
- **ROUND THREE, A WORKPLACE (2026-10-24; Josh: "this needs to look like people worked here.
  Number one rule: design and prop placement has to look realistic").** 30 more references in
  docs/survivorz/REFERENCES.md (41-70, with the verdict). The rules they set, as built:
  · **People walk in from the NORTH** (tunnel → vault → chamber → Reception → decon). So the name
  is on the SOUTH wall behind the counter, facing whoever walks in (`logo.face`), and the counter
  STRADDLES the security line: three badge turnstiles at the secure door, belt stanchions closing
  the line wall to wall and clipping into the counter, the staff side (copier, boxes, coat stand,
  a filing cabinet) behind it. The lounge (sofa, armchairs, coffee table, magazines, beam rows, a
  wall screen) sits by the entrance with the walking line clear. The guard room's desk faces its
  door, screens toward the guard, two chairs, phone, radio, the gate log, a key cabinet.
  · **The lore decides the mess** (LORE.md: Site 9 was sealed WITH its staff inside, and only
  Claudia opened the vault, days ago). So there is no survivors' camp in the lobby (they sleep in
  the safe rooms), and what's dropped belongs to staff who ran for the vault and found it shut:
  their bags at the vault door, a briefcase on the way. Paper spills near where it came from (the
  counter, the filing cabinet), never spread evenly. Exit signs only over ways OUT.
  · **The power is out, everywhere:** `powerOff` in props-spec.mjs (pack-props) darkens the colour
  map wherever a model's emissive map is lit and drops the glow (a dead PC showed a wallpaper),
  the page zeroes every prop's emissive (only the emergency units and exit signs glow), and the
  BAKE COPIES carry no emissive at all (room-bakeprops.mjs). **That last one was a real bug:** a
  bake copy lost its emissive map but kept its emissive factor, so the whole mesh glowed in Cycles
  and the turnstiles' LED skirts were baked as bright rings on the floor.
  · **Measure the model before placing on it:** the round counter is only a 1.1 m ledge ring
  (raycast in the page), so the receptionist's work desk is an office desk inside it at 0.787.
  Facings were MEASURED (a Blender front/top sheet per model), not assumed: beam seating and notice
  boards natively face −x, the armchair 35° off +z, the counter's opening sits at 135°, a tripod
  turnstile's body runs along the lane. The packed props are in the usual pipeline (22 new, gaps
  `coffee-mug` … `wall-tv` in find-gap-models.mjs, picks in free_gaps.json).
  · **Baking beside the AI model:** with the 26B loaded the GPU spills into system memory that is
  already committed and Cycles crashes (calloc fails); `--cpu` bakes on the processor (256
  samples, ~15 min) and the render textures are capped at 1K (the bake records light, not colour).
- **ROUND FOUR, THE DATE AND THE DOOR (2026-10-24; Josh: "you just do it").** The lockdown is
  **Thursday 14 May 2026, mid-morning** (LORE.md, [N]). `scripts/survivorz/room-art.mjs` DRAWS the
  printed things (SVG through sharp; Arial/Georgia, Barlow isn't installed for it): the Halcyon
  wall calendar on May 2026, crossed off in marker through the 13th with "fire drill?" on the 14th
  (behind the counter, and in the guard room beside the door he faced); the framed **Site 9
  charter** (record 1's words are a STAND-IN until the records are written) through props-spec's new
  `art` option, which swaps a frame's print material; the secure door's rule plates either side of
  its frame (authorized personnel · decon entry, two-person rule); a visitors' sign-in sign; and a
  "please wait until called" floor sticker. A walk-through **metal detector** stands on the middle
  lane 2 m before the gates. Frame glass is near-clear (it reuses the frame's texture and read as a
  dark sheet). **`powerOff` darkens anything the emissive map marks above ~48/255** (a screen glows
  at ~90 and the first threshold left it half lit), and lamps painted as plain colour need a `mat`
  fix (the detector's Red_Light / Green_Light). `--cpu` bakes are ~3 min when nothing else is
  loaded; **close the preview tab before baking** (the page holds the whole room in memory and the
  bake then fails to allocate), and the build falls back to the raw bake if the denoise comes out
  empty.
  · **The screening table** (ref 47): an office desk beside the detector with nested trays, one
  tray never collected (a badge and a notebook still in it), one knocked to the floor upside down.
  The trays are MODELLED (`scripts/survivorz/make-props.py`, props-spec `file:` src): nothing free
  fitted. NB a Blender base colour is LINEAR: a 0.32 grey came out near-white on screen; a tray
  grey is ~0.06.
  · **PAINT decals** (`paint: true` in the layout: lit, alpha-blended; stains multiply, plates are
  opaque): the vault door's swing marked on the floor, a quarter circle from the hinge (the
  texture's top-left corner is the floor's north-west corner) sized to the leaf, checked from above
  with the door opened into it; and a sprayed "VAULT DOOR · KEEP CLEAR · TWO-PERSON OPERATION ONLY"
  stencil on the chamber wall. The old hazard tape across the vault doorway is gone (it fought the arc).
  · **Tried and dropped: a hazmat suit lying by decon.** Every free suit is a person-shaped scan with
  no skeleton. Dropping one as Blender cloth exploded with self-collision (the decimated scan
  intersects itself at the fingers) and without it settled into a flat, melted lump that reads as
  goo or a body, not a suit. It needs a RIGGED suit to pose (or one modelled lying down).
  · **The survivors' tracks:** two trails of shoe and boot prints (room-art.mjs `prints`: a sole's
  silhouette with its tread, the arch and some grit missing, fading as the soles clean) from the
  vault through the chamber and across Reception to where Carla and Eric stopped. A floor decal's
  texture +x runs along world (cos r, -sin r); on the speckled terrazzo one pass vanishes, so those
  are laid twice. **Cobwebs** (an untidy sheet web, paint) sit in the upper corners of Reception,
  the guard room and the chamber: each wall's decal takes the corner at its texture's top-left
  (north wall: west end; west: south end; south: east end; east: north end).
  · Not yet: the dropped suit (above), a door leaf on the decon doorway (it's an open 0.9 m opening
  onto the lit tiled decon room, which fits day one).
- **THE LOOK, DECIDED (Josh, 2026-10-26).** Josh: *"This need to look like a multi billion dollar
  secret laboratory … where virus researchers went to work and stay days at a time … you need to
  wow the audience with design."* Rounds one to four read as a corporate office lobby (exposed-duct
  office ceiling, terrazzo, a wooden round counter, a sofa lounge, CRTs). His four answers:
  · **HYBRID BY DEPTH.** Where staff live and work is sleek high-tech: white/grey composite wall
  panels, glass, brushed steel, flush lit ceilings, backlit signage. The deeper it goes (power,
  maintenance, containment) the more it turns to raw concrete, steel and pipe.
  · **THE ENTRANCE IS A STAFF SECURITY HALL, not a reception.** No sofas, no magazines, no
  visitors' waiting. An armoured guard booth behind glass, biometric gates, a staff locker bank,
  the personal-effects check, then decontamination.
  · **CUTTING EDGE.** Flat screens and touch panels, biometric scanners, LED strips, sealed glass
  labs. No CRTs or beige office gear in the staff areas.
  · **UP TO ~$100 FOR KITS**, as a shortlist of 2-3 with pictures, price and licence. Nothing is
  bought without Josh's OK on the exact pack.
- **ROUND FIVE, THE STAFF SECURITY HALL (2026-10-26).** Reception was rebuilt from a visitors' lobby
  into a staff entry, with 20 more references (REFERENCES.md round five) and a plan Josh judges
  (`docs/survivorz/plans/hall-plan.png`, `scripts/survivorz/hall-plan.mjs`). The flow follows the
  real order of a high-security entry: arrive from the vault → screening (detector, x-ray) beside the
  guard booth → a glass line with speed gates at z 24.4 → staff lockers and step-over benches → the
  airlock in a dark portal under the steel HALCYON logo.
  · **THE SKIN IS GEOMETRY, NOT A TEXTURE** (room-build.py `hall_surface`, the layout's `hall`). It
  has five parts:
    - Walls float on a recessed dark plinth carrying a pale yellow-green photoluminescent egress line
      (#C8F07A, faint).
    - Composite panels 1.2 m wide stand 20 mm proud with 10 mm shadow gaps. The joints sit on the same
      1.2 m grid as the ceiling slots, because misaligned joints are what read as cheap.
    - A dark reveal at 3.0 m is the dead wall-wash slot.
    - One off-white covers walls and ceiling.
    - The ceiling drops to 3.6 m. It's seamless, stops 50 mm short of the walls, and is cut by 60 mm
      light slots at 2.4 m centres laid from x 60, so the middle one runs straight over the black stone
      runway.
  · **LIGHT, HYBRID BY DEPTH:**
    - The slots the layout lists (kind `slot`) are on the battery circuit. Each lit slot is its own
      `FIXTURE_s<i>` object that glows and flickers. The dead ones are shell, and are also the
      effects' vents.
    - Twin-head emergency units hang only beside the two big doors. They're the one visibly cheap
      retrofit in the room, on purpose.
    - Exit signs as before.
    - Down in the concrete chamber the caged lights and twin-heads stay.
  · **THE BUILT-INS** are the layout's `arch` list. Boxes go into the shell, so they take the bake;
    panes are `GLASS_<i>` objects, see-through and drawn last. The list covers:
    - The guard booth: clad lower walls, 40 mm armoured glass in steel-mullioned bays, a dark fascia,
      a roof, a door frame, the console inside, and the deal-tray ledge outside.
    - The glass line's steel channel and its 12 mm panes.
    - The black-glass site map, printed from the greybox itself (`paint-sitemap`, room-art.mjs) with
      only YOU ARE HERE in glow green.
    - Steel door surrounds.
  · **THE HALL'S OWN PIECES** come from `scripts/survivorz/make-hall.py` (each faces +z):
    - staff-lockers and staff-lockers-open (white laminate, flush doors, pull slots, number plates)
    - stepover-bench
    - device-lockers
    - flat-monitor
    - touch-panel
    - bio-reader
  · **THE FLOOR** is `own:hall-porcelain`, ambientCG Concrete031 graded to a light cool grey and
    polished (`scripts/survivorz/room-surfaces.mjs`; room-build reads `own:<name>` sets).
  · The ceiling kit no longer hangs over the hall (`kit.copies` is empty). Its light panel is still
    the model for the panel-flush fixtures.
  · **THE POWER SWITCH** (Josh: "the lighting you have it perfect, just have the option for lighting
    to be turned off and on"). `room-build.py` bakes the room twice into the same lightmap UVs:
    - "battery" (`lightmap.exr`, the blackout Josh signed off): the listed slots, the twin-heads and
      the exits.
    - "mains" (`lightmap-mains.exr`, `--no-mains` skips it): every slot at `MAINS_SLOT` and the
      twin-heads off. Non-maintained units go dark on healthy mains.
    - Every slot's diffuser is now its own object: `FIXTURE_s<layout index>` on the battery circuit,
      `FIXTURE_m<k>` mains only. The anchors carry `circuit`.
    - Lobby.ts's `mains` setter swaps the shell's lightmap whole, runs the fixtures through
      `fixtureLevel`, and raises the props' fill.
    - The look test has a "Power on (mains)" box. The game's power-restore moment flips the same
      setter.
  · **BOUGHT 2026-10-26** (prep-inbox.mjs + props-spec `bought()`):
    - The **x-ray scanner** (`xray-scanner`, 2.3 m, screen powered off) stands beside the
      detector, its tunnel along the walk.
    - The **biosafety cabinet** (`biosafety-cabinet`, real size) waits for the labs.
    - The **Modular Modern Chemical Research Laboratory** (`originals/inbox/chemicallab/`, 129
      FBX) also waits for the labs: wall panels, sliding doors with lock displays, ceiling
      lights and vents, benches, cabinets, instruments and test-tube racks. It ships UNTEXTURED
      (Unreal material colours; only screen emissives and decal masks), and its scale needs
      checking per piece (a stool measures 0.59 m), so it's a modelling kit to dress, not
      drop-in. Contact sheets come from `scratchpad kitsheet.py`.
    - The gate kit was NOT bought, so the **speed gates are modelled** (make-hall.py
      `speed-gates`): 5 stainless cabinets 120 mm × 1.4 m × 1.0 m, black glass tops with a
      reader at the entry end, dead LED strips, lanes 0.6/0.6/0.9/0.6, and glass wings shut.
      The lockdown locked them.
  · **THE LOBBY ZONE FINISHED (2026-10-27):**
    - The skin is per room now (the layout's `skins`, room id → settings).
    - The **security control room** behind the booth wears it under a 2.9 m ceiling with one
      failing battery slot. It holds a 4 × 2 camera wall (`video-wall`), a twin-operator console
      (`control-console`) and three 42U racks (`server-rack`). The supervisor's desk is kept,
      with flat screens in place of the CRTs.
    - The **decon entry** is the clean/dirty line:
      - a painted stop line (`paint-deconline`) under step-over benches;
      - a PPE wall of glove dispensers (`glove-dispenser`), a steel sink and red pedal bins
        (`biohazard-bin`);
      - the sealed lab door in the keycard opening, with its keypad and a reader;
      - a light grey cleanroom floor (`own:decon-floor`);
      - two sealed ceiling panels on the mains only. Panel-flush fixtures take `circuit` too.
  · **THE LIGHT, TONED DOWN (Josh, 2026-10-27: "lets make the lighting a little more realistic. its
    super bright").** The baked fixture powers came down across the board, and the mains slots'
    `MAINS_SLOT` went 320 → 115. Both states were rebaked. The client's fill is 1.0 in the blackout
    and 1.4 on mains.
  · **ONE PIPELINE, A ZONE AT A TIME.** `room-build.py --set <zone>` builds any zone from
    `client/src/survivorz/room/<zone>.json`: its shell, its anchors file and its room folder
    `rooms/<zone>`. The vault door is placed only where there is a `vault-chamber`. Puddles come
    from the layout. A layout's `styles` override the built-in ones. The client's `ZONES` (lobby.ts)
    and the look test's Zone picker say which zone loads; the residential wing is served as
    `roomres`. A zone's shots, zombie path, shadow spots and shadow catcher all live in its layout.
  · **THE RESIDENTIAL WING (zone 2, built 2026-10-27).** The layout is a program,
    `scripts/survivorz/layout-residential.mjs`; edit that, never `residential.json`.
    - **The rooms:**
      - the corridor (ceiling slots run along it);
      - the canteen: eight tables frozen mid-meal, a serving line and the window screen;
      - the kitchen: stainless and white tile;
      - the stores: fully stocked, because they meant to come back;
      - the safe room: two three-tier bunks, the water point, the air unit, the workbench and the
        team box;
      - two bunk rooms of built-in pods, with somebody's things in every berth;
      - the showers;
      - the rec room: the wing's one accent colour, teal;
      - the panic room: four made berths and a week of rations, built for a lockdown and never used.
    - **Its own models** come from `make-res.py`, built on the shared `make_lib.py`: canteen
      table and chair, servery, steel counter, prep table, shower stall, vanity, bunk pod, shelter
      bunk, air filter, water point and window screen.
    - **Free models:** 27 of them dress it (trays, bedding, clothes, a pool table and so on).
    - **The back of house wears graded scans, never raw ones** (`room-surfaces.mjs`). The raw
      Poly Haven scans read as a dirty brown basement, and ambientCG's "MetalPlates017A" turned out
      to be an octagon floor tile. The graded sets:
      - `shelter-floor`: grey epoxy;
      - `shelter-wall`: off-white painted block;
      - `steel-plate`: riveted plate, taken to grey;
      - `accent-panel`: the rec room's teal, coloured in the texture, because a tint over the
        white panel's mottle read as damp.
    - **Stocking a rack:** `stock(rack, rows)` fills a `shelving-steel`'s five shelves. The shelf
      tops are at 0.08 / 0.59 / 0.98 / 1.36 / 1.75 m, measured off the bake copy; the packed props
      use basisu textures, which Blender cannot import.
    - **The blackout:** in the blackout the corridor runs on twin-head battery units and exit signs.
      Each bunk room has a battery unit at both ends, and the gangway between the pods is lit.
      A mains-only ceiling slot takes its room from where it hangs (`roomAt`).
    - **No light through the walls** (`gap-back` in room-build.py). The stores' lamps glowed on the
      kitchen and canteen ceilings, through two holes:
      - a hall-skin wall's 10 mm panel gaps had nothing behind them;
      - a wall's top edge met the ceilings only at a hairline (separate faces sharing one edge).
      Every hall wall now has a dark body behind its panels, closing the plenum above the ceiling.
      Every wall also runs `UPSTAND` (0.3 m) past the ceiling line. Both are nearly invisible, so they
      take 0.12 × their share of the lightmap.
    - **The real-time lights stay in the camera's room** (lobby.ts `assignLights`). The look test
      adds `LIGHTS.points` real-time lights on top of the bake. They cast no shadows, so any that went
      to a fixture in the next room shone through the wall. That made the warm wash at the kitchen's
      and canteen's wall tops: it was never in the bake at all, as sampling the lightmap showed.
      - They are now a fixed pool of spots. The count is constant, so changing them recompiles nothing.
      - The pool goes to the working fixtures of the room the camera stands in, nearest first, and is
        re-handed on a room change and on the power switch.
      - A caged lamp's tube carries its own glow (emissive 3), since the spot under it no longer
        lights the cage.
    - **A dark floor hides the light that reaches it.** On battery the bunk rooms' floor got real
      light (0.13–0.49, sampled off the lightmap), but the carpet tint left about 5% reflectance and
      it read pitch black. The carpet tint is `[0.62, 0.64, 0.68]` now. Sample the lightmap before
      re-aiming a light.
  · **THE RESEARCH LABS (zone 3, built 2026-10-27; REFERENCES.md round seven).** Josh approved the
    residential wing ("looks awesome keep going"). The layout is a program,
    `scripts/survivorz/layout-labs.mjs`; edit that, never `labs.json`. The zone is served as
    `roomlabs`.
    - **The rooms:**
      - the corridor: resin floor, twin lines of light, a steel bump rail, and the glass fronts of
        the offices and conference room along its north side;
      - the break room: oak vinyl, the kitchenette, three tables and a sofa corner;
      - the glass offices: two private glass offices and six back-to-back desks, with keycard 2
        on the desk nearest the door and a chair knocked over;
      - the conference room: the long oak table, its whiteboard log and a dark screen;
      - the server room: an access floor, two rows of racks across a cold aisle, a CRAC unit, the
        UPS and cable trays.
    - **The entry sequence:** airlock → chemical shower → suit room, each room smaller and emptier.
      - airlock: stainless, with interlock panels and readers;
      - chemical shower: stainless, the nozzle frame, a wet floor and nothing else;
      - suit room: lockers (one open), four suits on a five-hook rail (one missing) and coiled
        air hoses.
    - **The labs:**
      - Clean Lab A, mid-procedure: two islands with service spines, instruments and bottles, two
        biosafety cabinets, the fume hood, freezers, the autoclave and hoses over the aisle;
      - Clean Lab B: the instrument lab, with the 2 m floor microscope in its bay;
      - lab storage: a row of −80 freezers, LN2 dewars, yellow flammables cabinets, gas cylinders
        and stocked shelving.
    - **Its own models** come from `make-lab.py` (benches, fume hood, −80 freezer, incubators,
      autoclave, dewar, air hose, suit rail, shower rig, conference table, kitchenette, CRAC, UPS,
      cable tray, flammables cabinet, stool). It also dresses **the bought chem-lab kit's
      instruments**: the kit ships untextured, so each material name maps to the house palette.
      The kit's fronts face +y, so they're turned 180°; check that on a four-side sheet. The
      **hung suit** is `pose-suit.py`, which poses the free Mixamo-rigged suit and drops the rig.
      **Aim bones at target directions, never by rotation signs**: the glTF armature's space is
      y up with +z the front.
    - **Glazing is a CUT-OUT** (room-build.py, layout `cutouts`). Every wall face on a line loses
      the rectangle, keeping the wall to either side and the lintel above. `glazing()` in the
      layout then fills it with panes, mullions every 1.2 m, head and sill channels, and a transom
      over each door.
    - **Door plates** come from `room-art.mjs` (`plate-<room>`): a number, the name, and a band in
      the room's containment colour (grey offices, blue IT, amber entry, red suits and labs, green
      storage). Pressure placards read −25 / −50 / −75 Pa down the sequence.
    - **THE BLOOM, TAMED (Josh, 2026-10-27: "still a little too much glow/bloom").** It was the bloom
      pass, not the bake: rendered with bloom off, the same shot was crisp. lobby.ts's
      `UnrealBloomPass` went from strength 0.3 / radius 0.2 / threshold 3.5 to 0.06 / 0.05 / 4.5. That
      leaves a faint halo on the fixtures and none on the room, in every zone.
    - **Surfaces** (room-surfaces.mjs): `lab-floor` white resin, `lab-wall` white epoxy,
      `vinyl-oak`, `raised-floor` (600 mm tiles); `stainless` is Metal009.
  · **MEDICAL AND QUARANTINE (zone 4, built 2026-10-27; REFERENCES.md round eight).** Josh approved
    the labs ("looking really good keep going"). The layout is `scripts/survivorz/layout-medical.mjs`;
    edit that, never `medical.json`. The zone is served as `roommed`. Two registers:
    - **The clinic, bright and expensive:**
      - the corridor and the hall: white panels, a steel crash rail with gaps at the doors, and the
        stretchers they brought the first infected in on;
      - the pharmacy: pick-bin shelving, the controlled-drugs mesh cage, a counter, and blister packs
        on the floor;
      - three curtained exam bays;
      - the CMO's office: its terminal still logged in;
      - the staff lounge;
      - the medical staff shelter: six berths, water, the air unit, the workbench and the team box.
    - **Where the first infected were treated, the mess grows:**
      - isolation: the watch desk faces the sealed cell through a laminated observation window;
        there's a pass-through hatch, two isolator beds, PPE and bins, a pressure dial, and a taped
        DO NOT ENTER — CONTAINMENT BREACH notice on the hall side of the door;
      - the cell: its bed inside an isolator tent, the IV pole down;
      - the ward: five curtained bays with headwalls and monitors; one bed rolled askew, one curtain
        gone, a cart tipped over;
      - the operating room: the table under a laminar canopy and twin lights, the scrub trough, the
        code cart dumped, instruments on the floor;
      - the morgue: stainless to dado, the body-storage bank, two downdraft tables, body bags, and the
        sealed cold store.
    - **Its own models** come from `make-med.py`: operating table, ceiling surgical lights, scrub
      sink, ceiling-track bed curtain, headwall, privacy screen, pharmacy shelves and cage, body
      bag, sharps bin, isolator tent, laminar canopy and pass-box.
    - **Free models (round eight):** monitor trolley, ECG monitor, IV pole, medical cart, exam couch,
      x-ray viewer, stretcher, morgue table, the morgue's fridge bank, and Poly Haven's wheelchair.
    - **Ceiling-hung pieces pack standing on y 0**, like the air hose. Place them at their real
      height:
      - the bed curtain at 0.3;
      - the headwall at 1.2;
      - the surgical light at `ceiling − 0.124 − its height`, under the canopy.
    - **A desk's front is its user's side** (monitors on its back edge). Two desks had their chairs
      behind the screens: the labs' private offices and the CMO's. Both are fixed; check every new
      desk.
    - **The breach notice is deliberately words-free beyond the order** (no scrawled message): the
      lore's records are Josh's to write.
  · **THE SECURITY WING (zone 5, built 2026-10-27; REFERENCES.md round nine).** Josh said "keep
    going" after the labs. The layout is `scripts/survivorz/layout-security.mjs`; edit that, never
    `security.json`. The zone is served as `roomsec`. Corporate-secure rather than raw: grey acoustic
    panels and carpet tile where staff sat, sealed floors and painted block where the guns and the
    detainees were.
    - **The corridor:** glazed into the chief's office on the north and the control room on the
      south. The guards held it from the medical door and lost it:
      - spent magazines and shells from the medical door to the control room;
      - a riot shield dropped and another propped against the wall;
      - chairs and a table dragged across the control room's door as a barricade.
    - **The control room:**
      - two video walls on the far wall;
      - two rows of consoles turned to them;
      - the supervisor's desk behind, with its incident log open;
      - the vault override on its own panel against the west wall.
      - Its screens are dark like every other screen.
    - **The armoury:**
      - six steel rifle racks along the back wall, every one empty;
      - the ammunition cage with crates and cans, one can dropped on the way out;
      - armour still on its hooks;
      - the cleaning bench with its yellow clearing barrel and a CLEAR ALL WEAPONS plate by the door;
      - blood down the wall beside the cage.
    - **The camera room:** recorder racks and a UPS under a cable tray, the monitor desk and its wall
      of screens, and archive shelving.
    - **Holding:**
      - a booking counter with the property bin;
      - three barred cells with block walls between them, each with a stainless bench and a
        toilet-basin combo;
      - the sealed Holding Cell 2 through the east wall, its light dead.
    - **The guard lockers:** banks along two walls, some doors hanging open, benches between them,
      armour on a hook rail, a shirt on the floor, and a duty belt and radio left on a bench.
    - **Interview and observation:**
      - the room is split by a partition with the observation glass in it;
      - the interview side has the bolted table with its cuff ring, two chairs and a camera in the
        corner;
      - the observation side has the recorder (the interview-recorder log), a chair knocked over, and
        a failing light.
    - **The chief's office:**
      - glass to the corridor;
      - the desk facing it;
      - the files behind;
      - two commendations;
      - the level-1 map pinned to the west wall, with red pins where it went wrong (drawn from
        `set/greybox.json`, no writing on it — the lore is Josh's).
    - **Its own models** come from `make-sec.py`: the weapon rack, the gear rail (hooks at 1.62, so
      place it at y 1.62), the interview table, the cell bench and the cleaning bench with its
      barrel.
    - **Free models (round nine):** armour vest, riot shield, tactical helmet, the prison toilet,
      duty belt and handcuffs. The wing's guns stay the game's (Josh's bought pack), never set
      dressing.
    - **A CEILING LIT ONLY BY BOUNCE NEEDS 8192 SAMPLES.** The medical hall's ceiling came out
      cloudy at `--samples 2048`. A probe of its lightmap texels (raw against denoised) measured the
      grain: about 15% of the ceiling's brightness. The denoiser smoothed only part of it, and the
      rest stayed as blotches. Two suspects were tried and changed little:
      - adaptive sampling (now off);
      - the floor's reflective caustics (now off; neither is visible in a lightmap).
      Raising the sample count is what fixed it: at 8192 the noise is about a third, and the ceiling
      reads clean. Medical and security are baked at `--samples 8192`; use that for any zone with a
      long light-slot hall.
  · **POWER AND MAINTENANCE (zone 6, built 2026-10-27; REFERENCES.md round ten).** Josh: "look good
    keep going" after security. The layout is `scripts/survivorz/layout-power.mjs`; edit that, never
    `power.json`. The zone is served as `roompow`.
    - **It's the first zone on floor 1, 8 m down.** The layout's `put` adds each room's own floor
      height, so a prop at y 0 stands on the plant floor. Fixtures, plates and shots are written with
      `F` (−8).
    - **Raw and industrial:** sealed concrete floors, painted block to 1.6 m and bare board-formed
      concrete above, the slab overhead.
    - **The colour is in the kit, as round ten says:** blue gensets, orange fuel, green water, red
      fire, yellow rails and hazard paint.
    - **The service stairs:** the map's own flights and landings (`set/greybox.json`'s stair boxes)
      built in steel plate. The wall between the flights is painted block, with a steel balustrade
      up the open side and hazard paint on the top landing's edge.
    - **The generator hall:**
      - three standby gensets in a row, GEN 1–3 stencilled on them, each with its orange day tank
        behind;
      - keep-clear hazard lines in front of the sets and painted walkways from the stairs' doorway;
      - along the south wall, the switchboard, then **the five zone breakers** (labs, medical,
        security, containment, deep), each with its name on its label frame and its handle down,
        under the high-voltage warning;
      - the generator-log terminal on a desk in the corner, with its chair tipped over;
      - diesel stains under GEN 3.
    - **The catwalks:** a yellow-railed catwalk along the west wall with a ladder up, pipe racks,
      cable trays overhead, and the safe room's door.
    - **The maintenance crew safe room:** the house shelter: six berths, water point, air unit,
      workbench, team box and stocked shelving. Its two caged lights are on the battery.
    - **The boiler room:** two fire-tube boilers with red burners, their flues up through the slab,
      pipe racks, a valve, the toolbox, and the sealed lockup's door. The lockup has shelving and a
      dead light.
    - **The workshop:** two benches, tool chests, racks, cylinders, a ladder, a hand truck, and a
      prep table with a hammer, tape and a crowbar on it.
    - **The pipe gallery:** colour-coded pipe racks along both walls for its 40 m, the big main on its
      stands down the east side with gate valves, a handwheel, and the maintenance grate to the
      tunnels between hazard stripes.
    - **The pump room:** three blue pumps with their valves, a pipe rack, the pressure set, a control
      cabinet, the locker, and a wet floor.
    - **Its own models** come from `make-power.py`: genset, day tank, breaker cabinet, boiler, pipe
      rack, pipe main, catwalk section, floor grate and a steel stair flight.
    - **Free models (round ten):** the switchboard, a control cabinet, the centrifugal pump, the pump
      group, a gate valve and a rusty handwheel. NB the switchboard and the control cabinet face +x
      in their own files; the layout turns them (`FRONT` in `layout-power.mjs`).
    - **A CAGED LIGHT CAN NOW BE ON THE MAINS.** `room-build.py` dropped the `circuit` of every
      caged fixture, so all of them were baked into the battery lightmap. The plant's high-bays
      therefore stayed lit in a blackout. They carry `circuit: "mains"` now, and only the shelter's
      and the emergency units light the battery state. Residential's caged lights never had a
      circuit and are unchanged.
  · **SPECIMEN CONTAINMENT (zone 7, built 2026-10-27; REFERENCES.md round eleven).** Josh: "looks
    goode keep going" after power. The layout is `scripts/survivorz/layout-containment.mjs`; edit that,
    never `containment.json`. The zone is served as `roomcon`. It's on floor 1, like power: `put` adds
    the room's floor height.
    - **Two finishes, as round eleven says:**
      - sleek where staff watched (carpet tile and dark panel on the deck; white epoxy and stainless at
        the cells);
      - steel and painted block in the cryo hall and the stairs.
    - **The containment stairs:** the map's own flights in steel plate, the same as the service
      stairs.
    - **The observation deck:** kept dim on the watching side. Two consoles sit under the window onto
      the cells. The observation terminal is on its desk behind them, with lab coats, files and a
      whiteboard. The printed LOCKDOWN notice and a pressure dial hang by the cell block's door.
    - **The specimen cells:**
      - a viewing corridor with a hazard line along the glass;
      - four cells, each 3 m wide, behind laminated fronts with a vision panel, a food hatch and an
        interlock lamp, numbered CELL 01–04;
      - inside each, a bolted restraint bed (one strap cut), a drain and a camera;
      - cell 2's glass is smeared from inside;
      - a supply alcove and the passage to sample storage;
      - suits on the wall and yellow air hoses coiled from the ceiling.
      The cells are sealed. What was in them is the game's.
    - **Sample storage:** a −80 freezer farm, LN2 supply dewars, and racked sample and cold cases.
    - **The cryo hall:**
      - fourteen cryostorage dewars in rows, numbered 1–15 with no 7, because Pod 7 is its own room;
      - their level controllers face the aisles, and step-ladders lean on two of them;
      - LN2 supply and pipe racks on the east wall;
      - the cryo terminal on its console in the middle;
      - yellow aisle lines to the freight lift's door.
    - **Cryo Pod 7:** one pod (the sci-fi stasis chamber) in a steel room, its single light failing on
      the battery.
    - **Its own models** come from `make-con.py`: the cell front, the restraint bed and the cryo dewar.
    - **A missing decal no longer stalls a zone.** The first load stuck at "the grime" because three
      dewar plates didn't exist yet and the decal loader awaited all of them. A texture that fails now
      skips its decal, with a console warning.
  · **THE DEEP LAB AND THE TUNNELS (zone 8, built 2026-10-27; REFERENCES.md round twelve).** The last
    zone. The layout is `scripts/survivorz/layout-deep.mjs`; edit that, never `deep.json`. The zone is
    served as `roomdeep`. It's on floor 2, 16 m down, except the freight lift, which spans floors 1 and 2.
    - **The freight lift:** the car is parked at the top (where the map's lift platform is, floor 1),
      with its lattice gate half drawn toward the cryo hall. Below it is the raw shaft, the lower gate
      onto the deep corridor, and the capacity stencilled on the wall.
    - **The deep corridor:**
      - pale painted concrete with cable trays down both walls and a yellow lane;
      - a teal wayfinding stripe that ends at the Research Suite's door;
      - a drench shower, a suit and a dropped hose at the threshold.
    - **The deep lab (the Research Suite):** a white clean box under a grid of panels.
      - The key bench (`lazarus-bench`) is in the middle: the work on it, the binder of the final file
        left open, the deep terminal.
      - Biosafety cabinets, a fume hood, incubators, an LN2 dewar, the cryo-EM and wall benches stand
        round the walls.
      - The suit wall is by the door, and air hoses coil from the ceiling.
      - A glass wall looks into the director's office.
    - **The director's office:** the only warm room: walnut walls, a dark marble floor, the desk turned
      to the glass. The lamp is on and a bottle is out. The briefcase is open, and a drawer of the
      filing cabinet is pulled out.
    - **The tunnel junction:** the caged ladder from the plant's grate between two steel posts, pipe
      bundles, a sealed bulkhead door, stencilled tunnel IDs, a dripping puddle.
    - **The service tunnel:** a concrete box with pipe racks down one wall, a line of caged lamps with
      gaps, and water along the base.
    - **The far tunnels:**
      - the old city's brick, ribbed every 4 m;
      - a 1920s shopfront the viaducts buried;
      - the low end flooded;
      - an old utility plan of the level (the `tunnel-route`) pinned to the wall. It's drawn from the
        map with no writing but its sheet title.
    - **Its own models** come from `make-deep.py`: the freight car, the caged ladder, the bulkhead door
      and the shopfront.
    - **New surface sets in `room-build.py`:** `walnut` (Wood049), `marble-dark` (Marble021) and
      `brick-old` (Bricks085).
  · **THE LEFTOVERS, CLOSED (2026-10-27, after all eight zones).** Josh: "keep going".
    - **The lab microscope was never invisible: it was drawn at the world origin.** `microscope-lab` is a
      skinned mesh (its focus parts are bones). The look test cloned props with a plain
      `Object3D.clone`, which leaves the copy bound to the original's bones, and those bones sit at the
      origin. `lobby.ts` now clones props with SkeletonUtils, and the microscope stands on the deep
      lab's key bench, where it was reserved. Any other skinned prop is covered too.
    - **Residential has its door plates** (R-200–R-216, the shelter's in green) and three generic
      notices: quiet hours on the bunk-room doors, the laundry, and the kitchen's rules. NB the
      residential layout used to keep its previous output's decals wholesale (`prev.decals ?? decals`),
      which dropped anything new. It now keeps anything placed by hand and adds its own plates.
    - **The labs got their mess:** papers and a folder off the office desks, a chair rolled over, a
      mug knocked over in the conference room, a clipboard and a dropped tube rack in the clean labs,
      an ID card and shoe prints in the corridor.
    - **The containment stairs' still** now looks up the lower flight to the half landing.
    - **Still deliberately undone:**
      - the server racks' LEDs: every screen and LED is dark by design until power events exist;
      - door leaves: doors are the game's;
      - the panic room's flush panel: its door is the game's as well.
- Not in it yet: nothing held in a hand (the grip calibration is the animation session's and isn't a
  game module), the effects wired to the anchors (F7, theirs), fixtures' power events.

**The facility file** (Josh approved the method 2026-10-22: the set is built in
Blender and exported with a facility file + a walk map per floor). Agreed with
the effects session, 2026-10-23:
- **A room's key is its id in `src/survivorz/facility-map.ts`** (kebab-case,
  stable: `security-desk`, `generator-hall`, `safe-power`). Everything
  persistent (blood, scorch, debris, wounds on the dead) is keyed by it.
- **A room's local origin is a `ROOM_<id>` anchor** at its floor's min-x/min-z
  corner, floor height 0, axes aligned with the world (x east, y up, z south).
  A rebuilt room keeps its anchor, so a mark stays put. Until the set exists
  the origin is the schematic `rect.x/rect.y`, y = 0.
- **Door state lives in `DoorState` (doors.ts) and nowhere else**; effects read
  it. To add when built: an explicit `planks` count and a `reinforced` flag (a
  reinforced barricade's planks hold 200 and have their own look), both carried
  in door events.

**Events the server sends to the effects** (each with `seed` + `t`, world
metres): `zone.dip {zone, dur?}` (a brownout, default 1.6 s, power never off) ·
`zone.powered {zone, on}` · `pipe.burst {at, normal, floorY?}` (vents ~18 s,
weeps 30) · `thing.fell {at, from?, scale?, floorY?}` · `vault.open` /
`vault.shut {at, normal, size}` · `fire.spread {from, to}` (a flame front along
spilled fuel) · `fire.door {door}` (fire filling a doorway) · door events with
`planks` + `reinforced`.

**What the effects hand the world to keep** (Josh, 2026-10-23: damage lasts the
whole show, a renderer restart included; the effects build the records, the
show's store keeps them). Two kinds. **The room's remains** — blood, scorch,
wreckage, chunks of meat and severed limbs — come as rows from
`FxLedger.onRow` (room-local, keyed by room id); `restore(rows)` puts them back
quietly. **Bodies** belong with their entity: a survivor's `BodyLook.ops` (every
wound, cough, bleed, bandage, seep, burn and look change, ~1 KB, streamed
through `onOp`, starting over at a clean) replayed with `replay(ops, now)`; a
zombie's `Cuttable.state` (its look and each cut with its stump, ~500 bytes)
put back with `restore(state)`. Times are the show's clock (`look.time`).
A survivor in a suit (Rollo) reads `look.suited`: his face shows through the visor and turns
like anyone's, but his mouth is behind the respirator, so the game never plays a cough's blood
spray for him (`coughedBlood` already refuses him). He's still HEARD: survivor.* events carry
`suited: look.suited` and the sound engine muffles his voice through the respirator (§10b) —
the cough stays a noise the zombies hear.

**Special rooms:**
- **Three safe rooms** (Josh, 2026-10-22), one per stage: the Residential
  Wing's (the first home, open from day one), one by Medical/Security, one in
  Power & Maintenance — the later two are found and opened as forward bases.
  **Zombies can never enter one** (server-enforced: the room's floor is
  forbidden to them and its door can't be broken); they gather and bang at the
  door for a while, then lose interest. Each has **six beds** (sleep happens
  only in a safe-room bed), a **sink** (the only working water), a
  **workbench** and a **team storage box** for key items, food,
  tools, ammo and guns. **The boxes are LINKED**, Resident Evil style: every
  box opens the same storage. Every item in or out is logged with who and
  when (the altruism gene on screen, Dale's painkillers, the death reports).
  **The one way danger gets in:** an infected survivor can turn inside, and
  the group has to deal with it.
- **Six survivors at most, at any time** (Josh, 2026-10-22).
- **Six sealed rooms** ✱ where newcomers are found (§6).
- **Vents**: crawl routes only survivors with nimble 7+ fit through.
- **Loot containers** (lockers, desks, freezers, medical cabinets), placed by
  the placement law; scarcer and better the deeper the zone.
- **Terminals** holding the logs (the lore-drive system, re-dressed).

**What the references require** (REFERENCES.md): two faces (clean labs above,
industrial guts below), people lived here (canteen, bunks, stores), every lab
entrance a sequence (airlock → shower → suit room → lab), stencilled room
names on every door, frozen-in-time clutter, the scale of a town, every light a
real fixture, MARTA-era tunnels.

## 4. The cast

All survivors are Renderpeople scans on **one 88-bone skeleton**, so one bone
map plays the whole animation library on every body. Stats are fixed per body
(1–10); genes (§7) move behaviour within them.

| Survivor | Body | Combat | Nimble | Thinking | Creative | Who they are |
|---|---|---|---|---|---|---|
| **Johanna** | Carla | 2 | 8 | 6 | 6 | lost her husband at the start; would give up but for an impossibly strong survival instinct. Compassionate, deep, perceptive, goes out of her way for others |
| **Dale Hutchins** ✱ | Nathan | 6 | 6 | 6 | 4 | 30s paramedic whose partner turned in the back of his ambulance. Calm, dark humour, burned out. Controls the medicine — and quietly keeps painkillers for himself |
| **Ben** | Manuel | 5 | 6 | 3 | 9 | football bro who never made college ball, chip on his shoulder, wildly creative |
| **Rick** | Eric | 9 | 5 | 7 ✱ | 6 ✱ | a cop whose last day before retirement was day one. Charming, resourceful, a moral compass and a leader |
| **Sarah** | Sophia | 1 | 9 | 5 | 5 | naive, fresh out of college, flirts to get the men to do things for her |
| **Rollo** (or the casino season's winner) | a realistic hazmat suit in his casino purple (SKP_GAMES, CC-BY) on Eric's rig — §10 | 5 | 7 | 4 ✱ | 5 ✱ | the casino's champion; escaped the zombies pouring onto the floor in an escape pod and crash-landed in Georgia |

Tyrell was cut (no body fit); Dale took his seat.

**Starting relationships** ✱: Johanna protective of Sarah and trusts Rick;
Ben wants Rick's approval; Rick leads and distrusts Sarah's games; Sarah works
on Ben, resents Johanna's mothering; Dale is everybody's medic and nobody's
friend; Rollo is the odd one out. **Conflict is written around personality
(leadership, trust, pride), never race.** The character sheets describe who
they are, not their ethnicity.

**Voices** (ElevenLabs Voice Design, picked by Josh, cloned locally on
slopbot): Johanna take 2, Dale 1, Ben 2, Rick 1, Sarah 3 — files
`survivor-<name>.mp3` in slopbot's voice folder. Rollo keeps queens-1.

**Looks.** Everyone arrives in clean office or weekend clothes. Two fixes, in
code: a **grime layer** (dirt, sweat and blood that build up with time and
every fight) and **attached props** on the bones (backpacks, holsters, a
flashlight strap, bandages on wounds).

## 5. The rules of survival

**The principle: game code decides, the language model talks.** Pathfinding,
eating, fighting, fleeing, looting and sleeping are code. The model writes
what they say, picks from short choice menus, and reflects on the day for
memory.

**How a survivor decides — four layers:**
1. **Reflexes** (code only, several times a second — the model never decides
   these, it only voices them, Josh 2026-10-22): weigh the threat (how many
   zombies they know of and how close; a runner or experiment counts for more
   than a shambler), themselves (health, stamina, weapon, ammo) and help (allies
   near) → **fight, back off** (retreat while fighting, toward a doorway or the
   group), **hide** (still, crouched, light off) or **run** (to the nearest safe
   point). The genes set the lines (genes.ts: `fleeHealth`, `fightOdds`,
   `goBackChance`). **PANIC** (Josh, yes, rare): at maximum fear a survivor can
   lose control — freeze in place or bolt the wrong way (the agony move). More
   likely with high self-preservation and low caution, tired or alone; an ally
   close by snaps them out of it.
2. **The current job** (code; the model only talks while they do it — Josh,
   2026-10-22): **supply run** (looting, sneak), **explore** (nimbleness,
   sneak), **research** (science, electronics), **fortify / repair**
   (mechanics), **craft** (crafting), **treat the wounded** (first aid),
   **guard / watch** (shooting, melee), **rest / sleep** (a safe-room bed; the
   6-in-24 rule forces it). Each job is scored on what the GROUP needs now
   (food days left, ammo, the hurt, unopened doors, unread logs, barricades,
   sleep debt) × what this person is GOOD at (skills) × what they LIKE (genes:
   curiosity → explore/research, caution → base jobs, sociability → jobs done
   together); the best wins. The group's plan normally hands jobs out; this is
   the fallback. **Preferences win sometimes** over the best-skilled choice
   (Ben insists on the run to prove himself). **Going alone is allowed** when a
   survivor's genes push that way — far more dangerous, and the low-morale rule
   still holds.
3. **The group's plan** (Josh, 2026-10-22): no set hour — a **meeting** happens
   when the group is together, awake, in a safe room and something needs
   deciding: after the main sleep, when a run gets back, after a crisis (a
   death, a bite, a zone opening), when supplies drop below a line, or when
   someone's model asks for one. It decides the teams, who stays and does what,
   the sleep rota and night watch, and the big calls (quarantine, moving to a
   forward safe room, going for an ending). Code builds two or three plans; the
   **leader proposes** one in their voice; each survivor accepts or argues
   (`acceptPlan`, `proposeChance`); an assertive one may make a **counter-plan**.
   **A refuser does their own job** (layer 2), alone if need be, at a small cost
   in trust both ways. **Leadership changes by following, never by election:** a
   counter-plan with more people behind it than the leader's leads that call,
   and whoever keeps winning becomes the leader.
4. **Talk** (the model), with the regulars' pacing, freshness and safety
   checks (Josh, 2026-10-22/23). Whoever is in earshot, one speaker at a time
   per spot. The model is handed the FACTS (who's hurt, the storage, what just
   happened, its genes, skills, pair trust, memories) and never invents one.
   **Off camera, only exchanges that change something** (a meeting, a
   confrontation, comforting, a secret) are written — as text, into their
   memories; small talk is on-camera only, which keeps the four slots on what
   viewers see. **They may lie:** code tells the model the truth and what it's
   hiding (Dale's painkillers), the honesty gene sets how willing it is, and a
   lie found out (a search, a log, a witness) is caught by code and costs trust
   hard. **Memory:** notes on each other person, and a short diary before the
   main sleep. **Walkie-talkies** (carried): one shared channel across the
   facility; zombies near a receiver hear it unless it's turned down; batteries
   run down.
   **Talk changes the game ONLY through choices code checks** (Josh,
   2026-10-23, locked; the regulars' rule): after a conversation the model
   picks from a menu code built of what's possible right now (give, ask,
   trade, confront, comfort, apologise, follow, refuse, share a secret, accuse,
   stand watch for someone…), and code carries it out and decides whether it
   lands (trust, generosity). Words alone move nothing — so the world can't be
   talked out of its rules, a broken promise is a real lie, the genes keep
   mattering, the simulator can run without the model, and the death reports
   point at recorded choices. Menus grow when we see them reaching for
   something that isn't there.

**Hard survival rules the model can't override** — the "real survival
instinct": flee below a health line, never wander alone below a morale line,
always keep a route back to base. Genes move where those lines sit.

**Needs** ✱ (starting dials, tuned in the simulator):
- **Hunger** (Josh, 2026-10-23): the meter fills faster running or fighting
  (×1.5), slower asleep (×0.5). **Hungry** at ~8 h (slower stamina, morale
  falls); **starving** at ~24 h (health drains, morale drops hard, worse aim
  and decisions). **Starvation never kills on its own:** health drains to 25%
  and stops — the zombies finish it. A can or ration pack is one meal, an
  energy bar half; 2-3 meals a day. Eaten as found, no cooking.
- **Food is deliberately short: ~22 days for six over 28** (~420 meals
  needed). Lobby + Residential ~7 days, Labs + Medical ~4, Security + Power ~5,
  Containment + Deep Lab ~2, hidden caches (looting finds them) ~4. The
  shortfall pushes them deeper, makes the storage a dilemma and escape tempting
  late. **Fresh food** in the canteen fridges (a small amount) spoils in a few
  days unless the power is back; canned food lasts forever.
- **Thirst** (Josh, 2026-10-23): **thirsty** at ~6 h (slower stamina),
  **dehydrated** at ~16 h (health drains, worse aim and thinking); faster
  running or fighting. The same 25% floor as starvation. **Water comes only
  from the safe-room sinks** (which never fail) and bottled water found on
  runs — no other sink or fountain works, so getting back is part of every
  run. A bottle holds about half a day's water and weighs about a can.
- **Tiredness** (Josh, 2026-10-23; the rule is ≥6 h sleep in every 24): the
  meter rises ~1/hour awake (1.5 running or fighting) and sleep takes off
  ~2.7/hour, so 6 h clears 16 h awake. **Rested** normal · **Tired** (~18 h
  awake, or under 6 h in the last 24) every skill -1, stamina -20%, slightly
  worse choices · **Exhausted** (~30 h) skills -3, stamina -40%, panic more
  likely, can **doze on watch** (a chance per hour, lower with discipline;
  banging wakes them) · **Collapse** (~40 h) asleep wherever they are, even out
  in the facility. Sleep only in safe-room beds (collapse is the one
  exception); banging at the door, a row, or someone turning in the room cut
  sleep quality.

- **Morale** (Josh, 2026-10-23), 0-100 per survivor. **Down:** someone they care
  about dies (scaled by regard, worse if they saw it), watching someone turn,
  hurt or bitten, hungry/thirsty/tired, a row, a failed plan, too long alone
  (sooner for high sociability). **Up:** eating and sleeping well, company, a
  win (a room cleared, a zone opened, the power on, a log found), a friend's
  comfort (a talk choice), saving someone or being saved. **High** (75+)
  slightly better aim and stamina, quicker to volunteer, +10% skill XP ·
  **Steady** (40-75) normal · **Low** (20-40) shaky aim, worse choices, quicker
  temper, **won't leave the safe room alone** (a hard rule) · **Breaking**
  (under 20) — the agony move's "going insane": refuses jobs, talks to
  themselves, may do something reckless or wander off; only a friend's comfort
  or a real win pulls them back, and it takes a few bad days to get there.
  **Morale spreads a little:** a breaking survivor drags those near down, a
  high-morale leader lifts the group.

**A real-time day** (New York time), **with no fixed schedule** (Josh,
2026-10-22). Each survivor needs **at least 6 hours of sleep in every 24**;
the more tired they get, the lower their stamina and the worse their
decisions. **The group decides** who sleeps when, who keeps watch, and whether
anyone goes out at night — it is entirely theirs. Nights are the most
frightening hours.

**Leadership is organic** (Josh, 2026-10-22): no rule picks a leader. A group
gravitates to one, the way a real one would; Rick holds the role at the start
because he got them out of the city, and keeps it only as long as they follow
him.

**Health, going down, death:**
- 100 health (Josh, 2026-10-23). Wounds: **scratch** 5-10, bleeds lightly,
  ~10% infection · **bite** 25-35, bleeds heavily, ~85% infection · **blunt**
  (a wall, a fall, a blow) 10-20 · **gunshot** (friendly fire) 30-60, bleeds
  heavily · **burn** (a molotov) 15-30. **Bleeding** drains until bandaged —
  light ~1 per 10 s, heavy ~1 per 2 s. **Where it lands shows:** an arm wound
  -2 to shooting and melee; a leg wound limps (the injured walk), slower, no
  sprint; torso/neck bleed more; bites usually neck, shoulder or forearm.
- **Healing:** a **bandage** stops bleeding, +5 · a **med kit** is a big, fast
  heal (~+60 in a few seconds, halves a limb wound's penalty) and **rare** —
  about eight in the whole facility (Josh: "medkits heal faster and are more
  rare") · **pills** hide pain penalties for 2-3 h and heal nothing (Dale's
  stash) · **natural healing** is slow: +2 an hour, only asleep in a safe room,
  fed and watered. First Aid skill makes all of it faster and stretch further.
- At 0 a survivor goes **down** (Josh, 2026-10-23): crawling (the injured
  crawl) and bleeding out for about **60 seconds**, faster with a zombie on
  them; zombies go for the downed. **A downed survivor holding a pistol can
  still fire it**, badly — a last stand. **The revive:** an ally kneels ~8 s
  (faster with First Aid), defenceless meanwhile; a **bandage** brings them back
  on 15 health, a **med kit** on ~50. **No bandage or med kit, no revive** — an
  ally can only **drag** them to cover or a safe room (slow, both hands) while
  the timer runs. **Going down again before sleeping in a bed halves the
  timer** to 30 s. When the timer runs out, death is permanent.

**Infection** (Josh, 2026-10-23): a bite (~85%) or a scratch (~10%) starts a
**24 real-hour clock**. **0-6 h** incubation, nothing shows · **6-14 h** fever:
sweating, the shiver move, stamina -25% · **14-20 h** coughing fits (the cough
move) — **the cough is noise**, zombies hear it and it gives them away ·
**20-24 h** slow, confused, skills -3, may wander · **24 h** they collapse, about
a minute, and stand up as a zombie. **Antivirals** are rare (~10 in the
facility): each pauses the clock 12 h, none cures. **Lazarus cures** if given
before the turn.
- **A bite nobody saw can be hidden** — the honesty gene decides whether they
  confess; the others find out from symptoms, a search, or a confession. This
  is how danger gets inside a safe room.
- **The group's choice:** quarantine them, race the cure, or **end it** — a talk
  choice, then the act; whoever does it takes a big morale hit, and the others'
  trust in them moves by whether they agreed.
- **No amputation** (it would need a one-armed body and moves for everyone).
- **The turned survivor rises in their OWN body and clothes**, the skin blending
  to grey — the death viewers remember. Gap to fill: the zombie moves baked
  onto the survivors' rig, and the skin blend.

## 6. Death and newcomers

- **Death is permanent.**
- **A death report** for each fallen survivor: time alive, cause of death, the
  decisions that led there, what each gene actually did, relationships, and
  **what the group lacked** when they died (no medic, nobody who could fight,
  nobody who could read the files).
- **Newcomers are designed by Josh and Claude** from those reports — not born
  from the best survivor's genes — and **added when Josh says.**
- **The death report** (written automatically, sent to Josh): time alive,
  cause, the decisions that led there (from the recorded choices), what each
  gene actually did, relationships at the end, and what the group lacked.
- **A ready bench** (Josh, 2026-10-23): two or three newcomers fully prepared
  before launch — body, voice, every move baked, sheet written — Claudia first,
  so a replacement is always ready the same day. **Josh alone decides when one
  comes in.** When the cast drops to 4 or fewer the panel says so and suggests
  the bench's best match for what the group now lacks. The bench needs two or
  three more scanned bodies (Renderpeople's free ones checked first), each put
  through the same bake and checks as the cast.
- **They're found, not spawned:** in a sealed room in a zone the group can
  reach now, so the rescue is a scene. each joins in one of six sealed rooms
  (a quarantine cell, a cold-storage locker, a panic room…).
- **THE CHARACTER CREATOR (Nov 2 2026).** A character is one file,
  `src/survivorz/cast/<id>.json`; every table the show reads is built from
  those files. `npm run build && node scripts/survivorz/creator.mjs` opens a
  local page (localhost:8795) to make or change one: every field with live
  checks, the others' day-one regard of them, and a test line from the real
  model through the show's checks. A new character starts as a draft, goes
  on the bench when it's ready, and comes in when Josh says (one "Bring in"
  button per bench character). Still by hand: baking the body and putting the
  voice on slopbot. Harness `test_survivorz_cast.mjs`.
- **THE CHARACTER LIST, IN THE ADMIN PANEL (Nov 2 2026).** Josh: "put the
  character creator in the admin panel to make it easy for me to create a
  list". Admin Panel → Characters is the same form. The characters are files in
  git, so what Josh saves there goes into the server's database
  (`survivorz_characters`, migration 116), checked with the same rules, and is
  marked new / changes / in the show. **Download list** saves it as a file;
  Claude runs `node scripts/survivorz/pull-cast.mjs` (newest
  `survivorz-characters*.json` in Downloads, or `--file`, `--local`, `--ssh`)
  to write the files. A character whose body isn't baked yet goes in as a
  draft until it is.
- **The first newcomer is Claudia** ✱ (the spare Renderpeople body): a Halcyon
  office worker who fled with everyone and hides where she worked. A log
  naming her, or a reader recognising her badge, gives her away on screen.

## 7. Genes

Genes change what a survivor **chooses**, never what they **can** do (the 1-10
stats below are the body's). **TEN genes** (Josh, 2026-10-22): the first draft's
seven with Altruism split into Generosity and Loyalty, plus Temper and Honesty,
so cooperation, rows and lies come from numbers the code can act on, not only
from the written sheets. Each is 0-10. The rules live in `src/survivorz/genes.ts`
(harness `scripts/survivorz/test-genes.mjs`); behaviour reads a gene only
through its dials there, so a retune is one number in one place.

| Gene | What it moves |
|---|---|
| Self-preservation | when they break off and run; how low they let their health go |
| Caution | how far from safety they go, how quietly, whether they travel at night |
| Generosity | how much of what they find goes in the shared box, and to whom |
| Loyalty | how much risk they take for someone else: going back, pulling a zombie off |
| Trust | how quickly they believe people and follow a plan; how hard a betrayal hits |
| Sociability | staying with the group versus going alone |
| Curiosity | how hard they chase logs, terminals and secrets |
| Assertiveness | leading or following; arguing a plan or giving in |
| Temper | how fast friction turns into a row, and how slowly they forgive |
| Honesty | telling the truth, owning up, or hiding a stash (Dale's painkillers) |

**The starting genomes** (the draft Josh picked, 2026-10-22):

| Gene | Johanna | Dale | Ben | Rick | Sarah | Rollo |
|---|---|---|---|---|---|---|
| Self-preservation | 9 | 6 | 3 | 5 | 8 | 7 |
| Caution | 6 | 7 | 2 | 6 | 7 | 3 |
| Generosity | 8 | 3 | 6 | 7 | 2 | 5 |
| Loyalty | 8 | 5 | 7 | 9 | 3 | 4 |
| Trust | 6 | 3 | 7 | 5 | 4 | 6 |
| Sociability | 7 | 3 | 8 | 7 | 9 | 6 |
| Curiosity | 6 | 4 | 5 | 5 | 3 | 8 |
| Assertiveness | 4 | 5 | 6 | 9 | 6 | 3 |
| Temper | 2 | 6 | 8 | 4 | 5 | 5 |
| Honesty | 8 | 3 | 6 | 9 | 2 | 4 |

**Genes DRIFT with what happens** (Josh, 2026-10-22): a near death raises
self-preservation, a betrayal lowers trust, being saved raises trust and
loyalty, and so on (the table of experiences is in genes.ts). Never more than
**2 from where the person started** ("Rick never becomes a coward") and never
more than **1 a day**, so one bad night doesn't rewrite anybody. The arcs this
makes over four weeks are part of the show. A newcomer's starting genes are
designed by Josh and Claude (§6), not inherited.

**How two people feel about each other** (Josh, 2026-10-23): each pair
carries three numbers **in each direction** — **regard** (-100..100, liking:
going back for them, comforting, sleeping near), **trust** (0..100, reliance:
following their plan, sleeping under their watch, believing them) and
**friction** (0..100, tension now; builds with disagreement, fades daily by the
temper gene's `forgiveRate`, and past `rowAt` becomes a row). Starting sizes,
tuned in the simulator: saved my life +20 regard / +30 trust · shared food or
medicine +5/+5 · comforted me +10 regard, -10 friction · their plan worked
+5/+10 · their plan got someone hurt -5/-15, +10 friction · argued -5 regard,
+15 friction · caught lying or taking from storage -10/-25, +20 friction · left
me behind -40/-40, +30 friction · refused my plan -3 trust, +5 friction.
**Starting from the lore:** everyone trusts Rick; Johanna is protective of
Sarah; Ben wants Rick's approval; Sarah and Johanna carry friction (the
mothering); Dale respected but kept at arm's length; Rollo low with everyone,
both ways. The model is told these feelings whenever it talks.

**When it goes wrong between them** (Josh, 2026-10-23):
- **Rows:** friction past a survivor's temper line becomes a shouting match
  (the arguing and yelling gestures); others can step in.
- **Fistfights, rare:** friction at maximum with a high-temper survivor — a
  shove or a few punches, 5-10 damage, never deadly; the others pull them apart.
- **Theft from the storage** (the honesty gene): every item is logged for us
  and the death reports, but **the survivors can't see the log** — they notice
  only when something expected is missing, and suspect rather than know unless
  it was witnessed or a search turns it up.
- **Exile, rare:** a meeting votes someone out (a majority and very low trust).
  An exile can't enter a safe room unless someone inside lets them in — no beds,
  no water, close to a death sentence. A later meeting can reverse it.
- **No killing a healthy survivor**, ever: the only exceptions are the mercy kill
  of the infected and friendly-fire accidents. Code never lets a weapon be aimed
  at a healthy survivor on purpose.

**Bonds** (Josh, 2026-10-23):
- **Best friends** (regard 70+ both ways): same team when they can, always go
  back for each other, comfort each other first; losing one is the hardest
  morale hit there is.
- **Rivals** (low regard + high assertiveness on both sides): compete for the
  lead, argue each other's plans, refuse each other's orders more often.
- **Romance grows on its own**: high regard both ways AND both character sheets
  allowing it (each sheet says who they're drawn to and when they'd be ready —
  Johanna, grieving, maybe not for weeks). A couple's morale rises together,
  they protect each other, a third who likes one builds friction with the other
  (jealousy), and a death is the biggest grief in the game. **Shown: talk,
  flirting, a kiss, a hug, sharing a bed. Nothing sexual is shown or
  described** (fade to black — YouTube's rule, with the content line still in
  code). Sarah's flirting is a tactic, not romance, unless the numbers make it
  real.

## 7b. Skills (Josh, 2026-10-22)

Three layers: **body stats** (combat, nimble, thinking, creative, 1-10) are
what the body can do and never change; **genes** are the personality and
drift; **skills** are what the person has learned, and grow with practice.

**Twelve skills**, each 0-10, each belonging to a body stat:

| Skill | Stat | What it does |
|---|---|---|
| Shooting | Combat | accuracy, recoil recovery, reload speed, headshot chance |
| Melee, one-handed | Combat | knife, pipe, crowbar, hammer: damage, swing speed, stamina per swing |
| Melee, two-handed | Combat | fire axe and heavy tools: damage, knockdown chance, stamina per swing |
| Fitness | Combat | stamina, carry weight before slowing, breaking a grab, the shove |
| Nimbleness | Nimble | climbing, dodging a lunge, sprint speed, getting up after a fall |
| Sneak | Nimble | footstep noise, how close they get before a zombie notices |
| Looting | Thinking | search speed, finding hidden or better items in a container |
| First Aid | Thinking | bandaging speed, revive success, more out of each med kit |
| Electronics | Thinking | keypads, terminals, security cameras, power panels |
| Science | Thinking | reading the logs, working the lab equipment, finishing Lazarus |
| Crafting | Creative | what they can make, from fewer parts, of better quality |
| Mechanics | Creative | repairs, barricades, prying doors, lockpicking, the generator |

No cooking (Josh): they eat the food they find as it is.

**How skills grow:**
- **XP from doing the thing:** full for a success, half for a failure, +50%
  when it's done in danger.
- **Each level costs more than the last:** a skill used daily gains about one
  level a week in the middle of the scale, slower near the top; +2 to +4 over
  the four weeks for someone's main skill.
- **The ceiling is the body stat + 3** (at most 10): Ben (thinking 3) never
  passes 6 at a thinking skill; Rick (combat 9) can max shooting.
- **Learning from each other:** working beside someone 2+ levels better earns
  50% more XP (Dale teaching Johanna first aid, on camera).
- **Condition lowers the level used in the moment, never the level learned:**
  tired -1, exhausted -3, an injured arm -2 to shooting and melee.

**Two rules that read a body stat, not a skill:** vents need **nimble 7+**
(fitting is body size; Johanna, Sarah and Rollo fit). **Lazarus needs Science
7+**, a skill — nobody starts there, so the cure is a study arc (reading the
logs, working the lab); Johanna, Dale, Rick, Sarah or Rollo could reach it,
Ben can't. The simulator has to show someone usually gets there in time.

**Starting levels** (from each background, all at or under the ceiling):

| Skill | Johanna | Dale | Ben | Rick | Sarah | Rollo |
|---|---|---|---|---|---|---|
| Shooting | 1 | 3 | 2 | 8 | 0 | 3 |
| Melee 1H | 2 | 4 | 5 | 6 | 1 | 3 |
| Melee 2H | 1 | 3 | 7 | 5 | 0 | 3 |
| Fitness | 4 | 6 | 8 | 5 | 3 | 4 |
| Nimbleness | 7 | 5 | 5 | 4 | 8 | 6 |
| Sneak | 6 | 4 | 2 | 5 | 7 | 5 |
| Looting | 6 | 4 | 3 | 6 | 4 | 6 |
| First Aid | 4 | 9 | 1 | 4 | 2 | 1 |
| Electronics | 3 | 2 | 1 | 3 | 3 | 5 |
| Science | 2 | 4 | 0 | 2 | 3 | 2 |
| Crafting | 4 | 2 | 7 | 4 | 3 | 4 |
| Mechanics | 3 | 3 | 5 | 4 | 2 | 5 |

**What the stats do in the game:**

| Stat | Effect |
|---|---|
| Combat | hit chance and spread, melee damage, stamina per swing, how fast they break a grab, whether they handle the rifle |
| Nimble | speed, how quiet they are, climbing, vent routes (7+), dodging a lunge |
| Thinking | the ceiling on looting, first aid, electronics and science (Lazarus itself needs Science 7+, §7b) |
| Creative | crafting (better items, fewer parts), improvising, unusual ways past a locked door |

**The simulator** runs the real engine fast-forwarded (the creature
harnesses' in-process shape), hundreds of runs. Before launch it has to show:
the group usually lasting the four weeks with a few deaths (not none, not
all), every ending reachable, and no single stat deciding who lives.

## 8. Combat and equipment

All of it is server-side, on the regular tick. **None of it touches the Solace
economy** — no silver, nothing in or out of the facility.

**What a survivor carries** (Josh, 2026-10-23):

| Where | Holds | To get it out |
|---|---|---|
| Hands | one two-handed item, or main + off hand (pistol + flashlight) | in use |
| Sling (back) | one long gun or long tool: rifle, shotgun, fire axe | ~1 s |
| Holster (hip) | one pistol | ~1 s |
| Belt | 3 quick slots (bandage, magazine, molotov, flashlight) | ~1 s |
| Backpack | 6 slots, 8 with the bigger bag | ~3 s, they stop and rummage |
| Key-item pocket | keycards, written codes, the specimen sample | no slot, no weight |

- **Stacks:** ammo by type in one slot (60 pistol, 24 shells, 90 rifle);
  bandages 3, pills 5; food 2 a slot; one water bottle a slot.
- **Weight:** every item weighs something; the limit is ~15 kg + 2 per Fitness
  level; past it they slow and tire sooner — a hoarder is slower in a chase.
- **The linked storage** (every safe room's box opens the same one) has
  **unlimited space**; the limit is getting things back to a box. Who puts in
  and who keeps back is the generosity gene on screen.
- **The dead keep their gear where they fall**, and the others can loot them.

**Items** ✱:

| Category | Items |
|---|---|
| Melee (wears out) | pipe, crowbar (also pries doors), fire axe (also breaks barricades), kitchen knife |
| Firearms | pistol, shotgun, rifle; ammo by type, magazines, reloads |
| Light and comms | flashlight + batteries, walkie-talkies |
| Medical | bandage, pills, med kit, antiviral, Lazarus |
| Food and water | canned and packaged food, eaten as found (no cooking); water bottles, refilled at the sink in any safe room |
| Tools | hammer + planks, keycards, lockpick, duct tape |
| Crafted | noisemaker, molotov, pipe bomb, reinforced barricade |

**Weapons and ammo** (Josh, 2026-10-23). Zombie health for scale: shambler
~100, runner ~80, experiment ~180; **a head hit kills a shambler outright** and
doubles against the rest; the head-hit chance comes from skill.

| Melee (wears out) | Hands | Damage | Speed | Reach | Lasts | Also |
|---|---|---|---|---|---|---|
| Kitchen knife | one | 25 | fast | short | ~60 hits | quiet; a head stab |
| Pipe | one | 30 | medium | medium | ~80 | |
| Hammer | one | 30 | medium | short | ~120 | builds barricades |
| Crowbar | one | 35 | medium | medium | ~150 | pries doors |
| Fire axe | two | 60 | slow | long | ~100 | knockdown; breaks barricades and doors |

A worn weapon breaks; **duct tape** (Mechanics) repairs it partway.

| Gun (no wear) | Damage | Magazine | Reload | Noise | Notes |
|---|---|---|---|---|---|
| Pistol | 35 | 15 | ~2 s | ~25 cells | the steady choice |
| Shotgun (pump) | up to ~95 close | 6 | shell by shell, ~0.7 s each | ~30 | brutal close, weak far |
| Rifle (HK416) | 45 | 30 | ~2.5 s | ~30 | badly inaccurate below combat 6 |

**Three guns only** for now (the pack's AK, SKS, MP-40, sniper and SMG stay out:
each needs fitting to every body). **Ammo in the facility**, scarce and mostly
in Security's armoury: ~250 pistol rounds, ~60 shells, ~200 rifle rounds.
**Flashlight batteries** last ~2 h; ~40 in the facility.

**Crafting** (Josh, 2026-10-23), at a **workbench in each safe room** (beside
the beds and the storage, so it happens at base, on camera), 30 s to 2 min.
Parts are their own items found while looting (scrap, rags, bottles, fuel,
wire, clips, batteries, planks, nails, lab chemicals) and take slots like
anything else.

| Item | Parts | Crafting | Does |
|---|---|---|---|
| Bandage | 2 rags | 1 | stops bleeding; spares the rare medical supplies |
| Noisemaker | alarm clock + battery + tape | 1 | thrown, rings ~20 s, draws zombies |
| Lockpick | wire + clips | 2 | simple locks (Mechanics to use) |
| Molotov | bottle + fuel + rag | 2 | ~8 s of fire: burns zombies, blocks a doorway, can spread |
| Reinforced barricade | 3 planks + nails + metal sheet | 3 | ~2× a plain one (Mechanics builds) |
| Pipe bomb | pipe + lab chemicals + wire + battery + tape | 5 | ~4 m blast, very loud, can hit your own |

A **plain barricade** (2 planks + nails) needs no crafting, only Mechanics and a
hammer. At **Crafting 6+** a recipe takes one part fewer, and higher skill
makes the result stronger (a molotov burns longer, a barricade holds more).

**Melee** (Josh, 2026-10-23): a swing is a **wind-up** (~0.2 s knife, ~0.6 s
axe), the **hit**, and a **recovery** in which they're open. It hits what's in a
cone in front, out to the weapon's reach; **only the axe sweeps two**. **Stamina**
(100): 8 (knife) to 20 (axe) a swing, less with melee skill and Fitness;
recovers ~10/s when not swinging; at empty, swings are slow and weak and they
can't sprint — a long fight wears you down, so the group fights together. **Head
hits:** ~15% + 5% per skill level, less tired or scared; a head hit kills a
shambler. **The shove:** 15 stamina, knocks a zombie back ~1.5 m and stuns it
~1.5 s, about once a second, stronger with Fitness; it breaks a grab. **A downed
zombie** (the axe knocks down ~40% of the time; shoves and falls too) is
finished with a stomp or stab in about a second — the safe way to save ammo and
wear.

**Firearms** (Josh, 2026-10-23): hitscan with spread — ~8° at Shooting 0 down
to 1° at 10; ×1.5 walking, ×3 running, ×1.5 scared or panicking, worse tired or
with an arm wound; **half a second still and aimed halves it** and is when head
shots come. Pistol single shots up to ~3/s; shotgun one a second with a pump;
rifle controlled singles (a panicking shooter holds the trigger and wastes
ammo). **Friendly fire is on, and rare:** the reflex code won't fire with an ally
in the line, except panicking, exhausted or unskilled. **Ammo discipline:**
melee for a lone shambler, guns for runners, groups and emergencies (discipline
and caution make them stricter). **Ammo is one pool per type**; a reload tops the
magazine up from it, nothing lost. The server tracks every round.

**Zombie attacks** (Josh, 2026-10-23; the paired moves are the finisher pack's):
- **A swipe:** a scratch (~10% infection) or a blunt blow; it doesn't hold.
- **The grab:** close, and not shoved away → a grab, both bodies on the paired
  move. The survivor **struggles free in ~2-4 s** (faster with Fitness and
  stamina). **Still held at ~3 s, it bites** — and the struggle restarts, a bite
  every ~2 s until they're free. **A knife stab to the head ends the grab at
  once** if it lands (melee one-handed skill). **An ally can** pull it off (~1 s,
  Fitness), hit it, or shoot it (a head shot; risky, friendly fire possible).
- **Two zombies at once: no breaking free alone** — only an ally saves them.
  This is how most should die: separated, caught, nobody near.
- **A bite:** 25-35 damage, ~85% infection, usually neck, shoulder or forearm.
- **The runner's lunge** from 3-4 m: a dodge chance from Nimbleness; if it
  lands, an instant grab.
- **The crawler's ankle grab** (vents, under floors): holds a leg ~1.5-2 s;
  not kicked free, they trip and fall and it bites the leg.
- **On the downed:** a zombie feeds, biting ~every 2 s, and the bleed-out runs
  faster.
- **Death moves** (the finisher pack's kills) play **only for a real death**:
  a downed survivor's timer running out with a zombie on them, or a survivor
  held by two running out of health.

**Noise, in metres** (Josh, 2026-10-23): crouching silent · walking 6 ·
sprinting 16 · talking 20 · a forced door 24 · hammering a barricade 30 · a
pistol shot 50 · a shotgun or rifle shot 60. **A wall in the way halves it.** A
lit flashlight is seen far in the dark; turning it off is stealth.

**The world:** doors open, close and lock; barricades have health zombies
wear down; keypads take codes from the logs; breakers restore power zone by
zone. **Bodies stay where they fall**, so a cleared zone stays cleared.

## 9. The zombies

**The pack:** Difffuse Studio's *Zombie Pack – People Set* (Superhive,
bought 2026-10-20, $29, Standard Royalty-Free: commercial use, no credit
needed, no redistribution). 19 zombies (9 women, 10 men), each a different
person, properly rotted. One skeleton; low-poly versions 6.7k–15k triangles;
1K textures; their own walks and runs on the same skeleton.

- Delivered as Blender files only; Blender 5.2 is installed to export them.
- **At intake the skin colour has to be baked** — the export drops it.
- The white-coverall, hazmat-looking and military bodies become the
  experiment zombies; civilians are the outside dead.

**The kinds** (Josh, 2026-10-23; survivors walk ~1.4 m/s, jog ~3.2, sprint
~5.0 while stamina lasts):

| Kind | Health | Speed | Senses | Its danger |
|---|---|---|---|---|
| Shambler (outside) | 100 | ~1.0 m/s | sees ~15 m | numbers; a head hit kills it |
| Runner (outside) | 80 | ~4.2 m/s in bursts | sees ~20 m | the lunge; a fresh sprinter outruns it, a tired one doesn't |
| Crawler (outside) | 60 | ~0.6 m/s | low, hard to spot | vents and under floors; the ankle grab |
| Experiment | 180 | ~3.0 m/s | sees ~25 m, hears better | opens unlocked doors, breaks barricades 2× as fast; a head hit only doubles |

Outside zombies are ~60% shamblers, 25% runners, 15% crawlers; experiments are
the coverall, hazmat and military bodies with the G-Strain tint.

**How many: ~80 at the start, finite** — Vault Lobby 12 · Residential 10 ·
tunnels 15 · Research Labs 6 strays + 8 experiments locked in · Medical 4 + 6
experiments in the quarantine cells · Security, Power & Maintenance 6 ·
Containment + Deep Lab ~20 experiments, sealed until the power comes back. New
ones come only from a **release event** (the power back, a lockdown failing), a
**slow trickle** from the tunnels while their doors stand open, and **a
survivor who turns**. **Repeated faces** (19 bodies, each seen ~4 times, an
experiment body ~7): blood and grime variety, a slight colour shift, ±5% size,
and never two copies of a face near each other; re-judged on camera, and more
bodies only if it still reads as copies.

**Senses and behaviour** (Josh, 2026-10-23). **Sight:** a cone ahead out to the
kind's range, shorter in the dark; a lit flashlight is seen much further; walls
and closed doors block it. **Hearing:** the noise distances above, halved
through a wall. **The alarm spreads:** one that notices someone moans and
draws every zombie within ~15 m. **States:** idle (standing, swaying, slumped —
how most start) · wander · investigate (walk to a sound, search) · chase ·
attack · **bang** (a door or barricade, wearing it down, the noise drawing
more; at a safe-room door they bang a while and give up) · feed (on a body,
distracted until someone comes close). **Losing you:** out of sight it goes to
where it last saw or heard you, searches ~20-40 s and goes back to wandering —
it never homes in on where you actually went (the Backrooms rule), so breaking
line of sight and keeping quiet is an escape. **No day/night change in the dead**
(no windows): nights are worse through the survivors (tired, fewer awake) and
the director.

**Doors and barricades against the dead** (Josh, 2026-10-23; the rules
themselves are `src/survivorz/doors.ts`). An ordinary door has 300 health, a
plank +100 (3 at most; a reinforced barricade's planks 200 each). **Shamblers
and runners do 1 a second, experiments 2**: four shamblers through a bare door
in ~75 s, a fully planked one in ~2½ min — time to hear it and react. **They
bang only when chasing someone or hearing someone behind it**, never at random.
**Glass** (lab doors, partitions): only experiment zombies smash it, slowly;
steel stays the safe line. Survivors pry an ordinary locked door with a crowbar
(heard 24 m) or break doors and barricades with the axe. **The tunnel trickle:**
~2 a day while a tunnel door stands open, none while it's shut.

**Behaviour** (code, a behaviour test per agreed behaviour):
- **Senses:** sight, hearing (the Burrower's and Listener's systems), and an
  alarm that spreads — one zombie that notices draws others.
- They wear down barricades and doors; the noise of banging draws more.
- **Outside zombies:** shamblers and runners.
- **Experiment zombies:** faster, tougher, smarter at doors.

**The director** (Level 0's, adapted; Josh, 2026-10-23). **The show is a
business:** it has to keep a YouTube audience watching 24/7 for four weeks
without killing the cast off early or ending too soon, so the director is
balanced for constant suspense and action with few deaths.
- **It changes WHEN danger arrives, never how much exists:** it never creates a
  zombie, kills anyone or makes anything stronger. Code rules, no model, with a
  tension score per survivor (hurt, chased, dark, alone, hungry, tired).
- **Its tools:** wake an idle zombie near the group or let one drift their way;
  a noise in the world (a pipe bursts, something falls, the facility's PA or
  alarm) that the dead go to; flickering lights or a power dip; bringing the
  tunnel trickle forward (within ~2 a day); **holding the dead quiet** (nearby
  zombies idle, the next event pushed back); and the music.
- **Rhythm:** build, peak, relief, build again. **No dull stretches:** if nothing
  has happened for a while with people awake, it nudges something — the aim is
  something tense several times every waking hour, and nights played on the
  watchers' nerves.
- **Drama comes from near-misses, not deaths:** grabs broken by an ally,
  survivors going down and being revived, a door that holds just in time. The
  target is **about one death a week**, and **never two deaths close together**:
  after a death, ~6 h of quiet for grief, and while anyone is down or a
  survivor is badly hurt it stops waking anything near them.
- **It eases off as the group shrinks:** full strength at 6, ~70% at 3, ~50%
  with 1 left, so the show can't be wiped out on day 4.
- **Josh gets a readout** of deaths per week and action per hour against the
  targets (law 11: too hard, or too dull, goes to Josh, never quietly tuned).
  The simulator has to show both before launch.

## 10. Animation

### THE ANIMATION LAWS (Josh, Oct 21 2026 — they cannot be broken)

Every clip on every body — Mixamo, the packs, the finisher pairs and every move
built in code — must pass both, or it doesn't ship:

1. **No arm or leg ever clips into a body** — its own or anyone else's. A hand
   may rest on a body, as it would on clothes; it may not sink into one.
2. **Movement and actions look natural** — never uncanny or robotic. Weight,
   timing and easing read as a person; hands meet the things they handle (a
   grip, a key, a pump, a back) where a person's would.

**How each is held:** law 1 is MEASURED, not eyeballed — the skin test
(`anim-pair.html` `r.overlap`, built for the hug: one body's skin against the
other's torso surface) is run over every clip, against the body's own torso as
well as a partner's, and a clip that sinks a limb past a resting hand's
pressure is fixed before review. Law 2 is judged on the review videos —
mine first, then Josh's — and a clip either of us calls stiff is redone, not
argued for. A move built in code is reworked until it passes both; a library
clip that fails is fixed in the bake (an IK or floor pass) or dropped.

**THE LINE IS 3 CM, AND ROLLO'S SUIT GETS 3 MORE** (Josh, Oct 24 2026, asked to
decide: "do what you recommend"). Rollo's hazmat suit is padding over a person,
and padding squashes where an arm crosses it, so on his body, and in any pair
with him in it, the line is 6 cm. Past that is still a clip and still fixed.
`anim-clip.cjs` (`SUIT_ALLOW`) and `docs/survivorz/anim-pairs.mjs` (`pairLine`)
carry it.

**A HIP FOLD IS NOT A CLIP** (Josh, Oct 27 2026, asked to decide: "whatever you
recommend"). When a heavy body bends double — Manuel picking up a molotov, Rollo stepping
up onto a ledge — the top of the thigh meets the belly: flesh compressing at the groin, not
a limb passing through a body, and no swing of the knee moves it (it is at the hip joint
itself). A flag on the thigh's ROOT bone only (`upperleg_twist`) is therefore contact; a
thigh flagged anywhere else, and every arm, is still a clip. `finisher-table.mjs --self`
carries it.

**GUNS COME FROM THE PACK JOSH BOUGHT, AND NOTHING ELSE** (Josh, Oct 21 2026: "model
only the guns from the pack i bought and also make sure they fit well [in] each
model's hands, their hands are in the correct positions, and re-validate each
until they are realistic"). The pack is Synapse Studio's "Rigged Gun Collection"
(Fab), `assets/New Assets/New folder/source (1).zip`: AK-47, HK416, SKS, MP-40,
SV-98, a sniper rifle, a tactical pump shotgun and a 9mm SMG — **no pistol** (the
pistol is Poly Haven's free one, below).
`scripts/survivorz/guns.mjs` makes them game-ready in one convention (origin
in the shooting fist, +Z out of the muzzle, real metres, the support hand's,
butt's and muzzle's points recorded), and every gun clip is fitted per body:
the gun rides the shooting hand, the support hand is pinned to its handguard or
pump, and the fit is measured and re-checked on the video until it reads true.
The free "Animated Shotgun" below is retired for this.

**How the law is enforced in the bake (Oct 21 2026).** `scripts/survivorz/anim-law.js`
is the one measure (the torso read as a surface round the spine, so a bent, lying
or crawling body is judged right; contact allowed at a limb's own root, and a
clip fails only when more than 15 limb vertices sink past 2 cm at some moment).
`anim-clip.cjs <body>` runs it over every clip; `anim-build.html` runs it after
every built move's recipe: an arm that sinks is first swung round its
shoulder-to-wrist line (the hand stays on its object, elbows kept down — a
raised elbow costs as much as a clip), then lifted out sideways at most 12°.
A recipe that leans on the lift is reported (`the law had to lift an arm N
degrees: fix the recipe`) and fixed at its cause — usually an object held too
close to the chest — never forced further, which once flung an arm overhead.

**The law's natural half, measured (Oct 22 2026).** Josh, after the second gun
review: *"the arms, hands, shoulders, head, etc all need to look natural ... all
need to be validated."* Natural is measured against REAL BODIES:
`scripts/survivorz/anim-natural.js` reads, every frame, the elbow's hinge (it
only bends one way), the wrist's bend both ways and its roll, the forearm's and
upper arm's roll, the head against the chest (in the body's own up/forward), and
every joint's speed and jerk (a loop across its seam too).
`anim-natural.cjs <body>` takes the body's own motion-capture clips as the
baseline (5th–95th percentile = "core", 0.3rd–99.7th = "range") and lists every
clip that leaves it; `anim/<body>/natural.json`. Eric's built clips went from
101 outside the range to a handful. What fixed them, and is now how every built
move is made:
- **A natural-arm solver in the bake** (`h.unclip`, which still clears the
  torso): for the hand the recipe placed, it searches the elbow's whole circle
  round the shoulder-to-wrist line for the arm real bodies would use, and moves
  the hand's roll OFF the wrist onto the forearm (`rollIntoForearm`) — the
  survivor rig's twist bones are never driven, so a roll left at the wrist twists
  the skin like a candy wrapper. A warm-up pass runs first so the solver's easing
  joins a loop to itself.
- **The elbow is a hinge** in `reach` (its bending way is learned from the mocap);
  a reach blends its elbow toward the pole as it blends in (no snapping).
- **Every hand is read by its BONE** (`handRigid`), never by its fingers' curl,
  which flips on clips that pose fingers oddly and laid hands back-first.
- **Hands are laid the way hands lie:** `gripBar` (a fist round a bar turns round
  it as the forearm lies), `layHand` (a palm on a surface, fingers carrying on
  from the forearm); a support hand on a pistol keeps the MOCAP's own turn and
  only slides onto the gun.
- **Open choices are chosen by the body** (`R.choose`): options are tried over the
  clip and the one leaving both arms most natural is kept.
- **Real data before code:** a rifle sprint takes its upper body from the rifle RUN
  (`R.armsFrom`), chest turned to face where that clip's chest did; a molotov's
  wind-up is the mocap throw's, not a hand-built cock-back.
- **Pose to pose** for keyed hand work (shotgun shells): each key pose is solved
  on its own and the arm's JOINTS are blended between them, the way an animator
  keys — steering a hand through the world between two keys passes through turns
  no wrist makes. This is how melee and equipment moves will be built.
- **A hand goes round a body, not through it**: if the hand itself is still inside
  the torso after the elbow search, it is moved out along the body's surface (at
  most 8 cm, reported) — Carla's fuller build put a returning hand through her.
- **A last smoothing pass** over the arm joints takes out one-frame spikes where
  the solver changed its mind between neighbouring frames.
- **The same check covers the zombies** (their rig's bone names mapped), and a
  looping take whose end doesn't meet its start (mx-terrified) has its seam closed
  (`anim-loop-seam.mjs`).
- **THE HUG'S ROLES GO BY SHOULDER HEIGHT (for the game):** whoever's shoulders sit
  higher hugs OVER (arms over the shoulders), the other UNDER (round the back) —
  shoulders, not heads: Manuel is taller than Eric but his shoulders are lower
  (`docs/survivorz/anim-pairs.mjs` SHOULDER). Both
  roles are baked for every pair, but a shorter body reaching over a taller one's
  shoulders is the one combination the natural check rejects (Sophia over Eric:
  the upper arm rolled 58 degrees past any real arm) — people don't hug that way.
- **The pistol's support hand CUPS the shooting hand** (third review, below) —
  the mocap's own support hand turned out to lie flat UNDER the grip.
- **Two timing bugs found by the measure:** a one-shot's last frame wrapped to its
  first (a one-frame snap), and a move looping over a base of another length hit
  its seam (the base is now stretched to fit).

**THE THIRD REVIEW (Oct 22 2026).** Josh: *"to pass a natural check you need to
look at every joint of the body ... for the shotgun and rifle the buttstock of the
gun should be pressed against the shoulder ... the supporting under hand needs to
be grabbing and supporting the pistol grip hand. its floating beneath it ... the
hugging looks better but the arms are too stiff."*
- **EVERY JOINT IS MEASURED** (`jointMeasures`): each joint's turn from its rest,
  as three angles, for the spine, neck, head, collarbones, arms, hands, every
  finger joint, legs, feet and toes; every hinge's bending way (elbows, knees,
  finger knuckles); and every joint's speed and jerk. The bake holds the arm's
  joints inside that range too (`armJointPen`), and a finger a recipe bent stops
  where this body's mocap fingers stop (`limitFingers` — a fist written as fixed
  angles bent knuckles to 150°).
- **THE MOCAP IS CLEANED** (`anim-build.cjs <body> --clean`, once per clip, marked):
  a finger, thumb or toe past the range plus the check's 8° slack is held to it (a
  thumb bent backwards 178° in a roll, a toe at 117° under a crawl), and a one-key
  finger pop is taken out. The body's own joints are NOT clamped: their tails are
  falls, deaths and sword swings, and those are looked at. Loops whose end didn't
  meet their start had their seams closed. Clamping at the range's exact edge was
  tried first and moved real poses (a phone held to the ear): the edge is a
  percentile, so real motion sits just past it.
- **THE BUTT IN THE SHOULDER** (`shoulderGun`): every rifle and shotgun clip but
  the reloads lays the gun from the shoulder POCKET (the front of the shoulder,
  found from the skin) to where the clip's support hand holds it, keeps the clip's
  cant, then pivots it on the butt by the least that clears the chest. The right
  hand takes the grip where the gun now is. Seen from above, the cheek is on the
  stock.
- **THE PISTOL CUP** (`CUP` in anim-recipes.js): thumbs forward, the way it's
  taught — the support palm on the grip's open left side behind the shooting
  fingers, its fingers wrapped over the front of them under the trigger guard,
  its thumb along the frame; how far down the fingers angle is chosen per clip by
  the natural cost. Not in reloads (that hand is fetching a magazine).
- **THE HUG, LOOSENED:** the hands go to the point on the back the arm reaches
  WITH THE ELBOW BENT (85% of its length, higher and further round the side for
  short arms on a big back) — aimed at a fixed spot, a 56 cm arm reached for a back
  64 cm away and locked straight. When an arm crowds the partner, the elbow swings
  out first and the hand stays on the back. The hands are OPEN (an idle's
  half-fist read as knuckles knocking), the fingers follow the back's curve, and
  the hug moves: a sway, a breath, a squeeze in the middle (shoulders round in,
  fingers close on the clothes), one hand rubbing the back while the other pats
  twice.
- **A rifle sprint's chest fix is spread down the spine** (35/35/30 over the three
  spine joints): all on the lowest joint folded the waist 54°.
- **THE LOW READY KEEPS THE STOCK IN THE SHOULDER:** once the support hand lets go
  (a rifle lowered one-handed), the butt stays in the pocket and the gun points down
  through the shooting fist; the pivot that clears the gun off the body is capped at
  35° and swings the muzzle FORWARD. Uncapped and sideways it turned a rifle lowered
  across Claudia's belly 120° and took her shooting hand round her back.
- **THE HAND FIRST:** a hand the clip put inside the body (a slimmer mocap actor's
  pose on a fuller body) is moved out along the body's surface BEFORE the elbow is
  searched. The search keeps the hand where it is, so it can't fix that, and it swung
  the elbow overhead looking for a way out.
- **A STRAIGHT FINGER CURLS TOWARD THE PALM:** an opened hand's fingers have no
  bending plane of their own (two nearly parallel bones), and curling about that noise
  bent them 80° sideways; below a few degrees of bend the axis is the finger crossed
  with the palm's way.
- **The cleaner runs on a rebaselined body** (the baseline must already carry the
  every-joint measures — five of six bodies had an older one, and nothing was clamped).
- **The checks' own bug:** the gun-in-chest check read the torso from every 3rd
  vertex, left the shoulder's grid slots empty and filled them from their
  neighbours, so a butt resting on the chest read as 6 cm inside it. It uses the
  bake's every-2nd now.
- **A HAND ON A GUN DOESN'T SNAP ITS FINGERS:** the rifle mocap is a real person
  picking a rifle up, and its support thumb jumps 18° in one frame as it closes on
  the handguard. Ours holds the gun the whole clip, so the snap had no cause. While
  a recipe says a hand grips (`h.grip`), its fingers take a five-frame average,
  blended in by the grip and held four frames either side of it. The slow close and
  open of a grab passes through.
- **A HAND PASSING BY IS NOT A GRAB:** in a reload the support hand sweeps past the
  handguard on its way to the magazine. Grabbing it there pulled the hand onto the
  gun and off again, turning the wrist 75° in a frame. The grip now tightens only
  while the clip's own hand moves under 2 cm a frame; a real hand slows down as it
  closes on what it takes. Our rifle reloads now beat the source recording, whose
  reload-2 flips the wrist 173°.
- **TRAP:** `new THREE.Vector4()` starts at w = 1, not 0. Summing quaternions into
  one pulled every average toward the joint's rest, 25° off.
- **The zombies' rig** names its fingers and toes `index1l` and `toes_01l`, while
  the baseline keys every joint by the survivors' names (`thumb_02_r`, `ball_r`).
  Read by its own name, no range was found and nothing on a zombie was held in
  range; the cleaner translates now.
- **THE HW PACK'S RIGHT THUMB** (`scripts/survivorz/fix-hw-thumb.cjs`): all 13 `hw-`
  clips (the zombie walks and monster attacks) came onto the zombie rig with the
  right thumb's middle joint turned 167-180° from rest on 99% of frames. The thumb
  folded into the inside of the hand and the wrist bulged. Same on every zombie;
  the rig's other recordings have natural thumbs. Where an hw clip's thumb is past
  120°, the zombie's own average thumb from its other clips goes in, eased over
  three keys. The rest of each zombie's flags (36-37 of 56 clips) are its own most
  extreme recorded moves, judged against itself: the knockback through the air, the
  overhead hammer blow, the crawl. They were looked at, and they are real.
- **THE PISTOL CUP, SECOND CUT:** with the palm's lift left to the body's choice,
  the bake picked palm-UP (the easier elbow) and the support hand sat under the grip
  again, close (6 cm) but holding nothing. The palm faces IN onto the grip's side
  now, the fist level with the shooting fist, fingers over the shooting fingers;
  only how far down they point is chosen. It costs the support wrist up to ~10°
  past the recordings on a few frames of three clips. Josh's grip was the call.
- **A ONE-SHOT STARTS FROM ITS OWN FIRST FRAME:** the solver warms through the whole
  clip, which suits a loop (its end runs into its start) but started a one-shot
  with the elbow and grip where the clip ENDS. Non-looping clips now settle on
  frame 0 before the real pass.
- **A FIRST FRAME THAT POPS PLAYS THE SECOND'S POSE:** ual1-pistol-shoot's arm is
  12-19° off between its first two frames and barely moves after. The bake
  recognises that shape (first step over 8° and four times the next) and plays the
  second frame first.
- **A WRIST'S ROLL IS MEASURED ROUND THE CIRCLE:** the roll search treated +175° and
  -175° as 350° apart. Where a recording holds the wrist near 180° the target flipped
  sides every few frames, and the step limit chased it the long way: Nathan's support
  wrist swung 26° a frame back and forth on a crouch-walk. Every roll difference is
  wrapped to ±180 now.
- **Three bodies prefix every bone** (`rp_nathan_..._thumb_02_l`): a name rule written
  for the short form silently skips Nathan, Sophia and Manuel. The finger smoothing
  did, for a whole rebake.
- **The cup's palm gets a narrow band** (lift 0.22-0.42, still facing the grip): pinned
  at one value, Carla's support wrist ran 22° past the recordings; with the band it is
  three clips at 9-13°.
- **CLOSE-UPS ARE A REVIEW TOOL** (`anim-videos.cjs <body> --close`): every gun clip
  filmed at the hands. A long gun from the right front at the shoulder pocket, a
  pistol from the left front at both hands. The full-body frame showed the first
  cup as "hands together"; the close-up showed it was a saucer.
- **ANY HAND HOLDING SOMETHING GETS THE FINGER SMOOTHING**, not only a gun's:
  `grip()` and `gripBar()` mark the hand (`held()`), and so do the hammer's two hands
  and the syringe hand. The hammer's thumbs snapped 2.6× faster than any real thumb.
  The cause was not our fist: thumb_01 rode the base clip (a file search) untouched,
  twitching 15° in a frame inside a closed fist.
- **THE SYRINGE HAND'S PALM IS THE BODY'S CHOICE** (`choose` on `inject`, five
  turns). A fixed turn twisted three forearms 13-17° past real ones. The rub lets the
  hand go from the needle's angle rather than forcing a new one; forcing palm-down
  bent the wrist 19-29° sideways.
- **A HUG'S ARMS TURN AT MOST 7° A FRAME** (`HUG_TURN`). Reaching over a taller
  partner's shoulder the arm is nearly straight, the elbow has no clear way to bend,
  and the solve flipped between two: Sophia's upper arm 40-58° in one frame and her
  hand 72°. The roll reading looked like a measuring fault; the bone steps proved it
  real. Check the bone's own step before blaming the measure.
- **THE ELBOW SWING IS SCORED WITH THE ROLL IT CAN HAVE THIS FRAME.** The clip law
  scored every elbow swing with the full wrist-roll correction, then eased the roll
  15° a frame. The swing chosen was never the swing it got, and Nathan's crouch-walk
  left the wrist rolled 166° under a hand held still on the rifle. Continuity is now
  kept in the forearm's FINAL twist, since the base clip's own twist swings, and every
  candidate is scored with the eased roll.
- **LOOK-BACK:** the chest takes 10° of the turn (was 16°) and comes up 4° out of the
  sprint's lean. On a forward-leaning chest a 16° twist read 9° past real chests.
- **INHERITED, NOT OURS:** the flashlight-run and look-back leg flags are the base jog
  and sprint mocap's own, flagged identically on every body. A built clip copies its
  base's legs.
- **`anim-build.cjs <body> <recipe>` NEEDS THE EXACT NAME.** A partial name builds
  nothing and prints nothing, so a fix looks like it changed nothing. Check the
  out/ file's time.

**THE HANDS (Oct 22 2026).** Josh: *"do a hand and finger validation to ensure that hand
finger place looks natural as well."* The every-joint check reads each finger joint on
its own, and a hand can pass every joint and still look wrong.
- **THE HAND CHECK** (`anim-hands.js` + `node scripts/survivorz/anim-hands.cjs <body>
  [substr]` → `anim/<body>/hands.json`) judges how a hand's fingers sit together, per
  frame. **cross**: two fingers through each other. **order**: a fingertip crossed over
  its neighbour. **palm**: a fingertip sunk into the palm. **into**: a finger sunk into
  what the hand holds (the real gun's shape as a 4 mm voxel field, or the review prop).
  **held**: what the hand holds isn't between its palm and fingers. **float**: a curled
  finger touching nothing. **couple**: a finger out of step with its neighbours. **tip**:
  the last joint bent with the middle one straight. A finding must hold 2 frames.
  `cross`, `palm`, `order` and `tip` are judged against the worst of the body's OWN
  mocap (`hands-base.json`): a loose real curl reads 2.6 radii "into the palm", because
  the measure can't see the skin it can't see. **A finger's radius is measured off the
  skin** (0.135 of the index's length: Eric 1.1-1.3 cm, Claudia 0.8-0.9), and the palm's
  surface is measured under each fingertip. One height for the whole palm read the thumb
  and little-finger pads, and every real fist read as sunk in.
- **WHAT IT FOUND, and it was everywhere:** every held thing was placed on the fist's
  middle, a point in the KNUCKLES, and the hand then made a full fist in front of it.
  The hammer's handle, the crowbar and a rifle's handguard lay outside the fingers,
  against the knuckles. The can's fingers closed through the can. The guns' grips ran
  through the inside of the shooting hand, so its fingers could only lie in the grip or
  open off it.
- **THE GRIP CHANNEL** (`gripCal`, measured per body and hand from the palm skin): a
  held thing's middle sits in front of the palm's skin by its own radius, under the
  middle finger, at the knuckle crease. The skin stands 1.7-2.7 cm off the hand bone,
  a third of Claudia's hand. `handRigid(at, side, cal).hold(r)` is that point, and the
  review props are drawn there.
- **THE WRAP** (`h.wrap(side, sdf, opts)` in the bake): each finger closes until its last
  segment and tip arrive, as long as no part presses in past 0.62 radii. Stopped at the
  first touch, the base of a finger lying under a handguard held the whole finger
  straight: a saucer. A finger already inside at open opens back out. A thumb inside
  swings out at its base, along the thing's side (up to 70°). Neighbours are drawn to
  within 0.35 of each other's curl. Every try is held to the finger limits the bake
  applies afterwards, and to the ease-in blend: found against straight bind-pose fingers,
  the limit re-curled them past the contact, and searched at full weight the blend put
  the base clip's fingers into the can.
- **A HELD THING IS SHAPED WHERE THE HAND REALLY IS** (`handShape`): built from the hand
  after it's placed, not from where it was sent. During an ease-in, or after the clip law
  moves the arm, they differ by centimetres. A thing held from the first frame keeps its
  fingers on it while the arm is still at rest (`wrap.w: 1`). `grip()` used to return
  at weight 0 and left the clip's own fingers inside the can.
- **HOW A HAND HOLDS A GRIP is now the STANDARD SEAT** (`cal.json` z/y, what the game
  parents a gun with). Every gun clip had failed "held" on the shooting hand. A
  cross-section in the hand's own frame showed why: the gun's angle in the hand had been
  copied from Mixamo's aiming clip, whose hand bone sits differently from a real grip, so
  the carbine's grip ran out of the palm toward the fingertips and the fingers curled in
  front of it. The standard seat now holds the grip the way a power grip does: along the
  palm's crease, from the heel of the hand on the little finger's side to the index
  finger's base (the thumb side, 20° toward the fingers), the palm on the grip's right
  side. What the mocap held is kept as each gun's AIM (`aim`), and the wrist turns to
  keep the barrel there. `anim-build.cjs <body> --gun-cal` writes both.
- **EACH GUN'S SEAT IS MEASURED** (`gunSeat`): the shift that puts the grip on that line,
  with a deep grip's FRONT STRAP AT THE KNUCKLES. Centred on the channel, the carbine's
  5 cm grip stood 2 cm past the knuckles and the fingers caught only its corner. The bake
  and the render page measure it the same way, and the numbers match. The pistol's
  support cup is placed off the SHOOTING FIST, not the gun, because it wraps the hand.
- **THE SHOTGUN IS HELD BY ITS WRIST.** A straight stock has no pistol grip, and the grip
  point read off the bench sat 4.5 cm in front of the wrist, under the trigger guard, in
  the air (`guns.mjs`, measured off the gun's own solid now).
- **THE FINGERS CLOSE ON THE GRIP, NOT THE GUN** (`wrap`'s `contact`): closing on the
  whole carbine, the middle finger's tip met the magazine 7 cm out with the finger
  straight. A straight finger, where every search starts, already lay in the magazine,
  so the search runs against the grip and the finished finger is checked against the
  whole gun. The TRIGGER FINGER closes on the whole gun and stops at the trigger. A finger
  may also shift its bend toward the knuckle to lie along a thick grip instead of
  hooking over it (`share`).
- **THE RIFLE'S SUPPORT HAND** goes into the channel round the handguard, sized by its
  depth along the palm's direction (its nearest surface is its half-width, and the hand
  sat too high), and the body chooses how far the hand turns toward the gun. The depth is
  read along the palm the hand actually reached, not the one it was asked for: read
  slantwise it came out 3 cm against 1.5. The fingers arrive on the handguard or pump
  round the support point, never on the receiver.
- **THE SUPPORT HAND REACHES THE SHOTGUN'S PUMP.** The recordings held a carbine, and the pump
  sits 10 cm further out. Three fixes: whether the clip's hand is on the gun is judged from
  where the carbine's handguard would be; a short reach takes the pump's back end (up to
  6 cm); and the shoulder comes forward up to 12°, the way a reach does. On a walk, Eric's
  fully straight arm reaches 63.3 cm and the pump needed 62.5-64.9.
- **THE SUPPORT TURN IS CHOSEN WITH THE PALM ON THE GUN** (`PALM_GAP`): a centimetre of gun
  off the palm costs what a finger not gripping does. The turn options now start at 0.
- **THE SUPPORT HAND RIDES THE GUN THROUGH THE SMOOTHING.** Taking a twitch out of the right
  wrist swings the gun about the grip: 3.5° left the support hand 2 cm off the handguard.
  Wherever the smoothing moves the right arm, the left hand is moved with the gun and the
  left arm reached again.
- **FINGER RANGES ARE POOLED ACROSS THE CAST.** Recorded fingers barely move, and each body's
  range came from its own copies of the recordings: one body's thumb base spanned 60° on an
  axis. A finger joint may go where any survivor's recorded finger went
  (`anim-natural.cjs` writes the union into every `natural-base.json`; `ownFingers` keeps each
  body's own). A thumb may go 6° past that (`THUMB_SLACK`), inside the check's own 8.
- **THE SEAT KEEPS THE GUN OFF THE THUMB'S BASE AND OUT OF THE PALM.** Seated for the grip
  alone, the receiver sat where Carla's thumb is; kept off the thumb alone, the shotgun's
  stock slid through her palm. Only the thumb's BASE is kept clear: at rest the rest of the
  thumb sticks out across where a grip belongs.
- **NO PAD'S GIVE AGAINST A GUN.** Pressed 4 mm into the pump for the palm pad, the support
  hand's knuckles sat inside it, where no curl of a finger can get them out.
- **NO FINGER IN A GUN, LAST.** After all smoothing, each frame is posed as it ships, and a
  finger sunk into the gun is opened just far enough to lie on it; a thumb that's in it
  even straight swings out at its base. The opening is spread over a third of a second:
  opened frame by frame, the fingers flickered.
- **A GUN IS SOLID TO A HAND.** The HK416's handguard is a slotted tube and the pump a
  sleeve, and the hand check's "held" landed in the hollow of every rifle. The gun's field
  fills each slice across the bore (gaps up to ~1.6 cm closed). "held" also allows half a
  finger's thickness: a hand cradling a handguard has the palm's pad between them.
- **THE HAMMER** taught three more things. The nail was placed off the hips EACH FRAME
  while the drawn board stayed where the hips were at frame one, so the hands aimed at a
  nail a few cm from the visible one. The left hand now braces the board: pinching the
  nail put its knuckles in the head's path. The nail stands 3 cm proud, and the head
  strikes its head.
- **THE SHOTGUN'S GRIP ANGLE:** the shotgun rides the rifle animations and the rifle's
  angle in the hand, but its stock wrist leans 38° and the carbine's grip 18°. `gunPose`
  turns it back by the difference, so its wrist lies on the carbine's line. The lean was
  also applied TWICE, at the clip's aim and again in the hand, which pitched the barrel by
  double the lean. That is the "barrel dropped 40°" once blamed on the sign. It is counted
  once now (`handAxesFor` reads the gun's axes through the lean), and the barrel is the
  clip's aim.
- **THE SUPPORT HAND'S TURN IS CHOSEN FOR THE WHOLE HAND**: options from 0.25 to 0.85,
  each scored by arm comfort plus 4 per finger that isn't gripping (closed on nothing,
  or opened out of the gun; `h.wrapBad`). Fixed at 0.6-0.9 so the fingers would wrap,
  the support wrist bent past real ones on 49 shotgun and 17 rifle clips. Scored on
  arm comfort alone, it picked the turn that left a saucer.

**ROLLO'S BODY (Oct 22 2026).** Josh: *"make sure that Rollo's character was included in
this animation mapping too"*, and his look: a realistic hazmat suit. The suit is
**"Hazmat Suit Worker Character" by SKP_GAMES** (Sketchfab, **CC-BY-4.0**, credit
required), dyed his casino purple (the game's own purple filter, `suitcolor.ts`, run over the casino's yellow suit). It is one static mesh whose gloves are mittens with
painted-on fingers, so `scripts/survivorz/rollo-build.py` (Blender 5.2, run headless)
puts it on **Eric's rig**. That way every move, gun, prop, hug and check works on Rollo
unchanged. Rollo bakes as the seventh survivor (88 bones, `SURVIVORS` in
`anim-build.cjs`, `RP` in `manifest.mjs`).
- **The arms:** Eric's arms are aimed down onto the suit's (each bone by the line to its
  CHILD joint, since glTF bones have no tails) and that pose becomes the rest.
- **The weights:** the suit takes its weights from Eric's fitted body underneath (nearest
  surface, interpolated: the way clothes are skinned). Then each suit vertex is held to
  its own limb. A baggy suit's back and sides lie nearer the hanging arm's skin than the
  torso's, and with arm weights they ballooned out behind a raised rifle.
- **The rest pose:** the arms go back to the A-pose the other six rest in. From an
  arms-down rest, a shouldered rifle turned the shoulder 120°.
- **The hands:** the mittens are cut off past the ribbed cuffs, and Eric's own skinned
  hands go on in black rubber, as the casino Rollo's gloves are.
- **The air pack** is a loose part standing 20-30 cm off the spine. Weighted vertex by
  vertex across three spine bones, a rifle aim's twist sheared it into a dome off one
  shoulder. Every pack vertex now carries the same chest weights, so it rides as one
  block. **The pack is more than its loose parts** (Oct 28 2026, Josh: "the back part
  seperates when he walks"): a glTF's loose parts are its UV islands, and the shell and
  plate are only the pack's back face and bottom; its sides, top and rim are the edge of
  the torso's islands. Those stayed weighted vertex by vertex, so the rigid back face and
  the bending sides split apart along the seam on every clip (up to 46 cm, the unpainted
  suit showing through). Now everything over 7 cm off his back inside the pack's outline
  rides with the chest, the fabric within 8 cm of it across the surface eases off it, and
  **every seam point's vertices share one weight** (101 had differed, some all hip on one
  side, all chest on the other). Measure: `node scripts/survivorz/rollo-pack-check.mjs --all`
  (cracks 0 on all 803 clips; stills `docs/survivorz/rollo-pack-before.jpg` / `-after.jpg`).
- **The hood and mask** were on Eric's face bones (jaw, lips, eyes) and moved with his
  face. They're on the head now.
- **The suit is skinned by vertex neighbours, too.** One stray vertex at the waist took the
  left forearm, and the faces joining it to the hip stretched from the raised hand to the
  belt. Each vertex's limb now agrees with most of its mesh neighbours. Nothing past a
  wrist can be arm: the thigh pockets lie against the hanging hands.
- **THE PERSON INSIDE** (`rollo_body_proxy`, Eric's body cut to 8,000 faces, hidden by
  every page): the animation law reads the TORSO off him and the LIMBS off the suit.
  Read off the suit's own torso (the air pack, the baggy hips), Rollo's own arms and
  thighs measured 10-19 cm inside it on 79 clips, and the bake threw them wide to clear
  air. A sleeve may now press into the suit's chest, never through him. A gun's butt, a
  partner in a hug and the hands still use the suit, which is what they actually touch.
  **The game must not draw the proxy** (any mesh named `*body_proxy*`).

**THE MECHANICS ROUND (Oct 23 2026).** Josh asked for the animations to be checked against
`docs/survivorz/MECHANICS-BRIEF.md` (the peer's `ASSET-CHECK.md` marks every line have / close /
gap), then "whatever you recommend" for the order. What it added:
- **THE RECORDED CLIPS GO THROUGH THE LAW TOO** (`anim-law-recorded.cjs`). Until now only built
  moves did. On Eric 16 recorded clips clipped past 3 cm on whole frames (fingers into the chest
  when lying, arms into the torso in the rifle deaths). Each one that fails `anim-clip.cjs` is
  baked through the bake with nothing added (`lw:<clip>`, under its own name): the arms cleared
  of the body, the joints held to the cast's range, twitches smoothed. The raw retarget is kept
  in `out-raw/<body>/` so a rerun starts from the recording. The law clears ARMS; a thigh into
  the belly in a deep crouch (`mx-throw-object`, 6 cm, one frame) is still recorded as it is.
- **THE CASINO'S GESTURES ARE ON THE SURVIVORS** (14: talking ×2, arguing ×2, yelling,
  laughing, shrugging, cheering, disappointed, fist pump, salute, blowing a kiss, sitting
  talking and laughing).
- **THE TURNED** (`manifest.mjs`): a survivor who turns rises as a zombie in their own body, so
  every zombie move is on all seven survivors too (the walks, idles, attacks, stand-ups,
  deaths, and the finisher's zombie halves as `fza-`). Not the giants. 62 clips each.
- **HELD THINGS** (`HELD` in `anim-recipes.js`): a thing in the right hand through a recorded
  clip, baked as `hd-<thing>-<clip>`. Each is a size and a shape: the fist closes on its HANDLE
  and nothing sinks into the rest. Knife (7 clips), pipe, hammer and crowbar (13 each), fire
  axe (4), walkie and recorder (the phone-talk loop), a scalpel (the kneeling work loop), and
  the three throwables, molotov, noisemaker and pipe bomb, on both throws. A throwable is gone
  at `RELEASE` (the frame the hand passes the head moving forward fastest, measured), and the
  game spawns it in flight there; the throw that starts by picking it off the floor has it
  only from the grab (`PICKUP`).
- **THE FIRE AXE IS TWO-HANDED, BAT GRIP.** Every axe clip we have is one-handed. Put 30 cm up
  the handle, the left hand couldn't reach on the swings and the axe was swung in one hand.
  Stacked under the right, like a bat, it reaches throughout. It rides ONLY the chop
  (`ual2-treechopping-loop`) and a built two-handed idle (`bd-axe-idle`, at port arms): on the
  sword idle, the heavy combo and the horizontal sweep the forced left hand took the left arm
  12-18 cm through the chest on every body. **The sweep that hits two is still close.**
- **HELD THINGS AT THE REAL PROPS' SIZES** (the asset bot's `props/props.json`, which also records
  each prop's grip): the pipe 58 cm, the fire axe 90 cm, the pipe bomb 7.5 cm across, the bottle
  8 cm, the molotov 8 cm, the walkie's body 6.2 x 16.5 cm with its antenna to 25 cm.
- **A FINGER IN ANY HELD THING IS A FINGER IN A GUN**: the last pass that opens a finger sunk
  into the gun now covers held things, and anything a recipe names `solid` (a lever, a sheet).
- **BUILT MOVES ADDED:** drinking from a bottle, eating a bar, taking pills (`ual2-consume`
  turned out to be a hand lifted to the chin and dropped in 1.3 s; nothing reached the mouth).
  The thing's END goes to the lips, the head tips back for a bottle, and a bar is held like a
  microphone under the chin. Also reading a note (both hands pinch its edges, the head going
  down the page), throwing a breaker (an overhand pull on an L-handle), turning a walkie down,
  dozing on watch (two nods and a jolt), refilling a bottle at a sink, and the ARM WOUND: the
  hurt left arm carried across the belly on the injured walk and idle, and the pistol fired
  one-handed with it (`gp-1h-*`, four clips).
- **PAIRS ADDED** (baked per pair like the hug, `anim-build.cjs --hug`; the gap or the place a
  pair stands in rides the clip as `built.gap` / `built.place`):
  - **Comfort** (`bd-comfort-<partner>`): a hand on the partner's shoulder at arm's length (the
    hug's gap + 0.32 m), a slow rub and a squeeze; the partner plays `bd-comforted` (head bowed,
    a hand wiping the eyes once).
  - **A kiss** (`bd-kiss-a-` / `bd-kiss-b-<partner>`): both lean in, heads tipped opposite ways,
    the mouths solved to meet; "a" holds the partner's back with the hug's arms (they go out
    round the flank, never through), "b" the partner's upper arms.
  - **The revive** (`bd-revive-<partner>`, the partner plays `mx-receiving-cpr` at
    `built.place`): the recorded CPR is compressions kneeling upright, then a long lean for the
    rescue breaths. The partner is placed by both, its lower breastbone under the hands and its
    mouth under the reviver's at the deepest lean, then shifted until the reviver's knees are
    clear of it. The hands stay on the breastbone through every compression, pressing the
    clip's own stroke at most 4.5 cm in, fingers lifted. The reviver leans the rest of the way
    to the mouth when the bodies differ in size, and the arms are kept off the partner's
    actual skin as posed that frame.
- **WHAT THE PAIRS TAUGHT:** the overlap check banded a partner's torso by HEIGHT, so a body
  lying down read as one giant disc; it bands along the partner's own spine now. The partner
  can be posed in any of its own clips (`partner.pose(clip, t, place)`), and a recipe can look
  at its own clip at other times (`h.peek`) to find moments like a compression or a breath.
  The self-clearance law that runs after a recipe swings elbows for the body's own sake and
  undid the revive's clearance of the partner; a pair recipe can turn it off (`unclip: false`)
  once its own arms are proven clear of both bodies.
  - **The mercy kill** (`bd-mercy-<partner>`, the partner plays `mx-sitting-idle` at
    `built.place`): the pistol's level aim, the shooter leaning forward from the waist until the
    barrel's line meets the sitting partner's head about 0.85 m out (the aim-down clip pointed
    nearly straight down and sat the partner against his shins); the partner faces him. The
    shot is `gp-ual1-pistol-shoot` from the same place.
  - **Bandaging someone else** (`bd-bandage-other-<partner>`, partner on `mx-sitting-idle`):
    the forearm resting on the partner's knees is the wound (its arms are round its knees, over
    the shin); the bandager kneels, steadies the wrist from below and takes the roll over the
    forearm in arcs. A full orbit round a limb turned the wrist through 173 degrees.
- **THE LAW FOR LEGS** (`unclipLeg` in the bake): a thigh into the belly (deep crouches, kicks,
  climbing up, the zombie stand-up, kneeling with a rifle; up to 17 cm on Carla and every
  bulky-suit crouch on Rollo) is cleared like the arm's elbow: the knee swings out round the
  hip-to-ankle line, so the foot stays planted and the knees open, as a body squats. It runs on
  every baked clip, the recorded ones going through the law included. Measured on the sword
  combo: 10 cm cleared for 14 more degrees of hip turn on a clip already 36 past range.
- **ONE MORE THING THE GUN TAUGHT:** fitting a gun twice in one frame compounds (it adjusts the
  arms each time), so a recipe that searches (the mercy kill's lean) saves the arms and the
  support hand's eased weight and puts them back between tries.
- **THE BITES BY LOCATION** (`anim-build.cjs --zpair [zombie] [survivor]`, baked on the ZOMBIE
  with the survivor its partner, `out/<zombie>/zd-bite-<forearm|shoulder>-<survivor>.json`, the
  survivor's place in `built.place`). The survivor's half is a built move of its own,
  `bd-bitten-forearm` (the forearm thrown up across the face, bitten, yanked back and clutched)
  and `bd-bitten-shoulder` (grabbed at the side, the head away, the other hand shoving, then
  clamped on the wound). The zombie stands where its clip's mouth goes furthest forward through
  the bite, its mouth is solved onto the skin there, its hands grip either side of the bite on
  the skin, and its skull is pushed back out of the survivor wherever it would sink in. The
  zombies' rigs carry other bone names; `canon()` in anim-law.js maps them, so every check and
  every recipe reads one vocabulary. Measured: the forearm bite 0–2 cm, the shoulder 5–6 cm
  (the gripping fingers).
- **THE BITES, MEASURED OVER THE WHOLE CLIP** (rounds 17-19): sampled only mid-bite they read
  0-6 cm; sampled start to end (while both halves play) the shoulder bite was 13.5 cm median and
  41 at worst. Four fixes, each a rule for any zombie-on-survivor move:
  - **It lets go.** After the bite the zombie staggers back 32 cm over 0.6 s; its recorded clip
    lunged on through where the survivor stood (an arm 41 cm into Rollo).
  - **Its hands stay on the skin the whole clip**, not just inside the bite window, and the skull
    push-out runs the whole clip too.
  - **Where a hand grips is chosen per survivor**: the spot along the limb furthest off the
    survivor's body at the bite (by the elbow, a small survivor's chest was under the fingers; a
    third of the way down, Rollo's suit was).
  - **The survivor's own half aims at the zombie's FACE**, and a cross-body reach goes elbow up and
    forward with the whole path bowed out in front: blending two reaches (shove, then clamp) cut
    the forearm 10-18 cm through the survivor's own chest.
- **THE LEG BITE, THE KNIFE AND THE STAMP** (Oct 23 2026, the zombie gaps):
  - **The leg bite** is the pack's ankle grab (`fz-lying-leg`) with a HOLD put in at 2.0 s, when the
    survivor is down on their back and the crawler is over their shins: the survivor's half is
    `bd-bitten-leg` (curled up off the floor, the bitten leg jerking, a hand straining at the head
    it can't reach); the zombie's is `zd-bite-leg-<survivor>` (mouth on the upper calf, hands on the
    shin and the other knee), then the pack's climb goes on. A recipe can hold its base clip on a
    frame with `time: (t) => baseTime`. A zombie lying face down has its face toward the FLOOR, so
    its mouth is taken off the head bone's own facing (measured once from its standing idle), not
    the body's forward.
  - **The survivor's moves on a zombie** bake in a fourth mode, `anim-build.cjs --zvictim
    [survivor] [zombie]` → `out/<survivor>/zv-<move>-<zombie>.json`, the zombie stood where the
    pair's placement says (handed to the page as `presetPlace`):
  - **The knife that ends a grab** (`zv-knife-head-<zombie>`, against the pack's front struggle):
    a HOOK — a knife held forward-grip has its blade square to the forearm, so a straight thrust
    needed a 90° wrist bend the natural law refused and the tip missed by 16 cm; coming round, the
    forearm level across the face, the blade lands in the side of the head (tip 6.5-9 cm from the
    head's centre on three pairings tried). The game swaps the zombie onto its death at 0.95 s.
  - **Kicking free of the ankle grab** (`zd-kicked-<survivor>` on the zombie, `zv-kick-free-<zombie>`
    on the survivor): the survivor in front of the crawler's head, the ankle yanked out of its hand
    (that IS the kicking free), the stomp on the back of its head, the head driven down to about its
    shoulders' height, the foot turned across the head (chosen ONCE at the impact — picked per frame
    it flipped and the leg popped), the recorded backswing taking the foot away from the body. Baked
    at 60 fps (`fps: 60` on a recipe): at 30 the game's blend between two clean frames cut 10 cm
    through a shoulder. Measured: 0-5 cm on Eric and Sophia; **14.6 cm on Rollo's suit** (open).
  - Lessons: a clearance pass that switches on at a threshold is a pop (the foot jumped 37-47 cm
    in a frame) — fix the placement or the design instead of lifting after the fact; and check the
    in-between moments, not just the baked frames.
- **THE FINISHER PACK ON OUR BODIES** (checked Oct 23 2026, every pair, the zombie's hands, its head
  and the skin overlap at 31 moments a clip): the pack's placements put the lying family (the
  crawler's tackle and ankle grabs) apart for the whole clip — no contact at any frame, the crawler
  ending past the survivor's head — and the rest 7-19 cm into each other, the pack having been made
  on a slimmer mannequin. `docs/survivorz/anim-pairs.mjs` now carries placements solved from the
  contacts and refined on the overlap (one per struggle chain, since those clips play back to back
  and the survivor can't slide between them): the front family 10-19 cm → 0-10, the lying family in
  contact. **What placement can't fix is a floor of about 5-12 cm** (20-26 cm on Rollo's suit
  against a big zombie): the pack's bodies pass through ours. Fixing that is a FIT pass on the
  pair (the bites' machinery: hands onto the skin, the body pushed out), and since a clip is baked
  per body it is per pair (see THE FINISHER FIT below). `fz-up-down-v3` is not a ceiling
  ambush at all: the SURVIVOR drops head-first onto the zombie and ends kneeling over it.
  **Sample a clip at 30+ moments before believing an overlap number**: at 13 the refines read
  several pairs as 0 cm that were 8-12.
- **THE OVERLAP NUMBER** a pair is judged on is the sixth-deepest vertex (`d6`), not the deepest:
  two stray vertices of a sleeve read 16 cm where the arm itself was clean. The deepest still
  prints beside it.
- **THE FINISHER FIT** (Oct 24 2026; Josh: "do what you recommend" — a fit per pair, since the game
  renders on one machine for the stream and +~19 MB a zombie is that box's disk, not a viewer's
  download). Each zombie's half of the 25 finisher clips is baked again against each survivor at the
  pack's placement: `zd-<fz clip>-<survivor>` on the zombie (`anim-build.cjs --zpair`,
  `ZONLY='^zfit:'`); **the game plays that clip on the zombie, and on the survivor whichever clip
  `docs/survivorz/finisher-fit.json` names for the pair (THE FINISHER TABLE below).** What it does,
  and what each piece taught:
  - **It scores SKIN, not bones.** Bone points with allowances read zero while a crawler's pelvis
    and thighs were 13 cm through the survivor in a tackle. Both bodies' skin is sampled (every
    24th vertex, only the points within 45 cm of the other body), the zombie's against the
    survivor's torso and the survivor's against the zombie's torso.
  - **One continuous solve** bends its spine, neck, head and legs and slides its hips sideways (up to
    15 cm). **Every joint is probed from the SAME pose and they step together** (a fixed-size step
    along the gradient, halved until it really lowers the cost) — the first cut probed them one after
    another against the round's OPENING score, so once one joint helped every later one read as
    helping too and they all ran to their limits: the zombie's feet were swept up to 64 cm across the
    floor (Oct 24 2026, found and the whole set rebaked). **Warm-started from the previous frame**: solved
    from scratch each frame it landed somewhere different one frame to the next (the head 21 cm in
    one frame after a clean one). That one change took the tackle from 13 cm to 3.7.
  - **Never up**: let it lift, a crawler lying on a man floated a hand's breadth over him, which
    measured clean and looked like a ghost. Hanging from the ceiling, the legs stay as recorded.
  - **The grips put back**: a hand that was on the survivor before the fit goes back to the same
    spot on them after it (pushed clear, a zombie grabbing from behind held nothing).
  - Measured on the tuning pairs: the struggle 6.7 → 2.6 cm, the grab from behind 4.9 → 2.9, the
    tackle 15.6 → 4.4, the ceiling drop 19 → 0, eight other clips 4-11 → 0-4.
  - **Bends RELAX** toward the pack's own motion (a quarter-second time constant) once the contact
    ends: started from the last frame's answer and never let go, a bend made for a moment's contact
    stayed for the rest of the clip.
  - **Planted feet stay planted**: after the solve, any foot that was on the floor in the pack's pose
    is put back on its spot by the legs (within 1 cm), so a hip slide reads as weight shifted over
    still feet, not a skate. **An overlap number means nothing without a foot-drift number beside
    it** — the first fit's better overlap was bought with skating.
  - **THE SURVIVOR'S HALF** (`zv-<fz clip>-<zombie>` on the survivor, `anim-build.cjs --zvictim`,
    `VONLY='^sfit:'`): the same solve on the survivor against the zombie's fitted half, plus its
    shoulders and upper arms, a 25 cm slide, and the hands pushed out of the zombie straight away from
    its spine. Baked for the 14 clips the zombie's half left weakest; kept only where it beats the
    pack's own clip for that pair (709 of 1,862 — the rest were moved out of out/).
- **THE FINISHER TABLE** (`node scripts/survivorz/finisher-table.mjs <zombie sweep> <survivor sweep>`
  → `docs/survivorz/finisher-fit.json`): per zombie, per survivor, the finishers that MEASURED within
  the line, and whether the survivor plays `fz` (the pack's clip) or `zv` (its fitted clip). **A
  finisher not in the table never plays for that pair** — that is how the law holds where no fit
  could. The struggles are chains (grab → held → bite or break free), so a link is listed only if its
  whole chain is clean. Oct 25 2026: 2,455 of 3,325 pair-clips (74%; 59% from the zombie's half
  alone); every pair keeps at least 11 of the 25 (zombie-m09 on Manuel is the fewest). Weakest:
  `fz-lying-leg-back` (13% of pairs), `fz-up-down-v3` (34%), the lying pair (~40%).
  **The same table covers the BITES and the TWO-SURVIVOR MOVES** (`--bites <dir>` / `--duos <file>`, Oct 26
  2026): `bites` per zombie per survivor (forearm 131/133 pairs, shoulder 57, leg 47 — 235 of 399), `duos` per
  pair (hug, kiss, revive, bed, comfort, mercy, bandage — 198 of 252). **And `--self <dir>`: a clip that clips
  into its OWN body never plays** (anim-clip.cjs's logs): a fitted survivor half that bent an arm into its own
  chest falls back to the pack's clip or is dropped — four did.
- **THE BITES, ROUND TWO** (Oct 26 2026): the shoulder bite's fingers curled 70% round a shoulder blade and
  sank 15 cm into the back — now the FINGERTIPS are kept on the skin (the hand backed out from the spine at the
  deepest tip, the curl easing if that isn't enough), the elbow swung round the shoulder-to-grip line as a
  continuous angle (never a per-frame pick between directions — that flips and pops), and the face held a
  little further off the skin. **THE LEG BITE RIDES ON THE FITTED FINISHER**: after the hold the crawler climbs
  on as the pack's lying-leg goes on, so `zbite-leg@<survivor>` is baked on `zd-fz-lying-leg-<survivor>` and
  the survivor's `bitten-leg@<zombie>` (`bd-bitten-leg-<zombie>`) on its fitted half where the table plays
  that. A per-pair variant is `recipe@other`, baked only by exact name.
- **THE HUG, BOTH HALVES TOGETHER** (Oct 26 2026): each half was fitted to a partner standing still in the
  idle, so two halves each clean against a statue went 6-11 cm into each other. Now (`o.mate`) the arms and
  face are kept clear of the partner AS POSED in its own half of the hug at that moment, baked in turns (every
  under against its over, repack, every over against the new under); the face judged on the head's own skin
  (eyes, nose), and the hands' spots put back on the partner's real surface as it leans in. 4 → 12 of 21
  pairs; the eight it made worse (every pair with Rollo, Eric/Manuel, Carla/Claudia) keep their old clips.
- **THE REVIVE** (Oct 26 2026): no bend in the breath lean that sinks a big reviver's head or chest into the
  patient, and bent back out if the recording carries it in; the chest found up to 40 cm off the spine
  (Rollo's suit); fingertips kept on the chest once the hands are mostly on it, and kept off her skin when
  they're at her face. 15 → 24 of 42 pairs. **A reach at a PARTIAL weight pulls the hand back toward the
  recording's** — the first cut's fingertip lift did that mid-transition and sent 21 pairs' fingers into the
  patient; it now lifts at full weight from where the hand is, only once the hands are mostly on the chest.
- **THE AXE CHOP ON A BROAD CHEST** (Oct 27 2026): at the top of the chop the axe is over the right shoulder
  and the left hand on its handle; on Manuel and Rollo the left arm went 12-20 cm through the chest to reach it.
  The right hand — and the axe — now slides toward the midline, only as far as the left arm needs (at most
  24 cm, carried between frames), which is how people chop anyway. Clean on all seven; the first attempt
  (twisting the back) cleared the numbers by lifting the left hand OFF the handle — always look at the stills.
- **STILL NOT PLAYED** (the table's `solo`): the one-handed pistol on Manuel and Rollo (the arm's root at the
  armpit, 6-8 cm — moving the shoulder or the hand didn't clear it), Rollo's second rifle reload, Claudia's
  folded arms and a finger in one death clip, Carla's grapple-end.
- **THE SHARED BED** (`bd-bed-<partner>` / `bd-bed-held-<partner>`, baked per pair): two singles
  pushed together, both on their backs on the recorded `mx-laying-sleeping`, the partner 60 cm to the
  right (`built.place`); one's right arm across the other's lower chest, the other's left hand up on
  that forearm, both heads turned in. Lying on the back the face points up, so a head is turned by a
  solve on its face direction (from the head bone's own turn), about all three axes.
- **PULLING A ZOMBIE OFF SOMEONE** (`zv-pull-off-<zombie>` on the rescuer, `--zvictim`): no
  three-body bake needed. The held survivor plays the pack's breaking-free (`fz-front-struggle-free`),
  in which the zombie is thrown ~1.5 m back; the rescuer stands at its back-left (42 cm ahead, 62 to
  the side), takes its near shoulder and collar, twists to throw it past and lets go once it's
  alongside. 0.7 cm worst on Eric against zombie-m01.
- **STILL GAPS, needing source moves we don't have:** a sidestep, firing a pistol while downed,
  and the vent's entry and exit.

**THE TOOLS ROUND (Oct 21 2026), built in code** (`scripts/survivorz/anim-recipes.js`,
props drawn in the review from the same hand frame the bake fits): flashlight
walk + run, injecting, opening a can, keypad, keycard, crowbar prying, holding a
door shut, dragging a body, the look back over a sprint (each shoulder), lighting
a molotov, and freezing (hands cupped at the mouth). Josh's first pass flagged
four: the can's hands, the crowbar's arms, the injection clipping, and the
molotov going behind the head — all rebuilt, and the shiver rebuilt twice
(folded arms and a self-hug both sank the forearms into the chest on some bodies).

**THE GUNS ON THE RIFLE SET.** Every clip of the rifle set (55: the pro rifle
pack and Mixamo's separate firing, aiming, kneeling and reload downloads) is
baked once per gun: `gr-<clip>` HK416, `gs-<clip>` shotgun (52 — a pump gun
reloads shell by shell, `bd-shotgun-load`, not with the magazine reloads).
How a gun sits in the fist is MEASURED: in the pack's aiming clip Mixamo's left
hand is on its own rifle's handguard, so fist-to-left-hand is the barrel and
level is up, kept in the hand's frame per body (`anim-build.cjs <body> --gun-cal`
-> `props/guns/cal.json` — the one offset the game parents the gun with). Clips
from the other downloads held their rifle at other angles, so each clip's own
seat is measured too and the wrist turned to give that pose through the one
standard seat. Where a clip's right hand swings the gun about (a sprint swung it
level to 34° down four times a second; turns), the gun is anchored to the body
at its average carry — angle held against the hips, place riding the chest —
and the hands go to the gun. The left hand is pinned to the handguard or pump
and lets go on its own when the clip takes it away (reloads). The review videos
draw the real gun models.

**The fixes from the first gun review (Oct 21 2026).** The JUMPS left the ground
only on paper: the rifle pack's jump-up / jump-loop / jump-down are in-place
clips made for a game that lifts the body itself, so `anim-jump-fix.mjs` bakes a
real arc into the hips (take-off at the end of the push, a 35 cm apex held through
the air loop, a free fall into the landing) — **the game plays these three as
they are and must not add its own jump arc on top.** The SPRINTS carry the gun at
PORT ARMS (across the chest, grip by the right hip, muzzle up to the left, both
hands on); the averaged carry put it low at the hip and the left arm had to cross
the body to reach it.

**THE PISTOL** (Josh: "also get the free pistol as well") is the one gun not from
the pack: Poly Haven's **Service Pistol** (CC0, Mateusz Sadek), its loaded
magazine put back up the grip and its slide a separate piece. It rides the
pistol set (27: Mixamo's handgun locomotion pack, its shooting clip and the UAL
pistol clips) as `gp-<clip>`. A pistol isn't held like a rifle's pistol grip, so
it has its OWN seat per body, measured over Mixamo's two-handed aim down the
sight line (eye through the sights) — `cal.json <body>.pistol` — and the support
hand cups the shooting hand rather than reaching for a handguard.

**A gun is seated by the hand BONE, not the fingers.** The hand's frame for
props reads the palm off the fingers' curl, and two Mixamo downloads (firing,
reloading) and the whole pistol pack pose their fingers so that reading flips.
Inside the bake that was self-consistent, but the GAME parents a gun to the hand
bone — so every gun clip now seats, measures and draws its gun through the rigid
frame (`handRigid`: fingers along the middle knuckle, palm across the knuckles),
which is exactly what the game will do.

**Everything is converted onto one skeleton per body family** with the
existing retarget tool: the survivors' Renderpeople rig, the zombies' own
rig. The library is complete (assessed 2026-10-20, all in
`assets/New Assets`):

- **Mixamo** (Josh's downloads): melee, rifle and pistol sets, hit reactions,
  falls and get-ups, the injured set, crawling, lying coughing, moaning and
  vomiting (the infection stages), searching, CPR (the revive), carrying,
  climbing, throwing, zombie attacks, bites, feeding, deaths.
- **Quaternius Universal Animation Library 1 + 2** (CC0): lying down (played
  backwards), a shove, opening and forcing doors, kneeling repairs, axe
  chopping, sword-style melee combos, eating.
- **Anderson Rohr's Halloween mocap** (free, commercial OK, no
  redistribution): zombie walks, monster attacks (the lunge, door banging).
- ~~**The shotgun** (Sketchfab "Animated Shotgun", CC-BY, teenjust500)~~ —
  retired Oct 21 2026: guns come only from the pack Josh bought (see the laws above).
- **Skipped:** MocapOnline's pistol starter (a different skeleton, redundant).

**Moves built in code**, not clips: the keypad press and the shotgun pump
(hands pinned to the real object), being grabbed and struggling, dragging a
body (a ragdoll), the panicked run (head snapping back over the sprint), the
crawler's ankle grab. **New tech:** an upper-body animation layer, so
swinging, aiming, reloading and bandaging play over walking and running.

**What some moves are for (Josh, Oct 21 2026):** `agony` plays when a survivor starts to go insane or hits maximum fear; `lying-down` is getting into a bed in the map's **safe rooms** (Resident Evil style, with beds the survivors sleep in) — it starts on the bed's edge, so the game sets the body on the bed. The Mixamo "laying" clips (coughing, moaning, sleeping) lie on the floor; a bed or cot raises them.

**Housekeeping at conversion:** strip forward travel (the server moves the
bodies), trim long takes, a contact sheet per clip so each one is looked at.

**The intake pipeline (phase 2, built 2026-10-20, uncommitted).** Everything
is staged in the gitignored `assets/downloads/survivorz/` (no-redistribution
licences); the tools are in `scripts/survivorz/`:

- `retarget.html` — the bench, generalised from the hazmat one: any of
  Mixamo / UE4 (Quaternius) / UE5 (Halloween) / the pack's Auto-Rig Pro onto
  a Renderpeople body, a zombie, or the hazmat, through one table of 52
  canonical joints (fingers included). Each target bone takes its source
  partner's world rotation as a change from rest, after the target is stood in
  the source's rest pose. **The rest pose comes from each mesh's own bind
  matrix**, not three's `skeleton.pose()` (which assumes the mesh sits at the
  origin — wrong for the pack's 0.01-scale armatures).
- **Every clip is measured, not just looked at:** the worst angle between a
  source bone and its partner over the clip. 1,260 survivor bakes and every
  zombie bake read 0.0°; the Halloween clips read 6° at the spine (UE5 has
  five spine bones against our three) — accepted.
- **The two Renderpeople bind families** (rigged bodies vs the animated
  samples, 45–51° apart at the arms) are handled by baking **per body**: a
  clip is local rotations on that body's own bind, so Rick's clips are not
  Ben's. Half a second a clip; the whole library is ~45 minutes.
- **Forward travel** is stripped from the hips and kept beside each clip as
  `travel` ([t, dx, dz] at 10/s, metres on a 1.8 m body), so a one-shot (a
  fall, a stagger) can slide the body in the game while loops play in place.
- `manifest.mjs` sorts the shelf: **210 clips per survivor** (Mixamo less the
  zombie moves, 35 UAL1, 27 UAL2) and **56 per zombie** (the Mixamo zombie
  set, human falls/get-ups/hits/deaths, UAL zombie moves, Halloween walks,
  attacks and the two giants — no vampire, no spells). Long takes kept to 10 s.
- `retarget-batch.cjs` bakes a body's list (Playwright, swiftshader) and
  `sheet-pages.mjs` lays out the sheets: start, middle, end, and the middle
  from the side.
- `zombie-export.py` (Blender) exports the 19 zombies to their own GLBs at
  the origin, **skin colour baked** through an emission pass (exact; a
  diffuse bake darkens metallic and subsurface), textures shrunk to 1K —
  2–5.5 MB each.
- **The shotgun** is rebuilt as a standalone gun (body, pump, shell),
  motion re-expressed relative to the body: `shoot` (the pump slides ~5 cm
  toward the stock), `reload`, `reload-start`, `reload-end`. The shell is only
  shown during a reload. 1.1 MB.
- **Still to do before the game uses them:** pack the JSON (436 MB raw for
  all 25 bodies; quantise into a GLB per body), rescale the hip height per
  body at load, and cut the Halloween attacks (9–29 s takes, several moves
  each) into single moves once we know which ones the zombies use.

### THE SHOW PLAYS THE BAKE (Oct 31 2026)
Josh, Oct 20: *"full assets for everything… animations for every action."* The audit found the bodies
carried ~780 clips and the show kept ~107 (`actors.ts` keeps only what `stance.ts keepClip` names).
Now wired, every clip law-checked on all seven survivor bodies (`node scripts/survivorz/anim-law-show.mjs`
reads `anim/<body>/clip.json` back for exactly the clips the show keeps; `anim-show-check.mjs` plays each
on every body, no T-pose):
- **The turn:** the stage-5 collapse falls (`survivor.dying` → the fall, held as the down loop); the
  one who turned gets up where they lay (`mx-zombie-stand-up-1` — it starts on the back, head behind, as
  the down loop lies; the other stand-up lies the other way round) and screams, and the survivor's body
  stays drawn until that zombie is dressed (no blank frame). The sim holds it still 6 s while it rises.
- **The pairs** (`show/pairs.ts`): a grab plays the finisher pack's front or back struggle chain (grab →
  held loop → breaking free) with BOTH halves — the zombie's `zd-<clip>-<survivor>`, the survivor's per
  the finisher table — the roots held where the bake stood them (`Actor.anchor`; the zombie stays, the
  lunge drives the survivor back), the halves in step, the bodies handed back with the jump eased out. A
  bite in a hold plays its own pair (`zd-bite-*` + `bd-bitten-*`, placements from the bake, the survivor
  kept still); a friend's pull-off plays `zv-pull-off-<zombie>` at its placement while the held one breaks
  free; a knife plays `zv-knife-head` and the zombie's death waits 0.95 s for the blade. **Only pairs in
  the finisher table play** (`scripts/survivorz/pair-table.mjs` → `show/pairs.json`); anything else plays
  the old unpaired loop. The pull-off and knife were pair-measured only on their tuning pairs (self-law
  clean everywhere) — a pair sweep for them is the open item.
- **The rest:** a shove (`mx-push`'s thrust, on `survivor.effort {shove}`); reading by what's read
  (`mx-typing` at a terminal, `bd-note` for paper, arms folded for a tape — for as long as the pose stays
  "search"); a sample knelt over (`ual1-fixing-kneeling`, never CPR); the bench's hours varied every 20 s;
  the keycard swipe, crowbar, breaker, keypad and holding a door shut on the dead; fifteen talk gestures
  picked off the line's words; a ladder climbed (backwards going down), a vent crawled, a lift stood in
  (wire `link`); and the props the bake closed a hand round (`stance.ts CLIP_PROPS`: the bottle, the bar,
  the syringe, the can, the keycard), plus a bandage on the wound once the bleeding is stopped.
- **The sound it was missing:** the breach klaxon and PA warning (`containment.breach`, a new sim event
  when Containment is powered); the PA's chime and "Power restored — <wing>" / "main power failure" on
  every breaker, and its routine lines now and then where it has power; drips, pipes and the tunnels'
  rumble round the ear by zone; the dead's footsteps (heavier, duller, near only) and their chase pant
  (`zombie.chase`, now emitted); the card reader's accept chirp; a bandage's roll and tape and a bottle
  drunk from, on the pose. Shotgun, horde and sob cues stay silent: the sim can't produce them.
- **Not done:** the axe still chops (no other axe swing is baked with the axe in hand); the bandage roll
  in the hand (the bake winds an OPEN hand round the forearm — a roll would float); the upper-body layer.

## 10b. The sound engine (built 2026-10-23, uncommitted)

Josh: *"do all the work up till when you need a map."* Everything that plays the
finished sound set (230 sounds, `sound/final`, through the admin-only door) is in
`client/src/survivorz/audio/`, and all of it works before there is a map:
- **`rules.ts`** (pure): a take never repeats twice running; footsteps shaped by
  pace (run louder and higher, sneak quieter and dulled) with jitter; how far the
  CAMERA hears each sound (a gunshot ~90 m, a step ~22 m; the PA, logs, score and
  room tone aren't positional); walls and distance through the Backrooms'
  `voiceMix` (the reuse law), gated at the sound's own range; every room of
  facility-map.ts given an echo (office, padded, lab, tiled, concrete, metal,
  hall, tunnel) and a floor; each zone's room tone; the devices (the audio logs
  on a handheld tape, Ashby's call on a phone line, the PA through the ceiling
  speakers); the ducking (score -9 dB, beds -5 under anyone talking).
- **`music-rules.ts`** (pure): the director's score — rises at once, falls only
  after a hold (uneasy 20 s, suspense 15 s, combat 25 s), separate lines up and
  down so it never flip-flops, a minimum 8 s on any level, combat → aftermath
  (40 s) → calm, a death → 6 s of silence (the sting) → grief, ordinary changes
  on the next 4-second phrase (combat and a death at once), the calm thinner at
  night, each zone's colour bed, and Josh's pin / mute / sting.
- **`cues.ts`** (pure): **what every game event sounds like** — the doors code's
  events, the effects contract's, the weapons, the zombies, the survivors (in
  their own voice), survival work, the vault countdown one number a second, the
  endings. The game and the effects drive off the same event names.
- **`engine.ts`**: the AudioNodes — HRTF panning from the camera, a lowpass and
  dry/room sends per sound, a convolution echo per room made from noise, the
  tape/phone/PA chains with their hiss (the tape wobbles), the room tone
  crossfading on a zone change, the score's layers looping in step, ducking.
  **The map supplies two things later and the engine runs without them:** the
  wall count between two points (`setOcclusion`) and the camera's room.
- **The bench:** Admin Panel → Survivorz → **Sound engine** — place a sound
  round the camera, add walls, change the room, fire any event, walk on each
  surface, play the recordings through their devices, run the score by hand.
- **Harness:** `node scripts/survivorz/test-audio.mjs` (45, pure; build first for
  the room coverage). Checked in a browser on a throwaway stack: every file
  loads, no console errors, threat 0.9 → combat, a death → silence → back up.

## 11. Hardware — the GPUs for the month

The casino season is over before the show starts, so every agent moves to the
show and both cards are re-laid for it. **The rule stays the one that works
today: the language model on the 3090 Ti, all the speech on slopbot's 3080.**
What changes is everything that was only there for the casino floor.

### Where everything runs

| Job | Where | Memory | Notes |
|---|---|---|---|
| The game world (map, zombies, six bodies, the director) | R220 | CPU only | The load test ran 80 bodies with every creature awake (p99 ~21 ms). |
| The language model: Gemma 4 26B, 4 slots, 16K window | the 3090 Ti | ~16 GB | A mixture-of-experts model (~4B active a word), so it is as fast as the 12B or faster. 4 slots measured better than 8. |
| The stream render: Edge in spectator mode, 1080p60 | the 3090 Ti | almost nothing on top of the model | The tab captures itself and Edge's own hardware H.264 encodes it (MediaRecorder, a keyframe every 2 s). Measured: 60 fps, GPU 10–17%, NVENC ~9%. |
| The feed to YouTube (ffmpeg) | the same PC | CPU only | ffmpeg only COPIES Edge's H.264 into FLV and makes the audio AAC; its own NVENC won't run on the installed driver (§12). ~13–14 Mbps out, whatever Edge is asked for — a rounding error on 2 Gbps. |
| Voices: two Chatterbox servers (one full, one half precision) | slopbot's 3080 | ~5.8 GB fresh, ~7.4 GB at most | Measured Oct 21: full 3.3 GB, half 2.5 GB. The full one has grown to 4.5 GB over a busy day before (Oct 19). One server speaks one line at a time, so two lines at once is the ceiling. |
| The ears (Whisper) | **off for the month** | frees ~1.2 GB | No player talks to the survivors; they pass text to each other on the server. |
| Sterling, Voss and the goblins in the hub | the same 26B | shared | Hub DMs keep working; they share the 4 slots with the show (see priority below). |

**Totals, measured:** the 3090 Ti at 20.1–20.4 of 24 GB with Josh's desktop up (the 30-minute soak; it crept 0.3 GB, and the 24-hour run has to say whether that's a leak or settling), the 3080 at ~5.8–7.4 of 10 GB without the ears.

### Known risks, measured

- **Slopbot's voice servers leaked host RAM — FIXED Oct 21 2026.** Chatterbox
  runs its Perth watermarker with PyTorch's gradient tracking on, which kept
  ~12 MB of RAM per line (~19 MB a line all in). On a busy day one server
  reached 27 GB, slopbot thrashed (load 66, SSH timing out) and the kernel's
  OOM killer took it — twice on Oct 19, the voices falling back to Kokoro both
  times. At the show's rate that is a breakdown every ~14 h. `voice_server.py`
  now generates in `torch.inference_mode()` (the watermark is still applied):
  40 lines grew 26 MB, flattening, against 19 MB a line before. And
  `solace-voices.service` has a ceiling (`MemoryMax=14G`, no swap), so any
  future leak restarts the voices in ~90 s instead of taking slopbot — the
  house's DNS — down with it.
- **The 3090 Ti has ~3.5 GB of headroom.** When it last got tight, Windows
  paged the idle model out and a reply took 23.5 s. Nothing else that uses the
  GPU runs on that PC during the month.
- **The workstation is a single point of failure** (no model fallback, by
  Josh's choice). Windows Update must not reboot it mid-run: pause updates for
  the month (or set active hours around the clock) before launch. Sleep is
  already held off by the streamer.
- **The model's health check is too slow for a 24/7 show — the dial is
  BUILT (Oct 22 2026).** "AI engine (26B)" goes red after `NPC_ENGINE_RED_MIN`
  minutes with nothing loaded (prod .env; default 180, because games pause the
  model during the casino). For the month set it to 5, and red reaches
  Sterling's alert DMs within the next 5-minute sweep.

### What gets switched for the month

1. **The workstation supervisor stops pausing the model for games** —
   BUILT, not flipped: `solace-gpu.ps1 -ShowMode` (undo `-CasinoMode`;
   `-Status` shows which). It writes a `showmode` flag the supervisor reads
   every loop, so the built-in War Thunder / Star Citizen list stops counting
   too — an empty `games.txt` alone would not have done it. Josh isn't gaming
   on the 3090 Ti during the run, and a game launch would otherwise silence
   the whole cast. The supervisor still restarts the engine if it dies, and
   `-Pause` still works by hand.
2. **The ears come off slopbot** — BUILT, not flipped:
   `ROLLO_EARS=0 SLOPBOT_SUDO_PW=… bash deploy/slopbot/setup-voices.sh` from
   the PC (it rewrites slopbot's settings and restarts the voices; run it
   again without `ROLLO_EARS=0` to put the ears back). No Whisper is loaded and no player
   track is subscribed (so no barge-in and no "mm-hm"); the regulars still
   speak. Frees ~1.2 GB. The casino regulars' floor runtime is off, since
   they're all in the show.
   **Flip both back afterwards**, and `NPC_ENGINE_RED_MIN` to 180 — the
   casino's regulars need their ears.
3. **The voice agent gains the cast's six voices.** One Chatterbox server
   switches between any number of cloned voices from their reference clips,
   so six characters need two servers, not six. The files go beside the
   regulars' as `survivor-<name>.mp3` (already copied to slopbot).
4. **The browser that renders the stream lives on the 3090 Ti PC**, started
   by Task Scheduler (not by a Claude session — the app's job kills those),
   with watchdogs for Chrome, the encoder and the model.

### Keeping six characters inside two voices and four slots

- **Only the people on camera are voiced.** Off-camera talk still happens as
  text (the log, their memories) but isn't spoken. That keeps the voice queue
  near zero; a third line arriving while both voices are busy waits 2–4 s.
- **The show has first call on the model.** Survivor lines and choices go
  ahead of hub chatter and background writing; the house's three get a
  scripted line if the slots are full rather than holding up a scene.
- **The game decides, the model talks.** Pathfinding, fighting, fleeing,
  looting and sleeping are ordinary code, so each survivor calls the model a
  few times a minute, not every frame.
- **Expected timing** with nothing queued: 0.5–1.5 s for the model plus
  1–2 s to the first audio, about 2–4 s from a moment to a voiced reply.

### If memory gets tight (in order)

On the 3080: put the full voice server in half precision too (3.3 → ~2.5 GB,
~25% slower to make a line, which Josh has heard and approved for the second
server). On the 3090 Ti:

1. Drop the model's window from 16K to 8K (memory barely moves, but the
   prompts get cheaper).
2. Render at 1080p30 instead of 60.
3. Go to 3 slots.
4. Swap the 26B for the 12B (~10–12 GB, an estimate): it frees ~5 GB but is
   probably not faster, so it is a memory fix only. Time both before deciding.

The stream test (phase 3) measures the model and the render together on the
3090 Ti, so these numbers get checked before anything is built on them.

### Looked at and not used

- **Kev-4B** (a classifier: picks options, doesn't write) — 14.3 GB doesn't
  fit beside the 26B, and the small models tried as the safety gate didn't
  hold the line as strictly as the 26B. Only worth revisiting for the choice
  menu if a third card turns up.
- **Parakeet TDT 0.6B** (speech to text) — a credible Whisper replacement, but
  the show needs no ears. Worth a test on slopbot later, for the casino.
- **Breeze TTS 2** — built for H100s; on the 3080 it would drop from two voices
  at once to one. Stay on Chatterbox.

### After the show

Put it all back: the supervisor's game pause on, the ears on, the casino
regulars' runtime on, slopbot's agent back to listening mode.

## 12. The broadcast

- **The camera director**, adapted from the casino show: zones, combat,
  chases, grabs, someone going down, a door about to break, sleep.
- **On screen** (there's no narrator): day counter, each survivor's health
  and infection, supplies, endings unlocked, "in memoriam" cards.
- **Running 24/7:** watchdogs restart Chrome if it crashes, reconnect the
  stream if it drops, and check the model; Sterling DMs Josh if any fail.
- **WATCH AND ENTER, IN THE ADMIN PANEL (Josh, 2026-10-20: "we can just put
  a watch stream in the admin panel for testing watch and entering as admin
  to validate and test").** Admin Panel → Survivorz has two buttons, the
  casino show's shape. **Watch** opens the broadcast in the panel: the
  director's cut with the overlay, the cameras, the floor map and the
  survivors' voices, as an invisible watcher with no body. **Enter** drops
  the admin into the facility like any unopened level: walk or fly it, see
  every survivor, zombie, loot cache and gate live on the operator view, and
  stand in a scene to check it up close. This is how every phase is tested;
  **YouTube comes last**, and the stream rig just captures this same Watch
  page, so what Josh validates is exactly what goes out.
- **Josh's control panel — Admin Panel → Survivorz** (Josh, 2026-10-23: "make
  sure there is a proper panel … so i can make informed decisions"). Everything
  the show runs on, in one place, live:
  - **The cast:** each survivor's health, wounds, bleeding, infection clock,
    hunger, thirst, tiredness, morale, where they are and what they're doing,
    their genes (with drift from the start), skills and XP, inventory.
  - **The group:** who leads and why, regard/trust/friction for every pair,
    bonds and rivalries, the last meeting's plan and who refused it.
  - **Supplies:** the linked storage with its full in/out log (who, what,
    when — including what the survivors can't see), food days left, ammo,
    medicine.
  - **The facility:** zones opened, power (the three powered zones), keycards
    held, records found and shared, progress toward each ending, zombies alive
    by kind and zone.
  - **The director:** tension per survivor, its phase, its recent decisions,
    and the readouts against target — deaths per week, action per hour.
  - **Deaths and newcomers:** every death report; the bench with each
    newcomer's sheet, body and voice; the "cast at 4 or fewer" suggestion; and
    the **Add newcomer** button — Josh's alone.
  - **Controls:** pause the world, the "standby" slide (the panic button),
    point the camera, pin or mute the music, end the show — every lever
    audited.
- **Recording:** as far as we know YouTube keeps only the last 12 hours of a
  very long stream (confirm before launch), so the show records locally and
  logs events for highlights and the death reports.
- **Licences:** the zombie pack and the Halloween mocap may not be
  redistributed, so the show's assets are served from a route that needs a
  Solace login, never the public assets folder.

### The stream rig (phase 3, built 2026-10-20, uncommitted)

`scripts/survivorz/`: `stage.html` (the test stage: Rick on Eric's body
walking a stand-in lab corridor, a zombie at the far end, the overlay),
`streamer.mjs` (serves it, drives Edge, takes the capture, feeds ffmpeg, asks
the 26B for lines, logs the GPU, runs the watchdog) and `stream-task.ps1`
(runs it as a Windows scheduled task, because anything a Claude session
starts dies with the desktop app).

- **THE TAB CAPTURES ITSELF, not the desktop.** Edge's own tab capture
  (`getDisplayMedia` with `preferCurrentTab`, auto-accepted by a flag) takes
  the page with its HTML overlays and its audio, without needing the window
  on a visible screen. Edge, not Playwright's Chromium, because Edge carries
  the hardware **H.264** encoder: MediaRecorder encodes on the GPU, asked
  for a keyframe every 2 s (YouTube's rule), and ffmpeg only COPIES the
  video into FLV/MP4 and turns the audio into AAC.
- **ffmpeg can't encode on NVENC here**: the ffmpeg 8.1 build wants NVIDIA
  driver 610+ (NVENC API 13.1) and the installed driver has 13.0. Copying
  Edge's H.264 makes that moot, and it is less GPU work anyway.
- **The picture must be EXACTLY 1920x1080, and three things fight it:**
  display scaling (an emulated viewport captured at 1912x1076), Playwright's
  "controlled by automated software" bar (dropped: no `--enable-automation`),
  and Edge's own "sharing this tab" bar, which appears only once the capture
  starts and takes 47 px off the page. So the streamer measures the page and
  resizes the window after the capture starts, and only THEN starts the
  recorder — the first cut had 27 short frames and then a size change, which
  YouTube won't take mid-stream.
- **The stage draws 60 fps, not the monitor's 120** (it skips the frames the
  stream would throw away).
- **THE WATCHDOG** replaces the whole session (browser, capture, recorder,
  ffmpeg) when no picture has come from the tab for 15 s, the page runs
  under 30 fps for 30 s, or ffmpeg has died — on YouTube that last one is
  the connection dropping. Proven by killing the browser mid-run
  (`SURVIVORZ_KILL_AT`): a new session was recording within seconds.
- **The lines** come from the live 26B with production's own window (16,384)
  and `keep_alive -1` — any other value makes Ollama reload the model under
  the casino. The last six lines are shown back so it doesn't repeat itself.
- **The key** is `SURVIVORZ_RTMP` in the gitignored `.env`, read by the
  streamer and masked out of every log line.
- **Windows may not sleep mid-run:** the streamer holds
  `SetThreadExecutionState` (system + display) in a child PowerShell that
  dies with it. (PowerShell reads `0x80000003` as a negative int — the call
  takes `[uint32]2147483651`.)
- **The 30-minute soak**: no restarts, 60 fps throughout, worst frame 17 ms,
  GPU 13% average, NVENC ~10%, 45 lines at 354 ms average (440 worst). GPU
  memory crept 20.1 → 20.4 GB — **the 24-hour run has to say whether that
  is a leak or settling.** Edge sends ~14 Mbps whatever it is asked for
  (YouTube takes it). Run as a scheduled task: clean, 10,828 of 10,828
  frames at 1920x1080.
- **Measured** (local runs, the 26B loaded, Josh's desktop up): 60 fps with
  the worst frame 17 ms, GPU 10–17% average, NVENC ~9%, memory flat at
  ~20.1 GB of 24 (the stage adds almost nothing on top of the model), the
  26B answering in ~250–400 ms while rendering, ~13 Mbps out of the tab.
- **Not in the test yet:** the cast's voices (they ride the regulars' voice
  agent on slopbot, phase 10) and the real facility map (phase 4).

### THE STREAM RIG, POINTED AT THE REAL SHOW (2026-10-31)

Josh's calls: **YouTube only** — the in-Solace member broadcast stays OFF AIR for the run (the
licences), so the rig must watch without the show being on air and without anybody signing a browser
in; **split about every 11 hours** so every part gets a replay; **keep a local recording**; and build
it so it works the moment the stream key goes in `.env`. How to go live: `scripts/survivorz/STREAM-RIG.md`.
The stand-in (`stage.html`, the 26B lines, the oscillator) is no longer what the rig opens.

- **THE STREAM PAGE** is `/#survivorz-stream` (`client/src/main.ts` → `show/StreamView.svelte`): the
  Show in watch mode, full window, no LIVE pill / Leave / sound button / cursor, sound started without
  a click (`Show.svelte`'s `stream` prop). No App around it — no chat socket, no idle logout, no Terms
  gate. Its contract for the rig is `window.stream` (ready · stats() · start() · record() ·
  setStandby()), replacing the stand-in's `window.stage`.
- **THE STREAM TOKEN** (`src/survivorz/streamtoken.ts`, `SURVIVORZ_STREAM_TOKEN`, 24+ characters,
  timing-safe): the rig is the STREAM PRINCIPAL — the router's new `"watch"` auth level admits it on the
  show's four asset doors and the voice door, `broadcast.ts` lets it open `/ws-survivorz` off air and
  never counts it as a member — and `userForToken` never resolves it, so every other route answers 401.
  Unset = 404 on every stream door. The page gets it from Playwright's `addInitScript` (never a URL) and
  `lib/api.ts` holds it in memory only.
- **THE CAPTURE GOES THROUGH PLAYWRIGHT, NOT A SOCKET**: MediaRecorder chunks are handed to Node by
  `exposeFunction` (base64), in order, each waiting for the last — which is also the backpressure. A
  page on https://solace.zone opening `ws://127.0.0.1` would be a public→loopback socket that Edge's
  local-network rules can block.
- **TWO ffmpegs**: the RECORDER (one per browser session) copies the tab's H.264, makes the audio AAC
  and tees it to 1-hour fragmented MP4s (`survivorz-YYYYMMDD-HHMMSS.mp4`, oldest deleted past
  `SURVIVORZ_REC_CAP_GB`) and an MPEG-TS on stdout (`bsfs/v=h264_mp4toannexb` — TS needs Annex B);
  the YOUTUBE LEG reads that TS and copies it to FLV/RTMP. A dropped YouTube connection redials with
  backoff and never touches the recording. **THE SPLIT**: every `SURVIVORZ_SPLIT_H` (11) the leg is
  ended, the rig waits `SURVIVORZ_SPLIT_GAP_S` (90) for YouTube to close the broadcast (auto-start +
  auto-stop ON on the key), replaces Edge to shed memory, and connects again — a new broadcast and a
  new replay.
- **IT RUNS FOR WEEKS**: the run length is checked on a timer (the old `setTimeout(MINUTES*60000)`
  overflowed past 24.8 days); `stream-run.ps1` restarts the streamer 15 s after any exit;
  `stream-task.ps1 -Install` registers "Solace Survivorz Stream" at logon + every 5 min (IgnoreNew) with
  restart-on-failure; the watchdog also replaces Edge past `SURVIVORZ_HEAP_MB`; `playwright-core` is a
  pinned devDependency (1.61.1), not a scan of the npx cache; the keep-awake child watches the rig's pid.
- **FAILURES REACH JOSH**: the rig posts a heartbeat every 10 s (`POST /api/survivorz/stream/heartbeat`,
  token-only); the health check **"Survivorz stream"** (`src/survivorz/stream.ts`) goes red when a run
  is expected (set by the first beat, cleared by a clean stop; app_kv, so it survives a restart) and the
  beat is over 2 min old, or the rig reports a problem (YouTube leg down 2 min, recording not growing,
  repeated failed starts) — and red reaches Sterling's alert DMs.
- **THE STANDBY CARD**: Admin Panel → Survivorz → **Stream** shows the rig's last beat and puts a card
  over the stream without stopping it (audited); the page polls for it and the rig pushes it from the
  heartbeat's answer.
- **TWO SILENCES THE FIRST REAL RUN FOUND**, both invisible on screen: a tab's captured audio arrives
  with echo cancellation, noise suppression and gain control ON and in mono (measured — the stand-in's
  "audio present" was a track, never a level), so StreamView asks for them off and stereo; and
  `lib/sfx.ts` read a never-set volume key as `Number(null)` = **0**, so every app sound in a fresh
  browser profile (the rig's is fresh every launch) was silent until the slider was touched.
  **Check a capture with `volumedetect`, not with ffprobe's stream list.**
- **The end-to-end run** (Oct 31, local backend + the real show, file targets, the split dialled to
  2.4 min): 1920×1080 H.264, keyframes every 2.01 s (max 2.17), AAC 48 kHz stereo at about −35 dB
  mean / −15 dB peak (the in-app mix — quiet for YouTube; a `loudnorm` on the recorder is the next
  dial), ~15 Mbps; the split ended the leg, replaced Edge in 14 s and reconnected after the gap;
  the standby card landed in the recording. The capture is variable-rate: **46–57 fps steady**, and
  31–38 in the minute after Edge starts (zones loading) — with the 26B loaded the GPU sat at
  23.1 of 24.5 GB and the page rendered uncapped at 60–100 fps, so the 60 fps / DPR-1 cap is due.
- Harness `test_survivorz_stream.mjs` (53).
- **THE OUT-OF-MEMORY NIGHT (2026-10-31, later).** With the 26B loaded and an ordinary desktop open (Brave,
  Signal, the Claude app, the NVIDIA overlay) the 3090 Ti sat at 22.1 of 24.5 GB before the stream page, and the
  page needs ~3.2 GB: it lost its WebGL context, reloaded, and Edge then BLOCKED WebGL for it ("Web page caused
  context loss"), so it sat at "starting" forever. Worse, `page.evaluate` never answered, so the rig's stats tick —
  and the watchdog behind it — stopped for the rest of the run: three minutes of a still frame and nothing replaced.
  Every call into the page now gives up after `PAGE_CALL_MS` (4 s), a stats call that gives up counts as a stall,
  ticks never pile up, and a session start fails after `START_MS` (5 min). Rerun the same way, the rig replaced the
  dead page every ~40 s (each fresh Edge ran out of memory again, which is the point: the watchdog sees it and
  Sterling alerts after three failed starts). **With the model paused, the same 3-minute run held 59 fps average
  (low 44), 6.7 Mbps, audio −15 dB mean / −1 dB peak, no restarts.** The stream does NOT fit beside the 26B on
  that desktop. **THE CAUSE WAS THE COMPOSITOR (Nov 1):** a per-process breakdown put Windows' `dwm` at 8.6 GB
  after a long uptime (it normally sits under 1). After a reboot it held 0.8 GB and the same 3-minute run, model
  LOADED, peaked at 22.2 of 24.5 GB with 60 fps once the zones had loaded. REVIEW.md item 7: reboot before launch,
  and the 24-hour stress test watches `mem_mib` in the rig's log for the creep.

### THE SHOW RUNS — the rough draft, tied together (2026-10-27)

Josh: *"tie in all the works of the animations, special effects, sounds, etc all together and
starting working on the rough draft of the show. Then we can do simulation test … Then we will load in
the survivors … Then … a solace only broadcast … After everything is perfect we will then work on the
YouTube live stream."* His calls the same evening:
- **The rough draft is a WATCHABLE SIM**: the whole baked facility in one scene, with survivors and zombies on game-code brains (no language model yet), every event playing its effects and sounds.
- **The sixth survivor is Rollo.**
- **The Solace-only broadcast is an ON AIR band for any member**, like the casino show's.
- **The animation and effects sessions are finished**; the integrating session owns their code now.
- **Deaths per week stay as they are until he has watched it.** The draft runs about 1.5 a week against his target of about 1.
- **A first stage cleared in about an hour is fine.**
- **The experiment zombies are the integrator's pick:** f05, m08, m03, m05, m06, m09, judged on the lineup renders. f07 is outside dead.

**THE PIECES, and the one contract between them.** `src/survivorz/sim/wire.ts` is import-free and
read by both halves.
- **Frames:** snap, tick (10 Hz, changed bodies only), spawn, gone, ev, say.
- **Event names are the sound-cue vocabulary**, so a screen hands an `ev` to `SoundEngine.cue()` and `ShowFx.event()` with no translation table. The body an event happened to is `victim`, never `to`, because `ShowEvent.to` is fire.spread's vec3.
- **Headings:** facing = (sin h, cos h), so h = atan2(dx, dz). three.js draws that as rotation.y = h.
- **THE SIMULATION** (`src/survivorz/sim/`: world, nav, survivor, zombie, director, tables):
  - Doors and power go through `FacilityWorld`, whose rules are never duplicated.
  - Navigation is a portal graph plus per-room A* on `sim/walk.json`. `scripts/survivorz/sim-walk.mjs` bakes that from site9-walk.json plus 716 furniture footprints from the dressed rooms.
  - Speed: 0.1 ms a step, about 850× real time.
  - ~~The group's plan is stood in for by a FRONTIER~~ — replaced by what they KNOW (the round below).
  - Harness: `node scripts/survivorz/test-sim.mjs` (89).
- **THE BROADCAST** (`src/survivorz/broadcast.ts` + `routes/survivorz-show.ts`):
  - The run loop goes through guardedTick. `/ws-survivorz` is WATCH-ONLY: nothing a watcher sends is read, and the levers go over HTTP, audited.
  - The admin can always watch. Members can only watch while ON AIR, at most 60 of them; taking it off air closes their sockets (4003).
  - A running show restarts after a reboot, as a fresh world until the survival layer persists one.
  - Frames are encoded once and **sent as TEXT**. A Buffer goes out as a binary frame, a browser gets a Blob, and the client dropped every frame (the first live test drew an empty facility).
  - The path is in all three places: realtime.ts's allowlist, the Caddyfile and the Vite proxy.
  - **The show's ASSETS follow the same gate** (`setSurvivorzShowGate` in routes/survivorz-assets.ts): the admin always, a member only while ON AIR. They are never public, because the zombie pack and the mocap may not be redistributed.
  - Harness `scripts/checks/test_survivorz_broadcast.mjs` (43).
- **THE SCENE** (`client/src/survivorz/show/`: Admin Panel → Survivorz → Show):
  - Zones stream by camera, 4 held at once (`ZONE_BUDGET`; all 8 is about 1 GB more GPU).
  - Power swaps each zone's lightmaps, and the light count is fixed at 22.
  - The character controller (actors.ts) maps pose + speed + held item to the baked clips, with speed-matched locomotion. Every clip it uses passes the animation laws on all seven bodies.
  - Held props ride the hand bone via the grip data (the new `propinfo` asset area).
  - Door leaves are built from `doorPlacement` and registered with ShowFx.
  - The bridge sends every event to effects and sound.
  - `prepare(point)` loads a zone before a cut. The mock feed is still there for testing.
  - Measured headless on the 3090 Ti: about 105 fps with all 16 bodies in view, about 3.3 GB of GPU for 4 zones.
  - Fixed along the way:
    - The fx asset area couldn't serve `.json`, so FxSystem could never load inside the app.
    - The bodies kept 352 MB of animation decode alive.
    - Shaders compiled mid-show. Every body, gun and door is precompiled now.
- **Personal space is an animation law here.** Survivors walking side by side came within 0.55 m and brushed arms. The living now keep 0.8 m, a zombie closes to 0.6 on the living, and the dead crowd at 0.55. The sim harness holds upright survivors under 0.6 m apart to under 0.2% of samples (measured 0.049%).
- **Still to build, in order:**
  1. The director camera and broadcast overlay (in progress).
  2. Simulation tests at length.
  3. The survivors' talk layer (the AI).
  4. The survival layer's deferred parts (turning, meetings, barricades, crafting, walkies).
  5. The Solace-only broadcast.
  6. YouTube.
### THE FIRST LIVE WATCH, AND THE AI ON (Josh, 2026-10-28)
Josh watched the draft live: *"Rollos backpack has a weird glitch where the back part seperates when he walks. The survivors absolutely obliterate the zombies. … they all follow each other in a line when walking around. The survivors (AI) are supposed to know nothing and figure out what to do."* He also asked for the AI to be turned on, and for the show to be linked from the Casino page.
- **THEY KNOW NOTHING** (`src/survivorz/sim/knowledge.ts`):
  - **What a survivor knows:**
    - A room is SEEN (they can plan through it) or VISITED.
    - A door is known in the state it was last seen in. What it needs is learned by trying it or reading its sign.
    - A room's spots are learned by setting foot in it, and a container's contents by searching it.
  - **Sharing:** two survivors awake in the same room within 6 m tell each other everything.
  - **Planning uses only what they know.** `Nav.route` has `roomOk`, and `believePass` decides doors.
  - **The 30-hour frontier timer is gone.** Exploring is walking to the edge of what they know. Going a stage deeper costs `NEW_ZONE_COST` (140, scaled by caution), fading over 36 h, and drops to a third when food is short. Stage 2 lands at ~17–25 h.
  - **`factsFor(w, who)` is what the language model is shown** (≤1,450 bytes, no unseen room ever named).
  - **The job menu is `MenuOption[]` {id `kind:what`, kind, label, score}**, re-checked with `stillLegal` when a pick comes back.
  - **A group plan** (`hooks.plan` / `w.setPlan`) gives each survivor explore, scavenge or stay, and can name a zone.
  - **Keycards are carried:** a holder swipes allies within 6 m through.
  - New event `zone.found`, and say moment `discover`.
- **THE DEAD ARE DANGEROUS.** Every combat dial is in `COMBAT` (tables.ts).
  - **How fights changed:** swings miss more when tired or scared; a body blow only rocks a zombie and only the axe can knock one down; at most two survivors on one zombie; fights are loud, so the dead come in numbers; grabs bite before a survivor can wrench free.
  - **How survivors behave:** they flee when outnumbered; Sarah and Johanna avoid fights; nobody opens a door they've heard the dead behind; each keeps 2 bandages for revives.
  - **Over 96 h (16 seeds):**
    - swings per kill 3.6 → 6.7
    - grabs 18 → 35
    - bites 1.6 → 5.8
    - downs 1.1 → 3.7 a week
    - **deaths 0.66 → ~2.8 a week**, against the ~1 target
  - **Deaths are not tuned**, by Josh's standing call to watch first. They cluster when the group first pushes into stage 2, and revives succeed only ~23%. The dials are `COMBAT.shoveBase` / `breakMax` / `feedHaste`.
- **NO SINGLE FILE.** `Nav.lanes()` is adapted from the casino's walknav:
  - Each walk gets its own lane and A* noise variant. 0 of 1,591 repeat walks were identical.
  - Escorts walk in formation, beside and behind the leader, straight behind only 3.1% of the time.
  - Personal space measures 0.010% against the 0.2% cap.
- **ROLLO'S PACK** (`scripts/survivorz/rollo-build.py`):
  - **The cause:** the suit's UV islands were weighted vertex by vertex, so the pack's rigid back face and its bending sides tore apart along the seams, up to 46 cm.
  - **The fix:**
    - The whole pack rides the chest.
    - The suit eases into it.
    - Every seam point shares one weight.
  - **Result:** zero cracks across all 803 clips. Checker: `node scripts/survivorz/rollo-pack-check.mjs [--all]`.
  - **NB:** `game-next/rollo.glb` still has the old suit. Re-pack it before promoting.
- **THE AI TALKS** (`src/survivorz/talk/`):
  - **Lines:** subtitles only, written by the house brain from FACTS, each survivor's sheet, genes and memory. Each line is checked for THE LINE (regex + second read, no line if the read can't be had), numbers, freshness and cleaning.
  - **Pacing:** one speaker per room, at most 3 lines a minute per room, by priority (grab/down/death > discovery > chat).
  - **Choices:** the model picks one option from the job menu as `{why, choice}` (`pickChecked`), at most once per 2.5 sim minutes per survivor. Urgent menus are code's alone.
  - **Meetings:** the leader proposes a plan; the others' stances are rolled by genes and voiced by the model. The plan reaches the sim through `hooks.plan`.
  - **Memory:** notes on each other person and a diary at sleep, kept in app_kv `survivorz_minds` per world.
  - **THE SWITCH:** off by default. Admin Panel → Survivorz → Show → "Survivor AI" (`/api/admin/survivorz/talk`, audited). With no brain, or the switch off, the same seed plays the same show.
  - **Subtitles:** the client stacks two, one per speaker, the speaker on camera first; a line tips a quiet camera toward the speaker.
  - **Harness:** `scripts/checks/test_survivorz_talk.mjs` (84).
  - **Not yet:** the survivors' sheets carry the bibles' unreviewed [N] lines, and small talk is still written off camera.
- **THE SECOND WATCH (Josh, the same day):** *"the ambience is way too loud … none of the survivors are talking and i cant hear anything they are doing … all zombies are just T posing in the air … give me a button in admin panel to reset everything back to the start … a Stream UI upgrade … see whats in their inventory, and brief stats … select and view each survivor"*.
  - **THE T-POSE:** a body arriving already dead got its death clip as its LOOP (`ZOMBIE_LOOPS["z-dead"]`), then the held one-shot of the same clip stopped "the old loop", which was itself. No action was left, so it showed the bind pose. Every zombie killed before a watcher joined stood T-posed. `play()` now never stops or fades the action it is starting (actors.ts).
  - **THE SOUND:**
    - The ear sits within `EAR_M` (2.5 m) of the shot's subject, on the camera's side; the casino show's "contestants wear mics" rule. Wide and security shots had heard everything faint or through walls.
    - The score plays at `MUSIC_LEVEL` 0.22 and the room tone at `BED_LEVEL` 0.3; both used to be 1.
  - **THE AI IS ON BY DEFAULT** (`talkAllowed`: on unless app_kv holds "0"). The off-by-default switch had left the live show silent. Every ten minutes the journal logs `[survivorz] talk, last 10 min: …`.
  - **SUBTITLES:** a line said off shot still shows, after the ones in shot.
  - **"↺ Restart from the beginning"** is always in the Show panel. It runs the reset lever: a fresh world on a new seed, day 1, and fresh memories.
  - **THE STREAM UI:**
    - Each cast card shows four thin bars (stamina, food, water, rest) and its POCKETS in one line (weapon, gun and rounds, food, water, bandages, medkits, keycard). The pockets travel as `SurvivorVitals.inv` (wire.ts, additive), sent on change with the vitals.
    - The cards are a PICKER for every viewer: a card follows that survivor, the same card again (or "⟲ Director's cut") hands back.
- **WHAT THEY'RE THINKING (Josh, the same day: *"It would be good to know what the survivors are thinking as well, not just saying"*).** Each cast card carries one italic line: the survivor's current thought, fading in when it changes, clipped to one line (the full line is the card's hover title).
  - **The wire:** `think` {t, by, text} (wire.ts, additive), sent only when the thought changes. A watcher who joins mid-show gets every card's standing thought right after the snapshot (`ShowWorld.catchUp`).
  - **Two sources** (`src/survivorz/talk/minds.ts` THINK, `thoughts.ts`):
    - **The model**, with the brain on: an inner monologue from the same sheet, nature, memory and FACTS as speech, plus what's driving them and what just happened, under `THINK_RULES` — first person, under 90 characters, and HONEST (speech may lie; a thought never does). Same checks as a line (THE LINE's regex + second read, numbers, freshness, cleaning).
    - **Code**, always underneath: a thought built from what drives the current choice — the mode (grabbed, down, fleeing…), the worst need, a threat just now, the job, what's on their mind. It's what the card shows with the brain off or busy, so no card is ever empty. Pure, no dice: the sim plays the same with thoughts on or off.
  - **Pacing:** a model thought per survivor every 2–4 sim minutes, sooner after a big moment (a grab, going down, a death, a discovery) or a sudden danger, never closer than 30 s to their last. One written at a time, and only with two of the three writing slots free — speech first. Code's thought holds 20 s unless something urgent; a model thought holds 90 s before code's may replace it.
  - **THE BITTEN DECISION:** while ANY bite is a secret (bitten, and the broadcast shows no known infection), no thought names a bite — not the bitten survivor's (they don't even "think around it": a hint is still the audience learning it from the overlay) and not a witness's. The bite is left out of every thought prompt and refused coming out; the client drops one anyway. Code's thought never reads the bite. With no secret bite, a thought about the dead biting is fine.
- **THE CASINO PAGE'S ON AIR BAND:** "ON AIR · SOLACE SURVIVORZ", hazard green, desktop only, shown while the show is running and on air. Watch mode (`Show.svelte` `watch`) is the director's cut and nothing else: no panel, a sound button and Leave.
- **Bakes the controller asked for** (the laws forced a fallback): walking with a melee weapon, a pistol crouch-walk, standing idle with a flashlight in the right hand, and the paired grab and revive clips. Those need a grab partner and a revive partner on the wire.

### THE THIRD WATCH: THE SIM'S HALF (Josh, 2026-10-28)
Josh: *"Make sure their animation state matches the environment and mood … validate their autonomy … they need to be in proximity to things they are interacting with … zombies should still trickle in … backpacks … do an equipment validation check … do a polish check on the map."* His calls: small groups about hourly; packs worn and carrying more; no pack on Rollo (the air tank); **"ship as-is, watch it"** on the death rate below.
- **STANCE** (`alert` on the wire):
  - On guard the moment there's a reason: the dead seen or heard, a fight, a friend in trouble, an arrival, banging on the door, an unknown edge, a patrol. It holds for 20 s after the last reason.
  - The weapon goes away after 6 s of calm at home. Calm at home, they hold a weapon in 0.6% of samples.
- **PROXIMITY:** every container, terminal, breaker, box and bed is used from the reachable cell nearest the thing (`REACH_M`, `spotReach`). Over 24 h the worst was 0.96 m (a door), and new job `shut` walks over to a door before shutting it.
  - **Open:** `morgue-terminal` sits behind a stamped block, and the nearest cell is 1.94 m away.
- **AUTONOMY:** three bugs, not tuning:
  - **The safe room locked them out:** a door once learned to need a card blocked every route back in.
  - **Jobs "arrived" from 29 m away:** a leftover flee route counted as arriving.
  - **A dead friend behind a shut door was retried every 2.5 s,** 50–160k times a run.

  Failing jobs went from ~13 survivor-hours a day to ~0.1, and the longest idle stretch from 39.7 h to 16.3 h. Idle stays ~80% of waking time BY DESIGN: the nerve rhythm, and low morale meaning nobody goes out alone. Loosening it cost deaths; it's a dial for Josh.
- **THE TRICKLE** (`ARRIVAL` in tables.ts):
  - **What comes:** groups of 2–4 every 40–80 min, through entry rooms in reached wings, never near or in sight of a survivor, never in a safe room.
  - **When it waits:** in the director's relax phase, for 6 h after a death, while anyone is down, or at the caps.
  - **Who hears:** survivors in earshot hear an arrival (`zombie.arrived` event, `arrival` say moment).
  - **The real rate** with the holds is about a group every 3–6 h.
- **BACKPACKS + EQUIPMENT:**
  - **Slots:** 6 base, plus 6 with a small pack or 8 with a large one, with per-item stacks. A pack is worn (`pack` on the wire); Rollo can't wear one.
  - **What changed:** what won't fit is left (`item.left`), the dead keep their gear for the others to loot, batteries run out (~2 h each), and weapon swaps no longer lose anything.
  - **Checked:** `census()` proves no item duplicates or vanishes, every hour, through a death and a looted body.
- **THE MAP POLISH** (walk.json regenerated by `sim-walk.mjs`): the walk map now stamps each layout's built-in ARCHITECTURE (the guard booth, partitions, cell fronts), low wide props and sealed pockets. Bodies had walked through all of it: about 27,000 samples inside something solid in 6 h, down to about 6,700.
  - **Client fixes:** vault door swing, door frames inset (no z-fighting), a cross-zone door's fallback leaf, broken doors reappearing after a reset, the zone-unload GPU leaks, skirting z-fighting, the follow camera kept under measured ceilings (`ceilingOf`), and floating or through-the-wall props in five layouts.
  - **Not done:** the sight grid still lacks tall partitions (zombies and the camera see through some), the labs-airlock rail needs a rebake, and locked doors have no visual.
- **DEATHS, MEASURED** (96 h, 16 seeds):
  - The new walk map alone: **~4.5 a week** (2.8 before). Fights happen in real spaces now.
  - With the trickle: **~8.2 a week**, with downs 10.6 and bites 27.
  - Seeds 23 and 606 lose all six in the opening lobby fight even without the trickle.
  - Josh chose to ship it and watch. The dials are `ARRIVAL.gapMin/gapMax/outstanding/mix/drift` and `COMBAT.*`.
- Harness: `test-sim.mjs` 51 → **74**.

### THE THIRD WATCH: STANCE, THE ANIMATION SWEEP, THE KIT (Josh, 2026-10-28)
Josh: *"Make sure their animation state matches the environment and mood they are in. If they are just hanging out and calm they dont need to be in a fighting stance … go over their animations and make sure nothing is bugged … there are backpacks and make sure they can wear them and utilize them properly, do an equipment validation check."*
- **CALM OR READY** (`client/src/survivorz/show/stance.ts`, pure, no imports). The sim sends `alert` (wire.ts `BodyState.alert`/`TickBody.alert`, on change); a READY body plays the packs' combat loops with the weapon up, a CALM one plays plain relaxed loops with the weapon put away. A pose that IS a fight (aim, shoot, reload, fight, grabbed, panic) is always ready; one that never is (sit, sleep, talk, eat, drink, bandage, search, interact, revive, down) is always calm. No `alert` on the wire: inferred from the pose and `why`.
  - **Calm:** idle `ual1-idle-loop`, with folded arms (`ual2-idle-foldarms-loop`) some half-minutes; walk/jog/sprint the plain UAL loops; crouch the UAL crouch; hurt, the injured pack. Only a TOOL stays in the hand (the flashlight walk); a weapon goes onto the body (below).
  - **Ready:** the gun packs' loops (pistol aim idle, rifle low-ready, their walks and runs), the melee sword idle with the weapon, the axe at port arms; unarmed, the sword idle's guard with empty fists.
  - **Every clip** passes the laws on all seven bodies except the six measured on one body (`LAW_FAILS`, from anim/<body>/clip.json), which are never picked there.
- **THE SWEEP, and what it found** (`node --max-old-space-size=4096 scripts/survivorz/anim-show-check.mjs`, headless over all 26 bodies through stance.ts itself; not in the suite — it needs the gitignored game/ bodies):
  - **The ground-speed read was wrong, so the feet ran on treadmills.** It took the lower foot at ANY height as the planted one, so a run's flight counted as stance: UAL's sprint read 1.9 m/s (slower than its jog) and its jog 2.3 against a real 4.9–5.4. Now the planted foot is the lower one within 4 cm of its own lowest (a crawl's planted hand), and a loop the body's speed can't match inside 0.5–1.7× hands over to the next gait's loop (or the plain one) instead of skating.
  - **The Halloween zombie walks barely step** (0.02–0.09 m/s, ten-second takes of shuffling): a shambler at 0.45 m/s on one slid. Out of the walk list; a moving zombie only plays a loop whose own speed fits. A shambler's 1.0 m/s chase played the RUNNING loop at the 0.55 floor — it walks now; the run starts at 1.6 m/s.
  - **Standing one-shots on bodies on the floor:** a bitten, downed survivor stood up to flinch; a downed survivor's last-stand shot stood him up; a survivor dying while down stood up to die; a crawler's stagger, attack and death stood it up; a feeding zombie stood up to die. A body on the floor now takes no standing one-shot, dies where it lies (the loop frozen), and a feeding zombie's death joins the dying clip at its kneel.
  - **A held fall slid across the floor under a crawl** (the fall's last frame held while the body crawled off) — released the moment they move.
  - **Lying to standing in a quarter second** (revived, woken, risen from a reset): they GET UP now (`ual2-laytoidle`), and lie down for sleep the same clip backwards.
  - **The death played twice** (the event and the tick both start it; the second restarted the fall) — once now.
  - **Grabbed played the idle row** (a sword stance, weapon out, while a zombie had them): the finisher pack's braced shove (`fza-front-struggle-start-idle`), unpaired.
- **THE BACKPACKS** (`kit.ts`, `kit-fit.json`, fitted and measured by `scripts/survivorz/kit-fit.mjs`; look at one with `kit-bench.cjs`):
  - Laid in a **chest frame built from bone positions** (spine_03 origin, spine_02→neck up, shoulders across), the panel against the back. Per body and pack: how far behind the chest, how high, and a **PUSH** per clip: fitted to how a body stands and walks, a clip that would still sink the body into it (a braced struggle, a lunge, a run's lean) rides it out on its straps by that clip's weight, so it sits ON the back the rest of the time. Off for lying, sitting and sleeping.
  - **The big pack is modelled 1.08 m tall** (an expedition pack): drawn at 0.64, a real 60-litre pack, and its hip belt trimmed off (no one belt fits seven bodies; its wings sat in Carla's hips and stood the pack a hand off her back).
  - **Rollo wears none:** his suit's air pack covers his back from shoulders to waist, 20 cm deep — fitted, a backpack rode on top of the tank, a pack on a pack. His kit still counts it.
  - Loaded and compiled at the start with the guns and melee props (no mid-show shader compile).
- **THE STOWED KIT** (`kit-stow.mjs`): what they own and aren't holding is ON them — the pistol muzzle-down at the right back of the belt, a hammer or knife at the left back of the belt (behind the hips: at the side a hanging hand rests exactly where they'd go — 86 of Carla's hand vertices in a side holster), a long tool or the rifle slung across the back, or strapped down a worn pack's side (rifle left, tool right). Placed per body from the body's own measures and checked over every loop (no more than the law's 15 body vertices inside an item at any moment).

### THE GOALS, ROUND ONE: THE RECORDS AND THE TRUTH (2026-10-30)
Josh: *"continue going and do not stop until the show is complete and ready for review"*. The show had no goals: the endings were map spots nothing used, a bite never ran its course, and reading a terminal taught nobody anything. The goals are built in four rounds (records + the truth, infection + turning, the cure, the escape), each green before the next.
- **THE RECORDS** (`src/survivorz/sim/records.ts`, the text in docs/survivorz/RECORDS.md): all 42, each at a spot in its own room (a named terminal, else the room's terminal, else its first container — a letter in a locker is read while the locker is searched). Each takes its lock as written: Electronics N or a password found in another record, and R-10 needs the labs' power.
  - **Read one at a time** (goals.ts): a paper 4 s, a screen 7 s, an audio log 45 s. Each goes out as an event with its title, and a recording plays its own log (`recorder.play` {log}; the cue fills `{log}`). The dead cut a reading short, and the record in hand stays unread.
  - **A locked spot is remembered:** they come back once they know the password or have learned the Electronics.
  - **Knowledge is the reader's until it's shared.** Records and passwords go with the telling (knowledge.ts share), so a group that loses its only reader loses what was read.
- **SKILLS** (§7b), the two the endings read: Electronics and Science, from each background's starting level, ceiling thinking + 3. Reading the research is study (a Lazarus note most), and opening terminals is Electronics. `SKILL_XP` in tables.ts. Science 7 is what Lazarus needs.
- **THE TRUTH** is reached when someone living has read the final file (R-40) and the living hold 8 of the 12 between them: `truth.found`, a morale lift, and the reader's `truth` moment.
- **On the broadcast:** a TRUTH / LAZARUS progress line under the stores, a record card when one is read, and a big card when an ending lands (Overlay.svelte; wire.ts `Goals` in snap and tick).
- **The talk layer** hears the record by title, and whether it's part of the truth, a Lazarus note or names Claudia. The model's facts carry the last few titles read, the counts and the passwords known.
  - **…and what it SAYS** (later the same day): every record has a one-sentence gist (`docs/survivorz/record-gists.json`, copied beside records.ts; written from RECORDS.md, never a password, test-sim checks both). A survivor who just read one is told what it says, and the facts carry the gists of the last two read (each cut at 170 characters for the budget), so they talk about the place instead of reciting a title.
- **Fixed on the way** (the new events moved the seeds and exposed both):
  - **A survivor who won't fight through the dead at the safe-room door gives the run up after 25 minutes** instead of standing there (146 minutes in one run).
  - **The grief check is controlled now:** on the open seed the director's pace was rightly holding the trickle back after four deaths, so the check had been measuring the pace, not the grief.
- **THE DEATH RATE, MEASURED AGAIN** (8 seeds × 120 h, before and after this round, same result): **4.75 of the 6 dead within five days**, and the whole cast in 3 of 8 runs. "About 8 a week" ends the show inside the first week, long before stage 3-4 where the cure and the escape are. It is Josh's call ("ship as-is, watch it"); it's flagged for the review with settings ready.
- Harnesses: test-sim 74 → **89**, test-audio 45 → **46**.

### THE GOALS, ROUND TWO: THE INFECTION RUNS ITS COURSE (2026-10-30)
Before this a bite set a flag and nothing ever came of it. Now §5's 24-hour clock runs (`src/survivorz/sim/infection.ts`):
- **The stages:**
  - **0–6 h:** incubation. Nothing shows.
  - **6–14 h:** fever. Stamina capped at three quarters, and they shiver when idle.
  - **14–20 h:** coughing fits. The cough is NOISE (14 m): the dead come to it, and anyone awake within 10 m knows what it means.
  - **20–24 h:** confused. Skills worked at −3, 80% speed.
  - **24 h:** they collapse (a minute; nobody tries to revive somebody who is turning) and **stand up as one of the dead in their own body and clothes.** The survivor's gear lies where they fell. Their card stays on the strip (dead, "turned"), and the zombie is drawn with the survivor's own scan and the turned look (body.ts `turned`: grey skin, veins, milky eyes) on the zombie moves the bake already gave every survivor body.
- **A bite nobody saw can be hidden.** The SIM decides now, with the honesty gene (Dale hid 34 of 40 in the harness), and the talk layer voices that decision instead of rolling its own. A bite somebody saw is known. A hidden one comes out with the cough, or a confession.
- **ANTIVIRALS:** about ten in the facility (7 in Medical and the labs, plus 3 in the morgue's cold drawer, which opens to R-19's code 1917). Each stops the clock for 12 hours, and they're taken at the fever. None cures; Lazarus does (round three).
- **On the wire:**
  - `vitals.infected` is now the KNOWN infection (never a hidden one), and `vitals.sick` is the visible symptom: the audience may see the shiver before the group does.
  - BodyState `turned` marks both the zombie and the survivor it was.
  - New events: `infection.known`, `infection.stage`, `inject`, `survivor.turned` and `keypad.ok`.
- **New moves:** `bd-cough` (lying, `mx-laying-severe-cough`), `bd-shiver` as the fever's idle, and `bd-inject`. All are within the clipping law on all seven bodies (anim/<body>/clip.json); the move-choice sweep is clean.
- **THE BODY LEVERS** (Admin Panel → Survivorz → Show, with a survivor followed): Down · Revive · Infect · Kill (`POST /api/admin/survivorz/body`, audited). Infect puts them at the end of the clock, so a turn plays within a couple of minutes. Filmed in the preview: Sarah coughing, collapsing, rising.
- Harnesses: test-sim 89 → **103**, test_survivorz_broadcast 43 → **48**; test_survivorz_talk's secret-bite check now uses the talk layer's own definition of secret.

### THE GOALS, ROUNDS THREE AND FOUR: THE CURE AND THE ESCAPE (2026-10-30)
**THE CURE — LAZARUS** (`src/survivorz/sim/cure.ts`), §2's four steps:
1. **The recipe:** the five Lazarus notes. The brewer needs at least 2, and each one raises the gamble's odds.
2. **The sample:** the sample kit sits in Medical (the first of exam-cabinets · operating-cabinet · pharmacy-shelves). A kit carrier beside an EXPERIMENT killed within a minute kneels and takes it, whatever their job.
   - The `sample` job hunts where they last saw one, so somebody goes into Containment on purpose.
   - It spoils six hours out of the cold, unless the work has started.
3. **Making it:** the Deep Lab's bench, powered, Science 7+, the recipe known.
   - Two hours of work in 20-minute sessions, so it can be split, and the others go with the brewer (escort).
   - The machines are noise (20 m) every minute. `lazarus.start` loops the lab machine.
   - It makes **three doses**, in the brewer's pack or at the bench.
4. **Proving it:**
   - **The analyser:** an hour, certain.
   - **Or the gamble:** a dose into somebody infected and late in it, at 70% + 10% a Science level above 7, + 10% with all five notes. **A failure turns them on the spot.** Measured over 30 harness runs: 23 cured, 7 turned.
   - Proven either way is **THE CURE**, and each dose left cures one infected person (`survivor.cured`).
- **STUDY**, the study arc §7b asks for: at home, somebody who could reach Science 7 works through the research the group has shared, at 60% of reading it themselves, one record per 12-minute sitting. Without it Science 7 never came in the endurance runs.

**ESCAPE** (`src/survivorz/sim/escape.ts`), §2's four steps:
1. **The route:** somebody walks the far tunnels to the maintenance shaft (`route` job → doors.ts `mapRoute`, `route.mapped`). The knowledge travels with the rest of what they know (`route:out`, never shown to the model).
2. **The decision**, with the route known, Security powered and the override's place known, every 45 minutes:
   - **Who goes** is the genes against the state: self-preservation over loyalty, morale, wounds, days down there, less for the curious, and much less for anyone they know is infected.
   - **Who presses** is a stayer who'd do it for the others (loyalty + assertiveness), else the fittest of the goers.
   - The event is `escape.planned`.
3. **The override:** the goers wait in the vault chamber, and the presser arms it once they're there (or after 15 minutes).
   - **The countdown:** `vault.armed` → the PA's thirty, ten, five → doors.ts `useOverride`. The vault stands open 90 s, then `vault.shut`, for good.
   - **The open vault is passable** to the walk and the planner while its window lasts. It used to be refused always.
4. **The run:** the goers sprint for the transit tunnel. Each who reaches it **leaves the show alive** (`survivor.escaped`, never counted a death; the card reads OUT). The first one out is **ESCAPE**. A goer who presses it runs with the clock already going.
- **On screen:** the progress line shows LAZARUS n/5 · SAMPLE · % · DOSES and ROUTE OUT FOUND / VAULT ARMED / OPEN / SEALED · n OUT, and a banner comes up for each ending.
- Harness: test-sim 103 → **125**.

### THE VOICES, THE BENCH, AND THE END (2026-10-30)
- **THE SURVIVORS SPEAK** (`src/survivorz/voices.ts` + scripts/rollo/agent.py's `survivorz_worker`):
  - **The hold:** a line the talk layer writes is held while slopbot's agent renders it in that survivor's cloned voice (Josh's picks of Oct 20: survivor-johanna/-dale/-ben/-rick/-sarah; Rollo's "" is the voice server's own default, his queens-1). It then goes out WITH its clip (`say.audio`, `say.ms`), so subtitle and voice arrive together.
  - **On screen:** the clip plays from where the survivor stands and follows them (engine.ts `voice()`, 28 m, walls dull it), with the score ducked. The subtitle holds for as long as it's said.
  - **No agent, or a render past 12 s:** the line goes out as a subtitle alone, as before.
  - **Only an agent that asks** (`/near?v=2&sz=1`) is handed lines, so an older build never sits on them.
  - **Measured live** the same evening: every survivor voiced, renders 1.3–3.2 s for 3–8 s of speech.
  - **Deployed to slopbot** by replacing agent.py and letting `Restart=always` bring it back (the service runs as josh).
- **THE BENCH** (§6; Admin Panel → Survivorz → Show → **Bring in Claudia**, `POST /api/admin/survivorz/newcomer`, audited):
  - **Found, not spawned:** a sealed room in a wing the group has reached is unsealed, and she hides in it. Refused while six are alive.
  - **She calls out** when one of them is within 18 m (they learn the room and its door, and get a "find whoever's calling" job). She's FOUND when one walks in, is told what they know, and is one of the group (`survivor.newcomer` / `survivor.calls` / `survivor.found`).
  - **Drafts, not agreed:** her sheet keeps the sheets' rule (nothing of the facility's secrets), and her numbers and voice are drafts for Josh — docs/survivorz/cast/claudia.md. She speaks in a stock voice until a clone is picked.
  - The strip grows a seventh card.
- **THE END:** with nobody left inside (dead, or out through the vault) the sim sends `show.over` once, and the overlay puts up THE END. It stays up, and a watcher who joins after it sees it too (`goals.over`).
- Harnesses: test-sim 125 → **134**, test_survivorz_talk 84 → **91**.

### THE LONG RUN: WHY NO ENDING WAS EVER REACHED (2026-10-30, later)
Fourteen sim-days per cast, printed a day at a time, measured both the cost and the progress.
- **THE COST HOLDS:** 800–2,200x real time across all 14 days, heap flat at 40–105 MB (no leak), the worst single tick a few ms against a 100 ms step. Four weeks of broadcast is fine as far as the sim goes.
- **THE GROUP STALLED FROM DAY 3**, every survivor still alive back in the safe room with nowhere left to go, and no ending ever reached. Two causes, both now fixed or parked:
  - **The generator (FIXED, live):** the rough draft let survivors throw only the Labs, Medical and Security breakers (`ALLOWED_BREAKERS`), so Containment and the Deep were never powered — and the Deep Lab holds the bench and the final file. Now it's Josh's Oct 23 rule: **the generator runs three zones at once** (`GENERATOR_ZONES` in doors.ts; the emergency zones don't count). Every breaker can be thrown; with three lit, a survivor who needs a dark zone more than a lit one SWITCHES the power over, cutting the zone they need least (`zoneNeed`/`switchFor` in survivor.ts: people standing in it, rooms there they haven't been in, screens unread, the Deep while the truth and the cure are undone, Security once the way out is known) — never a zone somebody is standing in. `cutBreaker` sends `zone.powered` with `on: false`, which the screen already handled.
  - **The steel door (PARKED, branch `survivorz-stage4-door`):** the door peek backed off at a deeper stage's keycard reader EVERY time, so nobody ever opened the Containment door off the Security Corridor, card or no card. The fix (back off only the first time; chosen again, open it) works — 5 of 8 casts entered Containment — but they arrive on day 2–3 with 1–3 survivors left, the breakout kills them (5 of 8 wiped, against 1 without it) and nobody reaches the Deep. Stage 4 is meant to be week four's finale. **Josh's call** (docs/survivorz/REVIEW.md).
- **Fixed on the way:** a newcomer's rescue was thrown away whenever her room was already on the menu as a plain "explore" (the menu keeps the first entry per key) — it has its own key now; and the grief check puts earlier arrivals down so it measures the grief, not the arrival cap.
- **Still open, not fixed:** a card-less survivor at home can loop on a keycard door, because the menu counts a card held by anybody within 6 m (`cardFor`): they walk out alone, fail, come home and choose it again. Using only their own card instead stalled the whole group at stage 1 (they move together and lend cards), so it needs a better rule than either.
- Harness: test-sim 135 → **138** (the generator: a fourth zone refused, a switch to the Deep cutting the zone they need least, never one with somebody in it).
- **THE GENERATOR, SETTLED (2026-10-31).** Seed 33 switched Labs and Medical back and forth about thirty times in two days and walked to the generator hall ~200 times for a switch the panel then refused. Two causes: `zoneNeed` counted the people standing in the zone being WANTED, and the group walks to the generator together, so that need was gone by the time they reached the panel; and a zone could be cut the minute after it was lit. Bodies now count only on the side being CUT (never cut a friend's lights), never the one deciding; a zone switched on is held for `SWITCH_HOLD_MS` (2h); a refused switch waits 30 minutes. Seed 33: 4 throws and 3 refusals. Over 8 casts × 10 days nobody was wiped (1 of 8 before) and 19 of 48 were still alive. Harness 138 → **140**.
- **THE STAGE-3 DOORS OPEN (2026-10-31).** Three casts in eight held the level-2 card, knew Security and Maintenance wanted it, and still never reached the Power zone: the peek backed off at the reader of any deeper stage EVERY time, so stage 3 was reached only by an accident (an escort or a resupply crossing). A reader they have already read is now weighed by the menu like any other cost — for stages below `LAST_STAGE` (4). The stage-4 doors still back off every time, pending decision 2. 8 casts × 10 days: all eight reach six zones (five before), 13 of 48 alive at day 10 (19 before), one cast wiped (none before) — further means more fights. Harness 140 → **142**.
- **THE CONTAINMENT DOOR, MEASURED (2026-10-31).** With the parked door fix a group does NOT go in weakened, as first reported: seed 11 walked in at hour 41 with all six fit and armed, and four died within half a minute on `containment-stairs` with ten experiments on them. Lighting Containment opens the specimen cells, and 31–34 of the 34 experiments are still alive on arrival (about 14 in Containment). A "three or more fit and armed" gate was built and measured: identical runs, since the group is always at full strength when it reaches the door. It was taken out. The door stays shut until Josh picks a difficulty change (fewer experiments, the cells holding until a record explains the lockdown, or experiments that go down faster) — REVIEW.md decision 2.

### THE ENDGAME, TUNED (2026-10-31, latest — Josh: "re-tune for endings", then "whatever you recommend")
Measured over **16 casts × 28 sim-days** each round (`finale.mjs` in the session scratchpad, finale on day 14).
- **THE FINALE IS DAY 14** (`SHOW_FINALE_DAYS` in tables.ts; the box can override with
  `SURVIVORZ_FINALE_DAYS`). Before it a last-stage zone costs `FORBIDDEN_ZONE`; after it the group's range grows by
  `FINALE_RANGE` (4) and by `ENDGAME_REACH` (6 more) for the Deep while the truth or the cure is undone.
  **`finaleMs` is config, not state** (in `NOT_SAVED`): a save made before it existed would otherwise pin the doors
  shut forever after a restart.
- **CONTAINMENT STAYS SHUT FOR GOOD.** Lit at the finale, the breakout wiped 9 casts in 16 inside a day; left dark
  but on the menu, half of the finale's first-day deaths were in its cryo-hall (two experiments live there and it is
  a vent the dead come in by). Its breaker is never thrown (`mayLight`) and the zone costs `FORBIDDEN_ZONE` always.
  Nothing an ending needs is in there: the Deep is reached by the tunnels' grate.
- **THE TRUTH COULD NEVER BE REACHED — a bug, not a balance.** The final file's spot is its own kind on the map
  (`final-file`, drawn differently) and the menu's list of readable spots took only `terminal`, so no cast in any run
  ever read R-40. It is read like a terminal now, and test-sim drives a survivor to read it through his own menu
  (the old truth test handed the records over, which is why it never noticed).
- **THE EXPEDITION.** A trip into the Deep was chosen and dropped within a minute, dozens of times a day: the boredom
  that sends somebody out only counts while they stand in the safe room, so one step out of the door it was gone and
  resting won again. A trip into the Deep after the finale keeps the boredom it set out with (`Job.bored`) until it
  gets there. (A flat score bonus on Deep jobs was tried first and taken out: 6 casts in 16 wiped against 3.)
- **STUDY PAYS IN FULL** (`STUDY_SHARE` 0.6 → 1): the science in the reachable facility is ~1,270 XP and the best
  start needs 1,260 to reach 7, so at 0.6 nobody reached Science 7. Several survivors reach it now.
- **A sample job only names a room the survivor knows** (an experiment glimpsed through a doorway named one they had
  never seen — test-sim's knowledge assert caught it once science rose).
- **What it produces** (16 casts × 28 days, the last round): **8 of 16 casts reach an ending, all between day 14 and
  day 17** — THE TRUTH in 5, THE ESCAPE in 6 (some casts both). 3 casts are wiped before any ending, 5 end the month
  alive at home with none. **THE CURE is never reached**: Science 7 is, but the sample needs a kit carrier beside a
  fresh experiment kill, and most experiments are in the Containment the group now never enters. It stays the
  rarest ending; if Josh wants it seen, the dial is an experiment or two placed in the Deep (2 today).
- Harness: test-sim 145 → **146** (the final file on the menu; the start count is ~30 after the thinning; the
  hourly check exempts an hour the whole house sleeps through).

### THE CURE, MADE REACHABLE (2026-11-01 — Josh: "make it reachable")
Four more experiments in the Deep (2 → 4) changed nothing: still 0 of 16. Traced cast by cast, the cure chain broke
in four places, none of them a balance number:
- **THE ONE KIT WAS SPENT ON DAY 1.** There is one sample kit. Whoever picked it up took a sample from the first
  experiment killed in Labs or Medical, it spoiled six hours later, and the kit went with it. Now the case is
  reusable (a spoiled sample, or one put into the bench, leaves the empty case), and nobody takes a sample before it
  could be used (`sampleUseful`: past the finale, the Deep powered, somebody alive who knows the recipe).
- **SCIENCE 7 ARRIVES AFTER THE DEEP'S EXPERIMENTS ARE DEAD.** It comes from the Deep's own records, read hours
  after the group meets the experiments guarding them (13 hours in one cast, against a sample that keeps 6). The
  bench has a COLD STORE (`CureState.sampleCold`, declared since the cure was drafted and never used): a sample
  brought there by somebody who can't work it yet keeps until somebody can, and the work starts from the store.
- **THE EXPERIMENTS ARE KILLED 30–50 M AHEAD OF THE KIT.** A sample had to be taken within a minute, and the
  carrier only walked over to a body already within 2.5 m. Now it is fresh for 3 minutes (`SAMPLE_FRESH_MS`) and a
  carrier with nothing on them walks over from up to 30 m (`SAMPLE_SEEK_M`).
- **THE KIT STAYED HOME.** Its holder was usually resupplying or asleep two floors up during the trip. Somebody
  setting out for the Deep after the finale now takes the kit from a holder in the same room who isn't going.
- Found on the way: a sample put into the machine at 5h59m could spoil during the first minute's work (the work
  counter still read 0). The spoil clock restarts when the work starts.
- **What it produces** (16 casts × 28 days): **THE CURE in 1 of 16**, cast 707 on day 16.6, the first cast ever to
  reach all three endings. About one in seven of the casts that reach the Deep. Truth 3, escape 6, and 33 still alive
  at day 28 (30 before). It stays the rarest ending. If it should be seen more, the remaining break is the kit
  carrier dying in the Deep: the kit lies on the body until somebody goes back for it.
- Harness: test-sim 146 → **151** (no sample before it's useful, the case back after the bench and after a spoil,
  the cold store taking a sample, keeping it past six hours, and the work starting from it).

### THE PRE-FLIGHT ROUND (2026-11-01 — Josh: "automate it", "fix them", "a daily summary")
- **THE HOUSE GOES QUIET, THE SHOW DOESN'T.** For the show's month Sterling, Dr. Voss and the goblins are on
  their scripted lines (Admin Panel → House tools → switch off) and the casino regulars are off
  (`ROLLO_LIVE=0`). That switch used to gate the show's engine too, so it would have silenced every survivor:
  the show now reads `brain.showUp()` (an engine configured and loaded) and keeps its own talk switch.
- **CLAUDIA COMES IN BY HERSELF** (`SimOptions.benchAfterHours`, prod `SURVIVORZ_BENCH_HOURS`, default 6): six
  sim-hours after the latest death, once fewer than six are alive and nobody is down or in a zombie's grip,
  she's hiding in a sealed room the group can reach (the ordinary `newcomer()`, once ever). The admin's lever
  still works. Her voice is Josh's pick, "composed 3".
- **TURNING MID-VENT**: collapsing to turn now takes the body out at the vent's nearer end (going down and
  dying already did); it lay inside the wall for the minute and stood up there.
- **THE SAMPLE CASE ON A BODY**: while the cure is wanted and nobody alive holds another case, going back for
  one on a dead carrier is an errand worth a keycard (120 less distance and half the danger), not an ordinary
  "go through their things", which never outweighed the Deep.
- **THE DAILY SUMMARY** (`src/survivorz/daily.ts`): 09:00 house time while the show runs, Sterling DMs every
  admin the day, who's alive (and who's still hiding), deaths in the last day, escapes, endings, the talk and
  voice counts since the last one, and every health check that carries the show. `POST /api/admin/survivorz/daily`
  sends one now. Never voiced.

## 13. Order of work

1. **References + this document** — done (uncommitted).
2. **Animation intake** — done (uncommitted): the bone maps; 210 survivor
   clips on all six bodies, 56 zombie clips on all 19 zombies; contact
   sheets; the zombies exported with their skins; the shotgun rebuilt.
3. **Stream test:** the pipeline is built and soaked locally (§12). The
   24-hour unlisted YouTube run is **on hold** until Josh's account can go
   live; it moves after the show itself, since testing happens in the Admin
   Panel's Watch and Enter (§12).
4. **Every asset first** (Josh, 2026-10-20: "get everything we need …
   before we start building anything"): `docs/survivorz/ASSETS.md` is the
   plan. That means the standards, a sourcing pass, a one-room look test,
   then every model, texture, move and sound approved in the manifest.
5. **The facility map**, with Admin Panel → Survivorz → Watch / Enter built
   alongside it, so each piece is validated as it lands.
6. **Survivor bodies in the Backrooms world** (the regulars' engine moved
   across).
7. **The survival layer.**
8. **Combat + infection.**
9. **The zombies + the director.**
10. **The three endings.**
11. **The cast** (bodies, voices, sheets, bibles).
12. **Genes + simulator.**
13. **The broadcast layer.**
14. **The GPU switch-over** (§11: the supervisor's game pause off, the ears
    off, the voice agent in speaking-only mode with the six voices).
15. **THE STRESS TEST, before anything goes live** (Josh, 2026-10-22:
    "whenever we finish validation and testing we can perform stress test
    before ever going live"). On the finished facility, every card at show
    load at once: all six survivors and a full horde awake, the model's four
    slots saturated, both voices busy, the stream at 1080p60, hub DMs on top.
    Pass marks: 60 fps held, model replies inside ~5 s at the worst, no voice
    queue past ~4 s, R220 loop p99 under 30 ms, and BOTH cards' memory flat
    over 24 hours (the soak's 0.3 GB creep must settle). A failure is fixed
    and the test rerun — nothing goes on YouTube until it passes.
16. **A 72-hour unlisted dress rehearsal**, then the four weeks — and the
    switch back afterwards.

## 14. Still open

- **YouTube's archive limit** on very long streams — confirm before launch.
- **The Renderpeople free models' licence** (the three from their own site,
  not the CC-BY Sketchfab ones) — read before they're streamed.
