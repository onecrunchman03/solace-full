// SURVIVORZ: the zombies' "hw" pack (the walks and monster attacks) came onto the zombie rig with
// its RIGHT THUMB's middle joint turned 167-180 degrees from rest on 99% of frames: the thumb
// folds into the inside of the hand and the wrist bulges. Every zombie, all 13 hw clips; the rig's
// other recordings (mx-, ual-) have natural thumbs. Where an hw clip's thumb2r is turned past
// LIM from rest, this puts in the zombie's own typical thumb2r (the average over its other
// clips), easing over three keys either side. Marked (j.thumbFix), so a second run does nothing.
//   node scripts/survivorz/fix-hw-thumb.cjs [zombie...]      (default: every zombie)
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", ".."), STAGE = path.join(ROOT, "assets", "downloads", "survivorz");
const LIM = 120, BONE = "thumb2r";
const bodies = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(path.join(STAGE, "out")).filter((d) => /^zombie-/.test(d));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const ang = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(dot(a, b)))) * 180 / Math.PI;
const norm = (q) => { const l = Math.hypot(...q); return q.map((v) => v / l); };
const slerp = (a, b, t) => { let d = dot(a, b); if (d < 0) { b = b.map((v) => -v); d = -d; } if (d > 0.9995) return norm(a.map((v, i) => v + (b[i] - v) * t)); const th = Math.acos(d), s = Math.sin(th); return a.map((v, i) => (v * Math.sin((1 - t) * th) + b[i] * Math.sin(t * th)) / s); };
for (const body of bodies) {
  const dir = path.join(STAGE, "out", body);
  const glb = fs.readFileSync(path.join(STAGE, "game", body + ".glb"));
  const gj = JSON.parse(glb.slice(20, 20 + glb.readUInt32LE(12)).toString());
  const node = gj.nodes.find((n) => n.name && n.name.replace(/\./g, "") === BONE); if (!node) { console.log(body, "no", BONE); continue; }
  const rest = node.rotation ?? [0, 0, 0, 1];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  // the zombie's typical thumb: every key of every non-hw clip, sign-aligned and averaged
  const sum = [0, 0, 0, 0]; let n = 0;
  for (const f of files.filter((f) => !/^(hw|fz)-/.test(f))) {
    const t = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).tracks?.find((t) => t.name === BONE + ".quaternion"); if (!t) continue;
    for (let i = 0; i < t.times.length; i++) { let q = t.values.slice(i * 4, i * 4 + 4); if (dot(q, rest) < 0) q = q.map((v) => -v); q.forEach((v, k) => (sum[k] += v)); n++; }
  }
  if (!n) { console.log(body, "no reference clips"); continue; }
  const typical = norm(sum);
  let fixedClips = 0, fixedKeys = 0;
  for (const f of files.filter((f) => /^hw-/.test(f))) {
    const file = path.join(dir, f), j = JSON.parse(fs.readFileSync(file, "utf8"));
    if (j.thumbFix) continue;
    const t = j.tracks?.find((t) => t.name === BONE + ".quaternion"); if (!t) continue;
    const k = t.times.length, bad = [];
    for (let i = 0; i < k; i++) bad[i] = ang(rest, t.values.slice(i * 4, i * 4 + 4)) > LIM;
    if (!bad.some(Boolean)) { j.thumbFix = 1; fs.writeFileSync(file, JSON.stringify(j)); continue; }
    // how far each key goes to the typical thumb: all the way on a bad key, easing off over the
    // three keys either side of a run of them
    const w = bad.map((b, i) => { if (b) return 1; let d = 4; for (let s = 1; s <= 3; s++) if (bad[i - s] || bad[i + s]) { d = s; break; } return d <= 3 ? 1 - d / 4 : 0; });
    const vals = Array.from(t.values);
    for (let i = 0; i < k; i++) if (w[i] > 0) { slerp(vals.slice(i * 4, i * 4 + 4), typical, w[i]).forEach((v, c) => (vals[i * 4 + c] = v)); if (bad[i]) fixedKeys++; }
    t.values = vals; j.thumbFix = 1; fs.writeFileSync(file, JSON.stringify(j)); fixedClips++;
  }
  console.log(`${body}: ${fixedClips} hw clips' right thumbs set to its typical (${fixedKeys} keys), from ${n} reference keys`);
}
