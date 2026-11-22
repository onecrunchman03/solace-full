// SOLACE SURVIVORZ — THE STREAM RIG'S SERVER HALF (SURVIVORZ.md §12 "The stream rig").
//
// The rig (scripts/survivorz/streamer.mjs) runs on the workstation: Edge draws the show's stream page
// (`/#survivorz-stream`, client/src/survivorz/show/StreamView.svelte), its tab capture goes through
// ffmpeg to YouTube and a local recording. Two things here keep that honest for four weeks:
//
//   · THE HEARTBEAT. The rig posts its state every 10 s (fps, the last picture, ffmpeg and the RTMP
//     leg, the recording, restarts). A health check, "Survivorz stream", goes RED when a run is
//     expected and the beat is over STALE_MS old, or when the rig itself reports a problem — and a red
//     check reaches Sterling's alert DMs like every other (index.ts's observability sweep). "Expected"
//     is set by the first beat and cleared only by a clean stop (the rig's own, or stream-task.ps1
//     -Stop, or the admin's lever) — kept in app_kv, so a server restart still knows a run is due.
//   · THE GO-LIVE SWITCH (Nov 3 2026 — Josh: "pick the character i want to load and then press a button to
//     start it all with a stream on youtube"). The rig runs all the time and STANDS BY — no browser, no
//     encode, a heartbeat marked `idle` — until the server WANTS a stream; the heartbeat's answer carries
//     `want`, and the rig goes live or back to standing by within a beat. The want is set by the Show
//     panel's "Start show + stream" (and turned off by Stop), or by hand on the Stream tab. Kept in app_kv.
//   · THE STANDBY CARD. An admin lever (Admin Panel → Survivorz → Stream) puts a card over the stream
//     page — "we'll be right back" — without stopping the stream. Audited. The page polls for it.
//
// Every route here is behind SURVIVORZ_STREAM_TOKEN (streamtoken.ts) or the admin, and answers 404
// when the token isn't configured: a box with no stream rig has no stream doors.
import { bearer, json, type Router } from "../http";
import type { Store } from "../db/store";
import { registerHealthCheck } from "../health";
import { isStreamPrincipal, isStreamToken, streamTokenConfigured } from "./streamtoken";

/** A beat older than this, with a run expected, is a dead rig (the rig beats every 10 s). Env so a
 *  harness needn't wait two minutes. */
export const STALE_MS = Number(process.env.SURVIVORZ_STREAM_STALE_MS) || 2 * 60_000;
/** After a server boot, how long to wait for the first beat before calling it missing. */
const BOOT_GRACE_MS = Number(process.env.SURVIVORZ_STREAM_GRACE_MS) || 3 * 60_000;
const KV_EXPECTED = "survivorz_stream_expected";
const KV_STANDBY = "survivorz_stream_standby";
const KV_WANT = "survivorz_stream_want";
/** how long a wanted stream may take to go live before the check goes red (Edge + the page's load) */
const WANT_GRACE_MS = Number(process.env.SURVIVORZ_STREAM_WANT_GRACE_MS) || 4 * 60_000;
const TEXT_MAX = 140;

export interface StreamBeat {
  at: number;
  /** the page's frames per second, and when the capture last delivered a picture */
  fps: number | null;
  lastFrameAt: number | null;
  /** "up" | "down" | "off" (not configured) | "split" (the planned 11-hour gap) */
  rtmp: string;
  /** "up" | "down" | "off" */
  recording: string;
  /** the capture's ffmpeg running */
  ffmpeg: boolean;
  session: number;
  restarts: number;
  /** when the current RTMP session started (the 11-hour split counts from it) */
  rtmpSince: number | null;
  heapMB: number | null;
  /** what the rig itself thinks is wrong, e.g. "RTMP down 3 min" — any value turns the check red */
  problem: string | null;
  /** the rig is standing by: running, nothing on air, waiting for the server to want a stream */
  idle: boolean;
}

export interface StandbyCard { on: boolean; text: string; at: number }

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").slice(0, max) : "");

export function startSurvivorzStream(router: Router, store: Store): { beat(): StreamBeat | null; configured(): boolean; setWant(on: boolean): void } {
  let beat: StreamBeat | null = null;
  const bootAt = Date.now();

  const standby = (): StandbyCard => {
    try {
      const raw = store.kvGet(KV_STANDBY);
      if (raw) { const j = JSON.parse(raw) as StandbyCard; return { on: j.on === true, text: str(j.text, TEXT_MAX), at: num(j.at) ?? 0 }; }
    } catch { /* a bad row reads as off */ }
    return { on: false, text: "", at: 0 };
  };
  const expected = (): boolean => store.kvGet(KV_EXPECTED) === "1";
  /** when a stream was wanted (0 = not wanted) */
  const wantAt = (): number => Number(store.kvGet(KV_WANT)) || 0;
  const setWant = (on: boolean): void => {
    if (on) { if (!wantAt()) store.kvSet(KV_WANT, String(Date.now())); }
    else store.kvDel(KV_WANT);
  };

  // ---- the rig's heartbeat (the stream token, nothing else) ----
  router.post("/api/survivorz/stream/heartbeat", "none", ({ req, res, url, body }) => {
    if (!streamTokenConfigured()) return json(res, 404, { error: "not_found" });
    if (!isStreamToken(bearer(req, url))) return json(res, 401, { error: "unauthorized" });
    const b = (body ?? {}) as Record<string, unknown>;
    if (b.stopping === true) {
      // a clean stop: nothing is expected any more, and the check goes quiet
      store.kvDel(KV_EXPECTED);
      beat = null;
      return json(res, 200, { ok: true, standby: standby(), want: wantAt() > 0 });
    }
    beat = {
      at: Date.now(),
      fps: num(b.fps),
      lastFrameAt: num(b.lastFrameAt),
      rtmp: str(b.rtmp, 12) || "off",
      recording: str(b.recording, 12) || "off",
      ffmpeg: b.ffmpeg === true,
      session: num(b.session) ?? 0,
      restarts: num(b.restarts) ?? 0,
      rtmpSince: num(b.rtmpSince),
      heapMB: num(b.heapMB),
      problem: str(b.problem, 200) || null,
      idle: b.idle === true,
    };
    // a rig standing by isn't a run: only a live beat makes one expected
    if (!beat.idle && !expected()) store.kvSet(KV_EXPECTED, "1");
    if (beat.idle && expected() && !wantAt()) store.kvDel(KV_EXPECTED);
    json(res, 200, { ok: true, standby: standby(), want: wantAt() > 0 });
  });

  // ---- what the stream page shows over the show (the stream principal, or the admin) ----
  router.get("/api/survivorz/stream/state", "watch", ({ res, user }) => {
    if (!streamTokenConfigured()) return json(res, 404, { error: "not_found" });
    if (!isStreamPrincipal(user) && !user.isAdmin) return json(res, 403, { error: "forbidden" });
    json(res, 200, { standby: standby() });
  });

  // ---- the admin's view and levers (Admin Panel → Survivorz → Stream) ----
  router.get("/api/admin/survivorz/stream", "admin", ({ res }) => {
    json(res, 200, {
      configured: streamTokenConfigured(),
      expected: expected(),
      want: wantAt() > 0,
      wantAt: wantAt() || null,
      beat,
      age: beat ? Date.now() - beat.at : null,
      standby: standby(),
      staleMs: STALE_MS,
    });
  });

  router.post("/api/admin/survivorz/stream/standby", "admin", ({ res, body, store: st, user }) => {
    const b = (body ?? {}) as { on?: unknown; text?: unknown };
    if (typeof b.on !== "boolean") return json(res, 400, { error: "bad_lever" });
    const card: StandbyCard = { on: b.on, text: str(b.text, TEXT_MAX).trim(), at: Date.now() };
    st.kvSet(KV_STANDBY, JSON.stringify(card));
    st.audit(user.id, b.on ? "survivorz.stream.standby_on" : "survivorz.stream.standby_off", card.text || undefined);
    json(res, 200, { standby: card });
  });

  /** GO LIVE / STOP STREAMING by hand (the Show panel's start does it with the run). Audited. */
  router.post("/api/admin/survivorz/stream/want", "admin", ({ res, body, store: st, user }) => {
    if (!streamTokenConfigured()) return json(res, 404, { error: "not_found" });
    const b = (body ?? {}) as { on?: unknown };
    if (typeof b.on !== "boolean") return json(res, 400, { error: "bad_lever" });
    setWant(b.on);
    st.audit(user.id, b.on ? "survivorz.stream.go_live" : "survivorz.stream.stop");
    json(res, 200, { want: wantAt() > 0 });
  });

  /** "No stream is expected": quiets the check after a rig was stopped without saying so. Audited. */
  router.post("/api/admin/survivorz/stream/expected", "admin", ({ res, body, store: st, user }) => {
    // (true or false and nothing else: "true", 1 or no body at all used to read as OFF and stopped a stream
    // that was wanted: the re-grade)
    const asked = (body as { on?: unknown } | null | undefined)?.on;
    if (typeof asked !== "boolean") return json(res, 400, { error: "bad_lever" });
    const on = asked;
    if (on) st.kvSet(KV_EXPECTED, "1"); else { st.kvDel(KV_EXPECTED); setWant(false); }
    st.audit(user.id, on ? "survivorz.stream.expected" : "survivorz.stream.not_expected");
    json(res, 200, { expected: on });
  });

  // ---- the health check: red reaches Sterling (only on a box that has a stream rig) ----
  if (streamTokenConfigured()) {
    registerHealthCheck("Survivorz stream", () => {
      const wanted = wantAt();
      // asked to go live and still standing by after the grace: the rig can't start the page
      if (wanted && beat?.idle && Date.now() - beat.at <= STALE_MS && Date.now() - wanted > WANT_GRACE_MS)
        return { ok: false, detail: `a stream was asked for ${Math.round((Date.now() - wanted) / 60_000)} min ago but the rig is still standing by` };
      if (wanted && !beat && Date.now() - Math.max(bootAt, wanted) > BOOT_GRACE_MS)
        return { ok: false, detail: "a stream is wanted but the rig isn't checking in — is the Solace Survivorz Stream task running on the workstation?" };
      if (!expected()) return { ok: true, detail: beat?.idle && Date.now() - beat.at <= STALE_MS ? "the stream rig is standing by" : "no stream run expected" };
      if (!beat) {
        return Date.now() - bootAt < BOOT_GRACE_MS
          ? { ok: true, detail: "waiting for the stream rig to check in" }
          : { ok: false, detail: "a stream run is expected but the rig hasn't checked in since this boot — is the Solace Survivorz Stream task running on the workstation?" };
      }
      const age = Date.now() - beat.at;
      if (age > STALE_MS) return { ok: false, detail: `the stream rig's last check-in was ${Math.round(age / 60_000)} min ago` };
      if (beat.problem) return { ok: false, detail: `the stream rig reports: ${beat.problem}` };
      return { ok: true, detail: `last check-in ${Math.round(age / 1000)}s ago · ${beat.fps ?? "?"} fps · RTMP ${beat.rtmp} · recording ${beat.recording} · ${beat.restarts} restart(s)` };
    });
  }

  return { beat: () => beat, configured: streamTokenConfigured, setWant };
}
