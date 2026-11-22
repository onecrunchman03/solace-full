// Carpet footsteps — Josh's recorded sample (assets/Sounds/Walk on Carpet
// Sound Effect.wav, mastered to steps.ogg by the export pass). The 6.9s file
// is a whole WALKING SEQUENCE, and the first cut of this module sliced it at
// RANDOM offsets with no envelope — which is exactly the wonk Josh heard:
// a random window lands in the silence BETWEEN footfalls (a silent stride),
// or straddles two of them (a double-tap), and the hard start/stop mid-wave
// clicks at both ends.
//
// So it now works the way the backrooms' footsteps have since their own
// random-window bug: the ONSETS are detected once after decode (ambience.ts
// detectOnsets — RMS rising edges with a refractory gap), every in-game
// stride plays the NEXT real footfall from its actual start, and an
// attack/release envelope replaces the hard cut. Sequential on purpose: the
// recording is a natural walk, so consecutive slices alternate feet the way
// the take did.

import { detectOnsets } from "../backrooms/ambience";
import { getSfxRate } from "../lib/sfx";

let ctx: AudioContext | null = null;

function ensureCtx(): AudioContext {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export interface StepBank {
  load(): void;
  /** One stride. `gain` 0..1 (distance-faded for peers), `run` pitches up. */
  step(gain: number, run: boolean): void;
}

/** A surface's footstep bank (E-room uniformity refactor, Aug 2026): the
 *  carpet below and the escape room's wood floor are the SAME machinery over
 *  different recordings — onset-sliced natural walks, never random windows. */
export function makeStepBank(url: string): StepBank {
  let buf: AudioBuffer | null = null;
  let onsets: number[] = [];
  let idx = 0;
  let loading = false;
  return {
    load(): void {
      if (buf || loading) return;
      loading = true;
      void fetch(url)
        .then((r) => r.arrayBuffer())
        .then((ab) => ensureCtx().decodeAudioData(ab))
        .then((b) => {
          buf = b;
          onsets = detectOnsets(b);
          // Start each playthrough of the bank at a random step, so two peers
          // walking in sync don't sound like one four-legged person.
          idx = Math.floor(Math.random() * onsets.length);
        })
        .catch(() => {
          loading = false; // a 404 just means quiet feet
        });
    },
    step(gain: number, run: boolean): void {
      if (!buf || !onsets.length || gain <= 0.01) return;
      stepFrom(buf, onsets[idx % onsets.length], gain, run);
      idx++;
    },
  };
}

const carpet = makeStepBank("/assets/casino/steps.ogg");
export const loadSteps = carpet.load;
export const stepSound = carpet.step;

const SLICE = 0.32;

function stepFrom(buf: AudioBuffer, start: number, gain: number, run: boolean): void {
  const c = ensureCtx();
  const src = c.createBufferSource();
  src.buffer = buf;
  // …times the app-wide rate, so a trip pitches footfalls with everything else
  // (getSfxRate is 1 for everyone who hasn't been under Sterling's counter).
  src.playbackRate.value = ((run ? 1.05 : 1) + (Math.random() - 0.5) * 0.05) * getSfxRate();
  const g = c.createGain();
  // Fast attack so the transient still reads as a footfall, smooth release so
  // the cut never clicks. ±5% level jitter keeps a walk from sounding sampled.
  const level = gain * (0.95 + Math.random() * 0.1);
  const t = c.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + 0.035);
  g.gain.setValueAtTime(level, t + SLICE - 0.1);
  g.gain.linearRampToValueAtTime(0, t + SLICE);
  src.connect(g);
  g.connect(c.destination);
  src.start(t, start, SLICE + 0.02);
}
