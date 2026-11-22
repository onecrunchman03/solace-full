// THE SUIT PICTURE, reactive: every surface that shows a suit asks here and
// gets the portrait of the real model (backrooms/suitportrait.ts) the moment
// it has rendered, and the recoloured store photo (with its trim) until
// then. One cache for the session; a colorway renders once.
import { suitArtUrl, suitFilter } from "../backrooms/suitcolor";

export const suitPics = $state<Record<string, string>>({});

const asked = new Set<string>();

/** Kick the render for a colorway (idempotent). */
export function requestSuitPic(color: string): void {
  const key = color || "yellow";
  if (asked.has(key)) return;
  asked.add(key);
  // The trimmed photo first — it's synchronous-ish and never blank…
  void suitArtUrl(key).then((url) => {
    if (url && !suitPics[key]) suitPics[key] = url; // null = keep the CSS filter
  });
  // …then the real thing, lazily pulling three.js + the model.
  void import("../backrooms/suitportrait")
    .then((m) => m.suitPortraitUrl(key))
    .then((url) => {
      if (url) suitPics[key] = url;
    })
    .catch(() => {
      /* no WebGL here — the photo stays */
    });
}

/** The inline style for a suit <img> fed by suitPic(): the colorway's CSS
 *  filter ONLY while the raw photo is still showing — the recoloured art and
 *  the portrait already carry their colour, and a filter on top of either
 *  would double it. */
export function suitPicStyle(color: string | null | undefined): string {
  const key = color || "yellow";
  return suitPics[key] ? "" : `filter:${suitFilter(key)}`;
}

/** The best picture we have right now for a colorway. */
export function suitPic(color: string | null | undefined): string {
  const key = color || "yellow";
  requestSuitPic(key);
  return suitPics[key] ?? "/assets/gear/suit.png";
}
