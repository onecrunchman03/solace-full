// GOBLIN LENDERS — the client's half of the goblin bank.
//
// Thin, on purpose: the kiosk shows what the server says and asks it for
// everything. No number here is authoritative — the tiers, the rates, the
// credit limit and the bail price are all the server's, and the screen just
// paints them (see src/lender.ts for the rules, src/routes/lender.ts for the
// surface). The one thing this file DOES own is the wallet resync, because
// every one of these actions moves silver.
//
// ROUND TWO (Sep 2026): the marked (settle for a friend), the cells' pleas
// and bail pots, the repo shelf, the goblins' books, and a patter pool so the
// machine talks like Sterling does — per customer, per hour, per mood.

import { api, ApiError } from "./api";
import { wallet } from "./wallet.svelte";
import { refreshOwned } from "./emoji.svelte";
// STATIC on purpose (Sep 2026 review): a dynamic import here made the
// bundler park a shared helper inside the 882KB three.js chunk, and the
// login page then preloaded that chunk at boot — undoing the July
// code-splitting pass. wallet.svelte is in the main chunk anyway.
import { loadWallet } from "./wallet.svelte";

export interface LoanQuote {
  principal: number;
  rate: number;
  interest: number;
  payoff: number;
  /** What clears it right now (the server's own figure). */
  settle?: number;
  stage: number;
  missed: number;
  bail: number;
}

type Pub = { id: number; displayName: string; avatar: string | null } | null;

export interface Prisoner {
  userId: number;
  jailedAt: number;
  jailSealsAt: number;
  debt: number;
  bail: number;
  user: Pub;
  plea: string | null;
  pot: number;
  contributors: { userId: number; amount: number; user: Pub }[];
}

export interface MarkedDebtor {
  userId: number;
  stage: number;
  interest: number;
  payoff: number;
  settle?: number;
  user: Pub;
}

export interface ShelfItem {
  id: number;
  code: string;
  name: string;
  tier: string;
  file: string;
  price: number;
  seizedAt: number;
  fromUserId: number;
  from: Pub;
}

export interface LoanEvent {
  at: number;
  kind: string;
  amount: number;
  note: string | null;
}

export const lender = $state<{
  loaded: boolean;
  /** "foundry" once Pandora's box has destroyed the goblins (fair rates, no cells, no letters). */
  regime: "goblins" | "foundry";
  vault: number;
  books: { lent: number; taken: number };
  purse: number;
  worth: number;
  tiers: { amount: number; rate: number; base: number; allowed: boolean; affordable: boolean }[];
  loan: LoanQuote | null;
  /** THE LETTERS: a standing introductory rate (points off every window), or null. */
  offer: { off: number; until: number } | null;
  prisoners: Prisoner[];
  marked: MarkedDebtor[];
  shelf: ShelfItem[];
  /** YOUR FILE — this customer's own ledger page, newest first. */
  history: LoanEvent[];
  busy: boolean;
  error: string | null;
}>({
  loaded: false,
  regime: "goblins",
  vault: 0,
  books: { lent: 0, taken: 0 },
  purse: 0,
  worth: 0,
  tiers: [],
  loan: null,
  offer: null,
  prisoners: [],
  marked: [],
  shelf: [],
  history: [],
  busy: false,
  error: null,
});

/** What the file calls each entry, in the goblins' own hand. */
export const EVENT_NAMES: Record<string, string> = {
  borrow: "DISPENSED",
  pay: "RECEIVED",
  gift: "RECEIVED — FROM A FRIEND",
  cleared: "ACCOUNT CLEARED",
  interest: "INTEREST ACCRUED",
  missed: "PAYMENT MISSED",
  garnish: "PURSE GARNISHED",
  seize: "GOODS REPOSSESSED",
  jailed: "TAKEN INTO CUSTODY",
  bailed: "RELEASED ON PAYMENT",
  house: "SETTLED BY THE HOUSE",
  sealed: "ESTATE SETTLED",
  bought: "PURCHASED OFF THE SHELF",
};

export async function loadLenderHistory(): Promise<void> {
  try {
    lender.history = (await api.lenderHistory()).events;
  } catch {
    /* best-effort */
  }
}

/** What the ladder calls each rung, in the goblins' own words. */
export const STAGE_NAMES = [
  "in good standing",
  "MARKED",
  "GARNISHED",
  "REPOSSESSION",
  "FROZEN",
  "JAILED",
];

export const STAGE_BLURB = [
  "Your account is current. They are almost disappointed.",
  "One payment missed. A late fee, a worse rate, and everybody can see it.",
  "They take a quarter of your purse on every visit now.",
  "They have started selling your collection. Cheapest first.",
  "Nothing of value leaves your hands. You may still gamble — they insist.",
  "You are in the cell. Somebody has to pay for you.",
];

/** What each rung DOES, for the ladder gauge's hover. */
export const STAGE_WHAT = [
  "",
  "A public debtor tag. Late fee, rate up a point.",
  "A quarter of your purse, every visit.",
  "Up to ten emoji sold per visit, cheapest first, at half price.",
  "No trades out, no auctions, no bids. Gambling still allowed.",
  "The cell. 48 hours for somebody to pay your bail.",
];

export async function loadLender(): Promise<void> {
  try {
    const s = await api.lender();
    lender.regime = s.regime ?? "goblins";
    lender.vault = s.vault;
    lender.books = s.books ?? { lent: 0, taken: 0 };
    lender.purse = s.purse;
    lender.worth = s.worth;
    lender.tiers = s.tiers ?? [];
    lender.loan = s.loan ?? null;
    lender.offer = s.offer ?? null;
    lender.prisoners = s.prisoners ?? [];
    lender.marked = s.marked ?? [];
    lender.shelf = s.shelf ?? [];
    lender.loaded = true;
  } catch {
    /* best-effort — the kiosk simply doesn't open */
  }
}

const act = async <T>(fn: () => Promise<T>): Promise<{ ok: boolean; error?: string; result?: T }> => {
  lender.busy = true;
  lender.error = null;
  try {
    const result = await fn();
    return { ok: true, result };
  } catch (e) {
    const code = e instanceof ApiError ? e.code : "error";
    lender.error = code;
    return { ok: false, error: code };
  } finally {
    lender.busy = false;
    await loadLender();
  }
};

/** Take one of the four windows. */
export async function borrow(amount: number): Promise<{ ok: boolean; error?: string }> {
  const r = await act(() => api.lenderBorrow(amount));
  if (r.ok) await reloadWallet();
  return r;
}

/** Pay them — interest first, then principal. */
export async function repay(amount: number, service = false): Promise<{ ok: boolean; error?: string }> {
  const r = await act(() => api.lenderPay(amount, service));
  if (r.ok) await reloadWallet();
  return r;
}

/** SETTLE FOR A FRIEND — their debt, your wallet. */
export async function repayFor(userId: number, amount: number): Promise<{ ok: boolean; error?: string; cleared?: boolean }> {
  const r = await act(() => api.lenderPayFor(userId, amount));
  if (r.ok) await reloadWallet();
  return { ok: r.ok, error: r.error, cleared: r.result?.cleared };
}

/** Spring somebody out of the cell. Costs more than their debt, and it frees
 *  the body rather than the debt — see src/lender.ts. */
export async function bail(userId: number): Promise<{ ok: boolean; error?: string }> {
  const r = await act(() => api.lenderBail(userId));
  if (r.ok) await reloadWallet();
  return r;
}

/** THE BAIL POT — chip in. The server clamps to what's still needed. */
export async function chipIn(userId: number, amount: number): Promise<{ ok: boolean; error?: string; released?: boolean; took?: number }> {
  const r = await act(() => api.lenderChipIn(userId, amount));
  if (r.ok) await reloadWallet();
  return { ok: r.ok, error: r.error, released: r.result?.released, took: r.result?.took };
}

/** THE REPO SHELF — buy what they took off somebody (maybe you). */
export async function buyFromShelf(id: number): Promise<{ ok: boolean; error?: string; wasYours?: boolean }> {
  const r = await act(() => api.lenderBuy(id));
  if (r.ok) await reloadWallet();
  return { ok: r.ok, error: r.error, wasYours: r.result?.wasYours };
}

/** Every one of these moves silver, and repossession moves emoji too. */
async function reloadWallet(): Promise<void> {
  await loadWallet();
  wallet.coins = lender.purse || wallet.coins;
  await refreshOwned();
}

export function resetLender(): void {
  lender.loaded = false;
  lender.loan = null;
  lender.prisoners = [];
  lender.marked = [];
  lender.shelf = [];
  lender.error = null;
}

/** Human-readable refusals — the goblins are never sorry. */
export const LENDER_ERRORS: Record<string, string> = {
  over_limit: "Not against what you own, no.",
  loan_open: "You already owe us. One at a time.",
  vault_dry: "The vault is empty today. Come back tomorrow.",
  insufficient: "You don't have it.",
  no_loan: "You owe us nothing. Yet.",
  not_jailed: "Nobody by that name is in the cell.",
  cell_sealed: "Too late. That one's been dealt with.",
  self_bail: "You have no wallet in there.",
  self_gift: "That is called paying. Use the other key.",
  in_custody: "The cell has its own prices. Bail, or chip in.",
  pot_full: "The pot is already full. The door is opening.",
  not_on_shelf: "Sold. Somebody was quicker.",
  already_owned: "You have that one. We checked.",
  bad_amount: "That is not a number we recognise.",
  in_debt: "The house doesn't sell trophies to men who owe money.",
  in_arrears: "Nothing leaves your hands while you owe us.",
  not_eligible: "Not you. Not today.",
};

/**
 * THE PATTER. The machine talks like Sterling does — per customer, per hour,
 * per mood — but it is a goblin bank, so warm on the way in and teeth the
 * moment you are late. Pure over what the kiosk already knows.
 */
export function goblinLine(c: {
  name: string;
  purse: number;
  worth: number;
  loan: LoanQuote | null;
  hour: number;
  vault: number;
  prisoners: number;
  /** Is any window open to them? The server's call (its worth floor). */
  canBorrow?: boolean;
}): string {
  // THE TELLER TURNS WITH THE LADDER (Josh, Sep 2026). Standing at this
  // counter owing nothing, they are the most charming creatures in the
  // building; four missed days later they are not pretending any more. The
  // rungs used to share one pool — MARKED and REPOSSESSION said the same four
  // things — so each has its own now, and the sales voice is genuinely kind
  // rather than kind-with-a-knife. Anything cruel belongs further down.
  const pool: string[] = [];
  const late = c.hour >= 23 || c.hour < 5;
  if (!c.loan) {
    pool.push(
      "Wonderful to see you! Silver, is it? We have a great deal of it and nobody sensible to give it to.",
      `Come in, come in, ${c.name}. Nobody has ever been turned away from this counter and nobody ever will be.`,
      "No credit check, no forms, no lecture. You would not believe how rare that is.",
      "Ask us anything. We will answer honestly, which on this floor makes us practically a charity.",
      "We crossed four systems in a hull full of bullion. It would be a shame for it to just sit there.",
      "Our home world has a word for a customer like you. The nearest translation is 'welcome'.",
      "The Foundry gave us this corner and we intend to be very good neighbours in it.",
      `Sterling doesn't care for us, ${c.name}. Sterling also doesn't lend. Draw your own conclusions.`,
    );
    // The server's own answer, not a number copied here (Oct 2026 review: the
    // worth floor moved with the Trader's prices and this didn't).
    if (c.canBorrow === false) pool.push("A little thin to lend against just yet — but do come back. We would like to do business eventually.");
    if (c.purse + c.worth >= 333_400) pool.push("A person of MEANS. The big window is open for you. Do think about it.");
    if (c.vault < 100_000) pool.push("The vault is a little thin tonight, we admit. Busy week. A good sign, really.");
    if (late) pool.push("Up at this hour too? Then we are in excellent company. The machine never sleeps either.");
    if (c.prisoners > 0) pool.push(`${c.prisoners} in the cells just now — but nobody who talked to us early. Talking early is the whole trick.`);
  } else if (c.loan.stage === 0) {
    pool.push(
      "Punctual! Genuinely, thank you. Do say if you would like more.",
      "Your account is current and it is a pleasure to say so.",
      `Interest is due at midnight, ${c.name} — we mention it only so it never surprises you.`,
      "A customer in good standing. Our favourite kind, and rarer than you would think.",
    );
    if (c.purse < c.loan.interest) pool.push("Tonight's interest is a touch above your purse. Come and see us before midnight rather than after; it is much easier before.");
  } else if (c.loan.stage === 1) {
    pool.push(
      "One day, that is all. We had to put the mark up — the terms make us — and we will take it down the moment you settle.",
      `Nothing to panic about, ${c.name}. One missed day is a fee and a mark. Two is where it starts to hurt.`,
      "We do not like writing to people about money. Settle today and we can go back to not doing it.",
      "The rate has stepped up. That part is automatic. Everything else is still entirely friendly.",
    );
  } else if (c.loan.stage === 2) {
    pool.push(
      "We are taking a quarter of your purse on every visit now. You agreed to that. We would still rather not.",
      "Two days. We have written, you have read, and you have not answered. That is not how this works.",
      `Every day you leave it, the number gets bigger, ${c.name}. We did not design that to be kind.`,
      "The next rung is your collection. We are telling you now so that you cannot say nobody did.",
    );
  } else if (c.loan.stage === 3) {
    pool.push(
      "Your collection is on our shelf. You may buy it back. Others may buy it first.",
      "We have stopped calling you friend. You will have noticed. It is simply no longer accurate.",
      "Cheapest first, five times what the Trader pays. That is not a punishment, it is a price list.",
      "Your name is in the book. The book has never once been wrong.",
    );
  } else {
    pool.push(
      "There is a cell with your name being engraved on it as we speak.",
      "Nothing leaves your hands now. Except to us.",
      "Visiting hours in the cells are all hours. Bail is not.",
      "You were so pleased with us once. We remember it. We remember everything.",
    );
  }
  // Deterministic-ish per quarter hour, so it doesn't flicker on every render.
  const idx = Math.floor(Date.now() / 900_000) % pool.length;
  return pool[idx] ?? pool[0] ?? "";
}
