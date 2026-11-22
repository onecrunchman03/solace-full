// SOLACE SURVIVORZ — WHAT ONE SURVIVOR KNOWS, AS THE MODEL READS IT.
//
// The knowledge is the sim's (src/survivorz/sim/knowledge.ts: `factsFor(w, who)` — what that one
// survivor knows and feels right now, never the unseen map). This file only turns it into the
// FACTS lines a prompt carries, and is the one place the talk layer reads the world through:
// nothing of the world reaches a model except what passes here, the moment's own words (minds.ts
// MOMENT), and the menu's labels (which the sim writes from the same knowledge).
import { factsFor as knowledgeOf, type SurvivorFacts } from "../sim/knowledge";
import type { SurvivorId } from "../genes";
import type { MenuOption, SimWorld, Survivor } from "../sim/world";
import { SHEETS } from "./sheets";

export type { SurvivorFacts };
export const factsFor = knowledgeOf;

const nm = (who: string): string => SHEETS[who as SurvivorId]?.short ?? who;

/** FACTS for one survivor, as the prompt carries them: knowledge.ts's facts, then THE BELT AND
 *  BRACES — any room name in them the survivor has never seen (a noise heard behind a wall, a
 *  friend last seen somewhere they haven't been) is said as a place they don't know. The talk
 *  layer must never be the thing that names the unseen map, whatever the facts hand it. */
export function factsText(w: SimWorld, who: SurvivorId): string[] {
  const f = factsFor(w, who);
  if (!f) return [];
  const s = w.survivors.find((x) => x.who === who);
  const unseen = new Set<string>(), seen = new Set<string>();
  for (let r = 0; r < w.nav.rooms.length; r++) {
    const name = w.nav.rooms[r].name;
    if ((s && knowsRoom(s, r)) || s?.room === r) seen.add(name); else unseen.add(name);
  }
  for (const n of seen) unseen.delete(n);
  const place = (name: string, what: string) => (unseen.has(name) ? what : name);
  f.threats = f.threats.map((t) => ({ ...t, where: place(t.where, "somewhere you haven't been") }));
  f.others = f.others.map((o) => ({ ...o, last: place(o.last, "somewhere you haven't been") }));
  // STRANGERS UNTIL THEY MEET (BUNKER.md follow-up 30): somebody they've never met isn't on their list at all,
  // and one standing beside them is "somebody you haven't met"
  const met = (o: string) => !s || !s.met || s.met.has(o as SurvivorId);
  f.others = f.others.filter((o) => met(o.who));
  const call = (o: string) => (met(o) ? nm(o) : "somebody you haven't met");
  let lines = factsLines(f, call);
  f.rooms = f.rooms.filter((r) => !unseen.has(r.name));
  f.doors = f.doors.map((d) => ({ ...d, at: place(d.at, "a room you know"), to: unseen.has(d.to) ? "unknown" : d.to }));
  // anything else (a line in what they saw) that still names one: the place goes, the line stays
  lines = lines.map((l) => { for (const n of unseen) if (l.includes(n)) l = l.split(n).join("somewhere you haven't been"); return l; });
  return lines;
}

/** FACTS, as the model reads them — plain lines, every field from knowledge.ts. */
export function factsLines(f: SurvivorFacts, call: (who: string) => string = nm): string[] {
  const out: string[] = [];
  const m = f.me;
  out.push(`It's ${f.when}. You're in ${f.where}${f.known.home && f.known.home === f.where ? " (your safe room)" : ""}, ${f.doing}.`);
  out.push(`You: health ${m.hp} of 100, ${m.stamina}, ${m.hunger}, ${m.thirst}, ${m.sleep}, spirits ${m.morale} of 100${m.bleeding ? ", BLEEDING" : ""}${m.scared ? ", scared" : ""}${m.bitten ? ", and you've been BITTEN (only you know)" : ""}.`);
  const c = f.carrying;
  const pack = [c.food ? `${c.food} food` : "", c.water ? `${c.water} water` : "", c.bandages ? `${c.bandages} bandages` : "", c.medkits ? `${c.medkits} med kits` : "", c.keycard ? c.keyName ?? `a level-${c.keycard} keycard` : "", ...(c.spare ?? [])].filter(Boolean);
  out.push(`On you: ${c.weapon}${c.gun ? `, a ${c.gun} with ${c.rounds ?? 0} rounds` : ""}${pack.length ? "; " + pack.join(", ") : ""}.`);
  if (f.withMe.length) out.push(`With you: ${f.withMe.map((o) => `${call(o.who)} (${o.doing})`).join("; ")}.`);
  else out.push("Nobody's with you.");
  for (const o of f.others) out.push(o.doing === "dead" ? `${nm(o.who)} is dead.` : o.last === "unknown" ? `${nm(o.who)}: you don't know where they are.` : `${nm(o.who)}: last seen ${/^somewhere/.test(o.last) ? o.last : "in " + o.last} ${o.ago === "just now" ? "just now" : o.ago + " ago"}, ${o.doing}.`);
  out.push(`You know ${f.known.rooms} rooms here and have been in ${f.known.visited}${f.known.home ? `; home is ${f.known.home}` : ""}.`);
  for (const r of f.rooms) out.push(`${r.name}: ${r.note}.`);
  for (const d of f.doors) out.push(`A door from ${d.at} to ${d.to === "unknown" ? "somewhere you haven't seen" : d.to}: ${d.state}.`);
  for (const t of f.threats) out.push(`The dead: ${t.what} ${/^somewhere/.test(t.where) ? t.where : "in " + t.where}, ${t.ago === "just now" ? "just now" : t.ago + " ago"}.`);
  if (f.storage) { const s = f.storage; out.push(`The storage box (as you last saw it, ${s.ago === "just now" ? "just now" : s.ago + " ago"}): ${s.food} food, ${s.water} water, ${s.bandages} bandages, ${s.medkits} med kits, ${s.ammo} rounds.`); }
  for (const q of f.questions) out.push(`On your mind: ${q}.`);
  for (const s of f.saw) out.push(`You saw: ${s}.`);
  return out;
}

/** Earshot: the same room, or close on the same floor. */
const EARSHOT_M = 12;
export const nearby = (a: Survivor, b: Survivor): boolean =>
  a !== b && b.alive && a.floor === b.floor && (a.room === b.room || Math.hypot(a.x - b.x, a.z - b.z) <= EARSHOT_M);

/** A menu option as the model is offered it: the sim's own label (written from what they know);
 *  an option without one is offered by its kind alone, never its id. */
export type MenuItem = Partial<MenuOption> & { id: string };
const KIND_WORD: Record<string, string> = {
  sleep: "get some sleep", revive: "go back for whoever's down", resupply: "go back to the box and restock", explore: "explore",
  loot: "search for supplies", read: "read a terminal", breaker: "try to get the power on", escort: "go out with whoever's heading out",
  guard: "keep watch", talk: "talk with whoever's here", rest: "rest in the safe room", home: "head back to the safe room", patrol: "walk a patrol",
};
export const kindOf = (id: string): string => id.split(":")[0];
export function labelFor(item: MenuItem): string {
  return item.label?.trim() || KIND_WORD[kindOf(item.id)] || kindOf(item.id).replace(/[-_]/g, " ");
}

/** The survivor's own knowledge of rooms (for the harness and the plans): a room they've seen. */
export function knowsRoom(s: Survivor, r: number): boolean {
  return r >= 0 && !!s.know?.room[r];
}

export type { SimWorld };
