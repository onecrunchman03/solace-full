# Survivorz: the code rubric

Josh, Nov 14 2026: "let's set up a rubric based review just on code. Don't use the AI model yet, I'm still
rendering stuff."

A review of the CODE, by people who did not write it: read it, run it on game code alone, and grade it. No AI
model (no Ollama, no real-model show), nothing on the GPU (no browser, no Blender), nothing on the live server.
What a watched hour would show (the look, the sound, the lines) is not graded here: `GLENRIDGE-RUBRIC.md` and
`RUBRIC.md` are for that.

## How a line is scored

| Score | Means |
|---|---|
| 4 | Right, and a check in the repo would go red if it broke. |
| 3 | Right as far as the reviewer could find; small gaps, or nothing pins it. |
| 2 | Works, with a real defect somebody watching or playing would meet. |
| 1 | Wrong in an ordinary case. |
| 0 | Missing, or broken outright. |

A defect is written down with the file and line, what happens, and how to see it (a staging, a seed, a script's
output). A suspicion the reviewer could not confirm is marked as one. Nothing is graded that was not read.

## The lines (28, 112 points)

### A. The rules both maps share (`src/survivorz/sim/survivor.ts`, `zombie.ts`, `world.ts`)

- **A1 Steady choices.** Nobody flips between two things to do: the mode decision (`decide`), its dwell and calm
  times, the driven-off rule. No livelock a seed can find.
- **A2 What is a threat.** What a survivor notices and acts on (`scan`) and what one of the dead notices and acts
  on (`sense`, `feedStep`, `chaseStep`) agree with each other, and with what can be reached.
- **A3 A job ends.** Every job ends, fails, or is gone back to; a job in one name passes to another when its
  holder can't do it (`goThenDo`, `failJob`, `claimed`, `until`).
- **A4 Bodies in space.** Escorts, fighters, the squeeze: nobody boxed in, nobody through anybody for long.
- **A5 The same show twice.** Every roll is the world's own; no wall clock, no module state a save would miss; a
  save and a load play the same frames.
- **A6 One set of rules.** No map's name in the shared rules: a map is data, dials and its scenario.

### B. Glenridge Hall's own rules (`sim/scenarios/glenridge.ts`, `sim/mapdef.ts`, `doors.ts`)

- **B1 The story in order.** Bolt, windows, clear, crests, secret, proof, lights, keys, fuel, car: each can be done,
  none skipped, none deadlocked.
- **B2 Nothing lost for good.** A crest, the fuel, the keys, the planks, the proof, with whoever carried them dead,
  turned, downed or driven off.
- **B3 Hand-offs.** A task somebody holds and can't finish becomes somebody else's (`onTask`, the plank count, the
  fuel party, `recent`).
- **B4 The ways in.** Windows, boards, the woods, the porches, the bolt: the door rules say the same thing in
  `canPass`, `open`, `zombieGate` and the scenario.
- **B5 Endings and clocks.** Every show ends; the car's leaving, the wipe, the hour, the lights going out and
  coming back.
- **B6 The dials.** Every number that tunes the hour is named, in one place, and does what its comment says.

### C. Walk the map and the server (`sim/player.ts`, `routes/survivorz-show.ts`, `broadcast.ts`, `sim/save.ts`)

- **C1 Whose it is.** Admin only; a walk is private, never streamed, never numbered, never in the history.
- **C2 What comes in.** Every input from the socket and the routes is checked and budgeted.
- **C3 The same game.** The driven body uses the simulation's own walk, doors, jobs and blows; nothing in it knows
  a map.
- **C4 Its life.** Start, pause, stop, reset, give back what it borrowed, a restart of the server mid-walk; a save
  made before the Nov 14 fields existed still loads.
- **C5 The wire.** Text frames, nothing secret on them (a hidden bite, another's thought), sizes bounded.
- **C6 What it costs.** A tick's work is bounded (the walk-line test in `scan`, the route plans, the menu); nothing
  grows for a month.

### D. The show page's code, read not watched (`client/src/survivorz/show/*`, `audio/*`)

- **D1 Doors.** `doors.ts`: the leaf in the measured opening, the hinge side and swing, the bolt bar, the car's
  path, for a door facing any way.
- **D2 The scene.** No light, material or program made after load; the camera's room test; the rain's roof mask.
- **D3 Sound.** Every event the mansion sends has a cue or is silent on purpose; the house conditions; the beds.
- **D4 Words.** The overlay says what the frames say; a map's words stay on that map.
- **D5 The walk's controls.** `walk.ts`: keys, limits, what is sent, what is cleaned up.
- **D6 Lifetimes.** Listeners, timers and GL things are let go; a rebuild and a reconnect are safe.

### E. The checks and the record

- **E1 The fixes are pinned.** Each Nov 14 fix has an assert that goes red on the build before it.
- **E2 Honest checks.** No assert that cannot fail; thresholds argued; seeds not picked to pass.
- **E3 The record is true today.** `GLENRIDGE.md` (the soak, what is still open), `BUNKER.md`, the counts in
  `CLAUDE.md`.
- **E4 The code reads.** Comments say why; no dead code, no scratch left in; one name for one thing.
