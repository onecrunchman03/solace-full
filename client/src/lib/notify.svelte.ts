// Native notifications for DMs and @mentions. Socket-driven: the app (a
// browser tab, the installed PWA, or the desktop shell sitting in the tray)
// is already connected, so when a relevant event arrives while the window
// isn't focused we raise a system notification + a soft ping.
//
// Per-device opt-in (localStorage) — notification appetite is a property of
// the machine you're on, not the account. The permission prompt fires only
// from the Settings toggle, never on page load.

import { effectiveMine } from "./status.svelte";
import { sfxContext, sfxOut } from "./sfx";
import { api } from "./api";
import { shell, shellHasNotify } from "./platform";

// IN THE DESKTOP SHELL (0.3.5+) notifications go through a native command —
// the webview's own Notification API is a dead end there (WebView2 auto-
// denies requestPermission; WKWebView has none at all), which is why the
// toggle "did nothing" on desktop. No permission dance: the shell posts
// straight to the OS notification center.
export const notify = $state<{ enabled: boolean; supported: boolean; blocked: boolean }>({
  enabled: shellHasNotify
    ? localStorage.getItem("solace_notify") === "1"
    : typeof Notification !== "undefined" && localStorage.getItem("solace_notify") === "1"
      && Notification.permission === "granted",
  supported: shellHasNotify || typeof Notification !== "undefined",
  /** The browser has the permission DENIED — the toggle can't fix that, only
   *  the site settings can. Without surfacing this, the button just "does
   *  nothing", which is exactly how the bug was reported. Never true in the
   *  shell — the native path has no permission to deny. */
  blocked: !shellHasNotify && typeof Notification !== "undefined" && Notification.permission === "denied",
});

/** Flip the pref; enabling asks the browser for permission if needed.
 *  Returns the resulting enabled state. */
export async function setNotifyEnabled(on: boolean): Promise<boolean> {
  if (!on) {
    notify.enabled = false;
    localStorage.setItem("solace_notify", "0");
    void teardownPush();
    return false;
  }
  if (!notify.supported) return false;
  if (shellHasNotify) {
    // The shell's native path needs no permission — flip on and prove it.
    notify.enabled = true;
    localStorage.setItem("solace_notify", "1");
    shell.notify(
      "Solace notifications are on",
      "DMs and @mentions will ping this machine when Solace isn't focused.",
    );
    return true;
  }
  const perm = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  notify.blocked = perm === "denied" || Notification.permission === "denied";
  notify.enabled = perm === "granted";
  localStorage.setItem("solace_notify", notify.enabled ? "1" : "0");
  if (notify.enabled) {
    void setupPush();
    // PROOF OF LIFE: fire one immediately, bypassing the focus gate. If the
    // OS swallows it (Focus Assist, webview restrictions), the user learns
    // that HERE, not three days later wondering why a DM never pinged.
    try {
      new Notification("Solace notifications are on", {
        body: "DMs and @mentions will ping this device when Solace isn't focused.",
        icon: "/icons/icon-192.png",
        tag: "notify-test",
      });
    } catch { /* some webviews throw on construct */ }
  }
  return notify.enabled;
}

// ---- Web Push (migration 74): pings with Solace fully CLOSED ---------------
// Rides the same per-device toggle — enabling notifications also registers a
// push subscription with the server; disabling (or logging out) removes it.
// The socket-driven path above still covers every open window.

function b64ToBytes(b64url: string): Uint8Array {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Register this device for push. Safe to call whenever notifications are on —
 *  re-subscribing is an upsert on both sides. */
export async function setupPush(): Promise<void> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const reg = await navigator.serviceWorker.ready;
    const { key } = await api.pushKey();
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToBytes(key) as BufferSource,
      }));
    const j = sub.toJSON();
    if (j.endpoint && j.keys?.p256dh && j.keys?.auth) {
      await api.pushSubscribe({ endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } });
    }
  } catch {
    /* push unsupported or refused — the in-app path still works */
  }
}

/** Drop this device's subscription (toggle off, or logout). */
export async function teardownPush(): Promise<void> {
  try {
    if (!("serviceWorker" in navigator)) return;
    // getRegistration, not `ready`: `ready` never settles when no worker is
    // active for the origin (dev never registers one; a failed sw.js install
    // in prod leaves it pending for the tab's life), and logout() awaits this
    // first — so "sign out" hung forever with a dead socket (Sep 2026 review).
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => {});
    await api.pushUnsubscribe(endpoint).catch(() => {});
  } catch {
    /* best-effort */
  }
}

let pingCtx: AudioContext | null = null;

/** A soft two-note ping (synth, no assets). */
function ping(): void {
  try {
    // Through the app's own sound output, so the App-sounds volume and mute
    // apply (Oct 2026 review — it built a private context at full gain).
    // (the output node must belong to the SAME context it is wired into)
    const shared = sfxContext();
    const sharedOut = shared ? sfxOut() : null;
    if (shared && sharedOut) pingCtx = shared;
    else pingCtx ??= new AudioContext();
    if (pingCtx.state === "suspended") void pingCtx.resume();
    const out = pingCtx === shared && sharedOut ? sharedOut : pingCtx.destination;
    const t = pingCtx.currentTime;
    for (const [freq, dt, dur, gain] of [[880, 0, 0.16, 0.055], [1174.7, 0.09, 0.22, 0.05]] as const) {
      const o = pingCtx.createOscillator();
      const g = pingCtx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.linearRampToValueAtTime(gain, t + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + dur);
      o.connect(g);
      g.connect(out);
      o.start(t + dt);
      o.stop(t + dt + dur + 0.05);
    }
  } catch {
    /* audio unavailable — the toast still shows */
  }
}

/** Raise a notification if enabled and the window isn't being looked at.
 *  `tag` collapses repeat notifications from the same conversation. */
export function maybeNotify(opts: { title: string; body: string; tag: string; onclick?: () => void }): void {
  if (!notify.enabled) return;
  if (effectiveMine() === "busy") return; // Busy = do not disturb
  if (document.hasFocus() && !document.hidden) return; // they're looking right at it
  if (shellHasNotify) {
    // Native path: the OS notification center owns it from here (no click
    // callback into the page — the tray/taskbar is the way back in).
    shell.notify(opts.title, opts.body);
    ping();
    return;
  }
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const n = new Notification(opts.title, {
      body: opts.body,
      tag: opts.tag,
      icon: "/icons/icon-192.png",
    });
    n.onclick = () => {
      window.focus();
      opts.onclick?.();
      n.close();
    };
    ping();
  } catch {
    /* some webviews throw on construct — nothing to do */
  }
}

/** Trim a message body for a notification line. */
export function excerpt(body: string, max = 120): string {
  const t = body.replace(/:([a-zA-Z0-9_-]{1,32}):/g, "·").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t || "(attachment)";
}
