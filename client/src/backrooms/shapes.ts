// SHAPES — the prop kit's drawn solids (src/backrooms/kit.ts KIT_SHAPES):
// cube, cylinder, pyramid, cone, sphere, pillar, square pillar and wedge, at
// whatever size the placement says, wearing any surface from the catalogue
// (surfaces.ts) or plain paint (Josh, Oct 2026: "geometrical shape that I can
// place and texture, scale, resize, and edit"). One builder for the game
// (world.ts) and the map editor's preview, so a shape reads the same in both
// (the reuse law).
//
// The object sits the way every kit model sits: its origin at the middle of
// its BASE, its front towards +z, so the kit's placement rule puts it where
// the editor shows it. The geometry is built AT SIZE (never a scaled unit
// mesh) and its UVs are projected in world metres, so a texture tiles at the
// same scale on a shape as on the walls beside it, however big the shape is.
//
// The surface materials belong to world.ts (they carry baked light in their
// vertex colours, like every surface in the game): the caller hands in a
// resolver rather than this module importing world.ts back.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** A surface material and how many metres one UV unit covers on it. */
export interface ShapeSurface {
  mat: THREE.Material;
  uM: number;
  vM: number;
}

export interface ShapeSpec {
  /** Width, height, depth in metres. */
  sx: number;
  sy: number;
  sz: number;
  /** Surface id (surfaces.ts), or none for plain paint. */
  tex?: string;
  /** "#rrggbb": the paint, or a tint over the surface. */
  col?: string;
  /** Vertex light (the game's baked-light convention; 1 = as lit). */
  light?: number;
}

const PAINT = "#bdb6a8";
const paintMats = new Map<string, THREE.Material>();
const tintMats = new Map<string, THREE.Material>();

function paintMat(col: string): THREE.Material {
  let m = paintMats.get(col);
  if (!m) paintMats.set(col, (m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.82, vertexColors: true })));
  return m;
}
function tinted(base: THREE.Material, key: string, col: string): THREE.Material {
  const k = `${key}|${col}`;
  let m = tintMats.get(k);
  if (!m) {
    const c = base.clone() as THREE.MeshStandardMaterial;
    if (c.color) c.color.set(col);
    tintMats.set(k, (m = c));
  }
  return m;
}

/** UVs projected in metres off whichever axis each triangle faces (a box
 *  projection), so every shape tiles a texture at its real size. */
function boxUV(g: THREE.BufferGeometry, uM: number, vM: number): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  // keep the builder's own (smooth) normals — recomputing them on a
  // non-indexed mesh would facet every sphere and cylinder
  if (!ng.getAttribute("normal")) ng.computeVertexNormals();
  const p = ng.getAttribute("position") as THREE.BufferAttribute;
  const n = ng.getAttribute("normal") as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i += 3) {
    // one projection per triangle (its own face normal), so a face never
    // tears across two projections
    let ax = 0, ay = 0, az = 0;
    for (let k = 0; k < 3; k++) {
      ax += n.getX(i + k);
      ay += n.getY(i + k);
      az += n.getZ(i + k);
    }
    const X = Math.abs(ax), Y = Math.abs(ay), Z = Math.abs(az);
    for (let k = 0; k < 3; k++) {
      const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k);
      let u: number, v: number;
      if (Y >= X && Y >= Z) {
        u = x;
        v = z;
      } else if (X >= Z) {
        u = z;
        v = y;
      } else {
        u = x;
        v = y;
      }
      uv[(i + k) * 2] = u / uM;
      uv[(i + k) * 2 + 1] = v / vM;
    }
  }
  ng.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return ng;
}

/** Strip a geometry to position + normal so different builders merge. */
function bare(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(ng.attributes)) if (k !== "position" && k !== "normal") ng.deleteAttribute(k);
  return ng;
}

/** The solid itself, base on y = 0, centred on x and z, at its real size. */
function solid(kind: string, sx: number, sy: number, sz: number): THREE.BufferGeometry {
  let g: THREE.BufferGeometry;
  switch (kind) {
    case "cylinder":
      g = new THREE.CylinderGeometry(0.5, 0.5, 1, 28, 1);
      g.scale(sx, sy, sz);
      break;
    case "cone":
      g = new THREE.CylinderGeometry(0, 0.5, 1, 28, 1);
      g.scale(sx, sy, sz);
      break;
    case "pyramid":
      // four sides, its base a square: a 4-sided cone turned to square up
      g = new THREE.CylinderGeometry(0, Math.SQRT1_2, 1, 4, 1);
      g.rotateY(Math.PI / 4);
      g.scale(sx, sy, sz);
      break;
    case "sphere":
      g = new THREE.SphereGeometry(0.5, 28, 18);
      g.scale(sx, sy, sz);
      break;
    case "pillar":
    case "square-pillar": {
      // a shaft between a plinth and a capital, each a ninth of the height
      const band = Math.min(sy * 0.11, 0.35);
      const shaft =
        kind === "pillar" ? new THREE.CylinderGeometry(0.42, 0.42, 1, 24, 1) : new THREE.BoxGeometry(0.84, 1, 0.84);
      shaft.scale(sx, Math.max(0.01, sy - band * 2), sz);
      const plinth = new THREE.BoxGeometry(sx, band, sz);
      plinth.translate(0, -(sy - band) / 2, 0);
      const cap = new THREE.BoxGeometry(sx, band, sz);
      cap.translate(0, (sy - band) / 2, 0);
      g = mergeGeometries([bare(shaft), bare(plinth), bare(cap)])!;
      break;
    }
    case "wedge": {
      // a ramp: full height at the back (−z), down to nothing at the front
      const sh = new THREE.Shape();
      sh.moveTo(-0.5, -0.5);
      sh.lineTo(0.5, -0.5);
      sh.lineTo(-0.5, 0.5);
      sh.lineTo(-0.5, -0.5);
      g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false });
      g.translate(0, 0, -0.5);
      // the shape was drawn in (z, y): turn it so the slope faces +z
      g.rotateY(-Math.PI / 2);
      g.scale(sx, sy, sz);
      break;
    }
    default:
      g = new THREE.BoxGeometry(sx, sy, sz);
  }
  g.translate(0, sy / 2, 0);
  return g;
}

/**
 * Build a shape. `file` is its kit variant ("shape-cube"); `surface` resolves
 * a surface id to the game's material for it.
 */
export function makeShape(file: string, spec: ShapeSpec, surface: (id: string) => ShapeSurface | null): THREE.Object3D {
  const kind = file.replace(/^shape-/, "");
  const sx = Math.max(0.05, spec.sx);
  const sy = Math.max(0.05, spec.sy);
  const sz = Math.max(0.05, spec.sz);
  const s = spec.tex ? surface(spec.tex) : null;
  const g = boxUV(solid(kind, sx, sy, sz), s?.uM ?? 1, s?.vM ?? 1);
  g.setAttribute("color", new THREE.Float32BufferAttribute(new Array(g.getAttribute("position").count * 3).fill(spec.light ?? 1), 3));
  let mat: THREE.Material;
  if (s) mat = spec.col ? tinted(s.mat, spec.tex!, spec.col) : s.mat;
  else mat = paintMat(spec.col ?? PAINT);
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = "shape";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const holder = new THREE.Group();
  holder.add(mesh);
  return holder;
}
