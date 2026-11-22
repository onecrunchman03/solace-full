// Texas Hold'em — no-limit cash tables, the real game. Blinds and a rotating
// button (heads-up: button posts the small blind and acts first preflop),
// betting in the standard order, min-raise = the last full raise (an all-in
// for less does NOT reopen action for players who already acted), all-ins run
// the board out, and showdowns split exact SIDE POTS among the best 5-of-7
// hands (odd chips go to the first winner left of the button — the floor
// rule). PvP: silver moves between players; the house takes a 5% rake capped
// at 5 big blinds, "no flop no drop", and every raked chip seeds the nightly
// lottery pot (the standing rake rule).
//
// Money safety is the blackjack discipline with one twist: a seat's escrow
// row (holdem_stacks, migration 49) holds the whole buy-in and is touched
// ONLY at sit (insert), settlement (delta = winnings − contribution), and
// leave (credit chips-behind, delete). Mid-hand chips exist in memory only,
// so a crash abandons the hand and the boot refund returns every seat's full
// row — nobody loses committed chips to a restart. The one asymmetry: a
// player who leaves MID-HAND forfeits their committed chips into the pot
// (fold-and-go, the live-poker rule); those chips ride in memory until the
// hand settles, so a crash in that narrow window burns them — money can
// vanish but never mint.
//
// Secrecy is the Bone Pit rule: the public `holdem.state` broadcast never
// carries hole cards (until a showdown reveals the contenders'); each
// player's own two cards ride a recipient-scoped `holdem.cards` frame.

import type { Store } from "./db/store";
import type { Bus } from "./bus";
import { toPublicUser } from "./types";
import type { HoldemLobbyDTO, HoldemTableDTO, HoldemSeatDTO, PublicUser, User } from "./types";
import { newDeck, shuffle, best7, categoryName, type Card } from "./poker-eval";
import { lotteryDay } from "./lottery";

// SEVEN since Aug 2026 (Josh: the casino floor's oval seats seven) — like
// blackjack's 4→6, per-seat escrow means the money paths don't change shape.
export const SEATS = 7;
export const RAKE_PCT = 0.05;
export const RAKE_CAP_BB = 5;

const TURN_MS = Number(process.env.HOLDEM_TURN_MS ?? 30_000);
const STREET_MS = Number(process.env.HOLDEM_STREET_MS ?? 1_400); // all-in runout pacing
const SETTLE_MS = Number(process.env.HOLDEM_SETTLE_MS ?? 6_500);
const START_MS = Number(process.env.HOLDEM_START_MS ?? 2_500);

interface TableDef {
  id: number;
  name: string;
  sb: number;
  bb: number;
  minBuy: number;
  maxBuy: number;
}

export const TABLE_DEFS: TableDef[] = [
  { id: 1, name: "Copper", sb: 1, bb: 2, minBuy: 40, maxBuy: 200 },
  { id: 2, name: "Gold", sb: 5, bb: 10, minBuy: 200, maxBuy: 1000 },
  { id: 3, name: "High Roller", sb: 25, bb: 50, minBuy: 1000, maxBuy: 5000 },
];

interface Seat {
  userId: number;
  pub: PublicUser;
  stack: number; // chips behind (in-memory truth between settles)
  cards: Card[];
  bet: number; // this street
  totalPut: number; // this hand
  folded: boolean;
  allIn: boolean;
  acted: boolean;
  revealed: boolean; // showdown contender — cards go public
  autoFolds: number; // consecutive timer actions (2 = stood up at hand end)
  // (a "leave after this hand" flag lived here once — leave() folds-and-goes
  // immediately, so it was never set; removed in the July 2026 review)
  won: number; // last-hand winnings, for the banner
  handName: string | null;
}

type Phase = HoldemTableDTO["phase"];

interface Table {
  def: TableDef;
  seats: (Seat | null)[];
  phase: Phase;
  handId: number;
  board: Card[];
  deck: Card[];
  button: number;
  current: number;
  currentBet: number;
  lastRaise: number;
  deadline: number | null;
  // Chips forfeited by mid-hand leavers, one entry per leaver. Kept as
  // AMOUNTS (not a lumped scalar) so settlement can level them into side
  // pots like any other contribution — lumping let a short all-in win
  // forfeited chips that only deeper stacks had covered.
  deadPuts: number[];
  winners: { user: PublicUser; amount: number; hand: string | null }[];
  timer: ReturnType<typeof setTimeout> | null;
}

export type HoldemError =
  | "no_table" | "bad_seat" | "seat_taken" | "already_seated" | "bad_buyin"
  | "insufficient" | "not_seated" | "not_your_turn" | "bad_action" | "bad_amount";

export class Holdem {
  private tables: Table[];

  constructor(
    private store: Store,
    private bus: Bus,
  ) {
    this.tables = TABLE_DEFS.map((def) => ({
      def,
      seats: Array(SEATS).fill(null),
      phase: "waiting" as Phase,
      handId: 0,
      board: [],
      deck: [],
      button: -1,
      current: -1,
      currentBet: 0,
      lastRaise: def.bb,
      deadline: null,
      deadPuts: [],
      winners: [],
      timer: null,
    }));
  }

  // ---- Wire shape ----------------------------------------------------------

  state(): HoldemLobbyDTO {
    return { tables: this.tables.map((t) => this.tableDto(t)) };
  }

  /** My hole cards for an in-flight hand (refresh recovery — normally they
   *  arrive on the recipient-scoped holdem.cards frame at the deal). */
  myCards(userId: number): { tableId: number; handId: number; cards: Card[] } | null {
    for (const t of this.tables) {
      const s = t.seats.find((x) => x?.userId === userId);
      if (s && s.cards.length === 2 && t.phase !== "waiting") {
        return { tableId: t.def.id, handId: t.handId, cards: [...s.cards] };
      }
    }
    return null;
  }

  private tableDto(t: Table): HoldemTableDTO {
    const pot =
      t.seats.reduce((n, s) => n + (s?.totalPut ?? 0), 0) +
      t.deadPuts.reduce((a, b) => a + b, 0);
    return {
      id: t.def.id,
      name: t.def.name,
      sb: t.def.sb,
      bb: t.def.bb,
      minBuy: t.def.minBuy,
      maxBuy: t.def.maxBuy,
      phase: t.phase,
      handId: t.handId,
      board: [...t.board],
      pot,
      currentBet: t.currentBet,
      minRaiseTo: t.currentBet + t.lastRaise,
      deadline: t.deadline,
      winners: [...t.winners],
      seats: t.seats.map((s, i): HoldemSeatDTO | null =>
        s === null
          ? null
          : {
              user: s.pub,
              stack: s.stack,
              bet: s.bet,
              folded: s.folded,
              allIn: s.allIn,
              acting: t.current === i && this.inHand(t),
              button: t.button === i,
              cards: s.revealed ? [...s.cards] : null,
              handName: s.revealed ? s.handName : null,
              won: s.won,
              canRaise: this.canRaise(t, i),
            },
      ),
    };
  }

  private broadcast(): void {
    this.bus.emit("holdem.state", { lobby: this.state() });
  }

  /** May seat `i` raise right now? The SAME rule action() enforces: it must
   *  be their turn in a live hand, they must not have acted since the last
   *  full raise (a short all-in does not reopen action), and they must have
   *  chips beyond the current bet. Rides the DTO so the clients never offer a
   *  raise box the server would refuse. */
  private canRaise(t: Table, i: number): boolean {
    const s = t.seats[i];
    if (!s || !this.inHand(t) || t.current !== i) return false;
    if (s.folded || s.allIn || s.acted) return false;
    return s.bet + s.stack > t.currentBet;
  }

  private inHand(t: Table): boolean {
    return t.phase === "preflop" || t.phase === "flop" || t.phase === "turn" || t.phase === "river";
  }

  private schedule(t: Table, ms: number, fn: () => void): void {
    if (t.timer) clearTimeout(t.timer);
    t.timer = setTimeout(fn, ms);
  }

  // ---- Seating -------------------------------------------------------------

  sit(user: User, tableId: number, seatIdx: number, buyIn: number): { coins: number } | { error: HoldemError } {
    const t = this.tables.find((x) => x.def.id === tableId);
    if (!t) return { error: "no_table" };
    if (!Number.isInteger(seatIdx) || seatIdx < 0 || seatIdx >= SEATS) return { error: "bad_seat" };
    if (t.seats[seatIdx]) return { error: "seat_taken" };
    if (this.tables.some((x) => x.seats.some((s) => s?.userId === user.id))) return { error: "already_seated" };
    if (!Number.isInteger(buyIn) || buyIn < t.def.minBuy || buyIn > t.def.maxBuy) return { error: "bad_buyin" };

    const escrow = this.store.holdemSit(tableId, user.id, buyIn);
    if (!escrow) return { error: "insufficient" };
    // "gambled" telemetry accrues per HAND at settle (totalPut), like the
    // other games count per wager — bracketing it as +buyIn here / −stack at
    // leave went negative for winners and missed the AFK-sweep leave path.

    t.seats[seatIdx] = {
      userId: user.id,
      pub: toPublicUser(user),
      stack: buyIn,
      cards: [],
      bet: 0,
      totalPut: 0,
      folded: true, // not in a hand until dealt in
      allIn: false,
      acted: false,
      revealed: false,
      autoFolds: 0,
      won: 0,
      handName: null,
    };
    if (t.phase === "waiting" && this.readyCount(t) >= 2) {
      this.schedule(t, START_MS, () => this.startHand(t));
      t.deadline = Date.now() + START_MS;
    }
    this.broadcast();
    return { coins: escrow.coins };
  }

  /** Stand up. Between hands: instant (full stack back). Mid-hand: fold-and-
   *  go — chips behind return now, committed chips stay in the pot. */
  leave(user: User, tableId: number): { coins: number } | { error: HoldemError } {
    const t = this.tables.find((x) => x.def.id === tableId);
    if (!t) return { error: "no_table" };
    const idx = t.seats.findIndex((s) => s?.userId === user.id);
    if (idx < 0) return { error: "not_seated" };
    this.standUp(t, idx);
    return { coins: this.store.getCoins(user.id) };
  }

  /** Logout / desktop-exit hook: stand up from any table. */
  leaveAll(userId: number): void {
    for (const t of this.tables) {
      const idx = t.seats.findIndex((s) => s?.userId === userId);
      if (idx >= 0) this.standUp(t, idx);
    }
  }

  private standUp(t: Table, idx: number): void {
    const s = t.seats[idx];
    if (!s) return;
    const inLiveHand = this.inHand(t) && !s.folded;
    // The DB credit is chips-behind; anything committed rides to the pot.
    const backed = this.store.holdemLeave(t.def.id, s.userId, s.stack);
    // Committed chips ride to the pot only if the seat's row still backed them
    // (Oct 2026 review): a death sweeps the whole row — committed chips
    // included — back into the estate first, and pushing them as dead money
    // as well paid them to the winner a second time.
    if (backed && (this.inHand(t) || t.phase === "showdown" || t.phase === "settle") && s.totalPut > 0) {
      t.deadPuts.push(s.totalPut);
    }
    t.seats[idx] = null;

    if (inLiveHand) {
      const alive = this.liveSeats(t);
      if (alive.length === 1) {
        this.endHandByFold(t, alive[0]);
      } else if (t.current === idx) {
        this.advance(t);
        return; // advance broadcasts
      }
    }
    if (t.phase === "waiting" && this.readyCount(t) < 2 && t.timer) {
      clearTimeout(t.timer);
      t.timer = null;
      t.deadline = null;
    }
    this.broadcast();
  }

  private readyCount(t: Table): number {
    return t.seats.filter((s) => s && s.stack > 0).length;
  }

  private liveSeats(t: Table): number[] {
    return t.seats.map((s, i) => (s && !s.folded ? i : -1)).filter((i) => i >= 0);
  }

  // ---- Hand lifecycle ------------------------------------------------------

  private startHand(t: Table): void {
    // Sweep busted / AFK seats first.
    t.seats.forEach((s, i) => {
      if (s && (s.stack <= 0 || s.autoFolds >= 2)) {
        this.store.holdemLeave(t.def.id, s.userId, s.stack);
        t.seats[i] = null;
      }
    });
    const players = t.seats.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
    if (players.length < 2) {
      t.phase = "waiting";
      t.deadline = null;
      t.winners = [];
      this.broadcast();
      return;
    }

    t.handId++;
    t.board = [];
    t.deck = shuffle(newDeck());
    t.deadPuts = [];
    t.winners = [];
    for (const i of players) {
      const s = t.seats[i]!;
      s.cards = [t.deck.pop()!, t.deck.pop()!];
      s.bet = 0;
      s.totalPut = 0;
      s.folded = false;
      s.allIn = false;
      s.acted = false;
      s.revealed = false;
      s.won = 0;
      s.handName = null;
    }

    // Button rotates to the next occupied seat; blinds follow.
    t.button = this.nextOccupied(t, t.button, players);
    const headsUp = players.length === 2;
    const sbIdx = headsUp ? t.button : this.nextOccupied(t, t.button, players);
    const bbIdx = this.nextOccupied(t, sbIdx, players);
    this.put(t.seats[sbIdx]!, t.def.sb);
    this.put(t.seats[bbIdx]!, t.def.bb);
    t.currentBet = t.def.bb;
    t.lastRaise = t.def.bb;
    t.phase = "preflop";
    // The action starts from the big blind and advance() finds the first
    // seat that can actually act (Oct 2026 review): handing it straight to
    // the seat after the BB froze the table when that seat had gone all-in
    // posting a blind — an all-in seat can't act, and the clock's auto-check
    // was refused, so nothing ever moved again. With nobody able to act,
    // advance() runs the board out.
    t.current = bbIdx;

    // Hole cards: recipient-scoped, one frame per player. Never broadcast.
    for (const i of players) {
      const s = t.seats[i]!;
      this.bus.emit("holdem.cards", {
        userIds: [s.userId],
        tableId: t.def.id,
        handId: t.handId,
        cards: [...s.cards],
      });
    }
    this.advance(t); // schedules the first actor's clock and broadcasts
  }

  private nextOccupied(t: Table, from: number, pool?: number[]): number {
    const occupied = pool ?? t.seats.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
    for (let step = 1; step <= SEATS; step++) {
      const i = ((from < 0 ? -1 : from) + step) % SEATS;
      if (occupied.includes(i)) return i;
    }
    return occupied[0] ?? 0;
  }

  private put(s: Seat, amount: number): void {
    const x = Math.min(amount, s.stack);
    s.stack -= x;
    s.bet += x;
    s.totalPut += x;
    if (s.stack === 0) s.allIn = true;
  }

  // ---- Actions -------------------------------------------------------------

  action(
    user: User,
    tableId: number,
    kind: "fold" | "check" | "call" | "raise",
    amount: number | null,
    isAuto = false,
  ): { ok: true } | { error: HoldemError } {
    const t = this.tables.find((x) => x.def.id === tableId);
    if (!t) return { error: "no_table" };
    const idx = t.seats.findIndex((s) => s?.userId === user.id);
    if (idx < 0) return { error: "not_seated" };
    if (!this.inHand(t) || t.current !== idx) return { error: "not_your_turn" };
    const s = t.seats[idx]!;
    if (s.folded || s.allIn) return { error: "not_your_turn" };

    if (kind === "fold") {
      s.folded = true;
    } else if (kind === "check") {
      if (s.bet !== t.currentBet) return { error: "bad_action" };
    } else if (kind === "call") {
      if (s.bet === t.currentBet) return { error: "bad_action" }; // that's a check
      this.put(s, t.currentBet - s.bet);
    } else {
      // Raise TO `amount` (total for the street). A player whose action was
      // never reopened (they already acted and only a short all-in has come
      // in since) may call or fold but NOT raise — the real NLHE rule.
      if (s.acted) return { error: "bad_action" };
      if (amount === null || !Number.isInteger(amount)) return { error: "bad_amount" };
      const allInTo = s.bet + s.stack;
      const minTo = t.currentBet + t.lastRaise;
      if (amount > allInTo) return { error: "bad_amount" };
      if (amount <= t.currentBet) return { error: "bad_amount" };
      if (amount < minTo && amount !== allInTo) return { error: "bad_amount" }; // short raise only as all-in
      const isFullRaise = amount >= minTo;
      this.put(s, amount - s.bet);
      if (isFullRaise) {
        t.lastRaise = amount - t.currentBet;
        // A full raise reopens action for everyone still able to act.
        for (const o of t.seats) if (o && o !== s && !o.folded && !o.allIn) o.acted = false;
      }
      t.currentBet = amount;
    }
    s.acted = true;
    s.autoFolds = isAuto ? s.autoFolds + 1 : 0;
    this.advance(t);
    return { ok: true };
  }

  private timeout(t: Table): void {
    if (!this.inHand(t) || t.current < 0) return;
    const s = t.seats[t.current];
    if (!s) return;
    // Auto: check when free, else fold — the kindest legal action.
    const kind = s.bet === t.currentBet ? "check" : "fold";
    const fakeUser = { id: s.userId } as User;
    const r = this.action(fakeUser, t.def.id, kind, null, true);
    // A refused auto-action must never strand the table with no clock running.
    if ("error" in r) this.advance(t);
  }

  /** Move the action, or close the street / the hand. */
  private advance(t: Table): void {
    const alive = this.liveSeats(t);
    if (alive.length === 1) {
      this.endHandByFold(t, alive[0]);
      return;
    }

    // Someone still to act this street?
    for (let step = 1; step <= SEATS; step++) {
      const i = (t.current + step) % SEATS;
      const s = t.seats[i];
      if (s && !s.folded && !s.allIn && (!s.acted || s.bet < t.currentBet)) {
        t.current = i;
        t.deadline = Date.now() + TURN_MS;
        this.schedule(t, TURN_MS, () => this.timeout(t));
        this.broadcast();
        return;
      }
    }

    // Street complete.
    for (const s of t.seats) if (s) (s.bet = 0), (s.acted = false);
    t.currentBet = 0;
    t.lastRaise = t.def.bb;

    if (t.phase === "river") {
      this.showdown(t);
      return;
    }
    const deal = () => {
      if (t.phase === "preflop") {
        t.board.push(t.deck.pop()!, t.deck.pop()!, t.deck.pop()!);
        t.phase = "flop";
      } else if (t.phase === "flop") {
        t.board.push(t.deck.pop()!);
        t.phase = "turn";
      } else {
        t.board.push(t.deck.pop()!);
        t.phase = "river";
      }
    };

    // If nobody (or one player) can still act, run the board out on a timer.
    const actionable = alive.filter((i) => !t.seats[i]!.allIn);
    if (actionable.length <= 1) {
      // Reveal the all-in showdown now — live rooms table the cards before
      // the runout, and the sweat is the fun part.
      for (const i of alive) {
        const s = t.seats[i]!;
        s.revealed = true;
        s.handName = null;
        // NOBODY acts during a runout. Without this, the street reset above
        // (acted=false) let the lone non-all-in player back into the actor
        // scan on the timer's re-entry — a full betting round per street
        // with everyone's cards already face-up (raise into a dead pot,
        // fold after the reveal, or eat AFK strikes for watching).
        s.acted = true;
      }
      deal();
      t.current = -1;
      t.deadline = Date.now() + STREET_MS;
      this.schedule(t, STREET_MS, () => this.advance(t));
      this.broadcast();
      return;
    }

    deal();
    t.current = this.nextOccupied(
      t,
      t.button,
      alive.filter((i) => !t.seats[i]!.allIn),
    );
    t.deadline = Date.now() + TURN_MS;
    this.schedule(t, TURN_MS, () => this.timeout(t));
    this.broadcast();
  }

  // ---- Settlement ----------------------------------------------------------

  private rake(t: Table, potTotal: number): number {
    if (t.board.length === 0) return 0; // no flop, no drop
    return Math.min(Math.floor(potTotal * RAKE_PCT), RAKE_CAP_BB * t.def.bb);
  }

  private endHandByFold(t: Table, winnerIdx: number): void {
    const w = t.seats[winnerIdx]!;
    const pot =
      t.seats.reduce((n, s) => n + (s?.totalPut ?? 0), 0) +
      t.deadPuts.reduce((a, b) => a + b, 0);
    // The rake is on the CONTESTED pot (Oct 2026 review): the winner's bet
    // beyond anyone else's contribution was never called and comes back
    // whole — raking it left a player who won the hand down silver.
    const others = [
      ...t.seats.map((x, i) => (x && i !== winnerIdx ? x.totalPut : 0)),
      ...t.deadPuts,
    ];
    const uncalled = Math.max(0, w.totalPut - Math.max(0, ...others));
    const rake = this.rake(t, pot - uncalled);
    const winnings = pot - rake;
    w.won = winnings;
    t.winners = [{ user: w.pub, amount: winnings, hand: null }];
    this.settleMoney(t, rake);
    this.finishHand(t);
  }

  private showdown(t: Table): void {
    t.phase = "showdown";
    const alive = this.liveSeats(t);
    const scores = new Map<number, number>();
    for (const i of alive) {
      const s = t.seats[i]!;
      const score = best7([...t.board, ...s.cards]);
      scores.set(i, score);
      s.revealed = true;
      s.handName = categoryName(score);
    }

    // Side pots from contribution levels (folded seats' chips + leavers'
    // dead money are prize money; only non-folded hands can win a level).
    // Leavers' amounts level like any contribution — lumping them into the
    // main pot let a short all-in win chips only deeper stacks had covered.
    const levels = [...new Set(alive.map((i) => t.seats[i]!.totalPut))].sort((a, b) => a - b);
    const pots: { amt: number; eligible: number[] }[] = [];
    let prev = 0;
    for (const L of levels) {
      let amt = 0;
      for (const s of t.seats) if (s) amt += Math.min(s.totalPut, L) - Math.min(s.totalPut, prev);
      for (const dp of t.deadPuts) amt += Math.min(dp, L) - Math.min(dp, prev);
      pots.push({ amt, eligible: alive.filter((i) => t.seats[i]!.totalPut >= L) });
      prev = L;
    }
    // Folder/leaver chips ABOVE the top alive level would land in no pot
    // (debited at settle, credited to nobody) — they belong to the last
    // pot's contest.
    let excess = 0;
    for (const s of t.seats) if (s) excess += Math.max(0, s.totalPut - prev);
    for (const dp of t.deadPuts) excess += Math.max(0, dp - prev);
    if (excess > 0 && pots.length > 0) pots[pots.length - 1].amt += excess;

    // A pot only one hand is eligible for is that player's own uncalled chips
    // coming back: it is no contest, and it isn't raked (Oct 2026 review).
    const potTotal = pots.reduce((n, p) => n + (p.eligible.length > 1 ? p.amt : 0), 0);
    // THE RAKE IS WHAT THE MAIN POT CAN PAY (Sep 2026 review). It used to be
    // computed on the whole pot, capped when taken OUT of the main pot, and
    // then handed UNCAPPED to holdemSettle — so a short all-in against a big
    // raise (main pot 40, rake 101) credited the lottery 101 while the
    // winners lost 40: 61 silver minted per such hand. One number, both uses.
    const rake = Math.min(this.rake(t, potTotal), pots[0].amt);
    pots[0].amt -= rake;

    // Award each pot; odd chips to the first winner left of the button.
    const wonBy = new Map<number, number>();
    for (const pot of pots) {
      if (pot.amt <= 0) continue;
      const bestScore = Math.max(...pot.eligible.map((i) => scores.get(i)!));
      const winners = pot.eligible.filter((i) => scores.get(i) === bestScore);
      const share = Math.floor(pot.amt / winners.length);
      let rem = pot.amt - share * winners.length;
      const ordered = this.clockwiseFrom(t.button + 1, winners);
      for (const i of ordered) {
        const extra = rem > 0 ? 1 : 0;
        rem -= extra;
        wonBy.set(i, (wonBy.get(i) ?? 0) + share + extra);
      }
    }

    for (const [i, amount] of wonBy) t.seats[i]!.won = amount;
    t.winners = [...wonBy.entries()]
      .map(([i, amount]) => ({ user: t.seats[i]!.pub, amount, hand: t.seats[i]!.handName }))
      .sort((a, b) => b.amount - a.amount);
    this.settleMoney(t, rake);
    this.finishHand(t);
  }

  private clockwiseFrom(start: number, pool: number[]): number[] {
    const out: number[] = [];
    for (let step = 0; step < SEATS; step++) {
      const i = (start + step) % SEATS;
      if (pool.includes(i)) out.push(i);
    }
    return out;
  }

  /** One txn: each seat's escrow row moves by (winnings − contribution); the
   *  rake seeds tonight's lottery pot. In-memory stacks absorb winnings. */
  private settleMoney(t: Table, rake: number): void {
    const deltas: { userId: number; delta: number }[] = [];
    for (const s of t.seats) {
      if (!s) continue;
      if (s.totalPut === 0 && s.won === 0) continue;
      deltas.push({ userId: s.userId, delta: s.won - s.totalPut });
      s.stack += s.won;
      // Per-hand wager telemetry (the other games' per-wager pattern).
      if (s.totalPut > 0) this.store.bumpStat(s.userId, "gambled", s.totalPut);
      if (s.won > 0) this.store.maxStat(s.userId, "holdem_best", s.won);
    }
    this.store.holdemSettle(t.def.id, deltas, rake, lotteryDay());
  }

  private finishHand(t: Table): void {
    t.phase = "settle";
    t.current = -1;
    t.deadline = Date.now() + SETTLE_MS;
    for (const s of t.seats) if (s) (s.bet = 0), (s.totalPut = 0);
    t.deadPuts = [];
    this.schedule(t, SETTLE_MS, () => this.startHand(t));
    this.broadcast();
  }
}

export function createHoldem(store: Store, bus: Bus): Holdem {
  const refunded = store.holdemRefundAll();
  if (refunded > 0) console.log(`[holdem] refunded ${refunded} seat stack(s) from a previous run`);
  return new Holdem(store, bus);
}
