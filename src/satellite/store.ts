// THE SATELLITE'S CONTENT STORE (F2). Deliberately lean — a satellite is a
// content shelf, not a Solace instance: message rows keyed by the HUB's
// channel ids, nothing else. No accounts, no economy, no permissions — the
// hub decided all of that before the RPC arrived. The host's disk owns
// these words (FEDERATION.md: "the host owns the disk").
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export interface SatMessage {
  id: number;
  channelId: number;
  userId: number;
  body: string;
  at: number;
  editedAt: number | null;
  deletedAt: number | null;
  replyToId: number | null;
}

/** Defensive cap — the hub validates length first; this is the backstop. */
const MAX_BODY = 8_000;

/** File names the hub mints are uuid.ext — anything else is refused before
 *  it can touch a path (the hub's own SAFE_FILE rule, applied to input FROM
 *  the hub too: a satellite trusts nobody with its filesystem). */
const SAFE_FILE = /^[A-Za-z0-9.-]+$/;

/** Hard ceiling per stored file — mirrors the hub's MAX_IMAGE_BYTES with a
 *  little slack. The hub validates first; this is the host's own backstop. */
const MAX_FILE_BYTES = 9_000_000;

/** Retention, satellite-side (FEDERATION.md F3: "retention sweeps running
 *  satellite-side"): the host deletes aged files on its own clock, matching
 *  the hub's defaults. The hub's purgedAt row is what actually stops serving
 *  — this sweep is the host's disk hygiene, so a drifted env dial on either
 *  side costs nothing but a few stale files. */
const ANIMATED_MS = 30 * 24 * 60 * 60 * 1000;
const STATIC_MS = 90 * 24 * 60 * 60 * 1000;

export class SatelliteStore {
  private db: DatabaseSync;
  private filesDir: string;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.filesDir = path.join(dataDir, "files");
    fs.mkdirSync(this.filesDir, { recursive: true });
    this.db = new DatabaseSync(path.join(dataDir, "content.db"));
    this.db.exec("PRAGMA journal_mode = WAL;");
    // Additive-only schema: an existing content.db from an 0.1.0 daemon
    // gains the new tables in place (IF NOT EXISTS is the whole migration
    // system a content shelf needs).
    const hadFts = !!this.db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'messages_fts'")
      .get();
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        channelId INTEGER NOT NULL,
        userId    INTEGER NOT NULL,
        body      TEXT    NOT NULL,
        at        INTEGER NOT NULL,
        editedAt  INTEGER,
        deletedAt INTEGER,
        replyToId INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channelId, id);
      CREATE TABLE IF NOT EXISTS files (
        file      TEXT PRIMARY KEY,
        kind      TEXT NOT NULL,
        bytes     INTEGER NOT NULL,
        createdAt INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS errors (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        at      INTEGER NOT NULL,
        kind    TEXT    NOT NULL,
        message TEXT    NOT NULL
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        body, content='messages', content_rowid='id'
      );
      CREATE TRIGGER IF NOT EXISTS messages_fts_ai AFTER INSERT ON messages BEGIN
        INSERT INTO messages_fts(rowid, body) VALUES (new.id, new.body);
      END;
      CREATE TRIGGER IF NOT EXISTS messages_fts_au AFTER UPDATE OF body ON messages BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, body) VALUES ('delete', old.id, old.body);
        INSERT INTO messages_fts(rowid, body) VALUES (new.id, new.body);
      END;
      CREATE TRIGGER IF NOT EXISTS messages_fts_ad AFTER DELETE ON messages BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, body) VALUES ('delete', old.id, old.body);
      END;
    `);
    // First boot with FTS: index everything already on the shelf.
    if (!hadFts) this.db.exec("INSERT INTO messages_fts(messages_fts) VALUES ('rebuild');");
  }

  private row(r: Record<string, unknown> | undefined): SatMessage | null {
    if (!r) return null;
    return {
      id: r.id as number, channelId: r.channelId as number, userId: r.userId as number,
      body: r.body as string, at: r.at as number,
      editedAt: (r.editedAt as number | null) ?? null,
      deletedAt: (r.deletedAt as number | null) ?? null,
      replyToId: (r.replyToId as number | null) ?? null,
    };
  }

  get(id: number): SatMessage | null {
    return this.row(this.db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as never);
  }

  /** Seed the message id counter to at least `floor` (the hub's welcome
   *  frame carries its max indexed id). This is what makes a ROTATION onto
   *  a fresh box safe: new ids start above everything the hub ever indexed,
   *  instead of re-minting from 1 into the old rows' id space. AUTOINCREMENT
   *  reads sqlite_sequence, which doesn't exist until the first insert —
   *  hence the insert-then-raise shape. */
  ensureIdFloor(floor: number): void {
    const f = Math.floor(Number(floor) || 0);
    if (f <= 0 || f >= 1_000_000_000) return; // hostile input rule: clamp to the legal id space
    this.db.prepare(
      "INSERT INTO sqlite_sequence (name, seq) SELECT 'messages', ? WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'messages')",
    ).run(f);
    this.db.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = 'messages' AND seq < ?").run(f, f);
  }

  /** Live (non-tombstoned) message count — the control panel's odometer. */
  count(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM messages WHERE deletedAt IS NULL").get() as { n: number }).n;
  }

  create(args: { channelId: number; userId: number; body: string; replyToId: number | null }):
    { message: SatMessage; replyTo: SatMessage | null } {
    let replyTo: SatMessage | null = null;
    if (args.replyToId != null) {
      replyTo = this.get(args.replyToId);
      if (!replyTo || replyTo.channelId !== args.channelId) throw new Error("bad_reply");
    }
    const info = this.db
      .prepare("INSERT INTO messages (channelId, userId, body, at, replyToId) VALUES (?, ?, ?, ?, ?)")
      .run(args.channelId, args.userId, String(args.body).slice(0, MAX_BODY), Date.now(), args.replyToId);
    return { message: this.get(Number(info.lastInsertRowid))!, replyTo };
  }

  /** Oldest→newest page, mirroring the hub's listMessages semantics, plus
   *  the reply-target rows that fall outside the window (`refs`). */
  list(args: { channelId: number; beforeId?: number; limit: number }): { messages: SatMessage[]; refs: SatMessage[] } {
    const limit = Math.min(Math.max(args.limit || 50, 1), 100);
    const rows = (
      args.beforeId
        ? this.db.prepare("SELECT * FROM messages WHERE channelId = ? AND id < ? ORDER BY id DESC LIMIT ?")
            .all(args.channelId, args.beforeId, limit)
        : this.db.prepare("SELECT * FROM messages WHERE channelId = ? ORDER BY id DESC LIMIT ?")
            .all(args.channelId, limit)
    ) as Record<string, unknown>[];
    const messages = rows.map((r) => this.row(r)!).reverse();
    const have = new Set(messages.map((m) => m.id));
    const refs: SatMessage[] = [];
    for (const m of messages) {
      if (m.replyToId != null && !have.has(m.replyToId)) {
        const r = this.get(m.replyToId);
        if (r) { refs.push(r); have.add(r.id); }
      }
    }
    return { messages, refs };
  }

  update(args: { id: number; body: string }): { message: SatMessage; replyTo: SatMessage | null } {
    const existing = this.get(args.id);
    if (!existing || existing.deletedAt != null) throw new Error("no_message");
    this.db.prepare("UPDATE messages SET body = ?, editedAt = ? WHERE id = ?")
      .run(String(args.body).slice(0, MAX_BODY), Date.now(), args.id);
    const message = this.get(args.id)!;
    return { message, replyTo: message.replyToId != null ? this.get(message.replyToId) : null };
  }

  delete(args: { id: number }): { message: SatMessage } {
    const existing = this.get(args.id);
    if (!existing) throw new Error("no_message");
    // The tombstone rule: the row stays (conversation flow), the words go.
    this.db.prepare("UPDATE messages SET body = '', deletedAt = ? WHERE id = ?").run(Date.now(), args.id);
    return { message: this.get(args.id)! };
  }

  // ---- Search (F3) -------------------------------------------------------

  /** The hub's ftsQuery shape, applied to the raw string the hub relays:
   *  quoted tokens, last one a prefix. Hostile-input rule — this store
   *  sanitizes for itself rather than trusting a pre-built MATCH string. */
  private static ftsQuery(raw: string): string | null {
    const tokens = String(raw)
      .split(/\s+/)
      .map((t) => t.replace(/[^\p{L}\p{N}_]/gu, ""))
      .filter(Boolean)
      .slice(0, 8);
    if (!tokens.length) return null;
    const last = tokens.pop()!;
    return [...tokens.map((t) => `"${t}"`), `"${last}"*`].join(" ");
  }

  search(args: { q: string; limit?: number; channels?: unknown }): { messages: SatMessage[] } {
    const fts = SatelliteStore.ftsQuery(String(args.q ?? "").slice(0, 120));
    if (!fts) return { messages: [] };
    // The hub names the channels its member may see (Oct 2026 review): a
    // gated room's hits used to fill the 25 and starve the public ones.
    const chans = Array.isArray(args.channels)
      ? args.channels.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 200)
      : [];
    const limit = Math.min(Math.max(Number(args.limit) || 25, 1), chans.length ? 50 : 25);
    const scope = chans.length ? `AND m.channelId IN (${chans.map(() => "?").join(",")})` : "";
    const rows = this.db
      .prepare(
        `SELECT m.* FROM messages_fts f JOIN messages m ON m.id = f.rowid
         WHERE messages_fts MATCH ? AND m.deletedAt IS NULL ${scope}
         ORDER BY m.id DESC LIMIT ?`,
      )
      .all(fts, ...chans, limit) as Record<string, unknown>[];
    return { messages: rows.map((r) => this.row(r)!) };
  }

  // ---- Attachment files (F3) ---------------------------------------------
  // The hub ships each claimed file over the link in base64 chunks; the host
  // stores it, serves it back on request, and deletes it when told (or when
  // it ages out). In-flight transfers assemble in .part files so a link that
  // dies mid-ship never leaves a half-file behind as servable.

  private filePath(file: string): string {
    // The leading-dot refusal is load-bearing: "." passes both the charset
    // and the startsWith guard yet path.joins to the files dir ITSELF, so a
    // put would write `files.part` as a SIBLING outside the dir and a delete
    // would rm the directory. The hub mints uuid.ext; nothing legal starts
    // with a dot.
    if (!SAFE_FILE.test(file) || file.startsWith(".")) throw new Error("bad_file");
    const p = path.join(this.filesDir, file);
    if (!p.startsWith(this.filesDir)) throw new Error("bad_file");
    return p;
  }

  filePut(args: { file: string; kind: string; data: string; first: boolean; last: boolean }): { ok: true } {
    const p = this.filePath(String(args.file));
    const part = `${p}.part`;
    const chunk = Buffer.from(String(args.data ?? ""), "base64");
    if (args.first) fs.writeFileSync(part, chunk);
    else {
      // A later chunk landing on a box that never saw the first (a rotation
      // or reset mid-transfer) must not create a truncated .part that the
      // last chunk then renames into place (Sep 2026 review).
      if (!fs.existsSync(part)) throw new Error("no_part");
      fs.appendFileSync(part, chunk);
    }
    if (fs.statSync(part).size > MAX_FILE_BYTES) {
      fs.rmSync(part, { force: true });
      throw new Error("too_large");
    }
    if (args.last) {
      fs.renameSync(part, p);
      const kind = args.kind === "gif" || args.kind === "text" ? args.kind : "image";
      this.db
        .prepare("INSERT OR REPLACE INTO files (file, kind, bytes, createdAt) VALUES (?, ?, ?, ?)")
        .run(args.file, kind, fs.statSync(p).size, Date.now());
    }
    return { ok: true };
  }

  fileGet(args: { file: string; offset: number }): { data: string; eof: boolean } {
    const p = this.filePath(String(args.file));
    if (!fs.existsSync(p)) throw new Error("no_file");
    const size = fs.statSync(p).size;
    const offset = Math.max(0, Math.floor(Number(args.offset) || 0));
    if (offset >= size) return { data: "", eof: true };
    const len = Math.min(300_000, size - offset);
    const buf = Buffer.alloc(len);
    const fd = fs.openSync(p, "r");
    try {
      fs.readSync(fd, buf, 0, len, offset);
    } finally {
      fs.closeSync(fd);
    }
    return { data: buf.toString("base64"), eof: offset + len >= size };
  }

  fileDelete(args: { file: string }): { ok: true } {
    const p = this.filePath(String(args.file));
    fs.rmSync(p, { force: true });
    fs.rmSync(`${p}.part`, { force: true });
    this.db.prepare("DELETE FROM files WHERE file = ?").run(args.file);
    return { ok: true };
  }

  /** Age out stored files on the host's own clock (disk hygiene — the hub's
   *  purgedAt row is what stops serving). The windows are host-tunable from
   *  the app's Settings card (F4). Returns how many went. */
  sweepFiles(now = Date.now(), animatedMs = ANIMATED_MS, staticMs = STATIC_MS): number {
    const rows = this.db
      .prepare("SELECT file, kind FROM files WHERE (kind = 'gif' AND createdAt < ?) OR (kind != 'gif' AND createdAt < ?)")
      .all(now - animatedMs, now - staticMs) as { file: string }[];
    for (const r of rows) {
      try { this.fileDelete({ file: r.file }); } catch { /* keep sweeping */ }
    }
    return rows.length;
  }

  /** Stored-file count + bytes — the control panel's disk line. */
  fileStats(): { count: number; bytes: number } {
    const r = this.db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(bytes), 0) AS bytes FROM files")
      .get() as { count: number; bytes: number };
    return r;
  }

  // ---- Error queue (F6) --------------------------------------------------
  // Errors persist HERE until the hub drains them over the link, so a crash
  // or reboot between sweeps loses nothing. Capped: a runaway error loop
  // must not eat the host's disk — past the cap the oldest rows roll off.

  recordError(kind: string, message: string): void {
    try {
      this.db.prepare("INSERT INTO errors (at, kind, message) VALUES (?, ?, ?)")
        .run(Date.now(), String(kind).slice(0, 40), String(message).slice(0, 500));
      this.db.prepare(
        "DELETE FROM errors WHERE id NOT IN (SELECT id FROM errors ORDER BY id DESC LIMIT 500)",
      ).run();
    } catch { /* error reporting must never be a new error */ }
  }

  /** Hand the hub a batch WITHOUT deleting it — the hub acks (errors.ack)
   *  once the ledger has the rows, and only the ack purges. Deleting at
   *  drain time lost reports on exactly the flapping link whose errors
   *  matter most (the rpc.ok can die on a closing socket); redelivery is
   *  harmless because the hub dedupes by signature. */
  drainErrors(): { errors: { at: number; kind: string; message: string }[]; upTo: number } {
    const rows = this.db.prepare("SELECT id, at, kind, message FROM errors ORDER BY id LIMIT 50")
      .all() as { id: number; at: number; kind: string; message: string }[];
    return {
      errors: rows.map((r) => ({ at: r.at, kind: r.kind, message: r.message })),
      upTo: rows.length ? rows[rows.length - 1].id : 0,
    };
  }

  /** The hub confirmed it stored everything up to this id — now forget it. */
  ackErrors(args: { upTo: number }): { ok: true } {
    const upTo = Math.floor(Number(args.upTo) || 0);
    if (upTo > 0) this.db.prepare("DELETE FROM errors WHERE id <= ?").run(upTo);
    return { ok: true };
  }

  errorCount(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM errors").get() as { n: number }).n;
  }

  /** WAL-safe consistent snapshot of the whole database into one file
   *  (SQLite's own VACUUM INTO) — the backup routine's db half. The target
   *  must not exist; the caller names snapshots by date and rotates. */
  backupTo(file: string): void {
    this.db.prepare("VACUUM INTO ?").run(file);
  }

  /** Release the database (the app's RESET swaps in a fresh store — the old
   *  handle must let go of the file before it can be deleted). */
  close(): void {
    try { this.db.close(); } catch { /* already closed */ }
  }
}
