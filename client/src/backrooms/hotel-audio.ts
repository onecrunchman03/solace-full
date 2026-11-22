// THE TERROR HOTEL's sounds (Level 5) — what gen-sounds made for it
// (`node scripts/gen-sounds.mjs hotel` / `moths`, client/public/assets/hotel/).
// The temp-audio shape: gained by distance, darkened by the walls between,
// automation scheduled on CHANGE, never per frame. Josh previews every file
// before it ships; until a file is there its fetch fails and that sound is
// simply quiet.
//
//  · LOOPS, one each, fed the nearest source by the game: the DEATHMOTHS'
//    flutter (the nearest awake swarm), a FURNACE's roar (the nearest
//    furnace), the BOILER bed (anywhere below stairs) and the party CHATTER
//    behind a door (a lounge or dining room nearby — there is nobody there).
//  · ONE-SHOTS: the lift's chime, ride and doom, the register's pages, the
//    rusty door, the heat's sizzle, a swarm waking, a bite, and the whisper
//    in a furnace.
import { gameCtx, gameOut } from "./ambience";

const URLS: Record<string, string> = {
  flutter: "/assets/hotel/moths/flutter.ogg",
  wake: "/assets/hotel/moths/wake.ogg",
  bite: "/assets/hotel/moths/bite.ogg",
  "furnace-roar": "/assets/hotel/furnace-roar.ogg",
  "furnace-whisper": "/assets/hotel/furnace-whisper.ogg",
  boiler: "/assets/hotel/boiler.ogg",
  chatter: "/assets/hotel/chatter.ogg",
  "lift-chime": "/assets/hotel/lift-chime.ogg",
  "lift-ride": "/assets/hotel/lift-ride.ogg",
  "lift-doom": "/assets/hotel/lift-doom.ogg",
  "register-page": "/assets/hotel/register-page.ogg",
  "rusty-door": "/assets/hotel/rusty-door.ogg",
  "heat-sizzle": "/assets/hotel/heat-sizzle.ogg",
};
export type HotelLoop = "flutter" | "furnace-roar" | "boiler" | "chatter";
export type HotelShot = "wake" | "bite" | "furnace-whisper" | "lift-chime" | "lift-ride" | "lift-doom" | "register-page" | "rusty-door" | "heat-sizzle";

/** Lowpass by walls between (0..4+), the table the creatures use. */
const WALL_CUT = [18000, 900, 420, 240, 170];
/** How far each loop carries (cells), and how loud it is at its source. */
const LOOP: Record<HotelLoop, { range: number; gain: number }> = {
  flutter: { range: 22, gain: 0.85 },
  "furnace-roar": { range: 10, gain: 0.7 },
  boiler: { range: 1, gain: 0.32 },
  chatter: { range: 14, gain: 0.28 },
};
const SHOT_RANGE = 36;

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

/** Load them all so the hotel's first sound is never a silent one. */
export function warmHotelSound(): void {
  for (const id of Object.keys(URLS)) buffer(id);
}

interface Graph {
  ctx: AudioContext;
  filter: BiquadFilterNode;
  out: GainNode;
  src: AudioBufferSourceNode;
  gain: number;
  cut: number;
}
const graphs = new Map<HotelLoop, Graph>();
const build = (id: HotelLoop): Graph | null => {
  const c = gameCtx();
  const hit = graphs.get(id);
  if (hit && hit.ctx === c) return hit;
  const buf = buffer(id);
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
  const g: Graph = { ctx: c, filter, out, src, gain: -1, cut: -1 };
  graphs.set(id, g);
  return g;
};

/** A loop's source, `dist` cells away (null = none) with `walls` between. For
 *  the boiler bed, dist 0 means "below stairs" and null means not. The game
 *  throttles its own calls; this only schedules what CHANGED. */
export function updateHotelLoop(id: HotelLoop, dist: number | null, walls = 0): void {
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
  const near = id === "boiler" ? 1 : Math.pow(Math.max(0, 1 - dist / range), 1.2);
  const gain = Math.round(top * near * Math.pow(0.6, Math.min(4, walls)) * 100) / 100;
  if (gain !== g.gain) {
    g.out.gain.setTargetAtTime(gain, t, 0.12);
    g.gain = gain;
  }
  const cut = WALL_CUT[Math.min(4, walls)];
  if (cut !== g.cut) {
    g.filter.frequency.setTargetAtTime(cut, t, 0.1);
    g.cut = cut;
  }
}

/** A one-shot, `dist` cells away with `walls` between (0 / 0 at the listener). */
export function hotelSfx(kind: HotelShot, dist = 0, walls = 0, gain = 1): void {
  const buf = buffer(kind);
  if (!buf) return;
  const base = gain * 1.3 * Math.pow(Math.max(0, 1 - dist / SHOT_RANGE), 1.1) * Math.pow(0.65, Math.min(4, walls));
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

/** Leaving the hotel: every loop down for good. */
export function stopHotelSound(): void {
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
