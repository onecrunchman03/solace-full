// The Admin Panel's operator eyes: live logs, the error tracker (server +
// client crashes), health checks, the economy audit, connections, and the
// audit trail — everything Josh needs to troubleshoot without SSH.

import { json, makeRateLimiter, clientIp, type Router } from "../http";
import { readLog, logEpoch } from "../logbuf";
import { runHealthChecks } from "../health";
import { getConnectionReport } from "../realtime";
import { toPublicUser } from "../types";

export function registerObservabilityRoutes(router: Router): void {
  const rateLimit = makeRateLimiter();

  // ---- Live logs (ring buffer; ?after=<id> for incremental polling) ----
  // `epoch` lets the client notice a restart (ids reset to 1) and re-sync
  // instead of polling a stale cursor into the void.
  router.get("/api/admin/logs", "admin", ({ res, url }) => {
    const after = Number(url.searchParams.get("after") ?? 0) || 0;
    json(res, 200, { epoch: logEpoch(), lines: readLog(after) });
  });

  // ---- Errors ----
  router.get("/api/admin/errors", "admin", ({ res, store }) => {
    json(res, 200, { errors: store.listErrors(100) });
  });
  router.post("/api/admin/errors/clear", "admin", ({ res, store, user }) => {
    const cleared = store.clearErrors();
    store.audit(user.id, "errors.clear", `${cleared} rows`);
    json(res, 200, { ok: true, cleared });
  });

  // Friends' browsers report their own crashes (rate-limited hard — a crash
  // loop must not become a write flood).
  router.post("/api/client-error", "user", ({ req, res, body, user, store }) => {
    // Per address AND per account (Oct 2026 review): IP alone let one member
    // behind several addresses fill the table.
    if (!rateLimit(`cerr:${clientIp(req)}`, 10, 10 * 60 * 1000) || !rateLimit(`cerru:${user.id}`, 10, 10 * 60 * 1000)) {
      return json(res, 429, { error: "rate_limited" });
    }
    const message = String(body?.message ?? "").slice(0, 500);
    if (!message) return json(res, 400, { error: "empty" });
    const where = String(body?.url ?? "").slice(0, 200);
    store.recordError("client", message, String(body?.stack ?? "").slice(0, 4000) || null, where || null, user.id);
    json(res, 200, { ok: true });
  });

  // ---- Health ----
  router.get("/api/admin/health", "admin", ({ res, store }) => {
    json(res, 200, { checks: runHealthChecks(store) });
  });

  // ---- Economy ----
  router.get("/api/admin/economy", "admin", ({ res, store }) => {
    json(res, 200, { now: store.economyTotals(), snapshots: store.listEconomySnapshots(30) });
  });

  // ---- Connections (live sockets + voice + status) ----
  router.get("/api/admin/connections", "admin", ({ res, store }) => {
    const report = getConnectionReport();
    const rows = report.map((r) => {
      const u = store.getUserById(r.userId);
      return {
        user: u ? toPublicUser(u) : null,
        sockets: r.sockets,
        ips: r.ips,
        agents: r.agents,
        voiceChannelId: r.voiceChannelId,
        status: r.status,
      };
    });
    json(res, 200, { connections: rows });
  });

  // ---- Audit trail ----
  router.get("/api/admin/audit", "admin", ({ res, store }) => {
    const rows = store.listAudit(200).map((a) => {
      const u = a.actorId === null ? null : store.getUserById(a.actorId);
      return { ...a, actor: u ? { id: u.id, displayName: u.displayName } : null };
    });
    json(res, 200, { audit: rows });
  });
}
