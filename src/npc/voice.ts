// THE HOUSE'S BRAINS — one voice for everything they say (Josh, Oct 2026:
// "lets just get rid of the static dialogue of before and run everything now
// with the AI model").
//
// Sterling, the goblins and Dr. Voss each still COMPOSE what they mean to say
// the old way — the scripted line is the BRIEF: it carries the right name,
// the right price, the right event. `voiced()` hands that brief to the model
// to say in fresh words, checks that every figure and name survived, and
// returns the new line — or the brief itself, untouched, whenever the model
// is off, down, busy, slow, or wrote something that fails a check. So the
// hand-written lines are no longer what anyone normally sees; they are the
// floor nothing can fall through.
//
// This module is only the seam. The bots are created before the brain, so
// they call `voiced()` here and the brain registers the implementation when
// it starts (brain.ts). Unregistered — every harness, a box with no model —
// `voiced()` returns the brief immediately.
//
// NEVER VOICED (callers keep using their raw paths): admin alerts (health,
// security, satellites, reports), the Solace Updates briefs, and the command
// data cards. Those are instruments, and an instrument must say exactly what
// it was built to say.

import type { NpcId } from "./characters";

export interface VoiceOpts {
  /** What is happening, in a few words: "a death on the Wheel, announced in
   *  #general". The model is told this alongside the brief. */
  situation: string;
  /** Who it is said TO. Set for a private message, so the model can be
   *  given that person's own facts (and nobody else's). */
  userId?: number;
  /** Private (a DM to userId) or public (a channel). Default public. */
  scope?: "public" | "private";
  /** The goblins' sales mask: the cells, garnishing and the collectors may
   *  not be named (THE TURN in CLAUDE.md). */
  masked?: boolean;
  /** Words that must survive the rewrite (names, a key phrase). */
  must?: string[];
}

export type Voicer = {
  rewrite(npc: NpcId, brief: string, opts: VoiceOpts): Promise<string>;
  available(): boolean;
};

let impl: Voicer | null = null;

export function setVoicer(v: Voicer | null): void {
  impl = v;
}

/** Is a model up and enabled right now? (Commands use this to decide
 *  whether a bare /sterling greets from the script or hands over to the
 *  conversation.) */
export function voiceAvailable(): boolean {
  return impl?.available() ?? false;
}

/** Say `brief` in the character's own words — or return it unchanged. */
export async function voiced(npc: NpcId, brief: string, opts: VoiceOpts): Promise<string> {
  if (!impl || !impl.available()) return brief;
  try {
    return await impl.rewrite(npc, brief, opts);
  } catch {
    return brief;
  }
}
