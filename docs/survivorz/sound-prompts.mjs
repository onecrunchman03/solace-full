// SOLACE SURVIVORZ — THE PRODUCTION PROMPTS. Every sound in docs/survivorz/sound-list.mjs is
// made by ElevenLabs from a line here (Josh, Oct 20 2026: "we want to have uniformity with
// our sounds"; the blind test went 9-3 to ElevenLabs). scripts/survivorz/sound-eleven.mjs
// reads this; edit the words to retune a sound, never hunt for a file.
//
// UNIFORMITY IS WRITTEN IN, NOT HOPED FOR: everything in one family shares one description —
// one walker voice, one mutant voice, one pair of survivor boots, one facility — so a sound
// heard next to its neighbour sounds like the same world. Foley is asked for DRY (the game
// puts the room around it); gunshots keep their own short indoor slap, which is most of what
// makes a shot sound real.
//
// secs: length asked for (0.5-30). influence: 0-1, how literally the words are followed.
// seq: ask for several in a row and cut them into separate takes (keeps a set consistent and
//      costs a fraction of one generation per take). loop: a seamless loop. music: made by
//      the music model instead (secs up to 300). extra: how many more takes to make than the
//      list needs, so the bad ones can be thrown away (default half again).
import { LOGS, VOICE as LOG_VOICE } from "./audio-logs.mjs";

export const WALKER = "an adult human zombie, once a man, with rotted vocal cords: a wet, raspy, guttural throat, choked and bubbling, inhuman but still recognisably human";
export const MUTANT = "a mutated laboratory creature that was once human: an inhuman throat with clicking, wet rattling and a layered high and low voice, unsettling and alien";
const BOOTS = "a survivor's worn rubber-soled work boots";
const DRY = "close, dry recording, no reverb, no music";
const FOLEY = "realistic foley, close, dry, no reverb, no music, no voices";
const GUN = "realistic firearm recording, indoors in a concrete facility, no music";
const AMB = "a continuous seamless ambience inside an underground research facility, no voices, no music, no sudden events";
const SCORE = "instrumental only, no vocals, cinematic underscore for a tense survival documentary, slowly evolving, loops cleanly";

const PACE = { walk: "walking at an even pace", run: "running fast", sneak: "sneaking slowly and carefully, very quiet" };
const SURF = {
  concrete: "on a bare concrete floor",
  vinyl: "on a smooth vinyl laboratory floor",
  // round 2 (Josh: "needs to sound more like walking on metal, grates"): the first prompt
  // came back as dull floor steps with a faint ring
  grating: "on a hollow steel mesh grating catwalk: every step a loud metallic clang, the grating rattling and ringing under the boot like walking on industrial metal stairs",
  water: "through shallow water and puddles on concrete, splashing",
  // GLENRIDGE HALL's floors
  wood: "on old oak floorboards in a large quiet house: solid hollow wooden knocks, now and then a faint creak of a board",
  gravel: "on a wet gravel driveway in the rain: crunching, gritty steps",
  stone: "on a stone flagstone floor in a large hall: hard, slightly ringing steps",
  carpet: "on a thick wool carpet over floorboards: soft, dull, muffled thuds",
};
/** surfaces that only have a walk bucket (their pool is played at three paces) */
const WALK_ONLY = new Set(["wood", "gravel", "stone", "carpet"]);
const HOUSE = "a continuous seamless ambience, no voices, no music, no thunder, no sudden events";

// The saved ElevenLabs voices (2026-10-23): each survivor's picked design take, and Halcyon's PA.
export const SURVIVOR_VOICE = {"johanna":"plFL4pRrXax4286JlIdN","dale":"t5daDGUiKIoAatPLRu8u","ben":"oluvuR4uoREsAXpl44I4","rick":"q3MK3XcSjJvRFLxvzwzh","sarah":"XVOC5g2RtPNy9uG5fNhg","rollo":"yi733kuYYLGrZ9JvDrlS"};
export const PA_VOICE = "bQHgmiK4RaRT5G187AhI";

export const PROMPTS = {
  // ── GLENRIDGE HALL: the storm, the house, its doors and its secret ──
  "rain-out": { loop: true, secs: 30, prompt: `${HOUSE}: heavy steady rain at night heard out of doors, falling on gravel, grass and leaves, rain drumming and hissing all round` },
  "rain-in": { loop: true, secs: 30, prompt: `${HOUSE}: heavy rain heard from inside a large old house, rain beating on a slate roof and running down leaded window glass, muffled and steady` },
  "fire-crackle": { loop: true, secs: 30, prompt: `${HOUSE}: a log fire burning in a big stone fireplace, steady crackling and soft pops, a low roar of flame, close` },
  "thunder": { secs: 9, prompt: `a single close thunderclap in a rainstorm: a sharp crack, then a long rolling rumble that dies away, no music` },
  "thunder-far": { secs: 9, prompt: `distant thunder rolling across the sky far away: a long low rumble, no crack, fading out, no music` },
  "door-wood-open": { secs: 3, prompt: `a heavy old oak door in a mansion opened: the iron latch lifts with a clack and the door swings on its hinges with a low wooden creak, ${FOLEY}` },
  "door-wood-close": { secs: 2, prompt: `a heavy old oak door pushed shut: a solid deep wooden thud and the click of an iron latch, ${FOLEY}` },
  "door-wood-pound": { secs: 2, prompt: `fists pounding hard on a thick oak door from the other side: three heavy dull wooden thuds, the door shuddering in its frame, no voices, ${FOLEY}` },
  "door-bolt": { secs: 2, prompt: `a heavy iron door bolt slid home and locked: metal scraping on metal, then a firm clunk, ${FOLEY}` },
  "stone-grind": { secs: 6, prompt: `a massive stone slab in a floor sinking and sliding slowly aside: deep grinding of stone on stone, grit falling, a heavy final thud, ${FOLEY}` },
  "crest-set": { secs: 2, prompt: `a small heavy metal plaque pressed into a carved stone socket: a scrape, then a solid mechanical click as it seats, ${FOLEY}` },
  "house-creak": { seq: true, secs: 8, prompt: `an old timber house settling at night: separate slow creaks and ticks of floorboards and roof beams, each one on its own with silence between, ${FOLEY}` },
  "car-door": { secs: 2, prompt: `a 1960s car door opened and then pulled firmly shut: the latch clicks, the heavy steel door closes with a solid thunk, outdoors, ${FOLEY}` },
  "car-away": { secs: 11, prompt: `a 1960s V8 muscle car: the starter turns, the engine catches with a deep rumble, revs, and the car pulls away over gravel and drives off into the distance, no music` },
  // ── FOOTSTEPS (a run of steps, cut into single steps) ──
  ...Object.fromEntries(Object.entries(SURF).flatMap(([s, sd]) => Object.entries(PACE).filter(([p]) => p === "walk" || !WALK_ONLY.has(s)).map(([p, pd]) => [`step-${s}-${p}`,
    { seq: true, secs: p === "run" ? 4 : 6, influence: 0.6, prompt: `footsteps of one person in ${BOOTS} ${pd} ${sd}, each step clearly separate, ${DRY}`,
      // round 3: other ways of saying "metal" — Josh kept only a few of the first two rounds
      ...(s === "grating" ? { alts: [
        `footsteps of one person in heavy work boots ${pd} on steel diamond-plate stairs in a factory: loud metallic clanks that ring out after each step, each step clearly separate, ${DRY}`,
        `boots ${pd} across a perforated steel catwalk high above a drop: hollow ringing metal thuds, the loose mesh panels rattling under every step, each step clearly separate, ${DRY}`,
      ] } : {}) }]))),
  "step-vent-crawl": { seq: true, secs: 6, prompt: `a person crawling inside a narrow sheet-metal air duct: knees and hands thumping and bumping on thin metal, the duct flexing and booming, ${DRY}` },

  // ── FIREARMS ──
  // round 4: the heavy .45 wording is the only one Josh kept (2 of 2), so it leads now
  "gun-pistol-shot": { secs: 1.5, influence: 0.75, prompt: `one heavy .45 caliber handgun shot fired indoors, very loud and percussive, a sharp crack with real body and weight, short harsh room echo, ${GUN}`, oldPrompt: `one single Glock 17 9mm handgun shot fired inside a small concrete room, recorded 5 metres away: an instant sharp supersonic crack, a hard slap off the walls and a short boxy decay, no echo trail, ${GUN}`,
    // round 3: Josh kept none of the first two rounds' pistols
    round3Alts: [   // kept for the record; only the .45 one (now the prompt) earned keepers
      `a single loud 9mm pistol gunshot in an underground concrete corridor, close, punchy and powerful, a deep thump under the crack and a quick reflection off the walls, ${GUN}`,
      `one heavy .45 caliber handgun shot fired indoors, very loud and percussive, a sharp crack with real body and weight, short harsh room echo, ${GUN}`,
    ] },
  "gun-rifle-shot": { secs: 2, influence: 0.6, prompt: `a single AK-47 assault rifle gunshot fired indoors in a concrete hall, close, loud crack and short echo tail, ${GUN}` },
  "gun-shotgun-shot": { secs: 2.5, influence: 0.6, prompt: `a single 12 gauge pump shotgun blast fired indoors in a concrete room, close, deep boom and short echo tail, ${GUN}`,
    alts: [`one massive 12 gauge shotgun blast in a concrete stairwell, close, a thunderous boom that slaps off the walls and rolls away, ${GUN}`] },
  "gun-distant": { secs: 4, influence: 0.6, prompt: `a few gunshots heard from far away through the concrete walls of a facility, muffled thumps with long distant echoes, ${GUN}` },
  "gun-dryfire": { seq: true, secs: 3, influence: 0.7, prompt: `a pistol trigger pulled on an empty chamber three times: dry metallic clicks, no shots, ${FOLEY}` },
  "gun-pistol-mag-out": { secs: 1.2, influence: 0.7, prompt: `a pistol magazine release button pressed and the empty magazine sliding out of the grip, metallic, ${FOLEY}` },
  "gun-pistol-mag-in": { secs: 1.2, influence: 0.7, prompt: `a pistol magazine slid into the grip and seated with a firm click, metallic, ${FOLEY}` },
  "gun-pistol-slide": { secs: 1.2, influence: 0.6, prompt: `a semi-automatic pistol slide racked back and released, sharp metallic clack, ${FOLEY}` },
  "gun-rifle-mag": { secs: 2, influence: 0.65, prompt: `an assault rifle magazine pulled out and a fresh one inserted and slapped home, metallic, ${FOLEY}` },
  "gun-rifle-bolt": { secs: 1.2, influence: 0.65, prompt: `an assault rifle charging handle pulled back and released, heavy metallic clack, ${FOLEY}` },
  "gun-shotgun-pump": { secs: 1.2, influence: 0.65, prompt: `a pump-action shotgun racked back and forward, heavy ratcheting metallic slide, ${FOLEY}` },
  "gun-shotgun-load": { seq: true, secs: 4, influence: 0.65, prompt: `shotgun shells pushed one at a time into a pump shotgun's tube magazine, each shell a distinct click, ${FOLEY}` },
  "gun-casing": { seq: true, secs: 5, influence: 0.65, prompt: `spent brass bullet casings dropping one by one onto a concrete floor, bright tinkling bounces and rolls, ${FOLEY}` },

  // ── MELEE + BODIES ──
  "melee-swing-light": { seq: true, secs: 4, prompt: `fast swooshes of a knife swung through the air, separate swings, ${FOLEY}` },
  "melee-swing-heavy": { seq: true, secs: 4, prompt: `heavy whooshes of a fire axe or steel pipe swung hard through the air, separate swings, ${FOLEY}` },
  "melee-hit-flesh": { seq: true, secs: 4, prompt: `hard blunt hits landing on a human body: meaty, fleshy thuds, separate impacts, ${FOLEY}` },
  "melee-bone": { seq: true, secs: 4, prompt: `bones breaking and cracking: sharp wet snaps, separate breaks, gory, ${FOLEY}` },
  "melee-axe-wood": { seq: true, secs: 4, prompt: `an axe chopping hard into a wooden door, separate chops with splintering, ${FOLEY}` },
  "melee-pipe-metal": { seq: true, secs: 4, prompt: `a steel pipe striking a metal surface, separate ringing clangs, ${FOLEY}` },
  "melee-stab": { seq: true, secs: 4, prompt: `a knife stabbing into flesh and pulled out, wet and gory, separate stabs, ${FOLEY}` },
  "body-fall": { secs: 1.5, prompt: `a human body collapsing and falling heavily onto a concrete floor, a dull thud with clothing rustle, ${FOLEY}` },
  "body-gore": { seq: true, secs: 4, prompt: `wet gory flesh sounds: squelching, splattering and tearing meat, ${FOLEY}` },

  // ── ZOMBIES (one voice per creature) ──
  "zombie-idle": { secs: 4, prompt: `${WALKER}. It stands idle, groaning and moaning slowly, wheezing breaths between groans. ${DRY}` },
  "zombie-alert": { secs: 2, influence: 0.55, prompt: `${WALKER}. It sees a person and bursts into a sudden, loud, tearing roar-scream with a ragged gurgling throat, furious and hungry. ${DRY}` },
  "zombie-chase": { secs: 4, prompt: `${WALKER}. It runs after a person, snarling and growling with fast, heavy, gurgling breaths. ${DRY}` },
  "zombie-attack": { secs: 1.5, prompt: `${WALKER}. It lunges at a person with a short, violent attack snarl. ${DRY}` },
  "zombie-eat": { secs: 5, prompt: `${WALKER}. It crouches over a body feeding: wet tearing flesh, chewing, gnawing, low guttural grunts while it eats. ${DRY}` },
  "zombie-death": { secs: 2.5, prompt: `${WALKER}. It is killed: a choking death gurgle and a last rattling breath, then silence. ${DRY}` },
  "zombie-bang-door": { seq: true, secs: 5, prompt: `fists pounding and a body slamming against a heavy steel door from the other side, irregular desperate bangs, muffled, no voices` },
  "zombie-claw": { secs: 4, prompt: `fingernails clawing and scratching frantically at a steel door from the other side, scraping, no voices, ${DRY}` },
  "zombie-exp-idle": { secs: 4, influence: 0.55, prompt: `${MUTANT}. It stands still, breathing in slow wet rasps, a low throat growl with irregular clicks and a faint high whine under it. ${DRY}` },
  "zombie-exp-scream": { secs: 2.5, prompt: `${MUTANT}. It lets out a piercing, inhuman shriek. ${DRY}` },
  "zombie-horde": { loop: true, secs: 30, prompt: `a horde of dozens of zombies like ${WALKER}, groaning, moaning and snarling together, some near and many further away, continuous, no music` },

  // ── THE FACILITY: room tones (seamless loops) ──
  "bed-labs": { loop: true, secs: 30, prompt: `${AMB}: a laboratory, steady HVAC air handling, a soft equipment hum, a faint fridge compressor` },
  "bed-residential": { loop: true, secs: 30, prompt: `${AMB}: a quiet staff dormitory corridor, low air conditioning hum, very quiet` },
  "bed-medical": { loop: true, secs: 30, prompt: `${AMB}: a clinic and morgue, cold ventilation hum, the faint whir of medical refrigerators` },
  "bed-security": { loop: true, secs: 30, prompt: `${AMB}: a security control room, computer fans, server racks humming, faint electronic whine of monitors` },
  "bed-power": { loop: true, secs: 30, prompt: `${AMB}: the power plant level, heavy generators and turbines running steadily, deep mechanical drone` },
  "bed-containment": { loop: true, secs: 30, prompt: `${AMB}: a cold containment wing, cryogenic freezers humming and ticking, cold air hiss` },
  "bed-deeplab": { loop: true, secs: 30, prompt: `${AMB}: the deepest sealed laboratory far underground, a low rumble and a dark pressurised drone, distant creaks` },
  "bed-tunnels": { loop: true, secs: 30, prompt: `${AMB}: a long concrete service tunnel, moving air, a distant low rumble, faint water trickle` },
  "bed-generator-hall": { loop: true, secs: 30, prompt: `${AMB}: a huge generator hall, several big diesel generators running steadily, loud mechanical drone` },
  // round 2 (Josh: "way to high pitched hurts the ears"): a LOW mains hum, nothing above it
  "bed-fluorescent": { loop: true, secs: 20, prompt: `a soft, low 60 hertz electrical hum from old fluorescent light ballasts in a quiet room, deep and warm, no high-pitched whine, no hiss, no buzzing peaks, no music` },

  // ── THE FACILITY: events ──
  "light-flicker": { secs: 3, prompt: `an old fluorescent light tube flickering on and off with electrical buzzes and ticks, ${DRY}` },
  "power-on": { secs: 4, prompt: `a facility's power coming back on: a heavy breaker clunk, then machinery, fans and lights humming up to speed, no music` },
  "power-off": { secs: 4, prompt: `a facility's power failing: a heavy breaker clunk, machinery and fans winding down to silence, no music` },
  "spark": { seq: true, secs: 4, prompt: `electrical sparks and short-circuit zaps from a broken cable, separate crackling arcs, ${DRY}` },
  "pa-chime": { secs: 2.5, influence: 0.65, prompt: `an institutional public address two-tone chime before an announcement, through a slightly distorted ceiling speaker, no voice, no music` },
  "alarm-klaxon": { loop: true, secs: 10, prompt: `a facility alarm klaxon repeating a harsh two-tone warning blare, mechanical, no voices, no music` },
  "alarm-siren": { loop: true, secs: 15, prompt: `an evacuation siren wailing up and down steadily, heard inside a concrete facility, no voices, no music` },
  "keypad-press": { seq: true, secs: 4, prompt: `buttons pressed on a wall-mounted security keypad, each press a soft click and a short electronic beep, ${DRY}` },
  "keypad-accept": { secs: 1.5, influence: 0.65, prompt: `a security keypad access-granted double beep then an electronic door lock clicking open, ${DRY}` },
  "keypad-deny": { secs: 1.2, influence: 0.65, prompt: `a security keypad access-denied low error buzz, ${DRY}` },
  "card-accept": { secs: 1.5, influence: 0.65, prompt: `a keycard swiped on a wall reader, an accepted chirp and a lock releasing, ${DRY}` },
  "card-deny": { secs: 1.2, influence: 0.65, prompt: `a keycard swiped on a wall reader, a rejected error tone, ${DRY}` },
  "terminal-keys": { secs: 5, prompt: `someone typing quickly on an old mechanical computer keyboard, ${DRY}` },
  "terminal-boot": { secs: 5, prompt: `an old computer terminal powering on: a switch clunk, a CRT monitor whine, a fan spinning up and a hard drive seeking, no music` },
  "drip": { seq: true, secs: 6, prompt: `single water drops falling from a pipe into a puddle on concrete, separate drips, ${DRY}` },
  "pipe-creak": { secs: 5, prompt: `old metal pipes creaking, groaning and knocking under pressure inside a wall, ${DRY}` },
  "rumble-distant": { secs: 6, prompt: `a deep distant rumble far away in an underground facility, like a collapse or an explosion several levels away, no music` },
  "elevator": { secs: 20, prompt: `an old freight elevator: the gate clanging shut, the motor starting, cables humming as it moves, then a heavy stop and the gate opening, no music, no voices` },

  // ── DOORS ──
  "airlock-hiss": { secs: 2.5, prompt: `a pneumatic pressure release hiss from an airlock door seal, ${DRY}` },
  "airlock-seal": { secs: 2.5, prompt: `a heavy steel airlock door sealing shut: thick metal clunk, locking bolts slamming home, a short hiss, ${DRY}` },
  "decon-shower": { secs: 6, prompt: `a decontamination shower: pressurised water mist spraying from nozzles in a steel chamber, starting and stopping, no music` },
  "vault-open": { secs: 10, prompt: `a huge round steel vault door unlocking and swinging open: heavy bolts retracting, gears grinding, a slow massive metal groan, no music` },
  "vault-close": { secs: 8, prompt: `a huge steel vault door swinging shut and slamming closed, bolts locking, a deep metal boom, no music` },
  "door-slide": { secs: 2.5, prompt: `an automatic sliding laboratory door opening with a pneumatic whoosh and motor whir, ${DRY}` },
  "door-fire-open": { secs: 2, prompt: `a heavy steel fire door pushed open with its push bar clunking, hinges creaking, ${DRY}` },
  "door-fire-close": { secs: 2, prompt: `a heavy steel fire door swinging shut and latching with a solid metal clunk, ${DRY}` },
  "door-slam": { secs: 2, prompt: `a steel door slammed shut hard, a loud metal bang, ${DRY}` },
  "door-forced": { secs: 3, prompt: `a jammed metal door forced open with a crowbar: straining metal, a crack and the door banging open, ${DRY}` },
  "door-locked": { secs: 2, prompt: `someone trying a locked steel door: the handle rattling and the door shaking but not opening, ${DRY}` },

  // ── SURVIVAL FOLEY ──
  "hammer-nail": { seq: true, secs: 6, prompt: `a hammer driving nails into wooden planks, separate hammer strikes, ${FOLEY}` },
  "plank-drop": { seq: true, secs: 5, prompt: `wooden planks dropped one at a time onto a concrete floor, separate clattering drops, ${FOLEY}` },
  "plank-break": { seq: true, secs: 4, prompt: `wooden boards snapping and breaking, separate cracks, ${FOLEY}` },
  "furniture-drag": { secs: 4, prompt: `a heavy metal desk dragged across a concrete floor, screeching and scraping, ${FOLEY}` },
  "can-open": { secs: 3, prompt: `a tin of food opened with a hand-crank can opener, ${FOLEY}` },
  "stove-ignite": { secs: 2.5, prompt: `a small camping gas stove being lit: valve hiss, a piezo click and the burner catching with a soft whoomp, ${FOLEY}` },
  "stove-flame": { loop: true, secs: 15, prompt: `a small camping gas stove burner flame burning steadily, a soft roar, no music` },
  "zip": { seq: true, secs: 4, prompt: `a backpack zipper zipped and unzipped, separate zips, ${FOLEY}` },
  "tape": { seq: true, secs: 4, prompt: `duct tape pulled off the roll and torn, separate rips, ${FOLEY}` },
  "syringe": { secs: 2, prompt: `a syringe: the plastic cap popped off and the plunger pushed, a medical injection, ${FOLEY}` },
  "pills": { secs: 2, prompt: `pills rattling in a plastic pill bottle, the cap twisted open, ${FOLEY}` },
  "bandage": { secs: 3, prompt: `a cloth bandage torn and wrapped tightly around an arm, ${FOLEY}` },
  "flashlight": { seq: true, secs: 3, prompt: `a flashlight's rubber push button clicked on and off, separate clicks, ${FOLEY}` },
  "walkie-click": { seq: true, secs: 4, prompt: `a walkie-talkie push-to-talk key clicked, each with a short radio squelch burst, no voices, ${DRY}` },
  "walkie-static": { loop: true, secs: 10, prompt: `continuous walkie-talkie radio static and hiss, no voices, no music` },
  "rummage": { secs: 5, prompt: `rummaging through a metal desk drawer full of objects, searching, ${FOLEY}` },
  "glass-break": { seq: true, secs: 4, prompt: `a glass panel smashed and shattering onto a concrete floor, separate breaks, ${FOLEY}` },
  "cloth": { seq: true, secs: 4, prompt: `clothing rustle of a person moving in a canvas jacket, separate movements, ${FOLEY}` },
  "pickup": { seq: true, secs: 4, prompt: `small metal and plastic objects picked up off a table and put down, separate handling sounds, ${FOLEY}` },

  // ── THE MECHANICS ROUND (2026-10-23, MECHANICS-BRIEF.md: water, fire, the pipe bomb, the noisemaker,
  //    glass under attack, the Lazarus machines, the director's noises, safe-room fixtures, climbing,
  //    records, ending stings) ──
  "sink-run": { secs: 6, prompt: `a steel sink tap turned on, water running hard into a metal basin for a few seconds, then turned off, ${FOLEY}` },
  "bottle-fill": { secs: 5, prompt: `a plastic water bottle filled under a running tap, the pitch rising as it fills, ${FOLEY}` },
  "drink": { seq: true, secs: 4, prompt: `a person drinking water from a plastic bottle, separate gulps and swallows, the bottle crinkling, close, dry recording, no reverb, no music` },
  "lighter": { seq: true, secs: 4, prompt: `a metal petrol lighter flicked open and struck, the flame catching, separate lightings, ${FOLEY}` },
  "molotov-break": { secs: 3, prompt: `a molotov cocktail thrown onto a concrete floor: a glass bottle smashing and petrol bursting into flame with a big whoosh, ${DRY}` },
  "fire-loop": { loop: true, secs: 15, prompt: `a petrol fire burning on a concrete floor indoors, crackling and roaring steadily, no voices, no music` },
  "zombie-burn": { influence: 0.55, secs: 3, prompt: `${WALKER}. It is on fire and shrieks and howls in agony, flames crackling on it. ${DRY}` },
  "fuse-hiss": { secs: 4, prompt: `a short fuse lit and fizzing, hissing and sputtering as it burns down, ${DRY}` },
  "pipebomb-blast": { secs: 4, prompt: `a pipe bomb exploding inside a concrete corridor: a sharp violent blast, shrapnel and debris clattering down after, realistic, no music` },
  "alarm-clock": { loop: true, secs: 10, prompt: `an old mechanical twin-bell alarm clock ringing loudly and continuously, rattling on a hard floor, no music` },
  "glass-pound": { seq: true, secs: 5, prompt: `fists pounding hard on a thick laboratory glass window, the glass thudding and starting to crack, separate blows, ${DRY}` },
  "lab-machine": { loop: true, secs: 20, prompt: `loud laboratory machinery running hard: a high centrifuge whine, pumps and compressors, electronic beeps, loud enough to fill a room, no voices, no music` },
  "analyser-done": { influence: 0.65, secs: 3, prompt: `a laboratory analyser finishing a test: whirring down, a mechanical tray release and a soft electronic result chime, ${DRY}` },
  "pipe-burst": { secs: 5, prompt: `a pressurised steam pipe bursting in an industrial facility: a sharp metallic bang, then a loud jet of hissing steam, no voices, no music` },
  "metal-clatter": { seq: true, secs: 4, prompt: `heavy metal objects and tools falling onto a concrete floor and clattering, separate falls, ${DRY}` },
  "box-open": { seq: true, secs: 4, prompt: `a heavy steel storage trunk: latches snapped open, the lid creaking open and slammed shut, separate actions, ${FOLEY}` },
  "fridge-open": { seq: true, secs: 4, prompt: `a heavy refrigerator door pulled open with a seal pop and shut again, separate openings, ${FOLEY}` },
  "workbench": { loop: true, secs: 15, prompt: `someone working at a metal workbench: small tools, screws, wire and metal parts being handled and assembled, steady, ${FOLEY}` },
  "lockpick": { seq: true, secs: 5, prompt: `a lock being picked: a tension wrench and pick scraping and clicking inside a door lock, then the lock clicking open, separate attempts, ${FOLEY}` },
  "ladder": { seq: true, secs: 6, prompt: `a person in boots climbing a steel ladder, each rung a separate clang and hand grip, ${DRY}` },
  "hatch-open": { secs: 4, prompt: `a heavy rusted steel hatch heaved open overhead, grinding hinges and a clang as it falls back, ${DRY}` },
  "paper": { seq: true, secs: 4, prompt: `paper sheets and clipboard pages picked up, handled and turned, separate rustles, ${FOLEY}` },
  "recorder-play": { secs: 3, prompt: `a handheld cassette recorder: the play button pressed with a clunk and the tape starting to hiss, ${FOLEY}` },
  "breaker-throw": { seq: true, secs: 4, prompt: `a heavy industrial knife-switch breaker lever thrown by hand in a generator hall: a hard metal clunk and an electrical contact snap, separate throws, ${DRY}` },
  "sting-truth": { secs: 6, prompt: `a cinematic revelation stinger: a dark unsettling swell building into a low ominous hit, the truth revealed` },
  "sting-cure": { secs: 6, prompt: `a cinematic stinger of hope and breakthrough: a warm rising swell resolving into a bright, emotional chord, but still tense` },
  "sting-escape": { secs: 6, prompt: `an urgent cinematic riser: pulsing tension building fast toward a door opening, a race against time` },
  "sting-turn": { secs: 5, prompt: `a cinematic horror stinger: a slow dreadful dissonant swell into a grim tragic hit, someone has turned` },

  // ── THE SURVIVORS' OWN VOICES (eleven_v3 tags, wordless) + THE HALCYON PA (Josh picked design 3) ──
  "vocal-johanna-cough": { tts: { voice: SURVIVOR_VOICE.johanna, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[coughing fit] *cough* *cough* *cough* [coughs harshly] *cough cough* [wheezes]" },
  "vocal-johanna-pain": { tts: { voice: SURVIVOR_VOICE.johanna, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[pained breathing] hhh... hhh... [groans in pain] hhh..." },
  "vocal-johanna-hit": { tts: { voice: SURVIVOR_VOICE.johanna, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[grunts in pain] ugh!" },
  "vocal-johanna-effort": { tts: { voice: SURVIVOR_VOICE.johanna, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[grunts with effort] hngh!" },
  "vocal-johanna-scream": { tts: { voice: SURVIVOR_VOICE.johanna, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[screams in terror] AAAAAH!" },
  "vocal-johanna-struggle": { tts: { voice: SURVIVOR_VOICE.johanna, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[struggling, grunting] nngh! hngh! [strains hard]" },
  "vocal-johanna-panic": { tts: { voice: SURVIVOR_VOICE.johanna, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[terrified, hyperventilating] hhh-hhh-hhh... [frantic, ragged gasps for air] [whimpers in fear] nnh... hhh-hhh...", alts: ["[panicking, can't catch their breath] hhh... hhh-hhh... [sharp, frightened gasps] [whimpering] nnh-nnh...", "[gasping in terror, shaking] hhh-hhh-hhh [a choked, frightened whimper] hhh..."] },
  "vocal-johanna-sob": { tts: { voice: SURVIVOR_VOICE.johanna, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[sobbing quietly] [crying softly] hhh..." },
  "vocal-johanna-dying": { tts: { voice: SURVIVOR_VOICE.johanna, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[gasps] [weak, dying breaths] hhh... hhh..." },
  "vocal-dale-cough": { tts: { voice: SURVIVOR_VOICE.dale, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[coughing fit] *cough* *cough* *cough* [coughs harshly] *cough cough* [wheezes]" },
  "vocal-dale-pain": { tts: { voice: SURVIVOR_VOICE.dale, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[pained breathing] hhh... hhh... [groans in pain] hhh..." },
  "vocal-dale-hit": { tts: { voice: SURVIVOR_VOICE.dale, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[grunts in pain] ugh!" },
  "vocal-dale-effort": { tts: { voice: SURVIVOR_VOICE.dale, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[grunts with effort] hngh!" },
  "vocal-dale-scream": { tts: { voice: SURVIVOR_VOICE.dale, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[screams in terror] AAAAAH!" },
  "vocal-dale-struggle": { tts: { voice: SURVIVOR_VOICE.dale, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[struggling, grunting] nngh! hngh! [strains hard]" },
  "vocal-dale-panic": { tts: { voice: SURVIVOR_VOICE.dale, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[terrified, hyperventilating] hhh-hhh-hhh... [frantic, ragged gasps for air] [whimpers in fear] nnh... hhh-hhh...", alts: ["[panicking, can't catch their breath] hhh... hhh-hhh... [sharp, frightened gasps] [whimpering] nnh-nnh...", "[gasping in terror, shaking] hhh-hhh-hhh [a choked, frightened whimper] hhh..."] },
  "vocal-dale-sob": { tts: { voice: SURVIVOR_VOICE.dale, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[sobbing quietly] [crying softly] hhh..." },
  "vocal-dale-dying": { tts: { voice: SURVIVOR_VOICE.dale, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[gasps] [weak, dying breaths] hhh... hhh..." },
  "vocal-ben-cough": { tts: { voice: SURVIVOR_VOICE.ben, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[coughing fit] *cough* *cough* *cough* [coughs harshly] *cough cough* [wheezes]" },
  "vocal-ben-pain": { tts: { voice: SURVIVOR_VOICE.ben, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[pained breathing] hhh... hhh... [groans in pain] hhh..." },
  "vocal-ben-hit": { tts: { voice: SURVIVOR_VOICE.ben, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[grunts in pain] ugh!" },
  "vocal-ben-effort": { tts: { voice: SURVIVOR_VOICE.ben, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[grunts with effort] hngh!" },
  "vocal-ben-scream": { tts: { voice: SURVIVOR_VOICE.ben, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[screams in terror] AAAAAH!" },
  "vocal-ben-struggle": { tts: { voice: SURVIVOR_VOICE.ben, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[struggling, grunting] nngh! hngh! [strains hard]" },
  "vocal-ben-panic": { tts: { voice: SURVIVOR_VOICE.ben, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[terrified, hyperventilating] hhh-hhh-hhh... [frantic, ragged gasps for air] [whimpers in fear] nnh... hhh-hhh...", alts: ["[panicking, can't catch their breath] hhh... hhh-hhh... [sharp, frightened gasps] [whimpering] nnh-nnh...", "[gasping in terror, shaking] hhh-hhh-hhh [a choked, frightened whimper] hhh..."] },
  "vocal-ben-sob": { tts: { voice: SURVIVOR_VOICE.ben, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[sobbing quietly] [crying softly] hhh..." },
  "vocal-ben-dying": { tts: { voice: SURVIVOR_VOICE.ben, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[gasps] [weak, dying breaths] hhh... hhh..." },
  "vocal-rick-cough": { tts: { voice: SURVIVOR_VOICE.rick, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[coughing fit] *cough* *cough* *cough* [coughs harshly] *cough cough* [wheezes]" },
  "vocal-rick-pain": { tts: { voice: SURVIVOR_VOICE.rick, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[pained breathing] hhh... hhh... [groans in pain] hhh..." },
  "vocal-rick-hit": { tts: { voice: SURVIVOR_VOICE.rick, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[grunts in pain] ugh!" },
  "vocal-rick-effort": { tts: { voice: SURVIVOR_VOICE.rick, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[grunts with effort] hngh!" },
  "vocal-rick-scream": { tts: { voice: SURVIVOR_VOICE.rick, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[screams in terror] AAAAAH!" },
  "vocal-rick-struggle": { tts: { voice: SURVIVOR_VOICE.rick, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[struggling, grunting] nngh! hngh! [strains hard]" },
  "vocal-rick-panic": { tts: { voice: SURVIVOR_VOICE.rick, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[terrified, hyperventilating] hhh-hhh-hhh... [frantic, ragged gasps for air] [whimpers in fear] nnh... hhh-hhh...", alts: ["[panicking, can't catch their breath] hhh... hhh-hhh... [sharp, frightened gasps] [whimpering] nnh-nnh...", "[gasping in terror, shaking] hhh-hhh-hhh [a choked, frightened whimper] hhh..."] },
  "vocal-rick-sob": { tts: { voice: SURVIVOR_VOICE.rick, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[sobbing quietly] [crying softly] hhh..." },
  "vocal-rick-dying": { tts: { voice: SURVIVOR_VOICE.rick, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[gasps] [weak, dying breaths] hhh... hhh..." },
  "vocal-sarah-cough": { tts: { voice: SURVIVOR_VOICE.sarah, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[coughing fit] *cough* *cough* *cough* [coughs harshly] *cough cough* [wheezes]" },
  "vocal-sarah-pain": { tts: { voice: SURVIVOR_VOICE.sarah, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[pained breathing] hhh... hhh... [groans in pain] hhh..." },
  "vocal-sarah-hit": { tts: { voice: SURVIVOR_VOICE.sarah, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[grunts in pain] ugh!" },
  "vocal-sarah-effort": { tts: { voice: SURVIVOR_VOICE.sarah, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[grunts with effort] hngh!" },
  "vocal-sarah-scream": { tts: { voice: SURVIVOR_VOICE.sarah, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[screams in terror] AAAAAH!" },
  "vocal-sarah-struggle": { tts: { voice: SURVIVOR_VOICE.sarah, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[struggling, grunting] nngh! hngh! [strains hard]" },
  "vocal-sarah-panic": { tts: { voice: SURVIVOR_VOICE.sarah, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[terrified, hyperventilating] hhh-hhh-hhh... [frantic, ragged gasps for air] [whimpers in fear] nnh... hhh-hhh...", alts: ["[panicking, can't catch their breath] hhh... hhh-hhh... [sharp, frightened gasps] [whimpering] nnh-nnh...", "[gasping in terror, shaking] hhh-hhh-hhh [a choked, frightened whimper] hhh..."] },
  "vocal-sarah-sob": { tts: { voice: SURVIVOR_VOICE.sarah, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[sobbing quietly] [crying softly] hhh..." },
  "vocal-sarah-dying": { tts: { voice: SURVIVOR_VOICE.sarah, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[gasps] [weak, dying breaths] hhh... hhh..." },
  "vocal-rollo-cough": { tts: { voice: SURVIVOR_VOICE.rollo, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[coughing fit] *cough* *cough* *cough* [coughs harshly] *cough cough* [wheezes]" },
  "vocal-rollo-pain": { tts: { voice: SURVIVOR_VOICE.rollo, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[pained breathing] hhh... hhh... [groans in pain] hhh..." },
  "vocal-rollo-hit": { tts: { voice: SURVIVOR_VOICE.rollo, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[grunts in pain] ugh!" },
  "vocal-rollo-effort": { tts: { voice: SURVIVOR_VOICE.rollo, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[grunts with effort] hngh!" },
  "vocal-rollo-scream": { tts: { voice: SURVIVOR_VOICE.rollo, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[screams in terror] AAAAAH!" },
  "vocal-rollo-struggle": { tts: { voice: SURVIVOR_VOICE.rollo, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[struggling, grunting] nngh! hngh! [strains hard]" },
  "vocal-rollo-panic": { tts: { voice: SURVIVOR_VOICE.rollo, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[terrified, hyperventilating] hhh-hhh-hhh... [frantic, ragged gasps for air] [whimpers in fear] nnh... hhh-hhh...", alts: ["[panicking, can't catch their breath] hhh... hhh-hhh... [sharp, frightened gasps] [whimpering] nnh-nnh...", "[gasping in terror, shaking] hhh-hhh-hhh [a choked, frightened whimper] hhh..."] },
  "vocal-rollo-sob": { tts: { voice: SURVIVOR_VOICE.rollo, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[sobbing quietly] [crying softly] hhh..." },
  "vocal-rollo-dying": { tts: { voice: SURVIVOR_VOICE.rollo, model: "eleven_v3" }, extra: 1, secs: 4, prompt: "[gasps] [weak, dying breaths] hhh... hhh..." },
  "pa-lockdown": { tts: { voice: PA_VOICE, model: "eleven_multilingual_v2", settings: { stability: 0.7, similarity_boost: 0.8 } }, extra: 1, secs: 8, prompt: "Attention all personnel. Containment Level Four lockdown is now in effect. Please proceed calmly to your designated safe area and await further instruction." },
  "pa-breach": { tts: { voice: PA_VOICE, model: "eleven_multilingual_v2", settings: { stability: 0.7, similarity_boost: 0.8 } }, extra: 1, secs: 8, prompt: "Warning. A containment breach has been detected in Specimen Containment. All personnel evacuate to the nearest secure area immediately." },
  "pa-power-fail": { tts: { voice: PA_VOICE, model: "eleven_multilingual_v2", settings: { stability: 0.7, similarity_boost: 0.8 } }, extra: 1, secs: 8, prompt: "Warning. Main power failure. Emergency lighting engaged." },
  "pa-power-labs": { tts: { voice: PA_VOICE, model: "eleven_multilingual_v2", settings: { stability: 0.7, similarity_boost: 0.8 } }, extra: 1, secs: 8, prompt: "Power restored. Research Laboratories." },
  "pa-power-medical": { tts: { voice: PA_VOICE, model: "eleven_multilingual_v2", settings: { stability: 0.7, similarity_boost: 0.8 } }, extra: 1, secs: 8, prompt: "Power restored. Medical and Quarantine." },
  "pa-power-security": { tts: { voice: PA_VOICE, model: "eleven_multilingual_v2", settings: { stability: 0.7, similarity_boost: 0.8 } }, extra: 1, secs: 8, prompt: "Power restored. Security." },
  "pa-power-containment": { tts: { voice: PA_VOICE, model: "eleven_multilingual_v2", settings: { stability: 0.7, similarity_boost: 0.8 } }, extra: 1, secs: 8, prompt: "Power restored. Specimen Containment. Lockdown seals disengaged." },
  "pa-power-deep": { tts: { voice: PA_VOICE, model: "eleven_multilingual_v2", settings: { stability: 0.7, similarity_boost: 0.8 } }, extra: 1, secs: 8, prompt: "Power restored. Deep Laboratory." },
  "pa-generator-max": { tts: { voice: PA_VOICE, model: "eleven_multilingual_v2", settings: { stability: 0.7, similarity_boost: 0.8 } }, extra: 1, secs: 8, prompt: "Generator load at maximum. Reduce demand to restore additional sectors." },
  "pa-override": { tts: { voice: PA_VOICE, model: "eleven_multilingual_v2", settings: { stability: 0.7, similarity_boost: 0.8 } }, extra: 1, secs: 8, prompt: "Vault override engaged. Outer door opening in sixty seconds." },
  "pa-30": { tts: { voice: PA_VOICE, model: "eleven_multilingual_v2", settings: { stability: 0.7, similarity_boost: 0.8 } }, extra: 1, secs: 8, prompt: "Thirty seconds." },
  "pa-10": { tts: { voice: PA_VOICE, model: "eleven_multilingual_v2", settings: { stability: 0.7, similarity_boost: 0.8 } }, extra: 1, secs: 8, prompt: "Ten seconds." },
  // the countdown is one clip a second, so the game plays it at the pace of real seconds (Josh)
  "pa-count-5": { tts: { voice: PA_VOICE, model: "eleven_multilingual_v2", settings: { stability: 0.7, similarity_boost: 0.8 } }, extra: 1, secs: 8, prompt: "Five." },
  "pa-count-4": { tts: { voice: PA_VOICE, model: "eleven_multilingual_v2", settings: { stability: 0.7, similarity_boost: 0.8 } }, extra: 1, secs: 8, prompt: "Four." },
  "pa-count-3": { tts: { voice: PA_VOICE, model: "eleven_multilingual_v2", settings: { stability: 0.7, similarity_boost: 0.8 } }, extra: 1, secs: 8, prompt: "Three." },
  "pa-count-2": { tts: { voice: PA_VOICE, model: "eleven_multilingual_v2", settings: { stability: 0.7, similarity_boost: 0.8 } }, extra: 1, secs: 8, prompt: "Two." },
  "pa-count-1": { tts: { voice: PA_VOICE, model: "eleven_multilingual_v2", settings: { stability: 0.7, similarity_boost: 0.8 } }, extra: 1, secs: 8, prompt: "One." },
  "pa-vault-open": { tts: { voice: PA_VOICE, model: "eleven_multilingual_v2", settings: { stability: 0.7, similarity_boost: 0.8 } }, extra: 1, secs: 8, prompt: "Outer vault door open. Door will seal in ninety seconds." },
  "pa-vault-sealing": { tts: { voice: PA_VOICE, model: "eleven_multilingual_v2", settings: { stability: 0.7, similarity_boost: 0.8 } }, extra: 1, secs: 8, prompt: "Outer vault door sealing. Stand clear." },
  "pa-vault-sealed": { tts: { voice: PA_VOICE, model: "eleven_multilingual_v2", settings: { stability: 0.7, similarity_boost: 0.8 } }, extra: 1, secs: 8, prompt: "Outer vault door sealed. Override disabled." },
  "pa-fire": { tts: { voice: PA_VOICE, model: "eleven_multilingual_v2", settings: { stability: 0.7, similarity_boost: 0.8 } }, extra: 1, secs: 8, prompt: "Fire detected. Fire suppression system unavailable." },
  "pa-lift": { tts: { voice: PA_VOICE, model: "eleven_multilingual_v2", settings: { stability: 0.7, similarity_boost: 0.8 } }, extra: 1, secs: 8, prompt: "Freight lift. Authorized personnel only." },
  "pa-decon": { tts: { voice: PA_VOICE, model: "eleven_multilingual_v2", settings: { stability: 0.7, similarity_boost: 0.8 } }, extra: 1, secs: 8, prompt: "Reminder. Decontamination is mandatory before entering the clean laboratories." },
  "pa-symptoms": { tts: { voice: PA_VOICE, model: "eleven_multilingual_v2", settings: { stability: 0.7, similarity_boost: 0.8 } }, extra: 1, secs: 8, prompt: "Please report any unusual symptoms to Medical immediately." },
  "pa-badge": { tts: { voice: PA_VOICE, model: "eleven_multilingual_v2", settings: { stability: 0.7, similarity_boost: 0.8 } }, extra: 1, secs: 8, prompt: "Personnel are reminded to wear identification badges at all times." },
  "pa-lights-out": { tts: { voice: PA_VOICE, model: "eleven_multilingual_v2", settings: { stability: 0.7, similarity_boost: 0.8 } }, extra: 1, secs: 8, prompt: "Residential Wing. Lights out in fifteen minutes." },
  "pa-slogan": { tts: { voice: PA_VOICE, model: "eleven_multilingual_v2", settings: { stability: 0.7, similarity_boost: 0.8 } }, extra: 1, secs: 8, prompt: "Halcyon Biologics. Better science for a safer tomorrow." },
  "pa-test": { tts: { voice: PA_VOICE, model: "eleven_multilingual_v2", settings: { stability: 0.7, similarity_boost: 0.8 } }, extra: 1, secs: 8, prompt: "This is a test of the Site Nine public address system. This is only a test." },

  // ── THE RECORDS' AUDIO LOGS (RECORDS.md; scripts in audio-logs.mjs, the writers' voices picked by Josh) ──
  ...Object.fromEntries(LOGS.map((l) => [l.id, { tts: { voice: LOG_VOICE[l.who], model: "eleven_v3" }, extra: 1, secs: 60, prompt: l.text }])),

  // ── THE SCORE (ASSETS.md §2h; the music model) ──
  "score-calm": { music: true, secs: 90, prompt: `calm, soft ambient underscore: warm sustained pads, gentle piano notes, a quiet moment of rest, ${SCORE}` },
  "score-uneasy": { music: true, secs: 90, prompt: `dark uneasy ambient underscore: low drones, distant metallic textures, something is wrong, ${SCORE}` },
  "score-suspense": { music: true, secs: 75, prompt: `suspense underscore: tense low strings, a slow pulse like a heartbeat, creeping dread building, ${SCORE}` },
  "score-combat": { music: true, secs: 60, prompt: `intense combat underscore for a fight with zombies: driving percussion, pulsing synth bass, aggressive low strings, urgent, ${SCORE}` },
  "score-aftermath": { music: true, secs: 75, prompt: `sad aftermath underscore after a loss: slow melancholy strings and soft piano, grief, ${SCORE}` },
  "score-colour-labs": { music: true, secs: 60, prompt: `cold clinical ambient drone for a sterile laboratory: glassy tones, a high thin hum, ${SCORE}` },
  "score-colour-power": { music: true, secs: 60, prompt: `industrial ambient drone for a power plant: mechanical rhythms, metallic textures, deep hum, ${SCORE}` },
  "score-colour-tunnels": { music: true, secs: 60, prompt: `low cavernous ambient drone for underground tunnels: rumbling bass, distant echoes, ${SCORE}` },
  "score-colour-deeplab": { music: true, secs: 60, prompt: `deep ominous ambient drone for a sealed lab far underground: crushing sub bass, pressure, dread, ${SCORE}` },
  "sting-contact": { secs: 3, prompt: `a short cinematic horror stinger: a sudden violent orchestral hit and screech for a jump scare` },
  "sting-bite": { secs: 3, prompt: `a short shocking horror stinger: a sharp dissonant string stab and a low impact` },
  "sting-down": { secs: 4, prompt: `a short cinematic stinger: a descending dissonant riser falling into a low dull hit, someone is down` },
  "sting-death": { secs: 5, prompt: `a deep cinematic boom: a heavy sub bass impact with a long dark decay, final` },
  "sting-door-break": { secs: 3, prompt: `a cinematic metallic impact braam: a huge metal hit with a deep brass blast` },
  "sting-power": { secs: 5, prompt: `a cinematic power-up riser: electrical hum swelling up into a bright surge` },
  "sting-zone": { secs: 6, prompt: `a cinematic reveal: a slow dark swell rising into a deep boom` },
  "riser": { secs: 10, prompt: `a cinematic tension riser building slowly from silence to a peak, dissonant strings and noise` },
};
