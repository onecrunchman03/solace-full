import os
# SURVIVORZ, GLENRIDGE HALL: the geometry kit build.py is written in. Blender coords: x east, y north, z up, metres.
# Everything is built in a 2D FRAME (an origin and a turn about z): the central block is the world frame,
# each splayed wing is a frame at 45 degrees, and a wall running north-south is the same wall builder in a
# frame turned 90. UVs are taken in the frame's own metres (so brick courses run level on a turned wing).
import bpy, bmesh, math
from mathutils import Vector

FST = [(0.0, 0.0, 1.0, 0.0)]   # ox, oy, cos, sin

def push(ox, oy, deg):
    px, py, pc, ps = FST[-1]
    a = math.radians(deg); c, s = math.cos(a), math.sin(a)
    FST.append((px + pc * ox - ps * oy, py + ps * ox + pc * oy, pc * c - ps * s, ps * c + pc * s))

def pop():
    FST.pop()

class frame:
    def __init__(s, ox, oy, deg): s.a = (ox, oy, deg)
    def __enter__(s): push(*s.a)
    def __exit__(s, *e): pop()

def T(x, y):
    ox, oy, c, s = FST[-1]
    return (ox + c * x - s * y, oy + s * x + c * y)

def Tinv(wx, wy):
    ox, oy, c, s = FST[-1]
    dx, dy = wx - ox, wy - oy
    return (c * dx + s * dy, -s * dx + c * dy)

def frame_deg():
    return math.degrees(math.atan2(FST[-1][3], FST[-1][2]))

GEOS = {}

class Geo:
    def __init__(s, name):
        s.name = name; s.bm = bmesh.new(); s.mats = []; s.uv = s.bm.loops.layers.uv.new("UVMap"); s.smooth = False
    def mi(s, m):
        if m not in s.mats: s.mats.append(m)
        return s.mats.index(m)
    def face(s, pts, mat, want=None, uvs=None):
        n = Vector((0, 0, 0))
        for i in range(len(pts)):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            n += Vector(((a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])))
        if n.length < 1e-12: return None
        if want is not None and n.dot(Vector(want)) < 0:
            pts = pts[::-1]; n = -n
            if uvs: uvs = uvs[::-1]
        vs = [s.bm.verts.new((*T(p[0], p[1]), p[2])) for p in pts]
        try: f = s.bm.faces.new(vs)
        except ValueError: return None
        f.material_index = s.mi(mat)
        ax = max(range(3), key=lambda i: abs(n[i]))
        for i, (lp, p) in enumerate(zip(f.loops, pts)):
            lp[s.uv].uv = uvs[i] if uvs else ((p[0], p[1]) if ax == 2 else ((p[1], p[2]) if ax == 0 else (p[0], p[2])))
        return f
    def box(s, x0, y0, z0, x1, y1, z1, mat, fm=None):
        if x1 - x0 < 1e-6 or y1 - y0 < 1e-6 or z1 - z0 < 1e-6: return
        fm = fm or {}
        m = lambda k: fm.get(k, mat)
        F = s.face
        F([(x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (x1, y0, z0)], m("-z"), (0, 0, -1))
        F([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], m("+z"), (0, 0, 1))
        F([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], m("-y"), (0, -1, 0))
        F([(x0, y1, z0), (x0, y1, z1), (x1, y1, z1), (x1, y1, z0)], m("+y"), (0, 1, 0))
        F([(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)], m("-x"), (-1, 0, 0))
        F([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], m("+x"), (1, 0, 0))
    def beam(s, p0, p1, w, h, mat, up=(0, 0, 1)):
        """A w-by-h timber from p0 to p1 (frame coords), its section centred on the line."""
        p0, p1 = Vector(p0), Vector(p1); d = p1 - p0; L = d.length
        if L < 1e-6: return
        d /= L; upv = Vector(up)
        side = d.cross(upv)
        if side.length < 1e-6: side = d.cross(Vector((1, 0, 0)))
        side.normalize(); u2 = side.cross(d).normalized()
        c = [(sx, sz) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        ring0 = [p0 + side * (sx * w / 2) + u2 * (sz * h / 2) for sx, sz in c]
        ring1 = [q + d * L for q in ring0]
        for i in range(4):
            j = (i + 1) % 4
            mid = (ring0[i] + ring0[j]) / 2 - p0
            ww = w if i % 2 == 0 else h
            s.face([tuple(ring0[i]), tuple(ring0[j]), tuple(ring1[j]), tuple(ring1[i])], mat, tuple(mid), uvs=[(0, 0), (ww, 0), (ww, L), (0, L)])
        s.face([tuple(q) for q in ring0], mat, tuple(-d)); s.face([tuple(q) for q in ring1], mat, tuple(d))
    def prism(s, pts, y0, y1, mat_pos, mat_neg, mat_side):
        """A polygon in the (x, z) plane [(x, z), ...] pulled from y0 to y1."""
        s.face([(x, y1, z) for x, z in pts], mat_pos, (0, 1, 0)); s.face([(x, y0, z) for x, z in pts], mat_neg, (0, -1, 0))
        cx = sum(p[0] for p in pts) / len(pts); cz = sum(p[1] for p in pts) / len(pts)
        for i in range(len(pts)):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            mx, mz = (a[0] + b[0]) / 2 - cx, (a[1] + b[1]) / 2 - cz
            en = Vector((-(b[1] - a[1]), 0, b[0] - a[0]))
            if en.dot(Vector((mx, 0, mz))) < 0: en = -en
            s.face([(a[0], y0, a[1]), (b[0], y0, b[1]), (b[0], y1, b[1]), (a[0], y1, a[1])], mat_side, tuple(en))
    def finish(s, coll, material_of, solidify=0.0):
        me = bpy.data.meshes.new(s.name)
        if s.smooth:                                      # round things (shrubs, leaves, boulders): welded and shaded smooth
            bmesh.ops.remove_doubles(s.bm, verts=s.bm.verts, dist=1e-4)
            for f in s.bm.faces: f.smooth = True
        s.bm.to_mesh(me); s.bm.free()
        for m in s.mats: me.materials.append(material_of(m))
        ob = bpy.data.objects.new(s.name, me); coll.objects.link(ob)
        if solidify:
            md = ob.modifiers.new("thick", "SOLIDIFY"); md.thickness = solidify; md.offset = -1
        return ob

def G(name):
    if name not in GEOS: GEOS[name] = Geo(name)
    return GEOS[name]

# ---- walls ------------------------------------------------------------------------------------------
REVEAL = "reveal"

def bands(fin, z0):
    """A finish is a material name, or [(height above the floor, name), ..., (None, name)] from the floor up."""
    if isinstance(fin, str): return [(1e9, fin)]
    return [((z0 + h) if h is not None else 1e9, m) for h, m in fin]

def mat_at(bs, z):
    for top, m in bs:
        if z < top: return m
    return bs[-1][1]

def arch_pts(u0, u1, zs, z1, n=7):
    """The curve of a pointed arch from the left spring to the apex (list of (u, z))."""
    w = u1 - u0; rise = z1 - zs; um = (u0 + u1) / 2
    out = []
    for i in range(n + 1):
        a = math.radians(60) * i / n
        out.append((u1 - w * math.cos(a), zs + rise * math.sin(a) / math.sin(math.radians(60))))
    out[-1] = (um, z1)
    return out

def wall_x(c, a, b, z0, z1, t, pos, neg, ops=(), lvl="0", floor_pos=None, floor_neg=None):
    """A wall along the frame's x at y=c, from a to b, z0 to z1, t thick. pos is the +y face's finish, neg the -y
    face's. ops: dicts u0,u1,z0,z1,kind (win | french | door | archdoor | arch | tudor | open) and id."""
    if b - a < 1e-4 or z1 - z0 < 1e-4: return
    g = G("wall" + lvl)
    bp = bands(pos, z0 if floor_pos is None else floor_pos); bn = bands(neg, z0 if floor_neg is None else floor_neg)
    ops = [o for o in ops if o["u1"] > a + 1e-4 and o["u0"] < b - 1e-4]
    us = sorted(set([a, b] + [min(max(v, a), b) for o in ops for v in (o["u0"], o["u1"])]))
    zs = sorted(set([z0, z1] + [v for v in [top for top, _ in bp + bn] + [v for o in ops for v in (o["z0"], o["z1"])] if z0 < v < z1]))
    real = lambda m: m[3:] if m.startswith("ht:") else m
    for i in range(len(us) - 1):
        for j in range(len(zs) - 1):
            uc, zc = (us[i] + us[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2
            if any(o["u0"] < uc < o["u1"] and o["z0"] < zc < o["z1"] for o in ops): continue
            g.box(us[i], c - t / 2, zs[j], us[i + 1], c + t / 2, zs[j + 1], REVEAL, {"+y": real(mat_at(bp, zc)), "-y": real(mat_at(bn, zc))})
    for side, bs, fl in ((1, bp, z0 if floor_pos is None else floor_pos), (-1, bn, z0 if floor_neg is None else floor_neg)):
        if real(bs[0][1]) == "oakpanel" and min(bs[0][0], z1) - fl > 0.6:      # an oak-panelled face: hall.py lays the panels on it
            PANELS.append((T(0, 0), frame_deg(), c + side * t / 2, side, a, b, fl, min(bs[0][0], z1), [dict(o) for o in ops], lvl))
    for side, bs in ((1, bp), (-1, bn)):
        lo = z0
        for top, m in bs:
            hi = min(top, z1)
            if m.startswith("ht:") and hi - lo > 0.3: timber(c + side * t / 2, side, a, b, lo, hi, ops, lvl)
            lo = hi
            if lo >= z1: break
    for o in ops:
        k = o["kind"]
        # A THRESHOLD under every doorway: a board the wall's thickness, a hair under the floor. Where two rooms'
        # floors stop at their own faces of the wall there was nothing under the door (the nursery's stood over a
        # slot down to the ceiling below).
        if k in ("door", "archdoor", "french") and o["z0"] > -5: G("floor" + lvl).box(o["u0"], c - t / 2, o["z0"] - 0.05, o["u1"], c + t / 2, o["z0"] - 0.004, "timber")
        if k in ("arch", "tudor", "archdoor"):
            # (a DOOR's arch is four-centred and low, as a Tudor house's is: its spring must clear a head. At 0.62 of
            # the width the front door's transom sat at 1.71 m and people walked through it — the review, Nov 13 2026)
            rise = min((o["u1"] - o["u0"]) * (0.2 if k == "tudor" else 0.36 if k == "archdoor" else 0.62), o["z1"] - o["z0"] - 0.4)
            zs_ = o["z1"] - rise
            L = arch_pts(o["u0"], o["u1"], zs_, o["z1"])
            left = L + [(o["u0"], o["z1"])]
            right = [(o["u0"] + o["u1"] - u, z) for u, z in L] + [(o["u1"], o["z1"])]
            zc = (zs_ + o["z1"]) / 2
            for poly in (left, right):
                g.prism(poly, c - t / 2, c + t / 2, real(mat_at(bp, zc)), real(mat_at(bn, zc)), o.get("soffit", REVEAL))
            for side, bs_ in ((1, bp), (-1, bn)):          # a ring of bricks on edge round the arch, on a brick face
                if real(mat_at(bs_, zc)) != "brick": continue
                yv = c + side * (t / 2 + 0.012)
                for arc_ in (L, [(o["u0"] + o["u1"] - u, z) for u, z in L]):
                    for (ua, za), (ub, zb) in zip(arc_, arc_[1:]):
                        dx, dz = ub - ua, zb - za; n_ = math.hypot(dx, dz) or 1; ox_, oz_ = -dz / n_ * 0.13, dx / n_ * 0.13
                        if (ua + ox_ - (o["u0"] + o["u1"]) / 2) ** 2 < (ua - (o["u0"] + o["u1"]) / 2) ** 2: ox_, oz_ = -ox_, -oz_
                        G("timber" + lvl).beam((ua + ox_, yv, za + oz_), (ub + ox_, yv, zb + oz_), 0.26, 0.03, "brickdark", up=(0, 1, 0))
            if k == "archdoor":
                door(c, o["u0"], o["u1"], o["z0"], zs_, o, lvl)
                head = L + [(o["u0"] + o["u1"] - u, z) for u, z in L][::-1][1:]         # the door's own pointed head, under the arch
                G("doors" + lvl).prism(head, c - 0.025, c + 0.025, o.get("leafmat", "oakdoor"), o.get("leafmat", "oakdoor"), "timber")
        elif k == "french" and os.environ.get("GLEN_GAME"):
            # THE GAME HANGS ITS OWN GLAZED LEAVES in a French door (client show/doors.ts): only the frame is built
            # here (jambs and head), or the show's bodies would walk through a fixed pane of glass
            g_ = G("frame" + lvl); d_ = 0.07; fw_ = 0.07; m_ = o.get("frame", "timber")
            g_.box(o["u0"], c - d_, o["z1"] - fw_, o["u1"], c + d_, o["z1"], m_)
            g_.box(o["u0"], c - d_, o["z0"], o["u0"] + fw_, c + d_, o["z1"], m_); g_.box(o["u1"] - fw_, c - d_, o["z0"], o["u1"], c + d_, o["z1"], m_)
        elif k in ("win", "french"): window(c, t, o, lvl)
        elif k == "door": door(c, o["u0"], o["u1"], o["z0"], o["z1"], o, lvl)

def wall_y(c, a, b, z0, z1, t, pos, neg, ops=(), **kw):
    """The same wall running along the frame's y at x=c; pos is its +x face."""
    with frame(c, 0, 90):
        wall_x(0, a, b, z0, z1, t, neg, pos, ops, **{k: v for k, v in kw.items() if k == "lvl"},
               floor_pos=kw.get("floor_neg"), floor_neg=kw.get("floor_pos"))

def seg_wall(p0, p1, z0, z1, t, left, right, ops=(), **kw):
    """A wall between two points of the current frame; `left` is the finish on the left of p0 -> p1."""
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    with frame(p0[0], p0[1], math.degrees(math.atan2(dy, dx))):
        wall_x(0, 0, math.hypot(dx, dy), z0, z1, t, left, right, ops, **kw)

def timber(y, side, a, b, z0, z1, ops, lvl):
    """Half-timbering on a wall face: sill and head rails, studs, and a rail under and over each window."""
    g = G("timber" + lvl); d = 0.04; W = 0.17
    ya, yb = (y, y + d) if side > 0 else (y - d, y)
    g.box(a, ya, z0, b, yb, z0 + 0.2, "timber"); g.box(a, ya, z1 - 0.2, b, yb, z1, "timber")
    n = max(1, round((b - a) / 0.85))
    for i in range(n + 1):
        u = a + (b - a - W) * i / n
        segs = [(z0 + 0.2, z1 - 0.2)]
        for o in ops:
            if o["u0"] - 0.02 < u + W and u < o["u1"] + 0.02 and o["kind"] != "open":
                segs = [p for lo, hi in segs for p in ((lo, min(hi, o["z0"])), (max(lo, o["z1"]), hi)) if p[1] - p[0] > 0.05]
        for lo, hi in segs: g.box(u, ya, lo, u + W, yb, hi, "timber")
    yc = (ya + yb) / 2                                    # a diagonal brace in each end bay that has no opening
    if b - a > 2.4 and z1 - z0 > 1.6:
        for u0, u1 in ((a + W, a + W + 0.85), (b - W, b - W - 0.85)):
            lo, hi = min(u0, u1), max(u0, u1)
            if not any(o["u0"] < hi and lo < o["u1"] for o in ops): g.beam((u0, yc, z0 + 0.2), (u1, yc, z1 - 0.2), 0.14, d, "timber", up=(0, 1, 0))
    for o in ops:
        if o["kind"] in ("win", "french"):
            g.box(o["u0"] - W, ya, o["z1"], o["u1"] + W, yb, min(o["z1"] + 0.14, z1), "timber")
            if o["z0"] - 0.14 > z0: g.box(o["u0"] - W, ya, o["z0"] - 0.14, o["u1"] + W, yb, o["z0"], "timber")
            for u in (o["u0"] - W, o["u1"]): g.box(u, ya, max(z0, o["z0"] - 0.14), u + W, yb, min(z1, o["z1"] + 0.14), "timber")

def window(c, t, o, lvl):
    g = G("frame" + lvl); gl = G("glass" + lvl)
    u0, u1, z0, z1 = o["u0"], o["u1"], o["z0"], o["z1"]; d = 0.07; fw = 0.07
    m = o.get("frame", "timber")
    g.box(u0, c - d, z0, u1, c + d, z0 + fw, m); g.box(u0, c - d, z1 - fw, u1, c + d, z1, m)
    g.box(u0, c - d, z0, u0 + fw, c + d, z1, m); g.box(u1 - fw, c - d, z0, u1, c + d, z1, m)
    n = max(1, round((u1 - u0) / o.get("light", 0.58)))
    smashed = bool(o.get("broken")) and bool(os.environ.get("GLEN_GAME"))
    for i in range(1, n):
        u = u0 + (u1 - u0) * i / n
        if smashed and 0 < i < n: g.box(u - 0.03, c - d * 0.8, z1 - 0.22 - 0.07 * (i % 2), u + 0.03, c + d * 0.8, z1, m); continue      # a stub of each mullion left at the head
        g.box(u - 0.03, c - d * 0.8, z0, u + 0.03, c + d * 0.8, z1, m)
    if smashed:
        import random as _r; rr = _r.Random(hash(o["broken"]) & 0xffff); gm_ = o.get("glass", "leaded")
        def shard(pa, pb, tip): gl.face([(pa[0], c, pa[1]), (pb[0], c, pb[1]), (tip[0], c, tip[1])], gm_, (0, 1, 0))
        k = int((u1 - u0) / 0.16)
        for i in range(k):                                                # along the sill and the head
            ua, ub = u0 + fw + (u1 - u0 - 2 * fw) * i / k, u0 + fw + (u1 - u0 - 2 * fw) * (i + 1) / k
            if rr.random() < 0.8: shard((ua, z0 + fw), (ub, z0 + fw), ((ua + ub) / 2 + rr.uniform(-0.05, 0.05), z0 + fw + rr.uniform(0.04, 0.2)))
            if rr.random() < 0.9: shard((ua, z1 - fw), (ub, z1 - fw), ((ua + ub) / 2 + rr.uniform(-0.05, 0.05), z1 - fw - rr.uniform(0.08, 0.42)))
        k = int((z1 - z0) / 0.16)
        for i in range(k):                                                # up each jamb
            za, zb = z0 + fw + (z1 - z0 - 2 * fw) * i / k, z0 + fw + (z1 - z0 - 2 * fw) * (i + 1) / k
            if rr.random() < 0.85: shard((u0 + fw, za), (u0 + fw, zb), (u0 + fw + rr.uniform(0.05, 0.3), (za + zb) / 2))
            if rr.random() < 0.85: shard((u1 - fw, za), (u1 - fw, zb), (u1 - fw - rr.uniform(0.05, 0.3), (za + zb) / 2))
        return
    if z1 - z0 > 1.75:
        zt = z0 + (z1 - z0) * (0.68 if o["kind"] == "win" else 0.8)
        g.box(u0, c - d * 0.8, zt - 0.03, u1, c + d * 0.8, zt + 0.03, m)
    gl.face([(u0, c, z0), (u1, c, z0), (u1, c, z1), (u0, c, z1)], o.get("glass", "leaded"), (0, 1, 0))

DOORS = []
PANELS = []

def door(c, u0, u1, z0, z1, o, lvl):
    g = G("frame" + lvl); fw = 0.06; d = 0.08
    g.box(u0, c - d, z0, u0 + fw, c + d, z1, "timber"); g.box(u1 - fw, c - d, z0, u1, c + d, z1, "timber"); g.box(u0, c - d, z1 - fw, u1, c + d, z1, "timber")
    if o.get("leaf", True):
        gd = G("doors" + lvl)
        gd.box(u0 + fw, c - 0.025, z0 + 0.01, u1 - fw, c + 0.025, z1 - fw, o.get("leafmat", "oakdoor"))
        plank = o["kind"] == "archdoor" and o.get("leafmat", "oakdoor") == "oakdoor"; lm = o.get("leafmat", "oakdoor")
        for sd in (-1, 1):                                # a handle each side; iron straps on a plank door to the outside; six fielded panels on a room door
            ya, yb = sorted((c + sd * 0.025, c + sd * 0.07))
            if plank: gd.box(u1 - fw - 0.16, ya, z0 + 0.98, u1 - fw - 0.06, yb, z0 + 1.06, "iron")
            else:
                gd.box(u1 - fw - 0.115, min(c + sd * 0.025, c + sd * 0.031), z0 + 0.93, u1 - fw - 0.055, max(c + sd * 0.025, c + sd * 0.031), z0 + 1.11, "brassware")
                gd.box(u1 - fw - 0.108, ya, z0 + 0.995, u1 - fw - 0.062, yb, z0 + 1.045, "brassware")
            if o["kind"] == "door" and lm == "oakdoor":
                W_, H_ = u1 - u0 - 2 * fw, z1 - fw - z0; pa, pb = sorted((c + sd * 0.025, c + sd * 0.033)); qa, qb = sorted((c + sd * 0.025, c + sd * 0.039))
                for ca, cb in ((0.11, 0.46), (0.54, 0.89)):
                    for ra, rb in ((0.07, 0.33), (0.39, 0.7), (0.76, 0.94)):
                        gd.box(u0 + fw + W_ * ca, pa, z0 + H_ * ra, u0 + fw + W_ * cb, pb, z0 + H_ * rb, lm)
                        gd.box(u0 + fw + W_ * ca + 0.035, qa, z0 + H_ * ra + 0.035, u0 + fw + W_ * cb - 0.035, qb, z0 + H_ * rb - 0.035, lm)
            if o["kind"] == "archdoor" and o.get("leafmat", "oakdoor") == "oakdoor":
                for zz in (z0 + 0.35, z0 + (z1 - z0) * 0.55, z1 - 0.3): gd.box(u0 + fw, min(c + sd * 0.025, c + sd * 0.034), zz - 0.03, u0 + fw + (u1 - u0) * 0.62, max(c + sd * 0.025, c + sd * 0.034), zz + 0.03, "iron")
        DOORS.append((o.get("id", "door%d" % len(DOORS)), T((u0 + u1) / 2, c), z0, frame_deg(), u1 - u0))

# ---- roofs ------------------------------------------------------------------------------------------
def gable(x0, y0, x1, y1, ze, pitch=45.0, over=0.45, hips=(0.0, 0.0), ends=(None, None), lvl="R", mat="slate", t=0.3):
    """A gable roof over a rect of the current frame, its ridge along x. hips = how far the ridge is pulled in at
    each end (0 = a gable end). ends = the finish of each gable-end wall (None = no wall). Returns the ridge height."""
    g = G("roof" + lvl); ym = (y0 + y1) / 2; k = math.tan(math.radians(pitch)); zr = ze + (ym - y0) * k
    zo = ze - over * k
    rx0 = x0 + hips[0] if hips[0] else x0 - over
    rx1 = x1 - hips[1] if hips[1] else x1 + over
    for ys, sgn in ((y0, 1), (y1, -1)):
        yo = ys - sgn * over
        sl = lambda p: (p[0], abs(p[1] - ym) * math.hypot(1, k))                       # slates: u along the ridge, v down the slope in true metres
        pts_ = [(x0 - over, yo, zo), (x1 + over, yo, zo), (rx1, ym, zr), (rx0, ym, zr)]
        g.face(pts_, mat, (0, -sgn * k, 1), uvs=[sl(p) for p in pts_])
    wl = "1" if lvl == "R" else lvl
    for i, (xe, sgn, rx) in enumerate(((x0, -1, rx0), (x1, 1, rx1))):
        if hips[i]:
            g.face([(xe + sgn * over, y0 - over, zo), (xe + sgn * over, y1 + over, zo), (rx, ym, zr)], mat, (sgn * k, 0, 1))
        elif ends[i]:
            fin = ends[i]; real = fin[3:] if fin.startswith("ht:") else fin
            with frame(xe, 0, 90):   # x' = +y, y' = -x: the wall plane is y'=0 and its +y' face looks toward -x
                G("wall" + wl).prism([(y0, ze), (y1, ze), (ym, zr)], -t / 2, t / 2, real if sgn < 0 else "plaster", real if sgn > 0 else "plaster", REVEAL)
                gt = G("timber" + wl)
                yy = (-t / 2 - 0.04, -t / 2) if sgn > 0 else (t / 2, t / 2 + 0.04)
                if fin.startswith("ht:"):
                    n = max(2, round((y1 - y0) / 0.8))
                    for j in range(n + 1):
                        u = y0 + (y1 - y0 - 0.17) * j / n
                        top = ze + (ym - y0 - abs(u + 0.085 - ym)) * k - 0.1
                        if top - ze > 0.15: gt.box(u, yy[0], ze, u + 0.17, yy[1], top, "timber")
                    gt.box(y0, yy[0], ze - 0.1, y1, yy[1], ze + 0.12, "timber")
                    zc = ze + (zr - ze) * 0.55; half = (zr - zc) / k
                    gt.box(ym - half, yy[0], zc - 0.09, ym + half, yy[1], zc + 0.09, "timber")
                yc = (-t / 2 - over + 0.06) if sgn > 0 else (t / 2 + over - 0.06)
                for s2 in (-1, 1):   # the barge boards along the rake
                    gt.beam((ym + s2 * (ym - y0 + over), yc, zo - 0.08), (ym, yc, zr - 0.08), 0.26, 0.06, "timber", up=(0, 1, 0))
    return zr

def lean(x0, y0, x1, y1, z_low, z_high, low="y0", over=0.35, mat="slate", lvl="R"):
    """A single slope over a rect: low along one edge (y0, y1, x0 or x1), high along the opposite."""
    g = G("roof" + lvl)
    if low == "y0": pts = [(x0 - over, y0 - over, z_low), (x1 + over, y0 - over, z_low), (x1 + over, y1, z_high), (x0 - over, y1, z_high)]
    elif low == "y1": pts = [(x0 - over, y1 + over, z_low), (x1 + over, y1 + over, z_low), (x1 + over, y0, z_high), (x0 - over, y0, z_high)]
    elif low == "x0": pts = [(x0 - over, y0 - over, z_low), (x0 - over, y1 + over, z_low), (x1, y1 + over, z_high), (x1, y0 - over, z_high)]
    else: pts = [(x1 + over, y0 - over, z_low), (x1 + over, y1 + over, z_low), (x0, y1 + over, z_high), (x0, y0 - over, z_high)]
    g.face(pts, mat, (0, 0, 1))

def chimney(x, y, w, d, z0, z1, pots=2):
    g = G("chimney")
    g.box(x - w / 2, y - d / 2, z0, x + w / 2, y + d / 2, z1 - 0.5, "brick")
    g.box(x - w / 2 - 0.07, y - d / 2 - 0.07, z1 - 0.5, x + w / 2 + 0.07, y + d / 2 + 0.07, z1 - 0.32, "brick")
    g.box(x - w / 2 - 0.14, y - d / 2 - 0.14, z1 - 0.32, x + w / 2 + 0.14, y + d / 2 + 0.14, z1, "limestone")
    for i in range(pots):
        px = x + (i - (pots - 1) / 2) * min(0.5, w / max(1, pots))
        g.box(px - 0.13, y - 0.13, z1, px + 0.13, y + 0.13, z1 + 0.55, "terracotta")
