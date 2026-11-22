// PIPE DREAMS — THE REAL MACHINES (Josh, Sep 2026: "since i added new assets
// please use them intentionally and tastefully in the current maps").
//
// The furniture layer (pipes-tiles.ts GLYPHS) has always been a CONTRACT —
// anchors, footprints and facings — drawn by client/src/backrooms/
// pipes-props.ts as procedural boxes "until the pack's models replace them".
// This module is that replacement, for the pieces the kit now has a real
// model of: the lathe, the press, the transformer, the electrical cabinet,
// the lockers, the workbenches and the storage racks. The generator
// (worldgen-pipes.ts) turns each such piece into kit placements on its own
// footprint, and the client skips drawing the box for it. Nothing moves:
// the cells a machine stands on stay exactly as solid as they were, so the
// fingerprint (D3) doesn't change.
//
// IMPORT-FREE: the client reads `modelled` too, so the two can't disagree
// about which pieces are models.

export interface ModelPlace {
  p: string;
  v: number;
  x: number;
  y: number;
  r: number;
  z: number;
}

// the deco byte (pipes-vocab.ts PDECO / MACHINES), repeated here as numbers
const K_MACHINE = 8;
const K_RACK = 10;
const K_WALLA = 13;
const K_FREE = 15;
// MACHINES by variant: 3 cabinet 1×1 · 6 transformer 2×2 · 9 lathe 2×1 ·
// 10 lathe 1×2 · 11 press 2×2
const MODEL_MACHINES = new Set([3, 6, 9, 10, 11]);
// WALL_A types: 0 locker · 1 workbench
const MODEL_WALLA = new Set([0, 1]);
// FREE types (pipes-vocab.ts FREE): 1 table · 3 crates · 4 drums · 5 pallet ·
// 6 cable drum. (Nov 2026 polish round: the free pieces the kit has a real,
// cheap model of; the bench, the desk and the stall stay drawn — the kit's
// bench costs eleven draw calls, and Pipe Dreams' busiest patch IS the cost
// meter's budget, so every call added here is measured against it.)
const MODEL_FREE = new Set([1, 3, 4, 5, 6]);

/** Is this deco code drawn by a kit model rather than procedurally? */
export function modelled(code: number): boolean {
  const k = code >> 4;
  const v = code & 15;
  if (k === K_MACHINE) return MODEL_MACHINES.has(v);
  if (k === K_WALLA) return MODEL_WALLA.has(v >> 2);
  if (k === K_FREE) return MODEL_FREE.has(v >> 1);
  return k === K_RACK;
}

/** A model facing away from a wall on this side (the editor's rule):
 *  wall N → faces south (0), E → west (90), S → north (180), W → east (270). */
const AWAY = [0, 90, 180, 270];
/** A model facing TOWARD a side (0 N, 1 E, 2 S, 3 W). */
const TOWARD = [180, 270, 0, 90];

const hash = (x: number, y: number): number => ((Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0) % 1000;

/** Every kit placement the modelled pieces of a map need, in map cells.
 *  `code(x, y)` reads the deco byte, `open(x, y)` says whether a cell is
 *  walkable floor (to turn a machine's front toward the room). */
export function pieceModels(size: number, code: (x: number, y: number) => number, open: (x: number, y: number) => boolean): ModelPlace[] {
  const out: ModelPlace[] = [];
  const done = new Uint8Array(size * size);
  const put = (p: string, v: number, x: number, y: number, r: number, z = 0): void => {
    out.push({ p, v, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, r, z });
  };
  /** The side of a footprint with the most open floor along it. */
  const front = (x0: number, y0: number, w: number, h: number): number => {
    const count = (side: number): number => {
      let n = 0;
      if (side === 0 || side === 2) for (let x = x0; x < x0 + w; x++) n += open(x, side === 0 ? y0 - 1 : y0 + h) ? 1 : 0;
      else for (let y = y0; y < y0 + h; y++) n += open(side === 3 ? x0 - 1 : x0 + w, y) ? 1 : 0;
      return n;
    };
    let best = 2;
    for (const s of [2, 0, 1, 3]) if (count(s) > count(best)) best = s;
    return best;
  };
  /** A run of identical codes from (x, y) along x (ax 0) or y (ax 1). */
  const run = (x: number, y: number, c: number, ax: number): number => {
    let n = 0;
    while (true) {
      const xx = ax === 0 ? x + n : x;
      const yy = ax === 0 ? y : y + n;
      if (xx >= size || yy >= size || code(xx, yy) !== c || done[yy * size + xx]) break;
      n++;
    }
    return n;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = code(x, y);
      if (!c || !modelled(c) || done[y * size + x]) continue;
      const k = c >> 4;
      const v = c & 15;
      if (k === K_MACHINE) {
        done[y * size + x] = 1;
        if (v === 3) {
          // the electrical cabinet: an old steel street cabinet
          put("street-cabinet", 1, x + 0.5, y + 0.5, TOWARD[front(x, y, 1, 1)]);
        } else if (v === 6) {
          // the transformer: the pad-mounted one fills its 4 m square; now
          // and then the tall station transformer instead
          const f = front(x, y, 2, 2);
          if (hash(x, y) < 650) put("pad-transformer", 1, x + 1, y + 1, TOWARD[f]);
          else put("transformer-station", 1, x + 1, y + 1, TOWARD[f]);
        } else if (v === 9 || v === 10) {
          // the lathe: its bed along the footprint's long side, facing the
          // open side across it
          const w = v === 9 ? 2 : 1;
          const h = v === 9 ? 1 : 2;
          const f = front(x, y, w, h);
          const r = v === 9 ? (f === 0 ? 180 : 0) : f === 3 ? 90 : 270;
          put("engine-lathe", 1, x + w / 2, y + h / 2, r);
        } else if (v === 11) {
          // the press: the shop press and a pillar drill side by side on
          // its 4 m square, both facing the room
          const f = front(x, y, 2, 2);
          const r = TOWARD[f];
          const acrossX = f === 0 || f === 2;
          const sx = acrossX ? 1 : 0;
          const sy = acrossX ? 0 : 1;
          put("hydraulic-press", 1, x + 1 - 0.35 * sx, y + 1 - 0.35 * sy, r);
          put("pillar-drill", 1, x + 1 + 0.6 * sx, y + 1 + 0.6 * sy, r);
        }
      } else if (k === K_WALLA) {
        const side = v & 3;
        const type = v >> 2;
        const r = AWAY[side];
        // back to the wall: the piece's centre this far off the cell's middle
        const back = (depthM: number): [number, number] => {
          const off = 0.5 - depthM / 4 - 0.02;
          return [side === 1 ? off : side === 3 ? -off : 0, side === 2 ? off : side === 0 ? -off : 0];
        };
        if (type === 0) {
          done[y * size + x] = 1;
          // lockers: the two-tier staff bank, or a blue row of three
          if (hash(x, y) < 660) {
            const [ox, oy] = back(0.68);
            put("locker-two-tier", 1, x + 0.5 + ox, y + 0.5 + oy, r);
          } else {
            const [ox, oy] = back(0.46);
            put("locker-blue", 1, x + 0.5 + ox, y + 0.5 + oy, r);
          }
        } else {
          // workbenches come in runs along the wall: a pegboard bench across
          // every two cells, a steel-frame table on an odd one out
          const ax = side === 0 || side === 2 ? 0 : 1;
          const n = run(x, y, c, ax);
          for (let i = 0; i < n; i++) done[(ax === 0 ? y : y + i) * size + (ax === 0 ? x + i : x)] = 1;
          let i = 0;
          for (; i + 1 < n; i += 2) {
            const [ox, oy] = back(0.73);
            put("workbench-pegboard", 1, (ax === 0 ? x + i + 1 : x + 0.5) + ox, (ax === 0 ? y + 0.5 : y + i + 1) + oy, r);
          }
          if (i < n) {
            const [ox, oy] = back(0.9);
            put("steel-frame-table", 1, (ax === 0 ? x + i + 0.5 : x + 0.5) + ox, (ax === 0 ? y + 0.5 : y + i + 0.5) + oy, r);
          }
        }
      } else if (k === K_FREE) {
        done[y * size + x] = 1;
        const type = v >> 1;
        const axis = v & 1;
        // the piece's frame: a along its long side, o across it, in METRES
        // off the cell's middle (pipes-props.ts freePiece draws the same frame)
        const at = (a: number, o: number): [number, number] => (axis === 0 ? [x + 0.5 + a / 2, y + 0.5 + o / 2] : [x + 0.5 + o / 2, y + 0.5 + a / 2]);
        const yaw = (r: number): number => (r + (axis === 0 ? 0 : 90)) % 360;
        const h = hash(x, y);
        if (type === 1) {
          // a table: the steel-frame workshop table
          put("steel-frame-table", 1, ...at(0, 0), yaw(0));
        } else if (type === 3) {
          // crates: two on the floor, side by side
          put("wood-crate", 1, ...at(-0.25, 0.08), yaw(0));
          put("wood-crate", 1, ...at(0.3, -0.15), yaw(h < 500 ? 8 : 352));
        } else if (type === 4) {
          // drums: a standing one and a torn one beside it (the kit's drums
          // are heavy in triangles — three a piece put the plant past the
          // cost meter's budget)
          put("hazard-drum", 1 + (h % 4), ...at(-0.3, -0.2), yaw(0));
          put("hazard-drum-torn", 1 + (h % 2), ...at(0.35, 0.2), yaw(110));
        } else if (type === 5) {
          // a pallet, loaded more often than not
          put("wood-pallet", 1, ...at(0, 0), yaw(0));
          if (h < 600) {
            put("wood-crate", 1, ...at(-0.2, 0), yaw(0), 0.14);
            put("wood-crate", 1, ...at(0.25, 0.05), yaw(6), 0.14);
          }
        } else {
          // a cable drum standing on its rim, its axle along the piece
          put("cable-drum", 1, ...at(0, 0), axis === 0 ? 90 : 0);
        }
      } else if (k === K_RACK) {
        // storage racks: pallet racking across every two cells of a run,
        // open shelving on an odd one out
        const ax = v & 1;
        const n = run(x, y, c, ax);
        for (let i = 0; i < n; i++) done[(ax === 0 ? y : y + i) * size + (ax === 0 ? x + i : x)] = 1;
        const r = ax === 0 ? 0 : 90;
        let i = 0;
        for (; i + 1 < n; i += 2) put("pallet-rack", 1, ax === 0 ? x + i + 1 : x + 0.5, ax === 0 ? y + 0.5 : y + i + 1, r);
        if (i < n) put("open-shelving", 2, ax === 0 ? x + i + 0.5 : x + 0.5, ax === 0 ? y + 0.5 : y + i + 0.5, r);
      }
    }
  }
  return out;
}
