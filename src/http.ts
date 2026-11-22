import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { ROUTE_SOURCES } from "./npc/affinity";
import type { Store } from "./db/store";
import type { User } from "./types";
import type { Bus } from "./bus";
import { perfCounters } from "./perf";
import { userForToken, wakeUserForToken, jailUserForToken } from "./auth";
import { isStreamToken, STREAM_PRINCIPAL } from "./survivorz/streamtoken";
import { LEGAL_URLS, TERMS_EXEMPT_ROUTES, TERMS_VERSION, termsOutstanding } from "./legal";

// ---- Response + request helpers ------------------------------------------

/** Send a JSON response with the given status code. */
export function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

/** Read and JSON-parse a request body (capped at 1 MB). Returns {} if empty. */
function readJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > 1_000_000) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(undefined); // signal malformed JSON
      }
    });
    req.on("error", reject);
  });
}

/**
 * Read a raw request body into a Buffer, capped at `maxBytes`. Used for binary
 * uploads (avatars) where we don't want JSON parsing. Rejects if the cap is hit.
 */
export function readRawBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** Pull the bearer token from the Authorization header — or, ONLY for the
 *  two surfaces that can't send headers (the WebSocket upgrade and the
 *  desktop shell's exit sendBeacon), a ?token= query param. Everywhere else
 *  query tokens are refused: URLs land in proxy logs and browser history,
 *  which is no place for a session credential. */
const QUERY_TOKEN_PATHS = new Set(["/ws", "/api/presence/exit"]);

/** Origins the packaged SolaceBackrooms app may call the API from (Tauri v2
 *  webview origins per platform). Extendable via GAME_ORIGINS env (comma-
 *  separated) without a code change. */
export const GAME_ORIGINS = new Set(
  (process.env.GAME_ORIGINS ?? "http://tauri.localhost,https://tauri.localhost,tauri://localhost")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
export function bearer(req: IncomingMessage, url: URL): string | undefined {
  const header = req.headers["authorization"];
  if (typeof header === "string" && header.startsWith("Bearer ")) return header.slice(7);
  if (QUERY_TOKEN_PATHS.has(url.pathname)) return url.searchParams.get("token") ?? undefined;
  return undefined;
}

/** Parse a query param as a positive integer, else undefined. Garbage values
 *  must never reach a SQL LIMIT/comparison bind — node:sqlite throws on
 *  non-integer numbers, turning `?limit=abc` into a 500. */
export function posIntParam(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/**
 * The real client IP, spoof-proof behind our single reverse proxy.
 *
 * Caddy APPENDS the true peer (the client) to any X-Forwarded-For the client
 * sent, so the *right-most* hop is the one Caddy observed and the client can't
 * forge. Taking the left-most (a common mistake) would let anyone bypass the
 * IP-based login security by sending their own `X-Forwarded-For` header. The
 * app binds 127.0.0.1, so only Caddy ever connects; with no XFF (direct, e.g.
 * tests) we fall back to the socket address.
 */
export function clientIp(req: IncomingMessage): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) {
    const hops = xff.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return req.socket.remoteAddress ?? "unknown";
}

/** The requesting client's user-agent, capped. Stored with sessions and
 *  sign-in events so the Security panel can say "which device was this". */
export function userAgent(req: IncomingMessage): string | null {
  const ua = req.headers["user-agent"];
  return typeof ua === "string" && ua ? ua.slice(0, 200) : null;
}

/** Simple fixed-window rate limiter. Returns true if the action is allowed. */
// Every limiter's map registers here; one unref'd sweep prunes expired
// windows so keys that never return (scanner IPs probing /api/login for
// months) can't grow the maps forever.
const LIMITER_MAPS: Map<string, { count: number; resetAt: number }>[] = [];
setInterval(() => {
  const now = Date.now();
  for (const m of LIMITER_MAPS) {
    for (const [k, rec] of m) if (now >= rec.resetAt) m.delete(k);
  }
}, 10 * 60_000).unref();

// A denial used to be a bare `false` that vanished — so a machine hammering
// /api/login hard enough to be throttled left no trace anywhere. Keep a small
// tally (per limiter key prefix) for the Security panel. In-memory and
// since-boot on purpose: the AUTH limiters additionally write a persistent
// `rate_limited` row to the sign-in ledger, which is the durable record.
const denials = new Map<string, { count: number; lastAt: number }>();
export function rateLimitDenials(): { key: string; count: number; lastAt: number }[] {
  return [...denials.entries()]
    .map(([key, d]) => ({ key, ...d }))
    .sort((a, b) => b.count - a.count);
}

export function makeRateLimiter() {
  const hits = new Map<string, { count: number; resetAt: number }>();
  LIMITER_MAPS.push(hits);
  return (key: string, max: number, windowMs: number): boolean => {
    const now = Date.now();
    const rec = hits.get(key);
    if (!rec || now >= rec.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (rec.count >= max) {
      // Tally by the key's PREFIX ("login", "register", …), never the whole
      // key — that carries the client IP, and this map is unbounded.
      const bucket = key.split(":")[0] || "other";
      const d = denials.get(bucket) ?? { count: 0, lastAt: 0 };
      denials.set(bucket, { count: d.count + 1, lastAt: now });
      return false;
    }
    rec.count++;
    return true;
  };
}

const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
};

// ---- Router ---------------------------------------------------------------

/** "mod" = moderators AND admins (admins can do everything a mod can). */
/** "wake" is the odd one out: it resolves ONLY dead-but-fresh accounts, and
 *  every other level resolves only living ones. The two sets never overlap, so
 *  a wake session can't reach an ordinary route and a living account can't
 *  reach the wake routes. See wakeUserForToken. */
/** "watch" is "user" for the Survivorz show's read-only doors (assets, voices), which ALSO admit the
 *  stream rig's token (src/survivorz/streamtoken.ts) as the stream principal — and nothing else does. */
export type AuthLevel = "none" | "user" | "mod" | "admin" | "wake" | "jail" | "watch";

/** Everything a route handler needs. `user` is present when auth !== "none". */
export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  store: Store;
  bus: Bus;
  body: any;
  params: Record<string, string>;
  user: User; // populated by the dispatcher for authed routes
}

type Handler = (ctx: Ctx) => void | Promise<void>;

interface Route {
  method: string;
  segments: string[];
  auth: AuthLevel;
  handler: Handler;
  /** When true the dispatcher does NOT read/parse a body; the handler reads the
   *  raw stream itself (e.g. binary uploads via readRawBody). */
  raw?: boolean;
}

const toSegments = (p: string) => p.split("/").filter(Boolean);

/** Match a route's segments against a request's, extracting :params. */
function matchPath(routeSegs: string[], pathSegs: string[]): Record<string, string> | null {
  if (routeSegs.length !== pathSegs.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < routeSegs.length; i++) {
    const r = routeSegs[i];
    if (r.startsWith(":")) {
      // A malformed percent-sequence (`/avatars/%ZZ`) used to throw here,
      // OUTSIDE the dispatcher's try — no response was ever written and the
      // connection hung until Caddy's timeout. Not ours = not found.
      try {
        params[r.slice(1)] = decodeURIComponent(pathSegs[i]);
      } catch {
        return null;
      }
    } else if (r !== pathSegs[i]) return null;
  }
  return params;
}

/** Collects routes and dispatches requests to them. */
export class Router {
  private routes: Route[] = [];

  add(method: string, path: string, auth: AuthLevel, handler: Handler, raw = false): void {
    this.routes.push({ method, segments: toSegments(path), auth, handler, raw });
  }
  get(path: string, auth: AuthLevel, handler: Handler) { this.add("GET", path, auth, handler); }
  post(path: string, auth: AuthLevel, handler: Handler) { this.add("POST", path, auth, handler); }
  patch(path: string, auth: AuthLevel, handler: Handler) { this.add("PATCH", path, auth, handler); }
  del(path: string, auth: AuthLevel, handler: Handler) { this.add("DELETE", path, auth, handler); }
  /** POST route whose body is a raw binary stream (handler uses readRawBody). */
  postRaw(path: string, auth: AuthLevel, handler: Handler) { this.add("POST", path, auth, handler, true); }

  async dispatch(req: IncomingMessage, res: ServerResponse, store: Store, bus: Bus): Promise<void> {
    for (const k in SECURITY_HEADERS) res.setHeader(k, SECURITY_HEADERS[k]);

    // CORS — for the PACKAGED SolaceBackrooms app only. Its Tauri webview
    // runs on a local origin and calls the API cross-origin with a bearer
    // header (which forces a preflight). The allowlist is exact origins,
    // never "*": browser tabs on other sites still get no CORS at all.
    const origin = req.headers.origin;
    if (typeof origin === "string" && GAME_ORIGINS.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "authorization, content-type",
          "Access-Control-Max-Age": "86400",
        });
        res.end();
        return;
      }
    }

    const url = new URL(req.url ?? "/", "http://localhost");
    const pathSegs = toSegments(url.pathname);

    for (const route of this.routes) {
      if (route.method !== req.method) continue;
      const params = matchPath(route.segments, pathSegs);
      if (!params) continue;

      // Parse a JSON body for methods that carry one (unless the route reads raw).
      let body: any = {};
      if (!route.raw && (req.method === "POST" || req.method === "PUT" || req.method === "PATCH")) {
        try {
          body = await readJson(req);
        } catch {
          // Oversized (>1MB) or aborted body. The socket may already be
          // destroyed, so the 413 is best-effort — the point is that this
          // rejection is HANDLED, not an unhandledRejection into the
          // process-level net.
          try {
            if (!res.headersSent) json(res, 413, { error: "body_too_large" });
          } catch { /* socket gone */ }
          return;
        }
        if (body === undefined) return json(res, 400, { error: "invalid_json" });
      }

      // Enforce auth for protected routes.
      let user = undefined as unknown as User;
      if (route.auth === "wake") {
        // A separate resolver, not a relaxed one — see wakeUserForToken.
        const woken = wakeUserForToken(store, bearer(req, url));
        if (!woken) return json(res, 401, { error: "unauthorized" });
        user = woken;
      } else if (route.auth === "jail") {
        // …and the goblins' cell, on the same terms — see jailUserForToken.
        const held = jailUserForToken(store, bearer(req, url));
        if (!held) return json(res, 401, { error: "unauthorized" });
        user = held;
      } else if (route.auth === "watch" && isStreamToken(bearer(req, url))) {
        // the stream rig (SURVIVORZ.md §12): read-only, show-only, no account behind it
        user = STREAM_PRINCIPAL;
      } else if (route.auth !== "none") {
        const resolved = userForToken(store, bearer(req, url));
        if (!resolved) return json(res, 401, { error: "unauthorized" });
        if (route.auth === "admin" && !resolved.isAdmin) {
          return json(res, 403, { error: "forbidden" });
        }
        if (route.auth === "mod" && !resolved.isAdmin && resolved.role !== "moderator") {
          return json(res, 403, { error: "forbidden" });
        }
        // THE PAPERWORK: no Terms on file, no service — whatever the client.
        // The exempt set is what the gate itself needs (see legal.ts).
        if (
          termsOutstanding(resolved) &&
          !TERMS_EXEMPT_ROUTES.has(`${route.method} /${route.segments.join("/")}`)
        ) {
          return json(res, 403, { error: "terms_required", version: TERMS_VERSION, url: LEGAL_URLS.terms });
        }
        user = resolved;
      }

      const ctx: Ctx = { req, res, url, store, bus, body, params, user };
      try {
        await route.handler(ctx);
        // THE AFFINITY METER: a successful request that earns it (the
        // route already enforced everything it had to be).
        if (user && res.statusCode >= 200 && res.statusCode < 300) {
          const src = ROUTE_SOURCES[`${route.method} /${route.segments.join("/")}`];
          if (src) {
            try { store.affinityHook?.(user.id, src[0], src[1]); } catch (e) { console.error("[affinity]", e); }
          }
        }
      } catch (err) {
        console.error(`[http] ${req.method} ${url.pathname}:`, err);
        // Into the Admin Panel's error tracker (deduped; never throws).
        store.recordError(
          "server",
          err instanceof Error ? err.message : String(err),
          err instanceof Error ? err.stack : null,
          `${req.method} ${url.pathname}`,
          user?.id ?? null,
        );
        if (!res.headersSent) json(res, 500, { error: "server_error" });
      }
      return;
    }

    json(res, 404, { error: "not_found" });
  }
}

/** Build the HTTP server around a configured router. */
export function createServer(store: Store, router: Router, bus: Bus) {
  return createHttpServer((req, res) => {
    perfCounters.httpReqs++; // admin observability (src/perf.ts)
    void router.dispatch(req, res, store, bus);
  });
}
