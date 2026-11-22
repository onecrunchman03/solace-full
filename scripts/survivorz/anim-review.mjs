// SURVIVORZ: the animation review page Josh uses from his phone — every survivor clip on one
// survivor and every zombie clip on one zombie, as looping videos grouped by what they're for
// (docs/survivorz/anim-groups.mjs). He flags any that need work with a note; flags save to the
// page's database (collection "anim", document "review") for Claude to read back.
//   node scripts/survivorz/anim-review.mjs <out-dir> [survivorBody] [zombieBody]
//   -> <out-dir>/anim.html + <out-dir>/anim.files.json (published path -> source)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { SURVIVOR_GROUPS, ZOMBIE_GROUPS, PAIR_GROUPS, CLIP_NOTES, groupOf, labelOf } = await import(pathToFileURL(path.join(ROOT, "docs", "survivorz", "anim-groups.mjs")).href);
const [out, sBody = "eric", zBody = "zombie-m01"] = process.argv.slice(2);
// a SHORT page of just the new clips (Josh: "show me them after instead of me scrolling the whole
// list"): ONLY=<regex> keeps the clips it matches, PAGE names the file, TITLE and INTRO head it,
// DOC is where its flags save (its own, so the main review's flags stay as they are)
const INTRO = process.env.INTRO ?? `Every move the survivors and zombies have, shown on one body each and grouped by what it's for. "Zombie attacks" are the finisher pack you bought: the zombie and the survivor animated together, placed where the pack puts them. Clips play as they scroll into view. The floor has half-metre squares so you can see feet slide, and shadows so you can see whether a body really touches the ground. No props or guns are shown yet; they come with the items. Tick "needs work" on anything that looks wrong and say what. Everything you don't flag counts as approved.`;
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null, PAGE = process.env.PAGE || "anim", DOC = process.env.DOC || "anim/review";
if (!out) throw new Error("usage: anim-review.mjs <out-dir> [survivor] [zombie]");
const ANIM = path.join(ROOT, "assets", "downloads", "survivorz", "anim");
const files = {};
function shelf(body, groups, who, only = ONLY) {
  if (!fs.existsSync(path.join(ANIM, body, "index.json"))) return [];
  const index = JSON.parse(fs.readFileSync(path.join(ANIM, body, "index.json"), "utf8"));
  const contact = fs.existsSync(path.join(ANIM, body, "contact.json")) ? JSON.parse(fs.readFileSync(path.join(ANIM, body, "contact.json"), "utf8")) : {};
  const by = new Map(groups.map(([g]) => [g, []]));
  for (const [id, v] of Object.entries(index).sort(([a], [b]) => labelOf(a).localeCompare(labelOf(b)))) {
    if (only && !only.test(id)) continue;
    const pub = `${who}/${v.file}`;
    files[pub] = path.relative(ROOT, path.join(ANIM, body, v.file)).replace(/\\/g, "/");
    const g = groupOf(id, groups);
    if (!by.has(g)) by.set(g, []);
    by.get(g).push({ id, label: labelOf(id).replace(/^fz /, ""), dur: v.dur, loop: v.loop, u: pub, swim: /swim/.test(id), solo: v.pair === false, note: CLIP_NOTES[id] || Object.entries(CLIP_NOTES).find(([k]) => id.startsWith(k + "-"))?.[1] || "" });
  }
  return [...by].filter(([, l]) => l.length).map(([g, l]) => ({ g, clips: l }));
}
const SHELVES = [
  { who: "survivors", title: "Survivors", body: sBody, groups: shelf(sBody, SURVIVOR_GROUPS, "survivors") },
  { who: "zombies", title: "Zombies", body: zBody, groups: shelf(zBody, ZOMBIE_GROUPS, "zombies") },
  { who: "attacks", title: "Two together", body: "pairs", groups: shelf("pairs", PAIR_GROUPS, "attacks") },
  // CLOSE=<regex>: the gun close-ups (anim-videos.cjs --close) as their own tab
  ...(process.env.CLOSE ? [{ who: "close", title: "Close-ups", body: sBody + "/close", groups: shelf(sBody + "/close", SURVIVOR_GROUPS, "close", new RegExp(process.env.CLOSE)) }] : []),
  // HANDS=<regex>: the held-prop close-ups (anim-videos.cjs --hands) as their own tab
  ...(process.env.HANDS ? [{ who: "hands", title: "Hands", body: sBody + "/hands", groups: shelf(sBody + "/hands", SURVIVOR_GROUPS, "hands", new RegExp(process.env.HANDS)) }] : []),
].filter((s) => s.groups.length);
const total = SHELVES.reduce((a, s) => a + s.groups.reduce((b, g) => b + g.clips.length, 0), 0);

const page = `<title>${process.env.PAGE_TITLE || "Survivorz Animations"}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@500&display=swap">
<style>
/* layout: a sticky bar (survivors / zombies + the groups), then a grid of looping clips per group */
:root{--bg:#f2f0eb;--panel:#fffdf8;--ink:#1c1a17;--soft:#6a655c;--line:#dcd6ca;--acc:#a8321c;--warn:#b0731a;--chip:#e9e4da;
--display:"Barlow Condensed",system-ui,sans-serif;--body:"IBM Plex Sans",system-ui,sans-serif;--mono:"IBM Plex Mono",ui-monospace,monospace}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#131210;--panel:#1c1b18;--ink:#ebe7de;--soft:#a29c90;--line:#34312b;--acc:#e0573c;--warn:#e0a24a;--chip:#29271f;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#131210;--panel:#1c1b18;--ink:#ebe7de;--soft:#a29c90;--line:#34312b;--acc:#e0573c;--warn:#e0a24a;--chip:#29271f;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font-family:var(--body);font-size:15px;line-height:1.45;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:0 56px}
.wrap{max-width:1100px;margin:0 auto}
header{position:sticky;top:env(safe-area-inset-top,0px);z-index:3;background:var(--bg);padding-block:12px 8px;border-bottom:1px solid var(--line)}
.row1{display:flex;flex-wrap:wrap;gap:4px 14px;align-items:baseline}
h1{font-family:var(--display);font-weight:700;font-size:1.75rem;text-transform:uppercase;letter-spacing:.02em;margin:0}
.meta{font-family:var(--mono);font-size:.8rem;color:var(--soft)}.save{margin-left:auto;font-size:.82rem;color:var(--soft)}.save.err{color:var(--acc)}
.tabs{display:flex;gap:6px;margin-top:8px}.tabs button{font:inherit;font-weight:500;border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:8px;padding:0 14px;min-height:40px;cursor:pointer}
.tabs button[aria-pressed=true]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
nav{display:flex;gap:6px;overflow-x:auto;padding-top:8px;scrollbar-width:none}nav::-webkit-scrollbar{display:none}
nav a{flex:none;font-size:.82rem;color:var(--ink);text-decoration:none;background:var(--chip);border-radius:99px;padding:6px 12px;min-height:32px;display:flex;align-items:center}
.intro{color:var(--soft);font-size:.9rem;max-width:66ch;margin:14px 0 0}
h2{font-family:var(--display);font-weight:600;font-size:1.35rem;letter-spacing:.03em;margin:26px 0 8px;scroll-margin-top:150px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
.clip{background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden;display:flex;flex-direction:column;min-width:0}
.clip.flag{border-color:var(--warn);box-shadow:inset 0 0 0 1px var(--warn)}
video{width:100%;aspect-ratio:1;display:block;background:#26282b}
.cap{padding:8px 10px;display:flex;flex-direction:column;gap:6px}
.nm{font-size:.88rem;font-weight:500;text-transform:capitalize}.sub{font-family:var(--mono);font-size:.72rem;color:var(--soft)}
.fl{display:flex;gap:6px;align-items:center;font-size:.84rem;min-height:36px}.fl input{width:18px;height:18px;accent-color:var(--warn)}
.note{font:inherit;font-size:.86rem;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:8px;width:100%;min-width:0}
:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
@media (max-width:460px){.grid{grid-template-columns:1fr 1fr;gap:8px}.cap{padding:6px 8px}}
</style>
<div class="wrap">
<header><div class="row1"><h1>${process.env.TITLE || "Survivorz Animations"}</h1><span class="meta" id="meta"></span><span class="save" id="save"></span></div>
<div class="tabs" id="tabs"></div><nav id="nav"></nav></header>
<p class="intro">${INTRO}</p>
<div id="list"></div>
</div>
<script>
const SHELVES = ${JSON.stringify(SHELVES)};
const flags = {}; let db = null, timer = null, tab = "survivors";
try { tab = localStorage.getItem("anim-tab") || tab; } catch {}
const $ = (s) => document.querySelector(s);
const io = new IntersectionObserver((es) => { for (const e of es) { const v = e.target; if (e.isIntersecting) { if (!v.src) v.src = v.dataset.src; v.play().catch(() => {}); } else v.pause(); } }, { rootMargin: "120px" });
function render() {
  io.disconnect();
  const shelf = SHELVES.find((s) => s.who === tab);
  $("#tabs").innerHTML = ""; for (const s of SHELVES) { const b = document.createElement("button"); b.textContent = s.title + " · " + s.groups.reduce((a, g) => a + g.clips.length, 0); b.setAttribute("aria-pressed", s.who === tab); b.onclick = () => { tab = s.who; try { localStorage.setItem("anim-tab", tab); } catch {} render(); scrollTo(0, 0); }; $("#tabs").append(b); }
  $("#nav").innerHTML = ""; $("#list").innerHTML = "";
  shelf.groups.forEach((g, gi) => {
    const id = tab + "-" + gi;
    const a = document.createElement("a"); a.href = "#" + id; a.textContent = g.g + " · " + g.clips.length; $("#nav").append(a);
    const h = document.createElement("h2"); h.id = id; h.textContent = g.g; $("#list").append(h);
    const grid = document.createElement("div"); grid.className = "grid";
    for (const c of g.clips) {
      const key = tab + "/" + c.id;
      const el = document.createElement("div"); el.className = "clip" + (flags[key]?.flag ? " flag" : "");
      el.innerHTML = '<video muted loop playsinline preload="none"></video><div class="cap"><div class="nm"></div><div class="sub"></div><label class="fl"><input type="checkbox"> needs work</label><input class="note" placeholder="what\\u2019s wrong?"></div>';
      const v = el.querySelector("video"); v.dataset.src = c.u; io.observe(v);
      el.querySelector(".nm").textContent = c.label;
      el.querySelector(".sub").textContent = c.dur + "s · " + (c.loop ? "loops" : "plays once") + (c.swim ? " · in water" : "") + (c.solo ? " · zombie only" : "") + (c.note ? " · " + c.note : "");
      const cb = el.querySelector("input[type=checkbox]"), note = el.querySelector(".note");
      cb.id = "flag-" + key.replace(/\\W/g, "_"); note.id = "note-" + key.replace(/\\W/g, "_");
      cb.checked = !!flags[key]?.flag; note.hidden = !cb.checked; note.value = flags[key]?.note || "";
      cb.onchange = () => { flags[key] = { ...(flags[key] || {}), flag: cb.checked }; note.hidden = !cb.checked; el.classList.toggle("flag", cb.checked); if (cb.checked) note.focus(); save(); count(); };
      note.oninput = () => { flags[key] = { ...(flags[key] || {}), note: note.value }; save(); };
      grid.append(el);
    }
    $("#list").append(grid);
  });
  count();
}
function count() { const n = Object.values(flags).filter((f) => f.flag).length; $("#meta").textContent = ${total} + " clips" + (n ? " · " + n + " flagged" : ""); }
function status(t, e) { const s = $("#save"); s.textContent = t; s.classList.toggle("err", !!e); }
function save() {
  try { localStorage.setItem("anim-flags", JSON.stringify(flags)); } catch {}
  if (!db) { status("Saved on this device only", true); return; }
  status("Saving…"); clearTimeout(timer);
  timer = setTimeout(async () => { try { await db.doc(${JSON.stringify(DOC)}).set({ flags: { ...flags }, savedAt: new Date().toISOString() }); status("Saved"); } catch (e) { status("Couldn\\u2019t save (" + (e?.code || "error") + "), kept on this device", true); } }, 600);
}
(async () => {
  try { Object.assign(flags, JSON.parse(localStorage.getItem("anim-flags") || "{}")); } catch {}
  render();
  db = await window.claude?.use?.("db") ?? null;
  if (!db) { status("Notes save on this device only", true); return; }
  try { const snap = await db.doc(${JSON.stringify(DOC)}).get(); const d = snap?.data ? snap.data() : null; if (d?.flags) { Object.assign(flags, d.flags); render(); } status("Ready"); } catch { status("Ready"); }
})();
</script>`;
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, `${PAGE}.html`), page);
fs.writeFileSync(path.join(out, `${PAGE}.files.json`), JSON.stringify(files));
console.log(`${total} clips, ${Object.keys(files).length} files, page ${(page.length / 1024).toFixed(0)} KB`);
