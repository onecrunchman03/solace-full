// THE SLOT CABINETS (Josh, Oct 2026: "its all the same slot machine"). The
// Boulevard's sections stand different machines: the original props-pack
// cabinet, and four CC-BY models (vegas/CREDITS.txt). Everything below was
// MEASURED, not guessed — each model loaded at native size with its origin at
// its bottom-centre and its front facing +z, then front-on orthographic
// renders read off at 1px = 1mm and rays cast into the glass for depth and
// lean (the bench: assets/downloads/casino-vegas-spare/measure.html, which
// also lists every loose part with its box). All numbers are in THAT frame:
// the model's own metres, before it is scaled or turned into the hall.
//
// Pure data, no three.js, so a harness can read it.

export type CabinetKind = "classic" | "lucky" | "jackpot" | "star" | "bulb";

export interface CabinetSpec {
  /** the asset file (casino/vegas/<file>.glb) */
  file: string;
  /** native → hall: the cabinets stand about 2m tall, beside the 2.3m original */
  scale: number;
  /** the BODY's centre across the front (x) — the lever hangs off one side,
   *  so the bounding box's centre is not the machine's; the hall centres the
   *  body on its spot */
  bodyX: number;
  /** the reel screen: centre, size (metres on its own plane), lean-back (rad,
   *  top away from the player). It lies just proud of whatever was there — the
   *  model's painted or modelled reels are covered completely. */
  screen: { x: number; y: number; z: number; w: number; h: number; tilt: number };
  /** the lever: where it pivots, and which pieces swing with it. "parts"
   *  takes each loose part whose box CENTRE is inside `box`; "tris" (a model
   *  whose pieces are welded into one) takes each triangle by its centroid.
   *  It swings about its own x axis, top toward the player. */
  lever: { pivot: [number, number, number]; box: [number, number, number, number, number, number]; mode: "parts" | "tris" };
}

export const CABINET_SPECS: Record<Exclude<CabinetKind, "classic">, CabinetSpec> = {
  // "Slot_machine" by morrrtu1o. Five curved reel drums x −0.29..0.25,
  // y 0.765..0.885, bulging to z 0.128; the panel below slants out to z 0.12.
  lucky: {
    file: "slot-lucky-spin",
    scale: 1.25,
    bodyX: -0.028,
    screen: { x: -0.025, y: 0.822, z: 0.136, w: 0.57, h: 0.135, tilt: 0 },
    // rod (x .368–.389, y .709–.921) + ball (y .899–.944); the hub below stays
    lever: { pivot: [0.378, 0.71, 0.05], box: [0.33, 0.42, 0.75, 1.0, -0.1, 0.3], mode: "parts" },
  },
  // "Slot Machine" by deepakyhr. Four drums x −0.37..0.18, y 0.68..1.0, peak
  // z 0.264, inside a flat frame at z 0.27; a black fifth slot to their right.
  jackpot: {
    file: "slot-jackpot",
    scale: 1.1,
    bodyX: -0.04,
    screen: { x: -0.025, y: 0.857, z: 0.279, w: 0.75, h: 0.335, tilt: 0 },
    // mesh _4: rod (y .631–1.028) + ball (y .977–1.052); the hub (mesh _1,
    // centre y .633) stays
    lever: { pivot: [0.417, 0.645, -0.08], box: [0.37, 0.47, 0.75, 1.1, -0.2, 0.4], mode: "parts" },
  },
  // "Slot-machine" by nermin. Three drums behind a glass quad (mesh _8) that
  // leans back 10° — normal (0, 0.174, 0.985), z 0.108 at y 0.73; the frame's
  // window runs x −0.38..0.32, y 0.58..0.95.
  star: {
    file: "slot-vegas-star",
    scale: 1.15,
    bodyX: -0.03,
    screen: { x: -0.03, y: 0.765, z: 0.111, w: 0.71, h: 0.38, tilt: 0.175 },
    // rod (y .502–.849) + ball (y .809–.895); the two hubs (centre y ~.49) stay
    lever: { pivot: [0.427, 0.51, -0.055], box: [0.38, 0.48, 0.6, 0.95, -0.2, 0.2], mode: "parts" },
  },
  // "Casion slot-machine" by kritamb. ONE welded mesh (10k tris). The reel
  // recess runs x −0.385..0.205, y 0.865..1.135; the drums peak at z 0.08 and
  // the frame round them at 0.09. The lever's rod climbs from its hub
  // (y .65–.83) at x ~.39, leaning forward to the ball at y 1.35–1.5.
  bulb: {
    file: "slot-bulb-classic",
    scale: 1.1,
    bodyX: -0.113,
    screen: { x: -0.09, y: 1.0, z: 0.097, w: 0.6, h: 0.275, tilt: 0 },
    lever: { pivot: [0.39, 0.83, -0.01], box: [0.33, 0.53, 0.84, 1.56, -0.2, 0.5], mode: "tris" },
  },
};
