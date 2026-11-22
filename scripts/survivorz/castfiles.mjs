// SOLACE SURVIVORZ — writing the cast files (shared by the local creator, creator.mjs, and the
// Admin Panel list's puller, pull-cast.mjs). A character is one file, src/survivorz/cast/<id>.json;
// saving one also writes what the others think of them into THEIR files, then regenerates the two
// files built from the cast (files.ts, the server's import list, and public.json, the page's half).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const rules = await import(pathToFileURL(path.join(ROOT, "src/survivorz/cast/rules.ts")).href);

const isCharFile = (f) => /^[a-z]{2,16}\.json$/.test(f) && f !== "public.json";
export function readCast(dir) {
  return fs.readdirSync(dir).filter(isCharFile).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
}
export function regenerate(dir, cast) {
  fs.writeFileSync(path.join(dir, "files.ts"), rules.indexSource(cast.map((c) => c.id)));
  const pub = cast.filter((c) => c.status !== "draft").sort((a, b) => a.strip - b.strip).map((c) => rules.publicOf(c, rules.HANDMADE_SUITED.includes(c.body)));
  fs.writeFileSync(path.join(dir, "public.json"), JSON.stringify(pub, null, 2) + "\n");
}
/** a character's fields in the order the files keep them (so a save is a readable diff) */
const ORDER = ["id", "status", "order", "strip", "name", "short", "tag", "body", "genes", "skills", "kit", "regard", "voice", "sheet", "notes"];
export function tidy(raw) {
  // (a list exported before the skills round carries body stats, perks and a world: converted to skills and genes)
  const c = rules.upgradeCharacter(raw);
  const out = {};
  for (const k of ORDER) if (c[k] !== undefined && !(k === "notes" && c[k] === "")) out[k] = c[k];
  if (out.kit && !out.kit.gun) { delete out.kit.gun; delete out.kit.mag; delete out.kit.ammo; }
  return out;
}
export function check(c, cast, bodies) {
  return rules.checkCharacter(c, cast.filter((o) => o.id !== c.id).concat([c]), bodies);
}
/** Save one character (and the others' regard of them) into `dir`. Returns the ids written, or the
 *  problems that stopped it. Nothing is written unless every touched file still passes the rules. */
export function saveCharacter(dir, char, regardIn, bodies) {
  const c = tidy(char);
  let cast = readCast(dir);
  const r = check(c, cast, bodies);
  if (r.errors.length) return { error: "not saved", ...r };
  const touched = [];
  for (const o of cast) {
    if (o.id === c.id || !regardIn || !(o.id in regardIn)) continue;
    const v = regardIn[o.id];
    const had = o.regard[c.id];
    if (v === null || v === "" || v === undefined) { if (had !== undefined) { delete o.regard[c.id]; touched.push(o); } }
    else if (Number.isInteger(v) && v >= -100 && v <= 100 && had !== v) { o.regard[c.id] = v; touched.push(o); }
  }
  cast = cast.filter((o) => o.id !== c.id).concat([c]);
  for (const o of touched) {
    const oc = check(o, cast, bodies);
    if (oc.errors.length) return { error: `${o.name}'s file would break`, ...oc };
  }
  for (const o of [c, ...touched]) fs.writeFileSync(path.join(dir, `${o.id}.json`), JSON.stringify(tidy(o), null, 2) + "\n");
  regenerate(dir, cast);
  return { ok: true, saved: [c.id, ...touched.map((o) => o.id)], warnings: r.warnings };
}
