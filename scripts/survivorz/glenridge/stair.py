# SURVIVORZ, GLENRIDGE HALL: THE MAIN STAIR AND THE BALUSTRADES, run inside build.py after hall.py. From the
# photographs (jeffherr 09, 02, 08; private reference): heavy turned oak balusters (a square block, a vase, a
# square block), a moulded handrail, square newels with a carved finial, a closed string, the red stair carpet,
# and the iron lantern hanging in the well. The same balusters edge the gallery over the Great Hall and the
# balcony at its west end.
FLAT.update({"runner": (0.33, 0.03, 0.05, 0.95), "runneredge": (0.5, 0.36, 0.16, 0.95)})
emissive("lanternglass", (1.0, 0.45, 0.12), 0.9)
BAL = [(0.0, 0.05), (0.03, 0.05), (0.05, 0.032), (0.09, 0.04), (0.2, 0.066), (0.33, 0.06), (0.5, 0.036), (0.6, 0.028), (0.64, 0.046), (0.68, 0.03), (0.71, 0.05), (0.74, 0.05)]

def baluster(x, y, z0, z1, lvl):
    """A turned baluster from z0 to z1: square blocks top and bottom, a vase between."""
    g = G("joinery%d" % lvl); gt_ = G("turned%d" % lvl); gt_.smooth = True; H = z1 - z0; b0, b1 = 0.14 * H / 0.74, 0.13 * H / 0.74
    g.box(x - 0.05, y - 0.05, z0, x + 0.05, y + 0.05, z0 + b0, "oakdark"); g.box(x - 0.05, y - 0.05, z1 - b1, x + 0.05, y + 0.05, z1, "oakdark")
    k = (H - b0 - b1) / 0.74
    for (ha, ra), (hb, rb) in zip(BAL, BAL[1:]): cyl(gt_, (x, y, z0 + b0 + ha * k), (x, y, z0 + b0 + hb * k), ra, rb, "oakdark", 10)

def newel(x, y, z0, z1, lvl, s=0.085):
    """A square newel post with a moulded cap and a carved finial."""
    g = G("joinery%d" % lvl); gt_ = G("turned%d" % lvl); gt_.smooth = True
    g.box(x - s, y - s, z0, x + s, y + s, z1, "oakwall"); g.box(x - s - 0.02, y - s - 0.02, z0, x + s + 0.02, y + s + 0.02, z0 + 0.16, "oakdark")
    for za, zb, e in ((z1, z1 + 0.03, 0.03), (z1 + 0.03, z1 + 0.06, 0.015)): g.box(x - s - e, y - s - e, za, x + s + e, y + s + e, zb, "oakdark")
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):                               # a sunk panel on each face
        ax_, ay_ = abs(dy), abs(dx)
        cx_, cy_ = x + dx * (s + 0.006), y + dy * (s + 0.006); h = s - 0.025
        g.box(cx_ - (h if ax_ else 0.006), cy_ - (h if ay_ else 0.006), z1 - 0.52, cx_ + (h if ax_ else 0.006), cy_ + (h if ay_ else 0.006), z1 - 0.1, "oakdark")
    cyl(gt_, (x, y, z1 + 0.06), (x, y, z1 + 0.1), 0.05, 0.03, "oakdark", 10); cyl(gt_, (x, y, z1 + 0.1), (x, y, z1 + 0.13), 0.03, 0.055, "oakdark", 10)
    for (ha, ra), (hb, rb) in zip([(0.13, 0.055), (0.18, 0.075), (0.25, 0.07), (0.32, 0.04), (0.37, 0.012)], [(0.18, 0.075), (0.25, 0.07), (0.32, 0.04), (0.37, 0.012), (0.39, 0.002)]):
        cyl(gt_, (x, y, z1 + ha), (x, y, z1 + hb), ra, rb, "oakdark", 10)

def balustrade(p0, p1, lvl, pitch=0.2, ends=(True, True), post_h=1.22):
    """A balustrade along the line p0 -> p1 (the floor or the stair's nosing line), level or raked."""
    g = G("joinery%d" % lvl); a, b = Vector(p0), Vector(p1); d = b - a; Lh = math.hypot(d.x, d.y); raked = abs(d.z) > 0.05
    sx, sy = -d.y / Lh, d.x / Lh                                                     # across the run
    low, base, top = (0.08, 0.27, 0.99) if raked else (0.06, 0.12, 0.96)
    g.beam(tuple(a + Vector((0, 0, low))), tuple(b + Vector((0, 0, low))), 0.075, 0.38 if raked else 0.12, "oakwall")
    if raked: g.beam(tuple(a + Vector((0, 0, low + 0.2))), tuple(b + Vector((0, 0, low + 0.2))), 0.1, 0.035, "oakdark")
    g.beam(tuple(a + Vector((0, 0, top + 0.035))), tuple(b + Vector((0, 0, top + 0.035))), 0.125, 0.07, "oakdark")
    g.beam(tuple(a + Vector((0, 0, top + 0.085))), tuple(b + Vector((0, 0, top + 0.085))), 0.075, 0.035, "oakdark")
    n = max(1, round((Lh - 0.2) / pitch))
    for i in range(n):
        p = a + d * ((0.1 + (Lh - 0.2) * (i + 0.5) / n) / Lh)
        baluster(p.x, p.y, p.z + base, p.z + top + 0.01, lvl)
    for on, p in zip(ends, (a, b)):
        if on: newel(p.x, p.y, p.z, p.z + post_h, lvl)

with C():
    RISE = UF / 20; LZ = RISE * 10; XA, XB, YL, YT = -3.43, -6.27, -3.18, -0.35     # the two open sides, the landing's edge, the stair's head
    # the first flight (down the east side), the landing's edge, the second flight (up the west side), the head of the well
    balustrade((XA, YT, RISE), (XA, YL, LZ), 0, ends=(False, False)); newel(XA, YT + 0.06, 0.0, RISE + 1.3, 0); newel(XA, YL, RISE * 8, LZ + 1.3, 0)
    balustrade((XA, YL, LZ), (XB, YL, LZ), 0, ends=(False, False)); newel(XB, YL, LZ, LZ + 1.75, 0)
    balustrade((XB, YL, LZ + RISE), (XB, YT, UF), 0, ends=(False, False))
    newel(XB, YT, UF - 0.4, UF + 1.3, 1); balustrade((XB, YT, UF), (-2.07, YT, UF), 1, ends=(False, False)); newel(-3.35, YT, UF, UF + 1.3, 1)
    # under the flights and the landing: oak panelling in place of the bare carcass
    gp = G("panels0"); zl2 = lambda y: LZ + (y + 3.25) * (LZ / 2.9); zl1 = lambda y: (-0.35 - y) * (LZ / 2.9)
    W2 = Wall("y", -6.35, 1); W1 = Wall("y", -3.35, -1); WL = Wall("x", -3.25, 1)
    W2.face(gp, [(-3.25, 0.005, 0), (-0.35, 0.005, 0), (-0.35, 0.005, UF), (-3.25, 0.005, LZ)], "oakwall")
    W1.face(gp, [(-0.35, 0.005, 0), (-3.25, 0.005, 0), (-3.25, 0.005, LZ)], "oakwall")
    WL.face(gp, [(-6.35, 0.005, 0), (-3.35, 0.005, 0), (-3.35, 0.005, LZ), (-6.35, 0.005, LZ)], "oakwall")
    panel_wall(WL, gp, -6.2, -3.5, 0.0, ((0.18, 0.9), (0.9, LZ - 0.12)), [], None, pitch=0.6)
    for i in range(5):
        ya, yb = -3.25 + 0.58 * i, -3.25 + 0.58 * (i + 1); top = zl2(ya) - 0.16
        cell(W2, gp, ya + 0.02, yb - 0.02, 0.18, 1.25); cell(W2, gp, ya + 0.02, yb - 0.02, 1.25, top)
        top = zl1(yb) - 0.16
        if top > 0.6: cell(W1, gp, ya + 0.02, yb - 0.02, 0.18, top)
    for w_, a_, b_ in ((W2, -3.25, -0.35), (W1, -3.25, -0.9), (WL, -6.35, -3.35)): w_.box(gp, a_, 0, 0, b_, 0.03, 0.15, "oakdark")
    # the red stair carpet with its gold edge
    gr = G("dress0")
    def tread(x0, x1, y0, y1, z, riser_at, into):
        """The carpet over one tread and down its riser. riser_at is the y of the tread's nose."""
        xa, xb = x0 + 0.26, x1 - 0.26
        for a, b, m in ((xa, xa + 0.07, "runneredge"), (xa + 0.07, xb - 0.07, "runner"), (xb - 0.07, xb, "runneredge")):
            gr.box(a, y0, z, b, y1, z + 0.008, m)
            ya, yb = sorted((riser_at, riser_at + into * 0.008)); gr.box(a, ya, z - RISE, b, yb, z + 0.008, m)
    for i in range(10): y1 = -0.35 - i * 0.29; tread(-3.35, -2.07, y1 - 0.29, y1, RISE * (i + 1), y1, 1)
    for i in range(10): y0 = -3.25 + i * 0.29; tread(-7.63, -6.35, y0, y0 + 0.29, RISE * (11 + i), y0, -1)
    for a, b, m in ((-7.37, -7.3, "runneredge"), (-7.3, -2.4, "runner"), (-2.4, -2.33, "runneredge")): gr.box(a, -4.05, LZ, b, -3.5, LZ + 0.008, m)
    # the iron lantern in the well: a six-sided cage round amber glass, on a chain
    gi = G("hallroof"); lx, ly, lz = -4.85, -2.0, UF + 0.55
    for k in range(6):
        a0, a1 = math.pi * k / 3, math.pi * (k + 1) / 3; r = 0.19
        p0, p1 = (lx + r * math.cos(a0), ly + r * math.sin(a0)), (lx + r * math.cos(a1), ly + r * math.sin(a1))
        gi.beam((*p0, lz), (*p0, lz + 0.62), 0.022, 0.022, "iron")
        for z in (lz, lz + 0.62): gi.beam((*p0, z), (*p1, z), 0.03, 0.03, "iron")
        gi.beam((*p0, lz + 0.62), (lx, ly, lz + 0.95), 0.02, 0.02, "iron"); gi.beam((*p0, lz), (lx, ly, lz - 0.2), 0.02, 0.02, "iron")
        G("shades").face([(*p0, lz + 0.02), (*p1, lz + 0.02), (*p1, lz + 0.6), (*p0, lz + 0.6)], "lanternglass", (math.cos((a0 + a1) / 2), math.sin((a0 + a1) / 2), 0))
    gi.beam((lx, ly, lz + 0.95), (lx, ly, EAVE + 1.2), 0.014, 0.014, "iron"); blob(gi, lx, ly, lz - 0.22, 0.04, "iron", squash=1.3, jitter=0.0)
    # the gallery's edge over the Great Hall, and the balcony at the hall's west end
    posts = [HX0 + 0.12 + (HX1 - HX0 - 0.24) * i / 6 for i in range(7)]
    for xa_, xb_ in zip(posts, posts[1:]): balustrade((xa_, HY0, UF), (xb_, HY0, UF), 1, ends=(True, False), post_h=1.16)
    newel(posts[-1], HY0, UF, UF + 1.16, 1)
    balustrade((HX0, HYM - 1.62, UF), (HX0, HYM + 1.62, UF), 1, ends=(True, True), post_h=1.16)

# ---- the dining room (photo 12): red pelmets and curtains at the French doors and the bay, iron sconces ----
def drapes(w, g, uc, width, z0, ztop, pelmet=0.42, mat="velvet"):
    """A pelmet over an opening and a gathered curtain down each side of it, on a wall face."""
    w.box(g, uc - width / 2 - 0.3, 0.04, ztop, uc + width / 2 + 0.3, 0.24, ztop + pelmet, mat)
    for sg in (-1, 1):
        for k in range(6):
            ua = uc + sg * (width / 2 + 0.28 - 0.075 * (k + 1)); ub = ua + sg * 0.075; dep = 0.06 + 0.05 * (k % 2)
            w.box(g, min(ua, ub), 0.05, z0 + 0.03, max(ua, ub), 0.1 + dep, ztop, mat)
with C():
    gd = G("dress0"); DN = Wall("x", 12.1 - T_EXT / 2, -1); DE = Wall("y", 13.4 - T_EXT / 2, -1)
    for x in (8.5, 11.75): drapes(DN, gd, x, 1.1, 0.0, 2.45)
    drapes(DE, gd, 9.9, 3.4, 0.0, 2.72, pelmet=0.3)
    for x in (7.9, 12.3): sconce(x, 3.0 + T_INT / 2, 1.95, 1)

# ---- the breakfast room's painted walls, valance and lantern (photo 18): a landscape on the blind walls over a painted
# dado with its painted balusters, a scalloped valance under the tent, a glazed iron lantern from its crown ----
FLAT.update({"muraldado": (0.36, 0.42, 0.36, 0.9)})
with C():
    a8 = [math.radians(22.5 + 45 * i) for i in range(8)]; rr = ORAD / math.cos(math.radians(22.5))
    pts8 = [(OC[0] + rr * math.cos(a), OC[1] + rr * math.sin(a)) for a in a8]; gv = G("dress0"); pics = {225: "landscape-03.jpg", 315: "landscape-06.jpg"}
    for i in range(8):
        p0, p1 = pts8[i], pts8[(i + 1) % 8]; L_ = math.hypot(p1[0] - p0[0], p1[1] - p0[1]); ang = round(45 * (i + 1)) % 360
        with frame(p0[0], p0[1], math.degrees(math.atan2(p1[1] - p0[1], p1[0] - p0[0]))):      # the room is on the left of p0 -> p1
            inset = {225: T_INT / 2, 270: 0.1, 180: 0.08}.get(ang, T_EXT / 2); w = Wall("x", inset, 1)
            if ang in pics:                                             # a painted landscape on each blind wall
                art("x", inset, 0.1, L_ - 0.1, 0.92, 2.56, 1, pics[ang], frame_=None, proud=0.006)
                w.box(gv, 0.08, 0, 0.0, L_ - 0.08, 0.012, 0.9, "muraldado"); w.box(gv, 0.08, 0, 0.86, L_ - 0.08, 0.03, 0.92, "muraldado")
                for k in range(7): w.box(gv, 0.2 + (L_ - 0.4) * k / 6 - 0.03, 0.012, 0.12, 0.2 + (L_ - 0.4) * k / 6 + 0.03, 0.03, 0.86, "mural")
            if ang in (180, 270):                                       # the gallery's and the dining room's walls, painted in with the rest
                dw = 0.56 if ang == 270 else 0.52
                for u0, u1, z0, z1 in ((0.05, L_ / 2 - dw, 0.0, 2.56), (L_ / 2 + dw, L_ - 0.05, 0.0, 2.56), (L_ / 2 - dw, L_ / 2 + dw, 2.14, 2.56)): w.box(gv, u0, 0, z0, u1, 0.012, z1, "mural")
            w.box(gv, 0.02, 0, 2.56, L_ - 0.02, 0.035, 2.76, "tentcream")                # the valance, scalloped
            n = max(3, round(L_ / 0.3))
            for k in range(n):
                u0, u1 = 0.02 + (L_ - 0.04) * k / n, 0.02 + (L_ - 0.04) * (k + 1) / n
                w.face(gv, [(u0, 0.036, 2.56), (u1, 0.036, 2.56), ((u0 + u1) / 2, 0.036, 2.44)], "tent"); w.face(gv, [(u0 + 0.03, 0.04, 2.56), (u1 - 0.03, 0.04, 2.56), ((u0 + u1) / 2, 0.04, 2.475)], "tentcream")
    gi = G("hallroof"); lx, ly, lz = OC[0], OC[1], 2.15                                  # the lantern
    for k in range(4):
        a0, a1 = math.pi / 4 + math.pi / 2 * k, math.pi / 4 + math.pi / 2 * (k + 1); r = 0.16
        q0, q1 = (lx + r * math.cos(a0), ly + r * math.sin(a0)), (lx + r * math.cos(a1), ly + r * math.sin(a1))
        gi.beam((*q0, lz), (*q0, lz + 0.5), 0.018, 0.018, "iron")
        for z in (lz, lz + 0.5): gi.beam((*q0, z), (*q1, z), 0.022, 0.022, "iron")
        gi.beam((*q0, lz + 0.5), (lx, ly, lz + 0.72), 0.016, 0.016, "iron")
    gi.beam((lx, ly, lz + 0.72), (lx, ly, 3.88), 0.012, 0.012, "iron")
    for dx in (-0.05, 0.05): gi.beam((lx + dx, ly, lz + 0.05), (lx + dx, ly, lz + 0.22), 0.018, 0.018, "candle"); G("glowbits").box(lx + dx - 0.012, ly - 0.012, lz + 0.22, lx + dx + 0.012, ly + 0.012, lz + 0.27, "glow")
    blob(gi, OC[0], OC[1], 3.86, 0.2, "tent", squash=0.35, jitter=0.0)                   # the rose at the crown

# ---- the entrance vestibule (photo 07): rough plaster, the carved settle with a lamp beside it, a chair, sconces ----
with C():
    put("GothicCabinet_01", -1.55, -1.9, 0, 0); put("side_table_01", -1.6, -0.55, 0, 0); shade_lamp(-1.6, -0.55, 0.55, 30)
    put("WoodenChair_01", 1.95, -2.6, 0, 180, 0.55); rug(-0.9, -2.7, 1.9, -0.9, 0, "rug-08.jpg")
    hung("y", 2.4 - T_INT / 2, -1.5, 1.75, 0.55, -1, "portrait-02.jpg")
    for x in (-1.45, 1.85): sconce(x, -T_INT / 2, 1.95, -1)

# ---- the sun room and the arcade (photos 29, 11): a painted frieze of flowers under the ceiling, lattice grilles
# under the windows, a rug, lamps, the paper parasol the chandelier hangs from ----
FLAT.update({"friezecream": (0.8, 0.76, 0.56, 0.8), "flowerred": (0.6, 0.06, 0.05, 0.7), "floweryellow": (0.85, 0.6, 0.08, 0.7), "leafgreen": (0.1, 0.32, 0.12, 0.7), "rugsage": (0.35, 0.5, 0.4, 0.95)})
with Sf():
    gd = G("dress0"); SN = Wall("x", 9.1 - T_EXT / 2, -1); SE_ = Wall("y", 9.5 - T_EXT / 2, -1); SS = Wall("x", 2.9 + T_INT / 2, 1)
    for w_, a_, b_ in ((SN, 0.1, 9.3), (SE_, 3.0, 8.9), (SS, 0.1, 9.3)):
        w_.box(gd, a_, 0, 3.0, b_, 0.012, 3.16, "friezecream"); n = int((b_ - a_) / 0.24)
        for k in range(n):
            u = a_ + (b_ - a_) * (k + 0.5) / n
            stud(w_, gd, u, 3.08, 0.035, 0.012, ("flowerred", "leafgreen", "heraldblue", "leafgreen", "floweryellow", "leafgreen")[k % 6], 0.012)
    for uc in (1.8, 4.75, 7.7):                                           # the lattice grilles under the three north windows
        SN.box(gd, uc - 1.05, 0, 0.14, uc + 1.05, 0.05, 0.62, "grille")
        for k in range(9): SN.box(gd, uc - 1.0 + 0.25 * k, 0.05, 0.17, uc - 1.0 + 0.25 * k + 0.02, 0.058, 0.59, "whitepaint")
        for zz in (0.26, 0.38, 0.5): SN.box(gd, uc - 1.0, 0.05, zz, uc + 1.0, 0.058, zz + 0.02, "whitepaint")
    gd.box(2.3, 4.5, 0.0, 7.2, 7.6, 0.014, "rugsage"); gd.box(2.5, 4.7, 0.014, 7.0, 7.4, 0.016, "muraldado")
    for x in (2.75, 6.75): put("side_table_01", x, 8.45, 0, 270); shade_lamp(x, 8.45, 0.55, 34)
    put("ClassicConsole_01", 0.55, 6.0, 0, 0); shade_lamp(0.55, 5.55, top_of("ClassicConsole_01"), 30)
    cyl(G("hallroof"), (4.75, 6.0, 3.29), (4.75, 6.0, 3.17), 0.62, 0.03, "parasol", 20)                 # the parasol at the ceiling
    for uc in (1.6, 4.75, 7.9):                                           # the arches' jambs, painted with the walls
        for u, sg in ((uc - 1.15, 1), (uc + 1.15, -1)): gd.box(min(u, u + sg * 0.006), 2.9 - T_INT / 2 - 0.004, 0.12, max(u, u + sg * 0.006), 2.9 + T_INT / 2 + 0.004, 2.44, "sunyellow")

# ---- the boys' bedroom over the dining room, as the twin-bedded room is (photo 32): sprigged paper over a pink
# skirting, a trellis carpet, twin beds under half-testers with lace hangings and peach quilts, a green settee in
# the bay under a swagged pelmet ----
def twin_bed(xh, yc, z, lvl=1):
    """A single bed with its head to a wall at x=xh, running out along +x: a quilted spread, a lace valance,
    turned posts, and a half-tester over the head hung with lace."""
    g = G("dress%d" % lvl); gt_ = G("turned%d" % lvl); gt_.smooth = True
    g.box(xh + 0.07, yc - 0.52, z + 0.3, xh + 2.05, yc + 0.52, z + 0.62, "quiltpeach"); g.box(xh + 0.1, yc - 0.4, z + 0.62, xh + 0.55, yc + 0.4, z + 0.74, "quiltpeach")
    g.box(xh + 0.09, yc - 0.5, z + 0.04, xh + 2.03, yc + 0.5, z + 0.3, "lace")
    g.box(xh, yc - 0.58, z, xh + 0.07, yc + 0.58, z + 1.2, "oakdark"); g.box(xh + 2.0, yc - 0.56, z + 0.2, xh + 2.06, yc + 0.56, z + 0.7, "oakdark")
    for sy in (-1, 1):
        cyl(gt_, (xh + 2.03, yc + sy * 0.55, z), (xh + 2.03, yc + sy * 0.55, z + 1.0), 0.035, 0.03, "oakdark", 10); blob(gt_, xh + 2.03, yc + sy * 0.55, z + 1.04, 0.05, "oakdark", squash=1.3, jitter=0.0)
        cyl(gt_, (xh + 0.04, yc + sy * 0.6, z), (xh + 0.04, yc + sy * 0.6, z + 2.2), 0.035, 0.03, "oakdark", 10)
        for k in range(4):                                                # the lace hanging at each side of the head
            ya, yb = sorted((yc + sy * 0.62, yc + sy * (0.64 + 0.02 * (k % 2)))); g.box(xh + 0.03 + 0.11 * k, ya, z + 0.35, xh + 0.03 + 0.11 * (k + 1), yb, z + 2.16, "lace")
        ya, yb = sorted((yc + sy * 0.63, yc + sy * 0.66)); g.box(xh, ya, z + 1.9, xh + 1.0, yb, z + 2.18, "canopypink")
    g.box(xh, yc - 0.64, z + 2.16, xh + 1.0, yc + 0.64, z + 2.22, "oakdark"); g.box(xh + 0.97, yc - 0.66, z + 1.9, xh + 1.0, yc + 0.66, z + 2.18, "canopypink")
    g.box(xh + 0.005, yc - 0.6, z + 1.2, xh + 0.02, yc + 0.6, z + 2.16, "lace")
with C():
    gd = G("dress1"); XW = 6.85 + 0.1
    gd.box(XW, 3.12, UF, 13.22, 11.92, UF + 0.012, "latticecarpet")
    for yc in (7.0, 9.3): twin_bed(XW + 0.01, yc, UF)
    put("ClassicNightstand_01", XW + 0.3, 8.15, UF, 0, lvl=1); shade_lamp(XW + 0.3, 8.15, UF + top_of("ClassicNightstand_01"), 28, lvl=1)
    BE = Wall("y", 13.4 - T_EXT / 2, -1); drapes(BE, gd, 9.9, 3.0, UF + 0.1, UF + 2.2, pelmet=0.3, mat="canopypink")
    put("sofa_02", 12.4, 9.9, UF, 180, 0.85, lvl=1, tint=(0.12, 0.45, 0.3)); put("ArmChair_01", 12.2, 4.6, UF, 135, 0.9, lvl=1, tint=(0.6, 0.16, 0.2))
    hung("x", 12.1 - T_EXT / 2, 8.2, UF + 1.6, 0.55, -1, "portrait-04.jpg", lvl=1); hung("x", 12.1 - T_EXT / 2, 12.2, UF + 1.6, 0.55, -1, "portrait-10.jpg", lvl=1)
    sconce(11.6, 3.0 + T_INT / 2, UF + 1.8, 1, lvl=1); sconce(8.2, 3.0 + T_INT / 2, UF + 1.8, 1, lvl=1)

# ---- the brick porches (photo 16): Moravian star lanterns glowing under the blue-and-bare boarded ceiling ----
emissive("starglow", (1.0, 0.5, 0.14), 0.85)
def star(x, y, z, r=0.3):
    g = G("shades"); gi = G("hallroof")
    for v in ICOV:                                                        # a point along each of the twelve directions
        d = v.normalized(); a = d.cross(Vector((0.31, 0.2, 0.93))).normalized(); b = d.cross(a); c = Vector((x, y, z)); base = c + d * r * 0.3; tip = c + d * r
        q = [base + (a * math.cos(t) + b * math.sin(t)) * r * 0.24 for t in (0, math.pi / 2, math.pi, 3 * math.pi / 2)]
        for k in range(4): g.face([tuple(q[k]), tuple(q[(k + 1) % 4]), tuple(tip)], "starglow", tuple(d))
    gi.beam((x, y, z + r), (x, y, z + r + 0.5), 0.01, 0.01, "iron")
    lamp(x, y, z - r - 0.05, 30, colour=(1.0, 0.62, 0.28), radius=0.12, name="star", bulb=False)
with C():
    for x in (-13.0, -9.4): star(x, 10.65, 2.25)
    for x in (8.6, 11.7): star(x, 13.5, 2.15)
with Wf(): star(20.5, 0.0, 2.35)
