// The Security console's routes, plus the one member-facing piece of it.
//
// Everything under /api/admin/security is admin-only (NOT "mod") — these
// responses carry raw IP addresses for every account on the server, which is
// more than a moderator needs to do moderation. The member-facing pair,
// /api/me/sessions, is deliberately scoped to the caller: your friends should
// be able to spot and kill a session they don't recognise themselves, rather
// than needing Josh to notice it for them.
//
// Session TOKENS never leave the server. A session is addressed on the wire by
// a "handle" — the first 16 hex of its SHA-256 — which is enough to name one
// for revocation and useless as a credential.

import { createHash } from "node:crypto";
import { bearer, json, posIntParam, type Router } from "../http";
import { toPublicUser } from "../types";
import type { Store } from "../db/store";
import type { Session } from "../types";
import { securityFindings, securityPosture, hostPosture, hostFindings, WINDOW_MS } from "../security";

/** A non-credential name for a session token. */
export function sessionHandle(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

/** Best-effort device label from a user-agent, for humans reading a table. */
export function deviceLabel(ua: string | null | undefined): string {
  if (!ua) return "unknown";
  if (ua.startsWith("admin:")) return `set by ${ua.slice(6)}`;
  if (/SolaceShell\/([\d.]+)/.test(ua)) return `Desktop app ${/SolaceShell\/([\d.]+)/.exec(ua)![1]}`;
  const os = /Windows/.test(ua) ? "Windows"
    : /iPhone|iPad/.test(ua) ? "iOS"
    : /Android/.test(ua) ? "Android"
    : /Mac OS X/.test(ua) ? "macOS"
    : /Linux/.test(ua) ? "Linux"
    : "";
  const browser = /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : "browser";
  return [browser, os].filter(Boolean).join(" on ") || "unknown";
}

const shape = (s: Session, currentToken?: string) => ({
  handle: sessionHandle(s.token),
  userId: s.userId,
  createdAt: s.createdAt,
  lastSeenAt: s.lastSeenAt,
  ip: s.ip ?? null,
  network: s.network ?? null,
  device: deviceLabel(s.ua),
  current: currentToken ? s.token === currentToken : false,
});

export function registerSecurityRoutes(router: Router): void {
  // ---- The console -------------------------------------------------------

  router.get("/api/admin/security", "admin", ({ res, url, store }) => {
    const hours = posIntParam(url.searchParams.get("hours")) ?? 24;
    const windowMs = Math.min(30 * 24, hours) * 3_600_000;
    const since = Date.now() - windowMs;
    json(res, 200, {
      windowMs,
      posture: securityPosture(store),
      // The machine layer, from the root collector's snapshot. Kept as its
      // own array rather than merged: "the app is configured safely" and
      // "the box is configured safely" are different questions with
      // different owners, and a blank host section must not look like a
      // clean host section.
      host: hostPosture(),
      findings: [...securityFindings(store, windowMs), ...hostFindings()],
      counts: store.loginOutcomeCounts(since),
      failedByAccount: store.failedByAccount(since, 10),
      failedByIp: store.failedByIp(since, 10),
      // Staff activity is listed unconditionally — including the successes.
      // The question isn't only "did anything fail", it's "is every admin
      // sign-in one Josh can account for".
      staff: store.staffAccounts().map((s) => ({
        ...s,
        lastLoginAt: store.lastLoginAt(s.id),
        recent: store.listLoginEvents({ userId: s.id, limit: 5 }),
      })),
    });
  });

  router.get("/api/admin/security/events", "admin", ({ res, url, store }) => {
    const events = store.listLoginEvents({
      limit: posIntParam(url.searchParams.get("limit")) ?? 150,
      userId: posIntParam(url.searchParams.get("userId")),
      outcome: url.searchParams.get("outcome") || undefined,
    });
    json(res, 200, { events });
  });

  router.get("/api/admin/security/sessions", "admin", ({ res, store }) => {
    const users = new Map(store.listAllUsers().map((u) => [u.id, toPublicUser(u)]));
    json(res, 200, {
      sessions: store.listSessions().map((s) => ({ ...shape(s), user: users.get(s.userId) ?? null })),
    });
  });

  // Revoke one session by handle, or every session an account holds. The
  // socket kick matters: deleting the row alone doesn't hang up a WebSocket
  // that authenticated before the revocation, so a live tab would keep
  // receiving messages on a credential that no longer exists.
  router.post("/api/admin/security/sessions/revoke", "admin", ({ res, body, user, store, bus }) => {
    const targetId = Number(body?.userId);
    if (Number.isInteger(targetId) && targetId > 0) {
      const target = store.getUserById(targetId);
      if (!target) return json(res, 404, { error: "user_not_found" });
      const n = store.sessionsForUser(targetId).length;
      store.deleteOtherSessions(targetId, ""); // keep nothing
      store.audit(user.id, "session.revoke_all", `${target.username} (${n})`);
      bus.emit("user.kick", { userId: targetId });
      return json(res, 200, { ok: true, revoked: n });
    }
    const handle = String(body?.handle ?? "");
    const hit = store.listSessions().find((s) => sessionHandle(s.token) === handle);
    if (!hit) return json(res, 404, { error: "session_not_found" });
    store.deleteSession(hit.token);
    const who = store.getUserById(hit.userId);
    store.audit(user.id, "session.revoke", `${who?.username ?? hit.userId} (${handle})`);
    bus.emit("user.kick", { userId: hit.userId });
    json(res, 200, { ok: true, revoked: 1 });
  });

  // ---- Your own sessions -------------------------------------------------

  router.get("/api/me/sessions", "user", ({ req, res, url, user, store }) => {
    const token = bearer(req, url);
    json(res, 200, { sessions: store.sessionsForUser(user.id).map((s) => shape(s, token)) });
  });

  // Sign out one of your own devices, or all the others at once. Scoped to
  // the caller's own rows by construction — the handle is looked up inside
  // sessionsForUser(user.id), so a guessed handle from another account simply
  // isn't found.
  router.post("/api/me/sessions/revoke", "user", ({ req, res, url, body, user, store, bus }) => {
    const token = bearer(req, url);
    const mine = store.sessionsForUser(user.id);
    if (body?.others === true) {
      let n = 0;
      for (const s of mine) {
        if (s.token !== token) { store.deleteSession(s.token); n++; }
      }
      bus.emit("user.kick", { userId: user.id }); // live tabs re-auth or drop
      return json(res, 200, { ok: true, revoked: n });
    }
    const handle = String(body?.handle ?? "");
    const hit = mine.find((s) => sessionHandle(s.token) === handle);
    if (!hit) return json(res, 404, { error: "session_not_found" });
    store.deleteSession(hit.token);
    bus.emit("user.kick", { userId: user.id });
    json(res, 200, { ok: true, revoked: 1 });
  });

  // Your own sign-in history: the last 25 attempts on YOUR account, so a
  // member can see a failed run against them without asking an admin. Scoped
  // to user.id, and it carries their own addresses only.
  // A SUCCESSFUL sign-in came from one of their own devices, so its address
  // is theirs. A failed attempt against them came from whoever typed their
  // name — another member mistyping, or an attacker — so it shows only the
  // network, never somebody else's full address (Oct 2026 review).
  const OWN = new Set(["ok", "register", "challenge_passed", "reset_ok", "password_changed", "secret_changed"]);
  router.get("/api/me/security", "user", ({ res, user, store }) => {
    json(res, 200, {
      events: store.listLoginEvents({ userId: user.id, limit: 25 })
        .map((e) => (OWN.has(e.outcome) ? e : { ...e, ip: e.network })),
      windowMs: WINDOW_MS,
    });
  });
}

/** Exposed for the harness. */
export type SecurityStore = Store;
