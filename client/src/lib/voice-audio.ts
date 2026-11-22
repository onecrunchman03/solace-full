// Soft synthesized chimes for voice-room joins and leaves — heard only by
// people in the room (they fire on LiveKit participant events client-side).
// Two gentle sine notes through a lowpass; deliberately quiet and round.

let ctx: AudioContext | null = null;

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

function note(c: AudioContext, t: number, freq: number, dur: number, gain: number): void {
  const o = c.createOscillator();
  const g = c.createGain();
  const lp = c.createBiquadFilter();
  o.type = "sine";
  o.frequency.value = freq;
  lp.type = "lowpass";
  lp.frequency.value = 2200;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.035);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(lp);
  lp.connect(g);
  g.connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Someone arrived: a soft rising pair (E5 → G5). */
export function chimeJoin(): void {
  const c = ensure();
  if (!c) return;
  const now = c.currentTime;
  note(c, now, 659.25, 0.28, 0.1);
  note(c, now + 0.11, 783.99, 0.34, 0.09);
}

/** Someone left: the same pair, falling (G5 → D5). */
export function chimeLeave(): void {
  const c = ensure();
  if (!c) return;
  const now = c.currentTime;
  note(c, now, 783.99, 0.26, 0.09);
  note(c, now + 0.11, 587.33, 0.36, 0.08);
}
