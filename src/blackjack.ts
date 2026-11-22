// Blackjack — four house tables with silver bets. Server-authoritative: the
// deck, the dealer, every payout decision, and all timers live here; clients
// only render state and send intents.
//
// Economy: the game must stay a net coin sink (the standing rule — the Wheel
// is the only faucet). The ruleset is a standard Vegas 6:5 shoe game
// (~1.9-2% house edge):
//   - blackjack pays 6:5 (not 3:2)
//   - dealer hits soft 17
//   - double on any first two cards, INCLUDING after a split (DAS)
//   - SPLIT any matching pair once (ten-values interchangeable, like a real
//     table); split aces get exactly one card each; a post-split 21 is a
//     plain 21, never blackjack. No resplit, insurance, or surrender.
//   - a SIX-DECK SHOE that persists across rounds (casino realism: dealt
//     cards stay out of play) with the cut card at HALF the shoe. The
//     shallow penetration is deliberate: it keeps card counting worthless
//     (count value lives deep in a shoe) while the 6:5 payout keeps the
//     edge cushion — the house stays a net sink even against a counter.
//   - 10% of the table's net take each round seeds the nightly lottery pot
//     (HOUSE_TITHE) and a quarter funds Async's field programme
//     (GRANT_TITHE); the rest burns. See Store.houseEdgeTake.
//
// Money safety: a bet is debited into a persisted escrow row (blackjack_bets)
// in one transaction; settlement credits winnings and clears the row in one
// transaction; on boot, rows orphaned by a crash are refunded in full. Silver
// can be lost to the house edge, never to a server restart.

import { randomInt } from "node:crypto";
import type { Store } from "./db/store";
import type { Bus } from "./bus";
import { toPublicUser } from "./types";
import type { BjCard, BjLobbyDTO, BjSeatDTO, PublicUser } from "./types";
import { lotteryDay } from "./lottery";

export const LOBBIES = [
  { name: "Copper Table", minBet: 5, maxBet: 100 },
  { name: "Silver Table", minBet: 10, maxBet: 200 },
  { name: "Gold Table", minBet: 25, maxBet: 500 },
  { name: "High Roller", minBet: 50, maxBet: 1000 },
] as const;

// SIX since Aug 2026 (Josh: the casino floor's felts seat six) — money safety
// is per-seat escrow, so more chairs changes nothing in the settle paths.
export const SEATS_PER_LOBBY = 6;
const BETTING_MS = 20_000; // window after the first bet of a round
const ACTION_MS = 25_000; // per-turn clock; expiry auto-stands
const SETTLE_MS = 7_000; // results linger before the next round opens
const DECKS = 6;
export const SHOE_SIZE = DECKS * 52;
/** Reshuffle when the shoe dips to half — shallow on purpose (see header). */
const CUT_CARD = SHOE_SIZE / 2;
const IDLE_ROUNDS_TO_VACATE = 2; // sit out this many full rounds → seat freed
const STALE_SEAT_MS = 3 * 60_000; // no activity this long → evictable when full
const SEAT_AFK_MS = 20 * 60_000; // hard AFK cap: even an empty table won't hold you
const AFK_SWEEP_MS = 60_000;

// ---- Cards -----------------------------------------------------------------

const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
const SUITS = ["♠", "♥", "♦", "♣"] as const;

function freshShoe(): BjCard[] {
  const shoe: BjCard[] = [];
  for (let d = 0; d < DECKS; d++)
    for (const s of SUITS) for (const r of RANKS) shoe.push({ r, s });
  // Fisher-Yates
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = randomInt(i + 1); // crypto shuffle — the shoe must be unpredictable
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

/** Best blackjack value of a hand (aces count 11 where they fit). */
export function handValue(cards: BjCard[]): { value: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.r === "A") {
      aces++;
      total += 11;
    } else if (c.r === "J" || c.r === "Q" || c.r === "K" || c.r === "10") {
      total += 10;
    } else {
      total += Number(c.r);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { value: total, soft: aces > 0 };
}

const isBlackjack = (cards: BjCard[]) => cards.length === 2 && handValue(cards).value === 21;

/** Split-matching rank: ten-values (10/J/Q/K) are interchangeable, like a
 *  real table's "any pair" rule. */
const splitRank = (c: BjCard) => (c.r === "J" || c.r === "Q" || c.r === "K" || c.r === "10" ? "10" : c.r);
export const canSplitCards = (cards: BjCard[]) =>
  cards.length === 2 && splitRank(cards[0]) === splitRank(cards[1]);

// ---- Table state -----------------------------------------------------------

type Phase = "betting" | "acting" | "dealer" | "settle";
type SeatResult = "blackjack" | "win" | "push" | "lose" | "bust" | null;

interface Seat {
  userId: number;
  pub: PublicUser; // cached wire identity (refreshed lazily; avoids a DB read per broadcast)
  bet: number; // this round's stake (doubles on double)
  betId: number | null; // escrow row id while a bet is live
  cards: BjCard[];
  doubled: boolean;
  done: boolean; // finished acting this round
  left: boolean; // stood up mid-round; removed at round end
  result: SeatResult;
  payout: number;
  /** Split state: hand 2 mirrors hand 1 with its own equal bet + escrow. */
  split: boolean;
  cards2: BjCard[];
  bet2: number;
  betId2: number | null;
  doubled2: boolean;
  result2: SeatResult;
  payout2: number;
  activeHand: 0 | 1; // which hand is acting while it's this seat's turn
  idleRounds: number; // consecutive completed rounds sat out (vacated at 2)
  lastActiveAt: number; // join/bet/action time — stale seats are evictable
}

interface Lobby {
  index: number;
  phase: Phase;
  round: number;
  seats: (Seat | null)[];
  dealer: BjCard[];
  shoe: BjCard[];
  /** This round came off a freshly shuffled shoe (the cut card came out). */
  shuffled: boolean;
  activeSeat: number; // seat index whose turn it is (-1 outside acting)
  endsAt: number | null; // when the current phase auto-advances
  timer: ReturnType<typeof setTimeout> | null;
}

export class Blackjack {
  private lobbies: Lobby[];

  constructor(
    private store: Store,
    private bus: Bus,
  ) {
    this.lobbies = LOBBIES.map((_, i) => ({
      index: i,
      phase: "betting" as Phase,
      round: 1,
      seats: Array(SEATS_PER_LOBBY).fill(null),
      dealer: [],
      shoe: [],
      shuffled: false,
      activeSeat: -1,
      endsAt: null,
      timer: null,
    }));
    // Hard AFK cap: the idle-round + stale-when-full rules only fire when a
    // table sees play; a lone player parked at a quiet table would otherwise
    // hold the seat forever. Bet-free seats older than SEAT_AFK_MS are freed
    // wherever they are (money-holding seats are never touched). The interval
    // is unref'd so it can't keep a shutting-down process alive.
    const sweep = setInterval(() => {
      for (const l of this.lobbies) {
        const cutoff = Date.now() - SEAT_AFK_MS;
        let changed = false;
        for (let i = 0; i < l.seats.length; i++) {
          const s = l.seats[i];
          if (s && s.bet === 0 && s.lastActiveAt < cutoff) {
            l.seats[i] = null;
            changed = true;
          }
        }
        if (changed) this.publish(l);
      }
    }, AFK_SWEEP_MS);
    sweep.unref?.();
  }

  // ---- public API (called by routes) ----

  listLobbies(): BjLobbyDTO[] {
    return this.lobbies.map((l) => this.dto(l));
  }

  lobby(i: number): Lobby | undefined {
    return this.lobbies[i];
  }

  join(lobbyIdx: number, userId: number): { ok: true } | { error: string } {
    const l = this.lobbies[lobbyIdx];
    if (!l) return { error: "no_lobby" };
    if (this.seatOf(l, userId)) return { error: "already_seated" };
    // One table at a time — a split presence would let bets race each other.
    for (const other of this.lobbies) {
      if (other !== l && this.seatOf(other, userId)) return { error: "seated_elsewhere" };
    }
    let free = l.seats.findIndex((s) => s === null);
    if (free < 0) {
      // Full — evict any long-idle, bet-free seat (a closed tab never sends
      // "leave"; without this, four abandoned seats brick a table until reboot).
      this.evictStaleSeats(l);
      free = l.seats.findIndex((s) => s === null);
      if (free < 0) return { error: "table_full" };
    }
    const u = this.store.getUserById(userId);
    if (!u) return { error: "no_user" };
    l.seats[free] = {
      userId, pub: toPublicUser(u), bet: 0, betId: null, cards: [], doubled: false,
      done: false, left: false, result: null, payout: 0,
      split: false, cards2: [], bet2: 0, betId2: null, doubled2: false, result2: null, payout2: 0, activeHand: 0,
      idleRounds: 0, lastActiveAt: Date.now(),
    };
    this.publish(l);
    return { ok: true };
  }

  /** Free bet-free seats that haven't touched the table in STALE_SEAT_MS.
   *  Seats with a live bet are never evicted — money stays player-controlled. */
  private evictStaleSeats(l: Lobby): void {
    const cutoff = Date.now() - STALE_SEAT_MS;
    for (let i = 0; i < l.seats.length; i++) {
      const s = l.seats[i];
      if (s && s.bet === 0 && s.lastActiveAt < cutoff) l.seats[i] = null;
    }
  }

  leave(lobbyIdx: number, userId: number): { ok: true } | { error: string } {
    const l = this.lobbies[lobbyIdx];
    if (!l) return { error: "no_lobby" };
    const seat = this.seatOf(l, userId);
    if (!seat) return { error: "not_seated" };

    if (seat.bet === 0) {
      // No money at risk (spectating seat, or betting phase without a bet):
      // vacate immediately regardless of phase — holding the seat would also
      // lock them out of every other table until the round ends.
      l.seats[l.seats.indexOf(seat)] = null;
    } else if (l.phase === "betting") {
      // Refund an unplayed bet and vacate immediately.
      if (seat.betId != null) this.store.bjRefundBet(seat.betId, userId, seat.bet);
      l.seats[l.seats.indexOf(seat)] = null;
      // If they were the only pending better, the round may no longer start.
      if (!l.seats.some((s) => s && s.bet > 0)) this.clearTimer(l);
    } else {
      // Mid-round with a live bet: the hand plays itself out (auto-stand) and
      // still settles — the seat is reclaimed when the round ends.
      seat.left = true;
      if (l.phase === "acting" && l.seats[l.activeSeat] === seat) this.advanceTurn(l);
    }
    this.publish(l);
    return { ok: true };
  }

  bet(lobbyIdx: number, userId: number, amount: number): { ok: true } | { error: string } {
    const l = this.lobbies[lobbyIdx];
    if (!l) return { error: "no_lobby" };
    if (l.phase !== "betting") return { error: "round_in_progress" };
    const seat = this.seatOf(l, userId);
    if (!seat) return { error: "not_seated" };
    if (seat.bet > 0) return { error: "already_bet" };
    const { minBet, maxBet } = LOBBIES[lobbyIdx];
    if (!Number.isInteger(amount) || amount < minBet || amount > maxBet) {
      return { error: "bad_bet" };
    }
    const betId = this.store.bjPlaceBet(userId, amount, lobbyIdx);
    if (betId === null) return { error: "insufficient" };
    seat.bet = amount;
    seat.betId = betId;
    seat.idleRounds = 0;
    seat.lastActiveAt = Date.now();

    // First bet of the round opens the betting window; when every occupied
    // seat has bet, deal immediately.
    const seated = l.seats.filter((s): s is Seat => !!s && !s.left);
    if (seated.every((s) => s.bet > 0)) {
      this.deal(l);
    } else if (l.endsAt === null) {
      this.schedule(l, BETTING_MS, () => this.deal(l));
    }
    this.publish(l);
    return { ok: true };
  }

  action(
    lobbyIdx: number,
    userId: number,
    move: "hit" | "stand" | "double" | "split",
  ): { ok: true } | { error: string } {
    const l = this.lobbies[lobbyIdx];
    if (!l) return { error: "no_lobby" };
    if (l.phase !== "acting") return { error: "not_your_turn" };
    const seat = l.seats[l.activeSeat];
    if (!seat || seat.userId !== userId) return { error: "not_your_turn" };
    seat.lastActiveAt = Date.now();
    const hand = seat.activeHand === 1 ? seat.cards2 : seat.cards;

    // Each branch below broadcasts exactly once: hit-and-continue publishes
    // here; every other path funnels through finishHand/advanceTurn/dealer/
    // settle, which publish themselves.
    if (move === "hit") {
      hand.push(this.draw(l));
      const v = handValue(hand).value;
      if (v >= 21) {
        if (v > 21) this.markBust(seat);
        this.finishHand(l, seat);
      } else {
        this.schedule(l, ACTION_MS, () => this.autoStand(l)); // reset the clock
        this.publish(l);
      }
    } else if (move === "double") {
      if (hand.length !== 2) return { error: "cant_double" };
      const betId = seat.activeHand === 1 ? seat.betId2! : seat.betId!;
      const stake = seat.activeHand === 1 ? seat.bet2 : seat.bet;
      if (this.store.bjRaiseBet(betId, userId, stake) === null) {
        return { error: "insufficient" };
      }
      if (seat.activeHand === 1) {
        seat.bet2 *= 2;
        seat.doubled2 = true;
      } else {
        seat.bet *= 2;
        seat.doubled = true;
      }
      hand.push(this.draw(l));
      if (handValue(hand).value > 21) this.markBust(seat);
      this.finishHand(l, seat);
    } else if (move === "split") {
      // Any matching pair, once per round; ten-values are interchangeable
      // (the real-casino rule). The second hand posts an EQUAL bet.
      if (seat.split || seat.activeHand !== 0 || !canSplitCards(seat.cards)) {
        return { error: "cant_split" };
      }
      const betId2 = this.store.bjPlaceBet(userId, seat.bet, lobbyIdx);
      if (betId2 === null) return { error: "insufficient" };
      const aces = seat.cards[0].r === "A";
      seat.split = true;
      seat.bet2 = seat.bet;
      seat.betId2 = betId2;
      seat.cards2 = [seat.cards.pop()!];
      seat.cards.push(this.draw(l));
      seat.cards2.push(this.draw(l));
      seat.activeHand = 0;
      if (aces) {
        // Split aces get exactly one card each — both hands stand as dealt.
        this.advanceTurn(l);
      } else if (handValue(seat.cards).value >= 21) {
        this.finishHand(l, seat); // dealt straight to 21 — on to hand two
      } else {
        this.schedule(l, ACTION_MS, () => this.autoStand(l));
        this.publish(l);
      }
    } else {
      this.finishHand(l, seat);
    }
    return { ok: true };
  }

  /** Bust the seat's ACTIVE hand. */
  private markBust(seat: Seat): void {
    if (seat.activeHand === 1) seat.result2 = "bust";
    else seat.result = "bust";
  }

  /** The active hand is finished: a split seat moves to hand two (with a
   *  fresh clock); otherwise play passes to the next seat. */
  private finishHand(l: Lobby, seat: Seat): void {
    if (seat.split && seat.activeHand === 0) {
      seat.activeHand = 1;
      if (handValue(seat.cards2).value >= 21) {
        // A dealt 21 stands instantly (2 cards can't bust).
        this.advanceTurn(l);
      } else {
        this.schedule(l, ACTION_MS, () => this.autoStand(l));
        this.publish(l);
      }
    } else {
      this.advanceTurn(l);
    }
  }

  /** Total occupied seats across every table (for the hub badge). */
  playersSeated(): number {
    return this.lobbies.reduce((n, l) => n + l.seats.filter(Boolean).length, 0);
  }

  /** Logout hook: stand up from wherever this user is seated. The normal
   *  leave() rules keep it money-safe (unplayed bets refund; a live hand
   *  stands and settles). */
  leaveAll(userId: number): void {
    for (const l of this.lobbies) {
      if (this.seatOf(l, userId)) this.leave(l.index, userId);
    }
  }

  // ---- internals ----

  private seatOf(l: Lobby, userId: number): Seat | undefined {
    return l.seats.find((s): s is Seat => !!s && s.userId === userId);
  }

  private draw(l: Lobby): BjCard {
    return l.shoe.pop()!; // cut card at 156 vs ~30 cards/round — cannot run dry
  }

  private schedule(l: Lobby, ms: number, fn: () => void): void {
    this.clearTimer(l);
    l.endsAt = Date.now() + ms;
    l.timer = setTimeout(fn, ms);
  }

  private clearTimer(l: Lobby): void {
    if (l.timer) clearTimeout(l.timer);
    l.timer = null;
    l.endsAt = null;
  }

  private deal(l: Lobby): void {
    this.clearTimer(l);
    // Anyone who didn't bet sits this round out.
    const players = l.seats.filter((s): s is Seat => !!s && s.bet > 0);
    if (players.length === 0) {
      l.phase = "betting";
      this.publish(l);
      return;
    }
    l.phase = "acting";
    // The shoe persists across rounds; the dealer reshuffles at the cut card.
    if (l.shoe.length <= CUT_CARD) {
      l.shoe = freshShoe();
      l.shuffled = true;
    } else {
      l.shuffled = false;
    }
    l.dealer = [this.draw(l), this.draw(l)];
    for (const p of players) {
      p.cards = [this.draw(l), this.draw(l)];
      p.done = false;
      if (isBlackjack(p.cards)) p.done = true; // naturals skip acting
    }

    // House peeks: a dealer natural ends the round before anyone acts.
    if (isBlackjack(l.dealer)) {
      this.settle(l);
      return;
    }
    l.activeSeat = -1;
    this.advanceTurn(l);
  }

  private advanceTurn(l: Lobby): void {
    // Next seat with a live, unfinished hand. (A split seat with hand one
    // busted still owns its turn until hand two finishes — only the plain
    // single-hand bust skips.)
    for (let i = l.activeSeat + 1; i < l.seats.length; i++) {
      const s = l.seats[i];
      if (!s || s.bet === 0 || s.done || (!s.split && s.result === "bust")) continue;
      if (s.left) {
        s.done = true; // stood up mid-round: their hand stands as-is
        continue;
      }
      // Mark the previous seat done.
      if (l.activeSeat >= 0) {
        const prev = l.seats[l.activeSeat];
        if (prev) prev.done = true;
      }
      l.activeSeat = i;
      this.schedule(l, ACTION_MS, () => this.autoStand(l));
      this.publish(l);
      return;
    }
    if (l.activeSeat >= 0) {
      const prev = l.seats[l.activeSeat];
      if (prev) prev.done = true;
    }
    l.activeSeat = -1;
    this.dealerPlay(l);
  }

  private autoStand(l: Lobby): void {
    // Turn clock expired — the ACTIVE hand stands and play moves on (a split
    // seat's second hand gets its own clock). finishHand/advanceTurn (or the
    // dealer/settle path they fall into) broadcasts.
    if (l.phase !== "acting") return;
    const seat = l.seats[l.activeSeat];
    if (seat) this.finishHand(l, seat);
    else this.advanceTurn(l);
  }

  private dealerPlay(l: Lobby): void {
    this.clearTimer(l);
    l.phase = "dealer";
    // Draw only if someone is still standing (dealer never plays to a dead table).
    const contenders = l.seats.some(
      (s) =>
        !!s &&
        s.bet > 0 &&
        ((s.result !== "bust" && !(s.split ? false : isBlackjack(s.cards))) ||
          (s.split && s.result2 !== "bust")),
    );
    if (contenders) {
      let v = handValue(l.dealer);
      while (v.value < 17 || (v.value === 17 && v.soft)) {
        l.dealer.push(this.draw(l));
        v = handValue(l.dealer);
      }
    }
    this.publish(l); // clients see the reveal + draws
    this.settle(l);
  }

  /** Score one hand against the dealer. Split hands can never be blackjack
   *  (a post-split 21 is a plain 21 — the real-casino rule). */
  private scoreHand(
    cards: BjCard[],
    bet: number,
    busted: boolean,
    isSplitHand: boolean,
    dv: number,
    dealerBj: boolean,
    dealerBust: boolean,
  ): { result: SeatResult; payout: number } {
    const pv = handValue(cards).value;
    const playerBj = !isSplitHand && isBlackjack(cards);
    if (busted) return { result: "bust", payout: 0 }; // busts lose even to a dealer bust
    if (playerBj && dealerBj) return { result: "push", payout: bet };
    if (playerBj) return { result: "blackjack", payout: bet + Math.floor(bet * 1.2) }; // 6:5
    if (dealerBj) return { result: "lose", payout: 0 };
    if (dealerBust || pv > dv) return { result: "win", payout: bet * 2 };
    if (pv === dv) return { result: "push", payout: bet };
    return { result: "lose", payout: 0 };
  }

  private settle(l: Lobby): void {
    this.clearTimer(l);
    l.phase = "settle";
    const dv = handValue(l.dealer).value;
    const dealerBj = isBlackjack(l.dealer);
    const dealerBust = dv > 21;
    let tableBets = 0;
    let tablePayouts = 0;

    for (const s of l.seats) {
      if (!s || s.bet === 0) continue;
      const h1 = this.scoreHand(s.cards, s.bet, s.result === "bust", s.split, dv, dealerBj, dealerBust);
      s.result = h1.result;
      s.payout = h1.payout;
      // One transaction per hand: clear the escrow row + credit any payout.
      const real1 = this.store.bjSettleBet(s.betId!, s.userId, s.payout);
      s.betId = null;
      // a hand whose escrow a death already refunded seeds no pot
      if (real1) {
        tableBets += s.bet;
        tablePayouts += s.payout;
      }

      if (s.split) {
        const h2 = this.scoreHand(s.cards2, s.bet2, s.result2 === "bust", true, dv, dealerBj, dealerBust);
        s.result2 = h2.result;
        s.payout2 = h2.payout;
        const real2 = this.store.bjSettleBet(s.betId2!, s.userId, s.payout2);
        s.betId2 = null;
        if (real2) {
          tableBets += s.bet2;
          tablePayouts += s.payout2;
        }
      }

      // Ledger leaderboard telemetry.
      this.store.bumpStat(s.userId, "bj_hands", s.split ? 2 : 1);
      this.store.bumpStat(s.userId, "gambled", s.bet + s.bet2);
      const best = Math.max(s.payout, s.payout2);
      if (best > 0) this.store.maxStat(s.userId, "bj_best", best);
    }
    // A slice of the table's net take seeds the nightly lottery; the rest burns.
    const houseNet = tableBets - tablePayouts;
    this.store.houseEdgeTake(lotteryDay(), houseNet, "blackjack");
    this.publish(l);
    this.schedule(l, SETTLE_MS, () => this.nextRound(l));
  }

  private nextRound(l: Lobby): void {
    this.clearTimer(l);
    for (let i = 0; i < l.seats.length; i++) {
      const s = l.seats[i];
      if (!s) continue;
      if (s.left) {
        l.seats[i] = null;
        continue;
      }
      // Sitting out whole rounds while others play = a dead seat; free it
      // after IDLE_ROUNDS_TO_VACATE so an abandoned tab can't squat a table.
      if (s.bet === 0) {
        s.idleRounds++;
        if (s.idleRounds >= IDLE_ROUNDS_TO_VACATE) {
          l.seats[i] = null;
          continue;
        }
      } else {
        s.idleRounds = 0;
      }
      s.bet = 0;
      s.betId = null;
      s.cards = [];
      s.doubled = false;
      s.done = false;
      s.result = null;
      s.payout = 0;
      s.split = false;
      s.cards2 = [];
      s.bet2 = 0;
      s.betId2 = null;
      s.doubled2 = false;
      s.result2 = null;
      s.payout2 = 0;
      s.activeHand = 0;
    }
    l.dealer = [];
    l.round++;
    l.phase = "betting";
    l.activeSeat = -1;
    this.publish(l);
  }

  // ---- wire format ----

  private dto(l: Lobby): BjLobbyDTO {
    const cfg = LOBBIES[l.index];
    // The hole card stays server-side until the dealer's turn. Everything the
    // client learns about the dealer derives from this censored hand — one
    // source of truth, so value and cards can never disagree (or leak).
    const hideHole = (l.phase === "acting" || l.phase === "betting") && l.dealer.length > 0;
    const dealerCards: (BjCard | null)[] = hideHole ? [l.dealer[0], null] : [...l.dealer];
    const visibleDealer = dealerCards.filter((c): c is BjCard => c !== null);
    const seats: (BjSeatDTO | null)[] = l.seats.map((s) =>
      s
        ? {
            user: s.pub,
            bet: s.bet,
            cards: s.cards,
            value: s.cards.length ? handValue(s.cards).value : 0,
            blackjack: !s.split && isBlackjack(s.cards),
            doubled: s.doubled,
            done: s.done,
            left: s.left,
            result: s.result,
            payout: s.payout,
            split: s.split,
            cards2: s.cards2,
            value2: s.cards2.length ? handValue(s.cards2).value : 0,
            bet2: s.bet2,
            doubled2: s.doubled2,
            result2: s.result2,
            payout2: s.payout2,
            activeHand: s.activeHand,
            canSplit: !s.split && canSplitCards(s.cards),
          }
        : null,
    );
    return {
      index: l.index,
      name: cfg.name,
      minBet: cfg.minBet,
      maxBet: cfg.maxBet,
      phase: l.phase,
      round: l.round,
      seats,
      dealer: dealerCards,
      dealerValue: visibleDealer.length ? handValue(visibleDealer).value : 0,
      activeSeat: l.activeSeat,
      endsAt: l.endsAt,
      shoeLeft: l.shoe.length,
      shoeSize: SHOE_SIZE,
      shuffled: l.shuffled,
    };
  }

  private publish(l: Lobby): void {
    this.bus.emit("bj.state", { lobby: this.dto(l) });
  }
}

export function createBlackjack(store: Store, bus: Bus): Blackjack {
  // Crash recovery: refund any bet left in escrow by an unfinished round.
  const refunded = store.bjRefundOpenBets();
  if (refunded > 0) console.log(`[blackjack] refunded ${refunded} orphaned bet(s) from a previous run`);
  return new Blackjack(store, bus);
}
