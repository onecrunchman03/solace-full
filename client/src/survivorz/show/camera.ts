// SOLACE SURVIVORZ — THE SHOW: a simple camera for the draft — free orbit, or following a body.
//
// The real director comes later (the casino show's client/src/casino/spectator.ts is the pattern:
// interest, shot grammar, cuts). This is only what the bench needs to look at the show: drag to
// orbit, scroll to move in, WASD (and Q/E) to slide the orbit point through the facility, and a
// FOLLOW mode that keeps the chosen body framed while it walks — the camera keeps its offset and
// the point it looks at eases after the body.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Actor } from "./actors";
import { ceilingOf, inPoly, roomAt } from "./site";

export class ShowCamera {
  readonly controls: OrbitControls;
  follow: string | null = null;
  /** THE DIRECTOR'S FIXED SHOT (show/direct.ts): the camera stands at `from` and pans, easing its
   *  aim onto `aim` (the runner moves `aim` with the subject). Wins over follow and the keys. */
  tripod: { from: THREE.Vector3; aim: THREE.Vector3 } | null = null;
  private keys = new Set<string>();
  private aim = new THREE.Vector3();
  private lastTarget = new THREE.Vector3();
  /** the room the followed body is in, and the one it came from while the camera is still in it */
  private roomId: string | null = null;
  private trail: string[] = [];

  constructor(readonly camera: THREE.PerspectiveCamera, private dom: HTMLElement) {
    this.controls = new OrbitControls(camera, dom);
    this.controls.enableDamping = true;
    this.controls.maxDistance = 30;
    this.controls.minDistance = 0.8;
    dom.tabIndex = 0;
    dom.addEventListener("keydown", this.down);
    dom.addEventListener("keyup", this.up);
    dom.addEventListener("blur", this.blur);
  }

  private down = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    if ("wasdqe".includes(k) && k.length === 1) { this.keys.add(k); e.preventDefault(); }
  };
  private up = (e: KeyboardEvent): void => { this.keys.delete(e.key.toLowerCase()); };
  private blur = (): void => this.keys.clear();

  look(at: [number, number, number], from: [number, number, number]): void {
    this.camera.position.set(...from);
    this.controls.target.set(...at);
    this.lastTarget.copy(this.controls.target);
    this.controls.update();
  }

  /** the point the shot is about (the rig lights it, the zones load round it) */
  get focus(): THREE.Vector3 { return this.controls.target; }

  update(dt: number, actor: Actor | undefined): void {
    const t = this.controls.target;
    if (this.tripod) {
      this.camera.position.copy(this.tripod.from);
      t.lerp(this.tripod.aim, 1 - Math.exp(-dt * 5));
      this.controls.update();
      this.camera.position.copy(this.tripod.from);
      this.lastTarget.copy(t);
      return;
    }
    if (this.follow && actor) {
      // ease the aim onto the body's chest; carry the camera with it, so the framing holds
      actor.chest(this.aim);
      if (!Number.isFinite(this.aim.x + this.aim.y + this.aim.z)) this.aim.copy(actor.pos).setY(actor.pos.y + 1.15);
      this.aim.y = actor.pos.y + 1.15;
      const before = t.clone();
      t.lerp(this.aim, 1 - Math.exp(-dt * 6));   // frame-rate independent
      this.camera.position.add(t.clone().sub(before));
      // never inside a wall: the camera stays in the room the body is in (a corridor 6 m wide
      // put a side-on camera behind its wall, and the shot went black)
      const r = roomAt(actor.pos.x, actor.pos.y + 0.5, actor.pos.z);
      // THROUGH A DOORWAY (the code review's D-2): the moment the body was a step into the next room the camera,
      // three metres behind it, was put inside that room too: in FRONT of the body, looking back, a half turn in one
      // frame (and a walk's "forward" meant "back" while it was there). While the camera is still standing in the
      // room the body has just left, it is left there: it looks through the doorway and follows the body in.
      // (...through TWO doorways nearer together than the camera trails: only the last room left was remembered, so
      // with the camera two rooms back the old clamp fired. Great Hall, the three-metre Long Gallery, the Vestibule:
      // the camera jumped four metres to in front of the body and the walk's forward key walked it back, on the
      // house's main axis to the front door. The re-grade's N1: the rooms left are kept as a short trail.)
      if (r && r.id !== this.roomId) { if (this.roomId) { this.trail.push(this.roomId); if (this.trail.length > 4) this.trail.shift(); } this.roomId = r.id; }
      const cp = this.camera.position;
      const camRoom = roomAt(cp.x, actor.pos.y + 0.5, cp.z)?.id;
      const behind = !!r && !!camRoom && camRoom !== r.id && this.trail.includes(camRoom);
      if (!behind) this.trail.length = 0;
      if (r && !behind) {
        const p = this.camera.position, y0 = r.fy;
        p.x = THREE.MathUtils.clamp(p.x, r.x0 + 0.35, r.x1 - 0.35);
        p.z = THREE.MathUtils.clamp(p.z, r.z0 + 0.35, r.z1 - 0.35);
        // A ROOM THAT IS NOT ITS BOX (a house's wings stand at 45 degrees, its yards are any shape): the box put the
        // camera out through the wall, looking at the house from the garden, or into the dark behind a boiler. It
        // is drawn in along its own line to the body until it stands in the room's own outline. (Indoors only: out of doors there is no wall to be behind.)
        if (r.poly && !r.outdoor) {
          const at = (ang: number, d: number, k: number): [number, number] => [t.x + Math.sin(ang) * d * k, t.z + Math.cos(ang) * d * k];
          // (the camera's own spot and the middle of its line to the body, both in the room)
          const fits = (ang: number, d: number) => [1, 0.55].every((k) => { const [x, z] = at(ang, d, k); return inPoly(r.poly!, x, z) && roomAt(x, t.y - 0.6, z)?.id === r.id; });
          const d0 = Math.hypot(p.x - t.x, p.z - t.z), a0 = Math.atan2(p.x - t.x, p.z - t.z);
          if (d0 > 0.05 && !fits(a0, d0)) {
            // ROUND THE BODY BEFORE IN ON IT: a narrow corridor has room along it, not across it. The nearest way
            // round that fits at the distance it had; failing that, nearer in.
            let ang = a0, d = Math.min(d0, 0.9);
            find: for (const dd of [d0, Math.min(d0, 2.6), Math.min(d0, 1.9), Math.min(d0, 1.3)]) {
              for (let i = 0; i <= 8; i++) for (const sg of i === 0 ? [1] : [1, -1]) {
                const a2 = a0 + (sg * i * Math.PI) / 8;
                if (fits(a2, dd)) { ang = a2; d = dd; break find; }
              }
            }
            [p.x, p.z] = at(ang, d, 1);
          }
        }
        // (and under ITS ceiling: the bunk rooms are 2.6 m, Medical's halls 2.7 — a camera at 2.9 filmed the back of the ceiling)
        if ((r.room.spans ?? 1) === 1) p.y = THREE.MathUtils.clamp(p.y, y0 + 0.4, y0 + Math.min(2.9, ceilingOf(r.id) - 0.25));
      }
    } else if (this.keys.size && this.controls.enabled) {
      // slide the orbit point along the ground the way the camera faces
      const fwd = new THREE.Vector3();
      this.camera.getWorldDirection(fwd);
      fwd.y = 0; fwd.normalize();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
      const move = new THREE.Vector3();
      if (this.keys.has("w")) move.add(fwd);
      if (this.keys.has("s")) move.sub(fwd);
      if (this.keys.has("d")) move.add(right);
      if (this.keys.has("a")) move.sub(right);
      if (this.keys.has("e")) move.y += 1;
      if (this.keys.has("q")) move.y -= 1;
      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(Math.min(dt, 0.1) * 7);
        t.add(move);
        this.camera.position.add(move);
      }
    }
    this.controls.update();
    this.lastTarget.copy(t);
  }

  dispose(): void {
    this.dom.removeEventListener("keydown", this.down);
    this.dom.removeEventListener("keyup", this.up);
    this.dom.removeEventListener("blur", this.blur);
    this.controls.dispose();
  }
}
