// SURVIVORZ: where every sound stands — how many takes Josh has kept against how many the
// show needs. A kept stretch of a "run" (several footsteps, several drips) is counted as the
// separate sounds it holds, since the final cut splits it. Writes sound/tally.json and prints
// the sounds still short, with Josh's "make more" notes.
//   node scripts/survivorz/sound-tally.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { takes } from "./sound-master.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { SOUND_LIST } = await imp("docs/survivorz/sound-list.mjs");
const { PROMPTS } = await imp("docs/survivorz/sound-prompts.mjs");
const SOUND = path.join(ROOT, "assets", "downloads", "survivorz", "sound");
const GEN = path.join(SOUND, "eleven", "prod");
const PICKS = path.join(SOUND, "picks");

// every kept take across every takes page (later rounds add to earlier ones)
const kept = {}, notes = {}, more = new Set();
for (const f of fs.readdirSync(PICKS).filter((f) => f.startsWith("takes-")).sort()) {
  for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(PICKS, f), "utf8")).picks)) {
    const [id, what] = k.split("|");
    if (what === "note") notes[id] = v;
    else if (what === "more") more.add(id);
    else if (v && typeof v === "object") (kept[id] ??= []).push(v);
  }
}

// does a kept stretch hold several separate sounds that the show plays one at a time?
const SPLIT = (ev) => PROMPTS[ev.id]?.seq && (ev.group === "footsteps" || (ev.maxDur && ev.maxDur <= 3));
function pieces(ev, k) {
  const len = (k.end ?? 999) - k.start;
  if (!SPLIT(ev) || len < 0.9) return [k];
  const tmp = path.join(os.tmpdir(), `tally-${process.pid}.wav`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(k.start), "-t", String(len), "-i", path.join(GEN, k.src), tmp]);
  const parts = takes(tmp, { maxLen: 1.5, minLen: 0.12, gap: 0.1, tail: 34 }).map((t) => ({ src: k.src, start: +(k.start + t.start).toFixed(3), end: +(k.start + t.end).toFixed(3) }));
  fs.rmSync(tmp, { force: true });
  return parts.length ? parts : [k];
}

// sounds that share a pool (one surface's steps at three paces) are counted together: the
// takes kept in any of them serve all of them
const tally = {};
for (const ev of SOUND_LIST) {
  const key = ev.pool || ev.id;
  const list = (kept[ev.id] || []).flatMap((k) => pieces(ev, k));
  const t = (tally[key] ??= { group: ev.group, need: ev.takes, have: 0, takes: [], more: false, note: "", from: [] });
  t.takes.push(...list); t.have = t.takes.length; t.from.push(ev.id);
  if (more.has(ev.id)) t.more = true;
  if (notes[ev.id]) t.note = [t.note, notes[ev.id]].filter(Boolean).join(" / ");
}
fs.writeFileSync(path.join(SOUND, "tally.json"), JSON.stringify(tally, null, 1));
const short = Object.entries(tally).filter(([, t]) => t.have < t.need || t.more);
const done = Object.keys(tally).length - short.length;
console.log(`${done} of ${Object.keys(tally).length} sounds have enough takes · ${short.length} still need work:`);
for (const [id, t] of short) console.log(`  ${id.padEnd(22)} ${String(t.have).padStart(2)} of ${t.need}${t.more ? "  MAKE MORE" : ""}${t.note ? `  "${t.note}"` : ""}`);
