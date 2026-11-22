// THE PORTAL — the voice rooms' last sessions (docs/portal/archive/voice.md,
// the spoken Eshai in docs/portal/eshai/voice.md), drafted through ElevenLabs
// and mixed with ffmpeg. Josh PREVIEWS every sound before it is committed
// (the house's sound law), so this writes DRAFTS to a folder you name; the
// approved ones are copied to client/public/sfx/portal/, where the server's
// playback fault finds them (src/portal/voice.ts plays only clips on disk).
//
//   node scripts/portal/gen-voice.mjs <out-dir> [clip ...]
//
// Each clip is four breaths: a bed (the room) and, for the spoken ones, a
// voice over it — low, unhurried, close to the microphone, slowed and pitched
// down a touch so it doesn't sound like anyone here. The Eshai is read as
// written; a player who has the lexicon can transcribe it.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "../..");
const OUT = process.argv[2];
if (!OUT) { console.error("usage: gen-voice.mjs <out-dir> [clip ...]"); process.exit(1); }
const ONLY = new Set(process.argv.slice(3));
const RAW = join(OUT, "raw");
mkdirSync(RAW, { recursive: true });
const el = (...a) => execFileSync(process.execPath, [join(ROOT, "scripts/elevenlabs.mjs"), ...a], { stdio: "inherit" });
const ff = (...a) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a], { stdio: "inherit" });
const once = (file, make) => { if (!existsSync(file)) make(); return file; };

const BEDS = {
  ren: "a small quiet room at night, many people breathing softly and slowly, very close microphone, a faint clean electronic pulse ticking steadily",
  keth: "a large assembly chamber, a hushed audience, faint shuffling and a low room tone, nobody speaking",
  hiccup: "a clean soft electronic clock tick at a steady pace, with a small stutter on every eighth tick",
};
/** How far each bed is lifted: ElevenLabs hands a breathing room back very quiet (measured: ren -55 dB, keth -42). */
const BED_GAIN = { ren: 16, keth: 3.2, hiccup: 1 };
const VOICE = { nemaai: "SAz9YHcvj6GT2YYXdXww", sethe: "pFZP5JQG7iQjIQuC4Bku", counter: "cgSgspJ2msm6clMCkdW9", clerk: "nPczCjzI2devNBz1zQrb", dannar: "onwK4e9ZLuTAKqWW03F9", yulenai: "Xb7hH8MSUJpSbSDYk0k2" };

/** clip → its bed, and the voice over it (if any): who, what, when, and whether it is cut off. */
const CLIPS = {
  "ren-taan-1": { bed: "ren" },
  "ren-taan-2": { bed: "ren", voice: "sethe", text: "Ukku ishu.", at: 0.4, then: "hiccup" },
  "ren-taan-3": { bed: "ren", voice: "counter", text: "pem... sul... hev... en-nul...", at: 0.3 },
  "ren-taan-4": { bed: "ren", voice: "nemaai", text: "Mu tamma-ai ushu ren-ka. Mu ren", at: 0.5, cut: true },
  "keth-ren-1": { bed: "keth", voice: "clerk", text: "Tolun Ves, ae. Haami Ork, ae. Sennu Daal, ma. Ilvaar Teth, ae.", at: 0.2 },
  "keth-ren-2": { bed: "keth", voice: "dannar", text: "Kel-maar Yulenai a Maalith mesu vhaal-maar sheth kel-esh. ... Mu ta vend'onn", at: 0.3, cut: true },
  "keth-ren-3": { bed: "keth", voice: "yulenai", text: "Sheth. Ossa thar.", at: 0.8 },
};
const LEN = 7; // seconds: four breaths, unhurried

for (const [name, c] of Object.entries(CLIPS)) {
  if (ONLY.size && !ONLY.has(name)) continue;
  const bed = once(join(RAW, `bed-${c.bed}.mp3`), () => el("sfx", BEDS[c.bed], String(LEN + 1), join(RAW, `bed-${c.bed}.mp3`)));
  const out = join(OUT, `${name}.ogg`);
  if (!c.voice) {
    ff("-i", bed, "-t", String(LEN), "-af", `afade=t=in:d=0.6,afade=t=out:st=${LEN - 1.2}:d=1.2,volume=${BED_GAIN[c.bed]}`, "-c:a", "libvorbis", "-q:a", "5", out);
  } else {
    const say = once(join(RAW, `say-${name}.mp3`), () => el("say", VOICE[c.voice], c.text, join(RAW, `say-${name}.mp3`)));
    // Slower and lower (asetrate then resample keeps it smooth), close and a little dry.
    const voiceFx = `asetrate=44100*0.9,aresample=44100,atempo=0.95,highpass=f=90,lowpass=f=7000,volume=1.4${c.cut ? `,afade=t=out:st=${LEN - c.at - 0.9}:d=0.06` : ""}`;
    const extra = c.then ? ["-i", once(join(RAW, `bed-${c.then}.mp3`), () => el("sfx", BEDS[c.then], "6", join(RAW, `bed-${c.then}.mp3`)))] : [];
    const chain = c.then
      ? `[1:a]${voiceFx},adelay=${Math.round(c.at * 1000)}|${Math.round(c.at * 1000)}[v];[2:a]volume=0.8,adelay=2600|2600[h];[0:a]volume=${0.5 * BED_GAIN[c.bed]}[b];[b][v][h]amix=inputs=3:normalize=0`
      : `[1:a]${voiceFx},adelay=${Math.round(c.at * 1000)}|${Math.round(c.at * 1000)}[v];[0:a]volume=${0.5 * BED_GAIN[c.bed]}[b];[b][v]amix=inputs=2:normalize=0`;
    ff("-i", bed, "-i", say, ...extra, "-filter_complex", `${chain},atrim=0:${LEN},afade=t=in:d=0.4,afade=t=out:st=${LEN - (c.cut ? 0.05 : 1)}:d=${c.cut ? 0.05 : 1},loudnorm=I=-22:TP=-3`,
      "-c:a", "libvorbis", "-q:a", "5", out);
  }
  console.log(`wrote ${out}`);
}
