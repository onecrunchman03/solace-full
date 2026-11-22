// WHICH VIEWS A PHONE MAY SHOW — the policy half of phone mode.
//
// Deliberately rune-free and in its OWN module: `phone.svelte.ts` holds the
// reactive fact (is this a phone-width screen?) and therefore `$state`, which
// only the Svelte compiler understands. The rules below are pure data plus one
// pure function, so a plain Node harness can drive them
// (scripts/checks/test_phone_views.mjs) instead of the gate being something we
// merely believe. phone.svelte.ts re-exports all three, so callers import from
// either and see the same answer.
//
// The app's `View` union (lib/nav.svelte.ts) is the full list these names are
// drawn from; anything absent from BOTH sets below is desktop-only.

/**
 * WHAT COUNTS AS A PHONE — the one definition, read by the CSS (every phone
 * media query in the app), by `phone.svelte.ts` (the reactive fact) and by
 * `prefs.svelte.ts` (the 16px rem base). It lives here, in the rune-free
 * module, so a plain Node harness can assert the string itself.
 *
 * Two clauses, because a phone is not always narrow:
 *
 *   · `max-width: 760px` — a phone held upright, the original rule.
 *   · `max-height: 500px and pointer: coarse` — A PHONE ON ITS SIDE
 *     (Josh, Sep 2026: "landscape should get the phone treatment"). Rotating
 *     a 390x844 phone gives 844x390, which is WIDER than 760, so the whole
 *     phone UI used to switch off mid-turn: the desktop rail came back on a
 *     390px-tall screen and the tab bar vanished.
 *
 * The height threshold is 500 because it has to sit above every phone in
 * landscape (the largest is about 440 tall) and below every tablet (an iPad
 * mini is 768, an unfolded Fold 673) — those genuinely want the wide layout.
 *
 * `pointer: coarse` is what keeps a short DESKTOP window out of phone mode.
 * It reads the PRIMARY pointing device, so a touchscreen laptop driven by its
 * trackpad still says "fine" and stays on the desktop UI; `any-pointer` would
 * not. NB this is the opposite of the `hover: none` trap documented in
 * CLAUDE.md: there, a desktop at phone width failing to match was a nuisance
 * while testing — here it is precisely the behaviour we want.
 */
export const PHONE_QUERY = "(max-width: 760px), (max-height: 500px) and (pointer: coarse)";

/** Views a phone can show for ANYONE. Everything else is desktop-only. */
// "pandora" and "portal" are here because both are READING surfaces, not
// games: the box has its own 760px layout, and the Stone card is reachable
// from the phone-allowed Profile — without them, saying the phrase bounced
// the speaker straight back to chat (Sep 2026 review).
//
// "rumble" (the casino hub + the ten 2D games), "market" and "leaderboards"
// joined in Sep 2026 — see phone.svelte.ts's header for why, including why
// the Market had to come along with the casino.
export const PHONE_VIEWS: ReadonlySet<string> = new Set([
  "chat", "dms", "profile", "feedback", "howto", "pandora", "portal",
  "rumble", "market", "leaderboards",
  // the Survivorz page: on a phone it offers the YouTube channel (the live 3D broadcast needs a computer)
  "survivorz",
]);

/** Views a phone can show only to STAFF. The Admin Panel is the whole set —
 *  Josh: "admin panel (only for admin ui login)".
 *
 *  THIS IS NOT THE SECURITY BOUNDARY and must never be treated as one. Every
 *  /api/admin route is admin- or mod-level server-side and has been since the
 *  panel shipped; this exists so a member is not shown a door that answers
 *  403, and so a moderator demoted mid-session is carried back out of it. */
export const PHONE_STAFF_VIEWS: ReadonlySet<string> = new Set(["adminpanel"]);

/** Can this person reach this view on a phone?
 *
 *  ONE rule, read by the bounce effect AND by the tab bar / You sheet, so a
 *  tab can never offer a destination the bounce will immediately take away. */
export function phoneAllows(
  view: string,
  user: { isAdmin?: boolean; role?: string } | null | undefined,
): boolean {
  if (PHONE_VIEWS.has(view)) return true;
  if (!PHONE_STAFF_VIEWS.has(view)) return false;
  return !!user && (user.isAdmin === true || user.role === "moderator");
}
