// SURVIVORZ: a BLIND comparison page — for each sound, Josh's library picks against the
// ElevenLabs takes, both put through the same mastering chain (sound-master.mjs) so level
// and trimming can't decide it. The two sides are shown as A and B in an order shuffled per
// sound; "Show which is which" reveals them after he has chosen.
//   node scripts/survivorz/sound-compare.mjs <set> <picks.json>
//   -> assets/downloads/survivorz/sound/review/<set>/index.html
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { takes, master } from "./sound-master.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { ELEVEN } = await imp("docs/survivorz/sound-eleven.mjs");
const { SOUND_LIST } = await imp("docs/survivorz/sound-list.mjs");
const { WHAT } = await imp("docs/survivorz/sound-what.mjs");
const [set, picksFile] = process.argv.slice(2);
if (!set || !picksFile) throw new Error("usage: sound-compare.mjs <set> <picks.json>");
const picks = JSON.parse(fs.readFileSync(picksFile, "utf8")).picks;
const SOUND = path.join(ROOT, "assets", "downloads", "survivorz", "sound");
const GEN = path.join(SOUND, "eleven", set);
const DIR = path.join(SOUND, "review", set);
for (const f of fs.existsSync(path.join(DIR, "clips")) ? fs.readdirSync(path.join(DIR, "clips")) : []) fs.rmSync(path.join(DIR, "clips", f), { force: true });
fs.mkdirSync(path.join(DIR, "clips"), { recursive: true });

const HANDLING = /dryfire|mag|slide|bolt|pump|load|casing/;
const targetOf = (id) => id.startsWith("gun-") ? (HANDLING.test(id) ? -18 : -12) : -16;
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

const sections = [];
for (const [key, g] of Object.entries(ELEVEN)) {
  if (g.set !== set) continue;
  const id = key.split("#")[0];   // a re-rolled sound is "<id>#<round>"
  const ev = SOUND_LIST.find((e) => e.id === id);
  const maxLen = Math.min(ev?.maxDur || 8, 8);
  const lib = [];
  for (const [k, file] of Object.entries(picks)) {
    if (!k.startsWith(`${id}|`) || typeof file !== "string") continue;
    // two takes from each picked file: a long file is many separate sounds
    for (const t of takes(file, { maxLen, minLen: 0.35 }).slice(0, 2)) {
      const rel = `clips/${id}-lib-${lib.length}.mp3`;
      master(file, path.join(DIR, rel), { start: t.start, end: t.end, target: targetOf(id) });
      lib.push({ rel, name: path.basename(file) });
    }
  }
  const gen = [];
  for (let n = 0; n < g.takes; n++) {
    const file = path.join(GEN, `${key.replace("#", "~")}-${n}.mp3`);
    if (!fs.existsSync(file)) continue;
    const rel = `clips/${id}-el-${n}.mp3`;
    master(file, path.join(DIR, rel), { target: targetOf(id) });
    gen.push({ rel, name: `ElevenLabs take ${n + 1}` });
  }
  const flip = Math.random() < 0.5;
  const sides = flip ? [["library", lib], ["eleven", gen]] : [["eleven", gen], ["library", lib]];
  const col = (label, [kind, list]) => `<div class="side"><h4>${label} <span class="who" data-who="${kind}"></span></h4>${list.length ? list.map((c) => `<div class="clip"><audio controls preload="none" src="${c.rel}"></audio><span class="nm">${esc(c.name)}</span></div>`).join("") : `<div class="t">nothing picked</div>`}</div>`;
  sections.push(`<section data-id="${id}"><h3>${id}</h3><div class="what">${esc(WHAT[id])}</div>
<div class="ab">${col("A", sides[0])}${col("B", sides[1])}</div>
<div class="opts">${[["A", "A is better"], ["B", "B is better"], ["both", "both fine"], ["neither", "neither"]].map(([v, l]) => `<label><input type="radio" name="${id}" value="${v}" data-a="${sides[0][0]}" data-b="${sides[1][0]}"> ${l}</label>`).join("")}
<input class="note" data-k="${id}" placeholder="notes (e.g. B has the right voice but too clean)"></div></section>`);
  console.log(`${id}: ${lib.length} library clips, ${gen.length} ElevenLabs`);
}

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Survivorz Sounds: blind comparison</title><style>
:root{--bg:#121212;--panel:#1c1c1e;--ink:#eee;--soft:#aaa;--acc:#d98a4f;--line:#333}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){--bg:#f6f4f1;--panel:#fff;--ink:#222;--soft:#666;--line:#ddd}}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,sans-serif;padding:16px;max-width:1100px}
header{position:sticky;top:0;background:var(--bg);padding:8px 0;border-bottom:1px solid var(--line);z-index:2;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
button{background:var(--acc);color:#111;border:0;border-radius:6px;padding:8px 14px;font-weight:600;cursor:pointer}
button.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
section{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin:12px 0}
h3{margin:2px 0 4px}h4{margin:4px 0}.what,.t,.nm{color:var(--soft);font-size:.85em}
.ab{display:grid;grid-template-columns:1fr 1fr;gap:14px}.side{border-top:1px solid var(--line);padding-top:6px}
.clip{display:flex;gap:8px;align-items:center;margin:4px 0}audio{width:260px;height:32px}
.who{color:var(--acc);font-weight:400}.nm{display:none}.revealed .nm{display:inline}
.opts{display:flex;gap:14px;align-items:center;padding-top:8px;margin-top:8px;border-top:1px solid var(--line);flex-wrap:wrap}
.note{flex:1;min-width:220px;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:6px}
@media (max-width:760px){.ab{grid-template-columns:1fr}audio{width:100%}}
</style></head><body>
<header><b>Blind comparison: ${esc(set)}</b><span id="count" class="t"></span><button id="reveal" class="ghost">Show which is which</button><button id="copy">Copy my picks</button><span id="msg" class="t"></span></header>
<textarea id="out" hidden style="width:100%;height:80px"></textarea>
<p class="t">For each sound, A and B are your library picks and the ElevenLabs takes in a random order, levelled and trimmed the same way. Pick the side that sounds better in the show, then press "Show which is which". Your choices save in this page.</p>
${sections.join("\n")}
<script>
const KEY = "survivorz-compare-${esc(set)}-${Date.now().toString(36)}";
const st = (() => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } })();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} count(); };
document.querySelectorAll("input[type=radio]").forEach((el) => {
  const pick = () => el.value === "A" ? el.dataset.a : el.value === "B" ? el.dataset.b : el.value;
  if (st[el.name]?.choice === pick()) el.checked = true;
  el.onchange = () => { st[el.name] = { ...(st[el.name] || {}), choice: pick() }; save(); };
});
document.querySelectorAll(".note").forEach((el) => { el.value = st[el.dataset.k]?.note || ""; el.oninput = () => { st[el.dataset.k] = { ...(st[el.dataset.k] || {}), note: el.value }; save(); }; });
function count() { document.getElementById("count").textContent = Object.values(st).filter((v) => v.choice).length + " of ${sections.length} chosen"; }
count();
document.getElementById("reveal").onclick = () => {
  document.body.classList.toggle("revealed");
  const on = document.body.classList.contains("revealed");
  document.querySelectorAll(".who").forEach((w) => w.textContent = on ? (w.dataset.who === "library" ? "· your library pick" : "· ElevenLabs") : "");
};
document.getElementById("copy").onclick = async () => {
  const out = JSON.stringify({ set: "${esc(set)}", choices: st });
  try { await navigator.clipboard.writeText(out); document.getElementById("msg").textContent = "Copied. Paste it to Claude."; }
  catch { const t = document.getElementById("out"); t.hidden = false; t.value = out; t.select(); document.getElementById("msg").textContent = "Select-all and copy the box below."; }
};
document.addEventListener("play", (e) => { document.querySelectorAll("audio").forEach((a) => { if (a !== e.target) a.pause(); }); }, true);
</script></body></html>`;
fs.writeFileSync(path.join(DIR, "index.html"), html);
console.log(`-> ${path.relative(ROOT, path.join(DIR, "index.html"))}`);
