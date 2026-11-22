// SOLACE SURVIVORZ — THE SHOW: what each event DOES on screen. One function, one switch.
//
// The wire's events already speak the effects' and the sound's vocabulary (wire.ts: "a screen
// hands an Ev to SoundEngine.cue() and ShowFx.event() with no translation table in between"), so
// every event goes to both as it is. What this adds is what neither of them can know: WHO — the
// body that swung plays its swing, the one it hit flinches and bleeds there, a gunshot's flash
// comes out of the gun in that survivor's hand, a death is that body falling — and WHERE, when an
// event carries no place of its own.
import * as THREE from "three";
import { effects, type FxSystem, type ShowFx, type ShowEvent } from "../fx";
import type { SoundEngine } from "../audio/engine";
import type { Ev } from "../../../../src/survivorz/sim/wire";
import type { Actor, Actors } from "./actors";
import type { ShowDoors } from "./doors";
import type { FacilityZones } from "./zones";
import type { Pairs } from "./pairs";
import { RISE, SHOVE, TOOLS, NOTE, WORK } from "./stance";
import { MAP_ID, roomAt, zonesInPlay, type SiteZone } from "./site";

/** A HOUSE'S OWN EVENTS (Glenridge Hall, src/survivorz/sim/scenarios/glenridge.ts), said in the words the effects
 *  and the sound already know: a window boarded is a door barricaded, the dead beating on the boards a door banged. */
// (boards knocked off are a door HIT down to no planks: that is the event that breaks them — a bang only rattles
// them, and the dead then came through a window still drawn boarded. The review, Nov 13 2026.)
const HOUSE_EV: Record<string, string> = { "window.boarded": "door.barricade", "window.banged": "door.banged", "window.broken": "door.hit" };
/** boarding is heard a blow at a time, not once a sim-second from every pair of hands */
const HAMMER_GAP_MS = 1500;
let lastHammer = 0;
import { SUITED_CAST } from "./overlay";

export interface BridgeCtx {
  fx: FxSystem;
  show: ShowFx;
  actors: Actors;
  doors: ShowDoors;
  zones: FacilityZones;
  sound: () => SoundEngine | null;
  /** the scene these belong to has been put away: an event held back for its clip (a blow, a stomp, a late sound)
   *  is dropped instead of being played on it up to a second later */
  gone?: () => boolean;
  /** the shot on camera was a fight (the score) */
  fighting: (at: THREE.Vector3) => void;
  /** the two-body moves (a grab, a bite, a rescue): they play the bodies for those events */
  pairs?: Pairs;
}

/** A SOUND LANDS WITH WHAT YOU SEE (Nov 12 2026 — Josh: "desynced sounds… for all sounds that correspond to an
 *  action"). The event's sound and its clip used to start together, and the clips don't do the thing at 0 s:
 *  measured (scripts/survivorz/review/clip-moments.mjs), a light swing's hand is fastest 0.23 s in while the sim
 *  lands the blow 0.40–0.45 s after the swing (the hit, its blood and the flinch came 0.2 s after the visible
 *  contact); the knife's stab clip strikes 1.10 s in and was started ON the hit; a zombie's arm lands 0.8–1.0 s
 *  into its attack while the scratch was heard at once; a box is reached for 0.5 s in, a can is opened 0.95 s in,
 *  a stomp's foot lands at 0.76 s. Now: a swing's clip is timed so its strike is the sim's (the event's `ms`),
 *  and its whoosh comes just before; a clip started on the hit joins part-way in; a swipe's hit waits for the
 *  arm; a sound that belongs to a later moment of its clip plays then. (A fall's thud is the actor's own: when
 *  the hips reach the floor.) */
const SOUND_AT_MS: Record<string, number> = { "box.open": 500, "eat.can": 950 };
const WHOOSH_LEAD_MS = 110, STAB_LEAD_S = 0.12, STOMP_LEAD_S = 0.15, STOMP_LANDS_S = 0.76, ATTACK_LEAD_S = 0.3, ATTACK_WAIT_MAX_S = 0.6;
/** per zombie: when its last attack began, and how long until its arm lands */
const attacks = new WeakMap<Actor, { at: number; wait: number }>();
type Late = Ev & { late?: boolean };

/** the zombies within `m` of a point, alive (a door shut in their faces is held shut) */
function zombieNear(c: BridgeCtx, at: THREE.Vector3, m: number): boolean {
  for (const a of c.actors.list.values()) if (a.kind === "zombie" && !a.dead && a.pos.distanceToSquared(at) < m * m) return true;
  return false;
}

const v3 = (a?: unknown): THREE.Vector3 | null => (Array.isArray(a) && a.length === 3 && a.every((x) => typeof x === "number") ? new THREE.Vector3(a[0], a[1], a[2]) : null);

/** the floor under a point (the map's: the three floors' heights) */
function floorY(p: THREE.Vector3): number {
  const r = roomAt(p.x, p.y + 0.5, p.z);
  return r && (r.room.spans ?? 1) === 1 ? r.fy : p.y;
}

export function handleEvent(c: BridgeCtx, ev: Late): void {
  if (c.gone?.()) return;
  // (a window's event keeps its own SOUND — cues.ts — and is drawn as the door event the effects know)
  const heard = ev.event;
  const house = HOUSE_EV[ev.event];
  if (house) ev = { ...ev, event: house, planks: heard === "window.boarded" ? 3 : heard === "window.broken" ? 0 : ev.planks };
  if (heard === "hammer") {
    const t = performance.now();
    if (t - lastHammer < HAMMER_GAP_MS) return;
    lastHammer = t;
  }
  // the house's lights, all at once
  if (ev.event === "power.cut" || ev.event === "power.on") {
    const on = ev.event === "power.on", who = ev.by ? c.actors.get(ev.by) : undefined;
    if (who?.kind === "survivor" && !who.dead) who.playClip(TOOLS.breaker);
    c.sound()?.cue("zone.powered", { ...ev, on, house: MAP_ID !== "bunker" }, Array.isArray(ev.at) ? [ev.at[0] as number, (ev.at[1] as number) + 1.2, ev.at[2] as number] : undefined);
    for (const zone of zonesInPlay()) {
      c.show.event({ ...(ev as unknown as ShowEvent), event: "zone.powered", zone, on });
      c.zones.setPower(zone, on, c.show.at(ev.t));
    }
    return;
  }
  // the set's moving parts
  if (ev.event === "crest.set" && typeof ev.n === "number") c.doors.setProps({ crests: ev.n, ...(typeof ev.crest === "string" ? { [`crest:${ev.crest}`]: 1 } : {}) });
  if (ev.event === "car.away") c.doors.setProps({ away: 1 });
  if (ev.event === "secret.open" && typeof ev.door === "string") {
    c.doors.afterEvent(ev.door, { event: "secret.open" });
    c.sound()?.cue("secret.open", {}, Array.isArray(ev.at) ? (ev.at as [number, number, number]) : undefined);
    if (Array.isArray(ev.at)) c.fx.shake(new THREE.Vector3(ev.at[0] as number, ev.at[1] as number, ev.at[2] as number), 0.02, 5, 3.5, ev.seed >>> 0);
    return;
  }
  const by = ev.by ? c.actors.get(ev.by) : undefined;
  const victim = ev.victim ? c.actors.get(ev.victim) : undefined;
  const at = v3(ev.at) ?? (victim ?? by)?.pos.clone() ?? null;
  const name = ev.event;
  if (!ev.late) {
    // a swipe's scratch (its sound, its blood, the flinch) waits for the arm that's already swinging
    const atk = name === "survivor.hit" && by?.kind === "zombie" ? attacks.get(by) : undefined;
    if (atk && performance.now() - atk.at < 120) { setTimeout(() => handleEvent(c, { ...ev, late: true }), atk.wait * 1000); return; }
    // a stomp: the foot comes down a beat after the event, and everything with it
    if (name === "melee.stomp") { by?.play("stomp", { strikeIn: STOMP_LEAD_S, strikeAt: STOMP_LANDS_S }); setTimeout(() => handleEvent(c, { ...ev, late: true }), STOMP_LEAD_S * 1000); return; }
  }
  const swingS = name.startsWith("melee.swing") && typeof ev.ms === "number" && ev.ms > 0 ? ev.ms / 1000 : undefined;
  // ---- the sound: the event's own cue, at its place, in the survivor's own voice ----
  const fields: Record<string, unknown> = { ...ev };
  const voice = [victim, by].find((a) => a?.kind === "survivor");
  if (voice?.who) { fields.who = voice.who; fields.suited = SUITED_CAST.has(voice.who); }
  fields.house = MAP_ID !== "bunker";
  const door = typeof ev.door === "string" ? ev.door : null;
  if (door) Object.assign(fields, { ...c.doors.cueFields(door), ...fields });
  // (a voice or a blow is heard at chest height, a door at its middle, anything else just off the floor)
  const lift = name.startsWith("survivor.") || name.startsWith("zombie.") || name.startsWith("melee.") ? 1.3 : 0.5;
  const doorAt = door ? c.doors.placement(door)?.at : undefined;
  const sAt: [number, number, number] | undefined = doorAt ?? (at ? [at.x, at.y + lift, at.z] : undefined);
  const soundWait = swingS !== undefined ? Math.max(0, swingS * 1000 - WHOOSH_LEAD_MS) : SOUND_AT_MS[name] ?? 0;
  const cueName = house ? heard : name;
  if (soundWait > 0) setTimeout(() => { if (!c.gone?.()) c.sound()?.cue(cueName, fields, sAt); }, soundWait); else c.sound()?.cue(cueName, fields, sAt);

  // ---- the doors and the facility: ShowFx's own events ----
  if (name.startsWith("door.") || name.startsWith("vault.") || name === "keypad.ok" || name === "room.unsealed" || name === "safe.found") {
    const id = door ?? (name.startsWith("vault.") ? "vault" : null);
    const state = (ev.state ?? null) as Record<string, unknown> | null;
    const now = id ? c.doors.afterEvent(id, { ...ev, ...(state ?? {}), event: name }) : {};
    const place = id ? c.doors.placement(id) : null;
    c.show.event({ ...(place ?? {}), ...(ev as unknown as ShowEvent), door: id ?? undefined }, now);
    if (by?.kind === "survivor" && !by.dead) {
      const kind = (c.doors.cueFields(id ?? "") as Record<string, unknown>).kind;
      // THE TOOLS (Oct 31 2026): the card swiped through the reader, a code keyed in, the bar in the gap —
      // and a door shut in the faces of the dead is held shut with a shoulder
      if (name === "door.keycard" || (name === "door.open" && kind === "keycard")) { if (!by.playClip(TOOLS.keycard)) by.play("door"); }
      else if (name === "keypad.ok") { if (!by.playClip(TOOLS.keypad ?? TOOLS.keycard)) by.play("door"); }
      else if (name === "door.open") by.play("door");
      else if (name === "door.pried") by.playClip(TOOLS.crowbar);
      else if (name === "door.close" && zombieNear(c, by.pos, 4)) by.playClip(TOOLS["hold-door"]);
    }
    return;
  }
  switch (name) {
    case "zone.powered": {
      const zone = ev.zone as SiteZone | undefined;
      if (!zone) return;
      const on = ev.on !== false;
      // a breaker thrown by hand in the generator hall (the sandbox lever has no hand)
      if (by?.kind === "survivor" && !by.dead) by.playClip(TOOLS.breaker);
      c.show.event(ev as unknown as ShowEvent);
      c.zones.setPower(zone, on, c.show.at(ev.t));
      return;
    }
    case "zone.dip": {
      const zone = ev.zone as string | undefined;
      if (!zone) return;
      const dur = typeof ev.dur === "number" ? ev.dur : typeof ev.ms === "number" ? ev.ms / 1000 : 1.6;
      c.show.event({ ...(ev as unknown as ShowEvent), dur });
      // the battery circuit sags in a brownout too (the zones file gives it its own "zone")
      c.fx.fixtures.setDip(`${zone}:battery`, c.show.at(ev.t), dur, ev.seed ^ 0x51);
      return;
    }
    case "pipe.burst": case "thing.fell": case "fire.spread": case "fire.door":
      c.show.event({ ...(ev as unknown as ShowEvent), floorY: at ? floorY(at) : undefined });
      return;
  }

  // ---- the bodies ----
  const seed = ev.seed >>> 0;
  // the two-body moves first: a grab, a bite in a hold, a rescue, a knife in a hold (show/pairs.ts)
  const paired = c.pairs?.event(ev) ?? false;
  if (name.startsWith("gun.")) {
    if (!by) return;
    if (name === "gun.dry") return;
    if (name.startsWith("gun.reload")) { by.play("reload"); return; }
    by.play("shoot");
    c.fighting(by.pos);
    // the flash and the brass out of the gun in the hand (its matrix this frame)
    const gun = c.actors.gunId(by) ?? (name === "gun.shotgun" ? "shotgun" : name === "gun.rifle" ? "hk416" : "pistol");
    const fy = floorY(by.pos);
    let matrix = by.gunMatrix;
    if (!by.hasGun) {
      // no gun drawn (still loading): from the chest toward the target
      const from = by.chest(new THREE.Vector3()).addScaledVector(by.forward(new THREE.Vector3()), 0.4);
      const to = v3(ev.to) ?? from.clone().add(by.forward(new THREE.Vector3()));
      matrix = new THREE.Matrix4().lookAt(to, from, new THREE.Vector3(0, 1, 0)).setPosition(from);
    }
    c.fx.play(effects.gunShot, { gun, matrix: matrix.clone(), floorY: fy }, seed);
    const muzzle = new THREE.Vector3().setFromMatrixPosition(matrix);
    // where it went: into the one it hit, or on into whatever stands behind
    if (victim) {
      const hitAt = ev.part === "head" ? victim.headPos(new THREE.Vector3()) : victim.chest(new THREE.Vector3());
      const dir = hitAt.clone().sub(muzzle).normalize();
      c.fx.play(effects.bulletImpact, { surface: "flesh", pos: hitAt, normal: dir.clone().negate(), dir, floorY: floorY(victim.pos), blood: victim.kind === "zombie" ? "zombie" : "human" }, seed + 1);
      wound(victim, "bullet", hitAt, seed, dir);
      if (victim.kind === "zombie" && !victim.dead) victim.play(ev.part === "head" ? "hit.head" : "zhit");
      if (victim.kind === "survivor" && !victim.dead) victim.play("hit");
    } else {
      const to = v3(ev.to)?.setY((v3(ev.to)?.y ?? 0) + 1.1);
      const dir = to ? to.sub(muzzle).normalize() : new THREE.Vector3(0, 0, 1).transformDirection(matrix);
      const h = c.fx.hit(muzzle, dir, 40);
      if (h) c.fx.play(effects.bulletImpact, { surface: "concrete", pos: h.point, normal: h.normal, dir, floorY: floorY(h.point) }, seed + 1);
    }
    return;
  }
  switch (name) {
    case "melee.swing.light": by?.play("swing.light", { strikeIn: swingS }); if (by) c.fighting(by.pos); return;
    case "melee.swing.heavy": by?.play("swing.heavy", { strikeIn: swingS }); if (by) c.fighting(by.pos); return;
    case "melee.hit": case "melee.hit.head": case "melee.stab": case "melee.stomp": {
      if (name === "melee.stab" && !paired) by?.play("stab", { strikeIn: STAB_LEAD_S });
      if (!victim) return;
      const head = name === "melee.hit.head" || ev.part === "head";
      const hitAt = head ? victim.headPos(new THREE.Vector3()) : victim.chest(new THREE.Vector3());
      const dir = by ? hitAt.clone().sub(by.chest(new THREE.Vector3())).setY(0).normalize() : victim.forward(new THREE.Vector3()).negate();
      const weapon = String(ev.weapon ?? "fists");
      const kind = name === "melee.stomp" ? "stomp" : name === "melee.stab" || /knife|machete|axe/.test(weapon) ? "sharp" : "blunt";
      c.fx.play(effects.meleeHit, { pos: hitAt, dir, weapon: kind, amount: head ? 0.8 : 0.5, floorY: floorY(victim.pos), kind: victim.kind === "zombie" ? "zombie" : "human" }, seed);
      wound(victim, kind === "sharp" ? "slash" : kind === "stomp" ? "stomp" : "blunt", hitAt, seed, dir);
      if (!victim.dead && !c.pairs?.holding(victim)) victim.play(victim.kind === "zombie" ? "zhit" : head ? "hit.head" : "hit");
      c.fighting(victim.pos);
      return;
    }
    case "zombie.attack": {
      if (!by) return;
      // (its arm lands ATTACK_LEAD_S from now; in its attack loop already, whenever the loop next gets there)
      const wait = by.play("attack", { strikeIn: ATTACK_LEAD_S });
      attacks.set(by, { at: performance.now(), wait: wait !== undefined && wait <= ATTACK_WAIT_MAX_S ? wait : ATTACK_LEAD_S });
      c.fighting(by.pos);
      return;
    }
    case "zombie.feed": {
      if (by?.cut && victim) by.cut.look.feed(seed);
      return;
    }
    case "zombie.death": {
      if (!victim) return;
      victim.play("death");
      const dir = by ? victim.pos.clone().sub(by.pos).setY(0).normalize() : new THREE.Vector3(0, 0, 1);
      const sever = () => { if (c.gone?.()) return; if (ev.part === "head" || (typeof ev.part === "string" && ev.part.includes("."))) c.actors.sever(victim, ev.part as string, dir, floorY(victim.pos), seed); };
      // (a knife in a hold lands later than the blow: the head goes when the blade does)
      const wait = c.pairs?.deathDelay(victim) ?? 0;
      if (wait > 0) setTimeout(sever, wait); else sever();
      return;
    }
    case "survivor.grabbed": case "survivor.bitten": case "survivor.hit": {
      if (!victim) return;
      const hitAt = victim.chest(new THREE.Vector3());
      const dir = by ? hitAt.clone().sub(by.chest(new THREE.Vector3())).setY(0).normalize() : new THREE.Vector3(0, 0, 1);
      if (name !== "survivor.grabbed") {
        c.fx.play(effects.meleeHit, { pos: hitAt, dir, weapon: "claw", amount: name === "survivor.bitten" ? 0.7 : 0.3, floorY: floorY(victim.pos), kind: "human" }, seed);
        wound(victim, name === "survivor.bitten" ? "bite" : "scratch", hitAt, seed, dir);
      }
      if (!victim.dead && !paired && !c.pairs?.holding(victim)) victim.play(name === "survivor.bitten" ? "bitten" : "hit");
      c.fighting(victim.pos);
      return;
    }
    case "survivor.effort": {
      // A SHOVE (survivor.effort carries the zombie shoved off): both hands into its chest and away — the
      // zombie's half is the stagger the sim gives it. A rescue's pull-off is the pairs' (above).
      if (!paired && by && !by.dead && typeof ev.shove === "string") { by.playClip(SHOVE.clip, { from: SHOVE.from, to: SHOVE.to, fadeIn: 0.12, fadeOut: 0.35 }); c.fighting(by.pos); }
      return;
    }
    case "survivor.down": victim?.play("fall"); return;
    // THE TURN, the collapse: stage 5 drops them where they stand, and they lie as they fell
    // (out cold: the fall isn't held propped on the hands — actors.ts limp)
    case "survivor.dying": if (victim && !victim.dead) { victim.play("fall"); victim.limp = true; } return;
    // THE TURN, the rise: one of the dead, in their own body, getting up off the floor where they lay
    case "survivor.turned": by?.turnRise(RISE[0], RISE[1]); return;
    // READING: the keys of a terminal, a sheet held up and read, a tape listened to — for as long as the
    // sim keeps them at it (their pose stays "search": the loop ends the moment it moves on)
    case "terminal.boot": case "terminal.type": if (by && !by.dead) by.setForced(WORK.terminal[0], 120_000, false, "search"); return;
    case "paper": if (by && !by.dead) by.setForced(NOTE, 120_000, false, "search"); return;
    case "recorder.play": if (by && !by.dead) by.setForced(WORK.listen[0], 180_000, false, "search"); return;
    case "keypad.ok": if (by && !by.dead) by.playClip(TOOLS.keypad); return;
    case "survivor.dead": victim?.play("death"); c.sound()?.score.death(); return;
    case "box.open": by?.play("open-box"); return;
    case "eat.can": by?.play("can"); return;
    case "sink.fill": by?.play("sink"); return;
    case "survivor.cough": {
      by?.play("cough");
      // the infected cough blood (a suited survivor coughs behind the respirator: none)
      if (by?.look && by.state.vitals?.infected && !by.look.suited) by.look.coughedBlood(seed, 0.5);
      return;
    }
    case "inject": by?.play("inject"); return;
  }
}

/** a wound where a blow landed: a survivor's skin (BodyLook), a zombie's (its cut's look) */
function wound(a: Actor, kind: "bullet" | "blunt" | "slash" | "stomp" | "bite" | "scratch", at: THREE.Vector3, seed: number, dir: THREE.Vector3): void {
  if (a.look) a.look.wound(kind === "bite" ? "bite" : kind === "scratch" ? "scratch" : kind === "bullet" ? "bullet" : kind === "slash" ? "cut" : "bruise", at, seed);
  if (a.cut) a.cut.look.wound(kind === "bite" || kind === "scratch" ? "slash" : kind, at, seed, dir);
}
