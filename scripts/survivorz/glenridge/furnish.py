# SURVIVORZ, GLENRIDGE HALL: the furnishing pass, run inside build.py after details.py. Furniture is Poly Haven's
# CC0 models (fetch-dressing.mjs), set out as copies at their true size; rugs, tapestries and pictures are CC0
# museum images (free/art). What stands where follows the photos (reference PHOTOS.md): 02, 05, 22 for the Great
# Hall, 06 for the library, 12 for the dining room.
FURN = {0: bpy.data.collections.new("furniture0"), 1: bpy.data.collections.new("furniture1"), -1: bpy.data.collections.new("furniture-1")}
for c_ in FURN.values(): scene.collection.children.link(c_)
LIB = {}

def model(id):
    if id in LIB: return LIB[id]
    before = set(bpy.data.objects)
    p = os.path.join(PH, id, id + ".gltf")
    if not os.path.exists(p): print("no model", id); LIB[id] = None; return None
    bpy.ops.import_scene.gltf(filepath=p)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    bm = bmesh.new(); mats = []
    for o in meshes:                                    # one mesh, every part where the model put it
        me = o.data.copy(); me.transform(o.matrix_world)
        off = len(mats)
        for m in me.materials: mats.append(m)
        tmp = bmesh.new(); tmp.from_mesh(me)
        for f in tmp.faces: f.material_index += off
        tmp.to_mesh(me); tmp.free(); bm.from_mesh(me); bpy.data.meshes.remove(me)
    out = bpy.data.meshes.new("lib-" + id); bm.to_mesh(out); bm.free()
    for m in mats: out.materials.append(m)
    for o in new: bpy.data.objects.remove(o, do_unlink=True)
    LIB[id] = out
    return out

def tinted(id, rgb):
    """The model with its cloth dyed: every material's colour multiplied by rgb (a copy; the plain one is untouched)."""
    key = "%s#%s" % (id, rgb)
    if key in LIB: return LIB[key]
    src = model(id)
    if src is None: LIB[key] = None; return None
    me = src.copy()
    for i, m in enumerate(me.materials):
        m2 = m.copy(); me.materials[i] = m2; nt = m2.node_tree
        b = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not b: continue
        if len(rgb) == 4:                              # dyed outright: the model's own colour dropped
            for l in [l for l in nt.links if l.to_socket == b.inputs["Base Color"]]: nt.links.remove(l)
            b.inputs["Base Color"].default_value = rgb; continue
        mx = nt.nodes.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "MULTIPLY"; mx.inputs["Factor"].default_value = 1.0; mx.inputs["B"].default_value = (*rgb, 1)
        lk = next((l for l in nt.links if l.to_socket == b.inputs["Base Color"]), None)
        if lk: src_sock = lk.from_socket; nt.links.remove(lk); nt.links.new(src_sock, mx.inputs["A"])
        else: mx.inputs["A"].default_value = b.inputs["Base Color"].default_value
        nt.links.new(mx.outputs["Result"], b.inputs["Base Color"])
    LIB[key] = me
    return me

RED = (0.62, 0.07, 0.09)
def variants(id):
    """Poly Haven's plant files hold several plants set out in a row. Returns one model id per plant ("shrub_03#0", ...),
    each a mesh of its own standing on its own origin, so a single plant can be set where it is wanted."""
    if id + "#0" in LIB: return [k for k in LIB if k.startswith(id + "#")]
    me = model(id)
    if me is None: return []
    cell = lambda v: (int(math.floor(v.co.x / 0.2)), int(math.floor(v.co.y / 0.2)))
    cells = {}
    for v in me.vertices: cells.setdefault(cell(v), None)
    k = 0
    for c0 in list(cells):                                  # flood the ground cells the plants cover: each island of cells is a plant
        if cells[c0] is not None: continue
        stack = [c0]; cells[c0] = k
        while stack:
            cx, cy = stack.pop()
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    n = (cx + dx, cy + dy)
                    if n in cells and cells[n] is None: cells[n] = k; stack.append(n)
        k += 1
    for i in range(k):
        bm = bmesh.new(); bm.from_mesh(me)
        gone = [v for v in bm.verts if cells[(int(math.floor(v.co.x / 0.2)), int(math.floor(v.co.y / 0.2)))] != i]
        bmesh.ops.delete(bm, geom=gone, context="VERTS")
        if len(bm.verts) < 30: bm.free(); continue
        cx = sum(v.co.x for v in bm.verts) / len(bm.verts); cy = sum(v.co.y for v in bm.verts) / len(bm.verts); z0 = min(v.co.z for v in bm.verts)
        for v in bm.verts: v.co.x -= cx; v.co.y -= cy; v.co.z -= z0
        out = bpy.data.meshes.new("lib-%s#%d" % (id, i)); bm.to_mesh(out); bm.free()
        for m in me.materials: out.materials.append(m)
        LIB["%s#%d" % (id, len([q for q in LIB if q.startswith(id + "#")]))] = out
    return [q for q in LIB if q.startswith(id + "#")] or [id]

def put(id, x, y, z, face=270.0, scale=1.0, lvl=0, name=None, tint=None):
    """A copy of a model at (x, y, z) of the current frame, its front turned to `face` (degrees: 0 = +x, 90 = +y)."""
    me = tinted(id, tint) if tint else model(id)
    if me is None: return None
    o = bpy.data.objects.new(name or id, me); wx, wy = T(x, y)
    o.location = (wx, wy, z); o.rotation_euler = (0, 0, math.radians(face + 90 + frame_deg())); o.scale = (scale,) * 3 if not isinstance(scale, tuple) else scale
    FURN[lvl].objects.link(o); return o

def art(axis, c, a, b, z0, z1, into, file, lvl=0, frame_="gilt", proud=0.05):
    """A framed picture or a hanging on a wall. axis x: the wall runs along x at y=c; into = +1 if the room is on its + side."""
    g = G("dress%d" % lvl); m = "img:" + file
    d0, d1 = (c, c + into * proud) if into > 0 else (c + into * proud, c)
    fw = 0.07 if frame_ == "gilt" else 0.0
    if axis == "x":
        if frame_: g.box(a - fw, d0, z0 - fw, b + fw, d1, z1 + fw, frame_)
        y = c + into * (proud + 0.004); xa, xb = (b, a) if into > 0 else (a, b)
        g.face([(xa, y, z0), (xb, y, z0), (xb, y, z1), (xa, y, z1)], m, (0, into, 0), uvs=[(0, 0), (1, 0), (1, 1), (0, 1)])
    else:
        if frame_: g.box(d0, a - fw, z0 - fw, d1, b + fw, z1 + fw, frame_)
        x = c + into * (proud + 0.004); ya, yb = (a, b) if into > 0 else (b, a)
        g.face([(x, ya, z0), (x, yb, z0), (x, yb, z1), (x, ya, z1)], m, (into, 0, 0), uvs=[(0, 0), (1, 0), (1, 1), (0, 1)])

import json as _json
ART = _json.load(open(os.path.join(ASSETS, "free", "art", "credits.json"), encoding="utf-8")) if os.path.exists(os.path.join(ASSETS, "free", "art", "credits.json")) else {}
def hung(axis, c, mid, zmid, width, into, file, **k):      # a picture by its width, its height from the image's own shape
    h = width * ART[file]["h"] / ART[file]["w"]
    art(axis, c, mid - width / 2, mid + width / 2, zmid - h / 2, zmid + h / 2, into, file, **k)

def rug(x0, y0, x1, y1, z, file, lvl=0):
    g = G("dress%d" % lvl); wide = (x1 - x0) >= (y1 - y0); imwide = ART[file]["w"] >= ART[file]["h"]
    uv = [(0, 0), (1, 0), (1, 1), (0, 1)] if wide == imwide else [(0, 1), (0, 0), (1, 0), (1, 1)]
    uv = [(0.04 + 0.92 * u_, 0.04 + 0.92 * v_) for u_, v_ in uv]                                   # inside the photograph's own edge
    g.face([(x0, y0, z + 0.012), (x1, y0, z + 0.012), (x1, y1, z + 0.012), (x0, y1, z + 0.012)], "img:" + file, (0, 0, 1), uvs=uv)

BOOKS = ["book1", "book2", "book3", "book4", "book5", "book6"]
FLAT.update({"book1": (0.25, 0.05, 0.04, 0.6), "book2": (0.05, 0.12, 0.08, 0.6), "book3": (0.07, 0.08, 0.2, 0.6), "book4": (0.3, 0.2, 0.1, 0.6), "book5": (0.12, 0.1, 0.08, 0.6), "book6": (0.45, 0.36, 0.22, 0.6)})
def bookcase(c, a, b, z0, z1, into, lvl=0, depth=0.3):
    """Built-in shelves along x at y=c (the room on the `into` side), filled with books."""
    g = G("dress%d" % lvl); y0, y1 = (c, c + depth) if into > 0 else (c - depth, c)
    g.box(a, y0, z0, b, y1, z0 + 0.1, "oakpanel"); g.box(a, y0, z1 - 0.08, b, y1, z1, "oakpanel")
    n = max(1, round((b - a) / 1.0))
    for i in range(n + 1):
        x = a + (b - a - 0.04) * i / n; g.box(x, y0, z0, x + 0.04, y1, z1, "oakpanel")
    z = z0 + 0.1
    while z + 0.34 < z1:
        g.box(a, y0, z + 0.3, b, y1, z + 0.33, "oakpanel")
        x = a + 0.05
        while x < b - 0.08:
            w = random.uniform(0.025, 0.06); h = random.uniform(0.19, 0.28); dd = random.uniform(0.16, 0.22)
            if random.random() < 0.04: x += random.uniform(0.05, 0.25); continue
            yb0, yb1 = (y1 - dd - 0.02, y1 - 0.02) if into > 0 else (y0 + 0.02, y0 + 0.02 + dd)
            g.box(x, yb0, z, x + w, yb1, z + h, random.choice(BOOKS)); x += w + 0.002
        z += 0.33

def table(x, y, z, L, W, H=0.78, along="x", lvl=0, mat="oakdoor"):
    g = G("dress%d" % lvl); a, b = (L / 2, W / 2) if along == "x" else (W / 2, L / 2)
    g.box(x - a, y - b, z + H - 0.07, x + a, y + b, z + H, mat)
    for sx in (-1, 1):
        for sy in (-1, 1): g.box(x + sx * (a - 0.16) - 0.06, y + sy * (b - 0.14) - 0.06, z, x + sx * (a - 0.16) + 0.06, y + sy * (b - 0.14) + 0.06, z + H - 0.07, mat)
    g.box(x - a + 0.2, y - 0.03, z + 0.12, x + a - 0.2, y + 0.03, z + 0.2, mat) if along == "x" else g.box(x - 0.03, y - b + 0.2, z + 0.12, x + 0.03, y + b - 0.2, z + 0.2, mat)

def shade_lamp(x, y, z, watts=38, lvl=0):
    g = G("dress%d" % lvl)
    cyl(g, (x, y, z), (x, y, z + 0.025), 0.085, 0.07, "gilt", 12); cyl(g, (x, y, z + 0.025), (x, y, z + 0.2), 0.03, 0.045, "gilt", 10); cyl(g, (x, y, z + 0.2), (x, y, z + 0.34), 0.045, 0.014, "gilt", 10)
    cyl(G("shades"), (x, y, z + 0.3), (x, y, z + 0.56), 0.19, 0.115, "shade", 16)                       # a tapered shade, open top and bottom
    lamp(x, y, z + 0.66, watts, colour=(1.0, 0.6, 0.28), radius=0.1, name="shade", bulb=False)

random.seed(1943)
with C():
    Z = HALL_Z
    # ---- the Great Hall ----
    rug(-5.9, 3.9, -0.5, 7.5, Z, "rug-02.jpg"); rug(0.5, 3.9, 5.9, 7.5, Z, "rug-06.jpg"); rug(-3.4, 8.0, 3.4, 11.9, Z, "rug-08.jpg")
    hung("y", HX1 - 0.1, HYM, 4.75, 3.9, -1, "tapestry-06.jpg", frame_="rugborder", proud=0.03)      # over the dining room's arch
    hung("x", HY1 - T_EXT / 2, 0.0, 4.75, 2.1, -1, "tapestry-01.jpg", frame_="rugborder", proud=0.03) # over the fireplace
    hung("y", HX1 - 0.07, HYM - 3.2, Z + 2.05, 0.85, -1, "portrait-02.jpg"); hung("y", HX1 - 0.07, HYM + 3.2, Z + 2.05, 0.85, -1, "portrait-04.jpg")
    hung("y", HX0 + 0.07, HYM - 3.2, Z + 2.05, 0.85, 1, "portrait-01.jpg"); hung("y", HX0 + 0.07, HYM + 3.2, Z + 2.05, 0.85, 1, "portrait-05.jpg")
    put("Sofa_01", -1.75, 9.7, Z, 0, 1.3, tint=RED); put("Sofa_01", 1.75, 9.7, Z, 180, 1.3, tint=RED); put("gothic_coffee_table", 0, 9.7, Z, 270, 0.8)
    put("ArmChair_01", -2.9, 11.2, Z, 315, 1.05, tint=RED); put("ArmChair_01", 2.9, 11.2, Z, 225, 1.05, tint=RED)
    table(-3.2, 5.7, Z, 2.8, 0.95); table(3.2, 5.7, Z, 2.4, 0.9)
    G("dress0").box(-4.4, 4.75, Z + 0.38, -2.0, 5.05, Z + 0.45, "oakdoor"); G("dress0").box(-4.3, 4.8, Z, -4.2, 5.0, Z + 0.38, "oakdoor"); G("dress0").box(-2.2, 4.8, Z, -2.1, 5.0, Z + 0.38, "oakdoor")   # the bench
    put("antique_ceramic_vase_01", -3.2, 5.7, Z + 0.78, 270, 1.3); put("brass_candleholders", 3.2, 5.7, Z + 0.78, 270, 0.7)
    for x, f in ((-4.9, 60), (-1.5, 120), (1.6, 60), (4.9, 120)): put("WoodenChair_01", x, 6.75, Z, f + 180, 0.55)
    put("ClassicConsole_01", -2.6, 3.42, Z, 90); put("ClassicConsole_01", 2.6, 3.42, Z, 90)
    shade_lamp(-2.6, 3.42, Z + 0.95); shade_lamp(2.6, 3.42, Z + 0.95)
    put("GothicCabinet_01", -6.3, 4.5, Z, 0); put("marble_bust_01", 6.45, 10.9, Z + 1.21, 180); put("GothicCommode_01", 6.5, 10.9, Z, 180)
    put("vintage_grandfather_clock_01", 6.55, 4.3, Z, 180); put("GreenChair_01", -5.9, 10.9, Z, 330); put("GreenChair_01", 5.6, 9.4, Z, 200)
    put("side_table_01", -6.2, 9.9, Z, 0); shade_lamp(-6.2, 9.9, Z + 0.55)
    # ---- the dining room ----
    rug(7.4, 4.2, 11.4, 10.2, 0, "rug-06.jpg")
    table(9.4, 7.25, 0, 4.5, 1.15, along="y")                       # one long dark table, bare (photo 12)
    for i in range(5):
        y = 5.35 + i * 0.95
        put("dining_chair_02", 8.55, y, 0, 0, tint=(0.42, 0.04, 0.04, 1)); put("dining_chair_02", 10.25, y, 0, 180, tint=(0.42, 0.04, 0.04, 1))
    put("dining_chair_02", 9.4, 4.75, 0, 90); put("dining_chair_02", 9.4, 9.75, 0, 270)
    put("brass_candleholders", 9.4, 7.25, 0.78, 0, 0.8); put("brass_candleholders", 9.4, 5.9, 0.78, 0, 0.6); put("brass_candleholders", 9.4, 8.6, 0.78, 0, 0.6)
    put("round_wooden_table_01", 11.9, 10.2, 0, 0, 0.78); put("GothicCommode_01", 10.1, 11.72, 0, 270)
    hung("x", 12.1 - T_EXT / 2, 10.1, 2.0, 1.0, -1, "portrait-03.jpg"); hung("y", 6.85 + 0.07, 10.6, 1.9, 1.5, 1, "landscape-04.jpg")
    put("vintage_cabinet_01", 12.9, 4.0, 0, 180); shade_lamp(9.6, 11.72, 1.21, 26); shade_lamp(10.6, 11.72, 1.21, 26)
    # ---- the library ----
    rug(-14.8, 3.9, -8.2, 8.4, 0, "rug-07.jpg")
    bookcase(3.0 + T_INT / 2, -15.3, -11.85, 0.0, 2.95, 1); bookcase(3.0 + T_INT / 2, -10.55, -7.0, 0.0, 2.95, 1)
    with frame(-15.5, 0, 90): bookcase(-0.1, 4.3, 5.2, 0.0, 2.95, -1); bookcase(-0.1, 7.0, 7.95, 0.0, 2.95, -1)      # flanking the fireplace
    gf = G("dress0")
    gf.box(-15.4, 5.3, 0, -15.1, 5.55, 1.3, "stoneblock"); gf.box(-15.4, 6.65, 0, -15.1, 6.9, 1.3, "stoneblock"); gf.box(-15.4, 5.3, 1.1, -15.05, 6.9, 1.45, "stoneblock")
    gf.box(-15.4, 5.55, 0, -15.36, 6.65, 1.1, "iron"); fire(-15.2, 6.1, 0.02, 0.8, 170, along="y")
    hung("y", -15.5 + 0.12, 6.1, 2.25, 0.95, 1, "portrait-06.jpg")
    put("Sofa_01", -11.4, 5.05, 0, 90, 1.3, tint=(0.62, 0.2, 0.24)); put("Sofa_01", -11.4, 7.45, 0, 270, 1.3, tint=(0.62, 0.2, 0.24))        # the red damask pair (photo 06); put("gothic_coffee_table", -11.4, 6.25, 0, 0, 0.75)
    put("ArmChair_01", -14.0, 5.2, 0, 20, 1.05, tint=RED); put("ArmChair_01", -14.0, 7.1, 0, 340, 1.05, tint=RED)
    put("side_table_01", -13.0, 8.6, 0, 270); shade_lamp(-13.0, 8.6, 0.55); put("ClassicConsole_01", -8.6, 8.85, 0, 270); shade_lamp(-8.6, 8.85, 0.95)
    put("chess_set", -11.4, 6.25, 0.45, 0)
    # ---- the long gallery, the vestibule and the stair ----
    rug(-6.5, 0.7, 6.5, 2.3, 0, "rug-03.jpg"); put("vintage_grandfather_clock_01", 7.5, 2.7, 0, 270)      # (on the blank stretch of the north wall: at x 10.2 it stood in the dining-room doorway)
    put("GothicCommode_01", -6.5, 2.65, 0, 270); put("WoodenChair_01", 3.5, 2.6, 0, 270, 0.55); put("WoodenChair_01", -3.4, 2.6, 0, 270, 0.55)
    hung("x", 0.0 + T_INT / 2, 9.35, 1.75, 1.4, 1, "landscape-03.jpg"); hung("x", 0.0 + T_INT / 2, 6.35, 1.75, 0.8, 1, "portrait-08.jpg")
    hung("y", -7.7 + T_EXT / 2, -2.2, 2.3, 1.7, 1, "landscape-01.jpg")
    rug(-6.5, 0.7, 6.5, 2.3, UF, "rug-04.jpg", lvl=1)
    put("vintage_grandfather_clock_01", 10.2, 1.5, UF, 180, lvl=1); put("WoodenChair_01", 4.0, 0.45, UF, 90, 0.55, lvl=1); put("ClassicConsole_01", 1.5, 0.42, UF, 90, lvl=1)
    # ---- upstairs, the central block ----
    put("GothicBed_01", -13.0, 10.6, UF, 270, 1.15, lvl=1); put("ClassicNightstand_01", -14.3, 11.7, UF, 270, lvl=1); put("ClassicNightstand_01", -11.7, 11.7, UF, 270, lvl=1)
    put("GothicCommode_01", -15.1, 6.0, UF, 0, lvl=1); put("ArmChair_01", -11.4, 4.2, UF, 135, lvl=1)
    put("vintage_wooden_drawer_01", 12.8, 5.5, UF, 180, lvl=1)                      # (the twin beds are built in stair.py)

with Wf():
    put("GothicBed_01", 4.6, 2.4, 0, 270, 1.15); put("ClassicNightstand_01", 3.3, 3.4, 0, 270); put("GothicCommode_01", 6.6, 0.0, 0, 180)
    put("GothicBed_01", 16.4, 2.2, 0, 270, 1.2); put("ArmChair_01", 15.9, -3.0, 0, 70); put("vintage_day_bed", 12.4, 3.2, 0, 270, 0.85); put("Sofa_01", 17.6, -2.9, 0, 90, 1.2)
    put("painted_wooden_bench" if False else "WoodenChair_01", 20.5, 2.9, 0, 270, 0.55)
    put("GothicBed_01", 4.9, 2.4, UF, 270, 1.15, lvl=1); put("ClassicNightstand_01", 3.5, 3.4, UF, 270, lvl=1); put("ornate_mirror_01", 7.45, 0.6, UF + 1.6, 180, 1.4, lvl=1)
    put("Sofa_01", 16.0, 3.1, UF, 270, 1.2, lvl=1); put("ArmChair_01", 15.6, 0.05, UF, 340, lvl=1); put("WoodenTable_03", 16.0, -2.6, UF, 90, lvl=1); put("WoodenChair_01", 16.0, -1.9, UF, 270, 0.5, lvl=1)
    put("vintage_day_bed", 20.5, 0.0, UF, 180, 0.9, lvl=1)
with Ef():
    put("WoodenTable_03", 19.0, 1.5, 0, 0, 1.2); put("ArmChair_01", 20.3, 2.9, 0, 250); put("GreenChair_01", 17.6, 2.9, 0, 290)
    put("GothicBed_01", 8.9, 2.4, UF, 270, 1.1, lvl=1); put("GothicBed_01", 16.45, 0.2, UF, 270, 0.7, lvl=1); put("vintage_day_bed", 19.3, 2.9, UF, 270, 0.9, lvl=1); put("vintage_day_bed", 19.3, -2.9, UF, 90, 0.9, lvl=1)
    put("old_bed_frame", 16.4, 2.2, BF, 270, lvl=-1); put("old_bed_frame", 19.8, 2.2, BF, 270, lvl=-1)
with Sf():
    put("sofa_02", 4.75, 8.4, 0, 270, 1.1, tint=(0.3, 0.5, 0.42)); put("ArmChair_01", 2.5, 5.7, 0, 30, 1.0, tint=(0.62, 0.3, 0.26)); put("ArmChair_01", 7.0, 5.7, 0, 150, 1.0, tint=(0.62, 0.3, 0.26)); put("gothic_coffee_table", 4.75, 6.4, 0, 0, 0.7)
    put("potted_plant_01", 0.5, 4.8, 0, 0); put("potted_plant_02", 8.9, 8.5, 0, 0); put("potted_plant_01", 9.9, 0.5, 0, 0, 0.8)
print("furniture:", sum(len(c_.objects) for c_ in FURN.values()), "pieces of", len([k for k, v in LIB.items() if v]), "models")
