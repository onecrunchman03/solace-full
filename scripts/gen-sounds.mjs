// Solace sound pipeline — generates every game SFX from prompts (ElevenLabs
// sound-generation), masters with ffmpeg into small OGGs under
// client/public/sfx/. Everything is regenerable: change a prompt, rerun.
//
//   node scripts/gen-sounds.mjs sfx [id]     — the manifest (all missing, or force one id)
//   node scripts/gen-sounds.mjs murmurs      — Sterling's robot-murmur variants + style auditions
//   node scripts/gen-sounds.mjs verify       — ffprobe every shipped file (duration/bitrate table)
//
// LOOP-class sounds get a self-crossfade so the end blends into the start —
// the Web Audio engine loops them gaplessly (roulette orbit, derby crowd,
// slot reels, craps tumble).
//
// Sterling has NO human voice (Josh's call): he murmurs — brief robotic
// chatter, generated as SFX, four variants for variance.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1"));
const REPO = path.resolve(ROOT, "..");
const RAW = path.join(REPO, "audition", "raw");
const SFX_DIR = path.join(REPO, "client", "public", "sfx");

const envText = readFileSync(path.join(REPO, ".env"), "utf8");
const KEY = envText.match(/^ELEVENLABS_API_KEY=(.+)$/m)?.[1]?.trim();
if (!KEY) throw new Error("No ELEVENLABS_API_KEY in .env");

// Strip LEADING silence only. A reverse-pass tail trim ate quiet percussive
// sounds (soft dice knocks, brief murmurs) whole — and trailing quiet is
// harmless for one-shots (the buffer just ends softly).
const NORMALIZE =
  "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02," +
  "loudnorm=I=-18:TP=-1.5";
// Loops must NOT be silence-trimmed (that guarantees a dead spot at the seam).
const NORMALIZE_LOOP = "loudnorm=I=-18:TP=-1.5";
const XFADE = 0.4; // seconds of tail-into-head blend for seamless loops

async function sfxGen(prompt, seconds) {
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: { "xi-api-key": KEY, "content-type": "application/json" },
    body: JSON.stringify(seconds ? { text: prompt, duration_seconds: seconds } : { text: prompt }),
  });
  if (!res.ok) throw new Error(`sound-generation -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

function ff(args) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args]);
}

// Optional per-entry: trim [head, tail] seconds off the RAW generation first
// (a generation that fades in or out leaves a dip at a loop's seam), and
// xfade to widen the seam blend (music wants seconds, not 0.4).
function master(rawFile, outFile, { loop = false, trim = null, xfade = XFADE } = {}) {
  mkdirSync(path.dirname(outFile), { recursive: true });
  const codec = outFile.endsWith(".mp3") ? ["-c:a", "libmp3lame", "-q:a", "4"] : ["-c:a", "libvorbis", "-q:a", "4"];
  if (!loop) {
    ff(["-i", rawFile, "-af", NORMALIZE, ...codec, outFile]);
  } else {
    // Seamless loop: normalize, then crossfade the first XFADE seconds onto
    // the tail, so position 0 and the end are the same blended material.
    const tmp = rawFile + ".norm.wav";
    let pre = "";
    if (trim) {
      const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", rawFile]).toString());
      pre = `atrim=start=${trim[0]}:end=${(dur - trim[1]).toFixed(3)},asetpts=PTS-STARTPTS,`;
    }
    ff(["-i", rawFile, "-af", pre + NORMALIZE_LOOP, tmp]);
    ff([
      "-i", tmp,
      "-filter_complex",
      `[0:a]asplit[a][b];` +
        `[a]atrim=start=${xfade},asetpts=PTS-STARTPTS[body];` +
        `[b]atrim=duration=${xfade},asetpts=PTS-STARTPTS[head];` +
        `[body][head]acrossfade=d=${xfade}:c1=tri:c2=tri`,
      ...codec, outFile,
    ]);
  }
  console.log(`  → ${path.relative(REPO, outFile)}${loop ? "  (loopified)" : ""}`);
}

// ---- The SFX manifest -------------------------------------------------------
// [id, prompt, seconds, {loop}] — retune a sound by editing its prompt and
// rerunning `sfx <id>`.

const SFX = [
  // The shared casino kit
  ["card-deal", "single playing card dealt, sliding quickly across a felt table, close and crisp", 1],
  ["card-deal3", "three playing cards dealt rapidly one after another onto felt, quick swishes", 1.5],
  ["card-flip", "a single playing card flipped over on a table with a crisp snap", 0.8],
  ["card-muck", "a pair of playing cards tossed loosely onto a felt table", 1],
  ["shuffle", "one riffle shuffle of a deck of playing cards with a bridge finish", 1.7],
  ["chip-place", "a single casino chip placed firmly onto a felt table", 0.6],
  ["chip-few", "a small stack of poker chips dropped onto felt with clinks", 0.9],
  ["chip-push", "a large stack of heavy poker chips pushed sliding across a felt table", 1.4],
  ["chip-cascade", "many casino chips spilling and clinking into a winning pile", 1.8],
  ["dice-shake", "two dice rattling, shaken inside cupped hands", 1.1],
  ["dice-tumble", "two dice thrown, tumbling and bouncing across a felt table, then settling", 1.8],
  ["crowd-cheer", "a small group of people cheering excitedly indoors, short burst", 1.8],
  ["crowd-groan", "a small group of people groaning in disappointment", 1.5],
  ["crowd-gasp", "a small crowd gasping in suspense", 1.2],
  // The Wheel (per-tick clacks are SCHEDULED client-side on the decel curve)
  ["wheel-clack", "a single sharp clack of a flexible plastic pointer striking a wooden peg on a large spinning prize wheel, very short, dry, crisp", 0.5],
  ["wheel-thud", "a soft wooden thud as a big heavy prize wheel settles to a stop", 0.5],
  ["wheel-win-common", "one warm bright casino bell ding, single note, short and pleasant", 0.9],
  ["wheel-win-rare", "a quick ascending three-note sparkling chime arpeggio, bright and magical", 1.3],
  ["wheel-win-legendary", "a grand glittering jackpot fanfare: a harp glissando sweeping up into ringing bright bells", 2.4],
  ["wheel-talisman", "a deep mystical wooden resonance with shimmering overtones, an ancient amulet revealed", 2.4],
  // Josh's reference: the classic cartoon "boo-womp" fail sting (two quick
  // deep notes, deadpan) — NOT the long four-note sad-trombone wah.
  ["wheel-womp", "the classic deadpan cartoon boo-womp fail sting: two quick deep muted brass tuba notes, a short boo dropping to a lower flat womp, dry, abrupt, comedic", 1.2],
  ["wheel-death", "a violent horror sting: a sudden dissonant orchestral stab with a huge dark impact boom and one tolling church bell, terrifying", 3],
  ["wheel-reaper", "a sudden dark whoosh passing close by, then a single heavy heartbeat", 1.8],
  ["mystery-open", "a wooden box creaking open with a magical sparkle", 1.6],
  // Slots — the authentic machine
  ["slots-lever", "an authentic vintage slot machine handle being pulled: metal ratchet crank, one heavy spring-loaded thunk, mechanical recoil", 1.2],
  ["slots-reelspin", "vintage mechanical slot machine reels spinning: a fast steady mechanical ticking whirr, consistent even texture", 2.2, { loop: true }],
  ["slots-reelstop", "a single mechanical slot machine reel snapping to a stop: one sharp metal clack with a tiny rattle", 0.5],
  ["slots-payout", "a burst of coins clattering into a metal slot machine payout tray", 2],
  ["slots-jackpot", "a slot machine jackpot: a mechanical bell ringing rapidly while coins cascade into a metal tray", 3],
  // Roulette — orbit is a gapless loop, the drop is played at the reveal
  // Reference: youtube UM2m4ScdCdo ("Roulette Wheel Spinning Large Ball") —
  // a HEAVY ball rumbling the wooden track, then the signature fret clatter
  // (rapid decaying bounces) ending in one plunk into a pocket.
  ["roulette-orbit", "a heavy roulette ball rolling fast and steadily around the wooden rim of a spinning roulette wheel: a deep continuous circular rolling rumble on wood with a smooth airy whir, no bouncing, perfectly even, seamless", 2.4, { loop: true }],
  ["roulette-drop", "a roulette ball leaving the spinning rim and bouncing across the metal frets of the wheel: a rapid burst of sharp irregular clatters that slow down, then one final solid plunk as the ball settles into a numbered pocket, then silence", 2.2],
  ["rake-sweep", "a casino croupier's rake sweeping chips across a felt table", 1.2],
  // Craps — segments scheduled against the actual roll window
  ["craps-whoosh", "a very short whoosh of two dice flying through the air", 0.5],
  ["craps-tumble", "two dice tumbling across a felt craps table: continuous irregular sharp clacks, even texture, no beginning or end", 2.2, { loop: true }],
  ["craps-settle", "two dice coming to rest on a felt table: two final soft knocks, dry", 0.7],
  // Bone Pit
  ["pit-cupslam", "a wooden dice cup slammed down hard on a wooden table", 0.8],
  ["pit-cuplift", "a wooden cup lifted off a table revealing dice with a small clatter", 0.9],
  ["pit-liar", "a dramatic deep orchestral accusation sting, short", 1.6],
  ["pit-diecrack", "a single bone die cracking and crumbling to dust, dry", 1.3],
  ["pit-crown", "a triumphant short royal fanfare with brass and bells, majestic", 3],
  // Derby — a LOW ambient crowd loop + a finish buzzer (no cheering)
  ["derby-horn", "a race starting horn blast", 1.2],
  ["derby-crowd", "a big excited crowd at an outdoor racetrack cheering continuously, heard from far across the track: lively open-air cheering and shouting with excited swells, distant but clear and bright, not muffled, steady, seamless", 6, { loop: true }],
  ["derby-buzzer", "a loud arena race-finish buzzer: one sustained electric blast", 1.3],
  // Market
  ["register", "an antique brass cash register: keys clacking, a cha-ching bell, the drawer sliding open", 1.7],
  ["gavel", "an auctioneer's gavel banging twice on a wood block", 1.2],
  ["forge", "a blacksmith hammer striking an anvil once with a long metallic ring", 1.6],
  ["lottery-win", "a festive winning fanfare with coins and celebration bells", 2.5],
  // THE FORGE (Sep 2026): the anvil reuses "forge" above; the crucible gets its own.
  ["forge-melt", "metal melting down in a hot crucible: a rising hiss and sizzle, thick molten bubbling, a soft glassy shimmer at the end", 2.2],
  // Chess + Blackjack accents
  ["chess-move", "a wooden chess piece placed firmly on a wooden board", 0.5],
  ["chess-capture", "a wooden chess piece knocking another off the board, two wooden knocks", 0.8],
  ["bj-blackjack", "a quick winning casino sting of three ascending bright notes", 1.4],
  ["bj-bust", "a dull losing thud with a short descending tone", 1],
  // THE CASINO GUN (Josh, Aug 2026). The gunshot itself is NOT generated —
  // Josh supplied assets/Models/gun/"gun shot sound.mp3", mastered into
  // sfx/gun-shot.ogg by `node scripts/gen-sounds.mjs gunshot` below.
  ["gun-cock", "a pistol slide racked back and released, two crisp metallic clacks, close and dry", 1],
  ["gun-reload", "a pistol magazine ejected and a fresh magazine inserted with a firm click, then the slide released, mechanical and close", 1.8],
  ["gun-empty", "a pistol trigger pulled on an empty chamber, one small dry metallic click", 0.5],
  // SLORP (Josh, Aug 2026) — the vial under the counter. Three sounds: taking
  // it, the noises it makes you make in the last stage, and the end of you.
  // Wet and organic rather than sci-fi; the horror in stage three is that it
  // is coming out of a person.
  ["slorp-drink", "a thick viscous liquid gulped down in one swallow from a small glass vial, wet swallow with a small chemical fizz after", 1.4],
  ["slorp-gurgle", "a low wet organic gurgle from a human throat, unsettling, bubbling, brief, not a word", 1.2],
  ["slorp-burst", "a wet heavy meaty burst, like a watermelon exploding, with a deep low thump and splattering liquid afterwards", 1.8],
];

// ---- PIPE DREAMS (Backrooms Level 2, Sep 2026) ------------------------------
// Written to client/public/assets/pipes/ beside the level's other assets, the
// way the Poolrooms keep theirs in assets/pools/. `node scripts/gen-sounds.mjs
// pipes [id]`. The Grabber's sounds are the level's whole warning system:
// silent until close, then steps and that hungry breathing, so they must read
// as a CREATURE (not a person) and carry at low volume.

const PIPES = [
  // the level's bed: a dark concrete maintenance tunnel full of steam pipes
  ["ambience", "dark underground boiler maintenance tunnel ambience: a deep constant low mechanical hum, distant pipes groaning and ticking as they expand with heat, faint hissing steam far away, occasional far-off metal creak, oppressive, no music", 22, { loop: true }],
  ["hum-machine", "a large old industrial pump engine running steadily in a concrete room, heavy rhythmic thrumming and a low electric drone, loopable", 12, { loop: true }],
  ["steps-concrete", "slow walking footsteps in hard-soled boots on a gritty concrete floor in a narrow tunnel, steady even pace, slight echo", 6, { loop: true }],
  // THE GRABBER
  ["grabber-breath", "a monstrous creature breathing heavily and hungrily through its teeth right behind you, wet ragged excited panting, low guttural, eager, inhuman, no words", 6, { loop: true }],
  ["grabber-steps", "heavy slow creeping footsteps of a large barefoot creature on wet concrete, deliberate sneaking, bare flesh slapping softly, stalking, close", 6, { loop: true }],
  ["grabber-screech", "a horrifying inhuman screech of a creature suddenly hit by bright light, piercing shriek of pain and rage that cuts off as it flees, echoing in a concrete tunnel", 2.2],
  ["grabber-flee", "a large creature scrambling and running away fast on concrete, clattering frantic footsteps fading into the distance down a tunnel", 2.5],
  ["grabber-grab", "a monster lunging and grabbing a person violently: a sudden rush, a heavy fleshy impact, a deep hungry snarl, a short choked human gasp", 1.8],
  // steam and pipes
  ["steam-warn", "a high pressure steam pipe starting to hiss, a rising sharp hiss building for one second", 1.2],
  ["steam-burst", "a violent burst of scalding high pressure steam blasting from a broken pipe, loud roaring hiss that tails off", 3],
  ["pipe-burn", "a quick sizzle of skin touching a scalding hot metal pipe, short sharp hiss", 0.7],
  ["pipe-clank-1", "a single loud metallic bang inside old iron steam pipes, water hammer, echoing in a concrete tunnel", 1.5],
  ["pipe-clank-2", "old iron pipes knocking and ticking several times as hot water surges through them, metallic echo", 2.5],
  ["pipe-groan", "a long low metallic groan of huge old pipes under pressure, deep and eerie, echoing", 4],
  ["drip", "a single water drop falling into a small puddle on concrete, echoing in a tunnel", 0.8],
  ["bulb-buzz", "an old caged incandescent bulb buzzing and faintly flickering, electrical hum, close", 5, { loop: true }],
  // the fuse door
  ["fuse-insert", "a heavy cartridge fuse pushed firmly into a metal fuse panel slot, a solid mechanical clunk and electrical contact click", 1],
  ["panel-button", "a heavy industrial push button pressed on a metal control panel, a deep mechanical click, then a rising electrical whine as power comes on", 2.5],
  ["door-unlock", "a massive steel blast door unlocking: heavy bolts retracting one after another, hydraulic hiss, a deep grinding rumble as it starts to open", 4],
  ["hatch-drain", "a large pool drain hatch opening underwater and water rushing down into it with a deep gurgling roar", 4],
];

// ---- ROOM SOUNDS (the map editor's Sound setting) ---------------------------
// Loops a room design can play over its level's own hum (src/backrooms/
// surfaces.ts ROOM_SOUNDS names them). Written to client/public/assets/br/rooms/.
// `node scripts/gen-sounds.mjs rooms [id]`. Each must loop with no seam and
// no event that repeats noticeably every few seconds — the player stands in a
// room for minutes.
const ROOMS = [
  ["drip", "water dripping steadily from a leaking ceiling into puddles in an empty echoing room, several drips at different irregular rhythms, quiet background hum, no voices, seamless", 20, { loop: true }],
  ["radio", "an old portable radio playing faint old-fashioned big band music through heavy static and hiss in an empty room, the station drifting in and out, tinny and distant, seamless", 20, { loop: true }],
  ["wind", "a hollow draught moaning softly through air vents and gaps in an empty building, low whistling wind, gentle swells, eerie, no voices, seamless", 20, { loop: true }],
  ["music", "cheerful 1980s shopping mall muzak heard muffled through a wall from far away in another room, soft and hollow, reverberant, lonely, seamless", 22, { loop: true }],
];

// ---- THE STALKER -------------------------------------------------------------
// Written to client/public/assets/stalker/. `node scripts/gen-sounds.mjs
// stalker [id]`. "burn" loops while a flashlight beam is held on it (Josh,
// Sep 30 2026: "have a burning sound play while it's being shined with light").
const STALKER = [
  ["burn", "dark flesh sizzling and crackling as it burns under an intense beam of light, a wet searing hiss with a low pained inhuman rasp underneath, continuous, no words, seamless", 6, { loop: true }],
];

// ---- THE BLEEDER (Level 3, the Electrical Station) ---------------------------
// Written to client/public/assets/station/bleeder/. `node scripts/gen-sounds.mjs
// bleeder [id]`. Josh, Oct 2026: a pale, tall, blood-soaked thing with a mouth
// full of long teeth that lives in the station's wiring — extremely fast,
// kills on touch, flees a held beam after a second. "make sure it has audio
// for its attack, hunting, running, and idle noises". scream + retreat pair
// with its model's Scream and RetreatScream clips. Every one must read as a
// CREATURE (never a person) and carry the station's electricity in it: the
// lights it lives in buzz and crackle when it is near.
const BLEEDER = [
  ["idle", "a pale emaciated creature crouched motionless in the dark, slow wet rattling breaths through long teeth, occasional soft clicking of teeth, a faint electrical buzz and crackle of a dying light nearby, inhuman, quiet and close, no words, seamless", 10, { loop: true }],
  ["hunt", "a predatory creature searching in the dark, sharp wet sniffing, low clicking growls deep in its throat, teeth chattering, flickering fluorescent lights buzzing and crackling around it, inhuman, menacing, no words, seamless", 10, { loop: true }],
  ["run", "an inhumanly fast creature sprinting on all fours down a concrete corridor, rapid frantic slapping of bare limbs and claws scraping concrete, ragged snarling breaths, terrifyingly fast, seamless", 5, { loop: true }],
  ["attack", "a monster lunging out of the dark and biting: a shrieking snarl, a violent wet crunch of long teeth and a heavy fleshy impact, an electrical crack, brutal and sudden", 1.8],
  ["scream", "a horrifying high inhuman scream of a pale creature that has just spotted its prey, a piercing shriek that rises and breaks into a rattle, echoing down concrete corridors, lights buzzing", 2.2],
  ["retreat", "a creature burned by a bright flashlight shrieking in pain and fury as it flees, a searing hiss, the shriek trailing away fast down a corridor with scrambling claws", 2.2],
];

// ---- THE ELECTRICAL STATION (Level 3) ----------------------------------------
// Written to client/public/assets/station/ beside the Bleeder's folder.
// `node scripts/gen-sounds.mjs station [id]`. The level's warnings are all
// electrical: a panel's crackle a second before it arcs, the bang when it does,
// the clunk of a section dying and the hum coming back.
const STATION = [
  ["ambience", "an abandoned underground electrical substation: a deep steady 50 hertz transformer hum, faint buzzing of old fluorescent tubes, a distant electrical crackle now and then, dripping water in concrete rooms, oppressive, no music", 22, { loop: true }],
  ["arc-warn", "an electrical panel starting to fail: a rising buzzing crackle of electricity building up fast for one second, sparks spitting", 1.2],
  ["arc-fire", "a violent electrical arc flash from an open power panel: a loud sharp crack and a sizzling bang of high voltage, sparks showering, an electric hum that cuts off", 1.4],
  ["shock", "a person stepping into electrified water: a sharp loud electrical zap and buzzing crackle with a splash", 0.8],
  ["breaker-on", "a huge industrial circuit breaker lever thrown upward by hand: a heavy metal clunk, a deep electrical thump as power engages, and a rising transformer hum", 2.5],
  ["cutoff", "an emergency electrical cutoff handle pulled down: a heavy metallic snap and a clunk, then the hum of machinery winding down to silence", 2.2],
  ["power-down", "the power failing in a large concrete building: fluorescent lights clicking off one after another, a transformer hum winding down to silence", 2.5],
  ["power-up", "the power coming back on in a large concrete building: a deep electrical thump, fluorescent tubes flickering and pinging on, a transformer hum rising", 2.5],
];

// ---- THE ABANDONED OFFICE (Level 4) -----------------------------------------
// Written to client/public/assets/office/. `node scripts/gen-sounds.mjs office
// [id]`. The references: rain on the windows over the low rumble of the
// building's pipes — QUIETER than the Station, more dread. The badge reader at
// the stairwell door, and the troffers dipping (a zone at a time — the Temp's
// moment to move).
const OFFICE = [
  ["ambience", "an empty abandoned office building: steady rain pattering on large windows, the low distant rumble of water pipes inside the walls, a faint fluorescent tube hum, an air vent breathing softly, lonely and very still, no music, no voices", 22, { loop: true }],
  ["reader-deny", "an office security keycard reader rejecting a card: two short low electronic error beeps", 0.8],
  ["reader-accept", "an office security keycard reader accepting a card: a bright short electronic chirp, then a heavy magnetic door lock releasing with a solid clunk", 1.6],
  ["blink", "office fluorescent ceiling lights cutting out for half a second: an electrical tick, a moment of silence, then the tubes buzzing and pinging back on", 1.0],
];

// ---- THE TEMP (Level 4's creature) -------------------------------------------
// Written to client/public/assets/office/temp/. `node scripts/gen-sounds.mjs
// temp [id]`. A featureless office mannequin that only moves while nobody is
// looking (BACKROOMS.md → "THE CREATURE"): it is PLASTIC, never flesh, and it
// never breathes. The scrape is heard only by those NOT looking at it.
const TEMP = [
  ["scrape", "a heavy hollow plastic store mannequin moving fast across office carpet: dull plastic feet scuffing and dragging, stiff joints knocking hollowly, no breathing, no voice, seamless", 4, { loop: true }],
  ["creak", "a stiff plastic mannequin joint locking into place: a hollow plastic creak and a sharp tick, eerie and close, no voice", 1.2],
  ["kill", "sudden violence in an empty office: hard plastic hands grabbing, a hollow plastic crack, a heavy body falling onto carpet, a choked gasp, brutal and short", 1.8],
];

// ---- THE TERROR HOTEL (Level 5) ----------------------------------------------
// Written to client/public/assets/hotel/. `node scripts/gen-sounds.mjs hotel
// [id]`. A 1930s grand hotel: amber light, red carpet, mahogany — and a jazz
// band that plays through the Main Hall from NO source (BACKROOMS.md → "THE
// SOUND"), party chatter behind the corridor doors, the brass lifts. Below
// stairs, THE BOILER ROOM: furnace roar, hissing pipes, heat. The sound-
// generation endpoint caps a clip at 30s, so the hall's bed is 30s, not a
// minute; it is a seamless loop and heard faint, which hides the repeat.
const HOTEL = [
  ["ambience", "smooth 1930s jazz band playing a slow tune: muted trumpet, soft brushed drums and walking upright bass, heard very faintly and muffled from far away through the walls of a big quiet empty grand hotel, distant and hollow, lonely, seamless", 30, { loop: true, trim: [0.5, 0], xfade: 2 }],
  ["chatter", "a lively 1930s cocktail party heard muffled through a closed hotel room door: many people chattering and laughing indistinctly, glasses clinking, no clear words, seamless", 20, { loop: true, trim: [0.4, 2.5], xfade: 1 }],
  ["boiler", "a huge old hotel boiler room deep underground: a deep constant roar of coal furnaces, steam hissing from old pipes, occasional heavy metallic knocks and pipe clanks, oppressive heat, no music, no voices, seamless", 22, { loop: true }],
  // (the first take swelled in and out like a single gust — "constant" and "no
  // fade" are what keep a positional loop from pulsing every 8 seconds)
  ["furnace-roar", "a big coal fire roaring constantly inside an open cast-iron furnace, close: a continuous steady deep roar of flames with crackling coals, unchanging volume from start to end, no fade in, no fade out, seamless", 8, { loop: true, trim: [0.3, 3.2], xfade: 0.6 }],
  ["furnace-whisper", "faint eerie unintelligible whispering voices hidden inside the crackle and roar of a fire, quiet and unsettling, no clear words", 4],
  ["lift-chime", "an old brass 1930s hotel elevator arrival bell: a single clear warm ding", 1.5],
  ["lift-ride", "riding an old 1930s cage elevator: steel cables creaking and humming, a low electric motor drone, a mechanical clunk as it stops", 4],
  ["lift-doom", "old elevator doors sliding shut with a clunk, then the steel cables suddenly snapping with a loud twang and the elevator car falling fast, a rushing whoosh and rattling metal fading down into total silence", 5],
  ["register-page", "the heavy thick pages of an old leather-bound hotel guest register being turned, dry paper rustle", 1.5],
  ["rusty-door", "a heavy old key turning in a rusted iron lock with a stiff grinding click, then a massive rusted iron door slowly grinding and screeching open on corroded hinges", 4],
  ["heat-sizzle", "a short sharp hiss of scalding steam, like skin touching a red hot pipe, sizzle", 1.5],
];

// ---- THE DEATHMOTHS (Level 5's creature) -------------------------------------
// Written to client/public/assets/hotel/moths/. `node scripts/gen-sounds.mjs
// moths [id]`. Swarms of large moths drawn to torchlight (BACKROOMS.md → "THE
// DEATHMOTHS"): papery, dry, MANY wings — insects, never a single creature,
// never a voice. The flutter loops while a swarm is awake.
const MOTHS = [
  ["flutter", "a swarm of many large moths fluttering in the air close by: dense dry papery wingbeats, soft rapid flapping, insect, no buzzing, no voice, seamless", 5, { loop: true, trim: [0, 0.8], xfade: 0.5 }],
  ["wake", "a huge swarm of large moths suddenly bursting off a ceiling all at once: a sudden loud roar of thousands of dry papery wings taking flight", 2],
  ["bite", "a swarm of large moths engulfing a person's head: frantic loud papery wings right at the ears with small sharp stinging nips and bites, panicked", 1.5],
];

// ---- LIGHTS OUT (Level 6) and THE LISTENER ----------------------------------
// Written to client/public/assets/lights/. `node scripts/gen-sounds.mjs lights
// [id]`. Total dark, wet concrete, near silence (BACKROOMS.md → "LEVEL 6 —
// LIGHTS OUT"): the bed is drips and a very low room tone, nothing else. THE
// SEA behind the hatch is how you find it — a positional loop heard from far
// off, so it must be steady (no swell). THE LISTENER is blind and hunts by
// sound: it BREATHES (wet, slow, close), WHISPERS when it touches you, and its
// first touch is a cold hand, not a blow.
const LIGHTS = [
  ["ambience", "near silence in a pitch black underground concrete basement: a very low steady room tone, slow water drips echoing far away now and then, faint distant creaks, no music, no voices, seamless", 30, { loop: true, trim: [0.5, 0], xfade: 2 }],
  ["surf", "ocean waves breaking steadily on a shore, heard muffled through a thick closed steel ship hatch: deep low rumbling surf, constant volume from start to end, no fade in, no fade out, no gulls, seamless", 12, { loop: true, trim: [0.4, 2.5], xfade: 1 }],
  ["listener-breath", "a creature breathing slowly and wetly in the dark very close by: long rattling inhales through an open mouth, quiet wet exhales, patient, listening, no growl, no voice, seamless", 8, { loop: true, trim: [0.3, 2], xfade: 0.6 }],
  ["touch", "a sudden cold clammy hand pressing on the back of a neck: a soft wet skin slide and a sharp frightened intake of breath, very close, intimate, no scream", 1.6],
  ["whisper", "an unintelligible raspy whisper right next to the ear in total darkness, slow and breathy, inhuman, no clear words", 2.2],
  ["lunge", "something large suddenly rushing forward across a wet concrete floor in the dark: fast heavy bare footsteps slapping and a sharp hiss, short and terrifying", 1.4],
  ["far-steps", "slow bare footsteps on wet concrete far away down a long dark corridor, echoing, a few steps then stopping, eerie", 4],
  ["wheel-fit", "a heavy iron valve handwheel being slotted onto a steel hub with a solid metallic clank, then turned with effort: grinding metal ratchet clicks", 3],
  ["hatch-open", "a heavy watertight steel ship hatch unsealing: metal dogs clanking free one by one, a hiss of air, then the hatch swinging open on stiff hinges and the sound of the ocean rushing in loud", 5],
];

// ---- THALASSOPHOBIA (Level 7) and THE THING BELOW ------------------------------
// Written to client/public/assets/ocean/. `node scripts/gen-sounds.mjs ocean
// [id]`. A drowned city under fog (BACKROOMS.md → "LEVEL 7 — THALASSOPHOBIA"):
// the bed is open water lapping at concrete and wind high in empty windows,
// no gulls, no life. THE THING BELOW is never seen: what you hear is a shape
// the size of a street passing under you, a hum through the water while it
// circles, the deep groan of it rising, and the sea erupting.
const OCEAN = [
  ["ambience", "a flooded city under thick fog: calm open sea water lapping gently against concrete walls and rooftops, a faint cold wind through empty high windows far above, very lonely, no gulls, no birds, no boats, no voices, seamless", 30, { loop: true, trim: [0.5, 0], xfade: 2 }],
  ["deep-hum", "an enormous creature circling slowly deep underwater, heard by a swimmer: a very low resonant hum and pressure throb through the water, slow and steady, felt more than heard, no clicks, no voice, seamless", 10, { loop: true, trim: [0.4, 2], xfade: 1 }],
  ["deep-pass", "something gigantic gliding past deep beneath a swimmer in open water: a slow heavy muffled underwater whoosh and a low groan of displaced water, ominous", 4],
  ["deep-rise", "a colossal creature rising fast from the deep toward the surface: a deep swelling underwater roar and rumble building quickly, bubbles rushing upward, terrifying", 2.6],
  ["deep-strike", "the sea violently erupting as something huge bursts up through the surface: a massive explosive splash, water crashing down, a deep bellowing roar cut off", 3],
  ["helmet-on", "an old heavy brass diving helmet being lifted and set down over the head: a solid metallic clunk, the brass ringing slightly, then a seal tightening and muffled breathing inside", 2],
  ["stair-open", "a rusted iron gate at the bottom of an underwater subway stair grinding open, heard underwater: muffled metal scraping and a deep clunk, bubbles", 3],
];

// ---- THE CAVE SYSTEM (Level 8) and THE BURROWER ---------------------------------
// Written to client/public/assets/cave/. `node scripts/gen-sounds.mjs cave
// [id]`. A subway broken into caves (BACKROOMS.md → "LEVEL 8 — THE CAVE
// SYSTEM"): the bed is water dripping into pools in a huge cavern and a far
// river; the river itself is its own loop, heard by where it runs. THE
// BURROWER is heard before anything: CLICKING in the rock — slow and spaced
// while it roams, fast and hard when it hunts — which is the warning.
const CAVE = [
  ["ambience", "a vast dark limestone cave: slow water drips falling into still pools at different distances, a very faint far-off underground river, deep hollow air, cold and lonely, no wind, no animals, no voices, seamless", 30, { loop: true, trim: [0.5, 0], xfade: 2 }],
  ["river", "an underground river rushing over rocks in a cave: fast shallow water churning and splashing, echoing off stone walls, constant volume from start to end, no fade in, no fade out, seamless", 12, { loop: true, trim: [0.4, 2.5], xfade: 1 }],
  ["click", "something unseen clicking inside solid rock: sharp dry hard clicks like a fingernail tapping limestone, irregular, heard through stone, with silence between, seamless", 10, { loop: true, trim: [0.4, 2], xfade: 1 }],
  ["click-fast", "something unseen clicking rapidly and urgently inside solid rock as it moves fast: hard dry rattling clicks in quick bursts through stone, scraping, getting closer, seamless", 8, { loop: true, trim: [0.4, 2], xfade: 1 }],
  ["strike", "a long pale creature bursting out of a narrow rock tunnel and seizing someone: a wet tearing lunge, stone grinding, a short choked gasp cut off, then dragging into the rock", 3],
  ["rope-take", "a heavy coil of climbing rope being lifted off a cave floor and slung over a shoulder: rope slithering and thumping, a carabiner clinking", 2],
  ["rope-fix", "a climbing rope being anchored at the foot of a rock chimney: a steel piton hammered into stone with ringing blows, a carabiner snapping shut, the rope pulled taut", 4],
];

// ---- THE SUBURBS (Level 9) and THE NEIGHBORHOOD WATCH ------------------------
// Written to client/public/assets/suburb/. `node scripts/gen-sounds.mjs suburb
// [id]`. An empty neighbourhood at night (BACKROOMS.md → "LEVEL 9 — THE
// SUBURBS"): the bed is crickets, a far sprinkler and the hum of streetlights,
// nobody home. THE NEIGHBORHOOD WATCH is heard before it is seen: a slow
// tuneless WHISTLE while it walks the beat (the warning, carried down the
// street), hard shoes on asphalt, quick when it hunts, and three polite
// knocks at the door you are hiding behind.
const SUBURB = [
  ["ambience", "an empty suburban street late at night: steady crickets in lawns, a faint distant lawn sprinkler ticking, the soft electrical hum of a streetlight, very still warm air, lonely, no cars, no dogs, no voices, no music, seamless", 30, { loop: true, trim: [0.5, 0], xfade: 2 }],
  ["whistle", "a lone man slowly whistling a simple tuneless lullaby melody while strolling down an empty street at night, distant and echoing slightly off houses, calm and unsettling, constant volume, no footsteps, seamless", 12, { loop: true, trim: [0.4, 2], xfade: 1 }],
  ["steps", "slow measured footsteps of hard leather shoes walking on asphalt at night, an unhurried steady even pace, nothing else, constant volume from start to end, seamless", 8, { loop: true, trim: [0.4, 1.5], xfade: 0.6 }],
  ["steps-fast", "fast heavy footsteps of hard leather shoes running on asphalt at night, quick urgent strides, nothing else, constant volume from start to end, seamless", 6, { loop: true, trim: [0.4, 1.5], xfade: 0.5 }],
  ["knock", "three slow polite knocks on a wooden front door of a house, heard from inside, a short pause between each knock", 2.5],
  ["take", "a sudden violent grab at night: a quick struggle of clothing and bodies, a sharp startled gasp smothered by a hand, shoes scuffing and dragging away on pavement, then quiet", 3],
  ["key-take", "a single old house key on a small metal ring picked up off a wooden table: a light metallic jingle and clink", 1.2],
  ["unlock", "an old brass key turning in a front door deadbolt lock: the key sliding in, a firm mechanical clunk as the bolt draws back", 1.6],
  ["door-open", "a wooden front door of a house slowly creaking open, a soft wooden groan of old hinges, warm and inviting rather than scary", 2.5],
];

// ---- Sterling's murmurs -----------------------------------------------------
// Three candidate styles (one sample each → audition/), and the shipped set:
// four variants of the chosen style so repeats never sound identical.

const MURMUR_STYLES = {
  styleA: "a cute vintage toy robot chattering briefly in melodic square-wave blips, speech-like muttering, no words",
  styleB: "a small brass clockwork automaton muttering to itself: short warm tonal beeps with soft mechanical clicks, polite, brief, no words",
  styleC: "a small expressive robot whistling and chirping briefly, playful electronic droid speech, no words",
  // Josh's direction (July 2026): deeper, thicker, a gentle wobble — soft on
  // the ears. The murmur MASTER chain below adds pitch-down + slow tremolo +
  // a lowpass so even a hot generation lands soft.
  styleD: "a deep soft robotic murmur: low warm rounded synthesizer tones gently wobbling, slow mellow mechanical muttering, quiet and soothing, no words",
};
const MURMUR_SHIPPED = "styleD"; // Josh's pick: deep + soft + wobble
// Deepen (~15% pitch-down, duration kept), add a slow wobble, round the top.
const MURMUR_FILTER =
  "asetrate=44100*0.85,aresample=44100,atempo=1.1765," +
  "tremolo=f=5.5:d=0.28,lowpass=f=2600,loudnorm=I=-20:TP=-2";

// ---- Commands ---------------------------------------------------------------

const [cmd, arg] = process.argv.slice(2);
mkdirSync(RAW, { recursive: true });

if (cmd === "sfx") {
  const todo = arg ? SFX.filter(([id]) => id === arg) : SFX;
  if (arg && !todo.length) throw new Error(`no manifest entry "${arg}"`);
  for (const [id, prompt, secs, opts] of todo) {
    const out = path.join(SFX_DIR, `${id}.ogg`);
    if (!arg && existsSync(out)) { console.log(`skip ${id} (exists)`); continue; }
    console.log(`sfx ${id}…`);
    const raw = path.join(RAW, `sfx-${id}.mp3`);
    writeFileSync(raw, await sfxGen(prompt, secs));
    master(raw, out, opts ?? {});
  }
} else if (cmd === "pipes") {
  const dir = path.join(REPO, "client", "public", "assets", "pipes");
  const todo = arg ? PIPES.filter(([id]) => id === arg) : PIPES;
  if (arg && !todo.length) throw new Error(`no pipes entry "${arg}"`);
  for (const [id, prompt, secs, opts] of todo) {
    const out = path.join(dir, `${id}.ogg`);
    if (!arg && existsSync(out)) { console.log(`skip ${id} (exists)`); continue; }
    console.log(`pipes ${id}…`);
    const raw = path.join(RAW, `pipes-${id}.mp3`);
    writeFileSync(raw, await sfxGen(prompt, secs));
    master(raw, out, opts ?? {});
  }
} else if (cmd === "rooms") {
  const dir = path.join(REPO, "client", "public", "assets", "br", "rooms");
  const todo = arg ? ROOMS.filter(([id]) => id === arg) : ROOMS;
  if (arg && !todo.length) throw new Error(`no rooms entry "${arg}"`);
  for (const [id, prompt, secs, opts] of todo) {
    const out = path.join(dir, `${id}.ogg`);
    if (!arg && existsSync(out)) { console.log(`skip ${id} (exists)`); continue; }
    console.log(`rooms ${id}…`);
    const raw = path.join(RAW, `rooms-${id}.mp3`);
    mkdirSync(RAW, { recursive: true });
    writeFileSync(raw, await sfxGen(prompt, secs));
    master(raw, out, opts ?? {});
  }
} else if (cmd === "stalker") {
  const dir = path.join(REPO, "client", "public", "assets", "stalker");
  const todo = arg ? STALKER.filter(([id]) => id === arg) : STALKER;
  if (arg && !todo.length) throw new Error(`no stalker entry "${arg}"`);
  for (const [id, prompt, secs, opts] of todo) {
    const out = path.join(dir, `${id}.ogg`);
    if (!arg && existsSync(out)) { console.log(`skip ${id} (exists)`); continue; }
    console.log(`stalker ${id}…`);
    const raw = path.join(RAW, `stalker-${id}.mp3`);
    mkdirSync(RAW, { recursive: true });
    writeFileSync(raw, await sfxGen(prompt, secs));
    master(raw, out, opts ?? {});
  }
} else if (cmd === "bleeder") {
  const dir = path.join(REPO, "client", "public", "assets", "station", "bleeder");
  const todo = arg ? BLEEDER.filter(([id]) => id === arg) : BLEEDER;
  if (arg && !todo.length) throw new Error(`no bleeder entry "${arg}"`);
  for (const [id, prompt, secs, opts] of todo) {
    const out = path.join(dir, `${id}.ogg`);
    if (!arg && existsSync(out)) { console.log(`skip ${id} (exists)`); continue; }
    console.log(`bleeder ${id}…`);
    const raw = path.join(RAW, `bleeder-${id}.mp3`);
    mkdirSync(RAW, { recursive: true });
    writeFileSync(raw, await sfxGen(prompt, secs));
    master(raw, out, opts ?? {});
  }
} else if (cmd === "office" || cmd === "temp") {
  const set = cmd === "office" ? OFFICE : TEMP;
  const dir = path.join(REPO, "client", "public", "assets", "office", ...(cmd === "temp" ? ["temp"] : []));
  const todo = arg ? set.filter(([id]) => id === arg) : set;
  if (arg && !todo.length) throw new Error(`no ${cmd} entry "${arg}"`);
  for (const [id, prompt, secs, opts] of todo) {
    const out = path.join(dir, `${id}.ogg`);
    if (!arg && existsSync(out)) { console.log(`skip ${id} (exists)`); continue; }
    console.log(`${cmd} ${id}…`);
    const raw = path.join(RAW, `${cmd}-${id}.mp3`);
    mkdirSync(RAW, { recursive: true });
    writeFileSync(raw, await sfxGen(prompt, secs));
    master(raw, out, opts ?? {});
  }
} else if (cmd === "hotel" || cmd === "moths") {
  const set = cmd === "hotel" ? HOTEL : MOTHS;
  const dir = path.join(REPO, "client", "public", "assets", "hotel", ...(cmd === "moths" ? ["moths"] : []));
  const todo = arg ? set.filter(([id]) => id === arg) : set;
  if (arg && !todo.length) throw new Error(`no ${cmd} entry "${arg}"`);
  for (const [id, prompt, secs, opts] of todo) {
    const out = path.join(dir, `${id}.ogg`);
    if (!arg && existsSync(out)) { console.log(`skip ${id} (exists)`); continue; }
    console.log(`${cmd} ${id}…`);
    const raw = path.join(RAW, `${cmd}-${id}.mp3`);
    mkdirSync(RAW, { recursive: true });
    // --remaster: re-run the mastering on the raw generation already on disk
    // (retuning trim/xfade costs no credits).
    if (!(process.argv.includes("--remaster") && existsSync(raw))) writeFileSync(raw, await sfxGen(prompt, secs));
    master(raw, out, opts ?? {});
  }
} else if (cmd === "lights") {
  const dir = path.join(REPO, "client", "public", "assets", "lights");
  const todo = arg ? LIGHTS.filter(([id]) => id === arg) : LIGHTS;
  if (arg && !todo.length) throw new Error(`no lights entry "${arg}"`);
  for (const [id, prompt, secs, opts] of todo) {
    const out = path.join(dir, `${id}.ogg`);
    if (!arg && existsSync(out)) { console.log(`skip ${id} (exists)`); continue; }
    console.log(`lights ${id}…`);
    const raw = path.join(RAW, `lights-${id}.mp3`);
    mkdirSync(RAW, { recursive: true });
    if (!(process.argv.includes("--remaster") && existsSync(raw))) writeFileSync(raw, await sfxGen(prompt, secs));
    master(raw, out, opts ?? {});
  }
} else if (cmd === "ocean") {
  const dir = path.join(REPO, "client", "public", "assets", "ocean");
  mkdirSync(dir, { recursive: true });
  const todo = arg ? OCEAN.filter(([id]) => id === arg) : OCEAN;
  if (arg && !todo.length) throw new Error(`no ocean entry "${arg}"`);
  for (const [id, prompt, secs, opts] of todo) {
    const out = path.join(dir, `${id}.ogg`);
    if (!arg && existsSync(out)) { console.log(`skip ${id} (exists)`); continue; }
    console.log(`ocean ${id}…`);
    const raw = path.join(RAW, `ocean-${id}.mp3`);
    mkdirSync(RAW, { recursive: true });
    if (!(process.argv.includes("--remaster") && existsSync(raw))) writeFileSync(raw, await sfxGen(prompt, secs));
    master(raw, out, opts ?? {});
  }
} else if (cmd === "cave") {
  const dir = path.join(REPO, "client", "public", "assets", "cave");
  mkdirSync(dir, { recursive: true });
  const todo = arg ? CAVE.filter(([id]) => id === arg) : CAVE;
  if (arg && !todo.length) throw new Error(`no cave entry "${arg}"`);
  for (const [id, prompt, secs, opts] of todo) {
    const out = path.join(dir, `${id}.ogg`);
    if (!arg && existsSync(out)) { console.log(`skip ${id} (exists)`); continue; }
    console.log(`cave ${id}…`);
    const raw = path.join(RAW, `cave-${id}.mp3`);
    mkdirSync(RAW, { recursive: true });
    if (!(process.argv.includes("--remaster") && existsSync(raw))) writeFileSync(raw, await sfxGen(prompt, secs));
    master(raw, out, opts ?? {});
  }
} else if (cmd === "suburb") {
  const dir = path.join(REPO, "client", "public", "assets", "suburb");
  mkdirSync(dir, { recursive: true });
  const todo = arg ? SUBURB.filter(([id]) => id === arg) : SUBURB;
  if (arg && !todo.length) throw new Error(`no suburb entry "${arg}"`);
  for (const [id, prompt, secs, opts] of todo) {
    const out = path.join(dir, `${id}.ogg`);
    if (!arg && existsSync(out)) { console.log(`skip ${id} (exists)`); continue; }
    console.log(`suburb ${id}…`);
    const raw = path.join(RAW, `suburb-${id}.mp3`);
    mkdirSync(RAW, { recursive: true });
    if (!(process.argv.includes("--remaster") && existsSync(raw))) writeFileSync(raw, await sfxGen(prompt, secs));
    master(raw, out, opts ?? {});
  }
} else if (cmd === "station") {
  const dir = path.join(REPO, "client", "public", "assets", "station");
  const todo = arg ? STATION.filter(([id]) => id === arg) : STATION;
  if (arg && !todo.length) throw new Error(`no station entry "${arg}"`);
  for (const [id, prompt, secs, opts] of todo) {
    const out = path.join(dir, `${id}.ogg`);
    if (!arg && existsSync(out)) { console.log(`skip ${id} (exists)`); continue; }
    console.log(`station ${id}…`);
    const raw = path.join(RAW, `station-${id}.mp3`);
    mkdirSync(RAW, { recursive: true });
    writeFileSync(raw, await sfxGen(prompt, secs));
    master(raw, out, opts ?? {});
  }
} else if (cmd === "gunshot") {
  // Josh's own shot recording (assets/Models/gun) — mastered through the same
  // chain as the generated bank so it sits at the same loudness.
  const src = path.join(REPO, "assets", "Models", "gun", "gun shot sound.mp3");
  master(src, path.join(SFX_DIR, "gun-shot.ogg"), {});
  console.log("→ client/public/sfx/gun-shot.ogg");
} else if (cmd === "murmurs") {
  for (const [style, prompt] of Object.entries(MURMUR_STYLES)) {
    try {
      console.log(`murmur audition ${style}…`);
      const raw = path.join(RAW, `murmur-${style}.mp3`);
      writeFileSync(raw, await sfxGen(prompt, 1.4));
      const out = path.join(REPO, "audition", `murmur-${style}.mp3`);
      mkdirSync(path.dirname(out), { recursive: true });
      ff(["-i", raw, "-af", MURMUR_FILTER, "-c:a", "libmp3lame", "-q:a", "4", out]);
      console.log(`  → ${path.relative(REPO, out)}`);
    } catch (e) {
      console.log(`  (skipped ${style}: ${String(e).split("\n")[0].slice(0, 120)} — file open in a player?)`);
    }
  }
  for (let i = 1; i <= 4; i++) {
    console.log(`murmur variant ${i} (${MURMUR_SHIPPED})…`);
    const raw = path.join(RAW, `murmur-${i}.mp3`);
    writeFileSync(raw, await sfxGen(MURMUR_STYLES[MURMUR_SHIPPED], 1.4));
    const out = path.join(SFX_DIR, "sterling", `murmur-${i}.ogg`);
    mkdirSync(path.dirname(out), { recursive: true });
    ff(["-i", raw, "-af", MURMUR_FILTER, "-c:a", "libvorbis", "-q:a", "4", out]);
    console.log(`  → ${path.relative(REPO, out)}`);
  }
} else if (cmd === "verify") {
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
    );
  for (const f of walk(SFX_DIR).filter((f) => f.endsWith(".ogg")).sort()) {
    const out = execFileSync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration,size", "-of", "csv=p=0", f,
    ]).toString().trim();
    const [dur, size] = out.split(",");
    console.log(`${path.relative(SFX_DIR, f).padEnd(32)} ${Number(dur).toFixed(2)}s  ${(Number(size) / 1024).toFixed(0)}KB`);
  }
} else {
  console.log("commands: sfx [id] · pipes [id] · rooms [id] · stalker · bleeder · station · office · temp · hotel · moths · lights [id] · ocean [id] · cave [id] · suburb [id] · murmurs · verify");
}
