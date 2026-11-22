// SOLACE SURVIVORZ — the look test's camera (Josh, Nov 3 2026: "let wasd move around, I don't like the controls").
// Free flight, like the map editor's: WASD (or the arrows) move, Q / E go down / up, Shift is faster,
// hold a mouse button and drag to look, the wheel sets the speed. No walls: it's for looking at a set.
import * as THREE from "three";

const HELD = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"]);

export class FlyCam {
  /** metres a second at normal speed (the wheel moves it, 0.5..12) */
  speed = 2.5;
  private keys = new Set<string>();
  private yaw = 0;
  private pitch = 0;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private off: (() => void)[] = [];

  constructor(private camera: THREE.PerspectiveCamera, private dom: HTMLElement) {
    const typing = (e: Event) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (typing(e) || !HELD.has(e.code)) return;
      this.keys.add(e.code);
      if (e.code.startsWith("Arrow")) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => { this.keys.delete(e.code); };
    const blur = () => { this.keys.clear(); this.dragging = false; };
    const pdown = (e: PointerEvent) => {
      this.dragging = true; this.lastX = e.clientX; this.lastY = e.clientY;
      dom.setPointerCapture(e.pointerId);
    };
    const pmove = (e: PointerEvent) => {
      if (!this.dragging) return;
      this.yaw -= (e.clientX - this.lastX) * 0.004;
      this.pitch = THREE.MathUtils.clamp(this.pitch - (e.clientY - this.lastY) * 0.004, -1.5, 1.5);
      this.lastX = e.clientX; this.lastY = e.clientY;
      this.apply();
    };
    const pup = (e: PointerEvent) => { this.dragging = false; if (dom.hasPointerCapture(e.pointerId)) dom.releasePointerCapture(e.pointerId); };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      this.speed = THREE.MathUtils.clamp(this.speed * (e.deltaY > 0 ? 0.85 : 1.18), 0.5, 12);
    };
    const menu = (e: Event) => e.preventDefault();   // right-drag looks too
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    dom.addEventListener("pointerdown", pdown);
    dom.addEventListener("pointermove", pmove);
    dom.addEventListener("pointerup", pup);
    dom.addEventListener("pointercancel", pup);
    dom.addEventListener("wheel", wheel, { passive: false });
    dom.addEventListener("contextmenu", menu);
    dom.style.cursor = "grab";
    this.off.push(
      () => window.removeEventListener("keydown", down),
      () => window.removeEventListener("keyup", up),
      () => window.removeEventListener("blur", blur),
      () => dom.removeEventListener("pointerdown", pdown),
      () => dom.removeEventListener("pointermove", pmove),
      () => dom.removeEventListener("pointerup", pup),
      () => dom.removeEventListener("pointercancel", pup),
      () => dom.removeEventListener("wheel", wheel),
      () => dom.removeEventListener("contextmenu", menu),
    );
  }

  /** stand at `at` looking toward `look` */
  place(at: THREE.Vector3Tuple, look: THREE.Vector3Tuple): void {
    this.camera.position.set(...at);
    const d = new THREE.Vector3(...look).sub(this.camera.position).normalize();
    this.yaw = Math.atan2(-d.x, -d.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
    this.apply();
  }

  update(dt: number): void {
    const k = this.keys;
    if (!k.size) return;
    const fwd = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    const side = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    const lift = (k.has("KeyE") ? 1 : 0) - (k.has("KeyQ") ? 1 : 0);
    if (!fwd && !side && !lift) return;
    const v = this.speed * (k.has("ShiftLeft") || k.has("ShiftRight") ? 3 : 1) * dt;
    const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);   // forward follows the look, up and down included
    const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw)).negate();
    this.camera.position.addScaledVector(dir, fwd * v).addScaledVector(right, side * v);
    this.camera.position.y += lift * v;
  }

  private apply(): void {
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }

  dispose(): void {
    for (const f of this.off) f();
    this.off = [];
    this.keys.clear();
  }
}
