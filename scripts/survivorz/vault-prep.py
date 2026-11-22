# SURVIVORZ: readies Dekogon's "Bank Vault Door" (Fab, bought by Josh 2026-10) for pack-props.mjs.
#   blender -b --factory-startup --python scripts/survivorz/vault-prep.py
# In:  assets/downloads/survivorz/originals/vault-door/ (the pack's FBX + 4K TGA textures)
# Out: assets/downloads/survivorz/originals/inbox/ready/vault-door.glb
#
# The pack has three meshes, all in real metres: 11a (frame with the door shut, one piece), 11b (the
# frame alone) and 11c (the leaf alone). The game wants the frame and a leaf it can swing, so this
# takes 11b + 11c:
#   - "Vault_frame": the frame, 2.0 x 2.58 x 0.5 m; its opening is 1.07 x 2.12 m (measured by ray)
#   - "Vault_leaf": its node's origin ON the hinge line (the knuckles on the leaf's -x edge), so
#     swinging it is turning the node about Y, like the lab doors (prep-inbox.mjs)
# Textures: the pack is made for Unreal but ships OpenGL normals ("normal_ogl"), so no green flip.
# Its "rma" map is R roughness, G metallic, B AO; glTF wants occlusion R, roughness G, metallic B,
# so the channels are shuffled here. Everything is written at 2K (the packer's kit tier is 2K).
import bpy, os, sys
import numpy as np
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "assets", "downloads", "survivorz", "originals", "vault-door")
OUT = os.path.join(ROOT, "assets", "downloads", "survivorz", "originals", "inbox", "ready")
TMP = os.path.join(SRC, "png")
os.makedirs(OUT, exist_ok=True); os.makedirs(TMP, exist_ok=True)
SIZE = 2048

bpy.ops.wm.read_factory_settings(use_empty=True)

def tga(set_, kind):
    return os.path.join(SRC, f"dkg_Bank_Vault_Door_{set_}.M_Bank_Vault_Door_{set_}.{kind}.1001.tga")

def png(img, name, pixels=None):
    """scale an image to SIZE and write it as PNG; returns the loaded PNG image"""
    if pixels is not None:
        out = bpy.data.images.new(name, img.size[0], img.size[1], alpha=False, float_buffer=False)
        out.pixels.foreach_set(pixels)
        img = out
    img.scale(SIZE, SIZE)
    p = os.path.join(TMP, name + ".png")
    img.filepath_raw = p
    img.file_format = "PNG"
    img.save()
    return bpy.data.images.load(p, check_existing=False)

def texture_set(set_):
    base = png(bpy.data.images.load(tga(set_, "base_color.srgb")), f"vault-{set_}-base")
    nrm = bpy.data.images.load(tga(set_, "normal_ogl.linear")); nrm.colorspace_settings.name = "Non-Color"
    nrm = png(nrm, f"vault-{set_}-normal"); nrm.colorspace_settings.name = "Non-Color"
    rma = bpy.data.images.load(tga(set_, "rma.linear")); rma.colorspace_settings.name = "Non-Color"
    px = np.empty(rma.size[0] * rma.size[1] * 4, dtype=np.float32)
    rma.pixels.foreach_get(px)
    px = px.reshape(-1, 4)
    orm = np.stack([px[:, 2], px[:, 0], px[:, 1], np.ones(len(px), dtype=np.float32)], axis=1).ravel()
    tmp = bpy.data.images.new("tmp", rma.size[0], rma.size[1], alpha=False)
    tmp.colorspace_settings.name = "Non-Color"
    orm_img = png(tmp, f"vault-{set_}-orm", pixels=orm); orm_img.colorspace_settings.name = "Non-Color"
    return base, nrm, orm_img

def material(name, base, nrm, orm):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tb = nt.nodes.new("ShaderNodeTexImage"); tb.image = base
    nt.links.new(tb.outputs["Color"], bsdf.inputs["Base Color"])
    tn = nt.nodes.new("ShaderNodeTexImage"); tn.image = nrm
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(tn.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    to = nt.nodes.new("ShaderNodeTexImage"); to.image = orm
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(to.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    # the occlusion channel: the glTF exporter picks it up from a "glTF Material Output" group
    grp = bpy.data.node_groups.get("glTF Material Output") or bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
    if "Occlusion" not in [s.name for s in grp.interface.items_tree]:
        grp.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    g = nt.nodes.new("ShaderNodeGroup"); g.node_tree = grp
    nt.links.new(sep.outputs["Red"], g.inputs["Occlusion"])
    return m

def load(f, name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.join(SRC, f))
    new = [o for o in bpy.data.objects if o not in before]
    mesh = [o for o in new if o.type == "MESH"][0]
    for o in new:
        if o is not mesh: bpy.data.objects.remove(o)
    bpy.context.view_layer.objects.active = mesh
    for o in bpy.context.selected_objects: o.select_set(False)
    mesh.select_set(True)
    mesh.parent = None
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    mesh.name = name
    return mesh

frame = load("dkg_Bank_Vault_Door_11b.fbx", "Vault_frame")
leaf = load("dkg_Bank_Vault_Door_11c.fbx", "Vault_leaf")
frame.data.materials.clear(); frame.data.materials.append(material("vault_frame", *texture_set("11b")))
leaf.data.materials.clear(); leaf.data.materials.append(material("vault_leaf", *texture_set("11a")))

# the hinge: the knuckles are the leaf's geometry within 8 cm of its -x edge; the axis runs through
# their middle in depth (Blender y), on that edge
vs = [leaf.matrix_world @ v.co for v in leaf.data.vertices]
xmin = min(v.x for v in vs)
knuckle = [v for v in vs if v.x < xmin + 0.08]
hy = sum(v.y for v in knuckle) / len(knuckle)
hinge = Vector((xmin + 0.04, hy, 0.0))
bpy.context.scene.cursor.location = hinge
for o in bpy.context.selected_objects: o.select_set(False)
leaf.select_set(True); bpy.context.view_layer.objects.active = leaf
bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
print("hinge at", tuple(round(c, 3) for c in hinge), "leaf x", round(xmin, 3), "knuckles", len(knuckle))

# one root, so the packer sees one prop
root = bpy.data.objects.new("VaultDoor", None)
bpy.context.scene.collection.objects.link(root)
frame.parent = root; leaf.parent = root

bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "vault-door.glb"), export_format="GLB", export_image_format="AUTO",
                          export_apply=True, use_selection=False)
print("wrote vault-door.glb")
