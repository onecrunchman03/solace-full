// Relic art intake: Josh's source images (assets/relics/<Level>/…) → the
// game's cut-out webps (client/public/assets/relics/<slug>.webp).
//
//   node scripts/relic-art.mjs [slug …]   (every entry below, or just those)
//
// The background — plain white, or a baked "transparency" checkerboard, which
// downloaded PNGs often carry — is flood-filled away from the image's edges:
// only pale, unsaturated pixels CONNECTED to the border go, so a white
// highlight inside the object stays. The edge is feathered one pixel, the
// result trimmed to the object and fitted inside 512px.
import sharp from "sharp";
import { resolve } from "node:path";

const SRC = resolve("assets/relics");
const OUT = resolve("client/public/assets/relics");
const JOBS = [
  ["Pipe Dream/Drill bit of endurance.webp", "drill-bit-of-endurance"],
  ["Pipe Dream/Fusion Core.png", "fusion-core"],
  ["Pipe Dream/Glass Cannon.webp", "glass-cannon"],
  ["Pipe Dream/SMPJ_Golden_Pipe_Render.png", "the-golden-pipe"],
  ["Pipe Dream/ai-generated-9234753_640.png", "the-ore-wagon"],
  ["Pipe Dream/claire binky.webp", "claires-binky"],
  ["Pipe Dream/cog of truth.webp", "cog-of-truth"],
  ["Pipe Dream/diaper of chaos.png", "diaper-of-chaos"],
  ["Pipe Dream/old-pickaxe-9531623_640.png", "the-first-pickaxe"],
  ["Pipe Dream/water gemstone.webp", "water-gemstone"],
  // Level 3, the Electrical Station (Oct 2026)
  ["Electrical Station/Ancient jade sword relic.jpg", "ancient-jade-sword"],
  ["Electrical Station/Broken camera relic.webp", "broken-camera"],
  ["Electrical Station/Chaos emerald relic.png", "chaos-emerald"],
  ["Electrical Station/Cinema Ticket relic.avif", "cinema-ticket"],
  // A white bottle on a baked checkerboard: the loose test eats the bottle.
  ["Electrical Station/Claires baby bottle relic.png", "claires-bottle", { strict: true }],
  ["Electrical Station/Crystal ball relic.png", "crystal-ball"],
  ["Electrical Station/feelsbad pepe relic.png", "feelsbad-pepe"],
  ["Electrical Station/Mystical Hippo Relic.png", "mystical-hippo"],
  // Black line art: invisible on the game's dark cards, so it is cast in brass.
  ["Electrical Station/Rune of protection relic.webp", "rune-of-protection", { tint: [217, 180, 106] }],
  ["Electrical Station/Unknown Artifact relic.png", "unknown-artifact"],
  // Level 4, the Abandoned Office (Oct 2026)
  ["Abandoned Office/book relic.png", "the-blank-book"],
  ["Abandoned Office/claires baby bouncer relic.jpg", "claires-bouncer", { checker: true }],
  ["Abandoned Office/gold stapler relic.webp", "gold-stapler"],
  ["Abandoned Office/magic ring relic.png", "magic-ring"],
  ["Abandoned Office/printer of time relic.jpg", "printer-of-time", { checker: true }],
  ["Abandoned Office/rug of persia relic.jpg", "rug-of-persia"],
  ["Abandoned Office/sacred lolipop relic.png", "sacred-lollipop"],
  ["Abandoned Office/slime relic.webp", "the-slime", { checker: true }],
  ["Abandoned Office/sword of fate relic.png", "sword-of-fate"],
  ["Abandoned Office/timeless robe.jpg", "timeless-robe", { checker: true }],
  // Level 5, the Terror Hotel (Oct 2026). The drive is photographed on a
  // graded studio backdrop (`backdrop`: the fill follows the gradient); the
  // blueprint is the whole sheet and stays a card, with its generator
  // watermark (a crayon, bottom right) painted out. The 8 ball nearly fills
  // its frame, so its checkerboard can't be measured — the plain fill takes
  // the corners and the dark rim keeps it off the highlight.
  ["Terror Hotel/bitline drive relic.webp", "bitline-drive", { backdrop: 4 }],
  ["Terror Hotel/blueprint relic.webp", "the-boiler-blueprint", { erase: [[0.82, 0.82, 1, 1]] }],
  ["Terror Hotel/gold coins relic.webp", "the-bellboys-tips"],
  ["Terror Hotel/eight ball relic.webp", "the-eight-ball"],
  ["Terror Hotel/claires crib relic.webp", "claires-crib", { checker: true }],
  ["Terror Hotel/grass clibbings relic.png", "grass-clibbings"],
  ["Terror Hotel/dog bones relic.webp", "bears-biscuits"],
  ["Terror Hotel/circuit chip relic.webp", "the-lift-board"],
  ["Terror Hotel/cosmic star relic.webp", "fallen-star", { strict: true, fringe: 8 }],
  ["Terror Hotel/stormglass relic.png", "the-stormglass", { checker: true }],
  // Level 6, Lights Out (Oct 2026): the first five of Josh's ten. The platter,
  // the case, the stick and the blanket come on baked checkerboards (the
  // stick and the blanket under a faint stock watermark, which the fill
  // takes with the background); the core is on plain white.
  ["Lights Out/open platter relic.webp", "the-open-platter", { pale: 165 }],
  ["Lights Out/pelican case relic.webp", "the-pelican-case", { checker: true }],
  ["Lights Out/ember core relic.webp", "the-ember-core"],
  ["Lights Out/thumb drive relic.png", "the-thumb-drive", { checker: true }],
  ["Lights Out/claires blanket relic.webp", "claires-blanket", { soft: 243 }],
  // the last five, found by Claude (Josh, Oct 14: "go online and find the
  // pngs"), every one CC0 from rawpixel; the two pills are one capsule
  // recoloured, so they read as a pair
  ["Lights Out/black pill relic.png", "the-black-pill"],
  ["Lights Out/pink pill relic.png", "the-pink-pill"],
  ["Lights Out/conch shell relic.jpg", "the-conch-shell", { soft: 243, fringe: 12 }],
  ["Lights Out/cassette tape relic.jpg", "the-cassette", { soft: 243, fringe: 12 }],
  ["Lights Out/last match relic.jpg", "the-last-match", { soft: 243, fringe: 12 }],
  // Level 7, Thalassophobia (Oct 2026): all ten found by Claude, CC0 from
  // rawpixel (sources.txt), JPEGs on the same baked checkerboard as above
  ["Thalassophobia/subway token relic.jpg", "the-subway-token", { soft: 243, fringe: 12 }],
  ["Thalassophobia/message in a bottle relic.jpg", "the-message-in-a-bottle", { soft: 243, fringe: 12 }],
  ["Thalassophobia/ships bell relic.jpg", "the-ships-bell", { soft: 243, fringe: 12 }],
  ["Thalassophobia/divers watch relic.jpg", "the-divers-watch", { soft: 243, fringe: 12 }],
  ["Thalassophobia/lifebuoy relic.jpg", "the-lifebuoy", { soft: 243, fringe: 12 }],
  ["Thalassophobia/storm lantern relic.jpg", "the-storm-lantern", { soft: 243, fringe: 12, paleAbove: 0.45 }],
  ["Thalassophobia/captains spyglass relic.jpg", "the-captains-spyglass", { soft: 243, fringe: 12 }],
  ["Thalassophobia/red scallop relic.jpg", "the-red-scallop", { soft: 243, fringe: 12 }],
  ["Thalassophobia/brass compass relic.jpg", "the-brass-compass", { soft: 243, fringe: 12 }],
  ["Thalassophobia/claires bath duck relic.jpg", "claires-bath-duck", { soft: 243, fringe: 12 }],
  // Level 8, the Cave System (Oct 2026): all ten found by Claude, CC0 from
  // rawpixel (sources.txt), on the same baked checkerboard. The black line
  // art (the whistle, the fossil, the hammer, the candle) is cast in brass,
  // as the rune was: black on the game's dark cards is invisible.
  ["Cave System/conductors whistle relic.jpg", "the-conductors-whistle", { soft: 243, fringe: 12, tint: [217, 180, 106] }],
  ["Cave System/yellow ticket relic.jpg", "the-last-ticket", { soft: 243, fringe: 12 }],
  ["Cave System/fossil fish relic.jpg", "the-fossil-fish", { soft: 243, fringe: 12, tint: [226, 214, 190] }],
  ["Cave System/geologists hammer relic.jpg", "the-geologists-hammer", { soft: 243, fringe: 12, tint: [217, 180, 106] }],
  ["Cave System/candle stub relic.jpg", "the-candlestick", { soft: 243, fringe: 12, tint: [217, 180, 106] }],
  ["Cave System/surveyors watch relic.jpg", "the-surveyors-watch", { soft: 243, fringe: 12 }],
  ["Cave System/blue crystals relic.jpg", "the-blue-crystals", { soft: 243, fringe: 12 }],
  ["Cave System/lump of ore relic.jpg", "the-lump-of-ore", { soft: 243, fringe: 12 }],
  ["Cave System/toy subway car relic.jpg", "the-toy-subway-car", { soft: 243, fringe: 12 }],
  ["Cave System/claires night light relic.jpg", "claires-night-light", { soft: 243, fringe: 12 }],
  // the older relics that still wore a white or checkerboard background
  ["Backrooms/Alien Tech.png", "alien-tech"],
  ["Backrooms/Cursed Doge.png", "cursed-doge"],
  ["Backrooms/God Slayer.jpg", "god-slayer"],
  ["Backrooms/Golden Cross.png", "golden-cross"],
  ["Backrooms/Magical Org.png", "magical-org"],
  ["Backrooms/Magical Urn.png", "magical-urn"],
  ["Backrooms/Mysterious Pendant.png", "mysterious-pendant"],
  ["Backrooms/The Ancient Teapot.jpg", "the-ancient-teapot"],
  ["Pool Rooms/Emerald Stone of Allah.png", "emerald-stone"],
  ["Pool Rooms/Magic Opal.png", "magic-opal"],
  ["Pool Rooms/Rock of Ages.jpg", "rock-of-ages"],
  ["Pool Rooms/Sapphrie amulet.jpg", "sapphire-amulet"],
  ["Pool Rooms/The lost compass.jpg", "the-lost-compass"],
  ["Pool Rooms/hieroglyphics Tablet.jpg", "hieroglyphics-tablet"],
];
const ONLY = process.argv.slice(2);

/** Pale and grey: white paper, or either square of a checkerboard. */
const isLooseBg = (r, g, b, floor = 188) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mn >= floor && mx - mn <= 22;
};
/** `strict`: only a perfectly neutral pure white or the checkerboard's 235
 *  grey — for a PALE OBJECT on a baked checkerboard, whose own whites are
 *  never quite neutral and never quite those two values. */
const isStrictBg = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx - mn <= 1 && (mn >= 254 || Math.abs(mn - 235) <= 1);
};

/** `checker`: a PALE object on a baked checkerboard (a white printer, a
 *  cream robe). "Pale" can't tell the object from a white square, so the
 *  board itself is MEASURED — its square size and phase fitted from every
 *  light/grey transition along the top row and left column — and a pixel
 *  is background only if it is the colour the board should be THERE. A
 *  white printer passes on a white square and fails on the grey one beside
 *  it, so the fill can't run into it. Returns a test (x, y, r, g, b). */
function checkerTest(data, w, h) {
  const at = (x, y) => data[(y * w + x) * 4];
  const cls = (v) => (v > 243 ? 1 : v > 215 && v < 243 ? 0 : -1);
  const fit = (n, get) => {
    const ts = [];
    let prev = cls(get(0));
    for (let i = 1; i < n; i++) {
      const c = cls(get(i));
      if (c >= 0 && prev >= 0 && c !== prev) ts.push(i);
      if (c >= 0) prev = c;
    }
    const gaps = ts.slice(1).map((t, i) => t - ts[i]).filter((g) => g > 3).sort((a, b) => a - b);
    const s0 = gaps[gaps.length >> 1];
    // least squares on t = a + s·k with k counted from the first transition
    const ks = ts.map((t) => Math.round((t - ts[0]) / s0));
    const m = ts.length, sk = ks.reduce((a, b) => a + b, 0), st = ts.reduce((a, b) => a + b, 0);
    const skk = ks.reduce((a, k) => a + k * k, 0), skt = ks.reduce((a, k, i) => a + k * ts[i], 0);
    const s = (m * skt - sk * st) / (m * skk - sk * sk);
    return { a: (st - s * sk) / m, s };
  };
  const gx = fit(w, (x) => at(x, 2)), gy = fit(h, (y) => at(2, y));
  const vals = [[], []];
  for (let x = 0; x < w; x++) { const c = cls(at(x, 2)); if (c >= 0) vals[c].push(at(x, 2)); }
  const med = (v) => v.sort((a, b) => a - b)[v.length >> 1];
  const L = med(vals[1]), G = med(vals[0]);
  const cell = (v, g) => Math.floor((v - g.a) / g.s);
  const near = (v, g) => { const f = (v - g.a) / g.s; return Math.abs(f - Math.round(f)) * g.s < 1.6; };
  const refParity = (cell(2, gx) + cell(2, gy)) & 1, refLight = cls(at(2, 2)) === 1;
  console.log(`  checker: squares ${gx.s.toFixed(2)}×${gy.s.toFixed(2)}px, light ${L}, grey ${G}`);
  const neutral = (i) => {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    return Math.max(r, g, b) - Math.min(r, g, b) <= 8;
  };
  const ratio = L / G;
  /** The board in SHADOW (under a bouncer's seat): its squares are darker
   *  than the measured L and G, but a square and the one beside it still
   *  differ by the board's own ratio, and two squares along it match. */
  const periodic = (x, y, v, light) => {
    for (const [dx, dy, s] of [[1, 0, gx.s], [0, 1, gy.s]]) {
      const o = Math.round(s), o2 = Math.round(2 * s);
      for (const sgn of [1, -1]) {
        const x1 = x + sgn * dx * o, y1 = y + sgn * dy * o, x2 = x + sgn * dx * o2, y2 = y + sgn * dy * o2;
        if (x2 < 0 || y2 < 0 || x2 >= w || y2 >= h) continue;
        const i1 = y1 * w + x1, i2 = y2 * w + x2;
        if (!neutral(i1) || !neutral(i2)) continue;
        const v1 = data[i1 * 4], v2 = data[i2 * 4];
        const rr = light ? v / v1 : v1 / v;
        if (Math.abs(rr - ratio) <= 0.025 && Math.abs(v - v2) <= 6) return true;
      }
    }
    return false;
  };
  const inCell = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return true;
    const i = y * w + x;
    if (!neutral(i)) return false;
    const v = data[i * 4];
    const light = (((cell(x, gx) + cell(y, gy)) & 1) === refParity) === refLight;
    if (light ? Math.abs(v - L) <= 10 : Math.abs(v - G) <= 10) return true;
    return v > 120 && v < L - 10 && periodic(x, y, v, light);
  };
  const test = (x, y, r, g, b) => {
    if (Math.max(r, g, b) - Math.min(r, g, b) > 8) return false;
    const nx = near(x, gx), ny = near(y, gy);
    if (!nx && !ny) return inCell(x, y);
    // A SEAM pixel (JPEG smears it) is background only if the squares on
    // BOTH sides of it are: inside a white printer one side is always the
    // wrong shade, so the fill can't run along the seams into the object.
    const d = 3;
    if (nx && ny) return inCell(x - d, y - d) && inCell(x + d, y - d) && inCell(x - d, y + d) && inCell(x + d, y + d);
    return nx ? inCell(x - d, y) && inCell(x + d, y) : inCell(x, y - d) && inCell(x, y + d);
  };
  test.cellArea = gx.s * gy.s;
  return test;
}

for (const [file, slug, opts = {}] of JOBS) {
  if (ONLY.length && !ONLY.includes(slug)) continue;
  const img = sharp(resolve(SRC, file)).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  // `erase`: boxes (fractions of the picture) painted out before anything
  // else — each pixel blended from the box's left and top edges in its row
  // and column, which is invisible over a flat or gently varying ground.
  for (const [fx0, fy0, fx1, fy1] of opts.erase ?? []) {
    const x0 = Math.max(1, Math.floor(fx0 * w)), y0 = Math.max(1, Math.floor(fy0 * h));
    const x1 = Math.min(w, Math.ceil(fx1 * w)), y1 = Math.min(h, Math.ceil(fy1 * h));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const l = (y * w + (x0 - 1)) * 4, t = ((y0 - 1) * w + x) * 4, o = (y * w + x) * 4;
      const wl = (x1 - x) / (x1 - x0 + (y1 - y0)), wt = 1 - wl;
      for (let c = 0; c < 3; c++) data[o + c] = Math.round(data[l + c] * wl + data[t + c] * wt);
    }
  }
  const px = (i) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2], data[i * 4 + 3]];
  const board = opts.checker ? checkerTest(data, w, h) : null;
  const isBgAt = opts.soft
    ? () => false
    : board
    ? (i, r, g, b) => board(i % w, (i / w) | 0, r, g, b)
    : opts.strict ? (i, r, g, b) => isStrictBg(r, g, b) : (i, r, g, b) => isLooseBg(r, g, b, opts.pale ?? 188);
  const isBg = (r, g, b, i) => isBgAt(i, r, g, b);
  const bg = new Uint8Array(w * h);
  const stack = [];
  // `soft: N`: a PALE object on a faint board (a white blanket on a
  // near-white checkerboard), where no pixel test can tell them apart. Blurred,
  // the board is one flat tone and the object's own shading sits below it:
  // flood from the border through blurred light >= N, then keep only the
  // biggest piece left (a watermark is a stray island, not the object).
  if (opts.soft) {
    const blur = await sharp(resolve(SRC, file)).blur(4).greyscale().raw().toBuffer();
    const q = [];
    const push = (i) => { if (!bg[i] && blur[i] >= opts.soft) { bg[i] = 1; q.push(i); } };
    for (let x = 0; x < w; x++) (push(x), push((h - 1) * w + x));
    for (let y = 0; y < h; y++) (push(y * w), push(y * w + w - 1));
    while (q.length) {
      const i = q.pop(), x = i % w, y = (i / w) | 0;
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (y > 0) push(i - w);
      if (y < h - 1) push(i + w);
    }
    const lab = new Int32Array(w * h).fill(-1);
    const sizes = [];
    for (let i0 = 0; i0 < w * h; i0++) {
      if (bg[i0] || lab[i0] >= 0) continue;
      const id = sizes.length, st = [i0];
      lab[i0] = id;
      let n = 0;
      while (st.length) {
        const i = st.pop(), x = i % w, y = (i / w) | 0;
        n++;
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
          if (j >= 0 && !bg[j] && lab[j] < 0) { lab[j] = id; st.push(j); }
        }
      }
      sizes.push(n);
    }
    const keep = sizes.indexOf(Math.max(...sizes));
    for (let i = 0; i < w * h; i++) if (!bg[i] && lab[i] !== keep) bg[i] = 1;
  }
  if (opts.backdrop) {
    const tol = opts.backdrop;
    const diff = (i, j) => Math.max(Math.abs(data[i * 4] - data[j * 4]), Math.abs(data[i * 4 + 1] - data[j * 4 + 1]), Math.abs(data[i * 4 + 2] - data[j * 4 + 2]));
    const q = [];
    for (let x = 0; x < w; x++) for (const y of [0, h - 1]) { const i = y * w + x; if (!bg[i]) { bg[i] = 1; q.push(i); } }
    for (let y = 0; y < h; y++) for (const x of [0, w - 1]) { const i = y * w + x; if (!bg[i]) { bg[i] = 1; q.push(i); } }
    while (q.length) {
      const i = q.pop();
      const x = i % w, y = (i / w) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j < 0 || bg[j] || diff(i, j) > tol) continue;
        bg[j] = 1;
        q.push(j);
      }
    }
  }
  const seed = (x, y) => {
    const i = y * w + x;
    if (bg[i]) return;
    const [r, g, b, a] = px(i);
    if (a < 16 || isBg(r, g, b, i)) {
      bg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) (seed(x, 0), seed(x, h - 1));
  for (let y = 0; y < h; y++) (seed(0, y), seed(w - 1, y));
  while (stack.length) {
    const i = stack.pop();
    const x = i % w, y = (i / w) | 0;
    if (x > 0) seed(x - 1, y);
    if (x < w - 1) seed(x + 1, y);
    if (y > 0) seed(x, y - 1);
    if (y < h - 1) seed(x, y + 1);
  }
  // A checkerboard shut inside the object (a teapot's handle loop) isn't
  // reached from the border: take any enclosed pale patch that is half light
  // squares and half grey ones. A white highlight is all one shade and stays.
  const seen = new Uint8Array(w * h);
  for (let i0 = 0; i0 < w * h; i0++) {
    if (bg[i0] || seen[i0]) continue;
    const [r0, g0, b0] = px(i0);
    if (!isBg(r0, g0, b0, i0)) continue;
    const comp = [i0];
    seen[i0] = 1;
    let light = 0, grey = 0;
    for (let k = 0; k < comp.length; k++) {
      const i = comp[k];
      const [r, g, b] = px(i);
      if (Math.min(r, g, b) > 235) light++;
      else grey++;
      const x = i % w, y = (i / w) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j < 0 || seen[j] || bg[j]) continue;
        const [rr, gg, bb] = px(j);
        if (!isBg(rr, gg, bb, j)) continue;
        seen[j] = 1;
        comp.push(j);
      }
    }
    // With a measured board the test is trustworthy on its own (a shadowed
    // board has no "light" squares at all), so any enclosed patch of it wider
    // than a couple of squares goes — a white object's matching pixels are
    // penned into single squares by the seams and stay.
    const board2 = board ? 2.5 * board.cellArea : 0;
    if (board ? comp.length > board2 : comp.length > 300 && light > comp.length * 0.25 && grey > comp.length * 0.25) for (const i of comp) bg[i] = 1;
  }
  // `fringe` (with `strict`): the loose test, but only within N pixels of
  // the background the strict fill found. It takes the pale JPEG halo round
  // the edge without being able to run in through a pale patch of the object
  // (the Fallen Star's yellow lobe touches its own white rim).
  if (opts.fringe) {
    let front = [];
    for (let i = 0; i < w * h; i++) if (bg[i]) front.push(i);
    for (let d = 0; d < opts.fringe; d++) {
      const next = [];
      for (const i of front) {
        const x = i % w, y = (i / w) | 0;
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
          if (j < 0 || bg[j]) continue;
          if (!isLooseBg(data[j * 4], data[j * 4 + 1], data[j * 4 + 2])) continue;
          bg[j] = 1;
          next.push(j);
        }
      }
      front = next;
    }
  }
  // `paleAbove`: a fraction of the picture's height. Above it, every pale
  // neutral pixel goes — for a coloured object whose handle loop pens in a
  // sticker's white outline and a checkerboard (the storm lantern).
  if (opts.paleAbove) {
    const yMax = Math.floor(opts.paleAbove * h);
    for (let y = 0; y < yMax; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const [r, g, b] = px(i);
      if (Math.max(r, g, b) - Math.min(r, g, b) <= 24 && Math.min(r, g, b) >= 150) bg[i] = 1;
    }
  }
  // `strict` leaves compression specks of the checkerboard standing: drop any
  // island of kept pixels smaller than a thousandth of the picture.
  if (opts.strict || opts.checker) {
    const done = new Uint8Array(w * h);
    for (let i0 = 0; i0 < w * h; i0++) {
      if (bg[i0] || done[i0]) continue;
      const comp = [i0];
      done[i0] = 1;
      for (let k = 0; k < comp.length; k++) {
        const i = comp[k], x = i % w, y = (i / w) | 0;
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
          if (j < 0 || done[j] || bg[j]) continue;
          done[j] = 1;
          comp.push(j);
        }
      }
      if (comp.length < (w * h) / 1000) for (const i of comp) bg[i] = 1;
    }
  }
  // SWEEP (checker): seam pixels the fill had to leave, and the specks they
  // leave along an object's edge — anything pale and neutral that is mostly
  // surrounded by background goes, three passes.
  if (board) {
    for (let pass = 0; pass < 3; pass++) {
      const drop = [];
      for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
        const i = y * w + x;
        if (bg[i]) continue;
        const [r, g, b] = px(i);
        if (Math.max(r, g, b) - Math.min(r, g, b) > 10 || Math.min(r, g, b) < 200) continue;
        let n = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) n += bg[i + dy * w + dx];
        if (n >= 15) drop.push(i);
      }
      for (const i of drop) bg[i] = 1;
    }
  }
  let cut = 0;
  for (let i = 0; i < w * h; i++) {
    if (bg[i]) {
      data[i * 4 + 3] = 0;
      cut++;
      continue;
    }
    // feather: a pixel touching the background keeps half its alpha
    const x = i % w, y = (i / w) | 0;
    const edge = (x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (y > 0 && bg[i - w]) || (y < h - 1 && bg[i + w]);
    if (edge) data[i * 4 + 3] = Math.round(data[i * 4 + 3] * 0.55);
    // `tint`: recolour what's left, keeping its light and dark as alpha so
    // anti-aliased line art stays smooth.
    if (opts.tint) {
      const lum = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
      data[i * 4 + 3] = Math.round(data[i * 4 + 3] * (1 - lum / 255));
      [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]] = opts.tint;
    }
  }
  await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .trim({ threshold: 1 })
    .resize(512, 512, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 86, alphaQuality: 90 })
    .toFile(resolve(OUT, `${slug}.webp`));
  console.log(`${slug}.webp  ${w}x${h}, ${Math.round((cut / (w * h)) * 100)}% background removed`);
}
