// DRINK, AS ANIMATION — which locomotion clip a body plays once it's had a few.
//
// Its own module (no THREE, no DOM) for the same reason spin.ts and wheel37.ts
// are: three separate bodies read this table — your first-person rig, your
// stand-in at a table shot, and every peer on the floor — and a harness has to
// be able to read it too. One table, or they drift.

/** Sober state → its drunk twin. Anything ABSENT stays sober on purpose:
 *  strafes, crouches, the jump, swimming and sitting. The 8-way locomotion set
 *  exists so feet match the direction of travel, and a forward stagger played
 *  while sidestepping breaks that harder than the drink sells it. */
export const DRUNK_OF: Record<string, string> = {
  idle: "drunkidle",
  walk: "drunkwalk",
  walkback: "drunkwalkback",
  run: "drunkrun",
  runback: "drunkrunback",
};

/** Every drunk state: the clip FILE it wants, and the sober state it falls
 *  back through if that file is missing. world.ts builds both its load list
 *  and its clip table straight off this, so a new drunk clip is one line here
 *  and nothing else. */
export const DRUNK_CLIPS: Record<string, { file: string; sober: string }> = {
  drunkidle: { file: "drunk-idle", sober: "idle" },
  // Josh's two alternate drunk idles. Standing at the bar is where a drunk
  // spends most of their time, so one looping idle is the pose people look at
  // longest — these are what stop it reading as a statue with a wobble.
  drunkidle2: { file: "drunk-idle2", sober: "idle" },
  drunkidle3: { file: "drunk-idle3", sober: "idle" },
  drunkwalk: { file: "drunk-walking", sober: "walk" },
  drunkwalkback: { file: "drunk-walking-back", sober: "walkback" },
  drunkrun: { file: "drunk-running", sober: "run" },
  drunkrunback: { file: "drunk-running-back", sober: "runback" },
};

/** The idles, in rotation. */
export const DRUNK_IDLES = ["drunkidle", "drunkidle2", "drunkidle3"];
/** How long a body holds one idle before shifting to another. Long enough to
 *  read as settling, short enough that standing still never looks looped. */
export const IDLE_SWAP_MS = 6500;

/** Deterministic per-body, per-window mix. No stored state anywhere: the
 *  variation is a function of the clock and the body's own salt, so a peer
 *  standing at the bar varies without a single extra byte on the wire, and a
 *  harness can check the rotation without a rig. */
function mix(a: number, b: number): number {
  let h = (a * 0x9e3779b1) ^ (b * 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  return (h ^ (h >>> 13)) >>> 0;
}

/**
 * Swap a locomotion state for its drunk twin.
 *
 * `salt` keeps two bodies standing side by side from shifting their weight on
 * the same frame (use a user id; 0 is fine for your own body). `now` is passed
 * rather than read so this stays a pure function.
 */
export function drunkState(state: string, drunk: boolean, salt = 0, now = 0): string {
  if (!drunk) return state;
  const d = DRUNK_OF[state];
  if (!d) return state;
  if (d !== "drunkidle") return d;
  // Per-body PHASE, so two people propping up the same bar don't shift their
  // weight on the same frame.
  const w = Math.floor((now + (mix(salt, 0x9e37) % IDLE_SWAP_MS)) / IDLE_SWAP_MS);
  // A Beatty walk: the index advances by ONE or TWO every window and never by
  // zero, so the pose is guaranteed to change, and the 1/2 pattern is
  // aperiodic so it never falls into a short cycle either. A plain hash was
  // the first cut and repeats a third of the time — and a repeat is
  // indistinguishable from the loop these variations exist to break.
  const n = DRUNK_IDLES.length;
  // …and a per-body OFFSET as well as a phase. A phase alone only moves when
  // a body changes pose, not which pose it changes to — two drunks would have
  // stood there playing the same idle, just switching at different moments.
  const step = w + Math.floor(w * 0.6180339887) + (mix(salt, 0x2545) % n);
  return DRUNK_IDLES[((step % n) + n) % n];
}
