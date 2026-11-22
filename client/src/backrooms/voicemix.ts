// HOW A LIVING VOICE SOUNDS AT A DISTANCE (Backrooms law 10, Oct 2026).
//
// The proximity graph in voicechat.ts sets four things per peer per update —
// the dry level, the room's ring, the lowpass cutoff, or silence — and the
// rule that picks them is pure arithmetic over how far away the speaker is
// and how many walls stand between. It lives here, importing NOTHING, so a
// plain Node harness (test_proximity.mjs) can hold it to the rules without a
// browser or an AudioContext. The panner still does the distance ROLLOFF
// itself; this is everything on top of it.

/** Absolute silence beyond this, in metres — the Backrooms default. The
 *  POSITION wire runs to 28 cells / 56m (net.ts NEARBY_CELLS), and audio must
 *  stay strictly inside that or a voice could exist with nowhere to put it. */
export const HARD_GATE_M = 48;

/** What one peer's chain should be set to. */
export interface VoiceMix {
  /** Past the gate: both legs to zero, nothing else matters. */
  silent: boolean;
  /** The direct sound's level (the panner applies distance on top). */
  dry: number;
  /** How much of the voice goes to the room's reverb. */
  wet: number;
  /** The lowpass cutoff in Hz — walls and air both dull a voice. */
  cutoff: number;
}

/** Each wall's cutoff, indexed by walls between (4+ share the last). */
export const WALL_CUTOFF = [18000, 900, 420, 240, 170] as const;
/** Each wall eats this share of the level (~7dB). */
export const WALL_GAIN = 0.45;
/** The ring never takes more than this. */
export const WET_MAX = 0.75;

/**
 * @param dist     metres between speaker and listener
 * @param walls    walls between them (the client's grid walk)
 * @param hardGate the world's gate in metres (HARD_GATE_M here)
 * @param roomMix  0..1, how big and live the listener's room is
 */
export function voiceMix(dist: number, walls: number, hardGate = HARD_GATE_M, roomMix = 0): VoiceMix {
  if (!(dist <= hardGate)) return { silent: true, dry: 0, wet: 0, cutoff: 150 };
  const w = Math.max(0, Math.floor(walls));
  // Occlusion + air in one cutoff: walls dominate, distance dulls. The air
  // halves the band every quarter of the gate past the first 8m.
  const airHalfM = hardGate / 4;
  const wallCut = WALL_CUTOFF[Math.min(4, w)];
  const airCut = 18000 * Math.pow(0.5, Math.max(0, dist - 8) / airHalfM);
  const cutoff = Math.max(150, Math.min(wallCut, airCut));
  const dry = Math.pow(WALL_GAIN, w);
  // The room speaks with distance: near = dry, far = ringing — and a SMALL
  // room barely rings however far down it you are.
  const roomTerm = 0.45 + Math.max(0, Math.min(1, roomMix)) * 0.85;
  const wet = Math.min(WET_MAX, (dist / hardGate) * 0.8 * roomTerm) * Math.pow(0.6, w);
  return { silent: false, dry, wet, cutoff };
}
