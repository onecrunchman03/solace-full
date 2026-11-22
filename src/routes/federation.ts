// FEDERATION F1 routes (FEDERATION.md is the design authority).
//
// Registration is public-but-keyed: the daemon has no session, so the route
// takes the admin-minted provisioning key, rate-limited per IP like login.
// Everything else is ADMIN-only — minting keys, delisting, the registry and
// its event ledger. Satellite provisioning was admin-only from the first
// design ("a security key must be generated and given to someone").
import { createPublicKey, verify as edVerify } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config";
import { UPDATE_TOKEN_TTL_MS, updatePayload } from "../federation/protocol";
import { clientIp, json, makeRateLimiter, type Router } from "../http";
import type { Store } from "../db/store";
import { networkOf } from "../auth";
import { connectedSatelliteIds, dropSatelliteLink } from "../federation/link";
import { ensureSatellitePage } from "../federation/community";
import { disposeAttachmentFiles } from "../federation/files";
import { toPublicUser } from "../types";
import { HOSTING_VERSION, LEGAL_URLS } from "../legal";

const limiter = makeRateLimiter();
const KEY_SHAPE = /^[A-Z2-9]{20}$/;
const DEFAULT_TTL_HOURS = 72;

function normName(raw: unknown): string {
  return String(raw ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

/** A pubkey is accepted only if node:crypto parses it as an Ed25519 SPKI PEM
 *  — anything else could not verify a handshake and would only rot in the
 *  registry. */
function validPubkey(raw: unknown): string | null {
  const pem = String(raw ?? "");
  if (pem.length > 400 || !pem.includes("PUBLIC KEY")) return null;
  try {
    const key = createPublicKey(pem);
    if (key.asymmetricKeyType !== "ed25519") return null;
    return pem;
  } catch {
    return null;
  }
}

export function registerFederationRoutes(router: Router): void {
  // ---- The daemon's one public door -----------------------------------------
  router.post("/api/satellite/register", "none", ({ req, res, body, store, bus }) => {
    const ip = clientIp(req); // the right-most XFF hop — the one Caddy saw
    if (!limiter(`satreg:${ip}`, 10, 10 * 60_000)) return json(res, 429, { error: "rate_limited" });
    const code = String(body.key ?? "").trim().toUpperCase();
    const name = normName(body.name) || "Unnamed community";
    const pubkey = validPubkey(body.pubkey);
    const version = String(body.version ?? "").slice(0, 20);
    if (!KEY_SHAPE.test(code)) return json(res, 403, { error: "invalid_key" });
    if (!pubkey) return json(res, 400, { error: "bad_pubkey" });
    // F8: the Linux wizard asks privacy up front — whitelisted here, parked
    // on the row, honoured when the page auto-creates on first connect.
    // Absent (every Windows-app registration) = the open defaults.
    const pageJoinPolicy = body.joinPolicy === "open" || body.joinPolicy === "request" || body.joinPolicy === "invite"
      ? body.joinPolicy : null;
    const pageDiscoverable = typeof body.discoverable === "boolean" ? body.discoverable : null;
    // THE HOST AGREEMENT (Sep 2026): hosting a community makes you its
    // operator, and the hub records that you agreed to that. Either the
    // register call says so (the app's checkbox, the CLI's flag) or the
    // acceptance is already on the key (the Ubuntu wizard's up-front call).
    // Checked BEFORE the redemption so a refusal never burns the key.
    // The key's stored acceptance must be of the version NOW in force — a key
    // accepted under v1 must not stamp a v2 agreement (Sep 2026 review).
    const hostingAccepted = body.acceptHosting === true || store.keyHostingAccepted(code) === HOSTING_VERSION;
    if (!hostingAccepted) {
      return json(res, 400, {
        error: "hosting_agreement_required",
        message: `read ${LEGAL_URLS.hosting} and register again with the agreement accepted`,
        url: LEGAL_URLS.hosting, version: HOSTING_VERSION,
      });
    }
    const made = store.redeemSatelliteKey({
      code, name, pubkey, version, network: ip ? networkOf(ip) : null, pageJoinPolicy, pageDiscoverable,
    });
    if (!made) {
      store.recordSatelliteEvent("register_refused", null, ip, "invalid/used/expired key");
      return json(res, 403, { error: "invalid_key" });
    }
    store.stampSatelliteHosting(made.satelliteId, HOSTING_VERSION, ip || null);
    const owner = store.getUserById(made.ownerUserId);
    // F3 ROTATION: the same door, a different key — the redemption already
    // replaced the stored pubkey atomically. Any link still held by the OLD
    // identity dies now; its next handshake fails the fresh pubkey.
    if (made.rotated) {
      dropSatelliteLink(made.satelliteId);
      store.recordSatelliteEvent("rotated", made.satelliteId, ip, name);
      bus.emit("satellite.event", {
        kind: "rotated", satelliteId: made.satelliteId, name,
        detail: `identity rotated from ${ip || "unknown"} — the old key is dead`,
      });
      return json(res, 200, { ok: true, satelliteId: made.satelliteId });
    }
    store.recordSatelliteEvent("registered", made.satelliteId, ip, name);
    bus.emit("satellite.event", {
      kind: "registered", satelliteId: made.satelliteId, name,
      detail: `owned by ${owner?.displayName ?? `user ${made.ownerUserId}`}, registered from ${ip || "unknown"}`,
    });
    json(res, 200, { ok: true, satelliteId: made.satelliteId });
  });

  // ---- The Host Agreement, accepted against a key ------------------------------
  // The Ubuntu wizard asks the question and calls this BEFORE the daemon
  // registers, so the acceptance is on file whichever daemon version makes
  // the register call. Key-gated like the bundle download (peeked, never
  // burned): only someone holding a live key can accept on its behalf.
  router.post("/api/satellite/accept-hosting", "none", ({ req, res, body, store }) => {
    const ip = clientIp(req);
    if (!limiter(`sataccept:${ip}`, 20, 10 * 60_000)) return json(res, 429, { error: "rate_limited" });
    const code = String(body.key ?? "").trim().toUpperCase();
    const version = Number(body.version);
    if (!KEY_SHAPE.test(code)) return json(res, 403, { error: "invalid_key" });
    if (version !== HOSTING_VERSION) return json(res, 400, { error: "stale_version", current: HOSTING_VERSION });
    if (!store.acceptHostingForKey(code, HOSTING_VERSION, ip || null)) return json(res, 403, { error: "invalid_key" });
    json(res, 200, { ok: true, version: HOSTING_VERSION });
  });

  // ---- The member-only installer download ----------------------------------
  // Josh: "i only want users who already have an account and logged in to be
  // able to download the app" — so the installer left the public /desktop/
  // dir and streams from here behind ordinary session auth instead. The
  // client fetches it with the header-auth Blob pattern (an <a download>
  // can't carry a bearer token, and query-token auth stays restricted to
  // /ws + the exit beacon — a shareable ?token= link would BE the session).
  router.get("/api/satellite/app", "user", ({ res }) => {
    let size: number;
    try {
      const stat = fs.statSync(config.satelliteAppPath);
      if (!stat.isFile()) throw new Error("not a file");
      size = stat.size;
    } catch {
      return json(res, 404, { error: "not_available" });
    }
    res.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-length": size,
      "content-disposition": 'attachment; filename="Solace-Satellite-Setup.exe"',
      "cache-control": "no-store",
    });
    fs.createReadStream(config.satelliteAppPath).pipe(res);
  });

  // ---- The Ubuntu CLI (F8) --------------------------------------------------
  // Josh: "a cli application that a ubuntu host can perform a remote request
  // to and it runs an automated setup" — one line on the host's box:
  //   curl -fsSL https://solace.zone/api/satellite/install.sh | sudo bash -s -- --key <KEY> --name "My Place"
  // The SCRIPT is public (instructions, useless without a key — and keeping
  // it under /api spares the Caddyfile a new prefix). The BUNDLE is gated on
  // a VALID provisioning key: checked with peekSatelliteKey, never burned —
  // registration is what spends the single use. Member-only spirit intact:
  // the key IS the admin's invitation, and a server has no browser session.
  router.get("/api/satellite/install.sh", "none", ({ req, res }) => {
    const ip = clientIp(req);
    if (!limiter(`satsh:${ip}`, 30, 10 * 60_000)) return json(res, 429, { error: "rate_limited" });
    let script: string;
    try {
      script = fs.readFileSync(config.satelliteInstallScript, "utf8");
    } catch {
      return json(res, 404, { error: "not_available" });
    }
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    res.end(script);
  });

  router.post("/api/satellite/app-linux", "none", ({ req, res, body, store }) => {
    const ip = clientIp(req);
    if (!limiter(`satdl:${ip}`, 10, 10 * 60_000)) return json(res, 429, { error: "rate_limited" });
    // Two doors: a fresh install presents the provisioning key; an UPGRADE
    // presents an identity-signed update token (the F4 machine door) so
    // re-running the installer never needs a second single-use key.
    const tok = String(body.tok ?? "");
    const viaTok = tok !== "" && verifyUpdateToken(store, tok) != null;
    const code = String(body.key ?? "").trim().toUpperCase();
    if (!viaTok && (!KEY_SHAPE.test(code) || !store.peekSatelliteKey(code))) {
      store.recordSatelliteEvent("register_refused", null, ip, "linux bundle: invalid/used/expired key");
      return json(res, 403, { error: "invalid_key" });
    }
    let size: number;
    try {
      const stat = fs.statSync(config.satelliteLinuxPath);
      if (!stat.isFile()) throw new Error("not a file");
      size = stat.size;
    } catch {
      return json(res, 404, { error: "not_available" });
    }
    res.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-length": size,
      "content-disposition": 'attachment; filename="satellite-linux-x64.tar.gz"',
      "cache-control": "no-store",
    });
    fs.createReadStream(config.satelliteLinuxPath).pipe(res);
  });

  // ---- AUTO-UPDATE (F4) -----------------------------------------------------
  // The app updates itself from the hub — but the installer is MEMBER-gated
  // for humans, so the machine door authenticates with the satellite's own
  // identity: a short-lived token signed by the host's private key, verified
  // against the registered pubkey. Delisted satellites don't update; nobody
  // without a registered identity gets a byte. The manifest + signed package
  // live beside the installer in the unserved satellite-dist dir.
  const verifyUpdateToken = (store: { getSatellite: Store["getSatellite"] }, tok: string): number | null => {
    const m = /^(\d+)\.(\d+)\.([A-Za-z0-9_-]+)$/.exec(tok);
    if (!m) return null;
    const satId = Number(m[1]);
    const ts = Number(m[2]);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > UPDATE_TOKEN_TTL_MS) return null;
    const sat = store.getSatellite(satId);
    if (!sat || sat.status !== "active") return null;
    try {
      if (!edVerify(
        null,
        Buffer.from(updatePayload(satId, ts)),
        createPublicKey(sat.pubkey),
        Buffer.from(m[3], "base64url"),
      )) return null;
    } catch {
      return null;
    }
    return satId;
  };
  const updateDir = path.dirname(config.satelliteAppPath);

  router.get("/api/satellite/update/latest", "none", ({ res, url, store }) => {
    const tok = url.searchParams.get("tok") ?? "";
    if (verifyUpdateToken(store, tok) == null) return json(res, 403, { error: "forbidden" });
    let manifest: { platforms?: Record<string, { url?: string }> };
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(updateDir, "satellite-latest.json"), "utf8"));
    } catch {
      return json(res, 404, { error: "not_available" });
    }
    // The package rides the same token (its TTL covers the download).
    for (const p of Object.values(manifest.platforms ?? {})) {
      if (p.url) p.url = `${p.url}${p.url.includes("?") ? "&" : "?"}tok=${encodeURIComponent(tok)}`;
    }
    json(res, 200, manifest);
  });

  router.get("/api/satellite/update/pkg", "none", ({ res, url, store }) => {
    const tok = url.searchParams.get("tok") ?? "";
    if (verifyUpdateToken(store, tok) == null) return json(res, 403, { error: "forbidden" });
    const pkg = path.join(updateDir, "Solace-Satellite-Update.exe");
    let size: number;
    try {
      const stat = fs.statSync(pkg);
      if (!stat.isFile()) throw new Error("not a file");
      size = stat.size;
    } catch {
      return json(res, 404, { error: "not_available" });
    }
    res.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-length": size,
      "cache-control": "no-store",
    });
    fs.createReadStream(pkg).pipe(res);
  });

  // ---- The admin's registry -------------------------------------------------
  router.get("/api/admin/satellites", "admin", ({ res, store }) => {
    const connected = new Set(connectedSatelliteIds());
    const hydrate = (userId: number) => {
      const u = store.getUserById(userId);
      return u ? toPublicUser(u) : null;
    };
    json(res, 200, {
      satellites: store.listSatellites().map((s) => {
        const page = store.pageForSatellite(s!.id);
        return {
          ...s, connected: connected.has(s!.id), owner: hydrate(s!.ownerUserId),
          pageId: page?.id ?? null, pageName: page?.name ?? null,
          // Open reports pointing into this community — the number that
          // belongs next to the delist switch.
          openReports: store.openReportsForSatellite(s!.id, page?.id ?? null),
        };
      }),
      keys: store.listSatelliteKeys().map((k) => ({ ...k, owner: hydrate(k.ownerUserId) })),
      events: store.satelliteEvents(100),
      errorCount: store.satelliteErrorsUnfixed().length,
      now: Date.now(),
    });
  });

  // ---- The error ledger (F6): Josh's weekly/monthly processing loop ---------
  // Export every UNFIXED signature as plain ASCII text (the weekly-report
  // Notepad rule) → paste it into a session for fixing → mark processed.
  // Fixed signatures stay remembered (no redundant work) and reopen only if
  // the same error recurs after the fix.
  router.get("/api/admin/satellites/errors/export", "admin", ({ res, store }) => {
    const rows = store.satelliteErrorsUnfixed();
    // What this download covered: "Mark all processed" marks only rows last
    // seen by now, never one that arrived after (Oct 2026 review).
    store.kvSet("sat_err_exported_at", String(Date.now()));
    // eslint-disable-next-line no-control-regex
    const oneLine = (s: string): string => s.replace(/[\x00-\x1f\x7f]+/g, " ");
    const nameOf = new Map(store.listSatellites().map((s) => [s!.id, s!.name]));
    const lines: string[] = [
      "SOLACE SATELLITE ERROR REPORT",
      `generated ${new Date().toISOString()} - ${rows.length} unfixed signature(s)`,
      "after these are processed and fixed, press \"Mark all processed\" in Admin Panel -> Satellites.",
      "",
    ];
    let lastSat = -1;
    for (const r of rows) {
      if (r.satelliteId !== lastSat) {
        lastSat = r.satelliteId;
        lines.push(`== ${nameOf.get(r.satelliteId) ?? "?"} (#${r.satelliteId}) ==`);
      }
      lines.push(
        `[${oneLine(r.kind)}] x${r.count}  first ${new Date(r.firstSeenAt).toISOString()}  last ${new Date(r.lastSeenAt).toISOString()}` +
        (r.fixedAt != null ? "  RECURRED AFTER FIX" : ""),
      );
      lines.push(`  | ${oneLine(r.message)}`);
    }
    if (!rows.length) lines.push("(nothing new - every known error is marked processed)");
    // eslint-disable-next-line no-control-regex
    const body = lines.join("\n").normalize("NFKD").replace(/[^\x0A\x20-\x7e]/g, "?");
    res.writeHead(200, {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="satellite-errors-${new Date().toISOString().slice(0, 10)}.txt"`,
    });
    res.end(body);
  });

  router.post("/api/admin/satellites/errors/processed", "admin", ({ res, user, store }) => {
    const fixed = store.markSatelliteErrorsFixed();
    store.audit(user.id, "satellite.errors", `marked ${fixed} error signature(s) processed`);
    json(res, 200, { ok: true, fixed });
  });

  // ---- Bind a community page to a satellite (F2/F4) -------------------------
  // One page per satellite in v1 — "a satellite = a remotely-backed page".
  // The satellite's OWNER becomes the page's manager (their community); a
  // lobby channel comes with it. Since F4 the page normally AUTO-creates on
  // the satellite's first connect (ensureSatellitePage in link.ts); this
  // route covers a custom-named early bind and pre-F4 satellites.
  router.post("/api/admin/satellites/:id/page", "admin", ({ res, params, body, user, store, bus }) => {
    const sat = store.getSatellite(Number(params.id));
    if (!sat) return json(res, 404, { error: "no_satellite" });
    if (sat.status !== "active") return json(res, 409, { error: "delisted" });
    if (store.pageForSatellite(sat.id)) return json(res, 409, { error: "page_exists" });
    const name = normName(body.name);
    if (!name) return json(res, 400, { error: "bad_name" });
    const policy = body.joinPolicy === "open" || body.joinPolicy === "invite" ? body.joinPolicy : "request";
    const description = body.description ? String(body.description).replace(/[\r\n]+/g, " ").trim().slice(0, 240) : null;
    const made = ensureSatellitePage(store, bus, sat.id, {
      name, description, joinPolicy: policy,
      discoverable: body.discoverable !== undefined ? !!body.discoverable : true,
    });
    if (!made?.created) return json(res, 409, { error: "page_exists" });
    store.audit(user.id, "satellite.page", `bound page ${made.page.id} "${name}" to ${sat.name} (#${sat.id})`);
    json(res, 200, { page: made.page, channel: store.getChannel(made.page.defaultChannelId!) });
  });

  router.post("/api/admin/satellites/keys", "admin", ({ res, body, user, store }) => {
    // F3: `satelliteId` set = a ROTATION key for that satellite (the
    // lost/compromised-box flow). Its owner stays the satellite's owner —
    // rotation moves the machine, never the person who answers for it.
    let rotates: { id: number; ownerUserId: number; name: string } | null = null;
    if (body.satelliteId != null) {
      const sat = store.getSatellite(Number(body.satelliteId));
      if (!sat) return json(res, 404, { error: "no_satellite" });
      if (sat.status !== "active") return json(res, 409, { error: "delisted" });
      rotates = { id: sat.id, ownerUserId: sat.ownerUserId, name: sat.name };
    }
    const owner = store.getUserById(rotates ? rotates.ownerUserId : Number(body.ownerUserId));
    if (!owner || owner.deletedAt) return json(res, 404, { error: "no_user" });
    if (owner.isBot) return json(res, 403, { error: "cannot_touch_bot" });
    const ttlHours = Math.min(24 * 14, Math.max(1, Number(body.ttlHours) || DEFAULT_TTL_HOURS));
    const note = body.note ? String(body.note).slice(0, 120) : null;
    const minted = store.mintSatelliteKey({
      ownerUserId: owner.id, note, createdBy: user.id, ttlMs: ttlHours * 3_600_000,
      rotatesSatelliteId: rotates?.id ?? null,
    });
    const what = rotates ? `rotation key for ${rotates.name} (#${rotates.id})` : `for ${owner.username}`;
    store.recordSatelliteEvent("key_minted", rotates?.id ?? null, null, `${what} by ${user.username}`);
    store.audit(user.id, "satellite.key", `minted ${what} (${ttlHours}h)`);
    // The cleartext code exists only in this response — hand it over safely.
    json(res, 200, { ok: true, id: minted.id, code: minted.code, expiresAt: minted.expiresAt });
  });

  router.post("/api/admin/satellites/keys/:id/revoke", "admin", ({ res, params, user, store }) => {
    if (!store.revokeSatelliteKey(Number(params.id))) return json(res, 404, { error: "no_key" });
    store.recordSatelliteEvent("key_revoked", null, null, `key ${params.id} by ${user.username}`);
    store.audit(user.id, "satellite.key", `revoked key ${params.id}`);
    json(res, 200, { ok: true });
  });

  // The kill switch: status flips first, then the live link is cut — a
  // reconnect races nothing (the handshake reads the fresh status).
  router.post("/api/admin/satellites/:id/delist", "admin", ({ res, params, user, store, bus }) => {
    const sat = store.getSatellite(Number(params.id));
    if (!sat) return json(res, 404, { error: "no_satellite" });
    store.setSatelliteStatus(sat.id, "revoked");
    dropSatelliteLink(sat.id);
    // THE PAGE GOES WITH IT (Oct 2026 review). The page-delete route sends
    // admins here for a satellite's page, and this route never touched it,
    // so a delisted community stayed in every picker, open and joinable,
    // with no way left to remove it. Reinstating re-creates it on the next
    // handshake (ensureSatellitePage); the host's history stays on the host.
    const page = store.pageForSatellite(sat.id);
    if (page) {
      const members = store.pageMembers(page.id).map((m) => m.userId);
      const chanIds = store.listChannels().filter((c) => c.pageId === page.id).map((c) => c.id);
      const files = store.purgeAttachmentsForChannels(chanIds);
      const r = store.deletePage(page.id);
      if (r.ok) {
        disposeAttachmentFiles(files);
        bus.emit("page.gone", { pageId: page.id, members, tellAll: page.isPublic || page.discoverable });
      }
    }
    store.recordSatelliteEvent("delisted", sat.id, null, `by ${user.username}`);
    store.audit(user.id, "satellite.delist", `${sat.name} (#${sat.id})`);
    json(res, 200, { ok: true });
  });

  router.post("/api/admin/satellites/:id/reinstate", "admin", ({ res, params, user, store }) => {
    const sat = store.getSatellite(Number(params.id));
    if (!sat) return json(res, 404, { error: "no_satellite" });
    store.setSatelliteStatus(sat.id, "active");
    store.recordSatelliteEvent("reinstated", sat.id, null, `by ${user.username}`);
    store.audit(user.id, "satellite.reinstate", `${sat.name} (#${sat.id})`);
    json(res, 200, { ok: true });
  });
}
