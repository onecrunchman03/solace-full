# SURVIVORZ, GLENRIDGE HALL: THE SET FOR THE SHOW, STEP TWO. The materials that are node set-ups (slates each their
# own colour, stone flags, lino, sprigged paper, the trellis carpet, boarding, leaded glass) reach a GLB as one flat
# colour. This bakes each to a tiling picture and swaps the material for one made of pictures, which a GLB keeps.
#
#   blender -b <assets>/set/glenridge-game.blend --python game-materials.py --python game-export.py
#
# HOW: a square of the material, its UVs in metres as the house's are, baked flat (colour, the bump as a normal map,
# roughness) to <assets>/set/glen-tex/<name>-{color,normal,rough}.jpg. THE SQUARE'S SIZE IS CHOSEN TO FIT THE
# PATTERN (whole slates, whole flags, whole boards, whole diamonds), so the picture tiles on the pattern's own
# joints; each slate's or board's own colour does not repeat inside it and jumps at the edge every few metres.
# Glass is drawn, not baked: lead lines opaque, panes nearly clear.
import bpy, os, sys, math

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
ASSETS = os.environ.get("SURVIVORZ_ASSETS") or os.path.join(ROOT, "assets", "downloads", "survivorz")
OUT = os.path.join(ASSETS, "set", "glen-tex"); os.makedirs(OUT, exist_ok=True)
R2 = math.sqrt(2)
# name: (metres across, metres up, pixels)
TILES = {
    "slate": (0.27 * 16, 0.17 * 24, 2048), "bluestone": (0.62 * 6, 0.41 * 8, 2048), "kitchenfloor": (0.46 * 8, 0.46 * 8, 1024),
    "wallpaper": (3.0, 3.0, 2048), "latticecarpet": (R2 / 9 * 18, R2 / 9 * 18, 1024),
    "plankwall": (2.6, 0.08 * 16, 1024), "beamdark": (3.2, 0.15 * 8, 1024), "boardceil": (3.0, 0.14 * 8, 1024), "porchceil": (3.0, 0.14 * 8, 1024),
}
GLASS = {"leaded": (0.76, 0.8, 0.76, 0.2), "frosted": (0.8, 0.8, 0.78, 0.62)}

scene = bpy.context.scene; scene.render.engine = "CYCLES"; scene.cycles.samples = 16
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences; prefs.compute_device_type = "OPTIX"; prefs.get_devices()
    for d in prefs.devices: d.use = True
    scene.cycles.device = "GPU"
except Exception as e: print("baking on the CPU:", e)

def picture_material(m, files, sx, sy, alpha=False):
    nt = m.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial"); b = nt.nodes.new("ShaderNodeBsdfPrincipled"); nt.links.new(b.outputs[0], out.inputs["Surface"])
    tc = nt.nodes.new("ShaderNodeTexCoord"); mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (1 / sx, 1 / sy, 1); nt.links.new(tc.outputs["UV"], mp.inputs["Vector"])
    def img(path, colour):
        n = nt.nodes.new("ShaderNodeTexImage"); n.image = bpy.data.images.load(path, check_existing=True)
        if not colour: n.image.colorspace_settings.name = "Non-Color"
        nt.links.new(mp.outputs["Vector"], n.inputs["Vector"]); return n
    c = img(files["color"], True); nt.links.new(c.outputs["Color"], b.inputs["Base Color"])
    if alpha: nt.links.new(c.outputs["Alpha"], b.inputs["Alpha"]); b.inputs["Roughness"].default_value = 0.08; m.blend_method = "BLEND"
    if "rough" in files: nt.links.new(img(files["rough"], False).outputs["Color"], b.inputs["Roughness"])
    if "normal" in files:
        nm = nt.nodes.new("ShaderNodeNormalMap"); nt.links.new(img(files["normal"], False).outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])

done = []
for name, (sx, sy, px) in TILES.items():
    m = bpy.data.materials.get(name)
    if m is None: continue
    me = bpy.data.meshes.new("tile-" + name); me.from_pydata([(0, 0, 0), (sx, 0, 0), (sx, sy, 0), (0, sy, 0)], [], [(0, 1, 2, 3)])
    uvm = me.uv_layers.new(name="UVMap"); uvb = me.uv_layers.new(name="bake")
    for lp, (u, v) in zip(me.polygons[0].loop_indices, ((0, 0), (sx, 0), (sx, sy), (0, sy))): uvm.data[lp].uv = (u, v); uvb.data[lp].uv = (u / sx, v / sy)
    uvm.active_render = True; me.uv_layers.active = uvb                                        # the material reads metres; the bake writes 0..1
    ob = bpy.data.objects.new("tile-" + name, me); ob.location = (0, 0, -500); scene.collection.objects.link(ob); me.materials.append(m)
    bpy.ops.object.select_all(action="DESELECT"); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    files = {}
    for kind, bake, colour in (("color", "DIFFUSE", True), ("normal", "NORMAL", False), ("rough", "ROUGHNESS", False)):
        im = bpy.data.images.new("bake-%s-%s" % (name, kind), px, px, alpha=False); im.colorspace_settings.name = "sRGB" if colour else "Non-Color"
        node = m.node_tree.nodes.new("ShaderNodeTexImage"); node.image = im; m.node_tree.nodes.active = node
        if bake == "DIFFUSE": scene.render.bake.use_pass_direct = False; scene.render.bake.use_pass_indirect = False; scene.render.bake.use_pass_color = True
        bpy.ops.object.bake(type=bake, margin=0, use_clear=True)
        path = os.path.join(OUT, "%s-%s.jpg" % (name, kind)); im.filepath_raw = path; im.file_format = "JPEG"; scene.render.image_settings.quality = 92; im.save()
        m.node_tree.nodes.remove(node); bpy.data.images.remove(im); files[kind] = path
    bpy.data.objects.remove(ob, do_unlink=True)
    picture_material(m, files, sx, sy); done.append(name)

for name, (r, g, b_, a) in GLASS.items():                       # the leading, drawn: scale (12, 8) then turned 45 degrees, as build.py's is
    m = bpy.data.materials.get(name)
    if m is None: continue
    px = 512; S = R2; im = bpy.data.images.new("glass-" + name, px, px, alpha=True); buf = [0.0] * (px * px * 4); c45 = s45 = math.sqrt(0.5); mortar = 0.08
    for j in range(px):
        for i in range(px):
            u, v = (i + 0.5) / px * S * 12, (j + 0.5) / px * S * 8
            x, y = u * c45 - v * s45, u * s45 + v * c45; fx, fy = x - math.floor(x), y - math.floor(y)
            lead = min(fx, 1 - fx) < mortar / 2 or min(fy, 1 - fy) < mortar / 2
            k = (j * px + i) * 4
            buf[k:k + 4] = (0.1, 0.1, 0.11, 1.0) if lead else (r, g, b_, a)
    im.pixels = buf; path = os.path.join(OUT, name + "-color.png"); im.filepath_raw = path; im.file_format = "PNG"; im.save()
    picture_material(m, {"color": path}, S, S, alpha=True); done.append(name)

m = bpy.data.materials.get("cabglass")                          # the cupboards' clear glass: a plain see-through material the page understands
if m:
    nt = m.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial"); b = nt.nodes.new("ShaderNodeBsdfPrincipled"); nt.links.new(b.outputs[0], out.inputs["Surface"])
    b.inputs["Base Color"].default_value = (0.8, 0.86, 0.84, 1); b.inputs["Alpha"].default_value = 0.14; b.inputs["Roughness"].default_value = 0.06; m.blend_method = "BLEND"; done.append("cabglass")
print("materials made of pictures:", ", ".join(done))
bpy.ops.wm.save_mainfile()
