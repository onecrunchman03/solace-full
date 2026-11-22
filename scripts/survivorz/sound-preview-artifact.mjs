// SURVIVORZ: the finished-set preview — every sound in final/manifest.json, played the way the
// game will play it: a one-shot plays a random take with the game's small per-play nudge, a
// loop plays looped, and footsteps walk / run / sneak at their cadence with the pace settings.
// Josh can flag a sound with a note; flags save to the page's database (collection "final",
// document "review") for Claude to read back.
//   node scripts/survivorz/sound-preview-artifact.mjs <out-dir>
//   -> <out-dir>/final.html + <out-dir>/final.files.json (published path -> source)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { WHAT } = await import(pathToFileURL(path.join(ROOT, "docs", "survivorz", "sound-what.mjs")).href);
const [out] = process.argv.slice(2);
if (!out) throw new Error("usage: sound-preview-artifact.mjs <out-dir>");
const FINAL = path.join(ROOT, "assets", "downloads", "survivorz", "sound", "final");
const man = JSON.parse(fs.readFileSync(path.join(FINAL, "manifest.json"), "utf8"));

const GROUPS = [["zombies", "Zombies"], ["guns", "Guns"], ["melee", "Melee and bodies"], ["footsteps", "Footsteps"], ["doors", "Doors"], ["facility", "The facility"], ["facility beds", "Room tones"], ["survival", "Survival foley"], ["score", "Music and stings"], ["glenridge", "Glenridge Hall"]];
// --group <g>[,<g>] / --ids <id>[,<id>]: a page of just those sounds (the mansion's set, say), instead of the whole set
const argOf = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1].split(",") : null; };
const onlyGroups = argOf("--group"), onlyIds = argOf("--ids");
// --title "<name>" / --intro "<first sentence>": a page of its own (its own name in the gallery, its own opening line)
const strOf = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const TITLE = esc(strOf("--title", "Survivorz Sound Set")), INTRO = esc(strOf("--intro", "Every sound in the show, finished and levelled."));
const files = {};
const sounds = Object.entries(man.sounds).filter(([id, s]) => (!onlyGroups && !onlyIds) || onlyGroups?.includes(s.group) || onlyIds?.includes(id)).map(([id, s]) => {
  const list = s.files.map((f) => { const mp3 = f.file.replace(/\.ogg$/, ".mp3"); const pub = `${id}/${mp3}`; files[pub] = path.relative(ROOT, path.join(FINAL, "preview", id, mp3)).replace(/\\/g, "/"); return { u: pub, v: !!f.variant }; });
  const what = WHAT[id] || WHAT[`${id}-walk`] || "";
  return { id, g: s.group, loop: s.kind === "loop", music: s.music, steps: !!s.paces || /^step-/.test(id), what: s.paces ? what.replace(/^walking at an even pace /, "") : what, files: list };
});

const page = `<title>${TITLE}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@500&display=swap">
<style>
/* layout: a sticky category bar, then one compact row per sound — play controls left, what it is right */
:root{--bg:#f2f0eb;--panel:#fffdf8;--ink:#1c1a17;--soft:#6a655c;--line:#dcd6ca;--acc:#a8321c;--ok:#2f7a3c;--warn:#b0731a;--chip:#e9e4da;
--display:"Barlow Condensed",system-ui,sans-serif;--body:"IBM Plex Sans",system-ui,sans-serif;--mono:"IBM Plex Mono",ui-monospace,monospace}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#131210;--panel:#1c1b18;--ink:#ebe7de;--soft:#a29c90;--line:#34312b;--acc:#e0573c;--ok:#6cc27a;--warn:#e0a24a;--chip:#29271f;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#131210;--panel:#1c1b18;--ink:#ebe7de;--soft:#a29c90;--line:#34312b;--acc:#e0573c;--ok:#6cc27a;--warn:#e0a24a;--chip:#29271f;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font-family:var(--body);font-size:15px;line-height:1.45;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:0 56px}
.wrap{max-width:900px;margin:0 auto}
header{position:sticky;top:env(safe-area-inset-top,0px);z-index:3;background:var(--bg);padding-block:12px 8px;border-bottom:1px solid var(--line)}
.row1{display:flex;flex-wrap:wrap;gap:4px 14px;align-items:baseline}
h1{font-family:var(--display);font-weight:700;font-size:1.75rem;text-transform:uppercase;letter-spacing:.02em;margin:0}
.meta{font-family:var(--mono);font-size:.8rem;color:var(--soft)}.save{margin-left:auto;font-size:.82rem;color:var(--soft)}.save.err{color:var(--acc)}
nav{display:flex;gap:6px;overflow-x:auto;padding-top:8px;scrollbar-width:none}nav::-webkit-scrollbar{display:none}
nav a{flex:none;font-size:.82rem;color:var(--ink);text-decoration:none;background:var(--chip);border-radius:99px;padding:6px 12px;min-height:32px;display:flex;align-items:center}
.intro{color:var(--soft);font-size:.9rem;max-width:64ch;margin:14px 0 0}
h2{font-family:var(--display);font-weight:600;font-size:1.35rem;letter-spacing:.03em;margin:26px 0 6px;scroll-margin-top:110px}
.snd{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-top:8px;display:grid;grid-template-columns:auto 1fr;gap:6px 12px;align-items:start}
.snd.flag{border-color:var(--warn)}
.ctl{display:flex;gap:6px;flex-wrap:wrap;max-width:210px}
button{font:inherit;cursor:pointer}
.b{min-height:40px;min-width:44px;border-radius:8px;border:0;background:var(--acc);color:#fff;padding:0 12px;font-size:.85rem;font-weight:500}
.b.alt{background:var(--chip);color:var(--ink)}.b.on{background:var(--ink);color:var(--bg)}
.info{min-width:0}.nm{font-family:var(--mono);font-size:.86rem}.what{color:var(--soft);font-size:.85rem}
.tk{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.tk button{min-height:32px;min-width:36px;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:6px;font-family:var(--mono);font-size:.75rem}
.tk button.v{border-style:dashed;color:var(--soft)}
.tk button.on{background:var(--ink);color:var(--bg)}.tk button{padding:0 8px}
.fl{display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap}
.fl label{display:flex;gap:6px;align-items:center;font-size:.84rem;min-height:36px}.fl input[type=checkbox]{width:18px;height:18px;accent-color:var(--warn)}
.note{flex:1;min-width:0;width:100%;font:inherit;font-size:.88rem;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:8px}
.note[hidden]{display:none}
:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
@media (max-width:520px){.snd{grid-template-columns:1fr}.ctl{max-width:none}}
@media (prefers-reduced-motion: reduce){*{transition:none!important}}
</style>
<div class="wrap">
<header><div class="row1"><h1>${TITLE}</h1><span class="meta" id="meta"></span><span class="save" id="save"></span></div><nav id="nav"></nav></header>
<p class="intro">${INTRO} ▶ plays a random take with the same small pitch and level nudge the game adds, so tap it a few times. Footsteps play a few steps at walk, run and sneak. Loops keep playing until you stop them. The numbered buttons play each take on its own; dashed ones are variations made from your keepers. If something isn't right, tick "needs work" and say what.</p>
<div id="list"></div>
</div>
<script>
const SOUNDS = ${JSON.stringify(sounds)};
const GROUPS = ${JSON.stringify(GROUPS)};
const PACES = ${JSON.stringify(man.paces)};
const JIT = ${JSON.stringify(man.stepJitter)};
const CADENCE = { walk: 0.52, run: 0.31, sneak: 0.85 };
const flags = {};   // id -> {flag, note}
let db = null, saveTimer = null, ctx = null, loopNode = null, loopBtn = null;
const bufs = new Map();
const $ = (s) => document.querySelector(s);
function ac() { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === "suspended") ctx.resume(); return ctx; }
async function buf(u) { if (!bufs.has(u)) bufs.set(u, fetch(u).then((r) => r.arrayBuffer()).then((a) => ac().decodeAudioData(a))); return bufs.get(u); }
function stopLoop() { if (loopNode) { try { loopNode.stop(); } catch {} loopNode = null; } if (loopBtn) { loopBtn.classList.remove("on"); if (loopBtn.classList.contains("b")) loopBtn.textContent = "▶ Loop"; loopBtn = null; } }
async function play(u, { at = 0, gainDb = 0, rate = 1, lowpass = null, loop = false } = {}) {
  const c = ac(), b = await buf(u), s = c.createBufferSource(); s.buffer = b; s.loop = loop; s.playbackRate.value = rate;
  const g = c.createGain(); g.gain.value = Math.pow(10, gainDb / 20); let node = s;
  if (lowpass) { const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = lowpass; node.connect(f); node = f; }
  node.connect(g).connect(c.destination); s.start(c.currentTime + at); return s;
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const jitter = () => ({ rate: 1 + (Math.random() * 2 - 1) * JIT.pitch, gainDb: (Math.random() * 2 - 1) * JIT.gainDb });
async function walk(s, pace) { const p = PACES[pace]; let last = null; for (let i = 0; i < 6; i++) { let f; do f = pick(s.files); while (s.files.length > 1 && f === last); last = f; const j = jitter(); play(f.u, { at: i * CADENCE[pace], gainDb: p.gainDb + j.gainDb, rate: p.pitch * j.rate, lowpass: p.lowpassHz }); } }

function render() {
  $("#nav").innerHTML = ""; $("#list").innerHTML = "";
  for (const [g, label] of GROUPS) {
    const items = SOUNDS.filter((s) => s.g === g); if (!items.length) continue;
    const a = document.createElement("a"); a.href = "#" + g.replace(/ /g, "-"); a.textContent = label + " · " + items.length; $("#nav").append(a);
    const h = document.createElement("h2"); h.id = g.replace(/ /g, "-"); h.textContent = label; $("#list").append(h);
    for (const s of items) {
      const el = document.createElement("div"); el.className = "snd" + (flags[s.id]?.flag ? " flag" : "");
      el.innerHTML = '<div class="ctl"></div><div class="info"><div class="nm"></div><div class="what"></div><div class="tk"></div><div class="fl"><label><input type="checkbox"> needs work</label><input class="note" placeholder="what\\u2019s wrong with it?"></div></div>';
      el.querySelector(".nm").textContent = s.id + " · " + s.files.length + (s.files.length === 1 ? " take" : " takes");
      el.querySelector(".what").textContent = s.what;
      const ctl = el.querySelector(".ctl");
      const btn = (t, cls, fn) => { const b = document.createElement("button"); b.className = "b" + (cls ? " " + cls : ""); b.textContent = t; b.onclick = fn; ctl.append(b); return b; };
      if (s.steps) for (const p of ["walk", "run", "sneak"]) btn(p[0].toUpperCase() + p.slice(1), p === "walk" ? "" : "alt", () => walk(s, p));
      else if (s.loop) { const b = btn("▶ Loop", "", async () => { if (loopBtn === b) { stopLoop(); return; } stopLoop(); loopBtn = b; b.classList.add("on"); b.textContent = "■ Stop"; loopNode = await play(s.files[0].u, { loop: true }); }); }
      else btn("▶ Play", "", () => { const j = jitter(); play(pick(s.files).u, { rate: j.rate, gainDb: j.gainDb }); });
      const tk = el.querySelector(".tk");
      // (a loop's takes each play looped: the game picks any of them, so each must be heard)
      if (s.loop && s.files.length > 1) s.files.forEach((f, i) => { const b = document.createElement("button"); b.textContent = "loop " + (i + 1); b.onclick = async () => { if (loopBtn === b) { stopLoop(); return; } stopLoop(); loopBtn = b; b.classList.add("on"); loopNode = await play(f.u, { loop: true }); }; tk.append(b); });
      s.files.forEach((f, i) => { if (s.loop) return; const b = document.createElement("button"); b.textContent = i + 1; if (f.v) { b.className = "v"; b.title = "variation"; } b.onclick = () => play(f.u); tk.append(b); });
      const cb = el.querySelector("input[type=checkbox]"), note = el.querySelector(".note");
      cb.checked = !!flags[s.id]?.flag; note.hidden = !cb.checked; note.value = flags[s.id]?.note || ""; note.id = "note-" + s.id; cb.id = "flag-" + s.id;
      cb.onchange = () => { flags[s.id] = { ...(flags[s.id] || {}), flag: cb.checked }; note.hidden = !cb.checked; el.classList.toggle("flag", cb.checked); if (cb.checked) note.focus(); queue(); count(); };
      note.oninput = () => { flags[s.id] = { ...(flags[s.id] || {}), note: note.value }; queue(); };
      $("#list").append(el);
    }
  }
  count();
}
function count() { const n = Object.values(flags).filter((f) => f.flag).length; $("#meta").textContent = SOUNDS.length + " sounds · " + SOUNDS.reduce((a, s) => a + s.files.length, 0) + " files" + (n ? " · " + n + " flagged" : ""); }
function status(t, err) { const e = $("#save"); e.textContent = t; e.classList.toggle("err", !!err); }
function queue() {
  try { localStorage.setItem("final-flags", JSON.stringify(flags)); } catch {}
  if (!db) { status("Saved on this device only", true); return; }
  status("Saving…"); clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => { try { await db.doc("final/review").set({ flags: { ...flags }, savedAt: new Date().toISOString() }); status("Saved"); } catch (e) { status("Couldn\\u2019t save (" + (e?.code || "error") + "), kept on this device", true); } }, 600);
}
(async () => {
  try { Object.assign(flags, JSON.parse(localStorage.getItem("final-flags") || "{}")); } catch {}
  render();
  db = await window.claude?.use?.("db") ?? null;
  if (!db) { status("Notes save on this device only", true); return; }
  try { const snap = await db.doc("final/review").get(); const d = snap?.data ? snap.data() : null; if (d?.flags) { Object.assign(flags, d.flags); render(); } status("Ready"); } catch { status("Ready"); }
})();
</script>`;
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "final.html"), page);
fs.writeFileSync(path.join(out, "final.files.json"), JSON.stringify(files));
console.log(`${sounds.length} sounds, ${Object.keys(files).length} files, page ${(page.length / 1024).toFixed(0)} KB`);
