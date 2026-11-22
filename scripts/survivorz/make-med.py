# SURVIVORZ: the medical wing's own pieces (2026-10-27; docs/survivorz/REFERENCES.md round eight). The free
# models cover the movable kit (monitors, IV poles, carts, the stretcher, the morgue's bank and table); a
# hospital's built-ins (curtain tracks, headwalls, the scrub trough, the pharmacy's shelving and cage) are
# made to one specification, so they're modelled here at their real sizes. Each faces -y (Blender) = +z in the game.
#
#   blender -b --factory-startup --python scripts/survivorz/make-med.py [-- <id> ...]
#   -> assets/downloads/survivorz/originals/inbox/ready/<id>.glb
import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
from make_lib import fresh, mat, palette, Builder, export
from mathutils import Matrix

ONLY = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def want(name): return not ONLY or name in ONLY

def med_palette():
    M = palette()
    M.update({
        "pad": mat("vinyl_pad", (0.03, 0.05, 0.07), 0.6),                 # the dark blue vinyl of tables and couches
        "curtain": mat("curtain_teal", (0.12, 0.28, 0.27), 0.95),         # hospital curtain, washed-out teal
        "grey": mat("plastic_grey", (0.2, 0.21, 0.215), 0.5),
        "screen": mat("screen_off", (0.004, 0.005, 0.006), 0.06),
        "green": mat("gas_green", (0.03, 0.3, 0.08), 0.45), "blue": mat("gas_blue", (0.01, 0.08, 0.35), 0.45),
        "yellow": mat("sharps_yellow", (0.62, 0.42, 0.01), 0.5), "red": mat("lid_red", (0.45, 0.02, 0.015), 0.45),
        "bag": mat("bodybag_black", (0.012, 0.013, 0.015), 0.35),
        "mesh": mat("cage_mesh", (0.3, 0.31, 0.32), 0.4, 0.5),
        "bin": mat("bin_blue", (0.04, 0.18, 0.45), 0.5),
        "lens": mat("surgical_lens", (0.75, 0.78, 0.8), 0.2),
    })
    return M

# ---- operating-table: 2.0 x 0.55 top at 0.85 on a column and base; the head and arm boards ------------------------
if want("operating-table"):
    fresh(); M = med_palette(); b = Builder("operating-table", M)
    b.box(-0.35, -0.25, 0.0, 0.35, 0.25, 0.08, "white")                 # the base
    b.box(-0.12, -0.12, 0.08, 0.12, 0.12, 0.72, "white")                 # the column
    b.box(-0.9, -0.24, 0.72, 0.9, 0.24, 0.78, "steel")                   # the frame
    b.box(-0.95, -0.275, 0.78, 0.75, 0.275, 0.86, "pad")                 # the mattress sections
    b.box(0.77, -0.15, 0.78, 1.05, 0.15, 0.86, "pad")                    # the head board
    for s in (-1, 1):
        b.box(-0.2, s * 0.275, 0.8, 0.0, s * 0.275 + s * 0.6, 0.84, "pad")   # the arm boards, out
        b.box(-0.95, s * 0.28 - 0.01, 0.74, 0.75, s * 0.28 + 0.01, 0.77, "steel")   # the side rails
    export([b.done()], "operating-table")

# ---- surgical-light: two light heads on articulated arms from a ceiling mount. The prop's TOP is the mount:
# place it at ceiling - 1.3 -------------------------------------------------------------------------------------------
if want("surgical-light"):
    fresh(); M = med_palette(); b = Builder("surgical-light", M)
    b.cyl(0, 0, 1.22, 1.3, 0.14, "white", 24)
    b.tube((0, 0, 1.22), (0, 0, 1.0), 0.05, "white")
    for (dx, dy, dz) in ((0.75, 0.15, 0.25), (-0.6, -0.35, 0.05)):
        b.tube((0, 0, 1.02), (dx * 0.6, dy * 0.6, 1.0), 0.035, "white")
        b.tube((dx * 0.6, dy * 0.6, 1.0), (dx, dy, dz + 0.25), 0.03, "white")
        hx, hy, hz = dx, dy, dz + 0.12
        b.cyl(hx, hy, hz, hz + 0.12, 0.3, "white", 32)                   # the head's dome
        b.cyl(hx, hy, hz - 0.005, hz + 0.001, 0.27, "lens", 32)           # its lens face
        b.cyl(hx, hy, hz - 0.06, hz, 0.03, "grey", 12)                    # the sterile handle
    export([b.done()], "surgical-light")

# ---- scrub-sink: the OR's 1.6 m stainless scrub trough with knee-operated taps and a splash back -------------------
if want("scrub-sink"):
    fresh(); M = med_palette(); b = Builder("scrub-sink", M)
    L, D = 1.6, 0.6
    b.box(-L / 2, -D / 2, 0.55, L / 2, D / 2, 0.95, "steel")
    b.box(-L / 2 + 0.05, -D / 2 + 0.05, 0.94, L / 2 - 0.05, D / 2 - 0.08, 0.951, "dark")   # the trough's mouth
    b.box(-L / 2, D / 2 - 0.03, 0.95, L / 2, D / 2, 1.45, "steel")                         # the splash back
    for x in (-0.45, 0.45):
        b.tube((x, D / 2 - 0.05, 1.35), (x, 0.05, 1.3), 0.012, "steel")                     # the swan necks
        b.box(x - 0.08, -D / 2 - 0.02, 0.6, x + 0.08, -D / 2, 0.7, "steel")                # the knee paddles
    for x in (-L / 2 + 0.05, L / 2 - 0.05):
        b.box(x - 0.03, -D / 2 + 0.05, 0, x + 0.03, D / 2 - 0.05, 0.55, "steel")
    export([b.done()], "scrub-sink")

# ---- bed-curtain: a ceiling track 2.4 x 2.2 round a bed space; curtains hang from it on the back and one side,
# the front drawn half across (pleated, 0.3 off the floor). The prop's TOP is the track: place at ceiling - 2.8 -----
if want("bed-curtain"):
    fresh(); M = med_palette(); b = Builder("bed-curtain", M)
    W, D, Z = 2.4, 2.2, 2.75
    for (a, c) in (((-W / 2, -D / 2), (W / 2, -D / 2)), ((W / 2, -D / 2), (W / 2, D / 2)), ((W / 2, D / 2), (-W / 2, D / 2)), ((-W / 2, D / 2), (-W / 2, -D / 2))):
        b.tube((a[0], a[1], Z), (c[0], c[1], Z), 0.012, "steel", 8)
    for (x, y) in ((-W / 2, -D / 2), (W / 2, -D / 2), (W / 2, D / 2), (-W / 2, D / 2)):
        b.tube((x, y, Z), (x, y, 2.8), 0.008, "steel", 6)
    def pleats(p0, p1, z0=0.3, z1=Z - 0.06):
        n = max(4, int(math.dist(p0, p1) / 0.12))
        for i in range(n):
            u0, u1 = i / n, (i + 1) / n
            x0, y0 = p0[0] + (p1[0] - p0[0]) * u0, p0[1] + (p1[1] - p0[1]) * u0
            x1, y1 = p0[0] + (p1[0] - p0[0]) * u1, p0[1] + (p1[1] - p0[1]) * u1
            # a pleat: a thin slab kinked in or out alternately, each overlapping its neighbours so the cloth
            # reads as one curtain from any angle (the first cut left slots between the slats)
            off = 0.02 if i % 2 else -0.02
            nx, ny = -(p1[1] - p0[1]), (p1[0] - p0[0]); ln = math.hypot(nx, ny) or 1; nx, ny = nx / ln * off, ny / ln * off
            ex, ey = (x1 - x0) * 0.25, (y1 - y0) * 0.25
            xa, xb = min(x0 - ex, x1 + ex), max(x0 - ex, x1 + ex); ya, yb = min(y0 - ey, y1 + ey), max(y0 - ey, y1 + ey)
            b.box(xa + nx - 0.004, ya + ny - 0.004, z0, xb + nx + 0.004, yb + ny + 0.004, z1, "curtain")
        b.box(min(p0[0], p1[0]) - 0.003, min(p0[1], p1[1]) - 0.003, z0 + 0.02, max(p0[0], p1[0]) + 0.003, max(p0[1], p1[1]) + 0.003, z1, "curtain")   # the cloth behind the folds
    pleats((-W / 2, D / 2), (W / 2, D / 2))           # the back (toward +y, against the wall)
    pleats((W / 2, D / 2), (W / 2, -D / 2))           # one side
    pleats((W / 2, -D / 2), (W / 2 - 0.8, -D / 2))    # the front, drawn a third of the way
    export([b.done()], "bed-curtain")

# ---- headwall: the service panel over a bed, 1.8 wide: oxygen and air outlets, suction, sockets, a reading light,
# the nurse-call handset ------------------------------------------------------------------------------------------------
if want("headwall"):
    fresh(); M = med_palette(); b = Builder("headwall", M)
    b.box(-0.9, 0.0, 1.2, 0.9, 0.06, 1.55, "white")
    b.box(-0.9, -0.002, 1.48, 0.9, 0.0, 1.5, "grey")
    for i, k in enumerate(("green", "white", "blue", "white", "white")):
        x = -0.6 + i * 0.3
        b.cyl(x, -0.01, 1.3, 1.31, 0.03, k, 12) if False else b.box(x - 0.04, -0.012, 1.26, x + 0.04, 0.0, 1.34, k)
    b.box(-0.85, -0.03, 1.56, 0.85, 0.06, 1.62, "white")      # the reading light's trunk
    b.box(-0.8, -0.032, 1.56, 0.8, -0.03, 1.575, "lens")
    b.box(0.72, -0.05, 1.05, 0.8, -0.02, 1.2, "grey")         # the nurse-call handset
    export([b.done()], "headwall")

# ---- privacy-screen: a three-panel folding hospital screen, 1.8 wide open, 1.75 high, on castors ---------------------
if want("privacy-screen"):
    fresh(); M = med_palette(); b = Builder("privacy-screen", M)
    for i, a in enumerate((-20, 0, 20)):
        cx = (i - 1) * 0.6
        xf = Matrix.Translation((cx, 0, 0)) @ Matrix.Rotation(math.radians(a), 4, "Z")
        b.box(-0.29, -0.01, 0.15, 0.29, 0.01, 1.72, "curtain", xf)
        for x in (-0.29, 0.29):
            b.box(x - 0.012, -0.012, 0.05, x + 0.012, 0.012, 1.75, "steel", xf)
        b.box(-0.29, -0.012, 1.72, 0.29, 0.012, 1.75, "steel", xf)
    export([b.done()], "privacy-screen")

# ---- pharmacy-shelves: a 1.8 m white gondola of five shelves, each carrying a row of blue pick bins ----------------
if want("pharmacy-shelves"):
    fresh(); M = med_palette(); b = Builder("pharmacy-shelves", M)
    W, D, H = 1.8, 0.45, 2.1
    b.box(-W / 2, D / 2 - 0.02, 0, W / 2, D / 2, H, "white")
    for x in (-W / 2, W / 2 - 0.02):
        b.box(x, -D / 2, 0, x + 0.02, D / 2, H, "white")
    for k in range(6):
        z = 0.1 + k * 0.38
        b.box(-W / 2 + 0.02, -D / 2, z, W / 2 - 0.02, D / 2 - 0.02, z + 0.02, "white")
        if k < 5:
            for j in range(7):
                x = -W / 2 + 0.16 + j * 0.245
                b.box(x - 0.1, -D / 2 + 0.02, z + 0.02, x + 0.1, D / 2 - 0.06, z + 0.17, "bin")
                b.box(x - 0.06, -D / 2 + 0.015, z + 0.1, x + 0.06, -D / 2 + 0.02, z + 0.14, "white")   # its label
    export([b.done()], "pharmacy-shelves")

# ---- pharmacy-cage: the controlled-drugs cage, 3.0 wide, 2.4 high, 1.2 deep, steel mesh with its door (fronts -y) ---
if want("pharmacy-cage"):
    fresh(); M = med_palette(); b = Builder("pharmacy-cage", M)
    W, D, H = 3.0, 1.2, 2.4
    for (x, y) in ((-W / 2, -D / 2), (W / 2, -D / 2), (W / 2, D / 2), (-W / 2, D / 2), (0.3, -D / 2), (1.2, -D / 2)):
        b.box(x - 0.025, y - 0.025, 0, x + 0.025, y + 0.025, H, "steel")
    for z in (0.05, 1.2, H - 0.03):
        b.box(-W / 2, -D / 2 - 0.02, z - 0.02, W / 2, -D / 2 + 0.02, z + 0.02, "steel")
        b.box(-W / 2 - 0.02, -D / 2, z - 0.02, -W / 2 + 0.02, D / 2, z + 0.02, "steel")
        b.box(W / 2 - 0.02, -D / 2, z - 0.02, W / 2 + 0.02, D / 2, z + 0.02, "steel")
    # the mesh: thin wires on the front and the sides
    for k in range(31):
        x = -W / 2 + k * 0.1
        b.box(x - 0.003, -D / 2 - 0.003, 0.05, x + 0.003, -D / 2 + 0.003, H - 0.03, "mesh")
    for k in range(24):
        z = 0.1 + k * 0.1
        b.box(-W / 2, -D / 2 - 0.004, z - 0.003, W / 2, -D / 2 + 0.004, z + 0.003, "mesh")
        for x in (-W / 2, W / 2):
            b.box(x - 0.004, -D / 2, z - 0.003, x + 0.004, D / 2, z + 0.003, "mesh")
    b.box(0.95, -D / 2 - 0.06, 1.0, 1.05, -D / 2 - 0.02, 1.15, "dark")      # the lock
    b.box(-W / 2, -D / 2, H - 0.03, W / 2, D / 2, H, "mesh")                # the roof
    export([b.done()], "pharmacy-cage")

# ---- body-bag: a filled black body bag, 2.0 long, lying, its zip down the middle -----------------------------------
if want("body-bag"):
    fresh(); M = med_palette(); b = Builder("body-bag", M)
    for i in range(10):   # a stack of flattened slices, widest at the shoulders
        u = i / 9; x = -1.0 + u * 2.0
        w = 0.24 + 0.1 * math.sin(math.pi * min(1, u * 1.3)) - (0.06 if u > 0.85 else 0)
        h = 0.16 + 0.06 * math.sin(math.pi * u)
        b.box(x - 0.11, -w, 0.0, x + 0.11, w, h, "bag")
    b.box(-0.95, -0.006, 0.0, 0.95, 0.006, 0.215, "steel")                  # the zip
    for x in (-1.05, 1.05):
        b.box(x - 0.05, -0.08, 0.04, x + 0.05, 0.08, 0.07, "bag")           # the handles
    export([b.done()], "body-bag")

# ---- sharps-bin: the yellow sharps container with its red lid, wall bracket height ---------------------------------
if want("sharps-bin"):
    fresh(); M = med_palette(); b = Builder("sharps-bin", M)
    b.box(-0.14, -0.1, 0.0, 0.14, 0.1, 0.28, "yellow")
    b.box(-0.145, -0.105, 0.28, 0.145, 0.105, 0.32, "red")
    export([b.done()], "sharps-bin")

# ---- isolator-tent: a Trexler-style negative-pressure isolator round a bed (M5): a steel frame 2.4 x 1.3 x 1.9 hung
# with clear PVC, glove ports on its long side, the filter unit on its head end ------------------------------------------
if want("isolator-tent"):
    fresh(); M = med_palette(); b = Builder("isolator-tent", M)
    L, W, H = 2.4, 1.3, 1.9
    for (x, y) in ((-L / 2, -W / 2), (L / 2, -W / 2), (L / 2, W / 2), (-L / 2, W / 2)):
        b.tube((x, y, 0), (x, y, H), 0.02, "steel", 8)
    for (a, c) in (((-L / 2, -W / 2), (L / 2, -W / 2)), ((L / 2, -W / 2), (L / 2, W / 2)), ((L / 2, W / 2), (-L / 2, W / 2)), ((-L / 2, W / 2), (-L / 2, -W / 2))):
        b.tube((a[0], a[1], H), (c[0], c[1], H), 0.018, "steel", 8)
        b.tube((a[0], a[1], 0.05), (c[0], c[1], 0.05), 0.018, "steel", 8)
    t = 0.004
    b.box(-L / 2, -W / 2 - t, 0.05, L / 2, -W / 2 + t, H, "glass"); b.box(-L / 2, W / 2 - t, 0.05, L / 2, W / 2 + t, H, "glass")
    b.box(-L / 2 - t, -W / 2, 0.05, -L / 2 + t, W / 2, H, "glass"); b.box(L / 2 - t, -W / 2, 0.05, L / 2 + t, W / 2, H, "glass")
    b.box(-L / 2, -W / 2, H - t, L / 2, W / 2, H + t, "glass")
    for x in (-0.7, -0.3, 0.3, 0.7):
        b.tube((x, -W / 2, 1.05), (x, -W / 2 - 0.04, 1.05), 0.08, "steel", 16)      # the glove ports' rings
        b.tube((x, -W / 2 + 0.01, 1.05), (x, -W / 2 + 0.35, 0.95), 0.05, "blue", 10)  # the sleeves, hanging in
    b.box(-L / 2 - 0.3, -0.25, 1.2, -L / 2, 0.25, 1.7, "white")                         # the filter unit
    b.box(-L / 2 - 0.29, -0.2, 1.3, -L / 2 - 0.27, 0.2, 1.6, "grey")
    export([b.done()], "isolator-tent")

# ---- laminar-canopy: the OR's laminar-flow diffuser, 2.4 x 2.4, perforated, a light strip round its border. Its TOP
# is the ceiling: place at ceiling - 0.12 ------------------------------------------------------------------------------------
if want("laminar-canopy"):
    fresh(); M = med_palette(); b = Builder("laminar-canopy", M)
    S = 1.2
    b.box(-S, -S, 0.0, S, S, 0.12, "white")
    b.box(-S + 0.06, -S + 0.06, -0.002, S - 0.06, -S + 0.12, 0.0, "lens"); b.box(-S + 0.06, S - 0.12, -0.002, S - 0.06, S - 0.06, 0.0, "lens")
    b.box(-S + 0.06, -S + 0.12, -0.002, -S + 0.12, S - 0.12, 0.0, "lens"); b.box(S - 0.12, -S + 0.12, -0.002, S - 0.06, S - 0.12, 0.0, "lens")
    for i in range(14):
        for j in range(14):
            x, y = -S + 0.25 + i * 0.15, -S + 0.25 + j * 0.15
            b.box(x - 0.02, y - 0.02, -0.003, x + 0.02, y + 0.02, -0.001, "grey")
    export([b.done()], "laminar-canopy")

# ---- pass-box: a stainless pass-through hatch set in a wall (M3, M8): 0.6 square, its door, the interlock lamps ----------
if want("pass-box"):
    fresh(); M = med_palette(); b = Builder("pass-box", M)
    b.box(-0.35, -0.12, 0.0, 0.35, 0.0, 0.7, "steel")
    b.box(-0.28, -0.13, 0.07, 0.28, -0.12, 0.63, "steel")
    b.box(0.18, -0.15, 0.3, 0.22, -0.13, 0.42, "dark")
    b.box(-0.25, -0.126, 0.645, -0.21, -0.12, 0.665, "green")
    b.box(-0.18, -0.126, 0.645, -0.14, -0.12, 0.665, "red")
    export([b.done()], "pass-box")
