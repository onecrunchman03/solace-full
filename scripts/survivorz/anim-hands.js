// SURVIVORZ: THE HANDS — a natural check for how a hand's fingers sit TOGETHER, which the
// every-joint check (anim-natural.js) can't see: it reads each finger joint on its own, and a hand
// can pass every joint and still look wrong (Josh, Oct 22 2026: "do a hand and finger validation
// to ensure that hand finger place looks natural as well"). Per frame, per hand:
//   cross   two fingers' centrelines closer than their skins allow (fingers through each other),
//           or a fingertip that has crossed over its neighbour across the hand
//   palm    a fingertip (or its last joint) sunk into the palm's own skin
//   into    a finger sunk into what the hand holds (a gun, a hammer, a syringe, a can, a board)
//   float   a hand closed on something with fingers that never touch it ("floating")
//   couple  a finger curled far differently from its neighbours (ring and pinky share tendons;
//           a straight ring between two fists is a hand no one has) — judged against the body's
//           own motion capture, like the joint check
//   tip     a fingertip bent with the middle joint straight (the last joint can't bend alone)
// Points are bone CENTRELINES; a finger's skin is HAND.r (a share of the hand's own size) round it.
import * as THREE from "three";

export const FINGERS = ["thumb", "index", "middle", "ring", "pinky"];
// sizes as shares of the index finger's length (knuckle to tip), so a small hand is judged by its own
export const HAND = {
  tipExt: 0.75,      // the fingertip past the last joint: this share of the middle segment
  // a finger's radius: MEASURED off the skin (the vertices round the middle segment, median distance
  // from the bone): Eric 1.1-1.3 cm on an 8.5 cm index, Claudia 0.8-0.9 on 6.6 — 0.135 of the length
  r: 0.135,
  cross: 1.0,        // two centrelines closer than this many radii: each finger half into the other (mocap fingers lying side by side touching read 1.1-1.2)
  order: 0.4,        // a tip past its neighbour across the hand by this many radii: crossed
  palmIn: 0.4,       // a fingertip's centre within this many radii of the palm's surface (0.6 of it in)
  into: 0.5,         // a finger's centre within this many radii of a held thing's surface (half of it in)
  float: 1.8,        // a curled finger with every point further than this many radii off the held thing
  held: 0.6,         // the thing more than this many radii off the palm-to-middle-joint line: not in the hand
  holdNear: 0.05,    // (metres) a hand whose fist is this close to a thing is holding it
};
const V = () => new THREE.Vector3();

// segment-to-segment distance (closest points between two line segments)
function segDist(p1, q1, p2, q2) {
  const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s, t;
  if (a < 1e-12 && e < 1e-12) return p1.distanceTo(p2);
  if (a < 1e-12) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
  else {
    const c = d1.dot(r);
    if (e < 1e-12) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
    else {
      const b = d1.dot(d2), den = a * e - b * b;
      s = den > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
      else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  return p1.clone().addScaledVector(d1, s).distanceTo(p2.clone().addScaledVector(d2, t));
}
const ang = (a, b) => a.angleTo(b) * 180 / Math.PI;

// the hand this moment: its frame (rigid to the hand bone, the gun's frame) and each finger's
// chain knuckle -> middle -> last joint -> tip. at(name) gives a bone's world position or null.
export function handNow(at, side) {
  const o = at("hand_" + side), m1 = at("middle_01_" + side), i1 = at("index_01_" + side), p1 = at("pinky_01_" + side);
  if (!o || !m1 || !i1 || !p1) return null;
  const f = m1.clone().sub(o).normalize(), across = i1.clone().sub(p1);
  const p = (side === "r" ? V().crossVectors(across, f) : V().crossVectors(f, across)); p.addScaledVector(f, -p.dot(f)).normalize();
  const u = side === "r" ? V().crossVectors(f, p) : V().crossVectors(p, f);
  const ch = {};
  for (const n of FINGERS) {
    const a = at(`${n}_01_${side}`), b = at(`${n}_02_${side}`), c = at(`${n}_03_${side}`);
    if (!a || !b || !c) continue;
    ch[n] = [a, b, c, c.clone().addScaledVector(c.clone().sub(b), HAND.tipExt)];
  }
  if (!ch.index) return null;
  const len = ch.index[0].distanceTo(ch.index[1]) + ch.index[1].distanceTo(ch.index[2]) + ch.index[2].distanceTo(ch.index[3]);
  // each finger's bends: at the knuckle (from the back of the hand's line), the middle and last joints
  const bends = {};
  for (const [n, c] of Object.entries(ch)) {
    const base = n === "thumb" ? c[1].clone().sub(c[0]) : f;
    bends[n] = [ang(base, c[1].clone().sub(c[0])), ang(c[1].clone().sub(c[0]), c[2].clone().sub(c[1])), ang(c[2].clone().sub(c[1]), c[3].clone().sub(c[2]))];
  }
  return { o, f, p, u, across: across.normalize(), ch, len, r: HAND.r * len, bends, fist: o.clone().addScaledVector(f, 0.07),
    // a point in the hand's frame: along the fingers, toward the palm (+), across (index side +)
    local: (x) => { const d = x.clone().sub(o); return [d.dot(f), d.dot(p), d.dot(across)]; },
    span: [i1.clone().sub(o).dot(across), p1.clone().sub(o).dot(across)], knuckle: m1.clone().sub(o).dot(f) };
}

// the palm's surface in the hand's frame, measured from the skin UNDER each point: the vertices
// the hand bone carries within 1.2 cm across the palm, the furthest palm-side of them. (One height
// for the whole palm read the thumb's and little finger's pads, and every real fist's fingertips,
// resting in the hollow between them, read as sunk 2 cm in.) Once per moment; null with no skin there.
export function palmSurface(hand, verts) {
  const pts = [];
  for (const v of verts) {
    const [a, pp, c] = hand.local(v);
    if (a > 0 && a < hand.knuckle && c < hand.span[0] + 0.01 && c > hand.span[1] - 0.01) pts.push([a, pp, c]);
  }
  if (pts.length < 8) return null;
  return (a, c) => { let hi = -Infinity, n = 0; for (const [x, pp, z] of pts) if ((x - a) ** 2 + (z - c) ** 2 < 0.012 ** 2) { n++; if (pp > hi) hi = pp; } return n >= 2 ? hi : null; };
}

// a held thing's signed distance (metres, < 0 inside) at a point: a list of shapes (the review
// stand-ins, anim-recipes.js PROPS) and/or a gun's voxel field (gunField below)
export function propDistance(shapes, x) {
  let d = Infinity;
  for (const s of shapes) {
    if (s.cyl || s.cone) {
      const [a, b] = s.cyl ?? s.cone, ab = b.clone().sub(a), L = ab.length(); if (L < 1e-6) continue; ab.multiplyScalar(1 / L);
      const t = x.clone().sub(a).dot(ab), rad = s.cone ? s.r * (1 - Math.min(1, Math.max(0, t / L))) : s.r;
      const radial = x.clone().sub(a).addScaledVector(ab, -t).length() - rad, axial = Math.max(-t, t - L);
      d = Math.min(d, radial > 0 && axial > 0 ? Math.hypot(radial, axial) : Math.max(radial, axial));
    } else if (s.box) {
      const xx = s.x.clone().normalize(), yy = s.y.clone().addScaledVector(xx, -s.y.dot(xx)).normalize(), zz = V().crossVectors(xx, yy);
      const r = x.clone().sub(s.box), q = [Math.abs(r.dot(xx)) - s.size[0] / 2, Math.abs(r.dot(yy)) - s.size[1] / 2, Math.abs(r.dot(zz)) - s.size[2] / 2];
      const out = Math.hypot(...q.map((v) => Math.max(0, v))), inn = Math.min(0, Math.max(...q));
      d = Math.min(d, out + inn);
    } else if (s.sphere) d = Math.min(d, x.distanceTo(s.sphere) - s.r);
    else if (s.field) d = Math.min(d, s.field(x));
  }
  return d;
}

// A GUN's signed distance field: the model voxelised once (4 mm) in its own frame, inside by
// counting surface crossings down each column, then a chamfer pass for the distance either way.
// root = the gun's scene (its matrix the placement), meshes its children; read it with the
// gun's CURRENT matrix, so it follows the hand.
export function gunField(root, cell = 0.004) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert(), tris = [];
  root.traverse((m) => {
    if (!m.isMesh || /shell/i.test(m.name)) return;
    const M = inv.clone().multiply(m.matrixWorld), g = m.geometry, pos = g.attributes.position, idx = g.index;
    const n = idx ? idx.count : pos.count, P = (k) => V().fromBufferAttribute(pos, idx ? idx.getX(k) : k).applyMatrix4(M);
    for (let k = 0; k < n; k += 3) tris.push([P(k), P(k + 1), P(k + 2)]);
  });
  const box = new THREE.Box3(); for (const t of tris) for (const p of t) box.expandByPoint(p);
  box.expandByScalar(0.03);
  const nx = Math.ceil((box.max.x - box.min.x) / cell), ny = Math.ceil((box.max.y - box.min.y) / cell), nz = Math.ceil((box.max.z - box.min.z) / cell);
  const inside = new Uint8Array(nx * ny * nz), I = (i, j, k) => (k * ny + j) * nx + i;
  // the columns run along the gun's longest axis... any axis works: crossings along +z
  const buckets = new Map();   // tris by the (i, j) columns their xy box covers
  tris.forEach((t, ti) => {
    const i0 = Math.floor((Math.min(t[0].x, t[1].x, t[2].x) - box.min.x) / cell), i1 = Math.floor((Math.max(t[0].x, t[1].x, t[2].x) - box.min.x) / cell);
    const j0 = Math.floor((Math.min(t[0].y, t[1].y, t[2].y) - box.min.y) / cell), j1 = Math.floor((Math.max(t[0].y, t[1].y, t[2].y) - box.min.y) / cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const key = j * nx + i; (buckets.get(key) ?? buckets.set(key, []).get(key)).push(ti); }
  });
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const list = buckets.get(j * nx + i); if (!list) continue;
    const x = box.min.x + (i + 0.5) * cell, y = box.min.y + (j + 0.5) * cell, zs = [];
    for (const ti of list) {
      const [a, b, c] = tris[ti];
      // the column's crossing with the triangle (barycentric in xy)
      const d = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y); if (Math.abs(d) < 1e-14) continue;
      const w1 = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / d, w2 = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / d, w3 = 1 - w1 - w2;
      if (w1 < 0 || w2 < 0 || w3 < 0) continue;
      zs.push(w1 * a.z + w2 * b.z + w3 * c.z);
    }
    zs.sort((p, q) => p - q);
    // (welded seams make a crossing twice: drop near-duplicates before reading inside/outside)
    const z2 = zs.filter((z, k) => k === 0 || z - zs[k - 1] > cell * 0.1);
    for (let q = 0; q + 1 < z2.length; q += 2) {
      const k0 = Math.max(0, Math.ceil((z2[q] - box.min.z) / cell - 0.5)), k1 = Math.min(nz - 1, Math.floor((z2[q + 1] - box.min.z) / cell - 0.5));
      for (let k = k0; k <= k1; k++) inside[I(i, j, k)] = 1;
    }
  }
  // SOLID TO A HAND: a handguard is a slotted tube and a pump a sleeve, hollow inside, and the hand
  // checks' "held" (is there gun between the palm and the fingers?) landed in the hollow of every
  // rifle's handguard. Each slice across the bore is filled: gaps up to ~1.6 cm closed (grown by 2
  // cells), what the outside can't reach filled, and shrunk back by 2 to the true outline
  {
    const grow = (src, n, val) => { let a = src; for (let it = 0; it < n; it++) { const b = a.slice(); for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { if (a[I(i, j, k)] === val) continue; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < nx && jj < ny && a[I(ii, jj, k)] === val) { b[I(i, j, k)] = val; break; } } } a = b; } return a; };
    const closed = grow(inside, 2, 1), filled = new Uint8Array(nx * ny * nz).fill(1);
    for (let k = 0; k < nz; k++) {
      const q = []; const out = (i, j) => { const id = I(i, j, k); if (!closed[id] && filled[id]) { filled[id] = 0; q.push(i, j); } };
      for (let i = 0; i < nx; i++) { out(i, 0); out(i, ny - 1); } for (let j = 0; j < ny; j++) { out(0, j); out(nx - 1, j); }
      while (q.length) { const j = q.pop(), i = q.pop(); for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < nx && jj < ny) out(ii, jj); } }
    }
    const solid = grow(filled, 2, 0);
    for (let id = 0; id < inside.length; id++) if (solid[id]) inside[id] = 1;
  }
  // chamfer distance to the nearest voxel of the other kind, both ways (two passes, 26-neighbours)
  const dist = new Float32Array(nx * ny * nz).fill(1e9);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const me = inside[I(i, j, k)];
    for (const [a, b, c] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) { const ii = i + a, jj = j + b, kk = k + c; if (ii < nx && jj < ny && kk < nz && inside[I(ii, jj, kk)] !== me) { dist[I(i, j, k)] = 0.5; } }
    for (const [a, b, c] of [[-1, 0, 0], [0, -1, 0], [0, 0, -1]]) { const ii = i + a, jj = j + b, kk = k + c; if (ii >= 0 && jj >= 0 && kk >= 0 && inside[I(ii, jj, kk)] !== me) { dist[I(i, j, k)] = 0.5; } }
  }
  const nb = []; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) if (a || b || c) nb.push([a, b, c, Math.hypot(a, b, c)]);
  const fwd = nb.filter(([a, b, c]) => c < 0 || (c === 0 && (b < 0 || (b === 0 && a < 0)))), bwd = nb.filter((x) => !fwd.includes(x));
  const pass = (order, set) => {
    for (const [i, j, k] of order()) {
      const id = I(i, j, k); let best = dist[id];
      for (const [a, b, c, w] of set) { const ii = i + a, jj = j + b, kk = k + c; if (ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj >= ny || kk >= nz) continue; const id2 = I(ii, jj, kk); if (inside[id2] === inside[id]) best = Math.min(best, dist[id2] + w); }
      dist[id] = best;
    }
  };
  pass(function* () { for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) yield [i, j, k]; }, fwd);
  pass(function* () { for (let k = nz - 1; k >= 0; k--) for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) yield [i, j, k]; }, bwd);
  const field = (x) => {
    const l = x.clone().applyMatrix4(root.matrixWorld.clone().invert());
    const i = Math.floor((l.x - box.min.x) / cell), j = Math.floor((l.y - box.min.y) / cell), k = Math.floor((l.z - box.min.z) / cell);
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) {   // outside the grid: at least the box's distance
      const c = l.clone().clamp(box.min, box.max); return Math.max(0.03, c.distanceTo(l));
    }
    const id = I(i, j, k); return (inside[id] ? -1 : 1) * dist[id] * cell;
  };
  return { field, cells: nx * ny * nz, tris: tris.length };
}

// ONE MOMENT's findings for one hand. shapes = what's held this moment (propDistance's list).
// holds: whether this hand is meant to hold what is near it (a pistol's support hand cups the
// shooting hand, not the gun)
export function handFindings(hand, palm, shapes, holds = true) {
  const out = [], R = hand.r, ch = hand.ch;
  // CROSS: neighbouring fingers (the thumb against the index and middle) past their skins; only
  // the middle and last segments and the tip (the knuckles sit side by side by build)
  const pairs = [["index", "middle"], ["middle", "ring"], ["ring", "pinky"], ["thumb", "index"], ["thumb", "middle"], ["index", "ring"], ["middle", "pinky"]];
  for (const [a, b] of pairs) {
    if (!ch[a] || !ch[b]) continue;
    let d = Infinity;
    for (let s = a === "thumb" ? 1 : 1; s < 3; s++) for (let t = 1; t < 3; t++) d = Math.min(d, segDist(ch[a][s], ch[a][s + 1], ch[b][t], ch[b][t + 1]));
    if (d < HAND.cross * R) out.push({ k: `cross:${a}-${b}`, v: (2 * R - d) / R });   // (as overlap: radii of skin through skin)
  }
  // ORDER: across the hand the tips run index, middle, ring, pinky; one past its neighbour has crossed over it
  const order = ["index", "middle", "ring", "pinky"].filter((n) => ch[n]).map((n) => [n, hand.local(ch[n][3])[2]]);
  for (let k = 0; k + 1 < order.length; k++) if (order[k + 1][1] - order[k][1] > HAND.order * R) out.push({ k: `order:${order[k][0]}-${order[k + 1][0]}`, v: (order[k + 1][1] - order[k][1]) / R });
  // PALM: a fingertip or last joint inside the palm's skin, over the palm itself
  if (palm != null) for (const n of ["index", "middle", "ring", "pinky", "thumb"]) {
    if (!ch[n]) continue;
    for (const q of [2, 3]) {
      const [a, pp, c] = hand.local(ch[n][q]);
      if (!(a > 0.15 * hand.knuckle && a < 0.95 * hand.knuckle && c < hand.span[0] + R && c > hand.span[1] - R && pp > -2 * R)) continue;
      const surf = palm(a, c);
      if (surf != null && pp < surf + HAND.palmIn * R) out.push({ k: `palm:${n}`, v: (surf + R - pp) / R });
    }
  }
  // what's held: INTO it, or FLOATING off it, or NOT IN THE HAND at all
  if (shapes?.length && propDistance(shapes, hand.fist) < HAND.holdNear) {
    // HELD: a hand round something has it between the palm and the fingers. The point midway from
    // the palm's skin (under the middle finger, near its knuckle) to the middle finger's middle
    // joint is inside the thing; a fist made beside it (the hammer, the crowbar, a rifle's
    // support hand, Oct 22 2026) leaves it outside
    if (holds && ch.middle && palm) {
      const m1 = hand.local(ch.middle[0]), a = 0.85 * hand.knuckle, surf = palm(a, m1[2]);
      if (surf != null) {
        const P = hand.o.clone().addScaledVector(hand.f, a).addScaledVector(hand.p, surf).addScaledVector(hand.across, m1[2]);
        const chan = P.lerp(ch.middle[1], 0.5), sd = propDistance(shapes, chan);
        // (past HALF A FINGER: a hand cradling a rifle's handguard has the palm's pad between them, and
        // the point midway to the middle joint passes 5 mm under it with the fingers round the far side
        // — read at zero, every support hand on every rifle "held nothing")
        if (sd > HAND.held * R) out.push({ k: "held", v: sd / R });
      }
    }
    for (const n of FINGERS) {
      if (!ch[n]) continue;
      let lo = Infinity;
      for (let s = n === "thumb" ? 1 : 0; s < 3; s++) for (const w of [0, 0.5, 1]) lo = Math.min(lo, propDistance(shapes, ch[n][s].clone().lerp(ch[n][s + 1], w)));
      if (lo < HAND.into * R) out.push({ k: `into:${n}`, v: (R - lo) / R });
      const curled = hand.bends[n][1] > 35;
      if (holds && n !== "thumb" && curled && lo > HAND.float * R) out.push({ k: `float:${n}`, v: lo / R });
    }
  }
  // TIP: the last joint bent with the middle straight (they move together in a real finger)
  for (const n of ["index", "middle", "ring", "pinky"]) if (ch[n] && hand.bends[n][2] > 40 && hand.bends[n][1] < 12) out.push({ k: `tip:${n}`, v: hand.bends[n][2] - hand.bends[n][1] });
  return out;
}
// each finger's whole curl (knuckle + middle + last joint), for COUPLE: judged against the baseline
export const curls = (hand) => Object.fromEntries(Object.entries(hand.bends).map(([n, b]) => [n, b[0] + b[1] + b[2]]));
export const COUPLE_PAIRS = [["middle", "ring"], ["ring", "pinky"], ["index", "middle"]];

// THE GRIP CHANNEL (Oct 22 2026): where a held thing's middle sits in a hand — in front of the palm's
// SKIN by the thing's radius, under the middle finger, at the knuckles' crease.
// Measured once per body and hand from the skin (palms differ: the skin stood 2.0 cm off Eric's hand
// bone and 2.7 off Claudia's, a third of her hand's length) and kept in the hand's rigid frame
// (anim-recipes.js handRigid: f fingers, p palm, u thumb side). Every hold used to be placed on the
// fist's middle in the KNUCKLES, and a full fist closed in front of it: the hammer's handle, the
// crowbar and a rifle's handguard all lay outside the fingers, against the knuckles.
// R = handRigid(at, side); verts = the skin the hand bone carries, world positions
export function gripCal(at, side, verts, R) {
  const hand = handNow(at, side); if (!hand) return null;
  const palm = palmSurface(hand, verts); if (!palm) return null;
  // (at the knuckles' crease, where a handle lies and the fingers close round it: three-quarters
  // down the palm left the handle short of the fingers, which closed in front of it)
  const a = 0.92 * hand.knuckle, m1 = at("middle_01_" + side), c = hand.local(m1)[2];
  const d = palm(a, c) ?? palm(0.8 * hand.knuckle, c); if (d == null) return null;
  return { f: +a.toFixed(4), p: +d.toFixed(4), u: +m1.clone().sub(R.o).dot(R.u).toFixed(4), r: +hand.r.toFixed(4) };
}
// a finger's points for touching: its middle and last segments and the tip, sampled
export function fingerPoints(ch) { const out = []; for (let s = 0; s < 3; s++) for (const w of [0, 0.5, 1]) out.push(ch[s].clone().lerp(ch[s + 1], w)); return out; }
// the signed distance to a capsule (a bar, a handle): along `dir` from a to b, radius r
export function capsule(a, b, r) {
  const ab = b.clone().sub(a), L2 = ab.lengthSq();
  return (x) => { const t = L2 > 0 ? Math.min(1, Math.max(0, x.clone().sub(a).dot(ab) / L2)) : 0; return x.distanceTo(a.clone().addScaledVector(ab, t)) - r; };
}

// A GUN'S SEAT in the hand (Oct 22 2026): where its grip's thickest part is, so it can sit in the
// grip channel. The three guns' grips differ — a pistol grip, the carbine's, the shotgun's stock
// wrist, which runs flatter and higher — and one fixed seat left the shotgun above the hand with the
// fingers curling under it. Searched in the hand's own frame (f, p, u) from the fist's middle: the
// shift of the gun that puts the most gun round the channel point, then pinned there — a SMALL shift,
// mostly toward the palm, round where the gun's grip was authored: left free, the shotgun slid 5 cm
// across the hand to put its thick receiver in the palm instead of the stock's wrist. pose(o) places
// the gun with its origin at o (anim-recipes.js gunPose); field the gun's gunField.
export function gunSeat(field, R, pose, hold, chan) {
  let best = null;
  // (the bar runs the way a handle crosses the palm in a power grip, along its crease: from the heel
  // on the little finger's side, near the wrist, to the index finger's base — the thumb side, 20
  // degrees toward the fingers. cal.json's standard seat holds the grip on that line)
  const bar = R.u.clone().multiplyScalar(Math.cos(20 * Math.PI / 180)).addScaledVector(R.f, Math.sin(20 * Math.PI / 180)).normalize();
  // (and a DEEP grip — a pistol grip runs 5 cm front to back along the palm — has its front strap
  // AT the knuckles, the back strap in the web of the thumb: centred on the channel, the carbine's
  // front strap stood 2 cm past the knuckles and the fingers caught only its corner, their tips off
  // its far side. So the gun is read a little toward the wrist from the channel too, and any of it
  // standing out past the knuckles costs)
  const knuckle = (R.cal?.f ?? 0.092) / 0.92, front = chan.clone().addScaledVector(R.f, knuckle - (R.cal?.f ?? 0.092) + 0.006);
  const palmPts = []; for (const fk of [0.35, 0.55, 0.75, 0.95]) for (const uk of [-0.025, 0, 0.025]) palmPts.push(R.o.clone().addScaledVector(R.f, fk * knuckle).addScaledVector(R.p, (R.cal?.p ?? 0.02) - 0.006).addScaledVector(R.u, (R.cal?.u ?? 0) + uk));
  for (let a = -0.05; a <= 0.03 + 1e-9; a += 0.005) for (let b = -0.02; b <= 0.05 + 1e-9; b += 0.005) for (let c = -0.02; c <= 0.02 + 1e-9; c += 0.005) {
    const o = R.fist.clone().addScaledVector(R.f, a).addScaledVector(R.p, b).addScaledVector(R.u, c), G = pose(o);
    field.root.matrix.makeBasis(G.X, G.Y, G.Z).setPosition(G.o); field.root.matrixWorld.copy(field.root.matrix);
    // the gun round the channel: its depth there, and a short way along the hand's thumb side either
    // way (a grip is a bar through the hand), a little preferring the smaller shift
    let d = 0; for (const back of [0, -0.02]) for (const k of [0, -0.02, 0.02]) d += field.field(chan.clone().addScaledVector(R.f, back).addScaledVector(bar, k)); d /= 6;
    const past = [0, -0.02, 0.02].reduce((m, k) => Math.max(m, -field.field(front.clone().addScaledVector(bar, k))), 0);
    // (and off the THUMB's base: seated for the grip alone, the receiver sat where Carla's thumb is,
    // a centimetre deep, and the thumb couldn't swing clear without leaving its own range. R.cal.avoid:
    // the thumb's joints at rest, in the hand's frame, with its radius — measured by both pages alike)
    let pen = 0; for (const q of R.cal?.avoid ?? []) pen += Math.max(0, q.r - field.field(R.o.clone().addScaledVector(R.f, q.f).addScaledVector(R.p, q.p).addScaledVector(R.u, q.u)));
    // (and never THROUGH the hand: kept off the thumb alone, the shotgun's stock slid down through
    // Carla's palm and her knuckles sat inside the wood. Points just under the palm's skin stay clear)
    for (const pt of palmPts) pen += Math.max(0, 0.004 - field.field(pt));
    const score = d + 0.6 * past + 2 * pen + 0.08 * Math.hypot(a, b, c);   // (the thumb weighs heavily: a grip a little off centre beats a thumb in the receiver)
    if (!best || score < best.score) best = { score, s: [a, b, c] };
  }
  return best.s.map((v) => +v.toFixed(3));
}

// the THUMB's joints at rest in the hand's rigid frame, for a gun's seat to keep clear of (gunSeat)
export function thumbAvoid(at, side, R, r) {
  const out = [];
  // (its BASE only — the bone from the wrist joint to the knuckle, which moves little: at rest the rest of
  // the thumb sticks out across where a grip belongs, and keeping it clear pushed the gun out of the hand)
  const pts = [1, 2].map((k) => at(`thumb_0${k}_${side}`)).filter(Boolean);
  for (let k = 0; k + 1 < pts.length; k++) for (const w of [0, 0.5, 1]) { const x = pts[k].clone().lerp(pts[k + 1], w), d = x.clone().sub(R.o); out.push({ f: d.dot(R.f), p: d.dot(R.p), u: d.dot(R.u), r }); }
  return out;
}
