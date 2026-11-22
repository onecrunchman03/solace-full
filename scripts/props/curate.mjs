// THE PROP CATALOGUE, CURATED — stage 2's input. Every placeable prop, named
// and filed, written by looking at the contact sheets (scripts/props/sheet.html).
//
// One entry per prop:
//   id      the name the map uses (never changes once a map places it)
//   name    what the editor shows
//   cat     [section, shelf] — the editor's category tree
//   tags    extra search words (the name, the category and the theme are
//           searched too, so only list what those don't say)
//   v       the piece(s): "source:slug" of an extracted piece, or a list of
//           [piece, label] when one prop comes in several VARIANTS (colours,
//           the 53 cards, the chip colours) — the editor picks the variant
//   h       its REAL height in metres, when the pack's scale is off (the
//           build scales the whole prop to match; the other sizes follow)
//   mount   "wall" (hangs on a wall, backs onto it) | "ceiling" (hangs from
//           it) — default: stands on the floor
//   lay     true = the pack modelled it standing on edge (cards, chips,
//           banknotes); the build turns it to lie flat
//   s       a plain scale factor, for small things whose pack size is off
//   tris    a triangle budget for the build, overriding the size rule (a
//           crystal chandelier is hundreds of tiny drops; the size rule
//           would thin it to a bare frame)
//   walk    true = you walk through it (no collider): small things, rugs,
//           things on walls and ceilings. Default: solid.
//
// Pieces the sheets showed as broken (untextured placeholder boxes, several
// props fused into one) are simply not listed.

export const CATALOG = [
  // ================================================================ INDUSTRIAL
  // ---- pipes & fittings (the old pipe kit — 0.28m bore)
  { id: "pipe-straight-long", name: "Pipe, straight (1.8m)", cat: ["Industrial", "Pipes & fittings"], tags: ["pipe", "run"], v: "pipekit:pipe-6", walk: true },
  { id: "pipe-straight-short", name: "Pipe, straight (0.9m)", cat: ["Industrial", "Pipes & fittings"], tags: ["pipe"], v: "pipekit:pipe-4", walk: true },
  { id: "pipe-elbow", name: "Pipe elbow (90°)", cat: ["Industrial", "Pipes & fittings"], tags: ["bend", "corner"], v: "pipekit:pipe-1", walk: true },
  { id: "pipe-u-bend", name: "Pipe U-bend", cat: ["Industrial", "Pipes & fittings"], tags: ["bend", "return"], v: "pipekit:cylinder", walk: true },
  { id: "pipe-tee", name: "Pipe tee", cat: ["Industrial", "Pipes & fittings"], tags: ["junction", "t"], v: "pipekit:pipe-5", walk: true },
  { id: "pipe-cross", name: "Pipe cross", cat: ["Industrial", "Pipes & fittings"], tags: ["junction", "four way"], v: "pipekit:pipe-2", walk: true },
  { id: "pipe-coupling", name: "Pipe coupling", cat: ["Industrial", "Pipes & fittings"], tags: ["joint", "sleeve"], v: "pipekit:pipe-3", walk: true },
  { id: "pipe-flange", name: "Pipe flange ring", cat: ["Industrial", "Pipes & fittings"], tags: ["ring", "bolt"], v: "pipekit:cylinder-005", walk: true },
  { id: "pipe-end-cap", name: "Pipe end cap", cat: ["Industrial", "Pipes & fittings"], tags: ["cap", "dome"], v: "pipekit:cylinder-003", walk: true },
  { id: "pipe-floor-bracket", name: "Pipe floor bracket", cat: ["Industrial", "Pipes & fittings"], tags: ["mount", "support", "saddle"], v: "pipekit:cylinder-001", walk: true },
  { id: "pipe-clamp", name: "Pipe clamp", cat: ["Industrial", "Pipes & fittings"], tags: ["strap", "bracket"], v: "pipekit:cylinder-002", walk: true },
  { id: "valve-wheel", name: "Valve handwheel", cat: ["Industrial", "Pipes & fittings"], tags: ["valve", "wheel", "turn"], v: "pipekit:obturator", walk: true },
  { id: "duct-pipe-tee", name: "Large duct pipe, tee", cat: ["Industrial", "Pipes & fittings"], tags: ["big pipe", "duct", "rusty"], v: [["indfree:cylinder-003", "Rusty"], ["indfree:cylinder-109", "Black"]], h: 3.7 },
  { id: "duct-pipe-elbow", name: "Large duct pipe, elbow", cat: ["Industrial", "Pipes & fittings"], tags: ["big pipe", "duct", "bend"], v: [["indfree:cylinder-002", "Rusty"], ["indfree:cylinder-113", "Black"]], h: 2.5 },
  { id: "duct-pipe-riser", name: "Large duct pipe, riser", cat: ["Industrial", "Pipes & fittings"], tags: ["big pipe", "duct", "column"], v: [["indfree:cylinder-001", "Rusty"], ["indfree:cylinder-114", "Black"]], h: 3.7 },

  // ---- barrels & drums
  { id: "oil-drum", name: "Oil drum", cat: ["Industrial", "Barrels & drums"], tags: ["barrel", "drum", "steel"], v: [["ind:cap-barrel", "Black"], ["ind:barrel2", "Rust red"], ["ind:barrel3", "Blue"], ["ind:barrel4", "Yellow"]], h: 0.9 },
  { id: "hazard-drum", name: "Hazard drum", cat: ["Industrial", "Barrels & drums"], tags: ["barrel", "drum", "flammable", "chemical"], v: [["indfree:cylinder-060", "Red"], ["indfree:cylinder-061", "Blue"], ["indfree:cylinder-059", "Grey"], ["indfree:cylinder", "Yellow"]], h: 0.9 },
  { id: "hazard-drum-dented", name: "Hazard drum, dented", cat: ["Industrial", "Barrels & drums"], tags: ["barrel", "crushed", "damaged"], v: [["indfree:cylinder-065", "Blue"], ["indfree:cylinder-066", "Yellow"], ["indfree:cylinder-062", "Grey"]], h: 0.85 },
  { id: "hazard-drum-torn", name: "Hazard drum, torn open", cat: ["Industrial", "Barrels & drums"], tags: ["barrel", "broken", "cut"], v: [["indfree:cylinder-063", "Low"], ["indfree:cylinder-064", "Ragged"]], h: 0.5 },
  { id: "explosive-barrel", name: "Explosive barrel", cat: ["Industrial", "Barrels & drums"], tags: ["red", "drum", "fuel"], v: "indfbx:explosivebarrel", h: 0.9 },
  { id: "water-barrel", name: "Plastic water barrel", cat: ["Industrial", "Barrels & drums"], tags: ["blue", "drum", "plastic"], v: "indfbx:water-barrel" },

  // ---- gas & fuel
  { id: "gas-cylinder-tall", name: "Gas cylinder, tall", cat: ["Industrial", "Gas & fuel"], tags: ["bottle", "oxygen", "welding"], v: [["ind:cylinder", "Red"], ["ind:cylinder2", "Blue"], ["ind:cylinder3", "Yellow"]], h: 1.45 },
  { id: "propane-tank", name: "Propane tank", cat: ["Industrial", "Gas & fuel"], tags: ["gas", "lpg", "bottle"], v: [["ind:cylinder-small1", "Yellow"], ["ind:cylinder-small2", "White"], ["ind:cylinder-small3", "Red"], ["indfbx:gas-cylinder", "Bright red"]], h: 0.6 },
  { id: "jerry-can", name: "Jerry can", cat: ["Industrial", "Gas & fuel"], tags: ["fuel", "petrol", "can"], v: [["ind:handle", "Red"], ["ind:cap2", "Green"], ["ind:cap3", "Rust"], ["indfbx:gas-canister", "Bright red"]], h: 0.45 },
  { id: "motor-oil", name: "Motor oil bottle", cat: ["Industrial", "Gas & fuel"], tags: ["oil", "bottle", "small"], v: "indfbx:motor-oil", walk: true },

  // ---- machines & tools
  { id: "generator-portable", name: "Portable generator", cat: ["Industrial", "Machines & tools"], tags: ["engine", "power"], v: "indfbx:generator", h: 0.55 },
  { id: "cement-mixer", name: "Cement mixer", cat: ["Industrial", "Machines & tools"], tags: ["concrete", "construction"], v: "indfbx:cement-mixer" },
  { id: "cable-drum", name: "Cable drum", cat: ["Industrial", "Machines & tools"], tags: ["spool", "reel", "wire"], v: "indfbx:cabledrum" },
  { id: "car-jack", name: "Trolley jack", cat: ["Industrial", "Machines & tools"], tags: ["jack", "lift", "tool"], v: "indfbx:carjack", walk: true },
  { id: "pallet-truck", name: "Pallet truck", cat: ["Industrial", "Machines & tools"], tags: ["pallet jack", "trolley"], v: "indfbx:pallettruck" },
  { id: "platform-trolley", name: "Platform trolley", cat: ["Industrial", "Machines & tools"], tags: ["cart", "hand truck"], v: "indfbx:platform-trolley" },
  { id: "spray-can", name: "Spray can", cat: ["Industrial", "Machines & tools"], tags: ["paint", "aerosol", "small"], v: "indfbx:spray-can", walk: true },

  // ---- electrical
  { id: "electrical-cabinet", name: "Electrical cabinet", cat: ["Industrial", "Electrical"], tags: ["switchgear", "breaker", "power"], v: "indfbx:electricalbox02", h: 2.0 },
  { id: "fuse-box", name: "Wall fuse box", cat: ["Industrial", "Electrical"], tags: ["breaker", "panel", "fuse"], v: "indfbx:electricalbox", mount: "wall", h: 0.8 },

  // ---- structure
  { id: "scaffold-small", name: "Scaffold frame, low", cat: ["Industrial", "Structure"], tags: ["frame", "girder", "cage"], v: "indfree:cube-049", h: 2.2 },
  { id: "scaffold-tall", name: "Scaffold frame, tall", cat: ["Industrial", "Structure"], tags: ["frame", "girder", "tower"], v: "indfree:cube-042", h: 3.5 },
  { id: "scaffold-big", name: "Scaffold frame, large", cat: ["Industrial", "Structure"], tags: ["frame", "girder", "cage"], v: "indfree:cube-034", h: 4.6 },
  { id: "steel-frame-box", name: "Steel frame box", cat: ["Industrial", "Structure"], tags: ["frame", "bracing"], v: "indfree:lp-007", h: 2.3 },
  { id: "caged-rack", name: "Caged rack", cat: ["Industrial", "Structure"], tags: ["frame", "mesh", "cage", "shelf"], v: [["indfree:lp-002", "Open"], ["indfree:lp-005", "Meshed"]], h: 4.0 },
  { id: "i-beam", name: "I-beam", cat: ["Industrial", "Structure"], tags: ["girder", "steel", "beam"], v: "indfree:cube-051", h: 0.35 },
  { id: "concrete-plinth", name: "Concrete plinth", cat: ["Industrial", "Structure"], tags: ["base", "footing", "block"], v: "indfree:cube-050", h: 1.2 },
  { id: "machine-base", name: "Machine base", cat: ["Industrial", "Structure"], tags: ["housing", "dark", "block"], v: "indfree:cube-026", h: 1.0 },
  { id: "shipping-container", name: "Shipping container", cat: ["Industrial", "Structure"], tags: ["container", "cargo", "box"], v: [["indfree:cylinder-028", "Yellow"], ["indfree:cylinder-025", "Red"], ["indfree:cylinder-023", "Blue"]], h: 2.6 },
  { id: "concrete-barrier", name: "Concrete barrier", cat: ["Industrial", "Structure"], tags: ["jersey", "road block"], v: "indfree:lp-blok", h: 0.8 },
  { id: "barbed-fence", name: "Barbed-wire fence", cat: ["Industrial", "Structure"], tags: ["fence", "wire", "barrier"], v: [["indfree:cube-031", "A"], ["indfree:cube-040", "B"], ["indfree:cube-041", "C"]], h: 2.5 },
  { id: "wall-panel-hydrant", name: "Wall panel with hydrant", cat: ["Industrial", "Structure"], tags: ["panel", "hydrant", "fire"], v: "indfree:plane-004", h: 3.0 },
  { id: "fence-gate", name: "Steel fence panel", cat: ["Industrial", "Structure"], tags: ["gate", "fence", "cross brace"], v: [["indfree:plane-005", "Braced"], ["indfree:plane-008", "Double"]], h: 3.0 },
  { id: "wall-panel-concrete", name: "Concrete wall panel", cat: ["Industrial", "Structure"], tags: ["panel", "slab", "wall"], v: "indfree:plane-011", h: 3.0 },
  { id: "steel-post", name: "Steel post", cat: ["Industrial", "Structure"], tags: ["pole", "column"], v: [["indfree:plane-006", "Single"], ["indfree:plane-007", "Pair"]], h: 3.0 },

  // ---- tyres
  { id: "tyre", name: "Tyre, lying flat", cat: ["Industrial", "Tyres"], tags: ["tire", "rubber", "wheel"], v: [["indfree:opon", "Worn"], ["indfree:opon-022", "Dusty"]], walk: true },
  { id: "tyre-pair", name: "Two tyres", cat: ["Industrial", "Tyres"], tags: ["tire", "pile"], v: "indfree:opon-006" },
  { id: "tyre-stack", name: "Tyre stack", cat: ["Industrial", "Tyres"], tags: ["tire", "pile"], v: [["indfree:opon-005", "Stacked"], ["indfree:opon-003", "Leaning"]] },

  // ---- signs & safety
  { id: "wet-floor-sign", name: "Wet floor sign", cat: ["Industrial", "Signs & safety"], tags: ["caution", "yellow", "warning"], v: "indfbx:caution-sign", h: 0.6 },
  { id: "fire-extinguisher", name: "Fire extinguisher", cat: ["Industrial", "Signs & safety"], tags: ["red", "safety"], v: "indfbx:fire-extinguisher", h: 0.6 },
  { id: "alarm-light", name: "Alarm beacon", cat: ["Lighting", "Wall lights"], tags: ["red", "siren", "warning", "emergency"], v: "misc:alarm-light", mount: "wall", h: 0.4, walk: true },

  // ================================================================ STORAGE
  { id: "wood-pallet", name: "Wooden pallet", cat: ["Storage", "Crates & pallets"], tags: ["skid", "wood"], v: [["indfbx:wood-pallet", "Clean"], ["ind:cube-001", "Old"]], h: 0.14, walk: true },
  { id: "wood-crate", name: "Slatted crate", cat: ["Storage", "Crates & pallets"], tags: ["box", "wood"], v: "ind:cube-002", h: 0.45 },
  { id: "locker-tall", name: "Steel locker", cat: ["Storage", "Lockers & cabinets"], tags: ["locker", "metal", "staff"], v: "indfbx:locker" },
  { id: "locker-bank", name: "Locker bank", cat: ["Storage", "Lockers & cabinets"], tags: ["lockers", "rusty", "three"], v: "casfix:locker" },
  { id: "safe", name: "Safe", cat: ["Storage", "Lockers & cabinets"], tags: ["vault", "strongbox"], v: [["casino:safe", "Large"], ["casino:simple-safe", "Plain"]], h: 1.0 },
  { id: "crate-stack", name: "Stack of crates", cat: ["Storage", "Crates & pallets"], tags: ["boxes", "wood", "pile"], v: "bar:modular-bar", h: 1.4 },
  { id: "treasure-chest", name: "Treasure chest", cat: ["Storage", "Crates & pallets"], tags: ["chest", "trunk"], v: "escape:treasure-chest", h: 0.7 },

  // ================================================================ FURNITURE
  { id: "armchair-old", name: "Old armchair", cat: ["Furniture", "Seating"], tags: ["chair", "leather", "worn"], v: "office:old-armchair" },
  { id: "armchair-90s", name: "Wingback armchair", cat: ["Furniture", "Seating"], tags: ["chair", "fabric"], v: "office:furniture-from-the-90s__armchair", h: 1.05 },
  { id: "sofa", name: "Sofa", cat: ["Furniture", "Seating"], tags: ["couch", "leather", "black"], v: "misc:low-poly-sofa", h: 0.8 },
  { id: "bar-stool-cushion", name: "Bar stool, cushioned", cat: ["Furniture", "Seating"], tags: ["stool", "red", "bar"], v: [["bar:bar-stool__cube-011", "A"], ["bar:bar-stool__cube-012", "B"], ["bar:bar-stool__cube-013", "C"], ["bar:bar-stool__cube-014", "D"]], h: 0.75 },
  { id: "wood-chair", name: "Wooden chair", cat: ["Furniture", "Seating"], tags: ["chair", "kitchen", "ladder back"], v: "bar:chair__cube-012", h: 0.95 },
  { id: "casino-stool", name: "Casino stool", cat: ["Casino", "Seating"], tags: ["stool", "chair"], v: [["casino:chair-1", "Four legs"], ["casino:chair-3", "Pedestal"], ["casino:chair-4", "Swivel"], ["casino:clair-2", "Tall back"]] },
  { id: "school-desk", name: "School desk and chair", cat: ["Furniture", "Tables & desks"], tags: ["desk", "classroom", "chair"], v: "office:anime-school-desk", h: 0.8 },
  { id: "old-table", name: "Old wooden table", cat: ["Furniture", "Tables & desks"], tags: ["table", "farmhouse"], v: "office:free-old-table", h: 0.78 },
  { id: "writing-desk", name: "Writing desk", cat: ["Furniture", "Tables & desks"], tags: ["desk", "victorian", "office"], v: "office:victorian-style-tabledesk", h: 0.8 },
  { id: "serving-table", name: "Serving table", cat: ["Furniture", "Tables & desks"], tags: ["side table", "shelf"], v: "office:serving-table-01" },
  { id: "cafe-table", name: "Café table", cat: ["Furniture", "Tables & desks"], tags: ["table", "square", "pedestal"], v: [["bar:square-table__cube-017", "Square, wood"], ["bar:round-table", "Octagonal, wood"], ["bar:square-table__cube-014", "Square, white"]], h: 0.75 },
  { id: "bedside-table", name: "Bedside cabinet", cat: ["Furniture", "Shelves & cabinets"], tags: ["nightstand", "cabinet"], v: "escape:bedside-table", h: 0.6 },
  { id: "dresser-tall", name: "Chest of drawers", cat: ["Furniture", "Shelves & cabinets"], tags: ["drawers", "dresser"], v: "escape:dresser", h: 1.1 },
  { id: "dresser-antique", name: "Painted dresser", cat: ["Furniture", "Shelves & cabinets"], tags: ["drawers", "blue", "antique"], v: "escape:antique-dresser", h: 1.2 },
  { id: "bench-seat", name: "Upholstered bench", cat: ["Furniture", "Seating"], tags: ["bench", "ottoman"], v: "escape:dresser-with-seat", h: 0.45 },
  { id: "bookshelf-dusty", name: "Dusty bookshelf", cat: ["Furniture", "Shelves & cabinets"], tags: ["shelf", "books", "cobwebs"], v: "office:dusty-old-bookshelf-free" },
  { id: "wardrobe", name: "Wardrobe", cat: ["Furniture", "Shelves & cabinets"], tags: ["closet", "cabinet", "wood"], v: "office:furniture-from-the-90s__wardrobe", h: 2.1 },
  { id: "back-bar-shelves", name: "Back-bar shelving", cat: ["Furniture", "Shelves & cabinets"], tags: ["shelves", "bar", "display"], v: "bar:furniture-high", h: 1.9 },
  { id: "low-cabinet", name: "Low cabinet", cat: ["Furniture", "Shelves & cabinets"], tags: ["sideboard", "shelves"], v: [["bar:furniture-low__cube-002", "Open"], ["bar:furniture-low__cube-007", "Shelved"]], h: 0.9 },
  { id: "bed-double", name: "Double bed", cat: ["Furniture", "Beds"], tags: ["bed", "wooden"], v: "escape:bed" },
  { id: "hospital-bed", name: "Iron bed", cat: ["Furniture", "Beds"], tags: ["bed", "hospital", "metal"], v: "office:hospital-bed", h: 1.1 },
  { id: "persian-rug", name: "Persian rug", cat: ["Furniture", "Rugs"], tags: ["carpet", "rug"], v: "escape:persian-rug", walk: true },

  // ================================================================ LIGHTING
  { id: "work-light", name: "Work light", cat: ["Lighting", "Floor lights"], tags: ["flood", "lamp", "yellow"], v: "indfbx:worklight" },
  { id: "work-light-tripod", name: "Tripod work lights", cat: ["Lighting", "Floor lights"], tags: ["flood", "stand", "construction"], v: "indfbx:worklight02" },
  { id: "floor-lamp", name: "Floor lamp", cat: ["Lighting", "Floor lights"], tags: ["standard lamp", "shade"], v: [["escape:floor-lamp", "Slim"], ["office:furniture-from-the-90s__lamp-001", "Brass"]], h: 1.7 },
  { id: "table-lamp", name: "Table lamp", cat: ["Lighting", "Table lights"], tags: ["lamp", "shade", "small"], v: "office:table-lamp-01", walk: true },
  { id: "casino-lamp", name: "Casino lamp", cat: ["Casino", "Signs & décor"], tags: ["lamp", "pillar", "gold"], v: "casino:lamp" },
  { id: "ceiling-speaker", name: "Ceiling speaker", cat: ["Lighting", "Ceiling fittings"], tags: ["speaker", "round"], v: "casfix:speaker", mount: "ceiling", walk: true },

  // ================================================================ DOORS
  { id: "door-panel", name: "Door", cat: ["Doors & openings", "Doors"], tags: ["door", "wood"], v: [["escape:doors__door1-root-4", "White panel"], ["escape:doors__door2-root-10", "Oak"], ["escape:doors__door3-root-15", "Dark wood"], ["kit0:prop-door", "Backrooms"]], h: 2.1 },
  // ---- Josh's downloads, through the intake (scripts/props/intake.mjs). They
  // SWING OPEN as somebody walks up — the "open" clip is in the file.
  { id: "wood-door-swing", name: "Wooden door (opens)", cat: ["Doors & openings", "Doors"], tags: ["door", "wood", "panelled", "opens", "animated", "house"], v: [["wooddoor:wood-door-white-worn", "Worn white"], ["wooddoor:wood-door-white", "White"], ["wooddoor:wood-door-green", "Green"], ["wooddoor:wood-door-blue", "Blue"], ["wooddoor:wood-door-red", "Red"]], anim: "open", walk: true },
  { id: "steel-door-swing", name: "Steel door with window (opens)", cat: ["Doors & openings", "Doors"], tags: ["door", "metal", "steel", "window", "factory", "fire door", "opens", "animated"], v: [["steeldoor:steel-door-yellow", "Yellow"], ["steeldoor:steel-door-red", "Red"], ["steeldoor:steel-door-grey", "Grey"], ["steeldoor:steel-door-blue", "Teal"]], anim: "open", walk: true },
  { id: "rolling-shutter", name: "Rolling shutter", cat: ["Doors & openings", "Doors"], tags: ["shutter", "garage", "metal"], v: "escape:rolling-shutter", h: 3.0 },
  { id: "doorway-frame", name: "Doorway frame", cat: ["Doors & openings", "Frames"], tags: ["frame", "arch"], v: [["kit0:prop-doorway-med", "Single"], ["kit0:prop-doorway-large", "Double"]], walk: true },
  { id: "door-push-bar", name: "Door push bar", cat: ["Doors & openings", "Frames"], tags: ["panic bar", "handle"], v: "kit0:prop-pushbar", mount: "wall", walk: true },

  // ================================================================ CASINO
  { id: "blackjack-table", name: "Blackjack table", cat: ["Casino", "Tables & games"], tags: ["cards", "felt"], v: "casino:black-jack-table", h: 0.9 },
  { id: "poker-table", name: "Poker table", cat: ["Casino", "Tables & games"], tags: ["cards", "felt", "octagon"], v: [["casino:poker-table", "Octagon"], ["casfix:poker7", "Oval (7 seats)"], ["office:furniture-from-the-90s__poker-table", "Wooden"]], h: 0.8 },
  { id: "roulette-table", name: "Roulette table", cat: ["Casino", "Tables & games"], tags: ["wheel", "felt"], v: "casino:roulette-table", h: 0.9 },
  { id: "roulette-wheel", name: "Roulette wheel", cat: ["Casino", "Tables & games"], tags: ["wheel", "spin"], v: "casino:casino-roulette", walk: true },
  { id: "chess-board", name: "Chess set", cat: ["Casino", "Tables & games"], tags: ["chess", "board", "pieces"], v: "casfix:chess", walk: true },
  { id: "slot-machine", name: "Slot machine", cat: ["Casino", "Machines"], tags: ["fruit machine", "pokie"], v: [["casino:casino-machine", "Cabinet"], ["office:furniture-from-the-90s__casino", "Vintage"]], h: 1.8 },
  { id: "fortune-wheel", name: "Wheel of fortune", cat: ["Casino", "Machines"], tags: ["wheel", "spin", "big"], v: "casino:fortune-roulette", h: 2.4 },
  { id: "jukebox", name: "Jukebox", cat: ["Casino", "Machines"], tags: ["music", "records"], v: "casfix:jukebox" },
  { id: "atm", name: "Cash machine", cat: ["Casino", "Machines"], tags: ["atm", "bank", "money"], v: "casfix:atm", h: 1.85 },
  { id: "ticket-kiosk", name: "Ticket kiosk", cat: ["Casino", "Machines"], tags: ["kiosk", "machine"], v: [["casfix:kiosk", "Red"], ["misc:ticket-machine", "Worn"]], h: 1.9 },
  { id: "score-tv", name: "Score screen", cat: ["Casino", "Machines"], tags: ["tv", "monitor"], v: "casino:tv-score" },
  { id: "casino-sign", name: "Casino sign", cat: ["Casino", "Signs & décor"], tags: ["neon", "vertical"], v: "casino:casino-signal", h: 3.0 },
  { id: "vip-sign", name: "VIP sign", cat: ["Casino", "Signs & décor"], tags: ["vip", "hanging"], v: "casino:vip-signal" },
  { id: "exit-sign", name: "Exit sign", cat: ["Casino", "Signs & décor"], tags: ["exit", "hanging"], v: "casino:exit-signal" },
  { id: "stanchion", name: "Rope stanchion", cat: ["Casino", "Signs & décor"], tags: ["post", "queue", "barrier"], v: [["casino:stanchion-1", "Single"], ["casino:stanchion-2", "Pair"], ["casino:stanchion-3", "Row of three"]], h: 1.0 },
  { id: "casino-carpet", name: "Casino carpet", cat: ["Casino", "Signs & décor"], tags: ["rug", "red", "floor"], v: [["casino:carpet-1", "Plain red"], ["casino:carpet-2", "Patterned"], ["casino:carpet-3", "Round patterned"], ["casino:carpet-4", "Round plain"]], walk: true },
  // ---- the bar
  { id: "bar-set-90s", name: "Bar with back shelves", cat: ["Casino", "Bar"], tags: ["counter", "shelves", "wood"], v: "office:furniture-from-the-90s__bar", h: 2.2 },
  { id: "keg-barrel", name: "Keg on a stand", cat: ["Casino", "Bar"], tags: ["barrel", "wine", "cask"], v: "bar:barrel", h: 0.65 },
  { id: "liquor-bottle", name: "Liquor bottle", cat: ["Casino", "Bar"], tags: ["bottle", "whisky", "spirits"], v: [["bar:bottle__alcohol-01", "Black label"], ["bar:bottle__alcohol-02", "Square"], ["casino:whisky", "Whisky"], ["casino:champagne", "Champagne"]], h: 0.3, walk: true },
  { id: "wine-bottle", name: "Wine bottle", cat: ["Casino", "Bar"], tags: ["bottle", "wine"], v: [["bar:bottle__wine-01", "Red"], ["bar:bottle__wine-01-001", "White"]], h: 0.3, walk: true },
  { id: "beer-bottle", name: "Beer bottle", cat: ["Casino", "Bar"], tags: ["bottle", "beer", "green"], v: "bar:bottle__beer-01", h: 0.23, walk: true },
  { id: "drinking-glass", name: "Glass", cat: ["Casino", "Bar"], tags: ["glass", "cup"], v: [["bar:glasses__cube", "Highball"], ["bar:glasses__cube-002", "Goblet"], ["casino:glass-1", "Cocktail"], ["casino:glass-2", "Whisky on a coaster"]], h: 0.14, walk: true },
  { id: "ice-bucket", name: "Ice bucket", cat: ["Casino", "Bar"], tags: ["bucket", "champagne", "ice"], v: "bar:glasses__cube-001", h: 0.22, walk: true },
  { id: "cash-register", name: "Cash register", cat: ["Casino", "Bar"], tags: ["till", "register", "money"], v: "bar:cash-register", h: 0.35, walk: true },
  // ---- small things on tables
  { id: "playing-card", name: "Playing card", cat: ["Casino", "Cards & chips"], tags: ["card", "deck"], v: "CARDS", lay: true, walk: true },
  { id: "poker-chip", name: "Poker chip", cat: ["Casino", "Cards & chips"], tags: ["chip", "token"], v: [["casino:red-token", "Red"], ["casino:blue-token", "Blue"], ["casino:green-token", "Green"], ["casino:black-token", "Black"], ["casino:vip-token", "VIP"]], lay: true, s: 0.65, walk: true },
  { id: "dice", name: "Dice", cat: ["Casino", "Cards & chips"], tags: ["die", "craps"], v: [["casino:dice-1", "Red"], ["casino:dice-2", "Brown"]], walk: true },
  { id: "dice-cup", name: "Dice cup", cat: ["Casino", "Cards & chips"], tags: ["shaker", "cup"], v: "casino:dice-shaker", walk: true },
  { id: "banknote", name: "Banknote", cat: ["Small items", "Money & valuables"], tags: ["cash", "money", "dollar", "bill"], v: "casino:money", lay: true, walk: true },
  { id: "money-roll", name: "Roll of cash", cat: ["Small items", "Money & valuables"], tags: ["cash", "money", "wad", "bankroll"], v: "casino:money-roll", walk: true },
  { id: "briefcase", name: "Briefcase", cat: ["Small items", "Money & valuables"], tags: ["case", "bag"], v: [["casino:briefcase-full", "Full of cash"], ["casino:briefcase-empty", "Empty"], ["casino:simple-briefcase", "Closed"]], walk: true },
  { id: "cigarette", name: "Cigarette", cat: ["Small items", "Smoking"], tags: ["smoke"], v: [["casino:cigarette", "Unlit"], ["casino:cigarette-on", "Lit"], ["casino:cigarette-butt", "Butt"]], walk: true },
  { id: "cigarette-pack", name: "Cigarette pack", cat: ["Small items", "Smoking"], tags: ["smokes", "box"], v: [["casino:cigarrate-box-full", "Full"], ["casino:cigarrate-box-empty", "Empty"], ["casino:simple-box-cigarrate", "Closed"]], walk: true },
  { id: "lighter", name: "Lighter", cat: ["Small items", "Smoking"], tags: ["zippo", "flame"], v: [["casino:lighter-1", "Closed"], ["casino:lighter-2", "Open"]], walk: true },
  { id: "ashtray", name: "Ashtray", cat: ["Small items", "Smoking"], tags: ["ash"], v: "casino:ashtray", walk: true },

  // ================================================================ THE SEPTEMBER 2026 INTAKE
  // (scripts/props/intake.mjs → assets/kit/; looked at on sheets beside a
  // 1.8m figure before a height was written down)
  // ---- the workshop
  { id: "workbench-pegboard", name: "Workbench with pegboard", cat: ["Industrial", "Workbenches"], tags: ["bench", "tools", "tool chest", "garage", "wood"], v: "workbench:workbench" },
  { id: "reloading-bench", name: "Ammo reloading bench", cat: ["Industrial", "Workbenches"], tags: ["bench", "ammunition", "press", "gunsmith", "shells"], v: "reload:reloading-bench" },
  { id: "steel-frame-table", name: "Steel-frame work table", cat: ["Industrial", "Workbenches"], tags: ["table", "oak top", "loft", "industrial"], v: "steeltable:steel-frame-table", h: 0.76 },
  { id: "pillar-drill", name: "Pillar drill", cat: ["Industrial", "Machines & tools"], tags: ["drill press", "machine", "workshop", "green"], v: "drill:pillar-drill" },
  { id: "engine-lathe", name: "Metal lathe", cat: ["Industrial", "Machines & tools"], tags: ["lathe", "machine", "workshop", "turning", "green"], v: "lathe:engine-lathe" },
  { id: "hydraulic-press", name: "Hydraulic shop press", cat: ["Industrial", "Machines & tools"], tags: ["press", "machine", "workshop", "frame"], v: "hpress:hydraulic-press" },
  // ---- power
  { id: "transformer-station", name: "Transformer station", cat: ["Industrial", "Electrical"], tags: ["transformer", "substation", "high voltage", "insulators", "power"], v: "polesub:pole-substation" },
  { id: "pad-transformer", name: "Pad-mounted transformer", cat: ["Industrial", "Electrical"], tags: ["transformer", "green box", "utility", "power", "scan"], v: "padxfmr:pad-transformer", h: 1.5 },
  { id: "street-cabinet", name: "Old electrical cabinet", cat: ["Industrial", "Electrical"], tags: ["switchgear", "cabinet", "rusty", "soviet", "power", "two doors"], v: "streetcab:street-cabinet" },
  { id: "condenser-unit", name: "Twin-fan condenser unit", cat: ["Industrial", "Electrical"], tags: ["air conditioner", "ac", "hvac", "fans", "outdoor unit"], v: "condenser:condenser-unit", s: 1.4, mount: "wall", walk: true },
  { id: "rotary-switch", name: "Rotary light switch", cat: ["Industrial", "Electrical"], tags: ["switch", "vintage", "wall", "knob"], v: [["switches:vintage-industrial-light-switch-type-a-brass-0", "Brass"], ["switches:vintage-industrial-light-switch-type-a-metallic-", "Steel"], ["switches:vintage-industrial-light-switch-type-a-painted-b", "Black"]], mount: "wall", walk: true },
  // ---- pipes and access
  { id: "riser-pipes", name: "Riser pipes, pair", cat: ["Industrial", "Pipes & fittings"], tags: ["pipe", "vertical", "elbow", "duct", "two"], v: "risers:riser-pair" },
  { id: "pipe-bundle", name: "Stack of pipes", cat: ["Industrial", "Pipes & fittings"], tags: ["pipes", "stock", "pile", "rack", "green"], v: "pipeshop:01" },
  { id: "pipe-length", name: "Loose pipe (3m)", cat: ["Industrial", "Pipes & fittings"], tags: ["pipe", "stock", "green"], v: "pipeshop:02", walk: true },
  { id: "pipe-saddle-rail", name: "Pipe saddle rail", cat: ["Industrial", "Pipes & fittings"], tags: ["support", "bracket", "saddles"], v: [["pipeshop:03", "Single"], ["pipeshop:04", "Double"]], walk: true },
  { id: "hook-ladder", name: "Hook-top ladder", cat: ["Industrial", "Structure"], tags: ["ladder", "rungs", "climb", "pool", "ledge"], v: "ladder:wall-ladder", h: 3.5, walk: true },
  // ---- storage
  { id: "pallet-rack", name: "Pallet racking", cat: ["Storage", "Racking"], tags: ["rack", "shelving", "warehouse", "blue", "orange"], v: "rack:pallet-rack" },
  { id: "locker-two-tier", name: "Two-tier staff lockers", cat: ["Storage", "Lockers & cabinets"], tags: ["lockers", "changing room", "ten", "beige"], v: "locktier:locker-tiers" },
  { id: "locker-blue", name: "Blue steel locker", cat: ["Storage", "Lockers & cabinets"], tags: ["locker", "school", "gym", "vented"], v: [["bluelock:part-1", "Row of three"], ["bluelock:part-2", "Single"]], h: 1.83 },
  { id: "cardboard-box", name: "Cardboard box", cat: ["Storage", "Crates & pallets"], tags: ["box", "carton", "moving"], v: "apocoffice:cardboard-box" },
  // ---- office furniture
  { id: "office-desk-60s", name: "Steel office desk", cat: ["Furniture", "Tables & desks"], tags: ["desk", "1960s", "drawers", "office"], v: "sixties:cube-016" },
  { id: "long-table", name: "Long wooden table", cat: ["Furniture", "Tables & desks"], tags: ["table", "meeting", "conference"], v: "sixties:cube-020" },
  { id: "office-desk-worn", name: "Worn office desk", cat: ["Furniture", "Tables & desks"], tags: ["desk", "office", "abandoned", "wood"], v: [["apocoffice:desk-1", "Long"], ["apocoffice:desk-2", "Long, stained"], ["apocoffice:desk-small", "Short"]] },
  { id: "computer-desk", name: "Computer desk", cat: ["Furniture", "Tables & desks"], tags: ["desk", "monitors", "keyboard", "office", "workstation"], v: [["officepack:table1", "Black"], ["officepack:table2", "White"]] },
  { id: "plain-table", name: "Plain wooden table", cat: ["Furniture", "Tables & desks"], tags: ["table", "desk", "pine"], v: "officepack:table3", h: 0.75 },
  { id: "office-chair", name: "Office chair", cat: ["Furniture", "Seating"], tags: ["chair", "swivel", "desk chair", "office"], v: [["officepack:seat2", "Black swivel"], ["apocoffice:desk-chair", "Blue swivel"], ["officepack:seat1", "Plain"]] },
  { id: "office-chair-60s", name: "1960s swivel chair", cat: ["Furniture", "Seating"], tags: ["chair", "swivel", "leather", "retro", "office"], v: [["sixties:cube-021", "Executive"], ["sixties:cube-004", "Typist"]] },
  { id: "filing-cabinet", name: "Filing cabinet", cat: ["Furniture", "Shelves & cabinets"], tags: ["drawers", "files", "office", "steel"], v: [["sixties:cube-003", "Three drawers"], ["officepack:drawers", "Four drawers, plant"], ["officepack:drawers2", "Four drawers, open"], ["officepack:drawers3", "Low, two drawers"]] },
  { id: "desk-pedestal", name: "Desk pedestal drawers", cat: ["Furniture", "Shelves & cabinets"], tags: ["drawers", "pedestal", "office", "wood"], v: [["apocoffice:cabinet-1", "Open top"], ["apocoffice:cabinet-2", "Three drawers"], ["apocoffice:cabinet-3", "Two drawers"]] },
  { id: "open-shelving", name: "Open steel shelving", cat: ["Furniture", "Shelves & cabinets"], tags: ["shelves", "rack", "office", "storage"], v: [["apocoffice:open-cabinet-large", "Wide"], ["apocoffice:open-cabinet-medium1", "Medium"], ["apocoffice:open-cabinet-small", "Low"]] },
  { id: "office-cupboard", name: "Office cupboard", cat: ["Furniture", "Shelves & cabinets"], tags: ["cabinet", "doors", "office", "grey"], v: [["apocoffice:closed-cabinet-big", "Tall"], ["apocoffice:closed-cabinet-medium", "Low"]] },
  { id: "bookcase", name: "Bookcase", cat: ["Furniture", "Shelves & cabinets"], tags: ["books", "shelves", "office", "wood"], v: "officepack:shelves1" },
  // ---- the office
  { id: "typewriter", name: "Typewriter", cat: ["Office", "Desk items"], tags: ["typing", "1960s", "machine", "paper"], v: [["sixties:cube", "Grey"], ["sixties:cube-007", "Cream"]], walk: true },
  { id: "adding-machine", name: "Adding machine", cat: ["Office", "Desk items"], tags: ["calculator", "1960s", "till roll"], v: "sixties:cube-019", walk: true },
  { id: "coffee-mug", name: "Coffee mug", cat: ["Office", "Desk items"], tags: ["mug", "cup", "drink"], v: [["sixties:cylinder-006", "White"], ["sixties:cylinder-007", "White B"], ["officepack:mug", "Grey"]], h: 0.1, walk: true },
  { id: "computer-monitor", name: "Computer monitor", cat: ["Office", "Desk items"], tags: ["screen", "monitor", "cracked", "computer"], v: "apocoffice:monitor", walk: true },
  { id: "keyboard", name: "Keyboard", cat: ["Office", "Desk items"], tags: ["computer", "typing"], v: "apocoffice:keyboard", walk: true },
  { id: "headphones", name: "Headphones", cat: ["Office", "Desk items"], tags: ["headset", "audio"], v: [["officepack:headphones", "Standing"], ["officepack:headphones2", "Lying flat"]], walk: true },
  { id: "pencil-pot", name: "Pencil pot", cat: ["Office", "Desk items"], tags: ["pens", "pencils", "holder", "red"], v: "officepack:pencilholder", walk: true },
  { id: "sticky-note", name: "Sticky note", cat: ["Office", "Desk items"], tags: ["post-it", "note", "yellow"], v: [["officepack:stickynote", "Pad"], ["officepack:stickynote2", "Single"]], walk: true },
  { id: "paper-stack", name: "Stack of paper", cat: ["Office", "Desk items"], tags: ["paper", "documents", "pile", "files"], v: [["sixties:cube-024", "Large"], ["sixties:cube-011", "Medium"], ["sixties:cube-012", "Small"]], walk: true },
  { id: "paper-sheet", name: "Sheet of paper", cat: ["Office", "Desk items"], tags: ["paper", "page", "note", "litter"], v: [["sixties:cube-018", "A"], ["sixties:cube-002", "B"], ["sixties:cube-009", "C"]], walk: true },
  { id: "paper-tray", name: "Letter tray", cat: ["Office", "Desk items"], tags: ["in tray", "out tray", "paper"], v: [["sixties:cube-014", "Large"], ["sixties:cube-005", "Small"]], walk: true },
  { id: "ring-binder", name: "Ring binder", cat: ["Office", "Desk items"], tags: ["folder", "file", "binder"], v: [["sixties:cube-001", "Narrow"], ["sixties:cube-017", "Wide"]], walk: true },
  { id: "film-reel", name: "Film reel", cat: ["Office", "Desk items"], tags: ["reel", "tape", "1960s", "archive"], v: [["sixties:cylinder-005", "Standing"], ["sixties:cylinder-001", "Standing, blue"], ["sixties:cylinder-002", "Lying flat"]], walk: true },
  { id: "water-cooler", name: "Water cooler", cat: ["Office", "Appliances"], tags: ["water", "dispenser", "cups", "1960s"], v: "sixties:cube-023" },
  { id: "vending-machine-60s", name: "1960s vending machine", cat: ["Office", "Appliances"], tags: ["vending", "snacks", "machine", "retro"], v: [["sixties:cube-022", "Orange"], ["sixties:cube-000", "Blue"]] },
  { id: "coffee-maker", name: "Coffee maker", cat: ["Office", "Appliances"], tags: ["coffee", "percolator", "kitchen"], v: "sixties:cube-015", h: 0.4, walk: true },
  { id: "cork-noticeboard", name: "Cork noticeboard", cat: ["Office", "Boards & signs"], tags: ["pin board", "notices", "cork", "wall"], v: [["sixties:cube-11647", "Pinned notes"], ["officepack:woodboard", "Bare"]], mount: "wall", walk: true },
  { id: "evidence-board", name: "Evidence board", cat: ["Office", "Boards & signs"], tags: ["red string", "notes", "conspiracy", "investigation", "wall"], v: "officepack:string4", mount: "wall", walk: true },
  { id: "whiteboard", name: "Mobile whiteboard", cat: ["Office", "Boards & signs"], tags: ["whiteboard", "board", "stand", "meeting"], v: "officepack:whiteboard", h: 1.9 },
  { id: "wall-clock", name: "Wall clock", cat: ["Office", "Boards & signs"], tags: ["clock", "time", "round"], v: "sixties:cylinder", h: 0.3, mount: "wall", walk: true },
  { id: "exit-sign-box", name: "Exit sign, boxed", cat: ["Office", "Boards & signs"], tags: ["exit", "sign", "arrow", "red"], v: "sixties:cube-006", mount: "wall", walk: true },
  { id: "potted-plant", name: "Potted plant", cat: ["Office", "Plants & bins"], tags: ["plant", "pot", "leaves", "green"], v: "sixties:cylinder-003" },
  { id: "planter-trough", name: "Planter trough", cat: ["Office", "Plants & bins"], tags: ["planter", "soil", "box", "dead plant"], v: [["apocoffice:big-square", "Long"], ["apocoffice:small-square", "Short"]], walk: true },
  { id: "bucket", name: "Bucket", cat: ["Office", "Plants & bins"], tags: ["pail", "bucket", "black"], v: [["apocoffice:big-round", "Large"], ["apocoffice:small-round", "Small"]], walk: true },
  { id: "wire-bin", name: "Wastepaper bin", cat: ["Office", "Plants & bins"], tags: ["bin", "trash", "rubbish", "mesh"], v: "apocoffice:trash-bin", walk: true },
  { id: "microscope", name: "Microscope", cat: ["Office", "Lab"], tags: ["lab", "science", "research"], v: "apocoffice:microscope", walk: true },
  { id: "lab-flask", name: "Lab flask", cat: ["Office", "Lab"], tags: ["glassware", "chemistry", "lab", "bottle"], v: [["apocoffice:bottle-1", "Round, long neck"], ["apocoffice:bottle-4", "Round"], ["apocoffice:bottle-2", "Conical"], ["apocoffice:bottle-3", "Cylinder"]], walk: true },
  { id: "test-tube-rack", name: "Test tube rack", cat: ["Office", "Lab"], tags: ["test tubes", "lab", "chemistry"], v: "apocoffice:test-tubes", walk: true },
  // ---- the 90s office (Level 4, the Abandoned Office)
  { id: "office-desk-90s", name: "Office desk, 90s", cat: ["Furniture", "Tables & desks"], tags: ["desk", "1990s", "black", "workstation", "cubicle"], v: "ninetiesoffice:desk-004-19" },
  { id: "office-chair-leather", name: "Leather office chair", cat: ["Furniture", "Seating"], tags: ["chair", "swivel", "black", "1990s", "cubicle"], v: "ninetiesoffice:chair-1-001-65" },
  { id: "cubicle-partition", name: "Cubicle partition", cat: ["Office", "Cubicles"], tags: ["cubicle", "divider", "panel", "wall", "1990s"], v: [["ninetiesoffice:cubicle-wall-005-98", "Long (2.6m)"], ["ninetiesoffice:cubicle-wall-003-64", "Short (0.9m)"]] },
  { id: "crt-monitor", name: "CRT monitor", cat: ["Office", "Computers"], tags: ["computer", "screen", "monitor", "1990s", "beige"], v: [["ninetiesoffice:monitor-002-007-53", "Beige"], ["ninetiesoffice:monitor-002-009-57", "White"], ["ninetiesoffice:monitor-001-60", "Black"]], walk: true },
  { id: "desktop-pc", name: "Desktop computer", cat: ["Office", "Computers"], tags: ["computer", "pc", "tower", "base unit", "1990s"], v: [["ninetiesoffice:pc-004-007-55", "Beige"], ["ninetiesoffice:pc-004-009-59", "White"], ["ninetiesoffice:pc-001-61", "Black"]], walk: true },
  { id: "keyboard-90s", name: "Keyboard, 90s", cat: ["Office", "Computers"], tags: ["keyboard", "computer", "typing", "1990s"], v: [["ninetiesoffice:keyboard-002-005-52", "Beige"], ["ninetiesoffice:keyboard-002-006-56", "White"], ["ninetiesoffice:keyboard-002-001-12", "Black"]], walk: true },
  { id: "computer-mouse", name: "Computer mouse", cat: ["Office", "Computers"], tags: ["mouse", "computer", "1990s"], v: [["ninetiesoffice:mouse-001-005-54", "Beige"], ["ninetiesoffice:mouse-001-006-58", "White"], ["ninetiesoffice:mouse-001-007-63", "Black"]], walk: true },
  { id: "office-printer", name: "Office printer", cat: ["Office", "Computers"], tags: ["printer", "laser", "copier", "1990s"], v: [["ninetiesoffice:printer-base-004-48", "White"], ["ninetiesoffice:printer-base-003-46", "Beige"]] },
  { id: "photocopier", name: "Photocopier", cat: ["Office", "Appliances"], tags: ["copier", "copy machine", "printer", "copy room"], v: "copier:copy-machine" },
  { id: "drinks-vending-machine", name: "Drinks vending machine", cat: ["Office", "Appliances"], tags: ["vending", "drinks", "soda", "break room", "almond water"], v: "vending:vending-machine" },
  { id: "water-cooler-90s", name: "Water cooler, 90s", cat: ["Office", "Appliances"], tags: ["water", "dispenser", "break room", "1990s"], v: "ninetiesoffice:cooler-003-25" },
  { id: "water-jug", name: "Water cooler bottle", cat: ["Office", "Appliances"], tags: ["water", "bottle", "jug", "blue"], v: "ninetiesoffice:bottle-002-50", walk: true },
  { id: "desk-phone", name: "Desk phone", cat: ["Office", "Desk items"], tags: ["phone", "telephone", "1990s"], v: "ninetiesoffice:phone-002-51", walk: true },
  { id: "desk-lamp-anglepoise", name: "Anglepoise desk lamp", cat: ["Office", "Desk items"], tags: ["lamp", "light", "desk", "angle"], v: [["ninetiesoffice:black-lamp-002-22", "Black"], ["ninetiesoffice:white-lamp-002-23", "White"], ["ninetiesoffice:creme-lamp-001-24", "Cream"]], walk: true },
  { id: "lever-arch-binder", name: "Lever-arch binder", cat: ["Office", "Desk items"], tags: ["binder", "folder", "file"], v: [["ninetiesoffice:binder-001-26", "Red"], ["ninetiesoffice:binder-2-004-27", "Blue"], ["ninetiesoffice:binder-3-001-28", "Black"]], walk: true },
  { id: "logo-mug", name: "Mug, printed", cat: ["Office", "Desk items"], tags: ["mug", "cup", "coffee", "logo"], v: [["ninetiesoffice:mug-1-001-66", "Grey"], ["ninetiesoffice:mug-2-001-67", "Cream"], ["ninetiesoffice:mug-3-001-68", "Brown"], ["ninetiesoffice:mug-4-001-69", "Enamel"]], walk: true },
  { id: "mesh-pen-pot", name: "Mesh pen pot", cat: ["Office", "Desk items"], tags: ["pens", "pencil holder", "desk"], v: "ninetiesoffice:pen-holder-001-70", walk: true },
  { id: "file-stack", name: "Stack of files", cat: ["Office", "Desk items"], tags: ["paper", "documents", "pile", "files", "reports"], v: "ninetiesoffice:files-004-43", walk: true },
  { id: "loose-paper", name: "Loose paper", cat: ["Office", "Desk items"], tags: ["paper", "page", "litter", "memo", "printout"], v: [["ninetiesoffice:paper-028-35", "Flat"], ["ninetiesoffice:paper-024-31", "Curled"], ["ninetiesoffice:paper-026-33", "Folded"]], walk: true },
  { id: "crumpled-paper", name: "Crumpled paper", cat: ["Office", "Desk items"], tags: ["paper", "ball", "litter", "rubbish"], v: [["ninetiesoffice:paper-025-32", "A"], ["ninetiesoffice:paper-032-39", "B"]], walk: true },
  { id: "archive-box", name: "Archive box", cat: ["Office", "Storage"], tags: ["box", "files", "cardboard", "banker's box", "storage"], v: [["ninetiesoffice:file-box-2-lid-004-42", "Printed"], ["ninetiesoffice:file-box-1-005-41", "Plain"]] },
  { id: "lanyard-id", name: "Lanyard ID card", cat: ["Office", "Desk items"], tags: ["id", "badge", "lanyard", "employee", "pass"], v: "lanyard:lanyard-id", h: 0.45, walk: true },
  { id: "potted-plant-90s", name: "Potted plant, small", cat: ["Office", "Plants & bins"], tags: ["plant", "pot", "leaves", "green", "desk"], v: "ninetiesoffice:pot-002-21", walk: true },
  { id: "plastic-bin", name: "Plastic waste bin", cat: ["Office", "Plants & bins"], tags: ["bin", "trash", "rubbish", "black"], v: "ninetiesoffice:trash-can-003-44", walk: true },
  // ---- the bathroom
  { id: "toilet", name: "Toilet", cat: ["Bathroom", "Fixtures"], tags: ["wc", "loo", "restroom", "porcelain"], v: [["toilet:toilet", "Clean, lid up"], ["apocoffice:toilet-1", "Grimy, seat up"], ["apocoffice:toilet-2", "Grimy, lid down"]] },
  { id: "toilet-wall-hung", name: "Wall-hung toilet", cat: ["Bathroom", "Fixtures"], tags: ["wc", "modern", "restroom"], v: "modbath:modern-wall-hung-toilet", mount: "wall" },
  { id: "bathtub", name: "Bathtub", cat: ["Bathroom", "Fixtures"], tags: ["bath", "tub", "marble"], v: "modbath:bathtub" },
  { id: "shower-enclosure", name: "Glass shower enclosure", cat: ["Bathroom", "Fixtures"], tags: ["shower", "glass", "walk-in"], v: "modbath:walk-in-shower-001", walk: true },
  { id: "vanity-sink", name: "Vanity unit with basin", cat: ["Bathroom", "Fixtures"], tags: ["sink", "basin", "wash", "cabinet", "floating"], v: "modbath:floating-vanity-ceramic-sink", mount: "wall" },
  { id: "wall-basin", name: "Wall basin", cat: ["Bathroom", "Fixtures"], tags: ["sink", "basin", "wash", "tap", "grimy"], v: "apocoffice:sink", mount: "wall", walk: true },
  { id: "led-mirror", name: "Lit bathroom mirror", cat: ["Bathroom", "Accessories"], tags: ["mirror", "led", "oval", "round"], v: [["modbath:led-mirror-01", "Oval"], ["modbath:led-mirror-02", "Round"]], mount: "wall", walk: true },
  { id: "towel-rail", name: "Heated towel rail", cat: ["Bathroom", "Accessories"], tags: ["towel", "radiator", "rail"], v: "modbath:heated-towel-rail", mount: "wall", walk: true },
  { id: "toilet-roll-holder", name: "Toilet roll holder", cat: ["Bathroom", "Accessories"], tags: ["toilet paper", "roll"], v: "modbath:toilet-paper-holder", mount: "wall", walk: true },
  { id: "pedal-bin", name: "Pedal bin", cat: ["Bathroom", "Accessories"], tags: ["bin", "trash", "steel"], v: "modbath:trash-can", walk: true },
  { id: "toiletry-bottle", name: "Toiletry bottle", cat: ["Bathroom", "Accessories"], tags: ["bottle", "pills", "medicine", "lotion"], v: [["bottles:cylinder-002", "Lotion"], ["bottles:cylinder", "Pill jar"], ["bottles:cylinder-005", "Prescription bottle"]], walk: true },
  // ---- doors and lights
  { id: "office-door-swing", name: "Office door (opens)", cat: ["Doors & openings", "Doors"], tags: ["door", "office", "frameless", "glass", "keycard", "opens", "animated"], v: [["apocdoor:office-door-plain", "Plain"], ["apocdoor:office-door-glass", "Glass"], ["apocdoor:office-door-keycard", "Keycard"]], anim: "open", walk: true },
  { id: "elevator-doors", name: "Elevator doors", cat: ["Doors & openings", "Doors"], tags: ["elevator", "lift", "steel", "sliding"], v: "apocelev:elevator-doors" },
  { id: "hotel-room-door", name: "Hotel room door (opens)", cat: ["Doors & openings", "Doors"], tags: ["door", "hotel", "wood", "panelled", "glass", "opens", "animated"], v: [["hoteldoor:hotel-door-panelled", "Panelled"], ["hoteldoor:hotel-door-plain", "Plain"], ["hoteldoor:hotel-door-glass", "Glass panel"]], anim: "open", walk: true },
  { id: "hotel-lift-doors", name: "Hotel lift doors", cat: ["Doors & openings", "Doors"], tags: ["elevator", "lift", "hotel", "steel"], v: "hoteldoor:hotel-lift-doors" },
  { id: "floodlight-tripod", name: "Twin floodlight on tripod", cat: ["Lighting", "Floor lights"], tags: ["flood", "work light", "stand", "construction", "glowing"], v: "worklight:tripod-work-light", walk: true },
  { id: "desk-lamp", name: "Desk lamp", cat: ["Lighting", "Table lights"], tags: ["lamp", "shade", "office"], v: "officepack:lamp", walk: true },

  // ================================================================ LEVEL KITS
  // ---- Level 0 (The Backrooms) — the same pieces the office walls are made of
  { id: "bk-wall", name: "Backrooms wall", cat: ["Level kit", "Backrooms"], tags: ["wall", "wallpaper", "yellow"], v: [["kit0:wall-small", "1m"], ["kit0:wall-med", "2m"], ["kit0:wall-large", "4m"]] },
  { id: "bk-wall-divider", name: "Backrooms divider wall", cat: ["Level kit", "Backrooms"], tags: ["wall", "partition", "thin"], v: [["kit0:wall-divider-small", "1m"], ["kit0:wall-divider-med", "2m"], ["kit0:wall-divider-large", "4m"]] },
  { id: "bk-wall-doorway", name: "Backrooms wall with doorway", cat: ["Level kit", "Backrooms"], tags: ["wall", "opening"], v: [["kit0:wall-doorway-med", "2m"], ["kit0:wall-doorway-large", "4m"]] },
  { id: "bk-wall-corner", name: "Backrooms wall corner", cat: ["Level kit", "Backrooms"], tags: ["wall", "corner"], v: [["kit0:wall-corner-small", "Small"], ["kit0:wall-corner-med", "Medium"], ["kit0:wall-corner-large", "Large"], ["kit0:wall-corner-inner", "Inner"]] },
  { id: "bk-wall-corridor", name: "Backrooms corridor wall", cat: ["Level kit", "Backrooms"], tags: ["wall", "corridor"], v: [["kit0:wall-corridor-small", "1m"], ["kit0:wall-corridor-med", "2m"], ["kit0:wall-corridor-large", "4m"], ["kit0:wall-corridornarrow-small", "Narrow 1m"], ["kit0:wall-corridornarrow-med", "Narrow 2m"], ["kit0:wall-corridornarrow-large", "Narrow 4m"]] },
  { id: "bk-wall-corridor-entrance", name: "Backrooms corridor entrance", cat: ["Level kit", "Backrooms"], tags: ["wall", "opening", "corridor"], v: [["kit0:wall-corridorentrance-med", "2m"], ["kit0:wall-corridorentrance-large", "4m"]] },
  { id: "bk-crawlspace", name: "Backrooms crawlspace", cat: ["Level kit", "Backrooms"], tags: ["low", "vent", "tunnel"], v: [["kit0:wall-crawlspace-small", "1m"], ["kit0:wall-crawlspace-med", "2m"], ["kit0:wall-crawlspace-large", "4m"], ["kit0:wall-crawlspacehole-large", "Wall with hole"]] },
  { id: "bk-pillar", name: "Backrooms pillar", cat: ["Level kit", "Backrooms"], tags: ["column", "pillar"], v: [["kit0:wall-pillar-tiny", "Tiny"], ["kit0:wall-pillar-small", "Small"], ["kit0:wall-pillar-med", "Medium"], ["kit0:wall-pillar-large", "Large"]] },
  { id: "bk-skirting", name: "Backrooms skirting board", cat: ["Level kit", "Backrooms"], tags: ["trim", "baseboard"], v: [["kit0:wall-trim-tiny", "0.5m"], ["kit0:wall-trim-small", "1m"], ["kit0:wall-trim-med", "2m"], ["kit0:wall-trim-large", "4m"], ["kit0:wall-trimcorner-small", "Corner S"], ["kit0:wall-trimcorner-med", "Corner M"], ["kit0:wall-trimcorner-large", "Corner L"]], walk: true },
  { id: "bk-wood-trim", name: "Backrooms wood trim", cat: ["Level kit", "Backrooms"], tags: ["trim", "moulding"], v: [["kit0:woodtrim-tiny", "0.5m"], ["kit0:woodtrim-small", "1m"], ["kit0:woodtrim-med", "2m"], ["kit0:woodtrim-large", "4m"]], walk: true },
  { id: "bk-ceiling-light", name: "Backrooms ceiling light", cat: ["Lighting", "Ceiling fittings"], tags: ["fluorescent", "panel", "office"], v: [["kit0:ceiling-light-small", "Small"], ["kit0:ceiling-light-large", "Large"]], mount: "ceiling", walk: true },
  { id: "fluorescent-batten", name: "Fluorescent tube batten", cat: ["Lighting", "Ceiling fittings"], tags: ["fluorescent", "tube", "strip light", "office", "glowing"], v: "tube:fluorescent-batten", mount: "ceiling", walk: true },
  { id: "hanging-lantern", name: "Hanging lantern", cat: ["Lighting", "Hanging lamps"], tags: ["lantern", "lamp", "old", "glowing"], v: "lamps:hanging-lantern", h: 0.47, mount: "ceiling", walk: true },
  { id: "bare-bulb", name: "Bare filament bulb", cat: ["Lighting", "Hanging lamps"], tags: ["bulb", "edison", "filament", "glowing"], v: "lamps:bare-bulb", h: 0.14, mount: "ceiling", walk: true },
  { id: "bulkhead-lamp", name: "Caged bulkhead lamp", cat: ["Lighting", "Wall lights"], tags: ["bulkhead", "cage", "industrial", "tunnel", "glowing"], v: "lamps:bulkhead-lamp", mount: "wall", walk: true },
  { id: "led-wall-panel", name: "LED wall panel", cat: ["Lighting", "Wall lights"], tags: ["led", "panel", "sconce", "glowing"], v: "lamps:led-wall-panel", mount: "wall", walk: true },
  { id: "bk-ceiling-vent", name: "Ceiling vent", cat: ["Lighting", "Ceiling fittings"], tags: ["vent", "grille", "air"], v: [["kit0:ceiling-vent-small", "Small"], ["kit0:ceiling-vent-large-low", "Large"], ["kit0:ceiling-vent-large-high", "Large, fine grille"]], mount: "ceiling", walk: true },
  { id: "wall-socket", name: "Wall socket", cat: ["Doors & openings", "Frames"], tags: ["outlet", "plug", "power"], v: "kit0:prop-wallsocket", mount: "wall", walk: true },

  // ---- Level 1 (The Poolrooms)
  { id: "pr-pillar", name: "Tiled pillar", cat: ["Level kit", "Poolrooms"], tags: ["column", "tile", "round"], v: [["kit1:pillar", "Column"], ["kit1:pillar-top", "Capital"]] },
  { id: "pr-arch", name: "Tiled arch", cat: ["Level kit", "Poolrooms"], tags: ["archway", "curve", "tile"], v: [["kit1:wall-circlehole", "Round arch"], ["kit1:archway-entry", "Arch entry"], ["kit1:archway-inner", "Arch inner"], ["kit1:archway-corner", "Arch corner"], ["kit1:wall-circle-wide", "Wide curve"]] },
  { id: "pr-wall", name: "Tiled wall", cat: ["Level kit", "Poolrooms"], tags: ["wall", "tile"], v: [["kit1:wall-curved01", "Curved A"], ["kit1:wall-curved02", "Curved B"], ["kit1:wall-corner-round", "Round corner"], ["kit1:wall-corner-round02", "Round corner B"], ["kit1:wall-corner-sharp", "Sharp corner"], ["kit1:wall-wcubby", "With cubby"], ["kit1:wall-light01", "With light box"], ["kit1:wall-light02", "With light slots"], ["kit1:wall-whole", "With hole"]] },
  { id: "pr-pool-edge", name: "Pool edge", cat: ["Level kit", "Poolrooms"], tags: ["pool", "tile", "lip"], v: [["kit1:pool-edge01", "Straight"], ["kit1:pool-edge02", "Stepped"], ["kit1:pool-corner", "Corner"], ["kit1:pool-centercorner", "Inner corner"], ["kit1:pool-corneredge01", "Corner edge"], ["kit1:pool-corneredge02", "Corner edge, stepped"], ["kit1:pool-bottom", "Floor to wall"], ["kit1:pool-wall", "Wall"]] },
  { id: "pr-railing", name: "Pool railing", cat: ["Level kit", "Poolrooms"], tags: ["rail", "handrail", "chrome"], v: [["kit1:railing-straight", "Straight"], ["kit1:railing-turn", "Turn"], ["kit1:railing-end", "End"], ["kit1:railing-sidewall", "Wall handle"]], walk: true },
  { id: "pr-stairs", name: "Tiled stairs", cat: ["Level kit", "Poolrooms"], tags: ["steps", "stairs"], v: [["kit1:stairs", "Straight"], ["kit1:stairs-turn", "Turn"], ["kit1:stairs-spiral", "Spiral"]] },
  { id: "pr-bridge", name: "Tiled bridge", cat: ["Level kit", "Poolrooms"], tags: ["bridge", "deck"], v: [["kit1:bridge-center", "Span"], ["kit1:bridge-end", "End"]] },
  { id: "pr-stairwell", name: "Tiled stairwell", cat: ["Level kit", "Poolrooms"], tags: ["well", "round"], v: "kit1:staircasewell" },
  { id: "pr-tunnel", name: "Tiled tunnel mouth", cat: ["Level kit", "Poolrooms"], tags: ["tunnel", "entrance"], v: "kit1:tunnel-entrance" },
  { id: "pr-ceiling-light", name: "Poolrooms skylight", cat: ["Lighting", "Ceiling fittings"], tags: ["skylight", "panel"], v: "kit1:ceiling-light", mount: "ceiling", walk: true },

  // ================================================================ LEVEL 3
  // THE ELECTRICAL STATION's kit (Oct 2026): Poly Haven CC0 + Sketchfab CC-BY,
  // fetched by scripts/assets/fetch.mjs, filed by intake.mjs
  { id: "switchgear-low", name: "Switchgear cabinet", cat: ["Industrial", "Electrical"], tags: ["switchgear", "cabinet", "breaker", "station", "grey", "power"], v: "switchgear:switchgear" },
  { id: "station-transformer", name: "Station transformer", cat: ["Industrial", "Electrical"], tags: ["transformer", "high voltage", "insulators", "station", "power", "big"], v: "stxfmr:station-transformer", h: 3 },
  { id: "power-box", name: "Wall power box (door open)", cat: ["Industrial", "Electrical"], tags: ["breaker", "panel", "fuse", "exposed wires", "damaged", "station"], v: "powerbox:power-box", mount: "wall" },
  { id: "electrical-box-small", name: "Wall electrical box", cat: ["Industrial", "Electrical"], tags: ["junction", "box", "panel", "station"], v: "elecbox:electrical-box", mount: "wall" },
  { id: "utility-box", name: "Riveted utility cabinet", cat: ["Industrial", "Electrical"], tags: ["cabinet", "high voltage", "stickers", "station"], v: [["utilbox:utility-box", "Single"], ["utilbox2:utility-box-wide", "Wide"]] },
  { id: "diesel-generator", name: "Diesel generator", cat: ["Industrial", "Machines & tools"], tags: ["generator", "engine", "power", "station"], v: "dieselgen:diesel-generator" },
  { id: "fire-alarm-call-point", name: "Fire alarm call point", cat: ["Industrial", "Electrical"], tags: ["fire", "alarm", "red", "pull"], v: "firealarm:fire-alarm", mount: "wall", walk: true },
  { id: "wall-cable", name: "Wall cable run", cat: ["Industrial", "Cables"], tags: ["cable", "wire", "conduit", "wiring"], v: [["cables:electric-cables__cable-straight-long", "Long (0.6m)"], ["cables:electric-cables__cable-straight-medium", "Medium (0.2m)"], ["cables:electric-cables__cable-straight-short", "Short (0.1m)"], ["cables:electric-cables__cable-double-alt-long", "Double, long"], ["cables:electric-cables__cable-double-alt-short", "Double, short"], ["cables:electric-cables__cable-double", "Double"]], mount: "wall", walk: true },
  { id: "wall-cable-bend", name: "Wall cable bend", cat: ["Industrial", "Cables"], tags: ["cable", "turn", "curve", "corner"], v: [["cables:electric-cables__cable-turn-long", "Turn, long"], ["cables:electric-cables__cable-turn-short", "Turn, short"], ["cables:electric-cables__cable-scurve-1", "S-curve"], ["cables:electric-cables__cable-scurve-2", "S-curve, long"], ["cables:electric-cables__cable-corner-towards", "Corner in"], ["cables:electric-cables__cable-corner-away", "Corner out"], ["cables:electric-cables__cable-double-turn-long", "Double turn, long"], ["cables:electric-cables__cable-double-turn-short", "Double turn, short"], ["cables:electric-cables__cable-double-scurve", "Double S-curve"]], mount: "wall", walk: true },
  { id: "wall-junction-box", name: "Cable junction box", cat: ["Industrial", "Cables"], tags: ["junction", "box", "splitter"], v: [["cables:electric-cables__cable-box-3way", "Three-way"], ["cables:electric-cables__cable-box-4way", "Four-way"], ["cables:electric-cables__cable-box-turn", "Turn"], ["cables:electric-cables__cable-box-double", "Double"], ["cables:electric-cables__cable-3way-junction", "Open junction"], ["cables:electric-cables__cable-double-junction", "Double junction"]], mount: "wall", walk: true },
  { id: "wall-switch", name: "Wall switch & outlet", cat: ["Industrial", "Cables"], tags: ["light switch", "plug", "socket", "outlet", "isolator"], v: [["cables:electric-cables__cable-switch", "Isolator switch"], ["cables:electric-cables__cable-lightswitch", "Light switch"], ["cables:electric-cables__cable-lightswitch-double", "Double switch"], ["cables:electric-cables__cable-plug-4x", "Four sockets"], ["cables:electric-cables__cable-plug-covered", "Covered socket"]], mount: "wall", walk: true },
  { id: "cable-tray", name: "Cable tray", cat: ["Industrial", "Cables"], tags: ["tray", "ladder", "overhead", "trunking"], v: "cabletray:cable-tray", mount: "ceiling", walk: true },
  { id: "caged-hanging-light", name: "Caged hanging light", cat: ["Lighting", "Hanging lamps"], tags: ["cage", "industrial", "pendant", "bulb", "station"], v: "cagedlamp:caged-hanging-light", mount: "ceiling", walk: true },
  { id: "mounted-fluorescent", name: "Mounted fluorescent tube", cat: ["Lighting", "Ceiling fittings"], tags: ["fluorescent", "tube", "batten", "strip light", "station"], v: [["fluoros:mounted-fluorescents__mounted-fluorescent-lights-a", "Bare tube"], ["fluoros:mounted-fluorescents__mounted-fluorescent-lights-b", "Twin"], ["fluoros:mounted-fluorescents__mounted-fluorescent-lights-c", "Clip"], ["fluoros:mounted-fluorescents__mounted-fluorescent-lights-d", "Diffuser"], ["fluoros:mounted-fluorescents__mounted-fluorescent-lights-e", "Diffuser, short"], ["fluoros:mounted-fluorescents__mounted-fluorescent-lights-f", "Caged"], ["fluoros:mounted-fluorescents__mounted-fluorescent-lights-g", "Slim"]], mount: "ceiling", walk: true },
  { id: "roller-shutter", name: "Roller shutter", cat: ["Doors & openings", "Doors"], tags: ["shutter", "garage", "rolling door", "steel", "exit"], v: [["shutter:roller-shutter", "Plain"], ["shutter:roller-shutter-graffiti", "Graffiti"]] },
  { id: "worn-metal-rack", name: "Worn metal rack", cat: ["Storage", "Racking"], tags: ["shelf", "rack", "rusty", "storage"], v: "wornrack:worn-metal-rack" },
  { id: "wet-floor-sign-aframe", name: "Wet floor sign (A-frame)", cat: ["Industrial", "Signs & safety"], tags: ["caution", "yellow", "slippery", "puddle", "warning"], v: "wetsign:wet-floor-sign", walk: true },

  // ================================================================ LEVEL 5, THE TERROR HOTEL
  // (Oct 2026 — scripts/assets/level5.json, fixed by intake.mjs). The ids the
  // game's own renderer names are crystal-chandelier, deco-chandelier,
  // deco-sconce, candle-sconce, cast-iron-furnace, boiler and mahjong-set.
  { id: "crystal-chandelier", name: "Crystal chandelier", cat: ["Lighting", "Chandeliers"], tags: ["chandelier", "crystal", "empire", "ballroom", "lobby", "hotel", "glowing"], v: "crystalchand:crystal-chandelier", h: 1.4, mount: "ceiling", walk: true, tris: 22000 },
  { id: "deco-chandelier", name: "Art deco lantern chandelier", cat: ["Lighting", "Chandeliers"], tags: ["chandelier", "lantern", "pendant", "art deco", "1920s", "brass", "hotel", "glowing"], v: "decochand:deco-chandelier", h: 1.3, mount: "ceiling", walk: true },
  { id: "deco-sconce", name: "Art deco globe sconce", cat: ["Lighting", "Wall lights"], tags: ["sconce", "globe", "art deco", "brass", "corridor", "hotel", "glowing"], v: "decosconce:deco-sconce", h: 1.2, mount: "wall", walk: true },
  { id: "candle-sconce", name: "Wall candle sconce", cat: ["Lighting", "Wall lights"], tags: ["candle", "sconce", "iron", "old", "stairwell", "hotel"], v: "candlesconce:candle-sconce", h: 0.4, mount: "wall", walk: true },
  { id: "deco-table-lamp", name: "Art deco table lamp", cat: ["Lighting", "Table lights"], tags: ["lamp", "desk lamp", "art deco", "bedside", "hotel"], v: "decolamp:deco-table-lamp", h: 0.5, walk: true },
  { id: "reception-desk", name: "Art deco reception desk", cat: ["Hotel", "Front desk"], tags: ["reception", "counter", "front desk", "check in", "bar", "lobby", "art deco"], v: "decobar:reception-desk", h: 1.1 },
  { id: "deco-back-bar", name: "Art deco back bar (key shelves)", cat: ["Hotel", "Front desk"], tags: ["back bar", "shelves", "pigeonholes", "keys", "reception", "arch", "art deco"], v: "decobar:deco-back-bar", h: 3.6 },
  { id: "desk-bell", name: "Front-desk service bell", cat: ["Hotel", "Front desk"], tags: ["bell", "service bell", "reception", "ring", "small"], v: "deskbell:desk-bell", h: 0.07, walk: true },
  { id: "luggage-trolley", name: "Brass luggage trolley", cat: ["Hotel", "Lobby"], tags: ["luggage", "cart", "bellhop", "trolley", "brass"], v: "trolley:luggage-trolley", h: 1.9 },
  { id: "mahjong-set", name: "Mahjong tiles (a game laid out)", cat: ["Hotel", "Games"], tags: ["mahjong", "tiles", "game", "table top", "small"], v: "mahjong:mahjong-set", h: 0.018, walk: true },
  { id: "picture-frame", name: "Ornate gilt picture frame", cat: ["Hotel", "Wall décor"], tags: ["frame", "picture", "portrait", "gilt", "gold", "painting", "photo"], v: "picframe:picture-frame", h: 1.0, mount: "wall", walk: true },
  { id: "boiler", name: "Water-tube boiler", cat: ["Hotel", "Boiler room"], tags: ["boiler", "babcock", "steam", "brick", "furnace", "boiler room", "big"], v: "boiler:boiler", h: 3.2 },
  { id: "cast-iron-furnace", name: "Cast-iron furnace", cat: ["Hotel", "Boiler room"], tags: ["furnace", "stove", "firebox", "iron", "boiler room", "heat"], v: "furnace:cast-iron-furnace", h: 1.4 },
  { id: "safety-valve", name: "Boiler safety valve", cat: ["Hotel", "Boiler room"], tags: ["valve", "spring", "pressure", "boiler", "steam", "small"], v: "safetyvalve:safety-valve", h: 0.4, walk: true },
  // LEVEL 6, LIGHTS OUT: what the dark is full of — broken concrete, rubble
  // and a bare rusted shelf (scripts/assets/level6.json).
  { id: "broken-wall-slab", name: "Broken wall slab", cat: ["Ruin", "Rubble & debris"], tags: ["concrete", "wall", "broken", "slab", "ruin", "collapsed", "debris"], v: "debris:broken-wall-slab", h: 1.93 },
  { id: "broken-wall-corner", name: "Broken wall corner", cat: ["Ruin", "Rubble & debris"], tags: ["concrete", "wall", "corner", "broken", "ruin", "collapsed", "debris"], v: "debris:broken-wall-corner", h: 1.79 },
  { id: "broken-pillar-tall", name: "Broken pillar (tall)", cat: ["Ruin", "Rubble & debris"], tags: ["concrete", "pillar", "column", "rebar", "broken", "ruin", "debris"], v: "debris:broken-pillar-tall", h: 1.99 },
  { id: "broken-pillar", name: "Broken pillar", cat: ["Ruin", "Rubble & debris"], tags: ["concrete", "pillar", "column", "rebar", "broken", "ruin", "debris"], v: "debris:broken-pillar", h: 1.72 },
  { id: "broken-pillar-stump", name: "Broken pillar stump", cat: ["Ruin", "Rubble & debris"], tags: ["concrete", "pillar", "stump", "rebar", "broken", "ruin", "debris"], v: "debris:broken-pillar-stump", h: 0.81 },
  { id: "concrete-shard", name: "Concrete shard", cat: ["Ruin", "Rubble & debris"], tags: ["concrete", "shard", "slab", "broken", "ruin", "debris", "small"], v: "debris:concrete-shard", h: 0.89 },
  { id: "rubble-pile", name: "Rubble pile", cat: ["Ruin", "Rubble & debris"], tags: ["rubble", "concrete", "heap", "pile", "broken", "ruin", "debris", "floor"], v: "rubblepile:rubble-pile", h: 0.9 },
  { id: "rusty-shelving", name: "Rusty shelving unit", cat: ["Storage", "Racking"], tags: ["shelf", "shelves", "rack", "rusty", "metal", "storage", "empty"], v: "rustyshelf:rusty-shelving", h: 1.9 },
  { id: "radiator", name: "Cast-iron radiator", cat: ["Furniture", "Heating"], tags: ["radiator", "heater", "iron", "rusty", "hotel", "heat"], v: "radiator:radiator", h: 0.7 },
  { id: "velvet-sofa", name: "Red velvet sofa", cat: ["Furniture", "Seating"], tags: ["sofa", "couch", "velvet", "red", "gilt", "royal", "lobby", "hotel"], v: "velvetsofa:velvet-sofa", h: 0.95 },
  { id: "chesterfield-sofa", name: "Chesterfield sofa", cat: ["Furniture", "Seating"], tags: ["sofa", "couch", "leather", "buttoned", "chesterfield", "smoking room"], v: "chesterfield:chesterfield", h: 0.75 },
  { id: "velvet-armchair", name: "Red velvet armchair", cat: ["Furniture", "Seating"], tags: ["armchair", "chair", "velvet", "red", "victorian", "hotel"], v: "velvetchair:velvet-armchair", h: 1.05 },
  { id: "victorian-side-table", name: "Victorian marble side table", cat: ["Furniture", "Tables & desks"], tags: ["side table", "marble", "round", "victorian", "hotel"], v: "sidetable:side-table", h: 0.52 },
  { id: "potted-palm", name: "Potted palm", cat: ["Furniture", "Plants"], tags: ["plant", "palm", "areca", "pot", "lobby", "hotel"], v: "palm:potted-palm", h: 1.8 },
  { id: "deco-hotel-bed", name: "Art deco double bed", cat: ["Furniture", "Beds"], tags: ["bed", "double", "art deco", "1920s", "hotel", "guest room"], v: "decobed:deco-bed", h: 1.05 },
  { id: "antique-wardrobe", name: "Antique wardrobe (doors open)", cat: ["Furniture", "Shelves & cabinets"], tags: ["wardrobe", "closet", "armoire", "drawers", "open", "ransacked", "hotel"], v: "wardrobe:antique-wardrobe", h: 2.1 },
  { id: "dressing-table", name: "Victorian dressing table", cat: ["Furniture", "Tables & desks"], tags: ["dressing table", "vanity", "mirror", "victorian", "white", "hotel"], v: "dressing:dressing-table", h: 1.5 },
];

/** The 53 cards, generated: suit × rank, plus the joker. */
export const CARD_VARIANTS = (() => {
  const out = [];
  for (const suit of ["spade", "heart", "diamond", "club"]) {
    for (const r of ["a", "2", "3", "4", "5", "6", "7", "8", "9", "10", "j", "q", "k"]) {
      const label = `${{ a: "Ace", j: "Jack", q: "Queen", k: "King" }[r] ?? r} of ${suit}s`;
      out.push([`casino:${suit}-card-${r}`, label]);
    }
  }
  out.push(["casino:joker-card", "Joker"]);
  return out;
})();
