// SURVIVORZ, GLENRIDGE HALL: EACH DOOR'S REAL OPENING, measured off the built house (the review of Nov 13 2026: seven
// leaves did not fit — one 13 cm into a wall, a 34 cm slot over the garage doors, one with its foot in a step). The
// site file gives a door's size as the plan drew it; the build's reveals, heads and sills are not always that. This
// reads the PACKED zone files, finds the shell round every door that has a leaf, and measures by rays in the door's
// own plane: the two jambs (the tightest of three heights), the head over the middle and toward each side, and the
// floor under it. What it finds is written into src/survivorz/glenridge-site.json as each door's `fit`:
//
//   fit: { w, shift, top, sill }    w: clear width between the jambs, metres · shift: how far the opening's middle
//                                   is from the plan's, along the door's `across` (the page's own: cos yaw, -sin yaw)
//                                   · top: the head over the middle, world y · sill: the floor under it, world y
//
// The page hangs the leaf in THAT opening (client/src/survivorz/show/doors.ts hangHouse). A door whose measure is
// not believable (no jamb found, or far from the plan) is left to the plan and printed.
//
//   node scripts/survivorz/glenridge/door-fit.mjs          (after walkmap.py, door-styles.mjs, floors.py AND after the
//                                                           zones are exported and packed: it reads rooms/glen-*/*.glb)
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
import { eachPrim, xf } from "./glb-read.mjs";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SITE = path.join(ROOT, "src", "survivorz", "glenridge-site.json");
const site = JSON.parse(fs.readFileSync(SITE, "utf8"));
const doors = site.doors.filter((d) => d.style && d.place);

// ---- the shell's triangles near each door ----
const REACH = 2.4, G = 4;
const boxes = doors.map((d) => { const c = d.place.centre, s = d.place.size; return [c[0] - REACH, c[1] - s[1] / 2 - 0.8, c[2] - REACH, c[0] + REACH, c[1] + s[1] / 2 + 1.6, c[2] + REACH]; });
const tris = doors.map(() => []);
const grid = new Map();
boxes.forEach((b, k) => { for (let i = Math.floor(b[0] / G); i <= Math.floor(b[3] / G); i++) for (let j = Math.floor(b[2] / G); j <= Math.floor(b[5] / G); j++) { const key = i + "," + j; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(k); } });
for (const zone of ["glen-ground", "glen-upper", "glen-basement", "glen-outside"]) {
  eachPrim(zone, ({ node, world, pos, idx }) => {
    if (!/^SHELL/.test(node)) return;
    const n = pos.length / 3, P = new Float32Array(pos.length);
    for (let i = 0; i < n; i++) { const p = xf(world, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); P[i * 3] = p[0]; P[i * 3 + 1] = p[1]; P[i * 3 + 2] = p[2]; }
    const nt = idx ? idx.length / 3 : n / 3;
    for (let t = 0; t < nt; t++) {
      const a = (idx ? idx[t * 3] : t * 3) * 3, b = (idx ? idx[t * 3 + 1] : t * 3 + 1) * 3, c = (idx ? idx[t * 3 + 2] : t * 3 + 2) * 3;
      const x0 = Math.min(P[a], P[b], P[c]), x1 = Math.max(P[a], P[b], P[c]), z0 = Math.min(P[a + 2], P[b + 2], P[c + 2]), z1 = Math.max(P[a + 2], P[b + 2], P[c + 2]);
      const y0 = Math.min(P[a + 1], P[b + 1], P[c + 1]), y1 = Math.max(P[a + 1], P[b + 1], P[c + 1]);
      const seen = new Set();
      for (let i = Math.floor(x0 / G); i <= Math.floor(x1 / G); i++) for (let j = Math.floor(z0 / G); j <= Math.floor(z1 / G); j++) for (const k of grid.get(i + "," + j) ?? []) {
        if (seen.has(k)) continue; seen.add(k);
        const B = boxes[k];
        if (x1 < B[0] || x0 > B[3] || z1 < B[2] || z0 > B[5] || y1 < B[1] || y0 > B[4]) continue;
        tris[k].push(P[a], P[a + 1], P[a + 2], P[b], P[b + 1], P[b + 2], P[c], P[c + 1], P[c + 2]);
      }
    }
  });
}
/** the first thing a ray from `o` along `dir` meets, in metres (`max` if nothing) */
function ray(T, o, dir, max) {
  let best = max;
  for (let i = 0; i < T.length; i += 9) {
    const ax = T[i], ay = T[i + 1], az = T[i + 2], e1x = T[i + 3] - ax, e1y = T[i + 4] - ay, e1z = T[i + 5] - az, e2x = T[i + 6] - ax, e2y = T[i + 7] - ay, e2z = T[i + 8] - az;
    const px = dir[1] * e2z - dir[2] * e2y, py = dir[2] * e2x - dir[0] * e2z, pz = dir[0] * e2y - dir[1] * e2x;
    const det = e1x * px + e1y * py + e1z * pz; if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det, tx = o[0] - ax, ty = o[1] - ay, tz = o[2] - az;
    const u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (dir[0] * qx + dir[1] * qy + dir[2] * qz) * inv; if (v < 0 || u + v > 1) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv; if (t > 1e-4 && t < best) best = t;
  }
  return best;
}

const r2 = (v) => +v.toFixed(3);
let fitted = 0, same = 0, left = 0; const lines = [];
doors.forEach((d, k) => {
  const T = tris[k], c = d.place.centre, [W, H] = d.place.size, n = d.place.normal;
  const yaw = Math.atan2(n[0], n[2]), ux = Math.cos(yaw), uz = -Math.sin(yaw);      // `across`, as the page hangs it
  const bottom = c[1] - H / 2;
  // the jambs: the tightest of three heights and two planes just either side of the wall's middle
  let dL = 9, dR = 9;
  for (const h of [0.3, 0.95, 1.55]) for (const off of [-0.03, 0.03]) {
    const o = [c[0] + n[0] * off, bottom + h, c[2] + n[2] * off];
    dL = Math.min(dL, ray(T, o, [-ux, 0, -uz], 1.8)); dR = Math.min(dR, ray(T, o, [ux, 0, uz], 1.8));
  }
  const w = dL + dR, shift = (dR - dL) / 2;
  // the head over the middle of what was found, and the floor under it (the higher of the two sides of the wall)
  const mx = c[0] + ux * shift, mz = c[2] + uz * shift;
  let up = 9, down = 9;
  for (const off of [-0.05, 0.05]) {
    up = Math.min(up, ray(T, [mx + n[0] * off, bottom + 1.0, mz + n[2] * off], [0, 1, 0], 3.5));
    down = Math.min(down, ray(T, [mx + n[0] * off, bottom + 0.7, mz + n[2] * off], [0, -1, 0], 1.6));
  }
  const top = bottom + 1.0 + up, sill = bottom + 0.7 - down;
  const believable = dL < 1.75 && dR < 1.75 && w >= 0.55 && w <= W + 0.35 && Math.abs(shift) <= 0.45 && up < 3.4 && top - sill >= 1.5 && top - sill <= H + 1.2 && Math.abs(sill - bottom) <= 0.45;
  if (!believable) { delete d.fit; left++; lines.push(`  left to the plan  ${d.id.padEnd(40)} jambs ${dL.toFixed(2)}/${dR.toFixed(2)} head +${up.toFixed(2)} floor ${down.toFixed(2)}`); return; }
  d.fit = { w: r2(w), shift: r2(shift), top: r2(top), sill: r2(sill) };
  const dw = w - W, dh = top - sill - H;
  if (Math.abs(dw) > 0.12 || Math.abs(shift) > 0.04 || Math.abs(dh) > 0.12 || Math.abs(sill - bottom) > 0.04) { fitted++; lines.push(`  fitted            ${d.id.padEnd(40)} ${W.toFixed(2)} x ${H.toFixed(2)} -> ${w.toFixed(2)} x ${(top - sill).toFixed(2)}, moved ${shift.toFixed(2)} across, sill ${(sill - bottom >= 0 ? "+" : "") + (sill - bottom).toFixed(2)}`); }
  else same++;
});
fs.writeFileSync(SITE, JSON.stringify(site));
console.log(lines.join("\n"));
console.log(`door fit: ${doors.length} doors with a leaf — ${same} as the plan drew them, ${fitted} fitted to the opening built, ${left} left to the plan`);
