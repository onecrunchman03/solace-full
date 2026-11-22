import { json, makeRateLimiter, type Router } from "../http";
import { toPublicUser } from "../types";

/** THE WALLET (Oct 2026, migration 110): players send each other silver.
 *
 *  A transfer moves silver from one wallet to another in one transaction
 *  (`store.sendSilver`), so nothing is ever minted and the Wheel stays the
 *  only faucet. Every refusal below runs before the wallet is touched.
 *
 *  NOBODY WHO OWES THE GOBLINS MAY SEND SILVER — not just the frozen. A loan
 *  puts real silver in a wallet; if it could be handed straight to a friend,
 *  the borrow-then-default route the goblins' credit ladder exists to stop
 *  would be one button. Paying the debt off opens the wallet again. */
export const MAX_SEND = 1_000_000;
export const MAX_SEND_NOTE = 140;
export const SEND_BURST = 10;
export const SEND_WINDOW_MS = 60_000;

export function registerWalletRoutes(router: Router): void {
  const rateLimit = makeRateLimiter();

  // My balance and my last transfers, both directions.
  router.get("/api/wallet", "user", ({ res, user, store }) => {
    const rows = store.walletTransfers(user.id, 50);
    const people = new Map<number, ReturnType<typeof toPublicUser> | null>();
    const who = (id: number) => {
      if (!people.has(id)) {
        const u = store.getUserById(id);
        people.set(id, u ? toPublicUser(u) : null);
      }
      return people.get(id) ?? null;
    };
    json(res, 200, {
      coins: store.getCoins(user.id),
      maxSend: MAX_SEND,
      owesGoblins: !!store.loanOf(user.id),
      transfers: rows.map((r) => {
        const sent = r.fromId === user.id;
        return {
          id: r.id,
          dir: sent ? "sent" : "received",
          other: who(sent ? r.toId : r.fromId),
          amount: r.amount,
          note: r.note,
          at: r.at,
        };
      }),
    });
  });

  router.post("/api/wallet/send", "user", ({ res, body, user, store, bus }) => {
    const to = Number(body?.toUserId);
    const amount = Number(body?.amount);
    if (!Number.isInteger(to)) return json(res, 400, { error: "bad_user" });
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_SEND) {
      return json(res, 400, { error: "bad_amount", max: MAX_SEND });
    }
    let note: string | null = null;
    if (body?.note != null) {
      if (typeof body.note !== "string") return json(res, 400, { error: "bad_note" });
      const t = body.note.replace(/\s+/g, " ").trim();
      if (t.length > MAX_SEND_NOTE) return json(res, 400, { error: "note_too_long", max: MAX_SEND_NOTE });
      note = t || null;
    }
    if (to === user.id) return json(res, 400, { error: "self_send" });
    const target = store.getUserById(to);
    if (!target || target.deletedAt) return json(res, 404, { error: "user_not_found" });
    if (target.isBot) return json(res, 400, { error: "user_unavailable" });
    if (target.disabled || target.locked) return json(res, 400, { error: "user_unavailable" });
    if (store.isBlockedEither(user.id, to)) return json(res, 403, { error: "blocked" });
    if (store.loanOf(user.id)) return json(res, 403, { error: "owes_goblins" });
    if (!rateLimit(`wallet:${user.id}`, SEND_BURST, SEND_WINDOW_MS)) {
      return json(res, 429, { error: "rate_limited" });
    }
    const done = store.sendSilver(user.id, to, amount, note);
    if (!done) return json(res, 402, { error: "insufficient" });
    store.bumpStat(user.id, "silver_sent", amount);
    bus.emit("wallet.transfer", {
      id: done.id,
      fromId: user.id,
      toId: to,
      amount,
      note,
      fromName: user.displayName || user.username,
    });
    json(res, 200, { ok: true, coins: done.coins, id: done.id });
  });
}
