// SOLACE SURVIVORZ — THE BUNKER: one simulated run drawn on the map (step 3's review, for Josh).
//   npm run build && node scripts/survivorz/bunker/runmap.mjs --seed 3 [--seed 7 …] [--out docs/survivorz/plans]
// → bunker-run-<seed>.png: every survivor's track in their colour, where each died, where the dead were put down,
// and the objectives' moments (the door sealed, the code, the part, the radio fixed, the call) with their times;
// beside it, the run's timeline.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const { SimWorld } = require(path.join(ROOT, "dist/survivorz/sim/world.js"));
const { BUNKER } = require(path.join(ROOT, "dist/survivorz/bunker-map.js"));
const { doorPlacement } = require(path.join(ROOT, "dist/survivorz/facility.js"));

const seeds = []; for (let i = 0; i < process.argv.length; i++) if (process.argv[i] === "--seed") seeds.push(Number(process.argv[i + 1]));
if (!seeds.length) seeds.push(3);
const oi = process.argv.indexOf("--out");
const OUT = path.join(ROOT, oi > 0 ? process.argv[oi + 1] : "docs/survivorz/plans");

const S = 11, OX = 30, OY = 80, W = 1500, H = 1020;
const px = (m) => OX + m * S, py = (m) => OY + m * S;
const COL = { rick: "#ff6b5e", sarah: "#7fd4ff", dale: "#8be08b", johanna: "#ffd166", ben: "#c792ea", rollo: "#4da3ff" };
const ZONE = { entrance: "#3b2a2a", commons: "#2b322e", dorms: "#2c3a33", command: "#2c3446", utility: "#30343b" };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const mm = (ms) => { const m = Math.floor(ms / 60_000), s = Math.floor((ms % 60_000) / 1000); return `${m}:${String(s).padStart(2, "0")}`; };

for (const seed of seeds) {
  const w = new SimWorld({ seed, start: 1_800_000_000_000, stepMs: 100 });
  const t0 = w.startedAt;
  const tracks = new Map(w.survivors.map((s) => [s.who, [[s.x, s.z]]]));
  const marks = [];   // { x, z, kind, label, t, who }
  const timeline = [];
  const name = (id) => (id ? String(id).replace(/^s:/, "") : "");
  w.onFrame((f) => {
    if (f.type !== "ev") return;
    const t = f.t - t0, at = f.at;
    const add = (kind, label, who) => { if (at) marks.push({ x: at[0], z: at[2], kind, label, t, who }); timeline.push({ t, text: label, who }); };
    switch (f.event) {
      case "survivor.dead": add("dead", `${name(f.victim)} died (${f.cause})`, name(f.victim)); break;
      case "survivor.down": timeline.push({ t, text: `${name(f.victim)} went down`, who: name(f.victim) }); break;
      case "survivor.revived": timeline.push({ t, text: `${name(f.by)} revived ${name(f.victim)}`, who: name(f.by) }); break;
      case "survivor.bitten": timeline.push({ t, text: `${name(f.victim)} was bitten`, who: name(f.victim) }); break;
      case "survivor.meet": timeline.push({ t, text: `${name(f.by)} met ${name(f.victim)}`, who: name(f.by) }); break;
      case "zombie.death": if (at) marks.push({ x: at[0], z: at[2], kind: "kill", t }); break;
      case "crank.start": add("obj", `${name(f.by)} started cranking the blast door`, name(f.by)); break;
      case "door.sealed": timeline.push({ t, text: `the blast door is SEALED (${name(f.by)})`, who: name(f.by) }); break;
      case "keycard.found": add("obj", `${name(f.by)} found the armory keycard`, name(f.by)); break;
      case "door.keycard": timeline.push({ t, text: `${name(f.by)} opened the armory`, who: name(f.by) }); break;
      case "note.read": add("obj", `${name(f.by)} found the radio room's code`, name(f.by)); break;
      case "keypad.ok": timeline.push({ t, text: `${name(f.by)} opened the radio room`, who: name(f.by) }); break;
      case "part.found": add("obj", `${name(f.by)} found the radio part`, name(f.by)); break;
      case "radio.fixed": timeline.push({ t, text: `${name(f.by)} got the radio working`, who: name(f.by) }); break;
      case "radio.call": add("obj", `${name(f.by)} called for rescue`, name(f.by)); break;
      case "bunker.clear": timeline.push({ t, text: `the bunker is CLEAR${f.last ? ` (last kill: ${f.last})` : ""}` }); break;
      case "show.over": timeline.push({ t, text: f.ending === "rescued" ? `RESCUED — ${f.rescued.join(", ")}` : f.ending === "wiped" ? "NO SURVIVORS" : "NO RESCUE CAME" }); break;
    }
  });
  let last = 0;
  while (!w.overAt && w.t - t0 < 3_600_000) {
    w.tick(2000);
    for (const s of w.survivors) if (s.alive) { const tr = tracks.get(s.who); const p = tr[tr.length - 1]; if (Math.hypot(p[0] - s.x, p[1] - s.z) > 0.4) tr.push([s.x, s.z]); }
    last = w.t - t0;
  }
  const o = w.obj;
  const svg = [];
  svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Segoe UI, Arial, sans-serif">`);
  svg.push(`<rect width="${W}" height="${H}" fill="#14171c"/>`);
  const ending = o.ending === "rescued" ? "RESCUED" : o.ending === "wiped" ? "NO SURVIVORS" : o.ending === "timeout" ? "NO RESCUE CAME" : "still running";
  svg.push(`<text x="${OX}" y="36" fill="#e8e3d6" font-size="24" font-weight="700">Simulated run — seed ${seed} — ${ending} at ${mm(o.endedAt ? o.endedAt - t0 : last)}</text>`);
  svg.push(`<text x="${OX}" y="60" fill="#9aa3ad" font-size="14">Game code only (no AI). Lines: each survivor's path · ✕ where the dead were put down · ☠ deaths · ◆ objectives. Code note in ${esc(o.noteSpot)}, radio part in ${esc(o.partSpot)}.</text>`);
  for (const r of BUNKER.rooms) {
    svg.push(`<rect x="${px(r.rect.x)}" y="${py(r.rect.y)}" width="${r.rect.w * S}" height="${r.rect.h * S}" fill="${r.kind === "exit" ? "#0d1014" : ZONE[r.zone] ?? "#262a30"}" stroke="#5a5f66" stroke-width="1.5"/>`);
    if (r.rect.w * r.rect.h > 40) svg.push(`<text x="${px(r.rect.x + r.rect.w / 2)}" y="${py(r.rect.y + r.rect.h / 2) + 4}" fill="#6f7680" font-size="${r.rect.w > 8 ? 12 : 9}" text-anchor="middle">${esc(r.name.replace(/ (Room|Hall|Passage)$/, ""))}</text>`);
  }
  for (const d of BUNKER.doors) {
    const p = doorPlacement(BUNKER, d.id); if (!p) continue;
    const c = d.kind === "vault" ? "#ff2d2d" : d.kind === "keycard" ? "#ff5a4f" : d.kind === "keypad" ? "#ffae3d" : d.kind === "doorway" ? "#3e4450" : "#8a9099";
    const tx = -p.normal[2], tz = p.normal[0], half = p.size[0] / 2;
    svg.push(`<line x1="${px(p.centre[0] - tx * half)}" y1="${py(p.centre[2] - tz * half)}" x2="${px(p.centre[0] + tx * half)}" y2="${py(p.centre[2] + tz * half)}" stroke="${c}" stroke-width="4"/>`);
  }
  for (const m of marks.filter((x) => x.kind === "kill")) svg.push(`<text x="${px(m.x)}" y="${py(m.z) + 4}" fill="#8a4a44" font-size="11" text-anchor="middle">✕</text>`);
  for (const [who, tr] of tracks) {
    if (tr.length < 2) continue;
    svg.push(`<polyline points="${tr.map(([x, z]) => `${px(x).toFixed(1)},${py(z).toFixed(1)}`).join(" ")}" fill="none" stroke="${COL[who] ?? "#ccc"}" stroke-width="1.3" stroke-opacity="0.55" stroke-linejoin="round"/>`);
    svg.push(`<circle cx="${px(tr[0][0])}" cy="${py(tr[0][1])}" r="5" fill="${COL[who] ?? "#ccc"}"/>`);
  }
  for (const m of marks.filter((x) => x.kind === "obj")) svg.push(`<text x="${px(m.x)}" y="${py(m.z) + 6}" fill="#ffe08a" font-size="18" text-anchor="middle">◆</text>`);
  for (const m of marks.filter((x) => x.kind === "dead")) svg.push(`<text x="${px(m.x)}" y="${py(m.z) + 7}" fill="${COL[m.who] ?? "#fff"}" font-size="20" text-anchor="middle">☠</text>`);
  // legend
  let ly = OY;
  const LX = px(86);
  svg.push(`<text x="${LX}" y="${ly}" fill="#e8e3d6" font-size="16" font-weight="700">The survivors</text>`); ly += 22;
  for (const s of w.survivors) { svg.push(`<rect x="${LX}" y="${ly - 11}" width="14" height="14" fill="${COL[s.who] ?? "#ccc"}"/><text x="${LX + 22}" y="${ly}" fill="#d6d1c4" font-size="14">${esc(s.who[0].toUpperCase() + s.who.slice(1))} — ${s.alive ? "alive" : "dead (" + esc(s.cause) + ")"}</text>`); ly += 20; }
  ly += 14;
  svg.push(`<text x="${LX}" y="${ly}" fill="#e8e3d6" font-size="16" font-weight="700">What happened</text>`); ly += 22;
  const keep = timeline.filter((e) => !/met /.test(e.text) || timeline.indexOf(e) < 40).sort((a, b) => a.t - b.t);
  for (const e of keep.slice(0, 34)) {
    svg.push(`<text x="${LX}" y="${ly}" fill="#9aa3ad" font-size="12">${mm(e.t)}</text><text x="${LX + 46}" y="${ly}" fill="${e.who && COL[e.who] ? COL[e.who] : "#e8e3d6"}" font-size="12">${esc(e.text)}</text>`);
    ly += 17;
  }
  svg.push(`</svg>`);
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `bunker-run-${seed}.png`);
  await sharp(Buffer.from(svg.join("\n"))).png().toFile(file);
  console.log(`seed ${seed}: ${ending} → ${path.relative(ROOT, file)}`);
}
