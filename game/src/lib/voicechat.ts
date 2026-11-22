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
import { api, ApiError } from "./api";

const CELL_M = 2; // cells → meters
const HARD_GATE_M = 36; // absolute silence beyond this (wire range is 56m)
const REF_DIST_M = 1.5; // full volume within arm's reach
// Inverse-model steepness. Was 1.7 — Josh wanted voices to CARRY a bit
// farther ("volume goes a little further than before"), so the curve is
// gentler; the hard gate + wire range are unchanged.
const ROLLOFF = 1.4;

export interface SpatialPeer {
  x: number; // cells
  y: number; // cells
  walls: number; // walls the straight line to the listener crosses (0..4)
}

export interface ProximityVoice {
  /** Per-frame: where I am (cells + yaw) and where every audible peer is. */
  updateSpatial(me: { x: number; y: number; yaw: number }, peers: Map<number, SpatialPeer>): void;
  setMuted(muted: boolean): void;
  muted(): boolean;
  /** Autoplay-blocked audio + a suspended context get retried here. */
  onGesture(): void;
  leave(): void;
}

export type VoiceJoinResult =
  | { ok: true; voice: ProximityVoice }
  | { ok: false; reason: "disabled" | "not_inside" | "failed" };

/** A synthetic room impulse: filtered noise with an exponential tail. The
 *  classic procedural IR — reads as "large hard-walled interior" without a
 *  single asset file. */
function buildImpulse(ctx: AudioContext): AudioBuffer {
  const dur = 1.1;
  const rate = ctx.sampleRate;
  const len = Math.floor(dur * rate);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // Lowpassed noise (one-pole) so the tail is boomy, not hissy.
      lp = lp * 0.82 + (Math.random() * 2 - 1) * 0.18;
      data[i] = lp * Math.pow(1 - t, 2.6);
    }
  }
  return buf;
}

interface PeerAudio {
  el: HTMLAudioElement; // muted sink (Chromium requirement)
  src: MediaStreamAudioSourceNode;
  filter: BiquadFilterNode;
  panner: PannerNode;
  dry: GainNode;
  wet: GainNode;
}

export async function joinProximityVoice(): Promise<VoiceJoinResult> {
  let grant: { token: string; url: string };
  try {
    grant = await api.voiceToken();
  } catch (e) {
    if (e instanceof ApiError && e.status === 503) return { ok: false, reason: "disabled" };
    if (e instanceof ApiError && e.status === 403) return { ok: false, reason: "not_inside" };
    return { ok: false, reason: "failed" };
  }

  // Capture hardening (Josh: mics picked up too much background): browser
  // echo cancellation + noise suppression + auto gain, stated explicitly.
  // Deeper control — RNNoise, a sensitivity gate, input/output sliders in a
  // game settings screen — is queued; the main app's mic-chain ports over.
  const room = new Room({
    audioCaptureDefaults: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);
  const convolver = ctx.createConvolver();
  convolver.buffer = buildImpulse(ctx);
  const reverbBus = ctx.createGain();
  reverbBus.gain.value = 0.9;
  convolver.connect(reverbBus);
  reverbBus.connect(master);

  const peers = new Map<string, PeerAudio>();
  const blocked = new Set<HTMLAudioElement>();
  let isMuted = false;

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
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 18000;
    filter.Q.value = 0.4;
    const panner = new PannerNode(ctx, {
      panningModel: "HRTF",
      distanceModel: "inverse",
      refDistance: REF_DIST_M,
      maxDistance: 60,
      rolloffFactor: ROLLOFF,
      // No cone — voices radiate; direction comes from position + HRTF.
    });
    const dry = ctx.createGain();
    dry.gain.value = 0; // silent until positioned
    const wet = ctx.createGain();
    wet.gain.value = 0;
    src.connect(filter);
    filter.connect(panner);
    panner.connect(dry);
    dry.connect(master);
    panner.connect(wet);
    wet.connect(convolver);
    peers.set(participant.identity, { el, src, filter, panner, dry, wet });
  };

  const drop = (identity: string): void => {
    const p = peers.get(identity);
    if (!p) return;
    try {
      p.src.disconnect();
      p.filter.disconnect();
      p.panner.disconnect();
      p.dry.disconnect();
      p.wet.disconnect();
    } catch {
      /* graph already down */
    }
    p.el.remove();
    peers.delete(identity);
  };

  room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => attach(track, participant));
  room.on(RoomEvent.TrackUnsubscribed, (_track, _pub, participant) => drop(participant.identity));
  room.on(RoomEvent.ParticipantDisconnected, (p) => drop(p.identity));

  try {
    await room.connect(grant.url, grant.token);
    await room.localParticipant.setMicrophoneEnabled(true);
  } catch {
    try {
      await room.disconnect();
    } catch {
      /* already down */
    }
    void ctx.close().catch(() => {});
    return { ok: false, reason: "failed" };
  }

  const T = 0.09; // smoothing constant for all param moves (no zipper/clicks)

  return {
    ok: true,
    voice: {
      updateSpatial(me, peerPos) {
        const now = ctx.currentTime;
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

          if (dist > HARD_GATE_M) {
            p.dry.gain.setTargetAtTime(0, now, T);
            p.wet.gain.setTargetAtTime(0, now, T);
            continue;
          }

          // Occlusion + air in one cutoff: walls dominate, distance dulls.
          // Air softened with the rolloff change — far voices stay clearer.
          const wallCut = [18000, 900, 420, 240, 170][Math.min(4, info.walls)];
          const airCut = 18000 * Math.pow(0.5, Math.max(0, dist - 8) / 12); // halves every 12m past 8m
          p.filter.frequency.setTargetAtTime(Math.max(150, Math.min(wallCut, airCut)), now, T);

          // Walls also eat level (the panner already does distance): ~7dB per wall.
          const wallGain = Math.pow(0.45, info.walls);
          p.dry.gain.setTargetAtTime(wallGain, now, T);
          // The room speaks with distance: near = dry, far = ringing. Muffled
          // sources excite the room less.
          const wetAmount = Math.min(0.6, (dist / HARD_GATE_M) * 0.8) * Math.pow(0.6, info.walls);
          p.wet.gain.setTargetAtTime(wetAmount, now, T);
        }
      },
      setMuted(m) {
        isMuted = m;
        void room.localParticipant.setMicrophoneEnabled(!m).catch(() => {});
      },
      muted: () => isMuted,
      onGesture() {
        if (ctx.state === "suspended") void ctx.resume().catch(() => {});
        for (const el of [...blocked]) {
          void el.play?.().then(() => blocked.delete(el)).catch(() => {});
        }
      },
      leave() {
        for (const id of [...peers.keys()]) drop(id);
        void room.disconnect();
        void ctx.close().catch(() => {});
      },
    },
  };
}
