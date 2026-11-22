import { json, type Router } from "../http";
import { canSeePage } from "../permissions";
import { mayEnterChannel } from "../pagescope";
import { mayManageChannel, mayManageRoles, standing } from "../pageauth";
import { cleanColor, cleanPerms, cleanRoleName, mayTouchRole, MAX_ROLES_PER_PAGE, PERM_INFO, type Perm } from "../roles";
import type { Store } from "../db/store";
import type { Bus } from "../bus";
import type { PageRoleDef, User } from "../types";

/** PAGE ROLES (Josh, Sep 2026). Rules in src/roles.ts, authority in
 *  src/pageauth.ts. Every change fans out one `page.roles` frame to the
 *  page so clients refetch. */
export function registerRoleRoutes(router: Router): void {
  const resolvePage = (store: Store, user: User, id: unknown) => {
    const page = store.getPage(Number(id));
    if (!page) return null;
    const role = store.pageRole(page.id, user.id);
    if (!canSeePage(user, page, role)) return null;
    return page;
  };
  const changed = (bus: Bus, pageId: number) => bus.emit("page.roles", { pageId });

  /** The editor's reach over a given role: managers/admins everything; a
   *  role-manager only below their own top and only with perms they hold. */
  const canTouch = (store: Store, user: User, pageId: number, role: PageRoleDef): boolean => {
    const st = standing(store, user, pageId);
    if (st.all) return true;
    if (!st.perms.has("manage_roles")) return false;
    return mayTouchRole(st.top, st.perms, role);
  };
  const grantable = (store: Store, user: User, pageId: number, perms: Perm[]): boolean => {
    const st = standing(store, user, pageId);
    return st.all || perms.every((p) => st.perms.has(p));
  };

  router.get("/api/pages/:id/roles", "user", ({ res, params, user, store }) => {
    const page = resolvePage(store, user, params.id);
    if (!page) return json(res, 404, { error: "no_page" });
    const st = standing(store, user, page.id);
    json(res, 200, {
      roles: store.pageRoles(page.id),
      assignments: store.pageRoleAssignments(page.id),
      mine: st.all ? "all" : [...st.perms],
      top: st.all ? null : st.top,
      permInfo: PERM_INFO,
    });
  });

  router.post("/api/pages/:id/roles", "user", ({ res, params, body, user, store, bus }) => {
    const page = resolvePage(store, user, params.id);
    if (!page) return json(res, 404, { error: "no_page" });
    if (!mayManageRoles(store, user, page.id)) return json(res, 403, { error: "forbidden" });
    const name = cleanRoleName(body.name);
    if (!name) return json(res, 400, { error: "bad_name" });
    const color = cleanColor(body.color);
    if (color === false) return json(res, 400, { error: "bad_color" });
    const perms = cleanPerms(body.perms ?? []);
    if (!perms) return json(res, 400, { error: "bad_perms" });
    if (!grantable(store, user, page.id, perms)) return json(res, 403, { error: "cannot_grant" });
    if (store.pageRoles(page.id).length >= MAX_ROLES_PER_PAGE + 1) return json(res, 409, { error: "too_many_roles" });
    const role = store.createRole(page.id, { name, color, perms });
    changed(bus, page.id);
    json(res, 200, { role });
  });

  router.patch("/api/pages/:id/roles/:roleId", "user", ({ res, params, body, user, store, bus }) => {
    const page = resolvePage(store, user, params.id);
    if (!page) return json(res, 404, { error: "no_page" });
    const role = store.getRole(Number(params.roleId));
    if (!role || role.pageId !== page.id) return json(res, 404, { error: "no_role" });
    if (!mayManageRoles(store, user, page.id) || !canTouch(store, user, page.id, role)) {
      return json(res, 403, { error: "forbidden" });
    }
    const fields: { name?: string; color?: string | null; perms?: Perm[] } = {};
    if (body.name !== undefined) {
      if (role.isEveryone) return json(res, 400, { error: "everyone_fixed" });
      const name = cleanRoleName(body.name);
      if (!name) return json(res, 400, { error: "bad_name" });
      fields.name = name;
    }
    if (body.color !== undefined) {
      if (role.isEveryone) return json(res, 400, { error: "everyone_fixed" });
      const color = cleanColor(body.color);
      if (color === false) return json(res, 400, { error: "bad_color" });
      fields.color = color;
    }
    if (body.perms !== undefined) {
      const perms = cleanPerms(body.perms);
      if (!perms) return json(res, 400, { error: "bad_perms" });
      if (!grantable(store, user, page.id, perms)) return json(res, 403, { error: "cannot_grant" });
      fields.perms = perms;
    }
    const out = store.updateRole(role.id, fields);
    changed(bus, page.id);
    json(res, 200, { role: out });
  });

  router.del("/api/pages/:id/roles/:roleId", "user", ({ res, params, user, store, bus }) => {
    const page = resolvePage(store, user, params.id);
    if (!page) return json(res, 404, { error: "no_page" });
    const role = store.getRole(Number(params.roleId));
    if (!role || role.pageId !== page.id) return json(res, 404, { error: "no_role" });
    if (role.isEveryone) return json(res, 400, { error: "everyone_fixed" });
    if (!mayManageRoles(store, user, page.id) || !canTouch(store, user, page.id, role)) {
      return json(res, 403, { error: "forbidden" });
    }
    store.deleteRole(role.id);
    changed(bus, page.id);
    json(res, 200, { ok: true });
  });

  // The order, top first. Managers/admins only — a partial reorder from a
  // role-manager is a hierarchy edit by another name.
  router.post("/api/pages/:id/roles/reorder", "user", ({ res, params, body, user, store, bus }) => {
    const page = resolvePage(store, user, params.id);
    if (!page) return json(res, 404, { error: "no_page" });
    if (!standing(store, user, page.id).all) return json(res, 403, { error: "forbidden" });
    const ids: number[] | null = Array.isArray(body.ids) ? body.ids.map(Number).filter((id: number) => Number.isInteger(id)) : null;
    if (!ids) return json(res, 400, { error: "bad_ids" });
    const custom = store.pageRoles(page.id).filter((r) => !r.isEveryone).map((r) => r.id);
    if (ids.length !== custom.length || !ids.every((id) => custom.includes(id)) || new Set(ids).size !== ids.length) {
      return json(res, 400, { error: "bad_ids" });
    }
    store.reorderRoles(page.id, ids);
    changed(bus, page.id);
    json(res, 200, { ok: true });
  });

  // Hand roles to a member (the whole set at once). A role-manager may only
  // give or take roles below their own top; @everyone is never in the set.
  router.patch("/api/pages/:id/members/:userId/roles", "user", ({ res, params, body, user, store, bus }) => {
    const page = resolvePage(store, user, params.id);
    if (!page) return json(res, 404, { error: "no_page" });
    if (!mayManageRoles(store, user, page.id)) return json(res, 403, { error: "forbidden" });
    const uid = Number(params.userId);
    if (store.pageRole(page.id, uid) === null) return json(res, 404, { error: "not_a_member" });
    const ids: number[] | null = Array.isArray(body.roleIds) ? [...new Set<number>(body.roleIds.map(Number))].filter((id) => Number.isInteger(id)) : null;
    if (!ids) return json(res, 400, { error: "bad_ids" });
    const roles = store.pageRoles(page.id);
    const byId = new Map(roles.map((r) => [r.id, r]));
    for (const id of ids) {
      const r = byId.get(id);
      if (!r || r.isEveryone) return json(res, 400, { error: "bad_ids" });
    }
    // Every role that CHANGES hands must be within the editor's reach.
    const before = new Set(store.memberRoleIds(page.id, uid));
    const after = new Set(ids);
    for (const r of roles) {
      if (r.isEveryone) continue;
      if (before.has(r.id) !== after.has(r.id) && !canTouch(store, user, page.id, r)) {
        return json(res, 403, { error: "forbidden" });
      }
    }
    store.setMemberRoles(page.id, uid, ids);
    changed(bus, page.id);
    json(res, 200, { ok: true, roleIds: ids });
  });

  // Which roles may SEE and POST in a channel (the role-based lock).
  router.get("/api/channels/:id/roles", "user", ({ res, params, user, store }) => {
    const channel = store.getChannel(Number(params.id));
    if (!channel || !mayEnterChannel(store, user, channel)) return json(res, 404, { error: "no_channel" });
    json(res, 200, { view: store.channelRoleIds(channel.id, "view"), post: store.channelRoleIds(channel.id, "post") });
  });

  router.patch("/api/channels/:id/roles", "user", ({ res, params, body, user, store, bus }) => {
    const channel = store.getChannel(Number(params.id));
    if (!channel || !mayEnterChannel(store, user, channel)) return json(res, 404, { error: "no_channel" });
    if (!mayManageChannel(store, user, channel)) return json(res, 403, { error: "forbidden" });
    const valid = new Set(store.pageRoles(channel.pageId).filter((r) => !r.isEveryone).map((r) => r.id));
    const clean = (raw: unknown): number[] | null => {
      if (raw === undefined) return [];
      if (!Array.isArray(raw)) return null;
      const ids = [...new Set<number>(raw.map(Number))];
      return ids.every((id) => valid.has(id)) ? ids : null;
    };
    const view = clean(body.view);
    const post = clean(body.post);
    if (!view || !post) return json(res, 400, { error: "bad_ids" });
    store.setChannelRoles(channel.id, "view", view);
    store.setChannelRoles(channel.id, "post", post);
    // The channel's audience may have just changed: everyone in the page
    // re-derives what they can see off the channel.update frame.
    bus.emit("channel.update", { channel: { ...channel, postAllow: channel.locked ? store.postAllowList(channel.id) : [], viewRoles: view, postRoles: post } });
    changed(bus, channel.pageId);
    json(res, 200, { view, post });
  });
}
