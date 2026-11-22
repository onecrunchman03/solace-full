// THE BLEEDER's voice (Level 3) — the six sounds gen-sounds made for it
// (`node scripts/gen-sounds.mjs bleeder`, client/public/assets/station/bleeder/).
//
// Three LOOPS run under one wall filter and are crossfaded by what it is
// doing: idle while it waits or feeds, hunt while it searches (and through
// the scream's freeze), run for the charge and the flight. The three CRIES
// are one-shots on top: the scream the moment it has seen someone, the
// retreat shriek when the beam drives it off, the attack on the touch.
// Measured when they were made: the cries peak ~10dB under the loops, so
// they play at about three times the loops' gain.
//
// The shape is the alligator's munch and the stalker's loops: gained by
// distance, darkened by the walls between, and the automation is scheduled
// on CHANGE, never per frame (CLAUDE.md → THE FLOOR STAYS SMOOTH).
import { gameCtx, gameOut } from "./ambience";

type Loop = "idle" | "hunt" | "run";
type Cry = "scream" | "retreat" | "attack";
const URL = (id: string): string => `/assets/station/bleeder/${id}.ogg`;
/** Lowpass by walls between (0..4+), the same table the other creatures use. */
const WALL_CUT = [18000, 900, 420, 240, 170];
/** How far it carries, in cells. */
const LOOP_RANGE = 30;
const CRY_RANGE = 44;
const LOOP_GAIN = 0.55;
const CRY_GAIN = 1.7;

const bufs = new Map<string, AudioBuffer | null>();
let bufCtx: AudioContext | null = null;
const buffer = (id: string): AudioBuffer | null => {
  const c = gameCtx();
  if (bufCtx !== c) {
    // a closed context (leaving the game) takes its buffers' graph with it
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

/** Load all six so its first appearance is never silent. */
export function warmBleederSound(): void {
  for (const id of ["idle", "hunt", "run", "scream", "retreat", "attack"]) buffer(id);
}

interface Graph {
  ctx: AudioContext;
  filter: BiquadFilterNode;
  out: GainNode;
  gains: Record<Loop, GainNode>;
  srcs: AudioBufferSourceNode[];
}
let graph: Graph | null = null;
let last = { loop: "" as Loop | "", gain: -1, cut: -1 };

const build = (): Graph | null => {
  const c = gameCtx();
  if (graph && graph.ctx === c) return graph;
  const loops: Loop[] = ["idle", "hunt", "run"];
  const ready = loops.map((l) => buffer(l));
  if (ready.some((b) => !b)) return null;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = WALL_CUT[0];
  const out = c.createGain();
  out.gain.value = 0;
  filter.connect(out);
  out.connect(gameOut());
  const gains = {} as Record<Loop, GainNode>;
  const srcs: AudioBufferSourceNode[] = [];
  loops.forEach((l, i) => {
    const g = c.createGain();
    g.gain.value = 0;
    g.connect(filter);
    const src = c.createBufferSource();
    src.buffer = ready[i];
    src.loop = true;
    src.connect(g);
    // start each loop somewhere in itself, not always at its first second
    src.start(0, Math.random() * (ready[i]?.duration ?? 0));
    gains[l] = g;
    srcs.push(src);
  });
  graph = { ctx: c, filter, out, gains, srcs };
  last = { loop: "", gain: -1, cut: -1 };
  return graph;
};

const loopFor = (mode: string): Loop => (mode === "chase" || mode === "retreat" ? "run" : mode === "hunt" || mode === "scream" ? "hunt" : "idle");

/** Per frame from the game (it throttles itself): how far it is (cells; null
 *  = not here), what it is doing, how many walls between. */
let lastAt = 0;
export function updateBleederSound(dist: number | null, mode: string, walls: number): void {
  const now = performance.now();
  if (now - lastAt < 80) return;
  lastAt = now;
  if (dist === null) {
    if (graph && last.gain !== 0) {
      graph.out.gain.setTargetAtTime(0, graph.ctx.currentTime, 0.35);
      last.gain = 0;
    }
    return;
  }
  const g = build();
  if (!g) return;
  const t = g.ctx.currentTime;
  const loop = loopFor(mode);
  if (loop !== last.loop) {
    for (const l of ["idle", "hunt", "run"] as Loop[]) g.gains[l].gain.setTargetAtTime(l === loop ? 1 : 0, t, 0.25);
    last.loop = loop;
  }
  const gain = Math.round(LOOP_GAIN * Math.pow(Math.max(0, 1 - dist / LOOP_RANGE), 1.3) * Math.pow(0.6, Math.min(4, walls)) * 100) / 100;
  if (gain !== last.gain) {
    g.out.gain.setTargetAtTime(gain, t, 0.12);
    last.gain = gain;
  }
  const cut = WALL_CUT[Math.min(4, walls)];
  if (cut !== last.cut) {
    g.filter.frequency.setTargetAtTime(cut, t, 0.1);
    last.cut = cut;
  }
}

/** One of its cries, `dist` cells away with `walls` between. */
export function bleederCry(kind: Cry, dist: number, walls: number): void {
  const buf = buffer(kind);
  if (!buf) return;
  const base = CRY_GAIN * Math.pow(Math.max(0, 1 - dist / CRY_RANGE), 1.1) * Math.pow(0.65, Math.min(4, walls));
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

/** Leaving the station: stop the loops for good. */
export function stopBleederSound(): void {
  if (!graph) return;
  const g = graph;
  graph = null;
  last = { loop: "", gain: -1, cut: -1 };
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
