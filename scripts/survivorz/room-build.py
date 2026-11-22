# SURVIVORZ: builds THE VAULT LOBBY look test's room (docs/survivorz/ASSETS.md step C) in Blender.
#   node scripts/survivorz/greybox.mjs && node scripts/survivorz/room-bakeprops.mjs
#   blender -b --factory-startup --python scripts/survivorz/room-build.py -- [--no-bake] [--samples 512] [--size 4096] [--preview] [--cpu]
#
# In:   assets/downloads/survivorz/set/greybox.json      (each room's inside faces, cut round its doors)
#       client/src/survivorz/room/vault-lobby.json       (what stands where: props, fixtures, the ceiling kit)
#       the materials (Poly Haven / ambientCG, CC0) and the ceiling kit (Naked Singularity, bought on Fab)
# Out:  assets/downloads/survivorz/rooms/vault-lobby/vault-lobby-src.glb   the shell + the ceiling kit (room-pack.mjs packs it)
#       assets/downloads/survivorz/rooms/vault-lobby/lightmap.exr       the baked light on the shell (its 2nd UV)
#       assets/downloads/survivorz/rooms/vault-lobby/vault-lobby.blend
#       docs/survivorz/vault-lobby-anchors.json                         the hand-off to the effects (EFFECTS.md section 5)
#       --preview: docs/survivorz/plans/lobby-*.png (Cycles stills from a few cameras)
#
# THE LIGHT: the shell's lighting is BAKED (Cycles, direct + bounced, no surface colour: a lightmap the
# game multiplies its textures by). Survivors and zombies get the game's own fixed set of real-time
# lights at the fixtures, which on the shell only add their specular sheen (room/ patches that in).
# Props and the vault door are in the bake as geometry only (their shadows), never exported: the
# game places the packed props from the same layout file.
#
# World (x east, y up, z south) -> Blender (x, -z, y), as greybox-build.py.
import bpy, bmesh, json, os, sys, math, zipfile, shutil
import numpy as np
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DL = os.path.join(ROOT, "assets", "downloads", "survivorz")
FREE = os.path.join(DL, "free")
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
# --set <name>: which zone to build (its layout client/src/survivorz/room/<name>.json, out to rooms/<name>/);
# the facility is built zone by zone, each its own shell and lightmap (2026-10-27)
SET = args[args.index("--set") + 1] if "--set" in args else "vault-lobby"
OUT = os.path.join(DL, "rooms", SET)
TEX = os.path.join(DL, "rooms", "tex")
KIT = os.path.join(DL, "originals", "inbox", "fullceiling")
PLANS = os.path.join(ROOT, "docs", "survivorz", "plans")
BAKE = "--no-bake" not in args
PREVIEW = "--preview" in args
SAMPLES = int(args[args.index("--samples") + 1]) if "--samples" in args else 512
SIZE = int(args[args.index("--size") + 1]) if "--size" in args else 4096
os.makedirs(OUT, exist_ok=True); os.makedirs(TEX, exist_ok=True)

L = json.load(open(os.path.join(ROOT, "client", "src", "survivorz", "room", f"{SET}.json"), encoding="utf-8"))
# a layout names its grey box: the bunker's is set/bunker-greybox.json (greybox.mjs --map bunker); Halcyon's the default
G = json.load(open(os.path.join(DL, "set", L.get("greybox", "greybox.json")), encoding="utf-8"))
L.setdefault("kit", {"copies": []})
ROOMS = L["rooms"]
ROOM = {r["id"]: r for r in G["rooms"]}

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def B(p):  # world -> blender
    return Vector((p[0], -p[2], p[1]))

# ---- the materials -------------------------------------------------------------------------------------
# Each is a texture set and how many metres one repeat covers.
def set_files(name):
    """colour / normal (OpenGL) / roughness files for a material set, extracting ambientCG zips once"""
    if name.startswith("own:"):   # graded from scans by scripts/survivorz/room-surfaces.mjs
        d = os.path.join(TEX, "own", name[4:])
        return {"color": os.path.join(d, "color.jpg"), "normal": os.path.join(d, "normal.jpg"), "rough": os.path.join(d, "rough.jpg")}
    if name.startswith("ph:"):
        d = os.path.join(FREE, "polyhaven", name[3:]); b = name[3:]
        return {"color": os.path.join(d, f"{b}_diff_2k.jpg"), "normal": os.path.join(d, f"{b}_nor_gl_2k.jpg"), "rough": os.path.join(d, f"{b}_rough_2k.jpg")}
    z = os.path.join(FREE, "ambientcg", f"{name}_2K-JPG.zip")
    d = os.path.join(TEX, name)
    if not os.path.isdir(d):
        with zipfile.ZipFile(z) as f: f.extractall(d)
    pick = lambda suffix: next((os.path.join(d, n) for n in os.listdir(d) if n.endswith(suffix)), None)
    return {"color": pick("_Color.jpg"), "normal": pick("_NormalGL.jpg"), "rough": pick("_Roughness.jpg")}

SETS = {   # material key -> (texture set, metres a repeat)
    "terrazzo": ("Tiles043", 2.4), "plaster": ("PaintedPlaster017", 3.0), "wainscot": ("ph:painted_concrete_02", 2.5),
    "skirting": ("Rubber004", 1.0), "slab": ("kit", 4.0), "vault-wall": ("ph:concrete_slab_wall_02", 3.0),
    "vault-floor": ("ph:concrete_floor_worn_001", 3.0), "vault-ceiling": ("Concrete034", 3.0), "carpet": ("Carpet012", 2.0),
    "office-ceiling": ("OfficeCeiling001", 2.4), "decon-tiles": ("Tiles107", 0.9), "rubber-floor": ("own:decon-floor", 2.0),
    "tunnel-wall": ("ph:concrete_wall_003", 3.5), "tunnel-floor": ("ph:concrete_floor_worn_001", 3.0), "tunnel-ceiling": ("Concrete030", 3.0),
    # THE STAFF SECURITY HALL (Josh, 2026-10-26: sleek where staff live and work): composite wall
    # panels, a dark acoustic band over a brushed steel line, a seamless white ceiling cut by light
    # slots, polished concrete in 1.2 m slabs, a black stone runway from the chamber to the airlock
    "panel-white": ("Plastic013A", 2.4), "panel-dark": ("Plastic012A", 2.4), "steel": ("Metal009", 1.2),
    "plinth": ("Metal027", 1.0), "ceiling-white": ("Plastic013A", 3.0), "polished-concrete": ("own:hall-porcelain", 2.4),
    "runway": ("Marble016", 2.4), "portal": ("Metal028", 2.4), "panel-accent": ("own:accent-panel", 2.4),
    # the back of house and the shelter (hybrid by depth): painted concrete, painted floors, steel plate
    "painted-wall": ("own:shelter-wall", 2.5), "painted-floor": ("own:shelter-floor", 3.0), "steel-plate": ("own:steel-plate", 2.0),
    "diamond-plate": ("DiamondPlate007D", 1.2), "kitchen-floor": ("own:decon-floor", 2.0), "carpet-tile": ("Carpet012", 2.0),
    # the research labs (round seven): resin floors and epoxy walls in the clean labs, oak vinyl in the break
    # room, the server room's access floor, stainless in the airlock and the shower
    "lab-floor": ("own:lab-floor", 3.0), "lab-wall": ("own:lab-wall", 2.5), "vinyl-oak": ("own:vinyl-oak", 1.8),
    "raised-floor": ("own:raised-floor", 4.8), "stainless": ("Metal009", 1.5),
    # the deep (round twelve): the director's walnut and marble, the far tunnels' old brick
    "walnut": ("Wood049", 2.4), "marble-dark": ("Marble021", 2.4), "brick-old": ("Bricks085", 2.0),
}
FLAT = {   # untextured keys: (colour (linear), roughness, emission colour, emission strength)
    "slot-dead": ((0.42, 0.44, 0.46), 0.6, None, 0.0),
    # behind the panels' 10 mm shadow gaps and over every wall top: the wall's dark body. Before it the
    # gaps were open slots and a wall's top edge only met the ceilings at a hairline, and the stores'
    # lamps leaked through both into the kitchen and the canteen (2026-10-27)
    "gap-back": ((0.03, 0.03, 0.035), 0.9, None, 0.0),
    "egress": ((0.58, 0.87, 0.19), 0.4, (0.58, 0.87, 0.19), 1.2),   # the photoluminescent egress line: pale yellow-green (#C8F07A), faint
    "slot-lit": ((0.9, 0.93, 0.96), 0.5, (0.9, 0.95, 1.0), 1.6),
}
# Each room: floor, ceiling, and the wall's bands from the floor up (top, material); the reveals wear the top band
STYLE = {
    "reception": {"floor": "polished-concrete", "ceiling": "ceiling-white", "bands": [(99, "panel-white")], "skin": "hall"},
    "security-desk": {"floor": "carpet", "ceiling": "ceiling-white", "bands": [(99, "panel-white")], "skin": "hall"},
    "decon-entry": {"floor": "rubber-floor", "ceiling": "ceiling-white", "bands": [(99, "decon-tiles")]},
    "vault-chamber": {"floor": "vault-floor", "ceiling": "vault-ceiling", "bands": [(99, "vault-wall")]},
    "outside": {"floor": "tunnel-floor", "ceiling": "tunnel-ceiling", "bands": [(99, "tunnel-wall")]},
}

# a zone's own room styles (layout "styles": room id -> {floor, ceiling, bands: [[top, key], ...], skin})
for rid, v in L.get("styles", {}).items():
    STYLE[rid] = {**v, "bands": [tuple(b) for b in v.get("bands", [[99, "panel-white"]])]}

def image(path, linear=False):
    img = bpy.data.images.load(path, check_existing=True)
    if linear: img.colorspace_settings.name = "Non-Color"
    return img

def flip_green(path):
    """a DirectX normal map rewritten with its green channel inverted (glTF and Blender want OpenGL)"""
    out = os.path.join(TEX, "kit-gl", os.path.splitext(os.path.basename(path))[0] + "_gl.png")
    if os.path.exists(out): return out
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img = bpy.data.images.load(path); img.colorspace_settings.name = "Non-Color"
    px = np.empty(img.size[0] * img.size[1] * 4, dtype=np.float32); img.pixels.foreach_get(px)
    px = px.reshape(-1, 4); px[:, 1] = 1.0 - px[:, 1]
    o = bpy.data.images.new("flip", img.size[0], img.size[1], alpha=False); o.colorspace_settings.name = "Non-Color"
    o.pixels.foreach_set(px.ravel()); o.filepath_raw = out; o.file_format = "PNG"; o.save()
    bpy.data.images.remove(o); bpy.data.images.remove(img)
    return out

def pbr(name, color, normal=None, rough=None, orm=None, emissive=None, emissive_strength=0.0, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    def tex(path, linear):
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = image(path, linear); return t
    if color:
        c = tex(color, False).outputs["Color"]
        t = L.get("tint", {}).get(name)
        if t:   # years of grime: the layout's tint multiplies the colour map (the game applies the same)
            mx = nt.nodes.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "MULTIPLY"; mx.inputs["Factor"].default_value = 1.0
            nt.links.new(c, mx.inputs["A"]); mx.inputs["B"].default_value = (*t, 1.0); c = mx.outputs["Result"]
        nt.links.new(c, bsdf.inputs["Base Color"])
    if normal:
        nm = nt.nodes.new("ShaderNodeNormalMap"); nt.links.new(tex(normal, True).outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if orm:
        sep = nt.nodes.new("ShaderNodeSeparateColor"); nt.links.new(tex(orm, True).outputs["Color"], sep.inputs["Color"])
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        bsdf.inputs["Metallic"].default_value = metal   # the kit's metal maps say 1: the facility has no environment map
    elif rough:
        nt.links.new(tex(rough, True).outputs["Color"], bsdf.inputs["Roughness"])
    if emissive:
        nt.links.new(tex(emissive, False).outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = emissive_strength
    bsdf.inputs["Metallic"].default_value = metal
    return m

KIT_T = os.path.join(KIT, "Textures")
def kit_set(folder, stem):
    d = os.path.join(KIT_T, folder)
    f = lambda kind: os.path.join(d, f"{stem}_{kind}")
    return dict(color=f("Diffuse.jpg"), normal=flip_green(f("Normal.jpg")), orm=f("ORM.jpg"))

MATS = {}
for key, (src, _) in SETS.items():
    if src == "kit":
        MATS[key] = pbr("slab", os.path.join(KIT_T, "Ceiling", "T_concrete_wall_Diffuse.PNG"), flip_green(os.path.join(KIT_T, "Ceiling", "T_concrete_wall_Normal.PNG")),
                        rough=os.path.join(KIT_T, "Ceiling", "T_concrete_wall_Roughness.PNG"))
    else:
        # composite panels and the plaster ceiling are flat: their scans' bump read as crumpled foil, and
        # baked into the lightmap as blotches (a diffuse bake shades by the normal map at texel scale)
        flat = key in ("panel-white", "ceiling-white", "panel-dark", "panel-accent")
        f = set_files(src); MATS[key] = pbr(key, f["color"], None if flat else f["normal"], f["rough"], metal=0.35 if key in ("steel", "stainless") else 0.2 if key == "steel-plate" else 0.0)
for key, (rgb, rough, em, strength) in FLAT.items():
    m = bpy.data.materials.new(key); m.use_nodes = True
    bs = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bs.inputs["Base Color"].default_value = (*rgb, 1); bs.inputs["Roughness"].default_value = rough
    if em: bs.inputs["Emission Color"].default_value = (*em, 1); bs.inputs["Emission Strength"].default_value = strength
    MATS[key] = m
    SETS[key] = (None, 1.0)
KIT_MATS = {   # the preview's material names -> its own texture sets
    "AirPipes": kit_set("Air_pipe", "T_Air_pipe_long_plas"), "Air_duct_out_plas": kit_set("HVAC/Air_duct_out", "T_Air_duct_out_plas"),
    "Air_pipe_sup": kit_set("Air_pipe_sup", "T_Air_pipe_sup_plas"), "plas.001": kit_set("Air_pipe_sup", "T_Air_pipe_sup_base_plas"),
    "lambert1.001": kit_set("HVAC/Ceiling_pipe_01", "T_Ceiling_pipe_01_metal"), "lambert1.008": kit_set("HVAC/Air_duct_01", "T_Air_duct_01_metal"),
    "metal": kit_set("HVAC/Air_duct_02", "T_Air_duct_02_metal"), "metal.001": kit_set("Light/Ceiling_light_01", "T_Ceiling_light_01_metal"),
}
KIT_PBR = {}
for name, s in KIT_MATS.items():
    light = name == "metal.001"
    KIT_PBR[name] = pbr(f"kit-{name}", s["color"], s["normal"], orm=s["orm"], metal=0.25,
                        emissive=os.path.join(KIT_T, "Light", "Ceiling_light_01", "T_Ceiling_light_01_metal_Emissive.jpg") if light else None,
                        emissive_strength=6.0 if light else 0.0)

# ---- the shell: every inside face of the lobby's rooms, banded, UV'd in metres ---------------------------
bm = bmesh.new()
uv0 = bm.loops.layers.uv.new("UVMap")
mat_index = {}
def mi(key):
    if key not in mat_index: mat_index[key] = len(mat_index)
    return mat_index[key]

def quad(pts, normal, key, uv_fn):
    """pts: 4 world points; normal: the world direction the face must look"""
    vs = [bm.verts.new(B(p)) for p in pts]
    f = bm.faces.new(vs)
    f.normal_update()
    if f.normal.dot(B(normal) - B((0, 0, 0))) < 0: f.normal_flip()
    f.material_index = mi(key)
    s = SETS[key][1]
    for loop in f.loops:
        co = loop.vert.co; w = (co.x, co.z, -co.y)
        loop[uv0].uv = uv_fn(w, s)
    return f

def wall_uv(axis):
    return (lambda w, s: (w[2] / s, w[1] / s)) if axis == "x" else (lambda w, s: (w[0] / s, w[1] / s))

def rect_cut(rects, hole):
    out = []
    for (x0, z0, x1, z1) in rects:
        hx0, hz0, hx1, hz1 = max(x0, hole[0]), max(z0, hole[1]), min(x1, hole[2]), min(z1, hole[3])
        if hx1 - hx0 < 1e-6 or hz1 - hz0 < 1e-6: out.append((x0, z0, x1, z1)); continue
        out += [(x0, z0, x1, hz0), (x0, hz1, x1, z1), (x0, hz0, hx0, hz1), (hx1, hz0, x1, hz1)]
    return [r for r in out if r[2] - r[0] > 1e-6 and r[3] - r[1] > 1e-6]

# ---- THE HALL SKIN: the staff security hall is built, not banded (Josh, 2026-10-26; the references'
# rules, docs/survivorz/REFERENCES.md round five). Walls float on a recessed dark plinth carrying a
# pale glow line (the egress marking, on battery); above it composite panels 1.2 m wide with 10 mm
# shadow gaps, every joint on the same 1.2 m grid as the ceiling's slots; a dark recessed reveal at
# 3.0 m (the dead wall-wash slot); one off-white for walls and ceiling. The ceiling hangs at
# hall.ceilY, seamless, stopped 50 mm short of the walls, cut by light slots at slotPitch centres;
# the slots the layout lists as fixtures still run on battery and are their own objects (they glow
# and flicker), the rest are dead. The floor is polished concrete in 1.2 m slabs with a black stone
# runway down the line from the chamber's doorway to the airlock.
# the skin is per room (layout "skins": room id -> its settings); the hall was the first
SKINS = L.get("skins") or ({L["hall"]["room"]: L["hall"]} if L.get("hall") else {})
GAP = 0.010
UPSTAND = 0.3   # every wall runs this far past the ceiling line, so no light slips over its top edge
hall_slots = []   # (x, z0, z1, fixture-or-None): the ceiling's slots, lit ones become FIXTURE_s objects

def wpt(s, a, y, off):
    """a point on a wall line: along `a`, at height `y`, `off` out into the room"""
    return (s["c"] + s["inward"] * off, y, a) if s["axis"] == "x" else (a, y, s["c"] + s["inward"] * off)

def slab(s, a0, a1, y0, y1, off, key):
    """a panel standing `off` proud of the wall: its face and its four returns (the shadow gap's sides)"""
    n = (s["inward"], 0, 0) if s["axis"] == "x" else (0, 0, s["inward"])
    al = (0, 0, 1) if s["axis"] == "x" else (1, 0, 0)
    uv = wall_uv(s["axis"])
    quad([wpt(s, a0, y0, off), wpt(s, a1, y0, off), wpt(s, a1, y1, off), wpt(s, a0, y1, off)], n, key, uv)
    if off <= 1e-6: return
    quad([wpt(s, a0, y0, 0), wpt(s, a1, y0, 0), wpt(s, a1, y0, off), wpt(s, a0, y0, off)], (0, -1, 0), key, uv)
    quad([wpt(s, a0, y1, 0), wpt(s, a1, y1, 0), wpt(s, a1, y1, off), wpt(s, a0, y1, off)], (0, 1, 0), key, uv)
    quad([wpt(s, a0, y0, 0), wpt(s, a0, y1, 0), wpt(s, a0, y1, off), wpt(s, a0, y0, off)], tuple(-v for v in al), key, uv)
    quad([wpt(s, a1, y0, 0), wpt(s, a1, y1, 0), wpt(s, a1, y1, off), wpt(s, a1, y0, off)], al, key, uv)

def hall_surface(s, st, level):
    HALL = SKINS[s["room"]]
    ceil = level + HALL.get("ceilY", 3.6)
    if s["kind"] == "floor":
        x0, z0, x1, z1 = s["rect"]; y = s["y"]
        rects = [(x0, z0, x1, z1)]
        for h in s.get("holes", []): rects = rect_cut(rects, h)
        rw = HALL.get("runway")
        pieces = []
        for r in rects:
            if rw:
                for q in rect_cut([r], (rw[0], r[1], rw[1], r[3])): pieces.append((q, st["floor"]))
                ix0, ix1 = max(r[0], rw[0]), min(r[2], rw[1])
                if ix1 - ix0 > 1e-6: pieces.append(((ix0, r[1], ix1, r[3]), "runway"))
            else: pieces.append((r, st["floor"]))
        for (a, b, c, d), key in pieces:
            quad([(a, y, b), (c, y, b), (c, y, d), (a, y, d)], (0, 1, 0), key, lambda w, sc: (w[0] / sc, w[2] / sc))
        return
    if s["kind"] == "ceiling":
        x0, z0, x1, z1 = s["rect"]
        cx0, cz0, cx1, cz1 = x0 + 0.05, z0 + 0.05, x1 - 0.05, z1 - 0.05   # the perimeter shadow gap
        pitch, w, deep, inset = HALL.get("slotPitch", 2.4), HALL.get("slotWidth", 0.06), 0.07, HALL.get("slotInset", 0.6)
        # the slots run along z (across the room, the hall's) or along x ("slotAxis": "x", a long corridor's);
        # they're laid at `pitch` from slotX0 (or slotZ0) across the other axis
        along_x = HALL.get("slotAxis", "z") == "x"
        lo, hi = (cz0, cz1) if along_x else (cx0, cx1)
        mid = HALL.get("slotZ0" if along_x else "slotX0", (lo + hi) / 2)
        k0 = math.ceil((lo + inset - mid) / pitch); k1 = math.floor((hi - inset - mid) / pitch)
        rects = [(cx0, cz0, cx1, cz1)]
        lit = {round(f["at"][2 if along_x else 0], 2): f for f in L["fixtures"] if f["kind"] == "slot" and f["room"] == s["room"]}
        for k in range(k0, k1 + 1):
            c = mid + k * pitch
            r = (cx0 + inset, c - w / 2, cx1 - inset, c + w / 2) if along_x else (c - w / 2, cz0 + inset, c + w / 2, cz1 - inset)
            rects = rect_cut(rects, r)
            f = lit.get(round(c, 2))
            hall_slots.append((r, f, s["room"], ceil))
            top = ceil + deep
            a, b2, cc, d = r
            # the channel's four sides (the diffuser is its own object)
            quad([(a, ceil, b2), (a, ceil, d), (a, top, d), (a, top, b2)], (1, 0, 0), "ceiling-white", lambda q, sc: (q[2] / sc, q[1] / sc))
            quad([(cc, ceil, b2), (cc, ceil, d), (cc, top, d), (cc, top, b2)], (-1, 0, 0), "ceiling-white", lambda q, sc: (q[2] / sc, q[1] / sc))
            quad([(a, ceil, b2), (cc, ceil, b2), (cc, top, b2), (a, top, b2)], (0, 0, 1), "ceiling-white", lambda q, sc: (q[0] / sc, q[1] / sc))
            quad([(a, ceil, d), (cc, ceil, d), (cc, top, d), (a, top, d)], (0, 0, -1), "ceiling-white", lambda q, sc: (q[0] / sc, q[1] / sc))
        for (a, b, c, d) in rects:
            quad([(a, ceil, b), (c, ceil, b), (c, ceil, d), (a, ceil, d)], (0, -1, 0), st["ceiling"], lambda q, sc: (q[0] / sc, q[2] / sc))
        return
    if s["kind"] == "head":
        lo, hi = s["y0"], s["y1"]; y = s["at"]
        if y >= ceil: return
        if s["axis"] == "x": pts = [(lo, y, s["a0"]), (hi, y, s["a0"]), (hi, y, s["a1"]), (lo, y, s["a1"])]
        else: pts = [(s["a0"], y, lo), (s["a1"], y, lo), (s["a1"], y, hi), (s["a0"], y, hi)]
        quad(pts, (0, -1, 0), "steel", lambda w, sc: (w[0] / sc, w[2] / sc))
        return
    y0, y1 = s["y0"], min(s["y1"], ceil)
    if y1 - y0 < 1e-6: return
    if s["kind"] == "reveal":   # the door frames: brushed steel
        c, inward = s["c"], s["inward"]
        if s["axis"] == "x": pts = [(c, y0, s["a0"]), (c, y0, s["a1"]), (c, y1, s["a1"]), (c, y1, s["a0"])]; n = (inward, 0, 0)
        else: pts = [(s["a0"], y0, c), (s["a1"], y0, c), (s["a1"], y1, c), (s["a0"], y1, c)]; n = (0, 0, inward)
        quad(pts, n, "steel", wall_uv(s["axis"]))
        return
    # the wall's body behind the panels, the plenum above the ceiling closed, and an upstand over it all
    if s["kind"] == "wall": slab(s, s["a0"], s["a1"], s["y0"], s["y1"] + UPSTAND, 0.0, "gap-back")
    # the wall: plinth (with its glow line), panels, the dead wall-wash reveal, panels to the ceiling
    pk = HALL.get("panelKey", "panel-white")
    zones = [(0.0, 0.12, "plinth", 0.0, None), (0.12, 3.0, pk, 0.02, 1.2), (3.0, 3.08, "plinth", 0.0, None), (3.08, ceil - level, pk, 0.02, 1.2)]
    a0w, a1w = s["a0"], s["a1"]
    for (lo, hi, key, off, mod) in zones:
        zy0, zy1 = max(y0, level + lo), min(y1, level + hi)
        if zy1 - zy0 < 1e-6: continue
        if mod is None:
            slab(s, a0w, a1w, zy0, zy1, off, key)
            if lo == 0.0 and zy0 <= level + 0.04:   # the photoluminescent egress line, 25 mm, low on the plinth
                slab(s, a0w, a1w, level + 0.04, level + 0.065, 0.004, "egress")
            continue
        gy0 = zy0 + (GAP / 2 if zy0 <= level + lo + 1e-6 else 0); gy1 = zy1 - (GAP / 2 if zy1 >= level + hi - 1e-6 else 0)
        pt = HALL.get("portal")   # the dark panels framing the airlock: a wall line and an along range
        for k in range(math.floor(a0w / mod), math.ceil(a1w / mod)):
            pa0, pa1 = k * mod + GAP / 2, (k + 1) * mod - GAP / 2
            pa0, pa1 = max(pa0, a0w), min(pa1, a1w)
            if pa1 - pa0 < 0.02: continue
            dark = pt and s["axis"] == pt["axis"] and abs(s["c"] - pt["c"]) < 0.25 and pa0 >= pt["a"][0] - 1e-6 and pa1 <= pt["a"][1] + 1e-6
            slab(s, pa0, pa1, gy0, gy1, off, "portal" if dark else key)

# CUT-OUTS (layout "cutouts": {axis, c, a0, a1, y0, y1}): openings in the grey box's walls for glazing (the labs'
# glass offices and conference room, references L10-L12). Every wall face on that line, from both rooms, loses
# the rectangle: what stays is the wall either side, the lintel over it and any sill under it.
def cut_surfaces(surfs, cuts):
    out = []
    for s in surfs:
        pieces = [s]
        if s["kind"] == "wall":
            for c in cuts:
                nxt = []
                for p in pieces:
                    if p["axis"] != c["axis"] or abs(p["c"] - c["c"]) > 0.11: nxt.append(p); continue
                    a0, a1 = max(p["a0"], c["a0"]), min(p["a1"], c["a1"]); y0, y1 = max(p["y0"], c["y0"]), min(p["y1"], c["y1"])
                    if a1 - a0 < 1e-6 or y1 - y0 < 1e-6: nxt.append(p); continue
                    if p["a0"] < a0 - 1e-6: nxt.append({**p, "a1": a0})
                    if a1 < p["a1"] - 1e-6: nxt.append({**p, "a0": a1})
                    if y1 < p["y1"] - 1e-6: nxt.append({**p, "a0": a0, "a1": a1, "y0": y1})
                    if p["y0"] < y0 - 1e-6: nxt.append({**p, "a0": a0, "a1": a1, "y1": y0})
                pieces = nxt
        out += pieces
    return out
SURFACES = cut_surfaces(G["surfaces"], L.get("cutouts", []))

for s in SURFACES:
    if s["room"] not in ROOMS: continue
    st = STYLE[s["room"]]; level = ROOM[s["room"]]["bottom"]
    if st.get("skin") == "hall":
        hall_surface(s, st, level)
        continue
    if s["kind"] in ("floor", "ceiling"):
        x0, z0, x1, z1 = s["rect"]; y = s["y"]
        rects = [(x0, z0, x1, z1)]
        for h in s.get("holes", []): rects = rect_cut(rects, h)
        key = st["floor"] if s["kind"] == "floor" else st["ceiling"]
        n = (0, 1, 0) if s["kind"] == "floor" else (0, -1, 0)
        for (a, b, c, d) in rects:
            quad([(a, y, b), (c, y, b), (c, y, d), (a, y, d)], n, key, lambda w, sc: (w[0] / sc, w[2] / sc))
        continue
    if s["kind"] == "head":
        lo, hi = s["y0"], s["y1"]; y = s["at"]; key = st["bands"][-1][1]
        if s["axis"] == "x": pts = [(lo, y, s["a0"]), (hi, y, s["a0"]), (hi, y, s["a1"]), (lo, y, s["a1"])]
        else: pts = [(s["a0"], y, lo), (s["a1"], y, lo), (s["a1"], y, hi), (s["a0"], y, hi)]
        quad(pts, (0, -1, 0), key, lambda w, sc: (w[0] / sc, w[2] / sc))
        continue
    # walls and reveals, split into the room's bands
    y0, y1 = s["y0"], s["y1"]
    cuts, prev = [], level
    for top, key in st["bands"]:
        t = level + top
        a, b = max(y0, prev), min(y1, t)
        if b - a > 1e-6: cuts.append((a, b, key if s["kind"] == "wall" else st["bands"][-1][1] if b > level + 1.1 else key))
        prev = t
    c, inward = s["c"], s["inward"]
    for (a, b, key) in cuts:
        if s["axis"] == "x":
            pts = [(c, a, s["a0"]), (c, a, s["a1"]), (c, b, s["a1"]), (c, b, s["a0"])]; n = (inward, 0, 0)
        else:
            pts = [(s["a0"], a, c), (s["a1"], a, c), (s["a1"], b, c), (s["a0"], b, c)]; n = (0, 0, inward)
        quad(pts, n, key, wall_uv(s["axis"]))
    if s["kind"] == "wall":
        a, b = y1, y1 + UPSTAND
        if s["axis"] == "x": pts = [(c, a, s["a0"]), (c, a, s["a1"]), (c, b, s["a1"]), (c, b, s["a0"])]; n = (inward, 0, 0)
        else: pts = [(s["a0"], a, c), (s["a1"], a, c), (s["a1"], b, c), (s["a0"], b, c)]; n = (0, 0, inward)
        quad(pts, n, "gap-back", wall_uv(s["axis"]))

# ---- THE BUILT-INS (layout "arch"): what the hall is made of beyond its walls -- the guard booth's
# clad lower walls, fascia and roof, its console, the glass line's steel floor channel, the site map's
# black glass, the airlock's steel surround. Boxes, in the shell so they take the bake. "skip" names
# the faces nobody sees ("-y" the underside on the floor, "+x" a face against a wall). Glass panes are
# their own objects (see GLASS below): see-through things can't share the lightmap's opaque shell.
FACES = {
    "-x": lambda x0, y0, z0, x1, y1, z1: ([(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)], (-1, 0, 0)),
    "+x": lambda x0, y0, z0, x1, y1, z1: ([(x1, y0, z0), (x1, y0, z1), (x1, y1, z1), (x1, y1, z0)], (1, 0, 0)),
    "-y": lambda x0, y0, z0, x1, y1, z1: ([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], (0, -1, 0)),
    "+y": lambda x0, y0, z0, x1, y1, z1: ([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], (0, 1, 0)),
    "-z": lambda x0, y0, z0, x1, y1, z1: ([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)], (0, 0, -1)),
    "+z": lambda x0, y0, z0, x1, y1, z1: ([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], (0, 0, 1)),
}
FACE_UV = {"x": lambda w, sc: (w[2] / sc, w[1] / sc), "y": lambda w, sc: (w[0] / sc, w[2] / sc), "z": lambda w, sc: (w[0] / sc, w[1] / sc)}
glass_specs = []
for a in L.get("arch", []):
    if "glass" in a: glass_specs.append(a); continue
    x0, y0, z0, x1, y1, z1 = a["box"]
    for f, make in FACES.items():
        if f in a.get("skip", []): continue
        pts, n = make(x0, y0, z0, x1, y1, z1)
        key = a.get("faces", {}).get(f, a["key"])
        quad(pts, n, key, FACE_UV[f[1]])

me = bpy.data.meshes.new(f"SHELL_{SET}")
bm.to_mesh(me); bm.free()
for key, i in sorted(mat_index.items(), key=lambda kv: kv[1]): me.materials.append(MATS[key])
shell = bpy.data.objects.new(f"SHELL_{SET}", me)
scene.collection.objects.link(shell)
print("shell", len(me.polygons), "faces,", len(mat_index), "materials")

# ---- the ceiling kit over Reception: the artist's 15 x 15 m layout, twice, the second mirrored ---------------
c_kit = bpy.data.collections.new("KIT"); scene.collection.children.link(c_kit)
fixtures = []   # every light source, for the bake and the anchors: {kind, at (world), size, room, bank}
_kit_master = None
def kit_master():
    """the preview imported ONCE (a second import renames its materials), strays and the module slabs dropped"""
    global _kit_master
    if _kit_master is not None: return _kit_master
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.join(KIT, "Full_Ceiling_Preview.fbx"))
    new = [o for o in bpy.data.objects if o not in before]
    keep = []
    for o in new:
        if o.type != "MESH": continue
        pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
        cx = sum(p.x for p in pts) / 8; cy = sum(p.y for p in pts) / 8
        if abs(cx) > 8 or abs(cy) > 8 or o.data.name.startswith("SM_ceiling_module"): continue
        if any(m and m.name == "AirPipes" for m in o.data.materials): continue   # the coiled hoses (layout kit.drop)
        keep.append(o)
    for o in keep:
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
        for i, m in enumerate(o.data.materials):
            if m and m.name in KIT_PBR: o.data.materials[i] = KIT_PBR[m.name]
    for o in new:
        if o not in keep: bpy.data.objects.remove(o)
    _kit_master = keep
    return keep

def import_kit(centre, mirror, tag):
    keep = []
    for src in kit_master():
        o = src.copy(); o.data = src.data.copy(); keep.append(o)
        mw = src.matrix_world.copy()
        if mirror: mw = Matrix.Scale(-1, 4, (1, 0, 0)) @ mw
        o.matrix_world = Matrix.Translation(Vector((centre[0], -centre[1], 0))) @ mw
        c_kit.objects.link(o)
    bpy.ops.object.select_all(action="DESELECT")
    for o in keep: o.select_set(True)
    bpy.context.view_layer.objects.active = keep[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if mirror:
        for o in keep:
            bm2 = bmesh.new(); bm2.from_mesh(o.data); bmesh.ops.reverse_faces(bm2, faces=bm2.faces); bm2.to_mesh(o.data); bm2.free()
    lights = [o for o in keep if o.data.materials and o.data.materials[0] is KIT_PBR["metal.001"]]
    def ctr(o):
        pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
        return sum(p.x for p in pts) / 8, sum(p.y for p in pts) / 8, min(p.z for p in pts)
    for i, o in enumerate(sorted(lights, key=lambda o: (round(ctr(o)[0], 1), ctr(o)[1]))):
        cx, cy, zb = ctr(o)
        o.name = f"FIXTURE_{tag}{i}"
        fx = {"id": o.name, "kind": "panel", "at": [round(cx, 3), round(zb - 0.01, 3), round(-cy, 3)], "size": [0.56, 0.56], "room": "reception"}
        if i in L["kit"].get("dead", {}).get(tag[-1], []): fx["style"] = "dead"
        elif f"{tag[-1]}{i}" in L["kit"].get("styles", {}): fx["style"] = L["kit"]["styles"][f"{tag[-1]}{i}"]
        fixtures.append(fx)
    return keep

kit_objs = []
for i, cp in enumerate(L["kit"]["copies"]):
    kit_objs += import_kit(cp["centre"], cp["mirror"], "k" + "ab"[i])
# the panel-flush fixtures copy the kit's light panel (kept even when no kit hangs anywhere)
_ps = next(o for o in kit_master() if o.data.materials and o.data.materials[0] is KIT_PBR["metal.001"])
proto = _ps.copy(); proto.data = _ps.data.copy(); proto.name = "PROTO_panel"; c_kit.objects.link(proto)
for o in kit_master(): bpy.data.objects.remove(o)
# banks: Reception's panels come back in four columns, west to east (the effects' power-restore order)
xs = sorted({f["at"][0] for f in fixtures})
cols = np.array_split(np.array(xs), 4)
for f in fixtures:
    f["bank"] = next(i for i, c in enumerate(cols) if f["at"][0] in c)
print("kit", len(kit_objs), "pieces,", len(fixtures), "hanging panels")

# ---- the layout's own fixtures, the props and the vault door: bake-only geometry -------------------------------
c_bake = bpy.data.collections.new("BAKE_ONLY"); scene.collection.children.link(c_bake)
BAKEPROPS = os.path.join(DL, "rooms", "bake-props")
def rot_matrix(rot):
    """a prop's `rot` [x, y, z] in degrees, three.js Euler order YXZ (tip it in its own frame about Z
    then X, then turn it about the vertical) — world axes mapped to Blender's: X->X, Y->Z, Z->-Y"""
    rx, ry, rz = (math.radians(v) for v in rot)
    return Matrix.Rotation(ry, 4, "Z") @ Matrix.Rotation(rx, 4, "X") @ Matrix.Rotation(-rz, 4, "Y")

def place(path, at, yaw, name, rot=None):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    root = bpy.data.objects.new(name, None); c_bake.objects.link(root)
    for o in new:
        for c in o.users_collection: c.objects.unlink(o)
        c_bake.objects.link(o)
        if o.parent is None: o.parent = root
    root.location = B(at)
    if rot:
        # a knocked-over thing: tipped, then SETTLED so its lowest point rests on the floor it stands on
        root.matrix_world = Matrix.Translation(B(at)) @ rot_matrix(rot)
        bpy.context.view_layer.update()
        low = min((o.matrix_world @ Vector(c)).z for o in new if o.type == "MESH" for c in o.bound_box)
        root.location.z += at[1] - low
    else:
        root.rotation_euler = (0, 0, math.radians(yaw))
    return root

for i, p in enumerate(L["props"]):
    place(os.path.join(BAKEPROPS, f"{p['id']}.glb"), p["at"], p.get("yaw", 0), f"prop-{i}-{p['id']}", p.get("rot"))
for d in G["doors"]:
    if d["kind"] == "vault" and L.get("vaultDoor", "vault-chamber" in ROOMS):
        c = d["centre"]; place(os.path.join(BAKEPROPS, "vault-door.glb"), [c[0], c[1] - d["size"][1] / 2, c[2]], (L.get("vaultAt") or [0, 0, 0])[2], "vault-door")
# a wall piece's turn from the way it faces: the emergency unit's native front is +x, the exit sign's +z.
# Turning by t about the vertical carries +x to (cos t, -sin t) and +z to (sin t, cos t) in world (x, z).
WALL_DEPTH = {"emergency": 0.074, "exit": 0.018}
def wall_yaw(f):
    fx, fz = f["face"][0], f["face"][2]
    return math.degrees(math.atan2(-fz, fx) if f["kind"] == "emergency" else math.atan2(fx, fz))
def wall_at(f):
    """the layout gives the point ON the wall; the piece's centre stands half its depth out from it"""
    d = WALL_DEPTH[f["kind"]]
    return [f["at"][0] + f["face"][0] * d, f["at"][1], f["at"][2] + f["face"][2] * d]
# the panel fixtures for rooms with a ceiling too low to hang one: the kit's panel, its rods up through the ceiling
for i, f in enumerate(L["fixtures"]):
    if f["kind"] == "caged":
        place(os.path.join(BAKEPROPS, "caged-light.glb"), f["at"], f.get("yaw", 0), f"caged-{i}")
        fixtures.append({"id": f"FIXTURE_c{i}", "kind": "caged", "at": [f["at"][0], f["at"][1] - 0.03, f["at"][2]], "size": [1.0, 0.12], "room": f["room"], "bank": f["bank"],
                         **({"style": f["style"]} if "style" in f else {}), **({"circuit": f["circuit"]} if "circuit" in f else {})})   # a plant room's high-bays are on the mains (2026-10-27)
    elif f["kind"] == "panel-flush":
        o = proto.copy(); o.data = proto.data; o.name = f"FIXTURE_p{i}"; c_kit.objects.link(o)
        pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
        cx = sum(p.x for p in pts) / 8; cy = sum(p.y for p in pts) / 8; zb = min(p.z for p in pts)
        want = Vector((f["at"][0], -f["at"][2], f["at"][1] - 0.32))
        o.location += want - Vector((cx, cy, zb))
        fixtures.append({"id": o.name, "kind": "panel", "at": [f["at"][0], round(f["at"][1] - 0.33, 3), f["at"][2]], "size": [0.56, 0.56], "room": f["room"], "bank": f["bank"],
                         **({"style": f["style"]} if "style" in f else {}), **({"circuit": f["circuit"]} if "circuit" in f else {})})
        kit_objs.append(o)
    elif f["kind"] in ("emergency", "exit"):
        # wall pieces: the emergency unit's twin heads throw warm light out and down; the exit sign glows green
        face = f["face"]
        place(os.path.join(BAKEPROPS, f"{'emergency-light' if f['kind'] == 'emergency' else 'exit-sign'}.glb"), wall_at(f), wall_yaw(f), f"{f['kind']}-{i}")
        lift = 0.27 if f["kind"] == "emergency" else 0.09
        out = 0.12 if f["kind"] == "emergency" else 0.03
        at = [round(f["at"][0] + face[0] * out, 3), round(f["at"][1] + lift, 3), round(f["at"][2] + face[2] * out, 3)]
        fixtures.append({"id": f"FIXTURE_{'e' if f['kind'] == 'emergency' else 'x'}{i}", "kind": f["kind"], "at": at, "face": face,
                         "size": [0.36, 0.14] if f["kind"] == "exit" else [0.3, 0.1], "room": f["room"], "bank": f["bank"], **({"style": f["style"]} if "style" in f else {})})
bpy.data.objects.remove(proto)
# the hall's lit slots (the ones the layout lists): each diffuser its own object, so it glows and flickers
SLOT_LIT = MATS["slot-lit"]
slot_objs = []
for k, (sr, f, sroom, sceil) in enumerate(hall_slots):
    HALL = SKINS[sroom]
    sa, sb, sc_, sd = sr
    # every slot's diffuser is its own object: the ones the layout lists are on the battery circuit
    # (FIXTURE_s<layout index>), the rest only light on mains (FIXTURE_m<k>) -- the power switch
    i = L["fixtures"].index(f) if f else k
    y = sceil + 0.069
    bm3 = bmesh.new()
    vs = [bm3.verts.new(B(p)) for p in [(sa, y, sb), (sc_, y, sb), (sc_, y, sd), (sa, y, sd)]]
    fc = bm3.faces.new(vs); fc.normal_update()
    if fc.normal.z > 0: fc.normal_flip()   # it faces down, into the hall
    name = f"FIXTURE_s{i}" if f else f"FIXTURE_m{i}"
    md = bpy.data.meshes.new(name); bm3.to_mesh(md); bm3.free(); md.materials.append(SLOT_LIT)
    o = bpy.data.objects.new(name, md); c_kit.objects.link(o); slot_objs.append(o); kit_objs.append(o)
    fixtures.append({"id": o.name, "kind": "slot", "at": [round((sa + sc_) / 2, 3), round(y - 0.01, 3), round((sb + sd) / 2, 3)], "size": [round(sc_ - sa, 3), round(sd - sb, 3)],
                     "room": f["room"] if f else sroom, "bank": f["bank"] if f else 0, "circuit": "battery" if f else "mains",
                     **({"style": f["style"]} if f and "style" in f else {})})

# ---- THE HALCYON LOGO: the company's name on the wall over the vault doorway, brushed steel letters ------------------
FONT = os.path.join(FREE, "fonts.google.com", "Barlow_Condensed", "BarlowCondensed-SemiBold.ttf")
logo_objs = []
def steel():
    m = bpy.data.materials.new("logo-steel"); m.use_nodes = True
    bs = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bs.inputs["Base Color"].default_value = (0.62, 0.63, 0.64, 1); bs.inputs["Metallic"].default_value = 0.5; bs.inputs["Roughness"].default_value = 0.34
    return m
STEEL = steel()
def text_obj(body, size, at_x, at_y, z, spacing=1.0):
    cu = bpy.data.curves.new("logo-" + body, "FONT"); cu.body = body; cu.size = size; cu.extrude = 0.012; cu.align_x = "CENTER"; cu.space_character = spacing
    if os.path.exists(FONT): cu.font = bpy.data.fonts.load(FONT)
    o = bpy.data.objects.new("logo-" + body, cu); scene.collection.objects.link(o)
    o.location = B([at_x, at_y, z]); o.rotation_euler = (math.radians(90), 0, 0)   # stood up on the north wall, read from the south
    o.data.materials.append(STEEL)
    return o
if L.get("logo"):
    lg = L["logo"]; x, y, z = lg["at"]   # the centre of the name, on the wall face
    zz = z + 0.02
    parts = [text_obj("HALCYON", 0.9, x + 0.55, y - 0.05, zz, 1.06), text_obj("B I O L O G I C S", 0.21, x + 0.55, y - 0.4, zz, 1.1)]
    # the mark: a ring with a horizon bar through it, to the left of the name
    bpy.ops.mesh.primitive_torus_add(major_radius=0.42, minor_radius=0.036, major_segments=64, minor_segments=8, location=B([x - 1.25, y + 0.22, zz + 0.01]), rotation=(math.radians(90), 0, 0))
    ring = bpy.context.active_object; ring.data.materials.append(STEEL); parts.append(ring)
    bpy.ops.mesh.primitive_cube_add(size=1, location=B([x - 1.25, y + 0.12, zz + 0.01]))
    bar = bpy.context.active_object; bar.scale = (1.1, 0.03, 0.045); bar.data.materials.append(STEEL); parts.append(bar)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.15, segments=24, ring_count=12, location=B([x - 1.25, y + 0.27, zz]))
    sun = bpy.context.active_object; sun.scale = (1, 0.25, 1); sun.data.materials.append(STEEL); parts.append(sun)
    bpy.ops.object.select_all(action="DESELECT")
    for o in parts:
        o.select_set(True)
        if o.type == "FONT": bpy.context.view_layer.objects.active = o
    for o in [p for p in parts if p.type == "FONT"]:
        bpy.context.view_layer.objects.active = o; bpy.ops.object.convert(target="MESH")
    bpy.ops.object.select_all(action="DESELECT")
    for o in parts:
        o = bpy.data.objects.get(o.name) or o; o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.join()
    logo = bpy.context.active_object; logo.name = "LOGO_halcyon"
    if lg.get("face", [0, 0, 1])[2] < 0:
        # built for a north wall (read from the south); on a south wall it turns half round about its centre
        pivot = B([x, y, z])
        logo.matrix_world = Matrix.Translation(pivot) @ Matrix.Rotation(math.pi, 4, "Z") @ Matrix.Translation(-pivot) @ logo.matrix_world
    logo_objs.append(logo)
    print("logo", len(logo.data.polygons), "faces", "(font found)" if os.path.exists(FONT) else "(DEFAULT FONT: Barlow missing)")

# ---- GLASS: the security line's frameless panes and the booth's armoured glazing, 12-40 mm laminated
# glass with the green its edges show (the references: thick glass reads armoured, thin reads shopfront)
glass_objs = []
def glass_mat(name, alpha, edge):
    m = bpy.data.materials.new(name); m.use_nodes = True
    bs = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bs.inputs["Base Color"].default_value = (0.62, 0.72, 0.68, 1) if not edge else (0.16, 0.3, 0.24, 1)
    bs.inputs["Roughness"].default_value = 0.06; bs.inputs["Alpha"].default_value = alpha
    try: m.surface_render_method = "BLENDED"
    except Exception: pass
    return m
GLASS_FACE, GLASS_EDGE = glass_mat("glass-face", 0.16, False), glass_mat("glass-edge", 0.85, True)
for gi, a in enumerate(glass_specs):
    x0, y0, z0, x1, y1, z1 = a["glass"]
    thin = min(("x", x1 - x0), ("z", z1 - z0), key=lambda t: t[1])[0]   # the pane's thin axis: its faces look along it
    bm4 = bmesh.new()
    for f, make in FACES.items():
        pts, n = make(x0, y0, z0, x1, y1, z1)
        vs = [bm4.verts.new(B(p)) for p in pts]; fc = bm4.faces.new(vs); fc.normal_update()
        if fc.normal.dot(B(n) - B((0, 0, 0))) < 0: fc.normal_flip()
        fc.material_index = 0 if f[1] == thin else 1
    md = bpy.data.meshes.new(f"GLASS_{gi}"); bm4.to_mesh(md); bm4.free()
    md.materials.append(GLASS_FACE); md.materials.append(GLASS_EDGE)
    o = bpy.data.objects.new(f"GLASS_{gi}", md); scene.collection.objects.link(o); glass_objs.append(o)

# ---- the bake lights: an area light under every fixture ---------------------------------------------------------
c_lights = bpy.data.collections.new("BAKE_LIGHTS"); scene.collection.children.link(c_lights)
POWER = {"panel": 36.0, "caged": 110.0, "emergency": 200.0, "exit": 3.0, "slot": 100.0}
# THE POWER SWITCH (Josh, 2026-10-26: "have the option for lighting to be turned off and on"): two
# bakes of the same room. "battery" is the blackout (the emergency circuit: the listed slots, the
# twin-heads, the exits); "mains" is the power back -- every slot at full output, the twin-heads off
# (non-maintained units go dark when the mains is healthy), the exits still lit
MAINS_SLOT = 115.0   # Josh, 2026-10-27: "make the lighting a little more realistic. its super bright"
bake_lights = []   # (light object, energy on battery, energy on mains)
STYLE_DIM = {"failing": 0.6, "dying": 0.25, "buzz": 0.9, "dead": 0.0}
COLOR = {"caged": (1.0, 0.95, 0.86), "panel": (0.94, 0.97, 1.0), "emergency": (1.0, 0.8, 0.55), "exit": (0.25, 1.0, 0.45), "slot": (0.88, 0.94, 1.0)}
for f in fixtures:
    if f.get("style") == "dead" and f.get("circuit") != "battery": continue
    if f["kind"] == "emergency":
        # twin heads aimed out and down, 40 degrees below level
        ld = bpy.data.lights.new(f["id"] + "-bake", "SPOT"); ld.spot_size = math.radians(64); ld.spot_blend = 0.4; ld.shadow_soft_size = 0.08
        aim = Vector((f["face"][0], f["face"][1], f["face"][2])).normalized() * math.cos(math.radians(50)) + Vector((0, -math.sin(math.radians(50)), 0))
    else:
        ld = bpy.data.lights.new(f["id"] + "-bake", "AREA")
        ld.shape = "RECTANGLE"; ld.size, ld.size_y = f["size"]
        aim = Vector(f["face"]) if f["kind"] == "exit" else Vector((0, -1, 0))
    e_bat = 0.0 if f.get("circuit") == "mains" else POWER[f["kind"]] * STYLE_DIM.get(f.get("style"), 1.0)
    e_mains = 0.0 if f["kind"] == "emergency" else (MAINS_SLOT if f["kind"] == "slot" else POWER[f["kind"]])
    ld.energy = e_bat
    ld.color = COLOR[f["kind"]]
    lo = bpy.data.objects.new(f["id"] + "-bake", ld); c_lights.objects.link(lo)
    bake_lights.append((ld, e_bat, e_mains))
    lo.location = B(f["at"])
    # a spot and an area light both point down their own -Z: turn that onto the aim (world -> blender)
    lo.rotation_euler = B(list(aim)).to_track_quat("-Z", "Y").to_euler()

# ---- render settings: Cycles on the GPU ----------------------------------------------------------------------
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
for kind in ("OPTIX", "CUDA"):
    try:
        prefs.compute_device_type = kind; prefs.get_devices()
        if any(d.type == kind for d in prefs.devices): break
    except Exception: pass
for d in prefs.devices: d.use = d.type != "CPU"
# --cpu: when the GPU's memory is taken (the house's AI model lives on it), the driver spills into
# system memory that's already committed and the bake crashes; the processor is slower but sure
scene.cycles.device = "CPU" if "--cpu" in args else "GPU"
scene.cycles.samples = SAMPLES
# every texel gets the samples asked for (adaptive sampling judges "converged" against a texel's own
# brightness, and the dim ones are the ones that need it). NB the medical hall's grainy ceiling (2026-10-27)
# was cured by --samples 8192, not by this: a ceiling lit only by bounce simply needs the samples
scene.cycles.use_adaptive_sampling = False
# a polished floor mirrors the thin bright light slots onto the ceiling: a caustic, the noisiest path there is,
# and in a lightmap it buys nothing anyone would see
scene.cycles.caustics_reflective = False; scene.cycles.caustics_refractive = False; scene.cycles.blur_glossy = 1.0
# the bake records light, not colour, so textures past 1K buy it nothing; capping them keeps Cycles
# inside the memory the machine has left beside the house's AI model (a full-size run failed to allocate)
scene.render.use_simplify = True
scene.cycles.texture_limit_render = "1024"
scene.cycles.use_denoising = True
# a bright bounce caught by a few paths turns, after the denoiser, into cloudy blotches on a ceiling lit only
# by the floor (the medical hall's, 2026-10-27); clamping the indirect light trims those paths and costs nothing
scene.cycles.sample_clamp_indirect = 8.0
scene.world = bpy.data.worlds.new("dark"); scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.0
scene.view_settings.view_transform = "AgX"
def on_gpu_or_cpu(op):
    """run a Cycles op on the GPU; if the card is out of memory (the house's AI model lives on it),
    run it again on the CPU rather than lose the build"""
    try:
        return op()
    except RuntimeError as e:
        if "memory" not in str(e).lower() or scene.cycles.device == "CPU": raise
        print("GPU out of memory: falling back to the CPU")
        scene.cycles.device = "CPU"
        return op()
print("cycles on", prefs.compute_device_type, [d.name for d in prefs.devices if d.use])

# ---- the lightmap UV and the bake -----------------------------------------------------------------------------
lm = me.uv_layers.new(name="lightmap")
me.uv_layers.active = lm
bpy.ops.object.select_all(action="DESELECT"); shell.select_set(True); bpy.context.view_layer.objects.active = shell
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.002, area_weight=1.0, correct_aspect=True, scale_to_bounds=False)
# texel density by where the eye goes: the hall's walls are built of hundreds of small panels, each its own
# island, and at the floor's density they came out a few dozen texels across and mottled with bake noise.
# Every shell face is its own island (quads never share verts), so each wall face's lightmap UVs are
# scaled about their own centre before the pack; the big smooth floors and ceilings give up the room.
GAPBACK = {mi("gap-back")} if "gap-back" in mat_index else set()
WALLY = {mi(k) for k in ("panel-white", "panel-dark", "portal", "plinth", "steel", "egress") if k in mat_index}
bmw = bmesh.from_edit_mesh(me); lmw = bmw.loops.layers.uv["lightmap"]
for f in bmw.faces:
    k = 2.0 if f.material_index in WALLY else 0.12 if f.material_index in GAPBACK else 1.0
    if k == 1.0: continue
    c = sum((l[lmw].uv for l in f.loops), Vector((0, 0))) / len(f.loops)
    for l in f.loops: l[lmw].uv = c + (l[lmw].uv - c) * k
bmesh.update_edit_mesh(me)
bpy.ops.uv.pack_islands(margin=0.0015, rotate=True)
bpy.ops.object.mode_set(mode="OBJECT")
me.uv_layers["UVMap"].active_render = True

LM = os.path.join(OUT, "lightmap.exr")
def bake_state(state, LM, raw):
    for (ld, e_bat, e_mains) in bake_lights: ld.energy = e_bat if state == "battery" else e_mains
    img = bpy.data.images.new("lightmap-" + state, SIZE, SIZE, alpha=False, float_buffer=True)
    for m in me.materials:
        nt = m.node_tree
        n = nt.nodes.new("ShaderNodeTexImage"); n.image = img; n.name = "BAKE_TARGET"
        uvn = nt.nodes.new("ShaderNodeUVMap"); uvn.uv_map = "lightmap"; nt.links.new(uvn.outputs["UV"], n.inputs["Vector"])
        nt.nodes.active = n
    scene.render.bake.use_pass_direct = True; scene.render.bake.use_pass_indirect = True; scene.render.bake.use_pass_color = False
    scene.render.bake.margin = 8; scene.render.bake.margin_type = "EXTEND"
    # the panels' own glow stays out of the bake: an LED panel throws its light down (its area light),
    # and its emissive housing lit the slab above it into hot pools
    lit = KIT_PBR["metal.001"].node_tree.nodes; bs = next(n for n in lit if n.type == "BSDF_PRINCIPLED")
    glow = bs.inputs["Emission Strength"].default_value; bs.inputs["Emission Strength"].default_value = 0.0
    sbs = next(n for n in SLOT_LIT.node_tree.nodes if n.type == "BSDF_PRINCIPLED"); sglow = sbs.inputs["Emission Strength"].default_value; sbs.inputs["Emission Strength"].default_value = 0.0
    on_gpu_or_cpu(lambda: bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, use_clear=True, margin=8))
    bs.inputs["Emission Strength"].default_value = glow
    sbs.inputs["Emission Strength"].default_value = sglow
    # denoise the bake with OIDN through the compositor (Blender 5: a compositor node GROUP whose
    # Group Output is what a render writes)
    ng = bpy.data.node_groups.new("bake-denoise", "CompositorNodeTree")
    ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    i_n = ng.nodes.new("CompositorNodeImage"); i_n.image = img
    dn = ng.nodes.new("CompositorNodeDenoise"); dn.inputs["HDR"].default_value = True
    go = ng.nodes.new("NodeGroupOutput")
    ng.links.new(i_n.outputs["Image"], dn.inputs["Image"]); ng.links.new(dn.outputs["Image"], go.inputs[0])
    scene.compositing_node_group = ng
    img.filepath_raw = raw; img.file_format = "OPEN_EXR"; img.save()   # the undenoised bake, kept for comparison
    saved = (scene.render.engine, scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage)
    scene.render.engine = "BLENDER_WORKBENCH"; scene.render.resolution_x = SIZE; scene.render.resolution_y = SIZE; scene.render.resolution_percentage = 100
    cam = bpy.data.objects.new("bakecam", bpy.data.cameras.new("bakecam")); scene.collection.objects.link(cam); scene.camera = cam
    scene.view_settings.view_transform = "Standard"
    scene.render.image_settings.file_format = "OPEN_EXR"; scene.render.image_settings.color_depth = "16"; scene.render.image_settings.exr_codec = "ZIP"
    scene.render.filepath = LM
    bpy.ops.render.render(write_still=True)
    scene.compositing_node_group = None
    scene.render.engine, scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = saved
    scene.view_settings.view_transform = "AgX"
    bpy.data.objects.remove(cam)
    for m in me.materials:
        nt = m.node_tree
        for n in [n for n in nt.nodes if n.name == "BAKE_TARGET" or (n.type == "UVMAP" and n.uv_map == "lightmap")]: nt.nodes.remove(n)
    if not os.path.exists(LM) or os.path.getsize(LM) < 1_000_000:
        # the denoise render can fail for want of memory and write an empty image; the raw bake is
        # noisier but true, and a black lightmap would ship a room lit by nothing
        print("WARNING: the denoised lightmap came out empty; using the raw bake")
        shutil.copyfile(raw, LM)
    print("baked", state, LM)
if BAKE:
    bake_state("battery", LM, os.path.join(OUT, "lightmap-raw.exr"))
    if "--no-mains" not in args:
        bake_state("mains", os.path.join(OUT, "lightmap-mains.exr"), os.path.join(OUT, "lightmap-mains-raw.exr"))

# ---- the anchors: the hand-off to the effects (EFFECTS.md section 5) ----------------------------------------------
def centre_of(o):
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return [round(sum(p.x for p in pts) / 8, 3), round(sum(p.z for p in pts) / 8, 3), round(-sum(p.y for p in pts) / 8, 3)], pts
vents, pipes = [], []
for o in kit_objs:
    if o.name.startswith("FIXTURE_"): continue
    mats = [m.name for m in o.data.materials if m]
    c, pts = centre_of(o)
    if "kit-Air_duct_out_plas" in mats: vents.append({"at": [c[0], round(min(p.z for p in pts), 3), c[2]], "facing": [0, -1, 0], "room": "reception"})
    if "kit-lambert1.001" in mats and max(max(p.x for p in pts) - min(p.x for p in pts), max(p.y for p in pts) - min(p.y for p in pts)) > 0.9:
        pipes.append({"at": [c[0], round(min(p.z for p in pts), 3), c[2]], "facing": [0, -1, 0], "room": "reception", "note": "the underside of a ceiling pipe run"})
# the hall's dead slots double as its supply-air diffusers (a slot diffuser carries both in a ceiling
# like this one): the effects' vents, where the kit's ducts used to give them
for (sr, f, sroom, sceil) in hall_slots:
    if not f:
        vents.append({"at": [round((sr[0] + sr[2]) / 2, 3), round(sceil, 3), round((sr[1] + sr[3]) / 2, 3)], "facing": [0, -1, 0], "room": sroom,
                      "size": [round(sr[2] - sr[0], 3), round(sr[3] - sr[1], 3)], "note": "a linear slot diffuser"})
anchors = {
    "about": "THE VAULT LOBBY's hand-off to the effects (EFFECTS.md section 5), written by scripts/survivorz/room-build.py: where its fixtures, vents, pipes, panels and puddles are, in world metres (x east, y up, z south). Each fixture's `at` is the light's own face (the panel's underside, the caged tube); `bank` is the order the power comes back in. The effects place beams, steam, drips and sparks from these; the room never wires effects in itself.",
    "map": G["map"],
    "fixtures": fixtures,
    "vents": vents[:8],
    "pipes": sorted(pipes, key=lambda p: p["at"][1])[:6],
    "panels": [{"at": [p["at"][0], 1.0, p["at"][2]], "yaw": p.get("yaw", 0), "room": p["room"], "kind": "utility-box"} for p in L["props"] if p["id"] == "utility-box"],
    "puddles": L.get("puddles", [{"at": [55.6, 0.0, 26.8], "radius": 1.1, "room": "reception", "under": "a ceiling leak"}, {"at": [61.5, 0.0, 14.6], "radius": 0.8, "room": "vault-chamber"}] if SET == "vault-lobby" else []),
}
with open(os.path.join(ROOT, "docs", "survivorz", f"{SET}-anchors.json"), "w", encoding="utf-8") as f:
    json.dump(anchors, f, indent=1)
print("anchors:", len(fixtures), "fixtures,", len(anchors["vents"]), "vents,", len(anchors["pipes"]), "pipes")

# ---- previews (Cycles stills, with the bake's lights) -------------------------------------------------------------
if PREVIEW:
    os.makedirs(PLANS, exist_ok=True)
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 1600, 900, 100
    scene.cycles.samples = 128
    scene.render.image_settings.file_format = "PNG"; scene.render.image_settings.color_depth = "8"
    shots = [("reception", (73.5, 1.65, 30.5), (58, 1.8, 19)), ("reception-west", (46.0, 1.7, 26.0), (70, 1.9, 22.5)),
             ("vault-chamber", (64.5, 1.7, 17.0), (58, 1.7, 8.5)), ("security-desk", (77.0, 1.6, 21.0), (82, 1.0, 28.5)), ("logo", (62.0, 1.65, 20.5), (65.0, 2.2, 31.9))]
    stem = "lobby"
    if SET != "vault-lobby":   # any other set previews from its layout's own shots
        shots = [(k, tuple(v["at"]), tuple(v["look"])) for k, v in L.get("shots", {}).items()]
        stem = SET
        for (ld, e_bat, e_mains) in bake_lights: ld.energy = e_mains   # the power on (the bunker is always lit)
    for name, loc, tgt in shots:
        cd = bpy.data.cameras.new(name); cd.lens = 20
        c = bpy.data.objects.new(name, cd); scene.collection.objects.link(c)
        c.location = B(loc); c.rotation_euler = (B(tgt) - B(loc)).to_track_quat("-Z", "Y").to_euler()
        scene.camera = c
        scene.render.filepath = os.path.join(PLANS, f"{stem}-{name}.png")
        on_gpu_or_cpu(lambda: bpy.ops.render.render(write_still=True))
    print("previews done")

# ---- the kit merged by material: 500-odd pieces were 500-odd draw calls. The fixtures stay their own
# objects (FIXTURE_*: the game finds them by name and the effects drive each one's glow).
fixture_objs = [o for o in kit_objs if o.name.startswith("FIXTURE_")]
groups = {}
for o in kit_objs:
    if o.name.startswith("FIXTURE_"): continue
    key = tuple(sorted(m.name for m in o.data.materials if m))
    groups.setdefault(key, []).append(o)
merged = []
for key, objs in groups.items():
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    objs[0].name = "KIT_" + "_".join(k.replace("kit-", "") for k in key)[:40]
    merged.append(objs[0])
kit_objs = merged + fixture_objs
print("kit merged into", len(merged), "pieces plus", len(fixture_objs), "fixtures")

# ---- out: the shell and the kit (with its fixtures), nothing bake-only ----------------------------------------------
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f"{SET}.blend"))
bpy.ops.object.select_all(action="DESELECT")
shell.select_set(True)
for o in kit_objs + logo_objs + glass_objs: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f"{SET}-src.glb"), export_format="GLB", use_selection=True,
                          export_image_format="JPEG", export_jpeg_quality=92, export_texcoords=True, export_apply=True)
print("exported", os.path.join(OUT, f"{SET}-src.glb"), f"(pack it: node scripts/survivorz/room-pack.mjs {SET})")
