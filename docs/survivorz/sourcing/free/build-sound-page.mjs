// Builds docs/survivorz/sourcing/sound-downloads.html: what Josh downloads himself
// (Sonniss bundles, Freesound, itch.io), from free_sound.json.
import fs from "node:fs";
const D = "C:/Users/you/code/solace/docs/survivorz/sourcing";
const all = JSON.parse(fs.readFileSync(`${D}/free/free_sound.json`, "utf8"));
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const yearOf = (x) => (x.name.match(/20\d\d/) || ["?"])[0];

const son = all.filter((x) => x.category === "sonniss");
const years = [...new Set(son.map(yearOf))].sort();
const sonHtml = years.map((y) => {
  const libs = son.filter((x) => yearOf(x) === y);
  const where = y === "2026" ? "https://gdc.sonniss.com/" : "https://sonniss.com/gameaudiogdc";
  const label = y === "2023" ? "2021–2023 (one download)" : y;
  return `<details${y >= "2023" ? " open" : ""}><summary><b>${esc(label)}</b> — ${libs.length} libraries we use · <a href="${where}" target="_blank">download page →</a></summary><ul>${libs.map((x) => `<li><a href="${esc(x.url)}" target="_blank">${esc(x.name.replace(/^Sonniss GDC \d{4}\s*-\s*/, ""))}</a> <span class="by">${esc(x.author)}</span><div class="f">${esc(x.fills)}</div></li>`).join("")}</ul></details>`;
}).join("");

const fs_ = all.filter((x) => x.url.includes("freesound.org"));
const GROUPS = [
  ["zombies", /zombie/], ["guns", /gunshot|pistol|shotgun|reload|casing|shell|cock|ak47|m16|9mm/],
  ["flesh and bone", /flesh|bone|blood|gore|knife|stab|body fall|carcass/], ["footsteps", /footstep|walking and running/],
  ["doors", /door|lock\/unlock|airlock|hiss|pressure release|elevator/], ["lights and electricity", /fluorescent|spark|electric|mains hum|light fixture/],
  ["alarms, PA, keypads", /alarm|siren|klaxon|chime|keypad|card reader|buzz/],
  ["score: drones, risers, stings", /drone|riser|stinger|stab|boom|impact|choir|pad|horror ambience|horror room|otherworldly/],
  ["room tones and machines", /hvac|room tone|server|generator|fridge|ambience|ventilation|boiler|drip|rumble|metro/],
  ["survival foley", /./],
];
const groups = new Map(GROUPS.map(([k]) => [k, []]));
for (const x of fs_) {
  const t = (x.fills || "").toLowerCase();
  const k = GROUPS.find(([, re]) => re.test(t))?.[0] || "other";
  groups.get(k).push(x);
}
const fsHtml = [...groups.entries()].filter(([, v]) => v.length).map(([k, v]) =>
  `<tr><td class="k">${esc(k)} <span class="by">${v.length}</span></td><td>${v.map((x) => `<div><a href="${esc(x.url)}" target="_blank">${esc(x.name)}</a> <span class="by">by ${esc(x.author)}</span> <span class="f">${esc((x.fills || "").split(" - ").slice(1).join(" - "))}</span></div>`).join("")}</td></tr>`).join("");

const itch = all.filter((x) => /itch.io|kenney.nl/.test(x.url));
const itchHtml = itch.map((x) => `<li><a href="${esc(x.url)}" target="_blank">${esc(x.name)}</a> — ${esc(x.licence)}${x.credit ? `<div class="f">Credit: ${esc(x.credit)}</div>` : ""}${x.notes ? `<div class="f">${esc(x.notes)}</div>` : ""}</li>`).join("");

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Survivorz Sound Downloads</title><style>
:root{--bg:#121212;--panel:#1c1c1e;--ink:#eee;--soft:#aaa;--acc:#d98a4f;--line:#333}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){--bg:#f6f4f1;--panel:#fff;--ink:#222;--soft:#666;--line:#ddd}}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,sans-serif;padding:20px 16px;max-width:1100px}
a{color:var(--acc);text-decoration:none}h1{margin:0}h2{margin:28px 0 6px}.lede{color:var(--soft)}
.box{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:10px 14px;margin:10px 0}
details{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:6px 12px;margin:6px 0}summary{cursor:pointer}
ul{margin:6px 0;padding-left:18px}li{margin:4px 0}.by{color:var(--soft);font-size:.85em}.f{color:var(--soft);font-size:.85em}
table{width:100%;border-collapse:collapse}td{border-top:1px solid var(--line);padding:6px;vertical-align:top}td.k{width:170px;color:var(--soft);text-transform:capitalize}
ol li{margin:6px 0}code{background:var(--panel);padding:1px 4px;border-radius:4px}
</style></head><body>
<h1>Survivorz — sounds to download</h1>
<p class="lede">These need a click from you: Sonniss is a big bundle download, and Freesound and itch.io need a sign-in or a button press. Everything here was checked as free for a monetised YouTube stream. I'm downloading the OpenGameArt and Kenney sounds myself.</p>

<h2>1. Sonniss GDC bundles (${son.length} libraries)</h2>
<div class="box"><ol>
<li>Open each year's download page below and download that year's bundle. It's free, no sign-up.</li>
<li>Save them to <code>D:\\solace-ai\\sonniss\\&lt;year&gt;\\</code> (about 200 GB in total; your C: drive only has ~57 GB free). The years are unzipped there, and I copy out only the libraries listed, into the project.</li>
<li>If space or time is short, do the open years first (2023, 2024, 2026). They hold the indoor guns, the zombie test subjects and the newest drones.</li>
</ol></div>
${sonHtml}

<h2>2. Freesound (${fs_.length} sounds, all CC0)</h2>
<div class="box">Freesound needs a free account to download original files. Two ways:
<ol><li><b>Faster (recommended):</b> make an account, then go to <a href="https://freesound.org/apiv2/apply" target="_blank">freesound.org/apiv2/apply</a> and create an API credential. Tell me when it's done and I'll walk you through one authorise click; then I download all ${fs_.length} myself.</li>
<li><b>By hand:</b> sign in and click Download on each link below, saving into <code>assets\\New Assets\\freesound\\</code>.</li></ol></div>
<table>${fsHtml}</table>

<h2>3. itch.io and Kenney (${itch.length})</h2>
<div class="box">Free, but each needs a "Download" click on the page. Save into <code>assets\\New Assets\\itch\\</code>.<ul>${itchHtml}</ul></div>
</body></html>`;
fs.writeFileSync(`${D}/sound-downloads.html`, html);
console.log("sonniss", son.length, "years", years.join(","), "freesound", fs_.length, "groups", groups.size, "itch", itch.length);
