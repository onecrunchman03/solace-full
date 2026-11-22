import { json, type Router } from "../http";
import { TICKET_PRICE, MAX_TICKETS_PER_DAY, lotteryDay, nextDrawAt, drawDuePots } from "../lottery";
import { toPublicUser } from "../types";

/** The Nightly Lottery — module in src/lottery.ts. Tickets are spent (not
 *  escrowed); the pot and player count are public, ticket ownership beyond
 *  your own count is not. */
export function registerLotteryRoutes(router: Router, bus: import("../bus").Bus): void {
  router.get("/api/lottery", "user", ({ res, user, store }) => {
    drawDuePots(store, bus); // lazy draw if midnight passed while quiet
    const day = lotteryDay();
    const state = store.lotteryDayState(day, TICKET_PRICE);
    const last = store.lotteryLastDraw();
    const lastWinner = last?.winnerId ? store.getUserById(last.winnerId) : undefined;
    json(res, 200, {
      day,
      drawAt: nextDrawAt(),
      price: TICKET_PRICE,
      maxPerDay: MAX_TICKETS_PER_DAY,
      pot: state.pot,
      tickets: state.tickets,
      players: state.players,
      boost: state.boost,
      mine: store.lotteryMyTickets(day, user.id),
      last: last
        ? {
            day: last.day,
            pot: last.pot,
            paid: last.paid,
            winner: lastWinner ? toPublicUser(lastWinner) : null,
          }
        : null,
      coins: store.getCoins(user.id),
    });
  });

  router.post("/api/lottery/buy", "user", ({ res, body, user, store }) => {
    const count = Number(body?.count);
    if (!Number.isInteger(count) || count < 1 || count > MAX_TICKETS_PER_DAY) {
      return json(res, 400, { error: "bad_count" });
    }
    const day = lotteryDay();
    const r = store.lotteryBuy(user.id, day, count, TICKET_PRICE, MAX_TICKETS_PER_DAY);
    if (!r.ok) {
      return json(res, r.error === "insufficient" ? 402 : 400, { error: r.error, coins: r.coins });
    }
    const state = store.lotteryDayState(day, TICKET_PRICE);
    json(res, 200, { ok: true, mine: r.mine, coins: r.coins, pot: state.pot, tickets: state.tickets });
  });
}
