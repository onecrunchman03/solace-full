import { json, type Router } from "../http";
import { MIN_STAKE, MAX_STAKE, type BonePit } from "../bonepit";

/**
 * Bone Pit routes. Thin: the engine owns all rules and broadcasts state
 * itself; routes just relay the caller's action. Every mutating response
 * includes the caller's fresh balance so wallets never do optimistic math.
 */
export function registerBonePitRoutes(router: Router, pit: BonePit): void {
  // Lobby + my cup (for reconnects; live updates ride the socket).
  router.get("/api/pit", "user", ({ res, user, store }) => {
    json(res, 200, {
      state: pit.state(),
      myDice: pit.myDice(user.id),
      coins: store.getCoins(user.id),
      minStake: MIN_STAKE,
      maxStake: MAX_STAKE,
    });
  });

  router.post("/api/pit/tables", "user", ({ res, body, user, store }) => {
    const stake = Math.floor(Number((body as { stake?: unknown })?.stake ?? 0));
    const r = pit.create(user.id, stake);
    if (!r.ok) return json(res, r.error === "insufficient" ? 402 : 400, { error: r.error });
    json(res, 200, { ok: true, gameId: r.gameId, coins: store.getCoins(user.id) });
  });

  router.post("/api/pit/tables/:id/join", "user", ({ res, params, user, store }) => {
    const r = pit.join(user.id, params.id);
    if (!r.ok) return json(res, r.error === "insufficient" ? 402 : 400, { error: r.error });
    json(res, 200, { ok: true, coins: store.getCoins(user.id) });
  });

  router.post("/api/pit/tables/:id/leave", "user", ({ res, params, user, store }) => {
    const r = pit.leave(user.id, params.id);
    if (!r.ok) return json(res, 400, { error: r.error });
    json(res, 200, { ok: true, coins: store.getCoins(user.id) });
  });

  router.post("/api/pit/tables/:id/start", "user", ({ res, params, user }) => {
    const r = pit.start(user.id, params.id);
    if (!r.ok) return json(res, 400, { error: r.error });
    json(res, 200, { ok: true });
  });

  router.post("/api/pit/tables/:id/bid", "user", ({ res, params, body, user }) => {
    const count = Math.floor(Number((body as { count?: unknown })?.count ?? 0));
    const face = Math.floor(Number((body as { face?: unknown })?.face ?? 0));
    const r = pit.bid(user.id, params.id, count, face);
    if (!r.ok) return json(res, 400, { error: r.error });
    json(res, 200, { ok: true });
  });

  router.post("/api/pit/tables/:id/liar", "user", ({ res, params, user }) => {
    const r = pit.liar(user.id, params.id);
    if (!r.ok) return json(res, 400, { error: r.error });
    json(res, 200, { ok: true });
  });
}
