// THE STONE OF THE ABYSS (Josh, Sep 2026). The third thing Pandora's Box
// offers: not a regime change, a STONE — a dark thing that looks cut from
// the same material as a black hole, with a glowing violet centre. Every
// opener who reaches for it gets one. It sits in the emoji inventory under
// its own tier, `abyss`, and nobody is told what it does.
//
// Click it and the stone speaks — a phrase in a language nobody on this
// server has heard. Say the phrase back and THE PORTAL opens: a new rail
// section that leads somewhere that is not Solace. (What is on the other
// side is the next design round; this file is the stone and the door.)
//
// THE STONE IS BOUND. It is not on any price table (unsellable to Sterling,
// unseizable by the goblins — they only take what he'd pay for), it does not
// melt, it cannot be traded, auctioned or staked, a self-revival never burns
// it, and it is the rarest thing a grave can hold, so the next generation
// always carries it out. It moves exactly one way: out of the box, into a
// hand, forever.

/** The tier the stone sits under. Nothing else lives there. */
export const ABYSS_TIER = "abyss";

export const STONE_CODE = "abyss-stone";
export const STONE_NAME = "Stone of the Abyss";
/** Served from the bundled art dir (assets/emoji) — a `git pull` deploy
 *  carries it; nothing needs copying to the server's emoji folder. */
export const STONE_FILE = "abyss/stone.png";

/** The Pandora world choice that hands the stone over. Repeatable — every
 *  opener may reach for it — unlike the two regime choices beside it. */
export const STONE_CHOICE = "take-stone";

/** THE PHRASE the stone puts in your head. Written in the tongue of the
 *  people who left the other side — the language round gives it its
 *  script; the words stay. Its intended gloss, for the lore: "The door
 *  beneath is listening. I answer from the far shore." */
export const ABYSS_PHRASE = "Vhaal'ith sorrun ke-tahl. Oveth naa'ir.";

/** The whole vocabulary of things the stone forbids, in one place. Every
 *  route that moves an emoji out of a hand asks this first. */
export const isBound = (tier: string | null | undefined): boolean => tier === ABYSS_TIER;
