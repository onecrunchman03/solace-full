// Sterling's Emporium — the boutique half of the Trader counter. Everything
// here is COSMETIC progression (themes, borders, name flair, tombstones,
// titles) plus the pre-existing wheel-spin utility; nothing mints coins or
// emoji, so the economy stays sealed (buying burns silver — a pure sink).
//
// Prices: each item carries a DEFAULT price; admins can override any price at
// runtime (item_prices table) without a deploy. The effective price is
// override ?? default.

// ("chime" and "bubble" retired outright with migration 48 — the union
// matches what the catalog can actually contain.)
export type ItemKind =
  | "theme" | "border" | "flair" | "tombstone" | "title"
  | "banner" | "cardback" | "dice" | "epitaph"
  // A hazmat colorway (THE VIP ROOM, Sep 2026). Not an equip slot — a suit
  // is WORN through the backrooms locker, so owning the item issues the
  // locker row (store.ensureVipSuits) and every world's suit check trusts it.
  | "suit";

export interface EmporiumItem {
  id: string;
  kind: ItemKind;
  name: string;
  blurb: string;
  /** Default price in silver; admin overrides live in item_prices. */
  price: number;
  /** ACHIEVEMENT-ONLY: never stocked, never buyable — granted by the badge
   *  engine (src/achievements.ts). Owners equip it like anything else. */
  award?: true;
  /** THE VIP ROOM (src/vip.ts): sold only behind the rope, to a rank at or
   *  above this tier. Never on the rotating shelf, absent from /api/emporium. */
  vip?: number;
}

// Wave 1 of the purchasable themes (full app themes — token blocks live in
// client app.css keyed by the id's suffix). Later waves append here; ship
// 4-5 at a time so each palette gets real design attention. (Decision: themes
// arrive in waves, all five kinds sold, prices admin-tunable.)
export const CATALOG: EmporiumItem[] = [
  // ---- Themes (wave 1) ----
  { id: "theme-vaporwave", kind: "theme", name: "Vaporwave", price: 1200,
    blurb: "Sunset neon over a chrome horizon. The mall never closed." },
  { id: "theme-cyberpunk", kind: "theme", name: "Cyberpunk", price: 1500,
    blurb: "Rain-slick black, one neon sign still buzzing." },
  { id: "theme-darkacademia", kind: "theme", name: "Dark Academia", price: 1000,
    blurb: "Oxblood, parchment, and candle smoke in the stacks." },
  { id: "theme-frutiger", kind: "theme", name: "Frutiger Aero", price: 900,
    blurb: "Glossy aqua and dewdrop green — the optimistic internet." },
  // (Kidcore was retired — migration 27 refunded every owner in full.)

  // ---- Themes (wave 2) ----
  { id: "theme-y2k", kind: "theme", name: "Y2K Futurism", price: 1000,
    blurb: "Chrome, bubble plastic, and a future that never crashed." },
  { id: "theme-cassette", kind: "theme", name: "Cassette Futurism", price: 1100,
    blurb: "Beige panels, amber readouts, one sturdy orange stripe." },
  { id: "theme-backrooms", kind: "theme", name: "Liminal Backrooms", price: 1600,
    blurb: "Damp yellow wallpaper. The hum never stops. You've been here before." },
  { id: "theme-tactical", kind: "theme", name: "Tactical HUD", price: 1400,
    blurb: "Phosphor green on black. Everything is a target reticle." },
  { id: "theme-acid", kind: "theme", name: "Acid Wave", price: 1300,
    blurb: "Blacklight purple and toxic green. Bring earplugs." },

  // ---- Themes (wave 3) ----
  { id: "theme-utopian", kind: "theme", name: "Utopian Scholastic", price: 1200,
    blurb: "Encarta skies and marble futures — learning was going to save us." },
  { id: "theme-atompunk", kind: "theme", name: "Atompunk", price: 1400,
    blurb: "Starbursts, orbits, and the friendly atom. The future of 1958." },
  { id: "theme-destijl", kind: "theme", name: "De Stijl", price: 1000,
    blurb: "Straight lines, primary colors, zero apologies. Mondrian's house rules." },
  { id: "theme-tuscan", kind: "theme", name: "Tuscan", price: 1100,
    blurb: "Terracotta, olive groves, cypress at dusk. The villa dream." },

  // ---- Profile borders (avatar rings, visible everywhere) ----
  { id: "border-ember", kind: "border", name: "Ember Ring", price: 350,
    blurb: "A slow-breathing ring of foundry fire." },
  { id: "border-neon", kind: "border", name: "Neon Halo", price: 500,
    blurb: "Pink-cyan glow, straight off the strip." },
  { id: "border-carved", kind: "border", name: "Carved Oak", price: 250,
    blurb: "Warm wood, hand-cut. Matches the talisman." },
  { id: "border-bloodmoon", kind: "border", name: "Blood Moon", price: 550,
    blurb: "A dark red eclipse. The graveyard approves." },
  { id: "border-circuit", kind: "border", name: "Printed Circuit", price: 450,
    blurb: "Dashed teal traces — Sterling's cousin wears one." },
  { id: "border-void", kind: "border", name: "The Void", price: 600,
    blurb: "A ring of nothing. It looks back." },
  { id: "border-halo", kind: "border", name: "Saint's Halo", price: 500,
    blurb: "Soft white light. Utterly undeserved." },
  { id: "border-midnight", kind: "border", name: "Midnight Ring", price: 400,
    blurb: "Deep navy, thin silver seam. Quietly expensive." },
  { id: "border-checker", kind: "border", name: "Pit Lane", price: 350,
    blurb: "Checkered flag around your face. You did NOT win anything." },
  { id: "border-ivy", kind: "border", name: "Living Ivy", price: 450,
    blurb: "Green tendrils, slowly claiming you. Like the graveyard, but alive." },
  { id: "border-storm", kind: "border", name: "Stormglass", price: 500,
    blurb: "Slate ring with a flicker of far-off lightning." },

  // ---- Name flair (display-name styling in chat + roster) ----
  { id: "flair-neon", kind: "flair", name: "Neon Name", price: 650,
    blurb: "Your name, but it hums at night." },
  { id: "flair-ember", kind: "flair", name: "Emberglow Name", price: 400,
    blurb: "A warm glow, like the last coal in the forge." },
  { id: "flair-frost", kind: "flair", name: "Frostbitten Name", price: 450,
    blurb: "Your name, breathing cold. Mind the shiver." },
  { id: "flair-toxic", kind: "flair", name: "Toxic Name", price: 500,
    blurb: "Radioactive green. Handle with tongs." },
  { id: "flair-royal", kind: "flair", name: "Royal Name", price: 550,
    blurb: "Purple and gold — as worn by people who never queue." },
  { id: "flair-shadow", kind: "flair", name: "Shadowed Name", price: 400,
    blurb: "A name half-swallowed by the dark. Very mysterious." },
  { id: "flair-vapor", kind: "flair", name: "Vapor Name", price: 550,
    blurb: "Pink into cyan, like the mall at closing time." },

  // ---- Tombstone upgrades (shown in the Graveyard — plan ahead) ----
  { id: "tomb-marble", kind: "tombstone", name: "Marble Monument", price: 800,
    blurb: "Pale marble with gold veining. Die pretty." },
  { id: "tomb-obsidian", kind: "tombstone", name: "Obsidian Slab", price: 1000,
    blurb: "Black glass that drinks the moonlight." },
  { id: "tomb-mausoleum", kind: "tombstone", name: "Mausoleum", price: 1500,
    blurb: "A whole little building. The neighbors will seethe." },
  { id: "tomb-cracked", kind: "tombstone", name: "Cracked Slab", price: 300,
    blurb: "Pre-weathered, budget-friendly, full of character." },
  { id: "tomb-gilded", kind: "tombstone", name: "Gilded Tomb", price: 1200,
    blurb: "Black stone, gold veins. Death, but make it money." },
  { id: "tomb-monolith", kind: "tombstone", name: "The Monolith", price: 2000,
    blurb: "Tall, black, silent. The apes will figure it out." },
  { id: "tomb-iron", kind: "tombstone", name: "Riveted Iron", price: 900,
    blurb: "Boilerplate and bolts. Rust is a feature." },
  { id: "tomb-moss", kind: "tombstone", name: "Overgrown Stone", price: 600,
    blurb: "The forest is already taking it back." },
  { id: "tomb-crystal", kind: "tombstone", name: "Amethyst Bloom", price: 1100,
    blurb: "Purple crystal, grown not carved. Hums faintly at night." },
  { id: "tomb-rune", kind: "tombstone", name: "Runestone", price: 800,
    blurb: "Old marks in older stone. Nobody left can read them." },
  { id: "tomb-neon", kind: "tombstone", name: "Neon Memorial", price: 1300,
    blurb: "A dark slab with a pink glow. The casino never forgets its own." },

  // ---- Profile banners (the backdrop behind your profile header) ----
  { id: "banner-sunset", kind: "banner", name: "Sunset Strip", price: 500,
    blurb: "Neon dusk over the boulevard. Your face, headlining." },
  { id: "banner-deepsea", kind: "banner", name: "Deep Sea", price: 500,
    blurb: "Abyssal blues and one curious shaft of light." },
  { id: "banner-foundry", kind: "banner", name: "Foundry Sparks", price: 600,
    blurb: "Molten orange on black — the mint at full pour." },
  { id: "banner-starfield", kind: "banner", name: "Starfield", price: 550,
    blurb: "Cold, quiet, infinite. Very slimming." },
  { id: "banner-bloodmoon", kind: "banner", name: "Blood Moon Rise", price: 650,
    blurb: "The graveyard's sky, borrowed for your profile." },
  { id: "banner-vapor", kind: "banner", name: "Gridline Sunset", price: 600,
    blurb: "A neon sun setting over the wireframe." },
  { id: "banner-meadow", kind: "banner", name: "Quiet Meadow", price: 450,
    blurb: "Green hills, gold hour. Suspiciously peaceful." },
  { id: "banner-aurorasky", kind: "banner", name: "Aurora Sky", price: 700,
    blurb: "The northern lights, pinned above your name." },
  { id: "banner-voidscape", kind: "banner", name: "The Voidscape", price: 650,
    blurb: "Deep purple nothing. Matches the ring." },
  { id: "banner-neoncity", kind: "banner", name: "Neon District", price: 600,
    blurb: "Rain-lit towers, signage still buzzing. Your name in lights." },
  { id: "banner-dune", kind: "banner", name: "Dune Dusk", price: 500,
    blurb: "Rolling sand and a low amber sun. Bring water." },
  { id: "banner-storm", kind: "banner", name: "Thunderhead", price: 550,
    blurb: "A bruised sky with lightning in it. Sets a tone." },
  { id: "banner-casino", kind: "banner", name: "The Casino Floor", price: 650,
    blurb: "Green felt and gold bokeh. Home turf." },

  // ---- Blackjack card backs (the face-down cards at your table) ----
  { id: "cardback-crimson", kind: "cardback", name: "Crimson Weave", price: 300,
    blurb: "Casino classic — red lattice, gold trim." },
  { id: "cardback-void", kind: "cardback", name: "Void Black", price: 400,
    blurb: "Matte black cards that drink the light." },
  { id: "cardback-royal", kind: "cardback", name: "Royal Purple", price: 350,
    blurb: "Velvet purple with a silver crest." },
  { id: "cardback-emerald", kind: "cardback", name: "Emerald Felt", price: 350,
    blurb: "The table's own green, stitched into the deck." },
  { id: "cardback-bone", kind: "cardback", name: "Bone White", price: 400,
    blurb: "Pale as the Pit. The dealer hates them." },
  { id: "cardback-miami", kind: "cardback", name: "Miami Deco", price: 400,
    blurb: "Pink and cyan, straight off the strip at dusk." },
  { id: "cardback-serpent", kind: "cardback", name: "Serpent Scale", price: 450,
    blurb: "Green scales. The deck sheds once a season." },
  { id: "cardback-star", kind: "cardback", name: "Night Sky", price: 350,
    blurb: "Navy backs scattered with small stars. Wish on your hole card." },

  // ---- Bone Pit dice skins (your cup, and your dice in every reveal) ----
  { id: "dice-obsidian", kind: "dice", name: "Obsidian Dice", price: 350,
    blurb: "Black glass pips. Cold to the touch." },
  { id: "dice-jade", kind: "dice", name: "Jade Dice", price: 350,
    blurb: "Carved luck, straight from the old country." },
  { id: "dice-blood", kind: "dice", name: "Blood Bone Dice", price: 400,
    blurb: "Ask no questions about the material." },
  { id: "dice-rose", kind: "dice", name: "Rose Quartz Dice", price: 400,
    blurb: "Soft pink glow. Merciless anyway." },
  { id: "dice-void", kind: "dice", name: "Void Dice", price: 450,
    blurb: "Purple-black. The pips stare back." },
  { id: "dice-ember", kind: "dice", name: "Ember Dice", price: 400,
    blurb: "Still warm from the forge. Never quite cool down." },
  { id: "dice-glacier", kind: "dice", name: "Glacier Dice", price: 400,
    blurb: "Ancient ice. The bids inside are frozen too." },
  { id: "dice-toxic", kind: "dice", name: "Toxic Dice", price: 450,
    blurb: "Radioactive green. Licensed for table use. Barely." },

  // ---- Animated name flair (the premium tier) ----
  { id: "flair-molten", kind: "flair", name: "Molten Name", price: 900,
    blurb: "Your name, poured straight from the crucible. It never sets." },
  { id: "flair-glitch", kind: "flair", name: "Glitch Name", price: 850,
    blurb: "Y̸o̷u̶r̵ ̶n̸a̷m̵e̶, but wrong in a cool way." },
  { id: "flair-starlit", kind: "flair", name: "Starlit Name", price: 800,
    blurb: "A shimmer passes through now and then. Wishes not included." },
  { id: "flair-blood", kind: "flair", name: "Bloodied Name", price: 500,
    blurb: "Dark red with a slow drip. The graveyard's favorite." },
  { id: "flair-static", kind: "flair", name: "Static Name", price: 750,
    blurb: "Tuned between stations. Occasionally cuts out." },

  // ---- Epitaph scripts (the engraving on your tombstone) ----
  { id: "epitaph-copperplate", kind: "epitaph", name: "Copperplate Hand", price: 250,
    blurb: "Flowing script, cut by a steady dead hand." },
  { id: "epitaph-gothic", kind: "epitaph", name: "Old Gothic", price: 300,
    blurb: "Heavy blackletter. Reads like a warning." },
  { id: "epitaph-typewriter", kind: "epitaph", name: "Typewriter", price: 200,
    blurb: "Cause of death: filed in triplicate." },
  { id: "epitaph-console", kind: "epitaph", name: "Terminal Green", price: 250,
    blurb: "PROCESS TERMINATED. Core dumped to the beyond." },
  { id: "epitaph-smallcaps", kind: "epitaph", name: "Engraved Caps", price: 250,
    blurb: "STATELY SMALL CAPITALS, CUT DEEP AND FOREVER." },
  { id: "epitaph-elegant", kind: "epitaph", name: "Fine Serif", price: 300,
    blurb: "Thin, tall letters. Death, typeset properly." },
  { id: "epitaph-brush", kind: "epitaph", name: "Brushed Farewell", price: 250,
    blurb: "One flowing stroke. Signed off, literally." },
  { id: "epitaph-scrawl", kind: "epitaph", name: "Final Scrawl", price: 200,
    blurb: "Written in a hurry. Understandable, given the circumstances." },
  { id: "epitaph-block", kind: "epitaph", name: "Blockletter", price: 250,
    blurb: "BIG. HEAVY. FINAL." },

  // ---- Titles (a line under your name on profile + roster) ----
  { id: "title-highroller", kind: "title", name: "High Roller", price: 300,
    blurb: "For those on first-name terms with the dealer." },
  { id: "title-gravekeeper", kind: "title", name: "Gravekeeper", price: 200,
    blurb: "Tends the stones. Knows all the epitaphs." },
  { id: "title-mint", kind: "title", name: "Mint Condition", price: 250,
    blurb: "Never scuffed, never folded." },
  { id: "title-luckycharm", kind: "title", name: "Lucky Charm", price: 150,
    blurb: "Statistically insignificant. Spiritually essential." },
  { id: "title-grandmaster", kind: "title", name: "Grandmaster", price: 350,
    blurb: "Earned on the sixty-four squares. Or bought here. Same thing." },
  { id: "title-deathdodger", kind: "title", name: "Death-Dodger", price: 250,
    blurb: "Walked away from the reaper. Once. Loudly." },
  { id: "title-tycoon", kind: "title", name: "Silver Tycoon", price: 400,
    blurb: "Owns the mint's ear and most of its output." },
  { id: "title-jester", kind: "title", name: "Court Jester", price: 150,
    blurb: "Paid to be laughed at. Finally, recognition." },
  // ---- THE DE-CLASH (Josh, Sep 2026: "nothing in the emporium looks like
  // tier rewards … replace the emporium item with something else but keep it
  // interesting"). Twelve gold / silver / copper / rainbow lookalikes were
  // retired with refunds (migration 94); these took their slots. ----
  { id: "border-thorns", kind: "border", name: "Crown of Thorns", price: 450,
    blurb: "A bramble of dark thorns round the face, a bead of red where one caught." },
  { id: "border-sonar", kind: "border", name: "Sonar", price: 500,
    blurb: "A green ring that pings — one pulse out, every few seconds, like something is looking for you." },
  { id: "border-inkwell", kind: "border", name: "Inkwell", price: 400,
    blurb: "Blue-black ink with a violet bleed at the edge. Signed, sealed." },
  { id: "border-frostbite", kind: "border", name: "Frostbite", price: 450,
    blurb: "Pale ice with a white breath of frost. Cold to look at." },
  { id: "border-static", kind: "border", name: "Static Ring", price: 550,
    blurb: "Grey signal that cuts out for a frame now and then. Bad reception, on purpose." },
  { id: "flair-jade", kind: "flair", name: "Jade Name", price: 500,
    blurb: "Cut jade, light in the veins. Cool, green, expensive-looking without being gold." },
  { id: "flair-inkwell", kind: "flair", name: "Inkwell Name", price: 450,
    blurb: "Fountain-pen blue-black that bleeds violet at the tail." },
  { id: "flair-ashen", kind: "flair", name: "Ashen Name", price: 400,
    blurb: "Warm grey with embers still in it. Something burned here." },
  { id: "flair-coral", kind: "flair", name: "Coral Name", price: 500,
    blurb: "Reef coral — pink into orange, with the sea's light on it." },
  { id: "dice-bone", kind: "dice", name: "Bone Dice", price: 400,
    blurb: "Ivory dice, yellowed at the corners. Nobody asks whose." },
  { id: "dice-cobalt", kind: "dice", name: "Cobalt Dice", price: 400,
    blurb: "Deep cobalt glass with a cold blue light in the pips." },
  { id: "cardback-oak", kind: "cardback", name: "Weathered Oak", price: 400,
    blurb: "Old oak grain, the crest branded into it. Smells of the Foundry's floor." },
  // ---- ACHIEVEMENT REWARDS (award-only — earned, never sold) ----
  { id: "title-thearchive", kind: "title", name: "Keeper of the Archive", price: 0, award: true,
    blurb: "Seven hundred emoji answer to this name. Earned, never sold." },
  { id: "title-dynast", kind: "title", name: "Dynast", price: 0, award: true,
    blurb: "Three crowns from the Bone Pit. A bloodline of liars." },
  // PANDORA'S BOX (Sep 2026, PANDORA.md): issued to every opener at the
  // opening, never sold. The colorway "pandoran" (client suitcolor.ts).
  { id: "suit-pandoran", kind: "suit", name: "The Pandoran", price: 0, award: true,
    blurb: "An obsidian hazmat that reads as depth — a star field drifting inside it, gold meander on the seams, three keyholes on the chest, light leaking from every join. Issued only at the box." },
  { id: "border-midas", kind: "border", name: "Midas", price: 0, award: true,
    blurb: "A million silver through these hands. Some of it stuck." },

  { id: "title-archivist", kind: "title", name: "The Archivist", price: 200,
    blurb: "Remembers every trade, every spin, every grudge." },
  { id: "title-pitboss", kind: "title", name: "Pit Boss", price: 350,
    blurb: "Runs the dice. Reads the lies. Keeps the crown." },
  { id: "title-unkillable", kind: "title", name: "The Unkillable", price: 400,
    blurb: "The Wheel keeps trying. The Wheel keeps failing." },
  { id: "title-loanshark", kind: "title", name: "Loan Shark", price: 300,
    blurb: "Friendly rates. Unfriendly reminders." },
  { id: "title-oracle", kind: "title", name: "The Oracle", price: 250,
    blurb: "Answers the house's questions before the house finishes asking." },
  { id: "title-cardcounter", kind: "title", name: "Card Counter", price: 300,
    blurb: "Structurally impossible here. And yet the title sells." },
  { id: "title-honestliar", kind: "title", name: "Honest Liar", price: 250,
    blurb: "Every bid a lie, every lie declared. The Pit's highest virtue." },
  { id: "title-heir", kind: "title", name: "The Heir", price: 200,
    blurb: "Named in a suspicious number of wills." },

  // ---- THE VIP ROOM (Josh, Sep 2026) — behind the rope, by rank ----------
  // Tier 1, the COPPER tier: every common in the catalog. Copper is
  // Sterling's own metal and the base of the Foundry's ladder.
  { id: "suit-vip1-copper", kind: "suit", name: "Foundry Copper", price: 1500, vip: 1,
    blurb: "A burnished copper hazmat with the seams gone dark. Worn in the Backrooms, on the floor, and behind the escape room's door." },
  { id: "title-vip1-collector", kind: "title", name: "Collector", price: 500, vip: 1,
    blurb: "Every common in the book. The house marks the name for it." },
  { id: "cardback-vip1-copper", kind: "cardback", name: "The Copper Deck", price: 1000, vip: 1,
    blurb: "Copper foil, the anvil crest struck into it. The whole table sees whose deck it is." },
  // Tier 2, the SILVER tier: every rare as well. Sterling's own metal.
  { id: "suit-vip2-sterling", kind: "suit", name: "Sterling Silver", price: 4000, vip: 2,
    blurb: "A chrome-bright hazmat with the seams gone black. His own currency, cut to fit you." },
  { id: "title-vip2-connoisseur", kind: "title", name: "Connoisseur", price: 1500, vip: 2,
    blurb: "Every rare in the book, on top of every common. Sterling greets the name at his door." },
  { id: "cardback-vip2-silver", kind: "cardback", name: "The Silver Deck", price: 2500, vip: 2,
    blurb: "Brushed steel, the crest in relief. A silver edge on every card you show." },
  // Tier 3, the GOLD tier: every legendary as well. Sterling announces you.
  { id: "suit-vip3-gold", kind: "suit", name: "Foundry Gold", price: 10000, vip: 3,
    blurb: "A deep amber-gold hazmat with steel fittings. The vault the goblins never found, worn." },
  { id: "title-vip3-magnate", kind: "title", name: "Magnate", price: 4000, vip: 3,
    blurb: "Every legendary in the book. Sterling announces the name at the doors." },
  { id: "border-vip3-gold", kind: "border", name: "Gold Ring", price: 6000, vip: 3,
    blurb: "A gold ring round the face, with a slow glint. Seen on every message you send." },
  { id: "dice-vip3-gold", kind: "dice", name: "The Magnate's Dice", price: 5000, vip: 3,
    blurb: "Solid gold dice — the whole Pit reads them, and the craps table wears them when you shoot." },
  { id: "flair-vip3-gold", kind: "flair", name: "Gold Name", price: 5000, vip: 3,
    blurb: "The name itself in gold, with a slow shimmer across it. Chat, roster, everywhere." },
  { id: "cardback-vip3-gold", kind: "cardback", name: "The Gold Deck", price: 6000, vip: 3,
    blurb: "Gold foil, the crest struck deep. A gold edge on every card you show." },
  // Tier 4, the MYTHIC tier: everything the Wheel can give. The perks (free
  // drinks, the counter at half, the house paying the goblins once a life)
  // come WITH the rank — src/vip.ts — not from this shelf.
  { id: "suit-vip4-prismatic", kind: "suit", name: "The Prismatic", price: 30000, vip: 4,
    blurb: "A hazmat that is every colour at once, with iridescent fittings. There is nothing above it." },
  { id: "title-vip4-complete", kind: "title", name: "The Complete", price: 10000, vip: 4,
    blurb: "Every emoji the Wheel has ever offered. Sterling rings the bells when you arrive." },
  { id: "border-vip4-prism", kind: "border", name: "Prism Ring", price: 15000, vip: 4,
    blurb: "A ring round the face that cycles through the spectrum. Seen on every message you send." },
  { id: "flair-vip4-prism", kind: "flair", name: "Prismatic Name", price: 15000, vip: 4,
    blurb: "The name in a rainbow that never sits still. Chat, roster, everywhere." },
  { id: "dice-vip4-prism", kind: "dice", name: "The Complete's Dice", price: 15000, vip: 4,
    blurb: "Iridescent dice — the whole Pit reads them, and the craps table wears them when you shoot." },
  { id: "cardback-vip4-prism", kind: "cardback", name: "The Holographic Deck", price: 15000, vip: 4,
    blurb: "A holographic back, the crest floating in it. A prismatic edge on every card you show." },
];

const BY_ID = new Map(CATALOG.map((i) => [i.id, i]));

export function getItem(id: string): EmporiumItem | undefined {
  return BY_ID.get(id);
}

/** The theme ids purchasable at the Emporium (prefs whitelist extension). */
export const PURCHASABLE_THEMES = CATALOG.filter((i) => i.kind === "theme").map(
  (i) => i.id.replace(/^theme-/, ""),
);

/** Which cosmetic slot an item kind equips into (themes go via prefs instead). */
// "chime" and "bubble" left the slot list when their catalogs were retired
// (July 2026, migration 48 refunded owners) — nothing can equip them now.
// ("suit" is deliberately absent: worn through the locker, not a cosmetics key.)
export const EQUIP_SLOTS = [
  "border", "flair", "tombstone", "title",
  "banner", "cardback", "dice", "epitaph",
] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

// ---- The rotating shelf (decision, July 2026) -------------------------------
// Sterling restocks DAILY at UTC midnight: 3 items per rotating category are
// in stock each day, drawn DETERMINISTICALLY from the day number — same shelf
// for every user, restart-proof, no DB state. Themes are the permanent
// gallery wall (big-ticket saves must never vanish mid-grind); everything
// else rotates. One stocked item per day is the DAILY DEAL at 20% off.
// Owned items are always visible/equippable — rotation only gates BUYING —
// and admins see (and can buy from) the full catalog for validation.

export const STOCK_PER_KIND = 3;
export const DEAL_PCT = 20;
// Retired kinds (July 2026): "chime" + "banner" gave way to custom UPLOADED
// enter/leave sounds and banner images (migration 46); "bubble" tints were cut
// outright with chime stock at Josh's call (migration 48 refunded every owner
// at full default price and unequipped the cosmetics).
const ROTATING_KINDS: ItemKind[] = [
  "border", "flair",
  "cardback", "dice", "epitaph", "tombstone", "title",
];
/** The rotating departments, for Sterling's flash-sale roulette. */
export const ROTATING_KINDS_PUBLIC: readonly ItemKind[] = ROTATING_KINDS;

/** Small deterministic PRNG (mulberry32) so the shelf is a pure function of
 *  the date — never Math.random() here. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seededSample<T>(pool: T[], n: number, seed: number): T[] {
  const rnd = mulberry32(seed);
  const arr = [...pool];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n);
}

const utcDay = (now: number) => Math.floor(now / 86_400_000);

export interface DailyStock {
  /** Rotating item ids in stock today (themes are ALWAYS in stock). */
  ids: Set<string>;
  /** Today's 20%-off item id (always one of the stocked rotating items). */
  dealId: string | null;
  /** Items stocked today that were NOT stocked yesterday ("new on the shelf"). */
  freshIds: Set<string>;
  /** When the shelf flips (next UTC midnight, epoch ms). */
  restockAt: number;
}

function stockIdsFor(day: number): Set<string> {
  const ids = new Set<string>();
  for (const kind of ROTATING_KINDS) {
    // VIP rows never join the pool — adding one must not reshuffle a shelf.
    const pool = CATALOG.filter((i) => i.kind === kind && !i.award && !i.vip);
    for (const item of seededSample(pool, STOCK_PER_KIND, hashStr(`${day}:${kind}`))) {
      ids.add(item.id);
    }
  }
  return ids;
}

export function dailyStock(now = Date.now()): DailyStock {
  const day = utcDay(now);
  const ids = stockIdsFor(day);
  const yesterday = stockIdsFor(day - 1);
  const freshIds = new Set([...ids].filter((id) => !yesterday.has(id)));
  const stocked = [...ids].sort();
  const dealId = stocked.length
    ? stocked[Math.floor(mulberry32(hashStr(`${day}:deal`))() * stocked.length)]
    : null;
  return { ids, dealId, freshIds, restockAt: (day + 1) * 86_400_000 };
}

/** Is this item buyable today? (Themes always; admins bypass in the route.
 *  Achievement rewards NEVER — they are earned, not sold.) */
export function inStockToday(item: EmporiumItem, stock: DailyStock): boolean {
  if (item.award || item.vip) return false;
  return item.kind === "theme" || stock.ids.has(item.id);
}
