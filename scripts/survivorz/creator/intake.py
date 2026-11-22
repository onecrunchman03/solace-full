# SURVIVORZ CREATOR, STEP 1: INTAKE. A dropped, rigged model in; a body the show's whole
# animation pipeline can use out (docs/survivorz/CREATOR.md).
#
#   blender -b --python scripts/survivorz/creator/intake.py -- --in <model.fbx|.glb> --id <body>
#           [--height 1.78] [--tris 45000] [--tex 2048] [--report <file.json>]
#
# Every clip in the library is converted onto a body by bone NAME, and everything after the
# retarget (built moves, hand work, gun seats, the limb-in-body law) reads the Renderpeople
# names. So the one thing that makes a Mixamo or Unreal rig a show body is renaming its bones
# to the Renderpeople names here, at the door. Then:
#   - scale to real metres (a centimetre file is caught by its height), or to --height
#   - turned to face the way the Renderpeople bodies face (read off Eric, not assumed)
#   - feet on the floor, hips over the origin
#   - over the triangle budget: decimated to it; textures over --tex: halved until they fit
#   - its own sample animation dropped
# Out: assets/downloads/survivorz/targets/<body>/<body>.gltf (gitignored, like every body), and a
# report of what was found and fixed. Refuses (exit 2) only what would break the show.
import bpy, sys, os, json, math, re
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
STAGE = os.path.join(ROOT, "assets", "downloads", "survivorz")
MAP = json.load(open(os.path.join(os.path.dirname(__file__), "joints.json")))
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(name, default=None):
    return args[args.index(name) + 1] if name in args else default

SRC = arg("--in")
BODY = arg("--id")
HEIGHT = float(arg("--height")) if arg("--height") else None
TRIS = int(arg("--tris", "45000"))
TEX = int(arg("--tex", "2048"))
REPORT = arg("--report")
report = {"id": BODY, "source": SRC, "warnings": [], "errors": [], "fixed": []}

def done(code=0):
    out = json.dumps(report, indent=1)
    if REPORT:
        with open(REPORT, "w") as f:
            f.write(out)
    print("INTAKE_REPORT " + json.dumps(report))
    sys.exit(code)

def refuse(msg):
    report["errors"].append(msg)
    done(2)

if not SRC or not BODY:
    refuse("usage: --in <model> --id <body>")
if not re.fullmatch(r"[a-z0-9-]{2,32}", BODY):
    refuse("the id must be 2-32 characters of a-z, 0-9 and -")
if not os.path.exists(SRC):
    refuse(f"no such file: {SRC}")

def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def imp(path):
    before = set(bpy.data.objects)
    low = path.lower()
    if low.endswith(".fbx"):
        bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False, ignore_leaf_bones=False)
    elif low.endswith(".glb") or low.endswith(".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        refuse("only FBX and GLB/glTF files can be dropped in")
    return [o for o in bpy.data.objects if o not in before]

def mesh_tris(objs):
    n = 0
    for o in objs:
        dg = bpy.context.evaluated_depsgraph_get()
        m = o.evaluated_get(dg).to_mesh()
        m.calc_loop_triangles()
        n += len(m.loop_triangles)
        o.evaluated_get(dg).to_mesh_clear()
    return n

def world_bounds(objs):
    lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        ev = o.evaluated_get(dg)
        m = ev.to_mesh()
        for v in m.vertices:
            p = ev.matrix_world @ v.co
            lo = Vector(map(min, lo, p)); hi = Vector(map(max, hi, p))
        ev.to_mesh_clear()
    return lo, hi

def strip(name):
    """The name a bone answers to: namespaces ('mixamorig:'), and the scans' long prefix
    ('rp_sophia_animated_003_idling_hip') taken off."""
    n = name.split(":")[-1].split("|")[-1]
    return n

def facing(arm):
    """The way the body faces, from the feet: the toes are in front of the ankles."""
    pb = {strip(b.name): b for b in arm.data.bones}
    def head(names):
        for want in names:
            for n, b in pb.items():
                if n == want or n.endswith("_" + want):
                    return arm.matrix_world @ b.head_local
        return None
    f = [head(["foot_l"]), head(["foot_r"])]
    t = [head(["ball_l"]), head(["ball_r"])]
    if None in f or None in t:
        return None
    d = ((t[0] - f[0]) + (t[1] - f[1]))
    d.z = 0
    return d.normalized() if d.length > 1e-6 else None

# ---------- the reference: which way a Renderpeople body faces ----------
clear()
ref = imp(os.path.join(STAGE, "targets", "eric", "rp_eric_rigged_001_yup_a.gltf"))
ref_arm = next(o for o in ref if o.type == "ARMATURE")
REF_FACE = facing(ref_arm) or Vector((0, -1, 0))
# the limbs' REST directions: every body rests in the same A-pose, because the moves built in
# code are written from it (a T-pose rest turned a shouldered rifle's shoulder twice as far, as
# Rollo's arms-down rest did: SURVIVORZ.md, ROLLO'S BODY). Each bone by the line to its child.
LIMBS = [(b, c) for s in ("l", "r") for b, c in (
    ("shoulder_" + s, "upperarm_" + s), ("upperarm_" + s, "lowerarm_" + s), ("lowerarm_" + s, "hand_" + s),
    ("hand_" + s, "middle_01_" + s), ("upperleg_" + s, "lowerleg_" + s), ("lowerleg_" + s, "foot_" + s))]
def limb_dir(a, b, c):
    bb = a.data.bones
    if b not in bb or c not in bb:
        return None
    return ((a.matrix_world @ bb[c].head_local) - (a.matrix_world @ bb[b].head_local)).normalized()
REF_DIRS = {b: limb_dir(ref_arm, b, c) for b, c in LIMBS}

# ---------- the dropped model ----------
clear()
objs = imp(SRC)
arms = [o for o in objs if o.type == "ARMATURE"]
if not arms:
    refuse("no skeleton in this file. Only rigged models can be dropped in for now.")
arm = max(arms, key=lambda a: len(a.data.bones))
# a skinned mesh: on this skeleton, weighted to its bones. Not a bone's display shape (Blender's
# glTF importer makes an Icosphere for them, and a file passed through Blender keeps it).
shapes = {pb.custom_shape for pb in arm.pose.bones if pb.custom_shape}
bone_names = {b.name for b in arm.data.bones}
meshes = [o for o in objs if o.type == "MESH" and o not in shapes
          and any(m.type == "ARMATURE" and m.object == arm for m in o.modifiers)
          and any(g.name in bone_names for g in o.vertex_groups)]
if not meshes:
    refuse("the skeleton has no skinned mesh on it")
for o in objs:
    if o not in meshes and o is not arm and o.type in ("MESH", "ARMATURE", "LIGHT", "CAMERA", "EMPTY"):
        if o.type == "EMPTY" and (arm.parent is o or any(m.parent is o for m in meshes)):
            continue
        bpy.data.objects.remove(o, do_unlink=True)
report["bones"] = len(arm.data.bones)

# ---------- which rig is it, and the Renderpeople names ----------
def lookup(fam, n):
    """The show's name for bone n in rig family fam, or None. Mixamo's prefix varies
    ('mixamorig:', 'mixamorig1:', or none, and a GLB export turns ':' into '_'), so its
    names are matched on the end; the scans' long prefix is matched the same way."""
    table = MAP["families"][fam]
    if n in table:
        return table[n]
    low = n.lower()
    for src, rp in table.items():
        s = src.lower()
        if low == s or low.endswith("_" + s) or (fam == "mixamo" and low.endswith(s) and low[: -len(s)].startswith("mixamorig")):
            return rp
    return None

names = [strip(b.name) for b in arm.data.bones]
scores = {fam: sum(1 for n in names if lookup(fam, n)) for fam in MAP["families"]}
fam = max(scores, key=scores.get)
report["family"] = fam
renamed, rp_seen = 0, set()
for b in arm.data.bones:
    target = lookup(fam, strip(b.name))
    if target and target not in rp_seen:
        if b.name != target:
            b.name = target
            renamed += 1
        rp_seen.add(target)
missing = [j for j in MAP["required"] if j not in rp_seen]
report["mapped"] = len(rp_seen)
report["missing"] = missing
if renamed:
    report["fixed"].append(f"renamed {renamed} bones from the {fam} rig to the show's names")
core = [j for j in MAP["core"] if j not in rp_seen]
if core:
    refuse("the skeleton is missing bones every move needs: " + ", ".join(core))
if missing:
    report["warnings"].append("no bones for " + ", ".join(missing) + " (those parts won't animate)")
fingers = [j for j in rp_seen if re.match(r"(thumb|index|middle|ring|pinky)_0", j)]
if len(fingers) < 20:
    report["warnings"].append(f"only {len(fingers)} of 30 finger bones: hands on guns and tools will look stiff")

# ---------- drop its own animation ----------
if arm.animation_data:
    arm.animation_data.action = None
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)
for pb in arm.pose.bones:
    pb.matrix_basis = Matrix.Identity(4)

# ---------- one transform on everything, then real metres ----------
bpy.ops.object.select_all(action="DESELECT")
top = arm
while top.parent:
    top = top.parent
for o in [arm] + meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = arm
# unparent from any import empty, keeping where they are
for o in [arm] + meshes:
    if o.parent and o.parent is not arm:
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(bpy.data.objects):
    if o.type == "EMPTY":
        bpy.data.objects.remove(o, do_unlink=True)

lo, hi = world_bounds(meshes)
h = hi.z - lo.z
report["heightIn"] = round(h, 4)
scale = 1.0
if HEIGHT:
    scale = HEIGHT / h
elif h > 50:            # a centimetre file
    scale = 0.01
elif h > 5:             # decimetres or inches: take it to the middle of the human range
    scale = 1.75 / h
if abs(scale - 1) > 1e-4:
    report["fixed"].append(f"scaled x{scale:.4g} to real metres")

# ---------- face the Renderpeople way ----------
face = facing(arm)
turn = 0.0
if face is None:
    report["warnings"].append("couldn't read which way it faces (no feet/toe bones); left as it came")
else:
    turn = math.atan2(REF_FACE.y, REF_FACE.x) - math.atan2(face.y, face.x)
    turn = round(turn / (math.pi / 2)) * (math.pi / 2)        # rigs are turned in quarters, never a bit
    if abs(turn) > 1e-3:
        report["fixed"].append(f"turned {round(math.degrees(turn))}° to face forward")

M = Matrix.Rotation(turn, 4, "Z") @ Matrix.Scale(scale, 4)
for o in [arm] + meshes:
    o.matrix_world = M @ o.matrix_world
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# ---------- the A-pose rest the other bodies share ----------
# Each limb aimed (parent first) along Eric's rest line, then the meshes take that pose and it
# becomes the rest. Skipped when the body already rests close to it (a Renderpeople scan).
def off_by():
    worst = 0.0
    for b, c in LIMBS:
        d, r = limb_dir(arm, b, c), REF_DIRS.get(b)
        if d is not None and r is not None:
            worst = max(worst, math.degrees(d.angle(r)))
    return worst
before = off_by()
report["restOffIn"] = round(before, 1)
if before > 8:
    if any(o.data.shape_keys for o in meshes):
        report["warnings"].append(f"rests {before:.0f}° from the show's A-pose, but its shape keys stop it being re-posed: rifle and hug moves may twist")
    else:
        bpy.ops.object.select_all(action="DESELECT")
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.mode_set(mode="POSE")
        for b, c in LIMBS:
            r = REF_DIRS.get(b)
            if r is None or b not in arm.pose.bones or c not in arm.pose.bones:
                continue
            pb = arm.pose.bones[b]
            head = arm.matrix_world @ pb.head
            now = ((arm.matrix_world @ arm.pose.bones[c].head) - head).normalized()
            q = now.rotation_difference(r)
            M = arm.matrix_world.inverted() @ (Matrix.Translation(head) @ q.to_matrix().to_4x4() @ Matrix.Translation(-head)) @ arm.matrix_world
            pb.matrix = M @ pb.matrix
            bpy.context.view_layer.update()
        bpy.ops.object.mode_set(mode="OBJECT")
        for o in meshes:
            bpy.ops.object.select_all(action="DESELECT"); o.select_set(True)
            bpy.context.view_layer.objects.active = o
            for m in list(o.modifiers):
                if m.type == "ARMATURE":
                    bpy.ops.object.modifier_apply(modifier=m.name)
        bpy.ops.object.select_all(action="DESELECT")
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.mode_set(mode="POSE"); bpy.ops.pose.armature_apply(selected=False); bpy.ops.object.mode_set(mode="OBJECT")
        for o in meshes:
            mm = o.modifiers.new("Armature", "ARMATURE"); mm.object = arm
        report["fixed"].append(f"re-posed the rest from {before:.0f}° off to the show's A-pose")
    report["restOff"] = round(off_by(), 1)

# feet on the floor, hips over the origin
lo, hi = world_bounds(meshes)
hip = arm.data.bones.get("hip")
cx = (arm.matrix_world @ hip.head_local) if hip else (lo + hi) / 2
shift = Vector((-cx.x, -cx.y, -lo.z))
if shift.length > 0.005:
    report["fixed"].append("put the feet on the floor and the hips over the centre")
for o in [arm] + meshes:
    o.matrix_world = Matrix.Translation(shift) @ o.matrix_world
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
lo, hi = world_bounds(meshes)
report["height"] = round(hi.z - lo.z, 3)
if not 1.3 <= report["height"] <= 2.2:
    report["warnings"].append(f"{report['height']} m tall is outside the adult range (1.3-2.2 m): pass --height to set it")
ua = [arm.matrix_world @ arm.data.bones[n].head_local for n in ("upperarm_l", "upperarm_r") if n in arm.data.bones]
if ua:
    report["shoulder"] = round(sum(p.z for p in ua) / len(ua), 3)
if hip:
    report["hipHeight"] = round((arm.matrix_world @ hip.head_local).z, 3)

# ---------- the budget ----------
tris = mesh_tris(meshes)
report["trisIn"] = tris
if tris > TRIS:
    ratio = TRIS / tris
    for o in meshes:
        bpy.context.view_layer.objects.active = o
        mod = o.modifiers.new("budget", "DECIMATE")
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        # the decimate has to run before the skin, or it works on the posed mesh
        while o.modifiers[0] != mod:
            bpy.ops.object.modifier_move_up(modifier=mod.name)
        bpy.ops.object.modifier_apply(modifier=mod.name)
    report["fixed"].append(f"cut {tris:,} triangles to about {TRIS:,}")
report["tris"] = mesh_tris(meshes)
for img in bpy.data.images:
    w, hgt = img.size[:]
    if max(w, hgt) > TEX:
        f = TEX / max(w, hgt)
        img.scale(max(1, int(w * f)), max(1, int(hgt * f)))
        report["fixed"].append(f"shrank texture {img.name} from {w}x{hgt}")
report["textures"] = [{"name": i.name, "size": list(i.size)} for i in bpy.data.images if i.size[0]]

# ---------- out ----------
outdir = os.path.join(STAGE, "targets", BODY)
os.makedirs(outdir, exist_ok=True)
for f in os.listdir(outdir):
    os.remove(os.path.join(outdir, f))
arm.name = "Armature"
bpy.ops.object.select_all(action="DESELECT")
for o in [arm] + meshes:
    o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=os.path.join(outdir, BODY + ".gltf"),
    export_format="GLTF_SEPARATE",
    use_selection=True,
    export_animations=False,
    export_skins=True,
    export_yup=True,
    export_image_format="AUTO",
)
report["target"] = f"{BODY}/{BODY}.gltf"
done(0)
