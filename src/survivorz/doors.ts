// SOLACE SURVIVORZ — who gets through which door in THE BUNKER, and the state that decides it
// (docs/survivorz/BUNKER.md). The server is the authority; a client only ever asks.
//
// Pure and clock-injected (the harness drives it on a fake clock), imports only facility.ts. It knows
// nothing of positions beyond "which room". An action that needs somebody present takes the room they're in
// (`at`) and refuses if it's wrong.
//
// THE RULES, in one place:
//   · the inside doors are hinged steel: a survivor opens or shuts one; THE DEAD PUSH AN UNLOCKED ONE OPEN
//     (BUNKER.md follow-up 13 — a shut door slows them, it doesn't stop them). Nothing breaks a steel door;
//   · the ARMORY opens with the security office's keycard and can't be forced (35, 36);
//   · the RADIO ROOM opens with the four-digit code on a note somewhere in the bunker (the keypad, 29);
//   · the BLAST DOOR stands open from the breach until somebody cranks it shut — then it is SEALED FOR
//     GOOD (objective 1; 23). Nothing opens it again;
//   · the bunker has power throughout (10): no breakers, no dark zones.
import {
  doorMaterial,
  doorPlacement,
  roomCentre,
  type DoorMaterial,
  type Door,
  type Facility,
  type Room,
  type ZoneId,
} from "./facility";

export type Actor =
  | { kind: "survivor"; nimble: number; keycard: number; crowbar?: boolean; /** knows the radio room's code */ code?: boolean;
      /** their Lockpicking (cast/rules.ts SKILL_INFO): at LOCKPICK_MIN or more a card or code lock can be picked */
      lockpick?: number }
  | { kind: "zombie"; type: "outside" | "experiment" };

/** THE LEAST LOCKPICKING that can open a card or code lock without the card or code (Nov 5 2026, the skills
 *  round: anyone with the skill gets a slow way through; the card and the code stay the quick way). */
export const LOCKPICK_MIN = 4;

/** One cell of the existing hearing numbers is 2 m (SURVIVORZ.md §8). */
export const CELL_M = 2;
export const NOISE = { forcedDoor: 12, hammering: 15, banging: 12 } as const;
export const DOOR_HEALTH = 300;

export interface DoorState {
  open: boolean;
  locked: boolean;
  broken: boolean;
  health: number;
  /** kept for the wire's shape (DoorWire.planks): the bunker has no barricades (BUNKER.md follow-up 14) */
  barricade: number;
}

export interface Result {
  ok: boolean;
  why?: string;
  /** how far it carries, in cells, when it makes a noise */
  noise?: number;
  /** what happened, for the bus and the effects ("door.open", "door.sealed") */
  event?: string;
  /** the payload every observer draws the same thing from (EFFECTS.md section 2) */
  fx?: FxEvent;
  /** it gives only to a picked lock (no card, no code: the survivor's Lockpicking) */
  picked?: boolean;
}

/** One effects payload. The server picks the seed ONCE and sends it to everybody; `t` is the server's
 *  clock so a late joiner can fast-forward an effect already under way. */
export interface FxEvent {
  event: string;
  seed: number;
  t: number;
  /** world metres (x east, y up, z south): the door's centre, or a room's */
  at?: [number, number, number];
  door?: string;
  /** the door's facing: from room a into room b */
  normal?: [number, number, number];
  size?: [number, number];
  material?: DoorMaterial;
  /** the actor's side along the normal: -1 standing in room a, +1 in room b */
  side?: 1 | -1;
  lastHp?: number;
  room?: string;
  zone?: ZoneId;
  on?: boolean;
}

/** A uint32 for a seed, from the platform's crypto. */
export function randomSeed(): number {
  return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
}

const no = (why: string, extra: Partial<Result> = {}): Result => ({ ok: false, why, ...extra });
const yes = (extra: Partial<Result> = {}): Result => ({ ok: true, ...extra });

export class FacilityWorld {
  readonly doors = new Map<string, DoorState>();
  /** the blast door cranked shut: sealed for good (objective 1) */
  sealed = false;
  private rooms = new Map<string, Room>();
  private byId = new Map<string, Door>();

  constructor(readonly map: Facility, private now: () => number = Date.now, private seed: () => number = randomSeed) {
    for (const r of map.rooms) this.rooms.set(r.id, r);
    for (const d of map.doors) this.byId.set(d.id, d);
    this.reset();
  }

  reset(): void {
    this.doors.clear();
    // every inside door starts SHUT except the doorways; the blast door stands open (the breach)
    for (const d of this.map.doors) this.doors.set(d.id, { open: d.kind === "doorway" || d.kind === "vault" || d.kind === "window", locked: false, broken: false, health: DOOR_HEALTH, barricade: 0 });
    this.sealed = false;
    this.bolted.clear();
  }

  // ---- questions ------------------------------------------------------------
  /** the bunker is lit throughout (10) */
  hasPower(_z: ZoneId): boolean { return true; }

  /** the blast door stands open until it's cranked shut */
  vaultOpen(): boolean { return !this.sealed; }

  door(id: string): Door | undefined { return this.byId.get(id); }
  room(id: string): Room | undefined { return this.rooms.get(id); }

  /** Could this actor get through right now — opening it if they're allowed to? */
  canPass(actor: Actor, doorId: string): Result {
    const d = this.byId.get(doorId);
    const s = this.doors.get(doorId);
    if (!d || !s) return no("no_door");
    const z = actor.kind === "zombie";
    switch (d.kind) {
      case "doorway":
        return yes();
      case "door":
      case "sealed":
        if (s.open || s.broken) return yes();
        // BOLTED FROM INSIDE (Glenridge Hall's front door): shut against the dead, and the living draw the bolt
        if (s.locked && this.bolted.has(doorId)) return z ? no("locked") : yes();
        if (s.locked) return no("locked");
        return yes();          // a survivor opens it; one of the dead pushes it open (follow-up 13)
      case "keycard":
        if (s.open) return yes();
        if (z) return no("steel");
        return actor.keycard >= (d.tier ?? 1) ? yes() : (actor.lockpick ?? 0) >= LOCKPICK_MIN ? yes({ picked: true }) : no("needs_card");
      case "keypad":
        if (s.open) return yes();
        if (z) return no("steel");
        return actor.code ? yes() : (actor.lockpick ?? 0) >= LOCKPICK_MIN ? yes({ picked: true }) : no("needs_code");
      case "vault":
        return this.sealed ? no("sealed_shut") : yes();
      // a broken window: the dead climb through while it stands open; boarded, nothing passes
      case "window":
        return z && s.open ? yes() : no(z ? "boarded" : "window");
      // floor that opens (the hearth stone): a way once it has been opened, and not before
      case "grate":
        return s.open ? yes() : no("closed");
      default:
        return no("closed");
    }
  }

  /** May this actor be in this room at all? */
  mayEnter(_actor: Actor, roomId: string): boolean { return this.rooms.has(roomId); }

  /** The rooms an actor can get to from `from`, as things stand. */
  reachable(actor: Actor, from: string): Set<string> {
    const seen = new Set<string>([from]);
    const queue = [from];
    while (queue.length) {
      const at = queue.shift()!;
      for (const d of this.map.doors) {
        const other = d.a === at ? d.b : d.b === at ? d.a : null;
        if (!other || seen.has(other) || !this.mayEnter(actor, other) || !this.canPass(actor, d.id).ok) continue;
        seen.add(other);
        queue.push(other);
      }
    }
    return seen;
  }

  // ---- the effects payload ----------------------------------------------------
  private fx(event: string, extra: Partial<FxEvent> = {}): { event: string; fx: FxEvent } {
    const out: FxEvent = { event, seed: this.seed() >>> 0, t: this.now(), ...extra };
    if (out.door) {
      const p = doorPlacement(this.map, out.door);
      const d = this.byId.get(out.door);
      if (p) { out.at = p.centre; out.normal = p.normal; out.size = p.size; }
      if (d) out.material = doorMaterial(d);
    } else if (out.room && !out.at) {
      const c = roomCentre(this.map, out.room);
      if (c) out.at = c;
    }
    return { event, fx: out };
  }

  private sideOf(d: Door, at: string): 1 | -1 { return at === d.a ? -1 : 1; }

  // ---- actions --------------------------------------------------------------
  private present(doorId: string, at: string): Door | null {
    const d = this.byId.get(doorId);
    return d && (d.a === at || d.b === at) ? d : null;
  }

  open(actor: Actor, doorId: string, at: string): Result {
    const d = this.present(doorId, at);
    if (!d) return no("not_here");
    const s = this.doors.get(doorId)!;
    const can = this.canPass(actor, doorId);
    if (!can.ok) return can;
    if (d.kind === "doorway" || d.kind === "vault") return yes();
    if (s.open) return yes();
    s.locked = false;
    s.open = true;
    this.bolted.delete(doorId);
    const ev = can.picked ? "door.open" : d.kind === "keycard" ? "door.keycard" : d.kind === "keypad" ? "keypad.ok" : actor.kind === "zombie" ? "door.pushed" : "door.open";
    return yes({ ...this.fx(ev, { door: doorId, side: this.sideOf(d, at) }), ...(can.picked ? { picked: true } : {}) });
  }

  close(actor: Actor, doorId: string, at: string): Result {
    const d = this.present(doorId, at);
    if (!d) return no("not_here");
    if (actor.kind === "zombie") return no("zombie");
    const s = this.doors.get(doorId)!;
    // (a leaf on hinges only: this would have shut a broken window, or put the hearth stone back, the review's B-9)
    if (d.kind === "doorway" || d.kind === "vault" || d.kind === "window" || d.kind === "grate" || s.broken) return no("nothing_to_close");
    if (!s.open) return no("shut");
    s.open = false;
    return yes(this.fx("door.close", { door: doorId, side: this.sideOf(d, at) }));
  }

  /** A zombie hits a door it can't push (the armory, the radio room): steel only makes a noise — that's
   *  what draws the rest. */
  hit(actor: Actor, doorId: string, at: string, _damage: number): Result {
    const d = this.present(doorId, at);
    if (!d) return no("not_here");
    if (actor.kind !== "zombie") return no("not_a_zombie");
    const s = this.doors.get(doorId)!;
    if (s.open || s.broken || d.kind === "doorway") return no("nothing_to_hit");
    return no("steel", { noise: NOISE.banging, ...this.fx("door.banged", { door: doorId, side: this.sideOf(d, at) }) });
  }

  /** a door's kind (the wire asks: a window's boards are counted, not weighed) */
  kindOf(doorId: string): string | undefined { return this.byId.get(doorId)?.kind; }

  /** doors bolted from inside: shut to the dead, opened by the living (who then leave it open: it must be bolted again) */
  bolted = new Set<string>();
  /** SHUT AND BOLT a door from inside (Glenridge Hall, "close it and lock it"). */
  bolt(doorId: string): Result {
    const d = this.byId.get(doorId), s = this.doors.get(doorId);
    if (!d || !s || d.kind !== "door" || s.broken) return no("nothing_to_bolt");
    // (a door already shut is only bolted: no leaf moves, so nothing is heard to close)
    const wasOpen = s.open;
    s.open = false; s.locked = true; this.bolted.add(doorId);
    return yes({ noise: 6, ...(wasOpen ? this.fx("door.close", { door: doorId, side: 1 }) : {}) });
  }
  /** BOARD a broken window: nothing comes through it again. */
  board(doorId: string): Result {
    const d = this.byId.get(doorId), s = this.doors.get(doorId);
    if (!d || !s || d.kind !== "window" || !s.open) return no("nothing_to_board");
    s.open = false; s.locked = true; s.barricade = 3;
    return yes({ noise: NOISE.hammering, ...this.fx("window.boarded", { door: doorId, side: -1 }) });
  }
  /** Open floor that was shut (the hearth stone, once the four crests are set). */
  unseat(doorId: string): Result {
    const d = this.byId.get(doorId), s = this.doors.get(doorId);
    if (!d || !s || d.kind !== "grate" || s.open) return no("nothing_to_open");
    s.open = true;
    return yes({ noise: 14, ...this.fx("secret.open", { door: doorId, side: -1 }) });
  }

  /** THE BLAST DOOR, CRANKED SHUT (objective 1): sealed for good. */
  seal(): Result {
    if (this.sealed) return no("already_sealed");
    const d = this.map.doors.find((x) => x.kind === "vault");
    if (!d) return no("no_door");
    this.sealed = true;
    this.doors.get(d.id)!.open = false;
    return yes({ noise: 25, ...this.fx("door.sealed", { door: d.id }) });
  }

  /** The whole state, for the Watch page and a save. */
  snapshot() {
    return { sealed: this.sealed, doors: Object.fromEntries([...this.doors].map(([id, st]) => [id, { ...st }])) };
  }
}
