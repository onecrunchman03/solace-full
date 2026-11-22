// THE POCKETS — what each body on the casino floor is carrying (Oct 2026).
//
// Until players could hand things to each other, a bottle was pure client
// state (client/src/casino/drink.ts says why: worth nothing to anyone, its
// only effect on your own eyes). Giving changes that: a drink dropped on the
// carpet becomes somebody ELSE'S drink, so a client that could drop one it
// never bought would be handing out free drinks and drugs and walking round
// the counter's burn. So the server keeps its own short list, credited by
// the counter (src/routes/shop.ts), by a regular's round and by a pick-up,
// spent by a swig, a drop and a hand-over.
//
// It is a LEDGER OF RECEIPTS, not of truth: the client can always make its
// own list SHORTER (on entering it says what it holds and the server keeps
// the intersection), never longer. Items are worth nothing in silver once
// bought, so the worst a desync does is stop one bottle being handed on.

/** Drink pockets — the gun's holster is a fourth slot and never holds these. */
export const POCKET_SLOTS = 3;
/** A STAR DUST canister holds three huffs (client stardust.ts). */
export const CANISTER_HUFFS = 3;
/** Everything that can sit in a pocket, and therefore be given. */
export const POCKET_ITEMS = new Set(["beer", "wine", "whisky", "champagne", "slorp", "stardust", "ego"]);
/** A pocket is kept this long after its owner's socket goes (a reconnect or
 *  a second tab must not empty it); past that, the next visit starts empty. */
export const POCKET_KEEP_MS = 10 * 60_000;

export interface PocketItem {
  item: string;
  /** Huffs left — meaningful only for "stardust". */
  huffs: number;
}

export class Pockets {
  private m = new Map<number, { items: PocketItem[]; leftAt: number }>();

  private bag(id: number): PocketItem[] {
    let b = this.m.get(id);
    if (!b) this.m.set(id, (b = { items: [], leftAt: 0 }));
    return b.items;
  }

  list(id: number): PocketItem[] {
    return (this.m.get(id)?.items ?? []).map((p) => ({ ...p }));
  }

  /** Is there room for one more of `item`? One canister at a time. */
  canTake(id: number, item: string): boolean {
    if (!POCKET_ITEMS.has(item)) return false;
    const b = this.m.get(id)?.items ?? [];
    if (b.length >= POCKET_SLOTS) return false;
    if (item === "stardust" && b.some((p) => p.item === "stardust")) return false;
    return true;
  }

  add(id: number, item: string, huffs = CANISTER_HUFFS): boolean {
    if (!this.canTake(id, item)) return false;
    this.bag(id).push({ item, huffs: item === "stardust" ? Math.max(1, Math.min(CANISTER_HUFFS, huffs)) : 0 });
    return true;
  }

  /** Take one `item` out (a drop or a hand-over). Null = they don't have one. */
  take(id: number, item: string): PocketItem | null {
    const b = this.m.get(id)?.items;
    if (!b) return null;
    const k = b.findIndex((p) => p.item === item);
    if (k < 0) return null;
    return b.splice(k, 1)[0];
  }

  /** A swig of whatever is in hand: a bottle or a shot is gone, a canister
   *  loses a huff and goes when it's empty. Unknown items are a no-op. */
  spend(id: number, item: string): void {
    const b = this.m.get(id)?.items;
    if (!b) return;
    const k = b.findIndex((p) => p.item === item);
    if (k < 0) return;
    if (item === "stardust" && b[k].huffs > 1) b[k].huffs--;
    else b.splice(k, 1);
  }

  /** On entering: keep only what BOTH sides think is there. A stale pocket
   *  (owner gone past POCKET_KEEP_MS) starts empty. */
  reconcile(id: number, claimed: unknown, now = Date.now()): void {
    const rec = this.m.get(id);
    if (!rec) return;
    if (rec.leftAt && now - rec.leftAt > POCKET_KEEP_MS) {
      this.m.delete(id);
      return;
    }
    rec.leftAt = 0;
    const want = Array.isArray(claimed) ? claimed.filter((c) => typeof c === "string").slice(0, POCKET_SLOTS) : [];
    const kept: PocketItem[] = [];
    const pool = [...rec.items];
    for (const c of want) {
      const k = pool.findIndex((p) => p.item === c);
      if (k >= 0) kept.push(pool.splice(k, 1)[0]);
    }
    rec.items = kept;
  }

  left(id: number, now = Date.now()): void {
    const rec = this.m.get(id);
    if (rec) rec.leftAt = now;
  }

  /** Forget pockets whose owners have been gone a while (a periodic sweep). */
  prune(now = Date.now()): void {
    for (const [id, rec] of this.m) if (rec.leftAt && now - rec.leftAt > POCKET_KEEP_MS) this.m.delete(id);
  }
}

/** The floor's pockets, reachable from the counter's routes. The floor sets
 *  it when it starts; with no floor running, nothing is credited. */
export interface PocketDesk {
  /** "off" = not on the floor (the purchase is just a purchase), "full" =
   *  no room, "ok" = it will land. */
  room(userId: number, item: string): "off" | "full" | "ok";
  credit(userId: number, item: string): boolean;
}
let desk: PocketDesk | null = null;
export const setPocketDesk = (d: PocketDesk | null): void => { desk = d; };
export const pocketDesk = (): PocketDesk | null => desk;
