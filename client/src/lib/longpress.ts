// PRESS AND HOLD — the phone's hover.
//
// On a desktop a message's actions appear on hover. A phone has no hover, and
// the first phone cut hung a ⋯ pill on the corner of every message instead —
// a row of little boxes down the whole conversation, each one stealing 36px
// of text width. Every phone messenger answers this the same way: press and
// hold the message, and a sheet of actions rises from the bottom. This is
// that gesture as a Svelte action.
//
// Touch only (`pointerType === "touch"`): a mouse has hover and a right-click
// of its own, and a held mouse button is a drag-select, not a request.
//
//   <div use:longpress={{ when: () => phone.on && !editing, hold: () => (open = true) }}>
//
// `when` gates ARMING, not just the effect — a hold that would open nothing
// must also suppress nothing: the first cut armed on every touch and only
// checked the condition when the timer fired, so on Android a long press in
// the inline-edit textarea (to paste) had its paste menu eaten, and on a
// tablet (touch, wider than a phone — the ⋯-pill path) a slow touch swallowed
// the release click and, via the stale flag, the next mouse right-click.
// Presses that start inside a form field, or inside the sheet the hold
// opened, never arm either.
//
// The hold fires after HOLD_MS with the finger within SLOP px of where it
// landed — a scroll is a moving finger and must never open a sheet. The
// browser's own long-press behaviours are suppressed on the element only
// while a hold is armed or just fired: `contextmenu` (Android's long-press
// menu) and, via the `-webkit-touch-callout: none` the caller sets in CSS,
// iOS's copy callout. The CLICK that follows a completed hold is swallowed
// too — without that, lifting the finger after the sheet opened would also
// tap whatever the finger was over (an avatar → a profile page under the
// sheet). The flag lives for exactly one gesture.

const HOLD_MS = 420;
const SLOP = 10;
/** Presses starting here are the browser's business (paste menus, text
 *  selection) or the sheet's own (a slow tap on one of its buttons). */
const NEVER_ARM = "input, textarea, [contenteditable], .actions, .act-scrim";

export interface LongpressOpts {
  /** May a hold start right now? Read at pointerdown. */
  when: () => boolean;
  /** The hold completed. */
  hold: () => void;
}

export function longpress(node: HTMLElement, opts: LongpressOpts): { update(next: LongpressOpts): void; destroy(): void } {
  let o = opts;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let x0 = 0;
  let y0 = 0;
  let fired = false;

  const cancel = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const down = (e: PointerEvent): void => {
    fired = false;
    if (e.pointerType !== "touch" || !e.isPrimary) return;
    if (!o.when()) return;
    if (e.target instanceof Element && e.target.closest(NEVER_ARM)) return;
    x0 = e.clientX;
    y0 = e.clientY;
    cancel();
    timer = setTimeout(() => {
      timer = null;
      fired = true;
      o.hold();
    }, HOLD_MS);
  };
  const move = (e: PointerEvent): void => {
    if (timer === null) return;
    if (Math.abs(e.clientX - x0) > SLOP || Math.abs(e.clientY - y0) > SLOP) cancel();
  };
  const up = (): void => cancel();
  // Android raises contextmenu on a long touch; that is the browser's menu,
  // and the sheet is ours. A mouse right-click carries no armed hold and is
  // left alone. Either way the flag is spent here — Android dispatches no
  // click after a long press, so this is that gesture's last event.
  const menu = (e: MouseEvent): void => {
    if (timer === null && !fired) return;
    e.preventDefault();
    cancel();
    fired = false;
  };
  const click = (e: MouseEvent): void => {
    if (!fired) return;
    fired = false;
    e.preventDefault();
    e.stopPropagation();
  };

  node.addEventListener("pointerdown", down);
  node.addEventListener("pointermove", move);
  node.addEventListener("pointerup", up);
  node.addEventListener("pointercancel", up);
  node.addEventListener("pointerleave", up);
  node.addEventListener("contextmenu", menu);
  node.addEventListener("click", click, true);

  return {
    update(next: LongpressOpts) {
      o = next;
    },
    destroy() {
      cancel();
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", up);
      node.removeEventListener("pointerleave", up);
      node.removeEventListener("contextmenu", menu);
      node.removeEventListener("click", click, true);
    },
  };
}
