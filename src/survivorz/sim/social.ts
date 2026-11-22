// SOLACE SURVIVORZ — WHAT THEY DO TO EACH OTHER (Nov 2026, Josh: "as autonomous as we can possibly code …
// the ai does the rest whether they die or not").
//
// Options a survivor's own mind can pick from the job menu, offered ONLY while the model decides
// (hooks.aiDecides): give somebody something, steal from them, own up to a hidden bite. Code never picks one
// of these on its own — they score far under anything else on the menu, so a model that's down leaves the
// show exactly as it was. Survivor.ts walks them over; this file says what's on offer and what changes hands.
import type { Job, SimWorld, Survivor } from "./world";
import { cap } from "./world";
import { note, witness } from "./knowledge";
import { reveal } from "./infection";

/** what a social option scores: far under anything code would pick for itself */
export const SOCIAL_SCORE = -500;
export const SOCIAL_KINDS = new Set(["give", "steal", "confess", "attack"]);

type Thing = "food" | "water" | "bandage" | "medkit" | "battery" | "ammoP" | "ammoR" | "antiviral";
const WORD: Record<Thing, string> = { food: "food", water: "water", bandage: "bandages", medkit: "medkit", battery: "batteries", ammoP: "pistol rounds", ammoR: "rifle rounds", antiviral: "antiviral" };
const THINGS: Thing[] = ["antiviral", "medkit", "food", "water", "bandage", "ammoP", "ammoR", "battery"];

export function holds(s: Survivor, k: Thing): number {
  return k === "antiviral" ? s.pack.spare.filter((x) => x === "antiviral").length : s.pack[k];
}
function take(s: Survivor, k: Thing, n: number): number {
  if (k === "antiviral") { let got = 0; while (got < n) { const i = s.pack.spare.indexOf("antiviral"); if (i < 0) break; s.pack.spare.splice(i, 1); got++; } return got; }
  const got = Math.min(n, s.pack[k]); s.pack[k] -= got; return got;
}
function put(s: Survivor, k: Thing, n: number): void {
  if (k === "antiviral") for (let i = 0; i < n; i++) s.pack.spare.push("antiviral");
  else s.pack[k] += n;
}
const isThing = (x: unknown): x is Thing => typeof x === "string" && x in WORD;

/** The people in the room with them a hand could reach: alive, in the show, not hiding as a newcomer. */
function near(w: SimWorld, s: Survivor): Survivor[] {
  return w.survivors.filter((o) => o !== s && o.alive && !o.escaped && !o.hidden && o.room === s.room && s.room >= 0 && o.mode !== "down" && o.mode !== "dead");
}

/** GIFTS DON'T BOUNCE (the Nov 12 2026 review: 23 gifts in 15 minutes — Rick and Ben handed the same food and
 *  rounds back and forth eight times, because "they have less than you" was true again the moment half had moved).
 *  A gift is for somebody who has NONE of the thing; one gift every GIVE_GAP_MS; and nothing goes back to the
 *  one who just gave to you for GIVE_BACK_MS. */
const GIVE_GAP_MS = 5 * 60_000, GIVE_BACK_MS = 15 * 60_000;
/** what one calls another on the menu: a name once they've met */
const called = (s: Survivor, o: Survivor): string => (s.met?.has(o.who) ? cap(o.who) : "the stranger");

/** The social options on a survivor's menu. `add` is pickJob's own. */
export function socialOptions(w: SimWorld, s: Survivor, add: (score: number, label: string, job: Omit<Job, "since" | "phase" | "until"> & { until?: number }, id?: string) => void): void {
  if (!w.hooks.aiDecides?.(w) || s.mode !== "job") return;
  const t = w.t;
  // a hidden bite: owning up is theirs to choose, and when
  if (s.infected && !s.infKnown && s.bitten) add(SOCIAL_SCORE, "tell the others you've been bitten", { kind: "confess", cell: s.cell, until: t + 60_000 }, "confess");
  for (const o of near(w, s)) {
    // give: the thing they're shortest of that you can spare
    const mayGive = t - (s.gaveAt ?? -1e12) >= GIVE_GAP_MS && t - (s.gotFrom?.[o.who] ?? -1e12) >= GIVE_BACK_MS;
    const give = mayGive ? THINGS.find((k) => holds(s, k) > (k === "antiviral" || k === "medkit" ? 0 : 1) && holds(o, k) === 0) : undefined;
    if (give) add(SOCIAL_SCORE, `give ${called(s, o)} some of your ${WORD[give]}`, { kind: "give", ally: o.i, cell: o.cell, target: give, until: t + 3 * 60_000 }, `give:${o.who}`);
    // steal: the thing they have most of that you have less of
    const steal = THINGS.find((k) => holds(o, k) > 0 && holds(o, k) > holds(s, k));
    if (steal) add(SOCIAL_SCORE, `steal ${called(s, o)}'s ${WORD[steal]}${o.mode === "sleep" ? " while they sleep" : ""}`, { kind: "steal", ally: o.i, cell: o.cell, target: steal, until: t + 3 * 60_000 }, `steal:${o.who}`);
    // and the worst of it: turning on them (Josh, Nov 2026: "survivors can attack and kill each other")
    add(SOCIAL_SCORE - 100, `attack ${called(s, o)}${o.mode === "sleep" ? " in their sleep" : ""}`, { kind: "attack", ally: o.i, cell: o.cell, until: t + 2 * 60_000 }, `attack:${o.who}`);
  }
  // somebody down in the room: finishing them is a choice too (helping them up is already on the menu)
  for (const o of w.survivors) {
    if (o === s || !o.alive || o.mode !== "down" || o.room !== s.room || s.room < 0) continue;
    add(SOCIAL_SCORE - 100, `finish ${called(s, o)} off`, { kind: "attack", ally: o.i, cell: o.cell, target: "finish", until: t + 60_000 }, `finish:${o.who}`);
  }
}

/** Still possible? (pickJob's stillLegal for these kinds) */
export function socialLegal(w: SimWorld, s: Survivor, j: Job): boolean {
  if (j.kind === "confess") return s.infected && !s.infKnown;
  if (j.kind === "attack") {
    const v = w.bodies[j.ally!] as Survivor | undefined;
    return !!v && v.alive && v.floor === s.floor && (j.target === "finish" ? v.mode === "down" : v.mode !== "down");
  }
  const o = w.bodies[j.ally!] as Survivor | undefined;
  if (!o || !o.alive || o.room !== s.room || !isThing(j.target)) return false;
  return j.kind === "give" ? holds(s, j.target) > 0 : holds(o, j.target) > 0;
}

/** At arm's length: the thing changes hands. Says so, and the ones who saw it remember. */
export function socialAct(w: SimWorld, s: Survivor): void {
  const j = s.job!;
  if (j.kind === "confess") { s.job = null; if (s.infected && !s.infKnown) reveal(w, s, "told"); return; }
  const o = w.bodies[j.ally!] as Survivor;
  const k = j.target as Thing;
  s.job = null;
  if (!o?.alive || !isThing(k)) return;
  if (j.kind === "give") {
    const n = take(s, k, k === "antiviral" || k === "medkit" ? 1 : Math.max(1, Math.ceil(holds(s, k) / 2)));
    if (!n) return;
    put(o, k, n);
    s.gaveAt = w.t; (o.gotFrom ??= {})[s.who] = w.t;
    note(s.know, w.t, `gave ${cap(o.who)} ${WORD[k]}`);
    note(o.know, w.t, `${cap(s.who)} gave me ${WORD[k]}`);
    w.ev("survivor.give", { by: s.id, to: o.id, what: k, n });
    w.say(s.who, "give", { to: o.who, what: WORD[k], n });
    return;
  }
  // a theft: the one robbed notices if they're awake; anybody awake who can see it does too
  const n = take(o, k, k === "antiviral" || k === "medkit" ? 1 : Math.max(1, Math.ceil(holds(o, k) / 2)));
  if (!n) return;
  put(s, k, n);
  const noticed = o.mode !== "sleep";
  const seenBy: string[] = [];
  witness(w, s.x, s.z, s.floor, 8, (b) => {
    if (b === s) return null;
    if (b !== o) seenBy.push(b.who);
    return b === o ? `${cap(s.who)} stole my ${WORD[k]}` : `I saw ${cap(s.who)} steal ${cap(o.who)}'s ${WORD[k]}`;
  });
  note(s.know, w.t, `took ${cap(o.who)}'s ${WORD[k]}${noticed || seenBy.length ? " — and got seen" : " — nobody saw"}`);
  w.ev("survivor.steal", { by: s.id, from: o.id, what: k, n, seen: noticed || seenBy.length > 0 });
  w.say(s.who, "steal", { from: o.who, what: WORD[k], n, noticed, seenBy });
}
