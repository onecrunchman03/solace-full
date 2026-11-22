// FEDERATION F2 — remote message content, hub side (FEDERATION.md).
//
// A satellite page's channels are ordinary hub rows; only MESSAGE BODIES
// live on the host's disk. Everything here runs AFTER the hub's own
// validation (permissions, flood armor, owned emoji, length caps) — the
// satellite is a dumb content store and its answers are hostile input:
// schema-checked, clamped, and re-keyed into the GLOBAL id space before a
// client ever sees them.
//
// GLOBAL IDS: a satellite mints its own message ids; on the wire they become
// satelliteId * 1e9 + remoteId. Hub message ids live far below 1e9, so the
// two can never collide, the client keeps treating ids as opaque numbers,
// and one lookup direction (globalId → satellite) is pure arithmetic.
import type { Store } from "../db/store";
import { toPublicUser, type MessageWithAuthor } from "../types";
import { satelliteRpc } from "./link";

export const REMOTE_ID_BASE = 1_000_000_000;
export const isRemoteId = (id: number): boolean => id >= REMOTE_ID_BASE;
export const toGlobalId = (satelliteId: number, remoteId: number): number =>
  satelliteId * REMOTE_ID_BASE + remoteId;
export const fromGlobalId = (id: number): { satelliteId: number; remoteId: number } => ({
  satelliteId: Math.floor(id / REMOTE_ID_BASE),
  remoteId: id % REMOTE_ID_BASE,
});

/** The row shape a satellite returns. Anything that doesn't parse to this is
 *  discarded — a hostile satellite gets to lie about its own page's words,
 *  never about their shape. */
export interface RemoteRow {
  id: number;
  channelId: number;
  userId: number;
  body: string;
  at: number;
  editedAt: number | null;
  deletedAt: number | null;
  replyToId: number | null;
}

const MAX_REMOTE_BODY = 8_000;

function cleanRow(raw: unknown): RemoteRow | null {
  const r = raw as Partial<RemoteRow> | null;
  if (!r || !Number.isInteger(r.id) || r.id! <= 0 || r.id! >= REMOTE_ID_BASE) return null;
  if (!Number.isInteger(r.channelId) || !Number.isInteger(r.userId)) return null;
  return {
    id: r.id!,
    channelId: r.channelId!,
    userId: r.userId!,
    body: String(r.body ?? "").slice(0, MAX_REMOTE_BODY),
    at: Number.isFinite(r.at) ? Number(r.at) : Date.now(),
    editedAt: Number.isFinite(r.editedAt) ? Number(r.editedAt) : null,
    deletedAt: Number.isFinite(r.deletedAt) ? Number(r.deletedAt) : null,
    // Same clamp as id: a replyToId outside the satellite's own id space
    // would rebase into ANOTHER satellite's global range downstream.
    replyToId: Number.isInteger(r.replyToId) && r.replyToId! > 0 && r.replyToId! < REMOTE_ID_BASE
      ? Number(r.replyToId) : null,
  };
}

/** Build the client-facing MessageWithAuthor from satellite rows: global
 *  ids, hub-hydrated authors, reply previews from the refs the satellite
 *  sent alongside. Reactions and attachments hydrate from the HUB's own
 *  tables keyed by global id (F3) — the satellite stores words and files,
 *  never the emoji economy's decorations or the attachment metadata. */
export function enrichRemote(
  store: Store,
  satelliteId: number,
  rows: RemoteRow[],
  refs: Map<number, RemoteRow>,
): MessageWithAuthor[] {
  const globalIds = rows.map((r) => toGlobalId(satelliteId, r.id));
  const reactions = store.reactionsFor(globalIds);
  const attachments = store.attachmentsFor("channel", globalIds);
  const cache = new Map<number, ReturnType<typeof toPublicUser> | null>();
  const author = (uid: number) => {
    if (!cache.has(uid)) {
      const u = store.getUserById(uid);
      cache.set(uid, u ? toPublicUser(u) : null);
    }
    return cache.get(uid)!;
  };
  const byId = new Map(rows.map((r) => [r.id, r]));
  // F4 applies to REFS too: a reply-preview ref is a satellite claim like
  // any row, so it is vetted against the index here — an unindexed ref is
  // fabricated and renders nothing, an indexed one wears the INDEX's author
  // and deleted state (never the satellite's), and a ref from another
  // channel doesn't preview. Unvetted, a hostile host could put any words
  // in any hub member's mouth via the excerpt, or resurface a hub-deleted
  // message's content there.
  const refIdx = store.remoteMessageInfos(
    [...refs.values()].map((r) => toGlobalId(satelliteId, r.id)),
  );
  const vetRef = (id: number, channelId: number): RemoteRow | null => {
    const cand = refs.get(id);
    if (!cand) return null;
    const info = refIdx.get(toGlobalId(satelliteId, cand.id));
    if (!info || info.channelId !== channelId) return null;
    return {
      ...cand,
      userId: info.userId,
      at: info.at,
      deletedAt: info.deletedAt != null ? info.deletedAt : cand.deletedAt,
    };
  };
  return rows.map((m): MessageWithAuthor => {
    let replyTo: MessageWithAuthor["replyTo"] = null;
    if (m.replyToId != null) {
      const r = byId.get(m.replyToId) ?? vetRef(m.replyToId, m.channelId);
      if (r) {
        const ra = author(r.userId);
        replyTo = {
          id: toGlobalId(satelliteId, r.id),
          author: ra ? { id: ra.id, displayName: ra.displayName } : null,
          excerpt: r.deletedAt ? "" : r.body.slice(0, 200),
          deleted: r.deletedAt != null,
        };
      }
    }
    const gid = toGlobalId(satelliteId, m.id);
    return {
      id: gid,
      channelId: m.channelId,
      userId: m.userId,
      body: m.deletedAt ? "" : m.body,
      createdAt: m.at,
      editedAt: m.editedAt,
      deletedAt: m.deletedAt,
      replyToId: m.replyToId != null ? toGlobalId(satelliteId, m.replyToId) : null,
      author: author(m.userId),
      reactions: reactions.get(gid) ?? [],
      replyTo,
      attachments: attachments.get(gid) ?? [],
    };
  });
}

/** Parse a {messages, refs} RPC result defensively. Array lengths cap at 200
 *  (F4) — no legal reply exceeds the hub's own paging limits, so anything
 *  past that is a hostile satellite trying to make the hub chew. */
export function parseListResult(raw: unknown): { rows: RemoteRow[]; refs: Map<number, RemoteRow> } {
  const o = raw as { messages?: unknown[]; refs?: unknown[] } | null;
  const rows = (Array.isArray(o?.messages) ? o.messages : []).slice(0, 200)
    .map(cleanRow).filter((r): r is RemoteRow => !!r);
  const refs = new Map(
    (Array.isArray(o?.refs) ? o.refs : []).slice(0, 200)
      .map(cleanRow).filter((r): r is RemoteRow => !!r).map((r) => [r.id, r]),
  );
  return { rows, refs };
}

/** F4 — THE INDEX IS THE AUTHORITY. Every message a satellite hands back is
 *  vetted against the hub's remote_messages index before a client sees it:
 *  a row the hub never indexed is FABRICATED and drops; author, channel and
 *  created-at are forced from the index (a lying host may misquote its
 *  community's words, but it cannot put them in another member's mouth,
 *  shuffle them into a different room, or aim a broadcast's channelId at
 *  some other page's audience); a hub-sanctioned deletion cannot be
 *  undeleted. Callers pass the channel the rows must belong to. */
export function vetAgainstIndex(
  store: Store,
  satelliteId: number,
  rows: RemoteRow[],
  channelId: number,
): RemoteRow[] {
  const idx = store.remoteMessageInfos(rows.map((r) => toGlobalId(satelliteId, r.id)));
  const out: RemoteRow[] = [];
  for (const r of rows) {
    const i = idx.get(toGlobalId(satelliteId, r.id));
    if (!i || i.channelId !== channelId) continue;
    out.push({
      ...r,
      channelId,
      userId: i.userId,
      at: i.at,
      deletedAt: i.deletedAt != null ? i.deletedAt : r.deletedAt,
    });
  }
  return out;
}

export function parseOneResult(raw: unknown): { row: RemoteRow; replyTo: RemoteRow | null } | null {
  const o = raw as { message?: unknown; replyTo?: unknown } | null;
  const row = cleanRow(o?.message);
  if (!row) return null;
  return { row, replyTo: cleanRow(o?.replyTo) };
}

export { satelliteRpc };
