# SURVIVORZ, GLENRIDGE HALL: the second pass, run inside build.py (it shares build.py's names): the front's own
# pieces from the photos and the pen drawing, the trees, the rain, and the Great Hall's dressing.

# ---- the stair gable's oriel: a two-storey leaded bay hung on the front, under the jettied gable ---------------
with C():
    gf = G("frame1"); gg = G("glass1")
    OX0, OX1, OY, OW, OZ0, OZ1 = -6.05, -3.65, -4.92, -4.4 - T_EXT / 2, 1.75, 5.5
    gf.box(OX0 - 0.06, OY - 0.06, OZ0 - 0.16, OX1 + 0.06, OW, OZ0, "timber")                     # the sill board
    gf.box(OX0 - 0.1, OY - 0.1, OZ1, OX1 + 0.1, OW, OZ1 + 0.14, "timber")                        # the head
    G("roofR").face([(OX0 - 0.15, OY - 0.15, OZ1 + 0.12), (OX1 + 0.15, OY - 0.15, OZ1 + 0.12), (OX1 + 0.15, OW, OZ1 + 0.5), (OX0 - 0.15, OW, OZ1 + 0.5)], "slate", (0, -1, 1))
    for x in (OX0, OX1 - 0.1): gf.box(x, OY, OZ0, x + 0.1, OY + 0.1, OZ1, "timber")
    for i in range(1, 4):
        x = OX0 + (OX1 - OX0) * i / 4; gf.box(x - 0.035, OY, OZ0, x + 0.035, OY + 0.07, OZ1, "timber")
    for z in (OZ0 + 0.95, OZ0 + 1.85, OZ0 + 2.8):
        gf.box(OX0, OY, z - 0.04, OX1, OY + 0.08, z + 0.04, "timber")
        for x in (OX0, OX1 - 0.07): gf.box(x, OY, z - 0.04, x + 0.07, OW, z + 0.04, "timber")
    gf.box(OX0, OY, OZ0 + 1.45, OX1, OY + 0.05, OZ0 + 1.85, "timber")                            # the carved apron between the storeys
    gg.face([(OX0, OY + 0.04, OZ0), (OX1, OY + 0.04, OZ0), (OX1, OY + 0.04, OZ1), (OX0, OY + 0.04, OZ1)], "leaded", (0, -1, 0))
    for x in (OX0 + 0.04, OX1 - 0.04): gg.face([(x, OY, OZ0), (x, OW, OZ0), (x, OW, OZ1), (x, OY, OZ1)], "leaded", (1, 0, 0))
    for x in (OX0 + 0.25, OX1 - 0.25): gf.beam((x, OW, 0.85), (x, OY + 0.05, OZ0 - 0.14), 0.12, 0.14, "timber")
    # the dormer in the swept-down roof, between the porte-cochere and the big chimney
    wall_x(-2.4, 4.5, 5.7, 4.2, 5.25, 0.1, "plaster", "ht:stucco", [dict(u0=4.72, u1=5.48, z0=4.42, z1=5.1, kind="win")], lvl="1")
    for x, sg in ((4.5, -1), (5.7, 1)): G("wall1").face([(x, -2.4, 4.2), (x, -2.4, 5.25), (x, -1.25, 5.25)], "stucco", (sg, 0, 0))
    with frame(0, 0, 90): gable(-2.55, -5.85, -0.6, -4.35, 5.25, pitch=40, over=0.15)
    # the lanterns: iron cages round the lamps at the door and under the porte-cochere
    gi = G("porte")
    for x, y, z in ((0.2, -6.9, 2.55), (-1.3, -3.9, 2.0), (1.7, -3.9, 2.0)):
        for dx in (-0.11, 0.11):
            for dy in (-0.11, 0.11): gi.beam((x + dx, y + dy, z - 0.2), (x + dx, y + dy, z + 0.2), 0.02, 0.02, "iron")
        gi.box(x - 0.14, y - 0.14, z + 0.2, x + 0.14, y + 0.14, z + 0.24, "iron"); gi.box(x - 0.13, y - 0.13, z - 0.23, x + 0.13, y + 0.13, z - 0.2, "iron")

# ---- the east wing's end: the lower hipped rooms beside the service yard ----------------------------------------
with Ef():
    wall_x(-2.7, 21.5, 24.6, GF - PLINTH, 2.9, T_EXT, CREAM, "brick", [dict(u0=22.4, u1=23.6, z0=0.9, z1=2.2, kind="win")], lvl="0")
    wall_x(2.7, 21.5, 24.6, GF - PLINTH, 2.9, T_EXT, "brick", CREAM, [dict(u0=22.4, u1=23.6, z0=0.9, z1=2.2, kind="win")], lvl="0")
    wall_y(24.6, -2.7 - 0.17, 2.7 + 0.17, GF - PLINTH, 2.9, T_EXT, "brick", CREAM, [dict(u0=-0.5, u1=0.5, z0=0, z1=2.1, kind="door", id="yard-door")], lvl="0")
    G("floor0").face([(21.5, -2.7, 0.001), (24.6, -2.7, 0.001), (24.6, 2.7, 0.001), (21.5, 2.7, 0.001)], "checker", (0, 0, 1))
    G("ceil0").face([(21.5, -2.7, 2.6), (24.6, -2.7, 2.6), (24.6, 2.7, 2.6), (21.5, 2.7, 2.6)], "ceil", (0, 0, -1))
    gable(21.3, -2.7, 24.6, 2.7, 2.9, pitch=38, hips=(0.0, 2.2))
    lamp(23.0, 0.0, 2.2, 45, name="room-scullery")

# ---- shrubs along the foot of the front walls --------------------------------------------------------------------
def blob(g, x, y, z, r, mat, squash=0.7, jitter=0.18):
    """A lumpy ball (an icosahedron split once: 80 faces), for shrubs, leaf masses and boulders."""
    vs = [v * r * random.uniform(1 - jitter, 1 + jitter) for v in ICOV]; mids = {}
    def mid(i, j):
        k = (min(i, j), max(i, j))
        if k not in mids: mids[k] = (ICOV[i] + ICOV[j]).normalized() * r * random.uniform(1 - jitter, 1 + jitter)
        return mids[k]
    for (a, b, c) in ICO:
        ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
        for tri in ((vs[a], ab, ca), (vs[b], bc, ab), (vs[c], ca, bc), (ab, bc, ca)):
            g.face([(x + p.x, y + p.y, z + p.z * squash) for p in tri], mat, tuple(tri[0] + tri[1] + tri[2]))

gsh = G("shrubs")
LEAF = float(os.environ.get("GLEN_LEAVES", "1"))        # 1 = stills; a live scene sets less (fewer, larger leaves: 0.3 is a third of the faces)
def bush(x, y, z, r, tall=1.0, mat="hedge"):
    """A shrub: a dark core so it is not see-through, and a coat of small leaves."""
    if LEAF >= 1: blob(gsh, x, y, z + r * 0.6 * tall, r * 0.82, "plant3", squash=0.75 * tall, jitter=0.2)
    else:                                                 # the lighter build: the dark core as twenty faces, not eighty
        for (ia, ib, ic) in ICO: gsh.face([(x + ICOV[k].x * r * 0.82, y + ICOV[k].y * r * 0.82, z + r * 0.6 * tall + ICOV[k].z * r * 0.82 * 0.75 * tall) for k in (ia, ib, ic)], "plant3", tuple(ICOV[ia] + ICOV[ib] + ICOV[ic]))
    g = G("leafage"); c = Vector((x, y, z + r * 0.6 * tall))
    for _ in range(int((420 * r * r * tall + 90) * LEAF)):
        d = Vector((random.gauss(0, 1), random.gauss(0, 1), random.gauss(0, 1))); d.normalize()
        p = c + Vector((d.x * r, d.y * r, d.z * r * 0.78 * tall)) * random.uniform(0.9, 1.06)
        a = d.cross(Vector((0.3, 0.2, 1))); a.normalize(); b = d.cross(a); sz = random.uniform(0.03, 0.065) / math.sqrt(LEAF)
        g.face([tuple(p - a * sz - b * sz * 0.6), tuple(p + a * sz - b * sz * 0.6), tuple(p + a * sz * 0.4 + b * sz), tuple(p - a * sz * 0.8 + b * sz * 0.8)], mat, tuple(d))
def in_house(wx, wy, pad=0.45):
    """Is this point of the world inside (or within `pad` of) any ground-floor room? Nothing is planted there."""
    for r in ROOMS:
        if r.lvl != 0: continue
        ox, oy, dg = BLOCKS[r.blk][:3]; c_, s_ = math.cos(math.radians(dg)), math.sin(math.radians(dg))      # by hand: a frame() here would nest inside the caller's
        u, v = c_ * (wx - ox) + s_ * (wy - oy), -s_ * (wx - ox) + c_ * (wy - oy)
        if r.x0 - pad < u < r.x1 + pad and r.y0 - pad < v < r.y1 + pad: return True
    return False
SHRUB_SPOTS = []; REAL_SHRUBS = os.path.exists(os.path.join(PH, "shrub_01", "shrub_01.gltf"))
def shrub_row(p0, p1, off, n):
    for i in range(n):
        t = (i + random.uniform(0.2, 0.8)) / n
        x, y = p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t
        r = random.uniform(0.45, 0.9)
        if in_house(*T(x, y + off)): continue
        bush(x, y + off, -0.3, r)
        if REAL_SHRUBS and not in_house(*T(x, y + off * 1.9)): SHRUB_SPOTS.append((T(x, y + off), r, T(x, y + off * 1.9)))      # polish.py sets a scanned plant in front of it
        if random.random() < 0.25: bush(x + 0.3, y + off - 0.2, -0.3, 0.45, tall=2.4)      # a clipped cone
with Wf(): shrub_row((-2.5, HW), (18.5, HW), 0.9, 22)
with Ef(): shrub_row((-2.5, -HW), (21.0, -HW), -0.9, 24)
with C(): shrub_row((6.2, -2.6), (9.3, -2.6), -0.8, 4); shrub_row((-7.6, -4.4), (-5.9, -4.4), -0.8, 2); shrub_row((-10.6, 0.0), (-8.0, 0.0), -0.9, 3); shrub_row((9.7, 0.0), (12.4, 0.0), -0.9, 3); shrub_row((4.6, -2.6), (6.0, -2.6), -0.8, 2)

# ---- trees: tall hardwoods, bare for half their height, built four ways and set out as copies --------------------
def cyl(g, p0, p1, r0, r1, mat, n=6):
    p0, p1 = Vector(p0), Vector(p1); d = (p1 - p0).normalized()
    a = d.cross(Vector((0, 0, 1)))
    if a.length < 1e-4: a = Vector((1, 0, 0))
    a.normalize(); b = d.cross(a)
    L = (p1 - p0).length
    for k in range(n):
        t0, t1 = 2 * math.pi * k / n, 2 * math.pi * (k + 1) / n
        e0, e1 = a * math.cos(t0) + b * math.sin(t0), a * math.cos(t1) + b * math.sin(t1)
        g.face([tuple(p0 + e0 * r0), tuple(p0 + e1 * r0), tuple(p1 + e1 * r1), tuple(p1 + e0 * r1)], mat, tuple(e0 + e1),
               uvs=[(k * r0, 0), ((k + 1) * r0, 0), ((k + 1) * r0, L), (k * r0, L)])

def leafmass(g, c, r, n, mat="leaves", size=(0.45, 0.8), flat=None):
    """Foliage as loose leaf cards scattered through a ball (ragged against the sky, with gaps), not a solid lump.
    flat = a wall's outward normal for ivy: the cards lie nearly against it."""
    for _ in range(n):
        d = Vector((random.gauss(0, 1), random.gauss(0, 1), random.gauss(0, 1) * 0.8)); d.normalize()
        p = c + d * r * random.uniform(0.35, 1.0) ** 0.6 if flat is None else c
        nrm = d if flat is None else (Vector(flat) + Vector((random.uniform(-0.5, 0.5), random.uniform(-0.5, 0.5), random.uniform(-0.5, 0.5)))).normalized()
        a = nrm.cross(Vector((0.3, 0.2, 1))); a.normalize(); b = nrm.cross(a)
        s_ = random.uniform(*size); a *= s_ / 2; b *= s_ / 2 * random.uniform(0.6, 1.0)
        g.face([tuple(p - a - b), tuple(p + a - b), tuple(p + a * 0.3 + b), tuple(p - a * 0.9 + b * 0.8)], mat, tuple(nrm))

def grow(g, p, d, length, r, depth):
    q = p + d * length
    cyl(g, p, q, r, r * 0.72, "bark", 7 if depth > 3 else 5)
    if depth == 0 or r < 0.05:
        for _ in range(2):
            c = q + Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-0.4, 0.8)))
            leafmass(g, c, random.uniform(1.2, 2.1), 46)
        return
    for _ in range(3 if depth > 1 else 2):
        ax = Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-0.2, 0.5))).normalized()
        nd = (d + ax * random.uniform(0.55, 1.0)).normalized()
        if nd.z < 0.05: nd.z = 0.1; nd.normalize()
        grow(g, q, nd, length * random.uniform(0.6, 0.78), r * 0.62, depth - 1)

TREE_MESH = []
for v in range(4):
    random.seed(4100 + v)
    gT = Geo("tree%d" % v)
    lean_ = Vector((random.uniform(-0.05, 0.05), random.uniform(-0.05, 0.05), 1)).normalized()
    grow(gT, Vector((0, 0, -0.4)), lean_, random.uniform(10.5, 13.5), 0.42, 4)
    ob = gT.finish(bpy.data.collections.new("tree-src"), material_of)
    TREE_MESH.append(ob.data)
random.seed(77)
tcoll = bpy.data.collections.new("trees"); scene.collection.children.link(tcoll)
for i, (x, y, s) in enumerate(TREES):
    o = bpy.data.objects.new("tree", TREE_MESH[i % 4]); o.location = (x, y, ground_h(x, y) - 0.25); o.rotation_euler = (0, 0, random.uniform(0, 6.28))
    o.scale = (s, s, s * random.uniform(0.9, 1.15)); tcoll.objects.link(o)

# ---- rain: thin slanting streaks through the air round the house (storm renders only) -----------------------------
def indoors(x, y, z):
    if z > 13: return False
    if -26 < x < 19 and -10.5 < y < 15.5: return True
    for nm in ("W", "E"):
        with frame(*BLOCKS[nm][:3]):
            u, v = Tinv(x, y)
        if -4 < u < 25 and abs(v) < 4.3: return True
    return False
gr_ = G("rain"); WIND = Vector((0.2, 0.1, -1)).normalized()
for _ in range(26000):
    x, y, z = random.uniform(-75, 75), random.uniform(-95, 45), random.uniform(-0.3, 24)
    if indoors(x, y, z): continue
    L = random.uniform(0.5, 1.0); a = random.uniform(0, math.pi); w = 0.0035
    sx, sy = math.cos(a) * w, math.sin(a) * w
    p = Vector((x, y, z)); q = p + WIND * L
    gr_.face([(p.x - sx, p.y - sy, p.z), (p.x + sx, p.y + sy, p.z), (q.x + sx, q.y + sy, q.z), (q.x - sx, q.y - sy, q.z)], "rain", None)
def rain_mat():
    m = bpy.data.materials.new("rain"); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (0.75, 0.82, 0.9, 1); b.inputs["Roughness"].default_value = 0.15; b.inputs["Alpha"].default_value = 0.45
    b.inputs["Emission Color"].default_value = (0.6, 0.7, 0.9, 1); b.inputs["Emission Strength"].default_value = 0.004
    MATS["rain"] = m
rain_mat()

# ---- the Great Hall, dressed: tapestries, the red curtains, portraits, rugs, lamps ---------------------------------
FLAT.update({"tapestry": (0.2, 0.2, 0.12, 0.95), "tapestry2": (0.3, 0.26, 0.16, 0.95), "gilt": (0.75, 0.55, 0.2, 0.4), "canvas": (0.06, 0.05, 0.04, 0.6),
             "rugred": (0.36, 0.05, 0.05, 0.95), "rugblue": (0.07, 0.09, 0.2, 0.95), "rugborder": (0.55, 0.42, 0.3, 0.95)})
TEX["velvet"] = ("velour_velvet", 0.6, (0.75, 0.04, 0.07), 1.0)
with C():
    gd = G("dress0")
    for wx in (-4.9, 4.9):                                                                   # the damask curtains at the two tall windows
        for sg in (-1, 1):
            x0 = wx + sg * 0.95
            for k in range(7):
                xa = x0 + sg * k * 0.085; dep = 0.07 + 0.05 * (k % 2)
                gd.box(min(xa, xa + sg * 0.085), HY1 - T_EXT / 2 - 0.12 - dep, HALL_Z + 0.05, max(xa, xa + sg * 0.085), HY1 - T_EXT / 2 - 0.1, HALL_Z + 4.85, "velvet")
        gd.box(wx - 1.6, HY1 - T_EXT / 2 - 0.3, HALL_Z + 4.75, wx + 1.6, HY1 - T_EXT / 2 - 0.05, HALL_Z + 5.25, "velvet")
