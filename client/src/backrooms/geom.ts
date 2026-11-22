// Floor and riser QUAD WINDING, kept here as pure arithmetic with no THREE
// import so it can be unit-tested outside a browser.
//
// It lives alone because getting it wrong is invisible in code review and
// catastrophic on screen: a quad wound the wrong way has its normal pointing
// away from you, gets backface-culled, and simply ISN'T THERE. Level 0 shipped
// once with every floor triangle facing down — the rooms rendered as a void
// with walls floating in it, and it read as "the carpet texture is broken"
// rather than "there is no floor", which cost two wrong fixes.
//
// The convention, once, for both:
//   · A FLOOR faces UP    → counter-clockwise seen from above (+Y normal).
//   · A RISER faces the LOWER neighbour it drops to, so the east-facing and
//     south-facing cases wind OPPOSITE ways.
// Vertices are emitted as flat triples, UVs as flat pairs, in the same order.

/** Cell corners, in the order the triangles reference them:
 *    A(x,z)  B(x+cell,z)
 *    C(x,z+cell)  D(x+cell,z+cell)
 *  Triangles A,C,B and B,C,D — both counter-clockwise from above. */
export function floorQuad(
  wx: number,
  wz: number,
  cell: number,
  h00: number,
  h10: number,
  h01: number,
  h11: number,
): { verts: number[]; uvs: number[] } {
  return {
    verts: [
      wx, h00, wz,
      wx, h01, wz + cell,
      wx + cell, h10, wz,
      wx + cell, h10, wz,
      wx, h01, wz + cell,
      wx + cell, h11, wz + cell,
    ],
    // World metres: the carpet texture is one metre, so a unit per metre tiles
    // it at life size and lines up across cell seams. (The texture therefore
    // carries no repeat of its own — see floorCanvas.)
    uvs: [
      wx, wz,
      wx, wz + cell,
      wx + cell, wz,
      wx + cell, wz,
      wx, wz + cell,
      wx + cell, wz + cell,
    ],
  };
}

/** The vertical face closing a step between two cells. `east` selects which
 *  boundary (east = the +x edge, otherwise south = the +z edge) and
 *  `towardPositive` which way the face LOOKS: at the +axis neighbour when this
 *  cell is the higher one, back at this cell when the neighbour is.
 *
 *  That second flag is the whole reason this function has two windings. The
 *  renderer walks each cell's east and south edges only — the standard trick
 *  for visiting every boundary exactly once — and used to draw a face solely
 *  when the CURRENT cell was higher, on the theory that otherwise it was "the
 *  neighbour's job". It never was: the neighbour also only looks east and
 *  south, so it never looks back. Every west-facing and north-facing drop in
 *  Level 0 therefore had no face at all, and you could see straight through
 *  the world — the long dark strips and rectangular voids Josh's geometry
 *  probe finally reported as "NOTHING — no geometry (a hole)".
 *
 *  UVs follow the WALL convention (one unit per paperU/paperV metres, keyed off
 *  world position) because a riser is papered like a wall and must match the
 *  wall it runs into.
 *
 *  Top and bottom are given PER CORNER, taken from the two cells' own corner
 *  heights (see cornerHeight). That is what makes the face exactly fill the
 *  gap: a riser built from whole-cell heights instead sticks up through the
 *  high cell's carpet wherever a corner blended downward, and leaves a slot of
 *  daylight wherever one blended up. Where the two cells agree the quad is
 *  degenerate and the caller skips it — which is precisely the case of a
 *  one-step ramp, where there is no face to draw at all. */
export function riserQuad(
  fx: number,
  fz: number,
  ex: number,
  ez: number,
  top0: number,
  top1: number,
  bottom0: number,
  bottom1: number,
  east: boolean,
  towardPositive: boolean,
  paperU: number,
  paperV: number,
): { verts: number[]; uvs: number[] } {
  const u0 = (east ? fz : fx) / paperU;
  const u1 = (east ? ez : ex) / paperU;
  const v0 = Math.max(0, top0 - bottom0) / paperV;
  const v1 = Math.max(0, top1 - bottom1) / paperV;
  const tl = [fx, top0, fz, u0, v0];
  const tr = [ex, top1, ez, u1, v1];
  const bl = [fx, bottom0, fz, u0, 0];
  const br = [ex, bottom1, ez, u1, 0];
  // Order A normals: +x on an east edge, −z on a south edge. Order B is the
  // mirror. So the winding that faces the +axis neighbour differs per edge.
  const A = [tl, tr, bl, tr, br, bl];
  const B = [tr, tl, br, tl, bl, br];
  const quad = (east ? towardPositive : !towardPositive) ? A : B;
  return {
    verts: quad.flatMap((c) => [c[0], c[1], c[2]]),
    uvs: quad.flatMap((c) => [c[3], c[4]]),
  };
}

/** CORNER CLUSTERING — the arithmetic behind WorldIndex.cornerFor, isolated
 *  here for the same reason as the winding: it is invisible in review and
 *  catastrophic on screen.
 *
 *  `heights` are the floor heights (in STEPS) of the cells meeting at one
 *  corner, `self` indexes the cell doing the asking. Two cells belong together
 *  when their floors are within one step — the climb rule — and the answer is
 *  the mean of the asking cell's group.
 *
 *  The property that matters: any two cells within a step of each other land in
 *  the same group and so get the SAME number, which is what keeps ramps
 *  watertight. Cells separated by a cliff get different numbers, which is what
 *  keeps cliffs vertical. Returns steps; the caller scales to metres. */
export function cornerHeight(heights: number[], self: number): number {
  if (!heights.length) return 0;
  const group = [self];
  for (let grew = true; grew; ) {
    grew = false;
    for (let i = 0; i < heights.length; i++) {
      if (group.includes(i)) continue;
      if (group.some((m) => Math.abs(heights[m] - heights[i]) <= 1)) {
        group.push(i);
        grew = true;
      }
    }
  }
  return group.reduce((a, i) => a + heights[i], 0) / group.length;
}

/** SOLID BLOCK SPAN — how tall to draw the box that fills a solid cell.
 *
 *  Drawing it from its OWN floor to its OWN ceiling is the obvious thing and it
 *  is wrong: a solid cell keeps whatever floor height the terrain pass gave it,
 *  which can sit metres below the open floor beside it. The box then tops out
 *  underneath the surface you walk on, and you get a dark hole at eye level
 *  where a wall should be — five of six audit seeds had them.
 *
 *  So the block spans the union of itself and every OPEN cell touching it:
 *  down to the lowest floor, up to the highest ceiling. It can never come up
 *  short, whatever the terrain did, and it costs nothing to draw a box a bit
 *  taller than needed since only its outside is ever visible. */
export function solidSpan(
  ownFloor: number,
  ownCeil: number,
  neighbours: { floor: number; ceil: number }[],
): { base: number; top: number } {
  let base = ownFloor;
  let top = ownCeil;
  for (const n of neighbours) {
    if (n.floor < base) base = n.floor;
    if (n.ceil > top) top = n.ceil;
  }
  return { base, top };
}

/** Face normal of the triangle starting at vertex `t` (0-based triangle
 *  index) in a flat vertex array. Exported for the winding tests. */
export function faceNormal(verts: number[], t: number): [number, number, number] {
  const o = t * 9;
  const ax = verts[o + 3] - verts[o];
  const ay = verts[o + 4] - verts[o + 1];
  const az = verts[o + 5] - verts[o + 2];
  const bx = verts[o + 6] - verts[o];
  const by = verts[o + 7] - verts[o + 1];
  const bz = verts[o + 8] - verts[o + 2];
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}
