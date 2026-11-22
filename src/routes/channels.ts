import { json, type Router, makeRateLimiter } from "../http";
import { canSeePage, canEnterPage } from "../permissions";
import { mayEnterChannel, visibleChannels } from "../pagescope";
import { mayCreateChannel, mayManageChannel } from "../pageauth";
import { disposeAttachmentFiles } from "../federation/files";
import type { Store } from "../db/store";
import { GENERAL_PAGE_ID, type Channel, type ChannelDTO } from "../types";

/** Clean up a channel name: collapse whitespace, trim, cap length. */
function normalizeName(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

function normalizeTopic(raw: unknown): string | null {
  if (raw == null) return null;
  const t = String(raw).replace(/[\r\n]+/g, " ").trim().slice(0, 200);
  return t === "" ? null : t;
}

/** Serialize a channel for clients, attaching the post allow-list (empty when open). */
function dto(store: Store, channel: Channel): ChannelDTO {
  return {
    ...channel,
    postAllow: channel.locked ? store.postAllowList(channel.id) : [],
    viewRoles: store.channelRoleIds(channel.id, "view"),
    postRoles: store.channelRoleIds(channel.id, "post"),
  };
}

/** Register all channel routes on the router. */
/** Channels a single page may hold, and how fast one member may add them
 *  (review round 2): every client re-derives unread counts per channel on
 *  boot and on every reconnect, so channel count is a cost everyone pays. */
export const MAX_CHANNELS_PER_PAGE = 200;
export const CHANNEL_CREATE_BURST = 20;
export const CHANNEL_CREATE_WINDOW_MS = 10 * 60_000;
/** The allow-list is a set of members — it can never usefully exceed this. */
export const MAX_ALLOW_LIST = 500;

export function registerChannelRoutes(router: Router): void {
  const rateLimit = makeRateLimiter();
  // Everyone sees every channel (reading stays open even for locked channels).
  // `unread` maps channelId → count of live messages from others since the
  // caller's read cursor (channels at zero are omitted).
  // Scoped to the PAGES the caller may see (migration 63): a private page's
  // channels are not served to non-members at all, so its structure stays as
  // private as its messages.
  router.get("/api/channels", "user", ({ res, user, store }) => {
    const roles = store.pageRolesFor(user.id);
    const visible = new Set(
      store.listPages().filter((p) => canSeePage(user, p, roles.get(p.id) ?? null)).map((p) => p.id),
    );
    // PAGE ROLES: a VIEW-gated channel is absent from the list — and from
    // the unread map, or its badge would count a room that isn't there.
    const mine = visibleChannels(store, user);
    const ids = new Set(mine.map((c) => c.id));
    const unread = store.channelUnreads(user.id, [...visible]);
    for (const k of Object.keys(unread)) if (!ids.has(Number(k))) delete unread[Number(k)];
    json(res, 200, { channels: mine.map((c) => dto(store, c)), unread });
  });

  // Move the caller's read cursor to the channel's newest message. Fired by the
  // client when a message arrives in the channel it's actively viewing.
  router.post("/api/channels/:id/read", "user", ({ res, params, user, store, bus }) => {
    const channel = store.getChannel(Number(params.id));
    if (!channel) return json(res, 404, { error: "no_channel" });
    if (!mayEnterChannel(store, user, channel)) return json(res, 404, { error: "no_channel" });
    const before = store.channelReadCursor(channel.id, user.id);
    const lastReadId = store.markChannelRead(channel.id, user.id);
    // READ RECEIPTS: the cursor rides to the page (like every channel frame)
    // unless this account keeps its reading to itself.
    // Only when the cursor MOVED (Oct 2026 review): a re-read is a no-op the
    // whole page needn't hear about.
    if (user.prefs.readReceipts !== false && lastReadId > before) {
      bus.emit("read.cursor", { channelId: channel.id, userId: user.id, lastReadId });
    }
    json(res, 200, { ok: true, lastReadId });
  });

  // READ RECEIPTS: who has read how far in a channel (members' cursors,
  // minus anyone who opted out). The caller's own row is included; the
  // client drops it.
  router.get("/api/channels/:id/readers", "user", ({ res, params, user, store }) => {
    const channel = store.getChannel(Number(params.id));
    if (!channel) return json(res, 404, { error: "no_channel" });
    if (!mayEnterChannel(store, user, channel)) return json(res, 404, { error: "no_channel" });
    // The WhatsApp rule both ways: an account that keeps its reading to
    // itself sees nobody else's. And only people who can actually enter the
    // channel read it — a cursor left behind by a removed member, or one
    // backfilled for a non-member of a private page, is not a reader.
    if (user.prefs.readReceipts === false) return json(res, 200, { readers: [] });
    const readers = store.channelReaders(channel.id).filter((r) => {
      const u = store.getUserById(r.userId);
      return !!u && mayEnterChannel(store, u, channel);
    });
    json(res, 200, { readers });
  });

  // Create a channel. With `parentId` it's a sub-channel — allowed only under a
  // top-level channel you manage (owner or admin), and only one level deep.
  // `kind: "voice"` creates a voice channel (same permission model; the
  // locked+allow-list gates who may JOIN the room).
  router.post("/api/channels", "user", ({ res, body, user, store, bus }) => {
    if (user.disabled) return json(res, 403, { error: "forbidden" });
    const name = normalizeName(body.name);
    if (!name) return json(res, 400, { error: "bad_name", message: "Channel name is required" });
    const kind = body.kind === "voice" ? "voice" : "text";

    // WHICH PAGE? A channel is always inside one, and you must be able to
    // enter that page to add to it. Sub-channels inherit their parent's.
    let parentId: number | null = null;
    let pageId = body.pageId == null ? GENERAL_PAGE_ID : Number(body.pageId);
    if (body.parentId != null) {
      const parent = store.getChannel(Number(body.parentId));
      // Invisible = nonexistent, on every route that takes a channel id —
      // a 403 where a missing id gives 404 is an existence probe over
      // private pages' channels (Aug 2026 review).
      if (!parent || !mayEnterChannel(store, user, parent)) return json(res, 404, { error: "no_parent" });
      if (parent.parentId != null) return json(res, 400, { error: "nested_too_deep" });
      if (!mayManageChannel(store, user, parent)) {
        return json(res, 403, { error: "forbidden" });
      }
      parentId = parent.id;
      pageId = parent.pageId;
    }
    const page = store.getPage(pageId);
    // A private page you can't enter reads as no page at all (no 403 probe).
    if (!page || !canEnterPage(user, page, store.pageRole(page.id, user.id))) {
      return json(res, 404, { error: "no_page" });
    }
    // PAGE ROLES: creating a room is a permission of the page now
    // (@everyone starts with it, so nothing changes until a manager says).
    if (!mayCreateChannel(store, user, page.id)) return json(res, 403, { error: "forbidden" });
    if (!user.isAdmin && !rateLimit(`chcreate:${user.id}`, CHANNEL_CREATE_BURST, CHANNEL_CREATE_WINDOW_MS)) {
      return json(res, 429, { error: "rate_limited" });
    }
    if (store.countChannelsInPage(page.id) >= MAX_CHANNELS_PER_PAGE) {
      return json(res, 409, { error: "page_full", max: MAX_CHANNELS_PER_PAGE });
    }

    const channel = store.createChannel({
      name,
      topic: normalizeTopic(body.topic),
      createdBy: user.id,
      parentId,
      kind,
      pageId,
    });
    const out = dto(store, channel);
    bus.emit("channel.create", { channel: out });
    json(res, 200, { channel: out });
  });

  // Reorder a sibling group (admin only — the router returns 403 otherwise).
  // `ids` is the complete, ordered list of channels sharing one parent.
  router.post("/api/channels/reorder", "admin", ({ res, body, store, bus }) => {
    const ids: unknown = body.ids;
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((n) => Number.isInteger(n))) {
      return json(res, 400, { error: "bad_order" });
    }
    const channels = (ids as number[]).map((id) => store.getChannel(id));
    if (channels.some((c) => !c)) return json(res, 404, { error: "no_channel" });
    const parents = new Set(channels.map((c) => c!.parentId));
    if (parents.size > 1) return json(res, 400, { error: "mixed_parents" });

    store.reorderChannels(ids as number[]);
    const fresh = store.listChannels().map((c) => dto(store, c));
    bus.emit("channels.reorder", { channels: fresh });
    json(res, 200, { channels: fresh });
  });

  // A single channel.
  router.get("/api/channels/:id", "user", ({ res, params, user, store }) => {
    const channel = store.getChannel(Number(params.id));
    if (!channel) return json(res, 404, { error: "no_channel" });
    // A private page does not leak its channel names/topics by id either.
    if (!mayEnterChannel(store, user, channel)) return json(res, 404, { error: "no_channel" });
    json(res, 200, { channel: dto(store, channel) });
  });

  // Rename / set topic / lock — owner or admin only.
  router.patch("/api/channels/:id", "user", ({ res, params, body, user, store, bus }) => {
    const channel = store.getChannel(Number(params.id));
    // Invisible = nonexistent (no 403-vs-404 existence probe on private pages).
    if (!channel || !mayEnterChannel(store, user, channel)) return json(res, 404, { error: "no_channel" });
    if (!mayManageChannel(store, user, channel)) return json(res, 403, { error: "forbidden" });

    const fields: { name?: string; topic?: string | null; locked?: boolean } = {};
    if (body.name !== undefined) {
      const name = normalizeName(body.name);
      if (!name) return json(res, 400, { error: "bad_name" });
      fields.name = name;
    }
    if (body.topic !== undefined) fields.topic = normalizeTopic(body.topic);
    if (body.locked !== undefined) fields.locked = !!body.locked;

    // THE PAGE'S DEFAULT CHANNEL. This is a page-wide decision, not a
    // channel one, so it takes page authority rather than channel ownership:
    // an admin, or a manager of THIS page (a moderator qualifies only via
    // their manager row — Sep 2026 scoping). Voice rooms can't land.
    if (body.makeDefault !== undefined) {
      const page = store.getPage(channel.pageId);
      const role = store.pageRole(channel.pageId, user.id);
      if (!page) return json(res, 404, { error: "no_page" });
      if (!(user.isAdmin || role === "manager")) {
        return json(res, 403, { error: "forbidden" });
      }
      if (body.makeDefault && channel.kind === "voice") return json(res, 400, { error: "voice_cannot_default" });
      store.updatePage(page.id, { defaultChannelId: body.makeDefault ? channel.id : null });
      // `role` here is the ACTOR's; realtime re-resolves it per recipient.
      bus.emit("page.change", {
        page: { ...store.getPage(page.id)!, role, members: store.pageMemberCount(page.id), online: 0 },
        members: store.pageMembers(page.id).map((m) => m.userId),
      });
    }

    const updated = store.updateChannel(channel.id, fields)!;
    const out = dto(store, updated);
    bus.emit("channel.update", { channel: out });
    json(res, 200, { channel: out });
  });

  // Read a locked channel's post allow-list — managers only.
  router.get("/api/channels/:id/allow", "user", ({ res, params, user, store }) => {
    const channel = store.getChannel(Number(params.id));
    // Invisible = nonexistent (no 403-vs-404 existence probe on private pages).
    if (!channel || !mayEnterChannel(store, user, channel)) return json(res, 404, { error: "no_channel" });
    if (!mayManageChannel(store, user, channel)) return json(res, 403, { error: "forbidden" });
    json(res, 200, { userIds: store.postAllowList(channel.id) });
  });

  // Replace a channel's post allow-list — managers only.
  router.patch("/api/channels/:id/allow", "user", ({ res, params, body, user, store, bus }) => {
    const channel = store.getChannel(Number(params.id));
    // Invisible = nonexistent (no 403-vs-404 existence probe on private pages).
    if (!channel || !mayEnterChannel(store, user, channel)) return json(res, 404, { error: "no_channel" });
    if (!mayManageChannel(store, user, channel)) return json(res, 403, { error: "forbidden" });

    const raw: unknown = body.userIds;
    // Length FIRST — the per-id user lookups below must never run over a
    // megabyte of ids (review round 2).
    if (!Array.isArray(raw) || raw.length > MAX_ALLOW_LIST || !raw.every((n) => Number.isInteger(n))) {
      return json(res, 400, { error: "bad_allow_list" });
    }
    // Keep only ids that map to real users, de-duplicated.
    const valid = [...new Set(raw as number[])].filter((id) => store.getUserById(id));
    store.setPostAllow(channel.id, valid);

    const out = dto(store, store.getChannel(channel.id)!);
    bus.emit("channel.update", { channel: out });
    json(res, 200, { channel: out });
  });

  // Delete — owner or admin only. Cascades to sub-channels; never empties the app.
  router.del("/api/channels/:id", "user", ({ res, params, user, store, bus }) => {
    const channel = store.getChannel(Number(params.id));
    // Invisible = nonexistent (no 403-vs-404 existence probe on private pages).
    if (!channel || !mayEnterChannel(store, user, channel)) return json(res, 404, { error: "no_channel" });
    if (!mayManageChannel(store, user, channel)) return json(res, 403, { error: "forbidden" });

    const childIds = store.childChannelIds(channel.id);
    // Never strand a PAGE with nowhere to talk. This used to count every
    // channel on the server, which meant Solace General's own #general was
    // deletable only if some other page happened to have channels — and,
    // worse, a page could be emptied completely as long as another page had
    // rooms. Scoped per page, and voice rooms don't count as somewhere to talk.
    if (channel.kind !== "voice") {
      const textGoing = 1 + childIds.filter((id) => (store.getChannel(id)?.kind ?? "text") !== "voice").length;
      if (store.countPageTextChannels(channel.pageId) - textGoing < 1) {
        return json(res, 409, { error: "last_channel" });
      }
    }

    // The room's images stop being served the moment the room goes — same
    // rule as deleting a single message (rows purge BEFORE the cascade).
    const files = store.purgeAttachmentsForChannels([channel.id, ...childIds]);
    store.deleteChannel(channel.id);
    disposeAttachmentFiles(files);
    // Tell clients to drop the channel and every sub-channel it took with it.
    for (const id of [channel.id, ...childIds]) bus.emit("channel.delete", { channelId: id, pageId: channel.pageId });
    json(res, 200, { ok: true });
  });
}
