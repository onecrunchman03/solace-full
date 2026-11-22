// THE JUMBOTRON'S WARP TRACKER — pure, and deliberately alone.
//
// This module imports NOTHING (the slorp/stardust/ego rule) so the whole of
// it can be asserted in scripts/checks/test_jumbo_warp.mjs without a browser,
// a GPU or a clock. jumbo.svelte.ts, which owns the DOM board, cannot: it
// pulls in three, the CSS3D renderer and a Svelte component.
//
// KEEP IT IN STEP WITH THE SHADERS. The formulas below are the displacement
// halves of DRUNK_FRAG (drink.ts) and SLORP_FRAG (slorp.ts). If a pass
// changes how it moves the frame, change it here too — otherwise the screen
// drifts off its wall again, which is the exact bug this exists to fix.

/**
 * How hard each post pass is warping the frame this instant — the very same
 * numbers CasinoGame writes into the two shaders' uniforms.
 */
export interface JumboWarp {
  /** drunk uK */ drunk: number;
  /** slorp uBend */ bend: number;
  /** slorp uFear */ fear: number;
  /** star dust uGasShake */ gas: number;
  /** ego uEgo */ ego: number;
  /** uTime, seconds */ t: number;
}

/**
 * THE SCREEN IS A FIXTURE, NOT A STICKER (Josh, Aug 2026: "when intoxicated
 * the screen moves out of place behind the wall like its part of the users
 * pov than an actual fixture on the wall").
 *
 * The board is DOM behind the canvas, seen through a hole the hall punches in
 * the rendered frame. The post passes warp the FRAME — so the hole swims with
 * the wall while the board, composited underneath, stays nailed to the glass.
 * The screen slides out of its own frame; the wall moves and the picture
 * doesn't.
 *
 * A DOM layer cannot go through a fragment shader, so instead the board is
 * moved to wherever the warp has just put its hole. Every pass displaces the
 * sampled UV; this replays those exact formulas in JS at the board's own
 * screen position and returns the OFFSET (in uv) and the radial SCALE the
 * frame has applied there. Sampling at uv+d shows content from uv+d at uv, so
 * the picture appears moved by −d — hence the caller translates by −offset.
 *
 * Pure, and deliberately so: `test_jumbo_warp.mjs` asserts the whole thing
 * (sober ⇒ exactly identity, every drug ⇒ a real displacement, all monotone)
 * without a browser or a GPU. Keep it in step with DRUNK_FRAG + SLORP_FRAG.
 */
export function jumboWarp(w: JumboWarp, ux: number, uy: number): { dx: number; dy: number; scale: number } {
  let dx = 0;
  let dy = 0;
  let scale = 1;
  // EGO's fisheye runs FIRST in SLORP_FRAG, radially about screen centre.
  if (w.ego > 0.001) {
    const ex = ux - 0.5;
    const ey = uy - 0.5;
    const rE = Math.hypot(ex, ey) * 1.4142;
    const f = 1 - w.ego * 0.38 * (1 - rE * rE);
    // sampling scales the source in by f, so the picture magnifies by 1/f
    if (f > 0.05) scale /= f;
  }
  // SLORP's bend: two sine fields, then a slow breathing zoom about centre.
  if (w.bend > 0.001) {
    const b = w.bend;
    const amp = 0.022 * b;
    dx += Math.sin(uy * 8 + w.t * 0.9) * amp + Math.sin(uy * 21 - w.t * 0.5) * amp * 0.35;
    dy += Math.cos(ux * 6.5 - w.t * 0.7) * amp + Math.cos(ux * 17 + w.t * 0.6) * amp * 0.35;
    const breathe = 1 + Math.sin(w.t * 0.45) * 0.035 * b;
    if (breathe > 0.05) scale /= breathe;
  }
  // SLORP's stage-3 tremor.
  if (w.fear > 0.001) {
    const f = w.fear;
    dx += Math.sin(w.t * 37) * 0.0035 * f + Math.sin(w.t * 91) * 0.0016 * f;
    dy += Math.cos(w.t * 43) * 0.0035 * f + Math.cos(w.t * 79) * 0.0014 * f;
  }
  // STAR DUST's doom shake — bigger, on purpose.
  if (w.gas > 0.001) {
    const g = w.gas;
    dx += Math.sin(w.t * 53) * 0.011 * g + Math.sin(w.t * 97) * 0.005 * g;
    dy += Math.cos(w.t * 47) * 0.011 * g + Math.cos(w.t * 83) * 0.005 * g;
  }
  // …and the drunk pass's whole-frame sway, applied last (it runs first in
  // the chain, on the already-warped sample coordinate).
  if (w.drunk > 0.001) {
    dx += Math.sin(w.t * 0.31) * 0.004 * w.drunk;
    dy += Math.cos(w.t * 0.27) * 0.004 * w.drunk;
  }
  return { dx, dy, scale };
}
