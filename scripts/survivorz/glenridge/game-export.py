# SURVIVORZ, GLENRIDGE HALL: THE SET FOR THE SHOW, STEP ONE. Cuts the built house into the zones the show's page
# streams, under the names it reads, and writes each as rooms/<zone>/<zone>-src.glb for room-pack.mjs to pack.
#
#   GLEN_GAME=1 GLEN_LEAVES=0.3 GLEN_BLEND=glenridge-game.blend blender -b --factory-startup --python build.py     (the lighter build)
#   blender -b <assets>/set/glenridge-game.blend --python game-materials.py --python game-export.py [-- --zones glen-ground,...] [--report-only]
#   node scripts/survivorz/room-pack.mjs glen-ground                                                        (KTX2 + meshopt)
#
# THE CONTRACT (the bunker's, read off client/src/survivorz/show/zones.ts): in a zone's GLB the page lightmaps every
# mesh named SHELL*, makes GLASS_* transparent, and draws the rest as it comes. It reads no ROOM_ or DOOR_ names:
# rooms and doors come from the map's own data, and it builds each door leaf itself. So a zone here is
#   SHELL_<zone>   one mesh: walls, floors, ceilings, joinery, roofs (it gets the baked lightmap, step two)
#   GLASS_<n>      the window glass
#   the rest       dressing, lamps' glowing parts, furniture, plants: drawn unbaked
# and NOT exported: lights (the page has a fixed rig), cameras, rain, the lightning, door leaves, the room anchors.
#
# NOT YET (the plan is in docs/survivorz/GLENRIDGE.md, "The game side"): the lightmap bake; the built materials that
# are node set-ups (slate, leaded glass, flags, lino, paper, carpet, flame) reach a GLB as a flat colour and need
# baking to textures first. This step reports which those are, and how heavy each zone is.
import bpy, bmesh, os, sys, json

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def opt(name, default=None): return args[args.index(name) + 1] if name in args else default
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
ASSETS = os.environ.get("SURVIVORZ_ASSETS") or os.path.join(ROOT, "assets", "downloads", "survivorz")
ONLY = opt("--zones"); REPORT_ONLY = "--report-only" in args
BIG = ("wall", "floor", "ceil")                                 # the surfaces that get their own place in the lightmap
BAKE = "--bake" in args; SIZE = int(opt("--size", "4096")); SAMPLES = int(opt("--samples", "256"))

# ---- STEP THREE, the lightmap (--bake): the bunker's recipe (room-build.py), so the page reads it the same way ----
# A second UV set "lightmap" on the zone's shell; a Cycles DIFFUSE bake of the light alone (direct and indirect, no
# colour) from the house's own lamps and fires on a storm night; OIDN through the compositor; half-float EXR.
# The page multiplies it by pi and adds its own specular. The outside zone is not baked (a 420 m ground in one
# picture is nothing per metre): its night is the page's own light.
# ONLY THE WALLS, FLOORS AND CEILINGS ARE UNWRAPPED. Unwrapping the joinery too gave a hundred thousand islands a
# few texels each, and the gaps between them ate the picture (first try, Nov 12). The joinery is hidden while the
# light is baked (so a panelled wall takes the light its panels would), and then each of its faces reads the
# lightmap where the nearest wall, floor or ceiling does: its UVs are that surface's own flat mapping, carried out
# to where the face stands.
def borrow(det, big):
    from mathutils.bvhtree import BVHTree
    from mathutils import Vector
    bme = big.data; mw = big.matrix_world; verts = [mw @ v.co for v in bme.vertices]
    tree = BVHTree.FromPolygons(verts, [tuple(p.vertices) for p in bme.polygons]); lmb = bme.uv_layers["lightmap"].data; cache = {}
    def basis(pi):
        if pi not in cache:
            p = bme.polygons[pi]; li = list(p.loop_indices); P = [verts[bme.loops[l].vertex_index] for l in li]; U = [Vector(lmb[l].uv) for l in li]; cache[pi] = None
            for k in range(1, len(P) - 1):
                e1, e2 = P[k] - P[0], P[k + 1] - P[0]
                if e1.cross(e2).length > 1e-7:
                    d11, d12, d22 = e1.dot(e1), e1.dot(e2), e2.dot(e2)
                    cache[pi] = (P[0], e1, e2, d11, d12, d22, d11 * d22 - d12 * d12, U[0], U[k] - U[0], U[k + 1] - U[0]); break
        return cache[pi]
    me = det.data; dw = det.matrix_world; lm = me.uv_layers.get("lightmap") or me.uv_layers.new(name="lightmap"); far = 0
    for p in me.polygons:
        c = dw @ p.center; n = p.normal; best = None
        for pos, nb, idx, dist in tree.find_nearest_range(c, 0.4):
            sc = dist - 0.1 * n.dot(nb) + (0.25 if n.dot(nb) < -0.3 else 0.0)
            if (best is None or sc < best[0]) and basis(idx): best = (sc, idx)
        if best is None:
            pos, nb, idx, dist = tree.find_nearest(c); far += 1
            if idx is None or not basis(idx): continue
            best = (dist, idx)
        p0, e1, e2, d11, d12, d22, den, u0, du1, du2 = basis(best[1])
        for l in p.loop_indices:
            w = dw @ me.vertices[me.loops[l].vertex_index].co - p0; a_, b_ = w.dot(e1), w.dot(e2)
            uv = u0 + du1 * ((a_ * d22 - b_ * d12) / den) + du2 * ((b_ * d11 - a_ * d12) / den)
            lm.data[l].uv = (min(1.0, max(0.0, uv.x)), min(1.0, max(0.0, uv.y)))
    me.uv_layers[0].active_render = True
    print("  joinery: %d faces borrow their light (%d from further than 0.4 m)" % (len(me.polygons), far))

def bake_shell(sh, originals, out_dir):
    import math, shutil
    scene = bpy.context.scene; os.makedirs(out_dir, exist_ok=True); me = sh.data
    scene.render.engine = "CYCLES"; prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = kind; prefs.get_devices()
            if any(d.type == kind for d in prefs.devices): break
        except Exception: pass
    for d in prefs.devices: d.use = d.type != "CPU"
    scene.cycles.device = "GPU"; scene.cycles.samples = SAMPLES; scene.cycles.use_adaptive_sampling = False
    scene.cycles.caustics_reflective = False; scene.cycles.caustics_refractive = False; scene.cycles.blur_glossy = 1.0
    scene.render.use_simplify = True; scene.cycles.texture_limit_render = "1024"; scene.cycles.sample_clamp_indirect = 8.0
    w = bpy.data.worlds.new("bake-night"); w.use_nodes = True; bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (0.045, 0.06, 0.1, 1); bg.inputs[1].default_value = 0.03; scene.world = w
    for o in bpy.data.objects:                                  # the still's weather and daylight stay out of it
        if o.name in SKIP: o.hide_render = True
        if o.type == "LIGHT" and o.data.type == "SUN": o.data.energy = 0.012
    for o in originals: o.hide_render = True                    # the copies stand exactly where these do
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4); bm.to_mesh(me); bm.free()      # a wall's pieces become one island
    uvm = me.uv_layers[0]; lm = me.uv_layers.new(name="lightmap"); uvm.active_render = True; me.uv_layers.active = lm
    bpy.ops.object.select_all(action="DESELECT"); sh.select_set(True); bpy.context.view_layer.objects.active = sh
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0); bpy.ops.uv.pack_islands(margin=0.0012)
    bpy.ops.object.mode_set(mode="OBJECT")
    img = bpy.data.images.new("lightmap-" + sh.name, SIZE, SIZE, alpha=False, float_buffer=True)
    for m in me.materials:
        if not m: continue
        nt = m.node_tree; n = nt.nodes.new("ShaderNodeTexImage"); n.image = img; n.name = "BAKE_TARGET"
        uvn = nt.nodes.new("ShaderNodeUVMap"); uvn.uv_map = "lightmap"; nt.links.new(uvn.outputs["UV"], n.inputs["Vector"]); nt.nodes.active = n
    scene.render.bake.use_pass_direct = True; scene.render.bake.use_pass_indirect = True; scene.render.bake.use_pass_color = False
    scene.render.bake.margin = 8; scene.render.bake.margin_type = "EXTEND"
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, use_clear=True, margin=8)
    raw = os.path.join(out_dir, "lightmap-raw.exr"); LM = os.path.join(out_dir, "lightmap.exr")
    img.filepath_raw = raw; img.file_format = "OPEN_EXR"; img.save()
    ng = bpy.data.node_groups.new("bake-denoise", "CompositorNodeTree"); ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    i_n = ng.nodes.new("CompositorNodeImage"); i_n.image = img; dn = ng.nodes.new("CompositorNodeDenoise"); dn.inputs["HDR"].default_value = True; go = ng.nodes.new("NodeGroupOutput")
    ng.links.new(i_n.outputs["Image"], dn.inputs["Image"]); ng.links.new(dn.outputs["Image"], go.inputs[0]); scene.compositing_node_group = ng
    saved = (scene.render.engine, scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage, scene.camera)
    scene.render.engine = "BLENDER_WORKBENCH"; scene.render.resolution_x = SIZE; scene.render.resolution_y = SIZE; scene.render.resolution_percentage = 100
    cam = bpy.data.objects.new("bakecam", bpy.data.cameras.new("bakecam")); scene.collection.objects.link(cam); scene.camera = cam
    vt = scene.view_settings.view_transform; scene.view_settings.view_transform = "Standard"
    scene.render.image_settings.file_format = "OPEN_EXR"; scene.render.image_settings.color_depth = "16"; scene.render.image_settings.exr_codec = "ZIP"; scene.render.filepath = LM
    bpy.ops.render.render(write_still=True); scene.compositing_node_group = None
    scene.render.engine, scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage, scene.camera = saved
    scene.view_settings.view_transform = vt; bpy.data.objects.remove(cam)
    for m in me.materials:
        if not m: continue
        nt = m.node_tree
        for n in [n for n in nt.nodes if n.name == "BAKE_TARGET" or (n.type == "UVMAP" and n.uv_map == "lightmap")]: nt.nodes.remove(n)
    if not os.path.exists(LM) or os.path.getsize(LM) < 1_000_000: print("WARNING: the denoised lightmap came out empty; using the raw bake"); shutil.copyfile(raw, LM)
    prev = img.copy(); prev.scale(1024, 1024); scene.view_settings.view_transform = "Standard"                 # a small picture of it, to look at
    prev.file_format = "PNG"; prev.filepath_raw = os.path.join(ROOT, "docs", "survivorz", "plans", "lightmap-%s.png" % sh.name[6:]); prev.save(); scene.view_settings.view_transform = vt
    for o in originals: o.hide_render = False
    print("  baked", LM, "%.0f MB" % (os.path.getsize(LM) / 1e6))

SKIP = ("rain", "bolt", "mist", "cloudglow")                    # the still's weather: the show draws its own
OUTSIDE = ("roof", "chimney", "porte", "ground", "terrain", "shrubs", "leafage", "ivy", "gate")
LOOSE = ("dress", "shrubs", "leafage", "ivy", "fires", "flames", "shades", "globes", "glowbits", "cushions")

def zone_of(name):
    if name.startswith("shrubs2") or name.endswith("-1"): return "glen-basement"
    if any(name.startswith(p) for p in OUTSIDE): return "glen-outside"
    if name.endswith("1"): return "glen-upper"
    return "glen-ground"

house = bpy.data.collections.get("glenridge")
zones = {z: dict(shell=[], glass=[], loose=[], furn=[], dyn=[]) for z in ("glen-ground", "glen-upper", "glen-basement", "glen-outside")}
# WHAT MOVES IN THE GAME (design.py): the hearth stone, the four crests, the car. Each goes out as its own node,
# "DYN_<name>", untouched (no lightmap, no thinning, never merged), for the page to hide, show and move.
for o in house.objects:
    if o.type == "MESH" and o.name.startswith("dyn-"): zones["glen-ground"]["dyn"].append(o); continue
    if o.type != "MESH" or o.name in SKIP or o.name.startswith("doors"): continue
    z = zones[zone_of(o.name)]
    (z["glass"] if o.name.startswith("glass") else z["loose"] if any(o.name.startswith(p) for p in LOOSE) else z["shell"]).append(o)
GARDEN = ("bedplant", "shrub_", "fern_")                        # plants set out in the beds and the rock garden: they are outside, whichever list they were filed in
for cname, zname in (("furniture0", "glen-ground"), ("furniture1", "glen-upper"), ("furniture-1", "glen-basement"), ("trees", "glen-outside")):
    c = bpy.data.collections.get(cname)
    if not c: continue
    for o in c.objects:
        if o.type == "MESH" and o.name.startswith("car-"): zones["glen-outside"]["dyn"].append(o); continue
        if o.type == "MESH": zones["glen-outside" if o.name.startswith(GARDEN) else zname]["furn"].append(o)

# ---- THINNING (measured Nov 13: the ground floor drew 3.7 million triangles, 1.6 million of them bed plants; the
# wood drew 45 million): each scanned model and the oak is cut down once, to what the show can draw many of. The
# stills keep the full scans (this runs on the game build only).
GOALS = (("oak", 10000), ("lib-shrub", 2500), ("lib-fern", 1500), ("lib-potted", 5000), ("lib-", 8000))
def thin(me):
    from_ = sum(len(p.vertices) - 2 for p in me.polygons); goal = next((g for p, g in GOALS if me.name.startswith(p)), None)
    if goal is None or from_ <= goal * 1.25: return None
    tmp = bpy.data.objects.new("thin", me.copy()); bpy.context.scene.collection.objects.link(tmp)
    bpy.ops.object.select_all(action="DESELECT"); tmp.select_set(True); bpy.context.view_layer.objects.active = tmp
    md = tmp.modifiers.new("thin", "DECIMATE"); md.ratio = goal / from_; md.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier="thin"); new = tmp.data; name = me.name
    me.user_remap(new); bpy.data.objects.remove(tmp, do_unlink=True); me.name = name + ".full"; new.name = name
    return (name, from_, sum(len(p.vertices) - 2 for p in new.polygons))
if "--full" not in args:
    seen = {}
    for z in zones.values():
        for o in z["furn"]: seen[o.data.name] = o.data
    cut = [r for r in (thin(me) for me in list(seen.values())) if r]
    print("thinned %d models: %dk -> %dk triangles each way" % (len(cut), sum(c[1] for c in cut) / 1000, sum(c[2] for c in cut) / 1000))

tris = lambda me: sum(len(p.vertices) - 2 for p in me.polygons)
def built(m):                                                   # a material that is nodes, not pictures: it will not survive a GLB
    if not m or not m.use_nodes: return False
    kinds = {n.type for n in m.node_tree.nodes}
    return bool(kinds & {"TEX_BRICK", "TEX_VORONOI", "TEX_CHECKER", "TEX_NOISE", "TEX_GRADIENT", "VALTORGB"}) and "TEX_IMAGE" not in kinds or ("TEX_BRICK" in kinds or "TEX_VORONOI" in kinds or "TEX_CHECKER" in kinds)

report = {}
for zname, z in zones.items():
    if ONLY and zname not in ONLY.split(","): continue
    meshes = {}                                                 # distinct meshes: an oak set out 420 times is one mesh
    for o in z["shell"] + z["glass"] + z["loose"] + z["furn"]: meshes[o.data.name] = o.data
    mats = {}
    for me in meshes.values():
        for m in me.materials:
            if m: mats[m.name] = m
    r = dict(shell=sum(tris(o.data) for o in z["shell"]), glass=sum(tris(o.data) for o in z["glass"]), loose=sum(tris(o.data) for o in z["loose"]),
             furniture_pieces=len(z["furn"]), furniture_meshes=len({o.data.name for o in z["furn"]}), furniture_drawn=sum(tris(o.data) for o in z["furn"]),
             furniture_stored=sum(tris(me) for n, me in meshes.items() if n in {o.data.name for o in z["furn"]}),
             materials=len(mats), built_materials=sorted(n for n, m in mats.items() if built(m)))
    report[zname] = r
    print("ZONE %-14s shell %7d  glass %5d  loose %7d  furniture %3d pieces / %2d meshes, %8d triangles drawn (%7d stored)  %d materials, %d of them built from nodes"
          % (zname, r["shell"], r["glass"], r["loose"], r["furniture_pieces"], r["furniture_meshes"], r["furniture_drawn"], r["furniture_stored"], r["materials"], len(r["built_materials"])))
    if REPORT_ONLY: continue
    bpy.ops.object.select_all(action="DESELECT")
    for o in bpy.context.scene.objects: o.hide_set(False) if o.visible_get() is False and o.name in bpy.context.view_layer.objects else None
    sel = []
    made = []
    def joined(objs, name):
        copies = []
        for o in objs:
            c = o.copy(); c.data = o.data.copy(); bpy.context.scene.collection.objects.link(c); copies.append(c)
        bpy.ops.object.select_all(action="DESELECT")
        for c in copies: c.select_set(True)
        bpy.context.view_layer.objects.active = copies[0]; bpy.ops.object.join(); j = bpy.context.view_layer.objects.active
        j.name = name; j.data.name = name; bpy.ops.object.select_all(action="DESELECT"); return j
    if z["shell"]:                                              # one mesh for the lightmap
        big = [o for o in z["shell"] if o.name.startswith(BIG)]; det = [o for o in z["shell"] if not o.name.startswith(BIG)]
        if BAKE and zname != "glen-outside" and big:
            sh = joined(big, "SHELL_" + zname); bake_shell(sh, z["shell"], os.path.join(ASSETS, "rooms", zname))
            if det:                                             # the joinery borrows the light of the wall, floor or ceiling it stands on
                d = joined(det, "DETAIL_" + zname); borrow(d, sh)
                bpy.ops.object.select_all(action="DESELECT"); d.select_set(True); sh.select_set(True); bpy.context.view_layer.objects.active = sh; bpy.ops.object.join()
                sh = bpy.context.view_layer.objects.active; sh.name = "SHELL_" + zname; sh.data.name = "SHELL_" + zname
        else: sh = joined(z["shell"], "SHELL_" + zname)
        sel.append(sh); made.append(sh); bpy.ops.object.select_all(action="DESELECT")
    for i, o in enumerate(z["glass"]):
        c = o.copy(); c.data = o.data.copy(); c.name = "GLASS_%d" % i; c.data.name = "GLASS_%d" % i; bpy.context.scene.collection.objects.link(c); sel.append(c); made.append(c)
    for o in z["dyn"]:
        nm = "DYN_" + (o.name[4:] if o.name.startswith("dyn-") else o.name.split("-")[0])
        c = o.copy(); c.data = o.data.copy(); c.name = nm; c.data.name = nm; bpy.context.scene.collection.objects.link(c); sel.append(c); made.append(c)
    sel += z["loose"] + z["furn"]
    for o in sel: o.select_set(True)
    out_dir = os.path.join(ASSETS, "rooms", zname); os.makedirs(out_dir, exist_ok=True); out = os.path.join(out_dir, zname + "-src.glb")
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=True, export_apply=True, export_lights=False, export_cameras=False, export_yup=True,
                              export_image_format="JPEG", export_jpeg_quality=88)
    r["src_mb"] = round(os.path.getsize(out) / 1e6, 1); print("  wrote", out, r["src_mb"], "MB")
    for o in made: bpy.data.objects.remove(o, do_unlink=True)      # or the next zone bakes against a second copy of this one
json.dump(report, open(os.path.join(ROOT, "docs", "survivorz", "glenridge-zones.json"), "w", encoding="utf-8"), indent=1)
print("report: docs/survivorz/glenridge-zones.json")
