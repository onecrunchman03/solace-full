# Glenridge Hall: the review rubric

Josh, Nov 13 2026: "keep working until we have a high quality map, with correct sounds, effects, lighting, doors work
and are animated properly for the survivors to use … then have sub agents review and validate your work and grade it
on a rubric." And the same day: "the ability as admin in solace to spawn into the map and walk around … I should be
able to do everything the survivors are supposed to do. do that with each available map … the standard for all
future maps."

Each line is graded 0 to 4 by a reviewer who did not write the code, with the evidence (a file and line, a command
and its output, a picture). 4 = right and proven. 3 = right, with a small gap named. 2 = works but has a real fault.
1 = mostly not working. 0 = missing. A reviewer may not give a 4 on reading alone where a check can be run: run it.

## A. Sounds (the house sounds like the house)
- A1. Every floor has its own footstep (wood, stone, gravel, carpet, lino, concrete), by room, on both paces.
- A2. The storm: rain heard outdoors and from inside, thunder with each lightning stroke, nearer outdoors.
- A3. The house's own actions have sounds: oak doors open and close, the bolt, boards nailed and knocked off, the
  hearth stone, a crest set, the fires, the switchboard, the car.
- A4. Nothing from the bunker leaks in: no card-reader chirp on a key door, no PA, no pipe ticks upstairs.
- A5. Every sound a cue or rule names exists in the built sound set; a missing sound fails quietly, never throws.

## B. Effects
- B1. The hearths burn with real flames (not flat cards) and flicker.
- B2. Rain is drawn out of doors and not inside rooms; lightning lifts the grounds, the bodies and the sky together.
- B3. Boards go up on a window as it is boarded and come off as the dead knock them off; a late joiner sees them.
- B4. The hearth stone sinks, the crests show as they are set, the car drives out nose first along the drive.
- B5. No light, material or shader program is added after load (the fixed rig, uniforms only).

## C. Lighting
- C1. Lamp-lit rooms read warm and lit; bodies and furniture in them are lit to match the bake.
- C2. The grounds read as night and are still readable; the house's lit windows show from outside.
- C3. The lights out: the house goes dark, the fires keep burning and still light the people by them.
- C4. Flashlights light the walls and floors they point at, not only the bodies.
- C5. Unbaked things (doors, the moving parts, metal) never draw as black holes or glow in a dark room.

## D. Doors
- D1. Every door of the house has a leaf of the right kind (panelled oak, the arched plank front door, glazed
  French pairs, the vault's steel door, the garage's boarded pair) that fits its frame.
- D2. A leaf swings on its hinge onto clear floor, never through a wall or furniture, and pairs open both leaves.
- D3. The state on screen is the server's: open, shut, bolted, locked, for someone joining late too.
- D4. Survivors use doors properly: they stop, the door opens before they walk through, they play the door move;
  nobody walks through a shut leaf or a pane of glass.
- D5. The dead and doors: they come through an open door or a broken window, never a bolted door or a boarded
  window while the boards hold.

## E. The game on the map (the sim)
- E1. A whole show plays to one of its endings on game code alone; the story happens in order.
- E2. A save taken mid-show resumes the same show.
- E3. The bunker is unchanged by all of this (its harnesses, its frame hashes).
- E4. Nothing a survivor is told or shown names something the map does not have (keycards, the tunnel, Shelter 14).

## F. The show page
- F1. The page switches map by itself when the show does, without a reload, and back.
- F2. The objectives, banners, end cards and minimap are right for the map.
- F3. The cast cards say what each survivor is really doing, in the map's own words.
- F4. The admin's Control Room and Live Picture show the running map's plan and room names.

## G. Walk the map
- G1. An admin can start a walk on every map from the Survivorz panel, and only an admin can.
- G2. The body goes where it is steered, at walking and running pace, and is stopped by walls, furniture and shut
  doors exactly as a survivor is; stairs work.
- G3. Everything a survivor can do is offered where it can be done, and doing it uses the survivors' own rules.
  Each map's objectives can be completed by hand to its ending.
- G4. The dead can be fought, and can hurt and kill the walker.
- G5. A walk is private, never streamed, never numbered, and cannot disturb a real show.

## H. Safety and robustness
- H1. Every input from a page is validated and rate-limited; nothing here trusts the client.
- H2. No secret (a token, a key, a private path) is in the repo or a log.
- H3. All harnesses are green, run one at a time.
- H4. Leaving and re-entering the page, or losing the socket, leaves nothing running or leaking.

## I. Weight
- I1. The page holds 60 frames a second on the workstation with all four zones in.
- I2. What the map costs to download and hold is written down, with the first lever to pull.

## J. The record
- J1. GLENRIDGE.md says what is true today: how to build, walk, bake, pack and upload; what is still open.
- J2. Every asset that needs a credit has one on the public page.
- J3. Generated sounds are marked as awaiting Josh's ear, with how to hear them.

The total is out of 168 (42 lines). The reviewers' sheets and the fixes made after them are in
`docs/survivorz/GLENRIDGE-REVIEW.md`.
