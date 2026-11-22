// SOLACE SURVIVORZ: everything we HAVE, in one list, for validating a mechanic
// list against (Josh, 2026-10-23: "validate their output against our asset
// list"). Read-only: it never moves, unpacks or changes a file.
//
//   node scripts/survivorz/asset-inventory.mjs            writes the inventory
//   node scripts/survivorz/asset-inventory.mjs --find hammer door   searches it
//
// Writes assets/downloads/survivorz/inventory.json and inventory.md (gitignored,
// beside the assets). Each entry has a STATE, which is the whole point:
//   in-game     packed and loadable now (a clip in a body, a final sound, a
//               built effect recipe, a packed prop, a gore piece)
//   staged      processed but not packed into the game yet
//   downloaded  on disk, not processed (a zip, an FBX, a texture pack)
//   wanted      named in the plan (ASSETS.md / GAPS.md / sourcing) and not on disk
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const S = path.join(ROOT, "assets", "downloads", "survivorz");
const NEW = path.join(ROOT, "assets", "New Assets");
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, "/");
const exists = (p) => { try { fs.statSync(p); return true; } catch { return false; } };
const walk = (dir, out = []) => {
  if (!exists(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};
const glbJson = (file) => {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(8) !== b.length) return null;     // still being written
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString("utf8"));
};

/** What's inside an archive (model / texture / sound names), so a planned item
 *  sitting unopened in a zip still counts as downloaded. Windows' own tar reads
 *  zip and rar; anything it can't read is just listed by its file name. */
const TAR = process.platform === "win32" ? "C:/Windows/System32/tar.exe" : "tar";
function archiveNames(file) {
  if (!/\.(zip|rar|7z)$/i.test(file)) return [];
  try {
    const out = execFileSync(TAR, ["-tf", file], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 });
    const names = out.split(/\r?\n/).map((l) => path.basename(l)).filter((n) => /\.(fbx|glb|gltf|blend|obj|png|jpg|tga|wav|ogg|mp3|uasset)$/i.test(n));
    return [...new Set(names.map((n) => n.replace(/\.[^.]+$/, "")))].slice(0, 200);
  } catch {
    return [];
  }
}

/** What files call the planned items, where it isn't their plain name. */
const ALIASES = {
  "keycards": ["keycard", "access card", "acces card", "id card", "acces cards"],
  "rifle": ["rifle", "hk416"],
  "shells": ["shell", "eject casing", "casing"],
  "casings": ["casing", "eject casing"],
  "pipe": ["lead pipe", "metal pipe", "steel pipe", "iron pipe"],
  "cans": ["food can", "can rusted", "canned"],
  "walkie-talkie": ["walkie", "radio transceiver", "two way radio"],
  "med kit": ["first aid", "medkit", "medical kit"],
  "magazines": ["magazine", "mag"],
  "water bottles": ["water bottle", "plastic bottle"],
  "camp stove": ["stove", "camp stove"],
  "kitchen knife": ["kitchen knife", "chef knife"],
  "energy bars": ["energy bar", "granola bar", "chocolate bar"],
  "noisemaker": ["alarm clock"],
  "water purifier": ["purifier", "water filter"],
  "pipe bomb": ["pipe bomb", "pipebomb"],
  "batteries": ["battery"],
  "backpack": ["backpack"],
  "holsters": ["holster"],
  "bandage roll": ["bandage"],
  "pill bottle": ["pill bottle", "pills", "medicine bottle"],
  "syringe/antiviral": ["syringe", "injector"],
  "the lazarus vial": ["vial"],
  "lazarus vial": ["vial"],
  "bandages on wounds": ["bandage"],
  "a flashlight strap": ["flashlight strap"],
  "flashlight strap": ["flashlight strap"],
  "a reinforced barricade": ["barricade"],
  "reinforced barricade": ["barricade"],
};

const items = [];
const add = (kind, name, state, where, extra = {}) => items.push({ kind, name, state, where, ...extra });

// ---- ANIMATIONS: the clips packed into the bodies -----------------------------
const game = path.join(S, "game");
const clipBodies = new Map();   // clip -> Set(body)
const bodies = exists(game) ? fs.readdirSync(game).filter((f) => f.endsWith(".glb")) : [];
const unreadable = [];
for (const f of bodies) {
  const j = glbJson(path.join(game, f));
  if (!j) { unreadable.push(f); continue; }
  for (const a of j.animations ?? []) {
    if (!clipBodies.has(a.name)) clipBodies.set(a.name, new Set());
    clipBodies.get(a.name).add(f.replace(/\.glb$/, ""));
  }
}
const survivorIds = bodies.filter((f) => !f.startsWith("zombie-")).map((f) => f.replace(/\.glb$/, ""));
for (const [clip, on] of [...clipBodies].sort()) {
  const surv = survivorIds.filter((b) => on.has(b)).length;
  const zomb = [...on].filter((b) => b.startsWith("zombie-")).length;
  const who = surv && zomb ? "both" : surv ? "survivor" : "zombie";
  add("animation", clip, "in-game", "game/*.glb", { who, bodies: on.size, survivors: surv, zombies: zomb });
}
// clips processed but not packed
const outDir = path.join(S, "out");
if (exists(outDir)) {
  const seen = new Set(clipBodies.keys());
  const staged = new Set();
  for (const p of walk(outDir)) if (p.endsWith(".json")) staged.add(path.basename(p, ".json"));
  for (const c of staged) if (!seen.has(c) && !/^(hug-gaps|cal|natural.*)$/.test(c)) add("animation", c, "staged", "out/<body>/");
}

// ---- SOUNDS: the final set ---------------------------------------------------------
const man = path.join(S, "sound", "final", "manifest.json");
if (exists(man)) {
  const m = JSON.parse(fs.readFileSync(man, "utf8"));
  for (const [id, d] of Object.entries(m.sounds ?? {})) add("sound", id, "in-game", "sound/final/game/" + id, { group: d.group, takes: (d.files ?? []).length, music: !!d.music });
}

// ---- EFFECTS: the built recipes + their textures --------------------------------------
const fxSrc = path.join(ROOT, "client", "src", "survivorz", "fx");
for (const mod of ["effects", "gunfx", "blood", "fire", "ambient", "body", "breaking"]) {
  const f = path.join(fxSrc, mod + ".ts");
  if (!exists(f)) continue;
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/^export (?:function|const) ([a-zA-Z0-9_]+)/gm)) {
    if (/^[A-Z_]+$/.test(m[1])) continue;   // constants, not recipes
    add("effect", m[1], "in-game", `client/src/survivorz/fx/${mod}.ts`);
  }
}
for (const p of walk(path.join(S, "fx"))) {
  const r = rel(p);
  if (/\/(review|bench|src)\//.test(r) || !/\.(ktx2|glb|json)$/.test(r)) continue;
  if (r.includes("/gore/")) continue;     // listed piece by piece below
  if (r.endsWith(".ktx2") || r.endsWith(".json")) add("effect-texture", path.basename(p).replace(/\.(ktx2|json)$/, ""), "in-game", r);
}
const gore = path.join(S, "fx", "gore", "gore.json");
if (exists(gore)) {
  const g = JSON.parse(fs.readFileSync(gore, "utf8"));
  for (const c of g.caps ?? []) add("gore", "cap " + c.name, "in-game", "fx/gore/" + c.file);
  for (const c of g.gibs ?? []) add("gore", "gib " + c.name, "in-game", "fx/gore/" + c.file);
}

// ---- MODELS: bodies, guns, props ----------------------------------------------------------
for (const f of bodies) add("model", f.replace(/\.glb$/, ""), unreadable.includes(f) ? "staged" : "in-game", "game/" + f, { what: f.startsWith("zombie-") ? "zombie body" : "survivor body" });
for (const p of walk(path.join(S, "props"))) {
  if (!p.endsWith(".glb")) continue;
  add("model", path.basename(p, ".glb"), "in-game", rel(p), { what: p.includes(`${path.sep}guns${path.sep}`) ? "gun" : "prop" });
}

// ---- DOWNLOADED, NOT PROCESSED -----------------------------------------------------------
const log = path.join(S, "free", "LOG.json");
const logged = new Set();
if (exists(log)) {
  const L = JSON.parse(fs.readFileSync(log, "utf8"));
  for (const e of Array.isArray(L) ? L : Object.values(L)) {
    add("download", e.name, "downloaded", "free/ (" + (e.page ?? "") + ")", { category: e.category, fills: e.fills, licence: e.licence });
    for (const f of e.files ?? []) logged.add(path.basename(f));
  }
}
for (const p of walk(path.join(S, "free"))) {
  const b = path.basename(p);
  if (logged.has(b) || /\.(json|txt|css|html|js)$/i.test(b)) continue;
  if (/\.(zip|rar|7z|fbx|glb|gltf|blend|obj|png|jpg|wav|ogg|mp3|flac)$/i.test(b)) add("download", b, "downloaded", rel(p), { contains: archiveNames(p) });
}
for (const p of walk(NEW)) add("download", path.basename(p), "downloaded", rel(p), { inbox: true, contains: archiveNames(p) });

// ---- WANTED: the plan's own lists ----------------------------------------------------------
// ASSETS.md §2c items, read straight out of its table, so the inventory says
// which planned items have a model in game and which don't.
const assetsMd = path.join(ROOT, "docs", "survivorz", "ASSETS.md");
if (exists(assetsMd)) {
  const md = fs.readFileSync(assetsMd, "utf8");
  const sec = md.split("### 2c.")[1]?.split("###")[0] ?? "";
  for (const row of sec.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Group") && !l.startsWith("|---"))) {
    const [, group, list] = row.split("|").map((x) => x.trim());
    for (const name of list.split(",").map((x) => x.replace(/✅/g, "").trim()).filter(Boolean)) {
      // How a planned item is named in files: every word must appear (so "fire
      // axe" is never a fire extinguisher), "a/b" means either, and ALIASES
      // cover the names files actually use.
      const clean = name.toLowerCase().replace(/\(.*?\)/g, "").replace(/^(a|the) /, "").trim();
      const phrases = (ALIASES[clean] ?? clean.split("/")).map((ph) => ph.trim().split(/[ ,]+/).map((w) => w.replace(/(ies)$/, "y").replace(/(es|s)$/, "")).filter((w) => w.length >= 3));
      const text = (i) => [i.name, i.fills ?? "", ...(i.contains ?? [])].join(" ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().replace(/[_-]/g, " ");
      const hits = (i) => phrases.some((ws) => ws.length && ws.every((w) => new RegExp(`\\b${w}(s|es)?\\b`, "i").test(text(i))));
      const byEffect = clean === "shells" || clean === "casings";   // brass is drawn by the casings effect, not a model
      const have = items.find((i) => (i.kind === "model" || (byEffect && i.kind === "effect")) && hits(i));
      const isModel = (i) => i.kind === "download" && !/\.(wav|mp3|ogg|flac)$/i.test(i.where) && !/texture|sound|decal|music|hdri|sfx|ambience|font|material/i.test(i.category ?? "");
      const found = !have && items.filter((i) => isModel(i) && hits(i));
      const state = have ? "in-game" : found && found.length ? "downloaded" : "wanted";
      add("item", name, state, "ASSETS.md §2c " + group, { group, ...(found && found.length ? { sources: found.slice(0, 4).map((i) => i.where) } : {}) });
    }
  }
}

// ---- write -----------------------------------------------------------------------------------
const by = (k) => items.filter((i) => i.kind === k);
const count = (k, s) => by(k).filter((i) => i.state === s).length;
const kinds = [...new Set(items.map((i) => i.kind))];
const md = [
  `# Survivorz asset inventory`,
  ``,
  `Made ${new Date().toISOString().slice(0, 16).replace("T", " ")} by scripts/survivorz/asset-inventory.mjs. Read-only.`,
  unreadable.length ? `\n**Being rewritten while this ran (re-run to include):** ${unreadable.join(", ")}\n` : ``,
  `| Kind | in-game | staged | downloaded | wanted |`,
  `|---|---|---|---|---|`,
  ...kinds.map((k) => `| ${k} | ${count(k, "in-game")} | ${count(k, "staged")} | ${count(k, "downloaded")} | ${count(k, "wanted")} |`),
  ``,
  ...kinds.flatMap((k) => [`## ${k}`, ``, ...by(k).map((i) => `- \`${i.state}\` ${i.name}${i.who ? ` (${i.who}, ${i.bodies} bodies)` : ""}${i.group ? ` · ${i.group}` : ""}${i.what ? ` · ${i.what}` : ""} — ${i.where}${i.sources ? ` · found in ${i.sources.join(" | ")}` : ""}${i.contains?.length ? ` · contains ${i.contains.length} files` : ""}`), ``]),
].join("\n");

const find = process.argv.indexOf("--find");
if (find > 0) {
  const words = process.argv.slice(find + 1).map((w) => w.toLowerCase());
  const hits = items.filter((i) => words.every((w) => JSON.stringify(i).toLowerCase().includes(w)));
  for (const h of hits) {
    const inside = (h.contains ?? []).filter((c) => words.some((w) => c.toLowerCase().includes(w)));
    console.log(`${h.state.padEnd(10)} ${h.kind.padEnd(14)} ${h.name}  — ${h.where}${inside.length ? `\n${" ".repeat(26)}contains: ${inside.slice(0, 6).join(", ")}` : ""}${h.sources ? `\n${" ".repeat(26)}found in: ${h.sources.join(" | ")}` : ""}`);
  }
  console.log(`\n${hits.length} match(es) for: ${words.join(" ")}`);
} else {
  fs.writeFileSync(path.join(S, "inventory.json"), JSON.stringify({ made: new Date().toISOString(), unreadable, items }, null, 1));
  fs.writeFileSync(path.join(S, "inventory.md"), md);
  console.log(kinds.map((k) => `${k}: ${count(k, "in-game")} in game, ${count(k, "staged")} staged, ${count(k, "downloaded")} downloaded, ${count(k, "wanted")} wanted`).join("\n"));
  if (unreadable.length) console.log(`being rewritten (re-run later): ${unreadable.join(", ")}`);
  console.log(`wrote ${rel(path.join(S, "inventory.md"))}`);
}
