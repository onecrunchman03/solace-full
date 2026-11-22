// SOLACE SURVIVORZ — WHERE THE DIRECTOR'S CAMERA STANDS for each shot. Pure (over geo.ts).
//
// The casino's camera hung from fixed security spots; the biolab is 70 rooms on three floors, so a
// spot is FOUND for each shot, in the subject's own room, and every candidate is held to two rules
// (geo.ts): it stands on walkable floor with clear floor round it (never inside a wall, a desk or a
// shelf), and it can see the subject's chest across no wall. A shot that finds no spot returns
// null and the runner falls back to the follow camera, which clamps itself into the room.
//
//   wide  — the establishing shot: a corner (or the edge of the room, or a ring round the
//           subject in a big hall), head height, a few metres off, in front of them where it can
//   close — face-on three-quarter, a long lens a couple of metres back; over the shoulder if the
//           front is a wall
//   two   — both bodies side-on (a fight, a grab: the zombie and the victim together)
//   body  — down or dead: a little above, looking down at the body
import type { Geo, GeoRoom, V3 } from "./geo";

export interface Pose { from: V3; at: V3; fov: number }

/** The lens per shot (degrees). The scene's own camera is 58. */
export const SHOT_FOV = { wide: 60, follow: 58, close: 44, two: 50, body: 46 } as const;

/** Head height for the wide shot, and the chest height a shot aims at. */
export const CAM_H = 1.8;
export const CHEST_H = 1.25;
/** a camera is kept this far inside its room's walls */
const INSET = 0.7;

const clampIn = (r: GeoRoom, v: number, lo: number, hi: number) => Math.min(hi - INSET, Math.max(lo + INSET, v));

/** OTHER BODIES (the ones the shot isn't about): a camera never stands in one, and none may stand
 *  in the line from the lens to the subject — a passer-by's back filling half the frame. */
export const BODY_CLEAR_M = 0.9;
/** the crane over a crowd round a body: how high (m over the floor; every room is 3 m or more) and how far out */
const CRANE_H = 2.65, CRANE_R = [1.9, 2.5];
export const LINE_CLEAR_M = 0.4;
/** the other bodies, asked only to keep off the lens (not off the line to the subject): the second try in a crowd
 *  (direct.ts poseFor), before a wide and long before none at all */
export function lensOnly(others: readonly V3[]): readonly V3[] { return Object.assign([...others], { lensOnly: true }); }
function bodiesClear(from: V3, at: V3, others: readonly V3[]): boolean {
  const dx = at[0] - from[0], dz = at[2] - from[2], len2 = dx * dx + dz * dz || 1;
  const loose = (others as { lensOnly?: boolean }).lensOnly === true;
  for (const o of others) {
    if (Math.abs(o[1] - at[1]) > 3) continue;
    if (Math.hypot(o[0] - from[0], o[2] - from[2]) < BODY_CLEAR_M) return false;
    if (loose) continue;
    // the nearest point of the lens→subject line (short of the subject itself) to this body
    const t = ((o[0] - from[0]) * dx + (o[2] - from[2]) * dz) / len2;
    if (t <= 0 || t >= 0.85) continue;
    if (Math.hypot(from[0] + dx * t - o[0], from[2] + dz * t - o[2]) < LINE_CLEAR_M) return false;
  }
  return true;
}

/** Can a camera stand here for a shot of `at`? (`others`: the bodies the shot isn't about) */
export function spotOk(geo: Geo, room: GeoRoom | null, from: V3, at: V3, others: readonly V3[] = []): boolean {
  if (room && !geo.inRoom(room, from[0], from[1], from[2], INSET * 0.5)) return false;
  return geo.clear(from[0], from[1], from[2]) && geo.sees(from, at) && bodiesClear(from, at, others);
}

function chestOf(geo: Geo, p: V3): V3 { return [p[0], geo.floorY(p[1]) + CHEST_H, p[2]]; }

/** THE WIDE: corners and wall midpoints of the room, plus a ring round the subject in a hall too
 *  big for the corners to read. Scored: in front of the subject (we see a face, not a back), at
 *  5–8 m, and never under 2.5 or over 15. */
export function wideShot(geo: Geo, room: GeoRoom | null, subj: V3, heading: number, others: readonly V3[] = []): Pose | null {
  const at = chestOf(geo, subj);
  const y = geo.floorY(subj[1]) + CAM_H;
  const cands: [number, number][] = [];
  if (room) {
    const { x0, x1, z0, z1 } = room;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [mx, z0], [mx, z1], [x0, mz], [x1, mz]] as [number, number][]) {
      cands.push([clampIn(room, x, x0, x1), clampIn(room, z, z0, z1)]);
    }
  }
  for (const rr of [6.5, 4.5]) for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    cands.push([subj[0] + Math.sin(a) * rr, subj[2] + Math.cos(a) * rr]);
  }
  const fx = Math.sin(heading), fz = Math.cos(heading);
  let best: Pose | null = null, bestS = -Infinity;
  for (const [x, z] of cands) {
    const d = Math.hypot(x - subj[0], z - subj[2]);
    if (d < 2.5 || d > 15) continue;
    const from: V3 = [x, y, z];
    if (!spotOk(geo, room, from, at, others)) continue;
    const front = ((x - subj[0]) * fx + (z - subj[2]) * fz) / d;   // +1 dead in front
    const s = front * 1.5 - Math.abs(d - 6.5) * 0.35;
    if (s > bestS) { bestS = s; best = { from, at, fov: SHOT_FOV.wide }; }
  }
  return best;
}

/** THE CLOSE: face-on three-quarter first (either side), then nearer to square, then over the
 *  shoulder. The camera stands back ~2.9 m on a 44° lens (head and shoulders, flatter; 2.4 m on 40° cropped heads). */
function aroundShot(geo: Geo, room: GeoRoom | null, centre: V3, aimAt: V3, heading: number, angles: number[], dist: number, lift: number, fov: number, others: readonly V3[]): Pose | null {
  for (const da of angles) {
    for (const k of [1, 0.75]) {
      const a = heading + da, r = dist * k;
      const from: V3 = [centre[0] + Math.sin(a) * r, aimAt[1] + lift, centre[2] + Math.cos(a) * r];
      if (spotOk(geo, room, from, aimAt, others)) return { from, at: aimAt, fov };
    }
  }
  return null;
}

const DEG = Math.PI / 180;
export function closeShot(geo: Geo, room: GeoRoom | null, subj: V3, heading: number, others: readonly V3[] = []): Pose | null {
  const at = chestOf(geo, subj);
  at[1] += 0.35;   // the face, not the belt (head and shoulders in the frame, never a cropped head)
  return aroundShot(geo, room, subj, at, heading, [35 * DEG, -35 * DEG, 15 * DEG, -15 * DEG, 60 * DEG, -60 * DEG, 155 * DEG, -155 * DEG], 2.9, 0.1, SHOT_FOV.close, others);
}

/** THE TWO-SHOT: side-on to the line between them, back far enough to hold both. */
export function twoShot(geo: Geo, room: GeoRoom | null, a: V3, b: V3, others: readonly V3[] = []): Pose | null {
  const mid: V3 = [(a[0] + b[0]) / 2, geo.floorY(a[1]) + CHEST_H, (a[2] + b[2]) / 2];
  const sep = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const line = Math.atan2(b[0] - a[0], b[2] - a[2]);
  const dist = Math.max(3.2, sep * 1.25 + 2);
  return aroundShot(geo, room, mid, mid, line, [90 * DEG, -90 * DEG, 65 * DEG, -65 * DEG, 115 * DEG, -115 * DEG, 40 * DEG, -40 * DEG], dist, 0.55, SHOT_FOV.two, others);
}

/** THE BODY: down or dead — a little above, looking down at them, held. */
export function bodyShot(geo: Geo, room: GeoRoom | null, subj: V3, heading: number, others: readonly V3[] = []): Pose | null {
  const fy = geo.floorY(subj[1]);
  const at: V3 = [subj[0], fy + 0.35, subj[2]];
  for (let k = 0; k < 10; k++) {
    const a = heading + 0.5 + (k / 10) * Math.PI * 2;
    for (const r of [2.4, 1.8]) {
      const from: V3 = [subj[0] + Math.sin(a) * r, fy + 1.55, subj[2] + Math.cos(a) * r];
      if (spotOk(geo, room, from, [at[0], at[1] + 0.5, at[2]], others)) return { from, at, fov: SHOT_FOV.body };
    }
  }
  // THE CRANE: none clear at eye height — friends crouched over a body, or the dead standing round one, on every
  // side, and the camera looked through their legs for the rest of the show. High and steep, looking down over
  // their heads onto the floor (the line passes over them, so only the lens is kept clear of bodies)
  for (let k = 0; k < 12; k++) {
    const a = heading + 0.5 + (k / 12) * Math.PI * 2;
    for (const r of CRANE_R) {
      const from: V3 = [subj[0] + Math.sin(a) * r, fy + CRANE_H, subj[2] + Math.cos(a) * r];
      if (spotOk(geo, room, from, [at[0], at[1] + 0.5, at[2]], lensOnly(others))) return { from, at, fov: SHOT_FOV.body + 6 };
    }
  }
  return null;
}
