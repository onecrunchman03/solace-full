// THE JUKEBOX's routes — the record library, the pick counter, and the files.
//
// The money lives HERE, not on the /ws-casino relay: a pick is charged through
// the same guarded spendCoins path as every other counter in the house, and the
// silver is BURNED (the Wheel stays the only faucet). The refusal is checked
// before the wallet is touched, so a pick that can't be made never costs
// anything.

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config";
import { json, readRawBody, type Router } from "../http";
import type { Jukebox } from "../casino/jukebox";
import { QUEUE_PRICE, SKIP_PRICE } from "../casino/jukebox";
import { mp3DurationMs } from "../mp3";

const MUSIC_DIR = path.join(config.uploadsDir, "music");
const SAFE_FILE = /^[A-Za-z0-9._-]+$/;
const MAX_SONG_BYTES = 15_000_000; // 15 MB — a long song at a generous bitrate
const MAX_TITLE = 120;

export function registerJukeboxRoutes(router: Router, juke: Jukebox): void {
  fs.mkdirSync(MUSIC_DIR, { recursive: true });

  // ---- the floor's own screen ------------------------------------------------

  router.get("/api/jukebox", "user", ({ res }) => {
    json(res, 200, {
      state: juke.state(),
      library: juke.library(),
      price: QUEUE_PRICE,
      skipPrice: SKIP_PRICE,
    });
  });

  router.post("/api/jukebox/queue", "user", ({ res, body, user, store }) => {
    const songId = Number((body as { songId?: unknown } | undefined)?.songId);
    if (!Number.isInteger(songId)) return json(res, 400, { error: "bad_song" });
    // Every reason to say no, BEFORE the charge.
    const refusal = juke.refuseReason(user.id, songId);
    if (refusal) return json(res, 409, { error: refusal });
    // === null: spendCoins returns the NEW BALANCE, so an exact-balance pick
    // (0 left) burned the silver and answered "insufficient" (Oct 2026 review).
    if (store.spendCoins(user.id, QUEUE_PRICE) === null) {
      return json(res, 402, { error: "insufficient" });
    }
    // Burned, not banked — the jukebox is a sink like the Vault's buy-in.
    const state = juke.enqueue(user.id, user.displayName, songId);
    store.bumpStat(user.id, "jukebox_picks"); // Ledger/achievement telemetry
    json(res, 200, { state, coins: store.getCoins(user.id) });
  });

  // A vote costs silver too, and it's burned like the pick. Same order as
  // queueing: refuse first, charge second, apply third — so a second vote from
  // the same person is turned away rather than billed again.
  router.post("/api/jukebox/skip", "user", ({ res, user, store }) => {
    const refusal = juke.refuseVoteReason(user.id);
    if (refusal) return json(res, 409, { error: refusal });
    if (store.spendCoins(user.id, SKIP_PRICE) === null) {
      return json(res, 402, { error: "insufficient" });
    }
    const r = juke.voteSkip(user.id, user.displayName);
    json(res, 200, { state: r.state, skipped: r.skipped, coins: store.getCoins(user.id) });
  });

  // ---- the records themselves ------------------------------------------------
  // Public by UUID like avatars and attachments (an <audio> tag can't send a
  // bearer token), immutable, and RANGE-CAPABLE: arriving mid-song means
  // seeking, and a seek into an unbuffered file needs a 206.

  router.get("/music/:file", "none", ({ req, res, params }) => {
    const { file } = params;
    if (!SAFE_FILE.test(file) || path.extname(file).toLowerCase() !== ".mp3") {
      return json(res, 404, { error: "not_found" });
    }
    const filePath = path.join(MUSIC_DIR, file);
    if (!filePath.startsWith(MUSIC_DIR) || !fs.existsSync(filePath)) {
      return json(res, 404, { error: "not_found" });
    }
    const size = fs.statSync(filePath).size;
    const base = {
      "content-type": "audio/mpeg",
      "accept-ranges": "bytes",
      "cache-control": "public, max-age=31536000, immutable",
    };
    const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ""));
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (!(start >= 0) || start > end || start >= size) {
        res.writeHead(416, { "content-range": `bytes */${size}` });
        res.end();
        return;
      }
      res.writeHead(206, {
        ...base,
        "content-range": `bytes ${start}-${end}/${size}`,
        "content-length": end - start + 1,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { ...base, "content-length": size });
    fs.createReadStream(filePath).pipe(res);
  });

  // ---- the admin screen: add / rename / remove --------------------------------

  router.get("/api/admin/jukebox", "admin", ({ res }) => {
    json(res, 200, { songs: juke.library() });
  });

  // Raw MP3 bytes; ?title= and ?artist= carry the labelling (a raw-body route
  // has no JSON to put them in). Type is sniffed from the bytes, and the
  // duration is READ FROM THE FILE — never taken from the uploader.
  router.postRaw("/api/admin/jukebox", "admin", async ({ req, res, url, user, store }) => {
    let buf: Buffer;
    try {
      buf = await readRawBody(req, MAX_SONG_BYTES);
    } catch {
      return json(res, 413, { error: "too_large" });
    }
    const isMp3 =
      (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) ||
      (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
    if (!isMp3) return json(res, 415, { error: "not_mp3" });
    const durationMs = mp3DurationMs(buf);
    if (durationMs < 1000) return json(res, 415, { error: "bad_mp3" });

    const title = String(url.searchParams.get("title") ?? "").trim().slice(0, MAX_TITLE);
    const artist = String(url.searchParams.get("artist") ?? "").trim().slice(0, MAX_TITLE);
    if (!title) return json(res, 400, { error: "no_title" });

    const name = `${randomUUID()}.mp3`;
    fs.writeFileSync(path.join(MUSIC_DIR, name), buf);
    const song = store.addJukeboxSong({ title, artist, file: name, durationMs, addedBy: user.id });
    store.audit(user.id, "jukebox.add", `${artist} — ${title}`);
    json(res, 200, { song });
  });

  router.patch("/api/admin/jukebox/:id", "admin", ({ res, params, body, user, store }) => {
    const id = Number(params.id);
    const existing = store.jukeboxSong(id);
    if (!existing) return json(res, 404, { error: "not_found" });
    const b = (body ?? {}) as { title?: unknown; artist?: unknown };
    const title = String(b.title ?? existing.title).trim().slice(0, MAX_TITLE);
    const artist = String(b.artist ?? existing.artist).trim().slice(0, MAX_TITLE);
    if (!title) return json(res, 400, { error: "no_title" });
    const song = store.renameJukeboxSong(id, title, artist);
    store.audit(user.id, "jukebox.rename", `${existing.artist} — ${existing.title} → ${artist} — ${title}`);
    json(res, 200, { song });
  });

  router.del("/api/admin/jukebox/:id", "admin", ({ res, params, user, store }) => {
    const id = Number(params.id);
    const existing = store.jukeboxSong(id);
    if (!existing) return json(res, 404, { error: "not_found" });
    const file = store.removeJukeboxSong(id);
    if (file && SAFE_FILE.test(file)) {
      const p = path.join(MUSIC_DIR, file);
      if (p.startsWith(MUSIC_DIR)) fs.rm(p, { force: true }, () => {});
    }
    store.audit(user.id, "jukebox.remove", `${existing.artist} — ${existing.title}`);
    // A record pulled mid-play is dropped by the engine's next advance (its
    // row is already gone), so nothing here has to reach into the queue.
    json(res, 200, { ok: true });
  });
}
