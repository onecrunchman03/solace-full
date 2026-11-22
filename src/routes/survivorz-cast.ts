// SOLACE SURVIVORZ — THE CHARACTER LIST, in the Admin Panel (Josh, Nov 2026: "put the character
// creator in the admin panel to make it easy for me to create a list").
//
// The repo's files (src/survivorz/cast/<id>.json) are the cast the server boots with; what Josh makes
// or changes here is kept in the database (survivorz_characters, migration 116), checked with the SAME
// rules (cast/rules.ts), and, since Nov 4 2026 ("bring in without me"), LAID OVER THE FILES LIVE by
// refreshCast: a character set to bench or cast joins the show the moment their body is baked, with no
// pull, commit or deploy. A bad or unbaked entry is held back (the checklist says why) and a repo
// character keeps playing its file's version meanwhile. scripts/survivorz/pull-cast.mjs still copies
// the list into git, to keep the repo's copy in step; it is no longer what ships a character.
import fs from "node:fs";
import path from "node:path";
import { json, type Router } from "../http";
import { FILES as RAW_FILES } from "../survivorz/cast/files";
import {
  checkCharacter, GENE_KEYS, GENE_BASE, GUN_IDS, KOKORO_VOICES, LIMITS, MELEE_IDS, type Character,
  SKILL_KEYS, SKILL_INFO, SKILL_GROUPS, SKILL_BUDGET, upgradeCharacter, skillsOf, publicOf,
} from "../survivorz/cast/rules";
import { GENE_MEANS } from "../survivorz/genes";
import { RULES, worldOf } from "../survivorz/talk/sheets";
import { writeChecked } from "../survivorz/talk/lines";
import type { TalkModel } from "../survivorz/talk/model";
import { survivorBodyIds } from "./survivorz-assets";
import { applyCast, ALL_IDS, setSuitedBodies, isSuitedBody } from "../survivorz/cast";
import type { Store } from "../db/store";
import { voiceNames } from "./survivorz-voices";
import { pairsDone } from "./survivorz-pairs";

const BIBLE_DIR = path.resolve("docs/survivorz/cast");
const ID = /^[a-z]{2,16}$/;
const FIELDS = ["id", "status", "order", "strip", "name", "short", "tag", "body", "genes", "skills", "kit", "regard", "voice", "sheet", "notes"] as const;
/** the repo's files in the new shape (a file from before the skills round converted on read) */
const FILES: Character[] = RAW_FILES.map((c) => upgradeCharacter(c));

// (the tree's bodies and the character creator's: survivorz-assets.ts)
function bodies(): string[] {
  return survivorBodyIds();
}
function bible(id: string): string | null {
  if (!ID.test(id)) return null;
  try { return fs.readFileSync(path.join(BIBLE_DIR, `${id}.md`), "utf8"); } catch { return null; }
}
/** a character's fields in the files' order, nothing else (the scripts' tidy) */
function tidy(raw: unknown): Character {
  // (a row, a browser draft or a request from before the skills round: converted to skills and genes first)
  const c = upgradeCharacter((raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>);
  const out: Record<string, unknown> = {};
  for (const k of FIELDS) if (c[k] !== undefined && !(k === "notes" && c[k] === "")) out[k] = c[k];
  const kit = out.kit as Record<string, unknown> | undefined;
  if (kit && typeof kit === "object" && !kit.gun) { delete kit.gun; delete kit.mag; delete kit.ammo; }
  return out as unknown as Character;
}
function cleanRegardIn(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (ID.test(k) && Number.isInteger(v) && (v as number) >= -100 && (v as number) <= 100) out[k] = v as number;
  }
  return out;
}

interface Row { id: string; data: string; regardIn: string; updatedAt: number; updatedBy: number | null }
/** DELETING A CHARACTER (Josh, Nov 3 2026: "can i also get the ability to delete a charater"). A show
 *  character is a repo file the server can't touch, so its deletion is a list entry of its own —
 *  {"id", "deleted": true} — that pull-cast.mjs turns into removing the file (and everyone's regard of
 *  them). Until then they stay in the running show; on the panel they're gone. */
const DELETED = (id: string): string => JSON.stringify({ id, deleted: true });
const isDeleted = (r: Row): boolean => {
  try { return (JSON.parse(r.data) as { deleted?: unknown }).deleted === true; } catch { return false; }
};
const parse = (r: Row): { char: Character; regardIn: Record<string, number> } => {
  try { return { char: tidy(JSON.parse(r.data)), regardIn: JSON.parse(r.regardIn) as Record<string, number> }; }
  catch { return { char: { id: r.id } as Character, regardIn: {} }; }
};

/** Everyone: the repo's files, each overridden by its list entry (deletions gone), with what each entry
 *  says others think of them (regardIn) written into the others, in save order so the newest word
 *  wins, exactly as pull-cast.mjs writes the files. Deep copies: nothing here touches FILES. */
function everyone(rows: Row[]): Character[] {
  const by = new Map<string, Character>(FILES.map((f) => [f.id, structuredClone(f)]));
  for (const r of rows) {
    if (isDeleted(r)) { by.delete(r.id); continue; }
    const { char, regardIn } = parse(r);
    if (!char.id) continue;
    by.set(char.id, structuredClone(char));
    for (const [k, v] of Object.entries(regardIn)) {
      const o = by.get(k);
      if (o && k !== char.id) o.regard = { ...(o.regard ?? {}), [char.id]: v };
    }
  }
  const ids = new Set(by.keys());
  for (const c of by.values()) {
    if (c.regard && typeof c.regard === "object") c.regard = Object.fromEntries(Object.entries(c.regard).filter(([k]) => ids.has(k) && k !== c.id));
  }
  return [...by.values()];
}

/** who the show is holding back, and why (a body not baked, a rule broken): the checklist shows it */
const held = new Map<string, string>();
const isLive = (id: string): boolean => ALL_IDS.includes(id);

/** Lay the panel's list over the repo's files and hand the result to the show (cast/index.ts applyCast).
 *  Run at boot BEFORE the show restores a saved run, and after every save, delete and finished bake. */
export function refreshCast(store: Store): void {
  // a deletion whose repo file has since gone (pull-cast.mjs removed it, and the deploy carried that) has done
  // its job: the mark goes, so the list doesn't carry the dead forever
  for (const r of store.survivorzListAll() as Row[]) if (isDeleted(r) && !FILES.some((f) => f.id === r.id)) store.survivorzListDelete(r.id);
  const all = everyone(store.survivorzListAll() as Row[]);
  const baked = new Set(bodies());
  const live: Character[] = [];
  held.clear();
  for (const c of all) {
    if (c.status === "draft") continue;
    let why = "";
    // (a body the repo's own file already wears is trusted as it always was: only a body new to the
    // list waits for its bake — a box without the licensed bodies still plays the files' cast)
    const repoBody = FILES.find((f) => f.id === c.id)?.body;
    if (!baked.has(c.body) && c.body !== repoBody) why = "their body isn't baked yet";
    else {
      const errs = checkCharacter(c, all).errors;
      if (errs.length) why = errs.map((x) => `${x.field}: ${x.error}`).join("; ");
    }
    if (!why) { live.push(c); continue; }
    held.set(c.id, why);
    // a repo character keeps playing the version it had while its list entry can't go on
    const repo = FILES.find((f) => f.id === c.id && f.status !== "draft");
    if (repo) live.push(structuredClone(repo));
  }
  // (a repo version stood back in can't take a place or a body someone live already has)
  const seen = { order: new Set<number>(), body: new Set<string>() };
  const ok = live.sort((a, b) => a.order - b.order).filter((c) => {
    if (seen.order.has(c.order) || seen.body.has(c.body)) { if (!held.has(c.id)) held.set(c.id, "another character has their place or body"); return false; }
    seen.order.add(c.order); seen.body.add(c.body);
    return true;
  });
  setSuitedBodies(store.survivorzSuitedBodies());
  if (applyCast(ok)) console.log(`[survivorz] cast now: ${ok.map((c) => `${c.id}${c.status === "bench" ? "(bench)" : ""}`).join(", ")}${held.size ? ` (held: ${[...held.keys()].join(", ")})` : ""}`);
}

/** WHAT'S LEFT for one character (Josh, Nov 4 2026): each step, done or not, in the order they happen. */
type Step = { key: string; label: string; done: boolean; note?: string };
function checklist(c: Character, store: Store, voices: Set<string>, baked: Set<string>): Step[] {
  const row = typeof c.body === "string" ? store.survivorzBody(c.body) : null;
  const isBaked = baked.has(c.body);
  const bodyNote = isBaked ? undefined
    : !row ? "no model yet: add one in Bodies"
    : row.status === "baking" ? "baking now"
    : row.status === "paused" ? "paused"
    : row.status === "failed" ? "the bake stopped (see Bodies)"
    : "in the bake queue";
  const clone = c.voice?.clone ?? "";
  const pairs = isBaked ? pairsDone(c.body) : null;
  const live = c.status !== "draft" && isLive(c.id) && !held.has(c.id);
  return [
    { key: "body", label: "Body baked", done: isBaked, note: bodyNote },
    { key: "pairs", label: "Grabs, bites and rescues", done: pairs === true, note: !isBaked ? "after the body" : pairs ? undefined : "not yet: Bodies → Bake grabs & bites" },
    { key: "voice", label: "Voice", done: !!clone && voices.has(clone), note: !clone ? "none picked" : voices.has(clone) ? undefined : `"${clone}" isn't in the voice library` },
    // (a model with no licence bakes fine but is flagged until one is noted — Josh, Nov 5 2026; the hand-made bodies count as noted)
    { key: "licence", label: "Licence noted", done: row ? !!row.licence : isBaked, note: row ? (row.licence ? undefined : "add it in Bodies") : isBaked ? undefined : "after the body" },
    { key: "status", label: "On the bench or cast", done: c.status !== "draft", note: c.status === "draft" ? "still a draft" : undefined },
    { key: "live", label: "In the show", done: live, note: live ? undefined : c.status === "draft" ? undefined : held.get(c.id) },
  ];
}

export function registerSurvivorzCastRoutes(router: Router, model: TalkModel): void {
  /** everyone as the panel sees them: the repo's files, each overridden by its list entry */
  const world = (rows: Row[]): Character[] => {
    const gone = new Set(rows.filter(isDeleted).map((r) => r.id));
    const list = rows.filter((r) => !isDeleted(r)).map((r) => parse(r).char);
    return FILES.filter((f) => !gone.has(f.id) && !list.some((l) => l.id === f.id)).concat(list);
  };
  /** what they think of somebody deleted (or never real) goes with them, quietly */
  const prune = (c: Character, rows: Row[]): Character => {
    if (c.regard && typeof c.regard === "object") {
      const ids = new Set(world(rows).map((o) => o.id));
      c.regard = Object.fromEntries(Object.entries(c.regard).filter(([k]) => ids.has(k) || k === c.id));
    }
    return c;
  };
  /** SPAWN AND STRIP ORDER ARE NOT THE CREATOR'S (Josh, Nov 3 2026: "I dont know what cast strip order
   *  means, or spawn order"): a character keeps the places it has, and a new one goes after everyone.
   *  The lineup in the Survivorz panel is what decides who walks in, and in what order. */
  const placed = (c: Character, rows: Row[]): Character => {
    const all = world(rows).filter((o) => o.id !== c.id);
    const have = FILES.find((f) => f.id === c.id) ?? all.find((o) => o.id === c.id);
    const next = (k: "order" | "strip") => Math.max(-1, ...all.map((o) => (Number.isInteger(o[k]) ? o[k] : -1))) + 1;
    if (!Number.isInteger(c.order)) c.order = have && Number.isInteger(have.order) ? have.order : next("order");
    if (!Number.isInteger(c.strip)) c.strip = have && Number.isInteger(have.strip) ? have.strip : next("strip");
    return c;
  };
  /** the rules, against everyone else; a body not baked yet is something to do, not a refusal, here */
  const check = (c: Character, rows: Row[]) => {
    prune(c, rows);
    placed(c, rows);
    const others = world(rows).filter((o) => o.id !== c.id).concat([c]);
    const r = checkCharacter(c, others);
    const baked = bodies();
    if (typeof c.body === "string" && /^[a-z0-9-]{2,32}$/.test(c.body) && !baked.includes(c.body)) {
      r.warnings.push({ field: "body", error: "that body isn't baked yet: they join the show once it is (Bodies tab)" });
    }
    return r;
  };

  router.get("/api/admin/survivorz/cast", "admin", ({ res, store }) => {
    const rows = store.survivorzListAll() as Row[];
    const names = new Map<number, string>();
    const list = rows.map((r) => {
      const repo = FILES.find((f) => f.id === r.id);
      const deleted = isDeleted(r);
      const { char, regardIn } = deleted ? { char: repo ?? ({ id: r.id } as Character), regardIn: {} } : parse(r);
      const state = deleted ? "deleted" : !repo ? "new" : JSON.stringify(tidy(repo)) === JSON.stringify(tidy(char)) ? "same" : "changed";
      let by: string | null = null;
      if (r.updatedBy != null) {
        if (!names.has(r.updatedBy)) names.set(r.updatedBy, store.getUserById(r.updatedBy)?.displayName ?? "?");
        by = names.get(r.updatedBy) ?? null;
      }
      return { char, regardIn, updatedAt: r.updatedAt, by, state, ...(deleted ? { deleted: true } : {}) };
    });
    const ids = new Set([...FILES.map((f) => f.id), ...rows.map((r) => r.id)]);
    const voices = voiceNames(), baked = new Set(bodies());
    const todo: Record<string, Step[]> = {};
    for (const c of everyone(rows)) todo[c.id] = checklist(c, store, voices, baked);
    json(res, 200, {
      todo,
      cast: FILES,
      list,
      bodies: bodies(),
      bibles: Object.fromEntries([...ids].map((id) => [id, bible(id) !== null])),
      vocab: { genes: GENE_KEYS, geneBase: GENE_BASE, melee: MELEE_IDS, guns: GUN_IDS, kokoro: KOKORO_VOICES, limits: LIMITS, geneMeans: GENE_MEANS, skills: SKILL_KEYS, skillInfo: SKILL_INFO, skillGroups: SKILL_GROUPS, skillBudget: SKILL_BUDGET },
      suited: bodies().filter((b) => isSuitedBody(b)),
      canHear: model.up(),
    });
  });

  // THE SHOW'S ROSTER (Josh, Nov 5 2026: "the survivorz panel is the show management page and the character
  // creator is the workshop"): every character, with what they're good at, what's left before they can be in
  // the show, and whether they are — the Survivorz panel's Cast card draws this and its Cast / Bench / Off
  // buttons go through /status below.
  router.get("/api/admin/survivorz/roster", "admin", ({ res, store }) => {
    const rows = store.survivorzListAll() as Row[];
    const voices = voiceNames(), baked = new Set(bodies());
    const roster = everyone(rows).sort((a, b) => (a.strip ?? 0) - (b.strip ?? 0) || a.id.localeCompare(b.id)).map((c) => {
      const steps = checklist(c, store, voices, baked);
      const sk = skillsOf(c);
      const top = SKILL_KEYS.filter((k) => sk[k] > SKILL_INFO[k].base).sort((a, b) => sk[b] - sk[a]).slice(0, 3).map((k) => ({ key: k, label: SKILL_INFO[k].label, level: sk[k] }));
      const ready = steps.filter((s) => s.key === "body" || s.key === "pairs" || s.key === "voice").every((s) => s.done);
      return { ...publicOf(c, isSuitedBody(c.body)), short: c.short, top, steps, ready, live: steps.find((s) => s.key === "live")!.done, held: held.get(c.id) ?? null };
    });
    json(res, 200, { roster });
  });

  // ONE CLICK FROM THE SHOW PANEL: Cast (walks in) · Bench (ready, held back) · Off (a draft again). Saved as
  // the character's list entry, exactly as the creator's save does, so the creator sees the same thing.
  router.post("/api/admin/survivorz/cast/:id/status", "admin", ({ res, params, body, store, user }) => {
    const status = String((body as { status?: unknown })?.status ?? "");
    if (!["cast", "bench", "draft"].includes(status)) return json(res, 400, { error: "bad_status" });
    const rows = store.survivorzListAll() as Row[];
    const cur = everyone(rows).find((c) => c.id === params.id);
    if (!cur) return json(res, 404, { error: "not_found" });
    const row = rows.find((r) => r.id === params.id && !isDeleted(r));
    const c = tidy({ ...(row ? parse(row).char : cur), status });
    const r = check(c, rows);
    if (r.errors.length) return json(res, 400, { error: "not_saved", ...r });
    store.survivorzListSave(c.id, JSON.stringify(c), row?.regardIn ?? "{}", user.id);
    store.audit(user.id, "survivorz.character_status", `${c.id} → ${status}`);
    refreshCast(store);
    json(res, 200, { ok: true, live: isLive(c.id) && !held.has(c.id), held: held.get(c.id) ?? null, warnings: r.warnings });
  });

  router.get("/api/admin/survivorz/cast/bible/:id", "admin", ({ res, params }) => {
    if (!ID.test(params.id)) return json(res, 400, { error: "bad_id" });
    json(res, 200, { text: bible(params.id) });
  });

  router.post("/api/admin/survivorz/cast/check", "admin", ({ res, body, store }) => {
    json(res, 200, check(tidy((body as { char?: unknown })?.char), store.survivorzListAll() as Row[]));
  });

  router.post("/api/admin/survivorz/cast/save", "admin", ({ res, body, store, user }) => {
    const b = (body ?? {}) as { char?: unknown; regardIn?: unknown };
    const c = tidy(b.char);
    const rows = store.survivorzListAll() as Row[];
    const r = check(c, rows);
    if (r.errors.length) return json(res, 400, { error: "not_saved", ...r });
    const regardIn = cleanRegardIn(b.regardIn);
    for (const k of Object.keys(regardIn)) if (k === c.id || !world(rows).some((o) => o.id === k)) delete regardIn[k];
    const data = JSON.stringify(c);
    if (data.length > 20_000) return json(res, 400, { error: "too_big" });
    store.survivorzListSave(c.id, data, JSON.stringify(regardIn), user.id);
    store.audit(user.id, "survivorz.character_saved", c.id);
    refreshCast(store);
    json(res, 200, { ok: true, warnings: r.warnings, live: isLive(c.id) && !held.has(c.id), held: held.get(c.id) ?? null });
  });

  router.del("/api/admin/survivorz/cast/:id", "admin", ({ res, params, store, user }) => {
    if (!ID.test(params.id)) return json(res, 400, { error: "bad_id" });
    // A DELETE IS FOR GOOD (Josh, Nov 10 2026: "when i delete a character it should be permanent"): this
    // route discards a character's unsaved-to-git CHANGES; it no longer brings back somebody deleted
    const row = (store.survivorzListAll() as Row[]).find((r) => r.id === params.id);
    if (row && isDeleted(row)) return json(res, 409, { error: "deleted" });
    if (!store.survivorzListDelete(params.id)) return json(res, 404, { error: "not_found" });
    store.audit(user.id, "survivorz.character_removed", params.id);
    refreshCast(store);
    json(res, 200, { ok: true });
  });

  // delete a character: a list-only one is simply gone; a show character is marked for the next pull
  router.post("/api/admin/survivorz/cast/:id/delete", "admin", ({ res, params, store, user }) => {
    if (!ID.test(params.id)) return json(res, 400, { error: "bad_id" });
    const inRepo = FILES.some((f) => f.id === params.id);
    if (inRepo) store.survivorzListSave(params.id, DELETED(params.id), "{}", user.id);
    else if (!store.survivorzListDelete(params.id)) return json(res, 404, { error: "not_found" });
    store.audit(user.id, "survivorz.character_deleted", params.id);
    refreshCast(store);
    json(res, 200, { ok: true, pending: false });
  });

  router.post("/api/admin/survivorz/cast/hear", "admin", async ({ res, body }) => {
    const b = (body ?? {}) as { char?: unknown; situation?: unknown };
    const c = tidy(b.char);
    if (typeof c.sheet !== "string" || !c.sheet.trim() || typeof c.name !== "string" || !c.genes) return json(res, 400, { error: "needs_sheet" });
    if (!model.up()) return json(res, 200, { line: null, note: "The model is off right now (the workstation is paused or asleep)." });
    const situation = String(b.situation ?? "").slice(0, 300) || "Rick asks the group who wants to take first watch.";
    const genome = Object.entries(c.genes).map(([g, v]) => `${g} ${v}`).join(", ");
    const system = [c.sheet.slice(0, LIMITS.sheetMax), "", worldOf(), "", RULES, "", `YOUR NATURE (0-10): ${genome}.`].join("\n");
    const user = ["FACTS:\n- You're in the safe room with the others.", `WHAT JUST HAPPENED: ${situation}`, "Say your line now — only the words you say out loud."].join("\n\n");
    const t0 = Date.now();
    const line = await writeChecked(model, system, user, c.name, [], 30_000);
    json(res, 200, { line, ms: Date.now() - t0, note: line ? "" : "Nothing passed the show's checks. Try again, or change the sheet." });
  });
}
