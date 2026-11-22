// THE HOUSE SOUNDBOARD — the shared library over HTTP (Aug 2026, migration 73).
//
// Run:  npm run build && node scripts/checks/test_soundboard.mjs
//
// Drives a REAL server on a throwaway port. Not a money path, but it's an
// upload surface and a shared resource, so it gets the guard treatment:
//   · the library is member-visible (and 401 to the world)
//   · uploads are magic-byte sniffed (415), size-capped (413), name-required
//   · the per-user cap refuses the 9th sound (409) and nothing lands
//   · everyone sees everyone's sounds, with the owner's name attached
//   · delete is owner-or-staff: a bystander is 403'd, the owner and an
//     admin both succeed, and the FILE leaves the disk with the row
//   · the retired board1-3 personal slots refuse (400 bad_slot)

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync, readdirSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8503;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "soundboard-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  x " + name); } else console.log("  + " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ADMIN_PW = "Harness!Admin9xy";
const srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
  env: {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR,
    ADMIN_PASSWORD: ADMIN_PW,
    ALLOW_REGISTRATION: "true",
    REQUIRE_INVITE: "false",
    LIVEKIT_URL: "",
    LIVEKIT_API_KEY: "",
    LIVEKIT_API_SECRET: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let bootLog = "";
srv.stdout.on("data", (d) => { bootLog += d; });
srv.stderr.on("data", (d) => { bootLog += d; });
const stop = () => { try { srv.kill("SIGINT"); } catch {} };
process.on("exit", stop);

const api = async (method, url, { token, body } = {}) => {
  const headers = {};
  if (token) headers.authorization = "Bearer " + token;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(BASE + url, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
};

// A minimal valid-by-magic WAV: RIFF....WAVE + padding.
const wavBytes = (size = 64) => {
  const b = Buffer.alloc(Math.max(12, size));
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVE", 8, "ascii");
  return b;
};

const uploadBoard = async (token, bytes, { name = "", emoji = "" } = {}) => {
  const qs = new URLSearchParams();
  if (name) qs.set("name", name);
  if (emoji) qs.set("emoji", emoji);
  const res = await fetch(`${BASE}/api/soundboard?${qs}`, {
    method: "POST",
    headers: { authorization: "Bearer " + token, "content-type": "application/octet-stream" },
    body: bytes,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
};

let secretSeq = 0;
const register = async (username, password) => {
  const secret = `vault marmalade lantern ${["quartz", "thistle", "harbour", "ember"][secretSeq++ % 4]} 47`;
  const r = await api("POST", "/api/register", { body: { username, password, displayName: username, secret, acceptTerms: true } });
  return { token: r.body?.token ?? null, id: r.body?.user?.id ?? null };
};

const soundFiles = () => {
  try { return readdirSync(path.join(DATA_DIR, "uploads", "sounds")); } catch { return []; }
};

const run = async () => {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(BASE + "/health"); if (r.ok) break; } catch {}
    await sleep(250);
  }

  const pw = "Sturdy!Passw0rd#9";
  const admin = (await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } })).body?.token;
  ok(!!admin, "admin signed in");
  const a = await register("padmaker", pw);
  const b = await register("bystander", pw);
  ok(!!a.token && !!b.token, "two members registered");

  // The empty library, and the door.
  const anon = await api("GET", "/api/soundboard");
  ok(anon.status === 401, "anonymous library read refused (401)");
  const empty = await api("GET", "/api/soundboard", { token: a.token });
  ok(empty.status === 200 && Array.isArray(empty.body.sounds) && empty.body.sounds.length === 0,
    "library starts empty");
  ok(empty.body.max >= 1 && empty.body.mine === 0, "cap + own count on the wire");

  // Upload guards, each proven to land nothing.
  const junk = await uploadBoard(a.token, Buffer.from("definitely not audio, just text bytes here"), { name: "junk" });
  ok(junk.status === 415, "non-audio bytes refused (415)");
  const noname = await uploadBoard(a.token, wavBytes(), {});
  ok(noname.status === 400 && noname.body?.error === "bad_name", "missing name refused (400)");
  // Oversize: the server may answer 413 or just cut the connection mid-body —
  // either way the refusal is what we're proving (plus "nothing landed" below).
  let hugeRefused = false;
  try {
    const huge = await uploadBoard(a.token, wavBytes(500_000), { name: "toolarge" });
    hugeRefused = huge.status === 413;
  } catch {
    hugeRefused = true; // connection reset mid-upload = refused
  }
  ok(hugeRefused, "oversize refused (413 or reset)");
  const after = await api("GET", "/api/soundboard", { token: a.token });
  ok(after.body.sounds.length === 0 && soundFiles().length === 0, "every refusal landed nothing");

  // A real upload, visible to everyone with the owner's name on it.
  const up = await uploadBoard(a.token, wavBytes(), { name: "Air Horn", emoji: "📯" });
  ok(up.status === 200 && up.body.mine === 1, "valid WAV accepted");
  const asB = await api("GET", "/api/soundboard", { token: b.token });
  ok(asB.body.sounds.length === 1, "the library is shared — B sees A's sound");
  const row = asB.body.sounds[0];
  ok(row.name === "Air Horn" && row.emoji === "📯" && row.owner === "padmaker",
    "name, emoji and owner ride the row");
  ok(soundFiles().length === 1, "the file landed on disk");

  // The per-user cap.
  for (let i = 2; i <= 8; i++) {
    await uploadBoard(a.token, wavBytes(), { name: `Pad ${i}` });
  }
  const full = await api("GET", "/api/soundboard", { token: a.token });
  ok(full.body.mine === 8 && full.body.sounds.length === 8, "eight sounds in");
  const ninth = await uploadBoard(a.token, wavBytes(), { name: "One Too Many" });
  ok(ninth.status === 409 && ninth.body?.error === "board_full", "the 9th refuses (409 board_full)");
  ok(soundFiles().length === 8, "the refused 9th left no file behind");

  // Delete authority: bystander no, owner yes, staff yes.
  const target = full.body.sounds.find((s) => s.name === "Air Horn");
  const theft = await api("DELETE", `/api/soundboard/${target.id}`, { token: b.token });
  ok(theft.status === 403, "a bystander cannot delete someone else's sound (403)");
  const own = await api("DELETE", `/api/soundboard/${target.id}`, { token: a.token });
  ok(own.status === 200 && own.body.sounds.length === 7, "the owner deletes their own");
  await sleep(300); // the unlink is fire-and-forget async — let it land
  ok(soundFiles().length === 7, "…and the file leaves the disk with the row");
  const pad2 = own.body.sounds.find((s) => s.name === "Pad 2");
  const staffDel = await api("DELETE", `/api/soundboard/${pad2.id}`, { token: admin });
  ok(staffDel.status === 200 && staffDel.body.sounds.length === 6, "an admin deletes anyone's");
  const ghost = await api("DELETE", `/api/soundboard/${target.id}`, { token: a.token });
  ok(ghost.status === 404, "a deleted id is gone (404)");

  // The retired personal board slots refuse — pads live in the library now.
  const legacy = await fetch(`${BASE}/api/me/sounds/board1?name=old`, {
    method: "POST",
    headers: { authorization: "Bearer " + a.token, "content-type": "application/octet-stream" },
    body: wavBytes(),
  });
  ok(legacy.status === 400, "the retired board1 slot refuses (400 bad_slot)");
  // …while enter/leave still work.
  const enter = await fetch(`${BASE}/api/me/sounds/enter?name=hello`, {
    method: "POST",
    headers: { authorization: "Bearer " + a.token, "content-type": "application/octet-stream" },
    body: wavBytes(),
  });
  ok(enter.status === 200, "the personal enter sound still uploads");

  console.log(`\n${n - bad}/${n} soundboard asserts passed`);
  stop();
  await sleep(300);
  process.exit(bad === 0 ? 0 : 1);
};

run().catch((e) => {
  console.error("harness crashed:", e, "\nserver log tail:\n" + bootLog.slice(-2000));
  stop();
  process.exit(1);
});
