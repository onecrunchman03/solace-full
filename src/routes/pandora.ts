import { json, type Router } from "../http";
import {
  PANDORA_KEYS, KEY_NAMES, KEY_RULES, RUSTED_LEVELS, RUSTED_RELICS, LEVEL_RELICS, PANDORA_CHOICES, PANDORAN_ITEM,
  choiceById, choiceAvailable, canOpen, keyEarned, type PandoraKey,
} from "../pandora";
import { earnableAchievementIds } from "../achievements";
import { toPublicUser } from "../types";
import { VIP_MAX } from "../vip";

/** PANDORA'S BOX (Josh, Sep 2026 — PANDORA.md): the endgame page. The
 *  keys are granted by the achievement engine (checkPandora); these routes
 *  are the box itself — set a key, open the lid, read the ledger. */
export function registerPandoraRoutes(router: Router): void {
  // The box. Everyone may look: the ledger under it is the point of the
  // page for everyone who will never hold a key.
  router.get("/api/pandora", "user", ({ res, user, store }) => {
    const held = store.pandoraKeys(user.id);
    const facts = store.pandoraFacts(user.id, earnableAchievementIds(store.foundryLending()));
    const mineSlugs = new Set(store.relicSlugsOf(user.id));
    const relicsPerLevel = LEVEL_RELICS.map((lvl) => ({ owned: lvl.filter((r) => mineSlugs.has(r.slug)).length, total: lvl.length }));
    const taken = store.pandoraTakenChoices();
    const takenBy = new Map<string, { name: string; at: number }>();
    for (const o of store.pandoraOpenings()) if (o.choice) takenBy.set(o.choice, { name: o.user.displayName, at: o.at });
    const mine = store.pandoraOpeningOf(user.id);
    json(res, 200, {
      keys: PANDORA_KEYS.map((key) => {
        const row = held.find((h) => h.key === key);
        return {
          key,
          name: KEY_NAMES[key],
          rule: KEY_RULES[key],
          held: !!row,
          earnedAt: row?.earnedAt ?? null,
          inserted: row?.insertedAt != null,
          /** Live, from the facts — the admin reads no key even at Tier 4. */
          live: !user.isAdmin && keyEarned(key, facts),
        };
      }),
      progress: {
        vipTier: user.isAdmin ? VIP_MAX : facts.vipTier,
        vipMax: VIP_MAX,
        badges: { earned: facts.badgesEarned, total: facts.badgesTotal },
        relics: { owned: facts.relics, total: RUSTED_RELICS, placed: LEVEL_RELICS.reduce((n, l) => n + l.length, 0) },
        levels: { built: LEVEL_RELICS.length, total: RUSTED_LEVELS, perLevel: relicsPerLevel },
      },
      canOpen: canOpen(store.pandoraInserted(user.id)) && !mine && !user.isAdmin,
      opened: mine,
      choices: PANDORA_CHOICES.map((c) => ({
        id: c.id,
        name: c.name,
        desc: c.desc,
        once: c.once,
        // A once-ever choice is TAKEN; a repeatable one (the Stone) never is —
        // it carries how many have reached for it instead.
        taken: c.once && taken.includes(c.id),
        takenBy: c.once ? takenBy.get(c.id) ?? null : null,
        takers: c.once ? 0 : taken.filter((t) => t === c.id).length,
      })),
      ledger: store.pandoraOpenings(),
      suit: PANDORAN_ITEM,
      suitOwned: store.ownsItem(user.id, PANDORAN_ITEM),
    });
  });

  // Set a held key into its keyhole. Idempotent; a key you don't hold is
  // refused. The admin holds no key.
  router.post("/api/pandora/insert", "user", ({ res, user, body, store }) => {
    const key = String(body?.key ?? "") as PandoraKey;
    if (!PANDORA_KEYS.includes(key)) return json(res, 400, { error: "bad_key" });
    const r = store.insertPandoraKey(user.id, key);
    if (r === "not_held") return json(res, 403, { error: "not_held" });
    json(res, 200, { ok: true, inserted: store.pandoraInserted(user.id) });
  });

  // THE OPENING. Three keys set, once per opener, the choice still on the
  // table (or null — hope left in the box). The suit is issued inside the
  // same transaction; the announcement rides the bus.
  router.post("/api/pandora/open", "user", ({ res, user, body, store, bus }) => {
    if (user.isAdmin) return json(res, 403, { error: "house_cannot_open" });
    const raw = body?.choice;
    const choice = raw == null || raw === "" ? null : String(raw);
    if (choice !== null && !choiceById(choice)) return json(res, 400, { error: "bad_choice" });
    const first = store.pandoraOpenings().length === 0;
    const r = store.openPandora(user.id, choice, choiceAvailable);
    if (!r.ok) return json(res, r.error === "keys_missing" ? 403 : 409, { error: r.error });
    // THE WASH (Destroy the Goblins): the cells opened and the debts forgiven
    // inside the opening's transaction; the roster, the kiosks and each person
    // who owed are told here.
    if (r.washed) {
      for (const id of r.washed.freed) {
        const freed = store.getUserById(id);
        if (freed) bus.emit("user.update", { user: toPublicUser(freed) });
      }
      bus.emit("lender.change", {});
      for (const id of new Set([...r.washed.debtors, ...r.washed.freed])) {
        bus.emit("lender.notice", {
          userId: id,
          kind: "bail",
          title: "THE GOBLINS ARE GONE",
          body: `${user.displayName || user.username} opened Pandora's Box and destroyed Goblin Lenders. Your debt is washed — you owe nothing.`,
        });
      }
    }
    bus.emit("pandora.opened", {
      userId: user.id,
      name: user.displayName || user.username,
      choice,
      choiceName: choice ? choiceById(choice)?.name ?? null : null,
      first,
    });
    json(res, 200, { ok: true, id: r.id, at: r.at, choice, suit: PANDORAN_ITEM });
  });
}
