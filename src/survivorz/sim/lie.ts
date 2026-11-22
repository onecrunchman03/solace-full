// SOLACE SURVIVORZ — WHICH WAY A BODY ON THE FLOOR LIES. Pure; imports nothing (the client reads it too).
//
// The show draws a survivor on the floor with one of a handful of clips (client show/stance.ts oneShotName and
// CALM_LOOPS): the fall when they go down, held while they lie still; a death clip when they die on their feet
// (which one is fixed per survivor — hashId(id) parity — since a survivor's death carries no body part); a death
// while down plays nothing and keeps the fall. MEASURED on all six survivor bodies (Nov 2026, the show's lie
// probe — every clip played to its last frame, the show paused): the hips stay on the root in every one, only
// the way the head points differs, and identically on every body. So the sim knows where a body's chest really
// is, and puts a feeder or a friend giving CPR beside it — it used to assume every body lay straight back from
// its heading, and the fall lies 129° round to one side, so kneelers knelt beside the floor.

/** the angle from a body's heading to the way its head points (radians; 0 = ahead, π = behind) — the wire's
 *  convention, facing (sin h, cos h): the head lies along (sin(h + θ), cos(h + θ)) */
export const LIE = {
  /** mx-falling-down, held: on the side, the head back and round */
  fall: -2.256,
  /** mx-pro-rifle-pack--death-from-the-front: forward onto the face */
  deathFront: -0.31,
  /** ual1-death01: straight back */
  deathPlain: Math.PI,
  /** mx-laying-breathless (the lying loop): straight back */
  lying: Math.PI,
} as const;

/** the hips to the chest, along the body (m) */
export const CHEST_M = 0.3;

/** a body's seed (the client's actor seed: which of two clips, which phase) — one function for both sides */
export function hashId(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** THE DEAD'S DEATHS, measured the same way on their bodies: mx-zombie-death falls back (the head 147° round),
 *  mx-zombie-dying forward (29°). Which one: a feeder topples back off the body (death); the rest by seed parity,
 *  as show/stance.ts picks — odd dying, even death. */
export const ZLIE = { death: 2.571, dying: 0.511 } as const;
export function zombieDeathLie(id: string, feeding: boolean): number { return feeding ? ZLIE.death : hashId(id) % 2 ? ZLIE.dying : ZLIE.death; }

/** NOT INTO THE WALL (realism round 8): a body falling beside a wall or a desk would lay its head and chest inside
 *  it. The heading it falls from turns — as little as it can, either way — until the head (HEAD_M along the body)
 *  and the chest land on floor a body can lie on. `open` says whether a point is open floor. */
export const HEAD_M = 0.6;
export function layHeading(x: number, z: number, h: number, lie: number, open: (x: number, z: number) => boolean): number {
  const fits = (hh: number) => {
    const g = hh + lie, ux = Math.sin(g), uz = Math.cos(g);
    return open(x + ux * CHEST_M, z + uz * CHEST_M) && open(x + ux * HEAD_M, z + uz * HEAD_M);
  };
  if (fits(h)) return h;
  for (let k = 1; k <= 12; k++) for (const sg of [1, -1]) { const hh = h + sg * k * (Math.PI / 12); if (fits(hh)) return hh; }
  return h;
}

/** the death clip a survivor dies standing with (show/stance.ts: seed % 2 ? from-the-front : death01) */
export function deathLie(id: string): number { return hashId(id) % 2 ? LIE.deathFront : LIE.deathPlain; }

/** A FEEDER'S MOUTH (the show's mx-zombie-biting-ground, measured): 0.40 m ahead of its root, 0.42 m to its right
 *  (side = (cos h, -sin h)) — and the places it goes on a body, along it from the hips (toward the head +): the
 *  chest, the hips, the thighs, the shins, each from either side. The sim stands feeders by this and the show
 *  snaps them to the nearest one, so the two agree. */
export const FEED_MOUTH: [number, number] = [0.4, -0.42];
export const FEED_ALONG = [CHEST_M, 0, -0.4, -0.75] as const;
/** A BODY PROPPED UP (Nov 13 2026, watched: a feeder knelt with its head inside a downed man's chest). One who is
 *  down sits on the floor leaning back on their hands (the fall, held), and one who dies there stays so: the chest
 *  and belly are OVER the hips, not along the floor from them, so the chest and hip places put a kneeling head
 *  through the torso. The legs only: the thighs, the shins, the feet. */
export const FEED_ALONG_PROPPED = [-0.4, -0.75, -1.05] as const;
/** every place a feeder's root can stand to eat body b: root, facing, mouth (`propped`: the body sits up) */
export function feedPlaces(b: { x: number; z: number; h: number; lie?: number }, propped = false): { x: number; z: number; h: number; mx: number; mz: number }[] {
  const g = b.h + (b.lie ?? LIE.lying), ux = Math.sin(g), uz = Math.cos(g), nx = uz, nz = -ux;
  const out: { x: number; z: number; h: number; mx: number; mz: number }[] = [];
  for (const a of propped ? FEED_ALONG_PROPPED : FEED_ALONG) for (const sg of [1, -1]) {
    const mx = b.x + ux * a, mz = b.z + uz * a;
    const fx = -sg * nx, fz = -sg * nz, h = Math.atan2(fx, fz), sx = Math.cos(h), sz = -Math.sin(h);
    out.push({ x: mx - fx * FEED_MOUTH[0] - sx * FEED_MOUTH[1], z: mz - fz * FEED_MOUTH[0] - sz * FEED_MOUTH[1], h, mx, mz });
  }
  return out;
}

/** the way a body on the floor points its head, and its chest (world x, z) */
export function lieOf(b: { x: number; z: number; h: number; lie?: number }): { ux: number; uz: number; cx: number; cz: number } {
  const g = b.h + (b.lie ?? LIE.lying);
  const ux = Math.sin(g), uz = Math.cos(g);
  return { ux, uz, cx: b.x + ux * CHEST_M, cz: b.z + uz * CHEST_M };
}
