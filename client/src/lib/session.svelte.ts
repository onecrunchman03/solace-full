// Reactive authentication state, shared across the app. Uses Svelte 5 runes,
// so components that read `session.user` update automatically when it changes.

import { api, getToken, setToken, ApiError, type User, type WakeState, type CellState } from "./api";
import { adoptPrefs } from "./prefs.svelte";
import { isDesktopShell } from "./platform";
import { teardownPush } from "./notify.svelte";
import { dropAssetCache } from "../survivorz/assetcache";

/** `wake` is set when this token belongs to a DEAD account whose grave is
 *  still fresh (see src/mortality.ts). It is deliberately separate from
 *  `user`: a wake session is not signed in — the token opens two routes and
 *  nothing else — so the app must mount the wake screen instead of itself. */
/** …and `cell` is the goblins' version of the same idea (migration 72): a
 *  JAILED debtor, held rather than dead. Same rule as `wake` — the token
 *  opens one route and nothing else, so `user` stays null and the app mounts
 *  the cell instead of itself. The two are mutually exclusive by construction
 *  on the server (a corpse has diedAt, a prisoner has jailedAt). */
export const session = $state<{
  user: User | null;
  loading: boolean;
  wake: WakeState | null;
  cell: CellState | null;
}>({
  user: null,
  loading: true,
  wake: null,
  cell: null,
});

// ---- Forgotten-browser guard ------------------------------------------------
// Someone who logs in on a borrowed/shared browser and walks away shouldn't
// stay signed in forever: 24h without any input (the timestamp is maintained
// by status.svelte.ts's idle tracker, shared across tabs) logs the session
// out. The desktop shell is exempt — it's tray-resident on your own machine
// and "stay signed in" is the whole point there.
const IDLE_LOGOUT_MS = 24 * 3600_000;
const LAST_ACTIVE_KEY = "solace_last_active"; // written by status.svelte.ts

function idleTooLong(): boolean {
  if (isDesktopShell) return false;
  try {
    const raw = localStorage.getItem(LAST_ACTIVE_KEY);
    if (!raw) return false; // no record — treat as fresh
    return Date.now() - Number(raw) > IDLE_LOGOUT_MS;
  } catch {
    return false;
  }
}

// A long-lived open tab checks periodically too (not just at boot).
setInterval(() => {
  if (session.user && idleTooLong()) void logout();
}, 5 * 60_000);

/** On startup, if we have a stored token, confirm it still identifies a user.
 *
 *  Stay-signed-in rule: only an EXPLICIT 401/403 from the server means the
 *  token is dead. A network failure or a mid-deploy 502 keeps the token and
 *  retries — the old behavior (clear on any error) silently logged people
 *  out whenever they opened the app during a restart. */
/** `awaitStandUp`: the caller knows the account is about to stand up (a grave
 *  or a cell just ran out), so a 401 is given the sweep's minute to clear
 *  before the token is written off (Oct 2026 review — it used to be cleared
 *  at once, and the player landed on the login screen). */
export async function bootstrap(opts: { awaitStandUp?: boolean } = {}): Promise<void> {
  const started = Date.now();
  if (!getToken()) {
    session.loading = false;
    return;
  }
  // Reopening a browser whose session sat untouched past 24h: sign it out
  // properly (kills the server session too) instead of resuming.
  if (idleTooLong()) {
    await logout();
    session.loading = false;
    return;
  }
  for (let attempt = 0; ; attempt++) {
    try {
      const { user } = await api.me();
      session.user = user;
      adoptPrefs(user.prefs);
      break;
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        // Before writing the token off: /api/me refuses a DEAD account, and a
        // dead account inside its 48-hour wake still has somewhere to be.
        // Without this a refresh during your own wake would look like being
        // signed out, and the one screen where you can still do something
        // about it would be unreachable.
        if (await resumeWake()) break;
        if (await resumeCell()) break;
        if (opts.awaitStandUp && Date.now() - started < 90_000) {
          await new Promise((r) => setTimeout(r, 10_000));
          attempt = -1; // a fresh set of network retries after each wait
          continue;
        }
        // The account is gone from this device, so its pushes go too (Oct 2026
        // review): unsubscribe locally — the push service then 410s and the
        // server prunes the row. The API half fails without a token; fine.
        void teardownPush();
        setToken(null); // genuinely stale/expired/revoked
        break;
      }
      if (attempt >= 2) break; // give up quietly — the token survives for next launch
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
  session.loading = false;
}

function adopt(token: string, user: User): void {
  setToken(token);
  session.user = user;
  session.wake = null;
  session.cell = null;
  adoptPrefs(user.prefs);
}

/** The server closed this socket because its session no longer stands (the
 *  kick is session-aware, so a live session is never kicked). Before signing
 *  out: a death or the goblins' cell also ends an ordinary session, and those
 *  tokens still have a screen to show. Signing out deleted the prisoner's jail
 *  session instead of opening the Cell (Oct 2026 review). */
export async function sessionKicked(): Promise<void> {
  if (await resumeWake()) return;
  if (await resumeCell()) return;
  await logout();
}

/** Does the stored token belong to somebody inside their own wake? Returns
 *  true if so, having put the app into wake mode. */
async function resumeWake(): Promise<boolean> {
  try {
    session.wake = await api.wake();
    session.user = null;
    return true;
  } catch {
    session.wake = null;
    return false;
  }
}

/** Does the stored token belong to somebody in the goblins' cell? */
async function resumeCell(): Promise<boolean> {
  try {
    session.cell = await api.cell();
    session.user = null;
    return true;
  } catch {
    session.cell = null;
    return false;
  }
}

/** Re-read the cell — the countdown moves, and somebody may have bailed you
 *  out, in which case /api/cell starts 401ing and the answer is to reload
 *  into the app as a free person. */
export async function refreshCell(): Promise<"still-held" | "free"> {
  try {
    session.cell = await api.cell();
    return "still-held";
  } catch (e) {
    // Only the server saying no means the cell is gone; a blip or a deploy's
    // 502 used to read as freedom and drop the prisoner at the login screen
    // (Oct 2026 review). The next poll tries again.
    if (!(e instanceof ApiError && (e.status === 401 || e.status === 403))) return "still-held";
    session.cell = null;
    // Loading while the account stands up (Oct 2026 review): without it the
    // freed prisoner saw the Login screen for the length of the wait.
    session.loading = true;
    await bootstrap({ awaitStandUp: true });
    return "free";
  }
}

/** Re-read the wake (the countdown moves, and a friend may have raised you
 *  while it was open — in which case /api/wake starts 401ing and the right
 *  answer is to reload into the app as a living person). */
export async function refreshWake(): Promise<"still-dead" | "alive"> {
  try {
    session.wake = await api.wake();
    return "still-dead";
  } catch (e) {
    // The same rule: only a 401/403 means the grave has resolved.
    return e instanceof ApiError && (e.status === 401 || e.status === 403) ? "alive" : "still-dead";
  }
}

/** Stand up: the wake token becomes an ordinary session, so just re-bootstrap. */
export async function leaveWake(): Promise<void> {
  session.wake = null;
  session.loading = true;
  await bootstrap({ awaitStandUp: true });
}

/** Log in. Returns "ok" when signed in, or "challenge" when the server wants
 *  the recovery secret (a login from a new network) — the caller then collects
 *  it and calls loginVerify. */
export async function login(username: string, password: string): Promise<"ok" | "challenge" | "wake" | "jail"> {
  const r = await api.login(username, password);
  if ("challenge" in r) return "challenge";
  // A dead account with a fresh grave gets a token that opens its own wake and
  // nothing else. It is NOT a sign-in, so `user` stays null.
  if ("wake" in r && r.wake) {
    setToken(r.token);
    await resumeWake();
    return "wake";
  }
  if ("jail" in r && r.jail) {
    setToken(r.token);
    await resumeCell();
    return "jail";
  }
  adopt(r.token, r.user);
  return "ok";
}

/** Second step for a new-network login: password + recovery secret. */
export async function loginVerify(
  username: string,
  password: string,
  secret: string,
): Promise<"ok" | "wake" | "jail"> {
  const r = await api.loginVerify(username, password, secret);
  if ("wake" in r && r.wake) {
    setToken(r.token);
    await resumeWake();
    return "wake";
  }
  // A jailed account signing in from a new network goes to its Cell, as
  // login() sends it (Oct 2026 review — this mounted the whole app).
  if ("jail" in r && r.jail) {
    setToken(r.token);
    await resumeCell();
    return "jail";
  }
  adopt(r.token, r.user);
  return "ok";
}

export async function register(
  username: string,
  displayName: string,
  password: string,
  secret: string,
  inviteCode?: string,
  /** The sign-up form's "I'm 18+ and agree to the Terms" box — recorded on
   *  the account so the TermsGate doesn't ask a brand-new member twice. */
  acceptTerms = false,
): Promise<void> {
  const { token, user } = await api.register(username, displayName, password, secret, inviteCode, undefined, acceptTerms);
  adopt(token, user);
}

/** THE REROLL: from the Wake or the Cell, walk away and start again as a
 *  stranger. The shut-out session token IS the invite — the server accepts
 *  it in place of a code (see /api/register), so a death never costs anyone
 *  their seat at the table. Adopting the new session replaces the old token;
 *  the grave (or the cell) runs its course without you. */
export async function reroll(
  username: string,
  displayName: string,
  password: string,
  secret: string,
): Promise<void> {
  const proof = getToken();
  const { token, user } = await api.register(username, displayName, password, secret, undefined, proof ?? undefined);
  adopt(token, user);
}

/** THE PAPERWORK: something answered 403 `terms_required` — the Terms moved
 *  under this session. Re-read the self view (that route is exempt) so
 *  `termsVersion`/`termsCurrent` disagree and App mounts the gate. Deduped:
 *  a burst of failing calls asks once. */
let recheckInFlight: Promise<void> | null = null;
export function recheckTerms(): Promise<void> {
  if (!session.user || recheckInFlight) return recheckInFlight ?? Promise.resolve();
  recheckInFlight = api
    .me()
    .then(({ user }) => { session.user = user; })
    .catch(() => { /* offline or signed out meanwhile — nothing to show */ })
    .finally(() => { recheckInFlight = null; });
  return recheckInFlight;
}

/** Refresh the self view after a security change (e.g. setting the secret). */
export function refreshSelf(user: User): void {
  session.user = user;
  if (user.prefs) adoptPrefs(user.prefs);
}

export async function logout(): Promise<void> {
  // Drop this device's push subscription first — the API calls need the
  // token, and a signed-out device must not keep receiving this account's
  // DMs on its lock screen.
  await teardownPush().catch(() => {});
  try {
    await api.logout();
  } catch {
    // ignore network errors on logout
  }
  setToken(null);
  session.user = null;
  // the Survivorz show's files kept on this machine (survivorz/assetcache.ts) go with the session: they
  // are licensed, and the next person to sign in here may not be allowed them
  void dropAssetCache();
  // The Wake and the Cell render off their own flags, not `user` — leaving
  // them set made "sign out" on those screens appear to do nothing for up
  // to 20s until the next poll 401'd (Aug 2026 review).
  session.wake = null;
  session.cell = null;
}
