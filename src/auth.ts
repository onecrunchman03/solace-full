import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { config } from "./config";
import { weakPasswordReason } from "./passwords";
import type { Store } from "./db/store";
import type { User } from "./types";

/**
 * Hash a secret (password OR recovery secret) with scrypt and a random salt.
 * Stored as `scrypt$salt$hash` (both hex). Never store or log the plaintext.
 */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}
/** The recovery secret uses the same scrypt scheme as the password. */
export const hashSecret = hashPassword;

/** Verify a plaintext against a stored `scrypt$salt$hash`, in constant time. */
export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const actual = scryptSync(plain, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export const verifySecret = verifyPassword;

/** A fresh, unguessable session token. */
export function newToken(): string {
  return randomBytes(32).toString("hex");
}

// Crockford-ish base32 without ambiguous characters (no 0/O/1/I/L/U), so a code
// is easy to read aloud and retype. Uppercased for the same reason.
const INVITE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A fresh, human-friendly invite code (10 unambiguous chars, ~48 bits). */
export function newInviteCode(): string {
  const bytes = randomBytes(10);
  let code = "";
  for (let i = 0; i < bytes.length; i++) {
    code += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length];
  }
  return code;
}

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

/** Returns an error message if the username is invalid, or null if it's fine. */
export function validateUsername(username: string): string | null {
  if (!USERNAME_RE.test(username)) {
    return "Username must be 3–32 characters: letters, numbers, and . _ - only";
  }
  return null;
}

/** Returns an error message if the password is too weak, or null if it's fine.
 *  Complexity rules first, then the breach-list / pattern / username screen
 *  (username defaults to "" for flows that don't have it, e.g. a reset). */
export function validatePassword(password: string, username = ""): string | null {
  if (password.length < 12) return "Password must be at least 12 characters";
  if (password.length > 200) return "Password is too long";
  if (!/[a-z]/.test(password)) return "Password needs a lowercase letter";
  if (!/[A-Z]/.test(password)) return "Password needs an uppercase letter";
  if (!/[0-9]/.test(password)) return "Password needs a number";
  if (!/[^a-zA-Z0-9]/.test(password)) return "Password needs a symbol";
  return weakPasswordReason(password, username);
}

/** Returns an error message if the recovery secret is unusable, or null. The
 *  secret can reset the password (account takeover), so it's screened as hard
 *  as a password — but it's meant to be a memorable *phrase*, so we ask for
 *  length + not-weak rather than character-class complexity. */
export function validateSecret(secret: string, password = "", username = ""): string | null {
  if (secret.length < 12) return "Recovery secret must be at least 12 characters";
  if (secret.length > 200) return "Recovery secret is too long";
  if (password && secret === password) return "Recovery secret must differ from your password";
  return weakPasswordReason(secret, username, "Recovery secret");
}

/**
 * Normalize an IP to the "network" the login-location check compares on. Home
 * and mobile IPs rotate within an ISP's pool, so we key on the network prefix
 * (IPv4 /24, IPv6 /64) rather than the exact address — a friend reconnecting on
 * the same ISP isn't re-challenged, but a login from a different city/ISP is.
 */
export function networkOf(ip: string): string {
  const addr = ip.replace(/^::ffff:/i, ""); // unwrap IPv4-mapped IPv6
  if (addr.includes(":")) {
    // IPv6 → first 4 hextets (/64). Expand `::` FIRST: naively splitting the
    // compressed form treats the marker as a hextet, so "2001:db8::abcd"
    // would key on the interface bits ("2001:db8::abcd") instead of the true
    // /64 ("2001:db8:0:0") — and privacy-address rotation would look like a
    // brand-new network on every login.
    const [head, tail = ""] = addr.split("%")[0].split("::");
    const h = head ? head.split(":").filter(Boolean) : [];
    const t = tail ? tail.split(":").filter(Boolean) : [];
    const full = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
    return full.slice(0, 4).join(":") + "::/64";
  }
  const octets = addr.split(".");
  if (octets.length === 4) return octets.slice(0, 3).join(".") + ".0/24";
  return addr; // unknown shape — compare verbatim
}

const SESSION_TTL_MS = config.sessionTtlDays > 0 ? config.sessionTtlDays * 86_400_000 : 0;
/** How stale a session's lastSeenAt may get before a request re-stamps it. */
const TOUCH_MS = 5 * 60_000;

/**
 * Resolve a bearer token to the logged-in user, or undefined if the token is
 * missing, unknown, expired, or belongs to a disabled account. Expired sessions
 * are cleaned up as they're encountered.
 */
export function userForToken(store: Store, token: string | undefined): User | undefined {
  if (!token) return undefined;
  const session = store.getSession(token);
  if (!session) return undefined;
  // Sliding sessions run on lastSeenAt, not createdAt (migration 65): an
  // ACTIVE login never expires, and only a session unused for the full TTL
  // dies (plus an explicit logout, always). That's what makes the desktop
  // app's "stay signed in unless I log out" hold. Before the split this
  // measured from a createdAt that renewal overwrote, which both destroyed
  // the token's real age and — because renewal only fired past half the TTL —
  // still killed a session last used on day 14 when day 30 came around.
  const idle = Date.now() - session.lastSeenAt;
  if (SESSION_TTL_MS > 0 && idle > SESSION_TTL_MS) {
    store.deleteSession(token);
    return undefined;
  }
  // Stamped at most once every TOUCH_MS so a chatty client doesn't turn every
  // request into a write, while the Security panel's "last seen" stays honest.
  if (idle > TOUCH_MS) {
    store.touchSession(token);
  }
  const user = store.getUserById(session.userId);
  if (!user || user.disabled || user.locked) return undefined;
  if (user.suspendedUntil && user.suspendedUntil > Date.now()) return undefined; // suspended
  return user;
}

/**
 * WHICH SESSION A SOCKET OPENED WITH (Oct 2026 review). A kick used to close
 * every socket an account had, and the client answers that close by signing
 * out, so revoking ONE device signed out all of them (the asker included), and
 * a password change couldn't hang up a thief's sockets without hanging up the
 * owner's too. Each socket server remembers the token here, and a kick closes
 * only the sockets whose session no longer stands.
 */
const socketTokens = new WeakMap<object, string>();
export function rememberSocketToken(ws: object, token: string | null | undefined): void {
  if (token) socketTokens.set(ws, token);
}
/** Does the session this socket opened with still resolve to a live user? */
export function sessionStandsFor(store: Store, ws: object): boolean {
  return !!userForToken(store, socketTokens.get(ws));
}

/**
 * Resolve a bearer token to a DEAD-BUT-FRESH user — somebody inside their own
 * 48-hour wake (migration 68, see src/mortality.ts).
 *
 * This is a SEPARATE resolver rather than a flag on the one above, and that is
 * the safety property: `userForToken` still refuses every disabled account, so
 * a wake session cannot reach a single ordinary route no matter what it asks
 * for. The only doors it opens are the ones explicitly marked "wake" — look at
 * your own grave, and buy yourself back out of it.
 *
 * Deliberately strict about which dead: locked, suspended and already-sealed
 * accounts are refused, so this can never become a way back in for somebody
 * moderation has shut out.
 */
export function wakeUserForToken(store: Store, token: string | undefined): User | undefined {
  if (!token) return undefined;
  const session = store.getSession(token);
  if (!session) return undefined;
  const idle = Date.now() - session.lastSeenAt;
  if (SESSION_TTL_MS > 0 && idle > SESSION_TTL_MS) {
    store.deleteSession(token);
    return undefined;
  }
  const user = store.getUserById(session.userId);
  if (!user || user.locked || user.isBot) return undefined;
  if (user.suspendedUntil && user.suspendedUntil > Date.now()) return undefined;
  if (!user.disabled || !user.diedAt) return undefined; // alive, or never died
  if (!store.graveFresh(user.id)) return undefined; // sealed: nothing left to decide
  return user;
}

/**
 * …and the same trick for THE CELL (migration 72). A jailed debtor is
 * `disabled`, so `userForToken` already refuses them everywhere; this
 * resolves ONLY the jailed-and-unsealed, and only for routes marked "jail".
 *
 * The two sets can never overlap: a corpse has `diedAt` set and `jailedAt`
 * NULL, a prisoner has it the other way round. That separation is load
 * bearing — the Wake's self-revive (your purse plus a third of your
 * collection) is far cheaper than bail on a large debt, so a debtor who could
 * reach the wake routes could buy their way out of a million-silver loan by
 * pretending to be dead.
 */
export function jailUserForToken(store: Store, token: string | undefined): User | undefined {
  if (!token) return undefined;
  const session = store.getSession(token);
  if (!session) return undefined;
  const idle = Date.now() - session.lastSeenAt;
  if (SESSION_TTL_MS > 0 && idle > SESSION_TTL_MS) {
    store.deleteSession(token);
    return undefined;
  }
  const user = store.getUserById(session.userId);
  if (!user || user.locked || user.isBot) return undefined;
  if (user.suspendedUntil && user.suspendedUntil > Date.now()) return undefined;
  if (!user.jailedAt || user.diedAt) return undefined; // not inside (or dead, which is the other door)
  if (!(user.jailSealsAt && user.jailSealsAt > Date.now())) return undefined; // sealed
  return user;
}
