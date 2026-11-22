import { json, type Router } from "../http";
import type { ChessDuels, StakeSpec } from "../chessduel";

/** Map an engine error code to an HTTP status. */
function status(error: string): number {
  switch (error) {
    case "no_game":
    case "gone":
      return 404;
    case "bad_minutes":
    case "unknown_emoji":
    case "bad_amount":
    case "bad_stake":
      return 400;
    case "insufficient":
      return 402;
    case "not_your_game":
      return 403;
    default:
      return 409; // not_owned / in_game / stake_mismatch / turn + legality conflicts
  }
}

/** Parse a stake spec from a request body ({kind:"emoji",code} | {kind:"silver",amount}). */
function parseStake(body: any): StakeSpec | null {
  if (body?.kind === "silver") {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount)) return null;
    return { kind: "silver", amount };
  }
  // Default to emoji (back-compat with the original single-emoji client).
  const code = String(body?.code ?? "");
  if (!code) return null;
  return { kind: "emoji", code };
}

/**
 * Casino Chess Duel routes. All board state is public (chess is a
 * perfect-information game — spectating is a feature); mutations are
 * validated by the engine, which owns clocks, legality (chess.js), and
 * settlement. Routes just translate HTTP ↔ engine calls.
 */
export function registerChessRoutes(router: Router, duels: ChessDuels): void {
  router.get("/api/chess", "user", ({ res }) => {
    json(res, 200, duels.state());
  });

  // Post an open challenge: stake an owned emoji OR silver + pick a time control.
  router.post("/api/chess/challenge", "user", ({ res, body, user, store }) => {
    const minutes = Number(body?.minutes);
    const spec = parseStake(body);
    if (!spec) return json(res, 400, { error: "bad_stake" });
    const r = duels.challenge(user, spec, minutes);
    if (!r.ok) return json(res, status(r.error!), { error: r.error });
    json(res, 200, { ok: true, coins: store.getCoins(user.id) });
  });

  router.post("/api/chess/challenge/cancel", "user", ({ res, user, store }) => {
    const r = duels.cancelChallenge(user);
    if (!r.ok) return json(res, status(r.error!), { error: r.error });
    json(res, 200, { ok: true, coins: store.getCoins(user.id) });
  });

  router.post("/api/chess/accept", "user", ({ res, body, user, store }) => {
    const challengeId = String(body?.challengeId ?? "");
    const spec = parseStake(body);
    if (!challengeId || !spec) return json(res, 400, { error: "bad_request" });
    const r = duels.accept(user, challengeId, spec);
    if (!r.ok) return json(res, status(r.error!), { error: r.error });
    json(res, 200, { ok: true, gameId: r.gameId, coins: store.getCoins(user.id) });
  });

  router.post("/api/chess/move", "user", ({ res, body, user }) => {
    const gameId = String(body?.gameId ?? "");
    const from = String(body?.from ?? "");
    const to = String(body?.to ?? "");
    const promotion = body?.promotion != null ? String(body.promotion) : undefined;
    if (!gameId || !/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to)) {
      return json(res, 400, { error: "bad_move" });
    }
    const r = duels.move(user, gameId, from, to, promotion);
    if (!r.ok) return json(res, status(r.error!), { error: r.error });
    json(res, 200, { ok: true });
  });

  router.post("/api/chess/resign", "user", ({ res, body, user }) => {
    const gameId = String(body?.gameId ?? "");
    if (!gameId) return json(res, 400, { error: "bad_request" });
    const r = duels.resign(user, gameId);
    if (!r.ok) return json(res, status(r.error!), { error: r.error });
    json(res, 200, { ok: true });
  });
}
