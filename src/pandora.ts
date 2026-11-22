// PANDORA'S BOX — the endgame of Solace v1 (Josh, Sep 2026; design in
// PANDORA.md). Pure rules, no imports beyond the relic registry: three keys,
// one from each pillar of the game, a box that opens once you hold them all,
// THE PANDORAN suit for every opener, and ONE world choice per opener —
// each world choice taken at most once, server-wide, ever.
//
// Every key is a HIGH-WATER MARK (nothing the rules do ever revokes one).
// The Rusted Key's numbers are HARDCODED to the finished game — ten levels,
// a hundred relics — so nobody earns it against the two maps that exist
// today; the page shows honest progress toward a target that isn't built.

import { RELICS, POOL_RELICS, PIPE_RELICS } from "./backrooms/relics";
import { STONE_CHOICE } from "./abyss";

export type PandoraKey = "prismatic" | "brass" | "rusted";
export const PANDORA_KEYS: readonly PandoraKey[] = ["prismatic", "brass", "rusted"];

export const KEY_NAMES: Record<PandoraKey, string> = {
  prismatic: "The Prismatic Key",
  brass: "The Brass Key",
  rusted: "The Rusted Key",
};

/** What each key asks for — the copy under its square. */
export const KEY_RULES: Record<PandoraKey, string> = {
  prismatic: "Tier 4 in the VIP Room — every emoji the Wheel has ever offered, and every relic the maps hold.",
  brass: "Every achievement on the wall.",
  rusted: "Every relic on every level of the Backrooms — all ten levels, all one hundred relics.",
};

/** The Rusted Key's target: the FINISHED Backrooms. Hardcoded on purpose. */
export const RUSTED_LEVELS = 10;
export const RUSTED_RELICS = 100;

/** The relic registry per level built so far (index = level). A third map
 *  appends its list here and the page's per-level bars follow. */
export const LEVEL_RELICS: readonly (readonly { slug: string }[])[] = [RELICS, POOL_RELICS, PIPE_RELICS];

/** The Pandoran: the suit every opener receives (an award-only Emporium
 *  item; the colorway the locker row wears). */
export const PANDORAN_ITEM = "suit-pandoran";
export const PANDORAN_COLOR = "pandoran";

/** The world choices. `once` = taken at most once server-wide: a regime
 *  flag read elsewhere (app_kv `pandora:<id>`). `once: false` = every
 *  opener may take it (the Stone — a thing handed over, not a rule
 *  changed). An opener who wants none of it leaves hope in the box
 *  (`choice` NULL on the opening row). */
export interface PandoraChoice {
  id: string;
  name: string;
  desc: string;
  once: boolean;
}
export const PANDORA_CHOICES: readonly PandoraChoice[] = [
  {
    id: "destroy-goblins",
    name: "Destroy the Goblins",
    desc: "Goblin Lenders is gone for good. Every debt is washed, every cell opened, and Foundry Lending takes the window — fair rates, no cells, no letters.",
    once: true,
  },
  {
    id: "retire-reaper",
    name: "Retire the Reaper",
    desc: "The death wedge is blunted forever. The reaper blinks every time; the wedge stays on the wheel as a memorial. The talisman becomes a keepsake.",
    once: true,
  },
  {
    // THE STONE OF THE ABYSS (Josh, Sep 2026): the third thing in the light
    // is not a change to Solace but a stone, and every opener may take one.
    id: STONE_CHOICE,
    name: "Take the Stone",
    desc: "A dark stone sits in the light, cut from something that looks like the inside of a black hole, a violet glow at its heart. Nobody knows what it does. Nobody has to choose between you and it.",
    once: false,
  },
];
export const choiceById = (id: string): PandoraChoice | undefined => PANDORA_CHOICES.find((c) => c.id === id);

/** The facts a key check reads — gathered by the store, judged here. */
export interface PandoraFacts {
  vipTier: number;
  /** Earnable badges (retired ones excluded) and how many of them are earned. */
  badgesTotal: number;
  badgesEarned: number;
  /** Relics unlocked, over the registry's total and the finished game's. */
  relics: number;
}

export function keyEarned(key: PandoraKey, f: PandoraFacts): boolean {
  switch (key) {
    case "prismatic":
      return f.vipTier >= 4;
    case "brass":
      return f.badgesTotal > 0 && f.badgesEarned >= f.badgesTotal;
    case "rusted":
      return f.relics >= RUSTED_RELICS && LEVEL_RELICS.length >= RUSTED_LEVELS;
  }
}

/** The whole box: which keys are held, all three inserted, and whether a
 *  given opener may still take a given choice. */
export function canOpen(inserted: readonly PandoraKey[]): boolean {
  return PANDORA_KEYS.every((k) => inserted.includes(k));
}

export function choiceAvailable(id: string | null, taken: readonly string[]): boolean {
  if (id === null) return true; // leaving hope in the box is always allowed
  const c = choiceById(id);
  if (!c) return false;
  return !c.once || !taken.includes(id); // a repeatable choice never runs out
}
