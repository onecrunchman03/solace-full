// THE LIVE CHESS SET — Josh's board plays the real duel (Aug 2026: "when
// playing the chess game the view should pan over the chess board", and no 2D
// window anywhere). The placed set's 32 piece meshes are indexed by name and
// moved to match the duel's FEN; captured men leave the board; clicking a
// square rides a raycast against an invisible pick plane. The square grid is
// DERIVED at runtime from where the two kings actually stand (e1/e8 in the
// authored opening), so takeProp's recentring can never skew the mapping.

import * as THREE from "three";

const FILES = "abcdefgh";
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";

interface PieceMesh {
  mesh: THREE.Mesh;
  color: "w" | "b";
  type: string; // pnbrqk
  home: THREE.Vector3; // authored position (the opening square)
}

export interface ChessBoard3D {
  setFEN(fen: string | null): void;
  squareAt(world: THREE.Vector3): string | null;
  setMarks(marks: { from?: string | null; targets?: string[]; last?: [string, string] | null }): void;
  pickPlane: THREE.Mesh;
}

const TYPE_OF = (name: string): string | null => {
  const n = name.toLowerCase();
  if (n.includes("pawn")) return "p";
  if (n.includes("knight")) return "n";
  if (n.includes("bishop")) return "b";
  if (n.includes("rook")) return "r";
  if (n.includes("queen")) return "q";
  if (n.includes("king")) return "k";
  return null;
};

export function buildChessBoard(set: THREE.Group): ChessBoard3D {
  set.updateMatrixWorld(true);
  const pieces: PieceMesh[] = [];
  set.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const type = TYPE_OF(m.name);
    if (!type) return;
    // board meshes carry no piece word; "DarklPawn6" (the set's typo) still hits
    const color = m.name.toLowerCase().includes("dark") ? "b" : "w";
    pieces.push({ mesh: m, color, type, home: m.position.clone() });
  });

  // Grid basis from the kings' AUTHORED squares: light king = e1, dark = e8.
  const worldOf = (pm: PieceMesh): THREE.Vector3 => {
    const bb = new THREE.Box3().setFromObject(pm.mesh);
    return bb.getCenter(new THREE.Vector3());
  };
  const lightKing = pieces.find((p) => p.color === "w" && p.type === "k")!;
  const lightQueen = pieces.find((p) => p.color === "w" && p.type === "q")!;
  const darkKing = pieces.find((p) => p.color === "b" && p.type === "k")!;
  const e1 = worldOf(lightKing);
  const d1 = worldOf(lightQueen);
  const e8 = worldOf(darkKing);
  const fileVec = new THREE.Vector3().subVectors(e1, d1); // one step d→e (+1 file)
  const rankVec = new THREE.Vector3().subVectors(e8, e1).multiplyScalar(1 / 7);
  fileVec.y = 0;
  rankVec.y = 0;
  const boardY = Math.min(e1.y, e8.y) - 0.02; // piece centres sit ~2cm over the top
  const squareWorld = (f: number, r: number): THREE.Vector3 =>
    new THREE.Vector3(
      e1.x + fileVec.x * (f - 4) + rankVec.x * r,
      boardY,
      e1.z + fileVec.z * (f - 4) + rankVec.z * r,
    );

  // Because the meshes were BAKED in place, "move to square" is a delta from
  // the mesh's authored world spot — position it by shifting mesh.position.
  const placeAt = (pm: PieceMesh, f: number, r: number): void => {
    const cur = worldOf(pm);
    const dst = squareWorld(f, r);
    pm.mesh.position.x += dst.x - cur.x;
    pm.mesh.position.z += dst.z - cur.z;
    pm.mesh.visible = true;
  };

  // clones minted for promotions beyond the set's own men
  const extras: THREE.Mesh[] = [];

  const setFEN: ChessBoard3D["setFEN"] = (fen) => {
    const board = (fen ?? START_FEN).split(" ")[0];
    // wanted[color+type] = list of [file, rank]
    const wanted = new Map<string, [number, number][]>();
    const rows = board.split("/");
    for (let ri = 0; ri < 8; ri++) {
      const rank = 8 - ri;
      let f = 0;
      for (const ch of rows[ri] ?? "") {
        if (/\d/.test(ch)) {
          f += Number(ch);
          continue;
        }
        const color = ch === ch.toUpperCase() ? "w" : "b";
        const key = color + ch.toLowerCase();
        const list = wanted.get(key) ?? [];
        list.push([f, rank - 1]);
        wanted.set(key, list);
        f++;
      }
    }
    for (const m of extras) m.visible = false;
    // assign pool meshes to squares, nearest-first so moves read as moves
    const byKey = new Map<string, PieceMesh[]>();
    for (const p of pieces) {
      const key = p.color + p.type;
      const list = byKey.get(key) ?? [];
      list.push(p);
      byKey.set(key, list);
    }
    for (const [key, squares] of wanted) {
      const pool = [...(byKey.get(key) ?? [])];
      byKey.set(key, []); // consumed below; leftovers handled after
      const remaining = new Set(pool);
      for (const [f, r] of squares) {
        if (!remaining.size) {
          // promotion past the set's men — clone a same-colour queen/knight…
          const src = pieces.find((p) => p.color === key[0] && p.type === key[1]);
          const donor = src ?? pieces.find((p) => p.color === key[0] && p.type === "q");
          if (!donor) continue;
          const clone = donor.mesh.clone();
          donor.mesh.parent?.add(clone);
          extras.push(clone);
          const pm: PieceMesh = { mesh: clone, color: key[0] as "w" | "b", type: key[1], home: donor.home };
          placeAt(pm, f, r);
          continue;
        }
        const dst = squareWorld(f, r);
        let best: PieceMesh | null = null;
        let bestD = Infinity;
        for (const p of remaining) {
          const d = worldOf(p).distanceToSquared(dst);
          if (d < bestD) {
            bestD = d;
            best = p;
          }
        }
        remaining.delete(best!);
        placeAt(best!, f, r);
      }
      for (const p of remaining) p.mesh.visible = false; // captured
    }
    // any type with zero squares in the FEN: whole pool off the board
    for (const p of pieces) {
      const key = p.color + p.type;
      if (!wanted.has(key)) p.mesh.visible = false;
    }
  };

  // ---- picking + marks ------------------------------------------------------
  const span = 8.6; // squares span 8 × ~6.75cm; plane a hair over the rim
  const pickPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.hypot(fileVec.x, fileVec.z) * span, Math.hypot(rankVec.x, rankVec.z) * span),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  pickPlane.rotation.x = -Math.PI / 2;
  const c35 = squareWorld(3.5, 3.5);
  c35.y = boardY + 0.025;
  set.add(pickPlane);
  set.updateMatrixWorld(true);
  pickPlane.position.copy(set.worldToLocal(c35));
  pickPlane.updateMatrixWorld(true);

  const squareAt: ChessBoard3D["squareAt"] = (world) => {
    // solve world = e1 + fileVec*(f-4) + rankVec*r in xz (basis is orthogonal)
    const dx = world.x - e1.x;
    const dz = world.z - e1.z;
    const det = fileVec.x * rankVec.z - fileVec.z * rankVec.x;
    if (Math.abs(det) < 1e-9) return null;
    const fRel = (dx * rankVec.z - dz * rankVec.x) / det;
    const rRel = (fileVec.x * dz - fileVec.z * dx) / det;
    const f = Math.round(fRel + 4);
    const r = Math.round(rRel);
    if (f < 0 || f > 7 || r < 0 || r > 7) return null;
    return FILES[f] + String(r + 1);
  };

  // marks: a gold ring on the selected man, dots on his legal squares, a soft
  // wash on the last move
  const markMat = {
    from: new THREE.MeshBasicMaterial({ color: 0xe8c33c, transparent: true, opacity: 0.9 }),
    target: new THREE.MeshBasicMaterial({ color: 0xe8c33c, transparent: true, opacity: 0.55 }),
    last: new THREE.MeshBasicMaterial({ color: 0x86a9e0, transparent: true, opacity: 0.35 }),
  };
  const sq = Math.hypot(fileVec.x, fileVec.z);
  const markPool: THREE.Mesh[] = [];
  const markGroup = new THREE.Group();
  set.add(markGroup);
  const takeMark = (i: number): THREE.Mesh => {
    while (markPool.length <= i) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(sq * 0.42, 20), markMat.target);
      m.rotation.x = -Math.PI / 2;
      markGroup.add(m);
      markPool.push(m);
    }
    return markPool[i];
  };
  const fr = (s: string): [number, number] => [FILES.indexOf(s[0]), Number(s[1]) - 1];
  const setMarks: ChessBoard3D["setMarks"] = (marks) => {
    markGroup.updateMatrixWorld(true);
    let i = 0;
    const place = (s: string, mat: THREE.MeshBasicMaterial, ring = false): void => {
      const m = takeMark(i++);
      m.material = mat;
      m.scale.setScalar(ring ? 1 : 0.45);
      const [f, r] = fr(s);
      const w = squareWorld(f, r);
      w.y = boardY + 0.028; // just over the board surface
      m.position.copy(markGroup.worldToLocal(w));
      m.visible = true;
    };
    if (marks.last) for (const s of marks.last) place(s, markMat.last);
    if (marks.from) place(marks.from, markMat.from, true);
    for (const s of marks.targets ?? []) place(s, markMat.target);
    for (; i < markPool.length; i++) markPool[i].visible = false;
  };

  setFEN(null);
  return { setFEN, squareAt, setMarks, pickPlane };
}
