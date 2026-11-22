// THE CAVE SYSTEM ARCHIVE — twenty drives found only on Level 8. Same rules
// as the other archives (lore.ts): text never leaves the server until found,
// an unlock is permanent and global. Ids are C-prefixed and FOREVER.
//
// What the strand is for: the level's rules said in its own voice — the
// half-flooded platform you arrive on, the dead train, the place the tunnel
// breaks into rock; the caverns' scale, the river under them and the rope
// bridges over the drops; the ledges you can go down and never back up; the
// Deep and its squeezes; the clicking in the rock and the long pale thing
// that makes it; what happens in a crawl, and the one rule that saves you —
// get out into the open, and go still and quiet. Then the Climbing Rope and
// why nobody runs with it, the Chimney with a streetlight at its top, and
// the first sounds of a suburb above.
// Nothing here says where the Climbing Rope lies: it is drawn per map, and a
// drive that gave it away would be wrong on every other.
import type { DriveDef } from "./lore";

export const CAVE_DRIVES: DriveDef[] = [
  {
    id: "C01",
    title: "Down the Subway Stair",
    file: "below_the_square.txt",
    body: `The stair at the bottom of the square goes down, and the water does not follow it.

That is the first thing. Twenty-four metres of sea above us, and the steps just carry on, dry, into the dark. The water stops at the top step as if somebody told it to.

We took the helmet off at the bottom. The air is cold and smells of wet stone and old brakes.

There is a platform. There is a train. Nobody is on it.`,
  },
  {
    id: "C02",
    title: "The Platform",
    file: "platform_notes.txt",
    body: `The platform is half under water. Black water, still, about knee deep at the low end and dry at the stair end.

White tiles on the walls, the old kind with the black border. A station name in the tiles that someone has chipped out, letter by letter.

Benches. A clock with no hands. A map of the line, faded to nothing but the coloured stripes.

The stair end is dry and the lights on it still work. This is camp. The stair is the way home and nothing has ever come up it after us.`,
  },
  {
    id: "C03",
    title: "The Dead Train",
    file: "the_train.txt",
    body: `Walked the train today. Six cars.

The doors are all open. The seats are dry. There are newspapers on some of them, folded, and a child's glove on the floor of car three.

No bags. No coats. No people. Everybody got off, calmly, and took their things.

The driver's cab is locked from the inside. I looked through the glass. The dead man's handle is tied down with a bootlace.

I don't want to know which way they walked.`,
  },
  {
    id: "C04",
    title: "Where the Tunnel Breaks",
    file: "tunnel_survey_02.txt",
    body: `TUNNEL SURVEY — past the front of the train.

Sixty metres of ordinary tunnel. Rails, sleepers, cable runs on the wall, a signal light stuck on red.

Then the tunnel stops being a tunnel. The concrete lining is cracked open like an egg, and behind it is rock. Not dug rock. Old rock, wet, with a draught coming out of it.

The rails run on for a few metres into the cave and end in the air. Below them, a long way below, water moving.

They didn't dig into this. This was already here, and they dug next to it, and one day it came through.`,
  },
  {
    id: "C05",
    title: "How Big",
    file: "caverns_first_light.txt",
    body: `Put a flare up in the first big chamber.

We could not see the roof. We could see the stalactites coming down out of the dark, dozens of them, some longer than the train. The flare went up past the tips and was still climbing when it went out.

The floor is not a floor. It is shelves and slopes and boulders the size of houses, and between them, cracks you could lose a person in.

Nobody spoke louder than a whisper for an hour. You don't, in a room like that.`,
  },
  {
    id: "C06",
    title: "The River",
    file: "river_sounding.txt",
    body: `SOUNDING — the underground river, where it crosses the second chamber.

It is fast and it is cold. A float went from one side of the chamber to the other in under a minute and then went under the wall and did not come back.

Depth at the edge, knee high. Depth in the middle, the line didn't find it.

Do not swim it. Do not wade it past the knee. There is nothing on the other side of the far wall but the river, and it doesn't stop.`,
  },
  {
    id: "C07",
    title: "The Bridges",
    file: "bridge_inspection.txt",
    body: `BRIDGE INSPECTION — rope bridges across the drops in the caverns.

Somebody built these. Hemp rope, wooden slats, anchors bolted into the rock. Old. Not as old as the train.

Every one I tested held my weight. Every one moves. You will want to hold both ropes. Do.

Cross one at a time. Look at the slats, not past them. The drops underneath are not all the same, and from the middle of a bridge you cannot tell which kind you're over.`,
  },
  {
    id: "C08",
    title: "One Way Down",
    file: "incident_report_02.txt",
    body: `INCIDENT REPORT — surveyor H., separated from the team in the first chamber.

Stepped down off a ledge onto a shelf about two metres below. Easy drop. Turned to come back up and couldn't. The rock is smooth and it leans out. No holds.

She walked the shelf for an hour looking for a way back to us. She found one, eventually, the long way round through two other chambers.

Lesson for the team: before you drop down anything, look at it from below in your head. If you can't climb it, you are committing. Some of these only go one way.`,
  },
  {
    id: "C09",
    title: "The Drops That Kill",
    file: "fall_survey.txt",
    body: `FALL SURVEY — the big cracks between the shelves.

Some are two metres and you land on your feet. Some are five and you land on your back and get up slowly. Some we dropped a flare down and never saw it land.

You can't always tell from the top. The dark eats the bottom of everything.

Rule: no jumping. Not across, not down. If you can't see where you'll land, you aren't landing there.

We lost the good lantern down one this morning. Nobody went after it.`,
  },
  {
    id: "C10",
    title: "Into the Deep",
    file: "the_deep_notes.txt",
    body: `The far side of the caverns narrows. The rooms get smaller and the roof comes down to meet you.

We are calling it the Deep. It is a maze of passages, most of them just wider than your shoulders. The air is warmer here. It moves, faintly, always the same way, as if the whole cave is breathing out through it.

Some of the passages you can walk bent over. Some you crawl. Some you go through on your belly with your arms out in front.

Everything we want is through there. I can feel it in the draught.`,
  },
  {
    id: "C11",
    title: "The Squeeze",
    file: "squeeze_log.txt",
    body: `SQUEEZE LOG — surveyor T.

Went first through the low crawl on the far side of the third chamber. Twelve metres on hands and knees, then four on my belly, then it opens into a pocket you can sit up in.

In the low part the rock touches your back and your chest at the same time. You can't turn round. You can only go on or go back, and going back is slower.

You hear everything in there. Your own breathing. Your knees. The rock creaking.

I sat in the pocket at the end and listened for a long time before I told the others to come through.`,
  },
  {
    id: "C12",
    title: "Clicking",
    file: "incident_report_05.txt",
    body: `INCIDENT REPORT — surveyors T. and A., in the crawlspaces of the Deep.

Both heard a clicking in the rock. Not dripping. Dry, quick, like fingernails on a tabletop, coming from inside the wall beside them.

It stopped when they stopped. When they moved again it started again, closer.

They backed out into the chamber behind them and stood up and stood still. It clicked for a while in the passage they had left. Then it went quiet, and then it went away.

Neither of them saw anything. Both of them want it written down that they didn't want to.`,
  },
  {
    id: "C13",
    title: "What Lives in the Walls",
    file: "observation_burrower.txt",
    body: `OBSERVATION — flare thrown into a crawlspace from the chamber mouth.

For about a second we saw it. Long. Longer than the passage was straight. Pale, the colour of a candle. No eyes. Nothing where eyes would be.

It was not in the passage. It was in the rock beside the passage, moving through a crack I would not have put my arm into, and it moved like water moves through a pipe.

It came to the mouth of the crawlspace and stopped there. It did not come out. It does not like the open.

We are calling it the Burrower.`,
  },
  {
    id: "C14",
    title: "Surveyor A., Last Recording",
    file: "helmet_cam_A.txt",
    body: `[Transcript — helmet recorder, surveyor A., recovered from a crawlspace in the Deep.]

— about halfway, I think. The roof's low again. Going slow.

— that's the clicking. Okay. Okay. It's behind me.

— I can't turn round. It's faster than me. It's a lot faster than me. I can hear it going round the outside of the passage.

— I'm going on. There's air ahead. There's the draught. I just have to get to where I can stand —

— it's in front of me now. How is it in front of me.

[Clicking, very close, for eleven seconds. Then nothing. The recorder ran for another four hours.]`,
  },
  {
    id: "C15",
    title: "The Rule",
    file: "standing_orders_deep.txt",
    body: `STANDING ORDERS — the Deep. Read before every crossing.

1. The Burrower lives in the narrow passages and the crawls. It does not come into the open caverns. Not once, in all our watching.
2. In a crawl it hears you. It is faster than you are on your knees. You will not outcrawl it.
3. If you hear the clicking, get out into the open if you can. Any chamber you can stand up in.
4. If you can't, stop. Stop moving. Stop talking. Breathe slowly through your nose. It loses interest in a thing that is still and quiet.
5. When the clicking has been gone a while, go. Don't wait for it to come back and decide.

Every surveyor who has followed these has come out. A. ran.`,
  },
  {
    id: "C16",
    title: "Quiet",
    file: "still_and_quiet.txt",
    body: `I lay in a crawl for nine minutes today with it beside me.

The clicking came along the wall on my left, very close. It stopped by my head. I could hear something in the rock moving against itself, an inch away.

I didn't move. I didn't breathe through my mouth. I counted.

At about three hundred it clicked twice, the way you'd click your tongue at a dog that won't come, and it went off down the passage.

I lay there another four minutes to be sure. Then I went on, slowly, and came out in a chamber, and stood up, and was sick.

It works. It's the worst thing I've ever done, and it works.`,
  },
  {
    id: "C17",
    title: "The Climbing Rope",
    file: "rope_notes.txt",
    body: `Found a climbing rope today. Proper kit: a long coil, a sling, a set of anchors and a hammer. Somebody left it in the caverns on purpose, I think, the way you'd leave a ladder for whoever's next.

It's heavy. It's the bulkiest thing we've carried on any level. You can walk with it on your back. You can crawl with it, just. You cannot run. Try and it unslings, or catches, or throws you off your feet.

Which matters, because it has to go through the Deep. Every crawl on the way slower than the last, the coil scraping the roof, everything in the walls hearing it come.

Whoever carries it goes in the middle of the team. Nobody else carries anything.`,
  },
  {
    id: "C18",
    title: "The Chimney",
    file: "the_chimney.txt",
    body: `At the far end of the Deep, the passage opens into a little round room, and the room has no roof.

It's a shaft. A natural one, a chimney in the rock, going straight up. The draught we've been following all this time goes up it.

You can't climb it bare-handed. The rock is wet and the first holds are well over your head. With the rope fixed at the foot, you could.

I lay on my back at the bottom and looked up for a long time.

There is a light at the top. Very small. Orange. Steady.

It's a streetlight.`,
  },
  {
    id: "C19",
    title: "Sounds From Above",
    file: "listening_post.txt",
    body: `LISTENING POST — the foot of the Chimney, one night.

21:40 — a dog barking, far up. Three barks. A pause. Three more. Somebody tells it to be quiet.
22:15 — a hiss, regular, ticking round. Sprinkler. Somebody's lawn.
23:02 — a car door. No engine.
23:30 — the orange light at the top goes on flickering for a second, then steadies.
00:10 — something round and dark goes across the top of the shaft, against the light. A manhole cover, half off. Someone has looked down.

There's a street up there. There are houses. Somebody leaves a porch light on. I can smell cut grass.`,
  },
  {
    id: "C20",
    title: "Up the Chimney",
    file: "last_entry_cave.txt",
    body: `Last entry before the climb.

We got the rope through. Took us two days and we didn't lose anyone, and the Burrower followed us the whole way, clicking in the walls, never coming out.

It's fixed at the foot now. Anchors in, knotted off, tested. Anyone who comes after us can climb.

I keep thinking about the train. Everybody got off and took their things, calmly, and walked. I think they walked here. I think they climbed this.

There's a porch light up there, and a dog that won't shut up, and a sprinkler going round on somebody's lawn at midnight.

It looks like home. That's what worries me.`,
  },
];

/** Dr. Voss's description and note for every drive (law 1). */
export const CAVE_DRIVE_NOTES: Record<string, { desc: string; ada: string }> = {
  C01: {
    desc: "The first account of going down the subway stair from the bottom of the sunken square.",
    ada: "The waterline holds at the top step with no structure to hold it. I have measured the boundary to the millimetre twice and it has not moved. The air below is breathable and cold.",
  },
  C02: {
    desc: "Notes on the half-flooded platform at the foot of the subway stair, and the way home.",
    ada: "The stair end of the platform is dry and lit, and the creature has never been recorded on it. Camp procedure is sound. The station name was removed by hand; I have not been able to reconstruct it.",
  },
  C03: {
    desc: "A walk through the dead train standing at the platform.",
    ada: "Six cars, no remains, no luggage, a dead man's handle tied down. The evidence describes an orderly departure on foot. Where they went is an open question, and I am treating it as one.",
  },
  C04: {
    desc: "A survey of the tunnel past the train, where the lining cracks open into rock.",
    ada: "The cave predates the tunnel by a margin I cannot estimate. The rails ending in open air are the clearest marker of the boundary between the station and the caverns.",
  },
  C05: {
    desc: "A flare sent up in the first great chamber, and what it showed of the caverns' size.",
    ada: "The roof of the first chamber has not been reached by any light we have sent up. Floor relief is extreme. Survey teams are to move between shelves only where a route is confirmed.",
  },
  C06: {
    desc: "A sounding of the underground river where it crosses a chamber.",
    ada: "The current is fast, cold and passes under the chamber wall. Nothing that has gone into the middle of it has come back. Fording is limited to knee depth at the edges.",
  },
  C07: {
    desc: "An inspection of the old rope bridges that cross the drops.",
    ada: "Every bridge tested bore a surveyor's weight. They predate our arrival and post-date the tunnel. Single-file crossing is standing procedure. Who built them is not yet in the file.",
  },
  C08: {
    desc: "An incident report: a surveyor who dropped down a ledge and could not climb back.",
    ada: "Several ledges in the caverns are passable downward only. A surveyor who descends one has committed to a different route home. H. found hers. Assess every drop from below before taking it.",
  },
  C09: {
    desc: "A survey of the cracks between the shelves, some survivable and some not.",
    ada: "Fall depths range from trivial to unmeasured, and the difference is not visible from the edge. The rule against jumping is correct and absolute. The lantern is listed as lost.",
  },
  C10: {
    desc: "First notes on the Deep, the narrow passages beyond the caverns.",
    ada: "The Deep is a network of passages at or below shoulder width, with a steady outward draught. The draught's direction is consistent, and I regard it as the most useful navigational fact on this level.",
  },
  C11: {
    desc: "A surveyor's log of the first crawl through a squeeze in the Deep.",
    ada: "In the tightest sections a surveyor cannot turn and can only retreat backwards, slowly. T. waited and listened before calling the team through. That is correct practice and it is now procedure.",
  },
  C12: {
    desc: "The first incident: a clicking heard inside the rock beside two surveyors.",
    ada: "The clicking is the creature's sign. It tracked the surveyors while they moved and ceased when they were still. Both withdrew to open ground and both lived. The order of events matters.",
  },
  C13: {
    desc: "A flare thrown into a crawlspace, and the first sight of the Burrower.",
    ada: "Long, pale, eyeless, travelling through the rock rather than the passage. It stopped at the mouth of the crawlspace and did not enter the chamber. That boundary has held in every observation since.",
  },
  C14: {
    desc: "The last recording of a surveyor caught by the Burrower in a crawl.",
    ada: "A. kept moving after the clicking began, in a passage too narrow to turn in. The creature is faster than a crawl and can come round ahead. The recorder was recovered with the body. I have listened to it in full.",
  },
  C15: {
    desc: "The team's standing orders for crossing the Deep.",
    ada: "Every point is correct. Open ground is safety; stillness and silence are the fallback. No surveyor who has followed these orders has been lost to the Burrower.",
  },
  C16: {
    desc: "A surveyor's account of lying still in a crawl with the Burrower beside her.",
    ada: "Nine minutes, motionless, with the creature in contact range, and it withdrew. This is the strongest evidence we have that it loses interest in what is still and quiet. She has asked not to be thanked for it.",
  },
  C17: {
    desc: "The discovery of the Climbing Rope, and why nobody can run with it.",
    ada: "The rope is too bulky to sprint with and slows its carrier in every crawl. The team-carry procedure described is sound. It is the one object on this level the way on depends on.",
  },
  C18: {
    desc: "The discovery of the Chimney at the far end of the Deep, and the light at its top.",
    ada: "A natural shaft, unclimbable without a fixed rope at its foot. The light at the top is steady, orange and consistent with sodium street lighting. Once the rope is fixed, it is open to everyone.",
  },
  C19: {
    desc: "A night spent listening at the foot of the Chimney.",
    ada: "A dog, a sprinkler, a car door, a manhole cover moved against the light. Every sound is consistent with a residential street above. I have filed the movement at the cover separately.",
  },
  C20: {
    desc: "The team's last entry before climbing the Chimney.",
    ada: "The rope was fixed exactly as described and has held for every climber since. Her reasoning about the train is plausible and unproven. Her last line is the one I would have written.",
  },
};
