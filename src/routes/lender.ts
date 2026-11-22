// GOBLIN LENDERS — the kiosk's HTTP surface (rules in src/lender.ts,
// money path in store.ts under "GOBLIN LENDERS").
//
// Everything here is a thin shell over one transactional store op, the shop's
// shape exactly: the PRICE IS THE SERVER'S, a refusal costs nothing, and no
// amount a client sends is ever believed — the four windows are a fixed list
// and the payment is checked against a wallet the client doesn't own.
//
// The cell's routes are auth level "jail", which resolves ONLY jailed accounts
// (see jailUserForToken). A prisoner can look at the bars and nothing else; a
// living player can't reach the cell routes at all.
//
// ROUND TWO (Josh, Sep 2026): settle for a friend, the bail pot, the repo
// shelf, the prisoner's plea, and `lender.change` after anything that moves a
// public standing so every roster's debtor mark follows the loans table.

import type { Router } from "../http";
import { effectiveVipRank, VIP_PERK_RANK } from "../vip";
import type { Store } from "../db/store";
import type { Bus } from "../bus";
import { json, makeRateLimiter } from "../http";
import { TIERS, bailPrice, cleanPlea, countsAsBail, interestFor } from "../lender";
import { award } from "../achievements";
import { toPublicUser } from "../types";

export function registerLenderRoutes(router: Router): void {
  // Chips and pleas each fan a `lender.change` out to every socket — so a
  // jailed account (otherwise locked out of everything) or a 1-silver
  // dripper must not be able to make the whole server refetch the kiosk at
  // will (review finding, Sep 2026). Honest use never sees these.
  const rateLimit = makeRateLimiter();
  /** The kiosk screen: the vault, your worth, the four windows, your loan,
   *  the cells (with pleas + pots), the marked, and the shelf. */
  router.get("/api/lender", "user", ({ res, user, store }) => {
    const pub = (id: number) => {
      const u = store.getUserById(id);
      return u ? toPublicUser(u) : null;
    };
    const books = store.goblinVault();
    json(res, 200, {
      ...store.lenderState(user.id),
      books: { lent: books.lent, taken: books.taken },
      prisoners: store.prisoners().map((p) => ({
        ...p,
        user: pub(p.userId),
        contributors: p.contributors.map((c) => ({ ...c, user: pub(c.userId) })),
      })),
      marked: store.markedDebtors().map((m) => ({ ...m, user: pub(m.userId) })),
      shelf: store.goblinShelf().map((s) => ({ ...s, from: pub(s.fromUserId) })),
    });
  });

  /** YOUR FILE — this customer's own ledger page. Self-scoped: the goblins
   *  show you your record gladly; nobody else's. */
  router.get("/api/lender/history", "user", ({ res, user, store }) => {
    json(res, 200, { events: store.loanEvents(user.id) });
  });

  /** Take one of the four windows. */
  router.post("/api/lender/borrow", "user", ({ res, body, user, store }) => {
    const amount = Number((body as { amount?: unknown })?.amount);
    if (!Number.isFinite(amount)) return json(res, 400, { error: "bad_amount" });
    const r = store.takeLoan(user.id, Math.floor(amount));
    if (!r.ok) {
      // `vault_dry` is a 503 rather than a 4xx on purpose: the borrower did
      // nothing wrong, the bank is simply out of money today.
      const code = r.error === "vault_dry" ? 503 : r.error === "over_limit" ? 403 : 409;
      return json(res, code, { error: r.error });
    }
    // Ledger/achievement telemetry — counts and lifetime silver, forward-only.
    store.bumpStat(user.id, "loans_taken");
    store.bumpStat(user.id, "silver_borrowed", Math.floor(amount));
    if (Math.floor(amount) === TIERS[TIERS.length - 1]) award(user.id, "borrowed-million");
    json(res, 200, { coins: r.coins, loan: r.loan });
  });

  /** Pay them. Interest first, then principal. */
  router.post("/api/lender/pay", "user", ({ res, body, user, store, bus }) => {
    const amount = Number((body as { amount?: unknown })?.amount);
    if (!Number.isFinite(amount)) return json(res, 400, { error: "bad_amount" });
    // `service`: the kiosk's SERVICE key — tonight's interest, paid ahead.
    const service = (body as { service?: unknown })?.service === true;
    const r = store.payLoan(user.id, Math.floor(amount), { service });
    if (!r.ok) {
      return json(res, r.error === "insufficient" ? 402 : r.error === "no_loan" ? 404 : 400, {
        error: r.error,
      });
    }
    if (r.cleared) store.bumpStat(user.id, "loans_repaid"); // Ledger/achievement telemetry
    bus.emit("lender.change", {});
    if (r.cleared) store.affinityHook?.(user.id, "goblins", "clear");
    json(res, 200, { coins: r.coins, loan: r.loan, cleared: r.cleared });
  });

  /** SETTLE FOR A FRIEND: pay somebody ELSE's loan down, from your wallet.
   *  Refused for a jailed target (the cell has its own prices — see
   *  store.payLoanFor). The friend hears about it. */
  router.post("/api/lender/pay/:userId", "user", ({ res, params, body, user, store, bus }) => {
    const target = Number(params.userId);
    if (!Number.isInteger(target)) return json(res, 400, { error: "bad_user" });
    if (target === user.id) return json(res, 400, { error: "self_gift" }); // that's just paying
    const amount = Number((body as { amount?: unknown })?.amount);
    if (!Number.isFinite(amount)) return json(res, 400, { error: "bad_amount" });
    const r = store.payLoanFor(user.id, target, Math.floor(amount));
    if (!r.ok) {
      const code = r.error === "owes_goblins" ? 403 : r.error === "insufficient" ? 402 : r.error === "no_loan" ? 404 : r.error === "in_custody" ? 409 : 400;
      return json(res, code, { error: r.error });
    }
    if (r.cleared) store.bumpStat(target, "loans_repaid");
    store.bumpStat(user.id, "debts_settled_for_friends", r.took); // what was TAKEN, not what was offered
    bus.emit("lender.change", {});
    bus.emit("lender.notice", {
      userId: target,
      kind: "gift",
      title: "SOMEBODY PAID THE GOBLINS FOR YOU",
      body: r.cleared
        ? `${user.displayName} cleared your debt. Every coin.`
        : `${user.displayName} paid the goblins on your behalf. You now owe ${(r.loan?.payoff ?? 0).toLocaleString()}.`,
    });
    json(res, 200, { coins: r.coins, loan: r.loan, cleared: r.cleared });
  });

  /** Spring somebody. Anybody living may pay; it costs more than the debt,
   *  and it frees the body rather than the debt (see store.bailOut). */
  router.post("/api/lender/bail/:userId", "user", ({ res, params, user, store, bus }) => {
    const target = Number(params.userId);
    if (!Number.isInteger(target)) return json(res, 400, { error: "bad_user" });
    if (target === user.id) return json(res, 400, { error: "self_bail" }); // you have no wallet in there
    const r = store.bailOut(user.id, target);
    if (!r.ok) {
      return json(res, r.error === "owes_goblins" ? 403 : r.error === "insufficient" ? 402 : r.error === "not_jailed" ? 404 : 409, {
        error: r.error,
      });
    }
    afterRelease(store, bus, target, [{ userId: user.id, amount: r.price }], r.price);
    json(res, 200, { coins: r.coins, price: r.price });
  });

  /** THE BAIL POT: chip in toward somebody's bail. Escrowed until the pot
   *  clears the price, then the whole pot → the goblins and the door opens. */
  router.post("/api/lender/pot/:userId", "user", ({ res, params, body, user, store, bus }) => {
    const target = Number(params.userId);
    if (!Number.isInteger(target)) return json(res, 400, { error: "bad_user" });
    if (target === user.id) return json(res, 400, { error: "self_bail" });
    const amount = Number((body as { amount?: unknown })?.amount);
    if (!Number.isFinite(amount)) return json(res, 400, { error: "bad_amount" });
    if (!rateLimit(`chip:${user.id}`, 20, 60_000)) return json(res, 429, { error: "rate_limited" });
    const r = store.chipIn(user.id, target, Math.floor(amount));
    if (!r.ok) {
      const code = r.error === "owes_goblins" ? 403 : r.error === "insufficient" ? 402 : r.error === "not_jailed" ? 404 : r.error === "bad_amount" ? 400 : 409;
      return json(res, code, { error: r.error });
    }
    if (r.released) afterRelease(store, bus, target, r.contributors, r.price);
    else bus.emit("lender.change", {}); // the pot bar moved on every open kiosk
    json(res, 200, { coins: r.coins, pot: r.pot, price: r.price, released: r.released, took: r.took });
  });

  /** THE REPO SHELF: what the goblins took, for sale. Silver → the vault. */
  router.post("/api/lender/shelf/:id/buy", "user", ({ res, params, user, store, bus }) => {
    const id = Number(params.id);
    if (!Number.isInteger(id)) return json(res, 400, { error: "bad_item" });
    const r = store.buyFromShelf(user.id, id);
    if (!r.ok) {
      const code = r.error === "insufficient" ? 402 : r.error === "not_on_shelf" ? 404 : 409;
      return json(res, code, { error: r.error });
    }
    store.bumpStat(user.id, "shelf_buys");
    // BOUGHT BACK: your own repossessed emoji, at ten times what it was
    // credited against your debt. A secret badge for the humiliation.
    if (r.wasYours) award(user.id, "bought-back");
    bus.emit("lender.change", {});
    json(res, 200, { coins: r.coins, code: r.code, price: r.price, wasYours: r.wasYours });
  });

  // ---- THE CELL (auth "jail" — only the held can reach these) --------------

  /** What a prisoner sees: what they owe, what bail costs, how long is left,
   *  their plea, and how far the pot has got. */
  router.get("/api/cell", "jail", ({ res, user, store }) => {
    const loan = store.loanOf(user.id);
    const debt = loan ? loan.principal + interestFor(loan.principal, loan.rate) : 0;
    const pot = store.bailPot(user.id);
    json(res, 200, {
      user: toPublicUser(user),
      jailedAt: user.jailedAt,
      sealsAt: user.jailSealsAt,
      debt,
      bail: bailPrice(debt),
      plea: store.pleaOf(user.id),
      pot: pot.total,
      contributors: pot.contributors.map((c) => {
        const u = store.getUserById(c.userId);
        return { ...c, user: u ? toPublicUser(u) : null };
      }),
    });
  });

  /** THE HOUSE PAYS, from inside the cell (Tier 4, once a life): the debt
   *  goes to the vault on the Foundry's books and the door opens. */
  router.post("/api/cell/consolidate", "jail", ({ res, user, store, bus }) => {
    if (effectiveVipRank(user) < VIP_PERK_RANK) return json(res, 403, { error: "vip_locked", tier: VIP_PERK_RANK });
    const r = store.vipConsolidate(user.id);
    if (!r.ok) return json(res, r.error === "no_loan" ? 404 : 409, { error: r.error });
    afterRelease(store, bus, user.id, [], r.paid, r.fromWallet > 0
      ? `Your last ${r.fromWallet.toLocaleString()} went to the goblins and the house paid the other ${r.paid.toLocaleString()} — off the Foundry's books. You walk, and you owe nothing.`
      : `The house paid the goblins ${r.paid.toLocaleString()} on your behalf — off the Foundry's books. You walk, and you owe nothing.`);
    json(res, 200, { ok: true, paid: r.paid, fromWallet: r.fromWallet, released: r.released });
  });

  /** THE PLEA: one line on the cell card. Empty clears it. */
  router.post("/api/cell/plea", "jail", ({ res, body, user, store, bus }) => {
    if (!rateLimit(`plea:${user.id}`, 6, 60_000)) return json(res, 429, { error: "rate_limited" });
    const plea = cleanPlea((body as { text?: unknown })?.text);
    const before = store.pleaOf(user.id);
    store.setPlea(user.id, plea);
    if (plea !== before) bus.emit("lender.change", {}); // a no-op save tells nobody
    json(res, 200, { plea });
  });
}

/** What happens after ANY release — a single payer's bail or a pot that
 *  cleared: telemetry for everyone who paid a REAL share (countsAsBail —
 *  a 1-silver chip is not a bail), the badge for the one who walked, the
 *  roster told, the freed told (every contributor named, share or not). */
function afterRelease(
  store: Store,
  bus: Bus,
  freedId: number,
  payers: { userId: number; amount: number }[],
  price: number,
  body?: string,
): void {
  for (const p of payers) if (countsAsBail(p.amount, price)) store.bumpStat(p.userId, "bails_paid");
  award(freedId, "walked-out");
  const freed = store.getUserById(freedId);
  if (freed) bus.emit("user.update", { user: toPublicUser(freed) });
  bus.emit("lender.change", {});
  const names = payers
    .map((p) => store.getUserById(p.userId)?.displayName)
    .filter((n): n is string => !!n);
  bus.emit("lender.notice", {
    userId: freedId,
    kind: "bail",
    title: "YOU WALK",
    body: body ?? `${names.length ? names.join(", ") : "Somebody"} paid ${price.toLocaleString()} for your release. The debt walks with you.`,
  });
}
