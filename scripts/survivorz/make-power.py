# SURVIVORZ: power and maintenance's own pieces (2026-10-27; docs/survivorz/REFERENCES.md round ten). The plant
# floor's heavy kit, modelled because every free generator is a portable one and every free boiler a cauldron:
# the standby gensets, their day tank, the five zone breaker cabinets players throw, the fire-tube boilers, pipe
# racks for the gallery walls, catwalk sections and a floor grate. Each faces -y (Blender) = +z in the game.
#
#   blender -b --factory-startup --python scripts/survivorz/make-power.py [-- <id> ...]
#   -> assets/downloads/survivorz/originals/inbox/ready/<id>.glb
import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
from make_lib import fresh, mat, palette, Builder, export

ONLY = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def want(name): return not ONLY or name in ONLY

def pow_palette():
    M = palette()
    M.update({
        "enclosure": mat("genset_blue", (0.04, 0.085, 0.17), 0.5, 0.25),       # a standby set's painted housing (P1-P3: plant blue)
        "orange": mat("fuel_orange", (0.55, 0.16, 0.02), 0.5, 0.2),
        "gunmetal": mat("gunmetal", (0.16, 0.17, 0.18), 0.45, 0.5),
        "galv": mat("galvanised", (0.38, 0.39, 0.4), 0.5, 0.7),
        "yellow": mat("hazard_yellow", (0.62, 0.42, 0.01), 0.5),
        "red": mat("signal_red", (0.45, 0.02, 0.015), 0.45),
        "green": mat("pipe_green", (0.05, 0.2, 0.06), 0.5, 0.2),
        "blue": mat("pipe_blue", (0.03, 0.08, 0.25), 0.5, 0.2),
        "grey": mat("panel_grey", (0.28, 0.29, 0.3), 0.5, 0.3),
        "insul": mat("boiler_jacket", (0.33, 0.34, 0.36), 0.6, 0.4),
        "rust": mat("rust", (0.2, 0.07, 0.03), 0.85),
        "lamp-red": mat("lamp_red", (0.5, 0.03, 0.02), 0.3),
        "lamp-green": mat("lamp_green", (0.02, 0.35, 0.05), 0.3),
    })
    return M

def ring(b, cx, cy, cz, r, axis, thick, key, seg=24, width=0.04):
    """a flange: a short fat cylinder on an axis"""
    if axis == "x": b.tube((cx - width / 2, cy, cz), (cx + width / 2, cy, cz), r + thick, key, seg)
    elif axis == "y": b.tube((cx, cy - width / 2, cz), (cx, cy + width / 2, cz), r + thick, key, seg)
    else: b.tube((cx, cy, cz - width / 2), (cx, cy, cz + width / 2), r + thick, key, seg)

# ---- genset: a 1 MW-class standby diesel set in its sound enclosure, 5.6 x 2.0 x 2.5, on a skid; the radiator at
# +x, the control panel at -x, the exhaust silencer on the roof; the long side with the doors faces the aisle (-y) ----
if want("genset"):
    fresh(); M = pow_palette(); b = Builder("genset", M)
    L, W, H = 5.6, 2.0, 2.4
    b.box(-L / 2 - 0.1, -W / 2 - 0.05, 0, L / 2 + 0.1, W / 2 + 0.05, 0.22, "gunmetal")      # the skid / base tank
    for k in range(12):                                                                    # its hazard stripes
        x = -L / 2 + 0.1 + k * 0.47
        b.box(x, -W / 2 - 0.051, 0.03, x + 0.22, -W / 2 - 0.05, 0.19, "yellow")
    b.box(-L / 2, -W / 2, 0.22, L / 2, W / 2, H, "enclosure")
    for side in (-1, 1):                                                                   # door seams and handles
        y = side * (W / 2 + 0.001)
        for x in (-1.8, -0.6, 0.6, 1.8):
            b.box(x - 0.005, y - 0.003 * side, 0.3, x + 0.005, y + 0.003 * side, H - 0.1, "dark")
            b.box(x + 0.15, y + 0.03 * side - 0.02 * side, 1.2, x + 0.19, y + 0.03 * side, 1.45, "steel")
    for k in range(10):                                                                    # radiator louvres (+x end)
        z = 0.45 + k * 0.18
        b.box(L / 2, -W / 2 + 0.1, z, L / 2 + 0.05, W / 2 - 0.1, z + 0.08, "dark")
    for k in range(6):                                                                     # intake louvres on the aisle side
        z = 1.3 + k * 0.14
        b.box(-2.4, -W / 2 - 0.02, z, -1.95, -W / 2, z + 0.06, "dark")
    b.box(-L / 2 - 0.25, -0.5, 0.9, -L / 2, 0.5, 2.0, "grey")                              # the control panel (-x end)
    b.box(-L / 2 - 0.26, -0.35, 1.4, -L / 2 - 0.25, 0.05, 1.8, "black")                    # its display
    for (y, key) in ((0.2, "lamp-green"), (0.35, "lamp-red")):
        b.cyl(-L / 2 - 0.26, y, 1.6, 1.62, 0.03, key, 10)
    b.cyl(1.3, 0.2, H, H + 0.25, 0.12, "galv")                                             # the exhaust riser
    b.tube((1.3, 0.2, H + 0.5), (-1.2, 0.2, H + 0.5), 0.26, "galv", 20)                    # the silencer
    b.tube((1.3, 0.2, H + 0.2), (1.3, 0.2, H + 0.5), 0.12, "galv")
    b.tube((-1.2, 0.2, H + 0.5), (-1.6, 0.2, H + 0.5), 0.12, "galv")
    for x in (-0.8, 0.8):
        b.box(x - 0.05, 0.05, H, x + 0.05, 0.35, H + 0.3, "gunmetal")                      # silencer saddles
    export([b.done()], "genset")

# ---- day-tank: the genset's diesel day tank, 1.6 x 0.9 x 1.4 on a bund, a sight gauge and a fill neck --------------
if want("day-tank"):
    fresh(); M = pow_palette(); b = Builder("day-tank", M)
    b.box(-0.9, -0.55, 0, 0.9, 0.55, 0.2, "yellow")                                        # the bund (spill tray)
    b.box(-0.8, -0.45, 0.2, 0.8, 0.45, 1.4, "orange")   # fuel is orange (P1)
    b.box(-0.6, -0.451, 0.35, -0.55, -0.45, 1.3, "black")                                  # the sight gauge
    b.box(-0.6, -0.452, 0.35, -0.55, -0.451, 0.75, "rust")                                 # what's left in it
    b.cyl(0.5, 0.0, 1.4, 1.55, 0.06, "steel", 12)
    b.tube((0.8, 0.2, 0.5), (1.1, 0.2, 0.5), 0.03, "steel", 8)
    export([b.done()], "day-tank")

# ---- breaker-cabinet: one zone's breaker, 0.9 x 0.5 x 2.1: a grey switchgear section with a big throw handle (shown
# DOWN, off), a lamp pair over it, a label frame at eye height (the plate is a decal). The game throws it ------------
if want("breaker-cabinet"):
    fresh(); M = pow_palette(); b = Builder("breaker-cabinet", M)
    b.box(-0.45, -0.25, 0.08, 0.45, 0.25, 2.1, "grey")
    b.box(-0.45, -0.25, 0, 0.45, 0.25, 0.08, "dark")                                       # plinth
    b.box(-0.42, -0.252, 1.0, 0.42, -0.25, 1.02, "dark"); b.box(-0.42, -0.252, 0.5, 0.42, -0.25, 0.52, "dark")
    b.box(-0.3, -0.27, 0.95, 0.3, -0.25, 1.85, "gunmetal")                                 # the breaker's escutcheon
    b.box(-0.04, -0.33, 1.05, 0.04, -0.27, 1.45, "gunmetal")                               # the handle's housing
    b.tube((0.0, -0.3, 1.2), (0.0, -0.62, 0.98), 0.025, "steel", 10)                       # the throw handle, down
    b.tube((-0.09, -0.62, 0.98), (0.09, -0.62, 0.98), 0.03, "red", 10)                     # its grip
    for (x, key) in ((-0.14, "lamp-green"), (0.14, "lamp-red")):
        b.tube((x, -0.27, 1.72), (x, -0.3, 1.72), 0.035, key, 12)
    b.box(-0.22, -0.258, 1.52, 0.22, -0.25, 1.62, "white")                                 # the label frame
    b.box(0.32, -0.27, 1.1, 0.36, -0.25, 1.3, "steel")                                     # the door's latch
    export([b.done()], "breaker-cabinet")

# ---- boiler: a fire-tube boiler, 2.0 x 4.6 x 2.6: the shell on two saddles, the burner on the front (-y) end, the
# flue rising from the back, the gauges and the safety valve on top ------------------------------------------------
if want("boiler"):
    fresh(); M = pow_palette(); b = Builder("boiler", M)
    R, L, Z = 0.9, 4.0, 1.25
    b.tube((0, -L / 2, Z), (0, L / 2, Z), R, "insul", 32)                                   # the jacketed shell
    for y in (-L / 2 + 0.02, -1.0, 0.0, 1.0, L / 2 - 0.02):
        ring(b, 0, y, Z, R, "y", 0.02, "steel", 32, 0.05)                                  # the jacket bands
    for y in (-1.4, 1.4):
        b.box(-0.75, y - 0.12, 0, 0.75, y + 0.12, Z - 0.55, "gunmetal")                    # saddles
    b.box(-0.6, -L / 2 - 0.55, 0.5, 0.6, -L / 2, 1.9, "red")                               # the burner housing
    b.tube((0, -L / 2 - 0.55, 1.2), (0, -L / 2 - 0.85, 1.2), 0.22, "gunmetal", 16)         # its fan cone
    b.box(0.35, -L / 2 - 0.58, 1.4, 0.55, -L / 2 - 0.55, 1.75, "black")                    # its control box
    b.tube((0, L / 2 - 0.3, Z + R), (0, L / 2 - 0.3, Z + R + 1.4), 0.25, "galv", 20)        # the flue
    b.cyl(-0.3, -1.2, Z + R - 0.05, Z + R + 0.35, 0.05, "steel", 10)                       # the safety valve
    b.cyl(-0.3, -1.2, Z + R + 0.35, Z + R + 0.42, 0.08, "red", 12)
    for (x, y) in ((0.35, -1.6), (0.5, -1.2)):                                             # gauges on stalks
        b.cyl(x, y, Z + R - 0.05, Z + R + 0.25, 0.02, "steel", 8)
        b.tube((x, y - 0.03, Z + R + 0.33), (x, y + 0.03, Z + R + 0.33), 0.08, "white", 16)
    b.tube((0.7, 0.5, Z - 0.5), (1.1, 0.5, Z - 0.5), 0.08, "green", 12)                    # feed water out the side
    export([b.done()], "boiler")

# ---- pipe-rack: a 4 m wall run of colour-coded pipe on brackets (wall at +y), four lines: fire (red), chilled water
# (green), compressed air (blue), and a big galvanised main; flanges every 2 m -------------------------------------
if want("pipe-rack"):
    fresh(); M = pow_palette(); b = Builder("pipe-rack", M)
    L = 4.0
    for x in (-1.6, 0.0, 1.6):
        b.box(x - 0.03, 0.0, 0.0, x + 0.03, 0.04, 3.2, "gunmetal")                         # unistrut uprights on the wall
        for z in (0.9, 1.6, 2.3, 2.9):
            b.box(x - 0.03, -0.42, z - 0.03, x + 0.03, 0.0, z, "gunmetal")                 # the brackets
    lines = ((0.9, 0.14, "galv", -0.22), (1.6, 0.08, "green", -0.2), (2.3, 0.07, "red", -0.18), (2.9, 0.05, "blue", -0.14))
    for (z, r, key, y) in lines:
        zc = z + r
        b.tube((-L / 2, y, zc), (L / 2, y, zc), r, key, 16)
        for x in (-L / 2 + 0.03, 0.0, L / 2 - 0.03):
            ring(b, x, y, zc, r, "x", 0.035, key, 16, 0.05)
    export([b.done()], "pipe-rack")

# ---- pipe-main: a free-standing 4 m run of big pipe on two floor stands (along x), for the gallery floor ------------
if want("pipe-main"):
    fresh(); M = pow_palette(); b = Builder("pipe-main", M)
    R, Z = 0.3, 0.7
    b.tube((-2.0, 0, Z), (2.0, 0, Z), R, "galv", 24)
    for x in (-1.98, 0.0, 1.98): ring(b, x, 0, Z, R, "x", 0.05, "galv", 24, 0.06)
    for x in (-1.2, 1.2):
        b.box(x - 0.05, -0.3, 0, x + 0.05, 0.3, Z - R + 0.02, "gunmetal")
        b.box(x - 0.2, -0.35, 0, x + 0.2, 0.35, 0.03, "gunmetal")
    export([b.done()], "pipe-main")

# ---- catwalk: a 4 m section of steel catwalk at 2.4 m, 1.0 wide: a dark grating deck on two posts, toe boards and a
# handrail on its open (-y) side (its back runs along a wall or the gensets) ---------------------------------------
if want("catwalk"):
    fresh(); M = pow_palette(); b = Builder("catwalk", M)
    L, Wd, Z = 4.0, 1.0, 2.4
    b.box(-L / 2, -Wd / 2, Z - 0.05, L / 2, Wd / 2, Z, "dark")                              # the grating
    for k in range(int(L / 0.25) + 1):                                                     # its bearing bars, under
        x = -L / 2 + k * 0.25
        b.box(x - 0.01, -Wd / 2, Z - 0.12, x + 0.01, Wd / 2, Z - 0.05, "gunmetal")
    for y in (-Wd / 2, Wd / 2):
        b.box(-L / 2, y - 0.03, Z - 0.2, L / 2, y + 0.03, Z - 0.05, "yellow")              # the stringers
        b.box(-L / 2, y - 0.005, Z, L / 2, y + 0.005, Z + 0.1, "yellow")                   # toe boards
    for x in (-L / 2 + 0.05, 0.0, L / 2 - 0.05):
        b.box(x - 0.04, -0.04, 0, x + 0.04, 0.04, Z - 0.2, "gunmetal")                     # the posts
        b.box(x - 0.02, -Wd / 2 - 0.02, Z, x + 0.02, -Wd / 2 + 0.02, Z + 1.1, "yellow")     # rail stanchions
    for z in (Z + 0.55, Z + 1.1):
        b.tube((-L / 2, -Wd / 2, z), (L / 2, -Wd / 2, z), 0.022, "yellow", 8)               # the rails
    export([b.done()], "catwalk")

# ---- floor-grate: a 1.2 x 1.2 steel grating cover in its frame, flush with the floor ------------------------------
if want("floor-grate"):
    fresh(); M = pow_palette(); b = Builder("floor-grate", M)
    b.box(-0.6, -0.6, 0, 0.6, 0.6, 0.004, "black")
    for k in range(13):
        v = -0.6 + k * 0.1
        b.box(v - 0.008, -0.6, 0.004, v + 0.008, 0.6, 0.02, "gunmetal")
    for y in (-0.6, 0.6):
        b.box(-0.62, y - 0.02, 0, 0.62, y + 0.02, 0.02, "steel")
    for x in (-0.6, 0.6):
        b.box(x - 0.02, -0.62, 0, x + 0.02, 0.62, 0.02, "steel")
    export([b.done()], "floor-grate")

# ---- steel-stair: one straight flight of steel stairs, 1.4 wide, rising 1.2 m over 2.1 m toward +y, with handrails
# (the service stair is built of these and landings) --------------------------------------------------------------
if want("steel-stair"):
    fresh(); M = pow_palette(); b = Builder("steel-stair", M)
    n, rise, run, Wd = 7, 1.2, 2.1, 1.4
    for k in range(n):
        y0 = -run / 2 + k * run / n; z = (k + 1) * rise / n
        b.box(-Wd / 2, y0, z - 0.04, Wd / 2, y0 + run / n + 0.02, z, "dark")              # treads (grating)
    for x in (-Wd / 2 - 0.02, Wd / 2 + 0.02):
        for k in range(n):
            y0 = -run / 2 + k * run / n
            b.box(x - 0.02, y0, k * rise / n, x + 0.02, y0 + run / n, (k + 1) * rise / n + 0.1, "yellow")   # stringers
        b.tube((x, -run / 2, 1.0), (x, run / 2, rise + 1.0), 0.022, "yellow", 8)           # handrails
        for y in (-run / 2, run / 2):
            zz = (y + run / 2) / run * rise
            b.box(x - 0.02, y - 0.02, zz, x + 0.02, y + 0.02, zz + 1.0, "yellow")
    export([b.done()], "steel-stair")
