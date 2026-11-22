// THALASSOPHOBIA's sounds (Level 7) — what gen-sounds makes for it
// (`node scripts/gen-sounds.mjs ocean`, client/public/assets/ocean/). The
// lights-audio shape exactly (gained by distance, darkened by walls, panned,
// automation scheduled on CHANGE). Josh previews every file before it ships;
// until a file is there its fetch fails and that sound is simply quiet.
//
//  · ONE LOOP: THE HUM — the thing below circling a swimmer, felt through
//    the water (the swimmer's own, loudest; somebody else's, fainter).
//  · ONE-SHOTS: the shadow passing under, the rise (the water going dark),
//    the strike, the helmet going on, and the subway stair opening.
import { gameCtx, gameOut } from "./ambience";

const URLS: Record<string, string> = {
  hum: "/assets/ocean/deep-hum.ogg",
  pass: "/assets/ocean/deep-pass.ogg",
  rise: "/assets/ocean/deep-rise.ogg",
  strike: "/assets/ocean/deep-strike.ogg",
  helmet: "/assets/ocean/helmet-on.ogg",
  "stair-open": "/assets/ocean/stair-open.ogg",
};
export type OceanLoop = "hum";
export type OceanShot = "pass" | "rise" | "strike" | "helmet" | "stair-open";

/** Lowpass by walls between (0..4+), the table the creatures use. */
const WALL_CUT = [18000, 900, 420, 240, 170];
/** How far each loop carries (cells), and how loud it is at its source. The
 *  sea carries furthest of anything in the game: it is the level's compass. */
const LOOP: Record<OceanLoop, { range: number; gain: number }> = {
  hum: { range: 30, gain: 0.95 },
};
const SHOT_RANGE = 40;

const bufs = new Map<string, AudioBuffer | null>();
let bufCtx: AudioContext | null = null;
const buffer = (id: string): AudioBuffer | null => {
  const c = gameCtx();
  if (bufCtx !== c) {
    bufs.clear();
    bufCtx = c;
  }
  if (bufs.has(id)) return bufs.get(id) ?? null;
  bufs.set(id, null);
  fetch(URLS[id])
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.arrayBuffer();
    })
    .then((ab) => c.decodeAudioData(ab))
    .then((b) => {
      if (bufCtx === c) bufs.set(id, b);
    })
    .catch(() => {
      /* no file, no sound */
    });
  return null;
};

/** Load them all so the level's first sound is never a silent one. */
export function warmOceanSound(): void {
  for (const id of Object.keys(URLS)) buffer(id);
}

interface Graph {
  ctx: AudioContext;
  filter: BiquadFilterNode;
  pan: StereoPannerNode;
  out: GainNode;
  src: AudioBufferSourceNode;
  gain: number;
  cut: number;
  side: number;
}
const graphs = new Map<OceanLoop, Graph>();
const build = (id: OceanLoop): Graph | null => {
  const c = gameCtx();
  const hit = graphs.get(id);
  if (hit && hit.ctx === c) return hit;
  const buf = buffer(id);
  if (!buf) return null;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = WALL_CUT[0];
  const pan = c.createStereoPanner();
  const out = c.createGain();
  out.gain.value = 0;
  filter.connect(pan);
  pan.connect(out);
  out.connect(gameOut());
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.connect(filter);
  src.start(0, Math.random() * buf.duration);
  const g: Graph = { ctx: c, filter, pan, out, src, gain: -1, cut: -1, side: 9 };
  graphs.set(id, g);
  return g;
};

/** A loop's source, `dist` cells away (null = none) with `walls` between,
 *  `pan` -1..1. The game throttles its own calls; this only schedules what
 *  CHANGED. */
export function updateOceanLoop(id: OceanLoop, dist: number | null, walls = 0, pan = 0): void {
  if (dist === null) {
    const g = graphs.get(id);
    if (g && g.gain !== 0) {
      g.out.gain.setTargetAtTime(0, g.ctx.currentTime, 0.25);
      g.gain = 0;
    }
    return;
  }
  const g = build(id);
  if (!g) return;
  const { range, gain: top } = LOOP[id];
  const t = g.ctx.currentTime;
  const near = Math.pow(Math.max(0, 1 - dist / range), 1.2);
  // it comes up through the water: walls barely matter to it
  const wallK = Math.pow(0.85, Math.min(4, walls));
  const gain = Math.round(top * near * wallK * 100) / 100;
  if (gain !== g.gain) {
    g.out.gain.setTargetAtTime(gain, t, 0.12);
    g.gain = gain;
  }
  const cut = Math.max(600, WALL_CUT[Math.min(4, walls)]);
  if (cut !== g.cut) {
    g.filter.frequency.setTargetAtTime(cut, t, 0.1);
    g.cut = cut;
  }
  const side = Math.round(pan * 10) / 10;
  if (side !== g.side) {
    g.pan.pan.setTargetAtTime(side * 0.85, t, 0.08);
    g.side = side;
  }
}

/** A one-shot, `dist` cells away with `walls` between, `pan` -1..1. */
export function oceanSfx(kind: OceanShot, dist = 0, walls = 0, pan = 0, gain = 1): void {
  const buf = buffer(kind);
  if (!buf) return;
  const base = gain * 1.3 * Math.pow(Math.max(0, 1 - dist / SHOT_RANGE), 1.1) * Math.pow(0.65, Math.min(4, walls));
  if (base <= 0.02) return;
  const c = gameCtx();
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = WALL_CUT[Math.min(4, walls)];
  const p = c.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan)) * 0.85;
  filter.connect(p);
  p.connect(gameOut());
  const g = c.createGain();
  g.gain.value = base;
  g.connect(filter);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(g);
  src.onended = () => {
    src.disconnect();
    g.disconnect();
    filter.disconnect();
    p.disconnect();
  };
  src.start();
}

/** Leaving Thalassophobia: every loop down for good. */
export function stopOceanSound(): void {
  for (const [id, g] of graphs) {
    graphs.delete(id);
    try {
      g.out.gain.setTargetAtTime(0, g.ctx.currentTime, 0.2);
    } catch {
      /* context gone */
    }
    setTimeout(() => {
      try {
        g.src.stop();
      } catch {
        /* stopped */
      }
      try {
        g.out.disconnect();
      } catch {
        /* gone */
      }
    }, 600);
  }
}
