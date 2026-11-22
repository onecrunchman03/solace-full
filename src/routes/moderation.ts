import { json, makeRateLimiter, type Router } from "../http";
import { mayEnterChannel } from "../pagescope";
import { canDiscoverPage } from "../permissions";
import { toPublicUser } from "../types";

/** message · dm · user, and since Sep 2026 `page` — a whole community
 *  (the thing you report when a satellite host isn't keeping their room
 *  clean; it lands next to the delist switch). */
const REPORT_KINDS = ["message", "dm", "user", "page"] as const;
const MAX_REASON = 500;
/** Global ids at or above this are remote (satellite-hosted) messages —
 *  mirrors REMOTE_ID_BASE in federation/remote.ts. */
const REMOTE_ID_BASE = 1_000_000_000;

/**
 * Moderation layer: per-user blocks and private content reports. Built as
 * iOS-store readiness (App Store guideline 1.2 requires user-facing block +
 * report tools for UGC apps), but it's good hygiene on every platform.
 *
 * Blocks are enforced server-side where contact is TARGETED (DMs, trade
 * offers — see those routes); public rooms stay public, the client just
 * collapses a blocked author's messages. Reports are private to admins —
 * deliberately NOT the public Feedback board — and since THE PAPERWORK
 * (Sep 2026) every report also fires `report.new`, which Sterling turns into
 * a DM to every admin (and the DM pipeline into a push when they're away):
 * "I didn't catch it in time" is only a defence when you were told.
 */
export function registerModerationRoutes(router: Router): void {
  const rateLimit = makeRateLimiter();

  router.get("/api/blocks", "user", ({ res, user, store }) => {
    json(res, 200, { blocked: store.listBlocks(user.id) });
  });

  router.post("/api/blocks/:userId", "user", ({ res, params, user, store }) => {
    const targetId = Number(params.userId);
    if (!Number.isInteger(targetId) || targetId === user.id) return json(res, 400, { error: "bad_user" });
    if (!store.getUserById(targetId)) return json(res, 404, { error: "user_not_found" });
    store.blockUser(user.id, targetId);
    json(res, 200, { blocked: store.listBlocks(user.id) });
  });

  router.del("/api/blocks/:userId", "user", ({ res, params, user, store }) => {
    store.unblockUser(user.id, Number(params.userId));
    json(res, 200, { blocked: store.listBlocks(user.id) });
  });

  // File a report. The reference must actually exist — a report that points
  // at nothing is noise for the admin.
  router.post("/api/report", "user", ({ res, body, user, store, bus }) => {
    // Spam armor, like /api/client-error — a loop can't flood the admin queue.
    if (!rateLimit(`report:${user.id}`, 10, 10 * 60 * 1000)) {
      return json(res, 429, { error: "rate_limited" });
    }
    const kind = String(body?.kind ?? "") as (typeof REPORT_KINDS)[number];
    const refId = Number(body?.refId);
    const reason = String(body?.reason ?? "").trim();
    if (!REPORT_KINDS.includes(kind) || !Number.isInteger(refId)) return json(res, 400, { error: "bad_report" });
    if (!reason || reason.length > MAX_REASON) return json(res, 400, { error: "bad_reason" });

    // Every refusal below is a 404, never a 403: a status code that differs
    // between "doesn't exist" and "exists but not yours" is an existence
    // oracle over other people's DMs, private pages and hidden communities
    // (Aug 2026 review). What the DM needs to say rides along as `summary`.
    let summary = "";
    if (kind === "message") {
      if (refId >= REMOTE_ID_BASE) {
        // A satellite-hosted message: the hub holds only the index (author,
        // channel, clock) — enough to know it exists and who may see it.
        const info = store.remoteMessageInfo(refId);
        if (!info || info.deletedAt) return json(res, 404, { error: "not_found" });
        const ch = store.getChannel(info.channelId);
        if (!ch || !mayEnterChannel(store, user, ch)) return json(res, 404, { error: "not_found" });
        const author = store.getUserById(info.userId);
        summary = `a message by ${author?.displayName ?? "someone"} in a hosted community (#${ch.name})`;
      } else {
        const m = store.getMessage(refId);
        if (!m) return json(res, 404, { error: "not_found" });
        const ch = store.getChannel(m.channelId);
        if (!ch || !mayEnterChannel(store, user, ch)) return json(res, 404, { error: "not_found" });
        const author = store.getUserById(m.userId);
        summary = `a message by ${author?.displayName ?? "someone"} in #${ch.name}`;
      }
    } else if (kind === "dm") {
      const m = store.getDmMessage(refId);
      if (!m) return json(res, 404, { error: "not_found" });
      const parts = store.conversationParticipants(m.conversationId);
      if (!parts || !parts.includes(user.id)) return json(res, 404, { error: "not_found" });
      const sender = store.getUserById(m.senderId);
      summary = `a direct message from ${sender?.displayName ?? "someone"}`;
    } else if (kind === "page") {
      // A card you can see is a community you can report (a request-to-join
      // page shows its card to non-members); a hidden page stays nonexistent.
      const page = store.getPage(refId);
      if (!page || !canDiscoverPage(user, page, store.pageRole(page.id, user.id))) return json(res, 404, { error: "not_found" });
      summary = `the community "${page.name}"${page.satelliteId != null ? " (hosted on a member's own server)" : ""}`;
    } else {
      const target = store.getUserById(refId);
      if (!target) return json(res, 404, { error: "not_found" });
      summary = `${target.displayName}'s account`;
    }
    const id = store.createReport(user.id, kind, refId, reason);
    // The report is filed; the alert is best-effort. A listener that throws
    // (a DM write hiccup) must not 500 the route and make the reporter file
    // it twice.
    try {
      bus.emit("report.new", { id, kind, refId, reporterId: user.id, reason, summary });
    } catch (err) {
      console.error(`[moderation] report #${id} filed but the alert failed:`, err);
    }
    json(res, 200, { ok: true, id });
  });

  // Admin: the report queue, hydrated with enough context to act on.
  router.get("/api/admin/reports", "admin", ({ res, store }) => {
    const items = store.listReports().map((r) => {
      const reporter = store.getUserById(r.reporterId);
      let excerpt: string | null = null;
      let targetUserId: number | null = null;
      let pageId: number | null = null;
      let pageName: string | null = null;
      if (r.kind === "message") {
        if (r.refId >= REMOTE_ID_BASE) {
          // The body lives on the host's disk — the queue says where to look.
          const info = store.remoteMessageInfo(r.refId);
          const ch = info ? store.getChannel(info.channelId) : undefined;
          const page = ch ? store.getPage(ch.pageId) : undefined;
          excerpt = info
            ? `(hosted community message in #${ch?.name ?? "?"} — open the page to read it)`
            : "(deleted)";
          targetUserId = info?.userId ?? null;
          pageId = page?.id ?? null;
          pageName = page?.name ?? null;
        } else {
          const m = store.getMessage(r.refId);
          excerpt = m ? m.body.slice(0, 200) : "(deleted)";
          targetUserId = m?.userId ?? null;
        }
      } else if (r.kind === "dm") {
        const m = store.getDmMessage(r.refId);
        excerpt = m ? m.body.slice(0, 200) : "(deleted)";
        targetUserId = m?.senderId ?? null;
      } else if (r.kind === "page") {
        const page = store.getPage(r.refId);
        pageId = page?.id ?? null;
        pageName = page?.name ?? null;
        excerpt = page
          ? `${page.name}${page.satelliteId != null ? " · hosted on a member's own server" : ""}`
          : "(page deleted)";
        targetUserId = page?.createdBy ?? null;
      } else {
        targetUserId = r.refId;
      }
      const target = targetUserId != null ? store.getUserById(targetUserId) : undefined;
      return {
        id: r.id,
        kind: r.kind,
        reason: r.reason,
        status: r.status,
        at: r.at,
        excerpt,
        reporter: reporter ? toPublicUser(reporter) : null,
        target: target ? toPublicUser(target) : null,
        pageId,
        pageName,
      };
    });
    json(res, 200, { reports: items });
  });

  router.post("/api/admin/reports/:id/status", "admin", ({ res, params, body, store }) => {
    const status = body?.status === "resolved" ? "resolved" : "open";
    if (!store.setReportStatus(Number(params.id), status)) return json(res, 404, { error: "not_found" });
    json(res, 200, { ok: true, status });
  });
}
