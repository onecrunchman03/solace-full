// Proximity voice — the backrooms' only comms, now with real ACOUSTICS.
//
// v1 was per-element volume: every voice mono-center, fading linearly — a
// chat room. This is a WebAudio spatial graph per speaker:
//
//   remote track → source → occlusion lowpass → panner (HRTF) → dry gain ─┬→ out
//                                             └→ reverb send ─→ convolver ┘
//
// - PannerNode (HRTF, inverse-distance in METERS) puts each voice where the
//   person is standing — turn your head and they move around you.
// - The lowpass carries two physical effects: AIR (far voices lose highs
//   even in the open) and WALLS (each wall the straight line crosses drops
//   the cutoff hard + cuts gain — drywall muffle; a doorway un-muffles as
//   the line clears).
// - A shared procedural room reverb (synthesized impulse — no asset) gets
//   louder with distance: near voices are dry and close, far ones ring in
//   the space. That's the "speaking in a room" feel.
//
// The privacy geometry still holds: the position wire (28 cells = 56m)
// out-ranges the hard audio gate (36m), so a voice can never exist without
// a position, and beyond earshot is EXACTLY silent.
//
// Chromium quirk, load-bearing: a remote WebRTC track is silent to WebAudio
// unless it's ALSO attached to an HTMLMediaElement — so each track keeps a
// muted <audio> sink while the real sound flows through the graph.

import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteParticipant,
} from "livekit-client";
import { api, ApiError } from "./gameapi";
import { MicChainProcessor } from "../lib/mic-chain";
import { brSettings } from "./settings.svelte";
import { HARD_GATE_M, voiceMix } from "./voicemix";

const CELL_M = 2; // cells → meters
// HARD_GATE_M (48m, raised from 36 — Josh, Aug 2026: "make the proximity
// chat go a further") lives in voicemix.ts with the rest of the mix, so the
// harness can hold it inside the 56m position wire. It is the BACKROOMS
// default — worlds whose position wire carries the whole room (the casino
// floor) pass their own gate via `opts`.
const REF_DIST_M = 1.5; // full volume within arm's reach
// Inverse-model steepness. 1.7 → 1.4 → 1.2 → 1.05: each step is Josh asking
// voices to carry farther (latest Aug 2026, "the proximity chat needs to go a
// little farther"). Gentler curve = a voice across a hall is quiet but present
// rather than technically-audible-if-you-hold-your-breath.
const ROLLOFF = 1.05;

/** Per-world acoustics a caller may override. The backrooms takes the
 *  defaults; the casino floor passes a gate that covers its whole 62m hall
 *  (its relay streams every body on the floor, so there is no privacy
 *  geometry to stay inside) and a gentler rolloff — one social room. */
export interface VoiceOpts {
  hardGateM?: number;
  rolloff?: number;
  /** THE SHOW ON AIR (Oct 2026): publish ONLY to the participants this client
   *  can see. A spectator's seat is HIDDEN, so it never makes the list — and
   *  LiveKit enforces a publisher's permissions on the server, so a watcher
   *  cannot hear a player however their own client is modified. */
  audienceDeaf?: boolean;
}

export interface SpatialPeer {
  x: number; // cells
  y: number; // cells
  walls: number; // walls the straight line to the listener crosses (0..4)
}

export interface ProximityVoice {
  /** Per-frame: where I am (cells + yaw), where every audible peer is, and
   *  which peers are transmitting to me by WALKIE (radio path: distance
   *  ignored, centered, band-limited). */
  updateSpatial(
    me: { x: number; y: number; yaw: number },
    peers: Map<number, SpatialPeer>,
    radio?: Set<number>,
    /** How open the space around the LISTENER is, 0 (corridor) → 1 (hall).
     *  The caller measures it — only the game has the world grid. */
    openness?: number,
    /** LAW 12, the dead: "ghost" = a spectator speaking to me, placed where
     *  their camera is (the caller puts them in `peers`) and heard as a
     *  ghost — thinned, hollow, ringing; "near" = another spectator watching
     *  the same player as me, heard plainly, like being in the same room. */
    ghosts?: Map<number, "ghost" | "near">,
  ): void;
  setMuted(muted: boolean): void;
  /** Who may hear my voice: a list of user ids, or null for everyone in the
   *  room (the default). A ghost speaking to the one it watches lets only
   *  them subscribe — nobody else in the level hears the dead. */
  setListeners(ids: number[] | null): void;
  muted(): boolean;
  /** Is the local mic picking up speech right now? (The entity listens.) */
  speaking(): boolean;
  /** Autoplay-blocked audio + a suspended context get retried here. */
  onGesture(): void;
  /** 0..1 RMS of the local mic, for the settings meter. Same scale as the
   *  sensitivity threshold, so the slider means something visible. */
  micLevel(): number;
  /** Re-apply the pause-menu audio settings LIVE. Gain/threshold move on
   *  AudioParams; only a topology change (neural NS on/off) or a device
   *  switch actually restarts anything — the main app's hard-won rule
   *  (a needless restart makes the first seconds after unmute sound
   *  muffled while browser AGC re-converges). */
  applyAudio(s: {
    micGain: number;
    micSensitivity: number;
    neuralNS: boolean;
    voiceVolume: number;
    inputDevice: string;
    outputDevice: string;
  }): void;
  /** LISTENER IMPAIRMENT, 0 (sober) → 1 (out cold). Everything you HEAR
   *  smears: the master loses its highs, a modulated delay puts a slow wobble
   *  through every voice, and at the top end it all but closes. Applied on the
   *  listener's own master, so it never touches what anyone else hears — the
   *  casino's drinking (Josh, Aug 2026), and the muffle while you're passed
   *  out on the carpet. */
  setImpairment(k: number): void;
  /** LISTENER PITCH, as a playback-rate ratio: 1 is off, below 1 drags every
   *  voice in the room down, above 1 lifts it. SLORP's stage one (Josh, Aug
   *  2026: "people sound funny like their pitch is changed. high pitch to low
   *  pitch"). A real two-grain shifter, built on first use and bypassed at 1,
   *  so a room where nobody is tripping never runs it. */
  setVoicePitch(ratio: number): void;
  /** ONE SPEAKER'S PITCH, as heard by THIS listener — STAR DUST (Josh, Aug
   *  2026: the huffer's "voice sound[s] high pitch to everyone else"). The
   *  drug rides the speaker, but the shift has to happen on every listener's
   *  side, so each peer's chain can carry its own two-grain shifter, inserted
   *  only while their ratio is off 1 and bypassed back out afterwards. Safe to
   *  call for peers whose tracks haven't attached yet — the want is remembered
   *  and applied when they do. */
  setPeerPitch(id: number, ratio: number): void;
  /** The meter is a second mic capture — only run it while the settings
   *  screen is open (the main app's rule). */
  startMeter(): void;
  stopMeter(): void;
  /** THE STALKER throws a voice: replay a recent voiced snatch of peer
   *  `ofId` from world position (x,y in cells). Returns false when that
   *  peer hasn't spoken recently (the stalker stays silent — honest). */
  playMimic(ofId: number, x: number, y: number): boolean;
  leave(): void;
}

export type VoiceJoinResult =
  /** micOk false = connected and HEARING, but the microphone wouldn't start
   *  (no permission, busy, a missing device) — a listener, not a speaker. */
  | { ok: true; voice: ProximityVoice; micOk: boolean }
  | { ok: false; reason: "disabled" | "not_inside" | "failed" };

/** A synthetic room impulse: filtered noise with an exponential tail. The
 *  classic procedural IR — reads as a hard-walled interior without a single
 *  asset file.
 *
 *  TWO of these are built now (Josh, Aug 2026: "echo in big rooms"). One
 *  reverb can only ever describe one room, so a voice in a broom cupboard rang
 *  exactly like a voice in a flooded hall. `dur` sets the decay and `damp` the
 *  one-pole darkness; the graph crossfades between a tight room and a big one
 *  on a live measurement of the space the LISTENER is standing in. */
/**
 * The two-grain pitch shifter SLORP runs the room through. Inlined and loaded
 * from a Blob (mic-chain.ts's pattern) so it ships with the bundle and needs
 * no extra file on the deploy.
 *
 * The shape is the textbook one: a ring buffer written at real time and read
 * at `ratio`, which drifts the read head away from the write head — so the
 * head is wrapped once per grain and a SECOND head half a grain out of step
 * covers the seam. The two are mixed with an equal-power window (sin/cos,
 * squares summing to one), which is why a wrap is a soft warble instead of a
 * click. GRAIN is 85ms: long enough that a voice keeps its formants, short
 * enough that the room doesn't answer late.
 */
const PITCH_WORKLET = `
const GRAIN = 4096;             // samples per grain (~85ms at 48k)
const RING = 16384;             // power of two, comfortably > GRAIN
class SolacePitch extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: "ratio", defaultValue: 1, minValue: 0.4, maxValue: 2 }];
  }
  constructor() {
    super();
    this.ring = [];   // per channel
    this.w = 0;       // write head
    this.p = 0;       // grain phase, 0..1
  }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    if (!out || !out.length) return true;
    const ratio = Math.max(0.4, Math.min(2, params.ratio[0]));
    const n = out[0].length;
    for (let ch = 0; ch < out.length; ch++) {
      if (!this.ring[ch]) this.ring[ch] = new Float32Array(RING);
      const ring = this.ring[ch];
      const src = inp && inp[ch] ? inp[ch] : null;
      let w = this.w, p = this.p;
      const step = (1 - ratio) / GRAIN;
      for (let i = 0; i < n; i++) {
        ring[w] = src ? src[i] : 0;
        // Two read heads, half a grain apart, both trailing the write head.
        const d1 = p * GRAIN;
        const q = p + 0.5 >= 1 ? p - 0.5 : p + 0.5;
        const d2 = q * GRAIN;
        out[ch][i] =
          Math.sin(Math.PI * p) * this.read(ring, w - d1) +
          Math.sin(Math.PI * q) * this.read(ring, w - d2);
        w = (w + 1) & (RING - 1);
        p += step;
        if (p >= 1) p -= 1; else if (p < 0) p += 1;
      }
      // Channels share the heads: they must stay sample-locked or a stereo
      // image tears. Only the last channel's advance is kept.
      if (ch === out.length - 1) { this.w = w; this.p = p; }
    }
    return true;
  }
  /** Linear-interpolated read, index may be fractional and negative. */
  read(ring, at) {
    let x = at;
    while (x < 0) x += RING;
    const i0 = Math.floor(x) & (RING - 1);
    const i1 = (i0 + 1) & (RING - 1);
    const f = x - Math.floor(x);
    return ring[i0] * (1 - f) + ring[i1] * f;
  }
}
registerProcessor("solace-pitch", SolacePitch);
`;

function buildImpulse(ctx: AudioContext, dur: number, damp: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(dur * rate);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // Lowpassed noise (one-pole) so the tail is boomy, not hissy.
      lp = lp * damp + (Math.random() * 2 - 1) * (1 - damp);
      data[i] = lp * Math.pow(1 - t, decay);
    }
  }
  return buf;
}

interface PeerAudio {
  el: HTMLAudioElement; // muted sink (Chromium requirement)
  src: MediaStreamAudioSourceNode;
  /** Radio highpass — transparent until this peer keys their walkie. */
  hp: BiquadFilterNode;
  filter: BiquadFilterNode;
  panner: PannerNode;
  dry: GainNode;
  wet: GainNode;
  /** THE STALKER's ear: a rolling ~6s capture of this peer's voice, so a
   *  mimic can replay a snatch of it from the wrong dark. Client-local —
   *  it never leaves this machine, and it's only ever audio this client
   *  was already hearing. */
  tap: ScriptProcessorNode;
  ring: Float32Array;
  ringAt: number;
  /** STAR DUST's per-speaker shifter, built lazily and spliced between the
   *  occlusion filter and the panner only while this peer is gassed. */
  pitch: AudioWorkletNode | null;
  pitchOn: boolean;
}

export async function joinProximityVoice(
  /** Where the room grant comes from — the backrooms token route by default;
   *  the casino floor passes its own. Same spatial graph either way. */
  getGrant: () => Promise<{ token: string; url: string; listenOnly?: boolean }> = api.voiceToken,
  opts?: VoiceOpts,
): Promise<VoiceJoinResult> {
  const hardGate = opts?.hardGateM ?? HARD_GATE_M;
  const rolloff = opts?.rolloff ?? ROLLOFF;
  // (Air absorption's half-distance scales with the gate — hardGate / 4, in
  // voicemix.ts — so a longer-reaching world doesn't muffle far voices.)
  let grant: { token: string; url: string; listenOnly?: boolean };
  try {
    grant = await getGrant();
  } catch (e) {
    if (e instanceof ApiError && e.status === 503) return { ok: false, reason: "disabled" };
    if (e instanceof ApiError && e.status === 403) return { ok: false, reason: "not_inside" };
    return { ok: false, reason: "failed" };
  }

  // Capture hardening (Josh: mics picked up too much background): browser
  // echo cancellation + noise suppression + auto gain, stated explicitly.
  // On top of that the main app's MIC CHAIN now ports over (the queued item):
  // RNNoise + a sensitivity gate + input gain, all live-adjustable from the
  // pause menu. When neural NS is on the browser's own suppressor is turned
  // OFF — stacking them muffles voices (the main app's lesson).
  const s0 = brSettings;
  const room = new Room({
    audioCaptureDefaults: {
      echoCancellation: true,
      noiseSuppression: !s0.neuralNS,
      autoGainControl: true,
      ...(s0.inputDevice ? { deviceId: s0.inputDevice } : {}),
    },
  });
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = Math.max(0, Math.min(1.5, s0.voiceVolume));
  // THE IMPAIRMENT CHAIN — master → lowpass → [dry + wobbling delay] → out.
  // Transparent at rest (18kHz, no wet), so a sober listener pays nothing for
  // it but three idle nodes.
  const drunkLp = ctx.createBiquadFilter();
  drunkLp.type = "lowpass";
  drunkLp.frequency.value = 18000;
  const drunkDry = ctx.createGain();
  drunkDry.gain.value = 1;
  const drunkWet = ctx.createGain();
  drunkWet.gain.value = 0;
  const drunkDelay = ctx.createDelay(0.08);
  drunkDelay.delayTime.value = 0.012;
  // a slow LFO on the delay time is the wobble: pitch smears as it moves
  const drunkLfo = ctx.createOscillator();
  drunkLfo.frequency.value = 0.7;
  const drunkLfoGain = ctx.createGain();
  drunkLfoGain.gain.value = 0; // depth, opened by setImpairment
  drunkLfo.connect(drunkLfoGain).connect(drunkDelay.delayTime);
  try { drunkLfo.start(); } catch { /* already running */ }
  master.connect(drunkLp);
  // ---- SLORP'S PITCH SHIFTER (Josh, Aug 2026) --------------------------------
  // "People sound funny like their pitch is changed." A modulated delay (the
  // drunk wobble above) SMEARS pitch; it can't hold a voice a fixed distance
  // below where it belongs, which is what the brief asks for. So: a real
  // two-grain shifter on the listener's own master, wet only while somebody
  // is tripping and bypassed to a plain gain otherwise.
  //
  // A worklet rather than the classic pair of ramped delay taps because the
  // taps have to cross-fade EXACTLY where the read head wraps, and oscillator
  // phase in Web Audio is not something you can align by hand — mic-chain.ts
  // already inlines a worklet as a Blob for the same reason. It reads its ring
  // buffer at `ratio` and crossfades two heads half a grain apart with an
  // equal-power window, so the seam is a soft warble instead of a click. The
  // warble is correct here: the point is that voices stop sounding human.
  //
  //   drunkLp ─┬→ dry + wobble ──→ straight ─┐
  //            └→ pitch worklet ──→ pitchWet ┴→ destination
  //
  // `straight` is what stops you hearing the room twice: pitching ducks the
  // unshifted path in the same move. It exists as its own node so nothing here
  // has to fight the gains setImpairment is already driving.
  const straight = ctx.createGain();
  const pitchWet = ctx.createGain();
  pitchWet.gain.value = 0;
  straight.connect(ctx.destination);
  pitchWet.connect(ctx.destination);
  drunkLp.connect(drunkDry).connect(straight);
  drunkLp.connect(drunkDelay).connect(drunkWet).connect(straight);
  let pitchNode: AudioWorkletNode | null = null;
  let pitchReady: Promise<void> | null = null;
  let pitchRatio = 1;
  /** Load the worklet MODULE once, shared by the master shifter (slorp) and
   *  every per-peer shifter (star dust). Resolves false where worklets don't
   *  exist — the callers degrade to unshifted voices, never a throw. */
  let moduleReady: Promise<boolean> | null = null;
  const ensurePitchModule = (): Promise<boolean> => {
    if (moduleReady) return moduleReady;
    moduleReady = (async () => {
      const url = URL.createObjectURL(new Blob([PITCH_WORKLET], { type: "application/javascript" }));
      try {
        await ctx.audioWorklet.addModule(url);
        return true;
      } finally {
        URL.revokeObjectURL(url);
      }
    })().catch(() => false);
    return moduleReady;
  };
  /** Build the master worklet the first time a vial goes down, never before:
   *  a sober hall pays nothing for a drug nobody has taken. */
  const ensurePitch = (): Promise<void> => {
    if (pitchReady) return pitchReady;
    pitchReady = (async () => {
      if (!(await ensurePitchModule())) return;
      const n = new AudioWorkletNode(ctx, "solace-pitch", { numberOfInputs: 1, numberOfOutputs: 1 });
      drunkLp.connect(n);
      n.connect(pitchWet);
      pitchNode = n;
    })().catch(() => {
      // No worklet (an engine that refuses, a context that died): the trip
      // still happens, the voices simply keep their own pitch. Never a throw
      // into the render loop.
      pitchNode = null;
    });
    return pitchReady;
  };
  /** 1 = off. Anything else routes the room through the shifter. */
  const setVoicePitch = (ratio: number): void => {
    const r = Math.max(0.45, Math.min(1.8, Number.isFinite(ratio) ? ratio : 1));
    if (Math.abs(r - pitchRatio) < 0.005) return;
    pitchRatio = r;
    const on = Math.abs(r - 1) > 0.01;
    const t = ctx.currentTime;
    if (on) void ensurePitch();
    const p = pitchNode?.parameters.get("ratio");
    if (p) p.setTargetAtTime(r, t, 0.12);
    // Crossfade rather than switch: the moment the pitch leaves 1 the room
    // slides over to the shifted copy, and back when it returns.
    straight.gain.setTargetAtTime(on && pitchNode ? 0 : 1, t, 0.12);
    pitchWet.gain.setTargetAtTime(on && pitchNode ? 1 : 0, t, 0.12);
  };

  let impaired = 0;
  const setImpairment = (k: number): void => {
    const v = Math.max(0, Math.min(1, k));
    if (Math.abs(v - impaired) < 0.01) return;
    impaired = v;
    const t = ctx.currentTime;
    // highs go first, then the whole thing closes down
    drunkLp.frequency.setTargetAtTime(18000 - 17300 * v * v, t, 0.25);
    drunkDry.gain.setTargetAtTime(1 - 0.35 * v, t, 0.25);
    drunkWet.gain.setTargetAtTime(0.55 * v, t, 0.25);
    drunkLfoGain.gain.setTargetAtTime(0.006 * v, t, 0.25);
    drunkLfo.frequency.setTargetAtTime(0.5 + 0.9 * v, t, 0.25);
  };
  // Output device (Chrome 110+ on AudioContext); silently unsupported
  // elsewhere, where the OS default is the only option anyway.
  const applySink = (id: string): void => {
    const withSink = ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    if (typeof withSink.setSinkId === "function") void withSink.setSinkId(id).catch(() => {});
  };
  if (s0.outputDevice) applySink(s0.outputDevice);
  // THE ROOM, in two sizes. Every peer's wet send lands on `convolver`, which
  // is now a splitter feeding a TIGHT room and a BIG one; `roomMix` crossfades
  // them from whatever space the listener is actually standing in. The hall
  // side gets a pre-delay because distant walls answer late — that gap is most
  // of what the ear reads as "this place is big".
  const convolver = ctx.createGain(); // the send bus every peer connects to
  const tightConv = ctx.createConvolver();
  tightConv.buffer = buildImpulse(ctx, 0.42, 0.86, 3.4); // corridor: short, dark
  const hallConv = ctx.createConvolver();
  hallConv.buffer = buildImpulse(ctx, 2.6, 0.74, 1.9); // hall: long, open tail
  const preDelay = ctx.createDelay(0.2);
  preDelay.delayTime.value = 0.055;
  const tightGain = ctx.createGain();
  const hallGain = ctx.createGain();
  tightGain.gain.value = 1;
  hallGain.gain.value = 0;
  convolver.connect(tightConv);
  convolver.connect(preDelay);
  preDelay.connect(hallConv);
  tightConv.connect(tightGain);
  hallConv.connect(hallGain);
  const reverbBus = ctx.createGain();
  reverbBus.gain.value = 0.9;
  tightGain.connect(reverbBus);
  hallGain.connect(reverbBus);
  reverbBus.connect(master);
  /** 0 = tight corridor, 1 = open hall. Smoothed toward the measurement. */
  let roomMix = 0;

  const peers = new Map<string, PeerAudio>();
  const blocked = new Set<HTMLAudioElement>();
  let isMuted = !!grant.listenOnly;

  // ---- STAR DUST's helium (Josh, Aug 2026) ---------------------------------
  // What each peer SHOULD sound like, remembered independently of whether
  // their track has attached yet — a gassed body's voice must come up shifted
  // from its very first sample, not after the next state change.
  const peerPitchWant = new Map<string, number>();
  const applyPeerPitch = (identity: string, p: PeerAudio, ratio: number): void => {
    const r = Math.max(0.45, Math.min(1.9, Number.isFinite(ratio) ? ratio : 1));
    const on = Math.abs(r - 1) > 0.01;
    const t = ctx.currentTime;
    if (on && !p.pitch) {
      void ensurePitchModule().then((okMod) => {
        // The peer may have detached (or sobered) while the module loaded.
        if (!okMod || !peers.has(identity)) return;
        if (!p.pitch) {
          try {
            p.pitch = new AudioWorkletNode(ctx, "solace-pitch", { numberOfInputs: 1, numberOfOutputs: 1 });
          } catch {
            return; // no worklets here — the voice just keeps its own pitch
          }
        }
        applyPeerPitch(identity, p, peerPitchWant.get(identity) ?? 1);
      });
      return;
    }
    if (on && p.pitch) {
      p.pitch.parameters.get("ratio")?.setTargetAtTime(r, t, 0.1);
      if (!p.pitchOn) {
        // Splice the shifter in: filter → pitch → panner. The hard rewire is
        // audible for a frame at worst; the param move above is smoothed.
        try { p.filter.disconnect(p.panner); } catch { /* already loose */ }
        p.filter.connect(p.pitch);
        p.pitch.connect(p.panner);
        p.pitchOn = true;
      }
      return;
    }
    if (!on && p.pitchOn && p.pitch) {
      try {
        p.filter.disconnect(p.pitch);
        p.pitch.disconnect();
      } catch { /* graph already down */ }
      p.filter.connect(p.panner);
      p.pitchOn = false;
    }
  };
  const setPeerPitch = (id: number, ratio: number): void => {
    const identity = String(id);
    const r = Number.isFinite(ratio) ? ratio : 1;
    if (Math.abs(r - 1) <= 0.01) peerPitchWant.delete(identity);
    else peerPitchWant.set(identity, r);
    const p = peers.get(identity);
    if (p) applyPeerPitch(identity, p, r);
  };

  const attach = (track: RemoteTrack, participant: RemoteParticipant): void => {
    if (track.kind !== Track.Kind.Audio) return;
    const stream = new MediaStream([track.mediaStreamTrack]);
    // The muted element sink that makes Chromium actually deliver samples.
    const el = track.attach() as HTMLAudioElement;
    el.muted = true;
    el.volume = 0;
    document.body.appendChild(el);
    void el.play?.().catch(() => blocked.add(el));

    const src = ctx.createMediaStreamSource(stream);
    // Highpass sits in front of the occlusion lowpass — transparent (10Hz)
    // in normal speech, cranked to ~380Hz when this peer keys the WALKIE so
    // the pair forms the classic 380–2500 telephone band (Josh: "make the
    // voice sound like it's coming through a radio").
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 10;
    hp.Q.value = 0.7;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 18000;
    filter.Q.value = 0.4;
    const panner = new PannerNode(ctx, {
      panningModel: "HRTF",
      distanceModel: "inverse",
      refDistance: REF_DIST_M,
      maxDistance: hardGate * 1.5,
      rolloffFactor: rolloff,
      // No cone — voices radiate; direction comes from position + HRTF.
    });
    const dry = ctx.createGain();
    dry.gain.value = 0; // silent until positioned
    const wet = ctx.createGain();
    wet.gain.value = 0;
    src.connect(hp);
    hp.connect(filter);
    filter.connect(panner);
    panner.connect(dry);
    dry.connect(master);
    panner.connect(wet);
    wet.connect(convolver);
    // The mimic ring: raw (pre-filter) samples into a circular buffer. The
    // ScriptProcessor must reach a destination to be pulled — through a
    // zero-gain node so the tap itself is silent.
    const ring = new Float32Array(Math.floor(ctx.sampleRate * 6));
    const tap = ctx.createScriptProcessor(4096, 1, 1);
    const peerRec: PeerAudio = { el, src, hp, filter, panner, dry, wet, tap, ring, ringAt: 0, pitch: null, pitchOn: false };
    tap.onaudioprocess = (ev) => {
      const input = ev.inputBuffer.getChannelData(0);
      let at = peerRec.ringAt;
      for (let i = 0; i < input.length; i++) {
        ring[at] = input[i];
        at = (at + 1) % ring.length;
      }
      peerRec.ringAt = at;
    };
    const sinkhole = ctx.createGain();
    sinkhole.gain.value = 0;
    src.connect(tap);
    tap.connect(sinkhole);
    sinkhole.connect(master);
    peers.set(participant.identity, peerRec);
    // Attached mid-trip: the want map already knows what this voice should
    // sound like (a gassed body's helium starts at its first word).
    const want = peerPitchWant.get(participant.identity);
    if (want !== undefined) applyPeerPitch(participant.identity, peerRec, want);
  };

  const drop = (identity: string): void => {
    const p = peers.get(identity);
    if (!p) return;
    try {
      p.src.disconnect();
      p.tap.disconnect();
      p.tap.onaudioprocess = null;
      p.hp.disconnect();
      p.filter.disconnect();
      p.panner.disconnect();
      p.dry.disconnect();
      p.wet.disconnect();
      p.pitch?.disconnect();
    } catch {
      /* graph already down */
    }
    p.el.remove();
    peers.delete(identity);
  };

  room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => attach(track, participant));
  room.on(RoomEvent.TrackUnsubscribed, (_track, _pub, participant) => drop(participant.identity));
  room.on(RoomEvent.ParticipantDisconnected, (p) => drop(p.identity));
  // THE AUDIENCE NEVER HEARS THE PLAYERS (VoiceOpts.audienceDeaf): only the
  // participants we can see may subscribe to our mic. Re-listed whenever
  // somebody comes or goes.
  const allowVisible = (): void => {
    if (!opts?.audienceDeaf || room.state !== "connected") return;
    const allowed = [...room.remoteParticipants.values()].map((p) => ({ participantIdentity: p.identity, allowAll: true }));
    try { room.localParticipant.setTrackSubscriptionPermissions(false, allowed); } catch { /* not connected yet */ }
  };
  if (opts?.audienceDeaf) {
    room.on(RoomEvent.ParticipantConnected, allowVisible);
    room.on(RoomEvent.ParticipantDisconnected, allowVisible);
    room.on(RoomEvent.Connected, allowVisible);
  }

  let micOk = true;
  try {
    await room.connect(grant.url, grant.token);
  } catch {
    try {
      await room.disconnect();
    } catch {
      /* already down */
    }
    void ctx.close().catch(() => {});
    return { ok: false, reason: "failed" };
  }
  // set BEFORE the mic opens, so there is no moment a hidden seat could subscribe
  allowVisible();
  // a LISTEN-ONLY seat (the dead, law 12) can't publish until the server
  // grants a talk; it opens its mic then (setMuted(false)). A mic that won't
  // start (no permission, in use, a missing device) used to throw the WHOLE
  // room away — you couldn't hear anybody either, and nothing said why (Oct
  // 2026: Josh couldn't hear Rollo). Now you stay in the room as a listener.
  if (!grant.listenOnly) {
    try {
      await room.localParticipant.setMicrophoneEnabled(true);
    } catch {
      micOk = false;
    }
  }

  // ---- The mic chain + the local meter ------------------------------------
  const needsChain = (g: number, th: number, ns: boolean): boolean => ns || th > 0 || Math.abs(g - 1) > 0.01;
  let chain: MicChainProcessor | null = null;
  let chainNS = false; // topology actually built — a rebuild is expensive
  let level = 0;
  let meterStop: (() => void) | null = null;
  // every start and stop moves this on, so a capture that resolves after a
  // newer start (or a stop) is stopped at once instead of leaking a live mic
  // and its interval (Oct 2026 review)
  let meterGen = 0;
  let lastIn = s0.inputDevice;
  let lastOut = s0.outputDevice;

  /** Watch the LOCAL mic on a separate capture: LiveKit's own track is
   *  processed (and silent while muted), so the meter needs its own tap. */
  const startMeter = (deviceId: string): void => {
    meterStop?.();
    meterStop = null;
    const gen = ++meterGen;
    void navigator.mediaDevices
      .getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true })
      .then((stream) => {
        if (gen !== meterGen) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = 1024;
        src.connect(an);
        const data = new Float32Array(an.fftSize);
        const timer = setInterval(() => {
          an.getFloatTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
          level = Math.sqrt(sum / data.length);
        }, 100);
        meterStop = () => {
          clearInterval(timer);
          try {
            src.disconnect();
            an.disconnect();
          } catch {
            /* down */
          }
          for (const t of stream.getTracks()) t.stop();
          level = 0;
        };
      })
      .catch(() => {
        /* no second capture allowed — the meter just stays flat */
      });
  };

  const applyChain = async (g: number, th: number, ns: boolean): Promise<void> => {
    const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
    const track = pub?.audioTrack;
    if (!track) return;
    try {
      if (!needsChain(g, th, ns)) {
        if (!chain) return; // nothing attached, nothing to strip
        chain = null;
        chainNS = false;
        await track.stopProcessor();
        await track.restartTrack({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
        return;
      }
      if (chain && chainNS === ns) {
        // Same topology: just move the params — NO restart. A rebuild forces
        // the browser's AGC to re-converge and makes the first seconds after
        // an unmute sound muffled (the main app's hard-won rule).
        chain.setGain(g);
        chain.setThreshold(th);
        return;
      }
      // Topology change: the browser's own suppressor stands down when
      // neural NS is on — stacking the two muffles voices.
      await track.restartTrack({ echoCancellation: true, noiseSuppression: !ns, autoGainControl: true });
      chain = new MicChainProcessor({ rnnoise: ns, gain: g, threshold: th });
      chainNS = ns;
      await track.setProcessor(chain);
    } catch {
      // No worklet/wasm here — plain capture still works, so the run goes on.
      chain = null;
      chainNS = false;
    }
  };

  void applyChain(s0.micGain, s0.micSensitivity, s0.neuralNS);

  const T = 0.09; // smoothing constant for all param moves (no zipper/clicks)
  // AUTOMATION IS SCHEDULED ON A CLOCK, NOT PER FRAME (the floor-stays-smooth
  // rule, Sep 2026 review): a per-frame caller schedules 3 room + 9 listener
  // + ~12 per-peer setTargetAtTime events per call. Capped here, at the one
  // place every world goes through, at ~16Hz — above the casino's own 12Hz
  // clock so that caller is unaffected.
  let lastSpatialAt = 0;

  return {
    ok: true,
    micOk,
    voice: {
      setImpairment,
      setVoicePitch,
      setPeerPitch,
      updateSpatial(me, peerPos, radio, openness, ghosts) {
        const wall = performance.now();
        if (wall - lastSpatialAt < 60) return;
        lastSpatialAt = wall;
        const now = ctx.currentTime;
        // Ease toward the measured room rather than snapping: walking through
        // a doorway should open the space up over a moment, not cut to it.
        if (openness !== undefined) {
          roomMix += (Math.max(0, Math.min(1, openness)) - roomMix) * 0.06;
          tightGain.gain.setTargetAtTime(1 - roomMix * 0.75, now, 0.25);
          hallGain.gain.setTargetAtTime(roomMix, now, 0.25);
          // A big room answers later as well as longer.
          preDelay.delayTime.setTargetAtTime(0.02 + roomMix * 0.055, now, 0.3);
        }
        // The listener IS the camera: position in meters, facing from yaw.
        // (Player yaw 0 faces -z in world space; cells are y→z.)
        const lx = me.x * CELL_M;
        const lz = me.y * CELL_M;
        const fx = -Math.sin(me.yaw);
        const fz = -Math.cos(me.yaw);
        const L = ctx.listener;
        if (L.positionX) {
          L.positionX.setTargetAtTime(lx, now, T);
          L.positionY.setTargetAtTime(1.65, now, T);
          L.positionZ.setTargetAtTime(lz, now, T);
          L.forwardX.setTargetAtTime(fx, now, T);
          L.forwardY.setTargetAtTime(0, now, T);
          L.forwardZ.setTargetAtTime(fz, now, T);
          L.upX.setTargetAtTime(0, now, T);
          L.upY.setTargetAtTime(1, now, T);
          L.upZ.setTargetAtTime(0, now, T);
        } else {
          // Legacy WebKit fallback.
          (L as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(lx, 1.65, lz);
          (L as unknown as { setOrientation(a: number, b: number, c: number, d: number, e: number, f: number): void })
            .setOrientation(fx, 0, fz, 0, 1, 0);
        }

        for (const [identity, p] of peers) {
          const info = peerPos.get(Number(identity));
          const ghost = ghosts?.get(Number(identity));
          if (ghost === "near") {
            // a fellow spectator: plain chat, just in front of you, full band
            p.panner.positionX.setTargetAtTime(lx + fx * 0.6, now, T);
            p.panner.positionY.setTargetAtTime(1.65, now, T);
            p.panner.positionZ.setTargetAtTime(lz + fz * 0.6, now, T);
            p.hp.frequency.setTargetAtTime(10, now, T);
            p.hp.Q.setTargetAtTime(0.7, now, T);
            p.filter.frequency.setTargetAtTime(18000, now, T);
            p.filter.Q.setTargetAtTime(0.4, now, T);
            p.dry.gain.setTargetAtTime(1, now, T);
            p.wet.gain.setTargetAtTime(0.04, now, T);
            continue;
          }
          if (ghost === "ghost" && info) {
            // THE GHOST: from where their camera hangs round you, with the
            // body gone out of the voice (a thin band) and the room ringing
            // far more than a living voice would make it. The pitch lift is
            // the caller's (setPeerPitch) — together they read as funny-eerie.
            p.panner.positionX.setTargetAtTime(info.x * CELL_M, now, T);
            p.panner.positionY.setTargetAtTime(1.9, now, T);
            p.panner.positionZ.setTargetAtTime(info.y * CELL_M, now, T);
            p.hp.frequency.setTargetAtTime(320, now, T);
            p.hp.Q.setTargetAtTime(1.1, now, T);
            p.filter.frequency.setTargetAtTime(3300, now, T);
            p.filter.Q.setTargetAtTime(2.2, now, T);
            p.dry.gain.setTargetAtTime(0.85, now, T);
            p.wet.gain.setTargetAtTime(0.7, now, T);
            continue;
          }
          // RADIO overrides everything: full flat volume from anywhere in
          // the sector, centered on the listener, squeezed into the radio
          // band. The walkie is how you defeat distance.
          if (radio?.has(Number(identity))) {
            // FROM THE WALKIE IN YOUR HAND, not from inside your skull — a
            // source parked exactly ON the HRTF listener renders
            // directionless-or-behind (Josh: "it sounds like it's coming
            // from behind"). Low-right of the view, where the radio sits.
            const rx = -fz;
            const rz = fx;
            p.panner.positionX.setTargetAtTime(lx + fx * 0.25 + rx * 0.3, now, T);
            p.panner.positionY.setTargetAtTime(1.25, now, T);
            p.panner.positionZ.setTargetAtTime(lz + fz * 0.25 + rz * 0.3, now, T);
            // The telephone band: 380–2500Hz with a resonant edge — an
            // actual radio squawk, not just a dull lowpass.
            p.hp.frequency.setTargetAtTime(380, now, T);
            p.hp.Q.setTargetAtTime(1.4, now, T);
            p.filter.frequency.setTargetAtTime(2500, now, T);
            p.filter.Q.setTargetAtTime(1.2, now, T);
            p.dry.gain.setTargetAtTime(0.95, now, T);
            p.wet.gain.setTargetAtTime(0.02, now, T);
            continue;
          }
          // Not (or no longer) on the radio: the band opens back up.
          p.hp.frequency.setTargetAtTime(10, now, T);
          p.hp.Q.setTargetAtTime(0.7, now, T);
          p.filter.Q.setTargetAtTime(0.4, now, T);
          if (!info) {
            // No position = no sound. The wire out-ranges hearing, so this
            // only happens beyond earshot anyway.
            p.dry.gain.setTargetAtTime(0, now, T);
            p.wet.gain.setTargetAtTime(0, now, T);
            continue;
          }
          const px = info.x * CELL_M;
          const pz = info.y * CELL_M;
          const dist = Math.hypot(px - lx, pz - lz);
          p.panner.positionX.setTargetAtTime(px, now, T);
          p.panner.positionY.setTargetAtTime(1.65, now, T);
          p.panner.positionZ.setTargetAtTime(pz, now, T);

          // The whole mix — the gate, walls and air dulling the band, walls
          // eating level (~7dB each), the room ringing with distance — is
          // voicemix.ts, pure, so test_proximity.mjs can hold it to its rules.
          const mix = voiceMix(dist, info.walls, hardGate, roomMix);
          if (mix.silent) {
            p.dry.gain.setTargetAtTime(0, now, T);
            p.wet.gain.setTargetAtTime(0, now, T);
            continue;
          }
          p.filter.frequency.setTargetAtTime(mix.cutoff, now, T);
          p.dry.gain.setTargetAtTime(mix.dry, now, T);
          p.wet.gain.setTargetAtTime(mix.wet, now, T);
        }
      },
      playMimic(ofId, x, y) {
        const p = peers.get(String(ofId));
        if (!p) return false;
        const sr = ctx.sampleRate;
        const ring = p.ring;
        // Hunt for a VOICED window: hop 100ms RMS over the ring (skipping
        // the freshest 300ms — likely mid-word), collect candidate starts.
        const hop = Math.floor(sr * 0.1);
        const winLen = Math.floor(sr * (0.9 + Math.random() * 0.7));
        const starts: number[] = [];
        for (let back = Math.floor(sr * 0.3); back + winLen < ring.length - hop; back += hop) {
          const s0 = (p.ringAt - back - winLen + ring.length * 2) % ring.length;
          let sum = 0;
          let cnt = 0;
          for (let i = 0; i < winLen; i += 4) {
            const v = ring[(s0 + i) % ring.length];
            sum += v * v;
            cnt++;
          }
          if (Math.sqrt(sum / cnt) > 0.015) starts.push(s0);
        }
        if (!starts.length) return false;
        const s0 = starts[Math.floor(Math.random() * starts.length)];
        const buf = ctx.createBuffer(1, winLen, sr);
        const data = buf.getChannelData(0);
        for (let i = 0; i < winLen; i++) data[i] = ring[(s0 + i) % ring.length];
        // Fade edges so the snatch never clicks.
        const fade = Math.floor(sr * 0.05);
        for (let i = 0; i < fade; i++) {
          const k = i / fade;
          data[i] *= k;
          data[winLen - 1 - i] *= k;
        }
        const srcNode = ctx.createBufferSource();
        srcNode.buffer = buf;
        // A hair of detune — familiar, but WRONG.
        srcNode.playbackRate.value = 0.96 + Math.random() * 0.06;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 2600;
        const pan = new PannerNode(ctx, {
          panningModel: "HRTF",
          distanceModel: "inverse",
          refDistance: REF_DIST_M,
          maxDistance: hardGate * 1.5,
          rolloffFactor: rolloff,
          positionX: x * CELL_M,
          positionY: 1.6,
          positionZ: y * CELL_M,
        });
        const g = ctx.createGain();
        g.gain.value = 0.9;
        srcNode.connect(lp);
        lp.connect(pan);
        pan.connect(g);
        g.connect(master);
        srcNode.onended = () => {
          try {
            srcNode.disconnect();
            lp.disconnect();
            pan.disconnect();
            g.disconnect();
          } catch {
            /* down */
          }
        };
        srcNode.start();
        return true;
      },
      setMuted(m) {
        isMuted = m;
        void room.localParticipant.setMicrophoneEnabled(!m).catch(() => {});
      },
      setListeners(ids) {
        try {
          if (!ids) room.localParticipant.setTrackSubscriptionPermissions(true);
          else
            room.localParticipant.setTrackSubscriptionPermissions(
              false,
              ids.map((id) => ({ participantIdentity: String(id), allowAll: true })),
            );
        } catch {
          /* not connected */
        }
      },
      muted: () => isMuted,
      speaking: () => !isMuted && room.localParticipant.isSpeaking,
      onGesture() {
        if (ctx.state === "suspended") void ctx.resume().catch(() => {});
        for (const el of [...blocked]) {
          void el.play?.().then(() => blocked.delete(el)).catch(() => {});
        }
      },
      micLevel: () => level,
      applyAudio(s) {
        master.gain.setTargetAtTime(Math.max(0, Math.min(1.5, s.voiceVolume)), ctx.currentTime, 0.08);
        if (s.outputDevice !== lastOut) {
          lastOut = s.outputDevice;
          applySink(s.outputDevice);
        }
        if (s.inputDevice !== lastIn) {
          lastIn = s.inputDevice;
          void room
            .switchActiveDevice("audioinput", s.inputDevice || "default")
            .then(() => applyChain(s.micGain, s.micSensitivity, s.neuralNS))
            .catch(() => {});
          if (meterStop) startMeter(s.inputDevice); // only if the meter is live
          return;
        }
        void applyChain(s.micGain, s.micSensitivity, s.neuralNS);
      },
      startMeter: () => startMeter(lastIn),
      stopMeter: () => {
        meterGen++;
        meterStop?.();
        meterStop = null;
      },
      leave() {
        meterGen++;
        meterStop?.();
        meterStop = null;
        for (const id of [...peers.keys()]) drop(id);
        // ORDER MATTERS, and it did not used to. The old teardown fired
        // `room.disconnect()` and `ctx.close()` in the same tick, unawaited:
        // the peers' MediaStreamAudioSourceNodes live on that context and the
        // mic publication carries a processor with an AudioWorklet, so the
        // graph was being torn down underneath a disconnect that was still
        // running. Stop the capture ourselves rather than trusting the
        // disconnect to reach it, let the disconnect finish, and only then
        // close the graph.
        //
        // Investigating Josh's "leave the backrooms, join voice, can't hear
        // anyone" (Aug 2026). This is teardown hygiene and it is right either
        // way — but it is NOT a confirmed cause. The obvious theory, that
        // leaked AudioContexts exhaust the browser's budget, was measured and
        // is false: a document holds 24 of them without complaint. If the
        // symptom survives, the next place to look is the app side, not here.
        try {
          const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
          const track = pub?.track;
          if (track) {
            void track.stopProcessor?.().catch(() => {});
            track.stop();
          }
        } catch {
          /* already gone — the disconnect below is still the backstop */
        }
        chain = null;
        chainNS = false;
        void room
          .disconnect()
          .catch(() => {})
          .finally(() => {
            void ctx.close().catch(() => {});
          });
      },
    },
  };
}
