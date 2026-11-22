// Slots of Chance state. Server-authoritative: a pull returns the payline
// symbols + outcome + the new balance; the component animates the reels landing
// on them. Pays silver, costs silver — with the escape room's two exceptions
// (E3b): a FREE PULL from a chest's slot pass consumes first, and CHIPS cover
// the cost before silver does. Both are display-only here; the ORDER lives in
// src/slots.ts where the money is.

import { api, type SlotsPull } from "./api";
import { wallet } from "./wallet.svelte";

export const slots = $state<{ cost: number; loaded: boolean; freePulls: number; chips: number }>({
  cost: 25,
  loaded: false,
  freePulls: 0,
  chips: 0,
});

export async function loadSlots(): Promise<void> {
  try {
    const s = await api.slotsStatus();
    slots.cost = s.cost;
    wallet.coins = s.coins; // keep the shared wallet in sync
    slots.freePulls = s.freePulls ?? 0;
    slots.chips = s.chips ?? 0;
    slots.loaded = true;
  } catch {
    /* best-effort */
  }
}

/** `stake` is the cabinet's denomination (the 3D hall's sections); absent =
 *  the base pull, which is all the 2D machine ever plays. */
export async function pullSlots(stake?: number): Promise<SlotsPull | null> {
  const cost = stake ?? slots.cost;
  try {
    const r = await api.slotsPull(stake);
    // The stake leaves your hand the moment the lever drops — but the OUTCOME
    // must not reach the wallet before the reels land (the balance chip would
    // spoil the result). Only the cost debits here, from whatever paid it;
    // the component calls settleSlotsWallet at reveal time.
    if (r.paidWith === "free") slots.freePulls = Math.max(0, slots.freePulls - 1);
    else if (r.paidWith === "chips") slots.chips = Math.max(0, slots.chips - cost);
    else wallet.coins = Math.max(0, wallet.coins - cost);
    return r;
  } catch {
    return null; // insufficient funds surfaces as a 402 → caught here
  }
}

/** Land the server-authoritative post-pull balances (called when the reels
 *  finish — or on unmount if someone walks away mid-spin). */
export function settleSlotsWallet(r: SlotsPull): void {
  wallet.coins = r.coins;
  if (r.freePulls !== undefined) slots.freePulls = r.freePulls;
  if (r.chips !== undefined) slots.chips = r.chips;
}
