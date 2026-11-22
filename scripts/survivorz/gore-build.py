# SOLACE SURVIVORZ: the gore pieces, built by script in Blender.
#
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \
#       --python scripts/survivorz/gore-build.py -- [--only neck,thigh] [--no-render] [--gibs-only|--caps-only] [--embed] [--no-ktx]
#
# Makes the meat the effects runtime can't make in code (docs/survivorz/EFFECTS.md):
#   caps/<site>.glb        the stump left on the body
#   caps/<site>-piece.glb  the cut face of the piece that came off
#   gibs/<name>.glb        small chunks for a headshot or a burst
#   gore.json              every piece, its triangles and bounds
#   review/*.png           close renders on a grey floor under a hard key light
# into assets/downloads/survivorz/fx/gore/.
#
# THE CONTRACT the runtime reads (agreed with the effects session):
#   · a CAP's origin is the centre of the cut, +Y (glTF) points OUT of the body,
#     and it is modelled at radius 1, so the runtime scales it to each zombie's
#     real cross-section. +Z (glTF) faces the FRONT of the body (it matters for
#     the neck, whose windpipe is at the front and spine at the back).
#   · a cap carries a short skin SKIRT running 0.2 back into the body below the
#     rim, so the seam between cap and body is covered.
#   · gibs are in real metres.
#   · the GLBs are GEOMETRY ONLY (their materials are named for the texture SET
#     they use, but carry no images): an embedded image is a separate GPU copy
#     per file, and twenty files carrying the same flesh blew the effects'
#     memory budget. Each set is written ONCE into tex/, as PNG plus a KTX2
#     copy (UASTC + zstd, mipmapped; colour sRGB, normal and roughness linear),
#     and gore.json says which set each piece uses. `--embed` puts the images
#     back in the GLBs for a standalone look.
#   · a set is colour, normal, roughness, plus a DRIED colour and roughness on
#     the same UVs (the normal is shared). Metallic 0; the wetness is in the
#     roughness. The four gib sets (meat, bone, brain, scalp) are 1K; each cap
#     SITE has one 512 set, shared by its stump and its piece (the piece is the
#     mirror image, so its UVs are mirrored onto the same picture).
#
# Everything is procedural and seeded, so a rerun gives the same pieces.
# Blender's axes: Z is up. The glTF exporter turns Blender (x, y, z) into
# glTF (x, z, -y), so "out of the body" is Blender +Z and "front" is Blender -Y.

import bpy
import bmesh
import json
import math
import os
import sys
import numpy as np

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def flag(name):
    return name in ARGS
def opt(name, default=None):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "assets", "downloads", "survivorz", "fx", "gore")
TEX = 1024            # texture size
R_TEX = 1.25          # a cap's texture covers [-R_TEX, R_TEX] in x and y

for sub in ("caps", "gibs", "tex", "review"):
    os.makedirs(os.path.join(OUT, sub), exist_ok=True)


# =============================================================================
# NOISE (numpy). FFT-filtered noise is periodic by construction, so every map
# made from it tiles, which the gibs' shared textures need.
# =============================================================================

def fbm(n, beta, seed, lo=2.0, hi=None, ax=1.0, ay=1.0):
    rng = np.random.default_rng(seed)
    white = rng.standard_normal((n, n))
    f = (np.fft.fftfreq(n)[:, None] * ay) ** 2 + (np.fft.fftfreq(n)[None, :] * ax) ** 2
    f = np.sqrt(f) * n
    f[0, 0] = 1.0
    amp = 1.0 / f ** (beta / 2)
    amp[f < lo] = 0
    if hi is not None:
        amp[f > hi] = 0
    out = np.real(np.fft.ifft2(np.fft.fft2(white) * amp))
    out -= out.mean()
    return out / (np.abs(out).max() + 1e-9)


def angular(theta, seed, k=12, rough=1.2):
    """Periodic noise along a circle: a ragged edge as a function of angle."""
    rng = np.random.default_rng(seed)
    out = np.zeros_like(theta)
    for i in range(1, k + 1):
        out += rng.standard_normal() / i ** rough * np.cos(i * theta + rng.uniform(0, 2 * np.pi))
    return out / (np.abs(out).max() + 1e-9)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def srgb(c):
    """sRGB 0-255 → linear 0-1 (maps are stored sRGB; mixing in linear)."""
    c = np.asarray(c, dtype=np.float64) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(lin):
    lin = np.clip(lin, 0, 1)
    return np.where(lin <= 0.0031308, lin * 12.92, 1.055 * lin ** (1 / 2.4) - 0.055)


def voronoi(x, y, pts):
    """F1, F2 distances to a set of points (for muscle bundles)."""
    d = np.sqrt((x[..., None] - pts[:, 0]) ** 2 + (y[..., None] - pts[:, 1]) ** 2)
    d.sort(axis=-1)
    return d[..., 0], d[..., 1]


def normal_from_height(h, texel):
    """Blender/glTF tangent-space normals (OpenGL: green = +v)."""
    gy, gx = np.gradient(h, texel)
    n = np.stack([-gx, -gy, np.ones_like(h)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


# =============================================================================
# IMAGES. A map here is a numpy array indexed [i, j] with i counted from the
# BOTTOM (Blender's v) and j from the left (u). That is the order Blender's
# image.pixels uses, so nothing is flipped by hand anywhere.
# =============================================================================

def save_image(name, arr, data=False):
    """arr: HxWx3 in 0..1 (already sRGB-encoded for colour). Saved as PNG."""
    h, w = arr.shape[:2]
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[..., :3] = arr[..., :3] if arr.ndim == 3 else arr[..., None]
    img = bpy.data.images.new(name, w, h, alpha=False, float_buffer=False)
    img.pixels.foreach_set(rgba.ravel())
    path = os.path.join(OUT, "tex", name + ".png")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    img.colorspace_settings.name = "Non-Color" if data else "sRGB"
    return img, path


def down(arr, size, normal=False):
    """Box-filter a square map down to `size` (normals renormalised)."""
    n = arr.shape[0]
    if size is None or size >= n:
        return arr
    f = n // size
    out = arr.reshape(size, f, size, f, arr.shape[2]).mean(axis=(1, 3))
    if normal:
        v = out * 2 - 1
        v /= np.linalg.norm(v, axis=-1, keepdims=True)
        out = v * 0.5 + 0.5
    return out


class MapSet:
    """One PBR set: colour (sRGB), normal, roughness, plus a dried variant.
    `sid` is the set's id in gore.json and the material name in the GLBs."""

    def __init__(self, name, color, normal, rough, coat, dry_color, dry_rough, sid=None, size=None, skin_mask=None):
        self.name = name
        self.sid = sid or name
        self.size = size or color.shape[0]
        self.color, self.color_path = save_image(name + "-color", to_srgb(down(color, size)))
        self.normal, self.normal_path = save_image(name + "-normal", down(normal, size, True), data=True)
        self.rough, self.rough_path = save_image(name + "-roughness", down(rough, size), data=True)
        self.coat = coat
        _, self.dry_color_path = save_image(name + "-dried-color", to_srgb(down(dry_color, size)))
        _, self.dry_rough_path = save_image(name + "-dried-roughness", down(dry_rough, size), data=True)
        self.skin_path = None
        if skin_mask is not None:
            _, self.skin_path = save_image(name + "-skin-mask", down(skin_mask, size), data=True)
        ALL_SETS[self.sid] = self

    def entry(self):
        rel = lambda q: os.path.relpath(q, OUT).replace("\\", "/")
        both = lambda q: {"png": rel(q), "ktx2": rel(q)[:-4] + ".ktx2"}
        return {
            "size": self.size,
            "normal": both(self.normal_path),
            "fresh": {"color": both(self.color_path), "roughness": both(self.rough_path)},
            "dried": {"color": both(self.dry_color_path), "roughness": both(self.dry_rough_path)},
            **({"skinMask": both(self.skin_path)} if self.skin_path else {}),
        }

    def ktx(self):
        """KTX2 copies with the tool Josh okayed. Colour is sRGB, data linear."""
        for q, srgb_tf in ((self.color_path, True), (self.dry_color_path, True),
                           (self.normal_path, False), (self.rough_path, False), (self.dry_rough_path, False)):
            ktx2(q, srgb_tf)
        if self.skin_path:
            ktx2(self.skin_path, False)

    def files(self):
        rel = lambda p: os.path.relpath(p, OUT).replace("\\", "/")
        return {
            "fresh": {"color": rel(self.color_path), "normal": rel(self.normal_path), "roughness": rel(self.rough_path)},
            "dried": {"color": rel(self.dry_color_path), "normal": rel(self.normal_path), "roughness": rel(self.dry_rough_path)},
        }


ALL_SETS = {}
KTX = "D:/solace-ai/tools/ktx/bin/ktx.exe"


def ktx2(png, srgb_tf):
    # NB the game loads the CHUNKS' (meat/bone/brain/scalp) KTX2s at 512², re-encoded from these
    # 1024² PNGs by scripts/survivorz/fx-gore-mem.mjs for graphics memory (Oct 26): after a
    # rebuild here, run that again or the effects go back over budget.
    import subprocess
    out = png[:-4] + ".ktx2"
    fmt = ["--format", "R8G8B8A8_SRGB", "--assign-tf", "srgb"] if srgb_tf else ["--format", "R8G8B8A8_UNORM", "--assign-tf", "linear"]
    if os.path.exists(out):
        os.remove(out)
    subprocess.run([KTX, "create", *fmt, "--encode", "uastc", "--uastc-quality", "2", "--uastc-rdo",
                    "--zstd", "18", "--generate-mipmap", png, out], check=True)


def material(ms):
    """A Principled material the glTF exporter turns into a plain PBR set."""
    m = bpy.data.materials.new(ms.sid)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    def tex(img):
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = img
        return t
    c = tex(ms.color)
    nt.links.new(c.outputs["Color"], bsdf.inputs["Base Color"])
    r = tex(ms.rough)
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(r.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs[0], bsdf.inputs["Roughness"])
    nrm = tex(ms.normal)
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(nrm.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    bsdf.inputs["Metallic"].default_value = 0.0
    # Wetness is carried by the roughness map. A clear coat over everything
    # read as cling film (tried first), so coat stays 0 and untouched: setting
    # its roughness alone makes the exporter write KHR_materials_clearcoat.
    if ms.coat > 0:
        for key in ("Coat Weight", "Clearcoat"):
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = ms.coat
                break
        for key in ("Coat Roughness", "Clearcoat Roughness"):
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = 0.06
                break
    for key in ("Specular IOR Level", "Specular"):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = 0.5
            break
    return m


# =============================================================================
# THE CROSS-SECTIONS. Each site is a list of structures inside a unit circle.
# x is the body's left/right, y is front (-) / back (+) in Blender terms.
# =============================================================================

SITES = {
    # one bone, central
    "upperarm": {"bones": [(0.02, 0.04, 0.22)], "fat": 0.06, "seed": 11},
    # radius and ulna side by side
    "forearm": {"bones": [(-0.30, 0.05, 0.14), (0.28, 0.12, 0.13)], "fat": 0.045, "seed": 23},
    # the femur, a little back of centre
    "thigh": {"bones": [(0.03, 0.10, 0.20)], "fat": 0.075, "seed": 37},
    # tibia toward the front, fibula behind and to the side
    "shin": {"bones": [(-0.05, -0.30, 0.22), (0.42, 0.18, 0.10)], "fat": 0.04, "seed": 41},
    # spine at the back, windpipe at the front
    "neck": {"bones": [], "fat": 0.05, "seed": 53, "neck": True},
}

COL = {
    "skin": (150, 132, 122), "skin_dead": (122, 118, 104), "skin_torn": (105, 38, 34),
    "fat": (196, 150, 78), "fat_dry": (150, 112, 62),
    "muscle": (104, 16, 16), "muscle_hi": (142, 30, 28), "clot": (62, 9, 10),
    "muscle_dry": (82, 28, 22), "fascia": (205, 178, 170),
    "bone": (212, 196, 164), "bone_dry": (196, 180, 150), "marrow": (132, 38, 26),
    "cord": (196, 150, 140), "cartilage": (214, 214, 206), "hole": (16, 4, 4),
    "blood": (92, 4, 4), "blood_dry": (40, 10, 8),
}


def cap_maps(site, piece):
    """Height, fresh colour/roughness, dried colour/roughness for a cap face."""
    cfg = SITES[site]
    seed = cfg["seed"]          # the piece is the same anatomy, mirrored
    n = TEX
    lin = (np.arange(n) + 0.5) / n * 2 * R_TEX - R_TEX
    x, y = np.meshgrid(lin, lin)          # [i, j]: y from i (bottom up), x from j
    if piece:
        x = -x                            # the far face is the mirror image
    r = np.sqrt(x * x + y * y)
    th = np.arctan2(y, x)
    texel = 2 * R_TEX / n

    big = fbm(n, 3.0, seed + 5, lo=1.5)           # broad lumps
    mid = fbm(n, 2.4, seed + 6, lo=4, hi=90)      # torn texture
    fine = fbm(n, 2.0, seed + 4, lo=20, hi=260)   # surface grain (normal map only)
    # warp the plane so nothing inside reads as a straight line
    wx = x + 0.10 * fbm(n, 3.0, seed + 8, lo=1.5)
    wy = y + 0.10 * fbm(n, 3.0, seed + 9, lo=1.5)

    # ragged boundaries: skin edge, skin/fat, fat/muscle
    edge = 1.0 + 0.03 * angular(th, seed + 1, 22, 0.9)
    skin_in = 0.965 + 0.012 * angular(th, seed + 2, 16)
    fat_in = skin_in - cfg["fat"] * (1 + 0.5 * angular(th, seed + 3, 9)) - 0.03 * big

    rng = np.random.default_rng(seed + 7)
    pts = rng.uniform(-0.95, 0.95, (22, 2))
    f1, f2 = voronoi(wx, wy, pts)
    gap = f2 - f1
    septa = (1 - smooth(0.0, 0.018, gap)) * (0.5 + 0.5 * smooth(-0.2, 0.5, mid))   # broken, faint
    dome = smooth(0.0, 0.28, gap)
    # fat globules
    gp = rng.uniform(-1.05, 1.05, (260, 2))
    g1, g2 = voronoi(wx, wy, gp)
    globule = smooth(0.0, 0.03, g2 - g1)

    # torn muscle: ridged noise, fibres running in a slow swirl
    torn = 1 - np.abs(fbm(n, 2.2, seed + 10, lo=6, hi=140))          # colour + normal map
    torn_geo = 1 - np.abs(fbm(n, 2.6, seed + 10, lo=4, hi=28))      # what the mesh can carry
    ang = rng.uniform(0, np.pi) + 1.2 * big
    fib = 0.5 + 0.5 * np.sin((wx * np.cos(ang) + wy * np.sin(ang)) * 70 + 6 * mid)

    m_out = smooth(edge - 0.008, edge + 0.008, r)                  # past the rim: the skirt's skin
    m_skin = smooth(skin_in - 0.006, skin_in + 0.006, r) * (1 - m_out)
    m_fat = smooth(fat_in - 0.012, fat_in + 0.006, r) * (1 - smooth(skin_in - 0.006, skin_in + 0.006, r))
    m_mus = 1 - smooth(fat_in - 0.012, fat_in + 0.006, r)

    h = np.zeros_like(r)
    h += m_mus * (0.03 + 0.06 * dome + 0.05 * big + 0.045 * torn_geo ** 2 - 0.02 * septa)
    h += m_fat * (0.012 + 0.02 * globule + 0.012 * big)
    lip = 0.012 * smooth(0.5, 0.9, angular(th, seed + 11, 30, 0.7))    # skin flaps curling up
    h += m_skin * (-0.004 + lip)
    h += m_out * (-0.03 - 0.03 * smooth(edge, edge + 0.15, r))

    color = np.zeros(r.shape + (3,))
    rough = np.zeros_like(r)
    dcolor = np.zeros_like(color)
    drough = np.zeros_like(r)

    skinw = np.zeros_like(r)    # how much of each texel is skin (the tint mask)

    def paint(mask, c, ro, dc, dro, skin=False):
        nonlocal color, rough, dcolor, drough, skinw
        mk = np.clip(mask, 0, 1)
        skinw = skinw * (1 - mk) + (mk if skin else 0)
        color = color * (1 - mk[..., None]) + mk[..., None] * c
        rough = rough * (1 - mk) + mk * ro
        dcolor = dcolor * (1 - mk[..., None]) + mk[..., None] * dc
        drough = drough * (1 - mk) + mk * dro

    def tone(c, *mods):
        out = srgb(c) * np.ones(r.shape + (3,))
        for m in mods:
            out = out * (m[..., None] if np.ndim(m) else m)
        return out

    bruise = smooth(-0.1, 0.7, big)
    # NEUTRAL skin (Survivorz effects, Oct 2026): the runtime multiplies each
    # zombie's own skin colour in through the skin mask, so the skirt never
    # shows as a tan ring on grey-green skin. Bruising and grain stay, as
    # luminance only.
    lum = 0.8 * (1 - 0.15 * bruise) * (0.92 + 0.08 * mid)
    skin_c = lum[..., None] * np.ones(3)
    paint(np.maximum(m_skin, m_out), skin_c, 0.55 + 0.08 * mid, skin_c * 0.9, 0.72, skin=True)
    # the raw torn edge where the skin let go
    raw = smooth(0.025, 0.0, np.abs(r - skin_in)) * (1 - m_out)
    paint(raw * 0.85, tone(COL["skin_torn"], 0.8 + 0.3 * mid), 0.2, tone(COL["blood_dry"], 1.2), 0.6)
    fat_c = tone(COL["fat"], 0.62 + 0.35 * globule, 0.9 + 0.12 * mid) * (1 - 0.45 * smooth(0.0, 0.7, mid))[..., None] + srgb(COL["blood"]) * (0.45 * smooth(0.0, 0.7, mid))[..., None]
    paint(m_fat, fat_c, 0.28 + 0.12 * (1 - globule), tone(COL["fat_dry"], 0.75 + 0.3 * globule), 0.6)
    # muscle: dark maroon in the hollows, brighter red on the torn ridges
    lift = smooth(0.2, 0.95, torn) * (0.5 + 0.5 * dome)
    mus_c = srgb(COL["clot"]) * (1 - lift)[..., None] + srgb(COL["muscle"]) * lift[..., None]
    hi = 0.25 * smooth(0.4, 0.9, fib) * lift
    mus_c = mus_c * (1 - hi)[..., None] + srgb(COL["muscle_hi"]) * hi[..., None]
    mus_c = mus_c * (0.85 + 0.25 * big)[..., None]
    paint(m_mus, mus_c, 0.2 + 0.16 * lift, tone(COL["muscle_dry"], 0.6 + 0.5 * lift), 0.58 + 0.15 * lift)
    paint(m_mus * septa * 0.45, tone(COL["fascia"], 0.8), 0.3, tone(COL["fascia"], 0.55), 0.6)

    # ---- bones ----
    for k, (bx, by, br) in enumerate(cfg["bones"]):
        d = np.sqrt((x - bx) ** 2 + (y - by) ** 2)
        ba = np.arctan2(y - by, x - bx)
        rim = br * (1 + 0.07 * angular(ba, seed + 20 + k, 8))
        m_b = 1 - smooth(rim - 0.006, rim + 0.006, d)
        m_marrow = 1 - smooth(rim * 0.58 - 0.008, rim * 0.58 + 0.008, d)
        m_cort = m_b * (1 - m_marrow)
        peri = smooth(rim + 0.035, rim, d) * (1 - m_b)                     # the sheath round it
        if piece:
            top = -0.005 + 0.015 * angular(ba, seed + 30 + k, 14)
        else:
            # the stump's bone stands proud, jagged where it snapped
            jag = angular(ba, seed + 30 + k, 7, 1.0)
            top = 0.22 + 0.16 * smooth(-0.4, 1.0, jag) + 0.03 * mid
        h = h * (1 - m_b) + m_b * (top - 0.06 * m_marrow * (1 - 0.3 * torn))
        h += peri * 0.014
        paint(peri * 0.75, tone(COL["fascia"], 0.75), 0.25, tone(COL["fascia"], 0.55), 0.6)
        stain = smooth(0.1, 0.7, mid + 0.4 * big)
        bone_c = srgb(COL["bone"]) * ((0.86 + 0.14 * mid) * (1 - 0.55 * stain))[..., None] + srgb(COL["blood"]) * (0.55 * stain)[..., None]
        bone_d = srgb(COL["bone_dry"]) * ((0.85 + 0.1 * mid) * (1 - 0.4 * stain))[..., None] + srgb(COL["blood_dry"]) * (0.4 * stain)[..., None]
        paint(m_cort, bone_c, 0.38 - 0.2 * stain, bone_d, 0.7)
        spongy = smooth(-0.2, 0.6, torn)
        paint(m_marrow, tone(COL["marrow"], 0.45 + 0.7 * spongy), 0.22 + 0.2 * spongy,
              tone(COL["blood_dry"], 0.8 + 0.6 * spongy), 0.62)

    # ---- the neck: spine at the back, windpipe and gullet at the front ----
    if cfg.get("neck"):
        def ring_mask(cx, cy, r0, r1=None, sq=1.0):
            d = np.sqrt((x - cx) ** 2 + ((y - cy) / sq) ** 2)
            a = 1 - smooth(r0 - 0.008, r0 + 0.008, d)
            if r1 is None:
                return a
            return a * smooth(r1 - 0.008, r1 + 0.008, d)
        vb = ring_mask(0.0, 0.30, 0.22, sq=0.8)
        arch = ring_mask(0.0, 0.58, 0.17, 0.11)
        cord = ring_mask(0.0, 0.58, 0.11)
        spinous = ring_mask(0.0, 0.80, 0.06, sq=1.8)
        spine = np.maximum(np.maximum(vb, arch), spinous)
        h = h * (1 - spine) + spine * ((0.0 if piece else 0.11) + 0.02 * mid)
        paint(spine, tone(COL["bone"], 0.85 + 0.15 * mid), 0.4, tone(COL["bone_dry"], 0.85 + 0.15 * mid), 0.7)
        h = h * (1 - cord) + cord * ((0.0 if piece else 0.06) - 0.01)
        paint(cord, tone(COL["cord"], 0.85 + 0.15 * mid), 0.22, tone(COL["cord"], 0.7), 0.55)
        tr = ring_mask(0.0, -0.52, 0.19, 0.12)
        tr_hole = ring_mask(0.0, -0.52, 0.12)
        h = h * (1 - tr) + tr * 0.05
        h = h * (1 - tr_hole) + tr_hole * -0.25
        paint(tr, tone(COL["cartilage"], 0.82 + 0.15 * mid), 0.28, tone(COL["cartilage"], 0.7), 0.6)
        paint(tr_hole, tone(COL["hole"]), 0.2, tone(COL["hole"]), 0.4)
        gu = ring_mask(0.0, -0.22, 0.13, sq=0.45)
        gu_slot = ring_mask(0.0, -0.22, 0.07, sq=0.25)
        h = h * (1 - gu) + gu * (0.03 - 0.06 * gu_slot)
        paint(gu, tone((160, 64, 66)), 0.18, tone((110, 50, 45)), 0.55)
        paint(gu_slot, tone(COL["hole"]), 0.2, tone(COL["hole"]), 0.4)
        for cx in (-0.40, 0.40):
            ca = ring_mask(cx, -0.30, 0.065, 0.035)
            ch = ring_mask(cx, -0.30, 0.035)
            h = h * (1 - ch) + ch * -0.08
            paint(ca, tone((150, 40, 40)), 0.2, tone((80, 25, 20)), 0.5)
            paint(ch, tone(COL["hole"]), 0.15, tone(COL["hole"]), 0.4)

    # ---- blood: wet, pooled in the hollows, smeared across the fat, dripping off the rim ----
    face = 1 - m_out
    hollow = smooth(0.45, 0.05, torn) * m_mus
    pool = np.clip(smooth(0.35, 0.8, mid + 0.6 * big) * face * (1 - smooth(0.9, 1.0, r)) * 0.8 + 0.6 * hollow, 0, 1)
    paint(pool * 0.8, tone(COL["blood"], 0.6 + 0.45 * smooth(-0.5, 0.8, mid)), 0.05,
          tone(COL["blood_dry"], 0.85 + 0.3 * mid), 0.5)
    drip_th = angular(th, seed + 40, 46, rough=0.5)
    drips = smooth(0.5, 0.8, drip_th) * smooth(0.96, 1.02, r) * (1 - smooth(1.04, 1.2 + 0.1 * drip_th, r))
    paint(drips * 0.9, tone(COL["blood"]), 0.05, tone(COL["blood_dry"]), 0.48)

    # geometry carries the shape; the normal map only the fine grain
    h_fine = 0.0012 * fine + (0.0010 * fib + 0.0022 * torn ** 2) * m_mus * (1 - 0.6 * pool) + 0.0008 * globule * m_fat
    normal = normal_from_height(h_fine, texel)
    rough = np.clip(rough + 0.04 * fine, 0.03, 1)
    drough = np.clip(drough + 0.05 * fine, 0.1, 1)
    mask = np.clip(skinw, 0, 1)[..., None].repeat(3, -1)
    return h, normal, color, rough[..., None].repeat(3, -1), dcolor, drough[..., None].repeat(3, -1), mask


def sample(arr, x, y):
    """Bilinear sample of a cap map at Blender (x, y)."""
    n = arr.shape[0]
    fj = (x + R_TEX) / (2 * R_TEX) * n - 0.5
    fi = (y + R_TEX) / (2 * R_TEX) * n - 0.5
    j0 = int(np.clip(np.floor(fj), 0, n - 2)); i0 = int(np.clip(np.floor(fi), 0, n - 2))
    tj = fj - j0; ti = fi - i0
    a = arr[i0, j0] * (1 - tj) + arr[i0, j0 + 1] * tj
    b = arr[i0 + 1, j0] * (1 - tj) + arr[i0 + 1, j0 + 1] * tj
    return a * (1 - ti) + b * ti


def build_cap(site, piece, h, mat, mirror_uv=False):
    """A polar mesh over the face, heights from the map, plus the skin skirt."""
    name = f"{site}-piece" if piece else site
    rings, segs = 64, 144
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    verts = []
    centre = bm.verts.new((0, 0, sample(h, 0, 0)))
    for k in range(1, rings + 1):
        rr = (k / rings) ** 0.9 * 1.04
        row = []
        for s in range(segs):
            a = 2 * math.pi * s / segs
            x, y = rr * math.cos(a), rr * math.sin(a)
            row.append(bm.verts.new((x, y, sample(h, x, y))))
        verts.append(row)
    # the skirt: skin tucking back into the body
    for depth, rr in ((-0.07, 1.035), (-0.13, 1.02), (-0.2, 0.995)):
        row = [bm.verts.new((rr * math.cos(2 * math.pi * s / segs), rr * math.sin(2 * math.pi * s / segs), depth)) for s in range(segs)]
        verts.append(row)
    # UVs: planar over the face; the skirt maps into the skin band past the rim
    def uv_of(v, ring_index):
        x, y = v.co.x, v.co.y
        if ring_index >= rings:
            rad = 1.08 + 0.05 * (ring_index - rings)
            a = math.atan2(y, x)
            x, y = rad * math.cos(a), rad * math.sin(a)
        u = (x + R_TEX) / (2 * R_TEX)
        return ((1 - u) if mirror_uv else u, (y + R_TEX) / (2 * R_TEX))
    def face(vs, ris):
        f = bm.faces.new(vs)
        for loop, v, ri in zip(f.loops, vs, ris):
            loop[uv].uv = uv_of(v, ri)
    for s in range(segs):
        face([centre, verts[0][s], verts[0][(s + 1) % segs]], [0, 0, 0])
    for k in range(len(verts) - 1):
        for s in range(segs):
            s2 = (s + 1) % segs
            face([verts[k][s], verts[k + 1][s], verts[k + 1][s2], verts[k][s2]], [k + 1, k + 2, k + 2, k + 1])
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(mat)
    # thin out the flat places, keep the detail at the bone and the rim
    dec = ob.modifiers.new("decimate", "DECIMATE")
    dec.ratio = 0.42
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.modifier_apply(modifier="decimate")
    ob.select_set(False)
    return ob


# =============================================================================
# EXPORT + REVIEW
# =============================================================================

def tri_count(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def bounds_gltf(ob):
    """Bounds in glTF axes: (x, z, -y) of Blender's."""
    vs = np.array([v.co[:] for v in ob.data.vertices])
    g = np.stack([vs[:, 0], vs[:, 2], -vs[:, 1]], axis=1)
    return {"min": [round(float(v), 4) for v in g.min(0)], "max": [round(float(v), 4) for v in g.max(0)]}


def export(ob, path):
    for o in bpy.context.scene.objects:
        o.select_set(o == ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_apply=True,
        export_image_format="AUTO" if flag("--embed") else "NONE", export_materials="EXPORT", export_yup=True,
        export_texcoords=True, export_normals=True, export_tangents=False,
    )


def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)


def review_stage():
    """Grey floor, one hard key light, a soft fill so the shadows aren't black."""
    sc = bpy.context.scene
    try:
        sc.render.engine = "CYCLES"
    except TypeError:
        pass
    sc.cycles.samples = 96
    sc.cycles.use_denoising = True
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for dev in ("OPTIX", "CUDA"):
            try:
                prefs.compute_device_type = dev
                prefs.get_devices()
                if any(d.type == dev for d in prefs.devices):
                    for d in prefs.devices:
                        d.use = d.type == dev
                    sc.cycles.device = "GPU"
                    break
            except TypeError:
                continue
    except Exception:
        pass
    sc.render.resolution_x = 900
    sc.render.resolution_y = 900
    sc.view_settings.exposure = -0.6
    sc.view_settings.view_transform = "AgX" if "AgX" in [i.identifier for i in bpy.types.ColorManagedViewSettings.bl_rna.properties["view_transform"].enum_items] else "Filmic"
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.02, 0.02, 0.022, 1)
    bg.inputs["Strength"].default_value = 1.0
    sc.world = world


def add_floor(size, z):
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, z))
    fl = bpy.context.active_object
    m = bpy.data.materials.new("floor")
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (0.18, 0.18, 0.18, 1)
    b.inputs["Roughness"].default_value = 0.8
    fl.data.materials.append(m)
    return fl


def add_lights(scale):
    key = bpy.data.lights.new("key", "SPOT")
    key.energy = 900 * scale * scale
    key.spot_size = math.radians(40)
    key.shadow_soft_size = 0.02 * scale
    k = bpy.data.objects.new("key", key)
    k.location = (2.2 * scale, -1.6 * scale, 3.0 * scale)
    k.rotation_euler = (math.radians(42), 0, math.radians(54))
    bpy.context.scene.collection.objects.link(k)
    fill = bpy.data.lights.new("fill", "AREA")
    fill.energy = 60 * scale * scale
    fill.size = 3 * scale
    f = bpy.data.objects.new("fill", fill)
    f.location = (-2.5 * scale, 1.5 * scale, 2.0 * scale)
    f.rotation_euler = (math.radians(-40), math.radians(-35), 0)
    bpy.context.scene.collection.objects.link(f)
    # aim both at the origin
    for ob in (k, f):
        c = ob.constraints.new("TRACK_TO")
        tgt = bpy.data.objects.get("aim") or bpy.data.objects.new("aim", None)
        if tgt.name not in bpy.context.scene.collection.objects:
            bpy.context.scene.collection.objects.link(tgt)
        c.target = tgt
        c.track_axis = "TRACK_NEGATIVE_Z"
        c.up_axis = "UP_Y"


def render(path, dist, elev_deg, azim_deg, target=(0, 0, 0), lens=60):
    cam_d = bpy.data.cameras.new("cam")
    cam_d.lens = lens
    cam = bpy.data.objects.new("cam", cam_d)
    bpy.context.scene.collection.objects.link(cam)
    e, a = math.radians(elev_deg), math.radians(azim_deg)
    cam.location = (target[0] + dist * math.cos(e) * math.sin(a), target[1] - dist * math.cos(e) * math.cos(a), target[2] + dist * math.sin(e))
    aim = bpy.data.objects.get("aim")
    aim.location = target
    c = cam.constraints.new("TRACK_TO")
    c.target = aim
    c.track_axis = "TRACK_NEGATIVE_Z"
    c.up_axis = "UP_Y"
    bpy.context.scene.camera = cam
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)


def review_cap(ob, name, site):
    """The cap on the end of a plain limb lying on the floor, so it reads as a
    severed limb and not as a dish. The limb is for the review only."""
    review_stage()
    rig = bpy.data.objects.new("rig", None)
    bpy.context.scene.collection.objects.link(rig)
    ob.parent = rig
    length = 1.6 if site == "neck" else 3.2
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=1.0, depth=length, location=(0, 0, -0.18 - length / 2))
    stub = bpy.context.active_object
    m = bpy.data.materials.new("stub")
    m.use_nodes = True
    b = next(nd for nd in m.node_tree.nodes if nd.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (0.16, 0.135, 0.115, 1)
    b.inputs["Roughness"].default_value = 0.6
    stub.data.materials.append(m)
    for p in stub.data.polygons:
        p.use_smooth = True
    stub.parent = rig
    # lie it along the floor with the cut facing the camera
    rig.rotation_euler = (math.radians(90), 0, 0)
    rig.location = (0, 0, 1.0)
    add_floor(14, -0.002)
    add_lights(1.0)
    render(os.path.join(OUT, "review", f"cap-{name}.png"), 4.4, 30, 48, (0, 0.3, 0.9))
    render(os.path.join(OUT, "review", f"cap-{name}-face.png"), 4.3, 10, 0, (0, 0, 1.0), lens=60)


# =============================================================================
# THE GIBS. Real metres. Each one uses tileable sets (meat, bone, brain,
# scalp); a set's maps tile, so any UV layout works.
# =============================================================================

def pvoronoi(u, v, pts):
    """Periodic F1/F2 on the unit square."""
    du = np.abs(u[..., None] - pts[:, 0]); du = np.minimum(du, 1 - du)
    dv = np.abs(v[..., None] - pts[:, 1]); dv = np.minimum(dv, 1 - dv)
    d = np.sqrt(du * du + dv * dv)
    d.sort(axis=-1)
    return d[..., 0], d[..., 1]


def tile_maps(kind, seed):
    n = TEX
    g = (np.arange(n) + 0.5) / n
    u, v = np.meshgrid(g, g)
    big = fbm(n, 3.0, seed + 1, lo=1)
    mid = fbm(n, 2.4, seed + 2, lo=3, hi=80)
    fine = fbm(n, 2.0, seed + 3, lo=16, hi=260)
    ridged = 1 - np.abs(fbm(n, 2.3, seed + 4, lo=4, hi=120))
    rng = np.random.default_rng(seed + 5)
    texel = 1.0 / n
    blood = smooth(0.25, 0.75, mid + 0.6 * big)

    def mixc(a, b, t):
        return srgb(a) * (1 - t)[..., None] + srgb(b) * t[..., None]

    if kind == "meat":
        f1, f2 = pvoronoi(u, v, rng.uniform(0, 1, (18, 2)))
        dome = smooth(0.0, 0.2, f2 - f1)
        fib = 0.5 + 0.5 * np.sin(2 * np.pi * 24 * (u + 0.15 * big))
        lift = smooth(0.2, 0.95, ridged) * (0.5 + 0.5 * dome)
        col = mixc(COL["clot"], COL["muscle"], lift)
        col = col * (1 - 0.25 * fib * lift)[..., None] + srgb(COL["muscle_hi"]) * (0.25 * fib * lift)[..., None]
        fat = smooth(0.55, 0.75, fbm(n, 2.8, seed + 6, lo=2))
        col = col * (1 - fat)[..., None] + srgb(COL["fat"]) * (0.8 + 0.3 * fine)[..., None] * fat[..., None]
        col = col * (1 - 0.3 * blood)[..., None] + srgb(COL["blood"]) * (0.3 * blood)[..., None]
        col = col * (0.75 + 0.35 * big)[..., None]
        rough = 0.34 + 0.18 * lift - 0.22 * blood
        dcol = mixc(COL["blood_dry"], COL["muscle_dry"], lift) * (0.8 + 0.3 * big)[..., None]
        drough = 0.6 + 0.12 * lift
        chunky = 1 - np.abs(fbm(n, 2.6, seed + 12, lo=2, hi=36))
        hf = 0.006 * chunky ** 2 + 0.0015 * fib + 0.0002 * fine
        wet = smooth(0.35, 0.7, mid + 0.5 * big)
        col = col * (1 - 0.35 * wet)[..., None] + srgb(COL["blood"]) * (0.35 * wet)[..., None]
        rough = rough * (1 - wet) + 0.07 * wet
    elif kind == "bone":
        pores = smooth(0.62, 0.8, fbm(n, 1.6, seed + 7, lo=30, hi=300))
        crack = 1 - smooth(0.0, 0.015, np.abs(fbm(n, 2.6, seed + 8, lo=3, hi=40)))
        col = srgb(COL["bone"]) * (0.85 + 0.15 * mid)[..., None]
        col = col * (1 - 0.6 * pores)[..., None] + srgb(COL["marrow"]) * (0.6 * pores)[..., None]
        col = col * (1 - 0.5 * crack)[..., None] + srgb((90, 60, 40)) * (0.5 * crack)[..., None]
        st = blood * 0.65
        col = col * (1 - st)[..., None] + srgb(COL["blood"]) * st[..., None]
        rough = 0.42 - 0.3 * st
        dcol = srgb(COL["bone_dry"]) * (0.85 + 0.15 * mid)[..., None] * (1 - 0.45 * st)[..., None] + srgb(COL["blood_dry"]) * (0.45 * st)[..., None]
        drough = 0.72 - 0.1 * st
        hf = -0.0015 * pores - 0.002 * crack + 0.0006 * fine
    elif kind == "brain":
        crease = 1 - smooth(0.0, 0.10, np.abs(fbm(n, 2.6, seed + 13, lo=3, hi=40)))
        sulci = 1 - crease
        col = mixc((80, 30, 34), (192, 146, 144), sulci) * (0.88 + 0.2 * smooth(0.1, 0.6, np.abs(fbm(n, 2.6, seed + 13, lo=3, hi=40))))[..., None] * (0.9 + 0.15 * fine)[..., None]
        vein = 1 - smooth(0.0, 0.02, np.abs(fbm(n, 2.4, seed + 9, lo=4, hi=60)))
        col = col * (1 - 0.6 * vein)[..., None] + srgb((120, 20, 24)) * (0.6 * vein)[..., None]
        st = blood * 0.5
        col = col * (1 - st)[..., None] + srgb(COL["blood"]) * st[..., None]
        rough = 0.2 + 0.1 * sulci - 0.12 * st
        dcol = mixc((80, 50, 48), (140, 110, 100), sulci) * (1 - 0.4 * st)[..., None] + srgb(COL["blood_dry"]) * (0.4 * st)[..., None]
        drough = 0.55
        hf = -0.006 * crease + 0.004 * smooth(0.0, 0.5, np.abs(fbm(n, 2.6, seed + 13, lo=3, hi=40))) + 0.0006 * fine
    else:  # scalp: dead skin with matted dark hair, blood in it
        strands = fbm(n, 1.8, seed + 10, lo=8, hi=300, ax=0.18, ay=1.0)
        clumps = smooth(-0.35, 0.15, fbm(n, 2.8, seed + 11, lo=2) + 0.2)
        hair = clumps * (0.55 + 0.45 * smooth(-0.3, 0.5, strands))
        skin = srgb(COL["skin_dead"]) * (0.85 + 0.15 * mid)[..., None]
        col = skin * (1 - 0.92 * hair)[..., None] + srgb((20, 15, 12)) * (0.92 * hair)[..., None]
        st = blood * 0.6
        col = col * (1 - st)[..., None] + srgb(COL["blood"]) * st[..., None]
        rough = 0.55 - 0.15 * hair - 0.35 * st
        dcol = col * 0.85 + srgb(COL["blood_dry"]) * (0.2 * st)[..., None]
        drough = 0.7
        hf = 0.003 * hair * (0.5 + 0.5 * strands) + 0.0005 * fine
    normal = normal_from_height(hf * 1.4, texel)
    rough = np.clip(rough + 0.03 * fine, 0.03, 1)
    drough = np.clip(drough + 0.04 * fine, 0.1, 1) * np.ones_like(rough)
    rep = lambda a: a[..., None].repeat(3, -1)
    return color_clip(col), normal, rep(rough), color_clip(dcol), rep(drough)


def color_clip(c):
    return np.clip(c, 0, 1)


_SETS = {}
def tile_material(kind):
    if kind not in _SETS:
        col, nrm, ro, dcol, dro = tile_maps(kind, {"meat": 101, "bone": 202, "brain": 303, "scalp": 404}[kind])
        ms = MapSet("gib-" + kind, col, nrm, ro, 0.0, dcol, dro, sid=kind)
        _SETS[kind] = (ms, material(ms))
    return _SETS[kind]


class Noise3:
    """Cheap smooth 3D noise: a sum of random plane waves."""
    def __init__(self, seed, waves=24, freq=1.0, rough=1.0):
        rng = np.random.default_rng(seed)
        self.k = rng.standard_normal((waves, 3))
        self.k /= np.linalg.norm(self.k, axis=1, keepdims=True)
        mags = freq * (1.6 ** rng.uniform(0, 4, waves))
        self.k *= mags[:, None]
        self.a = 1.0 / mags ** rough
        self.p = rng.uniform(0, 2 * np.pi, waves)
        self.norm = np.abs(self.a).sum() * 0.5
    def __call__(self, P):
        return (np.sin(P @ self.k.T + self.p) @ self.a) / self.norm


def blob(name, size, seed, kind="meat", subdiv=None):
    """A torn chunk. Meat: lumps, two flat cut faces, fibres along one axis,
    a shredded surface. Brain: rounded folds with sharp creases between them."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv or (5 if kind == "brain" else 6), radius=1.0)
    P = np.array([v.co[:] for v in bm.verts])
    rng = np.random.default_rng(seed)
    d = 1 + 0.28 * Noise3(seed, freq=1.2)(P)
    if kind == "brain":
        nf = Noise3(seed + 2, waves=48, freq=7.0, rough=0.35)(P)
        folds = np.sqrt(nf * nf + 0.015)
        d += 0.24 * folds - 0.1
        d += 0.03 * Noise3(seed + 3, freq=14.0)(P)
    else:
        # fibres: noise stretched along a random axis, so it streaks
        ax = rng.standard_normal(3); ax /= np.linalg.norm(ax)
        along = P @ ax
        stretched = P - np.outer(along, ax) * 0.85
        d += 0.07 * (1 - np.abs(Noise3(seed + 4, waves=40, freq=9.0, rough=0.5)(stretched * 1.6)))
        d += 0.04 * Noise3(seed + 5, waves=30, freq=18.0, rough=0.6)(P)
    P = P * d[:, None]
    if kind != "brain":
        # where it was cut or torn off: flatten against a couple of planes
        for _ in range(2):
            nrm = rng.standard_normal(3); nrm /= np.linalg.norm(nrm)
            off = rng.uniform(0.45, 0.7)
            h = P @ nrm
            over = h > off
            jag = 0.05 * Noise3(seed + 9, freq=10.0)(P[over])
            P[over] -= np.outer(h[over] - off - jag, nrm)
    P = P * np.array(size)
    for v, p in zip(bm.verts, P):
        v.co = p
    return finish(bm, name)


def finish(bm, name, mats=None):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    for p in me.polygons:
        p.use_smooth = True
    return ob


def decimate_to(ob, tris):
    now = tri_count(ob)
    if now <= tris:
        return
    dec = ob.modifiers.new("dec", "DECIMATE")
    dec.ratio = tris / now
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier="dec")


def unwrap(ob):
    for o in bpy.context.scene.objects:
        o.select_set(o == ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.01)
    bpy.ops.object.mode_set(mode="OBJECT")


def project_uvs(ob, mode, tile=0.08):
    """Seamless UVs for the tiling sets. A sphere wraps an integer number of
    tiles round its middle so the seam lands on a tile edge; a shell is
    projected from above; a shard round its own long axis."""
    me = ob.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uvl = me.uv_layers.active.data
    co = np.array([v.co[:] for v in me.vertices])
    c = co.mean(0)
    rad = float(np.linalg.norm(co - c, axis=1).mean())
    for poly in me.polygons:
        uvs = []
        for li in poly.loop_indices:
            p = co[me.loops[li].vertex_index] - c
            if mode == "sphere":
                wraps = max(1, round(2 * math.pi * rad / tile))
                u = (math.atan2(p[1], p[0]) / (2 * math.pi) + 0.5) * wraps
                v = math.acos(max(-1, min(1, p[2] / (np.linalg.norm(p) + 1e-9)))) * rad / tile
            elif mode == "cylinder":
                u = math.atan2(p[1], p[0]) / (2 * math.pi) + 0.5
                v = p[2] / tile
            else:  # top
                u, v = p[0] / tile, p[1] / tile
            uvs.append([u, v])
        if mode in ("sphere", "cylinder"):
            us = [q[0] for q in uvs]
            span = 1 if mode == "cylinder" else max(1, round(2 * math.pi * rad / tile))
            if max(us) - min(us) > span / 2:
                for q in uvs:
                    if q[0] < span / 2:
                        q[0] += span
        for li, q in zip(poly.loop_indices, uvs):
            uvl[li].uv = q


def centre(ob):
    for o in bpy.context.scene.objects:
        o.select_set(o == ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.origin_set(type="ORIGIN_CENTER_OF_VOLUME", center="MEDIAN")
    ob.location = (0, 0, 0)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def skull_fragment(name, seed, span):
    """A curved piece of the vault: scalp outside, bone inside and on the break.
    A polar grid over a spherical cap whose outline is ragged, so the break is
    a jagged line rather than a staircase."""
    R0 = 0.092
    bm = bmesh.new()
    rings, segs = 16, 64
    phis = np.linspace(0, 2 * np.pi, segs, endpoint=False)
    outline = math.radians(span) * (1 + 0.3 * angular(phis, seed, 14, 0.8))
    bumps = Noise3(seed + 1, freq=30.0)
    centre_v = bm.verts.new((0, 0, R0))
    rows = []
    for k in range(1, rings + 1):
        row = []
        for s, phi in enumerate(phis):
            th = outline[s] * k / rings
            p = np.array([math.sin(th) * math.cos(phi), math.sin(th) * math.sin(phi), math.cos(th)]) * R0
            p *= 1 + 0.01 * bumps(p[None])[0]
            row.append(bm.verts.new(p))
        rows.append(row)
    for s in range(segs):
        bm.faces.new([centre_v, rows[0][s], rows[0][(s + 1) % segs]])
    for k in range(rings - 1):
        for s in range(segs):
            s2 = (s + 1) % segs
            bm.faces.new([rows[k][s], rows[k + 1][s], rows[k + 1][s2], rows[k][s2]])
    ob = finish(bm, name)
    sol = ob.modifiers.new("sol", "SOLIDIFY")
    sol.thickness = 0.007
    sol.offset = -1
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier="sol")
    scalp = tile_material("scalp")[1]
    bone = tile_material("bone")[1]
    ob.data.materials.append(scalp)
    ob.data.materials.append(bone)
    # outer faces (pointing away from the skull's centre) are scalp
    for p in ob.data.polygons:
        c = np.array(p.center[:]); nrm = np.array(p.normal[:])
        p.material_index = 0 if np.linalg.norm(c) > 0.0895 else 1
    return ob


def jaw(name, seed):
    """A lower jaw torn free: the U of the mandible, one branch snapped, teeth."""
    bm = bmesh.new()
    prof = []
    steps = 34
    for i in range(steps + 1):
        t = i / steps
        a = -math.pi * 0.62 + t * math.pi * 1.24 * 0.86     # the right branch stops short: snapped
        x = 0.045 * math.sin(a)
        y = -0.05 * math.cos(a) + 0.02
        prof.append((x, y, a))
    rings = []
    for x, y, a in prof:
        tx, ty = math.cos(a), math.sin(a)
        nx, ny = -ty * 0.0 + math.sin(a), -math.cos(a)
        ring = []
        for (dz, dw) in ((0.0, -0.006), (0.0, 0.006), (-0.026, 0.007), (-0.03, 0.0), (-0.026, -0.007)):
            ring.append(bm.verts.new((x + nx * dw, y + ny * dw, dz)))
        rings.append(ring)
    for k in range(len(rings) - 1):
        a, b = rings[k], rings[k + 1]
        for s in range(5):
            bm.faces.new([a[s], a[(s + 1) % 5], b[(s + 1) % 5], b[s]])
    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[-1])
    # the ramus going up on the intact side
    x0, y0, a0 = prof[0]
    base = rings[0]
    top = [bm.verts.new((v.co.x - 0.004, v.co.y + 0.012, v.co.z + 0.045)) for v in base]
    for s in range(5):
        bm.faces.new([base[s], top[s], top[(s + 1) % 5], base[(s + 1) % 5]])
    bm.faces.new(top[::-1])
    jaw_faces = len(bm.faces)
    # teeth along the top edge
    for i in range(3, steps - 1, 2):
        x, y, a = prof[i]
        w = 0.0042 if 10 < i < 24 else 0.0055
        res = bmesh.ops.create_cube(bm, size=1.0)
        hgt = 0.009 + 0.002 * math.sin(i * 1.7)
        for v in res["verts"]:
            v.co.x = x + v.co.x * w
            v.co.y = y + v.co.y * 0.006
            v.co.z = 0.004 + (v.co.z + 0.5) * hgt
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True)
    P = np.array([v.co[:] for v in bm.verts])
    nz = Noise3(seed, freq=180.0)
    for v, d in zip(bm.verts, nz(P)):
        v.co.z += 0.0008 * d
    ob = finish(bm, name)
    bone = tile_material("bone")[1]
    ob.data.materials.append(bone)
    ob.data.materials.append(tile_material("meat")[1])
    sm = ob.modifiers.new("sm", "SMOOTH")
    sm.iterations = 2
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier="sm")
    # the gums along the top of the bone, and raw meat where it snapped
    end = np.array(prof[-1][:2])
    for p in ob.data.polygons:
        c = np.array(p.center[:])
        if abs(c[2]) < 0.0025 or np.linalg.norm(c[:2] - end) < 0.009:
            p.material_index = 1
    return ob


def splinter(name, seed, length, width):
    bm = bmesh.new()
    segs, rings = 9, 14
    nz = Noise3(seed, freq=60.0)
    verts = []
    for k in range(rings + 1):
        t = k / rings
        taper = (1 - t) ** 0.7 * (0.6 + 0.4 * math.sin(math.pi * min(1, t * 2.2)))
        row = []
        for s in range(segs):
            a = 2 * math.pi * s / segs
            rr = width * taper * (1 + 0.25 * math.sin(3 * a + seed))
            p = np.array([rr * math.cos(a), rr * math.sin(a) * 0.7, length * t - length / 2])
            p += 0.25 * width * nz(p[None] * 3)[0]
            row.append(bm.verts.new(p))
        verts.append(row)
    for k in range(rings):
        for s in range(segs):
            bm.faces.new([verts[k][s], verts[k][(s + 1) % segs], verts[k + 1][(s + 1) % segs], verts[k + 1][s]])
    bm.faces.new(verts[0][::-1])
    ob = finish(bm, name)
    ob.data.materials.append(tile_material("bone")[1])
    return ob


GIBS = [
    ("meat-a", "meat", lambda: blob("meat-a", (0.045, 0.032, 0.026), 11)),
    ("meat-b", "meat", lambda: blob("meat-b", (0.03, 0.026, 0.018), 12)),
    ("meat-c", "meat", lambda: blob("meat-c", (0.06, 0.022, 0.016), 13)),
    ("brain-a", "brain", lambda: blob("brain-a", (0.035, 0.028, 0.022), 21, kind="brain")),
    ("brain-b", "brain", lambda: blob("brain-b", (0.022, 0.018, 0.014), 22, kind="brain")),
    ("skull-a", "skull", lambda: skull_fragment("skull-a", 31, 34)),
    ("skull-b", "skull", lambda: skull_fragment("skull-b", 32, 22)),
    ("jaw", "bone", lambda: jaw("jaw", 41)),
    ("splinter-a", "bone", lambda: splinter("splinter-a", 51, 0.075, 0.007)),
    ("splinter-b", "bone", lambda: splinter("splinter-b", 52, 0.045, 0.005)),
]


def build_gibs(only, manifest):
    for name, kind, make in GIBS:
        if only and name not in only:
            continue
        clear_scene()
        ob = make()
        if not ob.data.materials:
            ob.data.materials.append(tile_material(kind)[1])
        decimate_to(ob, 1900)
        mode = {"meat": "sphere", "brain": "sphere", "skull": "top"}.get(kind, "cylinder" if name.startswith("splinter") else "smart")
        if mode == "smart":
            unwrap(ob)
            k = max(ob.dimensions) / 0.08          # one tile is about 8 cm of flesh
            for loop in ob.data.uv_layers.active.data:
                loop.uv = (loop.uv[0] * k, loop.uv[1] * k)
        else:
            project_uvs(ob, mode)
        centre(ob)
        glb = os.path.join(OUT, "gibs", name + ".glb")
        export(ob, glb)
        sets = [m.name for m in ob.data.materials]
        entry = {"name": name, "kind": kind, "file": f"gibs/{name}.glb", "triangles": tri_count(ob),
                 "bounds": bounds_gltf(ob), "bytes": os.path.getsize(glb),
                 **({"set": sets[0]} if len(sets) == 1 else {"sets": {m: m for m in sets}})}
        manifest["gibs"] = [g for g in manifest["gibs"] if g["name"] != name] + [entry]
        print(f"[gore] gib {name}: {entry['triangles']} tris, {entry['bytes'] // 1024} KB", flush=True)
        if not flag("--no-render"):
            review_stage()
            add_floor(3, float(np.array([v.co[2] for v in ob.data.vertices]).min()))
            add_lights(0.12)
            ext = max(ob.dimensions)
            render(os.path.join(OUT, "review", f"gib-{name}.png"), ext * 3.4, 38, 30, (0, 0, 0))


# =============================================================================
# MAIN
# =============================================================================

def main():
    only = set(opt("--only", "").split(",")) - {""}
    manifest = {"made": None, "contract": {
        "caps": "origin = centre of the cut; +Y out of the body; +Z toward the body's front; radius 1; skin skirt to y=-0.2",
        "gibs": "real metres; origin at the piece's centre of mass",
        "textures": "GLBs carry no images. Each piece names its set (\"set\", or \"sets\" by material name for a piece with two); load each set once from \"sets\" below and bind it to every piece that uses it. Colour is sRGB, normal and roughness linear; KTX2 (UASTC, mipmapped) with the PNG as the fallback; metallic 0",
        "uv": "glTF-standard UVs (KTX2 and PNG are both stored top row first)",
    }, "sets": {}, "caps": [], "gibs": []}
    path_json = os.path.join(OUT, "gore.json")
    if os.path.exists(path_json):
        try:
            old = json.load(open(path_json))
            manifest["caps"] = old.get("caps", [])
            manifest["gibs"] = old.get("gibs", [])
            manifest["sets"] = old.get("sets", {})
        except Exception:
            pass

    if not flag("--gibs-only"):
        for site in SITES:
            if only and site not in only:
                continue
            h, normal, color, rough, dcolor, drough, skin = cap_maps(site, False)
            ms = MapSet("cap-" + site, color, normal, rough, 0.0, dcolor, drough, sid="cap-" + site, size=512, skin_mask=skin)
            mat = material(ms)
            for piece in (False, True):
                clear_scene()
                name = f"{site}-piece" if piece else site
                if piece:
                    h = cap_maps(site, True)[0]   # its own height; colour and mask are the stump's, mirrored
                ob = build_cap(site, piece, h, mat, mirror_uv=piece)
                glb = os.path.join(OUT, "caps", name + ".glb")
                export(ob, glb)
                entry = {"name": name, "site": site, "side": "piece" if piece else "stump",
                         "file": f"caps/{name}.glb", "triangles": tri_count(ob), "bounds": bounds_gltf(ob),
                         "set": ms.sid, "bytes": os.path.getsize(glb)}
                manifest["caps"] = [c for c in manifest["caps"] if c["name"] != name] + [entry]
                print(f"[gore] cap {name}: {entry['triangles']} tris, {entry['bytes'] // 1024} KB", flush=True)
                if not flag("--no-render"):
                    review_cap(ob, name, site)

    if not flag("--caps-only"):
        build_gibs(only, manifest)

    for sid, ms in ALL_SETS.items():
        if not flag("--no-ktx"):
            ms.ktx()
        manifest["sets"][sid] = ms.entry()
        print(f"[gore] set {sid}: {ms.size}px", flush=True)
    manifest["sets"] = dict(sorted(manifest["sets"].items()))

    manifest["caps"].sort(key=lambda c: c["name"])
    manifest["gibs"].sort(key=lambda c: c["name"])
    import datetime
    manifest["made"] = datetime.datetime.now().isoformat(timespec="seconds")
    json.dump(manifest, open(path_json, "w"), indent=2)
    print("[gore] wrote", path_json, flush=True)


main()
