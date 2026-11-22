// SURVIVORZ: the sound mastering chain, shared by the comparison pages and the final cut.
//   takes(file, opts)        -> [{start, end}] — the separate sounds inside a long file
//   master(file, out, opts)  -> writes one clean clip: cut, rumble removed, faded, and
//                               levelled by its LOUDEST moment (not its average, which a
//                               short gunshot with a long silence would read as quiet)
import fs from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

const RATE = 22050, HOP = 220;   // 10 ms frames

function envelope(file, maxSecs = 300) {
  const pcm = execFileSync("ffmpeg", ["-v", "error", "-t", String(maxSecs), "-i", file, "-ac", "1", "-ar", String(RATE), "-f", "s16le", "-"], { maxBuffer: 256 << 20 });
  const n = pcm.length >> 1, env = [];
  for (let o = 0; o + HOP <= n; o += HOP) {
    let e = 0;
    for (let k = 0; k < HOP; k++) { const v = pcm.readInt16LE((o + k) << 1) / 32768; e += v * v; }
    env.push(10 * Math.log10(e / HOP + 1e-12));
  }
  return env;
}

// a take starts where the level climbs out of the quiet and ends once it has stayed well
// below that take's own peak for `gap` seconds (or at `maxLen`)
export function takes(file, { drop = 30, tail = 42, gap = 0.3, minLen = 0.12, maxLen = 8 } = {}) {
  const env = envelope(file);
  const peak = Math.max(...env);
  const on = peak - drop, gapF = Math.round(gap * 100), out = [];
  let i = 0;
  while (i < env.length) {
    while (i < env.length && env[i] < on) i++;
    if (i >= env.length) break;
    const s = Math.max(0, i - 2);
    let segPeak = env[i], j = i, quiet = 0;
    for (; j < env.length; j++) {
      segPeak = Math.max(segPeak, env[j]);
      if (env[j] < segPeak - tail || env[j] < on - 12) quiet++; else quiet = 0;
      if (quiet >= gapF || (j - s) / 100 >= maxLen) break;
    }
    const e = Math.min(env.length, Math.max(s + 1, j - quiet + Math.min(quiet, 25)));   // keep a quarter second of the decay
    if ((e - s) / 100 >= minLen) out.push({ start: s / 100, end: e / 100 });
    i = Math.max(j, e) + 1;
  }
  return out;
}

function peakDb(file) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
  return Number(r.stderr.match(/max_volume:\s*(-?[\d.]+)/)?.[1] ?? 0);
}
// the loudest 400 ms of a clip, in LUFS
function maxMomentary(file) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-v", "verbose", "-i", file, "-af", "ebur128=framelog=verbose", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 64 << 20 });
  let max = -120;
  for (const m of r.stderr.matchAll(/ M:\s*(-?[\d.]+)/g)) max = Math.max(max, Number(m[1]));
  return max;
}

// target: the loudest moment lands here (LUFS). Gunshots and screams sit near -12; the
// level they finally play at is the game's mix, this only makes every clip start equal.
// loop: a seamless loop is levelled and nothing else — trimming its silence or fading its
// ends would put a click or a dip at the seam. pad: lengthen a tiny clip so a browser plays
// it (review pages); the game's own files don't need it.
export function master(file, out, { start = 0, end = null, target = -16, fadeOut = 0.08, format = "mp3", loop = false, pad = true } = {}) {
  const len = end != null ? end - start : null;
  const cut = [...(start ? ["-ss", start.toFixed(3)] : []), ...(len ? ["-t", len.toFixed(3)] : [])];
  const tmp = `${out}.tmp.wav`;
  execFileSync("ffmpeg", ["-v", "error", "-y", ...cut, "-i", file, "-af",
    loop ? "highpass=f=30" : `highpass=f=30,silenceremove=start_periods=1:start_threshold=-60dB,areverse,silenceremove=start_periods=1:start_threshold=-70dB,areverse,apad=pad_dur=0.05,afade=t=in:d=0.004`,
    "-ar", "48000", "-ac", "2", tmp]);
  // loud enough to hear the loudest moment at the target, but never past -1 dBFS on its
  // sharpest peak: a real gunshot's crack is far above its loudness, and a limiter flattening
  // it would make the recording sound worse than it is
  const gain = Math.min(target - maxMomentary(tmp), -1 - peakDb(tmp));
  const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", tmp], { encoding: "utf8" }));
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", tmp, "-af",
    loop ? `volume=${gain.toFixed(2)}dB`
      : `volume=${gain.toFixed(2)}dB,afade=t=out:st=${Math.max(0, dur - Math.min(fadeOut, dur * 0.3)).toFixed(3)}:d=${Math.min(fadeOut, dur * 0.3).toFixed(3)}${pad ? ",apad=whole_dur=0.25" : ""}`,   // a click or a drip is a real take, but a browser won't play an mp3 shorter than about a tenth of a second
    ...(format === "mp3" ? ["-b:a", "192k"] : format === "ogg" ? ["-c:a", "libvorbis", "-q:a", "6"] : ["-c:a", "pcm_s24le"]), out]);
  fs.unlinkSync(tmp);
  return { gain, dur };
}
