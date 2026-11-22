// SOLACE SURVIVORZ: check the packed bodies after a rebake.
//
// Run:  node scripts/survivorz/check-packed.mjs [--dir <game dir>] [--hip-tol 0.10]
//
// Reads each game/*.glb's JSON chunk directly. The meshes are meshopt-
// compressed, but the skins, node names and animation channels all live in
// the JSON, so nothing needs decoding. Checks, per body:
//   · the file is a whole GLB (a body still being written fails as "incomplete")
//   · every clip has channels, every channel targets a bone in the body's skin,
//     and every clip has at least 2 keyframes and a duration above zero
//   · survivors: the same clip set on every body, the same bone count within a
//     rig family, and the hip's rest height within --hip-tol (default 20%) of the
//     survivors' median. A PAIRED clip (bd-hug-over-<partner>) never names the
//     body itself. (Until Nov 12 2026 it also had to exist for EVERY other
//     survivor body — true when there were six bodies and one bake. There are
//     nineteen on the shelf now, the partner clips were only ever baked among
//     the first seven, and the show plays none of them: which bodies carry the
//     set is printed as a note, and failed nineteen of thirty-eight bodies.)
//     A clip paired with one of the DEAD (bd-bitten-leg-zombie-f01, a grab, a
//     rescue: the creator bakes those per body) is a paired clip too. The
//     show's SPARE clips (stance.ts SPARE_CLIPS: played only where a body has
//     them) may be missing, and the bone count differs by rig family (the first
//     seven carry finger bones): both are notes. What the show needs of every
//     body a character wears is anim-show-check.mjs's to say.
//   · zombies: the same clip set on every zombie. Bone counts are compared
//     within the female (f) and male (m) rigs, which differ by design, and a
//     mismatch there is a NOTE, not a failure, since every channel is already
//     checked against the body's own skin
// One line per body; exits 1 on any failure. Not part of run-all.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const DIR = path.resolve(arg("--dir", path.join(ROOT, "assets", "downloads", "survivorz", "game")));
// 20%: the six are real people of different heights (Sophia sits 10% under the
// median), and what this guards against is a SCALE fault (cm read as m), which
// is off by orders of magnitude, not by a person.
const HIP_TOL = Number(arg("--hip-tol", "0.20"));
// Renderpeople bones can carry the source take's name: "rp_manuel_…_hip".
const HIP_NAMES = /(^|_)(hip|hips|pelvis)$|^root\.x$|^mixamorig:hips$/i;

// ---- the GLB's JSON ---------------------------------------------------------
function readGlb(file) {
  const b = fs.readFileSync(file);
  if (b.length < 20 || b.readUInt32LE(0) !== 0x46546c67) throw new Error("not a GLB");
  const total = b.readUInt32LE(8);
  if (total !== b.length) throw new Error(`incomplete: header says ${total} bytes, file has ${b.length} (still being written?)`);
  const len = b.readUInt32LE(12);
  if (b.readUInt32LE(16) !== 0x4e4f534a) throw new Error("first chunk isn't JSON");
  return JSON.parse(b.subarray(20, 20 + len).toString("utf8"));
}

// ---- rest-pose world positions (column-major 4x4, glTF's convention) --------
const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
function localMatrix(n) {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
function worldY(j, nodeIndex) {
  const parent = new Map();
  j.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
  const chain = [];
  for (let i = nodeIndex; i !== undefined; i = parent.get(i)) chain.unshift(i);
  let m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const i of chain) m = mul(m, localMatrix(j.nodes[i]));
  return m[13];
}

// ---- one body ---------------------------------------------------------------
function checkBody(file) {
  const id = path.basename(file, ".glb");
  const kind = id.startsWith("zombie-") ? "zombie" : "survivor";
  const out = { id, kind, problems: [], clips: [], bones: 0, hip: null };
  let j;
  try {
    j = readGlb(file);
  } catch (e) {
    out.problems.push(e.message);
    return out;
  }
  const skin = j.skins?.[0];
  if (!skin) {
    out.problems.push("no skin");
    return out;
  }
  const joints = new Set(skin.joints);
  out.bones = skin.joints.length;
  const hipIdx = skin.joints.find((i) => HIP_NAMES.test(j.nodes[i]?.name ?? ""));
  if (hipIdx === undefined) out.problems.push("no hip bone found");
  else out.hip = worldY(j, hipIdx);

  const seen = new Set();
  for (const a of j.animations ?? []) {
    const name = a.name ?? "(unnamed)";
    if (seen.has(name)) out.problems.push(`clip "${name}" appears twice`);
    seen.add(name);
    out.clips.push(name);
    if (!a.channels?.length) {
      out.problems.push(`clip "${name}" has no channels`);
      continue;
    }
    const strays = a.channels.filter((c) => !joints.has(c.target?.node)).map((c) => j.nodes[c.target?.node]?.name ?? `#${c.target?.node}`);
    if (strays.length) out.problems.push(`clip "${name}" drives ${strays.length} node(s) outside the skin: ${[...new Set(strays)].slice(0, 3).join(", ")}`);
    let keys = 0;
    let dur = 0;
    for (const s of a.samplers ?? []) {
      const acc = j.accessors[s.input];
      keys = Math.max(keys, acc?.count ?? 0);
      dur = Math.max(dur, acc?.max?.[0] ?? 0);
    }
    if (keys < 2) out.problems.push(`clip "${name}" has ${keys} keyframe(s)`);
    else if (!(dur > 0)) out.problems.push(`clip "${name}" lasts 0s`);
  }
  if (!out.clips.length) out.problems.push("no clips");
  return out;
}

// ---- the set ----------------------------------------------------------------
let files;
try {
  files = fs.readdirSync(DIR).filter((f) => f.endsWith(".glb") && !f.startsWith(".")).sort();
} catch {
  console.error(`no folder at ${DIR}`);
  process.exit(1);
}
const bodies = files.map((f) => checkBody(path.join(DIR, f)));

/** A paired clip names its partner last: "bd-hug-over-claudia". */
function pairStem(clip, ids) {
  for (const id of ids) if (clip.endsWith("-" + id)) return { stem: clip.slice(0, -id.length - 1), partner: id };
  return null;
}

let pairNote = null;
function checkPairs(all, everyId) {
  // A body that could not be read has its own failure; leave it out here.
  const group = all.filter((b) => b.clips.length);
  // (longest first: "zombie-f01" is tried before a survivor called "f01" could be)
  const ids = [...everyId].sort((a, b) => b.length - a.length);
  const stems = new Set();
  for (const b of group) for (const c of b.clips) { const p = pairStem(c, ids); if (p) stems.add(p.stem); }
  for (const b of group) {
    const with_ = new Set();
    for (const stem of stems) {
      const partners = b.clips.map((c) => pairStem(c, ids)).filter((p) => p && p.stem === stem).map((p) => p.partner);
      if (partners.includes(b.id)) b.problems.push(`"${stem}-${b.id}" pairs the body with itself`);
      for (const p of partners) with_.add(p);
    }
    b.pairedWith = [...with_].sort();
  }
  const living = new Set(group.map((b) => b.id));
  const mates = (b) => b.pairedWith.filter((p) => living.has(p));
  pairNote = { stems: stems.size, carry: group.filter((b) => mates(b).length).map((b) => b.id), bare: group.filter((b) => !mates(b).length).map((b) => b.id), dead: group.filter((b) => b.pairedWith.some((p) => !living.has(p))).map((b) => b.id) };
  // Leave only the unpaired clips for the ordinary comparison.
  for (const b of group) b.plain = b.clips.filter((c) => !pairStem(c, ids));
}

// THE SHOW'S SPARE CLIPS (client/src/survivorz/show/stance.ts): played only where a body has them
const SPARE = new Set((fs.readFileSync(path.join(ROOT, "client", "src", "survivorz", "show", "stance.ts"), "utf8").match(/export const SPARE_CLIPS = \[([^\]]*)\]/)?.[1] ?? "").split(",").map((x) => x.trim().replace(/^"|"$/g, "")).filter(Boolean));
function crossCheck(group, label, { bonesFail = true, boneGroup = () => "" } = {}) {
  const ok = group.filter((b) => b.clips.length);
  if (!ok.length) return;
  // The reference is the most common clip set (so one bad body is the odd one out).
  const clipsOf = (b) => b.plain ?? b.clips;
  const keyOf = (b) => [...clipsOf(b)].sort().join("|");
  const counts = new Map();
  for (const b of ok) counts.set(keyOf(b), (counts.get(keyOf(b)) ?? 0) + 1);
  const refKey = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const ref = new Set(refKey.split("|"));
  const refBonesOf = new Map();
  for (const g of new Set(ok.map(boneGroup))) {
    const counts = new Map();
    for (const b of ok.filter((x) => boneGroup(x) === g)) counts.set(b.bones, (counts.get(b.bones) ?? 0) + 1);
    refBonesOf.set(g, [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  }
  for (const b of ok) {
    const refBones = refBonesOf.get(boneGroup(b));
    const have = new Set(clipsOf(b));
    const lacking = [...ref].filter((c) => !have.has(c));
    const missing = lacking.filter((c) => !SPARE.has(c));
    const spare = lacking.filter((c) => SPARE.has(c));
    if (spare.length) (b.notes ??= []).push(`without the spare clip${spare.length > 1 ? "s" : ""} ${spare.join(", ")}`);
    const extra = [...have].filter((c) => !ref.has(c));
    if (missing.length) b.problems.push(`missing ${missing.length} of the ${label} clips: ${missing.slice(0, 4).join(", ")}${missing.length > 4 ? "…" : ""}`);
    if (extra.length) b.problems.push(`${extra.length} clip(s) no other ${label} has: ${extra.slice(0, 4).join(", ")}${extra.length > 4 ? "…" : ""}`);
    if (b.bones !== refBones) {
      const msg = `${b.bones} bones, the other ${boneGroup(b) ? boneGroup(b) + "-" : ""}${label}s have ${refBones}`;
      if (bonesFail) b.problems.push(msg);
      else (b.notes ??= []).push(msg);
    }
  }
  return { clips: ref.size, bones: [...refBonesOf.values()].join("/") };
}

const survivors = bodies.filter((b) => b.kind === "survivor");
const zombies = bodies.filter((b) => b.kind === "zombie");
checkPairs(survivors, bodies.map((b) => b.id));
const sRef = crossCheck(survivors, "survivor", { bonesFail: false });
const zRef = crossCheck(zombies, "zombie", { bonesFail: false, boneGroup: (b) => (/^zombie-f/.test(b.id) ? "f" : "m") });

const hips = survivors.map((b) => b.hip).filter((h) => h != null).sort((a, b) => a - b);
const median = hips.length ? hips[Math.floor(hips.length / 2)] : null;
if (median) {
  for (const b of survivors) {
    if (b.hip == null) continue;
    const off = Math.abs(b.hip - median) / median;
    if (off > HIP_TOL) b.problems.push(`hip at ${b.hip.toFixed(3)}m, ${(off * 100).toFixed(0)}% off the survivors' ${median.toFixed(3)}m`);
  }
}

let failed = 0;
const pad = Math.max(...bodies.map((b) => b.id.length), 4);
for (const b of bodies) {
  const head = `${b.problems.length ? "FAIL" : "ok  "} ${b.id.padEnd(pad)}  ${String(b.clips.length).padStart(3)} clips  ${String(b.bones).padStart(3)} bones  hip ${b.hip == null ? "  —  " : b.hip.toFixed(3) + "m"}`;
  if (b.problems.length) {
    failed++;
    console.log(head + "\n       " + b.problems.slice(0, 6).join("\n       ") + (b.problems.length > 6 ? `\n       …and ${b.problems.length - 6} more` : ""));
  } else console.log(head);
  if (b.notes?.length) console.log("       note: " + b.notes.join("; "));
}
console.log(
  `\n${bodies.length - failed}/${bodies.length} bodies clean` +
    (sRef ? ` · survivors ${survivors.length} × ${survivors[0]?.clips.length} clips, ${sRef.bones} bones` : "") +
    (zRef ? ` · zombies ${zombies.length} × ${zRef.clips} clips, ${zRef.bones} bones (f/m)` : "") +
    (median ? ` · survivor hip median ${median.toFixed(3)}m (tolerance ${(HIP_TOL * 100).toFixed(0)}%)` : ""),
);
if (pairNote?.stems) {
  console.log(`note: clips paired with another SURVIVOR (hug, comfort, bandage another…) are on ${pairNote.carry.length} bodies (${pairNote.carry.join(", ")}) and not on ${pairNote.bare.length}; the show plays none of them`);
  console.log(`note: clips paired with one of the DEAD (a bite, a grab, a rescue) are on ${pairNote.dead.length} bodies (${pairNote.dead.join(", ")})`);
}
process.exit(failed ? 1 : 0);
