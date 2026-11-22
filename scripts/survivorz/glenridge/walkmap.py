# SURVIVORZ, GLENRIDGE HALL: THE WALK MAP, cut from the house as built.
#
#   blender -b <assets>/set/glenridge-game.blend --python scripts/survivorz/glenridge/walkmap.py
#
# The bunker's walk map is worked out from its map data: every room there is a rectangle square to the grid. This
# house has two wings at 45 degrees and furniture set out by hand, so its walk map is read off the geometry itself:
# a cell (four to the metre, as the bunker's) is open if it lies inside a room's outline and nothing stands within a
# body's radius (0.3 m) of it between ankle and head height: walls, joinery, furniture, stair treads. Door leaves
# are left out (a door opens), and every way through a wall that the map records is cleared for the width a body
# can use, as the bunker's doors are.
#
# THEN IT WALKS IT: from the front door, cell to cell (never cutting a corner), up and down the stairs the map
# records, and says which rooms a body can reach, which it cannot, and which are cut in two by their furniture.
#
# Out: src/survivorz/glenridge-walk.json   {map, res, bodyR, floors: [{floor, level, y, origin, w, h, rows}], links, report}
#      docs/survivorz/plans/glenridge-walk-<level>.png   (green: reached; red: open but not reached; dark: blocked)
# Coordinates are the page's: x east, z south (the build's y, negated). floors[0] is the top, as the show counts.
import bpy, json, math, os, sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import floors as floor_rules                                                    # the floor under each room, for its footsteps (floors.py)
PLAN_FLOORS = floor_rules.plan_floors(os.path.join(os.path.dirname(os.path.abspath(__file__)), "plan.py"))

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
MAP = json.load(open(os.path.join(ROOT, "docs", "survivorz", "glenridge-map.json"), encoding="utf-8"))
RES = 4; R = 0.3; HEIGHTS = (0.35, 0.9, 1.45); CELL = 1 / RES
OUT_HEIGHTS = (0.8, 1.2, 1.6)          # out of doors a body steps over what is lower than its knee: kerbs, door steps, edging
OUT_SRC = os.environ.get("GLEN_WALK_OUT") or os.path.join(ROOT, "src", "survivorz"); os.makedirs(OUT_SRC, exist_ok=True)
LEVELS = [(1, "upper"), (0, "ground"), (-1, "basement")]                 # top first
SKIP = ("rain", "bolt", "mist", "cloudglow", "doors", "glass", "leafage", "shrubs", "ivy", "terrain", "ground", "roof", "chimney", "tile-")

rooms = {r["id"]: r for r in MAP["rooms"]}
def outline(r):                                                           # a room's outline in the page's (x, z)
    pts = r.get("polygon") or r.get("corners") or []
    if pts and len(pts[0]) == 3: return [(p[0], p[2]) for p in pts]
    if r.get("octagon"):
        c = r["octagon"]["centre"]; a = r["octagon"]["across"] / 2 / math.cos(math.radians(22.5))
        return [(c[0] + a * math.cos(math.radians(22.5 + 45 * i)), c[2] + a * math.sin(math.radians(22.5 + 45 * i))) for i in range(8)]
    return [(p[0], p[1]) for p in pts]
POLY = {id_: outline(r) for id_, r in rooms.items()}
def inside(p, poly):
    c = False
    for i in range(len(poly)):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % len(poly)]
        if (y1 > p[1]) != (y2 > p[1]) and p[0] < (x2 - x1) * (p[1] - y1) / (y2 - y1) + x1: c = not c
    return c
ORDER = [id_ for id_, r in rooms.items() if not r.get("outdoor")] + [id_ for id_, r in rooms.items() if r.get("outdoor")]      # the house first, then the grounds
BOX = {id_: (min(p[0] for p in POLY[id_]), min(p[1] for p in POLY[id_]), max(p[0] for p in POLY[id_]), max(p[1] for p in POLY[id_])) for id_ in ORDER if len(POLY[id_]) >= 3}
def room_at(lvl, x, z):
    for id_ in ORDER:
        r = rooms[id_]
        if r["level"] != lvl or id_ not in BOX: continue
        b = BOX[id_]
        if b[0] <= x <= b[2] and b[1] <= z <= b[3] and inside((x, z), POLY[id_]): return id_
    return None

# ---- everything a body cannot walk through, as one tree (Blender's x, y, z) ----
verts, polys = [], []
def take(o):
    me = o.data; mw = o.matrix_world; base = len(verts)
    verts.extend(mw @ v.co for v in me.vertices)
    polys.extend(tuple(base + i for i in p.vertices) for p in me.polygons)
for cname in ("glenridge", "furniture0", "furniture1", "furniture-1"):
    c = bpy.data.collections.get(cname)
    for o in (c.objects if c else ()):
        if o.type == "MESH" and not o.name.startswith(SKIP) and not o.name.startswith(("bedplant", "shrub_", "fern_", "dyn-", "leaves", "trees")): take(o)
# the trees that stand in the grounds a body can walk: their trunks (a scanned tree is cut off at head height first)
YX = [p[0] for id_ in ORDER if rooms[id_].get("outdoor") for p in POLY[id_]]; YZ = [p[1] for id_ in ORDER if rooms[id_].get("outdoor") for p in POLY[id_]]
ntree = 0
for o in list((bpy.data.collections.get("trees").objects if bpy.data.collections.get("trees") else ())) + [o for o in bpy.data.objects if o.name in ("trees",)]:
    if o.type != "MESH" or not YX: continue
    mw = o.matrix_world; base = len(verts); keep = {}
    if o.name != "trees" and not (min(YX) - 6 <= mw.translation.x <= max(YX) + 6 and min(YZ) - 6 <= -mw.translation.y <= max(YZ) + 6): continue
    for p in o.data.polygons:
        ws = [mw @ o.data.vertices[i].co for i in p.vertices]
        if min(w.z for w in ws) > 2.0: continue
        cx = sum(w.x for w in ws) / len(ws); cy = sum(w.y for w in ws) / len(ws)
        if not (min(YX) - 1 <= cx <= max(YX) + 1 and min(YZ) - 1 <= -cy <= max(YZ) + 1): continue
        idx = []
        for i, w in zip(p.vertices, ws):
            if i not in keep: keep[i] = len(verts); verts.append(w)
            idx.append(keep[i])
        polys.append(tuple(idx)); ntree += 1
print("trees: %d faces of trunk in the grounds" % ntree)
tree = BVHTree.FromPolygons(verts, polys)
print("the house: %d faces to walk round" % len(polys))

floors = []; grid = {}
for fi, (lvl, name) in enumerate(LEVELS):
    mine = [id_ for id_, r in rooms.items() if r["level"] == lvl and len(POLY[id_]) >= 3]
    xs = [p[0] for id_ in mine for p in POLY[id_]]; zs = [p[1] for id_ in mine for p in POLY[id_]]
    minX, minZ = math.floor(min(xs)) - 1, math.floor(min(zs)) - 1; W = int((math.ceil(max(xs)) + 1 - minX) * RES); H = int((math.ceil(max(zs)) + 1 - minZ) * RES)
    g = [[None] * W for _ in range(H)]                                    # None: not in a room; else [room, open]
    for j in range(H):
        z = minZ + (j + 0.5) * CELL
        for i in range(W):
            x = minX + (i + 0.5) * CELL; rid = room_at(lvl, x, z)
            if rid is None: continue
            fz = rooms[rid]["floor"]; ok = True
            for h in (OUT_HEIGHTS if rooms[rid].get("outdoor") else HEIGHTS):
                hit = tree.find_nearest(Vector((x, -z, fz + h)), R)
                if hit[0] is not None: ok = False; break
            see = ok or tree.find_nearest(Vector((x, -z, fz + 1.45)), 0.13)[0] is None      # what stands lower than the eye hides nothing
            g[j][i] = [rid, ok, see]
    grid[lvl] = dict(g=g, minX=minX, minZ=minZ, W=W, H=H, y={1: 3.4, 0: 0.0, -1: -3.0}[lvl], fi=fi, name=name)
def cell_of(lvl, x, z):
    G = grid[lvl]; return int((x - G["minX"]) * RES), int((z - G["minZ"]) * RES)
# ---- the ways through the walls: cleared for the width a body can use ----
cleared = 0; way_cells = []
for w in MAP["ways"]:
    if not w.get("at") or w["kind"] == "overlook": continue
    a = rooms.get(w["a"]); lvl = a["level"]; G = grid[lvl]; x0, z0 = w["at"][0], w["at"][2]; t = math.radians(w.get("turn", 0))
    best = None
    for along in ((math.cos(t), -math.sin(t)), (math.sin(t), math.cos(t))):          # the wall's line: one of these (the map's turn is the wall's own)
        n = (-along[1], along[0]); sides = {room_at(lvl, x0 + n[0] * s, z0 + n[1] * s) for s in (-0.7, 0.7)}
        score = (w["a"] in sides) + ((w["b"] in sides) or (w["b"] == "outside" and None in sides))
        if best is None or score > best[0]: best = (score, along, n)
    _, along, n = best; half = max(0.13, w["width"] / 2 - R)
    if abs(along[0] * along[1]) > 0.1: half = max(half, 0.27)          # a wall on the diagonal: narrower than this and the cells through it touch only at their corners
    if room_at(lvl, x0 + n[0] * 0.7, z0 + n[1] * 0.7) == w["a"] or room_at(lvl, x0 - n[0] * 0.7, z0 - n[1] * 0.7) == w["b"]: n = (-n[0], -n[1])      # the normal points from a into b
    if w["kind"] == "window":                                      # a broken window is climbed, not walked: the wall and its sill stay
        way_cells.append((w, lvl, cell_of(lvl, x0, z0), n)); continue
    k = -half
    while k <= half + 1e-6:
        far = 1.25 if (w["b"] == "outside" or rooms.get(w["b"], {}).get("outdoor") or a.get("outdoor")) else 0.75
        s = -far
        while s <= far + 1e-6:
            x, z = x0 + along[0] * k + n[0] * s, z0 + along[1] * k + n[1] * s; i, j = cell_of(lvl, x, z)
            if 0 <= i < G["W"] and 0 <= j < G["H"]:
                rid = room_at(lvl, x, z) or (G["g"][j][i][0] if G["g"][j][i] else None) or (w["a"] if s * 0 == 0 and abs(s) < 0.2 else None)
                if rid is None and w["b"] != "outside": rid = w["a"]
                # each side of the wall's line is its own room: where the outlines overlap, the far side of a doorway can
                # read as the near room, and the simulation would walk through the door and find no floor of the next room
                want = w["a"] if s < -0.1 else w["b"] if s > 0.1 else None
                if want and want != "outside" and rid in (None, w["a"], w["b"]): rid = want
                if want == "outside" and rid == w["a"]: rid = room_at(lvl, x0 + n[0] * 1.6, z0 + n[1] * 1.6)          # beyond an outside way: whichever yard lies there
                if rid is not None:
                    if not (G["g"][j][i] and G["g"][j][i][1]): cleared += 1
                    G["g"][j][i] = [rid, True, True]
            s += CELL / 2
        k += CELL / 2
    way_cells.append((w, lvl, cell_of(lvl, x0, z0), n))
print("ways cleared: %d cells opened across %d ways" % (cleared, len(way_cells)))

# floor that opens (the hearth stone): never walked over, shut or open
for h in MAP.get("holes", ()):
    G = grid[h["level"]]; hp = [(p[0], p[2]) for p in h["corners"]]; n = 0
    for j in range(G["H"]):
        for i in range(G["W"]):
            c = G["g"][j][i]
            if c and c[1] and inside((G["minX"] + (i + 0.5) * CELL, G["minZ"] + (j + 0.5) * CELL), [(p[0] - 0.0, p[1]) for p in hp]): c[1] = False; n += 1
    print("hole %s: %d cells shut" % (h["id"], n))

# ---- one room, one floor: outlines overlap at the hinges and the wing ends, so a room's open floor can come out in
# pieces, a few cells of it stranded the far side of a neighbour. The simulation walks inside one room at a time,
# so a stranded piece is given to the neighbour it touches most; what is left is each room in one piece. ----
healed = 0
for lvl, G in grid.items():
    g = G["g"]; W, H = G["W"], G["H"]
    for _ in range(8):
        comp = {}; sizes = []; by_room = {}
        for j in range(H):
            for i in range(W):
                c = g[j][i]
                if not (c and c[1]) or (i, j) in comp: continue
                cid = len(sizes); comp[(i, j)] = cid; stack = [(i, j)]; n = 0
                while stack:
                    a, b = stack.pop(); n += 1
                    for da, db in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        q = (a + da, b + db)
                        if 0 <= q[0] < W and 0 <= q[1] < H and q not in comp:
                            d = g[q[1]][q[0]]
                            if d and d[1] and d[0] == c[0]: comp[q] = cid; stack.append(q)
                sizes.append(n); by_room.setdefault(c[0], []).append(cid)
        main = {max(cids, key=lambda x: sizes[x]) for cids in by_room.values()}
        touch = {}                                                        # stranded piece -> {neighbouring room: cells of border}
        for (i, j), cid in comp.items():
            if cid in main: continue
            for da, db in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                q = (i + da, j + db); qc = comp.get(q)
                if qc is not None and qc != cid and (qc in main or sizes[qc] > sizes[cid]): t = touch.setdefault(cid, {}); r2 = g[q[1]][q[0]][0]; t[r2] = t.get(r2, 0) + 1
        if not touch: break
        give = {cid: max(t, key=t.get) for cid, t in touch.items()}
        for (i, j), cid in comp.items():
            if cid in give: g[j][i][0] = give[cid]; healed += 1
print("rooms made whole: %d cells of stranded floor given to the room they touch" % healed)

# ---- the stairs: a link between the cells nearest each end of the stair's line ----
def nearest_open(lvl, x, z, reach=1.6):
    G = grid[lvl]; ci, cj = cell_of(lvl, x, z); best = None; rr = int(reach * RES)
    for j in range(max(0, cj - rr), min(G["H"], cj + rr + 1)):
        for i in range(max(0, ci - rr), min(G["W"], ci + rr + 1)):
            c = G["g"][j][i]
            if c and c[1]:
                d = (i - ci) ** 2 + (j - cj) ** 2
                if best is None or d < best[0]: best = (d, i, j)
    return (best[1], best[2]) if best else None
links = []
for s in MAP["stairs"]:
    a, b = s["line"][0], s["line"][-1]; ca = nearest_open(s["fromLevel"], a[0], a[2]); cb = nearest_open(s["toLevel"], b[0], b[2])
    links.append(dict(id=s["id"], a=(s["fromLevel"], ca), b=(s["toLevel"], cb), line=s["line"]))
    if not ca or not cb: print("STAIR %s has no open floor at one end: %s %s" % (s["id"], ca, cb))

# ---- walk it from the front door ----
front = next(w for w in MAP["ways"] if w.get("id") == "front-door")
start = nearest_open(0, front["at"][0], front["at"][2] - 0.8) or nearest_open(0, front["at"][0], front["at"][2])
seen = {(0, start[0], start[1])}; stack = [(0, start[0], start[1])]
hop = {}
for l in links:
    if l["a"][1] and l["b"][1]:
        ka, kb = (l["a"][0], *l["a"][1]), (l["b"][0], *l["b"][1]); hop.setdefault(ka, []).append(kb); hop.setdefault(kb, []).append(ka)
def is_open(lvl, i, j):
    G = grid[lvl]
    if not (0 <= i < G["W"] and 0 <= j < G["H"]): return False
    c = G["g"][j][i]; return bool(c and c[1])
while stack:
    lvl, i, j = stack.pop()
    for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
        if not is_open(lvl, i + di, j + dj): continue
        if di and dj and not (is_open(lvl, i + di, j) and is_open(lvl, i, j + dj)): continue          # no cutting a corner
        k = (lvl, i + di, j + dj)
        if k not in seen: seen.add(k); stack.append(k)
    for k in hop.get((lvl, i, j), ()):
        if k not in seen: seen.add(k); stack.append(k)

# ---- the report, the pictures, the file ----
report = {}
for lvl, G in grid.items():
    for j in range(G["H"]):
        for i in range(G["W"]):
            c = G["g"][j][i]
            if not c: continue
            r = report.setdefault(c[0], dict(level=lvl, cells=0, open=0, reached=0))
            r["cells"] += 1; r["open"] += c[1]; r["reached"] += (lvl, i, j) in seen
unreached = sorted(id_ for id_, r in report.items() if r["reached"] == 0)
partly = sorted((id_, r["open"] - r["reached"]) for id_, r in report.items() if r["reached"] and r["open"] - r["reached"] > 8)
missing = sorted(id_ for id_ in rooms if id_ not in report)
print("WALKED FROM THE FRONT DOOR: %d of %d rooms reached" % (len(report) - len(unreached), len(report)))
if unreached: print("  NOT REACHED: " + ", ".join(unreached))
if partly: print("  PARTLY CUT OFF (open cells a body cannot get to): " + ", ".join("%s %d" % p for p in partly))
if missing: print("  no outline in the map: " + ", ".join(missing))
tight = sorted((id_, round(100 * r["open"] / r["cells"])) for id_, r in report.items() if r["open"] / r["cells"] < 0.35)
if tight: print("  under 35 per cent of the floor free: " + ", ".join("%s %d%%" % t for t in tight))

for lvl, G in grid.items():
    W, H = G["W"], G["H"]; S = 3; im = bpy.data.images.new("walk-%s" % G["name"], W * S, H * S, alpha=False); px = [0.0] * (W * S * H * S * 4)
    for j in range(H):
        for i in range(W):
            c = G["g"][j][i]
            col = (0.03, 0.03, 0.035) if not c else (0.16, 0.14, 0.13) if not c[1] else (0.25, 0.7, 0.35) if (lvl, i, j) in seen else (0.85, 0.2, 0.15)
            for dj in range(S):
                row = ((H - 1 - j) * S + dj) * W * S
                for di in range(S):
                    k = (row + i * S + di) * 4; px[k:k + 4] = (*col, 1.0)
    im.pixels = px; im.filepath_raw = os.path.join(ROOT, "docs", "survivorz", "plans", "glenridge-walk-%s.png" % G["name"]); im.file_format = "PNG"; im.save()

out_floors = []
for lvl, name in LEVELS:
    G = grid[lvl]; rows = []
    for j in range(G["H"]):
        s = ""; run = 0; ch = ""
        for i in range(G["W"]):
            c = "." if (G["g"][j][i] and G["g"][j][i][1] and (lvl, i, j) in seen) else "#"          # floor no body can get to (shut in by furniture) is not floor
            if c == ch: run += 1
            else:
                if run: s += "%d%s" % (run, ch)
                ch = c; run = 1
        rows.append(s + "%d%s" % (run, ch))
    out_floors.append(dict(floor=G["fi"], level=lvl, name=name, y=G["y"], origin=[G["minX"], G["minZ"]], w=G["W"], h=G["H"], rows=rows))
ROOM_INDEX = {}
for id_ in rooms:
    if len(POLY[id_]) >= 3: ROOM_INDEX[id_] = len(ROOM_INDEX)                    # the order glenridge-site.json lists them in
for f, (lvl, name) in zip(out_floors, LEVELS):                                   # which room each cell is: runs of [count, room] (-1 none)
    G = grid[lvl]; label = []
    for j in range(G["H"]):
        row = []; run = 0; cur = None
        for i in range(G["W"]):
            c = G["g"][j][i]; v = ROOM_INDEX[c[0]] if c else -1
            if v == cur: run += 1
            else:
                if run: row += [run, cur]
                cur = v; run = 1
        label.append(row + [run, cur])
    f["label"] = label
# ---- for the simulation (sim/nav.ts takes these in place of the bunker's): the sight grid, and the house as rooms and doors ----
FLOOR_OF = {1: 0, 0: 1, -1: 2}
sight_floors = []
for lvl, name in LEVELS:
    G = grid[lvl]; rows = []
    for j in range(G["H"]):
        srow = ""; run = 0; ch = ""
        for i in range(G["W"]):
            c = "." if (G["g"][j][i] and G["g"][j][i][2]) else "#"
            if c == ch: run += 1
            else:
                if run: srow += "%d%s" % (run, ch)
                ch = c; run = 1
        rows.append(srow + "%d%s" % (run, ch))
    sight_floors.append(dict(floor=G["fi"], y=G["y"], origin=[G["minX"], G["minZ"]], w=G["W"], h=G["H"], rows=rows))
json.dump(dict(map="glenridge", floors=sight_floors), open(os.path.join(OUT_SRC, "glenridge-sight.json"), "w", encoding="utf-8"), separators=(",", ":"))
site_rooms = []
for id_, r in rooms.items():
    p = POLY[id_]
    if len(p) < 3: continue
    xs = [q[0] for q in p]; zs = [q[1] for q in p]
    site_rooms.append(dict(id=id_, name=r["name"], zone="glenridge", kind="yard" if r.get("outdoor") else "room", floor=FLOOR_OF[r["level"]], surface=floor_rules.surface_of(id_, PLAN_FLOORS.get(id_), bool(r.get("outdoor"))), spots=[dict(id=sp["id"], kind=sp["kind"]) for sp in MAP.get("spots", ()) if sp["room"] == id_], y=r["floor"], **({"outdoor": True} if r.get("outdoor") else {}), **({"h": r["height"]} if r.get("height") else {}),
                           rect=dict(x=round(min(xs), 3), y=round(min(zs), 3), w=round(max(xs) - min(xs), 3), h=round(max(zs) - min(zs), 3)), poly=[[round(q[0], 3), round(q[1], 3)] for q in p]))
site_doors = []; used = set()
KIND = {"door": "door", "archdoor": "door", "french": "door", "window": "window"}
def beyond(w, lvl, n):
    """The room a way marked "outside" really leads to: the label of the open floor just past it."""
    G = grid[lvl]
    for d in (0.9, 1.2, 0.6, 1.5, 1.9):
        i, j = cell_of(lvl, w["at"][0] + n[0] * d, w["at"][2] + n[1] * d)
        if 0 <= i < G["W"] and 0 <= j < G["H"] and G["g"][j][i] and G["g"][j][i][1] and G["g"][j][i][0] != w["a"]: return G["g"][j][i][0]
    return None
for w, lvl, _, n in way_cells:
    b = w["b"] if w["b"] in rooms else beyond(w, lvl, n)
    if b is None or b == w["a"]: print("way %s (%s) leads nowhere a body can stand" % (w.get("id") or w["kind"], w["a"])); continue
    did = w.get("id") or "%s--%s" % (w["a"], b); k = 2
    while did in used: did = "%s--%s-%d" % (w["a"], b, k); k += 1
    used.add(did); hgt = w.get("height", 2.1)
    d = dict(id=did, kind=KIND.get(w["kind"], "doorway"), a=w["a"], b=b,
             place=dict(centre=[w["at"][0], round(rooms[w["a"]]["floor"] + w.get("sill", 0) + hgt / 2, 3), w["at"][2]], normal=[round(n[0], 4), 0, round(n[1], 4)], size=[w["width"], hgt]))
    if w["kind"] == "window": d["sill"] = w.get("sill", 0)
    site_doors.append(d)
# floor that opens is a door of its own (the bunker's grate): the stair under it is shut until it is opened
for h in MAP.get("holes", ()):
    st = next((x for x in MAP["stairs"] if x.get("gate") == h["id"]), None)
    if not st: continue
    cx = sum(p[0] for p in h["corners"]) / 4; cz = sum(p[2] for p in h["corners"]) / 4; wd = max(p[0] for p in h["corners"]) - min(p[0] for p in h["corners"])
    site_doors.append(dict(id=h["id"], kind="grate", a=st["rooms"][0], b=st["rooms"][1], place=dict(centre=[round(cx, 3), h["corners"][0][1], round(cz, 3)], normal=[0, -1, 0], size=[round(wd, 2), round(wd, 2)]))); used.add(h["id"])
# rooms that run into each other with no wall between (the gallery's lengths, the hinges and their corridors): the map
# records the way but no place for it. The simulation moves from room to room only through a doorway it knows, so
# each gets one: where the two rooms' open floor meets, as wide as that meeting.
def meeting(ra, rb):
    """Where two rooms' open floors meet: a doorway there, as wide as the meeting. None if they do not touch."""
    lvl = rooms[ra]["level"]; G = grid[lvl]; g = G["g"]; mids = []; dirs = [0.0, 0.0]
    for j in range(G["H"]):
        for i in range(G["W"]):
            c = g[j][i]
            if not (c and c[1] and c[0] == ra): continue
            for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if 0 <= i + di < G["W"] and 0 <= j + dj < G["H"]:
                    d = g[j + dj][i + di]
                    if d and d[1] and d[0] == rb: mids.append((G["minX"] + (i + 0.5 + di / 2) * CELL, G["minZ"] + (j + 0.5 + dj / 2) * CELL)); dirs[0] += di; dirs[1] += dj
    if not mids: return None
    cx = sum(m[0] for m in mids) / len(mids); cz = sum(m[1] for m in mids) / len(mids); ln = math.hypot(*dirs) or 1; n = (dirs[0] / ln, dirs[1] / ln)
    mx, mz = min(mids, key=lambda m: (m[0] - cx) ** 2 + (m[1] - cz) ** 2)                # on the meeting itself, not the mean of an L
    did = "%s--%s" % (ra, rb); used.add(did)
    return dict(id=did, kind="doorway", a=ra, b=rb, place=dict(centre=[round(mx, 3), round(rooms[ra]["floor"] + 1.2, 3), round(mz, 3)], normal=[round(n[0], 4), 0, round(n[1], 4)], size=[round(min(4.0, max(0.75, len(mids) * CELL)), 2), 2.4]))
for w in MAP["ways"]:
    if w.get("at") or w["kind"] == "overlook" or w["b"] == "outside" or w["a"] not in rooms or w["b"] not in rooms: continue
    d = meeting(w["a"], w["b"])
    if d: site_doors.append(d)
    else: print("open way %s - %s: their floors do not meet (the rooms that do meet get the doorway, below)" % (w["a"], w["b"]))
# and any two rooms whose open floors touch with no doorway yet between them (a corridor that opens into the gallery
# past the hinge the map joins it to): what a body can walk across, the simulation must know as a way
joined = {frozenset((d["a"], d["b"])) for d in site_doors}; touching = set()
for lvl, G in grid.items():
    g = G["g"]
    for j in range(G["H"]):
        for i in range(G["W"]):
            c = g[j][i]
            if not (c and c[1]): continue
            for di, dj in ((1, 0), (0, 1)):
                if i + di < G["W"] and j + dj < G["H"]:
                    d = g[j + dj][i + di]
                    if d and d[1] and d[0] != c[0]: touching.add(frozenset((c[0], d[0])))
for pair in sorted(touching - joined, key=sorted):
    ra, rb = sorted(pair); d = meeting(ra, rb)
    if d: site_doors.append(d); print("doorway added where floors meet: %s - %s" % (ra, rb))
json.dump(dict(id="glenridge", rooms=site_rooms, doors=site_doors), open(os.path.join(OUT_SRC, "glenridge-site.json"), "w", encoding="utf-8"), separators=(",", ":"))
sim_links = []
for l in links:
    if not l["a"][1] or not l["b"][1]: continue
    st = next(x for x in MAP["stairs"] if x["id"] == l["id"]); ends = sorted((l["a"], l["b"]), key=lambda e: -e[0])       # upper first
    def end(e): G = grid[e[0]]; return dict(floor=FLOOR_OF[e[0]], at=[G["minX"] + (e[1][0] + 0.5) * CELL, G["y"], G["minZ"] + (e[1][1] + 0.5) * CELL])
    def room_on(lv): G = grid[lv]; e = next(x for x in ends if x[0] == lv); return G["g"][e[1][1]][e[1][0]][0]
    sim_links.append(dict(id=l["id"], upper=end(ends[0]), lower=end(ends[1]), upperRoom=room_on(ends[0][0]), lowerRoom=room_on(ends[1][0]), line=l["line"], **({"grate": st["gate"]} if st.get("gate") else {})))
# what a body works at: the thing's own place and the open cell nearest where it stands to
sim_spots = {}
for sp in MAP.get("spots", ()):
    lvl = rooms[sp["room"]]["level"]; c = nearest_open(lvl, sp["stand"][0], sp["stand"][1], reach=1.2)
    if not c: print("SPOT %s: nowhere to stand within reach" % sp["id"]); continue
    G = grid[lvl]; sim_spots[sp["id"]] = dict(room=sp["room"], kind=sp["kind"], floor=FLOOR_OF[lvl], at=sp["at"], stand=[G["minX"] + (c[0] + 0.5) * CELL, rooms[sp["room"]]["floor"], G["minZ"] + (c[1] + 0.5) * CELL])
# THE HOUSE'S CONTAINERS: every cabinet, chest of drawers, commode, nightstand, console, bookshelf and crate set out in
# furnish.py is somewhere to search. Named by what the room is, so the loot rules (sim/mapdef.ts) know what it may hold.
CONTAINERS = ("GothicCabinet_01", "GothicCommode_01", "vintage_wooden_drawer_01", "ClassicNightstand_01", "ClassicConsole_01", "wooden_bookshelf_worn", "old_military_crate")
def prefix_of(room_id):
    if any(k in room_id for k in ("kitchen", "pantry", "larder", "scullery", "breakfast")): return "kitchen"
    if "bath" in room_id or room_id in ("ladies", "gents"): return "bath"
    if any(k in room_id for k in ("bedroom", "suite", "boudoir", "nursery", "sitting", "closets")): return "bedroom"
    if any(k in room_id for k in ("coal", "furnace", "laundry", "cellar", "basement", "servant-bedroom")): return "cellar"
    if any(k in room_id for k in ("library", "office", "study")): return "desk"
    return "hall"
loot_n = {}; site_spots = {}
for cname, lvl in (("furniture0", 0), ("furniture1", 1), ("furniture-1", -1)):
    c = bpy.data.collections.get(cname)
    for o in sorted((c.objects if c else ()), key=lambda o: o.name):
        base = o.name.split(".")[0]
        if base not in CONTAINERS: continue
        x, z = o.matrix_world.translation.x, -o.matrix_world.translation.y; rid = room_at(lvl, x, z)
        if rid is None or rid in ("hidden-study", "hearth-stair"): continue          # (the study's shelves hold the secret, not supplies)
        cnear = nearest_open(lvl, x, z, reach=1.3)
        if not cnear: continue
        G = grid[lvl]
        if G["g"][cnear[1]][cnear[0]][0] != rid: continue                           # stood at from inside its own room
        key = "%s-%s" % (prefix_of(rid), rid); loot_n[key] = loot_n.get(key, 0) + 1; sid = "%s-%d" % (key, loot_n[key])
        sim_spots[sid] = dict(room=rid, kind="loot", floor=FLOOR_OF[lvl], at=[round(x, 3), round(rooms[rid]["floor"] + 0.8, 3), round(z, 3)], stand=[G["minX"] + (cnear[0] + 0.5) * CELL, rooms[rid]["floor"], G["minZ"] + (cnear[1] + 0.5) * CELL])
        site_spots.setdefault(rid, []).append(dict(id=sid, kind="loot"))
for r in site_rooms: r["spots"] += site_spots.get(r["id"], [])
json.dump(dict(id="glenridge", rooms=site_rooms, doors=site_doors), open(os.path.join(OUT_SRC, "glenridge-site.json"), "w", encoding="utf-8"), separators=(",", ":"))      # (again, with the containers)
print("containers to search: %d in %d rooms" % (sum(loot_n.values()), len(site_spots)))
print("for the simulation: %d rooms, %d doors, %d stairs" % (len(site_rooms), len(site_doors), len(sim_links)))

out = dict(map="glenridge", res=RES, bodyR=R, floors=out_floors, simLinks=sim_links, spots=sim_spots,
           links=[dict(id=l["id"], a=dict(level=l["a"][0], cell=l["a"][1]), b=dict(level=l["b"][0], cell=l["b"][1]), line=l["line"]) for l in links],
           report=dict(rooms=report, unreached=unreached, partly=[p[0] for p in partly]))
json.dump(out, open(os.path.join(OUT_SRC, "glenridge-walk.json"), "w", encoding="utf-8"), separators=(",", ":"))
print("walk map: src/survivorz/glenridge-walk.json (%s)" % ", ".join("%s %dx%d" % (f["name"], f["w"], f["h"]) for f in out_floors))
