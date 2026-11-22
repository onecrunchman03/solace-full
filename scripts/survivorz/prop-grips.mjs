// SURVIVORZ: where a hand holds each hand-held prop, worked out from the packed model's own
// shape and written into props/props.json as `grip`, in the prop's space (metres, the packed
// origin):
//   grip.at    the middle of the fist
//   grip.axis  the line the fist closes along (the thumb side), pointing to the working end:
//              the head of a tool, the neck of a bottle, the cap of a pipe bomb
//   grip.how   "handle" (held by the bottom of the handle) | "middle"
// The animation clips close the fist on that line (the animation session, Oct 23): knife,
// pipe, hammer, crowbar and axe by the bottom of the handle; bottles, the molotov and the pipe
// bomb by the middle. The guns keep their own hold in props/guns/guns.json.
//
//   node scripts/survivorz/prop-grips.mjs           all of them; prints each with its end widths
// Each grip is checked by eye on the props bench (?id=<id>&grip=1 draws it).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PROPS = path.join(ROOT, "assets", "downloads", "survivorz", "props");
const FIST = 0.05;   // the fist's middle sits this far in from the end of a handle

// how each is held, and which end of its long axis the handle is at. `end` was read off the
// bench: "auto" takes the thinner end; a few shapes fool that (a knife's blade tip is thinner
// than its handle) and say which end outright.
export const HELD = {
  "chef-knife": { how: "handle", end: "thick" },
  "fish-knife": { how: "handle", end: "thick" },
  machete: { how: "handle", end: "thick" },
  "lead-pipe": { how: "handle", end: "auto" },
  "claw-hammer": { how: "handle", end: "auto" },
  crowbar: { how: "handle", end: "auto" },
  "fire-axe-a": { how: "handle", end: "auto" },
  "fire-axe-b": { how: "handle", end: "auto" },
  "fire-axe-c": { how: "handle", end: "auto" },
  "beer-bottle": { how: "middle" },
  "glass-bottle": { how: "middle" },
  molotov: { how: "middle" },
  "pipe-bomb": { how: "middle", toward: "thick" },   // the fused cap is the wider end
  "water-bottle": { how: "middle" },
  walkie: { how: "middle", t: 0.33 },   // the body, below the antenna
  flashlight: { how: "middle", toward: "thick" },
  "flashlight-tactical": { how: "middle", toward: "thick" },
  syringe: { how: "middle" },
  "syringe-b": { how: "middle" },
  "mag-rifle": { how: "middle" },
  "mag-pistol": { how: "middle" },
  bandage: { how: "middle" },
  "keycard-a": { how: "middle" },
  "keycard-b": { how: "middle" },
  "keycard-c": { how: "middle" },
  "id-card": { how: "middle", t: 0.12 },   // the card, not the lanyard above it
};

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const mul = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];

async function points(id) {
  const doc = await io.read(path.join(PROPS, `${id}.glb`));
  const out = [];
  for (const n of doc.getRoot().listNodes()) {
    const mesh = n.getMesh(); if (!mesh) continue;
    const m = n.getWorldMatrix();
    for (const p of mesh.listPrimitives()) {
      const a = p.getAttribute("POSITION"), v = [0, 0, 0];
      for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); out.push(mul(m, v[0], v[1], v[2])); }
    }
  }
  return out;
}

function grip(pts, spec) {
  const min = [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k]))), max = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k])));
  const size = max.map((v, k) => v - min[k]);
  const k = size.indexOf(Math.max(...size)), [a, b] = [0, 1, 2].filter((i) => i !== k);
  const L = size[k];
  // the cross-section of a slab of the model, from t0 to t1 along the long axis (0..1)
  const slab = (t0, t1) => {
    const s = pts.filter((p) => (p[k] - min[k]) / L >= t0 && (p[k] - min[k]) / L <= t1);
    if (!s.length) return null;
    const lo = [a, b].map((i) => Math.min(...s.map((p) => p[i]))), hi = [a, b].map((i) => Math.max(...s.map((p) => p[i])));
    return { w: Math.max(hi[0] - lo[0], hi[1] - lo[1]), area: (hi[0] - lo[0]) * (hi[1] - lo[1]), mid: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2] };
  };
  const e0 = slab(0, 0.12), e1 = slab(0.88, 1);
  let from;   // the end the hand is at (0 = min along k, 1 = max)
  // middle: the axis points to the working end, the thinner one (a neck, a needle, an antenna)
  // unless the spec says thick (a flashlight's head)
  const thinEnd = e0.w <= e1.w ? 0 : 1;
  const work = spec.toward === "thick" ? 1 - thinEnd : thinEnd;
  if (spec.how === "middle") from = 1 - work;
  else if (spec.end === "thick") from = e0.area >= e1.area ? 0 : 1;
  else from = e0.w <= e1.w ? 0 : 1;
  let t;
  if (spec.how === "middle") t = spec.t != null ? (from === 0 ? spec.t : 1 - spec.t) : 0.5;
  else t = Math.min(0.5, FIST / L), t = from === 0 ? t : 1 - t;
  const s = slab(Math.max(0, t - 0.04), Math.min(1, t + 0.04)) ?? slab(0, 1);
  const at = [0, 0, 0];
  at[k] = min[k] + t * L; at[a] = s.mid[0]; at[b] = s.mid[1];
  const axis = [0, 0, 0];
  axis[k] = from === 0 ? 1 : -1;   // from the hand end toward the working end
  return { how: spec.how, at: at.map((v) => +v.toFixed(4)), axis, ends: [e0.w, e1.w].map((v) => +v.toFixed(3)) };
}

const index = JSON.parse(fs.readFileSync(path.join(PROPS, "props.json"), "utf8"));
for (const [id, spec] of Object.entries(HELD)) {
  const metaFile = path.join(PROPS, "meta", `${id}.json`);
  if (!fs.existsSync(metaFile)) { console.log(`${id.padEnd(20)} not packed`); continue; }
  const g = grip(await points(id), spec);
  const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
  meta.grip = { how: g.how, at: g.at, axis: g.axis };
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 1));
  index[id] = meta;
  console.log(`${id.padEnd(20)} ${g.how.padEnd(7)} at ${g.at.join(", ").padEnd(28)} axis ${g.axis.join(",")}   end widths ${g.ends.join(" / ")}`);
}
fs.writeFileSync(path.join(PROPS, "props.json"), JSON.stringify(index, null, 1));
