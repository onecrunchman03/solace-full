// DISPLAY MODE (Josh, Aug 2026) — "a setting that allows users to put the
// application in full screen, fullscreen windowed, and windowed".
//
// Three modes, and what each one actually is:
//   · windowed    an ordinary window (or a browser tab). The default.
//   · borderless  FULLSCREEN WINDOWED: no title bar, covering the whole
//                 monitor. Alt-tab stays instant and overlays sit on top.
//                 Only the DESKTOP SHELL can do this — a web page cannot
//                 remove a window's chrome — so browsers don't offer it.
//   · fullscreen  exclusive fullscreen: the shell's own in the desktop app,
//                 the Fullscreen API in a browser.
//
// WHERE THE PREFERENCE LIVES: this machine, not the account. A desktop at a
// 32" monitor and a laptop on a train want different answers, and the same
// reasoning already keeps mic/output device ids and stream quality local.
//
// THE BROWSER'S ONE RULE: requestFullscreen() needs a user gesture, so a
// browser CANNOT be restored to fullscreen at boot — clicking the setting is
// the gesture. The desktop shell has no such rule, so there the mode is
// genuinely sticky across launches. `restore()` knows the difference.
import { isDesktopShell, shellAtLeast, shell } from "./platform";

export type DisplayMode = "windowed" | "borderless" | "fullscreen";

const KEY = "solace_display";
/** The shell release that carries the set_display_mode command. An older
 *  install simply doesn't offer the modes it can't honour, rather than
 *  offering a button that silently does nothing. */
const SHELL_MIN = "0.3.4";

export const shellCanDisplay = isDesktopShell && shellAtLeast(SHELL_MIN);
/** Fullscreen-windowed needs a real window to take the chrome off. */
export const canBorderless = shellCanDisplay;
/** Every surface can do SOME kind of fullscreen: the shell's, or the page's. */
export const canFullscreen = shellCanDisplay ||
  (typeof document !== "undefined" && !!document.documentElement.requestFullscreen);

function read(): DisplayMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "windowed" || v === "borderless" || v === "fullscreen") return v;
  } catch { /* private mode */ }
  return "windowed";
}

export const display = $state({
  /** What the user picked on this machine. */
  mode: read() as DisplayMode,
  /** True while the PAGE holds fullscreen (browsers only) — the UI says
   *  "press Esc to leave" rather than pretending the toggle is the only way. */
  pageFullscreen: false,
  /** Set when a mode couldn't be honoured, so the picker can say why. */
  note: "" as string,
});

function save(mode: DisplayMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch { /* private mode */ }
}

/** Did WE put the page into fullscreen? A video going fullscreen and coming
 *  back must not be mistaken for the user leaving app fullscreen. */
let ownedFullscreen = false;

async function pageFullscreen(on: boolean): Promise<boolean> {
  try {
    if (on) {
      if (document.fullscreenElement) return true;
      await document.documentElement.requestFullscreen();
      ownedFullscreen = true;
      return true;
    }
    if (document.fullscreenElement && ownedFullscreen) await document.exitFullscreen();
    ownedFullscreen = false;
    return true;
  } catch {
    ownedFullscreen = false;
    return false;
  }
}

/**
 * Put the app into `mode` and remember it. Returns the mode actually reached —
 * a browser asked for "borderless" lands on "fullscreen", because covering the
 * screen is the honest half of that request and a page can't do the other half.
 */
export async function setDisplayMode(mode: DisplayMode): Promise<DisplayMode> {
  let want = mode;
  if (want === "borderless" && !canBorderless) want = "fullscreen";
  display.note = "";

  if (shellCanDisplay) {
    const got = await shell.setDisplayMode(want);
    if (!got) {
      display.note = "the app window refused that mode";
      return display.mode;
    }
    // The shell owns the window; the page must not ALSO be in page-fullscreen
    // or Esc would drop out of one layer and leave the other behind.
    await pageFullscreen(false);
  } else if (want === "fullscreen") {
    if (!(await pageFullscreen(true))) {
      display.note = "your browser refused fullscreen";
      return display.mode;
    }
  } else {
    await pageFullscreen(false);
  }

  display.mode = want;
  save(want);
  return want;
}

/**
 * Re-apply the stored mode at boot. In the desktop shell this is the whole
 * point — the app comes back the way you left it. In a browser it deliberately
 * does NOTHING but record the preference: a fullscreen request without a
 * gesture is refused, and a refused promise here used to be exactly the kind
 * of unhandled rejection that lands in the errors table.
 */
export function restoreDisplayMode(): void {
  if (!shellCanDisplay) {
    // A browser starts windowed whatever it was told last time, so SAY so:
    // a picker showing "Fullscreen" over a windowed page is a lie, and one
    // that a reload (or the client's own auto-update reload) causes daily.
    if (display.mode !== "windowed" && !document.fullscreenElement) {
      display.mode = "windowed";
      save("windowed");
    }
    return;
  }
  if (display.mode === "windowed") return;
  void setDisplayMode(display.mode);
}

/** Keep the picker honest when the user leaves fullscreen by other means
 *  (Esc, F11, the window buttons) — the setting should read what is true. */
export function watchDisplayMode(): () => void {
  const onChange = (): void => {
    const fs = !!document.fullscreenElement;
    display.pageFullscreen = fs;
    if (shellCanDisplay) return; // the shell's modes aren't page fullscreen
    if (!fs && ownedFullscreen) {
      ownedFullscreen = false;
      if (display.mode === "fullscreen") {
        display.mode = "windowed";
        save("windowed");
      }
    }
  };
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}

export const DISPLAY_MODES: { id: DisplayMode; label: string; hint: string }[] = [
  { id: "windowed", label: "Windowed", hint: "an ordinary window" },
  { id: "borderless", label: "Fullscreen windowed", hint: "no chrome, fills the screen, instant alt-tab" },
  { id: "fullscreen", label: "Fullscreen", hint: "the whole screen, exclusively" },
];
