// THE TERROR HOTEL ARCHIVE — twenty drives found only on Level 5. Same rules
// as the other archives (lore.ts): text never leaves the server until found,
// an unlock is permanent and global. Ids are H-prefixed and FOREVER.
//
// What the strand is for: the hotel's rules said in its own voice — the
// register and the numbered doors, the lifts (1 to 12 go somewhere on this
// floor, 13 goes nowhere anyone comes back from), the Beverly Room's table,
// the heat below stairs and the almond water in the pipes, and the moths
// that come to whoever carries the brightest light. Nothing here names a
// room number: the register's is drawn per map, and a drive that gave one
// away would be wrong on every other.
import type { DriveDef } from "./lore";

export const HOTEL_DRIVES: DriveDef[] = [
  {
    id: "H01",
    title: "The Service Stair",
    file: "arrival_from_the_stairwell.txt",
    body: `The keycard worked. The stairwell door opened on a concrete stair going down, painted fire-escape grey, with a handrail worn smooth by somebody's hand a very long time ago.

We counted the flights. We stopped counting at forty.

At the bottom there was a plain staff door with a brass kick plate, and behind it, music. Not loud. A trumpet a long way off and somebody laughing at something the trumpet said.

The door opened on a hotel. Red carpet with a gold border. Wallpaper the colour of the inside of a wine glass. A corridor of numbered doors going on further than the building above it could possibly have room for.

It is warm here. Not hot, not yet. Warm the way a room is when a party has just left it.

Nobody came to meet us. Somewhere down the corridor a lift chimed, and its doors opened, and nobody got out.`,
  },
  {
    id: "H02",
    title: "Guest Services Card",
    file: "card_left_on_the_landing.txt",
    body: `WELCOME TO THE HOTEL

We hope you enjoy your stay. A few notes for your comfort:

YOUR ROOM: Your room number is recorded in the guest register, which is kept on the table in the Beverly Room. If you have forgotten your room, the register has not.

THE DOORS: Most doors on this floor are for other guests. Please do not try them. They will not open, and the guests inside would rather they didn't.

THE LIFTS: Our lifts serve floors 1 through 12. Each will take you somewhere else on this floor. We regret that service above floor 12 is suspended. Please do not press 13.

THE BOILER ROOM: Staff only. If you must go below stairs, please carry water.

LIGHTS: Guests are kindly asked to keep torches low in the corridors after dark. It upsets the moths.

Enjoy the band.

— The Management`,
  },
  {
    id: "H03",
    title: "The Register",
    file: "beverly_room_notes_1.txt",
    body: `The Beverly Room is the size of a cathedral and almost empty. Red carpet to the walls. Chandeliers you could park a car under. Doors all the way round, more than I could count without losing my place.

In the very middle, under the biggest chandelier, a little round table. Two glasses, one half full. A game of Mahjong set out and abandoned mid-hand, the tiles still standing in their walls.

And beside the game, a guest register, open.

It's a leather book, the pages ruled in columns: NAME, ARRIVED, ROOM. Most of the names are smudged out as though somebody wiped them with a wet thumb. One line near the bottom is still clear. A name I didn't recognise. An arrival date that hasn't happened. And a room number.

I wrote the number on the back of my hand.

I did not touch the Mahjong tiles. I wanted to. I wanted to very badly, which is why I didn't.`,
  },
  {
    id: "H04",
    title: "Housekeeping: Room Inspection",
    file: "housekeeping_checklist.txt",
    body: `HOUSEKEEPING — ROOM INSPECTION CHECKLIST

[ ] Bed made, corners squared
[ ] Wardrobe empty, hangers facing the same way
[ ] Lamp on bedside table — CHECK IT WORKS
[ ] Number on the door matches the number in the register
[ ] Key on the hook (ONE ROOM ONLY — see below)

NOTE FROM THE HEAD HOUSEKEEPER:
Every room on this floor has a key hook. Only one room has a key on it, and it is not the same room every season. The key is the Boiler Key. It is the only key that opens the rusty door downstairs. It is never to leave this floor.

If a guest asks you which room has it, tell them to check the register. The register always knows. We never do.

If a room's number does not match anything in the register, it is not a room. Close the door and move on.

If a room's number is not on any door, do not go looking for that door.`,
  },
  {
    id: "H05",
    title: "Numbers",
    file: "surveyor_notes_corridors.txt",
    body: `I have walked the Main Hall for four hours trying to find a pattern in the door numbers.

There isn't one. 117 is next to 403. 236 faces 158 across the corridor. There is a 210 and a 211 but they're nowhere near each other. Some numbers come up twice in different corridors, as if the hotel ran out and started again.

The doors with numbers on the corridor walls do not open. The handles turn and nothing happens. I put my ear to one and heard a party. Glasses, laughter, a woman saying "oh, you didn't" in the delighted way people say that.

The rooms that DO open are different. A real door, standing slightly ajar, its number on a brass plate on the frame. Inside, a bed, a wardrobe, a lamp. Every one I've found has a little brass hook by the bed. All of them empty so far.

The number on the back of my hand is getting smudged. I keep re-inking it.`,
  },
  {
    id: "H06",
    title: "Lift Maintenance Log",
    file: "lift_maint_log_bank_c.txt",
    body: `LIFT MAINTENANCE LOG — BANK C

Car tested floors 1 through 12. All doors open on to this floor, Main Hall, at a different lift each time. Floor selection appears to determine destination. Destination appears consistent for a given floor from a given car.

Car NOT tested above 12. See standing order.

STANDING ORDER (Chief Engineer): No car on this floor is to be taken above 12. The panel shows buttons to 20. They are wired. They work. That is the problem.

INCIDENT, appended: An apprentice pressed 13 to see what would happen. The doors closed. The indicator went 13, 14, 15 and stopped. The car came back down empty. The doors opened on nothing but the car, and the car smelled of the sea.

We have taped over the buttons. The tape keeps coming off.`,
  },
  {
    id: "H07",
    title: "Night Porter's Diary",
    file: "porter_diary_week_unknown.txt",
    body: `Monday (I think). The band started up at 8 again. There is no band. I have checked the ballroom, the dining room, the lounges. The music is loudest in the corridors and it's the same three songs.

Tuesday. Party in 214 till all hours. 214 is a corridor door. Corridor doors don't open. They had a lovely time.

Wednesday. One of the portraits in the Reading Room was looking at the door when I came in and at the window when I left. There is no window.

Thursday. Saw the moths for the first time. A cloud of them came out of a linen closet and went straight down the corridor at a guest who had a torch. I have never seen moths move like that. Like they'd been called.

Friday. The guest is all right. He turned the torch off and stood still and they went past him and on to the next light. He said it was like standing in a blizzard of paper.

He says he's never turning his torch on again. I give it a day.`,
  },
  {
    id: "H08",
    title: "Pest Control Report",
    file: "pest_control_deathmoth.txt",
    body: `PEST CONTROL — SITE REPORT

SPECIES: Large moth, wingspan to thirty centimetres, grey-brown, a pale mark on each wing like an eye. Staff call them deathmoths. The name is accurate.

NESTING: Dark rooms only. Linen closets, coal stores, any suite where the bulb has gone. They sleep in clusters until a light comes near.

BEHAVIOUR: They go to the BRIGHTEST light within reach, not the nearest. A hand torch outshines a sconce, so they come to the torch, and to the person holding it. They surround the light and bite whatever is under it. Ten seconds in a swarm will kill a grown adult.

They lose interest quickly. A light switched off for a few seconds, or a shut door between you and them, and they drift off looking for the next light.

The chandelier in the Beverly Room is brighter than anything a guest can carry. A swarm that reaches that room forgets everybody in it.

RECOMMENDATION: Do not carry a torch into a dark room unless you are prepared to put it out.`,
  },
  {
    id: "H09",
    title: "The Mahjong Table",
    file: "beverly_room_notes_2.txt",
    body: `I went back to the Beverly Room to check the register again. It says the same thing it said before. I'm glad. I was afraid it would have changed its mind.

I sat at the table for a while because my feet hurt. The Mahjong hand is East's turn. East has a very good hand. I could see it from where I was sitting, I wasn't looking at it on purpose.

The half-full glass is still half full. The ice in it has not melted. It's warm in here and the ice has not melted.

When I got up to leave I noticed I had moved one tile. I don't remember doing it. I put it back.

When I put it back I heard, very clearly, from all round the room, somebody sigh. Not an angry sigh. Disappointed. The way your grandmother sighs when you cheat at cards.

I will not sit at that table again.`,
  },
  {
    id: "H10",
    title: "Memo: The Boiler Room",
    file: "memo_below_stairs.txt",
    body: `MEMO — ALL STAFF
RE: Working below stairs

The Boiler Room door off the Main Hall is the ONLY way down. Please use it, and please close it behind you.

HEAT: It is hot below stairs and it gets hotter the deeper you go. You will not notice how hot until it is too late. Come up for air. If you feel dizzy, come up NOW.

FURNACES: Do not stand at an open furnace. The doors are open because they will not shut. Walk past them, not in front of them.

WATER: The pipes leak almond water. It is safe to drink. It is, in fact, the only thing down there that will cool you down. Carry some.

THE RUSTY DOOR: At the far end of the Boiler Room there is a rusted iron door. It takes the Boiler Key. It goes down to somewhere with no lights at all. You do not need to go through it. Nobody needs to go through it.

— The Chief Engineer`,
  },
  {
    id: "H11",
    title: "Furnace Tender's Notes",
    file: "furnace_tender_shift.txt",
    body: `Shift notes, furnace room 3.

Fed all four. They don't need feeding. Fed them anyway, it's my job.

The furnaces talk. Not words, not really. A sort of whispering when the draft catches the doors. If you stand close enough you can almost hear names. I don't stand close enough. Stand at the mouth of one of those and your eyebrows go, then your coat, then you.

It was 51 degrees by the pipe gauge today. The new lad didn't believe me about the heat and went down to the far end without water. Came back up the colour of a tomato, raving about a red door. We poured almond water over his head from the leaking joint by the coal store. He was fine after.

The far end is the worst. Further you go, hotter it gets, and there's nothing to cool you but what you carry and what drips.

Remember: up the stairs to the Main Hall and you cool off. It's not the air. It's the hotel deciding you've had enough.`,
  },
  {
    id: "H12",
    title: "Room Service Ticket",
    file: "room_service_ticket.txt",
    body: `ROOM SERVICE — ORDER TICKET

ROOM: (smudged)
ORDER: Champagne, two glasses. One plate of oysters. Hot towels.
SPECIAL INSTRUCTIONS: "Please knock three times. Do not come in if the lamp is off."

KITCHEN NOTE: Delivered. Knocked three times. Lamp was off. Left the tray outside.

KITCHEN NOTE (later): Tray still outside. Champagne still cold. Oysters still fresh. The lamp in that room has been off for, by our count, eleven years.

KITCHEN NOTE (later still): Something has been at the oysters. Nothing has been at the champagne. There are grey scales all over the tray, like the dust off a moth's wing.

DO NOT SEND ANYTHING TO THAT ROOM AGAIN.`,
  },
  {
    id: "H13",
    title: "The Band",
    file: "dance_card.txt",
    body: `A DANCE CARD, left on a chair in the Palm Lounge

1. Foxtrot — "Somebody"
2. Waltz — "Somebody"
3. Quickstep — (blank)
4. Foxtrot — "You promised"
5. Waltz — (blank)
6. Last dance — "Don't go"

On the back, in pencil:

The music never stops but the band never comes. You can follow it down the corridors and it's always one corridor ahead. If you stand very still in the Beverly Room you can hear it come from every door at once, like the whole hotel is the bandstand.

If you dance, the floor dances with you. I danced for what felt like a song and when I sat down my watch said six hours had gone.

Don't dance. Or do. It's the nicest thing that happens here.`,
  },
  {
    id: "H14",
    title: "Portraits",
    file: "reading_room_inventory.txt",
    body: `READING ROOM — INVENTORY OF PICTURES

Portrait, gentleman in evening dress, oil. Eyes follow.
Portrait, lady in grey, oil. Eyes follow.
Portrait, child with a hoop, oil. Eyes follow.
Landscape, a lake at evening. Eyes follow.

That last one is not a mistake. There are no eyes in the painting of the lake. When you walk past it you feel watched from the lake.

Note from the archivist: Every painting on this floor faces the nearest door. I have turned three of them to face the wall. In the morning they were facing the door again.

Second note: I have stopped turning them. I don't think they mean us harm. I think they're waiting for someone to come in through that door, and they don't want to miss them.

Third note: I think I am who they're waiting for.`,
  },
  {
    id: "H15",
    title: "Lost Property",
    file: "lost_property_book.txt",
    body: `LOST PROPERTY BOOK — FRONT DESK

1 umbrella, black. Claimed.
1 pair of gloves, kid leather. Claimed.
1 cigarette case, silver, initials J.H. Not claimed.
1 hazmat suit, yellow, size L, wet through. Not claimed.
1 Async Research ID card. Not claimed.
1 hand torch, battery dead, lens covered in grey dust. Not claimed.
1 brass room key, number filed off. Claimed — "by the hotel".
1 notebook, pages full of the same room number written over and over. Not claimed.

Front desk note: The Async items keep turning up. The surveyors come down the service stair, they walk the corridors, they find their room, they go below stairs, and some of them we see again and some of them we don't.

The ones we see again all say the same thing. "I followed the register."`,
  },
  {
    id: "H16",
    title: "Walkie Transcript, Below Stairs",
    file: "radio_log_boiler.txt",
    body: `[RADIO LOG — ASYNC SURVEY TEAM, BOILER ROOM]

KESTREL: I'm through the Boiler Room door. God, it's hot. Like opening an oven.
SPARROW: Do you have the key?
KESTREL: In my pocket. I found the room. The register was right.
SPARROW: Where's the rusty door?
KESTREL: Far end, they said. Everything's pipes. The tunnels go every which way.
SPARROW: How's the heat?
KESTREL: Climbing. I've had half my water. There's a leaking joint here, I'm topping up.
SPARROW: Don't stand near the furnaces.
KESTREL: I can hear them. They're saying something.
SPARROW: Don't listen. Keep moving.
KESTREL: Coal store on my left. There's something on the ceiling in there. A lot of somethings.
SPARROW: Torch off. TORCH OFF.
KESTREL: Off. Off. They're... they're settling. Okay. Moving on in the dark.
KESTREL: I see it. Red door. Rust all over it.
SPARROW: Use the key.
[END OF LOG]`,
  },
  {
    id: "H17",
    title: "Party Chatter",
    file: "transcribed_through_a_wall.txt",
    body: `[Transcribed through the wall of room 236, which does not open]

"— and he said he'd only be down for the weekend —"
"— oh, they all say that, darling —"
"— have you seen the new arrivals? In the yellow suits?"
"— terribly rude, they never stay for the dancing —"
"— one of them sat at the Mahjong table, can you imagine —"
"— and moved a TILE —"
"— no!"
"— put it back, at least. Manners —"
"— they're all looking for the same room, you know. They read it in the book —"
"— well, of course they do, darling, that's what the book is FOR —"
"— more champagne?"
"— always."

[laughter, for a long time, until it stops all at once]`,
  },
  {
    id: "H18",
    title: "Coal Store",
    file: "coal_store_notes.txt",
    body: `There's no coal in the coal store. There's a room with black walls and a black floor and something on the ceiling that I thought was soot until it moved.

Moths. Hundreds. Hanging upside down, wings folded, like a ceiling made of dead leaves.

I had the torch on. I didn't know. The first one dropped, and then they all dropped, and the room filled up with grey wings and that sound, that papery roaring sound, and they came at the light. At me.

I didn't think. I switched it off.

It was like the room took a breath. The wings kept going for a second, two seconds, three. Then slower. Then they drifted back up to the ceiling, bumping into me on the way like I was furniture.

I stood in the dark for a long time.

Nests in the dark rooms. The suites with dead bulbs. The linen closets. The coal stores. If a room is dark when you get there, there's a reason.`,
  },
  {
    id: "H19",
    title: "The Rusty Door",
    file: "engineer_note_on_the_door.txt",
    body: `A note tied to the handle of the rusty door with string:

This door was here before the hotel. We built the Boiler Room around it because we couldn't move it, and we put the furnaces in to keep whatever's behind it warm, or to keep it busy, nobody remembers which.

The Boiler Key opens it. There is one key. It lives on a hook in one of the guest rooms and the room is in the register. When it's used it doesn't come back.

Behind the door there are stairs going down into dark. Not dim. Dark. The kind of dark where your torch shows you the beam and nothing at the end of it.

They call it Lights Out down there.

If you are reading this you have come a very long way. You do not have to go on. The hotel will look after you. There is music. There is always music.

But if you do go on — and you will, they all do — take every battery you own.`,
  },
  {
    id: "H20",
    title: "Checkout",
    file: "checkout_card.txt",
    body: `THANK YOU FOR STAYING WITH US

We hope you have enjoyed your time at the hotel. We know that not every guest stays as long as they meant to, and not every guest leaves the way they arrived.

If you are leaving by the service stair, please return your torch to the front desk. Nobody else uses that stair.

If you are leaving by the lifts, please press a number between 1 and 12. We cannot be responsible for numbers above 12.

If you are leaving by the rusty door, please take the Boiler Key with you. We will not need it again until the next guest finds the register.

Your room will be kept exactly as you left it. The lamp will be left on.

We look forward to welcoming you back.

We always do.

— The Management`,
  },
];

/** Dr. Voss's description and note for every drive (law 1). */
export const HOTEL_DRIVE_NOTES: Record<string, { desc: string; ada: string }> = {
  H01: {
    desc: "A surveyor's account of the long stair down from the office into the hotel.",
    ada: "Forty-one flights by my count, which no building above it accounts for. The temperature at the bottom is twenty-six degrees and rises two degrees for every hundred metres below stairs. The trumpet is real; I have yet to find the trumpeter.",
  },
  H02: {
    desc: "A guest services card from the landing, listing the hotel's house rules.",
    ada: "Every line on this card has been borne out by observation, including the one about the moths. The management is either very well informed or the hotel writes its own literature. I suspect the latter.",
  },
  H03: {
    desc: "A surveyor's first visit to the Beverly Room, the register and the unfinished game.",
    ada: "The register names one room per survey, and it is never the same room twice running. Every surveyor who followed it found the key. Every surveyor who touched the Mahjong tiles reported a sound I will not try to characterise.",
  },
  H04: {
    desc: "A housekeeping inspection checklist with a note from the head housekeeper.",
    ada: "One key, one hook, one room, recorded in one book. It is the tidiest security arrangement I have encountered in the Backrooms, and I say that having surveyed a bank run by goblins.",
  },
  H05: {
    desc: "A surveyor's notes on the corridor door numbers, which follow no pattern.",
    ada: "I have catalogued over three hundred corridor numbers. None repeats the number in the register on any survey I have run. The open rooms carry their number on the frame, not the door; that distinction is the whole of the search.",
  },
  H06: {
    desc: "A maintenance log for a bank of lifts, and a standing order about floor 13.",
    ada: "Floors one to twelve deliver to other lifts on this floor, consistently for a given car and button. I have mapped them. I have not tested thirteen and I do not authorise anyone under my contract to do so.",
  },
  H07: {
    desc: "A night porter's diary of a week of music, parties, portraits and moths.",
    ada: "The porter's account of the moths is the earliest we have and it is correct in every particular, including the remedy. 'Turn the torch off and stand still' is now in the field manual, verbatim.",
  },
  H08: {
    desc: "A pest control site report on the deathmoths: their nests, their behaviour, their weakness.",
    ada: "Brightest, not nearest. That one word reorders every habit four levels have taught you. On this floor your torch is not a weapon; it is bait. The chandelier is the only light down here that out-bids you.",
  },
  H09: {
    desc: "A surveyor's second visit to the Beverly Room, and the tile they moved.",
    ada: "The ice in the glass has been at minus two degrees for every reading I have taken. The room is twenty-six. I have filed the sigh under 'acoustic anomaly', which is a lie, but a professional one.",
  },
  H10: {
    desc: "An all-staff memo on working below stairs: the heat, the furnaces, the water, the door.",
    ada: "Accurate and under-stated. Core temperature climbs steadily below stairs and falls the moment you are back in the Main Hall. Almond water from the leaking joints cools faster than anything we brought. Carry it.",
  },
  H11: {
    desc: "A furnace tender's shift notes on the heat, the whispering, and a young lad's mistake.",
    ada: "The furnaces burn at the mouth and nowhere else; you may walk past one at arm's length safely. Do not stop in front of one to listen. The whispering is intelligible if you do, which is the problem.",
  },
  H12: {
    desc: "A room service ticket for a suite whose lamp has been off for eleven years.",
    ada: "A dark suite on this floor is a nest until proven otherwise. The scales on the tray match the specimens from the coal stores. The champagne, for the record, is excellent.",
  },
  H13: {
    desc: "A dance card left in the Palm Lounge, with a warning about the music on the back.",
    ada: "Time spent dancing in the Beverly Room does not agree with time spent anywhere else. I lost four hours to a waltz. I would like it noted that I was asked.",
  },
  H14: {
    desc: "An archivist's inventory of the Reading Room's portraits, and what they face.",
    ada: "Every painting faces the nearest door, and returns to it overnight. I have not seen one move. I have stopped requiring that I see things move before I believe they have.",
  },
  H15: {
    desc: "The front desk's lost property book, much of it ours.",
    ada: "Eleven of the unclaimed items are Async issue. The pattern in the claims is the same as in the field: those who followed the register came back. I keep that line on the briefing board.",
  },
  H16: {
    desc: "A radio log of a surveyor crossing the Boiler Room to the rusty door.",
    ada: "Kestrel made the crossing with half a bottle and a dark torch. Both decisions were correct. The coal store she describes is one of several, and the remedy she used is the only one we know.",
  },
  H17: {
    desc: "A party transcribed through the wall of a corridor room that does not open.",
    ada: "The guests behind the corridor doors are aware of us, mildly disapproving, and apparently well informed about the register. I would like very much to interview one. None of the doors has ever opened.",
  },
  H18: {
    desc: "A surveyor's account of a coal store full of sleeping moths.",
    ada: "The swarm loses a target within a few seconds of the light going out, and will not follow through a shut door. Both facts have saved lives. Neither is comfortable to rely on in a room full of wings.",
  },
  H19: {
    desc: "A note tied to the handle of the rusty door at the far end of the Boiler Room.",
    ada: "The door predates the hotel's construction by the hotel's own account. The key is consumed by the lock. What lies beyond is dark to every instrument we carry. Level 6 is not yet surveyed, and I am not yet ready to send anyone.",
  },
  H20: {
    desc: "A checkout card from the front desk, thanking the guest for their stay.",
    ada: "The hotel is the first level that seems to want us to stay, and the first whose way on it describes as an exit. I have read this card many times. I take the last line as a promise rather than a threat, most days.",
  },
};
