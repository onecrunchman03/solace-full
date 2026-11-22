// First-person movement — pointer lock + WASD, with grid collision against
// the streamed world. Positions are in CELL units to match the server; the
// camera converts to meters. Client-side collision mirrors the server's
// wall rules, so corrections only fire on real desync (or real cheating).

import { WorldIndex } from "./world";

export const WALK_SPEED = 2.05; // cells/s (~4.1 m/s)
export const SPRINT_SPEED = 2.85; // cells/s (~5.7 m/s)
const RADIUS = 0.22; // player radius in cells (matches the server constant)

export interface PlayerState {
  x: number; // cells
  y: number; // cells
  yaw: number; // radians, 0 = facing -z (north)
  pitch: number;
  moving: boolean;
}

export function createController(state: PlayerState, world: WorldIndex): {
  keys: Set<string>;
  onMouse(dx: number, dy: number): void;
  tick(dt: number): void;
} {
  const keys = new Set<string>();

  function blockedV(edgeX: number, row: number): boolean {
    // Vertical boundary at x = edgeX crossing `row`: wallW of cell (edgeX,row)
    // or a solid on either side.
    return world.wallWAt(edgeX, row) || world.solidAt(edgeX, row) || world.solidAt(edgeX - 1, row);
  }
  function blockedH(col: number, edgeY: number): boolean {
    return world.wallNAt(col, edgeY) || world.solidAt(col, edgeY) || world.solidAt(col, edgeY - 1);
  }

  function moveAxisX(nx: number): number {
    const dir = Math.sign(nx - state.x);
    if (dir === 0) return nx;
    const rows = [Math.floor(state.y - RADIUS * 0.85), Math.floor(state.y + RADIUS * 0.85)];
    if (dir > 0) {
      const edge = Math.floor(state.x) + 1;
      if (nx + RADIUS > edge && rows.some((r) => blockedV(edge, r))) return edge - RADIUS - 1e-4;
    } else {
      const edge = Math.floor(state.x);
      if (nx - RADIUS < edge && rows.some((r) => blockedV(edge, r))) return edge + RADIUS + 1e-4;
    }
    return nx;
  }

  function moveAxisY(ny: number): number {
    const dir = Math.sign(ny - state.y);
    if (dir === 0) return ny;
    const cols = [Math.floor(state.x - RADIUS * 0.85), Math.floor(state.x + RADIUS * 0.85)];
    if (dir > 0) {
      const edge = Math.floor(state.y) + 1;
      if (ny + RADIUS > edge && cols.some((c) => blockedH(c, edge))) return edge - RADIUS - 1e-4;
    } else {
      const edge = Math.floor(state.y);
      if (ny - RADIUS < edge && cols.some((c) => blockedH(c, edge))) return edge + RADIUS + 1e-4;
    }
    return ny;
  }

  return {
    keys,
    onMouse(dx, dy) {
      state.yaw -= dx * 0.0023;
      state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch - dy * 0.0023));
    },
    tick(dt) {
      let fwd = 0;
      let strafe = 0;
      if (keys.has("KeyW") || keys.has("ArrowUp")) fwd += 1;
      if (keys.has("KeyS") || keys.has("ArrowDown")) fwd -= 1;
      if (keys.has("KeyA") || keys.has("ArrowLeft")) strafe -= 1;
      if (keys.has("KeyD") || keys.has("ArrowRight")) strafe += 1;
      state.moving = fwd !== 0 || strafe !== 0;
      if (!state.moving) return;
      const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? SPRINT_SPEED : WALK_SPEED;
      const len = Math.hypot(fwd, strafe) || 1;
      const step = (speed * dt) / len;
      // yaw 0 faces -z (north = -y in cell space).
      const dx = (Math.sin(state.yaw) * -fwd + Math.cos(state.yaw) * strafe) * step;
      const dy = (Math.cos(state.yaw) * -fwd - Math.sin(state.yaw) * strafe) * step;
      state.x = moveAxisX(state.x + dx);
      state.y = moveAxisY(state.y + dy);
    },
  };
}
