# SURVIVORZ, GLENRIDGE HALL: what the game's design asks of the build (Josh, Nov 13 2026: "think resident evil
# one"; GLENRIDGE.md, "Josh's design"). Run by build.py after stair.py, in its namespace.
#
#   the hearth stair  the hearth stone in the inglenook sinks into a steep stone stair down to a room under the
#                     great hall. In the stills the floor is whole (the house as photographed); in the game build
#                     the floor has the hole and the stone is its own object ("dyn-hearth-stone") the page moves.
#   the hidden study  what is down there: the desk and the journals (the proof), shelves, one lamp.
#   the gate          two stone piers with lanterns where the run starts, on the drive.
#
# What a body stands at (crests, the car, planks, the plant, keys, fuel) is placed here too, each recorded in SPOTS
# for the map file: (id, kind, room, (x, y, z) of the thing, (x, y) to stand at), Blender coords.
GAME_ = bool(os.environ.get("GLEN_GAME"))
SPOTS = []

# ---- the hearth stair --------------------------------------------------------------------------------------------
SX0, SX1, SY0, SY1 = -1.15, 0.85, 12.6, 13.5                 # the hearth stone: the floor that opens
NR = 12; RISE = (HALL_Z - BF) / NR; TREAD = 0.22; BOTX = SX0 + TREAD * (NR - 1)
with C():
    HOLES.append(("hearth-stone", 0, HALL_Z, [(SX0, SY0), (SX1, SY0), (SX1, SY1), (SX0, SY1)]))
    STAIRS.append(("hearth-stair", 0, -1, [(-1.7, 13.05, HALL_Z), (SX0, 13.05, HALL_Z), (BOTX, 13.05, BF), (1.8, 13.05, BF)]))
    gs = G("stairs-1")
    for i in range(NR - 1):                                    # eleven treads; each a block down to the floor (a solid stone stair)
        gs.box(SX0 + TREAD * i, SY0, BF, SX0 + TREAD * (i + 1), SY1, HALL_Z - RISE * (i + 1), "flag")
    def ring(g, x0, y0, x1, y1, z, mat, up):
        n = (0, 0, 1) if up else (0, 0, -1)
        for a0, b0, a1, b1 in ((x0, y0, x1, SY0), (x0, SY1, x1, y1), (x0, SY0, SX0, SY1), (SX1, SY0, x1, SY1)):
            g.face([(a0, b0, z), (a1, b0, z), (a1, b1, z), (a0, b1, z)], mat, n)
    ring(G("ceil-1"), -2.3, 12.1, 2.3, 14.3, BF + 2.5, "stoneblock", False)          # the lower room's ceiling, round the well
    gw = G("wall-1")                                           # the well's own sides, from the hall's floor down to that ceiling
    for (a, b), (c, d), n in (((SX0, SY0), (SX1, SY0), (0, 1, 0)), ((SX0, SY1), (SX1, SY1), (0, -1, 0)), ((SX0, SY0), (SX0, SY1), (1, 0, 0)), ((SX1, SY0), (SX1, SY1), (-1, 0, 0))):
        gw.face([(a, b, BF + 2.5), (c, d, BF + 2.5), (c, d, HALL_Z - 0.06), (a, b, HALL_Z - 0.06)], "stoneblock", n)
    if GAME_:
        ring(G("floor0"), -2.3, 12.1, 2.3, 14.3, HALL_Z, "flag", True)              # the inglenook's floor, round the hole
        G("dyn-hearth-stone").box(SX0, SY0, HALL_Z - 0.06, SX1, SY1, HALL_Z, "flag")

    # ---- the hidden study: panelled, low, one lamp; the desk with the journals; shelves; the long table ----
    put("WoodenTable_03", 0.0, 7.0, BF, 0, 1.25, lvl=-1); put("WoodenChair_01", 0.0, 6.35, BF, 90, 0.55, lvl=-1)
    gj = G("dress-1")
    for k, (dx, dy, w, h) in enumerate(((-0.45, 0.05, 0.22, 0.03), (-0.44, 0.06, 0.2, 0.035), (0.1, -0.05, 0.3, 0.02), (0.5, 0.1, 0.18, 0.04))):      # the journals
        zt = BF + 0.78 + (0.03 if k == 1 else 0.0)
        gj.box(dx - w / 2, 7.0 + dy - 0.14, zt, dx + w / 2, 7.0 + dy + 0.14, zt + h, ("red", "oakdark", "lace", "heraldblue")[k])
    SPOTS.append(("journals", "proof", "hidden-study", (0.0, 7.0, BF + 0.8), (0.0, 5.95)))
    for x in (-4.55, 4.55):
        for y in (6.6, 8.6, 10.6): put("GothicCabinet_01", x, y, BF, 0 if x < 0 else 180, lvl=-1)
    put("vintage_wooden_drawer_01", -3.2, 11.75, BF, 270, lvl=-1); put("ClassicConsole_01", 3.0, 5.55, BF, 90, lvl=-1)
    shade_lamp(3.0, 5.55, BF + top_of("ClassicConsole_01"), 30, lvl=-1)
    # THE STUDY, DRESSED (Nov 14 2026: the room the whole night leads to read as a store room): ledgers along the
    # south wall, the family on the north wall either side of the door, a rug under the desk, candles and a second
    # lamp on it
    bookcase(5.2 + 0.02, -4.3, 1.9, BF, BF + 2.1, 1, lvl=-1)
    rug(-2.4, 5.9, 2.4, 8.7, BF, "rug-08.jpg", lvl=-1)
    put("brass_candleholders", -0.78, 7.18, BF + 0.78, 270, 0.6, lvl=-1)
    shade_lamp(0.8, 7.12, BF + 0.78, 26, lvl=-1)
    hung("x", 12.1 - 0.07, -3.4, BF + 1.5, 0.8, -1, "portrait-03.jpg", lvl=-1); hung("x", 12.1 - 0.07, 3.4, BF + 1.5, 0.8, -1, "portrait-05.jpg", lvl=-1)

# ---- the gate: where the run starts -------------------------------------------------------------------------------
GATE_Y = -62.0; GATE_X = (-GATE_Y - 34) * 0.19                # the drive's own line (build.py)
gg_ = G("gate")
for sg in (-1, 1):
    x = GATE_X + sg * 3.4
    gg_.box(x - 0.45, GATE_Y - 0.45, -0.7, x + 0.45, GATE_Y + 0.45, 2.3, "pierstone"); gg_.box(x - 0.55, GATE_Y - 0.55, 2.3, x + 0.55, GATE_Y + 0.55, 2.45, "limestone")
    gg_.box(x - 0.16, GATE_Y - 0.16, 2.45, x + 0.16, GATE_Y + 0.16, 2.95, "iron"); lamp(x, GATE_Y, 2.72, 55, name="room-gate", bulb=True)
    for k in range(9):                                         # the iron gate, standing open back along the drive
        yy = GATE_Y - 0.5 - 0.3 * k
        gg_.box(x - sg * 0.5 - 0.015, yy - 0.015, -0.3, x - sg * 0.5 + 0.015, yy + 0.015, 1.9 + 0.25 * math.sin(math.pi * k / 8), "iron")
    for zz in (-0.1, 1.5): gg_.box(x - sg * 0.5 - 0.02, GATE_Y - 3.0, zz, x - sg * 0.5 + 0.02, GATE_Y - 0.45, zz + 0.05, "iron")

# ---- what a body works at ------------------------------------------------------------------------------------------
def room_(id): return next(r for r in ROOMS if r.id == id)
def spot(id, kind, room_id, fx, fy, up=0.9, casket=None, reach=0.75):
    """A place in a room, by how far across it (fx) and up it (fy) in its own frame; stood at from `reach` nearer
    the room's middle. `casket`: a small banded chest is built there to hold the thing."""
    r = room_(room_id); lvl = r.lvl
    with frame(*BLOCKS[r.blk][:3]):
        x = r.x0 + (r.x1 - r.x0) * fx; y = r.y0 + (r.y1 - r.y0) * fy; cx, cy = (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2; z = r.z + up
        if casket:
            w, d, h = casket; g = G("dress%d" % lvl); z = r.z + h
            g.box(x - w / 2, y - d / 2, r.z, x + w / 2, y + d / 2, r.z + h, "oakdark")
            for bx in (-w * 0.3, w * 0.3): g.box(x + bx - 0.02, y - d / 2 - 0.006, r.z, x + bx + 0.02, y + d / 2 + 0.006, r.z + h + 0.006, "brassware")
        dd = math.hypot(cx - x, cy - y) or 1.0
        SPOTS.append((id, kind, room_id, (*T(x, y), z), T(x + (cx - x) / dd * reach, y + (cy - y) / dd * reach)))

spot("crest-vault", "crest", "vault", 0.82, 0.5, casket=(0.3, 0.44, 0.26))
spot("crest-library", "crest", "library", 0.25, 0.05, up=1.3)                 # behind the books on the south wall
spot("ledger", "ledger", "library", 0.72, 0.05, up=1.0)                       # the house ledger: it names the shelf
spot("crest-sitting", "crest", "mrs-glenn-sitting", 0.88, 0.9, casket=(0.44, 0.3, 0.26))
spot("crest-cell", "crest", "cellar-cell", 0.8, 0.5, casket=(0.3, 0.44, 0.26))
spot("butler-key", "key", "butlers-pantry", 0.5, 0.92, up=1.0)
spot("car-keys", "key", "mr-glenn-bedroom", 0.08, 0.5, up=0.8)
spot("safe-cabinet", "loot", "servants-sitting", 0.9, 0.9, up=1.0)
with C():
    SPOTS.append(("front-bolt", "bolt", "vestibule", (0.2, -3.5, 1.1), (0.2, -2.75)))
    SPOTS.append(("crest-sockets", "sockets", "inglenook", (0.0, 14.15, HALL_Z + 1.75), (1.55, 13.25)))

# the planks for the windows: a stack in the coal store
r_ = room_("coal-store")
with frame(*BLOCKS[r_.blk][:3]):
    gp = G("dress-1"); px, py = r_.x0 + 1.35, r_.y1 - 0.75
    for k in range(7):
        for j in range(3): gp.box(px - 1.1, py - 0.33 + 0.22 * j, r_.z + 0.045 * k, px + 1.1, py - 0.33 + 0.22 * j + 0.2, r_.z + 0.045 * k + 0.04, "timber")
    SPOTS.append(("planks", "planks", "coal-store", (*T(px, py), r_.z + 0.35), T(px, py - 0.95)))
# the plant: the house's switchboard on the furnace room's wall, slate with brass switches
r_ = room_("furnace-room")
with frame(*BLOCKS[r_.blk][:3]):
    gp = G("dress-1"); px, py = r_.x0 + 1.4, r_.y1 - 0.08
    gp.box(px - 0.6, py - 0.06, r_.z + 0.9, px + 0.6, py, r_.z + 1.9, "blacktile")
    for i in range(5):
        gp.box(px - 0.45 + 0.2 * i, py - 0.1, r_.z + 1.25, px - 0.4 + 0.2 * i, py - 0.06, r_.z + 1.6, "brassware"); gp.box(px - 0.46 + 0.2 * i, py - 0.12, r_.z + 1.58, px - 0.39 + 0.2 * i, py - 0.06, r_.z + 1.64, "oakdark")
    SPOTS.append(("plant", "plant", "furnace-room", (*T(px, py - 0.05), r_.z + 1.4), T(px, py - 0.85)))
# the fuel: a can at the back of the garage
with frame(*COT):
    gf = G("dress0"); fx_, fy_ = 12.5, 6.7
    gf.box(fx_ - 0.17, fy_ - 0.08, -0.44, fx_ + 0.17, fy_ + 0.08, 0.02, "red"); gf.box(fx_ - 0.05, fy_ - 0.03, 0.02, fx_ + 0.05, fy_ + 0.03, 0.09, "iron")
    SPOTS.append(("fuel", "fuel", "garage", (*T(fx_, fy_), 0.0), T(fx_, fy_ - 0.9)))

# ---- the car: a 1967 Camaro SS on the gravel past the porte-cochere ("1967 Chevrolet Camaro SS 350" by adrianaflak09,
# CC Attribution, sketchfab.com) ----
CAR = os.path.join(ASSETS, "set", "car", "camaro.glb"); CAR_AT = (8.4, -7.6, 90.0)
if os.path.exists(CAR):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=CAR)
    new = [o for o in bpy.data.objects if o not in before]; ms = [o for o in new if o.type == "MESH"]; rest = [o.name for o in new if o.type != "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in ms: o.select_set(True)
    bpy.context.view_layer.objects.active = ms[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM"); bpy.ops.object.join(); car = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for nm in rest:
        if nm in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects[nm], do_unlink=True)
    vs = car.data.vertices; x0 = min(v.co.x for v in vs); x1 = max(v.co.x for v in vs); y0 = min(v.co.y for v in vs); y1 = max(v.co.y for v in vs); z0 = min(v.co.z for v in vs)
    for v in vs: v.co.x -= (x0 + x1) / 2; v.co.y -= (y0 + y1) / 2; v.co.z -= z0
    car.name = "car-camaro"; car.data.name = "car-camaro"
    for c in list(car.users_collection): c.objects.unlink(car)
    FURN[0].objects.link(car); car.location = (CAR_AT[0], CAR_AT[1], -0.5); car.rotation_euler = (0, 0, math.radians(CAR_AT[2]))
    SPOTS.append(("car", "car", "forecourt", (CAR_AT[0], CAR_AT[1], 0.3), (CAR_AT[0] - 0.6, CAR_AT[1] - 1.75)))
else: print("NO CAR: %s is missing" % CAR)

# ---- where supplies are, beyond the furniture (the walk map makes a place to search of every cabinet, drawer chest,
# nightstand, console, bookshelf and crate): the kitchen's cupboards and knives, the bathrooms' cabinets, the
# garage's bench and wall, the vault's case, the furnace's tools. Ids start with what the rules know them by. ----
for sid, rid, fx, fy in (("kitchen-cupboard-1", "kitchen", 0.2, 0.08), ("kitchen-cupboard-2", "kitchen", 0.75, 0.08), ("kitchen-knife-block", "kitchen", 0.5, 0.92),
                         ("kitchen-pantry-1", "butlers-pantry", 0.2, 0.08), ("kitchen-larder-1", "larder", 0.5, 0.85),
                         ("bath-mr-glenn", "mr-glenn-bath", 0.5, 0.85), ("bath-mrs-glenn", "mrs-glenn-bath", 0.5, 0.85), ("bath-boys", "boys-bath-a", 0.5, 0.85),
                         ("bath-panelled", "panelled-bath", 0.5, 0.85), ("bath-suite", "suite-bath", 0.5, 0.85),
                         ("vault-case", "vault", 0.5, 0.88), ("cellar-furnace-tools", "furnace-room", 0.85, 0.1), ("bedroom-glenn-nightstand", "mr-glenn-bedroom", 0.9, 0.5)):
    spot(sid, "loot", rid, fx, fy, up=1.0)
with frame(*COT):
    for sid, gx, gy in (("garage-bench", 3.0, 6.6), ("garage-wall", 8.0, 6.8)):
        SPOTS.append((sid, "loot", "garage", (*T(gx, gy), 0.5), T(gx, gy - 0.9)))
