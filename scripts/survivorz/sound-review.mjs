// SURVIVORZ: builds a listening page for one batch of the sound list. Each candidate gets
// a level-matched preview clip (-20 LUFS, so loudness isn't what wins), and Josh ticks the
// ones to use. His picks save in the page (localStorage) and "Copy my picks" puts them on
// the clipboard as JSON to paste back.
//   node scripts/survivorz/sound-review.mjs <batch-name> <group,group,...>
//   -> assets/downloads/survivorz/sound/review/<batch>/index.html
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SOUND = path.join(ROOT, "assets", "downloads", "survivorz", "sound");
const [batch, groupsArg] = process.argv.slice(2);
if (!batch || !groupsArg) throw new Error("usage: sound-review.mjs <batch> <groups>");
const groups = groupsArg.split(",");
const cands = JSON.parse(fs.readFileSync(path.join(SOUND, "candidates.json"), "utf8"));
const events = Object.values(cands).filter((e) => groups.includes(e.group));
const DIR = path.join(SOUND, "review", batch);
for (const f of fs.existsSync(path.join(DIR, "prev")) ? fs.readdirSync(path.join(DIR, "prev")) : []) fs.rmSync(path.join(DIR, "prev", f), { force: true });   // candidates change between runs: never reuse a stale clip
fs.mkdirSync(path.join(DIR, "prev"), { recursive: true });

// where a long one-shot file first makes a real sound: many are a minute of takes with
// silence between, and a window from a fixed point in can land on nothing
function onset(file, dur, len) {
  const secs = Math.min(dur, 240);
  const pcm = execFileSync("ffmpeg", ["-v", "error", "-t", String(secs), "-i", file, "-ac", "1", "-ar", "8000", "-f", "s16le", "-"], { maxBuffer: 64 << 20 });
  const n = pcm.length >> 1, hop = 160, env = [];
  for (let o = 0; o + hop <= n; o += hop) { let e = 0; for (let k = 0; k < hop; k++) { const v = pcm.readInt16LE((o + k) << 1); e += v * v; } env.push(Math.sqrt(e / hop)); }
  const peak = Math.max(...env, 1);
  const first = env.findIndex((e) => e > peak * 0.25);
  const t = Math.max(0, first * hop / 8000 - 0.15);
  return Math.min(t, Math.max(0, dur - len));
}
// a preview: the whole file if it's short; otherwise a window long enough to judge, from the
// first real sound (a one-shot) or 10% in (a loop)
function preview(c, ev, i) {
  const rel = `prev/${ev.id}-${i}.mp3`;
  const out = path.join(DIR, rel);
  if (!fs.existsSync(out)) {
    const len = ev.kind === "loop" ? 25 : 12;
    const start = c.dur <= len ? 0 : ev.kind === "loop" ? Math.min(c.dur * 0.1, c.dur - len) : onset(c.path, c.dur, len);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(start.toFixed(2)), "-t", String(len), "-i", c.path,
      "-af", `loudnorm=I=-20:TP=-1.5:LRA=11,afade=t=in:d=0.02${c.dur > len ? `,afade=t=out:st=${len - 0.6}:d=0.6` : ""}`,
      "-ar", "44100", "-ac", "2", "-b:a", "160k", out]);
  }
  return rel;
}

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
let n = 0;
const cards = events.map((ev) => {
  const rows = ev.candidates.map((c, i) => {
    const rel = preview(c, ev, i); n++;
    const key = `${ev.id}|${i}`;
    return `<div class="c"><label><input type="checkbox" data-k="${esc(key)}" data-path="${esc(c.path)}"> use</label>
<audio controls preload="none" src="${rel}"></audio>
<div class="m"><b>${esc(c.name)}</b><br>${esc(c.library)} · ${c.dur}s${c.ch ? ` · ${c.ch === 1 ? "mono" : "stereo"}` : ""}${c.rate ? ` · ${Math.round(c.rate / 1000)}k` : ""} · <span class="lic">${esc(c.source)}</span>${c.credit ? ` · credit: ${esc(c.credit)}` : ""}</div></div>`;
  }).join("");
  return `<section data-ev="${esc(ev.id)}"><h3>${esc(ev.id)} <span class="t">${ev.kind === "loop" ? "loop" : "one-shot"} · needs ${ev.takes} take${ev.takes > 1 ? "s" : ""}</span></h3>
<div class="what">${esc(ev.what || "")}</div>
${ev.eleven ? `<div class="el">If none fit, ElevenLabs can make it: “${esc(ev.eleven)}”</div>` : ""}
${rows || `<div class="el">Nothing in the libraries is this sound.</div>`}
<div class="opts"><label><input type="checkbox" data-k="${esc(ev.id)}|eleven"> none of these — make it with ElevenLabs</label>
<input class="note" data-k="${esc(ev.id)}|note" placeholder="notes (e.g. too clean, want more echo)"></div></section>`;
}).join("");

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Survivorz Sounds: ${esc(batch)}</title><style>
:root{--bg:#121212;--panel:#1c1c1e;--ink:#eee;--soft:#aaa;--acc:#d98a4f;--line:#333}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){--bg:#f6f4f1;--panel:#fff;--ink:#222;--soft:#666;--line:#ddd}}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,sans-serif;padding:16px;max-width:1100px}
header{position:sticky;top:0;background:var(--bg);padding:8px 0;border-bottom:1px solid var(--line);z-index:2;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
button{background:var(--acc);color:#111;border:0;border-radius:6px;padding:8px 14px;font-weight:600;cursor:pointer}
section{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin:12px 0}
h3{margin:2px 0 8px}.t{color:var(--soft);font-weight:400;font-size:.85em}
.c{display:grid;grid-template-columns:auto 300px 1fr;gap:10px;align-items:center;padding:6px 0;border-top:1px solid var(--line)}
audio{width:300px;height:32px}.m{font-size:.82em;color:var(--soft)}.m b{color:var(--ink);font-weight:500}
.lic{color:#7fc97f}.what{margin:-4px 0 8px;font-size:.9em}.el{font-size:.85em;color:var(--soft);margin-bottom:4px}
.opts{display:flex;gap:14px;align-items:center;padding-top:8px;border-top:1px solid var(--line);flex-wrap:wrap}
.note{flex:1;min-width:220px;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:6px}
@media (max-width:760px){.c{grid-template-columns:1fr}audio{width:100%}}
#count{color:var(--soft)}
</style></head><body>
<header><b>Batch: ${esc(batch)}</b><span id="count"></span><button id="copy">Copy my picks</button><span id="msg" class="t"></span></header>
<textarea id="out" hidden style="width:100%;height:80px"></textarea>
<p class="t">Tick every take you like for each sound. Several ticks per sound is good: each needs a few takes so nothing repeats on screen. Previews are level-matched and trimmed; the real file is used in full. Your ticks save in this page automatically.</p>
${cards}
<script>
const KEY = "survivorz-sound-${esc(batch)}-${Date.now().toString(36)}";   // a rebuilt page starts with no ticks: the old ones point at old files
const st = (() => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } })();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} count(); };
document.querySelectorAll("[data-k]").forEach((el) => {
  const k = el.dataset.k;
  if (el.type === "checkbox") { el.checked = !!st[k]; el.onchange = () => { if (el.checked) st[k] = el.dataset.path || true; else delete st[k]; save(); }; }
  else { el.value = st[k] || ""; el.oninput = () => { if (el.value) st[k] = el.value; else delete st[k]; save(); }; }
});
function count() {
  const evs = new Set(Object.keys(st).filter((k) => !k.endsWith("|note")).map((k) => k.split("|")[0]));
  document.getElementById("count").textContent = evs.size + " of ${events.length} sounds picked";
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
console.log(`${batch}: ${events.length} sounds, ${n} previews -> ${path.relative(ROOT, path.join(DIR, "index.html"))}`);
