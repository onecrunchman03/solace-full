import { json, type Router } from "../http";
import type { BonePit } from "../bonepit";
import type { ChessDuels } from "../chessduel";

export const MIN_SIDE_BET = 5;
export const MAX_SIDE_BET = 10_000;

/**
 * Spectator side-betting (pari-mutuel) on chess duels + Bone Pit games.
 * The game engines own the "is this bettable" rules (windows + who's
 * playing); this route owns the money via the side_bets escrow. Winners
 * split the pool pro-rata after a 5% burned rake; refunds on draw/fold/
 * no-winning-tickets happen at the engines' settle points.
 */
export function registerSideBetRoutes(router: Router, pit: BonePit, duels: ChessDuels): void {
  router.post("/api/sidebet", "user", ({ res, body, user, store, bus }) => {
    const kind = String(body?.kind ?? "");
    const gameId = String(body?.gameId ?? "");
    const onUserId = Number(body?.onUserId);
    const amount = Math.floor(Number(body?.amount ?? 0));
    if (kind !== "chess" && kind !== "pit") return json(res, 400, { error: "bad_kind" });
    if (!gameId || !Number.isInteger(onUserId)) return json(res, 400, { error: "bad_target" });
    if (!Number.isInteger(amount) || amount < MIN_SIDE_BET || amount > MAX_SIDE_BET) {
      return json(res, 400, { error: "bad_amount" });
    }
    const gate = kind === "pit" ? pit.canBet(gameId, onUserId, user.id) : duels.canBet(gameId, onUserId, user.id);
    if (gate) return json(res, 400, { error: gate });
    if (!store.placeSideBet(kind, gameId, user.id, onUserId, amount)) {
      return json(res, 402, { error: "insufficient" });
    }
    const pools = store.sideBetPools(kind, gameId);
    bus.emit("sidebet.change", { kind, gameId, pools });
    json(res, 200, { ok: true, coins: store.getCoins(user.id), pools });
  });

  router.get("/api/sidebet/:kind/:gameId", "user", ({ res, params, user, store }) => {
    const { kind, gameId } = params;
    if (kind !== "chess" && kind !== "pit") return json(res, 400, { error: "bad_kind" });
    json(res, 200, {
      pools: store.sideBetPools(kind, gameId),
      mine: store.mySideBets(kind, gameId, user.id),
      min: MIN_SIDE_BET,
      max: MAX_SIDE_BET,
    });
  });
}
