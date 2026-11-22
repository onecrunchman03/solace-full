// SOLACE SURVIVORZ — WALK THE MAP: the admin's own body in a private run (Josh, Nov 13 2026: "the ability as
// admin in solace to spawn into the map and walk around … I should be able to do everything the survivors are
// supposed to do … this will be the standard also for all future maps").
//
// The server owns the body (src/survivorz/sim: a survivor flagged as the player, in a test run only the admin's
// socket sees). This file is the hands: the keys become `walk.in` frames (a direction in the world, from where the
// camera looks), and the server's `walk` frames say what can be done here — the survivor's OWN menu, within reach —
// which the page lists and a key picks. Nothing here decides anything about the world.
//
//   W A S D / arrows  jog (the way the camera faces)      Shift  sprint   Z  walk (toggle)   C  crouch (toggle)
//   1-9, E (the first)  do what the list offers            Space / F  strike or shoot the nearest of the dead
//   X  stop what you're doing                              drag  look round · wheel  nearer / further
import * as THREE from "three";

export interface WalkAction { id: string; label: string; kind?: string }
export interface WalkFrame { type: "walk"; you: string; actions: WalkAction[]; busy?: { label: string; frac: number }; note?: string }
export interface WalkState { you: string; actions: WalkAction[]; busy: { label: string; frac: number } | null; note: string }

/** inputs go out this often at most while a key is held (the server's bucket: 60, refilled 40 a second) */
const SEND_MS = 60;
/** ...and at least this often while moving, so a dropped frame never leaves the body walking on */
const KEEP_MS = 250;
/** a note from the server ("the door is bolted") stays up this long */
const NOTE_MS = 3200;

export class WalkControl {
  state: WalkState = { you: "", actions: [], busy: null, note: "" };
  onChange: (s: WalkState) => void = () => {};
  private keys = new Set<string>();
  private crouch = false;
  /** walking pace (the server reads a half push as a walk, a full one as a jog; `run` as a sprint) */
  slow = false;
  private lastSent = { mx: 0, mz: 0, run: false, crouch: false, at: 0 };
  private fwd = new THREE.Vector3();
  private timer: ReturnType<typeof setInterval>;
  private noteUntil = 0;

  /** `camera` is asked for on every use: the page rebuilds its scene when the map changes, and the keys steer by
   *  the camera that is drawing now */
  constructor(private camera: () => THREE.Camera | null, private send: (o: Record<string, unknown>) => boolean) {
    window.addEventListener("keydown", this.down);
    window.addEventListener("keyup", this.up);
    window.addEventListener("blur", this.blur);
    this.timer = setInterval(() => this.tick(), 50);
  }

  /** the server's word on what can be done here */
  frame(f: WalkFrame): void {
    // (one row an id: the list is keyed by it on the page)
    const seen = new Set<string>();
    const actions = (Array.isArray(f.actions) ? f.actions : []).filter((a) => a && typeof a.id === "string" && !seen.has(a.id) && !!seen.add(a.id)).slice(0, 12);
    // (the server says a note once; it stays up a few seconds, not until the next frame happens to come)
    const now = performance.now();
    if (f.note) this.noteUntil = now + NOTE_MS;
    const note = f.note || (now < this.noteUntil ? this.state.note : "");
    this.state = { you: f.you, actions, busy: f.busy ?? null, note };
    this.onChange(this.state);
  }

  /** the i-th thing on the list (a number key) */
  do(i: number): void {
    const a = this.state.actions[i];
    if (a) this.doId(a.id);
  }
  /** that very thing (a click: the list re-sorts by distance under the pointer, so the row's own id is sent) */
  doId(id: string): void { this.send({ type: "walk.do", id }); }

  private typing(e: KeyboardEvent): boolean { return !!(e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]"); }

  private down = (e: KeyboardEvent): void => {
    // (a Mac does not send the key-up of a key let go while Command is down: W would stay "held" until the window
    // lost focus. Command pressed lets go of everything.)
    if (e.metaKey || e.key === "Meta") { this.keys.clear(); return; }
    if (this.typing(e) || e.ctrlKey || e.altKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Shift"].includes(k)) { this.keys.add(k); e.preventDefault(); return; }
    if (e.repeat) return;
    if (k === "c") { this.crouch = !this.crouch; e.preventDefault(); }
    else if (k === "z") { this.slow = !this.slow; e.preventDefault(); }
    else if (k === " " || k === "f") { this.send({ type: "walk.hit" }); e.preventDefault(); }
    else if (k === "x") { this.send({ type: "walk.stop" }); e.preventDefault(); }
    else if (k === "e") { this.do(0); e.preventDefault(); }
    // (the digit by where the key is, so 1-9 still pick while Shift is held to sprint)
    else if (/^Digit[1-9]$/.test(e.code)) { this.do(Number(e.code.slice(5)) - 1); e.preventDefault(); }
  };
  private up = (e: KeyboardEvent): void => { if (e.key === "Meta") this.keys.clear(); this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key); };
  private blur = (): void => { this.keys.clear(); };

  /** the keys as a direction in the world: forward is the way the camera looks, along the ground */
  private tick(): void {
    if (this.state.note && performance.now() >= this.noteUntil) { this.state = { ...this.state, note: "" }; this.onChange(this.state); }
    const has = (...k: string[]) => k.some((x) => this.keys.has(x));
    const f = (has("w", "ArrowUp") ? 1 : 0) - (has("s", "ArrowDown") ? 1 : 0), r = (has("d", "ArrowRight") ? 1 : 0) - (has("a", "ArrowLeft") ? 1 : 0);
    let mx = 0, mz = 0;
    if (f || r) {
      const cam = this.camera();
      if (!cam) return;
      cam.getWorldDirection(this.fwd);
      this.fwd.y = 0;
      if (this.fwd.lengthSq() < 1e-6) this.fwd.set(0, 0, -1);
      this.fwd.normalize();
      // (right of forward, on the ground: forward x up)
      const rx = -this.fwd.z, rz = this.fwd.x;
      mx = this.fwd.x * f + rx * r; mz = this.fwd.z * f + rz * r;
      const len = (Math.hypot(mx, mz) || 1) / (this.slow ? 0.45 : 1);
      mx /= len; mz /= len;
    }
    const run = this.keys.has("Shift"), now = performance.now(), L = this.lastSent;
    const moving = mx !== 0 || mz !== 0;
    const changed = Math.abs(mx - L.mx) > 0.02 || Math.abs(mz - L.mz) > 0.02 || run !== L.run || this.crouch !== L.crouch;
    if ((changed && now - L.at >= SEND_MS) || (moving && now - L.at >= KEEP_MS)) {
      if (this.send({ type: "walk.in", mx: +mx.toFixed(3), mz: +mz.toFixed(3), run, crouch: this.crouch })) this.lastSent = { mx, mz, run, crouch: this.crouch, at: now };
    }
  }

  dispose(): void {
    clearInterval(this.timer);
    window.removeEventListener("keydown", this.down);
    window.removeEventListener("keyup", this.up);
    window.removeEventListener("blur", this.blur);
    this.send({ type: "walk.in", mx: 0, mz: 0 });
  }
}
