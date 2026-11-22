// SURVIVORZ: search for 3D models to fill the gaps in docs/survivorz/ASSET-CHECK.md.
// Read-only (searches, writes a candidate list; downloads nothing).
//
//   node scripts/survivorz/find-gap-models.mjs            all the gaps
//   node scripts/survivorz/find-gap-models.mjs sink fuel  just those
//
// Sources: Sketchfab (downloadable, CC0 / CC BY only; needs SKETCHFAB_TOKEN
// in .env) and Poly Haven (CC0). Writes assets/downloads/survivorz/gap-candidates.json:
// per gap, each candidate's name, page, licence, credit, triangles, author and
// thumbnail, so a pick can go straight into docs/survivorz/sourcing/free/
// free_gaps.json for fetch-free.mjs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const env = fs.existsSync(path.join(ROOT, ".env")) ? parseEnv(fs.readFileSync(path.join(ROOT, ".env"), "utf8")) : {};
const TOKEN = env.SKETCHFAB_TOKEN || process.env.SKETCHFAB_TOKEN;
const OUT = path.join(ROOT, "assets", "downloads", "survivorz", "gap-candidates.json");
const UA = { "User-Agent": "SolaceAssetIntake/1.0" };

/** gap id -> search terms (tried in turn; results merged) and the brief line it fills */
export const GAPS = {
  // power and maintenance (2026-10-27): the plant floor under the staff levels
  "generator": { fills: "the generator hall: diesel standby gensets", terms: ["diesel generator", "generator set", "industrial generator", "power generator", "genset"] },
  "switchgear": { fills: "the generator hall: switchgear / breaker cabinets", terms: ["switchgear", "electrical cabinet", "breaker panel", "electrical switchboard", "control cabinet"] },
  "boiler": { fills: "the boiler room: industrial boilers", terms: ["industrial boiler", "boiler", "steam boiler", "water heater industrial"] },
  "pump": { fills: "the pump room: centrifugal pumps on bases", terms: ["water pump", "centrifugal pump", "industrial pump", "pump"] },
  "valve-wheel": { fills: "the pipe gallery and pump room: gate valves with handwheels", terms: ["valve wheel", "gate valve", "pipe valve", "industrial valve"] },
  "pipes": { fills: "the pipe gallery: runs of industrial pipe with flanges and supports", terms: ["industrial pipes", "pipe set", "pipes modular", "pipeline"] },
  "fuel-tank": { fills: "the generator hall: a diesel day tank", terms: ["fuel tank", "diesel tank", "oil tank", "storage tank"] },
  "railing": { fills: "the catwalks: steel railings and grating", terms: ["catwalk", "metal railing", "industrial stairs", "metal grating"] },
  "pressure-gauge": { fills: "the boiler and pump rooms: gauges", terms: ["pressure gauge", "manometer", "gauge"] },
  // security (2026-10-27): a private security force that tried to hold the line
  "gun-rack": { fills: "the armoury: rifle racks and a weapons cage", terms: ["gun rack", "weapon rack", "rifle rack", "armory rack", "weapon locker"] },
  "body-armor": { fills: "the armoury and lockers: body armour vests on hooks", terms: ["body armor vest", "tactical vest", "bulletproof vest", "plate carrier"] },
  "riot-shield": { fills: "the armoury: riot shields and helmets", terms: ["riot shield", "police shield", "ballistic shield"] },
  "tactical-helmet": { fills: "the armoury and lockers: helmets", terms: ["tactical helmet", "police helmet", "military helmet"] },
  "steel-toilet": { fills: "the holding cell: a steel prison toilet", terms: ["prison toilet", "steel toilet", "jail toilet", "metal toilet"] },
  "handcuffs": { fills: "the holding area and interview: handcuffs and evidence", terms: ["handcuffs", "evidence box", "evidence bag"] },
  "interview-table": { fills: "the interview room: a steel table with a ring", terms: ["interrogation table", "metal table", "steel table"] },
  // medical and quarantine (2026-10-27): the wing where the first infected were treated
  "iv-stand": { fills: "the ward: IV drip stands", terms: ["iv stand", "iv drip", "infusion stand", "drip stand"] },
  "patient-monitor": { fills: "the ward and OR: patient monitors on stands", terms: ["patient monitor", "vital signs monitor", "ecg monitor", "medical monitor"] },
  "crash-cart": { fills: "the ward and OR: a crash cart / medical trolley", terms: ["crash cart", "medical cart", "medical trolley", "hospital cart"] },
  "operating-table": { fills: "the operating room: the table", terms: ["operating table", "surgical table", "surgery table"] },
  "surgical-light": { fills: "the operating room: the surgical lights", terms: ["surgical light", "operating lamp", "surgical lamp", "operating room light"] },
  "autopsy-table": { fills: "the morgue: a stainless autopsy table", terms: ["autopsy table", "morgue table", "dissection table"] },
  "morgue-fridge": { fills: "the morgue: body storage doors", terms: ["morgue refrigerator", "morgue fridge", "body cooler", "mortuary"] },
  "body-bag": { fills: "the morgue: body bags", terms: ["body bag", "corpse bag", "body bag zipped"] },
  "exam-table": { fills: "the exam rooms: examination couches", terms: ["examination table", "exam table", "medical couch", "doctor table"] },
  "gurney": { fills: "the hall and ward: gurneys / stretchers", terms: ["gurney", "stretcher", "hospital stretcher", "ambulance stretcher"] },
  "defibrillator": { fills: "the ward: a defibrillator", terms: ["defibrillator", "aed"] },
  "xray-viewer": { fills: "the exam rooms and OR: an x-ray light box", terms: ["xray viewer", "x-ray lightbox", "film viewer"] },
  // the research labs (2026-10-27): the clean labs, their entry sequence, the offices round them
  "hazmat-suit-hanging": { fills: "the suit room: positive-pressure suits on hooks", terms: ["hazmat suit", "positive pressure suit", "biohazard suit", "hazmat suit hanging", "protective suit"] },
  "air-hose": { fills: "the clean labs: coiled yellow air hoses from the ceiling", terms: ["coiled air hose", "air hose", "spiral hose", "pneumatic hose"] },
  "ln2-dewar": { fills: "lab storage: liquid nitrogen dewars", terms: ["liquid nitrogen dewar", "dewar", "cryogenic tank", "nitrogen tank"] },
  "gas-cylinder": { fills: "lab storage and labs: gas cylinders chained to the wall", terms: ["gas cylinder", "gas bottle", "oxygen cylinder", "co2 cylinder"] },
  "lab-freezer": { fills: "the clean labs: -80 upright freezers", terms: ["lab freezer", "ultra low freezer", "laboratory refrigerator", "medical fridge"] },
  "fume-hood": { fills: "the clean labs: a chemical fume hood", terms: ["fume hood", "fume cupboard", "laboratory hood"] },
  "eyewash": { fills: "labs and decon: an emergency eyewash / safety shower", terms: ["eyewash station", "emergency shower", "safety shower"] },
  "lab-glassware": { fills: "the benches: beakers, bottles, petri dishes", terms: ["laboratory glassware", "beaker", "petri dish", "reagent bottle", "erlenmeyer flask"] },
  "pipette": { fills: "the benches: pipettes and tip boxes", terms: ["pipette", "micropipette", "pipette tips"] },
  "conference-table": { fills: "the conference room: a long table and chairs", terms: ["conference table", "meeting table", "boardroom table"] },
  "coffee-machine": { fills: "the break room: a coffee machine and kettle", terms: ["coffee machine", "espresso machine", "coffee maker"] },
  "microwave": { fills: "the break room: a microwave", terms: ["microwave oven", "microwave"] },
  "office-partition": { fills: "the glass offices: desk clutter and a monitor arm", terms: ["office desk clutter", "desk organizer", "keyboard mouse"] },
  "crac-unit": { fills: "the server room: a cooling (CRAC) unit and a UPS", terms: ["server room cooling", "air conditioning unit indoor", "ups battery cabinet"] },
  "chemical-cabinet": { fills: "lab storage: yellow flammables cabinets", terms: ["flammable cabinet", "safety cabinet yellow", "chemical storage cabinet"] },
  "autoclave": { fills: "the clean labs: an autoclave", terms: ["autoclave", "sterilizer", "laboratory autoclave"] },
  // the residential wing (2026-10-27): what people who lived here for days leave lying around
  "food-tray": { fills: "the canteen: meal trays left on tables", terms: ["cafeteria tray", "food tray", "lunch tray", "school lunch tray", "meal tray"] },
  "plates-cutlery": { fills: "the canteen: plates, bowls, cutlery", terms: ["plate fork knife", "dinner plate", "bowl spoon", "cutlery set", "dishes"] },
  "paperback-books": { fills: "the rec room and bunks: books", terms: ["book stack", "books pile", "paperback book", "old books", "book set"] },
  bookshelf: { fills: "the rec room: a bookshelf", terms: ["bookshelf with books", "bookcase", "book shelf", "shelf books"] },
  "pool-table": { fills: "the rec room: a pool table", terms: ["pool table", "billiard table", "snooker table"] },
  towel: { fills: "the showers and bunks: towels", terms: ["towel", "folded towel", "bath towel", "hanging towel"] },
  pillow: { fills: "the bunks and safe room: pillows and bedding", terms: ["pillow", "pillows", "bed pillow"] },
  blanket: { fills: "the bunks: rumpled blankets", terms: ["blanket", "crumpled blanket", "duvet", "messy bed sheets"] },
  "clothes-pile": { fills: "the bunks: clothes left lying", terms: ["clothes pile", "folded clothes", "t-shirt", "hoodie", "jacket on hanger", "pile of clothes"] },
  sneakers: { fills: "the bunks: shoes by the bunks", terms: ["sneakers", "running shoes", "shoes pair", "boots pair"] },
  "laundry-basket": { fills: "the bunks: laundry baskets", terms: ["laundry basket", "laundry hamper", "clothes basket"] },
  "board-game": { fills: "the rec room: cards, a chess board, a board game", terms: ["playing cards", "chess board", "board game", "deck of cards", "poker chips"] },
  "photo-frame": { fills: "the bunks: family photos", terms: ["photo frame", "picture frame desk", "family photo"] },
  "cereal-box": { fills: "the canteen and stores: cereal and food boxes", terms: ["cereal box", "food box", "pasta box", "grocery boxes"] },
  "shelving-unit": { fills: "the stores: steel shelving", terms: ["metal shelving unit", "warehouse shelf", "storage rack", "wire shelving"] },
  "toiletries": { fills: "the showers: toiletries", terms: ["toothbrush cup", "shampoo bottle", "soap dispenser", "toiletries", "razor"] },
  // the Vault Lobby look test (2026-10-24): what a reception has that the facility didn't
  "lobby-seating": { fills: "the Vault Lobby: waiting-room seating", terms: ["waiting room chairs", "airport seating", "beam seating", "lobby bench", "waiting bench", "row of chairs"] },
  planter: { fills: "the Vault Lobby: planters (dead plants)", terms: ["office plant pot", "potted plant", "dead plant", "indoor plant", "planter"] },
  stanchion: { fills: "the Vault Lobby: queue barriers", terms: ["queue stanchion", "belt stanchion", "crowd control barrier", "rope barrier post"] },
  "reception-counter": { fills: "the Vault Lobby: a reception counter", terms: ["reception desk", "reception counter", "front desk", "security desk"] },
  "wall-clock": { fills: "the Vault Lobby: a wall clock", terms: ["wall clock", "office clock", "school clock"] },
  "notice-board": { fills: "the Vault Lobby: a notice board", terms: ["notice board", "cork board", "bulletin board"] },
  // the Vault Lobby, round three (2026-10-24, Josh: "this needs to look like people worked here"):
  // a front desk abandoned mid-shift
  "coffee-mug": { fills: "the Vault Lobby: mugs and paper cups left on desks", terms: ["coffee mug", "office mug", "paper coffee cup", "takeaway coffee cup", "mug"] },
  "desk-phone": { fills: "the Vault Lobby: desk phones", terms: ["office phone", "desk telephone", "voip phone", "landline phone"] },
  keyboard: { fills: "the Vault Lobby: keyboards and mice", terms: ["computer keyboard", "keyboard and mouse", "office keyboard"] },
  "flat-monitor": { fills: "the Vault Lobby: office monitors", terms: ["computer monitor", "office monitor", "lcd monitor", "pc monitor"] },
  "desk-lamp": { fills: "the Vault Lobby: desk lamps", terms: ["desk lamp", "office desk lamp", "anglepoise lamp"] },
  printer: { fills: "the Vault Lobby: a printer", terms: ["office printer", "laser printer", "printer"] },
  "coffee-table": { fills: "the Vault Lobby: a coffee table for the waiting area", terms: ["coffee table", "lobby table", "low table", "waiting room table"] },
  "lounge-chair": { fills: "the Vault Lobby: lounge armchairs / sofa", terms: ["lobby armchair", "office armchair", "lounge chair", "waiting room sofa", "office sofa", "leather sofa"] },
  jacket: { fills: "the Vault Lobby: a coat left on a chair", terms: ["jacket", "coat", "lab coat", "hoodie", "folded jacket"] },
  "hand-bag": { fills: "the Vault Lobby: bags left behind", terms: ["handbag", "briefcase", "messenger bag", "shoulder bag", "laptop bag"] },
  lanyard: { fills: "the Vault Lobby: visitor badges and lanyards", terms: ["lanyard badge", "id badge lanyard", "visitor badge"] },
  "badge-gate": { fills: "the Vault Lobby: badge gates / turnstiles before the secure door", terms: ["turnstile", "speed gate", "security turnstile", "access gate", "optical turnstile"] },
  "queue-post": { fills: "the Vault Lobby: belt stanchion posts", terms: ["stanchion", "queue barrier", "retractable belt barrier", "queue post"] },
  "wall-frame": { fills: "the Vault Lobby: framed plaques, certificates and pictures on the walls", terms: ["picture frame", "certificate frame", "wall plaque", "framed poster"] },
  "magazine-stack": { fills: "the Vault Lobby: magazines and brochures", terms: ["magazine", "magazines stack", "brochure", "newspaper"] },
  "coat-rack": { fills: "the Vault Lobby: a coat stand", terms: ["coat rack", "coat stand", "hat stand"] },
  "office-plant": { fills: "the Vault Lobby: a living plant (dried, not dead)", terms: ["office plant", "potted plant", "indoor plant pot", "ficus"] },
  "wall-tv": { fills: "the Vault Lobby: a wall-mounted screen", terms: ["wall tv", "flat screen tv", "television wall mounted", "information display"] },
  "sticky-notes": { fills: "the Vault Lobby: pens, sticky notes, desk clutter", terms: ["sticky notes", "pen holder", "desk organizer", "stapler", "office supplies"] },
  "metal-detector": { fills: "the Vault Lobby: screening before the gates (a walk-through detector)", terms: ["metal detector", "walk through metal detector", "security scanner gate", "airport security gate", "security checkpoint"] },
  "security-tray": { fills: "the Vault Lobby: screening trays and a tray table", terms: ["security tray", "airport tray", "plastic tray", "x-ray baggage scanner", "baggage scanner"] },
  "hazmat-suit": { fills: "a hazmat suit dropped by the decon door / hung in decon", terms: ["hazmat suit", "protective suit", "biohazard suit", "chemical suit", "positive pressure suit", "decontamination suit"] },
  sink: { fills: "a sink per safe room (refilling bottles)", terms: ["stainless steel sink", "utility sink", "bathroom sink", "lab sink"] },
  workbench: { fills: "a workbench per safe room (crafting)", terms: ["workbench", "work bench table", "industrial workbench"] },
  rags: { fills: "rags (crafting part)", terms: ["rag cloth", "dirty rag", "cloth rag"] },
  "fuel-can": { fills: "a fuel can (crafting part)", terms: ["jerry can", "fuel can", "gas can"] },
  "metal-sheet": { fills: "a metal sheet (crafting, reinforced barricade)", terms: ["sheet metal", "metal sheet scrap", "corrugated metal sheet"] },
  "wire-spool": { fills: "wire (crafting part)", terms: ["wire spool", "cable reel", "copper wire coil", "wire coil", "electrical wire roll", "extension cord", "coiled cable"] },
  "sample-kit": { fills: "the sample kit (tissue sample)", terms: ["biohazard sample kit", "specimen case", "medical sample case", "blood sample kit", "hard case", "medical bag", "test tube rack", "petri dish", "scalpel", "surgical tools"] },
  "cold-case": { fills: "the cold case (carrying samples)", terms: ["medical cooler box", "transport cooler", "organ transport box", "vaccine cooler", "cooler box", "portable cooler", "ice chest", "cool box"] },
  terminal: { fills: "a facility computer terminal (logs)", terms: ["old computer terminal", "retro computer", "crt computer", "lab computer workstation"] },
  "override-console": { fills: "the vault override console", terms: ["control console", "control panel desk", "security control panel", "sci-fi console"] },
  "ammo-box": { fills: "ammo boxes as pickups", terms: ["ammo box", "ammunition box", "ammo can"] },
  magazine: { fills: "loose magazines as pickups", terms: ["pistol magazine", "rifle magazine", "ar15 magazine", "glock magazine", "9mm magazine", "stanag magazine", "pmag"] },
  "shotgun-shell": { fills: "loose shotgun shells as pickups", terms: ["shotgun shell", "12 gauge shell"] },
  "flashlight-strap": { fills: "a flashlight strap (a light worn on the shoulder or chest)", terms: ["flashlight holder", "molle flashlight", "shoulder flashlight", "flashlight clip", "right angle flashlight", "chest light", "flashlight holster"] },
  sling: { fills: "a gun sling worn on the body", terms: ["rifle sling", "gun sling"] },
  belt: { fills: "a belt worn on the body", terms: ["tactical belt", "duty belt", "utility belt"] },
  "kitchen-knife": { fills: "the kitchen knife (a proper one)", terms: ["kitchen knife", "chef knife"] },
  "fresh-food": { fills: "fresh food in the canteen fridges", terms: ["apple", "bread loaf", "fruit pack", "vegetables"] },
  "specimen-tank": { fills: "the specimen cells / cryo tanks (props)", terms: ["specimen tank", "cryo tank", "stasis pod", "containment tube"] },
  noisemaker: { fills: "crafted: the noisemaker", terms: ["tin can alarm", "noise maker", "air horn", "tin cans string", "old alarm clock", "bell alarm clock"] },
  barricade: { fills: "crafted: the reinforced barricade", terms: ["wooden barricade", "boarded up door", "boarded window", "barricade planks", "door barricade", "scrap barricade"] },
  "quarantine-cell": { fills: "the quarantine cells", terms: ["quarantine room", "isolation room", "prison cell", "jail cell", "holding cell", "padded cell", "hospital isolation"] },
  "glass-partition": { fills: "breakable glass partitions", terms: ["glass partition", "glass wall panel", "office glass partition", "glass panel wall", "observation window", "glass office wall", "aluminium window frame", "glass door office", "laboratory glass wall", "cleanroom wall", "shower glass panel"] },
  tunnel: { fills: "the far tunnels (old transit tunnels)", terms: ["subway tunnel", "metro tunnel", "railway tunnel", "sewer tunnel", "tunnel modular", "underground tunnel"] },
  shaft: { fills: "the maintenance shaft", terms: ["maintenance shaft", "ventilation shaft", "elevator shaft", "access shaft ladder", "utility tunnel", "service tunnel"] },
  sling: { fills: "a gun sling worn on the body", terms: ["rifle sling", "gun sling", "gun strap", "two point sling", "shoulder strap", "rifle strap", "tactical sling", "weapon sling", "sling strap", "bungee sling"] },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function json(url, headers = {}) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: { ...UA, ...headers } });
    if (r.status === 429) { await sleep(4000 * (i + 1)); continue; }
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json();
  }
  throw new Error("rate limited " + url);
}

// Sketchfab names a licence by its label ("CC Attribution", "CC0 Public Domain").
const OK_LICENCE = { "CC0 Public Domain": "CC0 1.0", "CC Attribution": "CC BY 4.0" };
const licOf = (m) => OK_LICENCE[m.license?.label] ?? OK_LICENCE[m.license?.slug];
async function sketchfab(term) {
  const q = new URLSearchParams({ type: "models", q: term, downloadable: "true", count: "24", sort_by: "-likeCount" });
  const res = await json(`https://api.sketchfab.com/v3/search?${q}`, TOKEN ? { Authorization: `Token ${TOKEN}` } : {});
  return (res.results ?? []).filter((m) => licOf(m)).map((m) => ({
    source: "sketchfab", name: m.name, url: m.viewerUrl ?? `https://sketchfab.com/3d-models/${m.uid}`, uid: m.uid,
    licence: licOf(m), author: `${m.user?.displayName} (@${m.user?.username})`,
    credit: `"${m.name}" (${m.viewerUrl ?? `https://sketchfab.com/3d-models/${m.uid}`}) by ${m.user?.displayName} (https://sketchfab.com/${m.user?.username}) is licensed under ${licOf(m)}${licOf(m) === "CC BY 4.0" ? " (http://creativecommons.org/licenses/by/4.0/)" : ""}.`,
    tris: m.faceCount, likes: m.likeCount, animated: m.animationCount > 0,
    img: (m.thumbnails?.images ?? []).sort((a, b) => Math.abs(a.width - 640) - Math.abs(b.width - 640))[0]?.url,
  }));
}

let PH = null;
async function polyhaven(term) {
  PH ??= await json("https://api.polyhaven.com/assets?t=models");
  const words = term.toLowerCase().split(/\s+/);
  return Object.entries(PH).filter(([id, a]) => {
    const hay = [id, a.name, ...(a.tags ?? []), ...(a.categories ?? [])].join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  }).map(([id, a]) => ({
    source: "polyhaven", name: a.name, url: `https://polyhaven.com/a/${id}`, licence: "CC0 1.0 (Poly Haven, public domain)",
    author: Object.keys(a.authors ?? {}).join(", "), credit: `(optional) "${a.name}" by ${Object.keys(a.authors ?? {}).join(", ")}, Poly Haven (CC0)`,
    tris: a.polycount, img: `https://cdn.polyhaven.com/asset_img/thumbs/${id}.png?width=640`,
  }));
}

const only = process.argv.slice(2);
const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
for (const [id, g] of Object.entries(GAPS)) {
  if (only.length && !only.includes(id)) continue;
  const seen = new Map();
  for (const t of g.terms) {
    for (const c of [...(await polyhaven(t)), ...(await sketchfab(t))]) if (!seen.has(c.url)) seen.set(c.url, { ...c, term: t });
    await sleep(400);
  }
  out[id] = { fills: g.fills, candidates: [...seen.values()] };
  console.log(`${id.padEnd(16)} ${String(seen.size).padStart(3)} candidates  ` + [...seen.values()].slice(0, 4).map((c) => `${c.name.slice(0, 28)} [${c.source === "polyhaven" ? "PH" : c.licence.includes("BY") ? "BY" : "CC0"} ${c.tris ?? "?"}t]`).join(" | "));
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log("wrote", path.relative(ROOT, OUT));
