import { json, makeRateLimiter, posIntParam, type Router } from "../http";
import { canEditMessage, canDeleteMessage, canManage } from "../permissions";
import { mayPostChannel, hasPerm, mayMentionEveryone } from "../pageauth";
import { mayEnterChannel, mayEnterChannelId } from "../pagescope";
import { toPublicUser, type Message, type MessageWithAuthor, type User, type Channel } from "../types";
import { unownedEmoji } from "../text";
import { MAX_PER_MESSAGE } from "../attachments";
import {
  enrichRemote, fromGlobalId, isRemoteId, parseListResult, parseOneResult, satelliteRpc, toGlobalId,
  vetAgainstIndex,
} from "../federation/remote";
import { disposeAttachmentFiles, shipPendingRemoteFiles } from "../federation/files";
import type { Store } from "../db/store";

const MAX_BODY = 4000;

/** Parse a message's attachmentIds field: a deduped list of ints, capped.
 *  Returns null on anything malformed (the route 400s). */
export function parseAttachmentIds(raw: unknown): number[] | null {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_PER_MESSAGE) return null;
  const ids: number[] = [];
  for (const v of raw) {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) return null;
    if (!ids.includes(n)) ids.push(n);
  }
  return ids;
}

/** Attach author, reactions, and a reply-preview to each message for the client. */
function enrich(store: Store, messages: Message[]): MessageWithAuthor[] {
  const cache = new Map<number, ReturnType<typeof toPublicUser> | null>();
  const author = (uid: number) => {
    if (!cache.has(uid)) {
      const u = store.getUserById(uid);
      cache.set(uid, u ? toPublicUser(u) : null);
    }
    return cache.get(uid)!;
  };
  const reactions = store.reactionsFor(messages.map((m) => m.id));
  const attachments = store.attachmentsFor("channel", messages.map((m) => m.id));
  return messages.map((m): MessageWithAuthor => {
    let replyTo: MessageWithAuthor["replyTo"] = null;
    if (m.replyToId != null) {
      const r = store.getMessage(m.replyToId);
      if (r) {
        const ra = author(r.userId);
        replyTo = {
          id: r.id,
          author: ra ? { id: ra.id, displayName: ra.displayName } : null,
          excerpt: r.deletedAt ? "" : r.body.slice(0, 200),
          deleted: r.deletedAt != null,
        };
      }
    }
    return {
      ...m,
      author: author(m.userId),
      reactions: reactions.get(m.id) ?? [],
      replyTo,
      attachments: attachments.get(m.id) ?? [],
    };
  });
}

/** Sterling's ear at every table: the message route calls this with each
 *  posted body so "/sterling ..." commands get an in-character reply. */
export type CommandHook = (user: User, channel: Channel, text: string, message: Message) => void;

/** Post flood armor (Aug 2026 review): 20 messages per 10s per user — far
 *  above any real typing burst (2/s sustained), so honest users never see
 *  it, but a hostile member can't firehose a channel. Same window for DMs
 *  (routes/dm.ts shares this via export). */
export const postLimiter = makeRateLimiter();
/** Remote (satellite) history + search reads per member: each is an RPC over
 *  the host's single link, so they get a ceiling of their own. */
export const REMOTE_READ_BURST = 60;
export const REMOTE_READ_WINDOW_MS = 60_000;
export const POST_BURST = 20;
export const POST_WINDOW_MS = 10_000;

/** Register message routes on the router. */
export function registerMessageRoutes(router: Router, onMessage?: CommandHook): void {
  // Channel history, oldest→newest. ?before=<id>&limit=<n> pages backwards.
  // Deliberately read-only: fetching history does NOT move the read cursor —
  // only the explicit POST /api/channels/:id/read does. A GET side effect
  // would let background refetches (reconnect resync, prefetch) silently mark
  // messages read that the user never saw.
  router.get("/api/channels/:id/messages", "user", async ({ res, params, url, user, store }) => {
    const channel = store.getChannel(Number(params.id));
    if (!channel) return json(res, 404, { error: "no_channel" });
    // A private PAGE's history is as private as the page (migration 63).
    if (!mayEnterChannel(store, user, channel)) return json(res, 404, { error: "no_channel" });

    // posIntParam: garbage (?limit=abc, 2.5) must never reach a SQL bind.
    const before = posIntParam(url.searchParams.get("before"));
    const limit = posIntParam(url.searchParams.get("limit"));

    // FEDERATION (F2): a satellite page's history lives on its host's disk —
    // relay the read, hydrate authors hub-side. Offline is an honest 503,
    // never a silent empty channel.
    const satId = store.getPage(channel.pageId)?.satelliteId;
    if (satId) {
      // A remote read is a frame on the host's home uplink — a member gets
      // a generous but finite number of them per minute (review round 2).
      if (!postLimiter(`rhist:${user.id}`, REMOTE_READ_BURST, REMOTE_READ_WINDOW_MS)) {
        return json(res, 429, { error: "rate_limited" });
      }
      try {
        const raw = await satelliteRpc(satId, "messages.list", {
          channelId: channel.id,
          beforeId: before != null && isRemoteId(before) ? fromGlobalId(before).remoteId : undefined,
          limit: Math.min(Math.max(limit ?? 50, 1), 100),
        });
        const { rows, refs } = parseListResult(raw);
        // F4: the hub's index is the authority — fabricated rows drop,
        // authors/channels/timestamps are forced, deletions stay deleted.
        const vetted = vetAgainstIndex(store, satId, rows, channel.id);
        return json(res, 200, { messages: enrichRemote(store, satId, vetted, refs) });
      } catch {
        return json(res, 503, { error: "satellite_offline" });
      }
    }

    const messages = store.listMessages(channel.id, { before, limit });
    json(res, 200, { messages: enrich(store, messages) });
  });

  // Post a message to a channel (optionally as a reply).
  router.post("/api/channels/:id/messages", "user", async ({ res, params, body, user, store, bus }) => {
    const channel = store.getChannel(Number(params.id));
    if (!channel) return json(res, 404, { error: "no_channel" });
    if (!mayEnterChannel(store, user, channel)) return json(res, 404, { error: "no_channel" });
    if (!mayPostChannel(store, user, channel)) return json(res, 403, { error: "locked" });
    if (!postLimiter(`post:${user.id}`, POST_BURST, POST_WINDOW_MS)) {
      return json(res, 429, { error: "rate_limited" });
    }

    const text = String(body.body ?? "").trim();
    const attachmentIds = parseAttachmentIds(body.attachmentIds);
    if (attachmentIds === null) return json(res, 400, { error: "bad_attachments" });
    // An image (or file) can carry a message on its own — but something must.
    if (!text && !attachmentIds.length) return json(res, 400, { error: "empty_message" });
    if (text.length > MAX_BODY) return json(res, 400, { error: "message_too_long" });

    const bad = unownedEmoji(store, user.id, text);
    if (bad.length) return json(res, 403, { error: "unowned_emoji", codes: bad });

    // PAGE CHAT POLICY (migration 89): a page may refuse attachments, or
    // just GIFs. Checked before any claim, so a refusal costs nothing.
    const pageRow = store.getPage(channel.pageId);
    if (attachmentIds.length && pageRow) {
      if (!pageRow.allowImages) return json(res, 403, { error: "attachments_off" });
      const kinds = store.attachmentKinds(attachmentIds);
      if (!pageRow.allowGifs && kinds.includes("gif")) return json(res, 403, { error: "gifs_off" });
      // PAGE ROLES: the member's own attach / gif permissions.
      if (!hasPerm(store, user, channel.pageId, "attach")) return json(res, 403, { error: "attachments_off" });
      if (kinds.includes("gif") && !hasPerm(store, user, channel.pageId, "gif")) return json(res, 403, { error: "gifs_off" });
    }
    // @everyone pings only from a role (or the house / staff) that may.
    const everyone = /@everyone\b/.test(text) && mayMentionEveryone(store, user, channel.pageId);

    // FEDERATION (F2/F3): every validation above already ran HUB-SIDE — the
    // satellite only ever stores what the hub has cleared. Attachments (F3)
    // were uploaded and sniffed at the hub like any other; they claim onto
    // the GLOBAL id after the create, then their files ship to the host
    // async (hub serves them until the transfer confirms). Sterling doesn't
    // ride to satellites (no bot in someone else's community); the message
    // frame broadcasts through the ordinary page-scoped machinery because
    // the channel is a hub row.
    const satId = store.getPage(channel.pageId)?.satelliteId;
    if (satId) {
      // Pre-flight the claim so the common failure (stale tray, stolen id)
      // never creates a remote message it then has to unwind.
      if (attachmentIds.length && !store.attachmentsClaimable(attachmentIds, user.id)) {
        return json(res, 400, { error: "bad_attachments" });
      }
      let remoteReply: number | null = null;
      if (body.replyToId != null) {
        const rid = Number(body.replyToId);
        if (!isRemoteId(rid)) return json(res, 400, { error: "bad_reply" });
        const idx = store.remoteMessageInfo(rid);
        if (!idx || idx.channelId !== channel.id) return json(res, 400, { error: "bad_reply" });
        remoteReply = fromGlobalId(rid).remoteId;
      }
      try {
        const raw = await satelliteRpc(satId, "message.create", {
          channelId: channel.id, userId: user.id, body: text, replyToId: remoteReply,
        });
        const parsed = parseOneResult(raw);
        if (!parsed) return json(res, 503, { error: "satellite_offline" });
        // The RPC took real time — if staff deleted the channel (or page)
        // meanwhile, indexing and broadcasting into it would resurrect a
        // row nothing can clean up and hand realtime a dead channelId.
        if (!store.getChannel(channel.id)) {
          // Same unwind discipline as the collision path: the satellite
          // holds a row the hub will never index — ask it to clear it.
          void satelliteRpc(satId, "message.delete", { id: parsed.row.id }).catch(() => {});
          return json(res, 404, { error: "no_channel" });
        }
        // F4: the hub decides who spoke, where, when, and TO WHAT — the
        // satellite only supplies its own row id. A lying channelId here
        // used to aim the broadcast at another page's audience, and a lying
        // replyToId could hang the post on a reply the hub never validated.
        const at = Date.now();
        // …and the BODY: the hub holds the validated text, so the satellite's
        // echo of it is not consulted (Sep 2026 review — a lying host could
        // put other words under the poster's name on the live wire).
        parsed.row = { ...parsed.row, channelId: channel.id, userId: user.id, at, deletedAt: null, replyToId: remoteReply, body: text };
        const gid = toGlobalId(satId, parsed.row.id);
        // Index + claim in ONE transaction: a raced tray rolls the index row
        // back with it (no half-claimed attachments stranded on a message
        // that was never born), and an id the satellite has used before —
        // hostile, or a stale counter — refuses instead of silently keeping
        // the OLD row while the new poster's attachments claim onto it.
        let outcome: "ok" | "collision" | "bad_attachments";
        try {
          outcome = store.transaction(() => {
            if (!store.recordRemoteMessage(channel.id, gid, user.id, at)) return "collision" as const;
            if (attachmentIds.length && !store.claimAttachments(attachmentIds, user.id, "channel", gid)) {
              throw new Error("bad_attachments");
            }
            return "ok" as const;
          });
        } catch {
          outcome = "bad_attachments";
        }
        if (outcome !== "ok") {
          void satelliteRpc(satId, "message.delete", { id: parsed.row.id }).catch(() => {});
          if (outcome === "collision") {
            // The one signal that fingerprints a hostile or stale-counter
            // host (a pre-floor restore re-minting used ids) — without this
            // it reads as "offline" everywhere while the link shows green.
            store.recordSatelliteEvent("id_collision", satId, null, `remote id ${parsed.row.id} reused`);
            return json(res, 503, { error: "satellite_offline" });
          }
          return json(res, 400, { error: "bad_attachments" });
        }
        const refs = new Map(parsed.replyTo ? [[parsed.replyTo.id, parsed.replyTo]] : []);
        const out = enrichRemote(store, satId, [parsed.row], refs)[0];
        // The live frame carries the @everyone stamp too, so a permitted
        // author's ping highlights and pushes on a hosted page like anywhere.
        if (everyone) out.everyone = true;
        bus.emit("message", { message: out });
        json(res, 200, { message: out });
        // Ship the files to the host AFTER the response — never on its clock.
        if (attachmentIds.length) shipPendingRemoteFiles(store);
        return;
      } catch {
        return json(res, 503, { error: "satellite_offline" });
      }
    }

    let replyToId: number | null = null;
    if (body.replyToId != null) {
      const target = store.getMessage(Number(body.replyToId));
      if (!target || target.channelId !== channel.id) return json(res, 400, { error: "bad_reply" });
      replyToId = target.id;
    }

    // Create + claim atomically: if any attachment isn't the sender's (or was
    // already sent / purged), the whole message rolls back.
    let message: Message;
    try {
      message = store.transaction(() => {
        const m = store.createMessage({ channelId: channel.id, userId: user.id, body: text, replyToId, everyone });
        if (!store.claimAttachments(attachmentIds, user.id, "channel", m.id)) {
          throw new Error("bad_attachments");
        }
        return m;
      });
    } catch {
      return json(res, 400, { error: "bad_attachments" });
    }
    const enriched = enrich(store, [message])[0];
    bus.emit("message", { message: enriched });
    json(res, 200, { message: enriched });
    // Sterling hears everything (the command prefix is checked inside).
    onMessage?.(user, channel, text, message);
  });

  // Edit a message — author only, and not once deleted.
  router.patch("/api/messages/:id", "user", async ({ res, params, body, user, store, bus }) => {
    const id = Number(params.id);

    // FEDERATION (F2): authority over a remote message comes from the hub's
    // INDEX (author, deleted state) — the satellite never gets to decide who
    // may edit what.
    if (isRemoteId(id)) {
      const idx = store.remoteMessageInfo(id);
      if (!idx) return json(res, 404, { error: "no_message" });
      if (!mayEnterChannelId(store, user, idx.channelId)) return json(res, 404, { error: "no_message" });
      if (idx.userId !== user.id || idx.deletedAt != null) return json(res, 403, { error: "forbidden" });
      const rch = store.getChannel(idx.channelId);
      if (!rch || !mayPostChannel(store, user, rch)) return json(res, 403, { error: "locked" });
      const text = String(body.body ?? "").trim();
      if (!text) return json(res, 400, { error: "empty_message" });
      if (text.length > MAX_BODY) return json(res, 400, { error: "message_too_long" });
      const badRemote = unownedEmoji(store, user.id, text);
      if (badRemote.length) return json(res, 403, { error: "unowned_emoji", codes: badRemote });
      const { satelliteId, remoteId } = fromGlobalId(id);
      try {
        const parsed = parseOneResult(await satelliteRpc(satelliteId, "message.update", { id: remoteId, body: text }));
        if (!parsed) return json(res, 503, { error: "satellite_offline" });
        // Re-read the index: the RPC took real time, and a staff delete (or
        // a channel/page delete — index rows die with their channels) that
        // landed meanwhile OWNS the outcome. Broadcasting this edit with
        // deletedAt pinned null would stand the deleted message back up,
        // body and all, on the live wire — staff reach is a doctrine.
        const fresh = store.remoteMessageInfo(id);
        if (!fresh || fresh.deletedAt != null) return json(res, 404, { error: "no_message" });
        // F4: the index owns author/channel/created-at on the way back out —
        // and the ID is the one the hub addressed, not whatever the
        // satellite answered with (an unpinned id broadcast the new body
        // under some other message's gid). replyToId stays the satellite's
        // word (the index keeps no reply linkage) — cleanRow clamps it to
        // this satellite's own id space and vetRef bounds the preview, the
        // same documented limitation as history rows.
        parsed.row = { ...parsed.row, id: remoteId, channelId: idx.channelId, userId: idx.userId, at: idx.at, deletedAt: null, body: text };
        const refs = new Map(parsed.replyTo ? [[parsed.replyTo.id, parsed.replyTo]] : []);
        const out = enrichRemote(store, satelliteId, [parsed.row], refs)[0];
        bus.emit("message.update", { message: out });
        return json(res, 200, { message: out });
      } catch {
        return json(res, 503, { error: "satellite_offline" });
      }
    }

    const message = store.getMessage(id);
    if (!message) return json(res, 404, { error: "no_message" });
    if (!mayEnterChannelId(store, user, message.channelId)) return json(res, 404, { error: "no_message" });
    if (!canEditMessage(user, message)) return json(res, 403, { error: "forbidden" });
    // Editing is posting (Oct 2026 review): a member locked out of a channel
    // may still delete what they wrote, but not rewrite it.
    const editCh = store.getChannel(message.channelId);
    if (!editCh || !mayPostChannel(store, user, editCh)) return json(res, 403, { error: "locked" });

    const text = String(body.body ?? "").trim();
    if (!text) return json(res, 400, { error: "empty_message" });
    if (text.length > MAX_BODY) return json(res, 400, { error: "message_too_long" });

    const bad = unownedEmoji(store, user.id, text);
    if (bad.length) return json(res, 403, { error: "unowned_emoji", codes: bad });

    const updated = enrich(store, [store.editMessage(message.id, text)!])[0];
    bus.emit("message.update", { message: updated });
    json(res, 200, { message: updated });
  });

  // Delete a message (tombstone) — author or a channel manager.
  router.del("/api/messages/:id", "user", async ({ res, params, user, store, bus }) => {
    const id = Number(params.id);

    // FEDERATION (F2): the staff-reach path. Deletion authority (author, or
    // page manager / admin via canManage) resolves entirely hub-side; the
    // satellite just clears the body.
    if (isRemoteId(id)) {
      const idx = store.remoteMessageInfo(id);
      if (!idx) return json(res, 404, { error: "no_message" });
      const channel = store.getChannel(idx.channelId);
      if (!channel || !mayEnterChannel(store, user, channel)) return json(res, 404, { error: "no_message" });
      const mayDelete = idx.userId === user.id || canManage(user, channel, store.pageRole(channel.pageId, user.id));
      if (!mayDelete) return json(res, 403, { error: "forbidden" });
      const { satelliteId, remoteId } = fromGlobalId(id);
      // THE HUB'S AUTHORITY DOES NOT WAIT FOR THE SATELLITE'S COOPERATION.
      // Tombstone the INDEX first — that is what history vetting serves —
      // then ask the host to clear its copy as best-effort cleanup. Gated
      // on the RPC, a hostile (or merely offline) daemon could keep
      // rule-breaking content alive on the hub's own wire forever by
      // refusing the call; staff reach is a doctrine, not a request.
      store.markRemoteMessageDeleted(id);
      // Its reactions go with it, as a hub message's do (Oct 2026 review) —
      // the react route 404s on a tombstone, so they could never be taken off.
      store.clearReactions(id);
      // Its files stop being served NOW, wherever they live (F3).
      disposeAttachmentFiles(store.purgeAttachmentsForMessage("channel", id));
      void satelliteRpc(satelliteId, "message.delete", { id: remoteId }).catch(() => {});
      const tombRow = {
        id: remoteId, channelId: idx.channelId, userId: idx.userId, body: "",
        at: idx.at, editedAt: null, deletedAt: Date.now(), replyToId: null,
      };
      const out = enrichRemote(store, satelliteId, [tombRow], new Map())[0];
      bus.emit("message.delete", { message: out });
      return json(res, 200, { message: out });
    }

    const message = store.getMessage(id);
    if (!message) return json(res, 404, { error: "no_message" });
    const channel = store.getChannel(message.channelId);
    if (!channel) return json(res, 404, { error: "no_channel" });
    if (!mayEnterChannel(store, user, channel)) return json(res, 404, { error: "no_message" });
    if (!canDeleteMessage(user, message, channel, store.pageRole(channel.pageId, user.id))) {
      return json(res, 403, { error: "forbidden" });
    }

    // A deleted message's files stop being served immediately (the row stays).
    disposeAttachmentFiles(store.purgeAttachmentsForMessage("channel", message.id));
    const tombstone = enrich(store, [store.deleteMessage(message.id)!])[0];
    bus.emit("message.delete", { message: tombstone });
    json(res, 200, { message: tombstone });
  });

  // Toggle a collectible-emoji reaction on a message (must own the emoji).
  router.post("/api/messages/:id/react", "user", ({ res, params, body, user, store, bus }) => {
    // FEDERATION (F3): reactions on remote messages live entirely HUB-SIDE,
    // keyed by the global id — the emoji economy never rides to a satellite,
    // and the hub's index supplies exactly the authority the local path gets
    // from its message row (exists, not deleted, channel readable).
    const rawId = Number(params.id);
    if (isRemoteId(rawId)) {
      const idx = store.remoteMessageInfo(rawId);
      if (!idx || idx.deletedAt != null) return json(res, 404, { error: "no_message" });
      if (!mayEnterChannelId(store, user, idx.channelId)) return json(res, 404, { error: "no_message" });
      const rcode = String(body.code ?? "");
      if (!store.getEmoji(rcode)) return json(res, 400, { error: "bad_emoji" });
      if (!store.hasReaction(rawId, user.id, rcode) && !store.ownsEmoji(user.id, rcode)) return json(res, 403, { error: "unowned_emoji" });
      const added = store.toggleReaction(rawId, user.id, rcode);
      bus.emit("message.react", { messageId: rawId, channelId: idx.channelId, code: rcode, userId: user.id, added });
      return json(res, 200, { added });
    }
    const message = store.getMessage(Number(params.id));
    if (!message || message.deletedAt) return json(res, 404, { error: "no_message" });
    if (!mayEnterChannelId(store, user, message.channelId)) return json(res, 404, { error: "no_message" });
    const code = String(body.code ?? "");
    if (!store.getEmoji(code)) return json(res, 400, { error: "bad_emoji" });
    // Owning the emoji is the price of ADDING a reaction; taking your own
    // back off never needs it (Oct 2026 review — sold it, can't remove it).
    if (!store.hasReaction(message.id, user.id, code) && !store.ownsEmoji(user.id, code)) return json(res, 403, { error: "unowned_emoji" });

    const added = store.toggleReaction(message.id, user.id, code);
    bus.emit("message.react", { messageId: message.id, channelId: message.channelId, code, userId: user.id, added });
    json(res, 200, { added });
  });
}
