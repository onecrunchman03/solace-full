import { json, makeRateLimiter, type Router } from "../http";
import type { Derby } from "../derby";

/** The Emoji Derby — engine in src/derby.ts; responses carry the caller's
 *  balance + their own bets (coins never ride the public broadcast). */
export function registerDerbyRoutes(router: Router, derby: Derby): void {
  const rateLimit = makeRateLimiter();
  router.get("/api/derby", "user", ({ res, user, store }) => {
    json(res, 200, { state: derby.state(), mine: derby.myBets(user.id), coins: store.getCoins(user.id) });
  });

  // Back a runner: { racer, amount }. The first ticket opens the window.
  router.post("/api/derby/bet", "user", ({ res, body, user }) => {
    // Every bet and cancel is broadcast to the whole house — budget them.
    if (!rateLimit(`derby:${user.id}`, 12, 30_000)) return json(res, 429, { error: "rate_limited" });
    const racer = String(body?.racer ?? "");
    const amount = Number(body?.amount);
    const r = derby.placeBet(user.id, racer, amount);
    if ("error" in r) {
      const status =
        r.error === "insufficient" ? 402 : r.error === "closed" || r.error === "already_bet" ? 409 : 400;
      return json(res, status, { error: r.error });
    }
    json(res, 200, { state: derby.state(), mine: derby.myBets(user.id), coins: r.coins });
  });

  // Tear up your ticket while betting is open: full refund, bet again freely.
  router.post("/api/derby/cancel", "user", ({ res, user }) => {
    if (!rateLimit(`derby:${user.id}`, 12, 30_000)) return json(res, 429, { error: "rate_limited" });
    const r = derby.cancelBet(user.id);
    if ("error" in r) return json(res, r.error === "closed" ? 409 : 400, { error: r.error });
    json(res, 200, { state: derby.state(), mine: derby.myBets(user.id), coins: r.coins, refunded: r.refunded });
  });
}
