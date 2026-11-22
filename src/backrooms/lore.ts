// THE RESEARCH ARCHIVE — lore hard drives scattered through Level 0.
//
// Josh's design, locked 2026-07-27:
//  - A drive is a findable item in the world. Picking one up unlocks it
//    GLOBALLY, for everyone on Solace — not just the finder. The archive only
//    ever grows; there are no resets, ever.
//  - Until a drive has been found IN GAME its text does not exist on the wire.
//    Same doctrine as vault answers and relic identity: the server never ships
//    a secret a player hasn't earned, so a modded client learns nothing.
//  - THE DOOR: somewhere in Level 0 there is one locked door and, somewhere
//    else, one key. Bringing the key to the door unlocks LEVEL 1 — THE
//    POOLROOMS — for the entire community, once, permanently. The door's
//    location may be known; the key's is not obvious.
//  - The key can never be lost: die with it and it drops on your body; when
//    that body rots (24 hours), the key returns to where it started.
//
// Placement is DETERMINISTIC from the frozen sector seed (see driveSites), so
// every client and every reboot agrees without a placement table in the DB.
// The map is permanent, so a drive's spot is its spot forever.

import { type Sector } from "./worldgen";
import { placeable } from "./placement";
import { PIPE_DRIVES, PIPE_DRIVE_NOTES } from "./lore-pipes";
import { STATION_DRIVES, STATION_DRIVE_NOTES } from "./lore-station";
import { OFFICE_DRIVES, OFFICE_DRIVE_NOTES } from "./lore-office";
import { HOTEL_DRIVES, HOTEL_DRIVE_NOTES } from "./lore-hotel";
import { LIGHTS_DRIVES, LIGHTS_DRIVE_NOTES } from "./lore-lights";
import { OCEAN_DRIVES, OCEAN_DRIVE_NOTES } from "./lore-ocean";
import { CAVE_DRIVES, CAVE_DRIVE_NOTES } from "./lore-cave";
import { SUBURB_DRIVES, SUBURB_DRIVE_NOTES } from "./lore-suburb";
import { LOBBY_DRIVE_NOTES, POOL_DRIVE_NOTES } from "./lore-notes";

export interface DriveDef {
  /** Stable id — what the DB and the wire use. Never renumber a shipped one. */
  id: string;
  /** The drive's label in the archive ("001 — First Night"). */
  title: string;
  /** The file the drive appears to contain — flavour, shown in the reader. */
  file: string;
  /** The text itself. NEVER sent for a drive that hasn't been found. */
  body: string;
  /** THE BACKROOMS LAWS, law 1 — the archive's one-line description, and Dr.
   *  Voss's note on the drive. Filled from the notes tables below; never sent
   *  for a drive that hasn't been found either. */
  desc?: string;
  ada?: string;
}

export const DRIVES: DriveDef[] = [
  {
    id: "001",
    title: "First Night",
    file: "personal_log_01.txt",
    body: `I don't know how long I've been here. I was in the mall. One second I was looking at a display case and the next — yellow. Just yellow. The carpet smells like a dentist office. The lights never turn off. I walked for what felt like six hours and ended up back at the same water stain on the wall. I'm calling it Fred. Fred the water stain. Fred is the only thing I recognize. I'm going to sleep near Fred tonight. If anyone finds this drive, the water stain near room 4-C is a landmark. Don't lose Fred.`,
  },
  {
    id: "002",
    title: "The Rules",
    file: "survival_basics.txt",
    body: `Whoever finds this, read carefully. I spent three weeks figuring this out so you don't have to.

1. The hum is normal. If the hum stops, move immediately.
2. Almond Water is safe. It appears near walls that feel slightly warm to the touch.
3. Do not run unless you have to. Running attracts attention.
4. The fluorescent lights flicker before an entity passes through. You have maybe four seconds.
5. Keep your flashlight on — the Bacteria avoid well-lit areas.
6. There is no way out that you find by looking for it. Every exit I've found came when I stopped trying.

Good luck. You'll need less of it than you think if you stay calm.`,
  },
  {
    id: "003",
    title: "The Cartographer",
    file: "map_notes_fragment.txt",
    body: `Mapping Level 0 is a fool's errand. The geometry doesn't hold. I've measured the same corridor six times and gotten six different lengths. But patterns exist — the carpet color shifts subtly near level transitions. Darker yellow means you're approaching a boundary. I've documented four consistent boundary zones. I'm calling them Thresholds. If the carpet near you looks more ochre than yellow, stop walking and listen before you take another step. Something lives near the Thresholds. Not hostile — territorial. There's a difference, and the difference matters.

One more thing. In all my mapping — hundreds of miles of corridor, thousands of rooms — I found exactly one door that doesn't belong. Level 0 has no real doors. Openings, archways, passages — but no doors with frames and hardware. Except this one. Heavy. Fixed. A keyhole where a handle should be, and nothing on this side to grip. The frame is a different material than everything else in here, like it was placed rather than generated. I've walked every inch of this level I can reach and I am certain: there is no other door like it anywhere in Level 0. It is the only one. I don't know where the key is. I don't know what's beyond it. But I've started to think that everything in Level 0 — the layout, the entities, all of it — exists in relation to that door. Either to protect it or to deliver someone to it. I haven't decided which.`,
  },
  {
    id: "004",
    title: "Audio Log — Dr. Voss, Entry 1",
    file: "voss_log_001.wav.txt",
    body: `This is Dr. Ada Voss, research log one. I came here intentionally. I know how that sounds. The mathematics suggested a resonance point — a frequency at which physical matter becomes probabilistically unanchored from its native spatial layer. I was right. I'm here. What I did not account for was the return vector. I'm working on it. The entities appear to be native fauna, not anomalies. They evolved here, or something like evolution happened. I need more time. I need more almond water. I need someone to find this drive and not panic.`,
  },
  {
    id: "005",
    title: "The Group",
    file: "group_log_week2.txt",
    body: `There were nine of us. We found each other near what we started calling the Hub — a room where four corridors meet at angles that shouldn't be geometrically possible. We rationed supplies. We established watch rotations. Marcus kept everyone calm. By week two there were six of us. Not because anything got anyone. Two just — wandered. Walked into a corridor and didn't come back. We think they found an exit. We have to think that. The alternative isn't useful. If you find this and you're alone, look for the Hub. Community is the only real survival tool in here. Everything else is secondary.`,
  },
  {
    id: "006",
    title: "Entity Classification Notes",
    file: "entity_field_notes.txt",
    body: `Cataloguing what I've observed:

BACTERIA (the Colony) — slow. Territorial, not predatory. Spray paint appears to deter them — they avoid marked surfaces. This may be why survivors started tagging walls.

THE MIMIC — the most dangerous entity confirmed in Level 0. It reproduces human voices with near-perfect accuracy — distress calls, familiar names, voices of people you know. It uses these to draw wanderers toward it. Do not follow voices in here under any circumstances. If you hear someone calling for help, respond verbally from where you stand and wait. A real person will respond coherently. The Mimic cannot sustain a two-way conversation — it only has what it has heard. If it gets close enough, it kills and takes the skin. Nobody who has seen one up close has written about it. Draw your own conclusion.

I'm still alive. That means this information is useful. Use it.`,
  },
  {
    id: "007",
    title: "Almond Water Origins",
    file: "almond_water_theory.txt",
    body: `Nobody knows where it comes from. It appears. That's the only word for it. One theory is that it's a byproduct of the level itself — the backrooms metabolizing something, the way a living system produces fluid. Another theory, less scientific, is that someone or something put it there for us. That it's intentional. That something in here wants us to survive long enough for a purpose we don't understand yet. I don't know which theory I believe. Both of them scare me for different reasons. Either we're inside something alive, or we're being kept.`,
  },
  {
    id: "008",
    title: "The Architect's Note",
    file: "unsigned_document.txt",
    body: `You were not supposed to find this place. No one was. It exists as a consequence, not a design. The geometry is stable now — it wasn't always. In the early period things moved. Rooms collapsed and reformed. Entities that exist now didn't exist then. The backrooms is not static. It is accreting. Every person who enters brings something with them and leaves it behind when they go — memory, fear, intention. The levels are built from that. Level 0 was the first. It will be the last. Whatever you do, do not reach the center of Level 0. I don't know what's there. I built the walls around it and I still don't know.`,
  },
  {
    id: "009",
    title: "A Child's Log",
    file: "found_notebook_scan.txt",
    body: `im 11. i fell in at the park. the yellow rooms are scary but ive been here 4 days i think. i found water that tastes like almonds and it helped. i made a friend sort of. its not a person but it doesnt hurt me. it just follows. i named it gray. gray doesnt like the flickery lights either. if my mom finds this please tell her im trying to find the door. ill be home for dinner if i can. i promise.`,
  },
  {
    id: "010",
    title: "Signal",
    file: "transmission_fragment.txt",
    body: `— receiving — if anyone can hear this we have established a stable outpost at coordinate marker YELLOW-7 — we have almond water and medical supplies — we are a group of eleven — we have been here four months — we found a pattern in the entity movement cycles — there are safe windows every — [static] — do not approach the eastern corridor after the hum drops to a lower register — repeat do not — [static] — we are still here — we are still —`,
  },
  {
    id: "011",
    title: "Dr. Voss, Entry 7",
    file: "voss_log_007.wav.txt",
    body: `The entities are not random. I've mapped 34 days of movement. There's a rhythm. The Bacteria follow a circuit that takes approximately 19 hours to complete. The Mimic clusters near corridors with high foot traffic — it learns voices quickly, frighteningly so. I heard it use my own name yesterday in a voice that wasn't mine. Do not follow voices in here. Even familiar ones. Especially familiar ones. The backrooms responds to fear. I think it feeds on it, or feeds something with it. I've been practicing staying calm as a survival strategy. It's working better than I expected. Calm is camouflage here. Make a note of that.`,
  },
  {
    id: "012",
    title: "Exit Theory",
    file: "exit_hypothesis.txt",
    body: `I have a theory. Exits appear at points of genuine psychological surrender — not despair, surrender. The difference is important. Despair is wanting out desperately. Surrender is accepting you might not get out and moving anyway. Every confirmed exit account I've collected describes the same thing: the person stopped actively looking. Started just living in the space. And then a door appeared that wasn't there before. The backrooms may be testing something. Attachment to the origin world. The exit is not a reward for endurance. It's a recognition of release. I don't know if I'm capable of it yet.`,
  },
  {
    id: "013",
    title: "The Long Walker",
    file: "walker_account.txt",
    body: `I have walked, by my count, somewhere between 400 and 600 miles in Level 0. I've stopped counting rooms. The carpet has worn grooves from my boots in a few places — I know because I've passed them again. I've developed a relationship with the space the way you develop a relationship with a difficult person. I know its moods. I know when it's going to flicker before it flickers. I know which silence is safe and which silence means something is nearby. I am not okay. But I am competent. There's a version of survival that looks almost like living. I'm in it.`,
  },
  {
    id: "014",
    title: "The Warning",
    file: "do_not_open.txt",
    body: `If you are reading this you ignored the label. Fine. I would have too.

There is a room in Level 0 — you'll know it because the wallpaper has a different pattern. Diamonds instead of the standard texture. Do not go in. I went in. What's in there isn't an entity. It's something that used to be a person. It tried to communicate. I think it was asking for something. I couldn't understand it. I left and it didn't follow me but I still hear what it sounded like. Don't go in. Whatever's in there has been in there a very long time and it remembers what it was.`,
  },
  {
    id: "015",
    title: "Supply Cache Log",
    file: "cache_registry.txt",
    body: `This drive is attached to a supply cache. If supplies remain, take what you need and leave what you don't. Log what you took below so others know what's left.

— M.R.: took 2 almond waters, left flashlight batteries. 3 others here with me. Moving toward Threshold B.
— Anonymous: took batteries. Left nothing, sorry. Running from something. Keep moving.
— J.T.: Left full medkit. Took nothing. Found an exit. If you're reading this I made it out. Don't give up.
— [entry illegible, water damaged]
— Left spray can (full). The paint marks on the wall ahead are mine. Follow the blue arrows if you want to find the cache room.`,
  },
  {
    id: "016",
    title: "Dr. Voss, Final Entry",
    file: "voss_log_final.wav.txt",
    body: `I found the center. I want to be clear that I'm recording this because someone should know, not because I think I'm coming back from it. The center of Level 0 is not a room. It's an absence. A place where the geometry just — stops. And in the absence there is a sound. Not a hum. A tone. A single tone that I think has been playing since before there was anything here to hear it. I think the backrooms grew around that sound. I think everything in here is a response to it. I'm going to walk in. I need to know what it's responding to. If someone finds this — I was here. I was real. That matters to me.

End log.`,
  },
  {
    id: "017",
    title: "The Painter",
    file: "spray_log.txt",
    body: `I've been here long enough to run out of things to be afraid of so I started painting. The walls needed it. All that yellow. I paint things I remember — trees, the color blue, my daughter's face as best I can manage with a spray can. The entities avoid my painted sections. I don't know if it's the paint or the intent behind it. Maybe they avoid places that have been — claimed. Made personal. The backrooms feels less like a place and more like an absence of place. I'm trying to fill it. Three corridors are mine now. I know every inch. That's something.`,
  },
  {
    id: "018",
    title: "Levels Beyond",
    file: "level_report.txt",
    body: `For those who don't know — Level 0 is not the only level. I've slipped through twice. Brief accounts:

LEVEL 1 — THE POOLROOMS — humid. Pool tiles everywhere, shallow standing water that catches the light wrong. Quiet in a way that feels deliberate. No entities I encountered but the silence is the wrong kind. Something happened here. You can feel it in the water, in the way sound doesn't carry the way it should. Whatever it was, the space hasn't recovered from it. Don't linger.

LEVEL 2 — THE OFFICE — fluorescent lighting, cubicles, drop ceilings, carpet that looks almost normal except the color is slightly off. Feels the most like the world you came from. That's the danger. It makes you comfortable. Don't get comfortable.

There are rumours of a level beyond these. No designation. No confirmed survivor account. What little has been pieced together describes total darkness — industrial in structure, pipes and concrete and nothing else. Flashlights work but barely feel like enough. People who claim to have glimpsed it describe a feeling of being followed. Something in the dark, always at the edge of your light. They say if you look directly at where it should be, there's nothing there. But if your guard drops for even a moment — it gets closer. Nobody who has written about it has described what happens when it reaches you. Nobody who has written about it claims to have let it.

Level 0 is the safest place in the backrooms. That's a terrible sentence but it's true.`,
  },
  {
    id: "019",
    title: "The Broadcast",
    file: "looping_audio_transcript.txt",
    body: `The following transcript was recovered from a drive playing a looping audio file of unknown origin. The broadcast has no identified source.

"You are in a transitional space. This is not a punishment. This is not a test. You are here because the boundary between where you were and where you are is thinner than it appears. The rooms are stable. The entities are manageable. The exits are real. You will find one when you are ready to find one. Until then: drink the water. Mark the walls. Do not run in the dark. You are not alone in here. You never were."

The file loops every 4 minutes and 17 seconds. No one has identified the voice.`,
  },
  {
    id: "020",
    title: "For Whoever Comes Last",
    file: "final_message.txt",
    body: `I don't know if I'm the last person who will ever read a drive in here or if there will be a thousand after me. Doesn't matter. I'm writing this for whoever comes last.

It wasn't so bad. Once I stopped fighting it. The yellow gets familiar. The hum becomes white noise. The almond water is actually pretty good once you get used to it.

I found things in here I didn't expect. Quiet. Time to think. A version of myself that doesn't need a phone signal to feel real. I'm not saying it's worth it. I'm saying something happened in here that wouldn't have happened out there, and I'm taking it with me when I leave.

I found my exit this morning. I'm going through it in a few minutes.

If you're reading this: yours exists too. Keep walking.`,
  },
];

/** THE POOLROOMS ARCHIVE (Josh, Aug 2026) — twenty drives that belong to
 *  Level 1 and are found ONLY down there. Same rules as Level 0's: the text
 *  never leaves the server until someone picks the drive up, and an unlock
 *  is permanent and global. The strand is its own story — the people who
 *  came through THE DOOR after it opened, and the ones who were already
 *  here when the water arrived. Ids are P-prefixed so the two archives can
 *  never collide, and are FOREVER once shipped. */
export const POOL_DRIVES: DriveDef[] = [
  {
    id: "P01",
    title: "Wet Feet",
    file: "arrival_log.txt",
    body: `First thing through the door and I stepped straight into six inches of water. Nobody warned me. My boots are ruined and I don't care, because I looked up and forgot how to breathe.

It's a swimming pool. All of it. Tiled floor, tiled walls, tiled ceiling somewhere up in the haze, and arches — dozens of arches, marching off into the light until they're too small to count. The water is warm. Not bath warm. Body warm.

I keep waiting for it to smell like chlorine. It doesn't smell like anything at all.`,
  },
  {
    id: "P02",
    title: "The Water Table",
    file: "measurements_day3.txt",
    body: `Three days of measurements and here is the thing that will keep you up at night: the water is at exactly the same height EVERYWHERE.

Not roughly. Exactly. I've checked it in eleven rooms across what must be two kilometres. Same line on the tile. Every time. There is no current, no drainage, no pump noise. It does not evaporate. I filled a bottle from a deep channel, walked an hour, poured it out — the line didn't move.

Water doesn't do this. Water finds a level within a container. There is no container. There is no edge to this place that I have found.`,
  },
  {
    id: "P03",
    title: "Don't Look Down",
    file: "warning_for_swimmers.txt",
    body: `Rules for the deep parts, learned the hard way.

You float. Everything you carry does not. Drop anything heavier than a torch and it's gone — the bottom is further down than it looks and the tile is the same colour all the way.

You can hold your breath about ten seconds before it starts to hurt. Then it hurts a lot, fast. Get your head up.

And don't dive to look at the bottom. There's nothing down there. I promise you there is nothing down there. I looked for four days to be sure and all I got was a week of not sleeping.`,
  },
  {
    id: "P04",
    title: "The Arches",
    file: "structural_notes.txt",
    body: `I counted arches for a full day. In the big flooded halls they run in rows, six cells apart, and the piers between them are as thick as the openings are wide. Load-bearing. Somebody engineered this.

That's what gets me. Not that it's strange — that it's COMPETENT. The spans are consistent. The tile courses line up across piers that shouldn't know about each other. Whatever made this had a specification.

I don't find that comforting. Nothing that builds to spec builds without a purpose.`,
  },
  {
    id: "P05",
    title: "The Rivers",
    file: "hydrology_?.txt",
    body: `Two channels cut across everything, deeper than the halls, wide enough that you can't jump them. They meet somewhere near the middle in a basin I've started calling the Confluence.

The banks are graded. Someone SHAPED them — a proper slope from dry tile down into the deep, stepped like a beach. You can walk in. That's deliberate.

Which means it was made to be crossed, or made to be sailed. And if it was made to be sailed, there was something to sail.`,
  },
  {
    id: "P06",
    title: "Boat Found",
    file: "not_alone_after_all.txt",
    body: `THERE ARE BOATS.

Four of them, that I've found. Wooden, flat-bottomed, tied to nothing, sitting in the channels like they were left there five minutes ago. No rot. No algae. The wood is dry above the waterline.

I rowed one for two hours down the main channel. Went further in a morning than a week of wading. Whoever left them wanted people to get around.

I'm choosing to believe that's a kindness. It's a better morning if I believe that.`,
  },
  {
    id: "P07",
    title: "Level 0 Was Louder",
    file: "comparison.txt",
    body: `I spent two months in the yellow before the door opened. I want to write down the difference while I still remember it clearly.

The yellow rooms are LOUD. That hum gets into your teeth. The carpet is the same for miles, and after a while you'd swear the walls move when you aren't looking.

Down here it's quiet. Water noise, and your own breathing, and nothing else. The light comes from ceiling panels and off the water and it's BLUE, not that sick yellow.

It's more beautiful and I trust it less. The yellow never pretended to be nice.`,
  },
  {
    id: "P08",
    title: "The Domes",
    file: "the_round_rooms.txt",
    body: `The round rooms are the best thing in here and I'll fight anyone who says different.

Circular. Ring of arched doorways all the way around. In the middle, steps going down into a pool like an amphitheatre — concentric, wide enough to sit on. The ceiling is a dome and it does something to sound. Say a word at the centre and it comes back to you a half-second later, softer, like the room repeating it to itself.

I sat on the second step for six hours. I don't know what I was waiting for. Nothing came. It was still the best six hours I've had in here.`,
  },
  {
    id: "P09",
    title: "Portal Halls",
    file: "the_long_gallery.txt",
    body: `Found a gallery today where the wall repeats every eight paces, and each wall has a perfect CIRCLE cut in it, and the circles line up.

You stand at one end and look through and it's rings inside rings inside rings, getting smaller and darker until they close into a black dot. There's a channel of knee-deep water running down the middle. Walking it, the splashing comes back at you from ahead — from the rings that are too far away to be making noise.

It's the closest thing to a corridor I've seen down here. I think it's meant to lead somewhere. I think the somewhere is more of the same.`,
  },
  {
    id: "P10",
    title: "The Winding",
    file: "do_not_enter_alone.txt",
    body: `The tunnels. Curved, barrel-vaulted, water to your knees, and they BEND. There is not one straight line in the whole system, which means you cannot see more than twenty metres ahead ever.

I marked my way with paint. Came back through and the marks were where I left them, in an order that made no sense. Not moved. Just... the order was wrong, like the tunnels between them had swapped places.

I've been careful since. I don't go in without a walkie and someone at the mouth. Neither should you.`,
  },
  {
    id: "P11",
    title: "Portholes",
    file: "the_round_windows.txt",
    body: `The tunnel walls have circular windows in them. Perfectly round, chest height, glass or something like it, and they glow with a soft light from the other side.

There is no other side. I've walked around. The wall is a wall — one cell thick, water on both faces, and the porthole is lit from inside a space that has no volume.

I put my ear to one. I keep telling myself I heard water. That's all it was. Water.`,
  },
  {
    id: "P12",
    title: "The Ladders",
    file: "chrome_and_rust.txt",
    body: `Chrome pool ladders on the deep pools, exactly like a municipal lido, bolted into the tile. Every one is polished. No rust. In water, forever, and no rust.

Here's the part I keep chewing on: the ladders are on the INSIDE of the pools. Facing in. To use one you'd already have to be in the water.

They aren't for getting out. They're for someone getting in, from somewhere I can't see, who wanted a handhold when they arrived.`,
  },
  {
    id: "P13",
    title: "Skylights",
    file: "the_light_source.txt",
    body: `The ceiling panels aren't lamps. I climbed a mezzanine to get close to one and it's a CUT — an opening — with light coming through it from above.

There's no sun. The light doesn't move all day. It doesn't warm anything. But it comes from over the ceiling, which means there is something over the ceiling, which means this place has an outside and the outside is bright.

I've stopped looking for exits at the walls. If there's a way out of here it's UP.`,
  },
  {
    id: "P14",
    title: "The Spiral",
    file: "stairs_to_the_gallery.txt",
    body: `There's a spiral staircase in the big lido — tiled core, steps wrapping it, climbing to a gallery that runs the length of the north wall.

From up there you can see the whole hall: the pools laid out in shapes that aren't rectangles, the pillars standing in the water, the arches going off into the haze. It's the only place in the Poolrooms where you can see far enough to feel like you understand the layout.

You don't, though. I sketched it from up there and walked it the next day, and the sketch was wrong in ways I can't explain.`,
  },
  {
    id: "P15",
    title: "The Bathhouse",
    file: "small_rooms.txt",
    body: `A whole district of little rooms, nine paces square, most with a sunken bath in the middle and an arched doorway on two sides.

They're the only rooms in here that feel like they were made for ONE person. Everything else is a hall, a gallery, a flooded cathedral. These are private.

I slept in one for a week. Left a mark by the door so I'd know it was mine. Came back on the eighth day and the mark was there, and the room was clean, and my things were stacked in the corner where I hadn't stacked them.

I sleep in the open now.`,
  },
  {
    id: "P16",
    title: "Threshold-4 Requisition",
    file: "T4_REQ_119.pdf.txt",
    body: `THRESHOLD-4 — MATERIEL REQUISITION 119
SUBMITTED: [redacted] · STATUS: APPROVED, PARTIAL

Requested for Level 1 survey work:
  · Dry suits, 6 — APPROVED
  · Inflatable craft, 2 — DENIED (see note)
  · Depth line, 300m — APPROVED
  · Waterproof lamps, 12 — APPROVED
  · Sonar, portable — DENIED (see note)

NOTE FROM REVIEW: Requests for powered craft and active sonar are denied for Level 1 until further notice. Two prior surveys using active acoustics did not return. Passive observation only. Wooden craft already present in the environment may be used at the surveyor's discretion; do not attempt to remove them.

— A. Voss`,
  },
  {
    id: "P17",
    title: "The Thing About Sound",
    file: "audio_notes.txt",
    body: `Voss's people banned sonar. I know why now.

I clapped in the middle of a flooded hall and counted the returns. First came back at the right time, off the far arcade. Second came back at the right time, off the ceiling.

The third came back nine seconds later, from below the water, and it was not a clap.

I'm not going to describe it. I don't have the words and I don't want to find them.`,
  },
  {
    id: "P18",
    title: "Something Uses the Boats",
    file: "moved_again.txt",
    body: `I left boat three tied at the north dock. Tied, with a knot I invented so I'd know.

Two days later it's at the Confluence. Knot's undone. Not cut, not frayed — undone, correctly, the way you'd untie a knot you understood.

I've stopped taking that personally. Someone else is down here getting around the same way I am, and they're neater about it than me. That's the version I've decided on.

The other version is that the boats were never left for us.`,
  },
  {
    id: "P19",
    title: "How to Drown Politely",
    file: "for_new_swimmers.txt",
    body: `Practical, since I've watched two people learn this badly.

You do NOT sink like a stone. You settle, slowly, and there's time to fix it. Kick up. It costs you, but less than a jump. Get your head over the line and just float a moment — the panic burns more air than the swimming does.

The deep channels are two and a half metres. That's nothing. You can stand on the bottom and push off and break the surface with air to spare, as long as you don't spend the first four seconds thrashing.

Everybody thrashes. Try not to be everybody.`,
  },
  {
    id: "P20",
    title: "The Door Swings Both Ways",
    file: "last_entry_pools.txt",
    body: `Been down here eleven weeks. Long enough to have favourite rooms. Long enough that the yellow feels like a rumour.

I want to put one thing in the archive before I go up: the Poolrooms are not a deeper level. They're a QUIETER one. The yellow wants to wear you down; the water just waits. I don't know which is worse in the long run and I'm not staying to find out.

Whoever you are, reading this in the blue light with your boots full of water — the way back is still where you left it. The Landing hasn't moved. It never moves.

Go up sometimes. Even if you come back down. Especially if you come back down.`,
  },
];

/** Every level's archive, by level number (Level 0, the Poolrooms, Pipe
 *  Dreams, the Electrical Station). Each strand is found ONLY on its level. */
export const LEVEL_DRIVES: DriveDef[][] = [DRIVES, POOL_DRIVES, PIPE_DRIVES, STATION_DRIVES, OFFICE_DRIVES, HOTEL_DRIVES, LIGHTS_DRIVES, OCEAN_DRIVES, CAVE_DRIVES, SUBURB_DRIVES];
const NOTES: Record<string, { desc: string; ada: string }> = {
  ...LOBBY_DRIVE_NOTES,
  ...POOL_DRIVE_NOTES,
  ...PIPE_DRIVE_NOTES,
  ...STATION_DRIVE_NOTES,
  ...OFFICE_DRIVE_NOTES,
  ...HOTEL_DRIVE_NOTES,
  ...LIGHTS_DRIVE_NOTES,
  ...OCEAN_DRIVE_NOTES,
  ...CAVE_DRIVE_NOTES,
  ...SUBURB_DRIVE_NOTES,
};
for (const set of LEVEL_DRIVES) {
  for (const d of set) {
    const n = NOTES[d.id];
    if (n) {
      d.desc = n.desc;
      d.ada = n.ada;
    }
  }
}
/** Which level a drive belongs to (-1 = none). */
export const driveLevel = (id: string): number => LEVEL_DRIVES.findIndex((set) => set.some((d) => d.id === id));

export const driveById = (id: string): DriveDef | undefined => {
  for (const set of LEVEL_DRIVES) {
    const d = set.find((q) => q.id === id);
    if (d) return d;
  }
  return undefined;
};

/** The one-time world flag the door sets. */
export const LEVEL1_FLAG = "level1_unlocked";
/** The one-time world flag Pipe Dreams' door sets: the drain hatch in the
 *  Poolrooms' floor, opened with Level 1's own key. */
export const LEVEL2_FLAG = "level2_unlocked";
/** The one-time world flag Level 3's door sets: the pressure door at the end
 *  of Pipe Dreams, which opens when three fuses (any three of the ten) are in
 *  its fuse box. */
export const LEVEL3_FLAG = "level3_unlocked";
/** How many fuses the fuse box TAKES — its slots. */
export const FUSE_COUNT = 3;
/** How many fuses lie in the plant: TEN for those three slots, any three
 *  filling the box (Josh, Sep 26: "put like 10 fuses spread out across the
 *  map, just to make it not that hard"; built Oct 10 after the law 11
 *  difficulty review found three-for-three had shipped instead). */
export const FUSE_SITES = 10;
/** The flag a fuse sets when it goes in — one per FUSE, not per slot (world
 *  history, like the door: in once, in forever). The box counts how many
 *  are in; once three are, the spares leave the world. */
export const fuseFlag = (i: number): string => `level3_fuse_${i}`;
/** THE ELECTRICAL STATION (Level 3): one breaker per section, each a flag of
 *  its own (thrown once, thrown forever, for everyone — the fuses' doctrine).
 *  All six on powers the lift shutter: LEVEL4_FLAG. */
export const BREAKER_COUNT = 6;
export const breakerFlag = (section: number): string => `level4_breaker_${section}`;
export const LEVEL4_FLAG = "level4_unlocked";
/** THE SHIP GATE's own switch (CLAUDE.md): a member walks into the station
 *  only once Josh has walked it in Test play and opened it from the Admin
 *  Panel — LEVEL3_FLAG alone is not enough. The admin may always enter. */
export const STATION_OPEN_FLAG = "level3_open_to_members";
/** THE ABANDONED OFFICE (Level 4): the security keycard badged at the
 *  stairwell door opens the way on, once, for everyone. */
export const LEVEL5_FLAG = "level5_unlocked";
/** The office's SHIP GATE switch, the station's shape exactly: members walk
 *  in only once Josh has walked it in Test play and opened it. */
export const OFFICE_OPEN_FLAG = "level4_open_to_members";
/** THE TERROR HOTEL (Level 5): the Boiler Key turned in the rusty door opens
 *  the way on, once, for everyone. */
export const LEVEL6_FLAG = "level6_unlocked";
/** The hotel's SHIP GATE switch, the office's shape exactly. */
export const HOTEL_OPEN_FLAG = "level5_open_to_members";
/** LIGHTS OUT (Level 6): the Handwheel fitted to the sea hatch opens the way
 *  on, once, for everyone. */
export const LEVEL7_FLAG = "level7_unlocked";
/** Lights Out's SHIP GATE switch, the hotel's shape exactly. */
export const LIGHTS_OPEN_FLAG = "level6_open_to_members";
/** THALASSOPHOBIA (Level 7): the Diving Helmet worn to the subway stair at
 *  the bottom of the sunken plaza opens the way on, once, for everyone. */
export const LEVEL8_FLAG = "level8_unlocked";
/** Thalassophobia's SHIP GATE switch, the hotel's shape exactly. */
export const OCEAN_OPEN_FLAG = "level7_open_to_members";
/** THE CAVE SYSTEM (Level 8): the Climbing Rope fixed at the Chimney's foot
 *  opens the climb to Level 9, once, for everyone. */
export const LEVEL9_FLAG = "level9_unlocked";
/** The Cave System's SHIP GATE switch, the hotel's shape exactly. */
export const CAVE_OPEN_FLAG = "level8_open_to_members";
/** THE SUBURBS (Level 9): the House Key turned in Number 9's front door opens
 *  the way OUT, once, for everyone — the end of the descent. */
export const LEVEL10_FLAG = "level10_unlocked";
/** The Suburbs' SHIP GATE switch, the hotel's shape exactly. */
export const SUBURBS_OPEN_FLAG = "level9_open_to_members";

/** How many levels are reachable on foot: Level 0 always, then one more for
 *  each way down opened IN ORDER (Level 9 is the last; LEVEL10 is the way out).
 *  One count for Voss and the brain's facts (Oct 2026 review — both stopped
 *  at three). */
export function levelsReachable(getFlag: (flag: string) => unknown): number {
  const ways = [LEVEL1_FLAG, LEVEL2_FLAG, LEVEL3_FLAG, LEVEL4_FLAG, LEVEL5_FLAG, LEVEL6_FLAG, LEVEL7_FLAG, LEVEL8_FLAG, LEVEL9_FLAG];
  let open = 1;
  for (const f of ways) { if (!getFlag(f)) break; open++; }
  return open;
}

// ---- Placement --------------------------------------------------------------
// Deterministic from the sector seed: the same drive is in the same room
// forever, for everyone, with no placement table in the database. The map is
// frozen, so this is as permanent as the walls.

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Placeable floor — THE PLACEMENT LAW (placement.ts): open, not scenery, not
 *  a lethal shaft, not swum for, not under furniture or a solid prop, not a
 *  stair, and reachable on foot from the level's door. Every picker below
 *  goes through it. */
const walkable = placeable;

/** Where every drive lies. Spread out, off the doorstep, and biased DEEP —
 *  a drive should be a walk, not a lobby pickup. */
export function driveSites(s: Sector, drives: DriveDef[] = DRIVES): { id: string; x: number; y: number }[] {
  const rnd = mulberry32(s.seed ^ 0x51fe);
  const out: { id: string; x: number; y: number }[] = [];
  const MIN_FROM_DOOR = 28; // cells (~56m) — nothing right by an entrance
  const MIN_APART = 22;
  // THE MAP EDITOR's drive SPOTS (marks.ts) come first, in the order the map
  // lists them — a spot is where the designer said, not a suggestion — and
  // any drives left over find places of their own below.
  const spots = (s.marks ?? []).filter((m) => m.k === "drive" && walkable(s, Math.floor(m.x), Math.floor(m.y)));
  let spot = 0;
  for (const d of drives) {
    let placed: { x: number; y: number } | null = null;
    if (spot < spots.length) {
      const m = spots[spot++];
      out.push({ id: d.id, x: Math.floor(m.x) + 0.5, y: Math.floor(m.y) + 0.5 });
      continue;
    }
    // Relax the spacing rule if the map is crowded rather than fail to place.
    for (let attempt = 0; attempt < 4000 && !placed; attempt++) {
      const apart = attempt < 3000 ? MIN_APART : MIN_APART / 2;
      const x = 3 + Math.floor(rnd() * (s.size - 6));
      const y = 3 + Math.floor(rnd() * (s.size - 6));
      if (!walkable(s, x, y)) continue;
      let doorD = Infinity;
      for (const door of s.doors) doorD = Math.min(doorD, Math.hypot(door.x - x, door.y - y));
      if (doorD < MIN_FROM_DOOR) continue;
      if (out.some((o) => Math.hypot(o.x - x, o.y - y) < apart)) continue;
      placed = { x, y };
    }
    if (placed) out.push({ id: d.id, x: placed.x + 0.5, y: placed.y + 0.5 });
  }
  return out;
}

/** THE DOOR: the deepest reachable cell from the four entrances — "everything
 *  in Level 0 exists in relation to that door" (Drive 003), so it sits as far
 *  inside as the level allows. Deterministic; needs the walk-distance map the
 *  worldgen already computes. */
export function doorSite(s: Sector, distFromEntries: Int32Array, ok: (x: number, y: number) => boolean = () => true): { x: number; y: number } {
  let best = { x: Math.floor(s.size / 2), y: Math.floor(s.size / 2), d: -1 };
  for (let y = 0; y < s.size; y++) {
    for (let x = 0; x < s.size; x++) {
      const i = y * s.size + x;
      if (s.solid[i] || !ok(x, y)) continue;
      const d = distFromEntries[i];
      if (d > best.d) best = { x, y, d };
    }
  }
  return { x: best.x + 0.5, y: best.y + 0.5 };
}

/** THE KEY: deliberately hard. It goes inside a stamped LANDMARK — a place
 *  with a name, so it can be talked about — as far from the door as the level
 *  allows, and if landmarks somehow fail, the deepest cell far from the door. */
export function keySite(
  s: Sector,
  door: { x: number; y: number },
  ok: (x: number, y: number) => boolean = () => true,
): { x: number; y: number; landmark: string | null } {
  let best: { x: number; y: number; landmark: string | null; d: number } | null = null;
  for (const l of s.landmarks) {
    const cx = l.x + l.w / 2;
    const cy = l.y + l.h / 2;
    const d = Math.hypot(cx - door.x, cy - door.y);
    if (best && d <= best.d) continue;
    // A walkable cell inside the landmark, scanned deterministically.
    for (let yy = l.y; yy < l.y + l.h; yy++) {
      for (let xx = l.x; xx < l.x + l.w; xx++) {
        if (!walkable(s, xx, yy) || !ok(xx, yy)) continue;
        best = { x: xx + 0.5, y: yy + 0.5, landmark: l.name, d };
        yy = l.y + l.h;
        break;
      }
    }
  }
  if (best) return { x: best.x, y: best.y, landmark: best.landmark };
  // Fallback: the far side of the map from the door.
  const rnd = mulberry32(s.seed ^ 0x9a13);
  for (let i = 0; i < 8000; i++) {
    const x = 3 + Math.floor(rnd() * (s.size - 6));
    const y = 3 + Math.floor(rnd() * (s.size - 6));
    if (!walkable(s, x, y) || !ok(x, y)) continue;
    if (Math.hypot(x - door.x, y - door.y) < s.size * 0.45) continue;
    return { x: x + 0.5, y: y + 0.5, landmark: null };
  }
  return { x: 2.5, y: 2.5, landmark: null };
}

/** PIPE DREAMS' FUSES (Josh, Sep 2026: "level 2 is find 3 fuses for fuse
 *  box" — any three of FUSE_SITES): the homes, all in the far half of the plant from the drain
 *  and spread as far from each other as the map allows (farthest-point
 *  sampling, starting at the deepest cell). Deterministic from the map, like
 *  the key: the same fuse is in the same place for everyone, every boot. */
export function fuseSites(s: Sector, distFromEntries: Int32Array, n: number = FUSE_COUNT, ok: (x: number, y: number) => boolean = () => true): { x: number; y: number }[] {
  let maxD = 0;
  for (let i = 0; i < distFromEntries.length; i++) if (distFromEntries[i] > maxD) maxD = distFromEntries[i];
  const cands: { x: number; y: number; d: number }[] = [];
  for (let y = 0; y < s.size; y++)
    for (let x = 0; x < s.size; x++) {
      const d = distFromEntries[y * s.size + x];
      if (d < maxD * 0.45 || !walkable(s, x, y) || !ok(x, y)) continue;
      cands.push({ x, y, d });
    }
  if (!cands.length) return [];
  const out: { x: number; y: number }[] = [];
  let first = cands[0];
  for (const c of cands) if (c.d > first.d) first = c;
  out.push({ x: first.x + 0.5, y: first.y + 0.5 });
  while (out.length < n) {
    let best: { x: number; y: number; far: number } | null = null;
    for (const c of cands) {
      const far = Math.min(...out.map((o) => Math.hypot(o.x - c.x - 0.5, o.y - c.y - 0.5)));
      if (!best || far > best.far) best = { x: c.x, y: c.y, far };
    }
    if (!best || best.far < 1) break;
    out.push({ x: best.x + 0.5, y: best.y + 0.5 });
  }
  return out;
}
