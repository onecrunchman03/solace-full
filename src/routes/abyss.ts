import { json, type Router } from "../http";
import { STONE_CODE, ABYSS_PHRASE } from "../abyss";

/** THE STONE OF THE ABYSS (src/abyss.ts): what the stone says when you
 *  click it, and the door that opens when you say it back. The stone
 *  itself comes out of Pandora's Box (routes/pandora.ts). */
export function registerAbyssRoutes(router: Router): void {
  // Do I hold the stone, has my portal opened, and — only with the stone
  // in hand — the phrase it puts in my head.
  router.get("/api/abyss", "user", ({ res, user, store }) => {
    const stone = store.hasStone(user.id);
    const openedAt = store.abyssOpenedAt(user.id);
    json(res, 200, {
      stone,
      code: STONE_CODE,
      phrase: stone ? ABYSS_PHRASE : null,
      opened: openedAt != null,
      openedAt,
    });
  });

  // Say it. Needs the stone; opens the portal the first time (the frame to
  // this member's sockets rides the bus), harmless every time after.
  router.post("/api/abyss/speak", "user", ({ res, user, store, bus }) => {
    const r = store.openAbyss(user.id);
    if (!r.ok) return json(res, 403, { error: r.error });
    if (r.opened) bus.emit("abyss.opened", { userId: user.id });
    json(res, 200, { ok: true, opened: true, openedAt: r.at, first: r.opened });
  });
}
