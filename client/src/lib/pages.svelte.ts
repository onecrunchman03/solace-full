// PAGES — the community layer above channels (Josh, Aug 2026).
//
// A page owns channels. SOLACE GENERAL (id 1) holds everything chat was
// before pages existed and everybody belongs to it, so the app can always
// fall back to it: `current` is never null once loaded.
//
// The server decides what this client is even told about — a private page you
// aren't in never arrives — so nothing here is a security boundary. It is a
// store plus the small amount of "which page am I looking at" state the
// sidebar and the picker share.
import { api, type PageDTO, type PageJoinPolicy, type PageMember } from "./api";

export const GENERAL_PAGE_ID = 1;

export const pages = $state<{
  list: PageDTO[];
  /** Which page's channels the sidebar is showing. */
  currentId: number;
  /** The picker panel (the list of pages) is open. */
  browsing: boolean;
  members: PageMember[];
  membersFor: number | null;
  /** Member ids of the page the SIDEBAR is on, for scoping the roster (Josh,
   *  Aug 2026: each page should list its own people, not every account on the
   *  server). Kept apart from `members` above, which the settings dialog
   *  points at whichever page's gear you clicked — sharing one field made the
   *  roster follow the dialog. Null means "not loaded", which the roster
   *  reads as show-everyone rather than flashing an empty list. */
  rosterIds: number[] | null;
  rosterFor: number | null;
  loading: boolean;
}>({
  list: [],
  currentId: GENERAL_PAGE_ID,
  browsing: false,
  members: [],
  membersFor: null,
  rosterIds: null,
  rosterFor: null,
  loading: false,
});

/** The page being viewed, or the general page if the current one vanished
 *  (deleted under us, or we were removed from it). */
export function currentPage(): PageDTO | null {
  return pages.list.find((p) => p.id === pages.currentId)
    ?? pages.list.find((p) => p.id === GENERAL_PAGE_ID)
    ?? null;
}

/** Am I allowed to change this page's name / description / icon? */
export function canEditCurrent(isAdmin: boolean): boolean {
  const p = currentPage();
  return !!p && (isAdmin || p.role === "manager");
}

const sortPages = (list: PageDTO[]): PageDTO[] =>
  [...list].sort((a, b) =>
    // The main hall always leads; then by position, then by name.
    a.id === GENERAL_PAGE_ID ? -1 : b.id === GENERAL_PAGE_ID ? 1 : a.position - b.position || a.name.localeCompare(b.name),
  );

export async function loadPages(): Promise<void> {
  pages.loading = true;
  try {
    const r = await api.pages();
    pages.list = sortPages(r.pages);
    if (!pages.list.some((p) => p.id === pages.currentId)) pages.currentId = GENERAL_PAGE_ID;
  } finally {
    pages.loading = false;
  }
}

export function openPage(id: number): void {
  pages.currentId = id;
  pages.browsing = false;
}

export async function createPage(
  name: string,
  description: string,
  joinPolicy: PageJoinPolicy,
  discoverable: boolean,
): Promise<PageDTO> {
  const r = await api.createPage({ name, description, joinPolicy, discoverable });
  upsertPage(r.page);
  return r.page;
}

export async function savePage(
  id: number,
  fields: {
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
  },
): Promise<void> {
  const r = await api.updatePage(id, fields);
  upsertPage(r.page);
}

export async function deletePage(id: number): Promise<void> {
  await api.deletePage(id);
  dropPage(id);
}

export async function setPageIcon(id: number, file: File): Promise<void> {
  const icon = (await api.setPageIcon(id, file)).icon;
  const p = pages.list.find((x) => x.id === id);
  if (p) p.icon = icon;
}

export async function clearPageIcon(id: number): Promise<void> {
  await api.clearPageIcon(id);
  const p = pages.list.find((x) => x.id === id);
  if (p) p.icon = null;
}

export async function loadMembers(id: number): Promise<void> {
  pages.membersFor = id;
  try {
    const r = await api.pageMembers(id);
    // Staleness guard (the loadRoster rule): a slow response for page A must
    // not land after page B's dialog opened and label A's people as B's.
    if (pages.membersFor !== id) return;
    pages.members = r.members;
    // A membership edit already fetched the fresh list — the roster can
    // re-scope from it instead of asking the same endpoint again.
    if (pages.rosterFor === id) pages.rosterIds = r.members.map((m) => m.user.id);
  } catch {
    if (pages.membersFor === id) pages.members = [];
  }
}

/** The settings dialog closed — stop tracking its member list, or every
 *  page.change frame for that page keeps refetching it forever. */
export function closeMembers(): void {
  pages.membersFor = null;
  pages.members = [];
}

/** Fetch the member ids the roster filters by. Cheap and idempotent: the
 *  roster asks on every page switch, so it no-ops unless the page changed or
 *  a membership edit forced it. */
export async function loadRoster(id: number, force = false): Promise<void> {
  if (!force && pages.rosterFor === id && pages.rosterIds) return;
  pages.rosterFor = id;
  try {
    const r = await api.pageMembers(id);
    if (pages.rosterFor === id) pages.rosterIds = r.members.map((m) => m.user.id);
  } catch {
    // A page we can't read members for shouldn't blank the roster — show
    // everyone, which is what it did before pages existed.
    if (pages.rosterFor === id) pages.rosterIds = null;
  }
}

/** Membership moved on the page we're looking at — re-scope the roster. */
const rosterMayHaveChanged = (id: number): void => {
  if (pages.currentId === id) void loadRoster(id, true);
};

export async function addMember(id: number, userId: number, role: "member" | "manager" = "member"): Promise<void> {
  await api.addPageMember(id, userId, role);
  // loadMembers re-scopes the roster from its own response (one fetch).
  await loadMembers(id);
}

export async function setMemberRole(id: number, userId: number, role: "member" | "manager"): Promise<void> {
  await api.setPageMemberRole(id, userId, role);
  await loadMembers(id);
}

export async function removeMember(id: number, userId: number): Promise<void> {
  await api.removePageMember(id, userId);
  await loadMembers(id);
}

// The join/knock/leave family used to follow every POST with a full
// loadPages() refetch — redundant (the server's page.change broadcast lands
// on this very socket moments later with the same DTO) and a mild race
// between the two writers. The broadcast is the one source now.

/** Open door: enrols. Request door: files a knock (the card shows
 *  "requested"). Invite door: the server refuses — the button isn't shown. */
export async function joinPage(id: number): Promise<{ joined: boolean; requested: boolean }> {
  const r = await api.joinPage(id);
  rosterMayHaveChanged(id);
  return { joined: !!r.joined, requested: !!r.requested };
}

/** Withdraw your own knock. */
export async function cancelRequest(id: number): Promise<void> {
  await api.cancelPageRequest(id);
}

/** Show yourself out. Solace General can't be left — the server refuses it
 *  and the UI doesn't offer it. Leaving the page you're VIEWING drops you
 *  back to the main hall, because a private page you just left stops
 *  existing for you the moment the server re-broadcasts it. */
export async function leavePage(id: number): Promise<void> {
  await api.leavePage(id);
  if (pages.currentId === id) pages.currentId = GENERAL_PAGE_ID;
  rosterMayHaveChanged(pages.currentId);
}

/** A staff reorder landed (ids are only the pages this client may see, in
 *  their new order) — reposition locally and re-sort. */
export function applyPageOrder(ids: number[]): void {
  const rank = new Map(ids.map((id, i) => [id, i + 1]));
  pages.list = sortPages(pages.list.map((p) => (rank.has(p.id) ? { ...p, position: rank.get(p.id)! } : p)));
}

/** Staff move a page one step up or down the rail. */
export async function movePage(id: number, dir: -1 | 1): Promise<void> {
  const order = pages.list.map((p) => p.id);
  const i = order.indexOf(id);
  const j = i + dir;
  if (i === -1 || j < 0 || j >= order.length) return;
  if (order[j] === GENERAL_PAGE_ID || id === GENERAL_PAGE_ID) return; // the main hall leads, always
  [order[i], order[j]] = [order[j], order[i]];
  await api.reorderPages(order);
  applyPageOrder(order);
}

// ---- realtime -----------------------------------------------------------
// The server addresses these to the people who may know about the page, so
// arriving at all is the permission check.

export function upsertPage(page: PageDTO): void {
  const i = pages.list.findIndex((p) => p.id === page.id);
  if (i === -1) pages.list = sortPages([...pages.list, page]);
  else {
    const next = [...pages.list];
    next[i] = page;
    pages.list = sortPages(next);
  }
  if (pages.membersFor === page.id) void loadMembers(page.id);
}

export function dropPage(pageId: number): void {
  pages.list = pages.list.filter((p) => p.id !== pageId);
  if (pages.currentId === pageId) pages.currentId = GENERAL_PAGE_ID;
  if (pages.membersFor === pageId) {
    pages.membersFor = null;
    pages.members = [];
  }
}

export function resetPages(): void {
  pages.list = [];
  pages.currentId = GENERAL_PAGE_ID;
  pages.browsing = false;
  pages.members = [];
  pages.membersFor = null;
  pages.rosterIds = null;
  pages.rosterFor = null;
}
