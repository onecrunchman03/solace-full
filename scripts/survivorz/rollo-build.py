# SURVIVORZ: builds ROLLO's body (Josh, Oct 22 2026: "make sure that Rollo's character was included in
# this animation mapping too"; his look, a realistic hazmat suit, picked the same day).
#   blender -b --python scripts/survivorz/rollo-build.py -- [--measure]
# The suit is "Hazmat Suit Worker Character" by SKP_GAMES (Sketchfab, CC-BY-4.0): one static mesh whose
# gloves are mittens (the fingers only painted on). Rollo needs the SAME skeleton as the other survivors
# so every move, gun, prop, hug and check works on him unchanged, and real fingers for the hand work. So:
#   1. Eric's Renderpeople rig is scaled to the suit and its arms posed down onto the suit's arms, and that
#      pose becomes the rest pose
#   2. the suit's mittens are cut off below the ribbed cuffs and Eric's own hands go on in their place
#      (skinned, finger bones and all), in black rubber, as the casino Rollo's gloves are
#   3. the suit takes its weights from the fitted body underneath it (nearest surface), the way clothes are
#      skinned: the bone-heat solver fails on generated meshes
#   4. the suit is dyed Rollo's purple (its yellow only: the mask, boots and face behind the visor keep theirs)
# Out: assets/downloads/survivorz/targets/rollo/rollo.gltf (gitignored, licensed: credit SKP_GAMES).
import bpy, bmesh, sys, os, math
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
D = os.path.join(ROOT, "assets", "downloads", "survivorz")
SUIT = os.path.join(D, "originals", "rollo-hazmat", "gltf", "scene.gltf")
ERIC = os.path.join(D, "targets", "eric", "rp_eric_rigged_001_yup_a.gltf")
OUT = os.path.join(D, "targets", "rollo")
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
MEASURE = "--measure" in args

def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def imp(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]

def world_verts(o):
    m = o.matrix_world
    return [m @ v.co for v in o.data.vertices]

def bbox(pts):
    xs, ys, zs = zip(*[(p.x, p.y, p.z) for p in pts])
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))

def centroid(pts):
    s = Vector((0, 0, 0))
    for p in pts: s += p
    return s / max(1, len(pts))

clear()
suit_objs = imp(SUIT)
suit = max((o for o in suit_objs if o.type == "MESH"), key=lambda o: len(o.data.vertices))
# (its parents' turn baked into its vertices: Sketchfab files hang the mesh under a node that turns it
# Z-up, and re-parented to the rig without this, the suit was exported lying on its back)
bpy.ops.object.select_all(action="DESELECT"); suit.select_set(True); bpy.context.view_layer.objects.active = suit
bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM"); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
eric_objs = imp(ERIC)
arm = [o for o in eric_objs if o.type == "ARMATURE"][0]
body = max((o for o in eric_objs if o.type == "MESH"), key=lambda o: (len(o.vertex_groups), len(o.data.vertices)))   # (not the importer's bone-display sphere)
bpy.context.view_layer.update()

S = world_verts(suit); s0, s1 = bbox(S)
E = world_verts(body); e0, e1 = bbox(E)
print("suit bbox", tuple(round(v, 3) for v in s0), tuple(round(v, 3) for v in s1))
print("eric bbox", tuple(round(v, 3) for v in e0), tuple(round(v, 3) for v in e1))

def bone_head(name):
    return arm.matrix_world @ arm.data.bones[name].head_local
for n in ["hip", "spine_03", "neck", "head", "shoulder_l", "upperarm_l", "lowerarm_l", "hand_l", "middle_01_l", "upperarm_r", "lowerarm_r", "hand_r", "upperleg_l", "lowerleg_l", "foot_l", "ball_l"]:
    print("eric", n, tuple(round(v, 3) for v in bone_head(n)))

# THE SUIT'S LANDMARKS: slices of its vertices by height. The arms hang beside the body: in each
# height band, the vertices furthest out on each side that are clear of the legs/torso.
H = s1.z - s0.z
def band(z0, z1):
    return [p for p in S if z0 <= (p.z - s0.z) / H < z1]
for k in range(30, 92, 4):
    b = band(k / 100, (k + 4) / 100)
    if not b: continue
    xs = sorted(p.x for p in b)
    print(f"suit band {k:2d}%  n {len(b):4d}  x {xs[0]:.3f} .. {xs[-1]:.3f}  y {min(p.y for p in b):.3f} .. {max(p.y for p in b):.3f}")
# the arms' centre line: the vertices out past the body's side, slice by slice
def arm_line(sign, x0=0.27):
    out = []
    for k in range(0, 70):
        z = 1.50 - k * 0.01
        pts = [p for p in S if abs(p.z - z) < 0.006 and p.x * sign > x0]
        if len(pts) >= 6: out.append((z, centroid(pts), len(pts)))
    return out
if MEASURE:
    for sign, nm in [(1, "L"), (-1, "R")]:
        line = arm_line(sign)
        for z, c, n in line[::3]: print(f"arm {nm} z {z:.2f}  centre ({c.x:.3f}, {c.y:.3f})  n {n}")
        tip = min((p for p in S if p.x * sign > 0.27), key=lambda p: p.z)
        print(f"arm {nm} lowest {tuple(round(v, 3) for v in tip)}")
    sys.exit(0)

ORIG = {b.name: b.matrix_local.copy() for b in arm.data.bones}   # Eric's own rest: the A-pose the others share

# ---- 1. THE ARMS onto the suit's: each upper arm aimed at the suit's elbow, each forearm at its
# wrist (the ribbed cuff), measured off the arm's centre line above
ARM = {"l": 1, "r": -1}
SUIT_ELBOW = {s: Vector((0.332 * k, -0.013, 1.22)) for s, k in ARM.items()}
SUIT_WRIST = {s: Vector((0.333 * k, -0.100, 1.02)) for s, k in ARM.items()}
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE")
def aim(pb, child, target):
    # (by the line to the CHILD joint: glTF bones have no tails, and the importer's guessed ones
    # point anywhere — aimed by them, the elbows went up past the shoulders)
    head = arm.matrix_world @ pb.head
    tip = arm.matrix_world @ arm.pose.bones[child].head
    want = (target - head).normalized(); now = (tip - head).normalized()
    q = now.rotation_difference(want)
    M = arm.matrix_world.inverted() @ (Matrix.Translation(head) @ q.to_matrix().to_4x4() @ Matrix.Translation(-head)) @ arm.matrix_world
    pb.matrix = M @ pb.matrix
    bpy.context.view_layer.update()
for s in ARM:
    up, lo = arm.pose.bones["upperarm_" + s], arm.pose.bones["lowerarm_" + s]
    # (the upper arm's tail is the elbow only if it is: aimed at the elbow by its head-to-child line)
    aim(up, "lowerarm_" + s, SUIT_ELBOW[s])
    aim(lo, "hand_" + s, SUIT_WRIST[s])
    print(s, "elbow", tuple(round(v, 3) for v in arm.matrix_world @ lo.head), "wrist", tuple(round(v, 3) for v in arm.matrix_world @ arm.pose.bones["hand_" + s].head))
bpy.ops.object.mode_set(mode="OBJECT")

# ---- the body bakes the pose, the pose becomes the rest
bpy.context.view_layer.objects.active = body
for m in body.modifiers:
    if m.type == "ARMATURE": bpy.ops.object.modifier_apply(modifier=m.name)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE"); bpy.ops.pose.armature_apply(selected=False); bpy.ops.object.mode_set(mode="OBJECT")
mod = body.modifiers.new("Armature", "ARMATURE"); mod.object = arm

# ---- 3. THE SUIT'S WEIGHTS from the fitted body under it (nearest surface, interpolated)
print("body groups", len(body.vertex_groups), "verts", len(body.data.vertices), "world bbox", [tuple(round(v, 2) for v in c) for c in bbox(world_verts(body))])
for g in body.vertex_groups:
    suit.vertex_groups.new(name=g.name)
dt = suit.modifiers.new("weights", "DATA_TRANSFER"); dt.object = body
dt.use_vert_data = True; dt.data_types_verts = {"VGROUP_WEIGHTS"}; dt.vert_mapping = "POLYINTERP_NEAREST"
dt.layers_vgroup_select_src = "ALL"; dt.layers_vgroup_select_dst = "NAME"; dt.use_object_transform = True
bpy.context.view_layer.objects.active = suit
bpy.ops.object.modifier_apply(modifier=dt.name)
print("suit groups", len(suit.vertex_groups), "weighted verts", sum(1 for v in suit.data.vertices if v.groups))

# ---- and HELD TO ITS OWN LIMB: a baggy suit's back and sides lie nearer the hanging arms' skin than
# the torso's, took arm weights, and stretched into a balloon when the arms came up (a rifle aim). Each
# suit vertex belongs to the part of the body whose bone line it's nearest, less that part's thickness;
# weights from a part it can't belong to are dropped and the rest renormalised.
B = lambda n: arm.matrix_world @ arm.data.bones[n].head_local
def seg_d(p, a, b):
    ab = b - a; t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9))); return (p - (a + ab * t)).length
PARTS = {"torso": [("hip", "spine_01", 0.17), ("spine_01", "spine_02", 0.18), ("spine_02", "spine_03", 0.18), ("spine_03", "neck", 0.16), ("neck", "head", 0.08), ("head", "head_end", 0.12)]}
for s_ in ("l", "r"):
    PARTS["arm_" + s_] = [("upperarm_" + s_, "lowerarm_" + s_, 0.075), ("lowerarm_" + s_, "hand_" + s_, 0.06), ("hand_" + s_, "middle_01_" + s_, 0.05)]
    PARTS["leg_" + s_] = [("upperleg_" + s_, "lowerleg_" + s_, 0.10), ("lowerleg_" + s_, "foot_" + s_, 0.07), ("foot_" + s_, "ball_" + s_, 0.06)]
SEGS = {k: [(B(a), B(b), r) for a, b, r in v] for k, v in PARTS.items()}
def part_of(name):
    for s_ in ("l", "r"):
        if name.endswith("_" + s_) and any(name.startswith(x) for x in ("upperarm", "lowerarm", "hand", "thumb", "index", "middle", "ring", "pinky")): return "arm_" + s_
        if name.endswith("_" + s_) and any(name.startswith(x) for x in ("upperleg", "lowerleg", "foot", "ball")): return "leg_" + s_
    return "torso"
ALLOW = {"torso": {"torso"}, "arm_l": {"arm_l"}, "arm_r": {"arm_r"}, "leg_l": {"leg_l"}, "leg_r": {"leg_r"}}
# (shared at the joins: a sleeve's top keeps its shoulder and chest, a leg's top its hips)
KEEP_TORSO = {"arm_l": {"shoulder_l", "spine_03", "spine_02"}, "arm_r": {"shoulder_r", "spine_03", "spine_02"}, "leg_l": {"hip", "spine_01"}, "leg_r": {"hip", "spine_01"}}
gname = {g.index: g.name for g in suit.vertex_groups}
WRIST = {s_: B("hand_" + s_) for s_ in ("l", "r")}
FORE = {s_: (B("hand_" + s_) - B("lowerarm_" + s_)).normalized() for s_ in ("l", "r")}
moved = {k: 0 for k in ALLOW}; dropped = 0
PART = {}
for v in suit.data.vertices:
    p = suit.matrix_world @ v.co
    # (never an arm past its wrist: everything there is mitten, cut below, or the thigh pockets the
    # hanging hands lie against — taken by the hand, a pocket flap followed a rifle aim up off the leg)
    PART[v.index] = min((k for k in SEGS if not (k.startswith("arm_") and (p - WRIST[k[-1]]).dot(FORE[k[-1]]) > 0.012)), key=lambda k: min(seg_d(p, a, b) - r for a, b, r in SEGS[k]))
# (and a vertex goes with its neighbours: one lone vertex at the waist's side took the left forearm, and
# the faces joining it to the hip stretched into a strip from the raised hand down to the belt)
NB = {v.index: [] for v in suit.data.vertices}
for e in suit.data.edges:
    a_, b_ = e.vertices; NB[a_].append(b_); NB[b_].append(a_)
for _ in range(4):
    flips = 0
    for i, ns in NB.items():
        if not ns: continue
        votes = {}
        for n_ in ns: votes[PART[n_]] = votes.get(PART[n_], 0) + 1
        top = max(votes, key=votes.get)
        if top != PART[i] and votes.get(PART[i], 0) * 3 < len(ns): PART[i] = top; flips += 1
    print("part smoothing pass", _, "flips", flips)
    if not flips: break
for v in suit.data.vertices:
    p = suit.matrix_world @ v.co
    part = PART[v.index]
    moved[part] += 1
    for g in list(v.groups):
        n = gname[g.group]; pp = part_of(n)
        ok = pp in ALLOW[part] or (pp == "torso" and n in KEEP_TORSO.get(part, set())) or (part == "torso" and n in ("upperleg_l", "upperleg_r", "upperleg_twist_l", "upperleg_twist_r"))
        # (the shoulder bones only near the shoulder: the suit's back stands 20-30 cm off the shoulder
        # joint, and following the shoulders' roll it swung out into a dome behind a rifle aim)
        if n in ("shoulder_l", "shoulder_r") and part in ("torso", "arm_l", "arm_r"):
            ok = (p - B("upperarm_" + n[-1])).length < 0.15
        if not ok and g.weight > 0:
            suit.vertex_groups[g.group].remove([v.index]); dropped += 1
    tot = sum(g.weight for g in v.groups)
    if tot <= 1e-6:
        # nothing left: the nearest bone of its own part takes it whole
        best = min(PARTS[part], key=lambda x: seg_d(p, B(x[0]), B(x[1])))[0]
        suit.vertex_groups[best].add([v.index], 1.0, "REPLACE")
    else:
        for g in v.groups: g.weight /= tot
print("suit parts", moved, "weights dropped", dropped)

# ---- THE AIR PACK rides the back as one piece: its shell and base plate are loose parts of the mesh
# standing 20-30 cm behind the spine, and with each of its vertices weighted on its own across three
# spine bones, a rifle aim's twist sheared it into a dome off one shoulder. Every pack vertex takes the
# SAME weights, so it moves as a block with the chest.
me = suit.data; par = list(range(len(me.vertices)))
def root(a):
    while par[a] != a: par[a] = par[par[a]]; a = par[a]
    return a
for e in me.edges:
    a, b = root(e.vertices[0]), root(e.vertices[1])
    if a != b: par[a] = b
comps = {}
for v in me.vertices: comps.setdefault(root(v.index), []).append(v.index)
PACK = set()
for ids in comps.values():
    c = centroid([suit.matrix_world @ me.vertices[i].co for i in ids])
    if c.y > 0.15 and 1.0 < c.z < 1.6 and len(ids) > 50: PACK |= set(ids)
# (on the chest's bones: it hangs off the shoulders by its harness. Weighted like the back nearest it, it
# took the hips' — the suit's back stands 15 cm off the pack's plate, at belt height)
acc = {"spine_03": 0.7, "spine_02": 0.3}
# (and the pack is MORE than those loose parts. The "loose parts" of a glTF are its UV islands: the shell
# and the plate are only the pack's back face and bottom, and its sides, top and rim are the far edge of the
# torso's islands — weighted vertex by vertex like the back they're stitched to. Walking, the rigid back
# face and the bending sides came apart along the seam and the suit's unpainted back showed through the
# holes (Josh, Oct 28 2026: "the back part seperates when he walks"). So the whole VOLUME of the pack rides
# with the chest: everything standing more than 7 cm off the person's back, inside the pack's width and
# height, takes the pack's weights; from 2 cm to 7 cm off his back it eases from his back's weights into
# the pack's, so the pack's front rim bends where it meets the suit, and nowhere else.)
def smooth(a, b, t):
    t = max(0.0, min(1.0, (t - a) / (b - a))); return t * t * (3 - 2 * t)
BODY = world_verts(body)
BACK = {}   # the person's back (Blender +Y is behind him), per 2 cm of height, over his spine (|x| < 12 cm)
for k in range(60):
    z = 0.94 + 0.02 * k
    ys = [p.y for p in BODY if abs(p.z - z) < 0.03 and abs(p.x) < 0.12]
    if ys: BACK[k] = max(ys)
def back_at(z):
    k = (z - 0.94) / 0.02; k0 = int(max(0, min(58, k)))
    a = BACK.get(k0, 0.12); b = BACK.get(k0 + 1, a); return a + (b - a) * max(0.0, min(1.0, k - k0))
pz = [(suit.matrix_world @ me.vertices[i].co).z for i in PACK]
PZ0, PZ1 = min(pz), max(pz)   # the pack's bottom (its plate) and the top of its shell
RIGID = {}
for v in me.vertices:
    if v.index in PACK: RIGID[v.index] = 1.0; continue
    p = suit.matrix_world @ v.co
    a = smooth(0.02, 0.07, p.y - back_at(p.z)) * (1 - smooth(0.15, 0.19, abs(p.x))) * smooth(PZ0 - 0.06, PZ0 - 0.01, p.z) * (1 - smooth(PZ1 + 0.03, PZ1 + 0.09, p.z))
    if a > 0.001: RIGID[v.index] = a
# (and the suit it's sewn to eases off it ALONG THE SURFACE: the plate's front edge is stitched to the belt,
# which goes with the hips, and with nothing between them a crouch pulled that one row of the plate 15-30 cm
# out of the pack. Every vertex within EASE of the pack across the surface, seams crossed, now carries some
# of its weights, so the bend is spread over the fabric under it.)
from mathutils import kdtree
import heapq
EASE = 0.08
mw = suit.matrix_world; P_ = [mw @ v.co for v in me.vertices]
kd = kdtree.KDTree(len(P_))
for i, p in enumerate(P_): kd.insert(p, i)
kd.balance()
ADJ = {i: [] for i in range(len(P_))}
for e in me.edges:
    a_, b_ = e.vertices; d_ = (P_[a_] - P_[b_]).length; ADJ[a_].append((b_, d_)); ADJ[b_].append((a_, d_))
for i, p in enumerate(P_):
    for _, j, _ in kd.find_range(p, 2e-5):
        if j != i: ADJ[i].append((j, 0.0))
dist = {i: 0.0 for i, a in RIGID.items() if a > 0.99}
heap = [(0.0, i) for i in dist]; heapq.heapify(heap)
while heap:
    d_, i = heapq.heappop(heap)
    if d_ > dist.get(i, 1e9) or d_ > EASE: continue
    for j, l in ADJ[i]:
        nd = d_ + l
        if nd < dist.get(j, 1e9) and nd <= EASE: dist[j] = nd; heapq.heappush(heap, (nd, j))
eased = 0
for i, d_ in dist.items():
    a = 1 - smooth(0.0, EASE, d_)
    if a > RIGID.get(i, 0.0) + 1e-3: RIGID[i] = a; eased += 1
print("pack ease along the surface:", eased, "verts")
for i, a in RIGID.items():
    old = {gname[g.group]: g.weight * (1 - a) for g in me.vertices[i].groups}
    for k, w in acc.items(): old[k] = old.get(k, 0) + w * a
    for g in list(me.vertices[i].groups): suit.vertex_groups[g.group].remove([i])
    for k, w in old.items():
        if w > 1e-4: suit.vertex_groups[k].add([i], w, "REPLACE")
print("air pack", len(PACK), "loose verts +", sum(1 for i, a in RIGID.items() if i not in PACK and a > 0.99), "of its sides rigid,",
      sum(1 for i, a in RIGID.items() if i not in PACK and a <= 0.99), "easing, on", acc, "; pack z", round(PZ0, 3), "..", round(PZ1, 3))

# ---- THE HOOD AND MASK on the head, not the face: Eric's face bones (jaw, lips, eyes) carried the hood's
# chin and the visor, which opened and blinked with his face
FACE = ("jaw", "mouth", "lip", "eye", "lid", "brow", "cheek", "tongue", "teeth", "nose")
face_g = [g for g in suit.vertex_groups if any(f in g.name for f in FACE)]
moved_face = 0
for v in me.vertices:
    fw = sum(g.weight for g in v.groups if gname[g.group] in {x.name for x in face_g})
    if fw <= 0: continue
    for g in list(v.groups):
        if gname[g.group] in {x.name for x in face_g}: suit.vertex_groups[g.group].remove([v.index])
    hw = next((g.weight for g in v.groups if gname[g.group] == "head"), 0)
    suit.vertex_groups["head"].add([v.index], hw + fw, "REPLACE"); moved_face += 1
print("face groups", [g.name for g in face_g], "-> head on", moved_face, "verts")

# ---- ONE WEIGHT FOR EVERY POINT OF THE SURFACE: the suit is one surface cut into islands along its UV
# seams, so each seam point is two or three vertices standing on the same spot. Every step above weights a
# vertex by its OWN island (the limb vote follows edges, which stop at a seam; the pack took whole islands),
# and 101 seam points ended up carrying different weights on each side, up to all hip on one and all chest
# on the other. The two sides then go different ways and the seam opens into a crack. Every vertex on a
# spot takes the same weights now (the mean, its four strongest), so no seam can open.
upar = list(range(len(P_)))   # (P_ and kd: the suit's points, from the pack's ease above)
def uroot(a):
    while upar[a] != a: upar[a] = upar[upar[a]]; a = upar[a]
    return a
for i, p in enumerate(P_):
    for _, j, _ in kd.find_range(p, 2e-5):
        a, b = uroot(i), uroot(j)
        if a != b: upar[a] = b
spots = {}
for i in range(len(P_)): spots.setdefault(uroot(i), []).append(i)
synced = 0; worst = 0.0
for ids in spots.values():
    if len(ids) < 2: continue
    ws = [{g.group: g.weight for g in me.vertices[i].groups} for i in ids]
    keys = set().union(*ws)
    worst = max(worst, max(max(w.get(k, 0) for w in ws) - min(w.get(k, 0) for w in ws) for k in keys))
    mean = {k: sum(w.get(k, 0) for w in ws) / len(ws) for k in keys}
    top = sorted(mean.items(), key=lambda x: -x[1])[:4]; tot = sum(w for _, w in top)
    for i in ids:
        for g in list(me.vertices[i].groups): suit.vertex_groups[g.group].remove([i])
        for k, w in top: suit.vertex_groups[k].add([i], w / tot, "REPLACE")
    synced += 1
print("seam points", synced, "share one weight each (the worst had differed by", round(worst, 3), ")")

# ---- THE PERSON INSIDE, for the law (anim-law.js vertexIndex law: true): Eric's own body, cut down to a
# few thousand faces and hidden by every page that loads Rollo ("*body_proxy*"). The animation law asks
# that no arm or leg pass through a body, and read off the suit's torso — the air pack, the baggy hips —
# Rollo's own arms and thighs measured 10-19 cm "inside" it on 79 clips and were thrown wide to clear
# air. His limbs are still the suit's: a sleeve may press into the suit's chest, never through him.
proxy = body.copy(); proxy.data = body.data.copy(); proxy.name = "rollo_body_proxy"; proxy.data.name = "rollo_body_proxy"
bpy.context.collection.objects.link(proxy)
for m in list(proxy.modifiers): proxy.modifiers.remove(m)   # (the pose is already applied: the decimation alone)
dec = proxy.modifiers.new("decimate", "DECIMATE"); dec.ratio = min(1.0, 8000 / max(1, len(proxy.data.polygons)))
bpy.ops.object.select_all(action="DESELECT"); bpy.context.view_layer.objects.active = proxy; proxy.select_set(True)
bpy.ops.object.modifier_apply(modifier=dec.name)
proxy.data.materials.clear()
print("body proxy", len(proxy.data.polygons), "faces")

# ---- 2. THE HANDS: Eric's (everything his hand and finger bones carry most), cut from his body
HAND_BONES = lambda s: {"hand_" + s} | {f"{f}_0{k}_{s}" for f in ["thumb", "index", "middle", "ring", "pinky"] for k in (1, 2, 3)} | {f"{f}_end_{s}" for f in ["thumb", "index", "middle", "ring", "pinky"]}
gi = {g.index: g.name for g in body.vertex_groups}
def top_group(v):
    best = max(v.groups, key=lambda g: g.weight, default=None)
    return gi.get(best.group) if best else None
keep = set(HAND_BONES("l") | HAND_BONES("r"))
bpy.ops.object.select_all(action="DESELECT"); bpy.context.view_layer.objects.active = body; body.select_set(True)
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="DESELECT"); bpy.ops.object.mode_set(mode="OBJECT")
for v in body.data.vertices: v.select = top_group(v) in keep
print("hand verts chosen", sum(1 for v in body.data.vertices if v.select), "groups on a vertex e.g.", [gi.get(g.group) for g in body.data.vertices[0].groups][:4])
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.separate(type="SELECTED"); bpy.ops.object.mode_set(mode="OBJECT")
hands = [o for o in bpy.context.selected_objects if o is not body][0]
hands.name = "rollo_gloves"
print("hand verts", len(hands.data.vertices))
bpy.data.objects.remove(body, do_unlink=True)

# ---- the suit's MITTENS off: past each wrist, down the forearm's line (a cuff's width kept: it
# covers the join)
# (everything deselected first: an imported mesh arrives with every vertex selected, and the first
# cut deleted the whole suit)
bpy.ops.object.select_all(action="DESELECT"); suit.select_set(True); bpy.context.view_layer.objects.active = suit
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_mode(type="VERT"); bpy.ops.mesh.select_all(action="DESELECT"); bpy.ops.object.mode_set(mode="OBJECT")
mw = suit.matrix_world
cut = 0
for s, k in ARM.items():
    W = arm.matrix_world @ arm.data.bones["hand_" + s].head_local
    E = arm.matrix_world @ arm.data.bones["lowerarm_" + s].head_local
    d = (W - E).normalized()
    for v in suit.data.vertices:
        p = mw @ v.co
        along = (p - W).dot(d)
        if along > 0.012 and (p - W - d * along).length < 0.11 and p.x * k > 0.18:
            v.select = True; cut += 1
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.delete(type="VERT"); bpy.ops.object.mode_set(mode="OBJECT")
print("suit verts left", len(suit.data.vertices), "faces", len(suit.data.polygons))
print("mitten verts cut", cut)

# ---- the gloves: black rubber, as the casino Rollo's are
glove = bpy.data.materials.new("rollo_glove")
if hasattr(glove, "use_nodes") and not glove.node_tree: glove.use_nodes = True
bsdf = glove.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Base Color"].default_value = (0.018, 0.018, 0.02, 1); bsdf.inputs["Roughness"].default_value = 0.45
hands.data.materials.clear(); hands.data.materials.append(glove)

# ---- 4. THE SUIT IN ROLLO'S PURPLE: its yellow hues only (the mask, the boots and the face behind the
# visor keep theirs)
import numpy as np, colorsys
mat = suit.active_material
img = [n for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and n.image and "baseColor" in n.image.name]
img = img[0].image if img else [n for n in mat.node_tree.nodes if n.type == "TEX_IMAGE"][0].image
px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
r, g, b = px[:, 0], px[:, 1], px[:, 2]
mx, mn = px[:, :3].max(1), px[:, :3].min(1); sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
# hue in degrees
d_ = np.maximum(mx - mn, 1e-6)
hue = np.where(mx == r, (g - b) / d_ % 6, np.where(mx == g, (b - r) / d_ + 2, (r - g) / d_ + 4)) * 60
# THE CLOTH, judged by its neighbourhood: a yellowish pixel (hue 34-80 — skin sits just under it — the pale and the khaki-shaded
# included) is dyed when most of the 9x9 texels round it are yellowish too. A threshold alone couldn't
# split the suit's washed-out highlights (left khaki streaks over the shoulders) from pale specks in
# the grey respirator and the face (dyed purple dots on the filter and the nose).
loose = ((hue > 34) & (hue < 80) & (sat > 0.12) & (mx > 0.06)).astype(np.float32)
W_, H_ = img.size
L = loose.reshape(H_, W_); R_ = 4
cs = np.pad(L, ((1, 0), (1, 0))).cumsum(0).cumsum(1)
y0 = np.clip(np.arange(H_) - R_, 0, H_); y1 = np.clip(np.arange(H_) + R_ + 1, 0, H_)
x0 = np.clip(np.arange(W_) - R_, 0, W_); x1 = np.clip(np.arange(W_) + R_ + 1, 0, W_)
box = cs[y1][:, x1] - cs[y0][:, x1] - cs[y1][:, x0] + cs[y0][:, x0]
area = (y1 - y0)[:, None] * (x1 - x0)[None, :]
yellow = (loose.reshape(H_, W_) > 0) & (box / area >= 0.7)
yellow = yellow.ravel()
print("yellow pixels", int(yellow.sum()), "of", len(px))
# ROLLO'S PURPLE IS THE CASINO SUIT'S (his casino suit went purple on Oct 14, "dyed purple for luck"):
# the casino's own yellow suit put through the SAME filter the game dyes it with
# (client/src/backrooms/suitcolor.ts SUIT_FILTER.purple, applied per pixel as filterPixels does: sRGB,
# clamped after each step), averaged, then scaled by each pixel's own brightness against the yellow's,
# so the folds and the shading come through (kept at the yellow's VALUE instead, the dark dye came out
# near black)
PURPLE = [("hue-rotate", 212), ("saturate", 1.5), ("brightness", 0.6), ("contrast", 1.15)]
def css_filter(rgb, ops):
    for fn, v in ops:
        if fn == "hue-rotate":
            a = math.radians(v); c, s_ = math.cos(a), math.sin(a)
            M = np.array([[0.213 + c * 0.787 - s_ * 0.213, 0.715 - c * 0.715 - s_ * 0.715, 0.072 - c * 0.072 + s_ * 0.928],
                          [0.213 - c * 0.213 + s_ * 0.143, 0.715 + c * 0.285 + s_ * 0.14, 0.072 - c * 0.072 - s_ * 0.283],
                          [0.213 - c * 0.213 - s_ * 0.787, 0.715 - c * 0.715 + s_ * 0.715, 0.072 + c * 0.928 + s_ * 0.072]])
            rgb = np.clip(rgb @ M.T, 0, 1)
        elif fn == "saturate":
            M = np.array([[0.213 + 0.787 * v, 0.715 - 0.715 * v, 0.072 - 0.072 * v],
                          [0.213 - 0.213 * v, 0.715 + 0.285 * v, 0.072 - 0.072 * v],
                          [0.213 - 0.213 * v, 0.715 - 0.715 * v, 0.072 + 0.928 * v]])
            rgb = np.clip(rgb @ M.T, 0, 1)
        elif fn == "brightness": rgb = np.clip(rgb * v, 0, 1)
        elif fn == "contrast": rgb = np.clip((rgb - 0.5) * v + 0.5, 0, 1)
    return rgb
casino = bpy.data.images.load(os.path.join(ROOT, "client", "public", "assets", "hazmat", "hazmat_yellow.png"))
cp = np.array(casino.pixels[:], dtype=np.float32).reshape(-1, 4)[:, :3]
# (an 8-bit PNG's pixels read back as stored, sRGB: the space the filter works in)
cy = cp[(cp[:, 0] > 0.3) & (cp[:, 1] > 0.2) & (cp[:, 2] < cp[:, 1] * 0.5)]
target = css_filter(cy, PURPLE).mean(0)
print("casino purple", [round(float(v), 3) for v in target], "from", len(cy), "yellow pixels")
lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
lref = float(lum[yellow].mean()); tl = float(0.2126 * target[0] + 0.7152 * target[1] + 0.0722 * target[2])
k_ = (lum[yellow] / max(lref, 1e-6))[:, None]
px[yellow, :3] = np.clip(target[None, :] * k_, 0, 1)
dyed = bpy.data.images.new("rollo_suit_baseColor", img.size[0], img.size[1], alpha=True)
dyed.pixels = px.ravel().tolist()
os.makedirs(OUT, exist_ok=True)
dyed.filepath_raw = os.path.join(OUT, "rollo_suit_baseColor.png"); dyed.file_format = "PNG"; dyed.save()
for n in mat.node_tree.nodes:
    if n.type == "TEX_IMAGE" and n.image == img: n.image = dyed

# ---- BACK TO THE A-POSE the others rest in: the suit bent up with the arms (its weights found with the
# arms down, where the suit's arms are), and that made the rest. Resting arms-down, a rifle shouldered
# turned the shoulder 120 degrees from rest and the baggy suit ballooned behind it; from the A-pose it's
# half that, as for the other five
for o in (suit, hands, proxy):
    for m in list(o.modifiers):
        if m.type == "ARMATURE": o.modifiers.remove(m)
    mm = o.modifiers.new("Armature", "ARMATURE"); mm.object = arm
bpy.ops.object.select_all(action="DESELECT"); bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE")
for s_ in ("l", "r"):
    for n in ("upperarm_" + s_, "lowerarm_" + s_, "hand_" + s_):
        arm.pose.bones[n].matrix = ORIG[n]; bpy.context.view_layer.update()
bpy.ops.object.mode_set(mode="OBJECT")
for o in (suit, hands, proxy):
    bpy.ops.object.select_all(action="DESELECT"); o.select_set(True); bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers):
        if m.type == "ARMATURE": bpy.ops.object.modifier_apply(modifier=m.name)
bpy.ops.object.select_all(action="DESELECT"); bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE"); bpy.ops.pose.armature_apply(selected=False); bpy.ops.object.mode_set(mode="OBJECT")
print("rest back to the A-pose: hand_l at", tuple(round(v, 3) for v in arm.matrix_world @ arm.data.bones["hand_l"].head_local))

# ---- skinned to the rig, and out
for o in (suit, hands, proxy):
    for m in list(o.modifiers):
        if m.type == "ARMATURE": o.modifiers.remove(m)
    mm = o.modifiers.new("Armature", "ARMATURE"); mm.object = arm
    o.parent = arm
suit.name = "rollo_suit"
bpy.ops.object.select_all(action="DESELECT")
for o in (arm, suit, hands, proxy): o.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "rollo.gltf"), export_format="GLTF_SEPARATE", use_selection=True, export_skins=True, export_animations=False)
print("wrote", os.path.join(OUT, "rollo.gltf"))
