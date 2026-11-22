// THE VIP ROOM (Josh, Sep 2026) — my rank, my progress toward the next
// rope, and the shelves behind the rope. Rank is a HIGH-WATER MARK stamped
// by the server (src/vip.ts); `live` is what the collection says right now,
// which can read lower after a sale. Admins read as rank 4 at the door.
import { api, ApiError, type VipItem, type VipPerks, type VipProgress } from "./api";
import { session } from "./session.svelte";
import { wallet } from "./wallet.svelte";

/** The rank names, index = rank (mirrors VIP_RANK_NAMES on the server). */
export const VIP_RANK_NAMES = ["", "Collector", "Connoisseur", "Magnate", "The Complete"] as const;
/** The metal each shelf is dressed in — the Foundry's ladder. */
export const VIP_METALS = ["", "Copper", "Silver", "Gold", "Mythic"] as const;
export const VIP_TIER_LABEL: Record<string, string> = {
  common: "every common",
  rare: "every rare",
  legendary: "every legendary",
  mythic: "every mythic",
};

export const vip = $state<{
  rank: number;
  live: number;
  max: number;
  progress: VipProgress[];
  /** Relics each rung needs (index = rank). */
  relicNeed: number[];
  items: VipItem[];
  perks: VipPerks | null;
  loaded: boolean;
  busy: boolean;
  error: string | null;
  lastBought: string | null;
}>({
  rank: 0,
  live: 0,
  max: 4,
  progress: [],
  relicNeed: [],
  items: [],
  perks: null,
  loaded: false,
  busy: false,
  error: null,
  lastBought: null,
});

/** The rank the client already knows from the self view (before /api/vip
 *  answers) — the rail and the Shop's tab read this. */
export function myVipRank(): number {
  const u = session.user;
  if (!u) return 0;
  return u.isAdmin ? 4 : (u.vipTier ?? 0);
}

/** The tier digit baked into a VIP item id (`title-vip1-collector` → 1);
 *  0 for anything from the ordinary shelves. */
export function vipTierOfItem(id: string | null | undefined): number {
  const m = /-vip(\d)-/.exec(id ?? "");
  return m ? Number(m[1]) : 0;
}

export async function loadVip(): Promise<void> {
  try {
    const r = await api.vip();
    vip.rank = r.rank;
    vip.live = r.live;
    vip.max = r.max;
    vip.progress = r.progress;
    vip.relicNeed = r.relicNeed ?? [];
    vip.items = r.items;
    vip.perks = r.perks ?? null;
    wallet.coins = r.coins;
    vip.error = null;
  } catch {
    vip.error = "The rope stayed down — couldn't reach the Room.";
  } finally {
    vip.loaded = true;
  }
}

export async function buyVip(itemId: string): Promise<boolean> {
  if (vip.busy) return false;
  vip.busy = true;
  vip.error = null;
  try {
    const r = await api.vipBuy(itemId);
    wallet.coins = r.coins;
    vip.items = vip.items.map((i) => (i.id === itemId ? { ...i, owned: true } : i));
    vip.lastBought = itemId;
    return true;
  } catch (e) {
    const code = e instanceof ApiError ? e.code : "";
    vip.error =
      code === "insufficient" ? "Not enough silver."
      : code === "vip_locked" ? "That shelf is above your rank."
      : code === "already_owned" ? "You already own that."
      : "Sterling shook his head.";
    return false;
  } finally {
    vip.busy = false;
  }
}

/** THE HOUSE PAYS: settle my goblin debt on the Foundry's books (Tier 4,
 *  once a life). */
export async function consolidate(): Promise<{ ok: boolean; error?: string; paid?: number }> {
  if (vip.busy) return { ok: false };
  vip.busy = true;
  try {
    const r = await api.vipConsolidate();
    wallet.coins = r.coins;
    if (vip.perks) vip.perks = { ...vip.perks, consolidation: { used: true, hasLoan: false, eligible: false } };
    return { ok: true, paid: r.paid };
  } catch (e) {
    const code = e instanceof ApiError ? e.code : "";
    return { ok: false, error: code === "already_used" ? "The house has settled for you once this life already." : code === "no_loan" ? "You owe the goblins nothing." : code === "not_in_trouble" ? "The house steps in once you've missed a day — not before." : code === "can_pay" ? "You've got the silver to clear this yourself." : code === "escrow_open" ? "Finish your games first — the house won't pay while your silver is on a table." : "Sterling shook his head." };
  } finally {
    vip.busy = false;
  }
}

export function resetVip(): void {
  vip.rank = 0;
  vip.live = 0;
  vip.progress = [];
  vip.relicNeed = [];
  vip.items = [];
  vip.perks = null;
  vip.loaded = false;
  vip.error = null;
  vip.lastBought = null;
}
