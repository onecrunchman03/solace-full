// SOLACE SURVIVORZ — the show's levers (Admin Panel → Survivorz → Show). Every one is the admin's
// and audited; a watcher's socket carries none of them (src/survivorz/broadcast.ts).
import { ALL_IDS, BENCH, CHARACTERS, WALK_IN } from "../survivorz/cast";
import { DEFAULT_MAP, SHOW_MAPS, mapById } from "../survivorz/maps";
import { json, type Router } from "../http";
import { JUMP_OBJECTIVES, type Broadcast, type JumpObjective } from "../survivorz/broadcast";
import { voiceClip } from "../survivorz/voices";
import { isStreamPrincipal } from "../survivorz/streamtoken";
import { mapDef, type MapDef } from "../survivorz/sim/mapdef";

/** A LEVER'S BODY IS READ AS WHAT IT IS (the code review's C-8): a string is a string and a number is a number (or
 *  a string of digits, as a form sends one). An array, a boolean or an object is neither: `op: ["walk"]` used to
 *  start a walk, `zombies: true` was one of the dead, and `{toString: 1}` was a 500 and a row in the errors table. */
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const words = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const num = (v: unknown): number => (typeof v === "number" ? v : typeof v === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(v) ? Number(v) : NaN);

/** THE RUN SETUP's choices (stage 3), for the map a run is to be made on (sim/mapdef.ts): the rooms a survivor may
 *  wake in, and the spots the radio's part and the code's note may hide in — each with the room it's in, as the
 *  panel names them. Worked out once a map. */
interface Choice { id: string; name: string; n?: number }
interface SetupChoices { starts: Choice[]; part: Choice[]; note: Choice[] }
const CHOICES = new Map<string, SetupChoices>();
function choicesOf(def: MapDef): SetupChoices {
  const hit = CHOICES.get(def.id);
  if (hit) return hit;
  const roomName = new Map(def.site.rooms.map((r) => [r.id, r.name]));
  const spotChoices = (kind: string): Choice[] => {
    const seen = new Map<string, number>();
    return def.spotsOf(kind).map((sp) => {
      const n = (seen.get(sp.room) ?? 0) + 1; seen.set(sp.room, n);
      return { id: sp.id, name: roomName.get(sp.room) ?? sp.room, n };
    }).map((c, _i, all) => ({ id: c.id, name: all.filter((x) => x.name === c.name).length > 1 ? `${c.name} (${c.n})` : c.name }));
  };
  const out: SetupChoices = { // (a map may start several survivors in one place: Glenridge's gate takes three. Each place is offered once.)
    starts: [...new Set(def.startRooms)].map((id) => ({ id, name: roomName.get(id) ?? id, n: def.startRooms.filter((x) => x === id).length })), part: spotChoices("part"), note: spotChoices("note") };
  CHOICES.set(def.id, out);
  return out;
}

/** THE LINEUP (stage 3, Josh: "the bench fills empty seats"): who starts, the bench in order, and the largest
 *  starting group. A run starts with the starters, and while there are fewer of them than seats the bench fills
 *  the rest in order. Kept in app_kv; nothing in it changes by itself between runs. */
interface Lineup { starters: string[]; bench: string[]; maxGroup: number }
const KV_LINEUP = "survivorz_lineup";
const KV_PRESETS = "survivorz_lineup_presets";
const MAX_PRESETS = 20;
/** the map the seats are counted on: the run's own (the last one started — the broadcast keeps it), when it is
 *  one a run can start on; the default map otherwise. Set when the routes are registered. */
let chosenMap: () => string | null = () => null;
const maxSeats = (): number => {
  const m = mapById(chosenMap());
  const use = m && !m.building ? m : mapById(DEFAULT_MAP);
  return use?.maxCast ?? mapDef(use?.id).startRooms.length;
};
/** a lineup as asked: known ids, nobody twice (starters win), a group of 1 to the map's seats. Null = refused. */
function cleanLineup(v: unknown): Lineup | null {
  const b = (v ?? {}) as { starters?: unknown; bench?: unknown; maxGroup?: unknown };
  // (a list of WORDS: a list inside the list was read as its own first word, and an object in it was a 500)
  if (!words(b.starters) || !words(b.bench)) return null;
  const starters = [...new Set(b.starters)];
  const bench = [...new Set(b.bench)].filter((id) => !starters.includes(id));
  if ([...starters, ...bench].some((id) => !ALL_IDS.includes(id))) return null;
  const maxGroup = Math.round(num(b.maxGroup));
  if (!(maxGroup >= 1 && maxGroup <= maxSeats())) return null;
  if (starters.length > maxGroup) return null;
  return { starters, bench, maxGroup };
}
/** a kept lineup with anybody no longer in the show taken out, and its group held to the map's seats */
function known(v: unknown): unknown {
  const b = v as { starters?: unknown; bench?: unknown; maxGroup?: unknown } | null;
  if (!b || !Array.isArray(b.starters) || !Array.isArray(b.bench)) return v;
  const keep = (a: unknown[]) => a.map(String).filter((id) => ALL_IDS.includes(id));
  const maxGroup = Math.max(1, Math.min(maxSeats(), Math.round(num(b.maxGroup)) || 1));
  const starters = keep(b.starters);
  return { ...b, starters: starters.slice(0, maxGroup), bench: [...starters.slice(maxGroup), ...keep(b.bench)], maxGroup };
}
/** the default lineup: everyone in the cast starts, the bench waits in the cast files' order */
const defaultLineup = (): Lineup => ({ starters: WALK_IN.slice(0, maxSeats()), bench: ALL_IDS.filter((id) => !WALK_IN.includes(id)), maxGroup: Math.min(maxSeats(), Math.max(1, WALK_IN.length)) });
/** who a lineup puts in the next run: the starters, then the bench in order, up to the group */
const lineupCast = (l: Lineup): string[] => [...l.starters, ...l.bench].slice(0, l.maxGroup);

const OPS = ["start", "test", "walk", "stop", "pause", "resume", "reset", "onair", "offair", "speed", "jump", "go", "wait", "save"] as const;
type Op = (typeof OPS)[number];
/** THE COUNTDOWN a real show may be started with (minutes, the Start card's choice; Josh, Nov 3 2026: "let me set
 *  the wait time for the stream to start"). Absent = the server's default (SURVIVORZ_COUNTDOWN_MS, 5 min). */
export const COUNTDOWN_CHOICES = [0, 1, 2, 5, 10, 15] as const;

/** the stream rig's "go live" switch (src/survivorz/stream.ts), when this box has a rig */
export interface StreamSwitch { configured(): boolean; setWant(on: boolean): void }

/** A cast as asked: unique known ids (cast or bench), between 1 and the map's start rooms. Null = refused. */
function cleanCast(v: unknown, max: number): string[] | null {
  if (!words(v)) return null;
  const ids = [...new Set(v)];
  if (ids.length < 1 || ids.length > max || ids.some((id) => !ALL_IDS.includes(id))) return null;
  // in spawn order (the cast files' order), whatever order they were ticked in
  return ALL_IDS.filter((id) => ids.includes(id));
}

export function registerSurvivorzShowRoutes(router: Router, show: Broadcast, stream?: StreamSwitch): void {
  chosenMap = () => show.status().map;
  /** WHAT A RUN CAN BE STARTED ON (Admin Panel → Survivorz → Show): the maps, everyone who can be in it
   *  (the cast and the bench — never a draft), and the defaults (the last run's picks, or the cast). */
  router.get("/api/admin/survivorz/setup", "admin", ({ res }) => {
    const st = show.status();
    const map = mapById(st.map) ? st.map! : DEFAULT_MAP;
    const cast = st.cast.length ? st.cast.filter((id) => ALL_IDS.includes(id)) : WALK_IN;
    const ch = choicesOf(mapDef(map));
    json(res, 200, {
      maps: SHOW_MAPS,
      characters: CHARACTERS.map((c) => ({ id: c.id, name: c.name, tag: c.tag, status: c.status })),
      defaults: { map, cast: cast.length ? cast : WALK_IN },
      stream: stream?.configured() ?? false,
      choices: { starts: ch.starts, part: ch.part, note: ch.note, countdown: COUNTDOWN_CHOICES },
      // (each map's own: the start card offers the PICKED map's rooms and hiding places, not the last run's)
      choicesByMap: Object.fromEntries(SHOW_MAPS.filter((m) => !m.building).map((m) => { const c = choicesOf(mapDef(m.id)); return [m.id, { starts: c.starts, part: c.part, note: c.note }]; })),
      countdownDefault: Math.round(st.countdownDefaultMs / 60_000),
    });
  });

  /** The Survivorz page (the rail) asks this: on air or not, and what's on — the map's name and the run's
   *  number, both on screen for anyone watching anyway. Never the cast's secrets, never the seed. */
  router.get("/api/survivorz/onair", "user", ({ res, user }) => {
    const s = show.status();
    const live = s.onAir && s.running;
    // THE ADMIN'S OWN VIEW (Josh, Nov 3 2026: "I would like to watch the test runs"): a run that isn't on air
    // — a test run, or a real one not put on air yet — is offered to the admin alone (`adminView`). A member
    // is never told it exists; a test run is never on air for anyone (broadcast.ts sees/mayWatch agree).
    const adminView = !live && s.running && user.isAdmin === true;
    const shown = live || adminView;
    json(res, 200, {
      // (`walk`: the admin's own walk of a map — WALK THE MAP, sim/player.ts — is running; a member is never told)
      onAir: live, adminView, test: adminView && s.test, walk: adminView && s.walk,
      watching: shown ? s.watchers : 0, map: shown ? mapById(s.map)?.name ?? null : null, runNo: shown ? s.runNo : null,
    });
  });

  /** THE BODY LEVERS: kill / down / revive a body, or infect a survivor `hours` into the clock (a turn on
   *  demand, the way the casino's rig-death puts a death on camera). Audited. */
  router.post("/api/admin/survivorz/body", "admin", ({ res, body, store, user }) => {
    const b = (body ?? {}) as { op?: unknown; id?: unknown; hours?: unknown };
    const op = str(b.op), id = str(b.id);
    if (!["kill", "down", "revive", "infect"].includes(op) || !/^[sz]:[a-z0-9]+$/.test(id)) return json(res, 400, { error: "bad_lever" });
    // (hours that are there and are not a number are refused: `[3]` used to infect at nought)
    if (b.hours !== undefined && b.hours !== null && b.hours !== "" && !Number.isFinite(num(b.hours))) return json(res, 400, { error: "bad_lever" });
    const hours = Number.isFinite(num(b.hours)) ? Math.max(0, Math.min(24, num(b.hours))) : 0;
    const w = show.world();
    if (!w?.lever) return json(res, 409, { error: "not_running" });
    const ok = w.lever(op, id, hours);
    if (!ok) return json(res, 409, { error: "refused" });
    store.audit(user.id, `survivorz.body.${op}`, op === "infect" ? `${id} at ${hours} h` : id);
    json(res, 200, { ok: true });
  });

  /** THE SPAWN LEVER (BUNKER.md 41): `n` (1-10) of the dead, in `room` or anywhere away from the living. Audited. */
  router.post("/api/admin/survivorz/spawn", "admin", ({ res, body, store, user }) => {
    // (a body that says how many: `null`, a list, a bare number or nothing at all used to spawn one)
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(res, 400, { error: "bad_spawn" });
    const b = body as { n?: unknown; room?: unknown };
    const n = Math.round(num(b.n));
    const room = b.room === undefined || b.room === null || b.room === "" ? undefined : str(b.room);
    if (!(n >= 1 && n <= 10) || (room !== undefined && !/^[a-z0-9-]{1,40}$/.test(room))) return json(res, 400, { error: "bad_spawn" });
    const w = show.world();
    if (!w?.spawn) return json(res, 409, { error: "not_running" });
    const made = w.spawn(n, room);
    if (!made) return json(res, 409, { error: "refused" });
    store.audit(user.id, "survivorz.spawn", `${made} in ${room ?? "anywhere"}`);
    json(res, 200, { ok: true, made });
  });

  /** THE CONTROL ROOM's TEST-RUN LEVERS (Josh, Nov 3 2026 — a real show is the AI's alone, so a test run only):
   *  heal {id} · give {id, item, n} · move {id, room} · clear {room?} · length {minutes} · trickle {rate} ·
   *  nudge {id, kind: goal|thought, text}. Audited. */
  const ITEMS = ["food", "water", "bandage", "medkit", "ammo", "ammoR", "battery", "knife", "pipe", "hammer", "crowbar", "axe", "pistol", "rifle", "backpack-small", "backpack-large"];
  router.post("/api/admin/survivorz/act", "admin", ({ res, body, store, user }) => {
    const b = (body ?? {}) as Record<string, unknown>;
    const op = str(b.op);
    if (!["heal", "give", "move", "clear", "length", "trickle", "nudge"].includes(op)) return json(res, 400, { error: "bad_lever" });
    const id = str(b.id);
    if (["heal", "give", "move", "nudge"].includes(op) && !/^s:[a-z0-9]+$/.test(id)) return json(res, 400, { error: "bad_lever" });
    if (op === "give" && !ITEMS.includes(str(b.item))) return json(res, 400, { error: "bad_item" });
    if ((op === "move" || (op === "clear" && b.room !== undefined && b.room !== null && b.room !== "")) && !/^[a-z0-9-]{1,40}$/.test(str(b.room))) return json(res, 400, { error: "bad_room" });
    if (op === "nudge" && (typeof b.text !== "string" || b.text.trim().length < 3 || b.text.length > 300)) return json(res, 400, { error: "bad_text" });
    const st = show.status();
    if (!st.running) return json(res, 409, { error: "not_running" });
    if (!st.test) return json(res, 409, { error: "not_test" });
    const w = show.world();
    if (!w?.act) return json(res, 409, { error: "not_running" });
    const r = w.act(op, { id, item: str(b.item), n: num(b.n), room: str(b.room), minutes: num(b.minutes), rate: num(b.rate), kind: str(b.kind), text: str(b.text) });
    if (!r.ok) return json(res, 409, { error: "refused" });
    const what = op === "give" ? `${str(b.item)} to ${id}` : op === "move" ? `${id} to ${str(b.room)}` : op === "clear" ? `${r.n} in ${str(b.room) || "the bunker"}`
      : op === "length" ? `${num(b.minutes)} min` : op === "trickle" ? `${num(b.rate)}x` : op === "nudge" ? `${id} ${str(b.kind)}: ${str(b.text).slice(0, 80)}` : id;
    store.audit(user.id, `survivorz.act.${op}`, what);
    json(res, 200, { ok: true, ...(r.n !== undefined ? { n: r.n } : {}), status: show.status() });
  });

  /** THE HOLD SWITCH: when the AI drops, a real show carries on with code (on) or holds (off). Audited. */
  router.post("/api/admin/survivorz/nohold", "admin", ({ res, body, store, user }) => {
    const on = (body as { on?: unknown } | undefined)?.on;
    if (typeof on !== "boolean") return json(res, 400, { error: "bad_lever" });
    store.audit(user.id, on ? "survivorz.nohold.on" : "survivorz.nohold.off");
    json(res, 200, show.setNoHold(on));
  });

  /** A survivor's voiced line (voices.ts), for whoever may watch the show right now (never public: the
   *  same gate as the show's assets). */
  router.get("/api/survivorz/voice/:id", "watch", ({ res, params, user }) => {
    if (!isStreamPrincipal(user) && !show.mayWatch(user)) return json(res, 403, { error: "off_air" });
    const wav = voiceClip(Number(params.id));
    if (!wav) return json(res, 404, { error: "not_found" });
    res.writeHead(200, { "content-type": "audio/wav", "content-length": wav.length, "cache-control": "private, max-age=600" });
    res.end(wav);
  });

  /** THE BENCH (SURVIVORZ.md §6 — Josh alone decides when): a newcomer, found hiding in a sealed room in a
   *  wing the group has reached. Refused with six alive, or once they're already in. Audited. */
  router.post("/api/admin/survivorz/newcomer", "admin", ({ res, body, store, user }) => {
    const asked = (body as { who?: unknown } | undefined)?.who;
    const who = asked === undefined || asked === null || asked === "" ? BENCH[0] ?? "" : str(asked);
    if (!BENCH.includes(who)) return json(res, 400, { error: "not_on_the_bench" });
    const w = show.world();
    if (!w?.lever) return json(res, 409, { error: "not_running" });
    if (!w.lever("newcomer", who)) return json(res, 409, { error: "refused" });
    store.audit(user.id, "survivorz.newcomer", who);
    json(res, 200, { ok: true });
  });

  /** THE LINEUP (stage 3): who starts, the bench in order, the largest group — and the cast it puts in the next
   *  run. GET answers the saved lineup (or the default); PUT saves one. Audited. */
  const readLineup = (store: { kvGet(k: string): string | null }): Lineup => {
    // (read gently: a character turned Off since the lineup was saved leaves it — refused whole, as a save is, one
    // Off click threw the whole saved lineup away for the default)
    try { const l = cleanLineup(known(JSON.parse(store.kvGet(KV_LINEUP) ?? "null"))); if (l) return l; } catch { /* the default */ }
    return defaultLineup();
  };
  const readPresets = (store: { kvGet(k: string): string | null }): ({ name: string } & Lineup)[] => {
    try {
      const v = JSON.parse(store.kvGet(KV_PRESETS) ?? "[]");
      return Array.isArray(v) ? v.flatMap((p) => { const l = cleanLineup(known(p)); return l && typeof p.name === "string" ? [{ name: p.name, ...l }] : []; }) : [];
    } catch { return []; }
  };
  router.get("/api/admin/survivorz/lineup", "admin", ({ res, store }) => {
    const l = readLineup(store);
    json(res, 200, { lineup: l, cast: lineupCast(l), maxSeats: maxSeats(), presets: readPresets(store) });
  });
  router.post("/api/admin/survivorz/lineup", "admin", ({ res, body, store, user }) => {
    const l = cleanLineup(body);
    if (!l) return json(res, 400, { error: "bad_lineup" });
    store.kvSet(KV_LINEUP, JSON.stringify(l));
    store.audit(user.id, "survivorz.lineup", `${l.starters.join(",")} · bench ${l.bench.join(",") || "none"} · up to ${l.maxGroup}`);
    json(res, 200, { lineup: l, cast: lineupCast(l), maxSeats: maxSeats(), presets: readPresets(store) });
  });
  /** A PRESET: save the lineup under a name (the same name replaces it), use one, or delete one. Audited. */
  router.post("/api/admin/survivorz/lineup/preset", "admin", ({ res, body, store, user }) => {
    const b = (body ?? {}) as { op?: unknown; name?: unknown; lineup?: unknown };
    const name = str(b.name).replace(/\s+/g, " ").trim();
    if (!name || name.length > 40) return json(res, 400, { error: "bad_name" });
    let presets = readPresets(store);
    const op = str(b.op);
    if (op === "save") {
      const l = cleanLineup(b.lineup);
      if (!l) return json(res, 400, { error: "bad_lineup" });
      const rest = presets.filter((p) => p.name.toLowerCase() !== name.toLowerCase());
      if (rest.length >= MAX_PRESETS) return json(res, 409, { error: "too_many" });
      presets = [...rest, { name, ...l }];
    } else if (op === "delete") {
      if (!presets.some((p) => p.name === name)) return json(res, 404, { error: "not_found" });
      presets = presets.filter((p) => p.name !== name);
    } else if (op === "use") {
      const p = presets.find((x) => x.name === name);
      if (!p) return json(res, 404, { error: "not_found" });
      store.kvSet(KV_LINEUP, JSON.stringify({ starters: p.starters, bench: p.bench, maxGroup: p.maxGroup }));
    } else return json(res, 400, { error: "bad_op" });
    if (op !== "use") store.kvSet(KV_PRESETS, JSON.stringify(presets));
    store.audit(user.id, `survivorz.preset.${op}`, name);
    const l = readLineup(store);
    json(res, 200, { lineup: l, cast: lineupCast(l), maxSeats: maxSeats(), presets: readPresets(store) });
  });

  /** THE RUN HISTORY (stage 3): every run that ended, was stopped or was restarted, newest first */
  router.get("/api/admin/survivorz/history", "admin", ({ res }) => {
    json(res, 200, { runs: show.history() });
  });

  router.get("/api/admin/survivorz/show", "admin", ({ res }) => {
    json(res, 200, show.status());
  });

  router.post("/api/admin/survivorz/show", "admin", ({ res, body, store, user }) => {
    const op = str((body as { op?: unknown } | undefined)?.op) as Op;
    if (!OPS.includes(op)) return json(res, 400, { error: "bad_op" });
    const b = (body ?? {}) as { seed?: unknown; same?: unknown; speed?: unknown; minutes?: unknown; objective?: unknown; map?: unknown; cast?: unknown; stream?: unknown; zombies?: unknown; starts?: unknown; partSpot?: unknown; noteSpot?: unknown; countdown?: unknown; who?: unknown };
    // (a seed that is there and is not a whole number is refused: `"5"` used to be a random seed, without a word)
    const sd = num(b.seed);
    if (b.seed !== undefined && b.seed !== null && b.seed !== "" && !(Number.isInteger(sd) && sd >= 0 && sd <= 0xffffffff)) return json(res, 400, { error: "bad_seed" });
    const seed = Number.isInteger(sd) && sd >= 0 ? sd >>> 0 : undefined;
    const minutes = num(b.minutes);
    const objective = str(b.objective) as JumpObjective;
    if (op === "jump" && !JUMP_OBJECTIVES.includes(objective) && !(Number.isFinite(minutes) && minutes >= 1 && minutes <= 120)) return json(res, 400, { error: "bad_jump" });
    // (the named objectives are the bunker's: on another map a jump is by minutes)
    if (op === "jump" && JUMP_OBJECTIVES.includes(objective) && (show.status().map ?? DEFAULT_MAP) !== "bunker") return json(res, 400, { error: "bad_jump" });
    if (op === "speed" && !(num(b.speed) >= 1 && num(b.speed) <= 8)) return json(res, 400, { error: "bad_speed" });
    if (op === "wait" && !(Number.isFinite(minutes) && minutes >= 1 && minutes <= 15)) return json(res, 400, { error: "bad_wait" });
    // THE RUN'S PICKS (start / test): a map that's built, and a cast that fits it
    let pick: { map: string; cast?: string[]; zombies?: number; starts?: Record<string, string>; partSpot?: string; noteSpot?: string; countdownMs?: number } | undefined;
    // THE COUNTDOWN (a real show's start only): one of COUNTDOWN_CHOICES minutes; absent = the default
    let countdownMin: number | undefined;
    if (op === "start" && b.countdown !== undefined && b.countdown !== null && b.countdown !== "") {
      const m = num(b.countdown);
      if (!(COUNTDOWN_CHOICES as readonly number[]).includes(m)) return json(res, 400, { error: "bad_countdown" });
      countdownMin = m;
    }
    if (op === "start" || op === "test") {
      const m = mapById(b.map === undefined ? DEFAULT_MAP : str(b.map));
      if (!m || m.building) return json(res, 400, { error: "bad_map" });
      let cast: string[] | undefined;
      if (b.cast !== undefined) {
        const c = cleanCast(b.cast, m.maxCast);
        if (!c) return json(res, 400, { error: "bad_cast" });
        cast = c;
      }
      // THE DEAD AT THE START: a test run's alone (a real show's are as the tables say)
      let zombies: number | undefined;
      if (op === "test" && b.zombies !== undefined && b.zombies !== null && b.zombies !== "") {
        const z = num(b.zombies);
        if (!Number.isInteger(z) || z < 0 || z > 60) return json(res, 400, { error: "bad_zombies" });
        zombies = z;
      }
      // THE RUN SETUP's picks (stage 3): a start room for any of the cast, the part's and the note's spots — each
      // one of the picked map's own, and no two survivors in one room. Absent = the roll decides.
      const def = mapDef(m.id), ch = choicesOf(def);
      let starts: Record<string, string> | undefined;
      if (b.starts !== undefined && b.starts !== null) {
        if (typeof b.starts !== "object" || Array.isArray(b.starts)) return json(res, 400, { error: "bad_starts" });
        const ent = Object.entries(b.starts as Record<string, unknown>).filter(([, room]) => room !== "" && room !== null && room !== undefined);
        const rooms = ent.map(([, room]) => str(room));
        if (ent.length > 20 || ent.some(([who, room]) => !ALL_IDS.includes(who) || !def.startRooms.includes(str(room))) || rooms.some((r) => rooms.filter((x) => x === r).length > def.startRooms.filter((x) => x === r).length)) return json(res, 400, { error: "bad_starts" });
        if (ent.length) starts = Object.fromEntries(ent.map(([who, room]) => [who, str(room)]));
      }
      const spot = (v: unknown, list: { id: string }[]): string | null | undefined =>
        v === undefined || v === null || v === "" ? undefined : list.some((c) => c.id === str(v)) ? str(v) : null;
      const partSpot = spot(b.partSpot, ch.part), noteSpot = spot(b.noteSpot, ch.note);
      if (partSpot === null || noteSpot === null) return json(res, 400, { error: "bad_spot" });
      pick = { map: m.id, cast, ...(zombies !== undefined ? { zombies } : {}), ...(starts ? { starts } : {}), ...(partSpot ? { partSpot } : {}), ...(noteSpot ? { noteSpot } : {}), ...(countdownMin !== undefined ? { countdownMs: countdownMin * 60_000 } : {}) };
    }
    // WALK THE MAP (sim/player.ts): a test run on any map a run can start on, with ONE survivor (`who`: any of
    // the cast or the bench; absent = the first of the cast) driven by the admin's own hand over the watch
    // socket. `zombies` as a test run's. Nothing here knows a map: a new one is walkable the day it is listed.
    let walk: { map: string; player: string; zombies?: number } | undefined;
    if (op === "walk") {
      const m = mapById(b.map === undefined ? DEFAULT_MAP : str(b.map));
      if (!m || m.building) return json(res, 400, { error: "bad_map" });
      const who = b.who === undefined || b.who === null || b.who === "" ? WALK_IN[0] ?? ALL_IDS[0] : typeof b.who === "string" ? b.who : "";
      if (!who || !ALL_IDS.includes(who)) return json(res, 400, { error: "bad_who" });
      let zombies: number | undefined;
      if (b.zombies !== undefined && b.zombies !== null && b.zombies !== "") {
        const z = num(b.zombies);
        if (!Number.isInteger(z) || z < 0 || z > 60) return json(res, 400, { error: "bad_zombies" });
        zombies = z;
      }
      walk = { map: m.id, player: who, ...(zombies !== undefined ? { zombies } : {}) };
    }
    // "start it all": a numbered show may ask the stream rig to go live with it (a test run is never streamed)
    const wantStream = op === "start" && b.stream === true;
    if (wantStream && !stream?.configured()) return json(res, 409, { error: "no_stream_rig" });
    try {
      const before = show.status(), wasTest = before.test === true, wasRunning = before.running === true;
      const s =
        op === "start" ? show.start(seed, pick) :
        op === "test" ? show.start(seed, { test: true, ...pick }) :
        op === "walk" ? show.start(seed, { test: true, ...walk }) :
        op === "stop" ? show.stop() :
        op === "pause" ? show.pause(true) :
        op === "resume" ? show.pause(false) :
        op === "reset" ? show.reset(seed, { same: b.same === true }) :
        op === "speed" ? show.setSpeed(num(b.speed)) :
        op === "go" ? show.go() :
        op === "wait" ? show.wait(Math.round(minutes) * 60_000) :
        op === "save" ? show.saveLever() :
        op === "jump" ? show.jump(JUMP_OBJECTIVES.includes(objective) ? { objective } : { minutes: Math.round(minutes) }) :
        show.setOnAir(op === "onair");
      const what = op === "speed" ? `${num(b.speed)}x` : op === "wait" ? `+${Math.round(minutes)} min` : op === "jump" ? (JUMP_OBJECTIVES.includes(objective) ? objective : `+${Math.round(minutes)} min`)
        : op === "reset" && b.same === true ? "same seed"
        : walk ? [seed !== undefined ? `seed ${seed}` : "", walk.map, walk.player, walk.zombies !== undefined ? `${walk.zombies} dead` : ""].filter(Boolean).join(" · ")
        // a start says its seed first, then what the panel picked (only when it picked: an older caller's
        // seed-only press reads as it always did)
        : pick ? [seed !== undefined ? `seed ${seed}` : "", b.map !== undefined || b.cast !== undefined ? pick.map : "", pick.cast?.join(",") ?? "", pick.starts || pick.partSpot || pick.noteSpot ? "setup picked" : "", countdownMin !== undefined ? `countdown ${countdownMin} min` : "", wantStream ? "streamed" : ""].filter(Boolean).join(" · ") || undefined
        : seed !== undefined ? `seed ${seed}` : undefined;
      store.audit(user.id, `survivorz.${op}`, what);
      // the stream follows the show: on with a streamed start, off when the show stops
      if (wantStream) stream?.setWant(true);
      // (a test run or a walk was never streamed: stopping one leaves a stream switched on by hand alone)
      // (nor does a stop with nothing running: "End the walk" pressed twice switched a hand-set stream off, the
      // code review's C-4)
      if (op === "stop" && stream?.configured() && wasRunning && !wasTest) stream.setWant(false);
      json(res, 200, s);
    } catch (e) {
      const m = (e as Error).message;
      // a refusal the panel says in words: no world, a real show (no speed / jump), a test on air, a jump already running
      if (["not_test", "test_run", "busy", "already_running", "not_running", "no_countdown"].includes(m)) return json(res, 409, { error: m });
      json(res, 503, { error: m === "no_world" ? "no_world" : "failed" });
    }
  });
}
