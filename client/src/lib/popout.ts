// POP-OUT WINDOWS — one helper for every page that can open itself in its own window (Nov 3 2026:
// the Survivorz show; the character creator next). A pop-out is this same site at `location.origin/<hash>`,
// and main.ts mounts the lean page that hash names instead of the whole app.
//   · the desktop shell: a real native window through its `open_popout` command (the shell only opens
//     solace.zone pages, and can't tell us when the window closes — so callers keep a "bring it back" button);
//   · a browser: window.open as a popup, which we CAN watch for closing.
import { isDesktopShell } from "./platform";

export interface Popped {
  /** true: a native shell window (no close signal) */
  native: boolean;
  /** the browser window, to watch for `closed` and to close from here */
  win: Window | null;
}

type Invoke = (cmd: string, args: object) => Promise<unknown>;

/** Open `hash` (e.g. "#survivorz-watch") in its own window. Throws a plain-English reason when it can't. */
export async function openPopout(hash: string, opts: { name: string; width?: number; height?: number }): Promise<Popped> {
  const url = `${location.origin}/${hash}`;
  if (isDesktopShell) {
    const invoke = (window as unknown as { __TAURI__?: { core?: { invoke?: Invoke } } }).__TAURI__?.core?.invoke;
    if (!invoke) throw new Error("Pop-out needs the latest Solace desktop app — update from solace.zone.");
    try { await invoke("open_popout", { url }); }
    catch (e) { throw new Error(`The window wouldn't open (${String(e)}).`); }
    return { native: true, win: null };
  }
  const w = opts.width ?? 1280, h = opts.height ?? 720;
  const left = Math.max(0, Math.round((screen.availWidth - w) / 2)), top = Math.max(0, Math.round((screen.availHeight - h) / 2));
  const win = window.open(url, opts.name, `popup,width=${w},height=${h},left=${left},top=${top}`);
  if (!win) throw new Error("Your browser blocked the window — allow pop-ups for solace.zone and try again.");
  win.focus();
  return { native: false, win };
}

/** Call `onClosed` once a browser pop-out closes (a native one never reports, so this is a no-op for it). */
export function watchClosed(p: Popped, onClosed: () => void): () => void {
  if (!p.win) return () => {};
  const t = window.setInterval(() => { if (p.win?.closed) { window.clearInterval(t); onClosed(); } }, 700);
  return () => window.clearInterval(t);
}
