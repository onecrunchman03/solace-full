// THE MAP EDITOR's CLIPBOARD — a boxed piece of a room design, lifted out,
// turned, flipped and stamped back down (Josh, Sep 2026: "select, move and
// copy … drag a box around part of a room to move it, copy it, turn it or
// paste it into another room").
//
// A clip is every layer of the rectangle at once — floor, heights, stairs,
// room labels, thin walls, furniture, the turns drawn on furniture, doorways
// and kit props — so what you box is what you get. Cells that are not part of
// the room (' ') are TRANSPARENT when stamped: pasting an L-shaped piece never
// punches the rest of its rectangle out of the room underneath.
//
// Pure text-layer arithmetic over tiles.ts's format, no DOM: the editor calls
// it, and test_mapeditor_clip.mjs drives it. Turning follows tiles.ts's own
// rule for whole rooms (a clockwise quarter turn maps cell (x, y) of a w×h
// piece to (h-1-y, x), a prop's yaw gains 90), so a turned clip and a turned
// room agree.

import type { TileDef, DoorSpec } from "./tiles";
import type { KitPlace } from "./kit";
import type { MarkPlace } from "./marks";

type Grid = "map" | "height" | "ceiling" | "stair" | "rooms" | "furn";
const GRIDS: readonly Grid[] = ["map", "height", "ceiling", "stair", "rooms", "furn"];
const BLANK: Record<Grid, string> = { map: " ", height: ".", ceiling: ".", stair: ".", rooms: ".", furn: "." };
const SIDES = "NESW";

export interface Clip {
  w: number;
  h: number;
  /** One string per row per layer, like a TileDef's. */
  map: string[];
  height: string[];
  /** The held ceiling (tiles.ts `ceiling`) — it travels with its floor. */
  ceiling: string[];
  stair: string[];
  rooms: string[];
  furn: string[];
  /** Thin walls as edges: [x, y, side], stored on the cell that OWNS the edge
   *  ('N' of (x, y) or 'W' of (x, y)); x may be w and y may be h, so a wall on
   *  the piece's east or south border survives a turn. */
  walls: [number, number, "N" | "W"][];
  face: [number, number, string][];
  doors: DoorSpec[];
  inner: DoorSpec[];
  props: KitPlace[];
  marks: MarkPlace[];
}

const rowsOf = (t: TileDef, k: Grid | "walls"): string[] => (t[k] as string[] | undefined) ?? [];
const at = (rows: string[], x: number, y: number, blank: string): string => (rows[y] ?? "")[x] ?? blank;

function lanes(d: DoorSpec): [number, number][] {
  const s = SIDES.indexOf(d[2]);
  const lx = s === 0 || s === 2 ? 1 : 0;
  return Array.from({ length: d[3] }, (_, k) => [d[0] + lx * k, d[1] + (1 - lx) * k]);
}

/** Lift the rectangle x0..x1 × y0..y1 (inclusive) out of a room. */
export function cutClip(t: TileDef, x0: number, y0: number, x1: number, y1: number): Clip {
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const c: Clip = { w, h, map: [], height: [], ceiling: [], stair: [], rooms: [], furn: [], walls: [], face: [], doors: [], inner: [], props: [], marks: [] };
  for (const k of GRIDS) {
    const rows = rowsOf(t, k);
    for (let y = 0; y < h; y++) {
      let r = "";
      for (let x = 0; x < w; x++) r += at(rows, x0 + x, y0 + y, BLANK[k]);
      c[k].push(r);
    }
  }
  // thin walls: the N and W edges of every cell in the box, plus the S edge of
  // the bottom row and the E edge of the right column (owned by the cells
  // just outside, which is why a clip's walls may sit at x = w or y = h)
  const walls = rowsOf(t, "walls");
  const has = (x: number, y: number, s: "N" | "W"): boolean => {
    const ch = at(walls, x, y, ".");
    return s === "N" ? ch === "-" || ch === "+" : ch === "|" || ch === "+";
  };
  for (let y = 0; y <= h; y++) {
    for (let x = 0; x <= w; x++) {
      if (x < w && has(x0 + x, y0 + y, "N")) c.walls.push([x, y, "N"]);
      if (y < h && has(x0 + x, y0 + y, "W")) c.walls.push([x, y, "W"]);
    }
  }
  const inBox = (x: number, y: number): boolean => x >= x0 && y >= y0 && x <= x1 && y <= y1;
  for (const f of t.face ?? []) if (inBox(f[0], f[1])) c.face.push([f[0] - x0, f[1] - y0, f[2]]);
  for (const d of t.doors ?? []) if (lanes(d).every(([x, y]) => inBox(x, y))) c.doors.push([d[0] - x0, d[1] - y0, d[2], d[3]]);
  for (const d of t.inner ?? []) if (lanes(d).every(([x, y]) => inBox(x, y))) c.inner.push([d[0] - x0, d[1] - y0, d[2], d[3]]);
  // a prop belongs to the cell its middle stands in
  for (const p of t.props ?? []) if (inBox(Math.floor(p.x), Math.floor(p.y))) c.props.push({ ...p, x: round2(p.x - x0), y: round2(p.y - y0) });
  for (const m of t.marks ?? []) if (inBox(Math.floor(m.x), Math.floor(m.y))) c.marks.push({ ...m, x: round2(m.x - x0), y: round2(m.y - y0) });
  return c;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;
const yaw = (r: number): number => ((Math.round(r * 1000) / 1000) % 360 + 360) % 360;

/** Turn a clip a quarter turn clockwise. */
export function turnClip(c: Clip): Clip {
  const { w, h } = c;
  // cell (x, y) → (h-1-y, x); the new piece is h wide and w tall
  const out: Clip = { w: h, h: w, map: [], height: [], ceiling: [], stair: [], rooms: [], furn: [], walls: [], face: [], doors: [], inner: [], props: [], marks: [] };
  const STAIR_CW: Record<string, string> = { "^": ">", ">": "v", v: "<", "<": "^" };
  for (const k of GRIDS) {
    for (let ny = 0; ny < w; ny++) {
      let r = "";
      for (let nx = 0; nx < h; nx++) {
        // inverse: new (nx, ny) came from old (ny, h-1-nx)
        const ch = at(c[k], ny, h - 1 - nx, BLANK[k]);
        r += k === "stair" ? (STAIR_CW[ch] ?? ch) : ch;
      }
      out[k].push(r);
    }
  }
  // an edge: side s of cell (x, y) becomes side s+1 of cell (h-1-y, x)
  const edge = (x: number, y: number, s: number): [number, number, "N" | "W"] | null => {
    const nx = h - 1 - y;
    const ny = x;
    const ns = (s + 1) % 4;
    if (ns === 0) return [nx, ny, "N"];
    if (ns === 3) return [nx, ny, "W"];
    if (ns === 2) return [nx, ny + 1, "N"];
    return [nx + 1, ny, "W"];
  };
  for (const [x, y, s] of c.walls) {
    // a wall stored on (x, y) as N may belong to the row below the piece
    // (y = h): its owner cell (x, y) is then outside, the edge is the S edge
    // of (x, y-1) — both forms map through the same edge
    const e = s === "N" ? (y < c.h ? edge(x, y, 0) : edge(x, y - 1, 2)) : x < c.w ? edge(x, y, 3) : edge(x - 1, y, 1);
    if (e) out.walls.push(e);
  }
  const FACE_CW: Record<string, string> = { N: "E", E: "S", S: "W", W: "N", H: "V", V: "H" };
  for (const [x, y, f] of c.face) out.face.push([h - 1 - y, x, FACE_CW[f.toUpperCase()] ?? f]);
  const turnDoor = (d: DoorSpec): DoorSpec => {
    const cells = lanes(d).map(([x, y]) => [h - 1 - y, x] as [number, number]);
    const s = SIDES[(SIDES.indexOf(d[2]) + 1) % 4];
    return [Math.min(...cells.map((q) => q[0])), Math.min(...cells.map((q) => q[1])), s, d[3]];
  };
  out.doors = c.doors.map(turnDoor);
  out.inner = c.inner.map(turnDoor);
  // a point: (x, y) → (h - y, x) (tiles.ts's prop rule), a yaw gains 90
  out.props = c.props.map((p) => ({ ...p, x: round2(h - p.y), y: round2(p.x), r: yaw((p.r ?? 0) + 90) || undefined }));
  out.marks = c.marks.map((m) => ({ ...m, x: round2(h - m.y), y: round2(m.x) }));
  return out;
}

/** Flip a clip east for west. */
export function flipClip(c: Clip): Clip {
  const { w, h } = c;
  const out: Clip = { w, h, map: [], height: [], ceiling: [], stair: [], rooms: [], furn: [], walls: [], face: [], doors: [], inner: [], props: [], marks: [] };
  const STAIR_FLIP: Record<string, string> = { ">": "<", "<": ">" };
  for (const k of GRIDS) {
    for (let y = 0; y < h; y++) {
      let r = "";
      for (let x = 0; x < w; x++) {
        const ch = at(c[k], w - 1 - x, y, BLANK[k]);
        r += k === "stair" ? (STAIR_FLIP[ch] ?? ch) : ch;
      }
      out[k].push(r);
    }
  }
  // N edges stay N (x mirrored); a W edge of x becomes the E edge of w-1-x,
  // i.e. the W edge of w-x
  for (const [x, y, s] of c.walls) out.walls.push(s === "N" ? [w - 1 - x, y, "N"] : [w - x, y, "W"]);
  const FACE_FLIP: Record<string, string> = { E: "W", W: "E" };
  for (const [x, y, f] of c.face) out.face.push([w - 1 - x, y, FACE_FLIP[f.toUpperCase()] ?? f]);
  const flipDoor = (d: DoorSpec): DoorSpec => {
    const cells = lanes(d).map(([x, y]) => [w - 1 - x, y] as [number, number]);
    const s = d[2] === "E" ? "W" : d[2] === "W" ? "E" : d[2];
    return [Math.min(...cells.map((q) => q[0])), Math.min(...cells.map((q) => q[1])), s, d[3]];
  };
  out.doors = c.doors.map(flipDoor);
  out.inner = c.inner.map(flipDoor);
  // a flip swaps a prop's left for its right: its roll changes sign
  out.props = c.props.map((p) => ({ ...p, x: round2(w - p.x), r: yaw(-(p.r ?? 0)) || undefined, ...(p.rz ? { rz: -p.rz } : {}) }));
  out.marks = c.marks.map((m) => ({ ...m, x: round2(w - m.x) }));
  return out;
}

/** Everything a room grows to hold a stamp at (x0, y0) that runs past its
 *  edge: the room is widened, never cropped. Returns the offset the room's
 *  own content moved by (a stamp above or left of it shifts the room). */
function grow(t: TileDef, x0: number, y0: number, c: Clip): { dx: number; dy: number } {
  const w = Math.max(1, ...t.map.map((r) => r.length));
  const h = t.map.length;
  const dx = Math.max(0, -x0);
  const dy = Math.max(0, -y0);
  const nw = Math.max(w + dx, x0 + dx + c.w);
  const nh = Math.max(h + dy, y0 + dy + c.h);
  if (!dx && !dy && nw === w && nh === h) return { dx: 0, dy: 0 };
  const rec = t as unknown as Record<string, string[] | undefined>;
  for (const k of [...GRIDS, "walls"] as const) {
    const rows = rec[k];
    if (!rows && k !== "map") continue;
    const blank = k === "map" ? " " : ".";
    rec[k] = Array.from({ length: nh }, (_, y) => Array.from({ length: nw }, (_, x) => at(rows ?? [], x - dx, y - dy, blank)).join(""));
  }
  if (dx || dy) {
    const mv = (d: DoorSpec): DoorSpec => [d[0] + dx, d[1] + dy, d[2], d[3]];
    t.doors = (t.doors ?? []).map(mv);
    if (t.inner) t.inner = t.inner.map(mv);
    if (t.face) t.face = t.face.map((f) => [f[0] + dx, f[1] + dy, f[2]]);
    if (t.props) t.props = t.props.map((p) => ({ ...p, x: round2(p.x + dx), y: round2(p.y + dy) }));
    if (t.marks) t.marks = t.marks.map((m) => ({ ...m, x: round2(m.x + dx), y: round2(m.y + dy) }));
  }
  return { dx, dy };
}

/** Stamp a clip into a room with its top-left at (x0, y0). The room grows if
 *  the stamp runs past its edge (at most 72 cells, the library's limit).
 *  Cells of the clip that are not part of the room leave the room alone. */
export function stampClip(t: TileDef, c: Clip, x0: number, y0: number): void {
  const { dx, dy } = grow(t, x0, y0, c);
  x0 += dx;
  y0 += dy;
  const rec = t as unknown as Record<string, string[] | undefined>;
  const set = (k: Grid | "walls", x: number, y: number, ch: string): void => {
    let rows = rec[k];
    if (!rows) {
      const w = Math.max(1, ...t.map.map((r) => r.length));
      rows = rec[k] = Array.from({ length: t.map.length }, () => ".".repeat(w));
    }
    const r = rows[y] ?? "";
    rows[y] = r.slice(0, x) + ch + r.slice(x + 1);
  };
  const solidIn = (x: number, y: number): boolean => at(c.map, x, y, " ") !== " ";
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      if (!solidIn(x, y)) continue;
      for (const k of GRIDS) set(k, x0 + x, y0 + y, at(c[k], x, y, BLANK[k]));
      // the stamp's own cells lose the walls they had; the clip's go up below
      const cur = at(rec.walls ?? [], x0 + x, y0 + y, ".");
      if (cur !== ".") set("walls", x0 + x, y0 + y, ".");
    }
  }
  const wallsRows = (): string[] => rec.walls ?? [];
  for (const [x, y, s] of c.walls) {
    const gx = x0 + x;
    const gy = y0 + y;
    if (gy >= t.map.length || gx >= Math.max(...t.map.map((r) => r.length))) continue;
    const cur = at(wallsRows(), gx, gy, ".");
    let n = cur === "-" || cur === "+";
    let wv = cur === "|" || cur === "+";
    if (s === "N") n = true;
    else wv = true;
    set("walls", gx, gy, n && wv ? "+" : n ? "-" : wv ? "|" : ".");
  }
  const inStamp = (x: number, y: number): boolean => x >= x0 && y >= y0 && x < x0 + c.w && y < y0 + c.h && solidIn(x - x0, y - y0);
  // what the stamp covers is replaced: the room's own furniture turns, doors
  // and props inside it go, the clip's arrive
  if (t.face) t.face = t.face.filter((f) => !inStamp(f[0], f[1]));
  t.doors = (t.doors ?? []).filter((d) => !lanes(d).some(([x, y]) => inStamp(x, y)));
  if (t.inner) t.inner = t.inner.filter((d) => !lanes(d).some(([x, y]) => inStamp(x, y)));
  if (t.props) t.props = t.props.filter((p) => !inStamp(Math.floor(p.x), Math.floor(p.y)));
  if (t.marks) t.marks = t.marks.filter((m) => !inStamp(Math.floor(m.x), Math.floor(m.y)));
  const face = [...(t.face ?? []), ...c.face.map((f) => [f[0] + x0, f[1] + y0, f[2]] as [number, number, string])];
  t.face = face.length ? face : undefined;
  t.doors.push(...c.doors.map((d) => [d[0] + x0, d[1] + y0, d[2], d[3]] as DoorSpec));
  const inner = [...(t.inner ?? []), ...c.inner.map((d) => [d[0] + x0, d[1] + y0, d[2], d[3]] as DoorSpec)];
  t.inner = inner.length ? inner : undefined;
  const props = [...(t.props ?? []), ...c.props.map((p) => ({ ...p, x: round2(p.x + x0), y: round2(p.y + y0) }))];
  t.props = props.length ? props : undefined;
  const marks = [...(t.marks ?? []), ...c.marks.map((m) => ({ ...m, x: round2(m.x + x0), y: round2(m.y + y0) }))];
  t.marks = marks.length ? marks : undefined;
}

/** Clear a rectangle. `all` takes the floor too (the cells stop being part
 *  of the room); otherwise only what stands on it goes — furniture, stairs,
 *  thin walls inside it, props — and the floor stays. */
export function clearBox(t: TileDef, x0: number, y0: number, x1: number, y1: number, all: boolean): void {
  const rec = t as unknown as Record<string, string[] | undefined>;
  const inBox = (x: number, y: number): boolean => x >= x0 && y >= y0 && x <= x1 && y <= y1;
  const layers: (Grid | "walls")[] = all ? [...GRIDS, "walls"] : ["stair", "furn", "walls"];
  for (const k of layers) {
    const rows = rec[k];
    if (!rows) continue;
    const blank = k === "map" ? " " : ".";
    rec[k] = rows.map((r, y) => [...r].map((ch, x) => (inBox(x, y) ? blank : ch)).join(""));
  }
  if (t.face) t.face = t.face.filter((f) => !inBox(f[0], f[1]));
  if (t.props) t.props = t.props.filter((p) => !inBox(Math.floor(p.x), Math.floor(p.y)));
  if (t.marks) t.marks = t.marks.filter((m) => !inBox(Math.floor(m.x), Math.floor(m.y)));
  if (all) {
    t.doors = (t.doors ?? []).filter((d) => !lanes(d).some(([x, y]) => inBox(x, y)));
    if (t.inner) t.inner = t.inner.filter((d) => !lanes(d).some(([x, y]) => inBox(x, y)));
  }
  if (t.face && !t.face.length) t.face = undefined;
  if (t.props && !t.props.length) t.props = undefined;
  if (t.marks && !t.marks.length) t.marks = undefined;
}
