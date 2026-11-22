import { json, type Router } from "../http";
import type { Craps, CrapsBetKind } from "../craps";

/**
 * Craps — the shared house table. All game logic lives in src/craps.ts; these
 * routes only translate HTTP into engine calls. Responses carry the caller's
 * fresh balance (coins never ride the public broadcast); the client defers
 * showing post-roll balances until its dice animation lands.
 */
export function registerCrapsRoutes(router: Router, craps: Craps): void {
  router.get("/api/craps", "user", ({ res, user, store }) => {
    json(res, 200, { state: craps.state(), coins: store.getCoins(user.id) });
  });

  // Place a bet: { kind, num?, amount }. Any bet wakes an idle table.
  router.post("/api/craps/bet", "user", ({ res, body, user }) => {
    const kind = String(body?.kind ?? "") as CrapsBetKind;
    const num = body?.num === undefined || body?.num === null ? null : Number(body.num);
    const amount = Number(body?.amount);
    const r = craps.placeBet(user, kind, num, amount);
    if ("error" in r) {
      const status = r.error === "insufficient" ? 402 : r.error === "closed" ? 409 : 400;
      return json(res, status, { error: r.error });
    }
    json(res, 200, { state: craps.state(), coins: r.coins });
  });

  // Take a bet down (full refund). The pass line is a contract once a point
  // is on — real-casino rule; everything else comes down on request.
  router.post("/api/craps/takedown", "user", ({ res, body, user }) => {
    const kind = String(body?.kind ?? "") as CrapsBetKind;
    const num = body?.num === undefined || body?.num === null ? null : Number(body.num);
    const r = craps.takeDown(user, kind, num);
    if ("error" in r) {
      return json(res, r.error === "closed" || r.error === "contract" ? 409 : 400, { error: r.error });
    }
    json(res, 200, { state: craps.state(), coins: r.coins });
  });

  // The shooter throws the dice.
  router.post("/api/craps/roll", "user", ({ res, user }) => {
    const r = craps.roll(user);
    if ("error" in r) return json(res, r.error === "not_shooter" ? 403 : 409, { error: r.error });
    json(res, 200, { state: craps.state() });
  });
}
