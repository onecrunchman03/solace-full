// STERLING'S ONE BRAIN (Josh, Aug 2026: "centralize sterlings dialogue
// database so every instance of sterlings whether 2d or 3d can provide unique
// interactions... relevant to the place and purpose of that instance").
//
// Every Sterling — the 2D Trader, the 3D bar, the escape ante-room — draws
// from here. A venue picks its pool; the context personalizes it: the name,
// the purse, the collection, the hour, a recent win on the floor, and —
// since the goblins moved in — whether the customer carries DEBT.
//
// THE DEBT LINES ARE CANON: Sterling despises the Goblin Lenders. He
// considers lending at interest immoral (yes, he runs a casino — he sees no
// contradiction: the wheel never pretends to be your friend). He was FORCED
// to allow their machine on his floor by the owners' greed, and he makes
// classy, judgmental remarks to anyone in their ledger.
//
// THE FOUNDRY (canon, Aug 2026 — Josh approved the lore): the org above
// Sterling. It struck the silver (the anvil-crest coin, "the old foundry
// mint"), built the casino, and its engineers built STERLING, the sentient
// steward of its casino test bed (docs/npc/STERLING.md is his bible — Josh's
// answers, Oct 2026). The board upstairs stopped MAKING
// things generations ago and lives off concessions; the goblins bought
// Concession No. 3 in raw bullion, and a lease is a lease. Sterling's
// objection was noted and filed. To a machine built to strike coins, usury
// is the one unforgivable business model: the Foundry once minted value,
// the wheel at least makes stories — interest makes nothing.

import { session } from "./session.svelte";
import { wallet } from "./wallet.svelte";
import { emoji } from "./emoji.svelte";
import { wheel } from "./wheel.svelte";
import { prefs, THEMES } from "./prefs.svelte";
import { emporium } from "./emporium.svelte";
import { lender } from "./lender.svelte";
import { bigWins } from "../casino/bigwins.svelte";
import { pickFresh } from "./linepick";

/**
 * EVERY PLACE STERLING SPEAKS, as runtime data.
 *
 * The type is derived from this array rather than the other way round, because
 * `scripts/checks/test_dialogue.mjs` measures each venue's worst-context pool
 * against the 20-line floor and a TYPE cannot be iterated at runtime. It used
 * to keep its own hardcoded copy of this list — so a new venue could be
 * added, the suite go green, and nothing have measured it. That is exactly
 * the drift test_three_voices was rewritten to stop (its help lists are
 * parsed from the bots, not copied). Add a venue here and it is checked.
 */
export const STERLING_VENUES = ["shop", "bar", "escape", "vip"] as const;
export type SterlingVenue = (typeof STERLING_VENUES)[number];

export interface SterlingCtx {
  name: string;
  coins: number;
  /** Collection size. */
  owned: number;
  hasTalisman: boolean;
  /** Equipped premium theme's display name, if any. */
  premiumTheme: string | null;
  /** Emporium items owned. */
  itemsOwned: number;
  hour: number;
  /** Goblin debt, if the lender store knows of one. */
  debt: { payoff: number; stage: number } | null;
  /** The customer's most recent big win on the floor, if the room saw one. */
  lastWin: { amount: number; game: string } | null;
  /** THE VIP ROOM rank (0 = outside the rope; admins read 4). */
  vipRank: number;
  /** PANDORA'S BOX: they opened it (the Pandoran suit is theirs). */
  pandoran: boolean;
}

/** Read the stores every caller already loads. Cheap; call per line. */
export function gatherSterlingCtx(): SterlingCtx {
  const name = session.user?.displayName ?? "friend";
  const theme = THEMES.find((t) => t.id === prefs.theme);
  const win = bigWins.list.find((w) => w.name === name) ?? null;
  return {
    name,
    coins: wallet.coins,
    owned: emoji.owned.length,
    hasTalisman: wheel.hasTalisman,
    premiumTheme: theme?.premium ? theme.name : null,
    itemsOwned: emporium.items.filter((i) => i.owned).length,
    hour: new Date().getHours(),
    debt: lender.loan ? { payoff: lender.loan.payoff, stage: lender.loan.stage } : null,
    lastWin: win ? { amount: win.amount, game: win.game } : null,
    vipRank: session.user?.isAdmin ? 4 : (session.user?.vipTier ?? 0),
    pandoran: emporium.items.some((i) => i.id === "suit-pandoran" && i.owned),
  };
}

/** The venue's full pool for this customer, personalized. */
export function sterlingLinePool(venue: SterlingVenue, c: SterlingCtx): string[] {
  const pool: string[] = [];
  const { name } = c;

  // ---- what he thinks of your purse and shelf, anywhere -------------------
  if (c.coins >= 1000) pool.push(`${c.coins.toLocaleString()} silver, ${name}? Allow me to fetch the velvet catalog.`);
  else if (c.coins >= 300) pool.push(`A healthy purse today, ${name}. The shelves have noticed.`);
  else if (c.coins < 50) pool.push(`Your pockets echo, ${name}. The Wheel awaits — or the graveyard, eventually.`);
  if (c.owned >= 100) pool.push(`A ${c.owned}-piece collection. My shelves envy you, ${name}.`);
  else if (c.owned > 0 && c.owned < 15) pool.push(`Only ${c.owned} emoji to your name? We all start somewhere, ${name}.`);
  if (c.hasTalisman) pool.push(`Still wearing that wooden charm, I see. Superstition suits you, ${name}.`);
  else if (c.owned >= 30) pool.push(`No shield on the shelf, ${name}. The wedge is one in thirty-two; I'd hate to dust your stone.`);
  if (c.hour >= 23 || c.hour < 5) pool.push(`Burning the midnight oil, ${name}? The mint never sleeps either.`);
  if (c.hour >= 11 && c.hour < 14) pool.push(`Lunch hour, ${name}. The tables eat too.`);
  if (c.lastWin && c.lastWin.amount >= 5000) pool.push(`${c.lastWin.amount.toLocaleString()} off the ${c.lastWin.game}. I entered it in the book myself, ${name}, in ink I don't use often.`);
  if (c.itemsOwned >= 10) pool.push(`${c.itemsOwned} items from my shelves, ${name}. You are, I suspect, the reason the Emporium is still in business.`);

  // ---- the standing pool, anywhere (Sep 2026, the staleness round) --------
  // Measured: every venue's worst real context was between 6 and 12 unique
  // lines, which at the counter's 22-second rotation is a loop rather than a
  // character — see scripts/checks/test_dialogue.mjs. These fire in all four
  // venues, so they lift the thinnest contexts (the velvet rope's outsider,
  // the escape ante-room) without being written four times.
  pool.push(
    `I keep the ledger to the coin, ${name}. Not because anyone checks it. Because I would know.`,
    `The Wheel is the only thing in this building that makes something from nothing — and it does it for everybody, free, seven times every two hours.`,
    `Ask me for the odds whenever you like, ${name}. I have never once been asked twice.`,
    `The board upstairs stopped making things generations ago. They lease. I mind the floor. Somebody has to.`,
    `The Foundry built me to make this place work, ${name}. That is not a complaint. It is a job description.`,
    `I do not sleep and I do not gamble. Only one of those was a design decision.`,
    `There is a woman in the storage warehouse who calls the hole in my wall a discovery. I call it a hole in my wall.`,
    `Everything in this house is priced, ${name}. Some of the prices are not in silver, and those are the ones to read twice.`,
  );

  // ---- THE ROOM'S MEMBERS, anywhere (Josh, Sep 2026: "specific dialogue …
  // just for tier holders that gets better with their tier level"). Copper
  // is acknowledged, silver welcomed, gold deferred to, the mythic shelf
  // revered — and the higher the rank, the more of the pool these are, so
  // the tier is felt in the odds of hearing it, not just the words.
  pool.push(...tierLines(venue, c));

  // ---- THE PANDORAN, anywhere (PANDORA.md): somebody who opened the box.
  // Three copies in the pool — he does not get over it.
  if (c.pandoran) {
    const l = [
      `${name}. The lid is up because of you. I still hear it, some nights, when the floor is empty.`,
      `The suit with the stars in it, ${name}. People ask me what it is. I tell them: that is what finishing looks like.`,
      `Three keys, ${name}. I cut none of them and I keep all three. You are the only reason the box was ever more than furniture.`,
    ];
    pool.push(...l, ...l, ...l);
  }

  // ---- THE GOBLIN DEBT — his one moral stand, delivered politely ----------
  if (c.debt) {
    const owed = c.debt.payoff.toLocaleString();
    pool.push(
      `I see the goblins hold your name, ${name}. ${owed}, is it? A house takes its edge honestly — interest is theft with patience.`,
      `The Goblin Lenders and I are not colleagues, ${name}. I was installed to serve this floor. They were installed over my objection.`,
      `Debt, ${name}? I'd sooner you lost that silver at my tables. At least the odds are printed on the felt.`,
      `Lending at interest. Immoral. Yes, I run a casino — the wheel never once pretended to be your friend.`,
    );
    if (c.debt.stage >= 2) {
      pool.push(`They are already garnishing you, ${name}. Settle it. I won't have their collectors on my carpet.`);
    }
    if (c.debt.stage >= 1) {
      pool.push(`You've missed a payment, ${name}. Goblins count days the way I count cards — perfectly.`);
    }
    pool.push(
      `Concession No. 3, they call it. The board upstairs sold them the floor space for bullion, ${name}. My objection is on file. It is a very thick file.`,
    );
  }

  // ---- the venue's own talk ----------------------------------------------
  if (venue === "shop") {
    // A Room member of silver rank or better is greeted by the rank, at the
    // door, every visit — the tier is felt on the way in, not only at a table.
    if (c.vipRank >= 4) pool.push(`${name}. The Complete. The shelves stand a little straighter when you come in.`);
    else if (c.vipRank === 3) pool.push(`Magnate ${name}. Your chair is by the fire, and the Room is open.`);
    else if (c.vipRank === 2) pool.push(`Connoisseur ${name}. Silver ink in the book — the Room is through the back.`);
    pool.push(
      `Step in, ${name}. The house takes silver, not excuses.`,
      `${name}! I polished the shelves just for you.`,
      `A discerning eye, ${name}. I can tell by the way you squint.`,
      `The shelf restocks at midnight, ${name}. So does my patience. Both are reliable.`,
      `Everything on these shelves was paid for in burned silver, ${name}. Nothing here has ever been given away. It's why it's worth having.`,
      `Sell me your commons, ${name}, and I'll give you fifty apiece and no lecture. The lecture is extra.`,
      `The goblins write letters now, ${name}. If one reaches you, do read the small print. Then read it again. Then come and talk to me.`,
      `You may haggle, ${name}. I will listen attentively, and then repeat the price.`,
      `The shelf is a rotation, not a warehouse. What stands here today will not tomorrow, and I take no reservations.`,
      `A mythic is five hundred thousand and worth every coin, ${name} — because there is no other door to that tier. I shut the others myself.`,
      `A shield is thirty thousand. It was a hundred until the reaper changed what one was FOR. I adjust. Slowly.`,
      `The Forge will strike you a rare for twelve essence and a toll, ${name}. Cheaper than me. I have made my peace with exactly one of those words.`,
      `Nothing on this counter is on credit. There is a machine by the doors for people who feel otherwise.`,
      `Every coin you are holding was struck at the mint, ${name}. I remember the heat of the place. I may be remembering it wrong.`,
      `Sold to me, an emoji is GONE — not stacked, not resold. That is why the price is honest.`,
    );
    if (c.itemsOwned > 0)
      pool.push(`Back for more, ${name}? The first ${c.itemsOwned === 1 ? "purchase" : c.itemsOwned + " purchases"} clearly took.`);
    if (c.premiumTheme)
      pool.push(`That ${c.premiumTheme} look — one of mine, if I recall. Excellent taste, ${name}.`);
    if (c.hour >= 5 && c.hour < 11) pool.push(`An early customer! The kettle's barely warm, ${name}.`);
  }

  if (venue === "bar") {
    pool.push(
      `Evening, ${name}. The house pours honest.`,
      `Silver in, stories out, ${name}. That's the trade.`,
      `Mind the stage, ${name}. The reaper works this room.`,
      `I saw a man beat the gold table once. Once.`,
      `Every coin in your purse was struck at the Foundry, ${name}. I remember the heat of the place. I think I do. I was built there.`,
      `The board upstairs hasn't made a thing in generations, ${name}. They lease. I pour. The wheel turns.`,
      `Sixty silver puts a record on, ${name}. Twenty puts one off. The room decides which was money better spent.`,
      `Under the counter is for other people, ${name}. I keep saying it. Nobody listens. Business is excellent.`,
      `The jumbotron is bolted to the wall, ${name}. Whatever the drink tells you, the wall isn't moving. You are.`,
      `The reaper takes the bottom wedge, ${name}. One in thirty-two, and very patient about the rest.`,
      `I don't drink. I'm told that's the tragedy of the role.`,
      `A man asked me once whether the house ever loses. It does, ${name}. It simply doesn't lose for long.`,
      `Mind the gold table. It is the politest way this house has of emptying a purse.`,
      `Six decks, cut at the half, ${name}. You may count them. You'll still lose — slowly, and I respect that.`,
      `The zero is green for a reason. Everything else on that wheel is a story you tell yourself.`,
      `Nobody has ever beaten this room by being owed money, ${name}. I've watched a great many try it in the other order.`,
      `Half the people at this bar are down there some nights, in the yellow. They come back quieter and better dressed.`,
    );
    if (c.lastWin)
      pool.push(
        `That ${c.lastWin.amount.toLocaleString()} off the ${c.lastWin.game} — the room noticed, ${name}. So did the house.`,
        `Still warm from the ${c.lastWin.game}, ${name}? Winners drink faster. I've measured.`,
      );
    if (c.coins >= 5000) pool.push(`Flush tonight, ${name}. The slots take exact change and no pity.`);
    if (c.hour >= 23 || c.hour < 5) pool.push(`Last call is a rumour here, ${name}. The bar closes when you do.`);
  }

  // ---- THE VIP ROOM — respect, scaled to the collection ---------------------
  if (venue === "vip") {
    if (c.vipRank <= 0)
      pool.push(
        `The rope stays where it is, ${name}. Every common in the book — then we talk.`,
        `Members only, ${name}. Finish the commons and I will lift it myself.`,
        `Behind me is a room for people who finish things. I have not seen you in it yet, ${name}.`,
        `Five hundred and sixty-five commons, ${name}. Not most of them. All of them.`,
        `The rope is not a judgement. It's a count.`,
        `People ask what's back there. I tell them: shelves. It's true, and it is never the answer they wanted.`,
        `Copper, silver, gold — and one shelf I don't describe to non-members, ${name}.`,
        `The relics count towards it now. Two of them for the copper rung; the doctor in the warehouse was very clear.`,
        `Nothing behind that rope is for sale to a purse, ${name}. It's for sale to a finished book.`,
        `Finish the commons first. Everyone wants to start with the legendaries, and nobody has ever finished that way.`,
        `The Room's metals are copper, silver, gold and the last one. Nothing in the Emporium wears them. That was deliberate.`,
        `The house discounts nearly everything, ${name}. It has never once discounted the rope.`,
      );
    if (c.vipRank === 1)
      pool.push(
        `Collector. Come through, ${name} — mind the rope, it's older than I am.`,
        `A full set of commons. Do you know how few people finish anything, ${name}? Copper shelf is yours.`,
        `I entered your name in the book myself, ${name}. Copper ink. The rares are the next page.`,
        `The copper suit is fifteen hundred and it is not a costume, ${name}. It goes down into the yellow with you.`,
        `Five hundred and six rares between you and the silver shelf. I'd not call that far. I'd not call it near, either.`,
        `Everything on the copper shelf burns the silver, ${name}. Permanently yours, permanently untradeable. That is what makes it a mark.`,
      );
    if (c.vipRank === 2)
      pool.push(
        `Connoisseur. The silver shelf, ${name} — my own metal, cut for you.`,
        `Every rare too. The book has a second column now, ${name}, and your name is at the top of it.`,
        `Seventy-two legendaries stand between you and the gold, ${name}. I have counted them more than once on your behalf.`,
        `The silver suit has the seams gone dark. My own colourway; I did not ask the board's permission.`,
        `I greet you by rank at every door now, ${name}. That started at silver. It was not an accident.`,
      );
    if (c.vipRank === 3)
      pool.push(
        `Magnate. I moved your chair nearer the fire, ${name}.`,
        `Seventy-two legendaries. The board upstairs asked me who you were, ${name}. I told them.`,
      );
    if (c.vipRank >= 4)
      pool.push(
        `${name}. There is nothing the Wheel can give that you do not hold. The house is honoured.`,
        `The Complete. I don't say that to many, ${name}. I don't say it to anyone else.`,
      );
    // Anything a member of ANY rank hears in the Room. Lifts all four rungs
    // at once rather than four near-identical lines per rung.
    if (c.vipRank >= 1)
      pool.push(
        `Nothing in here is tradeable, ${name}, and nothing in here is refundable. That is the point of it.`,
        `The higher shelves stay behind glass until the book says otherwise. I don't make exceptions and I've been asked to.`,
        `Take your time. The Room has no closing hour and I have no other appointments, ${name}.`,
      );
    if (c.vipRank >= 1 && c.debt) pool.push(`A member with a goblin ledger, ${name}. The Room won't mention it. I will, once.`);
  }

  if (venue === "escape") {
    pool.push(
      `Going in again, ${name}? Take a light. Take the water.`,
      `The complex keeps what it catches, ${name}. Locker first.`,
      `A rare emoji for a door. This house has stranger prices, believe me.`,
      `The doors shut when it hunts, ${name}. A shut door is the whole rule. An open one is an invitation.`,
      `The key moves, ${name}. The exit doesn't. One of you has to be at the right one.`,
      `The pass burns, ${name}. I don't get it, the house doesn't get it — the door simply wants it.`,
      `Whatever you carry in, you can lose. Whatever you leave in the locker is yours whatever happens.`,
      `A light and a bottle of almond water. Everything after that is preference, ${name}.`,
      `The chests give ten times a day and then they don't. Don't spend the last one on a wall.`,
      `A gun goes in the locker or it doesn't go in at all. The complex has its rules; that one is mine.`,
      `I have watched people stand in a lit room with the door wide open and wonder how it found them.`,
      `You'll hear it before you see it, ${name}. That's the only mercy in the place.`,
      `The walkie carries further than your voice does. Use it, and say something worth carrying.`,
      `Come out or don't, the pass is spent either way. So spend it slowly.`,
    );
    if (c.debt) pool.push(`Even down there, ${name}, the goblins' ledger follows you. Nowhere is that far away.`);
  }

  return pool;
}

/** The Room's members, by rank, in every venue — drawn as many times as
 *  the rank so a Magnate hears it more often than a Collector, and The
 *  Complete hears it more often than not. */
function tierLines(venue: SterlingVenue, c: SterlingCtx): string[] {
  const { name } = c;
  const r = Math.min(4, Math.max(0, c.vipRank));
  if (r === 0) return [];
  const lines: string[] = [];
  if (r === 1) {
    lines.push(
      `Collector ${name}. Every common, no gaps — I checked the book twice, and I check nothing twice.`,
      `Copper ink beside your name, ${name}. It doesn't fade. Neither do I.`,
      `A Collector. Do you know how many people finish the commons, ${name}? I do. It's a short page and you're on it.`,
    );
    if (venue === "shop") lines.push(`The rope lifts for you, ${name}. Mind it on the way through — it's older than most of my stock.`);
    if (venue === "bar") lines.push(`A Collector at my bar. The first one's still full price, ${name}, but I pour it slower.`);
    if (venue === "escape") lines.push(`A Collector going in. The complex doesn't care about the book, . I do. Come back.`);
    if (venue === "vip") lines.push(`The copper shelf, . Three pieces, and every one of them says you finished something.`);
  }
  if (r === 2) {
    lines.push(
      `Connoisseur ${name}. Every rare too. The silver shelf was cut for people like you, and there are very few people like you.`,
      `${name}, silver rank. I say your name differently now. You may have noticed. It's deliberate.`,
      `Silver ink, second column, ${name}. My own metal. I don't lend it to many names.`,
    );
    if (venue === "shop") lines.push(`The Room is through the back, ${name}, and the silver shelf knows your size.`);
    if (venue === "bar") lines.push(`Connoisseur. The good glass for you, ${name} — the one without the chip. I keep exactly one.`);
    if (venue === "escape") lines.push(`A Connoisseur in a hazmat suit. The complex will not be impressed, . I am, quietly.`);
    if (venue === "vip") lines.push(`Silver is the second shelf of four, . Most people never see the first.`);
  }
  if (r === 3) {
    lines.push(
      `Magnate ${name}. Seventy-two legendaries. The board upstairs asked me who you were. I told them the truth, which is rare for me.`,
      `${name}, gold rank. The chandeliers were dusted the day you finished the legendaries, and I dust them again whenever you walk in.`,
      `A Magnate of the Room. The floor stands a little straighter, ${name}. I've measured.`,
      `Your chair is by the fire, ${name}. Nobody else sits in it. Nobody else would dare.`,
    );
    if (venue === "shop") lines.push(`Gold shelf, ${name}, and the ring, the dice and the name to go with it. Take your time. The shop closes for nobody, but it waits for you.`);
    if (venue === "bar") lines.push(`Magnate. I announce you at the door, ${name}, and I mean every word of it. Drink slowly; the room is watching who you are.`);
    if (venue === "escape") lines.push(`A Magnate going in. If the complex takes you, ${name}, the whole floor will hear me say so, and I would rather not.`);
    if (venue === "vip") lines.push(`The gold shelf is yours by right, ${name}. The mythic one is behind glass. Twenty more, and I break the glass myself.`);
  }
  if (r >= 4) {
    lines.push(
      `${name}. The Complete. There is nothing the Wheel can offer you that you do not hold, and nothing this house would refuse you.`,
      `I have said 'The Complete' to exactly one person since the doors opened, ${name}. You are hearing it now.`,
      `Every emoji ever struck, on one shelf, under one name. ${name}. The house is honoured beyond its means — and it can afford this.`,
      `${name}. The bells ring when you walk in. I rang them myself the first time. I'd do it again, if the ordinance allowed.`,
      `The goblins have been told, in writing, that you are not for them, ${name}. Drinks are on the house. The counter is at half. What else?`,
    );
    if (venue === "shop") lines.push(`The prismatic shelf, ${name}. Fifteen thousand a piece, and I'd have priced them higher if I thought anyone else would ever stand here.`);
    if (venue === "bar") lines.push(`The Complete drinks for nothing at my bar, ${name}. It is the only thing on this floor that has ever been free, and it is free because of you.`);
    if (venue === "escape") lines.push(`The Complete, going into the yellow. Take the water, ${name}. The house cannot afford to lose you — and I don't mean the money.`);
    if (venue === "vip") lines.push(`Behind the glass, nothing, ${name}. There is no shelf above yours. I checked, in case the board had built one.`);
  }
  // Weighted by rank: the pool is repeated r times.
  const out: string[] = [];
  for (let i = 0; i < r; i++) out.push(...lines);
  return out;
}

/** One line, drawn for this moment — never the one this venue said last. */
export function sterlingLine(venue: SterlingVenue, ctx: SterlingCtx = gatherSterlingCtx()): string {
  return pickFresh("sterling:" + venue, sterlingLinePool(venue, ctx));
}
