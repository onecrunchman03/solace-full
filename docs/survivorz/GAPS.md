# SOLACE SURVIVORZ: the gap list

Josh, 2026-10-20: *"i dont want the cheap look of the backrooms maps i want
full assets for everything, i want good textures, assets, sound, animations
for every action so the show is very realistic and fascinating to watch. so
if we have a gap in either textures, assets, sound, or animations we need to
fix that. I expect high quality not good enough."*

This is the working list. An action in SURVIVORZ.md (§3, §5, §8, §9) without
a real animation, a real sound and real models is a gap. A gap gets filled.
It is never covered by a stand-in that "will do". **Done** = sourced or made,
put through intake, and looked at on the bench.

Status: ✅ have it · ⚠️ have something close that needs checking · ❌ gap

## 1. Animations: the survivors

| Action | Status | What we have / what's missing |
|---|---|---|
| Walk, run, sprint, strafe, crouch-walk, turn | ✅ | rifle pack + UAL locomotion |
| Pistol: walk, run, aim, shoot, reload, kneel | ✅ | pistol pack + UAL |
| Rifle: aim, fire, reload, kneel | ✅ | rifle pack + Mixamo |
| **Shotgun: pump, load shells one at a time** | ❌ | the gun animates itself, but there's no body clip for working a pump or feeding shells |
| **Flashlight carried while walking or running** | ❌ | only an idle torch loop; a light held out in the dark is the show's main look |
| Flashlight + pistol held together | ❌ | |
| **Two-handed melee: fire axe, pipe, crowbar swing** | ⚠️ | UAL sword combos and Mixamo melee; check they read as heavy tools, not swords |
| Knife stab | ✅ | stabbing |
| **Shove a zombie back** | ⚠️ | push / Push_Loop; needs a sharp one-shot |
| **Being grabbed and struggling free** | ❌ | needs a clip paired with the zombie's grab |
| **Pulling a zombie off an ally** | ❌ | paired |
| **Being bitten (neck/arm)** | ❌ | the zombie side exists (neck bite); the victim side doesn't |
| Hit reactions, falls, knockdowns, deaths | ✅ | Mixamo + rifle-pack deaths |
| Downed: crawling and bleeding out | ✅ | injured crawl, laying moaning |
| Revive a downed ally | ⚠️ | CPR exists; a kneel-and-bandage revive reads better |
| **Bandage self / bandage someone else** | ❌ | |
| **Injecting an antiviral** | ❌ | |
| Pills, eating, drinking | ✅ | Consume |
| **Opening a can, cooking on a camp stove** | ❌ | |
| Sleeping, laying, coughing, vomiting (lying down) | ✅ | the laying set |
| **Getting into and out of a bunk** | ❌ | |
| **Sitting on the floor, back to the wall** (night watch, grief) | ❌ | |
| Sitting in a chair, talking seated | ✅ | UAL sitting + the casino's seated gestures |
| **Infection while standing: fever shivers, a coughing fit, a stagger** | ❌ | the injured set covers stagger only |
| **Turning: the survivor becoming a zombie** | ❌ | the most important death on the show; needs its own clip |
| Searching: rummaging, files high/low, typing, chest open | ✅ | |
| **Keycard swipe, keypad entry** | ⚠️ | Interact + typing; a proper wall-height swipe and a keypad press |
| **Opening a heavy door / the vault wheel / prying a door with a crowbar** | ❌ | |
| **Barricading: hammering planks, dragging furniture, holding a door shut** | ❌ | Push_Loop for dragging; hammering and the door brace are missing |
| **Crafting at a workbench (standing)** | ❌ | Fixing_Kneeling is the kneeling version only |
| Throwing (molotov, noisemaker) | ✅ | OverhandThrow, throw-object |
| **Lighting a molotov** | ❌ | |
| **Climbing into a vent / crawling through it / dropping out** | ❌ | crawling-backwards and the injured crawl aren't a vent crawl |
| Climbing up a ledge or ladder | ⚠️ | ClimbUp_1m, climbing; check for a ladder |
| **Carrying a wounded person** (fireman carry) and **dragging a body** | ❌ | carrying-* is a box carry |
| Walkie-talkie | ✅ | phone-talk loop |
| Talking, arguing, laughing, yelling, shrugging, cheering | ✅ | the casino's 15 Mixamo gestures (FBX in assets/downloads/gestures), retargeted onto the RP rig |
| **Comforting / a hug, crying, grief over a body** | ❌ | |
| Terrified, startled | ⚠️ | terrified exists; a jump-scare flinch is missing |

## 2. Animations: the zombies

| Action | Status | What we have / what's missing |
|---|---|---|
| Shamble, walk variants, run, crawl, idle, scream | ✅ | the pack's own + Mixamo + Halloween walks |
| Attacks, hit reactions, deaths, getting up | ✅ | |
| Eating a corpse | ✅ | biting ground |
| **The grab (paired with the survivor's struggle)** | ❌ | |
| **Pounding on a door or barricade** | ❌ | |
| **A crawler grabbing an ankle from a vent or under a floor** | ❌ | |
| **A runner's lunge** | ⚠️ | check the Halloween attacks |
| **Climbing over an obstacle** | ❌ | |

Paired moves (grab, pull-off, bite) are made together, so the two bodies meet
at the same hands and the same frame.

## 3. Sound: almost all of it is a gap

None of the casino or Backrooms sounds fit a realistic biolab. Everything here
goes through ElevenLabs, and **Josh previews every sound before it's
committed**. Several takes each, so nothing repeats on screen.

- **Footsteps** per surface (lab vinyl, concrete, steel grating, tile, water,
  vent metal), per pace, plus shoes against boots.
- **Firearms:** pistol, shotgun, rifle (indoor, with the room's tail), dry
  fire, every reload step, shell casings landing, distant shots heard through
  walls.
- **Melee:** swings, flesh hits, bone, the axe in wood, a pipe on metal, a
  knife.
- **Zombies:** idle groans (two kinds: outside and experiment), alert
  screams, chasing breath, eating, a body hitting a door, nails on a
  barricade, dying.
- **The facility:** HVAC hum per zone, the generator hall, distant machinery,
  airlock cycles (hiss, seal, shower), the vault door, sliding lab doors,
  heavy fire doors, lights flickering and coming on zone by zone, the PA
  chime and alarms, keypad beeps, keycard accept and deny, terminal clicks,
  dripping and water in pipes, the MARTA tunnels' rumble.
- **Survival:** hammering planks, furniture dragging, a can opening, a
  camp-stove flame, a backpack zip, bandage tape, a syringe, coughing and
  pained breathing in each survivor's own voice (the cloned voices' tags
  where they work).
- **The broadcast:** a quiet music bed for nights and a sting for a death
  (only if Josh wants music at all).

## 4. Models and textures

| What | Status |
|---|---|
| The six survivors (Renderpeople scans) | ✅ |
| The 19 zombies | ✅ (1K textures; check up close and replace with 2K where the camera gets near) |
| Shotgun | ✅ |
| **Pistol, rifle, pipe, crowbar, fire axe, kitchen knife, hammer** | ❌ |
| **Flashlight, walkie, backpack (two sizes), holsters, keycards** | ❌ |
| **Medical: bandage roll, pill bottle, med kit, syringe/antiviral, the Lazarus vial** | ❌ |
| **Food and water: cans, energy bars, bottles, camp stove, purifier** | ❌ |
| **Crafted: noisemaker, molotov, pipe bomb, planks, duct tape** | ❌ |
| **The facility: every zone** | ❌: see §5 |
| **Grime layer + blood decals** (on bodies and on the world) | ❌ |
| **Wound and bandage props on the bones** | ❌ |

## 5. The facility itself

**Not the Backrooms' grid.** Those maps are boxes on a 2 m grid with one
tiling texture per wall, and that is the cheap look. The facility is built as
a real 3D set from a high-quality modular kit (or kits from one artist, so it
all matches):

- PBR textures at 2K up close (colour, normal, roughness, metal, AO), trim
  sheets for edges and skirting, and decals for stencils, signs, stains,
  scuffs, posters and blood. Nothing tiles where the camera can see it.
- Real geometry: door frames, ceiling grids with real fixtures and vents,
  pipes and cable trays, glass labs, a railing on every drop.
- **Baked lighting** (global illumination worked out offline in Blender and
  stored in lightmaps), plus a few real lights that change: the power coming
  back, flashlights, alarms, fire. Baked light is what makes it look real,
  and it costs the GPU almost nothing at run time, which matters beside the
  26B.
- Ambient occlusion, light haze and dust, and reflections on wet floors and
  glass.
- Set dressing in every room: the frozen-in-time clutter the references ask
  for (REFERENCES.md).

Zone by zone, the kit has to cover:

1. **Vault Lobby:** the blast door, reception, security desk, decontamination entry.
2. **Residential:** bunk rooms, canteen + kitchen, showers, rec room, stores.
3. **Research Labs:** clean labs, fume hoods, centrifuges, glass offices, the airlock → shower → suit room → lab sequence.
4. **Medical & Quarantine:** ward, operating room, quarantine cells, morgue.
5. **Security:** the armoury, cameras, control room, holding cells.
6. **Power & Maintenance:** the generator hall, boiler, pipe galleries, steel catwalks.
7. **Specimen Containment:** cryo tanks, observation glass, specimen cells.
8. **The Deep Lab** and the **MARTA-era tunnels.**

The engine keeps doing what it's good at: the server's world authority, AI,
pathfinding (a navigation mesh made from the set's floor), the director, the
spectator cameras, voice. Only how the world is built and drawn changes.
