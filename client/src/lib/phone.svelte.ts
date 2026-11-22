// PHONE MODE (Josh, Sep 2026: "make sure the web ui on mobile phone browsers
// looks like it should be on a phone").
//
// One reactive fact — is this a phone? — read from the SAME media query
// string the CSS uses (PHONE_QUERY, defined in phone-views.ts), so the JS and
// the CSS can never disagree about which mode we're in. On a phone the app
// shows a bottom tab bar instead of the desktop rail, and a view a phone
// can't reach bounces you back to chat.
//
// LANDSCAPE COUNTS AS A PHONE (Josh, Sep 2026: "landscape should get the
// phone treatment"). The query was width-only, so turning a 390x844 phone on
// its side produced 844x390 — over the 760px line — and the phone UI switched
// off mid-session: the desktop rail reappeared on a 390px-tall screen and the
// tab bar vanished. The second clause of PHONE_QUERY catches that, and the
// tab bar lays itself out in a row when the screen is short so it costs 44px
// of a short screen instead of 66.
//
// THE PHONE OPENED UP (Josh, Sep 2026, round two): "i would like users to
// have access to the 2d casino, leadership boards, admin panel (only for
// admin ui login)" — plus the Market, because the casino runs on silver and
// silver comes from selling emoji at the Trader: a phone that can spin the
// Wheel but never convert the winnings is a slot machine with no cashier.
//
// WHAT IS STILL DESKTOP-ONLY, and why: the THREE-DIMENSIONAL worlds. The
// casino FLOOR, the Backrooms and the Escape Room are WebGL + pointer lock +
// WASD — there is no touch design that makes them work, and shipping a door
// that leads somewhere unplayable is worse than not showing the door. The
// Graveyard stays off because Josh didn't ask for it.
//
// `typing` tracks a focused text field: the on-screen keyboard is up, so the
// tab bar steps out of the way (it would otherwise sit between the composer
// and the keyboard, eating a row of the conversation).

// THE definition of "a phone" lives in phone-views.ts (rune-free, so the
// harness can assert the string). It is narrow OR short-and-touch — see the
// comment there for why landscape needs the second clause.
import { PHONE_QUERY } from "./phone-views";
export { PHONE_QUERY };

export const phone = $state<{ on: boolean; typing: boolean }>({
  on: typeof matchMedia === "function" ? matchMedia(PHONE_QUERY).matches : false,
  typing: false,
});

// The POLICY (which views a phone may show, and to whom) lives in the
// rune-free `phone-views.ts` so a plain Node harness can drive it. Re-exported
// here so every caller can keep importing phone mode from one place.
export { PHONE_VIEWS, PHONE_STAFF_VIEWS, phoneAllows } from "./phone-views";

let installed = false;
export function initPhoneMode(): () => void {
  if (installed || typeof matchMedia !== "function") return () => {};
  installed = true;
  const mq = matchMedia(PHONE_QUERY);
  const onChange = () => (phone.on = mq.matches);
  mq.addEventListener("change", onChange);
  const isField = (el: EventTarget | null): boolean =>
    el instanceof HTMLInputElement
      ? !["checkbox", "radio", "button", "submit", "file", "range"].includes(el.type)
      : el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable);
  const onFocusIn = (e: FocusEvent) => { if (isField(e.target)) phone.typing = true; };
  const recheck = () => {
    // Defer: focus hops field → field (the login form's Tab) shouldn't flash
    // the tab bar in and out between the two.
    setTimeout(() => { if (!isField(document.activeElement)) phone.typing = false; }, 60);
  };
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", recheck);
  // A focused field REMOVED from the DOM fires no focusout (saving an inline
  // message edit with Enter unmounts its textarea; Escape closes search /
  // settings with a field focused) — so `typing` stuck true and the tab bar
  // stayed hidden with no keyboard up (review finding). Re-check on the next
  // tap or key release as well; the check is one activeElement read.
  document.addEventListener("pointerup", recheck);
  document.addEventListener("keyup", recheck);
  return () => {
    mq.removeEventListener("change", onChange);
    document.removeEventListener("focusin", onFocusIn);
    document.removeEventListener("focusout", recheck);
    document.removeEventListener("pointerup", recheck);
    document.removeEventListener("keyup", recheck);
    installed = false;
  };
}
