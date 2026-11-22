# SURVIVORZ — THE REALISM SPEC

Josh's answers to the realism questionnaire, Nov 3 2026 (110 questions). These are the
show's standing rules on **every map**: a map tunes a few dials (ambience and music,
zombie types and numbers, objectives); everything else here is universal. Build from the
map's own data (rooms, doors, objectives), never from a map's room names.

Closest references: **The Last of Us** (game) and **The Walking Dead** (TV). Main
audience: **YouTube viewers who don't know Solace** — the screen must explain the
situation to someone who drops in at any moment.

## The feel
- A grounded survival drama. Steady pace with quiet stretches between big moments;
  long stretches of searching and talk are fine if the talk is interesting.
- In the first minute a viewer learns who the survivors are and what they're trying to do.
- Viewers like a character through their personality coming through in talk.
- Slowing the sim (fewer things at once) to make it easier to follow is allowed.

## Movement
- What reads robotic now: sharp sudden turns, everyone the same speed, straight lines to
  exact points, stops and starts with no ease. Fix all four.
- Calm: a relaxed walk, pausing now and then to look around.
- Dead nearby: crouched, slower, careful. Running only in danger or a rush, in short
  bursts, then out of breath.
- **One walking style for everyone** (no per-character gaits).
- Groups: a loose cluster, someone leading, others trailing.
- Doorways: careful (slow, one at a time, look through) **only into a room they don't know**.
- Talk while walking and stop to talk, both. About a metre apart, facing, when talking.
- Waiting: shift weight, look around, check gear.
- Early on they can look lost or take a wrong turn; a survivor starts knowing only the
  room they wake in and learns the rest.
- Zombies shamble slowly and speed up when they spot someone.

## Speech
- Problems now: lines overlap or cut each other off, and come too often.
- Idle: a line every minute or two, one short sentence. Back-and-forth exchanges of 2–4 lines.
- Two rooms may talk at once; you hear the camera's subject.
- Big events (a death, a door breaking) get an immediate reaction out loud.
- Subtitles: speaker and line, one at a time, timed to the voice.
- Swearing as the character would. Quiet self-talk sometimes when alone.
- Names used often enough for viewers to learn them.

## Decisions
- Driven by personality and goals. Smart but human: sensible, with some mistakes; bad
  calls when the personality would make them (panic, greed).
- Change what they're doing only for a reason the viewer can see.
- A zombie appears: by person — fight, freeze, flee or call for help.
- They argue sometimes, then decide. A leader emerges from personality.
- Sharing mostly fair; some hoard or steal by personality. Turning on each other: rare,
  with a clear build-up.
- Fear shows in speech, movement and choices. Tiredness and hunger: slower, more
  mistakes, complaining, resting.
- Short rests on a short run; real sleep only on a run long enough for it.
- Objectives found by searching and reasoning a viewer can follow.
- They remember the run and mention it.

## The director camera
- Problems now: cuts too often, bad angles (walls, too close, too far).
- Follows the most important story right now. Shots of 8–15 s.
- Shots: over-the-shoulder follow, close-ups on faces for talk. Talk is cut back and
  forth on whoever's talking. Fights: wide enough to see both sides, then a close-up on the hit.
- Split screen for big simultaneous moments. Smooth operator movement with slight drift.
- Show the threat coming before the survivors see it; wait in an empty room before
  someone enters, for suspense.
- A death: show it, then hold on the body and the others' reaction.
- Hard cuts, a dip to black between rooms. A quick map shot between scenes.
- The admin can steer it live: focus a survivor or a room.
- Camera spots come from the map's rooms automatically, hand-tuned only where needed.

## Animation
- Worst problems: deaths falling in the wrong place or pose, stiff idles, hands not
  touching what they use (doors, guns).
- A survivor dies where hit, in a natural fall, and stays there for the rest of the run.
  A zombie: a ragdoll-style fall where it was killed.
- Down: on the ground, crawling or clutching a wound. Revive: kneel, hands on the wound,
  help them up. Bleed-out about 2 minutes.
- Zombie attack: grab and bite, the survivor struggling.
- Weapons properly held, always. Searching: opening drawers and boxes, leaning in.
  Found things visibly carried.
- A turned cast member keeps their own body, bloody and pale.

## Sound
- Priorities: gunshots and hits, zombie groans and screams, footsteps and doors, fear
  sounds (breathing, gasps).
- Quiet tension music that rises with danger. Subtle stingers for big moments.
- Groans distant and creepy, louder when close. Other rooms heard muffled.
- Voices: a little room echo, quieter when far from the camera.
- Never silent: ambience always. Each map's ending has its own sound, then music.
- **No PA or announcer voice unless a map's story calls for one** (the bunker's doesn't).
- A shared sound library every map draws from, plus a few sounds of its own.

## Overlay
- Cards: name, health, what they're doing, current thought, kills, what they're carrying.
- Clear DOWN (red, with the bleed-out timer), BITTEN and DEAD styles.
- The objectives checklist always on screen. Short running story captions for what matters.
- Keep the DECIDED box as it is. A small relationships panel now and then.
- Keep the middle of the screen clear.

## Death
- A dead survivor's queued lines are dropped at once; sometimes a short scream or last line.
- The others stop, react, grieve briefly, then carry on.

## Loading
- The picture within 10 s, things brought in as they arrive; a body shows nothing until
  it's ready (no placeholder). A failed load shows a short "reconnecting" and fixes itself.

## Test runs
- Watched on the same Survivorz page, marked TEST, for the admin only.
- Countdown default 5 minutes; viewers see the title card with the cast introduced one by one.
- Test runs keep the run history, never the survivors' long-term memory.

## Every new map
- Checked by a standing test before it goes live: every objective reachable, nobody
  stuck, the camera can see every room.

## How the work runs
- Behaviour and movement first (Josh's points 1 and 8). Small rounds, each reviewed with
  short clips or screenshots, naming the reference being matched.

## Progress
- **Round 1 (Nov 3):** walking eases in and out, slows into corners and turns at a natural rate, cuts
  corners where there's room; calm strolls with look-rounds, careful into unknown rooms, crouched near
  the dead. Sounds back, no PA, the dead silent, the DOWN card, test runs watchable, countdown choice,
  faster warm loads.
- **Round 2 (Nov 3):** speech and contact.
  - One voice at a time in a room: a line waiting for its voice, or being spoken, holds the room until it
    ends (talk/show.ts). Only the urgent (a grab, a death) cuts in.
  - Idle talk: a new conversation per room every 1–2 minutes, exchanges of 2–4 lines, one short sentence
    each, names used, a mutter to themselves now and then when alone. One subtitle at a time, held for the
    voice's length.
  - Contact: a grab pulls the zombie to 0.55 m (hands on the body); a survivor steps INTO each swing so it
    lands at the weapon's length (CONTACT in sim/survivor.ts), then steps back out while recovering.
    Measured over 6 seeds: grabs 0.87 → 0.55 m, blows 1.1–2.0 → about 1.0 m, survival unchanged (8 seeds,
    21 → 22 of 48 alive). Stepping the dead in on every swipe was tried and dropped: it doubled the deaths.
  - A down survivor's card follows the sim's own state, never just 0 hp (it read "dead" for a beat when a
    grab ended in a fall).
- **Round 3 (Nov 3):** glare and the camera.
  - No body is a mirror: the scanned survivors loaded at 40% metal, Rollo's suit and the zombies' eyes at
    100%. At load, skin and cloth are made non-metal and nothing but an eye is glossier than half-rough;
    wet and sweat shine eased. Blown-out pixels on the same run: 0.086% → 0.009%.
  - Shots hold 8–15 s (a big moment still cuts at once); a dip to black only between rooms, a hard cut
    inside one.
  - THE OPERATOR replaces the follow camera: about 3.5 m behind and a quarter round (in front, three-
    quarter, when they stand still), keeps its side, eases instead of being dragged, sways a few
    centimetres, never nearer than 2.3 m, and cuts rather than swinging through the subject or staying
    behind a wall.
  - Conversations: a line said to the subject (or by them) in their room puts a close on the speaker, at
    least 3 s after the last cut; a big moment anywhere beats a line. Closes pulled back to head and
    shoulders.
  - Still to come: the threat shown before the survivors see it, waiting in an empty room, split screen,
    a map shot between scenes, the admin steering the camera live.
- **Round 4 (Nov 4):** hands on the thing, bodies where they are.
  - ON THE THING ITSELF (Josh: "they have to be right next to something to interact with"): the grey box laid
    every objective spot along its room's wall, knowing nothing of the dressing — the crank 3.9 m from the
    valve wheel, the radio set 8 m from the console. Every spot now stands on its prop (sim-walk.mjs HOSTS:
    the crank on the wheel, the radio on the console, the keycard on the desk, notes on a clipboard or a
    book; anything else on the nearest furniture), its stand within 0.3–0.8 m. test_bunker_map pins it, and
    three real runs touching nothing from further than arm's reach.
  - Pulling one of the dead off a friend needs hands on IT (was done from 2.2 m).
  - Feeders kneel beside the body, never on it: two at the torso, two at the legs, only places a body can
    stand; and one killed while kneeling falls backwards off the body (the backward death, joined at its
    kneel), not forward onto it. Measured: 0 of 1,325 feeder samples on a dead body's line.
  - A grab's pin always lets go: a flinch that cut the wrench-free clip short dropped its release, and the
    body stayed pinned where the grab stood it while the sim ran it round the bunker (Rollo "floating", fights
    a room away). The release now travels with the body, and a pin nothing will release goes back to the wire.
- **Round 5 (Nov 4):** two at the wheel, one at the mic, things that add up, people who aren't statues.
  - TWO PAIRS OF HANDS ON THE CRANK: two may turn it, and both used to aim at one spot, so the second shoved
    the first a metre back while he went on "cranking". Alone they stand at the wheel; two stand side by side
    either side of it, each with a hand on its own side of the rim, stepping there at a walk.
  - ONE AT THE RADIO: one makes the call, one looks it over, one repairs it — three "calling" at once all
    reached for the same mic and shoved each other off it. The others are offered guarding the one at the set.
  - A radio part is never carried over the slots (Rick at 7 of 6): room is made for it by leaving the least
    wanted things behind in the container, ammo for a gun they don't carry first.
  - A pistol taken from a cupboard no longer brings 15 rounds the bunker never had (the census counts its
    magazine in the cupboard now, like a rifle's).
  - Attacks on another survivor jog in (they walked the last four metres).
  - The bunker's events make sound: the breach alarm, the blast door sealing, the radio's static, the call,
    a part or note found, the dead pushing a door, one of the dead getting up. All from the library; the
    wheel has no turning sound of its own yet (its first heave is the breaker's clunk).
  - FIDGETS: a calm survivor with nothing showing in the hand glances over a shoulder or coughs — the first
    4–9 s after settling, then every 9–22 s, seeded per body. Ended the moment they set off.
  - The 24-hour sim harness (test-sim.mjs) runs on the bunker now: 54 checks, Halcyon's scenario blocks
    kept for when Halcyon is the map.
  - A HAND ON THE DOOR: a shut door stopped the walk wherever the body met it, up to a metre off, and it was
    opened from there. They step up to it first (0.62 m from the door line), then reach. Every touch over a
    day now starts within 0.86 m (the 24 h harness, seed 9).
- **Round 6 (Nov 4):** measured, not eyeballed. An in-browser audit (every body on screen, every frame:
  planted feet sliding, bodies inside each other or a wall, pops, snap turns, bind poses) over 150 s of show,
  then the worst families fixed and measured again (on-screen slides 75‰ → 51‰, snap turns 9.6‰ → 0.6‰,
  pops 1.0‰ → 0.4‰):
  - THE UPPER BODY ALONE: an action while moving (a swing, a reload, a door shoved, a cough, a zombie's swipe)
    plays on the spine and up while the legs keep walking; one already playing when the body sets off goes over
    at the same frame. Played full-body it planted the feet and skated them (to 4 m/s).
  - THE ARMS OVER THE LEGS: weapon up and moving, the guard's upper body over the walk — a pipe or an axe
    stays in the hand through the footwork (READY had no walk that holds one, so it vanished for every step);
    a zombie attacking on the move swipes over walking legs.
  - Nothing fits the speed (a jog pose at a crawl): the loop that slides least, not the pose's own; a walk may
    now slow to 0.4× before it slides.
  - Turns no faster than a body turns (6.5 rad/s — a reversal started at 28).
  - Two bodies never drawn in one place: a pair stands its bodies where the bake did, and a second zombie stood
    inside the held survivor; standing bodies drawn closer than 0.52 m are eased apart (display only).
  - A grab, a bite or a pull-off plays only where its bodies stand on walkable floor with clear floor between
    them (it once put a held survivor half into a wall); otherwise the unpaired struggle.
  - The show's clock is steered, never stepped (a few ms of network jitter used to land in one frame).
- **Round 7 (Nov 4):** hands on the body, hands on the door.
  - HOW A BODY LIES (sim/lie.ts): every floor clip was played to its last frame on all six survivor bodies. The
    hips stay on the root in every one; only the head's direction differs, identically on every body: the fall
    129° round to one side, a death "from the front" forward onto the face, the plain death and the lying loop
    straight back. The sim assumed straight back for all of them, so a friend's CPR and the feeders knelt
    beside the floor. The sim now knows how each body lies (the fall when down; a survivor's own death clip,
    fixed per survivor, when they die on their feet; dying on the floor keeps the fall) and kneels a reviver
    side-on at the real chest — the CPR's hands measured 0.47 m ahead, 0.17 m to the left — and puts the feeders
    along the real body. Hands to chest: 0.17 m in the sim, 0.01–0.25 m on screen.
  - THE CONTACT PASS (show/actors.ts): the last few tenths of a metre are done off the live bones — a reviver's
    hands, a feeder's mouth — at most 0.45 m and only onto walkable floor (a bigger correction would glide a
    kneeling body).
  - THE DOOR: the opening clip's hand reaches 0.33 m ahead and 0.43 m to the right. A body now opens a door from
    0.36 m off it, set along it so that hand lands on the leaf (the round-5 step-up stopped at 0.62 m — the hand
    closed on air). Measured reaches of the other hand clips: keycard 0.26, keypad 0.42, interact 0.51, chest
    0.44, rummaging 0.73, high files 0.39.
  - Found on the way: a downed survivor's turning collapse never counted as on guard (the stance rule returns
    early there); the census never counted the radio's part while it was hidden or once fitted; the 24 h harness
    picks its seed as the first of a few whose group is alive at the hour (any sim change re-rolls every run).
  - Down off a bed onto the floor beside it (a survivor downed in an infirmary bed lay inside its frame, where
    no friend could kneel to them: hands to chest went 0.89 m → 0.02 m median).
  - A stride stops with the body: a walk or run fading out to standing held its stride instead of striding on
    (the crossfade's warp even sped it) — the feet skated the last quarter second of every stop.
  - THE GROUND SPEED OF A LOOP is read off the ball of the foot when it has enough planted samples, else the
    heel: the ankle alone lifts and rolls forward over the toes in late stance, so it read UAL's sprint at
    3.4 m/s on two bodies (9 measured off the toes), the injured run 30% slow, the jog 15% slow — treadmills
    under all of them. anim-show-check.mjs runs the same estimator.
  - PATCHING A FRIEND UP, not CPR: a downed survivor is awake and bleeding, propped on their elbows (the fall's
    held pose), and the CPR clip's head went into their face. The revive is the kneeling first aid now
    (ual1-fixing-kneeling: hands 0.38 m ahead at knee height, the head well above the body); sim and show both
    place the hands by it.
  - The fall holds unless the body really moves: one that fell mid-stride still read over BAND.still as the fall
    ended and went into the lying loop — straight, not the pose the sim knows it lies in, so a friend knelt on
    its legs.
  - Beside a bed before lying down on it (from up to 1.5 m off, before).
  - THE FEEDERS' PLACES ARE ONE RULE (sim/lie.ts feedPlaces): the mouth — measured 0.40 m ahead of a feeder's root
    and 0.42 m to its right — on the chest, the hips, the thighs or the shins, from either side, never in a
    doorway; the sim stands them there and the show snaps each to the nearest free one off the real bones (the
    sim used to put the root 0.62 m beside the body, so the show's correction was always "too far" and never
    ran). Mouth to body: median 0.04 m (was 0.36), the show agreeing with the sim 79% of the time (was 6%).
  - A friend against a wall still gets knelt to: every way round the chest is tried before the old fallback
    (a revive reached 1.05 m; now 0.39 at worst).
  - The blast door can't shut on a body: the last turn of the crank waits while anything stands in the opening
    (one of the dead was sealed inside it).
- **Round 8 (Nov 4):** knees, and feet that stay put.
  - KNEELING WITHOUT BOBBING: ual1-fixing-kneeling (patching a friend up, working a sample) carries its own kneel-down
    (0–0.7 s) and stand-up (3.9–4.6 s); looped whole, anyone at it stood up and knelt again every 5.2 s. It loops its
    held stretch only, kneels in with its own first 0.7 s and stands back up with its own out (stance.ts LOOP_PARTS).
  - THE LOOPS' GROUND SPEEDS, MEASURED ON THE FLOOR (client/src/survivorz/show/loopspeed.json, made by
    scripts/survivorz/calib-loops.mjs): each survivor body driven down a straight line with the loop forced, a search
    for the natural speed that leaves the planted ball of the foot stillest. The estimate read off the bones was
    4–9% high on the walk, up to 23% on the jog and the sprint, 38% on the injured walk, 44% on the crouch — 89
    body × loop entries now. A straight walk's planted foot moves 1–6 cm a step (was 4–9), the jog 5–13 (was
    13–33), the sprint 4–8. The dead drag their feet, so a step never ends and they can't be measured this way:
    their loops keep the estimate.
  - NOBODY WALKS INTO THE LENS: a held shot only re-framed when its subject went too far or out of sight, so a
    survivor walking at the camera filled the frame and then stood inside it. Every frame now: the subject within
    1.4 m of the lens, or anybody within 0.6 m, is a cut to a fresh shot; the moving operator cuts away from anyone
    who walks into it. Measured over 200 s of show: the lens inside a body 5 frames in 11,907 (one zombie, a
    twelfth of a second, before the cut).
  - NOT INTO THE WALL: a body falling beside a wall or a desk laid its head and chest inside it. The sim knows how
    each body lies (sim/lie.ts — and now the dead's two deaths too, measured: back 147°, forward 29°), so a falling
    body turns, as little as it can, until its head and chest land on open floor (layHeading); and a downed survivor
    is no longer shoved about by everyone crowding them. Survivor bodies on the floor with head or chest in a wall,
    six seeds × 20 minutes: 10 of 116 → 0 of 34.
  - NOT IN EACH OTHER: two survivors downed side by side lay inside each other, and the downed are never pushed apart.
    A falling body now keeps 0.4 m from every point (hips, chest, head, thighs) of the bodies already on the floor —
    stepping up to 0.7 m aside first if it would fall onto one, then turning like it does for a wall. Overlapping
    pairs on the floor, six seeds × 20 minutes: 0 of 82.
  - SOMEBODY IN THE WAY: a standing body on the line from the lens to the subject for 0.8 s re-takes the shot from a
    clean line (one such cut every 4 s at most — a crowd can block every spot). Over 200 s of show the view is blocked
    in 13% of frames, nearly all a passer-by crossing; 5 blocks last over a second.
  - TURNING ON THE SPOT: a standing body that turned spun on its heels — zombies came round 180° in half a second
    with their feet still, 38 times in 200 s. A turn of more than 57° for a survivor, 29° for a zombie (or a steady
    swing faster than 1.8 rad/s — the sim turns them gradually) now steps: its walk loop plays slowly under it and it
    turns at a body's pace, 3.2 rad/s a survivor, 2.2 a zombie (actors.ts TURN_STEP_*). Only poses that stand and
    would walk; never a worker, a sleeper, a pair. The packs' own turn clips don't serve: the zombie's turns one
    way only, 111° to the right, and the survivors' are the rifle packs'. Two-thirds of on-screen turns now step;
    the rest are feeders and pairs, whose bake owns the heading.
  - BODIES APART AT THE HIPS: the show eased bodies apart by their roots, but a zombie's walk leans and sways, so two
    crowding a doorway stood with their hips 0.39 m apart. Separation now measures the hips (their offset eased over
    0.8 s, so a stride's sway doesn't wobble the push), and a feeding zombie counts as an obstacle others are eased
    off, like a pair's bodies. Hip overlaps over 200 s: 565 samples → 275 (the rest are lunges, a frame or two).
  - TWO AUDIT MISREADS, fixed in the tool, not the show: a crouch on the balls of the feet lifts the ankle 0.2 m
    (carla's does) and read as floating; and the stride held still as a body stops (timeScale 0) is "not running"
    to three.js, so its weight was left out and read as the bind pose. Float and bind are both under 1‰ now.
  - FEET THAT STAY PUT (foot locking, actors.ts lockFeet): every slide the audit still found was a planted foot
    moving — a loop a few per cent off its speed, a body eased apart from a neighbour, a turn, an attack bake that
    pivots. After everything has moved a body this frame, a foot whose BALL is within 2.5 cm of its own floor is
    pinned where it landed and the leg is bent to keep it there (lib/ik.ts — the Backrooms' two-bone CCD, moved out
    to be shared), the foot's own angle kept; the ankle still rolls over the ball as the clip has it. It lets go as
    the foot lifts, or when the body has drifted 20 cm off it (8 cm turning on the spot — held longer, it splayed
    the legs as the hips came round). Never on the floor, kneeling, in a pair or on a ladder. Pinning the ankle
    first was WRONG and measured so: it held the heel through the roll-over and walks slipped 8-13 cm a step.
    With the ball: a survivor's walking step slips 1 cm (median), foot slide over the whole show 78‰ → ~10-24‰
    (the rest is the dead's dragging feet, which is how they walk).
  - MOVING OFF THE WAY IT FACES (actors.ts, the legs + twistSpine): the sim backs a fighter away from what it
    faces, steps it aside, shoves a zombie back out of a crowd — and the show played the forward walk under it,
    a moonwalk. Measured (a new audit check, the body's motion against where its legs point): ~45‰ of moving
    frames. Now the legs point the way the body really goes (its motion smoothed over a quarter second) and the
    spine and neck turn back toward the facing, at most 65° (the neck takes the most, so the head looks at the
    zombie and the chest less); past 110° off the facing it walks BACKWARDS — the same loop played in reverse,
    which reads as a back-step on every body and every gait — and keeps backing until under 80°, so backing away
    and then stepping aside doesn't swing the legs round. The legs are never held off the way the body goes to
    keep the chest on target: a first cut did, and a side-step slipped 26 cm a step; now the head is up to ~25°
    off the facing in a pure side-step instead. Staged (each survivor 5 m forward, 4 m backing, 3 m aside): step
    slip median 0.8 / 0.9 / 2.3 cm. Whole show ~45‰ → ~7‰. Within ~30° of the facing the legs just follow the
    facing (blended to the motion by ~50°): the smoothed motion trails a quick turn, and Rick's legs ran 100°
    behind his chest round a corner. In the show: a walking step slips 0.7 cm median (385 steps, p90 5 cm).
  - WALKING ON THE SPOT (actors.ts gait): a body jostled in a crowd, or a fighter shuffling in and out, went back
    and forth each tick — the segments read 0.4 m/s, the body stayed put, the walk played. The loop now matches
    no more than how far the body really gets.
  - THREE AT A DOOR (actors.ts separate): the bodies-apart nudge was one pass; three bunched together pushed the
    middle one from both sides, the pushes cancelled, and the outer two moved out half the way (Johanna stood
    inside Sarah for six seconds). Relaxed over four passes: overlap 49‰ → ~1‰ on the same footage.
  - THE LENS IN A ZOMBIE'S HEAD (direct.ts intoLens): the guard against a body at the lens measured feet on the
    floor; a zombie leaning into a lunge has its head half a metre ahead of its feet, and walked into the lens for
    3.5 s with its feet never inside 0.6 m. The guard now also measures the head, chest and hips against the
    camera itself (0.55 m), on the tripod and the operator alike. Lens inside a body 215 frames → 0; nearer than
    a metre 988 → 175.
  - IN THE WAY, PROPERLY (direct.ts blocked): a zombie fighting right beside the subject counted as "in the way"
    and used up the re-takes, so a body halfway to the lens stood there four seconds. Only the camera's side of
    the line counts now (the first 65% of it); and a re-take that lands on another blocked spot (a crowd round a
    body on the floor) doubles the wait for the next, from 2.5 s up to 20 s, reset when the director picks a shot
    itself — the first cut without that re-took every 2.5 s, blocked every time.
  - THE CRANE + A CROWDED LENS (shots.ts bodyShot, direct.ts poseFor / crowdCheck): when everyone ended down in one
    corner with the dead standing round them, the camera looked through their legs for the rest of the show — the
    fallback for "no clean angle" ignored the other bodies altogether. Now: a clean shot, else a clean wide, else
    one with nobody AT the lens, and only then none; and a body on the floor gets THE CRANE first, 2.65 m up and
    ~2 m out, looking down over the heads onto them (every room is 3 m or more). A shot that crowds in after it was
    taken — somebody within a metre of the lens for 1.5 s — is re-taken on the same backing-off clock. On the
    footage of a massacre: blocked frames 1,709 → 469, a body within a metre of the lens 1,177 → 296 frames.
  - THE FOLLOW CAMERA IN A LINE (direct.ts operatorSpot): a group walking in single file blocked every spot the
    operator tried behind and ahead, and it fell back to one that ignored everybody. It now tries side-on too
    (the tracking shot), then the same spots raised to 2.6 m over the heads (nobody at the lens), before giving
    up on the others. Blocked follow frames ~435 → ~25 a 200 s run.
  - TURNING BACK ON ITSELF (sim/world.ts walk + paceCap; actors.ts the back-step + TURN_STAND): a body whose route
    doubled back kept its speed in the new direction — a runner reversed at a run for a third of a second — and the
    show played a back-step under it and then whipped the legs round 180°. A route more than ~115° off where the
    body faces now nearly stops it, and it turns round first (the speed it had doesn't carry into the reversal).
    The show's turn on the spot was half the sim's rate, so the sim set off while the drawn body was still half way
    round, and that read as a back-step too: it turns at 5 rad/s now (zombies 3.2), and a back-step needs the SIM's
    facing off the motion as well (only the deliberate step back from a fight, never a facing that lags a turn).
    Legs-off-the-motion frames on the same seed 22.4‰ → 12.0‰; what's left is fight footwork, where the sim
    shuffles a fighter in and out several times a second.
  - FEET THAT STEP, NOT SKATE (actors.ts lockFeet, round 12): a planted foot the body drifted 20 cm off while it was
    still on the floor (a speed a little off the loop's, a reversal, a fighter's footwork over a stance that never
    lifts a foot) was let go and slid to where the clip had it in an eighth of a second — a skate. It is STEPPED there
    now: up in a small arc (at most 7 cm) and down over 0.2 s, one foot at a time. And a body that has stood still a
    third of a second SETTLES: a foot more than 6 cm off where the standing loop wants it steps back under (it used
    to be held up to 20 cm out for as long as the body stood). Measured on a fixed course (scratchpad course.js:
    three runners, four laps of starts, stops, reversals, backing off, side-steps, a jog corner and turns on the
    spot, driven the way the sim drives a body) against the code before: planted-foot slide 1.92 → 1.53 per
    body-second; setting off 2.2 → 0.5, walking 3.3 → 1.9, reversing 3.3 → 1.9. TURNING ON THE SPOT no longer plays
    the walk slowly under the turn: the standing loop plays on and the feet step round on the lock (one at a time),
    so a fighter keeps their stance through it and a zombie shuffles round. Slide while turning 6.4 → 4.2.
    Tried and dropped the same round: letting a slowing loop crawl below 40% of its speed (a stopping body froze
    mid-stride with a leg in the air), faster heading and leg easing (no change measured), and reading the loop's
    speed off a fast motion vector after a reversal (legs chased the sim's jitter). The audit's "held thing far
    from the hand" was measuring the prop's middle against a stale matrix: held props are in the hand.
    THE PISTOL WALK'S SPEED was 23% low in loopspeed.json (the browser calibration's 1.7-2.1 m/s): its planted
    foot travels back at ~2.7 m/s (scratchpad stride.mjs, stance-phase travel ÷ time), and the headless measure
    (loop-speeds.mjs) agrees on all six bodies at 2.4-2.66 — a pistol-holder's walk was played too fast for the
    ground. The rest of the table agrees with the headless numbers within ~5% (the sprints within ~10%).
  - A REAL JOG (Nov 7): Mixamo's Jogging (originals/mixamo/Jogging.fbx → src/mixamo/jogging.glb, "mx-jogging")
    is on every survivor body. Its own speed is 1.56-1.78 m/s (loop-speeds and stride.mjs agree), so it fits
    ~0.7-2.9 m/s: the winded, hurt, low-morale or careful jog (the sim's jog is SPEED.jog 3.2 × those). The fresh
    3.2 m/s jog is past what it can play without frantic feet, so the jog row tries it FIRST and the UAL run
    second (`also` in stance.ts — fits() picks). A gun or a torch keeps its own moving loops (the jog shows
    nothing in the hands). Four bodies' right arms cut 4.7-8.7 cm into the torso on it; the law pass lifts
    them 6-8°.
  - THE JOG BECOMES A RUN (Nov 8): Mixamo's Slow Run ("mx-slow-run") is on every survivor body, own speed
    2.78-2.97 m/s (Nathan's and Sophia's searches were too noisy to keep; the show's estimate, 2.79 and 2.54,
    stands for them). The jog row is now JOG, SLOW, RUN, and the jog hands over at JOG_TOP (1.4× its own speed,
    ~2.4 m/s) when the body has the Slow Run — the jog-to-run change a person makes, instead of a jog's legs
    spun at 1.7×. The fresh 3.2 m/s jog now plays at ~1.1× its true pace; UAL's run is only for a body baked
    before. Passes the no-clipping law on all eight bodies untouched. Guns and torches keep their own loops.
    The creator's bake carries the new clip with no change (the manifest lists the whole Mixamo shelf).
    NB: show bodies are NOT in git — after a repack, copy game/<body>.glb to the server's
    /opt/solace/assets/downloads/survivorz/game/ (prod was still on Oct 27-28 bodies until Nov 7).
  - A GUARD LOOKS (Nov 8, actors.ts lookAround): on live runs (seed 31) survivors stood on guard — alert, a pipe or
    knife up, or crouched in hiding — stock-still for 12-76 s at a stretch while the dead were 5-18 m off: the calm
    idle's fidgets (glances, a cough) can't hold a weapon, so a guard never got one. Now the upper spine, neck and
    head (0.2/0.35/0.45 of the turn) follow the nearest of the dead in their room (or within 6 m) up to 66° off the
    chest, with a glance round every 5-10 s while watching one (none inside 3.5 m); with none in sight they scan
    (a look one way every 2.5-6 s, held, back). A gun held up keeps its look within 20° of the sights. Measured
    over the same run: every guard stretch over 10 s now turns its head across 45-110°. Hands stay at least 24 cm
    from the head at full turn on every body (no clipping); the weapon doesn't move. (The headless speed search's
    misses on Nathan's and Sophia's Slow Run are its floor estimate creeping up 6 cm/s under a heel-first landing;
    removing the creep moved the walks 10-40% off the show's numbers, so it stays, and those two use the estimate.)
  - NO RUNNING BACK AND FORTH (Nov 8, the sim — survivor.ts decide, world.ts trimBehind): the legs-off-the-motion
    frames were mostly the SIM's doing. Counted headless (velocity reversing >120° between ticks, per second moving,
    four seeds × 15 min): fight 0.84, back off 0.85, flee 0.40, ordinary jobs 0.06. Two causes. (1) DITHERING —
    fight-or-back-off was a bare threat ≤ capacity line, and capacity falls with stamina while fighting and comes
    back while backing off, so on the line a survivor flipped every 0.3-0.7 s (Rollo, eleven reversals in eight
    seconds). A backer-off now goes back in only at 0.85 × capacity, and fight/back off/flee each stand 0.8 s
    before trading places — unless it's urgent (a friend grabbed, or blood low enough to run). (2) THE STEP BACK —
    a route starts at the middle of the cell the body stands in, often behind it; a fighter re-plans every half
    second and stepped back to it each time (0.2 m, the heading swung 70°). A survivor's new path drops that point
    when they're already past it. After: fight 0.36, back off 0.29, flee 0.25, jobs 0.02. Mean survivor deaths at
    15 min over 200 seeds 2.53 → 2.15. THE DEAD TOO (Josh, Nov 8: "smoother"): their step back cost them ground at
    every re-plan, so trimming it is a harder show — mean deaths at 15 min 3.21 over the same 200 seeds, he chose it.
    And NO OBJECTIVE WORK AFTER THE END: the world stops counting crank, repair and call progress once the show has
    ended (timeout at the hour), but the jobs stayed legal — a survivor mid-repair at the hour stood at the set for
    the rest of the day with the group guarding them (test-sim's day run, seed 13). test-sim's needs check
    (40) now asks the loop, not the larder: a group that all lives the day can search the bunker bare, and the
    water left is in friends' packs, which only the model hands over.
  - ROUND 14 (Nov 9 — Josh: "survivor shoulders are arched back especially when they run", "everytime dale went to
    fire his rifle it kept resetting positioning", "why is this zombies head so shiny", "footsteps are super loud"):
    THE SHOULDERS COME DOWN (scripts/survivorz/anim-shoulders.mjs, the bake's "shoulders" step after the retarget):
    every UAL clip (ual1-/ual2- and all built on them — the idle, walk, jog, sprint, torch walk and run, the sword
    guard, the pistol set) hiked both shoulders 30-37° up round the ears: measured in spine_03's frame on Eric the
    upper arm's root sits 7.6-9.4 cm above the collarbone joint in every UAL clip, -3 to +3 in the Mixamo ones. The
    retarget copies bone DIRECTIONS and the UE mannequin's collarbones sit low in a broad back. Per body, one turn
    takes the UAL family's average collarbone to the Mixamo one and the upper arm is turned back by it at every
    moment, so the arms point where the clip had them; a clip's own shrug stays. A STANDING SHOT IS A KICK: the only
    rifle and shotgun shot clip is Mixamo's run-and-gun (hips 12 cm down, the feet swapping a stride) — standing in
    the aim, every shot dropped the body into it and snapped it back. Standing, the aim holds and actors.ts
    recoilStep kicks the chest back (~4° a rifle, ~9° a shotgun, 35 ms up, ~90 ms settling, a little to one side);
    moving, the run-and-gun still plays over the legs. ONE-SHOTS AGAINST THEIR STANCE (measured, start frame vs the
    loop under it): a jab or cross out of the guard stood the body up 11 cm; the calm glance over the shoulder was
    BUILT ON THE SPRINT (a body standing about broke into a sprinter's lean and stride for 2.6 s) — rebuilt on the
    idle; the axe chop dropped the hips 9 cm. Those play arms-only standing (stance.ts UPPER_ONLY); the shove, the
    stomp and the door blend in over 0.25-0.3 s (SLOW_IN). THE TORCH'S JOG: bd-flashlight-jog and -slow-run, built
    on Mixamo's two (the torch had only UAL's 5-7 m/s run, floating at half speed and moonwalking on the short
    bodies), and a CALM gun-carrier — the gun on the back — jogs like empty hands. The torch's lens glare is 0.3 m
    at most (it was 1.5 m face-on and blanked whoever stood behind it), and every footstep is 10 dB down
    (audio/rules.ts STEP_LEVEL — mastered 4 dB under the voices, a step's transient hit like a word).
  - INTO THE CHARACTER CREATOR (Josh, Nov 5: "make sure all this work gets put into the character creator baking
    process"): the run-time rules all read the show's bone names, which the intake gives every rig, so a baked
    body has them. The one per-body NUMBER — each walk's and run's own ground speed — now has a bake step
    (scripts/survivorz/loop-speeds.mjs, headless; CREATOR.md). Measured against the browser calibration on the
    hand-made bodies: walks within ~1%, runs 5-10% high, the pistol walk 22-29% high — and in plain playback the
    headless numbers hold the foot stiller (pistol walk 1.3 cm a step against 17), so the browser calibration may
    itself be off for those loops. The hand-made bodies keep the browser's (measured in the show, and the show's
    own numbers with them are good); settling which is right for runs is open.
- **The review round (Nov 12):** scored against docs/survivorz/RUBRIC.md (RUBRIC-2026-11-12.md), then the first fixes.
  - STRANGERS UNTIL THEY MEET: the prompts named the whole cast to everyone (Rick, alone, 12 s in: "Find Johanna,
    Dale, and the others"). A prompt now carries only the people that survivor has met (talk/minds.ts about, veil,
    sheetOf; talk/facts.ts); a line, goal or reason naming somebody unmet is refused.
  - PLANS HOLD: the pick is asked for before its reason; a room's search is one decision (TALK.ROOM_SEARCH_MS);
    captions paced (DECIDE_GAP_MS 45 s, DECIDE_ANY_GAP_MS, DECIDE_SAME_MS) and a repeated reason not shown; gifts
    don't bounce (sim/social.ts); goals looked at again when the thing is done (GOAL_MS 10 min, the objective
    events); a hider stays down 8 s (HIDE_CALM_MS).
  - A FOOTSTEP IS A FOOT COMING DOWN (show/footfall.ts, test_survivorz_footfall): heel or ball, as drawn, on the
    frame it lands; the room's own feet only.
  - A SOUND LANDS WITH WHAT YOU SEE (show/bridge.ts): the swing timed to the sim's blow (the event's `ms`), the
    stab and stomp joined at the strike, a zombie's scratch waiting for its arm, the box and the can at the hands,
    a fall's thud when the hips reach the floor (actors.ts onThud, the "body.fall" cue).
  - A SHOT IS A SHOT (show/director.ts; the review's camera item): by replay the median shot was 6 s and six in
    ten ran under 8 s. MIN_SHOT_MS now counts from the last change of PICTURE (not only of subject); WIDE_MS 8 s,
    HOLD_MS 20 s, TALK_CUT_MS 8 s (a line is what a cut waits for); a two-shot keeps its other body for its 8 s;
    anyone on the move gets the follow and a close whose subject walks off hands over once (WALKED_OFF_M) — the
    runner's 2.5 s re-takes on walkers went from ~25 a show to ~0; a second subject in a room on screen opens
    without a wide; MOMENT_W 3 (no close for a pickup); BIG_MIN_MS; a fresh big moment beats a fading one; a
    death's hold is absolute and counts from when the camera reached the body. After: median 8 s, chosen cuts
    under 8 s 0–1%, 5.5–6.2 cuts a minute (was 9.5–11.1).
  - A BODY HAS WEIGHT (sim/world.ts WEIGHT + weigh; the review's movement item, RUBRIC C2/C3): the job code set
    headings outright in ~20 places and started or stopped a body in one step (escorts every other step). What is
    sent is now held to TURN_MOVE 4 / TURN_STAND 5 rad/s and ACC 6 / DEC 8 m/s², with a carry when told to stand
    or to turn back; never through a wall, into a shut doorway or into anybody's space; a shove from the dead
    lands; a walker keeps its pace through one (losing it cost 6 points of wipes). walk() takes the same limits
    and slows for a shut door; the escort walks in step (escortStep), footwork eases. Read back by
    scripts/survivorz/review/move-probe.mjs and scripts/checks/test_survivorz_weight.mjs. p99 turn 401 → 229°/s,
    p99 speed change calm 25.6 → 8 m/s², in a fight 50 → 12. Outcomes over 1,000 shows: rescued 33 → 32%,
    wiped 51 → 55% (±3).
  - NOBODY SAYS SOMEBODY ELSE'S LINE (talk/lines.ts echoes; the review's item 6, RUBRIC E7): the repeats were the
    one shout everybody gives when grabbed and the one call everybody gives waking alone. A draft is read against
    what anybody said in the last TALK.ECHO_MS (20 min); an echo is sent back twice at most, shown only its own
    words; a line still close to somebody else's isn't said; a line said by another while this one was being
    written isn't said twice. RULES tells them to sound like themselves when grabbed, hurt or scared. One retry
    measured 21% → 13% on the real model; the second retry and the drop are unmeasured (the engine was paused).
  - THE CHECKS, THE SILENT ONES, THE FITS (the review's items 7–9; no GPU used): check-packed, test-genes and
    fx-check were each behind the code and now pass (the pair-clip rule, ten genes, the torch's 0.3 m flare, the
    rooms' mark budget). A character with no voice-sound set borrows one of the same register (audio/cues.ts
    vocalStandIn + standInRate; the cast's public row carries `vox`); item.found, keycard.found, survivor.give,
    survivor.steal and survivor.revived have cues. kit-fit.mjs / kit-stow.mjs fit any body by name, and the stow
    fitter moves an item out, then down, until it clears: swat-soldier (Renner) is fitted.
  - THE BAKE FITS WHAT A BODY CARRIES (Nov 12 2026): creator/bake.mjs "kit" (kit-fit.mjs + kit-stow.mjs --only <id>
    --out creator/<id>/kitfit.json) → worker POST /api/survivorz/worker/:id/kitfit → the shelf's kitfit.json →
    asset body/kitfit.json → kit.ts addKitFit (never over the page's kit-fit.json).
  - NOBODY STUCK, HANDS ON THE THING (Nov 12 2026, the review's C7 and C5): world.ts trimBehind keeps a route's
    first point unless the line from the body's own spot to the second is clear (clearLine, half 0 — survivors
    only; the dead as before); world.canReach(s, cell) is plan()'s question without its side effects, asked by
    the menu for a guard's place, a sweep and the armory; survivor.ts guardCell stays in the guarded one's room;
    goThenDo walks on to the standing spot while a thing to search is out of reach; SLAM_M = REACH_M.
    stats.jobFailAt + reach.overBy (bunker-sim.mjs --where). 1,000 shows each way: endings unchanged.
  - NOBODY INSIDE ANYBODY (Nov 12 2026, the review's C6): world.ts progress() — a first squeeze narrows two of the
    living's space to SQUEEZE_M (0.34) instead of switching it off (squeezeHard: only a second stall in a row, and
    the dead, go through); separate() marks a pair under INSIDE_M (0.45) nudgedAt and weigh lets that push land at
    up to NUDGE (1.6 m/s); sweepers get a cell each, formationSlot keeps off another escort's slotAt, crankHands
    counts a second cranker within 2.5 m. A follow-the-one-ahead pace rule was tried and removed (rescues 30 → 17%).
    Claudia's loop speeds are in show/loopspeed.json (loop-speeds.mjs, headless).
  - THE LOAD (Nov 13 2026, the review's H5: 12.8 s warm, about 20 s cold → 8.9 and 14.8): the dead wait for the
    picture (assetcache.ts holdLate / LATE_PRI: a priority-2 file being LOADED waits while the scene holds them, then
    takes turns three at a time; a prefetch into the store isn't held); a kept file of an earlier priority doesn't
    queue; a zone's props start with its shell (zones.ts load); the effects' sheets are asked for at once
    (fx/system.ts); KTX2_WORKERS up to eight. scene.loadLog (window.__szLoad, the Shift+D box) says what each stage
    took; scripts/survivorz/review/load-time.mjs times it in a real browser. Reach the page by 127.0.0.1.
  - THE DEAD GO LIMP (Nov 13 2026, watched): dying while down (propped on the hands: the fall, held) froze the
    body so. actors.ts freeze() lets the propped pose go for the lying loop's first frame, still, over SLUMP_S;
    world.ts dieSurvivor lies them LIE.lying. A PROPPED body is eaten at the legs (lie.ts FEED_ALONG_PROPPED;
    the sim by lie === LIE.fall, the show by the head's height over the floor, PROPPED_HEAD_M).
  - THE DEAD LIE FLAT, WHATEVER KILLED THEM (Nov 14 2026 — Josh: "when survivors die they need to be laying flat not
    leaning up on from floor"). Measured on all 19 survivor bodies (scripts/survivorz/review/lie-flat.mjs): lying flat
    (the lying loop, every death clip's last frame) the head is at most 0.15 m over the hips; propped on the hands (the
    fall a downed survivor is held in) 0.24 m or more. actors.ts PROPPED_LEAN_M (0.2) is the line. layFlat: once a dead
    survivor's death has played out it is looked at once and laid down if it's over the line (a reconnect's snapshot
    froze a body standing; a pair's pose; a clip stopped part-way). finishUnseen: a body the camera can't see isn't
    animated, so a death out of sight used to play when the camera came (the dead fell down again as the shot opened,
    and one of the dead settled unseen stood frozen in its last step): out of sight a death plays out at once. THE
    TURN's collapse is out cold (actors.ts limp, infection.ts LIE.lying): it sinks into the lying loop instead of
    sitting propped for its minute. findBoneLike takes the exact name and a bone first (soldier-blue's mesh group
    "Soldier_head" was read as its head). Someone DOWN and bleeding out is still propped on their hands: awake.
  - BOTH HANDS ON THE AXE (Nov 14 2026, looked at and measured on all 19 bodies). The chop is a one-handed recording
    with the axe out at the right arm's length; the left hand's grip beside the right was 1.3 to 1.6 left arm's
    lengths from the left shoulder in EVERY frame, so the left arm was locked straight the whole chop and its fist
    hung 6 to 22 cm off the handle (wrists 20-30 cm apart through the wind-up). anim-recipes.js heldFrame: the axe
    slides sideways in to the body's middle (up to 8 cm past it) until the left arm holds the handle with a bend in
    it, to the nearest 3 mm so it doesn't tick. After: wrists 8-16 cm apart all the way, 0 clipping on 19 of 19,
    the chop's out-of-range joints 2-7 a body down to 0-1. One recipe re-baked and re-packed per body
    (anim-build.cjs <body> "hd:axe:ual2-treechopping-loop", pack.mjs: 7 s + 10 s), the seven hand-made bodies copied
    to the server's game folder and the twelve creator bodies to its creator shelf.
    anim-natural.cjs <body> <substr> keeps the rest of natural.json (it used to wipe it); anim-floor-fix.mjs takes
    DRY=1 and ONLY=<regex>.
  - THE BITTEN SHOULDER: THE HAND COMES BACK TO HER OWN SIDE (Nov 14 2026 — Josh: "Yes, re-fit"). Sophia took the
    shoulder bite from 6 of 19 zombies, and re-baking the zombies' halves changed nothing. Read every 1/30 s against
    the zombie's real mesh, the fault was the survivor's half (anim-recipes.js bitten-shoulder): the reach's weight
    (the larger of the bite and the clamp) dipped to 0.6 as the bite ended and the whole hand sagged through the neck
    of the zombie letting go under it. The weight now holds at 1 and the path is a curve by way of a point in front
    of her own right shoulder (home), then to the wound. Kept on sophia (6 → 18), nathan (14 → 18), eric (17 → 19),
    claudia (15 → 17) and rollo; carla and manuel keep their old half and old zombie halves (the new measured no
    better: their fault is the zombie's gripping arm in the torso). Creator bodies get it at their next full bake.
    scripts/survivorz/bite-table.cjs re-measures a hand-made body's bites into finisher-fit.json (then pair-table.mjs).
    anim-pair.html r.bodies hands the two bodies to a check written outside the page. A RE-FIT OF ONE BODY: bake
    bitten-shoulder, pack the body, anim-clip + anim-natural on bd-bitten-shoulder, ZONLY='^zbite-shoulder$'
    anim-build.cjs --zpair "" <body> (SHARD=i/6, six at once: 2.5 min), pack the 19 zombies, bite-table, pair-table.
  - A BITE MUST REACH, AND THE SHOVE COMES AFTER THE TEETH (Nov 14 2026, second round — Josh: "Keep working"). On Carla
    16 of 19 zombies stood 40 cm off her shoulder for the whole bite and read clean because nothing touched: her
    shoving hand, up at 0.65 s, sat in front of the zombie's face and the head (kept off the hand) never passed it.
    anim-recipes.js bitten-shoulder: the reach comes in 0.65-1.0 s (as the bite lands) and rises by her own side
    (via the point in front of her right shoulder), then as before. zombieBite: biteHome (each elbow's swing looked for
    round the whole circle once, at the bite's middle; the frame's search starts there), biteGrip + gripAlt (the left
    hand takes the survivor's far side when its own place costs 2 cm of arm in a body), and the forearm kept off the
    survivor outside the bite. REACH (0.3 m, the zombie's head bone to the bitten place, 0.4-2.0 s) is part of
    bite-table.cjs and pair-sweep.cjs: a bite that doesn't get there is not offered. On the new recipe: carla 18,
    manuel 19, sophia 19, nathan 19, claudia 19 of 19. ERIC AND ROLLO KEEP THE FIRST ROUND'S CLIPS (their own half
    with the hand up early, their zombies fitted to it): the new measured 17 and 9 by the table's band reading (which
    over-reads Rollo's suit). MEASURE A BITE THREE WAYS before believing it: the table (band, 13 moments), every frame
    against the real mesh, and reach.
  - THE 12 CREATOR BODIES TOO (Nov 14 2026, third round): bitten-shoulder and the zombies' shoulder halves re-baked on
    every creator body, pack-pairclips + pair-sweep, and put on the server by hand (data/survivorz-creator: game/<body>.glb,
    pairclips/<body>/<zombie>.glb, pairs/<body>.json as { chains, bites, pull }; the server reads them per request).
    Shoulder bites that pass went from 5-17 to 13-19 of 19 on every body, none worse. Only Eric and Rollo still carry
    the first round's half.
  - THE GUN SITS WHERE THE FINGERS CLOSED (Nov 14 2026, the hands check run on all 19 bodies). The bake seats each gun
    in the hand's grip channel (anim-hands.js gunSeat) and wraps the fingers round it there, but the seat was only ever
    measured live by the bake and the bench: the GAME drew the gun on the fist's middle, 3-5 cm back through the hand,
    on every body. props/guns/cal.json now carries `seats` {hk416, pistol, shotgun: [along the fingers, toward the
    palm, thumb side] in metres} per body (anim-build.cjs --gun-cal, anim-build.html B.gunSeats: the very numbers the
    bake uses) and actors.ts afterPose adds it to the fist. A BODY WITH NO PISTOL CALIBRATION HOLDS IT ON AN OPEN
    HAND: pistolCal counted only moments with the fists within 15 cm, and a broad body's two-handed aim never is
    (16-19 cm on David, Leonard, Pete, the vanguard soldier: pistol null, the gun at the bare fist). It now falls back
    to the moments the hands are as near as the clip brings them. After a calibration changes: bake `gp:`, pack,
    anim-clip, ONLY='^gp-' anim-floor-fix, pack, then the measures. score-bodies.mjs "seat" says a body has both.
    A REPACK PACKS out/ AS IT IS: Pete's stored breaker and leg-bite clips had lost their floor fix, and a repack put
    them 3-5 cm into the floor; DRY=1 anim-floor-fix.mjs <body> after a repack says so. anim-hands.cjs writes
    hands-new.json (a built clip's findings its base recording lacks: what A6 counts).
  - EVERYTHING HELD SITS IN THE BODY'S OWN GRIP (Nov 15 2026). The bake holds a thing in the hand's measured grip
    channel (handRigid hold(r): cal.f along the fingers, the palm's skin + the thing's radius off the bone) and the game
    hung it at one fixed point for every body (7 cm, 2.2 cm): an axe, a crowbar, a torch, a bottle or a can sat 1-4 cm
    off the fingers that held it. cal.json now carries `grip` {l, r: {f, p, u, r}} per body (--gun-cal writes it) and
    actors.ts holdPoint places the held thing and a clip's prop by it (stance.ts holdRadius, CLIP_PROPS `r`).
  - THREE HANDS REDRAWN, each looked at close on six bodies and measured on all 19 (bd-hold-door, bd-keycard, bd-keypad:
    0 hand findings on every body):
    HOLDING A DOOR is two FLAT PALMS (it was two fists, fingers 2.5 radii in the wood): relaxHand opens the fingers and
    spreads the thumb, the wrist stands off the door by the palm's own skin, the hand tips about the wrist until the
    fingertips' pads lie on it and rolls until the thumb is clear (kept from frame to frame, h.doorRoll). The blow
    lands over three frames (doorBang's rise 0.1 s): inside one frame it was a pop to the bake's clean-up, which
    smoothed the spine after the hands were placed.
    THE KEYCARD IS PINCHED LIKE A KEY (it lay through the middle of a closed fist): on the thumb's side of the index
    finger's first bone, the fist palm down so the card stands on its edge for the slot, the thumb lifted at its base
    onto the card's face. Placed off the finger's own bones (anim-recipes.js cardPose; the show the same way,
    CLIP_PROPS `pinch`), the wrist found from where the card really is.
    THE KEYPAD IS PRESSED WITH A POINTING FINGER (it was the knuckles of a fist): tipTo(..., point) opens the fingers
    before making the fist, so "the index a little curled" starts from straight, not from the idle's half fist.
    relaxHand blends the thumb in with the rest (its extra curl arrived whole on the first frame of an ease-in).
    A QUICK LOOK AT A FRESH BAKE: anim-render.html r.addClip(json) plays out/<body>/<clip>.json without a repack.
  - STAND UP STRAIGHT (Nov 17 2026 — Josh: "when survivors are moving they are hunched over"). review/posture.mjs measures
    each moving clip's trunk lean (hips → neck) and head drop (neck → head, past the trunk) against the same body standing.
    anim-posture.mjs caps them (POSTURE: jog 8°, slow run 9°, run 10°, sprint 15°, head 4° past the trunk; gun clips head
    only) with ONE constant turn per clip, so the stride keeps its motion. Two things it learned: the hips-to-neck line
    answers only about HALF a turn made at the spine's own joints, so the turn is found by bisection, not assumed; and
    THREE'S PLAYER DOESN'T RE-APPLY A TRACK THAT NEVER CHANGES (the sprint's spine_01 holds one value), so a turn left on
    a bone between moments piles up — every turn is undone before the next moment is posed. It runs after the build and
    before the pack (creator bake step "posture"); on a hand-made body, re-run it after any rebuild of these clips
    (anim-build.cjs <body> gr:/gs:/gp:/flashlight-*), then pack.
