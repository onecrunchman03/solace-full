# SURVIVORZ: the asset check against the mechanics brief

Checked 2026-10-23 against `docs/survivorz/MECHANICS-BRIEF.md`, line by line,
before anything is built. The inventory behind it is
`node scripts/survivorz/asset-inventory.mjs` (re-run it to refresh; `--find`
searches): **416 survivor clips and 84 zombie clips packed into the bodies, 113
approved sounds, 43 effect recipes, 20 gore pieces, 149 game models (26 bodies, 4 guns, 119 props), and 855
downloaded files** (models, textures, sounds) not yet processed.

**The marks**
- **have**: a packed asset does it (named). The survivors' built and Mixamo
  clips have been through the animation laws' checks (no clipping, the natural
  pass) and Josh's review. Two exceptions (the animation session, 2026-10-23):
  **the zombie clips have had only the joint check**, never the no-clipping
  law or the hand check; and **the gun sets are mid-rework** (the grip seat and
  support hand changed this week, a full rebake running), so their "have"
  stands but not as previously reviewed.
- **close**: something exists that needs work: a clip that needs a prop seated
  in the hand, a move assembled from clips we have, a model downloaded but not
  yet through intake, or a loose fit for the job.
- **gap**: nothing we have does it.

**How sure this is.** Clips and sounds were checked by name against the review
records, not re-watched. Downloaded models were matched by name only: none has
been opened, so every one of them is **close** at best until intake proves its
quality (the quality bar: §1 of ASSETS.md). Anything with a hand on an object
must pass the animation laws again once the object is seated.

---

## Animations: survivors

### Reflexes and fear
| Line | Mark | What we have |
|---|---|---|
| fight | **have** | the weapon sets (`gp-*`, `gr-*`, `gs-*`), punches (`mx-punching`, `ual1-punch-jab/cross`), melee (below) |
| back off, facing the threat | **have** armed / **close** unarmed | `gp-pistol-walk-backward`, `gr-walk-backward`, `gs-walk-backward`; unarmed only the limping `mx-male-injured-pack--injured-walk-backwards` |
| hide: crouch still, light off | **have** | `ual1-crouch-idle-loop`, `gr-idle-crouching` |
| run | **have** | `ual1-sprint-loop`, `ual1-jog-fwd-loop`, the weapon sprints; `bd-look-back-l/r` for the look over the shoulder |
| panic: freeze | **have** | `mx-terrified` |
| panic: bolt the wrong way | **close** | `mx-agony` into a sprint; the blend between them isn't built |
| startled flinch | **have** | `mx-startle-1`, `mx-startle-2` |

### Needs and rest
| Line | Mark | What we have |
|---|---|---|
| eating a can | **have** | `bd-can` (built, on the real can) |
| eating a ration pack, an energy bar | **close** | `ual2-consume` (generic); needs the bar/pack seated in the hand |
| drinking from a bottle | **close** | `ual2-consume`; needs the bottle seated and a drinking head tilt checked |
| refilling a bottle at a sink | **gap** | nothing; closest base `ual1-interact` at counter height |
| into / out of a safe-room bed | **have** | `mx-lying-down`, `ual2-laytoidle` |
| sleeping | **have** | `mx-laying-sleeping` |
| a couple sharing a bed | **gap** | a paired move (like the hug), not built |
| dozing off on watch (nod, jolt awake) | **gap** | `mx-sitting-idle` and `ual1-idle-loop` are the bases; the nod and the jolt aren't built |
| collapse from exhaustion | **close** | `mx-knocked-out`, `mx-falling-down`; needs to read as sleep, not a blow |
| sitting on the floor against a wall | **have** | `mx-sitting-idle` (on the floor) |

### Health
| Line | Mark | What we have |
|---|---|---|
| limp (leg wound) | **have** | the injured set: `mx-male-injured-pack--injured-walk/run/idle/turn-*` |
| arm wound: carrying it, shooting with it | **gap** | no one-arm-hanging carry or one-handed shooting |
| bandaging self | **have** | `bd-bandage` (sitting) |
| bandaging another | **close** | `bd-bandage` is self only; `ual1-fixing-kneeling` as a base |
| injecting | **have** | `bd-inject` |
| taking pills | **close** | `ual2-consume`; needs the bottle and a pill to the mouth |
| downed: the injured crawl | **have** | `mx-injured-crawling` |
| firing a pistol while downed | **gap** | nothing |
| the revive (kneel ~8 s) | **close** | `mx-kneeling-down`, `ual1-fixing-kneeling`, `mx-administering-cpr` / `mx-receiving-cpr`; the CPR reads as CPR and isn't fitted to a partner |
| dragging a downed ally | **have** dragger / **close** dragged | `bd-drag-body` drags a ragdoll; a downed person who is still alive (moving, holding on) isn't built |
| fever shivers | **have** | `bd-shiver` |
| standing coughing fits | **have** | `bd-cough` |
| a confused stagger | **close** | `mx-male-injured-pack--injured-stumble-idle`, `mx-stumble-backwards` (ends on the back) |
| the collapse and the turn | **close** | pieces only: `bd-cough` → `mx-knocked-out` → `mx-zombie-stand-up`, but the zombie stand-up and the zombie walks are packed on the **zombie** bodies only, not the seven survivor bodies |

### Combat
| Line | Mark | What we have |
|---|---|---|
| melee: kitchen knife | **close** | `mx-stabbing`; needs the knife seated |
| melee: pipe, hammer, crowbar (one-handed) | **close** | `ual2-sword-regular-a/b/c` + recoveries, `ual2-melee-hook`, `mx-standing-melee-attack-downward`; none seats a tool yet, and GAPS.md's worry stands: check they read as heavy tools, not a sword |
| melee: fire axe, two-handed, sweeps two | **close** | `mx-standing-melee-attack-horizontal`, `ual2-sword-heavy-combo`; needs the axe in both hands and a sweep wide enough to hit two |
| the shove | **have** | `mx-push` |
| stomping a zombie on the ground | **have** | `mx-stomp` |
| stabbing a zombie on the ground | **close** | `mx-standing-melee-attack-downward`, aimed low |
| pistol / shotgun / rifle: aim, fire, reload, moving | **have** | `gp-*` (27), `gs-*` (52), `gr-*` (55); `gr-mx-reload-*`, `gp-ual1-pistol-reload` |
| shotgun shell by shell | **have** | `bd-shotgun-load`, `bd-shotgun-pump` |
| a panicked rifle spray | **close** | `gr-mx-firing-rifle`; the wild sweep isn't built |
| flashlight held with a pistol | **gap** | `bd-flashlight-walk/run` hold the light alone; no two-handed light + pistol grip |
| dodging a runner's lunge (sidestep) | **gap** | nothing that reads as a sidestep (`ual1-roll` is a roll) |
| grabbed: the struggle | **have** | the finisher pack: `fz-front-struggle-*`, `fz-back-struggle-*` |
| a knife stab to the head that ends a grab | **gap** | the struggles end in `*-struggle-free` (a shove-off), not a stab |
| an ally pulling a zombie off someone | **gap** | not in any library (noted Oct 21) |
| an ally striking or shooting it | **have** | the ordinary attacks |
| kicking free of a crawler's ankle grab | **close** | `fz-lying-leg`, `fz-lying-leg-back` (the finisher's leg grab on a lying survivor), `mx-kicking` |
| tripped and falling | **have** | `mx-falling-down`, `fz-front-fall` |
| bitten: neck | **close** | the finisher bites + the zombie's `mx-zombie-neck-bite`; the victim's side isn't paired to it |
| bitten: shoulder, forearm, leg | **gap** | no location-specific bite pairs |
| the finisher kill moves | **have** | `fz-front-*`, `fz-back-*`, `fz-lying-*`, `fz-up-down-*` (27 pairs) |
| throwing a molotov, noisemaker, pipe bomb | **have** | `ual2-overhandthrow`, `mx-throw-object` |
| lighting a molotov | **have** | `bd-molotov` |

### Work and the world
| Line | Mark | What we have |
|---|---|---|
| searching containers | **have** | `mx-rummaging`, `ual2-chest-open`, `mx-searching-files-high`, `mx-looking-through-files-low` |
| looting a body | **close** | `mx-kneeling-down` + `mx-looking-through-files-low`; nothing aimed at a body |
| keycard swipe | **have** | `bd-keycard` |
| keypad | **have** | `bd-keypad` |
| typing at a terminal | **have** | `mx-typing` |
| reading paper notes | **gap** | nothing holds a page up to read |
| playing an audio recording | **close** | `ual2-idle-talkingphone-loop` as a base, needs the recorder |
| prying a door with a crowbar | **have** | `bd-crowbar` |
| breaking a door or barricade with the axe | **close** | `ual2-treechopping-loop` (a chop), needs the axe and a door height |
| hammering planks | **close** | `bd-hammer` drives nails into a board at hip height; planks across a door are at chest height |
| holding a door shut | **have** | `bd-hold-door` |
| building a reinforced barricade | **close** | `bd-hammer` + `ual1-push-loop` (dragging furniture) |
| crafting at a standing workbench | **close** | `mx-searching-files-high` (hands busy at a high surface), no tool in hand |
| throwing a breaker | **gap** | nothing pulls a lever; `ual1-interact` is the nearest base |
| arming the vault override | **close** | `bd-keypad`, `mx-typing` |
| taking a tissue sample (kneel, a kit) | **close** | `mx-kneeling-down`, `ual1-fixing-kneeling`; no kit in hand |
| working the Lazarus bench (long loop) and the analyser | **close** | `mx-typing`, `mx-searching-files-high`; a two-hour loop needs several varied lab actions so it doesn't loop visibly |
| climbing into a vent | **close** | `ual2-climbup-1m` at vent height |
| crawling through a vent | **have** | `mx-injured-crawling` (agreed Oct 21) |
| dropping out of a vent | **close** | `gr-jump-down`, `ual1-jump-land` |
| a ladder | **have** | `mx-climbing-ladder`, `mx-climbing-to-top` |
| climbing out of the maintenance shaft | **have** | `mx-climbing-ladder` + `mx-climbing-to-top` |
| walkie-talkie: talking | **have** | `ual2-idle-talkingphone-loop` (needs the walkie seated) |
| walkie-talkie: turning it down | **gap** | a small hand move, not built |

### People
| Line | Mark | What we have |
|---|---|---|
| talking, arguing, yelling, laughing, shrugging | **close** | the casino's 15 gestures are downloaded (`assets/downloads/gestures/`: Talking, Talking_2, Standing_Arguing ×2, Yelling, Laughing, Shrugging, Cheering, Disappointed, Fist_Pump, Salute, Sitting_Talking, Sitting_Laughing, Texting, Blow_A_Kiss) but baked only onto the casino's hazmat rig; on the survivors so far only `ual1-idle-talking-loop`, `ual1-sitting-talking-loop`, `ual2-yes`, `ual2-idle-no-loop`. **One bake run puts them on all seven bodies.** |
| comforting: a hand on the shoulder, sitting beside | **gap** | paired, not built |
| a hug | **have** | `bd-hug-over-*`, `bd-hug-under-*` (built per pair) |
| crying | **have** | `mx-crying` |
| grief over a body | **close** | `mx-kneeling-down` + `mx-crying` |
| a fistfight: shoves, punches, pulled apart | **close** | singles exist (`mx-punching`, `mx-right-hook`, `mx-uppercut`, `mx-elbow-punching`, `mx-push`, `mx-hit-reaction`); the two-body exchange and the pulling apart are a paired build |
| a kiss | **gap** | paired, not built |
| the mercy kill: pistol | **close** | `gp-ual1-pistol-aim-down` + fire, over a kneeling or lying friend |
| the mercy kill: blade | **gap** | nothing |
| the morning meeting | **close** | idles + the gestures above once they're baked |

## Animations: zombies

| Line | Mark | What we have |
|---|---|---|
| standing and swaying | **have** | `mx-zombie-idle`, `mx-zombie-idle-1`, `ual2-zombie-idle-loop` |
| slumped against a wall | **gap** | nothing |
| sitting dead, waking up from it | **close** | lying → `mx-zombie-stand-up`, `mx-zombie-stand-up-1`; nothing seated |
| wander | **have** | `hw-01..05-zombie-walk`, `mx-zombie-walk`, `mx-zombie-walking`, `ual2-zombie-walk-fwd-loop` |
| investigate (searching) | **close** | `mx-zombie-turn`, `mx-zombie-scratch-idle`; no searching/sniffing |
| chase, runner bursts | **have** | `mx-zombie-running` |
| the alarm moan | **have** | `mx-zombie-scream` (and `hw-06-werewolf-howl`) |
| banging on a door or barricade | **close** | ASSETS.md planned this from the Halloween attacks cut up (`hw-12/13-attack-01/02`); not cut yet |
| smashing through glass (experiments) | **close** | the same attacks at a pane |
| experiments opening an unlocked door | **close** | `mx-door-opening` exists for the survivors; it's Mixamo, so it retargets onto the zombie rig like the other shared clips |
| the grab and bite, the swipe | **have** | the finisher pack (zombie side), `mx-zombie-attack`, `mx-zombie-attack-1`, `mx-zombie-neck-bite`, `ual2-zombie-scratch` |
| the runner's lunge | **close** | `hw-14..17-monster-attack-*`; GAPS.md asked for them to be checked as a lunge |
| the crawler's ankle grab (vent, under a floor) | **gap** | `mx-zombie-crawl` moves; no grab from a crawl or out of an opening |
| feeding on a body | **have** | `mx-zombie-biting-ground` |
| breaking off feeding when someone comes | **close** | `mx-zombie-stand-up` from the feed; the transition isn't built |
| knocked down and getting up | **have** | `mx-knocked-down`, `mx-getting-up`, `mx-zombie-stand-up` |
| the stomp/stab reaction (on the ground) | **gap** | no hit reaction for a body already down |
| deaths | **have** | `mx-zombie-death`, `mx-zombie-dying`, the rifle-pack deaths, `ual1-death01` |
| burning | **gap** | no burning flail |
| a turned survivor's first moments | **close** | the zombie clips exist; they aren't packed on the seven survivor bodies (see the turn, above) |

## Special effects

| Line | Mark | What we have |
|---|---|---|
| blood: bites, scratches, gunshots, melee, the stomp | **close** | bites and gunshots are covered (F2 `bloodHit`, `bloodSpurt`, `spatter`, `dropSplat`, `bulletImpact`; F5's bite wound). Missing (effects session's own check): a scratch as three or four parallel claw lines (only a single cut or graze today), blood by weapon (blunt against blade, the axe throwing an arc), and a stomp |
| a bleeding drip trail until bandaged | **have** | `woundDrips`, `bloodTrail`, `bloodyFootprint` |
| pools under the dead | **have** | `bloodPool` |
| wound decals by location | **have** | F5's body layer paints wounds anywhere on the body (round, bite, cut, graze, bruise) |
| the grime layer building up | **have** | F5 `BodyLook.set({grime})` |
| infection: sweat sheen, pallor | **have** | F5 `set({sweat, infection})`: grey-green pallor, veins from the bite, a fevered sheen |
| the skin blending to grey at the turn | **close** | the infection's pallor at full strength; the moment of the turn (eyes, the last of the colour going) isn't its own step |
| the G-Strain tint on experiment zombies | **gap** | not built anywhere |
| muzzle flash, casings, gun smoke | **have** | F1: `muzzleFlash`, `ejectCasing`, `gunShot`, `smokePuff` |
| fire: a molotov's ~8 s patch | **have** | F3 `molotov` (burning floor) |
| fire that spreads and blocks a doorway | **close** | the burn length is already a setting; spreading further and a wall of flame across a doorway aren't built |
| burning zombies | **have** | `catchFire` |
| the pipe bomb: blast ~4 m, debris, dust, smoke | **have** | F3 `pipeBomb` |
| glass shattering | **have** | F6 `glassShatter` |
| doors splintering, planks breaking off | **have** | F6 `doorBurst`, `doorHit`, `plankBreak`, `plankNailed`, `playDoorEvent` |
| a pipe bursting (steam) | **close** | F4 `steam` is a steady leak; the burst itself isn't there |
| something falling (dust) | **close** | the dust sheets (`dust-impact`, `dust-ring`) exist; no "something fell" recipe |
| lights flickering | **have** | F4 `Fixtures.flicker` |
| a zone's power dipping and coming back | **close** | F4 `Fixtures.cut/strike` does a full cut and the return bank by bank; a short dip, distinct from a cut, isn't there |
| sparks; emergency lights | **close** | `sparks`, `sparkingWire` and the lockdown beacon are there; emergency lights that stay on when a zone's power is off aren't (a cut turns every fixture off) |
| flashlight beams with dust | **have** | F4 `BeamPool`, `beamDust` |
| a lit flashlight read from far off in the dark | **close** | the beam reads; a glow or flare at the lens for a distant camera isn't there |
| the vault opening (60 s countdown, 90 s window) and shutting for good | **close** | F7's `vault.open` (steam round the rim, dust); the countdown's lights and the shut aren't staged |
| the sink running | **gap** | no running water |

## Models and props

Every model below is PACKED (Oct 23): `assets/downloads/survivorz/props/<name>.glb`, real
metres, +Y up, standing on its footprint's middle, triangles cut to the tier in ASSETS.md §1,
textures shrunk and KTX2-compressed. `props/props.json` lists each one's size, triangles,
textures, source, licence and credit; `scripts/survivorz/pack-props.mjs` makes them from
`props-spec.mjs`, and `props-bench.mjs` renders each beside a 1.8 m figure (the contact
sheets are in `props/review/`). A **close** line needs something besides a model.

| Line | Mark | What we have |
|---|---|---|
| three safe rooms: 18 beds | **have** | `bunk-bed`, `hospital-bed`, `bed-frame` |
| a sink per safe room | **have** | `sink-basin`, `sink-steel` |
| a workbench per safe room | **have** | `workbench`, `tool-chest` |
| a storage box per safe room | **have** | `military-crate`, `locker`, `plastic-crate` |
| crafting parts: bottles, alarm clock, batteries, planks, nails, lab chemicals, pipe, duct tape | **have** | `glass-bottle`, `beer-bottle`, `alarm-clock`, `aa-battery`, `planks`, `nails`, `chemistry-set`, `flasks`, `lead-pipe`, `duct-tape` |
| crafting parts: rags, a fuel can, wire, clips, a metal sheet | **have** rags, fuel can, wire, sheet / **close** clips | `rags`, `jerrycan`, `wire-coil`, `metal-sheets`. Clips: still unclear which clips are meant |
| crafted: bandage, lockpick, molotov, pipe bomb | **have** | `bandage`, `lockpick`, `molotov`, `pipe-bomb` |
| crafted: noisemaker, reinforced barricade | **close** | the parts are packed (noisemaker: `alarm-clock`, `rusted-can`, `duct-tape`; barricade: `barricade-panels`, `barricade-planks`, `metal-sheets`); putting them together is the build's |
| med kits, bandages | **have** | `first-aid-kit`, `first-aid-kit-b`, `medical-box`, `bandage`, `bandage-box`, `medical-tape` |
| pills | **have** | `pill-bottle`, `pill-bottle-b`, `pill-blister`, `medicine-cabinet` |
| antivirals | **have** | `syringe`, `syringe-b`, `syringe-medical` |
| the sample kit, the cold case | **have** | kit: `sample-case`, `test-tubes`, `scalpels`, `medical-scissors`; cold case: `cold-case` |
| the Lazarus doses | **have** | `lazarus-vials`, `ampoule` |
| cans, energy bars, water bottles | **have** | `food-cans`, `russian-cans`, `rusted-can`, `granola-bar`, `chocolate-bar`, `water-bottle` |
| ration packs | **have** | `ration-pack` |
| fresh food in the canteen fridges | **have** | `fridge`, `kitchen-appliances`; food: `fruit-veg`, `bread-roll`, `apple` |
| kitchen knife | **have** | `chef-knife` (`fish-knife`, `machete` as alternates) |
| pipe, hammer, crowbar | **have** | `lead-pipe`, `claw-hammer`, `crowbar` |
| fire axe | **have** | `fire-axe-a`, `fire-axe-b`, `fire-axe-c` |
| pistol, shotgun, HK416 | **have** | `pistol.glb`, `shotgun.glb`, `hk416.glb` (seated per body) |
| magazines, shells, ammo boxes as pickups | **have** | `mag-rifle`, `mag-pistol`, `shotgun-shells`, `ammo-can`, `ammo-box-pistol` |
| flashlight + batteries | **have** | `flashlight`, `flashlight-tactical`, `aa-battery` |
| walkie-talkies | **have** | `walkie` |
| keycards, 3 tiers | **have** | `keycard-a`, `keycard-b`, `keycard-c` (yellow A, red B, green C, so the three tiers already read apart); `id-card` on a lanyard |
| the security chief's card clipped to a zombie | **close** | the card is packed (`id-card`, `keycard-c`); hanging it off a zombie's bone is the animation's |
| terminals | **have** | `terminal` |
| paper notes, clipboards, a diary | **have** | `notepads`, `file-folder`, `paper-debris`, `clipboard`, `clipboard-pen`, `notebook`, `binder` |
| an audio recorder | **have** | `cassette-player` |
| the Generator Hall's breakers | **have** | `electrical-panel`, `power-box` |
| the vault override console | **have** | `override-console` |
| the Deep Lab's bench and analyser | **have** | `microscope-industrial`, `microscope`, `microscope-lab`, `centrifuge` |
| the specimen cells, the quarantine cells | **have** specimen / **close** quarantine | specimen: `stasis-chamber`, `containment-cell`; quarantine and holding: `cell-door`, `cell-bars`, the rooms themselves are the facility build's |
| breakable glass partitions and doors | **have** | `glass-panel`; doors: `lab-door-single`, `lab-door-double` (leaves on their own nodes, to swing) and `lab-door-override` |
| barricade planks on doors | **have** | `planks`, `barricade-planks`; the effects already draw planks for barricades |
| the far tunnels, the maintenance shaft | **have** | `tunnel`, `metro-tunnel`, `vent-duct`, `ladder` |
| backpack (two sizes) | **have** | `backpack-small`, `backpack-large`, `radio-backpack` |
| holster | **have** | `holster` (the gun that came with it is cut) |
| sling, belt | **have** | `sling`, `belt` |
| bandages on wounds | **close** | F5 paints wounds; a bandage wrap drawn on the body is the effects' |

## Sound

| Line | Mark | What we have (approved set) |
|---|---|---|
| the alarm moan | **have** | `zombie-alert`, `zombie-exp-scream`, `zombie-horde` |
| glass breaking | **have** | `glass-break` (5) |
| a door splintering | **have** | `door-forced` |
| planks giving way | **have** | `plank-break` (3), `plank-drop` (5) |
| each survivor's coughing fits, pained breathing, screams | **close** | `vocal-<name>-cough`, `-pain`, `-scream` (plus hit, effort, struggle, panic, sob, dying) in each survivor's own ElevenLabs voice: generated Oct 23 in the mechanics session's batch8-voices, its review page being built for Josh |
| the fistfight | **close** | `melee-hit-flesh`, `body-fall`; no punch or grunt |
| the stomp | **close** | `melee-bone`, `body-gore` |
| the sweep of the axe | **have** | `melee-swing-heavy` |
| the sink running, a bottle filling | **have** | `sink-run`, `bottle-fill`, `drink`: approved (in `sound/final`, the mechanics round, Oct 23) |
| the breaker thrown | **close** | `breaker-throw` being added by the mechanics session (Oct 23), on the same review page as batch8 |
| a power dip and return | **have** | `power-off`, `power-on`, `light-flicker` |
| the override countdown alarm | **close** | `alarm-klaxon`, `alarm-siren`; no timed countdown |
| the vault's last shut | **have** | `vault-close` |
| the analyser and the Lazarus bench (loud) | **have** | `lab-machine` (loop), `analyser-done`: approved (in `sound/final`, the mechanics round, Oct 23) |
| walkie-talkie static and squelch | **have** | `walkie-static`, `walkie-click` (3) |
| the facility's PA lines and alarms | **have** alarms / **close** lines | `pa-chime`, the alarms; 24 Halcyon PA lines in the voice Josh picked: generated Oct 23 in the mechanics session's batch8-voices, its review page being built for Josh |
| fire crackle and spread | **have** | `fire-loop`, `molotov-break`, `lighter`, `zombie-burn`: approved (in `sound/final`, the mechanics round, Oct 23) |
| the pipe bomb | **have** | `fuse-hiss`, `pipebomb-blast`: approved (in `sound/final`, the mechanics round, Oct 23) |
| the maintenance shaft climb | **have** | `ladder`, `hatch-open`: approved (in `sound/final`, the mechanics round, Oct 23) |
| the tunnel's distant dead | **have** | `zombie-horde`, `rumble-distant`, `bed-tunnels` |

---

## What the mechanics imply that the brief doesn't list

**Animation**
1. **The zombie clips baked onto the seven survivor bodies** (Rollo's hazmat on
   Eric's rig is the seventh, added Oct 22), for the turn and a
   turned survivor's life after it (stand-up, walks, idle, attacks). Mixamo and
   Halloween clips retarget onto the survivors' rig as the rest did.
2. **A held seat per hand-held object**, measured per body the way the guns'
   `cal.json` is (the shape the gun work settled on: a grip channel, the hand
   wrapped to contact, nothing sinking into the object): knife, pipe, hammer, crowbar, fire axe, flashlight, walkie,
   bottle, can, bar, pill bottle, keycard, syringe, sample kit, paper,
   recorder, molotov, noisemaker, pipe bomb. The animation laws apply to each.
3. **The paired builds**: sharing a bed, comforting, a kiss, a fistfight and
   pulling apart, pulling a zombie off someone, a stab that ends a grab,
   location bites (shoulder, forearm, leg), the crawler's ankle grab.
4. **Carrying while hurt**: the leg-wound limp is there, but no limp with a
   weapon, and no arm wound at all.
5. **The zombie door-open**: retargeting `mx-door-opening` onto the zombie rig.

**Sound**
6. **Eating and drinking** (`can-open` is the can; no chewing or gulping).
7. **Paper rustling** for reading notes, and the **voices on the recordings**
   (the logs and the audio recorder need recorded lines, previewed by Josh).
8. **A burning zombie's scream.**
9. **The vault countdown** itself (a timed alarm or a PA voice counting down).
10. **Bed creaks, a zip of a sleeping bag**: small, but the nights are long and
    quiet, and every one of them is on camera.

**Effects and the body**
11. **Bandages drawn on the body** where a wound was dressed (§4 of SURVIVORZ.md
    calls for bandage props on the bones).
12. **The G-Strain tint** (listed), and the moment of the turn (listed as close).

From the effects session's own check (2026-10-23), carried here as notes:
- **A body layer for zombies**: no wounds or blood on zombie bodies yet, and
  §9's per-copy blood, grime and colour variety for repeated faces. It must fit
  in the effects' 4.4 MB of memory headroom (145.6 of 150 MB used).
- **Dismemberment knows only the zombie rig's bone names**, so a turned
  survivor can't be cut.
- **Burn marks on survivors.**
- **The lit molotov**: the rag burning in the hand and in flight.
- **A drag smear** that follows a downed body.
- **The reinforced barricade's look**, and how it breaks.
- **Flashlights dimming** as the batteries run down.
- **Persistence over four weeks: DECIDED** (Josh, 2026-10-23: "Keep it:
  severed limbs, debris, blood, scorch and wounds should persist for the whole
  show, including across a renderer restart"). Today limbs and debris sink after
  2-7 minutes and the rest is lost on a restart, so this is new work: the record
  kept on the server so a restarted renderer rebuilds it, and a memory cap that
  keeps everything (old marks baked into a room layer, resting pieces merged).
- **Resting gore pieces and debris can lie inside bodies**, which the animation
  laws forbid.

**Models**
13. **A facility computer terminal**, the override console, the specimen and
    quarantine cells and the tunnels are environment work; the facility build
    has to cover them or buy them.
14. **Ammo as pickups**: loose magazines, shells, ammo boxes.

---

## Totals

| Section | have | close | gap |
|---|---|---|---|
| Survivor animations (87 lines) | 37 | 34 | 16 |
| Zombie animations (20) | 8 | 8 | 4 |
| Effects (24) | 13 | 9 | 2 |
| Models and props (39) | 34 | 5 | 0 |
| Sound (20) | 14 | 6 | 0 |
| **All (190)** | **106** | **62** | **22** |

Counted with a line marked "have X / close Y" as close and "close X / gap Y" as
gap, the weaker of the two.

Corrected the same day with the animation and effects sessions' own checks (the revive, hammering, the blood, the director's tools; seven survivor bodies, not six).

The short version: **the effects are mostly done; most moves exist and need
props in hand or a paired build; every model is packed and game-ready (119 props), with five model lines
waiting on something besides a model; and every sound line is covered**: fire, the explosion, the sink, the machine and the climb are approved; the survivors' voices, the PA lines and the breaker throw are with the mechanics session for Josh's preview.
