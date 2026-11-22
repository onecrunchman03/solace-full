// HOW FAST IS THAT BODY GOING — the server's read of a player's gait, which
// every creature that hears footsteps (and the Thing Below, which feels a
// splash) decides on. Pure, so a harness can drive it with the client's real
// cadence. (Nov 2026 polish round.)
//
// WHY A WINDOW. The client sends a move only when more than 100 ms have passed
// since the last (BackroomsGame's `lastMoveSend > 100`), so frames go out every
// ~104 ms at 144 Hz and ~117 ms at 60 Hz, and the network delivers them with
// jitter and in bunches. Speed read off ONE frame (distance ÷ time since the
// last) swings with that: a 2.05 walk crossed the 2.4 sprint line on bunched
// frames, a crouch crossed the walk line, and a quiet swim read as a splash.
//
// THE READ. Distance over every frame that arrived inside the window, divided
// by the time they cover — from the arrival of the frame before the first of
// them to the arrival of the last. Two guards on that time:
//   · it is never less than GAIT_FRAME_MS per frame, however close together
//     the frames arrived: each one carries 104-117 ms of the client's motion.
//     That caps any over-read at the send interval over 110 ms (×1.06 at
//     60 Hz) whatever the network does; at 144 Hz and up a read comes out ~5%
//     low, which the lines sit well clear of. Measured over the real cadence
//     with up to 100 ms of jitter and 150-400 ms stalls: a walk never reads
//     past 2.18, a wade past 1.20, and a steady sprint never under 2.32.
//   · that floor never adds more than GAIT_BUNCH_MS over the real arrival
//     span, so a client that sends tiny frames faster than the real one can't
//     use it to make a sprint read as silence.

export interface GaitStep {
  /** When this frame arrived (ms). */
  t: number;
  /** How far it moved the body (cells). */
  d: number;
  /** Time since the frame before it arrived (ms). */
  gap: number;
}

/** The least motion time one frame stands for (between the client's 104 ms
 *  and 117 ms send intervals, nearer the fast end). */
export const GAIT_FRAME_MS = 110;
/** How much the per-frame floor may stretch the real arrival span. */
export const GAIT_BUNCH_MS = 200;
/** The window for footsteps: long enough that a send interval's jitter is a
 *  small share of it, short enough that a sprint is heard within half a second. */
export const GAIT_HEAR_MS = 500;
/** The window for the Thing Below's splash (its line is only 21% above a swim). */
export const GAIT_SWIM_MS = 1_000;
/** How long a step is kept. */
const GAIT_KEEP_MS = 1_200;

/** A sprint: faster than a walk (2.05) can read. */
export const GAIT_SPRINT_LINE = 2.4;
/** A walk: faster than a crouch (1.03) can read. */
export const GAIT_WALK_LINE = 1.15;
/** Crouched (pose 1) and no faster than this is a creep. A crouch is 1.03 and
 *  can't sprint; the margin up to here is for the read, while a body that only
 *  CLAIMS to be crouched at a full walk is still heard walking. */
export const GAIT_CROUCH_MAX = 1.5;

/** Record a frame that moved the body `d` cells, arriving at `t`, `gap` ms after the one before. */
export function gaitPush(trail: GaitStep[], t: number, d: number, gap: number): void {
  trail.push({ t, d, gap: Math.max(0, gap) });
  while (trail.length > 1 && trail[0].t <= t - GAIT_KEEP_MS) trail.shift();
}

/** The body's speed (cells/s) over the last `windowMs` of frames, as of the
 *  newest one. 0 with nothing to go on. */
export function gaitSpeed(trail: GaitStep[], windowMs: number): number {
  const n = trail.length;
  if (!n) return 0;
  const at = trail[n - 1].t;
  let first = n - 1;
  while (first > 0 && trail[first - 1].t > at - windowMs) first--;
  let dist = 0;
  for (let i = first; i < n; i++) dist += trail[i].d;
  const k = n - first;
  const span = at - (trail[first].t - trail[first].gap);
  const ms = Math.max(span, Math.min(k * GAIT_FRAME_MS, span + GAIT_BUNCH_MS));
  return ms > 0 ? dist / (ms / 1000) : 0;
}

/** When the newest frame arrived (0 with none). */
export function gaitLastAt(trail: GaitStep[] | undefined): number {
  return trail && trail.length ? trail[trail.length - 1].t : 0;
}
