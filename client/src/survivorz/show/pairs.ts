// SOLACE SURVIVORZ — THE SHOW: TWO BODIES IN ONE MOVE (Oct 31 2026). A grab, a bite, a rescue.
//
// The sim says a zombie took hold of a survivor (survivor.grabbed), bit them while it held them
// (survivor.bitten), and how it ended: they wrenched free (survivor.effort from the held one), a friend
// pulled it off (survivor.effort from the friend, `shove` the zombie), a knife went into its head
// (melee.stab), or they went down. The finisher pack has every one of those as TWO clips baked together
// — the zombie's half and the survivor's half — and they only meet (hands on a collar, teeth on a
// forearm) when both play from frame 0 together with the bodies standing exactly where the bake stood
// them. So for the length of the hold this file takes the two roots off the wire and puts them there
// (Actor.anchor), plays the halves in step, and gives the bodies back when it's over, the jump eased out.
//
// THE LAW (SURVIVORZ.md §10): a pair plays only where it MEASURED within the line for that zombie and
// that survivor — docs/survivorz/finisher-fit.json, read into pairs.json by scripts/survivorz/
// pair-table.mjs. A pair not in the table plays what it did before (the struggle loop, unpaired).
//
// WHO STAYS PUT: the zombie, at the start (it lunges a metre into the clip, so its root must be where
// it stands); the survivor is set where the placement says — the lunge drives them back half a metre,
// which is what it looks like. For a bite and the pull-off the held survivor stays and the others move.
import * as THREE from "three";
import type { Ev } from "../../../../src/survivorz/sim/wire";
import type { Actor, Actors } from "./actors";
import { PAIR_CHAINS } from "./stance";
import PAIRS from "./pairs.json";
import { showGeo } from "./direct";

/** ON THE FLOOR, NOT IN THE WALL (realism round 6, Nov 2026): a pair stands its bodies where the bake stood
 *  them — the survivor 1.7 m in front of the zombie for a grab — and once put a held survivor half into a wall.
 *  A pair plays only when every body it places stands on walkable floor (the sim's own walk grid: walls and
 *  furniture, a body's width in) with clear floor on the line between them; otherwise the unpaired struggle. */
function onFloor(...pts: THREE.Vector3[]): boolean {
  const g = showGeo();
  for (const p of pts) if (!g.walkable(p.x, p.y, p.z)) return false;
  for (let i = 1; i < pts.length; i++) for (let k = 1; k < 4; k++) {
    const a = pts[i - 1], b = pts[i], f = k / 4;
    if (!g.walkable(a.x + (b.x - a.x) * f, a.y, a.z + (b.z - a.z) * f)) return false;
  }
  return true;
}

type Chain = keyof typeof PAIR_CHAINS;
interface Table {
  chains: Record<string, Record<string, Partial<Record<Chain, string>>>>;
  bites: Record<string, Record<string, Partial<Record<"forearm" | "shoulder", [number, number, number]>>>>;
  pull: Record<string, Record<string, [number, number, number]>>;
}
const T = structuredClone(PAIRS) as unknown as Table;

/** A CREATOR BODY'S PAIRS (Nov 4 2026): the server's table for the bodies the character creator baked
 *  (src/routes/survivorz-pairs.ts mergedPairs — only what measured within the line, scripts/survivorz/
 *  pair-sweep.cjs) laid into the bundled one. The seven hand-made bodies' rows are never touched. */
export function addPairs(extra: Partial<Table> | null | undefined): void {
  if (!extra) return;
  for (const [z, by] of Object.entries(extra.chains ?? {})) for (const [s, row] of Object.entries(by ?? {})) if (!T.chains[z]?.[s]) (T.chains[z] ??= {})[s] = row;
  for (const [z, by] of Object.entries(extra.bites ?? {})) for (const [s, row] of Object.entries(by ?? {})) if (!T.bites[z]?.[s]) (T.bites[z] ??= {})[s] = row;
  for (const [s, by] of Object.entries(extra.pull ?? {})) if (!T.pull[s]) T.pull[s] = by;
}

/** where the survivor stands for each struggle chain, the zombie at the origin facing +Z
 *  (docs/survivorz/anim-pairs.mjs PAIR_PLACE — one placement a chain: the survivor can't slide between links) */
const CHAIN_PLACE: Record<Chain, { x: number; z: number; yaw: number }> = {
  front: { x: 0.05, z: 1.7, yaw: 180 },
  back: { x: 0.1, z: 1.5, yaw: 0 },
};
/** the knife lands in the skull this far into zv-knife-head (anim-recipes.js KNIFE.in): the death waits for it */
const KNIFE_IN_MS = 950;
const D2R = Math.PI / 180;
/** the pull-off pair plays only if the rescuer stands this close to the spot it puts them (m) */
const PULL_SNAP_M = 0.6;

interface Hold {
  survivor: Actor; zombie: Actor; chain: Chain;
  /** the pair frame: its origin (the zombie's root at the grab) and turn */
  o: THREE.Vector3; r: number;
  /** "start" (the grab), "idle" (held), "bite", "end" (breaking free / pulled off / knifed) */
  phase: "start" | "idle" | "bite" | "end";
  /** performance clock: when the phase's clip runs out */
  until: number;
  names: { s: [string, string, string]; z: [string, string, string] };
}

/** a point in a frame (origin o, turned r) — the wire's heading convention: facing = (sin h, cos h) */
function inFrame(o: THREE.Vector3, r: number, x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
  const c = Math.cos(r), s = Math.sin(r);
  return out.set(o.x + x * c + z * s, o.y, o.z - x * s + z * c);
}

export class Pairs {
  private holds = new Map<string, Hold>();
  constructor(private actors: Actors) {}

  /** every event, before the bodies' own handling; true = this file played the bodies for it */
  event(ev: Ev): boolean {
    const by = ev.by ? this.actors.get(ev.by) : undefined;
    const victim = ev.victim ? this.actors.get(ev.victim) : undefined;
    switch (ev.event) {
      case "survivor.grabbed": return !!(victim && by && this.grab(victim, by));
      case "survivor.bitten": {
        const h = victim && this.holds.get(victim.id);
        if (!h || !by || h.zombie !== by) return false;
        this.bite(h, String(ev.part ?? "forearm"));
        return true;   // (in a hold the bite is the pair's, or nothing: an unpaired flinch would break it)
      }
      case "survivor.effort": {
        if (!by) return false;
        const shoved = typeof ev.shove === "string" ? this.actors.get(ev.shove) : undefined;
        // the held one wrenching free (no `shove` on that one)
        const own = this.holds.get(by.id);
        if (own && !shoved) { this.free(own, null); return true; }
        // a friend pulling it off someone
        if (shoved) for (const h of this.holds.values()) if (h.zombie === shoved && h.survivor !== by) { this.free(h, by); return true; }
        return false;
      }
      case "melee.stab": {
        const h = by && this.holds.get(by.id);
        if (!h || !victim || h.zombie !== victim) return false;
        return this.knife(h);
      }
      case "survivor.down": case "survivor.dead": {
        const h = victim && this.holds.get(victim.id);
        if (h) this.drop(h, 350);
        return false;   // (the fall still plays: bridge.ts)
      }
      case "zombie.death": {
        for (const h of [...this.holds.values()]) {
          if (h.zombie !== victim) continue;
          // shot or struck down while it held them: it falls from where its hips are (the lunge put them a
          // metre off its root) and stays there; the survivor is let go
          const hp = h.zombie.hips(new THREE.Vector3());
          h.zombie.setForced(null);
          h.zombie.setAnchor(new THREE.Vector3(hp.x, h.o.y, hp.z), h.zombie.anchor?.h ?? h.r, 140);
          h.survivor.setForced(null); h.survivor.endShot(0.25); h.survivor.setAnchor(null, 0, 450);
          this.holds.delete(h.survivor.id);
        }
        return false;
      }
    }
    return false;
  }

  /** is this body in a hold now (its flinches belong to the pair) */
  holding(a: Actor | undefined): boolean { return !!a && (this.holds.has(a.id) || [...this.holds.values()].some((h) => h.zombie === a)); }

  /** a death to hold back (the knife lands after the blow), ms */
  deathDelay(z: Actor | undefined): number { return z && z.deathAt > performance.now() ? z.deathAt - performance.now() : 0; }

  // ---- the grab ----

  private grab(s: Actor, z: Actor): boolean {
    if (this.holds.has(s.id) || [...this.holds.values()].some((h) => h.zombie === z)) return false;
    if (s.kind !== "survivor" || z.kind !== "zombie" || !s.ready || !z.ready || s.dead || z.dead) return false;
    const row = T.chains[z.state.body]?.[s.state.body];
    if (!row) return false;
    // grabbed from behind when the survivor had their back to it (the wire's heading), if that chain is clean
    const toS = Math.atan2(s.pos.x - z.pos.x, s.pos.z - z.pos.z);
    const facing = Math.abs(Math.atan2(Math.sin(s.heading - toS), Math.cos(s.heading - toS)));
    const chain: Chain | null = facing < 70 * D2R && row.back ? "back" : row.front ? "front" : row.back ? "back" : null;
    if (!chain) return false;
    const codes = row[chain]!.match(/fz|zv/g) ?? [];
    const links = PAIR_CHAINS[chain];
    const sNames = [links.start, links.idle, links.free].map((c, i) => (codes[i] === "zv" ? `zv-${c}-${z.state.body}` : c)) as [string, string, string];
    const zNames = [links.start, links.idle, links.free].map((c) => `zd-${c}-${s.state.body}`) as [string, string, string];
    if (![...sNames].every((n) => s.canPlay(n)) || ![...zNames].every((n) => z.canPlay(n))) return false;
    // the frame: the zombie's root where it stands, turned so the survivor's place lies toward the survivor
    const P = CHAIN_PLACE[chain];
    const r = toS - Math.atan2(P.x, P.z);
    const o = z.pos.clone();
    if (!onFloor(o, inFrame(o, r, P.x, P.z))) return false;
    const h: Hold = { survivor: s, zombie: z, chain, o, r, phase: "start", until: 0, names: { s: sNames, z: zNames } };
    this.place(h, P, 650);
    s.setForced(sNames[1], Infinity, true);
    z.setForced(zNames[1], Infinity, true);
    s.playClip(sNames[0], { fadeIn: 0.25, fadeOut: 0.15, upper: false });
    z.playClip(zNames[0], { fadeIn: 0.2, fadeOut: 0.15, upper: false });
    h.until = performance.now() + z.clipLength(zNames[0]) * 1000;
    this.holds.set(s.id, h);
    return true;
  }

  /** the two roots where the chain's placement stands them (the survivor's place in the zombie's frame) */
  private place(h: Hold, P: { x: number; z: number; yaw: number }, ms: number): void {
    h.zombie.setAnchor(h.o, h.r, ms);
    h.survivor.setAnchor(inFrame(h.o, h.r, P.x, P.z), h.r + P.yaw * D2R, ms);
  }

  // ---- a bite while held: the bite's own pair, the survivor kept where they are ----

  private bite(h: Hold, part: string): void {
    if (h.phase === "bite" || h.phase === "end" || h.chain !== "front") return;
    const fits = T.bites[h.zombie.state.body]?.[h.survivor.state.body] ?? {};
    const want = part === "forearm" ? ["forearm", "shoulder"] : ["shoulder", "forearm"];
    const k = want.find((w) => fits[w as "forearm" | "shoulder"]) as "forearm" | "shoulder" | undefined;
    if (!k) return;
    const sName = `bd-bitten-${k}`, zName = `zd-bite-${k}-${h.survivor.state.body}`;
    if (!h.survivor.canPlay(sName) || !h.zombie.canPlay(zName)) return;
    const [bx, bz, byaw] = fits[k]!;
    // the survivor stays; the zombie stands where the bite's bake stood it in the survivor's frame
    const sh = h.survivor.anchor?.h ?? h.survivor.heading;
    const rz = sh - byaw * D2R;
    const sp = h.survivor.anchor?.p ?? h.survivor.pos;
    const zo = inFrame(sp, rz, -bx, -bz);
    if (!onFloor(sp, zo)) return;
    // (the frame is the zombie's: survivor = zombie + R(bx, bz), so zombie = survivor − R(bx, bz))
    h.zombie.setAnchor(zo, rz, 300);
    h.survivor.playClip(sName, { fadeIn: 0.25, fadeOut: 0.3, upper: false });
    h.zombie.playClip(zName, { fadeIn: 0.25, fadeOut: 0.3, upper: false });
    h.phase = "bite";
    h.until = performance.now() + Math.max(h.zombie.clipLength(zName), h.survivor.clipLength(sName)) * 1000;
  }

  // ---- the end of a hold ----

  /** broken free (rescuer null) or pulled off by `rescuer`: the pack's breaking-free on both, the rescuer's
   *  pull-off placed in the zombie's frame — then everyone handed back to the wire */
  private free(h: Hold, rescuer: Actor | null): void {
    if (h.phase === "end") return;
    // back to the chain's own placement first (a bite moved the zombie)
    if (h.phase === "bite") this.place(h, CHAIN_PLACE[h.chain], 250);
    h.phase = "end";
    const sFree = h.names.s[2], zFree = h.names.z[2];
    h.survivor.setForced(null); h.zombie.setForced(null);
    h.survivor.playClip(sFree, { fadeIn: 0.2, fadeOut: 0.4, release: 500, upper: false });
    h.zombie.playClip(zFree, { fadeIn: 0.2, fadeOut: 0.45, release: 600, upper: false });
    if (rescuer && h.chain === "front") {
      const at = T.pull[rescuer.state.body]?.[h.zombie.state.body];
      const name = `zv-pull-off-${h.zombie.state.body}`;
      if (at && rescuer.ready && !rescuer.dead && rescuer.canPlay(name)) {
        // the zombie's root is at (x, z) turned yaw in the rescuer's frame: rescuer = zombie − R(x, z)
        const rr = h.r - at[2] * D2R;
        const spot = inFrame(h.o, rr, -at[0], -at[1]);
        // only from where they stand: the sim lets a friend pull from 1.8 m of the held one, which can put
        // the zombie 2.5 m off — anchoring that far would glide them a metre in 0.3 s, so the pair plays
        // only when they're nearly in place and the plain shove covers the rest
        if (Math.hypot(spot.x - rescuer.root.position.x, spot.z - rescuer.root.position.z) <= PULL_SNAP_M && onFloor(spot, h.o)) {
          rescuer.setAnchor(spot, rr, 300);
          rescuer.playClip(name, { fadeIn: 0.15, fadeOut: 0.4, release: 450, upper: false });
        }
      }
    }
    this.holds.delete(h.survivor.id);
  }

  /** the knife into the side of its head (zv-knife-head on the held survivor; the zombie's half stays the
   *  held loop, and its death lands with the blade) */
  private knife(h: Hold): boolean {
    if (h.chain !== "front" || h.phase === "end") return false;
    const name = `zv-knife-head-${h.zombie.state.body}`;
    if (!h.survivor.canPlay(name)) return false;
    if (h.phase === "bite") this.place(h, CHAIN_PLACE.front, 200);
    h.phase = "end";
    h.survivor.setForced(null);
    h.survivor.playClip(name, { fadeIn: 0.15, fadeOut: 0.4, release: 450 });
    h.zombie.deathAt = performance.now() + KNIFE_IN_MS;
    // the zombie holds the struggle until the blade lands; it falls where it is (Actor's held-back death)
    const z = h.zombie;
    setTimeout(() => { if (!z.dead) z.setAnchor(null, 0, 400); z.setForced(null); }, KNIFE_IN_MS + 1500);
    this.holds.delete(h.survivor.id);
    return true;
  }

  /** a hold ended by something else (down, dead, a zombie killed by a third party): both let go */
  private drop(h: Hold, ms: number): void {
    h.survivor.setForced(null); h.zombie.setForced(null);
    h.survivor.endShot(0.2); h.zombie.endShot(0.25);
    h.survivor.setAnchor(null, 0, ms); h.zombie.setAnchor(null, 0, ms);
    this.holds.delete(h.survivor.id);
  }

  /** every frame: phases that ran out, and holds the wire ended without an event */
  update(): void {
    const now = performance.now();
    for (const h of [...this.holds.values()]) {
      const gone = !this.actors.get(h.survivor.id) || !this.actors.get(h.zombie.id) || h.survivor.dead || h.zombie.dead;
      // (the wire let them go: no longer grabbed, and the grab's own clip is over)
      if (gone || (h.survivor.state.pose !== "grabbed" && h.phase !== "start")) { this.drop(h, 400); continue; }
      if ((h.phase === "start" || h.phase === "bite") && now >= h.until) {
        if (h.phase === "bite") this.place(h, CHAIN_PLACE[h.chain], 350);
        h.phase = "idle";
      }
    }
    // THE SAFETY NET: a body still pinned by a hold that's over, with no clip left to let it go, goes back to the
    // wire (Nov 2026: Rollo wrenched free, a flinch cut the free clip short, and he stayed pinned at the grab's
    // spot while the sim ran him round the bunker — fights and falls drawn a room away from where they were)
    for (const a of this.actors.list.values()) {
      if (!a.strandedAnchor || this.holding(a)) continue;
      a.setAnchor(null, 0, 400);
    }
  }

  clear(): void { for (const h of [...this.holds.values()]) this.drop(h, 0); }
}
