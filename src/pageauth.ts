// PAGE AUTHORITY, store-backed — the roles layer over permissions.ts.
//
// permissions.ts stays pure (admin / creator / manager / allow-list); this
// file adds what a page's ROLES grant on top, and every route that used to
// call canPost/canManage/canCreateChannel directly now asks here so the two
// layers can't drift. Rules in src/roles.ts.
import { canManage, canManagePageMembers, canAnswerPageRequests } from "./permissions";
import { PERMS, type Perm } from "./roles";
import type { Store } from "./db/store";
import type { Channel, Page, PageRole, User } from "./types";

export interface Standing {
  /** Admins and the page's managers: everything, no hierarchy. */
  all: boolean;
  role: PageRole | null;
  perms: Set<Perm>;
  /** The highest position among held roles (0 = only @everyone). */
  top: number;
}

/** A member's standing in a page: their page role, their effective
 *  permissions (@everyone ∪ held roles) and how high they reach. */
export function standing(store: Store, user: User, pageId: number): Standing {
  const role = store.pageRole(pageId, user.id);
  const all = user.isAdmin || role === "manager";
  if (all) return { all, role, perms: new Set(PERMS), top: Number.POSITIVE_INFINITY };
  const held = store.memberRoles(pageId, user.id);
  return {
    all,
    role,
    perms: new Set(held.flatMap((r) => r.perms)),
    top: held.reduce((m, r) => Math.max(m, r.position), 0),
  };
}

export function hasPerm(store: Store, user: User, pageId: number, perm: Perm): boolean {
  if (user.disabled) return false;
  const st = standing(store, user, pageId);
  return st.all || st.perms.has(perm);
}

/** May they SEE a channel they may otherwise enter? A channel with view
 *  roles is invisible to everyone but its creator, the page's authority and
 *  the holders. (The page gate itself lives in pagescope.mayEnterChannel,
 *  which calls this second.) */
export function mayViewChannel(store: Store, user: User, channel: Channel): boolean {
  // A sub-channel is behind its parent's gate too (Oct 2026 review): the
  // sidebar hid the children of a gated channel, but the server listed them,
  // served their history and search, and streamed them to the whole page.
  if (channel.parentId != null) {
    const parent = store.getChannel(channel.parentId);
    if (parent && !mayViewChannel(store, user, parent)) return false;
  }
  const view = store.channelRoleIds(channel.id, "view");
  if (!view.length) return true;
  if (user.isAdmin || channel.createdBy === user.id) return true;
  if (store.pageRole(channel.pageId, user.id) === "manager") return true;
  return store.holdsAnyRole(channel.pageId, user.id, view);
}

/** May they POST (or join a voice room, or look busy typing)? The page's
 *  `post` permission, and for a LOCKED channel the creator, the allow-list
 *  (the per-person override) or a post role. Managers and admins always. */
export function mayPostChannel(store: Store, user: User, channel: Channel): boolean {
  if (user.disabled) return false;
  if (!mayViewChannel(store, user, channel)) return false;
  const st = standing(store, user, channel.pageId);
  if (st.all) return true;
  if (!st.perms.has("post")) return false;
  if (!channel.locked) return true;
  if (channel.createdBy === user.id || store.isPostAllowed(channel.id, user.id)) return true;
  const post = store.channelRoleIds(channel.id, "post");
  return post.length > 0 && store.holdsAnyRole(channel.pageId, user.id, post);
}

export function mayCreateChannel(store: Store, user: User, pageId: number): boolean {
  return hasPerm(store, user, pageId, "create_channels");
}

/** Rename / lock / reorder / delete a channel: its creator, the page's
 *  authority, or a `manage_channels` role. */
export function mayManageChannel(store: Store, user: User, channel: Channel): boolean {
  if (user.disabled) return false;
  if (canManage(user, channel, store.pageRole(channel.pageId, user.id))) return true;
  return hasPerm(store, user, channel.pageId, "manage_channels");
}

/** Add / remove members: the staff rule, or a `manage_members` role.
 *  Promotion to MANAGER stays the staff rule alone (routes/pages.ts). */
export function mayManageMembers(store: Store, user: User, page: Page): boolean {
  if (user.disabled) return false;
  const role = store.pageRole(page.id, user.id);
  if (canManagePageMembers(user, page, role)) return true;
  if (page.id === 1) return false;
  return hasPerm(store, user, page.id, "manage_members");
}

export function mayAnswerRequests(store: Store, user: User, page: Page): boolean {
  if (user.disabled) return false;
  const role = store.pageRole(page.id, user.id);
  if (canAnswerPageRequests(user, page, role)) return true;
  if (page.id === 1) return false;
  return hasPerm(store, user, page.id, "manage_members");
}

export function mayManageRoles(store: Store, user: User, pageId: number): boolean {
  return hasPerm(store, user, pageId, "manage_roles");
}

/** An @everyone that actually pings: the house, an admin, a manager, or a
 *  role that says so. */
export function mayMentionEveryone(store: Store, user: User, pageId: number): boolean {
  if (user.isBot) return true;
  return hasPerm(store, user, pageId, "mention_everyone");
}
