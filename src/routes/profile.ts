import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { bearer, json, readRawBody, clientIp, userAgent, makeRateLimiter, type Router } from "../http";

// Every upload door here is per-user rate-limited (Sep 2026 review): the
// routes are authenticated but a member could fire hundreds of multi-MB
// uploads a minute. Thirty per ten minutes is a busy afternoon of avatar
// fiddling, not a disk-filling loop.
const uploadLimiter = makeRateLimiter();
export const UPLOADS_PER_WINDOW = 30;
export const UPLOAD_WINDOW_MS = 10 * 60_000;
export const uploadAllowed = (userId: number): boolean =>
  uploadLimiter(`upload:${userId}`, UPLOADS_PER_WINDOW, UPLOAD_WINDOW_MS);
import { config } from "../config";
import { PURCHASABLE_THEMES } from "../emporium";
import { toPublicUser, toSelfUser, type UserPrefs, MAX_DISPLAY_NAME } from "../types";
import { hashPassword, validatePassword, verifyPassword, verifySecret, networkOf } from "../auth";
import { checkStats, resolveAchievements } from "../achievements";

const AVATAR_DIR = path.join(config.uploadsDir, "avatars");
const MAX_AVATAR_BYTES = 2_000_000; // 2 MB
const MAX_NAME = MAX_DISPLAY_NAME;
const MAX_BIO = 500;

// Whitelists for the client-preference values a user may store. The server is
// authoritative — an unknown theme/font never reaches the DB. Base themes are
// free; Emporium themes additionally require OWNERSHIP (checked in the route).
export const THEMES = ["cozy", "chill", "shrub"] as const;
export const FONTS = ["inter", "serif", "mono", "hand"] as const;
/** Rebindable in-app actions (Settings → Voice & Controls). The two push-*
 *  actions are HOLD binds (keydown engages, keyup releases). */
export const KEYBIND_ACTIONS = ["mute", "deafen", "search", "goChat", "goDms", "goRumble", "pushToTalk", "pushToMute"];
const SAFE_FILE = /^[A-Za-z0-9._-]+$/;
const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

/**
 * Sniff an image's real type from its magic bytes and return the canonical file
 * extension, or null if it isn't an image type we accept. We trust the bytes,
 * not the client-sent Content-Type, so a mislabelled or hostile upload can't
 * smuggle a different file type onto disk.
 */
function sniffExt(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return ".png";
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return ".jpg";
  // GIF: "GIF8"
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return ".gif";
  // WEBP: "RIFF"…"WEBP"
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return ".webp";
  return null;
}

/** Remove a previously-stored avatar file (best effort; ignores absence). */
export function deleteAvatarFile(name: string | null): void {
  if (!name || !SAFE_FILE.test(name)) return;
  const p = path.join(AVATAR_DIR, name);
  if (p.startsWith(AVATAR_DIR)) fs.rm(p, { force: true }, () => {});
}

// ---- Custom uploads (migration 46): banner image + voice sounds ------------

const BANNER_DIR = path.join(config.uploadsDir, "banners");
const SOUND_DIR = path.join(config.uploadsDir, "sounds");
const MAX_BANNER_BYTES = 4_000_000; // 4 MB
const MAX_SOUND_BYTES = 400_000; // ~400 KB ≈ a few seconds of MP3/OGG
// Board slots retired in migration 73 — pads live in the shared board_sounds
// library now (routes below); only the personal enter/leave sounds remain.
const SOUND_SLOTS = ["enter", "leave"] as const;
const MAX_BOARD_PER_USER = 8;
const SOUND_MIME: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
};

/** Sniff an audio upload's real type (MP3 / OGG / WAV). Bytes, not labels. */
function sniffAudioExt(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // MP3: "ID3" tag, or a bare MPEG frame sync (FF Ex/Fx)
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return ".mp3";
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return ".mp3";
  // OGG: "OggS"
  if (buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) return ".ogg";
  // WAV: "RIFF"…"WAVE"
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x41 && buf[10] === 0x56 && buf[11] === 0x45
  ) return ".wav";
  return null;
}

function deleteUploadFile(dir: string, name: string | null): void {
  if (!name || !SAFE_FILE.test(name)) return;
  const p = path.join(dir, name);
  if (p.startsWith(dir)) fs.rm(p, { force: true }, () => {});
}

/** Unlink every upload a scrub returned (avatar handled separately for
 *  historic reasons). Both delete paths — admin and self — call this. */
export function deleteScrubbedUploads(r: { banner: string | null; sounds: string[] }): void {
  deleteUploadFile(BANNER_DIR, r.banner);
  for (const f of r.sounds) deleteUploadFile(SOUND_DIR, f);
}

/**
 * Profile + avatar routes: viewing anyone's public profile (with their emoji
 * inventory), editing your own display name / about-me, and uploading or
 * clearing your avatar image.
 */
export function registerProfileRoutes(router: Router, onExit?: (userId: number) => void): void {
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
  fs.mkdirSync(BANNER_DIR, { recursive: true });
  fs.mkdirSync(SOUND_DIR, { recursive: true });

  // Public profile for any user: identity, about-me, and their collection.
  router.get("/api/users/:id/profile", "user", ({ res, params, store }) => {
    const id = Number(params.id);
    if (!Number.isInteger(id)) return json(res, 400, { error: "bad_id" });
    const target = store.getUserById(id);
    if (!target) return json(res, 404, { error: "user_not_found" });
    // Achievements self-heal on every profile view (idempotent, a dozen
    // indexed counts), then ship fully resolved: earned dates, live
    // progress on locked stat badges, unearned secrets absent.
    try {
      checkStats(id);
    } catch {
      /* a badge hiccup never hides a profile */
    }
    json(res, 200, {
      user: toPublicUser(target),
      bio: target.bio,
      inventory: store.getInventory(id),
      count: store.inventoryCount(id),
      achievements: target.isBot ? [] : resolveAchievements(id),
    });
  });

  // Edit your own editable profile fields (display name and/or about-me).
  router.patch("/api/me", "user", ({ res, body, user, store, bus }) => {
    // A profile edit broadcasts a full PublicUser to every socket (review
    // round 2) — a handful a minute is a person, more is a metronome.
    if (!uploadLimiter(`me:${user.id}`, 10, 60_000)) return json(res, 429, { error: "rate_limited" });
    const fields: { displayName?: string; bio?: string | null } = {};

    if (body?.displayName !== undefined) {
      const name = String(body.displayName).trim();
      if (name.length === 0 || name.length > MAX_NAME) {
        return json(res, 400, { error: "invalid_display_name" });
      }
      fields.displayName = name;
    }
    if (body?.bio !== undefined) {
      const bio = String(body.bio).trim();
      if (bio.length > MAX_BIO) return json(res, 400, { error: "bio_too_long" });
      fields.bio = bio.length ? bio : null; // empty clears it
    }

    const updated = store.updateProfile(user.id, fields);
    if (!updated) return json(res, 404, { error: "user_not_found" });
    bus.emit("user.update", { user: toPublicUser(updated) });
    json(res, 200, { user: toSelfUser(updated), bio: updated.bio });
  });

  // Update client preferences (theme / chat font). Values are whitelisted;
  // unknown keys are dropped. Merges over the existing prefs so setting one
  // key doesn't clobber the other.
  router.patch("/api/me/prefs", "user", ({ res, body, user, store }) => {
    const next: UserPrefs = { ...user.prefs };
    if (body?.theme !== undefined) {
      const theme = String(body.theme);
      const isBase = THEMES.includes(theme as (typeof THEMES)[number]);
      const isPurchasable = PURCHASABLE_THEMES.includes(theme);
      if (!isBase && !isPurchasable) return json(res, 400, { error: "bad_theme" });
      // Emporium themes are yours only once Sterling has your silver.
      if (isPurchasable && !store.ownsItem(user.id, `theme-${theme}`)) {
        return json(res, 403, { error: "theme_not_owned" });
      }
      next.theme = theme;
    }
    if (body?.font !== undefined) {
      const font = String(body.font);
      if (!FONTS.includes(font as (typeof FONTS)[number])) {
        return json(res, 400, { error: "bad_font" });
      }
      next.font = font;
    }
    if (body?.keybinds !== undefined) {
      // User-set keyboard shortcuts: known actions only, short combo strings.
      const raw = body.keybinds;
      if (raw === null) {
        delete next.keybinds;
      } else {
        if (typeof raw !== "object" || Array.isArray(raw)) return json(res, 400, { error: "bad_keybinds" });
        const clean: Record<string, string> = {};
        for (const [action, combo] of Object.entries(raw as Record<string, unknown>)) {
          if (!KEYBIND_ACTIONS.includes(action)) return json(res, 400, { error: "bad_keybinds" });
          if (typeof combo !== "string" || combo.length === 0 || combo.length > 40) {
            return json(res, 400, { error: "bad_keybinds" });
          }
          clean[action] = combo;
        }
        next.keybinds = clean;
      }
    }
    if (body?.uiScale !== undefined) {
      // UI zoom: bounded integer percent, or null to return to the default.
      if (body.uiScale === null) {
        delete next.uiScale;
      } else {
        const n = Number(body.uiScale);
        if (!Number.isInteger(n) || n < 80 || n > 150) return json(res, 400, { error: "bad_scale" });
        next.uiScale = n;
      }
    }
    if (body?.status !== undefined) {
      // Manual presence pick. "online" (or null) clears — only the non-default
      // states are worth storing.
      if (body.status === null || body.status === "online") {
        delete next.status;
      } else if (body.status === "away" || body.status === "busy") {
        next.status = body.status;
      } else {
        return json(res, 400, { error: "bad_status" });
      }
    }
    if (body?.voice !== undefined) {
      // Voice processing/mode prefs: booleans only, merged over what's stored.
      const raw = body.voice;
      if (raw === null) {
        delete next.voice;
      } else {
        if (typeof raw !== "object" || Array.isArray(raw)) return json(res, 400, { error: "bad_voice" });
        const v = raw as Record<string, unknown>;
        const clean = { ...(next.voice ?? {}) };
        if (v.neuralNS !== undefined) clean.neuralNS = v.neuralNS === true;
        if (v.ptt !== undefined) clean.ptt = v.ptt === true;
        next.voice = clean;
      }
    }
    if (body?.readReceipts !== undefined) {
      // READ RECEIPTS: a plain boolean; null returns to the default (on).
      if (body.readReceipts === null) delete next.readReceipts;
      else next.readReceipts = !!body.readReceipts;
    }
    if (body?.jukebox !== undefined) {
      // The casino jukebox, per listener: off entirely, and how loud. Follows
      // the account rather than the machine — someone who doesn't want the
      // music doesn't want it on their laptop either.
      const raw = body.jukebox;
      if (raw === null) {
        delete next.jukebox;
      } else {
        if (typeof raw !== "object" || Array.isArray(raw)) return json(res, 400, { error: "bad_jukebox" });
        const j = raw as Record<string, unknown>;
        const clean = { ...(next.jukebox ?? {}) };
        if (j.muted !== undefined) clean.muted = j.muted === true;
        if (j.volume !== undefined) {
          const v = Number(j.volume);
          if (!Number.isFinite(v) || v < 0 || v > 1) return json(res, 400, { error: "bad_jukebox" });
          clean.volume = Math.round(v * 100) / 100;
        }
        next.jukebox = clean;
      }
    }
    const updated = store.setPrefs(user.id, next);
    if (!updated) return json(res, 404, { error: "user_not_found" });
    json(res, 200, { prefs: updated.prefs });
  });

  // Change your password. Requires the current password (so a hijacked session
  // can't silently take over the account) and kills every other session.
  router.post("/api/me/password", "user", ({ req, res, url, body, user, store, bus }) => {
    // Rides the login lockout: a stolen session token must not turn this
    // into an unthrottled password oracle (each guess also burns scrypt CPU).
    const lockedUntil = store.loginLockedUntil(user.id);
    if (lockedUntil > Date.now()) {
      return json(res, 429, { error: "locked", retryAfter: Math.ceil((lockedUntil - Date.now()) / 1000) });
    }
    const current = String(body?.current ?? "");
    const next = String(body?.next ?? "");
    if (!verifyPassword(current, user.passwordHash)) {
      store.recordLoginFailure(user.id);
      return json(res, 403, { error: "wrong_password" });
    }
    store.clearLoginFailures(user.id);
    // The username screen applies here too, as at registration and the admin
    // reset; and the password must not become the recovery secret (Oct 2026).
    const pErr = validatePassword(next, user.username);
    if (pErr) return json(res, 400, { error: "bad_password", message: pErr });
    if (user.secretHash && verifySecret(next, user.secretHash)) {
      return json(res, 400, { error: "bad_password", message: "Your new password must differ from your recovery secret" });
    }

    store.setPassword(user.id, hashPassword(next));
    // Keep the session that made the change; log everything else out. Uses the
    // same token resolution as the router's auth (header OR ?token=).
    const token = bearer(req, url);
    if (token) store.deleteOtherSessions(user.id, token);
    // Every other device's sockets hang up; this one's session stands, so it
    // stays (the kick is session-aware — Oct 2026 review).
    bus.emit("user.kick", { userId: user.id });
    // On the sign-in ledger: a password change is a takeover credential
    // moving, and the Security panel treats it as one.
    const ip = clientIp(req);
    store.recordLoginEvent({
      userId: user.id, username: user.username, outcome: "password_changed",
      ip, network: networkOf(ip), ua: userAgent(req),
    });
    json(res, 200, { ok: true });
  });

  // Delete your own account (App Store guideline 5.1.1 requires self-service
  // deletion — and it's basic dignity). The same scrub as the admin tool:
  // identity anonymized, personal data wiped, emoji + coins burned, every
  // session killed. Password-confirmed so a hijacked open tab can't nuke an
  // account. Admins can't self-delete — the sole operator must survive.
  router.post("/api/me/delete", "user", ({ res, body, user, store, bus }) => {
    if (user.isAdmin) return json(res, 403, { error: "admin_untouchable" });
    // Same lockout as /api/login — no free password oracle (see /me/password).
    const lockedUntil = store.loginLockedUntil(user.id);
    if (lockedUntil > Date.now()) {
      return json(res, 429, { error: "locked", retryAfter: Math.ceil((lockedUntil - Date.now()) / 1000) });
    }
    if (!verifyPassword(String(body?.password ?? ""), user.passwordHash)) {
      store.recordLoginFailure(user.id);
      return json(res, 403, { error: "wrong_password" });
    }
    onExit?.(user.id); // stand up from every table BEFORE the escrow sweep (Sep 2026 review)
    const r = store.scrubUser(user.id);
    if (!r.ok) return json(res, 404, { error: "user_not_found" });
    if (r.avatar && /^[A-Za-z0-9._-]+$/.test(r.avatar)) {
      fs.promises.unlink(path.join(AVATAR_DIR, r.avatar)).catch(() => {});
    }
    deleteScrubbedUploads(r);
    bus.emit("user.kick", { userId: user.id }); // other devices/tabs drop now
    const updated = store.getUserById(user.id);
    if (updated) bus.emit("user.update", { user: toPublicUser(updated) });
    json(res, 200, { ok: true });
  });

  // Upload a new avatar (raw image bytes; type sniffed from magic bytes).
  router.postRaw("/api/me/avatar", "user", async ({ req, res, user, store, bus }) => {
    if (!uploadAllowed(user.id)) return json(res, 429, { error: "rate_limited" });
    let buf: Buffer;
    try {
      buf = await readRawBody(req, MAX_AVATAR_BYTES);
    } catch {
      return json(res, 413, { error: "file_too_large" });
    }
    if (buf.length === 0) return json(res, 400, { error: "empty" });

    const ext = sniffExt(buf);
    if (!ext) return json(res, 415, { error: "unsupported_type" });

    const name = `${randomUUID()}${ext}`;
    fs.writeFileSync(path.join(AVATAR_DIR, name), buf);

    // The swap returns what it replaced — `user.avatar` was read before the
    // body arrived, so parallel uploads orphaned every file but one.
    const previous = store.setAvatar(user.id, name);
    if (previous && previous !== name) deleteAvatarFile(previous);

    const updated = store.getUserById(user.id)!;
    bus.emit("user.update", { user: toPublicUser(updated) });
    json(res, 200, { avatar: name });
  });

  // Clear your avatar (revert to initials).
  router.del("/api/me/avatar", "user", ({ res, user, store, bus }) => {
    const previous = user.avatar;
    store.setAvatar(user.id, null);
    deleteAvatarFile(previous);
    const updated = store.getUserById(user.id)!;
    bus.emit("user.update", { user: toPublicUser(updated) });
    json(res, 200, { ok: true });
  });

  // Serve avatar image files. Public so <img> tags can load them.
  router.get("/avatars/:file", "none", ({ res, params }) => {
    const { file } = params;
    const ext = path.extname(file).toLowerCase();
    if (!SAFE_FILE.test(file) || !MIME[ext]) return json(res, 404, { error: "not_found" });
    const filePath = path.join(AVATAR_DIR, file);
    if (!filePath.startsWith(AVATAR_DIR) || !fs.existsSync(filePath)) {
      return json(res, 404, { error: "not_found" });
    }
    // UUID-named and never rewritten (a replacement mints a new name), so the
    // URL is immutable — same contract as attachments.
    res.writeHead(200, { "content-type": MIME[ext], "cache-control": "public, max-age=31536000, immutable" });
    fs.createReadStream(filePath).pipe(res);
  });

  // ---- Profile banner (uploaded image, replaces the Emporium banner items) --

  router.postRaw("/api/me/banner", "user", async ({ req, res, user, store, bus }) => {
    if (!uploadAllowed(user.id)) return json(res, 429, { error: "rate_limited" });
    let buf: Buffer;
    try {
      buf = await readRawBody(req, MAX_BANNER_BYTES);
    } catch {
      return json(res, 413, { error: "file_too_large" });
    }
    if (buf.length === 0) return json(res, 400, { error: "empty" });
    const ext = sniffExt(buf);
    if (!ext) return json(res, 415, { error: "unsupported_type" });

    const name = `${randomUUID()}${ext}`;
    fs.writeFileSync(path.join(BANNER_DIR, name), buf);
    const previous = store.setBanner(user.id, name); // atomic swap, see setAvatar
    if (previous && previous !== name) deleteUploadFile(BANNER_DIR, previous);
    const updated = store.getUserById(user.id)!;
    bus.emit("user.update", { user: toPublicUser(updated) });
    json(res, 200, { banner: name });
  });

  router.del("/api/me/banner", "user", ({ res, user, store, bus }) => {
    store.setBanner(user.id, null);
    deleteUploadFile(BANNER_DIR, user.banner);
    const updated = store.getUserById(user.id)!;
    bus.emit("user.update", { user: toPublicUser(updated) });
    json(res, 200, { ok: true });
  });

  router.get("/banners/:file", "none", ({ res, params }) => {
    const { file } = params;
    const ext = path.extname(file).toLowerCase();
    if (!SAFE_FILE.test(file) || !MIME[ext]) return json(res, 404, { error: "not_found" });
    const filePath = path.join(BANNER_DIR, file);
    if (!filePath.startsWith(BANNER_DIR) || !fs.existsSync(filePath)) {
      return json(res, 404, { error: "not_found" });
    }
    // UUID-named like avatars — immutable by construction.
    res.writeHead(200, { "content-type": MIME[ext], "cache-control": "public, max-age=31536000, immutable" });
    fs.createReadStream(filePath).pipe(res);
  });

  // ---- Custom voice sounds: enter, leave, and 3 soundboard slots ------------

  // My uploaded sounds, with their slot mapping (the cosmetics mirror loses
  // which board pad is which).
  router.get("/api/me/sounds", "user", ({ res, user, store }) => {
    json(res, 200, { sounds: store.userSounds(user.id) });
  });

  router.postRaw("/api/me/sounds/:slot", "user", async ({ req, res, url, params, user, store, bus }) => {
    const slot = params.slot;
    if (!(SOUND_SLOTS as readonly string[]).includes(slot)) return json(res, 400, { error: "bad_slot" });
    if (!uploadAllowed(user.id)) return json(res, 429, { error: "rate_limited" });
    let buf: Buffer;
    try {
      buf = await readRawBody(req, MAX_SOUND_BYTES);
    } catch {
      return json(res, 413, { error: "file_too_large" });
    }
    if (buf.length === 0) return json(res, 400, { error: "empty" });
    const ext = sniffAudioExt(buf);
    if (!ext) return json(res, 415, { error: "unsupported_type" });

    const label = (url.searchParams.get("name") ?? slot).replace(/[^\w\s.-]/g, "").slice(0, 32) || slot;
    const name = `${randomUUID()}${ext}`;
    fs.writeFileSync(path.join(SOUND_DIR, name), buf);
    const previous = store.setUserSound(user.id, slot, name, label, buf.length);
    if (previous && previous !== name) deleteUploadFile(SOUND_DIR, previous);
    const updated = store.getUserById(user.id)!;
    bus.emit("user.update", { user: toPublicUser(updated) });
    json(res, 200, { ok: true, slot, file: name, sounds: store.userSounds(user.id) });
  });

  router.del("/api/me/sounds/:slot", "user", ({ res, params, user, store, bus }) => {
    const slot = params.slot;
    if (!(SOUND_SLOTS as readonly string[]).includes(slot)) return json(res, 400, { error: "bad_slot" });
    const removed = store.deleteUserSound(user.id, slot);
    deleteUploadFile(SOUND_DIR, removed);
    const updated = store.getUserById(user.id)!;
    bus.emit("user.update", { user: toPublicUser(updated) });
    json(res, 200, { ok: true, sounds: store.userSounds(user.id) });
  });

  // ---- The house soundboard (migration 73) --------------------------------
  // One shared library: any member's upload is playable by everyone in a
  // voice room (the ws handler in realtime.ts). Adds are capped per user;
  // deletes are owner-or-staff.

  router.get("/api/soundboard", "user", ({ res, user, store }) => {
    json(res, 200, {
      sounds: store.boardLibrary(),
      max: MAX_BOARD_PER_USER,
      mine: store.boardCountFor(user.id),
    });
  });

  router.postRaw("/api/soundboard", "user", async ({ req, res, url, user, store, bus }) => {
    if (store.boardCountFor(user.id) >= MAX_BOARD_PER_USER) return json(res, 409, { error: "board_full" });
    if (!uploadAllowed(user.id)) return json(res, 429, { error: "rate_limited" });
    let buf: Buffer;
    try {
      buf = await readRawBody(req, MAX_SOUND_BYTES);
    } catch {
      return json(res, 413, { error: "file_too_large" });
    }
    if (buf.length === 0) return json(res, 400, { error: "empty" });
    const ext = sniffAudioExt(buf);
    if (!ext) return json(res, 415, { error: "unsupported_type" });
    const label = (url.searchParams.get("name") ?? "").replace(/[^\w\s.-]/g, "").trim().slice(0, 24);
    if (!label) return json(res, 400, { error: "bad_name" });
    // The pad glyph: a short free-text stamp (usually an emoji). Length-capped
    // only — it renders as text, never as markup.
    const emoji = (url.searchParams.get("emoji") ?? "").trim().slice(0, 8) || null;
    const name = `${randomUUID()}${ext}`;
    fs.writeFileSync(path.join(SOUND_DIR, name), buf);
    // The cap is enforced INSIDE the insert — the pre-check above ran before
    // the body was read, so parallel uploads all passed it.
    if (!store.addBoardSound(user.id, name, label, emoji, buf.length, MAX_BOARD_PER_USER)) {
      deleteUploadFile(SOUND_DIR, name);
      return json(res, 409, { error: "board_full" });
    }
    bus.emit("soundboard.change", {});
    json(res, 200, { ok: true, sounds: store.boardLibrary(), mine: store.boardCountFor(user.id) });
  });

  router.del("/api/soundboard/:id", "user", ({ res, params, user, store, bus }) => {
    const id = Number(params.id);
    if (!Number.isInteger(id)) return json(res, 400, { error: "bad_id" });
    const snd = store.boardSound(id);
    if (!snd) return json(res, 404, { error: "not_found" });
    const staff = user.isAdmin || user.role === "moderator";
    if (snd.ownerId !== user.id && !staff) return json(res, 403, { error: "not_yours" });
    store.deleteBoardSound(id);
    deleteUploadFile(SOUND_DIR, snd.file);
    bus.emit("soundboard.change", {});
    json(res, 200, { ok: true, sounds: store.boardLibrary(), mine: store.boardCountFor(user.id) });
  });

  router.get("/sounds/:file", "none", ({ res, params }) => {
    const { file } = params;
    const ext = path.extname(file).toLowerCase();
    if (!SAFE_FILE.test(file) || !SOUND_MIME[ext]) return json(res, 404, { error: "not_found" });
    const filePath = path.join(SOUND_DIR, file);
    if (!filePath.startsWith(SOUND_DIR) || !fs.existsSync(filePath)) {
      return json(res, 404, { error: "not_found" });
    }
    res.writeHead(200, { "content-type": SOUND_MIME[ext], "cache-control": "public, max-age=31536000, immutable" });
    fs.createReadStream(filePath).pipe(res);
  });
}
