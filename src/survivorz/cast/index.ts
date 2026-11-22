// SOLACE SURVIVORZ — THE CAST, read from one file per character (src/survivorz/cast/<id>.json) AND from
// the Admin Panel's character list (survivorz_characters, migration 116).
//
// Every table the show used to keep by hand in five files (stats and kit in tables.ts, genes in
// genes.ts, sheets and day-one regard in sheets.ts, voices in voices.ts, bodies in wire.ts, names in
// the overlay) is built here from the characters, so making a character is writing one record. Drafts
// are skipped: the show never sees a character until it's on the cast or the bench.
//
// THE CAST IS LIVE (Josh, Nov 4 2026: "bring in without me"). The repo's files are what the server
// boots with; routes/survivorz-cast.ts `refreshCast` then lays the panel's list over them and calls
// `applyCast`, at boot and after every save, delete or finished bake, so a character Josh puts on the
// bench joins the show the moment their body is baked — no pull, no commit, no deploy. Every table
// below is filled IN PLACE (the same array, object and set), because the sim's modules took their
// references at import. Two rules keep a running show safe:
//   · the LISTS (CHARACTERS, ALL_IDS, WALK_IN, BENCH) are who's in the show now;
//   · a LOOKUP by id (CHARACTER, BODY_OF, SUITED, every tableOf) answers for anyone
//     the show has known since boot — a character taken off the list mid-run keeps playing that run.
import { FILES as RAW_FILES } from "./files";
import { checkCharacter, upgradeCharacter, HANDMADE_SUITED, type Character } from "./rules";

/** the repo files, in the shape the show reads (a file from before the skills round is converted) */
const FILES = RAW_FILES.map((c) => upgradeCharacter(c));

export type { Character } from "./rules";

// A bad FILE stops the server at boot rather than putting half a person on the show (the creator and
// test_survivorz_cast.mjs check the same rules before anything ships). The panel's list never stops a
// boot: refreshCast holds back a bad entry and says why.
const fromFiles = FILES.filter((c) => c.status !== "draft").sort((a, b) => a.order - b.order);
for (const c of fromFiles) {
  const { errors } = checkCharacter(c, FILES);
  if (errors.length) throw new Error(`survivorz cast: ${c.id}.json — ${errors.map((x) => `${x.field}: ${x.error}`).join("; ")}`);
}

/** everyone the show has known since boot, newest version of each */
const known = new Map<string, Character>();

/** Everyone who can be in the show, in spawn order: the cast, then the bench. */
export const CHARACTERS: readonly Character[] = [];
export const CHARACTER: Readonly<Record<string, Character>> = {};
/** the ids, in spawn order (cast + bench) */
export const ALL_IDS: string[] = [];
/** who walks in with the group on day one */
export const WALK_IN: string[] = [];
/** who's ready on the bench, first in line first */
export const BENCH: string[] = [];

/** Character → baked body (assets/downloads/survivorz/game/<body>.glb). SURVIVORZ.md §4. */
export const BODY_OF: Readonly<Record<string, string>> = {};
/** in a sealed suit (Rollo's hazmat): no backpack over the air pack, a cough muffled by the visor. A SUIT IS
 *  THE BODY'S (Nov 5 2026): whoever wears a suited body is suited. */
export const SUITED: ReadonlySet<string> = new Set<string>();
/** the bodies that are sealed suits: the hand-made one (rules.ts HANDMADE_SUITED), plus every creator body
 *  ticked in Bodies (the server passes those in with setSuitedBodies) */
const suitedBodies = new Set<string>(HANDMADE_SUITED);
export const isSuitedBody = (body: string): boolean => suitedBodies.has(body);
/** The creator bodies ticked as sealed suits; returns whether anyone's suit changed. */
export function setSuitedBodies(bodies: Iterable<string>): boolean {
  suitedBodies.clear();
  for (const b of [...HANDMADE_SUITED, ...bodies]) suitedBodies.add(b);
  const before = [...SUITED].sort().join();
  fillSuited();
  if ([...SUITED].sort().join() === before) return false;
  for (const fn of listeners) { try { fn(); } catch (e) { console.error("[survivorz] cast listener:", (e as Error).message); } }
  return true;
}
function fillSuited(): void {
  const suited = SUITED as Set<string>;
  suited.clear();
  for (const [id, c] of known) if (suitedBodies.has(c.body)) suited.add(id);
}

interface Table { target: Record<string, unknown>; pick: (c: Character) => unknown; src: Map<string, Character> }
const tables: Table[] = [];
const listeners: (() => void)[] = [];

/** A table of one field, keyed by character — kept in step with the cast. A character's entry is only
 *  rebuilt when their record changes, so a value the sim holds stays the same object until then. */
export function tableOf<T>(pick: (c: Character) => T): Record<string, T> {
  const t: Table = { target: {}, pick, src: new Map() };
  tables.push(t);
  fill(t);
  return t.target as Record<string, T>;
}
function fill(t: Table): void {
  for (const [id, c] of known) {
    if (t.src.get(id) === c) continue;
    t.target[id] = t.pick(c);
    t.src.set(id, c);
  }
}

/** Run now, and again whenever the cast changes (a derived table elsewhere refills itself in place). */
export function onCast(fn: () => void): () => void {
  fn();
  listeners.push(fn);
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}

const replace = <T>(arr: T[], next: T[]): void => { arr.length = 0; arr.push(...next); };
const stamp = (): string => JSON.stringify(CHARACTERS);

/** The show's cast is now exactly `live` (non-drafts, already checked, any order). Returns whether
 *  anything changed; listeners run only when it did. */
export function applyCast(live: readonly Character[]): boolean {
  const next = live.map((c) => upgradeCharacter(c)).filter((c) => c.status !== "draft").sort((a, b) => a.order - b.order);
  const before = stamp();
  for (const c of next) {
    const had = known.get(c.id);
    if (!had || JSON.stringify(had) !== JSON.stringify(c)) known.set(c.id, structuredClone(c));
  }
  replace(CHARACTERS as Character[], next.map((c) => known.get(c.id)!));
  replace(ALL_IDS, next.map((c) => c.id));
  replace(WALK_IN, next.filter((c) => c.status === "cast").map((c) => c.id));
  replace(BENCH, next.filter((c) => c.status === "bench").map((c) => c.id));
  const byId = CHARACTER as Record<string, Character>, bodies = BODY_OF as Record<string, string>;
  for (const [id, c] of known) { byId[id] = c; bodies[id] = c.body; }
  fillSuited();
  for (const t of tables) fill(t);
  if (stamp() === before) return false;
  for (const fn of listeners) {
    try { fn(); } catch (e) { console.error("[survivorz] cast listener:", (e as Error).message); }
  }
  return true;
}

applyCast(fromFiles);
