// SURVIVORZ EFFECTS — the kept layers' budgets: what a room may keep, oldest out.
//
// Kept marks, merged gore and wreckage, and severed limbs LAST (Josh, Oct 23: "for the whole show")
// — but a show streams for weeks, and a room the group fights in for days filled without end:
// monotonic GPU memory and, for the limbs (one draw each), monotonic draw calls. So each room keeps
// at most a few chunks / limbs and the OLDEST goes when a new one would pass the budget. A room
// still looks fought-over; it just stops growing.
//
// PURE (no three.js): scripts/checks/test_survivorz_client.mjs drives it.

/** kept chunks per room per decal set (KEPT_CHUNK triangles each, decals.ts) */
export const DECAL_CHUNKS_PER_ROOM = 4;
/** kept chunks per room per material (KEPT_TRIS triangles each, kept.ts — gore and wreckage) */
export const KEPT_CHUNKS_PER_ROOM = 3;
/** severed limbs held as they are, per room (each its own draw, rigid.ts) */
export const LIMBS_PER_ROOM = 12;

/** The items to drop, oldest first, so that once ONE more matching item is added the matching
 *  count is at most `max`. `items` is in age order (oldest first, the order they were pushed). */
export function overBudget<T>(items: readonly T[], same: (t: T) => boolean, max: number): T[] {
  const mine = items.filter(same);
  const extra = mine.length + 1 - Math.max(1, max);
  return extra > 0 ? mine.slice(0, extra) : [];
}

/** The corpses past the budget — the oldest in each room past `perRoom`, then the oldest anywhere
 *  past `total` (newest drawn first). (show/actors.ts hides these: a settled zombie
 *  is a skinned draw, and a room fought in for days filled with them.) */
export function corpsesOverBudget<T extends { room: string; at: number }>(dead: readonly T[], perRoom: number, total: number): T[] {
  const newest = [...dead].sort((x, y) => y.at - x.at);
  const inRoom = new Map<string, number>();
  const over: T[] = [];
  let drawn = 0;
  for (const c of newest) {
    const n = inRoom.get(c.room) ?? 0;
    if (n >= perRoom || drawn >= total) { over.push(c); continue; }
    inRoom.set(c.room, n + 1);
    drawn++;
  }
  return over;
}
