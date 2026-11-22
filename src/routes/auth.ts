import { config } from "../config";
import {
  hashPassword,
  hashSecret,
  jailUserForToken,
  networkOf,
  newToken,
  userForToken,
  validatePassword,
  validateSecret,
  validateUsername,
  verifyPassword,
  verifySecret,
  wakeUserForToken,
} from "../auth";
import type { Store, } from "../db/store";
import type { Bus } from "../bus";
import type { User } from "../types";
import { MAX_DISPLAY_NAME, toPublicUser, toSelfUser } from "../types";
import { bearer, json, clientIp, userAgent, makeRateLimiter, type Router } from "../http";
import { checkStats } from "../achievements";
import type { LoginOutcome } from "../types";
import { HOSTING_VERSION, LEGAL_URLS, TERMS_VERSION } from "../legal";

/** Where a sign-in attempt came from, resolved once per request. */
interface Origin {
  ip: string;
  network: string;
  ua: string | null;
}

/** Issue a session and the standard success payload, trusting the caller's
 *  network from here on. Also the single place a successful sign-in is
 *  written to the ledger — every path that hands out a token comes through
 *  here, so there is no way to get in without leaving a row. */
function grantSession(
  store: Store,
  user: User,
  origin: Origin,
  extra: Record<string, unknown> = {},
  outcome: LoginOutcome = "ok",
) {
  const { ip, network, ua } = origin;
  store.clearLoginFailures(user.id);
  store.rememberNetwork(user.id, network);
  const token = newToken();
  store.createSession(user.id, token, { ip, ua, network });
  store.recordLoginEvent({ userId: user.id, username: user.username, outcome, ip, network, ua });
  // Achievements self-heal on login — this is what makes every stat badge
  // retroactive the day the system ships (and after any catalog addition).
  try {
    checkStats(user.id);
  } catch {
    /* never let a badge check break a login */
  }
  return { token, user: toSelfUser(user), ...extra };
}

/** Register the health check and all authentication routes on the router. */
/**
 * A grave or a cell whose time ran out, sealed NOW (Oct 2026 review): the
 * sweeps run every minute and these doors never sealed lazily, so a player
 * whose countdown had just ended was refused at sign-in as if they'd typed the
 * wrong password, until the sweep caught up. Announced exactly as the sweep
 * announces it. Returns the account as it stands afterwards.
 */
function sealIfOverdue(store: Store, bus: Bus, user: User | undefined): User | undefined {
  if (!user || !user.disabled) return user;
  const now = Date.now();
  let sealed = false;
  if (user.diedAt && user.graveSealsAt && user.graveSealsAt <= now) sealed = store.sealGrave(user.id).sealed;
  else if (!user.diedAt && user.jailedAt && user.jailSealsAt && user.jailSealsAt <= now) {
    sealed = store.sealCell(user.id).sealed;
    if (sealed) bus.emit("lender.change", {});
  }
  if (!sealed) return user;
  const after = store.getUserById(user.id);
  bus.emit("grave.sealed", { userId: user.id, generation: after?.generation ?? (user.generation ?? 1) + 1, name: user.displayName });
  return after;
}

export function registerAuthRoutes(router: Router, onLogout?: (userId: number) => void): void {
  const rateLimit = makeRateLimiter();

  const originOf = (req: Parameters<typeof clientIp>[0]): Origin => {
    const ip = clientIp(req);
    return { ip, network: networkOf(ip), ua: userAgent(req) };
  };
  /** Log a refused attempt. Takes the username as TYPED, so probes against
   *  accounts that don't exist are visible — that pattern (one address
   *  walking a list of names) is what a stuffing run looks like. */
  // A rate-limited address is written to the ledger once a minute, not
  // once per refused request (Oct 2026 review): a flood past the limit was
  // a row — and a disk sync — per request, with nothing to bound it.
  const limitedSeen = new Map<string, number>();
  const refuse = (
    store: Store,
    origin: Origin,
    username: string,
    outcome: LoginOutcome,
    userId: number | null = null,
  ) => {
    if (outcome === "rate_limited") {
      const now = Date.now();
      if (now - (limitedSeen.get(origin.ip) ?? 0) < 60_000) return;
      limitedSeen.set(origin.ip, now);
      if (limitedSeen.size > 5_000) {
        for (const [k, t] of limitedSeen) if (now - t > 60_000) limitedSeen.delete(k);
      }
    }
    store.recordLoginEvent({ userId, username, outcome, ip: origin.ip, network: origin.network, ua: origin.ua });
  };

  // Liveness/readiness check.
  router.get("/health", "none", ({ res, store }) => {
    json(res, 200, { status: "ok", db: store.healthy() ? "ok" : "down" });
  });

  // Public sign-up policy, so the login screen knows whether to show the invite
  // field. No secrets here — just the two flags that gate /api/register.
  router.get("/api/auth-config", "none", ({ res }) => {
    json(res, 200, {
      allowRegistration: config.allowRegistration,
      requireInvite: config.requireInvite,
    });
  });

  // Create a new account (if self-registration is enabled) and log in. When
  // REQUIRE_INVITE is set, a valid admin-minted invite code is also required.
  // Every new account sets a recovery secret at sign-up.
  router.post("/api/register", "none", ({ req, res, body, store, bus }) => {
    const origin = originOf(req);
    if (!rateLimit(`register:${origin.ip}`, 5, 60 * 60 * 1000)) {
      refuse(store, origin, String(body.username ?? "").trim().slice(0, 64), "rate_limited");
      return json(res, 429, { error: "rate_limited" });
    }
    if (!config.allowRegistration) return json(res, 403, { error: "registration_disabled" });

    const username = String(body.username ?? "").trim();
    const displayName = String(body.displayName ?? "").trim() || username;
    const password = String(body.password ?? "");
    const secret = String(body.secret ?? "");

    const uErr = validateUsername(username);
    if (uErr) return json(res, 400, { error: "bad_username", message: uErr });
    // The same cap PATCH /api/me enforces (MAX_NAME) — a display name rides
    // every PublicUser payload the account ever appears in, so an uncapped one
    // at sign-up was a permanent amplifier on every message they posted.
    if (displayName.length > MAX_DISPLAY_NAME) {
      return json(res, 400, { error: "bad_display_name", message: `Display name must be ${MAX_DISPLAY_NAME} characters or fewer.` });
    }
    const pErr = validatePassword(password, username);
    if (pErr) return json(res, 400, { error: "bad_password", message: pErr });
    const sErr = validateSecret(secret, password, username);
    if (sErr) return json(res, 400, { error: "bad_secret", message: sErr });
    if (store.getUserByUsername(username)) return json(res, 409, { error: "username_taken" });

    // THE REROLL (Josh, Sep 2026): dying must never cost you your seat at the
    // table. A wheel-dead account (the Wake) or a goblin-jailed one (the Cell)
    // may open the registration door WITHOUT a fresh invite — its own shut-out
    // session token is the proof. The token resolvers are the security here:
    // wakeUserForToken answers only for tombstoned-but-fresh graves and
    // jailUserForToken only for unsealed cells, so a living session, a banned
    // (locked) account, a scrubbed one, or a stale token all fail to qualify —
    // this is a door for the dead, never a general invite bypass. The old
    // account's fate is untouched: the grave can still be raised until it
    // seals, and the cell still settles with the goblins.
    const rerollTok = String(body.rerollToken ?? "").trim();
    // ONE REROLL PER GRAVE (Sep 2026 review). The token used to stay valid for
    // the whole wake window, so one death registered unlimited invite-free
    // accounts — each a fresh spin faucet feeding the main. The stamp below
    // is claimed after the new account exists; a stamped account is just a
    // dead one with no invite.
    let rerollFrom = rerollTok
      ? wakeUserForToken(store, rerollTok) ?? jailUserForToken(store, rerollTok)
      : null;
    // Per GRAVE, not per account (Oct 2026 review): the stamp was never
    // cleared, so an account raised or reborn and dead again could never
    // reroll. A stamp counts only if it's from THIS grave or cell.
    const graveStart = rerollFrom ? (rerollFrom.diedAt ?? rerollFrom.jailedAt ?? 0) : 0;
    if (rerollFrom && (store.rerolledAt(rerollFrom.id) ?? -1) >= graveStart) rerollFrom = null;

    let user: User;
    try {
      if (config.requireInvite && !rerollFrom) {
        const code = String(body.inviteCode ?? "").trim().toUpperCase();
        if (!code) return json(res, 400, { error: "invite_required" });
        const result = store.createUserViaInvite({
          username,
          displayName,
          passwordHash: hashPassword(password),
          code,
        });
        if ("error" in result) return json(res, 400, { error: "invite_invalid" });
        user = result.user;
      } else {
        user = store.createUser({ username, displayName, passwordHash: hashPassword(password) });
      }
    } catch (err) {
      // Two concurrent registrations of the same name: the earlier existence
      // check is non-atomic, so the loser lands on the UNIQUE constraint —
      // that's a 409 like any taken name, not a server error.
      if (err instanceof Error && err.message.includes("UNIQUE")) {
        return json(res, 409, { error: "username_taken" });
      }
      throw err;
    }
    if (rerollFrom) {
      store.markRerolled(rerollFrom.id, graveStart);
      // Operator visibility: the ledger's register row shows the new name;
      // this line ties it to the life it walked away from.
      console.log(
        `[register] reroll: "${rerollFrom.username}" (#${rerollFrom.id}) starts over as "${user.username}" (#${user.id})`,
      );
    }
    store.setSecret(user.id, hashSecret(secret));
    // THE PAPERWORK: the sign-up form's "I'm 18+ and agree" box. Recorded
    // when present; an account created without it (an API client, an old
    // form) simply meets the TermsGate on its first visit — the gate, not
    // this flag, is the enforcement, so nothing registers past the Terms.
    if (body.acceptTerms === true) store.acceptTerms(user.id, TERMS_VERSION, origin.ip, origin.ua);
    user = store.getUserById(user.id)!; // re-read so the self view reports hasSecret + termsVersion

    const payload = grantSession(store, user, origin, {}, "register");
    // Tell connected clients a new member exists so rosters update live.
    bus.emit("user.update", { user: toPublicUser(user) });
    json(res, 200, payload);
  });

  // Log in — step 1 (password). Outcomes:
  //  - { token, user }                 → known network, done
  //  - { token, user, mustSetSecret }  → logged in, but no recovery secret yet
  //  - { challenge: "secret" }         → password ok from a NEW network; the
  //                                       recovery secret is required (step 2)
  router.post("/api/login", "none", ({ req, res, body, store, bus }) => {
    const origin = originOf(req);
    const ip = origin.ip;
    const typed = String(body.username ?? "").trim().slice(0, 64);
    if (!rateLimit(`login:${ip}`, 20, 15 * 60 * 1000)) {
      refuse(store, origin, typed, "rate_limited");
      return json(res, 429, { error: "rate_limited" });
    }
    const username = typed; // a real username is ≤32 chars; anything longer can only ever be a ledger row
    const password = String(body.password ?? "");
    if (!username || !password) return json(res, 400, { error: "missing_credentials" });

    const user = sealIfOverdue(store, bus, store.getUserByUsername(username));
    // THE WAKE (migration 68): a tombstoned account whose grave is still fresh
    // may come through this door, because buying yourself back out of it is
    // something only you can do. The session it gets reaches nothing but the
    // wake routes — see wakeUserForToken — and it still has to pass the
    // password, the lockout, the suspension check and the new-network
    // challenge below, exactly like a living one. Nothing here is a shortcut;
    // it is the same door with one more room behind it.
    const wakeable =
      !!user && user.disabled && !user.locked && !user.isBot && !!user.diedAt && store.graveFresh(user.id);
    // …and the goblins' cell is that same door with a different room behind
    // it (migration 72): a jailed debtor is `disabled` too, and has to be able
    // to log in and look at the bars while somebody decides whether to pay.
    // Distinct from a grave BY CONSTRUCTION — a prisoner's diedAt is NULL and
    // a corpse's jailedAt is — which is what stops a debtor reaching the
    // Wake's much cheaper self-revive to escape what they owe.
    const jailed =
      !!user && user.disabled && !user.locked && !user.isBot && !user.diedAt && !!user.jailedAt &&
      !!user.jailSealsAt && user.jailSealsAt > Date.now();
    // House characters (Sterling) have no door to knock on. All three of these
    // answer identically on the wire — the ledger keeps the distinction, since
    // "which names is this address trying" is the whole tell.
    if (!user || (user.disabled && !wakeable && !jailed) || user.locked || user.isBot) {
      refuse(store, origin, username, user ? "account_closed" : "unknown_user", user?.id ?? null);
      return json(res, 401, { error: "invalid_credentials" });
    }

    // THE LOCK BINDS STRANGERS, NOT THE OWNER (Josh, Oct 2026). One wrong
    // password every fifteen minutes from anywhere used to keep any account
    // — the admin's included — locked out of signing in on a new device or
    // resetting, forever. A network this account has signed in from before
    // still gets to try its password; only unfamiliar ones wait out the lock.
    const lockedUntil = store.loginLockedUntil(user.id);
    if (lockedUntil > Date.now() && !store.isKnownNetwork(user.id, origin.network)) {
      refuse(store, origin, username, "locked", user.id);
      return json(res, 429, { error: "locked", retryAfter: Math.ceil((lockedUntil - Date.now()) / 1000) });
    }
    if (!verifyPassword(password, user.passwordHash)) {
      store.recordLoginFailure(user.id);
      refuse(store, origin, username, "bad_password", user.id);
      return json(res, 401, { error: "invalid_credentials" });
    }
    // Only AFTER the password proves out: a suspension is moderation state,
    // not something an enumeration probe with junk credentials may learn.
    if (user.suspendedUntil && user.suspendedUntil > Date.now()) {
      refuse(store, origin, username, "suspended", user.id);
      return json(res, 403, { error: "suspended", until: user.suspendedUntil });
    }

    const network = origin.network;
    // Existing/legacy accounts with no secret can't be network-challenged (there's
    // nothing to verify against) — let them in but require a secret before use.
    if (!user.secretHash) {
      const s = grantSession(store, user, origin, { mustSetSecret: true });
      return json(res, 200, wakeable ? { ...s, wake: true } : jailed ? { ...s, jail: true } : s);
    }
    if (store.isKnownNetwork(user.id, network)) {
      const s = grantSession(store, user, origin);
      // `wake` tells the client to mount the wake screen instead of the app.
      // The server doesn't rely on it: the token itself only opens wake routes.
      return json(res, 200, wakeable ? { ...s, wake: true } : jailed ? { ...s, jail: true } : s);
    }
    refuse(store, origin, username, "challenged", user.id);
    // Correct password from an unrecognized network → demand the recovery secret.
    // No token issued yet; the client reposts to /api/login/verify. We do NOT
    // clear the failure counter here: otherwise an attacker who has the password
    // could re-hit this endpoint to reset the lockout and get unlimited secret
    // guesses on /verify. The counter only clears on a fully successful login.
    json(res, 200, { challenge: "secret" });
  });

  // Log in — step 2 (new-network verification with the recovery secret).
  router.post("/api/login/verify", "none", ({ req, res, body, store, bus }) => {
    const origin = originOf(req);
    const typed = String(body.username ?? "").trim().slice(0, 64);
    if (!rateLimit(`login:${origin.ip}`, 20, 15 * 60 * 1000)) {
      refuse(store, origin, typed, "rate_limited");
      return json(res, 429, { error: "rate_limited" });
    }
    const username = typed;
    const password = String(body.password ?? "");
    const secret = String(body.secret ?? "");
    if (!username || !password || !secret) return json(res, 400, { error: "missing_credentials" });

    const user = sealIfOverdue(store, bus, store.getUserByUsername(username));
    // Step 1 lets a fresh grave through, so step 2 must too — otherwise a wake
    // reached from an unrecognized network would be challenged and then
    // refused, which is the same as having no wake at all.
    const wakeable =
      !!user && user.disabled && !user.locked && !user.isBot && !!user.diedAt && store.graveFresh(user.id);
    // …and the goblins' cell is that same door with a different room behind
    // it (migration 72): a jailed debtor is `disabled` too, and has to be able
    // to log in and look at the bars while somebody decides whether to pay.
    // Distinct from a grave BY CONSTRUCTION — a prisoner's diedAt is NULL and
    // a corpse's jailedAt is — which is what stops a debtor reaching the
    // Wake's much cheaper self-revive to escape what they owe.
    const jailed =
      !!user && user.disabled && !user.locked && !user.isBot && !user.diedAt && !!user.jailedAt &&
      !!user.jailSealsAt && user.jailSealsAt > Date.now();
    if (!user || (user.disabled && !wakeable && !jailed) || user.locked || !user.secretHash) {
      refuse(store, origin, username, user ? "account_closed" : "unknown_user", user?.id ?? null);
      return json(res, 401, { error: "invalid_credentials" });
    }

    const lockedUntil = store.loginLockedUntil(user.id);
    if (lockedUntil > Date.now()) {
      refuse(store, origin, username, "locked", user.id);
      return json(res, 429, { error: "locked", retryAfter: Math.ceil((lockedUntil - Date.now()) / 1000) });
    }
    // Both must hold — the password AND the secret — from this new network.
    if (!verifyPassword(password, user.passwordHash) || !verifySecret(secret, user.secretHash)) {
      const until = store.recordLoginFailure(user.id);
      refuse(store, origin, username, "bad_secret", user.id);
      return json(res, 401, {
        error: "invalid_secret",
        ...(until > Date.now() ? { locked: true, retryAfter: Math.ceil((until - Date.now()) / 1000) } : {}),
      });
    }
    if (user.suspendedUntil && user.suspendedUntil > Date.now()) {
      refuse(store, origin, username, "suspended", user.id);
      return json(res, 403, { error: "suspended", until: user.suspendedUntil });
    }
    // CHALLENGE PASSED: the password AND the recovery secret, from a network
    // this account has never used. Its own outcome code because it is the
    // loudest legitimate-looking event the system can produce — a friend
    // travelling, or a complete takeover, and nothing on the wire tells them
    // apart. Sterling escalates it; for staff accounts, every single time.
    const s = grantSession(store, user, origin, {}, "challenge_passed");
    json(res, 200, wakeable ? { ...s, wake: true } : jailed ? { ...s, jail: true } : s);
  });

  // Set or replace the recovery secret (requires the current password). Also
  // trusts the current network — you're clearly you if you can do this.
  // The password check rides the SAME per-account lockout as /api/login: an
  // attacker holding a stolen session token must not get a free brute-force
  // oracle on authenticated endpoints.
  router.post("/api/me/secret", "user", ({ req, res, body, user, store }) => {
    const lockedUntil = store.loginLockedUntil(user.id);
    if (lockedUntil > Date.now()) {
      return json(res, 429, { error: "locked", retryAfter: Math.ceil((lockedUntil - Date.now()) / 1000) });
    }
    const currentPassword = String(body.currentPassword ?? "");
    const secret = String(body.secret ?? "");
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      store.recordLoginFailure(user.id);
      return json(res, 403, { error: "wrong_password" });
    }
    store.clearLoginFailures(user.id);
    const sErr = validateSecret(secret, currentPassword, user.username);
    if (sErr) return json(res, 400, { error: "bad_secret", message: sErr });
    store.setSecret(user.id, hashSecret(secret));
    const origin = originOf(req);
    store.rememberNetwork(user.id, origin.network);
    refuse(store, origin, user.username, "secret_changed", user.id);
    const fresh = store.getUserById(user.id)!;
    json(res, 200, { ok: true, user: toSelfUser(fresh) });
  });

  // Reset a forgotten password with the recovery secret. Self-service (there's
  // no email); kills every session so a thief holding an old one is evicted.
  router.post("/api/reset-password", "none", ({ req, res, body, store, bus }) => {
    const origin = originOf(req);
    const typed = String(body.username ?? "").trim().slice(0, 64);
    if (!rateLimit(`reset:${origin.ip}`, 5, 60 * 60 * 1000)) {
      refuse(store, origin, typed, "rate_limited");
      return json(res, 429, { error: "rate_limited" });
    }
    const username = typed;
    const secret = String(body.secret ?? "");
    const newPassword = String(body.newPassword ?? "");
    if (!username || !secret || !newPassword) return json(res, 400, { error: "missing_fields" });

    const user = store.getUserByUsername(username);
    // No account, or no secret ever set → generic failure (don't reveal which).
    if (!user || user.disabled || user.locked || !user.secretHash) {
      refuse(store, origin, username, user ? "account_closed" : "unknown_user", user?.id ?? null);
      return json(res, 401, { error: "reset_failed" });
    }

    // A known network may reset through the lock, like it may sign in.
    const lockedUntil = store.loginLockedUntil(user.id);
    if (lockedUntil > Date.now() && !store.isKnownNetwork(user.id, origin.network)) {
      refuse(store, origin, username, "locked", user.id);
      return json(res, 429, { error: "locked", retryAfter: Math.ceil((lockedUntil - Date.now()) / 1000) });
    }
    if (!verifySecret(secret, user.secretHash)) {
      store.recordLoginFailure(user.id);
      refuse(store, origin, username, "reset_failed", user.id);
      return json(res, 401, { error: "reset_failed" });
    }
    if (user.suspendedUntil && user.suspendedUntil > Date.now()) {
      refuse(store, origin, username, "suspended", user.id);
      return json(res, 403, { error: "suspended", until: user.suspendedUntil });
    }
    const pErr = validatePassword(newPassword, username);
    if (pErr) return json(res, 400, { error: "bad_password", message: pErr });
    // The recovery secret and the password must stay two credentials (the
    // registration rule); a reset could make them one (Oct 2026 review).
    if (verifySecret(newPassword, user.secretHash)) {
      return json(res, 400, { error: "bad_password", message: "Your new password must differ from your recovery secret" });
    }

    store.setPassword(user.id, hashPassword(newPassword));
    store.deleteOtherSessions(user.id, ""); // no session to keep - evict all
    // …and hang up their live sockets: deleting the rows alone left a thief's
    // open sockets streaming this account's DMs (Oct 2026 review).
    bus.emit("user.kick", { userId: user.id });
    store.clearLoginFailures(user.id);
    store.rememberNetwork(user.id, origin.network);
    // A completed self-service reset IS an account takeover when it isn't the
    // owner doing it — the secret alone was enough. Always on the ledger.
    refuse(store, origin, username, "reset_ok", user.id);
    json(res, 200, { ok: true });
  });

  // Log out: invalidate the current token, and stand up from any game the
  // user is seated at (blackjack seat, Bone Pit table) — a logged-out player
  // shouldn't haunt a table.
  // "none" auth, resolved by hand across all THREE session kinds: a wake
  // or jail token used to 401 here (the route was user-level), so "Sign
  // out" on those screens dropped the client's copy and left the server's
  // row alive until its TTL (Sep 2026 review). Exempt from the Terms gate
  // by construction, exactly as before.
  router.post("/api/logout", "none", ({ req, res, url, store, bus }) => {
    const token = bearer(req, url);
    const user = userForToken(store, token) ?? wakeUserForToken(store, token) ?? jailUserForToken(store, token);
    if (!user) return json(res, 401, { error: "unauthorized" });
    onLogout?.(user.id);
    if (token) store.deleteSession(token);
    // (the session is gone: a socket that was opened with it is told so. The show's watch socket stayed open for
    // a signed-out member, and for a signed-out admin it kept the stick of a walk: found by the walk harness)
    bus.emit("session.ended", { userId: user.id });
    json(res, 200, { ok: true });
  });

  // A graceful app close (the desktop X): leave games + tables like a logout,
  // but KEEP the session — the next launch is still signed in. sendBeacon-
  // friendly (?token= auth), since a closing window can't await a fetch.
  router.post("/api/presence/exit", "user", ({ res, user }) => {
    onLogout?.(user.id);
    json(res, 200, { ok: true });
  });

  // Who am I? Used by the client to bootstrap after it has a token.
  router.get("/api/me", "user", ({ res, user }) => {
    json(res, 200, { user: toSelfUser(user) });
  });

  // ---- THE PAPERWORK ----------------------------------------------------------
  // The current document versions, public: the login screen and the
  // TermsGate compare the account's accepted version against these.
  router.get("/api/legal", "none", ({ res }) => {
    json(res, 200, { termsVersion: TERMS_VERSION, hostingVersion: HOSTING_VERSION, urls: LEGAL_URLS });
  });

  // Accept the CURRENT Terms (the gate's button). A stale version number is
  // refused — a client that cached an old gate must not record acceptance
  // of a document its user never saw.
  router.post("/api/me/accept-terms", "user", ({ req, res, body, user, store }) => {
    const version = Number(body.version);
    if (version !== TERMS_VERSION) return json(res, 400, { error: "stale_version", current: TERMS_VERSION });
    // Already on this version: nothing to record (the ledger holds one row
    // per genuine acceptance, not one per click of a stuck button).
    if (user.termsVersion !== TERMS_VERSION) {
      const origin = originOf(req);
      store.acceptTerms(user.id, TERMS_VERSION, origin.ip, origin.ua);
    }
    json(res, 200, { ok: true, user: toSelfUser(store.getUserById(user.id)!) });
  });
}
