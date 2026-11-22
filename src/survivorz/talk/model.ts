// SOLACE SURVIVORZ — THE TALK LAYER'S WIRE TO A MODEL.
//
// The survivors borrow the house's engines (src/npc/brain.ts `showAsk`): the same endpoints,
// routing, warm-up and allowance the casino regulars use — nothing duplicated. A harness hands in
// a model of its own instead (`endpointModel`, straight to one Ollama-shaped server), so the whole
// layer can be driven against a fake without a Solace server around it.
import type { ChatOpts, ChatTurn, Endpoint } from "../../npc/ollama";
import { chat } from "../../npc/ollama";

export interface TalkModel {
  /** Configured and an engine is loaded. Off = the show is silent. (The house's own switch for
   *  Sterling and the others doesn't reach the show; the show has its own, talkAllowed.) */
  up(): boolean;
  /** An engine is configured on this box at all (unset: dev, every harness — the show runs on code and never holds) */
  configured?(): boolean;
  /** One call. Null on any failure — busy, slow, down. Never throws. */
  ask(turns: ChatTurn[], opts: ChatOpts): Promise<string | null>;
}

/** The house's brain (production). */
export function brainModel(brain: { showUp(): boolean; engineOn(): boolean; showAsk(t: ChatTurn[], o: ChatOpts): Promise<string | null> }): TalkModel {
  return {
    up: () => brain.showUp(),
    configured: () => brain.engineOn(),
    ask: (turns, opts) => brain.showAsk(turns, opts),
  };
}

/** One endpoint, no house around it (the harness, an eval script). */
export function endpointModel(ep: Endpoint, up: () => boolean = () => true): TalkModel {
  return {
    up,
    async ask(turns, opts) {
      try { return await chat(ep, turns, opts); } catch { return null; }
    },
  };
}
