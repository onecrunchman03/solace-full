// Friends' browsers report their own crashes into the Admin Panel's error
// tracker — a frontend bug on someone else's machine becomes a visible row
// instead of a mystery "it's broken for me". Session-deduped and best-effort;
// the reporter itself must never throw or loop.

import { api } from "./api";
import { session } from "./session.svelte";

const reported = new Set<string>();
let installed = false;

function report(message: string, stack?: string): void {
  try {
    if (!session.user) return; // the endpoint is authenticated
    const msg = String(message || "").slice(0, 400);
    if (!msg || msg === "Script error.") return; // opaque cross-origin noise
    const key = msg.slice(0, 120);
    if (reported.has(key) || reported.size > 20) return;
    reported.add(key);
    void api.reportClientError(msg, stack?.slice(0, 3000), location.hash || location.pathname).catch(() => {});
  } catch {
    /* never let the reporter be the bug */
  }
}

/** A note that isn't a thrown error but should reach the tracker anyway —
 *  a clue about a bug nobody here can reproduce. Same dedupe as errors. */
export function reportNote(message: string, detail: string): void {
  report(message, detail);
}

// THE ESCAPE BREADCRUMB (Josh, Sep 2026: "when on the mac app and im in the
// backrooms when i press escape to go to the pause menu it kicks me out to
// main solace"). Nobody here has a Mac to reproduce it on, so the game writes
// a breadcrumb on every Escape, and if the PAGE RELOADS within a few seconds
// of one this reports it with the state the game was in. (The game reports
// the other shape itself — being closed without reloading.)
export const ESC_CRUMB = "solace_br_esc";
function checkEscapeCrumb(): void {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(ESC_CRUMB);
    sessionStorage.removeItem(ESC_CRUMB);
  } catch {
    return;
  }
  if (!raw) return;
  let crumb: { at?: number } = {};
  try {
    crumb = JSON.parse(raw);
  } catch {
    return;
  }
  const gap = Date.now() - Number(crumb.at ?? 0);
  if (!(gap >= 0 && gap < 15_000)) return;
  const detail = `page reloaded ${gap}ms after Escape in the backrooms · ${raw} · ua=${navigator.userAgent}`;
  // The endpoint needs a signed-in session, which boot is still restoring.
  let tries = 0;
  const t = window.setInterval(() => {
    if (session.user || ++tries > 30) {
      window.clearInterval(t);
      if (session.user) report("backrooms: page reloaded right after Escape", detail);
    }
  }, 1000);
}

export function installErrorReporter(): void {
  if (installed) return;
  installed = true;
  checkEscapeCrumb();
  window.addEventListener("error", (e) => report(e.message, e.error?.stack));
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    report(r instanceof Error ? r.message : String(r), r instanceof Error ? r.stack : undefined);
  });
}
