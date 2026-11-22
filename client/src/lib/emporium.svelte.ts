// Sterling's Emporium client state: the catalog (with live prices + my
// ownership), my equipped cosmetics, and the buy/equip actions. Other
// members' cosmetics arrive on their PublicUser (roster/messages) — this
// module is only for MY shopping.

import { api, ApiError, type Cosmetics, type EmporiumItem } from "./api";
import { session } from "./session.svelte";
import { wallet, atPrice } from "./wallet.svelte";

export const emporium = $state<{
  items: EmporiumItem[];
  cosmetics: Cosmetics;
  loading: boolean;
  busy: boolean;
  error: string | null;
  /** The last purchase, for Sterling's reaction line. */
  lastBought: string | null;
  /** When Sterling restocks the rotating shelf (next UTC midnight, ms). */
  restockAt: number;
  dealPct: number;
}>({
  items: [],
  cosmetics: {},
  loading: true,
  busy: false,
  error: null,
  lastBought: null,
  restockAt: 0,
  dealPct: 20,
});

/** Title item id → display text (for rendering OTHER users' titles cheaply). */
export const TITLE_NAMES: Record<string, string> = {
  "title-highroller": "High Roller",
  "title-gravekeeper": "Gravekeeper",
  "title-mint": "Mint Condition",
  "title-luckycharm": "Lucky Charm",
  "title-grandmaster": "Grandmaster",
  "title-deathdodger": "Death-Dodger",
  "title-tycoon": "Silver Tycoon",
  "title-jester": "Court Jester",
  "title-archivist": "The Archivist",
  "title-pitboss": "Pit Boss",
  "title-unkillable": "The Unkillable",
  "title-loanshark": "Loan Shark",
  "title-oracle": "The Oracle",
  "title-cardcounter": "Card Counter",
  "title-honestliar": "Honest Liar",
  "title-heir": "The Heir",
  // THE VIP ROOM's titles — a ✦ mark is drawn before these (vipMark below).
  "title-vip1-collector": "Collector",
  "title-vip2-connoisseur": "Connoisseur",
  "title-vip3-magnate": "Magnate",
  "title-vip4-complete": "The Complete",
};

/** The tier of a VIP title id (1–4), 0 for an ordinary title. Renderers
 *  draw a tier-coloured ✦ before VIP titles so a Collector's name never
 *  reads like a title anybody could buy. */
/** THE DECK AT THE TABLE (Josh, Sep 2026: "card skins … should be visible
 *  for everyone not just player"): a face-up card wears its owner's deck as
 *  an edge (app.css `.deckface` + `.deck-<name>`), so the table sees whose
 *  deck is in play even when every card is showing. */
export function deckFace(cardback: string | null | undefined): string {
  return cardback ? `deckface ${cardback.replace(/^cardback-/, "deck-")}` : "";
}

export function vipMark(titleId: string | null | undefined): number {
  const m = /-vip(\d)-/.exec(titleId ?? "");
  return m ? Number(m[1]) : 0;
}

export async function loadEmporium(): Promise<void> {
  try {
    const r = await api.emporium();
    emporium.items = r.items;
    emporium.cosmetics = r.cosmetics;
    emporium.restockAt = r.restockAt;
    emporium.dealPct = r.dealPct;
    wallet.coins = r.coins;
  } catch {
    /* shop shows a retry state */
  } finally {
    emporium.loading = false;
  }
}

export function ownsTheme(themeId: string): boolean {
  return emporium.items.some((i) => i.id === `theme-${themeId}` && i.owned);
}

export async function buyItem(itemId: string): Promise<boolean> {
  if (emporium.busy) return false;
  emporium.busy = true;
  emporium.error = null;
  try {
    const shown = emporium.items.find((i) => i.id === itemId)?.price;
    const r = shown == null
      ? await api.emporiumBuy(itemId)
      : await atPrice(shown, (p) => api.emporiumBuy(itemId, p));
    if (!r) { void loadEmporium(); return false; }
    wallet.coins = r.coins;
    emporium.items = emporium.items.map((i) => (i.id === itemId ? { ...i, owned: true } : i));
    emporium.lastBought = itemId;
    return true;
  } catch (e) {
    emporium.error =
      e instanceof ApiError && e.code === "insufficient"
        ? "Not enough silver."
        : e instanceof ApiError && e.code === "already_owned"
          ? "You already own that."
          : e instanceof ApiError && e.code === "not_in_stock"
            ? "Sterling's shelf moved on — check back after the restock."
            : "The purchase failed.";
    return false;
  } finally {
    emporium.busy = false;
  }
}

export async function equip(slot: string, itemId: string | null): Promise<void> {
  if (emporium.busy) return;
  emporium.busy = true;
  emporium.error = null;
  try {
    const r = await api.emporiumEquip(slot, itemId);
    emporium.cosmetics = r.cosmetics;
    if (session.user) session.user = { ...session.user, cosmetics: r.cosmetics };
  } catch {
    emporium.error = "Couldn't equip that.";
  } finally {
    emporium.busy = false;
  }
}

export function resetEmporium(): void {
  emporium.items = [];
  emporium.cosmetics = {};
  emporium.loading = true;
  emporium.busy = false;
  emporium.error = null;
  emporium.lastBought = null;
}
