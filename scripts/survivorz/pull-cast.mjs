// SOLACE SURVIVORZ — PULL THE ADMIN PANEL'S CHARACTER LIST INTO GIT.
// (Since Nov 4 2026 the server plays the list LIVE — routes/survivorz-cast.ts refreshCast — so this no
// longer ships a character; it copies the list into the repo so git keeps up.)
//
//   node scripts/survivorz/pull-cast.mjs                 the newest survivorz-characters*.json in Downloads
//   node scripts/survivorz/pull-cast.mjs --file x.json   a list Josh downloaded (Admin Panel → Characters)
//   node scripts/survivorz/pull-cast.mjs --local data/solace.db   a local database's list
//   node scripts/survivorz/pull-cast.mjs --ssh           production's, over ssh (R220_SUDO_PW in the env)
//   add --check to say what would change and write nothing.
//
// Josh makes and changes characters in Admin Panel → Characters; the server keeps them in its database
// (migration 116), because the show's characters are files in git and a deploy is a `git pull`. This
// writes each one into src/survivorz/cast/<id>.json with the same rules and the same writer as the local
// creator (castfiles.mjs), then says what's left: a body to bake, a voice to put on slopbot, a bible.
// A character whose body isn't baked yet is written as a DRAFT (the show never sees a draft) and its
// list status is reported, so it goes on the bench once the body exists.
// A DELETED character ({"id", "deleted": true} on the list) loses its file, and everyone else loses
// what they thought of them; its bible, body and voice clip are left for Claude to clear by hand.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT, readCast, regenerate, tidy, saveCharacter } from "./castfiles.mjs";

// the harness points these at a copy (test_survivorz_cast.mjs)
const CAST_DIR = process.env.PULL_CAST_DIR ?? path.join(ROOT, "src/survivorz/cast");
const BODY_DIR = process.env.PULL_BODY_DIR ?? path.join(ROOT, "assets/downloads/survivorz/game");
const BIBLE_DIR = path.join(ROOT, "docs/survivorz/cast");
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const dry = args.includes("--check");

function bodies() {
  try { return fs.readdirSync(BODY_DIR).filter((f) => f.endsWith(".glb") && !f.startsWith("zombie-")).map((f) => f.slice(0, -4)); }
  catch { return []; }
}

// ---- 1. the list
const SQL = "SELECT id, data, regardIn FROM survivorz_characters ORDER BY updatedAt";
let entries;
if (opt("--local")) {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path.resolve(opt("--local")), { readOnly: true });
  entries = db.prepare(SQL).all().map((r) => ({ char: JSON.parse(r.data), regardIn: JSON.parse(r.regardIn) }));
  db.close();
} else if (args.includes("--ssh")) {
  const pw = process.env.R220_SUDO_PW;
  if (!pw) { console.error("Set R220_SUDO_PW (read from the environment, never stored)."); process.exit(2); }
  const raw = execFileSync("ssh", ["-o", "BatchMode=yes", process.env.R220_HOST || "you@YOUR_SERVER_IP",
    `sudo -S -p '' sqlite3 -json ${process.env.R220_DB || "/opt/solace/data/solace.db"} "${SQL}"`], { input: pw + "\n", encoding: "utf8" });
  entries = (raw.trim() ? JSON.parse(raw) : []).map((r) => ({ char: JSON.parse(r.data), regardIn: JSON.parse(r.regardIn) }));
} else {
  let file = opt("--file");
  if (!file) {
    const dl = path.join(os.homedir(), "Downloads");
    const found = fs.existsSync(dl) ? fs.readdirSync(dl).filter((f) => /^survivorz-characters.*\.json$/.test(f))
      .map((f) => path.join(dl, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs) : [];
    file = found[0];
    if (!file) { console.error("No list found: download it from Admin Panel → Characters, or pass --file."); process.exit(2); }
  }
  console.log(`reading ${file}`);
  entries = JSON.parse(fs.readFileSync(file, "utf8")).list ?? [];
}
if (!entries.length) { console.log("The list is empty."); process.exit(0); }

// ---- 2. write them (a copy first when --check)
const dir = dry ? fs.mkdtempSync(path.join(os.tmpdir(), "cast-")) : CAST_DIR;
if (dry) for (const f of fs.readdirSync(CAST_DIR)) fs.copyFileSync(path.join(CAST_DIR, f), path.join(dir, f));
const baked = bodies();
const before = new Map(readCast(dir).map((c) => [c.id, JSON.stringify(tidy(c))]));
const known = () => new Set(readCast(dir).map((c) => c.id));
const report = [];
// deletions first, so nobody written after them can name somebody who's gone
const gone = entries.filter((e) => e.char?.deleted === true).map((e) => e.char.id).filter((id) => /^[a-z]{2,16}$/.test(id));
const deleted = [];
for (const id of gone) {
  const file = path.join(dir, `${id}.json`);
  if (!fs.existsSync(file)) continue;
  fs.rmSync(file);
  deleted.push(id);
  for (const o of readCast(dir)) {
    if (o.regard && id in o.regard) { delete o.regard[id]; fs.writeFileSync(path.join(dir, `${o.id}.json`), JSON.stringify(tidy(o), null, 2) + "\n"); }
  }
}
if (deleted.length) regenerate(dir, readCast(dir));
entries = entries.filter((e) => e.char?.deleted !== true);
// two passes: new characters who think of EACH OTHER can't both go first, so the first pass leaves out
// any regard naming someone not written yet, and the second writes everything in full
for (const pass of [1, 2]) {
  for (const e of entries) {
    const ids = known();
    const c = tidy(structuredClone(e.char));
    let regardIn = e.regardIn ?? {};
    if (pass === 1) {
      c.regard = Object.fromEntries(Object.entries(c.regard ?? {}).filter(([k]) => ids.has(k)));
      regardIn = Object.fromEntries(Object.entries(regardIn).filter(([k]) => ids.has(k)));
    }
    const wanted = c.status;
    const unbaked = !baked.includes(c.body);
    if (unbaked && wanted !== "draft") c.status = "draft";
    const r = saveCharacter(dir, c, regardIn, baked);
    if (pass === 2) {
      if (!r.ok) report.push({ id: c.id, error: `${r.error}: ${(r.errors ?? []).map((p) => `${p.field} ${p.error}`).join("; ")}` });
      else report.push({ id: c.id, name: c.name, wanted, draftedForBody: unbaked && wanted !== "draft", saved: r.saved });
    }
  }
}

// ---- 3. what changed, what's left
const after = readCast(dir);
const changed = after.filter((c) => before.get(c.id) !== JSON.stringify(tidy(c))).map((c) => c.id);
if (deleted.length) {
  console.log(`${dry ? "would delete" : "deleted"}: ${deleted.join(", ")}`);
  for (const id of deleted) {
    const left = [fs.existsSync(path.join(BIBLE_DIR, `${id}.md`)) && `docs/survivorz/cast/${id}.md`].filter(Boolean);
    console.log(`  - ${id}${left.length ? " — left behind: " + left.join(", ") : ""} (a run on air with them in it starts fresh after the deploy)`);
  }
}
if (!changed.length && !deleted.length) console.log("Nothing to change — the repo already matches the list.");
else if (changed.length) console.log(`${dry ? "would change" : "changed"}: ${changed.join(", ")}`);
for (const r of report) {
  if (r.error) { console.log(`  ✗ ${r.id}: ${r.error}`); continue; }
  const todo = [];
  if (r.draftedForBody) todo.push(`bake the body (written as a draft; set it back to ${r.wanted} once baked)`);
  const c = after.find((x) => x.id === r.id);
  if (c?.voice.clone) todo.push(`voice on slopbot: ${c.voice.clone}.mp3`);
  if (!fs.existsSync(path.join(BIBLE_DIR, `${r.id}.md`))) todo.push(`bible: docs/survivorz/cast/${r.id}.md`);
  console.log(`  ✓ ${r.name} (${r.id})${todo.length ? " — still to do: " + todo.join("; ") : ""}`);
}
if (dry) fs.rmSync(dir, { recursive: true, force: true });
else if (changed.length || deleted.length) console.log("Next: npm run build && node scripts/checks/test_survivorz_cast.mjs, then commit and deploy.");
