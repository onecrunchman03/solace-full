// GOBLIN LENDERS — the goblin bank on the casino floor (Josh, Aug 2026).
//
// "A front end for a bank ran by greedy goblins. Interstellar goblins from a
// different planet. Players can use this terminal to get loans of silver coin
// in order to play in the casino if they are short on coin… These will be
// predatorial loans with high interest rates."
//
// ---------------------------------------------------------------------------
// WHERE THE MONEY COMES FROM, which is the whole reason this design works.
//
// Solace has exactly one faucet: the Wheel. Everything downstream is tuned
// against that, and a lender that conjures a million silver out of nothing
// would be a bigger faucet than the Wheel has produced in its life. So the
// goblins DON'T conjure it: they are interstellar, and they arrived with their
// own capital. `VAULT_SEED` enters the world ONCE, and after that every coin
// they lend comes out of the vault and every coin repaid goes back into it.
// They are moving the same money around forever.
//
// The consequences of that, all deliberate:
//   · The world's silver rises exactly once, by a number we chose on purpose.
//   · Conservation stays auditable as one sum: wallets + escrows + vault.
//   · A run on the bank is possible and IN CHARACTER — lend the vault dry and
//     the window closes until somebody pays. Nothing breaks; they just say no.
//   · Their pile visibly grows as they bleed the floor, which is the point of
//     them.
//
// ---------------------------------------------------------------------------
// PURE FUNCTIONS ONLY — no store, no clock, no randomness. mortality.ts's rule,
// for mortality.ts's reason: scripts/checks/test_lender.mjs drives the whole
// arithmetic directly, and the money path is the part that must not be wrong.

/** What the goblins brought with them. One time, forever. Every later coin
 *  they hold was taken from somebody on this server. */
export const VAULT_SEED = 5_000_000;

/** The four windows, exactly as Josh specified them. */
export const TIERS = [1_000, 10_000, 100_000, 1_000_000] as const;
export type LoanTier = (typeof TIERS)[number];

/**
 * Daily interest, per tier — WORSE the more you borrow, because these are
 * predatory loans and the goblins want the big ones to fail.
 *
 * For scale: a committed player's free spins sell to Sterling for roughly
 * 800-900 silver a day. So 1,000 is a bleed you can live with, 10,000 hurts,
 * 100,000 needs you to actually be winning, and 1,000,000 at 300,000 a day is
 * not a loan at all — it is a countdown. That tier IS the trap, and it stays
 * fair only because `creditLimit` means nobody can reach it who doesn't
 * already have a fortune to lose.
 */
export const RATES: Record<number, number> = {
  1_000: 0.15,
  10_000: 0.20,
  100_000: 0.25,
  1_000_000: 0.30,
};

/**
 * FOUNDRY LENDING (PANDORA.md, "Destroy the Goblins"). Once that world choice
 * is taken the goblins are gone and the same engine lends at these rates: a
 * fifth of the goblins', still worse the more you borrow (it is still a loan),
 * no letters, no cells. The vault is the same table, so conservation is
 * unchanged. `ratesFor(true)` is the one switch every caller reads.
 */
export const FOUNDRY_RATES: Record<number, number> = {
  1_000: 0.03,
  10_000: 0.04,
  100_000: 0.05,
  1_000_000: 0.06,
};
/** A Foundry loan's rate still steps on a miss, but never past this. */
export const FOUNDRY_RATE_CAP = 0.12;
export const ratesFor = (foundry: boolean): Record<number, number> => (foundry ? FOUNDRY_RATES : RATES);
export const rateCapFor = (foundry: boolean): number => (foundry ? FOUNDRY_RATE_CAP : RATE_CAP);

/**
 * Interest is SIMPLE, charged on the principal — not compounding.
 *
 * Daily compounding at 30% turns a million into a number nobody can read
 * inside a week, which stops being a story and becomes a bug report. Missing
 * a payment is what makes it grow: the unpaid interest capitalises into the
 * principal (see `missPenalty`), so the debt only snowballs for people who
 * are already drowning. Which is, of course, the goblin way.
 */
export function interestFor(principal: number, rate: number): number {
  return Math.floor(Math.max(0, principal) * Math.max(0, rate));
}

/** The late fee on a missed payment, as a share of the interest missed. */
/** THE LETTERS (Sep 2026): an introductory rate is the posted rate less the
 *  letter's points, never below the floor. It applies to any window signed
 *  while the offer stands, and it DIES ON THE FIRST MISSED DAY — the step
 *  lands on the posted rate, never the teaser (see collectFrom). */
export const OFFER_FLOOR = 0.05;
export function teaserRate(base: number, off: number): number {
  return Math.max(OFFER_FLOOR, Math.round((base - off) * 10_000) / 10_000);
}

export const LATE_FEE_SHARE = 0.25;
/** …and the rate goes up a point every time you miss one. */
export const RATE_STEP = 0.01;
/** Nobody's rate climbs past this, or the arithmetic stops being legible. */
export const RATE_CAP = 0.60;

/** What a missed payment does to the debt: the unpaid interest capitalises,
 *  a late fee lands on top, and the rate steps up for every day after. */
export function missPenalty(
  principal: number,
  rate: number,
): { principal: number; rate: number; fee: number; interest: number } {
  const interest = interestFor(principal, rate);
  const fee = Math.floor(interest * LATE_FEE_SHARE);
  return {
    principal: principal + interest + fee,
    rate: Math.min(RATE_CAP, rate + RATE_STEP),
    fee,
    interest,
  };
}

// ---------------------------------------------------------------------------
// WHO GETS TO BORROW WHAT
//
// Goblins only lend against what they can seize. This is the load-bearing
// anti-exploit as much as it is flavour: without it the kiosk is a coin
// printer (make an alt, borrow the maximum, hand it to your main, walk away),
// and with it that exploit dies at the root, because the only accounts that
// can reach the big windows are the ones with a fortune standing behind them.

/** They will lend up to this multiple of what they could strip from you. */
export const CREDIT_MULTIPLE = 3;

/**
 * THE DOOR, before the ladder: what an account must be WORTH before the
 * goblins will open any window at all.
 *
 * Expressed in COMMONS rather than silver, because it has to follow the
 * Trader's table instead of drifting every time prices move — and it drifted
 * once. The ladder is denominated in fixed silver (the four windows), so when
 * the Sep 2026 raise took a common from 10 to 50, the 1,000 window's ~334 of
 * seizable worth stopped meaning "about 34 commons" and started meaning SEVEN
 * — roughly a day of free spins on a brand-new alt. The credit ladder is the
 * load-bearing anti-alt guard (mint an alt, borrow, hand it to your main,
 * walk away), so its door is pinned to the unit the collection is valued in.
 */
export const MIN_WORTH_COMMONS = 35;

/** The door in silver, given what Sterling pays for a common today. */
export function minWorth(commonPrice: number): number {
  return MIN_WORTH_COMMONS * Math.max(0, commonPrice);
}

/** Your worth in their eyes: your purse plus what your collection would
 *  fetch. (The caller values the collection at the TRADER's prices — see
 *  `seizeValue` for what they actually pay when they take it.) */
export function creditLimit(purse: number, collectionValue: number): number {
  return Math.max(0, Math.floor((Math.max(0, purse) + Math.max(0, collectionValue)) * CREDIT_MULTIPLE));
}

/** The largest window open to somebody of this worth — or null if even the
 *  smallest is beyond them. A brand-new account with nothing gets NOTHING
 *  (the alt-exploit guard); the 1,000 window wants 3x its size in seizable
 *  worth AND at least `minWorth` of it — whichever bar is higher. `floor`
 *  defaults to 0 for the pure-rule callers; every production caller passes
 *  `minWorth(SELL_PRICES.common)`. */
export function maxTierFor(purse: number, collectionValue: number, floor = 0): LoanTier | null {
  const worth = Math.max(0, purse) + Math.max(0, collectionValue);
  if (worth < floor) return null; // the door: not worth their paperwork
  const limit = creditLimit(purse, collectionValue);
  let best: LoanTier | null = null;
  for (const t of TIERS) if (t <= limit) best = t;
  return best;
}

/** May this person take this exact loan? (Amount must BE a tier — the kiosk
 *  offers four buttons, not a slider.) */
export function tierAllowed(amount: number, purse: number, collectionValue: number, floor = 0): boolean {
  if (!(TIERS as readonly number[]).includes(amount)) return false;
  const max = maxTierFor(purse, collectionValue, floor);
  return max !== null && amount <= max;
}

// ---------------------------------------------------------------------------
// THE LADDER
//
// One step per missed daily payment. Everything below stage 5 is pressure that
// still lets you play — the goblins would much rather bleed you than lose you,
// and a punishment that stops somebody logging in stops them paying.

export type Stage = 0 | 1 | 2 | 3 | 4 | 5;

export const STAGE = {
  CURRENT: 0 as Stage,
  /** Marked: a public debtor tag. Shame is free and it works. */
  MARKED: 1 as Stage,
  /** Garnished: they take a cut of your purse on their daily visit. */
  GARNISHED: 2 as Stage,
  /** Repossession: they start selling your collection out from under you. */
  REPO: 3 as Stage,
  /** Frozen: you may still gamble — they WANT you chasing it — but nothing
   *  of value may leave your hands. This is also what closes the "borrow,
   *  gift it all to a friend, default" laundering route. */
  FROZEN: 4 as Stage,
  /** Jail. */
  JAILED: 5 as Stage,
} as const;

/** Foundry Lending's ladder ends at REPOSSESSION: no freeze, no cells. */
export const FOUNDRY_TOP_STAGE: Stage = 3;

export function stageFor(missed: number, top: Stage = 5): Stage {
  return Math.max(0, Math.min(top, Math.floor(missed))) as Stage;
}

/** What share of the purse they help themselves to, per visit, once garnishing. */
export const GARNISH_SHARE = 0.25;
export function garnishOf(purse: number): number {
  return Math.floor(Math.max(0, purse) * GARNISH_SHARE);
}

/**
 * What a seized emoji settles against the debt: HALF what Sterling would pay.
 * They are not buying it, they are taking it, and they price it accordingly —
 * a legendary that sells for 100 knocks 50 off what you owe.
 */
export const SEIZE_SHARE = 0.5;
export function seizeValue(traderPrice: number): number {
  return Math.floor(Math.max(0, traderPrice) * SEIZE_SHARE);
}

/** Repossession works from the BOTTOM UP — commons first. A slow humiliation
 *  beats an instant gutting, and it leaves the collection's heart intact for
 *  as long as possible so there's still something to play for. */
export function repoOrder<T extends { code: string; tier: string; price: number }>(owned: T[]): T[] {
  return [...owned]
    .filter((e) => e.price > 0) // unsellable things (mythic, talisman, special) can't be seized
    .sort((a, b) => a.price - b.price || a.code.localeCompare(b.code));
}

/** May this person still move value out of their hands? False from FROZEN on. */
export function canMoveValue(stage: Stage): boolean {
  return stage < STAGE.FROZEN;
}

/** May they buy a trophy? THE HOUSE DOESN'T SELL TROPHIES TO MEN WHO OWE
 *  MONEY — any live loan closes Sterling's top shelf (the mythic and the
 *  gun). Rather than tainting individual coins, which would mean tracking
 *  every silver piece in the world, one loan closes one counter. It also
 *  stops a million-silver window becoming ten mythics on a Tuesday, when the
 *  Bone Pit mints at most one a week. */
export function canBuyTrophies(hasLoan: boolean): boolean {
  return !hasLoan;
}

// ---------------------------------------------------------------------------
// JAIL
//
// Josh: "the most severe consequence being you get sent to prison which
// basically means you loose that account. same consequence as dying but
// different in implementation."
//
// It is the Wake's shape, with three deliberate differences: you are HELD, not
// dead (you can still log in — to a cell), the bail goes to the GOBLINS rather
// than to nobody, and bail frees the body but NOT the debt.

/** How long somebody sits before the cell door locks for good. The grave's
 *  48 hours, for the grave's reason: long enough that a friend group spread
 *  over a weekend actually sees it. */
export const JAIL_FRESH_MS = 48 * 60 * 60 * 1000;

/**
 * BAIL MUST COST MORE THAN THE DEBT. If it were cheaper, jail would be a
 * discount debt-settlement service: borrow a million, hand it to a friend,
 * get jailed on purpose, have them spring you for less than you took. So bail
 * is the whole outstanding debt plus a processing fee, and the fee exists
 * because they are goblins.
 */
export const BAIL_FEE_SHARE = 0.5;
export function bailPrice(debt: number): number {
  return Math.ceil(Math.max(0, debt) * (1 + BAIL_FEE_SHARE));
}

/** How often the sweep looks for debts to charge and cells to close. The
 *  charge itself is keyed to the UTC day, so being late costs nothing —
 *  which is exactly why this is safe to dial right down for a harness
 *  (`LENDER_SWEEP_MS`, the roulette/craps convention): the goblins' rounds
 *  are idempotent per day, so calling more often changes nothing but how
 *  long a test has to wait. */
export const LENDER_SWEEP_MS = Number(process.env.LENDER_SWEEP_MS ?? 60_000);

/** Is this cell still open to a bail? NULL sealsAt means sealed — the same
 *  convention as a grave, for the same migration-safety reason. */
export function jailIsFresh(sealsAt: number | null | undefined, now: number): boolean {
  return typeof sealsAt === "number" && sealsAt > now;
}

/** The UTC day key a charge belongs to. One charge per debtor per day, and
 *  the key is what makes that idempotent across restarts and double sweeps. */
export function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** How many whole days of charges are owed between two day keys. A server
 *  that was down for three days charges three days when it comes back — the
 *  debt didn't stop while nobody was looking. Capped, so a box that sat off
 *  for a month doesn't jail everyone the instant it boots. */
export const MAX_CATCHUP_DAYS = 3;
export function daysBetween(fromDay: string, toDay: string): number {
  const a = Date.parse(fromDay + "T00:00:00Z");
  const b = Date.parse(toDay + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.min(MAX_CATCHUP_DAYS, Math.round((b - a) / 86_400_000));
}

// ---------------------------------------------------------------------------
// THE REPO SHELF (Josh, Sep 2026 — the lender's second round)
//
// Repossessed emoji used to be DELETED: the goblins took your legendary and it
// left the world. Now it goes on their shelf, for sale to anyone who doesn't
// already own that code, and the silver paid goes INTO THE VAULT — so the
// shelf is also how the floor refills a drained bank. Conservation is
// untouched (an emoji changes hands, coins move wallet → vault), the Wheel is
// still the only place an emoji is BORN, and the original owner gets to watch
// their own collection sold at ten times what it was credited against their
// debt. Which is the goblin way.

/** Shelf price as a multiple of the TRADER's buying price — 50 / 150 / 500 for
 *  common / rare / legendary. High on purpose: the shelf must never be a
 *  cheaper way to complete a collection than spinning for it. */
export const SHELF_MULTIPLE = 5;
export function shelfPrice(traderPrice: number): number {
  return Math.floor(Math.max(0, traderPrice) * SHELF_MULTIPLE);
}

// ---------------------------------------------------------------------------
// THE CELL'S EXTRAS (same round)

/** A prisoner may leave ONE line on their cell card at the kiosk — "bring
 *  15k, I'll pay you back". Short, because it is scratched on a wall. */
export const MAX_PLEA = 140;
export function cleanPlea(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // One line: control characters collapse to spaces, then trim and clamp.
  const s = raw.replace(/[\x00-\x1f\x7f]+/g, " ").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, MAX_PLEA) : null;
}

/**
 * THE BAIL POT. Friends chip in toward a bail until it clears; every coin sits
 * in escrow (`bail_pot`) until the pot reaches the price, at which point the
 * whole pot goes to the goblins and the cell opens. Anything that ends the
 * cell some other way — a single payer's bail, the seal — refunds every
 * contribution, so the pot can only ever pay the goblins or go home.
 *
 * The bail price is STABLE while somebody is inside (the collectors skip
 * disabled accounts, so the debt doesn't grow in the cell), which is what
 * makes a target worth chipping toward.
 */
export function potRemaining(price: number, pot: number): number {
  return Math.max(0, Math.max(0, price) - Math.max(0, pot));
}

/** A pot contributor is credited "a bail paid" (the Bondsmen board, the
 *  bail badges) only for a REAL share of the price — otherwise one silver
 *  dripped into pots other people fill farms the gold badge for five coins
 *  (review finding, Sep 2026). A tenth of the price, or the whole thing. */
export const BONDSMAN_SHARE = 0.1;
export function countsAsBail(amount: number, price: number): boolean {
  return price > 0 && amount >= Math.ceil(price * BONDSMAN_SHARE);
}

/** The daily visit's title, which walks down the ladder with you. This is the
 *  one line of the goblins a debtor sees WITHOUT opening anything — it is the
 *  push notification's heading — so it is where the turn from "helpful" to
 *  "scammers" has to be legible at a glance (Josh, Sep 2026). Stage 0 and the
 *  jailing keep their original words; the harness pins both. */
const VISIT_TITLES: Record<Stage, string> = {
  0: "THE COLLECTORS CALLED",
  1: "A WORD FROM THE COLLECTORS",
  2: "THE COLLECTORS TOOK THEIR SHARE",
  3: "THE COLLECTORS TOOK YOUR THINGS",
  4: "THE COLLECTORS ARE DONE ASKING",
  5: "THE GOBLINS HAVE YOU",
};

/** One line of them, under the receipt. The facts come FIRST in the body on
 *  purpose: a push notification shows only the opening of it, and what a
 *  debtor needs from a push is the number, not the performance. */
const VISIT_STINGS: Record<Stage, string> = {
  0: "Settled for today, and gladly.",
  1: "We did have to put your name up where the floor can see it. Nothing personal in that — it is simply the second paragraph.",
  2: "We take a quarter of the purse now, every visit. You did agree to this part.",
  3: "It goes on the shelf at five times what the Trader pays, and anybody at all may buy it.",
  4: "Nothing leaves your hands now. One more day and neither do you.",
  5: "Forty-eight hours, and then we settle it out of the estate.",
};

/** The words on a collectors' notice, from what the visit did. Pure, so the
 *  harness can pin the copy against the numbers. */
export function collectorsNotice(r: {
  took: number; seized: string[]; missedDays: number; stage: Stage; jailed: boolean;
}): { title: string; body: string } {
  const parts: string[] = [];
  if (r.took > 0) parts.push(`${r.took.toLocaleString()} silver taken`);
  if (r.seized.length) parts.push(`${r.seized.length} emoji repossessed`);
  if (r.jailed) parts.push("you have been taken into custody");
  else if (r.missedDays > 0) parts.push(`payment missed — you are ${STAGE_WORDS[r.stage]}`);
  if (!parts.length) parts.push("your account is current");
  const stage: Stage = r.jailed ? 5 : r.stage;
  return {
    title: r.jailed ? VISIT_TITLES[5] : VISIT_TITLES[stage],
    body: parts.join(" · ") + ". " + VISIT_STINGS[stage],
  };
}

export const STAGE_WORDS: Record<Stage, string> = {
  0: "in good standing",
  1: "MARKED",
  2: "GARNISHED",
  3: "under REPOSSESSION",
  4: "FROZEN",
  5: "JAILED",
};

/** The whole quote a kiosk screen shows a debtor. */
export interface LoanQuote {
  principal: number;
  rate: number;
  /** Today's minimum payment — clear this and you stay afloat. */
  interest: number;
  /** The balance: the principal plus tonight's interest. */
  payoff: number;
  /** What clears the loan RIGHT NOW (Oct 2026 review): the principal, plus a
   *  day's interest only if today's visit hasn't run yet. A loan repaid the
   *  same day it was last charged owes no more interest; the kiosk's SETTLE
   *  used to ask for the payoff and stayed disabled for a player who could
   *  clear the debt. */
  settle: number;
  stage: Stage;
  missed: number;
  bail: number;
}

export function quote(principal: number, rate: number, missed: number, behind = false, top: Stage = 5): LoanQuote {
  const interest = interestFor(principal, rate);
  return {
    principal,
    rate,
    interest,
    payoff: principal + interest,
    settle: principal + (behind ? interest : 0),
    stage: stageFor(missed, top),
    missed,
    bail: bailPrice(principal + interest),
  };
}
