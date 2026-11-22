// SOLACE SURVIVORZ — THE CHARACTER CREATOR (phase 5; Josh, Nov 2026: "a character creator software to
// make sure that process of making characters becomes easier and easier").
//
//   npm run build && node scripts/survivorz/creator.mjs        → http://localhost:8795
//
// A local page (never on the server) for making and changing the show's characters. A character is one
// file, src/survivorz/cast/<id>.json; this page writes it, checks it with the SAME rules the server boots
// with (src/survivorz/cast/rules.ts), regenerates the two files built from the cast (files.ts, the list the
// server imports, and public.json, the half the page may read), and lets you HEAR the character: a test
// line from the real model, through the show's own checks, before anything ships.
//
// What it can't do, and says so on save: bake a new body (scripts/survivorz anim pipeline), put a cloned
// voice on slopbot (design-voice.mjs → /data/solace-ai/models/voices/<clone>.mp3), or deploy. And a new
// character waits on the bench until Josh brings them in.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ROOT, rules, readCast, tidy, check as checkWith, saveCharacter } from "./castfiles.mjs";

// the harness points these at a copy (test_survivorz_cast.mjs); the rules always come from the repo
const CAST_DIR = process.env.CREATOR_CAST_DIR ?? path.join(ROOT, "src/survivorz/cast");
const BODY_DIR = process.env.CREATOR_BODY_DIR ?? path.join(ROOT, "assets/downloads/survivorz/game");
const BIBLE_DIR = path.join(ROOT, "docs/survivorz/cast");
const PORT = Number(process.env.CREATOR_PORT ?? 8795);
// the house engine on this PC (prod's "big" slot): asked at production's window, or Ollama reloads the live model
const OLLAMA = process.env.CREATOR_OLLAMA ?? "http://127.0.0.1:11434";
const MODEL = process.env.CREATOR_MODEL ?? "gemma4:26b-a4b-it-qat";
const NUM_CTX = Number(process.env.CREATOR_CTX ?? 16384);

const require = createRequire(import.meta.url);
let talk = null;
try {
  talk = {
    sheets: require(path.join(ROOT, "dist/survivorz/talk/sheets.js")),
    lines: require(path.join(ROOT, "dist/survivorz/talk/lines.js")),
    model: require(path.join(ROOT, "dist/survivorz/talk/model.js")),
    genes: require(path.join(ROOT, "dist/survivorz/genes.js")),
  };
} catch (e) {
  console.log(`[creator] no build (${e.message.split("\n")[0]}) — "hear them" is off until npm run build`);
}

function bodies() {
  try { return fs.readdirSync(BODY_DIR).filter((f) => f.endsWith(".glb") && !f.startsWith("zombie-")).map((f) => f.slice(0, -4)).sort(); }
  catch { return []; }
}
function bible(id) {
  try { return fs.readFileSync(path.join(BIBLE_DIR, `${id}.md`), "utf8"); } catch { return null; }
}
const check = (c, cast) => checkWith(c, cast, bodies());

function send(res, code, body, type = "application/json") {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}
async function readBody(req) {
  let s = "";
  for await (const chunk of req) { s += chunk; if (s.length > 200_000) throw new Error("too big"); }
  return s ? JSON.parse(s) : {};
}

async function hear(c, situation) {
  if (!talk) return { error: "build first (npm run build)" };
  const ep = { name: "big", url: OLLAMA, model: MODEL, numCtx: NUM_CTX };
  const model = talk.model.endpointModel(ep);
  const world = talk.sheets.worldOf();
  const genome = Object.entries(c.genes).map(([g, v]) => `${g} ${v}`).join(", ");
  const system = [c.sheet, "", world, "", talk.sheets.RULES, "", `YOUR NATURE (0-10): ${genome}.`].join("\n");
  const user = [
    "FACTS:\n- You're in the safe room with the others.",
    `WHAT JUST HAPPENED: ${situation}`,
    "Say your line now — only the words you say out loud.",
  ].join("\n\n");
  const t0 = Date.now();
  const line = await talk.lines.writeChecked(model, system, user, c.name, [], 30_000);
  return { line, ms: Date.now() - t0, note: line ? "" : "nothing passed the show's checks (or the model is off — solace-gpu.ps1 -Pause stops it)" };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      return send(res, 200, fs.readFileSync(path.join(ROOT, "scripts/survivorz/creator.html"), "utf8"), "text/html; charset=utf-8");
    }
    if (req.method === "GET" && url.pathname === "/api/cast") {
      const cast = readCast(CAST_DIR);
      return send(res, 200, {
        cast: cast.sort((a, b) => a.order - b.order),
        bodies: bodies(),
        bibles: Object.fromEntries(cast.map((c) => [c.id, bible(c.id) !== null])),
        vocab: {
          genes: rules.GENE_KEYS, geneBase: rules.GENE_BASE, melee: rules.MELEE_IDS, guns: rules.GUN_IDS, kokoro: rules.KOKORO_VOICES,
          limits: rules.LIMITS, geneMeans: talk?.genes.GENE_MEANS ?? {},
          skills: rules.SKILL_KEYS, skillInfo: rules.SKILL_INFO, skillGroups: rules.SKILL_GROUPS, skillBudget: rules.SKILL_BUDGET,
        },
        canHear: !!talk,
      });
    }
    if (req.method === "GET" && url.pathname === "/api/bible") {
      const id = url.searchParams.get("id") ?? "";
      if (!/^[a-z]{2,16}$/.test(id)) return send(res, 400, { error: "bad id" });
      return send(res, 200, { text: bible(id) });
    }
    if (req.method === "POST" && url.pathname === "/api/check") {
      const { char } = await readBody(req);
      return send(res, 200, check(tidy(char), readCast(CAST_DIR)));
    }
    if (req.method === "POST" && url.pathname === "/api/save") {
      const { char, regardIn } = await readBody(req);
      const c = tidy(char);
      const r = saveCharacter(CAST_DIR, c, regardIn, bodies());
      if (!r.ok) return send(res, 400, r);
      const next = [];
      if (!bodies().includes(c.body)) next.push(`Bake the body "${c.body}" (assets/downloads/survivorz/game/${c.body}.glb) — see SURVIVORZ.md §10.`);
      if (c.voice.clone) next.push(`Put the voice on slopbot: /data/solace-ai/models/voices/${c.voice.clone}.mp3 (design it with scripts/rollo/design-voice.mjs; Josh picks the take).`);
      if (!bible(c.id)) next.push(`Write their bible, docs/survivorz/cast/${c.id}.md (where the sheet comes from).`);
      next.push("Run npm run build && node scripts/checks/test_survivorz_cast.mjs, then commit and deploy.");
      if (c.status === "bench") next.push("They wait on the bench until Josh brings them in (Admin Panel → Survivorz → Bring in).");
      if (c.status === "cast") next.push("On the cast they walk in at the NEXT fresh run, not the one on air.");
      return send(res, 200, { ok: true, saved: r.saved, warnings: r.warnings, next });
    }
    if (req.method === "POST" && url.pathname === "/api/hear") {
      const { char, situation } = await readBody(req);
      const s = String(situation ?? "").slice(0, 300) || "Rick asks the group who wants to take first watch.";
      return send(res, 200, await hear(tidy(char), s));
    }
    send(res, 404, { error: "not found" });
  } catch (e) {
    send(res, 500, { error: String(e?.message ?? e) });
  }
});
server.listen(PORT, "127.0.0.1", () => console.log(`[creator] http://localhost:${PORT}  (cast: ${readCast(CAST_DIR).length} characters, bodies: ${bodies().join(", ") || "none found"})`));
