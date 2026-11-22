import { json, type Router } from "../http";
import type { Roulette, RouletteBetKind } from "../roulette";

/**
 * Roulette — the shared house table. All game logic lives in src/roulette.ts;
 * these routes only translate HTTP into engine calls. Responses carry the
 * caller's fresh balance (coins never ride the public broadcast) — the client
 * defers showing post-spin balances until its wheel animation lands.
 */
export function registerRouletteRoutes(router: Router, roulette: Roulette): void {
  router.get("/api/roulette", "user", ({ res, user, store }) => {
    json(res, 200, { state: roulette.state(), coins: store.getCoins(user.id) });
  });

  // Place a bet: { kind, target?, amount }. The first bet opens the window.
  router.post("/api/roulette/bet", "user", ({ res, body, user }) => {
    const kind = String(body?.kind ?? "") as RouletteBetKind;
    const target = body?.target === undefined || body?.target === null ? null : Number(body.target);
    const amount = Number(body?.amount);
    const r = roulette.placeBet(user, kind, target, amount);
    if ("error" in r) {
      const status = r.error === "insufficient" ? 402 : r.error === "closed" ? 409 : 400;
      return json(res, status, { error: r.error });
    }
    json(res, 200, { state: roulette.state(), coins: r.coins });
  });

  // Take back all your bets this round (misclick escape) — full refund,
  // only while betting is open.
  router.post("/api/roulette/clear", "user", ({ res, user }) => {
    const r = roulette.clearBets(user);
    if ("error" in r) {
      return json(res, r.error === "closed" ? 409 : 400, { error: r.error });
    }
    json(res, 200, { state: roulette.state(), coins: r.coins });
  });
}
