// Client-side relic metadata — names, images, descriptions and Dr. Voss's
// notes for slots, lockers, the collection and the debrief. The source of
// truth is the server's catalogue (src/backrooms/relics.ts, import-free), so
// a description is written once. The catalog SIZE is never surfaced in UI
// copy: players only ever see what they've found.
import { LEVEL_RELIC_SETS } from "../../../src/backrooms/relics";

export const RELIC_META: Record<string, { name: string; img: string; desc: string; ada: string }> = Object.fromEntries(
  // EVERY level's ten, from the server's own list of sets — a level whose
  // relics spawn before they join ALL_RELICS (the count) must still be named
  // here, or a raw slug and a broken image land in the slot, the debrief and
  // the collection (Levels 6-8 did, Oct 2026: the list was written by hand).
  LEVEL_RELIC_SETS.flat().map((r) => [r.slug, { name: r.name, img: `/assets/relics/${r.img}`, desc: r.desc, ada: r.ada }]),
);

export const relicName = (slug: string): string => RELIC_META[slug]?.name ?? slug;
export const relicImg = (slug: string): string | undefined => RELIC_META[slug]?.img;
export const relicDesc = (slug: string): string => RELIC_META[slug]?.desc ?? "";
/** Dr. Voss's note on a relic. */
export const relicAda = (slug: string): string => RELIC_META[slug]?.ada ?? "";
