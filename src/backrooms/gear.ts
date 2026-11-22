// Voss's manifest — the equipment catalog and its prices (Josh's spec,
// BACKROOMS.md "B3 SPEC LOCKED"). Pure data + tiny helpers; the store owns
// every mutation.
//
// PRICES ARE SILVER since Sep 2026 (Josh: "lets remove the research credits
// and have the backrooms use silver"). They converted from Research Credit
// AT PAR: every ratio inside the backrooms is exactly what it was, nobody's
// balance moved, and there is no multiplier for anyone to argue about. What
// stops that being a second faucet is THE ASYNC GRANT — turn-ins draw from
// a funded budget and purchases return to it. See src/backrooms/grant.ts.

export interface GearDef {
  kind: string;
  name: string;
  price: number; // silver
  maxLevel: number; // 0 = not upgradable
  /** Human line per level, index = level (0 is the base). */
  levels: string[];
  desc: string;
}

export const GEAR: GearDef[] = [
  {
    kind: "flashlight",
    name: "Flashlight",
    price: 50,
    maxLevel: 3,
    levels: ["15 min battery", "20 min battery", "30 min battery", "1 hour battery"],
    desc: "A standard mag light. Left-click on, left-click off.",
  },
  {
    kind: "walkie",
    name: "Walkie Talkie",
    price: 100,
    maxLevel: 3,
    levels: ["7 min battery", "10 min battery", "15 min battery", "20 min battery"],
    // The comma and full stop are KEY NAMES. Written bare they read as a typo
    // in the middle of a sentence ("Hold V to talk; , and . switch channels"),
    // so they are quoted.
    desc: "10 channels. Hold V to talk; the “,” and “.” keys change channel. Battery drains only while transmitting.",
  },
  {
    kind: "camera",
    name: "Camera",
    price: 300,
    maxLevel: 3,
    levels: ["30s of footage", "1 min of footage", "2 min of footage", "3 min of footage"],
    desc: "Film the thing. The closer the shot, the more Voss pays for the tape.",
  },
  {
    kind: "spraycan",
    name: "Spray Can",
    price: 50,
    maxLevel: 3,
    levels: ["90s of paint", "2 min of paint", "3 min of paint", "4 min of paint"],
    desc: "Black by default. Color upgrades recolor the can itself.",
  },
  {
    kind: "backpack",
    name: "Backpack",
    price: 300,
    maxLevel: 0,
    levels: ["9 inventory slots instead of 5"],
    desc: "Not worn on the model — just carried capacity.",
  },
];

/** Single-use field supplies. Consuming deletes the item (server-side). */
export const CONSUMABLES: GearDef[] = [
  {
    kind: "pills",
    name: "Health Pills",
    price: 40,
    maxLevel: 0,
    levels: ["restores 50% health"],
    desc: "Click to swallow with them in hand. Single use.",
  },
  {
    kind: "battery",
    name: "Battery",
    price: 30,
    maxLevel: 0,
    levels: ["full recharge"],
    desc: "Hold a flashlight or walkie, press the battery's slot number to charge it. Single use.",
  },
  {
    kind: "almondwater",
    name: "Almond Water",
    price: 25,
    maxLevel: 0,
    levels: ["full stamina, cures winded"],
    desc: "The classic. Click to drink with it in hand. Single use.",
  },
];

export const ALL_GEAR: GearDef[] = [...GEAR, ...CONSUMABLES];

export const gearByKind = (kind: string): GearDef | undefined => ALL_GEAR.find((g) => g.kind === kind);

/** Upgrade cost by TARGET level (L1 100 / L2 250 / L3 500). */
export const UPGRADE_COST = [0, 100, 250, 500];

/** RETIRED Sep 2026 with the silver switch. Voss paid 50 for a rare and 150
 *  for a legendary, which made her a strictly worse Trader than Sterling
 *  (200 / 2,500) the instant the two currencies became one — a dead counter,
 *  and a second door for emoji to become house money. She buys FINDINGS now,
 *  and nothing else. Left as a tombstone so nobody re-adds an emoji till. */
export const SELL_RETIRED = { rare: 50, legendary: 150 } as const;

export const SUIT_PRICE = 400;
/** Recolors present in the Hazmat PS1 pack (yellow is the kit default). */
export const SUIT_COLORS = ["orange", "blue", "green", "red", "black", "cleaning-crew"];

// Paint colors are FREE (Josh, round 3): pick whichever you like when you
// pack the can — the can is the purchase, the color is a preference. Black
// is in the list so you can always go back to it.
export const SPRAY_COLORS = ["black", "red", "green", "blue", "orange"];
export const SPRAY_COLOR_COST = 0;

export const LOCKER_UPGRADE_COST = 1000;
export const LOCKER_MAX = 40;

/** Relic sell price (duplicate turn-ins at the debrief). Raised 250 → 1000
 *  (Josh, Aug 2026) — a recovered relic is a real payday now. */
export const RELIC_PRICE = 1000;

/** Entity footage — Voss pays by how close you dared to film (tape items,
 *  color = tier): ≤3m / ≤10m / a distant glimpse. */
export const FOOTAGE_PRICE: Record<string, number> = { close: 400, mid: 250, far: 50 };
