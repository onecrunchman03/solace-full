// Builds docs/survivorz/sourcing/free.html from the research JSON in docs/survivorz/sourcing/free/.
import fs from "node:fs";
import path from "node:path";
const DIR = "C:/Users/you/code/solace/docs/survivorz/sourcing/free";
const load = (f) => { const p = path.join(DIR, f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : []; };
const props = load("free_props.json"), items = load("free_items.json"), tex = load("free_textures.json"), snd = load("free_sound.json"), anim = load("free_anim_vfx.json"), gaps = load("free_gaps.json");

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const lic = (e) => {
  const l = String(e.licence || "");
  const cls = /cc0|public domain|cc-0/i.test(l) ? "cc0" : /by/i.test(l) ? "ccby" : "other";
  return `<span class="lic ${cls}">${esc(l)}</span>`;
};
const card = (e) => `<article>${e.img && /^https?:/.test(e.img) && !/fonts\.googleapis/.test(e.img) ? `<a href="${esc(e.url)}" target="_blank"><img loading="lazy" src="${esc(e.img)}" alt=""></a>` : ""}<div class="b"><h4><a href="${esc(e.url)}" target="_blank">${esc(e.name)}</a></h4><div class="by">${esc(e.author)}${e.tris ? " · " + esc(e.tris) + " tris" : ""}${e.res ? " · " + esc(e.res) : ""}</div>${lic(e)}${e.realistic === false ? ' <span class="lic warn">not photoreal</span>' : ""}${e.credit ? `<div class="credit">Credit: ${esc(e.credit)}</div>` : ""}${(e.note || e.notes) ? `<div class="note">${esc(e.note || e.notes)}</div>` : ""}</div></article>`;
const row = (e) => `<tr><td><a href="${esc(e.url)}" target="_blank">${esc(e.name)}</a><div class="by">${esc(e.author)}</div></td><td>${esc(e.fills)}</td><td>${lic(e)}${e.credit ? `<div class="credit">${esc(e.credit)}</div>` : ""}</td><td class="note">${esc(e.notes || e.note || "")}</td></tr>`;

function grouped(list, title, cards = true) {
  if (!list.length) return "";
  const by = new Map();
  for (const e of list) { const k = (e.fills || "other").trim(); if (!by.has(k)) by.set(k, []); by.get(k).push(e); }
  const body = [...by.entries()].map(([k, v]) => cards
    ? `<details open><summary>${esc(k)} <span class="n">${v.length}</span></summary><div class="grid">${v.map(card).join("")}</div></details>`
    : `<details><summary>${esc(k)} <span class="n">${v.length}</span></summary><table><tr><th>Asset</th><th>Fills</th><th>Licence</th><th>Notes</th></tr>${v.map(row).join("")}</table></details>`).join("");
  return `<h3>${esc(title)} <span class="n">${list.length}</span></h3>${body}`;
}
const sec = (id, h, intro, inner) => inner ? `<section id="${id}"><h2>${esc(h)}</h2><p class="intro">${esc(intro)}</p>${inner}</section>` : "";
const propCats = { lab: "Lab equipment", medical: "Medical", office: "Office & lived-in", "security-industrial": "Security & industrial", architecture: "Doors, vents & light fixtures" };

const parts = [
  sec("props", "Facility props", "Free models to dress the facility. Photoreal only; licence checked on each model's own page.",
    Object.entries(propCats).map(([k, t]) => grouped(props.filter((e) => e.category === k), t)).join("")),
  sec("items", "Survivor items", "Free models for everything the buy list doesn't cover. Poly Haven picks come first where they exist (photo-scanned, CC0).",
    grouped(items, "Items")),
  sec("gaps", "Filling the asset-check gaps", "Models fetched on 2026-10-23 for the lines ASSET-CHECK.md marked missing. All downloaded and opened; each still needs packing (real-world scale, texture size, materials).",
    grouped(gaps, "Gap fills")),
  sec("textures", "Textures, lighting, decals, fonts", "All CC0 or public domain unless marked. ambientCG and Poly Haven go to 8K.",
    grouped(tex.filter((e) => e.category === "material"), "Materials") + grouped(tex.filter((e) => e.category === "hdri"), "Lighting environments (HDRIs)") + grouped(tex.filter((e) => e.category === "decal"), "Decals") + grouped(tex.filter((e) => e.category === "font"), "Fonts (SIL Open Font License)", false)),
  sec("sound", "Sound and ambience", "Sonniss GDC libraries (free, no credit, no AI training), Freesound CC0 (each page checked), OpenGameArt CC0. Log each page and date when it's downloaded, in case of a false copyright claim.",
    grouped(snd.filter((e) => e.category === "sonniss"), "Sonniss GDC bundle libraries", false) + grouped(snd.filter((e) => e.category === "sfx"), "Sound effects", false) + grouped(snd.filter((e) => e.category === "ambience"), "Ambience and score material", false)),
  sec("anim", "Animation and effects", "Free motion capture beyond Mixamo, and free effect textures. Entries marked EXCLUDED are kept so nobody uses them by mistake.",
    grouped(anim.filter((e) => e.category === "animation"), "Animation", false) + grouped(anim.filter((e) => e.category === "vfx"), "Effects (VFX)", false)),
];
const counts = `${props.length} props · ${items.length} items · ${tex.length} textures/decals/fonts · ${snd.length} sounds · ${anim.length} animation/effects`;
const nav = [["props", "Facility props"], ["items", "Items"], ["textures", "Textures"], ["sound", "Sound"], ["anim", "Animation & VFX"]].map(([i, t]) => `<a href="#${i}">${t}</a>`).join("");
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Survivorz Free Assets</title><style>
:root{--bg:#121212;--panel:#1c1c1e;--ink:#eee;--soft:#aaa;--acc:#d98a4f;--line:#333}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){--bg:#f6f4f1;--panel:#fff;--ink:#222;--soft:#666;--line:#ddd}}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,sans-serif;padding:20px 16px}
h1{margin:0}.lede{color:var(--soft);margin:4px 0 12px}
nav{position:sticky;top:0;background:var(--bg);padding:8px 0;display:flex;gap:14px;flex-wrap:wrap;border-bottom:1px solid var(--line);z-index:2}
a{color:var(--acc);text-decoration:none}h2{margin:28px 0 4px}h3{margin:18px 0 6px;color:var(--soft)}.intro{color:var(--soft);margin:0 0 8px}
details{margin:6px 0;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:6px 10px}summary{cursor:pointer;font-weight:600}
.n{color:var(--soft);font-weight:400;font-size:.85em}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(220px,100%),1fr));gap:10px;margin:8px 0}
article{border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--bg)}
article img{width:100%;height:150px;object-fit:cover;display:block;background:#000}.b{padding:8px}
h4{margin:0 0 2px;font-size:.95em}.by{color:var(--soft);font-size:.85em}
.lic{display:inline-block;font-size:.75em;padding:1px 6px;border-radius:10px;margin-top:4px;border:1px solid var(--line)}
.lic.cc0{color:#7fc97f;border-color:#7fc97f}.lic.ccby{color:#e6b85c;border-color:#e6b85c}.lic.warn{color:#e07070;border-color:#e07070}
.credit{font-size:.78em;color:var(--soft);margin-top:4px}.note{font-size:.8em;color:var(--soft);margin-top:4px}
table{width:100%;border-collapse:collapse;margin:6px 0}td,th{border-top:1px solid var(--line);padding:6px;text-align:left;vertical-align:top}th{color:var(--soft);font-weight:500}
</style></head><body><h1>Solace Survivorz — free assets</h1><p class="lede">${counts}. Green = CC0 (no credit needed), amber = CC-BY (credit goes in the stream description). Nothing has been downloaded yet.</p><nav>${nav}</nav>${parts.join("")}</body></html>`;
fs.writeFileSync("C:/Users/you/code/solace/docs/survivorz/sourcing/free.html", html);
console.log(counts);
