// OPENING A LINK THAT LEAVES SOLACE — the one place that knows how.
//
// In a browser an `<a target="_blank">` needs no help, and is the right markup
// anyway: it is what makes middle-click, "open in new tab" and "copy link
// address" behave. So in a browser this does nothing at all and lets the
// anchor do its job.
//
// THE DESKTOP SHELL IS THE WHOLE REASON THIS EXISTS. Its webview has no second
// window to open into, so `target="_blank"` there is a link that silently does
// nothing — no error, no tab, no clue. Every external link in the app had that
// fault: the Exchange's news headlines (which is how it was found — Josh:
// "when i click the news stories nothing happens, why?") and every link to the
// Terms, the Guidelines and the Privacy Policy, which is the worse one.
//
// Shell 0.3.6 added an `open_external` command that hands the URL to the real
// browser, with the scheme re-checked in Rust. Older shells genuinely cannot
// open anything, so they get the address on the clipboard and a caller-chosen
// way of being told — never a click that does nothing.

import { isDesktopShell, shell, shellHasOpener } from "./platform";

export type LinkResult = "browser" | "opened" | "copied" | "failed";

/**
 * Handle a click on a link that leaves the app.
 *
 * Returns what actually happened, so the caller can say so. `"browser"` means
 * it did nothing and the anchor is handling it — the normal case.
 */
export async function openLink(e: MouseEvent, url: string): Promise<LinkResult> {
  // Let the browser have modified clicks (new tab, new window, download) and
  // anything but the primary button, exactly as it would without us.
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return "browser";
  if (!isDesktopShell || !url) return "browser";
  e.preventDefault();
  if (shellHasOpener && (await shell.openExternal(url))) return "opened";
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}

/** What to tell someone when the shell could not open it. Null when there is
 *  nothing to say, which is the usual answer. */
export function linkMessage(r: LinkResult): string | null {
  if (r === "copied") return "This app can't open links — the address is on your clipboard.";
  if (r === "failed") return "This app can't open links. Open it in a browser instead.";
  return null;
}
