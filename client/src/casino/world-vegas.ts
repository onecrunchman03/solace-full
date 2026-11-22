// THE BOULEVARD'S DRESSING — Classic Vegas (Josh, Oct 2026: "that flashy
// casino look, lights, fun to look like enticing to play and gamble"). Built
// by buildHall. Everything here is presentation: no collider (those live in
// layout-boulevard.ts, where the harness can see them), no money, no wire.
//
// THE RULES IT KEEPS (CLAUDE.md → THE HALL NEVER COMPILES MID-GAME, THE FLOOR
// STAYS SMOOTH): it adds NO light — the dome's chandelier glows through the
// stage wash already in LIGHTS, and every sign, bulb and topper is emissive
// (the GLOW pass makes them bloom). Repeated bits are instanced. The bulbs
// chase at 15Hz, not per frame. Materials are built once at build time.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { tameGlbTransparency } from "../lib/three-hygiene";
import * as B from "./layout";
import { W, H, CEIL, DOOR } from "./layout";
import { lottery, loadLottery } from "../lib/lottery.svelte";
import { derby } from "../lib/derby.svelte";
import { bigWins } from "./bigwins.svelte";
import { api } from "../lib/api";

const CELL = 2; // world.ts's — not imported, world.ts imports this file
const VEGAS = "/assets/casino/vegas";
const GOLD = 0xd4ad52;
const GOLD_DIM = 0x8a6a2c;

// ---- materials ------------------------------------------------------------------

const texLoader = new THREE.TextureLoader();
function tex(file: string, rx: number, ry: number, color = true): THREE.Texture {
  const t = texLoader.load(`${VEGAS}/tex/${file}.jpg`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 4;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** A photographed surface: colour + normal, Lambert (the hall's material). */
function surface(stem: string, rx: number, ry: number, normalStem = stem, tint = 0xffffff): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    map: tex(`${stem}-color`, rx, ry),
    normalMap: tex(`${normalStem}-normal`, rx, ry, false),
    normalScale: new THREE.Vector2(0.6, 0.6),
    color: tint,
  });
}
const goldPaint = (): THREE.MeshLambertMaterial =>
  // the gold map is metal albedo, pale as paint: (1.0, 0.8, 0.5) makes it gold
  new THREE.MeshLambertMaterial({ map: tex("gold-polished-color", 1, 1), color: new THREE.Color(1.0, 0.8, 0.5) });

/** A flat strip of brass inlay laid on the floor between two points (metres). */
function inlay(scene: THREE.Scene, mat: THREE.Material, x0: number, z0: number, x1: number, z1: number, wid = 0.09, y = 0.04): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.006, wid), mat);
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
  scene.add(m);
}

// ---- bulbs -------------------------------------------------------------------------

/** A string of marquee bulbs: one InstancedMesh, its colours chased by
 *  `chase()` — two travelling heads, the classic stage lip's pattern. */
interface BulbString {
  mesh: THREE.InstancedMesh;
  n: number;
  /** distance (in bulbs) between lit heads; 0 = all lit, twinkling */
  period: number;
}
const BULB_GEO = new THREE.SphereGeometry(0.05, 6, 5);
const BULB_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff });
const LIT = new THREE.Color(0xfff2c8);
const DIM = new THREE.Color(0x7a4e1c);
function bulbs(scene: THREE.Scene, pts: THREE.Vector3[], period = 7, size = 1): BulbString {
  const mesh = new THREE.InstancedMesh(BULB_GEO, BULB_MAT, pts.length);
  const m = new THREE.Matrix4();
  const s = new THREE.Vector3(size, size, size);
  const q = new THREE.Quaternion();
  pts.forEach((p, i) => {
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, LIT);
  });
  scene.add(mesh);
  return { mesh, n: pts.length, period };
}
const tmpC = new THREE.Color();
function chase(b: BulbString, t: number): void {
  for (let i = 0; i < b.n; i++) {
    let k: number;
    if (b.period <= 0) {
      // all lit, a slow twinkle
      k = 0.75 + 0.25 * Math.sin(t * 3 + i * 1.7);
    } else {
      // every `period`th bulb lit, the pattern marching along the string
      const ph = (((i - t * 9) % b.period) + b.period) % b.period;
      k = Math.max(0, 1 - Math.min(ph, b.period - ph) / 1.4);
    }
    b.mesh.setColorAt(i, tmpC.copy(DIM).lerp(LIT, k));
  }
  if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
}

// ---- crystal drops -----------------------------------------------------------------

/** Chandelier crystals as HUNG drops (Oct 2026 polish): flat-colour octahedra
 *  floating under the hoops read as white confetti from the floor. Each strand
 *  is a fine gold wire from its hoop down through its drops; each drop is a
 *  stretched, faceted, self-lit octahedron turned at random so neighbours catch
 *  the light differently. Two InstancedMeshes for every strand on a fixture —
 *  and no lights (the frozen light count). */
const CRYSTAL_MAT = new THREE.MeshLambertMaterial({ color: 0xeef4ff, emissive: 0x7d8ca8, flatShading: true });
const WIRE_GEO = new THREE.CylinderGeometry(0.006, 0.006, 1, 4);
function crystalStrands(
  scene: THREE.Scene,
  strands: { x: number; z: number; top: number; drops: number[] }[],
  size: number,
  wireMat: THREE.Material,
): void {
  const geo = new THREE.OctahedronGeometry(size, 0);
  const n = strands.reduce((k, s) => k + s.drops.length, 0);
  const gems = new THREE.InstancedMesh(geo, CRYSTAL_MAT, n);
  const wires = new THREE.InstancedMesh(WIRE_GEO, wireMat, strands.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const stretch = new THREE.Vector3(1, 1.9, 1);
  let i = 0;
  strands.forEach((st, j) => {
    for (const y of st.drops) {
      q.setFromAxisAngle(up, ((i * 2.399) % (Math.PI * 2)));
      m.compose(new THREE.Vector3(st.x, y, st.z), q, stretch);
      gems.setMatrixAt(i++, m);
    }
    const low = Math.min(...st.drops) + size * 1.9;
    const len = Math.max(0.01, st.top - low);
    m.compose(new THREE.Vector3(st.x, low + len / 2, st.z), q.identity(), new THREE.Vector3(1, len, 1));
    wires.setMatrixAt(j, m);
  });
  scene.add(gems, wires);
}

// ---- painted signs -----------------------------------------------------------------

/** A neon word on a dark board with a bulb-dot border: 1024×256. */
function neonCanvas(text: string, color: string): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = 1024;
  cv.height = 256;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#140709";
  g.fillRect(0, 0, 1024, 256);
  // a gold rim of painted dots
  g.fillStyle = "#c9a24a";
  for (let x = 18; x < 1024; x += 30) {
    g.beginPath(); g.arc(x, 14, 5, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(x, 242, 5, 0, Math.PI * 2); g.fill();
  }
  g.textAlign = "center";
  g.textBaseline = "middle";
  let size = 150;
  g.font = `italic 900 ${size}px Georgia, 'Times New Roman', serif`;
  while (g.measureText(text).width > 900 && size > 60) {
    size -= 6;
    g.font = `italic 900 ${size}px Georgia, 'Times New Roman', serif`;
  }
  // the tube: a wide coloured glow, the coloured stroke, then a hot core
  g.shadowColor = color;
  g.shadowBlur = 38;
  g.lineWidth = 14;
  g.strokeStyle = color;
  g.strokeText(text, 512, 132);
  g.shadowBlur = 18;
  g.lineWidth = 7;
  g.strokeText(text, 512, 132);
  g.shadowBlur = 0;
  g.lineWidth = 3;
  g.strokeStyle = "#fff6ea";
  g.strokeText(text, 512, 132);
  return cv;
}
function canvasTexture(cv: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The dome's ceiling: rings of gilded coffers climbing to a golden sunburst
 *  at the apex (the canvas's top row is the pole). */
function domeCanvas(): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = 2048;
  cv.height = 512;
  const g = cv.getContext("2d")!;
  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, "#fff0c2");
  sky.addColorStop(0.12, "#e8b85a");
  sky.addColorStop(0.3, "#7a1f22");
  sky.addColorStop(1, "#3a0d10");
  g.fillStyle = sky;
  g.fillRect(0, 0, 2048, 512);
  // the sunburst's rays from the apex
  g.globalAlpha = 0.35;
  for (let i = 0; i < 48; i++) {
    const x = (i / 48) * 2048;
    g.fillStyle = i % 2 ? "#ffd27a" : "#b9802e";
    g.fillRect(x, 0, 2048 / 48, 150);
  }
  g.globalAlpha = 1;
  // four rings of coffers, smaller toward the apex
  const rings = [
    { y0: 390, h: 90, n: 24 },
    { y0: 290, h: 80, n: 24 },
    { y0: 205, h: 66, n: 24 },
    { y0: 150, h: 46, n: 16 },
  ];
  for (const r of rings) {
    const w = 2048 / r.n;
    for (let i = 0; i < r.n; i++) {
      const x = i * w;
      g.fillStyle = "#c9a24a";
      g.fillRect(x + 4, r.y0, w - 8, r.h);
      g.fillStyle = "#5b1316";
      g.fillRect(x + 12, r.y0 + 8, w - 24, r.h - 16);
      g.fillStyle = "#8a2a24";
      g.fillRect(x + 20, r.y0 + 16, w - 40, r.h - 32);
      // a rosette in each coffer
      g.fillStyle = "#e8c66a";
      g.beginPath();
      g.arc(x + w / 2, r.y0 + r.h / 2, Math.min(w, r.h) * 0.12, 0, Math.PI * 2);
      g.fill();
    }
  }
  // a gold band round the base
  g.fillStyle = "#c9a24a";
  g.fillRect(0, 488, 2048, 24);
  return cv;
}

// ---- the build ---------------------------------------------------------------------

export interface VegasCtx {
  tickers: ((dt: number) => void)[];
  /** world.ts's coffered ceiling texture (passed in: world.ts imports us) */
  ceilingTex: () => THREE.Texture;
}

export function buildVegas(scene: THREE.Scene, ctx: VegasCtx): void {
  const Wm = W * CELL;
  const Hm = H * CELL;
  const gold = new THREE.MeshBasicMaterial({ color: GOLD });
  const goldLit = goldPaint();
  const strings: BulbString[] = [];

  // ---- THE FLOOR: loud red carpet, a midnight slot floor, marble walks ----------
  {
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(Wm, Hm), surface("carpet-vegas-red", Wm / 2.6, Hm / 2.6));
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(Wm / 2, 0, Hm / 2);
    scene.add(carpet);
    // the slot district (x 0–9) on the midnight colourway: a district you can
    // read from the floor before you read its sign
    const sw = 9 * CELL;
    const slotsFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(sw, Hm),
      surface("carpet-vegas-midnight", sw / 2.6, Hm / 2.6, "carpet-vegas-red"),
    );
    slotsFloor.rotation.x = -Math.PI / 2;
    // floor layers stand ≥8mm apart (the z-fighting rule): carpet 0, the
    // slots' carpet 1cm, marble 2cm, the rotunda 3cm, gold 4cm
    slotsFloor.position.set(sw / 2, 0.01, Hm / 2);
    scene.add(slotsFloor);

    // THE LOOP: cream marble round the rotunda (outer 9–27 × 5–18, the inner
    // rect 12–24 × 7.5–15.5 left to carpet and the rotunda's own floor). A
    // ShapeGeometry's UVs are its own coordinates — metres here — so the
    // marble tiles every 3m whatever the shape. Laid in (x, −z): the −π/2
    // turn onto the floor maps shape-y to −z.
    const marble = surface("marble-cream", 1 / 3, 1 / 3);
    const rect = (x0: number, y0: number, x1: number, y1: number): THREE.Vector2[] => [
      new THREE.Vector2(x0 * CELL, -y0 * CELL), new THREE.Vector2(x1 * CELL, -y0 * CELL),
      new THREE.Vector2(x1 * CELL, -y1 * CELL), new THREE.Vector2(x0 * CELL, -y1 * CELL),
    ];
    const loop = new THREE.Shape(rect(9, 5, 27, 18));
    loop.holes.push(new THREE.Path(rect(12, 7.5, 24, 15.5).reverse()));
    const loopM = new THREE.Mesh(new THREE.ShapeGeometry(loop), marble);
    loopM.rotation.x = -Math.PI / 2;
    loopM.position.y = 0.02;
    scene.add(loopM);
    // THE BOULEVARD: the door to the loop
    const blvd = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(rect(DOOR.x0, 18, DOOR.x1, H))), marble);
    blvd.rotation.x = -Math.PI / 2;
    blvd.position.y = 0.02;
    scene.add(blvd);
    // brass inlay along every marble edge
    const brass = new THREE.MeshBasicMaterial({ color: GOLD_DIM });
    const edge = (x0: number, y0: number, x1: number, y1: number): void => inlay(scene, brass, x0 * CELL, y0 * CELL, x1 * CELL, y1 * CELL);
    edge(9, 5, 27, 5); edge(27, 5, 27, 18); edge(9, 18, DOOR.x0, 18); edge(DOOR.x1, 18, 27, 18); edge(9, 5, 9, 18);
    edge(12, 7.5, 24, 7.5); edge(24, 7.5, 24, 15.5); edge(12, 15.5, 24, 15.5); edge(12, 7.5, 12, 15.5);
    edge(DOOR.x0, 18, DOOR.x0, H); edge(DOOR.x1, 18, DOOR.x1, H);

    // THE ROTUNDA: a black-and-gold marble disc under the dome, ringed in gold
    const R = B.ROTUNDA;
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(R.r * CELL, 72),
      surface("marble-black-gold", (R.r * CELL * 2) / 3, (R.r * CELL * 2) / 3),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(R.x * CELL, 0.03, R.y * CELL);
    scene.add(disc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(R.r * CELL - 0.12, R.r * CELL, 96), gold);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(R.x * CELL, 0.04, R.y * CELL);
    scene.add(ring);
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(R.r * CELL - 0.5, R.r * CELL - 0.44, 96), gold);
    ring2.rotation.x = -Math.PI / 2;
    ring2.position.set(R.x * CELL, 0.04, R.y * CELL);
    scene.add(ring2);
  }

  // ---- THE CEILING, open over the rotunda, and THE DOME -------------------------
  {
    const R = B.ROTUNDA;
    const rx = R.x * CELL;
    const rz = R.y * CELL;
    const rr = R.r * CELL;
    // the flat coffered ceiling with the dome's round opening cut out. Turned
    // +π/2 about x: shape (x, y) lands at (x, CEIL, y), facing down.
    const shape = new THREE.Shape([
      new THREE.Vector2(0, 0), new THREE.Vector2(Wm, 0), new THREE.Vector2(Wm, Hm), new THREE.Vector2(0, Hm),
    ]);
    const hole = new THREE.Path();
    hole.absarc(rx, rz, rr, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const ceilTex = ctx.ceilingTex();
    ceilTex.repeat.set(0.5, 0.5); // the classic hall's one tile per cell
    const ceiling = new THREE.Mesh(new THREE.ShapeGeometry(shape, 48), new THREE.MeshLambertMaterial({ map: ceilTex }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = CEIL;
    scene.add(ceiling);

    // the drum: red jacquard between two gold bands, a ring of chasing bulbs
    const DRUM = 1.4;
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(rr, rr, DRUM, 72, 1, true),
      (() => {
        const m = surface("jacquard-red", (2 * Math.PI * rr) / 2.4, DRUM / 2.4);
        m.side = THREE.BackSide;
        return m;
      })(),
    );
    drum.position.set(rx, CEIL + DRUM / 2, rz);
    scene.add(drum);
    for (const y of [CEIL + 0.04, CEIL + DRUM - 0.04]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(rr - 0.05, 0.07, 6, 120), goldLit);
      band.rotation.x = Math.PI / 2;
      band.position.set(rx, y, rz);
      scene.add(band);
    }
    const ringPts: THREE.Vector3[] = [];
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      ringPts.push(new THREE.Vector3(rx + Math.cos(a) * (rr - 0.14), CEIL + 0.16, rz + Math.sin(a) * (rr - 0.14)));
    }
    strings.push(bulbs(scene, ringPts, 6, 1.1));

    // the cap: a shallow dome of gilded coffers rising to 10m. Self-lit a
    // little (its own picture as emissive) — no lamp in the hall reaches up
    // there, and a dark dome reads as a hole.
    const capH = 10 - (CEIL + DRUM);
    const capTex = canvasTexture(domeCanvas());
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(rr, 72, 20, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshLambertMaterial({ map: capTex, emissive: 0xffffff, emissiveMap: capTex, emissiveIntensity: 0.42, side: THREE.BackSide }),
    );
    cap.scale.y = capH / rr;
    cap.position.set(rx, CEIL + DRUM, rz);
    scene.add(cap);

    // THE GRAND CHANDELIER from the apex: a brass chain, three tiers of candle
    // bulbs, crystal drops. Its light is the stage wash in LIGHTS (no new one).
    const top = 10;
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, top - 7.7, 6), goldLit);
    chain.position.set(rx, (top + 7.7) / 2, rz);
    scene.add(chain);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.5, 16, 1, true), goldLit);
    crown.position.set(rx, 7.55, rz);
    crown.rotation.x = Math.PI;
    scene.add(crown);
    const flamePts: THREE.Vector3[] = [];
    const strands: { x: number; z: number; top: number; drops: number[] }[] = [];
    const tiers: [number, number, number][] = [[1.6, 24, 7.25], [1.15, 18, 6.85], [0.7, 12, 6.45]];
    for (const [radius, count, y] of tiers) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.035, 6, 48), goldLit);
      hoop.rotation.x = Math.PI / 2;
      hoop.position.set(rx, y, rz);
      scene.add(hoop);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        flamePts.push(new THREE.Vector3(rx + Math.cos(a) * radius, y + 0.12, rz + Math.sin(a) * radius));
        const b = a + Math.PI / count;
        strands.push({ x: rx + Math.cos(b) * radius, z: rz + Math.sin(b) * radius, top: y, drops: [y - 0.18, y - 0.34] });
      }
    }
    strings.push(bulbs(scene, flamePts, 0, 1.4));
    crystalStrands(scene, strands, 0.06, goldLit);
  }

  // ---- THE ROTUNDA'S COLUMNS ---------------------------------------------------
  // Josh's intake model: a cream marble column with plinth and capital, 4.48m
  // tall, stood up to the 6m ceiling; gold bands at the plinth and the neck.
  {
    const S = CEIL / 4.48;
    const loader = new GLTFLoader();
    loader.load(`${VEGAS}/column-marble.glb`, (g) => {
      tameGlbTransparency(g.scene);
      for (const [cx, cy] of B.ROTUNDA_COLUMNS) {
        const c = g.scene.clone(true);
        c.scale.setScalar(S);
        c.position.set(cx * CELL, 0, cy * CELL);
        scene.add(c);
      }
    }, undefined, () => console.warn("[casino] no marble column model"));
    for (const [cx, cy] of B.ROTUNDA_COLUMNS) {
      for (const y of [0.55, CEIL - 0.85]) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.045, 6, 24), goldLit);
        band.rotation.x = Math.PI / 2;
        band.position.set(cx * CELL, y, cy * CELL);
        scene.add(band);
      }
    }
  }

  // ---- THE NEON: a sign over every district's way in ----------------------------
  const neonMats: { m: THREE.MeshBasicMaterial; stutter: boolean; phase: number }[] = [];
  {
    const board = new THREE.MeshLambertMaterial({ color: 0x1a0c0b });
    B.NEON.forEach((n, k) => {
      const tex2 = canvasTexture(neonCanvas(n.text, n.color));
      const m = new THREE.MeshBasicMaterial({ map: tex2 });
      neonMats.push({ m, stutter: k === 1, phase: k * 1.3 });
      const hgt = n.w / 4;
      const g = new THREE.Group();
      const face = new THREE.Mesh(new THREE.PlaneGeometry(n.w, hgt), m);
      face.position.z = 0.05;
      g.add(face);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(n.w + 0.16, hgt + 0.16, 0.08), board);
      g.add(frame);
      if (n.hang) {
        // readable from both sides, and hung from the ceiling on two rods
        const back = new THREE.Mesh(new THREE.PlaneGeometry(n.w, hgt), m);
        back.position.z = -0.05;
        back.rotation.y = Math.PI;
        g.add(back);
        for (const s of [-1, 1]) {
          const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, CEIL - n.h - hgt / 2, 4), gold);
          rod.position.set((s * n.w) / 2.6, hgt / 2 + (CEIL - n.h - hgt / 2) / 2, 0);
          g.add(rod);
        }
      }
      g.position.set(n.x * CELL + n.face[0] * 0.06, n.h, n.y * CELL + n.face[1] * 0.06);
      g.rotation.y = Math.atan2(n.face[0], n.face[1]);
      scene.add(g);
    });
  }

  // ---- THE DOOR: a canopy of bulbs and the house's name over it -----------------
  {
    const dx0 = DOOR.x0 * CELL - 0.5;
    const dx1 = DOOR.x1 * CELL + 0.5;
    const cx = (dx0 + dx1) / 2;
    const wid = dx1 - dx0;
    const DEPTH = 1.7;
    const Y = 3.3;
    const zWall = Hm;
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(wid, 0.34, DEPTH), goldLit);
    canopy.position.set(cx, Y + 0.17, zWall - DEPTH / 2);
    scene.add(canopy);
    // the fascia's two chasing rows, and the soffit's grid
    const front: THREE.Vector3[] = [];
    const n = Math.round(wid / 0.22);
    for (const y of [Y + 0.07, Y + 0.27]) {
      for (let i = 0; i <= n; i++) front.push(new THREE.Vector3(dx0 + (wid * i) / n, y, zWall - DEPTH - 0.02));
    }
    strings.push(bulbs(scene, front, 8, 1.15));
    const soffit: THREE.Vector3[] = [];
    for (let r = 0; r < 4; r++) {
      for (let i = 0; i <= n / 2; i++) soffit.push(new THREE.Vector3(dx0 + 0.2 + ((wid - 0.4) * i) / (n / 2), Y - 0.03, zWall - 0.3 - r * 0.38));
    }
    strings.push(bulbs(scene, soffit, 0, 1));
    // SOLACE, in gold neon, over the canopy. The board stands 1.5cm proud of
    // its frame: it used to sit EXACTLY on the frame's front face, and the two
    // fought for the same depth — the shimmering, dotted "flashing" Josh saw.
    const frame = new THREE.Mesh(new THREE.BoxGeometry(6.6, 1.8, 0.06), goldLit);
    frame.position.set(cx, 4.65, zWall - 0.03); // front face at zWall − 0.06
    scene.add(frame);
    const name = new THREE.Mesh(
      new THREE.PlaneGeometry(6.4, 1.6),
      new THREE.MeshBasicMaterial({ map: canvasTexture(neonCanvas("SOLACE", "#ffcf5a")) }),
    );
    name.position.set(cx, 4.65, zWall - 0.075);
    name.rotation.y = Math.PI;
    scene.add(name);
    // THE EXIT SIGN: a lit box hung from the canopy's front edge on two short
    // brass rods. The prop pack's exit sign carries 2m of hanging wire in its
    // own mesh, which ran up through the canopy and across the SOLACE board.
    {
      const cv = document.createElement("canvas");
      cv.width = 256;
      cv.height = 96;
      const g = cv.getContext("2d")!;
      g.fillStyle = "#fff4ec";
      g.fillRect(0, 0, 256, 96);
      g.strokeStyle = "#c81d25";
      g.lineWidth = 6;
      g.strokeRect(6, 6, 244, 84);
      g.fillStyle = "#d4161f";
      g.font = "900 64px Arial, Helvetica, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("EXIT", 128, 52);
      const face = new THREE.MeshBasicMaterial({ map: canvasTexture(cv), color: 0xe6e6e6 });
      const body = new THREE.MeshLambertMaterial({ color: 0x241a16 });
      const sign = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.34, 0.1), body);
      sign.add(box);
      for (const side of [1, -1]) {
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.3), face);
        plate.position.z = side * 0.0515;
        if (side < 0) plate.rotation.y = Math.PI;
        sign.add(plate);
      }
      for (const sx of [-0.3, 0.3]) {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.26, 6), goldLit);
        rod.position.set(sx, 0.3, 0);
        sign.add(rod);
      }
      // under the fascia's front edge, readable from the room and the porch
      sign.position.set(cx, Y - 0.43, zWall - DEPTH + 0.12);
      scene.add(sign);
    }
  }

  // ---- THE SLOT TOPPERS: a lit arch along every bank's spine --------------------
  {
    // the banks' names and lacquer come from their sections (layout)
    const NAMES = B.SLOT_SECTIONS.slice(0, 4).map((s) => s.name);
    const COLORS = B.SLOT_SECTIONS.slice(0, 4).map((s) => s.color);
    const archCanvas = (title: string, ground: string): HTMLCanvasElement => {
      const cv = document.createElement("canvas");
      cv.width = 1024;
      cv.height = 256;
      const g = cv.getContext("2d")!;
      g.clearRect(0, 0, 1024, 256);
      // the arch: a flat band with a raised crown, cut out by alpha (MASK)
      g.beginPath();
      g.moveTo(8, 252);
      g.lineTo(8, 120);
      g.quadraticCurveTo(512, -40, 1016, 120);
      g.lineTo(1016, 252);
      g.closePath();
      g.fillStyle = "#c9a24a";
      g.fill();
      g.beginPath();
      g.moveTo(26, 240);
      g.lineTo(26, 128);
      g.quadraticCurveTo(512, -10, 998, 128);
      g.lineTo(998, 240);
      g.closePath();
      g.fillStyle = ground;
      g.fill();
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = "italic 900 74px Georgia, serif";
      g.lineWidth = 6;
      g.strokeStyle = "#2a1404";
      g.strokeText(title, 512, 168);
      const fill = g.createLinearGradient(0, 120, 0, 210);
      fill.addColorStop(0, "#fff3c4");
      fill.addColorStop(1, "#e2a93a");
      g.fillStyle = fill;
      g.fillText(title, 512, 168);
      return cv;
    };
    const TOP_Y = 1.98; // above the cabinets (≈1.9m at their 0.85 scale)
    const TOP_H = 1.1;
    B.SLOT_BANKS.forEach((b, i) => {
      const len = b.n * 0.62 * CELL + 0.2;
      const cy = (b.y0 + ((b.n - 1) * 0.62) / 2) * CELL;
      const cx = b.x * CELL;
      const m = new THREE.MeshBasicMaterial({ map: canvasTexture(archCanvas(NAMES[i % 4], COLORS[i % 4])), alphaTest: 0.5 });
      for (const side of [1, -1]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(len, TOP_H), m);
        // faces east (+x) or west: the plane's +z turned to ±x
        p.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
        p.position.set(cx + side * 0.04, TOP_Y + TOP_H / 2, cy);
        scene.add(p);
      }
      // bulbs round the crown, both faces
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 26; k++) {
        const t = k / 26;
        // the canvas's quadratic crown: x 8→1016, y 120 → −40(ctrl) → 120
        const u = t;
        const yc = (1 - u) * (1 - u) * 120 + 2 * (1 - u) * u * -40 + u * u * 120;
        const z = (t - 0.5) * (len - 0.1);
        const y = TOP_Y + TOP_H * (1 - (yc + 12) / 256);
        for (const side of [1, -1]) pts.push(new THREE.Vector3(cx + side * 0.07, y, cy + z));
      }
      strings.push(bulbs(scene, pts, 5, 0.9));
    });

    // THE END CAPS (the polish pass): a lacquered panel closing each end of
    // every bank — the aisles used to look straight at the cabinets' bare
    // beige sides. Gold frame and crown on the outer face, a bulb run up both
    // edges. All eight panels are ONE mesh, all the gold ONE more, and the
    // bulbs one instanced string; each bank's inset is one more draw.
    {
      const CAP_W = 2.08; // across both rows of the bank (2.02m) and a lip
      const CAP_H = 2.36; // a hair over the 2.29m cabinets
      const CAP_T = 0.12;
      const panels: THREE.BufferGeometry[] = [];
      const trims: THREE.BufferGeometry[] = [];
      const capBulbs: THREE.Vector3[] = [];
      // the inset: the bank's own topper colour, a gold 7, the bank's name —
      // one canvas per bank, its two caps merged into one mesh
      const insets: THREE.BufferGeometry[][] = B.SLOT_BANKS.map(() => []);
      const insetCanvas = (title: string, ground: string): HTMLCanvasElement => {
        const cv = document.createElement("canvas");
        cv.width = 256;
        cv.height = 256;
        const g = cv.getContext("2d")!;
        g.fillStyle = ground;
        g.fillRect(0, 0, 256, 256);
        const v = g.createRadialGradient(128, 110, 10, 128, 128, 170);
        v.addColorStop(0, "rgba(255,255,255,0.18)");
        v.addColorStop(1, "rgba(0,0,0,0.45)");
        g.fillStyle = v;
        g.fillRect(0, 0, 256, 256);
        g.strokeStyle = "#e2b65a";
        g.lineWidth = 6;
        g.strokeRect(10, 10, 236, 236);
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.font = "italic 900 132px Georgia, serif";
        const gold = g.createLinearGradient(0, 40, 0, 170);
        gold.addColorStop(0, "#fff3c4");
        gold.addColorStop(1, "#d99a2b");
        g.lineWidth = 8;
        g.strokeStyle = "#2a1404";
        g.strokeText("7", 128, 104);
        g.fillStyle = gold;
        g.fillText("7", 128, 104);
        g.font = "800 24px Georgia, serif";
        g.fillStyle = "#ffe7a8";
        const words = title.split(" ");
        const half = Math.ceil(words.length / 2);
        g.fillText(words.slice(0, half).join(" "), 128, 196);
        g.fillText(words.slice(half).join(" "), 128, 224);
        return cv;
      };
      const box = (w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry =>
        new THREE.BoxGeometry(w, h, d).translate(x, y, z);
      for (const [cxCell, cyCell] of B.SLOT_CAPS) {
        const bi = B.SLOT_BANKS.findIndex((b) => Math.abs(b.x - cxCell) < 0.01 && cyCell > b.y0 - 1 && cyCell < b.y0 + b.n);
        const bank = B.SLOT_BANKS[bi];
        const mid = bank.y0 + ((bank.n - 1) * 0.62) / 2;
        const out = cyCell < mid ? -1 : 1; // the face that looks down the aisle
        const x = cxCell * CELL;
        const z = cyCell * CELL;
        const fz = z + out * (CAP_T / 2 + 0.012); // just proud of the outer face
        panels.push(box(CAP_W, CAP_H, CAP_T, x, CAP_H / 2, z));
        // the frame: two stiles, a rail at the foot, and a crown moulding
        trims.push(box(0.06, CAP_H - 0.1, 0.025, x - CAP_W / 2 + 0.08, CAP_H / 2, fz));
        trims.push(box(0.06, CAP_H - 0.1, 0.025, x + CAP_W / 2 - 0.08, CAP_H / 2, fz));
        trims.push(box(CAP_W - 0.1, 0.06, 0.025, x, 0.22, fz));
        trims.push(box(CAP_W - 0.1, 0.06, 0.025, x, CAP_H - 0.3, fz));
        trims.push(box(CAP_W + 0.08, 0.09, CAP_T + 0.08, x, CAP_H + 0.045, z));
        // the inset, 1cm proud of the panel's face (inside the frame)
        const ins = new THREE.PlaneGeometry(1.5, 1.5);
        if (out < 0) ins.rotateY(Math.PI);
        ins.translate(x, 1.16, z + out * (CAP_T / 2 + 0.01));
        insets[bi].push(ins);
        for (let k = 0; k < 9; k++) {
          const y = 0.4 + (k / 8) * (CAP_H - 0.8);
          for (const side of [-1, 1]) capBulbs.push(new THREE.Vector3(x + side * (CAP_W / 2 - 0.08), y, fz + out * 0.03));
        }
      }
      const lacquer = surface("wood-lacquer-cherry", 1, 1.2);
      scene.add(new THREE.Mesh(mergeGeometries(panels), lacquer));
      scene.add(new THREE.Mesh(mergeGeometries(trims), goldLit));
      insets.forEach((list, i) => {
        if (!list.length) return;
        const m = new THREE.MeshBasicMaterial({ map: canvasTexture(insetCanvas(NAMES[i % 4], COLORS[i % 4])), color: 0xd8d8d8 });
        scene.add(new THREE.Mesh(mergeGeometries(list), m));
        for (const g of list) g.dispose();
      });
      for (const g of [...panels, ...trims]) g.dispose();
      strings.push(bulbs(scene, capBulbs, 6, 0.8));
    }

    // THE HIGH-LIMIT ROW: a gold rail along the wall above the cabinets, so
    // the row reads as an alcove rather than machines parked by a wall
    {
      const hl = B.HIGH_LIMIT;
      const x0 = (hl.x0 - 0.35) * CELL;
      const x1 = (hl.x0 + (hl.n - 1) * 0.62 + 0.35) * CELL;
      const z = H * CELL - 0.06;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.08, 0.06), goldLit);
      rail.position.set((x0 + x1) / 2, 2.42, z);
      scene.add(rail);
      const railBulbs: THREE.Vector3[] = [];
      for (let k = 0; k <= 22; k++) railBulbs.push(new THREE.Vector3(x0 + ((x1 - x0) * k) / 22, 2.5, z - 0.04));
      strings.push(bulbs(scene, railBulbs, 7, 0.8));
    }

    // THE CAROUSEL: a lacquered column under a round marquee drum. The canopy
    // sits 20cm lower than it was built for the 2.3m originals: the carousel
    // stands the vintage bulb machines now (slot-cabinets.ts), 2.03m to the
    // top of their knob, and the drum's underside clears them by 5cm.
    const DROP = 0.2;
    const C = B.CAROUSEL;
    const ccx = C.x * CELL;
    const ccz = C.y * CELL;
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 2.3 - DROP, 24), surface("wood-lacquer-cherry", 2, 1.5));
    column.position.set(ccx, (2.3 - DROP) / 2, ccz);
    scene.add(column);
    const drumCv = document.createElement("canvas");
    drumCv.width = 2048;
    drumCv.height = 192;
    {
      const g = drumCv.getContext("2d")!;
      g.fillStyle = "#6a0f1c";
      g.fillRect(0, 0, 2048, 192);
      g.fillStyle = "#c9a24a";
      g.fillRect(0, 0, 2048, 14);
      g.fillRect(0, 178, 2048, 14);
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = "italic 900 96px Georgia, serif";
      g.fillStyle = "#ffe3a0";
      // The band is 12.9m round and 0.75m tall on a 2048×192 canvas, so a
      // canvas pixel is 1.6× wider on the drum than it is tall: each word is
      // drawn squeezed by the same amount (true proportions on the drum) and
      // never wider than its quarter (Oct 2026 polish — at full width
      // "★ CAROUSEL ★" ran ~700px into 512 and the words read "CKPOT★CAROU").
      const aspect = (192 / 0.75) / (2048 / (2 * Math.PI * 2.05));
      for (const [k, word] of ["★ JACKPOT ★", "★ CAROUSEL ★", "★ JACKPOT ★", "★ CAROUSEL ★"].entries()) {
        const sx = Math.min(1 / aspect, 430 / g.measureText(word).width);
        g.save();
        g.translate(256 + k * 512, 100);
        g.scale(sx, 1);
        g.fillText(word, 0, 0);
        g.restore();
      }
    }
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(2.05, 2.05, 0.75, 48, 1, true),
      new THREE.MeshBasicMaterial({ map: canvasTexture(drumCv) }),
    );
    drum.position.set(ccx, 2.65 - DROP, ccz);
    scene.add(drum);
    const lid = new THREE.Mesh(new THREE.CircleGeometry(2.05, 48), goldLit);
    lid.rotation.x = -Math.PI / 2;
    lid.position.set(ccx, 3.02 - DROP, ccz);
    scene.add(lid);
    const under = new THREE.Mesh(new THREE.CircleGeometry(2.05, 48), new THREE.MeshLambertMaterial({ color: 0x2a0c10 }));
    under.rotation.x = Math.PI / 2;
    under.position.set(ccx, 2.28 - DROP, ccz);
    scene.add(under);
    const crownC = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.9, 24), goldLit);
    crownC.position.set(ccx, 3.47 - DROP, ccz);
    scene.add(crownC);
    const rimPts: THREE.Vector3[] = [];
    for (const y of [2.32 - DROP, 2.98 - DROP]) {
      for (let k = 0; k < 64; k++) {
        const a = (k / 64) * Math.PI * 2;
        rimPts.push(new THREE.Vector3(ccx + Math.cos(a) * 2.09, y, ccz + Math.sin(a) * 2.09));
      }
    }
    strings.push(bulbs(scene, rimPts, 6, 1));
  }

  // ---- THE PIT'S CHANDELIERS ------------------------------------------------------
  {
    const flames: THREE.Vector3[] = [];
    const strands: { x: number; z: number; top: number; drops: number[] }[] = [];
    for (const [px, py] of B.PIT_CHANDELIERS) {
      const x = px * CELL;
      const z = py * CELL;
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, CEIL - 4.6, 6), goldLit);
      rod.position.set(x, (CEIL + 4.6) / 2, z);
      scene.add(rod);
      for (const [r, y, n] of [[0.75, 4.45, 12], [0.48, 4.2, 8]] as const) {
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(r, 0.025, 5, 32), goldLit);
        hoop.rotation.x = Math.PI / 2;
        hoop.position.set(x, y, z);
        scene.add(hoop);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          flames.push(new THREE.Vector3(x + Math.cos(a) * r, y + 0.09, z + Math.sin(a) * r));
          strands.push({ x: x + Math.cos(a + 0.2) * r, z: z + Math.sin(a + 0.2) * r, top: y, drops: [y - 0.14, y - 0.27] });
        }
      }
    }
    strings.push(bulbs(scene, flames, 0, 1.1));
    crystalStrands(scene, strands, 0.045, goldLit);
  }

  // ---- THE LIVE SIGNBOARDS -----------------------------------------------------------
  const boards: { kind: "draw" | "derby"; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture }[] = [];
  {
    const BW = 2.3;
    const BH = 1.45;
    const Y0 = 2.05;
    for (const s of B.SIGNBOARDS) {
      const cv = document.createElement("canvas");
      cv.width = 640;
      cv.height = 404;
      const g = cv.getContext("2d")!;
      const t = canvasTexture(cv);
      const grp = new THREE.Group();
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), new THREE.MeshBasicMaterial({ map: t }));
      screen.position.set(0, Y0 + BH / 2, 0.05);
      grp.add(screen);
      // the same board on the back: people walking back to the door from the
      // loop see this side, and a bare slab there read as a wall
      const back = new THREE.Mesh(screen.geometry, screen.material);
      back.position.set(0, Y0 + BH / 2, -0.05);
      back.rotation.y = Math.PI;
      grp.add(back);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(BW + 0.18, BH + 0.18, 0.08), goldLit);
      frame.position.set(0, Y0 + BH / 2, 0);
      grp.add(frame);
      for (const sx of [-0.5, 0.5]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, Y0, 10), goldLit);
        post.position.set(sx * 0.6, Y0 / 2, 0);
        grp.add(post);
      }
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.16, 0.5), surface("marble-black-gold", 0.4, 0.3));
      plinth.position.set(0, 0.08, 0);
      grp.add(plinth);
      grp.position.set(s.x * CELL, 0, s.y * CELL);
      grp.rotation.y = Math.atan2(s.face[0], s.face[1]);
      scene.add(grp);
      boards.push({ kind: s.kind, g, tex: t });
    }
  }
  let tonight: { name: string | null; amount: number } | null = null;
  const fmt = (n: number): string => Math.round(n).toLocaleString("en-US");
  const clock = (ms: number): string => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}:${String(s % 60).padStart(2, "0")}`;
  };
  const head = (g: CanvasRenderingContext2D, y: number, text: string): void => {
    g.fillStyle = "#ffcf5a";
    g.font = "900 34px system-ui, sans-serif";
    g.fillText(text, 320, y);
  };
  const drawBoard = (b: (typeof boards)[number]): void => {
    const g = b.g;
    g.fillStyle = "#0b0608";
    g.fillRect(0, 0, 640, 404);
    // LED dot texture
    g.fillStyle = "rgba(255,255,255,0.035)";
    for (let y = 2; y < 404; y += 6) for (let x = 2; x < 640; x += 6) g.fillRect(x, y, 2, 2);
    g.textAlign = "center";
    g.textBaseline = "middle";
    if (b.kind === "draw") {
      const info = lottery.info;
      head(g, 48, "★ TONIGHT'S DRAW ★");
      g.fillStyle = "#fff3d0";
      g.font = "900 96px system-ui, sans-serif";
      g.fillText(info ? fmt(info.pot) : "—", 320, 160);
      g.fillStyle = "#c2ad8f";
      g.font = "700 30px system-ui, sans-serif";
      g.fillText("silver in the pot", 320, 226);
      g.fillStyle = "#7dffa6";
      g.font = "800 30px system-ui, sans-serif";
      g.fillText(info ? `draws in ${clock(info.drawAt - Date.now())}` : "", 320, 294);
      g.fillStyle = "#c2ad8f";
      g.font = "700 26px system-ui, sans-serif";
      g.fillText(info ? `${info.players} in tonight · ${info.price} silver a ticket` : "", 320, 350);
    } else {
      const st = derby.state;
      head(g, 44, "★ THE DERBY ★");
      g.font = "900 46px system-ui, sans-serif";
      g.fillStyle = "#fff3d0";
      let line = "next race opens with the first ticket";
      if (st?.phase === "betting" && st.endsAt) line = `POST TIME ${clock(st.endsAt - Date.now())}`;
      else if (st?.phase === "racing") line = "THEY'RE OFF!";
      else if (st?.phase === "settled" && st.winner) line = `WINNER: ${st.racers.find((r) => r.key === st.winner)?.name ?? st.winner}`;
      if (line.length > 22) g.font = "800 30px system-ui, sans-serif";
      g.fillText(line, 320, 122);
      g.strokeStyle = "#5a3a12";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(40, 190);
      g.lineTo(600, 190);
      g.stroke();
      head(g, 236, "BIGGEST WIN TONIGHT");
      // the paper's log (the night's public news) or, if bigger, a win this
      // screen has seen on the floor since you walked in
      let best = tonight && tonight.name ? { name: tonight.name, amount: tonight.amount } : null;
      for (const w of bigWins.list) if (!best || w.amount > best.amount) best = { name: w.name, amount: w.amount };
      g.fillStyle = "#fff3d0";
      g.font = "900 54px system-ui, sans-serif";
      g.fillText(best ? `${fmt(best.amount)} silver` : "the night is young", 320, 300);
      g.fillStyle = "#c2ad8f";
      g.font = "700 30px system-ui, sans-serif";
      g.fillText(best ? best.name : "", 320, 356);
    }
    b.tex.needsUpdate = true;
  };
  const refresh = (): void => {
    void loadLottery();
    api.casinoTonight().then((r) => {
      tonight = r.biggest ? { name: r.biggest.name, amount: r.biggest.amount } : null;
    }).catch(() => {});
  };
  refresh();
  for (const b of boards) drawBoard(b);

  // ---- the hall's clock: bulbs at 15Hz, neon breathing, boards at 1Hz, data 60s ----
  let t = 0;
  let bulbAcc = 1;
  let boardAcc = 0;
  let dataAcc = 0;
  ctx.tickers.push((dt) => {
    t += dt;
    bulbAcc += dt;
    if (bulbAcc >= 1 / 15) {
      bulbAcc = 0;
      for (const s of strings) chase(s, t);
      for (const n of neonMats) {
        const breathe = 1 + Math.sin(t * 1.7 + n.phase) * 0.04 + Math.sin(t * 0.61 + n.phase) * 0.03;
        const stutter = n.stutter && Math.sin(t * 37) > 0.993 ? 0.45 : 1;
        n.m.color.setScalar(Math.min(1, 0.93 * breathe * stutter));
      }
    }
    boardAcc += dt;
    if (boardAcc >= 1) {
      boardAcc = 0;
      for (const b of boards) drawBoard(b);
    }
    dataAcc += dt;
    if (dataAcc >= 60) {
      dataAcc = 0;
      refresh();
    }
  });
}
