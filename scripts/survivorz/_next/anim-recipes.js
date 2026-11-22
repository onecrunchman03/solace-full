// SURVIVORZ: moves BUILT IN CODE on top of a clip we already have (Josh, Oct 21 2026: the
// last few moves weren't on Mixamo — "find online or possibly build them, whatever is
// easiest"). Each recipe names its base clip (already baked on every survivor), its length,
// and a function run once per frame AFTER the base pose is set, which adds the new motion in
// WORLD space through the helpers below, so the same recipe works on every body whatever its
// bones' local axes. scripts/survivorz/anim-build.html runs them.
//
// The body faces +Z with +Y up. Helpers (h):
//   h.turn(bone, axis, degrees)       rotate a bone about a world axis ("x" pitch forward/back,
//                                      "y" twist, "z" lean left/right, or a Vector3)
//   h.reach(side, point, w, pole)     two-bone IK: the "l"/"r" hand toward a world point,
//                                      blended w (0..1) over the base pose
//   h.at(bone)                        a bone's world position (a Vector3, new each call)
//   h.ahead(p, fwd, up, right)        p moved fwd/up/right metres in the body's frame
//   h.loop(t, dur, k)                 a phase that loops cleanly: 2*pi*k*t/dur
//   h.pulse(t, at, rise, fall)        0..1..0 envelope: a sharp rise, a slower fall
//   h.ease(t, a, b)                   0 before a, 1 after b, smooth between
//   h.frame()                         the body's fwd / right / left this frame (world)
//   h.vec(x, y, z)                    a new world vector
//   h.orient(side, fingers, palm, w)  turn a hand: fingers along one direction, palm facing another
//   h.fist(side, amount)              close a hand (1 = a fist)
//   h.partner                         the other body, for a move for two (the hug)
// "z" turns about the body's FORWARD axis: positive tips a bone's far end toward the body's
// right and the body's left side UP. A shoulder shrug is therefore +z on the left clavicle and
// -z on the right — checked on the review video, not assumed.
// Bone names are the scans' (spine_01..03, neck, head, shoulder_l, upperarm_l, lowerarm_l,
// hand_l and _r).
import * as THREE from "three";
const TAU = Math.PI * 2;
const THREE_DEG = Math.PI / 180;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = () => V(0, 1, 0);
const unit = (v) => v.clone().normalize();
// the way a hand travels between its own place and a target near the body: out in front first,
// never the straight line (from by the hip to the chest, that runs through the belly). k 0..1.
function viaFront(h, target, k, side) {
  const out = h.ahead(h.at("spine_02"), 0.42, -0.05, side === "r" ? 0.2 : -0.2);
  const a = 1 - k;           // quadratic through `out`: start at out, end at the target
  return out.clone().multiplyScalar(a * a + 2 * a * k * 0.5).addScaledVector(target, k * k + 2 * a * k * 0.5);
}
// a weighted sum of directions, made a unit
const dirOf = (...pairs) => unit(pairs.reduce((a, [v, k]) => a.addScaledVector(v, k), V()));

// THE HAND'S FRAME, shared by the bake and the review props so a prop sits in the fist the bake
// closed round it: o the wrist, f the fingers' way (wrist to middle knuckle), p the palm's way
// (read off the middle finger's curl, which always bends toward the palm), u the THUMB side (for
// either hand), and fist — the middle of a closed fist, where a handle runs through along u.
export function handFrame(at, side) {
  const o = at("hand_" + side), m1 = at("middle_01_" + side), m2 = at("middle_02_" + side), m3 = at("middle_03_" + side);
  const f = unit(m1.clone().sub(o));
  const c = unit(m3.clone().sub(m2)).sub(unit(m2.clone().sub(m1)));
  const p = unit(c.addScaledVector(f, -c.dot(f)));
  const u = side === "r" ? V().crossVectors(f, p) : V().crossVectors(p, f);
  return { o, f, p, u, fist: o.clone().addScaledVector(f, 0.07), pt: (a, b, c2) => o.clone().addScaledVector(f, a).addScaledVector(p, b).addScaledVector(u, c2) };
}
// THE HAND AS A GUN SEES IT: rigid to the hand bone — fingers along the middle knuckle, the palm
// across the knuckles (index to little finger), so nothing the FINGERS do turns it. handFrame reads
// the palm off the fingers' curl, which is right for a prop held in a fist and wrong for a gun: a
// clip that poses its fingers differently (Mixamo's pistol pack) read as a hand turned upside down.
// The game parents a gun to the hand bone, which is exactly this frame.
// cal (anim-hands.js gripCal, measured per body): hold(r) is where a thing of radius r sits held
// in this hand — in front of the palm's skin, in the curl of the fingers. Without one it falls back
// to the fist's middle
export function handRigid(at, side, cal = null) {
  const o = at("hand_" + side), f = unit(at("middle_01_" + side).sub(o));
  const across = at("index_01_" + side).sub(at("pinky_01_" + side));
  const p = unit(side === "r" ? V().crossVectors(across, f) : V().crossVectors(f, across));
  p.addScaledVector(f, -p.dot(f)).normalize();
  const u = side === "r" ? V().crossVectors(f, p) : V().crossVectors(p, f);
  const fist = o.clone().addScaledVector(f, 0.07);
  return { o, f, p, u, fist, cal, pt: (a, b, c2) => o.clone().addScaledVector(f, a).addScaledVector(p, b).addScaledVector(u, c2),
    hold: (r = 0.015) => cal ? o.clone().addScaledVector(f, cal.f).addScaledVector(p, cal.p + r).addScaledVector(u, cal.u) : fist.clone() };
}
const scaled = (per, w) => Object.fromEntries(Object.entries(per).map(([k, v]) => [k, v * w]));
const poleOf = (h, side) => h.ahead(h.at("upperarm_" + side), -0.1, -0.4, side === "r" ? 0.3 : -0.3);
// a fist round a point: the wrist placed so the closed fist's middle lands there
// obj {r, sdf?, len?, wrap?}: a THING held — `point` is then its middle, sat in the hand's grip
// channel (in front of the palm, h.wristFor), and the fingers close until they touch it (h.wrap).
// Its shape is sdf, or a bar of radius r along the thumb side, len either way
function grip(h, side, point, fingers, palm, w = 1, close = 1, per = {}, pole, obj = null) {
  // (a thing held from the first frame keeps its fingers on it while the ARM is still at rest:
  // returning at w 0 left the clip's own fingers inside the can, and snapped them out of it)
  if (w <= 0 && !(obj?.wrap?.w > 0 && h.wrap)) return;
  if (obj && h.wrap) {
    if (w > 0) for (let k = 0; k < 2; k++) { h.reach(side, h.wristFor(side, point, unit(fingers), palm, obj.r), w, pole ?? poleOf(h, side)); h.orient(side, fingers, palm, w); }
    // (a thing carried IN the hand is shaped from where the hand really got to — the review draws
    // it there — not from where it was sent: during an ease-in, or once the clip law has moved the
    // arm, they differ by centimetres, and the fingers closed round a can that wasn't there)
    if (obj.place) return held(h, side, w);
    h.wrap(side, handShape(h, side, obj), { w, ...obj.wrap });
    return held(h, side, w);
  }
  h.reach(side, point.clone().addScaledVector(unit(fingers), -0.07), w, pole ?? poleOf(h, side));
  h.orient(side, fingers, palm, w);
  h.fist(side, close * w, scaled(per, w));
  held(h, side, w);
}
// the signed distance to a capsule (a bar, a handle, a bottle's neck): a to b, radius r
export function capsule(a, b, r) {
  const ab = b.clone().sub(a), L2 = ab.lengthSq();
  return (x) => { const t = L2 > 0 ? Math.min(1, Math.max(0, x.clone().sub(a).dot(ab) / L2)) : 0; return x.distanceTo(a.clone().addScaledVector(ab, t)) - r; };
}
const union = (...fs) => (x) => Math.min(...fs.map((f) => f(x)));
// how far from a point inside a thing to its surface, going against `palm` (the way a hand
// coming at it with its palm facing `palm` meets it)
function depthAlong(sdf, S, palm, give = 0.004) {
  const d = unit(palm.clone()).negate();
  for (let k = 0.002; k < 0.08; k += 0.002) if (sdf(S.clone().addScaledVector(d, k)) > 0) return Math.max(0.012, k + give);   // (and the palm pad's give)
  return Math.max(0.012, -sdf(S));
}
// a held thing's shape where THIS hand holds it: obj.sdf (a world thing, a gun), or obj.shape(H, R)
// built on the hand's hold point and frame, or a bar of radius r along the thumb side
function handShape(h, side, obj) {
  if (obj.sdf) return obj.sdf;
  const R = h.hand(side), H = R.hold(obj.r);
  if (obj.shape) return obj.shape(H, R);
  const len = obj.len ?? 0.06;
  return capsule(H.clone().addScaledVector(R.u, -len), H.clone().addScaledVector(R.u, len), obj.r);
}
// a hand's finger points for touching: each finger's last two joints and its tip
const fingerTips = (h, side) => ["thumb", "index", "middle", "ring", "pinky"].flatMap((f) => { const b = h.at(`${f}_02_${side}`), c = h.at(`${f}_03_${side}`); return [b, c, c.clone().addScaledVector(c.clone().sub(b), 0.75)]; });
// the signed distance to a box (the review's box: middle, its x and y ways, size)
function boxSdf(c, x, y, size) {
  const xx = unit(x), yy = unit(y.clone().addScaledVector(xx, -y.dot(xx))), zz = V().crossVectors(xx, yy);
  return (p) => { const r = p.clone().sub(c), q = [Math.abs(r.dot(xx)) - size[0] / 2, Math.abs(r.dot(yy)) - size[1] / 2, Math.abs(r.dot(zz)) - size[2] / 2];
    return Math.hypot(...q.map((v) => Math.max(0, v))) + Math.min(0, Math.max(...q)); };
}
// a hand round something: the bake smooths its fingers (a base clip's own finger twitches read
// as a fist snapping on a handle)
function held(h, side, w) { if (h.grip) h.grip[side] = Math.max(h.grip[side] ?? 0, w); }
// a fist round a BAR (a crowbar, a bottle's neck, a handle): the bar runs through the fist along
// the thumb side (`bar`, the way the thumb points), and how far the hand turns round it is left to
// the arm — the back of the hand carries on from the forearm, as a wrist does when it grips
// naturally (a turn fixed by the recipe bent wrists 140°)
function gripBar(h, side, point, bar, w = 1, close = 1, per = {}, pole, lean = null, obj = null) {
  if (w <= 0) { if (obj?.wrap?.w > 0 && h.wrap && !obj.place) { h.wrap(side, handShape(h, side, obj), obj.wrap); held(h, side, 1); } return; }
  const u = unit(bar);
  const fingersFor = () => {
    let f = unit(h.at("hand_" + side).sub(h.at("lowerarm_" + side)));
    if (lean) f.lerp(unit(lean), 0.35);
    f.addScaledVector(u, -f.dot(u)); if (f.lengthSq() < 1e-6) f = V(0, -1, 0).addScaledVector(u, -u.y); return unit(f);
  };
  for (let k = 0; k < 3; k++) {
    const f = fingersFor(), p = side === "r" ? V().crossVectors(u, f) : V().crossVectors(f, u);
    h.reach(side, obj && h.wristFor ? h.wristFor(side, point, f, p, obj.r) : point.clone().addScaledVector(f, -0.07), w, pole ?? poleOf(h, side));
    h.orient(side, f, p, w);
  }
  if (obj && h.wrap) { if (!obj.place) h.wrap(side, handShape(h, side, obj), { w, ...obj.wrap }); }
  else h.fist(side, close * w, scaled(per, w));
  held(h, side, w);
}
// a FINGERTIP onto a point (a key, a can's tab): reach, turn, close the rest of the hand, then
// measure where the tip really landed and move the wrist by the miss, twice, because finger
// lengths differ body to body. Solved at full weight, then laid over the base pose at w.
function tipTo(h, side, finger, tip, fingers, palm, w, close, per, pole) {
  if (w <= 0) return;
  pole ??= poleOf(h, side);
  const restore = h.save(side);
  const wrist = tip.clone().addScaledVector(unit(fingers), -0.17);
  for (let k = 0; k < 3; k++) {
    restore();
    h.reach(side, wrist, 1, pole); h.orient(side, fingers, palm, 1); h.fist(side, close, per);
    const a = h.at(`${finger}_03_${side}`), b = h.at(`${finger}_02_${side}`);
    wrist.add(tip.clone().sub(a.clone().addScaledVector(unit(a.clone().sub(b)), 0.022)));
  }
  restore();
  h.reach(side, wrist, w, pole); h.orient(side, fingers, palm, w); h.fist(side, close * w, scaled(per, w));
}
// THE HAMMER: where the board and nail sit off the hips (metres: forward, up, right), and the
// prop — the handle's length from the fist to the head's centre, and how far the head's face
// stands in front of the handle. anim-render.html draws the same hammer and board for review.
export const HAMMER = { board: 0.44, height: 0.38, across: 0.06, handle: 0.24, face: 0.035, headLen: 0.12, r: 0.015, out: 0.03, brace: 0.2, braceDown: 0.03 };
// COMFORT: stood a forearm further off than the hug; the right hand comes up to the partner's LEFT
// shoulder (on this body's right), rests on the top of it, a slow rub of the thumb side and a squeeze
// in the middle; the head tips toward the partner
export const COMFORT_GAP = 0.32;
function comfort(h, t) {
  const P0 = h.partner; if (!P0) throw new Error("comfort is baked for a pair: anim-build.cjs --hug");
  const P = P0.withGap(P0.gap + COMFORT_GAP), F = h.frame();
  const w = h.ease(t, 0.3, 1.3) * (1 - h.ease(t, 4.7, 5.7)), squeeze = h.ease(t, 2.4, 2.8) * (1 - h.ease(t, 3.3, 3.8));
  const rub = 0.012 * Math.sin(h.loop(t, 6, 3)) * h.ease(t, 1.3, 1.6) * (1 - h.ease(t, 4.4, 4.7));
  h.turn("spine_02", "x", 4 * w); h.turn("head", "z", -7 * w); h.turn("head", "x", 6 * w); h.turn("neck", "x", 4 * w);
  h.turn("shoulder_r", "y", 4 * w);
  // on top of the shoulder, a little to its front
  const y = P.shoulderY + 0.035, at = P.surface(y, 0.95, -0.25, 0.04 - 0.006 * squeeze).addScaledVector(F.right, rub);
  const into = unit(P.centre(y - 0.03).sub(at)), fingers = unit(dirOf([F.fwd, 1], [UP(), -0.35]).addScaledVector(into, -0.2));
  h.reach("r", at.clone().addScaledVector(fingers, -0.075).addScaledVector(into, -0.025), w, h.ahead(h.at("upperarm_r"), -0.05, -0.5, 0.3));
  h.orient("r", fingers, into, w);
  h.relaxHand("r", 0.1 + 0.2 * squeeze, {}, w);   // (an open hand on a shoulder: closed, a short partner's took the fingertips in)
}
// A KISS: the two mouths meet at the middle between them. Each body bends its upper back, neck and head
// toward the meeting point (a few iterations of measuring its own mouth), tilting its head to its own
// right ("a") or left ("b") so the noses pass; the hands hold the partner (waist or upper arms)
function kiss(h, t, a) {
  const P = h.partner; if (!P) throw new Error("the kiss is baked for a pair: anim-build.cjs --hug");
  const F = h.frame(), w = h.ease(t, 0.3, 1.4) * (1 - h.ease(t, 3.9, 4.8)), lips = h.ease(t, 1.2, 1.7) * (1 - h.ease(t, 3.4, 3.9));
  if (a) hug(h, t, false, { noHead: true, calm: true, out: 0.05 });   // (out: the partner leans in to a kiss, its back comes toward these hands)
  const sway = Math.sin(h.loop(t, 5, 1)) * w;
  const tilt = (a ? 1 : -1) * 14 * w;
  h.turn("head", "z", tilt); h.turn("spine_02", "z", 1.2 * sway);
  // the meeting point: half way between the two mouths, each stopping 4 mm short of the middle
  const mine0 = h.ahead(h.at("head"), 0.1, 0.012), mid = mine0.clone().lerp(P.mouth, 0.5);
  let bx = 0, nx = 0, hx = 0;
  for (let it = 0; it < 4; it++) {
    const m = h.ahead(h.at("head"), 0.1, 0.012), toward = unit(P.mouth.clone().sub(m)), want = mid.clone().addScaledVector(toward, -0.004 - 0.02 * (1 - lips));
    const dz = want.clone().sub(m).dot(F.fwd) * w, dy = (want.y - m.y) * w;
    // forward: the upper back leans in; up and down: the neck and head pitch (down = +x)
    const dB = Math.max(-6, Math.min(12, dz * 60)), dN = Math.max(-14, Math.min(14, -dy * 120));
    h.turn("spine_03", "x", dB); h.turn("neck", "x", dN * 0.45); h.turn("head", "x", dN * 0.55);
    bx += dB; nx += dN;
  }
  void bx; void nx; void hx;
  // the hands: a — round the partner's back, the hug's under-arms (they go out round the flank, never
  // through); b — its upper arms, just below the shoulders
  if (a) return;
  for (const [side, s] of [["l", -1], ["r", 1]]) {
    // (a: round onto the small of the back — chests this close, the partner's waist is level with this
    // body's own sides, and hands on its sides sank into it)
    const y = a ? P.hipY + 0.17 : P.shoulderY - 0.1;
    const at = a ? P.surface(y, s * 0.55, 0.85, 0.02) : P.surface(y, s * 1, -0.15, 0.04), into = unit(P.centre(y).sub(at));
    const f = a ? dirOf([F.right, -s], [UP(), -0.25]) : dirOf([F.fwd, 0.5], [UP(), -0.8]);
    f.addScaledVector(into, -f.dot(into)).normalize();
    const hw = h.ease(t, a ? 0.6 : 0.8, a ? 1.5 : 1.7) * (1 - h.ease(t, 3.8, 4.7));
    h.reach(side, at.clone().addScaledVector(f, -0.07).addScaledVector(into, -0.025), hw, h.ahead(h.at("upperarm_" + side), -0.05, -0.5, 0.3 * s));
    h.orient(side, f, into, hw);
    h.relaxHand(side, 0.25, {}, hw);
  }
}
// THE REVIVE: the recorded CPR is compressions kneeling upright, then a long lean down for the rescue
// breaths. The partner is placed ONCE by both: its breastbone under the reviver's hands at the top of a
// compression, its mouth under the reviver's mouth at the deepest lean (a rigid fit of the two pairs of
// points on the floor). Every frame after, while the hands are over the breastbone they are held to it —
// on its surface at the top of each stroke, the stroke's own depth (at most 4.5 cm, a real chest's
// give) below — and they go where the clip takes them for the breaths
export const REVIVE = { clip: "mx-receiving-cpr", chest: 0.1, stack: 0.03, give: 0.045, body: 0.15, arm: 0.27, head: 0.1, palm: 0.035, lips: 0.04, sleeve: 0.04 };
const mouthOf = (h) => h.ahead(h.at("head"), 0.1, 0.012);
const flagOff = (k) => !!globalThis.__flags?.[k];   // (a diagnostic switch: PAGE_FLAGS='{"keepoff":1}' to anim-build.cjs)
function revive(h, t) {
  globalThis.__t = t;
  const P = h.partner; if (!P?.pose) throw new Error("the revive is baked for a pair: anim-build.cjs --hug");
  const base = "mx-administering-cpr", mid = () => h.at("hand_l").add(h.at("hand_r")).multiplyScalar(0.5);
  if (!h.pairPlace) {
    const dur = h.durOf(base), rows = [];
    const legPts = () => ["l", "r"].flatMap((sd) => { const a = h.at("upperleg_" + sd), b = h.at("lowerleg_" + sd), c = h.at("foot_" + sd); return [0.5, 0.75, 1].map((k) => a.clone().lerp(b, k)).concat([0.33, 0.66, 1].map((k) => b.clone().lerp(c, k))); });
    for (let s2 = 0; s2 < dur; s2 += 0.05) rows.push(h.peek(base, s2, () => ({ t: s2, m: mid(), mo: mouthOf(h), legs: legPts() })));
    const deep = rows.reduce((a, r) => (r.mo.y < a.mo.y ? r : a));                       // the rescue breath
    const comp = rows.filter((r) => r.t < deep.t - 1.5); const use = comp.length ? comp : rows.slice(0, 20);
    const Hc = use.reduce((a, r) => a.add(r.m), V()).multiplyScalar(1 / use.length), top = Math.max(...use.map((r) => r.m.y)), bot = Math.min(...use.map((r) => r.m.y));
    const Mb = deep.mo.clone();
    const p0 = P.pose(REVIVE.clip, 0), S0 = p0.at("spine_03").lerp(p0.at("spine_02"), 0.4), hd = p0.at("head"), P0 = hd.clone().addScaledVector(unit(hd.clone().sub(p0.at("neck"))), 0.05).addScaledVector(UP(), 0.08);
    // the yaw that turns the partner's breastbone->mouth onto the reviver's hands->mouth (on the floor),
    // then the shift that puts the two midpoints together
    const ang = (v) => Math.atan2(v.x, v.z), d = (a, b2) => { const v = b2.clone().sub(a); v.y = 0; return v; };
    const r = ang(d(Hc, Mb)) - ang(d(S0, P0)), cy = Math.cos(r), sy = Math.sin(r);   // (three's turn: x' = x cos + z sin)
    const rot = (v) => new THREE.Vector3(v.x * cy + v.z * sy, v.y, -v.x * sy + v.z * cy);
    const mA = Hc.clone().add(Mb).multiplyScalar(0.5), mB = rot(S0).add(rot(P0)).multiplyScalar(0.5);
    // ... then KNEELING BESIDE, NOT ON: shifted and turned a little until the reviver's legs (every
    // twentieth of the clip) stay clear of the partner's torso, a capsule from hips to neck — the fit
    // alone seated her flank in his knees. The hands are held to the breastbone wherever it ends up
    const hip0 = p0.at("hip"), neck0 = p0.at("neck"), RAD = REVIVE.body + 0.065;
    const segDist = (p2, a, b2) => { const ab = b2.clone().sub(a), k = Math.max(0, Math.min(1, p2.clone().sub(a).dot(ab) / ab.lengthSq())); return p2.distanceTo(a.clone().addScaledVector(ab, k)); };
    const legs = rows.filter((_, i) => i % 4 === 0).flatMap((r2) => r2.legs);
    let best = null;
    for (let dy = -20; dy <= 20; dy += 4) for (let sh = 0; sh <= 0.3; sh += 0.02) {
      const rr = r + dy * Math.PI / 180, c2 = Math.cos(rr), s3 = Math.sin(rr), rt = (v) => new THREE.Vector3(v.x * c2 + v.z * s3, v.y, -v.x * s3 + v.z * c2);
      const away = unit(d(h.at("hip"), mA)), off = mA.clone().sub(rt(S0).add(rt(P0)).multiplyScalar(0.5)).addScaledVector(away, sh); off.y = 0;
      const at = (v) => rt(v).add(off), Sp = at(S0), Pp = at(P0), Hp = at(hip0), Np = at(neck0);
      let pen = 0; for (const q of legs) pen += Math.max(0, RAD - segDist(q, Hp, Np));
      const cost = 20 * pen + Math.hypot(Sp.x - Hc.x, Sp.z - Hc.z) + 1.2 * Math.hypot(Pp.x - Mb.x, Pp.z - Mb.z);
      if (!best || cost < best.cost) best = { cost, off, rr, pen };
    }
    h.pairPlace = { x: +best.off.x.toFixed(3), z: +best.off.z.toFixed(3), yaw: +((best.rr * 180 / Math.PI + 360) % 360).toFixed(1) };
    void mB;
    h.reviveTop = top; h.reviveBot = bot; h.reviveDeep = deep.mo.y;
    // the breath's own stretch of the clip: the run of frames round the deepest lean with the mouth low
    let i0 = rows.indexOf(deep), i1 = i0; while (i0 > 0 && rows[i0 - 1].mo.y < deep.mo.y + 0.08) i0--; while (i1 < rows.length - 1 && rows[i1 + 1].mo.y < deep.mo.y + 0.08) i1++;
    h.reviveBreath = [rows[i0].t, rows[i1].t];
  }
  // (the LOWER half of the breastbone, where CPR presses: part way from the upper chest to the waist)
  // (the chest's SURFACE from the partner's posed skin, straight up from its spine: a fixed 10 cm read
  // the surface wrong on smaller chests, and the hands went 10 cm into Carla's)
  const p = P.pose(REVIVE.clip, t, h.pairPlace), M = mid(), skR = p.into(), S = p.at("spine_03").lerp(p.at("spine_02"), 0.4);
  // (up to 40 cm: Rollo's suit and its air pack stand further off his spine than 20 cm, and the hands pressed
  // 12-16 cm into him)
  for (let k = 0; k < 80 && skR(S).d > 0; k++) S.addScaledVector(UP(), 0.005);
  // THE BREATH reaches the mouth: a reviver whose body is smaller or larger than the recording's leans
  // the rest of the way, the upper back and neck bent and turned toward the partner's mouth while the
  // clip is in its deepest lean (a few small steps, each joint held to a modest angle)
  // (the partner's face where its skin is: a hood stands further out than a face — on Rollo the breath went
  // into his mask)
  const hd0 = p.at("head"), pm = hd0.clone().addScaledVector(unit(hd0.clone().sub(p.at("neck"))), 0.05).addScaledVector(UP(), (h.reviveFace ??= Math.max(0.1, p.headOut(UP()))));
  const [b0, b1] = h.reviveBreath, bw = h.ease(t, b0 - 0.35, b0 + 0.1) * (1 - h.ease(t, b1 - 0.1, b1 + 0.35));
  if (bw > 0 && !flagOff("lean")) {
    const DOF = [["spine_01", "x", 15], ["spine_02", "x", 18], ["spine_03", "x", 15], ["spine_02", "y", 20], ["spine_02", "z", 12], ["neck", "x", 20]], used = DOF.map(() => 0);
    // (no bend that sinks the reviver's own head or chest into the partner: a big body — Rollo in his suit —
    // leaning the rest of the way to the mouth put his head and chest 11-18 cm into the patient. Judged on his
    // skin within reach of her, the head and torso only)
    const reach = [p.at("hip"), p.at("spine_02"), p.at("neck"), p.at("head")];
    const mine = h.skin().filter((x) => !(x.limb && (x.limb.startsWith("arm") || x.limb.startsWith("leg"))) && reach.some((q) => q.distanceTo(x.p) < 0.5)).map((x) => x.i);
    const sunk = () => { let m = 0; for (const x of h.skin(mine)) m = Math.max(m, skR(x.p).d); return m; };
    let sunk0 = sunk();
    for (let it = 0; it < 10; it++) {
      // (to just above the lips, not onto them: a mouth measured to the lips put a tall reviver's face
      // 6 cm into the partner's, and his shoulder down onto hers)
      const err = pm.clone().addScaledVector(UP(), REVIVE.lips).sub(mouthOf(h)); if (err.length() < 0.015) break;
      DOF.forEach(([b, ax, lim], i) => {
        h.turn(b, ax, 1); const d1 = mouthOf(h); h.turn(b, ax, -1); const d0 = mouthOf(h);
        const dd = d1.sub(d0), g = dd.dot(err) / Math.max(1e-6, dd.lengthSq());   // (degrees of this joint that close the gap, alone)
        const step = Math.max(-4, Math.min(4, 0.5 * g * bw)), next = Math.max(-lim * bw, Math.min(lim * bw, used[i] + step));
        h.turn(b, ax, next - used[i]);
        const sk2 = flagOff("nosunk") ? 0 : sunk(); if (sk2 > Math.max(0.01, sunk0)) h.turn(b, ax, used[i] - next); else { used[i] = next; sunk0 = Math.min(sunk0, sk2); }
      });
    }
    // ... and if the recording's own lean has carried him in, bent back out: each step the joint that takes his
    // head and chest furthest out of her, three degrees at a time (the breath reaches a little less far; a big
    // reviver's lips stop a few centimetres short rather than his face going through her)
    const LIFT = [["spine_01", "x"], ["spine_02", "x"], ["spine_03", "x"], ["neck", "x"], ["spine_02", "z"], ["spine_02", "y"]];
    for (let it = 0; it < 14 && !flagOff("nosunk"); it++) {
      const s0 = sunk(); if (s0 <= 0.012) break;
      let best = null;
      for (const [b, ax] of LIFT) for (const sg of [1, -1]) { h.turn(b, ax, 3 * sg * bw); const v = sunk(); h.turn(b, ax, -3 * sg * bw); if (!best || v < best.v) best = { v, b, ax, sg }; }
      if (!best || best.v >= s0 - 0.001) break;
      h.turn(best.b, best.ax, 3 * best.sg * bw);
    }
  }
  // ... and THE HANDS ON THE HEAD for it, as the breaths are taught: the hand nearer the head on the
  // forehead tilting it back, the other under the chin lifting it (the recording's hands just hung
  // about the face, and through it)
  // (OFF: placed on the head and chin from this body's side, the arms rolled past real ones for whole
  // seconds — measured, Oct 23. The recording's own hands at the face are kept, held off the head)
  if (REVIVE.headHands && bw > 0.02 && !flagOff("head")) {
    const up = unit(hd0.clone().sub(p.at("neck"))), hc = hd0.clone().addScaledVector(up, 0.06);
    const near = h.at("hand_l").distanceTo(hc) < h.at("hand_r").distanceTo(hc) ? "l" : "r", far = near === "l" ? "r" : "l";
    const fore = hc.clone().addScaledVector(UP(), REVIVE.head + 0.02).addScaledVector(up, 0.03), chin = hd0.clone().addScaledVector(UP(), 0.085).addScaledVector(up, -0.035);
    for (const [side, at] of [[near, fore], [far, chin]]) {
      // (the fingers carry on from the forearm, flattened, palm down: set to fixed directions on the
      // head, the wrists bent past a hundred degrees)
      h.reach(side, at.clone().addScaledVector(UP(), 0.03), bw, h.at("lowerarm_" + side).clone().addScaledVector(unit(h.at("lowerarm_" + side).sub(h.at("upperarm_" + side).lerp(h.at("hand_" + side), 0.5))), 0.3));
      const fa = unit(h.at("hand_" + side).sub(h.at("lowerarm_" + side))); fa.y = Math.min(fa.y, 0) * 0.3; fa.normalize();
      h.orient(side, fa, UP().negate(), bw * 0.7); h.relaxHand(side, side === near ? 0.1 : 0.4, {}, bw);
    }
  }
  const flat = Math.hypot(M.x - S.x, M.z - S.z), w = (1 - h.ease(flat, 0.12, 0.3)) * (1 - bw);
  // (the clip's stroke mapped onto the chest: on its surface at the stroke's top, REVIVE.give in at the
  // bottom; the wrist a palm's thickness above where the palm lies)
  const c = Math.max(0, Math.min(1, (M.y - h.reviveBot) / Math.max(0.02, h.reviveTop - h.reviveBot)));
  const y = S.y - REVIVE.give * (1 - c) + REVIVE.palm;
  if (w <= 0 || flagOff("chest")) { if (!flagOff("keepoff")) keepOff(h, p, 0); return; }
  const A = p.at("neck").sub(p.at("hip")); A.y = 0; A.normalize();
  // (across the chest AWAY from the reviver: fingers pointed back toward his own knees turned both
  // forearms half round)
  const across = unit(V().crossVectors(UP(), A)), awayDir = S.clone().sub(h.at("hip")); awayDir.y = 0;
  if (across.dot(awayDir) < 0) across.negate();
  for (const [side, k] of [["r", 0], ["l", 1]]) {
    // the heel of the right hand on the breastbone, the left on top of it, fingers across the chest
    const at = new THREE.Vector3(S.x, y + k * REVIVE.stack, S.z);
    // (the fingers LIFTED off the chest, the press through the heel of the hand, as CPR is taught —
    // laid flat across a rounded chest their tips went 7 cm in)
    const f = unit(across.clone().addScaledVector(UP(), 0.35)), pa = unit(UP().negate().addScaledVector(across, 0.35));
    // (the elbows aimed BACK toward the body, as for any push straight down: aimed out to the sides
    // they rolled both upper arms past real ones through every compression)
    h.reach(side, at.clone().addScaledVector(f, -0.05), w, h.ahead(h.at("upperarm_" + side), -0.3, -0.2, side === "r" ? 0.08 : -0.08));
    h.orient(side, f, pa, w);
    h.relaxHand(side, 0.05, {}, w);
    // (the fingertips ON the chest, not in it: lifted with the hand until none is under the surface — the heel
    // presses, the fingers ride; on a round or padded chest the tips were 8-15 cm in)
    // (only once the hands are mostly on the chest, and lifted from where the hand IS at full weight: at a partial
    // weight the reach pulled the hand back toward the recording's, which lay in the patient)
    for (let it = 0; it < 6 && w > 0.6 && !flagOff("nochest"); it++) {
      const tips = ["index_03_", "middle_03_", "ring_03_", "pinky_03_", "thumb_03_"].map((n) => { try { return h.at(n + side); } catch { return null; } }).filter(Boolean);
      const d = Math.max(...tips.map((q) => skR(q).d)); if (d <= -0.008) break;
      const hp = h.at("hand_" + side); h.reach(side, hp.addScaledVector(UP(), Math.min(0.05, d + 0.012)), 1, h.ahead(h.at("upperarm_" + side), -0.3, -0.2, side === "r" ? 0.08 : -0.08)); h.orient(side, f, pa, w);
    }
  }
  if (!flagOff("keepoff")) keepOff(h, p, w);
}
// a hand off the partner's head and body wherever the clip takes it (the rescue breaths put the hands
// at the face): pushed out to the head's surface (a ball round it) or the torso's (a capsule, hips to
// neck), never in
const t5 = () => globalThis.__t > 4.95 && globalThis.__t < 5.02;
function keepOff(h, p, onChest = 0) {
  const sk = p.into();   // (her torso as posed this frame)
  // (the law that runs after the recipe swings elbows for this body's own sake: told about her too)
  if (onChest <= 0.5) h.armAvoid = (side) => {
    const a = h.at("upperarm_" + side), b = h.at("lowerarm_" + side), c = h.at("hand_" + side);
    let pen = 0; for (const q of [0.5, 0.75, 1].map((k) => a.clone().lerp(b, k)).concat([0.33, 0.66].map((k) => b.clone().lerp(c, k)))) pen += Math.max(0, sk(q).d + REVIVE.sleeve);
    return pen;
  };
  const head = p.at("head"), hc = head.clone().addScaledVector(unit(head.clone().sub(p.at("neck"))), 0.06), hip = p.at("hip"), neck = p.at("neck");
  for (const side of ["l", "r"]) {
    for (let it = 0; it < 2; it++) {
      const pts = [h.at("hand_" + side), ...["index", "middle", "ring", "pinky"].map((f) => h.at(`${f}_02_${side}`))];
      let push = V(), deep = 0;
      for (const q of pts) {
        const dh = q.distanceTo(hc), inH = REVIVE.head - dh;
        if (inH > deep) { deep = inH; push = unit(q.clone().sub(hc)).multiplyScalar(inH + 0.005); }
        const ab = neck.clone().sub(hip), k = Math.max(0, Math.min(1, q.clone().sub(hip).dot(ab) / ab.lengthSq())), cp = hip.clone().addScaledVector(ab, k), inT = REVIVE.body - q.distanceTo(cp);
        if (inT > deep) { deep = inT; push = unit(q.clone().sub(cp)).multiplyScalar(inT + 0.005); }
      }
      if (deep <= 0) break;
      // (the elbow kept where the clip has it — a pole of its own swung the arm about)
      h.reach(side, h.at("hand_" + side).add(push), 1, h.at("lowerarm_" + side).clone().addScaledVector(unit(h.at("lowerarm_" + side).sub(h.at("upperarm_" + side).lerp(h.at("hand_" + side), 0.5))), 0.3));
    }
    // (and the FINGERTIPS against her skin as posed, not a tube round her spine: the tips slipped past the tube
    // and into her, 8-13 cm, when the reviver's lean was taken back out of her during the breaths)
    for (let it = 0; it < 5; it++) {
      const tips = ["hand_", "index_03_", "middle_03_", "ring_03_", "pinky_03_", "thumb_03_"].map((n) => { try { return h.at(n + side); } catch { return null; } }).filter(Boolean);
      const deep = tips.map((q) => ({ q, r: sk(q) })).reduce((x, y) => (y.r.d > x.r.d ? y : x));
      if (deep.r.d <= -0.008 || !deep.r.from) break;
      const dir = unit(deep.q.clone().sub(deep.r.from));
      h.reach(side, h.at("hand_" + side).addScaledVector(dir, Math.min(0.06, deep.r.d + 0.012)), 1, h.at("lowerarm_" + side).clone().addScaledVector(unit(h.at("lowerarm_" + side).sub(h.at("upperarm_" + side).lerp(h.at("hand_" + side), 0.5))), 0.3));
    }
    // ... and the ARM off them too: an elbow or forearm in the partner swings the elbow out the way it
    // is pushed (the hand stays where it is), up to six tries
    // (her torso as the pair check sees it — her skin, posed — plus a margin for the sleeve; the head a ball.
    // A tube round her spine missed her shoulders and the arm lay 10 cm into her)
    const skin = sk;
    const into = (q) => {
      const s1 = skin(q), t1 = s1.d + REVIVE.sleeve, t2 = REVIVE.head - q.distanceTo(hc);
      return t1 >= t2 ? { d: t1, from: s1.from ?? hc } : { d: t2, from: hc };
    };
    // (not while the hands are meant to be ON the chest: then the forearms are over it by design, and
    // swinging the elbows about twisted both arms through every compression)
    if (onChest > 0.5) continue;
    const hand = h.at("hand_" + side);
    for (let it = 0; it < 6; it++) {
      const a = h.at("upperarm_" + side), b = h.at("lowerarm_" + side);
      const pts = [0.6, 1].map((k) => a.clone().lerp(b, k)).concat([0.33].map((k) => b.clone().lerp(hand, k)));
      let worst = null; for (const q of pts) { const r = into(q); if (r.d > 0.01 && (!worst || r.d > worst.d)) worst = { ...r, q }; }
      if (!worst) break;
      const out = unit(worst.q.clone().sub(worst.from)).addScaledVector(UP(), 0.5);
      h.reach(side, hand, 1, b.clone().addScaledVector(unit(out), 0.3 + 0.1 * it));
    }
  }
}
// THE HUG is fitted to the two bodies hugging, so it is baked once per pair (anim-build.cjs
// --hug): anim-build.html measures both torsos from the skin and stands them `gap` apart, chests
// a finger from touching. "over" puts its arms over the partner's shoulders onto the upper back,
// "under" round the back below the shoulder blades, so the four arms never meet. Each arm goes
// out round the partner's flank first and then behind, so it never cuts through on the way in,
// and after the reach the elbow is pushed outward until the arm is clear of the partner (an arm
// is HUG_ARM thick). Josh flagged the first cut, built to one standard size: "they clip into each
// other". anim-pair.html's r.overlap measures it.
export const HUG_ARM = 0.05;
const HUG_TURN = 7 * Math.PI / 180;   // (radians a frame, at 30 fps: 210 degrees a second)
function hug(h, t, over, o = {}) {
  const P = h.partner; if (!P) throw new Error("the hug is baked for a pair: anim-build.cjs --hug");
  // THE OTHER HALF AS IT REALLY MOVES (Oct 26 2026): each half was fitted to a partner standing still in the
  // idle, but in the hug the partner leans in, sways and wraps its own arms round — two halves each clean against
  // a statue went 6-11 cm into each other together (17 of 21 pairs). Where the partner's half of this hug is
  // already baked (bd-hug-<other role>-<this body>), the arms and face are kept clear of the partner AS POSED in it
  // at this moment; baked in turns (under against over, then over against the new under), the two settle
  // (o.mate: the hug itself only — the kiss borrows these arms, and its partner's hug is not what it's doing)
  const mate = o.mate ? `bd-hug-${over ? "under" : "over"}-${h.self}` : null;
  const posed = mate && P.has?.(mate) ? P.pose(mate, t, { x: 0, z: h.pairGap ?? P.gap, yaw: 180 }).into() : null;
  const into = posed ? (q) => posed(q).d : (q) => into(q);
  const w = h.ease(t, 0.15, 1.1) * (1 - h.ease(t, 3.9, 4.85));
  // A HUG IS NEVER STILL (Josh: "the arms are too stiff"): the two sway together side to side, a
  // breath lifts the chest, there is a SQUEEZE in the middle — the shoulders round in, the arms
  // pull tighter, the fingers close on the clothes — and the hands don't do the same thing: the
  // over hand rubs the back, the under hand pats it twice. Each at its own pace, so nothing reads
  // as a loop.
  const sway = Math.sin(h.loop(t, 5, 1)) * w, breath = Math.sin(h.loop(t, 5, 2) + 0.7) * w;
  const squeeze = h.ease(t, 1.5, 1.9) * (1 - h.ease(t, 2.6, 3.2)) * w;
  h.turn("spine_01", "z", 1.5 * sway); h.turn("spine_02", "z", 2 * sway); h.turn("spine_02", "y", 2 * sway);
  // leaning IN, the way people do: the shoulders come toward the partner so the arms can wrap
  // with the elbows bent (standing upright the arms had to go out straight to reach round)
  h.turn("spine_02", "x", 5 * w); h.turn("spine_03", "x", 4 * w + 1.5 * breath + 3 * squeeze);
  // the collarbones: up and forward round the partner, more in the squeeze
  const round = 5 * w + 6 * squeeze;
  h.turn("shoulder_l", "z", 3 * w + 2 * squeeze); h.turn("shoulder_r", "z", -3 * w - 2 * squeeze);
  h.turn("shoulder_l", "y", -round); h.turn("shoulder_r", "y", round);
  if (!o.noHead) {
    h.turn("head", "y", 32 * w); h.turn("head", "z", (-6 - 3 * sway) * w); h.turn("neck", "x", (3 + 2 * squeeze) * w);
    // THE FACE OFF THE PARTNER'S CHEST: a shorter body's face went into a taller one's chest, 18 cm (Sophia
    // and Eric) — the cheek is turned further onto it and the head tipped back until the face rests on it
    const face = () => { const hd = h.at("head"), F3 = h.frame(); return [hd.clone().addScaledVector(F3.fwd, 0.1), hd.clone().addScaledVector(F3.fwd, 0.08).addScaledVector(UP(), -0.06), hd.clone().addScaledVector(F3.fwd, 0.06).addScaledVector(UP(), 0.06)]; };
    // (judged on the HEAD'S OWN SKIN — face, eyes, nose — not three points by the head bone: those read clear while
    // a shorter partner's eyes were 9 cm into a taller one's chest in the squeeze; and the upper back gives a
    // little too, the lean and the squeeze are what carry the head in)
    const headIdx = h.skin().filter((x) => /(head|eye|jaw|brow|lid|nose|teeth|tongue)/i.test(x.bone ?? "")).map((x) => x.i);
    const faceIn = () => Math.max(...face().map((q) => into(q)), ...h.skin(headIdx).map((x) => into(x.p) - 0.005));
    for (let k = 0; k < 16 && faceIn() > -0.015; k++) { h.turn("head", "y", 3 * w); h.turn("neck", "x", -2 * w); h.turn("head", "x", -1.5 * w); if (k >= 6) h.turn("spine_03", "x", -1.5 * w); }
  }
  const F = h.frame();
  // the hands' own moves once they have arrived: up-and-down rubs (over) or two pats (under)
  const settled = h.ease(t, 1.1, 1.4) * (1 - h.ease(t, 3.5, 3.9));
  // (o.calm, the kiss: the hands rest on the back, no rub, no pats)
  const rub = o.calm ? 0 : 0.035 * Math.sin(h.loop(t, 5, 2.5) + 0.4) * settled;
  const pat = o.calm ? 0 : (pulse(t, 2.15, 0.12, 0.08) + pulse(t, 2.65, 0.12, 0.08)) * settled;
  // over: the upper back, a hand below the partner's shoulders; under: the middle of the back
  const y = over ? P.shoulderY - 0.09 : P.backY - 0.02;
  for (const [side, s] of [["l", -1], ["r", 1]]) {
    // one hand rubs (the right when over, the left when under), the other pats; both press in
    // a centimetre in the squeeze
    const rubs = (s > 0) === over;
    let yy = y - (s > 0 ? 0.025 : 0) + (rubs ? rub : 0);
    const off = (rubs ? 0 : 0.035 * pat) - 0.01 * squeeze;
    // the hand's way round: out at the partner's flank, then swept round its side to the back,
    // following its surface (a straight line from the flank to the back cut the corner through it)
    const reachW = Math.min(1, w / 0.55), k = h.ease(w, 0.55, 1);
    // where on the back the hand lands: as far round as the arm reaches WITH THE ELBOW BENT (the
    // shoulder to the wrist no more than 85% of the arm). Aimed at a fixed spot, the arm reached
    // for a back 64 cm away with a 56 cm arm and went out dead straight, a mannequin's hug.
    // Eased from the last frame's, so a sway doesn't jog it.
    const S0 = h.at("upperarm_" + side), armLen = S0.distanceTo(h.at("lowerarm_" + side)) + h.at("lowerarm_" + side).distanceTo(h.at("hand_" + side));
    // (short arms round a big back wrap higher and further round the side, as they do: the hand
    // may go up to 9 cm higher before the arm is let go straighter)
    let far = 1.3, up = 0.09, best = Infinity;
    for (let dy = 0; dy <= 0.09; dy += 0.03) for (let a = 0.35; a <= 1.3; a += 0.05)
      if (P.surface(yy + dy, s * Math.sin(a), Math.cos(a), 0.03).distanceTo(S0) <= 0.85 * armLen && a + 6 * dy < best) { best = a + 6 * dy; far = a; up = dy; }
    if (best === Infinity) { far = 1.3; up = 0.09; }
    h.hugAng ??= {}; h.hugUp ??= {};
    const ez = (was, to, r) => h.free || was == null ? to : was + Math.max(-r, Math.min(r, to - was));
    const angT = ez(h.hugAng[side], far, 0.02), upT = ez(h.hugUp[side], up, 0.004);
    h.hugAng[side] = angT; h.hugUp[side] = upT;
    yy += upT * k;
    const ang = (1 - k) * 1.42 + k * angT;            // from straight out at the side to round the back
    const target = P.surface(yy, s * Math.sin(ang), Math.cos(ang), 0.13 * (1 - k) + (0.03 + off + (o.out ?? 0)) * k);
    // the hand flat on the partner: palm in toward its middle, fingers on round its back
    const ahead = P.surface(yy, s * Math.sin(ang - 0.25), Math.cos(ang - 0.25), 0.13 * (1 - k) + (0.03 + off + (o.out ?? 0)) * k);
    // (the spots read off the partner standing still, then put back on its surface as it really is this moment:
    // leaning in, the posed partner's back was where the hand was sent)
    if (posed) for (const q of [target, ahead]) {
      const want = 0.13 * (1 - k) + (0.03 + off + (o.out ?? 0)) * k;
      for (let n = 0; n < 20; n++) { const r = posed(q); if (r.d <= -want || !r.from) break; q.addScaledVector(unit(q.clone().sub(r.from)), Math.min(0.02, r.d + want + 0.002)); }
    }
    // the fingers carry on from the forearm across the back (a straight wrist), leaning a little
    // round it — pointing them round the back regardless bent the wrist 110° sideways
    const lay = () => {
      const fore = unit(h.at("hand_" + side).sub(h.at("lowerarm_" + side)));
      // the palm toward the partner, but not pressed dead flat: it gives a little toward the way the
      // forearm points (flat bent the wrist back 60 degrees)
      const n0 = unit(P.centre(yy).sub(target)), n = unit(n0.clone().addScaledVector(fore, -0.5 * fore.dot(n0)));
      // the fingers follow the back's curve round: half the forearm's way, half round the back
      // (three-quarters along the forearm left the hand sticking out past the curve, in the air)
      const round = unit(ahead.clone().sub(target)), f = fore.clone().multiplyScalar(0.45).addScaledVector(round, 0.55);
      f.addScaledVector(n, -f.dot(n));
      h.orient(side, f.lengthSq() > 1e-6 ? unit(f) : round, n, reachW * h.ease(w, 0.3, 0.8));
    };
    const pts = () => {
      const a = h.at("upperarm_" + side), b = h.at("lowerarm_" + side), c = h.at("hand_" + side);
      return [0.35, 0.7, 1].map((q) => a.clone().lerp(b, q)).concat([0.25, 0.5, 0.75].map((q) => b.clone().lerp(c, q)));
    };
    // the fingertips (the last joint carried on 2 cm: the skin runs past the bone's start)
    const tips = () => [h.at("hand_" + side), ...["index", "middle", "pinky", "thumb"].map((f) => { const a = h.at(`${f}_03_${side}`); return a.clone().addScaledVector(unit(a.clone().sub(h.at(`${f}_02_${side}`))), 0.02); })];
    // how far out the hand must sit to clear the partner is found by stepping out a centimetre at
    // a time, then EASED toward from the last frame (a jump of several centimetres from one frame
    // to the next read as a twitch)
    // the fingers relaxed open, closing on the clothes in the squeeze (the idle's half-fist on
    // someone's back read as knuckles knocking on it); set BEFORE the clearance, so it judges the
    // hand as it will be
    h.relaxHand(side, 0.12 + 0.25 * squeeze, {}, reachW * h.ease(w, 0.3, 0.8));
    const restoreArm = h.save(side), start = target.clone();
    let i = 0;
    for (; i < 24; i++) {
      h.reach(side, target, reachW, h.ahead(h.at("upperarm_" + side), 0.05, over ? -0.15 + 0.02 * i : -0.35, s * (0.5 + 0.25 * i)));
      lay();
      // the arm (upper arm and forearm) clear of the partner by its own thickness; the hand may
      // rest on the back, pressing a centimetre into the clothes and no more
      if (pts().every((p) => into(p) < -HUG_ARM) && tips().every((p) => into(p) < 0.01)) break;
      // the ELBOW swings out first (the pole, above); the hand leaves its spot on the back only
      // once that hasn't cleared it (moving the hand first slid it 20 cm off the back into the air)
      if (i >= 10) target.addScaledVector(F.right, s * 0.01);
    }
    if (i === 24) h.stuck = (h.stuck ?? 0) + 1;
    h.hugStep ??= {};
    const was = h.hugStep[side] ?? i, step = h.free ? i : was + Math.max(-0.6, Math.min(2.5, i - was));   // out fast (a hand in someone's back can't wait), back in slowly
    h.hugStep[side] = step;
    if (Math.abs(step - i) > 1e-6) {
      restoreArm();
      const tgt = start.clone().addScaledVector(F.right, s * 0.01 * Math.max(0, step - 10));
      h.reach(side, tgt, reachW, h.ahead(h.at("upperarm_" + side), 0.05, over ? -0.15 + 0.02 * step : -0.35, s * (0.5 + 0.25 * step)));
      lay();
    }
    // NO SNAPS: a hug's arms move slowly, so each arm bone turns at most HUG_TURN degrees a frame
    // from where it was. Reaching over a taller partner's shoulder the arm is nearly straight and
    // the elbow has no clear way to bend: the solve flipped between two, the upper arm 40-58
    // degrees in a frame and the hand 72 (Sophia over Manuel)
    if (!h.free && h.__bone) {
      h.hugQ ??= {}; const was = h.hugQ[side];
      const qs = ["upperarm_", "lowerarm_", "hand_"].map((n) => h.__bone(n + side).quaternion);
      if (was) qs.forEach((q, k) => { if (q.angleTo(was[k]) > HUG_TURN) q.copy(was[k].clone().rotateTowards(q, HUG_TURN)); });
      h.hugQ[side] = qs.map((q) => q.clone());
    }
    (h.hugDebug ??= {})[side] = { want: start.toArray(), at: h.at("hand_" + side).toArray(), step: i, reach: h.at("upperarm_" + side).distanceTo(start), arm: h.at("upperarm_" + side).distanceTo(h.at("lowerarm_" + side)) + h.at("lowerarm_" + side).distanceTo(h.at("hand_" + side)), into: Math.max(...pts().map((p) => into(p))) };

  }
}
// ------------------------------------------------------------------------------------------
// THE TOOLS ROUND (Oct 21 2026): the moves ASSETS.md always meant to build in code. Each one's
// prop is measured here once, so the bake closes the hand round it and the review (PROPS, at
// the foot of this file) draws it there. Places off the body are home(fwd, up, right): metres
// off the hips at the clip's first frame, so a wall or a door stays put while the body sways.
const D = Math.PI / 180;
const ease = (t, a, b) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
const pulse = (t, at, rise, fall) => t < at ? Math.max(0, 1 - (at - t) / rise) ** 2 : Math.exp(-(t - at) / fall) * (t - at < fall * 4 ? 1 : 0);
// the syringe held like a dart, its barrel along the fingers in the grip channel: from the hold
// point, the plunger back, the barrel forward, the needle's point at tip
export const SYRINGE = { tip: 0.10, r: 0.008, back: 0.04, barrel: 0.06 };
export const CAN = { at: [0.06, 0.045, 0], h: 0.115, r: 0.033 };          // its middle in the left hand (f, p, u)
export const KEYPAD = { at: [0.56, 0.36, 0.10], pitch: 0.026, code: [[0, 0], [2, 1], [0, 2], [1, 1], [3, 2]] };
export const READER = { at: [0.56, 0.24, 0.22] };                        // the slot's middle
export const CARD = { len: 0.086, wid: 0.054, at: [0.105, 0, 0.012] };    // its middle at the fingertips (f, p, u)
export const DOOR = { at: 0.50, thick: 0.045, width: 0.9, height: 2.05 };
export const CROWBAR = { tip: [0.58, 0.14, -0.46], left: 0.36, right: 0.6, swing: 22, r: 0.011 };
export const DRAG = { reach: 0.46, height: -0.15 };
export const MOLOTOV = { rag: 0.07, lighterOn: [0.97, 1.72], ragOn: 1.38, neck: 0.014, body: 0.036, lighterSide: 0.045 };
// the bottle as the review draws it in the hand: its neck through the fist along the thumb side, its body below
const bottleIn = (H, R) => { const b = (k) => H.clone().addScaledVector(R.u, k); return union(capsule(b(-0.02), b(0.04), MOLOTOV.neck), capsule(b(-0.05), b(-0.24), MOLOTOV.body)); };
// the gun lies along the right fist: 35 degrees above where its fingers point, on the thumb side
export const SHOTGUN = { grip: [0.18, -0.28, 0.14], tilt: 35, pump: 0.40, stroke: 0.10, port: 0.10,
  shells: [0, 1, 2].map((k) => [0.35 + k * 1.25 + 0.42, 0.35 + k * 1.25 + 1.08]) };
export const gunAxis = (R) => unit(R.f.clone().multiplyScalar(Math.cos(SHOTGUN.tilt * D)).addScaledVector(R.u, Math.sin(SHOTGUN.tilt * D)));
export const doorBang = (t) => pulse(t, 0.5, 0.05, 0.28) + 0.8 * pulse(t, 1.9, 0.05, 0.28);
const keyPos = (h, [r, c]) => h.home(KEYPAD.at[0], KEYPAD.at[1] - (r - 1.5) * KEYPAD.pitch, KEYPAD.at[2] + (c - 1) * KEYPAD.pitch);
const readerSlot = (h) => h.home(...READER.at);
const crowbarTip = (h) => h.home(...CROWBAR.tip);
// the bar from its hooked tip back toward the body, swung round the tip by the heave
function crowbarDir(h, heave) {
  const F = h.homeFrame();
  return dirOf([F.right, 1], [F.fwd, -0.42], [UP(), -0.04]).applyAxisAngle(UP(), CROWBAR.swing * D * heave);
}
// a heave of the crowbar, three a loop: a slow lean into it, a quicker let-off
export const crowbarHeave = (t, dur) => { const p = (t / dur * 3) % 1; return p < 0.65 ? ease(p, 0, 0.65) : 1 - ease(p, 0.65, 1); };
function flashlight(h, t, dur, out) {
  const F = h.frame();
  const sway = 0.025 * Math.sin(h.loop(t, dur, 1));
  // overhand: palm down, fingers across to the left, so the barrel runs front to back through
  // the fist and the beam comes out past the little finger
  const at = h.ahead(h.at("spine_03"), out, -0.12, 0.06 + sway), f = dirOf([F.left, 1], [F.fwd, -0.2]), p = UP().negate();
  const u = unit(V().crossVectors(f, p.clone().addScaledVector(f, -p.dot(f)))), a = (k) => at.clone().addScaledVector(u, -k);   // (as the review draws it: forward = against the thumb side)
  grip(h, "r", at, f, p, 1, 1, {}, h.ahead(h.at("upperarm_r"), -0.15, -0.35, 0.35),
    { r: TORCH.r, shape: (H, R) => { const b = (k) => H.clone().addScaledVector(R.u, -k); return union(capsule(b(-0.07), b(0.10), TORCH.r), capsule(b(0.10), b(0.145), TORCH.head)); } });
}
export const TORCH = { r: 0.017, head: 0.024 };
function lookBack(h, t, s) {
  const w = h.ease(t, 0.3, 0.8) * (1 - h.ease(t, 1.5, 2.05));
  // the turn shared down the body the way a look over the shoulder is: the spine takes half of
  // it, the neck and head the rest (the head alone past 80° against the chest reads as an owl's)
  // (turning each joint about its own length was tried: on a sprint's leaning spine it pitched
  // the neck and chest further past real ones than this does; the chest's share is kept modest —
  // on the sprint's forward lean a 16 degree twist of the chest pitched it 9 past real chests)
  h.turn("spine_01", "y", 16 * s * w); h.turn("spine_02", "y", 16 * s * w); h.turn("spine_03", "y", 10 * s * w);
  h.turn("neck", "y", 24 * s * w); h.turn("head", "y", 34 * s * w); h.turn("head", "x", -8 * w);
  h.turn("spine_02", "z", 4 * s * w);
  h.turn("spine_03", "x", 4 * w);   // (and the chest comes up out of the sprint's lean a little, as a look back does)
}
// how far the pump is racked (0..1) at time t in each of the shotgun's own clips
export const pumpStroke = (t, clip) => clip === "pump" ? ease(t, 0.15, 0.32) * (1 - ease(t, 0.45, 0.62)) : ease(t, 4.35, 4.5) * (1 - ease(t, 4.58, 4.75));
export const SHELL_TIMES = [0, 1, 2].map((k) => [0.35 + k * 1.25 + 0.42, 0.35 + k * 1.25 + 1.08]);
function shotgunMove(h, t, pump, loadT) {
  clearGun(h, GUN_HOLDS.shotgun);
  const hold = GUN_HOLDS.shotgun, G = gunPose(h.handRigid("r"), hold, h.gunCal), F = h.frame();
  const onPump = { at: supportAt(G, hold, hold.stroke * pump), fingers: G.X.clone().negate(), palm: G.Y, close: 0.75 };
  const pole = h.ahead(h.at("upperarm_l"), 0.05, -0.5, -0.25);
  // (the hands close on the gun's own shape, as gunFit's do: the pump's middle in the left hand)
  const gunSdf = h.gunSdf?.("shotgun", G);
  shootingHand(h, gunSdf);
  if (loadT === null) {
    if (gunSdf && h.wrap) { const S = G.at([hold.support[0], hold.support[1], hold.support[2] - hold.stroke * pump]); return grip(h, "l", S, onPump.fingers, onPump.palm, 1, onPump.close, { thumb: 0.5 }, pole, { r: depthAlong(gunSdf, S, onPump.palm), sdf: gunSdf, wrap: { thumb: 1.2, contact: aroundSupport(gunSdf, G, S) } }); }
    return grip(h, "l", onPump.at, onPump.fingers, onPump.palm, 1, onPump.close, { thumb: 0.5 }, pole);
  }
  // the loading port: under the receiver, just ahead of the trigger guard
  const port = G.at([0, -0.035, 0.12]);
  // (how far out to the left the palm turns is the body's CHOICE, h.choice.out: a fixed 0.7 sat
  // Eric's wrist 22 degrees past where real wrists go for the whole time at the port)
  const portPalm = unit(G.Y.clone().addScaledVector(G.X, h.choice?.out ?? 0.7));
  const pouch = { at: h.ahead(h.at("hip"), 0.06, 0.02, -0.17), fingers: UP().negate(), palm: F.fwd.clone().negate() };
  const keys = [[0, onPump]];
  // on the way down to the pouch the hand turns palm-in to the body, as a hand travelling down the
  // front of the body does (straight from palm-up to the pouch bent the wrist back 111°)
  const along = { palm: unit(F.right.clone().multiplyScalar(0.55).addScaledVector(F.fwd, -0.8)), fingers: UP().negate(), close: 0.4 };
  for (let k = 0; k < 3; k++) {
    const b = 0.35 + k * 1.25, from = k === 0 ? onPump.at : port;
    keys.push([b + 0.12, { ...along, at: from.clone().lerp(pouch.at, 0.45) }], [b + 0.35, { ...pouch, close: 0.5 }], [b + 0.45, { ...pouch, close: 0.9 }],
      // at the port the palm faces up and a little out to the left (thumbing a shell up into a
      // port from below; fully palm-up asks the left forearm to roll further than it does)
      [b + 0.85, { at: port.clone().addScaledVector(G.Z, -0.07), fingers: G.Z, palm: portPalm, close: 0.85 }],
      [b + 1.05, { at: port.clone().addScaledVector(G.Z, 0.03), fingers: G.Z, palm: portPalm, close: 0.85 }],
      [b + 1.15, { at: port.clone(), fingers: G.Z, palm: portPalm, close: 0.5 }]);
  }
  keys.push([4.25, onPump], [9, onPump]);
  let i = 0; while (i < keys.length - 2 && keys[i + 1][0] <= loadT) i++;
  const [ta, a] = keys[i], [tb, b] = keys[i + 1], e = ease(loadT, ta, tb);
  // POSE TO POSE: each key is solved on its own (the pump in its grip, the belt and the port with
  // the palm as the key says and the fingers carrying on from the forearm), and the arm's JOINTS
  // are blended between them — a hand steered through the world between two keys passed through
  // turns no wrist makes (bent back 111 degrees on the way down)
  const restore = h.save("l");
  const solve = (k) => { restore(); k === onPump ? grip(h, "l", k.at, k.fingers, k.palm, 1, 1, {}, pole) : layHand(h, "l", k.at, k.palm, k.fingers, 1, 1, {}, pole); return h.armLocals("l"); };
  const qa = solve(a), qb = e > 0 ? solve(b) : qa;
  restore();
  h.setArmLocals("l", qa.map((q, j) => q.clone().slerp(qb[j], e)));
  h.fist("l", a.close + (b.close - a.close) * e, { thumb: 0.5 });
}
// a hand laid by its PALM: the palm faces `palm`, the fingers carry on from the forearm, leaning a
// little toward `lean` — the wrist stays as straight as the palm allows
function layHand(h, side, at, palm, lean, w = 1, close = 1, per = {}, pole) {
  if (w <= 0) return;
  const n = unit(palm);
  for (let k = 0; k < 3; k++) {
    const fore = unit(h.at("hand_" + side).sub(h.at("lowerarm_" + side)));
    const f = fore.clone().multiplyScalar(0.7).addScaledVector(unit(lean), 0.3); f.addScaledVector(n, -f.dot(n));
    const fingers = f.lengthSq() > 1e-6 ? unit(f) : unit(lean);
    h.reach(side, at.clone().addScaledVector(fingers, -0.07), w, pole ?? poleOf(h, side));
    h.orient(side, fingers, n, w);
  }
  h.fist(side, close * w, scaled(per, w));
}
function shotgun(h, t, pump, loadT) {
  const F = h.frame();
  // the low ready: bladed a little to the right so the left shoulder comes forward to the pump,
  // the muzzle down and across, the stock up beside the ribs (not through the hip)
  h.turn("spine_02", "y", -12); h.turn("spine_03", "y", -6);
  const A = dirOf([F.fwd, 1], [UP(), -0.45], [F.left, 0.18]);
  const G = h.ahead(h.at("spine_03"), ...SHOTGUN.grip);
  const upA = unit(UP().addScaledVector(A, -A.y));
  const fr = unit(A.clone().multiplyScalar(Math.cos(SHOTGUN.tilt * D)).addScaledVector(upA, -Math.sin(SHOTGUN.tilt * D)));
  grip(h, "r", G, fr, F.left, 1, 1, {}, h.ahead(h.at("upperarm_r"), -0.2, -0.45, 0.35));
  // the gun where the props draw it: along the right fist
  const R = h.hand("r"), axis = gunAxis(R), side = unit(V().crossVectors(axis, UP())), gunUp = V().crossVectors(side, axis);
  const pumpAt = (q) => R.fist.clone().addScaledVector(axis, SHOTGUN.pump - SHOTGUN.stroke * q).addScaledVector(gunUp, -0.035);
  const onPump = { at: pumpAt(pump), fingers: side, palm: gunUp, close: 0.75 };
  if (loadT === null) return grip(h, "l", onPump.at, onPump.fingers, onPump.palm, 1, onPump.close, {}, h.ahead(h.at("upperarm_l"), 0.0, -0.45, -0.3));
  // loading: keyframes for the left fist
  const pouch = { at: h.ahead(h.at("hip"), 0.06, 0.02, -0.17), fingers: UP().negate(), palm: F.fwd.clone().negate() };
  const port = R.fist.clone().addScaledVector(axis, SHOTGUN.port).addScaledVector(gunUp, -0.06);
  const keys = [[0, { ...onPump, at: pumpAt(0) }]];
  for (let k = 0; k < 3; k++) {
    const b = 0.35 + k * 1.25;
    keys.push([b + 0.35, { ...pouch, close: 0.5 }], [b + 0.45, { ...pouch, close: 0.9 }],
      [b + 0.85, { at: port.clone().addScaledVector(axis, -0.07), fingers: axis, palm: gunUp, close: 0.85 }],
      [b + 1.05, { at: port.clone().addScaledVector(axis, 0.03), fingers: axis, palm: gunUp, close: 0.85 }],
      [b + 1.15, { at: port.clone().addScaledVector(axis, 0.0), fingers: axis, palm: gunUp, close: 0.5 }]);
  }
  keys.push([4.25, { ...onPump, at: pumpAt(0) }], [9, { ...onPump, at: pumpAt(pump) }]);
  let i = 0; while (i < keys.length - 2 && keys[i + 1][0] <= loadT) i++;
  const [ta, a] = keys[i], [tb, b] = keys[i + 1], e = ease(loadT, ta, tb);
  const at = i === keys.length - 2 ? pumpAt(pump) : a.at.clone().lerp(b.at, e);
  grip(h, "l", at, a.fingers.clone().lerp(b.fingers, e), a.palm.clone().lerp(b.palm, e), 1, a.close + (b.close - a.close) * e, {}, h.ahead(h.at("upperarm_l"), 0.0, -0.45, -0.3));
}
// ------------------------------------------------------------------------------------------
// THE GUNS (Josh, Oct 21 2026: "model only the guns from the pack i bought and also make sure
// they fit well [in] each model's hands, their hands are in the correct positions"). The models
// are made game-ready by scripts/survivorz/guns.mjs, which writes where a hand holds each one
// (guns.json): origin in the shooting fist, +Z out of the muzzle, +Y up, the support point, the
// butt, the grip's lean. A gun RIDES the right hand: its grip runs up through the fist along the
// thumb side, leaning back by gripLean. The left hand is then pinned to the support point (the
// handguard, the pump): palm up under it, fingers wrapped round to the gun's right — and lets go
// on its own wherever the clip takes that hand away (a reload, a door), by how far it would have
// to travel.
export const GUN_HOLDS = await fetch("/assets/downloads/survivorz/props/guns/guns.json").then((r) => r.json()).catch(() => ({}));
// HOW A GUN SITS IN THE FIST is measured, not guessed, once per body (anim-build.cjs <body>
// --gun-cal -> props/guns/cal.json): in the rifle pack's aiming clip, Mixamo's left hand is on ITS
// rifle's handguard, so the line from the right fist to that hand is the barrel and level is up.
// Each is kept in the right hand's own frame (f, p, u) so the gun turns with the hand.
export const GUN_CAL = await fetch("/assets/downloads/survivorz/props/guns/cal.json").then((r) => r.json()).catch(() => ({}));
const inHand = (R, [f, p, u]) => unit(R.f.clone().multiplyScalar(f).addScaledVector(R.p, p).addScaledVector(R.u, u));
export const GUN_GRIP_R = 0.015;   // a pistol grip's half-thickness, near enough for all three
export function gunPose(R, hold, cal, { noLean = false } = {}) {
  let Y, Z;
  if (cal) {
    Z = inHand(R, cal.z); Y = inHand(R, cal.y); Y.addScaledVector(Z, -Y.dot(Z)).normalize();
  } else {
    const a = hold.gripLean * D;
    Y = unit(R.u.clone().multiplyScalar(Math.cos(a)).addScaledVector(R.f, -Math.sin(a)));
    Z = unit(R.f.clone().multiplyScalar(Math.cos(a)).addScaledVector(R.u, Math.sin(a)));
  }
  // A GUN WHOSE GRIP LEANS DIFFERENTLY from the one the calibration was measured on (the carbine's,
  // 18 degrees) is turned in the hand by the difference, about its own left: the shotgun's stock
  // wrist leans 38, and held at the carbine's angle its fingers closed on nothing
  if (cal && !noLean && !hold.supportGrip && hold.gripLean != null) {
    // (a grip's top stands FORWARD of its bottom, so the gun is turned back by the difference to
    // bring the shotgun's grip onto the carbine's line. The lean also used to go in twice — at the
    // clip's aim and again in the hand — and is counted once now (handAxesFor), so the barrel is the
    // clip's aim whichever way it turns)
    const d = (hold.gripLean - (GUN_HOLDS.hk416?.gripLean ?? hold.gripLean)) * D * -1;
    if (d) { const X0 = V().crossVectors(Y, Z).normalize(); Z = Z.applyAxisAngle(X0, d); Y = Y.applyAxisAngle(X0, d); }
  }
  const X = V().crossVectors(Y, Z);              // the gun's LEFT (Y up, Z forward)
  // the grip in the hand's GRIP CHANNEL, in front of the palm (Oct 22 2026): seated on the fist's
  // middle — in the knuckles — it ran through the inside of the hand, and the shooting fingers could
  // only lie in it or open off it (the hand checks). Each gun's seat is measured (anim-hands.js gunSeat)
  const seat = R.cal?.seats?.[hold.name];
  const o = seat ? R.fist.clone().addScaledVector(R.f, seat[0]).addScaledVector(R.p, seat[1]).addScaledVector(R.u, seat[2]) : R.fist.clone();
  return { o, X, Y, Z, at: ([x, y, z]) => o.clone().addScaledVector(X, x).addScaledVector(Y, y).addScaledVector(Z, z) };
}
// the support fist's place on a gun: under the support point, a hand's depth below its middle
export const supportAt = (G, hold, slide = 0) => G.at([hold.support[0], hold.support[1] - 0.035, hold.support[2] - slide]);
// a gun clip: the base clip's right hand holds the gun; the left hand goes to the support point
// unless the clip took it somewhere else
// turn the right hand so that the body's ONE standard seat (h.gunCal — what the game parents the
// gun with) gives the gun pose this clip's own seat (h.clipCal) gives: the hand's (f, p) read back
// out of the gun's axes through the standard seat
// the hand's (f, p) in the world for a gun pose, through the body's standard seat
// (the gun's axes in the hand's own (f, p, u) as gunPose turns them — the grip's lean INCLUDED: read
// off the bare seat, the shotgun's lean went in once at the aim and again when the gun was placed,
// and its barrel pitched twice the lean off the clip's aim)
function handAxesFor(h, want, hold) {
  const R0 = { f: V(1, 0, 0), p: V(0, 1, 0), u: V(0, 0, 1), fist: V(), cal: null };
  const G0 = gunPose(R0, hold ?? {}, h.gunCal), x = G0.X, y = G0.Y, z = G0.Z;
  const toWorld = (k) => want.X.clone().multiplyScalar(x.getComponent(k)).addScaledVector(want.Y, y.getComponent(k)).addScaledVector(want.Z, z.getComponent(k));
  return [toWorld(0), toWorld(1)];
}
// a gun ANCHORED to the chest (a sprint, a turn: the clip's right hand swings, and a gun fixed to
// it swung from level to upright twice a second — a runner keeps the rifle steady across the
// chest), at the clip's average carry, its angle held against the hips and its place riding the
// chest: anim-build.html measures it (h.gunAnchor)
export const PORT_ROLL = [0.7, -0.7];
export const PORT_CHOICES = [0.45, 0.72, 1.0].flatMap((up) => [-90, -60, -30, 0, 30, 60, 90].map((roll) => ({ up, roll })));   // flat on the chest vs the magazine turned out to the front
export function anchoredGun(h) {
  const A = h.gunAnchor;
  if (A.port) {
    // PORT ARMS, the way a soldier sprints with a long gun: across the chest, the grip by the right
    // hip, the muzzle up to the left, its sights facing out, so the support hand sits in front of
    // the left chest with the elbow down; it rides the chest (bobs and twists with the stride)
    const F = h.frame(), o = h.ahead(h.at("spine_03"), 0.38, -0.3, 0.16);
    // the muzzle's way and the gun's roll about it are the body's CHOICE (h.choice, tried per clip
    // by the bake: PORT_CHOICES): whichever lets both wrists sit most naturally
    const c = h.choice ?? { up: 0.72, roll: 0 };
    const Z = dirOf([F.left, 0.55], [UP(), c.up], [F.fwd, 0.42]);
    const flat = V().crossVectors(F.fwd, Z).normalize();   // the gun lying flat on the chest, top up-right
    const Y = flat.multiplyScalar(PORT_ROLL[0]).addScaledVector(F.fwd, PORT_ROLL[1]); Y.addScaledVector(Z, -Y.dot(Z)).normalize();
    Y.applyAxisAngle(Z, c.roll * D);
    const X = V().crossVectors(Y, Z);
    return { o, X, Y, Z, at: ([x, y, z]) => o.clone().addScaledVector(X, x).addScaledVector(Y, y).addScaledVector(Z, z) };
  }
  // (the hips as the arms' own clip had them: a chest taken from another clip is turned by
  // h.yawFix to face where that clip's did, and its gun with it)
  const q = h.yawFix ? h.quat("hip").premultiply(h.yawFix) : h.quat("hip"), o = h.at("spine_03").add(V(...A.o).applyQuaternion(q));
  const Z = V(...A.z).applyQuaternion(q).normalize(), Y = V(...A.y).applyQuaternion(q); Y.addScaledVector(Z, -Y.dot(Z)).normalize();
  const X = V().crossVectors(Y, Z);
  return { o, X, Y, Z, at: ([x, y, z]) => o.clone().addScaledVector(X, x).addScaledVector(Y, y).addScaledVector(Z, z) };
}
function seatGun(h, hold) {
  if (!h.gunCal) return;
  // at port arms the chest stops pumping the arms: the shoulders and the spine's twist calm down
  if (h.gunAnchor?.port) h.calm(["spine_01", "spine_02", "spine_03", "shoulder_l", "shoulder_r"], 0.6);
  if (h.gunAnchor) {
    // the hand goes to the gun: the fist on the grip, the wrist turned by the standard seat
    const want = anchoredGun(h), [f, p] = handAxesFor(h, want, hold);
    h.reach("r", want.o.clone().addScaledVector(f, -0.07), 1, h.ahead(h.at("upperarm_r"), -0.1, -0.5, 0.3));
    h.orient("r", f, p, 1, true);
    return;
  }
  if (!h.clipCal || h.clipCal === h.gunCal) return;
  // (the clip's AIM, as measured — no lean: the lean is how the gun sits in the hand, not where it points)
  const [f, p] = handAxesFor(h, gunPose(h.handRigid("r"), hold, h.clipCal, { noLean: true }), hold);
  h.orient("r", f, p, 1, true);
}
// THE GUN STAYS OUT OF THE BODY: a gun carried close presses into a fuller chest (Carla's ran 12 cm
// in). Down the gun's length, a gun-width either side of its centre line, nothing may sink past a
// centimetre; if it does, the gun turns away from the body round the grip — about the line from the
// grip to the deepest point crossed with the way out — by the least that clears it, and the right
// hand turns with it through the standard seat
const GUN_HALF = 0.03;
function clearGun(h, hold) {
  if (!h.gunCal || !h.torso) return;
  const surf = h.torso();
  // the wrist turns the gun clear by at most TURN_CAP in all; past that the HAND moves out from
  // the body instead — a rifle held low across the belly is carried off it by the arm, not by
  // corkscrewing the wrist (six 20-degree turns spun Claudia's arm up over her shoulder)
  const TURN_CAP = 35 * D;
  let turned = 0;
  for (let k = 0; k < 8; k++) {
    const G = gunPose(h.handRigid("r"), hold, h.gunCal);
    let deep = null;
    for (let i = 0; i <= 14; i++) {
      const z = hold.butt[2] + (hold.muzzle[2] - hold.butt[2]) * i / 14, y = (hold.butt[1] + hold.muzzle[1]) / 2;
      for (const [dx, dy] of [[0, 0], [GUN_HALF, 0], [-GUN_HALF, 0], [0, GUN_HALF], [0, -GUN_HALF]]) {
        const p = G.at([dx, y + dy, z]), d = surf.inside(p);
        if (d > 0.01 && (!deep || d > deep.d)) deep = { d, p };
      }
    }
    if (!deep) return;
    const lever = deep.p.clone().sub(G.o), probe = surf.probe(deep.p, "arm_r");
    const out = probe.out ?? unit(deep.p.clone().sub(h.at("spine_02")).setY(0));
    const ax = V().crossVectors(lever, out); if (ax.lengthSq() < 1e-10) return;
    const ang = Math.min(20 * D, deep.d / lever.length() * 1.3 + 1 * D, TURN_CAP - turned);
    if (ang > 0.5 * D) {
      turned += ang;
      const q = new THREE.Quaternion().setFromAxisAngle(ax.normalize(), ang);
      const want = { ...G, X: G.X.clone().applyQuaternion(q), Y: G.Y.clone().applyQuaternion(q), Z: G.Z.clone().applyQuaternion(q) };
      const [f, p] = handAxesFor(h, want, hold);
      h.orient("r", f, p, 1, true);
    } else {
      // the hand out, keeping its turn, by what is still in (sideways and forward, not up)
      const R = h.handRigid("r"), f0 = R.f.clone(), p0 = R.p.clone(), o = out.clone(); o.y *= 0.3; o.normalize();
      h.reach("r", h.at("hand_r").addScaledVector(o, deep.d + 0.01), 1, h.ahead(h.at("upperarm_r"), -0.1, -0.5, 0.3));
      h.orient("r", f0, p0, 1, true);
    }
  }
}
// THE BUTT IN THE SHOULDER (Josh, Oct 22 2026: "the buttstock of the gun should be pressed against
// the shoulder"): the gun keeps the way the clip aims it and slides along so its butt plate sits in
// the shoulder pocket (h.pocket, off the skin), and the shooting hand follows it to the grip.
// Not while reloading — the stock comes out of the shoulder to swap a magazine.
function shoulderGun(h, hold, w = 1) {
  if (w <= 0) return false;
  const P = h.pocket("r"); if (!P) return false;
  const G = gunPose(h.handRigid("r"), hold, h.gunCal), B = G.at(hold.butt);
  // a shouldered long gun runs from the pocket to the SUPPORT hand: the clip's own left fist says
  // where it aims (the clip's rifle never had its butt anywhere near the shoulder — 20 cm out on
  // the aiming idle — so its angle alone can't be kept). From the butt to where the support fist
  // sits on the gun is this direction in the gun's own space:
  const L = h.hand("l").fist, span = L.distanceTo(P);
  // the gun's line from the butt (at the pocket) through a point the clip's hands say it passes:
  // `at` in the world, `inGun` the same point in the gun's own space
  const aimThrough = (at, inGun) => {
    const v = unit(at.clone().sub(P)), beta = Math.atan2(inGun[1] - hold.butt[1], inGun[2] - hold.butt[2]);
    const up = UP().addScaledVector(v, -v.y).normalize();
    return unit(v.clone().multiplyScalar(Math.cos(beta)).addScaledVector(up, -Math.sin(beta)));
  };
  // WHILE THE SUPPORT HAND IS ON THE GUN it aims at that hand; once it lets go (a rifle lowered to
  // the low ready, one hand on it) the butt STAYS in the shoulder and the gun points down through
  // the shooting fist, where the clip carries it. Dropping the shoulder fit there instead swung
  // the gun across the body and the shooting hand 40 cm round behind Claudia's back
  const sw = 1 - ease(L.distanceTo(supportAt(G, hold)), 0.14, 0.32);   // (the support hand's own let-go, gunFit)
  const reach = Math.hypot(hold.support[2] - hold.butt[2], hold.support[1] - 0.035 - hold.butt[1]);
  const ZR = aimThrough(h.handRigid("r").fist, [0, 0, 0]);
  const ZL = sw > 0 && span > reach * 0.6 && span < reach * 1.35 ? aimThrough(L, [hold.support[0], hold.support[1] - 0.035, hold.support[2]]) : null;
  let Z = ZL ? unit(ZR.clone().lerp(ZL, sw)) : ZR, Y = UP().addScaledVector(Z, -Z.y).normalize();
  // keep the clip's own cant (a rifle tipped a little in the hands stays tipped)
  const cant = G.Y.clone().addScaledVector(Z, -G.Y.dot(Z)).normalize();
  if (cant.lengthSq() > 0.5 && cant.dot(Y) > 0.7) Y.copy(cant);
  // the gun's body clear of the chest: carried low across the body it sank in, so it pivots out
  // on the shoulder (about the butt) by the least that clears it
  if (h.torso) {
    const surf = h.torso(), PIVOT_CAP = 35 * D; let pivoted = 0;
    for (let k = 0; k < 8; k++) {
      let deep = null;
      for (let i = 2; i <= 14; i++) {
        const z = hold.butt[2] + (hold.muzzle[2] - hold.butt[2]) * i / 14, yy = (hold.butt[1] + hold.muzzle[1]) / 2;
        for (const dx of [0, GUN_HALF, -GUN_HALF]) {
          const Xk = V().crossVectors(Y, Z), pt = P.clone().addScaledVector(Xk, dx).addScaledVector(Y, yy - hold.butt[1]).addScaledVector(Z, z - hold.butt[2]);
          const d = surf.inside(pt); if (d > 0.008 && (!deep || d > deep.d)) deep = { d, pt };
        }
      }
      if (!deep) break;
      // out of the body FORWARD more than sideways: a low ready clears a belly by the muzzle
      // coming forward, and capped at PIVOT_CAP in all — eight 15-degree swings sideways turned a
      // gun lowered across Claudia's belly 120 degrees and took the shooting hand round her back
      const lever = deep.pt.clone().sub(P), pr = surf.probe(deep.pt, "arm_r");
      const out = unit((pr.out ?? unit(deep.pt.clone().sub(h.at("spine_02")).setY(0))).clone().multiplyScalar(0.4).addScaledVector(h.frame().fwd, 0.6));
      const ax = V().crossVectors(lever, out); if (ax.lengthSq() < 1e-10) break;
      const ang = Math.min(15 * D, deep.d / lever.length() * 1.3 + 1 * D, PIVOT_CAP - pivoted);
      if (ang <= 0.2 * D) break;
      pivoted += ang;
      const q = new THREE.Quaternion().setFromAxisAngle(ax.normalize(), ang);
      Z.applyQuaternion(q).normalize(); Y.applyQuaternion(q).normalize();
    }
  }
  // the turn blends in with the place (it used to switch whole while only the place blended)
  if (w < 1) {
    const q0 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V().crossVectors(G.Y, G.Z), G.Y, G.Z));
    const q1 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V().crossVectors(Y, Z), Y, Z));
    q0.slerp(q1, w); Z = V(0, 0, 1).applyQuaternion(q0); Y = V(0, 1, 0).applyQuaternion(q0);
  }
  const X = V().crossVectors(Y, Z);
  // the butt plate in the pocket: o is where the grip lands with this angle and the butt at P
  const at0 = (o) => ({ o, X, Y, Z, at: ([x, y, z]) => o.clone().addScaledVector(X, x).addScaledVector(Y, y).addScaledVector(Z, z) });
  const oAtPocket = P.clone().addScaledVector(Z, 0.006).sub(at0(V()).at(hold.butt));
  const want = at0(G.o.clone().lerp(oAtPocket, w));
  const [f, p] = handAxesFor(h, want, hold);
  for (let k = 0; k < 2; k++) {
    h.reach("r", want.o.clone().addScaledVector(f, -0.07), 1, h.ahead(h.at("upperarm_r"), -0.1, -0.5, 0.3));
    h.orient("r", f, p, 1, true);
  }
}
// THE CUP (a two-handed pistol grip), in the gun's own space (x its left, y up, z forward, from the
// shooting fist's middle): where the support fist's middle sits, which way its palm faces, how far
// its fingers turn round toward the gun's right, how far they curl, and the thumb (straight, along
// the frame). `down` is where the fingers point below forward, in degrees
// (Josh, Oct 22: "the supporting under hand ... is floating beneath it": with the palm's lift left
// to the body's choice it picked palm-UP, a saucer under the grip. The palm faces IN, onto the
// grip's side, and the fist sits level with the shooting fist, its fingers over the shooting
// fingers — only how far down they point is still chosen)
const CUP = { at: [0.02, -0.01, 0.03], palm: [-0.92, 0.22, 0], round: 0.35, down: 45, close: 0.85, thumb: 0.1 };
// the GRIP of a gun in the shooting hand, for the fingers to close on: the gun only within 3 cm of
// the bar the grip makes across the palm (anim-hands.js gunSeat's) — the magazine, the trigger guard
// and the receiver are out past it, and a finger arriving at them isn't round the grip
const GRIP_BAR = 20 * D;
function gripOnly(h, gunSdf) {
  const R = h.handRigid("r"); if (!R.cal) return gunSdf;
  const c = R.hold(GUN_GRIP_R), bar = R.u.clone().multiplyScalar(Math.cos(GRIP_BAR)).addScaledVector(R.f, Math.sin(GRIP_BAR)).normalize();
  const near = capsule(c.clone().addScaledVector(bar, -0.06), c.clone().addScaledVector(bar, 0.06), 0.03);
  return (x) => Math.max(gunSdf(x), near(x));
}
// the shooting hand on a gun: three fingers and the thumb close on the GRIP (gripOnly), the trigger
// finger on the whole gun, stopping at the trigger and its guard
function shootingHand(h, gunSdf) {
  if (!gunSdf || !h.wrap) return;
  h.wrap("r", gunSdf, { fingers: ["middle", "ring", "pinky", "thumb"], thumb: 1.2, open: -0.6, contact: gripOnly(h, gunSdf) });
  h.wrap("r", gunSdf, { fingers: ["index"], open: -0.6 });
}
// the support hand's fingers ARRIVE on the handguard or the pump round the support point S (the gun
// within 4 cm of its bore line there), not on whatever part of the gun they meet first: the receiver,
// the magazine. Pressing in is still judged on the whole gun
function aroundSupport(gunSdf, G, S) {
  const near = capsule(S.clone().addScaledVector(G.Z, -0.08), S.clone().addScaledVector(G.Z, 0.08), 0.04);
  return (x) => Math.max(gunSdf(x), near(x));
}
function gunFit(h, gunId, slide = 0) {
  const hold = GUN_HOLDS[gunId]; if (!hold) throw new Error("no gun " + gunId + " (run scripts/survivorz/guns.mjs)");
  seatGun(h, hold);
  if (!(hold.butt && gunId !== "pistol" && h.shoulder !== false && shoulderGun(h, hold, h.shoulderW ?? 1) !== false)) clearGun(h, hold);
  const G = gunPose(h.handRigid("r"), hold, h.gunCal);
  // THE HANDS CLOSE ON THE GUN (Oct 22 2026): the shooting hand's fingers and thumb close until
  // they touch the gun's own shape (its voxel field) — the mocap's fingers held THEIR gun, and on
  // ours they sank half a finger into the grip. The hand checks (anim-hands.cjs) measure it
  const gunSdf = h.gunSdf?.(gunId, G);
  // (the trigger finger apart: it closes on the whole gun, and stops at the trigger and its guard —
  // closed on the grip it wrapped the grip, and nothing was on the trigger)
  shootingHand(h, gunSdf);
  if (hold.supportGrip) {
    // a PISTOL, two hands: the support hand CUPS the shooting hand, thumbs forward (the way it is
    // taught) — its palm on the grip's open left side behind the shooting fingers, its fingers
    // wrapped over the front of them under the trigger guard, its thumb along the frame. The
    // mocap's support hand lay flat UNDER the grip, a saucer under a cup, holding nothing.
    // When the clip has it near (a one-handed run lets it swing free) it goes to the cup; how far
    // down the fingers angle is the body's CHOICE (h.choice.down), the arm's natural cost decides
    const C = hold.cup ?? CUP, down = (h.choice?.down ?? C.down) * D;
    const inGun = ([x, y, z]) => unit(G.X.clone().multiplyScalar(x).addScaledVector(G.Y, y).addScaledVector(G.Z, z));
    // (how far the palm turns up under the shooting hand is the body's choice too: h.choice.up)
    // (its lift is chosen in a NARROW band, 0.22-0.42 — still facing the grip, never the saucer:
    // pinned at 0.22 the support wrist ran up to 22 degrees past the recordings on Carla)
    const p = inGun([C.palm[0], h.choice?.up ?? C.palm[1], C.palm[2]]);
    // the fingers: forward and DOWN by the chosen angle, a little round toward the gun's right
    const f = inGun([-C.round, -Math.sin(down), Math.cos(down)]); f.addScaledVector(p, -f.dot(p)).normalize();
    // (a reload's support hand is fetching the magazine: the mocap's own, untouched)
    // (placed off the SHOOTING FIST, not the gun: the cup wraps the shooting hand, and the gun's own
    // seat in the hand moved 3 cm when it went into the grip channel — off the gun, the cup missed)
    const GH = { ...G, o: h.handRigid("r").fist }, target = G.at.call(null, [0, 0, 0]).sub(G.o).add(GH.o).add(G.X.clone().multiplyScalar(C.at[0]).addScaledVector(G.Y, C.at[1]).addScaledVector(G.Z, C.at[2])), away = h.hand("l").fist.distanceTo(target);
    let w = h.cup === false ? 0 : 1 - ease(away, 0.1, 0.24);
    if (!h.free) { const was = h.supW ?? w; w = was + Math.max(-0.125, Math.min(0.125, w - was)); h.supW = w; }   // (eased, as the rifle's below)
    if (w > 0) grip(h, "l", target, f, p, w, C.close * w, { thumb: C.thumb * w }, h.ahead(h.at("upperarm_l"), 0.05, -0.5, -0.3));
    if (h.grip) h.grip.l = w;   // (the bake smooths a gripping hand's fingers)
    return { G, hold, w };
  }
  const target = supportAt(G, hold, slide);
  // (is the clip's own hand ON its gun? Measured from where ITS gun's handguard was — the recordings
  // held a carbine. The shotgun's pump sits 10 cm further out, and measured from there the clip's hand
  // always read "away": on a walk the support hand hung half-blended 8 cm off the pump, its fingers
  // through it)
  const ref = GUN_HOLDS.hk416 && gunId !== "hk416" ? supportAt(G, GUN_HOLDS.hk416, 0) : target;
  const away = h.hand("l").fist.distanceTo(ref);
  let w = h.gunAnchor?.port ? 1 : 1 - ease(away, 0.14, 0.32);   // at port arms both hands stay on
  // the grab and the let-go take a few frames whatever the clip's hand does: a transition that
  // swung the hand onto the gun in two frames closed the fingers in two (a one-frame jerk on
  // every finger). At most an eighth of the way a frame (h.supW, the last frame's)
  // AND A HAND PASSING BY IS NOT A GRAB: in a reload the support hand sweeps past the handguard
  // on its way to the magazine, and grabbing it there yanked the hand onto the gun and off again
  // (75 degrees of wrist in a frame). A real hand slows as it closes on what it takes, so the grip
  // only tightens while the clip's own hand moves under 2 cm a frame (60 cm/s)
  if (!h.free) {
    const was = h.supW ?? w, fist = h.hand("l").fist, moved = h.supAt ? fist.distanceTo(h.supAt) : 0; h.supAt = fist.clone();
    if (moved > 0.02 && w > was) w = was;
    w = was + Math.max(-0.125, Math.min(0.125, w - was)); h.supW = w;
  }
  // the mocap held a rifle too: its support hand's TURN is a real one, so it is kept, leaning a
  // quarter of the way to wrap this gun's handguard; the hand slides onto it. (A turn written
  // here spun the hand 170 degrees on a fuller body, and every let-go spun it back.)
  // AND THE HANDGUARD SITS IN THE HAND (Oct 22 2026): a fist made under it held nothing — the
  // handguard rested on the knuckles. Its middle at the support point goes into the hand's grip
  // channel (in front of the palm) and the fingers close round it until they touch. How far the
  // hand turns from the mocap's toward the gun's own way is the body's choice (h.choice.turn)
  const L = h.hand("l"), f0 = L.f.clone(), p0 = L.p.clone();
  if (w > 0) {
    const turn = h.choice?.turn ?? 0.25, fW = unit(f0.clone().lerp(G.X.clone().negate(), turn)), pW = unit(p0.clone().lerp(G.Y, turn)), pole = h.ahead(h.at("upperarm_l"), 0.05, -0.5, -0.25);
    if (gunSdf && h.wrap) {
      // (how deep the handguard is the way the PALM comes at it — its nearest surface was its half-
      // width, the hand sat too high, and the forefinger and little finger lay inside it)
      // (placed, then corrected by where the hand really is: the handguard's depth measured along the
      // palm the hand was ASKED for crossed it on the slant, read 3 cm against 1.5 along the palm it
      // reached, and the handguard sat 1.6 cm off the palm with nothing between palm and fingers)
      const place = (S) => {
        let r = depthAlong(gunSdf, S, pW, 0), aim = h.wristFor("l", S, fW, pW, r), err = 1;
        for (let k = 0; k < 4; k++) {
          h.reach("l", aim, w, pole); h.orient("l", fW, pW, 1);
          // (no pad's give against a gun: pressed 4 mm in, the support hand's knuckles sat inside the pump)
        const RL = h.handRigid("l"); r = depthAlong(gunSdf, S, RL.p, 0);
          // (eased frame to frame: the depth is read off a 4 mm grid, and a step of it moved the hand)
          if (!h.free && h.supR != null) r = h.supR + Math.max(-0.0015, Math.min(0.0015, r - h.supR));
          const e = S.clone().sub(RL.hold(r)); err = e.length(); if (err < 0.002) break;
          aim = aim.add(e.multiplyScalar(w));
        }
        return { r, err, S };
      };
      // A SHORT REACH TAKES THE BACK OF THE FORE-END: the recordings held a carbine, and the shotgun's
      // pump sits 10 cm further out — on a walk the arm couldn't reach its middle and the hand hung
      // 8-11 cm short with its fingers through the pump. The hand slides back along the bore, as far as
      // 6 cm (still on the pump or handguard), to the first place the arm reaches; with no such place
      // it takes the nearest
      const back = h.supBack ?? 0, tries = [...new Set([back, 0, 0.02, 0.04, 0.06])];
      let best = null;
      for (const b of tries) { const got = place(G.at([hold.support[0], hold.support[1], hold.support[2] - slide - b])); if (!best || got.err < best.err - 0.003) best = { ...got, b }; if (got.err < 0.008) { best = { ...got, b }; break; } }
      // (the slide eased, 4 mm a frame: a hand doesn't jump along a pump)
      const b = h.free || h.supBack == null ? best.b : h.supBack + Math.max(-0.004, Math.min(0.004, best.b - h.supBack));
      if (!h.free) h.supBack = b;
      const S0 = G.at([hold.support[0], hold.support[1], hold.support[2] - slide - b]);
      // AND THE SHOULDER COMES FORWARD when the arm still can't reach: a reach for a pump doesn't lock
      // the elbow, the shoulder blade comes round. Fully straight, Eric's arm reaches 63.3 cm and the
      // shotgun's pump on a walk needed 62.5-64.9: up to 12 degrees, eased 1.5 a frame
      let sh = 0;
      { const got = place(S0); if (got.err >= 0.006) {
        const s0 = h.at("shoulder_l"), ax = V().crossVectors(h.at("upperarm_l").sub(s0), S0.clone().sub(s0)); if (ax.lengthSq() > 1e-10) ax.normalize();
        let bestA = { a: 0, err: got.err };
        for (const a of [3, 6, 9, 12]) { h.turn("shoulder_l", ax, a * w); const e = place(S0).err; h.turn("shoulder_l", ax, -a * w); if (e < bestA.err - 0.002) bestA = { a, err: e }; if (e < 0.006) break; }
        sh = bestA.a; h.supAx = ax; } }
      if (!h.free) { const was = h.supSh ?? sh; sh = was + Math.max(-1.5, Math.min(1.5, sh - was)); h.supSh = sh; }
      if (sh && h.supAx) h.turn("shoulder_l", h.supAx, sh * w);
      const { S, r } = place(S0);
      h.supR = r;
      h.wrap("l", gunSdf, { w, thumb: 1.2, contact: aroundSupport(gunSdf, G, S) });
      // how far the gun stands off the PALM (for the body's choice of turn, anim-build.html): turned to
      // spare the wrist, a support hand on a rifle walk sat open 3 cm under the handguard — a saucer
      (h.palmGap ??= {}).l = Math.max(0, gunSdf(h.handRigid("l").hold(0.008))) * w;
    } else {
      h.reach("l", target.clone().addScaledVector(f0, -0.07), w, pole);
      h.orient("l", fW, pW, 1);
      h.fist("l", 0.75 * w, { thumb: 0.5 * w });
    }
  }
  if (h.grip) h.grip.l = w;   // (the bake smooths a gripping hand's fingers)
  return { G, hold, w };
}
// the rifle set the guns ride (deaths excluded: the gun drops when someone dies)
// (mx-reload is not a rifle reload: the gun riding its right hand swings overhead)
export const RIFLE_CLIPS = ["mx-firing-rifle-1", "mx-firing-rifle", "mx-backwards-rifle-walk", "mx-reload-1", "mx-reload-2", "mx-reloading",
  "mx-rifle-aim-to-down", "mx-rifle-aim-to-kneel", "mx-rifle-aiming-idle", "mx-rifle-down-to-aim", "mx-rifle-kneel-to-aim", "mx-shoot-rifle",
  ...["crouching-turn-90-left", "crouching-turn-90-right", "idle-aiming", "idle-crouching-aiming", "idle-crouching", "idle", "jump-down", "jump-loop", "jump-up",
    "run-backward-left", "run-backward-right", "run-backward", "run-forward-left", "run-forward-right", "run-forward", "run-left", "run-right",
    "sprint-backward-left", "sprint-backward-right", "sprint-backward", "sprint-forward-left", "sprint-forward-right", "sprint-forward", "sprint-left", "sprint-right",
    "turn-90-left", "turn-90-right", "walk-backward-left", "walk-backward-right", "walk-backward", "walk-crouching-backward-left", "walk-crouching-backward-right",
    "walk-crouching-backward", "walk-crouching-forward-left", "walk-crouching-forward-right", "walk-crouching-forward", "walk-crouching-left", "walk-crouching-right",
    "walk-forward-left", "walk-forward-right", "walk-forward", "walk-left", "walk-right"].map((n) => "mx-pro-rifle-pack--" + n)];
export const GUN_SETS = { gr: "hk416", gs: "shotgun" };       // clip prefix -> gun
// the pistol set the service pistol rides (Mixamo's handgun pack and the UAL pistol clips)
export const PISTOL_CLIPS = ["mx-pistol-shooting", ...["idle", "jump", "jump-2", "kneel-to-stand", "kneeling-idle", "run", "run-arc", "run-arc-2", "run-backward",
  "run-backward-arc", "run-backward-arc-2", "stand-to-kneel", "strafe", "strafe-2", "walk", "walk-arc", "walk-arc-2", "walk-backward", "walk-backward-arc",
  "walk-backward-arc-2"].map((n) => "mx-pistol-handgun-locomotion-pack--pistol-" + n),
  ...["aim-down", "aim-neutral", "aim-up", "idle-loop", "reload", "shoot"].map((n) => "ual1-pistol-" + n)];
const RECIPES0 = {
  // shivering: arms folded tight, shoulders up, a fast fine tremble through the body
  shiver: {
    base: "ual1-idle-loop", dur: 4,
    // Freezing: hands together in front of the mouth, rubbed and blown into, elbows tucked down,
    // shoulders hunched, the whole body trembling. (The first two cuts folded the arms or hugged
    // the other arm; on every body shape the forearms either sank into the chest or had to be
    // forced off it — the animation law. Hands in front of the face never cross the body.)
    frame(h, t, dur) {
      const F = h.frame();
      const n = (k, ph) => Math.sin(h.loop(t, dur, k) + ph);
      const shake = (k) => 0.6 * n(k, 0) + 0.4 * n(k + 7, 1.3);
      const blow = h.pulse(t % 2, 1.2, 0.25, 0.3);                      // a breath into the hands every two seconds
      h.turn("shoulder_l", "z", 7); h.turn("shoulder_r", "z", -7);           // hunched up
      h.turn("spine_02", "x", 5); h.turn("spine_02", "z", 1.4 * shake(40)); h.turn("spine_03", "y", 1.2 * shake(44));
      h.turn("head", "x", 1.5 * shake(38) + 4 + 4 * blow); h.turn("head", "y", 1.0 * shake(47));
      const mouth = h.ahead(h.at("head"), 0.19 - 0.04 * blow, -0.13, 0);
      const rub = 0.022 * Math.sin(h.loop(t, dur, 6));
      for (const [side, s] of [["l", -1], ["r", 1]]) {
        // cupped: close together, palms facing, the fingers only half closed
        const at = mouth.clone().addScaledVector(F.right, s * 0.022).addScaledVector(UP(), s * rub);
        grip(h, side, at, dirOf([UP(), 0.8], [F.fwd, 0.35], [F.right, -0.25 * s]), F.right.clone().multiplyScalar(-s), 1, 0.22, { thumb: 0.1 }, h.ahead(h.at("upperarm_" + side), 0.1, -0.6, 0.12 * s));
      }
      h.turn("upperarm_l", "x", 1.2 * shake(42)); h.turn("upperarm_r", "x", 1.2 * shake(45));
    },
  },
  // a coughing fit standing up: a hand to the mouth, three hard coughs bending the body, then
  // the hand comes away
  cough: {
    base: "ual1-idle-loop", dur: 4.2, once: true,
    frame(h, t) {
      const hand = h.ease(t, 0.15, 0.55) * (1 - h.ease(t, 3.1, 3.7));
      const c = h.pulse(t, 0.8, 0.07, 0.32) + h.pulse(t, 1.3, 0.07, 0.32) + 0.8 * h.pulse(t, 1.85, 0.07, 0.38) + 0.5 * h.pulse(t, 2.6, 0.08, 0.4);
      h.turn("spine_01", "x", 9 * c + 4 * hand); h.turn("spine_02", "x", 7 * c); h.turn("neck", "x", 6 * c);
      h.turn("head", "x", 8 * c - 4 * hand);
      h.turn("shoulder_l", "z", 4 * c); h.turn("shoulder_r", "z", -4 * c);
      const mouth = h.ahead(h.at("head"), 0.13, -0.07, -0.01);
      // on the way back down the hand goes out in front first, so it never cuts through the chest
      // the hand comes up to the mouth by way of the front and goes back down the same way (a
      // straight line from the hip ran it through the chest); the elbow forward, as you cough
      // into a fist
      const up = h.ease(t, 0.15, 0.55), down = h.ease(t, 3.0, 3.7);
      const at = down > 0 ? viaFront(h, mouth.clone().addScaledVector(h.frame().fwd, 0.03), 1 - down, "r") : viaFront(h, mouth.clone().addScaledVector(h.frame().fwd, 0.03), up, "r");
      h.reach("r", at, Math.min(1, (down > 0 ? 1 - h.ease(t, 3.45, 3.9) : 1) * Math.min(1, up * 3)), h.ahead(h.at("upperarm_r"), 0.25, -0.35, 0.3));
    },
  },
  // hammering a nail into a board across a doorway (Josh flagged the first cut: "looks like he
  // is just slapping his hand" — the hammer hand swung at the holding hand). Now: the left hand
  // pinches the nail against the board and stays out of the way; the right hand is a FIST round
  // the hammer's handle (HAMMER below — the prop the game puts in it, and the review draws). At
  // the strike the handle stands upright and the head's face meets the board at the nail; the
  // wind-up cocks the wrist back so the head rises over the shoulder. Four blows a loop, a slow
  // lift and a fast strike, the body leaning into each.
  hammer: {
    base: "mx-searching-files-high", dur: 2.4,
    frame(h, t, dur) {
      const F = h.frame();
      const p = (t / dur * 4) % 1;
      const up = p < 0.6 ? h.ease(p, 0, 0.6) : 1 - h.ease(p, 0.6, 0.72);
      h.turn("spine_01", "x", 4 - 3 * up); h.turn("spine_02", "y", -4 + 3 * up);   // square to the board, leaning in
      // the nail stands HAMMER.out proud of the board and the head strikes its head. The left hand
      // BRACES the board, palm flat on it a hand's width left of the nail, the fingers resting on the
      // wood (they curl until they meet it). Pinching the nail put the hand's knuckles in the head's
      // path — it came down on the fingers — and a hand placed by the wrist and closed by an amount
      // sank its fingers 2 cm into the plank
      // (the nail and the board where the review draws them: off the hips at the clip's FIRST frame.
      // Off the hips each frame, the nail rode with the body as it leaned into the blows, a few cm
      // off the drawn one — enough to put the bracing hand into the wood)
      const HF = h.homeFrame();
      const nail = h.home(HAMMER.board, HAMMER.height, HAMMER.across);
      const nailHead = nail.clone().addScaledVector(HF.fwd, -HAMMER.out);
      const board = boxSdf(h.home(HAMMER.board + 0.0145, HAMMER.height, HAMMER.across), HF.right, UP(), [1.1, 0.15, 0.025]);
      const R0 = h.gripCals?.l, palmOff = (R0?.p ?? 0.02) + 0.004;   // the palm's skin on the wood
      // (a hand's width and more from the nail and a little below it: closer, the bracing forearm
      // crossed in front of the nail, in the hammer's path)
      const brace = nail.clone().addScaledVector(HF.right, -HAMMER.brace).addScaledVector(UP(), -HAMMER.braceDown).addScaledVector(HF.fwd, -palmOff);
      // (then STOOD OFF by however far its fingers still go in: a real finger never lies dead
      // straight, and at the palm's distance even the least-curled real pose reached into the wood
      // — a bracing hand rests on its fingertips and pads, the palm a little off the board)
      const restore = h.save("l"), skin = (h.gripCals?.l?.r ?? 0.011) * 0.85;
      let off = 0;
      for (let k = 0; k < 3; k++) {
        restore();
        layHand(h, "l", brace.clone().addScaledVector(HF.fwd, -off), HF.fwd, dirOf([UP(), 0.45], [HF.right, 0.9]), 1, 0, {}, h.ahead(h.at("upperarm_l"), 0.0, -0.4, -0.3));
        if (h.wrap) h.wrap("l", board, { kmax: 0.35, thumb: 0.2, open: 0 }); else h.fist("l", 0.15);
        const deep = Math.min(...fingerTips(h, "l").map(board));
        if (deep >= skin - 0.001) break;
        off += skin - deep;
      }
      // the right hand: fingers point where the head's face points; the handle runs from the fist
      // up through the thumb side to the head, so at the strike the fist is a handle-length under
      // the nail and a little back from the board
      // at the strike the fist is a handle-length under the nail; the wind-up lifts the fist up and
      // back (the elbow bends) and the wrist cocks the hammer back round the fist
      const strike = nailHead.clone().addScaledVector(h.vec(0, 1, 0), -HAMMER.handle).addScaledVector(HF.fwd, -HAMMER.face);
      const fistAt = strike.addScaledVector(h.vec(0, 1, 0), 0.24 * up).addScaledVector(F.fwd, -0.2 * up);
      const fingers = F.fwd.clone().applyAxisAngle(F.left, -THREE_DEG * 85 * up);
      // (fistAt is where the handle passes through the hand: the grip channel, h.wristFor)
      const wrist = h.wristFor ? h.wristFor("r", fistAt, fingers, F.left, HAMMER.r) : fistAt.clone().addScaledVector(fingers, -0.07);
      h.reach("r", wrist, 1, h.ahead(h.at("upperarm_r"), -0.2, -0.45 + 0.35 * up, 0.35));
      h.orient("r", fingers, F.left, 1);
      const RH = h.hand("r");
      if (h.wrap) h.wrap("r", capsule(fistAt.clone().addScaledVector(RH.u, -0.07), fistAt.clone().addScaledVector(RH.u, HAMMER.handle), HAMMER.r)); else h.fist("r", 1);
      // both hands hold something the whole loop: the bake smooths their fingers (the base is a
      // file search, and its thumbs twitched through the fist 15 degrees a frame)
      held(h, "l", 1); held(h, "r", 1);
    },
  },
  // ---- THE TOOLS ROUND (their props: PROPS, below) ----
  // walking / running with a flashlight out front, overhand, swaying with the look
  "flashlight-walk": { base: "ual1-walk-loop", dur: "base", frame: (h, t, dur) => flashlight(h, t, dur, 0.34) },
  "flashlight-run": { base: "ual1-jog-fwd-loop", dur: "base", frame: (h, t, dur) => flashlight(h, t, dur, 0.30) },
  // injecting: the left forearm turned up and held out, the syringe brought in at a shallow
  // angle, the needle in, the thumb pressing, out, the site rubbed, the arms down
  inject: {
    base: "ual1-idle-loop", dur: 4.4, once: true,
    // how the syringe hand's palm turns (toward the body's left, and down): the body's choice — a
    // fixed turn twisted three bodies' forearms 13-17 degrees past real ones the whole time it held
    choose: [[1, -0.4, 0], [1, -0.8, 0], [0.7, -1, 0.3], [1, -0.2, -0.3], [0.6, -0.6, -0.5]].map((pl) => ({ pl })),
    frame(h, t) {
      const F = h.frame();
      const wl = h.ease(t, 0.1, 0.8) * (1 - h.ease(t, 3.1, 3.9));
      h.turn("neck", "x", 10 * wl); h.turn("head", "x", 16 * wl); h.turn("head", "y", -8 * wl);
      grip(h, "l", h.ahead(h.at("hip"), 0.54, 0.28, -0.08), dirOf([F.fwd, 0.9], [F.right, 0.45]), UP(), wl, 0.35, {}, h.ahead(h.at("upperarm_l"), -0.05, -0.5, -0.35));
      const el = h.at("lowerarm_l"), wr = h.at("hand_l"), arm = unit(wr.clone().sub(el));
      const across = unit(V().crossVectors(UP(), arm));               // over the forearm, toward the body's left
      const site = el.clone().lerp(wr, 0.5).addScaledVector(UP(), 0.032);
      const d = dirOf([across, 0.82], [UP(), -0.57]);                   // the needle 35 degrees into the skin
      const reach = h.ease(t, 0.35, 1.2) * (1 - h.ease(t, 2.8, 3.6));
      const ins = h.ease(t, 1.35, 1.6) * (1 - h.ease(t, 2.45, 2.7)), press = h.ease(t, 1.7, 2.3);
      const tip = site.clone().addScaledVector(d, -0.07 * (1 - ins) + 0.006 * ins).addScaledVector(UP(), 0.05 * (1 - ins));
      const pl = h.choice?.pl ?? [1, -0.4, 0], palmTo = dirOf([F.left, pl[0]], [UP(), pl[1]], [F.fwd, pl[2]]);
      const holdAt = tip.clone().addScaledVector(d, -SYRINGE.tip);
      const wristAt = h.wristFor ? h.wristFor("r", holdAt, d, palmTo, SYRINGE.r) : tip.clone().addScaledVector(d, -0.17);
      h.reach("r", viaFront(h, wristAt, h.ease(t, 0.35, 1.2) * (1 - h.ease(t, 2.8, 3.6)), "r"), Math.min(1, reach * 3), h.ahead(h.at("upperarm_r"), 0.15, -0.6, 0.2));
      const rub = h.ease(t, 2.75, 3.0) * (1 - h.ease(t, 3.3, 3.6));
      h.orient("r", d, palmTo, reach * (1 - rub));
      // the barrel where the hand holds it (the review draws it there): the fingers and thumb close
      // onto it, the ring and little fingers tuck under; the thumb's press is on the plunger
      if (h.wrap) {
        const RH = h.hand("r"), H = RH.hold(SYRINGE.r);
        h.fist("r", 0, { ring: 0.6 * reach, pinky: 0.6 * reach });
        h.wrap("r", capsule(H.clone().addScaledVector(RH.f, -SYRINGE.back), H.clone().addScaledVector(RH.f, SYRINGE.barrel), SYRINGE.r), { fingers: ["index", "middle", "thumb"], thumb: 0.6 + 0.5 * press });   // (in the hand throughout)
      } else h.fist("r", 0.5 * reach, { index: 0.3 * reach, thumb: (0.4 + 0.5 * press) * reach });
      held(h, "r", reach);   // (the syringe hand)
      // (the rub lets the hand go from the needle's angle: held there, the wrist bent back 13 degrees past real ones)
      if (rub > 0) h.reach("r", site.clone().addScaledVector(arm, 0.04 * Math.sin(t * 22)).addScaledVector(UP(), 0.07).addScaledVector(F.right, 0.05), rub, h.ahead(h.at("upperarm_r"), 0.15, -0.6, 0.2));
      // after the rub the hand goes OUT, in front of its own hip, and down from there: lowered
      // straight from the rub, a bulkier body's hip took the forefinger (Manuel, 3.7 cm)
      const out = h.ease(t, 3.25, 3.55) * (1 - h.ease(t, 3.75, 4.2));
      if (out > 0) h.reach("r", h.ahead(h.at("hip"), 0.3, 0.1, 0.24), out, h.ahead(h.at("upperarm_r"), 0.15, -0.6, 0.2));
    },
  },
  // opening a can: held in the left hand at the chest, the right forefinger lifts the ring-pull
  // and peels it back, then the can comes up to look in
  can: {
    base: "ual1-idle-loop", dur: 3.6, once: true,
    frame(h, t) {
      const F = h.frame();
      const wl = h.ease(t, 0.1, 0.7) * (1 - h.ease(t, 2.9, 3.5)), lift = h.ease(t, 2.1, 2.5) * (1 - h.ease(t, 2.9, 3.4));
      h.turn("neck", "x", 8 * wl); h.turn("head", "x", 12 * wl - 6 * lift);
      // a can is held a forearm's length out from the chest, not against it (the first cut held it
      // so close the opening hand had to press across the ribs)
      // (the point is the can's middle, in the hand's grip channel; the fingers close round it)
      const canAt = h.ahead(h.at("hip"), 0.42, 0.22 + 0.08 * lift, -0.07), cf = dirOf([F.fwd, 1], [F.right, 0.35]), cp = F.right;
      const cu = unit(V().crossVectors(cp.clone().addScaledVector(cf, -cp.dot(cf)), cf));   // (the left hand's thumb side: the can's axis)
      grip(h, "l", canAt, cf, cp, wl, 0.45, { thumb: 0.35 }, h.ahead(h.at("upperarm_l"), -0.05, -0.45, -0.3), { r: CAN.r, len: CAN.h / 2 - CAN.r, wrap: { w: 1 } });   // (the can is in the hand from the first frame: its fingers hold it while the arm eases in)
      const L = h.hand("l"), top = L.hold(CAN.r).addScaledVector(L.u, CAN.h / 2);
      const wr = h.ease(t, 0.45, 1.05) * (1 - h.ease(t, 1.95, 2.5));
      const crack = h.ease(t, 1.2, 1.4), peel = h.ease(t, 1.45, 1.85);
      // (the tab's place on the LID, along the can's own axis: offset by the world's up, a tilted can
      // put it under the lid's edge, inside the can)
      const lidFwd = unit(F.fwd.clone().addScaledVector(L.u, -F.fwd.dot(L.u)));
      const tip = top.clone().addScaledVector(lidFwd, 0.014 - 0.03 * peel).addScaledVector(L.u, 0.006 + 0.02 * crack + 0.012 * peel);
      // (the forefinger comes down onto the tab from above: at a shallow angle its middle joints cut
      // through the can's rim on the way to it)
      // (and it gets there over the top: up to above and right of the tab first, then down onto it —
      // eased in a straight line from the hip, the hand came up through the can's side)
      const arrive = h.ease(wr, 0.7, 1), wGo = Math.min(1, wr / 0.7);
      const tipGo = tip.clone().addScaledVector(UP(), 0.09 * (1 - arrive)).addScaledVector(F.right, 0.07 * (1 - arrive));
      tipTo(h, "r", "index", tipGo, dirOf([UP(), -0.85], [F.fwd, 0.45], [F.left, 0.25]), dirOf([UP(), -0.45], [F.fwd, -0.6]), wGo, 0.55, { index: 0, thumb: 0.25 }, h.ahead(h.at("upperarm_r"), 0.1, -0.6, 0.25));
      // (the opening hand's other fingers close only until they meet the can: closed by an amount,
      // they sank into it)
      // the forefinger and thumb too: placed by the fingertip, the rest of a hooked finger went
      // wherever its curl took it, down through the lid (1.6 cm in)
      if (h.wrap && wr > 0) { const H = L.hold(CAN.r), e = CAN.h / 2 - CAN.r, can = capsule(H.clone().addScaledVector(L.u, -e), H.clone().addScaledVector(L.u, e), CAN.r);
        h.wrap("r", can, { w: wr, fingers: ["middle", "ring", "pinky"], kmax: 0.55, open: -0.4 });
        h.wrap("r", can, { w: wr, fingers: ["index", "thumb"], kmax: 0.6, thumb: 0.4, open: -0.4, thumbStay: true, thumbOpen: -0.6 }); }
    },
  },
  // a keypad on the wall: four digits and enter, the forefinger out, the rest of the hand closed
  keypad: {
    base: "ual1-idle-loop", dur: 4.2, once: true,
    frame(h, t) {
      const F = h.homeFrame(), w = h.ease(t, 0.2, 0.9) * (1 - h.ease(t, 3.3, 4.0));
      h.turn("neck", "x", 6 * w); h.turn("head", "x", 6 * w);
      const presses = KEYPAD.code.map((k, i) => ({ k, at: 1.0 + 0.45 * i }));
      let ia = 0; while (ia < presses.length - 1 && presses[ia + 1].at - 0.25 <= t) ia++;
      const a = presses[Math.max(0, ia - 1)], b = presses[ia];
      const key = keyPos(h, a.k).lerp(keyPos(h, b.k), a === b ? 1 : ease(t, a.at + 0.1, b.at - 0.12));
      const push = Math.min(1, presses.reduce((s2, p) => s2 + pulse(t, p.at, 0.07, 0.07), 0));
      tipTo(h, "r", "index", key.addScaledVector(F.fwd, -0.035 + 0.032 * push), dirOf([F.fwd, 1], [UP(), -0.12], [F.left, 0.1]), UP().negate(), w, 1, { index: 0.05, thumb: 0.6 });
    },
  },
  // a keycard down a wall reader's slot: the card pinched at the fingertips, run down the
  // slot, a beat for the light, the hand back down
  keycard: {
    base: "ual1-idle-loop", dur: 3.0, once: true,
    frame(h, t) {
      const F = h.homeFrame(), w = h.ease(t, 0.15, 0.8) * (1 - h.ease(t, 1.9, 2.6));
      h.turn("neck", "x", 4 * w); h.turn("head", "y", 6 * w);
      const swipe = h.ease(t, 0.9, 1.15);
      // the card's middle: its leading edge in the slot, from above the reader to below it
      const card = readerSlot(h).addScaledVector(UP(), 0.06 - 0.12 * swipe).addScaledVector(F.fwd, -CARD.len / 2 + 0.012);
      const fingers = dirOf([F.fwd, 1], [UP(), -0.05]);
      h.reach("r", card.clone().addScaledVector(fingers, -CARD.at[0]).addScaledVector(UP(), -CARD.at[2]), w, h.ahead(h.at("upperarm_r"), -0.1, -0.45, 0.3));
      h.orient("r", fingers, F.right.clone().negate(), w);
      h.fist("r", 0.45 * w, { index: 0.5 * w, thumb: 0.8 * w });
    },
  },
  // the shotgun's pump, on the real gun from the pack: at the low ready, the fore-end racked back
  // and forward (the pump's travel rides the clip as PROPS' slide)
  "shotgun-pump": { base: "mx-pro-rifle-pack--idle", dur: 1.1, once: true, gun: "shotgun", frame: (h, t) => shotgunMove(h, t, pumpStroke(t, "pump"), null) },
  // loading: three times the left hand goes to the belt pouch, brings a shell to the loading
  // port under the receiver and thumbs it in; then back to the fore-end and a pump
  "shotgun-load": { base: "mx-pro-rifle-pack--idle", dur: 4.9, once: true, gun: "shotgun", choose: [0.2, 0.7, 1.2, 1.8, 2.6].map((out) => ({ out })), frame: (h, t) => shotgunMove(h, t, pumpStroke(t, "load"), t) },
  // prying with a crowbar: the hooked end in a door's gap, both hands on the bar, three heaves
  // levering it, the body leaning back into each
  crowbar: {
    base: "ual1-idle-loop", dur: 3.6,
    frame(h, t, dur) {
      const heave = crowbarHeave(t, dur);
      h.turn("spine_01", "x", -7 * heave); h.turn("spine_02", "x", -3 * heave); h.turn("head", "x", 6 + 4 * heave);
      h.move("hip", h.homeFrame().fwd.clone().multiplyScalar(-0.04 * heave));
      const tip = crowbarTip(h), d = crowbarDir(h, heave);
      for (const [side, along] of [["l", CROWBAR.left], ["r", CROWBAR.right]]) {
        // (placed first; the fingers close below, once both hands are on — onto the bar as the review
        // draws it, through both hands, the way PROPS.crowbar does)
        // both fists round the bar, thumbs along it toward the tip; each hand turns round the
        // bar as its own forearm lies (gripBar), leaning to overhand (palm down)
        // (no overhand preference: on a long-armed body the arm is near straight at the heave, can't
        // swing its elbow to help, and a forced palm-down rolled the wrist 150 degrees)
        gripBar(h, side, tip.clone().addScaledVector(d, along), d, 1, 1, {}, h.ahead(h.at("upperarm_" + side), -0.2, -0.5, side === "r" ? 0.3 : -0.3), null, { r: CROWBAR.r, place: true });
      }
      if (h.wrap) {
        const LH = h.hand("l").hold(CROWBAR.r), RH = h.hand("r").hold(CROWBAR.r), bd = unit(LH.clone().sub(RH));
        const bar = capsule(RH.clone().addScaledVector(bd, -0.08), LH.clone().addScaledVector(bd, CROWBAR.left), CROWBAR.r);
        h.wrap("l", bar); h.wrap("r", bar);
      }
    },
  },
  // holding a door shut: leaning into it, both palms flat on it; twice the door is hit from the
  // other side, the body jolted back, then shoving back in
  "hold-door": {
    base: "ual1-idle-loop", dur: 3.2,
    frame(h, t) {
      const F = h.homeFrame(), bang = doorBang(t);
      h.turn("spine_01", "x", 14 - 6 * bang); h.turn("spine_02", "x", 6); h.turn("neck", "x", -10);
      h.turn("head", "y", 28); h.turn("head", "z", -6);
      h.move("hip", F.fwd.clone().multiplyScalar(-0.035 * bang));
      for (const [side, s] of [["l", -1], ["r", 1]]) {
        const palmAt = h.home(DOOR.at - DOOR.thick / 2 - 0.035 * bang - 0.012, 0.50 + (s > 0 ? 0.06 : -0.04), 0.20 * s);
        h.reach(side, palmAt.clone().addScaledVector(UP(), -0.075).addScaledVector(F.fwd, -0.025), 1, h.ahead(h.at("upperarm_" + side), -0.25, -0.3, 0.35 * s));
        h.orient(side, dirOf([UP(), 1], [F.right, -0.25 * s]), F.fwd, 1);
        h.fist(side, 0.12);
      }
    },
  },
  // dragging a body: walking backwards bent over, both hands under the arms of a body lying in
  // front (the game's ragdoll; a stand-in here), hauling it with each step
  "drag-body": {
    base: "ual1-walk-loop", dur: "base", reverse: true,
    frame(h, t, dur) {
      const F = h.homeFrame(), heave = 0.5 + 0.5 * Math.sin(h.loop(t, dur, 2));
      h.turn("spine_01", "x", 26 + 4 * heave); h.turn("spine_02", "x", 12); h.turn("neck", "x", -6);
      for (const [side, s] of [["l", -1], ["r", 1]])
        grip(h, side, h.home(DRAG.reach - 0.03 * heave, DRAG.height, 0.15 * s), dirOf([F.fwd, 0.7], [UP(), -0.5], [F.right, -0.4 * s]), F.right.clone().multiplyScalar(-s), 1, 0.8, {}, h.ahead(h.at("upperarm_" + side), 0.05, -0.4, 0.3 * s));
    },
  },
  // the panicked look back over a sprint, over the left shoulder and over the right
  "look-back-l": { base: "ual1-sprint-loop", dur: 2.6, frame: (h, t) => lookBack(h, t, 1) },
  "look-back-r": { base: "ual1-sprint-loop", dur: 2.6, frame: (h, t) => lookBack(h, t, -1) },
  // lighting a molotov: the bottle by its neck in the right hand, a lighter under the rag in the
  // left, two flicks, the rag catches, the arm cocks back to throw (the throw is
  // ual2-overhandthrow, which the game plays next)
  molotov: {
    // (it ends with the lit bottle held up: the WIND-UP is the mocap throw's own — mx-throw-object
    // or ual2-overhandthrow follow in game. A hand-built cock-back turned the hand 270° against
    // the forearm; a real throw's shoulder does that, and the mocap has it)
    base: "ual1-idle-loop", dur: 2.1, once: true,
    frame(h, t) {
      const F = h.frame();
      const wb = h.ease(t, 0.05, 0.55), cock = 0, wl = h.ease(t, 0.3, 0.8) * (1 - h.ease(t, 1.7, 2.05));
      h.turn("neck", "x", 8 * wb * (1 - cock)); h.turn("head", "x", 10 * wb * (1 - cock));
      h.turn("spine_02", "y", 14 * cock); h.turn("spine_01", "x", -3 * cock);
      // the wind-up loads the throw: the hand just above and outside the right shoulder, the
      // bottle's body hanging back behind it (Josh: it went "behind the head above")
      const held = h.ahead(h.at("spine_03"), 0.32, -0.12, 0.08).lerp(h.ahead(h.at("upperarm_r"), -0.06, 0.12, 0.2), cock);
      const back = dirOf([F.fwd, -1], [UP(), -0.45]);                  // the bottle's body, wound up
      const thumbUp = back.clone().negate();                             // the fist's thumb side points the other way
      const fCock = unit(F.left.clone().addScaledVector(thumbUp, -F.left.dot(thumbUp))), pCock = V().crossVectors(thumbUp, fCock);
      const fHeld = dirOf([F.left, 0.8], [F.fwd, 0.2]), pHeld = F.fwd.clone().negate();
      // the neck through the fist, thumb toward the rag; the hand turns round it as the forearm lies
      // (turned toward the wind-up's way, not blended: the two point nearly opposite, and a blend
      // through nothing flipped the bottle, and the hand with it, half way)
      const uHeld = unit(V().crossVectors(fHeld, pHeld)), ax = V().crossVectors(uHeld, thumbUp);
      if (ax.lengthSq() < 1e-6) ax.copy(F.right); ax.normalize();
      const neck = uHeld.clone().applyAxisAngle(ax, uHeld.angleTo(thumbUp) * cock);
      gripBar(h, "r", held, neck, wb, 1, {}, h.ahead(h.at("upperarm_r"), -0.2, -0.45 + 0.15 * cock, 0.45), unit(fHeld.clone().lerp(fCock, cock)),
        { r: MOLOTOV.neck, shape: bottleIn, wrap: { w: 1 } });
      const R = h.hand("r"), rag = R.hold(MOLOTOV.neck).addScaledVector(R.u, MOLOTOV.rag);
      const flick = Math.min(1, pulse(t, 0.95, 0.04, 0.12) + pulse(t, 1.3, 0.04, 0.12));
      // (the lighter hand's fingers close on the lighter and stop at the bottle beside it)
      // (BESIDE the neck on the left, fingers forward and the palm toward the bottle, its flame up by the
      // rag: under the rag is where the right fist holds the neck, and the two hands sat inside each
      // other; reached round in front, the wrist bent 21 degrees past real ones. Then
      // moved off the bottle by however far its fingers still go in, as the hammer's bracing hand is)
      const RB = h.hand("r"), bottle = bottleIn(RB.hold(MOLOTOV.neck), RB);
      const lighterObj = { r: 0.009, shape: (H, R) => union(capsule(H.clone().addScaledVector(R.u, -0.03), H.clone().addScaledVector(R.u, 0.03), 0.009), bottle), wrap: { w: 1, thumb: 0.6 - 0.6 * flick } };
      const lAt = rag.clone().addScaledVector(UP(), -0.085).addScaledVector(F.left, MOLOTOV.lighterSide).addScaledVector(F.fwd, 0.01), away = F.left.clone();
      const restoreL = h.save("l"), skinL = (h.gripCals?.l?.r ?? 0.011) * 0.85;
      let offL = 0;
      for (let k = 0; k < 3; k++) {
        restoreL();
        grip(h, "l", lAt.clone().addScaledVector(away, offL), dirOf([F.fwd, 1], [F.right, 0.3]), F.right, wl, 1, { thumb: 0.3 - 0.3 * flick }, h.ahead(h.at("upperarm_l"), -0.1, -0.4, -0.3), lighterObj);
        const deep = Math.min(...fingerTips(h, "l").map(bottle));
        if (deep >= skinL - 0.001 || wl <= 0) break;
        offL += skinL - deep;
      }
    },
  },
  // (a pump shotgun reloads a shell at a time — bd-shotgun-load — so not the rifle's magazine reloads)
  ...Object.fromEntries(Object.entries(GUN_SETS).flatMap(([pre, gun]) => RIFLE_CLIPS.filter((clip) => !(gun === "shotgun" && /reload/.test(clip))).map((clip) =>
    [`${pre}:${clip}`, { base: clip, dur: "base", gun, id: `${pre}-${clip}`, choose: [0, 0.12, 0.25, 0.4, 0.55, 0.7, 0.85].map((turn) => ({ turn })), ...(/sprint-/.test(clip) ? { armsFrom: clip.replace("sprint-", "run-") } : {}), frame: (h) => { h.shoulder = !/reload/.test(clip); gunFit(h, gun); } }]))),
  ...Object.fromEntries(PISTOL_CLIPS.map((clip) => [`gp:${clip}`, { base: clip, dur: "base", gun: "pistol", id: `gp-${clip}`, choose: [30, 45, 60].flatMap((down) => [0.22, 0.32, 0.42].map((up) => ({ down, up }))), frame: (h) => { h.cup = !/reload/.test(clip); gunFit(h, "pistol"); } }])),
  // THE HUG (see hug() above): baked per pair as bd-hug-over-<partner> / bd-hug-under-<partner>
  "hug-over": { base: "ual1-idle-loop", dur: 5, pair: true, frame: (h, t) => hug(h, t, true, { mate: true }) },
  // COMFORT (Oct 23 2026), at arm's length: a hand on the partner's shoulder (bd-comfort-<partner>),
  // while the partner plays bd-comforted (head bowed, a hand to the eyes)
  comfort: { base: "ual1-idle-loop", dur: 6, pair: true, frame: (h, t) => comfort(h, t) },
  // A KISS (Oct 23 2026), chests close: "a" holds the partner's waist, "b" the partner's upper arms;
  // both lean in and tip their heads opposite ways so the noses pass
  // THE REVIVE (Oct 23 2026): the reviver's CPR on the downed partner, who plays mx-receiving-cpr
  // (bd-revive-<partner>). The partner lies placed so its chest is under the reviver's hands
  // (built.place: x, z, yaw), and the hands stay on that chest every frame
  revive: { base: "mx-administering-cpr", dur: "base", pair: true, frame: (h, t) => revive(h, t) },
  "kiss-a": { base: "ual1-idle-loop", dur: 5, pair: true, frame: (h, t) => kiss(h, t, true) },
  "kiss-b": { base: "ual1-idle-loop", dur: 5, pair: true, frame: (h, t) => kiss(h, t, false) },
  "hug-under": { base: "ual1-idle-loop", dur: 5, pair: true, frame: (h, t) => hug(h, t, false, { mate: true }) },
  // bandaging a forearm, sitting on the floor: the left arm across the body, the right hand
  // winding round it, head down watching
  bandage: {
    base: "mx-sitting-idle", dur: 4.8,
    frame(h, t, dur) {
      const chest = h.at("spine_03");
      const held = h.ahead(chest, 0.30, -0.22, 0.04);
      h.reach("l", held, 1, h.ahead(h.at("upperarm_l"), -0.1, -0.4, -0.4));
      const elbow = h.at("lowerarm_l"), wrist = h.at("hand_l");
      const mid = elbow.clone().lerp(wrist, 0.55);
      const a = h.loop(t, dur, 6);
      const around = h.ahead(mid, 0.06 * Math.cos(a), 0.06 * Math.sin(a) + 0.02, 0);
      h.reach("r", around, 1, h.ahead(h.at("upperarm_r"), -0.1, -0.4, 0.4));
      h.turn("head", "x", 14); h.turn("neck", "x", 6);
    },
  },
};

// THINGS HELD THROUGH A RECORDED CLIP (Oct 23 2026, the mechanics brief): most melee, eating and work moves
// were "close" only for want of the thing in the hand. A held thing sits in the hand's measured GRIP
// CHANNEL (gripCal) along the thumb side, the way a handle runs through a fist; the fingers close on its
// HANDLE until they touch it (h.wrap, as on a gun's grip) and nothing sinks into the rest of it. "hd:<thing>:<clip>"
// carries it through that clip, baked as hd-<thing>-<clip>. Sizes in metres along the thumb side from the
// fist's middle: `below` toward the little finger, `above` toward the thumb; `two`, a second hand that far
// up the handle (the fire axe). `parts` draws it for review; the game hangs the same thing on the same seat.
export const HELD = {
  knife: { r: 0.011, below: 0.03, above: 0.07, parts: (H, R, at) => [{ box: at(0.17), x: R.f, y: R.u, size: [0.032, 0.2, 0.003], color: 0xc9ced4 }] },
  pipe: { r: 0.014, below: 0.06, above: 0.50 },   // (sizes from the real props, props/props.json: the lead pipe 58 cm)
  hammer: { r: 0.015, below: 0.07, above: 0.24, parts: (H, R, at) => [{ box: at(0.24).addScaledVector(R.f, 0.035 - 0.06), x: V().crossVectors(R.u, R.f), y: R.u, size: [0.032, 0.032, 0.12], color: 0x3c4046 }] },
  crowbar: { r: 0.011, below: 0.08, above: 0.50, parts: (H, R, at) => [{ cyl: [at(0.50), at(0.53).addScaledVector(R.f, 0.05)], r: 0.011, color: 0x9a2a22 }] },
  axe: { r: 0.017, below: 0.12, above: 0.76, two: -0.095, parts: (H, R, at) => [{ box: at(0.72).addScaledVector(R.f, 0.05), x: R.f, y: R.u, size: [0.20, 0.09, 0.02], color: 0x9a2a22 }] },
  bottle: { r: 0.04, below: 0.10, above: 0.11, color: 0x6fa8c8, parts: (H, R, at) => [{ cyl: [at(0.11), at(0.16)], r: 0.013, color: 0x6fa8c8 }] },
  bar: { box: [0.035, 0.15, 0.012], shift: 0.036, color: 0xc9a227 },   // (held near its bottom end: shift moves it up the thumb side)
  pills: { r: 0.018, below: 0.04, above: 0.04, color: 0xd88a2a },
  walkie: { box: [0.062, 0.165, 0.042], color: 0x24262a, parts: (H, R, at) => [{ cyl: [at(0.0825), at(0.25)], r: 0.005, color: 0x24262a }] },
  recorder: { box: [0.05, 0.11, 0.02], color: 0x24262a },
  // the tissue sample's scalpel, held like a pen
  scalpel: { r: 0.006, below: 0.02, above: 0.075, color: 0xc9ced4, parts: (H, R, at) => [{ box: at(0.095), x: R.f, y: R.u, size: [0.01, 0.03, 0.0015], color: 0xe2e6ea }] },
  // THE THROWABLES (Oct 23 2026): in the hand through the throw and gone at the release — the game
  // spawns the thing in flight at RELEASE[clip]. A molotov is a bottle with a rag in its neck, the
  // noisemaker an alarm clock taped to a can, the pipe bomb a capped pipe with a fuse
  molotov: { r: 0.039, below: 0.07, above: 0.09, color: 0x4f6b2e, throw: true, parts: (H, R, at) => [{ cyl: [at(0.09), at(0.15)], r: 0.013, color: 0x4f6b2e }, { cyl: [at(0.15), at(0.2).addScaledVector(R.f, 0.02)], r: 0.011, color: 0xd8cfb8 }] },
  noisemaker: { box: [0.075, 0.1, 0.065], color: 0x9a3030, throw: true, parts: (H, R, at) => [{ cyl: [at(0.05), at(0.085)], r: 0.032, color: 0xc0c4c8 }, { box: at(0.0), x: R.f, y: R.u, size: [0.078, 0.025, 0.068], color: 0x555555 }] },
  pipebomb: { r: 0.032, below: 0.11, above: 0.11, color: 0x6a6e72, throw: true, parts: (H, R, at) => [{ cyl: [at(-0.125), at(-0.105)], r: 0.037, color: 0x3c4046 }, { cyl: [at(0.105), at(0.125)], r: 0.037, color: 0x3c4046 }, { cyl: [at(0.125), at(0.17).addScaledVector(R.f, 0.03)], r: 0.003, color: 0x222222 }] },
};
// when a throw lets go, by its clip (where the hand passes the head moving forward fastest: measured
// off Eric's hand_r, scratchpad release.cjs)
export const RELEASE = { "ual2-overhandthrow": 0.36, "mx-throw-object": 2.45 };
// and a throw that starts by picking the thing up off the floor has it only from the grab
export const PICKUP = { "mx-throw-object": 1.05 };
export const HELD_CLIPS = {
  knife: ["mx-stabbing", "ual2-sword-regular-a", "ual2-sword-regular-b", "ual2-sword-regular-c", "ual1-sword-idle", "ual2-melee-hook", "ual2-melee-hook-rec"],
  ...Object.fromEntries(["pipe", "hammer", "crowbar"].map((k) => [k, ["ual2-sword-regular-a", "ual2-sword-regular-a-rec", "ual2-sword-regular-b", "ual2-sword-regular-b-rec", "ual2-sword-regular-c", "ual2-sword-regular-combo",
    "ual2-melee-hook", "ual2-melee-hook-rec", "mx-standing-melee-attack-downward", "mx-standing-melee-attack-horizontal", "ual1-sword-attack", "ual1-sword-idle", "ual2-sword-block"]])),
  // (the chop only: the sword idle, heavy combo and horizontal sweep are one-handed, and a left hand
  // forced onto the handle took the left arm 12-18 cm through the chest — measured on three bodies)
  axe: ["ual2-treechopping-loop"],
  // (not the bottle, the bar or the pills on ual2-consume: that clip lifts a hand to the chin and drops it in
  // 1.3 s, and nothing reaches the mouth — drinking and eating are built moves, like the can)
  walkie: ["ual2-idle-talkingphone-loop"], recorder: ["ual2-idle-talkingphone-loop"],
  ...Object.fromEntries(["molotov", "noisemaker", "pipebomb"].map((k) => [k, Object.keys(RELEASE)])),
  scalpel: ["ual1-fixing-kneeling"],
};
// the held thing's shape (a signed distance) and its handle alone, in this hand as it is now
export function heldShapes(R, o) {
  const H = R.hold(o.box ? o.box[2] / 2 : o.r), at = (k) => H.clone().addScaledVector(R.u, k);
  const handle = o.box ? boxSdf(at(o.shift ?? 0), R.f, R.u, [o.box[0], o.box[1], o.box[2]]) : capsule(at(-o.below), at(o.above), o.r);
  return { H, at, handle };
}
function heldFrame(o, clip) {
  const rel = o.throw ? RELEASE[clip] : null;
  return (h, t) => {
    // (a throw lets go at its release: after it the fingers open out of the fist, quickly)
    if (rel != null && t > rel) { const k = h.ease(t, rel, rel + 0.12); h.relaxHand("r", 0.25, {}, k); return; }
    const pick = o.throw ? PICKUP[clip] : null;
    if (pick != null && t < pick - 0.12) return;
    // (A BROAD CHEST: the axe brought in over the head. At the top of the chop the axe is over the right shoulder
    // and the left hand on its handle; on Manuel's and Rollo's chests the left arm couldn't cross to it without
    // going 12-20 cm through. People chop with the axe over the middle of the head anyway, so the right hand —
    // and the axe with it — slides toward the body's midline, only as far as the left arm needs to clear, the
    // grip's angle kept. Carried between frames and easing back, so it never pops; nothing moves on a body
    // that was already clear)
    if (o.two && h.armClip && !h.free && (pick == null || t >= pick)) {
      const hp0 = h.at("hand_r"), R0 = h.hand("r"), f0 = R0.f.clone(), p0 = R0.p.clone();
      const toward = h.at("head").sub(hp0); toward.y = 0; const span = toward.length(); toward.normalize();
      const pole = h.at("lowerarm_r").clone().addScaledVector(unit(h.at("lowerarm_r").sub(h.at("upperarm_r").lerp(hp0, 0.5))), 0.2);
      const grip2 = () => { const R2 = h.hand("r"), sh = heldShapes(R2, o); gripBar(h, "l", sh.at(o.two), R2.u, 1, 1, {}, null, null, { r: o.r, sdf: sh.handle, wrap: { thumb: 1.2 } }); };
      const place = (sv) => { if (sv > 0) { h.reach("r", hp0.clone().addScaledVector(toward, sv), 1, pole); h.orient("r", f0, p0, 1); } grip2(); };
      const maxS = Math.min(0.24, span);
      let sv = Math.min(maxS, (h.axeShift ?? 0) * 0.85);
      place(sv);
      for (let k = 0; k < 10 && h.armClip("l") > 0 && sv < maxS; k++) { sv = Math.min(maxS, sv + 0.025); place(sv); }
      h.axeShift = sv;
    }
    const R = h.hand("r"), { at, handle } = heldShapes(R, o);
    // the second hand up the handle (the fire axe), when the clip has it near: like a gun's support hand
    if (o.two) {
      // (on the handle THROUGHOUT: a fire axe is a two-handed tool, and the clips it rides are one-handed —
      // the chop's left hand never came near the handle, and the axe swung in one hand)
      const P = at(o.two);
      let w = 1;
      if (!h.free) { const was = h.supW ?? w; w = was + Math.max(-0.125, Math.min(0.125, w - was)); h.supW = w; }
      if (w > 0) gripBar(h, "l", P, R.u, w, 1, {}, null, null, { r: o.r, sdf: handle, wrap: { thumb: 1.2 } });
      if (h.grip) h.grip.l = w;
    }
    const wk = pick != null ? h.ease(t, pick - 0.12, pick) : 1;
    h.wrap("r", handle, { thumb: 1.2, open: -0.6, w: wk });
    held(h, "r", wk);
  };
}
for (const [k, clips] of Object.entries(HELD_CLIPS)) for (const clip of clips) RECIPES0[`hd:${k}:${clip}`] = { base: clip, dur: "base", id: `hd-${k}-${clip}`, held: k, release: HELD[k].throw ? RELEASE[clip] : null, pickup: HELD[k].throw ? PICKUP[clip] ?? null : null, frame: heldFrame(HELD[k], clip) };

// TO THE MOUTH (Oct 23 2026): drinking, eating and taking pills are BUILT moves — no clip we have brings a
// hand to the mouth with something in it (ual2-consume lifts a hand to the chin and drops it in 1.3 s).
// The thing is in the right hand from the first frame; the hand comes up by way of the front, the thing
// is turned so its END is at the lips (a bottle's neck tipped back, a bar's end, a pill bottle's mouth),
// and the head goes back to meet a tipped bottle. The thing's axis is the hand's thumb side: tipped, the
// little finger rises and the thumb points at the face, as anyone tips a bottle
const MOUTH = {
  // end: how far up the thumb side the end that goes in the mouth is; tilt: degrees from upright, held at
  // the mouth (a bottle tips further as it empties); at: [arrive, leave] seconds
  bottle: { dur: 4.2, at: [1.15, 2.85], tilt: [70, 105], end: 0.165, head: 16, sips: [] },
  // (a bar comes up from below at an angle, its top end in the mouth and the hand under the chin: held
  // level, the knuckles covered the face)
  bar: { dur: 4.0, at: [1.05, 2.75], tilt: [52, 52], end: 0.111, head: -4, sips: [1.45, 2.15], up: -0.018, across: true },
  pills: { dur: 3.4, at: [1.0, 1.95], tilt: [70, 100], end: 0.045, head: 12, sips: [] },
};
function toMouth(kind) {
  const o = HELD[kind], m = MOUTH[kind];
  return (h, t) => {
    const F = h.frame();
    const up = h.ease(t, 0.25, m.at[0]), down = h.ease(t, m.at[1], m.at[1] + 0.85), w = up * (1 - down);
    const at = h.ease(t, m.at[0] - 0.15, m.at[0] + 0.1) * (1 - h.ease(t, m.at[1] - 0.25, m.at[1] + 0.1));   // at the lips
    const bite = m.sips.reduce((a, s2) => a + h.pulse(t, s2, 0.08, 0.25), 0);
    // the head tips back to a tipped thing, and dips a little into a bite
    h.turn("neck", "x", -0.4 * m.head * at + 3 * bite); h.turn("head", "x", -0.6 * m.head * at + 4 * bite + 4 * w * (1 - at));
    const tilt = (m.tilt[0] + (m.tilt[1] - m.tilt[0]) * h.ease(t, m.at[0], m.at[1] - 0.2)) * Math.PI / 180;
    const k = h.ease(t, 0.25, m.at[0]) * (1 - down), th = tilt * k;                      // (upright at the side, tipped at the lips)
    const u = unit(UP().multiplyScalar(Math.cos(th)).addScaledVector(F.fwd, -Math.sin(th)));
    // the palm faces across the body at the thing from its right, as a bottle is held upright; tipping it
    // turns the hand about that same line, so the fingers go from pointing forward to pointing up
    // (u = f x p for the right hand, so p = u x f)
    // (a bar is held like a microphone instead: the fingers round it across the body, the palm toward
    // the chest, the hand under the chin — with the fingers up its side they rose over the nose)
    const f0 = m.across ? dirOf([F.right, -1], [F.fwd, 0.3]) : dirOf([F.fwd, Math.cos(th)], [UP(), Math.sin(th)], [F.right, -0.25]);
    const f = unit(f0.addScaledVector(u, -f0.dot(u))), pa = unit(V().crossVectors(u, f));
    const lips = h.ahead(h.at("head"), 0.10, 0.012 + (m.up ?? 0), 0.005);   // (the head bone sits at the skull's base, about level with the mouth)
    const end = lips.clone().addScaledVector(u, 0.012 * bite).addScaledVector(F.fwd, 0.012 * (1 - at));   // (a bite pushes the end in)
    // (the END is what is steered: on the way up and down it travels in front of the chest, never
    // through it — the cough's rule; the hold point is the end less the thing's own length)
    const target = viaFront(h, end, w, "r"), rr = o.box ? o.box[2] / 2 : o.r;
    if (w > 0) for (let i = 0; i < 2; i++) {
      h.reach("r", h.wristFor("r", target.clone().addScaledVector(u, -m.end), f, pa, rr), Math.min(1, w * 2.5), h.ahead(h.at("upperarm_r"), 0.15, -0.55, 0.3));
      h.orient("r", f, pa, Math.min(1, w * 2.5));
    }
    const { handle } = heldShapes(h.hand("r"), o);
    h.wrap("r", handle, { thumb: 1.2, open: -0.6 });
    held(h, "r", 1);
  };
}
// READING A NOTE (Oct 23 2026): a sheet held up in both hands at the chest, tipped back to face the
// eyes, the fingers behind it and the thumbs on its front; the head bowed to it and drifting down the
// page as the lines go. The page is placed off the body (its middle, its face) and both hands pinch its
// side edges a little below the middle — the review draws it from the two hands the same way
export const NOTE = { w: 0.148, h: 0.21, out: 0.34, down: 0.31, lean: 34, pinch: 0.035, low: 0.035, behind: 0.3 };
function notePlane(at, F) {
  // (off the head bone and the body's first-frame facing, so the bake and the review draw (ctx.at) agree)
  const head = at("head"), C = head.clone().addScaledVector(F.fwd, NOTE.out).addScaledVector(UP(), -NOTE.down).addScaledVector(F.right, 0.01);
  const a = NOTE.lean * Math.PI / 180, n = unit(F.fwd.clone().multiplyScalar(-Math.cos(a)).addScaledVector(UP(), Math.sin(a)));   // (its face, toward the reader)
  const v = unit(V().crossVectors(n, F.right));                                                                               // (up the page)
  return { C, n, v, right: F.right.clone() };
}
// (where the sheet is at t: up in both hands while they hold it; on the way up and down, hanging from
// the right hand's pinch — one function for the bake's solid and the review's drawing)
export function notePose(at, F, R, t) {
  const { C, v, right } = notePlane(at, F), k = ease(t, 0.2, 0.95) * (1 - ease(t, 4.25, 5.0));
  if (k > 0.999) return { C, x: right, y: v };
  const mid = R.fist.clone().addScaledVector(R.f, 0.03).addScaledVector(UP(), -NOTE.h / 2 + 0.03);
  return { C: C.clone().lerp(mid, 1 - k), x: right, y: v.clone().lerp(UP(), 1 - k) };
}
RECIPES0.note = {
  base: "ual1-idle-loop", dur: 5.2, once: true,
  solid: (h, t) => { const { C, x, y } = notePose(h.at, h.homeFrame(), h.hand("r"), t); return boxSdf(C, x, unit(y.clone().addScaledVector(x, -y.dot(x))), [NOTE.w, NOTE.h, 0.0015]); },
  frame(h, t) {
    const w = h.ease(t, 0.2, 0.95) * (1 - h.ease(t, 4.25, 5.0)), read = h.ease(t, 1.0, 4.0);
    h.turn("neck", "x", 10 * w); h.turn("head", "x", (12 + 7 * read) * w); h.turn("spine_02", "x", 3 * w);
    const { C, n, v, right } = notePlane(h.at, h.homeFrame());
    for (const [side, s] of [["l", -1], ["r", 1]]) {
      const inward = right.clone().multiplyScalar(-s);
      const edge = C.clone().addScaledVector(right, s * (NOTE.w / 2 - NOTE.pinch)).addScaledVector(v, -NOTE.low).addScaledVector(n, -0.007);   // (the fingertip just behind the sheet)
      // (the palm toward the sheet's EDGE, the fingers up behind it and the thumb round onto its face —
      // with the palm turned to the reader the wrists bent back 90 degrees)
      const fingers = unit(v.clone().addScaledVector(n, -NOTE.behind)), palm = dirOf([inward, 1], [n, 0.35]);
      tipTo(h, side, "middle", edge, fingers, palm, w, 0.22, { thumb: 0.6, index: 0.15, ring: 0.3, pinky: 0.4 }, h.ahead(h.at("upperarm_" + side), 0.05, -0.5, 0.3 * s));
      held(h, side, w);
    }
  },
};
// THROWING A BREAKER (Oct 23 2026): a lever on a wall box at shoulder height. The hand comes up and
// closes round the lever's bar, pulls it down through its arc with the body dipping into it, lets go
export const BREAKER = { pivot: [0.5, 0.36, 0.16], arm: 0.13, from: 65, to: -55, bar: 0.012 };
function breakerHandle(h, k) {
  const F = h.homeFrame(), P = h.home(...BREAKER.pivot), a = (BREAKER.from + (BREAKER.to - BREAKER.from) * k) * Math.PI / 180;
  return P.addScaledVector(UP(), BREAKER.arm * Math.sin(a)).addScaledVector(F.fwd, -BREAKER.arm * Math.cos(a));
}
// (the grip sticks out to the right from the lever arm's end, an L: centred on the arm, the arm ran
// through the hand)
const breakerBar = (h, at) => { const R = h.homeFrame().right; return capsule(at.clone().addScaledVector(R, 0.005), at.clone().addScaledVector(R, 0.105), BREAKER.bar); };
RECIPES0.breaker = {
  base: "ual1-idle-loop", dur: 3.4, once: true,
  solid: (h, t) => breakerBar(h, breakerHandle(h, h.ease(t, 1.1, 1.75))),
  frame(h, t) {
    const F = h.homeFrame(), w = h.ease(t, 0.2, 0.95) * (1 - h.ease(t, 2.5, 3.2));
    const pull = h.ease(t, 1.1, 1.75), heave = h.pulse(t, 1.45, 0.3, 0.35);
    h.turn("spine_01", "x", 5 * heave); h.turn("neck", "x", -4 * w); h.turn("head", "x", -6 * w + 5 * pull);
    h.move("hip", UP().multiplyScalar(-0.035 * heave));
    const at = breakerHandle(h, pull);
    // (the fingers close on the lever's own bar where it is, not on a bar placed in the hand)
    const bar = breakerBar(h, at), mid = at.clone().addScaledVector(F.right, 0.055);
    // (overhand, as a lever is pulled down: the hand on top of the bar, the fingers over it toward the
    // wall and round its far side, the thumb along it toward the body's middle — from the forearm's way,
    // gripBar came at it palm-up from below, a waiter's tray)
    grip(h, "r", mid, dirOf([F.fwd, 1], [UP(), -0.35 - 0.4 * pull]), dirOf([UP(), -1], [F.fwd, -0.15]), w, 1, {}, h.ahead(h.at("upperarm_r"), -0.05, -0.5, 0.35), { r: BREAKER.bar, sdf: bar, wrap: { thumb: 1.2 } });
  },
};
// TURNING A WALKIE DOWN (Oct 23 2026): the walkie up at the chest in the right hand, the left forefinger
// onto the knob on its top, a turn of the knob (the hand rolls a little), the walkie lowered
RECIPES0["walkie-down"] = {
  base: "ual1-idle-loop", dur: 3.2, once: true, held: "walkie",
  frame(h, t) {
    const F = h.frame(), w = h.ease(t, 0.2, 0.8) * (1 - h.ease(t, 2.4, 3.0)), wl = h.ease(t, 0.55, 1.05) * (1 - h.ease(t, 2.0, 2.45));
    const turn = h.ease(t, 1.2, 1.8);
    h.turn("neck", "x", 8 * w); h.turn("head", "x", 10 * w);
    const o = HELD.walkie, at = h.ahead(h.at("spine_03"), 0.3, -0.1, 0.06);
    const u = unit(UP().addScaledVector(F.fwd, -0.25)), fw = dirOf([F.right, -1], [F.fwd, 0.35]), f = unit(fw.addScaledVector(u, -fw.dot(u))), pa = unit(V().crossVectors(u, f));
    for (let i = 0; i < 2; i++) { h.reach("r", h.wristFor("r", at, f, pa, o.box[2] / 2), w, h.ahead(h.at("upperarm_r"), 0.1, -0.5, 0.3)); h.orient("r", f, pa, w); }
    const R = h.hand("r"), { H, handle } = heldShapes(R, o);
    h.wrap("r", handle, { thumb: 1.2, open: -0.6 }); held(h, "r", 1);
    // the knob: on the top, toward the back corner; the forefinger tip on its side, rolling it
    const knob = H.clone().addScaledVector(R.u, o.box[1] / 2 + 0.012).addScaledVector(R.f, -0.012).addScaledVector(R.p, -0.006);
    const tip = knob.clone().addScaledVector(F.right, 0.012).addScaledVector(F.fwd, -0.008 * turn);
    // (the left hand comes up from below and to the left, the forefinger up the knob's side and the
    // palm toward the walkie — laid over the top from the left, the elbow rose over the face)
    tipTo(h, "l", "index", tip, dirOf([UP(), 0.75], [F.right, 0.55], [F.fwd, 0.25]), dirOf([F.right, 0.75], [F.fwd, -0.25], [UP(), -0.2]), wl, 0.55, { index: 0.05, thumb: 0.45 }, h.ahead(h.at("upperarm_l"), 0.05, -0.55, -0.3));
  },
};
// DOZING ON WATCH (Oct 23 2026): sat, the head drifting down in two slow nods the eyes fight, the
// shoulders sinking with it; then the jolt — head snapped up, the back straightening, shoulders up —
// and a breath of looking about before settling
RECIPES0.doze = {
  base: "ual1-sitting-idle-loop", dur: 8.0, once: true,
  frame(h, t) {
    const nod1 = h.ease(t, 0.6, 2.4) * (1 - 0.6 * h.ease(t, 2.4, 2.9)), nod2 = h.ease(t, 3.0, 5.2);
    const sink = Math.max(nod1, nod2) * (1 - h.ease(t, 5.25, 5.45));
    const jolt = h.pulse(t, 5.35, 0.05, 0.45), look = h.ease(t, 5.6, 6.2) * (1 - h.ease(t, 6.9, 7.6));
    h.turn("head", "x", 30 * sink - 6 * jolt); h.turn("neck", "x", 16 * sink - 4 * jolt);
    h.turn("spine_03", "x", 6 * sink - 3 * jolt); h.turn("spine_02", "x", 4 * sink - 2 * jolt);
    h.turn("shoulder_l", "z", -3 * sink + 5 * jolt); h.turn("shoulder_r", "z", 3 * sink - 5 * jolt);
    h.turn("head", "y", 22 * look * Math.sin((t - 5.6) * 2.4));
  },
};
// REFILLING A BOTTLE AT A SINK (Oct 23 2026): a counter at hip height in front, the tap at its back.
// The left hand holds the bottle under the spout, the right turns the tap on, they wait while it
// fills, the right turns it off, the bottle comes away
export const SINK = { counter: [0.42, 0.0, 0.0], spout: [0.5, 0.2, 0.0], tap: [0.56, 0.12, 0.12] };
RECIPES0.sink = {
  base: "ual1-idle-loop", dur: 7.0, once: true, held: "bottle", heldSide: "l",
  frame(h, t) {
    const F = h.homeFrame(), wl = h.ease(t, 0.3, 1.1) * (1 - h.ease(t, 5.8, 6.7));
    const on = h.ease(t, 1.2, 1.6) * (1 - h.ease(t, 1.9, 2.3)) + h.ease(t, 4.8, 5.2) * (1 - h.ease(t, 5.4, 5.8));
    const twist = h.ease(t, 1.45, 1.75) * (1 - h.ease(t, 4.95, 5.25));
    h.turn("spine_01", "x", 8 * wl); h.turn("neck", "x", 10 * wl); h.turn("head", "x", 12 * wl);
    // the bottle, its open neck under the spout, upright
    const o = HELD.bottle, top = h.home(...SINK.spout).addScaledVector(UP(), -0.035), hold = top.clone().addScaledVector(UP(), -o.above - 0.05);
    const f = dirOf([F.right, 1], [F.fwd, 0.3]), pa = unit(V().crossVectors(f, UP()));   // (left hand: u = p x f, so p = f x u)
    for (let i = 0; i < 2; i++) { h.reach("l", h.wristFor("l", hold, f, pa, o.r), wl, h.ahead(h.at("upperarm_l"), 0.05, -0.5, -0.3)); h.orient("l", f, pa, wl); }
    const L = h.hand("l"), { handle } = heldShapes(L, o);
    h.wrap("l", handle, { thumb: 1.2, open: -0.6 }); held(h, "l", 1);
    // the tap: a cross handle, the hand round it from above, turned a quarter
    const tap = h.home(...SINK.tap), a = twist * 1.2;
    const tf = unit(F.fwd.clone().multiplyScalar(Math.cos(a)).addScaledVector(F.right, -Math.sin(a)).addScaledVector(UP(), -0.4));
    grip(h, "r", tap.clone().addScaledVector(UP(), 0.03), tf, UP().negate(), on, 0.7, { thumb: 0.5 }, h.ahead(h.at("upperarm_r"), 0.0, -0.5, 0.3));
  },
};
// THE ARM WOUND (Oct 23 2026): the hurt LEFT arm carried — the forearm across the belly, the hand
// loose at the right hip, the elbow tucked — on the injured walk; and shooting with the other hand:
// the pistol clips one-handed ("gp:1h:<clip>"), the hurt arm held the same way
function hurtArm(h, w = 1, fresh = false) {
  if (w <= 0) return;
  if (fresh) h.restArm("l");
  // (the hand off the body's OWN front, stepped out until it clears it by a hand's thickness: a fixed
  // 20 cm in front of the spine put Rollo's sleeve 17 cm through the man inside his suit)
  // (never nearer than the 20 cm that was clean on the others: started at 16, Eric's arm tucked tighter
  // across his chest and went 8 cm into it)
  const at = h.ahead(h.at("spine_01"), 0.26, 0.02, 0.1), surf = h.torso(), F0 = h.frame().fwd;   // (0.2 left Rollo's puffy sleeve 17 cm into the man inside)
  for (let k = 0; k < 20 && surf.inside(at) > -0.07; k++) at.addScaledVector(F0, 0.01);
  const pole = h.ahead(h.at("upperarm_l"), 0.02, -0.5, -0.15);
  h.reach("l", at, w, pole);
  // (and the FOREARM clear too, not just the hand: on Manuel's and Rollo's builds, leaning into a one-handed
  // aim, the hand cleared the belly while the forearm crossed it, 7-17 cm in for the whole clip)
  for (let k = 0; k < 12; k++) {
    const deep = Math.max(...[0.3, 0.55, 0.8].map((q) => surf.inside(h.at("lowerarm_l").lerp(h.at("hand_l"), q))));
    if (deep < -0.04) break;
    at.addScaledVector(F0, Math.max(0.01, deep + 0.05) * 0.5); h.reach("l", at, w, pole);
  }
  // (the hand in line with the forearm, palm to the belly: a hurt wrist isn't cocked — turned to a set
  // direction, it bent 70 degrees)
  const fa = unit(h.at("hand_l").sub(h.at("lowerarm_l")));
  h.orient("l", fa, dirOf([h.frame().fwd, -1], [UP(), 0.2]), w);
  h.relaxHand("l", 0.35, {}, w);
}
RECIPES0["arm-wound-walk"] = { base: "mx-male-injured-pack--injured-walk", dur: "base", frame: (h) => hurtArm(h, 1) };
RECIPES0["arm-wound-idle"] = { base: "mx-male-injured-pack--injured-idle", dur: "base", frame: (h) => hurtArm(h, 1) };
for (const clip of ["ual1-pistol-idle-loop", "ual1-pistol-aim-neutral", "ual1-pistol-shoot", "mx-pistol-handgun-locomotion-pack--pistol-walk"])
  RECIPES0[`gp:1h:${clip}`] = { base: clip, dur: "base", gun: "pistol", id: `gp-1h-${clip}`, frame: (h) => { h.cup = false; gunFit(h, "pistol"); hurtArm(h, 1, true); } };
RECIPES0.comforted = {
  base: "ual1-idle-loop", dur: 6, once: true,
  frame(h, t) {
    const w = h.ease(t, 0.2, 1.0) * (1 - h.ease(t, 4.8, 5.8)), wipe = h.ease(t, 1.8, 2.3) * (1 - h.ease(t, 3.0, 3.5));
    const shudder = (h.pulse(t, 2.0, 0.08, 0.25) + 0.6 * h.pulse(t, 3.9, 0.08, 0.25)) * w;
    h.turn("head", "x", 22 * w + 3 * shudder); h.turn("neck", "x", 10 * w); h.turn("spine_03", "x", 5 * w + 2 * shudder);
    h.turn("shoulder_l", "z", -3 * w + 3 * shudder); h.turn("shoulder_r", "z", 3 * w - 3 * shudder);
    // the back of the left wrist to the eyes, once
    const eyes = h.ahead(h.at("head"), 0.13, 0.07, -0.02);
    h.reach("l", viaFront(h, eyes.clone().addScaledVector(h.frame().fwd, 0.02), wipe, "l"), Math.min(1, wipe * 2.5), h.ahead(h.at("upperarm_l"), 0.15, -0.5, -0.25));
    h.orient("l", dirOf([h.frame().right, 1], [UP(), 0.5]), dirOf([h.frame().fwd, -1]), wipe);
    h.relaxHand("l", 0.45, {}, wipe);
  },
};
export const MERCY = { clip: "mx-sitting-idle", head: 0.09, tremble: 0.6, reach: 0.85 };
// THE MERCY KILL: from the pistol's level aim, the shooter LEANS forward from the waist (spread over the
// spine) until the barrel's line meets the sitting partner's head about MERCY.reach out — the aim-down
// clip pointed nearly straight down and sat the partner against the shooter's shins. The lean is found
// once and held; the partner is placed with its head on the line, facing the shooter
function mercy(h, t) {
  const P = h.partner; if (!P?.pose) throw new Error("the mercy kill is baked for a pair: anim-build.cjs --hug");
  h.cup = true;
  const lean = (deg) => { h.turn("spine_01", "x", deg * 0.35); h.turn("spine_02", "x", deg * 0.35); h.turn("spine_03", "x", deg * 0.3); h.turn("head", "x", deg * 0.15); };
  const p0 = P.pose(MERCY.clip, 0), headY = p0.at("head").y + MERCY.head;
  // (each try from the same start: fitting the gun twice in a frame compounds, so the arms, the lean and
  // the support hand's eased weight are put back after every try)
  if (h.mercyLean == null) {
    const rr = h.save("r"), rl = h.save("l"), st = { supW: h.supW, supAt: h.supAt };
    let found = 40;
    for (let deg = 0; deg <= 40; deg += 2) {
      lean(deg);
      const { G, hold } = gunFit(h, "pistol"), M = G.at(hold.muzzle), d = G.Z.clone().normalize();
      const reach = d.y < -0.02 ? ((M.y - headY) / -d.y) * Math.hypot(d.x, d.z) : Infinity;
      rr(); rl(); lean(-deg); h.supW = st.supW; h.supAt = st.supAt;
      if (reach <= MERCY.reach) { found = deg; break; }
    }
    h.mercyLean = found;
  }
  lean(h.mercyLean);
  h.turn("spine_03", "x", MERCY.tremble * Math.sin(t * 9.1) + 1.2 * Math.sin(t * 1.7)); h.turn("upperarm_r", "z", MERCY.tremble * Math.sin(t * 11.3 + 0.7));
  const { G, hold } = gunFit(h, "pistol");
  if (!h.pairPlace) {
    const M = G.at(hold.muzzle), d = G.Z.clone().normalize(), s2 = d.y < -0.02 ? (M.y - headY) / -d.y : 1, at = M.clone().addScaledVector(d, s2);
    const dh = d.clone(); dh.y = 0; dh.normalize();
    const yaw = Math.atan2(-dh.x, -dh.z), cy = Math.cos(yaw), sy = Math.sin(yaw), head0 = p0.at("head");
    const hr = new THREE.Vector3(head0.x * cy + head0.z * sy, head0.y, -head0.x * sy + head0.z * cy);
    h.pairPlace = { x: +(at.x - hr.x).toFixed(3), z: +(at.z - hr.z).toFixed(3), yaw: +((yaw * 180 / Math.PI + 360) % 360).toFixed(1), lean: h.mercyLean };
  }
}
// BANDAGING SOMEONE ELSE: the partner sits on the floor (mx-sitting-idle, its arms round its knees), and
// the wound is the FOREARM lying across its knees — the shin is under those arms. The bandager kneels at
// its side: the left hand steadies the wrist from below, the right takes the roll over the forearm and
// back in arcs, working up it. Both hands' fingers carry on from their forearms, palms to the limb
export const BANDAGE2 = { clip: "mx-sitting-idle", side: "l", along: 0.45, wrapR: 0.045, passes: 3 };
function bandageOther(h, t) {
  const P = h.partner; if (!P?.pose) throw new Error("bandaging is baked for a pair: anim-build.cjs --hug");
  const sd = BANDAGE2.side, limb = (p) => [p.at("lowerarm_" + sd), p.at("hand_" + sd)];
  const mid = () => h.at("hand_l").add(h.at("hand_r")).multiplyScalar(0.5);
  if (!h.pairPlace) {
    // the forearm's middle under the clip's working hands, the partner turned so its body is clear of
    // this body's knees and the forearm runs across this body's front
    const hands = h.peek("ual1-fixing-kneeling", 1.5, () => mid());
    const p0 = P.pose(BANDAGE2.clip, 0), [e0, w0] = limb(p0), S0 = e0.clone().lerp(w0, BANDAGE2.along);
    let best = null;
    for (let yd = 0; yd < 360; yd += 10) {
      const r = yd * Math.PI / 180, c = Math.cos(r), s3 = Math.sin(r), rot = (v) => new THREE.Vector3(v.x * c + v.z * s3, v.y, -v.x * s3 + v.z * c);
      const off = hands.clone().sub(rot(S0)); off.y = 0;
      const hip = rot(p0.at("hip")).add(off), clear = Math.hypot(hip.x - h.at("hip").x, hip.z - h.at("hip").z);
      const cost = Math.max(0, 0.6 - clear) * 10 + Math.abs(rot(w0.clone().sub(e0)).normalize().dot(h.homeFrame().fwd)) + Math.max(0, hands.y - S0.y - 0.15);
      if (!best || cost < best.cost) best = { cost, off, yd };
    }
    h.pairPlace = { x: +best.off.x.toFixed(3), z: +best.off.z.toFixed(3), yaw: best.yd };
  }
  const p = P.pose(BANDAGE2.clip, t, h.pairPlace), [e, wr] = limb(p);
  const ax = unit(wr.clone().sub(e)), S = e.clone().lerp(wr, BANDAGE2.along);
  const w = h.ease(t, 0.3, 1.0) * (1 - h.ease(t, 5.0, 5.7));
  const u = unit(V().crossVectors(ax, UP())), v2 = unit(V().crossVectors(u, ax));
  const put = (side, at, close) => {
    const toward = unit(S.clone().addScaledVector(ax, at.clone().sub(S).dot(ax)).sub(at));
    h.reach(side, at.clone().addScaledVector(toward, -0.05), w, h.ahead(h.at("upperarm_" + side), 0.1, -0.45, side === "r" ? 0.3 : -0.3));
    const fa = unit(h.at("hand_" + side).sub(h.at("lowerarm_" + side))); fa.addScaledVector(toward, -fa.dot(toward)).normalize();
    h.orient(side, fa, toward, w * 0.5); h.relaxHand(side, close, {}, w);
  };
  // the wrist steadied from below
  const under = wr.clone().addScaledVector(ax, -0.03).addScaledVector(v2, -(BANDAGE2.wrapR + 0.02));
  put("l", under, 0.5);
  // the roll over the forearm and back, a little further up it each pass
  const passes = h.ease(t, 1.0, 5.0) * BANDAGE2.passes, ang = Math.PI / 2 + 0.75 * Math.sin(passes * Math.PI * 2);   // (an arc of about 85 degrees each way: wider, the wrist rolled past real ones at its ends)
  const at = S.clone().addScaledVector(ax, -0.05 * passes / BANDAGE2.passes).addScaledVector(u, Math.cos(ang) * (BANDAGE2.wrapR + 0.03)).addScaledVector(v2, Math.sin(ang) * (BANDAGE2.wrapR + 0.03));
  put("r", at, 0.5);
}
// THE MERCY KILL (Oct 23 2026): the pistol aimed down at the partner sat on the floor (it plays
  // mx-sitting-idle at built.place, facing the shooter); its head on the barrel's line. The shot is
  // gp-ual1-pistol-shoot from the same place
RECIPES0.mercy = { base: "ual1-pistol-aim-neutral", dur: 4, pair: true, gun: "pistol", choose: [30, 45, 60].flatMap((down) => [0.22, 0.32, 0.42].map((up) => ({ down, up }))), frame: (h, t) => mercy(h, t) };
  // BANDAGING SOMEONE ELSE: kneeling by the partner sat on the floor (mx-sitting-idle at built.place),
  // the left hand holding its shin, the right taking the bandage round it
// PULLING A ZOMBIE OFF SOMEONE (Oct 24 2026): the survivor it's holding plays the pack's breaking-free
// (fz-front-struggle-free), in which the zombie is thrown back ~1.5 m; the rescuer stands at its back-left, takes
// its near shoulder and its collar, and twists to throw it past — its recorded flight carries it by, he lets
// go once it's alongside. zv-pull-off-<zombie> on the rescuer, the zombie placed in his frame (built.place)
export const PULL = { clip: "fz-front-struggle-free", grab: [0.0, 0.18], release: [0.55, 0.8], dur: 2.2, ahead: 0.42, side: 0.62 };   // (side 0.55 left 3.7 cm as it was thrown past his back)
function pullOff(h, t) {
  const P = h.partner; if (!P?.pose) throw new Error("pulling a zombie off is baked against a zombie: anim-build.cjs --zvictim");
  const F = h.homeFrame();
  if (!h.pairPlace) {
    // the zombie's hips ahead of his and to his right, as it holds its victim
    const z0 = P.pose(PULL.clip, PULL.grab[1], { x: 0, z: 0, yaw: 0 }).at("hip"), me = h.peek("ual1-idle-loop", 0, () => h.at("hip"));
    const at = me.clone().addScaledVector(F.fwd, PULL.ahead).addScaledVector(F.right, PULL.side);
    h.pairPlace = { x: +(at.x - z0.x).toFixed(3), z: +(at.z - z0.z).toFixed(3), yaw: 0 };
  }
  const p = P.pose(PULL.clip, t, h.pairPlace), sk = p.into(), core = p.at("spine_03").lerp(p.at("neck"), 0.4);
  const w = h.ease(t, PULL.grab[0], PULL.grab[1]) * (1 - h.ease(t, PULL.release[0], PULL.release[1])), heave = h.ease(t, 0.15, 0.5) * (1 - h.ease(t, 0.7, 1.4));
  // the body into it: turned toward the zombie and leaning back as it heaves
  const toZ = unit(p.at("spine_02").sub(h.at("spine_02")).setY(0));
  const yaw = Math.atan2(V().crossVectors(F.fwd, toZ).y, F.fwd.dot(toZ)) * 180 / Math.PI;
  h.turn("spine_01", "y", 0.35 * yaw * Math.max(w, heave)); h.turn("spine_02", "y", 0.35 * yaw * Math.max(w, heave)); h.turn("spine_03", "y", 0.2 * yaw * Math.max(w, heave));
  h.turn("spine_01", "x", -8 * heave); h.turn("spine_02", "x", -6 * heave);
  lookAt(h, p.at("head"), Math.max(w, heave) * 0.8);
  if (w <= 0) return;
  // the hands on it, on its skin: the right on the top of its near (left) shoulder, the left in its collar
  const onSkin = (q, m) => { const d = unit(q.clone().sub(core)); for (let k = 0; k < 30 && sk(q).d > -m; k++) q.addScaledVector(d, 0.01); return q; };
  const sh = onSkin(p.at("upperarm_l").lerp(p.at("neck"), 0.3).addScaledVector(UP(), 0.06), 0.04);
  const collar = onSkin(p.at("spine_03").lerp(p.at("neck"), 0.6).addScaledVector(unit(h.at("spine_03").sub(p.at("spine_03")).setY(0)), 0.05), 0.04);
  for (const [side, at] of [["r", sh], ["l", collar]]) {
    const toward = unit(core.clone().sub(at));
    h.reach(side, at.clone().addScaledVector(toward, -0.05), w, h.ahead(h.at("upperarm_" + side), 0.1, -0.35, side === "r" ? 0.35 : -0.35));
    h.relaxHand(side, 0.65, {}, w);
  }
  h.armAvoid = (side) => { const a = h.at("upperarm_" + side), b = h.at("lowerarm_" + side), c = h.at("hand_" + side); let s2 = 0; for (const q of [0.5, 0.8, 1].map((k) => a.clone().lerp(b, k)).concat([0.4, 0.7].map((k) => b.clone().lerp(c, k)))) s2 += Math.max(0, sk(q).d + 0.04); return s2; };
}
RECIPES0["pull-off"] = { base: "ual1-idle-loop", dur: PULL.dur, once: true, pair: "victim", frame: (h, t) => pullOff(h, t) };
// THE SHARED BED (Oct 24 2026): two singles pushed together, the two of them on their backs side by side
// (both on the recorded mx-laying-sleeping, so no side-lying has to be invented). bd-bed-<partner>: the one
// nearer the seam's arm across the other's chest, the head turned to them. bd-bed-held-<partner>: the head
// turned to them, the near hand up on the arm across its chest. The partner lies BED.apart to this body's
// right, parallel (built.place); the game raises both to the mattress
export const BED = { clip: "mx-laying-sleeping", apart: 0.6, dur: 8 };
const bedPlace = (h) => {
  // across the body, at the chest: the side the partner lies on (this body's right as it lies)
  const hip = h.peek(BED.clip, 0, () => h.at("hip")), neck = h.peek(BED.clip, 0, () => h.at("neck")), sh = h.peek(BED.clip, 0, () => h.at("upperarm_r").sub(h.at("upperarm_l")));
  const along = unit(neck.clone().sub(hip).setY(0)); let across = unit(V().crossVectors(along, UP())); if (across.dot(sh) < 0) across.negate();
  return { x: +(across.x * BED.apart).toFixed(3), z: +(across.z * BED.apart).toFixed(3), yaw: 0 };
};
// (where a survivor's face points, from the head bone's own turn — taken standing, in the idle; lying down the
// crown of the head points along the body, so "turn the head to them" aimed with it turned it away)
const sface = (h) => {
  h.sFace ??= h.peek("ual1-idle-loop", 0, () => { const q = h.quat("head").invert(); return h.homeFrame().fwd.clone().applyQuaternion(q); });
  return h.sFace.clone().applyQuaternion(h.quat("head"));
};
const lookAt = (h, target, w) => solveTo(h, () => h.at("head").addScaledVector(sface(h), 0.12), target, [["neck", "x", 25], ["neck", "y", 25], ["neck", "z", 25], ["head", "x", 20], ["head", "y", 20], ["head", "z", 20]], w, 12);   // (all three axes: lying on the back the face points UP, and a turn about the vertical can't swing it sideways)
function bedArm(h, t) {
  const P = h.partner; if (!P?.pose) throw new Error("the shared bed is baked for a pair: anim-build.cjs --hug");
  h.pairPlace ??= bedPlace(h);
  const p = P.pose(BED.clip, t, h.pairPlace), sk = p.into();   // (the partner as recorded: its own half only turns the head and lifts a hand, the chest stays put)
  const w = h.ease(t, 0.4, 1.6) * (1 - h.ease(t, BED.dur - 1.2, BED.dur - 0.1)), breathe = 0.01 * Math.sin(t * 2 * Math.PI / 4.2);
  // the right arm over the partner's chest: the hand on its far side of the sternum, a palm's thickness off the skin
  // (the lower chest, the hand past the middle on the far side: at the top of the sternum the arm lay across her neck)
  const chest = p.at("spine_02").lerp(p.at("spine_03"), 0.35), up = UP();
  const out = (q, m) => { for (let k = 0; k < 30 && sk(q).d > -m; k++) q.addScaledVector(up, 0.01); return q; };
  const hand = out(chest.clone().addScaledVector(unit(p.at("upperarm_r").sub(p.at("upperarm_l"))), 0.07), 0.08).addScaledVector(up, breathe);
  h.reach("r", hand, w, h.at("upperarm_r").addScaledVector(up, 0.25));
  h.orient("r", unit(p.at("upperarm_r").sub(p.at("upperarm_l")).setY(0)), V(0, -1, 0), w * 0.8);
  h.relaxHand("r", 0.12, {}, w);
  h.armAvoid = (side) => { if (side !== "r") return 0; const a = h.at("upperarm_r"), b = h.at("lowerarm_r"); let s2 = 0; for (const k of [0.5, 0.8, 1]) s2 += Math.max(0, sk(a.clone().lerp(b, k)).d + 0.04); return s2; };
  // the head turned to them
  lookAt(h, p.at("head"), w);
}
function bedHeld(h, t) {
  const P = h.partner; if (!P?.pose) throw new Error("the shared bed is baked for a pair: anim-build.cjs --hug");
  // (the partner lies on the OTHER side: this body is on their right, so they are on this body's left)
  h.pairPlace ??= (() => { const pl = bedPlace(h); return { x: -pl.x, z: -pl.z, yaw: 0 }; })();
  const p = P.pose(BED.clip, t, h.pairPlace);
  const w = h.ease(t, 0.6, 1.8) * (1 - h.ease(t, BED.dur - 1.2, BED.dur - 0.1));
  // the head turned to them, the left hand up on the forearm that lies across this body's chest
  lookAt(h, p.at("head"), w);
  // (on THEIR forearm, which crosses this body's chest from the near side: the middle of the chest, toward the
  // near shoulder — sent to the far shoulder, the arm wrapped round and the law had to lift it 16 degrees)
  const on = h.at("spine_02").lerp(h.at("spine_03"), 0.45).lerp(h.at("upperarm_l"), 0.15).addScaledVector(UP(), 0.13);
  h.reach("l", on, w * 0.9, h.at("upperarm_l").addScaledVector(UP(), 0.2)); h.relaxHand("l", 0.35, {}, w);
}
RECIPES0.bed = { base: BED.clip, dur: BED.dur, pair: true, frame: (h, t) => bedArm(h, t) };
RECIPES0["bed-held"] = { base: BED.clip, dur: BED.dur, pair: true, frame: (h, t) => bedHeld(h, t) };
RECIPES0["bandage-other"] = { base: "ual1-fixing-kneeling", dur: 6, pair: true, unclip: false, frame: (h, t) => bandageOther(h, t) };
// THE AXE AT REST (Oct 23 2026), built: no recording holds a long two-handed tool. Across the body at
// port arms — the right hand at the bottom of the handle by the right hip, the left higher up it by the
// left chest, the head up past the left shoulder — breathing, the hands shifting their grip now and then
export const AXE_IDLE = { low: [0.27, -0.02, 0.17], high: [0.3, 0.12, -0.2] };
RECIPES0["axe-idle"] = {
  base: "ual1-idle-loop", dur: 4, held: "axe",
  frame(h, t, dur) {
    const F = h.frame(), breath = Math.sin(h.loop(t, dur, 1)), shift = h.pulse(t % 4, 2.6, 0.2, 0.4);
    const lo = h.ahead(h.at("hip"), ...AXE_IDLE.low).addScaledVector(UP(), 0.01 * breath), hi = h.ahead(h.at("spine_03"), ...AXE_IDLE.high).addScaledVector(UP(), 0.012 * breath + 0.015 * shift);
    const ax = unit(hi.clone().sub(lo));
    gripBar(h, "r", lo.clone().addScaledVector(ax, 0.06), ax, 1, 1, {}, h.ahead(h.at("upperarm_r"), -0.05, -0.5, 0.3), F.fwd, { r: HELD.axe.r, sdf: heldShapes(h.hand("r"), HELD.axe).handle, wrap: { thumb: 1.2 } });
    const { handle } = heldShapes(h.hand("r"), HELD.axe);
    gripBar(h, "l", lo.clone().addScaledVector(ax, 0.42), ax, 1, 1, {}, h.ahead(h.at("upperarm_l"), -0.05, -0.5, -0.3), F.fwd, { r: HELD.axe.r, sdf: handle, wrap: { thumb: 1.2 } });
    h.wrap("r", heldShapes(h.hand("r"), HELD.axe).handle, { thumb: 1.2, open: -0.6 }); held(h, "r", 1);
  },
};
// THE BITES, the survivor's side (Oct 23 2026): built moves the zombie's bite is fitted to (the zombie's
// side is baked on each zombie against each survivor playing these). "bitten-forearm": the left forearm
// thrown up across the face to block, bitten, yanked back to the chest and clutched; "bitten-shoulder":
// grabbed at the left side, the bite on the top of the shoulder, the head away, the right hand shoving
// at the zombie's head
export const BITE = { arm: { up: 0.35, bite: [0.45, 1.75], pull: 2.05, dur: 3.4 }, shoulder: { bite: [0.4, 2.0], dur: 3.2 } };
RECIPES0["bitten-forearm"] = {
  base: "ual1-idle-loop", dur: BITE.arm.dur, once: true,
  frame(h, t) {
    const F = h.frame(), A = BITE.arm;
    const up = h.ease(t, 0.05, A.up) * (1 - h.ease(t, A.pull - 0.1, A.pull + 0.25));
    const recoil = h.ease(t, A.bite[0], A.bite[0] + 0.3) * (1 - h.ease(t, A.bite[1], A.pull + 0.4));
    const yank = h.ease(t, A.bite[1] - 0.05, A.pull) * (1 - h.ease(t, 2.7, 3.3)), clutch = h.ease(t, A.pull, A.pull + 0.35) * (1 - h.ease(t, 3.0, 3.4));
    h.turn("spine_02", "x", -6 * recoil + 8 * yank); h.turn("spine_03", "x", -4 * recoil + 6 * yank);
    h.turn("head", "y", 28 * recoil); h.turn("head", "x", -6 * recoil + 10 * yank); h.turn("neck", "y", 10 * recoil);
    h.move("hip", F.fwd.clone().multiplyScalar(-0.07 * h.ease(t, A.bite[1], A.pull + 0.3)));
    // the block: the forearm level across the face a forearm's length out, palm in
    if (up > 0) {
      const mid = h.ahead(h.at("head"), 0.3, -0.04, -0.02);
      const wrist = mid.clone().addScaledVector(F.right, 0.13).addScaledVector(F.fwd, -0.02);
      h.reach("l", wrist, up, h.ahead(h.at("upperarm_l"), 0.25, -0.2, -0.35));
      h.orient("l", dirOf([F.right, 1], [UP(), 0.15]), dirOf([F.fwd, -1]), up);
      h.relaxHand("l", 0.55, {}, up);
    }
    // the shove at the head biting it (in front of the forearm, a little right of the face)
    const shove = recoil * (1 - yank);
    if (shove > 0) {
      // (at the zombie's FACE, over the bitten forearm — 39 cm out and level, the hand was in its upper chest)
      const head = h.ahead(h.at("head"), 0.34, 0.07, 0.06);
      h.reach("r", head, shove, h.ahead(h.at("upperarm_r"), 0.1, -0.4, 0.35));
      h.orient("r", dirOf([F.fwd, 1], [UP(), 0.3]), dirOf([F.fwd, 1], [F.right, -0.3]), shove);
      h.relaxHand("r", 0.3, {}, shove);
    }
    // ... then the hurt forearm held to the chest and gripped by the other hand
    if (clutch > 0) {
      const at = h.ahead(h.at("spine_03"), 0.24, -0.06, -0.04);
      h.reach("l", at, clutch, h.ahead(h.at("upperarm_l"), 0.05, -0.5, -0.2));
      h.reach("r", at.clone().addScaledVector(F.right, -0.1).addScaledVector(F.fwd, 0.02), clutch, h.ahead(h.at("upperarm_r"), 0.05, -0.5, 0.2));
      h.relaxHand("r", 0.6, {}, clutch);
    }
  },
};
RECIPES0["bitten-shoulder"] = {
  base: "ual1-idle-loop", dur: BITE.shoulder.dur, once: true,
  frame(h, t) {
    const F = h.frame(), B = BITE.shoulder;
    const bite = h.ease(t, B.bite[0], B.bite[0] + 0.25) * (1 - h.ease(t, B.bite[1], B.bite[1] + 0.5));
    const free = h.ease(t, B.bite[1], B.bite[1] + 0.4) * (1 - h.ease(t, 2.6, 3.2));
    // the bitten shoulder hunched, the head turned away and back, a stagger to the right
    h.turn("shoulder_l", "z", -9 * bite); h.turn("head", "y", -30 * bite); h.turn("head", "z", 12 * bite); h.turn("neck", "y", -10 * bite);
    h.turn("spine_02", "z", 6 * bite); h.turn("spine_03", "x", 6 * free);
    h.move("hip", F.right.clone().multiplyScalar(0.06 * bite));
    // the right hand across the body shoving at the zombie's head on the left shoulder, then clamped on the
    // wound — ONE reach along a path that swings out in front between the two (two reaches blended, one fading
    // as the other came in, cut the forearm 10-18 cm through the chest on every body)
    // (and the whole way — from the hand's own place, to the shove, to the wound, and back — bowed out in front:
    // a reach fading in or out pulls the hand straight between the two, and back to the side it went through
    // the chest; the clamp on the OUTSIDE of the arm, which keeps a big chest clear of the forearm)
    const hb = h.at("hand_r"), at = h.ahead(h.at("upperarm_l"), 0.28, 0.16, -0.04), wound = h.ahead(h.at("upperarm_l"), 0.14, 0.0, -0.07);
    const ww = Math.max(bite, free), k = free / Math.max(1e-6, ww);
    if (ww > 0) {
      const mid = at.clone().lerp(wound, k).addScaledVector(F.fwd, 0.16 * Math.sin(Math.PI * k));
      const target = hb.clone().lerp(mid, ww).addScaledVector(F.fwd, 0.14 * Math.sin(Math.PI * ww));
      // (the elbow up and forward for the cross-body shove, as an arm reaching across itself goes; low, the upper
      // arm lay across Nathan's chest, 16 cm in)
      h.reach("r", target, 1, h.ahead(h.at("upperarm_r"), 0.25 - 0.13 * k, -0.08 - 0.42 * k, 0.32));
    }
    if (bite > free) h.orient("r", dirOf([F.right, -1], [UP(), 0.4]), dirOf([F.right, -0.6], [UP(), -0.5]), bite);
    h.relaxHand("r", 0.35 + 0.2 * k, {}, ww);
  },
};

// THE BITES, the zombie's side: baked on a ZOMBIE with a survivor partner playing the bitten move
// (anim-build.cjs --zpair <zombie> [survivor]; out/<zombie>/zd-<move>-<survivor>.json). The survivor
// stands facing the zombie, placed (built.place) so the bitten place meets the zombie's mouth; through
// the bite the zombie's hands grab the limb and its mouth is solved onto it, a breath off the skin
const zmouth = (h) => h.ahead(h.at("head"), 0.09, -0.02);
const ZSKULL = 0.105;   // (the five points sit inside the head; its nose, jaw and hair reach about this far past them)
function zombieBite(h, t, o) {
  const P = h.partner; if (!P?.pose) throw new Error("a zombie's bite is baked for a pair: anim-build.cjs --zpair");
  const F = h.homeFrame(), [b0, b1] = o.bite;
  if (!h.pairPlace) {
    // the bitten place at the middle of the bite brought to where the clip's mouth goes; the survivor's
    // TURN is the one that keeps this zombie's body clearest of it (a shoulder is bitten from the side —
    // met front-on, the zombie stood 16 cm inside the man it was biting)
    // (the mouth at its FURTHEST forward in the bite window: the clip lunges on through the bite, and placed
    // against its middle the head went on through the survivor's shoulder)
    const tm = (b0 + b1) / 2, dz = h.durOf(o.base) - 0.01;
    let at = o.at ?? tm, m = h.peek(o.base, Math.min(dz, at), () => zmouth(h));
    if (o.at == null) for (let s2 = b0; s2 <= b1; s2 += 0.05) { const q = h.peek(o.base, Math.min(dz, s2), () => zmouth(h)); if (q.z > m.z) { m = q; at = s2; } }
    const body = h.peek(o.base, Math.min(dz, at), () => ["hip", "spine_02", "spine_03", "neck", "upperarm_l", "upperarm_r", "upperleg_l", "upperleg_r"].map((n) => h.at(n)));
    let best = null;
    for (const yaw of o.yaws ?? [180]) {
      const p0 = P.pose(o.clip, tm, { x: 0, z: 0, yaw }), T0 = o.target(p0), place = { x: m.x - T0.x, z: m.z - T0.z, yaw };
      const sk = P.pose(o.clip, tm, place).into();
      const deep = Math.max(...body.map((q) => sk(q).d + 0.12)), cost = Math.max(0, deep) + 0.0005 * Math.abs(yaw - 180);
      if (!best || cost < best.cost) best = { cost, place };
    }
    h.pairPlace = { x: +best.place.x.toFixed(3), z: +best.place.z.toFixed(3), yaw: best.place.yaw };
    h.gripAlong = null;
    if (o.along) {
      const pm = P.pose(o.clip, tm, h.pairPlace), skm = pm.into();
      h.gripAlong = o.along.reduce((b, a) => (skm(o.grip(pm, 1, a)).d < skm(o.grip(pm, 1, b)).d - 0.01 ? a : b), o.along[Math.floor(o.along.length / 2)]);
    }
  }
  // (the bite done, it lets go and staggers back off the survivor: its recorded clip lunges on through where
  // the survivor stands, the arm 41 cm into Rollo, and the survivor's hand clamping the wound landed in it)
  const rel = h.ease(t, b1, b1 + 0.6);
  if (rel > 0) h.move("hip", F.fwd.clone().multiplyScalar(-0.32 * rel));
  const p = P.pose(o.clip, t, h.pairPlace), w = h.ease(t, b0 - 0.2, b0 + 0.05) * (1 - h.ease(t, b1 - 0.05, b1 + 0.3));
  // (the arm law that runs after the recipe, told about the survivor: the hands were on the skin but the arm
  // between them, reaching round to grip, went through the survivor's shoulder — 8-18 cm on every pair)
  const skA = p.into();
  h.armAvoid = (side) => {
    const a = h.at("upperarm_" + side), b = h.at("lowerarm_" + side), c = h.at("hand_" + side);
    let pen = 0; for (const q of [0.4, 0.7, 1].map((k) => a.clone().lerp(b, k)).concat([0.33, 0.66].map((k) => b.clone().lerp(c, k)))) pen += Math.max(0, skA(q).d + 0.05);
    return pen;
  };
  // (outside the bite the recorded clip's hands are kept off the survivor too: it reaches before the bite and
  // grips on after it, and at the start and end of the clip its fingers were 8-16 cm inside the survivor)
  if (w < 1) {
    const sk0 = p.into(), core0 = p.at("spine_03").lerp(p.at("neck"), 0.5);
    for (const side of ["l", "r"]) for (let it = 0; it < 8; it++) {
      const pts = ["hand_", "index_03_", "middle_03_", "ring_03_", "pinky_03_", "thumb_03_", "index_01_", "pinky_01_"].map((n) => { try { return h.at(n + side); } catch { return null; } }).filter(Boolean);
      // (backed out from its SPINE at the deepest tip, not from its chest: a hand on the survivor's back pushed
      // "away from the chest" went along the body, not out of it)
      const deep = pts.map((q) => ({ q, r: sk0(q) })).reduce((x, y) => (y.r.d > x.r.d ? y : x)), d = deep.r.d; if (d <= -0.025) break;
      const hp = h.at("hand_" + side), dir = deep.r.from ? unit(deep.q.clone().sub(deep.r.from)) : unit(hp.clone().sub(core0));
      h.reach(side, hp.addScaledVector(dir, d + 0.05), 1, h.ahead(h.at("upperarm_" + side), 0.1, -0.4, side === "l" ? -0.3 : 0.3));
    }
  }
  // (no early return when the bite is off: the mouth solve is weighted by w and does nothing then, but the
  // skull is still pushed back out of the survivor — at the end of the shoulder bite it was 6 cm in)
  // (the bite and the grips ON the survivor's skin, never in it: stepped out from its spine until its
  // posed torso is behind them — a shoulder's bite point and a hand on the chest were both inside it)
  const sk = p.into(), core = p.at("spine_03").lerp(p.at("neck"), 0.5);
  const onSkin = (q, margin) => { const d = unit(q.clone().sub(core)); for (let k = 0; k < 30 && sk(q).d > -margin; k++) q.addScaledVector(d, 0.01); return q; };
  // (the skull as five points — crown, face, jaw, both sides: one point at the crown sat above the
  // survivor's torso and read clear while the jaw was 15 cm in)
  const T = onSkin(o.target(p), 0.045), F2 = h.frame();
  const skullPts = () => { const hd = h.at("head"), up = unit(hd.clone().sub(h.at("neck"))); return [hd.clone().addScaledVector(up, 0.08), hd.clone().addScaledVector(up, 0.03).addScaledVector(F2.fwd, 0.08), hd.clone().addScaledVector(up, -0.03).addScaledVector(F2.fwd, 0.06), hd.clone().addScaledVector(up, 0.04).addScaledVector(F2.right, 0.07), hd.clone().addScaledVector(up, 0.04).addScaledVector(F2.right, -0.07)]; };
  const skullIn = () => Math.max(...skullPts().map((q) => sk(q).d)), skull = () => skullPts().reduce((a, q) => (sk(q).d > sk(a).d ? q : a));
  // the mouth onto the bite (the upper back, neck and head bent toward it, small steps)
  const DOF = [["spine_02", "x", 20], ["spine_03", "x", 15], ["spine_02", "y", 20], ["neck", "x", 20], ["neck", "y", 25], ["head", "x", 15]], used = DOF.map(() => 0);
  for (let it = 0; it < 10; it++) {
    const err = T.clone().addScaledVector(unit(zmouth(h).sub(T)), 0.02).sub(zmouth(h)); if (err.length() < 0.012) break;
    DOF.forEach(([b, ax, lim], i) => {
      h.turn(b, ax, 1); const d1 = zmouth(h); h.turn(b, ax, -1); const d0 = zmouth(h);
      const dd = d1.sub(d0), g = dd.dot(err) / Math.max(1e-6, dd.lengthSq());
      const next = Math.max(-lim * w, Math.min(lim * w, used[i] + Math.max(-4, Math.min(4, 0.5 * g * w))));
      h.turn(b, ax, next - used[i]);
      // (the skull kept out of the survivor: its middle no nearer the skin than ZSKULL — the face against
      // the shoulder, not the head through it)
      if (skullIn() > -ZSKULL) h.turn(b, ax, used[i] - next); else used[i] = next;
    });
  }
  // ... and if the clip's own lunge has carried the skull in anyway, bent back out (the same joints, each
  // step the one that moves the skull furthest from the survivor's middle)
  for (let it = 0; it < 12 && skullIn() > -ZSKULL; it++) {
    const away = unit(skull().sub(core));
    let bestI = -1, bestG = 0;
    DOF.forEach(([b, ax], i) => { for (const sg of [1, -1]) { h.turn(b, ax, sg); const g = skull().sub(core).dot(away); h.turn(b, ax, -sg); if (g > bestG) { bestG = g; bestI = i * 2 + (sg > 0 ? 0 : 1); } } });
    if (bestI < 0) break;
    const [b, ax] = DOF[bestI >> 1]; h.turn(b, ax, (bestI & 1 ? -1 : 1) * 3);
  }
  // the hands on the limb, either side of the bite, palms to it
  for (const [side, k] of [["l", -1], ["r", 1]]) {
    const at = onSkin(o.grip(p, k, h.gripAlong ?? undefined), 0.05), toward = unit(T.clone().sub(at));
    // (the elbow SWUNG round the shoulder-to-grip line until the arm clears the survivor: the one fixed pole
    // sent a big zombie's forearm through Rollo's chest on the way round to the grip. The swing is a continuous
    // angle carried from frame to frame and turned at most 15 degrees a frame, easing home when the arm is clear
    // — picked afresh each frame from a set of directions, an elbow flips sides and pops)
    const goal = at.clone().addScaledVector(toward, -0.06), sh = h.at("upperarm_" + side), axis = unit(goal.clone().sub(sh));
    const off0 = h.ahead(h.at("upperarm_" + side), 0.1, -0.4, 0.3 * k).sub(sh);
    const poleAt = (deg) => sh.clone().add(off0.clone().applyAxisAngle(axis, (deg * Math.PI) / 180));
    h.biteSwing ??= {}; if (h.biteSwingT == null || t < h.biteSwingT) h.biteSwing = {};
    let th = h.biteSwing[side] ?? 0;
    const score = (deg) => { h.reach(side, goal, w, poleAt(deg)); return h.armAvoid(side) + 0.00002 * deg * deg; };
    let cur = score(th);
    for (const step of [15, 7, 3]) for (const sg of [1, -1]) {
      const cand = th + sg * step, prev = h.biteSwing[side] ?? 0;
      if (Math.abs(cand - prev) > 15 || Math.abs(cand) > 150) continue;
      const c = score(cand); if (c < cur - 1e-6) { cur = c; th = cand; }
    }
    h.biteSwing[side] = th;
    h.reach(side, goal, w, poleAt(th));
    // (a hand the reach left in the survivor is moved out by the depth)
    for (let it = 0; it < 3; it++) { const hp = h.at("hand_" + side), d = sk(hp).d; if (d <= -0.04) break; h.reach(side, hp.addScaledVector(unit(hp.clone().sub(core)), d + 0.05), w, h.ahead(h.at("upperarm_" + side), 0.1, -0.4, 0.3 * k)); }
    const fa = unit(h.at("hand_" + side).sub(h.at("lowerarm_" + side))); fa.addScaledVector(toward, -fa.dot(toward)).normalize();
    h.orient(side, fa, toward, w * 0.6); h.relaxHand(side, 0.7, {}, w);
    // (and the FINGERTIPS on the skin too, not only the hand bone: curled 70% round a shoulder blade, the
    // fingers went 15 cm into the back — Rollo's suit worst. The hand backed straight out of the body, from its
    // spine at the deepest tip, until no tip is in; the fingers opened a little if that isn't enough)
    for (let it = 0; it < 5; it++) {
      const tips = ["hand_", "index_03_", "middle_03_", "ring_03_", "pinky_03_", "thumb_03_", "index_01_", "pinky_01_"].map((n) => { try { return h.at(n + side); } catch { return null; } }).filter(Boolean);
      const deep = tips.map((q) => ({ q, r: sk(q) })).reduce((x, y) => (y.r.d > x.r.d ? y : x));
      if (deep.r.d <= -0.012) break;
      const dir = deep.r.from ? unit(deep.q.clone().sub(deep.r.from)) : unit(deep.q.clone().sub(core)), hp = h.at("hand_" + side);
      h.reach(side, hp.addScaledVector(dir, deep.r.d + 0.02), w, h.ahead(h.at("upperarm_" + side), 0.1, -0.4, 0.3 * k));
      h.orient(side, fa, toward, w * 0.6); h.relaxHand(side, Math.max(0.35, 0.7 - 0.08 * (it + 1)), {}, w);
    }
  }
  h.biteSwingT = t;
}
const ZBITES = {
  forearm: { clip: "bd-bitten-forearm", base: "mx-zombie-neck-bite", bite: BITE.arm.bite, stand: 0.0,
    target: (p) => p.at("lowerarm_l").lerp(p.at("hand_l"), 0.55),
    // (the second hand a third of the way down the forearm: by the elbow, on a small survivor, its fingers were
    // in her chest)
    // (where along it is chosen per survivor — the spot furthest off the body at the bite: by the elbow a small
    // survivor's chest was under the fingers, a third of the way down Rollo's suit was)
    grip: (p, k, a = 0.33) => k < 0 ? p.at("lowerarm_l").lerp(p.at("hand_l"), 0.95) : p.at("lowerarm_l").lerp(p.at("hand_l"), a), along: [0.15, 0.33, 0.5, 0.62] },
  shoulder: { clip: "bd-bitten-shoulder", base: "mx-zombie-neck-bite", bite: BITE.shoulder.bite, stand: 0.0, yaws: [180, 150, 120, 90, 210],
    // (the OUTSIDE of the shoulder, the top of the upper arm: on top by the neck the zombie's face was in the
    // neck and collarbone; the hands on the upper arm below the bite and the back of the shoulder)
    target: (p) => p.at("upperarm_l").lerp(p.at("lowerarm_l"), 0.18).addScaledVector(unit(p.at("upperarm_l").sub(p.at("upperarm_r"))), 0.05),
    // (the second hand's spot between the back of the upper arm and the shoulder blade chosen per survivor, as
    // the forearm's is: toward the blade, Rollo's suit and Manuel's back were under its fingers)
    grip: (p, k, a = 0.3) => k < 0 ? p.at("upperarm_l").lerp(p.at("lowerarm_l"), 0.6) : p.at("upperarm_l").lerp(p.at("spine_03"), a).addScaledVector(UP(), -0.05), along: [0.05, 0.15, 0.3] },
};
for (const [k, o] of Object.entries(ZBITES)) RECIPES0[`zbite-${k}`] = { base: o.base, dur: "base", pair: "zombie", frame: (h, t) => zombieBite(h, t, o) };

// THE LEG BITE (Oct 23 2026): the crawler's ankle grab not kicked free — tripped and down on their back, the
// zombie over their shins bites the calf, then climbs on as the pack's own clip goes on to. Both halves are the
// pack's fz-lying-leg with a HOLD put in at LEGBITE.at, the moment the survivor is down and the zombie's head
// is over the knees (measured, zombie-m01 on Eric at the solved placement: its left hand already on the right
// shin, its right hand on the left knee); the bite plays inside the hold. The placement is the pack's lying-leg
// one (docs/survivorz/anim-pairs.mjs) in the zombie's frame
export const LEGBITE = { clip: "fz-lying-leg", at: 2.0, hold: 2.6, bite: [0.3, 2.2], place: { x: -0.05, z: 1.1, yaw: 180 } };
const legTime = (t) => (t < LEGBITE.at ? t : t < LEGBITE.at + LEGBITE.hold ? LEGBITE.at : t - LEGBITE.hold);
const legW = (h, t) => { const u = t - LEGBITE.at, [b0, b1] = LEGBITE.bite; return h.ease(u, b0 - 0.25, b0 + 0.05) * (1 - h.ease(u, b1 - 0.05, b1 + 0.35)); };
// a few joints turned in small steps to bring a point to a goal (the bite's own solver, for any point)
function solveTo(h, point, goal, DOF, w, it = 10, ok = () => true) {
  const used = DOF.map(() => 0);
  for (let k = 0; k < it; k++) {
    const err = goal.clone().sub(point()); if (err.length() < 0.01) break;
    DOF.forEach(([b, ax, lim], i) => {
      h.turn(b, ax, 1); const d1 = point(); h.turn(b, ax, -1); const d0 = point();
      const dd = d1.sub(d0), g = dd.dot(err) / Math.max(1e-6, dd.lengthSq());
      const next = Math.max(-lim * w, Math.min(lim * w, used[i] + Math.max(-4, Math.min(4, 0.5 * g * w))));
      h.turn(b, ax, next - used[i]);
      if (!ok()) h.turn(b, ax, used[i] - next); else used[i] = next;
    });
  }
}
// the survivor's half: the bitten (right) leg jerking, the body curling up off the floor toward it, the left
// hand shoving at the head over the knees, the right clutching the thigh above the bite
RECIPES0["bitten-leg"] = {
  base: LEGBITE.clip, dur: 6.67 + LEGBITE.hold, time: legTime,
  frame(h, t) {
    const w = legW(h, t); if (w <= 0) return;
    const u = t - LEGBITE.at, jerk = 0.5 + 0.5 * Math.sin(u * 13) * Math.exp(-0.6 * Math.max(0, u - LEGBITE.bite[0]));
    const knee = h.at("lowerleg_r"), hip = h.at("hip"), foot = h.at("foot_r");
    // up off the floor: the head toward a point over the thighs
    const up = hip.clone().lerp(knee, 0.45).addScaledVector(UP(), 0.6);
    solveTo(h, () => h.at("head"), up, [["spine_01", "x", 18], ["spine_02", "x", 18], ["spine_03", "x", 12], ["neck", "x", 15]], w);
    // the bitten leg pulled at in jerks: the foot drawn toward the hip and lifted
    const pull = foot.clone().lerp(hip, 0.12 + 0.1 * jerk).addScaledVector(UP(), 0.06 + 0.08 * jerk);
    solveTo(h, () => h.at("foot_r"), pull, [["upperleg_r", "x", 25], ["lowerleg_r", "x", 35]], w, 8);
    // the hands: the left at the head over the knees, the right on the thigh above the bite
    const k2 = h.at("lowerleg_r"), th = h.at("upperleg_r").lerp(k2, 0.65);
    // (the zombie's head is over the knees, out of a lying arm's reach: the hand strains toward it)
    h.reach("l", k2.clone().lerp(h.at("lowerleg_l"), 0.3).addScaledVector(UP(), 0.18), w, h.ahead(h.at("upperarm_l"), 0.1, -0.4, -0.3));
    h.relaxHand("l", 0.35, {}, w);
    h.reach("r", th.addScaledVector(UP(), 0.07), w, h.ahead(h.at("upperarm_r"), 0.1, -0.4, 0.3));
    h.relaxHand("r", 0.65, {}, w);
  },
};
// the zombie's half, baked on each zombie against each survivor playing bd-bitten-leg: the pack's lying-leg,
// held, the mouth solved onto the upper calf (a calf is no torso, so its skin is the bone line plus a calf's
// radius), the skull kept off the leg, the hands on the shin below the bite and the other knee
const CALF_R = 0.06;
// (a zombie lying face down has its face toward the FLOOR, not along its body: the mouth and skull are taken
// off the head bone's own facing, measured once from the zombie standing in its idle)
const zface = (h) => {
  h.zFace ??= h.peek("mx-zombie-idle", 0, () => { const q = h.quat("head").invert(); return { f: h.homeFrame().fwd.clone().applyQuaternion(q), u: UP().applyQuaternion(q) }; });
  const q = h.quat("head"); return { f: h.zFace.f.clone().applyQuaternion(q), u: h.zFace.u.clone().applyQuaternion(q) };
};
const zmouthF = (h) => { const F = zface(h); return h.at("head").addScaledVector(F.f, 0.09).addScaledVector(F.u, -0.03); };
const segDist = (q, a, b) => { const ab = b.clone().sub(a), k = Math.max(0, Math.min(1, q.clone().sub(a).dot(ab) / ab.lengthSq())); return q.distanceTo(a.clone().addScaledVector(ab, k)); };
function zombieLegBite(h, t) {
  const P = h.partner; if (!P?.pose) throw new Error("a zombie's bite is baked for a pair: anim-build.cjs --zpair");
  h.pairPlace ??= { ...LEGBITE.place };
  const w = legW(h, t); if (w <= 0) return;
  // (the survivor's own half fitted against THIS zombie where it has one: bd-bitten-leg-<zombie>)
  const pc = P.has?.(`bd-bitten-leg-${h.self}`) ? `bd-bitten-leg-${h.self}` : "bd-bitten-leg";
  const p = P.pose(pc, t, h.pairPlace), knee = p.at("lowerleg_r"), ankle = p.at("foot_r");
  const onLeg = (q, out) => { const ab = ankle.clone().sub(knee), k = Math.max(0, Math.min(1, q.clone().sub(knee).dot(ab) / ab.lengthSq())), c = knee.clone().addScaledVector(ab, k); return c.addScaledVector(unit(q.clone().sub(c)), out); };
  const T = onLeg(knee.clone().lerp(ankle, 0.3).addScaledVector(UP(), 0.2), CALF_R + 0.015);
  // (the skull's surface points — crown, brow, chin — kept a breath off the calf's skin)
  const skull = () => { const hd = h.at("head"), F = zface(h); return [hd.clone().addScaledVector(F.u, 0.09), hd.clone().addScaledVector(F.u, 0.04).addScaledVector(F.f, 0.09), hd.clone().addScaledVector(F.u, -0.06).addScaledVector(F.f, 0.05)]; };
  const clear = () => Math.min(...skull().map((q) => segDist(q, knee, ankle))) > CALF_R + 0.015;
  solveTo(h, () => zmouthF(h), T.clone().addScaledVector(unit(zmouthF(h).sub(T)), 0.015), [["spine_01", "x", 15], ["spine_02", "x", 30], ["spine_03", "x", 22], ["spine_02", "y", 20], ["neck", "x", 35], ["neck", "y", 30], ["head", "x", 25], ["head", "y", 15]], w, 16, clear);
  // the hands: one on the shin below the bite, one on the other knee, a breath off the skin
  for (const [side, at, pole] of [["l", knee.clone().lerp(ankle, 0.72), -1], ["r", p.at("lowerleg_l"), 1]]) {
    const g = side === "l" ? onLeg(at.clone().addScaledVector(UP(), 0.2), CALF_R + 0.035) : at.clone().addScaledVector(UP(), CALF_R + 0.04);
    h.reach(side, g, w, h.ahead(h.at("upperarm_" + side), 0.1, -0.4, 0.3 * pole));
    h.relaxHand(side, 0.7, {}, w);
  }
}
RECIPES0["zbite-leg"] = { base: LEGBITE.clip, dur: 6.67 + LEGBITE.hold, time: legTime, pair: "zombie", unclip: false, frame: (h, t) => zombieLegBite(h, t) };
// THE LEG BITE RIDES ON THE FITTED FINISHER (Oct 26 2026): after the hold the pack's lying-leg plays on — the
// crawler climbing onto the survivor — and played raw it sank 10-14 cm into a survivor the pack never made. The
// same motion is fitted per pair already (THE FINISHER FIT: zd-fz-lying-leg-<survivor> on the zombie, and on the
// survivor zv-fz-lying-leg-<zombie> where its fitted half won), so the bite is baked ON those: `zbite-leg@<survivor>`
// on the zombie, `bitten-leg@<zombie>` on the survivor where its fitted half is the one the table plays. The game
// plays the leg bite only where docs/survivorz/finisher-fit.json lists fz-lying-leg for the pair
export const LEG_SURVIVORS = ["eric", "carla", "claudia", "manuel", "nathan", "sophia", "rollo"];
export const LEG_ZOMBIES = [..."123456789"].map((n) => `zombie-f0${n}`).concat([..."123456789"].map((n) => `zombie-m0${n}`), ["zombie-m10"]);
for (const s of LEG_SURVIVORS) RECIPES0[`zbite-leg@${s}`] = { ...RECIPES0["zbite-leg"], base: `zd-fz-lying-leg-${s}` };
for (const z of LEG_ZOMBIES) RECIPES0[`bitten-leg@${z}`] = { ...RECIPES0["bitten-leg"], base: `zv-fz-lying-leg-${z}`, id: `bd-bitten-leg-${z}` };

// THE SURVIVOR AGAINST A ZOMBIE (Oct 23 2026): moves baked on a SURVIVOR with a zombie partner
// (anim-build.cjs --zvictim [survivor] [zombie]; out/<survivor>/zv-<move>-<zombie>.json): the knife that ends a
// grab and the stamp that kicks a crawler off an ankle. The zombie stands where the pair's own placement puts
// it, turned into this body's frame (h.pairPlace preset by the bake from anim-pairs.mjs or the zombie's clip)
const blade = (h, side, D, w, at, pole) => {
  // a knife held forward-grip, its blade (the hand's thumb axis, u) along D: the palm down across it
  const p = unit(V(0, -1, 0).addScaledVector(D, D.y)), f = unit(V().crossVectors(p, D));
  const fingers = side === "r" ? f : f.clone().negate();
  h.reach(side, at, w, pole); h.orient(side, fingers, p, w); h.reach(side, at, w, pole); h.orient(side, fingers, p, w);
};
// the knife to the head: grabbed from the front, the left arm keeps the zombie off, the right draws the knife
// from the hip and drives it into the side of the head, holds, and pulls it out. The game swaps the zombie onto
// its death at KNIFE.in. The blade goes KNIFE.depth into the skull; the hand stays outside it
export const KNIFE = { clip: "fz-front-struggle-start-idle", draw: [0.15, 0.55], in: 0.95, out: 1.55, dur: 2.2, depth: 0.07, len: 0.27 };
RECIPES0["knife-head"] = {
  base: KNIFE.clip, dur: KNIFE.dur, once: true, pair: "victim", held: "knife", heldSide: "r",
  frame(h, t) {
    const P = h.partner; if (!P?.pose) throw new Error("a survivor's move on a zombie is baked for a pair: anim-build.cjs --zvictim");
    const p = P.pose(KNIFE.clip, t, h.pairPlace), zh = p.at("head"), side = unit(p.at("upperarm_r").sub(p.at("upperarm_l")));
    // the temple on the side nearer this body's right hand, a little above the ear
    const sgn = Math.sign(h.at("upperarm_r").sub(zh).dot(side)) || 1, temple = zh.clone().addScaledVector(side, 0.075 * sgn).addScaledVector(UP(), 0.03);
    // THE HOOK: a knife held forward-grip has its blade out of the thumb side, square to the forearm, so the
    // blade can't point down the arm (a straight thrust needed the wrist bent 90 degrees, which the natural
    // law won't give — the tip missed by 16 cm). It comes round instead: the forearm level across in front
    // of the face, the blade into the side of the head
    const F = h.frame(), D = unit(temple.clone().sub(h.at("upperarm_r")).setY(0));
    let f = unit(V().crossVectors(D, UP())); if (f.dot(F.right) > 0) f.negate();   // (the forearm across, toward this body's left)
    const palm = unit(V().crossVectors(D, f));
    const wrist = temple.clone().addScaledVector(D, KNIFE.depth - KNIFE.len).addScaledVector(f, -0.07);
    const draw = h.ease(t, KNIFE.draw[0], KNIFE.draw[1]), stab = h.ease(t, KNIFE.draw[1], KNIFE.in), back = h.ease(t, KNIFE.out, KNIFE.out + 0.35), home = h.ease(t, KNIFE.out + 0.35, KNIFE.dur);
    const hip = h.ahead(h.at("upperleg_r"), 0.08, 0.12, 0.12), cock = wrist.clone().addScaledVector(D, -0.2).addScaledVector(f, -0.2).addScaledVector(UP(), 0.05);
    const into = stab * (1 - back);
    if (into > 0) {
      h.move("hip", D.clone().multiplyScalar(0.08 * into));
      h.turn("spine_02", "y", -10 * into); h.turn("spine_03", "y", -6 * into); h.turn("head", "y", 6 * into);
    }
    const at = hip.clone().lerp(cock, draw).lerp(wrist, stab).lerp(cock, back), w = draw * (1 - home);
    if (w > 0) {
      const pole = h.ahead(h.at("upperarm_r"), -0.15, -0.1, 0.45);
      for (let k = 0; k < 2; k++) { h.reach("r", at, w, pole); h.orient("r", f, palm, w); }
    }
  },
};
// the stamp that kicks a crawler off: the survivor's mx-stomp, its stamping foot brought down onto the
// crawler's head (zd-kicked-<this body>, the zombie's half) at KICK.impact, sole on the skull
export const KICK = { stomp: "mx-stomp", held: 0.15, impact: 0.82, dur: 3.0 };
RECIPES0["kick-free"] = {
  base: KICK.stomp, dur: "base", pair: "victim", fps: 60, noSmooth: true,
  frame(h, t) {
    const P = h.partner; if (!P?.pose) throw new Error("a survivor's move on a zombie is baked for a pair: anim-build.cjs --zvictim");
    const p = P.pose(`zd-kicked-${h.self}`, t, h.pairPlace), zh = p.at("head"), up = unit(zh.clone().sub(p.at("neck")));
    const top = zh.clone().addScaledVector(UP(), 0.11);   // (a skull's top above its head bone, the zombie face down)
    // (on the head from the impact until the recorded stamp lifts the foot again: let go at once, the foot
    // fell to its recorded height through the crawler's back)
    // (on the head for a beat, then the recorded stamp takes the foot back up and away from the body — stood in
    // front of the head, its backswing never crosses the crawler; held on the head while the recording lifted
    // the leg, the shin came down across the neck)
    const w = h.ease(t, KICK.impact - 0.35, KICK.impact - 0.05) * (1 - h.ease(t, KICK.impact + 0.08, KICK.impact + 0.3));
    if (w > 0) {
    // the foot over the skull on the way down, on it at the impact (the foot bone sits ~7 cm over the sole)
    const goal = top.clone().addScaledVector(UP(), 0.07 + 0.18 * (1 - h.ease(t, KICK.impact - 0.2, KICK.impact)));
    // (the foot turned ACROSS the head at the hip, toes away from the body: pointed along the crawler, its toes
    // went into the shoulders, which stand higher than a head pushed to the floor)
    const body = unit(p.at("spine_03").sub(p.at("neck")).setY(0));
    const toe = () => unit(h.at("ball_r").sub(h.at("foot_r")).setY(0));
    // (chosen ONCE for the stamp, at its first frame: picked afresh every frame it flipped between angles and the
    // leg jumped — a pop, and the blend between two such frames cut 13 cm through a shoulder)
    h.kickYaw ??= h.peek(KICK.stomp, KICK.impact, () => {
      let best = 0, bestD = toe().dot(body);
      for (let deg = -50; deg <= 50; deg += 10) { h.turn("upperleg_r", "y", deg); const d = toe().dot(body); h.turn("upperleg_r", "y", -deg); if (d < bestD - 0.05) { bestD = d; best = deg; } }
      return best;
    });
    h.turn("upperleg_r", "y", h.kickYaw * w);
    solveTo(h, () => h.at("foot_r"), goal, [["upperleg_r", "x", 60], ["upperleg_r", "z", 20], ["lowerleg_r", "x", 75]], w, 30);
    // (the foot laid flat on the skull: left as recorded, its toes pointed down past the head into the neck)
    const ball = h.at("ball_r"); solveTo(h, () => h.at("ball_r"), ball.clone().setY(Math.max(ball.y, h.at("foot_r").y - 0.06)), [["foot_r", "x", 40]], w, 10);
  }

  },
};
// the zombie's half of the stamp: a crawler face down holding the survivor's ankle (the pack's lying-leg at
// KICK.held), its right hand on the planted (left) ankle until the foot comes down, then its head driven into
// the floor and both hands let go. Baked per survivor (--zpair), the survivor stood (built.place) so its
// stamping foot comes down over the crawler's head and the ankle is within the crawler's reach
function zombieKicked(h, t) {
  const P = h.partner; if (!P?.pose) throw new Error("baked for a pair: anim-build.cjs --zpair");
  if (!h.pairPlace) {
    // the survivor in front of the crawler's head, facing along its body: the ankle in its hand at the start,
    // yanked out of it as the stamp winds up (that IS the kicking free), the foot down on the head, and the
    // recorded backswing away from the body. (Stood beside a shoulder instead, the stamping shin came down
    // across the shoulders and swung back through them, 16 cm into the crawler)
    const at0 = (n) => h.peek(LEGBITE.clip, KICK.held, () => h.at(n));
    const head = at0("head"), sh = at0("upperarm_r"), body = unit(at0("spine_03").sub(head).setY(0));
    // (and the stamping shin and sole kept off this body through the stamp, with room for a thick trouser leg or a
    // suit — Rollo's went 15 cm into a crawler's shoulder at a placement that was clean for Eric — standing back
    // a little along the approach if that is what it takes)
    const self = h.torso(), shinIn = (pl) => {
      let d = -1;
      for (let s2 = KICK.impact; s2 <= KICK.impact + 0.31; s2 += 0.1) { const q = P.pose(KICK.stomp, s2, pl); for (const k of [0.35, 0.65, 0.9]) d = Math.max(d, self.inside(q.at("lowerleg_r").lerp(q.at("foot_r"), k))); d = Math.max(d, self.inside(q.at("foot_r").addScaledVector(UP(), -0.075))); }
      return d;
    };
    let best = null;
    for (let yaw = 0; yaw < 360; yaw += 10) for (const back of [0, 0.05, 0.1]) {
      const fwd = V(Math.sin(yaw * Math.PI / 180), 0, Math.cos(yaw * Math.PI / 180));
      const f0 = P.pose(KICK.stomp, KICK.impact, { x: 0, z: 0, yaw }).at("foot_r"), place = { x: head.x - f0.x - fwd.x * back, z: head.z - f0.z - fwd.z * back, yaw };
      const reach = P.pose(KICK.stomp, 0, place).at("foot_l").distanceTo(sh);
      const cost = 2 * Math.max(0, reach - 0.55) + 0.6 * (1 - fwd.dot(body)) + 3 * Math.max(0, shinIn(place) + 0.09) + 0.5 * back;
      if (!best || cost < best.cost) best = { cost, place };
    }
    h.pairPlace = { x: +best.place.x.toFixed(3), z: +best.place.z.toFixed(3), yaw: best.place.yaw };
  }
  const p = P.pose(KICK.stomp, t, h.pairPlace);
  // the hand on the ankle while it can reach it — the yank takes it out of the grip
  const ank = p.at("lowerleg_l").lerp(p.at("foot_l"), 0.85), d = ank.distanceTo(h.at("upperarm_r"));
  const hold = (1 - h.ease(d, 0.5, 0.64)) * (1 - h.ease(t, KICK.impact - 0.1, KICK.impact));
  if (hold > 0) { h.reach("r", ank, hold, h.ahead(h.at("upperarm_r"), 0.1, 0.3, 0.3)); h.relaxHand("r", 0.75, {}, hold); }
  const hit = h.ease(t, KICK.impact - 0.03, KICK.impact + 0.08);
  if (hit > 0) {
    // (down to about its own shoulders' height — face down, the brow on the floor: pushed lower than the
    // shoulders, a stamping shin has to come down across them)
    const g = h.at("head").setY(0.24 + 0.01 * Math.sin(t * 25) * Math.exp(-3 * (t - KICK.impact)));
    solveTo(h, () => h.at("head"), g, [["spine_02", "x", 25], ["spine_03", "x", 20], ["neck", "x", 30], ["head", "x", 15]], hit, 10);
  }
}
RECIPES0["zkicked"] = { base: LEGBITE.clip, dur: KICK.dur, time: () => KICK.held, pair: "zombie", unclip: false, frame: (h, t) => zombieKicked(h, t) };

// THE FINISHER FIT (Oct 24 2026): the pack's paired attacks were made on a slimmer mannequin, and on our bodies
// they sink 5-19 cm into each other at any placement (SURVIVORZ.md, "THE FINISHER PACK ON OUR BODIES"). So
// each zombie's half is baked again against each survivor playing its own half, at the pack's placement
// (docs/survivorz/anim-pairs.mjs, handed in by the bake), as zd-<clip>-<survivor> on the zombie:
//  - its skull, neck and chest kept out of the survivor, and the survivor's hands, forearms, feet and shins
//    kept out of its chest — ONE continuous solve bending its spine, neck and head (a correction switched on
//    at a threshold pops; this one moves only as fast as the overlap does)
//  - its hands and fingers on the survivor's skin, not in it, and the arm law told about the survivor, so
//    the arm between a grip and the shoulder goes round, not through
export const FZ_FIT = ["fz-back-struggle-end", "fz-back-struggle-free", "fz-back-struggle-full", "fz-back-struggle-idle", "fz-back-struggle-start", "fz-back-v2", "fz-back",
  "fz-front-fall-v2", "fz-front-fall", "fz-front-jump-tear-up", "fz-front-jump-v2", "fz-front-jump", "fz-front-stand-v2", "fz-front-stand",
  "fz-front-struggle-end", "fz-front-struggle-free", "fz-front-struggle-full", "fz-front-struggle-start-idle", "fz-front-struggle-start",
  "fz-lying-leg-back", "fz-lying-leg", "fz-lying", "fz-up-down-v2", "fz-up-down-v3", "fz-up-down"];
// (the legs too: in the tackle the crawler kneels into the survivor's torso, which no bend of the spine moves)
const FIT_DOF = [["spine_01", "x", 18], ["spine_01", "y", 18], ["spine_02", "x", 20], ["spine_02", "y", 18], ["spine_02", "z", 12], ["spine_03", "x", 18], ["neck", "x", 28], ["neck", "y", 28], ["head", "x", 25], ["head", "y", 20],
  ["upperleg_l", "x", 25], ["upperleg_l", "z", 15], ["lowerleg_l", "x", 30], ["upperleg_r", "x", 25], ["upperleg_r", "z", 15], ["lowerleg_r", "x", 30]];
const ARM_DOF = ["l", "r"].flatMap((s) => [["shoulder_" + s, "x", 12], ["shoulder_" + s, "z", 12], ["upperarm_" + s, "x", 35], ["upperarm_" + s, "y", 30], ["upperarm_" + s, "z", 35]]);
function zombieFit(h, t, clip, opt = {}) {
  const P = h.partner; if (!P?.pose) throw new Error("a finisher's fit is baked for a pair: anim-build.cjs --zpair");
  if (!h.pairPlace) throw new Error("a finisher's fit needs the pack's placement (the bake hands it in)");
  const p = P.pose(opt.partner ?? clip, t, h.pairPlace), sk = p.into(), core = p.at("spine_03").lerp(p.at("neck"), 0.5);
  // THE MEASURE IS THE SKIN, as the pair check's is: bone points with an allowance missed a crawler's pelvis and
  // thighs going through the survivor in a tackle (the solve read zero while the skin was 13 cm in). This body's
  // skin — not its arms, which the arm law and the hands below take care of — against the survivor's torso,
  // and the survivor's whole skin against this body's torso: built once a frame and carried along with the
  // spine for each probe (rebuilt per probe, a clip took a minute)
  // (only the skin points anywhere near the other body are scored — picked once a frame, within 45 cm of its
  // spine: scoring all of both bodies on every probe took ten minutes a clip)
  const CH = ["hip", "spine_01", "spine_02", "spine_03", "neck"];
  const near = (q, chain) => { let m = Infinity; for (let i = 0; i < chain.length - 1; i++) m = Math.min(m, segDist(q, chain[i], chain[i + 1])); return m < 0.45; };
  const theirChain = [...CH, "head"].map((n) => p.at(n)), myChain = [...CH, "head"].map((n) => h.at(n));
  // (opt.arms: the UPPER arms scored too, and the shoulders and upper arms free to move — on the survivor's side
  // of the fit what was left inside the zombie was an upper arm, pinned between its chest and the hanging body)
  const upper = (x) => /(upperarm|shoulder)(_twist)?_[lr]$/.test(x.bone ?? "");
  const mineIdx = h.skin().filter((x) => (!(x.limb && x.limb.startsWith("arm")) || (opt.arms && upper(x))) && near(x.p, theirChain)).map((x) => x.i);
  const theirSkin = (p.skin ? p.skin() : []).filter((x) => near(x.p, myChain));
  const self0 = h.torso(), S0 = CH.map((n) => h.at(n));
  const pen = () => {
    let e = 0;
    for (const x of h.skin(mineIdx)) { const d = sk(x.p).d + 0.01; if (d > 0) e += d * d; }
    const S = CH.map((n) => h.at(n));
    for (const x of theirSkin) {
      let bi = 0, bd = Infinity; S.forEach((y, i) => { const d = y.distanceTo(x.p); if (d < bd) { bd = d; bi = i; } });
      const d = self0.inside(x.p.clone().sub(S[bi].clone().sub(S0[bi]))) + 0.01; if (d > 0) e += d * d;
    }
    return e;
  };
  // the bends, and the hips SLID (to 15 cm): a survivor's hand 17 cm into its chest, or a shin stepping through
  // a crawler on the floor, is more than a bend can take out
  // (sideways only, never up: let it lift and a crawler lying on a man floated a hand's breadth over him, which
  // measured clean and looked like a ghost)
  const F0 = h.homeFrame(), slide = [F0.fwd.clone(), F0.right.clone()], moved = [0, 0];
  // (the grips as recorded: any hand ON the survivor before the fit goes back to that spot on them after it —
  // pushed clear, a zombie grabbing from behind ended with its hands 22 cm off the man it was holding)
  // (on the survivor = within 20 cm of any part of them — the grips are on heads, necks and arms as often as torsos)
  const parts = ["head", "neck", "spine_03", "spine_02", "spine_01", "hip", "upperarm_l", "upperarm_r", "lowerarm_l", "lowerarm_r", "hand_l", "hand_r"].map((n) => p.at(n));
  const segs = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [2, 6], [6, 8], [8, 10], [2, 7], [7, 9], [9, 11]];
  const grip0 = {}; for (const side of ["l", "r"]) { const q = h.at("hand_" + side); if (Math.min(...segs.map(([i, j]) => segDist(q, parts[i], parts[j]))) < 0.2) grip0[side] = q; }
  // (a WARM START: each frame begins from the last one's answer — solved from scratch every frame it landed
  // somewhere different from one frame to the next, the head 21 cm into the survivor one frame after a clean one)
  if (h.fitT == null || t < h.fitT || h.fitClip !== clip) h.fitPrev = null;
  const dt = h.fitPrev ? t - h.fitT : 0;
  h.fitT = t; h.fitClip = clip;
  // (a zombie hanging from the ceiling by its legs keeps them as recorded: bent to make room, they bent like a puppet's)
  const DOF = [...((opt.legs ?? !/up-down/.test(clip)) ? FIT_DOF : FIT_DOF.filter(([b]) => !/leg/.test(b))), ...(opt.arms ? ARM_DOF : [])];
  // THE FEET STAY PLANTED: a foot on the floor in the pack's own pose costs to move — bent to make room, the legs
  // once dragged a zombie's feet half a metre across the floor (the first fit, Oct 24 2026)
  const feet = ["foot_l", "foot_r"].map((n) => h.at(n)).map((p0, i) => ({ n: i ? "foot_r" : "foot_l", p0 })).filter((f) => f.p0.y < 0.15);
  const FOOT_W = 0.3;
  const cost = () => { let e = pen(); for (const f of feet) e += FOOT_W * h.at(f.n).distanceToSquared(f.p0); return e; };
  // (and every bend EASES BACK toward the pack's own motion, a quarter-second at a time: started from the last
  // frame's answer and never let go, a fit bent for a moment's contact stayed bent for the rest of the clip)
  const RELAX = Math.exp(-dt / 0.25);
  const used = DOF.map(() => 0);
  if (h.fitPrev) {
    DOF.forEach(([b, ax], i) => { used[i] = h.fitPrev.used[i] * RELAX; h.turn(b, ax, used[i]); });
    slide.forEach((dir, i) => { moved[i] = h.fitPrev.moved[i] * RELAX; h.move("hip", dir.clone().multiplyScalar(moved[i])); });
  }
  const SL = opt.slide ?? 0.15;
  // (every joint measured from the SAME pose and then all stepped together, the step halved if it made things
  // worse: measured one after another against the round's opening score, every joint after the first that helped
  // read as helping too, and they all ran to their limits)
  const apply = (du, dm) => {
    DOF.forEach(([b, ax], i) => { if (du[i]) h.turn(b, ax, du[i]); used[i] += du[i]; });
    slide.forEach((dir, i) => { if (dm[i]) h.move("hip", dir.clone().multiplyScalar(dm[i])); moved[i] += dm[i]; });
  };
  // (the step a FIXED size along the gradient — up to 4 degrees on the joint that helps most, the rest in
  // proportion, a centimetre counted as a degree for the slide — and halved until it really lowers the cost: a step
  // in proportion to the gradient itself all but stopped on a shallow overlap, which is most of them)
  for (let it = 0; it < 12; it++) {
    const e0 = cost(); if (it === 0 && opt.arms) h.fitE0 = e0; if (e0 < 1e-6) break;
    const gu = DOF.map(([b, ax]) => { h.turn(b, ax, 1); const e1 = cost(); h.turn(b, ax, -1); return e1 - e0; });
    const gm = slide.map((dir) => { h.move("hip", dir.clone().multiplyScalar(0.01)); const e1 = cost(); h.move("hip", dir.clone().multiplyScalar(-0.01)); return e1 - e0; });
    const big = Math.max(...gu.map(Math.abs), ...gm.map(Math.abs)); if (big < 1e-9) break;
    let c = 4 / big, ok = false;
    for (let k = 0; k < 5 && !ok; k++, c /= 2) {
      const du = DOF.map(([, , lim], i) => Math.max(-lim, Math.min(lim, used[i] - c * gu[i])) - used[i]);
      const dm = slide.map((_, i) => Math.max(-SL, Math.min(SL, moved[i] - c * gm[i] * 0.01)) - moved[i]);
      apply(du, dm);
      if (cost() < e0) ok = true; else apply(du.map((x) => -x), dm.map((x) => -x));
    }
    if (!ok) break;
  }
  h.fitPrev = { used: used.slice(), moved: moved.slice() };
  // (and the planted feet put BACK where the pack had them, the legs bending to reach: the hips slid to make room
  // carried the feet along with them, a zombie skating 15 cm across the floor in a struggle. Re-planted, the
  // slide reads as weight shifted over still feet)
  for (const f of feet) {
    const s2 = f.n.slice(-1);
    solveTo(h, () => h.at(f.n), f.p0, [["upperleg_" + s2, "x", 40], ["upperleg_" + s2, "z", 25], ["lowerleg_" + s2, "x", 45]], 1, 12);
  }
  if (opt.debug) (h.fitLog ??= []).push([+t.toFixed(2), ["foot_l", "foot_r"].map((n) => +h.at(n).y.toFixed(3)), feet.map((f) => [f.n, +(h.at(f.n).distanceTo(f.p0) * 100).toFixed(1)]), moved.map((m) => +m.toFixed(3))]);
  if (opt.arms) (h.fitLog ??= []).push([+t.toFixed(2), +pen().toFixed(4), ...moved.map((m) => +m.toFixed(3)), ...used.map((u) => Math.round(u))]);
  for (const side of Object.keys(grip0)) h.reach(side, grip0[side], 1, h.ahead(h.at("upperarm_" + side), 0.1, -0.4, side === "l" ? -0.3 : 0.3));
  // the hands and fingers on the survivor's skin, not in it
  for (const side of ["l", "r"]) for (let it = 0; it < 6; it++) {
    const pts = ["hand_" + side, "index_03_" + side, "middle_03_" + side, "pinky_03_" + side, "thumb_03_" + side].map((n) => { try { return h.at(n); } catch { return null; } }).filter(Boolean);
    // (opt.arms: the forearm counted too, and the hand pushed straight out of the body from the deepest point —
    // away from the nearest stretch of its spine, not from its chest: a survivor's hand on a crawler's back
    // pushed "away from the chest" went along the crawler, not out of it)
    if (opt.arms) { const lo = h.at("lowerarm_" + side), hd = h.at("hand_" + side); pts.push(lo.clone().lerp(hd, 0.4), lo.clone().lerp(hd, 0.75)); }
    const probes = pts.map((q) => ({ q, r: sk(q) })), deep = probes.reduce((a, b) => (b.r.d > a.r.d ? b : a));
    const d = deep.r.d; if (d <= -0.02) break;
    const dir = opt.arms && deep.r.from ? unit(deep.q.clone().sub(deep.r.from)) : null;
    const hp = h.at("hand_" + side); h.reach(side, hp.addScaledVector(dir ?? unit(hp.clone().sub(core)), d + 0.04), 1, h.ahead(h.at("upperarm_" + side), 0.1, -0.4, side === "l" ? -0.3 : 0.3));
  }
  h.armAvoid = (side) => {
    const a = h.at("upperarm_" + side), b = h.at("lowerarm_" + side), c = h.at("hand_" + side);
    let s2 = 0; for (const q of [0.4, 0.7, 1].map((k) => a.clone().lerp(b, k)).concat([0.33, 0.66].map((k) => b.clone().lerp(c, k)))) s2 += Math.max(0, sk(q).d + 0.05);
    return s2;
  };
}
for (const clip of FZ_FIT) RECIPES0[`zfit:${clip}`] = { base: clip, dur: "base", pair: "zombie", id: clip, frame: (h, t) => zombieFit(h, t, clip, { debug: globalThis.FIT_DEBUG }) };
// THE SURVIVOR'S HALF OF THE FIT (Oct 24 2026): on seven clips the zombie's fit alone left them over the line —
// the crawler on a man lying down, the ceiling drops, the stand-up and the grab from behind: there the
// survivor's own pose is what's in the way (a shin through a crawler's back, a chest bowed into a hanging
// zombie's arms). The same solve, run on the SURVIVOR against the zombie's fitted half (zd-<clip>-<survivor>),
// baked per survivor per zombie as zv-<clip>-<zombie>; the game plays it in place of the pack's fz-<clip>
export const SFIT = ["fz-back", "fz-back-v2", "fz-back-struggle-end", "fz-back-struggle-full", "fz-front-stand-v2", "fz-front-jump", "fz-front-struggle-end", "fz-front-struggle-full", "fz-lying-leg-back", "fz-lying-leg", "fz-lying", "fz-up-down", "fz-up-down-v2", "fz-up-down-v3"];
for (const clip of SFIT) RECIPES0[`sfit:${clip}`] = { base: clip, dur: "base", pair: "victim", id: clip, frame: (h, t) => zombieFit(h, t, clip, { partner: `zd-${clip}-${h.self}`, legs: true, arms: true, slide: 0.25 }) };

for (const [kind, name] of [["bottle", "drink"], ["bar", "eat"], ["pills", "pills"]]) RECIPES0[name] = { base: "ual1-idle-loop", dur: MOUTH[kind].dur, once: true, held: kind, frame: toMouth(kind) };

// THE LAW FOR RECORDED CLIPS (Oct 23 2026): "lw:<clip>" bakes a recorded clip through the same pipeline as
// a built move with nothing added — the arms cleared of the body, the joints held to the cast's range, a
// twitch smoothed out — under the clip's OWN name, so it replaces the raw retarget wherever that broke
// the law. Until then only built moves had ever been through it: on Eric, 16 recorded clips clipped past
// 3 cm on whole frames (the lying clips' fingers into the chest, the rifle deaths' arms into the torso).
// A Proxy, so any recorded clip can be asked for by name without listing them all
export const RECIPES = new Proxy(RECIPES0, {
  get(t, k) {
    if (typeof k === "string" && k.startsWith("lw:") && !(k in t)) return { base: k.slice(3), dur: "base", id: k.slice(3), law: true, frame: () => {} };
    // ("lwl:<clip>": the legs only — a finisher's half, whose arms hold the other body and must stay where they are)
    if (typeof k === "string" && k.startsWith("lwl:") && !(k in t)) return { base: k.slice(4), dur: "base", id: k.slice(4), law: true, unclip: [], noSmooth: true, frame: () => {} };
    return t[k];
  },
  has(t, k) { return (typeof k === "string" && (k.startsWith("lw:") || k.startsWith("lwl:"))) || k in t; },
});

// ------------------------------------------------------------------------------------------
// PROPS: what each built move handles, drawn in its review video (anim-render.html), placed
// with the same hand frame the bake fitted the hand to — so a prop the game hangs on the hand
// at these offsets sits exactly where the review shows it. draw(ctx) returns primitives:
//   { cyl: [from, to], r }  { cone: [base, tip], r }  { box: centre, x, y, size: [sx, sy, sz] }
//   { sphere: centre, r }   plus color, glow (it lights itself), opacity.
// ctx: t, hand(side) (handFrame), home(fwd, up, right), homeFrame, floor (the floor's "up").
// view: the review camera (world dir, zoom, lift) — props are small, so the shot comes close.
const WOOD = 0x8a5a32, STEEL = 0x3c4046, DARK = 0x24262a, WALL = 0x8d9096, PLANK = 0x9b7b55;
const wall = (ctx, fwd, up, right, w, hgt) => ({ box: ctx.home(fwd + 0.05, up, right), x: ctx.homeFrame.right, y: UP(), size: [w, hgt, 0.1], color: WALL });
// a gun clip's prop is the gun itself (anim-render.html loads the model): which gun, and the pump's
// slide at time t
export function gunPropOf(name) {
  const m = /^(gr|gs)-/.exec(name); if (m) return { gun: GUN_SETS[m[1]], slide: () => 0 };
  if (/^gp-|^bd-mercy-/.test(name)) return { gun: "pistol", slide: () => 0 };
  if (name === "bd-shotgun-pump") return { gun: "shotgun", slide: (t) => GUN_HOLDS.shotgun.stroke * pumpStroke(t, "pump"), shells: [] };
  if (name === "bd-shotgun-load") return { gun: "shotgun", slide: (t) => GUN_HOLDS.shotgun.stroke * pumpStroke(t, "load"), shells: SHELL_TIMES };
  return null;
}
export const PROPS = {
  hammer: {
    view: { dir: [1, 0.25, -0.3], zoom: 0.42, lift: 0.32 },
    holds: ["r"],   // (the left braces the board: the hand checks don't ask it to hold what it touches)
    draw(ctx) {
      const R = ctx.hand("r"), H = R.hold(HAMMER.r), head = H.clone().addScaledVector(R.u, HAMMER.handle);
      return [
        { cyl: [H.clone().addScaledVector(R.u, -0.07), head], r: HAMMER.r, color: WOOD },
        { box: head.clone().addScaledVector(R.f, HAMMER.face - HAMMER.headLen / 2), x: V().crossVectors(R.u, R.f), y: R.u, size: [0.032, 0.032, HAMMER.headLen], color: STEEL },
        { box: ctx.home(HAMMER.board + 0.0145, HAMMER.height, HAMMER.across), x: ctx.homeFrame.right, y: UP(), size: [1.1, 0.15, 0.025], color: PLANK },
        { cyl: [ctx.home(HAMMER.board + 0.01, HAMMER.height, HAMMER.across), ctx.home(HAMMER.board - HAMMER.out, HAMMER.height, HAMMER.across)], r: 0.0018, color: STEEL },
        { cyl: [ctx.home(HAMMER.board - HAMMER.out, HAMMER.height, HAMMER.across), ctx.home(HAMMER.board - HAMMER.out - 0.002, HAMMER.height, HAMMER.across)], r: 0.0045, color: STEEL },
      ];
    },
  },
  "flashlight-walk": { draw: (ctx) => torch(ctx) },
  "flashlight-run": { draw: (ctx) => torch(ctx) },
  inject: {
    view: { dir: [0.3, 0.75, 0.65], zoom: 0.42, lift: 0.3 },
    holds: ["r"],   // (the left arm is held out for the needle: it holds nothing)
    draw(ctx) {
      const R = ctx.hand("r"), H = R.hold(SYRINGE.r), at = (k) => H.clone().addScaledVector(R.f, k);
      return [
        { cyl: [at(-SYRINGE.back), at(-0.01)], r: 0.003, color: 0xdddddd },
        { cyl: [at(-0.01), at(SYRINGE.barrel)], r: SYRINGE.r, color: 0xf2f4f6, opacity: 0.75 },
        { cyl: [at(SYRINGE.barrel), at(SYRINGE.tip)], r: 0.0013, color: 0xc8ccd0 },
      ];
    },
  },
  can: {
    view: { dir: [0.6, 0.35, 0.85], zoom: 0.45, lift: 0.3 },
    holds: ["l"],   // (the right hand opens it: it touches the can, it doesn't hold it)
    draw(ctx) {
      const L = ctx.hand("l"), c = L.hold(CAN.r);
      const top = c.clone().addScaledVector(L.u, CAN.h / 2);
      return [
        { cyl: [c.clone().addScaledVector(L.u, -CAN.h / 2), top], r: CAN.r, color: 0xb3262a },
        { cyl: [top, top.clone().addScaledVector(L.u, 0.003)], r: CAN.r * 0.92, color: 0xc8ccd0 },
      ];
    },
  },
  keypad: {
    view: { dir: [1, 0.3, -0.45], zoom: 0.45, lift: 0.32 },
    draw(ctx) {
      const [f, u, r] = KEYPAD.at, F = ctx.homeFrame, out = [wall(ctx, f + 0.02, u, r, 1.4, 1.2)];
      out.push({ box: ctx.home(f + 0.01, u, r), x: F.right, y: UP(), size: [0.1, 0.13, 0.02], color: DARK });
      for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++)
        out.push({ box: ctx.home(f - 0.002, u - (row - 1.5) * KEYPAD.pitch, r + (col - 1) * KEYPAD.pitch), x: F.right, y: UP(), size: [0.018, 0.018, 0.006], color: 0x9aa0a6 });
      out.push({ sphere: ctx.home(f - 0.003, u + 0.055, r + 0.035), r: 0.004, color: ctx.t > 3.1 ? 0x3cff6a : 0xff3c3c, glow: true });
      return out;
    },
  },
  keycard: {
    view: { dir: [1, 0.3, -0.45], zoom: 0.45, lift: 0.3 },
    draw(ctx) {
      const R = ctx.hand("r"), [f, u, r] = READER.at, F = ctx.homeFrame;
      return [
        wall(ctx, f + 0.03, u, r, 1.4, 1.2),
        { box: ctx.home(f + 0.015, u, r + 0.02), x: F.right, y: UP(), size: [0.045, 0.13, 0.03], color: DARK },
        { box: ctx.home(f - 0.001, u, r), x: F.right, y: UP(), size: [0.006, 0.1, 0.004], color: 0x050505 },
        { sphere: ctx.home(f - 0.001, u + 0.075, r + 0.025), r: 0.004, color: ctx.t > 1.15 && ctx.t < 2.2 ? 0x3cff6a : 0xff3c3c, glow: true },
        { box: R.pt(...CARD.at), x: R.p, y: R.u, size: [0.002, CARD.wid, CARD.len], color: 0xe8e2d0 },
      ];
    },
  },
  // the shotgun's own clips draw the real gun (gunPropOf); here only the shell in the left hand
  "shotgun-pump": { view: { dir: [0.9, 0.2, 0.55], zoom: 0.6, lift: 0.1 }, draw: () => [] },
  "shotgun-load": { view: { dir: [0.9, 0.2, 0.55], zoom: 0.6, lift: 0.1 }, draw: (ctx) => SHELL_TIMES.some(([a, b]) => ctx.t > a && ctx.t < b) ? shellIn(ctx.hand("l")) : [] },
  crowbar: {
    view: { dir: [0.45, 0.55, -1], zoom: 0.7, lift: 0.1 },
    draw(ctx) {
      const L = ctx.hand("l"), R = ctx.hand("r"), LH = L.hold(CROWBAR.r), RH = R.hold(CROWBAR.r), d = unit(LH.clone().sub(RH));
      const tip = LH.clone().addScaledVector(d, CROWBAR.left), hook = unit(V().crossVectors(d, UP()));
      const F = ctx.homeFrame, gap = CROWBAR.tip[2], up = ctx.floor + 1.025;
      return [
        { cyl: [RH.clone().addScaledVector(d, -0.08), tip], r: CROWBAR.r, color: 0x6e1f1a },
        { cyl: [tip, tip.clone().addScaledVector(hook, 0.03).addScaledVector(d, 0.03)], r: 0.01, color: 0x6e1f1a },
        { box: ctx.home(CROWBAR.tip[0] + 0.03, up, gap - 0.46), x: F.right, y: UP(), size: [0.9, 2.05, 0.05], color: 0x7a6a58 },
        { box: ctx.home(CROWBAR.tip[0] + 0.05, up, gap + 0.62), x: F.right, y: UP(), size: [1.2, 2.2, 0.1], color: WALL },
      ];
    },
  },
  "hold-door": {
    view: { dir: [1, 0.25, -0.15], zoom: 0.9, lift: 0 },
    draw: (ctx) => [{ box: ctx.home(DOOR.at - 0.035 * doorBang(ctx.t), ctx.floor + DOOR.height / 2, 0), x: ctx.homeFrame.right, y: UP(), size: [DOOR.width, DOOR.height, DOOR.thick], color: 0x7a6a58 }],
  },
  "drag-body": {
    view: { dir: [1, 0.35, 0.25], zoom: 1.15, lift: -0.1 },
    draw(ctx) {
      const sh = ctx.home(DRAG.reach + 0.1, DRAG.height - 0.03, 0), hips = ctx.home(DRAG.reach + 0.62, ctx.floor + 0.13, 0), CL = 0x4d5a6b;
      return [
        { sphere: ctx.home(DRAG.reach - 0.02, DRAG.height + 0.02, 0), r: 0.1, color: 0x8a6a55 },
        { cyl: [sh, hips], r: 0.15, color: CL },
        ...[-1, 1].map((s) => ({ cyl: [hips.clone().addScaledVector(ctx.homeFrame.right, 0.1 * s), ctx.home(DRAG.reach + 1.45, ctx.floor + 0.07, 0.13 * s)], r: 0.07, color: 0x2e3440 })),
        ...[-1, 1].map((s) => ({ cyl: [sh.clone().addScaledVector(ctx.homeFrame.right, 0.18 * s), ctx.home(DRAG.reach + 0.4, ctx.floor + 0.05, 0.3 * s)], r: 0.045, color: CL })),
      ];
    },
  },
  molotov: {
    view: { dir: [0.6, 0.3, 0.85], zoom: 0.5, lift: 0.3 },
    draw(ctx) {
      const R = ctx.hand("r"), L = ctx.hand("l"), r = (k) => R.hold(MOLOTOV.neck).addScaledVector(R.u, k), LH = L.hold(0.009), t = ctx.t;
      const out = [
        { cyl: [r(-0.02), r(0.04)], r: MOLOTOV.neck, color: 0x2f6b3a, opacity: 0.85 },
        { cyl: [r(-0.05), r(-0.24)], r: MOLOTOV.body, color: 0x2f6b3a, opacity: 0.85 },
        { cyl: [r(0.03), r(MOLOTOV.rag + 0.015)], r: 0.017, color: 0xe9e4d8 },
        { box: LH.clone().addScaledVector(L.u, 0.005), x: L.p, y: L.u, size: [0.012, 0.06, 0.025], color: 0xb02020 },
      ];
      if (t > MOLOTOV.lighterOn[0] && t < MOLOTOV.lighterOn[1]) out.push({ cone: [LH.clone().addScaledVector(L.u, 0.035), LH.clone().addScaledVector(UP(), 0.07)], r: 0.008, color: 0xffb040, glow: true });
      if (t > MOLOTOV.ragOn) { const k = 0.85 + 0.15 * Math.sin(t * 40); out.push({ cone: [r(MOLOTOV.rag), r(MOLOTOV.rag).addScaledVector(UP(), 0.16 * k)], r: 0.04, color: 0xff7a1a, glow: true, opacity: 0.85 }); }
      return out;
    },
  },
};
PROPS.note = {
  view: { dir: [0.75, 0.35, 0.8], zoom: 0.45, lift: 0.3 },
  holds: [],   // (pinched at its edges between the thumb and the first two fingers: no fist closes round a sheet)
  draw(ctx) { const { C, x, y } = notePose(ctx.at, ctx.homeFrame, ctx.hand("r"), ctx.t); return [{ box: C, x, y, size: [NOTE.w, NOTE.h, 0.0015], color: 0xece6d6 }]; },
};
PROPS.sink = {
  view: { dir: [0.9, 0.35, 0.4], zoom: 0.5, lift: 0.25 }, holds: ["l"],
  draw(ctx) {
    const F = ctx.homeFrame, [cf, cu, cr] = SINK.counter, o = HELD.bottle, L = ctx.hand("l"), { at } = heldShapes(L, o), on = ctx.t > 1.75 && ctx.t < 5.2;
    const sp = ctx.home(...SINK.spout), tap = ctx.home(...SINK.tap);
    return [
      { box: ctx.home(cf + 0.3, cu - 0.03, cr), x: F.right, y: UP(), size: [1.2, 0.06, 0.6], color: 0x8d9096 },
      { cyl: [ctx.home(SINK.spout[0] + 0.12, cu, 0), ctx.home(SINK.spout[0] + 0.12, SINK.spout[1] + 0.03, 0)], r: 0.012, color: STEEL },
      { cyl: [ctx.home(SINK.spout[0] + 0.12, SINK.spout[1] + 0.03, 0), sp.clone().addScaledVector(UP(), 0.03)], r: 0.01, color: STEEL },
      { cyl: [tap.clone().addScaledVector(UP(), -0.12), tap], r: 0.008, color: STEEL },
      { box: tap.clone().addScaledVector(UP(), 0.012), x: F.right, y: UP(), size: [0.07, 0.012, 0.014], color: 0xb02020 },
      { cyl: [at(-o.below), at(o.above)], r: o.r, color: o.color }, ...o.parts(null, L, at),
      ...(on ? [{ cyl: [sp, sp.clone().addScaledVector(UP(), -0.07)], r: 0.004, color: 0x9ccbe8, opacity: 0.6 }] : []),
    ];
  },
};
PROPS.breaker = {
  view: { dir: [1, 0.3, -0.45], zoom: 0.5, lift: 0.3 }, holds: ["r"],
  draw(ctx) {
    const [f, u, r] = BREAKER.pivot, F = ctx.homeFrame, kk = ease(ctx.t, 1.1, 1.75);
    const a = (BREAKER.from + (BREAKER.to - BREAKER.from) * kk) * Math.PI / 180, P = ctx.home(f, u, r);
    const handle = P.clone().addScaledVector(UP(), BREAKER.arm * Math.sin(a)).addScaledVector(F.fwd, -BREAKER.arm * Math.cos(a));
    return [
      wall(ctx, f + 0.04, u, r, 1.4, 1.2),
      { box: ctx.home(f + 0.03, u, r), x: F.right, y: UP(), size: [0.22, 0.34, 0.06], color: 0x5b6168 },
      { cyl: [P, handle], r: 0.009, color: STEEL },
      { cyl: [handle.clone().addScaledVector(F.right, 0.005), handle.clone().addScaledVector(F.right, 0.105)], r: BREAKER.bar, color: 0xb02020 },
    ];
  },
};
PROPS["walkie-down"] = {
  view: { dir: [0.6, 0.35, 0.85], zoom: 0.42, lift: 0.3 }, holds: ["r"],
  draw(ctx) {
    const o = HELD.walkie, R = ctx.hand("r"), { H, at } = heldShapes(R, o);
    return [{ box: H, x: R.f, y: R.u, size: o.box, color: o.color }, ...o.parts(H, R, at), { cyl: [at(o.box[1] / 2), at(o.box[1] / 2 + 0.014)].map((p) => p.addScaledVector(R.f, -0.012).addScaledVector(R.p, -0.006)), r: 0.008, color: 0x111111 }];
  },
};
// the held things drawn for review, from the same hand frame the bake fitted the fingers to
for (const [k, id] of [...Object.entries(HELD_CLIPS).flatMap(([k, clips]) => clips.map((clip) => [k, `hd-${k}-${clip}`])), ["bottle", "drink"], ["bar", "eat"], ["pills", "pills"], ["axe", "axe-idle"]]) PROPS[id] = {
  holds: HELD[k].two ? ["r", "l"] : ["r"],
  draw(ctx) {
    const o = HELD[k], R = ctx.hand("r"), { H, at } = heldShapes(R, o);
    const clipOf = id.replace(/^hd-[a-z]+-/, "");
    if (o.throw && (ctx.t > (RELEASE[clipOf] ?? 1e9) || ctx.t < (PICKUP[clipOf] ?? -1))) return [];   // (from the pick-up, gone at the release)
    const body = o.box ? [{ box: at(o.shift ?? 0), x: R.f, y: R.u, size: o.box, color: o.color ?? DARK }] : [{ cyl: [at(-o.below), at(o.above)], r: o.r, color: o.color ?? (k === "axe" || k === "hammer" ? WOOD : STEEL) }];
    return [...body, ...(o.parts ? o.parts(H, R, at) : [])];
  },
};
function torch(ctx) {
  const R = ctx.hand("r"), H = R.hold(TORCH.r), a = (k) => H.clone().addScaledVector(R.u, -k);   // forward = against the thumb side
  return [
    { cyl: [a(-0.07), a(0.10)], r: TORCH.r, color: DARK },
    { cyl: [a(0.10), a(0.145)], r: TORCH.head, color: DARK },
    { cyl: [a(0.145), a(0.148)], r: 0.021, color: 0xfff2c8, glow: true },
    { cone: [a(0.148), a(1.7)], r: 0.32, color: 0xfff2c8, glow: true, opacity: 0.08 },
  ];
}
const shellIn = (L) => [
  { cyl: [L.fist.clone().addScaledVector(L.f, -0.005), L.fist.clone().addScaledVector(L.f, 0.06)], r: 0.0095, color: 0xa02020 },
  { cyl: [L.fist.clone().addScaledVector(L.f, -0.008), L.fist.clone().addScaledVector(L.f, 0.006)], r: 0.0105, color: 0xc9a33a }];
function shotgunProp(ctx, loading) {
  const R = ctx.hand("r"), L = ctx.hand("l"), axis = gunAxis(R), side = unit(V().crossVectors(axis, UP())), up = V().crossVectors(side, axis);
  const g = (k, u = 0) => R.fist.clone().addScaledVector(axis, k).addScaledVector(up, u);
  // the fore-end slides under the left hand while it holds it, else sits forward
  const along = L.fist.clone().sub(R.fist).dot(axis), off = L.fist.clone().sub(g(along)).length();
  const pump = off < 0.09 ? Math.min(SHOTGUN.pump, Math.max(SHOTGUN.pump - SHOTGUN.stroke, along)) : SHOTGUN.pump;
  const out = [
    { box: g(-0.17, -0.03), x: side, y: up, size: [0.04, 0.09, 0.27], color: WOOD },
    { box: g(0.07, 0.03), x: side, y: up, size: [0.045, 0.07, 0.22], color: STEEL },
    { cyl: [g(0.18, 0.045), g(0.74, 0.045)], r: 0.011, color: STEEL },
    { cyl: [g(0.18, 0.012), g(0.66, 0.012)], r: 0.012, color: DARK },
    { box: g(pump, 0.01), x: side, y: up, size: [0.05, 0.05, 0.13], color: WOOD },
  ];
  if (loading && SHOTGUN.shells.some(([a, b]) => ctx.t > a && ctx.t < b))
    out.push({ cyl: [L.fist.clone().addScaledVector(L.f, -0.005), L.fist.clone().addScaledVector(L.f, 0.06)], r: 0.0095, color: 0xa02020 },
      { cyl: [L.fist.clone().addScaledVector(L.f, -0.008), L.fist.clone().addScaledVector(L.f, 0.006)], r: 0.0105, color: 0xc9a33a });
  return out;
}
