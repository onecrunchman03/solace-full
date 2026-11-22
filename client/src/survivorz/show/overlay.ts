// SOLACE SURVIVORZ — WHAT THE BROADCAST GRAPHICS SAY. Pure: the director's bodies and deaths in,
// plain rows out (Overlay.svelte draws them; the harness reads them).
//
// THE BUNKER (BUNKER.md 38) TURNED THE OLD RULE ROUND: a bite shows on the cast card AT ONCE — the BITTEN mark —
// even while the group doesn't know (the drama is watching them hide it). The brain's `why` (the admin's overlay)
// still never reaches the broadcast. Rows are built field by field, never by spreading a body.
import type { DBody, Death } from "./director";
import type { Goals, SurvivorInv } from "../../../../src/survivorz/sim/wire";

/** a room id → its name (the caller hands the map in: this file stays import-free for the harness) */
export type RoomName = (id: string | null | undefined) => string | undefined;
import type { PublicCharacter } from "../../../../src/survivorz/cast/rules";
import PUBLIC_JSON from "../../../../src/survivorz/cast/public.json" with { type: "json" };

/** The cast as the lower third names them (SURVIVORZ.md §4 — who they are, not what they look like): each
 *  character's file, through the public half the creator writes (no sheets, no genes reach the page). */
export const CAST: Record<string, { name: string; tag: string }> = {};
/** The order the cast strip runs in. */
export const CAST_ORDER: string[] = [];
/** who's in a sealed suit (Rollo): the voice comes through a visor */
export const SUITED_CAST: ReadonlySet<string> = new Set<string>();
/** character → baked body */
export const BODY_OF: Record<string, string> = {};
/** who's on the bench, first in line first (the admin's "bring in" buttons) */
export const BENCH_CAST: { id: string; name: string }[] = [];
/** each character's register of voice (for lending a voice-sound set: audio/cues.ts vocalStandIn) */
export const VOX_CAST: { id: string; vox?: string }[] = [];

/** THE CAST IS LIVE (Nov 4 2026): the bundled public.json is only the start; the show's socket sends a
 *  "cast" frame after every snapshot and whenever the panel's list changes, and every table above is
 *  refilled IN PLACE (the director and the bridge hold them). A character who leaves keeps their name. */
export function setPublicCast(list: readonly PublicCharacter[]): void {
  const ok = list.filter((c) => c && typeof c.id === "string" && typeof c.name === "string");
  for (const c of ok) { CAST[c.id] = { name: c.name, tag: String(c.tag ?? "") }; BODY_OF[c.id] = String(c.body ?? ""); }
  CAST_ORDER.length = 0;
  CAST_ORDER.push(...[...ok].sort((a, b) => a.strip - b.strip).map((c) => c.id));
  const suited = SUITED_CAST as Set<string>;
  suited.clear();
  for (const c of ok) if (c.suited) suited.add(c.id);
  BENCH_CAST.length = 0;
  BENCH_CAST.push(...ok.filter((c) => c.status === "bench").map((c) => ({ id: c.id, name: c.name })));
  // (a character who leaves the list keeps their entry: their voice may still be the one somebody borrows)
  for (const c of ok) { const i = VOX_CAST.findIndex((x) => x.id === c.id); const row = { id: c.id, vox: c.vox }; if (i >= 0) VOX_CAST[i] = row; else VOX_CAST.push(row); }
}
setPublicCast(PUBLIC_JSON as PublicCharacter[]);

/** EACH SURVIVOR'S COLOUR (BUNKER.md 29): the name tag, the card's edge, the minimap dot. */
export const COLOUR: Record<string, string> = {
  rick: "#e8b04a", johanna: "#58b8ff", dale: "#86d66b", ben: "#ef7a5c", sarah: "#c792f2", rollo: "#4fd8c9", claudia: "#f283b5",
};
/** a newcomer from the list has no colour of their own yet: one of these, steady for their id */
const SPARE_COLOURS = ["#f2c14e", "#7bdff2", "#b4e06a", "#ff9f7a", "#a99cf5", "#5fd3a6", "#f7a6c8", "#e0d48a", "#8fb8ff", "#d98fe8"];
export const colourOf = (who: string | undefined): string => {
  if (!who) return "#cfd6dc";
  if (COLOUR[who]) return COLOUR[who];
  if (!CAST[who]) return "#cfd6dc";
  let h = 0;
  for (const ch of who) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SPARE_COLOURS[h % SPARE_COLOURS.length];
};
export const firstName = (who: string | undefined): string => nameOf(who).split(" ")[0];

export const nameOf = (who: string | undefined): string => (who && CAST[who]?.name) || (who ? who[0].toUpperCase() + who.slice(1) : "?");

export interface CastRow {
  id: string;
  who: string;
  name: string;
  /** 0..100, quantized to whole percent (the strip is redrawn at 4 Hz, not every frame) */
  hp: number;
  dead: boolean;
  /** out through the vault, alive (the card says so instead of †) */
  escaped?: boolean;
  down: boolean;
  bleeding: boolean;
  infected: boolean;
  /** bitten — the audience knows at once (BUNKER.md 38), whatever the group knows */
  bitten: boolean;
  /** the dead they've put down */
  kills: number;
  colour: string;
  doing: string;
  /** the brief stats under the health bar, 0..100 each, quantized (100 = full / fed / rested) */
  stats: { stamina: number; food: number; water: number; rest: number; morale: number } | null;
  /** what's on them, as short chips (their own pack — never the group's box) */
  kit: string[];
  /** what they're thinking (wire `think`), and when it last changed (for the card's fade-in) —
   *  none for the dead */
  thought?: string;
  thoughtAt?: number;
  /** their own goal (wire `goal`) — none for the dead */
  goal?: string;
}

/** A thought that names a bite: shown only once the card itself shows one. */
const BITE_TALK = /\b(bit|bitten|bites?|biting|infect\w*|scratch\w*)\b/i;

/** The thought a card may show: the latest, not on the dead, never a bite the screen doesn't show. */
export function thoughtOf(b: DBody, thoughts: ReadonlyMap<string, { text: string; at: number }> | undefined, dead: boolean): { text: string; at: number } | null {
  const th = thoughts?.get(b.id);
  if (!th || dead || !th.text) return null;
  if (b.vitals?.infected !== true && b.vitals?.bitten !== true && BITE_TALK.test(th.text)) return null;
  return th;
}

const MELEE_WORD: Record<string, string> = { fists: "Fists", pipe: "Pipe", knife: "Knife", crowbar: "Crowbar", hammer: "Hammer", axe: "Axe" };
const pct = (v: number) => Math.max(0, Math.min(100, Math.round(v * 100)));
/** the map in play is a house (set by the director when its scene is built): the one key there is the butler's */
let HOUSE = false;
export function setHouseWords(on: boolean): void { HOUSE = on; }

/** A pocket as chips: the weapon, the gun and its rounds, then what's carried (zeros left out). */
export function kitOf(inv: SurvivorInv | undefined): string[] {
  if (!inv) return [];
  const out = [MELEE_WORD[inv.melee] ?? inv.melee];
  if (inv.gun) out.push(`${inv.gun === "rifle" ? "Rifle" : "Pistol"} ${inv.rounds ?? 0}`);
  // (words, not emoji: a can and a plaster draw as boxes in some system fonts)
  if (inv.food) out.push(`Food ${inv.food}`);
  if (inv.water) out.push(`Water ${inv.water}`);
  if (inv.bandage) out.push(`Bandage ${inv.bandage}`);
  if (inv.medkit) out.push(`Medkit ${inv.medkit}`);
  if (inv.card) out.push(HOUSE ? "Butler's key" : `Key L${inv.card}`);
  return out;
}

const POSE_WORD: Record<string, string> = {
  fight: "fighting", shoot: "shooting", aim: "taking aim", reload: "reloading", grabbed: "grabbed!", down: "down", dead: "dead",
  sleep: "asleep", sit: "sitting", eat: "eating", drink: "drinking", bandage: "patching up", revive: "reviving someone",
  search: "searching", interact: "working a door", panic: "panicking", sprint: "running", talk: "talking", hit: "hurt",
};
const JOB_WORD: Record<string, string> = {
  explore: "exploring", loot: "looting", backoff: "backing off", hide: "hiding", panic: "panicking", grabbed: "grabbed!", home: "heading back", rest: "resting", guard: "on guard", sleep: "asleep", eat: "eating", drink: "drinking",
  heal: "patching up", resupply: "restocking", read: "reading a note", patrol: "on patrol", escort: "keeping close", talk: "talking", revive: "reviving someone", flee: "running", fight: "fighting", follow: "keeping up", idle: "waiting", search: "searching",
  // THE BUNKER's jobs (goals.ts, survivor.ts)
  crank: "cranking the door", repair: "fixing the radio", call: "on the radio", clear: "clearing rooms", regroup: "finding the others",
  hiding: "hiding", turning: "turning", attack: "attacking", finish: "finishing someone",
  run: "running", move: "on the move",
};

/** A HOUSE'S OWN WORK (Glenridge Hall's tasks, by the word the sim sends for each as the job: scenarios/glenridge.ts) */
const HOUSE_JOB: Record<string, string> = {
  bolt: "bolting the door", planks: "fetching planks", board: "boarding a window", look: "studying the chimneypiece", crest: "setting a crest",
  journals: "reading the journals", plant: "at the switchboard", fuel: "fuelling the car", car: "getting in the car", inside: "running for the house",
};
// (every word above is the house's alone: the bunker's `read` and anybody's `run` never land here)

/** What a survivor is doing, in a word or two — the pose first (it's what we see), then the job. */
export function doingOf(b: DBody): string {
  // (a house's task is named for what it is: its pose is only "working at something")
  const hj = b.vitals?.job ? HOUSE_JOB[b.vitals.job] : undefined;
  if (hj && (b.pose === "interact" || b.pose === "search" || b.pose === "idle" || b.pose === "walk" || b.pose === "jog")) return hj;
  const p = POSE_WORD[b.pose];
  if (p) return p;
  const j = b.vitals?.job;
  return (j && JOB_WORD[j]) || (j ? j.replace(/[-_]/g, " ") : "");
}

/** The DECIDED caption a screen may show: never a bite the screen doesn't show, unless it IS owning up. */
export function decisionShown(b: DBody | undefined, d: { did: string; reason: string; social: boolean }): { did: string; reason: string } | null {
  if (!b || isDeadBody(b)) return null;
  if (b.vitals?.infected === true || b.vitals?.bitten === true || /\b(tell|own up)\b.*\bbitten\b/i.test(d.did)) return { did: d.did, reason: d.reason };
  if (BITE_TALK.test(d.did)) return null;
  return { did: d.did, reason: BITE_TALK.test(d.reason) ? "" : d.reason };
}

/** DEAD, NOT DOWN (Josh, Nov 3 2026: "when a player goes down and needs a revive, their card says dead"). A downed
 *  survivor has hp 0 (world.ts goDown) but is alive and revivable until their bleed-out clock runs out — only the
 *  pose "dead" (or a 0 hp body that isn't down) is a death. */
export const isDeadBody = (b: Pick<DBody, "pose" | "hp"> & { vitals?: DBody["vitals"] }): boolean =>
  b.pose === "dead" || (b.vitals?.job !== undefined
    // the sim says what they're doing (vitals.job is its mode): only "dead" is dead — a 0 hp body that is
    // grabbed, collapsing or turning is NOT (the card read "dead" for a beat while a grab ended in a fall)
    ? b.vitals.job === "dead"
    : b.hp <= 0 && b.pose !== "down");

/** What a downed survivor's card says: bleeding out with the time left when the show clock is known (`simT`), or
 *  turning (the bite's own clock — no countdown on that one). */
export function downText(b: DBody, simT?: number): string {
  if (b.vitals?.job === "turning") return "down — turning";
  const until = b.vitals?.downUntil;
  if (until === undefined || simT === undefined || !Number.isFinite(until) || !Number.isFinite(simT)) return "down — bleeding out";
  const s = Math.max(0, Math.ceil((until - simT) / 1000));
  return `down — bleeding out ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The cast strip's rows. `simT` = the show clock now (the frames' `t`), for a downed survivor's time left. */
export function castRows(bodies: Iterable<DBody>, thoughts?: ReadonlyMap<string, { text: string; at: number }>, goals?: ReadonlyMap<string, { text: string; at: number }>, simT?: number): CastRow[] {
  const rows: CastRow[] = [];
  for (const b of bodies) {
    if (b.kind !== "survivor" || !b.who) continue;
    const out = b.escaped === true;
    const dead = !out && isDeadBody(b);
    const th = thoughtOf(b, thoughts, dead);
    const goal = thoughtOf(b, goals, dead || out);
    rows.push({
      id: b.id,
      who: b.who,
      name: nameOf(b.who),
      hp: dead ? 0 : Math.max(0, Math.min(100, Math.round((b.hp / Math.max(1, b.hpMax)) * 100))),
      dead: dead || out,
      ...(out ? { escaped: true } : {}),
      down: !dead && !out && b.pose === "down",
      bleeding: !dead && (b.vitals?.bleeding ?? 0) > 0,
      infected: !dead && b.vitals?.infected === true,
      bitten: !dead && !out && b.vitals?.bitten === true,
      kills: b.vitals?.kills ?? 0,
      colour: colourOf(b.who),
      doing: out ? "got out" : dead ? "dead" : b.pose === "down" ? downText(b, simT) : doingOf(b),
      stats: dead || !b.vitals ? null : {
        stamina: pct(b.vitals.stamina), food: 100 - pct(b.vitals.hunger), water: 100 - pct(b.vitals.thirst),
        rest: 100 - pct(b.vitals.tired), morale: Math.max(0, Math.min(100, Math.round(b.vitals.morale))),
      },
      kit: dead ? [] : kitOf(b.vitals?.inv),
      ...(th ? { thought: th.text, thoughtAt: th.at } : {}),
      ...(goal ? { goal: goal.text } : {}),
    });
  }
  const at = (w: string) => { const i = CAST_ORDER.indexOf(w); return i < 0 ? 99 : i; };
  // ONE CARD PER SURVIVOR, whatever the wire holds: a body list that ever carried two bodies for
  // one person (a second Johanna showed on the strip in a test run, Oct 28 2026) must not grow a
  // seventh card and wrap the strip. The living one wins; between two of the same state, the later.
  const by = new Map<string, CastRow>();
  for (const r of rows) {
    const had = by.get(r.who);
    if (!had || (had.dead && !r.dead) || had.dead === r.dead) by.set(r.who, r);
  }
  return [...by.values()].sort((a, b) => at(a.who) - at(b.who) || a.who.localeCompare(b.who));
}

export interface NameCard { who: string; name: string; tag: string }
export const nameCard = (who: string): NameCard => ({ who, name: nameOf(who), tag: CAST[who]?.tag ?? "" });

export interface Memoriam { who: string; name: string; day: number; cause: string; line: string; time: string; colour: string }
// the sim's causes (world.ts goDown/dieSurvivor) as the card prints them, and "killed by Rick" (one of their own,
// survivor.ts attackStep) as it stands; anything else prints nothing
const CAUSE: Record<string, string> = { "bled out": "bled out", eaten: "taken by the dead", bitten: "wounds", wounds: "wounds", infection: "the infection", fall: "a fall", turned: "turned" };
/** how a death reads on the card and the recap, with where (BUNKER.md: "Clawed by a zombie in the mess hall") */
const HOW: Record<string, string> = {
  "bled out": "Bled out", eaten: "Taken by the dead", bitten: "Clawed by a zombie", wounds: "Clawed by a zombie", infection: "Lost to the infection",
  fall: "Fell", turned: "Turned", admin: "Died",
};
export function deathLine(cause: string | undefined, where: string | undefined): string {
  const how = cause ? HOW[cause] ?? (/^killed by [A-Z][a-z]+$/.test(cause) ? cause[0].toUpperCase() + cause.slice(1) : "Died") : "Died";
  return where ? `${how} ${inPlace(where)}` : how;
}
/** The bunker: "in the mess hall" (its names are plain, and lowered). A house: "in the Great Hall", and a room that
 *  is somebody's takes no "the": "in Mrs. Glenn's Sitting Room". A bracketed note on a name is left off. */
export function inPlace(where: string): string {
  const w = where.replace(/^the /i, "");
  if (!HOUSE) return `in the ${w.toLowerCase()}`;
  const n0 = w.replace(/\s*\([^)]*\)\s*$/, "");
  // (a place named with its own "The" is a plain noun: "in the forecourt", "in the vault")
  const n = /^the /i.test(where) ? n0.toLowerCase() : n0;
  // (out of doors nobody is "in" a lawn or a gate: the code review's D-4)
  if (/^(the )?gate$/i.test(n)) return "at the gate";
  if (/(lawn|terrace|drive|road|forecourt|court)$/i.test(n)) return `on the ${n.replace(/^the /i, "").toLowerCase()}`;
  // (a person's room: "Mrs. Glenn's Sitting Room", "Stefan's Bedroom"; the Butler's Pantry is still "the")
  return /^(Mrs?\.\s|[A-Z][a-z]+['’]s\s(?!Pantry|Office|Room))/.test(n) && !/^(Butler|Servant|Secretary|Gentlemen)/.test(n) ? `in ${n}` : `in the ${n}`;
}
export const memoriam = (d: Death, startedAt?: number, roomName?: RoomName): Memoriam => ({
  who: d.who, name: nameOf(d.who), day: d.day, colour: colourOf(d.who),
  cause: (d.cause && (CAUSE[d.cause] ?? (/^killed by [A-Z][a-z]+$/.test(d.cause) ? d.cause : ""))) || "",
  line: deathLine(d.cause, roomName?.(d.room)), time: startedAt ? elapsed(d.at - startedAt) : "",
});

/** a span of show clock as the screen prints it: h:mm:ss */
export function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// ---- THE BUNKER'S BROADCAST (BUNKER.md, step 4) -----------------------------------------------------------

export interface ObjRow { key: string; label: string; done: boolean; detail: string; by?: string; at?: number }

/** THE CHECKLIST: the four goals in the order a run usually takes them, the zombie count inside the clear. */
export function objectiveRows(g: Goals): ObjRow[] {
  const when = (t?: number) => (t ? elapsed(t - g.startedAt) : "");
  const credit = (by?: string, t?: number) => [by ? firstName(by) : "", when(t)].filter(Boolean).join(" · ");
  // A MAP WHOSE OBJECTIVES ARE ITS SCENARIO'S (Glenridge Hall): the server's rows, in the server's words
  if (g.rows) return g.rows.map((x) => ({ key: x.id, label: x.label, done: !!x.done, by: x.by, at: x.done || undefined, detail: x.done ? credit(x.by, x.done) : x.note ?? "" }));
  const r = g.radio;
  return [
    { key: "sealed", label: "Seal the blast door", done: !!g.door.sealed, by: g.door.by, at: g.door.sealed,
      detail: g.door.sealed ? credit(g.door.by, g.door.sealed) : g.door.crank > 0 ? `${Math.round(g.door.crank * 100)}%` : "" },
    { key: "clear", label: "Clear the bunker", done: !!g.clear && g.inside === 0, by: g.clearBy, at: g.clear,
      detail: g.inside > 0 ? `${g.inside} inside` : g.clear ? credit(g.clearBy, g.clear) : "0 inside" },
    { key: "part", label: "Find the radio part", done: !!r.part, by: r.partBy, at: r.partAt, detail: r.part ? credit(r.partBy, r.partAt) : "" },
    { key: "code", label: "Find the radio code", done: !!r.code, by: r.codeBy, at: r.codeAt, detail: r.code ? credit(r.codeBy, r.codeAt) : "" },
    { key: "fixed", label: "Fix the radio", done: !!r.fixed, by: r.fixedBy, at: r.fixed,
      detail: r.fixed ? credit(r.fixedBy, r.fixed) : r.repair > 0 ? `${Math.round(r.repair * 100)}%` : "" },
    { key: "called", label: "Call for rescue", done: !!r.called, by: r.by, at: r.called, detail: r.called ? credit(r.by, r.called) : "" },
  ];
}

/** THE OBJECTIVE BANNERS: what a goal reads as the moment it's done ("DOOR SEALED"). */
export const BANNER_TITLE: Record<string, string> = {
  sealed: "DOOR SEALED", clear: "BUNKER CLEAR", part: "RADIO PART FOUND", code: "CODE FOUND", fixed: "RADIO FIXED", called: "RESCUE CALLED",
};

/** the same, for a house (Glenridge Hall's rows, by id) */
export const HOUSE_BANNER: Record<string, string> = {
  bolt: "FRONT DOOR BOLTED", windows: "WINDOWS BOARDED", clear: "HOUSE CLEAR", lights: "LIGHTS BACK ON",
};

export interface EndCard { title: string; sub: string; time: string; kind: "rescued" | "wiped" | "timeout" | "escaped" | "survived" }
export function endCard(g: Goals, place = "Shelter 14"): EndCard | null {
  if (!g.ending) return null;
  const time = g.endedAt ? elapsed(g.endedAt - g.startedAt) : "";
  if (g.ending === "escaped") return { kind: "escaped", title: "ESCAPED", sub: (g.rescued ?? []).map(firstName).join(" · "), time };
  if (g.ending === "survived") return { kind: "survived", title: "SURVIVED THE NIGHT", sub: (g.rescued ?? []).map(firstName).join(" · "), time };
  if (g.rows) return g.ending === "wiped" ? { kind: "wiped", title: "NO SURVIVORS", sub: `Nobody made it out of ${place}`, time } : { kind: "timeout", title: "STILL IN THE HOUSE", sub: "The hour ran out", time };
  if (g.ending === "rescued") return { kind: "rescued", title: "RESCUED", sub: (g.rescued ?? []).map(firstName).join(" · "), time };
  if (g.ending === "wiped") return { kind: "wiped", title: "NO SURVIVORS", sub: "Nobody made it out of Shelter 14", time };
  return { kind: "timeout", title: "NO RESCUE CAME", sub: "The hour ran out", time };
}

export interface RecapCard {
  title: string;
  time: string;
  survived: { name: string; colour: string; kills: number }[];
  died: { name: string; colour: string; line: string; time: string; kills: number }[];
  objectives: { label: string; done: boolean; detail: string }[];
}
/** THE RECAP (BUNKER.md 35): who survived, who died how and when, kills each, every goal with when and by whom. */
export function recapCard(g: Goals, rows: CastRow[], deaths: Death[], roomName?: RoomName, place?: string): RecapCard {
  const end = endCard(g, place);
  const dead = new Map(deaths.map((d) => [d.who, d]));
  return {
    title: end?.title ?? "THE END",
    time: end?.time ?? "",
    survived: rows.filter((r) => !dead.has(r.who) && !(r.dead && !r.escaped)).map((r) => ({ name: r.name, colour: r.colour, kills: r.kills })),
    died: [...dead.values()].sort((a, b) => a.at - b.at).map((d) => ({
      name: nameOf(d.who), colour: colourOf(d.who), line: deathLine(d.cause, roomName?.(d.room)), time: elapsed(d.at - g.startedAt),
      kills: rows.find((r) => r.who === d.who)?.kills || d.kills || 0,
    })),
    objectives: objectiveRows(g).map((o) => ({ label: o.label, done: o.done, detail: o.done ? o.detail : "not done" })),
  };
}

/** The show clock as the broadcast prints it: house time (America/New_York), hh:mm. */
export function clockText(t: number): string {
  try { return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(t)); }
  catch { const d = new Date(t); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
}
