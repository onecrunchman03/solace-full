// WEB PUSH — notifications that reach a device with Solace fully CLOSED.
//
// The socket-driven notifications (lib/notify.svelte.ts) cover every open
// tab/PWA/shell; this covers the phone in a pocket. The VAPID keypair is
// generated once at first boot and kept in app_kv — zero env config, and the
// same keys survive restarts (a key change would orphan every subscription).
//
// DELIVERY RULES, kept deliberately tight:
//   · only to users with NO live socket — an open app already pings
//   · never to a user whose manual status is "busy" (DND follows the account)
//   · DMs, personal @mentions, and event reminders. Nothing else — a push
//     channel that cries wolf gets disabled at the OS level within a week.
//   · payloads are short; a dead endpoint (404/410) is pruned on sight.

import webpush from "web-push";
import type { Store } from "./db/store";
import type { Bus } from "./bus";
import { mayEnterChannel } from "./pagescope";

let ready = false;

export function initPush(store: Store): void {
  let pub = store.kvGet("vapid_public");
  let priv = store.kvGet("vapid_private");
  if (!pub || !priv) {
    const keys = webpush.generateVAPIDKeys();
    pub = keys.publicKey;
    priv = keys.privateKey;
    store.kvSet("vapid_public", pub);
    store.kvSet("vapid_private", priv);
    console.log("[push] generated VAPID keypair");
  }
  webpush.setVapidDetails("https://solace.zone", pub, priv);
  ready = true;
}

export function pushPublicKey(store: Store): string | null {
  return ready ? store.kvGet("vapid_public") : null;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Collapses same-thread notifications on the device. */
  tag?: string;
}

/** Fire-and-forget: send to every subscription the users hold. Never throws —
 *  a push is a courtesy, not a transaction. */
// A push service that keeps refusing (or never answering) an endpoint gets
// that endpoint pruned after a few strikes — 404/410 immediately, anything
// else on the fifth consecutive failure. Without this a dead-but-not-404
// endpoint was POSTed forever on every DM. Bounded: strikes are per endpoint
// and the map is cleared on success or prune.
const strikes = new Map<string, number>();
const MAX_STRIKES = 5;
const SEND_TIMEOUT_MS = 10_000;

export function sendPush(store: Store, userIds: number[], payload: PushPayload): void {
  if (!ready || userIds.length === 0) return;
  const body = JSON.stringify(payload);
  for (const id of userIds) {
    for (const sub of store.pushSubsFor(id)) {
      void webpush
        .sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: 6 * 3600, timeout: SEND_TIMEOUT_MS },
        )
        .then(() => strikes.delete(sub.endpoint))
        .catch((e: { statusCode?: number }) => {
          const code = e?.statusCode ?? 0;
          // 404/410 = the browser dropped the subscription; 400/401/403 =
          // the service will never accept it. Prune at once.
          if (code === 404 || code === 410 || code === 400 || code === 401 || code === 403) {
            strikes.delete(sub.endpoint);
            store.prunePushSub(sub.endpoint);
            return;
          }
          const n = (strikes.get(sub.endpoint) ?? 0) + 1;
          if (n >= MAX_STRIKES) {
            strikes.delete(sub.endpoint);
            store.prunePushSub(sub.endpoint);
            console.warn(`[push] pruned an endpoint after ${n} consecutive failures (last: ${code || "network"})`);
          } else strikes.set(sub.endpoint, n);
        });
    }
  }
}

/** True when this user should get pushes right now: offline and not DND. */
function pushable(store: Store, userId: number, online: Set<number>): boolean {
  if (online.has(userId)) return false;
  const u = store.getUserById(userId);
  // A banned or suspended account is shut out of the server, so it gets none
  // of its notifications either (Oct 2026 review).
  if (!u || u.disabled || u.deletedAt || u.isBot || u.locked) return false;
  if (u.suspendedUntil && u.suspendedUntil > Date.now()) return false;
  return u.prefs?.status !== "busy";
}

const excerpt = (s: string, n = 90): string => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};

/**
 * Wire the three triggers onto the bus. Routes stay push-unaware — the same
 * events realtime bridges to sockets drive the closed-device copies.
 */
export function wirePushTriggers(store: Store, bus: Bus, onlineUsers: () => number[]): void {
  // DMs: the other participant, if they're not here to see it arrive.
  bus.on("dm.message", ({ userIds, message }) => {
    const online = new Set(onlineUsers());
    let targets = userIds.filter((id) => id !== message.senderId && pushable(store, id, online));
    if (!targets.length) return;
    const sender = store.getUserById(message.senderId);
    // A bot's DM never pushes (Sterling's notes, the goblins' letters wait
    // under the door) — the invariant CLAUDE.md promises. Admins still hear
    // the house's alert DMs on a closed device.
    if (sender?.isBot) {
      targets = targets.filter((id) => store.getUserById(id)?.isAdmin);
      if (!targets.length) return;
    }
    sendPush(store, targets, {
      title: `${sender?.displayName ?? "Someone"} (DM)`,
      body: excerpt(message.body || "sent an attachment"),
      tag: `dm-${message.conversationId}`,
    });
  });

  // Personal @mentions in channel messages. Parsed server-side here (the
  // client's mention layer is plain text on the wire, by design) and gated on
  // page membership so a private page can't leak titles through a push.
  bus.on("message", ({ message }) => {
    if (!message.body || message.author?.isBot) return;
    const names = [...message.body.matchAll(/@([a-zA-Z0-9._-]{3,32})\b/g)].map((m) => m[1]);
    if (!names.length) return;
    const channel = store.getChannel(message.channelId);
    if (!channel) return;
    const members = new Set(store.pageMembers(channel.pageId).map((m) => m.userId));
    const online = new Set(onlineUsers());
    // …and on the channel's VIEW gate too (Oct 2026 review): a push carries
    // an excerpt, and a member who can't see a gated channel must not get one.
    const maySee = (id: number): boolean => { const u = store.getUserById(id); return !!u && mayEnterChannel(store, u, channel) && !store.isBlockedEither(id, message.userId); };
    const targets = new Set<number>();
    // PAGE ROLES: an @everyone the server stamped (the author held the
    // permission) pushes the whole page — the only fan-out push there is,
    // and it's bounded by who may send one.
    if (message.everyone) {
      for (const id of members) if (id !== message.userId && pushable(store, id, online) && maySee(id)) targets.add(id);
    }
    for (const name of [...new Set(names)]) {
      const u = store.getUserByUsername(name);
      if (!u || u.id === message.userId) continue;
      if (!members.has(u.id)) continue;
      if (pushable(store, u.id, online) && maySee(u.id)) targets.add(u.id);
    }
    if (!targets.size) return;
    sendPush(store, [...targets], {
      title: `${message.author?.displayName ?? "Someone"} mentioned you`,
      body: excerpt(message.body),
      tag: `mention-${message.channelId}`,
    });
  });

  // THE COLLECTORS' NOTICE (Sep 2026): the goblins called at midnight and
  // took something — the one push a debtor most needs with the app closed.
  bus.on("lender.notice", ({ userId, title, body }) => {
    const online = new Set(onlineUsers());
    if (!pushable(store, userId, online)) return;
    sendPush(store, [userId], { title, body: excerpt(body), tag: "lender" });
  });

  // THE WALLET: somebody sent you silver while you were away.
  bus.on("wallet.transfer", ({ toId, amount, note, fromName }) => {
    const online = new Set(onlineUsers());
    if (!pushable(store, toId, online)) return;
    const body = `${fromName} sent you ${amount.toLocaleString("en-US")} silver` + (note ? `: ${excerpt(note)}` : ".");
    sendPush(store, [toId], { title: "Silver received", body, tag: "wallet" });
  });

  // Event reminders: everyone who RSVP'd yes and isn't already in the app.
  bus.on("event.remind", ({ id, title }) => {
    const online = new Set(onlineUsers());
    const targets = store.eventGoing(id).filter((uid) => pushable(store, uid, online));
    if (!targets.length) return;
    sendPush(store, targets, {
      title: "Starting in 15 minutes",
      body: excerpt(title),
      tag: `event-${id}`,
    });
  });
}
