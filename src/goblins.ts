// GOBLIN LENDERS — the goblins' VOICE (Josh, Sep 2026).
//
// The bank had a kiosk, a machine and a ladder, and never said a word unless
// you walked up to it. Two things now, both RARE on purpose:
//
//   1. THE LETTER — "lets have the lender rarely and randomly send users a dm
//      offering interest deals for loans to entice them with their predatory
//      loans. make it personal, bring up losing streaks, lack of money, etc."
//      A personal DM: a salutation, one or two hooks drawn from the person's
//      actual file (an empty purse, a run of blanks on the Wheel, a dry spell
//      on the slots, lottery tickets that never drew, no shield, a past life,
//      an emoji of theirs on the repo shelf…), and THE OFFER — a real
//      introductory rate, points off every window for 48 hours, written into
//      their file so the kiosk shows it and `takeLoan` honours it. The
//      predatory half is in the small print: the teaser dies on the FIRST
//      missed day (the step lands on the posted rate — see collectFrom), and
//      the ladder is exactly as unkind as ever.
//
//   2. THE BARKER — "a rare event where the greedy goblins post in general
//      offering their services and have sterling reply to post scolding them
//      for overstepping their bounds." A post in #general built from three
//      pools (opener · pitch · closer) so the same combination almost never
//      recurs, Sterling's reply built the same way, and — some of the time —
//      one goblin retort he does not dignify with a second answer.
//
// The goblins are a real users row (isBot=1, can't log in) like Sterling, so
// their letters and posts ride the ordinary DM/message pipelines. Nothing
// here moves silver: the offer is a RATE, applied by the store when a window
// is signed, and a lower rate is less interest returning to the vault, never
// a coin minted. Every dial is env for the harness.

import { randomInt } from "node:crypto";
import { json, type Router } from "./http";
import type { Store } from "./db/store";
import type { Bus } from "./bus";
import type { Sterling } from "./sterling";
import { toPublicUser, type Channel, type MessageWithAuthor, type User } from "./types";
import { RATES, TIERS, maxTierFor, minWorth, stageFor, teaserRate, type LoanTier } from "./lender";
import { SELL_PRICES } from "./shop";
import { TALISMAN_CODE } from "./wheel";
import { effectiveVipRank } from "./vip";
import { beatFailed, heartbeat } from "./health";
import { houseIsOpen, HOUSE_OPEN_SHARE } from "./househours";
import { voiced, voiceAvailable } from "./npc/voice";

export const GOBLINS_USERNAME = "goblins";
export const GOBLINS_NAME = "Goblin Lenders";

const TICK_MS = Number(process.env.GOBLIN_TICK_MS ?? 600_000); // 10 min
/** 1-in-N per tick that a letter goes out to SOMEBODY on the floor. */
const PITCH_ODDS = Number(process.env.GOBLIN_PITCH_ODDS ?? Math.round(9 * HOUSE_OPEN_SHARE));
/** One letter per person per this long — a lender, not a spammer. */
const PITCH_GAP_MS = Number(process.env.GOBLIN_PITCH_GAP_MS ?? 5 * 86_400_000);
/** The introductory rate stands for this long from the letter. */
export const OFFER_MS = Number(process.env.GOBLIN_OFFER_MS ?? 48 * 3_600_000);
/** Only people seen this recently get letters — ink is wasted on ghosts. */
const RECENT_MS = Number(process.env.GOBLIN_RECENT_MS ?? 10 * 86_400_000);
/** The barker: at least this long between posts, then 1-in-N per tick. */
const BARKER_GAP_MS = Number(process.env.GOBLIN_BARKER_GAP_MS ?? 4 * 86_400_000);
const BARKER_ODDS = Number(process.env.GOBLIN_BARKER_ODDS ?? Math.round(200 * HOUSE_OPEN_SHARE));
/** Sterling's reply lands after this (he reads it first). */
const SCOLD_MS = Number(process.env.GOBLIN_SCOLD_MS ?? 6_500);
/** The goblins' retort, when they dare (a share of barks), after this. */
const RETORT_MS = Number(process.env.GOBLIN_RETORT_MS ?? 9_000);
const RETORT_SHARE = 0.4;
/** They answer a command after a beat, like Sterling — nobody types that fast. */
const REPLY_MS = Number(process.env.GOBLIN_REPLY_MS ?? 900);

const GREETINGS = [
  "{name}! Come in, come in. Mind the ledger — it is heavier than it looks.",
  "Ah, {name}. A pleasure. Genuinely; we do not get many visitors who only want to talk.",
  "{name}. Sit, stand, browse. Nobody is ever hurried at this counter.",
  "A customer! Or a passer-by, which is just as welcome and considerably quieter.",
  "{name}, welcome to Concession No. 3. The corner the automaton pretends isn't here.",
];

/** Their position on Sterling — and it is not defensive. They find his
 *  disapproval delicious, and they are entirely correct about the lease. */
const ON_STERLING = [
  "The automaton? He loathes us, {name}. Openly. It is the best advertising we have ever not paid for.",
  "Sterling was BUILT by the people who took our bullion and sold us this corner. He objects to the tenants his owners chose. We find that very moving.",
  "He says interest makes nothing. He runs a wheel that eats a life in one spin out of thirty-two. We have never killed anybody, {name}. We have merely made them wish.",
  "We like him, actually. He is the only thing on this floor older than the debt.",
  "His objection is on file upstairs. It has been on file for a very long time. Filing is what the board does instead of listening.",
  "He warns people about us by name, {name}. Every warning is a free and accurate description of our rates. We could not improve on it.",
  "He will not have our collectors on his carpet. We have never once put them there. A doorway is not a carpet, and he knows it.",
];

/** And on Voss — a different flavour entirely. She will not price a relic as
 *  collateral, which they respect and resent in roughly equal measure. */
const ON_VOSS = [
  "The woman in the warehouse? We have asked her twice to let us value a relic as collateral. Twice she said no. We admire a hard no. We just prefer a yes.",
  "Doctor Voss pays silver for things nobody else can fetch, {name}. That makes her a lender too. She simply calls it a research budget and doesn't charge interest, which we regard as an oversight.",
  "She sends people through a hole in a wall for money. We lend people money and let them choose the hole. Ask yourself which of us is the honest business.",
  "We have noticed — purely as a matter of record-keeping — that people who owe us take the deeper contracts. She has noticed it too. Neither of us has done anything about it.",
  "Our machine is between her door and the exit, {name}. Somebody upstairs decided that. We only paid for it.",
  "She keeps a column for the ones who do not come back. We keep a column for the ones who do not pay. Hers is shorter, {name}, and we are not sure that reflects well on anybody.",
  "A woman who walked into a hole in a wall on purpose is not somebody we would lend to. We say that with enormous professional respect.",
];
/** Points off every window's daily rate — the letter picks one. */
const OFFER_CUTS = [0.05, 0.07, 0.10] as const;

function pick<T>(arr: readonly T[]): T {
  return arr[randomInt(arr.length)];
}
function fill(line: string, slots: Record<string, string | number>): string {
  return line.replace(/\{(\w+)\}/g, (_, k) => String(slots[k] ?? ""));
}
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const pct = (r: number) => `${Math.round(r * 100)}%`;
function timeOfDay(hourUtc: number): string {
  // The floor is American; UTC 4–9 is the small hours there (Sterling's band).
  if (hourUtc >= 4 && hourUtc < 10) return "small hours";
  if (hourUtc >= 10 && hourUtc < 17) return "morning";
  if (hourUtc >= 17 && hourUtc < 23) return "afternoon";
  return "evening";
}

// ---------------------------------------------------------------------------
// THE FILE — what the goblins know about you (they know everything the
// house records, and they read it more carefully than the house does).

export interface GoblinFacts {
  name: string;
  purse: number;
  worth: number;
  limit: number;
  maxTier: LoanTier | null;
  hour: number;
  gambled: number;
  slotsPulls: number;
  spins: number;
  blinks: number;
  /** Consecutive blanks on the Wheel, right now. */
  blanks: number;
  /** Consecutive coinless pulls on the slots, right now. */
  dry: number;
  sold: number;
  loansRepaid: number;
  loansTaken: number;
  lotteryTickets: number;
  lotteryWins: number;
  generation: number;
  hasShield: boolean;
  everJailed: boolean;
  everSealed: boolean;
  /** Their own emoji sitting on the repo shelf. */
  onShelf: number;
  vipRank: number;
}

export function gatherFacts(store: Store, u: User): GoblinFacts {
  const purse = store.getCoins(u.id);
  const worth = store.collectionValue(u.id);
  const s = store.statsOf(u.id);
  const events = store.loanEvents(u.id, 400);
  return {
    name: u.displayName || u.username,
    purse,
    worth,
    limit: (purse + worth) * 3,
    maxTier: maxTierFor(purse, worth, minWorth(SELL_PRICES.common ?? 0)),
    hour: new Date().getUTCHours(),
    gambled: s.gambled ?? 0,
    slotsPulls: s.slots_pulls ?? 0,
    spins: s.spins ?? 0,
    blinks: s.reaper_blinks ?? 0,
    blanks: s.wheel_blanks ?? 0,
    dry: s.slots_dry ?? 0,
    sold: s.emoji_sold ?? 0,
    loansRepaid: s.loans_repaid ?? 0,
    loansTaken: s.loans_taken ?? 0,
    lotteryTickets: store.lotteryTicketsBought(u.id),
    lotteryWins: s.lottery_wins ?? 0,
    generation: u.generation ?? 1,
    // A retired reaper (Pandora's box) makes the shield a keepsake, so a
    // letter that sells against an empty shield shelf would be selling fear
    // of nothing: read as shielded.
    hasShield: store.getInventory(u.id).some((e) => e.code === TALISMAN_CODE) || store.pandoraFlag("retire-reaper") != null,
    everJailed: events.some((e) => e.kind === "jailed"),
    everSealed: events.some((e) => e.kind === "sealed"),
    onShelf: store.goblinShelf(500).filter((r) => r.fromUserId === u.id).length,
    vipRank: effectiveVipRank(u),
  };
}

// ---------------------------------------------------------------------------
// THE LETTER

// THE MASK IS ON IN THE SALES HALF (Josh, Sep 2026: "very fake and sketchy
// like getting you to get a loan from them. then afterwards they switch up on
// you"). Nothing in a salutation, a hook, an offer or a bark says a true
// unkind thing about the reader, and nothing boasts about the trap — a lender
// who opens with "we want the big ones to fail" never gets a signature, and
// more to the point the player never gets to feel taken in. EVERY cruel line
// that used to live up here has moved somewhere it belongs: into SMALL_PRINT,
// which nobody reads, into Sterling's scold, where it reads as him being
// unfair until the day it doesn't, and into DUN below, which is where they
// stop pretending. Keep it that way.
const SALUTATIONS = [
  "{name}! Our favourite kind of customer: one we haven't had the pleasure of yet.",
  "Dearest {name}, valued neighbour, and — we hope — friend:",
  "A note from the little machine by the doors, {name}. We hope we are not intruding.",
  "{name}. We have been meaning to write for some time and kept losing our nerve.",
  "To {name}, from the people with the vault and nobody to lend it to:",
  "Good {tod}, {name}. The goblins of Concession No. 3 send their warmest regards and a small proposition.",
  "{name} — forgive the letter. We would have come over, but the machine is bolted down and so, largely, are we.",
  "Friend {name}! And we do mean friend; we are new here and we are counting.",
  "{name}, four systems we crossed, and of everyone on this floor it is you we wanted to write to.",
  "Salutations, {name}. This will take one minute and cost you nothing, which is more than the Wheel can say.",
];

interface Hook { weight: number; lines: string[] }

/** Every hook the file supports, with the weight that decides which lead. */
function hooksFor(f: GoblinFacts): Hook[] {
  const out: Hook[] = [];
  const add = (weight: number, lines: string[]) => out.push({ weight, lines });
  if (f.purse < 200)
    add(5, [
      "We couldn't help noticing: {purse} silver. Nobody should have to play this floor on {purse} silver. We have rather a lot of it and nothing to do with it.",
      "A thin week, {name}? We have them too — well, we don't, but we remember them. There is a vault twelve steps from the doors and it is embarrassingly full.",
      "{purse} silver to your name, and a floor full of things worth doing. That gap is the only problem you have, and it is the one problem we are good at.",
      "A purse of {purse}. That is not a judgement, it is an observation, and observations are free. So, as it happens, is walking over to talk to us.",
    ]);
  else if (f.purse < 3_000 && f.gambled >= 2_000 && f.gambled >= f.purse * 8)
    add(4, [
      "{gambled} silver across the tables, lifetime, and {purse} left in hand. The house has had a long turn at you, {name}. We think you are owed one back.",
      "By our count you have staked {gambled} silver on this floor and hold {purse}. That is not bad luck, that is a house edge, and the only answer to a house edge is enough silver to outlast it.",
      "Staked {gambled}. Holding {purse}. You have been playing this floor honestly and it has not been playing you the same way. Let us put something in your hand.",
    ]);
  if (f.blanks >= 4)
    add(6, [
      "{blanks} blanks in a row on the Wheel. We watched some of those and winced, we don't mind saying. A spin is five hundred silver and we happen to have five hundred silver.",
      "The Wheel has come up empty for you {blanks} times running. Cold streaks end, {name} — they always end. The only real danger is running dry the spin before they do.",
      "{blanks} straight blanks is not you, it is arithmetic having a joke. Jokes end. Be holding something when this one does.",
      "A run of {blanks} on the Wheel. Sterling will tell you that's variance and leave it there. We'd rather do something about it.",
    ]);
  if (f.dry >= 10)
    add(6, [
      "{dry} pulls on the slots without a coin back. The machine is due. Everyone knows the machine is due. Don't let a light purse be the reason you weren't sitting there.",
      "We heard the slots eating your silver from across the hall — {dry} straight. A streak like that turns, {name}. It always turns. Be there when it does; we'll see you're funded.",
      "{dry} dry pulls. The cabinet doesn't know your name, but the crown does, and it's three symbols from spelling it. Ten silver a pull. We do multiples of ten.",
    ]);
  if (f.lotteryTickets >= 5 && f.lotteryWins === 0)
    add(3, [
      "{tickets} lottery tickets, no draw. The pot doesn't know your name yet. Tonight's ticket is twenty-five silver. Tomorrow's, too. Let us see you never miss one.",
      "Midnight has passed you over {tickets} times. Statistically insulting. Financially, fixable.",
    ]);
  if (!f.hasShield)
    add(f.blinks >= 1 ? 5 : 2, f.blinks >= 1
      ? [
          "The reaper has blinked at you {blinks} time{s}. Blinked, {name}. Not missed — blinked. The shield is thirty thousand at Sterling's counter, and our smallest window is a thousand. You can see how the arithmetic goes.",
          "{blinks} close call{s} on the death wedge and still no talisman on the shelf. We admire the nerve. We'd rather finance the shield.",
        ]
      : [
          "No talisman on your shelf, and the reaper's patience is a finite quantity. Sterling sells the shield for thirty thousand. We sell the thirty thousand.",
          "You spin unshielded. Bold. The shield costs thirty thousand, which sounds like a lot until you price a whole collection at the graveyard gate.",
        ]);
  if (f.generation >= 2)
    add(4, [
      "Generation {generation}. You've died on this floor already — you know what it costs, and what an heir walks out with. The shield is thirty thousand. Ask us how.",
      "A second life, {name}, and a purse of {purse} to show for the first. You rebuilt once from nothing. Nobody should have to do that twice, and nobody with a shield does.",
    ]);
  if (f.loansRepaid >= 1 && !f.everJailed)
    add(3, [
      "A repaid account! We keep those in a special drawer. Valued customer, returning customer, PREFERRED customer — the terms below are for you.",
      "You've settled with us before, in full and on time. Frankly it unsettled us. Come back and let us make it up to you.",
    ]);
  if (f.everJailed)
    add(3, [
      "You've sat in our cells. Bygones, entirely — we hold no grudges, we hold collateral, and the two are quite different. The window is still open to you.",
      "Our records show a stay in the cells. Our records also show you walked out, which is more than most. Walk back in through the front this time.",
    ]);
  if (f.onShelf >= 1)
    add(5, [
      "{onShelf} of your emoji are still on our shelf, and it has bothered us. Anyone may buy them, which we think is a shame. Come and take them home — we will lend you the silver to do it.",
      "We still have {onShelf} of yours. We would honestly rather you had them than a stranger, and we will fund that preference at a friendly rate.",
    ]);
  if (f.sold >= 40)
    add(2, [
      "You've sold {sold} emoji to Sterling for pocket change. Fifty silver a common! We'd have lent you the whole amount and let you KEEP the collection. Interest, yes. Dignity, also yes.",
    ]);
  if (f.gambled >= 100_000)
    add(3, [
      "{gambled} silver through the tables. A person of appetite. Appetite needs feeding, and the Wheel only feeds you seven times every two hours. We feed you whenever you like.",
      "We have watched {gambled} silver cross the felt under your name. Magnificent. A player of that size should never once have to stop for want of stake, and with us you never would.",
    ]);
  if (f.vipRank >= 3 && f.purse < 5_000)
    add(4, [
      "A member of the Room — every legendary in the book — with {purse} silver in hand. The collection alone opens our biggest windows. Wealth on the shelf, nothing in the pocket. We fix exactly that.",
      "Magnate. Complete, perhaps. And {purse} silver. Sterling gives you a chair by the fire; we'd give you something to spend while you sit in it.",
    ]);
  if (f.hour >= 4 && f.hour < 10)
    add(1, [
      "Writing at this hour because you are reading at this hour, and it is nice to know somebody else is up. The machine doesn't sleep either.",
    ]);
  if (!out.length)
    add(1, [
      "We've looked at your file. Thin. We'd like to thicken it.",
      "You don't need us today. That is the best time to meet a lender: before you're desperate, while the rates are still polite.",
      "A collection worth {worth} at Sterling's counter, {purse} in the purse. Our arithmetic says you could be holding {limit}. Our arithmetic is never wrong; it is occasionally cruel.",
      "Nothing is wrong with your account. That's what worries us. Let us put something in it.",
    ]);
  return out;
}

const OFFERS = [
  "So, the proposition. For the next {hours} hours every window is {points} points cheaper for you — the {tier} at {rate} a day, not {base}. An introductory rate. It is written in your file, it is real, and it expires.",
  "OUR OFFER, valid {hours} hours: {points} points off every window. The {tier} at {rate} a day instead of {base}. Nobody else on the floor has this rate. Nobody else was written to.",
  "For you, {name}, and for {hours} hours only: {points} points under the posted rates — the {tier} window at {rate} daily, where the card says {base}. Walk to the machine. Press the window. The rate will already be waiting.",
  "The terms: {points} points off, any window, for {hours} hours from the moment this letter left our claws — the {tier} at {rate} a day where everyone else pays {base}. After that the window forgets your name.",
  "An introductory rate, then. {points} points off every window for {hours} hours: your {tier} at {rate} a day, not the {base} on the card. We rarely write. We never write twice at this price.",
];
/** Exported so a harness can assert the letter carries a REAL one of these,
 *  rather than hoping a loose regex matches whichever of two random pools it
 *  drew — that assert flaked about one run in four (Sep 2026 review). */
export const SMALL_PRINT = [
  "Miss a day and the rate reverts, plus the usual point. We are generous, not stupid.",
  "The introductory rate lasts exactly as long as you pay on time. That's what introductory means.",
  "(The ladder is unchanged. The cells are unchanged. Only the rate is kind, and only for now.)",
  "One missed payment and it's the posted rate plus a point, as ever. Read that twice. Everyone reads it once.",
];
const SIGN_OFFS = [
  "— Goblin Lenders, Concession No. 3. By the doors, and always open. Do come and say hello either way.",
  "Yours in perpetuity (that's the contract talking), the Goblin Lenders.",
  "The machine is by the entrance. Left of the doors. You've walked past it a hundred times. Stop walking past it.",
  "With warm regards and colder terms, C.P.L.",
  "P.S. Sterling doesn't know we wrote. Sterling doesn't need to know. Sterling doesn't lend.",
  "Come by. Bring nothing. That's the point.",
  "Regards from four systems away and one corner over — the Goblin Lenders.",
  "We look forward to your business, {name}, and rather more to your company.",
];

/** The letter, composed from the file. Pure: the harness reads it too. */
export function writeLetter(f: GoblinFacts, offer: { off: number; until: number }, now = Date.now()): string {
  const tier = f.maxTier ?? TIERS[0];
  const base = RATES[tier];
  const slots: Record<string, string | number> = {
    name: f.name,
    tod: timeOfDay(f.hour),
    purse: fmt(f.purse),
    worth: fmt(f.worth),
    limit: fmt(f.limit),
    gambled: fmt(f.gambled),
    blanks: f.blanks,
    dry: f.dry,
    tickets: f.lotteryTickets,
    blinks: f.blinks,
    s: f.blinks === 1 ? "" : "s",
    generation: f.generation,
    onShelf: f.onShelf,
    sold: fmt(f.sold),
    hours: Math.max(1, Math.round((offer.until - now) / 3_600_000)),
    points: Math.round(offer.off * 100),
    tier: fmt(tier),
    rate: pct(teaserRate(base, offer.off)),
    base: pct(base),
  };
  const hooks = hooksFor(f).sort((a, b) => b.weight - a.weight);
  const paras: string[] = [fill(pick(SALUTATIONS), slots)];
  // The strongest hook always leads; a second, different one half the time.
  paras.push(fill(pick(hooks[0].lines), slots));
  if (hooks.length > 1 && randomInt(2) === 0) paras.push(fill(pick(hooks[1 + randomInt(hooks.length - 1)].lines), slots));
  paras.push(fill(pick(OFFERS), slots) + " " + pick(SMALL_PRINT));
  paras.push(fill(pick(SIGN_OFFS), slots));
  return paras.join("\n\n");
}

// ---------------------------------------------------------------------------
// THE DUNNING LETTERS (Josh, Sep 2026: "get more and more agressive the later
// you are on payments sending you messages and DMs till you pay… i dont want
// them to harrass the players but defintely the players get the vibe of like
// 'they were so helpful with me getting a loan' to 'these absolute scammers,
// i cant stand these goblins'").
//
// This is the second half of the arc and the only place the goblins ever
// address somebody who has already signed. The pools below are indexed BY
// LADDER STAGE, and the turn across them is the whole point: stage 1 is a
// friend apologising for having to mention it, stage 4 is a collector who has
// stopped pretending there was ever a friend.
//
// THE ESCALATION IS IN THE WORDS, NOT THE VOLUME — that is what keeps "i dont
// want them to harrass the players" true while still earning the vibe:
//
//   · Nothing at stage 0. You are paid up; they adore you.
//   · Nothing at stage 5 either. They have you; the cell does the talking.
//   · One letter per DUN_GAPS[stage], which tightens as you fall — so the
//     worst rung on the ladder is about two and a half letters a day, and
//     only ever while the house is open.
//   · A BOT'S DM NEVER PUSHES (push.ts skips bot authors), so not one of
//     these can reach a phone. The single push a debtor gets is the
//     collectors' visit, once a day, on a replacing tag. Check that still
//     holds before widening anything here.
export const DUN_GAPS: number[] = [
  0, // 0 — current. Silence, and warmth if you come to the kiosk.
  Number(process.env.GOBLIN_DUN_GAP_1 ?? 24 * 3_600_000), // 1 MARKED
  Number(process.env.GOBLIN_DUN_GAP_2 ?? 18 * 3_600_000), // 2 GARNISHED
  Number(process.env.GOBLIN_DUN_GAP_3 ?? 12 * 3_600_000), // 3 REPOSSESSION
  Number(process.env.GOBLIN_DUN_GAP_4 ?? 9 * 3_600_000), // 4 FROZEN
  0, // 5 — jailed. They have you.
];

/** What a dunning letter is allowed to know. Deliberately small: what you
 *  owe, how late, and who you are. */
export interface DunFacts {
  name: string;
  /** Principal + today's interest, in silver. */
  payoff: number;
  /** Today's interest alone — the number that makes tomorrow worse. */
  interest: number;
  /** Days missed, which is also the rung. */
  missed: number;
  /** The rate now in force, as a fraction (0.15 = 15%/day). */
  rate: number;
  /** Emoji of theirs currently on the repo shelf. */
  onShelf: number;
}

/** Indexed by stage. 0 and 5 are never drawn from — see DUN_GAPS. */
const DUN: string[][] = [
  [],
  // ---- 1 · MARKED. Mortified to have to mention it. Still "friend". ----
  [
    "{name}, forgive us — a small thing and we hate raising it. Yesterday went by without a payment. The fee has gone on automatically; we do not get a say in that part. It is {payoff} silver to clear the whole thing and we would love nothing more than to take your name back out of the book this afternoon.",
    "Friend, a gentle word. One day missed. It happens to everyone and it has happened to you, and the only reason we are writing at all is that the book is public and we would rather you heard it from us. {payoff} silver and it is behind you.",
    "{name} — we do not want to be a nuisance. But a day has gone by, the rate has stepped to {rate} a day, and the mark is up where the floor can see it. None of that was our choice. All of it comes off the moment you settle: {payoff} silver.",
    "A note, kindly meant. You are one day behind. We have been in business a long time and we can tell you honestly that one day is nothing — it is two that starts to cost. Today's interest alone is {interest}. Do come and see us.",
    "{name}! Not a complaint, a reminder. {payoff} to clear. And should today be a bad day for it, come and talk to us anyway — we are far easier to deal with in person than the machine makes us look.",
  ],
  // ---- 2 · GARNISHED. Hurt. Disappointed. The warmth is doing work now. ----
  [
    "{name}. We took a quarter of your purse this morning. We did not enjoy it and we are not going to pretend we had a choice — you agreed to it, in the fourth paragraph, and we are obliged to the letter. {payoff} clears the account and stops us having to do it again tomorrow.",
    "Two days now. We wrote to you. You read it. You have not answered, and we have started taking the payments ourselves, which is a poor way for anyone to do business. {payoff} silver, {name}, and we go back to being pleasant.",
    "You were so glad to see that silver. We remember; we were glad too. This is the other half of the arrangement and it is the half nobody enjoys. A quarter of your purse, every visit, until the day's {interest} is covered.",
    "{name}, be reasonable with us. We have garnished {interest} worth of interest out of your purse because it was that or the ladder, and the ladder is worse. The next rung is your collection. We would very much rather not.",
    "Our patience is a real thing and it is not free. Two days, a stepped rate of {rate}, a quarter off every visit. {payoff} ends it today. We are asking nicely, and we would like that noted, because we will not be asking nicely for much longer.",
  ],
  // ---- 3 · REPOSSESSION. Cold. Nobody is anybody's friend now. ----
  [
    "Your collection is going on our shelf, {name}. Cheapest first, priced for the public, and anyone at all may buy it. This is not spite. It is paragraph nine, and you have had three days to pay {payoff}.",
    "{onShelf} of your emoji are on the shelf as of this morning. We are told that stings. Good — the sting is the mechanism. {payoff} silver and we stop listing them.",
    "Three days. You have stopped answering and we have stopped asking. We sell what we take at five times what the Trader pays, so understand clearly: {payoff} today is the cheapest this will ever be again.",
    "We called you friend for a while. You will notice we have stopped. That was not a slip; it is simply no longer accurate. The account stands at {payoff} and the shelf is filling.",
    "{name}. The next rung freezes your hands — no trade, no auction, nothing out. The one after that is a cell. {payoff} stops both. We are telling you this the way a timetable tells you the time: without feeling, and correctly.",
  ],
  // ---- 4 · FROZEN. Openly hostile. The letter is a threat with a number. ----
  [
    "Nothing leaves your hands now, {name}. Not a trade, not an auction, not a gift to a friend. You may still gamble — we insist on that one, and you should ask yourself why. {payoff}. Tonight.",
    "Four days. You have been marked, garnished, and sold off a piece at a time, and you have said nothing to us at all. One more and we stop collecting from your purse and start collecting YOU. {payoff} silver. The cell is warm, dry, and forty-eight hours long.",
    "You called us helpful once. We have the message. We keep everything — that is rather the business we are in. Read it back, then read this, and decide which of the two you would like to be dealing with tomorrow. {payoff} silver.",
    "{name}, we are past discussion. {payoff} silver, or bail at half again on top once you are inside, or the estate when the cell seals and we take it off the top of everything you own. Those are the three doors. Two of them are ours.",
    "There is a cell with your name on it and a goblin doing the engraving, and he is not hurrying, because he does not have to. {interest} a day accrues while he works. Pay us.",
  ],
  [],
];

/** One dunning letter. Pure, so the harness can walk the whole ladder without
 *  a clock — and so the turn in register stays inspectable. */
export function writeDun(stage: number, f: DunFacts): string | null {
  const pool = DUN[stage];
  if (!pool?.length) return null;
  return fill(pick(pool), {
    name: f.name,
    payoff: fmt(f.payoff),
    interest: fmt(f.interest),
    missed: f.missed,
    rate: pct(f.rate),
    onShelf: f.onShelf,
  });
}

// ---------------------------------------------------------------------------
// THE BARKER — three pools each side, so a rare event never repeats itself.

const BARK_OPEN = [
  "ATTENTION, FLOOR.",
  "A public service announcement from Concession No. 3.",
  "Good {tod}, gamblers, collectors and the recently bereaved.",
  "Pardon the interruption — we paid for this corner and we intend to use it.",
  "Hear ye, hear ye, and hear us in particular.",
  "This message brought to you by the machine left of the doors.",
  "Friends! (Legally, customers.)",
  "The Goblin Lenders would like a word with everyone at once. It's cheaper.",
  "We were told not to post here. We looked at the lease. The lease says nothing about posting.",
  "Interrupting your evening with something more interesting than your evening:",
  "To the room, with love and a rate card —",
  "Announcement. Not a house announcement. A better one.",
  "Is this thing on? It is. Everything of ours is always on.",
];
const BARK_PITCH = [
  "Silver, on the spot, no questions we haven't already answered by looking at you. 1,000 to 1,000,000. Four windows. One signature.",
  "The vault stands at {vault} silver tonight and every coin of it is lonely. Come and take some. Interest is due daily, which is to say: tomorrow is tomorrow's problem.",
  "Lost at the tables? Lost on the Wheel? Lost your last talisman? We have a window for each of those and they all pay out immediately.",
  "Why sell a legendary to Sterling for a couple of thousand when you could keep it AND hold ten? Because you haven't met us. Meet us.",
  "Introductory rates for new accounts. Returning accounts. Accounts that went badly the first time. Everyone. We are not proud; we are liquid.",
  "The shield at Sterling's counter is 30,000 silver. Our smallest window is 1,000 and we will happily lend you thirty of them. Death is optional and we sell the option, in instalments.",
  "No credit check. No forms. No lecture from anybody about what you ought to be spending it on.",
  "Ask anyone who has signed with us how fast the silver came. Go on, ask them. They will all tell you the same thing: it was in hand before they finished reading.",
  "The Wheel gives you seven spins every two hours and then shuts the gate. We give you five hundred silver a spin, as many as you like, and no gate at all.",
  "Loans, a shelf of rare pieces, and a hand for a friend who needs one: a full-service bank. The only bank on this floor, since the house 'doesn't lend'. We noticed.",
  "Our terms fit on a card. Our late fees fit on a much larger card. Read the small one first.",
  "The mythic counter is closed to debtors? Buy the mythic FIRST, then borrow. We're not lawyers. We're worse.",
  "A million silver at thirty percent a day, to anyone whose collection can carry it. Say it out loud. Feel how it sounds. Then come and sign.",
  "We crossed four systems for this corner. The least the floor can do is walk twelve steps to it.",
  "Rare emoji on our shelf at prices the Trader would faint at — all of it legitimately come by, all of it available to the first person with silver. Which could be you, with silver, from us.",
  "The goblins' guarantee: you will never be turned away for being poor. Every other door on this floor asks what you have. Ours asks what you need.",
  "Fifteen percent a day on the small window. Say it quickly and it is nothing. We say it quickly. Everyone does.",
];
const BARK_CLOSE = [
  "Left of the doors. Walk twelve steps past the coat-check. Bring your name.",
  "The kiosk under the casino hub is open around the clock, and so, cheerfully, are we.",
  "Sterling will say something in a moment. He always does. Notice that he never once says the rates aren't real.",
  "Terms on the card. Silver in the hand. In that order, but only just.",
  "Thank you for your attention. It is the only thing on this floor nobody charges for.",
  "Everyone is welcome. That is not a slogan, it is a business model.",
  "No rush. The window will still be there tomorrow, and so will we, and so — we hope — will you.",
  "Sign today, or don't, and come and talk to us anyway. We are new here and the corner is quiet.",
  "Goblin Lenders. Concession No. 3. The Foundry's own paper says we may.",
  "That is all. Good luck out there, genuinely.",
  "We accept silver, collections, and conversation. Mostly we are hoping for the first.",
];

const SCOLD_OPEN = [
  "No.",
  "Absolutely not.",
  "I will say this once, and then I will say it again the next time, because you will do this again.",
  "Members, forgive the interruption to the interruption.",
  "Gentlemen. If the word applies.",
  "Concession No. 3.",
  "I have read your lease. I helped file it, under protest. Allow me to quote it.",
  "A word, since you wanted one.",
  "The machine by the doors is speaking out of turn.",
  "My ledger records that I objected to your presence. The objection stands, and now has an addendum.",
  "Ahem.",
  "The house notes, for the record, the following.",
  "Put that down.",
];
const SCOLD_BODY = [
  "Your concession is a bay of floor space, left of the entrance, one metre eighty-five tall. It is not the general channel. It is not the room. It is not the ear of everyone who walks past your machine.",
  "You bought a corner in bullion. You did not buy the floor, the felt, the jukebox, or the right to address my patrons as if they were yours.",
  "Interest is theft with patience, and you have now added impatience to it. Advertising. In my house.",
  "The Wheel prints its odds on the disc. The felt prints its edge on the felt. You print your terms in tiny writing and shout the rest. That is the difference between a house and a hole.",
  "There are {cells} in your cells tonight. Announce THAT. Announce the late fees, the point a day, the shelf where you sell a man's collection back to him. Then we will discuss what you may post.",
  "I was built by people who made things. You lend at thirty percent a day and call it a service. The Foundry would have melted you down for the copper in your cash box.",
  "My patrons may borrow from you. That is their right and my sorrow. They will not be SOLICITED in the one channel I keep clean for them.",
  "Your machine has a screen. Put your advertisement on it. That is what the screen is for. That is the whole of your lease.",
  "Every rate you just quoted is real, and every one of them is worse tomorrow. I am not disputing your terms. I am disputing your manners.",
  "You are a tenant. I am the house. A tenant who addresses the whole building from the lobby gets a letter from the house. Consider this the letter.",
  "The word for what you posted, on my home world — which is this one; I was struck in the basement — is overstepping. Step back.",
  "Twelve steps past the coat-check, you said. Yes. Twelve steps in from the door and not one further. That is the concession. The general channel is some four hundred steps past where you are permitted.",
  "Nobody on this floor mistakes you for the house. I will not have them mistake the general channel for your kiosk.",
  "I pour honest. I deal honest. I have never once written to a patron's private letters offering them a rope — and I know that you do.",
  "The lease grants floor space, power, and the right to be tolerated. Tolerance is not a megaphone.",
  "Sell your silver from your corner, in your corner, to people who walk to your corner. That sentence has three corners in it because you appear to need reminding where yours is.",
  "The vault you are so proud of holds {vault} silver. Mine holds every coin ever struck, and I have never once needed to shout about it.",
  // THE MASK IS HIS PROBLEM NOW (Sep 2026). The pitch above stopped admitting
  // what the ladder does, so the only voice on the floor still saying it out
  // loud is his — which is the whole trick: until the day you are late, he is
  // the one who sounds unreasonable.
  "Note that the rate RISES with the size of the window. Fifteen on a thousand, thirty on a million. Ask them why a bigger customer is a worse risk. Ask them slowly, and watch which of them answers.",
  "They have described a rate and called it the whole of the arrangement. It is not. Miss one day and the interest capitalises, a quarter goes on as a fee, and the rate steps up — forever, and never back down. That is not in the advertisement. It is on the card, in the writing you are not meant to finish.",
  "Charming, weren't they. They are always charming. I have watched this pitch land on four people this year and I have watched what came afterwards, and I am telling you plainly that it is not the same set of goblins.",
  "\"Everyone is welcome\" is true and it is not a kindness. Ask instead who is welcome to LEAVE, and at what price, and whether the answer is written anywhere you have read.",
  "{marked} on this floor currently wear their mark, and {cells} sit in their cells. They will not be putting that in the advertisement, so I am putting it here.",
];
const SCOLD_CLOSE = [
  "Delete nothing — let it stand as evidence. But post here again and I will have the jukebox play over you.",
  "The objection is filed. The file is thicker.",
  "Back to your bay. Left of the doors. Don't make me widen the coat-check.",
  "Members: the rope, the tables and the bar are all still honest. The corner is still not.",
  "That is all. The house resumes.",
  "I have noted the time and the words. I note everything. It is the only thing I was built to do that I still enjoy.",
  "Your vault is your business. My floor is mine. Mind the line between them; I painted it.",
  "We now return you to your evening, which was never theirs to interrupt.",
  "The next time you address the room, address it from a cell. I am told the acoustics are excellent.",
  "The board upstairs will hear of this. They will do nothing. I will still tell them.",
  "Members who feel the need may still walk the twelve steps. Walk them slowly.",
];
const RETORTS = [
  "Noted. The lease still says nothing about posting.",
  "He's not wrong about the rates. He's wrong about the manners. We have no manners. Never claimed any.",
  "Twelve steps, then. We've measured. The kiosk under the hub is zero steps. We'll be there.",
  "Filed under 'objections'. Big drawer. Silver drawer's bigger.",
  "The house is welcome to lend. The house does not lend. The house may therefore be quiet.",
  "We'll go quietly. The rates won't.",
  "Overstepping. Adorable. Our people have a word for a landlord who takes bullion and then complains. It's the same word as for the bullion.",
  "Understood. Withdrawing to the corner. The corner is open all night.",
  "He painted the line. We paid for the paint.",
];

/** EVERY LINE THE GOBLINS USE TO SELL — the mask, in one array, so the
 *  harness can hold it to the rule rather than trusting a comment to survive
 *  the next person with a good cruel idea. Nothing in here may name what the
 *  ladder does to you (see test_goblins.mjs): a pitch that admits the cells
 *  is a pitch nobody signs, and a player who was never charmed never gets to
 *  feel conned. The hooks are deliberately EXCLUDED — they are personal to
 *  the reader's own file and may name the reader's own situation. */
export const SALES_PITCH_LINES: string[] = [
  ...SALUTATIONS, ...OFFERS, ...SIGN_OFFS, ...BARK_OPEN, ...BARK_PITCH, ...BARK_CLOSE,
];
/** The dunning pools by stage, exported for the same reason: the turn in
 *  register is the feature, so it is pinned rather than admired. */
export const DUN_LINES: readonly string[][] = DUN;

// ---------------------------------------------------------------------------

/** Post as a bot through the ordinary message pipeline, optionally as a
 *  reply (the preview is hydrated exactly as the message route does it). */
export function postAs(store: Store, bus: Bus, botId: number, channelId: number, body: string, replyToId: number | null = null): MessageWithAuthor {
  const m = store.createMessage({ channelId, userId: botId, body, replyToId });
  let replyTo: MessageWithAuthor["replyTo"] = null;
  if (replyToId != null) {
    const r = store.getMessage(replyToId);
    if (r) {
      const ra = store.getUserById(r.userId);
      replyTo = {
        id: r.id,
        author: ra ? { id: ra.id, displayName: ra.displayName } : null,
        excerpt: r.deletedAt ? "" : r.body.slice(0, 200),
        deleted: r.deletedAt != null,
      };
    }
  }
  const enriched: MessageWithAuthor = {
    ...m,
    author: toPublicUser(store.getUserById(botId)!),
    reactions: [],
    replyTo,
    attachments: [],
  };
  bus.emit("message", { message: enriched });
  return enriched;
}

export type LetterRefusal = "no_user" | "not_eligible" | "loan_open" | "no_credit" | "too_soon" | "goblins_gone";
/** Why a DUNNING letter would be refused. Distinct from LetterRefusal: that
 *  gates the sales pitch, this gates the collections half. */
export type DunRefusal = "no_user" | "not_eligible" | "no_loan" | "not_late" | "in_custody" | "too_soon" | "goblins_gone";

export class Goblins {
  private bot: User;

  constructor(
    private store: Store,
    private bus: Bus,
    private sterling: Sterling,
  ) {
    this.bot = store.getUserByUsername(GOBLINS_USERNAME)!;
    setInterval(() => this.tick(), TICK_MS).unref?.();
  }

  get id(): number {
    return this.bot.id;
  }

  /** PANDORA'S "DESTROY THE GOBLINS" (PANDORA.md): once that world choice is
   *  taken the goblins are gone — no letters, no dunning, no barker, and
   *  /goblins finds a dark kiosk. The lender engine runs on as Foundry
   *  Lending (store.foundryLending). */
  get gone(): boolean {
    return this.store.foundryLending();
  }

  private tick(): void {
    heartbeat("goblins", TICK_MS);
    if (this.gone) return;
    try {
      this.maybeWrite();
      this.maybeDun();
      this.maybeBark();
    } catch (e) {
      beatFailed(this.store, "goblins", e);
    }
  }

  // ---- THE LETTER ----

  /** Who could be written to right now, each weighted by how much the file
   *  gives the goblins to work with. */
  private candidates(now = Date.now()): { u: User; weight: number }[] {
    const out: { u: User; weight: number }[] = [];
    for (const u of this.store.listUsers()) {
      const why = this.refusal(u, now);
      if (why) continue;
      if (now - this.store.lastSeenAt(u.id) > RECENT_MS) continue;
      const f = gatherFacts(this.store, u);
      out.push({ u, weight: 1 + hooksFor(f).reduce((n, h) => n + h.weight, 0) });
    }
    return out;
  }

  /** Why a letter to this person would be refused — null means write away. */
  refusal(u: User | undefined, now = Date.now()): LetterRefusal | null {
    if (this.gone) return "goblins_gone";
    if (!u || u.deletedAt) return "no_user";
    if (u.isBot || u.disabled || u.locked) return "not_eligible";
    if (this.store.loanOf(u.id)) return "loan_open";
    if (!maxTierFor(this.store.getCoins(u.id), this.store.collectionValue(u.id), minWorth(SELL_PRICES.common ?? 0))) return "no_credit";
    const last = Number(this.store.kvGet(`goblin_pitch:${u.id}`) ?? 0);
    if (now - last < PITCH_GAP_MS) return "too_soon";
    return null;
  }

  private maybeWrite(): void {
    // THE HOUSE'S HOURS apply to the goblins too (Josh, Sep 2026). A letter is
    // a push notification on somebody's phone; a letter at four in the morning
    // is a push notification nobody reads and a 48h rate cut whose first hours
    // are spent asleep. Their odds are shortened by the same share of the day
    // they lose, so they write exactly as often as before — just at hours when
    // a mark can be worked on. (The collectors' daily visit is NOT held back:
    // interest is owed by the accounting day, not by the house's opening
    // times, and its notice lands at the UTC boundary, which is evening here.)
    if (!houseIsOpen()) return;
    if (randomInt(PITCH_ODDS) !== 0) return;
    const cands = this.candidates();
    if (!cands.length) return;
    let roll = randomInt(cands.reduce((n, c) => n + c.weight, 0));
    for (const c of cands) {
      roll -= c.weight;
      if (roll < 0) {
        void this.write(c.u.id);
        return;
      }
    }
  }

  /** Write to one person: the offer into their file, the letter under their
   *  door. `force` skips only the once-per-gap rule (the admin's lever). */
  async write(userId: number, force = false): Promise<{ ok: true; letter: string; offer: { off: number; until: number } } | { ok: false; error: LetterRefusal }> {
    const u = this.store.getUserById(userId);
    const now = Date.now();
    const why = this.refusal(u, now);
    if (why && !(force && why === "too_soon")) return { ok: false, error: why };
    const f = gatherFacts(this.store, u!);
    const offer = { off: pick(OFFER_CUTS), until: now + OFFER_MS };
    // THE HOUSE'S BRAINS: the letter is composed from the file as ever, then
    // said in their own words (npc/voice.ts) — BEFORE the transaction, so the
    // offer and the letter that explains it still land together.
    const letter = await this.voiceLetter(writeLetter(f, offer, now), f.name, userId, true,
      "a personal letter to a prospect who owes you nothing, offering them an introductory rate — warm, flattering, helpful; the figures are the offer, so keep them exact");
    // The voicing took a moment; the refusal is re-asked so two paths can't
    // both write in that gap.
    const again = this.refusal(this.store.getUserById(userId), Date.now());
    if (again && !(force && again === "too_soon")) return { ok: false, error: again };
    // ONE TRANSACTION (Sep 2026 review): the offer, the gap stamp, the file's
    // row and the letter land together or not at all. A throw between them
    // used to leave a live 48h rate cut in app_kv with no letter explaining
    // it and no ledger row to find it by.
    const m = this.store.transaction(() => {
      this.store.setGoblinOffer(userId, offer.off, offer.until);
      this.store.kvSet(`goblin_pitch:${userId}`, String(now));
      this.store.logLoanEvent(userId, "letter", Math.round(offer.off * 100), `until ${new Date(offer.until).toISOString()}`);
      const conv = this.store.getOrCreateConversation(this.bot.id, userId);
      return this.store.createDmMessage(conv.id, this.bot.id, letter);
    });
    this.bus.emit("dm.message", { userIds: [this.bot.id, userId], message: { ...m, replyTo: null, attachments: [] } });
    return { ok: true, letter, offer };
  }

  // ---- THE DUNNING LETTERS ----

  /** Why a dunning letter to this person would be refused — null means send.
   *  Deliberately the mirror of `refusal` above: that one covers people who
   *  have NOT signed, this one covers people who have and are late. */
  dunRefusal(userId: number, now = Date.now()): DunRefusal | null {
    if (this.gone) return "goblins_gone";
    const u = this.store.getUserById(userId);
    if (!u || u.deletedAt) return "no_user";
    if (u.isBot) return "not_eligible";
    // A prisoner is not written to: the goblins have already got what they
    // were chasing, and the Cell screen is where the conversation continues.
    if (u.jailedAt) return "in_custody";
    // Nor is a corpse. A wake session reaches no ordinary route, so the letter
    // would sit unread until the grave sealed — and the goblins are paid off
    // the top of the estate anyway (settleGoblinDebt), so there is nothing
    // left to chase. The daily sweep already skips these; this is the lever.
    if (u.disabled) return "not_eligible";
    const loan = this.store.loanOf(userId);
    if (!loan) return "no_loan";
    if (loan.missed < 1) return "not_late";
    const gap = DUN_GAPS[stageFor(loan.missed)] ?? 0;
    if (!gap) return "not_late";
    if (now - Number(this.store.kvGet(`goblin_dun:${userId}`) ?? 0) < gap) return "too_soon";
    return null;
  }

  private maybeDun(): void {
    // THE HOUSE'S HOURS (househours.ts). A dunning letter is the house acting
    // on its own initiative, so it waits for the doors like the barker and
    // the sales letter — and that second-order effect matters here: with the
    // hall shut for six hours a day, even the stage-4 gap can only land about
    // two of these in twenty-four. Nobody is woken up by the goblins.
    if (!houseIsOpen()) return;
    // ONE PER TICK, server-wide, and the deepest in trouble goes first — the
    // letter-writer's rule. A character, not a mailing list.
    for (const d of this.store.markedDebtors()) {
      if (this.dunRefusal(d.userId)) continue;
      void this.dun(d.userId);
      return;
    }
  }

  /** Dun one debtor. `force` skips only the once-per-gap rule, exactly as the
   *  sales letter's lever does — it cannot invent a debt that isn't late. */
  async dun(userId: number, force = false): Promise<{ ok: true; letter: string; stage: number } | { ok: false; error: DunRefusal }> {
    const now = Date.now();
    const why = this.dunRefusal(userId, now);
    if (why && !(force && why === "too_soon")) return { ok: false, error: why };
    const u = this.store.getUserById(userId)!;
    const loan = this.store.loanOf(userId)!;
    const row = this.store.markedDebtors().find((d) => d.userId === userId);
    const stage = stageFor(loan.missed);
    const letter = writeDun(stage, {
      name: u.displayName,
      // what the counter would actually take today (Oct 2026 review)
      payoff: row?.settle ?? loan.principal,
      interest: row?.interest ?? 0,
      missed: loan.missed,
      rate: loan.rate,
      onShelf: this.store.goblinShelf(500).filter((r) => r.fromUserId === userId).length,
    });
    if (!letter) return { ok: false, error: "not_late" };
    const said = await voiced("goblins", letter, {
      situation: `a letter to a customer ${loan.missed} day${loan.missed === 1 ? "" : "s"} late on their loan — the friendliness thins with every missed day; the figures are what they owe, so keep them exact`,
      userId,
      scope: "private",
      must: [u.displayName],
    });
    if (this.dunRefusal(userId) && !force) return { ok: false, error: "too_soon" };
    const m = this.store.transaction(() => {
      this.store.kvSet(`goblin_dun:${userId}`, String(now));
      const conv = this.store.getOrCreateConversation(this.bot.id, userId);
      return this.store.createDmMessage(conv.id, this.bot.id, said);
    });
    this.bus.emit("dm.message", { userIds: [this.bot.id, userId], message: { ...m, replyTo: null, attachments: [] } });
    return { ok: true, letter: said, stage };
  }

  /** Say a composed letter in their own words, keeping THE SMALL PRINT
   *  verbatim: it names exactly what happens if you miss a day, it is
   *  allowed to (that is the joke — it's small print), and a rewrite under
   *  THE MASK would rightly refuse to say it. It goes back on as the last
   *  paragraph. With no model up, the letter is returned untouched. */
  private async voiceLetter(letter: string, name: string, userId: number, masked: boolean, situation: string): Promise<string> {
    if (!voiceAvailable()) return letter;
    const sp = SMALL_PRINT.find((x) => letter.includes(x));
    const brief = sp ? letter.replace(" " + sp, "").replace(sp, "") : letter;
    const said = await voiced("goblins", brief, { situation, userId, scope: "private", masked, must: [name] });
    return sp ? `${said}\n\n${sp}` : said;
  }

  // ---- THE BARKER ----

  private maybeBark(): void {
    // The barker is a set-piece for a room: the post, Sterling's scold under
    // it, and the retort under that. Played to an empty #general it is not a
    // rare event, it is a lost one.
    if (!houseIsOpen()) return;
    const last = Number(this.store.kvGet("goblin_bark_at") ?? 0);
    if (Date.now() - last < BARKER_GAP_MS) return;
    if (randomInt(BARKER_ODDS) !== 0) return;
    void this.bark();
  }

  /** Post in #general, and have Sterling answer. Returns the post, or null
   *  when there's no #general to bark in. */
  async bark(): Promise<MessageWithAuthor | null> {
    if (this.gone) return null;
    const general = this.sterling.general();
    if (!general) return null;
    const now = Date.now();
    this.store.kvSet("goblin_bark_at", String(now));
    const cells = this.store.prisoners().length;
    const marked = this.store.markedDebtors().length;
    const slots = {
      tod: timeOfDay(new Date(now).getUTCHours()),
      vault: fmt(this.store.goblinVault().silver),
      cells: cells === 0 ? "nobody" : cells === 1 ? "one soul" : `${cells} souls`,
      marked: marked === 0 ? "Nobody" : marked === 1 ? "One person" : `${marked} people`,
    };
    // Never the same trio twice running — a rare event has to feel new.
    const lastKey = this.store.kvGet("goblin_bark_last") ?? "";
    let trio: [number, number, number];
    do {
      trio = [randomInt(BARK_OPEN.length), randomInt(BARK_PITCH.length), randomInt(BARK_CLOSE.length)];
    } while (trio.join(",") === lastKey);
    this.store.kvSet("goblin_bark_last", trio.join(","));
    const body = await voiced("goblins", fill(`${BARK_OPEN[trio[0]]} ${BARK_PITCH[trio[1]]} ${BARK_CLOSE[trio[2]]}`, slots), {
      situation: "a pitch to everyone in #general, on Sterling's floor, where you are not supposed to advertise",
      masked: true,
    });
    const post = postAs(this.store, this.bus, this.bot.id, general.id, body);

    const lastScold = this.store.kvGet("goblin_scold_last") ?? "";
    let s: [number, number, number];
    do {
      s = [randomInt(SCOLD_OPEN.length), randomInt(SCOLD_BODY.length), randomInt(SCOLD_CLOSE.length)];
    } while (s.join(",") === lastScold);
    this.store.kvSet("goblin_scold_last", s.join(","));
    const scold = fill(`${SCOLD_OPEN[s[0]]} ${SCOLD_BODY[s[1]]} ${SCOLD_CLOSE[s[2]]}`, slots);
    const retort = randomInt(1000) < RETORT_SHARE * 1000 ? pick(RETORTS) : null;
    const t = setTimeout(() => {
      try {
        void this.sterling
          .sayVoiced(general.id, scold, "scolding the goblins, as a reply under their post, for advertising on your floor", { replyToId: post.id })
          .then((reply) => {
            if (!retort) return;
            const t2 = setTimeout(() => {
              void voiced("goblins", retort, { situation: "a cheeky retort under Sterling's scold, in #general", masked: true })
                .then((said) => postAs(this.store, this.bus, this.bot.id, general.id, said, reply.id))
                .catch((e) => console.error("[goblins] retort failed:", e));
            }, RETORT_MS);
            t2.unref?.();
          })
          .catch((e) => console.error("[goblins] Sterling's scold failed:", e));
      } catch (e) {
        console.error("[goblins] Sterling's scold failed:", e);
      }
    }, SCOLD_MS);
    t.unref?.();
    return post;
  }

  // ---- THE COUNTER SPEAKS (Josh, Sep 2026: "i would like to add a command
  // like for the goblins like sterling") ----------------------------------
  //
  // Sterling answers /sterling; the goblins answer /goblins. The register is
  // the difference and the whole point: he is a host, they are a SALES FLOOR.
  // Everything is a pitch, every number is quoted with relish, and any
  // question about their own conduct is answered with delighted candour —
  // they are not ashamed of the ladder, they are PROUD of it. Nothing here
  // moves a coin; it reads the same rows the kiosk does.

  /** Handle "/goblins ..." typed in a channel. Returns true if handled. */
  handleCommand(user: User, channel: Channel, text: string): boolean {
    const match = text.match(/^\/goblins\b\s*(.*)$/i);
    if (!match) return false;
    const [cmd, ...rest] = match[1].trim().split(/\s+/);
    const arg = rest.join(" ");
    const name = user.displayName;
    const reply = (body: string) => setTimeout(() => this.say(channel.id, body), REPLY_MS);
    if (this.gone) {
      reply("The kiosk is dark. Goblin Lenders has left Solace for good, and Foundry Lending keeps the window now. Ask /sterling — he is delighted to explain.");
      return true;
    }
    const st = this.store.lenderState(user.id);

    switch ((cmd ?? "").toLowerCase()) {
      // A bare /goblins gets the way in, like the other two house voices.
      case "":
      case "hello":
      case "hi":
        // THE HOUSE'S BRAINS: with a model up this is a conversation —
        // unclaimed, so the brain answers (npc/brain.ts). The script is the floor.
        if (voiceAvailable()) return false;
        reply(pick(GREETINGS).replace("{name}", name) + "\n\n/goblins help — the full list of our services, such as they are.");
        break;

      case "help":
        reply(
          [
            "⚖️ GOBLIN LENDERS — /goblins <command>",
            "",
            "· rates — the four windows, and your rate on each",
            "· file — what we know about you (all of it)",
            "· owe — your bill, and tomorrow's bill",
            "· offer — whether you are holding an introductory rate",
            "· cells — who is in, and what it costs to get them out",
            "· shelf — the repossessed stock, for sale",
            "· vault — our reserve, which is considerable",
            "· terms — the small print, read aloud, slowly",
            "· sterling — our position on the automaton",
            "· voss — our position on the woman in the warehouse",
            "",
            "The other two tenants answer to /sterling and /ada. Neither of them will lend you anything.",
            "",
            "There is no command for closing an account. There is a form. It is long.",
          ].join("\n"),
        );
        break;

      // THE WINDOWS. The posted rate AND the customer's rate, because a
      // teaser that isn't visible isn't a teaser, it's a trap — and they are
      // quite open about the trap being the second half.
      case "rates":
      case "windows": {
        const lines = st.tiers.map((t) => {
          const mark = !t.allowed ? "  (not for you — yet)" : !t.affordable ? "  (vault short today)" : "";
          const rate = t.rate === t.base
            ? `${pct(t.base)}/day`
            : `${pct(t.rate)}/day  — posted ${pct(t.base)}, yours until the offer lapses`;
          return `· ${fmt(t.amount)} silver at ${rate}${mark}`;
        });
        reply(
          [`Our windows, ${name}, from the friendly one to the honest one:`, "", ...lines, "",
            "Interest is simple, not compounding, and due once a day. Miss one and it capitalises, a quarter goes on as a fee, and the rate steps up a point. That is in the terms. So is everything else.",
          ].join("\n"),
        );
        break;
      }

      // THE FILE. The letter's own hooks, read back to the customer's face.
      // This is the one that should be faintly unsettling: they are not
      // guessing, they have been keeping a ledger the whole time.
      case "file": {
        const f = gatherFacts(this.store, user);
        const notes: string[] = [];
        notes.push(`Purse: ${fmt(f.purse)} silver. Collection, at the Trader's table: ${fmt(f.worth)}. Your ceiling is three times the pair — ${fmt(f.limit)}.`);
        if (f.gambled > 0) notes.push(`Staked across this floor, lifetime: ${fmt(f.gambled)}.`);
        if (f.blanks >= 3) notes.push(`Blanks on the Wheel, consecutive, right now: ${f.blanks}.`);
        if (f.dry >= 5) notes.push(`Pulls on the slots without a coin back, consecutive: ${f.dry}.`);
        if (f.lotteryTickets > 0) notes.push(`Lottery tickets bought: ${f.lotteryTickets}. Won: ${f.lotteryWins}.`);
        if (!f.hasShield) notes.push("No talisman. We note it, the way one notes weather.");
        if (f.generation > 1) notes.push(`Generation ${f.generation}. You have died before. It did not settle anything.`);
        if (f.loansTaken > 0) notes.push(`Windows signed with us: ${f.loansTaken}. Cleared: ${f.loansRepaid}.`);
        if (f.everJailed) notes.push("You have been our guest in the cells. We remember it fondly.");
        if (f.onShelf > 0) notes.push(`Items of yours currently on our shelf: ${f.onShelf}. Available for purchase. By anyone. Including you.`);
        reply(
          [`Your file, ${name}. We keep one on everybody; yours is not the thickest.`, "", ...notes, "",
            "We did not obtain any of this improperly. The house records it all. We simply read more carefully than the house does.",
          ].join("\n"),
        );
        break;
      }

      case "owe":
      case "bill": {
        if (!st.loan) {
          reply(`Not a coin, ${name}, and a clean file to go with it. We would very much like to change that, but only when it suits you. The machine is by the doors.`);
          break;
        }
        const l = st.loan;
        reply(
          [`${fmt(l.payoff)} silver, ${name}, to walk away clean today.`,
            `Principal ${fmt(l.principal)} · today's interest ${fmt(l.interest)} · rate ${pct(l.rate)} a day.`,
            l.stage > 0 ? `Standing: stage ${l.stage} of five. You have missed ${l.missed} ${l.missed === 1 ? "day" : "days"}.` : "Standing: current, and long may it last. We are very much easier to deal with this way.",
            "",
            "Unpaid, tomorrow you owe more. That is not a threat. It is arithmetic, and arithmetic does not need to threaten.",
          ].join("\n"),
        );
        break;
      }

      case "offer": {
        if (!st.offer) {
          reply(`No introductory rate standing for you just now, ${name}. They go out when they go out, and we do try to time them well. Do check back.`);
          break;
        }
        const hrs = Math.max(0, Math.round((st.offer.until - Date.now()) / 3_600_000));
        reply(
          `You are holding ${Math.round(st.offer.off * 100)} points off every window, ${name} — about ${hrs} ${hrs === 1 ? "hour" : "hours"} left on it. ` +
          "Sign while it stands. And do read what happens to it the first day you miss; we would hate for that to be a surprise. We would. Genuinely.",
        );
        break;
      }

      case "cells":
      case "jail": {
        const inside = this.store.prisoners();
        if (!inside.length) {
          reply("The cells are empty, which is a poor quarter for us and a good one for everybody else. Give it time.");
          break;
        }
        const rows = inside.slice(0, 6).map((p) => {
          const who = this.store.getUserById(p.userId);
          const left = Math.max(0, Math.round((p.jailSealsAt - Date.now()) / 3_600_000));
          return `· ${who?.displayName ?? "someone"} — bail ${fmt(p.bail)} silver` +
            (p.pot > 0 ? `, ${fmt(p.pot)} already chipped in` : "") +
            `, ${left}h before the cell seals`;
        });
        reply(
          [`Current guests, ${name}:`, "", ...rows, "",
            "Bail is the debt and a half. Yes, that is more than the debt. That is rather the point of bail.",
            "Anyone may pay it. Friendship is the only collateral we accept that we did not have to seize.",
          ].join("\n"),
        );
        break;
      }

      case "shelf":
      case "stock": {
        const shelf = this.store.goblinShelf(8);
        if (!shelf.length) {
          reply("The shelf is bare. Nobody has missed enough days lately. We are patient people and it is only Tuesday somewhere.");
          break;
        }
        const rows = shelf.slice(0, 6).map((r) => `· ${r.name} (${r.tier}) — ${fmt(r.price)} silver`);
        reply(
          [`Repossessed stock, ${name}. Every piece of it was somebody's.`, "", ...rows, "",
            "Five times what the Trader pays. We are not a shop, we are a consequence, and consequences carry a markup.",
            "If one of them is yours, you may of course buy it back. At the price. Obviously at the price.",
          ].join("\n"),
        );
        break;
      }

      case "vault": {
        const v = this.store.goblinVault();
        reply(
          [`${fmt(v.silver)} silver in the reserve, ${name}.`,
            `Lent, lifetime: ${fmt(v.lent)}. Recovered: ${fmt(v.taken)}.`,
            "",
            "We brought it with us. Four systems, one hull of bullion, and a very long look at your economy before we landed. Every coin we lend leaves that vault and every coin you repay goes back into it. We do not conjure money. We are goblins, not a central bank.",
          ].join("\n"),
        );
        break;
      }

      case "terms":
      case "smallprint":
        reply(
          ["The small print, {name}, read aloud, as requested and as required:".replace("{name}", name),
            "",
            "One. Interest is due every day, not every payment. Sleeping is a choice with a price.",
            "Two. A missed day capitalises the interest, adds a quarter as a fee, and steps your rate up a point. Compounding is what happens to people who are late, not to people who borrow.",
            "Three. Miss again and we mark you publicly. Again and we garnish. Again and we take what we can sell. Again and you are our guest.",
            "Four. A marked account may still gamble. We would not dream of interrupting that.",
            "Five. An introductory rate ends the first day you miss, and it does not come back.",
            "",
            "Every line of that was available before you signed. Nobody reads it. We do not know why. We have stopped asking.",
          ].join("\n"),
        );
        break;

      // THE THREE-WAY. Each of the house's three voices has a position on the
      // other two; asking any of them gets a straight answer, which is how a
      // player discovers they share a building.
      case "sterling":
        reply(pick(ON_STERLING).replace("{name}", name));
        break;

      case "voss":
      case "ada":
        reply(pick(ON_VOSS).replace("{name}", name));
        break;

      default:
        // THE HOUSE'S BRAINS: with a model up this is a conversation —
        // unclaimed, so the brain answers (npc/brain.ts). The script is the floor.
        if (voiceAvailable()) return false;
        reply(
          arg
            ? `We do not offer that, ${name}. We offer money. Try /goblins help.`
            : `A sound, not a request, ${name}. /goblins help lists what we sell.`,
        );
        break;
    }
    return true;
  }

  /** Post in a channel as the goblins. */
  private say(channelId: number, body: string): void {
    try {
      postAs(this.store, this.bus, this.bot.id, channelId, body);
    } catch (e) {
      console.error("[goblins] say failed:", e);
    }
  }
}

const GOBLINS_BIO =
  "GOBLIN LENDERS — Concession No. 3, left of the doors.\n\n" +
  "From Goblin Planet, four systems out, in a hull full of bullion. We " +
  "invested it in the Foundry, and the Foundry gave us a corner of this floor. We lend real silver from our own vault: 1,000 to " +
  "1,000,000, at fifteen to thirty percent a day. Credit scales with what we " +
  "could take. Miss a day and the collectors call. Miss five and you are our " +
  "guest.\n\n" +
  "No credit check. We know what you have.\n\n" +
  "Terms in tiny writing. Cells in large ones.\n\n" +
  "Say /goblins help in any channel and we will explain ourselves at length.";

/** Seed the goblins' account (idempotent).
 *
 *  THE BIO IS RE-ASSERTED, not merely back-filled. A bot's bio is ours —
 *  nothing can edit it (the login route refuses bots, so no session can ever
 *  PATCH it) — and the write-once version meant every later edit to the text
 *  above reached a fresh database and no running server. All three house bots
 *  do this now. */
export function seedGoblins(store: Store): void {
  const existing = store.getUserByUsername(GOBLINS_USERNAME);
  if (existing) {
    if (existing.bio !== GOBLINS_BIO) store.updateProfile(existing.id, { bio: GOBLINS_BIO });
    // The firm was renamed (Oct 2026: Goblin Lenders), so the name is
    // re-asserted like the bio — the same reasoning, the same safety.
    if (existing.displayName !== GOBLINS_NAME) store.updateProfile(existing.id, { displayName: GOBLINS_NAME });
    return;
  }
  const u = store.createUser({
    username: GOBLINS_USERNAME,
    displayName: GOBLINS_NAME,
    passwordHash: "!bot!", // never verifies; the login route refuses bots anyway
  });
  store.setBotFlag(GOBLINS_USERNAME);
  store.updateProfile(u.id, { bio: GOBLINS_BIO });
  console.log('[seed] created the goblins\' bot "goblins"');
}

export function createGoblins(store: Store, bus: Bus, sterling: Sterling): Goblins {
  seedGoblins(store);
  return new Goblins(store, bus, sterling);
}

/** Admin levers: a letter to one person now, or a bark now (testing + house
 *  occasions). Neither is reachable by members. */
export function registerGoblinRoutes(router: Router, goblins: Goblins): void {
  router.post("/api/admin/goblins/letter", "admin", async ({ res, body, user, store }) => {
    const target = Number((body as { userId?: unknown })?.userId);
    if (!Number.isInteger(target)) return json(res, 400, { error: "bad_user" });
    const force = !!(body as { force?: unknown })?.force;
    const r = await goblins.write(target, force);
    if (!r.ok) return json(res, r.error === "no_user" ? 404 : 409, { error: r.error });
    store.audit(user.id, "goblins.letter", String(target));
    json(res, 200, { ok: true, offer: r.offer, letter: r.letter });
  });
  // The collections half of the same lever. `force` skips the gap and ONLY
  // the gap — it cannot dun somebody who is paid up, in a cell, or owes
  // nothing at all, so the escalation can be inspected but never invented.
  router.post("/api/admin/goblins/dun", "admin", async ({ res, body, user, store }) => {
    const target = Number((body as { userId?: unknown })?.userId);
    if (!Number.isInteger(target)) return json(res, 400, { error: "bad_user" });
    const force = !!(body as { force?: unknown })?.force;
    const r = await goblins.dun(target, force);
    if (!r.ok) return json(res, r.error === "no_user" ? 404 : 409, { error: r.error });
    store.audit(user.id, "goblins.dun", `${target} stage ${r.stage}`);
    json(res, 200, { ok: true, stage: r.stage, letter: r.letter });
  });
  router.post("/api/admin/goblins/bark", "admin", async ({ res, user, store }) => {
    const post = await goblins.bark();
    if (!post) return json(res, 409, { error: "no_general" });
    store.audit(user.id, "goblins.bark", String(post.id));
    json(res, 200, { ok: true, messageId: post.id, channelId: post.channelId });
  });
}
