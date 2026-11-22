// THE ABANDONED OFFICE ARCHIVE — twenty drives found only on Level 4. Same
// rules as the other archives (lore.ts): text never leaves the server until
// found, an unlock is permanent and global. Ids are O-prefixed and FOREVER.
import type { DriveDef } from "./lore";

export const OFFICE_DRIVES: DriveDef[] = [
  {
    id: "O01",
    title: "Going Up, Going Down",
    file: "arrival_by_lift.txt",
    body: `The shutter in the Lift Hall rolled up on a lift car. Brushed steel, a handrail, a mirror, a panel of buttons with no numbers on them. We got in because there was nowhere else to go, and it took us down for longer than a building should be deep.

It opened on carpet.

Grey carpet, a lobby, two armchairs, a potted plant that has never needed watering. After the station it was so quiet I could hear my own blood. Then, under the quiet, rain. Somewhere there are windows, and it is raining on them.

The lights in the lobby work. Every one. Past the lobby doors they don't — or most of them don't. You can see down the corridor in patches: a lit square of carpet, a long stretch of dark, another lit square.

The air smells of toner and old coffee and the inside of a filing cabinet.

It feels like a Tuesday. I don't know how a place can feel like a day of the week.`,
  },
  {
    id: "O02",
    title: "Welcome Aboard",
    file: "new_starter_pack_p1.txt",
    body: `WELCOME TO THE TEAM!

We're delighted you've joined us. This pack will help you settle into your first week.

YOUR DESK: You will find your desk already set up. If you believe you have been given someone else's desk, you have not. Everyone's desk is the right desk.

YOUR PASS: Your ID card opens the doors you need. It does not open the stairwell door. Nobody's card opens the stairwell door except the card kept in Security.

YOUR HOURS: Core hours are 9 to 5. You may find you arrive before 9. You may find it is always a little after 4. Please do not raise this with your line manager.

COLLEAGUES: Say hello! You may notice a colleague who does not say hello back. They are part of the display team. Please do not move them. Please do not turn your back on them for long.

We hope you'll be very happy here. We hope you'll stay.

— People & Culture`,
  },
  {
    id: "O03",
    title: "Building Services: Lighting",
    file: "facilities_ticket_LT-0098.txt",
    body: `FACILITIES TICKET LT-0098
STATUS: Won't fix

REPORTED: "Most of the ceiling lights on this floor are out. The ones that work keep dipping. Every few seconds they go dark for half a breath and come back."

RESPONSE (Building Services): We have tested the ballasts. They are fine. We have replaced the tubes. They are fine. The dark ones stay dark whatever we fit, and the working ones dip regardless of the circuit they are on. The dip happens across a whole area at once, and then a different area, on no schedule we can find.

We are closing this ticket as it describes expected behaviour.

FOLLOW-UP COMMENT (reporter): Expected by who?

FOLLOW-UP COMMENT (Building Services): Please keep a torch at your desk. Point it at anything you would rather keep an eye on when the lights dip.

FOLLOW-UP COMMENT (reporter): What does that mean?

This ticket is closed and can no longer be commented on.`,
  },
  {
    id: "O04",
    title: "Automatic Reply",
    file: "outlook_autoreply_loop.txt",
    body: `RE: RE: RE: RE: RE: Out of office

Thank you for your email. I am currently out of the office with limited access to email. I will respond on my return.

> Thank you for your email. I am currently out of the office with limited access to email. I will respond on my return.

>> Thank you for your email. I am currently out of the office with limited access to email. I will respond on my return.

>>> Where are you? Your desk is still here. Your coat is still on the chair. The display figure is sitting in your chair now. I didn't see it move. Nobody ever sees it move.

>>>> Thank you for your email. I am currently out of the office with limited access to email. I will respond on my return.

>>>>> Please come back.

>>>>>> Thank you for your email. I am currently out of the office.`,
  },
  {
    id: "O05",
    title: "Mailbox 4417",
    file: "voicemail_transcript_4417.txt",
    body: `VOICEMAIL TRANSCRIPT — MAILBOX 4417 — 6 MESSAGES

1. "Hi, it's Dana from Marketing. Did someone move the mannequin from the display floor? It's not where I left it. Call me back."

2. "Dana again. It's in Accounts. Who took it to Accounts? Call me back."

3. "It's in the corridor outside my office. I've been in here all afternoon. Nobody came past my door. I'd have heard. Call me back."

4. "I put tape on the carpet round its feet. Blue tape. I'm looking right at it. It's still in the tape."

5. "The lights went. Only for a second. It's out of the tape. It's — it's nearer the door. It's nearer MY door. I didn't take my eyes off it, I swear I didn't, but the lights —"

6. [eleven seconds of rain against a window]`,
  },
  {
    id: "O06",
    title: "The Display Team",
    file: "goods_in_delivery_note.txt",
    body: `GOODS IN — DELIVERY NOTE

ITEM: Display figure, full height, articulated, finish "natural"
QTY: 1
ORDERED BY: (blank)
COST CENTRE: (blank)
SIGNED FOR BY: (blank)

Notes from Goods In:

We don't know who ordered it. Nobody in Marketing will own it. It came in on a pallet with no packing — no crate, no plastic, no foam, just standing up on the pallet like it had stepped on.

We put it in the display area off reception. In the morning it was on the third floor. We don't have a third floor.

We are not taking it back down. It is not on the third floor now anyway. Last anyone saw, it was at a desk in the cubicles, sitting very straight, facing a dead monitor.

If anyone wants to claim it, please come and sign the note. Please don't ask us to carry it.`,
  },
  {
    id: "O07",
    title: "Hot-Desking",
    file: "notebook_scan_p14.txt",
    body: `I'm keeping a record because nobody believes me.

Mon — it's at desk 3 in my block. Arms down. Facing the wall.
Tue — desk 7. One arm up, like it was about to ask a question.
Wed — not in my block. Found it by the copier. Head tipped to one side.
Thu — desk 3 again. Facing ME this time.

It has never been in the same pose twice. It has never been seen moving. I've asked everybody. Nobody has ever seen it move, and every one of us has seen it somewhere it wasn't before.

I have started working with my chair turned round, so my monitor is behind me and I'm facing the block. It makes the work harder. I don't care.

Fri — the lights dipped while I was looking at it. Just for a breath. When they came back it was a desk nearer.

I wasn't not-looking. It was dark. Dark counts as not looking.`,
  },
  {
    id: "O08",
    title: "Night Shift Rules",
    file: "security_rules_handwritten.txt",
    body: `RULES FOR WHOEVER HAS THE NIGHT AFTER ME
(I'm leaving this in the Security Office. Read it before you walk your first round.)

1. You will see a figure. A mannequin. It is not a mannequin.
2. While you are LOOKING AT IT it cannot move. Not an inch. You can stare it down all night.
3. "Looking" means: it's in front of you, nothing in the way, and you can actually SEE it. In the dark it doesn't count. Behind a wall it doesn't count. Out of the corner of your eye barely counts.
4. The lights dip. When they do, it moves. So when they dip, your torch is ALREADY ON IT. A torch on it holds it through the dark.
5. Never turn your back to walk away. Walk BACKWARDS. Slowly. It is faster than you are, and it only needs you to look away once.
6. Work in pairs. One of you watches it. The other one watches the corners.
7. It will not come into the lift lobby. Nobody knows why. Go there if you have to.
8. If it touches you, that's it.

I've walked this floor for — I don't actually know how long. These rules work.`,
  },
  {
    id: "O09",
    title: "CCTV Review",
    file: "security_cctv_review_log.txt",
    body: `CCTV REVIEW — CAMERA 14 (CUBICLES, WEST)

00:00:00 — figure at desk 12, seated.
00:41:06 — lights dip, camera 14 frame goes black (0.4s).
00:41:06 — frame returns. Figure standing in the aisle. 1.3m from desk 12.
00:58:20 — lights dip. Frame black.
00:58:21 — figure 2.6m from desk 12. Facing camera.
01:12:03 — no dip. Figure has not moved. Camera running at full rate, every frame accounted for.
01:12:03 to 03:00:00 — figure does not move. No dips in this period.

REVIEWER'S NOTE: I have been through this footage frame by frame. It does not move while the picture is up. It moves only in the frames where the lights went and the camera saw nothing.

I asked whether the camera counts as "watching". The supervisor said the camera only watches when there is light to see by. I don't know what that means for us. I think it means a camera is no better than a pair of eyes, and no worse.`,
  },
  {
    id: "O10",
    title: "The Master Card",
    file: "security_memo_stairwell_access.txt",
    body: `SECURITY MEMO — STAIRWELL ACCESS

The stairwell door is the only door on this floor that leads anywhere new. All the others lead to more of this floor.

It is controlled by a badge reader. The reader accepts ONE card: the security master card. That card is kept in the Security Office, which is, by long-standing design, at the far end of the floor from the lift.

If you need the stairwell:
  · collect the master card from the Security Office
  · carry it to the stairwell door — this is the long walk
  · badge it at the reader; the light goes from red to green
  · the door stays open after that, for everybody, permanently

If you lose the card, it is not lost. If you leave the floor with it, it returns to the Security Office. If you fall on the way, it stays with you, and somebody else will have to come and take it off you.

Nobody has asked why the card is kept as far as possible from the door it opens. Please don't ask. The answer is that it is supposed to be a walk.`,
  },
  {
    id: "O11",
    title: "Fire Drill",
    file: "fire_drill_notice.txt",
    body: `FIRE EVACUATION NOTICE — PLEASE READ

On hearing the alarm, leave the building by the nearest stairwell. Do not use the lifts.

ADDENDUM 1: Staff report that the nearest stairwell returns them to this floor. Please use a different stairwell.

ADDENDUM 2: Staff report that every stairwell returns them to this floor. Please wait at the assembly point.

ADDENDUM 3: The assembly point is on this floor.

ADDENDUM 4: Please do not take the open stairwells at all. You can see down them, and the flights go down for a very long way, and if you walk down them you come out on this floor, on a different side, out of breath, having been gone for several hours by everybody else's watch and about ten minutes by yours.

ADDENDUM 5: The only stairwell door that leads OFF this floor is the locked one with the badge reader. See Security.

The next fire drill is cancelled.`,
  },
  {
    id: "O12",
    title: "Thirty-One Flights",
    file: "survey_notes_stairs.txt",
    body: `Survey notes — the open stairwells.

There are stairwells all over this floor that you can look down into. Concrete flights, a handrail, a landing, another flight, all the way down further than a torch reaches. They look like a way out.

I counted thirty-one flights going down. At the bottom of the thirty-first there was a fire door. I opened it.

Grey carpet. Dead troffers. A water cooler. Rain on a window.

It was this floor. Not a floor like this one: THIS one. I recognised the water stain on the ceiling tile. I'd been standing under it an hour earlier, and it was four hundred metres from the stairwell I went down.

I tried going up instead. Same result, different stain.

The stairwells are scenery. You can look at them. You can't use them to leave. Only one door here goes down, and it needs a card.`,
  },
  {
    id: "O13",
    title: "Weather",
    file: "notes_on_the_windows.txt",
    body: `It has rained since we arrived. It has not got heavier and it has not let up. It is the same rain — I would swear to it — the same drops running the same way down the same panes.

Behind the rain, fog. Behind the fog, a sky the colour of a filing cabinet, always the same brightness. No sun. No moon. No change at "night", because there is no night here: the light outside is a constant overcast afternoon.

The windows are only on the outer walls. The office goes on and on inside, but the edge of it — wherever you reach the edge — has windows, and the rain is always on them.

I put my hand flat on the glass. It's cold, like real glass in real weather. I tapped it with a stapler. It sounded like glass.

I think the weather is the most frightening thing about this place, and I don't fully know why. It's that it never moves on. Everything else here is waiting. The rain is waiting too.`,
  },
  {
    id: "O14",
    title: "Sticky Notes, Cubicle 7-C",
    file: "sticky_notes_7C.txt",
    body: `[note 1, on the monitor] DON'T LOOK AT THE SCREEN — LOOK AT THE BLOCK

[note 2, on the keyboard] it used to sit at 7-F. it's at 7-D now. it's two cubicles from me.

[note 3, on the desk phone] When the lights dip — torch on it BEFORE. Not after. After is too late.

[note 4, on the partition] I can see over the partitions. So can it. I don't think it needs to.

[note 5, on the chair] i saw it in the monitor's reflection. it was behind me. i turned round and it was where it always is. so it's fine. right? the reflection doesn't count? IT DOESN'T COUNT, IT'S NOT LIGHT ON IT, IT'S JUST GLASS

[note 6, on the floor] going to the lift lobby. it won't come in there.

[note 7, under the desk, very small] im not at the lift lobby`,
  },
  {
    id: "O15",
    title: "Weekly Meeting, Minutes",
    file: "minutes_weekly_ops.txt",
    body: `WEEKLY OPERATIONS MEETING — MINUTES

PRESENT: everyone
APOLOGIES: none
ALSO PRESENT: one (see item 4)

1. Minutes of the last meeting approved, although nobody can remember the last meeting.

2. Printer on the west side jamming again. Facilities to look at it. Facilities did not attend.

3. Lights. Most out, the rest dipping. Agreed this is "the environment" and not an action point.

4. Headcount. Payroll shows the number of staff on this floor. The fire roll-call shows one more. The extra person has no name on the roll-call and is not on the payroll. Several attendees pointed out that the extra person was present at this meeting, in the chair by the whiteboard, and has been present at all of them. The chair of the meeting asked them to introduce themselves. They did not.

5. AOB: none. The meeting ended early because the lights dipped and the chair by the whiteboard was empty when they came back.`,
  },
  {
    id: "O16",
    title: "Copy Room",
    file: "copier_output_tray_scan.txt",
    body: `Found in the output tray of the big copier, in the copy room on the west side. Forty sheets. I'm describing them, not copying them. I'm not putting anything else through that machine.

Sheets 1-12: a memo about stationery orders. Normal.

Sheet 13: the same memo, but in the bottom corner, very faint, the outline of a head and shoulders, as if someone had leaned over the glass while it was scanning.

Sheets 14-30: the same memo. The figure gets clearer each time. By sheet 22 you can see it's facing the glass. By sheet 27 you can see it has no face.

Sheets 31-39: blank. Completely blank, the toner never touched them.

Sheet 40: the inside of the copy room, from where the copier stands, looking at the door. The door is open. There is a person in the doorway with a torch.

That person is me. I'm wearing what I'm wearing now. I hadn't come into the room yet when that sheet was printed.`,
  },
  {
    id: "O17",
    title: "Field Measurement 4-01",
    file: "async_survey_level4_obs01.txt",
    body: `ASYNC RESEARCH — LEVEL 4 FIELD MEASUREMENT 4-01
Observer pair: Marsh / Okafor

Subject: the figure (provisional designation "the Temp").

Method: one observer held the subject in view from 9m under working lamps; the second timed lamp dips with a stopwatch from the doorway.

Results:
  · While held in view under light, displacement zero over 41 minutes.
  · During each lamp dip (mean 0.4s, interval 8-15s), displacement up to 2.6m toward the NEAREST observer, not the one watching.
  · With a handheld torch held continuously on the subject, displacement during dips: ZERO, across 19 dips.
  · Subject out of view (observer turned 90 degrees): subject closed 8m in roughly 2.5 seconds. Faster than running pace.
  · Subject did not cross the threshold of the lift lobby on any trial.

Conclusion: the subject is immobile while lit and in the view of any observer, from any direction. Darkness or a turned head releases it. A held torch beam counts as light.

Recommendation: never survey this level alone.`,
  },
  {
    id: "O18",
    title: "Break Room Notice",
    file: "kitchen_noticeboard.txt",
    body: `KITCHEN NOTICES — please keep this area tidy!!

· Whoever keeps taking my yoghurt: it's been three years.
· The vending machines are free. They don't take money. They've never taken money. Press the button and it gives you a carton of almond water, every time, whichever button you press. Nobody stocks them. They never run out.
· Drink the almond water. It helps.
· Please do not drink the water from the water cooler. Nobody knows what's in the big bottle and it hasn't gone down in all the time we've been here.
· The fridge hums at the same pitch as the lights. When the lights dip the fridge goes quiet too. It's a good warning if you're in here with your back to the door.
· Please wash your mugs.
· Please do not leave the break room door open. Please do not leave it shut either. Leave it however it was. If you can't remember how it was, wait for someone else to come in.`,
  },
  {
    id: "O19",
    title: "Timesheet",
    file: "timesheet_wk_unknown.txt",
    body: `TIMESHEET
NAME: (rubbed out)
WEEK ENDING: (blank)

MON  in 08:52  out —
TUE  in —      out —
WED  in —      out —
THU  in —      out —
FRI  in —      out —

TOTAL HOURS: I have been working for what feels like one very long day. My watch has done several hundred laps and the light outside has not changed. I have eaten from the vending machine I don't know how many times. I sleep under my desk. I have not been home. I don't know where the lift went after it brought me here. I press the button and it doesn't come.

Approval (line manager): ________________

There's a line for a manager to sign. Nobody has signed it. I don't think anybody is going to. I'm handing it in anyway, because that's what you do at the end of the week, and I would really like this to be the end of the week.`,
  },
  {
    id: "O20",
    title: "The Door With the Reader",
    file: "survey_notes_stairwell_door.txt",
    body: `Found it. The real one.

At the far side of the floor, through a room with almost nothing in it, there's a stairwell door that's nothing like the open stairwells. Heavy. Steel. Grey paint scuffed to the metal at hand height. A wired-glass window too dark to see through. And beside it, on the wall at shoulder height, a badge reader with a little red light.

Red means locked. I tried my ID card. It beeped at me, the way they do, the sorry-not-you beep.

You can put your ear to the door. It's cold. There's a draught under it that smells different from the office — damp, and older, and somehow expensive, like a hotel corridor where the carpet has been wet for a long time.

The card that opens it is in the Security Office. I've been to the Security Office. It's as far from here as it's possible to be on this floor.

Of course it is.`,
  },
];

/** THE BACKROOMS LAWS, law 1: every drive's archive description and Dr. Voss's
 *  note on it. */
export const OFFICE_DRIVE_NOTES: Record<string, { desc: string; ada: string }> = {
  O01: {
    desc: "A surveyor's account of riding the lift down from the Station into the office.",
    ada: "The lift descends for one hundred and ninety seconds, which at any plausible speed places this floor deeper than the station by several kilometres. Every window in it nevertheless shows rain at ground level. I have stopped reconciling the two.",
  },
  O02: {
    desc: "The first page of a new starter's welcome pack, from People & Culture.",
    ada: "The pack is accurate on every operational point, including the ones phrased as hospitality. 'Please do not turn your back on them for long' is the most useful sentence a human resources department has ever written.",
  },
  O03: {
    desc: "A facilities ticket on the floor's dead and dipping lights, closed as won't-fix.",
    ada: "I have fitted new tubes to forty dead troffers. None lit. The working ones dip for four tenths of a second, an area at a time, eight to fifteen seconds apart. Building Services were right to close the ticket. There is nothing to fix; there is something to manage.",
  },
  O04: {
    desc: "An out-of-office auto-reply chain with something else threaded through it.",
    ada: "The mail server is still running and still answering itself. The quoted human messages in the chain are dated across what the timestamps insist is a single afternoon.",
  },
  O05: {
    desc: "A transcript of six voicemails left in mailbox 4417 by someone in Marketing.",
    ada: "The blue tape is still on the carpet by the display area. The figure is not in it. Her account of the dip is consistent with every measurement we have since taken.",
  },
  O06: {
    desc: "A goods-in delivery note for a display figure that nobody ordered.",
    ada: "There is no third floor. I checked, because the note asked me to wonder. The delivery note has no signature in any field, which is the only paperwork on this level that is fully accurate.",
  },
  O07: {
    desc: "A notebook page tracking the display figure's position desk by desk over a week.",
    ada: "Never the same pose twice is correct. I have photographed it thirty-eight times. 'Dark counts as not looking' is the clearest statement of its rule anyone has made, and she made it on a Friday.",
  },
  O08: {
    desc: "A night guard's handwritten rules for walking rounds on the office floor.",
    ada: "Each of the eight rules has been tested by my teams and each holds, including the seventh. I would add a ninth: a teammate watching it from behind you counts exactly as much as you watching it yourself.",
  },
  O09: {
    desc: "A security reviewer's frame-by-frame log of CCTV footage of the figure.",
    ada: "The reviewer's supervisor was correct. Observation requires light to observe by. A camera in a dark room is not watching, and neither are you.",
  },
  O10: {
    desc: "A security memo on the master card and the badge-locked stairwell door.",
    ada: "Everything in the memo is so. The card is never lost; it returns or it waits on whoever fell carrying it. That someone designed the walk to be long is the part of the memo I find hardest to read neutrally.",
  },
  O11: {
    desc: "A fire evacuation notice with five increasingly desperate addenda.",
    ada: "Addendum four is correct to the minute: a surveyor who took an open stairwell was gone eleven minutes by her watch and three hours and twelve minutes by mine. She came out on this floor, on the opposite side.",
  },
  O12: {
    desc: "A surveyor's notes on walking the open stairwells down and up again.",
    ada: "Thirty-one flights is consistent with our counts. The water stain is a useful landmark and I have adopted it. The stairwells are geometry with no exit, which is a sentence I have now written about three levels.",
  },
  O13: {
    desc: "Observations on the windows, the rain and the unchanging sky outside.",
    ada: "The rainfall rate does not vary to the precision of my gauge. The sky's brightness does not vary at all. I share her view that this is the most unsettling fact on the floor, and I also cannot say why.",
  },
  O14: {
    desc: "Sticky notes left around cubicle 7-C, the last one under the desk.",
    ada: "A reflection is not light falling on the subject, and does not hold it — that note is correct. The final note was in the same hand as the others. We did not find its author.",
  },
  O15: {
    desc: "Minutes of a weekly operations meeting with one attendee more than the payroll.",
    ada: "Item four is the only recorded attempt to address the figure through proper channels. It was not a bad attempt. The chair by the whiteboard is still there; I have not sat in it.",
  },
  O16: {
    desc: "A description of forty sheets found in the copy room's output tray.",
    ada: "I ran a blank sheet through the same copier under supervision. It printed blank. I have kept the forty sheets sealed and have not looked at sheet forty again.",
  },
  O17: {
    desc: "Async's first field measurement of the figure, provisionally called the Temp.",
    ada: "This is my team's report and I stand by every figure in it. The most important line is the fifth: it does not cross into the lift lobby. Survey from there outward and you always have somewhere to retreat to.",
  },
  O18: {
    desc: "A break room noticeboard, including a note about the vending machines.",
    ada: "The machines dispense almond water on any button, without payment, and do not run out. I have had a sample assayed. It is almond water. The water cooler's bottle I have not opened, on the noticeboard's advice.",
  },
  O19: {
    desc: "A timesheet with one clock-in and no clock-out, and a note in the hours box.",
    ada: "The lift does not return when called from this floor. It comes only from the Station's side. I have filed this timesheet in the archive, which is the nearest thing to approving it that I am able to do.",
  },
  O20: {
    desc: "A surveyor's notes on finding the locked stairwell door with the badge reader.",
    ada: "The draught under the door is measurably damper and four degrees colder than the office. The smell is correctly described. Whatever is below has carpet, and its carpet has been wet a long time.",
  },
};
