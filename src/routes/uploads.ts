import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { json, readRawBody, clientIp, makeRateLimiter, type Router } from "../http";
import {
  ATTACH_DIR, MAX_IMAGE_BYTES, MAX_TEXT_BYTES, classify, sanitizeName, deleteAttachmentFile,
} from "../attachments";
import { relayRemoteFile } from "../federation/files";

const SAFE_FILE = /^[A-Za-z0-9.-]+$/;
const SERVE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".log": "text/plain; charset=utf-8",
  ".csv": "text/plain; charset=utf-8",
};

/** Parse an optional positive-int query param (image dimensions). */
function dim(raw: string | null): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n <= 20000 ? n : null;
}

/**
 * Chat-attachment upload + serving. Two-phase: an upload creates an
 * UNATTACHED row (the composer's staging tray); sending the message claims
 * it. The type is sniffed from magic bytes — never the client Content-Type —
 * and text docs are validated as strict UTF-8, stored inert as text/plain.
 */
export function registerUploadRoutes(router: Router): void {
  fs.mkdirSync(ATTACH_DIR, { recursive: true });
  const rateLimit = makeRateLimiter();

  // Upload one file (raw bytes; ?name= carries the original filename, and
  // ?w=&h= the client-measured image dimensions for layout placeholders).
  router.postRaw("/api/uploads", "user", async ({ req, res, url, user, store }) => {
    // Per USER (Oct 2026 review — keyed with the address it multiplied by
    // however many networks an account came from).
    if (!rateLimit(`upload:${user.id}`, 60, 60 * 60 * 1000)) {
      return json(res, 429, { error: "rate_limited" });
    }
    let buf: Buffer;
    try {
      buf = await readRawBody(req, MAX_IMAGE_BYTES);
    } catch {
      return json(res, 413, { error: "file_too_large" });
    }
    if (buf.length === 0) return json(res, 400, { error: "empty" });

    const rawName = url.searchParams.get("name") ?? "";
    const c = classify(buf, rawName);
    if (!c) return json(res, 415, { error: "unsupported_type" });
    if (c.kind === "text" && buf.length > MAX_TEXT_BYTES) {
      return json(res, 413, { error: "file_too_large" });
    }

    const file = `${randomUUID()}${c.ext}`;
    fs.writeFileSync(path.join(ATTACH_DIR, file), buf);
    const attachment = store.createAttachment({
      ownerId: user.id,
      file,
      // An image downloads under its SNIFFED extension, never whatever the
      // client named it (a PNG saved as page.html is a bad surprise).
      name: c.kind === "text" ? sanitizeName(rawName, c.ext) : sanitizeName(rawName, c.ext).replace(/.[^.]*$/, "").slice(0, 70) + c.ext,
      kind: c.kind,
      mime: c.mime,
      bytes: buf.length,
      width: c.kind === "text" ? null : dim(url.searchParams.get("w")),
      height: c.kind === "text" ? null : dim(url.searchParams.get("h")),
    });
    json(res, 200, { attachment });
  });

  // The composer's ✕ on a staged (not-yet-sent) upload. Owner + unattached only.
  router.del("/api/uploads/:id", "user", ({ res, params, user, store }) => {
    const id = Number(params.id);
    if (!Number.isInteger(id)) return json(res, 400, { error: "bad_id" });
    const file = store.deleteOrphanAttachment(id, user.id);
    if (!file) return json(res, 404, { error: "not_found" });
    deleteAttachmentFile(file);
    json(res, 200, { ok: true });
  });

  // Serve attachment files. Public (like /avatars) so <img> tags can load
  // them — the uuid filename is the capability. Immutable: a uuid's content
  // never changes, so browsers may cache it for a year.
  router.get("/attachments/:file", "none", async ({ req, res, params, store }) => {
    const { file } = params;
    const ext = path.extname(file).toLowerCase();
    if (!SAFE_FILE.test(file) || !SERVE_MIME[ext]) return json(res, 404, { error: "not_found" });
    const filePath = path.join(ATTACH_DIR, file);
    if (!filePath.startsWith(ATTACH_DIR) || !fs.existsSync(filePath)) {
      // FEDERATION (F3): not on our disk — maybe it lives on a satellite.
      // Relay it through the link; an offline host is a clean 503 (the
      // browser retries a broken <img> on its own schedule). Purged rows
      // and unknown names stay honest 404s.
      const row = store.attachmentByFile(file);
      if (row && !row.purged && row.satelliteId != null) {
        return relayRemoteFile(row.satelliteId, file, SERVE_MIME[ext], res, clientIp(req));
      }
      return json(res, 404, { error: "not_found" });
    }
    res.writeHead(200, {
      "content-type": SERVE_MIME[ext],
      "cache-control": "public, max-age=31536000, immutable",
      // Belt over the global nosniff: text docs must never render as HTML.
      "content-disposition": "inline",
    });
    fs.createReadStream(filePath).pipe(res);
  });
}
