// THE PORTAL's decipher sources across the hub (PORTAL.md → "How it cracks").
// IMPORT-FREE: the client imports ETCHED_RELICS to draw each relic's mark.
//
// Everything here is glyph IDS, never sounds — an id is only a shape, and the
// shapes are public. Which sound a mark makes reaches a browser only once the
// community has cracked it (src/portal/hall.ts). Do not add a sound here.
//
// The split is deliberate. Frequency analysis is how the common sounds fall,
// so the sources hand over the RARE ones, the marks deduction can't reach:
//  - the stone reads one mark of its own name per newcomer (hall.ts arrive);
//  - Sterling has three, all the Foundry ever managed, and he hands them over
//    together to anyone who has been through and asks (`/sterling portal`);
//  - one relic on every Backrooms level carries an etched mark, and carrying
//    it through the Portal reads it;
//  - the survey (survey.ts) reads one numeral per galaxy charted.

/** relic slug → the glyph id cut into it. One per level, in level order. */
export const ETCHED_RELICS: Record<string, number> = {
  "alien-tech": 4, // Level 0
  "hieroglyphics-tablet": 5, // Level 1
  "cog-of-truth": 31, // Level 2
  "rune-of-protection": 28, // Level 3
  "the-blank-book": 21, // Level 4
  "fallen-star": 14, // Level 5
  "the-conch-shell": 7, // Level 6
  "the-message-in-a-bottle": 33, // Level 7
  "the-fossil-fish": 2, // Level 8
  "the-mornings-paper": 23, // Level 9 — reads once the Suburbs' relics are live
};

/** The Foundry's three — and with the stone's marks they read the door's own word. */
export const STERLING_MARKS: readonly number[] = [24, 25, 15];

export type GlyphSource = "stone" | "sterling" | "relic" | "survey" | "deduction" | "admin";
/** A stored source ("relic:<slug>" for an etching, "survey:<galaxy>" for a
 *  charted galaxy) as its kind and what it names. */
export function sourceOf(stored: string): { kind: GlyphSource; relic: string | null; galaxy: string | null } {
  if (stored.startsWith("relic:")) return { kind: "relic", relic: stored.slice(6), galaxy: null };
  if (stored.startsWith("survey:")) return { kind: "survey", relic: null, galaxy: stored.slice(7) };
  const k = (["stone", "sterling", "deduction", "admin"] as const).find((s) => s === stored);
  return { kind: k ?? "deduction", relic: null, galaxy: null };
}
