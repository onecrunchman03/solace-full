// Hazmat suit RECOLORS — one source of truth for the shop and the world.
//
// Josh's rule: "the color shown in the store must match what the player gets
// in-game." That used to be enforced by deriving BOTH from one filter string,
// because the pack shipped a single yellow texture and everything else was a
// hue-rotate of it. It now ships the ARTIST'S OWN recolors (Josh, July 2026 —
// "use the preset hazmat colors, apply the texture"), which is strictly better:
// a hue rotation moves every pixel including the visor, the boots and the
// respirator filters, so a "blue" suit had blue boots and a blue mask. The real
// textures keep the black rubber black.
//
// The filters are KEPT as a fallback for a color whose file is missing, so a
// future palette entry degrades to an approximation instead of a broken image.

export const SUIT_COLORS = [
  "yellow", "orange", "blue", "green", "red", "black", "cleaning-crew",
  // THE ESCAPE ROOM'S FIVE (ESCAPE.md, E3): per-player legendary chest
  // exclusives. No artwork files — the filter fallback below IS their look,
  // which is exactly the uniformity law at work: same suit system, same
  // picker, same wire, everywhere a suit exists.
  "midnight", "blood", "neon", "royal", "gilded",
  // THE VIP ROOM's metals (Sep 2026): issued to the locker by owning the
  // Room's suit item (src/vip.ts suitColorOfItem) — filters, no art files.
  "copper", "sterling", "gold", "prismatic",
  // THE PANDORAN (PANDORA.md): issued to every opener of the box. An
  // obsidian suit with a star field inside it and gold meander on the seams.
  "pandoran",
  // THE FLOOR CAST's own (Josh, Oct 2026): Tasha's pink, Duke's army green,
  // Chase's cobalt and Rollo's purple (bluer than the escape room's royal, so
  // it never reads as Tasha's pink). Worn by the regulars only: the server's
  // buyable list (gear.ts) never names them.
  "pink", "army", "cobalt", "purple",
] as const;

/** Suits ISSUED by owning something (the Room's metals, the Pandoran): the
 *  locker re-issues them free, so Voss won't buy them — the server refuses,
 *  and the locker card doesn't offer it. */
export const ISSUED_SUITS = new Set(["copper", "sterling", "gold", "prismatic", "pandoran"]);

/** The artwork for a suit color. One file per color, straight from the pack. */
export const suitTextureUrl = (color: string | null | undefined): string =>
  `/assets/hazmat/hazmat_${SUIT_COLORS.includes((color ?? "") as never) ? color : "yellow"}.png`;

export const SUIT_FILTER: Record<string, string> = {
  yellow: "none",
  orange: "hue-rotate(-20deg) saturate(1.3)",
  blue: "hue-rotate(186deg) saturate(1.15) brightness(0.95)",
  green: "hue-rotate(68deg) saturate(1.05)",
  red: "hue-rotate(-46deg) saturate(1.55) brightness(0.92)",
  black: "saturate(0.1) brightness(0.4)",
  // The cleaning crew wear pale institutional blue-grey coveralls.
  "cleaning-crew": "saturate(0.32) brightness(1.1) hue-rotate(155deg)",
  // The escape room's casino colorways.
  midnight: "saturate(0.45) brightness(0.55) hue-rotate(190deg)",
  blood: "hue-rotate(-52deg) saturate(1.8) brightness(0.7)",
  neon: "hue-rotate(130deg) saturate(2.2) brightness(1.15)",
  royal: "hue-rotate(230deg) saturate(1.5) brightness(0.85)",
  gilded: "saturate(1.6) brightness(1.25) contrast(1.1)",
  // Foundry Copper: burnished, the seams gone dark.
  // Tuned on a sheet against BOTH pictures — the locker's store art (a pure
  // yellow on white, where a plain hue turn reads orange) and the in-game
  // texture — so the card and the body agree.
  copper: "hue-rotate(-30deg) saturate(1.05) brightness(0.5) contrast(1.35)",
  // Sterling Silver: cool steel (sepia turned to blue and drained), the
  // rubber kept black by the contrast. Sheet-tuned on both pictures like
  // copper — plain desaturation read as cream on the store art.
  sterling: "sepia(1) hue-rotate(180deg) saturate(0.5) brightness(0.78) contrast(1.6)",
  // Foundry Gold: deeper and richer than the escape room's bright "gilded".
  gold: "sepia(0.3) hue-rotate(-8deg) saturate(1.8) brightness(0.8) contrast(1.4)",
  // The mythic suit: a violet base the prism wash (below) runs a rainbow over.
  prismatic: "hue-rotate(235deg) saturate(1.3) brightness(0.72) contrast(1.3)",
  // The Pandoran: near-black with a violet cast (the void wash paints the
  // stars into it; on a filter-only engine this dark suit is the fallback).
  pandoran: "saturate(0.5) brightness(0.28) contrast(1.4) hue-rotate(250deg)",
  // The floor cast's.
  pink: "hue-rotate(-75deg) saturate(1.1) brightness(1.08)",
  army: "hue-rotate(28deg) saturate(0.5) brightness(0.5) contrast(1.1)",
  cobalt: "hue-rotate(180deg) saturate(1.3) brightness(0.4) contrast(1.3)",
  purple: "hue-rotate(212deg) saturate(1.5) brightness(0.6) contrast(1.15)",
};

export const suitFilter = (color: string | null | undefined): string =>
  SUIT_FILTER[color ?? "yellow"] ?? "none";

/** Human label for a color id (the store chips + locker rows). */
export const suitColorLabel = (color: string): string =>
  color === "cleaning-crew" ? "cleaning crew" : color === "pandoran" ? "the Pandoran" : color === "army" ? "army green" : color;

/** A swatch hex per color — for the selector's little dot, so the choice
 *  reads at a glance even before the picture loads. */
export const SUIT_SWATCH: Record<string, string> = {
  yellow: "#e8c33c",
  orange: "#e07a1e",
  blue: "#2f6ad0",
  green: "#3f9b46",
  red: "#c2372a",
  black: "#2a2622",
  "cleaning-crew": "#9fb4c4",
  midnight: "#20304e",
  blood: "#7d1f18",
  neon: "#2ee6a8",
  royal: "#5b3fa8",
  gilded: "#e0b83f",
  copper: "#b5642f",
  sterling: "#cfd3da",
  gold: "#d9a628",
  prismatic: "#9a6ff0",
  pandoran: "#1a1030",
  pink: "#e86aa8",
  army: "#4b5a2c",
  cobalt: "#1f3366",
  purple: "#6a3fb0",
};

// ---- TRIM: brass hardware on the metal colorways (Josh, Sep 2026: "add some
// brass shiny parts tastefully to the copper one just so it stands out more").
// A colorway can name the HARDWARE on each picture — the 256² atlas the body
// wears and the locker's store art the cards show — in that picture's own
// pixels, and the painter lays a brass gradient with a specular edge over
// exactly those parts after the recolour. Coordinates were read off a grid
// sheet of both pictures; the atlas parts are the respirator canisters, the
// belt buckle and a chest clip, the art parts the visor rim, the goggle
// rims, the glove cuffs, the chest clips and the leg tab.

export interface SuitTrim {
  kind: "rect" | "ellipse" | "ring";
  x: number;
  y: number;
  w: number;
  h: number;
  /** ring: stroke width, in the picture's pixels. */
  r?: number;
}

/** The suit's HARDWARE on each picture, in that picture's own pixels —
 *  the same boxes for every colorway, only the metal changes. Boxes were
 *  MEASURED off the pictures (a blob scan of the dark parts), not read off a
 *  grid by eye — the first cut was a dozen pixels out. */
export const SUIT_HARDWARE: { atlas: SuitTrim[]; art: SuitTrim[] } = {
  atlas: [
    { kind: "rect", x: 108, y: 0, w: 15, h: 25 }, // respirator canister, left
    { kind: "rect", x: 125, y: 1, w: 14, h: 24 }, // respirator canister, right
    // MAPPED ON THE RENDERED MODEL with a colour-grid probe (the round
    // fitting at 137,167 that looked like a buckle on the atlas lands on the
    // KNEES; the "torso" panel at E4–G5 is the legs). The chest front is the
    // bottom-right panel (x 195–256, y 190–256), mirrored about x = 195 — its
    // last rows ARE the belt band and the seam is the zip — so:
    { kind: "rect", x: 195, y: 241, w: 8, h: 9 }, // the belt buckle, astride the zip
    { kind: "rect", x: 128, y: 185, w: 72, h: 3 }, // boot straps (both shins)
  ],
  art: [
    { kind: "ring", x: 67, y: 13, w: 47, h: 51, r: 2.2 }, // the visor rim
    { kind: "ring", x: 79, y: 24, w: 11, h: 9, r: 1.4 }, // goggle rim, left
    { kind: "ring", x: 91, y: 24, w: 11, h: 9, r: 1.4 }, // goggle rim, right
    { kind: "rect", x: 21, y: 150, w: 14, h: 7 }, // glove cuff, left
    { kind: "rect", x: 153, y: 150, w: 13, h: 7 }, // glove cuff, right
    { kind: "ellipse", x: 65, y: 128, w: 6, h: 11 }, // chest clip, upper
    { kind: "ellipse", x: 64, y: 145, w: 8, h: 10 }, // chest clip, lower
    { kind: "rect", x: 111, y: 213, w: 14, h: 4 }, // leg tab
  ],
};

/** A trim metal: light, mid, dark stops of the gradient, and the glint. */
export type TrimMetal = [string, string, string, string];
export const TRIM_METALS: Record<string, TrimMetal> = {
  brass: ["#f8e39a", "#c9963a", "#6e4a14", "rgba(255,248,220,0.75)"],
  gold: ["#fff1b0", "#e2b53a", "#8a5f10", "rgba(255,252,230,0.85)"],
  steel: ["#f4f7fb", "#a9b2c0", "#4e5765", "rgba(255,255,255,0.85)"],
  // The mythic hardware: a rainbow gradient with a white glint.
  prism: ["#ff7ac6", "#7fe6ec", "#ffd35c", "rgba(255,255,255,0.9)"],
};

/** Which metal each Room suit wears, and whether it takes the prism wash.
 *  Each metal CONTRASTS its suit: brass on copper, gold fittings on silver,
 *  steel on gold, and the mythic suit's iridescent fittings. */
export const SUIT_TRIM: Record<string, { metal: string; wash?: "prism" | "void"; shine?: number }> = {
  copper: { metal: "brass" },
  // "a little shiny not too much" (Josh): a soft highlight sweep over the
  // suit and a brighter streak on the fittings — silver and gold only.
  sterling: { metal: "gold", shine: 0.22 }, // silver is already light — a full sweep read white
  gold: { metal: "steel", shine: 0.28 },
  prismatic: { metal: "prism", wash: "prism", shine: 0.2 },
  // THE PANDORAN: the void wash (stars + a nebula inside the suit), gold
  // fittings with a bright glint — the light leaking from the seams.
  pandoran: { metal: "gold", wash: "void", shine: 0.16 },
};

/** THE VOID WASH — the Pandoran's depth: every suit pixel goes to near-
 *  black with a violet cast, then a deterministic star field is scattered
 *  into it (hashed from position, so the atlas and the store art agree and
 *  the body never shimmers between frames) with a soft nebula drifting
 *  across the diagonal. The rubber, the visor and the store art's white box
 *  are left alone, the same suit-pixel test the prism wash uses. */
export function voidWash(g: CanvasRenderingContext2D, w: number, h: number, skip?: Uint8Array): void {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const hash = (x: number, y: number): number => {
    let n = (x * 374761393 + y * 668265263) | 0;
    n = ((n ^ (n >>> 13)) * 1274126177) | 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (skip && skip[i]) continue;
      const p = i * 4;
      const r = d[p], gg = d[p + 1], b = d[p + 2], a = d[p + 3];
      if (a < 40) continue;
      const max = Math.max(r, gg, b), min = Math.min(r, gg, b);
      if (max < 40 || max - min < 28) continue; // black rubber, white box, grey visor
      // The suit's own shading survives as depth: luminance drives the void.
      const lum = (0.3 * r + 0.59 * gg + 0.11 * b) / 255;
      // The nebula: a slow violet-teal band across the diagonal.
      const t = (x / w + y / h) / 2;
      const neb = 0.55 * Math.exp(-(((t - 0.45) / 0.16) ** 2)) + 0.3 * Math.exp(-(((t - 0.8) / 0.1) ** 2));
      // Deep violet, not black: the portrait and the hall both LIGHT the
      // suit, and a near-black base read as a plain black suit on the body.
      let vr = 12 + lum * 24 + neb * 26;
      let vg = 7 + lum * 12 + neb * 9;
      let vb = 28 + lum * 46 + neb * 46;
      // The stars: 2×2 blocks (a 1px star vanished under the body's texture
      // minification), ~1 block in 60, hashed on the block so the atlas and
      // the store art agree; a soft halo on the neighbouring blocks; the
      // brightest carry a warm or cool tint.
      const bx = Math.floor(x / 2), by = Math.floor(y / 2);
      const s = hash(bx, by);
      const halo = Math.max(hash(bx - 1, by), hash(bx + 1, by), hash(bx, by - 1), hash(bx, by + 1));
      if (s > 0.984) {
        const k = (s - 0.984) / 0.016;
        const bright = 140 + k * 115;
        const warm = hash(by, bx) > 0.5;
        vr = Math.max(vr, bright * (warm ? 1 : 0.82));
        vg = Math.max(vg, bright * 0.92);
        vb = Math.max(vb, bright * (warm ? 0.78 : 1));
      } else if (halo > 0.992) {
        const k = (halo - 0.992) / 0.008;
        vr += 26 * k; vg += 22 * k; vb += 40 * k;
      }
      d[p] = Math.round(Math.min(255, vr));
      d[p + 1] = Math.round(Math.min(255, vg));
      d[p + 2] = Math.round(Math.min(255, vb));
    }
  }
  g.putImageData(img, 0, 0);
}

/** THE SHEEN — a soft diagonal highlight band across the suit pixels (a
 *  light falling from the upper left), plus a fainter second band lower
 *  down. Only suit takes it: not the white box, not the black rubber. */
export function sheenWash(g: CanvasRenderingContext2D, w: number, h: number, strength: number, skip?: Uint8Array): void {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (skip && skip[i]) continue; // the store art's box, measured pre-filter
      const p = i * 4;
      const r = d[p], gg = d[p + 1], b = d[p + 2], a = d[p + 3];
      if (a < 40) continue;
      const max = Math.max(r, gg, b), min = Math.min(r, gg, b);
      if (max < 48 || min > 238) continue; // rubber, or the store art's white box
      const t = (x / w + y / h) / 2;
      const band = Math.exp(-(((t - 0.4) / 0.11) ** 2)) + 0.45 * Math.exp(-(((t - 0.72) / 0.09) ** 2));
      const k = strength * band;
      if (k < 0.004) continue;
      d[p] = Math.round(r + (255 - r) * k);
      d[p + 1] = Math.round(gg + (255 - gg) * k);
      d[p + 2] = Math.round(b + (255 - b) * k);
    }
  }
  g.putImageData(img, 0, 0);
}

/** THE PRISM WASH — the mythic suit's rainbow: every suit pixel's hue is
 *  turned by its position across the picture, so the sheen runs diagonally
 *  over the body. Only pixels that ARE suit take it: on the atlas that is
 *  anything opaque and not near-black (the rubber stays black); on the store
 *  art it is anything saturated (the white box and the black mask stay). */
export function prismWash(g: CanvasRenderingContext2D, w: number, h: number): void {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const r = d[p], gg = d[p + 1], b = d[p + 2], a = d[p + 3];
      if (a < 40) continue;
      const max = Math.max(r, gg, b), min = Math.min(r, gg, b);
      if (max < 40 || max - min < 28) continue; // black rubber, white box, grey visor
      // rgb → hsl, turn the hue, back — a compact inline conversion.
      const l = (max + min) / 510;
      const sat = (max - min) / (l <= 0.5 ? max + min : 510 - max - min);
      let hue = max === r ? ((gg - b) / (max - min)) % 6 : max === gg ? (b - r) / (max - min) + 2 : (r - gg) / (max - min) + 4;
      hue = ((hue * 60 + ((x + y) / (w + h)) * 540) % 360 + 360) % 360;
      const c = (1 - Math.abs(2 * l - 1)) * sat, hp = hue / 60, xx = c * (1 - Math.abs((hp % 2) - 1)), m = l - c / 2;
      const [r1, g1, b1] = hp < 1 ? [c, xx, 0] : hp < 2 ? [xx, c, 0] : hp < 3 ? [0, c, xx] : hp < 4 ? [0, xx, c] : hp < 5 ? [xx, 0, c] : [c, 0, xx];
      d[p] = Math.round((r1 + m) * 255);
      d[p + 1] = Math.round((g1 + m) * 255);
      d[p + 2] = Math.round((b1 + m) * 255);
    }
  }
  g.putImageData(img, 0, 0);
}

/** Lay brass over the named parts. `scale` maps picture pixels to canvas
 *  pixels (the atlas is painted 256 → 512). */
export function paintSuitTrim(g: CanvasRenderingContext2D, trims: readonly SuitTrim[], scale: number, metal: TrimMetal = TRIM_METALS.brass, shine = 0): void {
  const [light, mid, dark, glint] = metal;
  for (const t of trims) {
    const x = t.x * scale, y = t.y * scale, w = t.w * scale, h = t.h * scale;
    const grad = g.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, light);
    grad.addColorStop(0.45, mid);
    grad.addColorStop(1, dark);
    g.save();
    g.beginPath();
    if (t.kind === "rect") g.rect(x, y, w, h);
    else g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    if (t.kind === "ring") {
      g.lineWidth = (t.r ?? 2) * scale;
      g.strokeStyle = grad;
      g.stroke();
      // the glint on the upper-left of the ring
      g.beginPath();
      g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, Math.PI * 1.05, Math.PI * 1.55);
      g.lineWidth = Math.max(1, (t.r ?? 2) * scale * 0.45);
      g.strokeStyle = glint;
      g.stroke();
    } else {
      g.fillStyle = grad;
      g.fill();
      // a specular edge along the top
      g.beginPath();
      g.moveTo(x + w * 0.12, y + h * 0.18);
      g.lineTo(x + w * 0.75, y + h * 0.14);
      g.lineWidth = Math.max(1, Math.min(w, h) * 0.16);
      g.lineCap = "round";
      g.strokeStyle = glint;
      g.stroke();
      if (shine > 0) {
        // the polished metals throw a second, sharper reflection
        g.beginPath();
        g.moveTo(x + w * 0.2, y + h * 0.5);
        g.lineTo(x + w * 0.55, y + h * 0.42);
        g.lineWidth = Math.max(1, Math.min(w, h) * 0.1);
        g.strokeStyle = `rgba(255,255,255,${Math.min(0.9, shine * 2)})`;
        g.stroke();
      }
      // and a dark seat along the bottom so it sits IN the suit
      g.beginPath();
      g.moveTo(x + w * 0.1, y + h * 0.9);
      g.lineTo(x + w * 0.9, y + h * 0.88);
      g.lineWidth = Math.max(1, Math.min(w, h) * 0.12);
      g.strokeStyle = "rgba(40,20,5,0.55)";
      g.stroke();
    }
    g.restore();
  }
}

const artCache = new Map<string, Promise<string | null>>();

/** The locker's store art in a colorway, WITH its trim, as a data URL — the
 *  Room's cards use this so the picture on the shelf is the picture the
 *  locker shows plus the brass. Painted at 2× for crispness. */
export function suitArtUrl(color: string): Promise<string | null> {
  const key = color || "yellow";
  const hit = artCache.get(key);
  if (hit) return hit;
  const p = new Promise<string | null>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const s = 2;
      const cv = document.createElement("canvas");
      cv.width = img.width * s;
      cv.height = img.height * s;
      const g = cv.getContext("2d")!;
      // No canvas filter on this engine (older WebKit): the recolour can't be
      // painted, so hand back nothing and let the CSS filter carry the colour.
      if (!("filter" in g)) return resolve(null);
      // The white box, measured BEFORE the filter darkens it, so the sheen
      // never paints the card's background.
      g.drawImage(img, 0, 0, cv.width, cv.height);
      const raw = g.getImageData(0, 0, cv.width, cv.height).data;
      const box = new Uint8Array(cv.width * cv.height);
      for (let i = 0; i < box.length; i++) {
        const q = i * 4;
        if (raw[q + 3] < 40 || (raw[q] > 232 && raw[q + 1] > 232 && raw[q + 2] > 232)) box[i] = 1;
      }
      g.clearRect(0, 0, cv.width, cv.height);
      // A wash that defines its own colour (the void) paints from the RAW
      // picture — the dark fallback filter first would leave it nothing to
      // paint (every pixel under the wash's own suit test).
      const trim = SUIT_TRIM[key];
      drawFiltered(g, img, cv.width, cv.height, trim?.wash === "void" ? "none" : suitFilter(key));
      if (trim?.wash === "prism") prismWash(g, cv.width, cv.height);
      if (trim?.wash === "void") voidWash(g, cv.width, cv.height, box);
      if (trim?.shine) sheenWash(g, cv.width, cv.height, trim.shine, box);
      if (trim) paintSuitTrim(g, SUIT_HARDWARE.art, s, TRIM_METALS[trim.metal], trim.shine ?? 0);
      resolve(cv.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
    img.src = "/assets/gear/suit.png";
  });
  artCache.set(key, p);
  return p;
}

// ---- The world side: a filtered copy of the suit texture --------------------

const cache = new Map<string, { canvas: HTMLCanvasElement; ready: Promise<void> }>();

/** The suit texture for a color, as a canvas the world can wrap in a
 *  THREE.CanvasTexture. Loads that color's OWN artwork; if the file is missing
 *  it falls back to filtering the yellow one, which is what every color used to
 *  be. Returns the canvas immediately (blank until the image decodes) plus a
 *  promise that resolves once painted, so callers can flag their texture dirty.
 *
 *  THE CANVAS NEVER CHANGES SIZE — this is load-bearing, found the hard way.
 *  The old version resized it to the artwork's dimensions inside paint(), and
 *  the player's own body rendered PITCH BLACK in game: a THREE.CanvasTexture
 *  uploaded before the image decoded allocates immutable GPU storage
 *  (texStorage2D) at the blank canvas's 512×512, and after the resize to the
 *  png's 256×256 every re-upload only fills the top-left quarter — the suit's
 *  UVs sample the never-written region, which is black. Drawing the artwork
 *  SCALED onto the fixed canvas keeps the GPU allocation valid forever
 *  (smoothing off: a 256→512 integer upscale is pixel-identical under the
 *  NearestFilter PS1 crunch).
 *
 *  The cache also stores the READY promise: the old cache-hit path returned an
 *  instantly-resolved promise even while the first caller's image load was
 *  still in flight, so a second texture over the same canvas could upload the
 *  blank and never hear about the paint. */
// ---- THE FILTER, WITHOUT THE BROWSER'S HELP ------------------------------------
// A colour with no painted texture is a CSS filter over the yellow one, drawn
// through the canvas's `filter`. Safari before 18 — and the Mac app's webview
// with it — has no canvas filter: the property is silently ignored and every
// such suit comes out yellow. That was invisible while the regulars wore blue,
// red and black (painted textures); on Oct 14 they moved to purple, army, pink
// and cobalt (filters only) and turned yellow on those screens. So where the
// browser can't filter a canvas, the same filter is applied here, per pixel,
// with the spec's own matrices (filter functions work in sRGB, clamped after
// each step). Where it can, the browser does it — the tuned look is unchanged.

let canvasFilterOk: boolean | null = null;
/** Does this browser apply `filter` on a 2D canvas? Asked once, by drawing. */
function canvasFilters(): boolean {
  if (canvasFilterOk !== null) return canvasFilterOk;
  try {
    const src = document.createElement("canvas");
    src.width = src.height = 1;
    const a = src.getContext("2d")!;
    a.fillStyle = "#ff0000";
    a.fillRect(0, 0, 1, 1);
    const dst = document.createElement("canvas");
    dst.width = dst.height = 1;
    const b = dst.getContext("2d", { willReadFrequently: true })!;
    b.filter = "invert(1)";
    b.drawImage(src, 0, 0);
    const d = b.getImageData(0, 0, 1, 1).data;
    canvasFilterOk = d[0] < 128 && d[1] > 128; // red inverted is cyan
  } catch {
    canvasFilterOk = false;
  }
  return canvasFilterOk;
}

type FilterOp = { fn: string; v: number };
/** "hue-rotate(186deg) saturate(1.15)" → its steps, in order. */
export function parseCssFilter(filter: string): FilterOp[] {
  const out: FilterOp[] = [];
  for (const m of filter.matchAll(/([a-z-]+)\(\s*(-?[\d.]+)\s*(deg|%)?\s*\)/g)) {
    let v = Number(m[2]);
    if (m[3] === "%") v /= 100;
    out.push({ fn: m[1], v });
  }
  return out;
}

/** Apply a CSS filter's steps to RGBA pixels in place (alpha untouched). Pure,
 *  so a harness can hold it to the spec without a canvas. */
export function filterPixels(px: Uint8ClampedArray, ops: FilterOp[]): void {
  const mats: (number[] | null)[] = ops.map(({ fn, v }) => {
    if (fn === "hue-rotate") {
      const r = (v * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
      return [
        0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
        0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
        0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
      ];
    }
    if (fn === "saturate") {
      return [
        0.213 + 0.787 * v, 0.715 - 0.715 * v, 0.072 - 0.072 * v,
        0.213 - 0.213 * v, 0.715 + 0.285 * v, 0.072 - 0.072 * v,
        0.213 - 0.213 * v, 0.715 - 0.715 * v, 0.072 + 0.928 * v,
      ];
    }
    if (fn === "sepia") {
      const k = 1 - Math.min(1, v);
      return [
        0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k,
        0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k,
        0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k,
      ];
    }
    return null;
  });
  const cl = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
  for (let i = 0; i < px.length; i += 4) {
    let r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
    for (let k = 0; k < ops.length; k++) {
      const { fn, v } = ops[k];
      const m = mats[k];
      if (m) {
        const nr = m[0] * r + m[1] * g + m[2] * b;
        const ng = m[3] * r + m[4] * g + m[5] * b;
        const nb = m[6] * r + m[7] * g + m[8] * b;
        r = cl(nr); g = cl(ng); b = cl(nb);
      } else if (fn === "brightness") {
        r = cl(r * v); g = cl(g * v); b = cl(b * v);
      } else if (fn === "contrast") {
        r = cl((r - 0.5) * v + 0.5); g = cl((g - 0.5) * v + 0.5); b = cl((b - 0.5) * v + 0.5);
      }
    }
    px[i] = Math.round(r * 255);
    px[i + 1] = Math.round(g * 255);
    px[i + 2] = Math.round(b * 255);
  }
}

/** Draw an image through a CSS filter — the browser's own where it has one,
 *  ours where it doesn't. */
function drawFiltered(g: CanvasRenderingContext2D, img: CanvasImageSource, w: number, h: number, filter: string): void {
  if (!filter || filter === "none") {
    g.drawImage(img, 0, 0, w, h);
    return;
  }
  if (canvasFilters()) {
    g.filter = filter;
    g.drawImage(img, 0, 0, w, h);
    g.filter = "none";
    return;
  }
  g.drawImage(img, 0, 0, w, h);
  const data = g.getImageData(0, 0, w, h);
  filterPixels(data.data, parseCssFilter(filter));
  g.putImageData(data, 0, 0);
}

export function suitCanvas(color: string): { canvas: HTMLCanvasElement; ready: Promise<void> } {
  const key = color || "yellow";
  const hit = cache.get(key);
  if (hit) return hit;
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 512;
  const ready = new Promise<void>((resolve) => {
    const paint = (img: HTMLImageElement, filter: string): void => {
      const g = cv.getContext("2d")!;
      g.imageSmoothingEnabled = false;
      drawFiltered(g, img, cv.width, cv.height, filter);
      // The metal colorways carry brass hardware on the body too.
      const trim = SUIT_TRIM[key];
      if (trim?.wash === "prism") prismWash(g, cv.width, cv.height);
      if (trim?.wash === "void") voidWash(g, cv.width, cv.height);
      if (trim?.shine) sheenWash(g, cv.width, cv.height, trim.shine);
      if (trim) paintSuitTrim(g, SUIT_HARDWARE.atlas, cv.width / img.width, TRIM_METALS[trim.metal], trim.shine ?? 0);
      resolve();
    };
    const img = new Image();
    img.onload = () => paint(img, "none"); // the real recolor: no filter needed
    img.onerror = () => {
      // No artwork for this color — approximate it from yellow, as before.
      const fb = new Image();
      fb.onload = () => paint(fb, SUIT_TRIM[key]?.wash === "void" ? "none" : suitFilter(key));
      fb.onerror = () => resolve();
      fb.src = "/assets/hazmat/hazmat_yellow.png";
    };
    img.src = suitTextureUrl(key);
  });
  const entry = { canvas: cv, ready };
  cache.set(key, entry);
  return entry;
}
