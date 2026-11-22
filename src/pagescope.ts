// PAGE SCOPING — the single answer to "may this user be in here?".
//
// Before pages (migration 63) every channel was readable by everyone, and a
// lot of the app was written against that: search matched every message, the
// voice gate only asked about the channel's own lock, reorder broadcast the
// whole channel list, unread counted every room. A private page makes all of
// those leaks, so everything that touches a channel now asks here.
//
// It lives outside permissions.ts because that file is deliberately
// store-free; these need to look membership up.
import { canEnterPage, canSeePage } from "./permissions";
import { mayViewChannel } from "./pageauth";
import type { Store } from "./db/store";
import type { Channel, User } from "./types";

/** Pages this user may know exist. */
export function visiblePageIds(store: Store, user: User): Set<number> {
  const roles = store.pageRolesFor(user.id);
  return new Set(
    store.listPages().filter((p) => canSeePage(user, p, roles.get(p.id) ?? null)).map((p) => p.id),
  );
}

/** May this user be inside the page that owns this channel? A channel whose
 *  page has somehow vanished falls back to open, matching the pre-pages
 *  rules rather than locking people out of their own history. */
export function mayEnterChannel(store: Store, user: User, channel: Channel): boolean {
  const page = store.getPage(channel.pageId);
  if (!page) return true;
  if (!canEnterPage(user, page, store.pageRole(page.id, user.id))) return false;
  // PAGE ROLES (migration 90): a channel with a VIEW gate is invisible to
  // everyone in the page but its creator, the page's authority and the
  // holders — 404 everywhere, exactly like a private page's rooms.
  return mayViewChannel(store, user, channel);
}

/** The channels this user may see, across every visible page — the listing
 *  and the reorder frame both derive from this. */
export function visibleChannels(store: Store, user: User): Channel[] {
  const pages = visiblePageIds(store, user);
  const gated = store.restrictedChannelIds();
  return store
    .listChannels()
    .filter((c) => pages.has(c.pageId) && (!gated.has(c.id) || mayViewChannel(store, user, c)));
}

/** Same question by id, for the paths that only have one. */
export function mayEnterChannelId(store: Store, user: User, channelId: number): boolean {
  const ch = store.getChannel(channelId);
  return !ch || mayEnterChannel(store, user, ch);
}
