// The Emoji Shop / Trader — the coin faucet and the first sink.
//
// Silver coins enter the economy ONLY here (sell emoji → coins) and one thing
// you can spend them on lives here too (buy extra Wheel spins). Because emoji
// come only from Wheel spins, the coin supply is bounded by the free-spin rate.

/**
 * What the Trader pays (in silver) for an emoji of each tier. Tiers absent from
 * this table are NOT sellable and move only via player trade: the talisman (your
 * death shield), any "special", and — since Phase 14 — **mythics**, which are
 * prestige trophies, deliberately unsellable so no mythic source can become
 * a backdoor coin faucet (the Wheel stays the sole faucet). Mirrors the
 * leaderboard rarity weights (common 1 / rare 3 / legendary 10) ×10.
 */
// RAISED ×5 / ×6.7 / ×25 by Josh, Sep 2026 ("legendaries should sell for
// 2.5k each, rares sell for 200 each, and commons for 50 each") — the shelf
// and the Forge's tolls moved with it. A spin's expected sell-yield is
// ~100 silver against the 500-silver SPIN_PRICE, so the spin is still not an
// ROI. (An earlier note here said "~80 against 100" — it predated the review
// round that corrected the yield AND raised the spin to 500; both numbers
// were stale, which is why the loop looked break-even for one round.)
export const SELL_PRICES: Record<string, number> = {
  common: 50,
  rare: 200,
  legendary: 2_500,
};

/** What he BUYS is burned at the counter. What he SELLS is a fixed daily
 *  spread, the same for everyone — see src/shelf.ts (the sell-back-at-double
 *  shelf of migration 89 was a mythic faucet through the Forge). */

/** Silver cost of one extra Wheel-of-Fortune spin (the anchor price). */
/**
 * A bought Wheel spin. RAISED 100 -> 500 in the Sep 2026 review round, and the
 * reason is arithmetic rather than taste.
 *
 * Everything a spin PAYS went up in the price round (a common 10 -> 50, a rare
 * 30 -> 200, a legendary 100 -> 2,500) and this number did not, so the margin
 * that made buying spins a sink quietly went to zero: a spin's expected
 * sell-yield is ~100.5 silver once the legendary slot's near-miss rare and the
 * mystery box's free spins are counted (the old ~80 estimate dropped both).
 * At 100 a spin, the buy-spin -> sell-the-win -> buy-spin loop was EV-neutral,
 * which breaks the one doctrine this economy has: the coin supply is bounded
 * by the FREE spin rate, and the price is what stops a bought spin escaping it.
 *
 * 500 is the same multiple the commons got (x5), so in real terms a spin costs
 * exactly what it always did — ten commons — and the loop is an ~80% loss
 * again, near the ~89% it carried before the raise. The collector is unchanged
 * (they were never selling the win); only the farmer is priced out.
 *
 * If the boards ever show spins going unbought, this is still the first dial.
 */
export const SPIN_PRICE = 500;

/** Sanity clamp on a single spin purchase. */
export const MAX_BUY_SPINS = 50;

/** Silver price of the death-shield talisman at Sterling's counter. A pure
 *  sink: the coins burn and the talisman is unsellable, so this mints nothing
 *  — it only gives silver a second thing worth hoarding for. The
 *  Wheelwright's mythic sacrifice remains the other way in.
 *
 *  THE PRICE HAS BEEN SET TWICE, FOR TWO DIFFERENT PRODUCTS.
 *
 *  5,000 -> 100,000 (Josh, Aug 2026): at five thousand the shield was roughly
 *  two evenings of selling commons, which made the Wheel's 1%-a-spin death a
 *  subscription rather than a risk. Correct at the time — under the flat fire
 *  rate a talisman was NEAR-PERMANENT INSURANCE. It burned only when the wedge
 *  actually fired (32% of 1/32 = 1.0% of spins, so ~100 spins of cover), and
 *  players sat shielded 77% of the time anyway, so buying one was buying
 *  redundancy. A hundred thousand was the house saying "no subscriptions".
 *
 *  100,000 -> 30,000 (Josh, Sep 2026, the round after THE REAPER'S PATIENCE).
 *  The patience turned the amulet into a CONSUMABLE: it burns at half of every
 *  landing now, ~64 spins, and the counter is the only place to get one on
 *  demand. Same price, 36% less cover, and a different shape of object. The
 *  arithmetic that settled it: ~16% of bare windows outrun the 55-spin grace,
 *  so a ~1,120-spin life asks you to buy about 2.3 shields, while a life's
 *  income at a spin's ~100-silver yield over 84 free spins a day is ~112,000
 *  if you sell literally everything you win. At 100,000 the insurance cost
 *  more than the death it insured against (~5 days of rebuilding), and it
 *  discriminated backwards — a rounding error to a mythic completionist, out
 *  of reach for the mid-game player who actually feels the gauge go red. It
 *  was also a sink that burned nothing, because nobody bought from it.
 *
 *  30,000 is ~3.5 days of full sell-through, or 60 bought spins; two a life
 *  costs ~55% of your sell income, which is a real sacrifice that competes
 *  with spins and the Forge's tolls without ever being hopeless. It sits just
 *  above a shelf legendary (25,000) rather than level with the Forge's mythic
 *  toll, which is the right shelf for a consumable that saves your life. */
export const TALISMAN_PRICE = 30_000;

/** STERLING'S COURTESY (Josh, Sep 2026): the share off the shield he offers
 *  PERSONALLY, by DM, when he notices your gauge has gone red. See
 *  src/sterling.ts — the whole point is that the discount finds the player who
 *  is actually in danger instead of whoever happens to be online for a sale.
 *  The goblins already write to people in exactly this state; until now the
 *  only character who noticed you were in trouble was the one selling you
 *  debt. A discount, never a gift — the danger has to stay real. */
export const SHIELD_OFFER_CUT = 0.4;

/** The house-wide SHIELD SALE (Sterling's sixth special): percent off the
 *  counter for its six hours. Self-targeting by construction — the counter
 *  refuses anyone already shielded, so only the bare third of the floor can
 *  spend it. */
export const SHIELD_SALE_PCT = 30;

/** What the shield costs THIS person right now.
 *
 *  Two things can cut it — Sterling's personal courtesy and a house-wide
 *  shield sale — and they take the KINDEST, never the product. Stacking a 40%
 *  courtesy under a 30% sale would put a life-saving item at 58% off on a
 *  coincidence, and "whichever offer is better" is also the only version a
 *  price tag can explain in one line. Pure so the route, the two counters and
 *  the harness all read one rule. */
export function shieldPrice(base: number, offerCut = 0, salePct = 0): number {
  const best = Math.min(0.9, Math.max(0, offerCut, salePct / 100));
  // Subtract the DISCOUNT rather than multiplying by what's left: at the 0.9
  // clamp `1 - best` is 0.09999999999999998 in binary floating point, and the
  // floor of that turned a 3,000-silver price into 2,999. Prices are money and
  // money is read out loud; compute the part being taken off.
  return Math.max(1, base - Math.round(base * best));
}

/** Silver price of a random unowned MYTHIC at Sterling's counter.
 *
 *  RAISED 100,000 -> 500,000 in the same round, and it is now the most
 *  expensive thing in the house bar the gun. This counter is also the ONLY way
 *  to get a mythic since the Bone Pit's crown was retired (Josh: "since the
 *  mythic is for sale in the casino remove the mythic win for the bone pit"),
 *  so the price is the entire rarity control on the tier — half a million of
 *  burned silver per mythic, where a spin's sale yields about a hundred.
 *  Still a pure sink: the coins burn and mythics are unsellable, so nothing
 *  here can turn silver back into silver. */
export const MYTHIC_PRICE = 500_000;

/** THE BAR. Sterling pours four things; the silver burns and you get a bottle
 *  in your hand on the floor. NOTHING ABOVE 75 (Josh, Aug 2026 — the first cut
 *  priced a whisky like a wheel spin). A round should be pocket change: the
 *  bottle can't be sold, traded or kept, so this is a pure sink whose only
 *  return is a headache. Must stay in step with client/src/casino/drink.ts. */
export const DRINK_PRICES: Record<string, number> = {
  beer: 20,
  wine: 40,
  whisky: 60,
  champagne: 75,
};

/**
 * SLORP (Josh, Aug 2026) — the vial Sterling keeps UNDER the counter, sold
 * only to a body standing at his bar in the flesh. Ten minutes of colour that
 * ends with you painting the carpet, and then you walk back in at the
 * entrance: cosmetic, exactly like being shot on the floor. Nothing about it
 * touches an account, a collection or the Wake.
 *
 * 1,500 silver, BURNED (Josh's pick — "a big night"): a hundred and fifty
 * slots pulls, so a trip is an event a room gathers to watch rather than
 * something you do on the way past. Like the bar's bottles, what you carry
 * afterwards is client state with no table — a duplicated vial buys you a
 * hallucination and a death, which is not a thing worth stealing.
 */
export const SLORP_PRICE = 1500;

/**
 * STAR DUST (Josh, Aug 2026) — the OTHER thing under the counter: a canister
 * of compressed gas, three huffs to a can. Each huff makes the world neon and
 * the huffer's voice helium (to everyone else), and resets a five-minute clock
 * (cut from ten, Josh's retune);
 * a third huff inside the window pins the meter, shakes the vision for thirty
 * seconds, and then the body detonates — the gun's cosmetic death, with a
 * sound effect Josh supplied personally.
 *
 * 2,000 silver, BURNED (the vial's shape exactly): slightly over slorp because
 * a can is three separate evenings if you have the patience, and one very
 * short one if you don't. Client state after purchase, like the bottles.
 */
export const STARDUST_PRICE = 2000;

/**
 * EGO (Josh, Aug 2026) — the third thing under the counter: a goopy shot of
 * confidence serum. It works on the HEAD, which swells 40% per shot (and the
 * voice drops a shade — a man addressing a stadium) while a fisheye bulges
 * the drinker's own view; it all drains smoothly back over ~4 minutes a dose.
 * A third shot while still swollen is the line: eight seconds of hull-creak
 * and the head POPS — confetti, not gore — into the gun's cosmetic death.
 *
 * 800 silver a SHOT, BURNED (the drink's shape): three quick ones cost 2,400
 * and your head, which is the correct price for confidence.
 */
export const EGO_PRICE = 800;

/** The Trader's buy price for an emoji tier; 0 (or absent) means "won't buy it". */
export function sellPriceOf(tier: string): number {
  return SELL_PRICES[tier] ?? 0;
}
