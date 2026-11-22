// Voice: the LiveKit room manager. Solace's server stays authoritative for
// channels + permissions and mints room tokens; this module owns the client
// side — connecting, publishing the mic, playing remote audio, mute/deafen,
// device selection, speaking indicators, and join/leave chimes. Room presence
// for the sidebar rides the app's own WebSocket (voice.join/voice.leave →
// voice.state broadcasts), so even users NOT in a room see who is.

import { reportNote } from "./errorreport";
import {
  Room,
  RoomEvent,
  Track,
  ConnectionQuality,
  VideoPresets,
  VideoPreset,
  type LocalAudioTrack,
  type Participant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
  type LocalTrackPublication,
  type VideoTrack,
} from "livekit-client";
import { api, ApiError } from "./api";
import { chimeJoin, chimeLeave } from "./voice-audio";
import { MicChainProcessor } from "./mic-chain";
import { isDesktopShell } from "./platform";
import { lastInputAt } from "./status.svelte";

/** One live video stream on the stage (a camera or a screen share). */
export interface VideoTile {
  sid: string;
  userId: number;
  name: string;
  kind: "camera" | "screen";
  local: boolean;
}

export interface VoicePeer {
  userId: number;
  name: string;
  avatar: string | null;
  muted: boolean;
  speaking: boolean;
  /** LiveKit's link health for this participant (undefined until reported). */
  quality?: "excellent" | "good" | "poor" | "lost";
}

const NS_KEY = "solace_voice_rnnoise";
const VOL_KEY = "solace_voice_volumes";
const GAIN_KEY = "solace_voice_micgain";
const GATE_KEY = "solace_voice_micgate";
const MASTER_KEY = "solace_voice_master";
const BOARD_VOL_KEY = "solace_voice_boardvol";
const PTT_KEY = "solace_voice_ptt";
const MIC_KEY = "solace_voice_mic";
const OUT_KEY = "solace_voice_out";
// Survive a page refresh: the room + mute/deafen state live in sessionStorage
// (per-tab, so a NEW tab never auto-joins; a reload of this one rejoins).
const REJOIN_KEY = "solace_voice_rejoin";

// ---- Voice AFK timeout ------------------------------------------------------
// A tab left open in a room shouldn't haunt it: 15 minutes with no speaking,
// no voice-control touches, AND no app input disconnects you. Watching a live
// camera/screen feed counts as engaged (movie night is motionless by design).
const VOICE_AFK_MS = 15 * 60 * 1000;
const AFK_CHECK_MS = 60_000;
let lastVoiceActive = Date.now();
let afkTimer: ReturnType<typeof setInterval> | null = null;

function bumpVoice(): void {
  lastVoiceActive = Date.now();
}

/** Is voice keeping this user "present"? Streaming or camera-on always;
 *  otherwise recent speaking/voice-control activity while in a room. Feeds
 *  the status tracker so a movie-night host never shows as away. */
export function voiceEngaged(): boolean {
  if (voice.screenOn || voice.camOn) return true;
  return voice.channelId != null && Date.now() - lastVoiceActive < 120_000;
}

function checkVoiceAfk(): void {
  if (!room) return;
  if (voice.tiles.length > 0) return; // a stream is up — spectators are engaged
  const active = Math.max(lastVoiceActive, lastInputAt());
  if (Date.now() - active > VOICE_AFK_MS) {
    void leaveVoice().then(() => {
      voice.error = "Disconnected from voice — no activity for 15 minutes.";
    });
  }
}

function readVolumes(): Record<number, number> {
  try {
    const v = JSON.parse(localStorage.getItem(VOL_KEY) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export const voice = $state<{
  enabled: boolean;
  /** channelId → userIds currently in that room (server presence, all rooms). */
  presence: Record<number, number[]>;
  /** userId → live camera/screen flags (drives the sidebar 🎥/🖥️ badges). */
  media: Record<number, { cam: boolean; screen: boolean }>;
  /** The room I'm in (null = not connected). */
  channelId: number | null;
  connecting: boolean;
  muted: boolean;
  deafened: boolean;
  peers: VoicePeer[]; // me included, in join order
  mics: { id: string; label: string }[];
  outputs: { id: string; label: string }[];
  micId: string | null;
  outputId: string | null;
  error: string | null;
  /** Neural (RNNoise) noise suppression — per-user opt-in, persisted. */
  neuralNS: boolean;
  /** Local listening volume per userId (1 = full), persisted. */
  volumes: Record<number, number>;
  /** Local volume for someone's STREAM audio (screen share), per userId. */
  streamVolumes: Record<number, number>;
  /** userIds whose SCREEN STREAM I've joined. Streams are opt-in per viewer
   *  (cameras are part of the call and always show); an unwatched stream is
   *  hidden from the stage and its audio is muted locally. */
  watching: number[];
  /** streamerId → userIds watching them (server-tracked; drives 👁 counts
   *  on watch pills + the streamer's joined/left notices). */
  viewers: Record<number, number[]>;
  /** Mic input gain 0.5–3 (1 = raw). Per-device, persisted. */
  micGain: number;
  /** Mic sensitivity: noise-gate RMS threshold 0–0.3 (0 = always open). */
  micGate: number;
  /** Master speaker volume 0–1.5, multiplied into every remote volume. */
  masterVolume: number;
  /** Soundboard + custom join/leave sound volume 0–1.5 (0 = muted for ME —
   *  the Discord model: the room still hears pads, each listener dials their
   *  own). Persisted per machine like the master slider. */
  soundboardVolume: number;
  /** True while the local mic hears speech but we're muted. */
  mutedTalking: boolean;
  /** Live mic input RMS (same scale as micGate) while the settings meter
   *  probe runs — drives the ambient-level bar next to the sensitivity
   *  slider. 0 when the probe is off. */
  micLevel: number;
  /** True when the browser blocked audio output (autoplay policy after an
   *  auto-rejoin) — the user must click once to hear the room. */
  audioBlocked: boolean;
  /** My camera / screen-share publish state. */
  camOn: boolean;
  screenOn: boolean;
  /** Every live video stream in the room (screens first), mine included. */
  tiles: VideoTile[];
  /** The stage is collapsed to a pill (per-user choice, not persisted). */
  stageMin: boolean;
  /** Push-to-talk (desktop shell only): baseline-muted; the global hotkey
   *  opens the mic while held. Persisted per user. */
  pttEnabled: boolean;
  /** Screen-share quality tier (Settings → Voice & Video). Next share. */
  streamQuality: "480" | "720" | "1080" | "2160";
  /** Screen-share FPS cap (15/30/60). Next share. */
  streamFps: 15 | 30 | 60;
}>({
  enabled: false,
  presence: {},
  media: {},
  channelId: null,
  connecting: false,
  muted: false,
  deafened: false,
  peers: [],
  mics: [],
  outputs: [],
  micId: localStorage.getItem(MIC_KEY),
  outputId: localStorage.getItem(OUT_KEY),
  error: null,
  neuralNS: localStorage.getItem(NS_KEY) === "1",
  volumes: readVolumes(),
  streamVolumes: {},
  watching: [],
  viewers: {},
  micGain: Number(localStorage.getItem(GAIN_KEY)) || 1,
  micGate: Number(localStorage.getItem(GATE_KEY)) || 0,
  masterVolume: Number(localStorage.getItem(MASTER_KEY)) || 1,
  soundboardVolume:
    localStorage.getItem(BOARD_VOL_KEY) === null ? 1 : Math.max(0, Number(localStorage.getItem(BOARD_VOL_KEY)) || 0),
  mutedTalking: false,
  micLevel: 0,
  audioBlocked: false,
  camOn: false,
  screenOn: false,
  tiles: [],
  stageMin: false,
  pttEnabled: localStorage.getItem(PTT_KEY) === "1",
  streamQuality: (["480", "720", "1080", "2160"].includes(localStorage.getItem("solace_voice_streamq") ?? "")
    ? localStorage.getItem("solace_voice_streamq")
    : "1080") as "480" | "720" | "1080" | "2160",
  streamFps: ([15, 30, 60].includes(Number(localStorage.getItem("solace_voice_streamfps")))
    ? Number(localStorage.getItem("solace_voice_streamfps"))
    : 60) as 15 | 30 | 60,
});

let room: Room | null = null;
let audioSink: HTMLDivElement | null = null;
let preDeafenMuted = false;
let speakPoll: ReturnType<typeof setInterval> | null = null;
/** identity → LiveKit connection quality, pruned in refreshPeers. */
const qualityMap = new Map<number, VoicePeer["quality"]>();

// ---- video (camera + screen share) ------------------------------------------
// Tracks are stateful objects, so they live in a NON-reactive registry; the
// reactive `voice.tiles` list carries only metadata. VideoStage looks the
// track up by sid and attaches it to its <video> element.
const videoTracks = new Map<string, VideoTrack>();

export function videoTrackFor(sid: string): VideoTrack | undefined {
  return videoTracks.get(sid);
}

function addTile(track: VideoTrack, source: Track.Source, p: { identity: string; name?: string }, local: boolean): void {
  const sid = track.sid ?? `${p.identity}:${source}`;
  if (videoTracks.has(sid)) return;
  videoTracks.set(sid, track);
  const tile: VideoTile = {
    sid,
    userId: Number(p.identity),
    name: p.name || p.identity,
    kind: source === Track.Source.ScreenShare ? "screen" : "camera",
    local,
  };
  // Screens lead the stage; cameras follow in arrival order.
  voice.tiles = [...voice.tiles, tile].sort((a, b) => Number(b.kind === "screen") - Number(a.kind === "screen"));
  // Cameras + my own publishes surface the stage; someone ELSE's stream only
  // offers its watch pill — joining a stream is the viewer's choice.
  if (local || tile.kind === "camera") voice.stageMin = false;
}

function dropTile(sid: string | undefined): void {
  if (!sid) return;
  const gone = voice.tiles.find((t) => t.sid === sid);
  videoTracks.delete(sid);
  voice.tiles = voice.tiles.filter((t) => t.sid !== sid);
  // A stream that ended leaves the watch list too — a future stream from the
  // same person must be a fresh opt-in, never an auto-join.
  if (gone?.kind === "screen" && !voice.tiles.some((t) => t.kind === "screen" && t.userId === gone.userId)) {
    voice.watching = voice.watching.filter((id) => id !== gone.userId);
  }
}
// The app socket's sender, injected by chat.svelte.ts (avoids a module cycle).
let notifyServer: (channelId: number | null) => void = () => {};

export function setVoicePresenceSender(fn: (channelId: number | null) => void): void {
  notifyServer = fn;
}

// Same deal for camera/screen badge flags (voice.media frames).
let notifyMediaFn: (cam: boolean, screen: boolean) => void = () => {};

export function setVoiceMediaSender(fn: (cam: boolean, screen: boolean) => void): void {
  notifyMediaFn = fn;
}

/** Tell the server my current publish flags so everyone's sidebar updates. */
export function notifyVoiceMedia(): void {
  notifyMediaFn(voice.camOn, voice.screenOn);
}

// Stream viewership wire (injected like the media sender).
let notifyWatchFn: (streamerId: number, watching: boolean) => void = () => {};
export function setStreamWatchSender(fn: typeof notifyWatchFn): void {
  notifyWatchFn = fn;
}

/** A stream.viewers frame: update the counts, and if it's MY stream, give me
 *  a soft joined/left notice (chime + nothing intrusive). */
export function applyStreamViewers(
  streamerId: number,
  viewers: number[],
  watcherId?: number,
  watching?: boolean,
  myId?: number,
): void {
  if (viewers.length === 0) {
    const { [streamerId]: _, ...rest } = voice.viewers;
    voice.viewers = rest;
  } else {
    voice.viewers = { ...voice.viewers, [streamerId]: viewers };
  }
  // The streamer hears viewers come and go (never their own join echo).
  if (myId != null && streamerId === myId && watcherId != null && watcherId !== myId && !voice.deafened) {
    if (watching) chimeJoin();
    else chimeLeave();
  }
}

export function applyStreamViewersSnapshot(map: Record<string, number[]>): void {
  const next: Record<number, number[]> = {};
  for (const [uid, list] of Object.entries(map ?? {})) {
    if (Array.isArray(list) && list.length) next[Number(uid)] = list.map(Number);
  }
  voice.viewers = next;
}

// Roster lookup (also injected — chat.svelte.ts owns the member list). Used
// to play a joiner's entrance sound (uploaded file > equipped chime > default).
let lookupMember: (id: number) => {
  cosmetics?: { chime?: string; enterSound?: string; leaveSound?: string };
} | undefined = () => undefined;

/** Play an uploaded sound file (/sounds/<uuid>) at a polite volume scaled by
 *  the master slider AND the listener's soundboard slider (uploaded pads +
 *  entrance/leave sounds are all "soundboard audio" — Discord's model: the
 *  room hears them, each listener controls their own volume, 0 = muted).
 *  Best-effort — autoplay policy may eat it pre-gesture. */
function playFileSound(file: string, gain = 0.6): void {
  const vol = gain * voice.masterVolume * voice.soundboardVolume;
  if (vol <= 0) return;
  try {
    const a = new Audio(`/sounds/${file}`);
    a.volume = Math.max(0, Math.min(1, vol));
    void a.play().catch(() => {});
  } catch {
    /* no audio */
  }
}

/** The listener-side soundboard volume (Settings → Voice & Video, plus the
 *  quick mute on the dock's soundboard panel). */
export function setSoundboardVolume(v: number): void {
  const val = Math.max(0, Math.min(1.5, v));
  voice.soundboardVolume = val;
  localStorage.setItem(BOARD_VOL_KEY, String(val));
}

// Who am I? Injected from chat.svelte.ts (module-cycle avoidance) so joining
// can play MY OWN entrance sound to me — Discord plays it to everyone,
// including you.
let selfId: number | null = null;
export function setVoiceSelfId(id: number | null): void {
  selfId = id;
}
function myCosmetics(): { enterSound?: string; leaveSound?: string } | undefined {
  return selfId === null ? undefined : lookupMember(selfId)?.cosmetics;
}

// The soundboard sender (injected by chat.svelte.ts, like the media sender).
let sendBoardFn: (id: number) => void = () => {};
export function setSoundboardSender(fn: typeof sendBoardFn): void {
  sendBoardFn = fn;
}

/** Fire a house-library pad at the room (server validates + fans out). */
export function triggerSoundboard(id: number): void {
  if (voice.channelId === null) return;
  sendBoardFn(id);
}

/** An incoming soundboard.play frame — someone in my room hit a pad. */
export function playIncomingBoard(file: string): void {
  if (voice.channelId === null || voice.deafened) return;
  playFileSound(file, 0.8);
}

/** Audition a pad locally — my ears only, the room hears nothing. */
export function previewBoardSound(file: string): void {
  playFileSound(file, 0.8);
}

export function setVoiceMemberLookup(fn: typeof lookupMember): void {
  lookupMember = fn;
}

/** Server voice.state frame (or my own echo). */
export function applyVoiceState(userId: number, channelId: number | null): void {
  const next: Record<number, number[]> = {};
  for (const [ch, ids] of Object.entries(voice.presence)) {
    const filtered = ids.filter((id) => id !== userId);
    if (filtered.length) next[Number(ch)] = filtered;
  }
  if (channelId !== null) next[channelId] = [...(next[channelId] ?? []), userId];
  voice.presence = next;
  // Any presence change resets that user's badges (video starts off on join).
  const { [userId]: _, ...rest } = voice.media;
  voice.media = rest;
}

/** The ready frame's full snapshot. */
export function applyVoiceSnapshot(map: Record<string, number>): void {
  const next: Record<number, number[]> = {};
  for (const [uid, ch] of Object.entries(map ?? {})) {
    (next[ch] ??= []).push(Number(uid));
  }
  voice.presence = next;
}

/** Server voice.media frame — someone's camera/screen flags changed. */
export function applyVoiceMedia(userId: number, cam: boolean, screen: boolean): void {
  if (!cam && !screen) {
    const { [userId]: _, ...rest } = voice.media;
    voice.media = rest;
  } else {
    voice.media = { ...voice.media, [userId]: { cam, screen } };
  }
}

/** The ready frame's media snapshot. */
export function applyVoiceMediaSnapshot(map: Record<string, { cam?: boolean; screen?: boolean }>): void {
  const next: Record<number, { cam: boolean; screen: boolean }> = {};
  for (const [uid, m] of Object.entries(map ?? {})) {
    next[Number(uid)] = { cam: m?.cam === true, screen: m?.screen === true };
  }
  voice.media = next;
}

export async function loadVoiceConfig(): Promise<void> {
  try {
    const r = await api.voiceConfig();
    voice.enabled = r.enabled;
  } catch {
    voice.enabled = false;
  }
}

// ---- refresh survival -------------------------------------------------------
// F5 tears the whole page (and the LiveKit room) down; these keep enough state
// in sessionStorage to rejoin the same room with the same mute/deafen posture.
// The key is written on join and every mute/deafen flip, and cleared ONLY by an
// explicit leave or logout — a kick/network death keeps it, since a refresh-
// rejoin re-validates permissions server-side anyway.

function persistRejoin(): void {
  if (voice.channelId == null) return;
  sessionStorage.setItem(
    REJOIN_KEY,
    JSON.stringify({
      channelId: voice.channelId,
      muted: voice.muted,
      deafened: voice.deafened,
      preDeafenMuted,
    }),
  );
}

function clearRejoin(): void {
  sessionStorage.removeItem(REJOIN_KEY);
}

let rejoinTried = false;

/** Called once after login + voice config load. If this tab was in a voice
 *  room before a reload, rejoin it — muted/deafened exactly as it left (so a
 *  refresh can never turn into a hot mic). */
export async function attemptVoiceRejoin(): Promise<void> {
  if (rejoinTried) return;
  rejoinTried = true;
  if (!voice.enabled || voice.channelId != null) return;
  const raw = sessionStorage.getItem(REJOIN_KEY);
  if (!raw) return;
  let saved: { channelId?: number; muted?: boolean; deafened?: boolean; preDeafenMuted?: boolean };
  try {
    saved = JSON.parse(raw);
  } catch {
    clearRejoin();
    return;
  }
  if (typeof saved?.channelId !== "number") {
    clearRejoin();
    return;
  }
  voice.deafened = saved.deafened === true;
  voice.muted = saved.muted === true || voice.deafened;
  preDeafenMuted = saved.preDeafenMuted === true;
  await joinVoice(saved.channelId);
  // A failed rejoin (channel deleted, lock tightened…) must not retry on
  // every subsequent refresh.
  if (voice.channelId !== saved.channelId) clearRejoin();
}

/** The one-click unblock for the browser's autoplay policy. */
export async function enableVoiceAudio(): Promise<void> {
  if (!room) return;
  try {
    await room.startAudio();
    voice.audioBlocked = !room.canPlaybackAudio;
  } catch {
    /* still blocked — the banner stays */
  }
}

function sink(): HTMLDivElement {
  if (!audioSink) {
    audioSink = document.createElement("div");
    audioSink.id = "voice-audio-sink";
    audioSink.style.display = "none";
    document.body.appendChild(audioSink);
  }
  return audioSink;
}

function peerFrom(p: RemoteParticipant | Room["localParticipant"]): VoicePeer {
  let avatar: string | null = null;
  try {
    avatar = p.metadata ? (JSON.parse(p.metadata).avatar ?? null) : null;
  } catch {}
  return {
    userId: Number(p.identity),
    name: p.name || p.identity,
    avatar,
    muted: p.isMicrophoneEnabled === false,
    speaking: false,
  };
}

/** Speaking rings: LiveKit's activeSpeakers list has its own minimum-level
 *  threshold, so quiet-but-perfectly-audible talkers never lit up. We OR in
 *  the per-participant audio level (server-reported for everyone) with a
 *  short hang time so rings track what you actually HEAR. */
const SPEAK_LEVEL = 0.004;
const SPEAK_HANG_MS = 450;
const speakingHold = new Map<number, number>();

function refreshPeers(): void {
  if (!room) {
    voice.peers = [];
    speakingHold.clear();
    return;
  }
  const now = Date.now();
  // Viewer side-connections (the pop-out window's "<id>.v.<nonce>" identity)
  // are invisible plumbing — only pure-numeric identities are real people.
  const parts = [room.localParticipant, ...room.remoteParticipants.values()].filter((p) =>
    /^\d+$/.test(p.identity),
  );
  const present = new Set<number>();
  for (const p of parts) {
    const id = Number(p.identity);
    present.add(id);
    if (p.isSpeaking || p.audioLevel > SPEAK_LEVEL) speakingHold.set(id, now);
  }
  for (const id of qualityMap.keys()) if (!present.has(id)) qualityMap.delete(id);
  for (const id of speakingHold.keys()) if (!present.has(id)) speakingHold.delete(id);
  voice.peers = parts.map((p) => {
    const base = peerFrom(p);
    return {
      ...base,
      speaking: (speakingHold.get(base.userId) ?? 0) > now - SPEAK_HANG_MS,
      quality: qualityMap.get(base.userId),
    };
  });
}

/** The local mic's LiveKit track, when published. */
function micTrack(): LocalAudioTrack | null {
  const pub = room?.localParticipant.getTrackPublication(Track.Source.Microphone);
  return (pub?.track as LocalAudioTrack | undefined) ?? null;
}

// ---- The mic chain (RNNoise + gate + gain, ONE processor) -------------------
let chain: MicChainProcessor | null = null;
/** The rnnoise flag the LIVE chain was built with (null = no chain attached). */
let chainNS: boolean | null = null;
const needsChain = () => voice.neuralNS || voice.micGain !== 1 || voice.micGate > 0;

/** (Re)build or remove the mic processing chain to match current settings.
 *  A full rebuild restarts the capture — which forces the browser's AGC to
 *  re-converge from scratch and made the first seconds after every unmute
 *  sound muffled — so a chain that's already running with the right topology
 *  just gets its live params re-asserted instead. */
async function applyMicChain(): Promise<void> {
  const track = micTrack();
  if (!track) return;
  try {
    if (needsChain()) {
      if (chain && chainNS === voice.neuralNS) {
        chain.setGain(voice.micGain);
        chain.setThreshold(voice.micGate);
        return;
      }
      // Browser NS stands down when neural is on — stacking muffles voices.
      await track.restartTrack({ echoCancellation: true, noiseSuppression: !voice.neuralNS, autoGainControl: true });
      chain = new MicChainProcessor({ rnnoise: voice.neuralNS, gain: voice.micGain, threshold: voice.micGate });
      await track.setProcessor(chain);
      chainNS = voice.neuralNS;
    } else {
      if (!chain) return; // nothing attached, nothing to strip
      chain = null;
      chainNS = null;
      await track.stopProcessor();
      await track.restartTrack({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
    }
  } catch {
    // Worklet/wasm unavailable (ancient browser) — fall back to standard.
    chain = null;
    chainNS = null;
    voice.neuralNS = false;
    localStorage.setItem(NS_KEY, "0");
  }
}

/** Mic input gain (0.5–3×). Live-updates the running chain; per-device. */
export async function setMicGain(v: number): Promise<void> {
  const val = Math.max(0.5, Math.min(3, v));
  voice.micGain = val;
  localStorage.setItem(GAIN_KEY, String(val));
  if (chain) chain.setGain(val);
  else if (needsChain()) await applyMicChain();
}

/** Mic sensitivity: the noise-gate RMS threshold (0 = always open). */
export async function setMicGate(v: number): Promise<void> {
  const val = Math.max(0, Math.min(0.3, v));
  voice.micGate = val;
  localStorage.setItem(GATE_KEY, String(val));
  if (chain) chain.setThreshold(val);
  else if (needsChain()) await applyMicChain();
}

/** setVolume that can never break a join: LiveKit backs volume with a
 *  WebAudio gain (>1 fine) OR a bare media element (>1 THROWS IndexSizeError
 *  — the prod join-killer when a stored slider sat past 100%). Try the real
 *  value, clamp on refusal, and never let it escape into a connect. */
function safeVolume(p: RemoteParticipant, v: number, source?: Track.Source): void {
  try {
    p.setVolume(v, source as never);
  } catch {
    try {
      p.setVolume(Math.max(0, Math.min(1, v)), source as never);
    } catch {
      /* no audio element yet — the stored volume re-applies on subscribe */
    }
  }
}

/** Master speaker volume — multiplied into every voice + stream volume. */
export function setMasterVolume(v: number): void {
  const val = Math.max(0, Math.min(1.5, v));
  voice.masterVolume = val;
  localStorage.setItem(MASTER_KEY, String(val));
  if (!room) return;
  for (const p of room.remoteParticipants.values()) {
    const id = Number(p.identity);
    safeVolume(p, (voice.volumes[id] ?? 1) * val);
    safeVolume(p, streamAudioVolume(id), Track.Source.ScreenShareAudio);
  }
}

/** Adopt account-level voice prefs at login (server wins; the localStorage
 *  values seeded at module load stand in until then / for old accounts). */
export function adoptVoicePrefs(v: { neuralNS?: boolean; ptt?: boolean } | undefined): void {
  if (v?.neuralNS !== undefined) {
    voice.neuralNS = v.neuralNS === true;
    localStorage.setItem(NS_KEY, voice.neuralNS ? "1" : "0");
  }
  if (v?.ptt !== undefined) {
    voice.pttEnabled = v.ptt === true;
    localStorage.setItem(PTT_KEY, voice.pttEnabled ? "1" : "0");
  }
}

export async function toggleNeuralNS(): Promise<void> {
  voice.neuralNS = !voice.neuralNS;
  localStorage.setItem(NS_KEY, voice.neuralNS ? "1" : "0");
  // Account-level: follows you to any device/browser. Fire-and-forget — the
  // localStorage mirror keeps this device right even if the write fails.
  void api.updatePrefs({ voice: { neuralNS: voice.neuralNS } }).catch(() => {});
  await applyMicChain();
}

/** Local listening volume for one person (0..1.5, like Discord's slider).
 *  The master speaker volume multiplies in on top. */
export function setUserVolume(userId: number, vol: number): void {
  const v = Math.max(0, Math.min(1.5, vol));
  voice.volumes = { ...voice.volumes, [userId]: v };
  localStorage.setItem(VOL_KEY, JSON.stringify(voice.volumes));
  if (!room) return;
  for (const p of room.remoteParticipants.values()) {
    if (Number(p.identity) === userId) safeVolume(p, v * voice.masterVolume);
  }
}

function applyStoredVolume(p: RemoteParticipant): void {
  const v = (voice.volumes[Number(p.identity)] ?? 1) * voice.masterVolume;
  if (v !== 1) safeVolume(p, v);
}

/** The effective LOCAL volume for someone's stream audio: their slider ×
 *  master when I'm watching, hard 0 when I'm not (streams are opt-in). */
function streamAudioVolume(userId: number): number {
  if (!voice.watching.includes(userId)) return 0;
  return (voice.streamVolumes[userId] ?? 1) * voice.masterVolume;
}

function applyStreamAudio(userId: number): void {
  if (!room) return;
  for (const p of room.remoteParticipants.values()) {
    if (Number(p.identity) === userId) safeVolume(p, streamAudioVolume(userId), Track.Source.ScreenShareAudio);
  }
}

/** Volume for someone's STREAM audio — separate from their voice: screen-share
 *  audio is its own track (Track.Source.ScreenShareAudio), which the per-person
 *  voice slider deliberately doesn't touch. */
export function setStreamVolume(userId: number, vol: number): void {
  const v = Math.max(0, Math.min(1.5, vol));
  voice.streamVolumes = { ...voice.streamVolumes, [userId]: v };
  applyStreamAudio(userId);
}

/** Join someone's stream: their screen appears on my stage and its audio
 *  unmutes at my stored volume. The publisher is unaffected; the server just
 *  counts me for the 👁 badge and the streamer's joined notice. */
export function watchStream(userId: number): void {
  if (!voice.watching.includes(userId)) voice.watching = [...voice.watching, userId];
  applyStreamAudio(userId);
  notifyWatchFn(userId, true);
}

/** Leave a stream: hide their screen from my stage and mute its audio.
 *  keepPresence = the desktop pop-out case — the viewing continues in the
 *  native window, so I stay counted; only the in-app copy stops. */
export function leaveStream(userId: number, keepPresence = false): void {
  voice.watching = voice.watching.filter((id) => id !== userId);
  applyStreamAudio(userId);
  if (!keepPresence) notifyWatchFn(userId, false);
}

// ---- "you're muted" detection -----------------------------------------------
// While muted we open a tiny separate capture with an analyser (LiveKit's own
// track goes silent on mute, so it can't be observed). Speech for ~600ms
// lights the warning; it clears shortly after silence, and the probe is torn
// down the moment we unmute, deafen, or leave.

let probeStream: MediaStream | null = null;
let probeCtx: AudioContext | null = null;
let probeTimer: ReturnType<typeof setInterval> | null = null;

async function startMutedProbe(): Promise<void> {
  if (probeTimer || !room || !voice.muted || voice.deafened) return;
  try {
    probeStream = await navigator.mediaDevices.getUserMedia({
      audio: voice.micId ? { deviceId: voice.micId } : true,
    });
    probeCtx = new AudioContext();
    const src = probeCtx.createMediaStreamSource(probeStream);
    const analyser = probeCtx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let loudSince = 0;
    let quietSince = 0;
    probeTimer = setInterval(() => {
      // Suspended while hidden — the analyser holds stale samples, so a tick
      // here must not read them as live speech.
      if (document.hidden) {
        loudSince = 0;
        quietSince = 0;
        return;
      }
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const now = Date.now();
      if (rms > 0.04) {
        quietSince = 0;
        if (!loudSince) loudSince = now;
        if (now - loudSince > 600) voice.mutedTalking = true;
      } else {
        loudSince = 0;
        if (!quietSince) quietSince = now;
        if (now - quietSince > 2000) voice.mutedTalking = false;
      }
    }, 120);
    if (document.hidden) void probeCtx.suspend().catch(() => {});
  } catch {
    /* no mic permission — nothing to warn about */
  }
}

// Battery: the warning is something you LOOK at — while the tab is hidden
// nobody can see it, so park the probe's audio graph. The capture itself
// stays open (stopping the track would flicker the browser's mic-in-use
// indicator every alt-tab); suspend/resume is instant and silent.
document.addEventListener("visibilitychange", () => {
  if (!probeCtx) return;
  if (document.hidden) {
    void probeCtx.suspend().catch(() => {});
    voice.mutedTalking = false;
  } else {
    void probeCtx.resume().catch(() => {});
  }
});

function stopMutedProbe(): void {
  if (probeTimer) clearInterval(probeTimer);
  probeTimer = null;
  probeStream?.getTracks().forEach((t) => t.stop());
  probeStream = null;
  void probeCtx?.close().catch(() => {});
  probeCtx = null;
  voice.mutedTalking = false;
}

function syncMutedProbe(): void {
  // In push-to-talk mode "muted" is the resting state by design — warning
  // someone that they're muted-and-talking would be constant noise.
  if (room && voice.muted && !voice.deafened && !voice.pttEnabled) void startMutedProbe();
  else stopMutedProbe();
}

// ---- The settings level meter -----------------------------------------------
// While Settings → Voice is open, a dedicated capture feeds voice.micLevel
// (RMS, the SAME scale the gate worklet thresholds on) so the sensitivity
// slider shows live ambient vs. the gate line. Runs in or out of a room;
// mirrors the live capture's processing constraints so what you calibrate is
// what the gate actually hears. Torn down the moment the panel closes.

let meterStream: MediaStream | null = null;
let meterCtx: AudioContext | null = null;
let meterTimer: ReturnType<typeof setInterval> | null = null;

export async function startMicMeter(): Promise<void> {
  if (meterTimer) return;
  try {
    meterStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(voice.micId ? { deviceId: voice.micId } : {}),
        echoCancellation: true,
        noiseSuppression: !voice.neuralNS,
        autoGainControl: true,
      },
    });
    meterCtx = new AudioContext();
    const src = meterCtx.createMediaStreamSource(meterStream);
    const analyser = meterCtx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let smoothed = 0;
    meterTimer = setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      // Fast rise, gentle fall — a readable meter instead of a jittery one.
      smoothed = rms > smoothed ? rms : smoothed * 0.8 + rms * 0.2;
      voice.micLevel = smoothed;
    }, 80);
  } catch {
    voice.micLevel = 0; // no mic permission — the meter just stays empty
  }
}

export function stopMicMeter(): void {
  if (meterTimer) clearInterval(meterTimer);
  meterTimer = null;
  meterStream?.getTracks().forEach((t) => t.stop());
  meterStream = null;
  void meterCtx?.close().catch(() => {});
  meterCtx = null;
  voice.micLevel = 0;
}

// ---- push-to-talk (desktop shell only) --------------------------------------
// The shell registers a GLOBAL hotkey (works while gaming, unfocused) and
// calls window.__solacePTT(true|false) on press/release. In PTT mode the mic
// rests muted and opens only while held.

export async function togglePtt(): Promise<void> {
  voice.pttEnabled = !voice.pttEnabled;
  localStorage.setItem(PTT_KEY, voice.pttEnabled ? "1" : "0");
  void api.updatePrefs({ voice: { ptt: voice.pttEnabled } }).catch(() => {});
  if (room && voice.pttEnabled && !voice.muted) {
    // Entering PTT mode: drop to the resting (muted) state.
    voice.muted = true;
    await room.localParticipant.setMicrophoneEnabled(false);
    persistRejoin();
  }
  syncMutedProbe();
  refreshPeers();
}

async function pttSet(down: boolean): Promise<void> {
  if (!voice.pttEnabled || !room || voice.deafened) return;
  voice.muted = !down;
  await room.localParticipant.setMicrophoneEnabled(down);
  if (down && needsChain()) await applyMicChain();
  refreshPeers();
}

if (isDesktopShell) {
  (window as unknown as { __solacePTT?: (down: boolean) => void }).__solacePTT = (down) => void pttSet(down);
}

/** The in-app "Push to talk (hold)" keybind — same behavior as the desktop
 *  shell's global hotkey, but works in any browser while Solace is focused. */
export function holdTalk(down: boolean): void {
  void pttSet(down);
}

// Hold-to-mute: the inverse — in normal (non-PTT) mode, the mic closes while
// the key is held and reopens on release IF it was open before. Transient, so
// it never touches the rejoin posture or the muted-talking probe.
let holdMuteEngaged = false;
let preHoldMuted = false;

export function holdMute(down: boolean): void {
  if (!room || voice.deafened || voice.pttEnabled) return;
  if (down) {
    if (holdMuteEngaged) return;
    holdMuteEngaged = true;
    preHoldMuted = voice.muted;
    if (!voice.muted) {
      voice.muted = true;
      void room.localParticipant.setMicrophoneEnabled(false).then(refreshPeers);
    }
  } else {
    if (!holdMuteEngaged) return;
    holdMuteEngaged = false;
    if (!preHoldMuted && voice.muted) {
      voice.muted = false;
      void room.localParticipant.setMicrophoneEnabled(true).then(async () => {
        if (needsChain()) await applyMicChain();
        refreshPeers();
      });
    }
  }
}

/** Re-read the device lists. `ask` = allowed to ask for mic permission to
 *  get device names (a headset plugging in mid-session must NOT pop a
 *  permission prompt out of nowhere, so the devicechange path passes false). */
export async function refreshDevices(ask = true): Promise<void> {
  try {
    const mics = await Room.getLocalDevices("audioinput", ask);
    const outs = await Room.getLocalDevices("audiooutput", false);
    // Browsers can list the same deviceId twice (a permission-less
    // enumeration hands back "" for every device) — a keyed {#each} throws on
    // that. Keep the first of each id.
    const uniq = <T extends { id: string }>(xs: T[]): T[] => {
      const seen = new Set<string>();
      return xs.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
    };
    voice.mics = uniq(mics.map((d) => ({ id: d.deviceId, label: d.label || "Microphone" })));
    voice.outputs = uniq(outs.map((d) => ({ id: d.deviceId, label: d.label || "Speakers" })));
  } catch {
    /* device enumeration can fail pre-permission; retried after connect */
  }
}

/** Can this app choose where sound plays? Safari and the Mac app's webview
 *  can't: they don't list speakers or headsets at all and always play through
 *  the system's output — so there, the headset is picked in macOS. */
export const canPickOutput = typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;

/** REDISCOVER (Josh, Oct 2026: a Bluetooth headset the Mac app wouldn't
 *  list). Ask the system for the microphone afresh — which is what makes a
 *  webview hand over device names at all — let it go again at once, and
 *  re-read the lists. Says what it found, or why it couldn't. */
export async function rediscoverDevices(): Promise<{ ok: true; mics: number; outputs: number } | { ok: false; reason: "denied" | "none" | "unavailable"; detail: string }> {
  // What went wrong, exactly — shown under the message and sent to the error
  // tracker, because the one machine this fails on is a Mac nobody here has.
  const fail = async (reason: "denied" | "none" | "unavailable", detail: string) => {
    let kinds = "n/a";
    try {
      const all = await navigator.mediaDevices?.enumerateDevices?.();
      if (all) kinds = all.map((d) => `${d.kind}${d.label ? "+label" : ""}`).join(",") || "none";
    } catch (err) {
      kinds = `enumerate threw ${(err as Error)?.name}`;
    }
    reportNote(`voice rediscover failed: ${detail.slice(0, 80)}`, JSON.stringify({
      reason, detail, kinds, secure: window.isSecureContext, mediaDevices: !!navigator.mediaDevices,
      gum: !!navigator.mediaDevices?.getUserMedia, ua: navigator.userAgent, platform: navigator.platform,
    }));
    return { ok: false as const, reason, detail };
  };
  if (!navigator.mediaDevices) return fail("unavailable", `no navigator.mediaDevices (secure context: ${window.isSecureContext})`);
  if (!navigator.mediaDevices.getUserMedia) return fail("unavailable", "no getUserMedia");
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
    probe.getTracks().forEach((t) => t.stop());
  } catch (e) {
    const name = (e as { name?: string })?.name ?? "";
    const detail = `${name || "Error"}: ${(e as Error)?.message ?? String(e)}`;
    return fail(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" ? "none" : "unavailable", detail);
  }
  await refreshDevices(true);
  return { ok: true, mics: voice.mics.length, outputs: voice.outputs.length };
}

// A headset connecting (or disconnecting) mid-session shows up in the lists
// without anybody reopening Settings.
if (typeof navigator !== "undefined" && navigator.mediaDevices?.addEventListener) {
  navigator.mediaDevices.addEventListener("devicechange", () => void refreshDevices(false));
}

export async function joinVoice(channelId: number): Promise<void> {
  if (voice.connecting) return;
  // ALREADY HERE? Only if there is actually a live room behind the claim.
  // `voice.channelId` is cleared by the Disconnected handler, but that handler
  // bails when `room` has already been replaced or nulled, so the store could
  // be left insisting you were in a channel whose room was gone. Clicking that
  // channel then returned instantly and did nothing, for the rest of the
  // session — the state said connected, the ears said otherwise, and only a
  // reload cleared it. A claim with no room is now treated as not connected.
  if (voice.channelId === channelId && room && room.state !== "disconnected") return;
  if (voice.channelId === channelId) {
    console.warn("voice: rejoining", channelId, "— the store claimed it but the room was gone");
    voice.channelId = null;
    room = null;
  }
  voice.error = null;
  voice.connecting = true;
  if (voice.pttEnabled) voice.muted = true; // PTT rests muted

  try {
    if (room) await leaveVoice(); // switching rooms
    const { token, url } = await api.voiceToken(channelId);

    room = new Room({
      // Echo cancel + AGC always. The browser's own noise suppression stands
      // down when neural (RNNoise) is on — stacking the two muffles voices.
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: !voice.neuralNS,
        autoGainControl: true,
      },
      // Video bandwidth care for a single-uplink home server: cameras capture
      // at 720p and simulcast (LiveKit only forwards each viewer the layer
      // their window/network can take), and adaptive streaming stops sending
      // to tiles nobody is looking at. Screen share publishes a 1080p60
      // ceiling (movie/game nights) with a 720p30 simulcast fallback so a
      // weak viewer degrades instead of stuttering.
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
      // Screen-share encoding rides per-call options in toggleScreenShare
      // (the user's Settings → Voice quality tier), not room defaults.
    });
    const thisRoom = room;

    room
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) => {
        // EXCEPTION-PROOF: this fires while room.connect() replays the
        // room's existing tracks — anything thrown here broke the whole
        // join, but only for the SECOND person into a room ("my buddy can't
        // join any chat I'm in"). Nothing cosmetic may kill a connect.
        try {
          if (track.kind === Track.Kind.Audio) {
            const el = track.attach();
            el.muted = voice.deafened;
            sink().appendChild(el);
            if (pub.source === Track.Source.ScreenShareAudio) {
              // Streams are opt-in: silent until this viewer joins the stream.
              safeVolume(p, streamAudioVolume(Number(p.identity)), Track.Source.ScreenShareAudio);
            } else {
              applyStoredVolume(p); // personal voice volume survives re-joins
            }
          } else if (track.kind === Track.Kind.Video) {
            addTile(track as VideoTrack, pub.source, p, false);
          }
        } catch (err) {
          console.error("voice: TrackSubscribed handler failed (join continues)", err);
        }
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach().forEach((el) => el.remove());
        if (track.kind === Track.Kind.Video) dropTile(track.sid);
      })
      .on(RoomEvent.LocalTrackPublished, (pub: LocalTrackPublication) => {
        if (pub.track?.kind === Track.Kind.Video && room) {
          addTile(pub.track as VideoTrack, pub.source, room.localParticipant, true);
        }
        refreshPeers();
      })
      .on(RoomEvent.LocalTrackUnpublished, (pub: LocalTrackPublication) => {
        // Also fires when the browser's own "Stop sharing" bar ends a share.
        if (pub.track?.kind === Track.Kind.Video) {
          dropTile(pub.track.sid);
          if (pub.source === Track.Source.ScreenShare) voice.screenOn = false;
          if (pub.source === Track.Source.Camera) voice.camOn = false;
          notifyVoiceMedia();
        }
        refreshPeers();
      })
      .on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
        if (!/^\d+$/.test(p.identity)) return; // a pop-out viewer, not a person
        // Uploaded entrance sound > the default join pair. (The chime
        // COSMETICS retired with migration 48 — custom uploads replaced them.)
        if (!voice.deafened) {
          const cs = lookupMember(Number(p.identity))?.cosmetics;
          if (cs?.enterSound) playFileSound(cs.enterSound);
          else chimeJoin();
        }
        applyStoredVolume(p);
        refreshPeers();
      })
      .on(RoomEvent.ConnectionQualityChanged, (quality: ConnectionQuality, p: Participant) => {
        if (!/^\d+$/.test(p.identity)) return;
        qualityMap.set(
          Number(p.identity),
          quality === ConnectionQuality.Unknown ? undefined : (quality as VoicePeer["quality"]),
        );
        refreshPeers();
      })
      .on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
        if (!/^\d+$/.test(p.identity)) return; // pop-out viewers leave silently
        // Uploaded leave sound > the default parting chime.
        if (!voice.deafened) {
          const cs = lookupMember(Number(p.identity))?.cosmetics;
          if (cs?.leaveSound) playFileSound(cs.leaveSound);
          else chimeLeave();
        }
        refreshPeers();
      })
      .on(RoomEvent.ActiveSpeakersChanged, () => {
        // Speaking is the one activity signal the input tracker can't see.
        if (room?.localParticipant.isSpeaking) bumpVoice();
        refreshPeers();
      })
      .on(RoomEvent.TrackMuted, refreshPeers)
      .on(RoomEvent.TrackUnmuted, refreshPeers)
      .on(RoomEvent.MediaDevicesChanged, () => void refreshDevices())
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        // After an auto-rejoin there's been no user gesture yet, so the
        // browser may hold audio until a click (enableVoiceAudio).
        voice.audioBlocked = room ? !room.canPlaybackAudio : false;
      })
      .on(RoomEvent.Disconnected, () => {
        // Covers server-side kicks and network death, not just leaveVoice().
        // ONLY for the room this handler belongs to: when switching rooms,
        // the old room's Disconnected can fire after the new room is live,
        // and an unguarded cleanup wiped the NEW join's state — the "I
        // clicked join and nothing shows until a hard refresh" ghost.
        if (room !== thisRoom) return;
        cleanupAfterDisconnect();
      });

    await room.connect(url, token);
    // Mic startup is NON-BLOCKING (the third join-killer): awaiting
    // setMicrophoneEnabled here parked the whole join on the browser's mic
    // permission prompt / a wedged capture device — connect had SUCCEEDED,
    // but voice.connecting stayed true, so the dock never appeared and every
    // voice button sat disabled until a hard refresh. Join first, mic after.
    void (async () => {
      try {
        await thisRoom.localParticipant.setMicrophoneEnabled(!voice.muted);
        // Build the mic chain (RNNoise / gate / gain) if any of it is dialed in.
        if (!voice.muted && needsChain()) await applyMicChain().catch(() => {});
      } catch {
        // No mic / permission denied — stay in the room listen-only.
        voice.muted = true;
        voice.error = "No microphone — you're in listen-only mode.";
      }
      if (room === thisRoom) {
        syncMutedProbe();
        persistRejoin(); // the rejoin key records the settled mute posture
        refreshPeers();
      }
    })();
    voice.channelId = channelId;
    voice.audioBlocked = !room.canPlaybackAudio;
    bumpVoice();
    if (!afkTimer) afkTimer = setInterval(checkVoiceAfk, AFK_CHECK_MS);
    // Speaking rings ride audio LEVELS, which don't emit events — poll at 4Hz
    // so the rings track what's audible (and feed the AFK activity clock).
    if (!speakPoll) {
      speakPoll = setInterval(() => {
        if (!room) return;
        if (room.localParticipant.isSpeaking || room.localParticipant.audioLevel > SPEAK_LEVEL) bumpVoice();
        refreshPeers();
      }, 250);
    }
    notifyServer(channelId);
    persistRejoin();
    chimeJoin(); // my own arrival, for me
    // My own entrance sound plays for me too (Discord behavior) — the rest
    // of the room hears it via the ParticipantConnected path on their end.
    const myEnter = myCosmetics()?.enterSound;
    if (myEnter && !voice.deafened) playFileSound(myEnter);
    syncMutedProbe();
    refreshPeers();
    void refreshDevices();
    void applySavedDevices(); // remembered mic/output picks (Settings → Voice)
  } catch (e) {
    voice.error =
      e instanceof ApiError && e.code === "locked"
        ? "That voice channel is locked."
        : e instanceof ApiError && e.code === "voice_disabled"
          ? "Voice isn't configured on this server."
          : "Couldn't join voice.";
    room = null;
    voice.channelId = null;
  } finally {
    voice.connecting = false;
  }
}

function cleanupAfterDisconnect(): void {
  if (afkTimer) clearInterval(afkTimer);
  afkTimer = null;
  if (speakPoll) clearInterval(speakPoll);
  speakPoll = null;
  chain = null; // the track died with the room — never skip a rebuild on stale state
  chainNS = null;
  room = null;
  voice.channelId = null;
  voice.peers = [];
  voice.deafened = false;
  voice.audioBlocked = false;
  voice.camOn = false;
  voice.screenOn = false;
  voice.tiles = [];
  voice.watching = [];
  voice.stageMin = false;
  videoTracks.clear();
  qualityMap.clear();
  stopMutedProbe();
  sink().innerHTML = "";
  notifyServer(null);
  // NB: the rejoin key deliberately survives here — cleanup also fires on
  // network death, and a refresh after that should still rejoin.
}

export async function leaveVoice(): Promise<void> {
  clearRejoin(); // an explicit leave means "don't come back on refresh"
  if (!room) return;
  const r = room;
  room = null;
  chimeLeave();
  // My own leave sound, for me (the room hears it via ParticipantDisconnected).
  const myLeave = myCosmetics()?.leaveSound;
  if (myLeave && !voice.deafened) playFileSound(myLeave);
  await r.disconnect();
  cleanupAfterDisconnect();
}

export async function toggleMute(): Promise<void> {
  voice.muted = !voice.muted;
  if (room) {
    await room.localParticipant.setMicrophoneEnabled(!voice.muted);
    // Unmuting may republish a fresh capture — re-apply the neural filter.
    if (!voice.muted && needsChain()) await applyMicChain();
  }
  persistRejoin(); // a refresh must come back with the same posture
  syncMutedProbe();
  refreshPeers();
}

/** Deafen = hear nothing + say nothing (Discord semantics; undeafen restores
 *  your previous mute state). */
export async function toggleDeafen(): Promise<void> {
  voice.deafened = !voice.deafened;
  if (voice.deafened) {
    preDeafenMuted = voice.muted;
    voice.muted = true;
  } else {
    voice.muted = preDeafenMuted;
  }
  if (room) {
    await room.localParticipant.setMicrophoneEnabled(!voice.muted);
    if (!voice.muted && needsChain()) await applyMicChain();
  }
  if (audioSink) {
    for (const el of audioSink.querySelectorAll("audio, video")) {
      (el as HTMLMediaElement).muted = voice.deafened;
    }
  }
  persistRejoin();
  syncMutedProbe();
  refreshPeers();
}

/** Toggle my camera. The browser prompts for permission on first use. */
export async function toggleCamera(): Promise<void> {
  if (!room) return;
  const on = !voice.camOn;
  try {
    await room.localParticipant.setCameraEnabled(on);
    voice.camOn = on;
    notifyVoiceMedia();
  } catch {
    voice.error = on ? "Couldn't start the camera." : null;
  }
}

/** Can this browser capture a screen at all? (Phone browsers can't — the
 *  share button hides there instead of failing silently.) */
export const canScreenShare =
  typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function";

// ---- Stream quality presets -------------------------------------------------
// User-selectable in Settings → Voice & Video; applies to the NEXT share.
// Resolution and FPS are independent picks: the tier sets pixels + a base
// bitrate (at 30fps), the FPS cap scales the bitrate (15 → ×0.6, 60 → ×1.6).
// Each share also publishes a lower simulcast fallback layer so a thin viewer
// degrades gracefully instead of stuttering (adaptiveStream picks the layer
// per viewer). The Mbps figures are the SERVER's upload cost PER full-quality
// viewer — the reason this is a choice and not always-4K60.
export type StreamQuality = "480" | "720" | "1080" | "2160";
export type StreamFps = 15 | 30 | 60;
const STREAMQ_KEY = "solace_voice_streamq";
const STREAMFPS_KEY = "solace_voice_streamfps";
export const STREAM_PRESETS: Record<
  StreamQuality,
  { label: string; hint: string; width: number; height: number; base: number; fallback: { width: number; height: number; base: number } | null }
> = {
  "480": {
    label: "480p",
    hint: "thin connections",
    width: 854, height: 480, base: 1_200_000,
    fallback: null, // already the floor
  },
  "720": {
    label: "720p",
    hint: "the safe middle",
    width: 1280, height: 720, base: 3_000_000,
    fallback: { width: 640, height: 360, base: 800_000 },
  },
  "1080": {
    label: "1080p",
    hint: "movie & game nights",
    width: 1920, height: 1080, base: 5_000_000,
    fallback: { width: 1280, height: 720, base: 1_900_000 },
  },
  "2160": {
    label: "4K",
    hint: "only on a fat connection",
    width: 3840, height: 2160, base: 16_000_000,
    fallback: { width: 1920, height: 1080, base: 4_500_000 },
  },
};
const FPS_FACTOR: Record<StreamFps, number> = { 15: 0.6, 30: 1, 60: 1.6 };

/** The encode ceiling for a quality tier at an FPS cap, in Mbps (shown in
 *  the settings hint so the upload cost is never a surprise). */
export function streamMbps(q: StreamQuality, fps: StreamFps): number {
  return Math.round(((STREAM_PRESETS[q].base * FPS_FACTOR[fps]) / 1_000_000) * 10) / 10;
}

function streamEncode(q: StreamQuality, fps: StreamFps): { preset: VideoPreset; layers: VideoPreset[] } {
  const t = STREAM_PRESETS[q];
  const preset = new VideoPreset(t.width, t.height, Math.round(t.base * FPS_FACTOR[fps]), fps);
  const fbFps = Math.min(30, fps) as StreamFps;
  const layers = t.fallback
    ? [new VideoPreset(t.fallback.width, t.fallback.height, Math.round(t.fallback.base * FPS_FACTOR[fbFps]), fbFps)]
    : [];
  return { preset, layers };
}

export function setStreamQuality(q: StreamQuality): void {
  voice.streamQuality = q;
  localStorage.setItem(STREAMQ_KEY, q);
}

export function setStreamFps(fps: StreamFps): void {
  voice.streamFps = fps;
  localStorage.setItem(STREAMFPS_KEY, String(fps));
}

/** Toggle screen sharing. The browser shows its screen/window picker; tab
 *  audio rides along when the user shares one. Cancelling the picker keeps
 *  the state off. */
export async function toggleScreenShare(): Promise<void> {
  if (!room) return;
  const on = !voice.screenOn;
  const q = streamEncode(voice.streamQuality, voice.streamFps);
  try {
    await room.localParticipant.setScreenShareEnabled(
      on,
      {
        // The stream's audio is the CONTENT's audio: ask the picker for tab /
        // window / system audio, and keep voice processing OFF it — echo-
        // cancel and noise suppression are for microphones; on game/music
        // audio they chew the sound up. restrictOwnAudio keeps SOLACE'S OWN
        // OUTPUT (the voice chat itself) out of the capture, so the room
        // never hears itself echoed through a stream; window shares carry
        // only that window's sound where the browser supports it.
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          // Not in LiveKit's AudioCaptureOptions type yet; passed through to
          // getDisplayMedia where supported (Chrome/Edge), ignored elsewhere.
          ...({ restrictOwnAudio: true } as Record<string, unknown>),
        },
        systemAudio: "include",
        resolution: q.preset.resolution, // carries the fps capture ask
        // Under pressure the encoder protects frame rate over pixel sharpness —
        // the right bias for video/games (text shares rarely stress it anyway).
        contentHint: "motion",
        // The FULL picker: every window (minimized ones included), whole
        // screens, tabs, this app itself, and Chrome's in-capture
        // "share a different window" switcher. (Monitor surfaces are
        // included by browser default.)
        selfBrowserSurface: "include",
        surfaceSwitching: "include",
      },
      {
        screenShareEncoding: q.preset.encoding,
        screenShareSimulcastLayers: q.layers,
      },
    );
    voice.screenOn = on;
    notifyVoiceMedia();
  } catch {
    /* user cancelled the picker */
  }
}

export async function setMic(deviceId: string): Promise<void> {
  voice.micId = deviceId;
  localStorage.setItem(MIC_KEY, deviceId); // device choice sticks per machine
  if (room) await room.switchActiveDevice("audioinput", deviceId);
}

export async function setOutput(deviceId: string): Promise<void> {
  voice.outputId = deviceId;
  localStorage.setItem(OUT_KEY, deviceId);
  if (room) await room.switchActiveDevice("audiooutput", deviceId);
}

/** Apply the saved device picks to a freshly-joined room (best effort — a
 *  remembered device may be unplugged today). */
async function applySavedDevices(): Promise<void> {
  if (!room) return;
  if (voice.micId) await room.switchActiveDevice("audioinput", voice.micId).catch(() => {});
  if (voice.outputId) await room.switchActiveDevice("audiooutput", voice.outputId).catch(() => {});
}

export function resetVoice(): void {
  clearRejoin(); // logout: the next login starts fresh
  if (room) void leaveVoice();
  voice.channelId = null; // NOW, not when leaveVoice settles — the next socket's onopen reads it
  voice.presence = {};
  voice.media = {};
  voice.viewers = {};
  voice.watching = [];
  voice.enabled = false;
  voice.error = null;
  voice.muted = false;
  voice.deafened = false;
}
