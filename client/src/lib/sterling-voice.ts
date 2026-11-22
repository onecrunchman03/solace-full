// Sterling's voice — the ORIGINAL brass-robot blips, refined (Josh's call,
// July 2026: the processed-human murmur files are retired; he wants the
// shop-era synth voice back, with more variance and polish). Think Animal
// Crossing by way of a coal boiler: pitched square mutters through a little
// speaker-grill body. Every phrase rolls its own mood — pitch seat, mutter
// speed, cadence, stresses, an occasional trill or question-rise — so no two
// murmurs read the same. Deliberately NO tremolo/wobble.

let ctx: AudioContext | null = null;
let until = 0; // don't stack voices mid-sentence

function ensure(): AudioContext | null {
  if (ctx) {
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

export type SterlingMood = "auto" | "low" | "bright";

// Cadence templates: relative blip lengths; 0 = a breath gap ("…hm").
// ≥1.4 reads as a stressed syllable (held longer, deeper glide).
const CADENCES: number[][] = [
  [1, 1, 1, 1],
  [1.6, 1, 1, 1, 1.3],
  [1, 1, 0, 1, 1, 1],
  [1, 1.5, 1, 1, 0.7, 0.7],
  [0.8, 0.8, 1, 1.4, 1],
];

/** One synthesized blip: two slightly-detuned squares through a lowpass,
 *  plus a resonant formant band in parallel (the speaker-grill body). */
function blip(c: AudioContext, t: number, f0: number, f1: number, dur: number, vol: number): void {
  const o1 = c.createOscillator();
  const o2 = c.createOscillator();
  const lp = c.createBiquadFilter();
  const bp = c.createBiquadFilter();
  const g = c.createGain();
  const gf = c.createGain();
  o1.type = "square";
  o2.type = "square";
  o1.frequency.setValueAtTime(f0, t);
  o1.frequency.exponentialRampToValueAtTime(Math.max(50, f1), t + dur * 0.85);
  o2.frequency.setValueAtTime(f0 * 1.008, t); // faint detune = brass shimmer
  o2.frequency.exponentialRampToValueAtTime(Math.max(50, f1 * 1.008), t + dur * 0.85);
  lp.type = "lowpass";
  lp.frequency.value = 1050;
  bp.type = "bandpass";
  bp.frequency.value = 760; // the little grill resonance
  bp.Q.value = 5;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.05 * vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.9);
  gf.gain.value = 0.45;
  o1.connect(lp);
  o2.connect(lp);
  lp.connect(g);
  lp.connect(bp);
  bp.connect(gf);
  gf.connect(g);
  g.connect(c.destination);
  o1.start(t);
  o1.stop(t + dur);
  o2.start(t);
  o2.stop(t + dur);
}

/**
 * Sterling mutters one phrase. Pass his line (length drives syllable count)
 * or a bare syllable count. Returns the phrase duration in ms (0 if he's
 * already mid-sentence) so the UI can animate his mouth-grill.
 */
export function sterlingBlips(textOrSyllables: string | number, vol = 1, mood: SterlingMood = "auto"): number {
  const c = ensure();
  if (!c || vol <= 0) return 0;
  const now = c.currentTime;
  if (now < until) return 0;

  const syllables =
    typeof textOrSyllables === "number"
      ? Math.max(4, Math.min(14, Math.round(textOrSyllables)))
      : Math.max(4, Math.min(14, Math.round(textOrSyllables.length / 7)));

  // The phrase's persona: where his voice sits, how fast he's muttering.
  const low = mood === "low" || (mood === "auto" && Math.random() < 0.25);
  const bright = mood === "bright" || (mood === "auto" && Math.random() < 0.2);
  const base = (low ? 162 : bright ? 232 : 200) + Math.random() * 34;
  const beat = 0.074 + Math.random() * 0.02 + (low ? 0.014 : 0);
  const rising = !low && Math.random() < 0.18; // an occasional question
  const trillAt = Math.random() < 0.14 ? 1 + Math.floor(Math.random() * Math.max(1, syllables - 3)) : -1;

  // Stretch/trim a cadence template to the syllable count.
  const tpl = CADENCES[Math.floor(Math.random() * CADENCES.length)];
  const slots: number[] = [];
  for (let i = 0; i < syllables; i++) slots.push(tpl[i % tpl.length]);

  let t = now + 0.01;
  slots.forEach((v, i) => {
    const dur = beat * (v === 0 ? 0.9 : v) * (0.92 + Math.random() * 0.16);
    if (v === 0) {
      t += dur; // a breath — time passes, nothing sounds
      return;
    }
    const lastTwo = i >= slots.length - 2;
    // Pitch wanders per blip; the close droops (his womp-womp signature)
    // unless this phrase happens to be a question.
    let f = base + (Math.random() * 56 - 26);
    if (lastTwo) f += rising ? 34 : -46;
    const glide = v >= 1.4 ? 0.86 : lastTwo && !rising ? 0.8 : rising && lastTwo ? 1.16 : 0.94;
    if (i === trillAt) {
      // A rolled syllable: three quick micro-blips ("b-b-brp").
      const micro = dur / 3;
      for (let k = 0; k < 3; k++) blip(c, t + k * micro, f * (1 + k * 0.03), f * (1 + k * 0.03) * 0.95, micro, vol * 0.85);
    } else {
      blip(c, t, f, f * glide, dur, vol);
    }
    t += dur + beat * 0.18;
  });

  const totalMs = (t - now) * 1000;
  until = t + 0.05;
  return Math.round(totalMs);
}
