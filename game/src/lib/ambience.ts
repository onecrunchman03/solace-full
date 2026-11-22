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

function ensureCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  return ctx;
}

/** The ambience bed: /assets/ambience.ogg (staged by prepare-assets),
 *  decoded and looped gaplessly with a slow fade-in. */
let ambStarted = false;
export function startHum(): void {
  if (ambStarted) return;
  ambStarted = true;
  const c = ensureCtx();
  fetch("/assets/ambience.ogg")
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.arrayBuffer();
    })
    .then((ab) => c.decodeAudioData(ab))
    .then((buf) => {
      const master = c.createGain();
      master.gain.value = 0;
      master.connect(c.destination);
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
    .catch(() => startSynthHum());
}

function startSynthHum(): void {
  const c = ensureCtx();
  if (humNodes) return;
  const master = c.createGain();
  master.gain.value = 0;
  master.connect(c.destination);
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
}

// ---- Footsteps: Josh's carpet sample, ONSET-SLICED --------------------------
// "Walk on Carpet Sound Effect" (staged as /assets/footsteps.ogg) is a ~7s
// multi-step take. Random windows landed between footfalls and read as
// inconsistent — so after decoding, the ONSETS are detected once (RMS peaks
// with a refractory gap) and each in-game footfall plays the next real step
// from its actual start. File-only by Josh's call: no synth fallback.

let stepBuf: AudioBuffer | null = null;
let stepOnsets: number[] = [];
let stepIdx = 0;
let stepLoading = false;

function detectOnsets(buf: AudioBuffer): number[] {
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

function ensureStepBuffer(): void {
  if (stepBuf || stepLoading) return;
  stepLoading = true;
  const c = ensureCtx();
  fetch("/assets/footsteps.ogg")
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.arrayBuffer();
    })
    .then((ab) => c.decodeAudioData(ab))
    .then((buf) => {
      stepBuf = buf;
      stepOnsets = detectOnsets(buf);
    })
    .catch(() => {
      /* no file, no steps — the sample IS the sound (Josh's call) */
    });
}

/** One carpet footstep. `hard` for sprinting. */
export function footstep(hard = false): void {
  const c = ensureCtx();
  ensureStepBuffer();
  if (!stepBuf || !stepOnsets.length) return;
  const SLICE = 0.32;
  const start = stepOnsets[stepIdx % stepOnsets.length];
  stepIdx++;
  const src = c.createBufferSource();
  src.buffer = stepBuf;
  src.playbackRate.value = (hard ? 1.05 : 1) + (Math.random() - 0.5) * 0.05;
  const g = c.createGain();
  // Soft: a walk is barely-there, a run is present but never a stomp.
  const level = (hard ? 0.24 : 0.13) * (0.95 + Math.random() * 0.1);
  const t = c.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + 0.035);
  g.gain.setValueAtTime(level, t + SLICE - 0.1);
  g.gain.linearRampToValueAtTime(0, t + SLICE);
  src.connect(g);
  g.connect(c.destination);
  src.start(t, start, SLICE + 0.02);
}

/** Free the context entirely (leaving the game). */
export function closeAmbience(): void {
  stopHum();
  void ctx?.close().catch(() => {});
  ctx = null;
}
