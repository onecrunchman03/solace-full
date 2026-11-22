// First-person movement — pointer lock + WASD, with grid collision against
// the streamed world. Positions are in CELL units to match the server; the
// camera converts to meters. Client-side collision mirrors the server's
// wall rules, so corrections only fire on real desync (or real cheating).

import { brSettings } from "./settings.svelte";

/** The slice of the world the controller actually reads — structural, so the
 *  backrooms' streamed WorldIndex and the casino's one-room hall both satisfy
 *  it without either importing the other. (Type-only: erased at build, so
 *  importing the controller never drags a world module into a chunk.) */
export interface ControllerWorld {
  mapSize: number;
  effStepsAt(x: number, y: number): number;
  wallWAt(x: number, y: number): boolean;
  wallNAt(x: number, y: number): boolean;
  solidAt(x: number, y: number): boolean;
  /** A cell's own floor (steps), not the waterline — the diver's rule. */
  floorStepsAt?(x: number, y: number): number;
  /** A cell whose roof is lower than a standing body (the Cave System's
   *  crawlspaces): you go in crouched, or not at all. */
  lowAt?(x: number, y: number): boolean;
  propsNear(x: number, y: number): { x: number; y: number; rx: number; ry: number }[];
}

export const WALK_SPEED = 2.05; // cells/s (~4.1 m/s)
export const SPRINT_SPEED = 2.85; // cells/s (~5.7 m/s)
const RADIUS = 0.22; // player radius in cells (matches the server constant)
/** How far DOWN a walking player may pitch, in radians (~70°). Enough to read
 *  the carpet at your feet and peer into a pit; short of the angle where the
 *  lens meets your own collar. Looking UP keeps the full 1.45, and the admin
 *  flycam ignores this entirely. Exported so landing from a flight can clamp
 *  a steeper flycam pitch back into the walking range. */
export const PITCH_DOWN_MAX = 1.22;

export interface PlayerState {
  x: number; // cells
  y: number; // cells
  yaw: number; // radians, 0 = facing -z (north)
  pitch: number;
  moving: boolean;
  /** ADMIN FLYCAM altitude, in METRES (absolute eye height). Only meaningful
   *  while flying; on landing the camera goes back to riding the floor. */
  alt: number;
}

/** Flight speed bounds in cells/s, and how fast one wheel notch moves through
 *  them. Geometric steps, so it's fine-grained when you're inspecting a desk
 *  and gets you across a 362-cell sector without a hundred scrolls. */
export const FLY_MIN = 0.6;
export const FLY_MAX = 60;
const FLY_NOTCH = 1.22;

export function createController(state: PlayerState, world: ControllerWorld): {
  keys: Set<string>;
  /** Live movement modifiers — crouch scales speed down, an empty stamina
   *  bar revokes sprint, and `climb` is how many steps up you may take right
   *  now (1 walking, 2 while airborne — the mantle). All owned by the game
   *  screen, which is the only thing that knows whether you're in the air. */
  mods: { scale: number; allowSprint: boolean; climb: number; bodyFloor: number; tall: boolean };
  /** ADMIN FLYCAM. Purely a local movement mode: the SERVER decides whether
   *  this player is allowed to noclip (it re-checks the admin flag), and it
   *  will snap a non-admin straight back with correction frames. */
  fly: { on: boolean; speed: number };
  /** One wheel notch of flight speed. Returns the new speed for the HUD. */
  nudgeFlySpeed(dir: number): number;
  onMouse(dx: number, dy: number): void;
  tick(dt: number): void;
} {
  const keys = new Set<string>();
  const mods = { scale: 1, allowSprint: true, climb: 1, bodyFloor: Number.NEGATIVE_INFINITY, tall: true };
  const fly = { on: false, speed: 6 };

  // THE CLIMB RULE, client side. Up: one step (0.5m) is a stride you take
  // without thinking; TWO steps (1.0m) is a MANTLE and needs a jump — the game
  // screen raises mods.climb while you're airborne (Josh: "crouch jump on top
  // of something if the height is high enough"). Three steps is a cliff, always.
  // Down is always allowed: walking off a ledge is how you fall, and the server
  // prices the landing.
  //
  // The server permits up to two either way (heightPassable), so a mantle never
  // fights a correction frame — being airborne is the client's business.
  // EFFECTIVE floors (Poolrooms v3): a swimmer floats at the water surface,
  // so deep water counts as the waterline — you can swim off a quay and
  // climb back out anywhere the quay is a step above the surface. Matches
  // the server's effAt and worldgen's eff array (the climb-rule triple).
  function tooHigh(fromX: number, fromY: number, toX: number, toY: number): boolean {
    // A CRAWLSPACE (the Cave System): its roof is lower than you are, so
    // standing (mods.tall) you can't step in — crouch first. Once inside, the
    // game keeps you crouched until you're out.
    if (mods.tall && world.lowAt?.(toX, toY) && !world.lowAt(fromX, fromY)) return true;
    // A DIVER is IN the water, not on it (Thalassophobia): a DROWNED roof (its
    // floor under the waterline) standing more than a metre over the
    // swimmer's feet is a wall to swim up and over, not something to pass
    // through. The game sets bodyFloor (metres) only while swimming there. A
    // roof out of the water is the waterline rule's, below — climbing out.
    if (mods.bodyFloor > Number.NEGATIVE_INFINITY && world.floorStepsAt) {
      const f = world.floorStepsAt(toX, toY) * 0.5;
      if (f < 0 && f > mods.bodyFloor + 1.0) return true;
    }
    return world.effStepsAt(toX, toY) - world.effStepsAt(fromX, fromY) > mods.climb;
  }
  function blockedV(edgeX: number, row: number, fromX: number): boolean {
    // Vertical boundary at x = edgeX crossing `row`: wallW of cell (edgeX,row)
    // or a solid on either side.
    if (world.wallWAt(edgeX, row) || world.solidAt(edgeX, row) || world.solidAt(edgeX - 1, row)) return true;
    const toX = fromX < edgeX ? edgeX : edgeX - 1;
    return tooHigh(fromX, row, toX, row);
  }
  function blockedH(col: number, edgeY: number, fromY: number): boolean {
    if (world.wallNAt(col, edgeY) || world.solidAt(col, edgeY) || world.solidAt(col, edgeY - 1)) return true;
    const toY = fromY < edgeY ? edgeY : edgeY - 1;
    return tooHigh(col, fromY, col, toY);
  }

  // FURNITURE (July 2026): props are solid. They collide as axis-aligned boxes,
  // resolved per axis like the walls above, so brushing a desk slides you along
  // it instead of sticking. Placement (props.ts) proves no prop can seal the
  // only route, so clamping here can never trap anyone.
  function clampPropsX(nx: number): number {
    for (const p of world.propsNear(state.x, state.y)) {
      const ex = p.rx + RADIUS;
      const ey = p.ry + RADIUS;
      if (Math.abs(state.y - p.y) >= ey) continue; // not level with it
      if (Math.abs(nx - p.x) >= ex) continue; // clear of it
      return state.x <= p.x ? p.x - ex - 1e-4 : p.x + ex + 1e-4;
    }
    return nx;
  }
  function clampPropsY(ny: number): number {
    for (const p of world.propsNear(state.x, state.y)) {
      const ex = p.rx + RADIUS;
      const ey = p.ry + RADIUS;
      if (Math.abs(state.x - p.x) >= ex) continue;
      if (Math.abs(ny - p.y) >= ey) continue;
      return state.y <= p.y ? p.y - ey - 1e-4 : p.y + ey + 1e-4;
    }
    return ny;
  }

  function moveAxisX(nx: number): number {
    const dir = Math.sign(nx - state.x);
    if (dir === 0) return nx;
    const rows = [Math.floor(state.y - RADIUS * 0.85), Math.floor(state.y + RADIUS * 0.85)];
    if (dir > 0) {
      const edge = Math.floor(state.x) + 1;
      if (nx + RADIUS > edge && rows.some((r) => blockedV(edge, r, Math.floor(state.x)))) return edge - RADIUS - 1e-4;
    } else {
      const edge = Math.floor(state.x);
      if (nx - RADIUS < edge && rows.some((r) => blockedV(edge, r, Math.floor(state.x)))) return edge + RADIUS + 1e-4;
    }
    return clampPropsX(nx);
  }

  function moveAxisY(ny: number): number {
    const dir = Math.sign(ny - state.y);
    if (dir === 0) return ny;
    const cols = [Math.floor(state.x - RADIUS * 0.85), Math.floor(state.x + RADIUS * 0.85)];
    if (dir > 0) {
      const edge = Math.floor(state.y) + 1;
      if (ny + RADIUS > edge && cols.some((c) => blockedH(c, edge, Math.floor(state.y)))) return edge - RADIUS - 1e-4;
    } else {
      const edge = Math.floor(state.y);
      if (ny - RADIUS < edge && cols.some((c) => blockedH(c, edge, Math.floor(state.y)))) return edge + RADIUS + 1e-4;
    }
    return clampPropsY(ny);
  }

  return {
    keys,
    mods,
    fly,
    nudgeFlySpeed(dir) {
      const next = dir > 0 ? fly.speed * FLY_NOTCH : fly.speed / FLY_NOTCH;
      fly.speed = Math.max(FLY_MIN, Math.min(FLY_MAX, next));
      return fly.speed;
    },
    onMouse(dx, dy) {
      state.yaw -= dx * 0.0023;
      // Looking DOWN stops at PITCH_DOWN_MAX on foot (Josh: you could tip far
      // enough to see inside your own body — the last few degrees only ever
      // showed your own collar anyway). The flycam keeps the full range: a
      // noclip ghost has no body and needs to inspect straight down.
      const down = fly.on ? 1.45 : PITCH_DOWN_MAX;
      state.pitch = Math.max(-down, Math.min(1.45, state.pitch - dy * 0.0023));
    },
    tick(dt) {
      // ADMIN FLYCAM: fly where you LOOK, straight through everything. No
      // collision, no climb rule, no gravity — the point is to inspect the
      // world, including the parts of it nobody can stand in.
      if (fly.on) {
        const K = brSettings.keys;
        let fwd = 0;
        let strafe = 0;
        let lift = 0;
        if (keys.has(K.forward) || keys.has("ArrowUp")) fwd += 1;
        if (keys.has(K.back) || keys.has("ArrowDown")) fwd -= 1;
        if (keys.has(K.left) || keys.has("ArrowLeft")) strafe -= 1;
        if (keys.has(K.right) || keys.has("ArrowRight")) strafe += 1;
        if (keys.has(K.jump)) lift += 1;
        if (keys.has(K.crouch)) lift -= 1;
        state.moving = fwd !== 0 || strafe !== 0 || lift !== 0;
        if (!state.moving) return;
        const speed = fly.speed * (keys.has(K.sprint) ? 3 : 1);
        const step = speed * dt;
        // Pitch tilts the forward vector, so looking down and holding forward
        // takes you down through the floor — the whole point of a noclip cam.
        const cosP = Math.cos(state.pitch);
        const dx = (Math.sin(state.yaw) * -fwd * cosP + Math.cos(state.yaw) * strafe) * step;
        const dy = (Math.cos(state.yaw) * -fwd * cosP - Math.sin(state.yaw) * strafe) * step;
        state.x = Math.max(0.01, Math.min(world.mapSize - 0.01, state.x + dx));
        state.y = Math.max(0.01, Math.min(world.mapSize - 0.01, state.y + dy));
        // Vertical is in METRES; horizontal is in cells (1 cell = CELL metres).
        state.alt += (lift * speed + Math.sin(state.pitch) * fwd * speed) * dt * 2;
        return;
      }
      // Movement reads the PLAYER'S bindings (pause → Controls); the arrow
      // keys stay live as a permanent alias so a broken bind never traps you.
      const K = brSettings.keys;
      let fwd = 0;
      let strafe = 0;
      if (keys.has(K.forward) || keys.has("ArrowUp")) fwd += 1;
      if (keys.has(K.back) || keys.has("ArrowDown")) fwd -= 1;
      if (keys.has(K.left) || keys.has("ArrowLeft")) strafe -= 1;
      if (keys.has(K.right) || keys.has("ArrowRight")) strafe += 1;
      state.moving = fwd !== 0 || strafe !== 0;
      if (!state.moving) return;
      const sprinting = keys.has(K.sprint) && mods.allowSprint;
      const speed = (sprinting ? SPRINT_SPEED : WALK_SPEED) * mods.scale;
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
