// CASINO ITEMS — the durable things you can own on the floor (Josh, Aug 2026:
// the gun, and a locker to keep it in). Bottles stay deliberately OUT of this
// file: a drink is client state worth nothing (see client/src/casino/drink.ts),
// but the gun costs 150,000 silver and its rounds are the scarce thing, so both
// live in the DB like every other thing with a price.
//
// THE GUN IS COSMETIC MURDER. Being shot ragdolls you hard and parks you for
// ten seconds before you respawn at the entrance — no tombstone, no estate, no
// wallet movement, nothing the Wake would ever hear about. The only economy in
// this file is the BURN at Sterling's counter (the drink/talisman shape: silver
// leaves the world, nothing mints), which keeps "the Wheel is the sole faucet"
// true with a firearm on the floor.
//
// Item vocabulary (casino_inv.item / casino_locker.item):
//   'gun'  — qty IS THE ROUNDS LOADED (0..9). One gun per person, ever; the
//            row travelling between inv and locker carries its load with it.
//   'clip' — qty = spare magazines, each worth CLIP_ROUNDS on a reload.

/** Sterling's listing, verbatim (Josh): "Casino Gun - Kill everyone". */
export const GUN_NAME = "Casino Gun - Kill everyone";
export const GUN_PRICE = 150_000;
/** A spare magazine. Added so a 150k gun that runs dry isn't a brick forever;
 *  priced by Josh (Aug 2026: "make the spare magazines 50k each not 2k") —
 *  a third of the gun per nine rounds keeps every bullet an occasion, and it
 *  burns like everything at Sterling's counter. */
export const CLIP_PRICE = 50_000;
/** Rounds in a full magazine — the gun ships loaded with one and one spare. */
export const CLIP_ROUNDS = 9;

/** The casino locker (Josh: 50 slots). */
export const LOCKER_SLOTS = 50;

/** How long a shot body lies there before it walks back in at the entrance. */
export const GUN_RESPAWN_MS = 10_000;

/** Floor-relay pacing: the fire animation is ~400ms of slide travel, so a
 *  frame gun can't fire faster than the model can cycle. */
export const SHOT_MIN_MS = 320;
// (The ragdoll's launch power/reach are CLIENT constants — they drive pure
// presentation, so they live with the other throw numbers in
// client/src/casino/gunclips.ts where the layout harness can read them.)

export interface CasinoInvItem {
  item: string;
  qty: number;
}
export interface CasinoLockerItem {
  slot: number;
  item: string;
  qty: number;
}
