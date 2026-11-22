import { json, type Router } from "../http";
import type { Blackjack } from "../blackjack";

/** Map an engine error code to an HTTP status. */
function status(error: string): number {
  switch (error) {
    case "no_lobby":
      return 404;
    case "insufficient":
      return 402;
    default:
      return 409; // wrong phase / seat conflicts / bad turn
  }
}

/**
 * Blackjack routes. All table state is public (the DTO already hides the
 * dealer's hole card); mutations are validated by the engine, which owns the
 * whole state machine — routes just translate HTTP ↔ engine calls.
 */
export function registerBlackjackRoutes(router: Router, bj: Blackjack): void {
  router.get("/api/blackjack", "user", ({ res }) => {
    json(res, 200, { lobbies: bj.listLobbies() });
  });

  router.post("/api/blackjack/:lobby/join", "user", ({ res, params, user }) => {
    const r = bj.join(Number(params.lobby), user.id);
    if ("error" in r) return json(res, status(r.error), { error: r.error });
    json(res, 200, { ok: true });
  });

  router.post("/api/blackjack/:lobby/leave", "user", ({ res, params, user }) => {
    const r = bj.leave(Number(params.lobby), user.id);
    if ("error" in r) return json(res, status(r.error), { error: r.error });
    json(res, 200, { ok: true });
  });

  // Bet + action return the caller's fresh balance (the endpoint contract the
  // shop/auction routes established), so the client never has to guess at an
  // optimistic debit.
  router.post("/api/blackjack/:lobby/bet", "user", ({ res, params, body, user, store }) => {
    const amount = Number(body?.amount);
    if (!Number.isInteger(amount) || amount <= 0) return json(res, 400, { error: "bad_bet" });
    const r = bj.bet(Number(params.lobby), user.id, amount);
    if ("error" in r) {
      return json(res, r.error === "bad_bet" ? 400 : status(r.error), { error: r.error });
    }
    json(res, 200, { ok: true, coins: store.getCoins(user.id) });
  });

  router.post("/api/blackjack/:lobby/action", "user", ({ res, params, body, user, store }) => {
    const move = String(body?.move ?? "");
    if (move !== "hit" && move !== "stand" && move !== "double" && move !== "split") {
      return json(res, 400, { error: "bad_move" });
    }
    const r = bj.action(Number(params.lobby), user.id, move);
    if ("error" in r) {
      return json(res, r.error === "insufficient" ? 402 : status(r.error), { error: r.error });
    }
    json(res, 200, { ok: true, coins: store.getCoins(user.id) });
  });
}
