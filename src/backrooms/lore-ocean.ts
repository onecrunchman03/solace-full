// THE THALASSOPHOBIA ARCHIVE — twenty drives found only on Level 7. Same rules
// as the other archives (lore.ts): text never leaves the server until found,
// an unlock is permanent and global. Ids are T-prefixed and FOREVER.
//
// What the strand is for: the level's rules said in its own voice — the tower
// you come up into, a city drowned to its roofs with fog over it, the streets
// you swim, a breath that lasts ten seconds, the helmet that makes it a
// minute, the sunken square and the stair at its bottom, the open water past
// the city's edge, and the thing that lives in it: the shadow that passes
// under you, the hum when it circles, the water going dark when it rises, and
// the one rule that saves you — get out of the water. Splashing calls it.
// Nothing here says where the Diving Helmet lies: it is drawn per map, and a
// drive that gave it away would be wrong on every other.
import type { DriveDef } from "./lore";

export const OCEAN_DRIVES: DriveDef[] = [
  {
    id: "T01",
    title: "Up Through the Hatch",
    file: "past_the_sea_hatch.txt",
    body: `The Handwheel turned, the sea hatch opened, and there was no sea behind it. There was a ladder going UP.

We climbed for a long time. At the top, a room with windows, and daylight. Grey daylight, the first in weeks.

We are in a tower. Out of every window there is water, flat and grey, all the way to the fog. Roofs stick out of it. Some are just under it. Further out there are no roofs at all.

It is a city. It is a whole city, and it is under the sea, and we are standing in the top of one of its towers.

Nobody said anything for a while.`,
  },
  {
    id: "T02",
    title: "The Tower",
    file: "the_tower_notes.txt",
    body: `The tower is the only dry room we've found with walls round it. Two floors of offices left above the waterline. Caged bulkheads on the ceiling, still lit. Nobody knows what feeds them.

Doorways open straight onto the water on two sides. You step out and you are swimming.

This is camp. The hatch is here, and it is the only way home. Everything else is out there.

One rule already, from the first hour: nobody goes out alone, and whoever stays in the tower watches the water.`,
  },
  {
    id: "T03",
    title: "How Deep the Streets Are",
    file: "sounding_01.txt",
    body: `SOUNDING — weighted line off the tower doorway.

Six metres to the street. Cars down there. Lamp posts. A bus stop with a timetable you can almost read.

Every street we have sounded is about the same. Six metres. Deep enough that you swim, not wade. Shallow enough that you can see the bottom on a bright day, if there were bright days.

The roofs are the only places to stand. Some are proud of the water. Some are just under, and you can stand on them up to your waist. Some are deeper and you only find them by kicking them.`,
  },
  {
    id: "T04",
    title: "Ten Seconds",
    file: "breath_hold_trials.txt",
    body: `Breath-hold trials, five surveyors, the tower doorway.

Best time under: eleven seconds. Average: ten.

That is not normal. Every one of us can hold a breath for a minute on land. Down here the water takes it out of you. After ten seconds the chest goes tight, and after that it isn't holding your breath anymore, it's drowning, slowly. Two of us came up grey.

So: anything you can't reach and come back from in about ten seconds, you can't reach. Not without help.`,
  },
  {
    id: "T05",
    title: "Diving Supply",
    file: "helmet_found.txt",
    body: `Found it on a roof, in a locker that said DIVE SUPPLY in flaking paint. A brass diving helmet, the old kind, with a hose that goes nowhere.

It shouldn't work. There's no air line and no tank. But put it on and go under and you breathe. Not forever. About a minute, then it goes thin and you'd better be coming up.

A minute is everything down here.

There's only one. Whoever's wearing it is the only one who can go deep. We've agreed it comes back to the tower every time.`,
  },
  {
    id: "T06",
    title: "The Square",
    file: "sounding_07_the_square.txt",
    body: `SOUNDING — the big open patch of dark water away from the tower.

Line ran out at twenty metres. Tied on another. Twenty-four metres to the bottom.

It's a square. A city square, sunk four times deeper than the streets round it, as if the ground fell in. From a roof you can see the edge of it: the water goes from grey to black in a straight line.

There's something on the bottom. A kiosk. A sign on a wall. Steps going down.`,
  },
  {
    id: "T07",
    title: "Steps Going Down",
    file: "the_subway_stair.txt",
    body: `Went down the square with the helmet on. Twenty-four metres takes a long time. Your ears hurt and the light goes.

At the bottom, against the wall of the square, there is a subway entrance. A real one: a stair going down, railings, the tiles still on the walls. A sign above it that I couldn't read in the dark.

The stair goes down from the bottom of the sea.

I didn't go in. I had maybe twenty seconds of the helmet left and twenty-four metres to go back up. I touched the rail and turned round.

That's the way on. I'm sure of it.`,
  },
  {
    id: "T08",
    title: "The Edge of the City",
    file: "the_drop.txt",
    body: `Swam out to where the roofs stop.

The city has an edge. Past it there are no roofs, no streets, no bottom. The line went out a hundred metres and found nothing. The water there is a different colour. Not grey. Nearly black, even at the top.

We've started calling it the Drop.

Nobody needs to go out there. Nothing is out there. I want that written down plainly, because I know someone will want to look.`,
  },
  {
    id: "T09",
    title: "Something Passed Under",
    file: "incident_report_04.txt",
    body: `INCIDENT REPORT — surveyor M., swimming the long way round the city's edge.

Reports that the water under her went dark, all at once, as if a cloud passed over the sun. There is no sun. She looked down and saw a shadow passing beneath her. She says it was the size of a street. It did not touch her. It kept going.

She swam to the nearest roof and climbed out and would not get back in.

We waited on the roof for an hour. Nothing else happened.`,
  },
  {
    id: "T10",
    title: "The Hum",
    file: "incident_report_06.txt",
    body: `INCIDENT REPORT — two surveyors out in the deep water past the last roofs.

First the shadow went under them, like M. said. Then, a minute later, they both felt it: a hum, coming up through the water into their chests. Low. Steady. Going round them.

One of them understood before the other did. It was circling.

They made for the roofs. The hum followed them in, then stopped at the edge of the city as if it had hit a wall.

They both say the same thing: it wasn't chasing them. It was deciding.`,
  },
  {
    id: "T11",
    title: "R.",
    file: "incident_report_07.txt",
    body: `INCIDENT REPORT — surveyor R., the Drop.

R. went out alone, against the rule, to sound the Drop. From the tower we watched him through binoculars.

The water round him went dark. Not a shadow passing. The whole patch of sea round him, going black from underneath, like something very large coming up.

He was too far from a roof.

It was over in a moment. The water closed. It went grey again. There was nothing on the surface. No wreckage, no foam.

I am writing this so that nobody ever has to watch it again. Do not go into the Drop.`,
  },
  {
    id: "T12",
    title: "What It Notices",
    file: "observations_01.txt",
    body: `Putting together everything we have.

It doesn't come for you straight away. You have to be in its water a while. The longer you're in the deep, the more it notices you.

The Drop is its home. Out there it notices you in seconds.
The square is deep enough that it notices you too, but slowly. A careful dive is fine. Hanging about is not.
The streets, it hardly notices at all.

And every time, there's the same warning first. The shadow. Then the hum. Then the dark. It always gives you the three.`,
  },
  {
    id: "T13",
    title: "Don't Splash",
    file: "observations_02.txt",
    body: `Second note. This one matters.

It hears you. Not footsteps, there are no footsteps out here. It hears thrashing.

Swim fast and it notices you much quicker, even in the streets, where it usually ignores us. P. sprinted across a street to beat the rest of us to a roof and got the shadow under her in a street that's never given anyone trouble.

Swim slowly. Swim like you're not worth noticing. You'll get there.`,
  },
  {
    id: "T14",
    title: "Get Out of the Water",
    file: "the_only_rule.txt",
    body: `There is one rule that has saved everyone it's been tried on.

When the water goes dark under you, get out of it.

It can't follow you onto a roof. It doesn't try. The water goes dark, nothing finds you, and then it goes grey again and the hum goes away. We've watched it happen three times now. Every one of those people is still with us.

It is a big animal and it is very patient, but it only lives in the water. So does the danger. Stand on something.`,
  },
  {
    id: "T15",
    title: "The Fog",
    file: "the_fog.txt",
    body: `The fog sits about forty metres up. The tallest buildings go into it and don't come out. We've never seen their tops.

Nobody has tried to climb one. There's nothing to climb. The windows above the water are sealed and the walls are smooth.

Sometimes, very late, you can hear something up there. Not the hum. Lighter. Like wind through a lot of open windows at once.

We don't talk about the tops of the buildings.`,
  },
  {
    id: "T16",
    title: "The Drowned Roofs",
    file: "sounding_11.txt",
    body: `A note about the roofs that are just under the water.

You can stand on them. The water's at your waist or your chest and your feet are on gravel and old tar. They are the best places in the city to stop and breathe.

They are not as good as a dry roof. You're still in the water. It still counts.

Rest on them if you must. Don't camp on them.`,
  },
  {
    id: "T17",
    title: "Carrying the Helmet",
    file: "helmet_procedure.txt",
    body: `HELMET PROCEDURE, agreed by everyone in the tower.

1. One helmet. Whoever wears it is the diver. Everyone else stays up.
2. The diver goes down the square slowly. Slowly is quieter.
3. A minute of air. The square is twenty-four metres. That's about half your air down and half back up. Don't stop at the bottom.
4. If you die out there, the helmet stays with you. Someone will have to come and get it. Think about that before you're careless.
5. The helmet does not leave this level. If you go home through the hatch, it stays behind.`,
  },
  {
    id: "T18",
    title: "The Timetable",
    file: "bus_stop.txt",
    body: `Dived a street with the helmet to read the timetable at the bus stop.

ROUTE 7. TOWER — SQUARE — TERMINUS.

The last bus is marked in red. The time has been scratched out, carefully, with something sharp.

On the bottom of the sign someone has written, in marker, very small: IT ONLY TAKES YOU IN THE DEEP. STAY ON THE ROOFS. STAY ON THE ROOFS.

The writing is underwater, six metres down. It was written before the water came.`,
  },
  {
    id: "T19",
    title: "Night Watch",
    file: "watch_log.txt",
    body: `WATCH LOG — the tower windows, overnight.

02:10 — the water past the city's edge goes dark in a long line, like something turning over far down. Goes grey again.
03:40 — the hum, very faint, through the tower floor. The tower stands in the water. I hadn't thought about that.
03:41 — it stops.
05:15 — nothing. The water is flat to the fog in every direction.

It isn't hunting. It's just there. It's always just there. We're the ones who keep getting in.`,
  },
  {
    id: "T20",
    title: "Under the Sea, a Stair",
    file: "last_entry.txt",
    body: `Last entry before I take the helmet down the square again.

I've been thinking about the stair. It's a subway entrance. A subway goes somewhere. Under the sea, under the city, there are tunnels, and they're dry, or they wouldn't have built a stair down to them.

So the way on is down. It's always been down. Through the dark, the water, and something very large that lives in it.

A minute of air. Twenty-four metres. Slowly. Don't splash. Don't stop.

If I'm not back in two minutes, the helmet's on the bottom of the square, by the stair. Somebody bring it home.`,
  },
];

/** Dr. Voss's description and note for every drive (law 1). */
export const OCEAN_DRIVE_NOTES: Record<string, { desc: string; ada: string }> = {
  T01: {
    desc: "The first account of climbing up through the sea hatch into a drowned city.",
    ada: "The ladder rises roughly forty metres. The hatch below opens onto the sea at its own bottom, and the sea above is somehow the same sea. I have stopped requiring the Backrooms to agree with themselves.",
  },
  T02: {
    desc: "Notes on the tower, the only walled dry room on Level 7, and the way home.",
    ada: "The bulkheads in the tower draw no power I can find. The tower is the one place the creature has never been recorded near. Camp procedure is sound.",
  },
  T03: {
    desc: "A sounding of the streets: six metres of water over a drowned city.",
    ada: "Street depth is consistent at six metres across every sounding. The roofs fall into three groups: above the water, at waist depth, and fully under. All three are mapped in the survey.",
  },
  T04: {
    desc: "Breath-hold trials: how long a surveyor lasts under Level 7's water.",
    ada: "Ten seconds is the reliable figure. After that the water begins taking breath rather than the lungs giving it up. Ascents are now planned against ten seconds, not sixty.",
  },
  T05: {
    desc: "The discovery of the brass diving helmet, the only one found.",
    ada: "The helmet supplies about a minute of air with no source I can identify. There is one. It is the most important object on this level and procedure treats it so.",
  },
  T06: {
    desc: "A sounding of the sunken square, twenty-four metres deep.",
    ada: "Twenty-four metres, four times the street depth. On one breath it is unreachable. In the helmet it is about half a minute down and half a minute back.",
  },
  T07: {
    desc: "A dive to the bottom of the square, and the subway stair found there.",
    ada: "A subway entrance on the floor of the square, intact, leading down. The surveyor's judgement is mine: this is the way on. The helmet is how you reach it.",
  },
  T08: {
    desc: "A report from the city's edge, where the roofs stop and the open water begins.",
    ada: "No bottom found past the edge. The surveyors call it the Drop. It is the creature's water. There is no survey reason to enter it and several to stay out.",
  },
  T09: {
    desc: "The first incident: a shadow the size of a street passing under a swimmer.",
    ada: "The shadow is the creature's first sign and it is not an attack. A surveyor who leaves the water at this point has, in every recorded case, lived.",
  },
  T10: {
    desc: "The second incident: the hum, felt through the water while it circled.",
    ada: "The hum is the second sign. It means it has noticed you. The correct response is to make for the nearest roof without hurrying the stroke.",
  },
  T11: {
    desc: "An incident report: a surveyor lost in the Drop, watched from the tower.",
    ada: "The third sign is the water darkening beneath the swimmer. It lasts a few seconds. Anyone still in the water at the end of it is taken. R. was too far from a roof.",
  },
  T12: {
    desc: "Observations on what makes the creature notice a swimmer.",
    ada: "Exposure accumulates with time spent in deep water: fastest in the Drop, slowly in the square, barely at all in the streets. Three warnings come before it rises, every time.",
  },
  T13: {
    desc: "Observations on noise: fast swimming draws it, anywhere.",
    ada: "Thrashing in the water raises the creature's attention sharply, even in the streets. A slow, even stroke is now standing procedure for every swimmer.",
  },
  T14: {
    desc: "The one rule that has saved every surveyor who followed it.",
    ada: "Leave the water when it darkens. The creature has never once followed anyone onto a roof. This is the single most reliable finding of the Level 7 survey.",
  },
  T15: {
    desc: "Notes on the fog, and the tall buildings that disappear into it.",
    ada: "The fog base is steady at about forty metres. The towers that rise into it are sealed and unclimbable. I have no data on what is above it and do not intend to collect any.",
  },
  T16: {
    desc: "A note on the drowned roofs: standing ground that is still in the water.",
    ada: "A submerged roof is good for a breath and nothing more. The creature counts time in the water, standing or swimming. Rest briefly and move on.",
  },
  T17: {
    desc: "The tower's agreed procedure for the diving helmet.",
    ada: "Every point of this procedure is correct, including the last two. The helmet stays on this level. If its wearer dies, it lies with them until recovered.",
  },
  T18: {
    desc: "A dive to a bus stop, and a warning written on its sign.",
    ada: "The handwriting on the sign is under six metres of water and predates the flooding. Its advice is identical to ours. I find that more reassuring than I should.",
  },
  T19: {
    desc: "A night watch log from the tower windows.",
    ada: "The creature's activity at night is confined to the Drop. The hum was recorded faintly through the tower's own structure; the tower remains, by every measure, safe.",
  },
  T20: {
    desc: "A surveyor's last entry before diving the square again.",
    ada: "The reasoning is sound: a stair leads somewhere dry, so the way on is down. The helmet was recovered from the square two days later. Her name is on the wall in the tower.",
  },
};
