// SURVIVORZ EFFECTS — the bridge from the show's events to the effects (EFFECTS.md, F7).
//
// The show client hands this every server event it receives, and the world hands it the
// objects the effects act on (each door's leaf and pane, each fixture). It decides which
// effect plays, where, and from which seed — so placing the effects in a room is a matter
// of REGISTERING the room's objects, never of wiring effects into the room's own code
// (EFFECTS.md §5: the room never wires effects in itself).
//
// Two clocks: the server stamps every event with its own time (ms); the effects run on
// fx.now (seconds). `ShowFx` keeps the offset between them, so an effect that's a pure
// function of time since the event (a power cut's banks coming back, a fixture's flicker)
// is at the same place on every screen — including one that joined late and gets the
// state rather than the event.
import * as THREE from "three";
import type { Emitter, FxSystem } from "./system";
import { barricade, playDoorEvent, plankNailed, settleRattles, type DoorEvent } from "./breaking";
import { sparks, smokePuff } from "./effects";
import { pipeBurst, somethingFell, steam } from "./ambient";
import { doorwayFire, fireSpread } from "./fire";
import { mulberry32, range } from "./rng";

/** One event as the facility server sends it (src/survivorz/doors.ts FxEvent). */
export interface ShowEvent extends DoorEvent {
  /** the server's clock, ms */
  t: number;
  door?: string;
  room?: string;
  zone?: string;
  on?: boolean;
  /** the floor under it (where drops and dust land), when it isn't under `at` */
  floorY?: number;
  /** where spilled fuel runs to (fire.spread; `from` is where it runs from) */
  to?: [number, number, number];
  /** seconds: a power dip's length (zone.dip) */
  dur?: number;
  /** thing.fell: metres, how high it fell from. fire.spread: where the fuel runs from */
  from?: number | [number, number, number];
  /** how big: the thing that fell (0.5 a ceiling tile, 1.2 a duct section) */
  scale?: number;
}

/** what a show event stamps onto what it makes (fx.cause) */
export interface ShowCause {
  show: { ev: ShowEvent; now: DoorNow; before: number };
}

/** What the server says a door is NOW (the facility snapshot's doors entry). */
export interface DoorNow {
  open?: boolean;
  broken?: boolean;
  /** whole planks nailed across it */
  planks?: number;
  /** a reinforced barricade (DoorState.reinforced): iron-strapped planks */
  reinforced?: boolean;
}

/** A door as the room built it. */
export interface ShowDoor {
  /** the leaf the room draws (shaken when struck, hidden once it bursts) */
  leaf?: THREE.Object3D;
  /** a glass door's pane, when separate from the leaf */
  pane?: THREE.Object3D;
  /** where planks are hung (the room's door group; the scene if not given) */
  parent?: THREE.Object3D;
  /** the door's place, from the event or the map (doorPlacement) */
  at: [number, number, number];
  normal: [number, number, number];
  size: [number, number];
  material?: "wood" | "metal" | "glass";
  /** which side planks go on: the side the survivors hold (+1 = room b's) */
  holdSide?: 1 | -1;
  floorY?: number;
}

interface DoorRec extends ShowDoor {
  planks: THREE.Object3D[];
  group: THREE.Group | null;
  seed: number;
  reinforced?: boolean;
}

/** A stable seed from a door's id, so its planks lie the same for every observer. */
export function idSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

export class ShowFx {
  private doors = new Map<string, DoorRec>();
  /** fx.now − server seconds */
  private offset = 0;

  constructor(readonly fx: FxSystem, serverNowMs = 0) {
    this.sync(serverNowMs);
  }

  /** Line the effects' clock up with the server's (at load, and whenever the client resyncs). */
  sync(serverNowMs: number): void {
    this.offset = this.fx.now - serverNowMs / 1000;
  }

  /** The effects' time of a server timestamp. */
  at(serverMs: number): number {
    return serverMs / 1000 + this.offset;
  }

  /** The room has built a door: register it, and give it the planks the server says it has. */
  registerDoor(id: string, d: ShowDoor, now: DoorNow = {}): void {
    // the room rebuilt it (a reload, a reset): the old one's planks go first
    const old = this.doors.get(id);
    if (old) drop(old);
    const rec: DoorRec = { ...d, planks: [], group: null, seed: idSeed(id) };
    this.doors.set(id, rec);
    this.apply(id, now);
  }

  forgetDoor(id: string): void {
    const d = this.doors.get(id);
    if (d) drop(d);
    this.doors.delete(id);
  }

  /** Make a door look like the server's state with no event (a late joiner; a resync). */
  apply(id: string, now: DoorNow): void {
    const d = this.doors.get(id);
    if (!d) return;
    // (whole again — a reset's snapshot, or a resync after a rebuild — shows the leaf the burst hid:
    // without this a door broken once stayed invisible after the show restarted from day 1)
    if (now.broken !== undefined) {
      if (d.leaf) d.leaf.visible = !now.broken;
      if (d.pane) d.pane.visible = !now.broken;
    }
    if (now.reinforced !== undefined) d.reinforced = now.reinforced;
    this.nail(d, now.broken ? 0 : now.planks ?? 0);
  }

  /** the planks on a door to exactly `n` (they're the same planks every time: the door's seed) */
  private nail(d: DoorRec, n: number): void {
    // (the same count isn't enough to keep what's there: reinforcing a door re-nails it strapped)
    const strapped = d.planks.some((p) => p.userData.reinforced);
    if (n === d.planks.filter((p) => p.visible).length && d.group && strapped === !!d.reinforced) return;
    drop(d);
    if (n <= 0 || !this.fx.breaking) return;
    d.group = barricade(this.fx.breaking, { at: new THREE.Vector3(...d.at), normal: new THREE.Vector3(...d.normal), size: d.size, side: d.holdSide ?? 1, floorY: d.floorY, reinforced: d.reinforced }, n, d.seed);
    (d.parent ?? this.fx.opts.scene).add(d.group);
    d.group.updateMatrixWorld(true);
    d.planks = [...d.group.children];
  }

  /** One server event. `now` is the door's state after it, when the event is a door's. */
  event(ev: ShowEvent, now: DoorNow = {}): void {
    // what this event makes carries it as its CAUSE (wreckage is written down with the event
    // that made it, and the door as it was just before, so a restart can make it again)
    const d = ev.door ? this.doors.get(ev.door) : undefined;
    this.fx.cause = { show: { ev: { ...ev }, now: { ...now }, before: d ? d.planks.filter((p) => p.visible).length : 0 } } satisfies ShowCause;
    try {
      this.handle(ev, now);
    } finally {
      this.fx.cause = undefined;
    }
  }

  /** Make an event's wreckage again where it lay (a restart: the ledger's row). The door is
   *  set as it was just before, the event run QUIET (no dust, no sparks, no shaking: it broke
   *  an hour ago), and its pieces laid at their poses and kept. False if it made nothing. */
  restoreWreck(cause: ShowCause["show"], poses: ({ pos: THREE.Vector3; quat: THREE.Quaternion } | null)[]): boolean {
    const d = cause.ev.door ? this.doors.get(cause.ev.door) : undefined;
    if (d) this.nail(d, cause.before);
    const fx = this.fx, before = fx.breaks.newest;
    fx.quiet = true;
    try {
      this.handle(cause.ev, cause.now);
    } finally {
      fx.quiet = false;
      settleRattles();
    }
    const made = fx.breaks.newest;
    if (!made || made === before) return false;
    made.restAt(poses);
    fx.breaks.keep(made);
    return true;
  }

  private handle(ev: ShowEvent, now: DoorNow): void {
    const fx = this.fx;
    const d = ev.door ? this.doors.get(ev.door) : undefined;
    // (the door's state after the event says whether its barricade is reinforced)
    if (d && now.reinforced !== undefined) d.reinforced = now.reinforced;
    switch (ev.event) {
      case "door.hit":
      case "door.banged":
      case "door.broken": {
        const parts = d ? { leaf: d.leaf, pane: d.pane, planks: d.planks.filter((p) => p.visible), planksLeft: now.planks, floorY: d.floorY } : {};
        playDoorEvent(fx, withPlace(ev, d), parts);
        // the planks that broke are gone: what stays is the server's count
        if (d) d.planks = d.planks.filter((p) => p.visible);
        break;
      }
      case "door.barricade": {
        if (!d) break;
        this.nail(d, now.planks ?? d.planks.length + 1);
        const pl = d.planks[d.planks.length - 1];
        if (pl) fx.play(plankNailed, { plank: pl, floorY: d.floorY ?? d.at[1] - d.size[1] / 2 }, ev.seed);
        break;
      }
      case "door.unbarricade": {
        if (!d) break;
        const pl = d.planks[d.planks.length - 1];
        if (pl) fx.play(plankNailed, { plank: pl, floorY: d.floorY ?? d.at[1] - d.size[1] / 2 }, ev.seed);
        this.nail(d, now.planks ?? d.planks.length - 1);
        break;
      }
      case "door.pried": {
        // a crowbar levering a grate: sparks where the bar bites, rust off the bars
        const p = withPlace(ev, d);
        if (!p.at || !p.normal || !p.size) break;
        const n = new THREE.Vector3(...p.normal).multiplyScalar(-(ev.side ?? 1));
        const rng = mulberry32(ev.seed);
        const at = new THREE.Vector3(...p.at).add(new THREE.Vector3(range(rng, -0.3, 0.3) * p.size[0], range(rng, -0.3, 0.3) * p.size[1], 0)).addScaledVector(n, 0.03);
        fx.play(sparks, { pos: at, normal: n, count: 14, floorY: d?.floorY ?? p.at[1] - p.size[1] / 2 }, ev.seed);
        break;
      }
      case "vault.open": {
        // the vault's seals let go: steam jets round its rim, dust shaken off it
        const p = withPlace(ev, d);
        if (!p.at || !p.normal || !p.size) break;
        const c = new THREE.Vector3(...p.at), n = new THREE.Vector3(...p.normal);
        const u = new THREE.Vector3(0, 1, 0).cross(n).normalize();
        const [w, h] = p.size;
        const rng = mulberry32(ev.seed);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + range(rng, -0.2, 0.2);
          const rim = c.clone().addScaledVector(u, Math.cos(a) * w * 0.48).add(new THREE.Vector3(0, Math.sin(a) * h * 0.48, 0));
          for (const s of [-1, 1]) {
            const dir = n.clone().multiplyScalar(s).addScaledVector(rim.clone().sub(c).normalize(), 0.5).normalize();
            fx.emit(forSecs(steam({ pos: rim.clone().addScaledVector(n, s * 0.1), dir, force: 1.4, bursts: false }), range(rng, 1.5, 3)), (ev.seed + i * 2 + (s > 0 ? 1 : 0)) >>> 0);
          }
        }
        fx.play(smokePuff, { pos: c.clone().setY(c.y + h * 0.5), dir: n, size: 1.4, shade: 0.85 }, ev.seed ^ 0x9e37);
        break;
      }
      case "room.unsealed": {
        // a sealed room opened for a newcomer: the dust of a room shut a long time
        const p = withPlace(ev, d);
        if (!p.at || !p.normal || !p.size) break;
        playDoorEvent(fx, { ...withPlace(ev, d), event: "door.hit", material: "wood" }, { floorY: d?.floorY });
        break;
      }
      case "zone.powered":
        if (ev.zone) fx.fixtures.setPower(ev.zone, ev.on !== false, this.at(ev.t), ev.seed);
        break;
      // THE DIRECTOR'S TOOLS (SURVIVORZ.md: a pipe bursts, something falls, a power dip)
      case "zone.dip":
        // a brownout: the zone's lights sag and stutter and come back; the power never goes
        if (ev.zone) fx.fixtures.setDip(ev.zone, this.at(ev.t), ev.dur ?? 1.6, ev.seed);
        break;
      case "pipe.burst": {
        // at: the split; normal: the way it faces
        if (!ev.at || !ev.normal) break;
        fx.emit(pipeBurst({ pos: new THREE.Vector3(...ev.at), dir: new THREE.Vector3(...ev.normal), floorY: ev.floorY }), ev.seed);
        break;
      }
      case "thing.fell": {
        // at: where it lands, on the floor
        if (!ev.at) break;
        fx.play(somethingFell, { pos: new THREE.Vector3(...ev.at), from: typeof ev.from === "number" ? ev.from : undefined, size: ev.scale, floorY: ev.floorY ?? ev.at[1] }, ev.seed);
        break;
      }
      // FIRE (the server decides where it spreads along spilled fuel)
      case "fire.spread": {
        if (!Array.isArray(ev.from) || !ev.to) break;
        fx.emit(fireSpread({ from: new THREE.Vector3(...ev.from), to: new THREE.Vector3(...ev.to), floorY: ev.floorY ?? ev.to[1] }), ev.seed);
        break;
      }
      case "fire.door": {
        // the door's own placement: fire across its opening, jamb to jamb
        const p = withPlace(ev, d);
        if (!p.at || !p.normal || !p.size) break;
        const n = new THREE.Vector3(...p.normal);
        const floorY = ev.floorY ?? d?.floorY ?? p.at[1] - p.size[1] / 2;
        fx.emit(doorwayFire({
          pos: new THREE.Vector3(p.at[0], floorY, p.at[2]), along: new THREE.Vector3(0, 1, 0).cross(n).normalize(), normal: n,
          width: p.size[0], height: p.size[1], floorY,
        }), ev.seed);
        break;
      }
      case "vault.shut": {
        // the vault shutting for good: the seals hiss as they take, its frame shakes the dust
        // off itself, and the floor under it feels it
        const p = withPlace(ev, d);
        if (!p.at || !p.normal || !p.size) break;
        const c = new THREE.Vector3(...p.at), n = new THREE.Vector3(...p.normal);
        const u = new THREE.Vector3(0, 1, 0).cross(n).normalize();
        const [w, h] = p.size;
        const rng = mulberry32(ev.seed);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + range(rng, -0.2, 0.2);
          const rim = c.clone().addScaledVector(u, Math.cos(a) * w * 0.5).add(new THREE.Vector3(0, Math.sin(a) * h * 0.5, 0));
          const out = rim.clone().sub(c).normalize().addScaledVector(n, 0.6).normalize();
          fx.emit(forSecs(steam({ pos: rim.clone().addScaledVector(n, 0.08), dir: out, force: 0.9, bursts: false }), range(rng, 0.5, 0.9)), (ev.seed + i * 3) >>> 0);
        }
        const floorY = ev.floorY ?? c.y - h / 2;
        fx.play(somethingFell, { pos: c.clone().addScaledVector(n, 0.5).setY(floorY), from: c.y + h / 2, size: 1.3, floorY }, ev.seed ^ 0x51ed);
        fx.shake(c, 0.6, 9, 0.7, ev.seed);
        break;
      }
    }
  }

  /** The facility's power as the snapshot has it, with no event (a late joiner sees the
   *  lights already on, not the bank-by-bank return that happened before they came). */
  power(zone: string, on: boolean): void {
    this.fx.fixtures.setPower(zone, on, -1e6, 0);
  }

  /** Planks in the world now, for the checks. */
  planksOn(id: string): number {
    return this.doors.get(id)?.planks.filter((p) => p.visible).length ?? 0;
  }
}

/** take a door's planks down for good: out of the world, and their geometry freed (each
 *  plank's is its own; dropping them unfreed on every re-barricade leaked for weeks) */
function drop(d: DoorRec): void {
  if (d.group) {
    d.group.parent?.remove(d.group);
    d.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
  d.group = null;
  d.planks = [];
}

/** an emitter that stops after `secs` */
function forSecs(e: Emitter, secs: number): Emitter {
  let t = 0;
  return (ctx, dt) => (t += dt) < secs && e(ctx, dt);
}

/** an event's door placement, from the event or (failing that) the registered door */
function withPlace(ev: ShowEvent, d?: ShowDoor): DoorEvent {
  return {
    event: ev.event, seed: ev.seed, side: ev.side, lastHp: ev.lastHp,
    at: ev.at ?? d?.at, normal: ev.normal ?? d?.normal, size: ev.size ?? d?.size, material: ev.material ?? d?.material,
  };
}
