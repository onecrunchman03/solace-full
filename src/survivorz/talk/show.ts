// SOLACE SURVIVORZ — the sim with minds in it, as the broadcast sees one world.
//
//   const minds = new SurvivorMinds({ model, allowed, kv })
//   const world = talkWorld(new SimWorld({ seed, start, hooks: minds.hooks }), minds)
//
// The broadcast (src/survivorz/broadcast.ts) knows a world by four methods; this one ticks the sim,
// then lets the minds say what's waiting (one speaker per room), and hands every frame — the sim's
// and the minds' `say` lines and `think`s — to the same listeners, so a watcher's socket carries both in order.
import type { ShowWorld, JumpObjective } from "../broadcast";
import { SimWorld, type SimOptions } from "../sim/world";
import type { ServerFrame, Say } from "../sim/wire";
import { SurvivorMinds, canSpeak, type MindsOptions } from "./minds";
import { VOICE, dropVoicesOf, holdForVoice } from "../voices";
import { TALK } from "./minds";
import { encodeGraph, decodeGraph } from "../sim/save";
import { Recapper } from "../recap";
import { playerOf, walkDo, walkFrame, walkHit, walkInput, walkStop } from "../sim/player";

export interface TalkWorld extends ShowWorld {
  sim: SimWorld;
  minds: SurvivorMinds;
}

/** the breath after one voice ends before the next line in that room may start (ms) */
export const VOICE_GAP_MS = 700;

export function talkWorld(sim: SimWorld, minds: SurvivorMinds): TalkWorld {
  /** per room: busy until (wall ms), while a line waits for its voice or is being spoken */
  const floor = new Map<string, number>();
  // the minds watch the sim's own frames for the moments that aren't hooks (a death, a bite)
  sim.onFrame((f: ServerFrame) => minds.onSimFrame(sim, f));
  // a death, a turn or the collapse before one: their lines still waiting for a voice go nowhere
  const speaks = (by: string): boolean => canSpeak(sim.survivors.find((s) => s.id === by));
  sim.onFrame((f: ServerFrame) => {
    if (f.type !== "ev" || typeof f.victim !== "string" || !f.victim.startsWith("s:")) return;
    if (f.event === "survivor.dead" || f.event === "survivor.turned" || (f.event === "survivor.dying" && f.turning)) dropVoicesOf(f.victim);
  });
  // THE RECAP (recap.ts): every few minutes, two sentences on where things stand, to every watcher
  const recap = new Recapper();
  const listeners: ((f: ServerFrame) => void)[] = [];
  sim.onFrame((f: ServerFrame) => recap.feed(sim, f));
  minds.onFrame((f) => recap.feed(sim, f));
  return {
    sim, minds,
    snapshot: () => sim.snapshot(),
    simTime: () => sim.t,
    // SAVE AND RESUME: the sim's whole state (sim/save.ts) — the minds keep their own memory in app_kv
    // under the run id, written here too so a deploy loses none of it
    save: () => encodeGraph(sim.saveState()),
    flush: () => minds.saveNow(),
    tick(dt: number) {
      sim.tick(dt); minds.pump(sim);
      // (the admin walking a map is not a show: nothing to recap)
      if (!playerOf(sim)) recap.tick(sim, minds.recapModel(), (f) => { for (const cb of listeners) cb(f); });
    },
    // A TEST RUN'S JUMP (broadcast.ts): the sim alone — the minds' choices fall to code meanwhile, no model is asked
    fastTick(dt: number) { sim.tick(dt); },
    done(o: JumpObjective) {
      const g = sim.obj;
      return o === "part" ? !!g.partFoundAt : o === "code" ? !!g.codeAt : o === "sealed" ? !!g.sealedAt
        : o === "fixed" ? !!g.fixedAt : o === "called" ? !!g.calledAt : !!g.clearAt;
    },
    over: () => !!sim.overAt,
    setup: () => sim.setup(),
    spawn: (n: number, room?: string) => sim.spawnZombies(n, room),
    // the minds are meant to be talking, and the engine isn't answering (a real show holds behind the card)
    aiDown: () => { const st = minds.status(); return st.allowed && st.configured && !st.modelUp; },
    // a line is held for its voice while the voice agent is about (voices.ts), then sent with its clip
    // THE DEAD SAY NOTHING (Nov 2026): a line whose speaker has died, turned or collapsed turning by the time it
    // would go out — straight away, or after waiting for its voice — never reaches a watcher
    onFrame(cb) {
      listeners.push(cb); sim.onFrame(cb);
      const out = (g: Say) => { if (speaks(g.by)) cb(g); };
      // ONE VOICE AT A TIME IN A ROOM (Nov 2026 — Josh: "lines overlap or cut each other off"): a line held
      // for its voice keeps its room busy until it goes out, then for as long as the clip runs and a breath,
      // so the next line there is not even said until this one is finished. Each line's voice took its own
      // time to render (1-12 s), which is what let two lines from one room land and play on top of each other.
      minds.setFloorGate((room) => Date.now() < (floor.get(room) ?? 0));
      minds.onFrame((f) => {
        if (f.type !== "say") { cb(f); return; }
        if (!speaks(f.by)) return;
        const room = minds.roomOf(sim, f.by);
        // busy while it waits for its voice (with a ceiling, in case the line is dropped on the way)
        floor.set(room, Date.now() + VOICE.takeWaitMs + VOICE.renderWaitMs + 1_000);
        const release = (g: Say) => {
          const ms = g.ms ?? Math.min(TALK.HOLD_MAX_MS, Math.max(TALK.HOLD_MIN_MS, g.text.length * TALK.HOLD_PER_CHAR_MS));
          floor.set(room, Date.now() + ms + VOICE_GAP_MS);
          out(g);
        };
        if (holdForVoice(f, release)) return;
        floor.delete(room);   // no voice about: the minds' own hold paces the room, as before
        cb(f);
      });
    },
    // the cast cards' thoughts as they stand, for a watcher who joins mid-show
    catchUp: () => [...minds.thoughtFrames(sim), ...minds.goalFrames(sim)],
    act(op, a) {
      const id = typeof a.id === "string" ? a.id : "";
      if (op === "heal") return { ok: sim.heal(id) };
      if (op === "give") return { ok: sim.give(id, String(a.item) as never, Number(a.n) || 1) };
      if (op === "move") return { ok: sim.moveTo(id, String(a.room ?? "")) };
      if (op === "clear") { const n = sim.killZombies(typeof a.room === "string" && a.room ? a.room : undefined); return { ok: n > 0, n }; }
      if (op === "length") return { ok: sim.setShowLength(Number(a.minutes)) };
      if (op === "trickle") return { ok: sim.setTrickle(Number(a.rate)) };
      if (op === "nudge") return { ok: minds.nudge(sim, id.replace(/^s:/, ""), a.kind === "goal" ? "goal" : "thought", String(a.text ?? "")) };
      return { ok: false };
    },
    summary: () => {
      const g = sim.obj;
      const done = [
        g.sealedAt ? "sealed" : "", g.clearAt ? "clear" : "", g.partFoundAt ? "part" : "", g.codeAt ? "code" : "",
        g.fixedAt ? "fixed" : "", g.calledAt ? "called" : "",
      ].filter(Boolean);
      const rescued = new Set(g.rescued);
      return {
        ranMs: Math.max(0, (g.endedAt || sim.t) - sim.startedAt),
        ending: g.ending || null,
        survivors: sim.survivors.map((s) => ({
          who: s.who,
          fate: rescued.has(s.who) ? "rescued" as const : s.turned ? "turned" as const : s.alive ? "alive" as const : "dead" as const,
          ...(s.cause && !s.alive ? { cause: s.cause } : {}),
        })),
        done,
      };
    },
    dials: () => ({ showMin: Math.round(sim.showMs / 60_000), trickle: sim.trickle, startZombies: sim.startZombies }),
    // WALK THE MAP (sim/player.ts): the body the admin drives, and the four inputs that drive it
    walker: () => playerOf(sim)?.id ?? null,
    walkInput: (mx, mz, run, crouch) => walkInput(sim, mx, mz, run, crouch),
    walkDo: (id) => walkDo(sim, id),
    walkHit: () => walkHit(sim),
    walkStop: () => walkStop(sim),
    walkFrame: (peek) => walkFrame(sim, peek),
    walkerGone: () => { const s = playerOf(sim); return !s || !s.alive || !!s.escaped || !!s.turned; },
    lever(op, id, hours) {
      if (op === "kill") return sim.kill(id);
      if (op === "down") return sim.down(id);
      if (op === "revive") return sim.revive(id);
      if (op === "infect") return sim.infect(id, hours ?? 0);
      if (op === "newcomer") return sim.newcomer(id as never);
      return false;
    },
  };
}

/** A sim with its minds, from the broadcast's factory options. `restore` (a save, from `save()`) makes it
 *  that world instead of a new one — the same survivors, zombies and progress, the same run. */
export function makeTalkWorld(opts: SimOptions & { restore?: string }, minds: MindsOptions): TalkWorld {
  const m = new SurvivorMinds(minds);
  const { restore, ...simOpts } = opts;
  const sim = new SimWorld({ ...simOpts, hooks: m.hooks });
  if (restore) sim.loadState(decodeGraph(restore) as Record<string, unknown>);
  return talkWorld(sim, m);
}
