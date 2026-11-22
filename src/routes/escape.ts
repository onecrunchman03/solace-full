// THE CASINO ESCAPE ROOM — the threshold's HTTP surface (E1; design ESCAPE.md).
//
// Everything here is PASS-AND-COUNTER plumbing: staking a rare emoji for the
// pass, Sterling's ante-room tools, and the ER locker. The complex itself (the
// key, the hunt, the chests) rides the casino floor relay in E2-E4 — this file
// stays the money seam, because money never travels on a relay in this app.
import { AccessToken } from "livekit-server-sdk";
import { json, type Router } from "../http";
import { config } from "../config";
import { PASS_STAKE_TIER, ER_TOOLS, ER_INV_SLOTS, ER_LOCKER_SLOTS } from "../casino/escape";
import type { EscapeZone } from "../casino/escape-zone";

const voiceEnabled = (): boolean =>
  !!(config.livekitUrl && config.livekitApiKey && config.livekitApiSecret);

export function registerEscapeRoutes(router: Router, zone?: EscapeZone): void {
  // Proximity voice INSIDE the complex — the casino floor's route, verbatim
  // shape, its own LiveKit room. Zone first, config second, exactly like the
  // floor: "you're not inside" stays answerable on a box with no creds.
  router.post("/api/escape/voice-token", "user", async ({ res, user }) => {
    if (!zone?.has(user.id)) return json(res, 403, { error: "not_inside" });
    if (!voiceEnabled()) return json(res, 503, { error: "voice_disabled" });
    const at = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
      identity: String(user.id),
      name: user.displayName,
      ttl: "1h",
    });
    at.addGrant({
      room: "escape_room",
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
    });
    json(res, 200, { token: await at.toJwt(), url: config.livekitUrl, room: "escape_room" });
  });
  // The threshold, in one read: pass state, wallet, bag, locker, prices —
  // and whether a gun is CARRIED, which the door refuses by name.
  router.get("/api/escape", "user", ({ res, user, store }) => {
    json(res, 200, {
      pass: !!store.erPass(user.id),
      stakeTier: PASS_STAKE_TIER,
      coins: store.getCoins(user.id),
      inv: store.erInventory(user.id),
      locker: store.erLocker(user.id),
      tools: Object.fromEntries(
        Object.entries(ER_TOOLS).map(([id, t]) => [id, { name: t.name, price: t.price, blurb: t.blurb }]),
      ),
      invSlots: ER_INV_SLOTS,
      lockerSlots: ER_LOCKER_SLOTS,
      gunCarried: store.casinoGunRounds(user.id) !== null,
    });
  });

  // Stake one owned RARE for THE PASS. The emoji burns here and now.
  router.post("/api/escape/stake", "user", ({ res, body, user, store }) => {
    const code = String((body as { code?: unknown })?.code ?? "");
    if (!code) return json(res, 400, { error: "bad_code" });
    const r = store.erStakePass(user.id, code, PASS_STAKE_TIER);
    if (!r.ok) {
      const status =
        r.error === "already_passed" ? 409 : r.error === "not_owned" ? 404 : 400;
      return json(res, status, { error: r.error });
    }
    json(res, 200, { ok: true, pass: true });
  });

  // THE COUNTER AND THE LOCKER STAND IN THE ANTE-ROOM, NOT IN YOUR POCKET
  // (Aug 2026 review). These routes were reachable over HTTP from INSIDE the
  // complex — mid-hunt, a dying player could stash their whole bag into the
  // locker and resupply almond water, turning the death asymmetry ("what you
  // carry is destroyed, what you lockered survives") from an ante-room
  // decision into a reflex at the moment of death. A body in the zone talks
  // to nothing but the complex.
  const insideComplex = (userId: number): boolean => !!zone?.has(userId);

  // Sterling's ante-room counter. Pass-gated: the counter stands beyond the
  // door, and the server is the one that remembers that.
  router.post("/api/escape/buy", "user", ({ res, body, user, store }) => {
    if (!store.erPass(user.id)) return json(res, 403, { error: "no_pass" });
    if (insideComplex(user.id)) return json(res, 409, { error: "inside" });
    const item = String((body as { item?: unknown })?.item ?? "");
    // own keys only — "constructor" was a 500 (Oct 2026 review)
    const tool = Object.hasOwn(ER_TOOLS, item) ? ER_TOOLS[item as keyof typeof ER_TOOLS] : undefined;
    if (!tool) return json(res, 400, { error: "bad_item" });
    const r = store.erBuyTool(user.id, item, tool.price, ER_INV_SLOTS);
    if (!r.ok) {
      const status = r.error === "insufficient" ? 402 : 400;
      return json(res, status, { error: r.error });
    }
    json(res, 200, { ok: true, coins: r.coins, inv: store.erInventory(user.id) });
  });

  // Bag ↔ locker. Both pass-gated like the counter.
  router.post("/api/escape/locker/store", "user", ({ res, body, user, store }) => {
    if (!store.erPass(user.id)) return json(res, 403, { error: "no_pass" });
    if (insideComplex(user.id)) return json(res, 409, { error: "inside" });
    const b = body as { item?: unknown; qty?: unknown };
    const item = String(b?.item ?? "");
    // THE KEY IS THE ZONE'S, NOT YOURS (Aug 2026 review): lockering it left a
    // phantom key row the zone never tracks — it survived death, stacked
    // forever, and equipped as an inert prop that opens nothing.
    if (item === "key") return json(res, 400, { error: "bad_item" });
    const r = store.erLockerStore(user.id, item, Number(b?.qty ?? 1), ER_LOCKER_SLOTS);
    if (!r.ok) return json(res, 400, { error: r.error });
    json(res, 200, { ok: true, inv: store.erInventory(user.id), locker: store.erLocker(user.id) });
  });

  router.post("/api/escape/locker/take", "user", ({ res, body, user, store }) => {
    if (!store.erPass(user.id)) return json(res, 403, { error: "no_pass" });
    if (insideComplex(user.id)) return json(res, 409, { error: "inside" });
    const b = body as { item?: unknown; qty?: unknown };
    const r = store.erLockerTake(user.id, String(b?.item ?? ""), Number(b?.qty ?? 1), ER_INV_SLOTS);
    if (!r.ok) return json(res, 400, { error: r.error });
    json(res, 200, { ok: true, inv: store.erInventory(user.id), locker: store.erLocker(user.id) });
  });
}
