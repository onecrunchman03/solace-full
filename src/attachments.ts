import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import type { Store } from "./db/store";
import { guardedTick } from "./health";
import type { AttachmentDTO } from "./types";
// Circular with federation/files (it imports ATTACH_DIR) — safe: both sides
// only dereference the other at CALL time, never during module load.
import { disposeAttachmentFiles, shipPendingRemoteFiles } from "./federation/files";

/**
 * Chat attachments: classification (magic-byte sniffing, animated detection,
 * strict-UTF-8 text validation), file storage, and the retention sweep.
 *
 * Retention model (locked with the user): attachment FILES expire on a tier
 * schedule — animated (GIF/animated-WebP/APNG) after ATTACH_ANIMATED_DAYS
 * (default 30), static images + text docs after ATTACH_STATIC_DAYS (default
 * 90) — while messages and attachment ROWS stay forever (the chat shows an
 * "expired" tile). Uploads that are never sent (orphans) are deleted outright
 * after an hour.
 */

export const ATTACH_DIR = path.join(config.uploadsDir, "attachments");

export const MAX_IMAGE_BYTES = 8_000_000; // post-client-downscale hard cap
export const MAX_TEXT_BYTES = 1_000_000;
export const MAX_PER_MESSAGE = 4;

const ORPHAN_MAX_AGE_MS = 60 * 60 * 1000;

/** Extensions we accept as plain-text documents (content is still validated). */
const TEXT_EXTS = new Set([".txt", ".md", ".log", ".csv"]);

export interface Classified {
  ext: string;
  kind: AttachmentDTO["kind"];
  mime: string;
}

/** APNG: an acTL chunk before the first IDAT chunk means animated. Walks the
 *  chunk list (Oct 2026 review) — a byte search found "IDAT" inside some
 *  earlier chunk's data and let an animated PNG pass as a still. */
function isApng(buf: Buffer): boolean {
  let off = 8;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("latin1", off + 4, off + 8);
    if (type === "acTL") return true;
    if (type === "IDAT" || type === "IEND") return false;
    off += 12 + len;
  }
  return false;
}

/** WebP VP8X header with the animation flag set. */
function isAnimatedWebp(buf: Buffer): boolean {
  // RIFF....WEBPVP8X + flags byte at offset 20, bit 0x02 = animation.
  return (
    buf.length > 20 &&
    buf[12] === 0x56 && buf[13] === 0x50 && buf[14] === 0x38 && buf[15] === 0x58 &&
    (buf[20] & 0x02) !== 0
  );
}

/**
 * Classify an upload from its real bytes (never the client Content-Type).
 * Images are sniffed by magic bytes; anything animated lands in the "gif"
 * retention tier. Text docs must have a whitelisted extension AND decode as
 * strict UTF-8 with no NUL bytes — they're stored/served as inert text/plain,
 * so no HTML/SVG/script can ever come back executable. Returns null when the
 * upload is nothing we accept (video, SVG, binaries…).
 */
export function classify(buf: Buffer, originalName: string): Classified | null {
  if (buf.length >= 12) {
    // PNG: 89 50 4E 47
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return { ext: ".png", kind: isApng(buf) ? "gif" : "image", mime: "image/png" };
    }
    // JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return { ext: ".jpg", kind: "image", mime: "image/jpeg" };
    }
    // GIF: "GIF8"
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
      return { ext: ".gif", kind: "gif", mime: "image/gif" };
    }
    // WEBP: "RIFF"…"WEBP"
    if (
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
    ) {
      return { ext: ".webp", kind: isAnimatedWebp(buf) ? "gif" : "image", mime: "image/webp" };
    }
  }
  // Plain-text documents: whitelisted extension + strict UTF-8, no NULs.
  const ext = path.extname(originalName).toLowerCase();
  if (TEXT_EXTS.has(ext)) {
    if (buf.includes(0)) return null;
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch {
      return null;
    }
    return { ext, kind: "text", mime: "text/plain" };
  }
  return null;
}

/** Strip anything path-like or hostile from a display filename. */
export function sanitizeName(raw: string, fallbackExt: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const clean = [...base].filter((c) => c.charCodeAt(0) > 31 && !':*?"<>|'.includes(c)).join("").trim().slice(0, 80);
  return clean || `file${fallbackExt}`;
}

/** Best-effort unlink of a stored attachment file. */
export function deleteAttachmentFile(file: string): void {
  if (!/^[A-Za-z0-9.-]+$/.test(file)) return;
  const p = path.join(ATTACH_DIR, file);
  if (p.startsWith(ATTACH_DIR)) fs.rm(p, { force: true }, () => {});
}

/** Run one sweep pass now: expire attached files past their retention tier
 *  (wherever each lives — hub disk or a satellite, F3), delete never-sent
 *  orphan uploads outright, and retry any remote transfers the link was
 *  down for. */
export function sweepAttachments(store: Store): void {
  const now = Date.now();
  // Per-page retention rides in DAYS (migration 89): the store applies each
  // page's own dials where set and these defaults everywhere else.
  const expired = store.sweepExpiredAttachments(now, config.attachAnimatedDays, config.attachStaticDays);
  const orphans = store.sweepOrphanAttachments(now, ORPHAN_MAX_AGE_MS);
  // MESSAGE RETENTION: pages with a message clock lose their old rows here,
  // files and all (the deleted-message rule — a purged row's image stops
  // being served the same hour).
  const aged = store.purgeOldMessages(now);
  disposeAttachmentFiles([...expired, ...aged.files]);
  for (const f of orphans) deleteAttachmentFile(f);
  shipPendingRemoteFiles(store);
  if (expired.length || orphans.length || aged.removed) {
    console.log(`[attachments] swept ${expired.length} expired + ${orphans.length} orphan file(s), ${aged.removed} aged message(s)`);
  }
}

/** Start the periodic retention sweep (also runs once at boot). */
export function startAttachmentSweep(store: Store): () => void {
  fs.mkdirSync(ATTACH_DIR, { recursive: true });
  sweepAttachments(store);
  const timer = setInterval(() => {
    guardedTick(store, "attachment sweep", config.attachSweepMs, () => sweepAttachments(store));
  }, config.attachSweepMs);
  return () => clearInterval(timer);
}
