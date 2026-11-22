// ElevenLabs asset generator for Solace — dev-machine tooling, never shipped.
// Reads ELEVENLABS_API_KEY from .env. Everything is regenerable from prompts,
// so sounds are code-reviewable instead of mystery blobs.
//
//   node scripts/elevenlabs.mjs credits
//   node scripts/elevenlabs.mjs voices [filter]
//   node scripts/elevenlabs.mjs say <voiceId> "<text>" <out.mp3>
//   node scripts/elevenlabs.mjs sfx "<prompt>" <seconds|-> <out.mp3>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const KEY = envText.match(/^ELEVENLABS_API_KEY=(.+)$/m)?.[1]?.trim();
if (!KEY) {
  console.error("No ELEVENLABS_API_KEY in .env");
  process.exit(1);
}
const H = { "xi-api-key": KEY };

async function api(url, init = {}) {
  const res = await fetch(`https://api.elevenlabs.io${url}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res;
}

const [cmd, ...args] = process.argv.slice(2);

if (cmd === "credits") {
  const sub = await (await api("/v1/user/subscription")).json();
  console.log(`plan: ${sub.tier} · used ${sub.character_count}/${sub.character_limit} credits · resets ${new Date(sub.next_character_count_reset_unix * 1000).toUTCString()}`);
} else if (cmd === "voices") {
  const filter = (args[0] ?? "").toLowerCase();
  const data = await (await api("/v1/voices")).json();
  for (const v of data.voices) {
    const labels = Object.values(v.labels ?? {}).join(", ");
    const line = `${v.voice_id}  ${v.name.padEnd(14)} ${labels}`;
    if (!filter || line.toLowerCase().includes(filter)) console.log(line);
  }
} else if (cmd === "say") {
  const [voiceId, text, out] = args;
  const res = await api(`/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.35 },
    }),
  });
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log(`wrote ${out}`);
} else if (cmd === "sfx") {
  const [prompt, secs, out] = args;
  const body = { text: prompt };
  if (secs && secs !== "-") body.duration_seconds = Number(secs);
  const res = await api("/v1/sound-generation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log(`wrote ${out}`);
} else {
  console.log("commands: credits · voices [filter] · say <voiceId> <text> <out> · sfx <prompt> <secs|-> <out>");
}
