// SOLACE SURVIVORZ — WHAT A CHARACTER IS, and what makes one valid (the character creator, phase 5).
//
// IMPORT-FREE ON PURPOSE: the creator (scripts/survivorz/creator.mjs, run straight from source by
// Node), the harness and the server all check a character with THIS function, so the form can never
// accept something the show would refuse. A character is one file, src/survivorz/cast/<id>.json; every
// table the show used to keep by hand (skills, genes, kit, sheet, regard, voice, body, name)
// is read from those files by ./index.ts.

/** THE SKILLS — the ONE list of what a character can do (Josh, Nov 5 2026: "lets remove perks and body stats
 *  just put them in a big list of skills. I only want skills and genes … generalized enough so that they can
 *  be useful in any map we make"). Sixteen, 0..10 each, 0 = untrained. A MAP IS BUILT AGAINST THIS LIST: an
 *  objective names the skill that makes it faster or safer, and anyone can still do it slowly (the rule: skills
 *  speed things up, they never wall a map off — only a few things ask a minimum, like vents or a lock).
 *
 *  · `base` is what a new character starts at and what a file that leaves the skill out reads as (5 = an
 *    ordinary adult for the body, 0 = never trained for know-how).
 *  · `learns`: it gets better during a run by doing the thing (trained skills; the body's don't).
 *  · `dulls`: tiredness and the infection's last stage take levels off it (what needs a clear head).
 *  Every line in `does` is true of sim/ — change the sim, change the line. */
export const SKILL_KEYS = [
  "melee", "firearms",
  "agility", "escape", "strength", "endurance", "toughness", "stealth",
  "firstAid", "science", "electronics", "mechanics", "lockpicking", "scavenging",
  "leadership", "quickLearner",
] as const;
export type SkillKey = (typeof SKILL_KEYS)[number];
export const SKILL_GROUPS = [
  { id: "fighting", label: "Fighting" },
  { id: "body", label: "Body" },
  { id: "knowhow", label: "Know-how" },
  { id: "mind", label: "Mind & people" },
] as const;
export type SkillGroup = (typeof SKILL_GROUPS)[number]["id"];
export interface SkillInfo { label: string; group: SkillGroup; base: number; learns?: boolean; dulls?: boolean; does: string }
export const SKILL_INFO: Record<SkillKey, SkillInfo> = {
  melee: { label: "Melee", group: "fighting", base: 5, learns: true, does: "Landing blows with fists and hand weapons, headshots up close, and how many of the dead they'll take on at once. Gets better by fighting." },
  firearms: { label: "Firearms", group: "fighting", base: 0, learns: true, does: "Aim with a pistol or rifle: tighter spread, more hits, more headshots. Under 6 a rifle kicks too hard for them, so they'd rather a pistol. Gets better by shooting." },
  agility: { label: "Agility", group: "body", base: 5, does: "Ducking a lunge and dodging blows. 7 or more fits through vents and tight gaps where a map has them." },
  escape: { label: "Escape", group: "body", base: 5, learns: true, does: "Shoving off a grab, breaking free when held, and pulling a zombie off a friend faster. Gets better every time they break loose." },
  strength: { label: "Strength", group: "body", base: 5, does: "Harder blows and shoves; heavy wheels, cranks and doors move faster in their hands." },
  endurance: { label: "Endurance", group: "body", base: 5, does: "Stamina: how long they can sprint and fight before they're winded, and how fast they get their breath back." },
  toughness: { label: "Toughness", group: "body", base: 5, does: "Hunger and thirst come slower, an infection takes longer to turn them, and blows hurt them less." },
  stealth: { label: "Stealth", group: "body", base: 0, learns: true, dulls: true, does: "The dead notice them later: harder to spot, quieter on their feet. Gets better creeping near the dead unseen." },
  firstAid: { label: "First aid", group: "knowhow", base: 0, learns: true, dulls: true, does: "Bandages, med kits and revives go faster. At 8 or more they're a medic: they keep the medicine and go back for the fallen. Gets better by treating people." },
  science: { label: "Science", group: "knowhow", base: 0, learns: true, dulls: true, does: "Reads through notes, papers and lab work faster, and a med kit heals more in their hands." },
  electronics: { label: "Electronics", group: "knowhow", base: 0, learns: true, dulls: true, does: "Radios, terminals and power panels: repairs them faster. Gets better working on them." },
  mechanics: { label: "Mechanics", group: "knowhow", base: 0, learns: true, dulls: true, does: "Engines, doors and machinery: works cranks, valves and mechanisms faster. Gets better on them." },
  lockpicking: { label: "Lockpicking", group: "knowhow", base: 0, learns: true, dulls: true, does: "Opens a locked door without its key: needs 4 or more to try, and the higher, the faster. Gets better with every lock." },
  scavenging: { label: "Scavenging", group: "knowhow", base: 0, learns: true, dulls: true, does: "Searches go faster, and a first search sometimes turns up one thing more of what that spot holds. Gets better by searching." },
  leadership: { label: "Leadership", group: "mind", base: 5, does: "Others take their plans more readily and look to them to lead, and the people near them keep their nerve." },
  quickLearner: { label: "Quick learner", group: "mind", base: 5, does: "How fast their trained skills get better during a run (5 is ordinary; 10 learns half again as fast)." },
};
/** The suggested total of all sixteen (a WARNING past it, never a refusal — Josh, Nov 5 2026). About what the
 *  ordinary-adult starting point plus a strong specialist's few high skills come to. */
export const SKILL_BUDGET = 75;

/** A character's skills, every one there (a skill left out reads as its base). */
export function skillsOf(c: { skills?: unknown }): Record<SkillKey, number> {
  const s = (c.skills ?? {}) as Record<string, number>;
  return Object.fromEntries(SKILL_KEYS.map((k) => [k, typeof s[k] === "number" ? s[k] : SKILL_INFO[k].base])) as Record<SkillKey, number>;
}
export const skillTotal = (c: { skills?: unknown }): number => Object.values(skillsOf(c)).reduce((a, b) => a + b, 0);

/** THE GENES — who they are (0..10), never what they can do. The last five came with the skills round
 *  (Courage took over the bravery that used to ride on Combat). genes.ts says what each one moves. */
export const GENE_KEYS = [
  "selfPreservation", "caution", "generosity", "loyalty", "trust",
  "sociability", "curiosity", "assertiveness", "temper", "honesty",
  "courage", "optimism", "humour", "composure", "ruthlessness",
] as const;
export type GeneKey = (typeof GENE_KEYS)[number];
/** A gene a file may leave out reads as 5 (an ordinary person). */
export const GENE_BASE = 5;
export function genesOf(c: { genes?: unknown }): Record<GeneKey, number> {
  const g = (c.genes ?? {}) as Record<string, number>;
  return Object.fromEntries(GENE_KEYS.map((k) => [k, typeof g[k] === "number" ? g[k] : GENE_BASE])) as Record<GeneKey, number>;
}

export const MELEE_IDS = ["fists", "knife", "pipe", "hammer", "crowbar", "axe"] as const;
export const GUN_IDS = ["pistol", "rifle"] as const;
/** The stock voices the agent falls back to when a clone is down (Kokoro's names). */
export const KOKORO_VOICES = [
  "af_heart", "af_bella", "af_nicole", "af_sarah", "af_sky", "af_nova", "af_river", "af_jessica", "af_kore", "af_alloy", "af_aoede",
  "am_adam", "am_eric", "am_onyx", "am_michael", "am_fenrir", "am_puck", "am_liam", "am_echo", "am_santa",
  "bf_emma", "bf_isabella", "bf_alice", "bf_lily", "bm_george", "bm_lewis", "bm_daniel", "bm_fable",
] as const;
export type Status = "cast" | "bench" | "draft";
/** The hand-made bodies that are sealed suits (Rollo's hazmat). A creator body is ticked in Bodies instead
 *  (survivorz_bodies.suited, migration 122). */
export const HANDMADE_SUITED: readonly string[] = ["rollo"];

/** THE OLD SHAPE → THE NEW ONE (Nov 5 2026). A file, a saved row or a browser draft from before the skills
 *  round carries body stats (combat, nimble, thinking, creative, endurance), perks and a `world`; this turns it
 *  into skills and genes the way the first conversion did, so an old character plays as it did:
 *  combat → melee and firearms (and the new Courage gene, which took over combat's bravery), nimble → agility
 *  and escape, thinking → quick learner, creative and the Scavenger perk → scavenging, Tough → toughness 10,
 *  Medic → first aid 9, Mechanic → mechanics 7 and electronics + 2, Marksman → firearms + 2. A sealed suit is
 *  the BODY's now (a tick in Bodies), and where a survivor starts is the map's. Returns the same object when
 *  it is already the new shape. */
export function upgradeCharacter<T extends object>(raw: T): T {
  const c = raw as unknown as Record<string, unknown>;
  if (!("stats" in c) && !("perks" in c) && !("traits" in c) && !("world" in c)) return raw;
  const out: Record<string, unknown> = { ...c };
  const st = (c.stats ?? {}) as Record<string, number>;
  const old = (c.skills ?? {}) as Record<string, number>;
  const t = (c.traits ?? {}) as Record<string, unknown>;
  const perks = Array.isArray(c.perks) ? (c.perks as string[]) : Object.keys(t).filter((k) => t[k] === true);
  const has = (p: string): boolean => perks.includes(p);
  const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const cap = (v: number): number => Math.max(0, Math.min(10, Math.round(v)));
  if ("stats" in c || "perks" in c || "traits" in c) {
    const combat = num(st.combat, 5), nimble = num(st.nimble, 5), creative = num(st.creative, 5);
    const sk: Record<string, number> = {};
    for (const k of SKILL_KEYS) sk[k] = typeof old[k] === "number" ? old[k] : SKILL_INFO[k].base;
    sk.melee = cap(combat);
    sk.firearms = cap(combat + (has("marksman") ? 2 : 0));
    sk.agility = cap(nimble);
    sk.escape = cap(nimble);
    sk.quickLearner = cap(num(st.thinking, 5));
    sk.endurance = cap(num(st.endurance, 5));
    sk.toughness = has("tough") ? 10 : num(old.toughness, 5);
    sk.scavenging = cap(Math.max(num(old.scavenging, 0), has("scavenger") ? 9 : (creative - 5) * 2));
    if (has("medic")) sk.firstAid = Math.max(num(old.firstAid, 0), 9);
    if (has("mechanic")) { sk.mechanics = Math.max(num(old.mechanics, 0), 7); sk.electronics = cap(num(old.electronics, 0) + 2); }
    out.skills = sk;
    const g = { ...((c.genes ?? {}) as Record<string, number>) };
    if (typeof g.courage !== "number") g.courage = cap(combat);
    for (const k of GENE_KEYS) if (typeof g[k] !== "number") g[k] = GENE_BASE;
    out.genes = g;
  }
  delete out.stats; delete out.perks; delete out.traits; delete out.world;
  return out as unknown as T;
}

export interface Character {
  /** lower-case letters only; the file's name, the wire's `who`, never changed once anyone has seen them */
  id: string;
  /** cast = walks in with the group · bench = ready, brought in when Josh says · draft = being written, or off the show */
  status: Status;
  /** the order they spawn in (the sim's), lowest first — changing it changes every run */
  order: number;
  /** the order the cast strip shows them in */
  strip: number;
  name: string;
  /** what the others call them */
  short: string;
  /** the lower third's line under their name (who they are, never what they look like) */
  tag: string;
  /** the baked body they wear: assets/downloads/survivorz/game/<body>.glb (a sealed suit is the body's) */
  body: string;
  /** 0..15 genes (GENE_KEYS), 0..10 each; one left out is 5 */
  genes: Record<GeneKey, number>;
  /** the sixteen skills (SKILL_INFO), 0..10 each; one left out is its base */
  skills: Partial<Record<SkillKey, number>>;
  kit: { melee: string; gun?: string; mag?: number; ammo?: number; bandage: number; medkit: number; food: number; water: number };
  /** day one: what they think of each of the others, -100..100 (absent = they don't know them) */
  regard: Record<string, number>;
  /** the cloned voice's reference on slopbot ("" = the voice server's default) and the stock fallback */
  voice: { clone: string; kokoro: string };
  /** who they are, as the model is told — "You are NAME. …". NO SECRET of any map, ever. */
  sheet: string;
  /** for Josh and Claude: drafts, what's still to check (never reaches a model) */
  notes?: string;
}

export const LIMITS = {
  name: 24, short: 14, tag: 44, sheetMin: 200, sheetMax: 2400, notes: 4000,
  skill: [0, 10], gene: [0, 10], regard: [-100, 100], kitCount: [0, 9], ammo: [0, 120],
} as const;

/** Words that belong to the facility's secrets: a sheet that names one is telling them what they're
 *  meant to find out (the sheets' rule — "a model can't leak what it was never told"). */
export const SECRET_WORDS = ["lazarus", "southerngrace", "antiviral", "the cure", "patient zero", "who opened the vault", "director marsh"];

export interface Problem { field: string; error: string }

const int = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const inRange = (v: unknown, [a, b]: readonly [number, number]): boolean => int(v) && v >= a && v <= b;

/** Everything wrong with one character, given the rest of the cast (empty = valid). Errors stop a save;
 *  `warnings` are for the creator to show. */
export function checkCharacter(c: Character, others: Character[], bodies?: string[]): { errors: Problem[]; warnings: Problem[] } {
  const errors: Problem[] = [], warnings: Problem[] = [];
  const e = (field: string, error: string): void => { errors.push({ field, error }); };
  const w = (field: string, error: string): void => { warnings.push({ field, error }); };
  const rest = others.filter((o) => o.id !== c.id);
  if (typeof c.id !== "string" || !/^[a-z]{2,16}$/.test(c.id)) e("id", "lower-case letters only, 2 to 16");
  if (!["cast", "bench", "draft"].includes(c.status)) e("status", "cast, bench or draft");
  if (!int(c.order) || c.order < 0) e("order", "a whole number, 0 or more");
  if (!int(c.strip) || c.strip < 0) e("strip", "a whole number, 0 or more");
  if (c.status !== "draft" && rest.some((o) => o.status !== "draft" && o.order === c.order)) e("order", "another character already spawns in that place");
  for (const [k, max] of [["name", LIMITS.name], ["short", LIMITS.short], ["tag", LIMITS.tag]] as const) {
    const v = c[k];
    if (typeof v !== "string" || !v.trim()) e(k, "required");
    else if (v.length > max) e(k, `at most ${max} characters`);
  }
  if (typeof c.short === "string" && rest.some((o) => o.short.toLowerCase() === c.short.toLowerCase())) e("short", "another character is called that");
  if (typeof c.body !== "string" || !/^[a-z0-9-]{2,32}$/.test(c.body)) e("body", "pick a body");
  else {
    if (bodies && !bodies.includes(c.body)) (c.status === "draft" ? w : e)("body", "that body isn't baked yet (assets/downloads/survivorz/game)");
    const twin = rest.find((o) => o.body === c.body && o.status !== "draft");
    if (twin && c.status !== "draft") e("body", `${twin.name} already wears that body`);
  }
  if (!c.genes || typeof c.genes !== "object") e("genes", "required");
  else {
    for (const k of GENE_KEYS) if (c.genes[k] !== undefined && !inRange(c.genes[k], LIMITS.gene)) e(`genes.${k}`, "0 to 10");
    for (const k of Object.keys(c.genes)) if (!(GENE_KEYS as readonly string[]).includes(k)) e("genes", `unknown gene "${k}"`);
  }
  if (!c.skills || typeof c.skills !== "object") e("skills", "required");
  else {
    for (const k of Object.keys(c.skills)) if (!(SKILL_KEYS as readonly string[]).includes(k)) e("skills", `unknown skill "${k}"`);
    for (const k of SKILL_KEYS) if (c.skills[k] !== undefined && !inRange(c.skills[k], LIMITS.skill)) e(`skills.${k}`, "0 to 10");
    const total = skillTotal(c);
    if (total > SKILL_BUDGET) w("skills", `${total} skill points, over the suggested ${SKILL_BUDGET}`);
  }
  const k = c.kit;
  if (!k || typeof k !== "object") e("kit", "required");
  else {
    if (!(MELEE_IDS as readonly string[]).includes(k.melee)) e("kit.melee", `one of ${MELEE_IDS.join(", ")}`);
    if (k.gun !== undefined) {
      if (!(GUN_IDS as readonly string[]).includes(k.gun)) e("kit.gun", "pistol, rifle or none");
      const mag = k.gun === "rifle" ? 30 : 15;
      if (!inRange(k.mag, [0, mag])) e("kit.mag", `0 to ${mag} in the gun`);
      if (!inRange(k.ammo, LIMITS.ammo)) e("kit.ammo", "0 to 120 spare rounds");
    } else if (k.mag !== undefined || k.ammo !== undefined) e("kit.gun", "rounds with no gun");
    for (const n of ["bandage", "medkit", "food", "water"] as const) if (!inRange(k[n], LIMITS.kitCount)) e(`kit.${n}`, "0 to 9");
  }
  if (!c.regard || typeof c.regard !== "object") e("regard", "required");
  else for (const [o, v] of Object.entries(c.regard)) {
    if (o === c.id) e("regard", "not of themselves");
    else if (!others.some((x) => x.id === o)) e("regard", `"${o}" isn't a character`);
    else if (!inRange(v, LIMITS.regard)) e(`regard.${o}`, "-100 to 100");
  }
  if (!c.voice || typeof c.voice.clone !== "string" || !/^[a-z0-9-]{0,40}$/.test(c.voice.clone)) e("voice.clone", "the reference file's name, letters, digits and dashes");
  if (!c.voice || !(KOKORO_VOICES as readonly string[]).includes(c.voice.kokoro)) e("voice.kokoro", "pick a stock voice");
  if (c.voice?.clone === "" && c.status !== "draft") w("voice.clone", "no clone: they'll speak in the voice server's default");
  // ONE VOICE EACH (Josh, Nov 3 2026: two characters never share one). "" is the voice server's own
  // default, so it counts once among those who can be in the show.
  if (c.voice && typeof c.voice.clone === "string") {
    const twin = c.voice.clone
      ? rest.find((o) => o.voice?.clone === c.voice.clone)
      : c.status !== "draft" ? rest.find((o) => o.status !== "draft" && o.voice?.clone === "") : undefined;
    if (twin) e("voice.clone", `${twin.name} already speaks with that voice`);
  }
  if (typeof c.sheet !== "string" || c.sheet.length < LIMITS.sheetMin) e("sheet", `at least ${LIMITS.sheetMin} characters`);
  else {
    if (c.sheet.length > LIMITS.sheetMax) e("sheet", `at most ${LIMITS.sheetMax} characters (it rides on every line they say)`);
    if (!/^You are /.test(c.sheet)) e("sheet", 'starts "You are NAME."');
    const low = c.sheet.toLowerCase();
    for (const s of SECRET_WORDS) if (low.includes(s)) e("sheet", `names a facility secret ("${s}"): they must find that out`);
    if (typeof c.short === "string" && c.short && !low.includes(c.short.toLowerCase())) w("sheet", "never says their name");
  }
  if (c.notes !== undefined && (typeof c.notes !== "string" || c.notes.length > LIMITS.notes)) e("notes", `text, at most ${LIMITS.notes}`);
  const allowed = new Set(["id", "status", "order", "strip", "name", "short", "tag", "body", "genes", "skills", "kit", "regard", "voice", "sheet", "notes"]);
  for (const key of Object.keys(c)) if (!allowed.has(key)) e(key, "not a field of a character");
  return { errors, warnings };
}

/** What the CLIENT may know of a character: no sheet, no genes, no notes (a sheet holds their secrets —
 *  Dale's painkillers — and the page's code is anybody's to read). */
export interface PublicCharacter { id: string; status: Status; strip: number; name: string; tag: string; body: string; suited: boolean; vox: "f" | "m" }
/** `suited`: their body wears a sealed suit (a tick on the body in Bodies — cast/index.ts SUITED_BODIES).
 *  `vox`: the register of their voice, from their stock voice (af_/bf_ a woman's, am_/bm_ a man's) — the page
 *  uses it to lend a character with no scream, pain or cough recordings of their own somebody else's (audio/cues.ts
 *  vocalStandIn): until Nov 12 2026 anyone but the first six was hurt in silence. */
export function publicOf(c: Character, suited = false): PublicCharacter {
  return { id: c.id, status: c.status, strip: c.strip, name: c.name, tag: c.tag, body: c.body, suited, vox: /^[ab]f_/.test(c.voice?.kokoro ?? "") ? "f" : "m" };
}

/** The generated index's text: one import per character file (the creator rewrites it on save). */
export function indexSource(ids: string[]): string {
  const sorted = [...ids].sort();
  const name = (id: string): string => `c_${id}`;
  return [
    "// GENERATED by the character creator (scripts/survivorz/creator.mjs) — one line per character file.",
    "// Edit the characters, not this list; test_survivorz_cast.mjs fails if it drifts from the files.",
    'import type { Character } from "./rules";',
    ...sorted.map((id) => `import ${name(id)} from "./${id}.json";`),
    "",
    `export const FILES = [${sorted.map(name).join(", ")}] as unknown as Character[];`,
    "",
  ].join("\n");
}
