// Per-user UI preferences (theme + chat font). The server is the source of
// truth (users.prefs, private) so the look follows you across devices; a
// localStorage mirror lets the boot screen paint in the right theme before the
// session loads (no flash of the wrong theme).

import { api, type UserPrefs } from "./api";
import { adoptVoicePrefs } from "./voice.svelte";
import { adoptStatusPrefs } from "./status.svelte";
import { isDesktopShell } from "./platform";
// The one definition of "a phone" — narrow, or short and touched. Imported
// rather than re-declared: this file and the CSS must agree about which
// screens get the 16px base, and a phone on its side is still a phone.
import { PHONE_QUERY } from "./phone-views";

export const THEMES = [
  { id: "cozy", name: "Cozy", blurb: "Warm charcoal & ember — the original foundry glow.", premium: false },
  { id: "chill", name: "Chill", blurb: "Cool blue-slate dusk — calm, glacial, quiet.", premium: false },
  { id: "shrub", name: "Shrub", blurb: "Mossy forest & sage — steady as an old garden.", premium: false },
  // Emporium themes (wave 1) — the server only persists these for owners;
  // Settings shows them locked with a price until Sterling has your silver.
  { id: "vaporwave", name: "Vaporwave", blurb: "Sunset neon over a chrome horizon.", premium: true },
  { id: "cyberpunk", name: "Cyberpunk", blurb: "Rain-slick black, one neon sign buzzing.", premium: true },
  { id: "darkacademia", name: "Dark Academia", blurb: "Oxblood, parchment, candle smoke.", premium: true },
  { id: "frutiger", name: "Frutiger Aero", blurb: "Glossy aqua and dewdrop green.", premium: true },
  // Wave 2
  { id: "y2k", name: "Y2K Futurism", blurb: "Chrome and bubble plastic.", premium: true },
  { id: "cassette", name: "Cassette Futurism", blurb: "Beige panels, amber readouts.", premium: true },
  { id: "backrooms", name: "Liminal Backrooms", blurb: "The hum never stops.", premium: true },
  { id: "tactical", name: "Tactical HUD", blurb: "Phosphor green on black.", premium: true },
  { id: "acid", name: "Acid Wave", blurb: "Blacklight purple, toxic green.", premium: true },
  // Wave 3
  { id: "utopian", name: "Utopian Scholastic", blurb: "Encarta skies and marble futures.", premium: true },
  { id: "atompunk", name: "Atompunk", blurb: "Starbursts and the friendly atom.", premium: true },
  { id: "destijl", name: "De Stijl", blurb: "Mondrian's house rules.", premium: true },
  { id: "tuscan", name: "Tuscan", blurb: "Terracotta and cypress at dusk.", premium: true },
] as const;

export const FONTS = [
  { id: "inter", name: "Classic", blurb: "The house sans — clean and neutral." },
  { id: "serif", name: "Bookish", blurb: "A quiet serif, like a well-worn paperback." },
  { id: "mono", name: "Terminal", blurb: "Monospace — for the keyboard-poets." },
  { id: "hand", name: "Scrawl", blurb: "Loose and handwritten. Chaos, lovingly." },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export type FontId = (typeof FONTS)[number]["id"];

const CACHE_KEY = "solace_prefs";
const DEFAULTS = { theme: "cozy", font: "inter" } as const;

/** Rebindable in-app actions (mirrors KEYBIND_ACTIONS in routes/profile.ts).
 *  `hold: true` = engages on keydown, releases on keyup (not a toggle). */
export const KEYBIND_ACTIONS: { id: string; name: string; hold?: boolean }[] = [
  { id: "mute", name: "Toggle mute (in voice)" },
  { id: "deafen", name: "Toggle deafen (in voice)" },
  { id: "pushToTalk", name: "Push to talk (hold)", hold: true },
  { id: "pushToMute", name: "Push to mute (hold)", hold: true },
  { id: "search", name: "Search messages" },
  { id: "goChat", name: "Go to Chat" },
  { id: "goDms", name: "Go to Direct Messages" },
  { id: "goRumble", name: "Go to the Casino" },
];

/** The casino jukebox, per listener (Josh: an option to turn it off "just in
 *  case they want to play in the casino without music"). Account-level, so it
 *  follows a login rather than a machine. */
export interface JukeboxPrefs {
  muted: boolean;
  volume: number;
}

type PrefsState = {
  theme: ThemeId;
  font: FontId;
  keybinds: Record<string, string>;
  /** UI zoom percent, or null = platform default (100; desktop shell 110). */
  uiScale: number | null;
  jukebox: JukeboxPrefs;
  /** Read receipts: send mine and see others'. Off = neither (symmetric). */
  readReceipts: boolean;
};

export const prefs = $state<PrefsState>({
  ...DEFAULTS,
  readReceipts: true,
  keybinds: {},
  uiScale: null,
  jukebox: { muted: false, volume: 0.5 },
} as PrefsState);

/** Font-scale choices offered in Settings (percent). */
export const SCALES = [90, 100, 110, 125, 140] as const;

/** The webview in the desktop shell has no zoom memory of its own and always
 *  rendered at a flat 100% — which read as "a little zoomed out" next to a
 *  browser's remembered per-site zoom. The shell therefore defaults larger. */
export const DEFAULT_SCALE = isDesktopShell ? 110 : 100;

/** Must match the `:root { font-size }` in app.css — the rem base the scale
 *  multiplies. */
const BASE_FONT_PX = 15;
/** PHONE MODE reads a point larger. 15px is a desktop base (a monitor at
 *  arm's length); every phone OS sets its body text at 16–17px and the app
 *  read "a little small" held in a hand. The scale pref multiplies whichever
 *  base applies, so a user's chosen 110% is 110% of the right number on
 *  both their devices. Same media query as lib/phone.svelte.ts. */
const PHONE_BASE_FONT_PX = 16;

export function effectiveScale(): number {
  return prefs.uiScale ?? DEFAULT_SCALE;
}

function baseFontPx(): number {
  return typeof matchMedia === "function" && matchMedia(PHONE_QUERY).matches
    ? PHONE_BASE_FONT_PX
    : BASE_FONT_PX;
}

// Crossing the phone line changes the base, so repaint. This fires on a
// tablet crossing 760px AND on a phone being turned on its side, since
// PHONE_QUERY now covers both. Not mid-try-on: paint() restamps the real
// theme, and the preview pill would still be counting down over a room that
// had already changed back.
if (typeof matchMedia === "function") {
  matchMedia(PHONE_QUERY).addEventListener("change", () => {
    if (!themePreview.active) paint();
  });
}

/** The browser chrome on a phone (Android's toolbar, the PWA status bar)
 *  takes its colour from <meta name="theme-color"> — keep it on the live
 *  theme's panel so the app doesn't wear a Cozy-brown hat over a Chill room. */
function paintThemeColor(root: HTMLElement): void {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const panel = getComputedStyle(root).getPropertyValue("--panel").trim();
  if (panel) meta.setAttribute("content", panel);
}

function isTheme(v: unknown): v is ThemeId {
  return THEMES.some((t) => t.id === v);
}
function isFont(v: unknown): v is FontId {
  return FONTS.some((f) => f.id === v);
}

/** Stamp the current prefs onto <html> so the CSS token blocks apply. */
function paint(): void {
  const root = document.documentElement;
  root.dataset.theme = prefs.theme;
  root.dataset.font = prefs.font;
  // Discord-style FONT scaling: grow the rem base so text (400+ rem-sized
  // rules) gets bigger while px layout and viewport math stay untouched.
  // The previous CSS `zoom` scaled the whole canvas and broke viewport
  // units on Mac's webview (content cut off below the window) — never again.
  root.style.removeProperty("zoom");
  root.style.fontSize = `${(baseFontPx() * effectiveScale()) / 100}px`;
  paintThemeColor(root);
}

function cache(): void {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ theme: prefs.theme, font: prefs.font, uiScale: prefs.uiScale }),
    );
  } catch {
    /* storage full/blocked — server copy still wins next boot */
  }
}

function isScale(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 80 && v <= 150;
}

/** Called before mount: paint from the localStorage mirror so there's no flash. */
export function paintCachedPrefs(): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (isTheme(p?.theme)) prefs.theme = p.theme;
      if (isFont(p?.font)) prefs.font = p.font;
      if (isScale(p?.uiScale)) prefs.uiScale = p.uiScale;
    }
  } catch {
    /* corrupt mirror — defaults are fine */
  }
  paint();
}

/** Adopt the server's prefs (login / bootstrap). Server wins over the mirror. */
/** READ RECEIPTS toggle — account-level, symmetric (off = you neither send
 *  nor see them). Reverts on a rejected PATCH like every pref here. */
export async function setReadReceipts(on: boolean): Promise<void> {
  const prev = prefs.readReceipts;
  prefs.readReceipts = on;
  try {
    await api.updatePrefs({ readReceipts: on ? null : false });
  } catch {
    prefs.readReceipts = prev;
  }
}

export function adoptPrefs(server: UserPrefs | undefined): void {
  endThemePreview(); // a try-on never outlives the session that started it
  const theme = server?.theme;
  const font = server?.font;
  prefs.theme = isTheme(theme) ? theme : (DEFAULTS.theme as ThemeId);
  prefs.font = isFont(font) ? font : (DEFAULTS.font as FontId);
  prefs.keybinds = server?.keybinds && typeof server.keybinds === "object" ? { ...server.keybinds } : {};
  const scale = server?.uiScale;
  prefs.uiScale = isScale(scale) ? scale : null;
  // The casino jukebox: off entirely, and how loud. Defaults to half volume —
  // background music in a room, not a set of headphones.
  const j = server?.jukebox;
  prefs.jukebox = {
    muted: j?.muted === true,
    volume: typeof j?.volume === "number" && j.volume >= 0 && j.volume <= 1 ? j.volume : 0.5,
  };
  prefs.readReceipts = server?.readReceipts !== false;
  adoptVoicePrefs(server?.voice); // NS / PTT follow the account too
  adoptStatusPrefs(server?.status); // manual away/busy follows the account
  paint();
  cache();
}

/** Set (or clear with null) one keybind. Optimistic with revert, like themes. */
export function setKeybind(action: string, combo: string | null): void {
  const previous = { ...prefs.keybinds };
  if (combo === null) delete prefs.keybinds[action];
  else prefs.keybinds[action] = combo;
  void api.updatePrefs({ keybinds: { ...prefs.keybinds } }).catch(() => {
    prefs.keybinds = previous;
  });
}

/** Briefly enable CSS transitions so an interactive switch cross-fades. */
function animateSwitch(): void {
  const root = document.documentElement;
  root.classList.add("theme-anim");
  setTimeout(() => root.classList.remove("theme-anim"), 350);
}

// ---- Theme try-on (preview before buying) -----------------------------------
// Dresses the whole app in a theme for a short window, purely client-side —
// nothing persists and the server's ownership check on PATCH is untouched, so
// a preview can never become a free equip. App.svelte renders the countdown
// pill and pauses the casino atmosphere-kill while a preview runs (the try-on
// should show the theme's full scenery even from the Emporium).

export const PREVIEW_MS = 20_000;

export const themePreview = $state<{ active: ThemeId | null; until: number }>({
  active: null,
  until: 0,
});

let previewTimer: ReturnType<typeof setTimeout> | null = null;

export function startThemePreview(theme: ThemeId): void {
  animateSwitch();
  themePreview.active = theme;
  themePreview.until = Date.now() + PREVIEW_MS;
  document.documentElement.dataset.theme = theme;
  paintThemeColor(document.documentElement); // the phone's browser chrome tries it on too
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(endThemePreview, PREVIEW_MS);
}

export function endThemePreview(): void {
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = null;
  if (!themePreview.active) return;
  themePreview.active = null;
  animateSwitch();
  paint(); // back to the real prefs
}

/** Set + persist the theme. Applies optimistically, but REVERTS if the server
 *  rejects the write — otherwise a theme the server doesn't know (client/server
 *  whitelist drift) would look saved locally yet silently never persist.
 *  NOTE: the valid ids live in three places that must stay in sync — here,
 *  the server whitelist in src/routes/profile.ts, and the [data-theme] token
 *  blocks in app.css. */
export function setTheme(theme: ThemeId): void {
  endThemePreview(); // committing to a theme ends any try-on
  if (theme === prefs.theme) return;
  const previous = prefs.theme;
  animateSwitch();
  prefs.theme = theme;
  paint();
  cache();
  void api.updatePrefs({ theme }).catch(() => {
    prefs.theme = previous;
    paint();
    cache();
  });
}

/** Set + persist the UI scale. Same optimistic-with-revert strategy; picking
 *  the platform default stores null (so the default can evolve per platform). */
export function setScale(percent: number): void {
  const next = percent === DEFAULT_SCALE ? null : percent;
  if (next === prefs.uiScale) return;
  const previous = prefs.uiScale;
  prefs.uiScale = next;
  endThemePreview(); // paint() restamps the real theme — a try-on must END, not linger as a lying pill
  paint();
  cache();
  void api.updatePrefs({ uiScale: next }).catch(() => {
    prefs.uiScale = previous;
    paint();
    cache();
  });
}

/** Set + persist the chat font. Same optimistic-with-revert strategy. */
export function setFont(font: FontId): void {
  if (font === prefs.font) return;
  const previous = prefs.font;
  prefs.font = font;
  endThemePreview(); // same rule as setTheme/adoptPrefs — paint() would restamp over the preview
  paint();
  cache();
  void api.updatePrefs({ font }).catch(() => {
    prefs.font = previous;
    paint();
    cache();
  });
}
