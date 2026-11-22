// SURVIVORZ: the page where Josh keeps or drops each generated take. Every take is mastered
// the same way (sound-master.mjs); a file asked for as a run of sounds ("seq") is cut into
// its separate sounds first. Each sound says how many takes the show needs, and the count
// beside it turns green once that many are ticked.
//   node scripts/survivorz/sound-takes.mjs <batch> <group,group,...>
//   -> assets/downloads/survivorz/sound/review/takes-<batch>/index.html
// A "make more" box per sound asks for another round of that sound (with a note on what to
// change), so a sound stays on the page until it has enough keepers.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { takes, master } from "./sound-master.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { SOUND_LIST } = await imp("docs/survivorz/sound-list.mjs");
const { PROMPTS } = await imp("docs/survivorz/sound-prompts.mjs");
const { WHAT } = await imp("docs/survivorz/sound-what.mjs");
const [batch, groupsArg] = process.argv.slice(2);
if (!batch || !groupsArg) throw new Error("usage: sound-takes.mjs <batch> <groups>");
const groups = groupsArg.split(",");
const argv = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const onlyIds = argv("--ids")?.split(",");      // a later round: just these sounds…
const after = argv("--after");                  // …and only the takes made after this time
const LOG = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "downloads", "survivorz", "sound", "eleven", "prod", "LOG.json"), "utf8"));
const SOUND = path.join(ROOT, "assets", "downloads", "survivorz", "sound");
const GEN = path.join(SOUND, "eleven", "prod");
const DIR = path.join(SOUND, "review", `takes-${batch}`);
fs.mkdirSync(path.join(DIR, "clips"), { recursive: true });
for (const f of fs.readdirSync(path.join(DIR, "clips"))) fs.rmSync(path.join(DIR, "clips", f), { force: true });

const HANDLING = /dryfire|mag|slide|bolt|pump|load|casing/;
function targetOf(ev) {
  if (ev.group === "guns") return HANDLING.test(ev.id) ? -18 : -12;
  if (ev.group === "score" || ev.group === "facility beds" || ev.kind === "loop") return -20;
  if (ev.group === "footsteps") return -20;
  return -16;
}
// a later round asks only for what's still missing: frequent sounds need at least half
// their takes as real ones (pitch and tone variations fill the rest), rare ones need one
const TALLY = path.join(SOUND, "tally.json");
const tally = onlyIds && fs.existsSync(TALLY) ? JSON.parse(fs.readFileSync(TALLY, "utf8")) : {};
const RARE = new Set(["doors", "facility", "facility beds", "score"]);
const needOf = (ev) => {
  if (!tally[ev.id]) return ev.takes;
  const floor = RARE.has(ev.group) ? 1 : Math.ceil(ev.takes / 2);
  return Math.max(1, floor - tally[ev.id].have);
};
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

const sections = [];
let total = 0;
for (const ev of SOUND_LIST.filter((e) => (groups.includes("all") || groups.includes(e.group)) && (!onlyIds || onlyIds.includes(e.id)))) {
  const p = PROMPTS[ev.id];
  const files = fs.readdirSync(GEN).filter((f) => f.startsWith(`${ev.id}-`) && /^\d+\.mp3$/.test(f.slice(ev.id.length + 1))).sort((a, b) => parseInt(a.slice(ev.id.length + 1)) - parseInt(b.slice(ev.id.length + 1)));
  const clips = [];
  for (const f of files.filter((f) => !after || (LOG[f]?.made || "") > after)) {
    const src = path.join(GEN, f);
    const parts = p.seq ? takes(src, { maxLen: Math.min(ev.maxDur || 3, 3), minLen: 0.15, gap: 0.12, tail: 36 }) : [null];
    for (const t of parts) {
      const rel = `clips/${ev.id}-${clips.length}.mp3`;
      const m = master(src, path.join(DIR, rel), { ...(t ? { start: t.start, end: t.end } : {}), target: targetOf(ev), fadeOut: ev.kind === "loop" ? 0.01 : 0.08 });
      // a cut that held nothing but noise comes out of the silence trim empty: not a take
      if (!(m.dur > 0.03) || !Number.isFinite(m.gain) || m.gain > 60) { fs.rmSync(path.join(DIR, rel), { force: true }); continue; }
      clips.push({ rel, src: f, start: t?.start ?? 0, end: t?.end ?? null });
    }
  }
  total += clips.length;
  const rows = clips.map((c, i) => `<div class="clip"><label><input type="checkbox" data-ev="${ev.id}" data-k="${ev.id}|${i}" data-src="${esc(c.src)}" data-start="${c.start}" data-end="${c.end ?? ""}"> keep</label><audio controls preload="none" ${ev.kind === "loop" ? "loop" : ""} src="${c.rel}"></audio><span class="t">take ${i + 1}</span></div>`).join("");
  sections.push(`<section><h3>${ev.id} <span class="need" data-need="${needOf(ev)}" data-ev="${ev.id}"></span></h3><div class="what">${esc(WHAT[ev.id])}</div>
<div class="grid">${rows || `<div class="t">nothing generated yet</div>`}</div>
<div class="opts"><label><input type="checkbox" data-k="${ev.id}|more"> make more of this</label><input class="note" data-k="${ev.id}|note" placeholder="what to change (e.g. deeper, less echo, more wet)"></div></section>`);
  console.log(`${ev.id}: ${clips.length} takes (needs ${ev.takes})`);
}

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Survivorz Sounds: ${esc(batch)}</title><style>
:root{--bg:#121212;--panel:#1c1c1e;--ink:#eee;--soft:#aaa;--acc:#d98a4f;--ok:#7fc97f;--line:#333}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){--bg:#f6f4f1;--panel:#fff;--ink:#222;--soft:#666;--line:#ddd;--ok:#2e8b3e}}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,sans-serif;padding:16px;max-width:1100px}
header{position:sticky;top:0;background:var(--bg);padding:8px 0;border-bottom:1px solid var(--line);z-index:2;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
button{background:var(--acc);color:#111;border:0;border-radius:6px;padding:8px 14px;font-weight:600;cursor:pointer}
section{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin:12px 0}
h3{margin:2px 0 4px}.what,.t{color:var(--soft);font-size:.85em}.need{font-size:.8em;font-weight:400;color:var(--soft)}.need.ok{color:var(--ok)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:4px 16px;margin-top:6px}
.clip{display:flex;gap:8px;align-items:center}audio{width:230px;height:32px}
.opts{display:flex;gap:14px;align-items:center;padding-top:8px;margin-top:8px;border-top:1px solid var(--line);flex-wrap:wrap}
.note{flex:1;min-width:220px;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:6px}
@media (max-width:760px){.grid{grid-template-columns:1fr}audio{width:100%}}
</style></head><body>
<header><b>Keep the good takes: ${esc(batch)}</b><span id="count" class="t"></span><button id="copy">Copy my picks</button><span id="msg" class="t"></span></header>
<textarea id="out" hidden style="width:100%;height:80px"></textarea>
<p class="t">Every take is levelled and trimmed the same way. Tick the ones good enough for the show. Each sound says how many it needs, and turns green when you've ticked that many; more is fine. If a sound has too few good ones, tick "make more" and say what to change. Ticks save in this page.</p>
${sections.join("\n")}
<script>
const KEY = "survivorz-takes-${esc(batch)}-${Date.now().toString(36)}";
const st = (() => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } })();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} count(); };
document.querySelectorAll("[data-k]").forEach((el) => {
  const k = el.dataset.k;
  if (el.type === "checkbox") { el.checked = !!st[k]; el.onchange = () => { if (el.checked) st[k] = el.dataset.src ? { src: el.dataset.src, start: +el.dataset.start, end: el.dataset.end ? +el.dataset.end : null } : true; else delete st[k]; save(); }; }
  else { el.value = st[k] || ""; el.oninput = () => { if (el.value) st[k] = el.value; else delete st[k]; save(); }; }
});
function count() {
  let done = 0;
  document.querySelectorAll(".need").forEach((n) => {
    const have = Object.keys(st).filter((k) => k.startsWith(n.dataset.ev + "|") && /\\|\\d+$/.test(k)).length;
    n.textContent = "· " + have + " of " + n.dataset.need + " more kept";
    n.classList.toggle("ok", have >= +n.dataset.need); if (have >= +n.dataset.need) done++;
  });
  document.getElementById("count").textContent = done + " of ${sections.length} sounds have enough";
}
count();
document.getElementById("copy").onclick = async () => {
  const out = JSON.stringify({ batch: "${esc(batch)}", picks: st });
  try { await navigator.clipboard.writeText(out); document.getElementById("msg").textContent = "Copied. Paste it to Claude."; }
  catch { const t = document.getElementById("out"); t.hidden = false; t.value = out; t.select(); document.getElementById("msg").textContent = "Select-all and copy the box below."; }
};
document.addEventListener("play", (e) => { document.querySelectorAll("audio").forEach((a) => { if (a !== e.target) a.pause(); }); }, true);
</script></body></html>`;
fs.writeFileSync(path.join(DIR, "index.html"), html);
console.log(`${batch}: ${sections.length} sounds, ${total} takes -> ${path.relative(ROOT, path.join(DIR, "index.html"))}`);
