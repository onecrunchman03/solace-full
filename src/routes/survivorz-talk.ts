// SOLACE SURVIVORZ — the talk layer's switch (the admin's; audited). The survivors talk only when
// the house brain is up AND this is on (src/survivorz/talk/minds.ts). ON BY DEFAULT since Oct 28
// 2026 (Josh: "run it live with AI turned on" — an off-by-default switch left the live show
// silent): app_kv holds "0" only when the admin has turned it off.
import { json, type Router } from "../http";
import type { MindsStatus } from "../survivorz/talk/minds";

export const KV_TALK = "survivorz_talk";
/** the one reading of the switch: on unless the admin turned it off */
export const talkAllowed = (kvGet: (k: string) => string | null | undefined): boolean => kvGet(KV_TALK) !== "0";

/** the engine as it stands, run or no run (the minds only exist while a world does: with nothing running the panel
 *  read "no minds" as "the 26B is down") */
export interface TalkEngine { up(): boolean; configured?(): boolean }

export function registerSurvivorzTalkRoutes(router: Router, minds: () => { status(): MindsStatus } | null, model?: TalkEngine): void {
  const engine = () => (model ? { up: model.up(), configured: model.configured?.() ?? true } : null);
  router.get("/api/admin/survivorz/talk", "admin", ({ res, store }) => {
    json(res, 200, { on: talkAllowed((k) => store.kvGet(k)), minds: minds()?.status() ?? null, engine: engine() });
  });
  router.post("/api/admin/survivorz/talk", "admin", ({ res, body, store, user }) => {
    const on = (body as { on?: unknown })?.on;
    if (typeof on !== "boolean") return json(res, 400, { error: "bad_on" });
    if (on) store.kvDel(KV_TALK); else store.kvSet(KV_TALK, "0");
    store.audit(user.id, on ? "survivorz.talk_on" : "survivorz.talk_off");
    json(res, 200, { on, minds: minds()?.status() ?? null, engine: engine() });
  });
}
