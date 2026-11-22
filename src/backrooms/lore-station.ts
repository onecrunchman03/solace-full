// THE ELECTRICAL STATION ARCHIVE — twenty drives found only on Level 3. Same
// rules as the other archives (lore.ts): text never leaves the server until
// found, an unlock is permanent and global. Ids are S-prefixed and FOREVER.
import type { DriveDef } from "./lore";

export const STATION_DRIVES: DriveDef[] = [
  {
    id: "S01",
    title: "Shift Handover",
    file: "handover_sheet_0600.txt",
    body: `SHIFT HANDOVER — DAYS TO DAYS (no nights rostered this week, again)

Bus voltages nominal. Section 4 running warm. Battery room topped up. Transformer bay humming a quarter-tone flat, which it does.

Outstanding: arcing on two panels in the serviceways, ticketed. Puddle under the old drive cabinet in the substation hall, ticketed. Lamp out in the cable vault, ticketed.

Note for the incoming operator: the relief crew did not arrive. Nobody has heard from them. Nobody can find the gate log either. I asked around the control desk who drove in this morning and every one of us said we must have, and none of us could describe the road.

I am putting that in writing because it seems like it should be in writing.

Kettle in the workshop is working. Milk is off. Sign the sheet.

— M. Ilic, desk operator`,
  },
  {
    id: "S02",
    title: "Through the Pressure Door",
    file: "arrival_from_below.txt",
    body: `Three fuses. Three fuses in a box at the bottom of the dark, and the pressure door rolled back like it had been waiting for us to remember the combination.

The first thing is the smell. Ozone. Hot dust. The back of an old television. After weeks of Pipe Dreams I had forgotten that air could be dry.

The second thing is the light. Real light — strip lamps in cages, steady, every one of them working, a hall full of it. I stood in the Intake Hall and cried a bit and I am not ashamed of that.

The third thing is the sound. Level 0 hums. This place BUZZES. It is in the floor and the handrails and the fillings in your teeth, and it changes pitch from room to room, like every wall is carrying something on its way somewhere else.

Somebody worked here. There are shift sheets pinned by the door, and a kettle, and mugs with names on them.

I don't know yet why it feels like they left in a hurry.`,
  },
  {
    id: "S03",
    title: "Standing Orders",
    file: "standing_orders_rev9.txt",
    body: `STANDING ORDERS — ALL STAFF — REVISION 9
Posted at every section entrance. Read them. Initial the card.

1. Breakers are thrown ON. There is no OFF procedure on this station. Do not attempt one.
2. Cutoffs are for maintenance access only. Pull a cutoff and the section goes dark until it restores itself. Do not pull one alone.
3. Any panel that crackles is about to arc. Step out of its line. Do not finish your sentence first.
4. Standing water in a powered section is live. All of it. Always. The puddle that looks shallow is the same voltage as the one that looks deep.
5. If the lights in your section fail and you did not pull the cutoff, that is a blackout. Hold position. Torch on.
6. Torches are carried, not stowed. A torch in a bag is a decoration.
7. Do not enter a dark section that you did not personally see go dark.

Revision 9 adds orders 6 and 7. Ask your foreman why. He will tell you.

— R. Halvorsen, Line Foreman`,
  },
  {
    id: "S04",
    title: "The Six",
    file: "schematic_margin_notes.txt",
    body: `Notes copied off the margin of the wall schematic in the control room, because somebody spilt tea on the original.

The station is six sections. Six. Each one has its own feed, its own switchgear, its own breaker, its own cutoff. They don't share. You can lose one and the other five won't notice.

The lift is different. The lift in the Lift Hall is wired to an interlock across ALL six. One breaker not thrown anywhere and the shutter has nothing to lift with. All six on and the bus closes and the motor gets power.

I used to think that was a safety feature. Lift only runs when the whole station is healthy. Sensible.

I've stopped thinking that. Because the breakers don't go off. Not ever — see Standing Order 1. So the interlock isn't checking that the station is healthy. It's checking that somebody went round all six and put them back.

Like it was built expecting the power to go. Like it was built expecting someone to have to walk it.`,
  },
  {
    id: "S05",
    title: "Ticket 4471",
    file: "maintenance_ticket_4471.txt",
    body: `MAINTENANCE TICKET 4471
RAISED BY: B. Achterberg (maint.)
PRIORITY: Low (raised to High by foreman, see below)

DESCRIPTION: Breaker handle in one of the switchgear cabinets will not return to OFF for racking-out. Handle travels freely to ON. Will not travel back. No visible mechanical stop. Tried the cheater bar. Bent the cheater bar.

FINDINGS: Not a fault. Checked the other five. Same on all of them. Once a breaker is on, it is on. The mechanism simply does not have a way back. I took the cover off one and there is no OFF contact in it at all. Never was. They were built this way.

FOREMAN'S NOTE: Close the ticket. Don't open any more covers. If they only go one way then they only go one way, and I would rather have six breakers on and stuck than one breaker we can't get back on.

B.A. NOTE: Closing. For the record, the inside of that cabinet was warm, and I don't mean electrically.`,
  },
  {
    id: "S06",
    title: "The Rhythm",
    file: "arc_timing_notes.txt",
    body: `The panels arc. Everybody here knows that. What the new ones don't know is that they TELL you first.

Listen. Before every arc there's a crackle — dry, like someone screwing up a crisp packet behind the cover. Then one second. Then the arc: white, loud, a metre and a half out from the face of the panel, and if you're in front of it you're on the floor.

One second. Every time. I've counted a few hundred.

So you don't walk past a panel. You walk past a panel's RHYTHM. You stand off to the side, you wait for the crackle, you let it go, and then you've got the gap. Most of them run on a steady beat. A few run fast. One in the serviceways skips — two quick, then a long one — and I've watched an apprentice learn the beat and then get caught by the skip.

Stand to the side of it, not in front. The arc goes out, not round.

And if you hear a crackle and can't see a panel, don't stand there trying to find it. Move.`,
  },
  {
    id: "S07",
    title: "Incident Report IR-22",
    file: "incident_report_IR22.txt",
    body: `INCIDENT REPORT IR-22
LOCATION: flooded room, section unrecorded at operator's request
INJURED: none (see narrative)

NARRATIVE: Operator T. Okonkwo observed standing water across a doorway on route to a switch room. Water approximately ankle depth. Section powered, lamps lit. Operator judged the water "probably fine" on the grounds that it was "only a puddle."

Operator then dropped a steel spanner into the puddle to test it.

Spanner was thrown back out of the water with considerable force and was later recovered from the ceiling tray. Operator was not standing in the water at the time and is therefore available to write this report.

FINDINGS: Standing water in any powered section is live. This is Standing Order 4. It does not matter how much water there is. It does not matter how still it looks. The water on this station carries its section's full supply until that section is cut.

CORRECTIVE ACTION: Route around, or cut the section. There is no third option.

OPERATOR'S ADDITIONAL REMARK: I would like the spanner back.`,
  },
  {
    id: "S08",
    title: "Pulling the Handle",
    file: "cutoff_procedure_card.txt",
    body: `CUTOFF PROCEDURE — laminated card, one per section

Every section has a cutoff. It is a pull handle on a wall, red, and it is not the breaker. The breaker is for keeping the power on. The cutoff is for taking it away, for a while.

To cross live water in a section:
  1. Find that section's cutoff. You usually meet it before you meet the water.
  2. Torch ON. Check it. Check it again.
  3. Pull the handle all the way down. The lamps go. The buzz goes. The water is dead.
  4. Cross. Do not stop in the middle to admire anything.
  5. The section restores itself. You do not need to put anything back. You CANNOT put anything back. The power comes home on its own clock.

The handle does not care whether you have finished crossing. Count your time.

Do not pull a cutoff on a section with someone else in it without telling them. Read Standing Order 7 again. Then read it again.`,
  },
  {
    id: "S09",
    title: "Rolling",
    file: "control_desk_blackout_log.txt",
    body: `Control desk log, kept by hand because the printer stopped.

Day 1 — Section 2 dropped for four minutes. No cutoff pulled, nobody in there. Came back by itself. Logged as a fault.

Day 3 — Section 5 dropped. Then section 2 again. Then section 6. Never more than one at a time. Never the same one twice running. Each one came back on its own.

Day 4 — It's load shedding. Somebody is shedding load. It rolls round the station like a hand going down a row of switches. But we don't shed load. Nobody here has the authority to, and nothing on my desk is doing it. I have watched the board while it happens. The lamps on the mimic go out one section at a time and none of my controls move.

Day 6 — Halvorsen asked me if I could see a pattern. I said no. I can't. It's not random either. It feels like something walking the station, testing which doors are open.

Day 7 — Section 3 went down with Benny in it. Lights back on after five minutes. Benny came out fine. Benny will not talk about it.`,
  },
  {
    id: "S10",
    title: "Foreman's Memo",
    file: "memo_halvorsen_all_staff.txt",
    body: `TO: All staff
FROM: R. Halvorsen
RE: The dark

I am going to say this once, plainly, and then it is policy.

There is something in this station's wiring. I don't know what it is. I have not seen it and I don't want to. Four of you have, and four of you told me the same thing without talking to each other first, and I don't need a fifth to believe it.

It doesn't come into the light. Not into a lit room, not into a lit corridor, not one step. Every account agrees. What it does is come out where the power's died — a pulled cutoff, a blackout — and it comes out fast, a few seconds after the lamps go.

So, from today:
  · Nobody enters a dark section alone.
  · Nobody pulls a cutoff alone.
  · If your lights go and you didn't do it, you get your back to a wall and your torch up and you WAIT, and you watch the corners.
  · Nobody runs from it. I'm told running doesn't work.

If you hear screaming in a dark section, that is not one of us.`,
  },
  {
    id: "S11",
    title: "What Ortiz Saw",
    file: "statement_ortiz.txt",
    body: `Statement, given to the foreman, transcribed by M. Ilic.

"I was in the battery room when the section dropped. Not a cutoff. Nobody had pulled anything. I had my torch, so I stood where I was, like we're told.

It came out of the cable tray. Out of it. Like the wiring was a sleeve and it had been the arm.

It's tall. Too tall for the door frame, it had to fold. White — not pale, WHITE, the colour of something kept under a sink. And it was wet all down the front, dark and wet, and the smell was copper. Pennies. A mouthful of pennies.

It saw me. And it stood up straight and it screamed. Not at me — UP. The whole room rang. I've thought about it a lot since and I think the scream was the only kind thing it did. That was me being told.

I had the torch on it. I didn't mean to. I was just pointing it where I was looking. It came at me and it was slower than it should have been, and it was making this sound, and then it SHRIEKED, a different one, and it went back into the wall.

I didn't move my hand. That's the only reason I'm here. I didn't move my hand."`,
  },
  {
    id: "S12",
    title: "Nobody Outruns It",
    file: "about_benny.txt",
    body: `Benny Achterberg was the fastest man on this station. Ran the length of the Intake Hall every morning before shift for a bet nobody ever took.

Section 3 dropped while he was in it again. Second time. He'd told me after the first time — finally — that he'd heard something breathing in the cable vault and got out before it found him. That he'd outrun it. That he could do it again.

I was at the section boundary, in the light, when I heard the scream. Then I saw him come round the corner flat out. I have never seen a man move that fast.

It was faster. Not a bit faster. A LOT faster. It covered the corridor like the corridor was shorter for it than for him. He was four steps from my light. Three. It reached out.

He'd have been fine if he'd turned round. He had his torch on his belt. He had it on his BELT.

The lights in 3 came back two minutes later. It was gone by then, and so was he, apart from what was on the floor.

Whatever you tell yourself about your legs: they are not enough. Turn round. Hold the light.`,
  },
  {
    id: "S13",
    title: "Count to One",
    file: "torch_drill.txt",
    body: `New drill. Practised at every shift start until the foreman is satisfied. He is never satisfied.

1. Torch in your hand. Not your belt. Not your bag. Your hand.
2. When it screams, you have under a second before it moves. Use it to find it, not to run.
3. Put the beam on it. ON IT. Not near it. Not across it.
4. Hold it there. Steady. Count: one thousand and one.
5. That's all it takes. It shrieks — a high one, you'll know it — and it goes back into the walls.

What does NOT work: waving. A sweep across it does nothing at all. People panic and wave the torch like they're signalling a plane, and every second it's off the thing, the count starts again. Lock your elbow. Brace on the door frame if you have to.

It slows down while it's lit. It still comes. It will get closer than you want. Keep the light on it anyway.

Afterwards it stays gone a while. Use that while. Get to the light.`,
  },
  {
    id: "S14",
    title: "Bleeder",
    file: "workshop_whiteboard.txt",
    body: `Somebody wrote this on the workshop whiteboard and nobody has rubbed it off.

"For the apprentices, since they keep asking what we call it.

A BLEEDER is a resistor. You put it across a capacitor so that when you switch the circuit off, it drains the charge out. Slowly. So the next man who puts his hand in the cabinet doesn't get the stored energy in his chest. It's a safety part. It's what makes a dead circuit actually dead.

It lives across the dead side. It only does its work once the power's gone. It takes whatever's left.

You see why we called it that.

It doesn't help that it's covered in blood."

Underneath, in different handwriting: "It's not ITS blood."

Underneath that, in the first handwriting: "I know."`,
  },
  {
    id: "S15",
    title: "Last Shift",
    file: "control_desk_final.txt",
    body: `Control desk. I'm the only one left on the roster I can find.

Halvorsen went out during the worst of the blackouts to throw a breaker nobody had reached yet. He came back, he said it was done, he said it's a funny thing, they only go on. Then he went to sleep in the switch room and in the morning he wasn't there and his torch was, still lit, pointing at the cable tray.

I've thrown all the ones I could get to. They're on. They'll stay on. That's the one thing about this place you can rely on — whatever someone puts right stays put right.

The board shows four sections green. The other two I can't get to, there's water and I'm not pulling a cutoff on my own, I promised him.

If you're reading this, you came up through the pressure door, because that's the only way anyone comes in. You're not crew. That's fine. The station doesn't care who throws its breakers.

All six and the lift runs. That's the way out. Down.

I'm going to sit here a bit longer. The lights are on in here and the kettle still works.`,
  },
  {
    id: "S16",
    title: "Threshold-4 Survey Plan, Level 3",
    file: "T4_SURVEY_PLAN_L3.pdf.txt",
    body: `THRESHOLD-4 — SURVEY PLAN, LEVEL 3 (provisional designation: ELECTRICAL STATION)
CLASSIFICATION: Internal · DISTRIBUTION: Survey teams A–D

OBJECTIVE: Map the station. Recover documents. Establish whether the six-section breaker interlock, as described in recovered crew material, powers a descent to the next layer.

MANDATORY EQUIPMENT:
  · Flashlight, one per surveyor, carried in hand at all times. No exceptions. A surveyor found with a stowed light will be returned to the surface.
  · Spare cells.
  · Insulated boots (they will not save you from the water; they are for the floor).

RULES OF CONDUCT:
  · Two-person minimum in any section that is, or may become, unpowered.
  · No surveyor pulls a section's cutoff without a partner in sight and in the light.
  · Treat all standing water in a lit section as lethal.
  · On hearing the creature's cry: stop, turn, illuminate. Do not run.
  · Arcing panels: observe the interval before passing.

NOTE FROM REVIEW: The crew material is unusually consistent and I am inclined to take it at its word. These people learned their rules the way rules are usually learned. Read them.

— A. Voss`,
  },
  {
    id: "S17",
    title: "Audio Log — Dr. Voss, Entry 37",
    file: "voss_log_012.wav.txt",
    body: `Dr. Ada Voss, log twelve. Level 3, day nine.

Measurements. The panel discharges are preceded by an audible crackle at an interval of one second, plus or minus a twentieth. The crew wrote "one second." The crew were right.

The rolling outages take one section at a time and never the same one twice in succession. I have not found a controller. The pattern is not random and it is not periodic. I have stopped describing it as load shedding because that implies a load.

The creature. I have now observed it four times, twice by my own light. It does not enter illuminated space. It is not repelled at the boundary; it simply does not consider the lit floor to be floor. When a section's power returns while it is inside, it leaves, at speed, as though the room had caught fire.

Its cry precedes its charge by eight-tenths of a second. Its charge exceeds a sprinting adult by roughly half again. A steady beam held for one second sends it into the conduit. A moving beam does nothing measurable.

Team C asked me whether it was an animal. I said I had no evidence it was alive. That was accurate. I should have said it more kindly.

End log.`,
  },
  {
    id: "S18",
    title: "The Trade",
    file: "field_card_team_c.txt",
    body: `Team C field card. Written on the back of a requisition because that's what we had.

Here is the whole level in one sentence: the water is only safe in the dark, and the dark is where it lives.

That's it. That's the station. Every section with live water across your route is a choice. Go round, if there's a round. Or pull that section's cutoff, kill the lamps, and cross by torchlight — and know that a few seconds after the lights go, something is going to come out of the walls to see who did it.

How we do it now:
  · One pulls, one watches. The watcher's torch is already up before the handle comes down.
  · Cross first, fast, while the dark is fresh. It takes a few breaths to come out.
  · Pick your exit before you pull. You want lit floor under your feet when the scream comes.
  · If it screams, the watcher holds the light on it. Everyone else keeps walking toward the lamps.

And when the cutoff restores and the lights come up — that's the safest moment in this whole place. It won't stay in a lit room. Not for a second.

Make the dark short. Spend it on purpose.`,
  },
  {
    id: "S19",
    title: "Audio Log — Dr. Voss, Entry 38",
    file: "voss_log_013.wav.txt",
    body: `Log thirteen. The lift.

The interlock is genuine. Six independent feeds, one bus, and the shutter's motor on the far side of all of it. With fewer than six closed, the shutter does not move. I have put a meter on it. It reads nothing, which is a measurement.

Through the gap under the shutter there is a draught. It is cool and it is dry and it smells of carpet. Not the carpet of Level 0. Office carpet — the grey kind, with adhesive under it and a photocopier somewhere. I can hear a ceiling ventilation unit. I can hear nothing else at all, which after nine days of this station is very loud.

The crew believed the breakers were built only to go on because the station expected to lose power. I think that is half of it. I think it expected to be restored. By someone. Repeatedly.

Halvorsen's torch was still lit when we found it. It has been lit, by my estimate, for longer than its cells could hold. I have not switched it off. I am aware that is not a decision I can defend.

End log.`,
  },
  {
    id: "S20",
    title: "Under the Shutter",
    file: "lift_hall_note.txt",
    body: `Left taped to the lift controls. For whoever gets here next.

I got here. That's the first thing I want you to know. It's possible. Six breakers. All six. They stay where you put them, so if someone's been here before you, some of the work's already done — check the board in the control room, it'll tell you what's still to throw.

I've stood in the Lift Hall for an hour, listening. The buzz stops at this door. Below the shutter it's quiet. Office quiet. A fan, somewhere. The smell of a room nobody has walked through in a long time.

I don't know what's down there. The crew didn't either. They spent their whole time here keeping the lights on, and I think that's what they were for. Not running the station. Keeping it bright enough for someone to get through it.

So: torch in your hand. Count to one. Don't stand in front of a crackling panel. Don't trust the puddles. Don't ever run.

And when you go down, leave the lights on behind you. Someone's coming up through that pressure door right now, smelling ozone for the first time.

Leave it bright for them.`,
  },
];

/** The archive listing's line for each drive, and Dr. Voss's note on it. */
export const STATION_DRIVE_NOTES: Record<string, { desc: string; ada: string }> = {
  S01: {
    desc: "A desk operator's shift handover sheet, noting a relief crew that never arrived.",
    ada: "Every operator on this sheet signed in, and none of them could describe arriving. I have the same difficulty with my first morning at Threshold-4. I have chosen not to pursue the comparison.",
  },
  S02: {
    desc: "A survivor's account of stepping through the pressure door into the Intake Hall.",
    ada: "Relative humidity in the Intake Hall is thirty-one per cent, against nearly saturated air in Pipe Dreams. The tears are consistent with the transition. I also recorded some.",
  },
  S03: {
    desc: "The station's posted standing orders, revision nine, signed by the line foreman.",
    ada: "Seven orders, and every one of them survived contact with my survey teams. The last two were added after a death. Rules usually are.",
  },
  S04: {
    desc: "Notes copied from a schematic describing six sections and the lift interlock.",
    ada: "The interlock exists exactly as described: six feeds, one bus, the lift beyond all of it. The writer's conclusion about why it was built that way is better than mine was.",
  },
  S05: {
    desc: "A maintenance ticket reporting that the station's breakers cannot be switched off.",
    ada: "I had a cabinet opened under supervision. There is no off contact. Nothing was removed; it was never fitted. The mechanism was designed to be put right and never put wrong.",
  },
  S06: {
    desc: "A worker's notes on the arcing panels and the warning crackle before each arc.",
    ada: "One second between crackle and discharge, to within a twentieth, across every panel I have timed. The skipping panel is real. I have marked it and will not say where.",
  },
  S07: {
    desc: "An incident report about an operator testing standing water with a spanner.",
    ada: "The spanner was recovered from the cable tray, four metres up. Every pool of water in a powered section reads the section's full supply, regardless of depth. The operator's method was poor and his conclusion was correct.",
  },
  S08: {
    desc: "A laminated procedure card for using a section's cutoff to cross live water.",
    ada: "The procedure is sound. The card omits only what happens a few seconds after step three, which the crew evidently learned after it was printed.",
  },
  S09: {
    desc: "A hand-kept control desk log recording the first rolling blackouts.",
    ada: "I have kept the same log for nine days and reached the same place she did: one section at a time, never the same one twice, and no controller. I do not like agreeing with a log written by someone we cannot find.",
  },
  S10: {
    desc: "The line foreman's memo to all staff on entering dark sections.",
    ada: "Four independent accounts, matched without collusion. That is a better evidentiary standard than several papers I have reviewed. He believed them for the right reasons.",
  },
  S11: {
    desc: "An operator's statement describing his first encounter with the creature.",
    ada: "Every detail of his description has since been confirmed, including the smell. He is correct that the first cry is a warning. I do not share his view that it is kind.",
  },
  S12: {
    desc: "A crew member's account of a fast runner caught in a dark section.",
    ada: "Its charge exceeds a sprinting adult by roughly half again. No surveyor of mine has outrun it, and I have stopped allowing them to try.",
  },
  S13: {
    desc: "A shift-start drill for holding a flashlight on the creature.",
    ada: "One second of steady light. A sweep resets nothing in its favour and everything in yours. I have adopted this drill verbatim, which I do not often do.",
  },
  S14: {
    desc: "A workshop whiteboard note explaining the creature's name.",
    ada: "The electrical definition is accurate. I asked the crew's question of the samples recovered from the floor of the cable vault. It is not its blood.",
  },
  S15: {
    desc: "The final control desk log of the last operator left on the roster.",
    ada: "Four sections were green when this was written. We found the desk empty, the chair warm, and the kettle on. I have left the kettle on.",
  },
  S16: {
    desc: "Threshold-4's survey plan for the station, with mandatory equipment and rules.",
    ada: "My own document. Every rule in it was borrowed from people who are no longer here to object. I would like that acknowledged somewhere, and this seems to be the place.",
  },
  S17: {
    desc: "An audio log in which Dr. Voss records her measurements of the station.",
    ada: "The figures stand. The final remark stands too, though I would phrase it differently now.",
  },
  S18: {
    desc: "A survey team's field card summarising how to cross a section safely.",
    ada: "Team C reduced nine days of my measurements to a single sentence. The sentence is correct. I have pinned it above my desk.",
  },
  S19: {
    desc: "An audio log in which Dr. Voss examines the lift and what lies beneath it.",
    ada: "The torch is still lit. I have checked it every day since. I am recording that I check it, and not why.",
  },
  S20: {
    desc: "A note left on the lift controls for whoever reaches the Lift Hall next.",
    ada: "Every breaker this writer threw is still on, as promised. The lights they left behind them are the reason my teams came home. I would like to have met them.",
  },
};
