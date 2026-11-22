# SURVIVORZ: the shared kit for the props we model ourselves (make-res.py; make-hall.py keeps its own copy,
# the first). Boxes, tubes and cylinders into one mesh per prop, each face carrying its material slot.
# Blender axes: x across, y depth (the FRONT faces -y, which is +z in the game), z up.
import bpy, bmesh, os, math
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "assets", "downloads", "survivorz", "originals", "inbox", "ready")
os.makedirs(OUT, exist_ok=True)

def fresh():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def mat(name, rgb, rough=0.5, metal=0.0, alpha=1.0):
    """colours are LINEAR (0.32 renders near-white on screen)"""
    m = bpy.data.materials.new(name); m.use_nodes = True
    bs = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bs.inputs["Base Color"].default_value = (*rgb, 1); bs.inputs["Roughness"].default_value = rough
    bs.inputs["Metallic"].default_value = metal
    if alpha < 1: bs.inputs["Alpha"].default_value = alpha
    return m

def palette():
    """the one corporate kit (references R22: the same finishes everywhere)"""
    return {
        "white": mat("laminate_white", (0.45, 0.46, 0.465), 0.42),
        "dark": mat("plinth_dark", (0.018, 0.019, 0.021), 0.55),
        "steel": mat("brushed_steel", (0.55, 0.56, 0.57), 0.32, 0.6),
        "black": mat("black_glass", (0.008, 0.009, 0.011), 0.08),
        "glass": mat("glass_clear", (0.7, 0.8, 0.76), 0.05, 0.0, alpha=0.2),
        "frosted": mat("glass_frosted", (0.62, 0.66, 0.66), 0.35, 0.0, alpha=0.55),
        "fabric": mat("fabric_slate", (0.06, 0.075, 0.095), 0.9),
        "mattress": mat("mattress_grey", (0.22, 0.23, 0.24), 0.85),
        "olive": mat("olive_drab", (0.06, 0.07, 0.035), 0.7),
        "canvas": mat("canvas_olive", (0.09, 0.09, 0.05), 0.9),
        "accent": mat("halcyon_teal", (0.02, 0.16, 0.17), 0.45),
    }

class Builder:
    def __init__(self, name, M):
        self.bm = bmesh.new(); self.name = name; self.slots = []; self.M = M
    def slot(self, key):
        if key not in self.slots: self.slots.append(key)
        return self.slots.index(key)
    def _paint(self, verts, key):
        i = self.slot(key)
        for f in {f for v in verts for f in v.link_faces}: f.material_index = i
    def box(self, x0, y0, z0, x1, y1, z1, key, xf=None):
        r = bmesh.ops.create_cube(self.bm, size=1.0)
        for v in r["verts"]:
            v.co = Vector(((x0 + x1) / 2 + v.co.x * (x1 - x0), (y0 + y1) / 2 + v.co.y * (y1 - y0), (z0 + z1) / 2 + v.co.z * (z1 - z0)))
            if xf: v.co = xf @ v.co
        self._paint(r["verts"], key)
    def tube(self, a, b, r, key, seg=10):
        a, b = Vector(a), Vector(b)
        d = b - a
        res = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=d.length)
        rot = d.to_track_quat("Z", "Y").to_matrix().to_4x4()
        for v in res["verts"]: v.co = (Matrix.Translation((a + b) / 2) @ rot) @ v.co
        self._paint(res["verts"], key)
    def cyl(self, cx, cy, z0, z1, r, key, seg=16):
        self.tube((cx, cy, z0), (cx, cy, z1), r, key, seg)
    def done(self):
        me = bpy.data.meshes.new(self.name); self.bm.normal_update(); self.bm.to_mesh(me); self.bm.free()
        for k in self.slots: me.materials.append(self.M[k])
        o = bpy.data.objects.new(self.name, me); bpy.context.scene.collection.objects.link(o)
        return o

def export(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f"{name}.glb"), export_format="GLB", use_selection=True, export_apply=True)
    print("wrote", name)
