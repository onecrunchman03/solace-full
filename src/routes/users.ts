import { json, type Router } from "../http";
import { toPublicUser } from "../types";

/** Register user-directory routes on the router. */
export function registerUserRoutes(router: Router): void {
  // The member list (everyone). The client cross-references this with the live
  // online set from the socket to render the roster.
  router.get("/api/users", "user", ({ res, store }) => {
    json(res, 200, { users: store.listUsers().map(toPublicUser) });
  });
}
