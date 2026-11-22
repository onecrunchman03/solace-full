import { json, makeRateLimiter, type Router } from "../http";
import { toPublicUser } from "../types";
import { visiblePageIds, mayEnterChannelId } from "../pagescope";
import { enrichRemote, parseListResult, satelliteRpc, toGlobalId } from "../federation/remote";

/**
 * Message search (FTS5). Both halves are scoped in SQL: channel hits to the
 * PAGES the caller may see (migration 63 — channel history stopped being
 * universally readable the moment a page could be private), DM hits to the
 * caller's own conversations.
 *
 * FEDERATION (F3): satellite pages the caller may see are searched too — a
 * "messages.search" RPC per linked satellite, in parallel on a short clock.
 * The satellite's answers are hostile input: rows are schema-cleaned and
 * re-scoped to that page's OWN channels before hydration, so a lying host
 * can misquote its community's words but never smuggle a hit into anyone
 * else's rooms. An offline satellite is skipped — search is best-effort,
 * and the page card already says the community is offline.
 */
export function registerSearchRoutes(router: Router): void {
  const rateLimit = makeRateLimiter();
  router.get("/api/search", "user", async ({ res, url, user, store }) => {
    const q = (url.searchParams.get("q") ?? "").slice(0, 120);
    if (q.trim().length < 2) return json(res, 200, { channels: [], dms: [] });
    // One search = one RPC to EVERY linked satellite (review round 2): a
    // member gets a typing-speed budget, not an unbounded fan-out.
    if (!rateLimit(`search:${user.id}`, 30, 60_000)) return json(res, 429, { error: "rate_limited" });

    const authorOf = (id: number) => {
      const u = store.getUserById(id);
      return u ? toPublicUser(u) : null;
    };
    const visible = visiblePageIds(store, user);
    // PAGE ROLES: a VIEW-gated channel's words stay out of the results —
    // over-fetched then trimmed, so gated hits can't eat a member's 25.
    const channels = store.searchChannelMessages(q, [...visible], 200).filter((m) => mayEnterChannelId(store, user, m.channelId)).slice(0, 25).map((m) => ({
      id: m.id,
      channelId: m.channelId,
      channelName: m.channelName,
      body: m.body,
      createdAt: m.createdAt,
      author: authorOf(m.userId),
    }));

    const remoteBatches = await Promise.all(
      store.satellitePages()
        // ONLY COMMUNITIES THE SEARCHER BELONGS TO (Oct 2026 review). The one
        // search box also searches DMs, and the words went to every open
        // satellite's host — a live feed of what members look for, to people
        // who never had any business seeing it.
        .filter((sp) => visible.has(sp.pageId) && store.pageRole(sp.pageId, user.id) != null)
        .map(async (sp) => {
          try {
            const allowed = [...store.channelNamesOfPage(sp.pageId).keys()].filter((cid) => mayEnterChannelId(store, user, cid));
            if (!allowed.length) return [];
            const raw = await satelliteRpc(sp.satelliteId, "messages.search", { q, limit: 50, channels: allowed }, 2_500);
            const { rows } = parseListResult({ messages: (raw as { messages?: unknown[] } | null)?.messages });
            const names = store.channelNamesOfPage(sp.pageId);
            // F4: the index is the authority here too — a fabricated hit
            // drops, the author/channel/timestamp are the hub's own, and a
            // hub-deleted message can't resurface as a search result.
            const idx = store.remoteMessageInfos(rows.map((r) => toGlobalId(sp.satelliteId, r.id)));
            const vetted = rows.flatMap((r) => {
              const i = idx.get(toGlobalId(sp.satelliteId, r.id));
              if (!i || i.deletedAt != null || !names.has(i.channelId)) return [];
              return [{ ...r, channelId: i.channelId, userId: i.userId, at: i.at, deletedAt: null }];
            });
            return enrichRemote(store, sp.satelliteId, vetted, new Map())
              // PAGE ROLES: a VIEW-gated channel's words stay out of the
              // results here too (Sep 2026 review — only the hub half checked).
              .filter((m) => mayEnterChannelId(store, user, m.channelId))
              .map((m) => ({
                id: m.id,
                channelId: m.channelId,
                channelName: names.get(m.channelId)!,
                body: m.body,
                createdAt: m.createdAt,
                author: m.author,
              }));
          } catch {
            return []; // offline or pre-F3 host — hub results stand alone
          }
        }),
    );
    for (const batch of remoteBatches) channels.push(...batch);
    channels.sort((a, b) => b.createdAt - a.createdAt);

    const dms = store.searchDmMessages(q, user.id).map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      body: m.body,
      createdAt: m.createdAt,
      author: authorOf(m.senderId),
      otherUser: authorOf(m.otherUserId),
    }));
    json(res, 200, { channels: channels.slice(0, 25), dms });
  });
}
