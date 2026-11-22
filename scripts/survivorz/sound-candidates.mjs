// SURVIVORZ: for every event in docs/survivorz/sound-list.mjs, finds the indexed sound files
// (assets/downloads/survivorz/sound/index.json) that ARE that sound. Two stages:
//   1. RECALL — rank every file by the event's search words over its file name, its folders
//      and its library, inside the event's duration limits, and keep a wide pool.
//   2. JUDGE — the house's local 26B model reads each pooled name against what the sound is
//      (docs/survivorz/sound-what.mjs) and scores 0-10 how surely the names say it is that
//      sound. Only names are read; nothing is listened to or uploaded. Verdicts are cached
//      in sound/judged.json, so a re-run only judges what's new.
// Keeps the best few that pass, no more than two from one library. Writes sound/candidates.json.
//   node scripts/survivorz/sound-candidates.mjs [--only group,group] [--per 6] [--pool 60]
import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { SOUND_LIST } = await imp("docs/survivorz/sound-list.mjs");
const { WHAT } = await imp("docs/survivorz/sound-what.mjs");
const { DROP, ADD } = await imp("docs/survivorz/sound-curation.mjs");
const SOUND = path.join(ROOT, "assets", "downloads", "survivorz", "sound");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PER = Number(arg("--per", 6));
const POOL = Number(arg("--pool", 120));
const ONLY = arg("--only", "") ? arg("--only").split(",") : null;
const PASS = 7;
const OLLAMA = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const MODEL = process.env.JUDGE_MODEL || "gemma4:26b-a4b-it-qat";
const CTX = 16384;   // what the engine is loaded at: any other value makes Ollama reload it

const index = JSON.parse(fs.readFileSync(path.join(SOUND, "index.json"), "utf8")).filter((r) => r.dur > 0);
const norm = (s) => ` ${String(s).toLowerCase().replace(/[_\-.,()[\]&/\\]+/g, " ").replace(/\s+/g, " ")} `;
// the folders between the library and the file: Sonniss libraries sort by subject in them
function folders(r) {
  const p = r.path.replace(/\\/g, "/");
  const m = p.match(/sonnis\/[^/]+\/[^/]+\/(.*)\/[^/]+$/i);
  if (m) return m[1].replace(/\//g, " / ");
  return p.split("/").slice(-3, -1).join(" / ");
}
const rows = index.map((r) => { const f = folders(r); return { ...r, folder: f, n: norm(r.name), f: norm(f), l: norm(r.library) }; });

const JUDGED = path.join(SOUND, "judged.json");
const judged = fs.existsSync(JUDGED) ? JSON.parse(fs.readFileSync(JUDGED, "utf8")) : {};
const saveJudged = () => fs.writeFileSync(JUDGED, JSON.stringify(judged));

function recall(ev) {
  const words = ev.q.map((w) => w.toLowerCase());
  const nots = (ev.not || []).map((w) => w.toLowerCase());
  const scored = [];
  for (const r of rows) {
    if (ev.maxDur && r.dur > (ev.maxFile || Math.max(ev.maxDur * 6, 30))) continue;   // a long take can be cut down, but not a 5-minute file for a click
    if (ev.minDur && r.dur < ev.minDur) continue;
    if (nots.some((w) => r.n.includes(` ${w}`) || r.f.includes(` ${w}`))) continue;
    let s = 0;
    for (const w of words) {
      if (r.n.includes(` ${w} `) || r.n.includes(` ${w}s `)) s += 3;
      else if (r.n.includes(` ${w}`)) s += 2;
      if (r.f.includes(` ${w}`)) s += 1.5;
      if (r.l.includes(` ${w}`)) s += 1;
    }
    if (s < 2) continue;
    if (ev.maxDur && r.dur <= ev.maxDur) s += 0.5;
    scored.push({ s, r });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, POOL).map((x) => x.r);
}

// a verdict is for one wording of the sound: rewording it re-judges
const key = (ev) => `${ev.id}#${createHash("sha1").update(WHAT[ev.id]).digest("hex").slice(0, 8)}`;

async function judge(ev, pool) {
  const todo = pool.filter((r) => judged[`${key(ev)}|${r.path}`] === undefined);
  for (let i = 0; i < todo.length; i += 30) {
    const chunk = todo.slice(i, i + 30);
    const list = chunk.map((r, k) => `${k}. file "${r.name}" | folder "${r.folder}" | library "${r.library}" | ${r.dur}s`).join("\n");
    const prompt = `You are sorting a sound effects library for a zombie survival show. The sound needed is:\n\n"${WHAT[ev.id]}"\n\n` +
      `For each file below, judging ONLY from its file name, folder and library, score 0-10 how sure you are that the file IS that sound.\n` +
      `10 = the names clearly say it is exactly this. 7 = very likely this. 4 = possibly, names are vague. 0 = it's a different sound (a different object, action, creature, weapon, surface, or music where an effect is needed, or the reverse).\n` +
      `Be strict: a file that only shares a word (e.g. "breath" from a human, "shot" from a camera, "door" from a car) is 0-2.\n\n${list}`;
    const body = { model: MODEL, stream: false, think: false, options: { num_ctx: CTX, temperature: 0, num_predict: 1500 },
      format: { type: "object", properties: { scores: { type: "array", items: { type: "object", properties: { i: { type: "integer" }, score: { type: "integer" } }, required: ["i", "score"] } } }, required: ["scores"] },
      messages: [{ role: "user", content: prompt }] };
    let out;
    for (let tries = 0; tries < 3 && !out; tries++) {
      try {
        const res = await fetch(`${OLLAMA}/api/chat`, { signal: AbortSignal.timeout(90000), method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        out = JSON.parse((await res.json()).message.content).scores;
      } catch (e) { if (tries === 2) throw e; }
    }
    for (const { i: k, score } of out) if (chunk[k]) judged[`${key(ev)}|${chunk[k].path}`] = score;
    for (const r of chunk) if (judged[`${key(ev)}|${r.path}`] === undefined) judged[`${key(ev)}|${r.path}`] = 0;
    saveJudged();
  }
}

const CAND = path.join(SOUND, "candidates.json");
const out = fs.existsSync(CAND) && ONLY ? JSON.parse(fs.readFileSync(CAND, "utf8")) : {};
const events = SOUND_LIST.filter((e) => !ONLY || ONLY.includes(e.group));
const usedBy = {};
for (const ev of events) {
  const pool = recall(ev);
  await judge(ev, pool);
  const ranked = pool.map((r) => ({ r, j: judged[`${key(ev)}|${r.path}`] ?? 0 }))
    .filter((x) => x.j >= PASS && !(DROP[ev.id] || []).some((d) => x.r.name.includes(d)))
    .sort((a, b) => b.j - a.j
      || (b.r.rate >= 44100) - (a.r.rate >= 44100)
      || (/\.(wav|flac|aiff?)$/i.test(b.r.path)) - (/\.(wav|flac|aiff?)$/i.test(a.r.path))
      || (b.r.source === "sonniss*") - (a.r.source === "sonniss*"));
  // a file already offered for another sound in the same group comes last, so each list
  // shows something new; it's only used to fill a list that would otherwise be short
  const used = (usedBy[ev.group] ??= new Set());
  const order = [...ranked.filter((x) => !used.has(x.r.path)), ...ranked.filter((x) => used.has(x.r.path))];
  const picks = [], libs = new Map();
  for (const { r, j } of order) {
    const n = libs.get(r.library) || 0;
    if (n >= 2) continue;
    if (used.has(r.path) && picks.length >= 3) continue;
    if (picks.some((p) => p.name === r.name && p.dur === r.dur)) continue;   // the same file shipped in two libraries
    libs.set(r.library, n + 1);
    picks.push({ judge: j, path: r.path, name: r.name, folder: r.folder, library: r.library, source: r.source.replace("*", ""), licence: r.licence, credit: r.credit, dur: r.dur, ch: r.ch, rate: r.rate });
    if (picks.length >= PER) break;
  }
  for (const want of ADD[ev.id] || []) {
    const r = rows.find((x) => x.name.includes(want));
    if (r && !picks.some((p) => p.path === r.path)) picks.push({ judge: "hand", path: r.path, name: r.name, folder: r.folder, library: r.library, source: r.source.replace("*", ""), licence: r.licence, credit: r.credit, dur: r.dur, ch: r.ch, rate: r.rate });
  }
  for (const p of picks) used.add(p.path);
  out[ev.id] = { ...ev, what: WHAT[ev.id], candidates: picks, pooled: pool.length, passed: ranked.length };
  console.log(`${ev.id.padEnd(22)} pool ${String(pool.length).padStart(2)} · passed ${String(ranked.length).padStart(2)} · kept ${picks.length}`);
}
fs.writeFileSync(CAND, JSON.stringify(out, null, 1));
const thin = events.filter((e) => out[e.id].candidates.length < 3);
console.log(`\n${events.length} events · ${events.reduce((a, e) => a + out[e.id].candidates.length, 0)} candidates · ${thin.length} with fewer than 3: ${thin.map((e) => e.id).join(", ")}`);
