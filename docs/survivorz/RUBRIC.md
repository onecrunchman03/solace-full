# SURVIVORZ — THE REVIEW RUBRIC

How the show is judged, area by area. Every rule comes from something Josh already decided
(REALISM.md, the animation laws, BUNKER.md); this file only says **how each one is checked and
what counts as a pass**. A map tunes dials; the rubric is the same on every map.

**Scoring.** Each line is scored **2** pass · **1** partly · **0** fail · **–** not checked this
round. An area's score is its points over the points checked. A line marked **(gate)** fails the
whole area at 0, whatever the rest scores.

**Three kinds of evidence**, in order of trust:
- **tool** — a script prints a number. Rerun it and it says the same thing.
- **run** — measured off a recorded show on the real model (`scripts/survivorz/review/`): every
  frame the server sent, replayed.
- **eyes** — a person watches clips or stills. Only for what no number can say.

A line with no tool or run behind it is a gap in the rubric, not a pass.

---

## A. Bodies and clips (every body the show can cast)

| # | Rule | Checked by | Pass |
|---|---|---|---|
| A1 **(gate)** | Every body is a whole file, every clip has keyframes and moves real bones | tool `check-packed.mjs` | 0 broken bodies |
| A2 **(gate)** | The show never picks a clip a body lacks or one stuck in its bind pose, in any state | tool `anim-show-check.mjs` | all clean |
| A3 **(gate)** | No limb inside the body's own torso on any clip the show plays | tool `anim-law-show.mjs` | 0 past 3 cm (Rollo 6) |
| A4 | Motion stays inside what that body's motion capture does (no snapped joints, no jerks) | tool `anim/<body>/natural.json`, show clips only | 0 show clips out of range |
| A5 | Feet on the floor: nothing sinks or floats | tool `anim/<body>/contact.json`, show clips only | 0 sinking > 3 cm, 0 floating > 10 cm (jumps excepted) |
| A6 | Hands: fingers not through each other, the palm or the thing held | tool `anim-hands.cjs <body>` → `anim/<body>/hands-new.json` (what a built clip has that its base recording doesn't); `score-bodies.mjs` column "new" | 0 new findings on built clips |
| A7 | Walk and run loops don't skate | tool `loopspeed.json` has a measured speed for every loop on every body | every cast body measured |
| A8 | A weapon sits in the hand on every body, and what they carry sits ON every body (a pack, a holstered pistol, a slung rifle) | tool `kit-fit.json` (`kit-fit.mjs`, `kit-stow.mjs`: `--only <body>` fits any body by name; the creator's bake runs both as its last step) | every body a character wears × every weapon fitted, with a pack fit and a stow fit; `props/guns/cal.json` has a pistol calibration and a seat for each gun on every body (`score-bodies.mjs` column "seat") |
| A9 | Stiff idles, hands on doors/crank/radio, searching leans in | eyes, clip page | Josh's flags: none open |
| A10 | Moving upright: the jog, runs, sprint and armed walks lean no further than a person does, the head level | tool `review/posture.mjs` (against the same body standing) | trunk ≤ 8° jog / 9-10° run / 15° sprint, head ≤ 4° past the trunk, on every body; crouching and injured excepted |

## B. Grabs, bites and rescues (two bodies at once)

| # | Rule | Checked by | Pass |
|---|---|---|---|
| B1 **(gate)** | A pair only plays if neither body goes into the other | tool `pairs.json` built from the sweep | every listed pair under the line |
| B2 | Every cast body can be grabbed and bitten by most zombies | tool: count per body in `pairs.json` | ≥ 15 of 19 zombies, forearm and shoulder each |
| B3 | Every cast body can be pulled free by a friend | tool: rescue entries per body | every cast body |
| B4 | The zombie's mouth is on the limb; nothing pops between frames | eyes, pair clips | Josh's flags: none open |

## C. Movement in a live show

| # | Rule | Checked by | Pass |
|---|---|---|---|
| C1 **(gate)** | Nobody inside a wall, furniture or a shut door | tool `test-sim.mjs` invariants | 0 |
| C2 | No sudden turns: a body on its feet turns at a body's pace | tool `review/move-probe.mjs` (every survivor, every step, six simulated shows; each hard turn filed under what the body was doing); run: heading change per second while walking | 99th percentile under 240°/s moving, 300°/s on the spot; under 10 turns over 300°/s in six shows |
| C3 | Starts and stops ease: a body gains and sheds speed at a body's pace (a wall, a grab, a fall and a shove from the dead excepted) | tool `review/move-probe.mjs`, `test_survivorz_weight.mjs`; run: speed change between steps, every step on their feet (`accelCalmP99`, `accelFightP99`) | 99th percentile at or under 8 m/s² at their own business (a sprint reached in 0.8 s, shed in 0.6 s), 16 in a fight. The first scorecard's line said 3 m/s²: a guess — a walker stopping in one step is already 4 — and it read walking steps only, which never saw a dead stop |
| C4 | Not everyone at one speed; running is rare and short | run: speed spread, share of time running | run under 15% of moving time when calm |
| C5 | Hands on the thing: within reach of what they use | tool `test-sim.mjs` PROXIMITY | 0 interactions past 0.9 m |
| C6 | Personal space: nobody standing in somebody | run: closest two living survivors | never under 0.45 m outside a pair move |
| C7 | Nobody stuck | tool `bunker-sim.mjs` JOB FAILS (`--where`: by where from, where to and for what) | under 1 "stuck" or "no route" a run |

## D. Sound

| # | Rule | Checked by | Pass |
|---|---|---|---|
| D1 **(gate)** | Every sound a cue names exists | tool: cue table vs manifest | 0 missing |
| D2 | Every cast member has their own hurt, fear and dying sounds | tool: `vocal-<who>-*` per cast and bench member | all nine kinds each |
| D3 | Every event a viewer would expect to hear has a cue | run: events sent with no cue | none of: doors, hits, falls, pickups, revive |
| D4 | The engine's rules (walls dull, distance fades, music rises at once and falls slowly, never silent) | tool `test-audio.mjs` | all pass |
| D5 | No PA voice on the bunker | tool: no `pa` part reachable from a bunker event | 0 |
| D6 | Levels: nothing near-silent, nothing clipping | tool `sound-verify.mjs` / loudness read of `final/` | all within 6 dB of target |
| D7 | The mix reads right: groans creepy and distant, voices sit over music | eyes (ears), Josh | no flags |
| D8 | A footstep for every foot that touches the floor, as it touches | tool `test_survivorz_footfall.mjs` (the real walk, jog, sprint and crouch loops on real bodies) | ≥ 99% of landings heard, within two frames; no stray steps |
| D9 | An action's sound lands with the action: a swing's hit, a stab, a zombie's blow, a body reaching the floor, a box, a can | tool `review/clip-moments.mjs` (when each clip makes contact) against the cue timing; eyes | within 0.1 s |
| D10 | Only the room's feet: no footsteps through walls | eyes (ears) | no flags |

## E. Speech

| # | Rule | Checked by | Pass |
|---|---|---|---|
| E1 **(gate)** | The dead say nothing | run: any line after its speaker's death | 0 |
| E2 **(gate)** | Nothing over THE LINE, no secret bite told | tool `test_survivorz_talk.mjs` | pass |
| E3 | One voice at a time in a room | run: lines in one room overlapping | 0 (urgent cut-ins excepted) |
| E4 | Idle pace: a line every minute or two, not a stream | run: lines per survivor per minute outside fights | 0.3–1.5 |
| E5 | One short sentence | run: words per line | median ≤ 14, 95% ≤ 24 |
| E6 | Names used | run: share of lines to somebody that use a name | 25–60% |
| E7 | No repeats, and no two people saying the same line | tool `test_survivorz_talk.mjs` (a draft is read against what everybody has said lately); run: lines sharing three-quarters of their words with an earlier one (`alike`) | under 5% |
| E8 | Big events get a reaction out loud, fast | run: a line within 8 s of a death, down or grab | ≥ 80% |
| E9 | Every cast member has a voice | tool: clone on slopbot for each | all |
| E10 | They sound like themselves and like people | eyes: read the transcript | no character indistinguishable from another |

## F. Decisions (the AI)

| # | Rule | Checked by | Pass |
|---|---|---|---|
| F1 **(gate)** | They know only what they have seen: rooms, and people (no name before they've met) | tool `test-sim.mjs` + `test_survivorz_talk.mjs`; run: names said, or in a goal or reason, before the meeting | pass; 0 names early |
| F2 | The model decides, not code | run: model's share of choices | ≥ 90% |
| F3 | Everyone has a goal of their own, in their own words | run: goal frames | every survivor inside 5 min, no two the same |
| F4 | A change of plan has a reason a viewer can see | run: decide frames with a reason; eyes: does the reason fit the action | ≥ 90% carry one; under 5% the same sentence again; none about a different action |
| F5 | No dithering | run: A→B→A inside a minute (fights excepted); time between one survivor's decisions; the same gift back and forth | 0 flips; a plan lasts a minute or more at the median |
| F6 | Personality shows: different people choose differently | run + `test-genes.mjs` | genes move dials the right way; choices differ by person |
| F7 | The objectives get done by reasoning, in a watchable time | tool `bunker-sim.mjs` (code) + run (model) | door shut inside 15 min in ≥ 80% of runs |
| F8 | Outcomes vary: not always rescued, not always wiped | tool `bunker-sim.mjs` | no ending over 70% |
| F9 | Not idle | tool `test-sim.mjs` AUTONOMY | idle under 10% of waking time |
| F10 | Smart but human: sensible, some mistakes, fear shows | eyes: read decisions against the events | no flags |

## G. The camera

| # | Rule | Checked by | Pass |
|---|---|---|---|
| G1 **(gate)** | Never films a wall, an unloaded room, or the dead as its subject | tool `test_survivorz_director.mjs` | pass |
| G2 | Shots of 8–15 s; only a big moment cuts sooner (or a subject walking out of a fixed shot: one hand-over to the following camera, counted apart) | run: director replayed over the recording (`under8ChosenShare`, `leftFrame`) | chosen cuts under 8 s: ≤ 2% of ordinary shots; median shot ≥ 8 s |
| G3 | A grab, a down and a death are on screen at once | run: time from the event to the cut | under 1.5 s (two at once: the second inside 10 s) |
| G4 | Airtime goes round the cast | run: each survivor's share | nobody over 45% while others are alive |
| G5 | A death is held | run: from the death to the camera leaving the body | ≥ 10 s |
| G6 | Framing: not too close, not too far, no body in the lens | eyes: stills at 20 cuts | ≤ 2 bad of 20 |
| G7 | A fixed shot isn't re-taken on somebody walking, and the picture isn't cut to pieces | run: estimated re-takes (`retakesEst`), cuts of every kind a minute (`cutsAllPerMin`) | ≤ 2 re-takes in 15 min; ≤ 7 cuts a minute |

## H. The screen

| # | Rule | Checked by | Pass |
|---|---|---|---|
| H1 **(gate)** | The hidden bite never shows | tool `test_survivorz_director.mjs` | pass |
| H2 | DOWN, BITTEN and DEAD are right, at the right moment | tool, same | pass |
| H3 | A drop-in viewer knows who and what in 10 s: cards, objectives, caption | eyes: 5 stills | all 5 readable |
| H4 | The middle of the screen is clear | eyes: same stills | all 5 |
| H5 | The picture inside 10 s of pressing Watch | tool `review/load-time.mjs` (a real browser on the graphics card, the server beside it, a show paused twenty seconds in: once with nothing kept, then with every file on this machine; it prints the page's own load log) | both |

## I. Effects

| # | Rule | Checked by | Pass |
|---|---|---|---|
| I1 | The effects engine's caps, order and memory | tool `fx-check.mjs` | all pass |
| I2 | Blood, muzzle flash and marks land where the hit was | eyes | no flags |

## J. The run itself

| # | Rule | Checked by | Pass |
|---|---|---|---|
| J1 **(gate)** | A crash or deploy resumes the same show | tool `test_survivorz_resume.mjs` | pass |
| J2 **(gate)** | Every objective reachable, nobody born stuck | tool `test_bunker_map.mjs` | pass |
| J3 | The page lasts a month: budgets, retries, cache | tool `test_survivorz_client.mjs` | pass |
| J4 | The sim costs nothing on the server | tool `test-sim.mjs` step cost | worst step under 20 ms |
| J5 | The checks themselves are current | tool: every script above runs green or is fixed | 0 stale |
| J6 | The show fills its hour | tool `bunker-sim.mjs`: runs over before 0:20; run: when the real-model show ended | under 20% of runs; no ending before 0:20 |

---

## Running a review

```bash
npm run build
```
```bash
node scripts/survivorz/review/run-tools.mjs
```
```bash
node scripts/survivorz/review/record.mjs 25
```
```bash
node scripts/survivorz/review/score-run.mjs data/survivorz-review/run.jsonl data/survivorz-review/status.json
```

- `run-tools.mjs` runs every **tool** line and keeps each output in `data/survivorz-review/`
  (`score-bodies.mjs` is one of them: the stored animation measures, per body).
- `record.mjs` plays a show on the real model (the 26B on this PC, a throwaway server on port 8605) and
  keeps every frame. Not during a broadcast: it shares the model.
- `score-run.mjs` prints the **run** numbers: movement, speech, decisions, sound, the camera replayed.
- `move-probe.mjs` runs shows on game code alone and reads how every survivor turned and changed speed, every
  step, with each hard turn or stop filed under what the body was doing (C2, C3).
- `load-time.mjs` presses Watch in a real browser and times the picture (H5). It needs the graphics card and
  Playwright's Chromium, so it is not one of `run-tools.mjs`'s.
- The **eyes** lines need the show open: `record.mjs` leaves its server up while it records. Open it in a
  browser that is really drawing (a hidden preview pane pauses the page; Playwright's Chromium headless on the
  card works) by `127.0.0.1`, never `localhost` (0.2 s a connection on Windows), and take stills.

Each review's scorecard is kept beside this file as `RUBRIC-<date>.md`.
