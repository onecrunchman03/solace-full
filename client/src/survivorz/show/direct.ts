// SOLACE SURVIVORZ — THE DIRECTOR'S HANDS: turns the director's decisions (show/director.ts) into
// camera moves on the scene, owns the cuts, and feeds the broadcast graphics.
//
//   const run = new DirectorRun(scene);      // before frames flow: it is fed from scene.apply
//   run.setDip(el);                          // the black the dips go through (Show.svelte)
//   run.setMode("director" | "follow" | "free");
//   run.broadcast()                          // the overlay's model, read on its own 4 Hz timer
//
// THE CUT RULES (law 5 of the casino show: "transitions, not fancy"): a HARD cut within a subject
// (wide → close → follow, a re-framed shot), a short DIP through black on a change of subject.
// NEVER INTO A VOID: the director only cuts to a body whose zone is drawn; when it isn't, this
// asks the scene to prepare it (pinned a while so it can't be unloaded before the cut lands).
//
// The frame loop calls `frame(dt)`; nothing reactive is written from it (the overlay polls
// `broadcast()`), and the dip's opacity is written to the DOM only when it changes.
import * as THREE from "three";
import type { Goals, ScreenFrame } from "../../../../src/survivorz/sim/wire";
import { Director, runChanged, runOf, type Decision, type DShot } from "./director";
import { Geo, roomsFrom, type GridFile, type V3 } from "./geo";
import { BANNER_TITLE, HOUSE_BANNER, castRows, colourOf, decisionShown, elapsed, endCard, firstName, isDeadBody, memoriam, nameCard, nameOf, objectiveRows, recapCard,
  setHouseWords, type CastRow, type EndCard, type Memoriam, type NameCard, type ObjRow, type RecapCard } from "./overlay";
import type { ShowScene } from "./scene";
import { closeShot, twoShot, wideShot, bodyShot, spotOk, lensOnly, SHOT_FOV, type Pose } from "./shots";
import { FLOOR_Y, MAP_ID, ROOMS, brandInPlay, gridsInPlay, placeOf, roomInfo } from "./site";

export type CamMode = "director" | "follow" | "free";

const BEAT_MS = 250;
const LYING = new Set(["dead", "z-dead", "down", "z-crawl", "sleep"]);
const DIP_OUT_MS = 180;
const DIP_IN_MS = 300;
/** a fixed shot whose subject has walked out of it is re-framed (a hard cut), at most this often */
const REFRAME_MS = 2_500;
/** THE OPERATOR (REALISM.md → the director camera: "over-the-shoulder follow… smooth operator movement with slight
 *  drift"). A camera on a moving body keeps a distance and a side: it stands OP_DIST behind and a quarter round
 *  (in front, three-quarter, when they stand still), at OP_H over their feet, eases toward that spot (OP_EASE /s)
 *  instead of being dragged with them, and sways a few centimetres like a camera on a shoulder. It picks a side
 *  and keeps it while the spot stands clear; it never gets nearer than OP_MIN_M (the old follow was dragged with
 *  its subject and squeezed against the walls until a body filled the frame); a spot gone bad, or one a long way
 *  off, is a cut, never a swing through the subject. */
/** a held shot's subject this near the lens, or anybody this near it, and the director cuts (m, on the floor) */
const NEAR_SUBJECT_M = 1.4, NEAR_ANY_M = 0.6, NEAR_LENS_M = 0.55, CROWD_LENS_M = 1.0, CROWD_MS = 1500;
/** a body this near the line to the subject, this long, and the shot is re-taken */
const BLOCK_R = 0.3, BLOCK_MS = 800, BLOCK_GAP_MS = 2500, BLOCK_GAP_MAX_MS = 20_000, BLOCK_K = 0.65;
const OP_DIST = [3.7, 3.1, 2.6], OP_H = 2.0, OP_H_HIGH = 2.6, OP_EASE = 1.3, OP_MIN_M = 2.3, OP_LOOK_MS = 400, OP_JUMP_M = 3.2, OP_SWAY = 0.05;
const CARD_MS = 5_500;
const MEMORIAM_MS = 9_000;

const ROOM_NAME = (id: string | null | undefined): string | undefined => roomInfo(id)?.room.name;

let GEO: Geo | null = null, GEO_MAP = "";
/** the director's geometry for the map in play (show/site.ts useMap): built once a map, again when it changes */
export function showGeo(): Geo {
  if (!GEO || GEO_MAP !== MAP_ID) {
    const g = gridsInPlay();
    GEO = new Geo(g.walk as unknown as GridFile, g.sight as unknown as GridFile, roomsFrom(ROOMS.map((r) => ({ ...r.room, zone: r.zone, fy: r.fy })), FLOOR_Y), g.labels);
    GEO_MAP = MAP_ID;
  }
  return GEO;
}

export interface Broadcast {
  rows: CastRow[];
  /** the lower third: who the director just cut to */
  card: NameCard | null;
  memoriam: Memoriam | null;
  mode: CamMode;
  /** the subtitles: at most two lines, one per speaker, the one on air first (the casino show's rule) */
  subs: Subtitle[];
  /** what the director is filming and why (the admin panel's readout, never the broadcast) */
  onAir: { target: string | null; shot: DShot; reason: string; pending: string | null };
  /** THE BUNKER's objectives (wire.ts Goals) */
  goals: Goals | null;
  /** the checklist, and the hour's countdown (h:mm:ss left on the show clock) */
  objectives: ObjRow[];
  remaining: string | null;
  /** an objective just done: "DOOR SEALED — Rick, 0:42:10" */
  banner: { key: string; title: string; sub: string } | null;
  /** THE RECAP (server recap.ts): every few minutes, where things stand; a key so it fades in fresh */
  recap: { key: number; title: string; text: string } | null;
  /** WHAT THEY DECIDED (phase 4): one choice the AI made, with their reason — the one on camera first */
  decided: { key: string; name: string; did: string; reason: string } | null;
  /** THE END: the card, then (after END_CARD_MS) the recap card for RECAP_CARD_MS, then the card again */
  end: EndCard | null;
  recapCard: RecapCard | null;
  /** the AI engine dropped: "Technical difficulties" over the frozen frame */
  hold: boolean;
  /** a real show's countdown before the clock starts: seconds left (null: none) */
  countdown: number | null;
  /** the title card (~5 s as the clock starts) */
  title: boolean;
  /** the followed survivor's pockets (the inventory panel) */
  followed: { name: string; colour: string; kit: string[]; bitten: boolean } | null;
  /** the minimap's dots: the survivors only (the dead stay on it, greyed; zombies never) */
  map: { who: string; colour: string; x: number; z: number; dead: boolean }[];
}

/** how long an objective's banner, the end card and the recap card stay up (ms) */
export const BANNER_MS = 6_500;
export const END_CARD_MS = 12_000;
export const RECAP_CARD_MS = 120_000;
export const TITLE_MS = 5_000;

/** THE DECIDED CAPTION: how long one is up, how fresh a decision must be to be shown, and how long a
 *  quiet one (not on camera, not social) waits after the last caption */
export const DECIDE = { MS: 7_000, FRESH_MS: 12_000, QUIET_GAP_MS: 14_000 };

export interface Subtitle { key: string; who: string; name: string; text: string }

/** how long a subtitle stays up: by its length, inside a floor and a ceiling */
export const SUB_HOLD = { PER_CHAR_MS: 60, MIN_MS: 2_600, MAX_MS: 9_500, MAX: 1, NEAR_M: 16 };
export function subHold(text: string): number {
  return Math.min(SUB_HOLD.MAX_MS, Math.max(SUB_HOLD.MIN_MS, text.length * SUB_HOLD.PER_CHAR_MS));
}

/** which side the operator starts on, per body (steady, so a body is filmed from its own side) */
const hashSide = (id: string): number => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0; return h & 1 ? 1 : -1; };

export class DirectorRun {
  readonly d = new Director();
  readonly geo = showGeo();
  mode: CamMode = "director";
  private nextBeat = 0;
  private last: Decision | null = null;
  private dipEl: HTMLElement | null = null;
  private dip: { phase: "out" | "in"; t0: number; apply: (() => void) | null } | null = null;
  private dipShown = -1;
  private prepping = new Set<string>();
  /** the fixed shot on air: where the camera stands, whom it frames, when it was framed */
  private tripod: { shot: DShot; ids: string[]; room: string | null; at: number; dist: number } | null = null;
  private card: { c: NameCard; until: number } | null = null;
  private mem: { m: Memoriam; until: number } | null = null;
  private deathsShown = 0;
  private aim = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  /** the operator's follow (null on a fixed shot): whom, which side of them, where it's easing to */
  private rig: { id: string; side: number; base: THREE.Vector3; want: THREE.Vector3; at: number; blind: number } | null = null;

  constructor(private scene: ShowScene) {
    setHouseWords(MAP_ID !== "bunker");
    this.d.doorAt = (id) => placeOf(id)?.centre ?? null;
    scene.onFrameIn = (f) => this.feed(f);
    scene.beforeCamera = (dt) => this.frame(dt);
  }

  setDip(el: HTMLElement | null): void { this.dipEl = el; this.dipShown = -1; }

  setMode(m: CamMode): void {
    this.mode = m;
    const cam = this.scene.cam;
    cam.tripod = null;
    cam.controls.enabled = m !== "director";
    if (m === "free") cam.follow = null;
    this.tripod = null;
    this.rig = null;
    if (m === "director" && this.last?.target) this.shoot(this.last, true);
  }

  private goalsNow: Goals | null = null;
  private ban: { b: NonNullable<Broadcast["banner"]>; until: number } | null = null;
  /** banners waiting their turn (two goals can land in the same second) */
  private banQ: NonNullable<Broadcast["banner"]>[] = [];
  private doneSeen = new Set<string>();
  private endSeenAt = 0;
  private holding = false;
  private countdownEnd = 0;
  private titleUntil = 0;
  private cap: { r: NonNullable<Broadcast["recap"]>; until: number } | null = null;
  private dec: { r: NonNullable<Broadcast["decided"]>; until: number } | null = null;
  private decSeen = new Set<string>();
  private decLast = 0;
  /** The next DECIDED caption: the subject on camera's newest, else a turn on somebody / a theft / a
   *  gift, else — after a quiet spell — anybody's newest. Each is shown once. */
  private nextDecision(now: number, target: string | null, other: string | null): void {
    const fresh = this.d.decisions.filter((x) => now - x.at < DECIDE.FRESH_MS && !this.decSeen.has(`${x.id}:${x.at}`));
    if (!fresh.length) return;
    const pick = [...fresh].reverse().find((x) => x.id === target || x.id === other)
      ?? [...fresh].reverse().find((x) => x.social)
      ?? (now - this.decLast > DECIDE.QUIET_GAP_MS ? fresh[fresh.length - 1] : undefined);
    if (!pick) return;
    const key = `${pick.id}:${pick.at}`;
    this.decSeen.add(key);
    if (this.decSeen.size > 64) this.decSeen = new Set([...this.decSeen].slice(-32));
    const shown = decisionShown(this.d.bodies.get(pick.id), pick);
    if (!shown) return;
    this.decLast = now;
    this.dec = { r: { key, name: nameOf(pick.who), did: shown.did, reason: shown.reason }, until: now + DECIDE.MS };
  }
  feed(f: ScreenFrame): void {
    const now = performance.now();
    if (f.type === "recap") {
      const text = String(f.text ?? "").slice(0, 300);
      if (text) this.cap = { r: { key: now, title: String(f.title ?? "RIGHT NOW").slice(0, 60), text }, until: now + Math.min(30_000, Math.max(6_000, Number(f.ms) || 16_000)) };
      return;
    }
    if (f.type === "hold") { this.holding = f.on === true; return; }
    if (f.type === "countdown") {
      const ms = Math.max(0, Number(f.ms) || 0);
      // the countdown over: the title card as the clock starts
      if (!ms && this.countdownEnd) this.titleUntil = now + TITLE_MS;
      this.countdownEnd = ms ? now + ms : 0;
      return;
    }
    // A NEW RUN (a reset, a server restart): every card is the old run's
    if (f.type === "snap" && runChanged(this.d.run, runOf(f))) this.newRun();
    if ((f.type === "snap" || f.type === "tick") && f.goals) this.goalsIn(f.goals, f.type === "snap", now);
    if (f.type === "snap" && f.goals && !this.countdownEnd && f.t - f.goals.startedAt < 3_000) this.titleUntil = now + TITLE_MS;
    if (f.type === "offair") { this.goalsNow = null; this.holding = false; this.countdownEnd = 0; }
    this.d.feed(f, this.scene.serverNow());
  }

  /** the objectives in: a goal done since the last frame gets its banner ("DOOR SEALED — Rick, 0:42:10"); a
   *  snapshot only marks what's already done (a watcher joining late isn't shown the whole run's banners) */
  private goalsIn(g: Goals, snap: boolean, now: number): void {
    this.goalsNow = g;
    for (const o of objectiveRows(g)) {
      if (!o.done || this.doneSeen.has(o.key)) continue;
      this.doneSeen.add(o.key);
      if (snap) continue;
      const sub = [o.by ? firstName(o.by) : "", o.at ? elapsed(o.at - g.startedAt) : ""].filter(Boolean).join(", ");
      // (the house's last row is its ending: the end card says it)
      if (g.rows && o.key === "car") continue;
      this.banQ.push({ key: `${o.key}:${o.at ?? now}`, title: (g.rows ? HOUSE_BANNER[o.key] : BANNER_TITLE[o.key]) ?? o.label.toUpperCase(), sub });
    }
    if (g.over && !this.endSeenAt) this.endSeenAt = now;
  }

  /** clear everything the last run put on screen (the Director clears its own on the same frame) */
  private newRun(): void {
    this.ban = null; this.banQ = []; this.doneSeen.clear(); this.endSeenAt = 0; this.holding = false; this.countdownEnd = 0; this.titleUntil = 0;
    this.card = null; this.mem = null; this.cap = null; this.dec = null; this.decSeen.clear();
    this.deathsShown = 0;
    this.last = null;
    this.tripod = null;
    this.rig = null;
    this.goalsNow = null;
    this.prepping.clear();
    this.scene.cam.tripod = null;
  }

  // ---- the frame ----

  private frame(dt: number): void {
    const now = performance.now();
    this.dipTick(now);
    if (now >= this.nextBeat) {
      this.nextBeat = now + BEAT_MS;
      this.beat(now);
    }
    if (this.mode === "director") this.track(dt, now);
  }

  private ready = (at: V3, room: string | null): boolean => {
    const z = roomInfo(room)?.zone ?? this.geo.roomAt(at[0], at[1] + 0.5, at[2])?.zone;
    if (!z || !this.scene.zones) return true;
    return this.scene.zones.isReady(z as never);
  };

  private beat(now: number): void {
    const dec = this.d.tick(this.scene.serverNow(), this.ready);
    // the subject on air walking toward a zone that isn't drawn: get it ready before they arrive
    const on = dec.target ? this.d.bodies.get(dec.target) : undefined;
    if (on && !this.ready(on.pos, on.room)) dec.prepare.push({ at: on.pos, room: on.room });
    for (const p of dec.prepare) {
      const z = roomInfo(p.room)?.zone ?? this.geo.roomAt(p.at[0], p.at[1] + 0.5, p.at[2])?.zone ?? "";
      if (!z || this.prepping.has(z)) continue;
      this.prepping.add(z);
      void this.scene.prepare(new THREE.Vector3(...p.at), 30_000, 10_000).finally(() => this.prepping.delete(z));
    }
    // the lower third and the in-memoriam card
    if (dec.cut === "dip" || (dec.cut === "hard" && dec.target !== this.last?.target)) {
      const tb = dec.target ? this.d.bodies.get(dec.target) : undefined;
      const who = tb && tb.pose !== "dead" ? tb.who : undefined;   // (a death gets the in-memoriam card instead)
      if (who && this.mode === "director") this.card = { c: nameCard(who), until: now + CARD_MS };
    }
    if (this.d.deaths.length > this.deathsShown) {
      this.mem = { m: memoriam(this.d.deaths[this.d.deaths.length - 1], this.goalsNow?.startedAt, ROOM_NAME), until: now + MEMORIAM_MS };
      this.deathsShown = this.d.deaths.length;
    }
    const prev = this.last;
    this.last = dec;
    if (this.mode !== "director" || !dec.target) return;
    // (the dip's cut lands on whatever is on air when the picture is black — a hard cut asked for
    // while it's going out is folded into it)
    if (dec.cut === "dip") this.startDip(() => { if (this.last?.target) { this.blockTries = 0; this.shoot(this.last, true); } });
    else if ((dec.cut === "hard" || !prev?.target) && this.dip?.phase !== "out") { this.blockTries = 0; this.shoot(dec, true); }
  }

  // ---- placing the camera ----

  private posOf(id: string): V3 | null {
    const a = this.scene.actors?.get(id);
    if (a) return [a.pos.x, a.pos.y, a.pos.z];
    return this.d.bodies.get(id)?.pos ?? null;
  }
  private headingOf(id: string): number {
    return this.scene.actors?.get(id)?.heading ?? this.d.bodies.get(id)?.heading ?? 0;
  }

  /** every other body within a wide shot's reach (the shots keep the lens off and out of the line of them) */
  private othersNear(p: V3, not: string[]): V3[] {
    const out: V3[] = [];
    const list = this.scene.actors?.list;
    if (!list) return out;
    for (const a of list.values()) {
      // (a body lying on the floor blocks no lens)
      if (not.includes(a.id) || LYING.has(a.state.pose)) continue;
      if (Math.abs(a.pos.y - p[1]) < 3 && Math.hypot(a.pos.x - p[0], a.pos.z - p[2]) < 18) out.push([a.pos.x, a.pos.y, a.pos.z]);
    }
    return out;
  }

  /** where the camera stands for a decision (null: the follow camera) */
  private poseFor(dec: Decision): Pose | null {
    const id = dec.target!;
    const p = this.posOf(id);
    if (!p) return null;
    const room = this.geo.room(this.d.bodies.get(id)?.room) ?? this.geo.roomAt(p[0], p[1] + 0.5, p[2]);
    const h = this.headingOf(id);
    const others = this.othersNear(p, [id, dec.other ?? ""]);
    // a crowded spot may have no clean angle: then a clean wide of the room, then one with nobody AT the lens
    // (somebody may be in the frame), and only then any clean-walled one (that last put the lens in among a crowd round a body
    // for forty seconds — the frame all zombie torsos)
    const wide = (o: readonly V3[]) => (dec.shot !== "wide" ? wideShot(this.geo, room, p, h, o) : null);
    const pick = (f: (o: readonly V3[]) => Pose | null) => f(others) ?? wide(others) ?? f(lensOnly(others)) ?? wide(lensOnly(others)) ?? f([]);
    switch (dec.shot) {
      case "wide": return pick((o) => wideShot(this.geo, room, p, h, o));
      case "close": return pick((o) => closeShot(this.geo, room, p, h, o));
      case "body": return pick((o) => bodyShot(this.geo, room, p, h, o));
      case "two": {
        const q = dec.other ? this.posOf(dec.other) : null;
        return q ? pick((o) => twoShot(this.geo, room, p, q, o)) : pick((o) => closeShot(this.geo, room, p, h, o));
      }
      default: return null;
    }
  }

  private shoot(dec: Decision, snap: boolean): void {
    const cam = this.scene.cam, camera = this.scene.camera;
    const id = dec.target!;
    const pose = dec.shot === "follow" ? null : this.poseFor(dec);
    if (!pose) {
      // the follow: the operator, over the shoulder (in front, three-quarter, when they're still)
      this.tripod = null;
      const a = this.scene.actors?.get(id);
      cam.follow = id;
      this.lens(SHOT_FOV.follow);
      if (!a) { this.rig = null; cam.tripod = null; return; }
      const side = this.rig?.id === id ? this.rig.side : (hashSide(id));
      const spot = this.operatorSpot(id, side, null);
      const from = new THREE.Vector3(...spot.from);
      this.rig = { id, side: spot.side, base: from.clone(), want: from.clone(), at: performance.now(), blind: 0 };
      const at = this.followAim(a);
      cam.tripod = { from: from.clone(), aim: at.clone() };
      cam.look([at.x, at.y, at.z], spot.from);
      return;
    }
    this.rig = null;
    cam.follow = null;
    const ids = dec.shot === "two" && dec.other ? [id, dec.other] : [id];
    const from = new THREE.Vector3(...pose.from);
    this.tripod = { shot: dec.shot, ids, room: this.d.bodies.get(id)?.room ?? null, at: performance.now(), dist: from.distanceTo(new THREE.Vector3(...pose.at)) };
    cam.tripod = { from, aim: new THREE.Vector3(...pose.at) };
    if (snap) cam.look(pose.at, pose.from);
    this.lens(pose.fov);
  }

  private lens(fov: number): void {
    const c = this.scene.camera;
    if (Math.abs(c.fov - fov) < 0.01) return;
    c.fov = fov;
    c.updateProjectionMatrix();
  }

  /** a fixed shot pans with its subject; one who walks out of it is re-framed (a hard cut) */
  private track(dt: number, now: number): void {
    if (this.rig) { this.operate(dt, now); return; }
    const tp = this.tripod, cam = this.scene.cam;
    if (!tp || !cam.tripod) return;
    const pts: THREE.Vector3[] = [];
    for (const id of tp.ids) {
      const a = this.scene.actors?.get(id);
      if (a) pts.push(a.chest(new THREE.Vector3()).setY(a.pos.y + (tp.shot === "body" ? 0.35 : 1.25)));
    }
    if (!pts.length) return;
    this.aim.set(0, 0, 0);
    for (const p of pts) this.aim.add(p);
    this.aim.multiplyScalar(1 / pts.length);
    cam.tripod.aim.copy(this.aim);
    // NOBODY WALKS INTO THE LENS (realism round 8): a held shot only re-framed when its subject went too far or out
    // of sight, so one walking at the camera filled the frame and then stood inside it. Checked every frame: the
    // subject inside NEAR_SUBJECT_M of the lens, or anybody at all inside NEAR_ANY_M, is a cut to a fresh shot.
    if (!this.dip && this.last?.target && now - tp.at > 400) {
      const f = cam.tripod.from;
      let near = false;
      for (const id of tp.ids) { const a = this.scene.actors?.get(id); if (a && Math.hypot(a.pos.x - f.x, a.pos.z - f.z) < NEAR_SUBJECT_M) near = true; }
      if (!near) near = this.intoLens(f, null);
      if (near) { this.shoot(this.last, true); return; }
      // SOMEBODY IN THE WAY: another body standing on the line to the subject for BLOCK_MS is a cut too (a zombie
      // stood between the lens and the bodies it showed for twenty seconds, its legs filling half the frame)
      if (this.blocked(f, this.aim, tp.ids)) { if (!this.blockSince) this.blockSince = now; else if (now - this.blockSince > BLOCK_MS && now - this.blockCut > this.blockGap()) { this.blockSince = 0; this.blockCut = now; this.blockTries++; this.shoot(this.last, true); return; } }
      else this.blockSince = 0;
      // CROWDED IN: somebody holding within CROWD_LENS_M of the lens for CROWD_MS (a shot clear when it was taken,
      // and then the dead came) is a re-take too, on the same backing-off clock
      if (this.crowdCheck(f, null, now)) { this.shoot(this.last, true); return; }
    }
    if (now - tp.at < REFRAME_MS || this.dip) return;
    const from = cam.tripod.from;
    const d = from.distanceTo(this.aim);
    const lost = !this.geo.sees([from.x, from.y, from.z], [this.aim.x, this.aim.y, this.aim.z]) || d > Math.max(16, tp.dist * 2.2) || (tp.shot !== "wide" && d > tp.dist + 2.5);
    if (lost && this.last?.target) this.shoot(this.last, true);
    else tp.at = now - REFRAME_MS + 500;   // look again in half a second
  }

  /** anybody (but `skip`) at the lens: their feet within NEAR_ANY_M of the spot on the floor, or their head, chest or
   *  hips within NEAR_LENS_M of the camera itself — a zombie leaning into a lunge has its head half a metre ahead of
   *  its feet, and walked into the lens for three and a half seconds with its feet never inside NEAR_ANY_M */
  private intoLens(f: THREE.Vector3, skip: string | null, r = NEAR_LENS_M): boolean {
    const c = this.scene.camera.position, q = this.tmp;
    for (const a of this.scene.actors?.list.values() ?? []) {
      if (a.id === skip || !a.root.visible || a.dead || Math.abs(a.pos.y - f.y) > 2.5) continue;
      const fx = a.root.position.x, fz = a.root.position.z;
      if (r <= NEAR_LENS_M && Math.hypot(fx - f.x, fz - f.z) < NEAR_ANY_M) return true;
      if (Math.hypot(fx - c.x, fz - c.z) > r + 1.5) continue;
      if (a.hips(q).distanceTo(c) < r || a.chest(q).distanceTo(c) < r || a.headPos(q).distanceTo(c) < r) return true;
    }
    return false;
  }

  /** since when somebody has stood within CROWD_LENS_M of the lens (0: nobody) */
  private crowdSince = 0;
  /** a re-take is due for a crowded lens (and counted as one against the backing-off clock) */
  private crowdCheck(f: THREE.Vector3, skip: string | null, now: number): boolean {
    if (!this.intoLens(f, skip, CROWD_LENS_M)) { this.crowdSince = 0; return false; }
    if (!this.crowdSince) { this.crowdSince = now; return false; }
    if (now - this.crowdSince < CROWD_MS || now - this.blockCut < this.blockGap()) return false;
    this.crowdSince = 0; this.blockCut = now; this.blockTries++;
    return true;
  }

  /** since when a body has stood between the lens and the subject (0: nobody) */
  private blockSince = 0;
  /** the last cut for a blocked view (a crowd can block every spot: one such cut a BLOCK_GAP_MS) */
  private blockCut = 0;
  /** re-takes for a blocked view since the director last chose a shot itself: each doubles the wait for the next
   *  (a crowd round a body on the floor blocked every spot, and the camera cut every 2.5 s, blocked every time) */
  private blockTries = 0;
  private blockGap(): number { return Math.min(BLOCK_GAP_MAX_MS, BLOCK_GAP_MS * 2 ** this.blockTries); }
  /** a standing body, not one of the subjects, on the line from the lens to the aim (within BLOCK_R of it, between them) */
  private blocked(from: THREE.Vector3, aim: THREE.Vector3, ids: readonly string[]): boolean {
    const d = new THREE.Vector3().subVectors(aim, from), L2 = d.lengthSq();
    if (L2 < 1) return false;
    const p = new THREE.Vector3();
    for (const a of this.scene.actors?.list.values() ?? []) {
      if (ids.includes(a.id) || !a.root.visible || a.dead || a.state.pose === "down" || a.state.pose === "sleep" || a.state.pose === "z-feed") continue;
      for (const y of [1.0, 1.4]) {
        p.set(a.pos.x, a.pos.y + y, a.pos.z);
        const k = p.clone().sub(from).dot(d) / L2;
        // (only the camera's side of the line: one fighting right beside the subject is the fight, not in the way
        // — those took up the re-takes, and a body halfway to the lens stood there four seconds)
        if (k < 0.08 || k > BLOCK_K) continue;
        if (p.distanceTo(from.clone().addScaledVector(d, k)) < BLOCK_R) return true;
      }
    }
    return false;
  }

  /** where the operator aims: the chest, a little high (a face in the frame, not a belt) */
  private followAim(a: NonNullable<ReturnType<NonNullable<ShowScene["actors"]>["get"]>>): THREE.Vector3 {
    const c = a.chest(this.tmp);
    return new THREE.Vector3(c.x, a.pos.y + 1.3, c.z);
  }

  /** The operator's spot for a body: behind and a quarter round on its side when it moves, in front three-quarter
   *  when it stands; the side it has first, the other side next, then straight behind, then nearer. `keep`: the
   *  spot it's easing to now, kept while it still stands clear and still sits where it should. */
  private operatorSpot(id: string, side: number, keep: THREE.Vector3 | null): { from: V3; side: number } {
    const a = this.scene.actors?.get(id)!;
    const at = this.followAim(a);
    const aim: V3 = [at.x, at.y, at.z];
    const room = this.geo.roomAt(a.pos.x, a.pos.y + 0.5, a.pos.z);
    const others = this.othersNear([a.pos.x, a.pos.y, a.pos.z], [id]);
    const moving = a.speed > 0.35;
    const fx = Math.sin(a.heading), fz = Math.cos(a.heading);
    if (keep) {
      const dx = keep.x - a.pos.x, dz = keep.z - a.pos.z, d = Math.hypot(dx, dz);
      const front = d > 0.01 ? (dx * fx + dz * fz) / d : 0;   // +1 dead in front
      const placed = moving ? front < 0.35 : front > -0.5;
      if (placed && d >= OP_MIN_M && d <= OP_DIST[0] + 1.2 && spotOk(this.geo, room, [keep.x, keep.y, keep.z], aim, others)) return { from: [keep.x, keep.y, keep.z], side };
    }
    const order = moving
      ? [[Math.PI - 0.5 * side, side], [Math.PI + 0.5 * side, -side], [Math.PI, side], [Math.PI / 2 * side, side], [-Math.PI / 2 * side, -side], [0.7 * side, side], [-0.7 * side, -side]]
      : [[0.6 * side, side], [-0.6 * side, -side], [Math.PI - 0.5 * side, side], [Math.PI + 0.5 * side, -side]];
    const y = a.pos.y + OP_H;
    for (const r of OP_DIST) for (const [dh, sd] of order) {
      const h = a.heading + dh, f: V3 = [at.x + Math.sin(h) * r, y, at.z + Math.cos(h) * r];
      if (spotOk(this.geo, room, f, aim, others)) return { from: f, side: sd };
    }
    // (none clean: a group walking in single file blocks every spot at eye height behind and ahead — up over their
    // heads, so long as nobody is AT the lens)
    const loose = lensOnly(others);
    for (const r of OP_DIST) for (const [dh, sd] of order) {
      const h = a.heading + dh, f: V3 = [at.x + Math.sin(h) * r, a.pos.y + OP_H_HIGH, at.z + Math.cos(h) * r];
      if (spotOk(this.geo, room, f, aim, loose)) return { from: f, side: sd };
    }
    // nowhere clean: the first, nearest spot that at least sees them, or straight behind
    for (const r of OP_DIST) for (const [dh, sd] of order) {
      const h = a.heading + dh, f: V3 = [at.x + Math.sin(h) * r, y, at.z + Math.cos(h) * r];
      if (spotOk(this.geo, room, f, aim)) return { from: f, side: sd };
    }
    const h = a.heading + Math.PI;
    return { from: [at.x + Math.sin(h) * OP_DIST[0], y, at.z + Math.cos(h) * OP_DIST[0]], side };
  }

  /** one frame of the operator: aim on the chest, the spot re-read now and then, the camera eased to it */
  private operate(dt: number, now: number): void {
    const rig = this.rig!, cam = this.scene.cam;
    const a = this.scene.actors?.get(rig.id);
    if (!a || !cam.tripod) return;
    const at = this.followAim(a);
    cam.tripod.aim.copy(at);
    if (now - rig.at >= OP_LOOK_MS && !this.dip) {
      rig.at = now;
      const spot = this.operatorSpot(rig.id, rig.side, rig.want);
      rig.side = spot.side;
      rig.want.set(...spot.from);
      const sees = this.geo.sees([rig.base.x, rig.base.y, rig.base.z], [at.x, at.y, at.z]);
      rig.blind = sees ? 0 : rig.blind + 1;
      // too far to ease (it would swing past them), or lost behind a wall for a moment: a cut
      if (rig.base.distanceTo(rig.want) > OP_JUMP_M || rig.blind >= 2) { rig.base.copy(rig.want); rig.blind = 0; cam.look([at.x, at.y, at.z], spot.from); }
    }
    rig.base.lerp(rig.want, 1 - Math.exp(-Math.min(dt, 0.1) * OP_EASE));
    // never nearer than OP_MIN_M on the floor: pushed straight back out
    const dx = rig.base.x - a.pos.x, dz = rig.base.z - a.pos.z, d = Math.hypot(dx, dz);
    if (d < OP_MIN_M && d > 0.01) { rig.base.x = a.pos.x + dx / d * OP_MIN_M; rig.base.z = a.pos.z + dz / d * OP_MIN_M; }
    // (somebody standing in the way for BLOCK_MS: round to the other side)
    if (!this.dip && this.blocked(rig.base, at, [rig.id])) {
      if (!this.blockSince) this.blockSince = now;
      else if (now - this.blockSince > BLOCK_MS && now - this.blockCut > this.blockGap()) {
        this.blockSince = 0; this.blockCut = now; this.blockTries++;
        const spot = this.operatorSpot(rig.id, -rig.side, null);
        rig.side = spot.side; rig.want.set(...spot.from); rig.base.copy(rig.want); rig.at = now;
        cam.look([at.x, at.y, at.z], spot.from);
      }
    } else this.blockSince = 0;
    // (somebody else walking into the operator: a cut to a fresh spot, never a lens inside a body)
    if (!this.dip && now - rig.at > 300 && (this.intoLens(rig.base, a.id) || this.crowdCheck(rig.base, a.id, now))) {
      const spot = this.operatorSpot(rig.id, -rig.side, null);
      rig.side = spot.side; rig.want.set(...spot.from); rig.base.copy(rig.want); rig.at = now;
      cam.look([at.x, at.y, at.z], spot.from);
    }
    const t = now / 1000;
    cam.tripod.from.set(rig.base.x + Math.sin(t * 0.37) * OP_SWAY, rig.base.y + Math.sin(t * 0.53 + 1) * OP_SWAY * 0.6, rig.base.z + Math.cos(t * 0.31) * OP_SWAY);
  }

  // ---- the dip ----

  private startDip(apply: () => void): void {
    if (this.dip && this.dip.phase === "out") { this.dip.apply = apply; return; }
    if (!this.dipEl) { apply(); return; }
    this.dip = { phase: "out", t0: performance.now(), apply };
  }

  private dipTick(now: number): void {
    let o = 0;
    const d = this.dip;
    if (d) {
      if (d.phase === "out") {
        o = Math.min(1, (now - d.t0) / DIP_OUT_MS);
        if (o >= 1) { d.apply?.(); d.apply = null; d.phase = "in"; d.t0 = now; }
      } else {
        o = 1 - Math.min(1, (now - d.t0) / DIP_IN_MS);
        if (o <= 0) this.dip = null;
      }
    }
    const q = Math.round(o * 50) / 50;
    if (this.dipEl && q !== this.dipShown) { this.dipEl.style.opacity = String(q); this.dipShown = q; }
  }

  // ---- for the overlay (read on its own timer) ----

  /** The lines still up, one per speaker, those in shot only (the target, the other, or near the
   *  target on its floor); the free camera shows everyone's. The one on air first. */
  private subs(now: number, target: string | null, other: string | null): Subtitle[] {
    const at = target ? this.d.bodies.get(target)?.pos : undefined;
    const inShot = (id: string): boolean => {
      if (this.mode === "free" || !target || id === target || id === other) return true;
      const p = this.d.bodies.get(id)?.pos;
      return !!(p && at && Math.abs(p[1] - at[1]) < 3 && Math.hypot(p[0] - at[0], p[2] - at[2]) <= SUB_HOLD.NEAR_M);
    };
    // (a line off shot still shows, after those in it: the talk IS the show, and a camera that
    // hasn't cut yet must not swallow what was said — Josh, Oct 28 2026: "none of them are talking")
    const by = new Map<string, (typeof this.d.lines)[number]>();
    // a voiced line holds its subtitle for as long as it's being said (and a beat)
    // (REALISM.md: "subtitles: speaker and line, one at a time, timed to the voice")
    for (const l of this.d.lines) if (now - l.at < (l.ms ? l.ms + 300 : subHold(l.text))) by.set(l.id, l);
    const rank = (id: string) => (id === target ? 0 : inShot(id) ? 1 : 2);
    return [...by.values()]
      .sort((a, b) => rank(a.id) - rank(b.id) || b.at - a.at)
      .slice(0, SUB_HOLD.MAX)
      .map((l) => ({ key: `${l.id}:${l.at}`, who: l.who, name: nameOf(l.who), text: l.text }));
  }

  broadcast(): Broadcast {
    const now = performance.now();
    const t = this.scene.serverNow();
    // (a lower third on somebody who has just died gives way: the in-memoriam card is theirs now)
    if (this.card && (now > this.card.until || this.d.deaths.some((x) => x.who === this.card!.c.who))) this.card = null;
    if (this.mem && now > this.mem.until) this.mem = null;
    if (this.ban && now > this.ban.until) this.ban = null;
    if (!this.ban && this.banQ.length) this.ban = { b: this.banQ.shift()!, until: now + BANNER_MS };
    if (this.cap && now > this.cap.until) this.cap = null;
    if (this.dec && now > this.dec.until) this.dec = null;
    const air = this.d.onAir();
    if (!this.dec) this.nextDecision(now, this.mode === "follow" ? this.scene.cam.follow : air.target, air.other);
    const g = this.goalsNow;
    const rows = castRows(this.d.bodies.values(), this.d.thoughts, this.d.goals, this.d.simT ?? undefined);
    // THE END: the card, then the recap card for two minutes, then the card again
    const sinceEnd = this.endSeenAt ? now - this.endSeenAt : -1;
    const showRecap = !!g?.over && sinceEnd >= END_CARD_MS && sinceEnd < END_CARD_MS + RECAP_CARD_MS;
    const fid = this.mode === "follow" ? this.scene.cam.follow : null;
    const fr = fid ? rows.find((r) => r.id === fid) : undefined;
    const map: Broadcast["map"] = [];
    for (const b of this.d.bodies.values()) {
      if (b.kind !== "survivor" || !b.who || b.escaped) continue;
      map.push({ who: b.who, colour: colourOf(b.who), x: b.pos[0], z: b.pos[2], dead: isDeadBody(b) });
    }
    const quiet = !!(this.ban || this.mem || g?.over);
    return {
      rows,
      card: this.mode === "director" && !g?.over ? this.card?.c ?? null : null,
      memoriam: g?.over ? null : this.mem?.m ?? null,
      subs: this.subs(t, this.mode === "follow" ? this.scene.cam.follow : air.target, air.other),
      mode: this.mode,
      onAir: { target: air.target, shot: air.shot, reason: air.reason, pending: this.last?.pending ?? null },
      goals: g,
      objectives: g ? objectiveRows(g) : [],
      remaining: g ? elapsed((g.endedAt ?? (this.countdownEnd ? g.startedAt : t)) > 0 ? g.endsAt - (g.endedAt ?? (this.countdownEnd ? g.startedAt : t)) : 0) : null,
      banner: g?.over ? null : this.ban?.b ?? null,
      recap: quiet ? null : this.cap?.r ?? null,
      decided: quiet ? null : this.dec?.r ?? null,
      end: g && !showRecap ? endCard(g, brandInPlay().title) : null,
      recapCard: g && showRecap ? recapCard(g, rows, this.d.deaths, ROOM_NAME, brandInPlay().title) : null,
      hold: this.holding,
      countdown: this.countdownEnd > now ? Math.ceil((this.countdownEnd - now) / 1000) : null,
      title: now < this.titleUntil,
      followed: fr && !fr.dead ? { name: fr.name, colour: fr.colour, kit: fr.kit, bitten: fr.bitten } : null,
      map,
    };
  }
}
