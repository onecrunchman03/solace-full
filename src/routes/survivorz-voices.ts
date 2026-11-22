// SOLACE SURVIVORZ — THE CREATOR'S VOICE LIBRARY (docs/survivorz/CREATOR.md; Josh, Nov 3 2026: "I want
// to be able to hear voice samples so i can better choose a voice for the new character").
//
// A voice is one reference clip: what slopbot's clone (Chatterbox, scripts/rollo/voice_server.py)
// speaks from. The library lives here, under the data dir (creatorRoot()/voices), and is the one
// place a voice is chosen from:
//   · DESIGN — describe a voice, ElevenLabs Voice Design makes three takes, keep one (ELEVENLABS_API_KEY
//     on this server; designing is the only call that leaves the house, and nothing plays through it)
//   · UPLOAD — a 5-60 s recording of Josh's own
//   · THE PC'S — the worker (creator/worker.mjs) uploads the references the workstation already has
// Slopbot fetches a reference it lacks from /api/survivorz/voice-ref/<name> (its agent secret) the
// first time a line needs it, so a new voice reaches the show with nothing copied by hand. A sample
// is a line spoken by that clone through the show's own queue (voices.ts voiceSample).
import fs from "node:fs";
import path from "node:path";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { bearer, json, readRawBody, type Router } from "../http";
import { FILES } from "../survivorz/cast/files";
import { KOKORO_VOICES } from "../survivorz/cast/rules";
import { agentAlive, voiceSample } from "../survivorz/voices";
import { isWorkerToken } from "../survivorz/workertoken";
import { creatorRoot } from "./survivorz-assets";
import type { Store } from "../db/store";

export const VOICE_NAME = /^[a-z0-9-]{2,40}$/;
const MAX_VOICE_BYTES = 12 * 1024 * 1024;
const PREVIEW_TTL_MS = 30 * 60_000;

export interface VoiceEntry { name: string; label: string; source: "designed" | "uploaded" | "workstation"; description?: string; addedAt: number; ext: "mp3" | "wav" }

const dir = (): string => path.join(creatorRoot(), "voices");
const metaFile = (): string => path.join(dir(), "library.json");
function readLib(): Record<string, VoiceEntry> {
  try { return JSON.parse(fs.readFileSync(metaFile(), "utf8")); } catch { return {}; }
}
function writeLib(lib: Record<string, VoiceEntry>): void {
  fs.mkdirSync(dir(), { recursive: true });
  const tmp = `${metaFile()}.part`;
  fs.writeFileSync(tmp, JSON.stringify(lib, null, 1));
  fs.renameSync(tmp, metaFile());
}
/** every voice in the library, by name (the character checklist: is their voice there?) */
export function voiceNames(): Set<string> {
  return new Set(Object.keys(readLib()));
}
const fileOf = (e: VoiceEntry): string => path.join(dir(), `${e.name}.${e.ext}`);

/** mp3 (an ID3 tag or a frame sync) or WAV, by the bytes. */
export function sniffAudio(b: Buffer): "mp3" | "wav" | null {
  if (b.length < 12) return null;
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WAVE") return "wav";
  if (b.subarray(0, 3).toString("latin1") === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return "mp3";
  return null;
}

/** Who speaks with each voice: the repo's characters and the panel's list — a list row in place of the repo file
 *  of the same id, and a DELETED character speaking with nothing (Nov 11 2026: a deleted character's voice stayed
 *  "taken" forever, and its file could never be deleted). */
function usedBy(store: Store): Record<string, string> {
  const who = new Map<string, { clone: string; name: string }>();
  for (const c of FILES) who.set(c.id, { clone: c.voice?.clone ?? "", name: c.name });
  for (const r of store.survivorzListAll()) {
    try {
      const c = JSON.parse(r.data) as { voice?: { clone?: string }; name?: string; deleted?: unknown };
      if (c.deleted === true) who.delete(r.id);
      else who.set(r.id, { clone: c.voice?.clone ?? "", name: c.name ?? r.id });
    } catch { /* a bad row */ }
  }
  const out: Record<string, string> = {};
  for (const c of who.values()) if (c.clone) out[c.clone] = c.name;
  return out;
}

// three takes from a design, waiting to be kept or thrown away; and rendered samples, briefly
const previews = new Map<string, { buf: Buffer; description: string; at: number }>();
const sampleClips = new Map<string, { buf: Buffer; at: number }>();
const sweep = (): void => {
  const now = Date.now();
  for (const [k, v] of previews) if (now - v.at > PREVIEW_TTL_MS) previews.delete(k);
  for (const [k, v] of sampleClips) if (now - v.at > PREVIEW_TTL_MS) sampleClips.delete(k);
};

function sendAudio(res: import("node:http").ServerResponse, buf: Buffer, kind: "mp3" | "wav"): void {
  res.writeHead(200, { "content-type": kind === "wav" ? "audio/wav" : "audio/mpeg", "content-length": buf.length, "cache-control": "private, no-store" });
  res.end(buf);
}

export function registerSurvivorzVoiceRoutes(router: Router): void {
  // ---- the library ----
  router.get("/api/admin/survivorz/voices", "admin", ({ res, store }) => {
    const lib = readLib(), users = usedBy(store);
    const voices = Object.values(lib).filter((e) => fs.existsSync(fileOf(e))).sort((a, b) => b.addedAt - a.addedAt).map((e) => ({ ...e, usedBy: users[e.name] ?? null }));
    json(res, 200, { voices, stock: KOKORO_VOICES, canDesign: !!process.env.ELEVENLABS_API_KEY, slopbot: agentAlive() });
  });

  router.get("/api/admin/survivorz/voices/file/:name", "admin", ({ res, params }) => {
    const e = readLib()[params.name];
    if (!e || !VOICE_NAME.test(e.name) || !fs.existsSync(fileOf(e))) return json(res, 404, { error: "not_found" });
    sendAudio(res, fs.readFileSync(fileOf(e)), e.ext);
  });

  // Josh's own recording: ?name=&label=
  router.postRaw("/api/admin/survivorz/voices", "admin", async ({ req, res, url, user, store }) => {
    const name = String(url.searchParams.get("name") ?? "").trim().toLowerCase();
    const label = String(url.searchParams.get("label") ?? "").trim().slice(0, 60) || name;
    if (!VOICE_NAME.test(name)) return json(res, 400, { error: "bad_name", message: "2-40 characters: a-z, 0-9 and -" });
    if (readLib()[name]) return json(res, 409, { error: "name_taken" });
    let buf: Buffer;
    try { buf = await readRawBody(req, MAX_VOICE_BYTES); } catch { return json(res, 413, { error: "too_large" }); }
    const ext = sniffAudio(buf);
    if (!ext) return json(res, 415, { error: "not_audio", message: "an MP3 or WAV" });
    const lib = readLib();
    lib[name] = { name, label, source: "uploaded", addedAt: Date.now(), ext };
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(fileOf(lib[name]), buf);
    writeLib(lib);
    store.audit(user.id, "survivorz.voice.upload", name);
    json(res, 200, { voice: lib[name] });
  });

  // DESIGN: a description in, three takes out (ElevenLabs Voice Design). Costs credits; nothing is kept
  // until one is chosen.
  router.post("/api/admin/survivorz/voices/design", "admin", async ({ res, body, user, store }) => {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return json(res, 503, { error: "not_configured", message: "ELEVENLABS_API_KEY isn't set on the server" });
    const b = (body ?? {}) as { description?: unknown; text?: unknown };
    const description = String(b.description ?? "").trim().slice(0, 1000);
    if (description.length < 20) return json(res, 400, { error: "too_short", message: "describe the voice in at least 20 characters" });
    // ElevenLabs reads 100-1000 characters aloud for each take
    let text = String(b.text ?? "").trim().slice(0, 1000);
    if (text.length < 100) text = (text ? text + " " : "") + "Keep your voice down. We're not alone in here, and I'm not losing anybody else tonight. Grab what you can carry and stay close to me.";
    sweep();
    try {
      const r = await fetch("https://api.elevenlabs.io/v1/text-to-voice/create-previews", {
        method: "POST",
        headers: { "xi-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({ voice_description: description, text: text.slice(0, 1000) }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!r.ok) return json(res, 502, { error: "elevenlabs", message: (await r.text()).slice(0, 300) });
      const { previews: got } = (await r.json()) as { previews: { audio_base_64: string }[] };
      const out = (got ?? []).slice(0, 3).map((p) => {
        const id = randomUUID();
        previews.set(id, { buf: Buffer.from(p.audio_base_64, "base64"), description, at: Date.now() });
        return { id };
      });
      store.audit(user.id, "survivorz.voice.design", description.slice(0, 120));
      json(res, 200, { takes: out });
    } catch (e) {
      json(res, 502, { error: "elevenlabs", message: String((e as Error).message ?? e).slice(0, 200) });
    }
  });

  router.get("/api/admin/survivorz/voices/take/:id", "admin", ({ res, params }) => {
    const p = previews.get(params.id);
    if (!p) return json(res, 404, { error: "gone" });
    sendAudio(res, p.buf, "mp3");
  });

  router.post("/api/admin/survivorz/voices/keep", "admin", ({ res, body, user, store }) => {
    const b = (body ?? {}) as { take?: unknown; name?: unknown; label?: unknown };
    const p = previews.get(String(b.take ?? ""));
    if (!p) return json(res, 404, { error: "gone", message: "that take has expired; design again" });
    const name = String(b.name ?? "").trim().toLowerCase();
    if (!VOICE_NAME.test(name)) return json(res, 400, { error: "bad_name" });
    const lib = readLib();
    if (lib[name]) return json(res, 409, { error: "name_taken" });
    lib[name] = { name, label: String(b.label ?? "").trim().slice(0, 60) || name, source: "designed", description: p.description, addedAt: Date.now(), ext: "mp3" };
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(fileOf(lib[name]), p.buf);
    writeLib(lib);
    previews.delete(String(b.take));
    store.audit(user.id, "survivorz.voice.keep", name);
    json(res, 200, { voice: lib[name] });
  });

  router.del("/api/admin/survivorz/voices/:name", "admin", ({ res, params, user, store }) => {
    const lib = readLib(), e = lib[params.name];
    if (!e) return json(res, 404, { error: "not_found" });
    const who = usedBy(store)[e.name];
    if (who) return json(res, 409, { error: "in_use", name: who });
    fs.rmSync(fileOf(e), { force: true });
    delete lib[e.name];
    writeLib(lib);
    store.audit(user.id, "survivorz.voice.remove", e.name);
    json(res, 200, { ok: true });
  });

  // A SAMPLE: a line spoken by slopbot's clone in this voice (or the stock voice when it has none)
  router.post("/api/admin/survivorz/voices/sample", "admin", async ({ res, body }) => {
    const b = (body ?? {}) as { text?: unknown; clone?: unknown; kokoro?: unknown };
    const text = String(b.text ?? "").trim().slice(0, 400);
    const clone = String(b.clone ?? "");
    const kokoro = String(b.kokoro ?? "af_heart");
    if (!text) return json(res, 400, { error: "no_text" });
    if (clone && !VOICE_NAME.test(clone)) return json(res, 400, { error: "bad_voice" });
    if (!(KOKORO_VOICES as readonly string[]).includes(kokoro)) return json(res, 400, { error: "bad_stock" });
    if (!agentAlive()) return json(res, 503, { error: "slopbot_away", message: "Slopbot's voices aren't answering right now." });
    const wav = await voiceSample(text, clone, kokoro);
    if (!wav) return json(res, 504, { error: "too_slow", message: "Slopbot didn't voice it in time — try again." });
    sweep();
    const id = randomUUID();
    sampleClips.set(id, { buf: wav, at: Date.now() });
    json(res, 200, { clip: id });
  });

  router.get("/api/admin/survivorz/voices/clip/:id", "admin", ({ res, params }) => {
    const c = sampleClips.get(params.id);
    if (!c) return json(res, 404, { error: "gone" });
    sendAudio(res, c.buf, "wav");
  });

  // ---- slopbot fetches a reference it lacks (the voice agent's secret) ----
  router.get("/api/survivorz/voice-ref/:name", "none", ({ req, res, params }) => {
    const secret = process.env.NPC_AGENT_SECRET ?? "";
    const got = Buffer.from(String(req.headers["x-agent-secret"] ?? ""));
    const want = Buffer.from(secret);
    if (!secret || secret.length < 24 || got.length !== want.length || !timingSafeEqual(got, want)) return json(res, 404, { error: "not_found" });
    const e = readLib()[params.name.replace(/\.(mp3|wav)$/, "")];
    if (!e || !fs.existsSync(fileOf(e))) return json(res, 404, { error: "not_found" });
    sendAudio(res, fs.readFileSync(fileOf(e)), e.ext);
  });

  // ---- slopbot brings the references only it has (the survivors' picked voices) ----
  const agent = (req: { headers: Record<string, string | string[] | undefined> }): boolean => {
    const secret = process.env.NPC_AGENT_SECRET ?? "";
    const got = Buffer.from(String(req.headers["x-agent-secret"] ?? ""));
    const want = Buffer.from(secret);
    return !!secret && secret.length >= 24 && got.length === want.length && timingSafeEqual(got, want);
  };
  router.get("/api/survivorz/voice-lib", "none", ({ req, res }) => {
    if (!agent(req)) return json(res, 404, { error: "not_found" });
    json(res, 200, { names: Object.keys(readLib()) });
  });
  router.postRaw("/api/survivorz/voice-lib", "none", async ({ req, res, url }) => {
    if (!agent(req)) return json(res, 404, { error: "not_found" });
    const name = String(url.searchParams.get("name") ?? "").toLowerCase();
    if (!VOICE_NAME.test(name)) return json(res, 400, { error: "bad_name" });
    if (readLib()[name]) return json(res, 200, { ok: true, had: true });
    let buf: Buffer;
    try { buf = await readRawBody(req, MAX_VOICE_BYTES); } catch { return json(res, 413, { error: "too_large" }); }
    const ext = sniffAudio(buf);
    if (!ext) return json(res, 415, { error: "not_audio" });
    const lib = readLib();
    lib[name] = { name, label: name, source: "workstation", addedAt: Date.now(), ext };
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(fileOf(lib[name]), buf);
    writeLib(lib);
    json(res, 200, { ok: true });
  });

  // ---- the PC's worker brings the references it already has (SURVIVORZ_WORKER_TOKEN) ----
  router.get("/api/survivorz/worker/voices", "none", ({ req, res, url }) => {
    if (!isWorkerToken(bearer(req, url))) return json(res, 401, { error: "unauthorized" });
    json(res, 200, { names: Object.keys(readLib()) });
  });
  router.postRaw("/api/survivorz/worker/voice", "none", async ({ req, res, url }) => {
    if (!isWorkerToken(bearer(req, url))) return json(res, 401, { error: "unauthorized" });
    const name = String(url.searchParams.get("name") ?? "").toLowerCase();
    if (!VOICE_NAME.test(name)) return json(res, 400, { error: "bad_name" });
    if (readLib()[name]) return json(res, 200, { ok: true, had: true });
    let buf: Buffer;
    try { buf = await readRawBody(req, MAX_VOICE_BYTES); } catch { return json(res, 413, { error: "too_large" }); }
    const ext = sniffAudio(buf);
    if (!ext) return json(res, 415, { error: "not_audio" });
    const lib = readLib();
    lib[name] = { name, label: name, source: "workstation", addedAt: Date.now(), ext };
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(fileOf(lib[name]), buf);
    writeLib(lib);
    json(res, 200, { ok: true });
  });
}
