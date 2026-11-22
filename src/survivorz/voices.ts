// SOLACE SURVIVORZ — THE SURVIVORS' VOICES (SURVIVORZ.md §11: slopbot's 3080 voices the show).
// A line the talk layer writes (a `say` frame) is HELD while the voice agent renders it in that
// survivor's cloned voice (scripts/rollo/agent.py, the casino host's pattern), then goes out with its
// clip, so the subtitle and the voice arrive together. With no agent about (dev, slopbot down) — or a
// render that takes too long — the line goes out as it always did: a subtitle alone. Nothing here
// decides what anybody says; it only gives it a voice.
import type { Say, SurvivorId } from "./sim/wire";
import { tableOf } from "./cast";

/** Each survivor's clone (the voice server's reference, /data/solace-ai/models/voices/<clone>.mp3 on
 *  slopbot; Rollo's "" is the server's own default reference, his queens-1) and the stock voice the
 *  agent falls back to when the clone is down. Picked by Josh, 2026-10-20. */
export const SURVIVOR_VOICES: Record<SurvivorId, { clone: string; kokoro: string }> = tableOf((c) => c.voice);

export const VOICE = {
  /** the agent counts as here this long after it last asked for lines */
  aliveMs: 30_000,
  /** how long a line waits for its voice once the agent has taken it (then it goes out silent) */
  renderWaitMs: 12_000,
  /** …and before the agent has even taken it */
  takeWaitMs: 4_000,
  /** a clip's longest (s): a line is a sentence or two */
  maxSeconds: 20,
  /** clips kept for watchers to fetch */
  keep: 40,
};

interface Held { id: number; frame: Say; who: SurvivorId; at: number; taken?: number; done: boolean }

// Line ids count on from the clock (the host's rule, seasons/host.ts): the agent skips any id it has
// already voiced, so ids that restarted at 1 after a server restart were all skipped — every line
// went out silent after renderWaitMs (Nov 1 2026, the first look at the stream).
let nextId = Math.floor(Date.now() / 1000);
let lastAgent = 0;
const held: Held[] = [];
const clips = new Map<number, Buffer>();
export const voiceStats = { voiced: 0, silent: 0, late: 0 };

/** The agent asked for lines just now. */
export function agentSeen(now = Date.now()): void { lastAgent = now; }
export function agentAlive(now = Date.now()): boolean { return now - lastAgent < VOICE.aliveMs; }

/** A `say` frame from the talk layer: hold it for its voice (true), or let it straight out (false). */
export function holdForVoice(f: Say, send: (f: Say) => void, now = Date.now()): boolean {
  if (!agentAlive(now)) return false;
  const who = f.by.startsWith("s:") ? (f.by.slice(2) as SurvivorId) : null;
  if (!who || !(who in SURVIVOR_VOICES)) return false;
  const h: Held = { id: nextId++, frame: f, who, at: now, done: false };
  held.push(h);
  if (held.length > 20) held.splice(0, held.length - 20);
  const giveUp = (): void => {
    if (h.done) return;
    if (h.taken !== undefined && Date.now() - h.taken < VOICE.renderWaitMs) {
      setTimeout(giveUp, h.taken + VOICE.renderWaitMs - Date.now() + 10).unref?.();
      return;
    }
    h.done = true;
    voiceStats.silent++;
    send(h.frame);
  };
  setTimeout(giveUp, VOICE.takeWaitMs).unref?.();
  sender = send;
  return true;
}
let sender: ((f: Say) => void) | null = null;

// THE CREATOR'S SAMPLES (docs/survivorz/CREATOR.md: "a line in character, spoken by slopbot's clone"):
// a line in a voice nobody in the show has to wear yet. It rides the same queue to the same agent, so a
// sample is exactly what the show would sound like; it waits for its audio rather than for a subtitle.
interface Sample { id: number; text: string; clone: string; kokoro: string; at: number; taken?: number; done: (wav: Buffer | null) => void }
const samples: Sample[] = [];
const SAMPLE_WAIT_MS = 30_000;
/** Render one line in a voice; resolves with the WAV, or null when the agent is away or too slow. */
export function voiceSample(text: string, clone: string, kokoro: string, now = Date.now()): Promise<Buffer | null> {
  if (!agentAlive(now)) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const sm: Sample = { id: nextId++, text: text.slice(0, 400), clone, kokoro, at: now, done: (w) => { if (settled) return; settled = true; resolve(w); } };
    samples.push(sm);
    if (samples.length > 10) samples.splice(0, samples.length - 10).forEach((x) => x.done(null));
    setTimeout(() => { const i = samples.indexOf(sm); if (i >= 0) samples.splice(i, 1); sm.done(null); }, SAMPLE_WAIT_MS).unref?.();
  });
}

/** The agent's poll: lines to render, each handed over once (the show's, then any samples). */
export function voiceTake(now = Date.now()): { id: number; who: string; text: string; clone: string; kokoro: string }[] {
  agentSeen(now);
  const out = held.filter((h) => !h.done && h.taken === undefined);
  for (const h of out) h.taken = now;
  const sm = samples.filter((x) => x.taken === undefined);
  for (const x of sm) x.taken = now;
  return [
    ...out.map((h) => ({ id: h.id, who: h.who, text: h.frame.text, ...SURVIVOR_VOICES[h.who] })),
    ...sm.map((x) => ({ id: x.id, who: "sample", text: x.text, clone: x.clone, kokoro: x.kokoro })),
  ];
}

/** The agent's rendering: 16-bit mono PCM. The line goes out now, with its clip. Late audio is dropped
 *  (the subtitle already went out silent). */
export function voiceAudio(id: number, pcm: Buffer, rate: number): boolean {
  const si = samples.findIndex((x) => x.id === id);
  if (si >= 0) { const [sm] = samples.splice(si, 1); sm.done(wavOf(pcm, rate)); return true; }
  const h = held.find((x) => x.id === id);
  if (!h || h.done) { if (h) voiceStats.late++; return false; }
  h.done = true;
  voiceStats.voiced++;
  clips.set(id, wavOf(pcm, rate));
  for (const k of [...clips.keys()]) if (k < id - VOICE.keep) clips.delete(k);
  const ms = Math.round((pcm.length / 2 / rate) * 1000);
  sender?.({ ...h.frame, audio: `/api/survivorz/voice/${id}`, ms });
  return true;
}

/** A voiced line's WAV, for a watcher. */
export function voiceClip(id: number): Buffer | null { return clips.get(id) ?? null; }

function wavOf(pcm: Buffer, rate: number): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** The world those lines belong to is gone (a reset, a stop): every line still waiting for its voice is
 *  dropped — never sent, silent or voiced — so a line held up to 12 s from the OLD world can't reach the
 *  new world's watchers. The agent's late audio for one is "late" and discarded (voiceAudio). */
export function dropHeldVoices(): void {
  for (const h of held) h.done = true;
  held.length = 0;
  sender = null;
}

/** A survivor died or turned (show.ts): every line of theirs still waiting for its voice is dropped — never
 *  sent, silent or voiced. A held line waits up to 16 s, so a sentence started just before a death used to go
 *  out after it, subtitle and voice and all (Nov 2026 — Josh: "someone died and kept saying their lines"). */
export function dropVoicesOf(by: string): number {
  let n = 0;
  for (let i = held.length - 1; i >= 0; i--) {
    if (held[i].frame.by !== by) continue;
    held[i].done = true;
    held.splice(i, 1);
    n++;
  }
  return n;
}

/** For a harness: forget everything. */
export function resetVoices(): void { held.length = 0; samples.splice(0).forEach((x) => x.done(null)); clips.clear(); lastAgent = 0; sender = null; nextId = 1; voiceStats.voiced = voiceStats.silent = voiceStats.late = 0; }
