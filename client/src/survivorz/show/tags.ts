// SOLACE SURVIVORZ — NAMES OVER HEADS (BUNKER.md: always, with a small health bar, in the survivor's colour).
//
// A DOM layer over the canvas, positioned every frame from the camera (the scene calls `update()` after it
// renders). Nothing reactive is written from the frame loop: each tag is a plain element whose transform is
// set only when it moves half a pixel, and whose text and bar change only at the 4 Hz beat. A tag shows only
// for a living survivor in front of the camera, near enough, with a clear line from the lens to their head
// (checked at the beat — a name through a wall reads as a bug, not a graphic).
import * as THREE from "three";
import type { ShowScene } from "./scene";
import type { V3 } from "./geo";
import { colourOf, firstName } from "./overlay";

/** how far above the feet the tag hangs (m), and how far a tag still shows */
const HEAD_M = 2.08;
const FAR_M = 26;
const BEAT_MS = 250;

interface Tag { el: HTMLDivElement; name: HTMLElement; bar: HTMLElement; x: number; y: number; s: number; on: boolean; hp: number; clear: boolean }

export class NameTags {
  private tags = new Map<string, Tag>();
  private v = new THREE.Vector3();
  private nextBeat = 0;
  private w = 0;
  private h = 0;
  private frameN = 0;
  hidden = false;

  constructor(private host: HTMLElement, private scene: ShowScene, private sees: (a: V3, b: V3) => boolean) {}

  private make(id: string, who: string): Tag {
    const el = document.createElement("div");
    el.className = "ntag";
    el.style.setProperty("--c", colourOf(who));
    const name = document.createElement("span");
    name.className = "nn";
    name.textContent = firstName(who);
    const hp = document.createElement("i");
    const bar = document.createElement("b");
    hp.appendChild(bar);
    el.append(name, hp);
    el.style.opacity = "0";
    this.host.appendChild(el);
    const t: Tag = { el, name, bar, x: -1e4, y: -1e4, s: 1, on: false, hp: -1, clear: false };
    this.tags.set(id, t);
    return t;
  }

  update(): void {
    const actors = this.scene.actors;
    if (!actors) return;
    if (this.frameN++ % 30 === 0 || !this.w) { this.w = this.host.clientWidth; this.h = this.host.clientHeight; }
    const cam = this.scene.camera;
    const now = performance.now();
    const beat = now >= this.nextBeat;
    if (beat) this.nextBeat = now + BEAT_MS;
    const live = new Set<string>();
    for (const a of actors.list.values()) {
      // (no tag before the body is drawn: a name floating over an empty floor read as a broken show)
      if (a.kind !== "survivor" || !a.who || !a.ready) continue;
      const st = a.state;
      const alive = st.pose !== "dead" && (st.hp ?? 1) > 0 && !st.escaped;
      if (!alive) continue;
      live.add(a.id);
      const t = this.tags.get(a.id) ?? this.make(a.id, a.who);
      this.v.set(a.pos.x, a.pos.y + HEAD_M, a.pos.z);
      const dist = this.v.distanceTo(cam.position);
      if (beat) {
        t.clear = dist < FAR_M && this.sees([cam.position.x, cam.position.y, cam.position.z], [this.v.x, this.v.y - 0.25, this.v.z]);
        const hp = Math.round((st.hp / Math.max(1, st.hpMax)) * 100);
        if (hp !== t.hp) { t.hp = hp; t.bar.style.width = `${hp}%`; t.bar.classList.toggle("low", hp < 35); }
      }
      this.v.project(cam);
      const on = !this.hidden && t.clear && this.v.z < 1 && Math.abs(this.v.x) < 1.05 && Math.abs(this.v.y) < 1.05;
      if (on !== t.on) { t.on = on; t.el.style.opacity = on ? "1" : "0"; }
      if (!on) continue;
      const x = (this.v.x * 0.5 + 0.5) * this.w, y = (-this.v.y * 0.5 + 0.5) * this.h;
      // nearer is a touch bigger, inside a floor and a ceiling (a tag across the room still reads)
      const s = Math.max(0.72, Math.min(1.15, 7 / Math.max(1, dist)));
      if (Math.abs(x - t.x) > 0.5 || Math.abs(y - t.y) > 0.5 || Math.abs(s - t.s) > 0.02) {
        t.x = x; t.y = y; t.s = s;
        t.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${s.toFixed(2)})`;
      }
    }
    for (const [id, t] of this.tags) if (!live.has(id)) { t.el.remove(); this.tags.delete(id); }
  }

  /** a new run, or the overlay gone: every tag off the screen */
  clear(): void {
    for (const t of this.tags.values()) t.el.remove();
    this.tags.clear();
  }
}
