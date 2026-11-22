// Client-update watcher: notices when a newer bundle has been deployed and
// refreshes at a safe moment, so long-lived sessions (desktop app in the
// tray, a phone tab from last week) don't linger on old code.
//
// Pure client trick — no server support needed: Vite builds embed a content
// hash in the entry script's filename, so "is there an update?" is just
// "does a freshly-fetched index.html reference a different entry script than
// the one this session booted from?". In dev the entry is /src/main.ts and
// never changes, so the watcher is inert.
//
// Apply policy (locked with Josh): NEVER interrupt a stream — in a voice
// room, or with text sitting in a focused field, we only show the pill; a
// silent reload happens when it can't cost anyone anything (idle, or the
// tab is hidden). A reload mid-voice is survivable anyway (the room
// auto-rejoins), but it still blips — so it stays the user's choice.

import { voice } from "./voice.svelte";
import { brGame } from "../backrooms/active";

export const appUpdate = $state<{ available: boolean }>({ available: false });

const CHECK_EVERY_MS = 15 * 60 * 1000;

let bootEntry: string | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

/** The entry-module URL a copy of index.html points at. */
function entryOf(doc: Document): string | null {
  return doc.querySelector('script[type="module"]')?.getAttribute("src") ?? null;
}

function safeToReload(): boolean {
  if (voice.channelId != null || voice.connecting) return false;
  if (brGame.active) return false; // never yank someone out of the backrooms
  // Nor out of ANY drawn world (Oct 2026 review): the casino floor, the
  // escape room, the broadcast and the map editor all mount a canvas, and a
  // deploy reloaded people out of them mid-hand or mid-edit. The pill offers
  // the update instead.
  if (document.querySelector("canvas")) return false;
  const el = document.activeElement;
  if (
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLInputElement && el.type !== "checkbox" && el.type !== "radio")
  ) {
    if (el.value.trim()) return false; // something half-typed
  }
  return true;
}

export function applyUpdate(): void {
  location.reload();
}

async function check(): Promise<void> {
  if (bootEntry === null || appUpdate.available) return;
  try {
    const res = await fetch("/index.html", { cache: "no-store" });
    if (!res.ok) return;
    const fresh = entryOf(new DOMParser().parseFromString(await res.text(), "text/html"));
    if (!fresh || fresh === bootEntry) return;
    if (safeToReload()) applyUpdate();
    else appUpdate.available = true;
  } catch {
    /* offline or mid-deploy — the next tick will see the truth */
  }
}

/** Called once at app init. Re-entrant safe. */
export function initUpdateWatch(): void {
  if (timer) return;
  bootEntry = entryOf(document);
  if (!bootEntry || bootEntry.includes("/src/")) return; // dev server — inert
  timer = setInterval(() => void check(), CHECK_EVERY_MS);
  // Returning to the tab/app is the perfect moment to catch up.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void check();
  });
}

/** The socket reconnected — a deploy restarts the backend, so this is the
 *  earliest signal that the world may have changed. */
export function checkForUpdateSoon(): void {
  setTimeout(() => void check(), 2000);
}
