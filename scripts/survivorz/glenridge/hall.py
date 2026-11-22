# SURVIVORZ, GLENRIDGE HALL: THE GREAT HALL'S JOINERY AND FIREPLACE, in real relief, run inside build.py after tvd.py.
# Josh, Nov 12 2026: "photo realistic ... fantastic 1 for 1 texturing and details". Built from the photographs
# (jeffherr 02, 04, 05, 22; private reference):
#   the walls   oak panelling in three tiers of raised-and-fielded panels up to the gallery floor, a carved frieze
#               with painted shields, a dentil course and a stepped cornice; rough ochre plaster above
#   the arches  a moulded oak architrave round each; the inglenook's wide arch with a shaft, base and cap each side
#   inglenook   a panelled dado, lancet windows in pale stone, and the stone chimneypiece: a four-centred fire
#               opening, tracery panels, a frieze of seven carved squares, a leaf cornice, the tapering hood with its
#               banner and crossed spears, a herringbone fireback, iron firedogs
#   the light   two wrought-iron chandeliers of two tiers, a small amber shade on every candle
FLAT.update({"candle": (0.85, 0.8, 0.66, 0.6), "heraldblue": (0.05, 0.1, 0.32, 0.6), "bannercream": (0.55, 0.42, 0.2, 0.9)})
emissive("shadeamber", (1.0, 0.45, 0.13), 1.7)

class Wall:
    """One face of a wall: u runs along it, d is the depth out into the room, z is up."""
    def __init__(s, axis, c, into): s.axis, s.c, s.into = axis, c, into
    def P(s, u, d, z): return (u, s.c + s.into * d, z) if s.axis == "x" else (s.c + s.into * d, u, z)
    def out(s): return (0, s.into, 0) if s.axis == "x" else (s.into, 0, 0)
    def box(s, g, u0, d0, z0, u1, d1, z1, mat):
        a, b = s.P(u0, d0, z0), s.P(u1, d1, z1)
        g.box(min(a[0], b[0]), min(a[1], b[1]), z0, max(a[0], b[0]), max(a[1], b[1]), z1, mat)
    def face(s, g, pts, mat): g.face([s.P(*p) for p in pts], mat, s.out())
    def beam(s, g, p0, p1, w, h, mat): g.beam(s.P(*p0), s.P(*p1), w, h, mat, up=s.out())

def spans(a, b, blocks, za, zb, margin=0.0, least=0.2):
    """The stretches of a wall from a to b left free, between za and zb, by the openings in it."""
    cuts = sorted((u0 - margin, u1 + margin) for u0, u1, z0, z1 in blocks if z1 > za + 0.02 and z0 < zb - 0.02)
    out = []; u = a
    for c0, c1 in cuts:
        if c0 - u > least: out.append((u, min(c0, b)))
        u = max(u, c1)
    if b - u > least: out.append((u, b))
    return out

def cell(w, g, u0, u1, z0, z1, mat="oakwall", fr=0.045, pr=0.02):
    """One raised-and-fielded panel in its frame of stiles and rails."""
    w.box(g, u0, 0, z0, u0 + fr, pr, z1, mat); w.box(g, u1 - fr, 0, z0, u1, pr, z1, mat)
    w.box(g, u0 + fr, 0, z0, u1 - fr, pr, z0 + fr, mat); w.box(g, u0 + fr, 0, z1 - fr, u1 - fr, pr, z1, mat)
    a0, a1, c0, c1 = u0 + fr + 0.01, u1 - fr - 0.01, z0 + fr + 0.01, z1 - fr - 0.01; bv = 0.04; pd = 0.014
    if a1 - a0 < 2 * bv + 0.02 or c1 - c0 < 2 * bv + 0.02: return
    o = [(a0, 0.001, c0), (a1, 0.001, c0), (a1, 0.001, c1), (a0, 0.001, c1)]
    i = [(a0 + bv, pd, c0 + bv), (a1 - bv, pd, c0 + bv), (a1 - bv, pd, c1 - bv), (a0 + bv, pd, c1 - bv)]
    w.face(g, i, mat)
    for k in range(4): w.face(g, [o[k], o[(k + 1) % 4], i[(k + 1) % 4], i[k]], mat)

def stud(w, g, u, z, half, proud, mat, d0=0.0):
    """A small carved lozenge standing off the wall."""
    c = [(u - half, d0, z), (u, d0, z - half), (u + half, d0, z), (u, d0, z + half)]
    for k in range(4): w.face(g, [c[k], c[(k + 1) % 4], (u, d0 + proud, z)], mat)

def shield(w, g, u, z, s, field, d0=0.0, edge="gilt"):
    """A painted shield: a gilt edge and a coloured field."""
    for k, (sc, m, d) in enumerate(((1.0, edge, 0.022), (0.78, field, 0.03))):
        h = s * sc; pts = [(u - h * 0.5, z + h * 0.55), (u + h * 0.5, z + h * 0.55), (u + h * 0.5, z - h * 0.05), (u, z - h * 0.6), (u - h * 0.5, z - h * 0.05)]
        w.face(g, [(p, d0 + d, q) for p, q in pts], m)
        if k == 0:
            for i in range(5): w.face(g, [(pts[i][0], d0, pts[i][1]), (pts[(i + 1) % 5][0], d0, pts[(i + 1) % 5][1]), (pts[(i + 1) % 5][0], d0 + d, pts[(i + 1) % 5][1]), (pts[i][0], d0 + d, pts[i][1])], m)

def archband(w, g, u0, u1, zf, z1, width, proud, mat, off=0.0, kind="tudor", d0=0.0):
    """A moulding round an arched opening: up both jambs and round the head, `off` out from the opening's edge."""
    rise = min((u1 - u0) * (0.2 if kind == "tudor" else 0.62), z1 - zf - 0.4); zs = z1 - rise
    L = arch_pts(u0, u1, zs, z1); um = (u0 + u1) / 2; k = off + width / 2
    for sg in (1, -1):
        pts = [(u, z) for u, z in L] if sg > 0 else [(u0 + u1 - u, z) for u, z in L]
        ring = []
        for i, (u, z) in enumerate(pts):
            a = pts[max(i - 1, 0)]; b = pts[min(i + 1, len(pts) - 1)]; dx, dz = b[0] - a[0], b[1] - a[1]; n = math.hypot(dx, dz) or 1
            ox, oz = -dz / n, dx / n
            if (ox * (u - um) + oz * 0.3) < 0: ox, oz = -ox, -oz
            if i == len(pts) - 1: ox, oz = 0.0, 1.0
            ring.append((u + ox * k, z + oz * k))
        e = u0 - k if sg > 0 else u1 + k
        w.beam(g, (e, d0 + proud / 2, zf), (e, d0 + proud / 2, ring[0][1] + 0.01), width, proud, mat)
        for a, b in zip(ring, ring[1:]): w.beam(g, (a[0], d0 + proud / 2, a[1]), (b[0], d0 + proud / 2, b[1]), width, proud, mat)

def panel_wall(w, g, a, b, zf, tiers, blocks, top=None, pitch=0.6, skirt=True, cap=False):
    """Panelling along a wall face: a skirting, tiers of panels between the openings, and (with `top`) the frieze of
    lozenges and shields, the dentils and the cornice. Heights are above the floor zf; blocks are (u0, u1, z0, z1)."""
    blocks = [(u0, u1, zf + z0, zf + z1) for u0, u1, z0, z1 in blocks]
    if skirt:
        for s0, s1 in spans(a, b, blocks, zf, zf + 0.16, 0.0):
            w.box(g, s0, 0, zf, s1, 0.032, zf + 0.14, "oakdark"); w.box(g, s0, 0, zf + 0.14, s1, 0.02, zf + 0.17, "oakdark")
    for za, zb in tiers:
        for s0, s1 in spans(a, b, blocks, zf + za, zf + zb, 0.15, 0.24):
            n = max(1, round((s1 - s0) / pitch)); cw = (s1 - s0) / n
            for i in range(n): cell(w, g, s0 + i * cw, s0 + (i + 1) * cw, zf + za, zf + zb)
    if cap:                                                                        # a dado rail on the top tier
        zt = zf + tiers[-1][1]
        for s0, s1 in spans(a, b, blocks, zt - 0.02, zt + 0.05, 0.02): w.box(g, s0, 0, zt, s1, 0.04, zt + 0.045, "oakdark")
    if top is None: return
    f0, f1, ct = zf + top - 0.5, zf + top - 0.17, zf + top                       # the frieze, then the cornice above it
    for s0, s1 in spans(a, b, blocks, f0, ct, 0.02):
        w.box(g, s0, 0, f0, s1, 0.03, f0 + 0.035, "oakdark"); w.box(g, s0, 0, f1 - 0.075, s1, 0.028, f1 - 0.045, "oakdark")
        n = max(1, int((s1 - s0) / 0.15)); st = (s1 - s0) / n
        for i in range(n): stud(w, g, s0 + (i + 0.5) * st, (f0 + f1 - 0.04) / 2, 0.055, 0.022, "oakdark", 0.004)
        ns = max(1, round((s1 - s0) / 1.7))
        for i in range(ns): shield(w, g, s0 + (i + 0.5) * (s1 - s0) / ns, (f0 + f1 - 0.04) / 2 + 0.01, 0.2, ("red", "heraldblue")[i % 2], 0.02)
        nd = max(1, int((s1 - s0) / 0.085)); sd = (s1 - s0) / nd
        for i in range(nd): w.box(g, s0 + i * sd + 0.012, 0, f1 - 0.045, s0 + (i + 1) * sd - 0.012, 0.045, f1, "oakdark")
        for k, (z0, z1, d) in enumerate(((f1, f1 + 0.055, 0.045), (f1 + 0.055, f1 + 0.115, 0.08), (f1 + 0.115, ct, 0.12))): w.box(g, s0, 0, z0, s1, d, z1, "oakdark")

def chandelier(x, y, z_up, z_low, z_hang):
    """A wrought-iron chandelier of two tiers: scrolled arms off a knopped stem, a candle and an amber shade on each."""
    g = G("hallroof"); gs_ = G("shades")
    cyl(g, (x, y, z_low - 0.38), (x, y, z_up + 0.75), 0.022, 0.022, "iron", 8); g.beam((x, y, z_up + 0.75), (x, y, z_hang), 0.016, 0.016, "iron")
    for zk, r in ((z_up + 0.6, 0.07), (z_up - 0.05, 0.09), ((z_up + z_low) / 2, 0.06), (z_low - 0.08, 0.085), (z_low - 0.38, 0.05)): blob(g, x, y, zk, r, "iron", squash=1.0, jitter=0.0)
    for k in range(6):                                                           # the crown of leaves at the top
        a = math.pi * k / 3; g.beam((x + 0.05 * math.cos(a), y + 0.05 * math.sin(a), z_up + 0.62), (x + 0.2 * math.cos(a), y + 0.2 * math.sin(a), z_up + 0.86), 0.05, 0.012, "iron")
    for zt, rad, cnt, ph in ((z_up, 0.85, 12, 0.0), (z_low, 0.5, 6, 0.26)):
        for k in range(cnt):
            a = ph + 2 * math.pi * k / cnt; cx_, sx_ = math.cos(a), math.sin(a)
            pts = [(0.03, 0.3), (rad * 0.3, 0.22), (rad * 0.62, -0.13), (rad * 0.9, -0.1), (rad, 0.0)]
            for (r0, h0), (r1, h1) in zip(pts, pts[1:]): g.beam((x + cx_ * r0, y + sx_ * r0, zt + h0), (x + cx_ * r1, y + sx_ * r1, zt + h1), 0.018, 0.03, "iron")
            ex, ey = x + cx_ * rad, y + sx_ * rad
            cyl(g, (ex, ey, zt - 0.02), (ex, ey, zt + 0.02), 0.045, 0.03, "iron", 8)
            cyl(g, (ex, ey, zt + 0.02), (ex, ey, zt + 0.13), 0.013, 0.013, "candle", 6)
            cyl(gs_, (ex, ey, zt + 0.11), (ex, ey, zt + 0.23), 0.085, 0.045, "shadeamber", 10)
        lamp(x, y, zt - 0.25, 150 if rad > 0.6 else 70, colour=(1.0, 0.62, 0.3), radius=0.2, name="chandelier", bulb=False)

with C():
    Zh = HALL_Z; g = G("halljoin"); TIERS = ((0.18, 1.2), (1.2, 2.3), (2.3, 3.24)); TOP = UF - HALL_Z
    N_ = Wall("x", HY1 - T_EXT / 2, -1); S_ = Wall("x", HY0 + T_INT / 2, 1); W_h = Wall("y", HX0 + T_INT / 2, 1); E_h = Wall("y", HX1 - T_INT / 2, -1)
    # ---- the four walls ----
    nb = [(-4.9 - 0.95, -4.9 + 0.95, 1.0, 4.6), (4.9 - 0.95, 4.9 + 0.95, 1.0, 4.6), (-2.1 - 0.26, 2.1 + 0.26, 0.0, 3.24)]
    panel_wall(N_, g, HX0 + 0.07, HX1 - 0.07, Zh, TIERS, nb, TOP)
    for wx in (-4.9, 4.9): panel_wall(N_, g, wx - 0.95, wx + 0.95, Zh, ((0.18, 0.96),), [], None, skirt=False)          # the panel under each tall window
    sb = [(-1.2, 1.2, 0.0, 2.9), (-5.5, -3.9, 0.0, 2.7), (3.9, 5.5, 0.0, 2.7)]
    panel_wall(S_, g, HX0 + 0.07, HX1 - 0.07, Zh, TIERS, sb, TOP)
    for u0, u1, _, z1 in sb: archband(S_, g, u0, u1, Zh, Zh + z1, 0.11, 0.035, "oakdark", 0.0); archband(S_, g, u0, u1, Zh, Zh + z1, 0.04, 0.06, "oakdark", 0.035)
    eb = [(HYM - 1.5, HYM + 1.5, 0.0, 3.0)]
    for w_ in (W_h, E_h):
        panel_wall(w_, g, HY0 + 0.07, HY1 - T_EXT / 2, Zh, TIERS, eb, TOP)
        archband(w_, g, eb[0][0], eb[0][1], Zh, Zh + 3.0, 0.13, 0.04, "oakdark", 0.0); archband(w_, g, eb[0][0], eb[0][1], Zh, Zh + 3.0, 0.045, 0.07, "oakdark", 0.04)

    # ---- the inglenook's arch: two orders of moulding, a shaft with its base and cap each side, a square label over ----
    A0, A1, AT = -2.1, 2.1, Zh + 3.0
    archband(N_, g, A0, A1, Zh, AT, 0.17, 0.05, "oakdark", 0.0); archband(N_, g, A0, A1, Zh, AT, 0.06, 0.085, "oakdark", 0.045); archband(N_, g, A0, A1, Zh, AT, 0.05, 0.1, "oakdark", 0.19)
    ASP = AT - min((A1 - A0) * 0.2, 3.0 - 0.4)                                       # where the arch springs
    for e, sg in ((A0, -1), (A1, 1)):
        ux = e - sg * 0.02
        cyl(g, N_.P(ux, 0.075, Zh + 0.34), N_.P(ux, 0.075, ASP - 0.12), 0.05, 0.05, "oakdark", 10)
        N_.box(g, ux - 0.085, 0.0, Zh, ux + 0.085, 0.16, Zh + 0.26, "oakdark"); N_.box(g, ux - 0.07, 0.0, Zh + 0.26, ux + 0.07, 0.14, Zh + 0.34, "oakdark")
        N_.box(g, ux - 0.07, 0.0, ASP - 0.12, ux + 0.07, 0.14, ASP - 0.05, "oakdark"); N_.box(g, ux - 0.095, 0.0, ASP - 0.05, ux + 0.095, 0.17, ASP + 0.05, "oakdark")
        ua, ub = sorted((e + sg * 0.215, e + sg * 0.26)); N_.box(g, ua, 0, Zh, ub, 0.06, AT + 0.2, "oakdark")
        for du, dz in ((0.25, 0.14), (0.6, 0.1), (1.0, 0.07)): stud(N_, g, e - sg * du, AT - dz, 0.06, 0.025, "oakdark", 0.002)   # carving in the spandrel
    N_.box(g, A0 - 0.26, 0, AT + 0.14, A1 + 0.26, 0.06, AT + 0.2, "oakdark")
    shield(N_, g, 0.0, AT + 0.02, 0.26, "red", 0.1)

    # ---- inside the inglenook: the dado, the lancets, the chimneypiece ----
    fy = 14.3 - T_EXT / 2; IW = Wall("y", -2.3 + T_EXT / 2, 1); IE = Wall("y", 2.3 - T_EXT / 2, -1); IB = Wall("x", fy, -1)
    for w_ in (IW, IE): panel_wall(w_, g, HY1 + T_EXT / 2, fy, Zh, ((0.18, 1.0), (1.0, 1.72)), [(13.2 - 0.47, 13.2 + 0.47, 1.0, 2.9)], None, pitch=0.5, cap=True)
    panel_wall(IB, g, -2.3 + T_EXT / 2, 2.3 - T_EXT / 2, Zh, ((0.18, 1.0), (1.0, 1.72)), [(-1.66, 1.66, 0.0, 3.2)], None, pitch=0.45, cap=True)
    gs = G("hallstone")
    for xe, w_ in ((-2.3, IW), (2.3, IE)):                                           # each lancet: a pointed head and a stone surround
        u0, u1, z0, z1 = 13.2 - 0.35, 13.2 + 0.35, Zh + 1.1, Zh + 2.8; zs = z1 - 0.44
        L = arch_pts(u0, u1, zs, z1)
        with frame(xe, 0, 90):
            for poly in (L + [(u0, z1)], [(u0 + u1 - u, z) for u, z in L] + [(u1, z1)]): G("wall0").prism(poly, -T_EXT / 2 + 0.02, T_EXT / 2 - 0.02, "carvedstone", "carvedstone", "carvedstone")
        archband(w_, gs, u0, u1, z0, z1, 0.1, 0.035, "carvedstone", 0.0, kind="lancet")
        w_.box(gs, u0 - 0.1, 0, z0 - 0.09, u1 + 0.1, 0.07, z0, "carvedstone")
    # the chimneypiece, 3.3 m wide against the back wall
    CW, FW, DP = 1.65, 0.72, 0.5; yf = fy - DP; FJ, FA, LT = Zh + 0.72, Zh + 1.02, Zh + 1.22
    for sg in (-1, 1): gs.box(min(sg * FW, sg * CW), yf, Zh, max(sg * FW, sg * CW), fy, LT, "carvedstone", {"-x" if sg > 0 else "+x": "fireback"})
    gs.box(-FW, yf, FA, FW, fy, LT, "carvedstone", {"-z": "soot"})
    L = [(-FW, FJ), (-FW * 0.82, FJ + 0.17), (-FW * 0.45, FJ + 0.26), (0.0, FA)]            # the four-centred head of the fire opening
    for sg in (-1, 1): gs.prism([(sg * u, z) for u, z in L] + [(sg * -FW, FA)], yf, yf + 0.14, "carvedstone", "carvedstone", "carvedstone")
    for sg in (-1, 1):                                                               # the roll moulding round the opening
        pts = [(sg * u * (FW + 0.045) / FW, z + 0.045) for u, z in L]
        gs.beam((pts[0][0], yf - 0.02, Zh), (pts[0][0], yf - 0.02, pts[0][1]), 0.07, 0.05, "carvedstone", up=(0, 1, 0))
        for a, b in zip(pts, pts[1:]): gs.beam((a[0], yf - 0.02, a[1]), (b[0], yf - 0.02, b[1]), 0.07, 0.05, "carvedstone", up=(0, 1, 0))
    F_ = Wall("x", yf, -1)
    for sg in (-1, 1):                                                               # a tracery panel each side: two pointed lights under a quatrefoil
        u0, u1 = sorted((sg * 0.9, sg * 1.2)); um = (u0 + u1) / 2
        for a, b, c, d in ((u0, Zh + 0.22, u0 + 0.025, Zh + 1.14), (u1 - 0.025, Zh + 0.22, u1, Zh + 1.14), (um - 0.012, Zh + 0.22, um + 0.012, Zh + 0.86), (u0, Zh + 0.22, u1, Zh + 0.245), (u0, Zh + 1.115, u1, Zh + 1.14)):
            F_.box(gs, a, 0, b, c, 0.05, d, "carvedstone")
        for a, b in ((u0, um), (um, u1)): archband(F_, gs, a + 0.012, b - 0.012, Zh + 0.3, Zh + 0.88, 0.026, 0.05, "carvedstone", 0.0, kind="lancet")
        stud(F_, gs, um, Zh + 1.0, 0.08, 0.05, "carvedstone")
        u0, u1 = sorted((sg * 1.3, sg * CW))                                           # the outer pier and its plinth
        F_.box(gs, u0 + 0.03, 0, Zh + 0.28, u1 - 0.03, 0.035, Zh + 1.12, "carvedstone")
        ua, ub = sorted((sg * FW, sg * (CW + 0.03))); F_.box(gs, ua, 0, Zh, ub, 0.03, Zh + 0.2, "carvedstone")
    shield(F_, gs, 0.0, FA + 0.08, 0.17, "carvedstone", 0.0, edge="carvedstone")
    gs.box(-CW, yf - 0.02, LT, CW, fy, LT + 0.36, "carvedstone")                         # the frieze: seven carved squares
    F2 = Wall("x", yf - 0.02, -1)
    for k in range(7):
        uc = -CW + 0.14 + (2 * CW - 0.28) * (k + 0.5) / 7; h = 0.19; zc = LT + 0.18
        for a, b, c, d in ((uc - h, zc - 0.15, uc - h + 0.022, zc + 0.15), (uc + h - 0.022, zc - 0.15, uc + h, zc + 0.15), (uc - h, zc - 0.15, uc + h, zc - 0.128), (uc - h, zc + 0.128, uc + h, zc + 0.15)):
            F2.box(gs, a, 0, b, c, 0.05, d, "carvedstone")
        if GAME and k in (1, 2, 4, 5):                                              # THE GAME'S FOUR SOCKETS (design.py): four of the seven squares take a crest
            shield(F2, gs, uc, zc + 0.012, 0.21, "soot", 0.0, edge="carvedstone")
            shield(F2, G("dyn-crest-%d" % (1, 2, 4, 5).index(k)), uc, zc + 0.012, 0.2, ("red", "heraldblue", "leafgreen", "gilt")[(1, 2, 4, 5).index(k)], 0.03, edge="gilt")
            continue
        for dx, dz in ((0.065, 0.0), (-0.065, 0.0), (0.0, 0.065), (0.0, -0.065)): stud(F2, gs, uc + dx, zc + dz, 0.06, 0.05, "carvedstone")
    gs.box(-CW - 0.03, yf - 0.06, LT + 0.36, CW + 0.03, fy, LT + 0.5, "carvedstone")       # the cornice: a run of leaves under a shelf
    F3 = Wall("x", yf - 0.06, -1)
    for k in range(46): stud(F3, gs, -CW + 0.03 + (2 * CW - 0.06) * (k + 0.5) / 46, LT + 0.43, 0.034 if k % 2 else 0.05, 0.045, "carvedstone")
    gs.box(-CW - 0.07, yf - 0.11, LT + 0.5, CW + 0.07, fy, LT + 0.57, "carvedstone")
    HB, HT = LT + 0.57, Zh + 3.2                                                        # the hood, tapering to the ceiling
    hy = lambda z: fy - (0.58 - 0.36 * (z - HB) / (HT - HB)); hx = lambda z: 1.6 - 0.62 * (z - HB) / (HT - HB)
    gs.face([(-hx(HB), hy(HB), HB), (hx(HB), hy(HB), HB), (hx(HT), hy(HT), HT), (-hx(HT), hy(HT), HT)], "hoodstone", (0, -1, 0.2))
    for sg in (-1, 1): gs.face([(sg * hx(HB), hy(HB), HB), (sg * hx(HB), fy, HB), (sg * hx(HT), fy, HT), (sg * hx(HT), hy(HT), HT)], "hoodstone", (sg, 0, 0.3))
    gd = G("dress0")                                                                 # the banner and the crossed spears on the hood
    bz0, bz1 = HB + 0.28, HB + 1.02
    for u0, u1, m in ((-0.3, -0.2, "red"), (-0.2, -0.15, "gilt"), (-0.15, 0.15, "bannercream"), (0.15, 0.2, "gilt"), (0.2, 0.3, "red")):
        gd.face([(u0, hy(bz0) - 0.02, bz0), (u1, hy(bz0) - 0.02, bz0), (u1, hy(bz1) - 0.02, bz1), (u0, hy(bz1) - 0.02, bz1)], m, (0, -1, 0.2))
    for i, (pz, ph_) in enumerate(((bz0 + 0.3, 0.2), (bz0 + 0.42, 0.13))):
        pts = [(-ph_ * 0.5, pz + ph_ * 0.5), (ph_ * 0.5, pz + ph_ * 0.5), (ph_ * 0.5, pz), (0, pz - ph_ * 0.55), (-ph_ * 0.5, pz)]
        gd.face([(u, hy(z) - 0.026 - 0.004 * i, z) for u, z in pts], ("red", "gilt")[i], (0, -1, 0.2))
    for sg in (-1, 1):
        za, zb = HB + 0.12, HB + 1.2
        gd.beam((sg * 1.0, hy(za) - 0.045, za), (-sg * 0.62, hy(zb) - 0.045, zb), 0.03, 0.03, "timber", up=(0, 1, 0))
        gd.beam((-sg * 0.62, hy(zb) - 0.045, zb), (-sg * 0.71, hy(zb + 0.12) - 0.045, zb + 0.12), 0.06, 0.012, "steel", up=(0, 1, 0))
    # the firebox: a herringbone back, a stone hearth, a pair of iron firedogs
    gs.face([(-FW, fy - 0.03, Zh), (FW, fy - 0.03, Zh), (FW, fy - 0.03, FA), (-FW, fy - 0.03, FA)], "fireback", (0, -1, 0))
    gs.box(-CW - 0.1, yf - 0.6, Zh, CW + 0.1, yf, Zh + 0.03, "hoodstone"); gs.box(-FW, yf, Zh, FW, fy - 0.03, Zh + 0.035, "fireback")
    gi = G("hallroof")
    for sg in (-1, 1):
        x = sg * 0.42
        gi.box(x - 0.045, yf - 0.16, Zh + 0.03, x + 0.045, yf - 0.07, Zh + 0.5, "iron"); gi.box(x - 0.11, yf - 0.19, Zh + 0.03, x + 0.11, yf - 0.05, Zh + 0.09, "iron")
        gi.box(x - 0.06, yf - 0.175, Zh + 0.5, x + 0.06, yf - 0.055, Zh + 0.56, "iron"); blob(gi, x, yf - 0.115, Zh + 0.66, 0.075, "iron", squash=1.25, jitter=0.0)
        gi.box(x - 0.02, yf - 0.1, Zh + 0.15, x + 0.02, fy - 0.1, Zh + 0.18, "iron"); gi.box(x - 0.02, fy - 0.13, Zh + 0.03, x + 0.02, fy - 0.1, Zh + 0.15, "iron")
    fire(0.0, fy - 0.27, Zh + 0.18, 0.95, 280)

    # ---- the two chandeliers ----
    for tx in (HX0 + (HX1 - HX0) * 0.27, HX0 + (HX1 - HX0) * 0.73): chandelier(tx, HYM, Zh + 4.75, Zh + 3.85, APEX - 0.3)

# ---- every other oak-panelled wall in the house: the same raised panels, laid on each face the plan calls oak ----
runs_ = {}
for (ox_, oy_), deg_, cf_, side_, a_, b_, zf_, zt_, ops_, lvl_ in geo.PANELS:
    runs_.setdefault((round(ox_, 3), round(oy_, 3), round(deg_, 2), round(cf_, 3), side_, round(zf_, 3), round(zt_, 3), lvl_), []).append([a_, b_, ops_])
for key_, segs_ in runs_.items():
    segs_.sort(key=lambda s_: s_[0]); merged_ = [segs_[0]]
    for s_ in segs_[1:]:
        if s_[0] <= merged_[-1][1] + 0.02: merged_[-1][1] = max(merged_[-1][1], s_[1]); merged_[-1][2] = merged_[-1][2] + s_[2]
        else: merged_.append(s_)
    ox_, oy_, deg_, cf_, side_, zf_, zt_, lvl_ = key_
    with frame(ox_, oy_, deg_):
        w_ = Wall("x", cf_, side_); h_ = zt_ - zf_; n_ = max(1, round((h_ - 0.24) / 0.95)); th_ = (h_ - 0.18 - 0.05) / n_
        for a_, b_, ops_ in merged_:
            if b_ - a_ < 0.5: continue
            full = h_ >= 3.0                                   # panelled to the ceiling (the library): a carved frieze and cornice at the top
            tiers_ = [(0.18 + i * (h_ - 0.72) / n_, 0.18 + (i + 1) * (h_ - 0.72) / n_) for i in range(n_)] if full else [(0.18 + i * th_, 0.18 + (i + 1) * th_) for i in range(n_)]
            panel_wall(w_, G("panels" + lvl_), a_ + 0.1, b_ - 0.1, zf_, tiers_, [(o["u0"], o["u1"], o["z0"] - zf_, o["z1"] - zf_) for o in ops_], h_ if full else None, pitch=0.56, cap=not full)
print("oak panelling: %d wall faces" % len(runs_))
