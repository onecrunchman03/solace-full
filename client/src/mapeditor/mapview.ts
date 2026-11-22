// The map editor's whole-level view: the level the generator builds from the
// library as it stands in the editor (saved or not), drawn top-down. Every
// piece is outlined; hovering names it and clicking opens it in the editor.
// Kit props are the small warm dots, game markers the coloured ones.
//
// OVERLAYS (Josh, Sep 2026: "design from what players actually do"): where
// people died, where nobody has ever been, and how far every cell is from the
// level's door — and, comparing two versions, which rooms changed.

export interface MapData {
  size: number;
  floor: Int8Array;
  solid: Uint8Array;
  /** Scenery: drawn, never walked to on purpose. */
  background: Uint8Array;
  wallN: Uint8Array;
  wallW: Uint8Array;
  deco: Uint8Array;
  district: Uint8Array;
  types: string[];
  /** 1 the Poolrooms, 2 Pipe Dreams, 4 the office — their deco codes mean different things. */
  level: number;
  /** The level's doors (the Poolrooms has four). */
  doors: { x: number; y: number; name: string }[];
  insts: { id: number; tileId: string; x: number; y: number; w: number; h: number; main: boolean; name: string | null }[];
  hatch: { x: number; y: number };
  /** Placed props: [id, variant, x, y, yaw]. */
  kit: [string, number, number, number, number][];
  /** The level's own rules it breaks (empty = it may go live). */
  problems: string[];
  stats: Record<string, unknown>;
  /** Steps from the level's door to each cell (0xffff = out of reach). */
  dist: Uint16Array | null;
  /** Game markers: [kind, x, y]. */
  marks: [string, number, number][];
}

/** What to lay over the map. */
export type Overlay =
  | { kind: "none" }
  | { kind: "deaths"; deaths: { x: number; y: number; cause: string }[] }
  | { kind: "explored"; explored: Uint8Array }
  | { kind: "distance" }
  | { kind: "changes"; changed: ReadonlySet<string>; added: ReadonlySet<string> }
  /** Floor nobody can walk to from the level's door (scenery excluded). */
  | { kind: "unreach" }
  /** Every copy of one room in the level. */
  | { kind: "uses"; tileId: string }
  /** The cost meter: how full each square's budget is (1 = the heaviest live
   *  square today), `n` squares a side, each `square` cells across. */
  | { kind: "weight"; n: number; square: number; loads: readonly number[] };

const MARK_COLOR: Record<string, string> = { entity: "#ff4d4d", gator: "#46c46a", relic: "#ffd24a", drive: "#5cc8ff" };
/** Blue near the door, through yellow, to red at the far end. */
function ramp(t: number): [number, number, number] {
  const u = Math.max(0, Math.min(1, t));
  if (u < 0.5) return [Math.round(40 + u * 2 * 215), Math.round(120 + u * 2 * 110), Math.round(220 - u * 2 * 180)];
  return [255, Math.round(230 - (u - 0.5) * 2 * 190), Math.round(40 - (u - 0.5) * 2 * 20)];
}

const TINT: Record<string, [number, number, number]> = {
  // LIGHTS OUT: the Wet End under water
  wetway: [-40, -10, 40],
  cistern: [-50, -16, 50],
  seahatch: [-30, -20, 40],
  pipegallery: [26, 18, 0],
  servicering: [14, 10, 0],
  corridor: [34, 34, 30],
  tunnel: [-22, -24, -26],
  office: [4, 4, 8],
  suite: [0, 10, 18],
  breakroom: [-40, 40, -30],
  controlroom: [-40, 40, -10],
  drainroom: [-50, 30, 60],
  enginehall: [-20, -24, -28],
  catwalk: [60, 10, -30],
  boilerhouse: [20, -4, -14],
  warehouse: [10, 6, -4],
  machineshop: [-4, 6, 14],
  vault: [30, -20, -20],
  // Level 0: the yellow, darker where it's low
  classic: [40, 30, -30],
  pillars: [34, 26, -30],
  offices: [28, 24, -26],
  warrens: [14, 8, -34],
  halls: [36, 28, -26],
  atrium: [54, 44, -16],
  terraces: [42, 34, -24],
  sublevel: [0, -4, -36],
  manila: [10, -6, -40],
  restrooms: [60, 64, 60],
  panelled: [-10, -30, -50],
  storage: [20, 20, 16],
  unlit: [-60, -64, -70],
  // the Poolrooms: pale tile, the halls a touch warmer than the rivers
  river: [40, 50, 56],
  natatorium: [70, 74, 74],
  vaultsea: [44, 56, 62],
  portalhall: [60, 66, 68],
  tunnels: [40, 46, 46],
  shallows: [56, 66, 66],
  rotunda: [76, 78, 78],
  baths: [62, 68, 72],
};

export function decodeMap(j: Record<string, unknown>): MapData {
  const b64 = (s: unknown): Uint8Array => Uint8Array.from(atob(String(s)), (c) => c.charCodeAt(0));
  return {
    size: j.size as number,
    floor: new Int8Array(b64(j.floor).buffer),
    solid: b64(j.solid),
    background: j.background ? b64(j.background) : new Uint8Array((j.size as number) ** 2),
    wallN: b64(j.wallN),
    wallW: b64(j.wallW),
    deco: b64(j.deco),
    district: b64(j.district),
    types: j.types as string[],
    level: (j.level as number) ?? 2,
    doors: (j.doors as MapData["doors"]) ?? [],
    insts: j.insts as MapData["insts"],
    hatch: j.hatch as MapData["hatch"],
    kit: (j.kit as MapData["kit"]) ?? [],
    problems: (j.problems as string[]) ?? [],
    stats: j.stats as Record<string, unknown>,
    dist: j.dist ? new Uint16Array(b64(j.dist).buffer) : null,
    marks: (j.marks as MapData["marks"]) ?? [],
  };
}

/** Draw the map into `canvas`; returns a hit test for pointer coordinates. */
export function drawMap(canvas: HTMLCanvasElement, m: MapData, hover: number, pick: number, overlay: Overlay = { kind: "none" }): (px: number, py: number) => number {
  const S = Math.max(2, Math.floor(Math.min(canvas.clientWidth, canvas.clientHeight || canvas.clientWidth) / m.size));
  const W = m.size * S;
  canvas.width = W;
  canvas.height = W;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(W, W);
  const d = img.data;
  const put = (px: number, py: number, r: number, g: number, b: number): void => {
    const i = (py * W + px) * 4;
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = 255;
  };
  const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
  let maxDist = 1;
  if (m.dist) for (let i = 0; i < m.dist.length; i++) if (m.dist[i] !== 0xffff && m.dist[i] > maxDist) maxDist = m.dist[i];
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      const i = y * m.size + x;
      const kind = m.deco[i] >> 4;
      let c: [number, number, number] = [18, 17, 16];
      if (!m.solid[i]) {
        const g = 92 + Math.round((m.floor[i] / 6) * 22);
        const t = TINT[m.types[m.district[i]]] ?? [0, 0, 0];
        c = [clamp(g + t[0]), clamp(g - 2 + t[1]), clamp(g - 6 + t[2])];
        if (m.level === 7) {
          // THALASSOPHOBIA: the water by depth (mid blue to near black), dry
          // roofs grey, the tower tan; the helmet spots red, the subway
          // stair magenta, a lamp yellow
          const f = m.floor[i];
          const ty = m.types[m.district[i]];
          if (ty === "seatower") c = [170, 150, 112];
          else if (f >= 0) c = [140, 144, 146];
          else {
            const k = Math.min(1, -f / 50);
            c = [clamp(120 - 114 * k), clamp(170 - 156 * k), clamp(190 - 164 * k)];
          }
          if (kind === 4) c = [240, 60, 60];
          else if (kind === 3) c = [235, 70, 215];
          else if (kind === 1) c = [235, 215, 120];
        } else if (m.level === 9) {
          // THE SUBURBS: the key spots red, Number 9's door magenta, a lit
          // streetlight yellow
          if (kind === 4) c = [240, 60, 60];
          else if (kind === 3) c = [235, 70, 215];
          else if (kind === 1 && ((m.deco?.[i] ?? 0) & 15) !== 1 && ((m.deco?.[i] ?? 0) & 15) !== 2 && ((m.deco?.[i] ?? 0) & 15) !== 4) c = [235, 215, 120];
        } else if (m.level === 8) {
          // THE CAVE SYSTEM: the rope spots red, the Chimney magenta, a lit
          // lamp yellow; a drop that kills near black
          if (m.floor[i] <= -9) c = [10, 8, 8];
          if (kind === 4) c = [240, 60, 60];
          else if (kind === 3) c = [235, 70, 215];
          else if (kind === 1) c = [235, 215, 120];
        } else if (m.level === 6) {
          // LIGHTS OUT: the Handwheel spots red, battery spots yellow, the sea
          // hatch magenta; a dead fixture's cell a shade darker
          if (kind === 4) c = [240, 60, 60];
          else if (kind === 5) c = [230, 210, 60];
          else if (kind === 3) c = [235, 70, 215];
          else if (kind === 1) c = [clamp(c[0] - 18), clamp(c[1] - 18), clamp(c[2] - 18)];
        } else if (m.level === 5) {
          // THE HOTEL: the key hooks red, the register gold, the rusty door
          // magenta, lifts cyan, furnaces orange, nests violet
          if (kind === 4) c = [240, 60, 60];
          else if (kind === 5) c = [255, 210, 60];
          else if (kind === 3) c = [235, 70, 215];
          else if (kind === 6) c = [60, 210, 230];
          else if (kind === 8) c = [255, 138, 30];
          else if (kind === 9) c = [154, 70, 220];
        } else if (m.level === 4) {
          // THE OFFICE: the keycard red, the stairwell door magenta, the
          // windows cyan, a dead troffer's cell a shade darker
          if (kind === 4) c = [240, 60, 60];
          else if (kind === 3) c = [235, 70, 215];
          else if (kind === 5) c = [80, 205, 235];
        } else if (m.level === 1) {
          // under the water line: blue, darker the deeper
          if (m.floor[i] < -1) c = [clamp(60 + m.floor[i] * 6), clamp(150 + m.floor[i] * 10), clamp(210 + m.floor[i] * 4)];
          if (kind === 5) c = [185, 138, 90];
        } else {
          if (kind === 5) c = [214, 168, 70];
          if (kind === 2) c = [clamp(c[0] + 50), clamp(c[1] + 45), clamp(c[2] + 10)];
        }
      } else if (m.level === 1 && (kind === 1 || kind === 7)) c = [220, 224, 224];
      else if (m.level !== 1 && m.level !== 4 && m.level !== 5 && m.level !== 6 && m.level !== 7 && m.level !== 8 && m.level !== 9 && (kind === 8 || kind === 9)) c = [96, 116, 136];
      else if (m.level !== 1 && m.level !== 4 && m.level !== 5 && m.level !== 6 && m.level !== 7 && m.level !== 8 && m.level !== 9 && kind === 10) c = [120, 92, 56];
      // the overlays that colour cells
      if (overlay.kind === "distance" && m.dist && !m.solid[i]) {
        const dv = m.dist[i];
        if (dv !== 0xffff) {
          const r = ramp(dv / maxDist);
          c = [clamp(c[0] * 0.35 + r[0] * 0.65), clamp(c[1] * 0.35 + r[1] * 0.65), clamp(c[2] * 0.35 + r[2] * 0.65)];
        }
      }
      if (overlay.kind === "explored" && !m.solid[i] && !overlay.explored[i]) c = [clamp(c[0] * 0.35 + 150), clamp(c[1] * 0.35 + 30), clamp(c[2] * 0.35 + 90)];
      if (overlay.kind === "unreach") {
        if (!m.solid[i] && !m.background[i] && m.dist && m.dist[i] === 0xffff) c = [255, 40, 200];
        else c = [clamp(c[0] * 0.55), clamp(c[1] * 0.55), clamp(c[2] * 0.55)];
      }
      for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) put(x * S + px, y * S + py, ...c);
    }
  }
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      const i = y * m.size + x;
      if (m.wallN[i]) for (let k = 0; k < S; k++) put(x * S + k, y * S, 232, 228, 218);
      if (m.wallW[i]) for (let k = 0; k < S; k++) put(x * S, y * S + k, 232, 228, 218);
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = "rgba(255, 196, 120, 0.9)";
  const dot = Math.max(1, Math.floor(S / 2));
  for (const k of m.kit) ctx.fillRect(Math.round(k[2] * S) - (dot >> 1), Math.round(k[3] * S) - (dot >> 1), dot, dot);
  // the game markers
  for (const [k, x, y] of m.marks) {
    ctx.fillStyle = MARK_COLOR[k] ?? "#999";
    ctx.beginPath();
    ctx.arc(x * S, y * S, Math.max(2.5, S * 1.2), 0, Math.PI * 2);
    ctx.fill();
  }
  // deaths: a red mark where each one happened, brighter where many did
  if (overlay.kind === "deaths") {
    for (const dth of overlay.deaths) {
      ctx.fillStyle = "rgba(255, 30, 30, 0.35)";
      ctx.beginPath();
      ctx.arc(dth.x * S, dth.y * S, Math.max(4, S * 3), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ff2a2a";
      ctx.fillRect(dth.x * S - 1.5, dth.y * S - 1.5, 3, 3);
    }
  }
  // comparing: the rooms that changed, and the new ones
  if (overlay.kind === "changes") {
    for (const inst of m.insts) {
      const isNew = overlay.added.has(inst.tileId);
      if (!isNew && !overlay.changed.has(inst.tileId)) continue;
      ctx.fillStyle = isNew ? "rgba(61,220,132,0.28)" : "rgba(255,210,74,0.28)";
      ctx.fillRect(inst.x * S, inst.y * S, inst.w * S, inst.h * S);
      ctx.strokeStyle = isNew ? "#3ddc84" : "#ffd24a";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(inst.x * S + 0.5, inst.y * S + 0.5, inst.w * S - 1, inst.h * S - 1);
    }
  }
  // where one room is used: every copy filled and outlined
  if (overlay.kind === "uses") {
    for (const inst of m.insts) {
      if (inst.tileId !== overlay.tileId) continue;
      ctx.fillStyle = "rgba(61,220,132,0.35)";
      ctx.fillRect(inst.x * S, inst.y * S, inst.w * S, inst.h * S);
      ctx.strokeStyle = "#3ddc84";
      ctx.lineWidth = 2;
      ctx.strokeRect(inst.x * S + 1, inst.y * S + 1, inst.w * S - 2, inst.h * S - 2);
    }
  }
  // the cost meter: green with room to spare, amber getting full, red heavier
  // than anything live today
  if (overlay.kind === "weight") {
    const q = overlay.square * S;
    for (let sy = 0; sy < overlay.n; sy++) {
      for (let sx = 0; sx < overlay.n; sx++) {
        const load = overlay.loads[sy * overlay.n + sx];
        if (load <= 0.02) continue;
        ctx.fillStyle = load > 1 ? "rgba(255,40,40,0.55)" : load > 0.6 ? "rgba(255,190,40,0.45)" : `rgba(61,220,132,${(0.12 + load * 0.4).toFixed(2)})`;
        ctx.fillRect(sx * q, sy * q, q, q);
        if (load > 0.6) {
          ctx.fillStyle = "#fff";
          ctx.font = `${Math.max(9, Math.min(13, q / 4))}px sans-serif`;
          ctx.fillText(`${Math.round(load * 100)}%`, sx * q + 3, sy * q + Math.max(10, Math.min(14, q / 3)));
        }
      }
    }
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let k = 1; k < overlay.n; k++) {
      ctx.beginPath();
      ctx.moveTo(k * q + 0.5, 0);
      ctx.lineTo(k * q + 0.5, W);
      ctx.moveTo(0, k * q + 0.5);
      ctx.lineTo(W, k * q + 0.5);
      ctx.stroke();
    }
  }
  // pieces: the route in amber, the hovered and picked piece bright
  for (const inst of m.insts) {
    const on = inst.id === hover || inst.id === pick;
    if (!on && !inst.main) continue;
    ctx.strokeStyle = inst.id === pick ? "#3ddc84" : inst.id === hover ? "#ffffff" : "rgba(255,170,40,0.7)";
    ctx.lineWidth = on ? 2 : 1;
    ctx.strokeRect(inst.x * S + 0.5, inst.y * S + 0.5, inst.w * S - 1, inst.h * S - 1);
  }
  // THE LEVEL'S DOOR — the way in and out — red and outlined, as it is in the
  // game and on the hub map (Josh, Sep 2026: "a clear outline entrance and
  // exit door marker in red").
  for (const d of m.doors) {
    ctx.fillStyle = "#ff3a3a";
    ctx.fillRect(d.x * S - S, d.y * S - S, S * 3, S * 3);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(d.x * S - S * 2, d.y * S - S * 2, S * 5, S * 5);
  }
  for (let i = 0; i < m.size * m.size && m.level !== 1 && m.level !== 4; i++) {
    if (m.deco[i] >> 4 === 12) {
      ctx.fillStyle = "#ff3a3a";
      ctx.fillRect((i % m.size) * S - S, ((i / m.size) | 0) * S - S, S * 3, S * 3);
    }
  }
  return (px, py) => {
    const r = canvas.getBoundingClientRect();
    const gx = Math.floor(((px - r.left) / r.width) * m.size);
    const gy = Math.floor(((py - r.top) / r.height) * m.size);
    // the smallest piece under the pointer (a room over the gallery it hangs on)
    let best = -1;
    let area = Infinity;
    for (const inst of m.insts) {
      if (gx < inst.x || gy < inst.y || gx >= inst.x + inst.w || gy >= inst.y + inst.h) continue;
      if (inst.w * inst.h < area) {
        area = inst.w * inst.h;
        best = inst.id;
      }
    }
    return best;
  };
}
