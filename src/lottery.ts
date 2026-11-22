// The Nightly Lottery — the floor's daily ritual. Tickets cost 25 silver
// (SPENT into the day's pot, no escrow), max 20 per player per UTC day; at
// midnight a ticket-weighted winner takes 90% of the pot and the house burns
// the rest. The pot is also fed by the casino's 5% rakes (Derby, Auction,
// side bets — migration 43 boosts); a boosted day that sold no tickets rolls
// its silver forward instead of evaporating. Crash-safe by design: tickets
// persist in the DB and any undrawn past day is drawn lazily on boot / by
// the sweep — nobody's pot evaporates.

import type { Store } from "./db/store";
import type { Bus } from "./bus";
import { guardedTick } from "./health";

export const TICKET_PRICE = 25;
/** ONE TICKET EACH (Josh, Aug 2026). It used to be twenty, which made the
 *  nightly draw a question of who felt like spending 500 silver; at one
 *  apiece every player has exactly the same chance and the pot is a headcount
 *  rather than a bankroll. */
export const MAX_TICKETS_PER_DAY = 1;
/** …and a lottery needs someone to lose to. A night that never got two
 *  distinct buyers is VOID: the stake goes back and the pot rolls on. */
export const MIN_PLAYERS = 2;
/** Slice of each house-edge game's NET take (slots pulls, blackjack rounds,
 *  roulette spins) that seeds the nightly pot instead of burning. Keep this
 *  well under 1.0 — the games must stay net sinks. */
export const HOUSE_TITHE = 0.1;
const SWEEP_MS = 60_000;

/** UTC day key, e.g. "2026-07-21". */
export function lotteryDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Next UTC midnight (when today's draw fires), epoch ms. */
export function nextDrawAt(now = Date.now()): number {
  const DAY = 86_400_000;
  return (Math.floor(now / DAY) + 1) * DAY;
}

/** Draw every past day that still has an undrawn pot. Returns draws made. */
export function drawDuePots(store: Store, bus: Bus): number {
  const today = lotteryDay();
  const rolled = store.lotteryRollStaleBoosts(today);
  if (rolled > 0) console.log(`[lottery] rolled ${rolled} silver of unclaimed rake boosts into ${today}`);
  let drawn = 0;
  for (const day of store.lotteryUndrawnDays(today)) {
    // `today` is where a void night's rake boost rolls to — the silver stays
    // in the game rather than burning on a night that never ran.
    const r = store.lotteryDraw(day, TICKET_PRICE, MIN_PLAYERS, today);
    if (!r) console.log(`[lottery] ${day}: void — fewer than ${MIN_PLAYERS} players, stakes returned`);
    if (r) {
      drawn++;
      const winner = store.getUserById(r.winnerId);
      store.bumpStat(r.winnerId, "lottery_wins"); // Ledger/achievement telemetry
      console.log(`[lottery] ${day}: pot ${r.pot}, paid ${r.paid} to #${r.winnerId}`);
      bus.emit("lottery.won", {
        day,
        pot: r.pot,
        paid: r.paid,
        winner: winner ? { id: winner.id, displayName: winner.displayName } : null,
      });
    }
  }
  return drawn;
}

/** Boot + periodic sweep so the midnight draw fires promptly. */
export function startLotterySweep(store: Store, bus: Bus): () => void {
  drawDuePots(store, bus); // catch up anything missed while down
  const t = setInterval(() => {
    guardedTick(store, "lottery sweep", SWEEP_MS, () => drawDuePots(store, bus));
  }, SWEEP_MS);
  t.unref?.();
  return () => clearInterval(t);
}
