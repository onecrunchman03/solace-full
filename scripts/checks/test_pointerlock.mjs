// THE MOUSE STAYS IN THE WINDOW.
//
// While you are playing either 3D game, the pointer is owned by the page: it
// cannot roam, cannot reach a screen edge, cannot leave and re-enter somewhere
// else. This harness is the standing proof of that, because the one way to
// break it is subtle — a temporary refusal being mistaken for a permanent one
// and dropping the player into the cursor-following pseudo-lock, where nothing
// owns the mouse and the view hurls itself around.
//
//   node scripts/checks/test_pointerlock.mjs
//
// Two halves:
//   1. the DECISION TABLE, driven against the shipped policy module (Node 24
//      strips the types on import, so this tests lib/pointerlock.ts itself);
//   2. a SOURCE SWEEP over both games, proving neither one can reach the
//      pseudo-lock except through that policy, and that every screen which
//      releases the pointer has a route back to a real one.
//
// The bug this was written for: closing a recovered hard drive's reader called
// requestPointerLock() a few ms after the click that released the lock.
// Chromium refuses that for ~1.25s ("Pointer lock cannot be acquired
// immediately after the user has exited the lock" — 10 of them reached
// production's errors table), the bare call left the rejection unhandled, and
// on a Mac the refusal engaged the pseudo-lock. Result: a live view with a
// roaming cursor.


import { readFileSync } from "node:fs";
import {
  RELOCK_COOLDOWN_MS,
  RELOCK_MAX_WAITS,
  NO_GRANT_MS,
  FALLBACK_JUMP_PX,
  fallbackAllowed,
  refusalPlan,
  isTeleport,
  acquirePointerLock,
} from "../../client/src/lib/pointerlock.ts";

let pass = 0;
const fails = [];
const ok = (cond, label) => {
  if (cond) pass++;
  else fails.push(label);
};

// ---- 1. who may run without owning the mouse -------------------------------
// Exactly one surface may: the Mac desktop shell, whose webview cannot lock.
const WINDOWS_BROWSER = { hasApi: true, isMac: false, isShell: false };
const WINDOWS_SHELL = { hasApi: true, isMac: false, isShell: true };
const MAC_BROWSER = { hasApi: true, isMac: true, isShell: false };
const MAC_SHELL = { hasApi: true, isMac: true, isShell: true };
const DEAD_WEBVIEW = { hasApi: false, isMac: true, isShell: true };
const NO_API_BROWSER = { hasApi: false, isMac: false, isShell: false };

ok(!fallbackAllowed(WINDOWS_BROWSER), "a Windows browser never runs the pseudo-lock");
ok(!fallbackAllowed(WINDOWS_SHELL), "the Windows shell never runs the pseudo-lock");
ok(
  !fallbackAllowed(MAC_BROWSER),
  "A MAC BROWSER NEVER RUNS THE PSEUDO-LOCK — this is the regression that shipped",
);
ok(fallbackAllowed(MAC_SHELL), "the Mac shell may, its webview cannot lock");
ok(fallbackAllowed(DEAD_WEBVIEW), "no API at all may");
ok(fallbackAllowed(NO_API_BROWSER), "no API at all may, browser or not");
// The dangerous direction: of the four surfaces that HAVE a working lock, none
// may opt out of owning the mouse.
ok(
  [WINDOWS_BROWSER, WINDOWS_SHELL, MAC_BROWSER, MAC_SHELL].filter((e) => fallbackAllowed(e)).length === 1,
  "exactly one API-capable surface may fall back, and it is the Mac shell",
);

// ---- 2. a refusal is answered by its reason --------------------------------
ok(
  refusalPlan("Pointer lock cannot be acquired immediately after the user has exited the lock.") ===
    "retry-later",
  "Chromium's cooldown message means WAIT, not give up (the shipped bug)",
);
ok(refusalPlan("The user has exited the lock before this request was handled") === "retry-later",
  "the other cooldown phrasing also means wait");
ok(refusalPlan("Pointer lock requires the window to have focus.") === "needs-gesture",
  "an unfocused window needs a real click, not a retry loop");
ok(refusalPlan("A user gesture is required") === "needs-gesture", "gesture wording recognised");
ok(refusalPlan("unadjustedMovement is not supported", { raw: true }) === "retry-plain",
  "raw-movement refusal falls back to an ordinary lock");
ok(refusalPlan("something else entirely") === "unsupported", "an unknown refusal is terminal");
ok(refusalPlan("") === "unsupported", "an empty refusal is terminal");
ok(refusalPlan(undefined) === "unsupported", "a missing refusal is terminal");
// Precedence: a RAW request refused for the cooldown is still a cooldown. Get
// this backwards and the cooldown case silently becomes a plain retry, which is
// refused for the same reason, and the player ends up unlocked anyway.
ok(
  refusalPlan("Pointer lock cannot be acquired immediately after the user has exited the lock.", {
    raw: true,
  }) === "retry-later",
  "cooldown outranks the raw-movement retry",
);

// ---- 3. the cooldown is actually waited out --------------------------------
ok(RELOCK_COOLDOWN_MS > 1250, "the wait clears Chromium's ~1.25s lockout");
ok(NO_GRANT_MS < RELOCK_COOLDOWN_MS, "the no-grant probe fires before the retry, not after");

// ---- 4. the teleport guard -------------------------------------------------
// Only meaningful inside the pseudo-lock, where the cursor can leave the
// window; a re-entry on the far side is one enormous "movement".
ok(isTeleport(FALLBACK_JUMP_PX + 1, 0), "a jump wider than the guard is dropped");
ok(isTeleport(0, -(FALLBACK_JUMP_PX + 1)), "vertical teleports too, and negatives");
ok(!isTeleport(40, 30), "an ordinary flick is not dropped");
ok(!isTeleport(FALLBACK_JUMP_PX, FALLBACK_JUMP_PX), "the guard is exclusive at the boundary");

// ---- 5. drive the real acquisition against a fake element -------------------
// A tiny stand-in for the DOM: enough to prove the retry actually happens and
// that a refused lock does NOT hand a capable browser the pseudo-lock.
function fakeCanvas({ refuseWith = [], grantOn = null, noPromise = false } = {}) {
  const listeners = new Map();
  const doc = {
    pointerLockElement: null,
    addEventListener: (t, fn) => listeners.set(t, fn),
    removeEventListener: (t) => listeners.delete(t),
  };
  const el = {
    ownerDocument: doc,
    calls: [],
    fire: (t) => listeners.get(t)?.(),
    requestPointerLock(opts) {
      const n = el.calls.length;
      el.calls.push({ raw: !!opts?.unadjustedMovement });
      if (grantOn !== null && n >= grantOn) {
        doc.pointerLockElement = el;
        return noPromise ? undefined : Promise.resolve();
      }
      const why = refuseWith[n] ?? refuseWith[refuseWith.length - 1] ?? "nope";
      return noPromise ? undefined : Promise.reject(new Error(why));
    },
  };
  return el;
}
const settle = (ms) => new Promise((r) => setTimeout(r, ms));

// (a) The shipped bug, end to end: a Mac BROWSER closes the drive reader, the
//     re-lock is refused for the cooldown, and it must NOT end up roaming.
{
  const el = fakeCanvas({
    refuseWith: ["Pointer lock cannot be acquired immediately after the user has exited the lock."],
    grantOn: 1, // the retry, after the cooldown, succeeds
  });
  let fellBack = false;
  let unlocked = null;
  acquirePointerLock(el, {
    raw: false,
    env: MAC_BROWSER,
    onFallback: () => (fellBack = true),
    onUnlocked: (why) => (unlocked = why),
  });
  await settle(NO_GRANT_MS + 60);
  ok(!fellBack, "mid-cooldown: the no-grant probe does not fire while a retry is pending");
  ok(el.calls.length === 1, "mid-cooldown: exactly one request so far");
  await settle(RELOCK_COOLDOWN_MS + 200);
  ok(el.calls.length === 2, "the refused request IS retried after the cooldown");
  ok(el.ownerDocument.pointerLockElement === el, "and the retry takes a REAL lock");
  ok(!fellBack, "a Mac browser never reaches the pseudo-lock, even via a refusal");
  ok(unlocked === null, "…and is not left unlocked either");
}

// (b) The same refusal in the Mac SHELL: retried too — through the FULL wait
//     budget — and only when the budget is spent is the pseudo-lock the
//     legitimate answer there.
{
  const el = fakeCanvas({ refuseWith: ["...user has exited the lock..."] });
  let fellBack = false;
  acquirePointerLock(el, {
    raw: false,
    env: MAC_SHELL,
    onFallback: () => (fellBack = true),
  });
  await settle(RELOCK_COOLDOWN_MS + 400);
  ok(el.calls.length === 2 && !fellBack, "the shell is still retrying after one cooldown — no early surrender");
  await settle(RELOCK_COOLDOWN_MS * RELOCK_MAX_WAITS + 600);
  ok(el.calls.length === RELOCK_MAX_WAITS + 1, "every budgeted wait is spent before concluding");
  ok(fellBack, "a shell that STILL cannot lock gets the pseudo-lock");
}

// (b2) THE MOUSE STAYS IN THE WINDOW (Josh's law, Aug 2026): cooldown refusals
//      that STACK are still "not yet", not "never". Two in a row, then a
//      grant — the lock must be taken, with no unlocked gap surrendered.
{
  const el = fakeCanvas({
    refuseWith: [
      "Pointer lock cannot be acquired immediately after the user has exited the lock.",
      "The user has exited the lock too recently.",
    ],
    grantOn: 2,
  });
  let fellBack = false;
  let unlocked = null;
  acquirePointerLock(el, {
    raw: false,
    env: WINDOWS_BROWSER,
    onFallback: () => (fellBack = true),
    onUnlocked: (w) => (unlocked = w),
  });
  await settle(RELOCK_COOLDOWN_MS * 2 + 500);
  ok(el.calls.length === 3, "two stacked cooldowns → three asks (one-retry-then-quit is the outlawed shape)");
  ok(el.ownerDocument.pointerLockElement === el, "…and the third ask takes the REAL lock");
  ok(!fellBack && unlocked === null, "no fallback, no surrendered-unlocked gap on the way");
}

// (c) A terminal refusal on Windows: stay unlocked and say so. One more click
//     beats an unplayable camera.
{
  const el = fakeCanvas({ refuseWith: ["some other failure"] });
  let fellBack = false;
  let why = null;
  acquirePointerLock(el, {
    raw: false,
    env: WINDOWS_BROWSER,
    onFallback: () => (fellBack = true),
    onUnlocked: (w) => (why = w),
  });
  await settle(120);
  ok(!fellBack, "Windows never runs the pseudo-lock on a refusal");
  ok(why === "unsupported", "the caller is told it is staying unlocked");
}

// (d) Raw movement unsupported → plain lock, still real, no roaming.
{
  const el = fakeCanvas({ refuseWith: ["unadjustedMovement is not supported"], grantOn: 1 });
  let fellBack = false;
  acquirePointerLock(el, { raw: true, env: WINDOWS_BROWSER, onFallback: () => (fellBack = true) });
  await settle(120);
  ok(el.calls.length === 2, "raw refused → asked again");
  ok(el.calls[0].raw === true && el.calls[1].raw === false, "…and the second ask is the plain one");
  ok(el.ownerDocument.pointerLockElement === el, "a real lock is still taken");
  ok(!fellBack, "no roaming cursor on the raw-movement path");
}

// (e) The dead webview: advertises the API, grants nothing, rejects nothing.
{
  const el = fakeCanvas({ noPromise: true });
  let fellBack = false;
  acquirePointerLock(el, { raw: false, env: MAC_SHELL, onFallback: () => (fellBack = true) });
  await settle(NO_GRANT_MS + 150);
  ok(fellBack, "a silent no-grant in the Mac shell falls back after the probe");
}
{
  const el = fakeCanvas({ noPromise: true });
  let fellBack = false;
  let why = null;
  acquirePointerLock(el, {
    raw: false,
    env: WINDOWS_BROWSER,
    onFallback: () => (fellBack = true),
    onUnlocked: (w) => (why = w),
  });
  await settle(NO_GRANT_MS + 150);
  ok(!fellBack, "the same silence on Windows does NOT hand over the cursor");
  ok(why === "unsupported", "it reports staying unlocked instead");
}

// (f) No API whatsoever — the only case that needs no probing at all.
{
  const el = { ownerDocument: { pointerLockElement: null, addEventListener() {}, removeEventListener() {} } };
  let fellBack = false;
  acquirePointerLock(el, { raw: false, env: DEAD_WEBVIEW, onFallback: () => (fellBack = true) });
  ok(fellBack, "no requestPointerLock at all → pseudo-lock immediately");
}
{
  const el = { ownerDocument: { pointerLockElement: null, addEventListener() {}, removeEventListener() {} } };
  let fellBack = false;
  let why = null;
  acquirePointerLock(el, {
    raw: false,
    env: NO_API_BROWSER,
    onFallback: () => (fellBack = true),
    onUnlocked: (w) => (why = w),
  });
  ok(fellBack, "a browser with no API has nothing better available");
  ok(why === null, "…so it is not also reported as unlocked");
}

// (g) A grant that lands DURING the cooldown wait must not be undone by the
//     retry — asking again while already locked would release it.
{
  const el = fakeCanvas({ refuseWith: ["user has exited the lock"] });
  acquirePointerLock(el, { raw: false, env: WINDOWS_BROWSER, onFallback: () => {}, onUnlocked: () => {} });
  await settle(60);
  el.ownerDocument.pointerLockElement = el; // a lock arrives by another route
  await settle(RELOCK_COOLDOWN_MS + 200);
  ok(el.calls.length === 1, "no redundant request once the pointer is already ours");
}

// ---- 6. source sweep: no second implementation ------------------------------
const games = {
  "client/src/backrooms/BackroomsGame.svelte": readFileSync(
    "client/src/backrooms/BackroomsGame.svelte", "utf8"),
  "client/src/casino/CasinoGame.svelte": readFileSync(
    "client/src/casino/CasinoGame.svelte", "utf8"),
};
for (const [path, src] of Object.entries(games)) {
  const name = path.split("/").pop();
  // The pseudo-lock has exactly one trigger per game — the policy's callback —
  // plus the deliberate "resume from a fallback pause" click. Any OTHER caller
  // is a second implementation of the decision, which is how this broke.
  const engages = [...src.matchAll(/engageFallback\b/g)].length;
  ok(engages <= 4, `${name}: engageFallback has few call sites (${engages})`);
  ok(
    !/requestPointerLock\s*\(/.test(src.replace(/typeof\s+\w+(\.\w+)*\.requestPointerLock/g, "")),
    `${name}: never calls requestPointerLock directly — it goes through the policy`,
  );
  ok(/acquirePointerLock\(/.test(src), `${name}: uses the shared policy`);
  ok(
    !/\|\|\s*isMac\s*\)\s*engageFallback/.test(src),
    `${name}: the old "any Mac falls back" gate is gone`,
  );
  // Every screen that releases the pointer must have a route back to one.
  ok(/function unlockPointer|unlockPointer\(\)/.test(src) || name === "CasinoGame.svelte",
    `${name}: releases the pointer through one helper`);
}
// The backrooms reader — the exact screen Josh's tester lost the mouse on —
// must come back through the policy, not a bare request.
{
  const src = games["client/src/backrooms/BackroomsGame.svelte"];
  ok(/reading = null;\s*\n\s*resume\(\);/.test(src), "closing the drive reader calls resume()");
  ok(/grabPointerFn\?\.\(\)/.test(src), "…and resume() asks through the shared policy");
  ok(
    /reading = drive;\s*\n\s*unlockPointer\(\);/.test(src),
    "…having released the pointer when the drive was picked up",
  );
}

// ---- report -----------------------------------------------------------------
console.log(`\npointer lock: ${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log("  FAIL  " + f);
process.exit(fails.length ? 1 : 0);
