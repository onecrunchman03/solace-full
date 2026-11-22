// THE HOUSE BOTS, told apart. THREE users rows carry isBot now: Sterling (the
// house), the goblins (Concession No. 3) and Dr. Ada Voss (Async Research,
// station Threshold-4). Every avatar site used to pass `isBot` straight
// through and draw Sterling's copper face for any bot, so the goblins' letters
// arrived under his portrait. One rule, here.
//
// SterlING IS THE FALLBACK on purpose: he is the house, and a bot row nobody
// has taught this function about should read as the house rather than as
// somebody's creditor or somebody's researcher.

export type BotKind = false | "sterling" | "goblins" | "voss" | Regular;

/** The casino floor's four AI regulars (src/npc/cast.ts) — bot rows too, each
 *  with their own picture in their own suit (/assets/npc/<id>.webp). */
export type Regular = "rollo" | "duke" | "tasha" | "chase";
export const REGULARS: readonly Regular[] = ["rollo", "duke", "tasha", "chase"];
export const isRegular = (k: BotKind): k is Regular => REGULARS.includes(k as Regular);

export function botKind(u: { isBot?: boolean | null; username?: string | null } | null | undefined): BotKind {
  if (!u?.isBot) return false;
  if (u.username === "goblins") return "goblins";
  if (u.username === "voss") return "voss";
  if (REGULARS.includes(u.username as Regular)) return u.username as Regular;
  return "sterling";
}
