import { json, type Router } from "../http";
import type { Holdem } from "../holdem";

/**
 * Texas Hold'em — three house tables. All game logic lives in src/holdem.ts;
 * these routes translate HTTP into engine calls. Responses carry the caller's
 * fresh balance where money moved; hole cards ride the recipient-scoped
 * holdem.cards frame (GET returns mine for refresh recovery).
 */
export function registerHoldemRoutes(router: Router, holdem: Holdem): void {
  router.get("/api/holdem", "user", ({ res, user, store }) => {
    json(res, 200, {
      lobby: holdem.state(),
      coins: store.getCoins(user.id),
      mine: holdem.myCards(user.id),
    });
  });

  // Sit down: { tableId, seat, buyIn }.
  router.post("/api/holdem/sit", "user", ({ res, body, user }) => {
    const r = holdem.sit(user, Number(body?.tableId), Number(body?.seat), Number(body?.buyIn));
    if ("error" in r) {
      const status = r.error === "insufficient" ? 402 : r.error === "seat_taken" || r.error === "already_seated" ? 409 : 400;
      return json(res, status, { error: r.error });
    }
    json(res, 200, { lobby: holdem.state(), coins: r.coins });
  });

  // Stand up: { tableId }. Mid-hand = fold-and-go (committed chips stay).
  router.post("/api/holdem/leave", "user", ({ res, body, user }) => {
    const r = holdem.leave(user, Number(body?.tableId));
    if ("error" in r) return json(res, 400, { error: r.error });
    json(res, 200, { lobby: holdem.state(), coins: r.coins });
  });

  // Act: { tableId, action: fold|check|call|raise, amount? } — amount is the
  // raise-TO total for the street.
  router.post("/api/holdem/action", "user", ({ res, body, user }) => {
    const kind = String(body?.action ?? "") as "fold" | "check" | "call" | "raise";
    if (!["fold", "check", "call", "raise"].includes(kind)) return json(res, 400, { error: "bad_action" });
    const amount = body?.amount === undefined || body?.amount === null ? null : Number(body.amount);
    const r = holdem.action(user, Number(body?.tableId), kind, amount);
    if ("error" in r) {
      return json(res, r.error === "not_your_turn" ? 409 : 400, { error: r.error });
    }
    json(res, 200, { lobby: holdem.state() });
  });
}
