import { json, type Router } from "../http";
import { pull, PULL_COST, STAKES, stakeOf } from "../slots";

/** Register the Slots of Chance routes (a pure silver sink — see src/slots.ts). */
export function registerSlotsRoutes(router: Router): void {
  // Status: the pull price and the player's balances — silver, plus the
  // escape room's two (E3b): free pulls consume first, chips cover the cost
  // before silver does.
  router.get("/api/slots", "user", ({ res, user, store }) => {
    json(res, 200, {
      cost: PULL_COST,
      stakes: STAKES,
      coins: store.getCoins(user.id),
      freePulls: store.getFreePulls(user.id),
      chips: store.getChips(user.id),
    });
  });

  // Pull the lever (server-authoritative). Debits the cost, returns the payline,
  // outcome, and the new balance. 402 when the player can't afford a pull.
  // `stake` is the machine's denomination (STAKES); absent = the base pull,
  // so the 2D game and older clients are unchanged.
  router.post("/api/slots/pull", "user", ({ res, user, store, bus, body }) => {
    const raw = (body as { stake?: unknown } | null)?.stake;
    const stake = raw === undefined ? PULL_COST : stakeOf(raw);
    if (stake === null) return json(res, 400, { error: "bad_stake" });
    const outcome = pull(store, user, stake);
    if (!outcome.ok) {
      const status = outcome.error === "insufficient" ? 402 : 409;
      return json(res, status, { error: outcome.error ?? "pull_failed", coins: outcome.coins });
    }
    // THE FLOOR mirrors the payline on the cabinet the puller stands at —
    // symbols only, never money (the wheel.spin rules; see bus.ts).
    if (outcome.reels) bus.emit("slots.pull", { userId: user.id, reels: outcome.reels, stake });
    json(res, 200, outcome);
  });
}
