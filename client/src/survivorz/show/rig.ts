// SOLACE SURVIVORZ — THE SHOW: the real-time lights, a FIXED rig built once.
//
// three bakes the scene's light count into every shader (CLAUDE.md "THE HALL NEVER COMPILES
// MID-GAME"), so nothing here is ever added or removed: these lights exist from the first frame
// and only move and dim. The room's own light is BAKED (the lightmaps); the rig lights what the
// bake can't — the bodies and the props — at the fixtures nearest the camera's subject, in the
// subject's room only (an unshadowed light handed to a fixture in the next room shines straight
// through the wall: room/lobby.ts learned that the hard way).
//   10 fixture spots · 2 shadow spots (the bodies' shadows) · 3 torch spots (the survivors'
//   flashlights nearest the camera) · the hemisphere fill · and the effects' own six (fx/lights.ts)
import * as THREE from "three";
import type { FxSystem } from "../fx";
import { LIGHT_LEVEL } from "../room/lobby";
import type { FacilityZones, ZFix } from "./zones";
import { MAP_ID, roomAt, roomInfo } from "./site";

/** THE FILL, BY WHERE THE SHOT IS (a house at night, Glenridge Hall): the bodies and the furniture have no bake, so
 *  this one light is the room's bounce on them — warm under the lamps, a dim blue out in the rain, next to nothing
 *  in the house with its lights out. [sky, ground, level] */
const HOUSE_FILL = { lit: [0xffe2c0, 0x4a3a2c, 0.85], out: [0x7f8fb8, 0x10141c, 0.3], dark: [0x6f7fa8, 0x0c0e14, 0.16] } as const;
/** out of doors, a lamp lights the bodies this near it, metres */
const OUT_LAMP_M = 12;
/** a fire's light reaches this far into the rooms round its hearth, metres */
const FIRE_M = 9;

export const RIG = { fixtures: 10, shadows: 2, torches: 3 } as const;
const TORCH_FULL = 30;

export class LightRig {
  readonly pool: THREE.SpotLight[] = [];
  readonly shadows: THREE.SpotLight[] = [];
  readonly torches: THREE.SpotLight[] = [];
  readonly fill: THREE.HemisphereLight;
  private lit: (ZFix | null)[] = [];
  private shadowLit: (ZFix | null)[] = [];
  private room = "";
  private nextAssign = 0;
  private fillBase = 1;
  private fillBoost = 1;
  /** LIGHTNING: the fill lifted for a moment, so the bodies flash with the ground (1 = as it stands) */
  flash(k: number): void { this.fillBoost = k; if (MAP_ID !== "bunker") this.fill.intensity = this.fillBase * k; }

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < RIG.fixtures; i++) {
      const sp = new THREE.SpotLight(0xffffff, 0, 14, 1, 0.8, 2);
      sp.name = `rig-fixture-${i}`;
      scene.add(sp, sp.target);
      this.pool.push(sp);
      this.lit.push(null);
    }
    for (let i = 0; i < RIG.shadows; i++) {
      const s = new THREE.SpotLight(0xe8f0ff, 0, 12, THREE.MathUtils.degToRad(48), 0.6, 2);
      s.name = `rig-shadow-${i}`;
      s.castShadow = true;
      s.shadow.mapSize.set(1024, 1024);
      s.shadow.bias = -0.0004;
      s.shadow.normalBias = 0.02;
      s.shadow.camera.near = 0.5; s.shadow.camera.far = 10;
      scene.add(s, s.target);
      this.shadows.push(s);
      this.shadowLit.push(null);
    }
    for (let i = 0; i < RIG.torches; i++) {
      const t = new THREE.SpotLight(0xfff4e2, 0, 14, 0.42, 0.45, 1.6);
      t.name = `rig-torch-${i}`;
      scene.add(t, t.target);
      this.torches.push(t);
    }
    // the props and bodies have no lightmap: this stands in for the room's bounce light (lobby.ts)
    this.fill = new THREE.HemisphereLight(0xb8c2cc, 0x6a6660, 1.0);
    scene.add(this.fill);
  }

  /** whether a fixture is fed right now */
  private live(f: ZFix, zones: FacilityZones): boolean {
    if (f.kind === "exit") return false;
    const on = zones.powered(f.zone);
    return f.feed === "battery" ? true : f.feed === "mains" ? on : !on;
  }

  /** Hand the pool to the subject's room: its working fixtures, nearest first. Every half second
   *  (the subject walks), at once on a room change. */
  assign(focus: THREE.Vector3, zones: FacilityZones, now: number, force = false): void {
    const r = roomAt(focus.x, focus.y, focus.z);
    const id = r?.id ?? "";
    if (!force && id === this.room && now < this.nextAssign) return;
    this.room = id;
    this.nextAssign = now + 0.5;
    // (out of doors there are no walls to keep a lamp to its room: the lanterns near enough, whichever yard they hang in)
    // (a fire lights whoever is near it, whichever room its hearth is filed under: the inglenook's is the Great Hall's)
    const mine = (f: ZFix) => (r!.outdoor ? (!roomInfo(f.room) || !!roomInfo(f.room)!.outdoor) && f.at.distanceToSquared(focus) < OUT_LAMP_M * OUT_LAMP_M
      : f.room === r!.id || (!!f.fire && Math.abs(f.at.y - focus.y) < 3 && f.at.distanceToSquared(focus) < FIRE_M * FIRE_M));
    const live = r ? zones.fixtures().filter((f) => mine(f) && this.live(f, zones)).sort((a, b) => a.at.distanceToSquared(focus) - b.at.distanceToSquared(focus)) : [];
    const floorY = r ? r.fy : focus.y;
    this.pool.forEach((sp, i) => {
      const f = live[i] ?? null;
      this.lit[i] = f;
      if (!f) { sp.intensity = 0; return; }
      aimAt(sp, f, floorY);
    });
    // the shadows: the two nearest, ordinary fixtures before the twin-heads
    const byKind = [...live.filter((f) => f.kind !== "emergency"), ...live.filter((f) => f.kind === "emergency")];
    this.shadows.forEach((s, i) => {
      const f = byKind[i] ?? null;
      this.shadowLit[i] = f;
      if (!f) { s.intensity = 0; return; }
      s.position.copy(f.at);
      if (f.kind === "emergency" && f.face) s.target.position.copy(f.at).addScaledVector(f.face, 2).setY(floorY);
      else s.target.position.set(f.at.x, floorY, f.at.z);
      s.target.updateMatrixWorld();
    });
    if (MAP_ID === "bunker") this.fill.intensity = r && zones.powered(r.zone) ? 1.4 : 1.0;
    else {
      const f = !r || r.outdoor ? HOUSE_FILL.out : zones.powered(r.zone) ? HOUSE_FILL.lit : HOUSE_FILL.dark;
      this.fill.color.setHex(f[0]); this.fill.groundColor.setHex(f[1]); this.fillBase = f[2];
      this.fill.intensity = this.fillBase * this.fillBoost;
    }
  }

  /** every frame: the lights follow their fixtures' level (the effects decide it) */
  update(fx: FxSystem, zones: FacilityZones): void {
    this.pool.forEach((sp, i) => {
      const f = this.lit[i];
      if (!f) return;
      sp.intensity = LIGHT_LEVEL[f.kind] * fx.fixtures.level(f.id) * (zones.powered(f.zone) && f.kind !== "emergency" && f.kind !== "lamp" ? 1.3 : 1);
      // (firelight: it never holds still)
      if (f.fire) { const t = fx.now; sp.intensity *= 1.25 * (0.8 + 0.14 * Math.sin(t * 8.3 + i) + 0.1 * Math.sin(t * 21.1 + i * 3.7)); sp.color.setHex(0xff8a3c); }
    });
    this.shadows.forEach((s, i) => {
      const f = this.shadowLit[i];
      if (f) s.intensity = (f.kind === "lamp" ? 14 : 30) * fx.fixtures.level(f.id) * (f.kind === "emergency" ? 0.6 : 1);
    });
  }

  /** a flashlight's light (the nearest few torches get one), 0..1 of full */
  torch(i: number, pos: THREE.Vector3 | null, dir: THREE.Vector3 | null, level: number): void {
    const t = this.torches[i];
    if (!t) return;
    if (!pos || !dir || level <= 0.01) { t.intensity = 0; return; }
    t.position.copy(pos);
    t.target.position.copy(pos).add(dir);
    t.target.updateMatrixWorld();
    t.intensity = TORCH_FULL * level;
  }

  count(): number { return this.pool.length + this.shadows.length + this.torches.length + 1; }
}

function aimAt(sp: THREE.SpotLight, f: ZFix, floorY: number): void {
  sp.position.copy(f.at);
  if (f.kind === "emergency" && f.face) {
    // the twin heads: out from the wall and 40 degrees down, as the bake aims them
    sp.color.set(0xffc98a); sp.distance = 16; sp.angle = THREE.MathUtils.degToRad(40); sp.penumbra = 0.55;
    const aim = f.face.clone().multiplyScalar(Math.cos(0.698)).add(new THREE.Vector3(0, -Math.sin(0.698), 0));
    sp.target.position.copy(f.at).addScaledVector(aim, 4);
  } else if (f.kind === "lamp" && f.fire) {
    // A FIRE: low in its hearth, and it lights what is ABOVE and around it — faces, not ankles. (Aimed down like a
    // ceiling lamp from 20 cm off the floor, it lit only the hearth stone: the review, Nov 13 2026.)
    sp.color.set(0xff8a3c); sp.distance = FIRE_M; sp.angle = THREE.MathUtils.degToRad(88); sp.penumbra = 1;
    sp.position.set(f.at.x, f.at.y + 0.25, f.at.z);
    sp.target.position.set(f.at.x, f.at.y + 3.25, f.at.z);
  } else if (f.kind === "lamp") {
    // a shaded lamp, a chandelier, a fire: warm, all round below it, and short (it must not reach the next room)
    sp.color.set(0xffb070); sp.distance = 8; sp.angle = THREE.MathUtils.degToRad(88); sp.penumbra = 1;
    sp.target.position.set(f.at.x, f.at.y - 3, f.at.z);
  } else {
    const caged = f.kind === "caged";
    sp.color.set(caged ? 0xffd9a0 : 0xe8f0ff); sp.distance = caged ? 12 : 14;
    sp.angle = THREE.MathUtils.degToRad(caged ? 85 : 68); sp.penumbra = caged ? 0.9 : 0.8;
    sp.target.position.set(f.at.x, floorY, f.at.z);
  }
  sp.target.updateMatrixWorld();
}
