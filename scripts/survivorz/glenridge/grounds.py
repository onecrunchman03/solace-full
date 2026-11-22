# SURVIVORZ, GLENRIDGE HALL: the fourth pass, run inside build.py after rooms.py: the garden side and the estate.
# The rear terrace with its pierced-brick parapet (nomination photo 4), the five-tiered rock garden and its stone
# steps below it, the stone edging of the drive, and the servants' cottage with its five-car garage and the pump
# house down the drive (nomination photos 21-24). Heights here are before the ground's 0.2 m drop (build.py).
FLAT.update({"plant1": (0.025, 0.06, 0.02, 0.9), "plant2": (0.04, 0.075, 0.025, 0.9), "plant3": (0.015, 0.045, 0.025, 0.9), "bloom1": (0.75, 0.7, 0.72, 0.8), "bloom2": (0.6, 0.12, 0.3, 0.8), "soil": (0.07, 0.05, 0.035, 0.95)})
gq = G("ground"); TZ = -0.28

def pierced(x0, y0, x1, y1, z, h=0.55):
    """A low brick parapet with an open lattice course, along x or along y (a line, 0.22 thick)."""
    g = G("ground"); t = 0.11
    alongx = abs(x1 - x0) > abs(y1 - y0); L = abs(x1 - x0) if alongx else abs(y1 - y0)
    bx = (lambda a, b, za, zb: g.box(x0 + a, y0 - t, za, x0 + b, y0 + t, zb, "brick")) if alongx else (lambda a, b, za, zb: g.box(x0 - t, y0 + a, za, x0 + t, y0 + b, zb, "brick"))
    bx(0, L, z, z + 0.14); bx(0, L, z + h - 0.08, z + h)
    rows = 3; rh = (h - 0.22) / rows
    for r_ in range(rows):
        a = 0.0 if r_ % 2 == 0 else 0.2
        while a < L - 0.05: bx(a, min(a + 0.2, L), z + 0.14 + r_ * rh, z + 0.14 + (r_ + 1) * rh); a += 0.4

# ---- the terrace's parapet and the urns at the head of the steps ------------------------------------------------------
pierced(-15.5, 22.8, -5.6, 22.8, TZ); pierced(-0.4, 22.8, 9.0, 22.8, TZ); pierced(9.0, 14.9, 9.0, 22.8, TZ); pierced(-15.5, 12.4, -15.5, 22.8, TZ) if False else None
for x in (-5.3, -0.7):
    gq.box(x - 0.4, 22.42, TZ, x + 0.4, 23.18, TZ + 0.9, "stone"); gq.box(x - 0.46, 22.36, TZ + 0.9, x + 0.46, 23.24, TZ + 0.99, "flag")      # a rubble pier and its cap (photo 15)

for xa, xb in ((-20.0, -15.5), (9.0, 15.0)): gq.face([(xa, 20.0, TZ - 0.02), (xb, 20.0, TZ - 0.02), (xb, 22.8, TZ - 0.02), (xa, 22.8, TZ - 0.02)], "grass", (0, 0, 1))
with C(): lean(-15.5, 12.1, -6.85, 13.0, 2.95, 3.55, low="y1")               # the pent roof over the library porch's screens

# ---- the rock garden: five tiers of stacked stone, planted, with the steps down the middle ---------------------------
TIER, DROP, GY0 = 4.2, 0.6, 22.8
SX0, SX1 = -5.0, -1.0
gs_ = G("shrubs")
for k in range(5):
    ya, yb = GY0 + k * TIER, GY0 + (k + 1) * TIER
    up, lv = TZ - DROP * k, TZ - DROP * (k + 1)
    for xa, xb in ((-20.0, SX0), (SX1, 15.0)):
        gq.face([(xa, ya, lv), (xb, ya, lv), (xb, yb, lv), (xa, yb, lv)], "soil", (0, 0, 1))
        gq.box(xa, ya - 0.2, lv - 0.3, xb, ya + 0.2, up + (0.0 if k else -0.02), "stone")                 # the retaining wall
        n = int((xb - xa) * 5)
        for _ in range(n):
            x, y = random.uniform(xa + 0.3, xb - 0.3), random.uniform(ya + 0.45, yb - 0.3); r = random.uniform(0.14, 0.42)
            bush(x, y, lv - 0.02, r, tall=random.uniform(0.7, 1.6), mat=random.choice(("plant1", "plant2", "ivy")))
            if random.random() < 0.25: blob(gs_, x + 0.1, y - 0.05, lv + r * 1.2, 0.07, random.choice(("bloom1", "bloom2")), jitter=0.3)
        for _ in range(int((xb - xa) / 3)):
            x, y = random.uniform(xa + 0.6, xb - 0.6), random.uniform(ya + 0.8, yb - 0.6)
            put(random.choice(variants(random.choice(("shrub_03", "fern_02")))), x, y, lv - 0.02, random.uniform(0, 360), random.uniform(0.8, 1.3))
        for _ in range(int((xb - xa) / 2.2)):                                                            # boulders at the wall's foot
            x = random.uniform(xa + 0.5, xb - 0.5); blob(gs_, x, ya + 0.55, lv + 0.38, random.uniform(0.35, 0.6), "stone", squash=0.6, jitter=0.25)
    for i in range(4):                                                                                    # the flight down
        gq.box(SX0, ya + i * 0.35, lv - 0.3, SX1, ya + (i + 1) * 0.35, up - DROP * (i + 1) / 4, "flag")
    gq.face([(SX0, ya + 1.4, lv), (SX1, ya + 1.4, lv), (SX1, yb, lv), (SX0, yb, lv)], "flag", (0, 0, 1))
    for x in (SX0 - 0.2, SX1 + 0.2): gq.box(x - 0.18, ya, lv - 0.3, x + 0.18, yb, lv + 0.22, "stone")
lv = TZ - DROP * 5
gq.face([(-24, GY0 + 5 * TIER, lv - 0.02), (19, GY0 + 5 * TIER, lv - 0.02), (19, GY0 + 5 * TIER + 2.4, lv - 0.25), (-24, GY0 + 5 * TIER + 2.4, lv - 0.25)], "flag", (0, 0, 1))   # the path along the foot

# ---- the drive's stone edging -----------------------------------------------------------------------------------------
for rad in (9.5, 15.6):
    n = int(2 * math.pi * rad / 0.55)
    for k in range(n):
        a = 2 * math.pi * k / n; x, y = FC[0] + rad * math.cos(a), FC[1] + rad * math.sin(a)
        if rad > 12 and (abs(x) < 4.4 and y > -11) : continue                       # the gap under the porte-cochere
        if rad > 12 and (abs(x - 0.0) < 3.0 and y < -30): continue                  # ...and where the drive leaves
        blob(gs_, x, y, -0.22, random.uniform(0.17, 0.26), "stone", squash=0.55, jitter=0.25)

# ---- the servants' cottage, its garage and the pump house ---------------------------------------------------------------
COT = (-33.0, -96.0, 24.0)
gq.face([(4.0, -70, -0.27), (9.5, -70, -0.27), (-14.6, -95.5, -0.27), (-13.0, -89.3, -0.27)], "gravel", (0, 0, 1))      # the spur to the garage court
with frame(*COT):
    gq.face([(-2, -12.5, -0.27), (22, -12.5, -0.27), (22, 0.3, -0.27), (-2, 0.3, -0.27)], "gravel", (0, 0, 1))          # the court
    gdoor = lambda c: dict(u0=c - 1.3, u1=c + 1.3, z0=-0.45, z1=2.0, kind="door", id="garage-%d" % c, leafmat="oakdoor")
    HTN = [(0.0, "brick"), (None, "ht:nogging")]
    # the garage: five doors to the court, rooms in the roof
    wall_x(0.3, 0.0, 16.0, -0.6, 3.0, T_EXT, "brickint", "brick", [gdoor(c) for c in (1.8, 4.9, 8.0, 11.1, 14.2)], lvl="0")
    wall_x(7.3, 0.0, 16.0, -0.6, 3.0, T_EXT, "brick", "brickint", [dict(u0=c - 0.6, u1=c + 0.6, z0=1.1, z1=2.2, kind="win") for c in (3.0, 8.0, 13.0)], lvl="0")
    wall_y(0.0, 0.3, 7.3, -0.6, 3.0, T_EXT, "brickint", "brick", lvl="0")
    G("floor0").face([(0, 0.3, -0.44), (16, 0.3, -0.44), (16, 7.3, -0.44), (0, 7.3, -0.44)], "concrete", (0, 0, 1))
    G("ceil0").face([(0, 0.3, 2.9), (16, 0.3, 2.9), (16, 7.3, 2.9), (0, 7.3, 2.9)], "ceil", (0, 0, -1))
    gable(0.0, 0.3, 16.2, 7.3, 3.0, pitch=50, ends=("ht:nogging", None))
    for c in (4.0, 8.0, 12.0):                                                       # the half-timbered dormers over the doors
        wall_x(0.0, c - 1.0, c + 1.0, 3.0, 4.5, 0.12, "plaster", "ht:nogging", [dict(u0=c - 0.55, u1=c + 0.55, z0=3.35, z1=4.25, kind="win")], lvl="1")
        for x, sg in ((c - 1.0, -1), (c + 1.0, 1)): G("wall1").face([(x, 0.0, 3.0), (x, 0.0, 4.5), (x, 1.45, 4.5)], "nogging", (sg, 0, 0))
        with frame(0, 0, 90): gable(-0.2, -c - 1.1, 2.6, -c + 1.1, 4.5, pitch=42, over=0.2)
        lamp(c, 2.0, 3.9, 30, name="room-garage-loft", bulb=False)
    # the cottage at the garage's east end: two storeys, its gable to the court, a porch at the door
    wall_x(-1.2, 16.0, 23.0, -0.6, 3.0, T_EXT, CREAM, "brick", [dict(u0=18.0, u1=19.0, z0=0, z1=2.1, kind="door", id="cottage-door"), dict(u0=20.2, u1=21.8, z0=0.9, z1=2.2, kind="win")], lvl="0")
    wall_x(8.0, 16.0, 23.0, -0.6, 3.0, T_EXT, "brick", CREAM, [dict(u0=18.6, u1=20.4, z0=0.9, z1=2.2, kind="win")], lvl="0")
    wall_y(23.0, -1.2, 8.0, -0.6, 3.0, T_EXT, "brick", CREAM, [dict(u0=2.6, u1=4.4, z0=0.9, z1=2.2, kind="win")], lvl="0")
    wall_y(16.0, -1.2, 0.3, -0.6, 3.0, T_EXT, CREAM, "brick", lvl="0"); wall_y(16.0, 7.3, 8.0, -0.6, 3.0, T_EXT, CREAM, "brick", lvl="0")
    wall_y(16.0, 0.3, 7.3, -0.6, 3.0, T_INT, CREAM, "brickint", [dict(u0=3.3, u1=4.3, z0=0, z1=2.1, kind="door", id="cottage-garage")], lvl="0")
    wall_x(-1.2, 16.0, 23.0, 3.0, 5.4, T_EXT, CREAM, "ht:nogging", [dict(u0=18.4, u1=20.6, z0=3.8, z1=5.0, kind="win")], lvl="1")
    wall_x(8.0, 16.0, 23.0, 3.0, 5.4, T_EXT, "ht:nogging", CREAM, [dict(u0=18.6, u1=20.4, z0=3.8, z1=5.0, kind="win")], lvl="1")
    wall_y(23.0, -1.2, 8.0, 3.0, 5.4, T_EXT, "ht:nogging", CREAM, [dict(u0=2.6, u1=4.4, z0=3.8, z1=5.0, kind="win")], lvl="1")
    wall_y(16.0, -1.2, 8.0, 3.0, 5.4, T_EXT, CREAM, "ht:nogging", lvl="1")
    for z, m in ((0.0, "oakfloor"), (3.0, "oakfloor")): G("floor%d" % (1 if z else 0)).face([(16, -1.2, z), (23, -1.2, z), (23, 8.0, z), (16, 8.0, z)], m, (0, 0, 1))
    G("ceil0").face([(16, -1.2, 2.85), (23, -1.2, 2.85), (23, 8.0, 2.85), (16, 8.0, 2.85)], "ceil", (0, 0, -1))
    with frame(0, 0, 90): gable(-1.2, -23.0, 8.0, -16.0, 5.4, pitch=48, ends=("ht:nogging", "ht:nogging"))
    chimney(22.6, 3.4, 1.0, 0.9, 0, 10.4, 2)
    lamp(19.5, 3.4, 2.4, 60, name="room-cottage", bulb=False); lamp(19.5, 3.4, 4.9, 45, name="room-cottage-up", bulb=False); lamp(8.0, 3.8, 2.5, 50, name="room-garage", bulb=False)
    lamp(18.5, -1.7, 2.3, 30, name="lantern")
    # the pump house: a small square brick building with a slate roof and a cupola
    px, py = 28.5, 4.6          # beside the garage road, not on it
    for wargs in (("x", py - 1.5), ("x", py + 1.5)): wall_x(wargs[1], px - 1.5, px + 1.5, -0.6, 2.5, 0.25, "brick", "brick", lvl="0")
    wall_y(px - 1.5, py - 1.5, py + 1.5, -0.6, 2.5, 0.25, "brick", "brick", [dict(u0=py - 0.45, u1=py + 0.45, z0=0, z1=2.0, kind="door", id="pump-house")], lvl="0"); wall_y(px + 1.5, py - 1.5, py + 1.5, -0.6, 2.5, 0.25, "brick", "brick", lvl="0")
    gr2 = G("roofR")
    c4 = [(px - 1.9, py - 1.9), (px + 1.9, py - 1.9), (px + 1.9, py + 1.9), (px - 1.9, py + 1.9)]
    for i in range(4): gr2.face([(c4[i][0], c4[i][1], 2.4), (c4[(i + 1) % 4][0], c4[(i + 1) % 4][1], 2.4), (px, py, 4.3)], "slate", (0, 0, 1))
    G("chimney").box(px - 0.3, py - 0.3, 3.9, px + 0.3, py + 0.3, 4.6, "timber"); G("chimney").box(px - 0.42, py - 0.42, 4.6, px + 0.42, py + 0.42, 4.7, "slate")

# ---- the west end's garden (photo 27): a flagged landing outside the arcade's glass door, clipped box in terracotta
# pots on rubble piers at the head of the stone steps, the steps down the bank between rubble walls, lead urns at
# their foot, a flagged path on, and a clipped hedge along the top of the bank ----
FLAT.update({"leadurn": (0.05, 0.075, 0.07, 0.5)})
def urn(g, x, y, z, s=1.0):
    for (h0, r0), (h1, r1) in zip([(0.0, 0.16), (0.05, 0.1), (0.16, 0.07), (0.22, 0.13), (0.4, 0.26), (0.52, 0.28), (0.55, 0.25)], [(0.05, 0.1), (0.16, 0.07), (0.22, 0.13), (0.4, 0.26), (0.52, 0.28), (0.55, 0.25), (0.56, 0.2)]):
        cyl(g, (x, y, z + h0 * s), (x, y, z + h1 * s), r0 * s, r1 * s, "leadurn", 12)
with C():
    gw = G("ground"); YC = 10.65; X0, X1 = -30.0, -35.0; Z0, Z1 = ground_h(X0, YC), ground_h(X1, YC); NS = 13
    gw.box(X0, YC - 2.6, Z0 - 0.3, -26.25, YC + 2.3, Z0 + 0.02, "flag")                                   # the landing
    for i in range(NS):                                                   # the steps
        xa = X0 + (X1 - X0) * i / NS; xb = X0 + (X1 - X0) * (i + 1) / NS; zt = Z0 + (Z1 - Z0) * (i + 0.5) / NS + 0.16      # proud of the bank the ground makes there
        gw.box(xb, YC - 1.5, zt - 0.6, xa, YC + 1.5, zt, "flag")
    for sg in (-1, 1):                                                    # the rubble walls either side, and the piers
        ya, yb = sorted((YC + sg * 1.5, YC + sg * 1.95))
        for i in range(NS):
            xa = X0 + (X1 - X0) * i / NS; xb = X0 + (X1 - X0) * (i + 1) / NS; zt = Z0 + (Z1 - Z0) * i / NS
            gw.box(xb, ya, zt - 0.9, xa, yb, zt + 0.55, "stone")
        py = YC + sg * 2.0
        gw.box(X0 - 0.1, py - 0.38, Z0 - 0.3, X0 + 0.66, py + 0.38, Z0 + 1.0, "stone"); gw.box(X0 - 0.16, py - 0.44, Z0 + 1.0, X0 + 0.72, py + 0.44, Z0 + 1.08, "flag")
        put("planter_pot_clay", X0 + 0.28, py, Z0 + 1.08 - 0.2, 0, 2.0); bush(X0 + 0.28, py, Z0 + 1.08 + 0.42, 0.42, mat="hedge")
        gw.box(X1 - 0.5, py - 0.3, Z1 - 0.4, X1 + 0.1, py + 0.3, Z1 + 0.45, "stone"); urn(gw, X1 - 0.2, py, Z1 + 0.45 + 0.2, 1.1)
    x = X1
    while x > -47:                                                        # the flagged path on from the foot of the steps
        gw.face([(x - 2.0, YC - 1.5, ground_h(x - 2.0, YC) + 0.23), (x, YC - 1.5, ground_h(x, YC) + 0.23), (x, YC + 1.5, ground_h(x, YC) + 0.23), (x - 2.0, YC + 1.5, ground_h(x - 2.0, YC) + 0.23)], "flag", (0, 0, 1)); x -= 2.0
    for k in range(17): bush(-29.4, 7.6 - 0.55 * k, Z0 + 0.0, 0.52, tall=1.15, mat="hedge")              # the clipped hedge along the top of the bank
    for k in range(9):                                                    # planting down the bank beside the steps
        bx = random.uniform(-34.5, -30.5); by = YC + random.choice((-1, 1)) * random.uniform(2.6, 5.5)
        bush(bx, by, ground_h(bx, by) + 0.0, random.uniform(0.3, 0.55), tall=random.uniform(0.8, 1.4), mat=random.choice(("plant1", "plant2", "hedge")))
with C():                                                                 # the terrace's iron urns of flowers on their plinths (photo 15)
    for x in (-5.3, -0.7):
        gw.box(x - 0.24, 22.56, TZ + 0.99, x + 0.24, 23.04, TZ + 1.45, "leadurn"); gw.box(x - 0.28, 22.52, TZ + 1.45, x + 0.28, 23.08, TZ + 1.5, "leadurn")
        urn(gw, x, 22.8, TZ + 1.5, 1.5)
        for _ in range(26):
            a_ = random.uniform(0, 6.28); r_ = random.uniform(0, 0.36)
            blob(G("shrubs"), x + r_ * math.cos(a_), 22.8 + r_ * math.sin(a_), TZ + 1.5 + 0.86 + random.uniform(0, 0.12), random.uniform(0.05, 0.09), random.choice(("bloom1", "bloom2", "plant2", "plant1")), squash=0.8, jitter=0.2)
