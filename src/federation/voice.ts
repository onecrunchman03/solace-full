// FEDERATION F5b — voice HOSTED ON THE SATELLITE (Josh, Sep 2026: "i wanted
// the voice to be hosted on the satellite's server").
//
// The shape that keeps every doctrine intact:
// · The HOST runs the SFU. The satellite app bundles livekit-server.exe and
//   the daemon runs it with keys generated on the host's box; media (WebRTC,
//   DTLS-SRTP — encrypted by construction) flows browser ↔ host directly
//   over the UDP ports the Guide tab tells them to forward.
// · The HUB stays the auth manager. Tokens are minted HERE, after the same
//   page/lock/allow-list checks as any voice room — the satellite hands the
//   hub its LiveKit key/secret over the authenticated link (voice.info RPC)
//   and never decides who may join.
// · SIGNALING RELAYS through the hub (`/satvoice/<id>` → the host's :7880),
//   because a browser on https://solace.zone cannot open ws:// to a raw IP
//   (mixed content) and a home PC has no certificate. The relay is a dumb
//   TCP splice — it carries the LiveKit websocket, nothing more.
// · FALLBACK: if the host's ports aren't reachable (probe below), the token
//   route quietly mints for the hub's own SFU instead — voice never just
//   dies because a router wasn't configured yet.
import net from "node:net";
import type { Server, IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { TokenVerifier } from "livekit-server-sdk";
import { clientIp, makeRateLimiter } from "../http";
import { satelliteIp, satelliteRpc } from "./link";

export interface SatVoiceInfo {
  enabled: boolean;
  port: number;
  key: string;
  secret: string;
}

// Env-dialable for the harness (flipping "reachable" must not take a minute).
const INFO_TTL_MS = Number(process.env.SAT_VOICE_CACHE_MS || 60_000);
const PROBE_TTL_MS = Number(process.env.SAT_VOICE_CACHE_MS || 60_000);
const PROBE_TIMEOUT_MS = 900;

const infoCache = new Map<number, { at: number; info: SatVoiceInfo | null }>();
const probeCache = new Map<string, { at: number; ok: boolean }>();

/** The satellite's LiveKit config, over the link, cached briefly. Hostile
 *  input like everything a satellite says: shapes clamped, sizes capped. */
export async function satVoiceInfo(satelliteId: number): Promise<SatVoiceInfo | null> {
  const hit = infoCache.get(satelliteId);
  if (hit && Date.now() - hit.at < INFO_TTL_MS) return hit.info;
  let info: SatVoiceInfo | null = null;
  try {
    const raw = (await satelliteRpc(satelliteId, "voice.info", {}, 3_000)) as Partial<SatVoiceInfo> | null;
    const port = Number(raw?.port);
    const key = String(raw?.key ?? "").slice(0, 64);
    const secret = String(raw?.secret ?? "").slice(0, 128);
    if (raw?.enabled === true && Number.isInteger(port) && port > 0 && port < 65536 && key && secret.length >= 16) {
      info = { enabled: true, port, key, secret };
    }
  } catch {
    info = null; // offline, or a pre-0.4 daemon answering unknown_op
  }
  infoCache.set(satelliteId, { at: Date.now(), info });
  return info;
}

/** Can the hub actually reach the host's LiveKit? One TCP dial, cached —
 *  this is what turns "the router isn't forwarded yet" into a quiet
 *  fallback instead of a dead room. */
export function probeSatVoice(ip: string, port: number): Promise<boolean> {
  const cacheKey = `${ip}:${port}`;
  const hit = probeCache.get(cacheKey);
  if (hit && Date.now() - hit.at < PROBE_TTL_MS) return Promise.resolve(hit.ok);
  return new Promise((resolve) => {
    const done = (ok: boolean): void => {
      // Eviction: the key includes a satellite-CHOSEN port, so a hostile
      // host announcing a new port every info-TTL minted an entry a minute
      // forever. Whole-map clears are fine — a probe is one 900ms dial.
      if (probeCache.size > 512) probeCache.clear();
      probeCache.set(cacheKey, { at: Date.now(), ok });
      try { sock.destroy(); } catch { /* gone */ }
      resolve(ok);
    };
    const sock = net.connect({ host: ip, port, timeout: PROBE_TIMEOUT_MS });
    sock.once("connect", () => done(true));
    sock.once("timeout", () => done(false));
    sock.once("error", () => done(false));
  });
}

/** Everything the voice token route needs, or null → fall back to hub SFU. */
export async function reachableSatVoice(satelliteId: number):
  Promise<{ ip: string; port: number; key: string; secret: string } | null> {
  const ip = satelliteIp(satelliteId);
  if (!ip) return null;
  const info = await satVoiceInfo(satelliteId);
  if (!info) return null;
  if (!(await probeSatVoice(ip, info.port))) return null;
  return { ip, port: info.port, key: info.key, secret: info.secret };
}

// THE RELAY IS A DOOR, NOT A PIPE (Sep 2026 review). It used to check nothing
// but the path shape before dialing a member's HOME PC — anyone on the
// internet who guessed a small integer got a raw TCP path to a host's
// residential LiveKit through solace.zone, as many as they liked. Now:
//  · the LiveKit access token the client puts on the URL is VERIFIED against
//    that satellite's own key/secret (the hub minted it, over the link's
//    voice.info) before a byte reaches the host — the same JWT LiveKit will
//    check, so a legitimate client changes nothing and a stranger has no
//    token to present;
//  · per-IP connect limiting (the /ws-satellite link's shape);
//  · a cap on live splices per satellite, so a home box can't be pinned
//    under a pile of sockets even by people who do hold tokens.
const relayLimiter = makeRateLimiter();
const RELAY_PER_IP = 60; // per 10 min — reconnects on a flaky call, not a loop
const MAX_RELAYS_PER_SATELLITE = 64;
const liveRelays = new Map<number, number>();

/** The signaling relay: wss://hub/satvoice/<id>/... ↔ ws://host:<port>/...
 *  A raw TCP splice after forwarding the upgrade request with the prefix
 *  stripped — the hub never parses a LiveKit frame. Only linked, active,
 *  voice-announcing satellites get a wire; everything else is destroyed. */
export function attachSatVoiceProxy(httpServer: Server): void {
  httpServer.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/satvoice/")) return; // not ours
    const refuse = (line: string): void => {
      try { socket.write(`HTTP/1.1 ${line}\r\n\r\n`); } catch { /* gone */ }
      socket.destroy();
    };
    // EVERYTHING under the prefix is ours to answer — realtime's upgrade
    // allowlist spares the whole prefix on the promise that this handler
    // disposes of it. A malformed id (letters, 10+ digits) used to fall
    // between the two regexes and leave an upgraded socket dangling
    // forever: an unauthenticated fd leak.
    const m = /^\/satvoice\/(\d{1,9})(\/.*)?$/.exec(url.pathname);
    if (!m) return refuse("404 Not Found");
    if (!relayLimiter(`satvoice:${clientIp(req)}`, RELAY_PER_IP, 10 * 60_000)) return refuse("429 Too Many Requests");
    const token = url.searchParams.get("access_token") ?? "";
    if (!token || token.length > 4096) return refuse("401 Unauthorized");
    const satelliteId = Number(m[1]);
    void (async () => {
      const target = await reachableSatVoice(satelliteId).catch(() => null);
      if (!target || socket.destroyed) return refuse("502 Bad Gateway");
      // The token must be one the hub signed for THIS satellite's SFU.
      try {
        await new TokenVerifier(target.key, target.secret).verify(token);
      } catch {
        return refuse("401 Unauthorized");
      }
      if (socket.destroyed) return;
      const live = liveRelays.get(satelliteId) ?? 0;
      if (live >= MAX_RELAYS_PER_SATELLITE) return refuse("503 Service Unavailable");
      liveRelays.set(satelliteId, live + 1);
      let released = false;
      const release = (): void => {
        if (released) return;
        released = true;
        liveRelays.set(satelliteId, Math.max(0, (liveRelays.get(satelliteId) ?? 1) - 1));
      };
      const path = `${m[2] || "/"}${url.search}`;
      const out = net.connect({ host: target.ip, port: target.port, timeout: 10_000 });
      const die = (): void => { socket.destroy(); out.destroy(); release(); };
      // A viewer that vanishes mid-call, or a host that sleeps, must not leave
      // a half-open splice behind — every ending path releases the slot.
      out.once("timeout", die);
      out.once("close", die);
      socket.once("close", die);
      out.on("connect", () => {
        out.setTimeout(0);
        out.setKeepAlive(true, 30_000);
        // Replay the client's upgrade request at the new path; then splice.
        const lines = [`GET ${path} HTTP/1.1`, `Host: ${target.ip}:${target.port}`];
        for (const [k, v] of Object.entries(req.headers)) {
          if (k === "host") continue;
          for (const one of Array.isArray(v) ? v : [v]) {
            if (one != null) lines.push(`${k}: ${one}`);
          }
        }
        out.write(lines.join("\r\n") + "\r\n\r\n");
        if (head.length) out.write(head);
        socket.pipe(out);
        out.pipe(socket);
      });
      out.on("error", die);
      socket.on("error", die);
    })();
  });
}
