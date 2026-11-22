# SURVIVORZ: the security wing's own pieces (2026-10-27; docs/survivorz/REFERENCES.md round nine). The armoury's
# racks are built empty on purpose: the guards drew everything when they tried to hold the line, and the guns
# themselves are the game's (Josh's bought pack), never set dressing. Each faces -y (Blender) = +z in the game.
#
#   blender -b --factory-startup --python scripts/survivorz/make-sec.py [-- <id> ...]
#   -> assets/downloads/survivorz/originals/inbox/ready/<id>.glb
import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
from make_lib import fresh, mat, palette, Builder, export

ONLY = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def want(name): return not ONLY or name in ONLY

def sec_palette():
    M = palette()
    M.update({
        "gunmetal": mat("gunmetal", (0.16, 0.17, 0.18), 0.45, 0.5),
        "foam": mat("rack_foam", (0.015, 0.016, 0.018), 0.95),
        "yellow": mat("hazard_yellow", (0.62, 0.42, 0.01), 0.5),
        "red": mat("signal_red", (0.45, 0.02, 0.015), 0.45),
    })
    return M

# ---- weapon-rack: a 1.2 m steel rifle rack, 1.9 high: a foam-lined butt trough, a padded upper bar with ten
# notches and the locking bar unpinned; empty (they drew everything) -------------------------------------------------
if want("weapon-rack"):
    fresh(); M = sec_palette(); b = Builder("weapon-rack", M)
    W, D, H = 1.2, 0.4, 1.9
    b.box(-W / 2, D / 2 - 0.02, 0, W / 2, D / 2, H, "gunmetal")                         # the back panel
    for x in (-W / 2, W / 2 - 0.02):
        b.box(x, -D / 2, 0, x + 0.02, D / 2, H, "gunmetal")                              # the sides
    b.box(-W / 2, -D / 2, 0, W / 2, D / 2, 0.06, "gunmetal")
    b.box(-W / 2 + 0.02, -D / 2, 0.06, W / 2 - 0.02, D / 2 - 0.02, 0.2, "foam")           # the butt trough
    b.box(-W / 2 + 0.02, -D / 2, 1.18, W / 2 - 0.02, -D / 2 + 0.12, 1.26, "foam")         # the upper bar
    for k in range(10):
        x = -W / 2 + 0.11 + k * 0.109
        b.box(x - 0.025, -D / 2 - 0.001, 1.2, x + 0.025, -D / 2 + 0.1, 1.27, "dark")       # its notches
    b.box(W / 2 - 0.05, -D / 2 - 0.04, 0.25, W / 2 - 0.01, -D / 2 - 0.005, 1.3, "steel")    # the locking bar, unpinned, hanging at the side
    b.box(-W / 2 + 0.02, -D / 2, H - 0.3, W / 2 - 0.02, D / 2 - 0.02, H - 0.28, "gunmetal")  # the top shelf
    export([b.done()], "weapon-rack")

# ---- gear-rail: a 2.0 m wall rail of six heavy hooks for vests and helmets (wall at +y), hung at 1.7 -----------------------
if want("gear-rail"):
    fresh(); M = sec_palette(); b = Builder("gear-rail", M)
    b.box(-1.0, 0.0, 1.62, 1.0, 0.03, 1.72, "gunmetal")
    for k in range(6):
        x = -0.85 + k * 0.34
        b.tube((x, 0.0, 1.67), (x, -0.12, 1.67), 0.012, "steel", 8)
        b.tube((x, -0.12, 1.67), (x, -0.13, 1.72), 0.012, "steel", 8)
    export([b.done()], "gear-rail")

# ---- interview-table: a steel table bolted to the floor, 1.2 x 0.75, with its cuff ring in the middle --------------------
if want("interview-table"):
    fresh(); M = sec_palette(); b = Builder("interview-table", M)
    b.box(-0.6, -0.375, 0.72, 0.6, 0.375, 0.75, "steel")
    b.box(-0.08, -0.08, 0.0, 0.08, 0.08, 0.72, "steel")                                     # the pedestal
    b.box(-0.3, -0.3, 0.0, 0.3, 0.3, 0.02, "steel")                                         # its floor plate
    for (x, y) in ((-0.25, -0.25), (0.25, -0.25), (0.25, 0.25), (-0.25, 0.25)):
        b.cyl(x, y, 0.02, 0.03, 0.012, "dark", 8)                                           # the bolts
    for a in range(16):
        t0, t1 = 2 * math.pi * a / 16, 2 * math.pi * (a + 1) / 16
        b.tube((0.05 * math.cos(t0), 0.0, 0.76 + 0.05 * math.sin(t0) + 0.04), (0.05 * math.cos(t1), 0.0, 0.76 + 0.05 * math.sin(t1) + 0.04), 0.008, "steel", 6)
    export([b.done()], "interview-table")

# ---- cell-bench: a stainless bench along a cell wall, 1.8 long, 0.45 high, on two brackets (wall at +y) ----------------
if want("cell-bench"):
    fresh(); M = sec_palette(); b = Builder("cell-bench", M)
    b.box(-0.9, -0.2, 0.42, 0.9, 0.2, 0.46, "steel")
    b.box(-0.9, -0.22, 0.39, 0.9, -0.2, 0.46, "steel")
    for x in (-0.7, 0.7):
        b.box(x - 0.02, -0.15, 0.0, x + 0.02, 0.2, 0.42, "steel")
    export([b.done()], "cell-bench")

# ---- cleaning-bench: the armoury's gun-cleaning bench, 1.8 x 0.7, steel with a rubber mat, the clearing barrel beside it -
if want("cleaning-bench"):
    fresh(); M = sec_palette(); b = Builder("cleaning-bench", M)
    b.box(-0.9, -0.35, 0.86, 0.9, 0.35, 0.9, "gunmetal")
    b.box(-0.8, -0.3, 0.9, 0.6, 0.3, 0.905, "foam")                                         # the mat
    for (x, y) in ((-0.85, -0.3), (0.85, -0.3), (0.85, 0.3), (-0.85, 0.3)):
        b.box(x - 0.025, y - 0.025, 0, x + 0.025, y + 0.025, 0.86, "gunmetal")
    b.box(-0.85, -0.3, 0.2, 0.85, 0.3, 0.22, "gunmetal")
    b.cyl(1.25, 0.0, 0.0, 0.9, 0.22, "yellow", 24)                                           # the clearing barrel
    b.cyl(1.25, 0.0, 0.9, 0.95, 0.12, "dark", 16)
    b.box(1.03, -0.221, 0.5, 1.47, -0.22, 0.62, "red")
    export([b.done()], "cleaning-bench")
