// SOLACE SURVIVORZ — WHAT A SURVIVOR KNOWS (Josh, Oct 28 2026: "The survivors (AI) are supposed to know
// nothing and figure out what to do").
//
// THE BUNKER (Nov 2026, docs/survivorz/BUNKER.md follow-ups 5-7): they have lived here a few weeks, so they
// KNOW EVERY ROOM, DOOR AND CONTAINER from the start (startKnowledge) — what they don't know is what's in a
// container until it's searched, that the radio needs a part until somebody looks at it, the radio room's
// code until somebody reads the note, and where the others are. The rest of this file's machinery (danger,
// threats, telling each other, the facts) works as it always did.
//
// Before this file the brains were omniscient: they planned over the whole map, knew where every
// keycard, breaker, bed and tin of food was, and a FRONTIER timer handed them a new zone every 30
// hours. Now each survivor carries a KNOWLEDGE of their own and plans only with it:
//   · ROOMS — they start knowing the vault chamber they woke in and what they can see from it. A room
//     is SEEN (they can picture it, so they can plan a walk through it) once they have looked into it
//     through an open door or doorway, or seen a friend or one of the dead standing in it; it is
//     VISITED once they set foot in it.
//   · DOORS — known once seen (every door of a room they're in, within sight), with the state they
//     last saw it in. What a locked door NEEDS is known only once they've tried it, or stood close
//     enough to read its reader or its sign ("RESEARCH LABS — LEVEL 1").
//   · WHAT'S IN A ROOM — the containers, terminals, beds, the box and the breakers are seen on
//     setting foot in it; what a container HOLDS only by searching it. A keycard lying on a desk is
//     seen in its room; one on a dead man's belt within a few metres.
//   · DANGER — the dead they've seen, or heard behind a wall, make a room feel bad (it fades).
//   · THE OTHERS — where each was last seen and what they were doing.
// KNOWLEDGE IS SHARED BY TALKING: two survivors awake in the same room within SYNC_M tell each other
// everything they know (every SYNC_MS). One out alone knows only what they saw. A radio will add a
// second channel later.
//
// `factsFor(w, who)` is what the LANGUAGE MODEL is shown — what that one survivor knows and feels
// right now, as compact plain JSON (< ~1.5 KB): no ids of anything unseen, no coordinates. Its shape
// is SurvivorFacts, below. Pure and deterministic: no randomness, no clock but the sim's.
import type { ZoneId } from "../facility";
import type { SimWorld, Survivor } from "./world";
import type { SurvivorId, ZombieKind } from "./wire";
import { NEEDS } from "./tables";
import { LOCKPICK_MIN } from "../doors";
import { nodeOf, roomOfNode } from "./nav";

export const SEEN = 1, VISITED = 2;
/** a door's last-seen state bits */
export const D_KNOWN = 1, D_OPEN = 2, D_STUCK = 4, D_BROKEN = 8;
/** what a door needs, as learned */
export const NEED = { none: 0, card: 1, power: 2, crowbar: 3, sealed: 4, small: 5, lockdown: 6, barricade: 7, vault: 8, steel: 9, code: 10 } as const;
/** what a door needs, as a survivor would put it (the state line reads "shut, <this>") */
/** what opens a card door, in this map's words */
const cardName = (w: SimWorld, tier: number): string => w.map.keyName ?? `a level-${tier} keycard`;
const NEED_TEXT = ["", "needs a keycard", "needs power", "needs a crowbar", "sealed shut", "only someone small could crawl it", "locked down", "barricaded from the other side", "sealed for good", "", "needs the keypad code"];

/** How often a survivor looks about and takes stock (ms), how near two must be to tell each other, how often. */
export const LEARN_MS = 400, SYNC_M = 6, SYNC_MS = 3000;
/** Reading a door's reader / sign: this close. */
const READ_M = 4;
/** A keycard on a dead man's belt (or lying by a body): seen this close. */
const BADGE_M = 6;

export interface AllySeen { room: number; t: number; state: string }
export interface ThreatSeen { kind: ZombieKind; room: number; t: number; heard: boolean; n: number }

export interface Knowledge {
  /** WHO'S HANDY AT WHAT, as they've SEEN it (Josh, Nov 5 2026: the AI knows the others' skills "from what
   *  they've seen"): a survivor doing a skilled thing well in front of them (goals.ts gainXp → seeSkill).
   *  Optional: a run saved before it has none. */
  handy?: Map<string, Set<string>>;
  room: Uint8Array;
  danger: Float32Array;
  /** THE SWEEP (objective 2): when they last looked a room over and saw none of the dead in it (0 never, or it
   *  isn't clear any more — one was seen there since) */
  swept: Float64Array;
  door: Uint8Array;
  doorAt: Float64Array;
  need: Uint8Array;
  needTier: Uint8Array;
  /** spots they've seen (containers, terminals, beds, the box, breakers, keycards lying out) */
  spots: Set<string>;
  /** spots they know are empty (searched, or a card they can see is gone) */
  empty: Set<string>;
  /** logs they know have been read (a spot read through) */
  read: Set<string>;
  /** THE RECORDS they've read or been told (records.ts ids), the codes and passwords they know, and the
   *  spots with something on them they couldn't open (a password, or Electronics they haven't got) */
  records: Set<string>;
  codes: Set<string>;
  locked: Set<string>;
  /** keycards lying on bodies they've seen (drop ids) */
  drops: Set<string>;
  /** zones they've set foot in; how deep the group has gone (the furthest STAGE — a zone's expectWeek,
   *  §3: lobby + residential are stage 1, labs + medical 2, security + power 3, the deep 4), and when
   *  it last went a stage deeper, as they know it */
  zones: Set<ZoneId>;
  stage: number;
  lastNewZoneAt: number;
  /** what they believe of each zone's power: -1 unknown, 0 dark, 1 lit */
  power: Int8Array;
  powerAt: Float64Array;
  /** the cards they know the group holds, by holder */
  cards: Map<SurvivorId, { tier: number; t: number }>;
  /** the shared box as last seen */
  /** the box as they last saw it (`battery` joined Oct 31 2026 — absent in an older save = none known) */
  box: { food: number; water: number; bandage: number; medkit: number; ammo: number; battery?: number; t: number } | null;
  /** each other survivor, last seen (by survivor index) */
  ally: Map<number, AllySeen>;
  /** a keycard seen on a dead security man's belt (when) */
  badgeSeen: number;
  threats: ThreatSeen[];
  /** what they saw happen, newest last */
  events: { t: number; text: string }[];
  /** when they last told each other things, by survivor index */
  toldAt: Map<number, number>;
  learnAt: number;
}

// (the zones are the world's map's: world.local.zoneIds, and each zone's stage world.local.stageOf)
const zoneIdx = (w: SimWorld, z: ZoneId) => w.local.zoneIds.indexOf(z);

/** `zones` is how many zones the map has (what they know of each zone's power is indexed by it). */
export function newKnowledge(rooms: number, doors: number, zones: number): Knowledge {
  return {
    room: new Uint8Array(rooms), danger: new Float32Array(rooms), swept: new Float64Array(rooms),
    door: new Uint8Array(doors), doorAt: new Float64Array(doors), need: new Uint8Array(doors), needTier: new Uint8Array(doors),
    spots: new Set(), empty: new Set(), read: new Set(), records: new Set(), codes: new Set(), locked: new Set(), drops: new Set(), zones: new Set(), stage: 1, lastNewZoneAt: 0,
    power: new Int8Array(zones).fill(-1), powerAt: new Float64Array(zones),
    cards: new Map(), box: null, ally: new Map(), badgeSeen: 0, threats: [], events: [], toldAt: new Map(), learnAt: 0,
  };
}

/** the radio room's code, as a survivor knows it (knowledge's codes) */
export const RADIO_CODE = "radio";

/** THE BUNKER: they've lived here weeks — every room, door and container is known from the start (follow-up 5).
 *  The doors they know as they last saw them; the armory's sign says it wants the keycard, the radio room's
 *  keypad says it wants a code. */
export function startKnowledge(w: SimWorld, s: Survivor): void {
  const k = s.know;
  for (let r = 0; r < w.nav.rooms.length; r++) {
    const R = w.nav.rooms[r];
    k.room[r] |= SEEN | VISITED;
    for (const sp of R.spots) k.spots.add(sp.id);
    k.zones.add(R.zone);
  }
  for (let d = 0; d < w.nav.doors.length; d++) {
    seeDoor(w, k, d);
    const D = w.nav.doors[d];
    if (D.kind === "keycard") learnNeed(w, k, d, "needs_card");
    if (D.kind === "keypad") learnNeed(w, k, d, "needs_code");
    k.door[d] &= ~D_STUCK;
  }
  k.stage = 1;
}

const isOpenDoor = (w: SimWorld, d: number) => w.doorOpenIdx(d);

/** The door's state as anybody standing there would see it. */
function doorBits(w: SimWorld, d: number): number {
  const D = w.nav.doors[d], st = w.fac.doors.get(D.id)!;
  let b = D_KNOWN;
  if (st.open || D.kind === "doorway") b |= D_OPEN;
  if (st.broken) b |= D_BROKEN | D_OPEN;
  return b;
}

export function seeDoor(w: SimWorld, k: Knowledge, d: number): void {
  const prev = k.door[d];
  k.door[d] = (doorBits(w, d) & ~D_STUCK) | (prev & D_STUCK && !(doorBits(w, d) & D_OPEN) ? D_STUCK : 0);
  k.doorAt[d] = w.t;
}

/** Learn what a door needs (they tried it, or read its reader / sign). */
export function learnNeed(w: SimWorld, k: Knowledge, d: number, why?: string): void {
  const D = w.nav.doors[d];
  let n: number = NEED.none, tier = 0;
  switch (why ?? D.kind) {
    case "needs_card": case "keycard": n = NEED.card; tier = D.tier ?? D.findTier ?? 1; break;
    case "safe": if (D.findTier) { n = NEED.card; tier = D.findTier; } break;
    case "no_power": case "power": n = NEED.power; break;
    case "lockdown": n = NEED.lockdown; break;
    case "needs_crowbar": case "grate": n = NEED.crowbar; break;
    case "sealed": n = NEED.sealed; break;
    case "too_big": case "vent": n = NEED.small; break;
    case "barricaded": case "locked": n = NEED.barricade; break;
    case "vault": case "vault_shut": case "vault_spent": case "sealed_shut": n = NEED.vault; break;
    case "needs_code": case "keypad": n = NEED.code; break;
    default: n = NEED.none;
  }
  if (!k.door[d]) seeDoor(w, k, d);
  if (n) { k.need[d] = n; if (tier) k.needTier[d] = tier; }
  if (why && why !== D.kind) { k.door[d] |= D_STUCK; k.doorAt[d] = w.t; }
}

/** Setting foot in a room: it and what's in it, the doors in its walls. */
export function visit(w: SimWorld, s: Survivor, r: number): void {
  const k = s.know;
  if (k.room[r] & VISITED) return;
  k.room[r] |= SEEN | VISITED;
  const R = w.nav.rooms[r];
  for (const sp of R.spots) {
    if (sp.kind === "keycard" && sp.tier === 3) continue;   // keycard 3 is on the chief, not on a desk (§3)
    k.spots.add(sp.id);
    if (sp.kind === "keycard" && w.group.looted.has(sp.id)) k.empty.add(sp.id);
  }
  for (const p of w.nav.at[nodeOf(r, R.floor)] ?? []) if (p.door >= 0) seeDoor(w, k, p.door);
  for (let f = 1; f < (R.spans ?? 1); f++) for (const p of w.nav.at[nodeOf(r, R.floor + f)] ?? []) if (p.door >= 0) seeDoor(w, k, p.door);
  if (!k.zones.has(R.zone)) {
    k.zones.add(R.zone);
    const week = w.local.stageOf[R.zone] ?? 1;
    if (week > k.stage) { k.stage = week; k.lastNewZoneAt = w.t; }
  }
}

/** Look about: the room they're in, the doors in sight, through the open ones, friends, bodies. */
export function learn(w: SimWorld, s: Survivor): void {
  const k = s.know, t = w.t;
  if (t < k.learnAt) return;
  const dtS = k.learnAt ? (t - k.learnAt + LEARN_MS) / 1000 : 0;
  k.learnAt = t + LEARN_MS;
  if (dtS > 0) { const f = Math.pow(0.995, dtS); for (let i = 0; i < k.danger.length; i++) k.danger[i] *= f; }
  if (s.room < 0) return;
  visit(w, s, s.room);
  const R = w.nav.rooms[s.room];
  // the lights tell them about this zone's power
  const zi = zoneIdx(w, R.zone);
  k.power[zi] = w.fac.hasPower(R.zone) ? 1 : 0; k.powerAt[zi] = t;
  const dark = w.isDark(s);
  const vis = dark ? (s.torch ? 16 : 6) : 22;
  // the doors of the room they stand in (on this floor), as far as they can see them
  for (const p of w.nav.at[nodeOf(s.room, s.floor)] ?? []) {
    if (p.door < 0) continue;
    const d = p.door, D = w.nav.doors[d];
    if (p.kind === "vent" || p.kind === "ladder") {
      // a grille or a ladder hatch in this room: they see it; close up they see where it goes
      const c = p.na === nodeOf(s.room, s.floor) ? p.ca : p.cb;
      const [cx, , cz] = w.nav.centre(c);
      if (Math.hypot(cx - s.x, cz - s.z) < READ_M) {
        seeDoor(w, k, d);
        if (D.kind === "vent" && (s.st.agility ?? 5) < 7) learnNeed(w, k, d, "vent");
        const other = p.na === nodeOf(s.room, s.floor) ? p.nb : p.na;
        k.room[roomOfNode(other)] |= SEEN;
      }
      continue;
    }
    const c = w.nav.doorCentre[d];
    const dd = Math.hypot(c[0] - s.x, c[2] - s.z);
    if (dd > vis) continue;
    if (!w.nav.sees(s.floor, s.x, s.z, c[0], c[2], (x) => x === d || isOpenDoor(w, x))) continue;
    seeDoor(w, k, d);
    if (dd < READ_M && D.kind !== "door" && D.kind !== "doorway") learnNeed(w, k, d);
    if (isOpenDoor(w, d)) {
      // through it: the room beyond
      const other = w.nav.roomIdx.get(D.a === R.id ? D.b : D.a)!;
      if (w.nav.rooms[other].kind !== "exit") k.room[other] |= SEEN;
    }
  }
  // friends in sight: where they are (and so that room), what they're doing
  for (const o of w.survivors) {
    if (o === s || !o.alive || o.floor !== s.floor || o.room < 0) continue;
    const dd = Math.hypot(o.x - s.x, o.z - s.z);
    const heard = dd < 12 && (o.mode === "down" || o.grabbedBy.length > 0 || o.mode === "fight");
    if (dd > vis && !heard) continue;
    if (!heard && !w.nav.sees(s.floor, s.x, s.z, o.x, o.z, w.doorOpenIdx)) continue;
    if (!heard) k.room[o.room] |= SEEN;
    k.ally.set(o.i, { room: o.room, t, state: allyState(o) });
  }
  // a keycard on a body, or on the belt of one of the dead
  for (const dr of w.group.drops) {
    if (k.drops.has(dr.id) || w.group.looted.has(dr.id) || dr.floor !== s.floor) continue;
    const [x, , z] = w.nav.centre(dr.cell);
    if (Math.hypot(x - s.x, z - s.z) < BADGE_M && w.nav.sees(s.floor, s.x, s.z, x, z, w.doorOpenIdx)) {
      k.drops.add(dr.id);
      note(k, t, dr.card ? `saw ${cardName(w, dr.card)} on a body` : `saw ${dr.who ? dr.who[0].toUpperCase() + dr.who.slice(1) + "'s" : "somebody's"} things where they fell`);
    }
  }
  for (const z of w.zombies) {
    if (!z.alive || !z.carriesCard || z.floor !== s.floor) continue;
    if (Math.hypot(z.x - s.x, z.z - s.z) < BADGE_M && w.nav.sees(s.floor, s.x, s.z, z.x, z.z, w.doorOpenIdx)) {
      if (!k.badgeSeen) note(k, t, "saw a keycard clipped to a dead guard's belt");
      k.badgeSeen = t;
    }
  }
  // telling each other: awake, same room, close
  if (s.mode !== "sleep" && s.mode !== "down") {
    for (const o of w.survivors) {
      if (o === s || !o.alive || o.mode === "sleep" || o.mode === "down" || o.room !== s.room || o.floor !== s.floor) continue;
      if (Math.hypot(o.x - s.x, o.z - s.z) > SYNC_M) continue;
      if (t - (k.toldAt.get(o.i) ?? -1e12) < SYNC_MS) continue;
      share(k, o.know); share(o.know, k);
      k.toldAt.set(o.i, t); o.know.toldAt.set(s.i, t);
      // what each knows of the other is now first-hand
      k.ally.set(o.i, { room: o.room, t, state: allyState(o) });
      o.know.ally.set(s.i, { room: s.room, t, state: allyState(s) });
      // the cards they carry, and so the group's
      if (s.card) o.know.cards.set(s.who, { tier: s.card, t });
      if (o.card) k.cards.set(o.who, { tier: o.card, t });
    }
  }
}

function allyState(o: Survivor): string {
  if (o.mode === "down") return "down";
  if (o.grabbedBy.length) return "grabbed";
  if (o.mode === "sleep") return "asleep";
  if (o.mode === "fight" || o.mode === "backoff") return "fighting";
  if (o.mode === "flee" || o.mode === "panic") return "running";
  return o.job?.kind ?? "idle";
}

/** b tells a everything b knows. */
export function share(a: Knowledge, b: Knowledge): void {
  for (let i = 0; i < a.room.length; i++) { a.room[i] |= b.room[i]; if (b.danger[i] > a.danger[i]) a.danger[i] = b.danger[i]; if (b.swept[i] > a.swept[i]) a.swept[i] = b.swept[i]; }
  for (let d = 0; d < a.door.length; d++) {
    if (b.door[d] && b.doorAt[d] > a.doorAt[d]) { a.door[d] = b.door[d]; a.doorAt[d] = b.doorAt[d]; }
    if (b.need[d] && !a.need[d]) { a.need[d] = b.need[d]; a.needTier[d] = b.needTier[d]; }
  }
  for (const x of b.spots) a.spots.add(x);
  for (const x of b.empty) a.empty.add(x);
  for (const x of b.read) a.read.add(x);
  // what's in the records goes with the telling (§2: knowledge is the reader's until they share it);
  // the locked spots too — the password that opens one may be in the other's head
  for (const x of b.records) a.records.add(x);
  for (const x of b.codes) a.codes.add(x);
  for (const x of b.locked) a.locked.add(x);
  for (const x of b.drops) a.drops.add(x);
  for (const z of b.zones) a.zones.add(z);
  if (b.lastNewZoneAt > a.lastNewZoneAt) a.lastNewZoneAt = b.lastNewZoneAt;
  if (b.stage > a.stage) a.stage = b.stage;
  for (let i = 0; i < a.power.length; i++) if (b.power[i] >= 0 && b.powerAt[i] > a.powerAt[i]) { a.power[i] = b.power[i]; a.powerAt[i] = b.powerAt[i]; }
  for (const [who, c] of b.cards) { const m = a.cards.get(who); if (!m || c.t > m.t) a.cards.set(who, { ...c }); }
  if (b.box && (!a.box || b.box.t > a.box.t)) a.box = { ...b.box };
  for (const [i, x] of b.ally) { const m = a.ally.get(i); if (!m || x.t > m.t) a.ally.set(i, { ...x }); }
  if (b.badgeSeen > a.badgeSeen) a.badgeSeen = b.badgeSeen;
  for (const th of b.threats) {
    if (a.threats.some((x) => x.room === th.room && x.kind === th.kind && x.t >= th.t)) continue;
    a.threats = a.threats.filter((x) => !(x.room === th.room && x.kind === th.kind));
    a.threats.push({ ...th });
  }
  a.threats.sort((x, y) => x.t - y.t);
  if (a.threats.length > 10) a.threats.splice(0, a.threats.length - 10);
}

/** They saw (or heard) `n` of the dead of a kind in a room. */
export function sawThreat(k: Knowledge, t: number, kind: ZombieKind, room: number, heard: boolean, n = 1): void {
  if (room < 0) return;
  const x = k.threats.find((q) => q.room === room && q.kind === kind);
  if (x) { x.n = t - x.t > 60_000 ? n : Math.max(x.n, n); x.t = t; x.heard = x.heard && heard; return; }
  k.threats.push({ kind, room, t, heard, n });
  if (k.threats.length > 10) k.threats.shift();
}

export function note(k: Knowledge, t: number, text: string): void {
  k.events.push({ t, text });
  if (k.events.length > 8) k.events.shift();
}

/** Everyone awake within `r` metres on this floor (or within r/2 through a wall) sees or hears it. */
export function witness(w: SimWorld, x: number, z: number, floor: number, r: number, text: string | ((s: Survivor) => string | null)): void {
  for (const s of w.survivors) {
    if (!s.alive || s.mode === "sleep" || s.floor !== floor) continue;
    const d = Math.hypot(s.x - x, s.z - z);
    if (d > r) continue;
    if (d > r / 2 && !w.nav.sees(floor, s.x, s.z, x, z, w.doorOpenIdx)) continue;
    const txt = typeof text === "string" ? text : text(s);
    if (txt) note(s.know, w.t, txt);
  }
}

/** Everyone who can see `s` (as witness() decides) notes that `s` is handy at `skill`. */
export function seeSkill(w: SimWorld, s: Survivor, skill: string): void {
  for (const o of w.survivors) {
    if (o === s || !o.alive || o.mode === "sleep" || o.floor !== s.floor) continue;
    const d = Math.hypot(o.x - s.x, o.z - s.z);
    if (d > 20 || (d > 10 && !w.nav.sees(s.floor, o.x, o.z, s.x, s.z, w.doorOpenIdx))) continue;
    const h = (o.know.handy ??= new Map());
    let set = h.get(s.who);
    if (!set) h.set(s.who, (set = new Set()));
    set.add(skill);
  }
}

// ---- what a survivor may plan through ------------------------------------------------------------------
/** A room they can picture (seen or been in). */
export const knowsRoom = (k: Knowledge, r: number) => (k.room[r] & SEEN) !== 0;

/** Would they believe this door lets them through? Only what they know: a door they've never seen is
 *  not on any route; a shut ordinary door they'll open; a steel one needs the card they've read it
 *  needs (or to have seen it propped open); power doors the power they've seen come on. */
/** Have they set foot in the safe room behind this door (so they know it's been found, and opens)? */
function safeHomeVisited(w: SimWorld, k: Knowledge, D: { a: string; b: string }): boolean {
  for (const id of [D.a, D.b]) { const r = w.nav.roomIdx.get(id)!; if (w.nav.rooms[r].kind === "safe" && (k.room[r] & VISITED)) return true; }
  return false;
}

/** Lockpicking at the least a lock asks (the level as the creator set it plus what they've learned). */
const pickable = (s: Survivor): boolean => (s.skills.lv.lockpicking ?? s.st.lockpicking ?? 0) >= LOCKPICK_MIN;

export function believePass(w: SimWorld, s: Survivor, d: number, card: number): 0 | 1 {
  const k = s.know;
  const bits = k.door[d];
  if (!bits) return 0;
  const D = w.nav.doors[d];
  const open = (bits & D_OPEN) !== 0;
  switch (D.kind) {
    case "doorway": return 1;
    case "door": return open || !(bits & D_STUCK) ? 1 : 0;
    // a sealed room the admin has opened for a newcomer (world.newcomer): its door gives now
    case "sealed": return open ? 1 : 0;
    case "keycard": return open || (k.need[d] === NEED.card && card >= k.needTier[d]) || pickable(s) ? 1 : 0;
    // a safe room they've been inside is home: its door opens for anyone once it's been found (doors.ts) —
    // the card it asked for the first time is history (they were planning themselves INTO a room they
    // couldn't plan their way back out of: 13 survivor-hours a day of failed jobs, Oct 28 2026)
    case "safe": {
      if (open || k.need[d] !== NEED.card || card >= k.needTier[d]) return 1;
      return safeHomeVisited(w, k, D) ? 1 : 0;
    }
    case "power": case "lockdown": return open || (D.zone && k.power[zoneIdx(w, D.zone)] === 1) ? 1 : 0;
    case "grate": return open || s.melee === "crowbar" || s.pack.spare.includes("crowbar") ? 1 : 0;
    case "vent": return (s.st.agility ?? 5) >= 7 ? 1 : 0;
    case "window": return 0;      // the living don't climb through the broken glass
    // the radio room's keypad: the code, learned off the note or from whoever read it
    case "keypad": return open || s.know.codes.has(RADIO_CODE) || pickable(s) ? 1 : 0;
    // the blast door: open until it's cranked shut (then sealed for good)
    case "vault": return w.fac.vaultOpen() ? 1 : 0;
  }
  return 0;
}

// ---- THE FACTS (what the language model is shown) --------------------------------------------------------
/**
 * What one survivor knows and feels right now. Compact (< ~1.5 KB of JSON), plain words, no ids of
 * anything they haven't seen and no coordinates. The talk layer reads it; nothing here decides anything.
 */
export interface SurvivorFacts {
  who: SurvivorId;
  /** "day 2, 03:00, night" */
  when: string;
  /** where they are (a room's name) and what they're doing */
  where: string;
  doing: string;
  me: {
    hp: number;
    /** "fresh" | "winded" | "spent" */
    stamina: string;
    /** "fed" | "hungry" | "starving" — and the same for thirst and sleep */
    hunger: string; thirst: string; sleep: string;
    morale: number;
    bleeding?: boolean;
    /** a bite they know they have (only they know until they say so) */
    bitten?: boolean;
    scared?: boolean;
  };
  /** what's on them */
  carrying: { weapon: string; gun?: string; rounds?: number; food: number; water: number; bandages: number; medkits: number; keycard?: number; keyName?: string; spare?: string[] };
  /** the others near them now */
  withMe: { who: SurvivorId; doing: string }[];
  /** the others not here: where they were last seen, and how long ago ("5 min") */
  others: { who: SurvivorId; last: string; ago: string; doing: string }[];
  /** what they know of the facility: counts, then the rooms that matter */
  known: { rooms: number; visited: number; home?: string };
  rooms: { name: string; note: string }[];
  /** doors that matter: unexplored ways on, locked doors and what they need */
  doors: { at: string; to: string; state: string }[];
  /** the dead they've seen or heard lately */
  threats: { what: string; where: string; ago: string }[];
  /** the shared box, as last seen */
  storage?: { food: number; water: number; bandages: number; medkits: number; ammo: number; ago: string };
  /** what's on their mind that they can't answer yet */
  questions: string[];
  /** what they saw happen lately, newest last */
  saw: string[];
  /** THE OBJECTIVES as they know them (never the count inside: nobody can know that, follow-up 25) */
  objectives?: string[];
}

const ago = (ms: number) => ms < 90_000 ? "just now" : ms < 3_600_000 ? `${Math.round(ms / 60_000)} min` : `${Math.round(ms / 3_600_000)} h`;
const roomName = (w: SimWorld, r: number) => (r >= 0 ? w.nav.rooms[r].name : "somewhere");
/** a room by name only if they can picture it; somewhere they heard of but never saw stays nameless */
const placeOf = (w: SimWorld, k: Knowledge, r: number) => (r >= 0 && k.room[r] ? w.nav.rooms[r].name : "somewhere they haven't seen");
const spotWords = (id: string) => id.replace(/^(safe-[a-z]+|[a-z]+)-/, "").replace(/-\d+$/, "").replace(/-/g, " ");

export function factsFor(w: SimWorld, who: SurvivorId): SurvivorFacts | null {
  const s = w.survivors.find((x) => x.who === who);
  if (!s) return null;
  const k = s.know, t = w.t, nav = w.nav;
  const hour = Math.floor((((t / 3_600_000) - 5) % 24 + 24) % 24);
  const facts: SurvivorFacts = {
    who,
    when: `day ${w.day()}, ${String(hour).padStart(2, "0")}:00${hour < 6 || hour >= 22 ? ", night" : ""}`,
    where: s.alive ? roomName(w, s.room) : "dead",
    doing: s.mode === "job" ? (s.job?.kind ?? "idle") : s.mode,
    me: {
      hp: Math.round(s.hp),
      stamina: s.stamina > 0.6 ? "fresh" : s.stamina > 0.2 ? "winded" : "spent",
      hunger: s.hungerH > NEEDS.starvingAt ? "starving" : s.hungerH > NEEDS.hungryAt ? "hungry" : "fed",
      thirst: s.thirstH > NEEDS.dehydratedAt ? "dehydrated" : s.thirstH > NEEDS.thirstyAt ? "thirsty" : "fine",
      sleep: s.tiredH > NEEDS.exhaustedAt ? "exhausted" : s.tiredH > NEEDS.tiredAt ? "tired" : "rested",
      morale: Math.round(s.morale),
      ...(s.bleeding ? { bleeding: true } : {}),
      ...(s.bitten ? { bitten: true } : {}),
      ...(s.fear > 0.5 ? { scared: true } : {}),
    },
    carrying: {
      weapon: s.melee,
      ...(s.gun ? { gun: s.gun, rounds: s.mag + (s.gun === "rifle" ? s.pack.ammoR : s.pack.ammoP) } : {}),
      food: s.pack.food, water: s.pack.water, bandages: s.pack.bandage, medkits: s.pack.medkit,
      ...(s.card ? { keycard: s.card, ...(w.map.keyName ? { keyName: w.map.keyName } : {}) } : {}),
      ...(s.pack.spare.length ? { spare: s.pack.spare.slice(0, 4) } : {}),
    },
    withMe: [], others: [], known: { rooms: 0, visited: 0 }, rooms: [], doors: [], threats: [], questions: [], saw: [],
  };
  for (const o of w.survivors) {
    if (o === s) continue;
    if (!o.alive) {
      // a death they know of (they saw it, or were told)
      const a = k.ally.get(o.i);
      if (a && a.state === "dead") facts.others.push({ who: o.who, last: placeOf(w, k, a.room), ago: ago(t - a.t), doing: "dead" });
      continue;
    }
    if (o.room === s.room && o.floor === s.floor && Math.hypot(o.x - s.x, o.z - s.z) < 15) { facts.withMe.push({ who: o.who, doing: allyState(o) }); continue; }
    const a = k.ally.get(o.i);
    facts.others.push(a ? { who: o.who, last: placeOf(w, k, a.room), ago: ago(t - a.t), doing: a.state } : { who: o.who, last: "unknown", ago: "-", doing: "unknown" });
  }
  // rooms
  let home: number = -1;
  const notes: { r: number; note: string; rank: number }[] = [];
  for (let r = 0; r < k.room.length; r++) {
    if (!k.room[r]) continue;
    facts.known.rooms++;
    const R = nav.rooms[r];
    const visited = (k.room[r] & VISITED) !== 0;
    if (visited) facts.known.visited++;
    const bits: string[] = [];
    let rank = 0;
    if (R.kind === "safe" && visited) { bits.push("safe room"); rank += 5; if (home < 0 || r === s.room) home = r; }
    if (!visited) { bits.push("not been in"); rank += 1; }
    const left: string[] = [];
    for (const sp of R.spots) {
      if (!k.spots.has(sp.id) || k.empty.has(sp.id)) continue;
      if (sp.kind === "loot") left.push(spotWords(sp.id));
      else if (sp.kind === "keycard") left.push(cardName(w, sp.tier ?? 1));
      else if (sp.kind === "terminal" && !k.read.has(sp.id)) left.push("an unread terminal");
      else if (sp.kind === "breaker" && sp.zone && k.power[zoneIdx(w, sp.zone)] !== 1) left.push("a breaker");
    }
    if (left.length) { bits.push("unsearched: " + left.slice(0, 3).join(", ")); rank += 2 + left.length; }
    for (const dr of w.group.drops) if (k.drops.has(dr.id) && !k.empty.has(dr.id) && nav.room[dr.cell] === r) { bits.push(dr.card ? `${cardName(w, dr.card)} on a body` : `${dr.who ?? "somebody"}'s gear where they fell`); rank += 6; }
    if (k.danger[r] > 0.6) { bits.push(k.danger[r] > 2 ? "dangerous" : "uneasy"); rank += 2; }
    if (r === s.room) rank += 10;
    if (bits.length) notes.push({ r, note: bits.join("; "), rank });
  }
  if (home >= 0) facts.known.home = nav.rooms[home].name;
  notes.sort((a, b) => b.rank - a.rank || a.r - b.r);
  facts.rooms = notes.slice(0, 8).map((x) => ({ name: nav.rooms[x.r].name, note: x.note }));
  // doors that matter: ways on nobody has been through, and the locked ones
  const ds: { d: number; rank: number; at: string; to: string; state: string }[] = [];
  for (let d = 0; d < k.door.length; d++) {
    const bits = k.door[d];
    if (!bits) continue;
    const D = nav.doors[d];
    const ra = nav.roomIdx.get(D.a)!, rb = nav.roomIdx.get(D.b)!;
    const va = (k.room[ra] & VISITED) !== 0, vb = (k.room[rb] & VISITED) !== 0;
    if (va && vb && !k.need[d]) continue;
    const near = va ? ra : rb, far = near === ra ? rb : ra;
    const farName = k.room[far] ? nav.rooms[far].name : D.kind === "keycard" && k.need[d] && D.name ? D.name : "unknown";
    let state = bits & D_BROKEN ? "broken" : bits & D_OPEN ? "open" : "shut";
    if (k.need[d]) state += `, ${k.need[d] === NEED.card ? `needs ${cardName(w, k.needTier[d])}` : NEED_TEXT[k.need[d]]}`;
    const rank = (k.need[d] ? 3 : 0) + (k.room[far] ? 0 : 1) + (near === s.room ? 3 : 0);
    if (D.kind === "vault") continue;
    ds.push({ d, rank, at: nav.rooms[near].name, to: farName, state });
  }
  ds.sort((a, b) => b.rank - a.rank || a.d - b.d);
  facts.doors = ds.slice(0, 6).map(({ at, to, state }) => ({ at, to, state }));
  for (const th of k.threats.slice().reverse()) {
    if (t - th.t > 2 * 3_600_000) continue;
    facts.threats.push({ what: `${th.heard ? "heard " : ""}${th.kind === "experiment" ? "something fast and wrong" : th.kind}${th.n > 1 ? " ×" + th.n : ""}`, where: placeOf(w, k, th.room), ago: ago(t - th.t) });
    if (facts.threats.length >= 4) break;
  }
  if (k.box) facts.storage = { food: k.box.food, water: k.box.water, bandages: k.box.bandage, medkits: k.box.medkit, ammo: k.box.ammo, ago: ago(t - k.box.t) };
  // what they can't answer yet
  const q = facts.questions;
  for (let d = 0; d < k.door.length && q.length < 3; d++) {
    if (k.need[d] !== NEED.card) continue;
    const tier = k.needTier[d];
    let have = s.card;
    for (const c of k.cards.values()) have = Math.max(have, c.tier);
    if (have < tier) q.push(`a door${nav.doors[d].name ? " to " + nav.doors[d].name : ""} needs ${cardName(w, tier)}, which we don't have`);
  }
  if (q.length < 3 && k.box && k.box.food + s.pack.food < 6) q.push("food is running short");
  // THE OBJECTIVES, as they know them
  const ob: string[] = [];
  const o = w.obj;
  ob.push(o.sealedAt ? "the blast door is sealed" : o.crank > 0.05 ? `the blast door is ${Math.round(o.crank * 100)}% cranked shut` : "the blast door is wide open — the dead keep coming in");
  if (k.codes.has(RADIO_CODE)) ob.push("I know the radio room's code");
  else ob.push("the radio room needs a keypad code — written down somewhere");
  if (k.records.has("radio:part")) ob.push(o.partIn ? `the radio's part is fitted; the repair is ${Math.round(Math.min(1, o.repair / 180_000) * 100)}% done` : "the radio needs a missing part (a valve or a fuse — the workshop or the stores?)");
  if (o.fixedAt && k.records.has("radio:fixed")) ob.push(o.calledAt ? "we called for help on the radio" : "the radio works — somebody needs to make the call");
  if (s.card) ob.push(`I have ${w.map.keyName ?? "the armory keycard"}`);
  // (a map with objectives of its own says them in its own words: none of the bunker's lines above is true of it)
  facts.objectives = w.scn ? w.scn.facts(w, s) : ob;
  facts.saw = k.events.slice(-5).map((e) => { const a = ago(t - e.t); return `${e.text} (${a === "just now" ? a : a + " ago"})`; });
  // keep it under the budget: trim the long lists from their tails
  for (let guard = 0; guard < 40 && JSON.stringify(facts).length > 1450; guard++) {
    if (facts.rooms.length > 3) facts.rooms.pop();
    else if (facts.doors.length > 2) facts.doors.pop();
    else if (facts.saw.length > 2) facts.saw.shift();
    else if (facts.others.length > 2) facts.others.pop();
    else if (facts.threats.length > 1) facts.threats.pop();
    else break;
  }
  return facts;
}

/** a sentence cut at a word, for the budget */
const clip = (t: string, n: number): string => t.length <= n ? t : t.slice(0, t.lastIndexOf(" ", n)) + "…";
