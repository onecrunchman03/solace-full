# SURVIVORZ, GLENRIDGE HALL: the sixth pass, run inside build.py after service.py: small things the photos show.
# Ivy on the garden entry's brick gable and up the big chimney beside it (photo 01), the two eyelid dormers on the
# rear slope (nomination photos 3 and 4), a specimen tree or two close to the house.
FLAT["ivy"] = (0.03, 0.08, 0.025, 0.85)
with C():
    gi = G("ivy")
    def ivy(x0, x1, y, z0, z1, n, normal=(0, -1, 0), peak=None):
        for _ in range(n):
            x = random.uniform(x0, x1); z = random.uniform(z0, z1)
            if peak is not None and z > peak(x): continue
            leafmass(gi, Vector((x, y + random.uniform(-0.05, 0.02), z)), 0, 1, "ivy", size=(0.07, 0.15), flat=normal)
    ivy(6.0, 9.4, -2.6 - T_EXT / 2 - 0.03, -0.5, 4.3, 9000, peak=lambda x: 2.8 + (1.7 - abs(x - 7.7)) * 1.0)
    ivy(6.65, 8.15, -1.3 - 0.04, 2.6, 7.5, 3200)                                   # up the chimney's face
    for (x, sg) in ((6.62, -1), (8.18, 1)):
        for _ in range(1200): leafmass(gi, Vector((x, random.uniform(-1.3, -0.1), random.uniform(3.0, 6.5))), 0, 1, "ivy", size=(0.07, 0.15), flat=(sg, 0, 0))
    # the eyelid dormers on the rear slope
    g = G("roofR"); n = 10; r = 1.25; yb = 2.6
    for x in (-3.4, 3.4):
        zb = EAVE + yb; M = lambda px, py, pz: (px, 12.1 - py, pz)
        for i in range(n):
            a0, a1 = math.pi * i / n, math.pi * (i + 1) / n
            g.face([M(x - r * math.cos(a0), yb - 0.85, zb - 0.85 + 0.55 * math.sin(a0)), M(x - r * math.cos(a1), yb - 0.85, zb - 0.85 + 0.55 * math.sin(a1)),
                    M(x - r * math.cos(a1) * 0.2, yb + 0.55 * math.sin(a1) + 0.3, zb + 0.55 * math.sin(a1) + 0.3), M(x - r * math.cos(a0) * 0.2, yb + 0.55 * math.sin(a0) + 0.3, zb + 0.55 * math.sin(a0) + 0.3)], "slate", (0, 1, 1))
        G("glass1").face([M(x - r, yb - 0.86, zb - 0.84), M(x + r, yb - 0.86, zb - 0.84), M(x, yb - 0.86, zb - 0.3)], "leaded", (0, 1, 0))

# THE WOOD: a scanned oak (tall straight trunk, leafy crown) in place of the built trees, as copies of one mesh, each
# turned and scaled. "Oak Tree" by BBARTS, Sketchfab, CC Attribution (credited in docs/survivorz/GLENRIDGE.md),
# brought in through the Blender add-on and kept as free/sketchfab/oak-bbarts.blend. GLEN_TREES=built keeps the
# light stand-ins (quick test builds).
OAK = os.path.join(ASSETS, "free", "sketchfab", "oak-bbarts.blend")
if os.environ.get("GLEN_TREES", "oak") != "built" and os.path.exists(OAK):
    with bpy.data.libraries.load(OAK, link=False) as (src_, dst_): dst_.meshes = [m for m in src_.meshes if m == "oak-bbarts"]
    oak = dst_.meshes[0] if dst_.meshes else None
    if oak is not None:
        for m_ in oak.materials:                       # leaves: the texture's cut-out edge, and light through them
            b_ = next((n for n in m_.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if b_:                                         # the scan's materials light themselves: off (the trunks glowed at night)
                b_.inputs["Emission Strength"].default_value = 0.0
                for l_ in [l for l in m_.node_tree.links if l.to_socket == b_.inputs["Emission Color"]]: m_.node_tree.links.remove(l_)
            if b_ and "leaf" in m_.name.lower(): b_.inputs["Roughness"].default_value = 0.6
            if b_ and "bark" in m_.name.lower():           # the scan's bark is a pale tan: these are dark wet trunks
                nt_ = m_.node_tree; lk = next((l for l in nt_.links if l.to_socket == b_.inputs["Base Color"]), None)
                if lk:
                    hs = nt_.nodes.new("ShaderNodeHueSaturation"); hs.inputs["Saturation"].default_value = 0.3; hs.inputs["Value"].default_value = 0.42
                    src_sock = lk.from_socket; nt_.links.remove(lk); nt_.links.new(src_sock, hs.inputs["Color"]); nt_.links.new(hs.outputs["Color"], b_.inputs["Base Color"])
        for o in tcoll.objects:
            o.data = oak; k = random.uniform(0.85, 1.3); o.scale = (k, k, k * random.uniform(0.95, 1.15))
        print("the wood: %d oaks" % len(tcoll.objects))

# THE BEDS AGAINST THE HOUSE: in front of each clipped shrub (details.py) a scanned plant (Poly Haven, CC0), turned and
# sized to its place: the open twiggy ones and ferns, which are what a real bed has at its edge.
def tall_of(id):
    m = model(id); return max(v.co.z for v in m.vertices) if m else 1.0
if SHRUB_SPOTS:
    random.seed(77)
    for i, ((wx, wy), r, (fx, fy)) in enumerate(SHRUB_SPOTS):
        id_ = random.choice(variants(random.choice(("fern_02", "shrub_03", "shrub_01", "shrub_02", "shrub_04", "fern_02"))))
        put(id_, fx + random.uniform(-0.3, 0.3), fy + random.uniform(-0.2, 0.2), -0.5, random.uniform(0, 360), random.uniform(0.5, 0.85) / tall_of(id_), name="bedplant")
    print("beds: %d shrubs" % len(SHRUB_SPOTS))
