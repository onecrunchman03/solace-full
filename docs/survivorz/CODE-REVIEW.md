# Survivorz: the code review (Nov 14 2026)

Five reviewers who did not write the code graded it against `CODE-RUBRIC.md` at commit `30b1652`. Code only: read
and run on game code, no AI model, nothing on the GPU, nothing on the live server. Their sheets are below as they
gave them (shortened), then the grade, then what was fixed.

## The grade: 65 of 112

| Section | Lines | Score |
|---|---|---|
| A. The rules both maps share | A1 2 · A2 2 · A3 2 · A4 2 · A5 4 · A6 2 | 14 of 24 |
| B. Glenridge Hall's own rules | B1 2 · B2 2 · B3 3 · B4 2 · B5 2 · B6 3 | 14 of 24 |
| C. Walk the map and the server | C1 2 · C2 2 · C3 3 · C4 2 · C5 3 · C6 3 | 15 of 24 |
| D. The show page's code | D1 2 · D2 2 · D3 3 · D4 2 · D5 2 · D6 3 | 14 of 24 |
| E. The checks and the record | E1 1 · E2 2 · E3 2 · E4 3 | 8 of 16 |

## Reviewer A: the shared rules

240 shows on both maps with its own monitors. Every defect was also in the build before the Nov 14 fixes, usually
worse; the fixes caused none of them. Same seed twice, four tick sizes, two start clocks and 30 save/loads gave
identical frames (A5: 4).

- A-1. The dead attack from a window's sill, unseen: `scan` skips a zombie on a link, and `attack` runs before the
  link advances. 20 of 40 mansion shows, 74 of 939 grabs, every blow on somebody not holding it as a threat.
- A-2. A runner's lunge grabs through walls (it needs only sight): 18 of 64 lunges had no clear floor between.
- A-3. Walking on the spot at a shut door they can open (a plain waypoint inside the door's cells): bunker 16 times
  in 8 of 80 shows (longest 402 s, with the crank job), mansion 50 times in 11 of 80.
- A-4. A stuck flee is never dropped (the walk's "stuck" is ignored): 10 times in 6 of 40 mansion shows (267 s
  three metres from one of the dead), 13 in 10 bunker shows.
- A-5. A route planned on a stair starts at the wrong end (the body's cell is only updated when the stair ends).
- A-6. A hider keeps a single-holder job: hide has no time limit and one hide is one fright. Bunker: Sarah hid three
  minutes with the repair; nobody else was offered it. 60 s+ holds: bunker 18, mansion 9 in 40 shows.
- A-7. "Take a breather" at full health is picked and ended every other tick (565 job changes in a minute).
- A-8. A fighter in a doorway walks on the spot (rare). A-9. Up and down a stair after their own escort (`alone`
  counts the same floor only). A-10. `reviving` stays set after a grab interrupts a revive (rare; 39 minutes).
- A-11. Bunker facts in the shared menu (room ids, a coordinate, furniture names, the crank and radio).
- Smaller: two escorts leave a stair on one cell; "driven off" has no memory for rest, crank, repair, call, revive
  or escort; with `TOUCH_M` 1.2 against `ATTACK_R` 1.0, grabs by something never a threat rose 3 to 13 in 950.

## Reviewer B: Glenridge Hall's rules

60 monitored shows (42 escaped, 18 wiped) and about 25 stagings.

- B-1. `car.away` is never sent when everyone alive is aboard (the show ends first): 33 of 42 escapes.
- B-2. Sweepers draw the bolt to "sweep" the porches (the sweep's rule is `outdoor`, the scenario's is `grounds`):
  15 of 60 shows; the bolt drawn and thrown five times in three minutes.
- B-3. The garage counts as "in the house": one of the dead in it holds "Clear the house" open.
- B-4. The butler's key is lost if its holder dies unseen in the grounds: the vault crest is never found.
- B-5. The proof and the keys are not carried: 5 of 42 escapes left the proof's reader behind; the row says "with
  the proof".
- B-6. The one in the cell is not held ("chained" is read by nothing): out of the cell in every show.
- B-7. The hour beats a seated car. B-8. The crest hunt needs the bolt for ever (the comment says "or this long in").
- B-9. `close()` has no kind guard (it would shut a window or re-seat the hearth stone; no caller today).
- B-10. The bolt's body check is alive-only. B-11. `clearAt` is one-shot. B-12. nits (`woodsMax_`, numbers outside
  `GLEN`, "stands open" for a shut unbolted door, a dead carrier's crest also left in their drop).
- Owner's calls: fleeing survivors draw the bolt from inside in 21 of 60 shows; the secret, keys and fuel are known
  to all six at any distance.

## Reviewer C: the walk and the server

Walk 132, broadcast 126, resume 37 green; throwaway servers for its own probes.

- C-1. A logged-out, revoked or suspended session keeps its show socket (and an admin's keeps the stick): the
  broadcast has no `user.kick` listener.
- C-2. The saved stick walks the body after every restart (11 m with nobody connected).
- C-3. One member can take all 60 seats. C-4. A second "stop" switches a hand-set stream off.
- C-5. The driven body shuts steel doors (keycard, keypad, the vault) that the AI never shuts.
- C-6. `player.ts` names the bunker's crank, repair and call. C-7. `why` reaches members on every body.
- C-8. Lever bodies are coerced, not typed (`op:["walk"]` starts a walk; an object for `map` is a 500).
- C-9 to C-11. nits (another admin's flood stops the push; a joiner takes the walker's note; a jump while paused;
  the length lever; an ordinary test run does not give ON AIR back; a dead walker's run keeps ticking).
- C-12. Nothing caps the dead (the spawn lever: 310 made; a six-hour bunker walk gains 68 an hour).
- C-13 (suspect): no backpressure or ping on the show socket. C-14 (suspect): `begin` sets state before the world.
- Found right: 18 old-build saves load and play on; killed while paused comes back paused; a walk is unnumbered.

## Reviewer D: the show page's code (read, and probed in Node)

- D-1. The bolt bar is missing when the door was already shut (no case for `door.bolted`).
- D-2. The follow camera jumps in front of the body at every doorway (the clamp to the room's box), and a walk's
  forward key means "back" while it is there.
- D-3. All six exterior doors open outward (the "never up into a step" rule compares the rooms, not the sill).
- D-4. Outdoor place words: "in the gate", "in the west lawn".
- D-5. The car leaves in silence when everybody boards (B-1). D-6. Bunker noises (a pipe burst) on the mansion.
- D-7. The car slides up to 20 degrees sideways at the joins; `test-car` computes its step and never asserts it.
- D-8. The roof mask: a flat 7.4 m lid (no rain for 4.5 m above single-storey rooms; rain inside the great hall
  above 7.4 m); a camera over unlabelled upper floor counts as outdoors (lightning fill indoors).
- D-9. The arch head hangs from the plan, not `fit`. D-10. small leftovers on dispose. D-11. nits.

## Reviewer E: the checks and the record

Mutation: each Nov 14 fix undone alone in a copy of the build. Only three turn an assert red (the sight rule, work
cut short, the porch); the feed fix is pinned only as a pair; driven off, the fighters' help, both calm times, the
second fighter, make-way, the escort cap, the sweep bonus (both maps), the fuel party, the plank count, the 90 s
and `TOUCH_M` had nothing.

- E-2. One assert cannot fail (`walled` read once, after 6 s). E-3. The "standing" and "stalls" whole-show asserts
  pass on the old build (a kill counted as progress). E-4. "worst < 100" passes on the old build on the chosen
  seeds (99). E-5. The boarded-windows assert passes on the old build in three of four seed ranges.
- E-6. Personal space: on the original four seeds the build read 22 against the old budget of 12, and the check
  was widened. Over seeds 1 to 48 the build reads 142 steps inside each other, the old build 30 (one case: two
  people walking to rest inside each other for 6.7 s).
- E-7. `test-show`'s escape band has one show of headroom.
- E-8. The frame hashes quoted in both docs are wrong (from before the merge with master).
- E-9. The before/after table's "after" column is not the committed build's (stalls 0: it reads 2).
- E-10. "Two go with somebody, not four" is not true of the mansion's fuel party. E-11. A stale endings line.
- E-12. The mansion's harnesses are not under `scripts/checks`, so `npm run checks` never runs them.
- E-13. `soak.mjs` leftovers. E-14 (suspect). `walled` is never cleared. E-15. `outdoors()` means two things.

## What was fixed (the same day)

Listed in `GLENRIDGE.md` under "The code review (Nov 14)", with what is still open after it. In short: A-1 to A-7
and A-10; B-1 to B-9 and B-11; C-1 to C-5; D-1 to D-4 and D-6; E-2 to E-6, E-8 to E-11, E-13 in part. The
mutation table's gaps were closed for driven off, the fighters' help, `TOUCH_M`, the escort cap, the plank count,
the ninety seconds, the fuel party and the mansion's sweep bonus (`test-steady.mjs`, 42 asserts, 22 red on the old
build; the bunker's sweep bonus has no assert).
Not re-graded: the reviewers were not run again after the fixes.

## The second round (the same evening)

The open list was worked through: `GLENRIDGE.md`, "The code review's second round". Fixed: A-8, A-9 and the
smaller ones under A (the stair, the bed); C-7 to C-12 and C-14; D-7 to D-10; E-12, E-14; and every server fix
of the first round now has an assert (the walk and stream harnesses). Writing those checks found three things
the first round had left wrong: signing out did not close the show socket (C-1's fix listened for an event a
plain sign-out never sent), the make-way rule never fired for a leader who was blocked outright, and the one in
the cell could still be lunged, shoved or walked up a stair off its chain. Left: A-11 and C-6 (the bunker's facts
in the shared rules: a restructuring), B-10, the nits. Still not re-graded.

## The third round

B-10, B-12, C-13 and the faulty part of A-11 (where to look for a weapon or a bandage is the map's to say:
`lootHints`). Then four faults no reviewer had named, found by reading 160-show soaks: a hand's reach through a
shut door (an hour run out with five alive), the flicker in and out of hiding, walking into being outnumbered,
and an escort beside a blocked leader who was not counted as in the way. `GLENRIDGE.md`, "The third round".

## The re-grade (Nov 14, night)

| Section | First review | Re-grade |
|---|---|---|
| A. The rules both maps share | 14 of 24 | 13 of 24, run again later that night (A1 1, A2 2, A3 2, A4 2, A5 4, A6 2) |
| B. Glenridge Hall's own rules | 14 of 24 | 16 of 24, run again later that night (B1 2, B2 3, B3 3, B4 2, B5 3, B6 3) |
| C. Walk the map and the server | 15 of 24 | 18 of 24 (C1 3, C2 3, C3 3, C4 3, C5 3, C6 3) |
| D. The show page's code | 14 of 24 | 17 of 24 (D1 3, D2 2, D3 3, D4 3, D5 3, D6 3) |
| E. The checks and the record | 8 of 16 | 10 of 16 (E1 2, E2 2, E3 3, E4 3) |

The three sheets' findings and what was done about them the same night are in `GLENRIDGE.md`, "The re-grade".
Those grades are of commit `31eff57`, before that night's fixes; B's is of `cb879cb`. B's sheet and what was done
about it are in `GLENRIDGE.md`, "The house is all of its floors": its first finding, the upper floor and the
cellars counted as the grounds, was under every number in this review. A's is of `cb879cb` too: it found a
livelock the first review missed (a job picked and let go every step, 2.3% of the mansion's survivor time), which
is why its grade fell with most of its first findings fixed. Its sheet is under "Section A's re-grade". **All
five sections, graded twice: 74 of 112** (65), each of the code before that section's own fixes.
