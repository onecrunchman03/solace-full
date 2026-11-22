// THE WAKE AND THE INHERITANCE — what happens after the reaper follows through.
//
// Josh kept permadeath (Aug 2026) but asked for it to stop being a door slam:
// at the old 1.5% a spin a committed player lost an account about weekly, which
// is attrition rather than drama, and the likeliest reason somebody walks away
// after months. The fire rate went to 1.0%. This is the rest of the answer, and
// it runs in two stages:
//
//   THE WAKE. You die exactly as before — tombstoned, Terminated plays, locked
//   out — but for GRAVE_FRESH_MS the grave is fresh. Another living player can
//   raise you for RAISE_PRICE, or you can buy yourself back by emptying your
//   purse and burning a third of your collection. The drama is untouched; what
//   changes is that the door is not yet shut.
//
//   THE INHERITANCE. Nobody comes, and the grave seals — but a sealed grave is
//   not a dead end. The life is carved into `lives` with everything it held,
//   and the same account walks out as the next generation carrying its
//   achievements, its titles, a quarter of its silver and the rarest TENTH of
//   its collection. You lose your POSITION, not your history.
//
// EVERY PRICE HERE IS BURNED, and every heirloom is an emoji that already
// existed being kept rather than a new one being made. The Wheel stays the only
// faucet; a revival must never be a mint. That is what the harness spends most
// of its asserts on.
//
// Pure functions only — no store, no clock, no randomness beyond what is passed
// in — so scripts/checks/test_mortality.mjs can drive the arithmetic directly.

/** How long a grave stays fresh: 48 hours. Long enough that a friend group
 *  spread over a weekend actually sees it, short enough to still be a loss. */
export const GRAVE_FRESH_MS = 48 * 60 * 60 * 1000;

/** What it costs SOMEBODY ELSE to raise you. Burned, not paid to the dead —
 *  a revival that enriched anybody would be a coin faucet with extra steps. */
export const RAISE_PRICE = 10_000;

/** …or one sacrificed mythic, which is the other accepted price. Mythics come
 *  only from Sterling's counter at 500,000 burned silver (the Pit's weekly
 *  crown was retired in Aug 2026), so this is a genuine sink on the scarcest
 *  thing in the game — the same shape as the Wheelwright's talisman trade. */
export const RAISE_MYTHIC_TIER = "mythic";

/** Buying yourself back is deliberately steeper than being raised: your whole
 *  purse, plus this share of your collection, burned. Being saved by somebody
 *  else should always be the better deal — that is the social half of the
 *  mechanic, and it stops the window becoming a private toll booth. */
export const SELF_BURN_SHARE = 1 / 3;

/** What the next generation carries out of a sealed grave. */
export const HEIR_COIN_SHARE = 0.25;

/**
 * THE HEIRLOOMS ARE A SHARE NOW, NOT A COUNT (Josh, Sep 2026).
 *
 * Five was the whole inheritance from the day this shipped, and five was
 * fine when a death meant losing a few dozen emoji. It stopped being fine the
 * moment the endgame asked you to hold the WHOLE catalogue at once: five out
 * of ~1,143 is not a setback, it is an erasure, and a simulated Tier-4 run
 * under the old rules took a median 171,000 spins across 349 deaths, with
 * half of all runs never finishing. Pandora's Box was closed by arithmetic.
 *
 * A tenth, taken RAREST FIRST, changes the shape rather than the sting. You
 * still lose ninety per cent of what you built — nobody is going to enjoy it
 * — but the slow, scarce end of the collection survives: at every stage of
 * the game a tenth of your holdings is more slots than you have legendaries
 * (they are 6.3% of the finished catalogue and less than that all the way
 * up), so the tier that actually gates Tier 4 accumulates across lives
 * instead of resetting to nothing. The commons and rares you lose are the
 * fast, replaceable end. The same run now completes in every trial, at a
 * median 12,735 spins and 8 deaths.
 *
 * HEIRLOOM_FLOOR keeps the old number as a floor, so nothing gets worse for
 * somebody who died holding very little.
 */
export const HEIR_SHARE = 0.1;
export const HEIRLOOM_FLOOR = 5;

/** How many emoji come out of a grave, given what the life was holding. */
export function heirloomCount(total: number): number {
  return Math.max(HEIRLOOM_FLOOR, Math.floor(Math.max(0, total) * HEIR_SHARE));
}

/** @deprecated the flat count — kept as the floor's name for old callers. */
export const HEIRLOOM_COUNT = HEIRLOOM_FLOOR;

/** Rarity weights — the same ladder the leaderboards rank by, so "your rarest"
 *  means the same thing here as it does there. */
export const TIER_WEIGHT: Record<string, number> = {
  common: 1,
  rare: 3,
  talisman: 15,
  legendary: 10,
  mythic: 25,
  // THE STONE OF THE ABYSS outranks everything: it is always an heirloom,
  // so the next generation carries it out of the grave (src/abyss.ts).
  abyss: 1000,
};

export interface OwnedEmoji {
  code: string;
  tier: string;
}

export const tierWeight = (tier: string): number => TIER_WEIGHT[tier] ?? 1;

/** Which emoji come out of the grave with you: the rarest you owned.
 *
 *  Ties break on the CODE, not on insertion order or a shuffle — two players
 *  who died holding the same set must inherit the same set, and a harness has
 *  to be able to predict it. */
export function heirlooms(owned: OwnedEmoji[], count = heirloomCount(owned.length)): string[] {
  return [...owned]
    .sort((a, b) => tierWeight(b.tier) - tierWeight(a.tier) || a.code.localeCompare(b.code))
    .slice(0, Math.max(0, count))
    .map((e) => e.code);
}

/** The silver that survives a sealing. Floored — the fraction of a coin that
 *  rounding would invent is exactly the kind of leak this economy can't have. */
export function inheritedCoins(purse: number): number {
  return Math.floor(Math.max(0, purse) * HEIR_COIN_SHARE);
}

/** How many emoji a self-revival burns. Floored, and never the whole
 *  collection: somebody who owns one emoji should not have to give up
 *  everything they have to stand up. */
export function selfBurnCount(total: number): number {
  return Math.min(Math.max(0, total - 1), Math.floor(Math.max(0, total) * SELF_BURN_SHARE));
}

/**
 * A SELF-REVIVAL MUST ACTUALLY COST SOMETHING.
 *
 * Josh, Aug 2026, testing on a fresh account with an empty purse: "i rigged
 * his next spin for death which killed him. however when i went to log back in
 * it allowed to pay the fee with no money and i got it."
 *
 * The price is "your whole purse plus a third of your collection", which is
 * brutal for a rich player and EXACTLY NOTHING for a new one:
 * selfRevivePrice(0, 0) quotes zero coins and zero emoji, and the wake happily
 * charged it. Permadeath then meant nothing at all for the accounts it is
 * easiest to make — die, pay nothing, stand up, repeat.
 *
 * So the door needs a floor. You may buy yourself back if you can hand over
 * real silver OR at least one emoji; with neither, the wake refuses and you
 * are back to the two endings that were always there — somebody raises you
 * (RAISE_PRICE, the better deal by design), or the grave seals in 48h and the
 * Inheritance stands you up a generation older. Nobody is stranded; they just
 * can't let themselves out for free.
 */
export const SELF_REVIVE_MIN_COINS = 1_000;

export function canSelfRevive(purse: number, collectionSize: number): boolean {
  return purse >= SELF_REVIVE_MIN_COINS || selfBurnCount(collectionSize) >= 1;
}

/** Is this grave still open to a revival? A NULL sealsAt means sealed — which
 *  is also what every grave dug before this feature reads as, deliberately:
 *  their estates were already executed under the old rules, so reopening them
 *  on deploy would hand the same estate out twice. */
export function graveIsFresh(sealsAt: number | null | undefined, now: number): boolean {
  return typeof sealsAt === "number" && sealsAt > now;
}

/** What the dead person is looking at on the wake screen. */
export interface WakeQuote {
  /** Silver burned if they buy themselves back — all of it. */
  coins: number;
  /** How many of their emoji burn with it. */
  burn: number;
  /** What a friend would pay instead. */
  raisePrice: number;
}

/** How often the sweep looks for graves whose window has run out. A minute is
 *  plenty — the deadline is a column, so nothing is lost by being late, and the
 *  Graveyard read seals lazily anyway.
 *
 *  Dialable for harnesses, the house convention (LENDER_SWEEP_MS,
 *  ROULETTE_BET_MS, HOLDEM_TURN_MS): a test that has to prove what a SEALING
 *  does should not spend a real minute waiting for the sweep to notice. */
export const GRAVE_SWEEP_MS = Number(process.env.GRAVE_SWEEP_MS ?? 60_000);

export function selfRevivePrice(purse: number, collectionSize: number): WakeQuote {
  return {
    coins: Math.max(0, purse),
    burn: selfBurnCount(collectionSize),
    raisePrice: RAISE_PRICE,
  };
}

// ---- GRAVESIDE RITUALS (Graveyard v2, Aug 2026) -----------------------------
// Candles and flowers are the graveyard's first real sinks: both prices BURN
// (the Vault-buy-in shape — the Wheel stays the only faucet), and both decay,
// so the scene shows which graves are tended and which are forgotten without
// anybody writing a line of copy. Eulogies are free — words cost nothing.

/** Light a candle on a grave: 25 silver, burned. Cheap enough to happen
 *  constantly — a well-lit grave MEANS something, and an unlit one does too. */
export const CANDLE_PRICE = 25;
/** A candle burns for a day, then gutters out. */
export const CANDLE_MS = 24 * 60 * 60 * 1000;

/** Leave flowers: 100 silver, burned. */
export const FLOWERS_PRICE = 100;
/** Fresh for a day, wilted after that, gone after seven. */
export const FLOWERS_FRESH_MS = 24 * 60 * 60 * 1000;
export const FLOWERS_GONE_MS = 7 * 24 * 60 * 60 * 1000;

/** One eulogy per mourner per grave, and it has to fit on a mourning card. */
export const MAX_EULOGY = 200;

export type TributeKind = "candle" | "flowers";

/** How long each tribute kind stays visible at all — the lazy prune's rule. */
export function tributeGoneMs(kind: TributeKind): number {
  return kind === "candle" ? CANDLE_MS : FLOWERS_GONE_MS;
}

/** Is this tribute still standing (a lit candle / any flowers at all)? Placing
 *  a second one of the same kind on the same grave is refused while the first
 *  stands — the refusal happens BEFORE the wallet, like every refusal here. */
export function tributeActive(kind: TributeKind, at: number, now: number): boolean {
  return now - at < tributeGoneMs(kind);
}

/** The flowers' three states, for the scene: fresh → wilted → gone. */
export function flowerState(at: number, now: number): "fresh" | "wilted" | "gone" {
  const age = now - at;
  if (age < FLOWERS_FRESH_MS) return "fresh";
  if (age < FLOWERS_GONE_MS) return "wilted";
  return "gone";
}
