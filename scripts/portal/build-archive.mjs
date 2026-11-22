// THE PORTAL — compile the archive into the one file the server reads.
//
//   node scripts/portal/build-archive.mjs   → assets/portal/archive.json
//
// Reads docs/portal/archive (the English) and docs/portal/eshai (the hand
// translation), pairs them, and writes one JSON bundle: rooms, posts (the
// digest's turns are posts in naa-ren), profiles, pinned documents,
// Tharvend's hand-written log, the lexicon, the Fleet roll and the ring
// game. Run validate-archive.mjs first; this trusts it.
//
// THE ENGLISH NEVER LEAVES THE SERVER until a reader has earned it
// (src/portal/hall.ts decides). The bundle sits in assets/, read at boot.

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseLexicon } from "./lexicon-parse.mjs";

const ROOT = join(import.meta.dirname, "../..");
const A = (f) => readFileSync(join(ROOT, "docs/portal/archive", f), "utf8");
const E = (f) => readFileSync(join(ROOT, "docs/portal/eshai", f), "utf8");
const eshaiFiles = readdirSync(join(ROOT, "docs/portal/eshai")).filter((f) => f.endsWith(".md")).sort();

const GALAXIES = ["Theruun", "Oshkaa", "Paaruk", "Senwe", "Yulenai", "Maalith"];
/** Room ids, their Eshai names and kinds. The last room's name is the count
 *  mark: one glyph, drawn by the build, never spelled. */
const ROOMS = [
  { id: "shenai", name: "shenai", kind: "text" },
  { id: "naa-ren", name: "naa-ren", kind: "text" },
  { id: "kaal-ith", name: "kaal-ith", kind: "text", notation: true },
  ...GALAXIES.map((g) => ({ id: g.toLowerCase(), name: g, kind: "text", galaxy: g })),
  { id: "tharvend", name: "Tharvend", kind: "log" },
  { id: "last", name: null, kind: "last" },
  { id: "ren-ta'an", name: "ren-ta'an", kind: "voice" },
  { id: "keth-ren", name: "keth-ren", kind: "voice" },
];
const roomOf = (section, file) =>
  file.startsWith("galaxies") ? section?.toLowerCase() : file.startsWith("shenai") ? "shenai" : file.startsWith("kaal-ith") ? "kaal-ith" : file.startsWith("last-room") ? "last" : null;

/** Posts: "### t<turn> · <author>" blocks, by room. */
function parsePosts(text, file) {
  const out = [];
  let section = null, cur = null;
  const flush = () => { if (cur) out.push(cur); cur = null; };
  for (const line of text.split("\n")) {
    const h2 = line.match(/^## (.+)/);
    if (h2) { flush(); section = h2[1].trim(); continue; }
    const h = line.match(/^### t(\d+\.\d+) · ([^(]+?)\s*(\(draft.*)?$/);
    if (h) { flush(); cur = { room: roomOf(section, file), t: h[1], author: h[2].trim(), draft: !!h[3], lines: [], reacts: [] }; continue; }
    if (!cur) continue;
    if (line.startsWith("↳")) { cur.reacts.push(line.slice(1).trim()); continue; }
    if (/^---/.test(line)) { flush(); continue; }
    cur.lines.push(line);
  }
  flush();
  return out;
}
const cleanEn = (s) => s.replace(/\s*\[(?:ren|esh|tol|vaa|ka)(?:,[^\]]*)?\]/g, "").replace(/^\*\(.*\)\*$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
const reactsOf = (lines) => lines.flatMap((r) => r.split("·").map((p) => p.trim().match(/^([a-z']+):\s*(.+)$/)).filter(Boolean)
  .map((m) => ({ sign: m[1], by: m[2].split(",").map((s) => s.trim()) })));

const en = [
  ...parsePosts(A("shenai.md"), "shenai"), ...parsePosts(A("galaxies.md"), "galaxies"),
  ...parsePosts(A("kaal-ith.md"), "kaal-ith"), ...parsePosts(A("last-room.md"), "last-room"),
];
const eshai = new Map();
for (const f of eshaiFiles) {
  if (!/^(shenai|galaxies|kaal-ith|last-room)/.test(f)) continue;
  for (const p of parsePosts(E(f), f)) eshai.set(`${p.room}|${p.t}|${p.author}`, p);
}

const posts = [];
for (const p of en) {
  const e = eshai.get(`${p.room}|${p.t}|${p.author}`);
  if (!e) throw new Error(`no Eshai for ${p.room} t${p.t} ${p.author}`);
  const flags = e.lines.filter((l) => l.startsWith("% ")).map((l) => l.slice(2).trim());
  posts.push({
    room: p.room, t: Number(p.t), author: p.author, draft: p.draft, flags,
    en: cleanEn(p.lines.join("\n")),
    eshai: e.lines.filter((l) => !l.startsWith("% ")).join("\n").trim(),
    reacts: reactsOf(p.reacts),
  });
}

// The digest: one post per turn in naa-ren, by Oruun, on the turn exactly.
const eDigests = new Map();
for (const f of eshaiFiles.filter((f) => f.startsWith("naa-ren")))
  for (const m of E(f).matchAll(/^## Digest (\d+)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)) eDigests.set(m[1], m[2].trim());
for (const m of A("naa-ren.md").matchAll(/^## Digest (\d+)\n`([0-7 ]+)`\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)) {
  const items = m[3].split("\n").filter((l) => l.startsWith(">")).map((l) => l.replace(/^>\s?/, "")).join("\n")
    .split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const roll = items.some((p) => /^\*\(the Fleet roll/.test(p));
  posts.push({
    room: "naa-ren", t: parseInt(m[1], 8) - 0o13741, author: "Oruun Vael", draft: false, flags: roll ? ["roll"] : [],
    en: cleanEn(items.filter((p) => !/^\*\(.*\)\*$/s.test(p)).join("\n\n")),
    eshai: eDigests.get(m[1]),
    reacts: [], digest: m[1],
  });
}
posts.sort((a, b) => a.t - b.t || (a.room < b.room ? -1 : 1));
posts.forEach((p, i) => (p.id = i + 1));

// Profiles.
const eProfiles = new Map();
for (const m of E("profiles.md").matchAll(/^### (.+)\nStatus: (.*)\nBio: (.*)$/gm)) eProfiles.set(m[1].trim(), { status: m[2].trim(), bio: m[3].trim() });
const profiles = [];
let galaxy = null;
const prof = A("profiles.md").split("\n");
for (let i = 0; i < prof.length; i++) {
  const g = prof[i].match(/^## (\w+)$/); if (g) { galaxy = GALAXIES.includes(g[1]) ? g[1] : null; continue; }
  const p = prof[i].match(/^\*\*([^*]+)\*\* · keystone ([0-7]+) · joined t(-?[\d.]+)/);
  if (!p) continue;
  const status = (prof[i + 1].match(/^Status: \*(.*)\*$/) ?? [])[1] ?? "";
  let bio = (prof[i + 2] ?? "").replace(/^Bio: /, ""), j = i + 3;
  while (prof[j] && !/^\*\*|^## |^$/.test(prof[j])) bio += " " + prof[j++];
  const e = eProfiles.get(p[1]);
  profiles.push({ name: p[1], keystone: parseInt(p[2], 8), joined: Number(p[3]), galaxy,
    status: { en: status, eshai: e.status }, bio: { en: bio === "*(empty)*" ? "" : bio.trim(), eshai: e.bio === "% empty" ? "" : e.bio } });
}

// Pinned documents (the in-world text, not the build's notes).
const ePinned = new Map();
for (const m of E("pinned.md").matchAll(/^## (.+)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)) ePinned.set(m[1].trim(), m[2].replace(/^% .*$/gm, "").trim());
const pinned = [];
for (const m of A("pinned.md").matchAll(/^## (.+)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)) {
  const head = m[1].trim(), [where, title] = head.split(" — ");
  const room = where.toLowerCase();
  const enText = m[2].split("\n").filter((l) => !l.startsWith(">")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  pinned.push({ room, title, en: enText, eshai: ePinned.get(head) ?? "" });
}

// Tharvend's hand-written log and the phrases the build fills in.
const eLog = new Map();
for (const m of E("tharvend.md").matchAll(/^### (.+)\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm)) eLog.set(m[1].trim(), m[2].trim());
const log = [];
for (const m of A("tharvend.md").matchAll(/^### (t([\d.]+) · ([A-Z /-]+))\n([\s\S]*?)(?=^##|$(?![\s\S]))/gm)) {
  if (!eLog.has(m[1])) continue; // the generated drop-by-drop pairs
  log.push({ t: Number(m[2]), sign: m[3].trim(), en: m[4].replace(/^\*\(.*$/gms, "").trim(), eshai: eLog.get(m[1]) });
}
const generated = Object.fromEntries([...eLog].filter(([k]) => k.startsWith("generated ")).map(([k, v]) => [k.slice(10), v.split("\n")]));

// The lexicon and the names list.
const lexicon = [...parseLexicon(A("lexicon.md"))].map(([word, meaning]) => ({ word: word.replace(/^-|-$/g, ""), meaning }));
const names = [];
for (const m of A("lexicon.md").split(/^## Names in the archive\b/m)[1].matchAll(/^- \*\*([^*]+)\*\*/gm)) for (const n of m[1].split(/\s*,\s*/)) names.push(n.trim());

const fleetRoll = E("fleet-roll.md").split("\n").filter((l) => /^[A-Z][a-z]+ [A-Z][a-z]+!/.test(l)).join(" ").split("!").map((s) => s.trim()).filter(Boolean);
const ishaal = [...A("ishaal-game.md").matchAll(/^\s*([0-7]+)\s+.+?stone ([0-7]+)\s+([0-7]+)\.(\d) → ([0-7]+)\.(\d)/gm)]
  .map((m) => [parseInt(m[1], 8), parseInt(m[2], 8), parseInt(m[3], 8), +m[4], parseInt(m[5], 8), +m[6]]);

const bundle = { version: 1, built: "2026-10-30", rooms: ROOMS, posts, profiles, pinned, log, generated, lexicon, names, fleetRoll, ishaal };
mkdirSync(join(ROOT, "assets/portal"), { recursive: true });
writeFileSync(join(ROOT, "assets/portal/archive.json"), JSON.stringify(bundle));
console.log(`archive: ${posts.length} posts, ${profiles.length} profiles, ${pinned.length} pinned, ${log.length} log entries, ${lexicon.length} words, ${fleetRoll.length} roll names, ${ishaal.length} ring-game moves`);
