// THE ACHIEVEMENT SYSTEM (Josh, Aug 2026 — the hybrid he picked).
//
// One catalog, two trigger kinds:
//   · "stat"  — a threshold over user_stats or a derived count
//               (store.achievementFacts). Checked lazily and DEBOUNCED off
//               store pokes (every write that can move a needle calls
//               achievementPoke), plus on login and profile views — which
//               makes every stat badge fully RETROACTIVE on ship day.
//   · "event" — awarded at the moment by a hook (award() from the code
//               path that knows: the talisman save, stepping through THE
//               DOOR, first steps into the backrooms).
//
// Rewards NEVER touch the economy (the Wheel stays the sole faucet): the
// hardest badges grant exclusive Emporium cosmetics (award-only items —
// never stocked, never buyable). Sterling announces gold/mythic unlocks in
// #general; the earner gets a targeted toast over their socket.
//
// Adding a badge = one catalog entry (+ one award() call if event-kind).
// No migration, no wire change. Ids are FOREVER — earned rows key off them.

import type { Store } from "./db/store";
import { vipRankOf } from "./vip";
import { PANDORA_KEYS, keyEarned } from "./pandora";
import type { Bus } from "./bus";

export type AchTier = "bronze" | "silver" | "gold" | "mythic";

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  tier: AchTier;
  kind: "stat" | "event";
  /** stat-kind source: "stats:<user_stats key>" or "fact:<achievementFacts key>". */
  stat?: string;
  goal?: number;
  /** Hidden from every profile until earned — the surprise badges. */
  secret?: boolean;
  /** Emporium item granted on unlock (award-only cosmetics). */
  rewardItem?: string;
  /** No longer earnable (its source is gone): stays on the wall for those
   *  who have it, excluded from "every achievement" (the Brass Key). */
  retired?: true;
  /** AT MOST ONE ACCOUNT IN THIS SERVER'S HISTORY CAN HOLD IT — the badge is
   *  live and earnable, but it is a race nobody else can re-run, so it can
   *  never be part of "every achievement" either. Excluded from the Brass
   *  Key for the same reason `retired` is, and for nothing else: it still
   *  grants, still shows on the wall, still fills its bar. */
  unique?: true;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // ---- Bronze: first steps -------------------------------------------------
  { id: "spins-25", name: "Give It a Whirl", desc: "Spin the Wheel 25 times.", tier: "bronze", kind: "stat", stat: "stats:spins", goal: 25 },
  { id: "messages-100", name: "Regular", desc: "Send 100 messages.", tier: "bronze", kind: "stat", stat: "fact:messages", goal: 100 },
  { id: "emoji-25", name: "Shoebox Collector", desc: "Own 25 emoji.", tier: "bronze", kind: "stat", stat: "fact:ownedEmoji", goal: 25 },
  { id: "pulls-50", name: "Lever Puller", desc: "Pull the slots 50 times.", tier: "bronze", kind: "stat", stat: "stats:slots_pulls", goal: 50 },
  { id: "gambled-1k", name: "First Chips", desc: "Wager 1,000 silver on the floor.", tier: "bronze", kind: "stat", stat: "stats:gambled", goal: 1000 },
  { id: "br-first", name: "Past the Threshold", desc: "Step into the Backrooms.", tier: "bronze", kind: "event" },
  { id: "br-death", name: "No-Clipped Out", desc: "Die in the Backrooms.", tier: "bronze", kind: "stat", stat: "fact:brDeaths", goal: 1 },
  // ---- The federation wave (Sep 2026): reasons to keep visiting the hub ----
  { id: "sold-10", name: "First Sale", desc: "Sell 10 emoji to Sterling.", tier: "bronze", kind: "stat", stat: "stats:emoji_sold", goal: 10 },
  { id: "trade-1", name: "Fair Exchange", desc: "Settle a direct trade.", tier: "bronze", kind: "stat", stat: "stats:trades_done", goal: 1 },
  { id: "auction-won-1", name: "Going Once", desc: "Win an auction.", tier: "bronze", kind: "stat", stat: "stats:auctions_won", goal: 1 },
  { id: "loans-3", name: "Regular Customer", desc: "Take three loans from the goblins.", tier: "bronze", kind: "stat", stat: "stats:loans_taken", goal: 3 },

  // ---- Silver: the habit --------------------------------------------------
  { id: "spins-100", name: "Wheel Devotee", desc: "Spin the Wheel 100 times.", tier: "silver", kind: "stat", stat: "stats:spins", goal: 100 },
  { id: "messages-1k", name: "Voice of the House", desc: "Send 1,000 messages.", tier: "silver", kind: "stat", stat: "fact:messages", goal: 1000 },
  { id: "emoji-100", name: "Curator", desc: "Own 100 emoji.", tier: "silver", kind: "stat", stat: "fact:ownedEmoji", goal: 100 },
  { id: "legendary-10", name: "Gilded Shelf", desc: "Own 10 legendary emoji.", tier: "silver", kind: "stat", stat: "fact:legendaries", goal: 10 },
  { id: "bj-100", name: "House Regular", desc: "Play 100 blackjack hands.", tier: "silver", kind: "stat", stat: "stats:bj_hands", goal: 100 },
  { id: "gambled-10k", name: "High Roller", desc: "Wager 10,000 silver on the floor.", tier: "silver", kind: "stat", stat: "stats:gambled", goal: 10_000 },
  { id: "relic-1", name: "Relic Hunter", desc: "Bring a relic home from the Backrooms.", tier: "silver", kind: "stat", stat: "fact:relics", goal: 1 },
  { id: "pools-first", name: "Through the Door", desc: "Set foot in THE POOLROOMS.", tier: "silver", kind: "event" },
  { id: "cheated-death", name: "Cheated Death", desc: "Survive the death slot with a talisman.", tier: "silver", kind: "event" },
  // ---- The federation wave (Sep 2026) ----
  { id: "sold-250", name: "Sterling's Favorite", desc: "Sell 250 emoji to Sterling.", tier: "silver", kind: "stat", stat: "stats:emoji_sold", goal: 250 },
  { id: "trades-10", name: "Merchant", desc: "Settle 10 direct trades.", tier: "silver", kind: "stat", stat: "stats:trades_done", goal: 10 },
  { id: "wardrobe-10", name: "Dressed for the Floor", desc: "Own 10 Emporium cosmetics.", tier: "silver", kind: "stat", stat: "fact:itemsOwned", goal: 10 },
  { id: "jukebox-10", name: "House DJ", desc: "Put 10 records on the jukebox.", tier: "silver", kind: "stat", stat: "stats:jukebox_picks", goal: 10 },
  { id: "roulette-350", name: "Straight to the Point", desc: "Win 350 silver on one roulette spin.", tier: "silver", kind: "stat", stat: "stats:roulette_best", goal: 350 },
  { id: "craps-500", name: "Dice Fever", desc: "Win 500 silver on one craps roll.", tier: "silver", kind: "stat", stat: "stats:craps_best", goal: 500 },
  { id: "holdem-1k", name: "Big Pot", desc: "Drag a 1,000-silver pot at Hold'em.", tier: "silver", kind: "stat", stat: "stats:holdem_best", goal: 1000 },
  { id: "derby-500", name: "Winner's Circle", desc: "Collect 500 silver on one Derby ticket.", tier: "silver", kind: "stat", stat: "stats:derby_best", goal: 500 },
  { id: "chess-5", name: "Duelist", desc: "Win 5 Chess Duels.", tier: "silver", kind: "stat", stat: "stats:chess_wins", goal: 5 },
  { id: "pit-5", name: "Bone Collector", desc: "Take 5 Bone Pit pots.", tier: "silver", kind: "stat", stat: "stats:pit_wins", goal: 5 },
  { id: "debt-free", name: "Paid in Full", desc: "Pay off a goblin loan, every last coin.", tier: "silver", kind: "stat", stat: "stats:loans_repaid", goal: 1 },
  // ---- The goblins' round (Sep 2026): the bank became a place ----
  { id: "bail-1", name: "Bondsman", desc: "Pay somebody's bail — alone or as part of a pot.", tier: "silver", kind: "stat", stat: "stats:bails_paid", goal: 1 },
  { id: "walked-out", name: "Walked Out", desc: "Leave the goblins' cell on somebody else's silver.", tier: "bronze", kind: "event", secret: true },
  { id: "bought-back", name: "Bought Back", desc: "Buy your own repossessed emoji off the goblins' shelf.", tier: "silver", kind: "event", secret: true },
  // ---- THE FOUNDRY EXCHANGE (Sep 2026) — RETIRED with the desk, Nov 2026.
  // Secret + retired, the Pit crown's shape: whoever earned one keeps it,
  // nobody else is shown a bar that can never fill.
  { id: "trade-desk-1", name: "Opening Bell", desc: "Opened a position on the Foundry Exchange, back when it was open.", tier: "bronze", kind: "stat", stat: "stats:trades_made", goal: 1, secret: true, retired: true },
  { id: "trade-desk-100", name: "Day Trader", desc: "Opened 100 positions on the Foundry Exchange.", tier: "silver", kind: "stat", stat: "stats:trades_made", goal: 100, secret: true, retired: true },
  { id: "contract-1", name: "Right to Buy", desc: "Bought an option on the Foundry Exchange.", tier: "bronze", kind: "stat", stat: "stats:options_bought", goal: 1, secret: true, retired: true },
  { id: "liquidated-1", name: "Carried Out", desc: "Have a position closed for you by the desk.", tier: "bronze", kind: "stat", stat: "stats:liquidations", goal: 1, secret: true, retired: true },
  { id: "trade-big", name: "Called It", desc: "Cleared 10,000 silver on a single Foundry Exchange trade.", tier: "gold", kind: "stat", stat: "stats:exchange_best", goal: 10_000, secret: true, retired: true },
  { id: "chests-25", name: "Finders Keepers", desc: "Open 25 chests in the Escape Room.", tier: "silver", kind: "stat", stat: "stats:chests_opened", goal: 25 },
  { id: "gator-death", name: "Death Roll", desc: "Be taken by an alligator.", tier: "silver", kind: "stat", stat: "fact:gatorDeaths", goal: 1, secret: true },
  { id: "shyguy-death", name: "You Shouldn't Have Looked", desc: "Be taken by the Shy Guy.", tier: "silver", kind: "stat", stat: "fact:shyguyDeaths", goal: 1, secret: true },
  { id: "casino-kill", name: "Pistols at Dawn", desc: "Down somebody on the casino floor.", tier: "silver", kind: "stat", stat: "stats:casino_kills", goal: 1, secret: true },

  // ---- Gold: the stories --------------------------------------------------
  { id: "emoji-300", name: "Grand Curator", desc: "Own 300 emoji.", tier: "gold", kind: "stat", stat: "fact:ownedEmoji", goal: 300 },
  { id: "mythic-1", name: "An Impossible Thing", desc: "Own a mythic emoji.", tier: "gold", kind: "stat", stat: "fact:mythics", goal: 1 },
  { id: "spins-500", name: "Fortune's Favorite", desc: "Spin the Wheel 500 times.", tier: "gold", kind: "stat", stat: "stats:spins", goal: 500 },
  { id: "gambled-100k", name: "The Whale", desc: "Wager 100,000 silver on the floor.", tier: "gold", kind: "stat", stat: "stats:gambled", goal: 100_000 },
  { id: "jackpot", name: "Jackpot", desc: "Hit the crown jackpot on the slots.", tier: "gold", kind: "stat", stat: "stats:slots_best", goal: 250 },
  { id: "relic-5", name: "Seasoned Salvager", desc: "Recover 5 different relics.", tier: "gold", kind: "stat", stat: "fact:relics", goal: 5 },
  // RETIRED (Aug 2026): the Pit's weekly mythic crown is gone, so these two
  // are unearnable from here. Kept — and made secret — because the crowns
  // behind them were really won: a holder keeps the badge and the title,
  // and nobody else is shown a bar that can never fill.
  { id: "crown-1", name: "Crowned", desc: "Won the Bone Pit's weekly crown, back when it was still awarded.", tier: "gold", kind: "stat", stat: "fact:crowns", goal: 1, secret: true, retired: true },
  // UNIQUE, not retired: `backrooms_flags` holds ONE row per flag stamped
  // with ONE opener's userId (store.brSetFlag), and the door refuses a second
  // opening — so exactly one account can ever hold this. Without the flag the
  // Brass Key, and therefore Pandora's Box, would be unreachable by everyone
  // else alive. Found in the Sep 2026 review round.
  { id: "door-opener", name: "The Door Opener", desc: "Open THE DOOR for the whole community.", tier: "gold", kind: "stat", stat: "fact:openedDoor", goal: 1, unique: true },
  { id: "drowned", name: "Taken by the Deep", desc: "Drown in the Backrooms' deep water.", tier: "gold", kind: "stat", stat: "fact:drowned", goal: 1, secret: true },
  // THE STERLING SPECIAL (Josh, Aug 2026): drunk, tripping, gassed and swollen
  // AT ONCE, detected server-side off the casino floor's own relay state
  // (floor.ts — every input already rides the wire). Sterling slides a note
  // under the earner's door the moment it lands (sterling.ts).
  { id: "pharmacist", name: "The Pharmacist", desc: "Be drunk, tripping, gassed and swollen — all at once.", tier: "gold", kind: "event", secret: true },
  // ---- The federation wave (Sep 2026) ----
  { id: "pulls-500", name: "Machine Whisperer", desc: "Pull the slots 500 times.", tier: "gold", kind: "stat", stat: "stats:slots_pulls", goal: 500 },
  { id: "auctions-won-10", name: "The Hammer", desc: "Win 10 auctions.", tier: "gold", kind: "stat", stat: "stats:auctions_won", goal: 10 },
  { id: "lottery-1", name: "Midnight Miracle", desc: "Win the Nightly Draw.", tier: "gold", kind: "stat", stat: "stats:lottery_wins", goal: 1 },
  { id: "raise-1", name: "Good Samaritan", desc: "Raise a friend from the grave.", tier: "gold", kind: "stat", stat: "stats:raises", goal: 1 },
  { id: "gen-2", name: "Born Again", desc: "Live a second generation.", tier: "gold", kind: "stat", stat: "fact:generation", goal: 2 },
  // ---- The goblins' round (Sep 2026) ----
  { id: "bails-5", name: "The Bondsman", desc: "Pay five bails.", tier: "gold", kind: "stat", stat: "stats:bails_paid", goal: 5 },
  { id: "borrowed-million", name: "A Million on Credit", desc: "Take the goblins' million-silver window.", tier: "gold", kind: "event" },

  // ---- Mythic: the legends (exclusive cosmetics ride these) ---------------
  { id: "emoji-700", name: "The Archive", desc: "Own 700 emoji.", tier: "mythic", kind: "stat", stat: "fact:ownedEmoji", goal: 700, rewardItem: "title-thearchive" },
  { id: "gambled-1m", name: "The Institution", desc: "Wager 1,000,000 silver on the floor.", tier: "mythic", kind: "stat", stat: "stats:gambled", goal: 1_000_000, rewardItem: "border-midas" },
  { id: "crown-3", name: "Dynasty", desc: "Won the Bone Pit crown three times, back when it was still awarded.", tier: "mythic", kind: "stat", stat: "fact:crowns", goal: 3, rewardItem: "title-dynast", secret: true, retired: true },
];

/** The badges a member can still earn — what "every achievement" means
 *  for PANDORA'S BOX's Brass Key. */
/** The badges "every achievement" means: everything a living member can still
 *  go and earn. Retired ones have no source left; unique ones were a race that
 *  ran once. Neither may gate the Brass Key. */
export const earnableAchievementIds = (goblinsGone = false): string[] =>
  ACHIEVEMENTS.filter((a) => !a.retired && !a.unique && !(goblinsGone && GOBLIN_BADGES.has(a.id))).map((a) => a.id);

/** The goblins' six badges (PANDORA.md): once the box destroys Goblin
 *  Lenders there are no cells to bail anyone out of and no goblins to borrow
 *  from, so they retire for the Brass Key's count. Earners keep them. */
export const GOBLIN_BADGES: ReadonlySet<string> = new Set(["loans-3", "bail-1", "bails-5", "borrowed-million", "walked-out", "bought-back"]);

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

let store: Store;
let bus: Bus;

/** Debounce: pokes arrive per pull / per message — coalesce, then run the
 *  full check once. The check is a dozen indexed counts; at friend scale
 *  this is pennies, and it keeps every badge honest with zero bookkeeping. */
const pending = new Set<number>();
let flushTimer: NodeJS.Timeout | null = null;

/** THE HOUSE DOESN'T COMPETE (Josh, same rule as the leaderboards): admins
 *  and the bot never earn, show, or announce badges. */
function excluded(userId: number): boolean {
  const u = store.getUserById(userId);
  // A deleted account earns nothing: viewing one's profile re-granted the
  // Pandora keys its scrub had removed, and Sterling DMed "deleted user"
  // (Oct 2026 review).
  return !u || u.isAdmin || u.isBot || u.deletedAt != null;
}

export function initAchievements(s: Store, b: Bus): void {
  store = s;
  bus = b;
  // One-time hygiene: purge anything the house earned before the exclusion
  // existed (the operator's test badges were already on the board).
  try {
    s.purgeHouseAchievements();
  } catch {
    /* never block boot */
  }
  s.onAchievementPoke((userId) => {
    pending.add(userId);
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        const ids = [...pending];
        pending.clear();
        for (const id of ids) {
          try {
            checkStats(id); // runs checkVip first
          } catch {
            /* a broken check must never take a request down */
          }
        }
      }, 4000);
      flushTimer.unref?.();
    }
  });
}

/** THE VIP ROOM's rank check (src/vip.ts): the collection's complete tiers
 *  become a high-water mark on the user row. Rides the same poke as the
 *  badges because addEmoji is the poke that matters; also run on login and
 *  profile views through checkStats' callers. Admins/bots hold no mark —
 *  the door reads an admin as Tier 4 without one. */
export function checkVip(userId: number): void {
  if (!store) return;
  const u = store.getUserById(userId);
  if (!u || u.isAdmin || u.isBot || u.deletedAt != null) return;
  const rank = vipRankOf(store.vipProgress(userId));
  if (rank <= u.vipTier) return;
  if (store.raiseVipTier(userId, rank)) bus?.emit("vip.rank", { userId, rank });
}

/** PANDORA'S BOX (PANDORA.md): the three keys, each a high-water mark
 *  judged by src/pandora.ts over facts the store gathers. Rides the same
 *  pokes as the badges, plus login and profile views — retroactive by
 *  construction. Runs AFTER the badge and VIP checks so the badge that
 *  completes the wall and the rank that completes the ladder hand over
 *  their key in the same pass. The house holds no key. */
export function checkPandora(userId: number): void {
  if (!store || excluded(userId)) return;
  const held = new Set(store.pandoraKeys(userId).map((k) => k.key));
  const missing = PANDORA_KEYS.filter((k) => !held.has(k));
  if (!missing.length) return;
  const facts = store.pandoraFacts(userId, earnableAchievementIds(store.foundryLending()));
  for (const key of missing) {
    if (keyEarned(key, facts) && store.grantPandoraKey(userId, key)) bus?.emit("pandora.key", { userId, key });
  }
}

/** Evaluate every stat-kind badge for one user, granting what's earned.
 *  Safe to call any time (login, profile view) — grants are idempotent. */
export function checkStats(userId: number): void {
  checkVip(userId);
  if (!store || excluded(userId)) return;
  const earned = new Set(store.earnedAchievements(userId).map((r) => r.achId));
  const needed = ACHIEVEMENTS.filter((a) => a.kind === "stat" && !earned.has(a.id));
  const stats = needed.length ? store.statsOf(userId) : {};
  const facts = needed.length ? store.achievementFacts(userId) : null;
  for (const def of needed) {
    const cur = statValue(def, stats, facts ?? {});
    if (cur >= (def.goal ?? Infinity)) grant(userId, def);
  }
  checkPandora(userId);
}

function grant(userId: number, def: AchievementDef): void {
  grantOnce(userId, def);
}

/** The grant itself; true only the first time (that's the toast). */
function grantOnce(userId: number, def: AchievementDef): boolean {
  if (!store.grantAchievement(userId, def.id)) return false; // already had it
  if (def.rewardItem) store.grantItemFree(userId, def.rewardItem);
  bus?.emit("achievement.earned", {
    userId,
    achId: def.id,
    name: def.name,
    desc: def.desc,
    tier: def.tier,
    rewardItem: def.rewardItem ?? null,
  });
  return true;
}

/** Event-kind awards land outside checkStats, so the badge that completes
 *  the wall through award() must also hand over the Brass Key. */
export function award(userId: number, achId: string): void {
  if (!store || excluded(userId)) return;
  const def = BY_ID.get(achId);
  if (def && grantOnce(userId, def)) checkPandora(userId);
}

function statValue(def: AchievementDef, stats: Record<string, number>, facts: Record<string, number>): number {
  if (!def.stat) return 0;
  const [src, key] = def.stat.split(":");
  return src === "stats" ? (stats[key] ?? 0) : (facts as Record<string, number>)[key] ?? 0;
}

/** The resolved list a profile shows. Earned badges carry their date;
 *  locked stat badges carry live progress; unearned SECRETS are absent. */
export function resolveAchievements(
  userId: number,
): { id: string; name: string; desc: string; tier: AchTier; earnedAt: number | null; cur?: number; goal?: number }[] {
  if (!store || excluded(userId)) return []; // the house shows no badge wall
  const earned = new Map(store.earnedAchievements(userId).map((r) => [r.achId, r.earnedAt]));
  const stats = store.statsOf(userId);
  const facts = store.achievementFacts(userId);
  const out: { id: string; name: string; desc: string; tier: AchTier; earnedAt: number | null; cur?: number; goal?: number }[] = [];
  for (const def of ACHIEVEMENTS) {
    const at = earned.get(def.id) ?? null;
    if (!at && def.secret) continue; // secrets stay secret
    if (at !== null) {
      out.push({ id: def.id, name: def.name, desc: def.desc, tier: def.tier, earnedAt: at });
    } else if (def.kind === "stat") {
      out.push({
        id: def.id,
        name: def.name,
        desc: def.desc,
        tier: def.tier,
        earnedAt: null,
        cur: Math.min(statValue(def, stats, facts), def.goal ?? 0),
        goal: def.goal,
      });
    } else {
      out.push({ id: def.id, name: def.name, desc: def.desc, tier: def.tier, earnedAt: null });
    }
  }
  return out;
}
