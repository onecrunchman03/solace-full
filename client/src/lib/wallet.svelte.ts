// Silver-coin wallet + the Emoji Shop / Trader actions. The balance is private
// (never in the roster), so it lives here rather than on `session.user`, loaded
// from the shop endpoint on login.

import { api, ApiError, type Emoji } from "./api";
import { refreshOwned } from "./emoji.svelte";
import { playSfx } from "./sfx";
import { ask } from "./confirm.svelte";

/** A purchase whose price went UP between the tag and the click (a sale or
 *  courtesy ran out) comes back 409 price_changed with the new figure. Ask
 *  once; yes retries at that price, no is a quiet cancel. */
export async function atPrice<T>(shown: number, buy: (expect: number) => Promise<T>): Promise<T | null> {
  try {
    return await buy(shown);
  } catch (e) {
    if (!(e instanceof ApiError) || e.code !== "price_changed") throw e;
    const now = Number(e.data?.price);
    if (!Number.isFinite(now)) throw e;
    const yes = await ask({
      title: "The price changed",
      body: `It's ${now.toLocaleString()} silver now, not ${shown.toLocaleString()}. Buy it anyway?`,
      confirm: "Buy",
    });
    if (!yes) return null;
    return await buy(now);
  }
}

export const wallet = $state<{
  coins: number;
  sellPrices: Record<string, number>;
  spinPrice: number;
  talismanPrice: number;
  talismanBasePrice: number;
  shieldOffer: { kind: "courtesy" | "sale"; pct: number; until: number } | null;
  hasTalisman: boolean;
  /** Pandora's box retired the reaper: the talisman counters are closed. */
  reaperRetired: boolean;
  mythicPrice: number;
  drinkPrices: Record<string, number>;
  slorpPrice: number;
  stardustPrice: number;
  egoPrice: number;
  /** The base drug prices — what a treat for somebody else costs. */
  drugBase: { slorp: number; stardust: number; ego: number };
  gunName: string;
  gunPrice: number;
  clipPrice: number;
  /** Emoji essence — the Forge's material. Private, like coins. */
  essence: number;
  loaded: boolean;
}>({ coins: 0, essence: 0, sellPrices: {}, spinPrice: 500, talismanPrice: 30000, talismanBasePrice: 30000, shieldOffer: null, hasTalisman: false, reaperRetired: false, mythicPrice: 500000, drinkPrices: {}, slorpPrice: 1500, stardustPrice: 2000, egoPrice: 800, drugBase: { slorp: 1500, stardust: 2000, ego: 800 }, gunName: "Casino Gun - Kill everyone", gunPrice: 150000, clipPrice: 50000, loaded: false });

export async function loadWallet(): Promise<void> {
  try {
    const s = await api.shop();
    wallet.coins = s.coins;
    wallet.sellPrices = s.sellPrices;
    wallet.spinPrice = s.spinPrice;
    wallet.talismanPrice = s.talismanPrice;
    wallet.talismanBasePrice = s.talismanBasePrice ?? s.talismanPrice;
    wallet.shieldOffer = s.shieldOffer ?? null;
    wallet.reaperRetired = s.reaperRetired === true;
    wallet.hasTalisman = s.hasTalisman;
    wallet.mythicPrice = s.mythicPrice;
    wallet.drinkPrices = s.drinkPrices ?? {};
    wallet.slorpPrice = s.slorpPrice ?? 1500;
    wallet.stardustPrice = s.stardustPrice ?? 2000;
    wallet.egoPrice = s.egoPrice ?? 800;
    wallet.drugBase = s.drugBase ?? wallet.drugBase;
    wallet.gunName = s.gunName ?? wallet.gunName;
    wallet.gunPrice = s.gunPrice ?? wallet.gunPrice;
    wallet.clipPrice = s.clipPrice ?? wallet.clipPrice;
    wallet.essence = s.essence ?? 0;
    wallet.loaded = true;
  } catch {
    /* best-effort */
  }
}

/** THE FORGE's rate card, loaded with the counter. */
export const forge = $state<{
  meltYield: Record<string, number>;
  upgradeCost: Record<string, number>;
  nextTier: Record<string, string>;
  /** Silver BURNED on the legendary → mythic strike, on top of the essence. */
  mythicToll: number;
  /** Silver BURNED on EVERY strike, keyed by the tier upgraded from (Sep 2026). */
  tolls: Record<string, number>;
  loaded: boolean;
}>({ meltYield: {}, upgradeCost: {}, nextTier: {}, mythicToll: 100000, tolls: {}, loaded: false });

export async function loadForge(): Promise<void> {
  try {
    const f = await api.forge();
    forge.meltYield = f.meltYield;
    forge.upgradeCost = f.upgradeCost;
    forge.nextTier = f.nextTier;
    forge.mythicToll = f.mythicToll;
    forge.tolls = f.tolls ?? {};
    forge.loaded = true;
    wallet.essence = f.essence;
    wallet.coins = f.coins;
  } catch {
    /* best-effort */
  }
}

/** Melt owned emoji into essence (destroys them). */
export async function meltEmoji(codes: string[]): Promise<{ ok: boolean; gained: number; error?: string }> {
  try {
    const r = await api.forgeMelt(codes);
    wallet.essence = r.essence;
    await refreshOwned();
    return { ok: true, gained: r.gained };
  } catch (e) {
    return { ok: false, gained: 0, error: e instanceof ApiError ? e.code : "failed" };
  }
}

/** Raise one owned emoji a tier: consumes it + essence, pays a random unowned of the next tier. */
export async function forgeUpgrade(code: string): Promise<{ ok: boolean; emoji?: Emoji; error?: string }> {
  try {
    const r = await api.forgeUpgrade(code);
    wallet.essence = r.essence;
    wallet.coins = r.coins;
    await refreshOwned();
    return { ok: true, emoji: r.emoji };
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.code : "failed" };
  }
}

/** Buy off Sterling's daily shelves. The silver burns. */
export async function buyFromSterling(codes: string[]): Promise<{ ok: boolean; spent: number; got: Emoji[]; error?: string }> {
  try {
    const r = await api.buyFromSterling(codes);
    wallet.coins = r.coins;
    await refreshOwned();
    return { ok: true, spent: r.spent, got: r.emoji };
  } catch (e) {
    return { ok: false, spent: 0, got: [], error: e instanceof ApiError ? e.code : "failed" };
  }
}

export function resetWallet(): void {
  resetSilverSend();
  wallet.essence = 0;
  forge.loaded = false;
  wallet.coins = 0;
  wallet.sellPrices = {};
  wallet.spinPrice = 500;
  // Fallbacks mirror src/shop.ts — the server's GET /api/shop overwrites them
  // on load, but a pre-load flash must not quote a price nobody charges.
  wallet.talismanPrice = 30000;
  wallet.talismanBasePrice = 30000;
  wallet.shieldOffer = null;
  wallet.hasTalisman = false;
  wallet.mythicPrice = 500000;
  wallet.drinkPrices = {};
  wallet.loaded = false;
}

/** The Trader's buy price for an emoji tier (0 = it won't buy that tier). */
export function sellValue(tier: string): number {
  return wallet.sellPrices[tier] ?? 0;
}

/** Sell emoji to the Trader for silver. Refreshes the owned inventory on success. */
export async function sellEmoji(
  codes: string[],
): Promise<{ ok: boolean; gained?: number; error?: string }> {
  try {
    const r = await api.sellEmoji(codes);
    wallet.coins = r.coins;
    await refreshOwned(); // I no longer own what I sold
    return { ok: true, gained: r.gained };
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.code : "error" };
  }
}

/** Buy the death-shield talisman outright for silver at Sterling's counter.
 *  The coins burn; the shield lands in your inventory. */
export async function buyTalismanSilver(): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await atPrice(wallet.talismanPrice, (p) => api.buyTalismanWithSilver(p));
    if (!r) { await loadWallet(); return { ok: false, error: "cancelled" }; }
    wallet.coins = r.coins;
    wallet.hasTalisman = true;
    // The courtesy is spent by the purchase server-side; mirror that here so
    // the counter doesn't keep advertising a discount that is already gone.
    if (wallet.shieldOffer?.kind === "courtesy") {
      wallet.shieldOffer = null;
      wallet.talismanPrice = wallet.talismanBasePrice;
    }
    playSfx("forge", 0.6); // the shield is struck at the old foundry mint
    await refreshOwned(); // the shield is an emoji — it shows up everywhere
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.code : "error" };
  }
}

/** Sterling's top shelf: burn silver for a random mythic you don't own. */
export async function buyMythic(): Promise<{ ok: boolean; name?: string; error?: string }> {
  try {
    const r = await api.buyMythic();
    wallet.coins = r.coins;
    playSfx("forge", 0.6); // a mythic minted at the counter
    await refreshOwned();
    return { ok: true, name: r.emoji?.name };
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.code : "error" };
  }
}

/** Buy a drink at Sterling's bar. The silver burns; the bottle lands in your
 *  hands on the casino floor (client-side — see casino/drink.ts). */
export async function buyDrink(drink: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await api.buyDrink(drink);
    wallet.coins = r.coins;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.code : "error" };
  }
}

/** Buy a vial of SLORP under Sterling's counter (1,500, burned). The silver
 *  goes here; what it does to you is the casino floor's business entirely. */
export async function buySlorp(): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await api.buySlorp();
    wallet.coins = r.coins;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.code : "error" };
  }
}

/** Buy a STAR DUST canister under Sterling's counter (burned). Three huffs to
 *  a can; what they do to you is the casino floor's business entirely. */
export async function buyStardust(): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await api.buyStardust();
    wallet.coins = r.coins;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.code : "error" };
  }
}

/** Buy one goopy shot of EGO (burned). The swelling that follows is the
 *  casino floor's business entirely. */
export async function buyEgo(): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await api.buyEgo();
    wallet.coins = r.coins;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.code : "error" };
  }
}

/** Buy the Casino Gun (150k, burned — one per person, ever). */
export async function buyGun(): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await api.buyGun();
    wallet.coins = r.coins;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.code : "error" };
  }
}

/** Buy a spare magazine for it (burned; refused without a gun). */
export async function buyGunClip(): Promise<{ ok: boolean; clips?: number; error?: string }> {
  try {
    const r = await api.buyGunClip();
    wallet.coins = r.coins;
    return { ok: true, clips: r.clips };
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.code : "error" };
  }
}

/** Buy extra Wheel spins with silver. Returns the new total spin count on success. */
export async function buySpins(
  count: number,
): Promise<{ ok: boolean; spins?: number; error?: string }> {
  try {
    const r = await api.buySpins(count);
    wallet.coins = r.coins;
    return { ok: true, spins: r.spins };
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.code : "error" };
  }
}

// ---- THE WALLET: silver from one player to another (Oct 2026) ------------
/** Who the send form is pointed at (a profile's "Send silver" sets it), and
 *  the last transfers in and out. */
export const silverSend = $state<{
  to: number | null;
  history: import("./api").WalletTransfer[];
  owesGoblins: boolean;
  maxSend: number;
  loaded: boolean;
}>({ to: null, history: [], owesGoblins: false, maxSend: 1_000_000, loaded: false });

export async function loadTransfers(): Promise<void> {
  try {
    const r = await api.wallet();
    wallet.coins = r.coins;
    silverSend.history = r.transfers;
    silverSend.owesGoblins = r.owesGoblins;
    silverSend.maxSend = r.maxSend;
    silverSend.loaded = true;
  } catch {
    /* best-effort */
  }
}

export async function sendSilver(to: number, amount: number, note: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await api.sendSilver(to, amount, note.trim() || undefined);
    wallet.coins = r.coins;
    playSfx("register", 0.45);
    void loadTransfers();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.code : "error" };
  }
}

export function resetSilverSend(): void {
  silverSend.to = null;
  silverSend.history = [];
  silverSend.loaded = false;
}
