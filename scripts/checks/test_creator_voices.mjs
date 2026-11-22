// THE CHARACTER CREATOR'S VOICE LIBRARY (src/routes/survivorz-voices.ts), over a real server on
// port 8614: an upload is the admin's only and taken by its bytes (MP3 or WAV, a bad name or a taken
// one refused); the clip plays back byte for byte; the PC's worker (its token) and slopbot's agent
// (its secret) can each add what the library lacks and nothing else, and slopbot fetches a reference
// by name; designing answers honestly when there's no ElevenLabs key; a sample answers 503 while
// slopbot is away, and voices when the agent takes the line and posts its audio; a voice a character
// speaks with can't be deleted; and ONE VOICE EACH — a saved character can't take another's clone.

process.env.EXCHANGE_PROVIDER = "off";
process.env.ALPACA_KEY_ID = "";
process.env.ALPACA_SECRET_KEY = "";

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PORT = 8614;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "creator-voices-harness");
fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(path.join(DATA_DIR, "survivorz", "game"), { recursive: true });
const TOKEN = "creator-voices-worker-token-0123456789";
const SECRET = "creator-voices-agent-secret-0123456789";
const ADMIN_PW = "Harness!Admin9xy";
const env = {
  ...process.env, PORT: String(PORT), DATA_DIR, ADMIN_PASSWORD: ADMIN_PW, ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false",
  LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "", ROLLO_LIVE: "0", NPC_BRAIN_URL: "", NPC_BRAIN_BIG_URL: "",
  SURVIVORZ_ASSETS: path.join(DATA_DIR, "survivorz"), SURVIVORZ_WORKER_TOKEN: TOKEN, NPC_AGENT_SECRET: SECRET, ELEVENLABS_API_KEY: "",
};
const srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], { env, stdio: ["ignore", "ignore", "ignore"] });
process.on("exit", () => { try { srv.kill("SIGINT"); } catch {} });
let up = false;
for (let i = 0; i < 160 && !up; i++) { try { up = (await fetch(BASE + "/health")).ok; } catch {} if (!up) await sleep(250); }
ok(up, "the server boots");

const req = async (method, url, { token, agent, body, raw } = {}) => {
  const headers = { ...(token ? { authorization: "Bearer " + token } : {}), ...(agent ? { "x-agent-secret": agent } : {}) };
  if (raw) headers["content-type"] = "application/octet-stream"; else if (body) headers["content-type"] = "application/json";
  const r = await fetch(BASE + url, { method, headers, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  const buf = Buffer.from(await r.arrayBuffer());
  let j = null; try { j = JSON.parse(buf.toString("utf8")); } catch {}
  return { status: r.status, j, buf };
};
const admin = (await req("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } })).j?.token;
await req("POST", "/api/register", { body: { username: "member_cv", password: "Harness!Member9xy", secret: "copper lantern drifting slowly home", acceptTerms: true } });
const member = (await req("POST", "/api/login", { body: { username: "member_cv", password: "Harness!Member9xy" } })).j?.token;

const MP3 = Buffer.concat([Buffer.from("ID3\x03\x00\x00\x00\x00\x00\x00", "latin1"), Buffer.alloc(4000, 9)]);
const WAV = (() => { const b = Buffer.alloc(44 + 3200); b.write("RIFF", 0); b.writeUInt32LE(36 + 3200, 4); b.write("WAVE", 8); b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(3200, 40); return b; })();

console.log("THE LIBRARY");
ok((await req("POST", "/api/admin/survivorz/voices?name=gravel-1", { token: member, raw: MP3 })).status === 403, "a member can't add a voice (403)");
ok((await req("POST", "/api/admin/survivorz/voices?name=Bad Name", { token: admin, raw: MP3 })).status === 400, "a bad name is refused (400)");
ok((await req("POST", "/api/admin/survivorz/voices?name=notaudio", { token: admin, raw: Buffer.from("hello, not a sound at all") })).status === 415, "bytes that aren't audio are refused (415)");
const upl = await req("POST", "/api/admin/survivorz/voices?name=gravel-1&label=Gravelly", { token: admin, raw: MP3 });
ok(upl.status === 200 && upl.j?.voice?.source === "uploaded" && upl.j.voice.label === "Gravelly", "an MP3 is added, labelled");
ok((await req("POST", "/api/admin/survivorz/voices?name=gravel-1", { token: admin, raw: MP3 })).status === 409, "a name already in the library is refused (409)");
ok((await req("POST", "/api/admin/survivorz/voices?name=wav-1", { token: admin, raw: WAV })).j?.voice?.ext === "wav", "a WAV is added");
const lib = await req("GET", "/api/admin/survivorz/voices", { token: admin });
ok(lib.j?.voices?.length === 2 && lib.j.canDesign === false && lib.j.slopbot === false && lib.j.stock.includes("af_heart"), "the list: both voices, no design without a key, slopbot away, the stock voices");
ok((await req("GET", "/api/admin/survivorz/voices/file/gravel-1", { token: admin })).buf.equals(MP3), "the clip plays back byte for byte");
ok((await req("GET", "/api/admin/survivorz/voices", { token: member })).status === 403, "a member can't see the library (403)");

console.log("THE PC AND SLOPBOT");
ok((await req("GET", "/api/survivorz/worker/voices")).status === 401, "the worker's list needs its token (401)");
ok((await req("GET", "/api/survivorz/worker/voices", { token: TOKEN })).j?.names?.includes("gravel-1"), "the worker sees what the library has");
ok((await req("POST", "/api/survivorz/worker/voice?name=duke-salty-3", { token: TOKEN, raw: MP3 })).status === 200, "the worker adds a voice the library lacks");
ok((await req("POST", "/api/survivorz/worker/voice?name=gravel-1", { token: TOKEN, raw: WAV })).j?.had === true, "…and never replaces one it has");
ok((await req("GET", "/api/survivorz/voice-lib")).status === 404 && (await req("GET", "/api/survivorz/voice-lib", { agent: "wrong-secret-wrong-secret-wrong" })).status === 404, "slopbot's door is a 404 without its secret");
ok((await req("POST", "/api/survivorz/voice-lib?name=survivor-rick", { agent: SECRET, raw: MP3 })).status === 200, "slopbot shares a voice only it has");
ok((await req("GET", "/api/survivorz/voice-ref/survivor-rick", { agent: SECRET })).buf.equals(MP3), "and fetches a reference by name");
ok((await req("GET", "/api/survivorz/voice-ref/nobody-here", { agent: SECRET })).status === 404, "a name the library hasn't got is a 404");
ok((await req("GET", "/api/survivorz/voice-ref/gravel-1", { token: admin })).status === 404, "an admin session isn't slopbot (404)");

console.log("DESIGN AND SAMPLES");
const des = await req("POST", "/api/admin/survivorz/voices/design", { token: admin, body: { description: "A gravelly Texan man in his sixties, slow and dry" } });
ok(des.status === 503 && des.j?.error === "not_configured", "designing without the ElevenLabs key says so (503)");
ok((await req("POST", "/api/admin/survivorz/voices/keep", { token: admin, body: { take: "nope", name: "x-1" } })).status === 404, "keeping a take that doesn't exist is a 404");
const away = await req("POST", "/api/admin/survivorz/voices/sample", { token: admin, body: { text: "Keep your voice down.", clone: "gravel-1", kokoro: "am_adam" } });
ok(away.status === 503 && away.j?.error === "slopbot_away", "a sample while slopbot is away says so (503)");
// play the agent: its poll takes the sample, its audio comes back
await req("GET", "/api/npc/agent/near?v=2&sz=1", { agent: SECRET });   // the agent is about
const sampleQ = (async () => { await sleep(300); return req("POST", "/api/admin/survivorz/voices/sample", { token: admin, body: { text: "Keep your voice down.", clone: "gravel-1", kokoro: "am_adam" } }); })();
let line = null;
for (let i = 0; i < 20 && !line; i++) {
  await sleep(200);
  const near = await req("GET", "/api/npc/agent/near?v=2&sz=1", { agent: SECRET });
  line = (near.j?.survivorz ?? []).find((x) => x.who === "sample");
}
ok(line && line.clone === "gravel-1" && line.text === "Keep your voice down." && line.kokoro === "am_adam", "the agent's poll hands over the sample, with the voice to speak it in");
const pcm = Buffer.alloc(3200, 1);
ok((await req("POST", "/api/npc/agent/survivorz-audio", { agent: SECRET, body: { id: line?.id, rate: 16000, pcm: pcm.toString("base64") } })).j?.ok === true, "the agent's audio is taken");
const voiced = await sampleQ;
ok(voiced.status === 200 && !!voiced.j?.clip, "the sample comes back voiced");
const clip = await req("GET", `/api/admin/survivorz/voices/clip/${voiced.j?.clip}`, { token: admin });
ok(clip.status === 200 && clip.buf.subarray(0, 4).toString() === "RIFF" && clip.buf.length === 44 + pcm.length, "its clip is a WAV of exactly what the agent rendered");

console.log("ONE VOICE EACH");
const sarah = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "survivorz", "cast", "sarah.json"), "utf8"));
const saved = await req("POST", "/api/admin/survivorz/cast/save", { token: admin, body: { char: { ...sarah, id: "gravelly", name: "Gus Gravel", short: "Gus", status: "draft", body: "eric", voice: { clone: "gravel-1", kokoro: "am_adam" }, sheet: sarah.sheet.replace(/SARAH/g, "GUS").replace(/Sarah/g, "Gus") } } });
ok(saved.status === 200, "a character takes a voice from the library" + (saved.status !== 200 ? " " + JSON.stringify(saved.j).slice(0, 200) : ""));
const twin = await req("POST", "/api/admin/survivorz/cast/save", { token: admin, body: { char: { ...sarah, id: "twin", name: "Tom Twin", short: "Tom", status: "draft", body: "eric", voice: { clone: "gravel-1", kokoro: "am_adam" }, sheet: sarah.sheet.replace(/SARAH/g, "TOM").replace(/Sarah/g, "Tom") } } });
ok(twin.status === 400 && twin.j?.errors?.some((e) => e.field === "voice.clone"), "a second character can't take the same voice");
ok((await req("GET", "/api/admin/survivorz/voices", { token: admin })).j?.voices?.find((v) => v.name === "gravel-1")?.usedBy === "Gus Gravel", "the library says who speaks with it");
const inUse = await req("DELETE", "/api/admin/survivorz/voices/gravel-1", { token: admin });
ok(inUse.status === 409 && inUse.j?.name === "Gus Gravel", "a voice somebody speaks with can't be deleted (409, naming them)");
// (Nov 11 2026) a DELETED character speaks with nothing: its voice is free again, not "taken" forever
ok((await req("POST", "/api/admin/survivorz/voices?name=survivor-sarah", { token: admin, raw: WAV })).status === 200, "the cast voice of a repo character is in the library");
ok((await req("GET", "/api/admin/survivorz/voices", { token: admin })).j?.voices?.find((v) => v.name === "survivor-sarah")?.usedBy === "Sarah Lockner", "…spoken by her");
ok((await req("POST", "/api/admin/survivorz/cast/sarah/delete", { token: admin })).status === 200, "she is deleted");
ok((await req("GET", "/api/admin/survivorz/voices", { token: admin })).j?.voices?.find((v) => v.name === "survivor-sarah")?.usedBy == null, "and her voice is free again");
ok((await req("DELETE", "/api/admin/survivorz/voices/wav-1", { token: admin })).status === 200 && (await req("GET", "/api/admin/survivorz/voices/file/wav-1", { token: admin })).status === 404, "a free voice is deleted, clip and all");

srv.kill("SIGINT");
await sleep(500);
fs.rmSync(DATA_DIR, { recursive: true, force: true });
console.log(`\n${n - bad}/${n} creator-voice asserts passed`);
process.exit(bad ? 1 : 0);
