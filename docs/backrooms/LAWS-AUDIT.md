# The Backrooms laws — audit and open work

Josh set thirteen laws for every Backrooms level on 2026-10-09 (CLAUDE.md →
"THE BACKROOMS LAWS"). This is the first audit of Levels 0–3 against them:
four read-only passes over the code (relics + drives, creatures, progression +
admin + voice + spectating, uniformity + performance). Tick an item when it
lands; a law is met when its section is all ticked.

Status key: **FIXED** landed · **OPEN** not started · **DECIDE** waits on Josh.

**Josh decided (2026-10-09):** relics are rolled AT PICKUP from what the picker is
missing (law 4, option b) · the walkie reaches ONE level · 16 players PER LEVEL,
a voice room per level (after a load test) · the ghost voice is enforced in the
client first (superseded 2026-10-11: enforced by the server through LiveKit).

## Fixed in the audit's own commit
- [x] The Poolrooms' key and Pipe Dreams' fuses were picked up against Level
  0's walls (`losClear` walks Sector A) — now `pickupLos` on their own level.
- [x] A step through the Landing refused as "too far" sent the Poolrooms' key
  home first — range is checked before the key moves.
- [x] Breakers and cutoffs could be thrown through a wall or by a flying admin.
- [x] Holding E at a cutoff flooded everyone on Level 3 with power frames.
- [x] The Bleeder froze in the light when power came back (retreat refused by
  its own step backstop); it could scream over and over at someone it could see
  but not reach; its victim never heard the bite. Harness asserts added.
- [x] The Bleeder and the Shy Guy faced whoever was WATCHING while charging,
  not their target — every screen now shows the same charge.
- [x] Station relics had no name, picture or Voss note on the client.
- [x] The hub refused the admin a locked Level 1 (law 7).
- [x] The operator map drew a thrown breaker as unfinished.

## Law 1 — relics and lore drives
- [x] **DONE (Oct 2026)** Every level has its own strand of twenty drives:
  Level 0 001–020, the Poolrooms P01–P20, Pipe Dreams D01–D20 (the colour-coded
  lines; `lore-pipes.ts`), the Station S01–S20 (Foreman Halvorsen;
  `lore-station.ts`). `LEVEL_DRIVES` + `placeDrives(level)` place them, the
  wire streams them on all four levels, the operator view shows them,
  `test_placement` (63) and `test_flycam` (52) cover them.
- [x] **DONE** Every drive carries a one-line description and a Dr. Voss note
  (`lore-notes.ts` for L0/L1, beside the text for L2/L3); the reader shows her
  note, the research archive groups by level, `/ada drive <title>` quotes it for
  drives you have recovered.
- [x] **DONE** Drive 018's note corrects the canon (Level 2 is Pipe Dreams) in
  Voss's voice; the drive text itself stays the rumour it is.
- [x] **DONE** `test_placement` asserts every drive has text, a description and
  a Voss note, and that no id repeats across levels.
- [x] **DONE** `test_placement` and `test_flycam` cover Level 3.
- [x] **DECIDED (2026-10-10)** D10's dead worker stays "the name worn off" (Josh).

## Law 2 — creatures
- [x] **BUILT (Oct 2026)** THE GRABBER — Pipe Dreams' creature, server brain,
  wire, client body/clips/camera wrench/sound, operator view, admin lever, and
  `test_grabber` (28, one assert per design line). **LIVE since 2026-10-10**
  — Josh previewed its five sounds ("the sounds are fine"); `BACKROOMS_GRABBER=0`
  is the off switch.
- [x] **DONE (Oct 2026)** Map-editor Entities carry Level 0's hardening — pits
  refused in the route, the string-pull, the lunge and the seat; corner-clearing
  routes; a body-wide lunge; spent noise — and each level's own rule:
  `spawnShun` refuses the Poolrooms' deep end and Pipe Dreams' safe rooms, and
  `sheltered` puts a swimmer or a body in a safe room out of reach. Harness
  `test_spawned` (42), red on seven against the old code.
- [x] **DONE (2026-10-10)** Corner clipping was REAL, not a risk: the Grabber
  walked through solid cells in ~1 run in 4, the Shy Guy in 6 of 6. Every creature
  now routes with `clearCorners` and a body-wide string-pull, and the Bleeder,
  alligator and Shy Guy harnesses gained the whole-run "never inside a wall"
  assert that caught it (the Grabber's already had one).
- [x] **INVESTIGATED (2026-10-11)** The Shy Guy's "gains ground while you run"
  failures, traced frame by frame over fourteen runs (its route state on the
  debug view, every chase frame logged): never the pathfinder (0 partial
  routes) and never on dry land — a dry-staged chase is caught in 15–41
  frames. Every failure was a chase staged at the WATER'S EDGE: it set off from
  the shallows on the quickest line to where the runner stood, across a deep
  pool, and swam it at 0.8 cells/s while the runner skirted the pool on dry
  floor and opened the 16-cell gap. That is the agreed design (water is the
  escape). The harness now stages its dry chase on dry ground (no water near
  either body or between them), and the dive search falls back to the
  stage's known deep water (the other half of the flake). **For Josh:** a
  creature that commits to swimming a pool while you run round it on the
  deck is the escape working, but it reads as the creature misjudging; a
  "prefer dry while the quarry is dry" route would close it, at the cost of
  fewer escapes (law 11 — your call).
- [x] **DONE (2026-10-11)** Entity: a body that has stopped slows its one clip
  (Josh's rule: the walk is the only clip) to a slow writhe instead of walking
  in place; out of sight it now goes to where it LAST SAW you and gives up
  there — the 10s window used to path to your live position; and `onDead`
  plays its kill tempo only when it was the Entity that killed you.
- [x] **DONE (2026-10-11)** The harness gaps, five new harnesses (71 asserts),
  every number clocked off the creatures' own positions: `test_entity` (23 —
  orbit, swap, wander 1.15 / charge 2.375, hearing by gait and voice, kill,
  the sated rest, the search), `test_stalker` (12 — the mimic, burned off and
  back, the kill and the melt), `test_shy_visit` (10 — lurk timeout, despawn
  only out of sight, the return, no treasure no visit), `test_gator_more` (11
  — 2.85 / 1.45 / 2.05 by depth, the sleeping pool, the editor's spawners),
  `test_bleeder_more` (15 — the 2.6 search, the feed, admin J's summon, the
  real 35s rest). Nothing they measured was off-spec. The two things that
  first looked wrong were the harness: the Entity's charge measured 1.9 when
  timed along a wall (it routes there, and charges at exactly 2.375 on a wide
  clear line), and the Shy Guy's shaft refusal can't be staged on P6, which
  has no shafts.
- [x] **DONE (2026-10-11)** Minor: a waiting Bleeder breathes its idle loop
  (it already searched in place); the Shy Guy look report retries every 1.5s
  while it stays docile; a bystander sees the Stalker strike with its Attack
  clip (Attack Near stays the victim's view).

## Law 3 — progression
- [x] **DONE (Oct 2026)** `test_progression` (54) walks Level 3: the ship gate,
  the pressure door, all six breakers thrown on foot, the shutter powered.
- [x] **DONE (Oct 2026)** A key or fuse on a body at the bottom of a SHAFT goes
  home at once (`dropCorpse`: a pit is lethal-deep, nobody can follow). A body
  in DEEP WATER keeps them — a diver can reach it on a breath. `test_progression` (58).

## Law 4 — relic duplicates
- [x] **FIXED** A site is anonymous until picked up, then one the picker is
  missing (carried counts as found); duplicates only with all ten; a body's
  relic you already have stays on it. `test_relic_law.mjs` (35).

## Law 5 — uniform player experience
- [x] **DONE (2026-10-10)** A peer's run threshold scales by the wade factor at
  their own cell (0.78 / 0.55), so a wading sprint reads as a run.
- [x] **DONE (2026-10-10)** Wading, sloshing steps and the water animation read
  the MAP's water on any level (the server already did); only the Poolrooms
  carry water today, so nothing changes until another level gains some.
- [x] **DONE (2026-10-10)** The camera pays for EVERY creature through one rule
  (`filmed`): raised, POINTED at it (the old sampler never checked — a chasing
  Entity even earned a close tape from behind), a clear line, 13 cells. An
  alligator counts only from ITS water — from the dry tile it is a risk-free
  400 silver. `test_footage` (17).
- [x] **DONE (2026-10-10)** Every level leaves on E at a way out (one `atExitDoor`
  test; Level 0's red wall used to end a run on a touch), with a note on
  arriving at one. Pinned in `test_flycam` (57).
- [x] **DONE (2026-10-10)** THE PRESENCE PULSE: every still body is
  re-announced once a second to whoever is near it (emote, torch, pose ride
  along). `test_spectate` (28).
- [x] **DONE (2026-10-10)** Peers are HEARD: a consume reaches whoever is near
  (`peergear`, the kind only), a held can hisses the whole time (one hiss per
  peer, re-levelled on change), feet step on their own stride, and every peer
  sound fades with distance (gone at 14 cells) and darkens through walls. All
  existing synth voices — nothing new for Josh to preview. The camera has no
  sound for anyone. `test_spectate` (31).

## Law 6 / Law 8 — theme and environmental detail
- [x] **DONE (2026-10-11) — THE REFERENCE TASK.** 20 theme-accurate images per
  level found online and every level flown and MEASURED against them:
  `docs/backrooms/REFERENCES.md` (links, notes, verdicts). Level 0 right hue
  but ~28% dark; the Poolrooms match in light and colour; Pipe Dreams nearly
  black and with NO wall pipes; the Station cold tile where the references
  are warm brick.
- [x] **DONE (2026-10-11)** Pipe Dreams' wall and ceiling pipe runs (a known
  gap since Sep 2026), from Josh's own pipe kit — `buildPipeRuns` in
  client pipes-props.ts; one mesh a chunk, measured at +8–36% triangles.
- [x] **DONE (2026-10-11)** Level 0 brightness (room light ×1.75, luminance
  89 → 115 against the set's 126) and Pipe Dreams' lamp pools (gain 1.3 →
  3.2, dark kept between). Level 0's ceiling, paper scale, baseboards and
  carpet stay as Josh set them.
- [ ] **JOSH DECIDES** (left, each one a call Josh made earlier) Level 0's
  ceiling, wallpaper print scale, baseboards, carpet stains.
  Poolrooms: DONE 2026-10-11 — 12.5cm glazed tile on one world-aligned grid,
  no stone or marble (LEVEL1_SURFACES). Pipe Dreams: lamp light
  pools (difficulty); open rooms and the warehouse racking. Station: a brick
  texture download (CC0), cages, cabinet banks, conduit. The water: DONE
  2026-10-11 — dark and reflective, a ragged shore, the current as crackles.
  The brick and the warm light: DONE 2026-10-11 (Poly Haven "Red Brick 03",
  CC0; sodium light; live sections lit throughout, dead ones black). Conduit
  along the walls and serviceway ceilings: DONE 2026-10-11. Cabinet banks: DONE
  2026-10-11 (86 along the electrical rooms' walls). Cages: DONE 2026-10-11
  (the transformer bays). The Station's reference gaps are all closed.

## Law 7 — the admin sees everything live
- [x] **DONE (Oct 2026)** A carried key or fuse is drawn where its carrier stands
  ("carried by NAME"), one on a body where the body lies; the operator view has
  a BODIES layer (ringed when it carries the way on), on both maps and in the
  legend. `test_progression` (61).
- [x] **DONE (Oct 2026)** The client handles the server's fly answer: a refusal
  puts the camera back through the same `applyFly` the F key uses. `test_flycam` (55).
- [x] **DONE (Oct 2026)** `test_flycam` covers Level 3.

## Law 9 — 16 players per level
- [x] **FIXED** 16 PER LEVEL (enter and every travel), a LiveKit room per
  level (the client rejoins on travel, a muted mic stays muted).
- [x] **FIXED (2026-10-10)** Frustum culling is back on for every chunk mesh
  (merged geometry is world-space, so its own sphere is the chunk's; the
  instanced pieces build theirs from the instances), so the camera AND the
  torch's shadow pass skip chunks out of view. Far plane 120 -> 96, just past
  the thickest fog (the Poolrooms' 92). Measured in the headless rig, draws /
  triangles a frame across eight headings, off -> on:
  Level 0 ~250 / 224k -> 37-107 / 37-66k · Poolrooms ~810 / 450k -> 133-165 /
  56-73k · Pipe Dreams 307-443 / 430-680k -> 144-277 / 103-334k · Station
  192-288 / 249-415k -> 36-140 / 33-174k. Pixel diffs against the unculled
  build: 0% on reruns (the only specks were the entrance mark's random spray
  dots and lamp flicker). `__brDbg` now reports `calls`/`tris` per frame.
- [x] **FIXED (2026-10-10)** A Station power change rebuilds only the chunks
  within the bake's 3-cell lamp margin of a section whose power changed.
- [x] **FIXED (2026-10-10)** The Stalker refreshes seen ground only for players
  close enough to matter to where it stands.
- [x] **DONE (2026-10-10)** A peer unheard for 3.5s is taken off the screen (the
  pulse makes that safe), and with no position its voice goes silent.
- [x] **FIXED (server)** `load_backrooms.mjs`: 16 on every level, p99 20.7ms.
- [x] **MEASURED (2026-10-10)** The CLIENT half, Level 0 on an RTX 3090 Ti
  (headless, real GPU): 15 peers in view take a frame from ~67 to ~87 draws
  and ~52k to ~62k triangles; frame rate unchanged (~105 fps either way).
  Poolrooms 150 -> 165 draws, Pipe Dreams 210 -> 231, Station 94 -> 109;
  ~104 fps on every level with fifteen in view.
  Measuring it FOUND A REAL BUG: everybody who came in by the same door was
  set down on the same spot, so the second arrival stood inside the first —
  and a body around the camera draws as screen-wide shards of colour (it
  looked like a skinning fault; the CPU-side skeletons were clean). FIXED
  both ways: the server's `arrivalSpot` sets a newcomer down on the nearest
  free, walkable spot beside the door (enter and every passage; rings out
  to ~3 paces, sixteen at the cramped Landing and Station doors all land
  0.8+ cells apart), and the
  client hides a peer whose body is within half a metre of the camera
  (runners pass through each other, so this still happens mid-walk).
  `test_spectate` pins the arrival (32).
- [x] **FIXED (2026-10-10)** A peer standing right beside you wore a name tag
  the size of the screen (a fixed-size world sprite at arm's length); inside
  4m a tag now holds its on-screen size.

## Law 10 — proximity chat
- [x] **FIXED** The walkie reaches its own level only.
- [x] **DONE (2026-10-10)** Stale peers are dropped (law 9), so no voice is left
  pinned to where somebody last stood.
- [x] **DONE (2026-10-10)** `test_proximity.mjs` (36): who gets a voice token,
  one room per level on all four, the dead keeping the level's room, the
  walkie's reach, and the mix itself — pulled out of voicechat.ts into the
  pure `voicemix.ts` so the harness drives the same code the game runs.
- [x] **DONE (2026-10-11)** Heard against a REAL SFU: `livekit_ghost.mjs`
  runs a private LiveKit (`livekit/livekit-server.exe`) and joins the rooms
  from a headless Chromium with a fake mic — the living hear each other, the
  dead hear the one they watch. (Josh can't walk a live call yet: "just ship
  it if you cannot test it yourself".)

## Law 11 — difficulty
- [x] **EVALUATED (2026-10-10), analytically** — production has no evidence yet:
  no door opened, no relic unlocked, and its only two Backrooms deaths are
  Josh's Station playtests (a shock and a frozen run timing out). Shortest
  walking route through each level's way on, at walk speed, knowing where
  everything is: Level 0 423 steps (3.4 min) · Poolrooms 564 (4.6) · Pipe
  Dreams 960 (7.8) · Station 854 (6.9). Creature speeds against a 2.05 walk /
  2.85 sprint (sprint lasts ~11s, then ~4s winded): Entity chase 2.375 · Shy
  Guy 5.7 on dry land · Grabber 2.4 · Bleeder 4.3 · Stalker 5.7 (blackouts only).
- [x] **DONE (2026-10-10), Josh: "that's fine what you recommend"** — TEN
  fuses, any three fill the box; the best route fell 960 → 566 steps (7.8 →
  4.6 min), typical 825. Was: Pipe Dreams had 3 fuses for 3 slots. On Sep 26 Josh
  asked for ten spread across the map, any three filling the panel, "just to
  make it not that hard" (BACKROOMS.md → Fuses); the build followed his later
  "find 3 fuses for fuse box". It is also the longest route of the four.
- [x] **KEPT AS IS (2026-10-10), Josh: "that's fine"** — The Grabber against a SOLO runner: a visit every 3–8
  min, silent past 8 cells, faster than a walk; caught alone is death (your own
  torch is too late in its arms). A solo Pipe Dreams run meets it several
  times, and without sound it is effectively unwinnable.
- [ ] **WATCH** Level 0's Entity escape margin is thin (sprint-and-recover
  averages ~2.63 against its 2.375), and the Station is the hardest moment to
  moment (sections go dark on their own; the Bleeder outruns a sprint; a held
  beam is the answer). Neither flagged as too hard; read the Deaths overlay
  once people play.

## Law 12 — spectating the dead
- [x] **FIXED** Built: the registry and its clock (retarget, 15s budget held
  only while the key is, refill every 5 min), the wire (spectate / spec-cycle /
  spec-cam / ghost-ptt / ghost), the orbit camera, Q/E, the HUD, the ghost voice
  path (from the camera's side, thinned, ringing, pitched up) and co-spectators
  heard plainly. `test_spectate.mjs` (27). Walked in a browser: the watch, the
  HUD, the orbit.
- [x] **DONE (2026-10-11) — THE GHOST'S VOICE, SERVER-ENFORCED** (Josh:
  "whatever you recommend. just make sure it works"). The dead keep a
  LISTEN-ONLY seat in the level room; the wire switches their right to publish
  on through LiveKit's server API only for a granted talk and off at release,
  run-out or a new target (`src/backrooms/ghostvoice.ts`), so an edited client
  gets nowhere past the 15 seconds — LiveKit itself refuses the track. A ghost's
  client lets only the one it watches subscribe. The dead talk FREELY in their
  own room per level (`backrooms_<sector>_ghosts`, spectators only), each
  hearing those watching the same player — which the old design never allowed
  without spending the budget. Proven in `livekit_ghost.mjs` (37, not in the
  suite: it needs the LiveKit binary and Chromium): the death taking the mic
  down, a cheating client refused by the SFU, the grant, only the target
  hearing it, the run-out and release taking the right back, a key tapped
  faster than the grant leaving nothing open, the refill, the dead's room.
  Production reaches its SFU at 127.0.0.1:7880 when LIVEKIT_URL is our Caddy
  /livekit front (LIVEKIT_API_URL overrides).
- [x] **CLOSED (2026-10-11)** A dead client reconnecting to the level room with
  the token it was given while alive: every few seconds (`BACKROOMS_GHOST_RECHECK_MS`,
  4s) the right to publish is re-revoked from every spectator not in a
  granted talk, so a cheat gets seconds of voice. Proven in livekit_ghost.
