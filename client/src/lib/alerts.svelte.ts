// THE ALERT LEDGER — "did something happen while I was away?"
//
// Native notifications are transient by nature: they fire once, and if you
// were asleep, in a game, or on another machine, the fact is simply gone.
// Josh's ask: a red dot that PERSISTS until you actually go and look. So
// every notify-worthy event also files an alert here, and the dot lives until
// the matching surface is opened.
//
// Two visible outputs:
//   1. red dots on the rail (Chat / Direct Messages), per section;
//   2. the APP ICON badge via the Badging API — the taskbar/dock count that
//      installed PWAs and the desktop shell show. Unsupported browsers just
//      no-op.
//
// Storage is localStorage (per device, like the notification opt-in): what
// you have "seen" is a property of the machine you saw it on. Alerts are
// capped and pruned so the key can never grow without bound.

import { shell, shellHasAlerts } from "./platform";
import { session } from "./session.svelte";

const KEY = "solace_alerts";
const MAX = 60;

export type AlertKind = "mention" | "dm" | "event";

export interface Alert {
  id: string;
  kind: AlertKind;
  title: string;
  body: string;
  at: number;
  /** Which channel / conversation / event it points at (for acking). */
  ref: number | null;
  /** WHOSE alert this is. Alert bodies carry message excerpts, so a shared
   *  machine must never show one account's alerts to the next login. */
  owner: number;
}

function load(): Alert[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as Alert[];
    if (!Array.isArray(list)) return [];
    return list
      .filter(
        (a) =>
          a && typeof a.id === "string" && typeof a.at === "number" &&
          typeof a.owner === "number" &&
          (a.kind === "mention" || a.kind === "dm" || a.kind === "event"),
      )
      .slice(-MAX);
  } catch {
    return [];
  }
}

export const alerts = $state<{ list: Alert[] }>({ list: load() });

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(alerts.list.slice(-MAX)));
  } catch {
    /* private mode — dots still work for this session */
  }
  syncAppBadge();
}

/** The taskbar/dock number. Chromium exposes the Badging API on installed
 *  PWAs; the desktop shell (v0.3.2+) gets it through its own command, since a
 *  webview has no icon of its own. Both are guarded — a plain tab just shows
 *  the rail dots. */
function syncAppBadge(): void {
  const n = alerts.list.length;
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (n > 0) void nav.setAppBadge?.(n).catch(() => {});
    else void nav.clearAppBadge?.().catch(() => {});
  } catch {
    /* unsupported — the rail dots carry it */
  }
  if (shellHasAlerts) shell.setBadge(n);
}

/** File an alert. Same (kind, ref) collapses — ten messages in one thread is
 *  one dot, not ten, and the newest wins. */
export function fileAlert(a: Omit<Alert, "id" | "at" | "owner">): void {
  const owner = session.user?.id;
  if (owner == null) return; // no session, no alert to own
  const id = `${a.kind}:${a.ref ?? "x"}`;
  alerts.list = [...alerts.list.filter((x) => x.id !== id), { ...a, id, at: Date.now(), owner }].slice(-MAX);
  persist();
}

export const alertCount = (kind: AlertKind): number => alerts.list.filter((a) => a.kind === kind).length;

/** "I looked at it." Pass a ref to clear one thread/channel, or omit to clear
 *  the whole kind (opening the section counts as acknowledging it). */
export function ackAlerts(kind: AlertKind, ref?: number | null): void {
  const before = alerts.list.length;
  alerts.list = alerts.list.filter((a) => a.kind !== kind || (ref != null && a.ref !== ref));
  if (alerts.list.length !== before) persist();
}

export function ackAll(): void {
  if (!alerts.list.length) return;
  alerts.list = [];
  persist();
}

/** Boot: drop anything that belongs to a DIFFERENT account (shared machine,
 *  or a logout/login as someone else) and repaint the badge — the count
 *  survived the reload, so the icon should show it again. Called once the
 *  session is known, and again on every login. */
export function initAlerts(): void {
  const uid = session.user?.id;
  const kept = uid == null ? [] : alerts.list.filter((a) => a.owner === uid);
  if (kept.length !== alerts.list.length) {
    alerts.list = kept;
    persist();
    return; // persist() already synced the badge
  }
  syncAppBadge();
}
