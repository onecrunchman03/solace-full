// SOLACE SURVIVORZ — the live feed: /ws-survivorz, a WATCH socket (src/survivorz/broadcast.ts).
//
// It only ever listens. Frames are the wire's (src/survivorz/sim/wire.ts) and go straight to
// whatever draws them (show/scene.ts `apply`). A dropped socket reconnects with backoff, and the
// server's first frame on every connect is a full snapshot, so a reconnect needs no catching up.
//
// A STALLED SOCKET IS A DROPPED ONE. A half-open TCP connection (a NAT or router timing it out, a
// Wi-Fi blip) closes nothing at either end — Windows' keepalive is two hours — and the show froze on
// its last frame while every watchdog read a healthy page. The server sends a keepalive
// (`{type:"ka", t}`) every 5 s, paused or not, so NO FRAME FOR STALL_MS means the line is dead: the
// socket is dropped and a fresh one opened (which gets a full snapshot). A keepalive proves the line
// and goes no further.
import { getToken, wsUrl } from "../backrooms/gameapi";
import type { ServerFrame, ScreenFrame } from "../../../src/survivorz/sim/wire";
import type { PublicCharacter } from "../../../src/survivorz/cast/rules";
import { setPublicCast } from "./show/overlay";

export type LiveFrame = ScreenFrame;

/** no frame (keepalives count) for this long and the socket is taken as dead (ms) */
export const STALL_MS = 10_000;

export interface LiveFeed {
  close(): void;
  /** WALK THE MAP (show/walk.ts): the admin's inputs for their own body, the one thing a page ever sends. The server
   *  takes them only from an admin's socket during a walk run. False if the line is down. */
  send(o: Record<string, unknown>): boolean;
  /** frames received, for the panel's readout */
  readonly stats: { frames: number; bytes: number; connected: boolean; reconnects: number; stalls: number };
}

export function connectLive(onFrame: (f: LiveFrame) => void, onState?: (connected: boolean, why?: string) => void): LiveFeed {
  let ws: WebSocket | null = null;
  let closed = false;
  let backoff = 1000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** when the line last proved itself (opened, or any frame) */
  let aliveAt = 0;
  const stats = { frames: 0, bytes: 0, connected: false, reconnects: 0, stalls: 0 };

  const retry = (ms: number): void => {
    if (timer) clearTimeout(timer);
    stats.reconnects++;
    timer = setTimeout(open, ms);
  };

  const open = (): void => {
    timer = null;
    if (closed) return;
    const token = getToken() ?? "";
    const sock = new WebSocket(`${wsUrl("/ws-survivorz")}?token=${encodeURIComponent(token)}`);
    ws = sock;
    aliveAt = performance.now();
    sock.onopen = () => { aliveAt = performance.now(); stats.connected = true; backoff = 1000; onState?.(true); };
    sock.onmessage = (ev) => {
      aliveAt = performance.now();
      if (typeof ev.data !== "string") return;
      stats.frames++;
      stats.bytes += ev.data.length;
      let f: LiveFrame | { type: "ka" } | { type: "cast"; cast: PublicCharacter[] };
      try { f = JSON.parse(ev.data) as LiveFrame | { type: "ka" } | { type: "cast"; cast: PublicCharacter[] }; } catch { return; }
      if (f.type === "ka") return;   // the keepalive: it only proves the line is alive
      // the cast as the server has it now (the panel's list is live): names, strip order, suits
      if (f.type === "cast") { if (Array.isArray(f.cast)) setPublicCast(f.cast); return; }
      onFrame(f);
    };
    sock.onclose = (ev) => {
      if (ws !== sock) return;   // (a socket already dropped for stalling)
      stats.connected = false;
      ws = null;
      if (closed) return;
      // 4003 = taken off air; a 403 at the door reads as a 1006 close — either way, back off long
      const why = ev.code === 4003 ? "off_air" : undefined;
      onState?.(false, why);
      retry(why ? 30_000 : backoff);
      backoff = Math.min(30_000, backoff * 2);
    };
    sock.onerror = () => { /* onclose follows */ };
  };

  // the stall watch: a socket (open or still connecting) silent past STALL_MS is let go — its
  // handlers detached first, since a dead line's close handshake can itself take minutes
  const watch = setInterval(() => {
    if (closed || !ws || performance.now() - aliveAt < STALL_MS) return;
    const dead = ws;
    ws = null;
    dead.onopen = dead.onmessage = dead.onclose = dead.onerror = null;
    try { dead.close(); } catch { /* already gone */ }
    stats.connected = false;
    stats.stalls++;
    onState?.(false, "stalled");
    retry(1000);
  }, 2_000);

  open();

  return {
    stats,
    send(o) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      try { ws.send(JSON.stringify(o)); return true; } catch { return false; }
    },
    close() {
      closed = true;
      clearInterval(watch);
      if (timer) clearTimeout(timer);
      // (its handlers first: a frame already queued was still applied to a show that had been put away)
      if (ws) { ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null; try { ws.close(); } catch { /* already gone */ } }
      ws = null;
      stats.connected = false;
    },
  };
}
