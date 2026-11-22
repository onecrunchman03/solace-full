# SURVIVORZ: a positive-pressure suit hung on its hook in the suit room (2026-10-27; REFERENCES.md L4: rows
# of suits on hangers). The free "Hazmat Suit Pack - character B" (CC BY, see free_gaps.json) is a Mixamo
# rig in a T-pose; here its arms drop, its head slumps forward and its boots hang toes-down, the pose is
# applied to the mesh and the rig thrown away, so it packs as a static prop.
#
#   blender -b --factory-startup --python scripts/survivorz/pose-suit.py
#   -> assets/downloads/survivorz/originals/inbox/ready/hazmat-suit-hung.glb
import bpy, os, math
from mathutils import Matrix, Vector
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "assets", "downloads", "survivorz", "src", "free", "3eb6ef61041a4fb4b2391f7ef9b17a8a", "scene.gltf")
OUT = os.path.join(ROOT, "assets", "downloads", "survivorz", "originals", "inbox", "ready", "hazmat-suit-hung.glb")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE")
def bone(name): return next(p for p in arm.pose.bones if p.name.startswith("mixamorig:" + name + "_"))
def aim(name, target):
    """turn a pose bone (about its head) so it points along `target`, given z up and -y the front; the
    glTF armature's own space is y up with +z the front (its object stands it up a quarter turn)"""
    pb = bone(name); h = pb.head.copy()
    t = Vector((target[0], target[2], -target[1]))
    q = (pb.tail - pb.head).normalized().rotation_difference(t.normalized())
    pb.matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ pb.matrix
    bpy.context.view_layer.update()
aim("LeftArm", (0.18, 0.02, -1)); aim("RightArm", (-0.18, 0.02, -1))           # the arms hang
aim("LeftForeArm", (0.08, -0.05, -1)); aim("RightForeArm", (-0.08, -0.05, -1))
aim("LeftHand", (0.03, -0.05, -1)); aim("RightHand", (-0.03, -0.05, -1))
aim("Neck", (0, -0.25, 1)); aim("Head", (0, -0.5, 1))                           # the empty hood slumps forward
aim("LeftFoot", (0, -0.35, -1)); aim("RightFoot", (0, -0.35, -1))               # the boots hang toes-down
bpy.ops.object.mode_set(mode="OBJECT")
for o in [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name.startswith("Icosphere")]: bpy.data.objects.remove(o)   # a stray in the file
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
for o in meshes:
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers):
        if m.type == "ARMATURE": bpy.ops.object.modifier_apply(modifier=m.name)
for o in meshes:
    mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    o.vertex_groups.clear()
for o in [o for o in bpy.context.scene.objects if o.type != "MESH"]: bpy.data.objects.remove(o)
# the stand-in sole and the shoe-sole card it ships with are a pose prop, not the suit
bpy.ops.object.select_all(action="DESELECT")
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_apply=True, export_skins=False, export_animations=False)
print("wrote hazmat-suit-hung", [o.name for o in meshes])
