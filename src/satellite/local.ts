// THE LOCAL CONTROL API — what the Solace Satellite desktop app talks to.
//
// Bound to 127.0.0.1 ONLY, and hardened against the one attack a localhost
// API actually faces: a hostile WEBSITE in the host's browser firing
// cross-origin requests at it (drive-by setup/probing). Two locks, either
// alone sufficient:
//   · any request carrying an Origin that isn't ours is refused — the
//     desktop app's webview and same-origin tools pass, web pages don't;
//   · every POST must carry the custom `x-sat-local` header, which a
//     cross-origin page cannot send without a CORS preflight we only
//     approve for OUR origins.
//
// CORS is answered for the ALLOWLIST only, and it has to be (found live:
// the app window showed "engine not responding"): the Tauri webview at
// http://tauri.localhost is cross-origin to 127.0.0.1, and Chromium's
// Private Network Access rule preflights every such request — no approved
// preflight, no fetch, even for GET. Approving exactly our origins (with
// Access-Control-Allow-Private-Network) lets the panel through while a
// hostile website's preflight still dies with no CORS headers at all.
import http from "node:http";
import os from "node:os";
import type { SatelliteStore } from "./store";

/** First non-internal IPv4 — the address a router forward should target. */
function lanIp(): string | null {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  return null;
}
import type { DaemonState, SatSettings } from "./main";
import { log } from "./main";

const OK_ORIGINS = new Set([
  "tauri://localhost", "http://tauri.localhost", "https://tauri.localhost",
]);
// EXACT host match, never a prefix: `http://localhost.evil.com` begins with
// "http://localhost" — a prefix check trusted any hostname an attacker
// registers under a lookalike domain, and with trust came the CORS approval
// AND the x-sat-local preflight, collapsing both locks at once.
const okOrigin = (o: string): boolean =>
  OK_ORIGINS.has(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);

export function startLocalApi(opts: {
  port: number;
  state: DaemonState;
  /** Getters, not references — the reset swaps the store live (F4). */
  content: () => SatelliteStore;
  settings: () => SatSettings;
  setSettings: (patch: Partial<SatSettings>) => SatSettings;
  /** `acceptHosting` is the app's Host Agreement checkbox — false is refused
   *  here AND by the hub, so an old panel can't register a host who never
   *  saw the agreement. */
  setup: (hub: string, key: string, name: string, acceptHosting: boolean) => Promise<void>;
  reset: () => void;
  updateToken: () => { hub: string; token: string } | null;
  /** Is the box's own SFU up right now (F5b)? Drives the panel's voice row. */
  voiceHosting: () => boolean;
  /** The SFU's own load numbers — Diagnostics' "handling the bandwidth" row. */
  voiceStats: () => import("./voicehost").VoiceStats | null;
  /** Latest resource sample (F6) — the Diagnostics tab. */
  diag: () => import("./diag").DiagSample | null;
  /** Where the community lives + the backup picture (F7). */
  storage: () => {
    contentDir: string; isCustom: boolean; backupDir: string | null;
    lastBackupAt: number | null; lastBackupError: string | null;
    moving: boolean; lastMoveError: string | null; storageError: string | null;
  };
  /** Relocate content.db + files/ — validates synchronously (throws), then
   *  copies in the BACKGROUND; the panel polls storage.moving/lastMoveError. */
  moveContent: (dir: string) => void;
  /** Run a backup right now; rejects no_backup_dir when none is set. */
  backupNow: () => Promise<{ at: number }>;
}): void {
  const { port, state, content } = opts;

  const server = http.createServer((req, res) => {
    const origin = String(req.headers.origin ?? "");
    // A same-origin GET carries no Origin, so a rebinding page (attacker
    // domain → 127.0.0.1) could read /api/status without one. The Host
    // header names where the browser THINKS it is — loopback or nothing
    // (Sep 2026 review).
    const host = String(req.headers.host ?? "");
    const okHost = host === `127.0.0.1:${port}` || host === `localhost:${port}` || host === `[::1]:${port}`;
    const trusted = okHost && (!origin || okOrigin(origin));
    const send = (code: number, body: unknown) => {
      const headers: Record<string, string> = { "content-type": "application/json" };
      // CORS approval is itself allowlist-gated — a hostile origin's JS
      // never gets to read a byte of any response.
      if (origin && trusted) headers["access-control-allow-origin"] = origin;
      res.writeHead(code, headers);
      res.end(JSON.stringify(body));
    };
    if (!trusted) return send(403, { error: "bad_origin" });

    // The PNA/CORS preflight — approved for our origins only.
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET, POST",
        "access-control-allow-headers": "content-type, x-sat-local",
        "access-control-allow-private-network": "true",
        "access-control-max-age": "600",
      });
      return res.end();
    }

    if (req.method === "GET" && req.url === "/api/status") {
      // The store can be legitimately away (mid-move swap, storage drive
      // unplugged) — the panel must still get a status frame saying so
      // rather than a dead poll.
      let counts: { messages: number; files: { count: number; bytes: number }; errorQueue: number };
      try {
        counts = { messages: content().count(), files: content().fileStats(), errorQueue: content().errorCount() };
      } catch {
        counts = { messages: 0, files: { count: 0, bytes: 0 }, errorQueue: 0 };
      }
      return send(200, {
        configured: state.configured,
        linked: state.linked,
        hub: state.hub,
        name: state.name,
        satelliteId: state.satelliteId,
        version: state.version,
        uptimeMs: Date.now() - state.startedAt,
        messages: counts.messages,
        files: counts.files,
        settings: opts.settings(),
        voiceHosting: opts.voiceHosting(),
        voiceStats: opts.voiceStats(),
        diag: opts.diag(),
        storage: opts.storage(),
        errorQueue: counts.errorQueue,
        // The Guide tab's "point the router at this PC" needs the PC's own
        // LAN address — the one thing a webview can't discover itself.
        lanIp: lanIp(),
        lastError: state.lastError,
        log: state.log.slice(-60),
      });
    }

    // AUTO-UPDATE (F4): a fresh identity-signed token for the hub's update
    // door. The panel hands it to the app's updater commands.
    if (req.method === "GET" && req.url === "/api/update-token") {
      const t = opts.updateToken();
      return t ? send(200, t) : send(409, { error: "not_configured" });
    }

    // The Settings card (F4): retention knobs, x-sat-local-guarded like setup.
    if (req.method === "POST" && req.url === "/api/settings") {
      if (req.headers["x-sat-local"] !== "1") return send(403, { error: "bad_origin" });
      let raw = "";
      req.on("data", (d) => { raw += d; if (raw.length > 1024) req.destroy(); });
      req.on("end", () => {
        try {
          const body = JSON.parse(raw) as Partial<SatSettings>;
          send(200, { ok: true, settings: opts.setSettings(body) });
        } catch (e) {
          send(400, { error: (e as Error).message === "bad_dir" ? "bad_dir" : "bad_settings" });
        }
      });
      return;
    }

    // THE RESET (F4): wipe identity + content, back to the setup form. The
    // panel confirms in its own UI; this door just demands the local header.
    if (req.method === "POST" && req.url === "/api/reset") {
      if (req.headers["x-sat-local"] !== "1") return send(403, { error: "bad_origin" });
      try {
        opts.reset();
        return send(200, { ok: true });
      } catch (e) {
        return send(500, { error: (e as Error).message || "reset_failed" });
      }
    }

    // THE STORAGE MOVE (F7): relocate the community to another folder/drive.
    // Validation answers on the spot; the copy runs in the background (a
    // big library was outliving the webview's fetch timeout and reporting a
    // move that later succeeded as failed). The panel polls storage.moving
    // and reads lastMoveError when it clears.
    if (req.method === "POST" && req.url === "/api/storage") {
      if (req.headers["x-sat-local"] !== "1") return send(403, { error: "bad_origin" });
      let raw = "";
      req.on("data", (d) => { raw += d; if (raw.length > 4096) req.destroy(); });
      req.on("end", () => {
        try {
          const body = JSON.parse(raw) as { contentDir?: string };
          const dir = String(body.contentDir ?? "");
          if (!dir) return send(400, { error: "bad_dir" });
          opts.moveContent(dir);
          send(200, { ok: true, started: true, storage: opts.storage() });
        } catch (e) {
          send(400, { error: (e as Error).message || "move_failed" });
        }
      });
      return;
    }

    // Back up now (F7). The daily clock runs regardless; this is the button.
    if (req.method === "POST" && req.url === "/api/backup") {
      if (req.headers["x-sat-local"] !== "1") return send(403, { error: "bad_origin" });
      opts.backupNow()
        .then((r) => send(200, { ok: true, at: r.at, storage: opts.storage() }))
        .catch((e) => send(400, { error: (e as Error).message || "backup_failed" }));
      return;
    }

    if (req.method === "POST" && req.url === "/api/setup") {
      if (req.headers["x-sat-local"] !== "1") return send(403, { error: "bad_origin" });
      let raw = "";
      req.on("data", (d) => { raw += d; if (raw.length > 4096) req.destroy(); });
      req.on("end", () => {
        void (async () => {
          try {
            const body = JSON.parse(raw) as { hub?: string; key?: string; name?: string; acceptHosting?: unknown };
            const hub = String(body.hub ?? "").trim();
            const key = String(body.key ?? "").trim();
            const name = String(body.name ?? "").trim().slice(0, 60) || "Unnamed community";
            if (!hub || !key) return send(400, { error: "missing_fields" });
            await opts.setup(hub, key, name, body.acceptHosting === true);
            send(200, { ok: true });
          } catch (e) {
            const why = (e as Error).message || "setup_failed";
            log(`setup failed: ${why}`);
            send(400, { error: why });
          }
        })();
      });
      return;
    }

    send(404, { error: "not_found" });
  });

  server.on("error", (err) => {
    // A second instance (or something else on the port) must fail LOUDLY —
    // a control panel silently talking to the wrong daemon is worse.
    console.error(`[satellite] local API failed to bind 127.0.0.1:${port}: ${(err as Error).message}`);
    process.exit(1);
  });
  server.listen(port, "127.0.0.1", () => log(`control panel API on 127.0.0.1:${port}`));
}
