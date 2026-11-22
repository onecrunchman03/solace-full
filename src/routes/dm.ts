import { json, posIntParam, type Router } from "../http";
import type { AttachmentDTO } from "../types";
import { toPublicUser, type DmConversation, type DmMessage, type DmMessageWithReply, type ReplyPreview, type User } from "../types";
import { unownedEmoji } from "../text";
import { deleteAttachmentFile } from "../attachments";
import { parseAttachmentIds, postLimiter, POST_BURST, POST_WINDOW_MS } from "./messages";
import type { Store } from "../db/store";
import type { Bus } from "../bus";

const MAX_BODY = 4000;

/** Build the display shape of a conversation for one participant. */
function conversationFor(store: Store, convId: number, viewerId: number, otherId: number): DmConversation | null {
  const other = store.getUserById(otherId);
  if (!other) return null;
  return {
    id: convId,
    otherUser: toPublicUser(other),
    lastMessage: store.listDmMessages(convId, { limit: 1 })[0] ?? null,
    unread: store.dmUnreadCount(convId, viewerId),
  };
}

/** Attach a compact reply-preview to a DM (mirrors the channel-message enrich). */
export function withReply(store: Store, m: DmMessage, attachments?: Map<number, AttachmentDTO[]>): DmMessageWithReply {
  let replyTo: ReplyPreview | null = null;
  if (m.replyToId != null) {
    const r = store.getDmMessage(m.replyToId);
    if (r) {
      const u = store.getUserById(r.senderId);
      replyTo = {
        id: r.id,
        author: u ? { id: u.id, displayName: u.displayName } : null,
        excerpt: r.deletedAt ? "" : r.body.slice(0, 200),
        deleted: r.deletedAt != null,
      };
    }
  }
  // One attachments query per PAGE of history, not per message (the channel
  // path already batched; the DM path was N+1 — Sep 2026 review).
  const att = attachments ?? store.attachmentsFor("dm", [m.id]);
  return { ...m, replyTo, attachments: att.get(m.id) ?? [] };
}

/** Register direct-message routes. Delivery is recipient-scoped (see realtime.ts). */
/** Called after a DM lands — THE HOUSE'S BRAINS (src/npc) answer when the
 *  other participant is one of the three. Fires after the response is sent. */
export type DmHook = (user: User, conversationId: number, recipientId: number | null, message: DmMessage) => void;

export function registerDmRoutes(router: Router, onDm?: DmHook): void {
  // My conversations, most-recent first.
  router.get("/api/dm", "user", ({ res, user, store }) => {
    json(res, 200, { conversations: store.listConversationsFor(user.id) });
  });

  // Start (or reopen) a conversation with another user.
  router.post("/api/dm", "user", ({ res, body, user, store }) => {
    const otherId = Number(body?.userId);
    if (!Number.isInteger(otherId)) return json(res, 400, { error: "bad_user" });
    if (otherId === user.id) return json(res, 400, { error: "self_dm" });
    if (!store.getUserById(otherId)) return json(res, 404, { error: "user_not_found" });
    // A block in either direction closes the door (moderation layer).
    if (store.isBlockedEither(user.id, otherId)) return json(res, 403, { error: "blocked" });

    const conv = store.getOrCreateConversation(user.id, otherId);
    json(res, 200, { conversation: conversationFor(store, conv.id, user.id, otherId) });
  });

  // A page of a conversation's messages (participants only). Opening it reads it.
  router.get("/api/dm/:id/messages", "user", ({ res, params, url, user, store, bus }) => {
    const convId = Number(params.id);
    if (!store.isParticipant(convId, user.id)) return json(res, 403, { error: "forbidden" });

    const before = posIntParam(url.searchParams.get("before"));
    const messages = store.listDmMessages(convId, {
      // posIntParam: garbage (?limit=abc, 2.5) must never reach a SQL bind.
      before,
      limit: posIntParam(url.searchParams.get("limit")),
    });
    // Paging OLDER history is scrolling up a thread already open — it reads
    // nothing new, so it neither moves the cursor nor tells the other side.
    if (before != null) {
      const attachments = store.attachmentsFor("dm", messages.map((m) => m.id));
      return json(res, 200, { messages: messages.map((m) => withReply(store, m, attachments)) });
    }
    const lastReadId = store.markDmRead(convId, user.id);
    const otherId = store.dmOtherParticipant(convId, user.id);
    // READ RECEIPTS, both ways: tell the other side my cursor moved (if I
    // send receipts), and carry THEIR cursor back (if they do) so "Seen"
    // can render on a fresh open without waiting for a live frame.
    if (user.prefs.readReceipts !== false && otherId != null && lastReadId > 0) {
      bus.emit("dm.read", { userIds: [otherId], conversationId: convId, userId: user.id, lastReadId });
    }
    const theirLastReadId = otherId != null && user.prefs.readReceipts !== false ? store.dmLastRead(convId, otherId) : null;
    const attachments = store.attachmentsFor("dm", messages.map((m) => m.id));
    json(res, 200, { messages: messages.map((m) => withReply(store, m, attachments)), theirLastReadId });
  });

  // Send a direct message (participants only; owned-emoji rule applies).
  router.post("/api/dm/:id/messages", "user", ({ res, params, body, user, store, bus }) => {
    const convId = Number(params.id);
    const parts = store.conversationParticipants(convId);
    if (!parts || !parts.includes(user.id)) return json(res, 403, { error: "forbidden" });
    // Blocking after a conversation exists must still stop messages.
    const other = parts.find((p) => p !== user.id);
    if (other !== undefined && store.isBlockedEither(user.id, other)) {
      return json(res, 403, { error: "blocked" });
    }
    // Shared pool with channel posts — one flood budget per person, not per door.
    if (!postLimiter(`post:${user.id}`, POST_BURST, POST_WINDOW_MS)) {
      return json(res, 429, { error: "rate_limited" });
    }

    const text = String(body?.body ?? "").trim();
    const attachmentIds = parseAttachmentIds(body?.attachmentIds);
    if (attachmentIds === null) return json(res, 400, { error: "bad_attachments" });
    if (!text && !attachmentIds.length) return json(res, 400, { error: "empty_message" });
    if (text.length > MAX_BODY) return json(res, 400, { error: "message_too_long" });
    const bad = unownedEmoji(store, user.id, text);
    if (bad.length) return json(res, 403, { error: "unowned_emoji", codes: bad });

    let replyToId: number | null = null;
    if (body?.replyToId != null) {
      const target = store.getDmMessage(Number(body.replyToId));
      if (!target || target.conversationId !== convId) return json(res, 400, { error: "bad_reply" });
      replyToId = target.id;
    }

    // Create + claim atomically (same rule as channel messages): a bad
    // attachment id rolls the whole DM back.
    let created: DmMessage;
    try {
      created = store.transaction(() => {
        const m = store.createDmMessage(convId, user.id, text, replyToId);
        if (!store.claimAttachments(attachmentIds, user.id, "dm", m.id)) {
          throw new Error("bad_attachments");
        }
        return m;
      });
    } catch {
      return json(res, 400, { error: "bad_attachments" });
    }
    const message = withReply(store, created);
    store.markDmRead(convId, user.id); // the sender has, by definition, read it
    bus.emit("dm.message", { userIds: parts, message });
    json(res, 200, { message });
    onDm?.(user, convId, other ?? null, created);
  });

  // Mark a conversation read up to its latest message (participants only).
  router.post("/api/dm/:id/read", "user", ({ res, params, user, store, bus }) => {
    const convId = Number(params.id);
    if (!store.isParticipant(convId, user.id)) return json(res, 403, { error: "forbidden" });
    const lastReadId = store.markDmRead(convId, user.id);
    const otherId = store.dmOtherParticipant(convId, user.id);
    if (user.prefs.readReceipts !== false && otherId != null && lastReadId > 0) {
      bus.emit("dm.read", { userIds: [otherId], conversationId: convId, userId: user.id, lastReadId });
    }
    json(res, 200, { ok: true, unread: 0 });
  });

  // Edit your own direct message.
  router.patch("/api/dm/messages/:id", "user", ({ res, params, body, user, store, bus }) => {
    const message = store.getDmMessage(Number(params.id));
    // Someone else's message reads exactly like a missing one — a 403 here
    // was an existence oracle over the global DM message-id sequence.
    if (!message || message.senderId !== user.id) return json(res, 404, { error: "no_message" });
    if (message.deletedAt) return json(res, 403, { error: "forbidden" });
    // Blocking after a conversation exists must stop EDITS too — an edited
    // old message is pushed to the blocker's screen like a new one, which
    // made editing a working post-block contact channel (Aug 2026 review).
    const parts = store.conversationParticipants(message.conversationId);
    const other = parts?.find((p) => p !== user.id);
    if (other !== undefined && store.isBlockedEither(user.id, other)) {
      return json(res, 403, { error: "blocked" });
    }

    const text = String(body?.body ?? "").trim();
    if (!text) return json(res, 400, { error: "empty_message" });
    if (text.length > MAX_BODY) return json(res, 400, { error: "message_too_long" });
    const bad = unownedEmoji(store, user.id, text);
    if (bad.length) return json(res, 403, { error: "unowned_emoji", codes: bad });

    const updated = withReply(store, store.editDmMessage(message.id, text)!);
    emitToParticipants(store, bus, "dm.message.update", updated);
    json(res, 200, { message: updated });
  });

  // Delete (tombstone) your own direct message.
  router.del("/api/dm/messages/:id", "user", ({ res, params, user, store, bus }) => {
    const message = store.getDmMessage(Number(params.id));
    // Same oracle rule as the edit route: not yours = not found. Deleting
    // stays allowed under a block — a tombstone only REMOVES content.
    if (!message || message.senderId !== user.id) return json(res, 404, { error: "no_message" });
    if (message.deletedAt) return json(res, 403, { error: "forbidden" });

    // A deleted DM's files stop being served immediately (the row stays).
    for (const f of store.purgeAttachmentsForMessage("dm", message.id)) deleteAttachmentFile(f.file);
    const tombstone = withReply(store, store.deleteDmMessage(message.id)!);
    emitToParticipants(store, bus, "dm.message.delete", tombstone);
    json(res, 200, { message: tombstone });
  });
}

/** Emit a DM event to just the conversation's two participants. */
function emitToParticipants(
  store: Store,
  bus: Bus,
  event: "dm.message.update" | "dm.message.delete",
  message: DmMessageWithReply,
): void {
  const parts = store.conversationParticipants(message.conversationId);
  if (parts) bus.emit(event, { userIds: parts, message });
}
