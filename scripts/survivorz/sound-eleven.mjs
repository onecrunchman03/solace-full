// SURVIVORZ: makes ElevenLabs sounds.
//   node scripts/survivorz/sound-eleven.mjs <set> [--redo id]
//       a comparison set from docs/survivorz/sound-eleven.mjs
//   node scripts/survivorz/sound-eleven.mjs prod [--only group,group] [--redo id]
//       the show's sounds from docs/survivorz/sound-prompts.mjs, as many takes as the sound
//       list needs plus half again to throw away the bad ones
// Takes land in assets/downloads/survivorz/sound/eleven/<set>/<id>-<n>.mp3 and LOG.json
// records the prompt, settings and date of each. A take already on disk is skipped, so a
// re-run only makes what's missing; --redo <id> replaces one sound's takes.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const KEY = fs.readFileSync(path.join(ROOT, ".env"), "utf8").match(/^ELEVENLABS_API_KEY=(.+)$/m)?.[1]?.trim();
if (!KEY) throw new Error("no ELEVENLABS_API_KEY in .env");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const [set] = process.argv.slice(2);
const redo = arg("--redo");
const only = arg("--only")?.split(",");
const ids = arg("--ids")?.split(",");          // with --more: just these sounds
const moreN = Number(arg("--more") || 0);       // another round: this many new files per sound, numbered on from the last
if (!set) throw new Error("usage: sound-eleven.mjs <set|prod> [--only groups] [--redo id]");

// the jobs: [{key, file, spec}]
const jobs = [];
if (set === "prod") {
  const { PROMPTS } = await imp("docs/survivorz/sound-prompts.mjs");
  const { SOUND_LIST } = await imp("docs/survivorz/sound-list.mjs");
  for (const ev of SOUND_LIST) {
    if (only && !only.includes(ev.group)) continue;
    if (ids && !ids.includes(ev.id)) continue;
    const s = PROMPTS[ev.id];
    if (moreN) {
      const last = Math.max(-1, ...fs.readdirSync(path.join(ROOT, "assets", "downloads", "survivorz", "sound", "eleven", "prod")).filter((f) => f.startsWith(`${ev.id}-`) && /^\d+\.mp3$/.test(f.slice(ev.id.length + 1))).map((f) => parseInt(f.slice(ev.id.length + 1))));
      // a sound with alternative wordings (alts) cycles through all of them, for variety
      const words = [s.prompt, ...(s.alts || [])];
      for (let n = last + 1, k = 0; n <= last + moreN; n++, k++) jobs.push({ key: ev.id, file: `${ev.id}-${n}.mp3`, spec: { ...s, prompt: words[k % words.length] } });
      continue;
    }
    const want = Math.ceil(ev.takes * (1 + (s.extra ?? 0.5)));
    const files = s.seq ? Math.max(2, Math.ceil(want / 4)) : want;   // a run of ~4-6 sounds cuts into several takes
    for (let n = 0; n < files; n++) jobs.push({ key: ev.id, file: `${ev.id}-${n}.mp3`, spec: s });
  }
} else {
  const { ELEVEN } = await imp("docs/survivorz/sound-eleven.mjs");
  for (const [key, s] of Object.entries(ELEVEN)) {
    if (s.set !== set) continue;
    for (let n = 0; n < s.takes; n++) jobs.push({ key, file: `${key.replace("#", "~")}-${n}.mp3`, spec: s });
  }
}

const DIR = path.join(ROOT, "assets", "downloads", "survivorz", "sound", "eleven", set);
fs.mkdirSync(DIR, { recursive: true });
const LOGF = path.join(DIR, "LOG.json");
const log = fs.existsSync(LOGF) ? JSON.parse(fs.readFileSync(LOGF, "utf8")) : {};

async function make({ key, file, spec: s }) {
  const out = path.join(DIR, file);
  if (fs.existsSync(out) && redo !== key) return false;
  const music = !!s.music;
  // a voice line (tts: {voice, model}): the prompt is spoken by that saved voice — the PA's
  // announcements and the survivors' own coughs, screams and breaths (eleven_v3's [tags])
  const tts = s.tts;
  const url = tts ? `https://api.elevenlabs.io/v1/text-to-speech/${tts.voice}?output_format=mp3_44100_192`
    : music ? "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_192" : "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_192";
  const body = tts
    ? { text: s.prompt, model_id: tts.model, ...(tts.settings ? { voice_settings: tts.settings } : {}) }
    : music
    ? { prompt: s.prompt, music_length_ms: Math.round(s.secs * 1000), model_id: "music_v1", force_instrumental: true }
    : { text: s.prompt, duration_seconds: s.secs, prompt_influence: s.influence ?? 0.5, model_id: "eleven_text_to_sound_v2", ...(s.loop ? { loop: true } : {}) };
  for (let tries = 0; ; tries++) {
    const res = await fetch(url, { method: "POST", headers: { "xi-api-key": KEY, "content-type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) { fs.writeFileSync(out, Buffer.from(await res.arrayBuffer())); break; }
    const msg = (await res.text()).slice(0, 300);
    if (tries < 4 && (res.status === 429 || res.status >= 500)) { await new Promise((r) => setTimeout(r, 4000 * (tries + 1))); continue; }
    throw new Error(`${file}: ${res.status} ${msg}`);
  }
  log[file] = { id: key, prompt: s.prompt, secs: s.secs, influence: s.influence ?? 0.5, loop: !!s.loop, model: tts ? tts.model : music ? "music_v1" : "eleven_text_to_sound_v2", ...(tts ? { voice: tts.voice } : {}), made: new Date().toISOString() };
  fs.writeFileSync(LOGF, JSON.stringify(log, null, 1));
  console.log(`made ${file}`);
  return true;
}

// three at a time: well inside the plan's concurrency, and three times quicker than one
let made = 0, i = 0;
await Promise.all([0, 1, 2].map(async () => { while (i < jobs.length) { const j = jobs[i++]; if (await make(j)) made++; } }));
console.log(`${set}${only ? ` (${only.join(", ")})` : ""}: ${made} made, ${jobs.length - made} already on disk`);
