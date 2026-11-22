# SURVIVORZ: export every zombie in Difffuse Studio's Zombie Pack (LP set) to its
# own GLB, at the origin, with its skin colour BAKED.
#
# The pack computes each zombie's skin in the shader (a tint mixed over the
# colour map through a node group), which glTF can't carry — exported raw, every
# zombie comes out the colour of the bare map. So each material whose Base Color
# isn't a plain image gets that colour baked to a 1K texture first: the colour is
# wired into an emission shader and baked as EMIT, which is exact (a diffuse bake
# would darken anything metallic or subsurface).
#
#   blender -b "<pack>/SubCategories/All Zombies LP/models.blend" --python \
#     scripts/survivorz/zombie-export.py -- <outDir> [onlyName]
import bpy, sys, os, re

args = sys.argv[sys.argv.index("--") + 1:]
OUT = args[0]
ONLY = args[1] if len(args) > 1 else ""
os.makedirs(OUT, exist_ok=True)
TMP = os.path.join(OUT, "_bake"); os.makedirs(TMP, exist_ok=True)

sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.samples = 1
sc.cycles.device = "CPU"
sc.render.bake.margin = 4
sc.render.bake.use_clear = True

def bsdf_of(m):
    return next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if m and m.use_nodes else None

def needs_bake(m):
    b = bsdf_of(m)
    if not b or not b.inputs["Base Color"].is_linked: return False
    return b.inputs["Base Color"].links[0].from_node.type != "TEX_IMAGE"

def output_of(m):
    return next((n for n in m.node_tree.nodes if n.type == "OUTPUT_MATERIAL" and n.is_active_output), None) or \
        next((n for n in m.node_tree.nodes if n.type == "OUTPUT_MATERIAL"), None)

def bake_object(o):
    mats = [s.material for s in o.material_slots if s.material]
    todo = [m for m in mats if needs_bake(m)]
    if not todo: return []
    undo, done = [], []
    for m in mats:
        nt = m.node_tree
        img_node = nt.nodes.new("ShaderNodeTexImage")
        if m in todo:
            img = bpy.data.images.new(f"{m.name}_baked", 1024, 1024)
            img_node.image = img
            out = output_of(m); b = bsdf_of(m)
            old = out.inputs["Surface"].links[0].from_socket if out.inputs["Surface"].is_linked else None
            em = nt.nodes.new("ShaderNodeEmission")
            nt.links.new(b.inputs["Base Color"].links[0].from_socket, em.inputs["Color"])
            nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
            undo.append((m, img_node, em, old, out)); done.append((m, img))
        else:
            img_node.image = bpy.data.images.get("_throwaway") or bpy.data.images.new("_throwaway", 8, 8)
            undo.append((m, img_node, None, None, None))
        nt.nodes.active = img_node
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.bake(type="EMIT")
    for m, img_node, em, old, out in undo:
        nt = m.node_tree
        if em:
            if old: nt.links.new(old, out.inputs["Surface"])
            nt.nodes.remove(em)
        if img_node.image and img_node.image.name == "_throwaway": nt.nodes.remove(img_node)
    for m, img in done:
        path = os.path.join(TMP, re.sub(r"[^A-Za-z0-9_]+", "_", m.name) + ".jpg")
        img.filepath_raw = path; img.file_format = "JPEG"; img.save()
        img.source = "FILE"; img.reload()
        node = next(n for n in m.node_tree.nodes if n.type == "TEX_IMAGE" and n.image == img)
        node.location = (-400, 300)
        m.node_tree.links.new(node.outputs["Color"], bsdf_of(m).inputs["Base Color"])
    return [m.name for m, _ in done]

meshes = [o for o in bpy.data.objects if o.type == "MESH" and re.search(r"Zombie_LP_\d+$", o.name)]
for o in sorted(meshes, key=lambda o: o.name):
    if ONLY and ONLY not in o.name: continue
    arm = next((m.object for m in o.modifiers if m.type == "ARMATURE" and m.object), None)
    if not arm: print("NO ARMATURE", o.name); continue
    kind = "f" if "Female" in o.name else "m"
    num = int(re.search(r"(\d+)$", o.name).group(1))
    name = f"zombie-{kind}{num:02d}"
    baked = bake_object(o)
    # to the origin: the pack lays the zombies out in a row
    off = arm.location.copy(); arm.location = (0, 0, arm.location.z - off.z)
    if o.parent != arm: o.location = o.location - off
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True); o.select_set(True); bpy.context.view_layer.objects.active = arm
    path = os.path.join(OUT, name + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format="GLB", export_animations=False,
                              export_yup=True, export_image_format="AUTO")
    arm.location = off
    if o.parent != arm: o.location = o.location + off
    print("EXPORTED", name, o.name, "baked:", baked, os.path.getsize(path) // 1024, "KB")
