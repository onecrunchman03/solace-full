// THE PORTAL — is the drafted archive buildable?
//
// Reads docs/portal/archive/*.md (the hand-written archive, in deciphered
// English) and checks what the build will need from it: every post parses,
// times run forward, numbers are octal, authors are on the roster, reactions
// use the six signs, galaxy rooms fall silent in the order the galaxies fell,
// the digest's tick stamps step one turn at a time, every Eshai word spells
// in the 26 sounds — and how much of the archive's English the dictionary
// can actually say, which decides how the posts get rendered into Eshai.
//
// It prints counts and problems, never story text beyond a word list.
//   node scripts/portal/validate-archive.mjs [--words N]

import { readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dirname, "../../docs/portal/archive");
const read = (f) => readFileSync(join(DIR, f), "utf8");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };

const problems = [];
const warn = (where, what) => problems.push(`${where}: ${what}`);

// ---------------------------------------------------------------- sounds
const SOUNDS = ["aa", "ee", "ai", "kh", "sh", "th", "vh", "ng",
  "a", "e", "i", "o", "u", "p", "t", "k", "s", "d", "v", "h", "m", "n", "r", "l", "y", "w"];
// Our romanisation is inconsistent on purpose (PORTAL.md): uu is u, ah before a consonant is aa.
function spell(word) {
  const s = word.toLowerCase().replace(/uu/g, "u").replace(/ah(?![aeiou])/g, "aa").replace(/['\-·]/g, "");
  const out = [];
  for (let i = 0; i < s.length;) {
    const two = s.slice(i, i + 2);
    if (SOUNDS.includes(two) && two.length === 2) { out.push(two); i += 2; continue; }
    if (SOUNDS.includes(s[i])) { out.push(s[i]); i += 1; continue; }
    return { ok: false, bad: s[i] };
  }
  return { ok: true, glyphs: out };
}

// ---------------------------------------------------------------- lexicon
const lex = new Map(); // eshai -> meaning
const addLex = (w, m) => {
  const clean = w.replace(/\*/g, "").replace(/\(.*?\)/g, "").replace(/[.?!]+$/, "").trim();
  const mean = m.replace(/\*\*\(.*?\)\*\*/g, "").trim();
  if (clean && (!clean.includes(" ") || /^[a-z'\-]+ [a-z'\-]+$/i.test(clean))) lex.set(clean, lex.has(clean) ? `${lex.get(clean)}; ${mean}` : mean);
};
{
  // Two table shapes: vertical (| Eshai | Meaning | | Eshai | Meaning |) and
  // horizontal (a header row of words over a row of meanings — pronouns,
  // postpositions). A horizontal header has no "Eshai"/"Meaning" cell.
  const HEADS = /^(eshai|meaning|piece|makes|example|word|sign|particle|force)$/i;
  const rows = read("lexicon.md").split("\n");
  for (let r = 0; r < rows.length; r++) {
    if (!rows[r].startsWith("|")) continue;
    const cells = rows[r].split("|").slice(1, -1).map((c) => c.trim());
    if (cells.every((c) => /^-*$/.test(c))) continue;
    const prevIsTable = rows[r - 1]?.startsWith("|");
    const sep = rows[r + 1]?.startsWith("|") && /^\|[\s|-]+\|$/.test(rows[r + 1]);
    if (!prevIsTable && sep && !cells.some((c) => HEADS.test(c))) {
      const means = rows[r + 2]?.split("|").slice(1, -1).map((c) => c.trim()) ?? [];
      cells.forEach((w, i) => means[i] && addLex(w, means[i]));
      r += 2; continue;
    }
    for (let i = 0; i + 1 < cells.length; i += 3) {
      const [w, m] = [cells[i], cells[i + 1]];
      if (!w || !m || /^-+$/.test(w) || HEADS.test(w)) continue;
      addLex(w, m);
    }
  }
  // The linking words are a prose line: *a* and · *velu* but · …
  for (const m of read("lexicon.md").matchAll(/\*([a-z]+)\* ([a-z ]+?)(?= ·|\s*\(|\.\s*$)/gm)) addLex(m[1], m[2]);
  // Numbers, said digit by digit (PORTAL.md).
  ["nul zero", "en one", "dai two", "tir three", "kaav four", "pem five", "sul six", "hev seven", "en-nul eight"]
    .forEach((s) => { const [w, ...m] = s.split(" "); addLex(w, m.join(" ")); });
}
for (const w of lex.keys()) for (const part of w.split(/\s+/)) {
  const r = spell(part.replace(/^-|-$/g, ""));
  if (!r.ok) warn("lexicon", `"${w}" has "${r.bad}", which is not one of the 26 sounds`);
}

// ---------------------------------------------------------------- roster
const roster = new Map(); // name -> galaxy
let gal = null;
for (const line of read("profiles.md").split("\n")) {
  const g = line.match(/^## (\w+)/); if (g) gal = g[1];
  const p = line.match(/^\*\*([^*]+)\*\* · keystone (\d+)/);
  if (p) {
    roster.set(p[1], gal);
    if (/[89]/.test(p[2])) warn("profiles", `${p[1]}'s keystone ${p[2]} is not octal`);
  }
}
for (const name of roster.keys()) for (const part of name.split(/\s+/)) {
  const r = spell(part); if (!r.ok) warn("profiles", `name "${name}" has "${r.bad}", not a sound`);
}

// ---------------------------------------------------------------- posts
const SIGNS = ["ren", "ta'an", "ahel", "eeth", "sehu", "onn"];
const EVID = ["ren", "esh", "tol", "vaa", "ka"];
const posts = []; // {room, t, author, text}

function parseRoom(file, roomOf, start = null, into = posts, text = read(file)) {
  let room = start, cur = null;
  const flush = () => { if (cur) into.push(cur); cur = null; };
  for (const line of text.split("\n")) {
    const h2 = line.match(/^## (.+)/);
    if (h2) { flush(); room = roomOf(h2[1]) ?? room; continue; }
    const h = line.match(/^### t(\d+)\.(\d+) · ([^(]+?)\s*(\(draft.*)?$/);
    if (h) { flush(); cur = { room, file, t: Number(`${h[1]}.${h[2]}`), author: h[3].trim(), draft: !!h[4], text: "", reacts: [] }; continue; }
    if (!cur) continue;
    if (line.startsWith("↳")) { cur.reacts.push(line.slice(1).trim()); continue; }
    if (/^---/.test(line)) { flush(); continue; }
    cur.text += line + "\n";
  }
  flush();
}
const GALAXIES = ["Theruun", "Oshkaa", "Paaruk", "Senwe", "Yulenai", "Maalith"];
parseRoom("shenai.md", () => "shenai", "shenai");
parseRoom("galaxies.md", (h) => GALAXIES.includes(h.trim()) ? h.trim() : null);
parseRoom("kaal-ith.md", () => "kaal-ith", "kaal-ith");
parseRoom("last-room.md", () => "last-room", "last-room");

// digests
const digests = [];
{
  const txt = read("naa-ren.md");
  const re = /^## Digest (\d+)\n`([0-7 ]+)`\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm;
  let m;
  while ((m = re.exec(txt))) digests.push({ n: m[1], stamp: m[2].replace(/ /g, ""), text: m[3] });
}
// A digest's items are the paragraphs of its blockquote.
const digestItems = (text) => text.split("\n").filter((l) => l.startsWith(">")).map((l) => l.replace(/^>\s?/, ""))
  .join("\n").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  .filter((p) => !/^\*\(.*\)\*$/s.test(p)); // an italic (note) is a build instruction, not text

// ---------------------------------------------------------------- checks
const TURN_DAYS = 8 ** 17 / 1420405751.768 / 86400; // 18.35
const LAST_PLEA = 80.19;
const PLEAS_FROM = LAST_PLEA - 0.5 / TURN_DAYS;
// Posters who write through somebody else's keystone. The build files the
// post under the keystone's roster row; the text says who is writing.
const BORROWED = { Ris: "Ahriel Tovaa" }; // Paelu's sibling, on the Tovaa settlement's shared keystone (BIBLE t61)
for (const [who, row] of Object.entries(BORROWED)) if (!roster.has(row)) warn("profiles", `${who} writes on ${row}'s keystone, which has no roster row`);
const known = new Set([...roster.keys(), ...Object.keys(BORROWED), "Tharvend"]);
const byRoom = new Map();
for (const p of posts) {
  const where = `${p.file} t${p.t} ${p.author}`;
  if (!p.room) warn(where, "post outside any room section");
  if (!known.has(p.author)) warn(where, `author "${p.author}" is not on the roster`);
  if (p.t < 0 || p.t > 80.2) warn(where, "time outside t0–t80.19");
  if (!p.text.trim()) warn(where, "empty post");
  for (const n of p.text.match(/\b\d+\b/g) ?? []) if (/[89]/.test(n)) warn(where, `number ${n} is not octal`);
  for (const tag of p.text.match(/\[([a-z]+)\]/g) ?? []) if (!EVID.includes(tag.slice(1, -1))) warn(where, `unknown evidential ${tag}`);
  for (const r of p.reacts) for (const part of r.split("·")) {
    const m = part.trim().match(/^([a-z']+):\s*(.+)$/);
    if (!m) { warn(where, `unreadable reaction line "${part.trim()}"`); continue; }
    if (!SIGNS.includes(m[1])) warn(where, `reaction sign "${m[1]}" is not one of the six`);
    for (const who of m[2].split(",").map((s) => s.trim())) if (!known.has(who)) warn(where, `reaction by "${who}", not on the roster`);
  }
  // The last room's final half day is the pleas, and nobody reacts to them
  // (PORTAL.md → Reactions). The days before it are people keeping each other.
  if (p.room === "last-room" && p.reacts.length && p.t >= PLEAS_FROM) warn(where, "somebody reacted to a last plea");
  (byRoom.get(p.room) ?? byRoom.set(p.room, []).get(p.room)).push(p);
}
for (const [room, list] of byRoom) for (let i = 1; i < list.length; i++)
  if (list[i].t < list[i - 1].t) warn(`${room}`, `t${list[i].t} (${list[i].author}) comes after t${list[i - 1].t} — out of order`);

// galaxy rooms fall silent in order
const lastOf = (r) => Math.max(...(byRoom.get(r) ?? [{ t: -1 }]).map((p) => p.t));
for (let i = 1; i < GALAXIES.length; i++)
  if (!(lastOf(GALAXIES[i - 1]) < lastOf(GALAXIES[i])))
    warn("galaxies", `${GALAXIES[i - 1]} last speaks at t${lastOf(GALAXIES[i - 1])}, after ${GALAXIES[i]} (t${lastOf(GALAXIES[i])})`);

// digest stamps: one turn apart, seventeen zeros, numbers count in octal
for (let i = 0; i < digests.length; i++) {
  const d = digests[i];
  if (!/0{17}$/.test(d.stamp)) warn(`digest ${d.n}`, "stamp does not end in seventeen zeros");
  if (/[89]/.test(d.n)) warn(`digest ${d.n}`, "digest number not octal");
  if (i) {
    const step = parseInt(d.n, 8) - parseInt(digests[i - 1].n, 8);
    const turn = BigInt("0o" + d.stamp.slice(0, -17)) - BigInt("0o" + digests[i - 1].stamp.slice(0, -17));
    if (step !== 1) warn(`digest ${d.n}`, `follows ${digests[i - 1].n} (step ${step}, want 1)`);
    if (turn !== 1n) warn(`digest ${d.n}`, `stamp is ${turn} turns after the last, want 1`);
  }
  for (const n of d.text.match(/\b\d+\b/g) ?? []) if (/[89]/.test(n)) warn(`digest ${d.n}`, `number ${n} is not octal`);
  // The opening line counts the headings that follow ("Six headings.").
  const said = d.text.match(/\b(one|two|three|four|five|six) headings?\b/i)?.[1]?.toLowerCase();
  // Oruun counts headings heard over the relay; one "heard in the hall" is not counted.
  const heads = GALAXIES.filter((g) => new RegExp(`\\*\\*${g.toUpperCase()}\\*\\*(?! \\*\\(heard in the hall)`).test(d.text)).length;
  const N = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  if (!said) warn(`digest ${d.n}`, "opening line gives no heading count");
  else if (N[said] !== heads) warn(`digest ${d.n}`, `says ${said} headings, carries ${heads}`);
}
// Galaxy headings drop out in the order the galaxies fell, and never come back.
for (const g of GALAXIES) {
  const has = digests.map((d) => new RegExp(`\\*\\*${g.toUpperCase()}\\*\\*`).test(d.text));
  const gone = has.indexOf(false);
  if (gone >= 0 && has.slice(gone).some(Boolean)) warn("naa-ren", `${g}'s heading disappears at ${digests[gone].n} and comes back`);
}

// ---------------------------------------------------------------- can the dictionary say it?
// Every English word the archive uses, against every English word the
// lexicon's meanings contain. Crude on purpose (a suffix-stripper, not a
// grammar): it measures the size of the gap, not its exact shape.
const STOP = new Set(("a an the and or but if then so of to in on at by for with from as is are was were be been being it its it's this that these those i me my we us our you your he him his she her they them their there here not no yes do does did done have has had will would can could should may might must shall just than too very also all any some one what which who whom whose when where why how up down out over into onto off about again only own same such more most other each both few nor am i'm i've i'll i'd you're you've we're we've they're they've isn't wasn't don't didn't doesn't can't won't couldn't wouldn't shouldn't haven't hasn't let let's").split(" "));
// Irregular English forms, so "heard" finds "to hear" rather than reading as a gap.
const IRREG = Object.fromEntries(("heard:hear said:say left:leave held:hold kept:keep sent:send went:go found:find " +
  "saw:see seen:see told:tell came:come made:make gave:give given:give took:take taken:take knew:know known:know " +
  "thought:think lost:lose children:child brought:bring stood:stand sat:sit slept:sleep woke:wake ate:eat " +
  "spoke:speak wrote:write written:write read:read began:begin begun:begin fell:fall ran:run felt:feel " +
  "nothing:none nobody:nobody everyone:everyone everybody:everyone anybody:anyone someone:somebody " +
  "won:win taught:teach fought:fight").split(" ").map((p) => p.split(":")));
// Every plausible base of a word; two words match when their bases meet.
const forms = (w0) => {
  const w = IRREG[w0] ?? w0.replace(/'s$/, "");
  const out = new Set([w]);
  for (const [suf, add] of [["ies","y"],["es",""],["s",""],["ed",""],["ed","e"],["d",""],["ing",""],["ing","e"],["ly",""],["er",""],["er","e"],["est",""],["ings",""]])
    if (w.endsWith(suf) && w.length - suf.length >= 3) out.add(w.slice(0, -suf.length) + add);
  return out;
};
const stem = (w) => [...forms(w)].sort((a, b) => a.length - b.length)[0];
const lexWords = new Set();
for (const m of lex.values()) for (const w of m.toLowerCase().match(/[a-z]+/g) ?? []) for (const f of forms(w)) lexWords.add(f);
const nameWords = new Set([...roster.keys(), ...GALAXIES, "Tharvend", "Makaal", "Ormaa", "Ilumaar", "Naa'shenai", "Kesh"]
  .flatMap((n) => n.toLowerCase().split(/[\s']+/)));
const corpus = [...posts.map((p) => p.text), ...digests.map((d) => d.text)].join("\n")
  .replace(/\[[a-z]+\]/g, "").replace(/\*\*/g, "");
const freq = new Map(); let tokens = 0, covered = 0;
for (const raw of corpus.toLowerCase().match(/[a-z][a-z']*/g) ?? []) {
  const w = raw.replace(/'$/, "");
  if (STOP.has(w) || nameWords.has(w) || lex.has(w)) continue;
  tokens++;
  if ([...forms(w)].some((f) => lexWords.has(f))) { covered++; continue; }
  freq.set(stem(w), (freq.get(stem(w)) ?? 0) + 1);
}
const missing = [...freq].sort((a, b) => b[1] - a[1]);

// ---------------------------------------------------------------- the Eshai translation
// docs/portal/eshai/<room>[.<part>].md, laid out like the English: the same
// ## sections and ### post headers (or ## Digest N), each followed by its
// Eshai. Every post pairs with its English by room + time + author.
import { readdirSync, existsSync } from "node:fs";
const EDIR = join(import.meta.dirname, "../../docs/portal/eshai");
const efiles = existsSync(EDIR) ? readdirSync(EDIR).filter((f) => f.endsWith(".md")).sort() : [];
const eposts = [], edigests = new Map();
const DOC_FILES = ["profiles", "pinned", "voice", "tharvend", "fleet-roll"]; // checked as documents below
const roomOfFile = { shenai: [() => "shenai", "shenai"], galaxies: [(h) => GALAXIES.includes(h.trim()) ? h.trim() : null, null],
  "kaal-ith": [() => "kaal-ith", "kaal-ith"], "last-room": [() => "last-room", "last-room"] };
for (const f of efiles) {
  const base = f.replace(/(\.\d+)?\.md$/, "");
  const text = readFileSync(join(EDIR, f), "utf8");
  if (base === "naa-ren") {
    for (const m of text.matchAll(/^## Digest (\d+)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm))
      edigests.set(m[1], { file: f, items: m[2].split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean) });
  } else if (roomOfFile[base]) parseRoom(f, ...roomOfFile[base], eposts, text);
  else if (!DOC_FILES.includes(base)) warn(`eshai/${f}`, "not a room file");
}
const keyOf = (p) => `${p.room} t${p.t} ${p.author}`;
const english = new Map(posts.map((p) => [keyOf(p), p]));
const seenKeys = new Set();
for (const p of posts) if (seenKeys.has(keyOf(p))) warn(keyOf(p), "two posts share this header"); else seenKeys.add(keyOf(p));

// Names: the roster, the galaxies, the lexicon's own capitalised words, and the Names list.
const NAMES = new Set([...roster.keys()].flatMap((n) => n.split(/\s+/)).concat(GALAXIES, Object.keys(BORROWED)));
for (const w of lex.keys()) if (/^[A-Z]/.test(w)) NAMES.add(w);
{
  const sec = read("lexicon.md").split(/^## Names in the archive\b/m)[1] ?? "";
  for (const m of sec.matchAll(/^- \*\*([^*]+)\*\*/gm)) for (const n of m[1].split(/\s*,\s*/)) NAMES.add(n.trim());
}
for (const n of NAMES) for (const part of n.split(/\s+/)) { const r = spell(part); if (!r.ok) warn("names", `"${n}" has "${r.bad}", not a sound`); }

const lexForms = new Set();
for (const w of lex.keys()) { const l = w.toLowerCase(); lexForms.add(l); lexForms.add(l.replace(/^-|-$/g, "")); }
const AFFIX_PIECES = new Set(["ma", "ho", "ke"]);
const SUFFIXES = ["maar", "eth", "sil", "mir", "ith", "en", "na", "ai", "nu", "ir", "un"];
const nameLower = new Set([...NAMES].map((n) => n.toLowerCase()));
function pieceKnown(p, depth = 0) {
  if (!p) return true;
  if (lexForms.has(p) || AFFIX_PIECES.has(p) || nameLower.has(p) || /^[0-7]+$/.test(p)) return true;
  if (depth < 2) for (const s of SUFFIXES) if (p.endsWith(s) && p.length > s.length + 1 && pieceKnown(p.slice(0, -s.length), depth + 1)) return true;
  if (depth < 1) for (const s of ["sil", "mir"]) if (p.startsWith(s) && p.length > s.length + 1 && pieceKnown(p.slice(s.length), depth + 1)) return true;
  return false;
}
function wordKnown(w) {
  if (/^[0-7]+$/.test(w) || nameLower.has(w) || lexForms.has(w)) return true;
  return w.split(/['-]/).every((p) => pieceKnown(p));
}
const EVID_SUFFIX = /-(vaa|tol|ren|esh'ka|esh|ka)$/;
const unknownWords = new Map(), unknownNames = new Map();
let eWords = 0;
function checkEshai(where, text, flags) {
  text = text.replace(/<[a-z]+>/g, " "); // a build placeholder: <n>, <name>, <room>
  for (const n of text.match(/\b\d+\b/g) ?? []) if (/[89]/.test(n)) warn(where, `Eshai number ${n} is not octal`);
  if (/[A-Za-z]/.test(text) && /\b(the|and|of|to|is)\b/.test(text)) warn(where, "English left in the Eshai");
  const sentences = text.replace(/\s+/g, " ").match(/[^.!?—]+[.!?—]+["”]?|[^.!?—]+$/g) ?? [];
  for (const s0 of sentences) {
    const s = s0.trim(); if (!s) continue;
    const end = s.replace(/["”]$/, "").slice(-1);
    const words = s.replace(/[.!?,;:"“”()—…]+/g, " ").trim().split(/\s+/).filter(Boolean);
    eWords += words.length;
    const last = words[words.length - 1] ?? "";
    if (end === "—" || flags.has("forgetting") || flags.has("fragment") || (flags.has("cut") && s0 === sentences[sentences.length - 1])) { /* cut off mid-sentence, a mind coming apart, or a label/log line */ }
    else if (!".!?".includes(end)) warn(where, `sentence without a stop: "${s.slice(0, 40)}"`);
    else if (end === "." && !EVID_SUFFIX.test(last) && !flags.has("forgetting")) warn(where, `statement without an evidential: "${s.slice(-40)}"`);
    else if (end === "?" && last.toLowerCase() !== "hai") warn(where, `question not ending in hai: "${s.slice(-40)}"`);
    for (const w0 of words) {
      if (/-(vaa|ka)-(vaa|tol|ren|esh'ka|esh|ka)$/.test(w0)) /* esh, ren and tol are verbs too: esh-esh "I saw" */ { warn(where, `"${w0}" stacks two evidentials`); continue; }
      const cap = /^[A-Z]/.test(w0);
      const w = w0.toLowerCase().replace(EVID_SUFFIX, "");
      const cutTail = flags.has("cut") && s0 === sentences[sentences.length - 1] && w0 === words[words.length - 1];
      if (wordKnown(w) || flags.has("forgetting") || cutTail) { if ((flags.has("forgetting") || cutTail) && !/^[0-7]+$/.test(w)) for (const part of w.split(/['-]/)) { const r = spell(part); if (!r.ok) warn(where, `"${w0}" has "${r.bad}", not a sound`); } continue; }
      const bag = cap && !lexForms.has(w) ? unknownNames : unknownWords;
      bag.set(w0.replace(EVID_SUFFIX, ""), (bag.get(w0.replace(EVID_SUFFIX, "")) ?? 0) + 1);
      for (const part of w.split(/['-]/)) { const r = spell(part); if (!r.ok) warn(where, `"${w0}" has "${r.bad}", not a sound`); }
    }
  }
}
for (const ep of eposts) {
  const where = `eshai/${ep.file} ${keyOf(ep)}`;
  if (!english.has(keyOf(ep))) { warn(where, "no English post with this header"); continue; }
  const flags = new Set((ep.text.match(/^% (.+)$/gm) ?? []).map((l) => l.slice(2).trim()));
  const text = ep.text.replace(/^%.*$/gm, "").trim();
  if (!text) { warn(where, "empty translation"); continue; }
  checkEshai(where, text, flags);
}
for (const [n, d] of edigests) {
  const en = digests.find((x) => x.n === n);
  if (!en) { warn(`eshai digest ${n}`, "no such digest"); continue; }
  const want = digestItems(en.text).length;
  if (d.items.length !== want) warn(`eshai digest ${n}`, `${d.items.length} items, the English has ${want}`);
  d.items.forEach((it, i) => checkEshai(`eshai digest ${n} item ${i + 1}`, it, new Set()));
}
// ---- the hall's other text: profiles, pinned documents, voice clips, Tharvend's log
// Each Eshai file is blocks under "## " or "### " headings that must match the
// English's own keys. A "% fragment" line (or a Status: field, or anything in
// Tharvend's log) is checked word by word only: labels and log lines are not
// sentences. A "% empty" block stands for an English block that is empty.
const docDone = new Map(); // name -> [done, total]
function eshaiBlocks(file, level) {
  const out = new Map();
  if (!existsSync(join(EDIR, file))) return out;
  const re = level === 2 ? /^## (.+)$/ : /^### (.+)$/;
  let key = null;
  for (const line of readFileSync(join(EDIR, file), "utf8").split("\n")) {
    const h = line.match(re);
    if (h) { key = h[1].trim(); out.set(key, ""); continue; }
    if (key && !/^#/.test(line)) out.set(key, out.get(key) + line + "\n");
  }
  return out;
}
function checkBlock(where, body, fragmentAll = false) {
  const flags = new Set((body.match(/^% (.+)$/gm) ?? []).map((l) => l.slice(2).trim()));
  if (fragmentAll) flags.add("fragment");
  const text = body.replace(/^%.*$/gm, "").trim();
  if (!text) { if (!flags.has("empty")) warn(where, "empty translation"); return; }
  for (const line of text.split("\n")) {
    const f = line.match(/^(Status|Bio):\s*(.*)$/);
    if (f && f[1] === "Status") checkEshai(where + " status", f[2], new Set([...flags, "fragment"]));
    else if (f && f[2].trim() === "% empty") { /* an empty bio */ }
    else checkEshai(where, f ? f[2] : line, flags);
  }
}
{ // profiles: every roster member, a status and a bio
  const blocks = eshaiBlocks("profiles.md", 3);
  let done = 0;
  for (const name of roster.keys()) {
    const b = blocks.get(name);
    if (b === undefined) continue;
    done++;
    if (!/^Status:/m.test(b) || !/^Bio:/m.test(b)) warn(`eshai/profiles.md ${name}`, "needs a Status: and a Bio: line");
    checkBlock(`eshai/profiles.md ${name}`, b);
  }
  for (const k of blocks.keys()) if (!roster.has(k)) warn(`eshai/profiles.md ${k}`, "not on the roster");
  docDone.set("profiles", [done, roster.size]);
}
{ // pinned: one block per pinned document, keyed by its English heading
  const want = [...read("pinned.md").matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
  const blocks = eshaiBlocks("pinned.md", 2);
  for (const [k, b] of blocks) { if (!want.includes(k)) warn(`eshai/pinned.md ${k}`, "no such pinned document"); else checkBlock(`eshai/pinned.md ${k}`, b); }
  docDone.set("pinned", [want.filter((k) => blocks.has(k)).length, want.length]);
}
{ // voice: every clip that speaks (a quoted line, or the counting), as "### <room> <n>"
  const want = [];
  let room = null;
  for (const line of read("voice.md").split("\n")) {
    const r = line.match(/^## (\S+)/); if (r) room = r[1];
    const c = line.match(/^(\d)\. \*\*/);
    if (c && room) want.push({ key: `${room} ${c[1]}`, speaks: /\*"|counting/i.test(line) });
  }
  // a clip's quote may wrap onto the next line, so re-read whole numbered items
  const items = read("voice.md").split(/\n(?=\d\. \*\*|## )/);
  room = null;
  for (const it of items) { const r = it.match(/^## (\S+)/); if (r) room = r[1]; const c = it.match(/^(\d)\. \*\*/); if (c && room) { const w = want.find((x) => x.key === `${room} ${c[1]}`); if (w) w.speaks = /\*[^*\s][^*]*\*/.test(it.replace(/\*\*[^*"]+\*\*/g, "")) || /[Cc]ounting/.test(it); } } // any italic line, or a quoted title, is something said
  const speaking = want.filter((w) => w.speaks).map((w) => w.key);
  const blocks = eshaiBlocks("voice.md", 3);
  for (const [k, b] of blocks) { if (!speaking.includes(k)) warn(`eshai/voice.md ${k}`, "no such speaking clip"); else checkBlock(`eshai/voice.md ${k}`, b); }
  docDone.set("voice", [speaking.filter((k) => blocks.has(k)).length, speaking.length]);
}
{ // Tharvend's hand-written log entries: "### t<..> · SIGN", log lines, never sentences
  const txt = read("tharvend.md");
  const want = [...txt.matchAll(/^### (t[\d.]+(?: → t[\d.]+)? · [A-Z /-]+)$/gm)].map((m) => m[1].trim())
    .filter((k) => !/→/.test(k)); // the drop-by-drop pairs are generated
  const blocks = eshaiBlocks("tharvend.md", 3);
  for (const [k, b] of blocks) {
    if (/^generated /.test(k)) { checkBlock(`eshai/tharvend.md ${k}`, b, true); continue; }
    if (!want.includes(k)) warn(`eshai/tharvend.md ${k}`, "no such log entry"); else checkBlock(`eshai/tharvend.md ${k}`, b, true);
  }
  docDone.set("tharvend log", [want.filter((k) => blocks.has(k)).length, want.length]);
}
{ // the Fleet roll (digest 14014's list), generated by scripts/portal/fleet-roll.mjs
  const f = join(EDIR, "fleet-roll.md");
  if (!existsSync(f)) warn("eshai/fleet-roll.md", "missing — run node scripts/portal/fleet-roll.mjs");
  else {
    const body = readFileSync(f, "utf8").split("\n").filter((l) => /^[A-Z][a-z]+ [A-Z][a-z]+!/.test(l)).join(" ");
    const names = body.split("!").map((s) => s.trim()).filter(Boolean);
    if (names.length !== 0o1460) warn("eshai/fleet-roll.md", `${names.length} names, want ${0o1460} (1460 in their numerals)`);
    if (new Set(names).size !== names.length) warn("eshai/fleet-roll.md", "a name appears twice");
    if (!names.includes("Hethra Maal")) warn("eshai/fleet-roll.md", "Hethra Maal is not on the ninth hull");
    for (const n of names) for (const p of n.split(" ")) { const r = spell(p); if (!r.ok) warn("eshai/fleet-roll.md", `"${n}" has "${r.bad}", not a sound`); }
    docDone.set("fleet roll", [names.length, 0o1460]);
  }
}
{ // the Nemaai–Tamruk game: replay every move under the pinned rules
  const f = join(DIR, "ishaal-game.md");
  if (!existsSync(f)) warn("ishaal-game.md", "missing — run node scripts/portal/ishaal-game.mjs");
  else {
    const I = await import("./ishaal.mjs");
    const st = I.opening();
    const lines = readFileSync(f, "utf8").split("\n").map((l) => l.match(/^\s*([0-7]+)\s+.+?stone ([0-7]+)\s+([0-7]+)\.(\d) → ([0-7]+)\.(\d)(?:\s+takes ([0-7,]+))?/)).filter(Boolean);
    const named = new Map();
    lines.forEach((m, i) => {
      const ply = parseInt(m[1], 8), side = ply % 2 ? "odd" : "even";
      const [n, fr, fs, tr, ts] = [m[2], m[3], m[4], m[5], m[6]].map((x) => parseInt(x, 8));
      if (ply !== i + 1) warn("ishaal-game.md", `move ${m[1]} out of order`);
      const mv = I.moves(st, side).find((x) => x.stone.n === n && x.stone.ring === fr && x.stone.spoke === fs && x.ring === tr && x.spoke === ts);
      if (!mv) { warn("ishaal-game.md", `move ${m[1]} is not legal`); return; }
      const takes = mv.takes.map((t) => t.n).sort().join(","), said = (m[7] ?? "").split(",").filter(Boolean).map((x) => parseInt(x, 8)).sort().join(",");
      if (takes !== said) warn("ishaal-game.md", `move ${m[1]} takes ${takes || "nothing"}, the list says ${said || "nothing"}`);
      named.set(ply, { n, fr, tr, takes });
      I.play(st, mv);
      if (ply < lines.length && (I.won(st, "even") || I.won(st, "odd"))) warn("ishaal-game.md", `the game is won at move ${m[1]}`);
    });
    const want = [[0o612, (x) => x.n === 3 && x.tr === 2], [0o662, (x) => x.takes === "5"], [0o750, (x) => x.n === 2 && x.tr === 4],
      [0o752, (x) => x.n === 5 && x.tr === I.LONG], [0o754, (x) => x.n === 2 && x.fr === 4 && x.tr === 5]];
    for (const [ply, ok] of want) if (!named.has(ply) || !ok(named.get(ply))) warn("ishaal-game.md", `move ${ply.toString(8)} is not the move the archive names`);
    if (lines.length !== 0o757) warn("ishaal-game.md", `${lines.length.toString(8)} moves, want 757`);
    if (I.won(st, "even") || I.won(st, "odd") || I.moves(st, "even").some((m) => (m.ring === I.LONG && m.stone.ring !== I.LONG && I.onLong(st, "even") >= 3) || I.alive(st, "odd").length - m.takes.length <= 2))
      warn("ishaal-game.md", "Paelu could finish the game; it must stay unfinishable");
    docDone.set("ishaal game", [lines.length, 0o757]);
  }
}
const eKeys = new Set(eposts.map(keyOf));
const doneByRoom = new Map();
for (const p of posts) { const r = doneByRoom.get(p.room) ?? [0, 0]; r[1]++; if (eKeys.has(keyOf(p))) r[0]++; doneByRoom.set(p.room, r); }
doneByRoom.set("naa-ren", [digests.filter((d) => edigests.has(d.n)).length, digests.length]);
for (const [k, v] of docDone) doneByRoom.set(k, v);
for (const [w, n] of unknownWords) warn("eshai words", `"${w}" (${n}×) is not in the dictionary`);
for (const [w, n] of unknownNames) warn("eshai names", `"${w}" (${n}×) is not a known name — add it to "Names in the archive"`);

// ---------------------------------------------------------------- report
const words = (s) => (s.match(/\S+/g) ?? []).length;
const roomRows = [...byRoom].map(([r, l]) => `${String(r).padEnd(10)} ${String(l.length).padStart(4)} posts  last t${lastOf(r)}`);
console.log("THE PORTAL ARCHIVE — buildability check\n");
console.log(`posts ${posts.length} + digests ${digests.length}; roster ${roster.size}; lexicon ${lex.size} entries`);
console.log(`archive English: ${words(corpus)} words\n`);
console.log(roomRows.join("\n"));
console.log(`\nENGLISH vs DICTIONARY, word for word (the translation itself is held to the dictionary below): ${covered} of ${tokens} content words (${(100 * covered / tokens).toFixed(1)}%) have an Eshai word`);
console.log(`distinct content words with NO Eshai word: ${missing.length}`);
const show = Number(arg("--words", 40));
console.log(`most used of them: ${missing.slice(0, show).map(([w, n]) => `${w}(${n})`).join(" ")}`);
const need = (k) => missing.slice(0, k).reduce((s, [, n]) => s + n, 0);
for (const k of [100, 250, 500, 1000]) console.log(`  adding the top ${k} would cover ${(100 * (covered + need(k)) / tokens).toFixed(1)}%`);
console.log(`\nTRANSLATED (${eWords} Eshai words so far):`);
for (const [r, [d, n]] of doneByRoom) console.log(`  ${String(r).padEnd(10)} ${String(d).padStart(4)} of ${n}`);
console.log(`\nPROBLEMS: ${problems.length}`);
for (const p of problems) console.log("  " + p);
process.exitCode = problems.length ? 1 : 0;
