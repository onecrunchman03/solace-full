// User status: online / away / busy. Two inputs combine into the effective
// status everyone else sees:
//   - the MANUAL pick (persisted in prefs, follows the account) — away/busy
//     stick until changed;
//   - AUTO-AWAY — with the manual pick on "online", no input for AWAY_AFTER_MS
//     shows you as away until you touch anything.
// The effective status rides the app socket as a `status` frame (announced on
// change + on every socket open); the server broadcasts it and clears it with
// presence. Busy also silences YOUR notification pings (see notify.svelte.ts).
//
// The idle clock doubles as the forgotten-browser guard: the timestamp is
// mirrored to localStorage, and session.svelte.ts logs out browser sessions
// idle past 24h (the desktop shell is exempt — tray-resident by design).

import { api } from "./api";

export type StatusMode = "online" | "away" | "busy";

const AWAY_AFTER_MS = 10 * 60_000;
export const LAST_ACTIVE_KEY = "solace_last_active";

export const status = $state<{
  /** userId → away/busy (absent = online-if-connected). */
  map: Record<number, "away" | "busy">;
  /** My manual pick (prefs-backed). */
  manual: StatusMode;
  /** True while auto-away holds (manual is "online" but input went quiet). */
  autoAway: boolean;
}>({ map: {}, manual: "online", autoAway: false });

export function effectiveMine(): StatusMode {
  return status.manual !== "online" ? status.manual : status.autoAway ? "away" : "online";
}

export function statusOf(userId: number): "away" | "busy" | null {
  return status.map[userId] ?? null;
}

// The socket sender is injected by chat.svelte.ts (avoids a module cycle).
let announceFn: (s: StatusMode) => void = () => {};
let lastAnnounced: StatusMode | null = null;

export function setStatusSender(fn: (s: StatusMode) => void): void {
  announceFn = fn;
  lastAnnounced = null;
}

/** Announce the current effective status if it changed (or force on open). */
export function announceStatus(force = false): void {
  const s = effectiveMine();
  if (!force && s === lastAnnounced) return;
  lastAnnounced = s;
  announceFn(s);
}

/** The user picked a status. Persists to prefs; picking online also wakes
 *  the idle clock (choosing it IS activity). */
export function setManualStatus(mode: StatusMode): void {
  status.manual = mode;
  if (mode === "online") bumpActivity();
  void api.updatePrefs({ status: mode === "online" ? null : mode }).catch(() => {});
  announceStatus();
}

/** Adopt the account's stored pick at login (server wins). */
export function adoptStatusPrefs(stored: string | undefined): void {
  status.manual = stored === "away" || stored === "busy" ? stored : "online";
}

// ---- Server frames ----------------------------------------------------------

export function applyStatus(userId: number, s: string): void {
  if (s === "away" || s === "busy") {
    status.map = { ...status.map, [userId]: s };
  } else {
    const { [userId]: _, ...rest } = status.map;
    status.map = rest;
  }
}

export function applyStatusSnapshot(map: Record<string, string>): void {
  const next: Record<number, "away" | "busy"> = {};
  for (const [uid, s] of Object.entries(map ?? {})) {
    if (s === "away" || s === "busy") next[Number(uid)] = s;
  }
  status.map = next;
}

/** Presence said this user went offline — no status either. */
export function clearStatusFor(userId: number): void {
  applyStatus(userId, "online");
}

// ---- Idle tracking ----------------------------------------------------------

let lastActive = Date.now();
let lastBump = 0;
let ticker: ReturnType<typeof setInterval> | null = null;

/** When the user last touched the app (pointer/key/touch/wheel). The voice
 *  AFK timer reads this so an active chatter isn't dropped for being quiet. */
export function lastInputAt(): number {
  return lastActive;
}

function bumpActivity(): void {
  const now = Date.now();
  lastActive = now;
  // Throttled mirror for the 24h forgotten-browser guard (multi-tab shared).
  if (now - lastBump > 15_000) {
    lastBump = now;
    try {
      localStorage.setItem(LAST_ACTIVE_KEY, String(now));
    } catch {
      /* storage blocked */
    }
  }
  if (status.autoAway) {
    status.autoAway = false;
    announceStatus();
  }
}

/** Injected engagement probe: voice activity (streaming a screen, camera on,
 *  or recently speaking) counts as "interacting with the app", so someone
 *  running a movie night without touching the window never shows as away. */
let engagedProbe: () => boolean = () => false;
export function setEngagedProbe(fn: () => boolean): void {
  engagedProbe = fn;
}

/** Wire the input listeners + the away ticker. Called once at app boot. */
export function initStatusTracking(): void {
  if (ticker) return;
  try {
    localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
  } catch {}
  const opts = { passive: true } as AddEventListenerOptions;
  window.addEventListener("pointerdown", bumpActivity, opts);
  window.addEventListener("keydown", bumpActivity, opts);
  window.addEventListener("touchstart", bumpActivity, opts);
  window.addEventListener("wheel", bumpActivity, opts);
  let lastMove = 0;
  window.addEventListener(
    "pointermove",
    () => {
      const now = Date.now();
      if (now - lastMove > 5_000) {
        lastMove = now;
        bumpActivity();
      }
    },
    opts,
  );
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") bumpActivity();
  });
  ticker = setInterval(() => {
    if (engagedProbe()) bumpActivity(); // voice/stream engagement = active
    const idle = Date.now() - lastActive > AWAY_AFTER_MS;
    if (idle !== status.autoAway) {
      status.autoAway = idle;
      announceStatus();
    }
  }, 30_000);
}

export function resetStatus(): void {
  status.map = {};
  status.manual = "online";
  status.autoAway = false;
  lastAnnounced = null;
}
