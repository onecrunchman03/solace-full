// THE STONE OF THE ABYSS (Josh, Sep 2026): do I hold it, what it says when
// I click it, and whether I've said it back — which is what opens THE
// PORTAL on the rail. The stone comes out of Pandora's Box; the server
// tells my sockets when the portal opens (chat.svelte.ts → applyAbyssOpened).
import { api, ApiError, type AbyssState } from "./api";
import { go, nav } from "./nav.svelte";

export const abyss = $state<{
  loaded: boolean;
  stone: boolean;
  code: string;
  phrase: string | null;
  opened: boolean;
  openedAt: number | null;
  /** The stone's card is up (clicked in the inventory). */
  showing: boolean;
  /** The phrase is being spoken — the card flares before the portal takes you. */
  speaking: boolean;
  busy: boolean;
  /** What went wrong, shown on the card. The single most important button in
   *  the feature used to fail in total silence (Sep 2026 review). */
  error: string | null;
}>({ loaded: false, stone: false, code: "abyss-stone", phrase: null, opened: false, openedAt: null, showing: false, speaking: false, busy: false, error: null });

export async function loadAbyss(): Promise<void> {
  try {
    const s: AbyssState = await api.abyss();
    abyss.stone = s.stone;
    abyss.code = s.code;
    abyss.phrase = s.phrase;
    abyss.opened = s.opened;
    abyss.openedAt = s.openedAt;
    abyss.loaded = true;
  } catch {
    /* the stone keeps its silence; the next load tries again */
  }
}

/** Click the stone. */
export function showStone(): void {
  if (!abyss.loaded) void loadAbyss();
  abyss.error = null;
  abyss.showing = true;
}
export function hideStone(): void {
  if (abyss.speaking) return;
  abyss.showing = false;
}

/** Say it. The server opens the portal (once); the card flares, then the
 *  rail's new section takes you through. */
export async function speakPhrase(): Promise<boolean> {
  if (abyss.busy || !abyss.stone) return false;
  abyss.busy = true;
  abyss.speaking = true;
  abyss.error = null;
  try {
    const r = await api.abyssSpeak();
    abyss.opened = true;
    abyss.openedAt = r.openedAt;
    await new Promise((res) => setTimeout(res, 2200));
    abyss.showing = false;
    go("portal");
    return true;
  } catch (e) {
    // The stone can leave your hand between the page load and the press (the
    // admin lever takes it back), and a deploy can answer 502. Either way the
    // card must say something rather than flare and sit there.
    const err = e instanceof ApiError ? e.code : "failed"; // ApiError has .code, never .body (Oct 2026 review)
    abyss.error =
      err === "no_stone"
        ? "The stone is not in your hand. Whatever was listening has stopped."
        : "The words went out and nothing came back. Try again.";
    abyss.speaking = false;
    void loadAbyss();
    return false;
  } finally {
    abyss.speaking = false;
    abyss.busy = false;
  }
}

/** The socket said the portal opened (another tab spoke, or this one). */
export function applyAbyssOpened(): void {
  abyss.opened = true;
  if (abyss.loaded) void loadAbyss();
}

/** The socket said the stone was taken back: shut the Portal NOW rather than
 *  leaving a live rail entry to a door that no longer opens (the admin
 *  lever's own tooltip promised this). */
export function applyAbyssClosed(): void {
  abyss.opened = false;
  abyss.openedAt = null;
  abyss.stone = false;
  abyss.phrase = null;
  abyss.showing = false;
  if (nav.view === "portal") go("chat");
  if (abyss.loaded) void loadAbyss();
}

export function resetAbyss(): void {
  abyss.loaded = false;
  abyss.error = null;
  abyss.stone = false;
  abyss.phrase = null;
  abyss.opened = false;
  abyss.openedAt = null;
  abyss.showing = false;
  abyss.speaking = false;
  abyss.busy = false;
}
