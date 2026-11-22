# THE CHARACTER CREATOR — what we agreed (Josh, 2026-11-03)

Josh: *"a fully robust and highly customizable character creator. 1. I can drop
in rigged 3d models for processing 2. automatic animation rigging from the
available animations we have 3. a clean and very easy to use UI."* Settled
over fifty prompt questions the same day. This file is the design authority
for the creator; the cast-file rules in `src/survivorz/cast/rules.ts` still
hold.

## The shape

- **Survivors only.** Zombies stay a separate job.
- **The form lives in the Admin Panel** (Characters), admin only, desktop only
  (a phone sees the list read-only).
- **The heavy work runs on Josh's PC** (the 3090 Ti), with the LLM paused while
  it runs: a small worker that picks up jobs from the server, does them, and
  sends the results back. It is owned by Task Scheduler, not by a Claude
  session (sessions die with the app).
- **Finished = one button.** The body files go to the server and the character
  waits on the bench. Nothing needs Claude. A character joins the show only
  when Josh presses **Bring in**, as today.
- **The six existing survivors are brought into the creator**, so they can be
  edited and re-baked there.
- **Build order:** the drop-in and auto-animation pipeline first, then the new
  UI on top of it.

## Dropping in a model

- **FBX and GLB/glTF**, mostly from **Mixamo and Sketchfab/stores**.
- **Rigged models only** for now; an unrigged one is refused with a clear
  message.
- **Drag onto the page, or drop into a watched folder**; both work.
- **Automatic fixes:** shrunk to the budget the six survivors use (triangles
  and textures), real height in metres, facing forward, feet on the floor —
  with the numbers shown.
- **A failed check warns**; only what would break the show is refused.
- **Licence and credit are kept**, and a model without one is flagged.
- **One model may carry several outfits/texture sets**; each character picks one.
- **Adult human proportions only.**

## Animation

- **Every clip we own plays on the new body with no hand work.** The core set
  (walk, run, idle, combat, death) converts first; the rest fills in behind it.
- **Playable within an hour** of the drop.
- **Every clip is checked**: measured checks (limbs through the body, feet,
  floor) plus contact sheets to glance at. The animation laws hold. A clip
  that fails tries to fix itself (hand pinning, ground fix) before it is
  flagged.
- **Paired moves** (grab, bite, struggle, pulling off) are fitted to each new
  body automatically and flagged for Josh's review.
- **Hands** grip guns and tools from the gun pack's grip poses, fitted per body.
- **Faces:** jaw lip sync from the voice, nothing more.
- **New animations downloaded later reach every character automatically.**
- **A few sliders for each character's own way of moving** (posture, stride,
  energy) on top of the shared clips.

## The look

- **Tint sliders** for skin, hair and eyes.
- **Clothing is baked into the model** (and its outfit sets).
- **Accessories** (glasses, hats, backpacks, holsters) attach to bones, fitted
  per body.
- **Height and build sliders**, held inside what the animations survive.
- **A grime slider** previews dirt, blood and wounds from clean to filthy.
- **The turned version is made automatically** from their own body and can be
  previewed.
- **Preview:** a turntable under three bunker lighting presets.
- **Held items are test-fitted** in the creator, with clipping flagged.
- **Portraits** for the cast card, the memoriam card and the YouTube page are
  rendered automatically, with a re-render button. **A 10-second reel**
  (walking, fighting, talking) renders on demand.

## The mind

- **Every field the creator has today stays**: sheet, stats, genes, kit,
  skills, regard, voice — same rules.
- **The sheet:** the AI drafts it from a few notes; Josh edits.
- **The voice is designed on ElevenLabs inside the tool**, and Josh previews
  it before anything is kept. The chosen clip becomes the reference the local
  cloned voice uses (the way the six were made).
- **Archetype presets** (medic, soldier, coward, leader…) fill stats, genes and
  kit to start from.
- **A warning when a new character is too like an existing one**, in looks
  (body, colours) or personality (genes, stats, voice).
- **A 10-minute dry run in the simulator** before they go in, showing how they
  behaved and what they said.

## The UI

- **A wizard for a new character** (Body → Look → Mind → Voice → Review);
  **tabs to edit** an existing one.
- **The live 3D preview is always on the left half** of the screen.
- **Undo/redo and autosaved drafts.**
- **A "what's left" checklist with progress**: body baked · clips · voice ·
  portrait · dry run · ready.
- **Show-branded look**: the Survivorz style, not the Admin Panel's cards.

## What's built — stage 1, the body pipeline (2026-11-03)

- **Drop → queue.** Admin Panel → Characters → Bodies: drag in an FBX, GLB or a zip
  with its textures (250 MB), give it an id, height, licence and credit. Kept on the
  server (`uploads/survivorz-models`), queued in `survivorz_bodies` (migration 118,
  `src/routes/survivorz-bodies.ts`). The card shows every step live.
- **The worker** (`scripts/survivorz/creator/worker.mjs`, installed on the PC by
  `deploy/workstation/creator-worker.ps1 -Install -Token …`, owned by Task Scheduler)
  claims a body, pauses the LLM, bakes, sends `game/<id>.glb` and its gun seat back,
  resumes the LLM. Its token is `SURVIVORZ_WORKER_TOKEN`, separate from the stream
  token because it writes files. A body removed in the panel is forgotten on the PC
  too (only bodies that came from that server). **IT BAKES WHAT'S ON MASTER** (Nov 8 2026):
  the worker runs from the main checkout (`C:Usersjoshcodesolace`), which nothing else
  updates — work pushed from a worktree sat ten commits away from the bake. Before each bake it
  fast-forwards that checkout to origin/master (master only, fast-forward only, no password
  prompt; a refusal is logged and it bakes what's there). New clips need no code: the clip list
  reads the whole Mixamo shelf (`src/mixamo/`), and the speeds step measures every loop in
  `loop-speeds.mjs` JOBS — a new locomotion loop goes there too. Bodies baked before a change
  don't change by themselves: repack them (or re-queue the body) and copy the files up.
- **The bake** (`scripts/survivorz/creator/bake.mjs`), in order: intake → clip list →
  retarget (326 clips, ~3 min) → pack → natural baseline → clean + repack → gun seat →
  built moves (five groups side by side, ~23 min) → repack → the limb-in-body law
  (re-bake what fails) → feet on the floor → final checks (the show's clips all inside
  the line) → **its walking and running speeds** (`scripts/survivorz/loop-speeds.mjs`, Nov 2026: each locomotion
  loop driven down a straight line headless, the speed that leaves the planted foot stillest — the show plays
  the loop at that rate, so the feet don't skate; sent to the server as `loopspeed.json` on the creator's shelf
  and read by the show beside the hand-made bodies' `client/src/survivorz/show/loopspeed.json`, which always
  wins) → **what it carries** (the "kit" step, Nov 12 2026: `kit-fit.mjs` then `kit-stow.mjs` with
  `--only <id> --out creator/<id>/kitfit.json`, headless, about two minutes — where each backpack rides its back and
  where a holstered pistol, a belt tool and a slung rifle sit, each moved off the body until nothing passes through
  it; sent to the server as `kitfit.json` on the creator's shelf and read by the show beside the page's own
  `client/src/survivorz/show/kit-fit.json`, which wins for a body it already fits). **About 40 minutes** on the
  3090 Ti box.
- **What the bake carries from the realism rounds, and why nothing else needs adding.** Everything else the show
  does to a body at run time — feet held where they land, legs that step the way the body goes, the spine turned
  to the facing, bodies kept apart, the camera's rules — reads bones by the show's names, and the intake renames
  every rig to them (`joints.json` "required": spine_01-03, neck, ball_l/r, the leg chain). So a baked body gets
  all of it for nothing; only what is measured per body (its loop speeds, its pack and holster fits) has to be baked. **A new realism
  rule that needs a per-body number must add a bake step the same way.**
- **The intake** (`scripts/survivorz/creator/intake.py`, Blender 5.2 headless) renames
  any Mixamo, Unreal 4/5 or Renderpeople rig to the show's bone names
  (`creator/joints.json`), scales to metres, turns it to face forward, re-poses a T-pose
  to the show's A-pose rest, puts the feet on the floor, cuts it to 45,000 triangles
  and 2048 px textures, and refuses only a rig missing core bones.
- **One body list** (`scripts/survivorz/bodies.cjs`): the seven made by hand plus every
  creator body. `manifest.mjs`, `anim-build.cjs`, `anim-law-show.mjs` and
  `anim-natural.cjs` read it.
- **Proven:** a fake Mixamo rig (centimetres, turned 90°, T-posed) baked end to end:
  every solo clip Eric has, 0 of the show's 135 clips past the no-clipping line.
  Harnesses `test_creator_bodies.mjs` (48) and `test_creator_intake.mjs` (20).

**Still to build:** the paired moves (hugs with each survivor, zombie bites and
finishers both ways — every partner body re-baked and `pairs.json` regenerated), the
backpack fit (`kit-fit.json`), portraits and the reel, the look sliders, the wizard UI,
(the cast read from the database: built 2026-11-04). Until the pairs
are built, a new body plays every solo move but no grab, bite or hug.

## What's built — stage 2, the second round (2026-11-03)

Josh's six asks and the twenty answers that followed them.

- **Pause a bake.** ⏸ on the body's card (`/api/admin/survivorz/bodies/:id/pause`,
  migration 120 `paused` + `resumeFrom`). The worker stops at once (the whole process
  tree), gives the GPU back to the LLM, and ▶ Resume carries on from the step it stopped
  in. A game on the PC (games.txt, plus aces and StarCitizen) pauses it the same way
  and it carries on by itself when the game closes. Queued bodies start whenever the
  GPU is free.
- **Time left.** Every step not done carries what it should take, learned from the
  PC's finished bakes (`creator/timings.json`, a moving average). The retarget and the
  built moves also report how far along they are. The card reads "about 40 min left ·
  done around 1:49 PM".
- **The creator in its own window.** "⧉ Pop out" opens it at `/#creator` (a native
  window in the desktop app, a browser window otherwise). The layout is a list, then
  tabs (Who · Body & kit · Mind · Relations · Voice · Sheet), then a live preview
  (`BodyPreview.svelte`: the baked body turning under Mains / Emergency / Torch light).
  The list has search, filters and bulk edit (add/remove a perk, the world, the kit).
  Drafts autosave to the browser and Ctrl+S saves. Bodies get their own top tab.
- **Relations for a big cast.** A searchable list with a slider each way, side by
  side. Anyone not set is a stranger. Built for 100+ characters.
- **Perks replace traits.** Up to two each (`PERKS` in `cast/rules.ts`): Medic, Sealed
  suit, Mechanic (repairs ×1.5, cranks ×1.3), Marksman (spread ×0.75, hits ×1.2),
  Scavenger (searches in 55% of the time), Tough (hunger, thirst and infection at
  ×0.75 / ×0.8). Old files' `traits` read as perks. Spawn order and strip order are
  gone from the form and set automatically.
- **Voices.** A library on the server (`<data>/survivorz-creator/voices`,
  `src/routes/survivorz-voices.ts`): upload a clip, design one with ElevenLabs (three
  takes; needs `ELEVENLABS_API_KEY` on the server), or use a stock Kokoro voice as the
  fallback. ▶ Sample has slopbot's clone say a line in character. **Two characters may
  never share a voice** (a check that refuses to save). Slopbot fetches a reference it
  doesn't have from the library (`agent.py fetch_voice`) and uploads the ones the
  library lacks. **How many voices:** any number stored. The limit is how many speak at
  the same moment, two at a time on slopbot.
- **The lineup** lives in the Survivorz panel's Show tab (docs/survivorz/CONTROL-ROOM.md,
  stage 3): who starts, the bench and its order, the largest group, saved presets.
- **Several models in one drop** (or one pick): each goes up in turn under the id its
  file name gives it (`soldier blue.fbx` → `soldier-blue`), and anything refused is listed.
- **The bake queue** (Nov 4, migration 121 `queueOrder`): the PC bakes one body at a time — each
  bake already fills the GPU, so two side by side finish no sooner — and takes the next the moment one
  is done. The Bodies tab shows the line with when each should start and when the whole queue is done,
  and ↑ ↓ / ⤒ Next reorder it (`POST /api/admin/survivorz/bodies/queue {ids}`). A paused body keeps its
  place and is skipped until resumed; a drop or a "Bake again" joins the back.
- **Not baked yet**: every body a character wears that isn't on a shelf, with who wears it and where
  it stands (no model yet · in line · baking · paused · stopped). One with no model gets **Add model**,
  which sends the file under that body's id whatever the file is called.
- Harnesses `test_creator_bodies.mjs` (81), `test_creator_voices.mjs` (31),
  `test_survivorz_cast.mjs` (71).

## The twelve from the Desktop folder (2026-11-03)
Josh's "survivor characters" folder, written by Claude as **drafts** for the bunker
(strangers on day one, melee and a little food and water, no clone voice yet). Each one's
`body` is the id the drop box gives the file, so the bodies attach as they bake:
alex · chad · david · leonard · lewis · doug (`paladin`) · pete · brooks
(`soldier-blue`) · hale (`soldier-gas-mask`) · suzie · renner (`swat-soldier`, already
queued) · hank (`vanguard-soldier`, a bomb suit). Every line of each sheet is new and
waits on Josh's read; a draft becomes bench once its body is baked and its voice chosen.

## The cast is live, and what's left (2026-11-04)
Josh: "just do 1 thru 3" — bring in without Claude, a checklist per character, and grabs,
bites and rescues for new bodies.
- **The panel's list IS the cast.** The server lays the list over the repo's files at boot and
  after every save, delete and finished bake (`refreshCast`). A character set to bench or cast
  joins the show the moment their body is baked; no pull, no commit, no deploy. A list character
  whose body isn't baked yet, or who breaks a rule, is held back and the checklist says why; a
  show character keeps playing its file's version meanwhile. Deleting takes them out at once (a
  run already going keeps them to its end); Undo brings them back. Download list is a copy now.
- **What's left**, on every character (the side panel, and "3/5" on the list): Body baked ·
  Grabs, bites and rescues · Voice (in the library) · On the bench or cast · In the show. The
  list filters "In the show" and "Waiting on something".
- **Grabs, bites and rescues** for a creator body are baked after the solo bake (bake.mjs
  "pairs", about 25 minutes on the PC): every zombie's half of the two struggle chains and the
  two bites against the new body (`anim-build.cjs --zpair "" <body>` with ZONLY), the body's
  pull-off on every zombie (`--zvictim` with VONLY), the body repacked, the zombies' halves
  packed into small SKELETON-ONLY glbs (`pack-pairclips.mjs`, ~300 KB a zombie: no mesh, so
  the nineteen 20 MB zombies are never re-sent), and the lot judged by `pair-sweep.cjs` on
  anim-pair.html (`&aextra=` adds those clips the way the show does) — the sixth-deepest
  vertex under the line at 13 moments, a struggle offered only whole, a bite only if its
  survivor half doesn't clip into its own body AND neither head is in the other body (the
  heads are judged too since Nov 11 2026: each head's skin, hair left out, as a surface in its
  head bone's frame — the torso check stops at the neck, and a shoulder bite with the zombie's
  face in the survivor's jaw used to read clean). THE BITE FIT itself (anim-recipes.js
  zombieBite): the zombie's own lips (read off its face) on the bitten limb's skin on the side
  facing them, the head kept off every part of the survivor and the face off its torso, found
  by a search over the neck and back that starts from the last frame's answer and moves each
  joint at most 10 degrees a frame (solved afresh each frame, the head jumped and the frames
  between swung it through the survivor's shoving hand), the survivor's free hand and other arm
  kept right out of the head (only the bitten limb gets the teeth's 2 cm), and the zombie giving
  ground smoothly as it lets go — off its chest and its head. The worker sends each zombie's file and the
  table before the body (`/worker/:id/pairclip`, `/worker/:id/pairs`); the server keeps
  them on the creator's shelf (`pairs/<body>.json`, `pairclips/<body>/<zombie>.glb`) and
  serves the merged table at `asset/pairs/pairs.json` and each file at
  `asset/pairclip/<body>~<zombie>.glb`. The client lays the table into the bundled pairs.json
  (`addPairs`; the seven's rows never touched) and adds each zombie's halves to its clips by
  node name (actors.ts). A body baked before this gets **Bake grabs & bites** in Bodies (back
  in line from that step, the rest kept). Calibrated: the sweep reads Eric's shipped pairs at
  0 cm, and the file-loaded clips move a zombie exactly as bundled ones do. Hugs between
  survivors are still not built (the show doesn't play them yet).

## Skills and stats, with words (2026-11-04)

Josh: "lets add descriptions to skill. lets also add some more skills … what about more body stats too?"
— then "do all". Every stat, skill and trait now carries a line saying what it does, read from
`cast/rules.ts` (`STAT_INFO`, `SKILL_INFO`) and `genes.ts` (`GENE_MEANS`); change the sim, change
the line.

- **Three that did nothing now do something.** Creative was read by nothing; Thinking only capped
  skills; Science only mattered in the old Halcyon lab. Now Thinking scales the XP they earn (±8% a
  point from 5, never under half), Creative above 5 gives a first search a 6%-a-point chance to turn up
  one more thing of the kind that container holds (counted as made in the census), and Science takes
  5% a level off searching a note and adds 4% a level to what a med kit heals.
- **Three new skills, each at 0 for everyone who already exists** (so they play as before until
  edited): First aid (3% a level off bandages, med kits and revives; gets better by doing them),
  Stealth (5% a level off how far the dead spot them and hear their steps, unless already hunted;
  gets better creeping near the dead unseen), Mechanics (5% a level on the crank; gets better on it).
- **A skill belongs to a stat**: Electronics, Science and First aid to Thinking, Stealth to Nimble,
  Mechanics to Creative — each up to its stat + 3.
- **Endurance**, the fifth body stat: 6% a point from 5 off what tires them and onto getting their
  breath back. A file without it reads as 5, which is exactly the old show.
- Every factor is exactly 1 at a skill of 0 and endurance 5 (`SKILL_FX` in sim/tables.ts); a run
  saved before this loads (a missing skill reads 0). Over 24 seeds of the one-hour show: 2.13
  alive on average against 1.42 before, wipes 13 against 17 — within the dice, not harder.
- Found on the way: the "find supplies" pull didn't grow with need, so a survivor with no water could
  escort a friend for ten hours; it now adds 3 an hour past thirsty or hungry. The bunker has no sinks
  and with the AI off nobody shares, so test-sim's check 40 still fails on some seeds (master too: 8
  and 14; this build's default 15) — that one is the dice, not this change.

## Skills and genes, nothing else — the one-stop shop (2026-11-05)

Josh: *"I want the character creator to be the one stop shop for getting any new character created and ready to
go … the survivorz panel is the show management page and the character creator is the workshop … lets remove
perks and body stats just put them in a big list of skills. I only want skills and genes … generalized enough so
that they can be useful in any map we make."* Settled over thirty questions the same day.

- **Sixteen skills, 0–10, 0 = untrained** (`cast/rules.ts SKILL_INFO`), in four groups:
  · **Fighting** — Melee, Firearms.
  · **Body** — Agility, Escape, Strength, Endurance, Toughness, Stealth.
  · **Know-how** — First aid, Science, Electronics, Mechanics, Lockpicking, Scavenging.
  · **Mind & people** — Leadership, Quick learner.
  A file that leaves a skill out reads as its **base** (5 for the body and the mind, 0 for trained know-how).
  **Trained skills grow during a run by doing the thing** (`learns`); the body's don't. Tiredness and the
  infection's last stage dull only what needs a clear head (`dulls`).
- **A suggested total, a warning only**: `SKILL_BUDGET` 75. The converted cast runs 50–78 (Wes 91, Renner 78
  warn; both drafts).
- **Fifteen genes**: the ten, plus **Courage** (took over the bravery that rode on Combat), **Optimism**
  (being hurt frightens them less), **Humour** (talk), **Composure** (fear builds slower) and **Ruthlessness**
  (less likely to go back for someone). Every one is exactly the old show at 5.
- **The perks are gone into skills**: Medic → First aid 8+ (keeps the medicine, goes back for the fallen; 10
  is the old Medic speed), Marksman → Firearms, Mechanic → Mechanics + Electronics, Scavenger + Creative →
  Scavenging, Tough → Toughness 10. **A sealed suit is the BODY's**: a tick on the body in Bodies
  (`survivorz_bodies.suited`, migration 122; Rollo's hand-made hazmat is `HANDMADE_SUITED`).
- **Where a survivor starts, and what they're told about the place, is the MAP's** (`maps.ts ShowMap.world`).
  Found on the way: the bunker's minds were still being told they were in Halcyon Site 9.
- **The AI is told its skills in plain words** ("a crack shot; handy with electronics; useless in a fight"), never
  numbers, and **what it has SEEN the others do well** (knowledge `handy`, filled when someone does a trained
  thing at 6+ in sight).
- **Old characters convert by themselves** (`upgradeCharacter`: a browser draft, a saved list row — migration
  122 rewrites them — an exported list, a repo file), and **a run saved before this resumes** (the genes and
  skills it lacks fill in on load).
- **The Survivorz panel's Cast card** (`CastRoster.svelte`, `GET /api/admin/survivorz/roster`,
  `POST …/cast/:id/status`): every character with their best skills and what's left; **Cast / Bench / Off**
  in one click for a ready one; one still being made is greyed with what's left and a button to the creator.
- **Approved model sources: Mixamo, Sketchfab, Fab (Unreal).** Unrigged is refused with the Mixamo note; a model
  with no licence bakes but carries a "Licence noted" step until one is added.
- **The look**: the creator wears the show's colours (near-black, amber, mint, tracked capitals) whatever the
  theme, and lends them to the Bodies, Relations and Voice tabs inside it.
- Over 24 seeds of the one-hour show: **2.63 alive on average, 8 wipes, 6 rescues** (before: 2.13, 13, 6) — a
  little easier, mostly Rick's Leadership 9 and the Composure gene steadying the group.

### BUILDING A MAP AGAINST THE SKILLS (the contract for every new map)
A map never invents a skill; it hooks the list. **Skills speed things up and make them safer; anyone can still do
the thing slowly.** Only a few things ask a minimum (a vent at Agility 7, a lock at Lockpicking 4). Hooks the sim
already has, to reuse:
- **Melee / Firearms** — every fight; an armory or gun locker draws the Firearms 5+.
- **Agility** — vents, gaps, dodging. **Escape** — grabs, pulling a friend free. **Strength** — cranks, wheels,
  heavy doors (`strengthFx … strengthCrank`), blows. **Endurance** — long runs. **Toughness** — hunger, thirst,
  infection, hurt. **Stealth** — sneaking past the dead.
- **First aid** — any treatment or revive. **Science** — notes, papers, lab work, medicine. **Electronics** — radios,
  terminals, power panels (`repairRate`). **Mechanics** — engines, valves, cranks, machinery. **Lockpicking** —
  any card or code lock (`LOCKPICK_MIN`, doors.ts). **Scavenging** — any search.
- **Leadership** — the group's nerve and who leads a plan. **Quick learner** — how fast trained skills grow.
- A new objective names its skill in its own words in the map's design doc, and a new kind of action that fits
  none of these is brought to Josh before a seventeenth skill is added.

## Things to settle while building (not decided yet)

- **Where the cast lives.** Today a character is a repo file
  (`src/survivorz/cast/<id>.json`), built into the server at deploy, and a
  bad file stops the boot. "One button, live, no Claude step" means the
  server must read the cast from its database (the Characters list,
  migration 116) and the body files from its asset folder, with the same
  rules checked at the button instead of at boot.
- **Licences.** The show's bought assets are no-redistribution, so bodies stay
  gitignored and travel to the server directly, never through git.
- **Skeletons.** Mixamo and store models arrive on their own skeletons; the
  existing retarget page (`scripts/survivorz/retarget.html`,
  `retarget-batch.cjs`) is the starting point for converting the library
  onto any of them.
