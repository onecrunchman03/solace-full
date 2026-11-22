// SOLACE SURVIVORZ — THE DIRECTOR: who is on camera, with what shot, and when it cuts.
//
// SURVIVORZ.md §1: no narrator, no confessionals, no votes — the story is told by the camera, what
// the survivors say and the graphics. So this is the show's storyteller. It is the casino show's
// director (client/src/casino/spectator.ts — interest, fading notes, airtime fairness, wide → close →
// follow, hold and minimum shot) adapted to a biolab: the moments are fights, grabs, someone going
// down, a door being hammered, a room opened for the first time, and the server's own tension.
//
// PURE: a function of the frames it has been fed and the clock it is given. No three.js, no DOM, no
// randomness — scripts/checks/test_survivorz_director.mjs drives it on a fake clock. The runner
// (show/direct.ts) turns its decisions into camera moves (show/shots.ts finds where the camera
// stands) and owns the dips; the overlay reads its bodies and its deaths (show/overlay.ts).
//
// THE RULES (dials in DIRECTOR):
//  · Every survivor has an INTEREST: the server's tension, its focus hint, what their body is doing
//    (down, grabbed, fighting, asleep), low health, and NOTES — events that heat them and fade.
//  · A shot holds MIN_SHOT_MS before anybody else may take it, and HOLD_MS before somebody only a
//    little more interesting does. A BIG moment (a grab, someone going down or dying) takes the
//    camera at once — the only thing that cuts a shot short.
//  · A SHOT IS A SHOT (Nov 12 2026 review: median shot 6 s, six in ten under 8 s). MIN_SHOT_MS is counted from
//    the last change of PICTURE, not only of subject: nobody is cut away from two seconds after their wide became
//    a follow; a line of talk doesn't re-cut a shot a tenth of a second old; a two-shot keeps the body it was
//    framed on (a zombie it just dropped is still the picture) and doesn't re-cut to whichever is nearest.
//  · A FIXED SHOT IS FOR SOMEBODY WHO STAYS IN IT: anyone walking or running gets the FOLLOW, never a close or a
//    two-shot (a big moment excepted); one who walks out of a close hands over to the follow.
//  · AIRTIME: screen time fades over AIR_FADE_S; a survivor who has had most of it gets less from
//    their ordinary notes and loses interest overall, so a long fight is filmed in turns and the
//    camera goes round the cast. Big moments are never tired.
//  · A quiet facility moves on: nobody to film for IDLE_MS, the camera visits somebody else; and
//    nobody holds it longer than MAX_SUBJECT_MS without a big moment.
//  · NEVER CUT INTO A VOID: a new subject is checked with `ready(at, room)` (is their zone drawn?).
//    Not yet → the director asks for it (`prepare` in the decision) and keeps the current shot until
//    it is, or drops the idea after PENDING_MS.
//  · THE GRAMMAR on a subject: WIDE to set the room → CLOSE for a moment (TWO when there's a body
//    to share the frame: a fight's zombie, a grab's zombie and its victim) → FOLLOW. Down or dead:
//    the BODY shot, and a death holds DEATH_HOLD_MS — against everything, another death included (that one is
//    shown next, and held as long). A big moment goes straight to its shot.
import type { DirectorWire, Pose as BodyPose, ServerFrame, ScreenFrame, SurvivorVitals } from "../../../../src/survivorz/sim/wire";

export type V3 = [number, number, number];
export type DShot = "wide" | "close" | "follow" | "two" | "body";
export type CutKind = "none" | "hard" | "dip";

export const DIRECTOR = {
  /** REALISM.md → the director camera: "cuts too often… shots of 8–15 s". A big moment still cuts at once. */
  MIN_SHOT_MS: 8_000,
  /** (15 s until Nov 12 2026: with an 8 s wide in front it made every shot 8 s on the dot) */
  HOLD_MS: 20_000,
  /** a challenger this much more interesting (×, +) takes a shot past MIN_SHOT_MS */
  STEAL: 1.6,
  STEAL_MIN: 4,
  /** a note at or above this weight is a BIG moment: it may cut a shot short and it never tires */
  BIG: 9,
  /** a big note is "breaking" for this long (it steals only while it's news) */
  BIG_FRESH_MS: 8_000,
  /** (the wide ran 6 s: under MIN_SHOT_MS, and it opens every subject — four shots in ten were a 6 s wide) */
  WIDE_MS: 8_000,
  CLOSE_MS: 9_000,
  /** a big moment's own shot holds this long before a bigger one, short of a death, takes it (two at once:
   *  the first is seen, then the second — not a half-second flash of each) */
  BIG_MIN_MS: 3_000,
  /** A FIXED SHOT IS FOR SOMEBODY WHO STAYS IN IT: a close or a two-shot stands on a tripod, and one walking or
   *  running leaves it in a couple of seconds — the runner re-took it every 2.5 s (25–38 extra cuts in fifteen
   *  minutes, by replay). Anyone on the move gets the follow; a close whose subject has gone this far from where
   *  it found them hands over to the follow, once. */
  WALKED_OFF_M: 2,
  /** a moment is fresh enough for a close this long */
  MOMENT_MS: 6_000,
  /** …and worth one from this weight (2 until Nov 12 2026: "found something" put a close on somebody who walked
   *  on two seconds later) */
  MOMENT_W: 3,
  /** nothing happening: somebody else after this */
  IDLE_MS: 25_000,
  /** past HOLD_MS a challenger needs this much more interest (no flicking between equals) */
  HOLD_MARGIN: 1,
  /** not seen for a while is worth up to 2, reached over this long (a quiet show goes round) */
  SEEN_MS: 180_000,
  MAX_SUBJECT_MS: 75_000,
  DEATH_HOLD_MS: 10_000,
  PENDING_MS: 20_000,
  AIR_FADE_S: 150,
  MAX_TIRE: 0.65,
  AIR_PENALTY: 3,
  /** a door, a noise, a zombie's alert counts for survivors this near it (same floor) */
  NEAR_M: 10,
  /** a second body shares the frame (the two-shot) when it's this close */
  TWO_M: 4.5,
  /** THE CONVERSATION (REALISM.md: "talk is cut back and forth on whoever's talking"): a line said by somebody in
   *  the subject's room, to the subject or by them, puts a close on the speaker, if the shot on air has held this
   *  long and nothing big is happening. A line is fresh for TALK_FRESH_MS. (3 s until Nov 12 2026: a conversation
   *  re-cut the picture every three seconds. Now a line is what a cut waits for, once the shot has had its time.) */
  TALK_CUT_MS: 8_000,
  TALK_FRESH_MS: 1_500,
};

/** One body, as the director tracks it (the server's state — never interpolated). */
export interface DBody {
  id: string;
  kind: "survivor" | "zombie";
  who?: string;
  pos: V3;
  heading: number;
  pose: BodyPose;
  room: string | null;
  hp: number;
  hpMax: number;
  vitals?: SurvivorVitals;
  zkind?: string;
  /** out through the vault (alive, gone from the facility) */
  escaped?: boolean;
}

/** One moment that heats a survivor, fading over its life. */
interface Heat { id: string; key: string; w: number; at: number; ms: number; reason: string; other: string | null }

export interface Death { id: string; who: string; at: number; day: number; cause?: string; room?: string | null; kills?: number }

export interface OnAir { target: string | null; other: string | null; shot: DShot; reason: string }

export interface Decision extends OnAir {
  /** what this beat changed, against the last beat's picture */
  cut: CutKind;
  /** the cut was a big moment taking the camera (the only thing allowed under MIN_SHOT_MS) */
  big: boolean;
  /** places the director wants drawn before it can cut there */
  prepare: { at: V3; room: string | null }[];
  /** a subject waiting on its zone */
  pending: string | null;
}

/** What each event is worth: [weight, ms, who it heats, reason]. "by"/"victim" name the field. */
type Role = "by" | "victim" | "both" | "near";
const NOTE: Record<string, { w: number; ms: number; who: Role; key: string; say: string }> = {
  "melee.swing.light": { w: 4, ms: 8_000, who: "by", key: "fight", say: "swings" },
  "melee.swing.heavy": { w: 5, ms: 8_000, who: "by", key: "fight", say: "swings hard" },
  "melee.hit": { w: 6, ms: 10_000, who: "by", key: "fight", say: "fighting" },
  "melee.hit.head": { w: 6.5, ms: 10_000, who: "by", key: "fight", say: "fighting" },
  "melee.stab": { w: 6.5, ms: 10_000, who: "by", key: "fight", say: "fighting" },
  "melee.stomp": { w: 6, ms: 10_000, who: "by", key: "fight", say: "stomps one" },
  "gun.pistol": { w: 6.5, ms: 10_000, who: "by", key: "gun", say: "shooting" },
  "gun.rifle": { w: 7, ms: 10_000, who: "by", key: "gun", say: "shooting" },
  "gun.shotgun": { w: 7, ms: 10_000, who: "by", key: "gun", say: "shooting" },
  "gun.dry": { w: 5, ms: 8_000, who: "by", key: "gun", say: "out of ammo" },
  "zombie.attack": { w: 6.5, ms: 10_000, who: "victim", key: "attacked", say: "under attack" },
  "zombie.alert": { w: 4, ms: 10_000, who: "victim", key: "seen", say: "spotted by the dead" },
  "experiment.alert": { w: 5.5, ms: 12_000, who: "victim", key: "seen", say: "spotted by an experiment" },
  "zombie.chase": { w: 5.5, ms: 12_000, who: "victim", key: "chased", say: "chased" },
  "zombie.feed": { w: 10, ms: 20_000, who: "victim", key: "feed", say: "being eaten" },
  "zombie.death": { w: 4, ms: 8_000, who: "by", key: "kill", say: "drops one" },
  "survivor.grabbed": { w: 11, ms: 15_000, who: "victim", key: "grab", say: "grabbed" },
  "survivor.bitten": { w: 9.5, ms: 15_000, who: "victim", key: "bite", say: "bitten" },
  "survivor.hit": { w: 6, ms: 10_000, who: "victim", key: "hurt", say: "hurt" },
  "survivor.panic": { w: 3, ms: 8_000, who: "by", key: "panic", say: "panicking" },
  "survivor.down": { w: 12, ms: 30_000, who: "victim", key: "down", say: "down" },
  "survivor.dying": { w: 13, ms: 30_000, who: "victim", key: "down", say: "dying" },
  "survivor.dead": { w: 20, ms: 30_000, who: "victim", key: "dead", say: "dead" },
  "survivor.revived": { w: 8, ms: 15_000, who: "both", key: "revive", say: "revived" },
  // turning on each other (phase 3): the biggest thing short of a death
  "survivor.attack": { w: 12, ms: 20_000, who: "both", key: "betray", say: "turned on one of their own" },
  "survivor.steal": { w: 5, ms: 12_000, who: "by", key: "steal", say: "stealing" },
  "survivor.give": { w: 3, ms: 10_000, who: "by", key: "give", say: "sharing" },
  "door.hit": { w: 3, ms: 8_000, who: "near", key: "door", say: "the door is being hammered" },
  "door.broken": { w: 8, ms: 15_000, who: "near", key: "door", say: "the door gave way" },
  "pipe.burst": { w: 3, ms: 10_000, who: "near", key: "noise", say: "a pipe burst" },
  "thing.fell": { w: 3, ms: 10_000, who: "near", key: "noise", say: "something fell" },
  "zone.dip": { w: 2, ms: 8_000, who: "near", key: "noise", say: "the lights dip" },
  "room.explored": { w: 3, ms: 15_000, who: "by", key: "explore", say: "into a new room" },
  "item.found": { w: 2.5, ms: 10_000, who: "by", key: "find", say: "found something" },
  "keycard.found": { w: 7, ms: 20_000, who: "by", key: "card", say: "found a keycard" },
  "weapon.broke": { w: 4, ms: 10_000, who: "by", key: "broke", say: "weapon broke" },
  "box.open": { w: 1, ms: 6_000, who: "by", key: "search", say: "searching" },
};

/** A line said aloud warms the speaker a little (and makes the other party the two-shot's partner). */
const TALK_NOTE = { w: 3.5, ms: 9_000, key: "talk", say: "talking" };

const MOVING = new Set<BodyPose>(["walk", "jog", "sprint", "crouch-walk"]);
const POSE_W: Partial<Record<BodyPose, number>> = { down: 5, grabbed: 6, fight: 1.5, shoot: 1.5, aim: 1, reload: 1, panic: 1.5, revive: 2, sprint: 0.6, sleep: -0.3 };

export class Director {
  readonly bodies = new Map<string, DBody>();
  readonly deaths: Death[] = [];
  day = 1;
  /** the show clock (the last snapshot's or tick's `t`) — a downed survivor's card counts their bleed-out against
   *  it (vitals.downUntil is on the same clock); null until a frame says */
  simT: number | null = null;
  tension: Record<string, number> = {};
  focus: { id: string; why: string } | null = null;
  phase: DirectorWire["phase"] = "build";
  /** door id → where it is (the runner fills it from the map; events usually carry `at` anyway) */
  doorAt: (id: string) => V3 | null = () => null;

  // the picture
  target: string | null = null;
  other: string | null = null;
  shot: DShot = "follow";
  reason = "";
  cutAt = 0;
  shotAt = 0;
  /** where the subject stood when the shot on air began */
  private shotPos: V3 | null = null;
  private heat: Heat[] = [];
  private seen: Record<string, number> = {};
  private air: Record<string, number> = {};
  private airAt = 0;
  private pending: { target: string; shot: DShot; at: number; big: boolean } | null = null;
  private last: OnAir = { target: null, other: null, shot: "follow", reason: "" };
  private deadAt: Record<string, number> = {};
  /** when the camera first stood on a body after its death: the hold runs from there (a second death, shown
   *  after the first has had its hold, gets a whole one of its own) */
  private shownDead: Record<string, number> = {};
  /** survivors who died, turned or collapsed turning this run: no subtitle of theirs shows again */
  private hushed = new Set<string>();
  /** the run the frames belong to (the snapshot's `run`); null until a snapshot names one */
  run: string | null = null;

  /** A NEW RUN (a reset, or a server restart's fresh world): everything this run learned is the old
   *  run's — who died when (a survivor dead last run who dies again must get their card), the heat,
   *  the airtime, the shot on air. The ids collide (`s:<who>`, `z:0`…), so nothing carries over. */
  reset(): void {
    this.bodies.clear();
    this.deaths.length = 0;
    this.simT = null;
    this.lines.length = 0;
    this.thoughts.clear();
    this.goals.clear();
    this.decisions.length = 0;
    this.tension = {};
    this.focus = null;
    this.target = null; this.other = null; this.shot = "follow"; this.reason = "";
    this.cutAt = 0; this.shotAt = 0; this.shotPos = null;
    this.heat = []; this.seen = {}; this.air = {}; this.airAt = 0;
    this.pending = null;
    this.last = { target: null, other: null, shot: "follow", reason: "" };
    this.deadAt = {};
    this.shownDead = {};
    this.hushed.clear();
  }

  // ---- what the director is fed ----

  feed(f: ScreenFrame, now: number): void {
    switch (f.type) {
      case "snap": {
        const run = runOf(f);
        if (runChanged(this.run, run)) this.reset();
        if (run) this.run = run;
        this.day = f.day;
        if (Number.isFinite(f.t)) this.simT = f.t;
        this.bodies.clear();
        this.lines.length = 0;
        this.thoughts.clear();
        this.goals.clear();
        for (const b of f.bodies) this.bodies.set(b.id, toBody(b));
        this.director(f.director);
        break;
      }
      case "tick": {
        if (f.director) this.director(f.director);
        if (Number.isFinite(f.t)) this.simT = f.t;
        for (const t of f.b) {
          const b = this.bodies.get(t.id);
          if (!b) continue;
          b.pos = t.p; b.heading = t.h;
          if (t.pose) b.pose = t.pose;
          if (t.hp !== undefined) b.hp = t.hp;
          if (t.room !== undefined) b.room = t.room;
          if (t.vitals) b.vitals = t.vitals;
        }
        break;
      }
      case "spawn": this.bodies.set(f.body.id, toBody(f.body)); break;
      case "gone": {
        // a survivor who turned keeps a card on the strip, dead (the thing they became arrives as its own body)
        const b = this.bodies.get(f.id);
        if (b?.kind === "survivor") { if (!b.escaped) { b.pose = "dead"; b.hp = 0; } }
        else this.bodies.delete(f.id);
        break;
      }
      case "ev": {
        // out through the vault: the card says so (the body's "gone" frame comes right after)
        if (f.event === "survivor.escaped" && typeof f.by === "string") { const b = this.bodies.get(f.by); if (b) b.escaped = true; }
        this.event(f, now);
        break;
      }
      case "say": this.said(f, now); break;
      case "think": {
        // what they're thinking (the cast card's line): the latest per survivor, and when it came —
        // it moves no camera (a thought isn't something anybody sees them do)
        const s = this.survivor(f.by);
        if (s && typeof f.text === "string") {
          if (f.text) this.thoughts.set(s.id, { text: f.text, at: now }); else this.thoughts.delete(s.id);
        }
        break;
      }
      case "goal": {
        // their own goal, in their words (the cast card's second line); empty clears it
        const s = this.survivor(f.by);
        if (s && typeof f.text === "string") { if (f.text) this.goals.set(s.id, { text: f.text.slice(0, 160), at: now }); else this.goals.delete(s.id); }
        break;
      }
      case "decide": {
        // a choice the AI made, with their reason (the DECIDED caption); it moves no camera by itself —
        // what they then DO does
        const s = this.survivor(f.by);
        if (!s || typeof f.did !== "string" || !f.did) break;
        this.decisions.push({ id: s.id, who: s.who ?? s.id, did: f.did.slice(0, 120), reason: typeof f.reason === "string" ? f.reason.slice(0, 180) : "", social: f.kind === "social", at: now });
        if (this.decisions.length > 16) this.decisions.splice(0, this.decisions.length - 16);
        break;
      }
    }
  }

  /** WHAT THEY'RE THINKING: the last `think` per survivor body id, and when it arrived (local clock).
   *  A snapshot clears them; the server sends the standing ones right after it (a reset's new world
   *  sends its own on its first beat). */
  readonly thoughts = new Map<string, { text: string; at: number }>();
  /** THEIR GOALS (wire `goal`): the last per survivor body id */
  readonly goals = new Map<string, { text: string; at: number }>();
  /** WHAT THEY DECIDED (wire `decide`), newest last — the caption picks from these */
  readonly decisions: { id: string; who: string; did: string; reason: string; social: boolean; at: number }[] = [];

  /** THE LINES SAID (the talk layer's subtitles), newest last — the overlay reads them. */
  readonly lines: { id: string; who: string; text: string; to: string | null; at: number; ms?: number }[] = [];

  /** A line said aloud: the subtitle, and a little pull of the camera toward who said it (a talk
   *  note — light, so a line never steals a shot from a fight; it only tips a quiet one). */
  private said(f: Extract<ServerFrame, { type: "say" }>, now: number): void {
    const s = this.survivor(f.by);
    if (!s || !f.text) return;
    // THE DEAD SAY NOTHING (Nov 2026): no subtitle for the dead, the turned or one collapsed turning
    if (this.hushed.has(s.id) || s.pose === "dead" || s.vitals?.job === "turning") return;
    this.lines.push({ id: s.id, who: s.who ?? s.id, text: f.text, to: typeof f.to === "string" ? f.to : null, at: now, ...(typeof f.ms === "number" ? { ms: f.ms } : {}) });
    if (this.lines.length > 12) this.lines.splice(0, this.lines.length - 12);
    const n = TALK_NOTE;
    const other = typeof f.to === "string" && this.bodies.has(f.to) ? f.to : null;
    this.heat = this.heat.filter((h) => !(h.id === s.id && h.key === n.key) && now - h.at < h.ms);
    this.heat.push({ id: s.id, key: n.key, w: n.w, at: now, ms: n.ms, reason: `${cap(s.who ?? s.id)}: ${n.say}`, other });
    this.talkCue = { id: s.id, to: other, at: now };
  }
  /** the newest line said, for the conversation's cut back and forth */
  private talkCue: { id: string; to: string | null; at: number } | null = null;

  private director(d: DirectorWire | undefined): void {
    if (!d) return;
    this.phase = d.phase;
    this.tension = d.tension ?? {};
    this.focus = d.focus ?? null;
  }

  private survivor(id: unknown): DBody | undefined {
    const b = typeof id === "string" ? this.bodies.get(id) : undefined;
    return b?.kind === "survivor" ? b : undefined;
  }

  private event(e: Extract<ServerFrame, { type: "ev" }>, now: number): void {
    // a death, a turn or the collapse before one: their subtitle on screen goes, and nothing more of theirs shows
    if (typeof e.victim === "string" && (e.event === "survivor.dead" || e.event === "survivor.turned" || (e.event === "survivor.dying" && e.turning))) {
      const id = e.victim;
      this.hushed.add(id);
      for (let i = this.lines.length - 1; i >= 0; i--) if (this.lines[i].id === id) this.lines.splice(i, 1);
    }
    if (e.event === "survivor.dead") {
      const s = this.survivor(e.victim);
      if (s && !this.deadAt[s.id]) {
        this.deadAt[s.id] = now;
        this.deaths.push({ id: s.id, who: s.who ?? s.id, at: now, day: this.day, cause: typeof e.cause === "string" ? e.cause : undefined, room: s.room, kills: s.vitals?.kills ?? 0 });
        s.pose = "dead"; s.hp = 0;
      }
    }
    if (e.event === "survivor.revived") { const s = this.survivor(e.victim); if (s && s.pose === "down") s.pose = "idle"; }
    if (e.event === "survivor.down") { const s = this.survivor(e.victim); if (s) s.pose = "down"; }
    let n = NOTE[e.event];
    if (!n && e.event.startsWith("gun.") && !e.event.startsWith("gun.reload")) n = NOTE["gun.pistol"];
    if (!n) return;
    const name = (b: DBody) => cap(b.who ?? b.id);
    const add = (s: DBody, other: string | null) => {
      const reason = `${name(s)}: ${n.say}`;
      this.heat = this.heat.filter((h) => !(h.id === s.id && h.key === n.key) && now - h.at < h.ms);
      this.heat.push({ id: s.id, key: n.key, w: n.w, at: now, ms: n.ms, reason, other });
    };
    const by = typeof e.by === "string" ? e.by : null, victim = typeof e.victim === "string" ? e.victim : null;
    if (n.who === "by" || n.who === "both") { const s = this.survivor(by); if (s) add(s, victim && this.bodies.has(victim) ? victim : null); }
    if (n.who === "victim" || n.who === "both") {
      let s = this.survivor(victim);
      // an alert or a chase with nobody named: the survivor nearest the zombie
      if (!s && (e.event.endsWith(".alert") || e.event.endsWith(".chase"))) s = this.nearest(this.bodies.get(by ?? "")?.pos ?? (e.at as V3 | undefined));
      if (s) add(s, n.who === "both" ? (by && by !== s.id ? by : null) : by && this.bodies.has(by) ? by : null);
    }
    if (n.who === "near") {
      const at = (Array.isArray(e.at) ? (e.at as V3) : null) ?? (typeof e.door === "string" ? this.doorAt(e.door) : null);
      if (!at) return;
      for (const s of this.bodies.values()) {
        if (s.kind !== "survivor" || s.pose === "dead" || s.escaped) continue;
        if (Math.abs(s.pos[1] - at[1]) < 3 && Math.hypot(s.pos[0] - at[0], s.pos[2] - at[2]) <= DIRECTOR.NEAR_M) add(s, null);
      }
    }
  }

  private nearest(p: V3 | undefined): DBody | undefined {
    if (!p) return undefined;
    let best: DBody | undefined, bd = DIRECTOR.NEAR_M * 1.5;
    for (const s of this.bodies.values()) {
      if (s.kind !== "survivor" || s.pose === "dead" || s.escaped || Math.abs(s.pos[1] - p[1]) > 3) continue;
      const d = Math.hypot(s.pos[0] - p[0], s.pos[2] - p[2]);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  // ---- interest ----

  private fresh(h: Heat, now: number): number { return Math.max(0, 1 - (now - h.at) / h.ms); }

  /** A survivor's recent share of the screen, capped at MAX_TIRE. */
  airShare(id: string): number { return Math.min(DIRECTOR.MAX_TIRE, (this.air[id] ?? 0) / DIRECTOR.AIR_FADE_S); }

  interest(id: string, now: number): number {
    const b = this.bodies.get(id);
    if (!b) return -Infinity;
    let v = 0.5;
    v += ((this.tension[b.who ?? ""] ?? 0) / 100) * 2.5;
    if (this.focus?.id === id) v += 1.5;
    v += POSE_W[b.pose] ?? 0;
    if (b.hpMax > 0 && b.hp > 0 && b.hp / b.hpMax < 0.35) v += 1.5;
    const tire = 1 - this.airShare(id);
    for (const h of this.heat) if (h.id === id) v += h.w * this.fresh(h, now) * (h.w >= DIRECTOR.BIG ? 1 : tire);
    v += Math.min(2, (now - (this.seen[id] ?? 0)) / DIRECTOR.SEEN_MS);
    v -= this.airShare(id) * DIRECTOR.AIR_PENALTY;
    return v;
  }

  /** the strongest live note on a survivor */
  private hottest(id: string, now: number): Heat | undefined {
    let best: Heat | undefined, bv = 0;
    for (const h of this.heat) if (h.id === id) { const v = h.w * this.fresh(h, now); if (v > bv) { bv = v; best = h; } }
    return best;
  }
  /** a big moment breaking on a survivor right now (its weight, or 0) */
  private breaking(id: string, now: number, waiting = false): number {
    let w = 0;
    // (a death somebody ELSE is waiting to be shown stays news through another death's hold)
    for (const h of this.heat) if (h.id === id && h.w >= DIRECTOR.BIG && now - h.at < DIRECTOR.BIG_FRESH_MS + (waiting && h.w >= 20 ? DIRECTOR.DEATH_HOLD_MS : 0)) w = Math.max(w, h.w);
    return w;
  }
  /** when a death's hold began: when the camera got to the body, or the death itself */
  private deathFrom(id: string): number { return this.shownDead[id] ?? this.deadAt[id] ?? 0; }

  /** who the camera may film: the living, and the dead while their death is still being held */
  private candidates(now: number): DBody[] {
    const out: DBody[] = [];
    for (const b of this.bodies.values()) {
      // (an escaped survivor is out of the building: their actor is gone, there is nobody to film)
      if (b.kind !== "survivor" || b.escaped) continue;
      const d = this.deadAt[b.id];
      if (b.pose === "dead" && !(d && now - this.deathFrom(b.id) < DIRECTOR.DEATH_HOLD_MS * 1.5)) continue;
      out.push(b);
    }
    return out;
  }

  /** the body a shot shares the frame with: the moment's other party, or the nearest zombie in a fight */
  private partner(me: DBody, now: number): string | null {
    const h = this.hottest(me.id, now);
    const near = (o: DBody | undefined) => !!o && Math.abs(o.pos[1] - me.pos[1]) < 2.5 && Math.hypot(o.pos[0] - me.pos[0], o.pos[2] - me.pos[2]) <= DIRECTOR.TWO_M;
    if (h?.other && near(this.bodies.get(h.other)) && now - h.at < DIRECTOR.MOMENT_MS * 1.5) return h.other;
    if (me.pose === "grabbed" || me.pose === "fight") {
      let best: string | null = null, bd = DIRECTOR.TWO_M;
      for (const z of this.bodies.values()) {
        if (z.kind !== "zombie" || z.pose === "z-dead" || Math.abs(z.pos[1] - me.pos[1]) > 2.5) continue;
        const d = Math.hypot(z.pos[0] - me.pos[0], z.pos[2] - me.pos[2]);
        if (d < bd) { bd = d; best = z.id; }
      }
      return best;
    }
    return null;
  }

  private downOrDead(b: DBody): boolean { return b.pose === "down" || b.pose === "dead"; }

  /** The first shot on a new subject: a big moment goes straight to its shot (it won't wait for
   *  a wide); everything else opens wide. */
  private openingShot(b: DBody, now: number): DShot {
    if (this.downOrDead(b)) return "body";
    if (this.breaking(b.id, now)) return this.partner(b, now) ? "two" : "close";
    // THE ROOM IS ALREADY ON SCREEN (the subject on air is in it): no second establishing shot of it
    const on = this.target ? this.bodies.get(this.target) : undefined;
    if (on && on.id !== b.id && on.room !== null && on.room === b.room) {
      const h = this.hottest(b.id, now);
      if (h && h.w >= DIRECTOR.MOMENT_W && now - h.at < DIRECTOR.MOMENT_MS && !MOVING.has(b.pose)) return this.partner(b, now) ? "two" : "close";
      return "follow";
    }
    return "wide";
  }

  // ---- one beat ----

  tick(now: number, ready: (at: V3, room: string | null) => boolean = () => true): Decision {
    // airtime: whoever was on since the last beat gets it; all of it fades
    const dt = this.airAt ? Math.max(0, Math.min(5, (now - this.airAt) / 1000)) : 0;
    const keep = Math.exp(-dt / DIRECTOR.AIR_FADE_S);
    for (const k of Object.keys(this.air)) { this.air[k] *= keep; if (this.air[k] < 0.05) delete this.air[k]; }
    if (this.target && dt) this.air[this.target] = (this.air[this.target] ?? 0) + dt;
    this.airAt = now;
    this.heat = this.heat.filter((h) => now - h.at < h.ms);

    // the camera is on a body: its death's hold counts from here
    if (this.target && this.deadAt[this.target] && !this.shownDead[this.target] && this.bodies.get(this.target)?.pose === "dead") this.shownDead[this.target] = Math.max(this.deadAt[this.target], this.cutAt);

    const prepare: Decision["prepare"] = [];
    let big = false;
    const cutTo = (id: string, shot: DShot, isBig: boolean): void => {
      const b = this.bodies.get(id)!;
      this.target = id; this.shot = shot; this.cutAt = now; this.shotAt = now; this.shotPos = [...b.pos];
      this.other = shot === "two" ? this.partner(b, now) : null;
      this.reason = this.hottest(id, now)?.reason ?? cap(b.who ?? id);
      this.seen[id] = now;
      this.pending = null;
      big = isBig;
    };
    // a subject this beat wants: cut if its zone is drawn, else ask for it and keep the picture
    const want = (id: string, isBig: boolean): void => {
      const b = this.bodies.get(id)!;
      const shot = this.openingShot(b, now);
      if (ready(b.pos, b.room)) { cutTo(id, shot, isBig); return; }
      if (!this.pending || this.pending.target !== id) this.pending = { target: id, shot, at: now, big: isBig };
      prepare.push({ at: b.pos, room: b.room });
    };

    const regs = this.candidates(now);
    if (!regs.length) {
      this.target = null; this.pending = null;
      return this.decide(now, prepare, false);
    }
    // the cut that's waiting on its zone
    if (this.pending) {
      const p = this.pending, b = this.bodies.get(p.target);
      if (!b || now - p.at > DIRECTOR.PENDING_MS) this.pending = null;
      else if (ready(b.pos, b.room)) { cutTo(p.target, this.openingShot(b, now), p.big); return this.decide(now, prepare, big); }
      else prepare.push({ at: b.pos, room: b.room });
    }

    const scored = regs.map((r) => ({ r, v: this.interest(r.id, now) })).sort((x, y) => y.v - x.v || (x.r.id < y.r.id ? -1 : 1));
    const cur = this.target ? scored.find((x) => x.r.id === this.target) : undefined;
    const best = scored[0];
    const held = now - this.cutAt;
    const curBreaking = cur ? this.breaking(cur.r.id, now) : 0;
    // (what is still happening to the subject: a note at its faded weight — at its full weight a grab thirteen seconds
    // old held the camera against a fresh one next door, and somebody down kept it from a grab for thirty)
    const curNote = cur ? this.hottest(cur.r.id, now) : undefined;
    const curHot = curNote ? curNote.w * this.fresh(curNote, now) : 0;
    // a death on screen is held
    const deathHold = !!cur && cur.r.pose === "dead" && now - this.deathFrom(cur.r.id) < DIRECTOR.DEATH_HOLD_MS;

    // ---- the conversation: a close on whoever's talking, in the subject's room ----
    const cue = this.talkCue;
    if (cue && cur && now - cue.at < DIRECTOR.TALK_FRESH_MS && !curBreaking && !deathHold && now - this.shotAt >= DIRECTOR.TALK_CUT_MS
      && !scored.some((x) => x.r.id !== this.target && this.breaking(x.r.id, now) > 0)) {   // (a big moment anywhere beats a line)
      const sp = this.bodies.get(cue.id);
      const inRoom = !!sp && sp.room !== null && sp.room === cur.r.room;
      const about = cue.id === cur.r.id || cue.to === cur.r.id || cue.id === this.other;
      if (sp && inRoom && about && !this.downOrDead(sp) && !(this.target === cue.id && (this.shot === "close" || MOVING.has(sp.pose)))) {
        this.talkCue = null;
        this.target = cue.id; this.shot = MOVING.has(sp.pose) ? "follow" : "close"; this.other = null; this.cutAt = now; this.shotAt = now; this.shotPos = [...sp.pos];
        this.reason = this.hottest(cue.id, now)?.reason ?? cap(sp.who ?? cue.id);
        this.seen[cue.id] = now;
        return this.decide(now, prepare, false);
      }
    }

    let next: { id: string; big: boolean } | null = null;
    // (a change of subject that isn't a big moment waits for the PICTURE on air to have had its time too)
    const settled = now - this.shotAt >= DIRECTOR.MIN_SHOT_MS;
    // the biggest moment breaking anywhere else
    const breaking = scored.filter((x) => x.r.id !== this.target).map((x) => ({ x, w: this.breaking(x.r.id, now, true) })).filter((y) => y.w > 0).sort((a, b) => b.w - a.w)[0];
    if (!cur) next = { id: best.r.id, big: !!this.breaking(best.r.id, now) };
    else if (breaking && breaking.w > Math.max(curBreaking, curHot) + 1 && !deathHold
      && !(curBreaking && held < DIRECTOR.BIG_MIN_MS && breaking.w < 20)) next = { id: breaking.x.r.id, big: true };
    else if (deathHold || curBreaking) next = null;
    else if (!settled) next = null;
    else if (best.r.id !== cur.r.id && held >= DIRECTOR.HOLD_MS && best.v > cur.v + DIRECTOR.HOLD_MARGIN) next = { id: best.r.id, big: false };
    else if (best.r.id !== cur.r.id && held >= DIRECTOR.MIN_SHOT_MS && best.v >= cur.v * DIRECTOR.STEAL + DIRECTOR.STEAL_MIN) next = { id: best.r.id, big: false };
    else if (held >= DIRECTOR.IDLE_MS && curHot < 2 && regs.length > 1) next = { id: scored.find((x) => x.r.id !== this.target)!.r.id, big: false };
    else if (held >= DIRECTOR.MAX_SUBJECT_MS && regs.length > 1) next = { id: scored.find((x) => x.r.id !== this.target)!.r.id, big: false };

    if (next && next.id !== this.target) {
      // a pending cut to somebody else gives way to this one
      want(next.id, next.big);
      if (this.target === next.id) return this.decide(now, prepare, big);
      if (!cur) return this.decide(now, prepare, false);
    }
    if (!cur) return this.decide(now, prepare, false);

    // ---- the grammar on the subject ----
    const me = cur.r;
    this.seen[me.id] = now;
    const shotHeld = now - this.shotAt;
    const h = this.hottest(me.id, now);
    const moment = !!h && now - h.at < DIRECTOR.MOMENT_MS && h.w >= DIRECTOR.MOMENT_W;
    const found = this.partner(me, now);
    // THE TWO-SHOT KEEPS ITS OTHER BODY: the one it was framed on, while it's alive and near (and whatever has
    // become of it, until the shot has had its time)
    const kept = this.shot === "two" && this.other ? this.bodies.get(this.other) : undefined;
    const keptLive = !!kept && kept.pose !== "z-dead" && kept.pose !== "dead" && Math.abs(kept.pos[1] - me.pos[1]) < 2.5
      && Math.hypot(kept.pos[0] - me.pos[0], kept.pos[2] - me.pos[2]) <= DIRECTOR.TWO_M;
    const partner = keptLive ? this.other : found;
    const setShot = (s: DShot): void => { this.shot = s; this.shotAt = now; this.shotPos = [...me.pos]; this.other = s === "two" ? partner : null; };
    const moving = MOVING.has(me.pose);
    const walkedOff = moving && !!this.shotPos && Math.hypot(me.pos[0] - this.shotPos[0], me.pos[2] - this.shotPos[2]) > DIRECTOR.WALKED_OFF_M;
    if (h) this.reason = h.reason;
    // (going down IS the big moment: its shot is one)
    if (this.downOrDead(me)) { if (this.shot !== "body") { setShot("body"); big = true; } }
    else if (this.shot === "body") { if (shotHeld >= DIRECTOR.MIN_SHOT_MS) setShot("follow"); }
    else if (this.shot === "wide") { if (shotHeld >= DIRECTOR.WIDE_MS) setShot(moment && !moving ? (partner ? "two" : "close") : "follow"); }
    else if (this.shot === "follow") { if (moment && !moving && shotHeld >= DIRECTOR.MIN_SHOT_MS) setShot(partner ? "two" : "close"); }
    else if (walkedOff && me.pose !== "grabbed") setShot("follow");
    else if (this.shot === "two") {
      if (shotHeld < DIRECTOR.MIN_SHOT_MS) { /* the frame holds (the runner pans it onto whoever is still there) */ }
      else if (!partner) setShot(moment ? "close" : "follow");
      else if (!moment && shotHeld >= DIRECTOR.CLOSE_MS) setShot("follow");
      else if (partner !== this.other) setShot("two");
    } else if (this.shot === "close") {
      if (!moment && shotHeld >= DIRECTOR.CLOSE_MS) setShot("follow");
      else if (moment && partner && shotHeld >= DIRECTOR.MIN_SHOT_MS) setShot("two");
    }
    return this.decide(now, prepare, big);
  }

  private decide(_now: number, prepare: Decision["prepare"], big: boolean): Decision {
    const air: OnAir = { target: this.target, other: this.other, shot: this.shot, reason: this.reason };
    const l = this.last;
    // a dip to black only between rooms (REALISM.md: "hard cuts, a dip to black between rooms")
    const sameRoom = !!l.target && !!air.target && this.bodies.get(l.target)?.room != null && this.bodies.get(l.target)?.room === this.bodies.get(air.target)?.room;
    const cut: CutKind = l.target !== air.target ? (air.target && l.target ? (sameRoom ? "hard" : "dip") : air.target ? "hard" : "none") : l.shot !== air.shot || l.other !== air.other ? "hard" : "none";
    this.last = air;
    return { ...air, cut, big, prepare, pending: this.pending?.target ?? null };
  }

  /** what's on air (no beat) */
  onAir(): OnAir { return { ...this.last }; }
}

/** the run a snapshot belongs to (src/survivorz/broadcast.ts stamps it; an older server sends none) */
export function runOf(f: { type: string }): string | null {
  const r = (f as { run?: unknown }).run;
  return typeof r === "string" && r ? r : typeof r === "number" ? String(r) : null;
}

/** a snapshot from a DIFFERENT run than the last one seen (the first run seen is not a change) */
export function runChanged(prev: string | null, next: string | null): boolean {
  return prev !== null && next !== null && prev !== next;
}

function toBody(b: Extract<ServerFrame, { type: "snap" }>["bodies"][number]): DBody {
  return { id: b.id, kind: b.kind, who: b.who, pos: b.pos, heading: b.heading, pose: b.pose, room: b.room, hp: b.hp, hpMax: b.hpMax, vitals: b.vitals, zkind: b.zkind, ...(b.escaped ? { escaped: true } : {}) };
}

export const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);
