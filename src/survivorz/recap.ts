// SOLACE SURVIVORZ — THE RECAP (Josh, Nov 1 2026: "a small popup in the stream that comes up every now and
// then with a summary of what is currently happening"). There's no narrator, so every few minutes the
// screen says where things stand: who's where doing what, what just happened, what's at stake.
//
// What it may say is PUBLIC by construction — the same rule as the cast cards (show/overlay.ts): only what
// a viewer could know from watching. A hidden bite is never in the facts (only an infection the group
// KNOWS about), a hiding newcomer is never named, and a spoken line that mentions a bite is dropped. The
// model (the house's 26B, when the show's brain is up) writes two short sentences from those facts; any
// number it wasn't shown, or anything over THE LINE, and the plain-words fallback goes out instead.
import { crossesLine, knownNumbers, numbersIn } from "../npc/guard";
import { goalsWire } from "./sim/goals";
import type { Recap, ServerFrame } from "./sim/wire";
import type { SimWorld } from "./sim/world";
import type { TalkModel } from "./talk/model";
import { SHEETS } from "./talk/sheets";
import type { SurvivorId } from "./genes";

export const RECAP = {
  /** between recaps (real time: it's for the people watching) */
  everyMs: Number(process.env.SURVIVORZ_RECAP_MS ?? 6 * 60_000),
  /** the first one after a boot or a new run */
  firstMs: 3 * 60_000,
  /** how long it stays on screen */
  showMs: 16_000,
  /** what's kept: moments within this much show time, the last few of them */
  momentsMs: 3 * 3_600_000,
  moments: 10,
  speech: 8,
  speechMs: 20 * 60_000,
  maxChars: 260,
  timeoutMs: 12_000,
};

export type RecapFrame = Recap;

const name = (who: string): string => SHEETS[who as SurvivorId]?.short ?? who.charAt(0).toUpperCase() + who.slice(1);
const who = (v: unknown): string | null => (typeof v === "string" && v.startsWith("s:") ? v.slice(2) : typeof v === "string" && v in SHEETS ? v : null);
const ZONE: Record<string, string> = { lobby: "the Lobby", residential: "Residential", labs: "the Labs", medical: "Medical", security: "Security", power: "Power", containment: "Containment", deep: "the Deep lab" };
const zone = (z: unknown): string => (typeof z === "string" ? ZONE[z] ?? z : "a new wing");
const DOING: Record<string, string> = {
  explore: "exploring", loot: "searching for supplies", read: "reading the records", breaker: "working on the power",
  resupply: "restocking from the box", sleep: "asleep", revive: "going back for someone who's down", escort: "on escort",
  guard: "keeping watch", rest: "resting", home: "heading back to the safe room", talk: "talking it over", patrol: "on patrol",
  shut: "shutting doors", flee: "running", fight: "fighting", down: "down and bleeding out", idle: "waiting",
};
/** a spoken line about a bite is never repeated: it might be the one secret the screen keeps */
const BITE = /\bbit(e|es|ten|ing)?\b|\binfect/i;

export class Recapper {
  private moments: { t: number; line: string }[] = [];
  private speech: { t: number; line: string }[] = [];
  private nextAt = Date.now() + RECAP.firstMs;
  private busy = false;

  /** every frame the world sends (the sim's and the minds' `say` lines) */
  feed(w: SimWorld, f: ServerFrame): void {
    if (f.type === "say") {
      const by = who(f.by);
      if (by && !BITE.test(f.text)) this.speech.push({ t: f.t, line: `${name(by)}: "${f.text.slice(0, 160)}"` });
      if (this.speech.length > RECAP.speech) this.speech.splice(0, this.speech.length - RECAP.speech);
      return;
    }
    if (f.type !== "ev") return;
    const e = f as unknown as Record<string, unknown>;
    const by = who(e.by), victim = who(e.victim);
    let line: string | null = null;
    switch (f.event) {
      case "survivor.dead": if (victim) line = `${name(victim)} died${causeOf(w, victim)}`; break;
      case "survivor.turned": if (victim) line = `${name(victim)} turned into one of the dead`; break;
      case "survivor.down": if (victim) line = `${name(victim)} went down`; break;
      case "survivor.revived": if (victim) line = `${by ? name(by) : "someone"} got ${name(victim)} back on their feet`; break;
      case "infection.known": if (victim) line = `the group found out ${name(victim)} is infected`; break;
      case "survivor.cured": if (victim) line = `${name(victim)} was cured`; break;
      case "zone.found": line = `${by ? name(by) : "someone"} found the way into ${zone(e.zone)}`; break;
      case "keycard.found": line = `${by ? name(by) : "someone"} found a level-${Number(e.tier) || "?"} keycard`; break;
      case "zombie.arrived": line = `more of the dead got into ${zone(e.zone)}`; break;
      case "containment.breach": line = "Containment's lockdown failed: the specimen cells are open"; break;
      case "paper": case "terminal.type": case "recorder.play": if (by && typeof e.title === "string") line = `${name(by)} read "${e.title.slice(0, 80)}"`; break;
      case "truth.found": line = "the group learned the truth about what happened here"; break;
      case "sample.taken": line = `${by ? name(by) : "someone"} took a sample for the cure`; break;
      case "lazarus.start": line = "work on the cure has started"; break;
      case "lazarus.done": line = "a dose of the cure is ready"; break;
      case "cure.proven": line = "the cure works"; break;
      case "escape.planned": line = "the group decided to try for the way out"; break;
      case "survivor.escaped": if (by || victim) line = `${name((by ?? victim)!)} got out alive`; break;
      case "survivor.found": if (victim) line = `${by ? name(by) : "the group"} found ${name(victim)} hiding`; break;
      case "safe.found": line = "the group found a new safe room"; break;
      case "zone.powered": if (e.on !== false) line = `the power came back on in ${zone(e.zone)}`; break;
      default: break;
    }
    if (!line) return;
    this.moments.push({ t: f.t, line });
    if (this.moments.length > RECAP.moments) this.moments.splice(0, this.moments.length - RECAP.moments);
  }

  /** a new run: nothing from the old world */
  reset(): void { this.moments = []; this.speech = []; this.nextAt = Date.now() + RECAP.firstMs; }

  /** Call from the world's tick. When one is due, writes it and hands the frame to `emit`. */
  tick(w: SimWorld, model: TalkModel | null, emit: (f: RecapFrame) => void, now = Date.now()): void {
    if (RECAP.everyMs <= 0 || this.busy || now < this.nextAt || w.overAt) return;
    this.nextAt = now + RECAP.everyMs;
    const facts = this.facts(w);
    if (!facts.length) return;
    const title = `RIGHT NOW · DAY ${w.day()}`;
    const plain = this.plain(w);
    const send = (text: string): void => emit({ type: "recap", t: w.t, title, text, ms: RECAP.showMs });
    if (!model?.up()) { send(plain); return; }
    this.busy = true;
    void this.write(model, facts).catch(() => null).then((text) => { this.busy = false; send(text ?? plain); });
  }

  /** what the recap may be written from — public, every line */
  facts(w: SimWorld): string[] {
    const out: string[] = [`It's day ${w.day()} of the show.`];
    const alive = w.survivors.filter((s) => s.alive && !s.hidden);
    if (!alive.length) return [];
    for (const s of alive) {
      const room = w.nav.rooms[s.room]?.name ?? "somewhere in the facility";
      const v = s as unknown as { infKnown?: boolean; sick?: number; bleeding?: number; mode?: string; job?: { kind?: string } | null; actor?: { hp?: number } };
      const doing = v.mode === "down" ? DOING.down : v.mode === "job" ? DOING[v.job?.kind ?? ""] ?? "busy" : DOING[v.mode ?? ""] ?? "waiting";
      const notes = [
        `health ${Math.round(v.actor?.hp ?? 100)} of 100`,
        v.bleeding ? "bleeding" : "",
        v.infKnown ? "infected (they know)" : (v.sick ?? 0) >= 3 ? "coughing and feverish" : "",
      ].filter(Boolean).join(", ");
      out.push(`${name(s.who)}: in ${room}, ${doing}; ${notes}.`);
    }
    const dead = w.survivors.filter((s) => !s.alive && !s.escaped && !s.hidden);
    if (dead.length) out.push(`Dead: ${dead.map((s) => `${name(s.who)}${causeOf(w, s.who)}`).join("; ")}.`);
    const out2 = w.survivors.filter((s) => s.escaped);
    if (out2.length) out.push(`Got out alive: ${out2.map((s) => name(s.who)).join(", ")}.`);
    try {
      const g = goalsWire(w);
      out.push(`The blast door: ${g.door.sealed ? "sealed" : `${Math.round(g.door.crank * 100)}% cranked shut`}. The radio: ${g.radio.called ? "the call is made" : g.radio.fixed ? "working, no call yet" : g.radio.open ? `the room is open, the repair ${Math.round(g.radio.repair * 100)}% done` : "still locked"}.`);
    } catch { /* the goals are a nicety */ }
    const recent = this.moments.filter((m) => m.t > w.t - RECAP.momentsMs);
    if (recent.length) out.push(`Lately: ${recent.map((m) => m.line).join("; ")}.`);
    const said = this.speech.filter((m) => m.t > w.t - RECAP.speechMs);
    if (said.length) out.push(`Overheard: ${said.map((m) => m.line).join(" ")}`);
    return out;
  }

  /** the fallback: plain words, no model */
  plain(w: SimWorld): string {
    const groups = new Map<string, string[]>();
    for (const s of w.survivors.filter((x) => x.alive && !x.hidden)) {
      const v = s as unknown as { mode?: string; job?: { kind?: string } | null };
      const doing = v.mode === "down" ? DOING.down : v.mode === "job" ? DOING[v.job?.kind ?? ""] ?? "busy" : DOING[v.mode ?? ""] ?? "waiting";
      const key = `${doing} in ${w.nav.rooms[s.room]?.name ?? "the facility"}`;
      groups.set(key, [...(groups.get(key) ?? []), name(s.who)]);
    }
    const parts = [...groups].sort((a, b) => b[1].length - a[1].length).slice(0, 3)
      .map(([what, names]) => `${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} are` : `${names[0]} is`} ${what}`);
    let text = parts.length ? `${parts.join(". ")}.` : "";
    const last = this.moments.filter((m) => m.t > w.t - RECAP.momentsMs).pop();
    if (last) text += ` Lately, ${last.line}.`;
    return text.slice(0, RECAP.maxChars).trim();
  }

  private async write(model: TalkModel, facts: string[]): Promise<string | null> {
    const shown = facts.join("\n");
    const system = "You write the short on-screen recap for a 24/7 live stream: six survivors trapped in an abandoned research facility overrun by the dead, nobody narrating. " +
      "Write TWO short sentences, 40 words at most, present tense, plain words. Say what's happening right now and what's at stake next. " +
      "Use ONLY the facts you're given — no invented events, places, numbers or names. No questions, no hype, no emoji, no quotation marks, no headings.";
    const raw = await model.ask([{ role: "system", content: system }, { role: "user", content: `FACTS:\n${shown}\n\nThe recap:` }], { maxTokens: 120, temperature: 0.7 });
    if (!raw) return null;
    const text = raw.replace(/[*_#`"“”]/g, "").replace(/\s+/g, " ").replace(/^(recap|right now)\s*[:\-–]\s*/i, "").trim();
    if (text.length < 20 || text.length > RECAP.maxChars) return null;
    if (crossesLine(text)) return null;
    const ok = knownNumbers(shown);
    if (numbersIn(text).some((n) => !ok.has(n))) return null;
    if (BITE.test(text) && !/infected/.test(shown)) return null;
    return text;
  }
}

function causeOf(w: SimWorld, id: string): string {
  const s = w.survivors.find((x) => x.who === id);
  return s?.cause ? ` (${s.cause})` : "";
}
