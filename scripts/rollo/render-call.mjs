// THE DERBY'S RACE CALLER, VOICED — every line in client/src/lib/derby-call.ts
// CALL_LINES, read by the announcer voice Josh picked ("classic-1", kept at
// D:/solace-ai/models/voices/announcer.mp3) through the local voice clone
// (scripts/rollo/voice_server.py, started by Rollo's agent), mastered like the
// rest of the house's sound bank and written to client/public/sfx/derby/.
//
//   node scripts/rollo/render-call.mjs           every line
//   node scripts/rollo/render-call.mjs off win   only clips whose id contains one of those
//   node scripts/rollo/render-call.mjs --reel    also a sample race for Josh to preview
//
// The clips are rendered ONCE and committed: the race plays them with no GPU
// and no PC involved. Josh previews them before they're committed.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { CALL_LINES } = await import("file://" + path.join(ROOT, "client/src/lib/derby-call.ts").replace(/\\/g, "/"));
const SERVER = `http://127.0.0.1:${process.env.ROLLO_CLONE_PORT ?? "8781"}`;
const SFX = path.join(ROOT, "client/public/sfx");
const TMP = path.join(ROOT, "scripts/rollo/voice-previews/call-tmp");
// The house's one-shot mastering (scripts/gen-sounds.mjs), a touch louder: a
// caller has to sit on top of a crowd.
const MASTER = "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,loudnorm=I=-16:TP=-1.5";

const args = process.argv.slice(2);
const reel = args.includes("--reel");
const only = args.filter((a) => !a.startsWith("--"));
mkdirSync(TMP, { recursive: true });
mkdirSync(path.join(SFX, "derby"), { recursive: true });

const ff = (a) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a]);

async function say(text) {
  const res = await fetch(SERVER + "/say", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, voice: "announcer" }),
  });
  if (!res.ok) throw new Error(`voice server ${res.status} — is Rollo's agent running with ROLLO_CLONE=1?`);
  return Buffer.from(await res.arrayBuffer());
}

const ids = Object.keys(CALL_LINES).filter((id) => !only.length || only.some((o) => id.includes(o)));
for (const id of ids) {
  const pcm = await say(CALL_LINES[id]);
  const raw = path.join(TMP, id.replace(/\//g, "_") + ".pcm");
  writeFileSync(raw, pcm);
  const out = path.join(SFX, id + ".ogg");
  ff(["-f", "s16le", "-ar", "24000", "-ac", "1", "-i", raw, "-af", MASTER, "-c:a", "libvorbis", "-q:a", "4", out]);
  console.log(`${id}  (${(pcm.length / 48000).toFixed(1)}s)  "${CALL_LINES[id]}"`);
}

if (reel) {
  // A sample race, the clips in order with the gaps the caller would leave.
  const race = ["derby/call-off-1", "derby/call-early-rocket", "derby/call-lead-frog", "derby/call-stretch-1",
    "derby/call-boulder-go", "derby/call-win-boulder-late", "derby/call-second-frog",
    "derby/call-off-2", "derby/call-lead-nascar", "derby/call-boulder-flop",
    "derby/call-wire-blob", "derby/call-second-snail"];
  const list = path.join(TMP, "reel.txt");
  writeFileSync(list, race.map((id) => `file '${path.join(SFX, id + ".ogg").replace(/\\/g, "/")}'`).join("\n"));
  const out = path.join(ROOT, "scripts/rollo/voice-previews/derby-call-reel.mp3");
  ff(["-f", "concat", "-safe", "0", "-i", list, "-af", "apad=pad_dur=0.6", "-c:a", "libmp3lame", "-q:a", "4", out]);
  console.log("reel:", out);
}
rmSync(TMP, { recursive: true, force: true });

// The planner spaces lines by how long each really runs, so write the lengths
// of every voiced file back into derby-call.ts (between its markers).
const callTs = path.join(ROOT, "client/src/lib/derby-call.ts");
const ms = {};
for (const id of Object.keys(CALL_LINES).sort()) {
  const f = path.join(SFX, id + ".ogg");
  if (!existsSync(f)) continue;
  const d = parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());
  ms[id] = Math.ceil(d * 1000);
}
const src = readFileSync(callTs, "utf8");
const a = src.indexOf("// <durations>");
const b = src.indexOf("// </durations>");
if (a < 0 || b < 0) throw new Error("derby-call.ts lost its <durations> markers");
const table =
  "// <durations> written by scripts/rollo/render-call.mjs from the voiced files — do not edit by hand\n" +
  "export const CALL_MS: Record<string, number> = " + JSON.stringify(ms, null, 2) + ";\n";
writeFileSync(callTs, src.slice(0, a) + table + src.slice(b));
console.log(`lengths of ${Object.keys(ms).length} lines written to derby-call.ts`);
