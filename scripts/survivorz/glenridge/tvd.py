# SURVIVORZ, GLENRIDGE HALL AS THE SALVATORE BOARDING HOUSE (The Vampire Diaries, season 1), run inside build.py after
# polish.py. Josh, Nov 12 2026: "make it look like vampire diaries season 1". The season-1 frames (reference
# tvd-s1/, private) show the great room, the gallery and the entry ARE the real Glenridge rooms, shot on location;
# two rooms were sets and have no real counterpart, so they are built here where the house has room for them:
#   STEFAN'S BEDROOM  a timber-trussed attic room lined in boards (desk, shelves, the bed with red pillows): in the roof
#                     over the solarium, where the real house had Mr. Glenn's "gym", reached from the upper floor.
#   THE CELL          the cellar's barred cell (1x20): in the basement, off the foot of the basement stair.
# And the great room is dressed as the show frames it: portraits either side of the inglenook with a lamp under each
# (the banner and crossed spears over the fire are the real house's, in hall.py).
TEX["plankwall"] = ("oak_veneer_01", 1.0, (0.62, 0.4, 0.2), 0.8)        # warm narrow boards along the roof, as the set had (build.py BOARDS draws the joints)
FLAT.update({"journal": (0.16, 0.09, 0.05, 0.7), "pillowred": (0.5, 0.04, 0.05, 0.85), "bedcover": (0.38, 0.3, 0.2, 0.9)})

with Sf():     # ---- Stefan's bedroom ----
    Z = UF + 0.2; U0, U1, V0, V1, VM = 0.15, 9.35, 0.0, 9.1, 4.55; KNEE = 1.6
    rise = lambda v: 3.6 + min(v - V0, V1 - v)                         # the roof's underside over v
    g = G("joinery1"); gc = G("ceil1")
    for va, vb in ((V0 + KNEE, VM), (V1 - KNEE, VM)):                     # the board lining under each slope
        gc.face([(U0, va, rise(va) - 0.21), (U1, va, rise(va) - 0.21), (U1, vb, rise(vb) - 0.21), (U0, vb, rise(vb) - 0.21)], "plankwall", (0, 0, -1))
    for v, sg in ((V0 + KNEE, 1), (V1 - KNEE, -1)):                       # the knee walls
        wall_x(v, U0, U1, Z, rise(v) - 0.1, 0.1, "plankwall" if sg > 0 else "plaster", "plaster" if sg > 0 else "plankwall", lvl="1")
    for u in (U0, U1):                                                    # the end walls, boarded
        with frame(u, 0, 90):
            G("wall1").prism([(V0 + KNEE, Z), (V1 - KNEE, Z), (V1 - KNEE, rise(V1 - KNEE) - 0.1), (VM, rise(VM) - 0.1), (V0 + KNEE, rise(V0 + KNEE) - 0.1)], -0.05, 0.05, "plankwall", "plankwall", "plankwall")
    for u in (1.9, 4.75, 7.6):                                            # the trusses: principals, a tie, a king post, struts
        for sg, vw in ((1, V0 + KNEE), (-1, V1 - KNEE)):
            g.beam((u, vw, rise(vw) - 0.28), (u, VM, rise(VM) - 0.28), 0.2, 0.26, "timber", up=(1, 0, 0))
            g.beam((u, vw, Z), (u, vw, rise(vw) - 0.2), 0.18, 0.18, "timber", up=(1, 0, 0))
            g.beam((u, VM + sg * -1.5, Z + 2.5), (u, VM, rise(VM) - 0.5), 0.14, 0.16, "timber", up=(1, 0, 0))
        g.beam((u, V0 + KNEE, Z + 2.5), (u, V1 - KNEE, Z + 2.5), 0.2, 0.24, "timber", up=(1, 0, 0))
        g.beam((u, VM, Z + 2.5), (u, VM, rise(VM) - 0.3), 0.18, 0.18, "timber", up=(1, 0, 0))
    g.beam((U0, VM, rise(VM) - 0.2), (U1, VM, rise(VM) - 0.2), 0.16, 0.22, "timber")
    # the gable window (the wall is solid: a lit casement set on its face, inside and out)
    for uu, into in ((U1 - 0.06, -1), (9.5 + T_EXT / 2 + 0.01, 1)):
        with frame(uu, 0, 90):
            window(0, 0.0, dict(u0=VM - 1.3, u1=VM + 1.3, z0=Z + 0.9, z1=Z + 2.4, kind="win"), "1")
    # the furniture: the bed against the far end wall, the desk under the window, shelves along the knee walls
    put("GothicBed_01", 2.2, 2.75, Z, 90, 1.15, lvl=1)
    gd = G("dress1")
    gd.box(1.45, 2.0, Z + 0.62, 2.95, 2.45, Z + 0.78, "pillowred"); gd.box(1.3, 2.45, Z + 0.55, 3.1, 3.9, Z + 0.63, "bedcover")
    put("ClassicNightstand_01", 0.9, 2.0, Z, 90, lvl=1); put("ClassicNightstand_01", 3.5, 2.0, Z, 90, lvl=1); shade_lamp(0.9, 2.0, Z + 0.7, 22, lvl=1); shade_lamp(3.5, 2.0, Z + 0.7, 22, lvl=1)
    table(8.2, VM, Z, 2.0, 0.85, along="y", lvl=1); put("WoodenChair_01", 7.4, VM, Z, 0, 0.5, lvl=1); shade_lamp(8.3, VM - 0.6, Z + 0.78, 26, lvl=1)
    for k in range(5): gd.box(8.0 + 0.02 * k, VM + 0.2, Z + 0.78 + 0.035 * k, 8.26 + 0.02 * k, VM + 0.4, Z + 0.812 + 0.035 * k, "journal")      # the journals
    bookcase(V1 - KNEE - 0.05, 4.2, 7.2, Z, Z + 1.75, -1, lvl=1); bookcase(V0 + KNEE + 0.05, 5.0, 8.0, Z, Z + 1.75, 1, lvl=1)
    put("ArmChair_01", 5.4, 6.2, Z, 215, 1.05, lvl=1, tint=(0.45, 0.28, 0.16)); put("vintage_wooden_drawer_01", 0.75, 6.3, Z, 0, lvl=1); put("side_table_01", 6.2, 6.9, Z, 270, lvl=1)
    rug(3.6, 2.6, 7.4, 6.4, Z, "rug-04.jpg", lvl=1)
    put("Chandelier_01", 3.3, VM, Z + 2.5, 0, 0.9, lvl=1); put("Chandelier_01", 6.2, VM, Z + 2.5, 0, 0.9, lvl=1)
    lamp(3.3, VM, Z + 2.0, 55, name="room-stefans-bedroom", bulb=False); lamp(6.2, VM, Z + 2.0, 55, name="room-stefans-bedroom", bulb=False)

with Ef():     # ---- the cell: iron bars across its doorway ----
    gb = G("joinery-1"); u0, u1, v = 12.95, 13.85, 1.6
    for k in range(9): gb.beam((u0 + (u1 - u0) * k / 8, v, BF + 0.05), (u0 + (u1 - u0) * k / 8, v, BF + 2.15), 0.028, 0.028, "iron")
    for z in (BF + 0.12, BF + 1.1, BF + 2.1): gb.beam((u0 - 0.03, v, z), (u1 + 0.03, v, z), 0.05, 0.03, "iron")
    gb.box(u1 - 0.14, v - 0.05, BF + 0.95, u1 - 0.02, v + 0.05, BF + 1.2, "iron")                       # the lock
    gb.box(12.3, 3.2, BF, 14.5, 3.7, BF + 0.42, "stoneblock")                                        # the stone bench
    geo.DOORS.append(("cell-gate", T((u0 + u1) / 2, v), BF, frame_deg(), u1 - u0))

with C():      # ---- the great room as the show frames it ----
    g = G("dress0"); fy = 14.3 - T_EXT / 2; Zh = HALL_Z
    for x, f in ((-3.05, "portrait-07.jpg"), (3.05, "portrait-09.jpg")):   # a portrait either side of the inglenook, a lamp on a table under each
        hung("x", HY1 - T_EXT / 2, x, Zh + 2.25, 0.8, -1, f)
        put("side_table_01", x, HY1 - 0.55, Zh, 270, 1.2); shade_lamp(x, HY1 - 0.55, Zh + 0.66, 30)

# ---- the long gallery as the show frames it (1x05; reference tvd-s1/entry-gallery-*): dark panelling, a console and a
# cream-shaded lamp between the arches, two-candle sconces, small framed pictures in a row, a cushioned bench, a
# blue-and-white vase, and the red glass globe hanging at the far end ----
emissive("redglobe", (1.0, 0.1, 0.04), 1.6)
def top_of(id, scale=1.0):
    m = model(id); return max(v.co.z for v in m.vertices) * scale if m else 0.8
def sconce(x, y, z, into, lvl=0):
    """A two-candle wall sconce on a wall running along x at y; the room is on the `into` side."""
    g = G("dress%d" % lvl); ya, yb = sorted((y, y + into * 0.02)); g.box(x - 0.05, ya, z - 0.12, x + 0.05, yb, z + 0.12, "gilt")
    for dx in (-0.11, 0.11):
        g.beam((x, y + into * 0.02, z - 0.05), (x + dx, y + into * 0.11, z - 0.02), 0.014, 0.014, "gilt"); g.beam((x + dx, y + into * 0.11, z - 0.02), (x + dx, y + into * 0.11, z + 0.1), 0.02, 0.02, "candle")
        G("glowbits").box(x + dx - 0.012, y + into * 0.11 - 0.012, z + 0.1, x + dx + 0.012, y + into * 0.11 + 0.012, z + 0.15, "glow")
    lamp(x, y + into * 0.22, z + 0.12, 16, colour=(1.0, 0.6, 0.28), radius=0.06, name="sconce", bulb=False)
with C():
    gd = G("dress0"); yn = 3.0 - T_INT / 2; ct = top_of("ClassicConsole_01")
    for x in (-2.55, 2.55):
        put("ClassicConsole_01", x, yn - 0.27, 0, 270); shade_lamp(x - 0.35, yn - 0.27, ct, 34)
        put("antique_ceramic_vase_01", x + 0.4, yn - 0.27, ct, 0, 0.6)
    for x in (-3.55, -1.55, 1.55, 3.55, 5.85, 9.2): sconce(x, yn, 1.95, -1)
    for i, f in enumerate(("landscape-02.jpg", "portrait-03.jpg", "landscape-04.jpg", "portrait-05.jpg", "landscape-06.jpg")):
        hung("x", yn, 6.35 + 0.62 * i, 1.72, 0.44, -1, f, frame_="timber", proud=0.03)
    table(7.6, yn - 0.3, 0, 1.9, 0.5, H=0.45); gd.box(6.7, yn - 0.52, 0.45, 8.5, yn - 0.08, 0.55, "velvet")                 # the cushioned bench under the pictures
    gd.beam((-7.1, 1.5, 2.25), (-7.1, 1.5, 3.3), 0.012, 0.012, "iron"); blob(G("shades"), -7.1, 1.5, 2.08, 0.17, "redglobe", squash=1.0, jitter=0.0)
    lamp(-7.1, 1.5, 1.8, 22, colour=(1.0, 0.18, 0.08), radius=0.17, name="globe", bulb=False)
