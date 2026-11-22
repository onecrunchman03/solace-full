// Where is the client running? The desktop shell stamps its user-agent with
// "SolaceShell/<version>" (see desktop/src-tauri/tauri.conf.json), so the
// site can hide browser-only chrome (like the "get the app" link) and later
// light up shell-only features.
export const isDesktopShell = navigator.userAgent.includes("SolaceShell/");

/** Mac browser? Drives which desktop installer the login page offers. */
export const isMac = /Mac|iPhone|iPad/.test(navigator.platform ?? "") ||
  navigator.userAgent.includes("Macintosh");

/** The shell's version, or null in a browser ("SolaceShell/0.3.2" → "0.3.2").
 *  Shell-only features that need a NEW shell gate on this, so an old install
 *  simply doesn't show a toggle it can't honour. */
export const shellVersion = (() => {
  const m = /SolaceShell\/([\d.]+)/.exec(navigator.userAgent);
  return m ? m[1] : null;
})();

/** Is the running shell at least this version? */
export function shellAtLeast(want: string): boolean {
  if (!shellVersion) return false;
  const a = shellVersion.split(".").map(Number);
  const b = want.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
const invoke = (): Invoke | null => {
  const t = (window as unknown as { __TAURI__?: { core?: { invoke?: Invoke } } }).__TAURI__;
  return t?.core?.invoke ?? null;
};

/** Shell command bridge — every call is a no-op in a browser. */
export const shell = {
  /** Launch Solace when the machine starts (Windows registry / LaunchAgent). */
  async getAutostart(): Promise<boolean> {
    const fn = invoke();
    if (!fn) return false;
    try {
      return (await fn("get_autostart")) === true;
    } catch {
      return false;
    }
  },
  async setAutostart(on: boolean): Promise<boolean> {
    const fn = invoke();
    if (!fn) return false;
    try {
      return (await fn("set_autostart", { on })) === true;
    } catch {
      return false;
    }
  },
  /** Fullscreen / fullscreen-windowed / windowed, done natively (v0.3.4+).
   *  Returns the mode the window actually took, or null if this shell has no
   *  such command — the caller then leaves the window alone rather than
   *  claiming a mode it never reached. */
  async setDisplayMode(mode: string): Promise<string | null> {
    const fn = invoke();
    if (!fn) return null;
    try {
      const got = await fn("set_display_mode", { mode });
      return typeof got === "string" ? got : mode;
    } catch {
      return null;
    }
  },
  /** The taskbar/dock count (macOS + Linux badge; Windows title + tooltip). */
  setBadge(count: number): void {
    const fn = invoke();
    if (!fn) return;
    void fn("set_badge", { count }).catch(() => {});
  },
  /** A real OS notification through the shell (v0.3.5+) — the webview's own
   *  Notification API is a dead end there (WebView2 auto-denies the
   *  permission; WKWebView has no implementation at all). */
  notify(title: string, body: string): void {
    const fn = invoke();
    if (!fn) return;
    void fn("notify", { title, body }).catch(() => {});
  },
  /**
   * Open a link in the user's REAL browser (v0.3.6+).
   *
   * The webview has no second window, so `target="_blank"` inside the shell
   * is a link that silently does nothing — which is what the Exchange's news
   * headlines looked like from the outside. Resolves true only when the shell
   * actually took it, so the caller can fall back rather than assume.
   *
   * The shell re-checks the scheme in Rust and refuses everything but http
   * and https; this never gets to be the only guard.
   */
  async openExternal(url: string): Promise<boolean> {
    const fn = invoke();
    if (!fn) return false;
    try {
      await fn("open_external", { url });
      return true;
    } catch {
      return false;
    }
  },
};

/** Does this shell have the alert/startup commands? (v0.3.2 added them.) */
export const shellHasAlerts = isDesktopShell && shellAtLeast("0.3.2");

/** Does this shell post native notifications? (v0.3.5 added the command.) */
export const shellHasNotify = isDesktopShell && shellAtLeast("0.3.5");

/** Can this shell open a link in the real browser? (v0.3.6 added it.) An
 *  older install falls back to the clipboard, because there is genuinely no
 *  way out of those webviews. */
export const shellHasOpener = isDesktopShell && shellAtLeast("0.3.6");
