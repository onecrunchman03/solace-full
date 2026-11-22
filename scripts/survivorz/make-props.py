# SURVIVORZ: props simple enough to model than to find (nothing free fitted). Each is built from
# primitives at its real size and written for pack-props.mjs (props-spec src "file:...").
#
#   blender -b --factory-startup --python scripts/survivorz/make-props.py
#   → assets/downloads/survivorz/originals/inbox/ready/security-tray.glb
#
# security-tray: the grey moulded tray at an airport-style screening point (references 47): 60 x 42 cm,
# 11 cm deep, 6 mm walls flaring a little outward, rounded corners, a slightly rough plastic.
import bpy, bmesh, os
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "assets", "downloads", "survivorz", "originals", "inbox", "ready")
os.makedirs(OUT, exist_ok=True)

def fresh():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def plastic(name, rgb, rough=0.6):
    m = bpy.data.materials.new(name); m.use_nodes = True
    bs = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bs.inputs["Base Color"].default_value = (*rgb, 1); bs.inputs["Roughness"].default_value = rough
    return m

def export(obj, name):
    bpy.ops.object.select_all(action="DESELECT"); obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f"{name}.glb"), export_format="GLB", use_selection=True, export_apply=True)
    print("wrote", name)

# ---- security tray ----------------------------------------------------------------------------------------
fresh()
L, W, H, R, T, FLARE = 0.60, 0.42, 0.11, 0.045, 0.006, 1.035
bm = bmesh.new()
# a rounded rectangle, then extruded up into the tray's wall and flared out at the rim
ring = []
import math
for cx, cy, a0 in ((L / 2 - R, W / 2 - R, 0), (-L / 2 + R, W / 2 - R, 90), (-L / 2 + R, -W / 2 + R, 180), (L / 2 - R, -W / 2 + R, 270)):
    for k in range(7):
        a = math.radians(a0 + k * 15)
        ring.append(bm.verts.new((cx + R * math.cos(a), cy + R * math.sin(a), 0)))
base = bm.faces.new(ring)
top = bmesh.ops.extrude_face_region(bm, geom=[base])
up = [v for v in top["geom"] if isinstance(v, bmesh.types.BMVert)]
for v in up:
    v.co.z = H; v.co.x *= FLARE; v.co.y *= FLARE
# open the top: the extruded cap goes, leaving the floor and the walls
cap = [f for f in top["geom"] if isinstance(f, bmesh.types.BMFace) and all(v.co.z > H - 1e-6 for v in f.verts)]
bmesh.ops.delete(bm, geom=cap, context="FACES_ONLY")
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
me = bpy.data.meshes.new("security_tray"); bm.to_mesh(me); bm.free()
tray = bpy.data.objects.new("security_tray", me); bpy.context.scene.collection.objects.link(tray)
sol = tray.modifiers.new("wall", "SOLIDIFY"); sol.thickness = T; sol.offset = 1
bev = tray.modifiers.new("soft", "BEVEL"); bev.width = 0.003; bev.segments = 2; bev.limit_method = "ANGLE"
bpy.context.view_layer.objects.active = tray
bpy.ops.object.modifier_apply(modifier="wall"); bpy.ops.object.modifier_apply(modifier="soft")
bpy.ops.object.shade_auto_smooth()
tray.data.materials.append(plastic("tray_grey", (0.055, 0.058, 0.062), 0.62))   # linear: a mid-dark grey on screen
export(tray, "security-tray")
