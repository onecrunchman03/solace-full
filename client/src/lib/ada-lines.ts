// DR. ADA VOSS'S ONE BRAIN — the Threshold-4 counterpart to Sterling's
// (client/src/lib/sterling-lines.ts). Same shape on purpose: every Voss, the
// 2D counter or the in-world station or the debrief, draws from here, and the
// context personalizes it.
//
// THE REGISTER IS THE POINT, and it is the opposite of Sterling's. He is warm,
// theatrical, morally invested; he likes you. She is none of those things. She
// is ACCURATE — about the corridors, about the entities, about your survival
// odds, about what the goblins are doing to the people who owe them — and the
// accuracy is what lands, because she never softens it and never enjoys it.
// She is not rude. Rudeness would be a feeling. Write her as a woman reading
// out a number she has already checked twice.
//
// THE CRACKS ARE THE CHARACTERIZATION (BACKROOMS.md's original note:
// "Retrieval rate this quarter: 74%. The remaining 26% are… data."). Every so
// often the clinical voice catches on something — a name she remembers, how
// long she has been down here, the fact that she came on purpose. Never
// resolve it. She does not want comfort and would not recognize it.
//
// THE LORE SHE OPERATES ON (Josh, Sep 2026 — and half of it was already
// written: her own Drive 001 says "a frequency at which physical matter
// becomes probabilistically unanchored from its native spatial layer"):
//
//   · The anomaly is a HOLE IN THE CASINO'S STORAGE WAREHOUSE — a seam that
//     opened along a wall behind the pallet racking. Async did not make it.
//     Async measured it, and then moved in on top of it.
//   · THE WAY DOWN IS A DOOR (Josh, Sep 2026, correcting an earlier draft
//     that made the seam a dial: "it was always one door from the
//     beginning"). The seam opens onto Level 0 and only Level 0. Every layer
//     holds the door to the one below it and somebody has to find it and open
//     it. What her frequency work buys is the way BACK — a layer whose door
//     has been opened can be held steady enough to drop a surveyor straight
//     at it, which is the only reason the map screen's board works at all.
//     Ten layers surveyed; two reachable. Her station is named for the fourth
//     boundary zone she mapped, which is why it is Threshold-4, not -1.
//   · FOUNDRY hosts Async because Foundry's R&D eats what Async brings back.
//     The board upstairs gets a casino AND a research programme paid for out
//     of the floor's own losses. Voss knows exactly what that makes her, and
//     exactly what it makes the people she sends in. She has done the
//     arithmetic on both and files it under "acceptable".
//
// NOTHING HERE MOVES MONEY. It is a line pool, like Sterling's.

import { session } from "./session.svelte";
import { wallet } from "./wallet.svelte";
import { lender } from "./lender.svelte";
import { pickFresh } from "./linepick";

/** Her standing retrieval figure — ONE number on this side of the wire, the
 *  twin of RETRIEVAL_PCT in src/voss.ts. It used to be 74 in her bio, 74 in
 *  the line below, and a fresh 70-78 roll in every field notice, which reads
 *  as a station that cannot keep its own statistic straight. The dialogue
 *  harness pins the two sides together. */
export const RETRIEVAL_PCT = 74;

export type VossVenue = "threshold" | "station" | "debrief" | "warehouse";

export interface VossCtx {
  name: string;
  /** The customer's purse, which she regards as a logistics fact. */
  coins: number;
  /** Distinct relics this account has unlocked. */
  relics: number;
  /** Items in the locker, and whether a suit is among them. */
  locker: number;
  hasSuit: boolean;
  /** Findings in hand right now — the reason most people are at her counter. */
  carryingRelic: boolean;
  carryingTape: boolean;
  /** Async's remaining research budget, and what it means for the till. */
  grant: number;
  grantState: "funded" | "low" | "dry";
  /** Recorded deaths in the corridors, this account's own. */
  deaths: number;
  /** Goblin debt, if the lender store knows of one. She does not moralize. */
  debt: { payoff: number; stage: number } | null;
  hour: number;
  /** Layers currently reachable (Level 0, and Level 1 once its door is open). */
  levelsOpen: number;
}

/** Read the stores every caller already loads; the caller supplies the rest,
 *  because the locker and the budget exist only inside Threshold-4's own
 *  payload and there is no point mirroring them into a store for this. */
export function gatherVossCtx(o: {
  relics?: number;
  locker?: number;
  hasSuit?: boolean;
  carryingRelic?: boolean;
  carryingTape?: boolean;
  grant?: number;
  grantState?: "funded" | "low" | "dry";
  deaths?: number;
  levelsOpen?: number;
}): VossCtx {
  return {
    name: session.user?.displayName ?? "surveyor",
    coins: wallet.coins,
    relics: o.relics ?? 0,
    locker: o.locker ?? 0,
    hasSuit: o.hasSuit ?? false,
    carryingRelic: o.carryingRelic ?? false,
    carryingTape: o.carryingTape ?? false,
    grant: o.grant ?? 0,
    grantState: o.grantState ?? "funded",
    deaths: o.deaths ?? 0,
    debt: lender.loan ? { payoff: lender.loan.payoff, stage: lender.loan.stage } : null,
    hour: new Date().getHours(),
    levelsOpen: o.levelsOpen ?? 1,
  };
}

const fmt = (n: number): string => n.toLocaleString();

/** The venue's full pool for this surveyor, personalized. */
export function vossLinePool(venue: VossVenue, c: VossCtx): string[] {
  const pool: string[] = [];
  const { name } = c;

  // ---- the standing assessment, anywhere ---------------------------------
  pool.push(
    "Voss. Threshold-4. State your business, or take your time — the corridors don't care either way.",
    `You're on the roster, ${name}. That is not the same as being expected back.`,
    "I log everything that goes in and everything that comes out. The two lists don't match. They never have.",
    "Retrieval rate this quarter: seventy-four percent. The remaining twenty-six are… data.",
    "You may call it a job. Async calls it a field programme. The distinction matters at review time and nowhere else.",
  );

  // ---- what she thinks of YOUR file --------------------------------------
  if (c.relics === 0)
    pool.push(`Nothing recovered under your name yet, ${name}. That's not a criticism. It's a blank line.`);
  else if (c.relics >= 15)
    pool.push(
      `${c.relics} distinct recoveries, ${name}. You are the reason my quarterly reads the way it does. Don't let that flatter you.`,
      `I have a shelf with your name on it now, ${name}. Literally. I wrote it on tape.`,
    );
  else if (c.relics >= 5)
    pool.push(`${c.relics} recoveries on file, ${name}. Enough for a pattern. Not enough for a conclusion.`);

  if (c.deaths === 1)
    pool.push(`You've died down there once, ${name}. The body came back. Statistically that's the interesting part.`);
  else if (c.deaths >= 3)
    pool.push(
      `${c.deaths} recorded deaths, ${name}. I keep the causes in a column. Yours is not the most varied column I have.`,
      `You keep going back, ${name}. I'm not going to tell you that's unwise. I came here on purpose.`,
    );

  if (!c.hasSuit)
    pool.push(`No suit in your locker, ${name}. I can't stop you going in. I can tell you what comes back when you don't.`);
  if (c.locker >= 18)
    pool.push(`Your locker is nearly full, ${name}. I don't buy equipment. Throw something away or carry less.`);

  // ---- THE BUDGET — the honest version of "we are not buying" ------------
  if (c.grantState === "dry")
    pool.push(
      `The account is at zero, ${name}. Foundry disburses when Foundry disburses. I'm not consulted and I don't ask.`,
      "I can't buy anything today. Hold what you have, or find a private buyer — people trade these upstairs.",
    );
  else if (c.grantState === "low")
    pool.push(
      `${fmt(c.grant)} silver left in the acquisition account, ${name}. Bring me something small, or bring it soon.`,
      "The budget is thin this period. That's a scheduling problem, not a valuation one — the price doesn't move.",
    );
  else
    pool.push(`The acquisition account is funded: ${fmt(c.grant)} silver. Bring me something worth writing down.`);

  // ---- THE GOBLINS — her best material, and the coldest ------------------
  // Sterling moralizes. She measures. It lands worse.
  if (c.debt) {
    pool.push(
      `You're carrying ${fmt(c.debt.payoff)} to the lenders, ${name}. I mention it because indebted surveyors go a level deeper at roughly twice the rate of solvent ones. I'm not required to have an opinion about the mechanism.`,
      "Debt is the single best predictor I have of who volunteers for a bad run. Better than experience. Better than equipment.",
      "I'd advise you to settle it before your next descent. I'd also note that people who take my advice bring back less. Both are true.",
    );
    if (c.debt.stage >= 2)
      pool.push(`They're taking it out of your purse already, ${name}. Whatever you recover today, they'll have a claim on it by tomorrow. Plan accordingly.`);
  } else {
    pool.push(
      "The lenders on the floor have asked twice whether I'd price a relic as collateral. I declined twice. My specimens are not security for anyone's loan.",
      `There's a moneylender's machine between my door and the exit, ${name}. I assume that placement wasn't an accident.`,
    );
  }

  // ---- STERLING — professional respect, zero warmth ----------------------
  pool.push(
    "The automaton on the floor disapproves of me. He's polite about it, which is worse.",
    "Sterling is the most interesting artifact on this property and nobody studies him. I've asked. He declined.",
    "He keeps the books; I keep the log. His has better handwriting and fewer honest entries.",
  );

  // ---- THE HOUSE, and who is really paying -------------------------------
  pool.push(
    `Foundry doesn't fund me out of generosity, ${name}. They fund me because what I send up keeps their side of the business ahead of everyone else's.`,
    "Every silver I pay you came off the tables. You're being financed by people losing at roulette. I find that tidy.",
    "Concession, casino, research station. One building, three balance sheets, one landlord.",
  );

  // ---- the hour ----------------------------------------------------------
  if (c.hour >= 1 && c.hour < 5)
    pool.push(
      "It's the small hours up here. There's no such thing down there, which is one of the first things that stops mattering.",
      `I don't keep the station clock any more, ${name}. I keep the log's clock. They disagree and I've stopped minding.`,
    );

  // ---- per venue ---------------------------------------------------------
  if (venue === "threshold") {
    pool.push(
      "Manifest's on the board. The prices are Async's, not mine — don't negotiate, I've nothing to move.",
      `I sell equipment and I buy findings. I don't buy equipment back. A field station isn't a pawn shop, ${name}.`,
      "The flashlight isn't optional. I've stopped arguing about it; I just note who declines.",
      "Film it if you can do it safely. Film it if you can't, and somebody gets paid for the tape regardless of who carries it out.",
      "Everything on this counter came through the seam on a pallet. Consider what that tells you about the seam's width.",
    );
    if (!c.hasSuit && c.coins < 400)
      pool.push(`You can't afford a suit and you haven't got one, ${name}. Trade me a rare emoji for the standard kit. One per surveyor — it's a starter kit, not an allowance.`);
    if (c.carryingRelic)
      pool.push(
        `You're carrying something of mine, ${name}. Or something that's about to be. The counter's right here.`,
        "Put it on the counter. I'd like to see it before you decide to keep it.",
      );
    if (c.carryingTape)
      pool.push(`There's a tape in your locker. I pay by how close you were willing to stand, ${name} — the only metric that has ever correlated with anything.`);
  }

  if (venue === "station") {
    pool.push(
      "Don't touch the racking. Some of it is load-bearing and some of it is holding the seam's edge apart.",
      "The hum is louder in here than out there. I've stopped noticing, which I've logged as a symptom.",
      "The generator's on its third rebuild. Nothing that came through with me was designed to run this long.",
      `You're standing in a warehouse, ${name}. Try to remember that. The ones who forget are the ones who wander.`,
    );
  }

  if (venue === "debrief") {
    pool.push(
      "Out. Good. Empty your bag on the table and don't editorialize.",
      "I need what you saw, not what you felt about it. The second one is in every report and useful in none.",
      "You were gone longer than your air said you'd be. I'd like that in writing.",
      `Sit down before you talk, ${name}. Everyone thinks they're steadier than they are coming out.`,
    );
    if (c.carryingRelic) pool.push("That's a recovery. Set it down gently and step back — I'll take it from here.");
  }

  // ---- THE WAREHOUSE DOOR, and the frequency ------------------------------
  if (venue === "warehouse") {
    pool.push(
      "This is the seam. It opened along the wall behind the racking and nobody upstairs can tell me when. Nobody upstairs has asked.",
      `Async didn't make this, ${name}. We measured it and then built a desk next to it. That's the entire history of this station.`,
      "It resonates. That's the whole discovery, and it's smaller than people want it to be — matter at the right frequency stops being reliably HERE. This one opens onto the yellow. Only ever the yellow.",
      "The way down is a door. It was always a door. My work doesn't take you anywhere; it holds the way back open once somebody else has found one.",
      `Ten layers surveyed, ${name}. ${c.levelsOpen === 1 ? "One" : String(c.levelsOpen)} of them reachable. The rest are behind doors nobody has opened yet.`,
      "I called them Thresholds when I was still mapping boundary zones. I was standing at the fourth one when I decided to stop going home. The name stuck.",
      `I came here on purpose, ${name}. I want that on the record every time somebody asks whether this is safe. I did the mathematics, I was right, and I'm still here.`,
    );
    if (c.levelsOpen <= 1)
      pool.push("One layer reachable. The next is behind a door on Level 0 with a keyhole and no handle on our side, and I cannot open it from here.");
  }

  return pool;
}

/** Pick one line, or "" if the pool is somehow empty — never the one this
 *  venue said last (see lib/linepick.ts for why only one). */
export function vossLine(venue: VossVenue, c: VossCtx): string {
  return pickFresh("voss:" + venue, vossLinePool(venue, c));
}
