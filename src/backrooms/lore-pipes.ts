// THE PIPE DREAMS ARCHIVE — twenty drives found only on Level 2. Same rules
// as the other archives (lore.ts): text never leaves the server until found,
// an unlock is permanent and global. Ids are D-prefixed and FOREVER.
import type { DriveDef } from "./lore";

/** The strand: the night crew who kept this plant running and never clocked
 *  out, the people who came down the drain after them, Async's survey, and
 *  two of Dr. Voss's logs. The pipe colour code is consistent across every
 *  drive that mentions it:
 *    RED    — steam, high pressure. Hot. Runs to the boilers and the vents.
 *    BLUE   — water return. Runs UP, back toward the drain you came in by.
 *    GREEN  — staff lines. Runs to the lit rooms: break rooms, control rooms.
 *    YELLOW — conduit. Runs DOWN, deck by deck, to the pressure door.
 *    BLACK  — dead lines. Lead nowhere. Ignore them. */
export const PIPE_DRIVES: DriveDef[] = [
  {
    id: "D01",
    title: "Down the Drain",
    file: "arrival_log_pd.txt",
    body: `I thought the hatch would be the hard part. Ten seconds of breath, straight down through warm water to a grate at the bottom of the deepest pool, and a wheel you have to turn with your lungs already burning. That was the easy part.

The hard part is the other side. You come up out of a sump into air that tastes like old pennies, and it is DARK. Not dim. Dark. There is a bulb in a wire cage maybe fifteen paces off and then nothing, and then another bulb, and then nothing.

I stood there dripping for a long time. Pool water running off me onto concrete, the only warm thing in the room.

If you need the way back: follow the blue pipes. They run uphill, and every blue line I have followed ends at the sump. I don't know why that's the one kindness this place offers. I've decided not to ask.`,
  },
  {
    id: "D02",
    title: "Shift Log — Boiler Deck",
    file: "night_crew_shiftlog.txt",
    body: `NIGHT CREW — BOILER DECK — SHIFT LOG

0200 — Gauges 1 through 6 nominal. Vent 4 still cycling short. Logged it again.
0300 — Walked the red line to the east boilers. Hot as ever. Wore sleeves.
0400 — Dennis says he heard somebody on the catwalk. Nobody on the rota. Told him it was the pipes knocking.
0500 — Gauges nominal. Relief crew not here yet.
0600 — Relief crew not here.
0700 — Relief crew not here.
0800 — Phone in the control room rings through to a dial tone. Dennis wants to walk up and find out. I said we don't leave the deck mid-shift. That's the rule.
0900 — Gauges nominal.
1000 — Gauges nominal. Dennis went up.
1100 — Gauges nominal.

[the entries continue in the same hand, every hour, for four hundred and eleven pages. Dennis is not mentioned again.]`,
  },
  {
    id: "D03",
    title: "Pipe Identification — Memo 7",
    file: "MAINT_MEMO_07_colours.txt",
    body: `MAINTENANCE MEMO 7 — PIPE IDENTIFICATION
To be posted at every stairhead. To be read by every new hand before first shift.

All lines on this plant are colour coded. Learn the code. In the dark it is the only map you will get.

RED — steam, high pressure. Do not touch. Do not lean. Red runs to the boilers and to the vents, and a vent on a red line will burst on its own schedule, not yours.

BLUE — water return. Blue runs uphill to the sump. If you are lost, blue takes you back to where you came in.

GREEN — staff lines. Green runs to the break rooms and the control rooms. Green rooms are lit. Lit rooms are where you rest.

YELLOW — conduit. Yellow runs down, deck after deck, to the switchgear at the bottom of the plant. Nothing on yellow is yours to touch.

BLACK — decommissioned. Dead lines go nowhere. Do not follow a black pipe. Men have.

Report any unmarked line to the shift supervisor.`,
  },
  {
    id: "D04",
    title: "Audio Log — Dr. Voss, Entry 31",
    file: "voss_log_031.wav.txt",
    body: `This is Dr. Ada Voss, research log thirty-one. Level 2. The surveyors are calling it Pipe Dreams, and I have stopped correcting them.

Descent through the drain hatch at 06:10 station time, with Surveyors Hale and Okafor. Transit time, nine seconds. Hale required eleven.

Ambient light between fixtures measures below 0.3 lux. Mean fixture spacing, 14.2 metres, standard deviation high. The fixtures are caged incandescent bulbs on a supply nobody has found. They are not on a timer. Some of them are simply off, and stay off.

At forty-one minutes, Hale reported breathing directly behind him. I was eleven metres away and heard nothing. Okafor, at six metres, heard nothing. Hale turned his lamp and something went away from him fast, making a sound I will not attempt to transcribe. I did not see it. I saw Hale's face.

Working hypothesis: it is audible only to the person it has chosen.

Hale asked me afterwards why I came down first instead of sending a team. I told him protocol. That is not the reason, and I have not decided what the reason is.

End log.`,
  },
  {
    id: "D05",
    title: "Breathing",
    file: "dont_turn_slow.txt",
    body: `Writing this with my back against a lit wall, which is the only way I'm writing anything from now on.

I was on a catwalk over an engine room. Quiet. Properly quiet, the kind where you can hear the bulbs tick. Then footsteps. Behind me. Close. And breathing — not tired breathing. Excited. Wet and quick and happy, like a dog that's just seen its dinner come out of the cupboard.

There was no sound at all until it was right there. That's the part I need you to understand. You get two seconds. Maybe three.

I didn't turn slow. I swung round with the torch already up and put the beam straight in its face, and it SCREAMED — a sound like a kettle and a man at once — and it was gone. Not walked away. Gone, round a corner, and the catwalk was shaking for a full minute after.

I didn't see much of it. Tall. Black. Too many angles in the arms.

Keep your torch in your hand, not your pocket. Every second it spends in your pocket is a second you don't have.`,
  },
  {
    id: "D06",
    title: "The Break Room",
    file: "kettle_still_works.txt",
    body: `Follow the green pipe. I mean that literally. Every green line I've walked ends at a room with the lights on.

This one has a kettle. It works. There's a fridge with nothing in it that hums like it's proud of itself, four plastic chairs, a corkboard with a notice about the fire drill and a sign-up sheet for a five-a-side match nobody ever played. Fluorescent tubes. All of them working. After the tunnels it's like being shouted at with light.

Here is why it matters. Last night I heard it coming down the corridor — the breathing, the steps — and I just sat here with my tea. It came right up to the doorway. I could see the dark bend round the edge of the frame where it stood.

It didn't come in. It stood at the threshold for what my watch says was six minutes, breathing, and then it left.

Lit rooms are safe rooms. I don't know the rule behind it. I know the rule.`,
  },
  {
    id: "D07",
    title: "Steam Discipline",
    file: "MAINT_MEMO_11_vents.txt",
    body: `MAINTENANCE MEMO 11 — VENT SAFETY

Vents on the red lines discharge on a cycle. The cycle cannot be adjusted from the floor. Do not attempt to adjust it.

Every vent HISSES before it fires. You will have roughly one second between the hiss and the plume. Learn to hear it over the general noise of the plant. When you hear it, you do not look for it. You move.

Count the cycle before you pass a vent. Wait for a burst. Count. Go immediately after the next one — never just before.

Steam is opaque to hand lamps. A lit lamp pointed into a plume shows you a white wall and nothing past it. Do not stop in a plume. Do not stand next to a vent to rest. Do not let anyone corner you beside one.

[handwritten underneath, in a different pen:] the last line isn't about the crew. ask Dennis.`,
  },
  {
    id: "D08",
    title: "Async Survey Note — PD-03",
    file: "ASYNC_PD03_fuses.txt",
    body: `ASYNC — THRESHOLD-4 — SURVEY NOTE PD-03
Subject: cartridge fuses, Level 2

Surveyors have now logged TEN ceramic cartridge fuses at separate locations across the plant. All ten are identical: rated far beyond anything the visible wiring could carry, warm to the touch, and dry regardless of where they are found. Several were in rooms with standing water.

At the far end of the plant, at the bottom of the descent, there is a pressure door. Beside it is a fuse box with THREE empty cartridge slots. Any three fuses fit any three slots. We have confirmed the dimensions.

The fuses are distributed widely and, in every case, far from the drain and far from the door. Whoever placed them did not intend them to be collected quickly. Locations are withheld from this note by instruction.

Survey teams are reminded that the fuse box does not accept anything that is not a fuse. Two attempts have been made. Neither surveyor has been reprimanded; both have been asked to stop.

— Filed for A. Voss`,
  },
  {
    id: "D09",
    title: "Time Card",
    file: "punchcard_scan_0447.txt",
    body: `Found this in the rack by the deck 1 stairhead. A whole rack of them, actually. I only scanned one.

EMPLOYEE NO. 0447 — WEEK ENDING [blank]

MON — IN 21:58 — OUT
TUE — IN — OUT
WED — IN — OUT
THU — IN — OUT
FRI — IN — OUT

One stamp. Clocked in for a night shift and never clocked out. Every card in the rack is the same. Forty-odd cards. Forty-odd people who started a shift down here, and not one of them finished it.

I took a blank card out of the box and punched myself in, as a joke. The machine works. It printed my time.

I wish I hadn't done that. I can't explain why. It just feels like I signed something.`,
  },
  {
    id: "D10",
    title: "Locker 114",
    file: "locker_inventory.txt",
    body: `Inventory, locker 114, employee area, deck 2. The lock was already off. I'm writing it down because it seemed wrong to just take things and not say whose they were.

— one pair of work gloves, the right one worn through at the thumb
— a thermos, empty, still smelling of coffee somehow
— a paperback with the last forty pages folded down, as if he meant to come back for them
— a hospital wristband, the tiny kind, the name worn off
— a photo taped to the inside of the door. A man in these same overalls holding a baby up to a window. He looks terrified and delighted at once
— a note, also taped: "Back by Friday. Promise."

I didn't take anything. I put the thermos back where it was. I closed the door properly.

If you find him, tell him somebody kept his locker shut.`,
  },
  {
    id: "D11",
    title: "The Doors That Don't",
    file: "every_door_locked.txt",
    body: `Every door in this place is locked. I don't mean most. I mean every one I've tried — steel doors with hazard stencils, wooden doors marked STAFF ONLY, a little hatch at ankle height labelled INSPECTION. Handles turn. Nothing opens.

I spent a full day on one with a pry bar from the tool crib. Got the frame off in the end. Behind it there is wall. Concrete, poured flush, as old as the rest. The door was never a door. It was a door-shaped thing standing in front of a wall, with a lock that clicks when you turn the key it doesn't have.

So here's the rule, for whoever comes after me. Don't waste your torch on doors. The plant decides where you go, and it does that with stairs and tunnels and pipes, never doors.

There is one exception and I'll tell you where it is: the bottom. You'll know it when you see it. It is heavier than all the others put together, and it's the only one that hums.`,
  },
  {
    id: "D12",
    title: "Wrenched",
    file: "witness_statement_tunnel9.txt",
    body: `I was ten metres behind Priya in the tunnel. Both of us with torches. She'd stopped to change her battery. That's all. She had the torch in one hand and the battery in her teeth.

I heard nothing. I want that on the record. Nothing, until she said "oh" in a small, puzzled voice — because she'd heard it, and I hadn't.

It came out of the dark behind her. It didn't hit her. It took her by the shoulders and TURNED her, all the way round, gently, almost, until she was facing it. It held her there. I think it wanted her to see it. I think that's the part it likes.

I got my beam on it a second too late. It screamed and went, and Priya was already on the floor.

If you are walking with someone, walk where you can see their back. Their back, not their face. And if you see anything behind them, don't whisper. Shout. It runs from your light the same as from theirs.`,
  },
  {
    id: "D13",
    title: "Stairwell Count",
    file: "descent_notes.txt",
    body: `The plant goes DOWN. I've confirmed three decks below the sump, each one joined to the next by a stairwell with a number stencilled at the top in faded yellow paint.

Deck 1 is mostly tunnels and the employee areas — lockers, the time-card rack, a canteen with no food.
Deck 2 is engine rooms, catwalks, the big boilers. Red lines everywhere. Loud, hot, wet.
Deck 3 is quieter. Fewer bulbs. The pipes get thicker and fewer. At the bottom of it there's a long gallery of valve wheels, rusted shut, a hundred of them in rows like pews.

If you're trying to go down, follow yellow. The yellow conduit runs along the ceiling and it only ever goes one way, stairwell to stairwell, deeper each time.

The stairs are steeper than they look in the dark. Count them. I fell on the ninth step of the second stairwell and I'm still counting things to keep my mind off my ankle.`,
  },
  {
    id: "D14",
    title: "Async Survey Note — Light",
    file: "ASYNC_PD07_illumination.txt",
    body: `ASYNC — THRESHOLD-4 — SURVEY NOTE PD-07
Subject: illumination and survivability, Level 2

Fixture density on Level 2 is the lowest yet recorded in the survey. Mean spacing 14.2 m on deck 1, 19.8 m on deck 3. Roughly one fixture in nine is dead and stays dead.

Rooms with working overhead fluorescent lighting (break rooms, control rooms) have been designated SAFE. In 214 logged approaches by the resident entity, none has crossed into a lit room. Rooms lit only by a surveyor's lamp do not count.

Recommendations:
1. Carry a hand lamp in the hand at all times. A lamp in a pack is not a lamp.
2. Upgraded lamps from the Threshold-4 counter are no longer optional for this level.
3. Change batteries inside safe rooms, never in tunnels.
4. Travel in pairs. Keep each other's backs inside your beam.
5. In a vent plume, a lamp is useless. Do not linger.

Survivability on Level 2 correlates more strongly with lamp discipline than with any other variable measured.

— Filed for A. Voss`,
  },
  {
    id: "D15",
    title: "Fuse",
    file: "it_came_back.txt",
    body: `Found one of the fuses. Ceramic cartridge, big as my hand, brass caps on both ends. Warm. Not hot — warm, like it had been in someone's pocket.

It's lighter than it looks. I've carried it for two days and I keep checking it's still there.

Here's the strange part. On the first day I lost my footing on a catwalk and it went over the rail, down into an engine room, a long way down into the dark. I heard it land. I thought, well, that's that.

Next morning I passed the shelf where I'd found it. And there it was. Same shelf, same spot, the same chip in the ceramic. Warm.

You can't lose them. I don't think the plant lets you. Whatever they're for, it wants them used, and it'll keep putting them back until somebody does it properly.

I'm carrying it down. I've heard there's a box at the bottom that wants three.`,
  },
  {
    id: "D16",
    title: "The Pressure Door",
    file: "at_the_bottom.txt",
    body: `I made it to the bottom. Writing this sitting on the floor in front of the pressure door because I don't have the legs to go back up yet.

It's enormous. Riveted steel, round, like a bank vault turned on its side, with a wheel the width of my arms. The wheel doesn't move. I hung off it with my whole weight.

Beside it, on the wall, there's a grey fuse box with a little window and THREE slots, and a big red button under a hinged guard. Painted above the slots, in the same yellow as the stairwell numbers: ANY 3.

The window reads how many are in. The button is dead until all three are.

And I'll tell you what I could hear with my ear on the steel. A hum. Not the hum of the plant. Electrical. Huge, and patient, and on the other side of the door.

I had one fuse. I put it in. It clicked, and it stayed, and the window changed. It's still in there for whoever comes next. Bring two more.`,
  },
  {
    id: "D17",
    title: "Audio Log — Dr. Voss, Entry 34",
    file: "voss_log_034.wav.txt",
    body: `This is Dr. Ada Voss, research log thirty-four. The resident entity on Level 2. My surveyors call it the Grabber. I have adopted the name because accuracy does not require it to be dignified.

Across nine survey days I have logged sixty-three approaches. It does not patrol. It is absent for long periods and then it selects one surveyor. Interval between approaches on the same individual: three minutes forty seconds to eight minutes ten. It has never approached two surveyors at once. It has never approached from the front. Sixty-two of the sixty-three ended when a lamp found its face.

The sixty-third was Surveyor Hale. His lamp was in his pack. From first audible breath to contact: 3.1 seconds. It turned him round before it did anything else. I have thought for some time about why it does that, and the least uncomfortable explanation is that it wants to be looked at.

I numbered an entry "final" once, on Level 0. That was premature. I have stopped numbering these as though I know which one will be.

Hale had two children. I have the address. I will write it myself.

End log.`,
  },
  {
    id: "D18",
    title: "Hot Pipes",
    file: "burns_and_sleeves.txt",
    body: `Short one. Practical. Somebody should have told me this on the first day.

In the narrow tunnels the red lines run at shoulder height on both sides, and in some places you can't get through without brushing one. It doesn't sound like much. It is. I've got a stripe down my left arm that looks like I leaned on a stove, because that is what I did.

Roll your sleeves DOWN. Keep your arms in. Go sideways through the tight bits. If you're running — and you will be running at some point — you'll forget all of this and you'll hit a pipe, so the time to learn the tunnel is before you need it.

Blue lines are cold. You can lean on blue. Green is lukewarm. Yellow is fine but don't hold onto it; something in it hums under your hand and I didn't like it.

Red is never safe to touch. Not once. Not for a second.`,
  },
  {
    id: "D19",
    title: "What's Past the Door",
    file: "rumour_switchgear.txt",
    body: `Nobody I've met has been through the pressure door. Everybody I've met has an opinion about what's behind it.

What we actually know: the yellow conduit all runs to it. The hum gets louder the closer you get. The night crew's memo calls the bottom of the plant "the switchgear," and the old hands who wrote it seem to have been afraid of it in a different way than they were afraid of the steam.

What we've heard: that past the door is a station. Electrical. Transformers taller than houses, cable as thick as a man, everything buzzing. That the lights there aren't caged bulbs but big floodlights in rows, and that they fail one section at a time — click, click, click, darkness walking toward you down the hall — and something keeps them that way.

That last part comes from one person who says she put her ear on the door for an hour and counted. Click. Silence. Click.

I don't know if I believe her. I believe she believed it.`,
  },
  {
    id: "D20",
    title: "Last Light",
    file: "leaving_the_lights_on.txt",
    body: `I'm in the deck 2 break room, the one with the good kettle. I've been here a while. Long enough to have a chair.

I'm not going down any further. I've done the arithmetic and I'm not the person who opens that door. But I can be the person who keeps this room ready for whoever is. So: there's water by the sink. The batteries in the drawer under the corkboard are new. I've written the vent cycles for this deck on the back of the fire-drill notice.

Some rules, if you've just come through the drain and you're cold and wet and terrified, which you are:

Blue goes home. Green goes to light. Yellow goes down. Red will hurt you.

Keep your lamp in your hand. When you hear the breathing, don't think. Turn and light it.

And rest in the light when you can. It can't come in here. I've watched it try. I've watched it stand at that door and want to.

I'll leave the lights on. Come and have a cup of tea.`,
  },
];

/** Archive listing lines + Dr. Voss's notes, one per drive above. */
export const PIPE_DRIVE_NOTES: Record<string, { desc: string; ada: string }> = {
  D01: {
    desc: "A survivor's first log after surfacing through the drain hatch into the plant.",
    ada: "Every blue line we have traced does terminate at the sump. I have been unable to find a hydraulic reason for that, which leaves the other kind.",
  },
  D02: {
    desc: "An hourly shift log kept by a boiler-deck technician on the plant's night crew.",
    ada: "Four hundred and eleven pages, every hour accounted for, gauges nominal throughout. Whatever else that man was, he was reliable. I would have hired him.",
  },
  D03: {
    desc: "A posted maintenance memo explaining the plant's pipe colour code.",
    ada: "Confirmed in full across all three decks. The code is the most dependable map of this level we possess, and it was written by people who did not expect to need it.",
  },
  D04: {
    desc: "Dr. Voss's research log from her first descent into Pipe Dreams.",
    ada: "The figures stand. I have nothing to add to the last paragraph and I have chosen not to remove it.",
  },
  D05: {
    desc: "An account of hearing breathing on an engine-room catwalk.",
    ada: "Two to three seconds of warning is consistent with my own measurements. The description of the arms is not consistent with anything, and I have stopped trying to make it so.",
  },
  D06: {
    desc: "A note left in a lit break room at the end of a green line.",
    ada: "Six minutes at the threshold matches what we have since recorded. It does not cross into fluorescent light. It does seem to want to, which I find more informative than the rule itself.",
  },
  D07: {
    desc: "A maintenance memo on steam vent cycles, with a handwritten addition.",
    ada: "The one-second interval between hiss and plume is accurate to within a tenth. I do not know who Dennis was. The handwriting matches the boiler-deck shift log.",
  },
  D08: {
    desc: "An Async survey note on the cartridge fuses and the pressure door's fuse box.",
    ada: "Ten fuses, three slots, any three. The two surveyors who tried other objects have been reassigned to inventory, which is not a punishment, whatever they say.",
  },
  D09: {
    desc: "A transcribed time card from a rack near the deck 1 stairhead.",
    ada: "Forty-three cards, each with one stamp in and none out. The surveyor who punched a blank one asked me whether that meant anything. I told him I did not know, which was true.",
  },
  D10: {
    desc: "An inventory of an employee's locker in the deck 2 staff area.",
    ada: "I went and looked. The thermos is where the surveyor left it and the door is shut. I have not catalogued the wristband, and I do not intend to.",
  },
  D11: {
    desc: "A survivor's report on the plant's locked doors.",
    ada: "Every door we have tested is backed by poured concrete of the same age as the walls. The plant was built with doors that were never meant to open, and one that was.",
  },
  D12: {
    desc: "A witness statement describing an attack in a deck 1 tunnel.",
    ada: "The turning has now been observed in every recorded contact. A second person's lamp drives it off as reliably as the target's own. Shouting works because it shortens the second person's reaction time; I have the numbers.",
  },
  D13: {
    desc: "Notes on the plant's three decks and the stairwells between them.",
    ada: "Three decks, a valve gallery at the bottom, yellow conduit throughout. The count is correct. The ankle has since healed, though I gather the counting has not stopped.",
  },
  D14: {
    desc: "An Async survey note on lighting, safe rooms and lamp discipline.",
    ada: "Two hundred and fourteen approaches, none into a lit room. I have checked that number twice and would like every surveyor to read the fourth recommendation twice.",
  },
  D15: {
    desc: "A survivor's account of carrying one of the plant's cartridge fuses.",
    ada: "We have reproduced the return under controlled conditions. A fuse that leaves its carrier's custody is back at its original site within a day, warm, unmarked except for its own old damage.",
  },
  D16: {
    desc: "A survivor's description of the pressure door and its fuse box.",
    ada: "The inserted fuse is still seated; nobody has been able to remove one, including me. The hum behind the door is at a frequency I recognise, and I would rather not say from where.",
  },
  D17: {
    desc: "Dr. Voss's research log on the creature her surveyors call the Grabber.",
    ada: "I wrote the letter. It took longer than the log.",
  },
  D18: {
    desc: "Practical advice on the hot pipes in the plant's narrow tunnels.",
    ada: "Surface temperature on the red lines ranges from 140 to 190 degrees Celsius. The writer's advice about sleeves is correct and the advice about yellow is better than he knew.",
  },
  D19: {
    desc: "Rumours collected about what lies beyond the pressure door.",
    ada: "I cannot confirm the floodlights. I can confirm that something behind that door switches on a regular interval, and that the interval is getting shorter.",
  },
  D20: {
    desc: "A final note left by a survivor keeping a deck 2 break room stocked.",
    ada: "The batteries in that drawer are replaced by someone every week. We have not identified who. I have instructed my surveyors to leave it that way, and to say thank you on the way out.",
  },
};
