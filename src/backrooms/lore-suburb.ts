// THE SUBURBS ARCHIVE — twenty drives found only on Level 9. Same rules as
// the other archives (lore.ts): text never leaves the server until found, an
// unlock is permanent and global. Ids are U-prefixed and FOREVER.
//
// What the strand is for: the level's rules said in its own voice — the
// manhole you climb out of and the one streetlight over it; the streets that
// go on in a grid and the houses that repeat; the dead streetlights and the
// few that still burn; every door unlocked and every house empty; the thing
// in the beige windbreaker that walks at night, whistling, and what the
// surveyors learned about it — it keeps out of the light, it never comes in,
// it knocks, and it reaches; don't stand by the door. Then the House Key,
// Number 9 at the end of the street with its porch light on, the front door,
// and the last entry: this is the way out.
// Nothing here says where the House Key lies: it is drawn per map, and a
// drive that gave it away would be wrong on every other.
import type { DriveDef } from "./lore";

export const SUBURB_DRIVES: DriveDef[] = [
  {
    id: "U01",
    title: "Up Through the Manhole",
    file: "top_of_the_chimney.txt",
    body: `The rope held all the way up. At the top of the chimney there's a ladder, iron rungs set in brick, and at the top of the ladder a manhole cover, already pushed half aside.

I put my head out into the night.

A street. Tarmac, still warm. A kerb. A lawn, cut short. A streetlight right over me, orange, humming.

It's quiet. Not the quiet of a cave. The quiet of a street at three in the morning, when everyone's asleep.

I climbed out and sat on the kerb and just breathed. The air smells of grass.`,
  },
  {
    id: "U02",
    title: "The Cul-de-sac",
    file: "camp_cul_de_sac.txt",
    body: `CAMP NOTES — the turning circle at the top of the manhole.

It's a dead end. A little loop of road with the manhole in the middle of it and the one streetlight over the manhole. The light works. It's the only one on this street that does.

Houses all round, dark. Hedges. A basketball hoop on a garage with no net.

We're making camp under the light. The manhole is the way home. Nothing has come near the light since we've been here. Nothing has come up the ladder after us.

Keep the circle lit. Keep one person awake.`,
  },
  {
    id: "U03",
    title: "The Same House",
    file: "street_survey_01.txt",
    body: `STREET SURVEY — the first street off the cul-de-sac.

Walked four blocks. The houses are the same house. Not similar. The same. Same porch, same two steps, same crack in the second step. Some are turned round, some are mirrored, a few have the garage on the other side. It's the same plan, over and over.

The gardens differ. One has a gnome. One has a flamingo. One has a swing.

Street signs at every corner. The names on them have been painted over, all of them, the same grey.

I stopped counting houses at a hundred.`,
  },
  {
    id: "U04",
    title: "Every Door Is Open",
    file: "house_entry_log.txt",
    body: `HOUSE ENTRY LOG — first house on the left.

The front door was unlocked. So was the next one. So was every one we've tried since.

Inside: a hall, a front room, a kitchen, stairs that go up to a landing and stop at a wall. Furniture. Pictures on the walls with the faces turned to the wall. A television, off. A clock that ticks but doesn't move.

The beds are made. The fridge hums. There's milk in it, and it's fresh.

Nobody is home. Nobody has been home for a long time, and the milk is fresh.`,
  },
  {
    id: "U05",
    title: "The Streetlights",
    file: "lighting_survey.txt",
    body: `LIGHTING SURVEY — six streets.

Most of the streetlights are dead. Bulbs in, wires in, nothing. Every few streets one still works, and throws a round orange pool on the tarmac, and the dark around it looks darker for it.

Some of them flicker. On, off, on. Those are worse than the dead ones, because you think you're standing in light and then you aren't.

I've started a map of the ones that work. They don't move. I'd like that written down, because nothing else up here seems to stay put.`,
  },
  {
    id: "U06",
    title: "Whistling",
    file: "incident_report_01.txt",
    body: `INCIDENT REPORT — surveyors M. and J., on the third street.

Both heard somebody whistling. A slow tune, an old one, the kind your grandfather whistled doing the dishes. It came from a few streets over and it was walking — you could hear the footsteps under it, heels on tarmac.

They called out. The whistling stopped.

Then it started again. Closer.

They ran back to the cul-de-sac and stood under the light. The whistling came down the street towards them and stopped at the edge of the light, and stayed there for a long time, and then went away.

Neither of them looked. They both want that written down.`,
  },
  {
    id: "U07",
    title: "The Man in the Windbreaker",
    file: "observation_watch.txt",
    body: `OBSERVATION — from under the cul-de-sac light, looking down the road.

It stood just past where the light stops. Tall. Too tall, and too thin, like a coat on a hanger. A beige windbreaker zipped to the chin. Hands in the pockets.

A face. Or a smile, anyway. A wide, patient smile. Nothing else on the face that I could see. Nothing above the smile at all.

It didn't come into the light. It stood exactly at the edge, toes on the line, and watched us, and smiled.

After a while it turned and walked away down the middle of the road, whistling.

M. is calling it the Neighborhood Watch. Nobody's laughing.`,
  },
  {
    id: "U08",
    title: "Surveyor J., Last Recording",
    file: "helmet_cam_J.txt",
    body: `[Transcript — helmet recorder, surveyor J., recovered from a front lawn on the fourth street.]

— it's the whistling again. Behind me. Two streets maybe.

— I'm going for the light at the corner. It's a long way. It's — okay, that one's dead. That one's dead too.

— it's stopped whistling. I can hear its feet. It's not walking now.

— I can't outrun it. I thought I could. I'm going to — there's a house, I'm going in a house —

[Footsteps, a door, breathing. A knock, three times, slow. Eleven seconds of quiet.]

— it's not coming in. It's not coming —

[The recorder ran for another two hours. The front door was found open.]`,
  },
  {
    id: "U09",
    title: "It Knocks",
    file: "incident_report_04.txt",
    body: `INCIDENT REPORT — surveyor M., sheltering in a house on the fifth street.

It followed her to the house and stopped on the front step. It didn't come in. She says she knew it wouldn't, the way you know a dog won't come past the gate.

It knocked. Three times, slow, polite.

She was standing in the hall, right by the door. Something came round the door frame — she says an arm, long, in a beige sleeve — and felt along the wall towards her, patting, like someone looking for a light switch in the dark.

She went backwards into the kitchen. The arm stopped short. It knocked again, later, twice more, and then it went away whistling.

She is very clear: it couldn't reach the kitchen.`,
  },
  {
    id: "U10",
    title: "Standing Orders",
    file: "standing_orders_suburbs.txt",
    body: `STANDING ORDERS — the streets. Read before every walk.

1. The thing in the windbreaker walks the streets at night. It is always night up here.
2. It whistles when it walks. When the whistling stops, it has seen something. Assume it was you.
3. It will not come into the light. A working streetlight is safe ground. A flickering one is not.
4. It will not come into a house. But it will come to the door, and it will knock, and it will reach. Get away from the door. Go to the back of the house.
5. Don't come back out while it's waiting. It waits a while. It always gives up.
6. You can't outrun it. You can outrun it to a light, if the light is close.

Every surveyor who has followed these has come home. J. ran past a dead light.`,
  },
  {
    id: "U11",
    title: "Waiting in the Kitchen",
    file: "the_back_of_the_house.txt",
    body: `I spent twenty minutes in somebody's kitchen tonight, with the lights off, while it stood on the front step.

The knocking came every so often. Polite. Three knocks. Once it said something through the letterbox, very softly, that I won't write down, in my mother's voice.

I stood with my back to the fridge and counted. The fridge hummed. The clock ticked and didn't move.

Then the whistling started up again, outside, going away down the street. Fainter, and fainter.

I gave it another ten minutes before I went out the back. The back gardens connect, if you know where the gaps in the fences are. I'm learning.`,
  },
  {
    id: "U12",
    title: "The Gardens",
    file: "yard_survey.txt",
    body: `YARD SURVEY — the lots between the streets.

Every house has a front lawn and a back garden. Fences between them, low and white at the front, tall and wooden at the back. Some of the back fences have gaps, a missing slat, a gate left on the latch. You can get a long way through the gardens without setting foot on a street.

There's a park two streets over. Grass, swings, a slide, a roundabout that turns very slowly on its own when there's no wind. No lights in the park at all.

Don't cross the park. It's the darkest place up here and it is very, very open.`,
  },
  {
    id: "U13",
    title: "What It Wants",
    file: "watch_notes_m.txt",
    body: `Notes on the Watch. Surveyor M.

It patrols. It walks the streets in long loops, slowly, whistling. It doesn't seem to be looking for anything until it sees you.

When it sees you it stops whistling and walks faster. Not running. It never runs. It just covers the ground faster than you'd think, and it doesn't get tired.

It keeps to the dark. It goes around the streetlights the way you'd go around a puddle.

I think it thinks it's protecting the street. I think, as far as it's concerned, we're the strangers who shouldn't be out this late.`,
  },
  {
    id: "U14",
    title: "Front Room Television",
    file: "front_room_notes.txt",
    body: `HOUSE NOTES — a house on the sixth street, front room.

The television was on when we came in. It was the only lit screen we've found. It showed this room. From where the television stood, the sofa, the window, the street outside.

The street on the screen was empty. The street out of the window had the Watch in it, under a dead streetlight, facing the house.

We turned the set off. When we turned it on again, the room on the screen had us in it, sitting on the sofa, very still, and the front door open behind us.

We left by the back.`,
  },
  {
    id: "U15",
    title: "Survey Chalk",
    file: "chalk_marks.txt",
    body: `There are chalk marks on the pavements. Not ours. Older.

Arrows. Numbers. Circles round some of the manholes. A cross on some front doors, and a tick on others. Someone surveyed this place before us, and marked the houses as they went.

On the last street I've walked so far, the arrows all point the same way, down the road, towards the end. Somebody wrote under one of them, in letters a foot high:

KEEP GOING. THE LAST HOUSE. THE ONE WITH THE LIGHT ON.`,
  },
  {
    id: "U16",
    title: "Number 9",
    file: "the_last_house.txt",
    body: `At the very end of the neighbourhood, past the last street, there is a house with its porch light on.

The only porch light we've seen lit. It's a warm yellow, not orange, and it lights the step and the path and the brass number on the door.

The Watch won't go near it. We watched it walk the last street end to end and it crossed to the far pavement to go round that house.

The front door is shut. It's the only shut door up here. It's locked. There's a key-hole, brass, polished, as if someone uses it every day.

Something on the other side of that door smells like Sunday dinner.`,
  },
  {
    id: "U17",
    title: "The House Key",
    file: "key_found.txt",
    body: `Found a key today. A single house key, brass, on a ring with a paper tag. The tag's been written on and rubbed out so many times it's gone furry.

It was inside one of the houses, set down neatly, the way you'd leave it by the door for whoever comes home next.

It doesn't fit the house we found it in. We tried. It doesn't fit any of the houses on that street.

There's only one locked door up here. I've got a feeling about it, and I'm trying very hard not to get my hopes up.`,
  },
  {
    id: "U18",
    title: "The Foundry's Interest",
    file: "memo_threshold4_suburbs.txt",
    body: `MEMO — Threshold-4 to the Foundry, filed by Dr. Voss.

The Foundry has asked twice whether the houses on Level 9 contain anything of value. They contain furniture, fresh milk, and clocks that do not move. I have answered twice.

The Foundry has also asked whether the neighbourhood can be reached from the surface. It cannot. Every road ends in more road. We walked a straight line for nine hours and came back to the cul-de-sac from the other side.

The Foundry has not asked about the house with the porch light. I would like that noted. I do not know what it means that they haven't.`,
  },
  {
    id: "U19",
    title: "Things Left Behind",
    file: "find_inventory_u.txt",
    body: `FIND INVENTORY — the houses, a week of searching.

A newspaper on every doorstep, always today's date, whichever day you pick it up.
A pram in a hallway, empty, the blanket folded.
Photographs, every one turned to face the wall.
A child's things, again. We have found a child's things on every level since the pipes. A binky, a bottle. Further down, more. Up here, in a nursery at the back of a house, a rattle, laid on a windowsill where the streetlight touches it.

Whoever she is, she came this way. All the way up.

Dr. Voss has asked us to bring the rattle home. We will.`,
  },
  {
    id: "U20",
    title: "The Front Door",
    file: "last_entry_suburbs.txt",
    body: `Last entry.

The key fits. Of course it fits.

I stood on the step of Number 9 with the porch light on my back and the Watch somewhere behind me, whistling, very far away, and I turned it, and the lock went over like it had been oiled yesterday.

The door opened. There's a hall. There's a coat rack with nothing on it. There's a light on in the kitchen and a radio playing very quietly and the smell of dinner.

I don't know where it goes. I don't think it goes to another level. I think it goes out.

We came down a long way to get here. Every level, one door. This is the last door.

I'm going through. If you're reading this, you can too. Leave the porch light on for whoever's behind you.`,
  },
];

/** Dr. Voss's description and note for every drive (law 1). */
export const SUBURB_DRIVE_NOTES: Record<string, { desc: string; ada: string }> = {
  U01: {
    desc: "The first account of climbing out of the manhole at the top of the Chimney.",
    ada: "Air quality, temperature and smell are consistent with a residential street at night. The ladder and the brick are newer than anything in the caves. The cover was already open, and I have not found who opened it.",
  },
  U02: {
    desc: "Camp notes from the lit cul-de-sac at the top of the manhole.",
    ada: "The camp under the working light has never been approached. The manhole remains the way home. Standing procedure: the circle stays lit and one surveyor stays awake. Both are being followed.",
  },
  U03: {
    desc: "A survey of the first streets, and of houses that are the same house.",
    ada: "One floor plan, rotated and mirrored, with variation confined to the gardens. Street names removed with a single shade of paint. Somebody standardised this neighbourhood, and then took the names away.",
  },
  U04: {
    desc: "A log of entering the houses, all of them unlocked and all of them empty.",
    ada: "Unlocked, furnished, occupied by no one, with perishables that do not perish. The faces in the photographs are turned to the wall in every house surveyed. I have not turned one back, and I have asked that nobody does.",
  },
  U05: {
    desc: "A survey of which streetlights still work, and which flicker.",
    ada: "The working lights are fixed in position and have not changed between surveys. The flickering lights are to be treated as dead for every purpose that matters. The map of working lights is the most valuable document on this level.",
  },
  U06: {
    desc: "The first incident: a whistling heard walking in the streets.",
    ada: "The whistling is the creature's sign. It ceases when the creature has noticed something and resumes when it has not. The surveyors withdrew to light and both lived. The order of events matters here as it did below.",
  },
  U07: {
    desc: "The first clear observation of the thing in the beige windbreaker.",
    ada: "Height well above any surveyor's, a garment and a smile, and nothing I can describe as a face. It halts exactly at the boundary of a working light. That boundary has held in every observation since. The name has stuck. I have let it.",
  },
  U08: {
    desc: "The last recording of a surveyor caught in the streets by the Watch.",
    ada: "J. tried to outrun it to a light that was too far away, past two that were dead. It covers ground faster than a surveyor on foot. Entering the house was correct. Where J. stood inside it was not. I have listened to it in full.",
  },
  U09: {
    desc: "An account of the Watch knocking, and reaching, at a front door.",
    ada: "It does not cross a threshold, but its reach does, a short way. A surveyor in the hall is within it; a surveyor at the back of the house is not. M.'s account is precise and has been confirmed twice. Don't stand by the door.",
  },
  U10: {
    desc: "The team's standing orders for the streets.",
    ada: "Every point is correct. Light is safety, the back of a house is safety, and patience at the back of a house is safety. No surveyor who has followed these orders has been lost to the Watch.",
  },
  U11: {
    desc: "A surveyor's account of waiting out the Watch in a darkened kitchen.",
    ada: "It waits, knocks at intervals, and leaves. The voice at the letterbox has been reported by three surveyors, in three different voices, each belonging to someone the listener knew. I am treating it as a lure and nothing else.",
  },
  U12: {
    desc: "A survey of the gardens and fences between the streets, and of the park.",
    ada: "Gaps in the back fences allow a route between houses that avoids the streets for long stretches. The park has no working lights and no cover. I have marked it on the survey as somewhere to go around.",
  },
  U13: {
    desc: "A surveyor's notes on how the Watch patrols and what it might want.",
    ada: "It patrols in long loops and gives every working light a wide berth. M.'s theory of its motive is plausible and unprovable. I would point out that it has never once asked any of us where we live.",
  },
  U14: {
    desc: "Notes on a television that shows the room it stands in.",
    ada: "The set shows the room as it is and, on a second viewing, as it may shortly be. The team left by the back, which was correct. I have not authorised anyone to turn it on a third time.",
  },
  U15: {
    desc: "The older chalk marks on the pavements, and the message under the arrows.",
    ada: "The marks predate our survey and follow conventions close to our own. Someone surveyed this place before us and finished. Their last instruction is consistent with everything we have found since.",
  },
  U16: {
    desc: "The discovery of Number 9, the last house, with its porch light on.",
    ada: "The only lit porch, the only locked door, and the one house the Watch crosses the road to avoid. The door is the only object on this level I would describe as maintained. Somebody comes and goes through it.",
  },
  U17: {
    desc: "The discovery of the House Key inside one of the houses.",
    ada: "A single brass key, left deliberately, fitting no door on the street it was found in. There is one locked door on this level. I would like the team to keep their hopes in proportion, and I would like to be wrong about that.",
  },
  U18: {
    desc: "A memo to the Foundry about the houses of Level 9 and the questions it has not asked.",
    ada: "I wrote it, and I stand by every line. The Foundry's silence about the lit house is the most informative thing it has sent me this year.",
  },
  U19: {
    desc: "An inventory of things found in the houses, among them a child's rattle in a nursery.",
    ada: "Today's newspaper on every step, and Claire's rattle on a nursery windowsill. Her things have now been found on every level from the pipes to the top. Whoever she is, she made the whole climb. The rattle is coming home with us.",
  },
  U20: {
    desc: "The team's last entry, standing at the open front door of Number 9.",
    ada: "The key turned, the door opened, and the surveyor went through. I have no further entries from her and I have stopped expecting them. Every level had one door. This was the last. I have left the porch light on.",
  },
};
