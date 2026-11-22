// The Level 0 soundscape.
//
// THE BED: "Fluorescent Static" from Josh's Liminal Worlds pack, looped
// gaplessly (synth hum fallback only if the file is missing — the room must
// never be silent).
//
// FOOTSTEPS: Josh's carpet-walk sample, onset-sliced — every in-game
// footfall is a real recorded step. File-only by design.

let ctx: AudioContext | null = null;
let humNodes: { stop: () => void } | null = null;
// ONE master bus for every world sound (bed, footsteps, entity, gear SFX) so
// the pause menu's output slider has a single knob to turn. Player VOICES
// have their own context/graph in voicechat.ts (its own slider).
let masterBus: GainNode | null = null;
let masterLevel = 1;

function ensureCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  return ctx;
}

/** The shared game-audio context — gear SFX ride it too, so one close()
 *  tears the whole soundscape down when you leave. */
export function gameCtx(): AudioContext {
  return ensureCtx();
}

/** The master output node everything world-side connects to. */
export function gameOut(): AudioNode {
  const c = ensureCtx();
  if (!masterBus) {
    masterBus = c.createGain();
    masterBus.gain.value = masterLevel;
    masterBus.connect(c.destination);
  }
  return masterBus;
}

/** Pause menu → output volume (0..1.5). Persists in the backrooms settings. */
export function setGameVolume(v: number): void {
  masterLevel = Math.max(0, Math.min(1.5, v));
  if (masterBus && ctx) masterBus.gain.setTargetAtTime(masterLevel, ctx.currentTime, 0.05);
}

// THE BED'S DUCK: the level's hum plays through this, so a ROOM SOUND can
// sit over a quieter hum and a "silence" room can hush it altogether.
let bedDuck: GainNode | null = null;
function bedOut(): AudioNode {
  const c = ensureCtx();
  if (!bedDuck) {
    bedDuck = c.createGain();
    bedDuck.gain.value = 1;
    bedDuck.connect(gameOut());
  }
  return bedDuck;
}

// ---- ROOM SOUNDS (the map editor's Sound setting — surfaces.ts ROOM_SOUNDS) --
// A room may play a loop over the level's hum while you stand in it. The game
// asks for the sound under the player a few times a second; a change
// crossfades the old loop out and the new one in over a couple of seconds,
// so walking through a doorway reads as leaving one room for another.
let roomNow: string | null = null;
let roomLayer: { gain: GainNode; src: AudioBufferSourceNode } | null = null;
const roomBuffers = new Map<string, Promise<AudioBuffer | null>>();
function roomBuffer(url: string): Promise<AudioBuffer | null> {
  let p = roomBuffers.get(url);
  if (!p) {
    const c = ensureCtx();
    p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((ab) => c.decodeAudioData(ab))
      .catch(() => null);
    roomBuffers.set(url, p);
  }
  return p;
}
/** The room sound where the player stands: a loop's url, "silence" to hush
 *  the level's hum, or null for the level's own. */
export function setRoomSound(want: string | null): void {
  if (want === roomNow) return;
  roomNow = want;
  const c = ensureCtx();
  // the old loop fades out whatever comes next
  if (roomLayer) {
    const old = roomLayer;
    roomLayer = null;
    old.gain.gain.setTargetAtTime(0, c.currentTime, 0.6);
    setTimeout(() => {
      try {
        old.src.stop();
      } catch {
        /* stopped */
      }
      old.gain.disconnect();
    }, 3000);
  }
  // the level's hum: full on its own, hushed for silence, lowered under a loop
  bedOut();
  bedDuck!.gain.setTargetAtTime(want === null ? 1 : want === "silence" ? 0 : 0.45, c.currentTime, 0.7);
  if (!want || want === "silence") return;
  void roomBuffer(want).then((buf) => {
    if (!buf || roomNow !== want || roomLayer) return;
    const gain = c.createGain();
    gain.gain.value = 0;
    gain.connect(gameOut());
    gain.gain.setTargetAtTime(0.42, c.currentTime, 0.8);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(gain);
    // start somewhere in the loop, not always at its first second
    src.start(0, Math.random() * buf.duration);
    roomLayer = { gain, src };
  });
}

/** The ambience bed: one looped file per LEVEL — Level 0's fluorescent
 *  static, the Poolrooms' humid echo (Josh's pools.mp3, loop-crossfaded to
 *  ogg) — decoded and looped gaplessly with a slow fade-in. */
let ambStarted = false;
type HumBed = "carpet" | "pools" | "pipes" | "station" | "office" | "hotel" | "lights" | "ocean" | "cave" | "suburb";
let humBed: HumBed = "carpet";
const BED_URL: Record<HumBed, string> = {
  carpet: "/assets/ambience.ogg",
  pools: "/assets/pools/ambience.ogg",
  // PIPE DREAMS: the boiler-tunnel bed (generated, scripts/gen-sounds.mjs pipes).
  pipes: "/assets/pipes/ambience.ogg",
  // THE ELECTRICAL STATION: transformer hum and dying tubes (gen-sounds station).
  station: "/assets/station/ambience.ogg",
  // THE ABANDONED OFFICE: rain on the windows, the building's pipes under it
  // (gen-sounds office — Josh previews it before it ships; until then the
  // fetch fails and the office is quiet)
  office: "/assets/office/ambience.ogg",
  // THE TERROR HOTEL: a band playing somewhere through the walls (gen-sounds
  // hotel — Josh previews it before it ships; until then the fetch fails)
  hotel: "/assets/hotel/ambience.ogg",
  // LIGHTS OUT: drips in the dark and a very low room tone, nothing else
  // (gen-sounds lights — Josh previews it before it ships)
  lights: "/assets/lights/ambience.ogg",
  // THALASSOPHOBIA: open water lapping at concrete, wind through empty
  // windows high up (gen-sounds ocean — Josh previews it before it ships)
  ocean: "/assets/ocean/ambience.ogg",
  // THE CAVE SYSTEM: water dripping into pools in a huge dark cave, a river
  // far off (gen-sounds cave — Josh previews it before it ships)
  cave: "/assets/cave/ambience.ogg",
  // THE SUBURBS: a still night — crickets, a dog far off, a highway further
  // (gen-sounds suburb — Josh previews it before it ships)
  suburb: "/assets/suburb/ambience.ogg",
};

/** Level travel swaps the bed mid-session; a no-op when it already matches. */
export function setHumBed(bed: HumBed): void {
  if (humBed === bed) return;
  humBed = bed;
  if (ambStarted) {
    stopHum(); // fades out over ~1.5s while the new bed fades in
    startHum();
  }
}

export function startHum(): void {
  if (ambStarted) return;
  ambStarted = true;
  const c = ensureCtx();
  const started = humBed;
  fetch(BED_URL[humBed])
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.arrayBuffer();
    })
    .then((ab) => c.decodeAudioData(ab))
    .then((buf) => {
      // The bed may have been swapped (level travel) while this decoded —
      // a stale resolution must not double-layer over the new bed.
      if (!ambStarted || humBed !== started || humNodes) return;
      const master = c.createGain();
      master.gain.value = 0;
      master.connect(bedOut());
      master.gain.setTargetAtTime(0.38, c.currentTime, 2.5);
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(master);
      src.start();
      humNodes = {
        stop: () => {
          master.gain.setTargetAtTime(0, c.currentTime, 0.4);
          setTimeout(() => {
            try {
              src.stop();
            } catch {
              /* stopped */
            }
            master.disconnect();
          }, 1500);
        },
      };
    })
    .catch(() => {
      // Stale-failure guard, then the synth fluorescent hum — a wrong-level
      // bed beats a silent room even in the Poolrooms.
      if (ambStarted && humBed === started && !humNodes) startSynthHum();
    });
}

function startSynthHum(): void {
  const c = ensureCtx();
  if (humNodes) return;
  const master = c.createGain();
  master.gain.value = 0;
  master.connect(bedOut());
  // Fade the room in over a few seconds — you notice the hum late, like
  // walking into any real building.
  master.gain.setTargetAtTime(0.055, c.currentTime, 2.5);

  const parts: (OscillatorNode | AudioBufferSourceNode)[] = [];
  const HARMONICS: [number, number][] = [
    [120, 1.0],
    [240, 0.42],
    [360, 0.2],
    [480, 0.1],
  ];
  for (const [freq, level] of HARMONICS) {
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    // Slight detune per lamp-bank so it beats gently instead of ringing pure.
    osc.detune.value = (Math.random() - 0.5) * 8;
    const g = c.createGain();
    g.gain.value = level;
    osc.connect(g);
    g.connect(master);
    osc.start();
    parts.push(osc);
  }
  // Air: pink-ish noise through a dark lowpass.
  const noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const data = noiseBuf.getChannelData(0);
  let lp = 0;
  for (let i = 0; i < data.length; i++) {
    lp = lp * 0.94 + (Math.random() * 2 - 1) * 0.06;
    data[i] = lp * 5;
  }
  const noise = c.createBufferSource();
  noise.buffer = noiseBuf;
  noise.loop = true;
  const nf = c.createBiquadFilter();
  nf.type = "lowpass";
  nf.frequency.value = 420;
  const ng = c.createGain();
  ng.gain.value = 0.5;
  noise.connect(nf);
  nf.connect(ng);
  ng.connect(master);
  noise.start();
  parts.push(noise);

  // The slow wander: an LFO breathing the whole bed ±20%.
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.05 + Math.random() * 0.04;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 0.011;
  lfo.connect(lfoGain);
  lfoGain.connect(master.gain);
  lfo.start();
  parts.push(lfo);

  humNodes = {
    stop: () => {
      master.gain.setTargetAtTime(0, c.currentTime, 0.4);
      setTimeout(() => {
        for (const p of parts) {
          try {
            p.stop();
          } catch {
            /* already stopped */
          }
        }
        master.disconnect();
      }, 1500);
    },
  };
}

export function stopHum(): void {
  humNodes?.stop();
  humNodes = null;
  ambStarted = false;
  setRoomSound(null);
}

// ---- Footsteps: Josh's carpet sample, ONSET-SLICED --------------------------
// "Walk on Carpet Sound Effect" (staged as /assets/footsteps.ogg) is a ~7s
// multi-step take. Random windows landed between footfalls and read as
// inconsistent — so after decoding, the ONSETS are detected once (RMS peaks
// with a refractory gap) and each in-game footfall plays the next real step
// from its actual start. File-only by Josh's call: no synth fallback.

// One bank per SURFACE — the Poolrooms walk on tile and wade through water
// (Josh's samples), Level 0 keeps its carpet. Same onset-slicing for all.
export type StepSurface = "carpet" | "tile" | "water" | "concrete";
interface StepBank {
  buf: AudioBuffer | null;
  onsets: number[];
  idx: number;
  loading: boolean;
  url: string;
}
const stepBanks: Record<StepSurface, StepBank> = {
  carpet: { buf: null, onsets: [], idx: 0, loading: false, url: "/assets/footsteps.ogg" },
  tile: { buf: null, onsets: [], idx: 0, loading: false, url: "/assets/pools/steps_tile.ogg" },
  water: { buf: null, onsets: [], idx: 0, loading: false, url: "/assets/pools/steps_water.ogg" },
  concrete: { buf: null, onsets: [], idx: 0, loading: false, url: "/assets/pipes/steps-concrete.ogg" },
};

/** Find step transients in a walking recording: 10ms RMS windows, a rising
 *  edge past 1.6× the mean level = a footfall, refractory 240ms so one step
 *  can't double-count. Exported for the casino floor's steps (steps.ts), which
 *  slices Josh's carpet sample the same way — one implementation of the tricky
 *  part, two rooms. */
export function detectOnsets(buf: AudioBuffer): number[] {
  const data = buf.getChannelData(0);
  const win = Math.floor(buf.sampleRate * 0.01); // 10ms windows
  const rms: number[] = [];
  for (let i = 0; i + win < data.length; i += win) {
    let sum = 0;
    for (let j = i; j < i + win; j++) sum += data[j] * data[j];
    rms.push(Math.sqrt(sum / win));
  }
  const mean = rms.reduce((a, b) => a + b, 0) / rms.length;
  const gate = mean * 1.6;
  const onsets: number[] = [];
  let last = -1;
  for (let i = 1; i < rms.length; i++) {
    const t = (i * win) / buf.sampleRate;
    if (rms[i] > gate && rms[i - 1] <= gate && (last < 0 || t - last > 0.24)) {
      onsets.push(Math.max(0, t - 0.02)); // start just before the peak
      last = t;
    }
  }
  return onsets.length >= 2 ? onsets : [0, buf.duration / 2];
}

function ensureStepBuffer(surface: StepSurface): void {
  const bank = stepBanks[surface];
  if (bank.buf || bank.loading) return;
  bank.loading = true;
  const c = ensureCtx();
  fetch(bank.url)
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.arrayBuffer();
    })
    .then((ab) => c.decodeAudioData(ab))
    .then((buf) => {
      bank.buf = buf;
      bank.onsets = detectOnsets(buf);
    })
    .catch(() => {
      /* no file, no steps — the sample IS the sound (Josh's call) */
    });
}

/** One carpet footstep. `hard` for sprinting, `soft` for crouching (Josh:
 *  crouch steps are even quieter — and the entity won't hear them at all).
 *  `gainScale` fades a step that isn't yours — the boat wake reuses the
 *  water slices at a distance (Aug 2026). */
export function footstep(hard = false, soft = false, surface: StepSurface = "carpet", gainScale = 1): void {
  const c = ensureCtx();
  ensureStepBuffer(surface);
  const bank = stepBanks[surface];
  if (!bank.buf || !bank.onsets.length) return;
  // Water slices run longer — a wade is a slosh, not a tap.
  const SLICE = surface === "water" ? 0.42 : 0.32;
  const start = bank.onsets[bank.idx % bank.onsets.length];
  bank.idx++;
  const src = c.createBufferSource();
  src.buffer = bank.buf;
  src.playbackRate.value = (hard ? 1.05 : 1) + (Math.random() - 0.5) * 0.05;
  const g = c.createGain();
  // Soft: a walk is barely-there, a run is present but never a stomp.
  // Tile carries a touch more than carpet (hard soles on glaze); water is
  // the loudest thing your feet can do down there — the entity-bait tradeoff
  // players can FEEL.
  const base = surface === "water" ? (hard ? 0.34 : 0.2) : surface === "tile" || surface === "concrete" ? (hard ? 0.26 : 0.15) : hard ? 0.24 : 0.13;
  const level = base * (0.95 + Math.random() * 0.1) * (soft ? 0.35 : 1) * gainScale;
  const t = c.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + 0.035);
  g.gain.setValueAtTime(level, t + SLICE - 0.1);
  g.gain.linearRampToValueAtTime(0, t + SLICE);
  src.connect(g);
  g.connect(gameOut());
  src.start(t, start, SLICE + 0.02);
}

// ---- THE ENTITY's voice -----------------------------------------------------
// Two seamless loops (Josh's files): walking while it wanders, the scream
// while it hunts. Same physics as voices: distance falloff + wall-occlusion
// lowpass, and NO gaps in the scream — the buffers loop natively and only
// GAIN moves, so the sound never restarts mid-chase.

let entReady = false;
let entWalkGain: GainNode | null = null;
let entScreamGain: GainNode | null = null;
let entFilter: BiquadFilterNode | null = null;

function ensureEntitySound(): void {
  if (entReady) return;
  entReady = true;
  const c = ensureCtx();
  entFilter = c.createBiquadFilter();
  entFilter.type = "lowpass";
  entFilter.frequency.value = 18000;
  entFilter.connect(gameOut());
  const hook = (url: string): GainNode => {
    const g = c.createGain();
    g.gain.value = 0;
    g.connect(entFilter!);
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((ab) => c.decodeAudioData(ab))
      .then((buf) => {
        const src = c.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(g);
        src.start();
      })
      .catch(() => {});
    return g;
  };
  entWalkGain = hook("/assets/entity/walking.mp3");
  // The Howler chase loop (Josh's pick, July 2026 — replaced scream.mp3;
  // NEW filename on purpose: /assets/entity/* caches for a day, and a fresh
  // name reaches everyone immediately).
  entScreamGain = hook("/assets/entity/chase.mp3");
}

const WALL_CUT = [18000, 900, 420, 240, 170];

// ---- THE STALKER's voice ----------------------------------------------------
// Josh's rule: the SCP-4666 sound plays ONLY while it is actively hunting a
// player to kill. Same physics as the entity's loops: distance falloff +
// wall-occlusion lowpass, gain-only moves so the loop never restarts.
let stalkerReady = false;
let stalkerGain: GainNode | null = null;
let stalkerFilter: BiquadFilterNode | null = null;

function ensureStalkerSound(): void {
  if (stalkerReady) return;
  stalkerReady = true;
  const c = ensureCtx();
  stalkerFilter = c.createBiquadFilter();
  stalkerFilter.type = "lowpass";
  stalkerFilter.frequency.value = 18000;
  stalkerFilter.connect(gameOut());
  const g = c.createGain();
  g.gain.value = 0;
  g.connect(stalkerFilter);
  stalkerGain = g;
  fetch("/assets/stalker/scp4666.ogg")
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.arrayBuffer();
    })
    .then((ab) => c.decodeAudioData(ab))
    .then((buf) => {
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(g);
      src.start();
    })
    .catch(() => {
      /* no file, no voice */
    });
}

// THE BURN (Josh, Sep 30 2026: "have a burning sound play while it's being
// shined with light"). Its own always-running loop, gain-gated like the
// voice, so it starts the instant a beam lands and stops when it breaks or
// the beam moves off — and anyone near enough hears it, not only the one
// holding the light.
let burnGain: GainNode | null = null;
let burnReady = false;
function ensureBurnSound(): void {
  if (burnReady || !stalkerFilter) return;
  burnReady = true;
  const c = ensureCtx();
  const g = c.createGain();
  g.gain.value = 0;
  g.connect(stalkerFilter);
  burnGain = g;
  fetch("/assets/stalker/burn.ogg")
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.arrayBuffer();
    })
    .then((ab) => c.decodeAudioData(ab))
    .then((buf) => {
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(g);
      src.start();
    })
    .catch(() => {
      /* no file, no burn */
    });
}

/** Per-frame: how far THE STALKER is (cells; null = not present), whether
 *  it's HUNTING (the only state that speaks), walls between you, and whether
 *  a beam is BURNING it. */
/** Schedule a ramp only when its target has moved (Oct 2026 review: the
 *  creature sounds queued fresh automation on every param every frame — the
 *  house rule is automation on CHANGE). */
const aimed = new WeakMap<AudioParam, number>();
function aim(p: AudioParam, v: number, t: number, tc: number): void {
  const last = aimed.get(p);
  if (last !== undefined && Math.abs(last - v) <= Math.max(0.004, Math.abs(v) * 0.02)) return;
  aimed.set(p, v);
  p.setTargetAtTime(v, t, tc);
}

export function updateStalkerSound(dist: number | null, hunting: boolean, walls: number, burning = false): void {
  if (dist !== null) ensureStalkerSound();
  if (!stalkerReady || !stalkerGain || !stalkerFilter || !ctx) return;
  const t = ctx.currentTime;
  if (burning) ensureBurnSound();
  if (burnGain) {
    const on = burning && dist !== null && dist <= 26;
    const b = on ? Math.pow(Math.max(0, 1 - dist / 26), 1.1) * Math.pow(0.6, Math.min(4, walls)) : 0;
    aim(burnGain.gain, b * 1.1, t, on ? 0.05 : 0.25);
    if (on) aim(stalkerFilter.frequency, WALL_CUT[Math.min(4, walls)], t, 0.12);
  }
  if (dist === null || dist > 22 || !hunting) {
    aim(stalkerGain.gain, 0, t, 0.15);
    return;
  }
  const base = Math.pow(Math.max(0, 1 - dist / 22), 1.3) * Math.pow(0.55, Math.min(4, walls));
  aim(stalkerFilter.frequency, WALL_CUT[Math.min(4, walls)], t, 0.12);
  aim(stalkerGain.gain, base * 0.95, t, 0.08);
}

// ---- THE SHY GUY's voice ----------------------------------------------------
// Unlike the other two, this one is a ONE-SHOT with an onset that matters:
// the scream IS the trigger moment (Josh: "use his sound when he starts
// chasing a player"). A gain-gated always-running loop would join the scream
// half way through, so the buffer is started fresh at the trigger and stopped
// when it breaks off — while distance and wall occlusion ride the same
// physics as everything else down here.
let shyBuf: AudioBuffer | null = null;
let shyFetching = false;
let shySrc: AudioBufferSourceNode | null = null;
let shyGain: GainNode | null = null;
let shyFilter: BiquadFilterNode | null = null;

function ensureShySound(): void {
  if (shyFetching) return;
  shyFetching = true;
  const c = ensureCtx();
  fetch("/assets/pools/shy-scream.ogg")
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.arrayBuffer();
    })
    .then((ab) => c.decodeAudioData(ab))
    .then((buf) => {
      shyBuf = buf;
    })
    .catch(() => {
      /* no file, no scream */
    });
}

/** It has seen you. Start the scream from its first frame. */
export function shyScream(): void {
  ensureShySound();
  const c = ensureCtx();
  if (!shyBuf || shySrc) return;
  shyFilter = c.createBiquadFilter();
  shyFilter.type = "lowpass";
  shyFilter.frequency.value = 18000;
  shyFilter.connect(gameOut());
  shyGain = c.createGain();
  shyGain.gain.value = 0;
  shyGain.connect(shyFilter);
  shySrc = c.createBufferSource();
  shySrc.buffer = shyBuf;
  shySrc.loop = true; // a chase outlasts ten seconds of screaming
  shySrc.connect(shyGain);
  shySrc.start();
}

/** It has stopped — killed you, lost you to the water, or left. */
export function shyQuiet(): void {
  const src = shySrc;
  const g = shyGain;
  shySrc = null;
  shyGain = null;
  shyFilter = null;
  if (!src || !ctx) return;
  const t = ctx.currentTime;
  g?.gain.setTargetAtTime(0, t, 0.25);
  try {
    src.stop(t + 1.2);
  } catch {
    /* already stopped */
  }
}

/** Per-frame while it is screaming: distance in cells and walls between. */
export function updateShySound(dist: number, walls: number): void {
  if (!shySrc || !shyGain || !shyFilter || !ctx) return;
  const t = ctx.currentTime;
  // It carries further than the others — a scream in a tiled pool hall does.
  const base = Math.pow(Math.max(0, 1 - dist / 34), 1.25) * Math.pow(0.62, Math.min(4, walls));
  aim(shyFilter.frequency, WALL_CUT[Math.min(4, walls)], t, 0.12);
  aim(shyGain.gain, base, t, 0.08);
}

/** Preload the scream so the trigger never lands on a silent frame. */
export function warmShySound(): void {
  ensureShySound();
}

// ---- THE ALLIGATOR's munch --------------------------------------------------
// A pure one-shot: the server says a bite landed at (x,y), everyone close
// enough hears the munch once, gained by distance and occluded by walls like
// every other sound down here. No loop, no state — each bite is its own event.
let munchBuf: AudioBuffer | null = null;
let munchFetching = false;

function ensureMunchSound(): void {
  if (munchFetching) return;
  munchFetching = true;
  const c = ensureCtx();
  fetch("/assets/pools/gator-munch.ogg")
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.arrayBuffer();
    })
    .then((ab) => c.decodeAudioData(ab))
    .then((buf) => {
      munchBuf = buf;
    })
    .catch(() => {
      /* no file, no munch */
    });
}

/** Preload the munch so the first bite is never silent. */
export function warmGatorSound(): void {
  ensureMunchSound();
}

/** A bite landed `dist` cells away with `walls` between — play the munch. */
export function gatorMunch(dist: number, walls: number): void {
  ensureMunchSound();
  if (!munchBuf) return;
  const base = Math.pow(Math.max(0, 1 - dist / 24), 1.2) * Math.pow(0.6, Math.min(4, walls));
  if (base <= 0.015) return;
  const c = ensureCtx();
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = WALL_CUT[Math.min(4, walls)];
  filter.connect(gameOut());
  const g = c.createGain();
  g.gain.value = base;
  g.connect(filter);
  const src = c.createBufferSource();
  src.buffer = munchBuf;
  src.connect(g);
  src.onended = () => {
    src.disconnect();
    g.disconnect();
    filter.disconnect();
  };
  src.start();
}

// ---- THE ELECTRICAL STATION's one-shots ---------------------------------------
// The arcs, the shock, the levers and the power going and coming back
// (scripts/gen-sounds.mjs station). The munch's rules: gained by distance,
// occluded by walls, one event each, no state. `dist` 0 = your own ears.
export type StationSound = "arc-warn" | "arc-fire" | "shock" | "breaker-on" | "cutoff" | "power-down" | "power-up";
const stationBufs = new Map<StationSound, AudioBuffer | null>();
function ensureStationSound(id: StationSound): AudioBuffer | null {
  if (stationBufs.has(id)) return stationBufs.get(id) ?? null;
  stationBufs.set(id, null);
  const c = ensureCtx();
  fetch(`/assets/station/${id}.ogg`)
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.arrayBuffer();
    })
    .then((ab) => c.decodeAudioData(ab))
    .then((buf) => {
      stationBufs.set(id, buf);
    })
    .catch(() => {
      /* no file, no sound */
    });
  return null;
}

/** Preload the station's set so the first arc is never silent. */
export function warmStationSound(): void {
  for (const id of ["arc-warn", "arc-fire", "shock", "breaker-on", "cutoff", "power-down", "power-up"] as StationSound[]) ensureStationSound(id);
}

export function stationSfx(id: StationSound, dist = 0, walls = 0, loud = 1): void {
  const buf = ensureStationSound(id);
  if (!buf) return;
  const base = loud * Math.pow(Math.max(0, 1 - dist / 26), 1.2) * Math.pow(0.6, Math.min(4, walls));
  if (base <= 0.015) return;
  const c = ensureCtx();
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

/** Per-frame: how far the entity is (cells; null = not present), whether
 *  it's chasing, and how many walls sit between you. */
export function updateEntitySound(dist: number | null, chasing: boolean, walls: number): void {
  if (dist !== null) ensureEntitySound();
  if (!entReady || !entWalkGain || !entScreamGain || !entFilter || !ctx) return;
  const t = ctx.currentTime;
  if (dist === null || dist > 18) {
    aim(entWalkGain.gain, 0, t, 0.2);
    aim(entScreamGain.gain, 0, t, 0.2);
    return;
  }
  const base = Math.pow(Math.max(0, 1 - dist / 18), 1.4) * Math.pow(0.55, Math.min(4, walls));
  aim(entFilter.frequency, WALL_CUT[Math.min(4, walls)], t, 0.12);
  aim(entWalkGain.gain, chasing ? 0 : base * 0.55, t, 0.15);
  aim(entScreamGain.gain, chasing ? base * 0.95 : 0, t, 0.08);
}

/** Free the context entirely (leaving the game). */
export function closeAmbience(): void {
  stopHum();
  void ctx?.close().catch(() => {});
  ctx = null;
  masterBus = null;
  bedDuck = null;
  roomLayer = null;
  roomNow = null;
  roomBuffers.clear();
  entReady = false;
  entWalkGain = null;
  entScreamGain = null;
  entFilter = null;
  stalkerReady = false;
  stalkerGain = null;
  // the burn loop lived on the closed context too (Oct 2026 review: the
  // burn cue went silent on every later entry in the same page)
  burnReady = false;
  burnGain = null;
  stalkerFilter = null;
  shySrc = null;
  shyGain = null;
  shyFilter = null;
  shyBuf = null;
  shyFetching = false;
}
