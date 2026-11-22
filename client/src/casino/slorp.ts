// SLORP — the vial Sterling keeps under the counter (Josh, Aug 2026).
//
// "It's basically a psychedelic that triggers visual changes and
// hallucinations. It starts slow and slowly builds over the span of 10
// minutes." Three stages, verbatim from the brief:
//
//   1. the lights lift, colours arrive, and everyone's voice slides from
//      high to low
//   2. reality bends — the whole room moves in ways rooms don't. Fun.
//   3. it turns. The vision shakes, the colour curdles, you make sounds a
//      person shouldn't, and then you come apart over the carpet.
//
// WHAT IT COSTS: 1,500 silver, burned at the counter (src/shop.ts). What it
// costs you AFTER is ten seconds on the floor and a walk back from the
// entrance — the gun's deal exactly. Slorp never touches an account, a
// collection, a spin, or the Wake. It is the most expensive thing in the hall
// that gives you nothing.
//
// WHY THE SCHEDULE IS PURE FUNCTIONS: the whole feature is a clock. Everything
// downstream (three shaders' worth of uniforms, an audio pitch ramp, the wire
// stage, the explosion) is a function of elapsed time, so the timeline can be
// asserted in a harness without a GPU — see scripts/checks/test_slorp.mjs. The
// module imports NOTHING for the same reason.

/** The whole trip, from swallowing to the carpet. */
export const SLORP_MS = 600_000; // 10 minutes, Josh's number

/**
 * Where the stages cut, as fractions of the trip. Stage 1 is long because
 * "starts slow" is the whole shape of the thing; stage 2 is the LONGEST
 * because it's the fun (Josh, Aug 2026: "extend the fun parts but shorten
 * the end bad part" — the old 2:30 of dread outstayed its welcome). Four
 * minutes pleasant, five minutes strange, ONE minute going wrong — slorp is
 * fun to take, with a hilarious bad ending, not an endurance test.
 */
export const STAGE_2_AT = 0.40; // 4:00
export const STAGE_3_AT = 0.90; // 9:00 — the turn is short and hard

/**
 * How hard the pop throws the body, in the ragdoll's own units.
 *
 * MEASURED AGAINST THE GUN, which throws at 6.0 power / 4.5 reach: the first
 * cut used 3.1/1.9 and the body just crumpled — half a gunshot, for something
 * that is supposed to be a person coming apart. An explosion is not a bullet
 * though: it throws you UP and out from your own centre rather than downrange,
 * so the power goes ABOVE the gun's and the reach well below it. The body ends
 * up near where it stood, having got there badly.
 *
 * MEASURED IN THE HALL at these numbers: the body peaks at 3.99m under the
 * 5m ceiling and its lowest bone never goes below -0.04m (where this rig's toe
 * sits when it's on the carpet) — so it neither clips the ceiling nor falls
 * through the floor, which is the pair of failures a hard throw causes. Don't
 * raise them without re-measuring; layout.ts records the stage throw hitting
 * the far wall at 7.6.
 */
export const SLORP_THROW_POWER = 6.8;
export const SLORP_THROW_REACH = 2.6;

/** Peer-visible stage. 0 = not tripping (or already popped). */
export type SlorpStage = 0 | 1 | 2 | 3;

export interface SlorpPhase {
  /** 1..3 while it runs, 0 once it's over. */
  stage: SlorpStage;
  /** Progress through the whole trip, 0..1. */
  t: number;
  /** Progress through the CURRENT stage, 0..1 — what the ramps ride on. */
  s: number;
  /** Per-stage intensities, each 0..1, already eased. These are the shader's
   *  uniforms and the audio's depths; the renderer does no curve maths of its
   *  own so the curve lives in one testable place. */
  colour: number; // stage 1: brighter, saturated, hue drift
  bend: number;   // stage 2: the room moves
  fear: number;   // stage 3: shake, rot, closing in
  /** True on the tick the ten minutes are up: pop. */
  done: boolean;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Smoothstep — every ramp here eases in and out, because a linear ramp on a
 *  drug reads as a slider being dragged. */
const ease = (v: number): number => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};

/**
 * The whole program, from milliseconds since the vial went down.
 *
 * Stage intensities OVERLAP on purpose: the colour doesn't switch off when the
 * room starts bending, and the bend doesn't stop when the fear arrives — it
 * gets worse. Each one only ever ramps UP, so the ten minutes are monotonic:
 * nothing about this ever gets better.
 */
export function slorpPhase(elapsedMs: number): SlorpPhase {
  const t = clamp01(elapsedMs / SLORP_MS);
  const done = elapsedMs >= SLORP_MS;
  const stage: SlorpStage = done ? 0 : t >= STAGE_3_AT ? 3 : t >= STAGE_2_AT ? 2 : 1;
  const s =
    stage === 3 ? clamp01((t - STAGE_3_AT) / (1 - STAGE_3_AT))
    : stage === 2 ? clamp01((t - STAGE_2_AT) / (STAGE_3_AT - STAGE_2_AT))
    : clamp01(t / STAGE_2_AT);
  // Colour arrives over the first two thirds of stage 1 and then just stays —
  // by the time the room is bending, being able to see colour is normal.
  const colour = ease(t / (STAGE_2_AT * 0.66));
  // The bend starts a beat BEFORE stage 2 is announced (0.34 rather than 0.40)
  // so the stage change is something you notice having already begun, which is
  // the honest way round for a drug.
  const bend = ease((t - 0.34) / (STAGE_3_AT - 0.34));
  // The fear does not creep: stage 3 turns on hard and keeps climbing.
  const fear = ease((t - STAGE_3_AT) / ((1 - STAGE_3_AT) * 0.75));
  return { stage, t, s, colour, bend, fear, done };
}

/**
 * How everything you HEAR is pitched, as a playback-rate multiplier.
 *
 * Josh: "people sound funny like their pitch is changed. high pitch to low
 * pitch." So stage 1 is a slide: voices come up sharp and cartoonish, then sag
 * over about three minutes into something too low for a human throat, which is
 * the point at which a room of your friends stops sounding like your friends.
 * After that it never settles — it drifts on two slow, unequal waves, and in
 * stage 3 it sinks further and starts to lurch.
 */
export function slorpPitch(p: SlorpPhase, nowMs: number): number {
  if (!p.stage) return 1;
  const T = nowMs / 1000;
  // the slide, over the first 55% of stage 1
  const slide = ease(clamp01(p.t / (STAGE_2_AT * 0.55)));
  let r = 1 + (1.42 - 1) * (1 - slide) * ease(clamp01(p.t / 0.06)) - 0.30 * slide;
  // …then it wanders
  r += Math.sin(T * 0.21) * 0.05 * p.bend + Math.sin(T * 0.13) * 0.035 * p.bend;
  // …and in stage 3 it sags and lurches
  r -= 0.16 * p.fear;
  r += Math.sin(T * 1.7) * 0.05 * p.fear;
  return Math.max(0.45, Math.min(1.7, r));
}

/** How often a slorping noise escapes you, ms. Stage 3 only, and it tightens
 *  as the end comes — the room's warning that somebody is about to go. The
 *  window is one minute now, so the noises come thick from the start. */
export function slorpNoiseGap(p: SlorpPhase): number {
  if (p.stage !== 3) return 0;
  return 2600 - 1400 * p.fear;
}

/**
 * How the JUKEBOX is bent, without touching its playback rate (Josh, Aug
 * 2026): dragging the record off 1× fought the server-playhead sync — the
 * drift check yanked it back every couple of seconds and the music SKIPPED.
 * So the record keeps time and the distortion is spectral instead: a filter
 * whose cutoff breathes (the underwater wobble of the fun part, curdling
 * into a resonant honk in the fear), and a tremolo that throbs on the same
 * 4.4 rad/s heartbeat the stage-3 shader pulses on.
 *
 * Pure — cutoffHz in log-space so the sweep sounds even, everything bounded:
 * sober is EXACTLY {20000, 0.7, 1} (a wide-open filter is a wire).
 */
export function slorpMusicWarp(
  p: SlorpPhase | null,
  nowMs: number,
  scale = 1,
): { cutoffHz: number; q: number; trem: number } {
  const k = p && p.stage ? clamp01(scale) : 0;
  if (k <= 0) return { cutoffHz: 20000, q: 0.7, trem: 1 };
  const b = p!.bend * k;
  const f = p!.fear * k;
  const t = nowMs / 1000;
  // Two slow unequal breaths — the same never-in-step recipe the pitch used.
  const wob = Math.sin(t * 0.8) * 0.5 + Math.sin(t * 0.23) * 0.5;
  // Log-space cutoff: 10^4.3 ≈ 20k sober → swinging around ~2k in the bend
  // → dragged toward ~700Hz with the fear, always inside [200, 20000].
  const lg = 4.3 - 1.0 * b - 0.45 * f + wob * (0.35 * b + 0.2 * f);
  const cutoffHz = Math.max(200, Math.min(20000, Math.pow(10, lg)));
  const q = 0.7 + 2.2 * f; // the honk arrives with the dread
  // Tremolo: gentle at 2.6 rad/s while it's fun, deeper on the heartbeat
  // (4.4 — the shader's pulse) when it turns.
  const trem = Math.max(
    0.2,
    1 - 0.18 * b * (0.5 + 0.5 * Math.sin(t * 2.6)) - 0.4 * f * (0.5 + 0.5 * Math.sin(t * 4.4)),
  );
  return { cutoffHz, q, trem };
}

/** THE TRIP DOESN'T RESPECT YOUR OTHER PURCHASES (Josh, Aug 2026): while the
 *  room is bending, slorp AMPLIFIES whatever else you're on — star dust's
 *  neon and EGO's fisheye scale by up to 1.5× as the bend arrives (stage 2)
 *  and hold there through stage 3. Slorp's own clock never moves for anyone;
 *  this is a multiplier the renderer applies to the OTHER drugs' uniforms.
 *  1 exactly when there is no trip, monotone with it while there is. */
export function slorpAmp(p: SlorpPhase | null): number {
  if (!p || !p.stage) return 1;
  return 1 + 0.5 * p.bend;
}

// ---- THE PASS ---------------------------------------------------------------
// A second fullscreen pass, run AFTER the drunk one (you can be both, and a
// drunk trip should look like a drunk trip). Neither pass pays for the other:
// sober-and-straight renders directly to the canvas exactly as before, and
// whichever pass runs LAST does the sRGB encode — `uEncode`, or every mid-tone
// lands at a fifth of its brightness (the bug drink.ts already documents).

export const SLORP_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const SLORP_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tDiffuse;
  uniform float uTime;    // seconds
  uniform float uColour;  // stage 1
  uniform float uBend;    // stage 2
  uniform float uFear;    // stage 3
  uniform float uFlash;   // 0..1 the white-out at the pop
  uniform float uEncode;  // 1 = this is the last pass, apply sRGB
  // STAR DUST rides the same pass (Aug 2026) — a second drug did not earn a
  // third render target. uGas is the neon (a step per hit), uGasShake the
  // last thirty seconds. Both zero for everyone who hasn't huffed anything,
  // and the two drugs stack, because you can absolutely buy both.
  uniform float uGas;
  uniform float uGasShake;
  // …and EGO's lens (Aug 2026): the fisheye that tracks the swelling head.
  // 0 flat, 1 aquarium — it rides the swell, so sobering flattens it frame
  // by frame (Josh: "gradually returns to normal as you sober").
  uniform float uEgo;

  // Hue rotation about the luma axis (the standard YIQ spin) — cheap, and it
  // keeps whites white while everything with colour in it walks around the
  // wheel, which is what "pretty colours" looks like from the inside.
  vec3 hueRot(vec3 c, float a) {
    const vec3 k = vec3(0.57735);
    float cs = cos(a);
    return c * cs + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - cs);
  }

  void main() {
    vec2 uv = vUv;

    // ---- EGO's FISHEYE, FIRST --------------------------------------------
    // A barrel bulge about the centre of vision: centre pixels sample nearer
    // the centre (magnified — your eyes are moving apart), the edges stay
    // pinned so nothing samples off the frame. Runs before every other warp
    // so a drunk double-vision or a slorp bend distorts the ALREADY-bulged
    // world, which is the honest stacking order for a head this size.
    if (uEgo > 0.001) {
      vec2 dE = uv - 0.5;
      float rE = length(dE) * 1.4142; // 0 centre → ~1 at the corners
      uv = 0.5 + dE * (1.0 - uEgo * 0.38 * (1.0 - rE * rE));
    }

    // ---- STAGE 2: the room stops holding still --------------------------
    // Two sine fields at different scales and speeds, plus a slow breathing
    // zoom about the centre. Ramped by uBend, so at rest this is exactly uv.
    if (uBend > 0.001) {
      float b = uBend;
      float w = 0.022 * b;
      uv += vec2(
        sin(uv.y * 8.0 + uTime * 0.9) * w + sin(uv.y * 21.0 - uTime * 0.5) * w * 0.35,
        cos(uv.x * 6.5 - uTime * 0.7) * w + cos(uv.x * 17.0 + uTime * 0.6) * w * 0.35
      );
      float breathe = 1.0 + sin(uTime * 0.45) * 0.035 * b;
      uv = (uv - 0.5) * breathe + 0.5;
    }

    // ---- STAGE 3: the shake ---------------------------------------------
    // Fast, small, and irregular — three frequencies that never line up, so it
    // reads as your own eyes rather than the camera being nudged.
    if (uFear > 0.001) {
      float f = uFear;
      uv += vec2(
        sin(uTime * 37.0) * 0.0035 * f + sin(uTime * 91.0) * 0.0016 * f,
        cos(uTime * 43.0) * 0.0035 * f + cos(uTime * 79.0) * 0.0014 * f
      );
    }

    // ---- STAR DUST's DOOM SHAKE -----------------------------------------
    // "Vision starts to shake … more and more violently." Bigger than the
    // slorp fear tremor by design — this is a countdown, not a mood — and on
    // the same never-aligned multi-frequency recipe so it reads as eyes, not
    // as a camera being rattled.
    if (uGasShake > 0.001) {
      float gs = uGasShake;
      uv += vec2(
        sin(uTime * 53.0) * 0.011 * gs + sin(uTime * 97.0) * 0.005 * gs,
        cos(uTime * 47.0) * 0.011 * gs + cos(uTime * 83.0) * 0.005 * gs
      );
    }

    vec4 a = texture2D(tDiffuse, uv);
    // The jumbotron's transparent punch-through, same rule as the drunk pass:
    // where the frame has no alpha it must stay exactly transparent, or this
    // fills the hole with colour and the DOM board behind it glows.
    if (a.a < 0.01) { gl_FragColor = vec4(0.0); return; }
    vec3 col = a.rgb;

    // ---- STAGE 1: the lights lift and the colour arrives -----------------
    if (uColour > 0.001) {
      float c = uColour;
      // A radial RGB split: the further from the middle of your vision, the
      // further apart the channels sit. Doing it here rather than as three
      // taps of the whole frame keeps this to two extra samples.
      vec2 dir = (uv - 0.5);
      vec2 sp = dir * 0.005 * c * (1.0 + uBend);
      float r = texture2D(tDiffuse, uv + sp).r;
      float bl = texture2D(tDiffuse, uv - sp).b;
      col = vec3(mix(col.r, r, 0.85 * c), col.g, mix(col.b, bl, 0.85 * c));
      // Brighter, a little richer, and drifting a few degrees around the
      // wheel. THE NUMBERS ARE SMALL ON PURPOSE (Aug 2026, looked at in the
      // hall): the first cut rotated by 1.5 RADIANS and added an UNBOUNDED
      // uTime term, so the room went cyan-and-magenta within a minute and
      // kept walking — a page open for five minutes started the trip at 18
      // radians of hue. Stage one is "the lights are a little brighter and
      // you start to see pretty colours", not a filter.
      col *= 1.0 + 0.22 * c;
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(lum), col, 1.0 + 0.55 * c);
      // Bounded, and slow: ±0.30 rad ≈ ±17°, one full breath every ~27s. The
      // bend adds a second, faster wave, so the colour gets restless exactly
      // when the room does.
      col = hueRot(col, (sin(uTime * 0.23) * 0.30 + sin(uTime * 0.61) * 0.10 * uBend) * c);
    }

    // ---- STAR DUST: "the colors become more vibrant and neon" ------------
    // A per-hit step, not a timeline: saturation and brightness climb, the
    // hue BREATHES around the wheel (bounded — slorp's unbounded-uTime lesson
    // holds here too), the highlights bloom, and a radial shimmer pulls the
    // channels apart at the edges. Hit three is unmistakably a music video.
    if (uGas > 0.001) {
      float g = uGas;
      vec2 dirG = (vUv - 0.5);
      vec2 spG = dirG * 0.007 * g;
      float rG = texture2D(tDiffuse, uv + spG).r;
      float bG = texture2D(tDiffuse, uv - spG).b;
      col = vec3(mix(col.r, rG, 0.8 * g), col.g, mix(col.b, bG, 0.8 * g));
      float lumG = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(lumG), col, 1.0 + 1.15 * g);   // the saturation is the drug
      col *= 1.0 + 0.20 * g;                          // brighter, like stage lights
      col += col * col * 0.30 * g;                    // the bloom on everything shiny
      // Two unequal breaths around the wheel, faster and wider per hit:
      // ±(0.25 + 0.55·g) rad at the top, one swing every few seconds.
      col = hueRot(col, (sin(uTime * (0.5 + 0.5 * g)) * 0.55 + sin(uTime * 1.3) * 0.25) * (0.45 + 0.55 * g) * g);
    }

    // ---- STAGE 3 again: the colour curdles -------------------------------
    // Everything stage one gave you, taken back. MEASURED BY EYE, twice (Aug
    // 2026): the first cut only desaturated and lifted the reds, which made
    // the room PASTEL — stage three read as prettier than stage two, exactly
    // backwards. Dread is dark, contrasty and the wrong colour, so: bile
    // instead of gold, the shadows crushed, the whole frame dimmed, and the
    // walls closing in on a pulse you can feel.
    if (uFear > 0.001) {
      float f = uFear;
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      vec3 bile = vec3(lum * 0.58, lum * 0.80, lum * 0.42);
      col = mix(col, bile, 0.80 * f);
      // Crush the mid-shadows: the room keeps its highlights and loses
      // everything it used to show you in between.
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.7 * f);
      col *= 1.0 - 0.22 * f;
      // A heartbeat, and it is not yours — two beats, then a gap.
      float beat = sin(uTime * 4.4) * 0.6 + sin(uTime * 8.8) * 0.4;
      col *= 1.0 - 0.16 * f * (0.5 + 0.5 * beat);
      // …and the walls come in. Tighter and harder than the drunk vignette,
      // which lifts the edges rather than closing them.
      float rad = distance(vUv, vec2(0.5));
      col *= 1.0 - smoothstep(0.16, 0.78, rad) * 0.92 * f;
      // Blood at the very edge of vision, arriving late.
      float rim = smoothstep(0.52, 0.80, rad) * f * f;
      col.r += rim * 0.22;
      col.g -= rim * 0.05;
    }

    // ---- THE POP ---------------------------------------------------------
    // Not a fade: one frame of white that falls away fast, because the last
    // thing you see should be the inside of your own eyelids.
    col = mix(col, vec3(1.0, 0.94, 0.92), uFlash);

    // sRGB, but only if nothing is going to run after us.
    vec3 low = col * 12.92;
    vec3 high = 1.055 * pow(max(col, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
    vec3 enc = mix(low, high, step(vec3(0.0031308), col));
    gl_FragColor = vec4(mix(col, enc, uEncode), a.a);
  }
`;
