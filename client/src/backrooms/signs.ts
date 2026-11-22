// SIGNS — the prop kit's drawn props (src/backrooms/kit.ts KIT_SIGNS): a
// flat card carrying the words a map designer typed, painted on a canvas.
// One builder for the game (world.ts) and the map editor's preview, so a sign
// reads the same in both (the reuse law).
//
// The object sits the way every kit model sits: its origin at the middle of
// its BASE, its face towards +z (the room, for a wall sign), so the kit's
// placement rule — position (x·CELL, floor + z, y·CELL), rotation.y = -r —
// puts it where the editor shows it. Floor writing lies flat instead.

import * as THREE from "three";
import { KIT } from "../../../src/backrooms/kit";

interface Style {
  bg: string | null;
  ink: string;
  font: string;
  /** A painted look: ragged, a little see-through, runs down the wall. */
  paint?: boolean;
  border?: string;
}

const STYLES: Record<string, Style> = {
  "sign-paint-red": { bg: null, ink: "#b0121a", font: "900 {s}px Impact, 'Arial Black', sans-serif", paint: true },
  "sign-paint-black": { bg: null, ink: "#141210", font: "900 {s}px Impact, 'Arial Black', sans-serif", paint: true },
  "sign-paint-white": { bg: null, ink: "#efeae0", font: "900 {s}px Impact, 'Arial Black', sans-serif", paint: true },
  "sign-note-white": { bg: "#f4f1ea", ink: "#1c2a4a", font: "italic {s}px 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive" },
  "sign-note-old": { bg: "#e2d29c", ink: "#3a2a14", font: "italic {s}px 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive" },
  "sign-plate-green": { bg: "#1f7a3a", ink: "#ffffff", font: "700 {s}px Arial, Helvetica, sans-serif", border: "#e8f0e8" },
  "sign-plate-yellow": { bg: "#f1c21b", ink: "#141210", font: "700 {s}px Arial, Helvetica, sans-serif", border: "#141210" },
  "sign-plate-white": { bg: "#ecebe6", ink: "#1a1a1a", font: "700 {s}px Arial, Helvetica, sans-serif", border: "#3a3a3a" },
  "sign-plate-red": { bg: "#b3171d", ink: "#ffffff", font: "700 {s}px Arial, Helvetica, sans-serif", border: "#f4e8e8" },
  "sign-floor-red": { bg: null, ink: "#a8141b", font: "900 {s}px Impact, 'Arial Black', sans-serif", paint: true },
  "sign-floor-white": { bg: null, ink: "#efeae0", font: "900 {s}px Impact, 'Arial Black', sans-serif", paint: true },
};

/** The size (w, h, d) a sign file is built at — from the kit's own entry. */
function sizeOf(file: string): [number, number, number] {
  for (const p of KIT.values()) {
    if (p.builtin !== "sign") continue;
    const v = p.variants.find((q) => q.file === file);
    if (v) return v.size;
  }
  return [1, 0.4, 0.02];
}

/** Break the words into at most three lines that fit `width` at this font. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= width || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

const texCache = new Map<string, THREE.CanvasTexture>();

/** The card's picture: the words, fitted to it, in the style's hand. */
function signTexture(file: string, text: string, aspect: number): THREE.CanvasTexture {
  const key = `${file}|${text}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const st = STYLES[file] ?? STYLES["sign-plate-white"];
  const H = 256;
  const W = Math.max(64, Math.round(H * aspect));
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  if (st.bg) {
    ctx.fillStyle = st.bg;
    ctx.fillRect(0, 0, W, H);
    if (st.border) {
      ctx.strokeStyle = st.border;
      ctx.lineWidth = Math.round(H * 0.05);
      ctx.strokeRect(H * 0.06, H * 0.06, W - H * 0.12, H - H * 0.12);
    }
  }
  const pad = st.bg ? H * 0.14 : H * 0.04;
  const words = text.trim() || "…";
  // the biggest size at which the words fit in three lines
  let size = H * 0.7;
  let lines: string[] = [];
  for (; size > 12; size *= 0.9) {
    ctx.font = st.font.replace("{s}", String(Math.round(size)));
    lines = wrap(ctx, words, W - pad * 2);
    if (lines.length <= 3 && lines.length * size * 1.08 <= H - pad * 2 && lines.every((l) => ctx.measureText(l).width <= W - pad * 2)) break;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lh = size * 1.08;
  const top = H / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, k) => {
    const y = top + k * lh;
    if (st.paint) {
      // spray paint: a soft halo, the stroke, and a few runs
      ctx.globalAlpha = 0.28;
      ctx.shadowColor = st.ink;
      ctx.shadowBlur = size * 0.18;
      ctx.fillStyle = st.ink;
      ctx.fillText(l, W / 2, y);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.9;
      ctx.fillText(l, W / 2, y);
      ctx.globalAlpha = 0.6;
      const tw = ctx.measureText(l).width;
      let seed = [...l].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7 + k);
      for (let d = 0; d < Math.min(6, l.length); d++) {
        seed = (seed * 1103515245 + 12345) >>> 0;
        const dx = W / 2 - tw / 2 + (seed % 1000) / 1000 * tw;
        const len = size * (0.25 + ((seed >>> 10) % 100) / 180);
        ctx.fillRect(dx, y + size * 0.32, Math.max(2, size * 0.05), len);
      }
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = st.ink;
      ctx.fillText(l, W / 2, y);
    }
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

/** A sign as a kit-shaped object (origin at its base, facing +z). */
export function makeSign(file: string, text: string): THREE.Object3D {
  const [w, h, d] = sizeOf(file);
  const st = STYLES[file] ?? STYLES["sign-plate-white"];
  const floor = file.startsWith("sign-floor");
  const aspect = floor ? w / d : w / h;
  const mat = new THREE.MeshStandardMaterial({
    map: signTexture(file, text, aspect),
    transparent: !st.bg,
    roughness: st.paint ? 0.95 : 0.6,
    metalness: 0,
    depthWrite: !!st.bg,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    forceSinglePass: true,
  });
  const g = new THREE.Group();
  if (floor) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0.012;
    g.add(plane);
  } else if (st.bg) {
    // a card or a plate: a thin slab, the words on its face
    const edge = new THREE.MeshStandardMaterial({ color: st.border ?? st.bg, roughness: 0.7 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, h, Math.max(0.004, d)), [edge, edge, edge, edge, mat, edge]);
    slab.position.set(0, h / 2, 0);
    g.add(slab);
  } else {
    // paint: on the wall's face itself
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    // the editor stands a wall prop ~5cm proud of the wall: paint sits on it
    plane.position.set(0, h / 2, -0.042);
    g.add(plane);
  }
  g.userData.sign = true;
  return g;
}
