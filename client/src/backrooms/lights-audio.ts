// LIGHTS OUT's sounds (Level 6) — what gen-sounds makes for it
// (`node scripts/gen-sounds.mjs lights`, client/public/assets/lights/). The
// hotel-audio shape (gained by distance, darkened by the walls between,
// automation scheduled on CHANGE, never per frame), with one thing more:
// every loop is PANNED, because on this level you find things by ear — the sea
// behind the hatch most of all. Josh previews every file before it ships;
// until a file is there its fetch fails and that sound is simply quiet.
//
//  · LOOPS, one each, fed the nearest source by the game: THE SEA behind the
//    hatch (heard from far off — it is how you find it) and THE LISTENER's
//    breathing (the nearest one, close).
//  · ONE-SHOTS: the cold hand (only you), its whisper (anyone near), its
//    lunge, distant footsteps that aren't yours, the wheel fitting and the
//    hatch opening.
import { gameCtx, gameOut } from "./ambience";

const URLS: Record<string, string> = {
  surf: "/assets/lights/surf.ogg",
  breath: "/assets/lights/listener-breath.ogg",
  touch: "/assets/lights/touch.ogg",
  whisper: "/assets/lights/whisper.ogg",
  lunge: "/assets/lights/lunge.ogg",
  "far-steps": "/assets/lights/far-steps.ogg",
  "wheel-fit": "/assets/lights/wheel-fit.ogg",
  "hatch-open": "/assets/lights/hatch-open.ogg",
};
export type LightsLoop = "surf" | "breath";
export type LightsShot = "touch" | "whisper" | "lunge" | "far-steps" | "wheel-fit" | "hatch-open";

/** Lowpass by walls between (0..4+), the table the creatures use. */
const WALL_CUT = [18000, 900, 420, 240, 170];
/** How far each loop carries (cells), and how loud it is at its source. The
 *  sea carries furthest of anything in the game: it is the level's compass. */
const LOOP: Record<LightsLoop, { range: number; gain: number }> = {
  surf: { range: 32, gain: 0.9 },
  breath: { range: 9, gain: 0.7 },
};
const SHOT_RANGE = 30;

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
export function warmLightsSound(): void {
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
const graphs = new Map<LightsLoop, Graph>();
const build = (id: LightsLoop): Graph | null => {
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

/** Left/right of the listener for a source: -1 hard left … 1 hard right.
 *  `yaw` is the camera's (radians, three.js: 0 looks down -z). */
export function panFor(px: number, py: number, yaw: number, sx: number, sy: number): number {
  const dx = sx - px;
  const dy = sy - py;
  if (Math.hypot(dx, dy) < 0.5) return 0;
  // the camera's right vector on the floor: yaw 0 looks along -y (north)
  const rx = Math.cos(yaw);
  const ry = -Math.sin(yaw);
  const d = Math.hypot(dx, dy);
  return Math.max(-1, Math.min(1, (dx * rx + dy * ry) / d));
}

/** A loop's source, `dist` cells away (null = none) with `walls` between,
 *  `pan` -1..1. The game throttles its own calls; this only schedules what
 *  CHANGED. */
export function updateLightsLoop(id: LightsLoop, dist: number | null, walls = 0, pan = 0): void {
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
  // walls muffle the sea but never quite stop it: it is the compass
  const wallK = id === "surf" ? Math.pow(0.75, Math.min(4, walls)) : Math.pow(0.6, Math.min(4, walls));
  const gain = Math.round(top * near * wallK * 100) / 100;
  if (gain !== g.gain) {
    g.out.gain.setTargetAtTime(gain, t, 0.12);
    g.gain = gain;
  }
  const cut = id === "surf" ? Math.max(600, WALL_CUT[Math.min(4, walls)]) : WALL_CUT[Math.min(4, walls)];
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
export function lightsSfx(kind: LightsShot, dist = 0, walls = 0, pan = 0, gain = 1): void {
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

/** Leaving Lights Out: every loop down for good. */
export function stopLightsSound(): void {
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
