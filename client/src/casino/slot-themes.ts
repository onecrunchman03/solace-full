// THE SLOT THEMES (Josh, Oct 2026: "its all the same slot machine"). Every
// section of the Boulevard's slots wears its own reels — but they are the SAME
// reels underneath: one strip order, one paytable, one set of symbol ids
// (src/slots.ts). A theme only decides what each id LOOKS like and what a
// winning line is CALLED, so the odds every harness pins are untouched and the
// floor wire (which carries symbol ids) means the same thing on every cabinet.
//
// Symbols are VECTOR-DRAWN, never emoji glyphs: canvas colour emoji came up
// blank in the desktop shell's WebView2 twice (Josh: "the cherries and other
// icons are missing").

import type { SlotTheme } from "./layout";

/** The strip order — the 2D game's 14-cell STRIP (Slots.svelte), shared by
 *  every theme so a pull's symbols land the same way on every cabinet. */
export const REEL_STRIP = [
  "crown", "diamond", "seven", "bar", "bell", "cherry", "lemon", "clover",
  "cherry", "bar", "lemon", "seven", "clover", "bell",
] as const;
export const STRIP_CELL = 96; // px per symbol on a strip canvas

/** How a theme's screen is dressed around the reels. */
export interface ThemeLook {
  /** the reel face: top/edge shade and the lit middle */
  faceEdge: string;
  faceMid: string;
  /** the marquee above the windows: top and bottom of its gradient */
  mqTop: string;
  mqBottom: string;
  /** the title's ink, and the rule under the marquee */
  ink: string;
  rule: string;
  /** the bezel round the windows */
  bezel: string;
  /** the title's typeface */
  font: string;
}

export const THEME_LOOK: Record<SlotTheme, ThemeLook> = {
  fruit: { faceEdge: "#cfc6b4", faceMid: "#f7f2e6", mqTop: "#3a1d18", mqBottom: "#160d0a", ink: "#e8c06a", rule: "#8a6a2c", bezel: "#14100c", font: "Georgia, 'Times New Roman', serif" },
  sevens: { faceEdge: "#1a0d2e", faceMid: "#2c1650", mqTop: "#4a1a78", mqBottom: "#12061f", ink: "#ff7ad9", rule: "#b04cff", bezel: "#0c0614", font: "Impact, 'Arial Black', sans-serif" },
  gems: { faceEdge: "#06222c", faceMid: "#0d3a48", mqTop: "#0f5a7a", mqBottom: "#041219", ink: "#bff3ff", rule: "#5fd3f0", bezel: "#030c10", font: "Georgia, 'Times New Roman', serif" },
  crowns: { faceEdge: "#d9c79a", faceMid: "#fbf3dc", mqTop: "#6b3f10", mqBottom: "#1e1004", ink: "#ffd66a", rule: "#c9962e", bezel: "#170c04", font: "Georgia, 'Times New Roman', serif" },
  liberty: { faceEdge: "#b9a27a", faceMid: "#efe2c2", mqTop: "#5a1222", mqBottom: "#1c0509", ink: "#f3d9a0", rule: "#a8823e", bezel: "#120507", font: "'Times New Roman', Georgia, serif" },
  gold: { faceEdge: "#050403", faceMid: "#17120b", mqTop: "#2a2014", mqBottom: "#050403", ink: "#ffd98a", rule: "#d4a443", bezel: "#030202", font: "Georgia, 'Times New Roman', serif" },
};

/** What a winning line is called on each theme (the toast after a win). The
 *  keys are src/slots.ts's line ids. */
export const THEME_LABELS: Record<SlotTheme, Record<string, string>> = {
  fruit: {
    crown: "💰 JACKPOT — TRIPLE CROWN 💰", diamond: "DIAMOND ROW", seven: "LUCKY SEVENS",
    bar: "TRIPLE BAR", clover: "CLOVER LUCK", bell: "TRIPLE BELL", lemon: "LEMONADE",
    crown2: "TWO CROWNS", cherry3: "CHERRIES", diamond2: "TWO DIAMONDS",
    seven2: "TWO SEVENS", cherry2: "TWO CHERRIES", cherry1: "A CHERRY",
  },
  sevens: {
    crown: "💰 JACKPOT — GOLD SEVENS 💰", diamond: "BLUE SEVENS", seven: "RED SEVENS",
    bar: "TRIPLE BAR", clover: "WHITE SEVENS", bell: "DOUBLE BARS", lemon: "SINGLE BARS",
    crown2: "TWO GOLD SEVENS", cherry3: "CHERRIES", diamond2: "TWO BLUE SEVENS",
    seven2: "TWO RED SEVENS", cherry2: "TWO CHERRIES", cherry1: "A CHERRY",
  },
  gems: {
    crown: "💰 JACKPOT — THE BRILLIANT 💰", diamond: "SAPPHIRES", seven: "RUBIES",
    bar: "GOLD INGOTS", clover: "EMERALDS", bell: "AMETHYSTS", lemon: "TOPAZ",
    crown2: "TWO BRILLIANTS", cherry3: "PEARLS", diamond2: "TWO SAPPHIRES",
    seven2: "TWO RUBIES", cherry2: "TWO PEARLS", cherry1: "A PEARL",
  },
  crowns: {
    crown: "💰 JACKPOT — THREE CROWNS 💰", diamond: "THREE ACES", seven: "THREE KINGS",
    bar: "THREE QUEENS", clover: "THREE CLUBS", bell: "THREE JACKS", lemon: "THREE TENS",
    crown2: "TWO CROWNS", cherry3: "THREE SOVEREIGNS", diamond2: "TWO ACES",
    seven2: "TWO KINGS", cherry2: "TWO SOVEREIGNS", cherry1: "A SOVEREIGN",
  },
  liberty: {
    crown: "💰 JACKPOT — THREE LIBERTY BELLS 💰", diamond: "THREE STARS", seven: "HORSESHOES",
    bar: "SPADES", clover: "CLOVERS", bell: "HEARTS", lemon: "DIAMONDS",
    crown2: "TWO LIBERTY BELLS", cherry3: "CHERRIES", diamond2: "TWO STARS",
    seven2: "TWO HORSESHOES", cherry2: "TWO CHERRIES", cherry1: "A CHERRY",
  },
  gold: {
    crown: "💰 JACKPOT — GOLDEN CROWNS 💰", diamond: "GOLDEN DIAMONDS", seven: "GOLDEN SEVENS",
    bar: "GOLD BARS", clover: "GOLDEN CLOVER", bell: "GOLDEN BELLS", lemon: "GOLDEN LEMONS",
    crown2: "TWO GOLDEN CROWNS", cherry3: "GOLDEN CHERRIES", diamond2: "TWO GOLDEN DIAMONDS",
    seven2: "TWO GOLDEN SEVENS", cherry2: "TWO GOLDEN CHERRIES", cherry1: "A GOLDEN CHERRY",
  },
};

/** How a theme's win jingle differs: a pitch ratio and the gap between
 *  notes (lib/slots-audio.ts winJingle). Same tune, its own voice. */
export const THEME_JINGLE: Record<SlotTheme, { mul: number; gap: number }> = {
  fruit: { mul: 1, gap: 0.1 },
  sevens: { mul: 1.122, gap: 0.075 }, // up a tone, quicker — neon
  gems: { mul: 1.5, gap: 0.07 }, // a fifth up — glassy sparkle
  crowns: { mul: 0.749, gap: 0.14 }, // a fourth down, stately — a fanfare
  liberty: { mul: 1, gap: 0.17 }, // the old tune, slow — a music box
  gold: { mul: 0.667, gap: 0.12 }, // a fifth down — low and rich
};

// ---- the painters ---------------------------------------------------------------

type C2 = CanvasRenderingContext2D;
type Painter = (c: C2, x: number, y: number) => void;

const shine = (c: C2, x: number, y: number, r: number): void => {
  c.fillStyle = "#ffffff88";
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
};

const glyph = (text: string, fill: string, size: number, stroke?: string, dy = 4): Painter => (c, x, y) => {
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = `900 ${size}px system-ui, 'Arial Black', sans-serif`;
  if (stroke) {
    c.lineWidth = 5;
    c.strokeStyle = stroke;
    c.strokeText(text, x, y + dy);
  }
  c.fillStyle = fill;
  c.fillText(text, x, y + dy);
};

/** A BAR plate, or a stack of `n` of them. */
const bars = (n: number, plate: string, ink: string): Painter => (c, x, y) => {
  const h = n === 1 ? 38 : n === 2 ? 26 : 20;
  const gap = 4;
  const top = y - (n * h + (n - 1) * gap) / 2;
  for (let i = 0; i < n; i++) {
    const ty = top + i * (h + gap);
    c.fillStyle = plate;
    c.fillRect(x - 38, ty, 76, h);
    c.fillStyle = ink;
    c.font = `900 ${Math.round(h * 0.72)}px system-ui, sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("BAR", x, ty + h / 2 + 1);
  }
};

/** Draw `p` scaled about its own centre — the gems read small beside a 7. */
const bigger = (k: number, p: Painter): Painter => (c, x, y) => {
  c.save();
  c.translate(x, y);
  c.scale(k, k);
  p(c, 0, 0);
  c.restore();
};

/** A BAR plate with its word CUT OUT, for a theme that gilds every symbol's
 *  silhouette (a printed word would be gilded over with the plate). */
const barCut: Painter = (c, x, y) => {
  c.fillStyle = "#000";
  c.fillRect(x - 38, y - 20, 76, 40);
  c.globalCompositeOperation = "destination-out";
  c.font = "900 28px system-ui, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText("BAR", x, y + 1);
  c.globalCompositeOperation = "source-over";
};

/** A faceted gem: a crown of facets over a pointed pavilion. */
const gem = (body: string, light: string): Painter => bigger(1.3, (c, x, y) => {
  c.fillStyle = body;
  c.beginPath();
  c.moveTo(x - 26, y - 6);
  c.lineTo(x - 13, y - 22);
  c.lineTo(x + 13, y - 22);
  c.lineTo(x + 26, y - 6);
  c.lineTo(x, y + 26);
  c.closePath();
  c.fill();
  c.strokeStyle = light;
  c.lineWidth = 2.5;
  c.beginPath();
  c.moveTo(x - 26, y - 6);
  c.lineTo(x + 26, y - 6);
  c.moveTo(x - 13, y - 22);
  c.lineTo(x - 7, y - 6);
  c.lineTo(x, y + 26);
  c.lineTo(x + 7, y - 6);
  c.lineTo(x + 13, y - 22);
  c.stroke();
  shine(c, x - 10, y - 13, 3.5);
});

/** A round cabochon (pearl, coin) with a soft highlight. */
const orb = (body: string, rim: string, r = 20): Painter => (c, x, y) => {
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.35, 2, x, y, r);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.35, body);
  g.addColorStop(1, rim);
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
};

const crown: (gold: string, jewel: string) => Painter = (gold, jewel) => (c, x, y) => {
  c.fillStyle = gold;
  c.beginPath();
  c.moveTo(x - 26, y + 18);
  c.lineTo(x - 28, y - 12);
  c.lineTo(x - 13, y + 2);
  c.lineTo(x, y - 20);
  c.lineTo(x + 13, y + 2);
  c.lineTo(x + 28, y - 12);
  c.lineTo(x + 26, y + 18);
  c.closePath();
  c.fill();
  c.fillRect(x - 26, y + 18, 52, 7);
  c.fillStyle = jewel;
  c.beginPath();
  c.arc(x, y + 12, 5, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#2a6fc9";
  for (const bx of [-16, 16]) {
    c.beginPath();
    c.arc(x + bx, y + 12, 4, 0, Math.PI * 2);
    c.fill();
  }
};

const cherry: Painter = (c, x, y) => {
  c.strokeStyle = "#3f7d34";
  c.lineWidth = 5;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(x - 10, y + 12);
  c.quadraticCurveTo(x - 4, y - 16, x + 8, y - 24);
  c.moveTo(x + 12, y + 14);
  c.quadraticCurveTo(x + 12, y - 10, x + 8, y - 24);
  c.stroke();
  c.fillStyle = "#57a344";
  c.beginPath();
  c.ellipse(x + 14, y - 26, 12, 6, -0.5, 0, Math.PI * 2);
  c.fill();
  for (const [bx, by] of [[-10, 16], [12, 18]] as const) {
    c.fillStyle = "#c22030";
    c.beginPath();
    c.arc(x + bx, y + by, 13, 0, Math.PI * 2);
    c.fill();
    shine(c, x + bx - 4, y + by - 5, 4);
  }
};

const bell: (body: string, clapper: string) => Painter = (body, clapper) => (c, x, y) => {
  c.fillStyle = body;
  c.beginPath();
  c.moveTo(x - 20, y + 14);
  c.quadraticCurveTo(x - 20, y - 22, x, y - 24);
  c.quadraticCurveTo(x + 20, y - 22, x + 20, y + 14);
  c.closePath();
  c.fill();
  c.fillRect(x - 26, y + 12, 52, 8);
  c.fillStyle = clapper;
  c.beginPath();
  c.arc(x, y + 26, 7, 0, Math.PI * 2);
  c.fill();
  c.fillRect(x - 4, y - 30, 8, 8);
};

const lemon: Painter = (c, x, y) => {
  c.fillStyle = "#e8d33c";
  c.beginPath();
  c.ellipse(x, y, 26, 17, -0.5, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#c9b32a";
  for (const sgn of [-1, 1]) {
    c.beginPath();
    c.arc(x + sgn * 23, y - sgn * 13, 5, 0, Math.PI * 2);
    c.fill();
  }
};

const clover: (leaf: string) => Painter = (leaf) => (c, x, y) => {
  c.fillStyle = leaf;
  for (const a of [-Math.PI / 2, Math.PI / 6, (Math.PI * 5) / 6]) {
    c.beginPath();
    c.arc(x + Math.cos(a) * 12, y - 4 + Math.sin(a) * 12, 12, 0, Math.PI * 2);
    c.fill();
  }
  c.strokeStyle = leaf;
  c.lineWidth = 5;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(x, y + 2);
  c.quadraticCurveTo(x + 6, y + 18, x + 12, y + 26);
  c.stroke();
};

const diamondGem: Painter = gem("#3fb8d9", "#ffffffaa");

/** The four card suits, drawn rather than typed (the font may lack them). */
const heart = (fill: string): Painter => (c, x, y) => {
  c.fillStyle = fill;
  c.beginPath();
  c.moveTo(x, y + 24);
  c.bezierCurveTo(x - 34, y + 2, x - 22, y - 30, x, y - 12);
  c.bezierCurveTo(x + 22, y - 30, x + 34, y + 2, x, y + 24);
  c.fill();
};
const spade = (fill: string): Painter => (c, x, y) => {
  c.fillStyle = fill;
  c.beginPath();
  c.moveTo(x, y - 26);
  c.bezierCurveTo(x + 34, y - 2, x + 22, y + 26, x, y + 10);
  c.bezierCurveTo(x - 22, y + 26, x - 34, y - 2, x, y - 26);
  c.fill();
  c.fillRect(x - 3, y + 6, 6, 18);
  c.fillRect(x - 11, y + 22, 22, 5);
};
const club = (fill: string): Painter => (c, x, y) => {
  c.fillStyle = fill;
  for (const [ox, oy] of [[0, -13], [-12, 4], [12, 4]] as const) {
    c.beginPath();
    c.arc(x + ox, y + oy, 11, 0, Math.PI * 2);
    c.fill();
  }
  c.fillRect(x - 3, y + 2, 6, 20);
  c.fillRect(x - 11, y + 20, 22, 5);
};
const pip = (fill: string): Painter => (c, x, y) => {
  c.fillStyle = fill;
  c.beginPath();
  c.moveTo(x, y - 26);
  c.lineTo(x + 20, y);
  c.lineTo(x, y + 26);
  c.lineTo(x - 20, y);
  c.closePath();
  c.fill();
};

const star = (fill: string): Painter => (c, x, y) => {
  c.fillStyle = fill;
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 27 : 11;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * r;
    const py = y + 2 + Math.sin(a) * r;
    if (i === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.closePath();
  c.fill();
};

const horseshoe: Painter = (c, x, y) => {
  c.strokeStyle = "#7d7f86";
  c.lineWidth = 11;
  c.lineCap = "butt";
  c.beginPath();
  c.arc(x, y - 2, 19, Math.PI * 0.85, Math.PI * 2.15, false);
  c.stroke();
  c.fillStyle = "#3a3c42";
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * (0.95 + i * 0.22);
    c.beginPath();
    c.arc(x + Math.cos(a) * 19, y - 2 + Math.sin(a) * 19, 1.8, 0, Math.PI * 2);
    c.fill();
  }
};

/** The Liberty Bell — the bell, its yoke, and the crack. */
const libertyBell: Painter = (c, x, y) => {
  c.fillStyle = "#6b4a1e";
  c.fillRect(x - 22, y - 30, 44, 7);
  bell("#b5873d", "#4a3212")(c, x, y + 2);
  c.strokeStyle = "#2a1a08";
  c.lineWidth = 2.5;
  c.beginPath();
  c.moveTo(x - 2, y - 14);
  c.lineTo(x + 3, y - 6);
  c.lineTo(x - 3, y + 2);
  c.lineTo(x + 2, y + 12);
  c.stroke();
};

const ingot: Painter = (c, x, y) => {
  c.fillStyle = "#a8781c";
  c.beginPath();
  c.moveTo(x - 30, y + 14);
  c.lineTo(x - 20, y - 12);
  c.lineTo(x + 20, y - 12);
  c.lineTo(x + 30, y + 14);
  c.closePath();
  c.fill();
  c.fillStyle = "#f2c652";
  c.beginPath();
  c.moveTo(x - 20, y - 12);
  c.lineTo(x + 20, y - 12);
  c.lineTo(x + 16, y - 4);
  c.lineTo(x - 16, y - 4);
  c.closePath();
  c.fill();
};

const coin: Painter = (c, x, y) => {
  orb("#f2c652", "#8a5a10", 21)(c, x, y);
  c.strokeStyle = "#8a5a10";
  c.lineWidth = 2;
  c.beginPath();
  c.arc(x, y, 15, 0, Math.PI * 2);
  c.stroke();
  glyph("S", "#8a5a10", 22, undefined, 2)(c, x, y);
};

const seven = (fill: string, stroke = "#3a0a08"): Painter => glyph("7", fill, 72, stroke);

const THEME_SYMBOLS: Record<SlotTheme, Record<string, Painter>> = {
  fruit: {
    crown: crown("#e8b73c", "#c22030"),
    diamond: diamondGem,
    seven: glyph("7", "#d23227", 72),
    bar: bars(1, "#23232b", "#f3ead6"),
    bell: bell("#e8b73c", "#9a7218"),
    cherry,
    lemon,
    clover: clover("#3f9d44"),
  },
  sevens: {
    crown: seven("#ffd23a", "#7a4a00"),
    diamond: seven("#3a8cff", "#0a1e4a"),
    seven: seven("#ff3a4a"),
    bar: bars(3, "#ff4fd0", "#1a0d2e"),
    bell: bars(2, "#b04cff", "#1a0d2e"),
    cherry,
    lemon: bars(1, "#5fd3f0", "#1a0d2e"),
    clover: seven("#f4f0ff", "#4a2a78"),
  },
  gems: {
    crown: gem("#f4fbff", "#9fd8ee"),
    diamond: gem("#2a6fd9", "#a8ccff"),
    seven: gem("#d92a4a", "#ffb0c0"),
    bar: ingot,
    bell: gem("#9a4ad9", "#e2c4ff"),
    cherry: orb("#f6eee2", "#a89c8a", 22),
    lemon: gem("#f0b43a", "#fff0c0"),
    clover: gem("#2ab36a", "#b8f5d2"),
  },
  crowns: {
    crown: crown("#e8b73c", "#c22030"),
    diamond: glyph("A", "#c22030", 66, "#3a0a08"),
    seven: glyph("K", "#1a1a1a", 66, "#c9962e"),
    bar: glyph("Q", "#c22030", 66, "#3a0a08"),
    bell: glyph("J", "#1a1a1a", 66, "#c9962e"),
    cherry: coin,
    lemon: glyph("10", "#c22030", 54, "#3a0a08"),
    clover: club("#1a1a1a"),
  },
  liberty: {
    crown: libertyBell,
    diamond: star("#c9962e"),
    seven: horseshoe,
    bar: spade("#1a1a1a"),
    bell: heart("#b81c2a"),
    cherry,
    lemon: pip("#b81c2a"),
    clover: clover("#3f7d34"),
  },
  // gold is painted from fruit's set, then gilded (see themeStrip)
  gold: { bar: barCut },
};

const strips = new Map<SlotTheme, HTMLCanvasElement>();

/** One vertical strip of a theme's symbols in REEL_STRIP order. Built once a
 *  theme and shared by every cabinet wearing it; screens drawImage slices. */
export function themeStrip(theme: SlotTheme): HTMLCanvasElement {
  const have = strips.get(theme);
  if (have) return have;
  const look = THEME_LOOK[theme];
  const cv = document.createElement("canvas");
  cv.width = STRIP_CELL;
  cv.height = STRIP_CELL * REEL_STRIP.length;
  const c = cv.getContext("2d")!;
  // the symbols go on their own layer first, so the gold theme can gild just
  // the symbols and not the reel face behind them
  const sym = document.createElement("canvas");
  sym.width = cv.width;
  sym.height = cv.height;
  const s = sym.getContext("2d")!;
  const set = theme === "gold" ? { ...THEME_SYMBOLS.fruit, ...THEME_SYMBOLS.gold } : THEME_SYMBOLS[theme];
  for (let i = 0; i < REEL_STRIP.length; i++) {
    const y = i * STRIP_CELL;
    const mid = y + STRIP_CELL / 2;
    // a vertical shade at the cell edges sells the reel's curve on a flat plane
    const g = c.createLinearGradient(0, y, 0, y + STRIP_CELL);
    g.addColorStop(0, look.faceEdge);
    g.addColorStop(0.2, look.faceMid);
    g.addColorStop(0.8, look.faceMid);
    g.addColorStop(1, look.faceEdge);
    c.fillStyle = g;
    c.fillRect(0, y, STRIP_CELL, STRIP_CELL);
    set[REEL_STRIP[i]]?.(s, STRIP_CELL / 2, mid);
  }
  if (theme === "gold") {
    // GILDED: every symbol's silhouette filled with a gold leaf gradient
    s.globalCompositeOperation = "source-atop";
    for (let i = 0; i < REEL_STRIP.length; i++) {
      const y = i * STRIP_CELL;
      const g = s.createLinearGradient(0, y + 14, 0, y + STRIP_CELL - 14);
      g.addColorStop(0, "#fff1b8");
      g.addColorStop(0.45, "#e2ae3c");
      g.addColorStop(0.55, "#a8701a");
      g.addColorStop(1, "#f7d675");
      s.fillStyle = g;
      s.fillRect(0, y, STRIP_CELL, STRIP_CELL);
    }
    s.globalCompositeOperation = "source-over";
  }
  c.drawImage(sym, 0, 0);
  strips.set(theme, cv);
  return cv;
}
