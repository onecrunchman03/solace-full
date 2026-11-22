// SOLACE SURVIVORZ — THE CHARACTER CREATOR'S BODIES (docs/survivorz/CREATOR.md, migration 118).
//
// Josh drops a rigged model (FBX, GLB, or a zip holding one with its textures) into Admin Panel →
// Characters. It is kept here and queued. The worker on his PC (scripts/survivorz/creator/worker.mjs,
// on SURVIVORZ_WORKER_TOKEN) claims it, bakes it there with the whole clip library
// (scripts/survivorz/creator/bake.mjs), reports each step as it goes, and sends the packed body back
// into game/<id>.glb — where the show and the character list already look for bodies. Nothing about
// a body needs a deploy or a Claude step.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { bearer, json, readRawBody, type Router } from "../http";
import { config } from "../config";
import { FILES } from "../survivorz/cast/files";
import { isWorkerToken, workerTokenConfigured } from "../survivorz/workertoken";
import { creatorRoot, survivorzRoot } from "./survivorz-assets";
import type { Store, SurvivorzBodyRow } from "../db/store";
import { refreshCast } from "./survivorz-cast";
import { cleanPairTable, forgetPairs, pairClipDir, pairsDone, savePairTable } from "./survivorz-pairs";

const MODELS = path.join(config.uploadsDir, "survivorz-models");
export const MAX_MODEL_BYTES = 250 * 1024 * 1024;
export const MAX_BODY_BYTES = 150 * 1024 * 1024;
const ID = /^[a-z0-9-]{2,32}$/;
const FILE = /^[0-9a-f-]{36}\.(fbx|glb|zip)$/;
const STEP_STATES = new Set(["pending", "running", "done", "failed"]);
const STEP_ID = /^[a-z0-9-]{1,32}$/;

/** When the worker last asked for work: the panel shows whether anybody is there to bake. */
let workerSeenAt = 0;
let workerName = "";

/** What the bytes are, read off their first few: never the file name or the browser's word. */
export function sniffModel(buf: Buffer): "fbx" | "glb" | "zip" | null {
  if (buf.subarray(0, 18).toString("latin1") === "Kaydara FBX Binary") return "fbx";
  const head = buf.subarray(0, 64).toString("latin1").replace(/^﻿|^\xEF\xBB\xBF/, "");
  if (/^\s*; FBX/.test(head)) return "fbx";
  if (buf.length >= 12 && buf.readUInt32LE(0) === 0x46546c67) return "glb";
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return "zip";
  return null;
}

/** Where a baked body is written: the creator's shelf under the data dir (the tree's game/ is
 *  read-only to the hardened service). The asset route serves both. */
/** a creator body's loop speeds into the creator's loopspeed.json ({ clip: { body: speed } }); null takes it out */
function writeLoopSpeeds(id: string, speeds: Record<string, number> | null): void {
  const file = path.join(creatorRoot(), "loopspeed.json");
  let all: Record<string, Record<string, number>> = {};
  try { all = JSON.parse(fs.readFileSync(file, "utf8")); } catch { if (!speeds) return; }
  for (const clip of Object.keys(all)) { delete all[clip][id]; if (!Object.keys(all[clip]).length) delete all[clip]; }
  for (const [clip, v] of Object.entries(speeds ?? {})) (all[clip] ??= {})[id] = v;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeAtomic(file, JSON.stringify(all, null, 1));
}

/** WHAT A CREATOR BODY CARRIES (the bake's "kit" step: kit-fit.mjs + kit-stow.mjs): where a pack rides its back
 *  and where a holstered pistol, a belt tool and a slung rifle sit. Kept on the creator's shelf as the show's own
 *  shape, { packs: { body: … }, stow: { body: … } }; null takes a body out. */
function writeKitFit(id: string, fit: KitFitRow | null): void {
  const file = path.join(creatorRoot(), "kitfit.json");
  let all: { packs: Record<string, unknown>; stow: Record<string, unknown> } = { packs: {}, stow: {} };
  try { const was = JSON.parse(fs.readFileSync(file, "utf8")); all = { packs: was.packs ?? {}, stow: was.stow ?? {} }; } catch { if (!fit) return; }
  delete all.packs[id]; delete all.stow[id];
  if (fit && Object.keys(fit.packs).length) all.packs[id] = fit.packs;
  if (fit && Object.keys(fit.stow).length) all.stow[id] = fit.stow;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeAtomic(file, JSON.stringify(all, null, 1));
}
interface KitFitRow { packs: Record<string, unknown>; stow: Record<string, unknown> }
const PACK_IDS = new Set(["backpack-small", "backpack-large"]);
const STOW_FRAMES = new Set(["chest", "hip", "thigh_l", "thigh_r"]);
const KIT_NAME = /^[a-z0-9:-]{1,80}$/;
/** a worker's fit, checked field by field into the shape the show reads (kit.ts PackFit, StowFit); null = refused */
function cleanKitFit(raw: unknown): KitFitRow | null {
  const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  const num = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
  const v3 = (v: unknown): v is number[] => Array.isArray(v) && v.length === 3 && v.every((c) => num(c, -2, 2));
  if (!obj(raw)) return null;
  const out: KitFitRow = { packs: {}, stow: {} };
  if (raw.packs !== undefined) {
    if (!obj(raw.packs)) return null;
    for (const [pack, p] of Object.entries(raw.packs)) {
      if (!PACK_IDS.has(pack) || !obj(p) || !num(p.back, 0, 0.8) || !num(p.up, -0.8, 0.8) || !num(p.tilt, -45, 45) || !num(p.scale, 0.2, 2)) return null;
      const push: Record<string, number> = {};
      if (p.push !== undefined) {
        if (!obj(p.push) || Object.keys(p.push).length > 120) return null;
        for (const [clip, d] of Object.entries(p.push)) { if (!KIT_NAME.test(clip) || !num(d, 0, 0.6)) return null; push[clip] = d; }
      }
      out.packs[pack] = { back: p.back, up: p.up, tilt: p.tilt, scale: p.scale, push };
    }
  }
  if (raw.stow !== undefined) {
    if (!obj(raw.stow) || Object.keys(raw.stow).length > 30) return null;
    for (const [slot, s] of Object.entries(raw.stow)) {
      if (!KIT_NAME.test(slot) || !obj(s) || typeof s.frame !== "string" || !STOW_FRAMES.has(s.frame) || !v3(s.at) || !v3(s.y) || !v3(s.z) || !v3(s.pivot)) return null;
      out.stow[slot] = { frame: s.frame, at: s.at, y: s.y, z: s.z, pivot: s.pivot };
    }
  }
  return Object.keys(out.packs).length || Object.keys(out.stow).length ? out : null;
}

function gameDir(): string {
  return path.join(creatorRoot(), "game");
}

/** Ids a new body may not take: every baked body, every zombie, every body in the queue. */
function taken(store: Store, id: string): boolean {
  if (/^zombie-/.test(id)) return true;
  if (bakedOnShelf(id)) return true;
  return store.survivorzBody(id) != null;
}

/** A character uses this body (a repo file, or one on the panel's list; a list row wins over the repo file of
 *  the same id, and a DELETED character wears nothing — Nov 10 2026 review). */
function inUse(store: Store, id: string): string | null {
  const wears = new Map<string, { body?: string; name: string }>();
  for (const [key, c] of Object.entries(FILES)) { const x = c as { id?: string; body?: string; name?: string }; wears.set(x.id ?? key, { body: x.body, name: x.name ?? key }); }
  for (const r of store.survivorzListAll()) {
    try {
      const c = JSON.parse(r.data) as { body?: string; name?: string; deleted?: unknown };
      if (c.deleted === true) wears.delete(r.id);
      else wears.set(r.id, { body: c.body, name: c.name ?? r.id });
    } catch { /* a bad row is the list's problem, not ours */ }
  }
  for (const c of wears.values()) if (c.body === id) return c.name;
  return null;
}

/** THE WORKER MAY STILL SEND WHAT IT FINISHED when the admin pressed Pause during the sending (Nov 10 2026
 *  review: the pause turned a finished bake into "failed"). Baking, or paused while it was this worker's. */
const delivering = (row: SurvivorzBodyRow): boolean => row.status === "baking" || (row.status === "paused" && row.worker != null);

/** Is this body baked and on a shelf the show reads (the creator's, or the tree's hand-made seven)? */
function bakedOnShelf(id: string): boolean {
  return fs.existsSync(path.join(gameDir(), `${id}.glb`)) || fs.existsSync(path.join(survivorzRoot(), "game", `${id}.glb`));
}

/** NOT BAKED YET (Josh, Nov 4 2026: "show which have not been baked so i can add them"): every body a
 *  character wears that isn't on a shelf, with who wears it. A row on the panel's list wins over the
 *  repo file of the same id. */
function unbaked(store: Store): { body: string; characters: { id: string; name: string; status: string }[] }[] {
  const chars = new Map<string, { id: string; name: string; status: string; body: string }>();
  for (const [key, c] of Object.entries(FILES)) {
    const x = c as { id?: string; name?: string; status?: string; body?: string };
    if (x.body) chars.set(x.id ?? key, { id: x.id ?? key, name: x.name ?? key, status: x.status ?? "draft", body: x.body });
  }
  for (const r of store.survivorzListAll()) {
    try {
      const x = JSON.parse(r.data) as { name?: string; status?: string; body?: string; deleted?: unknown };
      // (a DELETED character wears nothing — Nov 10 2026: Josh deleted seven and they stayed on this list,
      // because the repo file of the same id had already put them in it)
      if (x.deleted === true) { chars.delete(r.id); continue; }
      if (x.body) chars.set(r.id, { id: r.id, name: x.name ?? r.id, status: x.status ?? "draft", body: x.body });
    } catch { /* a bad row is the list's problem */ }
  }
  const out = new Map<string, { id: string; name: string; status: string }[]>();
  for (const c of chars.values()) {
    if (!ID.test(c.body) || bakedOnShelf(c.body)) continue;
    const list = out.get(c.body) ?? [];
    list.push({ id: c.id, name: c.name, status: c.status });
    out.set(c.body, list);
  }
  return [...out].map(([body, characters]) => ({ body, characters })).sort((a, b) => a.body.localeCompare(b.body));
}

function view(r: SurvivorzBodyRow) {
  let steps: unknown = {}, report: unknown = null;
  try { steps = JSON.parse(r.steps); } catch { /* left empty */ }
  try { report = r.report ? JSON.parse(r.report) : null; } catch { /* left empty */ }
  const { sourceFile: _f, ...rest } = r;
  return { ...rest, steps, report, baked: fs.existsSync(path.join(gameDir(), `${r.id}.glb`)), pairs: pairsDone(r.id) };
}

/** Write a file whole or not at all: a half-sent body must never be what the show loads. */
function writeAtomic(file: string, data: Buffer | string): void {
  const tmp = `${file}.part-${process.pid}`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

export function registerSurvivorzBodyRoutes(router: Router): void {
  fs.mkdirSync(MODELS, { recursive: true });

  // ---- the admin's side: drop a model in, watch it bake ----------------------------------------
  router.get("/api/admin/survivorz/bodies", "admin", ({ res, store }) => {
    json(res, 200, {
      bodies: store.survivorzBodies().map(view),
      unbaked: unbaked(store),
      worker: { configured: workerTokenConfigured(), seenAt: workerSeenAt || null, name: workerName || null },
    });
  });

  // Raw model bytes; ?id=, ?name= (the file's own name), ?height=, ?licence=, ?credit= carry the rest.
  router.postRaw("/api/admin/survivorz/bodies", "admin", async ({ req, res, url, user, store }) => {
    const id = String(url.searchParams.get("id") ?? "").trim().toLowerCase();
    if (!ID.test(id)) return json(res, 400, { error: "bad_id", message: "2-32 characters: a-z, 0-9 and -" });
    if (taken(store, id)) return json(res, 409, { error: "id_taken" });
    let buf: Buffer;
    try {
      buf = await readRawBody(req, MAX_MODEL_BYTES);
    } catch {
      return json(res, 413, { error: "too_large", max: MAX_MODEL_BYTES });
    }
    const kind = sniffModel(buf);
    if (!kind) return json(res, 415, { error: "not_a_model", message: "FBX, GLB, or a zip holding one" });
    const h = Number(url.searchParams.get("height"));
    const heightM = Number.isFinite(h) && h >= 1.3 && h <= 2.2 ? Math.round(h * 1000) / 1000 : null;
    const clean = (k: string) => String(url.searchParams.get(k) ?? "").trim().slice(0, 200) || null;
    const file = `${randomUUID()}.${kind}`;
    fs.writeFileSync(path.join(MODELS, file), buf);
    store.survivorzBodyAdd({
      id, sourceName: (clean("name") ?? `model.${kind}`).slice(0, 120), sourceFile: file, sourceBytes: buf.length,
      heightM, licence: clean("licence"), credit: clean("credit"), by: user.id,
    });
    store.audit(user.id, "survivorz.body.add", `${id} (${(buf.length / 1e6).toFixed(1)} MB ${kind})`);
    json(res, 200, { body: view(store.survivorzBody(id)!) });
  });

  // Licence, credit and height can be put right after the drop; a height change needs a re-bake.
  router.patch("/api/admin/survivorz/bodies/:id", "admin", ({ res, params, body, user, store }) => {
    const row = store.survivorzBody(params.id);
    if (!row) return json(res, 404, { error: "not_found" });
    const b = (body ?? {}) as { licence?: unknown; credit?: unknown; heightM?: unknown; suited?: unknown };
    const f: Parameters<Store["survivorzBodySet"]>[1] = {};
    // (a SEALED SUIT is the body's, Nov 5 2026: whoever wears it has no backpack over the air pack and a muffled voice)
    if (b.suited !== undefined) f.suited = b.suited === true ? 1 : 0;
    if (b.licence !== undefined) f.licence = String(b.licence ?? "").trim().slice(0, 200) || null;
    if (b.credit !== undefined) f.credit = String(b.credit ?? "").trim().slice(0, 200) || null;
    if (b.heightM !== undefined) {
      const h = Number(b.heightM);
      f.heightM = b.heightM === null ? null : Number.isFinite(h) && h >= 1.3 && h <= 2.2 ? Math.round(h * 1000) / 1000 : row.heightM;
    }
    store.survivorzBodySet(row.id, f);
    store.audit(user.id, "survivorz.body.edit", row.id);
    if (f.suited !== undefined) refreshCast(store);
    json(res, 200, { body: view(store.survivorzBody(row.id)!) });
  });

  router.post("/api/admin/survivorz/bodies/:id/rebake", "admin", ({ res, params, user, store }) => {
    const row = store.survivorzBody(params.id);
    if (!row) return json(res, 404, { error: "not_found" });
    if (row.status === "baking") return json(res, 409, { error: "baking" });
    store.survivorzBodySet(row.id, { status: "queued", steps: "{}", error: null, worker: null, claimedAt: null, paused: null, resumeFrom: null, queueOrder: store.survivorzQueueEnd() });
    store.audit(user.id, "survivorz.body.rebake", row.id);
    json(res, 200, { body: view(store.survivorzBody(row.id)!) });
  });

  // GRABS, BITES AND RESCUES for a body baked before they were (Nov 4 2026): back in the queue from the
  // "pairs" step, every earlier step kept — the PC that baked it still has its stage
  router.post("/api/admin/survivorz/bodies/:id/pairs", "admin", ({ res, params, user, store }) => {
    const row = store.survivorzBody(params.id);
    if (!row) return json(res, 404, { error: "not_found" });
    if (row.status !== "ready" && row.status !== "failed") return json(res, 409, { error: "not_ready" });
    let steps: Record<string, unknown> = {};
    try { steps = JSON.parse(row.steps) as Record<string, unknown>; } catch { /* none */ }
    delete steps.pairs; delete steps.verify;
    store.survivorzBodySet(row.id, { status: "queued", steps: JSON.stringify(steps), error: null, worker: null, claimedAt: null, paused: null, resumeFrom: "pairs", queueOrder: store.survivorzQueueEnd() });
    store.audit(user.id, "survivorz.body.pairs", row.id);
    json(res, 200, { body: view(store.survivorzBody(row.id)!) });
  });

  // PAUSE frees the GPU now: the worker hears it on its next report (within ~5 s), stops the bake and
  // hands the GPU back to the LLM. A queued body paused just waits. A game's pause becomes the admin's.
  router.post("/api/admin/survivorz/bodies/:id/pause", "admin", ({ res, params, user, store }) => {
    const row = store.survivorzBody(params.id);
    if (!row) return json(res, 404, { error: "not_found" });
    if (row.status !== "baking" && row.status !== "queued" && row.status !== "paused") return json(res, 409, { error: "not_running" });
    store.survivorzBodySet(row.id, { status: "paused", paused: "me" });
    store.audit(user.id, "survivorz.body.pause", row.id);
    json(res, 200, { body: view(store.survivorzBody(row.id)!) });
  });

  // RESUME puts it back in the queue; the worker takes it up again from the step it was on.
  router.post("/api/admin/survivorz/bodies/:id/resume", "admin", ({ res, params, user, store }) => {
    const row = store.survivorzBody(params.id);
    if (!row) return json(res, 404, { error: "not_found" });
    if (row.status !== "paused") return json(res, 409, { error: "not_paused" });
    // (a game's pause ends when the game does: the worker is holding it and starts it again itself)
    if (row.paused === "game") return json(res, 409, { error: "game_running" });
    store.survivorzBodySet(row.id, { status: "queued", paused: null, worker: null, claimedAt: null });
    store.audit(user.id, "survivorz.body.resume", `${row.id}${row.resumeFrom ? ` from ${row.resumeFrom}` : ""}`);
    json(res, 200, { body: view(store.survivorzBody(row.id)!) });
  });

  // THE QUEUE'S ORDER: the waiting bodies' ids, first to bake first. Only waiting bodies may be listed
  // (queued, or paused — a paused one keeps its place for when it's resumed).
  router.post("/api/admin/survivorz/bodies/queue", "admin", ({ res, body, user, store }) => {
    const ids = (body as { ids?: unknown } | null)?.ids;
    if (!Array.isArray(ids) || ids.length > 500 || !ids.every((x) => typeof x === "string" && ID.test(x))) return json(res, 400, { error: "bad_ids" });
    if (new Set(ids).size !== ids.length) return json(res, 400, { error: "bad_ids" });
    for (const id of ids as string[]) {
      const row = store.survivorzBody(id);
      if (!row) return json(res, 404, { error: "not_found", id });
      if (row.status !== "queued" && row.status !== "paused") return json(res, 409, { error: "not_waiting", id });
    }
    store.survivorzQueueSet(ids as string[]);
    store.audit(user.id, "survivorz.body.queue", (ids as string[]).join(", ").slice(0, 300));
    json(res, 200, { ok: true });
  });

  router.del("/api/admin/survivorz/bodies/:id", "admin", ({ res, params, user, store }) => {
    const row = store.survivorzBody(params.id);
    if (!row) return json(res, 404, { error: "not_found" });
    // (not out from under the worker: pause it first — a body removed mid-bake baked on for an hour, the LLM paused)
    if (row.status === "baking" || (row.status === "paused" && row.paused === "game")) return json(res, 409, { error: "baking" });
    const who = inUse(store, row.id);
    if (who) return json(res, 409, { error: "in_use", name: who });
    store.survivorzBodyDelete(row.id);
    if (FILE.test(row.sourceFile)) fs.rm(path.join(MODELS, row.sourceFile), { force: true }, () => {});
    fs.rm(path.join(gameDir(), `${row.id}.glb`), { force: true }, () => {});
    forgetPairs(row.id);
    writeLoopSpeeds(row.id, null);
    writeKitFit(row.id, null);
    store.audit(user.id, "survivorz.body.remove", row.id);
    refreshCast(store);
    json(res, 200, { ok: true });
  });

  // ---- the worker's side (SURVIVORZ_WORKER_TOKEN) ----------------------------------------------
  const worker = (req: Parameters<typeof bearer>[0], url: URL): boolean => isWorkerToken(bearer(req, url));

  // The oldest queued body, claimed. A body this worker was already baking (it restarted) comes
  // back to it first, so a crash resumes instead of stranding the body as "baking" forever.
  router.get("/api/survivorz/worker/next", "none", ({ req, res, url, store }) => {
    if (!worker(req, url)) return json(res, 401, { error: "unauthorized" });
    const name = String(url.searchParams.get("worker") ?? "pc").slice(0, 60);
    workerSeenAt = Date.now();
    workerName = name;
    // every body still on the server: one the worker baked and the admin since removed is forgotten there
    const known = store.survivorzBodies().map((b) => b.id);
    // (a body it paused for a game is still its own: it waits for the game to close, then carries on)
    const mine = store.survivorzBodies().find((b) => b.worker === name && (b.status === "baking" || (b.status === "paused" && b.paused === "game")));
    const row = mine ?? store.survivorzBodyClaim(name);
    if (!row) return json(res, 200, { body: null, known });
    json(res, 200, { body: { id: row.id, sourceName: row.sourceName, kind: row.sourceFile.split(".").pop(), heightM: row.heightM, licence: row.licence, credit: row.credit, steps: view(row).steps, resumeFrom: row.resumeFrom, paused: row.paused }, known });
  });

  router.get("/api/survivorz/worker/model/:id", "none", ({ req, res, url, params, store }) => {
    if (!worker(req, url)) return json(res, 401, { error: "unauthorized" });
    const row = store.survivorzBody(params.id);
    if (!row || !FILE.test(row.sourceFile)) return json(res, 404, { error: "not_found" });
    const file = path.join(MODELS, row.sourceFile);
    if (!fs.existsSync(file)) return json(res, 404, { error: "file_gone" });
    res.writeHead(200, { "content-type": "application/octet-stream", "content-length": fs.statSync(file).size, "cache-control": "no-store" });
    // (a read that fails part-way ends the answer: the worker's download retries)
    fs.createReadStream(file).on("error", () => res.destroy()).pipe(res);
  });

  // Each step as the bake reaches it: { steps, report?, status?: "failed", error? }.
  router.post("/api/survivorz/worker/:id/progress", "none", ({ req, res, url, params, body, store }) => {
    if (!worker(req, url)) return json(res, 401, { error: "unauthorized" });
    const row = store.survivorzBody(params.id);
    if (!row) return json(res, 404, { error: "not_found" });
    if (row.status !== "baking" && row.status !== "paused") return json(res, 409, { error: "not_baking" });
    workerSeenAt = Date.now();
    const b = (body ?? {}) as { steps?: unknown; report?: unknown; status?: unknown; error?: unknown; paused?: unknown; resumeFrom?: unknown };
    const f: Parameters<Store["survivorzBodySet"]>[1] = {};
    if (b.steps && typeof b.steps === "object") {
      // only the shape the checklist reads, and never much of it
      const steps: Record<string, { state: string; startedAt?: number; endedAt?: number; error?: string; progress?: number; expectMs?: number }> = {};
      for (const [k, v] of Object.entries(b.steps as Record<string, unknown>).slice(0, 40)) {
        const s = v as { state?: unknown; startedAt?: unknown; endedAt?: unknown; error?: unknown; progress?: unknown; expectMs?: unknown };
        if (!/^[a-z0-9-]{1,32}$/.test(k) || !STEP_STATES.has(String(s?.state))) continue;
        steps[k] = {
          state: String(s.state),
          ...(Number.isFinite(Number(s.startedAt)) ? { startedAt: Number(s.startedAt) } : {}),
          ...(Number.isFinite(Number(s.endedAt)) ? { endedAt: Number(s.endedAt) } : {}),
          ...(s.error ? { error: String(s.error).slice(0, 2000) } : {}),
          // how far the step is (0-1) and what it's expected to take: the panel's time left
          ...(Number.isFinite(Number(s.progress)) && s.progress !== null ? { progress: Math.max(0, Math.min(1, Number(s.progress))) } : {}),
          ...(Number.isFinite(Number(s.expectMs)) && Number(s.expectMs) > 0 ? { expectMs: Math.min(6 * 3600e3, Math.round(Number(s.expectMs))) } : {}),
        };
      }
      f.steps = JSON.stringify(steps);
    }
    // (kept whole or not at all: cut at 20,000 characters it stopped being JSON and read back as nothing)
    if (b.report && typeof b.report === "object") { const rep = JSON.stringify(b.report); if (rep.length <= 20000) f.report = rep; }
    if (typeof b.resumeFrom === "string" && STEP_ID.test(b.resumeFrom)) f.resumeFrom = b.resumeFrom;
    // the worker saw a game start (paused "game") or close (paused null); the admin's own pause wins
    if (b.paused === "game" && row.status === "baking") { f.status = "paused"; f.paused = "game"; }
    if (b.paused === null && row.status === "paused" && row.paused === "game") { f.status = "baking"; f.paused = null; }
    if (b.status === "failed") {
      f.status = "failed";
      f.error = String(b.error ?? "the bake stopped").slice(0, 2000);
    }
    store.survivorzBodySet(row.id, f);
    // the answer the worker acts on: stop now, the admin paused it
    json(res, 200, { ok: true, pause: store.survivorzBody(row.id)?.paused === "me" });
  });

  // The packed body, whole: written beside the show's other bodies, atomically. Marks it ready.
  router.postRaw("/api/survivorz/worker/:id/body", "none", async ({ req, res, url, params, store }) => {
    if (!worker(req, url)) return json(res, 401, { error: "unauthorized" });
    const row = store.survivorzBody(params.id);
    if (!row) return json(res, 404, { error: "not_found" });
    if (!delivering(row)) return json(res, 409, { error: "not_baking" });
    let buf: Buffer;
    try {
      buf = await readRawBody(req, MAX_BODY_BYTES);
    } catch {
      return json(res, 413, { error: "too_large" });
    }
    if (sniffModel(buf) !== "glb") return json(res, 415, { error: "not_glb" });
    fs.mkdirSync(gameDir(), { recursive: true });
    writeAtomic(path.join(gameDir(), `${row.id}.glb`), buf);
    store.survivorzBodySet(row.id, { status: "ready", error: null, paused: null });
    store.audit(null, "survivorz.body.ready", `${row.id} (${(buf.length / 1e6).toFixed(1)} MB)`);
    refreshCast(store);   // a character waiting on this body joins the show now
    json(res, 200, { ok: true, bytes: buf.length });
  });

  // The body's grabs, bites and rescues (pair-sweep.cjs): only what measured within the line, cleaned to
  // this survivor and the shapes the show reads. Sent before the body, while it's still baking.
  router.post("/api/survivorz/worker/:id/pairs", "none", ({ req, res, url, params, body, store }) => {
    if (!worker(req, url)) return json(res, 401, { error: "unauthorized" });
    const row = store.survivorzBody(params.id);
    if (!row) return json(res, 404, { error: "not_found" });
    if (!delivering(row)) return json(res, 409, { error: "not_baking" });
    const t = cleanPairTable(row.id, (body as { table?: unknown } | null)?.table);
    if (!t) return json(res, 400, { error: "bad_table" });
    savePairTable(row.id, t);
    json(res, 200, { ok: true, chains: Object.keys(t.chains).length, bites: Object.keys(t.bites).length, pull: Object.keys(t.pull[row.id] ?? {}).length });
  });

  // One zombie's halves against this body (pack-pairclips.mjs): a small skeleton-only glb.
  router.postRaw("/api/survivorz/worker/:id/pairclip", "none", async ({ req, res, url, params, store }) => {
    if (!worker(req, url)) return json(res, 401, { error: "unauthorized" });
    const row = store.survivorzBody(params.id);
    if (!row) return json(res, 404, { error: "not_found" });
    if (!delivering(row)) return json(res, 409, { error: "not_baking" });
    const z = url.searchParams.get("zombie") ?? "";
    if (!/^zombie-[a-z0-9-]{1,24}$/.test(z)) return json(res, 400, { error: "bad_zombie" });
    let buf: Buffer;
    try { buf = await readRawBody(req, 12 * 1024 * 1024); } catch { return json(res, 413, { error: "too_large" }); }
    if (sniffModel(buf) !== "glb") return json(res, 415, { error: "not_glb" });
    fs.mkdirSync(pairClipDir(row.id), { recursive: true });
    writeAtomic(path.join(pairClipDir(row.id), `${z}.glb`), buf);
    json(res, 200, { ok: true, bytes: buf.length });
  });

  // HOW FAST ITS LOOPS GO (loop-speeds.mjs, the bake's "speeds" step): { clip: speed m/s }, kept beside the gun
  // seats in the creator's loopspeed.json as { clip: { body: speed } } — the show's feet are matched to it
  router.post("/api/survivorz/worker/:id/loopspeed", "none", ({ req, res, url, params, body, store }) => {
    if (!worker(req, url)) return json(res, 401, { error: "unauthorized" });
    const row = store.survivorzBody(params.id);
    if (!row) return json(res, 404, { error: "not_found" });
    if (!delivering(row)) return json(res, 409, { error: "not_baking" });
    const sp = (body as { speeds?: unknown } | undefined)?.speeds;
    if (!sp || typeof sp !== "object" || Array.isArray(sp)) return json(res, 400, { error: "bad_speeds" });
    const clean: Record<string, number> = {};
    for (const [clip, v] of Object.entries(sp as Record<string, unknown>)) {
      if (!/^[a-z0-9:-]{1,80}$/.test(clip) || typeof v !== "number" || !Number.isFinite(v) || v < 0.15 || v > 20) return json(res, 400, { error: "bad_speeds", clip });
      clean[clip] = +v.toFixed(3);
    }
    if (Object.keys(clean).length > 60) return json(res, 400, { error: "bad_speeds" });
    writeLoopSpeeds(row.id, clean);
    json(res, 200, { ok: true, clips: Object.keys(clean).length });
  });

  // WHAT IT CARRIES (the bake's "kit" step): its pack and stow fits, kept on the creator's shelf and served to the
  // show beside the page's own (asset body/kitfit.json). Token-only, checked field by field, only while baking.
  router.post("/api/survivorz/worker/:id/kitfit", "none", ({ req, res, url, params, body, store }) => {
    if (!worker(req, url)) return json(res, 401, { error: "unauthorized" });
    const row = store.survivorzBody(params.id);
    if (!row) return json(res, 404, { error: "not_found" });
    if (!delivering(row)) return json(res, 409, { error: "not_baking" });
    const fit = cleanKitFit((body as { fit?: unknown } | undefined)?.fit);
    if (!fit) return json(res, 400, { error: "bad_fit" });
    writeKitFit(row.id, fit);
    json(res, 200, { ok: true, packs: Object.keys(fit.packs).length, stow: Object.keys(fit.stow).length });
  });

  // How a gun sits in this body's fist (anim-build.cjs --gun-cal), merged into props/guns/cal.json.
  router.post("/api/survivorz/worker/:id/guncal", "none", ({ req, res, url, params, body, store }) => {
    if (!worker(req, url)) return json(res, 401, { error: "unauthorized" });
    const row = store.survivorzBody(params.id);
    if (!row) return json(res, 404, { error: "not_found" });
    if (!delivering(row)) return json(res, 409, { error: "not_baking" });
    const cal = (body as { cal?: unknown } | undefined)?.cal;
    if (!cal || typeof cal !== "object" || JSON.stringify(cal).length > 4000) return json(res, 400, { error: "bad_cal" });
    const file = path.join(creatorRoot(), "cal.json");
    let all: Record<string, unknown> = {};
    try { all = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* first one */ }
    all[row.id] = cal;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    writeAtomic(file, JSON.stringify(all, null, 1));
    json(res, 200, { ok: true });
  });
}
