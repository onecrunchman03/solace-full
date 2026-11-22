import type { User, Channel, Message, Page, PageRole } from "./types";
import { GENERAL_PAGE_ID } from "./types";

/**
 * All channel and page access rules live here, so tightening them means
 * changing one file. These stay STORE-FREE on purpose — callers resolve
 * memberships and pass them in — which is why the page-membership lookups
 * live next door in pagescope.ts.
 *
 * Reading used to be open to everyone (the old "one shared space" model).
 * Since pages (migration 63) it is gated by the owning page: see
 * canEnterPage, and pagescope.mayEnterChannel for the store-backed form.
 */

/**
 * Can this user post messages in the channel? Open channels allow anyone active;
 * a locked channel is restricted to its owner, admins, and an allow-list (the
 * caller resolves membership and passes `allowlisted`, so this stays store-free).
 */
export function canPost(user: User, channel: Channel, allowlisted = false): boolean {
  if (user.disabled) return false;
  if (!channel.locked) return true;
  return user.isAdmin || channel.createdBy === user.id || allowlisted;
}

/** Can this user create new channels? */
export function canCreateChannel(user: User): boolean {
  return !user.disabled;
}

/** Can this user rename or delete the channel? Its creator, any admin — or a
 *  MANAGER of the page the channel lives in (that is what page-manager
 *  means: authority over one page's contents and nothing else). */
export function canManage(user: User, channel: Channel, pageRole: PageRole | null = null): boolean {
  return user.isAdmin || channel.createdBy === user.id || pageRole === "manager";
}

// ---- PAGES (Josh, Aug 2026; MODERATOR SCOPING Sep 2026) ----------------------
// The Sep 2026 rule, verbatim: "admin has full control but moderators only
// have power in the pages they are assigned to." So the ADMIN keeps the
// global reach (sees every page, manages every membership, deletes, reorders),
// while a MODERATOR's page authority is exactly their page role — they see a
// hidden page only as a member, and manage one only where they hold the
// manager role. Their server-wide moderation powers (bans, suspensions,
// invites, reports) are a different axis and unchanged.
//
// CREATION IS THE ADMIN'S ALONE (Josh, Sep 2026: "only admin can create new
// pages on the hub server… if users want their own page then they will have
// to self host"). Moderators used to keep creation as their one global page
// power; it went with the federation round — every page on the hub is
// something the operator personally stood up and is answerable for, and the
// door for anyone else is a satellite on their own box (whose page is
// created by the link, not by this route).

/** Create a page on the hub: admins only. */
export function canCreatePage(user: User): boolean {
  return !user.disabled && user.isAdmin;
}

/** Delete a page: ADMIN ONLY (Sep 2026 — full control is the admin's; a
 *  moderator's authority stops at their own pages' edges, and even a manager
 *  doesn't get to erase a community's history). Never the general page. */
export function canDeletePage(user: User, page: Page): boolean {
  return user.isAdmin && page.id !== GENERAL_PAGE_ID;
}

/** Rename a page / change its description, icon or privacy: admins, and the
 *  managers of that page (a moderator qualifies only via their manager row). */
export function canEditPage(user: User, _page: Page, pageRole: PageRole | null): boolean {
  return user.isAdmin || pageRole === "manager";
}

/** Add or remove members, and promote managers: admins anywhere; a moderator
 *  only in a page they MANAGE (Sep 2026 scoping). A plain manager still
 *  cannot — membership stays a staff-hands decision, per the original rule. */
export function canManagePageMembers(user: User, page: Page, pageRole: PageRole | null): boolean {
  if (page.id === GENERAL_PAGE_ID) return false;
  return user.isAdmin || (user.role === "moderator" && pageRole === "manager");
}

/** May they answer a KNOCK on a request-policy page? Admins, or that page's
 *  own managers — approving a request is the page exercising its own join
 *  policy. (A moderator answers only where they hold the manager role.) */
export function canAnswerPageRequests(user: User, page: Page, pageRole: PageRole | null): boolean {
  if (page.id === GENERAL_PAGE_ID) return false; // general is open; no knocks
  return user.isAdmin || pageRole === "manager";
}

/** Is this page even visible to them? Public pages are listed to everyone; a
 *  private page exists only for its members — and for ADMINS, who must be
 *  able to administer what they can't see into otherwise. Moderators see a
 *  hidden page only as members of it (Sep 2026). */
export function canSeePage(user: User, page: Page, pageRole: PageRole | null): boolean {
  return page.isPublic || pageRole !== null || user.isAdmin;
}

/** May they read/post inside it? Membership, or a public page (which anyone
 *  may walk into — entering is what enrols you), or an admin. */
export function canEnterPage(user: User, page: Page, pageRole: PageRole | null): boolean {
  if (user.disabled) return false;
  return page.isPublic || pageRole !== null || user.isAdmin;
}

/** May they know it EXISTS? Everything canSeePage admits, plus any page
 *  flagged discoverable — whose CARD (name, icon, description, counts) the
 *  picker may show so they can knock, while its channels stay exactly as
 *  invisible as canSeePage says (migration 77). */
export function canDiscoverPage(user: User, page: Page, pageRole: PageRole | null): boolean {
  return canSeePage(user, page, pageRole) || page.discoverable;
}

/** Only the author may edit their own message, and not once it's deleted. */
export function canEditMessage(user: User, message: Message): boolean {
  return message.userId === user.id && message.deletedAt == null;
}

/** The author may delete their own message; a channel manager may delete any
 *  — and a PAGE manager counts as a manager of that page's channels. */
export function canDeleteMessage(
  user: User,
  message: Message,
  channel: Channel,
  pageRole: PageRole | null = null,
): boolean {
  return message.userId === user.id || canManage(user, channel, pageRole);
}
