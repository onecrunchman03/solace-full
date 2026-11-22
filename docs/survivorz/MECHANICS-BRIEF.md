# SURVIVORZ — the mechanics brief, for checking assets against

Josh and Claude settled the show's game mechanics on 2026-10-22/23. The full
rules are in `SURVIVORZ.md` (§3 the facility, §5 survival, §6 death and
newcomers, §7 genes, relationships and bonds, §7b skills, §8 combat and
equipment, §9 the zombies, §12 the admin panel). This brief lists **every
moment the mechanics put on screen**, so each asset session can check whether
what we have supports it and list what's missing.

**How to use it:** go down your section, mark each line **have** (name the clip,
effect or model), **close** (have something that needs work) or **gap**, and
add anything the mechanics imply that isn't listed. The animation laws and the
quality bar apply to everything.

## Animations: survivors

**Reflexes and fear**
- fight, back off (retreat while facing the threat), hide (crouch still, light off), run
- **panic:** freeze in place; bolt the wrong way (the agony move is the start)
- startled flinch

**Needs and rest**
- eating a can, a ration pack, an energy bar; drinking from a bottle
- **refilling a bottle at a sink**
- getting into and out of a safe-room bed; sleeping; a couple sharing a bed
- **dozing off on watch** (seated or standing, nodding, jolting awake)
- **collapse from exhaustion** (asleep where they stand, a fall)
- sitting on the floor against a wall (watch, grief)

**Health**
- limp (leg wound); arm-wound carry and shooting
- bandaging self and another; injecting; taking pills
- downed: the injured crawl; **firing a pistol while downed**
- **the revive:** kneel beside a downed ally (~8 s)
- **dragging a downed ally**, and the downed body being dragged
- infection: fever shivers, standing coughing fits, a confused stagger,
  **the collapse and the turn** (stands up as a zombie in their own body)

**Combat**
- melee wind-up, hit and recovery for each of: kitchen knife, pipe, hammer,
  crowbar (one-handed), fire axe (two-handed, sweeps two)
- the shove; **stomping or stabbing a zombie on the ground**
- pistol, shotgun (shell by shell), rifle (HK416): aim, fire, reload, while
  moving; a panicked rifle spray
- flashlight held with a pistol
- **dodging a runner's lunge** (a sidestep)
- grabbed: the struggle (finisher pack); **a knife stab to the head that ends a grab**
- **an ally pulling a zombie off someone**; an ally striking or shooting it
- **kicking free of a crawler's ankle grab**; tripped and falling
- bitten: neck, shoulder, forearm, leg
- **the finisher kill moves** (only for a real death)
- throwing a molotov, a noisemaker, a pipe bomb; lighting a molotov

**Work and the world**
- searching containers; **looting a body** (a dead friend's)
- keycard swipe, keypad, typing at a terminal, **reading paper notes**, playing an audio recording
- prying a door with a crowbar; breaking a door or barricade with the axe
- hammering planks; holding a door shut; building a reinforced barricade
- crafting at a standing workbench
- **throwing a breaker** in the Generator Hall; **arming the vault override**
- **taking a tissue sample** from a fresh zombie corpse (kneel, a kit)
- **working the Lazarus bench** (a long loop, ~2 h of play) and the analyser
- climbing into a vent, crawling through it, dropping out; a ladder
- climbing out of the maintenance shaft (the escape)
- walkie-talkie: talking, turning it down

**People**
- talking, arguing, yelling, laughing, shrugging (the casino gestures)
- **comforting** (a hand on the shoulder, sitting beside), a hug (built), crying, grief over a body
- **a fistfight:** shoves and punches between two survivors, and being pulled apart
- **a kiss**
- **the mercy kill** of an infected friend (pistol, or a blade) — handle with care
- the morning meeting: standing round, one person leading

## Animations: zombies

- idle states: standing and swaying, **slumped against a wall**, sitting dead (waking up from it)
- wander, investigate (searching), chase; runner bursts
- **the alarm moan** (drawing others)
- **banging on a door or barricade**; **smashing through glass** (experiments)
- experiments **opening an unlocked door**
- the grab and bite (finisher pack), the swipe
- the runner's lunge; the **crawler's ankle grab** from a vent or under a floor
- feeding on a body (and breaking off when someone comes near)
- knocked down and getting up; the stomp/stab reaction; deaths
- **burning** (a molotov)
- a turned survivor's first moments as a zombie

## Special effects

- blood: bites, scratches, gunshots, melee hits, the stomp; **a bleeding drip trail** until bandaged; pools under the dead
- **wound decals by location** (neck, shoulder, forearm, leg) and the grime layer building up
- **infection stages on the body:** sweat sheen, pallor, then **the skin blending to grey** at the turn
- the G-Strain tint on experiment zombies
- muzzle flash, casings, gun smoke
- **fire:** a molotov's ~8 s patch that can spread, blocking a doorway; burning zombies
- **the pipe bomb:** blast ~4 m, debris, dust, smoke
- **glass shattering** (lab doors, partitions)
- doors splintering, planks breaking off a barricade
- the director's tools: **a pipe bursting** (steam), something falling (dust), **lights flickering**, **a zone's power dipping** and coming back, sparks, the emergency lights
- flashlight beams with dust in them; a lit flashlight read from far off in the dark
- the vault opening (the 60 s countdown, the 90 s window) and shutting for good
- the sink running

## Models and props

- **three safe rooms**, each with **six beds, a sink, a workbench and a storage box**
- crafting parts: rags, bottles, a fuel can, wire, clips, an alarm clock, batteries, planks, nails, a metal sheet, lab chemicals, a pipe, duct tape
- the crafted items: bandage, noisemaker, lockpick, molotov, reinforced barricade, pipe bomb
- medical: med kits (~8), bandages, pills, antivirals (~10), **the sample kit**, **the cold case**, **the Lazarus doses**
- food and water: cans, ration packs, energy bars, water bottles; fresh food in the canteen fridges
- weapons: kitchen knife, pipe, hammer, crowbar, fire axe; pistol, shotgun, HK416; magazines, shells, ammo boxes
- flashlight + batteries (~40); walkie-talkies
- keycards (3 tiers); **the security chief's card clipped to a zombie**
- records: terminals, paper notes, clipboards, a diary, an audio recorder
- the Generator Hall's breakers; the vault override console; the Deep Lab's bench and analyser; the specimen cells; the quarantine cells
- breakable glass partitions and doors; barricade planks on doors
- the far tunnels and the maintenance shaft to the surface
- worn on the body: backpack (two sizes), sling, holster, belt, bandages on wounds

## Sound — CHECKED (2026-10-23, against the 113 approved sounds in `sound-list.mjs`)

**Have** (the approved set already covers it): footsteps on concrete, vinyl,
grating and water at walk/run/sneak, the vent crawl · every gun sound incl.
shell-by-shell, dry fire, casings, distant shots · melee swings, flesh hits,
bone, axe in wood, pipe on metal, stab, body fall, gore (the stomp: bone +
gore) · the zombie set: idle, **alert roar** (the alarm moan), chase, attack,
eat, death, **door banging**, claws, experiment idle and scream, the horde ·
the zone beds, fluorescent hum, drips, pipe creak, distant rumble · light
flicker, power on/off (a breaker clunk is in them), sparks · airlock, decon
shower, **vault open and close**, sliding/fire/slammed/forced/locked doors · PA
chime, klaxon and siren (the override countdown), keypad and card, terminal ·
the freight lift · hammering, plank drop and break, furniture drag (also a body
drag), can opening, zip, tape, syringe, pills, bandage, flashlight, walkie click
and static, rummage, **glass shatter**, cloth, pickup · the whole score and
stings.

**Close** (works for now; a dedicated sound would be better): a fistfight
(melee-hit-flesh) · the crowbar pry (door-forced) · tile floors in showers,
kitchens and the morgue (vinyl) · taking the tissue sample (syringe).

**Gap** (new sounds to make):
1. **Survivors' own voices:** coughing fits (the infection's cough is a game
   noise), pained breathing and groans, screams when grabbed or bitten,
   struggle grunts, panic breathing, sobbing, dying — six voices each. Chatterbox
   tags only cover laugh, chuckle, sigh, groan and gasp.
2. **Water:** a safe-room sink running; a bottle filling; drinking.
3. **Fire:** a molotov's bottle breaking and the whoosh as it catches, a
   crackling fire loop, a zombie burning; a lighter or match to light it.
4. **The pipe bomb:** fuse hiss, the blast, debris.
5. **The noisemaker:** the alarm clock ringing ~20 s.
6. **Glass under attack:** knocking and cracking before it gives way.
7. **The Lazarus bench and the analyser:** a loud lab-machine loop (it draws the
   dead) and the analyser's finish.
8. **The director's noises:** a pipe bursting (steam) and something heavy
   falling (a metal clatter).
9. **Safe-room fixtures:** the storage box lid, a fridge or the cold case
   opening, the workbench tinkering loop, lockpicking.
10. **Climbing:** ladder rungs and the maintenance shaft.
11. **Records:** paper notes handled, an audio recorder's play click.
12. **The facility's PA voice:** the recorded lines (lockdown, power restored,
    containment breach, override armed and its countdown, safety messages) — a
    designed voice, every line previewed by Josh.
13. **The researchers' audio logs:** their voices, recorded with the logs'
    writing (later, with the lore).
14. **Ending stings:** the truth found, the cure proven, the escape window
    opening, and a turning.

**Not needed any more:** `stove-ignite` and `stove-flame` (there's no cooking).
