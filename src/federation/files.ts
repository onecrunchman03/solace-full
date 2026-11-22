// FEDERATION F3 — attachment files on the satellite (FEDERATION.md).
//
// The flow keeps every guarantee the hub's attachment layer already earned:
// uploads land at the HUB first (magic-byte sniffing, caps, the two-phase
// claim — all unchanged), so a remote post is validated end-to-end before a
// satellite hears about it. The file then ships to the host ASYNC over the
// link in base64 chunks, and only a CONFIRMED transfer unlinks the hub copy
// and stamps the row — so at every instant, exactly one side serves the
// truth: the hub while satelliteId is NULL, the host after. A transfer the
// link couldn't finish (offline host) just waits; the attachment sweep
// retries whenever the link is back.
//
// Serving relays: GET /attachments/:file falls through to here when the
// file isn't on the hub's disk, and the bytes stream back chunk by chunk.
// The hub's egress per view is the same as hub-hosting — the DISK is what
// moved to the host (the doc's stated trade).
import fs from "node:fs";
import path from "node:path";
import type { ServerResponse } from "node:http";
import { ATTACH_DIR } from "../attachments";
import { FILE_CHUNK_BYTES } from "./protocol";
import { satelliteRpc } from "./link";
import { makeRateLimiter } from "../http";
import type { Store, AttachmentFileRef } from "../db/store";
import { fromGlobalId } from "./remote";

const SAFE_FILE = /^[A-Za-z0-9.-]+$/;

/** Files mid-ship right now — a sweep retry must not race the post-time
 *  attempt into two interleaved chunk streams for one file. */
const shipping = new Set<string>();

/** Ship one claimed attachment's file to the satellite that owns its
 *  message, then flip the row and unlink the hub copy. Failure leaves
 *  everything as it was (hub-served); the sweep retries later. */
async function shipOne(store: Store, row: { id: number; file: string; kind: string; messageId: number }): Promise<void> {
  if (!SAFE_FILE.test(row.file) || shipping.has(row.file)) return;
  const p = path.join(ATTACH_DIR, row.file);
  if (!p.startsWith(ATTACH_DIR) || !fs.existsSync(p)) return;
  const { satelliteId } = fromGlobalId(row.messageId);
  shipping.add(row.file);
  try {
    const buf = fs.readFileSync(p);
    for (let off = 0; off < buf.length || off === 0; off += FILE_CHUNK_BYTES) {
      const chunk = buf.subarray(off, off + FILE_CHUNK_BYTES);
      await satelliteRpc(satelliteId, "file.put", {
        file: row.file,
        kind: row.kind,
        data: chunk.toString("base64"),
        first: off === 0,
        last: off + FILE_CHUNK_BYTES >= buf.length,
      }, 15_000);
    }
    // Only a confirmed, complete transfer flips the row — and the guard
    // refuses if the message was deleted while we shipped (purged rows
    // must not resurrect as remote-servable).
    if (store.markAttachmentRemote(row.id, satelliteId)) {
      fs.rm(p, { force: true }, () => {});
    } else {
      void satelliteRpc(satelliteId, "file.delete", { file: row.file }, 10_000).catch(() => {});
    }
  } catch {
    /* offline or refused — the hub copy stands, the sweep retries */
  } finally {
    shipping.delete(row.file);
  }
}

/** Ship everything claimed-to-remote that still sits on hub disk. Called
 *  right after a remote post (targeted freshness) and from the hourly
 *  attachment sweep (the retry path for posts made while the host was
 *  mid-restart). Fire-and-forget by design — never blocks a response. */
export function shipPendingRemoteFiles(store: Store): void {
  // ONE FILE AT A TIME PER SATELLITE (Sep 2026 review): after an outage the
  // whole backlog used to ship at once — dozens of files, each a chain of
  // 300KB chunks, interleaved over one home-uplink socket — so every chunk
  // timed out, the late replies tripped the noise budget, and the link
  // flapped into the same backlog. A per-satellite promise chain makes the
  // backlog drain in order; a file already mid-ship is skipped by shipOne.
  for (const row of store.pendingRemoteAttachments()) {
    const { satelliteId } = fromGlobalId(row.messageId);
    const prev = shipQueues.get(satelliteId) ?? Promise.resolve();
    const next = prev.then(() => shipOne(store, row)).catch(() => {});
    shipQueues.set(satelliteId, next);
    void next.finally(() => { if (shipQueues.get(satelliteId) === next) shipQueues.delete(satelliteId); });
  }
}
const shipQueues = new Map<number, Promise<void>>();

/** Dispose a batch of purged attachment files, wherever each lives: hub
 *  rows unlink, remote rows RPC the host (best-effort — an offline host's
 *  copy ages out on its own retention sweep, and the purged hub row already
 *  stopped it being served). */
export function disposeAttachmentFiles(refs: AttachmentFileRef[]): void {
  for (const r of refs) {
    if (!SAFE_FILE.test(r.file)) continue;
    if (r.satelliteId == null) {
      const p = path.join(ATTACH_DIR, r.file);
      if (p.startsWith(ATTACH_DIR)) fs.rm(p, { force: true }, () => {});
    } else {
      void satelliteRpc(r.satelliteId, "file.delete", { file: r.file }, 10_000).catch(() => {});
    }
  }
}

/** Relay a satellite-stored file to a waiting client, chunk by chunk. The
 *  response's headers are written on the FIRST successful chunk — an offline
 *  host answers with a clean 503 instead of a broken stream. */
/** THE RELAY IS PUBLIC-BY-UUID AND UNAUTHENTICATED, so it gets its own caps
 *  (Sep 2026 review round, part two): at most this many streams per satellite
 *  at once — each one is a chain of file.get RPCs over the host's single
 *  home-uplink socket — and this many per client address, plus a fixed
 *  window per address. Past a cap the answer is immediate (503 busy /
 *  429), never a queued stream. */
export const MAX_RELAYS_PER_SATELLITE = 8;
export const MAX_RELAYS_PER_IP = 6;
/** A request over the ceiling WAITS this long for a slot before it is
 *  refused (Oct 2026 review): a channel with five images on screen asked
 *  for all five at once, the 4th and 5th got an instant 503, and a browser
 *  never retries a broken <img> — the tiles stayed broken until a reload. */
const RELAY_QUEUE_MS = 8_000;
/** A reader that hasn't drained in this long is let go, so a slow (or
 *  deliberately stalled) client can't hold a satellite's slot forever. */
const RELAY_DRAIN_MS = 20_000;
const slotFree = (ip: string, satelliteId: number): boolean =>
  (relaysByIp.get(ip) ?? 0) < MAX_RELAYS_PER_IP && (relaysBySat.get(satelliteId) ?? 0) < MAX_RELAYS_PER_SATELLITE;
export const RELAYS_PER_IP_WINDOW = 90;
export const RELAY_WINDOW_MS = 10 * 60_000;
const relaysBySat = new Map<number, number>();
const relaysByIp = new Map<string, number>();
const relayWindow = makeRateLimiter();
const bump = (m: Map<number | string, number>, k: number | string, d: number): number => {
  const n = (m.get(k) ?? 0) + d;
  if (n <= 0) m.delete(k); else m.set(k, n);
  return n;
};

export async function relayRemoteFile(
  satelliteId: number,
  file: string,
  mime: string,
  res: ServerResponse,
  ip = "",
): Promise<void> {
  if (!relayWindow(`relay:${ip}`, RELAYS_PER_IP_WINDOW, RELAY_WINDOW_MS)) {
    res.writeHead(429, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "rate_limited" }));
    return;
  }
  if (!slotFree(ip, satelliteId)) {
    const until = Date.now() + RELAY_QUEUE_MS;
    while (!slotFree(ip, satelliteId) && Date.now() < until && !res.destroyed) {
      await new Promise((r) => setTimeout(r, 150));
    }
    if (res.destroyed) return;
    if (!slotFree(ip, satelliteId)) {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "satellite_busy" }));
      return;
    }
  }
  bump(relaysByIp as Map<number | string, number>, ip, 1);
  bump(relaysBySat as Map<number | string, number>, satelliteId, 1);
  try {
    await relayRemoteFileInner(satelliteId, file, mime, res);
  } finally {
    bump(relaysByIp as Map<number | string, number>, ip, -1);
    bump(relaysBySat as Map<number | string, number>, satelliteId, -1);
  }
}

async function relayRemoteFileInner(
  satelliteId: number,
  file: string,
  mime: string,
  res: ServerResponse,
): Promise<void> {
  let offset = 0;
  let started = false;
  // A viewer who navigates away mid-stream fires 'close', never 'drain' —
  // an un-escaped drain wait leaked this whole async context (buffers,
  // listeners, the loop) once per aborted large file, forever. The route is
  // public-by-uuid, so that leak was grindable by anyone with one URL.
  let gone = res.destroyed;
  res.once("close", () => { gone = true; });
  try {
    for (;;) {
      if (gone) { res.destroy(); return; }
      const raw = (await satelliteRpc(satelliteId, "file.get", { file, offset }, 15_000)) as
        { data?: string; eof?: boolean } | null;
      const chunk = Buffer.from(String(raw?.data ?? ""), "base64");
      if (!started) {
        res.writeHead(200, {
          "content-type": mime,
          "cache-control": "public, max-age=31536000, immutable",
          "content-disposition": "inline",
        });
        started = true;
      }
      if (chunk.length) {
        offset += chunk.length;
        // The satellite also controls termination — cap the relay at the
        // hub's own max stored size so a hostile host can't stream forever.
        if (offset > 9_500_000) { res.destroy(); return; }
        if (!res.write(chunk)) {
          await new Promise<void>((r) => {
            const t = setTimeout(() => { gone = true; done(); }, RELAY_DRAIN_MS);
            const done = (): void => { clearTimeout(t); res.off("drain", done); res.off("close", done); r(); };
            res.once("drain", done);
            res.once("close", done);
          });
          if (gone) { res.destroy(); return; }
        }
      }
      if (raw?.eof || !chunk.length) break;
    }
    res.end();
  } catch {
    if (!started) {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "satellite_offline" }));
    } else {
      res.destroy(); // a truncated stream must not look complete
    }
  }
}
