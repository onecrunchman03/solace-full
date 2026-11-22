// THE LIGHTS OUT ARCHIVE — twenty drives found only on Level 6. Same rules as
// the other archives (lore.ts): text never leaves the server until found, an
// unlock is permanent and global. Ids are L-prefixed and FOREVER.
//
// What the strand is for: the level's rules said in its own voice — the dark
// that drinks the beam, the batteries, the thing that hunts by ear (it is
// blind; noise is everything, voices most of all), its two touches, the
// water in the Wet End that turns every step into a splash, the missing
// wheel and the hatch you find by listening for the sea. Nothing here says
// where the Handwheel lies: it is drawn per map, and a drive that gave it
// away would be wrong on every other.
import type { DriveDef } from "./lore";

export const LIGHTS_DRIVES: DriveDef[] = [
  {
    id: "L01",
    title: "The Stair Down",
    file: "below_the_rusty_door.txt",
    body: `The Boiler Key turned and the rusty door opened on stairs. Concrete, no rail, going down into a dark that the torch could not get to the bottom of.

We went down slowly. The heat from the Boiler Room stayed behind us like it wasn't allowed further.

At the bottom: a small room with a dead bulb in a cage, and two doorways. That's all the light there is. Past those doorways there is nothing but yours.

The air is cold and wet and it smells of concrete that has never dried.

It is very quiet. I want to write that down before anything else. It is the quietest place I have ever been, and after a minute you realise the quiet is not empty. It is listening.`,
  },
  {
    id: "L02",
    title: "Battery Count",
    file: "battery_inventory.txt",
    body: `INVENTORY — DAY 2

Torch batteries carried down: 14
Used: 9
Remaining: 5

Note: they do not last as long down here. Nobody can agree why. The torch is on the same setting it was on upstairs. The beam is the same colour. It just ends sooner, and the battery goes faster, as if the dark is drinking it.

We found three spares in a store room in a box marked FOR EXCHANGE. One of them worked.

Rule from today: one torch on at a time in a group. The rest walk in it.`,
  },
  {
    id: "L03",
    title: "Where the Beam Stops",
    file: "torch_range_test.txt",
    body: `Test: torch at full charge, pointed down a straight corridor, surveyor walks away from it until she can't be seen.

Upstairs (Level 0) she was still visible at thirty metres.
Down here: twelve. Maybe less.

It isn't fog. There's nothing in the air. The light just stops, the way a voice stops in a padded room.

The concrete swallows it. Everything down here swallows everything. Light, heat, the sound of your own feet if you're careful.

Not other sounds, though. Other sounds carry.`,
  },
  {
    id: "L04",
    title: "It Can't See You",
    file: "observation_notes_04.txt",
    body: `We have seen it now. Twice, for about a second each, at the end of the beam.

Pale. Tall. No eyes. Not covered, not closed. There is just nothing there where eyes would be.

The second time, Harlan had the torch full on it. It didn't flinch. It didn't look at the light, because it can't. It turned its head toward Harlan's breathing instead.

Everything we learned upstairs about torches is useless here. You cannot drive it off with a beam. You cannot hide from it in the dark either, because it does not care about the dark.

It cares about noise.`,
  },
  {
    id: "L05",
    title: "What It Hears",
    file: "listening_test.txt",
    body: `We tested it, as best we could, with a portable speaker and a lot of distance.

Footsteps at a walk: it barely turns.
Footsteps running: it comes.
A dropped tin: it comes.
Water: it comes faster. Something about the splash.
Crouched, slow, on dry floor: nothing. It walked past Okafor at two metres while he was crouched against a wall with his hand over his mouth.

And voices. It hears voices further than anything. A normal speaking voice brought it from the far end of a long corridor.

We have stopped talking. We write each other notes in the torchlight.`,
  },
  {
    id: "L06",
    title: "Radio Discipline",
    file: "memo_radio_and_voice.txt",
    body: `MEMO — ALL SURVEY STAFF, LEVEL 6

Effective immediately:

1. No talking above a whisper on this level. None.
2. Radios on the lowest volume and off when not transmitting. The walkie is quieter than your voice and still not quiet enough.
3. If you need to speak to someone, walk to them.
4. If you hear somebody else talking, move AWAY from them. Whatever is coming is coming for the voice, and you do not want to be standing next to it.

I know this is hard. I know the dark makes everyone want to talk. Talking is how people are found down here, and not by us.`,
  },
  {
    id: "L07",
    title: "The First Touch",
    file: "incident_report_touch.txt",
    body: `INCIDENT REPORT — SURVEYOR M. OKAFOR (uninjured)

At approx. 14:20 Okafor reported a hand on the back of his neck. Cold, long fingers, there and gone. He reports a whisper at the same moment, close to his left ear, no words he could make out.

He did not scream. He says he doesn't know why he didn't. He crouched, held still and held his breath, and after a few seconds he heard it step away from him and go on down the corridor.

He is uninjured. He is also not well.

Note for the manual: it does not kill on the first touch. It touches first. The first touch is how it finds out what you are. Whatever you do in the next few seconds decides whether there is a second one.`,
  },
  {
    id: "L08",
    title: "The Second Touch",
    file: "incident_report_harlan.txt",
    body: `INCIDENT REPORT — SURVEYOR D. HARLAN (deceased)

Harlan was touched at approx. 09:40 while crossing the flooded corridors at the far end. He did what Okafor did. He crouched and held still.

He was standing in water. Every small movement he made, even breathing, moved the water.

It came back.

We heard nothing for a long moment and then we heard him, once.

Recommendation: if you are touched in the water, do not wait. Get out of the water first. Then be still.`,
  },
  {
    id: "L09",
    title: "Marking the Walls",
    file: "spray_paint_system.txt",
    body: `Every corridor here looks like every other corridor. Every room looks like the last room. Your torch shows you two metres of wall and the wall is grey.

We have started marking with spray cans. Arrows pointing back to the stair. A number for each junction. An X on a dead end so nobody walks down it twice.

The paint is the only colour on this level.

If you find our marks, they are true as of the day they were made. Add your own. Somebody will be glad of them.`,
  },
  {
    id: "L10",
    title: "The Wet End",
    file: "notes_on_the_flooded_section.txt",
    body: `At the far end of the level, the floor goes under. Not deep: ankle, maybe a little over. Cold enough to ache.

The rooms down there are bigger and the corridors are the same. Water on everything, dripping from the ceiling, running down the walls.

The water makes a sound with every step. There is no way to walk through it quietly. We tried. Slow, careful, toe first. It still makes a sound, and it still comes.

If you have to cross the Wet End, cross it once, know where you're going, and don't stop.`,
  },
  {
    id: "L11",
    title: "The Missing Wheel",
    file: "hatch_survey.txt",
    body: `We found a door at the far end of the flooded section. Not a door. A hatch: steel, riveted, a raised sill, the kind you'd see on a ship. A watertight hatch in the wall of a basement.

It has a hub in the middle where the wheel should go to dog it open. The wheel is gone. The hub is clean; it hasn't rusted. Somebody took it off on purpose.

We have looked for it. It isn't in the flooded section; we searched every room down there. It is somewhere in the dry part of the level, back in the dark, carried there by whoever took it, or by whatever.

A handwheel. About so big. Heavy. If you find it, you will know it.`,
  },
  {
    id: "L12",
    title: "Listen for the Sea",
    file: "how_to_find_the_hatch.txt",
    body: `The hatch has no light, no sign, no paint. In the dark you could walk past it three times.

You won't, if you listen.

Stand still in the flooded section and hold your breath. Past the dripping you'll hear it: surf. Waves breaking, a long way off and right behind the steel. It gets louder as you get close.

There is an ocean behind that hatch. I don't know how. I'm just telling you where it is.`,
  },
  {
    id: "L13",
    title: "Eyes",
    file: "night_watch_log.txt",
    body: `Night watch, store room, the four of us with the torches off to save batteries.

Around what my watch says is three in the morning, Petra nudged me and pointed at the doorway.

Two small lights at about head height. Pale. Very still. Like a cat's eyes catching a torch, except there was no torch on.

When I turned mine on there was nothing in the doorway.

We don't know what that was. It wasn't the thing. The thing has no eyes. That's the part I keep coming back to.`,
  },
  {
    id: "L14",
    title: "My Mother's Voice",
    file: "surveyor_journal_14.txt",
    body: `I heard my mother today. Plainly, in the corridor behind me, telling me off the way she did when I was nine and came home late. Exactly that voice.

My mother has been dead for eleven years.

Petra says she heard her sister. Okafor says he heard an old teacher. Always someone telling us off. Always behind us.

The manual says it's the quiet: the mind fills the silence with what it knows. The manual is probably right.

I didn't turn around. I'd like it written down that I didn't turn around.`,
  },
  {
    id: "L15",
    title: "The Partitions",
    file: "partition_room_notes.txt",
    body: `There is a kind of room down here that is cut up into bays by concrete partitions, waist to ceiling, with gaps between them.

In the dark it is a maze. Every bay is the same. You go in one gap and out another and you are not sure it isn't the same gap.

Mark them. Always mark them. I spent forty minutes in one with a dying torch before I found the doorway I'd come in by, and I could hear it the whole time in the next bay over, turning its head.`,
  },
  {
    id: "L16",
    title: "Somebody Worked Here",
    file: "found_in_a_desk.txt",
    body: `Found in the drawer of a steel table in a small concrete office:

a pencil; a cup with a dry brown ring; a timesheet with the hours filled in for a week and the name column left blank; and a note:

"Lights out at 6. Don't make a sound after. Don't answer if you hear your name. Put the wheel back where you found it, and NOT near the water."

There's nobody to ask who wrote it. The chair was pushed back like they'd just stood up.`,
  },
  {
    id: "L17",
    title: "The Pillar Hall",
    file: "pillar_hall_sketch.txt",
    body: `A wide low hall held up on square concrete pillars. In the torchlight the pillars throw long shadows, and every shadow looks like someone standing very still.

I counted the pillars on the way in. When I counted them on the way out there was one more.

I am fairly sure I miscounted. I am writing it down anyway.`,
  },
  {
    id: "L18",
    title: "Crossing Alone",
    file: "radio_log_kestrel.txt",
    body: `RADIO LOG — SURVEYOR KESTREL, CROSSING THE LEVEL (transcribed; her transmissions were whispered)

09:02 — Leaving the stair. Torch on low.
09:31 — Lost my mark in the partitions. Found it again.
09:58 — Store room. Two batteries. Thank God.
10:40 — I can hear it. Far. I'm crouched. I'm not moving.
10:52 — Gone the other way. Moving again, slow.
11:15 — Water. Starting across. I can hear the sea. Not stopping.
11:20 — Touched. Running out of the water now, I'm getting out —
11:21 — Out. Dry floor. Crouched. Breathing through my sleeve.
11:30 — It's gone. I'm at the hatch.

That's the whole method. Slow in the dark, quick through the water, still when it's close.`,
  },
  {
    id: "L19",
    title: "The Cistern",
    file: "cistern_acoustics.txt",
    body: `The biggest room in the flooded section: a tall hall standing in water on square columns, the ceiling out of the beam's reach.

Sound does strange things in here. A drip at one end arrives at the other end twice. A footstep echoes off the water and the columns and comes back from three directions.

If you can't tell where it is in the Cistern, it can't tell where you are either. That's the only good thing I can say about the place.`,
  },
  {
    id: "L20",
    title: "Behind the Hatch",
    file: "last_entry.txt",
    body: `We found the wheel. I won't say where; it won't be there for you.

We carried it through the water to the hatch, and we fitted it to the hub, and it took two of us to turn it. The dogs came off one by one, and the hatch swung in, and the sound of the sea came through like a wall.

Beyond it: stairs going down, wet, and at the bottom, water. Real water. The whole of it, as far as the torch could go and further. No walls. No ceiling we could see.

We didn't go down. Not yet.

If you're reading this, you came the same way. Go carefully. You did the hard part in the dark. The next part is the sea.`,
  },
];

/** Dr. Voss's description and note for every drive (law 1). */
export const LIGHTS_DRIVE_NOTES: Record<string, { desc: string; ada: string }> = {
  L01: {
    desc: "A surveyor's account of the stairs down from the rusty door into the dark.",
    ada: "The temperature falls fourteen degrees across the stair. The ambient light at the bottom measures zero on every instrument we carry. The silence is not literal; the room tone is very low and very steady.",
  },
  L02: {
    desc: "A battery inventory from the second day on Level 6.",
    ada: "Battery life on this level runs at about two thirds of the surface figure under identical load. Spares turn up in the store rooms. 'One torch on in a group' is now standing procedure.",
  },
  L03: {
    desc: "A torch range test: how far the beam reaches on Level 6.",
    ada: "The beam's useful reach here is under half what it is on Level 0. There is no particulate to scatter it. The light simply attenuates faster than physics allows, which I have recorded and stopped arguing with.",
  },
  L04: {
    desc: "A surveyor's first sightings of the creature that hunts Level 6.",
    ada: "It has no eyes and no response to light at any intensity. Every light-based deterrent we have is useless here. I have not yet named it in the field manual; the surveyors call it the Listener.",
  },
  L05: {
    desc: "Notes from a test of what the creature hears, and from how far.",
    ada: "Ranked by distance heard: voice, then a run, then water or a dropped object, then a walk. A crouch on dry floor did not register at two metres. These ranges are now in the briefing, in that order.",
  },
  L06: {
    desc: "A memo to all survey staff on voices and radios on Level 6.",
    ada: "The single most effective survival rule on this level is to stop talking. The proximity channel carries further than you think. Walk to your partner. If you hear someone talking, leave them.",
  },
  L07: {
    desc: "An incident report on a surveyor touched once by the creature, and unharmed.",
    ada: "The first contact is not an attack. It is identification. Survivors moved away or went silent in the following five seconds; that window is the whole of the method.",
  },
  L08: {
    desc: "An incident report on a surveyor killed after a second touch in the water.",
    ada: "Standing still in the water is not silent; the water moves with you. The second contact follows within seconds if it can still hear you. Get to dry floor, then be still.",
  },
  L09: {
    desc: "A note on the survey team's spray-paint marking system.",
    ada: "The marks are the only reliable map of this level. Arrows to the stair, numbers at junctions, an X at dead ends. Every team should carry a can and add to them.",
  },
  L10: {
    desc: "Notes on the flooded section at the far end of Level 6.",
    ada: "The Wet End is ankle-deep throughout. Every step in it is audible at range. Plan your crossing before you enter it, and do not stop in the water.",
  },
  L11: {
    desc: "A survey of the watertight hatch in the flooded section, and its missing wheel.",
    ada: "The hatch's handwheel has been removed deliberately and is somewhere in the dry corridors, never in the flooded section. It is the only way on that we have found.",
  },
  L12: {
    desc: "Directions for finding the hatch by sound.",
    ada: "The hatch is unmarked and unlit. The sound of surf behind it is audible from a considerable distance in the flooded section and grows as you approach. Listen; do not search by sight.",
  },
  L13: {
    desc: "A night watch log: pale eyes in a doorway with the torches off.",
    ada: "Not the Listener, which has no eyes. Several teams report this; nobody has seen it with a torch on. I have no explanation and no recorded harm. I record it so you are not surprised.",
  },
  L14: {
    desc: "A surveyor's journal: the voices of people long dead, behind them in the dark.",
    ada: "Auditory hallucination is common here, almost always a familiar voice, almost always behind you. Do not answer it and do not turn toward it. The real danger on this level does not need to call you.",
  },
  L15: {
    desc: "Notes on the partition rooms, the level's mazes.",
    ada: "The partition rooms are the commonest place to lose your bearings. Mark the gap you entered by before you go in. Batteries run down fastest in rooms you are lost in.",
  },
  L16: {
    desc: "The contents of a desk drawer in a dead office, and a note.",
    ada: "The handwriting predates our survey. Somebody worked here under these rules long before us, and kept the wheel away from the water, which agrees with everything we have found since.",
  },
  L17: {
    desc: "A sketch of the Pillar Hall, and a pillar count that didn't add up.",
    ada: "The pillar halls are structurally ordinary and acoustically dead. I have counted the pillars in one several times and get the same number each time. I have not counted on the way out.",
  },
  L18: {
    desc: "A radio log of a surveyor crossing Level 6 alone, start to hatch.",
    ada: "Kestrel's crossing is the model: slow in the dark, batteries from the stores, still when it is near, fast through the water, and dry floor after a touch. Every surviving crossing we have looks like this one.",
  },
  L19: {
    desc: "Notes on the acoustics of the Cistern in the flooded section.",
    ada: "Echo in the Cistern confuses direction for us and, as far as I can tell, for it. It is a poor place to be found and a reasonable place to hide, provided you can stand in the water without moving.",
  },
  L20: {
    desc: "The last entry from the team that opened the hatch.",
    ada: "Beyond the hatch is open water with no visible boundary. Level 7 is not yet surveyed, and I am not yet ready to send anyone. You did the hard part in the dark. I mean that as a compliment.",
  },
};
