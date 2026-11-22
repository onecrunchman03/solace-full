// FEDERATION F1 — the rendezvous link (FEDERATION.md).
//
// Satellites dial OUT to `/ws-satellite` and hold the connection; this module
// owns that surface. Every connect is challenge-response against the
// satellite's stored Ed25519 PUBLIC key (the hub holds no secret worth
// stealing), timestamp-bounded (no replay), version-gated (updates enforce
// themselves), and refused for any status but active. One live link per
// satellite: a fresh connect replaces a dead one (restart recovery), and a
// replacement from a different network raises a finding.
//
// NB the three-places rule for every /ws-* surface: realtime.ts's upgrade
// allowlist, deploy/Caddyfile's @backend matcher, and client/vite.config.ts.
import { WebSocketServer, WebSocket } from "ws";
import type { Server, IncomingMessage } from "node:http";
import { createPublicKey, randomBytes, verify as edVerify } from "node:crypto";
import type { Store } from "../db/store";
import type { Bus } from "../bus";
import { networkOf } from "../auth";
import { clientIp, makeRateLimiter } from "../http";
import {
  HEARTBEAT_MS, HELLO_TIMEOUT_MS, MIN_SATELLITE_VERSION, TS_SKEW_MS,
  helloPayload, versionAtLeast,
} from "./protocol";
import { ensureSatellitePage } from "./community";
import { HOSTING_VERSION } from "../legal";

/** Which satellites hold a live link right now (the admin screen's dot). */
const liveLinks = new Map<number, WebSocket>();
export function connectedSatelliteIds(): number[] {
  return [...liveLinks.keys()];
}
export function satelliteConnected(satelliteId: number): boolean {
  return liveLinks.has(satelliteId);
}

/** The address each linked satellite dialed in FROM (F5 voice: where its
 *  LiveKit lives, if the host forwarded the ports). Live links only — a
 *  disconnected host has no reachable anything. */
const liveIps = new Map<number, string>();
export function satelliteIp(satelliteId: number): string | null {
  return liveIps.get(satelliteId) ?? null;
}
/** The delist kill switch: drop a satellite's link NOW, mid-frame. */
export function dropSatelliteLink(satelliteId: number): void {
  const ws = liveLinks.get(satelliteId);
  if (ws) {
    try { ws.close(4403, "delisted"); } catch { /* already down */ }
    liveLinks.delete(satelliteId);
    liveIps.delete(satelliteId);
  }
}

// ---- RPC over the link (F2) -------------------------------------------------
// The hub is the only side that asks; the satellite only ever answers. A
// request that can't complete — no link, a drop mid-flight, a timeout —
// REJECTS with code "satellite_offline", which routes turn into an honest
// 503. Nothing queues: an offline community is offline, not eventually
// consistent.
let rpcSeq = 0;
const rpcPending = new Map<number, {
  ws: WebSocket;
  resolve: (v: unknown) => void;
  reject: (e: Error & { code?: string }) => void;
  timer: NodeJS.Timeout;
}>();

// Ids whose request timed out in the last minute: a late reply to one is
// dropped silently rather than charged to the link's noise budget — ONCE,
// and only from the link that was asked (Oct 2026 review: the set was
// global and never spent, so any satellite holding one stale id could
// stream unlimited free frames past the budget).
const recentlyExpired = new Map<number, WebSocket>();
const rememberExpired = (id: number, ws: WebSocket): void => {
  recentlyExpired.set(id, ws);
  setTimeout(() => recentlyExpired.delete(id), 60_000).unref?.();
};

const offlineErr = (): Error & { code?: string } =>
  Object.assign(new Error("satellite_offline"), { code: "satellite_offline" });
const busyErr = (): Error & { code?: string } =>
  Object.assign(new Error("satellite_busy"), { code: "satellite_busy" });

// IN-FLIGHT CEILING per satellite (Sep 2026 review round, part two). Every
// pending RPC is a frame queued on ONE home-PC WebSocket plus a timer in
// rpcPending; with no ceiling, N concurrent public attachment fetches (or
// history reads, or searches) serialised N × 15s of work over that link and
// starved the community's own posts into "offline". Past the ceiling a
// request is refused at once — the caller's 503 — rather than queued.
export const MAX_INFLIGHT_PER_SATELLITE = 48;
const inflightBySat = new Map<number, number>();
export function satelliteInflight(satelliteId: number): number {
  return inflightBySat.get(satelliteId) ?? 0;
}

export function satelliteRpc<T = unknown>(
  satelliteId: number,
  op: string,
  args: unknown,
  timeoutMs = 6_000,
): Promise<T> {
  const ws = liveLinks.get(satelliteId);
  if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.reject(offlineErr());
  const inflight = inflightBySat.get(satelliteId) ?? 0;
  if (inflight >= MAX_INFLIGHT_PER_SATELLITE) return Promise.reject(busyErr());
  inflightBySat.set(satelliteId, inflight + 1);
  const release = (): void => {
    const n = (inflightBySat.get(satelliteId) ?? 1) - 1;
    if (n <= 0) inflightBySat.delete(satelliteId);
    else inflightBySat.set(satelliteId, n);
  };
  return new Promise<T>((resolve, reject) => {
    const id = ++rpcSeq;
    const timer = setTimeout(() => {
      rpcPending.delete(id);
      rememberExpired(id, ws);
      release();
      reject(offlineErr());
    }, timeoutMs);
    rpcPending.set(id, {
      ws,
      resolve: (v) => { release(); (resolve as (v: unknown) => void)(v); },
      reject: (e) => { release(); reject(e); },
      timer,
    });
    try {
      ws.send(JSON.stringify({ type: "rpc", id, op, args }));
    } catch {
      clearTimeout(timer);
      rpcPending.delete(id);
      release();
      reject(offlineErr());
    }
  });
}

/** A dying link fails its in-flight requests immediately (no timeout wait). */
function failPendingFor(ws: WebSocket): void {
  for (const [id, p] of rpcPending) {
    if (p.ws === ws) {
      clearTimeout(p.timer);
      rpcPending.delete(id);
      p.reject(offlineErr());
    }
  }
}

const PROBE_WINDOW_MS = 10 * 60_000;
const PROBE_THRESHOLD = 3;

// F4 transport guards. A legit daemon opens ONE connection and sends only
// its hello and RPC replies — so connects are limited per IP (a reconnect
// storm from one box is backoff-broken clients or a probe, either way not
// worth serving), and frames that are neither count as NOISE: past the
// budget the link is cut. Stale RPC replies count too — a real timeout race
// leaves one or two, never dozens; a flood of fabricated rpc.ok frames must
// not get free JSON parsing forever.
const CONNECTS_PER_IP = 30;
const CONNECT_WINDOW_MS = 10 * 60_000;
const NOISE_BUDGET = 50;
const connLimiter = makeRateLimiter();

export function attachFederationLink(httpServer: Server, store: Store, bus: Bus): void {
  // Satellite input is hostile input: a frame bigger than any legal RPC
  // reply is terminated at the transport, before JSON.parse sees it.
  const wss = new WebSocketServer({ noServer: true, maxPayload: 512 * 1024 });

  httpServer.on("upgrade", (req: IncomingMessage, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/ws-satellite") return; // not ours
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const ip = clientIp(req); // right-most XFF hop, the Caddy-observed one
    ws.on("error", () => { /* the close (or the early return) handles it */ });
    if (!connLimiter(`satconn:${ip}`, CONNECTS_PER_IP, CONNECT_WINDOW_MS)) {
      try { ws.close(4429, "rate_limited"); } catch { /* gone */ }
      return;
    }
    const nonce = randomBytes(32).toString("hex");
    let satelliteId: number | null = null;
    let alive = true;
    // The noise counter DECAYS (one unit a second): a real backlog after an
    // outage leaves a burst of late replies, and the old fixed budget let
    // that burst cut the link, which reconnected into the same backlog —
    // a flap that also rang Sterling's impersonation alarm every round.
    let noise = 0;
    let noiseAt = Date.now();
    let flooded = false;
    // ONE REFUSAL PER SOCKET (Oct 2026 review). A refused socket keeps
    // emitting buffered frames until ws's close timer fires, and each one
    // re-refused — a ledger INSERT (its own commit) per frame, so one packet
    // of tiny frames held the event loop for minutes. After the first, every
    // frame is dropped before it is even parsed, and the socket is cut short.
    let done = false;

    const refuse = (why: string, satId: number | null, opts: { quiet?: boolean } = {}): void => {
      if (done) return;
      done = true;
      setTimeout(() => { try { ws.terminate(); } catch { /* gone */ } }, 2_000).unref?.();
      store.recordSatelliteEvent("handshake_failed", satId, ip, why);
      // quiet: the row is known and simply not welcome (delisted, stale
      // agreement) — its daemon retrying on backoff is expected, not a probe.
      if (!opts.quiet && satId !== null && store.recentHandshakeFails(satId, PROBE_WINDOW_MS) === PROBE_THRESHOLD) {
        const sat = store.getSatellite(satId);
        bus.emit("satellite.event", {
          kind: "handshake_surge", satelliteId: satId, name: sat?.name ?? `#${satId}`,
          detail: `${PROBE_THRESHOLD} failed handshakes in 10 minutes from ${ip} — someone may hold the id without the key`,
        });
      }
      try { ws.close(4403, why); } catch { /* gone */ }
    };

    // The hub speaks first: here is your nonce, sign it.
    ws.send(JSON.stringify({ type: "challenge", nonce, now: Date.now() }));
    const helloTimer = setTimeout(() => refuse("hello_timeout", null), HELLO_TIMEOUT_MS);

    ws.on("message", (raw) => {
      if (done) return;
      let msg: {
        type?: string; satelliteId?: number; version?: string; ts?: number; sig?: string;
        id?: number; result?: unknown; error?: string;
      };
      try { msg = JSON.parse(String(raw)); } catch { return refuse("bad_json", satelliteId); }
      // A frame that parses to null, a number or an array is not a message.
      if (!msg || typeof msg !== "object" || Array.isArray(msg)) return refuse("bad_json", satelliteId);

      // F4 noise budget: frames that aren't the hello or a live RPC reply.
      const countNoise = (): void => {
        const now = Date.now();
        noise = Math.max(0, noise - (now - noiseAt) / 1000);
        noiseAt = now;
        if (++noise > NOISE_BUDGET) {
          // One refusal, then silence: frames already buffered behind the
          // close used to re-refuse (a ledger row + a query each) until the
          // socket actually went (Sep 2026 review).
          flooded = true;
          refuse("frame_flood", satelliteId);
        }
      };
      if (flooded) return;

      // RPC replies from an AUTHENTICATED link resolve their waiting request.
      if ((msg.type === "rpc.ok" || msg.type === "rpc.err") && satelliteId !== null) {
        const id = Number(msg.id);
        const p = rpcPending.get(id);
        if (!p || p.ws !== ws) {
          // A reply to a request that timed out moments ago is a LATE
          // answer, not a fabricated one — dropped without a noise charge.
          if (recentlyExpired.get(id) === ws) { recentlyExpired.delete(id); return; }
          return countNoise(); // never asked, or someone else's id — drop
        }
        clearTimeout(p.timer);
        rpcPending.delete(Number(msg.id));
        if (msg.type === "rpc.ok") p.resolve(msg.result);
        else p.reject(Object.assign(new Error(String(msg.error ?? "rpc_error")), { code: String(msg.error ?? "rpc_error") }));
        return;
      }

      if (msg.type === "hello" && satelliteId === null) {
        clearTimeout(helloTimer);
        const satId = Number(msg.satelliteId);
        const sat = Number.isInteger(satId) ? store.getSatellite(satId) : undefined;
        if (!sat) return refuse("unknown_satellite", null);
        if (sat.status !== "active") return refuse("revoked", sat.id, { quiet: true });
        // THE PAPERWORK: a satellite row without the current Host Agreement
        // on it (a pre-agreement registration, or a version bump) doesn't
        // get a link — the host re-accepts by redeeming a rotation key in
        // the ordinary setup form (legal.ts).
        if (sat.hostingVersion !== HOSTING_VERSION) return refuse("hosting_agreement_required", sat.id, { quiet: true });
        // Clamped BEFORE any use: an unauthenticated hello (only a
        // guessable id needed to reach this line) could otherwise write a
        // ~500KB "version" into the event ledger on every knock.
        const version = String(msg.version ?? "").slice(0, 20);
        if (!versionAtLeast(version, MIN_SATELLITE_VERSION)) return refuse(`stale_version:${version}`, sat.id);
        const ts = Number(msg.ts);
        if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > TS_SKEW_MS) return refuse("stale_timestamp", sat.id);
        let sigOk = false;
        try {
          sigOk = edVerify(
            null,
            Buffer.from(helloPayload(nonce, sat.id, version, ts)),
            createPublicKey(sat.pubkey),
            Buffer.from(String(msg.sig ?? ""), "base64"),
          );
        } catch { sigOk = false; }
        if (!sigOk) return refuse("bad_signature", sat.id);

        // Authenticated. One link per satellite — a new connect replaces the
        // old (a restarted host's dead socket may linger past its heartbeat).
        const prevLink = liveLinks.get(sat.id);
        if (prevLink && prevLink !== ws) { try { prevLink.close(4000, "replaced"); } catch { /* gone */ } }
        liveLinks.set(sat.id, ws);
        if (ip) liveIps.set(sat.id, ip);
        satelliteId = sat.id;
        const network = ip ? networkOf(ip) : null;
        const prevNetwork = store.touchSatellite(sat.id, network, version);
        store.recordSatelliteEvent("connect", sat.id, ip, `v${version}`);
        if (prevNetwork && network && prevNetwork !== network) {
          bus.emit("satellite.event", {
            kind: "new_network", satelliteId: sat.id, name: sat.name,
            detail: `connected from ${network} (was ${prevNetwork})`,
          });
        }
        // floorId: the highest message id the hub has ever indexed for this
        // satellite. The daemon bumps its own id counter above it, so a
        // ROTATION onto a fresh box (content.db minting from 1 again) can
        // never collide new posts into old index rows — while a restored
        // backup keeps its history untouched. Sent on every welcome; for a
        // box whose counter is already past it, it's a no-op.
        ws.send(JSON.stringify({
          type: "welcome", now: Date.now(), heartbeatMs: HEARTBEAT_MS,
          floorId: store.maxRemoteIdFor(sat.id),
        }));
        // THE COMMUNITY APPEARS WHEN ITS HOST DOES (Josh, Sep 2026: "i
        // started a satellite and i dont see it in the solace pages"). The
        // admin's gate was the KEY MINT; making them come back for a second
        // button read as broken. First successful connect with no page
        // bound → the page auto-creates, named what the host named it.
        try { ensureSatellitePage(store, bus, sat.id); } catch { /* the admin route remains */ }
        return;
      }
      // The hub asked for none of this — anything else on the line is noise.
      countNoise();
    });

    ws.on("pong", () => { alive = true; });
    const beat = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (!alive) { try { ws.terminate(); } catch { /* gone */ } return; }
      alive = false;
      try { ws.ping(); } catch { /* gone */ }
    }, HEARTBEAT_MS);

    ws.on("close", () => {
      clearTimeout(helloTimer);
      clearInterval(beat);
      failPendingFor(ws);
      if (satelliteId !== null && liveLinks.get(satelliteId) === ws) {
        liveLinks.delete(satelliteId);
        liveIps.delete(satelliteId);
        store.recordSatelliteEvent("disconnect", satelliteId, ip, null);
      }
    });
    ws.on("error", () => { /* close handles it */ });
  });
}
