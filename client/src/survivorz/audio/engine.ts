// SOLACE SURVIVORZ — THE SOUND ENGINE. Plays the show's finished sound set (the admin-only asset door,
// sound/final) in the 3D world: where a sound comes from, what walls and distance do to it, the room it
// rings in, the device a recording plays through, the zone's room tone, the score the director runs,
// and everything ducking under a voice. The decisions are rules.ts, music-rules.ts and cues.ts (pure,
// harness-held); this file is only the AudioNodes.
//
// THE GRAPH (all into sfxOut(), so the App-sounds slider governs it):
//   world  — positional one-shots and loops: panner → lowpass → dry gain ─┐
//                                                    └→ wet gain → room ──┤
//   beds   — the listener's zone tone (crossfaded on a zone change) ──────┤→ master
//   music  — the score's layers, looped in sync, faded by the director ───┤
//   pa     — the ceiling speakers: the PA chain, then a big share of room ┤
//   logs   — a recording held to the ear: the tape or phone chain ────────┘
// music and beds DUCK under anyone talking on camera, a log, or a PA line.
//
// THE MAP SUPPLIES TWO THINGS LATER, and the engine works without them: how many walls stand between
// two points (`setOcclusion`; 0 until then) and which room/zone the listener is in (`setListener`).
// Performance rule (the floor's): automation is scheduled on CHANGE, moving sources update at 12 Hz,
// nothing allocates per frame.
import { fetchIndex, fetchSound, soundBuffer, soundUrl } from "../assets";
import { sfxContext, sfxOut } from "../../lib/sfx";
import {
  ACOUSTIC, DEVICE_SHAPE, DUCK, audibleRange, bedLevel, bedOf, dbToGain, deviceOf, pickTake, roomAcoustic, roomSurface,
  stepShape, STEP_LEVEL, STEP_SOUND, worldMix, type Device, type Jitter, type Pace, type PaceId, type RoomPreset, type Surface,
} from "./rules";
import { LAYER, death, mix, newMusic, nextBoundary, STING, step, type Level, type MusicInput } from "./music-rules";
import { partsFor, standInRate } from "./cues";
/** how far a survivor's voice carries (m) — the camera's ear sits within 2.5 m of the subject (EAR_M) */
const VOICE_RANGE_M = 28;
/** THE SURVIVORS WEAR MICS (Nov 1 2026 — Josh: "i still do not hear any of them talking"; the casino show
 *  learned it first, MIC_CELLS): a voice is still panned toward whoever says it, but heard from no further
 *  than this and never through a wall. Heard from where they stood, a line across the facility from the
 *  camera played at a few per cent behind two walls — every line arrived and nobody heard one. */
const VOICE_MIC_M = 3;

/** A voice through a hazmat respirator: dulled and a little quieter (Rollo). */
const RESPIRATOR = { lowpassHz: 1600, gain: 0.8 };
/** The score's and the room tone's buses (1 was the old level). */
export const MUSIC_LEVEL = 0.22;
export const BED_LEVEL = 0.3;

export type Vec3 = [number, number, number];

interface SoundEntry { group: string; kind: string; music: boolean; files: { file: string }[] }

export interface Emitter {
  /** move a looping sound (a fire, a zombie's groan) */
  setPosition(p: Vec3): void;
  stop(fadeS?: number): void;
}

const now = () => performance.now();

export class SoundEngine {
  readonly ctx: AudioContext;
  private master: GainNode;
  private world: GainNode;
  private beds: GainNode;
  private music: GainNode;
  private pa: GainNode;
  private logs: GainNode;
  private roomIn: GainNode;
  private rooms = new Map<RoomPreset, { conv: ConvolverNode; gain: GainNode }>();
  private room: RoomPreset = "concrete";
  private sounds: Record<string, SoundEntry> = {};
  private paces: Record<string, Pace> = {};
  private jitter: Jitter = { pitch: 0.04, gainDb: 1.5 };
  private last = new Map<string, number>();
  private listener: Vec3 = [0, 0, 0];
  private listenerYaw = 0;
  private listenerRoom: string | null = null;
  private listenerZone: string | null = null;
  private occlusion: (a: Vec3, b: Vec3) => number = () => 0;
  private live = new Set<{ stop(fadeS?: number): void }>();
  private bed: { id: string; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private ducks = 0;
  private noise: AudioBuffer;
  private disposed = false;
  readonly score: ScorePlayer;
  rand: () => number = Math.random;
  /** a building with ceiling speakers: a cue's PA parts play. Halcyon had one; the bunker has none (Nov 2026 —
   *  Josh: "there should be no PA system"), so the show turns it off. The bench keeps it, to hear the lines. */
  paSystem = true;

  private constructor(ctx: AudioContext) {
    this.ctx = ctx;
    const out = sfxOut() ?? ctx.destination;
    // a limiter on the way out: with every gunshot, blow and groan in range a fight peaked the master at 1.34
    // (Nov 3 2026) — fast attack, gentle release, so it only catches the peaks
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -4; lim.knee.value = 4; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.25;
    lim.connect(out);
    this.master = this.gain(1, lim);
    this.world = this.gain(1, this.master);
    this.beds = this.gain(BED_LEVEL, this.master);
    // THE SCORE SITS UNDER THE ROOM (Josh, Oct 28 2026: "the ambience is way too loud, it needs to
    // be quiet and subtle"): about -13 dB against the world's sounds, and the beds with it.
    this.music = this.gain(MUSIC_LEVEL, this.master);
    this.pa = this.gain(1, this.master);
    this.logs = this.gain(1, this.master);
    this.roomIn = this.gain(1);
    this.noise = this.makeNoise(2);
    for (const p of Object.keys(ACOUSTIC) as RoomPreset[]) {
      const conv = ctx.createConvolver();
      conv.buffer = this.impulse(p);
      const g = this.gain(p === this.room ? ACOUSTIC[p].mix * 3 : 0, this.master);
      this.roomIn.connect(conv);
      conv.connect(g);
      this.rooms.set(p, { conv, gain: g });
    }
    this.score = new ScorePlayer(this);
  }

  /** Load the manifest through the admin door and build the graph. */
  static async create(): Promise<SoundEngine> {
    const ctx = sfxContext();
    if (!ctx) throw new Error("no_audio");
    const index = await fetchIndex();
    const man = index.sounds as unknown as { sounds: Record<string, SoundEntry>; paces?: Record<string, Pace>; stepJitter?: Jitter } | null;
    if (!man) throw new Error("no_sound_set");
    const e = new SoundEngine(ctx);
    e.sounds = man.sounds;
    if (man.paces) e.paces = man.paces;
    if (man.stepJitter) e.jitter = man.stepJitter;
    return e;
  }

  has(id: string): boolean { return id in this.sounds; }
  /** whose voice sounds a character with none of their own borrows (the show sets it: it knows the cast) */
  vocalStandIn: ((who: string, kind: string) => string | null) | null = null;
  ids(): string[] { return Object.keys(this.sounds); }
  groupOf(id: string): string { return this.sounds[id]?.group ?? ""; }

  // ---- the listener (the camera) ----------------------------------------------------------------

  /** Where the camera hears from: its position, which way it faces (radians, 0 = -z), and the room. */
  setListener(p: Vec3, yaw: number, room: string | null = this.listenerRoom, zone: string | null = this.listenerZone): void {
    this.listener = p;
    this.listenerYaw = yaw;
    const L = this.ctx.listener, t = this.ctx.currentTime;
    const fx = Math.sin(yaw), fz = -Math.cos(yaw);
    if (L.positionX) {
      L.positionX.setTargetAtTime(p[0], t, 0.03); L.positionY.setTargetAtTime(p[1], t, 0.03); L.positionZ.setTargetAtTime(p[2], t, 0.03);
      L.forwardX.setTargetAtTime(fx, t, 0.03); L.forwardY.setTargetAtTime(0, t, 0.03); L.forwardZ.setTargetAtTime(fz, t, 0.03);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      (L as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(p[0], p[1], p[2]);
      (L as unknown as { setOrientation(...a: number[]): void }).setOrientation(fx, 0, fz, 0, 1, 0);
    }
    if (room !== this.listenerRoom || zone !== this.listenerZone) {
      this.listenerRoom = room;
      this.listenerZone = zone;
      this.setRoom(roomAcoustic(room));
      void this.setBed(bedOf(zone, room), bedLevel(room));
    }
  }

  /** The map's wall count between two points (until there is a map, nothing is in the way). */
  setOcclusion(fn: (a: Vec3, b: Vec3) => number): void { this.occlusion = fn; }

  /** Change the room the listener hears in (a short crossfade between the two convolvers). */
  setRoom(p: RoomPreset): void {
    if (p === this.room) return;
    const t = this.ctx.currentTime;
    this.rooms.get(this.room)!.gain.gain.setTargetAtTime(0, t, 0.25);
    this.rooms.get(p)!.gain.gain.setTargetAtTime(ACOUSTIC[p].mix * 3, t, 0.25);
    this.room = p;
  }
  currentRoom(): RoomPreset { return this.room; }

  // ---- playing ----------------------------------------------------------------------------------

  /** Decode a sound's takes ahead of need (the bench and a zone's arrival call this). */
  async preload(ids: string[]): Promise<void> {
    await Promise.all(ids.flatMap((id) => (this.sounds[id]?.files ?? []).map((f) => soundBuffer(soundUrl(id, f.file)).catch(() => null))));
  }

  private async take(id: string): Promise<AudioBuffer | null> {
    const def = this.sounds[id];
    if (!def || !def.files.length) return null;
    const i = pickTake(def.files.length, this.last.get(id), this.rand);
    this.last.set(id, i);
    return soundBuffer(soundUrl(id, def.files[i].file)).catch(() => null);
  }

  /** Play a sound once. With `at`, it comes from that point in the world; without, it plays as the
   *  listener's own sound. A sound with a device (an audio log, the PA) goes through it. */
  async play(id: string, opts: { at?: Vec3; gain?: number; rate?: number; lowpassHz?: number | null; delayMs?: number } = {}): Promise<void> {
    if (this.disposed) return;
    const buf = await this.take(id);
    if (!buf || this.disposed) return;
    const when = this.ctx.currentTime + (opts.delayMs ?? 0) / 1000;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    if (opts.rate) src.playbackRate.value = opts.rate;
    const group = this.groupOf(id);
    const device = deviceOf(id, group);
    let head: AudioNode = src;
    if (opts.lowpassHz) { const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = opts.lowpassHz; head.connect(lp); head = lp; }
    const g = this.gain(opts.gain ?? 1);
    head.connect(g);
    let end: () => void = () => {};
    if (device) {
      end = this.throughDevice(g, device, buf.duration / (opts.rate ?? 1), when);
    } else if (opts.at && audibleRange(id, group) > 0) {
      this.positional(g, opts.at, audibleRange(id, group));
    } else {
      g.connect(this.world);
    }
    const handle = { stop: (fade = 0.1) => { try { g.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3); src.stop(this.ctx.currentTime + fade); } catch { /* done */ } } };
    this.live.add(handle);
    src.onended = () => { this.live.delete(handle); end(); g.disconnect(); };
    src.start(when);
  }

  /** A SURVIVOR'S VOICE (src/survivorz/voices.ts): their line, fetched from the show and spoken FROM
   *  WHERE THEY STAND — a voice in the room, walls between dull it like any other sound — with the score
   *  ducked under it like a recording. `move` follows the speaker while it plays. */
  async voice(url: string, at: Vec3, follow?: () => Vec3 | null, speaker?: string): Promise<void> {
    if (this.disposed) return;
    // (a line asked for just before its speaker died is fetched in that gap: stopVoice ends it either way)
    const gen = speaker ? this.voiceGen.get(speaker) ?? 0 : 0;
    // (never cached: every line is its own URL — fetchSound, assets.ts)
    const buf = await fetchSound(url).catch(() => null);
    if (!buf || this.disposed) return;
    if (speaker && (this.voiceGen.get(speaker) ?? 0) !== gen) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.gain(1.15);
    src.connect(g);
    const place = this.positional(g, at, VOICE_RANGE_M, VOICE_MIC_M);
    let timer: ReturnType<typeof setInterval> | null = null;
    if (follow) timer = setInterval(() => { const p = follow(); if (p) place.move(p); }, 1000 / 12);
    this.duck(true);
    const handle = { stop: (fade = 0.1) => { try { g.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3); src.stop(this.ctx.currentTime + fade); } catch { /* done */ } } };
    this.live.add(handle);
    if (speaker) this.voices.set(speaker, handle);
    src.onended = () => { this.live.delete(handle); if (speaker && this.voices.get(speaker) === handle) this.voices.delete(speaker); if (timer) clearInterval(timer); place.drop(); this.duck(false); g.disconnect(); };
    src.start();
  }

  /** each speaker's line playing now, and a count bumped when they're silenced (a line still loading is dropped) */
  private voices = new Map<string, { stop(fadeS?: number): void }>();
  private voiceGen = new Map<string, number>();
  /** THE DEAD SAY NOTHING: a survivor's line stops where it is (a death, a turn) — and one still loading never starts. */
  stopVoice(speaker: string): void {
    this.voiceGen.set(speaker, (this.voiceGen.get(speaker) ?? 0) + 1);
    this.voices.get(speaker)?.stop(0.08);
    this.voices.delete(speaker);
  }

  /** A footstep: the surface's pool (or the room's floor), shaped by the pace. */
  step(surface: Surface | string, pace: PaceId, at?: Vec3): void {
    const s = (surface in STEP_SOUND ? STEP_SOUND[surface as Surface] : STEP_SOUND[roomSurface(surface)]);
    const shape = stepShape(this.paces, this.jitter, pace, this.rand);
    void this.play(s, { at, gain: shape.gain * STEP_LEVEL, rate: shape.rate, lowpassHz: shape.lowpassHz });
  }

  /** The brass tinkle for fx/casings.ts's `onBounce` hook: pass `engine.casingBounce` as the
   *  callback. Louder the harder it lands, pitched by the case (a pistol case is small and bright,
   *  a rifle case lower, a shotgun shell's plastic hull dull), and thinned so a burst of fire
   *  doesn't pile forty clinks on top of each other. */
  private lastClink = 0;
  casingBounce = (kind: "pistol" | "rifle" | "shell", pos: { x: number; y: number; z: number }, speed: number): void => {
    const t = now();
    if (speed < 0.3 || t - this.lastClink < 35) return;
    this.lastClink = t;
    const gain = Math.min(1, speed / 4) * 0.6;
    const rate = (kind === "pistol" ? 1.15 : kind === "rifle" ? 1 : 0.72) * (0.95 + this.rand() * 0.1);
    void this.play("gun-casing", { at: [pos.x, pos.y, pos.z], gain, rate, lowpassHz: kind === "shell" ? 2500 : null });
  };

  /** Loop a sound at a point (a fire, a steam jet, a lab machine) until stopped, or for `ms`. */
  async loop(id: string, opts: { at?: Vec3; gain?: number; ms?: number } = {}): Promise<Emitter | null> {
    const buf = await this.take(id);
    if (!buf || this.disposed) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.gain(0);
    src.connect(g);
    const range = audibleRange(id, this.groupOf(id)) || 30;
    const pos = opts.at ? this.positional(g, opts.at, range) : (g.connect(this.world), null);
    // (a loop outlives the shot it began in: it is mixed again as the ear moves, 12 times a second — a hearth
    // that began 17 m off behind two walls stayed that quiet and that dull for the whole show)
    if (pos && opts.at) pos.move(opts.at);
    const t = this.ctx.currentTime;
    g.gain.setTargetAtTime(opts.gain ?? 1, t, 0.08);
    src.start(t);
    const em: Emitter & { stop(f?: number): void } = {
      setPosition: (p) => pos?.move(p),
      stop: (fade = 0.6) => {
        try { g.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3); src.stop(this.ctx.currentTime + fade); } catch { /* done */ }
        this.live.delete(em); pos?.drop();
      },
    };
    this.live.add(em);
    if (opts.ms) setTimeout(() => em.stop(1.2), opts.ms);
    return em;
  }

  /** Play a game event's cue (cues.ts): its sounds, its PA line, its sting. */
  cue(event: string, fields: Record<string, unknown> = {}, at?: Vec3): void {
    // a SUITED survivor (Rollo, BodyLook.suited) speaks through a respirator: every sound out of
    // his mouth comes muffled. His cough is still heard; it's only the blood the effects skip.
    const suited = fields.suited === true;
    for (const part of partsFor(event, fields)) {
      let p = part, rate: number | undefined;
      if (!this.has(p.sound)) {
        // (a character with no voice sounds of their own borrows somebody's: cues.ts vocalStandIn)
        const m = /^vocal-([a-z0-9]+)-(.+)$/.exec(p.sound);
        const lent = m ? this.vocalStandIn?.(m[1], m[2]) : null;
        if (!m || !lent || !this.has(`vocal-${lent}-${m[2]}`)) continue;
        p = { ...p, sound: `vocal-${lent}-${m[2]}` };
        rate = standInRate(m[1]);
      }
      if (p.pa && !this.paSystem) continue;
      if (p.sting) { this.score.sting(p.sound, p.delayMs ?? 0); continue; }
      if (p.loopMs) { setTimeout(() => void this.loop(p.sound, { at, gain: p.gain, ms: p.loopMs }), p.delayMs ?? 0); continue; }
      const masked = suited && p.sound.startsWith("vocal-");
      void this.play(p.sound, { at: p.pa ? undefined : at, gain: (p.gain ?? 1) * (masked ? RESPIRATOR.gain : 1), delayMs: p.delayMs, lowpassHz: masked ? RESPIRATOR.lowpassHz : null, rate });
    }
  }

  // ---- ducking ----------------------------------------------------------------------------------

  /** Someone is speaking on camera (or a log, or the PA): the score and beds go under. Counted, so
   *  two voices at once release only when both are done. */
  duck(on: boolean): void {
    this.ducks = Math.max(0, this.ducks + (on ? 1 : -1));
    const t = this.ctx.currentTime, down = this.ducks > 0;
    this.music.gain.setTargetAtTime(MUSIC_LEVEL * (down ? dbToGain(DUCK.musicDb) : 1), t, (down ? DUCK.attackS : DUCK.releaseS) / 3);
    this.beds.gain.setTargetAtTime(BED_LEVEL * (down ? dbToGain(DUCK.bedsDb) : 1), t, (down ? DUCK.attackS : DUCK.releaseS) / 3);
  }

  // ---- the zone's room tone ---------------------------------------------------------------------

  /** the room tone asked for last, and a count of asks: a load that resolves after a newer ask is
   *  thrown away (the ear crosses rooms at 12 Hz; a first fetch of a bed takes hundreds of ms, and two
   *  overlapping loads both started their loop — the first orphaned, looping forever) */
  private bedWant: string | null = null;
  private bedGen = 0;
  private bedLevelNow = 1;
  private async setBed(id: string | null, level = 1): Promise<void> {
    this.bedLevelNow = level;
    if (this.bedWant === id) {
      // (the same bed in another room: only its level moves — the rain from under a roof, or from the cellar)
      if (this.bed) this.bed.gain.gain.setTargetAtTime(0.9 * level, this.ctx.currentTime, 0.8);
      return;
    }
    this.bedWant = id;
    const gen = ++this.bedGen;
    const old = this.bed;
    this.bed = null;
    if (old) { old.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.8); old.src.stop(this.ctx.currentTime + 3); }
    if (!id || !this.has(id)) return;
    const buf = await this.take(id);
    if (gen !== this.bedGen || this.disposed) return;
    // (a failed load is asked for again on the next room change — never a fetch at 12 Hz)
    if (!buf) { this.bedWant = null; return; }
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const g = this.gain(0, this.beds);
    src.connect(g);
    src.start();
    g.gain.setTargetAtTime(0.9 * this.bedLevelNow, this.ctx.currentTime, 0.8);
    this.bed = { id, src, gain: g };
  }

  // ---- the plumbing -----------------------------------------------------------------------------

  /** Connect a sound into the world at a point: panner + walls' lowpass, dry and room sends. */
  private positional(input: AudioNode, at: Vec3, range: number, mic = 0): { move(p: Vec3): void; drop(): void } {
    const ctx = this.ctx;
    const pan = ctx.createPanner();
    pan.panningModel = "HRTF";
    pan.distanceModel = "inverse";
    pan.refDistance = 2;
    pan.rolloffFactor = 1;
    pan.maxDistance = Math.max(range, 10);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass";
    const dry = this.gain(1, this.world);
    const wet = this.gain(0, this.roomIn);
    input.connect(pan); pan.connect(lp); lp.connect(dry); lp.connect(wet);
    let pos = at, timer: ReturnType<typeof setInterval> | null = null;
    const apply = () => {
      let [x, y, z] = pos;
      const L = this.listener;
      let d = Math.hypot(x - L[0], y - L[1], z - L[2]);
      // a mic'd voice: brought in to `mic` metres along its own direction, no walls in the way
      if (mic > 0 && d > mic) { const k = mic / d; x = L[0] + (x - L[0]) * k; y = L[1] + (y - L[1]) * k; z = L[2] + (z - L[2]) * k; d = mic; }
      const m = worldMix(d, mic > 0 ? 0 : this.occlusion(L, pos), range, ACOUSTIC[this.room].mix * 2.5);
      const t = ctx.currentTime;
      if (pan.positionX) { pan.positionX.setTargetAtTime(x, t, 0.04); pan.positionY.setTargetAtTime(y, t, 0.04); pan.positionZ.setTargetAtTime(z, t, 0.04); }
      else (pan as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(x, y, z);
      lp.frequency.setTargetAtTime(m.silent ? 150 : m.cutoff, t, 0.05);
      dry.gain.setTargetAtTime(m.silent ? 0 : m.dry, t, 0.05);
      wet.gain.setTargetAtTime(m.silent ? 0 : m.wet, t, 0.05);
    };
    apply();
    return {
      move: (p) => { pos = p; if (!timer) timer = setInterval(apply, 1000 / 12); },
      drop: () => { if (timer) clearInterval(timer); timer = null; },
    };
  }

  /** A recording's device: band-limit, drive, and its hiss (for its length). The PA also rings in
   *  the room the listener is in, since it comes out of that room's ceiling. Returns the cleanup. */
  private throughDevice(input: AudioNode, d: Exclude<Device, null>, durS: number, when: number): () => void {
    const ctx = this.ctx, shape = DEVICE_SHAPE[d];
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = shape.lowHz;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = shape.highHz;
    const ws = ctx.createWaveShaper(); ws.curve = this.driveCurve(shape.drive); ws.oversample = "2x";
    const out = this.gain(d === "pa" ? 0.9 : 1, d === "pa" ? this.pa : this.logs);
    input.connect(hp); hp.connect(lp); lp.connect(ws); ws.connect(out);
    if (d === "pa") { const send = this.gain(0.55, this.roomIn); ws.connect(send); }
    // the hiss of the tape / line / speaker, for exactly as long as the recording
    const hiss = ctx.createBufferSource(); hiss.buffer = this.noise; hiss.loop = true;
    const hf = ctx.createBiquadFilter(); hf.type = "bandpass"; hf.frequency.value = d === "tape" ? 5000 : 2500; hf.Q.value = 0.6;
    const hg = this.gain(shape.hiss, out);
    hiss.connect(hf); hf.connect(hg);
    hiss.start(when); hiss.stop(when + durS + 0.3);
    // tape wow: the recorder's motor isn't steady
    if (d === "tape") {
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.7;
      const depth = this.gain(0.0009); lfo.connect(depth);
      const delay = ctx.createDelay(0.05); delay.delayTime.value = 0.004; depth.connect(delay.delayTime);
      // re-route the band through the wobbling delay
      lp.disconnect(); lp.connect(delay); delay.connect(ws);
      lfo.start(when); lfo.stop(when + durS + 0.3);
    }
    this.duck(true);
    return () => { this.duck(false); out.disconnect(); };
  }

  /** A noise impulse ringing like the preset: exponential decay, darkening with damping. */
  private impulse(p: RoomPreset): AudioBuffer {
    const a = ACOUSTIC[p], sr = this.ctx.sampleRate;
    const len = Math.ceil(sr * (a.decayS + a.predelayMs / 1000));
    const buf = this.ctx.createBuffer(2, len, sr);
    const pre = Math.floor((a.predelayMs / 1000) * sr);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / sr;
        const env = Math.exp((-6.9 * t) / a.decayS);                    // -60 dB at decayS
        const k = Math.min(0.97, a.damping * (0.4 + t / a.decayS));     // the tail darkens as it goes
        lp = lp * k + (Math.random() * 2 - 1) * (1 - k);
        data[i] = lp * env;
      }
    }
    return buf;
  }

  private driveCurve(drive: number): Float32Array<ArrayBuffer> {
    const n = 1024, c = new Float32Array(new ArrayBuffer(n * 4)), k = 1 + drive * 8;
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
    return c;
  }

  private makeNoise(seconds: number): AudioBuffer {
    const b = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * seconds), this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  gain(v: number, to?: AudioNode): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    if (to) g.connect(to);
    return g;
  }
  musicBus(): GainNode { return this.music; }
  /** A sound's first take, decoded (the score's layers have one each). */
  firstTake(id: string): Promise<AudioBuffer | null> {
    const f = this.sounds[id]?.files[0];
    return f ? soundBuffer(soundUrl(id, f.file)).catch(() => null) : Promise.resolve(null);
  }

  /** Stop everything and let go of the graph (a view leaving calls this). */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const h of [...this.live]) h.stop(0.1);
    this.live.clear();
    this.score.stop();
    if (this.bed) { try { this.bed.src.stop(); } catch { /* done */ } }
    setTimeout(() => { try { this.master.disconnect(); } catch { /* gone */ } }, 300);
  }
}

// ---- the score ----------------------------------------------------------------------------------

/** Plays what music-rules.ts decides: every layer looping in sync from one start, each faded to
 *  its mix gain on the next phrase boundary (or at once, into combat and on a death). */
export class ScorePlayer {
  private state = newMusic(now());
  private layers = new Map<string, { src: AudioBufferSourceNode; gain: GainNode }>();
  private last: MusicInput = { now: now(), threat: 0, fighting: false, zone: null, room: null, night: false };
  private started = false;
  private stingGain: GainNode | null = null;
  /** each layer's level as last SCHEDULED (apply): a sting dips and restores relative to this, never
   *  to the gain's value right now — read mid-fade (a death fading everything out), the old level
   *  came back up 2.5 s after the death */
  private target = new Map<string, number>();
  constructor(private e: SoundEngine) {}

  level(): Level { return this.state.level; }
  pinned(): Level | null { return this.state.pin; }

  /** Start every layer at once, silent, so they stay in step. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const ids = [...Object.values(LAYER), "score-colour-labs", "score-colour-power", "score-colour-tunnels", "score-colour-deeplab"];
    const bufs = await Promise.all(ids.map(async (id) => [id, await this.e.firstTake(id)] as const));
    const ctx = this.e.ctx, t0 = ctx.currentTime + 0.1;
    for (const [id, buf] of bufs) {
      if (!buf) continue;
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const g = this.e.gain(0, this.e.musicBus());
      src.connect(g); src.start(t0);
      this.layers.set(id, { src, gain: g });
    }
    this.stingGain = this.e.gain(1, this.e.musicBus());
    this.state = newMusic(now());
    this.apply(this.state.level, 2, 0);
  }

  /** The director's step: what the camera is showing now. */
  update(i: Omit<MusicInput, "now">): void {
    if (!this.started) return;
    const input = { ...i, now: now() };
    const zoneChanged = input.zone !== this.last.zone || input.room !== this.last.room || input.night !== this.last.night;
    this.last = input;
    const c = step(this.state, input);
    if (c) {
      const wait = c.urgent ? 0 : nextBoundary(this.state, input.now) - input.now;
      this.apply(c.level, c.fadeS, wait);
    } else if (zoneChanged) this.apply(this.state.level, 6, nextBoundary(this.state, input.now) - input.now);
  }

  /** A death on screen: everything out at once; the death sting carries it. */
  death(): void {
    if (!this.started) return;
    const c = death(this.state, now());
    this.apply(c.level, c.fadeS, 0);
    this.sting(STING.death, 0);
  }

  /** Fire a sting over the score (the layers dip under it for a moment). */
  sting(id: string, delayMs: number): void {
    void this.e.play(id, { delayMs });
    const t = this.e.ctx.currentTime + delayMs / 1000;
    for (const [id, l] of this.layers) {
      const v = this.target.get(id) ?? l.gain.gain.value;
      l.gain.gain.setTargetAtTime(v * 0.5, t, 0.05);
      l.gain.gain.setTargetAtTime(v, t + 2.5, 1.2);
    }
  }

  /** Josh's levers. */
  pin(level: Level | null): void { this.state.pin = level; this.update(this.last); }
  setMuted(m: boolean): void { this.state.muted = m; this.apply(this.state.level, 1.5, 0); }

  private apply(level: Level, fadeS: number, waitMs: number): void {
    const gains = mix(level, this.last, this.state.muted);
    const t = this.e.ctx.currentTime + Math.max(0, waitMs) / 1000;
    for (const [id, l] of this.layers) {
      const v = gains[id] ?? 0;
      // (a sting's restore still waiting past t is the OLD level: this mix supersedes it)
      l.gain.gain.cancelScheduledValues(t);
      l.gain.gain.setTargetAtTime(v, t, Math.max(0.05, fadeS / 3));
      this.target.set(id, v);
    }
  }

  stop(): void {
    for (const l of this.layers.values()) { try { l.src.stop(); } catch { /* done */ } }
    this.layers.clear();
    this.started = false;
  }
}
