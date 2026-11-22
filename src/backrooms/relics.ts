// The relic catalog — B3's hidden treasure list. The COUNT is never shown
// to players (the section says so), collection identity is revealed only on
// pickup, and relics reach SILVER only via the player market (the sole-
// faucet doctrine) or Voss's acquisition account for duplicates.
//
// Images live at client/public/assets/relics/<img> (Josh's art, cut out by
// scripts/relic-art.mjs). IMPORT-FREE: the client reads this file too
// (client/src/backrooms/reliccatalog.ts), so a description or one of Dr.
// Voss's notes is written once, here.
//
//   desc  what the item card says — plain, one or two sentences
//   ada   Dr. Voss's note on it: accurate, measured, never rude (her voice
//         is src/voss.ts's; she MEASURES where Sterling moralizes)

export interface RelicDef {
  slug: string;
  name: string;
  img: string; // client asset filename
  desc: string;
  ada: string;
}

export const RELICS: RelicDef[] = [
  {
    slug: "alien-tech",
    name: "Alien Tech",
    img: "alien-tech.webp",
    desc: "A piece of a machine nobody on Earth built. The blue light inside it has never gone out.",
    ada: "The cell inside has held its charge longer than this building has existed. I have stopped asking what it powers and started asking what it is waiting for.",
  },
  {
    slug: "blue-crystal",
    name: "Blue Crystal",
    img: "blue-crystal.webp",
    desc: "A knot of blue glass that loops through itself with no seam and no beginning.",
    ada: "I traced the loop with a stylus for forty minutes and never reached the start. I have filed it under geometry, provisionally.",
  },
  {
    slug: "cursed-doge",
    name: "Cursed Doge",
    img: "cursed-doge.webp",
    desc: "A carved dog's face, worn smooth by hands. The eyes were empty when it was found. The stains under them were not.",
    ada: "Limestone, about a century old, and it weeps a fluid I have not been able to name. My assistant said \"much wow\" on seeing it. He has since been reassigned. The two are not related, but I understand why you would assume so.",
  },
  {
    slug: "god-slayer",
    name: "God Slayer",
    img: "god-slayer.webp",
    desc: "A rusted broadsword, far too heavy for its size. Whatever it was forged to kill, the blade still remembers.",
    ada: "The rust is iron oxide. The metal under it is not iron. It weighs more than its volume allows, by a margin I would call religious if I were not a scientist.",
  },
  {
    slug: "golden-cross",
    name: "Golden Cross",
    img: "golden-cross.webp",
    desc: "A gilded reliquary cross with a red stone at its heart. It is warm to the touch in a place with no heat.",
    ada: "The gold is genuine and the stone is a garnet. The warmth is neither. It holds at thirty-seven degrees, which is a human body's temperature, and I would prefer it held any other.",
  },
  {
    slug: "infernal-stone",
    name: "Infernal Stone",
    img: "infernal-stone.webp",
    desc: "A lump of rock split by veins of fire that never cool and never spread.",
    ada: "Surface temperature, nine hundred degrees. A centimetre away, room temperature. I lost two gloves establishing that the second number is the one you can rely on.",
  },
  {
    slug: "magical-org",
    name: "Magical Orb",
    img: "magical-org.webp",
    desc: "A stone sphere carved with a glowing sigil. Its runes rearrange themselves when nobody is looking.",
    ada: "I photographed it every hour for a week. No two photographs agree on the runes. The camera is fine. I checked the camera.",
  },
  {
    slug: "magical-urn",
    name: "Magical Urn",
    img: "magical-urn.webp",
    desc: "A black funeral urn with a skull on its face and green light leaking from the cracks. Whatever is inside is not ash.",
    ada: "The contents weigh four hundred grams and shift toward whoever is holding it. I have not opened it. I would like it noted that this is the first time I have said that about anything.",
  },
  {
    slug: "mysterious-pendant",
    name: "Mysterious Pendant",
    img: "mysterious-pendant.webp",
    desc: "A green stone in an old bronze setting, on a chain long enough to wear. Whoever wore it last is in no record.",
    ada: "Every surveyor who has carried it out says it grew heavier near the doors. Every one. I do not collect anecdotes, but I do notice when they agree.",
  },
  {
    slug: "the-ancient-teapot",
    name: "The Ancient Teapot",
    img: "the-ancient-teapot.webp",
    desc: "A battered copper teapot, green with age. Shake it and you can hear tea.",
    ada: "It is empty. It also pours. I have run the experiment eleven times and it is Earl Grey every time, which is the only part of this I find genuinely offensive.",
  },
];

/** THE POOLROOMS' OWN treasure (Josh, July 2026): these spawn ONLY on
 *  Level 1; the list above stays Level 0's. Collections, Voss and the
 *  market treat them identically once carried out. */
export const POOL_RELICS: RelicDef[] = [
  {
    slug: "cactus-stone",
    name: "Cactus Stone",
    img: "cactus-stone.webp",
    desc: "A desert stone with a cactus cut into it, found a long way from any sand. The carving glows at dusk.",
    ada: "Sandstone, from a desert that does not share a planet with the Poolrooms. It arrived dry. Everything else from down there arrives wet, including my surveyors.",
  },
  {
    slug: "crown-ruby",
    name: "Crown Ruby",
    img: "crown-ruby.webp",
    desc: "A heart-shaped ruby under a tiny crown. It beats, faintly, about once a minute.",
    ada: "Sixty-one beats an hour. I timed it against my own pulse. Mine was faster, which I attribute to the conditions of the measurement.",
  },
  {
    slug: "emerald-stone",
    name: "Emerald Stone of Allah",
    img: "emerald-stone.webp",
    desc: "A gold medallion ringed with emeralds around a pale stone that holds light like still water.",
    ada: "The centre stone refracts light that is not in the room. Hold it up in the dark and you will see a sunrise. I have done so a professionally inadvisable number of times.",
  },
  {
    slug: "jewel-of-the-beholden",
    name: "Jewel of the Beholden",
    img: "jewel-of-the-beholden.webp",
    desc: "A ring of black stone lined with pale bone. It fits every finger it's tried on, and doesn't like to come off.",
    ada: "It resized itself to my hand, and I have the X-ray to prove it. Removal took soap, twenty minutes and a colleague. The colleague has asked not to be named.",
  },
  {
    slug: "magic-opal",
    name: "Magic Opal",
    img: "magic-opal.webp",
    desc: "An opal with a fire inside that shifts with your mood.",
    ada: "Its colour follows the holder's heart rate almost exactly. I have seen it burn orange in my own hand once: the day the goblins wrote to me.",
  },
  {
    slug: "rock-of-ages",
    name: "Rock of Ages",
    img: "rock-of-ages.webp",
    desc: "A carved stone mask, older than the rooms it was found in. Its eyes are always turned toward the nearest way out.",
    ada: "Carbon dating returned a number I have chosen not to publish. Its eyes track the nearest door. I use it. I do not like that I use it.",
  },
  {
    slug: "sapphire-amulet",
    name: "Sapphire Amulet",
    img: "sapphire-amulet.webp",
    desc: "A silver amulet around a sapphire with a slow storm turning inside it.",
    ada: "The storm turns once a day, clockwise, in a stone with no room for weather. I have named it. The name is in my notes, where it belongs.",
  },
  {
    slug: "the-lost-compass",
    name: "The Lost Compass",
    img: "the-lost-compass.webp",
    desc: "An old brass compass that never points north. It points at whatever you've lost.",
    ada: "In a surveyor's hand it points to the nearest exit. In mine it points to my office. I have taken that as a comment, not a reading.",
  },
  {
    slug: "void-relic",
    name: "Void Relic",
    img: "void-relic.webp",
    desc: "A dark sphere cradled in broken gold. Look into it long enough and it starts looking back.",
    ada: "It swallows all but a thousandth of the light that falls on it and returns that thousandth from somewhere else. I would like to know where. I would like it more than is sensible.",
  },
  {
    slug: "hieroglyphics-tablet",
    name: "Hieroglyphics Tablet",
    img: "hieroglyphics-tablet.webp",
    desc: "A stone tablet carved in a script no language on Earth uses. Some of the symbols look like pools.",
    ada: "Forty-one distinct glyphs. Six are floor plans of rooms we have surveyed. One is a room we have not. I have stopped ruling out that it is a set of instructions.",
  },
];

/** PIPE DREAMS' OWN treasure (Josh, Sep 2026): spawns ONLY on Level 2.
 *  Claire's Binky is an Easter egg for Josh's daughter, Claire. */
export const PIPE_RELICS: RelicDef[] = [
  {
    slug: "drill-bit-of-endurance",
    name: "Drill Bit of Endurance",
    img: "drill-bit-of-endurance.webp",
    desc: "A golden drill bit that has never gone dull. It has bored through things the plant was built to keep in.",
    ada: "No wear on the edge after nine hours against tungsten. The tungsten showed a great deal. I have requested more tungsten, and a different budget line.",
  },
  {
    slug: "fusion-core",
    name: "Fusion Core",
    img: "fusion-core.webp",
    desc: "A heavy yellow power cell, still charged. It hums in your pack like it knows the way home.",
    ada: "Its output would light Threshold-4 for a decade. It came out of a plant that has not had power in living memory. Somebody down there has been keeping it charged.",
  },
  {
    slug: "glass-cannon",
    name: "Glass Cannon",
    img: "glass-cannon.webp",
    desc: "A little cannon of ice-blue crystal. It looks like it would shatter if you fired it. It looks like it wants you to.",
    ada: "The bore is clean, the fuse is dry, and the whole thing fails under four newtons of pressure. It is exactly as dangerous to its owner as to anyone else. I respect the honesty.",
  },
  {
    slug: "the-golden-pipe",
    name: "The Golden Pipe",
    img: "the-golden-pipe.webp",
    desc: "A short length of golden pipe with no rust, no seams and no bottom. Drop something in and listen.",
    ada: "I dropped a coin into it on the first day of the survey. It has not landed. Please do not put your hand in. I am still owed a glove.",
  },
  {
    slug: "the-ore-wagon",
    name: "The Ore Wagon",
    img: "the-ore-wagon.webp",
    desc: "A miner's wagon from a dig nobody remembers ordering. The wheels still turn by themselves when the pipes knock.",
    ada: "Oak and wrought iron, far older than the concrete deck it was found on. It is not heavy. It should be heavy. My surveyor carried it out in one hand, and I would like to know how.",
  },
  {
    slug: "claires-binky",
    name: "Claire's Binky",
    img: "claires-binky.webp",
    desc: "A purple binky with a blue ring, kept safe deep in the pipes. The whole plant goes quiet around it, the way a house does when a baby falls asleep.",
    ada: "The only specimen in the collection that makes a room quieter: forty decibels, instantly, in a boiler hall. Somebody wrote CLAIRE on the ring. Claire, if this is yours: it is safe with me.",
  },
  {
    slug: "cog-of-truth",
    name: "Cog of Truth",
    img: "cog-of-truth.webp",
    desc: "A brass cog from the plant's oldest machine. Say something false while you hold it and it slips a tooth.",
    ada: "I tested it against a polygraph and the polygraph lost. Every false statement, one tooth. It has never missed. Nobody on my staff will hold it in a meeting.",
  },
  {
    slug: "diaper-of-chaos",
    name: "Diaper of Chaos",
    img: "diaper-of-chaos.webp",
    desc: "One disposable diaper, spotless, found in the most dangerous room in the plant. Nobody knows who left it. Nobody wants to find out.",
    ada: "It is, on analysis, a diaper. It is also rated to hold a pressure the plant's boilers were not. I have classified it as a containment vessel and I will be taking no further questions.",
  },
  {
    slug: "the-first-pickaxe",
    name: "The First Pickaxe",
    img: "the-first-pickaxe.webp",
    desc: "The pick that broke the first ground for the plant. The iron is worn bright where hands held it.",
    ada: "Somebody dug the first hole with this, and the rest of Pipe Dreams followed it down. The handle is worn to one particular grip. I have measured every surveyor we have. None of them fit it.",
  },
  {
    slug: "water-gemstone",
    name: "Water Gemstone",
    img: "water-gemstone.webp",
    desc: "A teardrop of water that set like glass. Hold it to your ear and you can hear the pipes.",
    ada: "It is water, solid at room temperature and at every other temperature I tried. When the plant's pressure drops it weeps a single drop, which then climbs back in. I have not told the plumbing department.",
  },
];

/** THE ELECTRICAL STATION'S OWN treasure (Josh, Oct 2026): will spawn ONLY on
 *  Level 3. Claire's Bottle is the second Easter egg for Josh's daughter,
 *  after the Binky in Pipe Dreams.
 *
 *  NOT IN ALL_RELICS UNTIL LEVEL 3 SHIPS, on purpose: ALL_RELICS.length is the
 *  VIP ladder's top rung (store.vipProgress) and the Pandora harness's "every
 *  relic that exists". Counting ten relics nobody can reach would lock every
 *  player out of Tier 4 until the level is built. Join it to ALL_RELICS,
 *  pandora's LEVEL_RELICS and the service's spawner in the same commit that
 *  opens the level. */
export const STATION_RELICS: RelicDef[] = [
  {
    slug: "ancient-jade-sword",
    name: "Ancient Jade Sword",
    img: "ancient-jade-sword.webp",
    desc: "A slender jade blade on a gilded hilt, found standing upright in a switchgear cabinet. Nothing in the station will arc toward it.",
    ada: "Jade is an insulator, which explains why it carries no current. It does not explain why the current goes around it. I watched a live bus bar bend its discharge a full hand's width to avoid the tip.",
  },
  {
    slug: "broken-camera",
    name: "Broken Camera",
    img: "broken-camera.webp",
    desc: "A surveyor's camera with a shattered lens. It still takes pictures. Nobody has ever pressed the shutter.",
    ada: "The memory card holds four hundred and twelve photographs of the station, taken from the ceiling, looking down. In the last eleven there is a surveyor in Async issue. We have not lost anyone in that section. Yet.",
  },
  {
    slug: "chaos-emerald",
    name: "Chaos Emerald",
    img: "chaos-emerald.webp",
    desc: "A great green gem that hums at the same pitch as the transformers. Hold it and you feel like running.",
    ada: "It discharges a little under seven megajoules when squeezed, and nothing at all when dropped. My assistant asked whether there were six more. I have reassigned him to inventory, where he can look.",
  },
  {
    slug: "cinema-ticket",
    name: "Cinema Ticket",
    img: "cinema-ticket.webp",
    desc: "An old paper admit-one, number 742126, never torn. Whatever it was a ticket for has not started yet.",
    ada: "No cinema has ever issued that number in that stock. The paper is new. The ink is not. When the station blacks out, the ticket is the only thing in the room you can still read, and it reads: NOW SHOWING.",
  },
  {
    slug: "claires-bottle",
    name: "Claire's Bottle",
    img: "claires-bottle.webp",
    desc: "A baby's bottle, still warm, set down carefully on a breaker panel as if somebody meant to come back for it. The lights never flicker near it.",
    ada: "Thirty-seven degrees, constantly, with no power source I can find. The station holds its voltage steady for three metres around it, the only stable supply on the level. CLAIRE again, on the base. Claire, your binky is in my office. Your bottle will be too.",
  },
  {
    slug: "crystal-ball",
    name: "Crystal Ball",
    img: "crystal-ball.webp",
    desc: "A violet glass sphere on a silver claw stand. Inside it, the station's lights go out a few seconds before they really do.",
    ada: "Its lead on the blackouts is four point two seconds, every time I have measured it. I have given one to each survey team. Four point two seconds is not much warning. It is considerably more than none.",
  },
  {
    slug: "feelsbad-pepe",
    name: "Feelsbad Pepe",
    img: "feelsbad-pepe.webp",
    desc: "A small painted frog with the saddest face ever recorded. Everyone who carries it out feels a little worse, and a little more understood.",
    ada: "Morale in the room drops eleven per cent while it is present and recovers within the hour. I have run the trial three times. On the third I found I did not want it to leave. I have not filed that observation.",
  },
  {
    slug: "mystical-hippo",
    name: "Mystical Hippo",
    img: "mystical-hippo.webp",
    desc: "A bright green hippo, crude as a child's drawing and solid as stone. It turns up in a different room of the station every time you look away.",
    ada: "It weighs eighty grams, and the floor under it reads as if it weighs two tonnes. I have not caught it moving. I have stopped turning my back on it, which I recognise is not a scientific position.",
  },
  {
    slug: "rune-of-protection",
    name: "Rune of Protection",
    img: "rune-of-protection.webp",
    desc: "A brass helm of awe, eight spiked arms around a ring. Live current that touches its bearer runs off into the floor.",
    ada: "A surveyor carrying it walked through electrified water and came out with nothing worse than wet boots. I asked her to try it a second time. She declined, correctly. I have kept the rune and not the habit.",
  },
  {
    slug: "unknown-artifact",
    name: "Unknown Artifact",
    img: "unknown-artifact.webp",
    desc: "A black rectangle that will not hold still. Every camera that looks at it records only static.",
    ada: "I cannot tell you what it is made of, how big it is, or which way up it goes. Every instrument I point at it reports a fault. Then the instrument is fine, and the artifact is still there.",
  },
];

/** THE ABANDONED OFFICE'S OWN treasure (Level 4): ten relics, spawning ONLY
 *  on Level 4 — Josh's pictures, like every level's, cut out by
 *  scripts/relic-art.mjs (Oct 12 2026). The same rule as the Station's:
 *  NOT in ALL_RELICS until the level opens. */
export const OFFICE_RELICS: RelicDef[] = [
  {
    slug: "the-blank-book",
    name: "The Blank Book",
    img: "the-blank-book.webp",
    desc: "A heavy bound ledger with nothing on the cover and nothing inside. Leave it open on a desk and a page fills with somebody's handwriting.",
    ada: "I left it open overnight in a sealed room. In the morning one page held the minutes of a meeting nobody attended, dated next Tuesday. The minutes record that I was present.",
  },
  {
    slug: "claires-bouncer",
    name: "Claire's Bouncer",
    img: "claires-bouncer.webp",
    desc: "A baby bouncer with little elephants on it, rocking gently in the corner of an empty open-plan floor. It never stops rocking.",
    ada: "It rocks at sixty-two beats a minute and has done for as long as I have watched it, with nothing in it. The label on the frame says CLAIRE. Claire, your binky and your bottle are in my office. There is room for this as well.",
  },
  {
    slug: "gold-stapler",
    name: "Gold Stapler",
    img: "gold-stapler.webp",
    desc: "A stapler of solid gold, found in a locked drawer under a note that says DO NOT TAKE. It never runs out of staples.",
    ada: "It weighs four kilograms and has fired eleven thousand staples in my laboratory without being loaded. The note was in the same handwriting as the label on my own desk drawer. I have locked that drawer as well.",
  },
  {
    slug: "magic-ring",
    name: "Magic Ring",
    img: "magic-ring.webp",
    desc: "A heavy silver ring engraved with a sky of small moons. Whoever wears it is never the one the dark looks at.",
    ada: "Surveyors wearing it report that the mannequins face away from them. I have confirmed this on four recordings. On the fifth recording, the one I wore it for, every figure in the room had turned to face the camera.",
  },
  {
    slug: "printer-of-time",
    name: "Printer of Time",
    img: "printer-of-time.webp",
    desc: "An office printer that still warms up when someone walks past. What comes out of it is always dated tomorrow.",
    ada: "It has printed three hundred and six pages in my care, every one dated the following day, every one correct. I asked it for next week. It printed a blank page and then jammed, which I am choosing to read as a refusal.",
  },
  {
    slug: "rug-of-persia",
    name: "Rug of Persia",
    img: "rug-of-persia.webp",
    desc: "A hand-knotted rug laid out in the middle of a corner office, perfectly clean. Nothing that stands on it can be seen from the door.",
    ada: "A surveyor sat on it while a colleague searched the room with a torch for ten minutes. She was a metre away the whole time. The pattern does not repeat anywhere I have measured it. I have stopped trying to find the edge of it in the middle.",
  },
  {
    slug: "sacred-lollipop",
    name: "Sacred Lollipop",
    img: "sacred-lollipop.webp",
    desc: "A swirl lollipop the size of a hand, left in a reception candy dish. It has been licked, and it has never got any smaller.",
    ada: "Sugar, dye, and nothing else, and it does not dissolve. My assistant tested the last claim more thoroughly than the protocol required. He says it tastes of the first day of summer holidays. I have no reason to doubt him.",
  },
  {
    slug: "the-slime",
    name: "The Slime",
    img: "the-slime.webp",
    desc: "A glowing blob of jelly with a night sky inside it, found pooled under a water cooler. It follows the warmest person in the room.",
    ada: "It moves at about a metre an hour toward body heat and is otherwise harmless. The stars inside it match the sky over the building on the night of the last fire drill. There are no windows that show that sky.",
  },
  {
    slug: "sword-of-fate",
    name: "Sword of Fate",
    img: "sword-of-fate.webp",
    desc: "A long gold-hilted sword found buried point-down in a conference table. The writing on the blade changes depending on who reads it.",
    ada: "Every surveyor reads a different line on the blade. Mine says the date I will finish this catalogue. I have recalculated the schedule twice. The sword has not.",
  },
  {
    slug: "timeless-robe",
    name: "Timeless Robe",
    img: "timeless-robe.webp",
    desc: "A soft white bathrobe left on a coat hook outside the boardroom. Wearing it, an hour in the office feels like a minute.",
    ada: "A surveyor wore it for what her watch said was forty minutes. The station clock said four seconds. She came back rested and asked for another shift, which in this building I consider the strangest finding of all.",
  },
];

/** Each level's own ten, by level number (THE BACKROOMS LAWS, law 4: a
 *  player finds all ten of a level before any of them comes twice). */
/** THE TERROR HOTEL'S OWN treasure (Level 5), from Josh's pictures (Oct 13
 *  2026, `assets/relics/Terror Hotel/`). Claire's Crib is the fourth Easter
 *  egg for Josh's daughter, Claire (after the binky, the bottle and the
 *  bouncer); Bear's Biscuits are for Josh's dog, Bear. Like the station's and
 *  the office's they spawn and are carried but stay out of ALL_RELICS until
 *  the level opens. */
export const HOTEL_RELICS: RelicDef[] = [
  {
    slug: "bitline-drive",
    name: "BitLine Drive",
    img: "bitline-drive.webp",
    desc: "A portable drive in a scuffed metal shell, found in a suite's wall safe. Its little light blinks whenever somebody says a room number out loud.",
    ada: "It holds the folios of nine thousand guests in a hotel that has never kept a guest list. Every folio ends at check-in. I have read two hundred of them. None of them checks out.",
  },
  {
    slug: "the-boiler-blueprint",
    name: "The Boiler Blueprint",
    img: "the-boiler-blueprint.webp",
    desc: "A blueprint for a boiler larger than the hotel, pinned to the wall of a furnace room. The engineer signed it the year before he was born.",
    ada: "The machine it draws would not fit in the Boiler Room, the hotel or the county. I have measured two of the furnaces down there, and they match the drawing exactly. The building is following the plans.",
  },
  {
    slug: "the-bellboys-tips",
    name: "The Bellboy's Tips",
    img: "the-bellboys-tips.webp",
    desc: "A heap of gold coins left on a luggage trolley, each one struck with a different face. However many are taken, the heap is the same size by morning.",
    ada: "Gold, from no mint I can identify. I counted three hundred and twelve. My assistant took one home in his pocket to test the claim, and it was back on the trolley before he was.",
  },
  {
    slug: "the-eight-ball",
    name: "The Eight Ball",
    img: "the-eight-ball.webp",
    desc: "A black billiard ball found alone on a table with no pockets. Roll it any way you like and it stops with the eight facing you.",
    ada: "I rolled it eleven hundred times on four surfaces. It stopped facing me every time, including the times I left the room before it stopped. I have not found the rest of the set, and I am no longer looking.",
  },
  {
    slug: "claires-crib",
    name: "Claire's Crib",
    img: "claires-crib.webp",
    desc: "A wooden crib made up with clean sheets in a suite nobody sleeps in. The little bear on the pillow has been tucked in.",
    ada: "The sheets are warm when I find them, and the bear has moved by morning. The tag on the rail says CLAIRE. Claire, your binky, your bottle and your bouncer are with me, and now your crib. Whoever keeps making it up for you is very careful about it.",
  },
  {
    slug: "grass-clibbings",
    name: "Grass Clibbings",
    img: "grass-clibbings.webp",
    desc: "A heap of grass clibbings on the Beverly Room’s carpet, fresh and still wet with dew. There is no garden in the hotel, and no outside.",
    ada: "“Them good grass clibbings. I love Barb. Gobbles.” That is the whole of the note tucked into the heap, and after eleven readings I find I agree with every word of it. I have not found Barb. I have not found Gobbles.",
  },
  {
    slug: "bears-biscuits",
    name: "Bear's Biscuits",
    img: "bears-biscuits.webp",
    desc: "Two dog biscuits shaped like bones, left by a suite door as if somebody expected a good dog home. Something on the other side of the door wags.",
    ada: "A good brand, the kind a well-loved dog gets. Above them, BEAR is chalked on the door frame. When a surveyor holds them, something big and happy pads up and down the corridor just out of sight, and it has never once frightened anybody. Bear, these are yours. I am only minding them.",
  },
  {
    slug: "the-lift-board",
    name: "The Lift Board",
    img: "the-lift-board.webp",
    desc: "A circuit board with red traces spread like legs, pulled warm from the back of a lift panel. Hold it to your ear and you can hear the floors being counted.",
    ada: "It counts to twelve and starts again, all day, just under the noise floor of my instruments. Once, on a Tuesday, it counted thirteen. I recommend that nobody rides a lift on a Tuesday.",
  },
  {
    slug: "fallen-star",
    name: "Fallen Star",
    img: "fallen-star.webp",
    desc: "A five-pointed star the size of a hand, with a whole galaxy turning inside it. It was found on top of the great chandelier in the Beverly Room.",
    ada: "It is warm to hold and casts no shadow. Its light comes from somewhere much further away than the hotel and arrives eleven minutes late. I have timed it. It is still eleven minutes late.",
  },
  {
    slug: "the-stormglass",
    name: "The Stormglass",
    img: "the-stormglass.webp",
    desc: "A glass ball the size of an apple with a storm turning slowly inside it. The weather in it belongs to a window the hotel does not have.",
    ada: "The swirl has never stopped and never repeated. On the night the band played louder than usual, it snowed in there. I keep it on my desk, where it is the only weather I get.",
  },
];

/** LIGHTS OUT's ten (Level 6), from Josh's pictures (Oct 14 2026,
 *  `assets/relics/Lights Out/`). Claire's Blanket is the fifth Easter egg for
 *  Josh's daughter, Claire (after the binky, the bottle, the bouncer and the
 *  crib). The last five (the pills, the conch, the cassette, the match) were
 *  found online by Claude, CC0 from rawpixel; the pills are Josh's Matrix
 *  jokes — the black pill is hopelessness, the pink pill a silly willy
 *  princess. */
export const LIGHTS_RELICS: RelicDef[] = [
  {
    slug: "the-open-platter",
    name: "The Open Platter",
    img: "the-open-platter.webp",
    desc: "A hard drive with its lid off, found on a dead office desk. The platter is still spinning, in total silence.",
    ada: "No power, no motor I can find, and it has not slowed in nine days. Under a scope the surface holds one long recording of footsteps. Mine are on it, from rooms I have not walked into yet.",
  },
  {
    slug: "the-pelican-case",
    name: "The Pelican Case",
    img: "the-pelican-case.webp",
    desc: "A small black waterproof case found floating in the Wet End. It is bone dry inside, and the foam is cut for something nobody has found.",
    ada: "The cut-out in the foam is the shape of a human ear. I have checked it against my own. It fits.",
  },
  {
    slug: "the-ember-core",
    name: "The Ember Core",
    img: "the-ember-core.webp",
    desc: "A glowing orange sphere, warm as a hearth, found in the dark. Its light stops at its own surface and lights nothing around it.",
    ada: "It reads at eleven hundred degrees and does not warm my glove. It is the only light on the level and it lights nothing. I carry it anyway. In the dark, it is good to have something to look at.",
  },
  {
    slug: "the-thumb-drive",
    name: "The Thumb Drive",
    img: "the-thumb-drive.webp",
    desc: "A plain USB stick left in a cell block's lock. It holds one sound file, and the file is longer every time you look.",
    ada: "The recording is of the level, live, from somewhere I have not found. When I go quiet, it goes quiet a moment later. I have stopped going quiet.",
  },
  {
    slug: "claires-blanket",
    name: "Claire's Blanket",
    img: "claires-blanket.webp",
    desc: "A soft baby blanket with little blue and teal shapes, folded neatly on a dry shelf. It smells clean, which nothing else down here does.",
    ada: "Wherever it lies, the dark around it feels a little less dark. The tag says CLAIRE. Claire, your binky, your bottle, your bouncer and your crib are with me, and now your blanket. Somebody down here has been keeping it dry for you.",
  },
  {
    slug: "the-black-pill",
    name: "The Black Pill",
    img: "the-black-pill.webp",
    desc: "A glossy black capsule, alone in a dry drawer. Neither red nor blue. Take it and you see how things really are, and how things really are is hopeless.",
    ada: "Every subject who took it reports the same thing: they now understand exactly how things are, and it is worse than they thought. I have not taken it. I have read my own field notes, so I already know.",
  },
  {
    slug: "the-pink-pill",
    name: "The Pink Pill",
    img: "the-pink-pill.webp",
    desc: "A bright pink capsule found beside the black one. The option nobody offered: you don't wake up and you don't go back to sleep, you just get to be a silly willy princess about the whole thing.",
    ada: "One subject took it, put on a crown that was not there and walked the Wet End singing at the top of their voice. I have recorded the result as inconclusive and extremely loud.",
  },
  {
    slug: "the-conch-shell",
    name: "The Conch Shell",
    img: "the-conch-shell.webp",
    desc: "A pink conch shell, a long way from any beach. Hold it to your ear and you hear the sea.",
    ada: "Down here the sea in the shell is a second ahead of the sea behind the hatch: a wave reaches the shell before it reaches the door. I no longer know which of them is the echo.",
  },
  {
    slug: "the-cassette",
    name: "The Cassette",
    img: "the-cassette.webp",
    desc: "A C90 tape with a blank label, found in a dead office's drawer. Both sides are full.",
    ada: "Side A is ninety minutes of somebody breathing in the dark, recorded from very close. Side B is my own voice reading these notes. I have not read them aloud yet.",
  },
  {
    slug: "the-last-match",
    name: "The Last Match",
    img: "the-last-match.webp",
    desc: "One match, already struck, still burning, in a box that was otherwise empty. It never burns down.",
    ada: "It has burned for nine days on the same splinter of wood. It is a very small light, and in Lights Out a very small light is a great deal. It is the only thing down here I would call company.",
  },
];
/** THALASSOPHOBIA's ten (Level 7), found online by Claude (CC0 / public
 *  domain cut-outs — `assets/relics/Thalassophobia/sources.txt` says where
 *  each came from). Claire's Bath Duck is the sixth Easter egg for Josh's
 *  daughter, Claire (after the binky, the bottle, the bouncer, the crib and
 *  the blanket). */
export const OCEAN_RELICS: RelicDef[] = [
  {
    slug: "the-subway-token",
    name: "The Subway Token",
    img: "the-subway-token.webp",
    desc: "A gold fare token stamped with an eagle, found in a gutter on a dry roof, warm from a sun that never comes out. It is good for one ride.",
    ada: "It fits no turnstile I know of and the city on it is not on any map. It is the same weight as a key. I have stopped thinking that is a coincidence.",
  },
  {
    slug: "the-message-in-a-bottle",
    name: "The Message in a Bottle",
    img: "the-message-in-a-bottle.webp",
    desc: "A green glass bottle bobbing against a roof edge, a rolled note inside. The note is dry, and it is addressed to whoever is holding it.",
    ada: "It says: \"don't swim back the way you came.\" The handwriting is mine. The paper is older than I am.",
  },
  {
    slug: "the-ships-bell",
    name: "The Ship's Bell",
    img: "the-ships-bell.webp",
    desc: "A small brass bell hung from a railing on a sunk roof. It rings on its own when something large passes underneath.",
    ada: "It rang twice while I held it and the water stayed flat both times. The surveyors have started carrying it out to the edge of the city like a smoke alarm. It works.",
  },
  {
    slug: "the-divers-watch",
    name: "The Diver's Watch",
    img: "the-divers-watch.webp",
    desc: "A heavy wrist watch found on a ledge underwater. The hands go round once a minute, exactly the length of one breath in the helmet.",
    ada: "It does not tell the time. It tells you how long you have been down. Every diver who has worn it came back up. I would like that to stay true.",
  },
  {
    slug: "the-lifebuoy",
    name: "The Lifebuoy",
    img: "the-lifebuoy.webp",
    desc: "A red and white life ring, faded almost pink, found floating in the open water past the last roof. Something has taken a bite out of the rope.",
    ada: "The bite is a single curve nine metres across. The ring itself is untouched. I keep it in the tower, by the hatch, in case anybody ever needs it. Nobody has thrown it yet.",
  },
  {
    slug: "the-storm-lantern",
    name: "The Storm Lantern",
    img: "the-storm-lantern.webp",
    desc: "A red hurricane lantern hung from a railing on a roof at the edge of the Drop. It has no fuel in it and it is lit.",
    ada: "It burns brighter the further out you carry it. At the last roof before the Drop it is almost too bright to look at. I think it is a warning. I think it is also an invitation, and I would rather it chose one.",
  },
  {
    slug: "the-captains-spyglass",
    name: "The Captain's Spyglass",
    img: "the-captains-spyglass.webp",
    desc: "A brass and leather spyglass found on the tower's highest ledge. Through it the fog is gone and the city stands dry.",
    ada: "Through it I can see people in the dry streets. Through it, one of them has started looking back. I have put it in a drawer.",
  },
  {
    slug: "the-red-scallop",
    name: "The Red Scallop",
    img: "the-red-scallop.webp",
    desc: "A big scallop shell, red and cream, lying on the bottom of the sunken square. Held to the ear it does not sound like the sea. It sounds like breathing.",
    ada: "Slow, very large breathing, nine breaths a minute. The divers who have listened to it all say the same thing afterwards: it was asleep. Let us keep it that way.",
  },
  {
    slug: "the-brass-compass",
    name: "The Brass Compass",
    img: "the-brass-compass.webp",
    desc: "A sailor's pocket compass, its glass beaded with water inside. The needle does not point north. It points down.",
    ada: "Down, everywhere I have tried it, except on the stair in the square, where it spins. I take that as a recommendation.",
  },
  {
    slug: "claires-bath-duck",
    name: "Claire's Bath Duck",
    img: "claires-bath-duck.webp",
    desc: "A yellow rubber duck floating in a calm patch of water between the roofs. The water is warm all around it, like a bath someone just ran.",
    ada: "The only thing on this level the deep has never touched. It floats right over the Drop and nothing rises. CLAIRE, on the bottom, in marker. Claire, your binky, your bottle, your bouncer, your crib and your blanket are with me, and now your duck. It swims better than any of us.",
  },
];
/** THE CAVE SYSTEM (Level 8). */
export const CAVE_RELICS: RelicDef[] = [
  {
    slug: "the-toy-subway-car",
    name: "The Toy Subway Car",
    img: "the-toy-subway-car.webp",
    desc: "A child's toy train, three cars long, sitting on the edge of a platform as if it was waiting for the real one. Its wheels still turn.",
    ada: "Same livery as the dead train on the platform, down to the stripe. Nobody makes a toy of a line that does not exist. Somebody up there knew this line well enough to buy one.",
  },
  {
    slug: "the-last-ticket",
    name: "The Last Ticket",
    img: "the-last-ticket.webp",
    desc: "A yellow admission ticket, held out in a hand that ends at the cuff. Nobody is attached to it. It is still warm.",
    ada: "Admit one. The date is next Saturday, whichever Saturday you read it on. I have stopped asking where the rest of the passenger went. I would like the hand to stop offering it to me.",
  },
  {
    slug: "the-conductors-whistle",
    name: "The Conductor's Whistle",
    img: "the-conductors-whistle.webp",
    desc: "A brass guard's whistle on the platform, dented, still with the pea inside. Blow it and the tunnel answers.",
    ada: "Do not blow it in the Deep. I am putting that first because the surveyor who found it did, and what answered was not the tunnel. The echo comes back a beat late. Echoes don't.",
  },
  {
    slug: "the-fossil-fish",
    name: "The Fossil Fish",
    img: "the-fossil-fish.webp",
    desc: "A fish pressed into a slab of limestone, every scale and spine clear, its mouth open. It came out of the river wall.",
    ada: "Four hundred million years old by every test we have, and blind. No eyes ever formed in the skull. Whatever this cave grows, it has been growing it without light for a very long time.",
  },
  {
    slug: "the-geologists-hammer",
    name: "The Geologist's Hammer",
    img: "the-geologists-hammer.webp",
    desc: "A survey hammer, the handle worn smooth, the head chipped from a thousand samples. Its owner's initials are scratched off.",
    ada: "It belonged to one of mine. The rock samples in its bag were all tapped twice, the way we were taught, and then a third time, harder. I think they were knocking on something.",
  },
  {
    slug: "the-candlestick",
    name: "The Candlestick",
    img: "the-candlestick.webp",
    desc: "A tall brass candlestick wound round with old rope, the candle burned to a stub and the flame still lit. Nobody lit it.",
    ada: "Cavers carry a candle because a flame goes out when the air goes bad. This one has been burning since before we came down. The air is fine. I don't know what it is measuring.",
  },
  {
    slug: "the-surveyors-watch",
    name: "The Surveyor's Watch",
    img: "the-surveyors-watch.webp",
    desc: "A gold pocket watch on its chain, stopped at five to seven, lying open at the foot of a crawlspace.",
    ada: "Async issue, serial filed off. It stopped at 6:55, the time the last team logged going into the Squeeze. Wind it and it runs. It runs backwards, and only while you are down here.",
  },
  {
    slug: "the-blue-crystals",
    name: "The Blue Crystals",
    img: "the-blue-crystals.webp",
    desc: "A cluster of blue crystals on a stub of rock, bright as glass, lit from inside. They hum, very faintly, when the clicking starts.",
    ada: "Not a mineral I can name, and I have tried them all. Hold them while it hunts and they get warmer the nearer it is. I have recommended them as a field instrument. Nobody wants to carry them.",
  },
  {
    slug: "the-lump-of-ore",
    name: "The Lump of Ore",
    img: "the-lump-of-ore.webp",
    desc: "A heavy lump of dark ore studded with crystals, prised out of a cavern wall. Something has scratched it, long and thin, all over.",
    ada: "Silver-bearing, a good grade. The Foundry would want it. The scratches are tooth marks, and the teeth went through the rock to get to it. I have not told the Foundry where it came from.",
  },
  {
    slug: "claires-night-light",
    name: "Claire's Night Light",
    img: "claires-night-light.webp",
    desc: "A yellow crescent moon with a sleeping face, glowing softly on a ledge in the dark. Nothing in the caves comes near its light.",
    ada: "The one light down here the dark leaves alone. Even the clicking goes quiet around it. CLAIRE, on the back, in marker. Claire, your binky, your bottle, your bouncer, your crib, your blanket and your duck are with me, and now your moon. Sleep tight. The dark is mine to watch.",
  },
];
/** THE SUBURBS' OWN treasure (Level 9, Oct 2026). Claire's Rattle is the
 *  eighth Easter egg for Josh's daughter, Claire (after the binky, the bottle,
 *  the bouncer, the crib, the blanket, the bath duck and the night light).
 *  Names, descriptions and Voss's lines are written; the art is drawn
 *  (scripts/relic-art-suburbs/) until Josh sends pictures. */
export const SUBURB_RELICS: RelicDef[] = [
  {
    slug: "the-porch-light-bulb",
    name: "The Porch Light Bulb",
    img: "the-porch-light-bulb.webp",
    desc: "An old screw-in bulb, warm yellow, glowing in your hand with no socket and no wire. Moths come from nowhere to circle it.",
    ada: "Sixty watts by the stamp, and it has not dimmed since we picked it up. The Watch will not stand in its light any more than in a streetlight's. I have asked the team to carry it in turns and to argue about it less.",
  },
  {
    slug: "the-garden-gnome",
    name: "The Garden Gnome",
    img: "the-garden-gnome.webp",
    desc: "A chipped clay gnome with a red hat and a fishing rod, taken from somebody's front lawn. It is never quite facing the way you left it.",
    ada: "It turns. Not while observed, and never far: a few degrees, always towards the nearest street. I have stopped recording which way it faces and started recording which way the Watch was walking at the time. They agree.",
  },
  {
    slug: "the-mornings-paper",
    name: "The Morning's Paper",
    img: "the-mornings-paper.webp",
    desc: "A rolled newspaper in a rubber band, left on a doorstep. It is always today's, whichever day you unroll it.",
    ada: "The date updates on unrolling. The headlines are local and about nothing: a lost cat, a bake sale, a road closure. The road closure is on a street we have walked. It is closed now.",
  },
  {
    slug: "the-welcome-mat",
    name: "The Welcome Mat",
    img: "the-welcome-mat.webp",
    desc: "A coir doormat that says WELCOME, worn thin in the middle by a lot of feet going in. There are no marks of feet going out.",
    ada: "Lifted from a front step on the fourth street, though every step has one. Under it, where people leave a spare key, someone had written in chalk: NOT THIS ONE. I have taken them at their word.",
  },
  {
    slug: "the-lawn-flamingo",
    name: "The Lawn Flamingo",
    img: "the-lawn-flamingo.webp",
    desc: "A pink plastic flamingo on two wire legs, pulled out of a front lawn. The legs are wet with dew that never dries.",
    ada: "The only bright colour we have found up here. The surveyor who carried it back says she felt watched the whole way and kept to the lights. That is procedure, so I cannot tell whether the flamingo had anything to do with it.",
  },
  {
    slug: "the-watch-sticker",
    name: "The Watch Sticker",
    img: "the-watch-sticker.webp",
    desc: "A NEIGHBORHOOD WATCH sticker peeled off a front window, an eye inside a house. The eye has been scratched out from behind, from inside the glass.",
    ada: "Every house carries one in the front window. This is the only one we have found with the eye removed, and it was removed from the inside. I have no theory I am prepared to write down.",
  },
  {
    slug: "the-sprinkler-head",
    name: "The Sprinkler Head",
    img: "the-sprinkler-head.webp",
    desc: "A brass lawn sprinkler, the kind that ticks round in a circle. It still turns, slowly, and it is always slightly damp.",
    ada: "The sprinkler the team heard from the foot of the Chimney, or one exactly like it. It ticks round once every forty seconds with no water supply. The count is very regular. I have started using it to time things.",
  },
  {
    slug: "the-mailbox-flag",
    name: "The Mailbox Flag",
    img: "the-mailbox-flag.webp",
    desc: "The little red flag off a roadside mailbox, snapped from its pivot and stuck in the up position: there is mail to collect.",
    ada: "The mailbox it came from contained one envelope, addressed to the house, stamped and never franked. We did not open it. Nobody up here gets mail, and I would rather not find out who was sending it.",
  },
  {
    slug: "the-tv-remote",
    name: "The TV Remote",
    img: "the-tv-remote.webp",
    desc: "A chunky television remote, the buttons rubbed blank with use. Point it at a dark window and something behind the glass changes channel.",
    ada: "It works on every set in the neighbourhood, including the ones that are unplugged. Pressed at a dark street, it does nothing. I am grateful for that, and I have asked that nobody presses the red button again.",
  },
  {
    slug: "claires-rattle",
    name: "Claire's Rattle",
    img: "claires-rattle.webp",
    desc: "A baby's rattle on a nursery windowsill, where the streetlight just touches it. It gives one soft shake as you come in, as if somebody small had just woken up.",
    ada: "Every house up here is silent, and this is the one sound in the whole street that does not frighten anybody. Even the whistling stops for it. CLAIRE, on the handle, in marker. Claire, your binky, your bottle, your bouncer, your crib, your blanket, your duck and your night light are with me, and now your rattle. You came all the way up. So did we.",
  },
];
/** The Suburbs relics that SPAWN: all ten since Nov 2026 (Josh: "ensure every
 *  level has obtainable relics. if they dont, just put them in"). The art is
 *  drawn (scripts/relic-art-suburbs/) until Josh sends pictures. This is also
 *  the day the Rusted Key can be completed; Pandora's regime choices were wired
 *  first (Oct 31 2026). */
export const SUBURB_RELICS_LIVE: RelicDef[] = SUBURB_RELICS;
export const LEVEL_RELIC_SETS: RelicDef[][] = [RELICS, POOL_RELICS, PIPE_RELICS, STATION_RELICS, OFFICE_RELICS, HOTEL_RELICS, LIGHTS_RELICS, OCEAN_RELICS, CAVE_RELICS, SUBURB_RELICS];
export const levelRelics = (level: number): RelicDef[] => LEVEL_RELIC_SETS[level] ?? [];
/** Which level a relic belongs to (-1 = none). */
export const relicLevel = (slug: string): number => LEVEL_RELIC_SETS.findIndex((set) => set.some((r) => r.slug === slug));

/** The relics the VIP ladder counts (Nov 2026 validation run): Levels 0-2
 *  always, and a later level's set once its ship gate is open to members
 *  (`open(level)`). Counting only Levels 0-2 left sixty relics members could
 *  pick up out of the bar; counting a level members can't enter would hold
 *  everybody out of Tier 4. The rank is a high-water mark, so a gate opening
 *  raises the top rung for whoever is still climbing and takes nothing away. */
export const countedRelics = (open: (level: number) => boolean): RelicDef[] =>
  LEVEL_RELIC_SETS.flatMap((set, level) => (level <= 2 || open(level) ? set : []));

/** Every relic, every level. */
export const ALL_RELICS: RelicDef[] = [...RELICS, ...POOL_RELICS, ...PIPE_RELICS];

// The station's and the office's relics are found by name too (a test run, the operator's
// overlay) before they join ALL_RELICS — names only, nothing counts them.
export const relicBySlug = (slug: string): RelicDef | undefined => ALL_RELICS.find((r) => r.slug === slug) ?? STATION_RELICS.find((r) => r.slug === slug) ?? OFFICE_RELICS.find((r) => r.slug === slug) ?? HOTEL_RELICS.find((r) => r.slug === slug) ?? LIGHTS_RELICS.find((r) => r.slug === slug) ?? OCEAN_RELICS.find((r) => r.slug === slug) ?? CAVE_RELICS.find((r) => r.slug === slug) ?? SUBURB_RELICS.find((r) => r.slug === slug);
