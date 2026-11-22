// Web Push subscription management (migration 74; engine in src/push.ts).
// A subscription is per-device: the client registers it when the user turns
// notifications on, and tears it down when they turn them off or log out.

import { json, type Router } from "../http";
import { pushPublicKey } from "../push";

/** A push endpoint is minted by the BROWSER's push service — one of a
 *  handful of hosts. Sep 2026 review: any https URL used to be accepted, so
 *  a member could point thousands of "subscriptions" at a victim host (or a
 *  LAN address) and every DM to them became that many outbound POSTs from
 *  the R220, never pruned because a non-404 failure didn't count. */
const PUSH_HOSTS = [
  /(^|\.)fcm\.googleapis\.com$/, // Chrome, Edge, Brave, Opera, Samsung (FCM)
  /(^|\.)push\.apple\.com$/, // Safari + iOS PWAs
  /(^|\.)push\.services\.mozilla\.com$/, // Firefox
  /(^|\.)notify\.windows\.com$/, // Edge (legacy WNS)
];
/** Per account: a phone, a laptop, a desktop, a couple of browsers. */
const MAX_SUBS_PER_USER = 8;

// The harness runs its own TLS push service on loopback — extra exact hosts
// come from the environment, never from a request.
const EXTRA_HOSTS = new Set((process.env.PUSH_EXTRA_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean));

export function isPushEndpoint(endpoint: string): boolean {
  if (!/^https:\/\/.{8,2000}$/.test(endpoint)) return false;
  try {
    const host = new URL(endpoint).hostname.toLowerCase();
    return EXTRA_HOSTS.has(host) || PUSH_HOSTS.some((re) => re.test(host));
  } catch {
    return false;
  }
}

export function registerPushRoutes(router: Router): void {
  router.get("/api/push/key", "user", ({ res, store }) => {
    const key = pushPublicKey(store);
    if (!key) return json(res, 503, { error: "push_disabled" });
    json(res, 200, { key });
  });

  router.post("/api/push/subscribe", "user", ({ req, res, body, user, store }) => {
    const endpoint = String(body?.endpoint ?? "");
    const p256dh = String(body?.keys?.p256dh ?? "");
    const auth = String(body?.keys?.auth ?? "");
    if (!isPushEndpoint(endpoint) || !p256dh || !auth) {
      return json(res, 400, { error: "bad_subscription" });
    }
    const ua = (req.headers["user-agent"] ?? "").slice(0, 200) || null;
    const r = store.addPushSub(user.id, endpoint, p256dh.slice(0, 300), auth.slice(0, 100), ua, MAX_SUBS_PER_USER);
    if (r === "taken") return json(res, 409, { error: "endpoint_taken" });
    if (r === "full") return json(res, 409, { error: "too_many_devices", max: MAX_SUBS_PER_USER });
    json(res, 200, { ok: true });
  });

  router.post("/api/push/unsubscribe", "user", ({ res, body, user, store }) => {
    const endpoint = String(body?.endpoint ?? "");
    if (endpoint) store.deletePushSub(user.id, endpoint);
    json(res, 200, { ok: true });
  });
}
