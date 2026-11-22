// THE ASYNC GRANT — Foundry's money, Async's budget, the player's wage.
// (Josh, Sep 2026: "lets remove the research credits and have the backrooms
// use silver… foundry inc has R&D programs and research centers that directly
// supply async with it advanced technologies… foundry treats this as a double
// win win they have a casino and also allow the async to use 'pay' its
// patrons to explore the backrooms and bring back research.")
//
// WHY THIS FILE EXISTS AT ALL. Research Credit was a CLOSED currency on
// purpose: minted by selling Voss things, spent only at her counter, never
// convertible. That closure is what made it safe for footage to pay 400 for a
// walk in the dark — the number could not reach the silver economy, so it
// could not inflate it. Point those same payouts at `users.coins` and the
// backrooms becomes a SECOND FAUCET, uncapped by the Wheel, which is the one
// invariant this whole economy rests on.
//
// So silver reaches the backrooms through a FUNDED POOL instead of a mint.
// Async has a research budget. Turn-ins DRAW from it; purchases at
// Threshold-4 RETURN to it. The conserved constant gains one term:
//
//     wallets + escrows + goblin vault + ASYNC GRANT = constant
//
// which is the goblin vault's shape exactly (src/lender.ts), and it is proven.
// Nothing here mints. When the budget runs out Threshold-4 posts FUNDING
// REVIEW PENDING and pays nothing until it refills — a self-regulating economy
// rather than a dial somebody has to keep guessing at.
//
// AND THE CASINO REFILLS IT, which is the lore made arithmetically true. The
// house-edge games (slots, blackjack, roulette, craps) burn 90% of their net
// take and tithe 10% to the nightly lottery. A share of what WOULD HAVE BURNED
// now goes to the grant instead — a redistribution, never a mint, the same
// mechanism `lottery_boosts` has used since July 2026. The patrons losing at
// the tables are literally paying for the expedition, and the expedition is
// what keeps Foundry's R&D ahead of everyone else's. Double win, upstairs.
//
// THE SEED IS A ONE-TIME MINT, like the goblins' capital before it — 250,000
// enters the world exactly once, in migration 99, and never again. That figure
// is not a guess: prod carried 80,318 silver across 16 accounts and burned
// ~4,900/day when this shipped, so the grant is roughly three times the money
// supply — a real budget that will visibly deplete — and the tithe is what
// keeps it alive once it has.

/** Async's opening budget. Enters the world ONCE (migration 99). */
export const GRANT_SEED = 250_000;

/** Share of each house-edge game's NET take routed to the grant instead of
 *  burning. Sits alongside lottery.ts's HOUSE_TITHE (0.1), so the games still
 *  burn the remaining 65% and stay hard sinks — keep the two summing well
 *  under 1.0 or the floor stops being a sink at all. */
export const GRANT_TITHE = 0.25;

/** Below this the counter warns; the copy reads differently but the till
 *  behaves identically — a warning is not a refusal. */
export const GRANT_LOW = 25_000;

export type GrantState = "funded" | "low" | "dry";

export function grantState(balance: number): GrantState {
  if (balance <= 0) return "dry";
  return balance < GRANT_LOW ? "low" : "funded";
}

/** Can the budget cover this turn-in?
 *
 *  ALL OR NOTHING, deliberately. A partial payout reads as a bug and leaves
 *  the player holding a half-sold relic; a clean refusal leaves them holding
 *  the WHOLE relic, which they can bank, auction to another player, or bring
 *  back when Foundry's next disbursement lands. The item is never destroyed
 *  by a budget that couldn't pay for it. */
export function grantCovers(balance: number, price: number): boolean {
  return price > 0 && balance >= price;
}

/** What Async says when it can't pay. Voss does not apologize. */
export function fundingLine(balance: number, price: number): string {
  if (balance <= 0)
    return "Threshold-4 is not purchasing. The account is at zero and the disbursement is not mine to schedule.";
  return `Threshold-4 can release ${balance.toLocaleString()} silver against a ${price.toLocaleString()} valuation. I don't do partial acquisitions. Hold it, or find a private buyer.`;
}
