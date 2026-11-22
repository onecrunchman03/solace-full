# SURVIVORZ, GLENRIDGE HALL: the fifth pass, run inside build.py after grounds.py: what a body needs to get about.
# The service stair (ground to upper floor, two flights round a landing) with the basement stair under its second
# flight, the basement's fittings (the coal furnace the nomination says still heated the house, the coal, the
# laundry), and rugs in the bedrooms. STAIRS records each flight for the map file: (id, from level, to level,
# [(x, y, z), ...] along its walking line, in Blender coords).
STAIRS = []
FLAT["coal"] = (0.012, 0.012, 0.014, 0.6)
with C():
    R_ = UF / 20
    STAIRS.append(("main-stair", 0, 1, [(-2.7, -0.2, 0.0), (-2.7, -3.25, R_ * 10), (-7.0, -3.8, R_ * 10), (-7.0, -0.35, UF), (-7.0, 0.3, UF)]))
with Ef():
    g0 = G("joinery0"); R_ = UF / 20; A0, A1, B0, B1 = 12.2, 13.35, 13.45, 14.6
    for i in range(10): g0.box(A0, -2.2 + i * 0.25, 0, A1, -1.95 + i * 0.25, R_ * (i + 1), "oakfloor")                    # up the west side
    g0.box(A0, 0.3, 0, A1 + 0.1, 1.5, R_ * 10, "oakfloor"); g0.box(A1 + 0.1, 0.3, R_ * 10 - 0.15, B1, 1.5, R_ * 10, "oakfloor")   # the landing
    for i in range(10): g0.box(B0, 0.05 - i * 0.25, R_ * (11 + i) - 0.2, B1, 0.3 - i * 0.25, R_ * (11 + i), "oakfloor")   # back up the east side
    G("wall0").box(A1, -2.2, BF, B0, 0.3, UF + 1.0, "cream")                                                               # the spine wall between the flights
    G("joinery1").box(A0 - 0.05, -2.26, UF, A1 + 0.05, -2.16, UF + 1.0, "oakpanel")                                        # the guard over the well
    G("floor0").face([(12.1, -2.4, 0.001), (14.7, -2.4, 0.001), (14.7, -2.2, 0.001), (12.1, -2.2, 0.001)], "checker", (0, 0, 1))
    Rb = 3.0 / 16
    gb = G("joinery-1")
    for i in range(15): gb.box(B0, -2.2 + i * 0.2, BF, B1, -2.0 + i * 0.2, -Rb * (i + 1), "concrete")                     # down to the basement, under the second flight
    for nm, lv0, lv1, pts in (("service-stair", 0, 1, [(12.8, -2.5, 0.0), (12.8, 0.3, R_ * 10), (14.0, 0.9, R_ * 10), (14.0, -2.2, UF), (14.0, -2.6, UF)]),
                              ("basement-stair", 0, -1, [(14.0, -2.5, 0.0), (14.0, 1.0, BF), (13.0, 1.3, BF)])):
        STAIRS.append((nm, lv0, lv1, [(*T(x, y), z) for x, y, z in pts]))
    lamp(13.4, 0.9, UF + 2.0, 40, name="stairlight"); lamp(12.8, -1.0, 2.7, 35, name="stairlight-g"); lamp(13.0, -3.0, BF + 2.1, 35, name="stairlight-b")
    # the basement
    cyl(gb, (8.6, 1.2, BF), (8.6, 1.2, BF + 1.9), 0.95, 0.95, "iron", 14); cyl(gb, (8.6, 1.2, BF + 1.9), (8.6, 1.2, BF + 2.5), 0.2, 0.2, "iron", 8)
    gb.box(8.0, 0.1, BF + 0.2, 9.2, 0.3, BF + 0.9, "iron"); G("glowbits").box(8.3, 0.2, BF + 0.3, 8.9, 0.26, BF + 0.6, "glow")
    lamp(8.6, -0.2, BF + 0.5, 60, colour=(1.0, 0.4, 0.12), name="furnace", bulb=False)
    for (a, b) in (((8.6, 1.2, BF + 2.3), (11.9, 1.2, BF + 2.3)), ((8.6, 1.2, BF + 2.3), (8.6, 3.6, BF + 2.3)), ((6.0, -3.5, BF + 2.3), (11.9, -3.5, BF + 2.3))): cyl(gb, a, b, 0.09, 0.09, "iron", 8)
    for _ in range(60): blob(G("shrubs2"), random.uniform(2.6, 5.2), random.uniform(-3.2, 1.5), BF + random.uniform(0.1, 0.9), random.uniform(0.15, 0.3), "coal", squash=0.7, jitter=0.35)
    for u in (16.0, 17.4, 18.8): gb.box(u, -3.6, BF, u + 1.1, -2.95, BF + 0.85, "whitepaint"); gb.box(u + 0.08, -3.52, BF + 0.55, u + 1.02, -3.03, BF + 0.86, "steel")
    table(17.6, -1.2, BF, 2.2, 0.9, lvl=-1)
    top_of_crate = max(v.co.z for v in model("old_military_crate").vertices) if model("old_military_crate") else 0.4
    # the furnace room's stores, nothing later than the house: worn wooden shelving on the north wall, crates on the south
    put("wooden_bookshelf_worn", 10.2, 3.3, BF, 270, lvl=-1); put("wooden_bookshelf_worn", 11.4, 3.3, BF, 270, lvl=-1)
    put("old_military_crate", 10.9, -3.1, BF, 15, lvl=-1); put("old_military_crate", 9.6, -3.2, BF, 0, lvl=-1); put("old_military_crate", 9.7, -3.15, BF + top_of_crate, 20, lvl=-1)

# rugs in the bedrooms
with Wf():
    rug(2.9, -1.4, 6.4, 3.0, 0, "rug-04.jpg"); rug(14.4, -2.6, 18.4, 2.6, 0, "rug-06.jpg"); rug(3.0, -1.2, 7.0, 3.0, UF, "rug-01.jpg", lvl=1); rug(13.6, 0.2, 18.4, 3.2, UF, "rug-03.jpg", lvl=1)
with C():
    rug(-14.6, 5.0, -11.4, 9.6, UF, "rug-05.jpg", lvl=1)
