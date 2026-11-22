// SOLACE SURVIVORZ — A FOOTSTEP IS A FOOT COMING DOWN. Pure; imports nothing.
//
// (Nov 12 2026 — Josh: "for every foot touching the floor, it should make a sound. I kept seeing desynced
// sounds with people walking and it sounded cluttered and didn't make any sense.")
//
// The step used to be fired at the half-way marks of the walk loop's own clock, wherever the feet were. No clip
// plants its feet at 0 and ½; a loop with two strides in it stepped half as often as its feet; a crossfade or a
// rate clamp moved it again. Now each foot is watched as it is DRAWN (after the foot lock has pinned or stepped
// it), every frame: the height of its BALL and of its ANKLE over the body's floor.
//
//   · each has its own FLOOR: the lowest it has been in the last WINDOW_S. A hard window, not a slow relax — a
//     kneel or a get-up puts the ball centimetres under where a walk plants it, and a floor that only crept back
//     up missed every landing of that foot for two seconds (measured on a live run: one foot of a jog silent).
//     The window is a whole stride of the slowest loop (the crouch walk's is 2 s): shorter, and the floor moved
//     inside one stride;
//   · the foot's height is the LOWER of the two over their floors: whichever part is nearer the ground. A crouch
//     walk lands on the heel and holds the toes up for 0.4 s; a sprint lands on the ball. Watching the ball alone
//     heard the crouch's step when the toes finally came down;
//   · lifted UP_M, it is in the air; back within DOWN_M, it has LANDED — once, and not again inside MIN_GAP_S.
//
// scripts/checks/test_survivorz_footfall.mjs plays the real walk, jog, sprint and crouch loops on real bodies
// and holds this to one sound for every landing, as it happens.

export interface FootDials { up: number; down: number }
/** the living lift their feet; the dead barely do */
export const FOOT_SURVIVOR: FootDials = { up: 0.05, down: 0.035 };
export const FOOT_ZOMBIE: FootDials = { up: 0.022, down: 0.014 };
export const FOOT_WINDOW_S = 2.2, FOOT_MIN_GAP_S = 0.14;

const RING = 128, SLOT_S = 0.025;
/** the lowest a height has been over the last WINDOW_S: a ring of SLOT_S slots, each holding the lowest of its
 *  frames (so the window is the same length at 30 frames a second and at 240) */
interface Low { t: Float32Array; y: Float32Array; n: number; at: number }
const newLow = (): Low => ({ t: new Float32Array(RING), y: new Float32Array(RING), n: 0, at: 0 });
function lowOf(L: Low, clock: number, y: number): number {
  const cur = (L.at + RING - 1) % RING;
  if (L.n && clock - L.t[cur] < SLOT_S) { if (y < L.y[cur]) L.y[cur] = y; }
  else { L.t[L.at] = clock; L.y[L.at] = y; L.at = (L.at + 1) % RING; if (L.n < RING) L.n++; }
  let floor = y;
  for (let i = 0; i < L.n; i++) if (clock - L.t[i] <= FOOT_WINDOW_S && L.y[i] < floor) floor = L.y[i];
  return floor;
}

export interface FootState {
  ball: Low; ankle: Low;
  air: boolean;
  /** the clock (s) and when this foot last landed */
  clock: number; landed: number;
  /** the foot's height over its floor this frame (the review's read-back) */
  h: number;
}
export function newFoot(): FootState { return { ball: newLow(), ankle: newLow(), air: false, clock: 0, landed: -1, h: 0 }; }

/** How far the foot is off the ground: the ball or the ankle, whichever is nearer its own floor. */
export function footHeight(f: FootState, ball: number, ankle: number, dt: number): number {
  f.clock += dt;
  const b = ball - lowOf(f.ball, f.clock, ball);
  // (a rig with no ankle to tell apart from the ball is watched by the ball alone)
  const a = Number.isFinite(ankle) && ankle !== ball ? ankle - lowOf(f.ankle, f.clock, ankle) : Infinity;
  return (f.h = Math.min(a, b));
}

/** One frame of one foot: its ball's and its ankle's height over the body's floor, and the frame's length.
 *  True on the frame it lands. */
export function footStep(f: FootState, ball: number, ankle: number, dt: number, d: FootDials = FOOT_SURVIVOR): boolean {
  if (!Number.isFinite(ball) || !(dt > 0)) return false;
  const h = footHeight(f, ball, ankle, dt);
  if (h > d.up) { f.air = true; return false; }
  if (f.air && h < d.down) {
    f.air = false;
    if (f.clock - f.landed > FOOT_MIN_GAP_S) { f.landed = f.clock; return true; }
  }
  return false;
}
