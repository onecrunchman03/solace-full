# Glenridge Hall: the review

Four reviewers who did not write the code graded the work against `GLENRIDGE-RUBRIC.md` on Nov 13 2026, at commit
`de7b346`. Each was read-only. Their sheets are below as they gave them, then what was fixed after each, and what
was left for Josh.

## Reviewer D: the show page, Walk the map as a page, the record

Ran `svelte-check` (0 errors, 0 warnings) and Node probes of `overlay.ts` and the site files. No browser.

| Line | Score | Why |
|---|---|---|
| F1 map switch, and back | 2 | The rebuild is sound; sound did not survive it (D1), and two walk faults rode it (D2, D4). |
| F2 objectives, banners, end cards, minimap | 3 | Rows, banners, end cards right. Minimap scale (D11), death-line copy (D9), "Key L1" chip (D10). |
| F3 cast cards | 3 | All nine house tasks have a word. `run` read "running for the house" on any map (D8). |
| F4 Control Room and Live Picture | 2 | Plan and names follow the map. Setup choices from the wrong map (D5), no "escaped" (D6), bunker words (D7). |
| G1 start a walk (page) | 3 | Button on the start card, admin only. No loading or failure state (D12). |
| G2 controls (page) | 2 | Keys right and inside the server's limits. Dead camera after a rebuild (D2), Shift+D (D3), panel overlap (D14). |
| G3 action list (page) | 3 | Ids unique. A click picked by index (D13). |
| J1 doc true today | 2 | 16 claims checked: 9 true, 6 stale, 1 missing. |
| J2 credits | 4 | Both CC BY assets credited in `ASSETS.md` and on the public page. |

Defects D found:

- D1. Sound stayed off for good after a map switch (the new scene's sound engine was never started).
- D2. After a rebuild WASD steered by the first scene's dead camera (the normal first walk on a map other than the
  remembered one).
- D3. Shift+D (sprint right) toggled the diagnostics box on every key repeat.
- D4. The first `walk` frame threw inside `pickFollow` (actors not built yet).
- D5. The start card's Run setup choices belonged to the last run's map, not the picked one; the radio part and
  code selects were drawn on a map that has neither.
- D6. The mansion's good ending ("escaped") printed nothing in Live Picture and Run History.
- D7. Bunker words on a mansion run in the Control Room and Live Picture (jump list, "in the bunker", "the tunnel",
  no lines for the mansion's events, raw job ids, rooms with the same name).
- D8. `HOUSE_JOB` was not scoped to the house: a survivor fleeing on the bunker read "running for the house".
- D9. In-memoriam lines mangled room names ("in the mrs. glenn's sitting room").
- D10. The butler's key showed as "Key L1".
- D11. The house minimap was drawn at about 60% of the bunker's scale (the garage stretched the frame).
- D12. The walk view had no loading or failure state.
- D13. An action click picked by index, not id; a note had no lifetime.
- D14. The walk panel was placed in px over the cast strip at 1440 tall.
- D15. Smaller: "Leave" ends the run without saying so; no words for `bad_who`; the default survivor listed twice;
  a zero stick dropped while paused; Shift+1-9 dead while sprinting; stale comment in `walk.ts`.
- Doc: stale lamp counts, stale "synthesized rain" and "walk through the sill" lines, the Nov 12 "Still to do"
  list, "everything else is CC0", dates a day ahead, no word on the page half of the walk or on upload.

## Reviewer B: sounds

Ran ffmpeg/ffprobe over the sound set, a script over the manifest and cue tables, and the real `engine.ts` against
a mock audio context. No browser. 16 of 24.

| Line | Score | Why |
|---|---|---|
| A1 footsteps by room, both paces | 2 | Six surfaces, every walkable cell resolves to a room. 31 of 77 rooms played a floor the build does not draw (the Great Hall is oak, stone was heard). Lino and concrete files held several steps each. |
| A2 the storm | 3 | Beds switch by room, thunder once per stroke, muffled indoors. The synthesized storm played with show sound off and doubled during preload; rain no louder outdoors; far thunder as loud as near. |
| A3 the house's own actions | 2 | Doors, bolt, crest, stone, car, boarding reach a sound. Hearth loops were mixed once and never again; boards knocked off played steel-door pounding; hammering silent; bolt sounded mid-swing; fuelling and getting in the car silent. |
| A4 nothing from the bunker | 2 | The three named leaks are closed. Four steel or facility recordings still played on house events (`door-forced`, `zombie-bang-door`, `zombie-claw`, `power-off`/`power-on`). |
| A5 every named sound exists; missing fails quietly | 4 | Every id in the manifest with every file on disk; missing ids, surfaces, events and failed fetches throw nothing. |
| J3 marked as awaiting Josh's ear | 3 | Marked in four places and on the page. The page played only take 00 of each loop and had no walk/run/sneak buttons for the house steps. |

Defects B found:

- B1. Hearth fire loops were mixed for where the ear was when sound started and never again (both fires 14 dB down
  and muffled for the whole show on the stream page).
- B2. The floor heard was not the floor drawn in 31 of 77 rooms.
- B3. Boards knocked off, the dead at an oak door, and the lights going out played the bunker's steel and
  machinery recordings.
- B4. Lino and concrete step files held runs of steps; two carpet files held two steps.
- B5. The synthesized storm ignored "Turn sound on" and doubled with the recording during preload.
- B6. Boarding was silent while worked; fuelling and getting in the car had no sound; `car.away` had no position.
- B7. The door thud and the bolt sounded before the leaf was shut.
- B8. `scripts/survivorz/test-audio.mjs` was red (no cue for `window.boarded`) and held nothing about the house.
- B9. Rain no louder outdoors than in; far thunder as loud as near; the basement heard rain at full level.
- B10. Smaller cuts and timing: `crest-set` clicks late in three takes, `house-creak` cut on fixed windows, the two
  fire files 4 LU apart, the vault's steel leaf silent.
- B11. Preview page: loops played one take only; house steps had no pace buttons.

## Reviewer C: effects, lighting, doors, leaving the page, weight

Decoded the packed zone files with three's own decoder and tested every door leaf against the real zone triangles
with scripts. No browser: every lighting line still wants the eye.

| Line | Score | Why |
|---|---|---|
| B1 hearths | 3 | Two fires found, three crossed noise sheets each, flicker. The flame material took three's two-pass path (C4). |
| B2 rain / lightning | 2 | Rain fell inside for about a second after a cut indoors and inside rooms seen from outdoors. Lightning lifted every unbaked thing in the house, the basement included. |
| B3 boards | 2 | Go up, and a late joiner gets them. They never came off on live events (C2). |
| B4 stone / crests / car | 2 | Stone right. Crests shown by count, not by which. The car drove out sideways (C3). |
| B5 nothing after load | 2 | Light count fixed. The flame material and two transmissive glass materials were rebuilt every frame (C4). |
| C1 lit rooms match the bake | 2 | The fill gives every unbaked surface about four times the median baked wall. Three rooms have no lamp. |
| C2 grounds / lit windows | 3 | Grounds readable, interiors seen through real glass. One global fill for indoors and out. |
| C3 lights out | 2 | Bake and glow go down and come back. The fires' light did not reach people (C6). |
| C4 flashlights on walls | 3 | The maths checks against three's source. Wants the eye for a 4. |
| C5 unbaked things | 2 | Three outside-zone brick chimney stacks stand inside rooms; shell metals not clamped. |
| D1 right leaf, fits | 2 | 59 of 59 hung, 52 fit within 14 mm. Seven do not. |
| D2 swings onto clear floor | 2 | `swingOf` scored every option alike on 58 of 59 doors; 3 cut geometry. |
| D3 server's state | 3 | Open, shut, broken, planks follow the wire. Bolted and locked look like shut. |
| D4 survivors use doors | 2 | A clock stands in the dining-room doorway and brick stacks in two others. |
| D5 the dead and doors | 2 | The sim refuses a bolted door and a boarded window. On screen the window stayed boarded. |
| H4 leave / re-enter | 3 | Dispose order sound. Two small leaks. |
| I1 60 fps | 3 | Not measurable without a browser. The 11.7 M triangles is the scene drawn twice (5.85 M a pass). |
| I2 weight written down | 3 | Written, with a lever. Basement size stale; GPU and download totals missing. |

Defects C found:

- C1. Three brick chimney stacks of the outside zone run through the house floor to roof (kitchen/vault,
  servants' sitting room/scullery, guest suite/west porch), inside two door frames; they take the night light,
  ignore the blackout and flash on lightning.
- C2. Boards never came off a window on live events (the event played a rattle, not a break).
- C3. The car is packed nose north and was driven as if nose east; the heading snapped between legs.
- C4. Three glass materials reach three as transmissive, so the whole scene was drawn twice a frame; the flame
  material was rebuilt twice a frame.
- C5. One fill for everything unbaked, and lightning multiplied it everywhere, the windowless basement too.
- C6. The fires did not light the people by them (the lamp is aimed down from ankle height, and is filed under
  the inglenook only); lamps within 1.8 m of a fire were wrongly made fire lights.
- C7. Rain inside rooms for a second after a cut, and inside rooms seen from outdoors.
- C8. Five lamps in Stefan's bedroom filed under the arcade and solarium; Stefan's bedroom, garage and scullery
  have none; outside lamps marked battery went out with the house.
- C9. A door hit shook the leaf about the world origin (up to 7.7 cm on the garage pair).
- C10. Every open leaf sank about 2 cm into its hinge jamb.
- C11. Crests shown by count, not by which crest was set.
- C12. Shell metals (lead, steel, iron) drew at about a tenth of the bake.
- C13, C14. Small per-frame waste; module-level materials keep a dead renderer's listeners.
- C15. 536 MB of lightmaps on the GPU; 441 MB of GLB and 114 MB of EXR to download; neither written down.
- Doors that do not fit: gallery to dining room (13 cm in the wall, a clock in the doorway), the garage pair
  (a 34 cm slot above), the vault and service doors (brick stacks), Mr. Glenn's bedroom to Stefan's (20 cm in the
  step), the nursery (no floor under the door), the three arch doors (heads pass through the transom). Swings that
  cut: the arcade door through a potted plant, the hidden-study door's tip in stone.

## Reviewer A: the sim, the walk's server half, safety

Ran 40 mansion shows on game code, save-and-resume from 11 saves, a real server for the walk lever, flood and
junk-frame probes, and every harness one at a time (all green first try).

| Line | Score | Why |
|---|---|---|
| E1 a whole show plays to an ending | 2 | 40 of 40 end and the story order holds (23 escaped, 11 wiped, 6 timeout). 5 of 40 time out with 3 to 6 alive and the story stalled (A1). |
| E2 a save resumes the same show | 4 | 11 saves loaded into a fresh world: frames and end state identical. |
| E3 the bunker unchanged | 3 | Harnesses green, hashes steady since stage 2. Not identical to before the mansion work (A9). |
| E4 nothing names what the map lacks | 2 | No Shelter 14, tunnel or radio anywhere. Keycard and armory words reach survivors when a key-holder dies (A5); they know the whole house at the gate (A6). |
| G1 start a walk (server) | 4 | Member 403, no token 401, bad input 400, both maps start, audited. |
| G2 the body goes where steered | 4 | Four gaits measured, 4,000 steps never off the grid, 32 pushes into shut doors, none through. |
| G3 everything a survivor can do | 3 | Both maps walked to their endings by hand. Job kinds are whitelisted (A10). |
| G4 the dead can be fought | 4 | Killed by hand, bitten, pinned, put down, shot at 9 m. |
| G5 a walk is private | 2 | The normal path holds. Four leaks (A2, A3, A4). |
| H1 inputs validated and limited | 3 | Junk moves nothing, a flood costs nothing. A stick let go while paused was dropped (A7). |
| H2 no secrets | 4 | Grep over all 92 changed files: none. |
| H3 harnesses green | 4 | All of them, one at a time. None catches A1. |

Defects A found:

- A1. Shows stall: the dead bang for good on locked outside doors they can never break, and survivors a wall away
  are held backing off from them.
- A2. A walk whose save can't be read at boot came back as a numbered real show that the stream rig receives.
- A3. Stopping a walk turned off a stream switched on by hand.
- A4. A walk cleared the ON AIR switch and rewrote the map the next real show reads.
- A5. "take the keycard off the body", "I found the armory keycard", "You just found a keycard, level 1" on the
  mansion.
- A6. Strangers at the gate know all 75 rooms and what is in them (the bunker's "lived here for weeks" rule).
- A7. A stick let go while paused was dropped.
- A8. A bolted front door opens from outside for any living actor.
- A9. The claim "byte-identical to before the mansion work" is wrong: stage 2's route change altered every bunker
  show (endings within noise over 100 shows).
- A10, A11. The walk's job kinds are a whitelist; the end-to-end harness walks with no dead; small input coercions.

## The grade

Where two reviewers graded one line (G1 to G3: the server and the page), the lower score stands.

| Section | Lines | Score |
|---|---|---|
| A. Sounds | 5 | 13 / 20 |
| B. Effects | 5 | 11 / 20 |
| C. Lighting | 5 | 12 / 20 |
| D. Doors | 5 | 11 / 20 |
| E. The game on the map | 4 | 11 / 16 |
| F. The show page | 4 | 10 / 16 |
| G. Walk the map | 5 | 14 / 20 |
| H. Safety | 4 | 14 / 16 |
| I. Weight | 2 | 6 / 8 |
| J. The record | 3 | 9 / 12 |
| **Total** | **42** | **111 / 168 (66%)** |

That is the grade of the work as it stood at `de7b346`, before the fixes below.

## What was fixed after the review

Each line names the defect it answers. Checked by harness where one could hold it; the rest by script.

**Sounds**
- B1. A loop is mixed again as the ear moves, 12 times a second (`audio/engine.ts loop`).
- B2. Each room's footstep surface is the floor the build laid (`scripts/survivorz/glenridge/floors.py` writes
  `surface` into the site file; `audio/rules.ts` reads it; the id rules now decide only how a room rings).
  `test-audio.mjs` holds every room to its floor.
- B3, C2. A window's events keep their own sounds (`window.boarded/banged/broken` in `cues.ts`) and are drawn as
  the door events the effects know; boards knocked off are a hit down to no planks, so they break and fall. The
  dead beat on oak (`door-wood-pound`, a new take) in a house; a pushed door is an oak door; the lights go out
  with the switch alone.
- B5. The storm's stand-in noise is silent until the show's sound is on, and never plays over the recording.
- B6. Hammering is heard while a window is boarded (one blow every second and a half); fuelling has a sound;
  `car.away` says where the car is.
- B7. The door's thud waits for the leaf (280 ms) and the bolt for the door to be shut (900 ms); a bolt on a door
  already shut makes no closing sound.
- B8. `test-audio.mjs` is green (65) and holds twelve rules about the house.
- B9. The rain is full out of doors, well down under a roof and a murmur in the cellars (`bedLevel`); far thunder
  is well under near thunder, and halved again below ground.
- B4 in part: carpet steps are cut one to a file. B11: the preview page loops each take of a loop and has
  walk, run and sneak for the house's steps.

**Effects, lighting, doors**
- C3. The car backs out, swings round to face west and pulls away down the drive and out of the gate, nose
  first, with no snap between legs (`doors.ts carPath`; `scripts/survivorz/glenridge/test-car.mjs` walks its four
  corners against the walk map).
- C4. Glass that asked for transmission is plain glass (the scene was being drawn twice a frame); the flame
  material is single-pass.
- C5. Lightning lifts the bodies and furniture fully only out of doors, a little in rooms above ground, not at
  all in the cellars.
- C6. A fire's light is aimed up and out from the hearth and reaches whoever is within 9 m of it, whichever room
  the hearth is filed under; only a lamp in the fire itself counts as the fire.
- C7. Rain stops at once on a cut indoors.
- C8. Lamps in Stefan's bedroom, the garage and the scullery are filed under their own rooms (the layout file,
  and `build.py` for the next build).
- C9, C10. A struck door shakes about its own middle; a leaf opens to 86 degrees and no longer sinks into its jamb.
- C11. The crest that was set is the one shown (`Goals.props` carries each by name).
- C12. The shell's lead, steel and iron are held to the same metal limit as everything else.
- D2. A door's swing is chosen on real open floor from the walk map (`site.ts walkableAt`), sampled along the
  leaf open and half way round, and never up into a room whose floor is a step higher.
- C1, D4. In the build: the wings' chimney stacks start at the eaves (they stood as brick columns in the rooms
  and in two doorways), and the grandfather clock is off the dining-room doorway.

**The show page and the walk**
- D1. Sound that was on stays on across a map switch or a retry.
- D2, D3, D4. The walk's keys steer by the camera that is drawing now; Shift+D does nothing while walking; the
  first walk frame no longer throws.
- D5. The start card offers the picked map's rooms and hiding places, and hides the radio part and code on a map
  that has neither.
- D6, D7. "Escaped" in Live Picture and Run History; the mansion's events have lines; jobs read in words; the
  jump list, the breach and the tunnel are named only on the bunker; rooms with one name are told apart.
- D8, D9, D10. A house's job words are the house's alone; death lines read "in the Great Hall" and "in Mrs.
  Glenn's Sitting Room"; the key chip reads "Butler's key".
- D11. The minimap is framed on the house, not stretched to the garage.
- D12, D13, D14, D15. The walk view has loading and failure states; a click does the row it was on; a note stays
  three seconds; the panel sits clear of the cast strip at any height; "End the walk" says what it does; Shift+1
  to 9 pick while sprinting.

**The sim and the server**
- A1. A door the dead can't pass is a wall to them: they no longer spend the show beating on locked garden doors.
  Timeouts fell from 6 in 40 shows to 2 (endings over 40 shows: 21 escaped, 17 wiped, 2 out of time). The
  bunker's frame hashes are unchanged.
- A2. A test run or walk that can't be resumed at boot is stopped, never replaced by a numbered show.
- A3, A4. Stopping a walk leaves a stream alone; a walk gives back the map setting and the ON AIR switch.
- A5. The butler's key is "the butler's key" on a body, in a note and in the moment it is found.
- A7. A stick let go, or a stop, while paused is honoured.
- A9. The doc says what is true: the bunker's hashes are steady since stage 2.
- `test_survivorz_walk.mjs` gained six asserts for A2, A4, A7 and the setup's per-map choices.

## Left for Josh

See "What is still open" at the end of `GLENRIDGE.md`. The ones that are his call: the sounds (unheard), the fill
light on unbaked furniture, survivors knowing the whole house at the gate, the wipe rate (17 of 40 on game code
alone), and the map's weight.

## The re-grade, after the fixes

A fifth reviewer checked every claimed fix at `28a54b3` and scored the 42 lines again: **129 / 168 (77%)**, up from
111. No browser, so every line that wants the eye or the ear is capped at 3.

| Section | Before | After |
|---|---|---|
| A. Sounds | 13 | 16 / 20 |
| B. Effects | 11 | 15 / 20 |
| C. Lighting | 12 | 14 / 20 |
| D. Doors | 11 | 14 / 20 |
| E. The game on the map | 11 | 14 / 16 |
| F. The show page | 10 | 13 / 16 |
| G. Walk the map | 14 | 15 / 20 |
| H. Safety | 14 | 12 / 16 |
| I. Weight | 6 | 6 / 8 |
| J. The record | 9 | 10 / 12 |

Lines still at 2: C1 (the fill on unbaked furniture), D1 (four doors that don't fit), G2 and H3 (below).

What the re-grade found, and what was done about it:

- **A regression: the service stair could not be climbed in a walk** (the walk harness was red at `28a54b3`,
  130 of 132; it had last been run before the map was regenerated). The cause was in the walk itself: a push that
  changed direction at a stair's foot dropped the walk to the stair but left the stair "locked" as the one just
  taken, so the body was kept off it until it walked away. The stick turns with the camera, so this would have
  bitten in real use. `player.ts dropJob` now clears the lock when the walk to a stair is given up. Walk harness
  132 of 132.
- `car.in` had no sound: a car door take (`car-door`, unheard) and its cue; the event is in the harness's list.
- A zero stick or a stop while paused is counted against the rate limit like any other frame; a run that is not a
  walk clears anything a walk left to "give back".
- Death lines for the grounds read "in the gate", "in the forecourt" (a place named with its own "The").
- The doc's endings (21 escaped, 17 wiped, 2 out of time) and per-zone sizes are the measured ones.

With those, G2 and H3 are answered; nobody has re-scored them.

## After the re-grade (the same day, at Josh's word: "just pick the sounds for me and continue working")

- **The sounds were picked by measurement** (`sound-picks.mjs`; every decision in `glenridge-sound-picks.txt`):
  timing against the animation, one landing or creak a file, no held pitch, loops that hold level, far thunder
  with no crack. Five takes dropped, three soft thunders refiled as far, crest clicks cut to land as the crest
  appears.
- **Every door hangs in the opening as built** (`door-fit.mjs` measures the jambs, head and floor of all 59 off the
  packed zone files; 42 differed from the plan). That answers the dining-room leaf in the wall, the slot over the
  garage pair and the leaf with its foot in Stefan's step.
- **The arched doors clear a head**: their arches are four-centred and low now (the front door's transom went
  from 1.71 m to 2.10 m), and every doorway has a threshold (the nursery's stood over a slot).
- **A bolted outside door shows its bar.**
- **Rain is not drawn under a roof** (a mask of the house from above, read by the rain's shader).
- **The follow camera stays in a room that is not its box** (the angled wings: it went out through the wall or
  into the dark); it goes round the body along a narrow corridor before it closes in.
- All four zones rebuilt, re-baked and uploaded. Measured in a walk: 5.4 M triangles, 328 draws, 60 frames a second.
