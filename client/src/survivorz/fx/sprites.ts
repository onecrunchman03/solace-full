// SURVIVORZ EFFECTS — the procedural sprite sheet: the small fast things code
// makes better than a sheet would (docs/survivorz/EFFECTS.md §3). Drawn white
// on a canvas and tinted per card; uploaded PREMULTIPLIED so it shares the
// flipbook layers' one blend.
import * as THREE from "three";
import type { SheetInfo } from "./particles";
import { mulberry32 } from "./rng";

/** Frame numbers on the sprite sheet. */
export const SPRITE = {
  dot: 0, // soft round glow: an ember, a flash core
  spark: 1, // a hot streak; drawn stretched along its motion
  drop: 2, // a liquid droplet: blood, water
  mote: 3, // a speck of dust in a light beam
  chip: 4, // an irregular fleck: concrete, plaster, wood
  star: 5, // a muzzle flash's star, seen side-on or end-on
  puff: 6, // a soft puff, for dust when a sheet would be wasted
  shard: 7, // a thin sliver: glass, bone
  mist: 8, // a fine spray: the cloud round a blood hit
  jet: 9, // a muzzle blast seen side-on: base at the BOTTOM of the cell, flaring up (forward)
  petal: 10, // a muzzle blast seen end-on: a bright core and lobes
  splinter: 11, // a long jagged sliver: wood
  ring: 12, // a thin ring: a ripple (drawn flat on the water)
  bubble: 13, // a bubble: a rim, a highlight, a clear middle
  streak: 14, // a running thread of water or steam condensate, long and thin
  arc: 15, // an electric arc: a forked jagged line
} as const;

const CELL = 128;
const COLS = 4;
const ROWS = 4;

export const SPRITE_SHEET: SheetInfo = { cols: COLS, rows: ROWS, frames: COLS * ROWS, aspect: 1, glow: 0 };

export function makeSpriteTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = CELL * COLS;
  c.height = CELL * ROWS;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, c.width, c.height);
  const at = (f: number) => [(f % COLS) * CELL, Math.floor(f / COLS) * CELL] as const;
  const rng = mulberry32(90210);
  const radial = (x: number, y: number, r: number, stops: [number, number][]) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    for (const [o, a] of stops) gr.addColorStop(o, `rgba(255,255,255,${a})`);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  {
    const [x, y] = at(SPRITE.dot);
    radial(x + 64, y + 64, 62, [[0, 1], [0.25, 0.85], [0.6, 0.25], [1, 0]]);
  }
  {
    // the streak: hot narrow core, soft sides, fading at both ends (the card is stretched)
    const [x, y] = at(SPRITE.spark);
    const gr = g.createLinearGradient(x, y + 64, x + 128, y + 64);
    gr.addColorStop(0, "rgba(255,255,255,0)");
    gr.addColorStop(0.4, "rgba(255,255,255,0.55)");
    gr.addColorStop(0.5, "rgba(255,255,255,1)");
    gr.addColorStop(0.6, "rgba(255,255,255,0.55)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    for (let i = 0; i < 128; i++) {
      const t = i / 127;
      g.globalAlpha = Math.pow(Math.sin(Math.PI * t), 0.6);
      g.fillStyle = gr;
      g.fillRect(x, y + i, 128, 1);
    }
    g.globalAlpha = 1;
  }
  {
    // a droplet: dense middle, a slightly brighter rim where it would catch light
    const [x, y] = at(SPRITE.drop);
    radial(x + 64, y + 64, 52, [[0, 1], [0.7, 0.95], [0.9, 0.6], [1, 0]]);
  }
  {
    const [x, y] = at(SPRITE.mote);
    radial(x + 64, y + 64, 30, [[0, 0.9], [0.5, 0.35], [1, 0]]);
  }
  {
    // an irregular chip: a jagged polygon, hard-edged
    const [x, y] = at(SPRITE.chip);
    g.fillStyle = "rgba(255,255,255,1)";
    g.beginPath();
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 30 + rng() * 26;
      const px = x + 64 + Math.cos(a) * r, py = y + 64 + Math.sin(a) * r;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
  }
  {
    // a muzzle star: a bright core and uneven spikes
    const [x, y] = at(SPRITE.star);
    radial(x + 64, y + 64, 40, [[0, 1], [0.35, 0.8], [1, 0]]);
    g.save();
    g.translate(x + 64, y + 64);
    for (let i = 0; i < 6; i++) {
      g.rotate((Math.PI * 2) / 6 + (rng() - 0.5) * 0.3);
      const len = 44 + rng() * 18;
      const gr = g.createLinearGradient(0, 0, len, 0);
      gr.addColorStop(0, "rgba(255,255,255,0.9)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(0, -5);
      g.lineTo(len, 0);
      g.lineTo(0, 5);
      g.fill();
    }
    g.restore();
  }
  {
    // a soft puff: several overlapping blobs
    const [x, y] = at(SPRITE.puff);
    for (let i = 0; i < 7; i++) {
      radial(x + 64 + (rng() - 0.5) * 40, y + 64 + (rng() - 0.5) * 40, 26 + rng() * 18, [[0, 0.35], [1, 0]]);
    }
  }
  {
    const [x, y] = at(SPRITE.shard);
    g.fillStyle = "rgba(255,255,255,0.95)";
    g.beginPath();
    g.moveTo(x + 64, y + 8);
    g.lineTo(x + 74, y + 70);
    g.lineTo(x + 64, y + 120);
    g.lineTo(x + 56, y + 60);
    g.closePath();
    g.fill();
  }
  {
    // fine mist: many tiny droplets in a soft cloud
    const [x, y] = at(SPRITE.mist);
    radial(x + 64, y + 64, 50, [[0, 0.3], [1, 0]]);
    g.fillStyle = "rgba(255,255,255,0.9)";
    for (let i = 0; i < 70; i++) {
      const a = rng() * Math.PI * 2, r = Math.pow(rng(), 0.7) * 54;
      g.beginPath();
      g.arc(x + 64 + Math.cos(a) * r, y + 64 + Math.sin(a) * r, 0.8 + rng() * 2.2, 0, Math.PI * 2);
      g.fill();
    }
  }
  {
    // the jet: a cone of flame from the muzzle (bottom middle) out to the top, made of a
    // few tongues of different lengths so no two shots read the same once it's rotated
    const [x, y] = at(SPRITE.jet);
    const bx = x + 64, by = y + 124;
    g.save();
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 7; i++) {
      const lean = (rng() - 0.5) * 0.5;
      const len = 70 + rng() * 50;
      const w = 9 + rng() * 10;
      const tx = bx + Math.sin(lean) * len, ty = by - Math.cos(lean) * len;
      const gr = g.createLinearGradient(bx, by, tx, ty);
      gr.addColorStop(0, "rgba(255,255,255,0.75)");
      gr.addColorStop(0.35, "rgba(255,255,255,0.45)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(bx - 4, by);
      g.quadraticCurveTo(bx + Math.sin(lean) * len * 0.45 - w, by - len * 0.45, tx, ty);
      g.quadraticCurveTo(bx + Math.sin(lean) * len * 0.45 + w, by - len * 0.45, bx + 4, by);
      g.fill();
    }
    g.restore();
    // the white-hot throat right at the muzzle
    const gr = g.createRadialGradient(bx, by - 14, 0, bx, by - 14, 30);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.5, "rgba(255,255,255,0.5)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(x, y + 64, 128, 64);
  }
  {
    // the petal: end-on, a flash hider's prongs throw lobes; drawn with five uneven ones
    const [x, y] = at(SPRITE.petal);
    g.save();
    g.translate(x + 64, y + 64);
    g.globalCompositeOperation = "lighter";
    const n = 5;
    for (let i = 0; i < n; i++) {
      g.save();
      g.rotate((i / n) * Math.PI * 2 + (rng() - 0.5) * 0.4);
      const len = 40 + rng() * 20, w = 14 + rng() * 8;
      const gr = g.createLinearGradient(0, 0, len, 0);
      gr.addColorStop(0, "rgba(255,255,255,0.8)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(len * 0.5, -w, len, 0);
      g.quadraticCurveTo(len * 0.5, w, 0, 0);
      g.fill();
      g.restore();
    }
    g.restore();
    radial(x + 64, y + 64, 30, [[0, 1], [0.4, 0.8], [1, 0]]);
  }
  {
    // a splinter: long, thin, ragged along both edges, one end torn
    const [x, y] = at(SPRITE.splinter);
    g.fillStyle = "rgba(255,255,255,1)";
    g.beginPath();
    g.moveTo(x + 64, y + 6);
    for (let i = 1; i <= 8; i++) g.lineTo(x + 64 + 3 + rng() * 6, y + 6 + i * 14);
    g.lineTo(x + 60 + rng() * 10, y + 124);
    for (let i = 8; i >= 1; i--) g.lineTo(x + 64 - 3 - rng() * 6, y + 6 + i * 14);
    g.closePath();
    g.fill();
  }
  {
    // a ripple: a thin bright ring with a soft inner shadow, so it reads on dark water
    const [x, y] = at(SPRITE.ring);
    g.lineWidth = 5;
    g.strokeStyle = "rgba(255,255,255,0.95)";
    g.beginPath();
    g.arc(x + 64, y + 64, 56, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 9;
    g.strokeStyle = "rgba(255,255,255,0.25)";
    g.beginPath();
    g.arc(x + 64, y + 64, 49, 0, Math.PI * 2);
    g.stroke();
  }
  {
    // a bubble: a faint body, a bright rim, a highlight up and to one side
    const [x, y] = at(SPRITE.bubble);
    radial(x + 64, y + 64, 58, [[0, 0.06], [0.75, 0.12], [0.9, 0.85], [1, 0]]);
    radial(x + 46, y + 44, 16, [[0, 1], [0.6, 0.5], [1, 0]]);
  }
  {
    // a thread of water: thin, brightest in the middle of its length
    const [x, y] = at(SPRITE.streak);
    const gr = g.createLinearGradient(x, y, x, y + 128);
    gr.addColorStop(0, "rgba(255,255,255,0)");
    gr.addColorStop(0.3, "rgba(255,255,255,0.8)");
    gr.addColorStop(0.7, "rgba(255,255,255,0.8)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(x + 60, y, 8, 128);
  }
  {
    // an arc: a jagged forked line across the cell, a glow round it
    const [x, y] = at(SPRITE.arc);
    const path = (x0: number, y0: number, x1: number, y1: number, n: number, jag: number) => {
      const pts: [number, number][] = [[x0, y0]];
      for (let i = 1; i < n; i++) {
        const t = i / n;
        pts.push([x0 + (x1 - x0) * t + (rng() - 0.5) * jag, y0 + (y1 - y0) * t + (rng() - 0.5) * jag]);
      }
      pts.push([x1, y1]);
      return pts;
    };
    const main = path(x + 8, y + 64, x + 120, y + 64, 10, 34);
    const fork = path(main[4][0], main[4][1], x + 96, y + 20 + rng() * 20, 5, 20);
    for (const [w, a] of [[10, 0.2], [5, 0.5], [2, 1]] as const) {
      g.lineWidth = w;
      g.strokeStyle = `rgba(255,255,255,${a})`;
      g.lineJoin = "miter";
      for (const p of [main, fork]) {
        g.beginPath();
        g.moveTo(p[0][0], p[0][1]);
        for (const q of p.slice(1)) g.lineTo(q[0], q[1]);
        g.stroke();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  // the canvas holds straight alpha; the GPU premultiplies on upload so these cards
  // share the flipbooks' blend
  t.premultiplyAlpha = true;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  return t;
}
