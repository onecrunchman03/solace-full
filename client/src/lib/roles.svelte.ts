// PAGE ROLES on the client (Josh, Sep 2026). One snapshot per page — the
// roles, who holds what, and MY effective permissions — fetched when a page
// is opened and refetched on every `page.roles` frame. The server enforces
// everything; this only decides what to SHOW (a composer, a + button, a
// colour on a name).
import { api, type PageRoleDef, type Perm } from "./api";
import { session } from "./session.svelte";
import { pages } from "./pages.svelte";

export interface PageRolesSnap {
  roles: PageRoleDef[];
  assignments: Record<number, number[]>;
  mine: "all" | Perm[];
  top: number | null;
  permInfo: Record<string, { name: string; desc: string }>;
}

export const roles = $state<{ byPage: Record<number, PageRolesSnap> }>({ byPage: {} });
const inflight = new Map<number, Promise<void>>();

export async function loadRoles(pageId: number, force = false): Promise<void> {
  if (!force && roles.byPage[pageId]) return;
  const running = inflight.get(pageId);
  if (running && !force) return running;
  const p = (async () => {
    try {
      const snap = await api.pageRoles(pageId);
      roles.byPage = { ...roles.byPage, [pageId]: snap };
    } catch {
      /* not a member, or the page vanished — nothing to show */
    } finally {
      inflight.delete(pageId);
    }
  })();
  inflight.set(pageId, p);
  return p;
}

export function resetRoles(): void {
  roles.byPage = {};
}

/** The socket said a page's roles changed: refetch if we hold it. */
export function handleRolesEvent(msg: { type: string; pageId?: number }): void {
  if (msg.type !== "page.roles" || typeof msg.pageId !== "number") return;
  if (roles.byPage[msg.pageId]) void loadRoles(msg.pageId, true);
}

/** Do I hold this permission in the page? Unknown page = assume yes (the
 *  server refuses if not; a false "no" would hide a working button). */
export function can(pageId: number | undefined, perm: Perm): boolean {
  if (pageId == null) return true;
  const u = session.user;
  if (!u) return false;
  if (u.isAdmin) return true;
  if (pages.list.find((p) => p.id === pageId)?.role === "manager") return true;
  const snap = roles.byPage[pageId];
  if (!snap) return true;
  return snap.mine === "all" || snap.mine.includes(perm);
}

export function myRoleIds(pageId: number | undefined): number[] {
  if (pageId == null || !session.user) return [];
  return roles.byPage[pageId]?.assignments[session.user.id] ?? [];
}

/** Everything a member holds in a page, most senior first (no @everyone). */
export function rolesOf(pageId: number | undefined, userId: number): PageRoleDef[] {
  if (pageId == null) return [];
  const snap = roles.byPage[pageId];
  if (!snap) return [];
  const held = new Set(snap.assignments[userId] ?? []);
  return snap.roles.filter((r) => !r.isEveryone && held.has(r.id));
}

/** The name colour: the most senior COLOURED role held. A paid Emporium
 *  flair wins over it — the caller checks that first. */
export function roleColorFor(pageId: number | undefined, userId: number): string | null {
  return rolesOf(pageId, userId).find((r) => r.color)?.color ?? null;
}
