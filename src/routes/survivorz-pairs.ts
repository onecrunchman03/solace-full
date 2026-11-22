// SOLACE SURVIVORZ — THE PAIRED MOVES A CREATOR BODY HAS (Josh, Nov 4 2026: grabs, bites and rescues
// for new bodies). The seven hand-made bodies have theirs in the client's bundled pairs.json; a body the
// creator bakes gets its own after the solo bake (scripts/survivorz/creator/bake.mjs "pairs"): the worker
// sends its table (pair-sweep.cjs — only what measured within the law's line) and, for each zombie, a
// skeleton-only glb of that zombie's halves (pack-pairclips.mjs). Kept on the creator's shelf:
//   pairs/<body>.json                 { chains, bites, pull } for that survivor body
//   pairclips/<body>/<zombie>.glb     the zombie's halves against that body
// and served merged (GET /api/survivorz/asset/pairs/pairs.json), with which zombies have clips for whom.
import fs from "node:fs";
import path from "node:path";
import { creatorRoot } from "./survivorz-assets";

/** the bodies whose pairs ship in the client's own pairs.json */
export const HAND_MADE = ["carla", "claudia", "eric", "manuel", "nathan", "rollo", "sophia"];

const BODY = /^[a-z0-9-]{2,32}$/;
const ZOMBIE = /^zombie-[a-z0-9-]{1,24}$/;
export const pairsDir = (): string => path.join(creatorRoot(), "pairs");
export const pairClipDir = (body: string): string => path.join(creatorRoot(), "pairclips", body);

/** Does this body have its grabs, bites and rescues? */
export function pairsDone(body: string): boolean {
  if (HAND_MADE.includes(body)) return true;
  return BODY.test(body) && fs.existsSync(path.join(pairsDir(), `${body}.json`));
}

type Spot = [number, number, number];
export interface PairTable {
  chains: Record<string, Record<string, { front?: string; back?: string }>>;
  bites: Record<string, Record<string, { forearm?: Spot; shoulder?: Spot }>>;
  pull: Record<string, Record<string, Spot>>;
}
const spot = (v: unknown): Spot | null =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1000) ? [v[0], v[1], v[2]] : null;

/** One body's table as the worker sent it, cleaned: only that survivor, only real zombies, only the
 *  shapes the show reads (a chain is two to three "fz"/"zv" codes, a spot three finite numbers). */
export function cleanPairTable(body: string, raw: unknown): PairTable | null {
  if (!BODY.test(body) || HAND_MADE.includes(body) || !raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out: PairTable = { chains: {}, bites: {}, pull: {} };
  for (const [z, by] of Object.entries((r.chains ?? {}) as Record<string, unknown>)) {
    const row = ZOMBIE.test(z) && by && typeof by === "object" ? (by as Record<string, unknown>)[body] : null;
    if (!row || typeof row !== "object") continue;
    const c: { front?: string; back?: string } = {};
    for (const k of ["front", "back"] as const) {
      const v = (row as Record<string, unknown>)[k];
      if (typeof v === "string" && /^(fz|zv){3}$/.test(v)) c[k] = v;
    }
    if (c.front || c.back) out.chains[z] = { [body]: c };
  }
  for (const [z, by] of Object.entries((r.bites ?? {}) as Record<string, unknown>)) {
    const row = ZOMBIE.test(z) && by && typeof by === "object" ? (by as Record<string, unknown>)[body] : null;
    if (!row || typeof row !== "object") continue;
    const b: { forearm?: Spot; shoulder?: Spot } = {};
    for (const k of ["forearm", "shoulder"] as const) { const s = spot((row as Record<string, unknown>)[k]); if (s) b[k] = s; }
    if (b.forearm || b.shoulder) out.bites[z] = { [body]: b };
  }
  const pull = ((r.pull ?? {}) as Record<string, unknown>)[body];
  if (pull && typeof pull === "object") {
    const p: Record<string, Spot> = {};
    for (const [z, v] of Object.entries(pull as Record<string, unknown>)) { const s = spot(v); if (ZOMBIE.test(z) && s) p[z] = s; }
    if (Object.keys(p).length) out.pull[body] = p;
  }
  return out;
}

export function savePairTable(body: string, t: PairTable): void {
  fs.mkdirSync(pairsDir(), { recursive: true });
  const file = path.join(pairsDir(), `${body}.json`), tmp = `${file}.part`;
  fs.writeFileSync(tmp, JSON.stringify(t));
  fs.renameSync(tmp, file);
}

/** Every creator body's table merged, and which zombies carry clips for which survivor body. */
export function mergedPairs(): PairTable & { clips: Record<string, string[]> } {
  const out: PairTable & { clips: Record<string, string[]> } = { chains: {}, bites: {}, pull: {}, clips: {} };
  let files: string[] = [];
  try { files = fs.readdirSync(pairsDir()).filter((f) => f.endsWith(".json")); } catch { return out; }
  for (const f of files) {
    const body = f.slice(0, -5);
    if (!BODY.test(body) || HAND_MADE.includes(body)) continue;
    let t: PairTable;
    try { t = JSON.parse(fs.readFileSync(path.join(pairsDir(), f), "utf8")) as PairTable; } catch { continue; }
    for (const [z, by] of Object.entries(t.chains ?? {})) Object.assign((out.chains[z] ??= {}), by);
    for (const [z, by] of Object.entries(t.bites ?? {})) Object.assign((out.bites[z] ??= {}), by);
    Object.assign(out.pull, t.pull ?? {});
    let zs: string[] = [];
    try { zs = fs.readdirSync(pairClipDir(body)).filter((x) => x.endsWith(".glb")).map((x) => x.slice(0, -4)).filter((z) => ZOMBIE.test(z)); } catch { /* none */ }
    for (const z of zs) (out.clips[z] ??= []).push(body);
  }
  return out;
}

/** a zombie's halves against a survivor body, or null (the file name is "<body>~<zombie>.glb") */
export function pairClipFile(name: string): string | null {
  const m = /^([a-z0-9-]{2,32})~(zombie-[a-z0-9-]{1,24})\.glb$/.exec(name);
  if (!m || HAND_MADE.includes(m[1])) return null;
  const f = path.join(pairClipDir(m[1]), `${m[2]}.glb`);
  return fs.existsSync(f) ? f : null;
}

/** a body leaves the shelf: its table and clips go with it */
export function forgetPairs(body: string): void {
  if (!BODY.test(body) || HAND_MADE.includes(body)) return;
  fs.rmSync(path.join(pairsDir(), `${body}.json`), { force: true });
  fs.rmSync(pairClipDir(body), { recursive: true, force: true });
}
