// PAGES — communities that house channels (Josh, Aug 2026).
//
// The layer above everything chat was: a page owns channels, has its own name,
// description and icon, and decides who may see it. Josh's rules, verbatim:
//   · admins may create, modify and delete pages
//   · MODERATORS may also create them, and are the only other people who can
//     add members to a page
//   · inside a page, a member may be made a MANAGER — authority over that
//     page and nothing else
//   · everybody, existing and new, belongs to SOLACE GENERAL, which holds
//     everything chat had before pages and can never be deleted or left
//
// Private pages are genuinely private: they are not listed, their channels
// are not served, and their realtime traffic is addressed to members only
// (the DM recipient-scoping rule, applied to a room instead of a pair).
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { json, readRawBody, type Router, makeRateLimiter } from "../http";
import { uploadAllowed } from "./profile";
import { config } from "../config";
import {
  canAnswerPageRequests,
  canCreatePage,
  canDeletePage,
  canDiscoverPage,
  canEditPage,
  canManagePageMembers,
  canSeePage,
} from "../permissions";
import type { Store } from "../db/store";
import { disposeAttachmentFiles } from "../federation/files";
import { mayManageMembers, mayAnswerRequests } from "../pageauth";
import { satelliteConnected } from "../federation/link";
import { GENERAL_PAGE_ID, PAGE_DAYS_MIN, PAGE_DAYS_MAX, toPublicUser, type Page, type PageDTO, type PageJoinPolicy, type PageRole } from "../types";

/** A retention dial: null clears it, otherwise an integer number of days
 *  inside the sane range. Undefined = untouched. Anything else = invalid. */
function parseDays(v: unknown): number | null | undefined | false {
  if (v === undefined) return undefined;
  if (v === null || v === "" ) return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < PAGE_DAYS_MIN || n > PAGE_DAYS_MAX) return false;
  return n;
}

const ICON_DIR = path.join(config.uploadsDir, "pageicons");
const MAX_ICON_BYTES = 2 * 1024 * 1024;
const MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
};
const SAFE_FILE = /^[A-Za-z0-9._-]+$/;

/** Type from the BYTES, never the client's word for it — the same rule every
 *  other upload surface here follows. */
function sniffExt(b: Buffer): string | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return ".png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ".jpg";
  if (b.length > 6 && b.toString("ascii", 0, 3) === "GIF") return ".gif";
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return ".webp";
  return null;
}

function normName(raw: unknown): string {
  return String(raw ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}
function normDesc(raw: unknown): string | null {
  if (raw == null) return null;
  const t = String(raw).replace(/[\r\n]+/g, " ").trim().slice(0, 240);
  return t === "" ? null : t;
}

function parsePolicy(raw: unknown): PageJoinPolicy | null {
  return raw === "open" || raw === "request" || raw === "invite" ? raw : null;
}

export function registerPageRoutes(router: Router, onlineIds: () => number[]): void {
  // Joining, leaving and knocking each fan a per-recipient page.change to
  // every online socket (review round 2) — a door, not a metronome.
  const doorLimit = makeRateLimiter();
  const throughTheDoor = (userId: number): boolean => doorLimit(`pagedoor:${userId}`, 12, 60_000);
  fs.mkdirSync(ICON_DIR, { recursive: true });

  const dto = (store: Store, page: Page, role: PageRole | null, online: Set<number>): PageDTO => {
    const members = store.pageMembers(page.id);
    return {
      ...page,
      role,
      members: members.length,
      online: members.reduce((n, m) => n + (online.has(m.userId) ? 1 : 0), 0),
      // The knock badge: a plain count, shown by the client only to those
      // who can answer (managers/staff). Not secret — "N people asked".
      pending: page.joinPolicy === "request" ? store.pageRequestCount(page.id) : 0,
      remoteUp: page.satelliteId != null ? satelliteConnected(page.satelliteId) : undefined,
    };
  };

  /** Resolve the page and the caller's standing, refusing anything they
   *  shouldn't even know exists (a private page 404s rather than 403s). */
  const resolve = (
    store: Store,
    user: { id: number; isAdmin: boolean; role: string; disabled: boolean },
    id: unknown,
  ): { page: Page; role: PageRole | null } | null => {
    const page = store.getPage(Number(id));
    if (!page) return null;
    const role = store.pageRole(page.id, user.id);
    if (!canSeePage(user as never, page, role)) return null;
    return { page, role };
  };

  // Every page the caller may know about, with their standing and the counts
  // the picker shows. Discoverable-but-private pages ride along as CARDS —
  // the client shows the knock/invite affordance; their channels stay 404.
  // BATCHED (Sep 2026): this used to run three queries per page (members,
  // request count, own-knock probe); now it's four queries however many
  // pages exist. A non-member's card of a non-public page also drops the
  // ids inside it (landing channel, creator) — the card contract is name/
  // icon/description/counts.
  router.get("/api/pages", "user", ({ res, user, store }) => {
    const online = new Set(onlineIds());
    const memberships = store.allPageMemberships();
    const pendingCounts = store.pageRequestCounts();
    const myKnocks = store.pageRequestIdsFor(user.id);
    // The caller's roles fall out of the membership scan — no extra query.
    const roles = new Map<number, PageRole>();
    for (const [pid, rows] of memberships) {
      const mine = rows.find((m) => m.userId === user.id);
      if (mine) roles.set(pid, mine.role);
    }
    // Insider-for-stripping means ADMIN — a moderator reads a page like any
    // member of it (Sep 2026 scoping).
    const staff = user.isAdmin;
    const pages = store
      .listPages()
      .filter((p) => canDiscoverPage(user, p, roles.get(p.id) ?? null))
      .map((p) => {
        const rows = memberships.get(p.id) ?? [];
        const role = roles.get(p.id) ?? null;
        const card: PageDTO & { requested: boolean } = {
          ...p,
          role,
          members: rows.length,
          online: rows.reduce((n, m) => n + (online.has(m.userId) ? 1 : 0), 0),
          pending: p.joinPolicy === "request" ? (pendingCounts.get(p.id) ?? 0) : 0,
          requested: myKnocks.has(p.id),
          remoteUp: p.satelliteId != null ? satelliteConnected(p.satelliteId) : undefined,
        };
        if (role === null && !p.isPublic && !staff) {
          card.defaultChannelId = null;
          card.botChannelId = null;
          card.createdBy = 0;
        }
        return card;
      });
    json(res, 200, { pages });
  });

  router.post("/api/pages", "user", ({ res, body, user, store, bus }) => {
    if (!canCreatePage(user)) return json(res, 403, { error: "forbidden" });
    const name = normName(body.name);
    if (!name) return json(res, 400, { error: "bad_name", message: "A page needs a name" });
    // joinPolicy + discoverable (migration 77); the old isPublic boolean is
    // still honoured as open vs invite+hidden for any stale client.
    const policy = parsePolicy(body.joinPolicy) ?? (body.isPublic === false ? "invite" : "open");
    const page = store.createPage({
      name,
      description: normDesc(body.description),
      joinPolicy: policy,
      discoverable: body.discoverable !== undefined ? !!body.discoverable : policy === "open",
      createdBy: user.id,
    });
    const online = new Set(onlineIds());
    bus.emit("page.change", { page: dto(store, page, "manager", online), members: [user.id] });
    json(res, 200, { page: dto(store, page, "manager", online) });
  });

  router.patch("/api/pages/:id", "user", ({ res, params, body, user, store, bus }) => {
    const found = resolve(store, user, params.id);
    if (!found) return json(res, 404, { error: "no_page" });
    if (!canEditPage(user, found.page, found.role)) return json(res, 403, { error: "forbidden" });
    const fields: {
      name?: string;
      description?: string | null;
      joinPolicy?: PageJoinPolicy;
      discoverable?: boolean;
      defaultChannelId?: number | null;
      botChannelId?: number | null;
      allowImages?: boolean;
      allowGifs?: boolean;
      staticDays?: number | null;
      animatedDays?: number | null;
      messageDays?: number | null;
    } = {};
    // PAGE CHAT POLICY (migration 89) — the page's authority sets what its
    // rooms accept and how long it keeps things.
    if (body.allowImages !== undefined) fields.allowImages = !!body.allowImages;
    if (body.allowGifs !== undefined) fields.allowGifs = !!body.allowGifs;
    for (const key of ["staticDays", "animatedDays", "messageDays"] as const) {
      const d = parseDays(body[key]);
      if (d === false) return json(res, 400, { error: "bad_days" });
      if (d !== undefined) fields[key] = d;
    }
    if (body.name !== undefined) {
      const n = normName(body.name);
      if (!n) return json(res, 400, { error: "bad_name" });
      fields.name = n;
    }
    if (body.description !== undefined) fields.description = normDesc(body.description);
    // The general page stays open + discoverable — it is the front door.
    if (found.page.id !== GENERAL_PAGE_ID) {
      if (body.joinPolicy !== undefined) {
        const p = parsePolicy(body.joinPolicy);
        if (!p) return json(res, 400, { error: "bad_policy" });
        fields.joinPolicy = p;
      }
      if (body.discoverable !== undefined) fields.discoverable = !!body.discoverable;
      // The old boolean still steers stale clients: public = open,
      // private = invite + hidden.
      if (body.isPublic !== undefined && body.joinPolicy === undefined) {
        fields.joinPolicy = body.isPublic ? "open" : "invite";
        if (body.discoverable === undefined) fields.discoverable = !!body.isPublic;
      }
    }
    // THE LANDING CHANNEL, from the page's own settings (it was settable
    // only from a channel's dialog before). Must be one of this page's own
    // text channels; null clears it.
    if (body.defaultChannelId !== undefined) {
      if (body.defaultChannelId === null) {
        fields.defaultChannelId = null;
      } else {
        const ch = store.getChannel(Number(body.defaultChannelId));
        if (!ch || ch.pageId !== found.page.id || ch.kind === "voice") {
          return json(res, 400, { error: "bad_default" });
        }
        fields.defaultChannelId = ch.id;
      }
    }
    // WHERE THE HOUSE TALKS TO ITSELF (migration 102). ADMIN-ONLY, unlike
    // every other field on this dialog: the three bots are the HOUSE's voice,
    // not the page's, so redirecting Sterling is the Operator's call and not
    // a thing a page manager decides. A LOCKED channel is a legal pick here —
    // a read-only room the bots babble into is the tidiest version of this —
    // so the only checks are that it exists, belongs to this page, and can
    // hold text.
    if (body.botChannelId !== undefined) {
      if (!user.isAdmin) return json(res, 403, { error: "admin_only" });
      if (body.botChannelId === null) {
        fields.botChannelId = null;
      } else {
        const ch = store.getChannel(Number(body.botChannelId));
        if (!ch || ch.pageId !== found.page.id || ch.kind === "voice") {
          return json(res, 400, { error: "bad_bot_channel" });
        }
        fields.botChannelId = ch.id;
      }
    }
    // A policy flip away from "request" clears the pending knocks (in
    // updatePage) — capture the requesters first so they can be TOLD their
    // knock is gone; their frame's `requested` goes false with it.
    const leavingRequest =
      fields.joinPolicy !== undefined &&
      fields.joinPolicy !== "request" &&
      found.page.joinPolicy === "request";
    const requesters = leavingRequest ? store.pageRequests(found.page.id).map((r) => r.userId) : [];
    const wasVisible = found.page.isPublic || found.page.discoverable;
    const page = store.updatePage(found.page.id, fields)!;
    // A page that just turned INVISIBLE must still reach the outsiders
    // holding its card — the frame they get (role null, hidden) is what
    // tells their picker to drop it.
    const nowVisible = page.isPublic || page.discoverable;
    pushPage(store, bus, page, onlineIds, { alsoTell: requesters, tellAll: wasVisible && !nowVisible });
    json(res, 200, { page: dto(store, page, found.role, new Set(onlineIds())) });
  });

  router.del("/api/pages/:id", "user", ({ res, params, user, store, bus }) => {
    // resolve() first: a hidden page must 404 here like everywhere else — a
    // bare getPage made this route the one existence probe left standing
    // (403 for a real hidden id, 404 for a missing one; Sep 2026 review).
    const found = resolve(store, user, params.id);
    if (!found) return json(res, 404, { error: "no_page" });
    const page = found.page;
    if (!canDeletePage(user, page)) {
      return json(res, 403, { error: page.id === GENERAL_PAGE_ID ? "cannot_delete_general" : "forbidden" });
    }
    // A satellite's page is bound to its link: delete it here and the next
    // handshake re-creates it (open, discoverable) with its history vetted
    // away as fabricated. The kill switch for a community is the DELIST in
    // Admin Panel → Satellites, which takes the page with it (Sep 2026 review).
    if (page.satelliteId != null) {
      return json(res, 409, { error: "satellite_page", message: "Delist the satellite instead — the page follows its link." });
    }
    const members = memberIds(store, page);
    // Every room's images stop being served with the page (the channel-delete
    // rule, applied to the whole cascade — purge rows BEFORE they go).
    const chanIds = store.listChannels().filter((c) => c.pageId === page.id).map((c) => c.id);
    const files = store.purgeAttachmentsForChannels(chanIds);
    const r = store.deletePage(page.id);
    if (!r.ok) return json(res, 403, { error: "cannot_delete_general" });
    disposeAttachmentFiles(files);
    if (page.icon) deleteIcon(page.icon);
    store.audit(user.id, "page.delete", `page ${page.id} "${page.name}" (${r.channels} channels)`);
    // A page whose card was public knowledge vanishes from EVERY picker —
    // targeting members only left stale cards on outsiders' screens.
    bus.emit("page.gone", { pageId: page.id, members, tellAll: page.isPublic || page.discoverable });
    json(res, 200, { ok: true, channels: r.channels });
  });

  // THE ICON. Josh: "you can change by clicking on the icon of the page."
  router.postRaw("/api/pages/:id/icon", "user", async ({ req, res, params, user, store, bus }) => {
    const found = resolve(store, user, params.id);
    if (!found) return json(res, 404, { error: "no_page" });
    if (!canEditPage(user, found.page, found.role)) return json(res, 403, { error: "forbidden" });
    if (!uploadAllowed(user.id)) return json(res, 429, { error: "rate_limited" });
    let buf: Buffer;
    try {
      buf = await readRawBody(req, MAX_ICON_BYTES);
    } catch {
      return json(res, 413, { error: "file_too_large" });
    }
    if (!buf.length) return json(res, 400, { error: "empty" });
    const ext = sniffExt(buf);
    if (!ext) return json(res, 415, { error: "unsupported_type" });
    const name = `${randomUUID()}${ext}`;
    fs.writeFileSync(path.join(ICON_DIR, name), buf);
    // Re-read AFTER the body: `found.page.icon` predates the await, so two
    // parallel uploads would both "replace" the same old file and orphan one.
    const previous = store.getPage(found.page.id)?.icon ?? null;
    const page = store.updatePage(found.page.id, { icon: name })!;
    if (previous && previous !== name) deleteIcon(previous);
    const online = new Set(onlineIds());
    bus.emit("page.change", { page: dto(store, page, found.role, online), members: memberIds(store, page) });
    json(res, 200, { icon: name });
  });

  router.del("/api/pages/:id/icon", "user", ({ res, params, user, store, bus }) => {
    const found = resolve(store, user, params.id);
    if (!found) return json(res, 404, { error: "no_page" });
    if (!canEditPage(user, found.page, found.role)) return json(res, 403, { error: "forbidden" });
    const previous = found.page.icon;
    const page = store.updatePage(found.page.id, { icon: null })!;
    deleteIcon(previous);
    const online = new Set(onlineIds());
    bus.emit("page.change", { page: dto(store, page, found.role, online), members: memberIds(store, page) });
    json(res, 200, { ok: true });
  });

  // Public so <img> can load it, UUID-named and immutable like avatars.
  router.get("/pageicons/:file", "none", ({ res, params }) => {
    const { file } = params;
    const ext = path.extname(file).toLowerCase();
    if (!SAFE_FILE.test(file) || !MIME[ext]) return json(res, 404, { error: "not_found" });
    const p = path.join(ICON_DIR, file);
    if (!p.startsWith(ICON_DIR) || !fs.existsSync(p)) return json(res, 404, { error: "not_found" });
    res.writeHead(200, { "content-type": MIME[ext], "cache-control": "public, max-age=31536000, immutable" });
    fs.createReadStream(p).pipe(res);
  });

  // ---- Membership ----------------------------------------------------------

  router.get("/api/pages/:id/members", "user", ({ res, params, user, store }) => {
    const found = resolve(store, user, params.id);
    if (!found) return json(res, 404, { error: "no_page" });
    const rows = store.pageMembers(found.page.id);
    const online = new Set(onlineIds());
    json(res, 200, {
      members: rows
        .map((m) => {
          const u = store.getUserById(m.userId);
          return u ? { user: toPublicUser(u), role: m.role, online: online.has(m.userId), since: m.addedAt } : null;
        })
        .filter(Boolean),
    });
  });

  // Add somebody. Admins anywhere; a moderator only in a page they MANAGE
  // (Sep 2026 scoping). A plain manager still can't — who gets in stays a
  // staff-hands decision, per the original rule.
  router.post("/api/pages/:id/members", "user", ({ res, params, body, user, store, bus }) => {
    const found = resolve(store, user, params.id);
    if (!found) return json(res, 404, { error: "no_page" });
    if (!mayManageMembers(store, user, found.page)) return json(res, 403, { error: "forbidden" });
    const target = store.getUserById(Number(body.userId));
    // A scrubbed account must stay out of pages — re-adding one would
    // recreate the exact ghost migration 78 exists to sweep. Deleted reads
    // as nonexistent; Sterling moderates nothing and joins nothing.
    if (!target || target.deletedAt) return json(res, 404, { error: "no_user" });
    if (target.isBot) return json(res, 403, { error: "cannot_touch_bot" });
    const role: PageRole = body.role === "manager" ? "manager" : "member";
    // PROMOTION TO MANAGER STAYS THE STAFF RULE (Oct 2026 review). This route
    // is gated by mayManageMembers, which a "manage_members" page ROLE passes,
    // and it promoted with no further check: a role holder could make
    // themselves (or an alt) a manager — every power on the page. The PATCH
    // route always had the right gate; this one now asks the same question.
    if (role === "manager" && !canManagePageMembers(user, found.page, found.role)) {
      return json(res, 403, { error: "forbidden" });
    }
    const existing = store.pageRole(found.page.id, target.id);
    store.addPageMember(found.page.id, target.id, role);
    if (role === "manager" && existing !== null) store.setPageRole(found.page.id, target.id, "manager");
    pushPage(store, bus, found.page, onlineIds);
    json(res, 200, { ok: true });
  });

  router.patch("/api/pages/:id/members/:userId", "user", ({ res, params, body, user, store, bus }) => {
    const found = resolve(store, user, params.id);
    if (!found) return json(res, 404, { error: "no_page" });
    if (!canManagePageMembers(user, found.page, found.role)) return json(res, 403, { error: "forbidden" });
    const uid = Number(params.userId);
    if (store.pageRole(found.page.id, uid) === null) return json(res, 404, { error: "not_a_member" });
    store.setPageRole(found.page.id, uid, body.role === "manager" ? "manager" : "member");
    pushPage(store, bus, found.page, onlineIds);
    json(res, 200, { ok: true });
  });

  router.del("/api/pages/:id/members/:userId", "user", ({ res, params, user, store, bus }) => {
    const found = resolve(store, user, params.id);
    if (!found) return json(res, 404, { error: "no_page" });
    if (!mayManageMembers(store, user, found.page)) return json(res, 403, { error: "forbidden" });
    const uid = Number(params.userId);
    // …and neither is removing one: a role holder could take the managers
    // (a satellite page's host included) off their own page.
    if (store.pageRole(found.page.id, uid) === "manager" && !canManagePageMembers(user, found.page, found.role)) {
      return json(res, 403, { error: "forbidden" });
    }
    const was = memberIds(store, found.page);
    store.removePageMember(found.page.id, uid);
    pushPage(store, bus, found.page, onlineIds, { alsoTell: was });
    json(res, 200, { ok: true });
  });

  /** Like resolve(), but admits DISCOVERABLE pages too — the join/knock
   *  routes exist precisely for pages the caller can't see into yet. */
  const resolveDiscover = (
    store: Store,
    user: { id: number; isAdmin: boolean; role: string; disabled: boolean },
    id: unknown,
  ): { page: Page; role: PageRole | null } | null => {
    const page = store.getPage(Number(id));
    if (!page) return null;
    const role = store.pageRole(page.id, user.id);
    if (!canDiscoverPage(user as never, page, role)) return null;
    return { page, role };
  };

  // The door, by policy (migration 77): OPEN — walking in enrols you.
  // REQUEST — this files a knock for the page's managers/staff to answer.
  // INVITE — refused; members are added by hand.
  router.post("/api/pages/:id/join", "user", ({ res, params, user, store, bus }) => {
    const found = resolveDiscover(store, user, params.id);
    if (!found) return json(res, 404, { error: "no_page" });
    if (found.role) return json(res, 200, { ok: true, joined: true });
    if (!throughTheDoor(user.id)) return json(res, 429, { error: "rate_limited" });
    if (found.page.joinPolicy === "invite") return json(res, 403, { error: "invite_only" });
    if (found.page.joinPolicy === "request") {
      // The managers' knock badge + the requester's own "requested" state
      // both ride the ordinary page.change (per-recipient in realtime) —
      // but only when this call actually FILED one: a repeat knock is a
      // no-op, not a free re-light of every manager's badge.
      if (store.addPageRequest(found.page.id, user.id)) {
        pushPage(store, bus, found.page, onlineIds, { alsoTell: [user.id] });
      }
      return json(res, 200, { ok: true, requested: true });
    }
    store.addPageMember(found.page.id, user.id);
    pushPage(store, bus, found.page, onlineIds);
    json(res, 200, { ok: true, joined: true });
  });

  // Withdraw your own knock. A knock you FILED can always be withdrawn, even
  // if the page turned hidden since — you knew it existed when you knocked,
  // so honouring the withdrawal reveals nothing new. Without a knock, the
  // discover-aware 404 stands (a hidden page reads as no page at all).
  router.del("/api/pages/:id/join", "user", ({ res, params, user, store, bus }) => {
    const page = store.getPage(Number(params.id));
    // Rate-limited whether or not the page exists (Oct 2026 review): limiting
    // only real pages answered 429-vs-404, an existence oracle over hidden ones.
    if (!throughTheDoor(user.id)) return json(res, 429, { error: "rate_limited" });
    if (page && store.removePageRequest(page.id, user.id)) {
      pushPage(store, bus, page, onlineIds, { alsoTell: [user.id] });
      return json(res, 200, { ok: true });
    }
    const found = resolveDiscover(store, user, params.id);
    if (!found) return json(res, 404, { error: "no_page" });
    json(res, 200, { ok: true });
  });

  // The knocks, for those who may answer them (page managers + staff). The
  // discover-aware resolver: a discoverable page's existence is public, so
  // the refusal here is an honest 403, not a 404 that contradicts the card.
  router.get("/api/pages/:id/requests", "user", ({ res, params, user, store }) => {
    const found = resolveDiscover(store, user, params.id);
    if (!found) return json(res, 404, { error: "no_page" });
    if (!mayAnswerRequests(store, user, found.page)) return json(res, 403, { error: "forbidden" });
    json(res, 200, {
      requests: store
        .pageRequests(found.page.id)
        .map((r) => {
          const u = store.getUserById(r.userId);
          return u ? { user: toPublicUser(u), at: r.at } : null;
        })
        .filter(Boolean),
    });
  });

  // Answer one: approve enrols them (member, never manager — promotion is a
  // separate, deliberate act); deny just clears the knock.
  router.post("/api/pages/:id/requests/:userId", "user", ({ res, params, body, user, store, bus }) => {
    const found = resolveDiscover(store, user, params.id);
    if (!found) return json(res, 404, { error: "no_page" });
    if (!mayAnswerRequests(store, user, found.page)) return json(res, 403, { error: "forbidden" });
    const uid = Number(params.userId);
    if (!store.removePageRequest(found.page.id, uid)) return json(res, 404, { error: "no_request" });
    if (body?.approve === true) store.addPageMember(found.page.id, uid);
    // Either way the requester learns their new standing (member, or the
    // knock simply gone) via the per-recipient page.change.
    pushPage(store, bus, found.page, onlineIds, { alsoTell: [uid] });
    json(res, 200, { ok: true, approved: body?.approve === true });
  });

  // Show yourself out (Josh, Aug 2026: "give users the ability to leave any
  // page besides the solace general"). No permission needed — it is your own
  // membership — but SOLACE GENERAL is the main hall and holds everything
  // chat was before pages existed, so it cannot be left. The store refuses it
  // too; this is the polite 400 instead of a silent no-op.
  //
  // A member leaving a PRIVATE page loses sight of it entirely, which is the
  // whole point of pushPage's `was` list: they have to be told once more,
  // while they can still be addressed, or the page sits on their screen
  // forever with nothing behind it.
  router.post("/api/pages/:id/leave", "user", ({ res, params, user, store, bus }) => {
    const found = resolve(store, user, params.id);
    if (!found) return json(res, 404, { error: "no_page" });
    if (found.page.id === GENERAL_PAGE_ID) return json(res, 400, { error: "cannot_leave_general" });
    if (!found.role) return json(res, 400, { error: "not_a_member" });
    if (!throughTheDoor(user.id)) return json(res, 429, { error: "rate_limited" });
    const was = memberIds(store, found.page);
    store.removePageMember(found.page.id, user.id);
    pushPage(store, bus, found.page, onlineIds, { alsoTell: was });
    json(res, 200, { ok: true });
  });

  // Reorder the page rail — ADMIN only (a global power; Sep 2026 scoping).
  // `ids` must be the complete ordered list of every page.
  router.post("/api/pages/reorder", "admin", ({ res, body, store, bus }) => {
    const ids: unknown = body.ids;
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((n) => Number.isInteger(n))) {
      return json(res, 400, { error: "bad_order" });
    }
    if (!store.reorderPages(ids as number[])) return json(res, 400, { error: "bad_order" });
    bus.emit("pages.reorder", { ids: ids as number[] });
    json(res, 200, { ok: true });
  });
}

const memberIds = (store: Store, page: Page): number[] => store.pageMembers(page.id).map((m) => m.userId);

function deleteIcon(file: string | null): void {
  if (!file || !SAFE_FILE.test(file)) return;
  try {
    fs.unlinkSync(path.join(ICON_DIR, file));
  } catch {
    /* already gone */
  }
}

/** Re-broadcast a page to everyone who can see it now, plus anyone who could
 *  a moment ago — otherwise a removed member's client keeps the page on
 *  screen forever. Realtime re-derives role/counts/pending per recipient
 *  authoritatively, so the payload here just carries the fresh row; `tellAll`
 *  widens one frame to every socket (a page that turned invisible has to
 *  reach the outsiders still holding its card). */
function pushPage(
  store: Store,
  bus: { emit: (e: "page.change", p: { page: PageDTO; members: number[]; tellAll?: boolean }) => void },
  page: Page,
  onlineIds: () => number[],
  opts: { alsoTell?: number[]; tellAll?: boolean } = {},
): void {
  const fresh = store.getPage(page.id)!;
  const rows = store.pageMembers(fresh.id);
  const online = new Set(onlineIds());
  const payload: PageDTO = {
    ...fresh,
    role: null,
    members: rows.length,
    online: rows.reduce((n, m) => n + (online.has(m.userId) ? 1 : 0), 0),
  };
  bus.emit("page.change", {
    page: payload,
    members: [...new Set([...rows.map((m) => m.userId), ...(opts.alsoTell ?? [])])],
    tellAll: opts.tellAll,
  });
}
