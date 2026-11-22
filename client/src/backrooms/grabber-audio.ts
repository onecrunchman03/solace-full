// THE GRABBER's voice (Pipe Dreams) — the five sounds gen-sounds made for it
// (client/public/assets/pipes/grabber-*.ogg).
//
// Josh: "you hear footsteps and monstrous breathing (like a creature so
// hungrily excited to grab you) … the player will not hear the creature until
// its close." So TWO LOOPS — the breathing and the steps — under one wall
// filter, and NOTHING AT ALL past the hearing range the game passes in
// (GRABBER_HEAR_CELLS, 8): the gain is zero at the edge and climbs to full at
// arm's length, which at its 2.4 cells/s walk is about three seconds of
// warning. The steps only play while it is moving; the breathing never stops
// while it is close. Three CRIES on top: the screech when a light finds it,
// the flight, and the grab.
//
// Measured when they were made: breath -21.3dB mean, steps -24.2, flee -21.5,
// grab -22.0, and the screech -25.7 (peak -11.7) — the quiet one, so it plays
// at about twice the others' gain.
//
// The shape is the Bleeder's (bleeder-audio.ts): gained by distance, darkened
// by the walls between, automation scheduled on CHANGE, never per frame.
import { gameCtx, gameOut } from "./ambience";

type Cry = "screech" | "flee" | "grab";
const URL = (id: string): string => `/assets/pipes/grabber-${id}.ogg`;
const WALL_CUT = [18000, 900, 420, 240, 170];
const LOOP_GAIN = 0.8;
const CRY_GAIN: Record<Cry, number> = { screech: 3.2, flee: 1.6, grab: 1.8 };
/** Cries carry further than its breathing — a screech is a warning to the room. */
const CRY_RANGE = 36;

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
  fetch(URL(id))
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

/** Load all five so its first approach is never silent. */
export function warmGrabberSound(): void {
  for (const id of ["breath", "steps", "screech", "flee", "grab"]) buffer(id);
}

interface Graph {
  ctx: AudioContext;
  filter: BiquadFilterNode;
  out: GainNode;
  steps: GainNode;
  srcs: AudioBufferSourceNode[];
}
let graph: Graph | null = null;
let last = { gain: -1, steps: -1, cut: -1 };

const build = (): Graph | null => {
  const c = gameCtx();
  if (graph && graph.ctx === c) return graph;
  const breath = buffer("breath");
  const steps = buffer("steps");
  if (!breath || !steps) return null;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = WALL_CUT[0];
  const out = c.createGain();
  out.gain.value = 0;
  filter.connect(out);
  out.connect(gameOut());
  const stepGain = c.createGain();
  stepGain.gain.value = 0;
  stepGain.connect(filter);
  const srcs: AudioBufferSourceNode[] = [];
  for (const [b, dest] of [[breath, filter], [steps, stepGain]] as [AudioBuffer, AudioNode][]) {
    const src = c.createBufferSource();
    src.buffer = b;
    src.loop = true;
    src.connect(dest);
    src.start(0, Math.random() * b.duration);
    srcs.push(src);
  }
  graph = { ctx: c, filter, out, steps: stepGain, srcs };
  last = { gain: -1, steps: -1, cut: -1 };
  return graph;
};

/** Per frame from the game (it throttles itself): how far it is in cells
 *  (null = out of hearing, or not here), whether it is walking, how many walls
 *  between. The game passes null past GRABBER_HEAR_CELLS; `range` is that
 *  same number, so the fade reaches zero exactly at the edge. */
let lastAt = 0;
export function updateGrabberSound(dist: number | null, walking: boolean, walls: number, range: number): void {
  const now = performance.now();
  if (now - lastAt < 80) return;
  lastAt = now;
  if (dist === null || dist >= range) {
    if (graph && last.gain !== 0) {
      graph.out.gain.setTargetAtTime(0, graph.ctx.currentTime, 0.3);
      last.gain = 0;
    }
    return;
  }
  const g = build();
  if (!g) return;
  const t = g.ctx.currentTime;
  const gain = Math.round(LOOP_GAIN * Math.pow(1 - dist / range, 1.2) * Math.pow(0.6, Math.min(4, walls)) * 100) / 100;
  if (gain !== last.gain) {
    g.out.gain.setTargetAtTime(gain, t, 0.12);
    last.gain = gain;
  }
  const sv = walking ? 1 : 0;
  if (sv !== last.steps) {
    g.steps.gain.setTargetAtTime(sv, t, 0.15);
    last.steps = sv;
  }
  const cut = WALL_CUT[Math.min(4, walls)];
  if (cut !== last.cut) {
    g.filter.frequency.setTargetAtTime(cut, t, 0.1);
    last.cut = cut;
  }
}

/** One of its cries, `dist` cells away with `walls` between. */
export function grabberCry(kind: Cry, dist: number, walls: number): void {
  const buf = buffer(kind);
  if (!buf) return;
  const base = CRY_GAIN[kind] * Math.pow(Math.max(0, 1 - dist / CRY_RANGE), 1.1) * Math.pow(0.65, Math.min(4, walls));
  if (base <= 0.02) return;
  const c = gameCtx();
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = WALL_CUT[Math.min(4, walls)];
  filter.connect(gameOut());
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
  };
  src.start();
}

/** Leaving Pipe Dreams: stop the loops for good. */
export function stopGrabberSound(): void {
  if (!graph) return;
  const g = graph;
  graph = null;
  last = { gain: -1, steps: -1, cut: -1 };
  try {
    g.out.gain.setTargetAtTime(0, g.ctx.currentTime, 0.2);
  } catch {
    /* context gone */
  }
  setTimeout(() => {
    for (const s of g.srcs) {
      try {
        s.stop();
      } catch {
        /* stopped */
      }
    }
    try {
      g.out.disconnect();
    } catch {
      /* gone */
    }
  }, 600);
}
