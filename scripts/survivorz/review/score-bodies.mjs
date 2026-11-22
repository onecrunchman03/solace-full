// SURVIVORZ REVIEW — every body's stored measures, read for the clips the show plays (RUBRIC.md A4–A8, B2–B3).
//
//   node scripts/survivorz/review/score-bodies.mjs [--json out.json]
//
// Reads what the bakes already measured (assets/downloads/survivorz/anim/<body>/*.json, the pairs tables, the
// loop speeds, the weapon and pack fits); runs nothing. A body with no measure for a line says so.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const STAGE = path.join(ROOT, "assets", "downloads", "survivorz");
const SHOW = path.join(ROOT, "client", "src", "survivorz", "show");
const S = await import(pathToFileURL(path.join(SHOW, "stance.ts")).href);
const bodiesLib = (await import(pathToFileURL(path.join(ROOT, "scripts", "survivorz", "bodies.cjs")).href)).default;
const read = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const jsonOut = process.argv.includes("--json") ? process.argv[process.argv.indexOf("--json") + 1] : null;

// who wears what (the cast files)
const castDir = path.join(ROOT, "src", "survivorz", "cast");
const wearers = {};
for (const f of fs.readdirSync(castDir).filter((f) => f.endsWith(".json") && f !== "public.json")) { const c = read(path.join(castDir, f)); if (c?.body) (wearers[c.body] ??= []).push(`${c.id}(${c.status})`); }

const loops = read(path.join(SHOW, "loopspeed.json")) ?? {};
const kit = read(path.join(SHOW, "kit-fit.json")) ?? {};
const pairs = read(path.join(SHOW, "pairs.json")) ?? {};
// how a gun sits in each body's hand (anim-build.cjs --gun-cal): the rifle seat, a pistol's own, and each gun's place in the grip
const gunCal = read(path.join(STAGE, "props", "guns", "cal.json")) ?? {};
const GUN_IDS = ["hk416", "pistol", "shotgun"];
const zombies = bodiesLib.zombieIds ? bodiesLib.zombieIds() : fs.readdirSync(path.join(STAGE, "anim")).filter((d) => d.startsWith("zombie-"));
const out = {};
for (const body of bodiesLib.survivorIds()) {
  const dir = path.join(STAGE, "anim", body);
  const law = read(path.join(dir, "clip.json")) ?? {};
  const kept = Object.keys(law).filter((n) => S.keepClip(n) && !/^(fz|zd)-/.test(n) && S.lawful(body, n));
  const natural = read(path.join(dir, "natural.json")), contact = read(path.join(dir, "contact.json")), hands = read(path.join(dir, "hands.json"));
  // natural: a joint 20° or more past this body's own mocap range for 5+ frames, on a clip built in code
  const nat = natural ? kept.filter((n) => /^(bd|gr|gs|gp|hd)-/.test(n) && (natural[n] ?? []).some((x) => x.past >= 20 && x.frames >= 5)) : null;
  const sink = contact ? kept.filter((n) => contact[n] && contact[n].min < -0.03) : null;
  const flt = contact ? kept.filter((n) => contact[n] && contact[n].min > 0.1 && !/jump|fall|climb|ladder|vault|bed|sleep|lying|dead|down|crawl/.test(n)) : null;
  const hnd = hands ? kept.filter((n) => (hands[n] ?? []).length) : null;
  // (A6 counts what is NEW on a clip built in code: hands-new.json, the findings its base recording doesn't have)
  const handsNew = read(path.join(dir, "hands-new.json"));
  const hndNew = handsNew ? kept.filter((n) => /^(bd|gr|gs|gp|hd)-/.test(n) && (handsNew[n] ?? []).length) : null;
  const gc = gunCal[body], gunSeat = !!gc && !!gc.pistol && GUN_IDS.every((g) => Array.isArray(gc.seats?.[g]));
  const own = read(path.join(STAGE, "creator", body, "pairs.json"));
  const P = own ?? pairs;
  const zs = (table, pick) => zombies.filter((z) => pick(table?.[z]?.[body])).length;
  const speedFile = read(path.join(STAGE, "creator", body, "loopspeed.json"));
  const loopN = Object.values(loops).filter((v) => v && v[body] != null).length;
  out[body] = {
    worn: wearers[body] ?? [], showClips: kept.length,
    natural: nat && { n: nat.length, ex: nat.slice(0, 4) }, sink: sink && { n: sink.length, ex: sink.slice(0, 4).map((n) => `${n} ${Math.round(contact[n].min * 100)}cm`) },
    float: flt && { n: flt.length, ex: flt.slice(0, 4).map((n) => `${n} +${Math.round(contact[n].min * 100)}cm`) }, hands: hnd && { n: hnd.length, ex: hnd.slice(0, 4) }, handsNew: hndNew && { n: hndNew.length, ex: hndNew.slice(0, 4) }, gunSeat,
    loops: loopN || (speedFile ? Object.keys(speedFile).length : 0), loopsFrom: loopN ? "show table" : speedFile ? "creator bake" : "none",
    packFit: !!kit.packs?.[body], stowFit: !!kit.stow?.[body],
    grabs: zs(P.chains, (v) => v && (v.front || v.back)), forearm: zs(P.bites, (v) => v?.forearm), shoulder: zs(P.bites, (v) => v?.shoulder),
    pulls: Object.keys(P.pull?.[body] ?? {}).length, zombies: zombies.length,
  };
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(out, null, 1));
const pad = (s, n) => String(s).padEnd(n);
console.log(pad("body", 18) + pad("worn by", 22) + pad("clips", 6) + pad("natural", 8) + pad("sink", 5) + pad("float", 6) + pad("hands", 6) + pad("new", 5) + pad("seat", 5) + pad("loops", 7) + pad("pack", 5) + pad("stow", 5) + pad("grab", 5) + pad("arm", 4) + pad("shldr", 6) + "pull");
for (const [b, r] of Object.entries(out)) console.log(pad(b, 18) + pad(r.worn.join(",") || "-", 22) + pad(r.showClips, 6) + pad(r.natural?.n ?? "?", 8) + pad(r.sink?.n ?? "?", 5) + pad(r.float?.n ?? "?", 6) + pad(r.hands?.n ?? "?", 6) + pad(r.handsNew?.n ?? "?", 5) + pad(r.gunSeat ? "y" : "NO", 5) + pad(r.loops, 7) + pad(r.packFit ? "y" : "NO", 5) + pad(r.stowFit ? "y" : "NO", 5) + pad(r.grabs, 5) + pad(r.forearm, 4) + pad(r.shoulder, 6) + r.pulls);
