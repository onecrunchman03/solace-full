// SURVIVORZ: THE ANIMATION LAW, as code (SURVIVORZ.md §10 — Josh, Oct 21 2026: "arms or legs are
// not allowed to clip into body"). One measure, used by the review check (anim-render.html
// r.selfClip -> anim-clip.cjs) and by the bake (anim-build.html h.unclip), so what the bake clears
// is exactly what the check passes.
//
// The torso is the skin weighted to the hips, spine, neck and clavicles, read as a surface ROUND
// THE SPINE (a polyline hip -> spine_01..03 -> neck) in slices along it and angle slices round it,
// so it holds for a body bent double, lying or crawling. A limb vertex nearer the spine than that
// surface is INSIDE the body by the difference. Skin right by a limb's own root (the top of the
// upper arm against the ribs, the top of the thigh at the hip) is skipped: it is meant to touch —
// calibrated on plain idles and walks, which otherwise read 3-5 cm there. The head isn't torso.
import * as THREE from "three";

export const TORSO_BONES = /(^|_)(hip|pelvis|spine_0\d|neck|shoulder_[lr]|clavicle_[lr])$/;
export const LAW = { tol: 0.02, count: 15, armRoot: 0.2, legRoot: 0.18, head: 0.12 };
// THE ZOMBIES' RIG READ AS OURS (Oct 23 2026): the nineteen zombies are rigged with Auto-Rig Pro's names
// (arm_stretchl, forearm_stretchl, handl, index1l, thigh_stretchl, rootx, spine_01x, headx); canon() gives
// any bone its survivor name (upperarm_l, lowerarm_l, hand_l, index_01_l, upperleg_l, hip, spine_01,
// head), and a survivor's name comes back unchanged. Everything that reads a bone by its part — the law's
// limbs and torso, the bake's lookups, the pair check — goes through it, so a move can be built on a zombie
const ARP = { shoulder: "shoulder", arm_stretch: "upperarm", forearm_stretch: "lowerarm", hand: "hand", thigh_stretch: "upperleg", leg_stretch: "lowerleg", foot: "foot", toes_01: "ball" };
export function canon(n) {
  const b = String(n).replace(/^.*:/, "");
  let m;
  if ((m = /^(spine_0\d|neck|head|root)x$/.exec(b))) return m[1] === "root" ? "hip" : m[1];
  if ((m = /^(thumb|index|middle|ring|pinky)(\d)([lr])$/.exec(b))) return `${m[1]}_0${m[2]}_${m[3]}`;
  if ((m = /^(shoulder|arm_stretch|forearm_stretch|hand|thigh_stretch|leg_stretch|foot|toes_01)([lr])$/.exec(b))) return `${ARP[m[1]]}_${m[2]}`;
  return n;
}
// which limb a bone belongs to ("arm_l", "leg_r"), or null
export function limbOf(n0) {
  const n = canon(n0);
  const m = /(^|_)(upperarm|lowerarm|hand|thumb|index|middle|ring|pinky|upperleg|lowerleg|foot|ball)(_\w+)?_([lr])$/.exec(n);
  return m ? (/leg|foot|ball/.test(m[2]) ? "leg" : "arm") + "_" + m[4] : null;
}

// the vertices of a body, once: which mesh, which index, its dominant bone's name
// A BODY IN A SUIT (Rollo, Oct 22 2026) carries the person inside as a hidden mesh named "*body_proxy*":
// the law (law: true) reads the TORSO off the person — an arm or a leg must never pass through him —
// and the LIMBS off the suit. Read off the suit's own torso, the air pack and the baggy hips made a
// surface mostly air, and his own arms and thighs read 10-19 cm "inside" it. Everything else (a gun's
// butt, a partner in a hug, the hands) is the suit, what's actually touched: the proxy is skipped.
export const isProxy = (m) => /body_proxy/.test(m.name);   // (a glTF mesh's primitives come in as name_1, name_2)
export function vertexIndex(root, step = 3, { law = false } = {}) {
  const list = [];
  let suited = false; root.traverse((m) => { if (m.isSkinnedMesh && isProxy(m)) suited = true; });
  root.traverse((m) => {
    if (!m.isSkinnedMesh) return;
    if (isProxy(m) && !law) return;
    const pos = m.geometry.attributes.position, si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
    // (the person inside is a few thousand vertices: read whole, or the torso's slices go thin)
    for (let i = 0; i < pos.count; i += law && isProxy(m) ? 1 : step) {
      let best = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
      const bone = m.skeleton.bones[best]?.name ?? "";
      const torso = TORSO_BONES.test(canon(bone));
      if (law && suited) { if (isProxy(m)) { if (torso) list.push({ m, i, bone, limb: null, torso }); } else { const limb = limbOf(bone); if (limb) list.push({ m, i, bone, limb, torso: false }); } continue; }
      list.push({ m, i, bone, limb: limbOf(bone), torso });
    }
  });
  return list;
}
export const skinned = (x, out = new THREE.Vector3()) => x.m.getVertexPosition(x.i, out).applyMatrix4(x.m.matrixWorld);

// the torso's surface this moment. at(name) gives a bone's world position (short names).
export function torsoSurface(index, at) {
  const spine = ["hip", "spine_01", "spine_02", "spine_03", "neck"].map(at);
  const right = at("upperarm_r").sub(at("upperarm_l")).normalize();
  const seg = spine.slice(1).map((p, i) => p.distanceTo(spine[i])), total = seg.reduce((a, b) => a + b, 0);
  const onSpine = (p) => {
    let best = null, acc = 0;
    for (let i = 0; i < 4; i++) {
      const a = spine[i], d = spine[i + 1].clone().sub(a), L = seg[i];
      const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(d) / (L * L)));
      const off = p.clone().sub(a.clone().addScaledVector(d, t)), len = off.length();
      if (!best || len < best.len) best = { s: (acc + t * L) / total, off, len, axis: d.normalize(), endcap: (i === 0 && t === 0) || (i === 3 && t === 1) };
      acc += L;
    }
    return best;
  };
  const NS = 24, NA = 24, R = Array.from({ length: NS }, () => new Float32Array(NA));
  const slot = (o) => {
    const r = right.clone().addScaledVector(o.axis, -right.dot(o.axis)).normalize(), f = new THREE.Vector3().crossVectors(o.axis, r);
    const a = Math.atan2(o.off.dot(f), o.off.dot(r));
    return [Math.min(NS - 1, Math.floor(o.s * NS)), Math.floor(((a + Math.PI) / (2 * Math.PI)) * NA) % NA];
  };
  const v = new THREE.Vector3();
  for (const x of index) if (x.torso) { const o = onSpine(skinned(x, v)); if (o.endcap) continue; const [i, j] = slot(o); R[i][j] = Math.max(R[i][j], o.len); }
  for (const r of R) for (let a = 0; a < NA; a++) if (!r[a]) r[a] = Math.max(r[(a + 1) % NA], r[(a + NA - 1) % NA]);
  const head = at("head");
  const roots = { arm_l: at("upperarm_l"), arm_r: at("upperarm_r"), leg_l: at("upperleg_l"), leg_r: at("upperleg_r") };
  return {
    // how far ANY point (a gun's stock, a prop) is inside the torso: no limb-root allowance
    inside(p) { const o = onSpine(p); if (o.endcap) return 0; const [i, j] = slot(o); return R[i][j] - o.len; },
    // how far a limb vertex is inside the body (metres, <=0 outside or not judged)
    depth(p, limb) { return this.probe(p, limb).d; },
    // ... and the way straight out of the body from there (away from the spine)
    probe(p, limb) {
      if (p.distanceTo(roots[limb]) < (limb.startsWith("leg") ? LAW.legRoot : LAW.armRoot)) return { d: 0 };
      if (p.distanceTo(head) < LAW.head) return { d: 0 };
      const o = onSpine(p); if (o.endcap) return { d: 0 };
      const [i, j] = slot(o); return { d: R[i][j] - o.len, out: o.off.clone().normalize() };
    },
  };
}

// the law over one moment: worst depth, how many limb vertices are past LAW.tol, which bone
export function clipMoment(index, at, only) {
  const surf = torsoSurface(index, at), v = new THREE.Vector3();
  let worst = { depth: 0, n: 0, limb: null, bone: null };
  for (const x of index) {
    if (!x.limb || (only && x.limb !== only)) continue;
    const d = surf.depth(skinned(x, v), x.limb);
    if (d > LAW.tol) { worst.n++; if (d > worst.depth) worst = { ...worst, depth: d, limb: x.limb, bone: x.bone.replace(/^.*?_(?=(upper|lower|hand|thumb|index|middle|ring|pinky|foot|ball))/, "") }; }
  }
  worst.depth = +worst.depth.toFixed(3);
  return worst;
}
