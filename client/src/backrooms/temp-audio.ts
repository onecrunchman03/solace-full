// THE TEMP's voice (Level 4) and the office's own sounds — what gen-sounds made
// for them (`node scripts/gen-sounds.mjs temp` / `office`, client/public/assets/
// office/). The bleeder-audio shape: gained by distance, darkened by the walls
// between, automation scheduled on CHANGE, never per frame.
//
//  · THE SCRAPE — plastic feet on carpet — is the one loop, and it plays only
//    while the mannequin is MOVING and only for a listener who is NOT looking
//    at it (the design: "heard only while it moves and only by those not
//    looking"). If you can hear it, it is coming and you are facing the wrong
//    way.
//  · THE CREAK — a joint locking — the moment it stops because somebody looked.
//  · THE KILL.
//  · The badge reader's deny and accept, and a troffer zone's dip.
import { gameCtx, gameOut } from "./ambience";

const URLS: Record<string, string> = {
  scrape: "/assets/office/temp/scrape.ogg",
  creak: "/assets/office/temp/creak.ogg",
  kill: "/assets/office/temp/kill.ogg",
  "reader-deny": "/assets/office/reader-deny.ogg",
  "reader-accept": "/assets/office/reader-accept.ogg",
  blink: "/assets/office/blink.ogg",
};
/** Lowpass by walls between (0..4+), the same table the other creatures use. */
const WALL_CUT = [18000, 900, 420, 240, 170];
/** How far the scrape carries, in cells. */
const LOOP_RANGE = 26;
const CRY_RANGE = 36;
const LOOP_GAIN = 0.7;
const CRY_GAIN = 1.5;

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

/** Load them all so the office's first sound is never a silent one. */
export function warmTempSound(): void {
  for (const id of Object.keys(URLS)) buffer(id);
}

interface Graph {
  ctx: AudioContext;
  filter: BiquadFilterNode;
  out: GainNode;
  src: AudioBufferSourceNode;
}
let graph: Graph | null = null;
let last = { gain: -1, cut: -1 };

const build = (): Graph | null => {
  const c = gameCtx();
  if (graph && graph.ctx === c) return graph;
  const buf = buffer("scrape");
  if (!buf) return null;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = WALL_CUT[0];
  const out = c.createGain();
  out.gain.value = 0;
  filter.connect(out);
  out.connect(gameOut());
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.connect(filter);
  src.start(0, Math.random() * buf.duration);
  graph = { ctx: c, filter, out, src };
  last = { gain: -1, cut: -1 };
  return graph;
};

/** Per frame from the game (it throttles itself): how far it is (cells; null =
 *  not here), whether it is moving and the listener is NOT looking at it, and
 *  how many walls between. */
let lastAt = 0;
export function updateTempSound(dist: number | null, audible: boolean, walls: number): void {
  const now = performance.now();
  if (now - lastAt < 80) return;
  lastAt = now;
  if (dist === null || !audible) {
    if (graph && last.gain !== 0) {
      graph.out.gain.setTargetAtTime(0, graph.ctx.currentTime, 0.08);
      last.gain = 0;
    }
    return;
  }
  const g = build();
  if (!g) return;
  const t = g.ctx.currentTime;
  const gain = Math.round(LOOP_GAIN * Math.pow(Math.max(0, 1 - dist / LOOP_RANGE), 1.2) * Math.pow(0.6, Math.min(4, walls)) * 100) / 100;
  if (gain !== last.gain) {
    g.out.gain.setTargetAtTime(gain, t, 0.06);
    last.gain = gain;
  }
  const cut = WALL_CUT[Math.min(4, walls)];
  if (cut !== last.cut) {
    g.filter.frequency.setTargetAtTime(cut, t, 0.1);
    last.cut = cut;
  }
}

/** A one-shot: the creak, the kill, the reader or a dip, `dist` cells away
 *  with `walls` between (0 / 0 for a sound at the listener). */
export function officeSfx(kind: "creak" | "kill" | "reader-deny" | "reader-accept" | "blink", dist = 0, walls = 0, gain = 1): void {
  const buf = buffer(kind);
  if (!buf) return;
  const base = gain * CRY_GAIN * Math.pow(Math.max(0, 1 - dist / CRY_RANGE), 1.1) * Math.pow(0.65, Math.min(4, walls));
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

/** Leaving the office: stop the loop for good. */
export function stopTempSound(): void {
  if (!graph) return;
  const g = graph;
  graph = null;
  last = { gain: -1, cut: -1 };
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
