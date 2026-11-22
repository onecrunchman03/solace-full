# SURVIVORZ: the deep's own pieces (2026-10-27; docs/survivorz/REFERENCES.md round twelve): the freight lift's car with
# its lattice gate, the caged ladder from the plant grate down to the tunnel junction, a bulkhead door set in a tunnel
# wall, and a 1920s shopfront the city buried when it built the viaducts over it (Underground Atlanta, D16). Each faces
# -y (Blender) = +z in the game.
#
#   blender -b --factory-startup --python scripts/survivorz/make-deep.py [-- <id> ...]
#   -> assets/downloads/survivorz/originals/inbox/ready/<id>.glb
import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
from make_lib import fresh, mat, palette, Builder, export

ONLY = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def want(name): return not ONLY or name in ONLY

def deep_palette():
    M = palette()
    M.update({
        "car": mat("lift_steel", (0.3, 0.31, 0.32), 0.55, 0.6),
        "floorplate": mat("lift_floor", (0.12, 0.12, 0.12), 0.7, 0.6),
        "gunmetal": mat("gunmetal", (0.16, 0.17, 0.18), 0.45, 0.5),
        "galv": mat("galvanised", (0.38, 0.39, 0.4), 0.5, 0.7),
        "yellow": mat("hazard_yellow", (0.62, 0.42, 0.01), 0.5),
        "cream": mat("bulkhead_cream", (0.55, 0.52, 0.42), 0.55, 0.3),
        "red": mat("signal_red", (0.45, 0.02, 0.015), 0.45),
        "brick": mat("old_brick", (0.24, 0.09, 0.05), 0.85),
        "granite": mat("granite", (0.32, 0.31, 0.3), 0.7),
        "timber": mat("shop_timber", (0.09, 0.05, 0.03), 0.7),
        "iron": mat("cast_iron", (0.04, 0.045, 0.05), 0.6, 0.4),
        "grime-glass": mat("glass_grimed", (0.15, 0.16, 0.14), 0.4, 0.0, alpha=0.75),
    })
    return M

# ---- freight-car: the lift car, 4.0 wide x 5.0 deep x 3.0 tall, parked at the bottom; steel-panelled side and back
# walls, a chequer floor with hazard edging at the mouth, a caged light in the roof, the folding lattice gate drawn
# half across its open front (-y) -------------------------------------------------------------------------------------
if want("freight-car"):
    fresh(); M = deep_palette(); b = Builder("freight-car", M)
    W, D, H = 4.0, 5.0, 3.0
    b.box(-W / 2, -D / 2, 0, W / 2, D / 2, 0.08, "floorplate")
    for k in range(10): b.box(-W / 2 + k * 0.4, -D / 2, 0.08, -W / 2 + k * 0.4 + 0.2, -D / 2 + 0.15, 0.085, "yellow")
    b.box(-W / 2, D / 2 - 0.05, 0, W / 2, D / 2, H, "car")                              # the back wall
    for x in (-W / 2, W / 2 - 0.05):
        b.box(x, -D / 2, 0, x + 0.05, D / 2, H, "car")                                  # the side walls
        for y in (-1.5, -0.5, 0.5, 1.5):
            b.box(x - 0.005 if x < 0 else x + 0.05, y - 0.01, 0.1, x + 0.055 if x < 0 else x + 0.055, y + 0.01, H - 0.1, "gunmetal")   # panel seams
        b.box(x - 0.02 if x < 0 else x + 0.05, -D / 2, 0.9, x + 0.07 if x < 0 else x + 0.1, D / 2, 1.0, "galv")   # the bump rail
    b.box(-W / 2, -D / 2, H - 0.05, W / 2, D / 2, H, "car")                              # the roof
    b.box(-0.5, -0.2, H - 0.15, 0.5, 0.2, H - 0.05, "gunmetal")                          # the light's cage plate
    b.box(W / 2 - 0.35, -D / 2 + 0.2, 1.1, W / 2 - 0.06, -D / 2 + 0.35, 1.6, "gunmetal")  # the car's button box
    for (z, key) in ((1.45, "red"), (1.3, "white"), (1.2, "white")):
        b.tube((W / 2 - 0.07, -D / 2 + 0.27, z), (W / 2 - 0.1, -D / 2 + 0.27, z), 0.025, key, 10)
    # the lattice gate: crossed steel straps folded to one side, half closed
    gx0, gx1 = -W / 2 + 0.1, 0.2
    for k in range(9):
        x = gx0 + k * (gx1 - gx0) / 8
        b.box(x - 0.015, -D / 2 + 0.02, 0.1, x + 0.015, -D / 2 + 0.06, 2.4, "gunmetal")
    for k in range(8):
        xa = gx0 + k * (gx1 - gx0) / 8; xb = gx0 + (k + 1) * (gx1 - gx0) / 8
        for (za, zb) in ((0.2, 1.2), (1.2, 2.2), (1.2, 0.2), (2.2, 1.2)):
            b.tube((xa, -D / 2 + 0.04, za), (xb, -D / 2 + 0.04, zb), 0.01, "gunmetal", 6)
    b.box(-W / 2, -D / 2, 2.4, W / 2, -D / 2 + 0.08, 2.5, "gunmetal")                   # the gate's track
    export([b.done()], "freight-car")

# ---- cage-ladder: an 8.4 m galvanised ladder with a safety cage from 2.2 m up, fixed to the wall at +y on brackets -------
if want("cage-ladder"):
    fresh(); M = deep_palette(); b = Builder("cage-ladder", M)
    H = 8.4
    for x in (-0.22, 0.22):
        b.box(x - 0.025, -0.2, 0, x + 0.025, -0.15, H, "galv")                          # the stiles
    for k in range(int(H / 0.3)):
        z = 0.3 + k * 0.3
        b.tube((-0.22, -0.175, z), (0.22, -0.175, z), 0.012, "galv", 6)                  # rungs
    for z in (1.0, 3.0, 5.0, 7.0):
        for x in (-0.22, 0.22): b.box(x - 0.02, -0.15, z - 0.02, x + 0.02, 0.0, z + 0.02, "galv")   # wall brackets
    for z in [2.2 + k * 0.9 for k in range(7)]:                                          # the cage hoops
        for a in range(12):
            t0, t1 = math.pi * a / 12, math.pi * (a + 1) / 12
            b.tube((0.38 * math.cos(t0), -0.18 - 0.38 * math.sin(t0), z), (0.38 * math.cos(t1), -0.18 - 0.38 * math.sin(t1), z), 0.012, "galv", 6)
    for a in range(5):                                                                   # the cage's verticals
        t = math.pi * (a + 0.5) / 5
        b.box(0.38 * math.cos(t) - 0.012, -0.18 - 0.38 * math.sin(t) - 0.012, 2.2, 0.38 * math.cos(t) + 0.012, -0.18 - 0.38 * math.sin(t) + 0.012, H, "galv")
    export([b.done()], "cage-ladder")

# ---- bulkhead-door: a cream steel bulkhead door in its frame, 1.1 x 2.1, set flush in a wall (+y), shut, with its red
# handwheel and stencil plate (D19) ---------------------------------------------------------------------------------
if want("bulkhead-door"):
    fresh(); M = deep_palette(); b = Builder("bulkhead-door", M)
    b.box(-0.7, -0.08, 0, 0.7, 0.0, 2.4, "gunmetal")                                     # the frame
    b.box(-0.55, -0.12, 0.12, 0.55, -0.08, 2.22, "cream")                                # the leaf
    for z in (0.5, 1.2, 1.9):
        b.box(-0.53, -0.125, z - 0.03, 0.53, -0.12, z + 0.03, "cream")                   # its ribs
    for x in (-0.62, 0.62):
        for z in (0.5, 1.9): b.box(x - 0.04, -0.15, z - 0.08, x + 0.04, -0.08, z + 0.08, "gunmetal")   # dogs
    b.cyl(0, -0.13, 1.15, 1.15, 0.0, "red")
    b.tube((0, -0.12, 1.15), (0, -0.26, 1.15), 0.025, "gunmetal", 8)                     # the spindle
    for a in range(16):
        t0, t1 = 2 * math.pi * a / 16, 2 * math.pi * (a + 1) / 16
        b.tube((0.22 * math.cos(t0), -0.26, 1.15 + 0.22 * math.sin(t0)), (0.22 * math.cos(t1), -0.26, 1.15 + 0.22 * math.sin(t1)), 0.018, "red", 6)
    for a in range(3):
        t = 2 * math.pi * a / 3
        b.tube((0, -0.26, 1.15), (0.22 * math.cos(t), -0.26, 1.15 + 0.22 * math.sin(t)), 0.012, "red", 6)
    b.box(-0.3, -0.122, 1.75, 0.3, -0.12, 1.95, "white")                                 # the stencil plate
    export([b.done()], "bulkhead-door")

# ---- storefront: a 1920s shopfront buried under the viaducts, 4.2 wide x 4.0 tall, its face at -y and the tunnel wall
# behind: brick piers with cast-iron pilasters, a granite lintel, a timber window bay gone black with grime, the shop
# door, a dead gas lamp on a bracket (D16) ----------------------------------------------------------------------------
if want("storefront"):
    fresh(); M = deep_palette(); b = Builder("storefront", M)
    W, H = 4.2, 4.0
    b.box(-W / 2, -0.05, 0, W / 2, 0.0, H, "brick")                                      # the backing face
    for x in (-W / 2, W / 2 - 0.45):
        b.box(x, -0.3, 0, x + 0.45, 0.0, H - 0.6, "brick")                               # the piers
        b.box(x + 0.15, -0.36, 0, x + 0.3, -0.3, H - 0.6, "iron")                        # cast-iron pilasters
        b.box(x + 0.1, -0.4, H - 0.75, x + 0.35, -0.3, H - 0.6, "iron")                  # their caps
    b.box(-W / 2, -0.35, H - 0.6, W / 2, 0.0, H, "granite")                               # the lintel
    b.box(-W / 2 + 0.45, -0.2, 0, W / 2 - 0.45, -0.05, 0.6, "timber")                    # the stall riser
    b.box(-W / 2 + 0.45, -0.14, 0.6, 0.5, -0.12, H - 0.75, "grime-glass")                # the shop window
    for x in (-W / 2 + 0.45, -0.6, 0.5): b.box(x, -0.2, 0.6, x + 0.08, -0.05, H - 0.75, "timber")   # its frame
    b.box(-W / 2 + 0.45, -0.2, 2.3, 0.5, -0.05, 2.38, "timber")                           # the transom bar
    b.box(0.58, -0.12, 0, W / 2 - 0.5, -0.08, 2.4, "timber")                             # the shop door
    b.box(0.68, -0.13, 1.3, 1.4, -0.12, 2.2, "grime-glass")
    b.tube((W / 2 - 0.2, -0.3, 2.9), (W / 2 - 0.2, -0.7, 2.9), 0.02, "iron", 8)           # the gas lamp's bracket
    b.cyl(W / 2 - 0.2, -0.7, 2.55, 2.85, 0.1, "grime-glass", 8)
    b.cyl(W / 2 - 0.2, -0.7, 2.85, 2.95, 0.13, "iron", 8)
    export([b.done()], "storefront")
