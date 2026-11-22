// SOLACE SURVIVORZ — the simulation's numbers, in one place (SURVIVORZ.md §4, §5, §8, §9).
// Every dial a retune would argue about lives here. A number marked ✱ is the draft's own guess
// where the design gives none; argue it against the harness profile (scripts/survivorz/test-sim.mjs).
import type { SurvivorId, ZombieKind } from "./wire";
import { SUITED, tableOf } from "../cast";
import { skillsOf, type SkillKey } from "../cast/rules";

/** The fixed step. One step is one wire tick (wire.ts TICK_HZ). */
export const STEP_MS = 100;

// ---- the cast (§4) ------------------------------------------------------------------------------
/** A survivor's sixteen skills as the creator set them (cast/rules.ts SKILL_INFO; one left out reads as its base).
 *  The name STATS stays because saved runs point at these tables by it (save.ts). What they've LEARNED since
 *  lives on the survivor (goals.ts Skills); `skill()` reads that. */
export type Stats = Record<SkillKey, number>;
export const STATS: Record<SurvivorId, Stats> = tableOf((c) => skillsOf(c));
/** First aid at this or more makes them a medic (Dale): they keep the medicine and go back for the fallen. */
export const MEDIC_AT = 8;

// ---- moving (§9: walk ~1.4, jog ~3.2, sprint ~5.0) ----------------------------------------------
export const SPEED = { crawl: 0.5, crouch: 0.8, walk: 1.4, jog: 3.2, sprint: 5.0 } as const;
/** Noise in METRES (§8): crouching silent · walking 6 · sprinting 16. A jog is ✱ 10. */
export const MOVE_NOISE = { crouch: 0, walk: 6, jog: 10, sprint: 16 } as const;
/** A fight is LOUD (Oct 28 2026, "they obliterate the zombies"): the thud of a blow carries ~8 m and
 *  brings the rest of the room — the dead come in numbers. ✱ */
export const NOISE_M = { pistol: 50, rifle: 60, swing: 5, hit: 8, scream: 20, box: 5, eat: 2, door: 4 } as const;

// ---- the dead (§9) --------------------------------------------------------------------------------
export interface Kind {
  hp: number;
  /** chase speed, m/s (a runner's is its burst) */
  speed: number;
  /** wander speed */
  amble: number;
  /** sight range in metres (lit), and the cone's half-angle */
  sight: number;
  cone: number;
  /** hearing multiplier on a noise's reach */
  hear: number;
  /** door damage a second (§9: shamblers and runners 1, experiments 2) ✱ scaled ×10 below */
  bang: number;
  /** how much a survivor counts it as a threat */
  threat: number;
}
export const KINDS: Record<ZombieKind, Kind> = {
  shambler: { hp: 100, speed: 1.0, amble: 0.45, sight: 15, cone: 1.05, hear: 1.0, bang: 1, threat: 1 },
  runner: { hp: 80, speed: 4.2, amble: 0.6, sight: 20, cone: 1.05, hear: 1.0, bang: 1, threat: 1.7 },
  crawler: { hp: 60, speed: 0.6, amble: 0.35, sight: 8, cone: 0.9, hear: 0.9, bang: 1, threat: 0.8 },
  experiment: { hp: 180, speed: 3.0, amble: 0.7, sight: 25, cone: 1.2, hear: 1.4, bang: 2, threat: 2.6 },
};
/** §9 gives 1 hp/s against a 300-hp door ("four shamblers through a bare door in ~75 s"). ✱ The
 *  arithmetic needs ~1 a second EACH, so a hit is once a second for `bang` damage × DOOR_HIT_SCALE. */
export const DOOR_HIT_SCALE = 1;
/** A runner bursts for this long, then trots. */
export const RUNNER_BURST_MS = 4000, RUNNER_REST_MS = 3000, RUNNER_TROT = 2.0;
/** The alarm spreads ~15 m (§9). */
export const ALARM_M = 15;
/** Losing you: searches the last spot 20–40 s (§9). */
export const SEARCH_MS: [number, number] = [20_000, 40_000];
/** In the dark a zombie sees this share of its range; a lit torch is seen from TORCH_SEEN. ✱ */
export const DARK_SIGHT = 0.55, TORCH_SEEN = 30, CROUCH_SEEN = 0.6;
/** Within this, a zombie knows you're there whichever way it faces. ✱ */
export const NEAR_SENSE = 2.2;
/** A safe-room door: they bang a while and give up (§9). ✱ */
export const SAFE_BANG_MS = 25_000;

// ---- how many and where (THE BUNKER, docs/survivorz/BUNKER.md) -------------------------------------------
export interface Placement { rooms: string[]; n: number; kinds: "outside" | "experiment" }
/** THE DEAD AT THE START: 20 (Josh, Nov 2 2026: "less zombies lets do 20 to start"), SPREAD OUT through the wings
 *  (Josh, Nov 3 2026, after 100 runs: "spread zombies out" — with most of them round the common room, six strangers
 *  waking alone met them all at once and half the runs were over inside 20 minutes). A few at the breach, one in
 *  the common room, the rest scattered so first contact is gradual. ✱ the split */
export const PLACEMENTS: Placement[] = [
  { rooms: ["vestibule"], n: 3, kinds: "outside" },
  { rooms: ["decon", "equipment"], n: 2, kinds: "outside" },
  { rooms: ["common"], n: 1, kinds: "outside" },
  { rooms: ["pass-n", "pass-w", "pass-e", "hall-n", "hall-w", "hall-e"], n: 3, kinds: "outside" },
  { rooms: ["barracks", "private-a", "private-b", "laundry"], n: 4, kinds: "outside" },
  { rooms: ["mess", "kitchen", "stores", "infirmary", "workshop", "qm"], n: 4, kinds: "outside" },
  { rooms: ["security", "maint", "generator"], n: 3, kinds: "outside" },
];
/** A few of them start LYING on the floor and rise when somebody comes near (fifth round 16) ✱ */
export const LYING_SHARE = 0.2;
/** …and get up when a survivor comes this close (m) ✱ */
export const RISE_M = 4.5;
/** Walkers only (39). */
export const OUTSIDE_MIX: [ZombieKind, number][] = [["shambler", 1]];
/** No doors start locked (the armory and the radio room are their own locks). */
export const START_LOCKED: string[] = [];

/** The 19 bodies of the zombie pack. The bunker's dead are other shelter residents plus outsiders (third
 *  round 7, 18: a mix of the models we have — civilians, workers, military), so every body is in the pool. */
export const EXPERIMENT_BODIES = ["zombie-f05", "zombie-m08", "zombie-m03", "zombie-m05", "zombie-m06", "zombie-m09"];
export const OUTSIDE_BODIES = [
  "zombie-f01", "zombie-f02", "zombie-f03", "zombie-f04", "zombie-f06", "zombie-f07", "zombie-f08", "zombie-f09",
  "zombie-m01", "zombie-m02", "zombie-m04", "zombie-m07", "zombie-m10",
  ...EXPERIMENT_BODIES,
];
/**
 * THE TRICKLE (38, 40): ONE more of the dead every 45–60 s, through the entrance only, while the blast door
 * stands open. No cap (fourth round 23). They come out of the dark at the far end of the tunnel.
 */
export const ARRIVAL = {
  gapMin: 45_000, gapMax: 60_000,
  /** where in the tunnel they appear: this far from its south end (m) ✱ */
  fromEndM: 2,
  /** awake survivors this close hear them come in */
  hearM: 22,
} as const;

/** Never two copies of a face nearer than this (§9). */
export const SAME_FACE_M = 18;

// ---- weapons (§8) ---------------------------------------------------------------------------------------
/** `id` is what goes on the wire as `held`: a prop id (props/props.json) or a gun id (scripts/survivorz/guns.mjs: pistol, hk416, shotgun). */
export interface Melee { id: string; dmg: number; reach: number; windup: number; recover: number; stamina: number; heavy: boolean; sweep: number; wear: number }
export const MELEE: Record<string, Melee> = {
  fists: { id: "fists", dmg: 10, reach: 1.1, windup: 250, recover: 350, stamina: 0.06, heavy: false, sweep: 1, wear: Infinity },
  knife: { id: "chef-knife", dmg: 25, reach: 1.2, windup: 200, recover: 300, stamina: 0.08, heavy: false, sweep: 1, wear: 60 },
  pipe: { id: "lead-pipe", dmg: 30, reach: 1.6, windup: 400, recover: 450, stamina: 0.12, heavy: false, sweep: 1, wear: 80 },
  hammer: { id: "claw-hammer", dmg: 30, reach: 1.3, windup: 400, recover: 400, stamina: 0.11, heavy: false, sweep: 1, wear: 120 },
  crowbar: { id: "crowbar", dmg: 35, reach: 1.6, windup: 450, recover: 450, stamina: 0.13, heavy: false, sweep: 1, wear: 150 },
  axe: { id: "fire-axe-a", dmg: 60, reach: 2.0, windup: 600, recover: 600, stamina: 0.2, heavy: true, sweep: 2, wear: 100 },
};
export interface Gun { id: string; dmg: number; mag: number; reloadMs: number; noise: number; event: string; reloadEvent: string; gap: number; spread0: number }
export const GUNS: Record<string, Gun> = {
  pistol: { id: "pistol", dmg: 35, mag: 15, reloadMs: 2000, noise: NOISE_M.pistol, event: "gun.pistol", reloadEvent: "gun.reload.pistol", gap: 400, spread0: 8 },
  rifle: { id: "hk416", dmg: 45, mag: 30, reloadMs: 2500, noise: NOISE_M.rifle, event: "gun.rifle", reloadEvent: "gun.reload.rifle", gap: 300, spread0: 10 },
};

/**
 * THE FIGHT, IN DIALS (Josh, Oct 28 2026: "the survivors absolutely obliterate the zombies"). Every
 * number the retune was argued on lives here, against the harness's COMBAT PROFILE (fights, kills a
 * fight, grabs, bites, downs, revives, deaths a week) over three seeds × 96 h. ✱ all of them.
 */
export const COMBAT = {
  /** a swing lands: base + per combat point, less scared / winded / tired / badly hurt, more on one caught off guard */
  hitBase: 0.5, hitPerCombat: 0.04, hitFear: 0.25, hitWinded: 0.2, hitTired: 0.1, hitHurt: 0.08, hitCaught: 0.12,
  /** …and finds the head (a shambler's end): base + per combat point, less scared */
  headBase: 0.08, headPerCombat: 0.025, headFear: 0.12, headCaught: 0.07,
  /** an ordinary body blow rocks the dead this long (ms); a head hit and the axe far longer */
  bodyStaggerMs: 350, headStaggerMs: 800,
  /** a body blow knocks a grabbing zombie off this often (a head hit or the axe always) */
  hitBreaksGrab: 0.55,
  /** a zombie's attack is a swipe this share of the time (else it reaches to grab) */
  swipeShare: 0.45,
  /** ducking a swipe: base + per nimble point (+ breath, − fear) */
  duckBase: 0.25, duckPerNimble: 0.03,
  /** shoving off a grab: base + per nimble point + breath − fear. THE DEATH RATE (REVIEW.md decision 1,
   *  Josh 2026-10-31 "whatever you recommend"): 0.3 → 0.45, breakMax 4000 → 3000, feedHaste 0.1 → 0.05,
   *  with half the dead placed (PLACEMENTS) — five of six were dead inside five days, the show over in its
   *  first week. Measured over 8 casts × 5 days: 2.75 of 6 dead, no cast wiped. */
  shoveBase: 0.45, shovePerNimble: 0.035, shoveBreath: 0.1, shoveFear: 0.12,
  /** struggling free of one zombie (ms): a roll in [min, max], less nimble·ms, breath·ms, more fear·ms */
  breakMin: 2000, breakMax: 3000, breakPerNimble: 100, breakBreath: 400, breakFear: 0,
  /** after a bite, they wrench again within [min, max] ms (less nimble·60) */
  rebreakMin: 700, rebreakMax: 2400,
  /** a zombie's attack cooldown, scaled */
  attackCdScale: 1.6,
  /** each zombie feeding on the downed (two at most) runs their bleed-out this much faster */
  feedHaste: 0.05,
};

// ---- the body (§5) ------------------------------------------------------------------------------------
export const HP = 100;
export const DOWN_MS = 60_000;
export const REVIVE_MS = 8000;
export const BLEED_MS = { 1: 10_000, 2: 2000 } as const;
/** An untreated wound clots on its own (Oct 31 2026): a heavy bleed eases to a light one after this long,
 *  a light one stops. It never did, so a bite with no bandage in reach was a death in three minutes, and
 *  bleeding out was the commonest death once the group went about the facility. A bandage still stops it at once. */
export const CLOT_MS = { 1: 120_000, 2: 75_000 } as const;
export const SCRATCH: [number, number] = [5, 10];
export const BITE: [number, number] = [25, 35];
/** CLAWS BLEED, BITES INFECT (third round 16): a bite always infects (no cure: bitten = doomed, 17); a claw
 *  never does. */
export const INFECT = { scratch: 0, bite: 1 } as const;
/** The grab: struggle free in 2–4 s; still held at 3 s it bites, then every 2 s (§8). */
export const GRAB_BITE_MS = 3500, GRAB_REBITE_MS = 2000;
/** On the downed, a zombie bites ~every 2 s and the bleed-out runs this many times faster. */
export const FEED_BITE_MS = 2000, FEED_BLEED = 2;

// ---- needs (§5), in HOURS of the meter ---------------------------------------------------------------------
export const H = 3_600_000;
export const NEEDS = {
  // HUNGER AND THIRST STAY, BUT NEVER BECOME URGENT (31) — a four-hour show; NO SLEEP (46)
  hungryAt: 3, starvingAt: 1e9, mealH: 4,
  thirstyAt: 2.5, dehydratedAt: 1e9, bottleH: 4,
  tiredAt: 1e9, exhaustedAt: 1e9, collapseAt: 1e9, sleepRate: 0,
  floor: 25,   // starvation / thirst never take health below this (§5)
} as const;

// ---- loot ✱ (the facility's food, water, medicine and ammo — §5's ~22 days for six, scaled to the spots) ----
export type Item = "food" | "water" | "bandage" | "medkit" | "ammo" | "ammoR" | "battery" | "knife" | "pipe" | "hammer" | "crowbar" | "axe" | "pistol" | "rifle" | "backpack-small" | "backpack-large" | "part";
export const ITEM_PROP: Record<Item, string> = {
  food: "ration-pack", water: "water-bottle", bandage: "first-aid-kit", medkit: "medical-box", ammo: "ammo-box-pistol", ammoR: "ammo-can",
  battery: "aa-battery", knife: "chef-knife", pipe: "lead-pipe", hammer: "claw-hammer", crowbar: "crowbar", axe: "fire-axe-a",
  pistol: "pistol", rifle: "hk416", "backpack-small": "backpack-small", "backpack-large": "backpack-large", part: "power-box",
};
/** What a container holds, by its spot id (a regex on it) — the first match wins (✱ all of them). Ration
 *  packs and water stack in the stores and the kitchen, a few in rooms (fourth round 32); bandages and med
 *  kits mostly in the infirmary (32); melee weapons in the workshop and stores (33); backpacks in the stores
 *  (fourth round 30). The armory is FIXED_LOOT. "ammo" is 15 pistol rounds, "ammoR" 30 rifle rounds. */
export const LOOT_RULES: [RegExp, [Item, number, number][]][] = [
  [/^armory-/, []],
  [/^infirmary-/, [["bandage", 2, 4], ["medkit", 0, 2]]],
  [/^stores-|^kitchen-|^mess-/, [["food", 1, 4], ["water", 1, 3]]],
  [/^workshop-|^maint-|^equipment-tool/, [["battery", 0, 1]]],
  [/^barracks-|^private-/, [["food", 0, 1], ["water", 0, 1], ["bandage", 0, 1]]],
  [/.*/, [["food", 0, 1], ["water", 0, 1]]],
];
/** Fixed finds: the armory's 2 rifles, 4 pistols and plenty of ammo (34; fourth round 32: plenty, reloading still
 *  matters); the workshop's and stores' melee weapons (33); a couple of backpacks in the stores ✱ */
export const FIXED_LOOT: Record<string, Item[]> = {
  "armory-weapon-rack-1": ["rifle", "ammoR", "ammoR"],
  "armory-weapon-rack-2": ["rifle", "ammoR", "ammoR"],
  "armory-device-lockers": ["pistol", "pistol", "pistol", "pistol"],
  "armory-ammo-can-1": ["ammo", "ammo", "ammo", "ammo", "ammo", "ammo"],
  "armory-ammo-can-2": ["ammo", "ammo", "ammo", "ammo", "ammo", "ammo"],
  "armory-military-crate": ["ammoR", "ammoR", "bandage"],
  "armory-staff-lockers": ["bandage", "medkit"],
  "workshop-workbench-1": ["hammer"],
  "workshop-tool-chest": ["crowbar", "pipe"],
  "workshop-shelving-steel": ["pipe"],
  "maint-tool-chest": ["hammer"],
  "equipment-tool-chest": ["crowbar"],
  "kitchen-steel-counter": ["knife", "knife"],
  "stores-shelving-steel-1": ["axe"],
  "stores-shelving-boxes-1": ["backpack-small"],
  "stores-plastic-crate-1": ["backpack-large"],
  "barracks-backpack-small": ["backpack-small"],
  "infirmary-medicine-cabinet": ["medkit"],
};
/** CARRYING (§8 "What a survivor carries", Josh Oct 28 2026: "make sure they can wear them and utilize
 *  them properly"). Hands, the sling and the holster hold the weapon and the gun (no slot); the belt's
 *  3 quick slots and three coat pockets are BASE_SLOTS ✱; a worn backpack adds its own 6 or 8 (§8). An
 *  item's slots are its count over STACK (§8's stacks: food 2, bandages 3, 60 pistol rounds, 90 rifle
 *  rounds, one water bottle a slot; a med kit one a slot ✱, batteries 4 ✱), and a spare weapon is a slot. */
export type PackId = "backpack-small" | "backpack-large";
export const BASE_SLOTS = 6;
export const PACK_SLOTS: Record<PackId, number> = { "backpack-small": 6, "backpack-large": 8 };
export const STACK = { food: 2, water: 1, bandage: 3, medkit: 1, battery: 4, ammoP: 60, ammoR: 90 } as const;
/** A sealed suit (Rollo's hazmat) carries its AIR PACK on the back (rollo-build.py): a backpack can't go over it ✱ */
export const NO_BACKPACK: ReadonlySet<SurvivorId> = SUITED;
/** A spare melee weapon they keep on them (more go in the box) ✱ */
export const SPARE_MELEE = 1;
/** One battery runs a flashlight ~2 h (§8). */
export const BATTERY_MS = 2 * 3_600_000;

/** Searching a container takes this long. */
export const SEARCH_SPOT_MS: [number, number] = [4000, 9000];

/** What each walks in with: their own melee weapon from their character file and a little food and water, NO
 *  GUNS (15; fourth round 16). */
export const START_KIT: Record<SurvivorId, { melee: string; gun?: string; mag?: number; ammo?: number; bandage: number; medkit: number; food: number; water: number }> =
  tableOf((c) => ({ melee: c.kit.melee, bandage: Math.min(1, c.kit.bandage), medkit: 0, food: 1, water: 1 }));
/** (the old show's shared box: the bunker has none) */
export const START_BOX = { food: 0, water: 0, bandage: 0, medkit: 0, ammo: 0, battery: 0 };

// ---- skills (§7b) -----------------------------------------------------------------------------------
/** The two skills the endings read, from each background (§7b's table). The other ten come in with
 *  the systems that use them. A skill's ceiling is the body stat it belongs to + 3 (thinking, both). */
export const SKILL_START: Record<SurvivorId, Record<SkillKey, number>> = STATS;
/** XP: level L → L+1 costs `perLevel × (L+1)`; what doing the thing pays. Full for a success, half for a
 *  failure, ×1.5 in danger (§7b). Science comes from READING THE RESEARCH (a Lazarus note most of all) and
 *  working the lab; electronics from the terminals. Tuned so a curious reader reaches Science 7 inside the
 *  four weeks (the simulator has to show someone usually gets there, §7b). */
export const SKILL_XP = {
  perLevel: 70, research: 70, lazarus: 170, terminal: 25, unlock: 45, bench: 140,
  /** First aid: a bandage, a med kit or a revive done (Nov 4 2026) */
  treat: 20,
  /** Stealth: each second creeping within SNEAK_NEAR_M of the dead without being hunted */
  sneak: 1,
  /** Mechanics: each second with their hands on the crank */
  crank: 1.5,
  /** Melee: a blow that lands, and a kill */
  meleeHit: 1, meleeKill: 5,
  /** Firearms: a shot that hits */
  shotHit: 3,
  /** Escape: breaking loose from a grab, or pulling one off a friend */
  breakFree: 12,
  /** Scavenging: a spot searched */
  search: 4,
  /** Lockpicking: a lock opened */
  pick: 40,
} as const;
/** the dead count as "near" for Stealth's practice inside this (m) */
export const SNEAK_NEAR_M = 12;

/** WHAT THE SKILLS AND STATS DO (Josh, Nov 4 2026: "lets also add some more skills … what about more body
 *  stats too?"). Every effect is a plain factor that is EXACTLY 1 at a skill of 0 and at endurance 5, so a
 *  character who doesn't have them plays as the show did before. cast/rules.ts SKILL_INFO and STAT_INFO say
 *  the same in words. */
export const SKILL_FX = {
  /** Science: each level takes this share off searching a note, and adds it to a med kit's healing */
  scienceRead: 0.05, scienceHeal: 0.04,
  /** First aid: each level takes this share off a bandage, a med kit and a revive (10 → 0.6, what the old Medic perk gave) */
  firstAid: 0.04,
  /** Stealth: each level takes this share off how far the dead spot them and hear their steps (10 → half) */
  stealth: 0.05,
  /** Mechanics: each level adds this share to a crank, valve or mechanism (10 → 1.5) */
  mechanics: 0.05,
  /** Quick learner: each point above 5 adds this share to the XP they earn (below 5 takes it off, never under half) */
  learnPerQuick: 0.08,
  /** Scavenging: each level is this chance a first search turns up one thing more, and takes this share off a search */
  scavFind: 0.03, scavSearch: 0.045,
  /** Endurance: each point above 5 takes this share off what tires them, and adds it to getting their breath back */
  endurance: 0.06,
  /** Toughness, each point from 5: hunger and thirst, an infection's pace, and what a blow takes */
  toughNeeds: 0.05, toughInfection: 0.04, toughHurt: 0.03,
  /** Strength, each point from 5: a blow's damage, a shove's odds, a crank or heavy door, and pulling a zombie off (ms) */
  strengthHit: 0.05, strengthShove: 0.02, strengthCrank: 0.04, strengthPullMs: 30,
  /** Leadership, each point over 5 of the steadiest leader within 8 m: this share off the others' fear */
  leadNerve: 0.04,
  /** Lockpicking: the least to try, and the time a lock takes at that level (each level past it a share off) */
  lockMin: 4, lockMs: 90_000, lockCut: 0.08,
} as const;
/** Toughness's factor on one knob (1 at toughness 5; tougher is lower). */
export function toughFx(st: { toughness?: number }, k: "toughNeeds" | "toughInfection" | "toughHurt"): number {
  return Math.max(0.5, 1 - SKILL_FX[k] * ((st.toughness ?? 5) - 5));
}
/** Strength's factor on one knob (1 at strength 5; stronger is higher). */
export const strengthFx = (st: { strength?: number }, k: "strengthHit" | "strengthShove" | "strengthCrank"): number =>
  Math.max(0.5, 1 + SKILL_FX[k] * ((st.strength ?? 5) - 5));
/** Endurance's two factors: what tires them, what rests them (both 1 at 5). */
export const tireFx = (st: { endurance?: number }): number => 1 - SKILL_FX.endurance * ((st.endurance ?? 5) - 5);
export const restFx = (st: { endurance?: number }): number => 1 + SKILL_FX.endurance * ((st.endurance ?? 5) - 5);


