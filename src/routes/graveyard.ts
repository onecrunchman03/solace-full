import { json, makeRateLimiter, type Router } from "../http";
import { unownedEmoji } from "../text";
import {
  RAISE_PRICE, selfRevivePrice, canSelfRevive, SELF_REVIVE_MIN_COINS,
  CANDLE_PRICE, FLOWERS_PRICE, MAX_EULOGY, type TributeKind,
} from "../mortality";

const MAX_EPITAPH = 90; // has to fit on a tombstone

/**
 * The Graveyard: the fallen, their epitaphs, and the respects the living
 * leave on their graves. Plus the legacy endpoint — your epitaph (carved
 * while you still can) and your will (who inherits emoji + silver on death).
 */
export function registerGraveyardRoutes(router: Router): void {
  const rateLimit = makeRateLimiter();
  // Every grave, newest death first, plus the permanent monuments of lives
  // that sealed. Public to all members.
  //
  // The read SEALS anything overdue first (the lazy half of the sweep, same
  // pattern as the auction house): whoever opens the Graveyard shouldn't be
  // shown a countdown that ran out an hour ago while a timer was asleep.
  router.get("/api/graveyard", "user", ({ res, store, bus }) => {
    for (const id of store.dueGraves()) {
      const who = store.getUserById(id);
      // The lazy path announces exactly as the sweep does — it used to seal
      // silently, so a grave that closed under a Graveyard read never rang
      // Sterling's bell or refreshed anyone else's scene.
      if (store.sealGrave(id).sealed && who) {
        const now = store.getUserById(id);
        bus.emit("grave.sealed", {
          userId: id,
          generation: now?.generation ?? (who.generation ?? 1) + 1,
          name: who.displayName,
        });
      }
    }
    json(res, 200, {
      graves: store.graveyard(),
      lives: store.lives(),
      raisePrice: RAISE_PRICE,
      candlePrice: CANDLE_PRICE,
      flowersPrice: FLOWERS_PRICE,
      maxEulogy: MAX_EULOGY,
      necrology: store.necrology(),
      now: Date.now(), // tribute decay states derive from the SERVER's clock
    });
  });

  // THE MEMORIAL: one account's whole story with death — the family plot's
  // sealed lives, the revival history, and (while they lie dead) the open
  // grave's eulogies. Public: everything here already broadcast or stands
  // carved on a monument.
  router.get("/api/graveyard/:userId/memorial", "user", ({ res, params, store }) => {
    const userId = Number(params.userId);
    if (!Number.isInteger(userId)) return json(res, 400, { error: "bad_user" });
    const m = store.memorial(userId);
    if (!m) return json(res, 404, { error: "user_not_found" });
    const dead = store.getUserById(userId);
    json(res, 200, {
      ...m,
      eulogies: dead?.diedAt ? store.graveEulogies(userId) : [],
    });
  });

  // LEAVE A TRIBUTE — a candle (25) or flowers (100), silver BURNED. One
  // standing tribute per (grave, mourner, kind); every refusal is free.
  router.post("/api/graveyard/:userId/tribute", "user", ({ res, params, body, user, store, bus }) => {
    const deadId = Number(params.userId);
    if (!Number.isInteger(deadId)) return json(res, 400, { error: "bad_user" });
    const kind = body?.kind === "candle" || body?.kind === "flowers" ? (body.kind as TributeKind) : null;
    if (!kind) return json(res, 400, { error: "bad_kind" });
    const price = kind === "candle" ? CANDLE_PRICE : FLOWERS_PRICE;
    const r = store.leaveTribute(deadId, user.id, kind, price);
    if ("error" in r) {
      const code =
        r.error === "insufficient" ? 402
        : r.error === "already_standing" ? 409
        : 404;
      return json(res, code, { error: r.error });
    }
    bus.emit("grave.tribute", { deadUserId: deadId, byUserId: user.id, kind, at: Date.now() });
    json(res, 200, { ok: true, coins: r.coins });
  });

  // WRITE A EULOGY — one per mourner per grave, free, rewrite replaces.
  router.post("/api/graveyard/:userId/eulogy", "user", ({ res, params, body, user, store }) => {
    const deadId = Number(params.userId);
    const dead = Number.isInteger(deadId) ? store.getUserById(deadId) : undefined;
    if (!dead || dead.diedAt === null) return json(res, 404, { error: "not_dead" });
    if (deadId === user.id) return json(res, 400, { error: "not_your_own" }); // the dead can't edit their wake
    const text = String(body?.text ?? "").replace(/\s+/g, " ").trim();
    if (!text) return json(res, 400, { error: "empty" });
    if (text.length > MAX_EULOGY) return json(res, 400, { error: "too_long" });
    store.setEulogy(deadId, user.id, text);
    json(res, 200, { ok: true });
  });

  // Take your own eulogy back.
  router.del("/api/graveyard/:userId/eulogy", "user", ({ res, params, user, store }) => {
    const deadId = Number(params.userId);
    if (!Number.isInteger(deadId)) return json(res, 400, { error: "bad_user" });
    const gone = store.deleteEulogy(deadId, user.id);
    json(res, gone ? 200 : 404, gone ? { ok: true } : { error: "no_eulogy" });
  });

  // Staff sweep somebody else's eulogy off a grave (moderation).
  router.del("/api/graveyard/:userId/eulogy/:authorId", "mod", ({ res, params, store }) => {
    const deadId = Number(params.userId);
    const authorId = Number(params.authorId);
    if (!Number.isInteger(deadId) || !Number.isInteger(authorId)) return json(res, 400, { error: "bad_user" });
    const gone = store.deleteEulogy(deadId, authorId);
    json(res, gone ? 200 : 404, gone ? { ok: true } : { error: "no_eulogy" });
  });

  // RAISE THE DEAD. Ten thousand silver or one sacrificed mythic, both BURNED
  // — the person coming back receives nothing, because a revival that paid
  // anybody would be a coin faucet in a costume. Only while the grave is
  // fresh, and never your own (that door is /api/wake/revive, and it costs
  // very much more).
  router.post("/api/graveyard/:userId/raise", "user", ({ res, params, body, user, store, bus }) => {
    const deadId = Number(params.userId);
    if (!Number.isInteger(deadId)) return json(res, 400, { error: "bad_user" });
    const kind = body?.kind === "mythic" ? "mythic" : "silver";
    const code = body?.code === undefined ? undefined : String(body.code);

    const r = store.raiseFromGrave(deadId, user.id, kind, code);
    if ("error" in r) {
      const code4xx =
        r.error === "insufficient" ? 402
        : r.error === "grave_sealed" || r.error === "not_dead" ? 409
        : 400;
      return json(res, code4xx, { error: r.error });
    }
    const raised = store.getUserById(deadId);
    store.bumpStat(user.id, "raises"); // Ledger/achievement telemetry — the samaritan's deed, not the corpse's
    // Public and loud on purpose: somebody just spent real money pulling a
    // friend out of the ground, and the room should see it.
    bus.emit("grave.raised", {
      userId: deadId,
      byUserId: user.id,
      kind,
      name: raised?.displayName ?? "someone",
      by: user.displayName,
    });
    json(res, 200, { ok: true, coins: store.getCoins(user.id) });
  });

  // ---- THE WAKE: the only two doors a dead account can open ----------------
  // Both are auth level "wake", which resolves ONLY tombstoned accounts whose
  // grave is still fresh — a living session can't reach them, and a wake
  // session can't reach anything else.

  // What the dead person is looking at: how long is left, and what standing
  // up would cost them.
  router.get("/api/wake", "wake", ({ res, user, store }) => {
    const purse = store.getCoins(user.id);
    const owned = store.inventoryCount(user.id);
    json(res, 200, {
      user: { id: user.id, username: user.username, displayName: user.displayName, generation: user.generation },
      diedAt: user.diedAt,
      sealsAt: user.graveSealsAt,
      collection: owned,
      quote: selfRevivePrice(purse, owned),
      // Whether that quote is a PRICE or just a shrug. A broke, empty account
      // quotes zero for everything, and zero used to buy a resurrection — see
      // canSelfRevive. The screen needs to know so it can say why the door is
      // shut rather than offering a button the server will refuse.
      canPay: canSelfRevive(purse, owned),
      minCoins: SELF_REVIVE_MIN_COINS,
    });
  });

  // BUY YOURSELF BACK: the whole purse and a third of the collection, burned.
  // Deliberately worse than being raised by a friend — being saved should
  // always beat saving yourself, or the window becomes a private toll booth.
  router.post("/api/wake/revive", "wake", ({ res, user, store, bus }) => {
    const r = store.selfRevive(user.id);
    if ("error" in r) return json(res, 409, { error: r.error });
    bus.emit("grave.raised", {
      userId: user.id,
      byUserId: null,
      kind: "self",
      name: user.displayName,
      by: user.displayName,
    });
    json(res, 200, { ok: true, burnedCoins: r.coins, burned: r.burned });
  });

  // Toggle an owned-emoji respect on a fallen member's grave.
  router.post("/api/graveyard/:userId/respect", "user", ({ res, params, body, user, store, bus }) => {
    const deadId = Number(params.userId);
    const dead = Number.isInteger(deadId) ? store.getUserById(deadId) : undefined;
    if (!dead || dead.diedAt === null) {
      return json(res, 404, { error: "not_dead" }); // only real graves take flowers
    }
    // Each toggle is broadcast to every socket, so it's paced (Oct 2026
    // review): 20 a minute is far past anyone paying their respects.
    if (!rateLimit(`respect:${user.id}`, 20, 60_000)) return json(res, 429, { error: "rate_limited" });
    const code = String(body?.code ?? "").trim();
    if (!code || !store.getEmoji(code)) return json(res, 400, { error: "unknown_emoji" });
    // Respects follow the house rule: you react with what you OWN.
    if (unownedEmoji(store, user.id, `:${code}:`).length > 0) {
      return json(res, 403, { error: "unowned_emoji" });
    }
    const added = store.toggleGraveRespect(deadId, user.id, code);
    bus.emit("grave.respect", { deadUserId: deadId, userId: user.id, code, added });
    json(res, 200, { added });
  });

  // Set your legacy: epitaph and/or will. Both changeable any time — while
  // you're alive. The dead don't get to edit their tombstones.
  router.patch("/api/me/legacy", "user", ({ res, body, user, store }) => {
    if (user.diedAt) return json(res, 403, { error: "already_dead" });

    const fields: { epitaph?: string | null; willBeneficiaryId?: number | null } = {};
    if (body?.epitaph !== undefined) {
      const text = String(body.epitaph).replace(/\s+/g, " ").trim();
      if (text.length > MAX_EPITAPH) return json(res, 400, { error: "epitaph_too_long" });
      fields.epitaph = text.length ? text : null;
    }
    if (body?.willBeneficiaryId !== undefined) {
      if (body.willBeneficiaryId === null) {
        fields.willBeneficiaryId = null; // revoke the will
      } else {
        const heirId = Number(body.willBeneficiaryId);
        const heir = Number.isInteger(heirId) ? store.getUserById(heirId) : undefined;
        // The bot and banned accounts are value black holes — an estate
        // willed there is silver + emoji nobody can ever use.
        if (!heir || heir.disabled || heir.isBot || heir.locked) return json(res, 400, { error: "bad_beneficiary" });
        if (heir.id === user.id) return json(res, 400, { error: "cant_inherit_yourself" });
        fields.willBeneficiaryId = heir.id;
      }
    }
    store.setLegacy(user.id, fields);
    const updated = store.getUserById(user.id)!;
    json(res, 200, { epitaph: updated.epitaph, willBeneficiaryId: updated.willBeneficiaryId });
  });
}
