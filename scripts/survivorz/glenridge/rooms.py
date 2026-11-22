# SURVIVORZ, GLENRIDGE HALL: the third pass, run inside build.py after furnish.py: ceilings (beams, the library's
# plaster strapwork, the upper gallery's boarded barrel, the arcade's vault), the kitchen and butler's pantry
# (photos 23-25: green frames, cream panels, a steel sink run under three windows, glazed upper cupboards),
# the breakfast room, and a light fitting in every room.
FLAT.update({"creampanel": (0.86, 0.82, 0.55, 0.5), "cabglass": (0.55, 0.62, 0.55, 0.15), "yellowpaint": (0.85, 0.72, 0.25, 0.5), "china": (0.85, 0.87, 0.9, 0.3), "globe": (0.9, 0.9, 0.85, 0.3)})
emissive("globeglow", (1.0, 0.8, 0.55), 5.0)

# ---- beams under every "beamceil" ---------------------------------------------------------------------------------
for r in ROOMS:
    if r.ceil not in ("beamceil", "beamdark"): continue
    with frame(*BLOCKS[r.blk][:3]):
        g = G("joinery%d" % r.lvl); zc = r.z + r.h; lx, ly = r.x1 - r.x0, r.y1 - r.y0
        heavy = r.id == "dining-room"
        w, d = (0.2, 0.24) if heavy else (0.13, 0.16)
        if lx >= ly:                                  # joists across the short way, a main beam or two along
            n = max(1, round(lx / (1.5 if heavy else 0.8)))
            for i in range(n + 1): x = r.x0 + 0.1 + (lx - 0.2) * i / n; g.box(x - w / 2, r.y0 + 0.07, zc - d, x + w / 2, r.y1 - 0.07, zc, "timber")
            if ly > 3.5: g.box(r.x0 + 0.07, (r.y0 + r.y1) / 2 - 0.12, zc - d - 0.1, r.x1 - 0.07, (r.y0 + r.y1) / 2 + 0.12, zc, "timber")
        else:
            n = max(1, round(ly / (1.5 if heavy else 0.8)))
            for i in range(n + 1): y = r.y0 + 0.1 + (ly - 0.2) * i / n; g.box(r.x0 + 0.07, y - w / 2, zc - d, r.x1 - 0.07, y + w / 2, zc, "timber")
            if lx > 3.5: g.box((r.x0 + r.x1) / 2 - 0.12, r.y0 + 0.07, zc - d - 0.1, (r.x0 + r.x1) / 2 + 0.12, r.y1 - 0.07, zc, "timber")

with C():
    # ---- the library's ceiling: plaster ribs in squares, lozenges and rings (photo 06) -----------------------------
    g = G("joinery0"); zc = 3.2 - 0.02; x0, x1, y0, y1 = -15.4, -6.95, 3.1, 9.1
    nx, ny = 4, 3; tw, th = (x1 - x0) / nx, (y1 - y0) / ny
    rib = lambda p, q: g.beam((p[0], p[1], zc), (q[0], q[1], zc), 0.06, 0.035, "strapwork")
    for i in range(nx):
        for j in range(ny):
            cx, cy = x0 + tw * (i + 0.5), y0 + th * (j + 0.5); hx, hy = tw / 2, th / 2
            sq = [(cx - hx, cy - hy), (cx + hx, cy - hy), (cx + hx, cy + hy), (cx - hx, cy + hy)]
            loz = [(cx - hx, cy), (cx, cy - hy), (cx + hx, cy), (cx, cy + hy)]
            for k in range(4): rib(sq[k], sq[(k + 1) % 4]); rib(loz[k], loz[(k + 1) % 4])
            rr = min(hx, hy) * 0.42
            ring = [(cx + rr * math.cos(2 * math.pi * k / 16), cy + rr * math.sin(2 * math.pi * k / 16)) for k in range(16)]
            for k in range(16): rib(ring[k], ring[(k + 1) % 16])
            g.box(cx - 0.09, cy - 0.09, zc - 0.07, cx + 0.09, cy + 0.09, zc, "strapwork")
    # ---- the upper gallery's boarded barrel ceiling with its ribs (photo 08) ----------------------------------------
    gc = G("ceil1"); gj = G("joinery1"); N = 8
    prof = [(0.06 + (3.0 - 0.12) * k / N, UF + 2.05 + 0.5 * math.sin(math.pi * k / N)) for k in range(N + 1)]
    for k in range(N):
        (ya, za), (yb, zb) = prof[k], prof[k + 1]
        gc.face([(-15.5, ya, za), (18.25, ya, za), (18.25, yb, zb), (-15.5, yb, zb)], "boardceil", (0, 0, -1))
    x = -15.2
    while x < 18.2:
        for k in range(N): gj.beam((x, prof[k][0], prof[k][1] - 0.04), (x, prof[k + 1][0], prof[k + 1][1] - 0.04), 0.1, 0.07, "timber", up=(1, 0, 0))
        x += 1.3
    # ---- the breakfast room: the round table and its painted chairs under the tented ceiling (photo 18) -------------
    put("round_wooden_table_01", OC[0], OC[1], 0, 0, 0.64)
    for k in range(4):
        a = math.radians(45 + 90 * k); put("GreenChair_01", OC[0] + 0.78 * math.cos(a), OC[1] + 0.78 * math.sin(a), 0, math.degrees(a) + 180, 0.8, tint=(0.35, 0.8, 0.6))      # tucked in: a body walks round the table (the walk map found the room cut in two)

with Sf():   # the arcade's pointed vault, cream between the gilt ribs (photo 11)
    gc = G("ceil0"); N = 6
    for sg in (-1, 1):
        prof = [(1.45 + sg * 1.4 * (1 - k / N), 2.1 + 1.25 * math.sin(math.pi / 2 * k / N)) for k in range(N + 1)]
        for k in range(N):
            (ya, za), (yb, zb) = prof[k], prof[k + 1]
            gc.face([(0.0, ya, za), (10.6, ya, za), (10.6, yb, zb), (0.0, yb, zb)], "vault", (0, 0, -1))

# ---- the kitchen and the butler's pantry ---------------------------------------------------------------------------
FLAT.update({"cabyellow": (0.78, 0.62, 0.2, 0.5), "cabinside": (0.7, 0.58, 0.24, 0.7)}); TEX["counter"] = ("oak_veneer_01", 1.0, (0.7, 0.46, 0.24), 0.6)
def clear_glass():
    m = bpy.data.materials.new("cabglass"); m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL": nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent"); gl = nt.nodes.new("ShaderNodeBsdfGlossy"); gl.inputs["Roughness"].default_value = 0.03; mx = nt.nodes.new("ShaderNodeMixShader"); mx.inputs[0].default_value = 0.1
    nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(gl.outputs[0], mx.inputs[2]); nt.links.new(mx.outputs[0], out.inputs["Surface"]); MATS["cabglass"] = m
clear_glass()
def cab_x(c, a, b, into, kind="base", top="wood", lvl=0):
    """A run of cupboards along x against the wall at y=c (the room on the `into` side), as the kitchen's are (photo 23):
    green frames, yellow panels, a row of drawers over the base doors, glazed uppers on brackets with the china showing."""
    g = G("dress%d" % lvl)
    def fbox(xa, d0, z0, xb, d1, z1, mat):                  # a box by its depth out from the wall
        ya, yb = sorted((c + into * d0, c + into * d1)); g.box(xa, ya, z0, xb, yb, z1, mat)
    def run(depth, z0, z1, glazed, drawers=False):
        n = max(1, round((b - a) / 0.5)); P = 0.016
        if glazed:                                          # an open carcass: back, top, bottom, ends, two shelves
            fbox(a, 0, z0, b, 0.015, z1, "cabinside"); fbox(a, 0, z0, b, depth, z0 + 0.03, "greenpaint"); fbox(a, 0, z1 - 0.03, b, depth, z1, "greenpaint")
            for x in (a, b - 0.02): fbox(x, 0, z0, x + 0.02, depth, z1, "greenpaint")
            shelves = [z0 + 0.03 + (z1 - z0 - 0.06) * k / 3 for k in (0, 1, 2)]
            for zz in shelves[1:]: fbox(a + 0.02, 0.015, zz - 0.012, b - 0.02, depth - 0.03, zz + 0.012, "cabinside")
            fbox(a - 0.02, 0, z1, b + 0.02, depth + 0.035, z1 + 0.06, "greenpaint")                       # the cornice
        else: fbox(a, 0, z0, b, depth, z1, "greenpaint")
        for i in range(n):
            xa, xb = a + (b - a) * i / n + 0.03, a + (b - a) * (i + 1) / n - 0.03; zd = z1 - 0.21 if drawers else z1 - 0.045
            if drawers:                                     # a drawer over the door, with its pull
                fbox(xa, depth, z1 - 0.18, xb, depth + P, z1 - 0.04, "greenpaint"); fbox(xa + 0.04, depth + P, z1 - 0.155, xb - 0.04, depth + P + 0.006, z1 - 0.065, "cabyellow")
                fbox((xa + xb) / 2 - 0.05, depth + P, z1 - 0.117, (xa + xb) / 2 + 0.05, depth + P + 0.03, z1 - 0.103, "steel")
            if glazed:
                for u0, u1, w0, w1 in ((xa, xa + 0.04, z0 + 0.045, zd), (xb - 0.04, xb, z0 + 0.045, zd), (xa, xb, z0 + 0.045, z0 + 0.085), (xa, xb, zd - 0.04, zd)): fbox(u0, depth, w0, u1, depth + P, w1, "greenpaint")
                fbox(xa + 0.04, depth + 0.004, z0 + 0.085, xb - 0.04, depth + 0.008, zd - 0.04, "cabglass")
                fbox((xa + xb) / 2 - 0.008, depth + 0.002, z0 + 0.085, (xa + xb) / 2 + 0.008, depth + 0.013, zd - 0.04, "greenpaint")
                for k in (1, 2, 3): zz = z0 + 0.085 + (zd - z0 - 0.125) * k / 4; fbox(xa + 0.04, depth + 0.002, zz - 0.008, xb - 0.04, depth + 0.013, zz + 0.008, "greenpaint")
                for zz in shelves:                           # the china: a stack of plates, a bowl or a jug in each bay
                    xm = (xa + xb) / 2; kind_ = random.random()
                    if kind_ < 0.45: fbox(xm - 0.1, depth * 0.3, zz + 0.012, xm + 0.1, depth * 0.3 + 0.2, zz + 0.012 + random.uniform(0.04, 0.12), "china")
                    elif kind_ < 0.8: fbox(xm - 0.07, depth * 0.35, zz + 0.012, xm + 0.07, depth * 0.35 + 0.14, zz + 0.1, "china"); fbox(xm + 0.09, depth * 0.3, zz + 0.012, xm + 0.17, depth * 0.3 + 0.08, zz + 0.19, "china")
            else:
                fbox(xa, depth, z0 + 0.045, xb, depth + P, zd, "greenpaint"); fbox(xa + 0.05, depth + P, z0 + 0.095, xb - 0.05, depth + P + 0.006, zd - 0.05, "cabyellow")
            fbox(xb - 0.035, depth + P, (z0 + zd) / 2 - 0.02, xb - 0.015, depth + P + 0.03, (z0 + zd) / 2 + 0.02, "steel")   # the catch
    if kind in ("base", "full"):
        run(0.58, 0.1, 0.88, False, drawers=True)
        fbox(a - 0.01, 0, 0.88, b + 0.01, 0.63, 0.92, "steel" if top == "steel" else "counter")
        fbox(a, 0, 0.0, b, 0.52, 0.1, "blacktile")
        if top == "steel":                                  # the sink run: a steel splashback, two sunk bowls, the taps
            fbox(a, 0, 0.92, b, 0.025, 1.22, "steel"); xm = (a + b) / 2
            for sx in (-0.5, 0.5): fbox(xm + sx - 0.4, 0.12, 0.915, xm + sx + 0.4, 0.54, 0.925, "soot")
            g.beam((xm, c + into * 0.06, 0.92), (xm, c + into * 0.06, 1.2), 0.025, 0.025, "steel"); g.beam((xm, c + into * 0.06, 1.19), (xm, c + into * 0.24, 1.14), 0.02, 0.02, "steel")
    if kind in ("upper", "full"):
        run(0.34, 1.42, 2.55, True)
        nb = max(2, round((b - a) / 1.3) + 1)
        for k in range(nb):                                 # the brackets the upper cupboards sit on
            x = a + 0.02 + (b - a - 0.08) * k / (nb - 1)
            for d1, w0, w1 in ((0.3, 1.36, 1.42), (0.2, 1.27, 1.36), (0.1, 1.14, 1.27)): fbox(x, 0, w0, x + 0.04, d1, w1, "greenpaint")
    if kind == "tall": run(0.45, 0.1, 2.6, True)
def cab_y(c, a, b, into, **k):
    with frame(c, 0, 90): cab_x(0, a, b, -into, **k)

def pendant(x, y, zc, drop=0.75, watts=0, lvl=0):
    g = G("dress%d" % lvl)
    g.beam((x, y, zc), (x, y, zc - drop), 0.015, 0.015, "iron")
    G("globes").smooth = True; blob(G("globes"), x, y, zc - drop - 0.1, 0.13, "globeglow", squash=0.85, jitter=0.0); lamp(x, y, zc - drop - 0.3, 34, name="globe", bulb=False)

with Ef():
    K0, K1 = 5.7, 12.1                                  # the kitchen
    cab_x(HW - T_EXT / 2, K0 + 0.3, K1 - 0.3, -1, "base", "steel")                        # the sink run under the three windows
    G("dress0").box(8.2, HW - T_EXT / 2 - 0.5, 0.78, 9.6, HW - T_EXT / 2 - 0.1, 0.9, "steel")
    cab_x(-HW + T_EXT / 2, K0 + 0.6, K1 - 1.2, 1, "base")
    cab_y(K0 + T_INT / 2, 0.9, 3.1, 1, kind="full"); cab_y(K0 + T_INT / 2, -3.2, -0.9, 1, kind="full")
    cab_y(K1 - T_INT / 2, -2.2, 1.9, -1, kind="full")
    table(8.9, -0.3, 0, 2.0, 0.9, 0.86, mat="yellowpaint")
    for u in (7.4, 10.4): pendant(u, 0.0, 3.0, 0.8)
    P0, P1 = 2.2, 5.7                                   # the butler's pantry: glazed cupboards to the ceiling, the ladder
    for v0, v1 in ((0.9, 3.4), (-3.4, -0.9)):
        cab_y(P0 + 0.1, v0, v1, 1, kind="tall"); cab_y(P1 - T_INT / 2, v0, v1, -1, kind="tall")
    cab_x(HW - T_EXT / 2, P0 + 0.6, 3.2, -1, "full"); cab_x(HW - T_EXT / 2, 4.7, P1 - 0.6, -1, "full")
    gl_ = G("dress0")
    for dv in (-0.2, 0.2): gl_.beam((P1 - 0.75, 1.9 + dv, 0.0), (P1 - 0.52, 1.9 + dv, 2.5), 0.03, 0.05, "oakdoor")
    for k in range(8): gl_.beam((P1 - 0.75 + 0.23 * (k + 1) / 9, 1.7, 2.5 * (k + 1) / 9), (P1 - 0.75 + 0.23 * (k + 1) / 9, 2.1, 2.5 * (k + 1) / 9), 0.025, 0.025, "oakdoor")
    pendant(3.95, 0.0, 3.0, 0.7)

# ---- a fitting in every room: chandeliers in the best rooms, a globe on a rod elsewhere ---------------------------
BEST = {"dining-room": "Chandelier_03", "library": "Chandelier_01", "guest-suite": "Chandelier_01", "mrs-glenn-bedroom": "Chandelier_01", "mr-glenn-bedroom": "Chandelier_01",
        "mrs-glenn-sitting": "Chandelier_01", "solarium": "Chandelier_03", "boys-bedroom-a": "Chandelier_01", "panelled-bedroom": "Chandelier_01", "stair-landing": "lantern_chandelier_01"}
SKIP = {"great-hall", "kitchen", "butlers-pantry", "arcade", "inglenook", "stair-hall", "gallery-w", "gallery-e", "upper-gallery-w", "upper-gallery-e"}
for r in ROOMS:
    if not r.light or r.id in SKIP: continue
    with frame(*BLOCKS[r.blk][:3]):
        cx, cy = (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2; zc = r.z + min(r.h, 3.2)
        if r.id in BEST:
            put(BEST[r.id], cx, cy, zc, 0, 1.0, lvl=r.lvl); lamp(cx, cy, zc - 0.75, 60 + (r.x1 - r.x0) * (r.y1 - r.y0) * 1.6, name="fitting", bulb=False)
        else: pendant(cx, cy, zc, 0.35, lvl=r.lvl)
