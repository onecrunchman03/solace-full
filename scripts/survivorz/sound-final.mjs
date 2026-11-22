// SURVIVORZ: turns Josh's kept takes (sound/tally.json, from sound-tally.mjs) into the show's
// finished sound set:
//   final/master/<sound>/<sound>-NN.wav   48 kHz / 24-bit masters
//   final/game/<sound>/<sound>-NN.ogg     what the game plays (Vorbis q6)
//   final/preview/<sound>/<sound>-NN.mp3  for the preview page
//   final/manifest.json                   every sound: its files, one-shot or loop, level, source
// Each real take is cut and levelled for its category (sound-master.mjs). A frequent sound with
// fewer real takes than it needs is filled out with VARIATIONS of them — a small pitch shift
// and a gentle tone change, seeded so a re-run makes the same files. A loop is levelled and
// left seamless; a music bed is made seamless by crossfading its end into its start.
//   node scripts/survivorz/sound-final.mjs [--only id,id]
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { master } from "./sound-master.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { SOUND_LIST, PACES, STEP_JITTER } = await imp("docs/survivorz/sound-list.mjs");
const { PROMPTS } = await imp("docs/survivorz/sound-prompts.mjs");
const SOUND = path.join(ROOT, "assets", "downloads", "survivorz", "sound");
const GEN = path.join(SOUND, "eleven", "prod");
const FINAL = path.join(SOUND, "final");
const tally = JSON.parse(fs.readFileSync(path.join(SOUND, "tally.json"), "utf8"));
const LOG = JSON.parse(fs.readFileSync(path.join(GEN, "LOG.json"), "utf8"));
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1].split(",") : null;

// where each sound's loudest moment lands (LUFS); the game's mixer sets the final balance
const HANDLING = /dryfire|mag|slide|bolt|pump|load|casing/;
function targetOf(ev) {
  if (ev.group === "guns") return HANDLING.test(ev.id) ? -18 : -12;
  if (ev.group === "footsteps") return -20;
  if (ev.group === "facility beds") return -24;
  if (ev.group === "score") return ev.id.startsWith("score-") ? -20 : -14;
  if (ev.group === "zombies") return ev.kind === "loop" ? -20 : -16;
  if (ev.group === "pa" || ev.group === "audiologs") return -18;          // the facility's announcements, under the cast
  if (ev.kind === "loop") return -20;
  return -16;
}

// the sounds by pool: a surface's steps at three paces are one sound
const sounds = {};
for (const ev of SOUND_LIST) (sounds[ev.pool || ev.id] ??= { key: ev.pool || ev.id, ev, evs: [] }).evs.push(ev);

const ff = (args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args]);
const dur = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }));
function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

// a music bed made seamless: its last 3 s fade into its first 3 s, and the loop starts 3 s in
function seamless(wav) {
  const D = dur(wav), F = Math.min(3, D / 6), tmp = `${wav}.loop.wav`;
  ff(["-i", wav, "-filter_complex",
    `[0]atrim=${F}:${D - F},asetpts=PTS-STARTPTS[mid];[0]atrim=${D - F}:${D},asetpts=PTS-STARTPTS,afade=t=out:d=${F}:curve=qsin[tail];[0]atrim=0:${F},asetpts=PTS-STARTPTS,afade=t=in:d=${F}:curve=qsin[head];[tail][head]amix=inputs=2:normalize=0[xf];[mid][xf]concat=n=2:v=0:a=1`,
    "-c:a", "pcm_s24le", tmp]);
  fs.renameSync(tmp, wav);
}

function encode(wav, game, prev, music) {
  fs.mkdirSync(path.dirname(game), { recursive: true }); fs.mkdirSync(path.dirname(prev), { recursive: true });
  ff(["-i", wav, "-c:a", "libvorbis", "-q:a", "6", game]);
  ff(["-i", wav, "-b:a", music ? "128k" : "192k", prev]);
}

const manifest = { made: new Date().toISOString(), paces: PACES, stepJitter: STEP_JITTER, sounds: {} };
const MF = path.join(FINAL, "manifest.json");
if (only && fs.existsSync(MF)) Object.assign(manifest.sounds, JSON.parse(fs.readFileSync(MF, "utf8")).sounds);
for (const { key, ev, evs } of Object.values(sounds)) {
  if (only && !only.includes(key)) continue;
  const t = tally[key];
  const loop = ev.kind === "loop", music = !!PROMPTS[ev.id]?.music;
  const dirs = ["master", "game", "preview"].map((d) => path.join(FINAL, d, key));
  for (const d of dirs) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
  const files = [];
  const name = (n) => `${key}-${String(n).padStart(2, "0")}`;
  const real = [];
  for (const k of t.takes) {
    const i = real.length;
    const wav = path.join(dirs[0], `${name(i)}.wav`);
    const m = master(path.join(GEN, k.src), wav, { start: k.start || 0, end: k.end, target: targetOf(ev), format: "wav", loop, pad: false });
    // a cut that held only a tail comes out of the silence trim empty: not a take
    if (!(m.dur > 0.03) || m.gain > 60) { fs.rmSync(wav, { force: true }); console.log(`  ${key}: skipped an empty cut of ${k.src}`); continue; }
    real.push(k);
    if (music) seamless(wav);
    encode(wav, path.join(dirs[1], `${name(i)}.ogg`), path.join(dirs[2], `${name(i)}.mp3`), music);
    files.push({ file: `${name(i)}.ogg`, from: k.src, start: k.start || 0, end: k.end, variant: null });
  }
  t.takes = real;
  // fill a frequent sound out to its count with variations of the real takes
  const RARE = new Set(["doors", "facility", "facility beds", "score", "pa", "audiologs"]);   // a PA line is one recording, never pitched
  const want = RARE.has(ev.group) || loop ? files.length : Math.max(files.length, ev.takes);
  const rand = mulberry(hash(key));
  for (let n = files.length, j = 0; n < want; n++, j++) {
    const base = j % t.takes.length;
    const up = rand() < 0.5 ? -1 : 1, pitch = 1 + up * (0.025 + rand() * 0.035);   // 2.5–6% away, never the original
    const tilt = (rand() * 2 - 1) * 2.5;                                            // ±2.5 dB of treble
    const src = path.join(dirs[0], `${name(base)}.wav`), wav = path.join(dirs[0], `${name(n)}.wav`);
    ff(["-i", src, "-af", `asetrate=${Math.round(48000 * pitch)},aresample=48000,treble=g=${tilt.toFixed(2)}:f=4000`, "-c:a", "pcm_s24le", wav]);
    encode(wav, path.join(dirs[1], `${name(n)}.ogg`), path.join(dirs[2], `${name(n)}.mp3`), false);
    files.push({ file: `${name(n)}.ogg`, from: `${name(base)}.wav`, variant: { pitch: +pitch.toFixed(4), trebleDb: +tilt.toFixed(2) } });
  }
  const prompts = [...new Set(t.takes.map((k) => LOG[k.src]?.prompt).filter(Boolean))];
  manifest.sounds[key] = {
    group: ev.group, kind: loop ? "loop" : "one", music, targetLufs: targetOf(ev), files,
    ...(evs.length > 1 ? { paces: evs.map((e) => e.id.split("-").pop()) } : {}),
    source: "ElevenLabs (Creator plan, commercial use), generated from the prompts below for Solace Survivorz", prompts,
  };
  console.log(`${key.padEnd(22)} ${String(t.takes.length).padStart(2)} real + ${files.length - t.takes.length} variations${loop ? " · loop" : ""}${music ? " · seamless" : ""}`);
}
fs.mkdirSync(FINAL, { recursive: true });
fs.writeFileSync(MF, JSON.stringify(manifest, null, 1));
const all = Object.values(manifest.sounds);
console.log(`\n${all.length} sounds · ${all.reduce((a, s) => a + s.files.length, 0)} files -> ${path.relative(ROOT, FINAL)}`);
