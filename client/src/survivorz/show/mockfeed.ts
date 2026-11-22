// SOLACE SURVIVORZ — THE SHOW: a MOCK FEED, so the screen can be built and checked without the
// simulation. It makes frames of the wire's own shapes (src/survivorz/sim/wire.ts) — a snapshot,
// 10 Hz ticks of the bodies that moved, spawns, events — from a toy world on the real map:
//   · the six survivors walk room to room on floor 0 by the map's doors (stopping at a door to
//     open it, and the door swings), search, eat, idle, talk, crouch;
//   · zombies wander their rooms (one in the Generator Hall on floor 1), notice a survivor in the
//     same room, chase, attack; the survivors swing back or shoot; zombies die and come back;
//   · one zombie bangs on the barricaded Bunk Room B door until it breaks, then it's nailed up again;
//   · now and then a power dip in a survivor's zone, something falling, a pipe bursting below;
//   · the panel's power switches are this feed's zone.powered events.
// None of this is the game. It exists to exercise every path the screen has.
import type { BodyState, DoorWire, Ev, Pose, ServerFrame, SurvivorId, SurvivorVitals, TickBody, ZombieKind } from "../../../../src/survivorz/sim/wire";
import { BODY_OF } from "./overlay";
import { DOORS, FLOOR_Y, ROOMS, neighbours, placeOf, roomInfo, type RoomInfo, type SiteZone, type V3 } from "./site";

const TICK_MS = 100;
const WALK = 1.4, JOG = 3.1, Z_WANDER = 0.55, Z_CHASE = 2.4;
/** where the survivors may walk: floor 0's zones (the stairs and lifts are the sim's business) */
const OPEN_ZONES = new Set<SiteZone>(["bunker"]);
const PASSABLE = new Set(["doorway", "door", "keycard", "power", "safe"]);
const SWING_DOORS = new Set(["door", "keycard", "power", "safe"]);

interface Leg { to: V3; door?: string; pause?: number }
interface MBody {
  s: BodyState;
  legs: Leg[];
  speed: number;
  busyUntil: number;
  act: Pose;
  /** the last state sent (to send only what changed) */
  sent: { p: V3; h: number; pose: Pose; held: string | null; hp: number; torch: boolean };
  // zombies
  home?: string;
  target?: string | null;
  nextHit?: number;
  nextGroan?: number;
  deadUntil?: number;
  banger?: boolean;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export class MockFeed {
  onFrame: (f: ServerFrame) => void = () => {};
  private bodies = new Map<string, MBody>();
  private doors = new Map<string, DoorWire>();
  private power: Record<string, boolean> = { lobby: false, residential: false, labs: false, medical: false, security: false, power: true, containment: false, deep: false };
  private timer: ReturnType<typeof setInterval> | null = null;
  private seed = 0x5eed;
  private nextDip = 0;
  private nextFell = 0;
  private nextBang = 0;
  private zn = 0;
  private lastVitals = 0;
  running = false;

  private rand(): number {
    // mulberry32: the same toy world each run
    let t = (this.seed = (this.seed + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  private range(a: number, b: number): number { return a + (b - a) * this.rand(); }
  private pick<T>(xs: T[]): T { return xs[Math.floor(this.rand() * xs.length) % xs.length]; }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.build();
    this.onFrame(this.snapshot());
    this.timer = setInterval(() => this.step(), TICK_MS);
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** the panel's switch: the power to a zone, as the sim would send it */
  setPower(zone: SiteZone, on: boolean): void {
    this.power[zone] = on;
    this.ev("zone.powered", { zone, on });
  }
  /** a brownout now, in the zone of the first survivor (the director's tool) */
  dip(): void {
    const s = [...this.bodies.values()].find((b) => b.s.kind === "survivor");
    const zone = s ? roomInfo(s.s.room)?.zone : "lobby";
    this.ev("zone.dip", { zone, ms: 2500, at: s?.s.pos });
  }

  // ---- the toy world ----

  private build(): void {
    this.bodies.clear();
    this.doors.clear();
    const now = Date.now();
    for (const d of DOORS) this.doors.set(d.id, { id: d.id, open: d.kind === "doorway", locked: false, broken: false, planks: d.id === "res-bunks-b" ? 3 : 0, reinforced: false, health: 100 });
    const cast: [SurvivorId, string | null, boolean][] = [["johanna", "flashlight", true], ["dale", "crowbar", false], ["ben", "hk416", false], ["rick", "pistol", false], ["sarah", "lead-pipe", false], ["rollo", "claw-hammer", true]];
    // they start spread over the first week's rooms, each on their own clock (a pack walking in step
    // isn't a show, and it hides every body behind the next)
    const starts = ["reception", "security-desk", "vault-chamber", "res-corridor", "canteen", "decon-entry"];
    cast.forEach(([who, held, torch], i) => {
      const r = roomInfo(starts[i])!;
      this.add({
        id: `s:${who}`, kind: "survivor", who, body: BODY_OF[who], pos: this.pointIn(r, 2), heading: this.range(-3, 3), pose: "idle", room: r.id, held, torch, hp: 100, hpMax: 100,
        vitals: { stamina: 1, hunger: 0.2, thirst: 0.2, tired: 0.1, morale: 70, infected: false, bleeding: 0, job: "explore" }, why: "explore",
      }, now + 1500 + i * 3500);
    });
    const zHomes: [string, ZombieKind, string][] = [
      ["reception", "shambler", "zombie-m02"], ["res-corridor", "shambler", "zombie-m01"], ["canteen", "shambler", "zombie-f02"], ["labs-corridor", "runner", "zombie-m05"], ["med-hall", "shambler", "zombie-f04"],
      ["sec-corridor", "crawler", "zombie-m07"], ["generator-hall", "shambler", "zombie-f08"], ["glass-offices", "shambler", "zombie-m10"], ["ward", "experiment", "zombie-f01"],
    ];
    for (const [room, zk, body] of zHomes) this.addZombie(room, zk, body);
    // the banger, at Bunk Room B's door on the corridor's side
    const pl = placeOf("res-bunks-b")!;
    const at: V3 = [pl.centre[0] - pl.normal[0] * 0.75, 0, pl.centre[2] - pl.normal[2] * 0.75];
    const b = this.addZombie("res-corridor", "shambler", "zombie-m04", at);
    b.banger = true;
    b.s.heading = Math.atan2(pl.normal[0], pl.normal[2]);
    b.s.pose = "z-bang";
    this.nextDip = now + 20_000;
    this.nextFell = now + 30_000;
    this.nextBang = now + 4000;
  }

  private add(s: BodyState, busyUntil: number): MBody {
    const b: MBody = { s, legs: [], speed: 0, busyUntil, act: s.pose, sent: { p: [...s.pos], h: s.heading, pose: s.pose, held: s.held ?? null, hp: s.hp, torch: !!s.torch } };
    this.bodies.set(s.id, b);
    return b;
  }

  private addZombie(room: string, zkind: ZombieKind, body: string, at?: V3): MBody {
    const r = roomInfo(room)!;
    const p = at ?? this.pointIn(r);
    const id = `z:${++this.zn}`;
    const b = this.add({ id, kind: "zombie", zkind, body, pos: p, heading: this.range(-3, 3), pose: zkind === "crawler" ? "z-crawl" : "z-idle", room, hp: 100, hpMax: 100 }, 0);
    b.home = room;
    b.nextGroan = Date.now() + this.range(3000, 12000);
    return b;
  }

  private pointIn(r: RoomInfo, inset = 1.2): V3 {
    return [r2(this.range(r.x0 + inset, r.x1 - inset)), FLOOR_Y[r.floor] ?? 0, r2(this.range(r.z0 + inset, r.z1 - inset))];
  }

  /** a route by the map's doors (floor 0, the walkable kinds), as legs through each doorway */
  private route(from: string, to: string): Leg[] | null {
    const prev = new Map<string, { room: string; door: string } | null>([[from, null]]);
    const q = [from];
    while (q.length) {
      const cur = q.shift()!;
      if (cur === to) break;
      for (const nb of neighbours(cur)) {
        if (prev.has(nb)) continue;
        const ri = roomInfo(nb);
        if (!ri || !OPEN_ZONES.has(ri.zone) || ri.floor !== 0 || (ri.room.spans ?? 1) > 1 || ri.room.kind === "sealed" || ri.room.kind === "exit") continue;
        const d = DOORS.find((x) => PASSABLE.has(x.kind) && ((x.a === cur && x.b === nb) || (x.b === cur && x.a === nb)));
        if (!d) continue;
        prev.set(nb, { room: cur, door: d.id });
        q.push(nb);
      }
    }
    if (!prev.has(to)) return null;
    const hops: { room: string; door: string }[] = [];
    for (let c = to; prev.get(c); c = prev.get(c)!.room) hops.unshift({ room: c, door: prev.get(c)!.door });
    const legs: Leg[] = [];
    let at = from;
    for (const h of hops) {
      const pl = placeOf(h.door)!;
      const d = DOORS.find((x) => x.id === h.door)!;
      const s = d.a === at ? 1 : -1;   // the normal points a → b
      const y = FLOOR_Y[roomInfo(at)!.floor] ?? 0;
      const before: V3 = [pl.centre[0] - pl.normal[0] * 0.7 * s, y, pl.centre[2] - pl.normal[2] * 0.7 * s];
      const after: V3 = [pl.centre[0] + pl.normal[0] * 0.8 * s, y, pl.centre[2] + pl.normal[2] * 0.8 * s];
      legs.push({ to: before, door: SWING_DOORS.has(d.kind) ? h.door : undefined, pause: SWING_DOORS.has(d.kind) ? 1.4 : 0 });
      legs.push({ to: after });
      at = h.room;
    }
    legs.push({ to: this.pointIn(roomInfo(to)!, 2) });
    return legs;
  }

  // ---- one tick ----

  private step(): void {
    const now = Date.now(), dt = TICK_MS / 1000;
    for (const b of this.bodies.values()) {
      if (b.s.kind === "survivor") this.survivor(b, now, dt);
      else this.zombie(b, now, dt);
    }
    this.director(now);
    this.onFrame(this.tick(now));
  }

  private survivor(b: MBody, now: number, dt: number): void {
    const s = b.s;
    if (s.pose === "dead") return;
    // a zombie close: fight it (or shoot it), whatever the plan was
    const z = this.nearestZombie(s, 9);
    if (z && b.act !== "down") {
      const d = dist(s.pos, z.s.pos);
      s.heading = Math.atan2(z.s.pos[0] - s.pos[0], z.s.pos[2] - s.pos[2]);
      b.legs = [];
      if (s.held === "pistol" || s.held === "hk416") {
        s.pose = "aim";
        if (now >= (b.busyUntil || 0)) {
          b.busyUntil = now + (s.held === "pistol" ? 650 : 380);
          const hit = this.rand() < 0.55, head = hit && this.rand() < 0.3;
          this.ev(s.held === "pistol" ? "gun.pistol" : "gun.rifle", { by: s.id, ...(hit ? { victim: z.s.id, part: head ? "head" : "torso" } : {}), at: s.pos, to: z.s.pos });
          if (hit) this.hurtZombie(z, head ? 100 : 35, s.id, head ? "head" : "torso");
        }
      } else if (d < 1.7) {
        s.pose = "fight";
        if (now >= (b.busyUntil || 0)) {
          b.busyUntil = now + this.range(900, 1400);
          const heavy = s.held === "crowbar" && this.rand() < 0.3;
          this.ev(heavy ? "melee.swing.heavy" : "melee.swing.light", { by: s.id, weapon: s.held ?? "fists", at: s.pos });
          if (this.rand() < 0.7) {
            const head = this.rand() < 0.25;
            setTimeout(() => {
              if (!this.running || z.s.pose === "z-dead") return;
              this.ev(head ? "melee.hit.head" : "melee.hit", { by: s.id, victim: z.s.id, weapon: s.held ?? "fists", part: head ? "head" : "torso", at: z.s.pos });
              this.hurtZombie(z, head ? 60 : 30, s.id, head ? "head" : "torso");
            }, 320);
          }
        }
      } else {
        // close in to swing
        s.pose = "jog";
        this.moveToward(s, z.s.pos, JOG * 0.8, dt, 1.3);
      }
      s.why = "fight";
      return;
    }
    if (b.act === "down") {
      // on the floor a while, crawling a little, then up again
      s.pose = "down";
      if (now >= b.busyUntil) { b.act = "idle"; s.pose = "idle"; s.hp = 40; s.why = "rest"; }
      return;
    }
    if (now < b.busyUntil) return;
    if (b.legs.length) {
      const leg = b.legs[0];
      const arrived = this.moveToward(s, leg.to, b.speed, dt, 0.12);
      s.pose = b.speed > 2 ? "jog" : "walk";
      if (s.vitals) s.vitals.stamina = Math.max(0, s.vitals.stamina - (b.speed > 2 ? 0.004 : 0.0005));
      if (arrived) {
        b.legs.shift();
        if (leg.door) {
          const d = this.doors.get(leg.door)!;
          if (!d.open && !d.broken) {
            // stop, open it, go through (and it swings shut behind them a few seconds later)
            s.pose = "interact";
            b.busyUntil = now + (leg.pause ?? 1.2) * 1000;
            d.open = true;
            this.ev("door.open", { door: leg.door, by: s.id, state: { ...d } });
            const id = leg.door;
            setTimeout(() => {
              const dd = this.doors.get(id);
              if (!this.running || !dd || !dd.open) return;
              dd.open = false;
              this.ev("door.close", { door: id, state: { ...dd } });
            }, 7000);
          }
        }
      }
      return;
    }
    // arrived somewhere: do a thing, then pick the next room
    // (no "sit": the toy world doesn't know where the chairs are, and a body sitting on air is the
    // animation law broken on camera — the sim sits people on real seats)
    const acts: [Pose, number, string?][] = [["search", 6, "box.open"], ["idle", 4], ["talk", 5], ["crouch", 4], ["eat", 5, "eat.can"]];
    if (b.act === "walk" || b.act === "jog") {
      const [pose, secs, ev] = this.pick(acts);
      s.pose = pose;
      b.act = s.pose;
      b.busyUntil = now + secs * 1000 * this.range(0.8, 1.4);
      s.why = pose === "search" ? "loot" : pose === "eat" ? "eat" : "rest";
      if (ev) this.ev(ev, { by: s.id, at: s.pos });
      return;
    }
    const options = ROOMS.filter((x) => OPEN_ZONES.has(x.zone) && x.floor === 0 && (x.room.spans ?? 1) === 1 && x.room.kind !== "sealed" && x.room.kind !== "exit" && x.id !== s.room);
    for (let tries = 0; tries < 6; tries++) {
      const to = this.pick(options);
      const legs = s.room ? this.route(s.room, to.id) : null;
      if (!legs || legs.length > 14) continue;
      b.legs = legs;
      b.speed = this.rand() < 0.25 ? JOG : WALK;
      b.act = b.speed > 2 ? "jog" : "walk";
      s.why = "explore";
      if (s.vitals) s.vitals.job = "explore";
      return;
    }
    b.busyUntil = now + 2000;
  }

  private zombie(b: MBody, now: number, dt: number): void {
    const s = b.s;
    if (s.pose === "z-dead") {
      // the dead come back elsewhere (a new body: `gone`, then `spawn`)
      if (b.deadUntil && now >= b.deadUntil) {
        this.bodies.delete(s.id);
        this.onFrame({ type: "gone", id: s.id });
        const nb = this.addZombie(b.home!, s.zkind ?? "shambler", s.body);
        this.onFrame({ type: "spawn", body: { ...nb.s } });
      }
      return;
    }
    if (b.banger) return;   // (the director bangs the door)
    if (now >= (b.nextGroan ?? 0)) {
      b.nextGroan = now + this.range(6000, 16000);
      this.ev(s.zkind === "experiment" ? "experiment.idle" : "zombie.idle", { by: s.id, at: s.pos });
    }
    const prey = this.nearestSurvivor(s, s.zkind === "runner" ? 11 : 8);
    if (prey) {
      if (b.target !== prey.s.id) { b.target = prey.s.id; this.ev(s.zkind === "experiment" ? "experiment.alert" : "zombie.alert", { by: s.id, victim: prey.s.id, at: s.pos }); }
      const d = dist(s.pos, prey.s.pos);
      s.heading = Math.atan2(prey.s.pos[0] - s.pos[0], prey.s.pos[2] - s.pos[2]);
      if (d < 1.15) {
        s.pose = "z-attack";
        if (now >= (b.nextHit ?? 0)) {
          b.nextHit = now + this.range(1800, 2600);
          this.ev("zombie.attack", { by: s.id, victim: prey.s.id, at: s.pos });
          if (this.rand() < 0.4) {
            const bite = this.rand() < 0.3;
            prey.s.hp = Math.max(0, prey.s.hp - (bite ? 25 : 8));
            this.ev(bite ? "survivor.bitten" : "survivor.hit", { victim: prey.s.id, by: s.id, dmg: bite ? 25 : 8, part: "torso", at: prey.s.pos });
            if (prey.s.hp <= 20 && prey.act !== "down") {
              prey.act = "down"; prey.busyUntil = now + 12_000; prey.legs = [];
              this.ev("survivor.down", { victim: prey.s.id, at: prey.s.pos });
            }
          }
        }
      } else {
        s.pose = s.zkind === "crawler" ? "z-crawl" : "z-chase";
        this.moveToward(s, prey.s.pos, s.zkind === "crawler" ? 0.6 : s.zkind === "runner" ? Z_CHASE * 1.25 : Z_CHASE * 0.55, dt, 1.0);
      }
      return;
    }
    b.target = null;
    if (now < b.busyUntil) return;
    if (b.legs.length) {
      const arrived = this.moveToward(s, b.legs[0].to, s.zkind === "crawler" ? 0.35 : Z_WANDER, dt, 0.15);
      s.pose = s.zkind === "crawler" ? "z-crawl" : "z-wander";
      if (arrived) { b.legs = []; s.pose = s.zkind === "crawler" ? "z-crawl" : "z-idle"; b.busyUntil = now + this.range(2000, 7000); }
      return;
    }
    b.legs = [{ to: this.pointIn(roomInfo(b.home!)!) }];
  }

  private hurtZombie(z: MBody, dmg: number, by: string, part: string): void {
    if (z.s.pose === "z-dead") return;
    z.s.hp = Math.max(0, z.s.hp - dmg);
    if (z.s.hp > 0) return;
    z.s.pose = "z-dead";
    z.deadUntil = Date.now() + 40_000;
    this.ev("zombie.death", { by, victim: z.s.id, part: part === "head" && this.rand() < 0.5 ? "head" : this.rand() < 0.3 ? this.pick(["forearm.l", "forearm.r", "upperarm.l"]) : "torso", at: z.s.pos });
  }

  /** the director's nudges, and the banger's siege */
  private director(now: number): void {
    if (now >= this.nextDip) { this.nextDip = now + this.range(40_000, 70_000); this.dip(); }
    if (now >= this.nextFell) {
      this.nextFell = now + this.range(35_000, 60_000);
      const s = this.pick([...this.bodies.values()].filter((b) => b.s.kind === "survivor"));
      if (s) {
        const at: V3 = [s.s.pos[0] + this.range(-4, 4), s.s.pos[1], s.s.pos[2] + this.range(-4, 4)];
        const r = roomInfo(s.s.room);
        if (r && at[0] > r.x0 + 0.5 && at[0] < r.x1 - 0.5 && at[2] > r.z0 + 0.5 && at[2] < r.z1 - 0.5) this.ev("thing.fell", { at, from: 3, scale: 0.5, room: r.id });
      }
      if (this.rand() < 0.5) this.ev("pipe.burst", { at: [30, -5.5, 30], normal: [0, -0.2, 1], room: "generator-hall" });
    }
    if (now >= this.nextBang) {
      const bang = [...this.bodies.values()].find((b) => b.banger && b.s.pose !== "z-dead");
      const d = this.doors.get("res-bunks-b")!;
      this.nextBang = now + this.range(2600, 3600);
      if (bang) {
        if (d.broken) {
          // nailed up again after a while (a new door's worth of planks)
          if (this.rand() < 0.08) { d.broken = false; d.planks = 3; d.health = 100; this.ev("door.barricade", { door: d.id, planks: 3, state: { ...d } }); }
          return;
        }
        const hit = this.rand() < 0.6;
        if (!hit) { this.ev("door.banged", { door: d.id, by: bang.s.id, side: -1, state: { ...d } }); return; }
        d.health -= 25;
        if (d.planks > 0) {
          d.planks -= 1;
          this.ev("door.hit", { door: d.id, by: bang.s.id, side: -1, planks: d.planks, state: { ...d } });
        } else if (d.health <= 0) {
          d.broken = true;
          this.ev("door.broken", { door: d.id, by: bang.s.id, side: -1, lastHp: 30, state: { ...d } });
        } else this.ev("door.hit", { door: d.id, by: bang.s.id, side: -1, planks: 0, state: { ...d } });
      }
    }
  }

  private moveToward(s: BodyState, to: V3, speed: number, dt: number, stopAt: number): boolean {
    const dx = to[0] - s.pos[0], dz = to[2] - s.pos[2];
    const d = Math.hypot(dx, dz);
    if (d <= stopAt) return true;
    const k = Math.min(1, (speed * dt) / d);
    s.pos = [r2(s.pos[0] + dx * k), to[1], r2(s.pos[2] + dz * k)];
    s.heading = Math.atan2(dx, dz);
    // the room a body stands in, by the map (the floor height is that room's floor)
    const r = ROOMS.find((x) => x.floor === roomInfo(s.room)?.floor && s.pos[0] >= x.x0 && s.pos[0] <= x.x1 && s.pos[2] >= x.z0 && s.pos[2] <= x.z1 && (x.room.spans ?? 1) === 1);
    if (r) { s.room = r.id; s.pos[1] = FLOOR_Y[r.floor] ?? s.pos[1]; }
    return d - speed * dt <= stopAt;
  }

  private nearestZombie(s: BodyState, within: number): MBody | null {
    let best: MBody | null = null, bd = within;
    for (const b of this.bodies.values()) {
      if (b.s.kind !== "zombie" || b.s.pose === "z-dead" || b.s.room !== s.room) continue;
      const d = dist(b.s.pos, s.pos);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  private nearestSurvivor(s: BodyState, within: number): MBody | null {
    let best: MBody | null = null, bd = within;
    for (const b of this.bodies.values()) {
      if (b.s.kind !== "survivor" || b.s.pose === "dead" || b.s.room !== s.room) continue;
      const d = dist(b.s.pos, s.pos);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // ---- frames ----

  private snapshot(): ServerFrame {
    return {
      type: "snap", t: Date.now(), day: 3, bodies: [...this.bodies.values()].map((b) => ({ ...b.s, pos: [...b.s.pos] as V3 })),
      doors: [...this.doors.values()].map((d) => ({ ...d })), power: { ...this.power },
      director: { phase: "build", tension: this.tension() },
    };
  }

  private tension(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const b of this.bodies.values()) if (b.s.kind === "survivor" && b.s.who) out[b.s.who] = this.nearestZombie(b.s, 9) ? 75 : 15;
    return out;
  }

  private tick(now: number): ServerFrame {
    const out: TickBody[] = [];
    const vit = now - this.lastVitals > 1000;
    if (vit) this.lastVitals = now;
    for (const b of this.bodies.values()) {
      const s = b.s, sent = b.sent;
      const moved = s.pos[0] !== sent.p[0] || s.pos[1] !== sent.p[1] || s.pos[2] !== sent.p[2] || Math.abs(s.heading - sent.h) > 0.01;
      const tb: TickBody = { id: s.id, p: [...s.pos] as V3, h: r2(s.heading) };
      let ch = moved;
      if (s.pose !== sent.pose) { tb.pose = s.pose; sent.pose = s.pose; ch = true; }
      if ((s.held ?? null) !== sent.held) { tb.held = s.held ?? null; sent.held = s.held ?? null; ch = true; }
      if (s.hp !== sent.hp) { tb.hp = s.hp; sent.hp = s.hp; ch = true; }
      if (!!s.torch !== sent.torch) { tb.torch = !!s.torch; sent.torch = !!s.torch; ch = true; }
      if (vit && s.kind === "survivor" && s.vitals) { tb.vitals = { ...(s.vitals as SurvivorVitals) }; tb.room = s.room; tb.why = s.why; ch = true; }
      if (!ch) continue;
      sent.p = [...s.pos] as V3; sent.h = s.heading;
      out.push(tb);
    }
    return { type: "tick", t: now, b: out, ...(vit ? { director: { phase: "build" as const, tension: this.tension() } } : {}) };
  }

  private ev(event: string, fields: Record<string, unknown>): void {
    const e: Ev = { type: "ev", event, t: Date.now(), seed: Math.floor(this.rand() * 2 ** 31), ...fields };
    this.onFrame(e);
  }
}

const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
