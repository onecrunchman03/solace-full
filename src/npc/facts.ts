// THE HOUSE'S BRAINS — what each character is told (Oct 2026).
//
// "The model talks, the server decides." Every number a character may quote
// is computed HERE, from the same functions the counters charge with, and
// handed over as a FACTS block. The model never derives a price.
//
// TWO SCOPES, and the split is the privacy rule:
//   · "public" — a channel. Only what anybody on the floor could already see:
//     the speaker's display name, rank, generation and whether they wear the
//     goblins' public mark; world figures (the pot, the posted prices).
//   · "private" — a DM. Adds the speaker's OWN private state: their purse,
//     their reaper gauge, their loan, their collection. Never anyone else's.
// A channel prompt that contained a purse would be the same leak as
// `/sterling wealth` answering in public, which it has always refused to do.

import type { Store } from "../db/store";
import type { User } from "../types";
import { isFloorNpc, type NpcId } from "./characters";
import { SELL_PRICES, MYTHIC_PRICE, SPIN_PRICE } from "../shop";
import { shieldQuote } from "../routes/shop";
import { lotteryDay } from "../lottery";
import { TALISMAN_CODE, REAPER_GRACE, reaperRate } from "../wheel";
import { effectiveVipRank, VIP_RANK_NAMES } from "../vip";
import { RATES, TIERS, CREDIT_MULTIPLE, maxTierFor, minWorth, quote, dayKey, type Stage } from "../lender";
import { RELIC_PRICE, FOOTAGE_PRICE, ALL_GEAR } from "../backrooms/gear";
import { RETRIEVAL_PCT, BACKROOMS_LEVELS } from "../voss";
import { levelsReachable } from "../backrooms/lore";
import { LEVEL_NAMES as BR_LEVEL_NAMES } from "../backrooms/designs";

export type Scope = "public" | "private";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const pct = (r: number) => `${Math.round(r * 100)}%`;

const LEVEL_NAMES = Array.from({ length: 10 }, (_, i) => `Level ${i}, ${BR_LEVEL_NAMES[i] ?? "unnamed"}`);

/** How the goblins read a customer — drives THE MASK in their sheet. */
const STANDING: Record<Stage, string> = {
  0: "current — paid up, in good standing",
  1: "one day late — marked as a debtor in public",
  2: "two days late — garnished on the collectors' daily visit",
  3: "three days late — repossession has started",
  4: "four days late — frozen: nothing of value may leave their hands",
  5: "in the cells",
};

function levelsOpen(store: Store): number {
  // Voss's own rule (voss.ts levelsOpen): Level 0 always, then each door.
  return levelsReachable((f) => store.brGetFlag(f));
}

function aboutSpeaker(store: Store, u: User): string[] {
  const rank = effectiveVipRank(u);
  const lines = [`- Speaking to you: ${u.displayName || u.username}`];
  if (u.isAdmin) lines.push("- This person is the Operator: they own and run Solace (the house).");
  else if (u.role === "moderator") lines.push("- This person is one of the house's moderators.");
  if (rank > 0) lines.push(`- VIP rank: ${VIP_RANK_NAMES[rank]} (tier ${rank} of 4)`);
  if (u.generation > 1) lines.push(`- Generation ${u.generation}: they have died and come back ${u.generation - 1} time(s).`);
  // The goblins' mark is public by design; the amount is not shown here.
  if (!u.isAdmin) {
    const loan = store.loanOf(u.id);
    if (loan && loan.missed >= 1) lines.push("- They wear the goblins' debtor mark (they've missed a payment).");
  }
  return lines;
}

function privateBasics(store: Store, u: User): string[] {
  const inv = store.getInventory(u.id);
  const byTier: Record<string, number> = {};
  for (const e of inv) byTier[e.tier] = (byTier[e.tier] ?? 0) + 1;
  const tiers = ["common", "rare", "legendary", "mythic"]
    .map((t) => `${byTier[t] ?? 0} ${t}`)
    .join(", ");
  return [
    `- Their silver: ${fmt(store.getCoins(u.id))}`,
    `- Their collection: ${tiers}`,
  ];
}

function reaperLines(store: Store, u: User): string[] {
  if (u.isAdmin) return ["- The reaper cannot touch the Operator (the house can't die)."];
  const shielded = store.ownsEmoji(u.id, TALISMAN_CODE);
  if (shielded) return ["- They carry a talisman (death shield): the reaper's swing is spent on it about half the time the death wedge lands."];
  const bare = store.bareSpins(u.id);
  const left = Math.max(0, REAPER_GRACE - bare);
  return left > 0
    ? [`- No shield. ${left} spins of grace left before the reaper starts watching.`]
    : [`- No shield and OUT of grace: if they land on the death wedge, it fires ${pct(reaperRate(bare, false))} of the time.`];
}

function sterlingFacts(store: Store, u: User, scope: Scope, _text?: string): string[] {
  const info = store.lotteryPotInfo(lotteryDay());
  const sp = store.sterlingActiveSpecial();
  const q = shieldQuote(store, u.id);
  const lines = [
    `- Tonight's lottery pot: ${fmt(info.tickets * 25 + info.boost)} silver.`,
    `- Lottery tickets sold tonight: ${info.tickets}. A ticket costs 25 silver; one per person per night. Drawn at midnight UTC; the winner takes 90% of the pot.`,
    // ONE FIGURE PER LINE, each with its item named beside it: on one line
    // the model swapped the rare price onto a legendary (Oct 2026 eval).
    `- Price Sterling PAYS for one COMMON emoji: ${fmt(SELL_PRICES.common ?? 0)} silver.`,
    `- Price Sterling PAYS for one RARE emoji: ${fmt(SELL_PRICES.rare ?? 0)} silver.`,
    `- Price Sterling PAYS for one LEGENDARY emoji: ${fmt(SELL_PRICES.legendary ?? 0)} silver.`,
    `- Mythics and the talisman: Sterling never buys them.`,
    `- Price of one bonus Wheel spin: ${fmt(SPIN_PRICE)} silver.`,
    `- Price of one mythic at Sterling's counter: ${fmt(MYTHIC_PRICE)} silver.`,
    // A courtesy is a red reaper gauge — private; a public answer quotes the
    // posted price or the house-wide sale only (Oct 2026 review).
    scope === "private" || q.shieldOffer?.kind !== "courtesy"
      ? `- The talisman costs ${fmt(q.talismanPrice)} silver${q.shieldOffer ? ` today (posted ${fmt(q.talismanBasePrice)}; a ${q.shieldOffer.kind === "courtesy" ? "personal courtesy discount" : "house sale"})` : ""}.`
      : `- The talisman costs ${fmt(q.talismanBasePrice)} silver.`,
    sp ? `- A special is running right now: ${sp.kind}.` : "- No special is running right now.",
  ];
  if (scope === "private") lines.push(...privateBasics(store, u), ...reaperLines(store, u));
  return lines;
}

function goblinFacts(store: Store, u: User, scope: Scope): string[] {
  const vault = store.goblinVault().silver;
  const lines = [
    ...TIERS.map((t) => `- Loan window of ${fmt(t)} silver: ${pct(RATES[t])} interest per day.`),
    `- Interest is due once a day. Credit: ${CREDIT_MULTIPLE}x a customer's purse plus what their collection would fetch at the Trader.`,
    `- Your vault holds ${fmt(vault)} silver.`,
  ];
  if (scope === "private" && !u.isAdmin) {
    const purse = store.getCoins(u.id);
    const worth = store.collectionValue(u.id);
    const top = maxTierFor(purse, worth, minWorth(SELL_PRICES.common ?? 0));
    const loan = store.loanOf(u.id);
    const offer = store.goblinOffer(u.id);
    lines.push(`- Their silver: ${fmt(purse)}. Their collection would fetch ${fmt(worth)} at the Trader.`);
    lines.push(top ? `- The largest window you'd open for them: ${fmt(top)}.` : "- They don't qualify for any window yet (not enough to secure it).");
    if (offer) lines.push(`- They hold one of your introductory offers: ${Math.round(offer.off * 100)} points off every rate until ${new Date(offer.until).toUTCString()}.`);
    if (u.jailedAt) {
      lines.push(`- STANDING: ${STANDING[5]}.`);
      if (loan) lines.push(`- Bail: ${fmt(quote(loan.principal, loan.rate, loan.missed).bail)} silver.`);
    } else if (loan) {
      // The counter clears a loan for `settle`: the principal, plus today's
      // interest only if today hasn't been stamped yet (Oct 2026 review —
      // quoting the full payoff overcharged by a day's interest).
      const qt = quote(loan.principal, loan.rate, loan.missed, loan.lastDay < dayKey(Date.now()));
      lines.push(`- STANDING: ${STANDING[qt.stage]}.`);
      lines.push(`- They owe: principal ${fmt(qt.principal)} at ${pct(qt.rate)} a day. Interest at the next visit: ${fmt(qt.interest)}. To clear it today: ${fmt(qt.settle)}.`);
    } else {
      lines.push("- STANDING: owes you nothing. A prospect.");
    }
  } else if (scope === "public") {
    lines.push("- This is a public channel: you never discuss anybody's debt or purse here. Offer to talk in private.");
  }
  if (u.isAdmin) lines.push("- The Operator owns the house; you never lend to the house, and you're very polite about it.");
  return lines;
}

function vossFacts(store: Store, u: User, scope: Scope): string[] {
  const open = levelsOpen(store);
  const grant = store.asyncGrant().silver;
  const lines = [
    `- Layers reachable now: ${open} of ${BACKROOMS_LEVELS} (${LEVEL_NAMES.slice(0, open).join("; ")}). The rest are behind doors nobody has opened.`,
    `- Retrieval rate this quarter: ${RETRIEVAL_PCT}%.`,
    `- Distinct relics anyone has recovered so far: ${store.brRelicsFound()}.`,
    `- You pay for one DUPLICATE relic: ${fmt(RELIC_PRICE)} silver. (A surveyor's first find of a relic goes into their own collection.)`,
    `- You pay for CLOSE footage of an entity: ${fmt(FOOTAGE_PRICE.close)} silver.`,
    `- You pay for MID-RANGE footage of an entity: ${fmt(FOOTAGE_PRICE.mid)} silver.`,
    `- You pay for FAR footage of an entity: ${fmt(FOOTAGE_PRICE.far)} silver.`,
    `- The acquisition account stands at ${fmt(grant)} silver; if it can't cover a finding in full, you buy nothing.`,
    ...ALL_GEAR.map((g) => `- Price of ${g.name} at your counter: ${fmt(g.price)} silver.`),
  ];
  if (scope === "private" && !u.isAdmin) {
    const relic = store.vipProgress(u.id).find((p) => p.tier === "relic");
    if (relic) lines.push(`- Relics this surveyor has unlocked: ${relic.owned} of ${relic.total}.`);
  }
  return lines;
}

/** The FACTS block for one character talking to one person. */
/** THE FLOOR CAST knows what a regular knows: tonight's lottery pot, and
 *  nothing private about anyone else — they're spoken to aloud on an open
 *  floor. (The regulars left the floor in Nov 2026; their characters stay.) */
function rolloFacts(store: Store, _u: User, _scope: Scope): string[] {
  const info = store.lotteryPotInfo(lotteryDay());
  return [`- Tonight's lottery pot: ${fmt(info.tickets * 25 + info.boost)} silver.`];
}

/** `text` is the message being answered, when there is one: it decides which
 *  extra lines are worth their room. */
export function factsFor(store: Store, npc: NpcId, u: User, scope: Scope, text?: string): string {
  const own =
    npc === "sterling" ? sterlingFacts(store, u, scope, text)
    : npc === "goblins" ? goblinFacts(store, u, scope)
    : isFloorNpc(npc) ? rolloFacts(store, u, scope)
    : vossFacts(store, u, scope);
  const now = new Date();
  return [
    `FACTS (true right now; the only numbers you may quote). Scope: ${scope === "private" ? "a PRIVATE message with this person" : "a PUBLIC channel — others are reading"}.`,
    `- Time: ${now.toUTCString()}`,
    ...aboutSpeaker(store, u),
    ...own,
  ].join("\n");
}
