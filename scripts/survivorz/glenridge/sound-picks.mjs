// SURVIVORZ, GLENRIDGE HALL: PICKS THE MANSION'S SOUND TAKES BY MEASUREMENT (Josh, Nov 13 2026: "just pick the sounds
// for me"). Nobody listens here, so each take is judged on what can be measured, against what the show does with it:
//
//   · WHEN it sounds. A door's leaf swings shut in 0.63 s, a crest appears the instant it is set, a bolt goes home:
//     a take whose event comes late is cut to start at the event, and dropped if the event is not where it must be.
//   · ONE THING A FILE. A footstep file is one foot landing, a creak file one creak: runs are cut at their onsets.
//   · NO TUNE IN IT. A generator sometimes puts a note or a hum under a sound effect: a take with a steady pitch
//     held through it is dropped, for the sounds that have no business with a pitch (rain, fire, thunder, knocks).
//   · A LOOP THAT HOLDS LEVEL. Rain and fire play on a loop for an hour: a take that swells or dies is dropped.
//   · WHAT IT IS. Far thunder has no crack; a car driving away ends quieter than it began; pounding is several blows.
//
// Every decision is printed with its numbers (and kept in docs/survivorz/glenridge-sound-picks.txt). A sound is
// never left with no take: the best of a bad lot is kept and marked. Writes
// assets/downloads/survivorz/sound/picks/takes-glenridge-auto.json (the takes pages' own format).
//   node scripts/survivorz/glenridge/sound-picks.mjs
//   node scripts/survivorz/sound-tally.mjs && node scripts/survivorz/sound-final.mjs --only <ids>
// Josh can still overrule any of it on the preview page (scripts/survivorz/sound-preview-artifact.mjs).
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url"; import { execFileSync } from "node:child_process";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const A = path.join(ROOT, "assets", "downloads", "survivorz", "sound"), GEN = path.join(A, "eleven", "prod");
const RATE = 16000, HOP = 160;                       // 10 ms a frame

/** a take as mono samples */
function decode(file) {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-ac", "1", "-ar", String(RATE), "-f", "f32le", "-"], { maxBuffer: 1 << 29 });
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + Math.floor(raw.length / 4) * 4));
}
/** the level every 10 ms, dB */
function envelope(x) {
  const n = Math.floor(x.length / HOP), env = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < HOP; k++) { const v = x[i * HOP + k]; s += v * v; } env[i] = 10 * Math.log10(s / HOP + 1e-10); }
  return env;
}
const maxOf = (a, from = 0, to = a.length) => { let m = -Infinity; for (let i = from; i < to; i++) if (a[i] > m) m = a[i]; return m; };
/** where things start: well up on 30 ms before, within `floor` dB of the loudest, at least `gap` frames apart */
function onsets(env, { floor = 22, rise = 8, gap = 12 } = {}) {
  const peak = maxOf(env), out = [];
  let last = -1000;
  for (let i = 3; i < env.length - 2; i++) if (env[i] > peak - floor && env[i] - env[i - 3] > rise && i - last > gap) { out.push(i); last = i; }
  return out;
}
const peakAt = (env, a = 0, b = env.length) => { let m = -Infinity, at = a; for (let i = a; i < b; i++) if (env[i] > m) { m = env[i]; at = i; } return at; };
/** the last frame still within `down` dB of the loudest */
const lastLoud = (env, down = 30) => { const p = maxOf(env); let i = env.length - 1; while (i > 0 && env[i] < p - down) i--; return i; };

/** HOW MUCH OF A TAKE HOLDS A STEADY PITCH (0..1): frames whose strongest partial between 150 Hz and 4 kHz holds
 *  twenty times the band's average power (noise reaches about eight; one clean note about eighty: a windowed tone
 *  spreads over three bins of the 246) and stays on the same note for a fifth of a second or more. A rattle, a thud, rain
 *  and flame score next to nothing; a hum, a chord or a voice scores high. */
function tonal(x) {
  const N = 1024, H = 512, win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const lo = Math.round((150 * N) / RATE), hi = Math.round((4000 * N) / RATE);
  const re = new Float32Array(N), im = new Float32Array(N), pw = new Float32Array(N);
  const frames = [];
  let loudest = 0;
  for (let o = 0; o + N <= x.length; o += H) {
    for (let i = 0; i < N; i++) { re[i] = x[o + i] * win[i]; im[i] = 0; }
    fft(re, im);
    let sum = 0, best = 0, bin = lo;
    for (let k = lo; k < hi; k++) { const p = (pw[k] = re[k] * re[k] + im[k] * im[k]); sum += p; if (p > best) { best = p; bin = k; } }
    // (a NOTE is a narrow spike, not the heavy end of a rumble: it must also stand ten times over the bins a little
    // way either side of it. A fire's low roar leans on the band's bottom bins without being a pitch.)
    let side = 0, ns = 0;
    for (let d = 4; d <= 9; d++) for (const k of [bin - d, bin + d]) if (k >= 1 && k < N / 2) { side += re[k] * re[k] + im[k] * im[k]; ns++; }
    frames.push({ e: sum, ratio: Math.min(best / (sum / (hi - lo) + 1e-20), (best / (side / Math.max(1, ns) + 1e-20)) * 2), bin });
    loudest = Math.max(loudest, sum);
  }
  const live = frames.filter((f) => f.e > loudest * 1e-4);
  if (live.length < 8) return 0;
  let held = 0, run = 0;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i], p = frames[i - 1];
    const on = f.e > loudest * 1e-4 && f.ratio > 20 && p && Math.abs(f.bin - p.bin) <= 1;
    if (on) run++; else { if (run >= 6) held += run; run = 0; }
  }
  if (run >= 6) held += run;
  return held / live.length;
}
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
const sec = (frame) => +(frame / 100).toFixed(2);
const TONE_MAX = 0.12;       // more of a take than this on one held note: a tune or a hum under it
const pct = (v) => `${(v * 100).toFixed(0)}%`;
const tuned = (t) => (t.tone > TONE_MAX ? { drop: `a held pitch through ${pct(t.tone)} of it`, score: -1 - t.tone } : null);

// ---- the rules, a sound each: (take) -> { pieces: [{start, end}], why } or { drop: why, score } --------------------
/** ONE EVENT, ON TIME: starts just before the first thing heard; the loudest moment must come within `by` s of that
 *  start; cut `tail` s after the loudest moment (or `max` s in all). */
const timed = ({ by, tail, max, noTone = true, lead = 0.03 }) => (t) => {
  const on = onsets(t.env);
  if (!on.length) return { drop: "nothing in it", score: -9 };
  const start = Math.max(0, on[0] - Math.round(lead * 100)), pk = peakAt(t.env, start), late = (pk - start) / 100;
  if (late > by) return { drop: `its loudest moment is ${late.toFixed(2)} s in (must be within ${by})`, score: -late };
  if (noTone && tuned(t)) return tuned(t);
  const end = Math.min(t.env.length, lastLoud(t.env, 32) + 8, start + Math.round(max * 100), pk + Math.round(tail * 100));
  return { pieces: [{ start: sec(start), end: sec(end) }], why: `event at +${late.toFixed(2)} s, ${((end - start) / 100).toFixed(2)} s long, tone ${pct(t.tone)}` };
};
/** A STEP A FILE: every landing in the take, each cut at its own onset, half a second at most, no scuffs */
const steps = (t) => {
  const on = onsets(t.env, { floor: 18, rise: 9, gap: 28 }), peak = maxOf(t.env), out = [];
  on.forEach((i, k) => {
    let start = Math.max(0, i - 3);
    const next = k + 1 < on.length ? on[k + 1] - 3 : t.env.length, end = Math.min(next, start + 50);
    // (the landing itself leads the file: a scuff before it is cut off, so the step sounds when the foot comes down)
    const pk = peakAt(t.env, start, end), top = t.env[pk];
    if (pk - start > 10) start = pk - 4;
    let live = 0, body = 0;
    for (let j = start; j < end; j++) { if (t.env[j] > top - 30) live++; if (t.env[j] > top - 20) body++; }
    // (a real step has a body to it: a tick of 70 ms is a click, not a foot)
    if (end - start >= 20 && live >= 14 && body >= 7 && top > peak - 12) out.push({ start: sec(start), end: sec(end) });
  });
  if (!out.length) return { drop: "no clean step in it", score: -9 };
  if (tuned(t)) return tuned(t);
  return { pieces: out.slice(0, 6), why: `${out.length} steps, one a file` };
};
/** A CREAK A FILE: the take's separate creaks, each from its own start to the quiet after it (1.45 s at most) */
const creaks = (t) => {
  const on = onsets(t.env, { floor: 20, rise: 7, gap: 35 }), peak = maxOf(t.env), out = [];
  on.forEach((i, k) => {
    const start = Math.max(0, i - 3), next = k + 1 < on.length ? on[k + 1] - 5 : t.env.length;
    let end = start + 12;
    for (let j = start + 12, quiet = 0; j < Math.min(next, start + 145); j++) { end = j; quiet = t.env[j] < peak - 30 ? quiet + 1 : 0; if (quiet >= 12) break; }
    let live = 0; for (let j = start; j < end; j++) if (t.env[j] > peak - 25) live++;
    if (end - start >= 35 && live >= 25 && maxOf(t.env, start, end) > peak - 15) out.push({ start: sec(start), end: sec(end) });
  });
  return out.length ? { pieces: out.slice(0, 4), why: `${out.length} creaks, one a file` } : { drop: "no separate creak in it", score: -9 };
};
/** A LOOP: an hour of it. Level held (second by second within `sway` dB), no tune */
const loop = (sway) => (t) => {
  const per = [];
  for (let i = 0; i + 100 <= t.env.length; i += 100) { let s = 0; for (let j = i; j < i + 100; j++) s += 10 ** (t.env[j] / 10); per.push(10 * Math.log10(s / 100)); }
  const mean = per.reduce((a, b) => a + b, 0) / per.length, sd = Math.sqrt(per.reduce((a, b) => a + (b - mean) ** 2, 0) / per.length);
  if (tuned(t)) return tuned(t);
  if (sd > sway) return { drop: `its level wanders ${sd.toFixed(1)} dB from second to second (a loop must hold: ${sway})`, score: -sd };
  return { pieces: [{ start: 0, end: null }], why: `level steady to ${sd.toFixed(1)} dB over ${per.length} s, tone ${pct(t.tone)}` };
};
/** how hard the first thing heard arrives: dB gained in 30 ms */
const attack = (t) => { const on = onsets(t.env, { floor: 30, rise: 6 }); return on.length ? Math.max(...on.slice(0, 2).map((i) => t.env[Math.min(t.env.length - 1, i + 2)] - t.env[Math.max(0, i - 3)])) : 0; };
const RULES = {
  "step-wood-walk": steps, "step-gravel-walk": steps, "step-stone-walk": steps, "step-carpet-walk": steps,
  "rain-out": loop(2.5), "rain-in": loop(2.5), "fire-crackle": loop(4),
  // (thunder: from its first sound to where it has died away; a FAR stroke has no crack)
  thunder: (t) => {
    const on = onsets(t.env);
    if (!on.length) return { drop: "nothing in it", score: -9 };
    if (tuned(t)) return tuned(t);
    const a = attack(t), piece = { start: sec(Math.max(0, on[0] - 5)), end: sec(Math.min(t.env.length, lastLoud(t.env, 36) + 20)) };
    // (a NEAR stroke arrives hard. One that only rolls in is a far stroke, whatever it was asked for: filed there.)
    if (a < 8) return { pieces: [piece], as: "thunder-far", why: `it rolls in (attack ${a.toFixed(0)} dB): kept as FAR thunder` };
    return { pieces: [piece], why: `attack ${a.toFixed(0)} dB, tone ${pct(t.tone)}` };
  },
  "thunder-far": (t) => {
    const a = attack(t);
    if (a > 15) return { drop: `it opens too hard for a far stroke (${a.toFixed(0)} dB in 30 ms)`, score: -a };
    if (tuned(t)) return tuned(t);
    const on = onsets(t.env, { floor: 30, rise: 5 });
    return { pieces: [{ start: sec(Math.max(0, (on[0] ?? 0) - 5)), end: sec(Math.min(t.env.length, lastLoud(t.env, 36) + 20)) }], why: `a roll, attack ${a.toFixed(0)} dB, tone ${pct(t.tone)}` };
  },
  // the leaf is shut 0.63 s after it starts to move: the creak belongs to the swing, the thud to the frame
  "door-wood-open": timed({ by: 0.9, tail: 1.6, max: 2.4, noTone: false }),
  "door-wood-close": timed({ by: 0.4, tail: 1.0, max: 1.5 }),
  "door-bolt": timed({ by: 0.8, tail: 0.9, max: 1.7 }),
  "car-door": timed({ by: 1.4, tail: 0.8, max: 2.2 }),
  // (the crest clicks home as it appears: the take starts a moment before its click, whatever shuffles came first)
  "crest-set": (t) => {
    const pk = peakAt(t.env), start = Math.max(0, pk - 12);
    if (tuned(t)) return tuned(t);
    return { pieces: [{ start: sec(start), end: sec(Math.min(t.env.length, pk + 110, lastLoud(t.env, 32) + 8)) }], why: `the click at +0.12 s (it was ${(pk / 100).toFixed(2)} s into the take)` };
  },
  // (several blows, or it is one knock)
  "door-wood-pound": (t) => {
    const on = onsets(t.env, { floor: 16, rise: 8, gap: 12 });
    if (on.length < 2) return { drop: `only ${on.length} blow in it`, score: on.length };
    if (tuned(t)) return tuned(t);
    const s = Math.max(0, on[0] - 3);
    return { pieces: [{ start: sec(s), end: sec(Math.min(t.env.length, on[on.length - 1] + 60, s + 260)) }], why: `${on.length} blows` };
  },
  "stone-grind": (t) => {
    const on = onsets(t.env, { floor: 30, rise: 5 }), s = Math.max(0, (on[0] ?? 0) - 5), len = (lastLoud(t.env, 32) - s) / 100;
    return len < 3.5 ? { drop: `only ${len.toFixed(1)} s of grinding (the stone takes 5 s)`, score: len } : { pieces: [{ start: sec(s), end: null }], why: `${len.toFixed(1)} s of it` };
  },
  "house-creak": creaks,
  // (driving AWAY: its last two seconds well under its loudest second)
  "car-away": (t) => {
    const n = t.env.length, lvl = (a, b) => { let s = 0; for (let j = a; j < b; j++) s += 10 ** (t.env[j] / 10); return 10 * Math.log10(s / (b - a)); };
    let loud = -Infinity;
    for (let i = 0; i + 100 <= n; i += 50) loud = Math.max(loud, lvl(i, i + 100));
    const fall = loud - lvl(Math.max(0, n - 200), n);
    if (fall < 6) return { drop: `it does not go away: its end is only ${fall.toFixed(1)} dB under its loudest`, score: fall };
    const on = onsets(t.env, { floor: 30, rise: 5 });
    return { pieces: [{ start: sec(Math.max(0, (on[0] ?? 0) - 5)), end: null }], why: `falls away ${fall.toFixed(1)} dB by the end` };
  },
};

const picks = {}, kept = {}, dropped = {}, lines = [], takes = {};
for (const f of fs.readdirSync(GEN).sort()) {
  const m = f.match(/^(.+)-(\d+)\.mp3$/);
  if (!m || !RULES[m[1]]) continue;
  const x = decode(path.join(GEN, f)), t = { id: m[1], n: m[2], src: f, env: envelope(x), tone: tonal(x) };
  (takes[m[1]] ??= []).push({ t, res: RULES[m[1]](t) });
}
for (const [id, list] of Object.entries(takes)) {
  // (never no take at all: the least bad one, whole, and said so)
  if (!list.some((x) => x.res.pieces)) {
    const best = list.reduce((a, b) => ((b.res.score ?? -99) > (a.res.score ?? -99) ? b : a));
    best.res = { pieces: [{ start: 0, end: null }], why: `KEPT FOR WANT OF BETTER (${best.res.drop})` };
  }
  for (const { t, res } of list) {
    if (res.pieces) {
      const to = res.as ?? id;
      res.pieces.forEach((p, k) => { picks[`${to}|${to === id ? "" : id + "-"}${t.n}${res.pieces.length > 1 ? "." + k : ""}`] = { src: t.src, ...p }; });
      kept[to] = (kept[to] ?? 0) + res.pieces.length; lines.push(`  keep  ${t.src.padEnd(26)} ${res.why}`);
    } else { dropped[id] = (dropped[id] ?? 0) + 1; lines.push(`  DROP  ${t.src.padEnd(26)} ${res.drop}`); }
  }
}
fs.writeFileSync(path.join(A, "picks", "takes-glenridge-auto.json"), JSON.stringify({ batch: "glenridge-auto: picked by measurement (scripts/survivorz/glenridge/sound-picks.mjs) at Josh's word, Nov 13 2026; no person has heard them", picks }, null, 1));
fs.writeFileSync(path.join(ROOT, "docs", "survivorz", "glenridge-sound-picks.txt"), lines.join("\n") + "\n");
console.log(lines.join("\n"));
console.log(`\n${Object.keys(picks).length} pieces kept: ${Object.keys(takes).map((id) => `${id} ${kept[id] ?? 0}${dropped[id] ? ` (-${dropped[id]})` : ""}`).join(" · ")}`);
