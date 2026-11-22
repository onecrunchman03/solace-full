// THE JUMBOTRON IS A FIXTURE, NOT A STICKER (Josh, Aug 2026: "when
// intoxicated the screen moves out of place behind the wall like its part of
// the users pov than an actual fixture on the wall").
//
// The racing board is real DOM sitting BEHIND the canvas, seen through a hole
// the hall punches in the rendered frame. The post passes warp that frame, so
// the hole swims with the wall while the board underneath stays nailed to the
// glass — the picture slides out of its own frame. A DOM layer can't go
// through a fragment shader, so the board is instead MOVED to wherever the
// warp has just put its hole: `jumboWarp` replays the shaders' own
// displacement maths in JS at the board's projected position.
//
// What this pins, in the order it can hurt:
//  1. SOBER IS EXACTLY IDENTITY. No drink, no drugs ⇒ zero offset, scale 1 —
//     the common case must never nudge the screen by a fraction of a pixel.
//  2. EVERY SUBSTANCE MOVES IT. Each pass on its own produces a real
//     displacement (or a real magnification), because a pass that warps the
//     wall and not the screen is the entire bug.
//  3. IT SCALES WITH THE DOSE, and stays sane: bounded, finite, never
//     inverted, never a division by ~zero at full ego.
//  4. THE BEND IS A FIELD. A screen at the edge of vision must swim
//     differently from one dead ahead — a constant offset would be wrong.

import { jumboWarp } from "../../client/src/casino/jumbo-warp.ts";

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };

const SOBER = { drunk: 0, bend: 0, fear: 0, gas: 0, ego: 0, t: 0 };
const at = (o, t = 3.7) => ({ ...SOBER, ...o, t });
/** How far the board is pushed, in uv. */
const mag = (r) => Math.hypot(r.dx, r.dy);

// ---- 1. SOBER IS EXACTLY IDENTITY --------------------------------------------
{
  for (const t of [0, 1.3, 60, 3600, 86_400]) {
    const r = jumboWarp({ ...SOBER, t }, 0.5, 0.35);
    if (r.dx !== 0 || r.dy !== 0 || r.scale !== 1) {
      ok(false, `sober is identity at t=${t}`);
      break;
    }
  }
  ok(true, "a sober room never moves the screen by so much as a fraction of a pixel (5 clocks)");
  // …at every position on screen, not just the middle.
  let drift = 0;
  for (let ux = 0; ux <= 1.001; ux += 0.1) {
    for (let uy = 0; uy <= 1.001; uy += 0.1) {
      const r = jumboWarp(SOBER, ux, uy);
      if (r.dx !== 0 || r.dy !== 0 || r.scale !== 1) drift++;
    }
  }
  ok(drift === 0, "…anywhere on the glass (121 positions)");
}

// ---- 2. EVERY SUBSTANCE MOVES IT ---------------------------------------------
{
  ok(mag(jumboWarp(at({ drunk: 1 }), 0.5, 0.35)) > 0, "drink sways the screen with the wall");
  ok(mag(jumboWarp(at({ bend: 1 }), 0.5, 0.35)) > 0, "slorp's bend carries it too");
  ok(mag(jumboWarp(at({ fear: 1 }), 0.5, 0.35)) > 0, "…and stage three's tremor");
  ok(mag(jumboWarp(at({ gas: 1 }), 0.5, 0.35)) > 0, "star dust's doom shake rattles it with the room");
  const ego = jumboWarp(at({ ego: 1 }), 0.5, 0.35);
  ok(ego.scale > 1.05, `ego's fisheye magnifies it like everything else (${ego.scale.toFixed(3)}×)`);
  // The gas shake is the loudest of them, by design — it's a countdown.
  ok(mag(jumboWarp(at({ gas: 1 }), 0.5, 0.35)) > mag(jumboWarp(at({ fear: 1 }), 0.5, 0.35)),
    "…and it shakes harder than slorp's tremor, as the shaders do");
}

// ---- 3. DOSE-SCALED, AND ALWAYS SANE -----------------------------------------
{
  // Drink: the sway is linear in uK, so half the dose is half the push.
  const full = mag(jumboWarp(at({ drunk: 1 }), 0.5, 0.35));
  const half = mag(jumboWarp(at({ drunk: 0.5 }), 0.5, 0.35));
  ok(Math.abs(half * 2 - full) < 1e-9, "the sway tracks the dose exactly (half is half)");

  // Ego: magnification climbs with the swell and never blows up or inverts.
  let last = 0, slips = 0, top = 0;
  for (let e = 0; e <= 1.2001; e += 0.02) {
    const s = jumboWarp(at({ ego: e }), 0.5, 0.5).scale;
    if (s < last - 1e-9) slips++;
    last = s;
    top = Math.max(top, s);
  }
  ok(slips === 0, "the ego bulge only ever grows with the swell (61 samples)");
  ok(Number.isFinite(top) && top < 3, `…and stays bounded even at the shader's ceiling (${top.toFixed(3)}×)`);

  // Nothing, anywhere, produces a non-finite or negative scale — the layer
  // would vanish or turn inside out.
  let insane = 0;
  for (let e = 0; e <= 1.2001; e += 0.05) {
    for (let b = 0; b <= 1.0001; b += 0.05) {
      for (const t of [0, 2.2, 7.9]) {
        const r = jumboWarp({ drunk: 1, bend: b, fear: 1, gas: 1, ego: e, t }, 0.5, 0.5);
        if (!Number.isFinite(r.scale) || r.scale <= 0 || !Number.isFinite(r.dx) || !Number.isFinite(r.dy)) insane++;
      }
    }
  }
  ok(insane === 0, "no combination of every drug at once ever inverts or unhinges the board (1500 states)");

  // The displacement stays small — this is a screen tracking its hole, not a
  // screen taking a walk. A tenth of the viewport would be a bug you'd see.
  let biggest = 0;
  for (let t = 0; t < 30; t += 0.05) {
    biggest = Math.max(biggest, mag(jumboWarp({ drunk: 1, bend: 1, fear: 1, gas: 1, ego: 1, t }, 0.5, 0.35)));
  }
  ok(biggest < 0.1, `everything at once still moves it under a tenth of the frame (${biggest.toFixed(4)})`);
}

// ---- 4. THE BEND IS A FIELD, NOT A CONSTANT ----------------------------------
{
  const a = jumboWarp(at({ bend: 1 }), 0.2, 0.2);
  const b = jumboWarp(at({ bend: 1 }), 0.8, 0.8);
  ok(Math.abs(a.dx - b.dx) > 1e-6 || Math.abs(a.dy - b.dy) > 1e-6,
    "a screen at the edge of vision swims differently from one dead ahead");
  // …and the ego bulge is radial: dead centre magnifies hardest.
  const mid = jumboWarp(at({ ego: 1 }), 0.5, 0.5).scale;
  const edge = jumboWarp(at({ ego: 1 }), 0.02, 0.02).scale;
  ok(mid > edge, `the fisheye is radial — the centre bulges hardest (${mid.toFixed(3)} vs ${edge.toFixed(3)})`);
  // The sway is whole-frame, so it does NOT vary by position (the drunk pass
  // offsets the entire image; only the bend is a field).
  const s1 = jumboWarp(at({ drunk: 1 }), 0.1, 0.9);
  const s2 = jumboWarp(at({ drunk: 1 }), 0.9, 0.1);
  ok(s1.dx === s2.dx && s1.dy === s2.dy, "…while drink's sway moves the whole frame as one");
}

console.log(`\n${n - bad}/${n} jumbotron warp asserts passed`);
process.exit(bad ? 1 : 0);
