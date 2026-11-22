// STERLING NOTICES YOU, IN PRIVATE (Josh, Oct 2026: "he notices you, in
// private"). A handful of real moments in a player's life here get a short
// personal note under their door, in his own words (dmVoiced):
//
//   · first_legendary — the first legendary they've ever owned, off the Wheel
//   · streak          — a genuinely rough run: WHEEL_BLANKS blanks in a row on
//                       the Wheel, or SLOTS_DRY dry pulls in a row on the slots
//   · back            — they've come back after AWAY_MS away
//   · friend_death    — somebody they really talk to in DMs died on the Wheel
//
// THE CAPS ARE THE FEATURE. A steward who writes every time something happens
// is a mailing list. So: at most ONE note per person per GAP_MS (72h) across
// every kind; a first legendary is noticed once ever; a streak at most once a
// week; and only at the moment a streak CROSSES its line, not on every spin
// past it. Bot DMs never push, so none of this can reach a phone. The house
// doesn't write to itself (admins are excluded like every other Sterling
// attention) — except through the admin's lever, which exists so Josh can
// read one.
//
// These are REACTIONS to something the player (or their friend) just did, not
// the house's own initiative, so they are not held to the house's hours.
import type { Store } from "./db/store";
import type { Bus } from "./bus";
import type { User } from "./types";

export const NOTICE = {
  GAP_MS: Number(process.env.STERLING_NOTICE_GAP_MS ?? 72 * 3_600_000),
  STREAK_GAP_MS: 7 * 86_400_000,
  AWAY_MS: Number(process.env.STERLING_NOTICE_AWAY_MS ?? 14 * 86_400_000),
  /** 12/32 of the Wheel is blank: seven in a row is about one in a thousand. */
  WHEEL_BLANKS: 7,
  /** ~30% of pulls draw no line at all: six in a row, about one in 1,300. */
  SLOTS_DRY: 6,
  FRIEND_WINDOW_MS: 30 * 86_400_000,
  FRIEND_MIN_MESSAGES: 6,
  FRIENDS_MAX: 3,
  /** A "welcome back" waits until they've had a minute to look around. */
  BACK_DELAY_MS: Number(process.env.STERLING_NOTICE_BACK_DELAY_MS ?? 60_000),
};

export const NOTICE_KINDS = ["first_legendary", "streak", "back", "friend_death"] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];

/** Who the house may write to on its own. */
export function noticeable(u: User | undefined): boolean {
  return !!u && !u.isBot && !u.disabled && !u.deletedAt && !u.locked && !u.isAdmin;
}

type Detail = { emoji?: string; name?: string; days?: number; game?: "wheel" | "slots"; run?: number };

/** The brief: what he'd say if the model were busy, and what the model is
 *  told happened. The model restates it in his voice; the name survives. */
export function noticeBrief(kind: NoticeKind, who: string, d: Detail): { body: string; situation: string; must: string[] } {
  switch (kind) {
    case "first_legendary":
      return {
        body: `${who} — your first legendary${d.emoji ? `, the ${d.emoji}` : ""}. I keep a little ledger of firsts, and you've just written yourself into it. Keep it somewhere safe. — S.`,
        situation: `they just won the first legendary emoji they've ever owned${d.emoji ? ` (${d.emoji})` : ""} on the Wheel; you noticed, and you're quietly pleased for them`,
        must: [who],
      };
    case "streak":
      return d.game === "slots"
        ? {
            body: `${who}, I couldn't help noticing that machine has been unkind to you — ${d.run ?? NOTICE.SLOTS_DRY} pulls without a line. No sermon. Just: the stool beside it is free, and so is the advice. — S.`,
            situation: `they've just pulled the slots ${d.run ?? NOTICE.SLOTS_DRY} times in a row without a single winning line; you noticed, and you're gently checking on them, not selling anything`,
            must: [who],
          }
        : {
            body: `${who}, ${d.run ?? NOTICE.WHEEL_BLANKS} blanks in a row. The Wheel has no memory and no manners, but I have both. It turns again in a moment. — S.`,
            situation: `they've just landed on ${d.run ?? NOTICE.WHEEL_BLANKS} blank wedges in a row on the Wheel; you noticed, and you're checking on them kindly, not selling anything`,
            must: [who],
          };
    case "back":
      return {
        body: `${who}. It's been ${d.days ?? 14} days. I kept your stool warm — figuratively; it's a stool. Welcome back. — S.`,
        situation: `they've just come back to Solace after ${d.days ?? 14} days away; you noticed, and you're glad to see them`,
        must: [who],
      };
    case "friend_death":
      return {
        body: `${who}, I'm sorry about ${d.name ?? "your friend"}. The Wheel took them tonight. There's a wake for forty-eight hours, if you want to sit with them. — S.`,
        situation: `${d.name ?? "a friend"}, somebody they talk to a lot in private messages, just died on the Wheel; you're writing quietly to say you're sorry, and that their grave stays fresh for 48 hours (the wake) in case they want to be there`,
        must: d.name ? [who, d.name] : [who],
      };
  }
}

export interface Noticer {
  /** The admin's lever (and the harness): write one now. `force` skips the
   *  gaps, never the eligibility of a real (non-admin) target. */
  notice(userId: number, kind: NoticeKind, detail?: Detail, force?: boolean): { ok: true } | { ok: false; error: string };
}

export function startNoticing(
  store: Store,
  bus: Bus,
  dm: (userId: number, body: string, situation: string, must: string[]) => void,
  opts: { now?: () => number } = {},
): Noticer {
  const clock = opts.now ?? Date.now;
  const kvNum = (k: string): number => Number(store.kvGet(k) ?? 0);

  const notice = (userId: number, kind: NoticeKind, detail: Detail = {}, force = false): { ok: true } | { ok: false; error: string } => {
    const u = store.getUserById(userId);
    if (!u || u.deletedAt || u.isBot) return { ok: false, error: "no_user" };
    // the lever may write to anybody real; the house on its own, only members
    if (!force && !noticeable(u)) return { ok: false, error: "not_eligible" };
    // Somebody who blocked Sterling gets no unprompted note (Oct 2026 review).
    const bot = store.getUserByUsername("sterling");
    if (!force && bot && store.isBlockedEither(userId, bot.id)) return { ok: false, error: "blocked" };
    const now = clock();
    if (!force) {
      if (now - kvNum(`sterling_notice_at:${userId}`) < NOTICE.GAP_MS) return { ok: false, error: "too_soon" };
      if (kind === "first_legendary" && store.kvGet(`sterling_notice_firstleg:${userId}`)) return { ok: false, error: "already" };
      if (kind === "streak" && now - kvNum(`sterling_notice_streak:${userId}`) < NOTICE.STREAK_GAP_MS) return { ok: false, error: "too_soon" };
    }
    store.kvSet(`sterling_notice_at:${userId}`, String(now));
    if (kind === "first_legendary") store.kvSet(`sterling_notice_firstleg:${userId}`, "1");
    if (kind === "streak") store.kvSet(`sterling_notice_streak:${userId}`, String(now));
    const b = noticeBrief(kind, u.displayName || u.username, detail);
    dm(userId, b.body, b.situation, b.must);
    return { ok: true };
  };

  bus.on("wheel.event", ({ item }) => {
    if (item.kind === "win" && item.tier === "legendary") {
      // the FIRST one they've ever held — this win is already in the collection
      if (store.ownedInTier(item.user.id, "legendary") === 1) {
        notice(item.user.id, "first_legendary", { emoji: item.emoji?.name });
        // the FIRST is the first whether or not the note fit the 72h gap — a
        // re-won legendary later is not "your first" (Oct 2026 review)
        store.kvSet(`sterling_notice_firstleg:${item.user.id}`, "1");
      }
      return;
    }
    if (item.kind !== "death") return;
    const since = clock() - NOTICE.FRIEND_WINDOW_MS;
    const name = item.user.displayName || item.user.username;
    for (const friend of store.dmFriendsOf(item.user.id, since, NOTICE.FRIEND_MIN_MESSAGES, NOTICE.FRIENDS_MAX)) {
      notice(friend, "friend_death", { name });
    }
  });
  // a streak is noticed the moment it CROSSES the line, never on every spin past it
  bus.on("wheel.spin", ({ userId }) => {
    const run = store.statValue(userId, "wheel_blanks");
    if (run === NOTICE.WHEEL_BLANKS) notice(userId, "streak", { game: "wheel", run });
  });
  bus.on("slots.pull", ({ userId }) => {
    const run = store.statValue(userId, "slots_dry");
    if (run === NOTICE.SLOTS_DRY) notice(userId, "streak", { game: "slots", run });
  });
  // AWAY: our own record of when somebody was last here (their first socket
  // and their last close). A session's lastSeenAt can't answer it — the visit
  // that brings them back has already re-stamped it.
  bus.on("presence.change", ({ userId, online }) => {
    const now = clock();
    const key = `sterling_notice_seen:${userId}`;
    const prev = kvNum(key);
    store.kvSet(key, String(now));
    if (!online || !prev || now - prev < NOTICE.AWAY_MS) return;
    const days = Math.floor((now - prev) / 86_400_000);
    const t = setTimeout(() => notice(userId, "back", { days }), NOTICE.BACK_DELAY_MS);
    t.unref?.();
  });

  return { notice };
}
