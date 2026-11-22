// ONE pointer-lock policy, shared by both 3D games.
//
// THE RULE THIS FILE EXISTS TO ENFORCE: while you are playing, the mouse is
// OWNED BY THE PAGE. It does not roam the window, it cannot reach an edge, and
// it cannot leave and re-enter somewhere else. Everything below is in service
// of that one sentence.
//
// There is exactly one exception, and it is not a choice: the desktop shell's
// macOS webview (WKWebView) has no working Pointer Lock, so on THAT surface the
// game runs a cursor-following pseudo-lock instead. Nothing owns the cursor
// there, so it roams, hits edges, and re-enters as an enormous jump — which
// reads as the camera hurling itself around. It is the least-bad way to play
// where the real thing is impossible, and it is RUINOUS anywhere else.
//
// It used to be reachable anywhere else. `maybeFallback` engaged it on any Mac,
// including a Mac running an ordinary browser with a perfectly good Pointer Lock
// API — so a single refused request handed a real browser the broken camera.
// Production said so out loud: the errors table carried
//   "Pointer lock cannot be acquired immediately after the user has exited the
//    lock."  ×10
// which is Chromium's ~1.25s re-lock cooldown, and the old code treated that
// temporary refusal as "this machine cannot lock" (Josh's tester, Aug 2026:
// closing a recovered hard drive's reader and having the view spin). A refusal
// with a REASON is now answered by that reason — wait out the cooldown and ask
// again — never by giving up on owning the mouse.
//
// Kept DOM-free at module scope on purpose: `scripts/checks/test_pointerlock.mjs`
// imports this file directly and drives the decision table, so the thing under
// test is the shipped policy rather than a copy of it.

/** Chromium refuses a re-lock for ~1.25s after the user leaves one. Wait past
 *  that, not up to it. */
export const RELOCK_COOLDOWN_MS = 1400;

/** How many cooldown waits one acquire will sit through before conceding the
 *  click. Josh's law (Aug 2026): during live play the mouse never leaves the
 *  window — so "not yet" is answered by asking again, not once but until the
 *  reason changes. Bounded all the same: a browser that answers every ask
 *  with a cooldown forever is lying, and an infinite timer loop on a torn-
 *  down view would be its own bug (each game's cleanup can't cancel us). */
export const RELOCK_MAX_WAITS = 4;

/** A request that neither grants nor rejects is the dead-webview shape. Give it
 *  a beat before concluding anything. */
export const NO_GRANT_MS = 400;

/** In the pseudo-lock, a movement this large is the cursor teleporting (leaving
 *  the window and re-entering elsewhere), not a human flick. Drop it. */
export const FALLBACK_JUMP_PX = 250;

/** What the running client is, reduced to the three facts the policy needs. */
export interface LockEnv {
  /** Does this element expose requestPointerLock at all? */
  hasApi: boolean;
  /** A Mac, by user-agent. */
  isMac: boolean;
  /** Inside the Solace desktop shell (not a browser). */
  isShell: boolean;
}

/** May this client use the cursor-following pseudo-lock?
 *
 *  Only where a real lock genuinely cannot happen: no API at all, or the Mac
 *  desktop shell, whose webview advertises the API and then never grants it.
 *  A Mac BROWSER is a real browser and gets the real thing — that distinction
 *  is the whole bug fix, so keep the `isShell` half. */
export function fallbackAllowed(env: LockEnv): boolean {
  if (!env.hasApi) return true;
  return env.isMac && env.isShell;
}

/** How to answer a refused request. */
export type Refusal =
  /** The raw-movement flavour isn't supported — ask again without it. */
  | "retry-plain"
  /** Temporary: we asked too soon after the last exit. Wait, then ask again. */
  | "retry-later"
  /** The window isn't focused / has no activation. Only a real click fixes it. */
  | "needs-gesture"
  /** This surface cannot lock. */
  | "unsupported";

/** Read the browser's own explanation instead of guessing. Order matters: a RAW
 *  request refused for the cooldown is still a cooldown, not an unsupported
 *  flavour. */
export function refusalPlan(message: unknown, opts?: { raw?: boolean }): Refusal {
  const m = String(message ?? "").toLowerCase();
  if (
    m.includes("immediately after") ||
    m.includes("exited the lock") ||
    m.includes("too recently") ||
    m.includes("user has exited")
  ) {
    return "retry-later";
  }
  if (m.includes("have focus") || m.includes("not focused") || m.includes("gesture") || m.includes("activation")) {
    return "needs-gesture";
  }
  if (opts?.raw) return "retry-plain";
  return "unsupported";
}

/** Is this mouse movement the cursor teleporting rather than a hand moving?
 *  Only meaningful in the pseudo-lock — under a real lock nothing teleports. */
export function isTeleport(dx: number, dy: number): boolean {
  return Math.abs(dx) > FALLBACK_JUMP_PX || Math.abs(dy) > FALLBACK_JUMP_PX;
}

type RawRequest = (o?: { unadjustedMovement: boolean }) => Promise<void> | undefined;

export interface AcquireOpts {
  /** Ask for unadjusted (device-native) movement — the mouse-accuracy setting. */
  raw: boolean;
  env: LockEnv;
  /** No real lock is possible here: run the pseudo-lock. */
  onFallback: () => void;
  /** We are staying unlocked; the user must click again. Reason is for logs. */
  onUnlocked?: (why: Refusal) => void;
}

/** Ask for the pointer, and keep asking as long as the refusal says it's worth
 *  asking. Never leaves the caller in the pseudo-lock unless `fallbackAllowed`.
 *
 *  Callers must treat this as fire-and-forget: the grant arrives as a
 *  `pointerlockchange` event, exactly as before. */
export function acquirePointerLock(canvas: HTMLElement, opts: AcquireOpts): void {
  const el = canvas as HTMLElement & { requestPointerLock?: RawRequest };
  if (typeof el.requestPointerLock !== "function") {
    if (fallbackAllowed(opts.env)) opts.onFallback();
    else opts.onUnlocked?.("unsupported");
    return;
  }
  const doc = canvas.ownerDocument;
  let settled = false;
  let waiting = false;
  let waits = 0; // cooldown retries spent — see RELOCK_MAX_WAITS
  const locked = (): boolean => doc.pointerLockElement === canvas;

  const giveUp = (why: Refusal): void => {
    if (settled) return;
    settled = true;
    // The pseudo-lock is a LAST resort, not a fallback for "not yet".
    if (fallbackAllowed(opts.env)) opts.onFallback();
    else opts.onUnlocked?.(why);
  };

  const ask = (raw: boolean): void => {
    if (settled || locked()) return;
    let p: Promise<void> | undefined;
    try {
      p = (el.requestPointerLock as RawRequest).call(
        el,
        raw ? { unadjustedMovement: true } : undefined,
      );
    } catch {
      p = undefined;
    }
    // Catching here is also what stops these refusals reaching the global
    // unhandled-rejection reporter — they were filling the errors table.
    p?.catch?.((err: unknown) => {
      if (settled || locked()) return;
      const plan = refusalPlan((err as { message?: unknown })?.message ?? err, { raw });
      if (plan === "retry-plain" && raw) {
        ask(false);
        return;
      }
      if (plan === "retry-later" && waits < RELOCK_MAX_WAITS) {
        // "Not yet", not "never" — and not once, either: as long as the
        // browser keeps saying "too soon", keep waiting it out (bounded).
        // One-retry-then-quit left the player a live view with a roaming
        // cursor whenever two cooldowns stacked, which the mouse-stays-in-
        // the-window law forbids.
        waits++;
        waiting = true;
        setTimeout(() => {
          waiting = false;
          ask(opts.raw);
        }, RELOCK_COOLDOWN_MS);
        return;
      }
      giveUp(plan);
    });
    if (!p) {
      // Older signature: no promise, so failure arrives as a pointerlockerror
      // event or as nothing at all. The timer below covers both.
      const onErr = (): void => {
        doc.removeEventListener("pointerlockerror", onErr);
        if (!settled && !locked()) giveUp("unsupported");
      };
      doc.addEventListener("pointerlockerror", onErr, { once: true });
    }
    setTimeout(() => {
      if (settled || waiting || locked()) return;
      // Granted-nothing, refused-nothing: the dead-webview shape.
      giveUp("unsupported");
    }, NO_GRANT_MS);
  };

  ask(opts.raw);
}
