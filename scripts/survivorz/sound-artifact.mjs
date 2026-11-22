// SURVIVORZ: turns a local takes page (sound/review/takes-<batch>/index.html) into a page
// Josh can use from his phone: a private claude.ai Artifact whose picks save to the page's own
// database (collection "picks", one document per batch), so Claude reads them back with
// ArtifactData instead of a copy-paste. Writes <out>/<batch>.html; the clips are published
// beside it from the takes page's own clips/ folder.
//   node scripts/survivorz/sound-artifact.mjs <batch> <out-dir>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const [batch, out] = process.argv.slice(2);
if (!batch || !out) throw new Error("usage: sound-artifact.mjs <batch> <out-dir>");
const SRC = path.join(ROOT, "assets", "downloads", "survivorz", "sound", "review", `takes-${batch}`, "index.html");
const html = fs.readFileSync(SRC, "utf8");

// pull the sounds back out of the local page
const sounds = [];
for (const sec of html.split("<section>").slice(1)) {
  const id = sec.match(/<h3>([a-z0-9-]+) /)?.[1];
  const need = Number(sec.match(/data-need="(\d+)"/)?.[1] || 1);
  const what = sec.match(/<div class="what">([^<]*)<\/div>/)?.[1] ?? "";
  const takes = [...sec.matchAll(/data-k="[^"|]+\|(\d+)" data-src="([^"]+)" data-start="([^"]*)" data-end="([^"]*)"><\/label>|data-k="[^"|]+\|(\d+)" data-src="([^"]+)" data-start="([^"]*)" data-end="([^"]*)"> keep<\/label><audio[^>]*src="([^"]+)"/g)]
    .map((m) => ({ i: +(m[1] ?? m[5]), src: m[2] ?? m[6], start: +(m[3] ?? m[7]), end: (m[4] ?? m[8]) ? +(m[4] ?? m[8]) : null, clip: m[9] }))
    .filter((t) => t.clip);
  if (id) sounds.push({ id, need, what, loop: /\sloop\s/.test(sec), takes });
}
const total = sounds.reduce((a, s) => a + s.takes.length, 0);

const page = `<title>Survivorz Sound Picks</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@500&display=swap">
<style>
/* layout: one column of sounds, each a card of tappable takes; a sticky bar carries progress and save state */
:root{--bg:#f3f1ec;--panel:#fffdf8;--ink:#1d1b18;--soft:#6b665d;--line:#ddd7cb;--acc:#b5361f;--ok:#2f7a3c;--chip:#ebe6dc;
--display:"Barlow Condensed",system-ui,sans-serif;--body:"IBM Plex Sans",system-ui,sans-serif;--mono:"IBM Plex Mono",ui-monospace,monospace}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#141311;--panel:#1d1c19;--ink:#ece8df;--soft:#a39d91;--line:#34312b;--acc:#e0573c;--ok:#6cc27a;--chip:#2a2824;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#141311;--panel:#1d1c19;--ink:#ece8df;--soft:#a39d91;--line:#34312b;--acc:#e0573c;--ok:#6cc27a;--chip:#2a2824;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font-family:var(--body);font-size:15px;line-height:1.45;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:0 48px}
.wrap{max-width:860px;margin:0 auto}
header{position:sticky;top:env(safe-area-inset-top,0px);z-index:3;background:var(--bg);padding-block:12px 10px;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:6px 14px;align-items:baseline}
h1{font-family:var(--display);font-weight:700;font-size:1.7rem;letter-spacing:.02em;text-transform:uppercase;margin:0;text-wrap:balance}
.prog{font-family:var(--mono);font-size:.82rem;color:var(--soft)}
.save{font-size:.82rem;color:var(--soft);margin-left:auto}.save.err{color:var(--acc)}
.intro{color:var(--soft);font-size:.9rem;max-width:62ch;margin:14px 0 4px}
.sound{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-top:14px}
.top{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
h2{font-family:var(--display);font-weight:600;font-size:1.25rem;letter-spacing:.03em;margin:0}
.need{font-family:var(--mono);font-size:.78rem;padding:2px 8px;border-radius:99px;background:var(--chip);color:var(--soft)}
.need.ok{background:color-mix(in srgb,var(--ok) 18%,transparent);color:var(--ok)}
.what{color:var(--soft);font-size:.86rem;margin:4px 0 10px;min-width:0}
.takes{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.take{display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:var(--bg);min-height:44px}
.take.kept{border-color:var(--ok);box-shadow:inset 0 0 0 1px var(--ok)}
button{font:inherit;cursor:pointer}
.play{width:36px;height:36px;border-radius:50%;border:0;background:var(--acc);color:#fff;flex:none;display:grid;place-items:center}
.play svg{width:14px;height:14px;fill:currentColor}
.keep{flex:1;min-height:36px;border:1px solid var(--line);border-radius:6px;background:transparent;color:var(--ink);font-size:.86rem;text-align:left;padding:0 8px}
.take.kept .keep{color:var(--ok);font-weight:500}
.n{font-family:var(--mono);font-size:.75rem;color:var(--soft)}
.more{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin-top:10px;padding-top:10px;border-top:1px solid var(--line)}
.more label{display:flex;gap:6px;align-items:center;font-size:.88rem;min-height:44px}
.more input[type=checkbox]{width:20px;height:20px;accent-color:var(--acc)}
.note{flex:1;min-width:0;width:100%;font:inherit;font-size:.9rem;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:10px}
:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
@media (prefers-reduced-motion: reduce){*{transition:none!important}}
</style>
<div class="wrap">
<header><h1>Sound Picks · ${batch.replace(/-/g, " ")}</h1><span class="prog" id="prog"></span><span class="save" id="save">Loading your picks…</span></header>
<p class="intro">Tap ▶ to hear a take, then tap "Keep" on the ones good enough for the show. Each sound says how many more it needs. Your picks save to this page as you go, and Claude reads them from here.</p>
<div id="list"></div>
</div>
<script>
const BATCH = ${JSON.stringify(batch)};
const SOUNDS = ${JSON.stringify(sounds)};
const picks = {};               // "id|i" -> {src,start,end}; "id|more" -> true; "id|note" -> text
let db = null, saveTimer = null, loaded = false;
const $ = (s) => document.querySelector(s);
const PLAY = '<svg viewBox="0 0 10 10"><path d="M2 1l7 4-7 4z"/></svg>', STOP = '<svg viewBox="0 0 10 10"><path d="M2 2h6v6H2z"/></svg>';
const audio = new Audio(); let playing = null;
audio.onended = () => setPlaying(null);
function setPlaying(btn) { if (playing) playing.innerHTML = PLAY; playing = btn; if (btn) btn.innerHTML = STOP; }

function render() {
  const list = $("#list"); list.textContent = "";
  for (const s of SOUNDS) {
    const card = document.createElement("section"); card.className = "sound";
    card.innerHTML = '<div class="top"><h2></h2><span class="need"></span></div><div class="what"></div><div class="takes"></div><div class="more"><label><input type="checkbox"> make more of this</label><input class="note" placeholder="what to change (deeper, less echo…)"></div>';
    card.querySelector("h2").textContent = s.id;
    card.querySelector(".what").textContent = s.what;
    const box = card.querySelector(".takes");
    for (const t of s.takes) {
      const k = s.id + "|" + t.i;
      const el = document.createElement("div"); el.className = "take" + (picks[k] ? " kept" : "");
      el.innerHTML = '<button class="play" aria-label="Play take">' + PLAY + '</button><button class="keep"></button><span class="n"></span>';
      el.querySelector(".n").textContent = "#" + (t.i + 1);
      const keep = el.querySelector(".keep"); keep.textContent = picks[k] ? "✓ Kept" : "Keep";
      keep.onclick = () => { if (picks[k]) delete picks[k]; else picks[k] = { src: t.src, start: t.start, end: t.end }; el.classList.toggle("kept", !!picks[k]); keep.textContent = picks[k] ? "✓ Kept" : "Keep"; count(); queueSave(); };
      const pb = el.querySelector(".play");
      pb.onclick = () => { if (playing === pb) { audio.pause(); setPlaying(null); return; } audio.loop = !!s.loop; audio.src = t.clip; audio.play().catch(() => setPlaying(null)); setPlaying(pb); };
      box.append(el);
    }
    const cb = card.querySelector("input[type=checkbox]"); cb.checked = !!picks[s.id + "|more"];
    cb.onchange = () => { if (cb.checked) picks[s.id + "|more"] = true; else delete picks[s.id + "|more"]; queueSave(); };
    const note = card.querySelector(".note"); note.id = "note-" + s.id; note.value = picks[s.id + "|note"] || "";
    note.oninput = () => { if (note.value) picks[s.id + "|note"] = note.value; else delete picks[s.id + "|note"]; queueSave(); };
    card.dataset.id = s.id; list.append(card);
  }
  count();
}
function count() {
  let done = 0;
  for (const card of document.querySelectorAll(".sound")) {
    const s = SOUNDS.find((x) => x.id === card.dataset.id);
    const have = s.takes.filter((t) => picks[s.id + "|" + t.i]).length;
    const n = card.querySelector(".need"); n.textContent = have + " of " + s.need + " more kept"; n.classList.toggle("ok", have >= s.need);
    if (have >= s.need) done++;
  }
  $("#prog").textContent = done + " of " + SOUNDS.length + " sounds done · ${total} takes";
}
function status(text, err) { const el = $("#save"); el.textContent = text; el.classList.toggle("err", !!err); }
function queueSave() {
  try { localStorage.setItem("picks-" + BATCH, JSON.stringify(picks)); } catch {}
  if (!db) { status("Saved on this device only — the page database isn't available here", true); return; }
  status("Saving…"); clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { await db.doc("picks/" + BATCH).set({ batch: BATCH, picks: { ...picks }, savedAt: new Date().toISOString() }); status("Saved"); }
    catch (e) { status("Couldn't save (" + (e && e.code || "error") + "). Your picks are kept on this device; try again in a moment.", true); }
  }, 600);
}
(async () => {
  try { const local = JSON.parse(localStorage.getItem("picks-" + BATCH) || "{}"); Object.assign(picks, local); } catch {}
  render();
  db = await window.claude?.use?.("db") ?? null;
  if (!db) { status("Saved on this device only — open it signed in to save to the page", true); return; }
  try { const snap = await db.doc("picks/" + BATCH).get(); const saved = snap && (snap.data ? snap.data() : snap); if (saved && saved.picks) { Object.assign(picks, saved.picks); render(); } status("Saved picks loaded"); }
  catch { status("Ready"); }
  loaded = true;
})();
</script>`;
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, `${batch}.html`), page);
const files = Object.fromEntries(sounds.flatMap((s) => s.takes.map((t) => [t.clip, path.relative(ROOT, path.join(path.dirname(SRC), t.clip)).replace(/\\/g, "/")])));
fs.writeFileSync(path.join(out, `${batch}.files.json`), JSON.stringify(files));
console.log(`${batch}: ${sounds.length} sounds, ${total} takes, ${Object.keys(files).length} clip files`);
