// THE HOUSE CONFIRM — Solace's own "are you sure?", app-wide.
//
// Josh, Aug 2026: "do not do browser pop out for are you sure descions. just
// do in the app please. that goes across the board as a rule. it looks tacky."
//
// A browser `confirm()` is a grey OS box with the page's hostname in it,
// dropped on top of a warm wood-and-ember interface — and in the 3D views it
// arrives over a rendered room, which is worse. It is also unstyleable,
// unthemeable, and it BLOCKS the event loop, so a socket frame that lands
// while somebody thinks about a dialog is stalled behind it.
//
// The shape is deliberately the same as the backrooms' own house dialog (which
// already replaced its browser confirms in the round-3 punch list) so the call
// sites read identically to what they replaced:
//
//     if (!(await ask({ title: "…", body: "…", danger: true }))) return;
//
// One dialog is mounted app-level by App.svelte (see ConfirmDialog.svelte);
// this module is the state and the promise behind it. Anything irreversible in
// the app goes through here — a browser confirm() in a review is a bug now.

export interface AskOptions {
  title: string;
  body?: string;
  /** The affirmative button's label. "confirm" if not given — but a verb that
   *  names the ACTION ("delete the account") always beats a generic yes. */
  confirm?: string;
  /** Red treatment: destructive, irreversible, or spends real value. */
  danger?: boolean;
  /** When set, the confirm button stays dead until this phrase is typed
   *  EXACTLY. For actions where a stray click is unrecoverable — you cannot
   *  misclick your way through a keyboard. Replaces the old habit of stacking
   *  a second confirm() behind the first, which is still just one more click. */
  typeToConfirm?: string;
}

interface Asking extends AskOptions {
  confirm: string;
  danger: boolean;
  /** Free-text prompt mode (askText): the input collects a REASON rather than
   *  matching a phrase; confirm arms once anything is typed. */
  textInput?: { label: string; placeholder: string; maxLength: number };
  /** `typed` is handed over because answerAsk clears the field first. */
  resolve: (ok: boolean, typed?: string) => void;
}

export const confirmUi = $state<{ asking: Asking | null; typed: string }>({
  asking: null,
  typed: "",
});

/** Ask the house. Resolves true if they went through with it.
 *
 *  A second ask while one is open answers the first with `false` rather than
 *  losing its promise — an abandoned promise is a caller stuck forever. */
export function ask(o: AskOptions): Promise<boolean> {
  confirmUi.asking?.resolve(false);
  confirmUi.typed = "";
  return new Promise<boolean>((resolve) => {
    confirmUi.asking = {
      ...o,
      confirm: o.confirm ?? "confirm",
      danger: o.danger ?? false,
      resolve,
    };
  });
}

/** Ask the house FOR WORDS — the in-app replacement for browser prompt()
 *  (banned for the same reasons as confirm(), and worse: the desktop shell's
 *  webview returns null from prompt() unconditionally, so a prompt-driven
 *  flow silently does nothing there). Resolves the trimmed text, or null if
 *  they backed out. */
export function askText(o: {
  title: string;
  body?: string;
  confirm?: string;
  danger?: boolean;
  label?: string;
  placeholder?: string;
  maxLength?: number;
}): Promise<string | null> {
  confirmUi.asking?.resolve(false);
  confirmUi.typed = "";
  return new Promise<string | null>((resolve) => {
    confirmUi.asking = {
      title: o.title,
      body: o.body,
      confirm: o.confirm ?? "send",
      danger: o.danger ?? false,
      textInput: {
        label: o.label ?? "",
        placeholder: o.placeholder ?? "",
        maxLength: o.maxLength ?? 500,
      },
      // The text comes in as an ARGUMENT (Oct 2026 review): answerAsk clears
      // confirmUi.typed before resolving, so reading it here always got "" —
      // every Report box and the page-naming prompt silently did nothing.
      resolve: (ok: boolean, typed?: string) => resolve(ok ? (typed ?? "").trim() || null : null),
    };
  });
}

/** Whether the confirm button is live — i.e. any type-to-confirm is satisfied.
 *  Compared case-insensitively and trimmed: this is a speed bump for reflex
 *  clicks, not a spelling test. */
export function askArmed(): boolean {
  const a = confirmUi.asking;
  if (!a) return false;
  if (a.textInput) return confirmUi.typed.trim().length > 0;
  if (!a.typeToConfirm) return true;
  return confirmUi.typed.trim().toLowerCase() === a.typeToConfirm.trim().toLowerCase();
}

export function answerAsk(ok: boolean): void {
  const a = confirmUi.asking;
  if (!a) return;
  if (ok && !askArmed()) return;
  const typed = confirmUi.typed;
  confirmUi.asking = null;
  confirmUi.typed = "";
  a.resolve(ok, typed);
}
