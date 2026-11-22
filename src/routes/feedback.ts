import { json, clientIp, makeRateLimiter, type Router } from "../http";

const MAX_BODY = 1000;

/**
 * Feedback routes — in-app bug reports and improvement suggestions.
 * The board is PUBLIC: everyone sees every filing (and its open/done status),
 * live via `feedback.*` broadcasts. Only admins flip items open ↔ done.
 */
export function registerFeedbackRoutes(router: Router): void {
  const rateLimit = makeRateLimiter();

  // File a report/suggestion. The new item also arrives via the broadcast;
  // returning it here just makes the author's own UI update race-free.
  router.post("/api/feedback", "user", ({ req, res, body, user, store, bus }) => {
    if (!rateLimit(`feedback:${user.id}:${clientIp(req)}`, 10, 60 * 60 * 1000)) {
      return json(res, 429, { error: "rate_limited" });
    }
    const kind = String(body?.kind ?? "");
    const text = String(body?.body ?? "").trim();
    if (kind !== "bug" && kind !== "idea") return json(res, 400, { error: "bad_kind" });
    if (!text) return json(res, 400, { error: "empty" });
    if (text.length > MAX_BODY) return json(res, 400, { error: "too_long" });
    const item = store.createFeedback(user.id, kind, text);
    bus.emit("feedback.new", { item });
    json(res, 200, { ok: true, item });
  });

  // The whole board, for everyone (open first, newest first within each group).
  router.get("/api/feedback", "user", ({ res, store }) => {
    json(res, 200, { items: store.listFeedback() });
  });

  // Admin triage: mark done / reopen.
  router.post("/api/feedback/:id/status", "admin", ({ res, params, body, store, bus }) => {
    const id = Number(params.id);
    const done = body?.done === true;
    const item = store.setFeedbackStatus(id, done);
    if (!item) return json(res, 404, { error: "not_found" });
    bus.emit("feedback.status", { item });
    json(res, 200, { ok: true, item });
  });
}
