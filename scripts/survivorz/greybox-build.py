# SURVIVORZ: builds HALCYON SITE 9's GREY BOX in Blender from the geometry greybox.mjs computed.
#   node scripts/survivorz/greybox.mjs
#   blender -b --factory-startup --python scripts/survivorz/greybox-build.py -- [--renders] [--map bunker]
# --map bunker (Nov 2026): Civil Defence Shelter 14 from set/bunker-greybox.json, out as bunker-greybox.*
# and docs/survivorz/plans/bunker-greybox-*.png.
# In:  assets/downloads/survivorz/set/greybox.json (world metres: x east, y up, z south)
# Out: assets/downloads/survivorz/set/site9-greybox.blend and site9-greybox.glb
#      docs/survivorz/plans/greybox-*.png with --renders (top views per floor + a few eye-level shots)
#
# The world's y-up/z-south becomes Blender's z-up/-y: (x, y, z) -> (x, -z, y). The glTF exporter's own
# Y-up conversion turns that straight back, so the GLB is in the game's world metres exactly.
# Names are the contract with the game (SURVIVORZ.md section 3): ROOM_<id> anchors at each room's floor
# min-x/min-z corner, DOOR_<id> for every door leaf the game moves, SPOT_<id> empties, LIFT_CAR.
import bpy, bmesh, json, os, sys, math
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SET = os.path.join(ROOT, "assets", "downloads", "survivorz", "set")
PLANS = os.path.join(ROOT, "docs", "survivorz", "plans")
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
RENDERS = "--renders" in args
MAP = args[args.index("--map") + 1] if "--map" in args else "site9"
IN_JSON = "bunker-greybox.json" if MAP == "bunker" else "greybox.json"
OUT = "bunker-greybox" if MAP == "bunker" else "site9-greybox"
PNG = "bunker-greybox" if MAP == "bunker" else "greybox"
FLOOR_Y = [0, -8, -16]

G = json.load(open(os.path.join(SET, IN_JSON), encoding="utf-8"))
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def bl(p):  # world -> blender
    return Vector((p[0], -p[2], p[1]))

def coll(name, parent=None):
    c = bpy.data.collections.new(name)
    (parent or scene.collection).children.link(c)
    return c

def mat(name, rgb, rough=0.85, alpha=1.0):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = rough
    if alpha < 1:
        bsdf.inputs["Alpha"].default_value = alpha
        m.surface_render_method = "BLENDED" if hasattr(m, "surface_render_method") else m.surface_render_method
    m.diffuse_color = (*rgb, alpha)
    return m

def hsl(h, s, l):
    import colorsys
    r, g, b = colorsys.hls_to_rgb(h / 360, l, s)
    return (r ** 2.2, g ** 2.2, b ** 2.2)

HUE = {"lobby": 210, "residential": 35, "labs": 185, "medical": 350, "security": 260, "power": 25, "containment": 120, "deep": 290}
if MAP == "bunker":
    HUE = {"entrance": 0, "commons": 140, "dorms": 35, "command": 220, "utility": 25}
M_WALL = mat("grey-wall", (0.62, 0.62, 0.6))
M_CEIL = mat("grey-ceiling", (0.5, 0.5, 0.5))
M_STAIR = mat("grey-concrete", (0.45, 0.45, 0.43))
M_RAIL = mat("grey-rail", (0.85, 0.7, 0.15), 0.5)
M_LIFT = mat("grey-lift", (0.35, 0.38, 0.42), 0.4)
M_FLOOR = {z: mat(f"floor-{z}", hsl(h, 0.35, 0.55)) for z, h in HUE.items()}
M_DOOR = {
    "door": mat("door-wood", (0.55, 0.38, 0.22)), "keycard": mat("door-keycard", (0.85, 0.65, 0.1), 0.4),
    "power": mat("door-power", (0.15, 0.55, 0.8), 0.4), "lockdown": mat("door-lockdown", (0.8, 0.15, 0.12), 0.4),
    "safe": mat("door-safe", (0.2, 0.7, 0.3), 0.4), "sealed": mat("door-sealed", (0.5, 0.3, 0.8), 0.5),
    "vault": mat("door-vault", (0.75, 0.75, 0.78), 0.3), "grate": mat("door-grate", (0.9, 0.5, 0.1), 0.5),
}

def add_box(bm, b):
    x0, y0, z0 = b["min"]; x1, y1, z1 = b["max"]
    # blender: X = x, Y = -z, Z = y
    vs = [bm.verts.new(v) for v in [
        (x0, -z1, y0), (x1, -z1, y0), (x1, -z0, y0), (x0, -z0, y0),
        (x0, -z1, y1), (x1, -z1, y1), (x1, -z0, y1), (x0, -z0, y1)]]
    for f in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]:
        bm.faces.new([vs[i] for i in f])

def mesh_obj(name, boxes, material, collection):
    if not boxes: return None
    bm = bmesh.new()
    for b in boxes: add_box(bm, b)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    collection.objects.link(o)
    return o

def floor_of(b):
    # the floor a piece belongs to: the one whose level is nearest its bottom
    y = b["min"][1] + 0.31
    return min(range(3), key=lambda i: abs(FLOOR_Y[i] - y) if y >= FLOOR_Y[i] - 0.5 else 99)

root = coll("SITE_9")
by_floor = [coll(f"FLOOR_{i}", root) for i in range(3)]
c_ceil = [coll(f"CEILINGS_{i}", by_floor[i]) for i in range(3)]
c_doors = [coll(f"DOORS_{i}", by_floor[i]) for i in range(3)]
c_marks = coll("ANCHORS", root)

boxes = G["boxes"]
for i in range(3):
    fb = [b for b in boxes if floor_of(b) == i]
    mesh_obj(f"WALLS_{i}", [b for b in fb if b["cat"] == "wall"], M_WALL, by_floor[i])
    mesh_obj(f"STAIRS_{i}", [b for b in fb if b["cat"] in ("stairs", "landing")], M_STAIR, by_floor[i])
    mesh_obj(f"RAILS_{i}", [b for b in fb if b["cat"] in ("rail", "ladder")], M_RAIL, by_floor[i])
    for z in HUE:
        mesh_obj(f"FLOORS_{i}_{z}", [b for b in fb if b["cat"] == "floor" and b.get("zone") == z], M_FLOOR[z], by_floor[i])
    mesh_obj(f"CEILING_{i}", [b for b in fb if b["cat"] == "ceiling"], M_CEIL, c_ceil[i])
for b in boxes:
    if b["cat"] == "leaf":
        mesh_obj(b["name"], [b], M_DOOR.get(b["kind"], M_WALL), c_doors[floor_of(b)])
    if b["cat"] == "frame":
        mesh_obj(b["name"], [x for x in boxes if x["cat"] == "frame" and x["door"] == b["door"]], M_DOOR["vault"], c_doors[floor_of(b)]) if not bpy.data.objects.get(b["name"]) else None
    if b["cat"] == "lift":
        mesh_obj(b["name"], [b], M_LIFT, c_doors[floor_of(b)])

def empty(name, at, collection, size=0.5, kind="PLAIN_AXES", props=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = kind
    e.empty_display_size = size
    e.location = bl(at)
    for k, v in (props or {}).items(): e[k] = v
    collection.objects.link(e)
    return e

for a in G["anchors"]:
    empty(a["name"], a["at"], c_marks, 1.0, "ARROWS", {"room": a["room"], "zone": a["zone"], "kind": a["kind"]})
for s in G["spots"]:
    empty(s["name"], s["at"], c_marks, 0.35, "CUBE", {"kind": s["kind"], "room": s["room"]})
for d in G["doors"]:
    if d["kind"] in ("doorway", "vent"):
        empty(f"DOOR_{d['id']}", d["centre"], c_marks, 0.4, "SINGLE_ARROW", {"kind": d["kind"]})

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SET, f"{OUT}.blend"))
bpy.ops.export_scene.gltf(filepath=os.path.join(SET, f"{OUT}.glb"), export_format="GLB",
                          export_extras=True, export_apply=True, use_visible=False)
print("built", len(bpy.data.objects), "objects")

if RENDERS:
    os.makedirs(PLANS, exist_ok=True)
    scene.render.engine = "BLENDER_WORKBENCH"
    sh = scene.display.shading
    sh.light = "STUDIO"; sh.color_type = "MATERIAL"; sh.show_cavity = True; sh.cavity_type = "BOTH"
    sh.show_shadows = True; sh.shadow_intensity = 0.4
    scene.display.render_aa = "8"
    scene.render.image_settings.file_format = "PNG"

    def layer_visible(show_floors, ceilings=False):
        for i in range(3):
            by_floor[i].hide_render = i not in show_floors
            c_ceil[i].hide_render = not ceilings
        c_marks.hide_render = True

    def cam(name, loc, rot=None, ortho=None, lens=24, target=None):
        cd = bpy.data.cameras.new(name)
        if ortho: cd.type = "ORTHO"; cd.ortho_scale = ortho
        else: cd.lens = lens
        cd.clip_end = 1000
        c = bpy.data.objects.new(name, cd)
        scene.collection.objects.link(c)
        c.location = loc
        if target is not None:
            d = Vector(target) - Vector(loc)
            c.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        elif rot: c.rotation_euler = rot
        scene.camera = c
        return c

    # a cutaway of each floor from above at 3/4 (ceilings and the floors above it off)
    sh.show_shadows = False
    xs = [r["rect"]["x"] for r in G["rooms"]] + [r["rect"]["x"] + r["rect"]["w"] for r in G["rooms"]]
    zs = [r["rect"]["y"] for r in G["rooms"]] + [r["rect"]["y"] + r["rect"]["h"] for r in G["rooms"]]
    for i in range(3):
        rs = [r for r in G["rooms"] if i in range(r["floor"], r["floor"] + r["spans"])]
        if not rs: continue
        x0 = min(r["rect"]["x"] for r in rs); x1 = max(r["rect"]["x"] + r["rect"]["w"] for r in rs)
        z0 = min(r["rect"]["y"] for r in rs); z1 = max(r["rect"]["y"] + r["rect"]["h"] for r in rs)
        cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
        span = max(x1 - x0, (z1 - z0) * 1.6) * 1.08
        scene.render.resolution_x, scene.render.resolution_y = 2400, 1500
        layer_visible({i})
        tgt = (cx, -cz, FLOOR_Y[i])
        d = 200
        loc = (cx - d * 0.0, -cz - d * math.cos(math.radians(50)), FLOOR_Y[i] + d * math.sin(math.radians(50)))
        cam(f"cut{i}", loc, ortho=span, target=tgt)
        scene.render.filepath = os.path.join(PLANS, f"{PNG}-floor-{i}.png")
        bpy.ops.render.render(write_still=True)

    # eye level, ceilings on, flat studio light (shadows make a lightless box black)
    scene.render.resolution_x, scene.render.resolution_y = 1600, 900
    shots = [
        ("reception", {0}, (66, -31, 1.7), (58, -12, 2.2)),          # from reception's south end toward the vault
        ("res-corridor", {0}, (2, -43, 1.7), (58, -43, 1.6)),        # down the residential corridor
        ("generator-hall", {1}, (42, -36, -6.3), (16, -19, -5.5)),   # across the generator hall
        ("service-stairs", {0, 1}, (41.5, -17, 0.4), (33, -13, -5)), # down the service stairs from the strip
        ("med-hall", {0}, (1.5, -73, 1.7), (64, -73, 1.6)),           # down the medical hall
    ]
    if MAP == "bunker":
        shots = [
            ("tunnel", {0}, (40, -74, 1.7), (40, -55, 1.6)),         # up the tunnel at the blast door
            ("decon", {0}, (37, -55.5, 1.7), (40, -42, 1.6)),        # from the vestibule up the decon corridor
            ("common", {0}, (52.5, -39.5, 1.7), (32, -22, 1.4)),     # across the common room
            ("hall-n", {0}, (15, -16, 1.7), (62, -16, 1.6)),         # down the north hall past command
            ("hall-e", {0}, (64, -7, 1.7), (64, -51, 1.6)),          # down the east hall
            ("stores", {0}, (80.5, -48.5, 1.7), (67, -37, 1.4)),     # across the stores
        ]
    for name, fl, loc, tgt in shots:
        layer_visible(fl, ceilings=True)
        cam(f"eye-{name}", loc, target=tgt, lens=18)
        scene.render.filepath = os.path.join(PLANS, f"{PNG}-{name}.png")
        bpy.ops.render.render(write_still=True)
    print("rendered")
